package com.iona.app;

import android.app.Notification;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.core.app.NotificationCompat;

/**
 * Feature 005 — the always-armed listener.
 *
 * A foreground service (connectedDevice type) that keeps the process alive so the Flic BLE
 * press callbacks fire while backgrounded (Constitution I.4 / IV — never a WebView timer),
 * and re-attaches + reconnects paired buttons on start (reconnect-on-launch, the known SDK
 * gotcha — T006). The persistent notification copy is fixed as "Iona is here for you." (FR-023).
 */
public class FlicListeningService extends Service {

    static final String CHANNEL_ID = "flic_listening";
    static final int    NOTIF_ID   = 1002;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification n = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Iona is here for you.")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
        } else {
            startForeground(NOTIF_ID, n);
        }

        // Reconnect-on-launch / cold-boot re-arm: attach the shared press router + connect paired
        // buttons. STATIC path so it works even when the Activity never launched (a BootReceiver-woken
        // process — FlicPlugin.instance == null); a press then routes to the summon full-screen intent
        // with no app launch. Idempotent (remove-then-add of one shared listener).
        FlicPlugin.reconnectHeadless(getApplicationContext());
        BootReceiver.cancelBootNudge(getApplicationContext());  // armed now — clear the post-reboot unlock nudge
        Log.d("FlicService", "always-armed foreground service started");
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
