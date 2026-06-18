# Quickstart Validation Guide: Iona App — The Receiving App (Product A)

**Feature**: 001-receiving-app
**Created**: 2026-06-18
**Purpose**: Manual end-to-end validation scenarios that prove each user story works
on a real Android device. Run these after each build phase, in order. Not a test
suite — a human-operated playbook.

**References**:
- Spec: [spec.md](spec.md)
- Data model: [data-model.md](data-model.md)
- Contracts: [alarm-trigger.md](contracts/alarm-trigger.md),
  [push-registration.md](contracts/push-registration.md),
  [scheduled-contact-response.md](contracts/scheduled-contact-response.md)

---

## Prerequisites

Before running any scenario, confirm all of the following:

- [ ] Android device connected via USB, ADB shows `device` (`adb devices`)
- [ ] App built and installed: `npx cap run android --target <device-id>`
- [ ] Backend running and reachable from the device (tunnel active if on Mac Mini)
- [ ] Active Memberstack account exists with the Airtable Table 1 record ID
      stored in the confirmed custom field (see push-registration.md — verify
      field name before any push scenario)
- [ ] **`google-services.json` in place** at `android/app/google-services.json`
      (human download step — confirm before running any push or alarm scenario)
- [ ] Device has a working internet connection
- [ ] Device media volume is at a perceptible level (for alarm audio validation)

---

## Scenario 1 — Sign In (US1, SC-001, SC-002)

**Goal**: Confirm passwordless sign-in works end-to-end and session persists.

### 1a — Fresh sign-in

1. Uninstall the app (or clear app data) to ensure no session.
2. Install and open the app. The sign-in screen must appear.
3. Enter a valid email address. Tap the send-code button.
4. **Expected**: A 6-digit code arrives at that email address.
5. Enter the code. Tap verify.
6. **Expected**: Home screen appears. No error. Timer from step 2 to here should
   be under 2 minutes (SC-001).

**Pass criteria**: Home screen reached within 2 minutes of fresh install open.

### 1b — Session persistence across restart

1. From the home screen, press the device home button (app backgrounded).
2. Swipe the app away from recents (fully closed).
3. Reopen the app from the launcher.
4. **Expected**: Home screen appears directly — no sign-in screen, within 3 seconds
   (SC-002). The user is not asked to sign in again.

**Pass criteria**: Home screen in ≤ 3 seconds, no sign-in prompt.

### 1c — Expired or incorrect code

1. On the sign-in screen, request a code.
2. Enter an incorrect 6-digit code.
3. **Expected**: A clear, non-alarming error message. No crash. Sign-in screen
   remains. The user can try again.

**Pass criteria**: Error shown, no crash, retry available.

### 1d — Logout and re-login

1. From the home screen, tap logout.
2. **Expected**: Sign-in screen appears. Preferences are cleared — confirm
   `fcm_token` and `member_airtable_id` are absent (check via debug log or
   Preferences read at startup).
3. Sign back in with the same account (Scenario 1a flow).
4. **Expected**: FCM token re-registers in Airtable Table 1 within seconds of
   re-login — the `FCM Token` field is updated without requiring app reinstall.

**Pass criteria**: Push registration completes cleanly on re-login. No reinstall
required. Airtable `FCM Token` field reflects the current session's token.

**Why this matters**: Re-login is a real user flow (device handover, session
expiry, deliberate logout). Silent push registration failure on re-login means
notifications and alarm backend lookups stop working until reinstall — an
unacceptable silent breakage.

---

## Scenario 2 — Push Registration (prerequisite for S3–S5)

**Goal**: Confirm the device is registered with the backend after sign-in.
Run this before any notification or alarm scenario.

1. Sign in (Scenario 1a completed).
2. Open the backend logs (or Airtable Table 1) and locate the signed-in member's
   record.
3. **Expected**: The `FCM Token` field on that record is populated with a token
   string immediately after sign-in completes (within a few seconds).
4. On the device, if push permission was requested: confirm it was granted.

**Pass criteria**: `FCM Token` field in Airtable is populated post-login.

**If this fails**: Do not proceed to Scenarios 3–5. Diagnose registration first.
Common causes: wrong Memberstack custom field name (see push-registration.md),
`google-services.json` missing or misplaced, backend unreachable.

---

## Scenario 3 — Receive Scheduled Contact (US2, SC-003)

**Goal**: Confirm a scheduled contact notification is delivered and the response
flow works.

**Setup**: Trigger a test push notification from the backend to the registered
device. Either wait for a scheduled send or trigger one manually via the backend.

### 3a — Notification received while app is backgrounded

1. Sign in, confirm push registration (Scenario 2 passed).
2. Background the app (home button).
3. Trigger a test scheduled contact from the backend.
4. **Expected**: A notification appears in the device notification tray within
   10 seconds of dispatch (SC-003).
5. Tap the notification.
6. **Expected**: App opens to the contact-response screen. The message from Iona
   is displayed. A response button is visible.
7. Tap the response button.
8. **Expected**: Button shows a loading/sending state. Then confirmation appears.
   No error. If next contact time is returned by the backend, it is displayed
   naturally (no raw field values).

**Pass criteria**: Notification in ≤ 10s; contact-response screen loads; response
registers without error; confirmation shown.

### 3b — Notification received while app is in foreground

1. Sign in, app on home screen.
2. Trigger a test scheduled contact from the backend.
3. **Expected**: No system tray notification. The app surfaces the contact
   in-app (contact-response screen or in-app banner leading to it).
4. Respond as in 3a, step 7–8.

**Pass criteria**: Contact surfaced in-app without system notification; response
registers.

### 3c — Notification tap with app fully closed

1. Sign in, then fully close the app (swipe from recents).
2. Trigger a test scheduled contact.
3. **Expected**: System notification appears. Tapping it cold-launches the app
   directly to the contact-response screen.

**Pass criteria**: Correct screen shown after cold launch from notification tap.

---

## Scenario 4 — Raise the Alarm (US3, SC-004, SC-005, SC-006, SC-007)

**Goal**: Confirm the full alarm flow — cancellation window, commit, active state,
terminal state.

**Note**: These scenarios do not require Scenario 3 to pass first, but push
registration (Scenario 2) must be complete so the backend can receive the POST.

### 4a — Alarm with cancellation (cancel within window)

1. Sign in, home screen visible.
2. Tap the alarm button.
3. **Expected within 1 second (SC-004)**:
   - An audio tone plays (SC-005 — audible at current device volume).
   - The active-escalation screen appears.
   - A visible countdown is shown (live number or draining indicator).
   - A cancel button is visible and tappable.
4. While the countdown is running (before zero), tap the cancel button.
5. **Expected**:
   - Tone stops immediately.
   - Home screen returns.
   - No backend call was made (verify in backend logs — no escalation entry).

**Pass criteria**: Tone fires within 1s; countdown visible; cancel returns to home
with no backend call.

### 4b — Alarm committed (countdown reaches zero)

1. Sign in, home screen visible.
2. Tap the alarm button.
3. Allow the countdown to reach zero without tapping cancel.
4. **Expected at zero**:
   - Cancel button disappears.
   - Screen copy shifts to committed state.
   - Backend POST fires (verify in backend logs — escalation entry created).
5. Active-escalation screen persists. Screen does not lock (keep-awake active).
6. **Expected**: 100% of alarm activations that reach zero result in the active-
   escalation state being displayed (SC-006). There is no silent exit.

**Pass criteria**: Cancel button gone at zero; backend call made; active state
persists.

### 4c — Alarm committed — app closed and reopened mid-escalation

1. With the alarm committed and active-escalation screen showing:
2. Swipe the app away from recents (close it).
3. Reopen the app.
4. **Expected**: Active-escalation screen is shown immediately — not the home
   screen. State is preserved.

**Pass criteria**: Active-escalation screen on relaunch during active escalation.

### 4d — Terminal state

1. With an active escalation in progress:
2. Wait for the backend to signal escalation complete (or simulate the FCM payload).
3. **Expected**:
   - Screen transitions to the terminal state.
   - Screen is not blank. A designed message is shown.
   - The message reflects attempt language — it does not imply anyone answered.
   - A "done" or close action is available.
4. Tap the close action.
5. **Expected**: Home screen returns. Alarm button is available again.

**Pass criteria**: Terminal state always shown (SC-007); never a blank screen or
silent exit; copy reviewed and approved before this step runs.

### 4e — Alarm button unavailable during active escalation

1. With the active-escalation screen showing, attempt to reach and tap the alarm
   button (it should not be visible or reachable on this screen).
2. **Expected**: Alarm button is not accessible. Cannot trigger a second escalation.

**Pass criteria**: Alarm button not tappable in active or terminal state.

---

## Scenario 5 — Set Up the App (US4)

**Goal**: Confirm the setup/contact-list screen shows the member's listed contacts.

1. Sign in.
2. Navigate to the setup or profile area.
3. **Expected**: The member's listed contacts are shown, in order. Names are
   displayed naturally. No raw field names, no system labels, no "inherited" or
   "default" labels.
4. (If edit is available in this build): Update a setting, save, close the app,
   reopen. Confirm the change persisted.

**Pass criteria**: Contact list displayed correctly; settings persist across restart.

---

## Scenario 6 — Full Journey on One Device (US5, SC-008)

**Goal**: Confirm the web-to-app handoff requires no desktop action.

1. On the Android device's browser, navigate to the Iona website and complete
   account creation and plan selection.
2. From the same device, open the app.
3. Sign in using the same email address.
4. **Expected**: Home screen reached with no desktop step required. All core
   features accessible.
5. If a scheduled contact arrives within the session: receive and respond (as
   Scenario 3). Confirm no desktop action was needed at any point.

**Pass criteria**: End-to-end journey completed on the Android device alone (SC-008).
No desktop action required after account creation.

---

## Vocabulary Spot-Check (§II compliance)

Run this pass on any build before reporting scenarios complete.

Check every user-facing string in the app — button labels, screen copy, notification
text, error messages, confirmation messages — against the §II banned list:

- [ ] No "check-in" or "check in" anywhere
- [ ] No "okay" in any button label, message string, or outbound copy
- [ ] No "roster" anywhere
- [ ] No clinical language: "care", "welfare", "support", "patient", "resident"
- [ ] No alarming language: "failed", "emergency", "alert", "crisis"
- [ ] No system jargon: "IVR", "SMS", "PWA", "EventLog", "escalation", "reminder",
      raw field names or values
- [ ] No provenance labels: "inherited", "default"
- [ ] Iona referred to by name only — no "she", "her", "it", "the AI"

Also check: notification strings authored by the backend (`pwa_sender.py`) must
pass the same check. Verify at build time.

---

## Success Criteria Summary

| Criterion | Scenario | Pass condition |
|-----------|----------|---------------|
| SC-001: Sign-in < 2 min | 1a | Timer from app open to home screen |
| SC-002: Home screen < 3s on relaunch | 1b | Stopwatch from launch to home |
| SC-003: Notification within 10s | 3a | Dispatch time vs. tray appearance |
| SC-004: Alarm feedback < 1s | 4a, 4b | Stopwatch from tap to tone+screen |
| SC-005: Audio at default volume | 4a, 4b | Audible without volume adjustment |
| SC-006: 100% alarm activations → active state | 4b | Active screen shown every time |
| SC-007: Terminal state always shown | 4d | Never blank, never silent |
| SC-008: No desktop action | 6 | Full journey on Android only |
