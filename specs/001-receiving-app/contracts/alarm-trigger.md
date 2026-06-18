# Contract: Alarm Trigger

**Feature**: 001-receiving-app
**Created**: 2026-06-18
**Amended**: 2026-06-18 — cancellation window added
**Covers**: The full sequence from alarm button tap through the cancellation window,
backend call, active-escalation state, and terminal-state entry.

---

## Overview

When the user activates the alarm, the sequence is:

1. **Immediate local feedback** — tone fires, active-escalation screen appears with
   a visible 10-second countdown and a cancel button.
2. **Cancellation window** — during the countdown, a single tap cancels the alarm:
   tone stops, state resets to idle, no backend call is made.
3. **Escalation commit** — if the countdown reaches zero without cancellation, the
   cancel button disappears and `POST /pwa-respond` fires. From this point, the
   escalation is live and cannot be cancelled from the app.

The cancellation window is the friction. There is no confirmation dialog on the
initial tap, and no hold-to-confirm. The window itself gives the user 10 seconds to
change their mind before the backend is involved.

Once the escalation commits, this path carries the highest reliability bar in the
product (constitution §I.4). Every failure from that point is loud and visible.
There is no silent path.

---

## Trigger

**Who**: Signed-in user who has completed push registration (FCM token present).

**What**: User taps the alarm button on the home screen.

**Preconditions**:
- `escalation_state` in Preferences is `"idle"`. (Button is disabled in any other state.)
- `fcm_token` in Preferences is non-empty.

---

## Step 1 — Immediate Local Feedback (≤ 1 second, before countdown)

Fires synchronously on button tap.

**Audio**:
- Play alarm tone via Web Audio API (`AudioContext` + `OscillatorNode`).
- Fires on the tap event — user gesture satisfies AudioContext autoplay requirement.
- Tone character (frequency, duration, pulse pattern) is a build-time design decision.
- Must be audible at the device's current media volume. No volume check or adjustment.
- The tone plays as "armed" feedback — it communicates that something is happening,
  before the countdown has elapsed and before any backend call is made.

**Visual**:
- Transition immediately to the active-escalation screen.
- Screen displays:
  - A clear message that an alarm is about to be raised (attempt language — no
    "emergency", "alert", "SOS", or clinical language).
  - A **visible countdown** — a live number (e.g. "10… 9… 8…") or a draining
    progress indicator. The countdown must be visible to the user; a hidden timer
    is not acceptable.
  - A **cancel button** — prominently placed, single-tap to cancel. No hold
    gesture, no confirmation dialog. The window is the friction.

**State**:
- `escalation_state` in Preferences → `"active"` (set immediately — ensures app
  relaunch during the window returns to this screen, not home).
- `KeepAwake.keepAwake()`.
- Alarm button on home screen is now unavailable (state is no longer `"idle"`).

**Countdown duration**:
```js
const ALARM_CANCEL_WINDOW_SECONDS = 10; // default fallback — do not hardcode elsewhere

function getCancelWindowSeconds(memberConfig) {
  return memberConfig?.alarmCancelWindow ?? ALARM_CANCEL_WINDOW_SECONDS;
}
```
The constant is the fallback. At runtime, the app reads the countdown duration from
the member's configuration object (fetched post-login and stored with the session).
If the member has no configured value, the constant is used. The alarm logic receives
only the resolved number — it never reads the constant or the config directly.

This separation is intentional: in v2, when this becomes a user-configurable setting
stored on the member's profile, only `getCancelWindowSeconds()` changes — the alarm
logic is untouched.

---

## Step 2a — Cancellation (user taps cancel before countdown reaches zero)

Fires if the cancel button is tapped at any point while the countdown is running.

**Actions** (in order):
1. Stop the alarm tone immediately (`oscillator.stop()` / `AudioContext.close()`).
2. `escalation_state` in Preferences → `"idle"`.
3. `KeepAwake.allowSleep()`.
4. Transition back to the home screen.
5. No backend call is made. No network request of any kind.

**Result**: From the backend's perspective, nothing happened. The escalation was
never initiated.

---

## Step 2b — Countdown Expires (no cancellation)

Fires when the countdown reaches zero without a cancel tap.

**Actions** (in order):
1. Remove the cancel button from the screen immediately. It must not be tappable
   after zero.
2. Update the screen to the committed active-escalation state — copy shifts from
   "about to contact" to "contacting your people now" (attempt language).
3. Proceed to Step 3 (backend call). There is no cancel from this point.

---

## Step 3 — Backend Call (post-countdown)

**Request**:
```
POST /pwa-respond
Content-Type: application/json

{
  "fcm_token": "<value from Preferences['fcm_token']>",
  "response": "alert"
}
```

`"alert"` is an internal backend enum value — not user-facing copy, not governed
by §II vocabulary rules.

**Expected response**: `HTTP 200`. Response body not consumed by the app.

---

## Step 4 — Escalation Complete Signal

The backend signals cycle completion via FCM push notification.

**Expected payload** (verify `data.type` field name against `pwa_sender.py` at
build time):
```json
{
  "data": {
    "type": "escalation_complete"
  }
}
```

**App action on receiving this signal while `escalation_state` is `"active"`**:
1. `escalation_state` → `"terminal"`.
2. `KeepAwake.allowSleep()`.
3. Transition to terminal-state screen.

**Terminal state screen**: Copy requires owner review before implementation —
see carry-forward note from data model review. Must be Iona-voice, vocabulary-
compliant, warm and honest, and must not imply outcome.

---

## Error Cases

All failures after countdown expiry MUST be loud and visible (constitution §I.4).
Failures during the cancellation window use the same rules.

### FCM token missing at tap time

**Condition**: `Preferences['fcm_token']` is empty or absent.

**Response**:
- Do not proceed. Do not play tone. Do not transition screen.
- Show a clear, non-alarming on-screen message: device is not fully registered,
  alarm cannot fire in this state.
- `escalation_state` remains `"idle"`.

### Backend call fails after countdown (network error or non-200)

**Condition**: `POST /pwa-respond` throws or returns non-200, after countdown expired.

**Response**:
- Local feedback has already committed — do not undo it.
- Show a visible warning on the active-escalation screen: backend could not be
  reached, escalation may not have started.
- Offer a retry action for the backend call.
- Do not transition back to idle. User is in an alarm situation; stay on the active
  screen with warning + retry visible.

### Escalation complete signal not received

**Condition**: No `escalation_complete` FCM payload arrives after backend call succeeds.

**Response**:
- Active screen persists (correct — do not auto-dismiss).
- No silent timeout to idle.
- Manual close available after a defined timeout (build-time decision).
- On manual close: `state → "terminal"`, `KeepAwake.allowSleep()`.

### Audio fails during armed phase

**Condition**: `AudioContext` or oscillator throws during tone playback.

**Response**:
- Do not block the alarm flow. Proceed with countdown and visual feedback.
- Log to console. Do not surface the audio failure to the user.
- If cancel is tapped, skip audio stop (already failed).

---

## Full Sequence Diagram

```
User taps alarm button
        │
        ▼
[Precondition check: escalation_state=idle, fcm_token present]
        │
        ├── FCM token missing? ──► Show error message. STOP. State stays idle.
        │
        ▼
Play alarm tone (armed feedback)
Transition to active-escalation screen with countdown + cancel button
Set escalation_state → "active"
KeepAwake.keepAwake()
        │
        ├── User taps cancel ──► Stop tone
        │   (countdown > 0)       Set state → "idle"
        │                         KeepAwake.allowSleep()
        │                         Return to home screen
        │                         No backend call. DONE.
        │
        ▼
Countdown reaches zero
Remove cancel button
Update screen copy to committed state
        │
        ▼
POST /pwa-respond { fcm_token, response: "alert" }
        │
        ├── Network error / non-200? ──► Show warning + retry on active screen
        │
        ▼
Await FCM escalation_complete signal
        │
        ├── Signal received ──► State → "terminal"
        │                       KeepAwake.allowSleep()
        │                       Show terminal screen (copy: owner review required)
        │
        └── Signal not received ──► Active screen persists
                                    Manual close available after timeout
                                    On close: state → "terminal"
                                    KeepAwake.allowSleep()
```

---

## Build-Time Notes

- `memberConfig` MUST be fetched and held in memory at login or home-screen load —
  never fetched on alarm tap. The alarm path is network-free from tap through the
  entire cancel window. `getCancelWindowSeconds()` receives already-loaded config;
  it never triggers a fetch.
- `ALARM_CANCEL_WINDOW_SECONDS = 10` — named constant, top of module. This is the
  fallback only. The resolved value always comes from `getCancelWindowSeconds(memberConfig)`.
- `getCancelWindowSeconds(memberConfig)` — reads `memberConfig.alarmCancelWindow` if
  present, falls back to the constant. The alarm logic receives only the resolved number.
  In v2, wiring the user's chosen value requires updating only this function — the alarm
  flow is untouched.
- **v2 note**: The countdown duration becomes a user-configurable setting stored on the
  member's profile. The constant and config-fetch pattern above are designed to receive
  that value without touching the alarm logic. The default of 10 seconds must remain
  clearly documented as the fallback when no user preference is set.
- Alarm button touch target: minimum 48×48 dp (Android accessibility).
- Cancel button touch target: minimum 48×48 dp. Must be easy to reach one-handed.
- Countdown display is visible — live number or draining indicator. Hidden timer
  is not acceptable.
- **No confirmation dialog on initial tap** and **no hold gesture on cancel** —
  the window is the friction.
- No backend cancel endpoint is needed. Cancellation is entirely pre-escalation.
- Terminal screen copy requires owner review before implementation.
- Verify `data.type` FCM payload field name against `pwa_sender.py` at build time.
