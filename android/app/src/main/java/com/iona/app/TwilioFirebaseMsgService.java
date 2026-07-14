package com.iona.app;

import android.util.Log;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import com.twilio.voice.CallException;
import com.twilio.voice.CallInvite;
import com.twilio.voice.CancelledCallInvite;
import com.twilio.voice.MessageListener;
import com.twilio.voice.Voice;

// Replaces Capacitor's MessagingService in the manifest.
// Twilio call invite FCM messages are handled here; all other messages
// pass to the Capacitor super so regular push notifications keep working.
public class TwilioFirebaseMsgService extends MessagingService {

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        boolean handled = Voice.handleMessage(this, remoteMessage.getData(),
            new MessageListener() {
                @Override
                public void onCallInvite(CallInvite callInvite) {
                    Log.d("TwilioFCM", "Twilio call invite received via FCM");
                    if (TwilioVoicePlugin.instance != null) {
                        TwilioVoicePlugin.instance.onCallInvite(callInvite);
                    } else {
                        Log.w("TwilioFCM", "TwilioVoicePlugin.instance null — app not ready");
                    }
                }

                @Override
                public void onCancelledCallInvite(CancelledCallInvite cancelled,
                                                   CallException error) {
                    Log.d("TwilioFCM", "Call invite cancelled");
                }
            });

        if (!handled) {
            // Bug A — killed-app alarm delivery. escalation_started is the ONE alarm-class push
            // (== FlicPlugin.ESCALATION_ALARM_TYPE == pwa_sender.ALARM_CLASS_TYPES): the backend now
            // sends it data-only + priority:high, so onMessageReceived fires even when the UI is killed.
            // When the app is NOT on screen, raise the native full-screen ring (the FCM twin of the Flic
            // summon) so it wakes + rings over the lock — and DON'T call super, so a live WebView never
            // also fires the JS path (exactly one surface). Foreground / any other type falls through to
            // Capacitor untouched (ordinary pushes must never seize the screen).
            String type = remoteMessage.getData().get("type");
            if (FlicPlugin.ESCALATION_ALARM_TYPE.equals(type) && !FlicPlugin.isAppForeground()) {
                Log.d("TwilioFCM", "escalation_started while not foreground — raising native full-screen alarm");
                FlicPlugin.fireEscalationAlarmFullScreenIntent(getApplicationContext());
            } else {
                super.onMessageReceived(remoteMessage);
            }
        }
    }
}
