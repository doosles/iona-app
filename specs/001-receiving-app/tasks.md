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

- [ ] T001 Install npm dependencies — run `npm init -y` then
  `npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/push-notifications @capacitor/preferences` in repo root — `package.json`

- [ ] T002 Initialise Capacitor — run `npx cap init "Iona" "com.iona.app" --web-dir www` in repo root — `capacitor.config.json`

- [ ] T003 Create `www/` directory and `www/index.html` with the full app shell:
  all screen `<div>` containers (screen-check, screen-login, screen-home,
  screen-contact, screen-alarm-active, screen-alarm-terminal, screen-setup);
  Memberstack script tag (data-memberstack-app attribute); link to style.css;
  script tag for app.js — `www/index.html`

- [ ] T004 [P] Create `www/style.css` with base dark-theme styles, `.hidden`
  utility class, and placeholder blocks for each screen — `www/style.css`

- [ ] T005 Create `www/app.js` stub — empty module with section comments for each
  major concern (constants, utilities, auth, push, alarm, contact-response, setup);
  no logic yet — `www/app.js`

- [ ] T006 Add Android platform and sync — run `npx cap add android` then
  `npx cap sync android` — `android/`

- [ ] T007 ⛔ STOP — **Human download step**: Firebase Console →
  Project settings → howsu-9a479 → download `google-services.json` → place at
  `android/app/google-services.json`. Do not proceed to any push or alarm task
  until owner confirms this file is in place — `android/app/google-services.json`

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

- [ ] T010 Write Preferences utility functions in `www/app.js` — `getPreference(key)`,
  `setPreference(key, value)`, `removePreference(key)` using `Capacitor.Plugins.Preferences`;
  swallow errors, return null on failure — `www/app.js`

- [ ] T011 Write screen routing utilities in `www/app.js` — `show(screenId)` (hides all
  `.screen` divs, removes `.hidden` from target); `setMsg(id, text)` — `www/app.js`

- [ ] T012 Write Memberstack initialisation in `www/app.js` — polling loop
  (`window.$memberstackDom` check, up to 40 × 200 ms); on load failure set status
  message and return; on success fetch `memberConfig` via `getCurrentMember()` and
  hold in module-level variable (never fetched again on alarm path) — `www/app.js`

**Checkpoint**: Preferences, routing, and Memberstack init complete. All field names
confirmed. User story work can begin.

---

## Phase 3: User Story 1 — Sign In (Priority: P1)

**Goal**: User can sign in with email + 6-digit code, session persists across
restarts, logout clears all state cleanly and re-login re-registers push.

**Independent test**: Quickstart scenarios 1a, 1b, 1c, 1d.

- [ ] T013 [US1] Write session check on `window` load in `www/app.js` — call
  `ms.getCurrentMember()`; if member returned: store `member_airtable_id` to
  Preferences using confirmed field name (T008), show home screen; if not: show
  sign-in screen — `www/app.js`

- [ ] T014 [US1] Write sign-in flow in `www/app.js` — send-code button handler
  calls `ms.sendMemberLoginPasswordlessEmail({ email })`; verify button handler
  calls `ms.loginMemberPasswordless({ email, passwordlessToken })`; on success:
  extract `airtable_record_id` from `member.data.customFields[<confirmed name>]`,
  validate it starts with `"rec"` (fail loud if absent), store to Preferences,
  store `memberConfig` in memory, show home screen — `www/app.js`

- [ ] T015 [US1] Write logout in `www/app.js` — logout button handler calls
  `ms.logout()`, then removes Preferences keys `fcm_token`, `member_airtable_id`,
  `escalation_state`, then shows sign-in screen — `www/app.js`

- [ ] T016 [P] [US1] Add sign-in screen markup to `www/index.html` — email input,
  send-code button, code section (initially hidden), 6-digit code input, verify
  button, error message paragraph — `www/index.html`

- [ ] T017 [P] [US1] Add sign-in screen and home screen styles to `www/style.css` —
  input, button, error message, and home screen layout — `www/style.css`

**Checkpoint**: Sign in, session persistence, and logout work. Run quickstart 1a–1d
before proceeding.

---

## Phase 4: User Story 2 — Receive Scheduled Contact (Priority: P1)

**Goal**: Device is registered for push post-login. Notifications arrive in all
app states. User can respond. Registration survives logout/re-login.

**Prerequisite**: T007 (google-services.json in place) and T008 (field name
confirmed) must be complete before running push tasks.

**Independent test**: Quickstart scenarios 2, 3a, 3b, 3c.

- [ ] T018 [US2] Write push notification listener setup in `www/app.js` — attach
  all four listeners at app init (before login, so they are ready): `registration`,
  `registrationError`, `pushNotificationReceived`, `pushNotificationActionPerformed`;
  listeners are attached once only — `www/app.js`

- [ ] T019 [US2] Write post-login push registration in `www/app.js` — called after
  successful login and after logout/re-login; call `PushNotifications.requestPermissions()`;
  on granted: call `PushNotifications.register()`; `registration` callback: compare
  new token to stored, if different store to Preferences and call
  `registerTokenWithBackend()`; `registrationError`: log, show non-alarming warning —
  `www/app.js`

- [ ] T020 [US2] Write `registerTokenWithBackend(fcmToken, airtableRecordId)` in
  `www/app.js` — POST to `/register-token` with `{ token: fcmToken, member_id: airtableRecordId }`;
  on fail: log, show soft "setup incomplete" warning, offer retry; on success: silent —
  `www/app.js`

- [ ] T021 [US2] Write scheduled-contact-response screen handler in `www/app.js` —
  on `pushNotificationReceived` with confirmed `data.type` value (T009): show
  contact-response screen with notification body; on `pushNotificationActionPerformed`
  with same type: same; unknown type: open home screen; response button POST
  `/pwa-respond` with `{ fcm_token, response: <confirmed value from T009> }`; on 200:
  show confirmation and next contact time if present; on fail: non-alarming error,
  retry enabled — `www/app.js`

- [ ] T022 [P] [US2] Add contact-response screen markup to `www/index.html` —
  message display, response button (copy: owner confirms label before this task,
  direction: "I'm here" / "All good" / "Got it" — no "okay"), confirmation area —
  `www/index.html`

- [ ] T023 [P] [US2] Add contact-response screen styles to `www/style.css` —
  message, response button, confirmation state — `www/style.css`

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

- [ ] T024 [US3] Install `@capacitor/keep-awake` — run
  `npm install @capacitor/keep-awake` then `npx cap sync android` — `package.json`,
  `android/`

- [ ] T025 [US3] Write alarm constants and config helper in `www/app.js` —
  `const ALARM_CANCEL_WINDOW_SECONDS = 10;` at top of module;
  `function getCancelWindowSeconds(memberConfig)` returns
  `memberConfig?.alarmCancelWindow ?? ALARM_CANCEL_WINDOW_SECONDS`;
  `memberConfig` is the in-memory object loaded at login (T012) — never fetched
  here — `www/app.js`

- [ ] T026 [US3] Write `playAlarmTone()` in `www/app.js` — `AudioContext` +
  `OscillatorNode`; sine wave, duration and frequency are build-time design constants;
  store oscillator/context reference for cancellation; wrap in try/catch, swallow
  errors and log — `www/app.js`

- [ ] T027 [US3] Write escalation state restore on app launch in `www/app.js` —
  read `escalation_state` from Preferences on init; if `"active"`: call
  `KeepAwake.keepAwake()` and show active-escalation screen; if `"terminal"`:
  show terminal screen; if `"idle"` or absent: show home screen — `www/app.js`

- [ ] T028 [US3] Write alarm button tap handler in `www/app.js` — precondition
  check: `escalation_state` must be `"idle"` and `fcm_token` must be present (fail
  loud with clear screen message if not); on pass: call `playAlarmTone()`, set
  `escalation_state` → `"active"` in Preferences, `KeepAwake.keepAwake()`, show
  active-escalation screen, start countdown — `www/app.js`

- [ ] T029 [US3] Write countdown timer logic in `www/app.js` — count down from
  `getCancelWindowSeconds(memberConfig)` updating the visible display each second;
  cancel button tap: stop tone, set `escalation_state` → `"idle"`, `allowSleep()`,
  show home screen, no backend call; on zero: hide cancel button, update screen copy
  to committed state, fire alarm POST — `www/app.js`

- [ ] T030 [US3] Write alarm POST and error handling in `www/app.js` — POST
  `/pwa-respond` with `{ fcm_token, response: "alert" }`; on network error or
  non-200: show visible warning + retry on active screen (do not revert to idle);
  on success: await `escalation_complete` FCM signal — `www/app.js`

- [ ] T031 [US3] Write escalation-complete FCM handler in `www/app.js` — on
  `pushNotificationReceived` / `pushNotificationActionPerformed` with
  `type: "escalation_complete"` (confirmed field name from T009): set
  `escalation_state` → `"terminal"`, `allowSleep()`, show terminal screen; add
  manual-close timeout: after defined duration (build-time constant) show close
  action; on close: `escalation_state` → `"idle"` — `www/app.js`

- [ ] T032 [US3] ⛔ STOP — **Terminal state copy requires owner review**. Propose
  the terminal screen copy before writing it: Iona-voice, vocabulary-compliant,
  warm and honest, attempt language only (no outcome implied). Show proposed copy
  and wait for approval. Then add terminal state content to markup and wire it in
  `www/app.js` — `www/index.html`, `www/app.js`

- [ ] T033 [P] [US3] Add alarm button, active-escalation screen, and terminal
  state screen markup to `www/index.html` — alarm button on home screen; active
  screen: message area, visible countdown display, cancel button; terminal screen:
  content area (populated after T032 approved), close action — `www/index.html`

- [ ] T034 [P] [US3] Add alarm and escalation screen styles to `www/style.css` —
  alarm button (min 48×48 dp touch target), cancel button (min 48×48 dp, one-handed
  reach), countdown display, active-escalation screen layout, terminal screen layout —
  `www/style.css`

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

- [ ] T036 [P] [US4] Add setup screen markup to `www/index.html` — contact list
  container, individual contact item template, navigation link from home screen —
  `www/index.html`

- [ ] T037 [P] [US4] Add setup screen styles to `www/style.css` — contact list,
  contact item, order indicator — `www/style.css`

**Checkpoint**: Contact list displays correctly, first-time prompt shows, settings
persist. Run quickstart scenario 5.

---

## Phase 7: User Story 5 — Complete Journey on One Device (Priority: P2)

**Goal**: Confirm the web-to-app handoff requires no desktop action.

**Independent test**: Quickstart scenario 6.

- [ ] T038 [US5] Run quickstart scenario 6 end-to-end — web sign-up on Android
  device browser → open app → sign in → receive service → document result; no
  code changes expected; if handoff fails, identify the gap and raise it before
  proceeding — `specs/001-receiving-app/quickstart.md`

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T039 §II vocabulary compliance pass — review every user-facing string in
  `www/index.html` and `www/app.js` against the banned list: "check-in", "okay"
  in copy, "roster", clinical terms, alarming language, system jargon, provenance
  labels; also verify Iona referred to by name only; check backend notification
  strings in howsu workspace `pwa_sender.py` — `www/index.html`, `www/app.js`

- [ ] T040 Syntax check — run `node --check www/app.js`; fix any reported errors
  before committing — `www/app.js`

- [ ] T041 [P] Sync and build — run `npx cap sync android` then
  `npx cap run android --target <device-id>` to produce and install final APK —
  `android/`

- [ ] T042 Full quickstart validation — run all scenarios from quickstart.md
  (1a through vocabulary spot-check) on the physical Android device; record pass/
  fail against each success criterion (SC-001 through SC-008) —
  `specs/001-receiving-app/quickstart.md`

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

### STOP Tasks (human action or owner review required)

| Task | What | Do not proceed past until |
|------|------|--------------------------|
| T007 | google-services.json download | Owner confirms file at `android/app/google-services.json` |
| T008 | Memberstack custom field name | Exact field name confirmed from live member object |
| T009 | pwa_sender.py field + value | data.type and response value confirmed and recorded |
| T032 | Terminal state copy | Owner approves proposed copy |

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

| Phase | Tasks | STOP tasks |
|-------|-------|-----------|
| Setup | T001–T007 | 1 (T007) |
| Foundational | T008–T012 | 2 (T008, T009) |
| US1 Sign In | T013–T017 | 0 |
| US2 Scheduled Contact | T018–T023 | 0 |
| US3 Raise Alarm | T024–T034 | 1 (T032) |
| US4 Set Up | T035–T037 | 0 |
| US5 Full Journey | T038 | 0 |
| Polish | T039–T042 | 0 |
| **Total** | **42** | **4** |
