package com.iona.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.UserManager;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * Feature 005 (T023) — reboot survival + unlock nudge.
 *
 * <p>The Flic SDK persists the pairing across a reboot but NOT a running listener / the always-armed
 * foreground service. On boot this receiver re-arms {@link FlicListeningService} (the SAME FGS, not a
 * second service) so a press summons with NO app launch.
 *
 * <p>Handles both boot actions. The Flic2 SDK's DB lives in credential-encrypted storage, unavailable
 * in direct boot (before first unlock), so the button cannot ARM until the phone is unlocked once
 * (initialising the manager pre-unlock crashes — see {@link IonaApplication}). Therefore:
 * <ul>
 *   <li><b>Unlocked</b> ({@code BOOT_COMPLETED}, or a device with no secure lock): re-arm the FGS and
 *       clear any unlock nudge.</li>
 *   <li><b>Locked</b> ({@code LOCKED_BOOT_COMPLETED}, before first unlock): the button can't arm yet —
 *       fail LOUDLY, not silently: post one calm nudge to unlock. {@code BOOT_COMPLETED} then fires
 *       post-unlock and arms + cancels the nudge.</li>
 * </ul>
 * directBootAware (manifest) so the locked-boot nudge is actually delivered. Best-effort throughout —
 * a failure never crashes the boot broadcast; the {@code BOOT_COMPLETED} arm always remains the fallback.
 */
public class BootReceiver extends BroadcastReceiver {

    static final String NUDGE_CHANNEL_ID = "flic_boot_nudge";
    static final int    NUDGE_NOTIF_ID   = 1004;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action)) {
            return;
        }
        Context app = context.getApplicationContext();
        UserManager um = (UserManager) app.getSystemService(Context.USER_SERVICE);
        boolean unlocked = um == null || um.isUserUnlocked();

        if (unlocked) {
            // Storage available — re-arm the FGS ONLY if a button is actually paired (no button → no
            // service → no notification → no battery cost). A paired button arms exactly as before.
            // Always clear any nudge posted during the pre-unlock phase.
            try {
                if (FlicPlugin.hasPairedButton(app)) {
                    ContextCompat.startForegroundService(app, new Intent(app, FlicListeningService.class));
                    Log.d("BootReceiver", "re-armed FlicListeningService after " + action);
                } else {
                    Log.d("BootReceiver", "no paired button — FGS not armed (" + action + ")");
                }
                cancelBootNudge(app);
            } catch (Exception e) {
                Log.w("BootReceiver", "FGS re-arm failed for " + action + ": " + e.getMessage());
            }
        } else {
            // Direct boot (before first unlock): the Flic SDK's credential-encrypted DB is unavailable,
            // so the button cannot arm yet. Never silent — post one calm nudge to unlock; unlocking then
            // arms the button (BOOT_COMPLETED) and cancels this. Gated on the pre-unlock paired-button hint
            // so a button-less phone shows no notification at all.
            if (FlicPlugin.hasButtonHint(app)) {
                postBootNudge(app);
                Log.d("BootReceiver", "locked boot — posted unlock nudge (arm deferred to first unlock)");
            } else {
                Log.d("BootReceiver", "locked boot — no paired button, nudge skipped");
            }
        }
    }

    /** One calm notification: unlock so the button can re-arm. Best-effort; pronoun-free, not alarm-styled. */
    static void postBootNudge(Context ctx) {
        try {
            Intent open = new Intent(ctx, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent pi = PendingIntent.getActivity(ctx, 43, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification n = new NotificationCompat.Builder(ctx, NUDGE_CHANNEL_ID)
                .setContentTitle("Your help button")
                .setContentText("Unlock your phone once so Iona can hear your button.")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NUDGE_NOTIF_ID, n);
        } catch (Exception e) {
            Log.w("BootReceiver", "unlock nudge post failed: " + e.getMessage());
        }
    }

    static void cancelBootNudge(Context ctx) {
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(NUDGE_NOTIF_ID);
        } catch (Exception e) { /* best-effort */ }
    }
}
