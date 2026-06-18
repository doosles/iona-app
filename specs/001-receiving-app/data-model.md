# Data Model: Iona App — The Receiving App (Product A)

**Feature**: 001-receiving-app
**Created**: 2026-06-18

---

## Overview

Product A is primarily a consumer of existing data — it reads from and writes to
the already-running backend rather than owning its own data store. The app holds
only the minimum local state needed to function between sessions. This document
covers: what the app stores locally, what it reads remotely, what it writes
remotely, and the one meaningful state machine (Escalation).

---

## Local State — Capacitor Preferences

Persisted on-device using `@capacitor/preferences`. Survives app restarts;
cleared on app uninstall or explicit logout.

| Key | Type | Description | Set when | Cleared when |
|-----|------|-------------|----------|--------------|
| `fcm_token` | string | FCM device token obtained from push plugin after registration | Post-login push registration succeeds | Logout |
| `member_airtable_id` | string | Airtable Table 1 record ID for this member | Post-login, read from Memberstack custom fields | Logout |
| `escalation_state` | string enum | Current escalation state: `"idle"` \| `"active"` \| `"terminal"` | On any escalation state transition | Logout; reset to `"idle"` on clean terminal |

**Validation rules**:
- `fcm_token`: non-empty string; format is Firebase-issued alphanumeric token. If absent
  at alarm-trigger time, the alarm must fail loudly (display error, not silently proceed).
- `member_airtable_id`: non-empty string beginning with `"rec"` (Airtable record ID
  format). If absent at push-registration time, registration must fail loudly.
- `escalation_state`: MUST be one of the three enum values. Invalid or missing value
  treated as `"idle"`.

**What is NOT stored locally**:
- Member name, email, contact list, plan details — all owned by the backend; fetched
  on demand. Caching these locally is out of scope for v1.
- Memberstack session cookie/JWT — managed by the Memberstack DOM library in WebView
  storage; the app does not touch it directly.

---

## Remote Data — Read by the App

The app reads these from the backend or Memberstack; it does not own or mutate the
schema.

### Member (from Memberstack)

Source: `$memberstackDom.getCurrentMember()` or `loginMemberPasswordless()` response.

| Field | Type | Source field | Notes |
|-------|------|-------------|-------|
| `id` | string | `member.data.id` | Memberstack member ID — used for session check only |
| `email` | string | `member.data.auth.email` | Display only |
| `airtable_record_id` | string | `member.data.customFields['airtable-record-id']` | **Critical** — see push-registration.md contract. Exact field name must be verified at build time. |
| `first_name` | string | `member.data.customFields['first-name']` | Display (greeting) |

**Validation**: `airtable_record_id` must be present and begin with `"rec"`. If absent
after login, treat as a configuration error — show a clear message, do not silently
continue to push registration.

### Contact List (from backend)

Source: backend endpoint (existing). The app reads the member's listed contacts in
order for the setup/confirmation screen.

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | Display name of contact |
| `order` | integer | Position in escalation attempt sequence (1-first) |
| `method` | string | How they are contacted (display only — no copy uses method names as labels) |

**Read-only**: The app displays the contact list; editing contacts is out of scope for v1.

### Scheduled Contact Notification (from FCM payload)

Source: FCM push notification data payload delivered by the backend (`pwa_sender.py`).

| Field | Type | Notes |
|-------|------|-------|
| `type` | string | `"scheduled_contact"` — routes notification tap to contact-response screen |
| `title` | string | Notification title (set by backend; must comply with §II vocabulary) |
| `body` | string | Notification body text (set by backend; must comply with §II vocabulary) |
| `contact_record_id` | string | Airtable record ID of the scheduled contact event (used in response POST) |

**Note**: The exact payload field names must be verified against `pwa_sender.py` at
build time. `contact_record_id` may or may not be present — the response endpoint
currently identifies users by FCM token, so the record ID may not be required.

---

## Remote Data — Written by the App

The app writes to two existing backend endpoints. No new tables or fields are created.

### Device Registration Write

Writes FCM token against the member's Airtable Table 1 record.

| Written field | Value | Endpoint |
|---------------|-------|----------|
| Table 1 `FCM Token` field | FCM device token string | `POST /register-token` |

See: **push-registration.md** contract.

### Response Write (Alarm or Scheduled Contact)

Writes the user's response, identified by FCM token.

| Written field | Value | Endpoint |
|---------------|-------|----------|
| Response type | `"alert"` (alarm) or acknowledgement value (scheduled contact) | `POST /pwa-respond` |

See: **alarm-trigger.md** and **scheduled-contact-response.md** contracts.

---

## State Machine: Escalation

The escalation is the one meaningful stateful process in the app. It has three
explicitly designed states. There is no silent exit — every state transition is
visible to the user.

```
         ┌─────────────────────────────────────────────┐
         │                                             │
         ▼                                             │
    ┌─────────┐   alarm button tapped   ┌──────────┐   │ (logout / new session)
    │  idle   │ ──────────────────────► │  active  │   │
    └─────────┘                         └──────────┘   │
         ▲                                   │         │
         │    terminal state displayed        │         │
         │    + user taps "done"              ▼         │
         │                            ┌──────────────┐  │
         └────────────────────────────│   terminal   │──┘
                                      └──────────────┘
```

### State Definitions

**`idle`** (default)
- Home screen is shown; alarm button is available.
- No escalation in progress.
- Entry: app launch (no active escalation in Preferences); after logout/re-login;
  after user dismisses terminal state.

**`active`**
- Escalation has been triggered; backend is attempting contacts in order.
- Screen: persistent active-escalation UI — audio has fired, visual confirmation
  showing, screen kept awake via `@capacitor/keep-awake`.
- Entry: alarm button tapped + `POST /pwa-respond {"response":"alert"}` dispatched.
- Exit: backend signals escalation complete (via FCM notification or polling);
  OR app receives a `type: "escalation_complete"` notification payload.
- **Must not be silently exited** — closing and reopening the app returns to this
  screen while state is `"active"` in Preferences.

**`terminal`**
- Escalation cycle has ended. The screen explicitly tells the user what happened.
- Screen: terminal-state UI — designed message, not a blank screen or spinner.
- The promise displayed: contacts were attempted. Outcome (whether anyone answered)
  is not stated.
- Entry: from `active` when escalation-complete signal received.
- Exit: user taps a "done" / close action → state resets to `"idle"`.
- **Required by**: FR-008, SC-007, constitution §I.3.

### Transition Validation Rules

- The alarm button MUST NOT be tappable while state is `"active"` or `"terminal"`.
  (Prevents duplicate escalation triggers.)
- If the app launches and finds `escalation_state = "active"` in Preferences, it
  MUST display the active-escalation screen immediately — not the home screen.
- If `escalation_state = "terminal"` on launch, display the terminal screen with a
  clear exit action.

---

## Entity Relationship Summary

```
Memberstack Member
  │  holds: id, email, customFields → airtable_record_id, first_name
  │
  └── maps to ──► Airtable Table 1 Record (service user)
                   │  holds: FCM Token, contact list, schedule config
                   │
                   └── has many ──► Listed Contacts (econtacts, ordered)

App Local State (Capacitor Preferences)
  │  holds: fcm_token, member_airtable_id, escalation_state
  │
  └── references ──► Memberstack Member (via WebView session)
  └── references ──► Airtable Table 1 Record (via member_airtable_id)
```
