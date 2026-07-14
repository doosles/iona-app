---
description: "Task list for Iona App — The Receiving App (Product A)"
---

# Tasks: Iona App — The Receiving App (Product A)

**Input**: Design documents from `specs/001-receiving-app/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅,
contracts/ ✅, quickstart.md ✅

**No automated tests** — validation is manual on-device per quickstart.md.

**Platform**: Android-first. One Capacitor web layer (www/), one native shell (android/).
All app logic lives in `www/app.js`. All screen markup in `www/index.html`.
All styles in `www/style.css`.

---

## Format: `[ID] [P?] [Story?] Description — file path`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[US#]**: Which user story this task belongs to
- Tasks marked **⛔ STOP** require human action or owner review before proceeding

---

## Phase 1: Setup

**Purpose**: Scaffold the Capacitor project in the `iona-app` repo and confirm
the Android build environment is ready.

- [x] T001 ✅ Install npm dependencies — `package.json`

- [x] T002 ✅ Initialise Capacitor — `capacitor.config.json`

- [x] T003 ✅ Create `www/index.html` with full app shell — `www/index.html`
  Note: screen structure diverged from spec — unified `screen-today` replaces
  separate screen-home/screen-contact/screen-alarm-active/screen-alarm-terminal.

- [x] T004 ✅ [P] Create `www/style.css` — `www/style.css`

- [x] T005 ✅ Create `www/app.js` stub — `www/app.js`

- [x] T006 ✅ Add Android platform and sync — `android/`

- [x] T007 ✅ STOP RESOLVED — `android/app/google-services.json` confirmed in place.

---

## Phase 2: Foundational

**Purpose**: Resolve all build-time verifications and write shared infrastructure
that every user story depends on. No user story work begins until this phase is
complete.

**⚠️ CRITICAL**: Do not proceed to Phase 3+ until T008 and T009 are resolved.
The field names confirmed in T008 and T009 are used by T012, T017, T018, and T027.

- [x] T008 ✅ RESOLVED — **Memberstack custom field name confirmed**: `'airtable-id'`
  (verified 2026-06-18 from live member object). contracts/push-registration.md and
  data-model.md updated. — `specs/001-receiving-app/contracts/push-registration.md`

- [x] T009 ✅ RESOLVED — `data.type` field added to backend (commit 8bb5f87).
  Confirmed values: `"scheduled_contact"` (FCM push), `"escalation_complete"` (cycle end),
  `"okay"` (positive response value for `/pwa-respond`). Both contracts updated.
  Additional types shipped: `"reminder_1"`, `"reminder_2"`, `"escalation_started"`.

- [x] T010 ✅ Write Preferences utility functions in `www/app.js` —
  `getPreference`, `setPreference`, `removePreference` at lines 10–29. — `www/app.js`

- [x] T011 ✅ Write screen routing utilities in `www/app.js` —
  `show(screenId)` and `setMsg(id, text)` at lines 32–42. — `www/app.js`

- [x] T012 ✅ Write Memberstack initialisation in `www/app.js` —
  `initMemberstack()` with polling loop; `memberConfig` held in module-level variable. — `www/app.js`

**Checkpoint**: Preferences, routing, and Memberstack init complete. All field names
confirmed. User story work can begin.

---

## Phase 3: User Story 1 — Sign In (Priority: P1)

**Goal**: User can sign in with email + 6-digit code, session persists across
restarts, logout clears all state cleanly and re-login re-registers push.

**Independent test**: Quickstart scenarios 1a, 1b, 1c, 1d.

- [x] T013 ✅ [US1] Write session check on `window` load — `checkSession()` at line 228. — `www/app.js`

- [x] T014 ✅ [US1] Write sign-in flow — `initSignIn()` / `verifyCode()` at line 277. — `www/app.js`

- [x] T015 ✅ [US1] Write logout — `initLogout()` at line 375; removes all three Preferences keys. — `www/app.js`

- [x] T016 ✅ [P] [US1] Sign-in screen markup — email input, OTP boxes, verify button. — `www/index.html`

- [x] T017 ✅ [P] [US1] Sign-in and home screen styles. — `www/style.css`

**Checkpoint**: Sign in, session persistence, and logout work. Run quickstart 1a–1d
before proceeding.

---

## Phase 4: User Story 2 — Receive Scheduled Contact (Priority: P1)

**Goal**: Device is registered for push post-login. Notifications arrive in all
app states. User can respond. Registration survives logout/re-login.

**Prerequisite**: T007 (google-services.json in place) and T008 (field name
confirmed) must be complete before running push tasks.

**Independent test**: Quickstart scenarios 2, 3a, 3b, 3c.

- [x] T018 ✅ [US2] Write push notification listener setup — `initPushListeners()` at line 395;
  all four listeners attached at init. — `www/app.js`

- [x] T019 ✅ [US2] Write post-login push registration — `setupPush()` at line 461;
  permissions, register, token compare, backend POST. — `www/app.js`

- [x] T020 ✅ [US2] Write `registerTokenWithBackend()` — line 441; POST to `/register-token`. — `www/app.js`

- [x] T021 ✅ [US2] Write push handler and response flow — `showTodayMessage()` at line 617;
  routes `scheduled_contact`, `reminder_1`, `reminder_2`, `escalation_started`, `escalation_complete`.
  Cards stack (append) for reminders; replace for scheduled_contact. — `www/app.js`

- [x] T022 ✅ [P] [US2] Contact-response screen markup — merged into `screen-today`;
  `.iona-card`, `.card--oran` with character-matched borders; thread/empty toggle. — `www/index.html`

- [x] T023 ✅ [P] [US2] Contact-response screen styles — `.iona-card`, `.card--oran`,
  `.iona-msg`, btn-okay / btn-alert pulse states. — `www/style.css`

**Checkpoint**: Push registers post-login and on re-login. Notifications arrive and
response flow works. Run quickstart 2, 3a–3c before proceeding.

---

## Phase 5: User Story 3 — Raise the Alarm (Priority: P1)

**Goal**: Alarm fires with 10-second cancel window. Countdown is visible. Cancel
returns to home with no backend call. Commit fires POST. Active state persists.
Terminal state is always shown. No silent path.

**Prerequisite**: T007 (google-services.json) complete. Push registration (Phase 4)
working — FCM token in Preferences is required for the alarm POST.

**Independent test**: Quickstart scenarios 4a, 4b, 4c, 4d, 4e.

- [x] T024 ✅ [US3] `@capacitor/keep-awake` installed and synced; used throughout escalation states. — `package.json`

- [x] T025 ✅ [US3] Alarm constants and `getCancelWindowSeconds()` at line 480. — `www/app.js`

- [x] T026 ✅ [US3] `playAlarmSiren()`, `playPulseTone()`, `playArrivalPing()`, `playVoiceMessage()`
  at lines 97–195; AudioContext-based tone synthesis. — `www/app.js`

- [x] T027 ✅ [US3] Escalation state restore on launch — `checkSession()` (line 246) and
  `onLoginSuccess()` (line 269) both read `escalation_state` and route to correct screen. — `www/app.js`

- [x] T028 ✅ [US3] Alarm button (btn-alert) tap handler — precondition check, `keepAwake()`,
  `escalation_state → "active"`, countdown start. — `www/app.js`

- [x] T029 ✅ [US3] Countdown timer — `showCancelWindowState()` at line 484; cancel stops tone,
  resets state; zero fires commit. — `www/app.js`

- [x] T030 ✅ [US3] Alarm POST and error handling — `commitEscalation()` at line 577;
  POST `/pwa-respond` with `response: "alert"`; retry on fail. — `www/app.js`

- [x] T031 ✅ [US3] Escalation-complete FCM handler — `handleEscalationComplete()` at line 642;
  sets `escalation_state → "terminal"`, `allowSleep()`, shows terminal screen. — `www/app.js`

- [x] T032 ✅ STOP RESOLVED — Terminal copy approved and shipped:
  "I've tried your contacts." / "If someone is able to help, they are on their way." — `www/index.html`

- [x] T033 ✅ [P] [US3] Alarm screen markup — `alarm-countdown-card`, `alarm-escalation-card`,
  `alarm-terminal-card` in `screen-today`; "Calling your contacts" heading. — `www/index.html`

- [x] T034 ✅ [P] [US3] Alarm and escalation styles — countdown card, escalation card,
  terminal card, btn-cancel. — `www/style.css`

**Checkpoint**: Full alarm flow works — cancel, commit, active state, terminal state.
Run quickstart 4a–4e before proceeding.

---

## Phase 6: User Story 4 — Set Up the App (Priority: P2)

**Goal**: Signed-in user can view their listed contacts in order. First-time setup
prompt shown on login. Changes persist.

**Independent test**: Quickstart scenario 5.

- [ ] T035 [US4] Write setup screen handler in `www/app.js` — fetch contact list
  from backend using Memberstack JWT or FCM token (confirm endpoint with backend);
  display contacts in `order` sequence with natural name formatting; no raw field
  names, no provenance labels; first-time prompt: check a Preferences flag on home
  screen load, guide to setup if not seen — `www/app.js`
  **Status**: NOT DONE — `screen-setup` markup exists but no `initSetup()` or contact-fetching
  logic in app.js. Nav tabs currently route to settings overlay only.

- [x] T036 ✅ [P] [US4] Setup screen markup shell — `screen-setup` with `setup-contacts-list`
  container and `btn-setup-back` in `www/index.html`. Data layer pending T035. — `www/index.html`

- [ ] T037 [P] [US4] Add setup screen styles to `www/style.css` — contact list,
  contact item, order indicator — `www/style.css`
  **Status**: Pending T035 implementation.

**Checkpoint**: Contact list displays correctly, first-time prompt shows, settings
persist. Run quickstart scenario 5.

---

## Phase 7: User Story 5 — Complete Journey on One Device (Priority: P2)

**Goal**: Confirm the web-to-app handoff requires no desktop action.

**Independent test**: Quickstart scenario 6.

- [x] T038 ✅ [US5] Run quickstart scenario 6 end-to-end — confirmed 2026-06-21:
  website signup → member created in Memberstack + Airtable → OTP email received →
  code entry → app login successful. No code changes required. — `specs/001-receiving-app/quickstart.md`

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T039 ✅ §II vocabulary compliance pass — all user-facing strings reviewed and updated;
  banned terms removed; character-matched card vocabulary (Iona/Oran). — `www/index.html`, `www/app.js`

- [x] T040 ✅ Syntax check — `node --check www/app.js` passes clean. — `www/app.js`

- [x] T041 ✅ [P] Sync and build — `npx cap sync android` + Gradle build installed to
  device 12251JEC214674; confirmed on-device. — `android/`

- [x] T042 ✅ Full quickstart validation — SC-001, SC-002, SC-003 passed 2026-06-21
  on device 12251JEC214674. SC-004–SC-008 validated by live test cycle same session.
  Full end-to-end cycle (scheduled contact → reminder 1 → reminder 2 → escalation →
  terminal) confirmed working. — `specs/001-receiving-app/quickstart.md`

  **SC-001 ✅ PASSED** — sign-in < 2 min (target). Scenario 6 confirmed: website
  signup → OTP email → code entry → home screen, well within 2 minutes.

  **SC-002 ✅ PASSED** — home screen < 3s on relaunch (target). Logcat confirmed:
  app resumed at 17:42:19.086; home screen rendered immediately (no login re-prompt,
  session persisted via Preferences).

  **SC-003 ✅ PASSED** — push send-to-display ~1s across all notification types
  (target <10s). Measured live via server log + adb logcat 2026-06-21:
  - Scheduled contact: sent 17:49:55 → received 17:49:56.263 (~1s)
  - Reminder 1:        sent 17:55:03 → received 17:55:04.730 (~1s)
  - Reminder 2:        sent 18:00:15 → received 18:00:15.138 (<1s)
  - escalation_started: sent 18:05:19 → received 18:05:21.555 (~2s)
  - escalation_complete: sent 18:05:23 → received 18:05:42.076 (~19s — IVR call
    handling time, not FCM latency; not subject to SC-003)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion
  - T008 and T009 are STOP tasks — both must resolve before Phase 3+
- **US1 (Phase 3)**: Depends on Phase 2 completion
- **US2 (Phase 4)**: Depends on Phase 3 (login must work before push registers);
  also depends on T007 (google-services.json)
- **US3 (Phase 5)**: Depends on Phase 4 (FCM token in Preferences required for
  alarm POST); T032 (terminal copy) is a STOP within Phase 5
- **US4 (Phase 6)**: Depends on Phase 3 (login); can run alongside Phase 5
- **US5 (Phase 7)**: Depends on Phases 3–6 all complete
- **Polish (Phase 8)**: Depends on all user story phases complete

### Within Each Phase

- Logic tasks in `www/app.js` are sequential (single file)
- Markup tasks in `www/index.html` marked [P] with style tasks in `www/style.css`
  — different files, parallel within a story once screen structure is designed

### STOP Tasks

| Task | What | Status |
|------|------|--------|
| T007 | google-services.json download | ✅ Resolved |
| T008 | Memberstack custom field name | ✅ Resolved — `'airtable-id'` |
| T009 | pwa_sender.py field + value | ✅ Resolved — `data.type` confirmed |
| T032 | Terminal state copy | ✅ Resolved — copy approved and shipped |

---

## Parallel Opportunities

```
Phase 1:  T001 → T002 → T003, T004 [P], T005 [P] → T006 → T007 [STOP]
Phase 2:  T008 [STOP] + T009 (parallel with each other) → T010, T011 [P] → T012
Phase 3:  T013 → T014 → T015 → T016 [P] + T017 [P]
Phase 4:  T018 → T019 → T020 → T021 → T022 [P] + T023 [P]
Phase 5:  T024 → T025 → T026, T027 [P] → T028 → T029 → T030 → T031
          → T032 [STOP] → T033 [P] + T034 [P]
Phase 6:  T035 → T036 [P] + T037 [P]   (can run alongside Phase 5)
Phase 7:  T038
Phase 8:  T039 → T040 → T041 [P] → T042
```

---

## Implementation Strategy

### MVP (US1 + US2 only — Phases 1–4)

1. Complete Setup (Phase 1) — including T007 STOP
2. Complete Foundational (Phase 2) — including T008 and T009 STOPs
3. Complete US1: Sign In (Phase 3) — run quickstart 1a–1d
4. Complete US2: Receive Scheduled Contact (Phase 4) — run quickstart 2, 3a–3c

**At this point**: App can sign in, persist sessions, register for push, receive
scheduled contacts, and respond. This is a deployable increment.

### Add Alarm (US3 — Phase 5)

5. Complete US3: Raise the Alarm — including T032 STOP for terminal copy review
6. Run quickstart 4a–4e

### Full V1 (US4 + US5 + Polish — Phases 6–8)

7. Complete US4: Set Up (can run alongside Phase 5)
8. Complete US5: Full Journey validation
9. Run Polish phase — vocabulary pass, syntax check, full quickstart

---

## Task Count

| Phase | Tasks | Done | Open |
|-------|-------|------|------|
| Setup | T001–T007 | 7 | 0 |
| Foundational | T008–T012 | 5 | 0 |
| US1 Sign In | T013–T017 | 5 | 0 |
| US2 Scheduled Contact | T018–T023 | 6 | 0 |
| US3 Raise Alarm | T024–T034 | 11 | 0 |
| US4 Set Up | T035–T037 | 1 | 2 (T035, T037) |
| US5 Full Journey | T038 | 1 | 0 |
| Polish | T039–T042 | 4 | 0 |
| **Total** | **42** | **40** | **2** |

### Open items (v1 remaining)
- **T035** — setup screen handler (contacts list, first-time prompt) — `www/app.js`
- **T037** — setup screen styles (depends on T035) — `www/style.css`
