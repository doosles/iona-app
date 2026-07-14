# BRIEF → Captain — R-006-12 on-device progress (2026-07-11)

**From:** CC · **Re:** run-boundary + one-authority fix, on-device verification against the D matrix.
**Headline:** the fix is built, deployed, backend-proven, and the exact break from tonight's forensic now **passes on
the device**. Three of five matrix items confirmed by the owner; two remain.

## Built + deployed (unchanged since the ruling — no code pending)
- **A (server):** `escalation_started` carries `run_token` (fields only — alarm-class type/priority/`ALARM_CLASS_TYPES`
  byte-untouched). R-006-8 builder stamps **`run_ts`** on every signal; minted in `run_escalation`, cached per-process,
  carried on `make_call`'s callback URL so the webhook adopts the SAME `run_ts` cross-process. Harness gained
  `run_ts_stamped_consistent`. **Direct 18/18 · bridge 12/12 · bridge deck byte-unchanged.**
- **B (reducer):** `run_ts` TOP rule (newer resets even over a terminal; older discards `stale-run-ts`; equal = same
  run). Terminal absorption **run-scoped**; `started` never absorbed. **F2** killed-state synthesis (first advance
  rebuilds handover→attempt); native alarm path left untouched.
- **C (card):** `handleEscalationComplete` gates through the SAME judge as audio (`_saAcceptsComplete`, token+run_ts);
  `escalation_state` demoted to a subordinate belt. Card and audio cannot disagree.

## On-device matrix (owner-run)
| # | Test | Result | Evidence |
|---|------|--------|----------|
| **1** | Back-to-back: run1 ack → immediate re-summon | ✅ **PASS** | Owner: **both runs opened with Iona**. Log: run 2 (`72ed8a01`, ts …166215) processed against `current run=72ed8a01` — reset onto its OWN run (contrast the bug's `current run=—`); drew its own "We've reached Margaret" card; only its own late-duplicate `ended` absorbed (same-run). Server: run1 `b7607cb1` ts …099775 < run2 …166215. |
| **4** | Contact 2 rings | ✅ **PASS** | Owner-confirmed. |
| **5** | Decline (press 9) / exhausted | ✅ **PASS** | Owner-confirmed. |
| **2** | Voicemail run (mobile → voicemail) | ✅ **PASS** | Owner: "left one message, ends promptly". Doubly-fixed — the **econtact AMD branch** (surgical Fix 1, verified `AnsweredBy='machine_start'` on the fetch, run `fda93e4e`) shrinks the call to one ~15s message + hangup, and the R-006-12 `ended` signal stops the device ring at connect. |
| **3** | Mid-sweep acknowledge (answer + press 1 partway) | ⏳ pending | Symptom-3 (audio outliving terminal) surface. |

## Surgical brief (econtact call) — COMPLETE
- **Fix 1 — econtact AMD voicemail branch:** verify-first probe confirmed `AnsweredBy='machine_start'` on the econtact
  fetch (sync AMD holds on this path); branch wired mirroring `_handle_twiml_call` (one message + hangup; human path
  byte-identical). **On-device PASS.** Effect: voicemail ~60-70s of 3× prompt → one ~15s message with the 0333
  acknowledge line; sweep advances ~50s sooner.
- **Fix 2 — first-name greeting:** applied across all THREE mouths (ivr + voicemail + sms, sms captain-ratified);
  `greet_name = contact_first or contact_name`; `full_name` stays full. Harness **direct 18/18 · bridge 12/12**.
- **Call-Failed anomaly (separate):** contact 1 returned `busy` on both sweeps (SIPs `CAda8969…`, `CA5cbf67b…`) →
  engine-correct "Call Failed" (placed-but-failed, not a fault); no Twilio ErrorCode (busy isn't an error). Line
  engaged during the test. Optional `ErrorCode` capture for genuine `failed` callbacks flagged, not applied.

## Fences held
Native alarm/Bug-A path NOT rebuilt (accommodated via F2 synthesis). Alarm-class `escalation_started` semantics
byte-untouched (fields only). Bridge deck byte-unchanged; harness necessary-never-sufficient.

## Outstanding
1. **Owner runs #2 (voicemail) + #3 (mid-sweep acknowledge)** — the last two matrix items.
2. **Stale-straggler named test** (inject a late run-1 signal during run-2 → discard `stale-run-ts`, both surfaces
   unmoved). Structurally it is the `run_ts <` branch the back-to-back already exercised in the newer-wins direction;
   it will surface as a `stale-run-ts` discard line in the device log if a real straggler ever lands. If the captain
   wants it proven explicitly rather than structurally, CC can inject a synthetic and capture the discard.
3. **Tablet parity** — named pre-launch gate (vault `05 Reference/Pre-launch checklist.md`), NOT a 006 gate. No Android
   tablet available.

## Docs
- Forensic: `specs/006-signal-audio/FORENSIC_two-runs_2026-07-11.md`
- Plan + R-006-12 addendum: `specs/006-signal-audio/PLAN_state-machine_R-006-11.md`
- Decision: vault `03 Decisions/2026-07-11 Signal-audio run boundaries — run_ts total order + one authority (R-006-12).md`
