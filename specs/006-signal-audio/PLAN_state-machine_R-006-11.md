# IMPLEMENTATION PLAN — 006 Signal-audio state machine (R-006-11)

**For:** captain eyes before build (per the process note: "no further fixes land except as implementation of the state machine").
**Cure applied (not invented):** instance-scoped tokens on the wire + one liveness authority — the same settled pattern as the
stale-flag multi-escalation fix and the Track 2 stale-surface fix. No third pattern.

---

## Part A — Identity on every signal (wire; `howsu`)

The R-006-8 shared builder is `pwa_sender.send_escalation_advance()`; it already stamps `run_token`, `sweep`, `contact_index`.
Three additive changes so **every** signal (started / advance-dialing / advance-ended / terminal) carries a full identity:

| # | File · site | Change | Why |
|---|---|---|---|
| A1 | `pwa_sender.send_escalation_advance` | Add computed **`attempt_seq = sweep * SA_CONTACT_STRIDE + contact_index`** to the payload (keep `sweep`+`contact_index` for labels). One place — both emit points inherit it. | Gives the app a single **monotonic** attempt ordinal to compare. No per-payload guessing. |
| A2 | `reply_to_airtable_webhook.py:4786, 4802` (the two `ended` emits) | Pass the **real `sweep`** (already in scope in `process_escalation_callback`), not `0`. | Today an `ended` carries `attempt_seq=contact_index` (sweep 0) → cannot be matched to the attempt it ends. This is the direct cause the ended can't be validated. |
| A3 | `pwa_sender.send_escalation_complete_push` + call sites (`_send_escalation_outcome_once`, lines 4582/5411) | Add **`run_token`** (and `attempt_seq` of the reached contact) param → onto the payload. `run_token` is already in scope at every call site. | The terminal must be identity-stamped so the app can (a) reject a stale-run terminal and (b) enter its absorbing state against the right run. |
| A4 | `send_escalation_started` | Confirm it stamps `run_token` (it does — the app reads `data.run_token`). Started defines the run; `attempt_seq` = −1 (pre-first-attempt). | No change beyond confirming. |

**Invariants held:** `send_escalation_advance` stays a non-blocking daemon that never raises into the sweep (I.4 / R-006-9 —
no server-side dedup; the app discards). No bridge code touched (bridge byte-unchanged). Harness (direct 16/16 · bridge 12/12)
stays green — these are additive payload fields + one bugfix, no change to blocking behaviour.

---

## Part B — One state machine = the single audio authority (`iona-app/www/app.js`)

### B1. The state object (replaces the scattered generations)
```
_saState = { runToken, attemptSeq, phase, terminal, attemptSrc }
   phase ∈ { idle, handover, ringing, gap, terminal }
   terminal: bool (absorbing)
_saEpoch = 0    // ONE generation — bumps on every ACCEPTED transition
```
`_saReachGen` and `_saGen` **collapse into `_saEpoch`**. No loop owns its own start/stop any more.

### B2. The single reducer — every signal goes through it
`_saApply(sig)` where `sig = { kind: started|advance|complete, phase, runToken, attemptSeq, ... }`.
The three handlers (`signalAudioStarted / signalAudioAdvance / signalAudioComplete`) shrink to thin adapters that normalise
the FCM payload and call `_saApply`. **Validation gate, in order (each failure → discard + log, never acted on):**

1. **Stale run** — `sig.runToken` set, differs from `_saState.runToken`, and `sig.kind !== 'started'` → DISCARD.
   *(a new `started` with a new token legitimately opens a new run — bias rules in B4.)*
2. **Terminal-absorbed** — `_saState.terminal === true` and `sig` is non-terminal → DISCARD. **← kills symptom 3 structurally.**
3. **Stale attempt** — `sig.attemptSeq` set and `< _saState.attemptSeq` → DISCARD. **← kills symptom 2 (late `ended` from a prior contact).**

Passing the gate → transition + `_saEpoch++`:

| Signal | Transition | Output loop (all epoch-guarded) |
|---|---|---|
| `started` | reset → `{runToken, attemptSeq:−1, phase:handover, terminal:false}` | enqueue handover clip (plays fully) |
| `advance/dialing` | `attemptSeq = sig.attemptSeq`; `attemptSrc = lead`; `phase:ringing` | lead (handoff/resweep/attempt) then **ring loop** bound to this epoch |
| `advance/ended` | **only if `sig.attemptSeq === attemptSeq` & `phase===ringing`** → `phase:gap` | stop ring; **gap bed** bound to this epoch |
| `complete` | `phase:terminal; terminal:true` | stop ALL loops; enqueue terminal clip (ack / exhausted) |

### B3. Loops become pure, epoch-guarded outputs
Every loop captures `const e = _saEpoch` at start and runs `while (e === _saEpoch)`; the instant an accepted transition bumps
the epoch, the loop self-exits. Concretely:
- **ring loop** (`uk_ring` → re-say, recurring) — additionally self-caps at **`SA_RING_CAP_MS`** (≈ the server's real dial ring
  timeout; a backstop if an `ended` is lost/late). **← bounds symptom 1** to at-worst a few seconds overshoot.
- **gap bed** ("still trying") — epoch-guarded; can only exist while `phase===gap`.
- **terminal chain** — epoch-guarded; only reachable once, and absorbing blocks any later loop.
Ring plays **only** while `state == (current attempt, phase=ringing)`, ended by the earliest of: a token-valid `ended`, a
token-valid next-attempt, or `SA_RING_CAP_MS` — exactly the ruling.

### B4. Cold-start / resume reconcile (Track 2 rule, non-latching)
- **Cold launch** (killed → opened by `escalation_started`, via `_consumeEscalationAlarm`): **bias-to-idle** — start at
  `phase:idle`, act only on signals that arrive; never assume a ring is mid-flight.
- **Resume** (backgrounded → foregrounded mid-run, resume listener): **bias-to-keep** — retain current state/loop if the run
  token still matches; a stale signal still gets discarded by the gate.
- Both non-latching: the next valid signal always wins.

### B5. Discard-log format (one line per discard — assertable in the matrix)
```
[SignalAudio] DISCARD <kind>/<phase> run=<tok8> seq=<n> reason=<stale-run|terminal-absorbed|stale-attempt>
              — current run=<tok8> seq=<n> phase=<phase> terminal=<bool>
```

---

## Part C — Acceptance: the on-device matrix (named regression tests)
Harness green is **necessary-never-sufficient**. 006 v1 is DONE when the approved core + this state machine pass:

| Name | Setup | Pass criteria |
|---|---|---|
| **voicemail-run** | mobile contact → voicemail | ring stops at connect/cap (≤ a few s overshoot), **no ~30s ring-through**; advances cleanly |
| **mid-sweep-acknowledge** | a contact answers + presses 1 mid-sweep | "I've reached {name}… Take care now." plays; **no "still trying" after** (symptom 3 impossible) |
| **contact-2-rings** | contact 1 voicemails late while contact 2 is dialling | contact 2 rings normally; contact 1's late `ended` **discarded + logged** (symptom 2 gone) |
| **decline** | a contact presses 9 | correct narration; no stuck/leaked loop |
| **exhausted-both** | all contacts fail call + SMS | exhausted terminal plays once; every loop stops |
| **wifi-tablet** | owner has no Android tablet | **DEFERRED — pre-launch item**, not gating (logged) |

Out of scope for 006 (explicit, R-006-11): chasing exact call-end precision beyond `ended`-signal + `SA_RING_CAP_MS` — its own
slice if ever wanted.

---

## Part D — Build sequence (after captain approval)
1. **Wire (Part A)** — attempt_seq in builder; fix the two `ended` sweeps; run_token+seq on the terminal push. `py_compile`;
   run the direct+bridge harness → must stay green; spot-check bridge additive-only.
2. **State machine (Part B)** — introduce `_saState`/`_saApply`/`_saEpoch`; collapse `_saReachGen`+`_saGen`; thin the three
   handlers to adapters; add the discard-log; ring cap; reconcile hooks. `node --check www/app.js`.
3. **Deploy + run the Part C matrix on-device with the owner.** The three failing runs above become the named regressions.

## BUILD STATUS (2026-07-11)
- **Part A (wire) — DONE.** A1 `attempt_seq` in the one builder; A2 both `ended` emits carry the real `sweep`
  (was `0`); A3 `run_token` on the terminal push. C2 explicit `RING_TIMEOUT_SECONDS=60` bound to `SA_RING_CAP_MS`.
- **C1 — DONE.** New harness check `ended_emission_identity`: every `ended` this run carries a real sweep (≥1) +
  `attempt_seq == sweep*STRIDE+contact`; a driven sweep-2 connect proves it. **Harness green: direct 17/17
  (was 16 + this), bridge 12/12; bridge deck byte-unchanged.**
- **Part B (state machine) — DONE + DEPLOYED.** `_saState` + `_saApply` reducer + `_saEpoch`; `_saReachGen`/`_saGen`
  collapsed; handlers are thin adapters; C3 discard log; ring cap; handover-survival via `pendingAttempt`.
  `node --check` clean; `installDebug` BUILD SUCCESSFUL on the Pixel.
- **Part C (on-device matrix) — PENDING owner run.** voicemail · mid-sweep-acknowledge · contact-2-rings · decline
  · exhausted-both. Tablet parity = named pre-launch gate (vault `05 Reference/Pre-launch checklist.md`).

## R-006-12 ADDENDUM (2026-07-11) — run boundaries + one authority for card AND audio
Forensic (`FORENSIC_two-runs_2026-07-11.md`) found the RESET boundary broken: `started` never stamped identity (F1),
`started` never reached JS from killed state (F2), and the card was never under the authority (Q2). Built + deployed:
- **A (server, harness-green):** `escalation_started` now carries `run_token` (fields only — alarm-class type/priority/
  `ALARM_CLASS_TYPES` untouched). The R-006-8 builder stamps **`run_ts`** (run mint-ms) on EVERY signal; established at
  mint (`run_escalation`), cached per-process (`pwa_sender._RUN_TS`), and carried on `make_call`'s callback URL so the
  webhook adopts the SAME `run_ts` cross-process (runner→webhook). New harness check **`run_ts_stamped_consistent`**
  (one run = one run_ts, never zero). **Direct 18/18, bridge 12/12.**
- **B (reducer):** new TOP rule — `run_ts` total order: newer→reset-and-apply (clears a prior run's terminal),
  older→discard `stale-run-ts`, equal→same-run gates. Terminal absorption is now **run-scoped**; `started` is never
  absorbed. **F2 accommodation:** a first advance with no JS `started` synthesises the opening (handover→attempt) via
  `_saOpenWithHandover`/`_saPlayHandover` — the native alarm path is left untouched. Discard log gains `ts=`.
- **C (card):** `handleEscalationComplete` consults the SAME judge as audio — `_saAcceptsComplete(token+run_ts)`.
  A complete the audio would discard draws no card; `escalation_state` is a subordinate belt. Card and audio can no
  longer disagree (ADD-006-2, structural).
- **D (on-device):** tonight's exact sequence (run1 ack → immediate re-summon → run2 resets, own handover/attempts/card)
  + stale-straggler + the existing matrix. PENDING owner run.

## Files touched
- **howsu:** `pwa_sender.py` (A1 builder field, A3 complete-push identity) · `reply_to_airtable_webhook.py` (A2 ended sweeps,
  A3 call-site threading). *No engine logic, no bridge, no deck wording changes.*
- **iona-app:** `www/app.js` (SignalAudio module — B1–B5). *No other module.*
- **Constant to pin at build:** `SA_RING_CAP_MS` = the actual Twilio dial ring timeout (confirm the create-call `timeout`;
  observed no-answer ~30s — cap set to match so the backstop never fires *before* a real no-answer).
