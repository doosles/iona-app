# Research: Iona App — The Receiving App (Product A)

**Feature**: 001-receiving-app
**Created**: 2026-06-18
**Status**: Complete — all unknowns resolved

---

## 1. Auth: Memberstack Passwordless in Capacitor WebView

**Decision**: Use Memberstack DOM package (`$memberstackDom`) loaded via script tag in
`www/index.html`, calling `sendMemberLoginPasswordlessEmail({ email })` and
`loginMemberPasswordless({ email, passwordlessToken })` from `app.js`.

**Rationale**: Confirmed working in auth spike (June 2026) on real Android hardware.
Session and cookie persist across app restarts — the Capacitor WebView preserves
localStorage/cookie storage identically to a browser. The Memberstack DOM package is
the correct integration path for passwordless from a non-Webflow JS context.

**Alternatives considered**:
- Firebase Auth — rejected. Memberstack is the existing identity system. Two identity
  systems would mean two accounts, breaking the "one identity" principle.
- OAuth/redirect flow — not available for Memberstack passwordless; code entry is
  Memberstack's deliberate choice for multi-device security.

---

## 2. Push Notifications: @capacitor/push-notifications

**Decision**: Use `@capacitor/push-notifications` (Capacitor v8 official plugin) for
FCM integration on Android. This plugin handles permission requests, token registration,
and notification delivery in foreground, background, and closed states via native code.

**Key API surface**:
```js
import { PushNotifications } from '@capacitor/push-notifications';

// Request permission (Android 13+ requires explicit request)
await PushNotifications.requestPermissions();
await PushNotifications.register();

// Get FCM token (fires after register())
PushNotifications.addListener('registration', ({ value }) => {
  // value is the FCM device token — POST to /register-token
});

// Handle notification received in foreground
PushNotifications.addListener('pushNotificationReceived', notification => {
  // Show in-app notification UI
});

// Handle notification tap (background/closed)
PushNotifications.addListener('pushNotificationActionPerformed', action => {
  // Route to correct screen based on action.notification.data
});
```

**AndroidManifest.xml**: The `@capacitor/push-notifications` plugin automatically adds
the required FCM receiver and permissions via Capacitor sync. Google Services JSON must
be present at `android/app/google-services.json` (download from Firebase Console).

**Rationale**: This is the correct fix for the old PWA's token fragility. The web Push
API requires service workers and HTTPS, is unreliable on Android Chrome, and cannot
obtain an FCM token before the user is known. The native plugin runs in the Android
process, gets the FCM token reliably, and is called post-login when the member is
identified.

**Alternatives considered**:
- Web Push API + service worker — rejected. This is exactly what the old PWA used and
  what caused the install-time token problem. Not available in Capacitor WebView context
  in the same way; native plugin is the Capacitor-idiomatic solution.

---

## 3. Device Token Registration: Existing `/register-token` Endpoint

**Decision**: After Memberstack login, retrieve the FCM device token via the push plugin
and POST it to the existing `/register-token` endpoint on the backend.

**Endpoint (already exists, no new backend needed)**:
```
POST /register-token
Body: { "token": "<FCM_DEVICE_TOKEN>", "member_id": "<AIRTABLE_TABLE1_RECORD_ID>" }
```

**Source**: `reply_to_airtable_webhook.py`, `_handle_pwa_register_token()`, line 644.
This endpoint already stores the FCM token against the user's Table 1 (service user)
record in Airtable. No backend changes required.

**One item to verify at build time**: The `member_id` field requires the Airtable
Table 1 record ID, not the Memberstack member ID. The app must retrieve this from the
Memberstack member object after login. The most likely location is
`member.data.customFields['airtable-record-id']` (or similar field name — the exact
Memberstack custom field name must be confirmed by reading a live member object at
build time). This is a low-risk lookup: the field exists (the PWA used it), the exact
name needs a one-time check.

---

## 4. Alarm Trigger: Existing `/pwa-respond` Endpoint

**Decision**: The in-app alarm button POSTs to the existing `/pwa-respond` endpoint
with `response: "alert"`. No new backend endpoint required.

**Endpoint (already exists)**:
```
POST /pwa-respond
Body: { "fcm_token": "<FCM_DEVICE_TOKEN>", "response": "alert" }
```

**Source**: `reply_to_airtable_webhook.py`, `_handle_pwa_respond()`, line 665.
This triggers `run_escalation(..., trigger="user_alert")` and `alert_operators(...)`.
The FCM token is used to look up the service user record. The app must have the FCM
token available at alarm-trigger time (stored in Preferences post-registration).

**Note on vocabulary**: `"alert"` is a backend enum value sent in an API body — it is
not user-facing copy and is not governed by the §II vocabulary rules. The same endpoint
accepts `"okay"` for a positive response to a scheduled contact — likewise an internal
value, not displayed text.

**Alternatives considered**: A Memberstack-JWT-authenticated new endpoint — rejected.
The existing endpoint is proven, already handles escalation, and requires no new work.
The FCM token as user identifier is the established pattern in this backend.

---

## 5. Scheduled Contact Response: Existing `/pwa-respond` Endpoint

**Decision**: The same `/pwa-respond` endpoint handles both alarm triggers (`"alert"`)
and positive responses to scheduled contacts. For a scheduled contact response, the
app POSTs:
```
POST /pwa-respond
Body: { "fcm_token": "<FCM_DEVICE_TOKEN>", "response": "responded" }
```

**Note**: The exact response value for a positive scheduled-contact acknowledgement
should be confirmed against the backend at build time — the existing PWA used `"okay"`,
but this may need to be updated to a non-banned value if the backend response-routing
logic allows it. (The ban is on user-facing copy; the internal value is a separate
question for build time.)

---

## 6. Audio Signal on Alarm Activation

**Decision**: Use the Web Audio API (`AudioContext` + `OscillatorNode`) to generate
a tone directly in JavaScript, called synchronously at the moment the alarm button is
tapped. No native plugin required.

**Implementation pattern**:
```js
function playAlarmTone() {
  const ctx = new AudioContext();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(880, ctx.currentTime);
  gain.gain.setValueAtTime(0.8, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
  oscillator.start();
  oscillator.stop(ctx.currentTime + 1.5);
}
```

**Rationale**: The Web Audio API is available in the Capacitor WebView (it is a real
Chromium-based WebView). Because the tone is triggered by a direct user tap on the
alarm button, the `AudioContext` will not be blocked by autoplay policy — user gesture
is satisfied. This produces audio at the device's current media volume without requiring
a native plugin.

**Open at build time**: The exact tone frequency, duration, and character (e.g. two
pulses vs. one sustained tone) is a design decision. The pattern above is the correct
mechanism; the UX specifics are build-time decisions.

**Alternatives considered**:
- `@capacitor/native-audio` — rejected for v1. Adds a dependency for something the
  Web Audio API handles natively. Revisit if the tone needs to play when the WebView
  is backgrounded (unlikely for an alarm the user just tapped).
- HTML5 `<audio>` element — viable but less flexible for generating tones
  programmatically. Web Audio API preferred.

---

## 7. Active-Escalation Screen State / Screen Wake Lock

**Decision**: Use `@capacitor/keep-awake` to prevent the screen from locking during
the active-escalation state. The screen lock would visually break the "persistent held
state" requirement (FR-007).

**Key API**:
```js
import { KeepAwake } from '@capacitor/keep-awake';

// On escalation start
await KeepAwake.keepAwake();

// On terminal state reached
await KeepAwake.allowSleep();
```

**Rationale**: Android will lock the screen after the device's timeout period if no
interaction occurs. During an active escalation — where the user may be incapacitated
— they cannot tap the screen to keep it on. `@capacitor/keep-awake` is the correct,
simple, maintained Capacitor plugin for this.

**Alternatives considered**:
- `screen.wakeLock` Web API — available in Chrome but not reliably in Capacitor
  WebView; the native plugin is more dependable.
- Setting `screenOrientation` lock — unrelated; rejected.

---

## 8. Notification Tap-to-Open Routing

**Decision**: Use the `pushNotificationActionPerformed` listener to catch notification
taps and route to the correct in-app screen based on a `type` field in the notification
data payload.

**Pattern**:
```js
PushNotifications.addListener('pushNotificationActionPerformed', action => {
  const type = action.notification.data?.type;
  if (type === 'scheduled_contact') show('screen-contact');
  // other types can be added
});
```

**Backend must send**: FCM notification payloads need a `data.type` field set by the
backend when dispatching. At build time, verify the field name with `pwa_sender.py`
and update if needed.

**Alternatives considered**: Routing by notification title/body string matching —
rejected. Fragile; breaks if copy changes. Data payload field is the correct pattern.

---

## Summary of Confirmed Decisions

| Item | Decision | Status |
|------|----------|--------|
| Auth | Memberstack passwordless DOM package | ✅ Confirmed (spike) |
| Session persistence | Capacitor WebView preserves storage | ✅ Confirmed (spike) |
| Push plugin | @capacitor/push-notifications | ✅ Chosen |
| Token registration endpoint | POST /register-token (existing) | ✅ Confirmed (code read) |
| Alarm endpoint | POST /pwa-respond, response:"alert" (existing) | ✅ Confirmed (code read) |
| Audio signal | Web Audio API, triggered on tap | ✅ Chosen |
| Keep-awake | @capacitor/keep-awake | ✅ Chosen |
| Notification routing | pushNotificationActionPerformed + data.type | ✅ Chosen |

## Build-Time Verifications (not blockers for spec/plan)

1. **Memberstack custom field name** containing the Airtable Table 1 record ID — read
   a live member object at first build step.
2. **`data.type` field name** in FCM payloads sent by `pwa_sender.py` — read the sender
   at build time.
3. **Positive contact response value** — confirm whether `"okay"` or an alternative
   value should be used for scheduled-contact acknowledgements.
4. **Audio tone UX** — frequency, pulse count, duration: design decision at build time.
