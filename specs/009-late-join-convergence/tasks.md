# Tasks: Late-Join Audio Convergence (009)

**Input**: `specs/009-late-join-convergence/` — plan.md, spec.md (US1–US4), research.md (R0–R9, deletion
inventory R7), data-model.md, contracts/ (join-confirmed-authority · hold-then-admit-contact-leg · join-phase-pushes).
**Rulings folded in**: R-009-6 (ONE PATH), R-009-15 (Stage 4 adoption — Finding B **Option 2**; promotion list),
R-009-16 (deck wordings — N2/N4/N5, join-announce = existing connect line).

**Structure (captain, 15 Jul)**: five-part spine, **matrix runnable at every seam**. Every task names its
**verification instrument up the device-last ladder** (L0 `py_compile`/`node --check` → L1 `/escalation-test`
harness → L2 `sa_sim.js` → L3 on-device PSTN). Deletions are their **own** tasks, each with a **grep proof of
absence** (FR-018 "deleted, not kept alongside"). The on-device matrix day (cold-kill cell included) is the
closing task. **Review lens for the whole list: ONE PATH — FR-018 / SC-009 (no dormant second system).**

**Two repos**: backend = howsu tree (`~/.openclaw/workspace/howsu/`); app + these artifacts = iona-app. Backend
closes with master-reference changelog + `/howsu-align`.

> ⚠️ **This list goes to the captain BEFORE any `[BUILD]` executes.** `[BUILD]` = modifies live production code.
> Phase 1 (gates + baseline) is read-only/verification and may run to establish the green baseline.

---

## Build gates — ALL CLEARED (recorded, not re-litigated)
- **R-008.1-1** git accumulation landed (iona-app pushed to origin, 14 Jul). ✓
- **Spike verdict + ruling**: R-009-15 (spike CLOSED; Finding B → Option 2). ✓
- **Deck extension**: `escalation_copy.py` **v1.11** — N2/N4/N5 applied, `COPY_VERSION`→"1.11" (R-009-16). ✓
- **8s window**: SETTLED (R-009-15 §2) — not re-debated; failed-join boundary stays 8s.

---

## Phase 1: Setup & matrix baseline (read-only — establishes the green seam)

- [ ] **T001** Confirm the three gates above are current (git origin ahead=0 uncommitted-spike-only; deck v1.11
      present; R-009-15/16 settled notes in `03 Decisions/`). → instrument: inspection.
- [ ] **T002** Capture the **pre-change green baseline** the matrix returns to at every seam:
      `/escalation-test` **direct 19/19 · bridge 12/12**, `sa_sim.js` **39/39**, `py_compile` webhook +
      `node --check www/app.js` clean. Record the numbers in the run log. → instrument: L1 + L2 + L0.
- [ ] **T003** Confirm the **008 Stage-0 observation wiring is still live on BOTH legs** (member
      `participantLabel="member"` at member mint; `contact-{i}` at contact mint; handler `/bridge/conference-events`
      logging-only) — this is the load-bearing asset Phase 2 promotes. → instrument: grep + one live svc-test event.

**Checkpoint**: baseline green and recorded; nothing changed yet.

---

## Phase 2: Server authority + hold-and-admit → LIVE path (Foundational · US1 backbone) [captain spine 1]

**Purpose**: promote the spike-proven mechanism from the svc-test gate onto the live conference mint sites. Blocks
every user story. Carry Finding A's `&amp;` XML-escape convention (already matches the live path).

- [ ] **T004 [BUILD] [US1]** Promote `_handle_bridge_conference_events` (`:3026`) from **logging-only → admit
      authority on the LIVE path**: first `participant-join` with `ParticipantLabel=="member"` for a conference in
      `_hold_state` fires the one-shot admit (positive-event-only; leaves stay diagnostic; R1). Lift the svc-test
      gating so live bridge confs enter the path. → instrument: L0 py_compile; L1 new bridge harness checks under
      dispatch suppression (admit one-shot, xor with boundary), **bridge 12/12 stays green**.
- [ ] **T005 [BUILD] [US1]** Bring the **hold-then-admit machinery to the live press-1 confirm site** (`:3958`/`:4051`):
      `_hold_state` (per data-model §2: `hold_contact_call_sid`, `join_boundary_timer`, `member_join_confirmed`,
      `admit_fired`/`boundary_fired`), single-site `_hold_resolved` xor, admit via the existing Calls-API redirect
      primitive. Contact-confirm TwiML reshaped in place — pre-brief (**N2**) + hold, then admit/close (R2). GC at
      terminal/instance boundary like the `_bridge_*` dicts. **No new mint site** (build-gate: grep the mint-site
      count is unchanged). → instrument: L0; L1 harness hold-admit + boundary checks.
- [ ] **T006 [BUILD] [US1]** **8s boundary driver on the live path** — server-side timer armed at press-1, ONE
      boundary, both terminals (admit *or* failed-join) from one fire (FR-006; never a WebView timer). Reuse the
      spike's `_hold_boundary_close` shape → graceful contact close (no spoken line — Flag 2). → instrument: L0; L1
      boundary-fires-once + no-admit-after-boundary check.
- [ ] **T007 [BUILD] [US1]** **Push split** (`pwa_sender.py`, data-only+high via `send_bridge_data_push`): mint
      **join-trigger** (press-1 → carries `conference_name` + contact name/index; MUST NOT set everConnected / arm
      caps / flip chips — R5), **join-confirmed** (member-join observed + admitted → carries conference_name +
      contact name), **failed-join** (8s boundary). Per data-model §3 / contracts/join-phase-pushes.md. → instrument:
      L0; stubbed-sender shape assertion.
- [ ] **T008 [BUILD] [US1]** Adopt the **push-authoritative join-trigger shape into real code** (promote the two
      TEMPORARY-marked app edits): the trigger carries `conference_name`; the app joins THAT room. (The TEMPORARY
      spike handler + `runServiceTestCall` override are **stripped in Phase 6 / T024**, once the real join path is
      live.) → instrument: L0 node --check; verified live in the Phase 7 matrix.
- [ ] **T009 [BUILD] [US1]** **EventLog + narrator** (howsu): resolve failed-join / join-confirmed rows against
      `VALID_*` **before adding any value** (data-model §5). Any NEW Status → the 4-step recipe (guard + master ref
      §5 + narrator MATRIX row + live verify). Join-confirmed moves connected/answered timestamps to the event
      moment (R5). → instrument: L0; **`log_narrator` 0-gaps coverage test** must stay green.

**Checkpoint (seam)**: `/escalation-test` direct 19/19 · bridge 12/12 GREEN with authority live; standard path byte-unchanged.

---

## Phase 3: Member leg = a real bridge leg — Finding B Option 2 (US1) [captain spine 2]

**Purpose**: the member joins as a **persistent** conference leg (joins, `endConferenceOnExit=false`, **no
self-completing waitUrl**) — superseding the Service Test scaffold entirely (R-009-15 §1). This is what makes the
two-party bridge STAY (the spike's ~5s teardown was the reused member-alone wait-flow; gone here).

- [ ] **T010 [BUILD] [US1]** Give the join-triggered member leg its **own conference-join TwiML** on the live path:
      persistent leg, `endConferenceOnExit=false`, `participantLabel="member"` + conference-events callback (the
      authority Phase 2 promoted), and **no `service-test-wait` / no self-teardown**. The contact remains the anchor
      (`endConferenceOnExit=true`). → instrument: L0; L1 harness "member leg persists past admit" check.
- [ ] **T011 [BUILD] [US1]** App `connectOutbound` at the live site (`:2694`) becomes **join-triggered** (placed at
      join-trigger, not summon) and joins the pushed conference; reuse the existing connect machinery (no new plugin
      surface). → instrument: L0 node --check; verified live in Phase 7.

**Checkpoint (seam)**: harness proves member leg outlives admit; bridge no longer self-tears-down.

---

## Phase 4: App-side convergence — ONE PATH reducer + one clip pipeline + cards speak (US1/US2/US3) [captain spine 3]

**Purpose**: the reaching phase goes **mode-blind** (one reducer, R-009-6); the cache exclusion is deleted so the
cards are offline-speakable; the join-phase states + N4/N5 cards land. Cards use the **R-009-16** copy (authoritative
over the data-model's swapped N-labels — see T023).

- [ ] **T012 [BUILD] [US1]** Reaching phase **mode-blind**: the 006/007 Signal reducer runs both modes; mode now
      gates exactly ONE thing — arming the join layer at contact-accept (FR-018). → instrument: L0; **L2 `sa_sim.js`
      reaching cells stay 39/39** for both modes.
- [ ] **T013 [BUILD] [US1]** Reducer **join-phase states** (data-model §1): `join_pending` (join-trigger; join
      announce = existing connect line, atomic clip; accepted chip→connecting, others frozen honest) → `joined`
      (join-confirmed; silence; chip ✓ settled; everConnected=true, arm 9/10-min timers) → `join_failed`
      (failed-join) / `dropped` (008 post-`joined`). States only a live-call episode enters (FR-018e). → instrument:
      L0 node --check; **L2 sa_sim.js +1 cell per transition** (join_pending→joined, join_pending→join_failed,
      joined→dropped).
- [ ] **T014 [BUILD] [US1/US2/US3]** **One clip pipeline**: per-contact named-clip set grows by 2 — `failed_join`
      (**N4** copy, name-bearing) and `dropped` (**N5** copy, name-bearing per R-009-16). Server text-keyed Polly
      cache → base64 Preferences; `COPY_VERSION` "1.11" drives regen. **Zero fetch at play time** (SC-006). →
      instrument: L0; clip-manifest render check; on-device cache-populated verify (Phase 7).
- [ ] **T015 [BUILD] [US2]** **Failed-join card speaks (N4)**: `join_failed` renders the 008 dropped-card **shell**
      with the failed-join copy-variant and its EXISTING actions (device-dial to the accepting contact = primary,
      help re-press = floor; R-009-4), spoken via the local `failed_join` clip (offline-safe). → instrument: L0
      node --check; L3 staged failed-join run (Phase 7).
- [ ] **T016 [BUILD] [US3]** **Dropped card speaks (N5)**: the 008 R-008-5 card is **unchanged in substance/actions**;
      009 only teaches it to SPEAK, carrying the name, via the local `dropped` clip (offline-safe). → instrument: L0
      node --check; L3 radio-kill run with the card line audible fully offline (Phase 7).

**Checkpoint (seam)**: `node --check` clean; sa_sim green with new cells; cards render+speak in a local dry-run.

---

## Phase 5: Story 4 — Loud from the first word (US4 · P3, SEVERABLE) [captain spine 4]

**Purpose**: media/call volume maxed at activation so Oran is loud from word one; restore prior volume at end
(R-009-15 note — no ambush at midnight). Severable by construction — cut only if the build overruns.

- [ ] **T017 [BUILD] [US4]** `TwilioVoicePlugin.java` — **max media/call-stream volume at press** (R-009-8), reusing
      the existing speaker routing (`:299 setCommunicationDevice`); capture prior level. → instrument: L0 (build
      compiles); L3 volume-at-zero activation (Phase 7).
- [ ] **T018 [BUILD] [US4]** **Cold-wake entry** for the volume max (the R-009-14 sliver — apply on the
      cold-killed/backgrounded FSI wake path too, so a cold summon is loud). → instrument: L0; L3 cold-wake cell.
- [ ] **T019 [BUILD] [US4]** **Restore prior volume at conversation end** (all terminal paths — joined-end,
      failed-join, dropped). → instrument: L0; L3 verify level restored after each terminal.

**Checkpoint (seam)**: Story 4 independently testable; severable without touching US1–US3.

---

## Phase 6: Deletions — removed, not kept alongside (FR-018 / SC-009) [captain spine 5]

**Purpose**: remove every orphaned member-side phone-audio system. **Each task ships with a grep proof of absence**
(no dormant second path). Ordered AFTER the live path works, so the matrix proves the new path before the old is cut.

- [ ] **T020 [BUILD]** DELETE the **`/twiml/wait-audio` member hold loop** (`_handle_twiml_wait_audio` `:4077`) +
      the `waitUrl` attr at the member mint (`:2652`) + the press-1 named-connect flags
      (`_bridge_press1_name`/`_announced`). (svc-test wait route unaffected.) → **grep proof**: 0 live-path refs to
      `_handle_twiml_wait_audio` / `_bridge_press1_name`. → instrument: L0; L1 bridge 12/12 stays green.
- [ ] **T021 [BUILD]** DELETE the **member-participant exhausted `<Say>`/Announce** in
      `_handle_bridge_speak_to_conference` (`:3600` — the "phone-leg exhausted <Say>", R-009-6); member exhausted
      terminal is local-clip speak now. Keep the contact-side refuse-guard/logging only where a contact leg still
      needs it. → **grep proof**: 0 member-leg `<Say>` terminal refs on the live path. → instrument: L0; L1.
- [ ] **T022 [BUILD]** DELETE the **hands-free clip-cache exclusion** (`_saIsSignal` gate at `app.js:3686`) — one
      cache pipeline for both modes (R6; already relied on by T014). → **grep proof**: 0 refs to the exclusion
      gate. → instrument: L0 node --check; L2 sa_sim both-mode cells green.
- [ ] **T023 [BUILD]** DELETE the **FR-014 auto-reconnect** — app reconnect `connectOutbound` (`:2771`) + its state
      (`_bridgeReconnectGaveUp` era). Executes R-008-4's "replace or delete within 009" as **DELETE** (Complexity
      Tracking row 3): under late-join the room dies with its anchor; a mid-call drop is 008's truthful (now-spoken)
      card. **Captain nod PRE-GIVEN — R-009-7 ruled FR-014 DELETE on record; CC proceeds at this task citing R-009-7,
      no mid-build stall** (R-009-17 §3). → **grep proof**: 0 refs to the reconnect site/state. → instrument: L0
      node --check; L3 drop-run shows the dropped card, no silent auto-rejoin.
- [ ] **T024 [BUILD]** STRIP the **TEMPORARY 009 spike scaffold**: the `spike_join_trigger` TEMPORARY handler +
      `runServiceTestCall` conferenceOverride (app), the webhook svc-test hold-admit spike branch + `_loop9` `&amp;`
      escape site (now that the convention lives on the live path), the scratch contact-dial driver. The retire/rename
      of the legacy **`bridge_contact_joined`** press-1 push (R5) lands here — no consumer left reading the old
      meaning. → **grep proof**: 0 refs to `spike_join_trigger`, `svc-test` hold branch, `bridge_contact_joined`
      (old meaning). → instrument: L0 py_compile + node --check; L1 bridge 12/12 green.

**Checkpoint (seam)**: every deletion grep-clean; **PLUS the SC-009 whole-path inspection proof (R-009-17 §2) —
grep-level: ZERO mode checks in the reaching phase, ONE state machine, ONE card family** (beyond each deletion's
individual proof); `/escalation-test` direct 19/19 · bridge 12/12 GREEN; ONE PATH holds.

---

## Phase 7: On-device matrix day + pin run + close-out (the pass bar) [device-last]

**Purpose**: the ONLY verification bar — on-device Pixel with real PSTN contact legs. Runs as its own task at the end.
**Runs the FULL spec matrix, Parts A–C (R-009-17 §1) — the scenarios listed in T025/T026 are EXEMPLARS, not the
set.** The full matrix explicitly includes: the **standard-path regression run (SC-008)**, **fast-ack** (accept
before the pre-brief completes), **accept-during-outcome-line**, **contact-hangs-up-before-member-arrives**, and
**duplicate summon** — each observed on-device, not assumed.

- [ ] **T025 [BUILD] [US1]** **Success matrix** on-device (hands-free, real contacts): (a) contact 1 voicemails →
      contact 2 accepts → ONE Oran from press to voice, join masked in the connect line, live conversation, member
      leg persists (no ~5s teardown); (b) reaching narration **identical to standard path** (SC-002); (c) **zero
      waiting-room seconds** (SC-001); (d) **standard-path regression — hands-free changes leave the standard path
      byte-identical (SC-008)**; (e) **fast-ack** (accept before the pre-brief line completes); (f)
      **accept-during-outcome-line**; (g) **duplicate summon** (idempotent). → instrument: L3 + persisted
      `signal_audio_trace`.
- [ ] **T026 [BUILD] [US2/US3]** **Boundary + drop matrix** on-device: staged failed-join (device prevented from
      joining) → 8s boundary → **N4** failed-join card renders + speaks, contact closed gracefully, engine halted;
      live bridged call radio-killed → **N5** dropped card renders + **line plays fully offline**;
      **contact-hangs-up-before-member-arrives** → clean close, no orphaned member leg. → instrument: L3.
- [ ] **T027 [BUILD] [US4]** **Story 4 matrix** on-device incl. the **cold-kill cell**: media volume zero at
      activation → Oran loud from word one on a warm summon AND a **cold-killed/backgrounded FSI wake**; prior
      volume restored at end. → instrument: L3 (cold-kill cell explicit).
- [ ] **T028 [BUILD]** **Pin run R-008.1-3** (decoupled — R-009-15 §5, live path, ~10 min): handsfree real run →
      press-1 → airplane-drop → dropped card → re-press → confirm the full 10s cancel window. → instrument: L3.
- [ ] **T029** **Close-out (doc alignment)**: master-reference changelog for the 009 arc + the earlier unbumped spike
      headers (rides R010/T015) + `/howsu-align`; amend `data-model.md` §1/§4 **N4/N5 labels** to match R-009-16
      (failed-join=N4, dropped=N5 — the data-model has them swapped); mark data-model `[spike]` numbers as SETTLED
      (8s window). Two-repo commits in their own trees. → instrument: `/howsu-align` (0 drift); narrator 0-gaps.

**Checkpoint**: all four stories on-device green; ONE PATH proven (no dormant second system); pin run closed.

---

## Dependencies & parallelism
- **Phase 1** (baseline) → **Phase 2** (foundational, blocks all) → **Phase 3** (member leg) → **Phase 4** (app
  convergence) → **Phase 5** (Story 4, severable) → **Phase 6** (deletions, AFTER new path proven) → **Phase 7** (device).
- **Matrix-runnable seams**: after Phases 2, 3, 6 the `/escalation-test` bridge suite must be green; after Phase 4 the
  `sa_sim.js` cells must be green. Never cross a seam red.
- **Parallel [P]** within a phase (different files): T007 (pwa_sender) ∥ T009 (event_logger/narrator); T015 ∥ T016
  (different card variants); T017–T019 are Story-4-local. Deletions are sequenced (shared files, grep-gated), not [P].
- **Severable**: Phase 5 (US4) cuts cleanly if the build overruns — nothing in US1–US3 depends on it.

## Review lens (applied to the whole list)
**ONE PATH — FR-018 / SC-009.** Every added state is mode-only (T013/FR-018e); every deletion carries a grep proof of
absence (Phase 6); no orphaned member-side phone-audio system survives. The standard path stays byte-unchanged
throughout (verified by the bridge suite staying green at each seam).
