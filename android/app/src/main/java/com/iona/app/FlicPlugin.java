package com.iona.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.PowerManager;
import android.os.UserManager;
import android.provider.Settings;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import io.flic.flic2libandroid.BatteryLevel;
import io.flic.flic2libandroid.Flic2Button;
import io.flic.flic2libandroid.Flic2ButtonListener;
import io.flic.flic2libandroid.Flic2Manager;
import io.flic.flic2libandroid.Flic2ScanCallback;

/**
 * Feature 005 — a thin bridge over flic2lib-android. Mirrors the existing {@code ZeroCallPlugin}
 * pattern (static instance so SDK callbacks can fire events to JS via {@code notifyListeners}).
 *
 * <p>The press router is load-bearing on the reactive path (Constitution I.4):
 * <ul>
 *   <li><b>T007 — act now or not at all:</b> a press is aged from its own timestamp and dropped
 *       if older than {@link #STALE_PRESS_MAX_MS} (queued out-of-range presses), natively, before
 *       it ever reaches JS. This is a timestamp comparison, not a timer.</li>
 *   <li><b>T008 / FR-026a — gesture routing:</b> in <i>hold</i> summon mode, hold summons and a
 *       double-tap runs the self-test; in <i>short-press</i> summon mode <b>every</b> gesture
 *       summons and the button self-test is disabled (a tremor the SDK reads as a double-click
 *       must still summon).</li>
 * </ul>
 * Duplicate absorption and the cancel window are inherited from the existing help sequence on the
 * JS side — never rebuilt here.
 */
@CapacitorPlugin(
    name = "Flic",
    permissions = {
        @Permission(alias = "location",  strings = { Manifest.permission.ACCESS_FINE_LOCATION }),
        @Permission(alias = "btScan",    strings = { Manifest.permission.BLUETOOTH_SCAN }),
        @Permission(alias = "btConnect", strings = { Manifest.permission.BLUETOOTH_CONNECT })
    }
)
public class FlicPlugin extends Plugin {

    private static final String TAG = "FlicPlugin";

    /**
     * T007 — a QUEUED press buffered longer than this before delivery is dropped (loudly). Raised
     * 15s → 120s (captain ruling 2026-07-04). The guard exists to stop ANCIENT presses (out of range
     * hours ago → a false alarm on reconnect), but a 60–90s-old press is someone who pressed for help
     * and nothing has happened yet — under bias-to-summon it must fire. This specifically covers the
     * reboot window: the FGS re-arms ~60–90s after boot (post-unlock), so a press made during boot is
     * delivered on reconnect and summons instead of vanishing. The false-alarm cost is contained —
     * every summon opens the visible + audible 10s cancel window (FSI), one tap to cancel. Presses
     * older than 120s still drop, and still drop LOUDLY (the summonDropped note is unchanged).
     */
    private static final long STALE_PRESS_MAX_MS = 120000;

    /** High-importance channel for the summon full-screen intent / loud floor (created in IonaApplication). */
    static final String SUMMON_CHANNEL_ID = "flic_summon";
    private static final int SUMMON_NOTIF_ID = 1003;

    /** Bug A — the escalation-alarm full-screen intent reuses the proven SUMMON machinery + the SUMMON
        high-importance channel, but is raised by the FCM escalation_started push instead of a physical
        press: the Flic press and the escalation push are the same event by two roads, converging on ONE
        native ring. Distinct notif id so a concurrent Flic summon can't clobber it. */
    private static final int ESCALATION_ALARM_NOTIF_ID = 1004;

    /** The ONE alarm-class push type. MUST equal pwa_sender.ALARM_CLASS_TYPES' single member — the
        backend flips ONLY this type to data-only+high, and {@link TwilioFirebaseMsgService} catches ONLY
        this type. Same string, both repos: the sender gate and the handler gate cannot drift. */
    static final String ESCALATION_ALARM_TYPE = "escalation_started";

    /** Static ref so {@link FlicListeningService} can drive reconnect-on-launch. */
    static FlicPlugin instance;

    /** App-context captured at load — used to raise the summon notification even after the Activity/WebView
        is destroyed (app swiped closed, process kept alive by the FGS). */
    private static Context appContext;

    /** Whether the app is currently on screen. When false, a summon raises the full-screen intent so the
        phone wakes into the help sequence instead of the press landing on a dead WebView. */
    private static volatile boolean appForeground = false;

    /** A summon arrived via full-screen-intent launch, awaiting the WebView. Consumed EXACTLY ONCE by JS
        (on load or resume) — a one-shot, not a retained event, so a WebView reload can't replay it. */
    private static volatile boolean pendingLaunchSummon = false;

    /** Bug A — an escalation_started push arrived while the app was NOT foreground and raised the
        full-screen intent, awaiting the WebView. Consumed EXACTLY ONCE by JS (load or resume), a
        one-shot like {@link #pendingLaunchSummon}, so a WebView reload / later cold open can't replay it. */
    private static volatile boolean pendingEscalationAlarm = false;

    /**
     * The chosen summon gesture — "short" (DEFAULT: a single immediate press, the telecare-familiar
     * muscle memory older users already have from pendants/pull-cords) or "hold" (opt-in, accident-
     * resistant). Persisted in device-protected SharedPreferences and reloaded at process start
     * ({@link #loadSummonGesture}) so the correct gesture is active from boot — before the app opens,
     * on the very first post-reboot press. FR-026a: when "short", EVERY gesture summons and the button
     * self-test is disabled (a tremor read as a double-click must still summon); when "hold", hold
     * summons and double-tap is the self-test (the in-app "Test service" control is the test path for
     * short-press users).
     */
    private static volatile String summonGesture = "short";

    /**
     * The single shared press router. STATIC so {@link FlicListeningService} can attach it on a
     * cold-boot re-arm when the Activity never launched ({@link #instance} is null): one listener
     * object, reused by the foreground (load) and headless (service) paths, so a re-attach is always
     * remove-then-add of the SAME object and can never double-fire a press.
     */
    private static Flic2ButtonListener buttonListener;

    @Override
    public void load() {
        instance = this;
        ensureAppContext(getContext());
        loadSummonGesture(getContext());   // reflect the persisted choice (T019) before any press routes
        appForeground = true;  // load() runs as the Activity comes up
        ensureListener();
        // Reconnect-on-launch (the SDK gotcha): re-attach + connect already-paired buttons.
        attachAndConnectAll();
        maybeStartService();
    }

    // Track whether the app is on screen — a summon while it isn't must launch via a full-screen intent.
    @Override protected void handleOnResume() { super.handleOnResume(); appForeground = true; }
    @Override protected void handleOnStop()   { super.handleOnStop();   appForeground = false; }

    /** Bug A — read by {@link TwilioFirebaseMsgService}: when the app is NOT on screen (killed cold →
        default false, or backgrounded → handleOnStop set false), an escalation_started push raises the
        native full-screen ring; when it IS on screen the live WebView stays the single owner (the
        existing JS pushNotificationReceived path), so exactly one surface fires. */
    static boolean isAppForeground() { return appForeground; }

    // ── Commands ──────────────────────────────────────────────────────────────

    @PluginMethod
    public void getPairingState(PluginCall call) {
        Flic2Manager m = safeManager();
        List<Flic2Button> buttons = m != null ? m.getButtons() : Collections.emptyList();
        JSObject r = new JSObject();
        r.put("paired", !buttons.isEmpty());
        r.put("count", buttons.size());
        if (!buttons.isEmpty()) r.put("connectionState", buttons.get(0).getConnectionState());
        r.put("summonGesture", summonGesture);
        call.resolve(r);
    }

    @PluginMethod
    public void getButtons(PluginCall call) {
        Flic2Manager m = safeManager();
        JSArray arr = new JSArray();
        if (m != null) {
            for (Flic2Button b : m.getButtons()) arr.put(buttonToJs(b));
        }
        call.resolve(new JSObject().put("buttons", arr));
    }

    @PluginMethod
    public void setSummonGesture(PluginCall call) {
        String g = call.getString("gesture", "short");
        summonGesture = "hold".equals(g) ? "hold" : "short";
        persistSummonGesture(getContext());   // survive a reboot — the gesture must be right from boot
        call.resolve(new JSObject().put("summonGesture", summonGesture));
    }

    @PluginMethod
    public void reconnect(PluginCall call) {
        attachAndConnectAll();
        maybeStartService();
        call.resolve();
    }

    @PluginMethod
    public void startScan(PluginCall call) {
        if (!scanPermsGranted()) {
            requestPermissionForAliases(neededScanAliases(), call, "onScanPermission");
            return;
        }
        doStartScan(call);
    }

    @PermissionCallback
    private void onScanPermission(PluginCall call) {
        if (!scanPermsGranted()) { call.reject("permission_denied"); return; }
        doStartScan(call);
    }

    // flic2lib uses BLUETOOTH_SCAN on Android 12+ (its manifest caps ACCESS_FINE_LOCATION at
    // maxSdk 30) and FINE_LOCATION on older versions — so the required perms are API-dependent.
    private boolean scanPermsGranted() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return getPermissionState("btScan")    == PermissionState.GRANTED
                && getPermissionState("btConnect") == PermissionState.GRANTED;
        }
        return getPermissionState("location") == PermissionState.GRANTED;
    }

    private String[] neededScanAliases() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return new String[] { "btScan", "btConnect" };
        }
        return new String[] { "location" };
    }

    private void doStartScan(PluginCall call) {
        Flic2Manager m = safeManager();
        if (m == null) { call.reject("manager_unavailable"); return; }
        m.startScan(new Flic2ScanCallback() {
            @Override public void onDiscoveredAlreadyPairedButton(Flic2Button button) {
                notifyListeners("buttonFound", new JSObject()
                    .put("state", "already_paired").put("uuid", button.getUuid()));
            }
            @Override public void onDiscovered(String bdAddr) {
                notifyListeners("buttonFound", new JSObject()
                    .put("state", "discovered").put("bdAddr", bdAddr));
            }
            @Override public void onConnected() {
                notifyListeners("buttonFound", new JSObject().put("state", "connecting"));
            }
            @Override public void onComplete(int result, int subCode, Flic2Button button) {
                if (result == Flic2ScanCallback.RESULT_SUCCESS && button != null) {
                    attachAndConnect(button);
                    maybeStartService();
                    notifyListeners("pairingComplete", new JSObject()
                        .put("success", true).put("button", buttonToJs(button)));
                } else {
                    notifyListeners("pairingComplete", new JSObject()
                        .put("success", false).put("result", result)
                        .put("error", Flic2Manager.errorCodeToString(result)));
                }
            }
        });
        call.resolve(new JSObject().put("scanning", true));
    }

    @PluginMethod
    public void stopScan(PluginCall call) {
        Flic2Manager m = safeManager();
        if (m != null) m.stopScan();
        call.resolve();
    }

    @PluginMethod
    public void removeButton(PluginCall call) {
        String uuid = call.getString("uuid");
        Flic2Manager m = safeManager();
        if (m == null) { call.reject("manager_unavailable"); return; }
        // Copy the list — forgetButton mutates the manager's live list.
        for (Flic2Button b : new ArrayList<>(m.getButtons())) {
            if (uuid == null || uuid.equals(b.getUuid())) {
                b.removeListener(buttonListener);
                m.forgetButton(b);
            }
        }
        // No buttons left → the always-armed service is no longer needed.
        if (m.getButtons().isEmpty()) {
            persistHasButton(getContext(), false);   // gate the boot arm + nudge off — no button, no service
            getContext().stopService(new Intent(getContext(), FlicListeningService.class));
        }
        call.resolve(new JSObject().put("removed", true));
    }

    @PluginMethod
    public void readBattery(PluginCall call) {
        Flic2Manager m = safeManager();
        if (m == null || m.getButtons().isEmpty()) {
            call.resolve(new JSObject().put("available", false));
            return;
        }
        BatteryLevel lvl = m.getButtons().get(0).getLastKnownBatteryLevel();
        JSObject r = new JSObject().put("available", lvl != null);
        if (lvl != null) {
            r.put("percentage", lvl.getEstimatedPercentage());
            r.put("voltage", lvl.getVoltage());
            r.put("timestamp", lvl.getTimestampUtcMs());
        }
        call.resolve(r);
    }

    @PluginMethod
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        boolean ignoring = pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        call.resolve(new JSObject().put("ignoring", ignoring));
    }

    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve(new JSObject().put("requested", true));
        } catch (Exception e) {
            call.resolve(new JSObject().put("requested", false).put("error", e.getMessage()));
        }
    }

    /** Android 14+ may revoke full-screen-intent for non-call/alarm apps (Play policy). True everywhere
        below 14 (unrestricted) — the pairing flow checks this and, if false, sends the person to the grant
        screen. Where FSI is unavailable, the summon still fires the loud floor notification (never silent). */
    @PluginMethod
    public void canUseFullScreenIntent(PluginCall call) {
        boolean can = true;
        if (Build.VERSION.SDK_INT >= 34) {
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            can = nm != null && nm.canUseFullScreenIntent();
        }
        call.resolve(new JSObject().put("canUse", can));
    }

    @PluginMethod
    public void requestFullScreenIntentPermission(PluginCall call) {
        try {
            Intent i = new Intent("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT",
                Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve(new JSObject().put("requested", true));
        } catch (Exception e) {
            call.resolve(new JSObject().put("requested", false).put("error", e.getMessage()));
        }
    }

    // ── Button listener — the press router (T007 stale guard + T008/FR-026a filter) ──

    private static void ensureListener() {
        if (buttonListener == null) buttonListener = makeListener();
    }

    private static void ensureAppContext(Context c) {
        if (appContext == null && c != null) appContext = c.getApplicationContext();
    }

    /** Deliver an event to the WebView when the Activity/plugin is live. A headless (boot-woken)
        process has no WebView, so JS events are simply skipped — the summon still reaches the person
        via the full-screen intent (never silent). */
    private static void deliverToJs(String event, JSObject data) {
        FlicPlugin i = instance;
        if (i != null) i.notifyListeners(event, data);
    }

    /**
     * Bring up the Flic2 manager if it isn't already — but ONLY once the user has unlocked at least
     * once. The SDK's SQLite DB lives in credential-encrypted storage, which does not exist in direct
     * boot (before first unlock); initialising it there throws SQLiteCantOpenDatabaseException and
     * crashes the process (the 2b reboot crash). Guarded by {@code isUserUnlocked} AND wrapped in a
     * catch, so a pre-unlock process start (the directBootAware BootReceiver posting the unlock nudge)
     * can never crash — the manager simply comes up later, at first unlock / when the FGS arms. Idempotent.
     */
    /**
     * SPIKE (T023 item 3, captain 2026-07-04) — pre-unlock arming via device-protected (DP) storage.
     * Default OFF: NOT safe to enable on a LIVE device. Two hard blockers, each violating the
     * "never un-armed after unlock" fence:
     *  (1) Flic2Manager is a PROCESS SINGLETON — if a pre-unlock init on DP storage does not actually
     *      carry the pairing across (the SDK hardcodes its credential-encrypted path), the singleton is
     *      bound to empty storage for the WHOLE session, leaving the button un-armed even post-unlock,
     *      unrecoverable without a process restart.
     *  (2) the CE→DP migration is DESTRUCTIVE (moveDatabaseFrom moves, there is no copy/verify-before-
     *      commit), so a failure loses the live pairing until a re-pair — on the live user's daily phone
     *      an auto-migration on a real reboot could silently kill the button.
     * There is no non-destructive way to test whether the SDK honours a DP context (singleton + no copy
     * API), so it cannot be tried-and-rolled-back. Enable ONLY for a deliberate test on a SPARE pairing /
     * spare device. With it OFF, the button defers arming to first unlock and the calm unlock nudge
     * (item 2) makes the pre-unlock gap visible — the honest scope.
     */
    private static final boolean SPIKE_DP_STORAGE = false;

    /** Tracks whether {@code initAndGetInstance} has run. The SDK's {@code getInstance()} THROWS
        {@code IllegalStateException("Not initialized")} before init — it does NOT return null — so we
        must gate on our own flag, never on {@code getInstance()}, or {@code IonaApplication.onCreate}
        crashes before first init (observed on the 12:34 boot). */
    private static volatile boolean _managerReady = false;

    static void ensureManagerInitialized(Context ctx) {
        if (ctx == null || _managerReady) return;
        try {
            UserManager um = (UserManager) ctx.getSystemService(Context.USER_SERVICE);
            boolean unlocked = um == null || um.isUserUnlocked();
            if (unlocked) {
                Flic2Manager.initAndGetInstance(ctx.getApplicationContext(), new Handler(ctx.getMainLooper()));
                _managerReady = true;
                return;
            }
            // Direct boot (pre-unlock). Default path: defer to first unlock (safe; nudge covers the gap).
            if (SPIKE_DP_STORAGE) {
                Context dp = ctx.createDeviceProtectedStorageContext();
                dp.moveDatabaseFrom(ctx, "flic2_database");     // one-time CE→DP migration (DESTRUCTIVE)
                dp.moveSharedPreferencesFrom(ctx, "flic2lib");   // best-effort; SDK prefs name may differ
                Flic2Manager.initAndGetInstance(dp, new Handler(ctx.getMainLooper()));
                _managerReady = true;
            }
        } catch (Throwable t) {
            Log.w(TAG, "Flic2Manager init deferred (direct boot / CE storage): " + t.getMessage());
        }
    }

    /** {@code Flic2Manager.getInstance()} THROWS {@code IllegalStateException} before init instead of
        returning null — wrap it so every caller's existing {@code (m == null)} guard degrades gracefully
        instead of crashing (e.g. a service-path call before the manager has come up). */
    private static Flic2Manager safeManager() {
        try { return Flic2Manager.getInstance(); } catch (Throwable t) { return null; }
    }

    // ── Gesture persistence (T019 — survive a reboot; the gesture must be right from boot) ──────────
    private static final String FLIC_PREFS = "iona_flic";
    private static final String KEY_SUMMON_GESTURE = "summon_gesture";

    /** Device-protected storage so the chosen gesture is readable in DIRECT BOOT (before first unlock) —
        the very first post-reboot press then uses the right gesture even over the lock screen. */
    private static SharedPreferences gesturePrefs(Context ctx) {
        if (ctx == null) return null;
        Context c = Build.VERSION.SDK_INT >= Build.VERSION_CODES.N
            ? ctx.createDeviceProtectedStorageContext() : ctx;
        return c != null ? c.getSharedPreferences(FLIC_PREFS, Context.MODE_PRIVATE) : null;
    }

    /** Load the persisted summon gesture into the static at process start. Default = single-press
        ("short", the telecare-familiar default) when nothing has been chosen yet. */
    static void loadSummonGesture(Context ctx) {
        try {
            SharedPreferences p = gesturePrefs(ctx);
            if (p == null) return;
            String g = p.getString(KEY_SUMMON_GESTURE, "short");
            summonGesture = "hold".equals(g) ? "hold" : "short";
        } catch (Exception e) { /* keep the in-memory default (single-press) */ }
    }

    private static void persistSummonGesture(Context ctx) {
        try {
            SharedPreferences p = gesturePrefs(ctx);
            if (p != null) p.edit().putString(KEY_SUMMON_GESTURE, summonGesture).apply();
        } catch (Exception e) { /* best-effort */ }
    }

    // ── Paired-button gate (T023 — no button → no service → no notification → no battery cost) ──────
    private static final String KEY_HAS_BUTTON = "has_button";

    /** Authoritative paired-button check (post-unlock): inits the manager, reads the SDK's pairing list,
        and syncs the pre-unlock hint. Gates the always-armed FGS so a phone with NO paired button never
        runs the service / shows the notification. A paired button returns true → the service arms exactly
        as before (the always-armed guarantee is unchanged for users who have a button). */
    static boolean hasPairedButton(Context ctx) {
        ensureManagerInitialized(ctx);
        Flic2Manager m = safeManager();
        boolean has = m != null && !m.getButtons().isEmpty();
        persistHasButton(ctx, has);
        return has;
    }

    /** Pre-unlock hint (device-protected, readable in direct boot): was a button paired as of the last
        sync? Gates the locked-boot unlock nudge so a button-less phone shows no notification at all. */
    static boolean hasButtonHint(Context ctx) {
        try {
            SharedPreferences p = gesturePrefs(ctx);
            return p != null && p.getBoolean(KEY_HAS_BUTTON, false);
        } catch (Exception e) { return false; }
    }

    private static void persistHasButton(Context ctx, boolean has) {
        try {
            SharedPreferences p = gesturePrefs(ctx);
            if (p != null) p.edit().putBoolean(KEY_HAS_BUTTON, has).apply();
        } catch (Exception e) { /* best-effort */ }
    }

    private static Flic2ButtonListener makeListener() {
        return new Flic2ButtonListener() {
            @Override public void onConnect(Flic2Button b) { emitConnection(b, "connected"); }
            @Override public void onReady(Flic2Button b, long ts) { emitConnection(b, "ready"); }
            @Override public void onDisconnect(Flic2Button b) { emitConnection(b, "disconnected"); }
            @Override public void onUnpaired(Flic2Button b) { emitConnection(b, "unpaired"); }
            @Override public void onBatteryLevelUpdated(Flic2Button b, BatteryLevel lvl) {
                JSObject d = new JSObject().put("uuid", b.getUuid());
                if (lvl != null) {
                    d.put("percentage", lvl.getEstimatedPercentage());
                    d.put("voltage", lvl.getVoltage());
                }
                deliverToJs("batteryLevel", d);
            }
            @Override public void onButtonSingleOrDoubleClickOrHold(Flic2Button b, boolean wasQueued,
                    boolean lastQueued, long timestamp, boolean isSingleClick, boolean isDoubleClick,
                    boolean isHold) {
                routePress(b, wasQueued, timestamp, isSingleClick, isDoubleClick, isHold);
            }
        };
    }

    private static void routePress(Flic2Button b, boolean wasQueued, long timestamp, boolean isSingle, boolean isDouble, boolean isHold) {
        // T007 / FR-007 — a press acts now or not at all. A QUEUED press was buffered by the button
        // while it was out of range (or the phone disconnected) and delivered on reconnect. It fires
        // ONLY if it was fresh — pressed within STALE_PRESS_MAX_MS before this connection became ready
        // (a brief BLE blip); a genuinely old one is dropped, but LOUDLY (emit 'summonDropped' so JS
        // logs it + surfaces a calm note — a dropped summon the person believes is running must never
        // vanish silently, Constitution I.4). Age is a SAME-CLOCK delta: getReadyTimestamp() and the
        // event timestamp share the button's clock, so (readyTs − pressTs) is reliable even though the
        // absolute base is button-relative and not comparable to phone time. A live press summons.
        if (wasQueued) {
            long ageMs = b.getReadyTimestamp() - timestamp;
            if (ageMs < 0) ageMs = 0;
            if (ageMs > STALE_PRESS_MAX_MS) {
                Log.d(TAG, "stale queued press dropped ageMs=" + ageMs);
                deliverToJs("summonDropped", new JSObject()
                    .put("uuid", b.getUuid()).put("ageMs", ageMs).put("reason", "stale"));
                return;
            }
            // queued but fresh (≤ threshold) — fall through and summon.
        }

        if ("short".equals(summonGesture)) {
            // FR-026a — short-press summon: EVERY gesture summons; the button self-test is disabled
            // so a tremor read as a double-click can never be downgraded to a "test".
            emitSummon(b, "short", timestamp);
            return;
        }
        // hold summon (default): hold summons; double-tap is the self-test; single is ignored.
        if (isHold) {
            emitSummon(b, "hold", timestamp);
        } else if (isDouble) {
            deliverToJs("buttonSelfTest", new JSObject()
                .put("uuid", b.getUuid()).put("timestamp", timestamp));
        }
        // isSingle in hold mode → intentionally ignored (accident-resistant).
    }

    private static void emitSummon(Flic2Button b, String gesture, long timestamp) {
        JSObject d = new JSObject().put("uuid", b.getUuid()).put("gesture", gesture).put("timestamp", timestamp);
        // App on screen → the live WebView runs the help sequence (visible). Headless (boot) → no-op here.
        deliverToJs("buttonSummon", d);
        // App backgrounded/closed → the WebView is hidden or destroyed, so a full-screen intent WAKES the
        // phone (over the lock) and launches into the help sequence. The _summonCountdownActive guard on the
        // JS side dedupes if both this notifyListeners and the launched intent reach _startHelpSequence.
        if (!appForeground) {
            fireSummonFullScreenIntent();
        }
    }

    /** Raise the summon full-screen intent — wakes the phone (over the lock) into MainActivity, and its
        high-importance channel sounds, so the press is loud even where FSI launch is denied (the floor). */
    private static void fireSummonFullScreenIntent() {
        Context ctx = appContext;
        if (ctx == null) return;  // headless re-arm always sets appContext before a press can arrive
        Intent launch = new Intent(ctx, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra("flic_summon", true);
        PendingIntent pi = PendingIntent.getActivity(ctx, 42, launch,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new NotificationCompat.Builder(ctx, SUMMON_CHANNEL_ID)
            .setContentTitle("Iona is reaching your people")
            .setContentText("Tap to continue")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setFullScreenIntent(pi, true)
            .setAutoCancel(true)
            .build();
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(SUMMON_NOTIF_ID, n);
    }

    /** Called by {@link MainActivity} when it is launched/resumed via the summon full-screen intent.
        Sets a ONE-SHOT flag (not a retained event — that re-fired on every WebView reload and looped the
        help sequence). JS consumes it exactly once via {@link #consumePendingSummon} on load or resume. */
    void emitLaunchSummon() {
        pendingLaunchSummon = true;
        Context ctx = appContext != null ? appContext : getContext().getApplicationContext();
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(SUMMON_NOTIF_ID);
    }

    /** JS calls this on load AND on resume; the flag is cleared atomically so only the first caller acts
        (exactly-once) — no matter how many times the WebView reloads. */
    @PluginMethod
    public void consumePendingSummon(PluginCall call) {
        boolean pending = pendingLaunchSummon;
        pendingLaunchSummon = false;
        call.resolve(new JSObject().put("pending", pending));
    }

    /** Bug A — raise the ESCALATION-ALARM full-screen intent: the FCM twin of
        {@link #fireSummonFullScreenIntent}. Wakes the phone over the lock into MainActivity and sounds
        the high-importance SUMMON channel, so a killed-app escalation is loud + full-screen even where
        an FSI launch is denied (the same floor the physical press relies on). Takes an EXPLICIT Context
        because the FCM service can run in a cold process where {@link #appContext} was never captured. */
    static void fireEscalationAlarmFullScreenIntent(Context ctx) {
        if (ctx == null) return;
        Intent launch = new Intent(ctx, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra("escalation_alarm", true);
        PendingIntent pi = PendingIntent.getActivity(ctx, 43, launch,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new NotificationCompat.Builder(ctx, SUMMON_CHANNEL_ID)
            .setContentTitle("Iona is reaching your people")
            .setContentText("Tap to continue")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setFullScreenIntent(pi, true)
            .setAutoCancel(true)
            .build();
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(ESCALATION_ALARM_NOTIF_ID, n);
    }

    /** Called by {@link MainActivity} when it is launched/resumed via the escalation-alarm full-screen
        intent. One-shot flag (mirrors {@link #emitLaunchSummon}); JS consumes it once and lands on
        "Calling your contacts" — NOT a fresh cancel window, because the escalation already started
        server-side (re-running the cancel window would wrongly imply it can still be cancelled). */
    void emitLaunchEscalationAlarm() {
        pendingEscalationAlarm = true;
        Context ctx = appContext != null ? appContext : getContext().getApplicationContext();
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(ESCALATION_ALARM_NOTIF_ID);
    }

    /** JS calls this on load AND on resume; the flag is cleared atomically so only the first caller acts
        (exactly-once), no matter how many times the WebView reloads. */
    @PluginMethod
    public void consumePendingEscalationAlarm(PluginCall call) {
        boolean pending = pendingEscalationAlarm;
        pendingEscalationAlarm = false;
        call.resolve(new JSObject().put("pending", pending));
    }

    private static void emitConnection(Flic2Button b, String state) {
        deliverToJs("connectionChanged", new JSObject()
            .put("uuid", b.getUuid()).put("state", state)
            .put("connectionState", b.getConnectionState()));
    }

    // ── Reconnect helpers ─────────────────────────────────────────────────────

    /**
     * Cold-boot / no-Activity re-arm (T023/T015). Called by {@link FlicListeningService} on start —
     * whether the process was woken by the BootReceiver (no Activity, {@link #instance} null) or by a
     * normal launch. Ensures the app context + shared listener exist, then attaches + connects every
     * paired button so a live press routes to the summon full-screen intent with NO app launch. Safe
     * to call repeatedly: the re-attach is remove-then-add of one shared listener (never double-fires).
     */
    static void reconnectHeadless(Context appCtx) {
        ensureAppContext(appCtx);
        ensureManagerInitialized(appCtx);   // bring the manager up if the process started pre-unlock (nudge)
        loadSummonGesture(appCtx);   // T019 — load the persisted gesture BEFORE the listener attaches,
                                     // so the very first post-reboot press (no app open) uses the right one
        ensureListener();
        attachAndConnectAll();
    }

    private static void attachAndConnectAll() {
        Flic2Manager m = safeManager();
        if (m == null) return;
        ensureListener();
        for (Flic2Button b : m.getButtons()) attachAndConnect(b);
    }

    private static void attachAndConnect(Flic2Button b) {
        // Single registration: remove then add so a re-attach can never double-fire a press.
        b.removeListener(buttonListener);
        b.addListener(buttonListener);
        if (b.getConnectionState() == Flic2Button.CONNECTION_STATE_DISCONNECTED) {
            b.connect();
        }
    }

    private void maybeStartService() {
        Flic2Manager m = safeManager();
        if (m == null || m.getButtons().isEmpty()) return;
        persistHasButton(getContext(), true);   // a button is paired → remember it (gates the boot arm + nudge)
        ContextCompat.startForegroundService(getContext(),
            new Intent(getContext(), FlicListeningService.class));
    }

    private JSObject buttonToJs(Flic2Button b) {
        return new JSObject()
            .put("uuid", b.getUuid())
            .put("name", b.getName())
            .put("serial", b.getSerialNumber())
            .put("connectionState", b.getConnectionState());
    }
}
