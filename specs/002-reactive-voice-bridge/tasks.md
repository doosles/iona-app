# Tasks: Reactive Voice Bridge (002)

**Input**: Design documents from `specs/002-reactive-voice-bridge/`

**Prerequisites**: plan.md ✅ · spec.md ✅ · research.md ✅ · data-model.md ✅ · contracts/ ✅ · quickstart.md ✅

**Tests**: No automated tests requested. Validation via quickstart.md scenarios on physical hardware.

**Organization**: Tasks grouped by user story. US1 is the core safety path — US2 and US3 depend on it.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Parallelizable (different functions/files, no inter-dependencies)
- **[Story]**: User story this task belongs to (US1, US2, US3)

## Path conventions

- Backend routes: `reply_to_airtable_webhook.py` (surgical — **never regenerate in full**)
- Native plugin: `android/app/src/main/java/com/iona/app/TwilioVoicePlugin.java`
- JS engine + UI: `www/app.js`
- Settings UI: `www/index.html` (surgical — settings overlay section only)
- Config: `config.py`
- Mockup: `specs/002-reactive-voice-bridge/mockup.md` (or equivalent)

---

## Phase 1: Setup — Airtable Field IDs (Blocking Prerequisite)

**Purpose**: Retrieve and register all Airtable field IDs before any backend work begins. Constitution §IV: field IDs, not field names.

**⚠️ CRITICAL**: All Phase 2 backend tasks are blocked until T001 is complete.

- [ ] T001 Retrieve Airtable field IDs for all 6 contact name fields, all 6 contact phone fields, and the GA plan field from the Airtable schema; add all as named constants to `config.py` (e.g. `CONTACT_1_NAME_FIELD_ID = "fldXXX"`)

**Checkpoint**: `config.py` contains 13 field ID constants (12 contact + 1 plan). No field names used in backend code.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend routes, TwiML endpoints, and native plugin extension that all user stories depend on. No JS bridge engine work can be end-to-end tested until this phase is complete.

**⚠️ CRITICAL**: No user story implementation can be fully tested until this phase is complete.

- [ ] T002 Add `GET /bridge/contacts` route in `reply_to_airtable_webhook.py` — read `member_airtable_id` param, fetch member record from Airtable using field ID constants from `config.py`, verify GA plan field (403 if not entitled, 404 if not found), return ordered `[{index, name, phone}]` skipping empty phone slots; contract: `contracts/bridge-contacts.md`

- [ ] T003 Add `POST /bridge/dial-contact` route in `reply_to_airtable_webhook.py` — accept `conference_name`, `contact_phone`, `contact_index`; issue Twilio REST call with `Url` pointing to `/twiml/bridge-contact-prompt`; extends `_handle_inh_trigger` pattern; contract: `contracts/bridge-dial-contact.md`

- [ ] T004 [P] Add `GET /twiml/bridge-contact-prompt` route in `reply_to_airtable_webhook.py` — `<Gather numDigits="1" timeout="10" action="/twiml/bridge-contact-confirm?conference_name=X">` with Oran TTS placeholder `<Say>`; on timeout `<Hangup>`; accepts `conference_name` and `user_name` params; `user_name` injected into Say text; contract: `contracts/twiml-contact-prompt.md`

- [ ] T005 [P] Add `GET /twiml/bridge-contact-confirm` route in `reply_to_airtable_webhook.py` — on keypress: `<Dial><Conference endConferenceOnExit="true" beep="false">{conference_name}</Conference></Dial>`; contact is anchor — this is what ends the call; contract: `contracts/twiml-contact-prompt.md`

- [ ] T006 [P] Add `GET /twiml/wait-audio` route in `reply_to_airtable_webhook.py` — TTS fallback: `<Say voice="[Oran voice]" loop="0">` with placeholder copy; if MP3 URL configured and reachable use `<Play loop="0">`; silence is never an acceptable fallback; contract: `contracts/twiml-wait-audio.md`

- [ ] T007 Extend `_handle_twiml_conference` in `reply_to_airtable_webhook.py` (surgical) — add optional `waitUrl` query param; when `leg=user` and `bridge=true` present, include `waitUrl` attribute in `<Conference>` element pointing to `/twiml/wait-audio`; existing calls without these params are unaffected; contract: `contracts/twiml-wait-audio.md`

- [ ] T008 `TwilioVoicePlugin.java` — in `callListener.onDisconnected`, when `error != null` add `data.put("involuntary", true)` to the event payload before calling `notifyListeners("disconnected", data)`; one-line addition; see data-model.md FR-007/FR-014 routing

**Checkpoint**: Foundation ready. Backend routes return correct responses. Java plugin sends `involuntary` flag. Bridge engine JS can now be tested end-to-end.

---

## Phase 3: User Story 1 — Person Summons Help, Contact Reached (Priority: P1) 🎯 MVP

**Goal**: A single tap initiates the full contact-cycling bridge, confirms live human via IVR, connects both parties hands-free. Only the contact can end the call.

**Independent Test**: One press → contact answers + presses key → live hands-free two-way audio → contact hangs up → resolved state. EventLog shows full chain.

### Mockup Gate (§III — Hard)

> ⚠️ **Do not implement any UI task (T016, T017) until T009 is confirmed by user.**

- [ ] T009 [US1] Create bridge UI state mockup in `specs/002-reactive-voice-bridge/mockup.md` — show all states within the today-screen: `summoning/dialing`, `in_call`, `already_connecting`, `terminal_exhausted`, `terminal_duration`, `error`; present for review before any UI code

### Implementation

- [ ] T010 [US1] `www/app.js` — implement `summonHelp(triggerSource)`: check state (`already_connecting` → FR-015 return), check contacts (`no contacts` → visible message return), check GA tier (`not entitled` → visible message return), all-clear → `bridgeEngine.start(contacts, conferenceId, triggerSource)`; this is the single entry point for all trigger sources (FR-002)

- [ ] T011 [US1] `www/app.js` — implement `BridgeAttempt` runtime state object: `conferenceId` generated as `bridge-{member_airtable_id}-{Date.now()}`, `state` enum (all values from data-model.md state machine), `contacts[]`, `currentIndex`, `reconnectAttempted`, `startTime`, `triggerSource`

- [ ] T012 [US1] `www/app.js` — implement `bridgeEngine.start()`: set state `summoning`, `GET /bridge/contacts` fetch, on success set state `dialing` and call `connectOutbound()` for `contacts[0]`; on fetch failure → `error` state (FR-012: visible error, never silent)

- [ ] T013 [US1] `www/app.js` — implement contact ladder: 30s ring timeout handler; on timeout (or no-answer signal) → advance `currentIndex`; if next contact exists → `connectOutbound()` for `contacts[currentIndex]`; if exhausted → `terminal_exhausted` state; reset `reconnectAttempted` when index advances

- [ ] T014 [US1] `www/app.js` — implement FR-007/FR-014 `onDisconnected` routing: listen for `disconnected` event from plugin; if `event.involuntary` is falsy → state `resolved`; if `event.involuntary` is true → state `reconnecting`; if `reconnectAttempted === false` → set true, `connectOutbound()` to same `conferenceId`; if reconnect fails/times out → advance `currentIndex` and continue ladder; data-model.md FR-007/FR-014 routing diagram is the authoritative reference

- [ ] T015 [US1] `www/app.js` — implement max-duration watchdog: `setTimeout(240000)` at summon time; on fire → `TwilioVoice.hangup()`, state `terminal_duration`, EventLog `BRIDGE_TERMINAL` with `reason: max_duration`; watchdog cannot be blocked by any in-progress call (FR-011)

- [ ] T016 [P] [US1] `www/app.js` — implement bridge UI: `summoning` / `dialing` state card in today-screen per T009 confirmed mockup ("Reaching your contacts…"); shown immediately on summon; requires T009 ✓

- [ ] T017 [P] [US1] `www/app.js` — implement bridge UI: `in_call` state card in today-screen per T009 confirmed mockup ("You're connected — hands-free"); no control to end call (FR-007); requires T009 ✓

- [ ] T018 [US1] `www/app.js` — implement EventLog writes for all 10 bridge event types: `BRIDGE_SUMMONED`, `BRIDGE_DIALING`, `BRIDGE_NO_ANSWER`, `BRIDGE_KEYPRESS`, `BRIDGE_CONNECTED`, `BRIDGE_DROPPED`, `BRIDGE_RECONNECT`, `BRIDGE_RECONNECT_FAILED`, `BRIDGE_RESOLVED`, `BRIDGE_TERMINAL`; on failure retry once (one short retry, same payload); if retry also fails, write to device console (`console.error`) — never silently dropped; a logging gap on a safety attempt contradicts "fail loudly, never silently"; the bridge MUST NOT block or stall on logging — logging failure is never a call-blocking condition; see research.md D8 for field spec

- [ ] T019 [US1] `www/app.js` — wire help control button to call `summonHelp('help_control')`; FR-001: no confirmation step

**Checkpoint**: Run quickstart.md **Scenario 1** (live call → hands-free → contact hangs up → resolved) and **Scenario 2** (contact doesn't answer → auto-advances to next contact). Both must pass on physical Pixel 4a before proceeding.

---

## Phase 4: User Story 2 — No Contact Reached; Terminal State (Priority: P2)

**Goal**: When all contacts are exhausted or max duration is hit, the person receives a clear, calm message — not an error, not silence.

**Independent Test**: All contacts set to ring-out / no-answer → all exhausted → terminal message shown, attempt ends cleanly.

- [ ] T020 [P] [US2] `www/app.js` — implement bridge UI: `terminal_exhausted` and `terminal_duration` state cards in today-screen per T009 confirmed mockup; copy is placeholder until T023; `terminal_exhausted` is an **interim ending** — engine calls `bridgeEngine.onExhausted()` (no-op placeholder, FR-016 seam) after showing the card; `terminal_duration` bypasses `onExhausted()` and ends unconditionally; requires T009 ✓

- [ ] T021 [P] [US2] `www/app.js` — implement bridge UI: `error` state in today-screen (FR-012: visible error — never silent); **interim ending** — error renders first, then engine calls `bridgeEngine.onExhausted()` (no-op placeholder, FR-016 seam); requires T009 ✓

- [ ] T022 [US2] `www/app.js` — implement bridge UI: `already_connecting` state (FR-015): when `summonHelp()` is called while state is non-idle, show visible "already connecting" overlay; no restart, no duplicate attempt; Oran audio continues

- [ ] T023 [US2] Write terminal message copy for `terminal_exhausted` / `terminal_duration` states — must be calm and clear; governed by FR-013 (promise attempt only, not outcome) and §II vocabulary (no "emergency", "alert", "care"); apply final copy to T020 implementation

**Checkpoint**: Run quickstart.md **Scenario 3** (all exhausted → terminal message), **Scenario 4** (drop recovery → continue contact list), **Scenario 5** (duplicate tap → already connecting), **Scenario 7** (visible failure on error). All must pass.

---

## Phase 5: User Story 3 — Orb as Summon Trigger (Priority: P3)

**Goal**: User can opt in to tapping the orb as a summon trigger. When OFF (default), orb is unchanged. When ON, orb fires `summonHelp('orb')`.

**Independent Test**: Enable orb trigger in Settings → tap orb → bridge initiates identically to help control.

- [ ] T024 [P] [US3] `www/app.js` — add `bridge_orb_trigger` Capacitor Preferences key (boolean, default false); read at orb interaction time; written by Settings toggle

- [ ] T025 [US3] `www/index.html` + `www/app.js` (surgical) — add new toggle row in Settings overlay: label "Summon by tapping the orb", default OFF; write `bridge_orb_trigger` to Preferences on change; read and apply on Settings load

- [ ] T026 [US3] `www/app.js` — orb tap handler: when `bridge_orb_trigger` is ON, call `summonHelp('orb')` after existing orb animation; when OFF, orb behaviour unchanged (FR-003)

**Checkpoint**: Run quickstart.md **Scenario 6** (orb trigger setting → tap orb → bridge identical to help control). Must pass.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T027 Write final Oran contact prompt copy for `GET /twiml/bridge-contact-prompt` — must state: who is calling (user by name) and that pressing the key accepts the connection; frame as accepting the call from the user (not responsibility for outcome); avoid banned vocabulary; placeholder: "[User's name] has asked to reach you — press 1 to connect."; apply to `reply_to_airtable_webhook.py` `/twiml/bridge-contact-prompt` handler

- [ ] T028 Write final Oran wait audio copy for `GET /twiml/wait-audio` — must promise the attempt, not the outcome (FR-013); avoid banned vocabulary; placeholder: "I'm trying to reach your contacts. Please hold on."; apply to `reply_to_airtable_webhook.py` `/twiml/wait-audio` handler

- [ ] T029 Full validation run — execute all 7 scenarios from `specs/002-reactive-voice-bridge/quickstart.md` on physical Pixel 4a with real PSTN numbers; confirm all pass and all EventLog entries are present with no blank fields

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on T001 (field IDs in config.py) — **blocks all user stories**
- **Phase 3 (US1)**: Depends on Phase 2 completion — **T009 mockup is an additional gate for T016, T017**
- **Phase 4 (US2)**: Depends on Phase 3 completion (summonHelp + bridge engine must exist)
- **Phase 5 (US3)**: Depends on Phase 3 completion (summonHelp must exist — orb calls it)
- **Phase 6 (Polish)**: Depends on all user story phases

### User Story Dependencies

- **US1 (P1)**: Starts after Phase 2. No dependency on US2 or US3. Core path.
- **US2 (P2)**: Depends on US1 (terminal states require the engine to run to exhaustion). T020–T022 UI tasks also depend on T009 mockup confirmed.
- **US3 (P3)**: Depends on US1 (orb calls `summonHelp()` which requires the engine to exist). Can run in parallel with US2.

### Within Phase 3 (US1)

```
T009 (mockup gate) → must confirm before T016, T017
T010 (summonHelp)  → T011 → T012 → T013
T014 (FR-014)      depends on T012 (engine) + T013 (ladder)
T015 (watchdog)    depends on T011 (state object)
T016, T017 (UI)    depends on T009 confirmed
T018 (EventLog)    can run alongside T010–T017 but needs state machine in T011
T019 (wire button) depends on T010
```

### Parallel Opportunities

Tasks marked `[P]` can be worked simultaneously (different code sections):
- T004, T005, T006 — three separate route functions in `reply_to_airtable_webhook.py`
- T016, T017 — two separate UI state cards in app.js (after T009 confirmed)
- T020, T021 — two separate UI state cards in app.js (after T009 confirmed)
- T024 — Preferences key; independent of T025 Settings UI and T026 orb handler

---

## Implementation Strategy

### MVP (Phase 1 + Phase 2 + Phase 3 = US1 only)

1. T001 — add field IDs to config.py
2. T002–T008 — all backend routes + Java plugin
3. T009 — mockup review (gate)
4. T010–T019 — bridge engine + help control wiring
5. **Validate**: quickstart.md Scenarios 1 + 2 on Pixel 4a
6. **Stop and confirm** before continuing to US2/US3

### Incremental from MVP

- Add US2 (T020–T023) → validate Scenarios 3, 4, 5, 7
- Add US3 (T024–T026) → validate Scenario 6
- Polish (T027–T029) → full 7-scenario run before ship

---

## Notes

- `reply_to_airtable_webhook.py` — SURGICAL EDITS ONLY. Never regenerate in full. Full regeneration re-introduces hardcoded credentials causing 401 errors.
- Every task that touches `reply_to_airtable_webhook.py` adds a new route function or extends an existing one — never rewrites surrounding code.
- T009 (mockup) is a hard gate enforced by constitution §III — UI code starts only after mockup is confirmed.
- T023 (terminal copy) is a copy task — words first, then applied in T020. Write both variants: `terminal_exhausted` (calm "no one available" — interim ending) and `terminal_duration` (calm "ran out of time" — true ceiling ending).
- ⚠️ **COPY-SYNC (T023 `terminal_exhausted` only):** since the 2026-06-26 server-driven background terminal, the spoken exhausted line is hardcoded in TWO places that MUST stay in sync — (1) server-side: `reply_to_airtable_webhook.py` StatusCallback fallback, plus the `terminal_message` sent from `www/app.js` `_dialCurrentContact`; (2) app-side: the `showBridgeCard()` terminal card (T020). The server plays it when the app is backgrounded; the card shows it on foreground — reword BOTH or the user hears one thing and sees another. (`terminal_duration` and the T027/T028 TwiML copy are single-source — server or app only — and unaffected.) Full rationale: master reference §22 "Copy-sync trap".
- `terminal_exhausted` and `error` are interim absorbing states with a no-op `bridgeEngine.onExhausted()` hook. When the device fallback feature (FR-016) is built, the hook is replaced — the bridge engine and its UI cards do not change.
- `terminal_duration` is the only state without a hand-off hook. Absolute time ceiling for both passes combined — fires unconditionally.
- T027 and T028 (contact prompt + wait audio copy) are copy tasks — the placeholders are acceptable for all earlier validation; these must be replaced before ship.
- EventLog writes (T018): retry once on failure; if retry fails, write to `console.error` — never silently dropped, never blocking. A logging gap on a safety attempt contradicts "fail loudly, never silently." The bridge MUST continue regardless of logging outcome.
- The `involuntary` flag from Java (T008) is read by the bridge engine (T014). T014 depends on T008.
