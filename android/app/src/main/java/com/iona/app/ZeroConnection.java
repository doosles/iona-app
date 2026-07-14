package com.iona.app;

import android.telecom.CallAudioState;
import android.telecom.Connection;
import android.telecom.DisconnectCause;

import com.getcapacitor.JSObject;

/**
 * Route B Connection implementation.
 *
 * State machine: DIALING → RINGING → ACTIVE → DISCONNECTED
 *   ACTIVE = remote answered (this is the "answered" signal missing from Route A).
 *
 * In a VoIP implementation you drive these transitions from SDK callbacks:
 *   SIP 180 Ringing  → setRinging()
 *   SIP 200 OK       → setActive()
 *   BYE / error      → setDisconnected(cause); destroy()
 *
 * Audio routing: onCallAudioStateChanged fires whenever Telecom changes the
 * audio route (earpiece ↔ speaker ↔ bluetooth). Use setAudioRoute() here
 * instead of AudioManager — it's the authoritative API when you own the call.
 * No timing delay needed; the ConnectionService owns the audio session from
 * the moment setActive() is called.
 */
public class ZeroConnection extends Connection {

    @Override
    public void onStateChanged(int state) {
        super.onStateChanged(state);
        if (ZeroCallPlugin.instance == null) return;

        String label;
        switch (state) {
            case STATE_DIALING:      label = "dialing";      break;
            case STATE_RINGING:      label = "ringing";      break;
            case STATE_ACTIVE:       label = "active";       break; // ← ANSWERED
            case STATE_HOLDING:      label = "holding";      break;
            case STATE_DISCONNECTED: label = "disconnected"; break;
            default:                 label = "state_" + state;
        }

        ZeroCallPlugin.instance.onConnectionState(label, null);
    }

    @Override
    public void onDisconnect() {
        setDisconnected(new DisconnectCause(DisconnectCause.LOCAL));
        destroy();
    }

    @Override
    public void onAbort() {
        setDisconnected(new DisconnectCause(DisconnectCause.UNKNOWN));
        destroy();
    }

    @Override
    public void onCallAudioStateChanged(CallAudioState state) {
        // The bridge is a hands-free emergency call — Twilio routes its audio to the speaker.
        // A self-managed Telecom call otherwise defaults to EARPIECE, which fights Twilio's
        // routing and makes the call very quiet. Keep Telecom pinned to SPEAKER so the two
        // layers agree. Guarded so we don't re-assert once already on speaker (setAudioRoute
        // re-enters this callback).
        if ((state.getSupportedRouteMask() & CallAudioState.ROUTE_SPEAKER) != 0
                && state.getRoute() != CallAudioState.ROUTE_SPEAKER) {
            setAudioRoute(CallAudioState.ROUTE_SPEAKER);
            return;
        }
        if (ZeroCallPlugin.instance == null) return;
        ZeroCallPlugin.instance.emit("audio_route",
            new JSObject()
                .put("route", state.getRoute())
                .put("isSpeaker", state.getRoute() == CallAudioState.ROUTE_SPEAKER)
                .put("isEarpiece", state.getRoute() == CallAudioState.ROUTE_EARPIECE)
                .put("isBluetooth", state.getRoute() == CallAudioState.ROUTE_BLUETOOTH));
    }

    /** Force speaker from plugin; only valid after setActive(). */
    void forceSpeaker() {
        setAudioRoute(CallAudioState.ROUTE_SPEAKER);
    }
}
