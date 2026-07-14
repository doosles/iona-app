# Quickstart Validation Guide: Reactive Voice Bridge

**Phase 1 output** | Feature: 002-reactive-voice-bridge | Date: 2026-06-23

## Prerequisites

- Backend (`reply_to_airtable_webhook.py`) running on port 8080
- ngrok tunnel active, `NGROK_BASE_URL` set in `.env`
- APK built and installed on Pixel 4a (or equivalent Android 13+ device)
- Two phone numbers available: one as the "person" device, one as a test "contact"
- Test member record in Airtable with GA plan, at least one contact phone number, `member_airtable_id` in Capacitor Preferences on device
- Airtable contact field IDs in `config.py`

---

## Scenario 1 — P1: Single tap → contact answers → hands-free conversation

**Tests**: FR-001, FR-002, FR-006, FR-007, SC-001, SC-002

1. Open Iona app, verify logged-in state.
2. Press the "I NEED HELP" button once.
3. **Expected**: Bridge starts immediately — no confirmation dialog.
4. **Expected**: Person hears Oran's voice ("trying to reach your contacts").
5. On the contact phone: incoming call rings.
6. Contact answers and presses any key when prompted.
7. **Expected**: Live two-way audio — both parties can hear each other clearly. Person's audio is hands-free (no need to hold phone).
8. Contact hangs up.
9. **Expected**: Call ends on the person's device. Person sees resolved state. No further contacts attempted.
10. **Expected**: EventLog has entries: BRIDGE_SUMMONED → BRIDGE_DIALING → BRIDGE_KEYPRESS → BRIDGE_CONNECTED → BRIDGE_RESOLVED.

---

## Scenario 2 — P1: Contact doesn't answer → advances to next

**Tests**: FR-004, FR-008, SC-003

1. Set up test member with two contacts — contact 1 phone rings but is not answered, contact 2 is available.
2. Press help button.
3. **Expected**: Contact 1 rings for ~30s, no answer — system moves automatically to contact 2.
4. Contact 2 answers and presses key.
5. **Expected**: Live two-way conversation with contact 2.
6. EventLog: BRIDGE_DIALING (index 0) → BRIDGE_NO_ANSWER (index 0) → BRIDGE_DIALING (index 1) → BRIDGE_KEYPRESS (index 1) → BRIDGE_CONNECTED → BRIDGE_RESOLVED.

---

## Scenario 3 — P2: All contacts exhausted → terminal state

**Tests**: FR-009, SC-005

1. Set up test member where no contact phone answers (or use numbers that go to voicemail/ring out).
2. Press help button.
3. Allow all contacts to ring out (or voicemail to answer without keypress).
4. **Expected**: After all contacts are exhausted, person sees a calm, clear message that no one was reached.
5. **Expected**: Person is NOT left in silence, on hold, or on an error screen.
6. EventLog: BRIDGE_TERMINAL with `reason: exhausted`.

---

## Scenario 4 — FR-014: Involuntary drop → one reconnect → continue

**Tests**: FR-014, SC-004

1. Establish a live bridge call (Scenario 1 up to the live conversation step).
2. Force a network interruption on the device mid-call (e.g., toggle airplane mode on/off quickly).
3. **Expected**: App enters "reconnecting" state.
4. If network restores within 30s and same conference is alive: **Expected** call resumes.
5. If network does not restore: **Expected** system continues to next contact (does NOT end on a screen-only prompt).
6. EventLog: BRIDGE_DROPPED → BRIDGE_RECONNECT → (BRIDGE_CONNECTED or BRIDGE_RECONNECT_FAILED → BRIDGE_DIALING next index).

---

## Scenario 5 — FR-015: Duplicate tap while in progress

**Tests**: FR-015

1. Press help button. Wait for "reaching your contacts" state.
2. Press help button again.
3. **Expected**: "Already connecting" state shown. Oran's audio continues. No restart, no second attempt.

---

## Scenario 6 — FR-003 / SC-007: Orb trigger setting

**Tests**: FR-003, SC-007

1. Go to Settings.
2. **Expected**: "Summon by tapping the orb" toggle is present and OFF by default.
3. Enable the toggle.
4. Return to Today screen. Tap the orb.
5. **Expected**: Bridge initiates exactly as with the help button.
6. Disable the toggle. Tap the orb.
7. **Expected**: No bridge initiated — orb behaves as before.

---

## Scenario 7 — FR-012: Visible failure on bridge initiation error

**Tests**: FR-012, SC-004

1. Stop the backend while the app is open.
2. Press the help button.
3. **Expected**: Visible error message shown. No silent failure. No hang.

---

## Failure indicators (any scenario fails if these occur)

- Silent exit with no feedback to the person
- Person can end the call (tap should have no effect during in_call state)
- Voicemail connected as if live human (no keypress should not bridge)
- Any EventLog transition missing or with blank fields
- Attempt runs past 4 minutes without ending
