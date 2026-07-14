package com.iona.app;

import android.net.Uri;
import android.telecom.Connection;
import android.telecom.ConnectionRequest;
import android.telecom.ConnectionService;
import android.telecom.DisconnectCause;
import android.telecom.PhoneAccountHandle;
import android.telecom.TelecomManager;

/**
 * Route B ConnectionService.
 *
 * Registered via CAPABILITY_SELF_MANAGED PhoneAccount. TelecomManager calls
 * onCreateOutgoingConnection when placeCall() is invoked from ZeroCallPlugin.
 *
 * Spike finding: self-managed = YOU own the call transport. This stub creates
 * a ZeroConnection and immediately sets STATE_DIALING, but the carrier PSTN
 * call does NOT happen automatically. To place a real carrier call this way
 * you would need to be the default dialer (InCallService) or use a VoIP SDK.
 *
 * What this IS useful for: if Zero later uses Twilio Client SDK on-device,
 * wrap the Twilio call in a ZeroConnection and drive its state from Twilio
 * event callbacks — you get the full lifecycle (STATE_ACTIVE = answered) and
 * clean speaker routing without any timing heuristics.
 */
public class ZeroConnectionService extends ConnectionService {

    // Holds the live self-managed connection for the current bridge leg so TwilioVoicePlugin can
    // drive its lifecycle from the Twilio call callbacks. This Telecom integration is what
    // provides the system call indicator and the FGS background-start exemption — the Twilio SDK
    // continues to own the audio transport (self-managed = the app owns audio).
    static ZeroConnection bridgeConnection;
    private static boolean pendingActive;

    @Override
    public Connection onCreateOutgoingConnection(
            PhoneAccountHandle connectionManagerPhoneAccount,
            ConnectionRequest request) {

        ZeroConnection conn = new ZeroConnection();
        conn.setConnectionProperties(Connection.PROPERTY_SELF_MANAGED);
        Uri address = request.getAddress();
        if (address != null) conn.setAddress(address, TelecomManager.PRESENTATION_ALLOWED);
        conn.setCallerDisplayName("Iona", TelecomManager.PRESENTATION_ALLOWED);

        bridgeConnection = conn;
        // The Twilio onConnected callback can beat this factory callback; honour a pending
        // active request so the call doesn't get stuck in "dialing".
        if (pendingActive) {
            conn.setActive();
            conn.forceSpeaker(); // align Telecom route with Twilio (speaker, not earpiece)
            pendingActive = false;
        } else {
            conn.setDialing();
        }
        return conn;
    }

    /** Twilio user leg connected — upgrade to active (or arm it if the connection has not been
     *  created yet, due to callback ordering). Called from TwilioVoicePlugin. */
    static void markActive() {
        if (bridgeConnection != null) {
            try {
                bridgeConnection.setActive();
                bridgeConnection.forceSpeaker(); // align Telecom route with Twilio (speaker, not earpiece)
            } catch (Exception ignored) {}
        } else {
            pendingActive = true;
        }
    }

    /** Twilio user leg ended (or teardown) — disconnect and clear the Telecom call so the
     *  system indicator drops. Idempotent. Called from TwilioVoicePlugin. */
    static void markDisconnected() {
        pendingActive = false;
        ZeroConnection c = bridgeConnection;
        bridgeConnection = null;
        if (c != null) {
            try {
                c.setDisconnected(new DisconnectCause(DisconnectCause.LOCAL));
                c.destroy();
            } catch (Exception ignored) {}
        }
    }

    @Override
    public void onCreateOutgoingConnectionFailed(
            PhoneAccountHandle connectionManagerPhoneAccount,
            ConnectionRequest request) {
        if (ZeroCallPlugin.instance != null) {
            ZeroCallPlugin.instance.onConnectionState("failed", "create_failed");
        }
    }
}
