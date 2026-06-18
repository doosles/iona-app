# Feature Specification: Iona App — The Receiving App (Product A)

**Feature Branch**: `001-receiving-app`

**Created**: 2026-06-18

**Status**: Draft

**Input**: Scope document — Product A: The Receiving App

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Sign In (Priority: P1)

A service user opens the app for the first time (or after being signed out) and signs in
using their email address and a one-time code sent to that address.

**Why this priority**: Authentication is the entry gate to all other features. Nothing else
is accessible without a valid session.

**Independent Test**: A user can install the app on a fresh device, enter their email,
receive the code, enter it, and land on the home screen — independently of all other stories.

**Acceptance Scenarios**:

1. **Given** the app has no active session, **When** the user enters their email and requests
   a code, **Then** a one-time 6-digit code is sent to that address.
2. **Given** a code has been sent, **When** the user enters the correct code within its
   validity window, **Then** they are signed in and reach the home screen.
3. **Given** a code has been sent, **When** the user enters an incorrect or expired code,
   **Then** a clear, non-alarming error is shown and they may try again.
4. **Given** the user has a valid existing session, **When** they reopen the app, **Then**
   they go directly to the home screen without being asked to sign in again.

---

### User Story 2 — Receive Scheduled Contact from Iona (Priority: P1)

A signed-in user receives a scheduled contact from Iona via a notification, and can
acknowledge or respond to it from within the app.

**Why this priority**: This is the core proactive service the user signed up for. Reliable
delivery and a clear response path are foundational to the product's promise.

**Independent Test**: A signed-in user receives a notification on their device, taps it,
and can submit a response from within the app. Fully testable without the alarm story.

**Acceptance Scenarios**:

1. **Given** the user is signed in and the app is in the background, **When** a scheduled
   contact arrives, **Then** a notification appears on the device.
2. **Given** a notification has arrived, **When** the user taps it, **Then** the app opens
   to a screen showing the contact and a clear way to respond.
3. **Given** the response screen is showing, **When** the user submits a response, **Then**
   the response is registered and the screen confirms receipt.
4. **Given** the app is in the foreground when a contact arrives, **Then** the contact is
   displayed in-app without requiring the user to interact with a notification.

---

### User Story 3 — Raise the Alarm (Priority: P1)

A signed-in user who needs help activates the alarm in the app. The escalation cycle
begins, and the user receives immediate, unambiguous on-device feedback that their people
are being contacted.

**Why this priority**: This is the reactive safety function — the second core purpose of
the product alongside receiving contact. A silent failure here is a safety failure, not a
disappointment.

**Independent Test**: A signed-in user activates the alarm and receives immediate audio and
visual feedback, followed by a persistent active-escalation screen. Testable independently
of notification delivery.

**Acceptance Scenarios**:

1. **Given** the user is signed in, **When** they activate the alarm, **Then** an audio
   signal sounds and a visual confirmation appears within 1 second — making clear that their
   contacts are being reached out to.
2. **Given** the alarm has been activated, **Then** the screen transitions to a clearly
   designed active-escalation state that persists and shows the system is working.
3. **Given** the escalation cycle has completed, **Then** the screen transitions to a
   terminal state that explicitly tells the user what happened — there is no silent exit or
   blank screen.
4. **Given** the alarm has been activated, **Then** the system attempts to contact the
   user's listed people in order — the app's promise is the attempt, not the outcome.
5. **Given** the alarm is active, **When** the user closes and reopens the app, **Then**
   the active-escalation state is still displayed — the alarm is not silently cancelled by
   closing the app.

---

### User Story 4 — Set Up the App (Priority: P2)

A newly signed-in user reviews and confirms their configuration — who Iona contacts,
their listed contacts, and relevant preferences — so the service works as intended for them.

**Why this priority**: Setup must happen before the service is useful, but the user can
sign in first and configure second; it does not block access to the core features.

**Independent Test**: A signed-in user can open the setup area, review their contact list,
and confirm or update their configuration. Testable independently once US1 works.

**Acceptance Scenarios**:

1. **Given** a user signs in for the first time with a new device, **When** they reach the
   home screen, **Then** they are guided toward completing any setup that is needed.
2. **Given** the user opens the setup area, **Then** they can see who their listed contacts
   are, in order.
3. **Given** the user updates a setting and saves it, **Then** the change persists across
   app restarts.

---

### User Story 5 — Complete Journey on One Device (Priority: P2)

A new user creates their account on the website, then completes everything else — downloading
the app, signing in, setting up their device, and receiving their first contact — entirely on
their phone, without needing to return to a desktop.

**Why this priority**: "No desktop hand-off" is a core product promise. The hand-off from
web sign-up to app is a seam that must be seamless on the same device.

**Independent Test**: A user who has completed web sign-up can open the app on the same
phone, sign in, complete device setup, and receive their first scheduled contact — all
without touching a desktop at any point after account creation.

**Acceptance Scenarios**:

1. **Given** a user has created an account and selected a plan on the website (on their
   phone browser), **When** they open the app on the same device, **Then** they can sign
   in immediately using the same identity — no second account, no token, no hand-off to
   desktop required.
2. **Given** the user has signed in via the app, **When** they complete device setup,
   **Then** they are ready to receive scheduled contact with no further action needed on
   any other device.
3. **Given** a user completes sign-in and setup on their phone, **When** the scheduled
   time for their first contact arrives, **Then** they receive it on that same device.

---

### Edge Cases

- What happens if a notification is tapped when the device has no internet connection?
- What happens if the user activates the alarm and then closes the app — does the escalation
  continue? (It must.)
- What is the explicitly designed terminal state when the contact list is exhausted and
  no one answered? (This is a designed moment, not an absence.)
- What if the user receives a scheduled contact notification while the alarm is active?
- What if the one-time sign-in code has expired by the time the user enters it?
- What if the user's contact list is empty when the alarm is activated?

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST allow a user to sign in using their email address and a one-time
  code — no password required.
- **FR-002**: The app MUST preserve a valid session across restarts, so a returning user
  reaches the home screen directly without signing in again.
- **FR-003**: The app MUST receive push notifications from the Iona service while running
  in the background, foreground, or closed state.
- **FR-004**: The app MUST allow a user to respond to a scheduled contact from within the
  app.
- **FR-005**: The app MUST provide an alarm trigger that initiates the emergency-contact
  escalation cycle.
- **FR-006**: The app MUST produce an immediate audio signal and visual confirmation within
  1 second of the alarm being activated.
- **FR-007**: The app MUST display a persistent active-escalation state screen for the
  duration of the escalation cycle — this state MUST NOT be dismissible by the user or
  silently exited.
- **FR-008**: The app MUST display an explicit terminal state when the escalation cycle
  ends — never a blank screen, silent exit, or unresolved spinner.
- **FR-009**: The app MUST register the device for push notifications only after the user
  has successfully signed in — never at install time, before identity is established.
- **FR-010**: The app MUST allow a signed-in user to view their listed contacts in order.
- **FR-011**: The escalation event MUST be designed to accept external signals (e.g. a
  wearable button or fall sensor) as triggers — using the same event path as the in-app
  alarm — but external trigger wiring is deferred to v2. Only the in-app alarm button is
  wired in v1.
- **FR-012**: The alarm trigger, escalation handshake, and active-escalation state MUST be
  designed so that a live-voice bridge capability can be added later as an enhancement
  without rebuilding these components.
- **FR-013**: The app MUST never use banned vocabulary in any user-facing surface — no
  "check-in", no "okay" in outbound copy, no clinical or alarming language, no system
  jargon, no provenance labels.
- **FR-014**: Iona MUST be referred to by name only in all app copy — never "she", "her",
  "it", or "the AI".

### Key Entities

- **Member**: The signed-in service user. Has an identity, a plan, and a service
  configuration tied to their account.
- **Listed Contact (Econtact)**: A person in the member's emergency-contact list, with a
  defined order in which they are attempted.
- **Scheduled Contact**: A message or notification from Iona sent to the member on a
  schedule, requiring acknowledgement.
- **Escalation**: A cycle that attempts to reach the member's listed contacts in order.
  Triggered by the in-app alarm (or an external trigger if in scope). Has three designed
  states: idle → active → terminal.
- **Device**: The member's phone, registered to them post-login to receive notifications
  sent by the service.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can complete sign-in from a fresh install in under 2 minutes,
  including receiving and entering the one-time code.
- **SC-002**: A user with a valid session reaches the home screen in under 3 seconds from
  launching the app.
- **SC-003**: Scheduled contact notifications are received and displayed within 10 seconds
  of being dispatched by the service.
- **SC-004**: The alarm produces visible on-screen feedback within 1 second of activation.
- **SC-005**: The audio signal on alarm activation is audible at default device volume
  without the user adjusting settings first.
- **SC-006**: 100% of alarm activations result in a visible active-escalation state — there
  is no silent failure path.
- **SC-007**: The terminal state (escalation complete) is always explicitly shown — never a
  blank screen or silent exit.
- **SC-008**: The complete journey from first sign-in to receiving the first scheduled
  contact requires no action on a desktop device.

---

## Assumptions

- The member's account is created and the plan is selected on the website (including on a
  phone browser). The app authenticates against this existing account — it does not create
  accounts or handle plan selection.
- The backend escalation system, contact list storage, scheduling, and notification dispatch
  are already operational. Product A is a new front-end on an existing backend — no new
  backend is required.
- Push notification delivery reliability is governed by the platform and the existing
  dispatch service, not the app itself.
- The app is Android-first. iOS is explicitly out of scope for this version.
- Play Store vs. sideload distribution does not affect this specification — it is a
  deployment decision made separately.
- The packaging/pricing model (telecare-first vs. presence-first vs. unified tiers) is not
  yet decided. This spec remains neutral on positioning; copy must not commit to either
  framing.
- Session persistence across app restarts is confirmed — verified in auth spike on real
  Android hardware, June 2026, using the Capacitor Preferences plugin.
- External hardware triggers (wearable buttons, fall sensors, phone-button shortcuts) are
  explicitly out of scope for v1. The escalation event is designed to accept them, but they
  are not wired. This is a v2 item.
- Live two-way voice bridging during escalation is explicitly out of scope for Product A
  — it is a future enhancement (Product B) that A's design accommodates but does not
  implement.
