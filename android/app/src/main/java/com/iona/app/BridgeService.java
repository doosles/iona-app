package com.iona.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.core.app.NotificationCompat;

public class BridgeService extends Service {

    static final String CHANNEL_ID = "bridge_service";
    static final int    NOTIF_ID   = 1001;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // R-009-35 B — startForeground() FIRST and UNCONDITIONAL. When a bridge call ends almost immediately
        // after this service is asked to foreground (the FIX H server-side member-hangup, or the app belt's
        // hangup — R-009-34 ③), a stopService() can race this start. Android still requires the promised
        // startForeground() within ~5s or it kills the app (ForegroundServiceDidNotStartInTimeException). So we
        // promote at the very top, before anything that could delay or throw, and we OWN the channel (idempotent)
        // so a cold start before MainActivity created it can never make startForeground() fail.
        try {
            ensureChannel();
            Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Iona")
                .setContentText("Reaching your contacts…")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .build();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIF_ID, notification);
            }
            Log.d("BridgeService", "Foreground service started");
        } catch (Exception e) {
            // Never let a foregrounding failure become an uncaught crash. Promote-then-stop is still safer than
            // an unmet obligation: if we did reach foreground, stop cleanly; either way the app survives.
            Log.w("BridgeService", "startForeground failed (non-fatal): " + e.getMessage());
            try { stopForeground(true); } catch (Exception ignored) {}
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    // Idempotent — creating a channel that already exists is a no-op. Makes the service self-sufficient so
    // startForeground() never depends on MainActivity having run first (cold-wake / process-restart safety).
    private void ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
                nm.createNotificationChannel(new NotificationChannel(
                    CHANNEL_ID, "Iona bridge", NotificationManager.IMPORTANCE_LOW));
            }
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        Log.d("BridgeService", "Foreground service stopped");
        super.onDestroy();
    }
}
