# Contract: Push Registration

**Feature**: 001-receiving-app
**Created**: 2026-06-18
**Covers**: The full sequence for registering a device to receive push notifications —
from post-login permission request through FCM token retrieval and backend registration.

---

## Overview

Push registration is a quiet, one-time background step that happens after the user
has successfully signed in. It is structurally separate from authentication and must
never happen before the user's identity is established.

The old PWA conflated registration with install — the structural fix is: **auth first,
then push registration, for a known user**. Nothing in this flow happens at install
time or before a confirmed Memberstack session.

---

## Trigger

**When**: Immediately after Memberstack login succeeds and the home screen loads —
on first install, and on any subsequent login where no valid FCM token is stored in
Preferences.

**Preconditions**:
- Memberstack session is active (`$memberstackDom.getCurrentMember()` returns a
  member object).
- The member object contains a non-empty `airtable_record_id` value (see §
  Critical: The Member ID Field below).
- `escalation_state` is `"idle"` (do not attempt registration during an active
  escalation).

**Re-registration triggers** (same flow, re-run):
- App detects that `Preferences['fcm_token']` is absent (e.g. after reinstall,
  after logout/re-login, after token invalidation).
- The `@capacitor/push-notifications` plugin fires a token refresh event — the
  new token must be registered with the backend immediately.

---

## CRITICAL: The Member ID Field

This is the most likely integration failure point. Read this section carefully
before writing any registration code.

### What the endpoint expects

The existing `/register-token` endpoint stores the FCM token against a record in
**Airtable Table 1** (the service users table). Its `member_id` parameter is the
**Airtable Table 1 record ID** — a string in the format `"recXXXXXXXXXXXXXX"`.

```
POST /register-token
Body: { "token": "<FCM_TOKEN>", "member_id": "<AIRTABLE_TABLE1_RECORD_ID>" }
```

Source: `reply_to_airtable_webhook.py`, `_handle_pwa_register_token()`.

### What it does NOT expect

The `member_id` field is **not** the Memberstack member ID. Memberstack member IDs
follow a different format (e.g. `"mem_..."`) and are not recognised by this endpoint.
Passing a Memberstack member ID will silently fail — the endpoint will find no matching
Airtable record and the token will not be stored. The alarm will subsequently fail at
`POST /pwa-respond` because the backend cannot look up the user by FCM token.

**There is no error surfaced by the backend for this mismatch.** The POST may return
200 while having stored nothing. This is why it is the most likely silent failure
point.

### Where to find the Airtable record ID

The Airtable Table 1 record ID is stored as a **custom field on the Memberstack
member object**, populated when the member's account was created via the website
onboarding flow.

**Confirmed location in the member object**:
```js
const airtableRecordId = member.data.customFields['airtable-id'];
```

**Verified 2026-06-18** — field name confirmed as `'airtable-id'` from a live member
object (`customFields` contained `{"first-name": "Ian", "airtable-id": "recJVHzTNBFcwiVXE"}`).
The value begins with `"rec"` as expected.

### Validation before using the ID

After login, validate the retrieved value before proceeding:

```js
const airtableRecordId = member.data.customFields['airtable-id'];

if (!airtableRecordId || !airtableRecordId.startsWith('rec')) {
  // Surface a clear error — do not silently proceed
  // The user cannot receive the full service without this ID
}
```

If the value is absent or malformed: show a clear, non-alarming message. Log the
raw `customFields` object. Do not proceed to push registration. This is a
configuration issue (the member record was created without the Airtable ID in their
Memberstack profile) that must be resolved in the backend before registration can
complete.

Store the confirmed value immediately in Preferences:
```js
await Preferences.set({ key: 'member_airtable_id', value: airtableRecordId });
```

---

## Step 1 — Request Push Permission

On Android 13+ (API 33+), push notification permission must be explicitly requested.
On earlier versions, permission is granted at install. Capacitor handles the
version branching — the app always calls the same API.

```js
const permResult = await PushNotifications.requestPermissions();
if (permResult.receive !== 'granted') {
  // Permission denied — see error cases
}
```

**UI note**: On Android, the system permission dialog is shown once. If denied, the
user must be directed to system settings to re-enable. The app must handle the denied
state gracefully — do not show an alarming message, but do clearly explain that
notifications cannot be received without permission.

---

## Step 2 — Register with FCM and Retrieve Token

```js
await PushNotifications.register();

PushNotifications.addListener('registration', async ({ value: fcmToken }) => {
  // value is the FCM device token string
  await registerTokenWithBackend(fcmToken, airtableRecordId);
});

PushNotifications.addListener('registrationError', (err) => {
  // See error cases
});
```

The `registration` event fires asynchronously after `register()` succeeds. The FCM
token is only available in this callback — it cannot be retrieved synchronously.

---

## Step 3 — Store Token Locally

Before posting to the backend, store the token in Preferences so it is available
for alarm triggers and contact responses without a refetch:

```js
await Preferences.set({ key: 'fcm_token', value: fcmToken });
```

This must happen before the backend POST. If the backend POST fails, the token is
still available locally for retry.

---

## Step 4 — Register Token with Backend

```
POST /register-token
Content-Type: application/json

{
  "token": "<FCM_DEVICE_TOKEN>",
  "member_id": "<AIRTABLE_TABLE1_RECORD_ID>"
}
```

**Field mapping**:

| Body field | Value | Source |
|------------|-------|--------|
| `token` | FCM device token string | `registration` event callback (`value`) |
| `member_id` | Airtable Table 1 record ID (`"recXXX..."`) | `Preferences['member_airtable_id']` |

**Expected response**: `HTTP 200`. Response body not consumed.

**What this does on the backend**: Writes the FCM token to the `FCM Token` field of
the member's Table 1 record in Airtable. This is how the backend knows which device
to send push notifications to, and how it looks up the member when the device POSTs
an alarm or response.

---

## Token Refresh

FCM tokens can be invalidated and refreshed by the platform at any time. The app
must handle this:

```js
PushNotifications.addListener('registration', async ({ value: fcmToken }) => {
  const stored = (await Preferences.get({ key: 'fcm_token' })).value;
  if (fcmToken !== stored) {
    // Token has changed — re-register with backend
    await Preferences.set({ key: 'fcm_token', value: fcmToken });
    await registerTokenWithBackend(fcmToken, airtableRecordId);
  }
});
```

The `registration` listener fires on every app launch (not just first install).
Comparing the new token to the stored value and re-registering on change is the
correct pattern.

---

## Error Cases

### Push permission denied

**Response**:
- Do not proceed to FCM registration.
- Show a non-alarming, clear message explaining that notifications cannot be
  delivered without permission, and how to enable it in device settings.
- The user can still use the alarm trigger (FCM token from a previous registration
  may still be in Preferences). Surface a soft warning if no token is stored.

### FCM registration fails (`registrationError` event)

**Response**:
- Log the error.
- Show a non-alarming message: the device could not complete setup, and some
  features may not work. Suggest restarting the app.
- Do not crash or leave the user on a broken screen.

### Airtable record ID absent or malformed after login

**Response**:
- Do not proceed to push registration.
- Show a clear error message (non-alarming tone).
- Log the full `customFields` object for debugging.
- This is a backend configuration issue — the member's Memberstack profile does
  not contain their Airtable record ID. Requires manual resolution.

### Backend POST fails (network error or non-200)

**Response**:
- The FCM token is already stored in Preferences — the alarm can still fire from
  the user's side.
- However, the backend will not be able to send push notifications to this device
  until the token is registered.
- Show a soft, non-alarming warning: "setup incomplete — notifications may not
  arrive." Offer a retry (re-run Step 4 with the stored token and record ID).
- Do not block the user from using the app.

---

## Full Sequence

```
Memberstack login succeeds
        │
        ▼
Read member.data.customFields['<confirmed-field-name>']
        │
        ├── Absent or not "rec..." prefix?
        │   ──► Log customFields, show clear error, stop registration.
        │       User can still use the app; alarm may fail at backend lookup.
        │
        ▼
Store airtable_record_id in Preferences
        │
        ▼
PushNotifications.requestPermissions()
        │
        ├── Denied? ──► Explain in UI, skip registration.
        │               Soft warning if no stored FCM token.
        │
        ▼
PushNotifications.register()
        │
        ▼
'registration' event fires → fcmToken received
        │
        ▼
Store fcmToken in Preferences['fcm_token']
        │
        ▼
POST /register-token { token: fcmToken, member_id: airtable_record_id }
        │
        ├── Fail? ──► Log error, show soft warning + retry option.
        │             Token stored locally; alarm can still fire.
        │
        ▼
Registration complete — device is known to the backend.
Push notifications will be delivered. Alarm and response POSTs will resolve correctly.
```

---

## Build-Time Notes

- **Memberstack custom field name confirmed**: `'airtable-id'` — verified 2026-06-18
  from a live member object. Use this name everywhere in registration code.
- `member_id` in the POST body is the Airtable Table 1 record ID (`"rec..."`), not
  the Memberstack member ID. Passing the wrong ID silently fails — the backend returns
  200 but stores nothing. This is the most likely silent failure point in the app.
- The `registration` listener must be attached before calling `register()`. Attach
  listeners once, at app init, not inside the registration function.
- Store FCM token in Preferences before the backend POST, not after — ensures the
  token is available for retry without repeating FCM registration.
- **STOP — `google-services.json` is a human download step.** Source: Firebase
  Console → Project settings → howsu-9a479 → download `google-services.json` →
  place at `android/app/google-services.json`. This must be in place before any
  push notification code is built or tested. Do not proceed past this step without
  owner confirmation the file is at that path.
- Registration is silent to the user when it succeeds — no confirmation needed.
  Only failures surface UI messages.
