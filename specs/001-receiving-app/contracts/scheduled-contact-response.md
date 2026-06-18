# Contract: Scheduled Contact Response

**Feature**: 001-receiving-app
**Created**: 2026-06-18
**Covers**: Receiving a scheduled contact from Iona (push notification in any app
state) and the user's in-app response — from notification display through to the
backend POST and confirmation.

---

## Overview

Iona sends a scheduled contact to the user's device via FCM push notification. The
app receives it, surfaces it to the user, and allows them to respond. The backend
registers the response and updates the schedule accordingly.

This is the proactive path — Iona initiates, the user receives and responds. It is
first-class alongside the alarm (constitution §I.2). Reliability here is a
disappointment failure, not a safety failure, but the response flow must still work
cleanly and give the user clear feedback.

---

## App States and Notification Delivery

The FCM notification arrives differently depending on the app's state. The contract
must handle all three.

### State A — App closed or backgrounded

FCM delivers a **notification message** (with `notification` key in payload). The
Android OS shows it in the system notification tray without the app running.

- When the user taps the notification: `pushNotificationActionPerformed` fires,
  the app opens, and the app routes to the contact-response screen based on
  `action.notification.data.type === 'scheduled_contact'`.
- When the user does not tap: the notification sits in the tray. No in-app action
  is taken.

### State B — App in foreground

FCM delivers to the `pushNotificationReceived` listener. The OS does not show a
system notification. The app must surface the contact in-app directly — show the
contact-response screen (or an in-app banner that leads to it).

### State C — App launched from cold via notification tap

Identical to State A tap handling. The `pushNotificationActionPerformed` listener
fires on app ready; routing logic applies.

---

## Notification Payload

The FCM payload sent by the backend (`pwa_sender.py`) must contain a `data` object
that the app reads for routing. The exact field names must be verified against
`pwa_sender.py` at build time.

**Expected payload structure**:
```json
{
  "notification": {
    "title": "<contact title — set by backend>",
    "body": "<contact message — set by backend>"
  },
  "data": {
    "type": "scheduled_contact"
  }
}
```

**Routing key**: `data.type === 'scheduled_contact'` — routes the notification tap
to the contact-response screen.

**Vocabulary**: The `notification.title` and `notification.body` values are set by
the backend (`pwa_sender.py`). They must comply with §II vocabulary rules. Verify
at build time that no banned terms appear in the backend's notification templates.
The app itself does not author these strings — but it is responsible for not
re-displaying them in contexts that would violate §II.

---

## Contact Response Screen

Shown when a scheduled contact notification is received (in any app state).

**Screen content**:
- The contact message from Iona (from `notification.body`, or a friendly default
  if body is absent).
- A response button. Button copy must be vocabulary-compliant and Iona-voice:
  - No "okay" (§II — banned in outbound message strings; also unsuitable as a
    button label for a presence-first product).
  - Suggested direction: warm, first-person acknowledgement. E.g. "I'm here",
    "All good", "Got it". Exact copy is a build-time design decision — stop and
    confirm copy with owner before implementation.
- The screen must not auto-dismiss without user interaction.

---

## Step 1 — User Taps Response Button

**Preconditions**:
- `Preferences['fcm_token']` is non-empty.
- User is on the contact-response screen.

**Immediate feedback**: Show a loading or "sending…" state on the button to
confirm the tap was registered. The user must never be left wondering if their
tap was received.

---

## Step 2 — Backend Call

```
POST /pwa-respond
Content-Type: application/json

{
  "fcm_token": "<Preferences['fcm_token']>",
  "response": "<response_value>"
}
```

**Response value — build-time verification required**:

The existing backend accepts `"okay"` as the positive response value (the old PWA
used this). `"okay"` is an internal backend enum string — it is not user-facing
copy and the §II ban on "okay" in outbound message strings does not apply to an
API body parameter.

However, at build time, confirm whether `"okay"` remains the correct value or
whether the backend has been updated to accept an alternative (e.g. `"responded"`).
Do not change the backend value without verifying the full response-routing logic in
`reply_to_airtable_webhook.py` — changing an enum value the backend pattern-matches
on is a breaking change.

**Do not invent a new response value.** Use whatever the backend currently accepts
for a positive response. Verify, then wire.

**Expected response**: `HTTP 200`. Response body may contain a confirmation message
(e.g. next scheduled contact time) — surface it if present, ignore gracefully if not.

---

## Step 3 — Confirmation

On `HTTP 200`:
- Replace the response button with a clear confirmation: the contact has been
  received and the response registered.
- If the response body includes the next scheduled contact time, display it (format
  naturally — no raw field values, no system labels).
- The user can then navigate away or close the screen.

---

## Error Cases

### FCM token missing when response button tapped

**Condition**: `Preferences['fcm_token']` is absent.

**Response**:
- Do not attempt the POST.
- Show a clear, non-alarming message: the response could not be sent, and the user
  may want to restart the app.
- This should be rare — token should have been registered at login. If it happens,
  it indicates a registration failure that was not surfaced at the time.

### Backend POST fails (network error or non-200)

**Condition**: Network unavailable or backend returns non-200.

**Response**:
- Show a clear, non-alarming error on the response screen: "We couldn't send your
  response — please try again."
- Re-enable the response button for retry.
- Do not dismiss the screen. Do not leave the user with no action available.

### Notification received but app cannot determine `data.type`

**Condition**: Notification arrives with no `data` object, or `data.type` is absent
or unrecognised.

**Response**:
- Do not crash or show a blank screen.
- If app is in foreground: log and ignore (do not surface an unknown notification
  type to the user).
- If notification is tapped from background: open the app to the home screen as a
  safe default. Do not attempt to route to a specific screen without a known type.

---

## Full Sequence

```
FCM notification arrives
        │
        ├── App backgrounded/closed:
        │   OS shows notification in tray
        │   User taps → pushNotificationActionPerformed fires
        │   data.type === 'scheduled_contact'? → show contact-response screen
        │   data.type unknown? → open to home screen
        │
        ├── App in foreground:
        │   pushNotificationReceived fires
        │   data.type === 'scheduled_contact'? → show contact-response screen in-app
        │
        ▼
Contact-response screen shown
  [Contact message displayed]
  [Response button — copy confirmed with owner before implementation]
        │
        ├── FCM token missing? → non-alarming error, no POST
        │
        ▼
User taps response button
Button shows loading/sending state
        │
        ▼
POST /pwa-respond { fcm_token, response: "<confirmed backend value>" }
        │
        ├── Network error / non-200? → non-alarming error, retry button re-enabled
        │
        ▼
HTTP 200 received
Show confirmation — contact received
Display next contact time if present in response body
Screen remains until user navigates away
```

---

## Build-Time Notes

- **Verify `data.type` field name** in the FCM payload against `pwa_sender.py`
  before wiring routing logic. The field may differ from `'type'`.
- **Verify the positive response value** (`"okay"` or alternative) in
  `reply_to_airtable_webhook.py` before wiring the POST. Do not change the backend
  enum without checking the full routing logic first.
- **Response button copy requires owner review** before implementation. Direction:
  warm, first-person, Iona-voice. No "okay". Confirm the exact label before writing
  it into the UI.
- **Notification title and body are authored by the backend** (`pwa_sender.py`).
  Verify at build time that they comply with §II vocabulary. The app displays them
  but does not write them.
- The contact-response screen must not auto-dismiss. The user must explicitly confirm
  or navigate away — a missed tap must not silently count as a non-response.
- No "missed contact" state is handled by the app. If the user does not respond, the
  backend handles the consequence. The app's job is to make responding easy when the
  notification is seen.
