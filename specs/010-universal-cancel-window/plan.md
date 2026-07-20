# Implementation Plan: Universal Cancel Window (010)

**Spec**: `spec.md` (this dir) · **Status**: ready for build after the spike proof run
**Repos**: `iona-app` (device) · `howsu` (engine) · `iona-site` (website — captain's parallel track)
**Runtime**: engine Python 3.9.6; device Capacitor / `www/app.js` (byte-identical to the deployed
`android/.../public/app.js`).

## Summary
Mostly parameterise-existing. The only new mechanisms are (1) the spinny picker, (2) the Phase-2
nav-locking two-step cancel control, (3) the engine hold-then-dial with an instance-scoped cancel.
Everything else reuses existing machinery. The engine hold is the one risky change — it is proven by
the spike FIRST, then wired.

## Constitution / reuse check
- **Bug A durable**: `escalation_started` stays sole alarm-class, data-only + high. No push-mechanics
  change. ✅ (copy + ordering only)
- **MAXIMUM REUSE**: countdown card, Story-4 audio + volume override, six-contact list + scroll,
  device-dial-prompt confirm, settings-row chrome, acknowledge machinery, run-token scoping — all reused.
- **No plan gating** (Amendment 6): no `planName` branch anywhere.
- **Copy gate**: no member-facing words invented in the build; working copy only until the copy session.

## Architecture — three legs

### Leg 1 — the setting (device + engine read)
- **Device**: extend `buildMemberConfig` to keep reading `alarm-cancel-window` (already wired at
  `app.js:244`); ensure `getCancelWindowSeconds` (`app.js:796`) is the single source used everywhere
  (it already prefers the member value). Add the picker screen (see Leg 2).
- **Engine**: add `config.py` constants `CANCEL_WINDOW_SECONDS_FIELD_ID` / `_NAME` +
  `DEFAULT_CANCEL_WINDOW_SECONDS = 10`; add `_resolve_cancel_window(table1_fields)` clamp `[5,60]`
  modelled on `_resolve_sweep_count`. Read off the existing `get_table1_fields` dict — zero new read.
- **SCHEMA WALL** (captain update, 2026-07-18): **Airtable `cancel_window_seconds` field + Make 1039536
  mapping are DONE and read-back-verified.** Remaining: the **Memberstack field** (owner) and the
  **website picker** (captain). Default 10 governs meanwhile, so build does not block. When the engine
  reads `table1_fields.get("cancel_window_seconds")` it now hits a real field (empty until the
  Memberstack source + sync populate it → resolver returns default 10).

### Leg 2 — device UI
- **Picker** (net-new): a Cancel window screen reached from Account settings; spinny wheel 5–60 / 5s /
  default 10; writes the Memberstack field on save. Settings row shows the current value.
- **Phase-1 parameterise**: `_startHelpSequence` already runs the device countdown; confirm it reads
  `getCancelWindowSeconds`. **Parameterise the spoken prompt** — replace the hardcoded "…within 10
  seconds" (`app.js:161`) with the member's value (FR-010).
- **Phase-2 control** (net-new): on `showEscalationActiveState`/`renderCallingScreen`, render a
  two-step cancel control overlaying `.today-nav` with the nav tabs disabled (FR-014); calm
  semi-transparent amber border (FR-015); tap → device-dial-prompt-style confirm (green "Yes, stop" +
  ghost "Keep calling"). Hide/lock it the instant a contact press-1 lands (FR-012) — hook the same
  signal the 009 join machinery uses. On confirm, POST the cancel to the engine (Leg 3).
- **Screen transition** (FR-016): change the `escalation_started` handler (`app.js:586-594`) to raise
  the **activation screen** for the no-response push; flip to Oran's Promise on the first
  `escalation_advance {phase:"dialing"}` (currently consumed only by SignalAudio at `app.js:600-601`).

### Leg 3 — engine (no-response only; user_alert already held device-side)
- **Hold-then-dial** (net-new, spike-proven): the no-response hold lives in the **runner** process
  (`periodic_taskflow_runner.py:270` calls `run_escalation(trigger="no_response")` in-process). The
  window is held by a **precise in-process wait** — the 300s runner cycle (`CHECK_INTERVAL_SECONDS`) is
  far too coarse to time a 5–60s window. Run the wait in a **daemon thread** so the main cycle is not
  starved (R1). The runner mints `run_token` at hold-start and passes it into `run_escalation` (which
  already accepts it, `escalation_manager.py:367`); the dial then proceeds at `run_escalation`'s
  contact-loop / `make_call`. Do NOT wrap `_fire_one_touch` (sweeps 2..N are past the cancel point).
- **Durable state (FR-022, captain-mandated)**: before the wait, write `Escalation Hold — Cancel Window`
  (new EventLog status, singleLineText → code-whitelist only) carrying `dial_due_at` + `run_token`. On
  runner **startup**, sweep orphaned holds — **past-due → dial now (fail toward escalation); within
  window → re-arm remaining** (mirrors the existing `Message Sent — Escalation Pending` + 300s durable
  deferral the runner already implements). Register the new status in `RESPONDED_STATUSES` so the next
  cycle defers to the hold rather than re-firing.
- **Cross-process cancel (FR-023)**: the cancel arrives at `/pwa-respond` in the **webhook** process; it
  writes the **durable cancel marker** (validated against the live `run_token`). The runner's hold polls
  it and re-checks immediately before `make_call`; a stale token's cancel is rejected. New `response`
  value on `/pwa-respond` (no new endpoint).
- **`CHECK_INTERVAL_SECONDS` independence (captain note — 300 is dev-only; go-live 30–60s)**: nothing in
  the hold/recovery design assumes the cycle interval. The window is timed by the daemon thread's precise
  wait — cycle-interval-independent. The interval affects ONLY **orphan-detection latency** (how soon a
  post-restart cycle notices an orphaned hold): at 300s the worst case is ~300s, at 30–60s it drops to
  ~30–60s — recovery **improves** at go-live, normal-case dial timing is unaffected. (Note: the separate
  hardcoded 300 at `periodic_taskflow_runner.py:266` is the Reminder-2→escalate *pending delay*, a
  different parameter; the cancel window layers after it.)
- **Late cancel = ack path** (FR-017): the same inbound cancel, if it arrives after the dial, routes
  into `ESCALATION_ACKNOWLEDGED[(record, live_token)]` + `_send_escalation_outcome_once`; the existing
  callback halt (`reply_to_airtable_webhook.py:5041`) stops the rest.
- **EventLog** (FR-018): add phase-distinct "cancelled activation" Status string(s) to
  `event_logger.VALID_STATUS_VALUES`, and register them in `RESPONDED_STATUSES` +
  `ALREADY_RESPONDED_STATUSES`. Strings owner-reserved (copy session) — build with placeholders behind
  a constant, swap at copy.

## Phased work (spike first)

- **P0 — Spike proof run** (this plan's gate): run `howsu/spikes/feature_010_cancel_hold_spike.py`
  self-test → prove hold-then-dial, instance-scoped cancel (incl. stale-token rejection), silence=dial.
  **Must pass before any engine wiring.**
- **P1 — Setting read** (engine + device): config constants + `_resolve_cancel_window`; device getter
  confirmed single-source. Low risk.
- **P2 — Engine hold + cancel path**: graft the proven spike into `run_escalation`; add the
  `/pwa-respond` cancel value + instance-scoped check; late-cancel → ack path. Harness cells.
- **P3 — Device UI**: picker screen; parameterise the spoken prompt; Phase-2 nav-locking control +
  screen transition. Mockup is the approved reference.
- **P4 — EventLog**: phase-distinct Status (placeholder strings) + responded-set registration.
- **P5 — Copy session** (owner, parallel): activation label, spoken prompt, Phase-2 label,
  cancelled-activation vocabulary → swap placeholders.
- **Captain track** (parallel, out-of-repo): Memberstack field, Airtable field, Make 1039536 mapping,
  website picker on onboarding + dashboard.

## Harness (per ruling + captain)
- `cancelled_in_window` — no dial, correct EventLog.
- `expired_window` — dial proceeds.
- `late_cancel` — routes to ack path, sweep halts, no new state.
- `offline_member` — dial on time (silence = dial).
- `stale_cancel` — a prior run's cancel never suppresses a later run (spike + harness).
- `restart_during_hold` (captain-mandated) — kill the runner mid-window; on restart a past-due hold
  dials, a within-window hold re-arms; a cancelled hold stays cancelled; the pending dial is never
  lost. Durable-store logic already proven in the spike's durable suite (5/5).

## On-device bar (the only verification that counts)
- Real pocket-style mistap cancel (app button, from pocket).
- Set-to-60 wake-up cancel (no-response nap scenario).
- A genuine expiry that dials.
- Phase-2 two-step cancel over locked nav; press-1 removes the control.

## Risks & mitigations
- **R1 — engine hold starves the runner cycle.** A synchronous ≤60s hold inside the 300s cycle would
  block other members' processing. **Mitigation: run the hold in a daemon thread**; the main cycle
  continues, and the durable `Escalation Hold — Cancel Window` state + startup sweep back it up if the
  process dies. Transition the EventLog status to the hold state *before* spawning the thread so the
  next cycle defers rather than double-firing. Verify in P2.
- **R5 — restart / cross-process (captain-mandated).** Process death mid-hold, or a cancel arriving in
  the webhook while the hold is in the runner. **Mitigation: durable hold state + startup sweep (dial
  past-due, re-arm within-window) + durable cancel marker validated against `run_token`** — FR-022/023,
  spike durable suite 5/5. Fail toward escalation: an orphaned uncancelled hold always eventually dials.
- **R2 — cold-wake cancel.** A killed app that cold-wakes on `escalation_started` must be foreground
  enough to send an in-window cancel; if not, silence = dial (correct, FR-006). No mitigation needed —
  it is the ruled behaviour, but call it out in on-device testing.
- **R3 — screen transition regressions.** Changing the `escalation_started` handler must not break the
  existing direct-to-Promise behaviour for any path that still wants it (member-initiated commit path).
  Mitigation: gate the activation-screen render to the no-response push; member-initiated keeps its
  existing device flow. Verify both on device.
- **R4 — responded-set omission.** A new cancelled Status not registered in both responded sets causes
  re-trigger or swallow. Mitigation: FR-018 checklist + harness `late_cancel` + `cancelled_in_window`.
