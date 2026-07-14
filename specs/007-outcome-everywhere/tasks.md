# Tasks: The outcome, everywhere

**Input**: `/specs/007-outcome-everywhere/` — spec.md (clarifications resolved), plan.md, data-model.md,
contracts/ (2), research.md, quickstart.md, **BRIEF_outcome_field_escalation_advance.md (SIGNED 2026-07-12)**,
DECK_007_outcome_lines_DRAFT.md (copy authority → v1.7).

**Feature**: Relay the escalation's already-classified per-attempt **outcome** to the member across two surfaces
— Oran's between-attempt audio and the live *calling your contacts* screen — from **one enriched field**
(`outcome` on the existing `escalation_advance` `phase="ended"` emission), so audio, screen, and history cannot
disagree.

## Build status — 2026-07-12 (`/speckit.implement`)

**Built + locally validated (backend + app audio):** T001–T005, T007–T009, T013. `py_compile` clean on every
edited `.py`; webhook `ff"`=0; `node --check www/app.js` clean; narrator coverage gate **0 gaps**; classification
parity + additive-payload smoke tests pass. Deck → **v1.8** (v1.7 was already consumed by 006 — see T001).
**Owner-gated (not runnable in-session):** **T006** live harness + **T014/T015/T016** on-device runs ride the
owner's **go-live webhook restart** (loads the new sender) + `cap copy`/`installDebug` for the app.
**Screen mirror (T010–T012) — GATE-MOCKUP SIGNED, built:** live per-contact chips via the reused
`setContactStatus`/`renderCallingScreen`, channel-honest, amber/grey/teal rule, raw-slot→dense-row mapping,
universal audience (screen ungated; audio stays Signal-only). `node --check` clean. Mockup:
`MOCKUP_007_calling_screen.html` / Artifact. No git commits. **DEPLOYED + restarted 2026-07-12:** app built+installed to the Pixel (BUILD SUCCESSFUL); webhook+runner restarted on the new code (portal/ngrok/cloudflare untouched); harness **direct 19/19 · bridge 12/12** green (T006 ✓). Ready for the on-device outcome matrix.

## RESPEC 2026-07-13 — attempt-anchored narration (owner-ruled; captain-directed)

The transition-anchored audio model (T007/T008 as built) is **superseded** — structurally unspeakable for
last-contact / single-contact / connect-first outcomes, and its phase-keyed consumer discards connect-first
outcomes (the two-ended discard, vault finding 2026-07-12). **KEPT, no blanket revert:** T003–T006 spine
(one-authority + no-drift), T010–T012 chips (on-device verified), T013 narrator alignment,
`/signal-audio/clips`. New model + permutation matrix: spec *Narration Model* section; mechanism: plan §R2.

### Phase R0 — Gates (both block everything below that touches copy/engine)

- [x] **GATE-DECK** — ✅ **SIGNED 2026-07-13** (captain, line-by-line L1–L16; rulings recorded in the deck:
  L4 centrepiece present-tense, L5 fallback-only-never-both, Part D retirements, Part E
  silence-over-contradiction, L2/L3 sweep-boundary note).
- [x] **GATE-ENG-2** — ✅ **SIGNED 2026-07-13** (captain; binding condition: emission live ONLY in the same
  R008 deploy as the app's `phase="amd"` branch — honoured; member-leg AMD ruled NO — scope wall explicit).

### Phase R1 — Copy + clips (after GATE-DECK)

- [x] **R001 [COPY]** `escalation_copy.py` → **v1.9**: TRYING_NOW_TMPL / TRYING_AGAIN_TMPL / AMD_MOMENT_TMPL /
  OUTCOME_LINE_TMPL added byte-matching the signed deck; OUTCOME_HANDOFF_TMPL + RESWEEP_TMPL retired
  (HANDOFF_TMPL kept — bridge wait-audio consumer); COPY_VERSION → "1.9". `py_compile` clean.
- [x] **R002 [BE]** `/signal-audio/clips` rebuilt to the v1.9 per-contact inventory (9 standalone clips per
  contact, O(N); fused `handoffs` map retired); `render_signal_static.py` audition set + stitched preview
  updated to L2/L3/L4/L5–L8. Live-verified: endpoint returns version 1.9, all keys, no handoffs.

### Phase R2 — Backend AMD-moment emission (after GATE-ENG-2)

- [x] **R004 [ENG][BE]** AMD-moment emit live in `_handle_twiml_econtact`'s machine branch (threaded
  fire-and-forget via `send_escalation_advance(..., phase="amd", outcome="voicemail")`, failure-swallowed,
  TwiML never delayed). **Build note (honest delta from the brief):** the TwiML URL did NOT already carry
  the identity — `send_via_twilio.make_call` gained additive `econtact_index`/`sweep`/`run_ts` params on the
  econtact TwiML URL (read only by our own handler; same no-hot-path-read posture, no reordering).
  `py_compile` clean, genuine `ff"`=0, harness green post-change.

### Phase R3 — App audio consumer rework (code after GATE-DECK; deploy after R1/R2 land)

- [x] **R005 [APP]** Reducer reworked: `_saState.attempts[attemptSeq]` records + `_saAttemptRec`/
  `_saMergeOutcome`; ring-stop = pacing-only; outcome-bearing ended lands regardless of phase/ordering
  (stale-attempt gate merges silently); `_saOnAmd` (L4 = the resolution narration; L5 fallback-only);
  `_saBeginAttempt` lead = unspoken-resolution → L1/L2/L3 start beat; `_saOnComplete` re-keyed to the record.
  Run-boundary rules untouched. **DoD met: 10/10 log-order simulation (scratchpad sa_sim.js) against the
  REAL extracted reducer** — both ended orderings converge, T1 reproduces the old discard case and passes.
- [x] **R006 [APP]** Cosmetics: header pinned to `'Dancing Script'` 26px (root cause: `--msg-font-iona`
  resolves to Hanken in Easy-read mode — a logotype must not follow the message-font token); `.oran-av--live`
  teal (`rgba(37,201,186,.16)` + `--teal-glow`) per mockup; first-name only in `_callingRowHTMLOran`.
- [x] **R007 [APP]** All `// PROBE-007` logging removed; `_saPlayOnce`/`_saPlayReach` restored to clean
  form. `grep -c PROBE-007` = 0; `node --check` clean.

### Phase R4 — Deploy + on-device sign-off matrix (after R1–R3; the ONLY deploy of this pass)

- [x] **R008** ✅ **DEPLOYED 2026-07-13** — `cap copy` + `gradlew installDebug` BUILD SUCCESSFUL (Pixel
  12251JEC214674); full backend restart via `run_servers.sh` (webhook/runner/portal/ngrok up, tunnel
  confirmed); app relaunched fresh → **manifest v1.9 + all 14 new clips verified in CapacitorStorage**
  (13 orphaned v1.8 fused keys remain — never looked up, harmless). Harness on the new code:
  **direct 19/19 · bridge 12/12**. App + emission shipped in the SAME deploy (GATE-ENG-2 condition).
- [ ] **R009** **Sign-off test matrix (captain-specified — chips AND audio agreeing throughout):**
  (a) voicemail on a **middle** contact; (b) voicemail on the **LAST** contact; (c) **single-contact**
  voicemail; (d) press-9 **decline**; (e) **fast-acknowledge**. Plus: missing-outcome fallback (neutral,
  never wrong) and the two-ended order proof (adb). — DoD: 5/5 owner-verified on the Pixel.

### Phase R4b — R009 run-1 findings pass (capture → diagnose → fix; captain-directed 13 Jul)

- [x] **CAPTURE** — evidence-first per captain direction: vault brief
  `02 CC Briefs/capture_007_r009_run1_stale_clip_cache_2026-07-13.md`. **Defects A + B = ONE mechanism:**
  the device ran with a stale 2-contact clip cache (storage-proven: manifest ts from deploy, no
  `signal_clip_2_*`) after contact 3 ("scooby do") was added outside the app — every index-2 lookup missed
  and the designed never-wrong fallbacks fired (A: gap line instead of L2; B: resolution skipped). Wire
  side proven correct: dialing advance emitted; reject → `busy` → `Call Failed` → outcome `no_answer`
  (matrix correction confirmed: reject = L8, never L7). Delivery cliff measured: 3-contact render ≈ 7.8s
  server-side vs the app's 9s fetch abort.
- [x] **R011a [BE]** Server Polly-render cache keyed (text, voice) in `/signal-audio/clips` — warm fetches
  sub-second; text-keyed so copy/name changes self-invalidate. + `vm_hold` (L17) in the per-contact set
  (10 clips/contact). `escalation_copy.py` → **v1.10** (`VM_HOLD_TMPL`, COPY_VERSION "1.10").
- [x] **R011b [APP]** Fetch abort 9s → 25s (background refresh, never user-blocking); cache stores
  `{i}_vm_hold`; **CLIP MISS field diagnostics** at every beat lookup (run-1's failure was invisible).
- [x] **R011c [APP]** Pacing rules (FR-024): `_saStartGapBed` — post-AMD → L17 at standard cadence for the
  whole window (L9 prohibited; clip-miss → silent bed); elsewhere → L9 capped at ONE play per gap.
  **Sim extended: 18/18** (15 reducer + P1 L17-cadence/no-L9, P2 L9-once, P3 clip-miss-silence).
- [x] **R011d — REDEPLOYED 13 Jul (single redeploy per sequence):** app BUILD SUCCESSFUL + installed;
  webhook restarted; render cache measured cold 5.9s → **warm 0.6s**; harness **direct 19/19 · bridge
  12/12**; fresh app launch → **manifest v1.10 on-device with ALL 3 contacts, all 10 index-2 clips
  (incl. the exact `2_trying_now`/`2_outcome_no_answer` whose absence caused Defects A/B) + `vm_hold`
  ×3.** Awaiting owner re-run of the five cases (decline = ANSWER + PRESS 9, not handset reject).
- **Residual (parked for captain):** no push nudge tells the app a contact roster changed outside it
  between foregrounds — structural close is a server-side "contacts changed" data push.

### Phase R4c — R009 run-2 findings pass (R1 ordering + R2 chip; captain-directed 13 Jul)

- [x] **CAPTURE** — vault `02 CC Briefs/capture_007_r009_run2_L9_ordering_sms_chip_2026-07-13.md`. Logcat
  churned again → this pass adds the **persisted SignalAudio trace** (`signal_audio_trace` in Preferences,
  last ~250 reducer events, flushed at every non-dialing boundary) so captures survive.
- [x] **R012a [APP] — R1 fix.** Mechanism: the ring-stop and amd are two racing pushes for the same
  instant; the bed committed `postAmd` once at grace-end → a late amd let L9 play in a connect-opened gap.
  Fix: **connectHold** (an outcome-less ring-stop = a connect → that gap NEVER speaks L9) + **per-tick
  re-check** (bed upgrades to L17 mid-bed the moment amd lands). The prohibition keys off the CONNECT.
- [x] **R012b [APP] — R2 fix.** Mechanism: SMS dialing + ended emitted same-instant from two threads; FCM
  order undefined; chip renderer was last-write-wins → ended-before-dialing left "Sending a text…" stuck
  (`text_sent` vocab exists — missing-state theory ruled out). Fix: per-row **(attempt_seq, rank) ordering
  guard** in `escalationScreenAdvance` (ended outranks dialing within an attempt; higher seq always applies
  → sweep-2 supersession untouched).
- [x] **R3 VERIFIED** — press-9 leg wire-proven (declined consume + `Econtact Declined` row + declined
  ended emit); clip on-device; chip state exists; owner heard/saw live. (Byte-level device replay blocked
  by the churn — closed for the final run by the persisted trace.)
- [x] **Redeployed 13 Jul (app-only; backend untouched, no restart needed):** sim **23/23** (adds N1
  connectHold-silence + mid-bed L17 upgrade; N2 full-flow ring-stop→late-amd), `node --check` clean, BUILD
  SUCCESSFUL, cache v1.10 intact on-device. **Awaiting the owner's final five-case run.**

### Phase R5 — Close-out

- [ ] **R010 = T015** Master-ref changelog entry (deck v1.9, AMD-moment emission, attempt-anchored consumer)
  + `/howsu-align` across the tree; project-instructions pointer. — DoD: alignment recorded, `py_compile`
  clean tree-wide.
- **Parked (owner decision pending):** sweep counter (UI-wire only; sweep index already on the wire, unread).

---

## Load-bearing fences (captain — preserve verbatim)

1. **Honesty (I.3 / FR-009):** every line states an **observed delivery outcome** (voicemail left / text sent /
   unable to assist / no answer); a missing outcome → **neutral fallback, never silent, never a wrong outcome**
   (FR-010). Copy is the frozen deck (v1.7). Proven by T007/T008 + Run 1.
2. **I.4 passenger (FR-005/018 / SC-005):** the enriched signal (the added field + its derivation) **never**
   blocks/delays/alters the sweep; writes no state; the harness stays green and the sweep is byte-identical
   on/off. Proven by T006.
3. **GATE-ENG — delta-brief SIGNED 2026-07-12 → `[ENG]` tasks unblocked.** Captain ruling: **Option A** (derive
   `outcome` at the existing `:4987` emit from raw `(call_status, answered_by)`; do **not** reorder engine flow),
   **with the no-drift condition** — the derivation MUST share its source with `_reconcile_call_row`, not be a
   second hand-maintained copy. **That condition is task T003 (not a note).**
4. **`declined` ≠ `no_answer` (FR-003):** read `declined` from `ECONTACT_DECLINED`, never inferred from a call
   terminal status.
5. **GATE-MOCKUP — Constitution III:** the `[APP-SCREEN]` tasks (US2) **do not start until the internal screen
   mockup is approved** (mock → react → build). This is the internal gate, not the captain's.
6. **Scope walls:** **no** outcome lines in the bridge TwiML wait-loop (008 deletes it); **no**
   classification/sweep/timing/terminal change; **no** killed-state mirroring / alarm routing (foreground/awake
   only); **never** bundle with 008.

## Format & legend

`[ID] [P?] [Repo][Story] Description — ✓ pre-push check · DoD (on-device Pixel 4a) · (depends …)`
**Repo**: `[COPY]` deck · `[BE]` howsu backend · `[ENG]` engine-touching (GATE-ENG, signed) · `[APP]` iona-app
audio · `[APP-SCREEN]` iona-app screen (GATE-MOCKUP) · `[NARR]` narrator.
**Story**: US1 outcome audio (P1, MVP) · US2 live screen mirror (P2) · US3 coherence across surfaces (P2).
**Tests**: this project verifies via the escalation harness + on-device Pixel DoD (not TDD unit tests) — the
harness/passenger checks are explicit tasks, not test-first stubs.

---

## Phase 0 — Gates

- [x] **GATE-ENG — Captain sign-off of `BRIEF_outcome_field_escalation_advance.md`** — ✅ **SIGNED 2026-07-12.**
  Ruling: **Option A** + the **no-drift condition** (T003). Preserved without re-litigation: additive/optional
  `outcome` param (006 callers byte-unchanged), fire-and-forget/threaded, no hot-path Airtable read, `declined`
  from `ECONTACT_DECLINED`, no dedup, not alarm-class, no schema change. **Unblocks T003–T006.**
- [x] **GATE-MOCKUP — internal screen mockup approved** (Constitution III) — ✅ **SIGNED 2026-07-12** (captain).
  Colour rule ratified: amber = Oran (live pulse + every resolved outcome), grey = not-started / rang-out, teal
  tick = reached; a texted contact never shows "ringing". **Unblocked T010–T012.**
- [x] **Deck → v1.7** — copy authority for the four outcome lines + terminal variants (ratified; version stamped
  on commit).

---

## Phase 1 — Copy + half-clips (backend) — no gate

- [x] **T001 [COPY]** Add the `OUTCOME_HANDOFF_TMPL[outcome]` family to `howsu/escalation_copy.py` (deck v1.7):
  A1 voicemail / A2 text / A3 unable-to-assist / A4 no-answer, each `{prev}`+`{next}` **and** a terminal variant
  (no "trying {next}"). Bump `COPY_VERSION`. — ✓ `py_compile` · DoD: constants match the deck byte-for-byte.
- [x] **T002 [P] [BE]** Extend `howsu/render_signal_static.py` to render the **A1/A2/A3 per-contact outcome
  half-clips** ("I've left {prev} a voicemail" / "…a text" / "{prev} is currently unable to assist") reusing the
  006 per-contact pipeline (**decompose** — share the existing "— trying {next} now" tail; A4 unchanged). Confirm
  decompose-vs-pre-render sounds clean on render. — ✓ files render + play · DoD: three halves render, `COPY_VERSION`-tagged. (depends T001)

---

## Phase 2 — Foundational: the enriched signal (`[ENG]`, GATE-ENG signed) — **blocks US1/US2/US3**

- [x] **T003 [ENG][BE]** **(Captain condition — Option A no-drift.)** Make the outcome derivation **share one
  source** with the reconcile classification in `howsu/reply_to_airtable_webhook.py`: factor the
  `(call_status, answered_by) → Status` mapping used by `_reconcile_call_row` into a **single pure function** that
  both the reconcile and the new emit-site derivation call **— OR** add a test asserting the emit-side derivation
  and `_reconcile_call_row` agree across the **full `(call_status, answered_by)` input matrix**. No second copy of
  the classification may exist. — ✓ `py_compile` + the agreement test passes · DoD: one authority; a change to
  reconcile cannot silently desync the emitted `outcome` (same lesson as the 12 Jul `RESOLVED_STATUSES` guard).
- [x] **T004 [ENG][BE]** Add an **optional `outcome=None`** param to `build_escalation_advance_payload` and
  `send_escalation_advance` in `howsu/pwa_sender.py` (`None` → key omitted). — ✓ `py_compile` · DoD: 006 dialing
  + `:4971` ring-stop callers pass nothing and produce a byte-identical payload. (depends T003)
- [x] **T005 [ENG][BE]** Populate `outcome` (+ `contact_first`, was `""`) on the **attempt-end** emits in
  `howsu/reply_to_airtable_webhook.py`, using the T003 shared derivation: the terminal ended-emit (`:4987`,
  Option A — emit stays put) → `voicemail`/`no_answer`; ack path (press-1 → `ESCALATION_ACKNOWLEDGED`) →
  `acknowledged`; decline path (press-9 → `ECONTACT_DECLINED`) → `declined`; the SMS branch (`_fire_one_touch`
  `:5507`) → `sms_sent`. The `:4971` connect ring-stop emit **stays outcome-less**. — ✓ `py_compile` · `ff"`=0 ·
  DoD: each outcome type emits its correct value; `declined` never collapses to `no_answer` (FR-003). (depends T003, T004)
- [x] **T006 [ENG][BE]** **Passenger / regression proof.** Escalation harness stays **green** (direct + bridge);
  **SC-005** — the sweep is byte-identical with the field on vs off (same timing/terminal/EventLog rows); a
  forced FCM-send error at the emit leaves the sweep undisturbed. — ✓ harness green · DoD: 0 measurable sweep
  change; emit is fire-and-forget. (depends T005)

---

## Phase 3 — User Story 1: outcome audio (P1) 🎯 MVP — `[APP]` — ⚠️ **SUPERSEDED by Phase R3 (respec 2026-07-13)** — T007/T008 built the transition-anchored consumer; R005 replaces it

**Goal**: Oran speaks the previous contact's real outcome between attempts (A1–A4 + terminal variants).
**Independent test**: run an escalation across contacts producing each outcome → hear the matching line; final
contact → terminal variant (quickstart Run 1).

- [x] **T007 [APP][US1]** In `iona-app/www/app.js`, branch the `SignalAudio` **handoff slot** (today a single
  "no answer" line) on the signal's `outcome` → the four deck clips; on the **last** contact use the **terminal
  variant**. — ✓ `node --check` · DoD: 4/4 outcomes speak the correct line + correct terminal variant (SC-001). (depends T002, T005)
- [x] **T008 [APP][US1]** Neutral **fallback** when `outcome` is missing/stale/lost — a non-false handoff bed,
  **never silent, never a wrong outcome** (FR-010). — ✓ `node --check` · DoD: signal dropped mid-sweep → neutral
  line, never silence (SC-006). (depends T007)
- [x] **T009 [APP][US1]** Confirm the outcome audio is gated to **method = Signal** (FR-017) — reuses the 006
  method gate; does not play/interfere for other methods. — ✓ `node --check` · DoD: non-Signal member hears
  nothing new. (depends T007)

**Checkpoint (MVP):** US1 fully functional — deploy (`cap copy` + `gradlew installDebug`) + run the on-device
outcome matrix (Run 1). Honest between-attempt audio ships on its own.

---

## Phase 4 — User Story 2: live screen mirror (P2) — `[APP-SCREEN]` (⛔ GATE-MOCKUP)

**Goal**: per-contact live status on the calling screen, channel-honest, from the same signal, for everyone.
**Independent test**: watch the calling screen during a live escalation (Signal + hands-free) → each chip
updates correctly; text attempt never shows "ringing" (Run 2).

- [x] **T010 [APP-SCREEN][US2]** Produce the **internal mockup** of the per-contact calling screen (pending →
  active channel-honest → resolved-per-outcome states) and get the mock → react → approval. **This is
  GATE-MOCKUP.** — DoD: mockup approved before any screen code.
- [x] **T011 [APP-SCREEN][US2]** Build the per-contact chips in `iona-app/www/app.js` via `setContactStatus` /
  `renderCallingScreen` consuming the same `escalation_advance`: `phase="dialing"` → "N of M · ringing" (call) /
  text-appropriate status (**never "ringing" on SMS**, FR-013); `phase="ended"` `outcome` → resolved chip. Follow
  the slot-order contract (data-model). — ✓ `node --check` · DoD: chips correct; 0 channel mismatches (SC-004). (depends T005, T010)
- [x] **T012 [APP-SCREEN][US2]** Confirm **universal audience** (Q2) — renders for Signal **and** hands-free
  members; run a **wifi-tablet** parity pass. — ✓ `node --check` · DoD: hands-free member sees the honest screen
  while audio is unchanged (no contradiction). (depends T011)

**Checkpoint:** US1 + US2 both work independently.

---

## Phase 5 — User Story 3: coherence across surfaces (P2) — `[NARR]`

**Goal**: audio = screen = history for every attempt.
**Independent test**: capture the spoken line, the chip, and the history row for the same attempt → all name the
same outcome (Run 3).

- [x] **T013 [NARR][US3]** Part-D alignment in `howsu/log_narrator.py`: `("Emergency Call 1/2/3", "Econtact
  Declined")` outcome `"{name} couldn't take the call"` → `"{name} was unable to assist"` — **copy-only, same
  keys**, coverage gate unaffected. **Owner veto at build.** — ✓ narrator coverage gate 0 new gaps · DoD: history
  reads "was unable to assist"; past-tense vs live present is intended (FR-016). (depends —)
- [ ] **T014 [US3]** Coherence verification: for each outcome type, the **audio**, the **screen chip**, and the
  **history row** name the same outcome (SC-003); the slot-order contract holds (no name/slot mismatch). — DoD:
  100% agreement across the three surfaces (Run 3). (depends T007, T011, T013)

---

## Phase 6 — Polish & cross-cutting

- [ ] **T015 [P]** Constitution re-check (I.3 honesty · I.4 passenger · II vocabulary · III mockup) + docs: note
  the deck v1.7 + the `outcome` field in the master-reference changelog / project instructions alignment (no
  schema/valid-value change — header/copy only). — DoD: alignment recorded.
- [ ] **T016** Run the full `quickstart.md` matrix on the Pixel + wifi tablet (Runs 1–4); harness green; `ff"`=0;
  narrator coverage 0 gaps. — DoD: all four runs pass; SC-001…006 met.

---

## Dependencies & Execution Order

- **Phase 1 (copy/clips)** — no gate; start immediately (T001 → T002).
- **Phase 2 (`[ENG]`)** — GATE-ENG signed; **T003 first** (the no-drift authority), then T004 → T005 → T006.
  **Blocks all three user stories** (they consume the enriched signal).
- **US1 (Phase 3)** — after T002 + T005. **MVP** — ships alone.
- **US2 (Phase 4)** — after T005 **and GATE-MOCKUP (T010)**. Independent of US1.
- **US3 (Phase 5)** — T013 has no code dep (parallel with everything); T014 after US1 + US2 + T013.
- **Polish (Phase 6)** — after the desired stories.

### Parallel opportunities

- T001 → T002 (copy then render) run alongside the Phase-2 `[ENG]` chain once T003 lands.
- T013 (narrator) is fully parallel — no dependency on the app or the emission.
- US1 (audio) and US2 (screen) proceed in parallel after T005 (US2 also needs GATE-MOCKUP).

### MVP scope

**US1 only** (outcome audio) — Phases 1 + 2 + 3 → the dishonest "no answer for everyone" is gone. Deploy, run
the outcome matrix, demo. US2 (screen) and US3 (coherence/log) layer on without breaking US1.

### Implementation strategy

1. Phase 1 (copy + half-clips) ∥ Phase 2 (`[ENG]`, T003 no-drift authority first).
2. Phase 3 (US1) → **STOP & VALIDATE** on-device (Run 1) → MVP.
3. Get GATE-MOCKUP → Phase 4 (US2) → validate (Run 2).
4. Phase 5 (US3 + Part-D) → coherence (Run 3).
5. Phase 6 polish + full quickstart (Run 4, passenger proof).

## Notes

- [P] = different files, no incomplete-task dependency.
- The **no-drift authority (T003)** is the captain's explicit build condition on Option A — not optional, not a
  note.
- Scope walls (fence 6) are enforced throughout: nothing here touches the bridge TwiML wait-loop, the
  classification/sweep/timing/terminal logic, or 008.
