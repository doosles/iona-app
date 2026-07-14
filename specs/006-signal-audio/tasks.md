# Tasks: Oran's Signal Escalation Audio — device-side replica of the bridge audio (merged scope, R-006-6)

**Input**: `/specs/006-signal-audio/` — spec.md (merged scope), plan.md, BRIEF_escalation_advance_engine_touch.md
**Feature**: The Signal escalation plays the bridge's reaching audio on the member's device — Iona handover →
per-contact "Trying to reach [Name]" + **channel-gated** UK ringback → handoffs → spoken terminal ("I've
reached [Name]…" / method-aware exhausted) — synced by a new **`escalation_advance`** signal. Non-call; audio only.

**Load-bearing fences (captain, preserve verbatim):**
1. **Honesty (Condition 1):** ring **only** on a genuine **call** attempt; SMS attempt → named line + pause, no
   ring; lost signal → no ring. `escalation_advance` carries **channel**. Proven by T022.
2. **I.4 passenger:** the audio (incl. the emission) never blocks/delays/drives the engine. Proven by T023.
3. **Engine emission gated on the brief:** the `[ENG]` tasks (T012–T015) **do not start until the captain signs
   off `BRIEF_escalation_advance_engine_touch.md`** (Condition 2). Everything else runs in parallel.

## Build status — 2026-07-11 (full feature built end-to-end; on-device audition pending)

**Backend (verified):** deck **v1.5** · Polly pipeline · **`escalation_advance` emission** (harness direct
16/16 · bridge 12/12) · **T005** `/signal-audio/clips` endpoint (verified: renders per-contact base64 MP3
clips + handoffs, `version` tag). **App (`www/app.js`, `node --check` clean):** the **`SignalAudio` module**
+ cache/reconcile + FCM wiring — covers **T006–T011, T016–T021** (Iona handover, per-contact attempts +
**channel-gated** ring, between-contact handoffs, both spoken terminals, missing-clip/lost-signal fallbacks,
method gate, cache lifecycle on save/app-start/foreground). **Static clips bundled** in `www/audio/signal/`.

**Remaining:** **on-device deploy** (`cap copy` + `gradlew installDebug`) + server go-live → the owner's
**live pacing audition** (PRE-2 / T025) — the real replica on the Pixel during a test escalation. Minor
follow-ups: delete→clip GC (T011 — clips currently overwrite, not purge); method-aware exhausted
summon-source capture (currently the honest **both-options** default per FR-009); on-device matrix (T022–T024).
*(Per-task checkboxes below reconcile to on-device truth after the Pixel run, per the 005 pattern.)*

## Format & legend
`[ID] [Repo/Story] Description — ✓ pre-push check · DoD (on-device Pixel 4a) · (depends …)`
Repo: `[COPY]` deck · `[BE]` howsu backend · `[ENG]` **engine-touching (gated on brief)** · `[APP]` iona-app/www.
Story: US1 handover · US2 named attempts + handoffs · US3 channel-gated ring · US4 terminals · US5 offline/fallback · US6 passenger.

---

## Phase 0 — Gates
- [x] **PRE-1 — AWS Polly IAM LIVE** (howsu/.env; smoke-tested). Restart loads the AWS env → time with the backend deploy (T027).
- [x] ✅ **SIGNED OFF 2026-07-11 (R-006-8/9/10)** · **GATE-ENG — Captain sign-off of `BRIEF_escalation_advance_engine_touch.md`** (Condition 2). Includes the
  Point-1 mechanism (A: import vs **B: shared helper — recommended**) + channel-carrying + fire-and-forget
  mitigations. **Blocks T012–T015 only.**
- [~] **PRE-2 — Owner listening session (full replica)** — **clip-level audition PASSED provisionally**
  (2026-07-11: "all sounds okay"; voices/wording/ring/previews approved). The **FINAL pacing + wrinkle
  sign-off is deferred to a live on-device call** (the real emission-driven replica on the Pixel) — per owner,
  pacing is only judgeable in the live flow. Build-phase **sign-off gate** (T025).

---

## Phase 1 — Copy + static render (backend)
- [x] **T001 [COPY]** ✅ **DONE** — `escalation_copy.py` **v1.4**: `ACKNOWLEDGED_TMPL`/`ACKNOWLEDGED_GENERIC`
  ("I've reached…", R-006-7) + `COPY_VERSION="1.4"` + the character-rule amendment (Oran first-person in
  terminals). Bridge spot-check GREEN (byte-unchanged).
- [x] **T002 [BE]** ✅ **DONE** — Polly smoke (Arthur MP3 via config creds).
- [x] **T003 [BE]** ✅ **DONE** — `signal_audio_render.py` Polly wrapper (unescape, Amy/Arthur, warning-suppressed).
- [x] **T004 [BE]** ✅ **RENDERED 2026-07-11** — replica audition set: 10 voice clips (bare forms + "I've reached"), byte-faithful **UK ring bundled**, full-sequence + SMS-no-ring previews. R-006-10 flag **resolved** (deck v1.5 bare forms). **Owner audition = PRE-2, pending.** **Update `render_signal_static.py` for the merged scope + render/bundle the static set.**
  **Drop the 3 abstract tones** (cancelled, R-006-6); render the bare-form **gap "still trying" bed** (no
  "on the line" clause) + handover + exhausted ×3 + generic ack; **bundle the UK ringback** (`/audio/uk-ring`)
  into `www/audio/signal/`, all `COPY_VERSION`-tagged. **Owner auditions the static clips here (mockup gate).**
  — ✓ files render + play · DoD: static set bundled. (depends T003)
  - **⚑ Flag (confirm, don't invent):** the bare-form Signal gap/attempt wording (deck `GAP_FALLBACK`/
    `ATTEMPT_LINE_TMPL` carry "We're staying on the line with you" — a call-claim on Signal). Confirm the bare
    Signal wording with the deck owner before final render.

## Phase 2 — Per-contact generation (backend)
- [ ] **T005 [BE]** Per-contact render/serve endpoint in `reply_to_airtable_webhook.py`: given a recId, render
  the **attempt line** ("Trying to reach {name}.", `ATTEMPT_LINE_BARE_TMPL`), the **handoff half** ("There's no
  answer from {name}.", per plan §3 decomposition), and the **acknowledged line** (`ACKNOWLEDGED_TMPL`) per
  contact first name (backend-from-Airtable, Option B); response carries `COPY_VERSION`. recId auth (carried IDOR
  item). — ✓ `py_compile` + `grep -c 'ff"'`=0 · DoD: local call returns clips + version. (depends T003)

## Phase 3 — App playback foundation (parallel, placeholder clips)
- [ ] **T006 [P] [APP]** `SignalAudio` replica driver skeleton in `www/app.js` — state machine; `HTMLAudioElement`
  (`_playConfirmChime` idiom, `app.js:4501`) + `getAudioContext()` (`:108`); **media stream, full volume** (FR-018);
  **NOT `SpeechSynthesis`**. — ✓ `node --check` · DoD: plays a placeholder clip on the Pixel at media volume.
- [ ] **T007 [P] [APP]** Cache store/read infra — Filesystem clips + manifest (Preferences) with the `COPY_VERSION`
  tag. — ✓ `node --check` · DoD: a clip round-trips; manifest reads/writes its version.
- [ ] **T008 [APP]** Method gate + one-voice-switch — play **only** for method = Signal (never bridge, FR-016);
  one Iona→Oran switch. — ✓ `node --check` · DoD: a Speakerphone escalation plays nothing here. (depends T006)

## Phase 4 — Cache lifecycle (three explicit triggers)
- [ ] **T009 [LIFECYCLE][APP+BE]** **save/rename → (re)generate** per-contact clips (attempt/handoff-half/ack) via
  T005; cache keyed `(contact, COPY_VERSION)`. — ✓ `node --check` · DoD: save/rename caches; rename replaces. (depends T005, T007)
- [ ] **T010 [LIFECYCLE][APP]** **app-start reconcile** — version-mismatch/missing → regenerate (FR-019, SC-008);
  never at escalation time. — ✓ `node --check` · DoD: forced version change → regenerates on start. (depends T007, T009)
- [ ] **T011 [LIFECYCLE][APP]** **delete → clip GC** (spec edge case). — ✓ `node --check` · DoD: deleting a contact drops its clips. (depends T007)

## Phase 5 — `escalation_advance` emission (backend) — **⛔ GATED on GATE-ENG (Condition 2)**
- [x] **T012 [ENG][BE]** ✅ **DONE** (`pwa_sender.send_escalation_advance` — threaded, failure-swallowed, carries `channel`). Shared helper **`send_escalation_advance(record_id, contact_index, sweep, channel,
  contact_first, run_token)`** in `pwa_sender.py` — mirrors `send_bridge_data_push` (`pwa_sender.py:218`):
  **data-only + `android:{priority:"high"}`, NOT a notification, NOT alarm-class**; carries `type:"escalation_advance"`
  + the 5 fields. (brief rec **B** — one signal-builder, ADD-006-1 shared infra.) — ✓ `py_compile` · DoD: helper builds the payload. (depends GATE-ENG)
- [x] **T013 [ENG][BE]** ✅ **DONE**. **Point 1 emission** — `escalation_manager.run_escalation` after `make_call` (**:456**):
  fire-and-forget `send_escalation_advance(..., channel="call", contact_first=<:369>, index=<:382>, sweep=1)`.
  **Threaded** (parity + safety). Runner/webhook process both safe (FCM-from-runner already proven, :435). — ✓
  `py_compile` · DoD: initial fire emits one call-channel advance. (depends T012)
- [x] **T014 [ENG][BE]** ✅ **DONE** (channel from `touch_type`; SMS + call branches; no dedup). **Point 2 emission** — `_fire_one_touch` (webhook): **`channel = "sms" if touch_type ==
  "Alert Message" else "call"`** (from `touch_type` **:5177**), `contact_first` (**:5167**), fire-and-forget
  **threaded** (brief risk #2 — the final mobile SMS sweep walks synchronously :5229–5232). **No `(index,sweep)`
  dedup** (re-sweeps re-announce). — ✓ `py_compile` + `grep -c 'ff"'`=0 · DoD: each dial emits an advance with the
  correct channel. (depends T012)
- [x] **T015 [ENG][BE]** ✅ **DONE — direct 16/16 · bridge 12/12; emission fired + suppressed at every dial; zero regression**. **Passenger regression check** — escalation **harness stays green** (direct + bridge);
  the emission adds no engine path, no sweep/timing/terminal change, no state write; emit errors don't stall the
  sweep. — ✓ harness green · DoD: direct + bridge unchanged; a stubbed-throw emit doesn't delay the sweep. (depends T013, T014)

## Phase 6 — Replica wiring (app)
- [ ] **T016 [APP][US1]** `escalation_started` (FCM `app.js:569` / `showEscalationActiveState :855`) → Iona
  handover, begin the replica loop; gate on method (T008). — ✓ `node --check` · DoD: handover → Oran. **★ mockup audition rides here.**
- [ ] **T017 [APP][US2+US3]** `escalation_advance` handler → "Trying to reach {name}." + **channel-gated**: `channel=="call"`
  → UK ringback; `channel=="sms"` → pause (**no ring**); unknown/lost → no ring. Reuse `setContactStatus`
  (`:848`) so the 007 mirror inherits it (ADD-006-1). — ✓ `node --check` · DoD: call→ring, SMS→no ring, on the Pixel.
- [ ] **T018 [APP][US2]** Between-contact **handoff** — on advance, "There's no answer from {prev} — trying {name}
  now." (per plan §3). — ✓ `node --check` · DoD: advance → handoff heard.
- [ ] **T019 [APP][US4]** `escalation_complete` (`handleEscalationComplete :1621`) → **acknowledged** ("I've reached
  {contact_name}…"; generic if missing) / **exhausted** (method-aware, local summon source `_startHelpSequence :1207`);
  stop the loop. — ✓ `node --check` · DoD: both terminals correct, screen unread. (depends T009 for named ack)
- [ ] **T020 [APP][US5]** Fallback chain — missing/stale clip → generic/static bed (no wrong name, no fetch);
  **lost signal → generic "still trying" bed, no name, no ring**; first-run static-fallback; never silent (FR-013/014). — ✓ `node --check` · DoD: each path plays.
- [ ] **T021 [APP][coherence]** **ADD-006-2** — the advance naming follows the **same contact-slot order** the
  static list renders (no "David" while the list reads Margaret-first); record the ordering contract for the 007 mirror. — ✓ `node --check` · DoD: order matches the list.

## Phase 7 — Verify & sign-off (definition of done)
- [ ] **T022 [US3]** **Full Pixel replica matrix** incl. a **mixed call/SMS sweep** (a later sweep with a mobile
  final contact): handover → named attempts (call→ring, SMS→pause) → handoffs → each terminal (acknowledged,
  both exhausted, unknown); ring on 100% of calls / 0% of SMS (SC-004); names+order match (SC-005/006); offline/
  missing-clip/lost-signal fallbacks. — DoD: all pass on the Pixel.
- [ ] **T023 [APP+BE]** **I.4 passenger proof** — audio force-failed (clips deleted; emit stubbed to throw) → the
  escalation runs **byte-identically**, ends in a spoken terminal/fallback (SC-001/007), **harness green**. — DoD: on the Pixel + harness.
- [ ] **T024 [P]** **Wifi-only tablet parity** run. — DoD: full replica on the tablet.
- [ ] **T025** **Owner listening session — final full-replica audition** (PRE-2). — DoD: owner sign-off.
- [ ] **T026** **Constitution re-check** (I.3 channel-gate; I.4 passenger; I.6 amendment; III audition) + docs:
  deck **v1.4** changelog, master reference + howsu docs, vault build-record + session log. — DoD: docs match reality.
- [ ] **T027 [BE]** **Backend restart (deploy reality)** — load the AWS env (PRE-1) + the endpoint (T005) + the
  emission (T013/T014). App via `cap copy`+`installDebug` (relaunch; no git). — states "live" only after restart.

---

## Dependencies & order
- **Phase 1–2 (backend gen)** ‖ **Phase 3 (app foundation, placeholders)** — different repos.
- **Phase 4 (lifecycle)** needs T005 + T007.
- **Phase 5 `[ENG]`** — **⛔ starts only after GATE-ENG (captain brief sign-off).** Runs in parallel with app work.
- **Phase 6 (replica wiring)** needs the static clips (T004), per-contact clips (T009), and — for live named
  attempts/ring — the emission (T013/T014). Placeholder/simulated advances can drive T016–T021 before `[ENG]` lands.
- **Phase 7** after all; T027 carries the backend live; T025 audition + T026 re-check are the final gates.

## Parallel opportunities
- Backend gen (T004/T005) ‖ app foundation (T006–T008) ‖ (once GATE-ENG) `[ENG]` (T012–T014).
- T024 (tablet) ‖ T022 (Pixel matrix).

## Implementation strategy
1. **Static clips + mockup gate** — T004 (drop tones, bundle ring, bare gap) → owner auditions.
2. **Per-contact gen** — T005 endpoint.
3. **App foundation on placeholders** — T006–T008 + lifecycle T009–T011.
4. **Engine emission (after GATE-ENG)** — T012 helper → T013/T014 points (channel-carrying, fire-and-forget) → T015 harness.
5. **Replica wiring** — handover → named attempts + channel-gated ring → handoffs → terminals → fallbacks → coherence.
6. **Verify to done** — mixed call/SMS Pixel matrix (T022) + I.4 proof (T023) + tablet (T024) + PRE-2 (T025) + docs (T026); live via T027.

## Notes
- **The abstract tones are cancelled** (R-006-6); the "working" audio is now the UK ring (call) / pause (SMS) / gap bed.
- **Channel is the honesty fence** — it rides `escalation_advance` from `touch_type` (:5177) / hardcoded "call" (Point 1). Both name + channel are **live locals at both dial sites** (brief) — no lookups.
- **No dedup on the direct path** — re-sweeps re-announce (do not add a guard).
- **Bare-form Signal gap/attempt copy** — confirm with the deck owner (flag on T004), don't invent.
- **DoD is on-device** (Pixel) + **wifi tablet**; **PRE-2** is the sign-off gate. **Flag-stop on ambiguity.**
- **Out of 006 (→ 007):** the escalation screen's **live per-contact mirror** — consumes the same
  `escalation_advance` signal 006 builds (ADD-006-1); screen visuals unchanged in 006.
