package com.iona.app;

import android.Manifest;
import android.content.ComponentName;
import android.content.Context;
import android.util.Log;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.telecom.PhoneAccount;
import android.telecom.PhoneAccountHandle;
import android.telecom.TelecomManager;
import android.telephony.PhoneStateListener;
import android.telephony.TelephonyCallback;
import android.telephony.TelephonyManager;

import androidx.annotation.RequiresApi;
import androidx.core.app.ActivityCompat;
import android.content.pm.PackageManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "ZeroCall",
    permissions = {
        @Permission(strings = {Manifest.permission.CALL_PHONE},           alias = "callPhone"),
        @Permission(strings = {Manifest.permission.READ_PHONE_STATE},     alias = "readPhoneState"),
        @Permission(strings = {Manifest.permission.MODIFY_AUDIO_SETTINGS},alias = "audioSettings")
    }
)
public class ZeroCallPlugin extends Plugin {

    // Static ref so ZeroConnection can fire events back (Route B)
    static ZeroCallPlugin instance;

    private PluginCall pendingPermCall;
    private StateCallbackCompat stateCallback;
    private long offhookAt = 0;

    @Override
    public void load() {
        instance = this;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ROUTE A — ACTION_CALL + TelephonyManager state
    //
    // Limitations discovered:
    //   • CALL_STATE_OFFHOOK fires when dialing STARTS, not when answered.
    //     For outgoing calls Android gives you IDLE → OFFHOOK → IDLE.
    //     You CANNOT distinguish "still ringing" from "answered" via public APIs.
    //   • CALL_STATE_RINGING only fires for INBOUND calls on this device.
    //   • IDLE duration from OFFHOOK gives a timing proxy only (see offhookDurationMs).
    //
    // Speakerphone:
    //   • AudioManager.setSpeakerphoneOn / setCommunicationDevice works for PSTN
    //     calls placed via ACTION_CALL. Does NOT require ConnectionService.
    //   • Samsung (OneUI 5+): must delay 300–500ms after OFFHOOK before the audio
    //     session is ready to accept routing override — see onTelephonyState.
    // ─────────────────────────────────────────────────────────────────────────

    @PluginMethod
    public void placeCallA(PluginCall call) {
        String number = call.getString("number");
        if (number == null) { call.reject("number required"); return; }

        boolean hasCall  = hasPermission(Manifest.permission.CALL_PHONE);
        boolean hasPhone = hasPermission(Manifest.permission.READ_PHONE_STATE);

        if (!hasCall || !hasPhone) {
            pendingPermCall = call;
            requestAllPermissions(call, "onCallPermission");
            return;
        }
        doPlaceCallA(call, number);
    }

    private void doPlaceCallA(PluginCall call, String number) {
        TelephonyManager tm =
            (TelephonyManager) getContext().getSystemService(Context.TELEPHONY_SERVICE);

        try {
            stateCallback = new StateCallbackCompat(tm, getContext().getMainExecutor());
            stateCallback.register(this::onTelephonyState);
        } catch (SecurityException e) {
            // READ_PHONE_STATE not yet granted at runtime — call still places, no state events
            emit("call_state", new JSObject()
                .put("state", "monitor_unavailable")
                .put("reason", e.getMessage()));
        }

        android.content.Intent intent = new android.content.Intent(
            android.content.Intent.ACTION_CALL,
            Uri.parse("tel:" + number)
        );
        intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);

        call.resolve(new JSObject().put("route", "A").put("status", "dialing"));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ROUTE B — ConnectionService (CAPABILITY_SELF_MANAGED / MANAGE_OWN_CALLS)
    //
    // What it gives you: full STATE_DIALING → STATE_RINGING → STATE_ACTIVE
    //   → STATE_DISCONNECTED lifecycle with precise answered detection.
    //   ConnectionService.onCallAudioStateChanged gives clean audio-route hooks.
    //
    // Key limitation: CAPABILITY_SELF_MANAGED means YOU own the call transport.
    //   TelecomManager.placeCall routes through ZeroConnectionService.onCreateOutgoingConnection,
    //   which creates a ZeroConnection stub. The actual carrier call does NOT happen
    //   automatically — you would need a SIP/VoIP stack or Twilio Client SDK underneath.
    //   This route is NOT a replacement for ACTION_CALL for PSTN fallback.
    //
    // When Route B makes sense:
    //   If Zero ever moves to on-device Twilio Client (data-dependent), this gives
    //   you the full lifecycle with answered detection and clean speaker routing
    //   without polling or timing heuristics.
    //
    // Effort delta vs Route A:
    //   ~250 extra lines across ZeroConnectionService + ZeroConnection,
    //   PhoneAccount registration, manifest service declaration, and
    //   user must enable "Zero Direct Dial" under Settings → Apps → [app] → Phone accounts
    //   on most OEMs. Samsung adds an extra "Allow management of calls" prompt.
    // ─────────────────────────────────────────────────────────────────────────

    @PluginMethod
    public void placeCallB(PluginCall call) {
        String number = call.getString("number");
        if (number == null) { call.reject("number required"); return; }

        if (!hasPermission(Manifest.permission.CALL_PHONE)) {
            pendingPermCall = call;
            requestPermissionForAlias("callPhone", call, "onCallPermission");
            return;
        }
        doPlaceCallB(call, number);
    }

    private void doPlaceCallB(PluginCall call, String number) {
        TelecomManager telecom =
            (TelecomManager) getContext().getSystemService(Context.TELECOM_SERVICE);

        PhoneAccountHandle handle = new PhoneAccountHandle(
            new ComponentName(getContext(), ZeroConnectionService.class),
            "zero-account"
        );

        PhoneAccount account = PhoneAccount.builder(handle, "Zero Direct Dial")
            .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
            .build();
        telecom.registerPhoneAccount(account);

        Bundle extras = new Bundle();
        extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, handle);

        if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.CALL_PHONE)
                == PackageManager.PERMISSION_GRANTED) {
            telecom.placeCall(Uri.parse("tel:" + number), extras);
        }

        call.resolve(new JSObject().put("route", "B").put("status", "placed"));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Speakerphone — standalone toggle, usable independently of call routes
    //
    // on=true, delayMs=0   → immediate (use after STATE_ACTIVE in Route B)
    // on=true, delayMs=400 → Samsung-safe (use after OFFHOOK in Route A)
    // ─────────────────────────────────────────────────────────────────────────

    @PluginMethod
    public void fetchToken(PluginCall call) {
        String url = call.getString("url");
        if (url == null) { call.reject("url required"); return; }
        new Thread(() -> {
            try {
                java.net.URL u = new java.net.URL(url);
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) u.openConnection();
                c.setRequestMethod("GET");
                c.setConnectTimeout(10000);
                c.setReadTimeout(10000);
                int status = c.getResponseCode();
                java.io.InputStream is = status < 400 ? c.getInputStream() : c.getErrorStream();
                byte[] bytes = is.readAllBytes();
                String body = new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
                JSObject result = new JSObject();
                result.put("status", status);
                result.put("body", body);
                call.resolve(result);
            } catch (Exception e) {
                call.reject("fetchToken failed: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void setSpeaker(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", true));
        int delayMs = call.getInt("delayMs", 0);
        applySpeaker(on, delayMs, call);
    }

    void applySpeaker(boolean on, int delayMs, PluginCall call) {
        Runnable work = () -> {
            AudioManager audio =
                (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            boolean ok;
            int mode = audio.getMode();

            // MODE_IN_CALL (2) = cellular call owned by telephony stack.
            // setCommunicationDevice returns ok=true but doesn't affect the cellular
            // audio path — only setSpeakerphoneOn signals the telephony stack correctly.
            // Use setSpeakerphoneOn for cellular; setCommunicationDevice for VoIP (MODE_IN_COMMUNICATION=3).
            boolean isCellular = (mode == AudioManager.MODE_IN_CALL);

            if (!isCellular && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // VoIP path: use modern API
                if (on) {
                    AudioDeviceInfo speaker = null;
                    for (AudioDeviceInfo d : audio.getAvailableCommunicationDevices()) {
                        if (d.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) {
                            speaker = d;
                            break;
                        }
                    }
                    ok = speaker != null && audio.setCommunicationDevice(speaker);
                    Log.d("ZeroSpike", "setCommunicationDevice(speaker) → ok=" + ok
                        + " mode=" + mode);
                } else {
                    audio.clearCommunicationDevice();
                    ok = true;
                }
            } else {
                // Cellular path (or pre-API 31): setSpeakerphoneOn is the correct API.
                //noinspection deprecation
                audio.setSpeakerphoneOn(on);
                //noinspection deprecation
                boolean stuck = audio.isSpeakerphoneOn();
                ok = stuck;
                Log.d("ZeroSpike", "setSpeakerphoneOn(" + on + ") → mode=" + mode
                    + " isCellular=" + isCellular + " isSpeakerphoneOn()=" + stuck);
                // Re-apply 800ms later in case system dialer resets it
                if (on) {
                    new Handler(Looper.getMainLooper()).postDelayed(() -> {
                        //noinspection deprecation
                        audio.setSpeakerphoneOn(true);
                        //noinspection deprecation
                        Log.d("ZeroSpike", "re-apply setSpeakerphoneOn(true) → isSpeakerphoneOn()=" + audio.isSpeakerphoneOn() + " mode=" + audio.getMode());
                    }, 800);
                }
            }

            JSObject result = new JSObject()
                .put("ok", ok)
                .put("api", Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? "31+" : "legacy")
                .put("delayMs", delayMs);
            notifyListeners("speaker_result", result, true);
            if (call != null) call.resolve(result);
        };

        if (delayMs > 0) {
            new Handler(Looper.getMainLooper()).postDelayed(work, delayMs);
            if (call != null) call.resolve(
                new JSObject().put("queued", true).put("delayMs", delayMs));
        } else {
            new Handler(Looper.getMainLooper()).post(work);
            // resolve happens inside work if call != null
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TelephonyManager state handler (Route A only)
    // ─────────────────────────────────────────────────────────────────────────

    private void onTelephonyState(int state) {
        long now = System.currentTimeMillis();
        JSObject data = new JSObject().put("ts", now);

        switch (state) {
            case TelephonyManager.CALL_STATE_IDLE:
                long dur = offhookAt > 0 ? now - offhookAt : -1;
                offhookAt = 0;
                data.put("state", "idle").put("offhookDurationMs", dur);
                Log.d("ZeroSpike", "call_state=IDLE offhookDurationMs=" + dur);
                break;

            case TelephonyManager.CALL_STATE_RINGING:
                data.put("state", "ringing").put("note", "inbound_only");
                Log.d("ZeroSpike", "call_state=RINGING (inbound)");
                break;

            case TelephonyManager.CALL_STATE_OFFHOOK:
                offhookAt = now;
                data.put("state", "offhook").put("note", "dialing_started_not_answered");
                Log.d("ZeroSpike", "call_state=OFFHOOK — queueing speaker at +400ms");
                applySpeaker(true, 400, null);
                break;

            default:
                data.put("state", "unknown").put("raw", state);
                Log.d("ZeroSpike", "call_state=UNKNOWN raw=" + state);
        }

        notifyListeners("call_state", data, true);
    }

    /** Public bridge so ZeroConnectionService / ZeroConnection can fire events. */
    public void emit(String event, JSObject data) {
        notifyListeners(event, data, true);
    }

    // Called by ZeroConnection (Route B) via static instance
    void onConnectionState(String state, String disconnectReason) {
        JSObject data = new JSObject()
            .put("state", state)
            .put("ts", System.currentTimeMillis());
        if (disconnectReason != null) data.put("disconnectReason", disconnectReason);
        notifyListeners("connection_state", data, true);

        // Route B: apply speaker immediately on STATE_ACTIVE (no delay — ConnectionService
        // owns the audio session, timing is deterministic)
        if ("active".equals(state)) applySpeaker(true, 0, null);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TelephonyCallback compat wrapper — handles API 31+ vs legacy
    // ─────────────────────────────────────────────────────────────────────────

    interface StateHandler { void onState(int state); }

    private static class StateCallbackCompat {
        private final TelephonyManager tm;
        private final java.util.concurrent.Executor executor;
        private Object registered;

        StateCallbackCompat(TelephonyManager tm, java.util.concurrent.Executor executor) {
            this.tm = tm;
            this.executor = executor;
        }

        void register(StateHandler handler) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                Api31Callback cb = new Api31Callback(handler);
                registered = cb;
                tm.registerTelephonyCallback(executor, cb);
            } else {
                PhoneStateListener psl = new PhoneStateListener() {
                    @Override
                    public void onCallStateChanged(int state, String phoneNumber) {
                        handler.onState(state);
                    }
                };
                registered = psl;
                //noinspection deprecation
                tm.listen(psl, PhoneStateListener.LISTEN_CALL_STATE);
            }
        }

        void unregister() {
            if (registered == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                tm.unregisterTelephonyCallback((TelephonyCallback) registered);
            } else {
                //noinspection deprecation
                tm.listen((PhoneStateListener) registered, PhoneStateListener.LISTEN_NONE);
            }
            registered = null;
        }
    }

    @RequiresApi(api = Build.VERSION_CODES.S)
    private static class Api31Callback extends TelephonyCallback
            implements TelephonyCallback.CallStateListener {
        private final StateHandler handler;
        Api31Callback(StateHandler h) { this.handler = h; }
        @Override public void onCallStateChanged(int state) { handler.onState(state); }
    }

    @PermissionCallback
    private void onCallPermission(PluginCall call) {
        if (!hasPermission(Manifest.permission.CALL_PHONE)) {
            call.reject("CALL_PHONE permission denied");
            return;
        }
        // READ_PHONE_STATE may still be denied — doPlaceCallA handles that via try-catch
        String number = call.getString("number", "");
        doPlaceCallA(call, number);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DEVICE-DIAL AUTO-CYCLE (Zero v1 production path)
    //
    // The offline carrier-call floor: place ACTION_CALL to each contact, await the call
    // ending (IDLE), advance to the next, loop the whole list `passes` times, then an honest
    // terminal stop. We CANNOT detect "answered" vs "rang out" on PSTN (OFFHOOK→IDLE duration
    // includes ringing), so the cycle never auto-stops on a "reached" — it tries everyone for
    // the configured passes; the user (holding the phone) is the judge of success.
    //
    // NATIVE on purpose: the system dialler backgrounds our app and Android freezes the
    // WebView (JS timers) during each call — the cycle must not depend on WebView setTimeout.
    // NO auto-speaker: device dial is held to the ear by the user (system-dialler calls
    // can't be made reliably hands-free — proven on the bridge). Progress events emitted to
    // JS ("dial_cycle") drive the shared calling screen; the cycle itself runs here.
    // ─────────────────────────────────────────────────────────────────────────

    private String[] cycleNumbers;
    private int cyclePasses = 1;
    private int cyclePass = 0;
    private int cycleIndex = 0;
    private long cycleOffhookAt = 0;
    private boolean cycleActive = false;
    private boolean cycleSawOffhook = false;
    private StateCallbackCompat cycleStateCallback;
    private final Handler cycleHandler = new Handler(Looper.getMainLooper());
    private Runnable cycleDecisionRunnable;
    private boolean decisionPending = false;

    // Grace after a call ends before the next dial — lets the carrier line release.
    private static final long CYCLE_INTER_CALL_DELAY_MS = 2000;
    // B — after a call ends, wait this long for the user to confirm "reached someone — stop" before
    // auto-advancing. Fail-safe: if the user can't tap (incapacitated), the cycle advances anyway and
    // tries everyone. Tunable on-device.
    private static final long CYCLE_DECISION_WINDOW_MS = 10000;

    /** Settings gate — device dial is only offered where the device can place calls. */
    @PluginMethod
    public void hasTelephony(PluginCall call) {
        boolean has = getContext().getPackageManager()
            .hasSystemFeature(PackageManager.FEATURE_TELEPHONY);
        call.resolve(new JSObject().put("hasTelephony", has));
    }

    /** Start the auto-cycle. Params: numbers (string[]), passes (int, default 1). */
    @PluginMethod
    public void startDialCycle(PluginCall call) {
        if (!getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_TELEPHONY)) {
            call.reject("no_telephony");
            return;
        }
        JSArray arr = call.getArray("numbers");
        int passes = call.getInt("passes", 1);
        if (arr == null || arr.length() == 0) { call.reject("numbers required"); return; }
        java.util.List<String> nums = new java.util.ArrayList<>();
        try {
            for (int i = 0; i < arr.length(); i++) {
                String n = arr.getString(i);
                if (n != null && !n.trim().isEmpty()) nums.add(n.trim());
            }
        } catch (org.json.JSONException e) { call.reject("bad numbers array"); return; }
        if (nums.isEmpty()) { call.reject("numbers required"); return; }

        cycleNumbers = nums.toArray(new String[0]);
        cyclePasses = Math.max(1, passes);
        cyclePass = 0;
        cycleIndex = 0;

        // READ_PHONE_STATE is required for the TelephonyCallback call-state (IDLE) events that drive
        // auto-advance — without it the cycle dials contact 1 then stalls (the listener can't register).
        // Request BOTH up front: CALL_PHONE alone lets the call place but leaves the cycle blind to call-end.
        if (!hasPermission(Manifest.permission.CALL_PHONE)
                || !hasPermission(Manifest.permission.READ_PHONE_STATE)) {
            requestAllPermissions(call, "onCyclePermission");
            return;
        }
        beginCycle();
        call.resolve(new JSObject().put("started", true)
            .put("count", cycleNumbers.length).put("passes", cyclePasses));
    }

    @PermissionCallback
    private void onCyclePermission(PluginCall call) {
        if (!hasPermission(Manifest.permission.CALL_PHONE)) {
            emitCycle("terminal", -1, cyclePass, "permission_denied");
            call.reject("CALL_PHONE permission denied");
            return;
        }
        beginCycle();
        call.resolve(new JSObject().put("started", true)
            .put("count", cycleNumbers.length).put("passes", cyclePasses));
    }

    /** B: user (holding the phone) confirms they reached someone — stop the cycle. */
    @PluginMethod
    public void stopDialCycle(PluginCall call) {
        cycleHandler.post(() -> {
            decisionPending = false;
            cycleHandler.removeCallbacks(cycleDecisionRunnable);
            if (cycleActive) endCycle("reached", cycleIndex);
        });
        call.resolve();
    }

    /** B: user chooses to keep trying — advance to the next contact now (skip the wait). */
    @PluginMethod
    public void advanceDialCycle(PluginCall call) {
        cycleHandler.post(() -> {
            if (decisionPending) {
                decisionPending = false;
                cycleHandler.removeCallbacks(cycleDecisionRunnable);
                advanceCycle();
            }
        });
        call.resolve();
    }

    private void beginCycle() {
        cycleActive = true;
        // Dedicated call-state listener for the cycle — NO speaker (separate from the spike path).
        try {
            TelephonyManager tm =
                (TelephonyManager) getContext().getSystemService(Context.TELEPHONY_SERVICE);
            cycleStateCallback = new StateCallbackCompat(tm, getContext().getMainExecutor());
            cycleStateCallback.register(this::onCycleTelephonyState);
        } catch (SecurityException e) {
            // READ_PHONE_STATE not granted — calls still place, but we can't detect call-end to advance.
            emitCycle("monitor_unavailable", cycleIndex, cyclePass, e.getMessage());
        }
        placeCycleCall();
    }

    private void placeCycleCall() {
        if (!cycleActive || cycleNumbers == null) return;
        decisionPending = false;
        cycleHandler.removeCallbacks(cycleDecisionRunnable);
        cycleSawOffhook = false;
        cycleOffhookAt = 0;
        String number = cycleNumbers[cycleIndex];
        emitCycle("dialing", cycleIndex, cyclePass, null);
        try {
            android.content.Intent intent = new android.content.Intent(
                android.content.Intent.ACTION_CALL, Uri.parse("tel:" + number));
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception e) {
            Log.e("ZeroCycle", "placeCycleCall failed: " + e.getMessage());
            // Couldn't place this one — treat as no-answer and advance.
            new Handler(Looper.getMainLooper()).postDelayed(this::advanceCycle, CYCLE_INTER_CALL_DELAY_MS);
        }
    }

    private void onCycleTelephonyState(int state) {
        if (!cycleActive) return;
        long now = System.currentTimeMillis();
        switch (state) {
            case TelephonyManager.CALL_STATE_OFFHOOK:
                cycleSawOffhook = true;
                cycleOffhookAt = now;
                // Deliberately NO speaker — the user holds the phone to their ear.
                break;
            case TelephonyManager.CALL_STATE_IDLE:
                if (!cycleSawOffhook) return; // spurious IDLE before our call went off-hook
                long dur = cycleOffhookAt > 0 ? now - cycleOffhookAt : 0;
                cycleSawOffhook = false;
                // A call ended — outcome UNCONFIRMED (PSTN gives no answered-vs-rang-out signal, so we
                // never auto-declare "reached"). Offer the user a brief window to confirm "reached
                // someone — stop" (stopDialCycle); otherwise auto-advance (fail-safe for a user who
                // can't tap). The user is the only reliable judge of success.
                emitCycle("called", cycleIndex, cyclePass, String.valueOf(dur));
                decisionPending = true;
                cycleHandler.removeCallbacks(cycleDecisionRunnable);
                cycleDecisionRunnable = () -> {
                    if (decisionPending) { decisionPending = false; advanceCycle(); }
                };
                cycleHandler.postDelayed(cycleDecisionRunnable, CYCLE_DECISION_WINDOW_MS);
                break;
            default:
                break;
        }
    }

    private void advanceCycle() {
        if (!cycleActive) return;
        cycleIndex++;
        if (cycleIndex >= cycleNumbers.length) {
            cycleIndex = 0;
            cyclePass++;
            if (cyclePass >= cyclePasses) {
                endCycle("exhausted", -1);
                return;
            }
        }
        placeCycleCall();
    }

    private void endCycle(String reason, int index) {
        cycleActive = false;
        decisionPending = false;
        cycleHandler.removeCallbacks(cycleDecisionRunnable);
        if (cycleStateCallback != null) {
            try { cycleStateCallback.unregister(); } catch (Exception e) {}
            cycleStateCallback = null;
        }
        emitCycle("terminal", index, cyclePass, reason);
    }

    private void emitCycle(String state, int index, int pass, String extra) {
        JSObject d = new JSObject()
            .put("state", state)
            .put("index", index)
            .put("pass", pass + 1)   // 1-based for display
            .put("passes", cyclePasses)
            .put("total", cycleNumbers != null ? cycleNumbers.length : 0)
            .put("ts", System.currentTimeMillis());
        if (extra != null) {
            if ("called".equals(state)) d.put("durationMs", extra);
            else d.put("reason", extra);
        }
        notifyListeners("dial_cycle", d, true);
    }
}
