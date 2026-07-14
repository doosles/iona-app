# Quickstart — validating "The outcome, everywhere"

Validation/run guide only. Implementation detail lives in `tasks.md` (Phase 2) and the code. These runs prove
the feature end-to-end against the Success Criteria.

## Prerequisites

- Backend (`howsu`) running with the deck-v1.7 copy + the A1/A2/A3 half-clips rendered + bundled; the enriched
  `escalation_advance` (with `outcome=`) live. **`[ENG]` emit only after the captain signs
  `BRIEF_outcome_field_escalation_advance.md`.**
- iona-app built to a Pixel (`npx cap copy` → `./gradlew installDebug`) with the outcome branch + screen mirror
  (screen only after the internal mockup is approved — FR-014).
- A Signal-method test member and a hands-free test member; test contacts able to produce each outcome
  (a voicemail number, a number that presses 9, a number that rings out, a final-sweep SMS contact).
- Push preconditions green: `node --check www/app.js`; `python3 -m py_compile` on every edited backend file;
  the **escalation harness green**; webhook `ff"` count = 0.

## Run 1 — Consumer 1 outcome matrix (US1 / SC-001, SC-002, SC-006)

For each outcome, run a live escalation and listen to the between-attempt beat:

| Attempt produces | Expect to hear (→ next) | Terminal variant (last contact) |
|---|---|---|
| voicemail | "I've left {prev} a voicemail — trying {next} now." | "…a voicemail." |
| final-sweep text | "I've sent {prev} a text — trying {next} now." | "…a text." |
| press-9 decline | "{prev} is currently unable to assist — trying {next} now." | "…unable to assist." |
| rang out | "There's no answer from {prev} — trying {next} now." | "There's no answer from {prev}." |

- **SC-001**: 4/4 outcomes produce the distinct correct line; **0** collapse into "no answer" they didn't get.
- **SC-002**: the line is audible within ~2 s of the enriched signal arriving.
- **SC-006 (fallback)**: drop the device's signal mid-sweep → the handoff falls to a neutral, non-false bed;
  never silent, never a wrong outcome.

## Run 2 — Consumer 2 screen mirror (US2 / SC-004)

- Watch the *calling your contacts* screen during a live escalation on **both** a Signal and a hands-free member
  (universal audience, Q2).
- Each contact chip: pending → active (channel-honest) → resolved (correct outcome).
- **SC-004**: a text-delivered attempt shows a text-appropriate status and **never** "ringing" — 0 mismatches.
- Repeat on a **wifi tablet** (no SIM) for parity.

## Run 3 — Coherence across surfaces (US3 / SC-003)

- For each outcome type, capture the **spoken** line, the **on-screen** chip, and the **history** row for the
  same attempt.
- **SC-003**: all three name the same outcome — 100%. In particular the press-9 case reads *"{name} is currently
  unable to assist"* (audio), an unable-to-assist chip (screen), and *"{name} was unable to assist"* (history,
  after the Part-D alignment).

## Run 4 — Passenger / no-regression (I.4 / SC-005)

- Run the escalation harness with the outcome field **on** vs the layer **off** (or emit suppressed): the sweep
  completes **identically** — same timing, same terminal, same EventLog rows. **SC-005**: 0 measurable change.
- Confirm the enriched emit is fire-and-forget (a forced FCM-send error leaves the sweep undisturbed).
- Narrator coverage gate: 0 new gaps after the Part-D line.

## Done when

All four runs pass on-device, the harness is green, coherence is 100% across the three surfaces, and the
passenger property holds (sweep byte-identical).
