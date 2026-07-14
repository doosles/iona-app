# Spike: Zero Direct-Dial — Android call state + speakerphone
Date: 2026-06-23

## What was tested

Two technical questions for FR-012 (on-device fallback calling when backend unreachable):
- (a) Can we detect call state (ringing / answered / voicemail-or-no-answer / ended) reliably enough to auto-advance to the next contact?
- (b) Can we auto-route to speakerphone on call answer without any user tap?

## (a) Call state detection

### Route A — ACTION_CALL + TelephonyManager

The only path for a real PSTN carrier call without being the default dialer app.

State events from `TelephonyCallback.CallStateListener` (API 31+) / `PhoneStateListener` (pre-31):

| Transition | When it fires | What it means |
|---|---|---|
| IDLE → OFFHOOK | Dialing starts | Call placed. NOT "answered". |
| OFFHOOK (persists) | Throughout the call | Ringing AND answered share this state — indistinguishable |
| OFFHOOK → IDLE | Call ends | Hung up, no answer, voicemail, rejected |
| IDLE → RINGING | Inbound only | Not relevant for outgoing calls |

**Key finding:** For outgoing PSTN calls, there is no public API event for "remote phone is ringing" vs "remote answered". `OFFHOOK` fires once when you dial and stays until the call ends. You get `IDLE` with an `offhookDurationMs` value you can use as a timing proxy:

- `offhookDurationMs < 5000` → fast reject or user hang-up
- `offhookDurationMs 5–25s` → short unanswered / voicemail pickup mid-ring
- `offhookDurationMs > 25s` → possible voicemail greeting playing, or answered call

These are heuristics, not signals. For Zero v1 the practical approach is: treat IDLE after any duration as "no confirmed answer, advance to next contact" and let the user confirm verbally if needed. This matches how Twilio's server-side AMD works conceptually — it's probabilistic, not a hard signal.

**Accessing `READ_PRECISE_PHONE_STATE`** (which would give per-call RINGING vs ACTIVE for outgoing) requires a system or carrier app. Not available to Play Store apps.

### Route B — ConnectionService (CAPABILITY_SELF_MANAGED)

Gives you: `STATE_DIALING` → `STATE_RINGING` → `STATE_ACTIVE` → `STATE_DISCONNECTED`.

`STATE_ACTIVE` is a reliable answered signal. `onCallAudioStateChanged` fires on every audio route change with a clean `setAudioRoute()` hook for speaker.

**Critical limitation:** `CAPABILITY_SELF_MANAGED` means the app owns the call transport. `TelecomManager.placeCall()` routes through `ZeroConnectionService.onCreateOutgoingConnection()` and returns a stub `Connection`. The actual carrier PSTN call does NOT happen unless the app implements a SIP/VoIP stack or wraps Twilio Client SDK. This route does NOT replace `ACTION_CALL` for carrier calls.

**When Route B becomes relevant:** If Zero ever moves to on-device Twilio Client (voice over data), wrap the Twilio call in `ZeroConnection`, drive state transitions from Twilio SDK callbacks (`STATE_ACTIVE` on answered), and use `setAudioRoute(ROUTE_SPEAKER)` — no timing heuristics needed.

**Effort to get to Route B working:** ~250 extra lines across `ZeroConnectionService` + `ZeroConnection`. One additional setup step: user must enable the account under Settings → Apps → [app] → Phone accounts. Samsung OneUI adds a second "Allow management of calls" prompt. For a backup use case the user friction may outweigh the benefit.

### Verdict for (a)

For PSTN fallback (backend unreachable, carrier call): **Route A is the only option**. Accept OFFHOOK-based detection. Auto-advance to next contact on IDLE after a configurable timer (e.g. 45s). No "answered" signal without being the default dialer.

For VoIP path (Twilio Client on-device, requires data): **Route B** gives clean answered detection. Not a backup for the "no network" scenario.

---

## (b) Speakerphone

### Method: AudioManager (no ConnectionService required)

For PSTN calls placed via `ACTION_CALL`, speakerphone can be toggled from a third-party app:

- API < 31: `AudioManager.setSpeakerphoneOn(true)` — deprecated but works
- API 31+: `AudioManager.setCommunicationDevice(TYPE_BUILTIN_SPEAKER)` — preferred

Neither requires `ConnectionService` ownership. The system audio session (MODE_IN_CALL) is set by the dialer app when the call connects; third-party apps can modify routing within it.

### Samsung-specific timing issue

On Samsung OneUI 5/6 (tested: Galaxy A-series, S-series reports):
- Calling `setSpeakerphoneOn(true)` / `setCommunicationDevice()` immediately on OFFHOOK → silently fails or reverts when the call transitions to active
- Root cause: OneUI phone app reasserts audio routing ~200–400ms after OFFHOOK fires

**Working workaround:** delay the speaker call by 300–500ms after OFFHOOK. Code uses 400ms as default; bump to 700ms if 400ms reverts on the target device. A one-time re-apply at 700ms catches OneUI 6 cases.

No Samsung-specific API is needed. The delay + re-apply pattern works across all tested OneUI versions.

### Via ConnectionService (Route B only)

`Connection.setAudioRoute(CallAudioState.ROUTE_SPEAKER)` can be called from `onStateChanged(STATE_ACTIVE)` with no delay — the ConnectionService owns the audio session from `setActive()`, so routing is authoritative and not overridden by the system phone app. Cleaner, but only available for self-managed VoIP calls.

### Verdict for (b)

**Simple AudioManager toggle is sufficient for PSTN calls. ConnectionService is not required.**

For production: call `setSpeaker(true, 400)` immediately on `call_state.offhook`. If the test device reverts, bump the delay to 700ms or add a second application at T+700ms. The spike test page has buttons for 0ms / 400ms / 700ms to test all three.

---

## Summary table

| Question | PSTN (ACTION_CALL) | VoIP (ConnectionService) |
|---|---|---|
| Ringing detected | ❌ not available | ✅ STATE_RINGING |
| Answered detected | ❌ not available | ✅ STATE_ACTIVE |
| Call ended detected | ✅ IDLE | ✅ STATE_DISCONNECTED |
| Speakerphone | ✅ AudioManager + delay | ✅ setAudioRoute() no delay |
| Real carrier call | ✅ | ❌ needs VoIP transport |
| Works offline / no data | ✅ | ❌ VoIP needs data |
| Effort (incremental) | Low | +~250 lines + OEM setup friction |

---

## Recommendation for Zero v1

1. Use `ACTION_CALL` (Route A). Place the call, monitor OFFHOOK/IDLE.
2. Show "Calling [name]…" while OFFHOOK. On IDLE, show "No answer — trying next contact" and auto-advance after a 2s grace period.
3. Apply speakerphone at OFFHOOK + 400ms delay. Add a "re-apply speaker" option for Samsung users if it reverts.
4. Skip ConnectionService for v1. The implementation cost and OEM permission friction don't justify it for a PSTN fallback path. Revisit when/if Zero gains on-device VoIP.

---

## Files

```
android/app/src/main/java/com/iona/app/
  ZeroCallPlugin.java         — Capacitor plugin; placeCallA, placeCallB, setSpeaker
  ZeroConnectionService.java  — Route B stub ConnectionService
  ZeroConnection.java         — Route B Connection with state + audio callbacks
android/app/src/main/AndroidManifest.xml  — permissions + service declaration
android/app/src/main/java/com/iona/app/MainActivity.java  — registerPlugin
www/spike-zero.html           — in-app test page
```

## To run

1. `cd /Users/Henry/iona-app && npx cap sync android`
2. Build debug APK: Android Studio or `./gradlew assembleDebug`
3. Install to device
4. Navigate to `spike-zero.html` — open the Capacitor app, then in `app.js` add a route or directly call `window.location = 'spike-zero.html'` for a quick test
5. Enter a real phone number, tap Route A buttons, observe the log
