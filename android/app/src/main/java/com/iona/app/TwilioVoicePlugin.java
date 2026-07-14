package com.iona.app;

import android.content.Context;
import android.content.Intent;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import android.content.ComponentName;
import android.net.Uri;
import android.telecom.PhoneAccount;
import android.telecom.PhoneAccountHandle;
import android.telecom.TelecomManager;

import android.Manifest;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import com.google.firebase.messaging.FirebaseMessaging;

import com.twilio.voice.Call;
import com.twilio.voice.CallException;
import com.twilio.voice.CallInvite;
import com.twilio.voice.ConnectOptions;
import com.twilio.voice.RegistrationException;
import com.twilio.voice.RegistrationListener;
import com.twilio.voice.Voice;

import java.util.HashMap;
import java.util.Map;

@CapacitorPlugin(name = "TwilioVoice", permissions = {
    @Permission(strings = {Manifest.permission.RECORD_AUDIO}, alias = "microphone")
})
public class TwilioVoicePlugin extends Plugin {

    static TwilioVoicePlugin instance;
    private Call activeCall;
    // True while a bridge user leg is live — gates the self-managed Telecom call + FGS start
    // so the non-bridge speaker-proof path is never affected.
    private boolean bridgeLegActive = false;

    @Override
    public void load() {
        instance = this;
    }

    // JS passes the access token (fetched from backend); plugin gets FCM token internally
    @PluginMethod
    public void register(PluginCall call) {
        String accessToken = call.getString("accessToken");
        if (accessToken == null || accessToken.isEmpty()) {
            call.reject("accessToken required");
            return;
        }

        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (!task.isSuccessful()) {
                call.reject("FCM token failed: " + task.getException());
                return;
            }
            String fcmToken = task.getResult();
            Log.d("TwilioVoice", "FCM token: " + fcmToken.substring(0, 16) + "...");

            Voice.register(accessToken, Voice.RegistrationChannel.FCM, fcmToken,
                new RegistrationListener() {
                    @Override
                    public void onRegistered(String at, String ft) {
                        Log.d("TwilioVoice", "Registered — ready for incoming FCM calls");
                        call.resolve(new JSObject()
                            .put("ok", true)
                            .put("fcmPrefix", ft.substring(0, 16) + "..."));
                    }

                    @Override
                    public void onError(RegistrationException e, String at, String ft) {
                        Log.e("TwilioVoice", "Registration failed: " + e.getMessage());
                        call.reject("Registration failed: " + e.getMessage());
                    }
                });
        });
    }

    // Outbound native call — no FCM needed, good for bidirectional speaker proof
    @PluginMethod
    public void connectOutbound(PluginCall call) {
        String accessToken = call.getString("accessToken");
        if (accessToken == null || accessToken.isEmpty()) {
            call.reject("accessToken required");
            return;
        }
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphoneGranted");
            return;
        }
        performConnect(call);
    }

    @PermissionCallback
    private void microphoneGranted(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("Microphone permission denied — cannot start call");
            return;
        }
        performConnect(call);
    }

    private void performConnect(PluginCall call) {
        String accessToken    = call.getString("accessToken");
        String conferenceName = call.getString("conferenceName", "speaker-proof-1");
        String contactNumber  = call.getString("contactNumber", "");
        Map<String, String> params = new HashMap<>();
        params.put("conference_name", conferenceName);
        params.put("end_on_exit", call.getString("endOnExit", "true"));
        params.put("bridge", call.getString("bridge", "false"));
        params.put("leg", "user");
        if (!contactNumber.isEmpty()) params.put("contact_number", contactNumber);

        ConnectOptions options = new ConnectOptions.Builder(accessToken)
            .params(params)
            .build();

        // Bridge leg: register this as a self-managed Telecom call. This is what makes the
        // platform treat it as an ongoing call — it shows the system call indicator AND grants
        // the "continuing an ongoing call via ConnectionService" exemption that lets BridgeService
        // start as a foreground service from the background (Android 12+). Best-effort and fully
        // decoupled from audio: a failure here leaves the existing bridge path exactly as before.
        boolean isBridge = "true".equals(call.getString("bridge", "false"));
        if (isBridge) {
            bridgeLegActive = true;
            placeTelecomCall();
        }

        new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
            try {
                activeCall = Voice.connect(getContext(), options, callListener);
                Log.d("TwilioVoice", "Outbound connect initiated — conf=" + conferenceName);
            } catch (SecurityException e) {
                // AppOps denied RECORD_AUDIO at call time (can differ from declared permission state).
                // Report to JS as a recoverable error rather than crashing the main thread.
                Log.e("TwilioVoice", "Voice.connect — RECORD_AUDIO blocked by AppOps: " + e.getMessage());
                notifyListeners("error", new JSObject()
                    .put("error", "microphone_denied")
                    .put("detail", e.getMessage()), true);
            }
        });
        call.resolve(new JSObject().put("ok", true).put("conferenceName", conferenceName));
    }

    // Registers a self-managed PhoneAccount and places a Telecom call representing the user's
    // bridge leg. The actual audio still flows through the Twilio SDK exactly as before — this
    // Telecom call is registration only (CAPABILITY_SELF_MANAGED means the app owns the audio,
    // so Telecom never touches it). What it buys us: the system ongoing-call indicator, raised
    // process priority, and the FGS background-start exemption. Wrapped end to end so any failure
    // degrades to the prior behaviour rather than disturbing the bridge.
    private void placeTelecomCall() {
        try {
            TelecomManager telecom =
                (TelecomManager) getContext().getSystemService(Context.TELECOM_SERVICE);
            if (telecom == null) return;

            PhoneAccountHandle handle = new PhoneAccountHandle(
                new ComponentName(getContext(), ZeroConnectionService.class), "iona-bridge");
            PhoneAccount account = PhoneAccount.builder(handle, "Iona")
                .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
                .build();
            telecom.registerPhoneAccount(account);

            // Drop any stale connection from a previous leg before placing a new one.
            ZeroConnectionService.markDisconnected();

            Bundle extras = new Bundle();
            extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, handle);
            Uri address = Uri.fromParts(PhoneAccount.SCHEME_SIP, "iona-bridge", null);
            telecom.placeCall(address, extras);
            Log.d("TwilioVoice", "Telecom self-managed bridge call placed");
        } catch (SecurityException e) {
            Log.w("TwilioVoice", "Telecom placeCall blocked (MANAGE_OWN_CALLS?): " + e.getMessage());
        } catch (Exception e) {
            Log.w("TwilioVoice", "Telecom placeCall failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void hangup(PluginCall call) {
        if (activeCall != null) {
            activeCall.disconnect();
            activeCall = null;
        }
        bridgeLegActive = false;
        ZeroConnectionService.markDisconnected();
        call.resolve(new JSObject().put("ok", true));
    }

    // Called from JS at the TOP of summonHelp() — before any await — while Activity is still
    // foregrounded. runOnUiThread() ensures startForegroundService() runs on the main thread
    // within milliseconds of the button press, before onStop() can set mAllowStartForeground=false.
    @PluginMethod
    public void startBridgeServiceNow(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                getContext().startForegroundService(new Intent(getContext(), BridgeService.class));
                Log.d("TwilioVoice", "BridgeService started (early, from button press)");
            } catch (Exception e) {
                Log.w("TwilioVoice", "BridgeService early start failed: " + e.getMessage());
            }
        });
        call.resolve(new JSObject().put("ok", true));
    }

    // stopService() has no background restriction — safe to call from anywhere.
    @PluginMethod
    public void stopBridgeService(PluginCall call) {
        getContext().stopService(new Intent(getContext(), BridgeService.class));
        Log.d("TwilioVoice", "stopBridgeService — foreground service stopped");
        call.resolve(new JSObject().put("ok", true));
    }

    // Called by TwilioFirebaseMsgService when a Twilio call invite arrives via FCM
    void onCallInvite(CallInvite invite) {
        Log.d("TwilioVoice", "Incoming call from: " + invite.getFrom() + " — auto-accepting");
        notifyListeners("incoming", new JSObject().put("from", invite.getFrom()), true);
        new Handler(Looper.getMainLooper()).post(() ->
            activeCall = invite.accept(getContext(), callListener)
        );
    }

    private final Call.Listener callListener = new Call.Listener() {
        @Override
        public void onConnectFailure(Call call, CallException error) {
            Log.e("TwilioVoice", "Connect failure: " + error.getMessage());
            notifyListeners("error", new JSObject().put("error", error.getMessage()), true);
        }

        @Override
        public void onRinging(Call call) {
            Log.d("TwilioVoice", "Ringing");
        }

        @Override
        public void onConnected(Call call) {
            activeCall = call;
            Log.d("TwilioVoice", "Connected — routing to speaker");
            notifyListeners("connected", new JSObject().put("from", call.getFrom()), true);
            routeToSpeaker();

            // Bridge leg is now live. Mark the Telecom call active (upgrades the indicator to an
            // ongoing call) and start the foreground service — we are now exempt from the
            // background FGS-start restriction. Both steps are best-effort.
            if (bridgeLegActive) {
                ZeroConnectionService.markActive();
                try {
                    getContext().startForegroundService(new Intent(getContext(), BridgeService.class));
                    Log.d("TwilioVoice", "BridgeService started (onConnected — Telecom-exempt)");
                } catch (Exception e) {
                    Log.w("TwilioVoice", "BridgeService start at onConnected failed: " + e.getMessage());
                }
            }
        }

        @Override
        public void onReconnecting(Call call, CallException error) {}

        @Override
        public void onReconnected(Call call) {}

        @Override
        public void onDisconnected(Call call, CallException error) {
            Log.d("TwilioVoice", "Disconnected");
            activeCall = null;
            bridgeLegActive = false;
            releaseAudio();
            // Clear the Telecom call so the system indicator drops even when backgrounded, then
            // stop the foreground service natively — don't depend on JS (evaluateJavascript
            // delivery is unreliable when the WebView is backgrounded).
            ZeroConnectionService.markDisconnected();
            getContext().stopService(new Intent(getContext(), BridgeService.class));
            JSObject data = new JSObject();
            if (error != null) {
                data.put("error", error.getMessage());
                data.put("involuntary", true);
            }
            notifyListeners("disconnected", data, true);
        }
    };

    private void routeToSpeaker() {
        AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AudioDeviceInfo speaker = null;
            for (AudioDeviceInfo d : audio.getAvailableCommunicationDevices()) {
                if (d.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) {
                    speaker = d;
                    break;
                }
            }
            boolean ok = speaker != null && audio.setCommunicationDevice(speaker);
            Log.d("TwilioVoice", "setCommunicationDevice(speaker)=" + ok + " mode=" + audio.getMode());
            notifyListeners("speaker_result", new JSObject()
                .put("ok", ok)
                .put("mode", audio.getMode())
                .put("api", "31+"), true);
        } else {
            //noinspection deprecation
            audio.setSpeakerphoneOn(true);
            Log.d("TwilioVoice", "setSpeakerphoneOn(true) mode=" + audio.getMode());
            notifyListeners("speaker_result", new JSObject()
                .put("ok", true)
                .put("api", "legacy"), true);
        }
    }

    private void releaseAudio() {
        AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            audio.clearCommunicationDevice();
        } else {
            //noinspection deprecation
            audio.setSpeakerphoneOn(false);
        }
    }
}
