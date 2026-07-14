package com.iona.app;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;

/**
 * Feature 005 — physical help button.
 *
 * Initialises the Flic 2 manager exactly once for the process (SDK requirement) and
 * creates the notification channel used by the always-armed {@link FlicListeningService}.
 * Wired via {@code android:name} on the manifest &lt;application&gt;.
 */
public class IonaApplication extends Application {

    @Override
    public void onCreate() {
        super.onCreate();
        createFlicChannel();
        // Direct-boot-safe: FlicPlugin.ensureManagerInitialized initialises the Flic2 manager ONLY once
        // the user is unlocked — its SQLite DB lives in credential-encrypted storage, absent in direct
        // boot. A pre-unlock process start (the directBootAware BootReceiver posting the unlock nudge)
        // therefore runs WITHOUT crashing; the manager comes up at first unlock / when the FGS arms.
        FlicPlugin.ensureManagerInitialized(this);
    }

    private void createFlicChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm == null) return;

            // Always-armed listener — quiet, ongoing presence ("Iona is here for you.").
            NotificationChannel armed = new NotificationChannel(
                FlicListeningService.CHANNEL_ID, "Iona", NotificationManager.IMPORTANCE_LOW);
            armed.setDescription("Keeps your help button ready");
            armed.setSound(null, null);
            armed.enableVibration(false);
            nm.createNotificationChannel(armed);

            // Summon — high importance + sound: the full-screen-intent launcher, and the loud floor
            // when a full-screen launch can't be forced (a press must never be silent).
            NotificationChannel summon = new NotificationChannel(
                FlicPlugin.SUMMON_CHANNEL_ID, "Help summon", NotificationManager.IMPORTANCE_HIGH);
            summon.setDescription("Shown when your button summons help");
            nm.createNotificationChannel(summon);

            // Boot nudge — calm reminder to unlock after a restart so the button re-arms (T023 item 2).
            NotificationChannel nudge = new NotificationChannel(
                BootReceiver.NUDGE_CHANNEL_ID, "Help button setup", NotificationManager.IMPORTANCE_DEFAULT);
            nudge.setDescription("Reminds you to unlock after a restart so your button re-arms");
            nm.createNotificationChannel(nudge);
        }
    }
}
