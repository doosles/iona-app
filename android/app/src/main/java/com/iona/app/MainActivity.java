package com.iona.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ZeroCallPlugin.class);
        registerPlugin(TwilioVoicePlugin.class);
        registerPlugin(FlicPlugin.class);
        registerPlugin(ContactPickerPlugin.class);   // Contacts mirror Phase B — "Choose from your contacts"
        super.onCreate(savedInstanceState);
        createNotificationChannel();
        applyLockScreenWindowFlags(getIntent());
        handleFlicSummonIntent(getIntent());
        handleEscalationAlarmIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        applyLockScreenWindowFlags(intent);
        handleFlicSummonIntent(intent);
        handleEscalationAlarmIntent(intent);
    }

    // Bug A / Feature 005 — when launched by an alarm full-screen intent (Flic summon OR escalation
    // alarm), show the surface OVER the lockscreen and turn the screen on, so a killed-app help alarm
    // takes over the lock (not just a ring behind the keyguard — the "didn't override the lock" gap).
    // Applied only for the alarm launch and cleared on a normal launch — the app must NOT be
    // show-when-locked during ordinary use. No keyguard dismissal: the surface + its controls are usable
    // over the lock with no PIN, which is the intended alarm UX.
    private void applyLockScreenWindowFlags(Intent intent) {
        boolean alarm = intent != null
                && (intent.getBooleanExtra("flic_summon", false)
                    || intent.getBooleanExtra("escalation_alarm", false));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(alarm);
            setTurnScreenOn(alarm);
        } else {
            int f = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                  | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON;
            if (alarm) getWindow().addFlags(f); else getWindow().clearFlags(f);
        }
    }

    // Feature 005 — launched/resumed via the summon full-screen intent (button pressed while closed):
    // hand the summon to the plugin, which delivers it to the WebView to run the existing help sequence.
    private void handleFlicSummonIntent(Intent intent) {
        if (intent != null && intent.getBooleanExtra("flic_summon", false)
                && FlicPlugin.instance != null) {
            FlicPlugin.instance.emitLaunchSummon();
        }
    }

    // Bug A — launched/resumed via the escalation-alarm full-screen intent (escalation_started push
    // arrived while the app was killed/hidden): hand it to the plugin, which sets a one-shot flag the
    // WebView consumes to land on "Calling your contacts" (mirrors handleFlicSummonIntent).
    private void handleEscalationAlarmIntent(Intent intent) {
        if (intent != null && intent.getBooleanExtra("escalation_alarm", false)
                && FlicPlugin.instance != null) {
            FlicPlugin.instance.emitLaunchEscalationAlarm();
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // Undo WebView timer pause triggered by the Activity pause.
        getBridge().getWebView().resumeTimers();
    }

    @Override
    public void onStop() {
        super.onStop();
        // WasHidden() from the window visibility change may arrive asynchronously after
        // super.onStop(), re-enabling Chromium's background timer throttling after our first
        // onResume() call. Fire immediately and again at 300ms to win the race.
        getBridge().getWebView().onResume();
        new Handler(Looper.getMainLooper()).postDelayed(
            () -> getBridge().getWebView().onResume(), 300
        );
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                BridgeService.CHANNEL_ID,
                "Bridge",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Active while Iona is reaching your contacts");
            channel.setSound(null, null);
            channel.enableVibration(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }
}
