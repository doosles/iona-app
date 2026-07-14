# Handoff — Feature 005 press-time recovery ("a help press must never be silent")

**Date:** 2026-07-03 · **Author:** Claude Code · **For:** Claude web (captain/reviewer) + Ian
**Status:** BUILT + backend logic unit-proven · **NOT deployed, servers not started** · on-device proof owner-driven

Resumes the PARKED design from the 2026-07-02 (late) session. Captain brief: press-time recovery is the
PRIMARY stuck-button defence; the ~30-min self-heal drops to a secondary backstop for the no-one-presses-again
case only. The button must heal on the NEXT PRESS, not on a timer.

---

## The live-vs-not signal chosen — and why it's fast enough

**Chosen: a purpose-built backend liveness read, fronted by a local fast-path, with hard bias-to-summon.**
This is the hybrid — I verified the dependency first (per the brief) and found NO existing fast liveness read.

**Why not local-only:** two states *at age 2 min* — "ladder genuinely running" vs "a contact acknowledged
early, the outcome FCM was lost, flag stuck" — are **locally indistinguishable**. Req 1 (heal ANY stuck state
on the next press, incl. young ones) and Req 3 (a genuinely-live young escalation absorbs) can't both hold with
a local recency window alone. Only the backend knows the missing bit: **did the outcome already fire even though
the app's FCM was lost?**

**Why the backend read is fast enough:** it's an in-memory dict lookup on the already-running webhook (no
Airtable, no work). It is consulted **only** when the app's local flag is `active` AND recent (< 30 min) — the
common idle press does zero network. Tight **1200 ms** timeout. Every uncertain path resolves to **summon**:
not-live → summon, non-200 → summon, offline/abort → summon, missing id → summon, webhook-restarted (in-memory
set wiped) → summon. It only ever **absorbs** on a positive `{"live": true}`.

**Bias boundary (load-bearing, stated in code):** *anything short of a positive "yes, live" heals the flag and
summons.* A possible duplicate escalation is recoverable (backend `run_escalation` is re-entrant; idempotency
guards exist); a bricked help button in distress is not.

The backend `ESCALATION_IN_FLIGHT` entry is **self-expiring** (30-min TTL) so a missed clear can only ever bias
toward summoning, never toward bricking.

---

## What changed

### Backend — `reply_to_airtable_webhook.py` (ADDITIVE ONLY — no existing escalation logic altered)
- `ESCALATION_IN_FLIGHT = {}` (rec → epoch start) + `ESCALATION_LIVE_TTL_SECONDS = 1800`.
- `_mark_escalation_in_flight()` / `_escalation_is_live()` (self-expiring) / `_run_escalation_tracked()` wrapper.
- All **5** `run_escalation(...)` call sites now go through `_run_escalation_tracked(...)` (marks in-flight,
  then dispatches the unchanged ladder). The ladder itself (`escalation_manager.run_escalation`) is untouched.
- **Key line:** `_send_escalation_outcome_once` now pops the rec from `ESCALATION_IN_FLIGHT` the instant the
  outcome fires — so the liveness read reflects "resolved" even if the app's outcome FCM is lost.
- New **`GET /pwa-escalation-live?rec=recXXXX` → `{"live": bool}`** (read-only, never mutates state) + CORS
  preflight allow-list entry.

### App — `iona-app/www/app.js`
- `_escalationConfirmedLive()` — device-dial local live-check → local 30-min stale fast-path → tight-timeout
  backend read; returns TRUE only on a positive live, else FALSE (summon).
- `_summonEvaluating` re-entrancy flag — closes the await window so a flurry still resolves to ONE sequence.
- `_startHelpSequence` guard rewritten: absorb ONLY (`active` AND confirmed-live) OR a live cancel-window
  countdown; every other state (idle / terminal / stale-or-unconfirmed active) heals the flag and summons on
  THIS press. Front door for Flic + I-NEED-HELP + orb (single choke point).

---

## Acceptance trace (how each bar is met)

1. **Stuck → next press summons.** Old stuck (age>30m): local fast-path → summon, instant/offline. Young stuck
   (early ack, FCM lost): backend popped at outcome → live:false → summon. Glitch (never started): not in set →
   live:false → summon. ✅
2. **Flurry → exactly ONE sequence.** Countdown phase: `_summonCountdownActive`. Liveness-await phase:
   `_summonEvaluating`. Post-commit live: backend live:true → absorb. ✅
3. **Genuinely live absorbs.** `active` + in-flight + recent → live:true → absorb; live device-dial →
   `device_dial_active` → absorb. ✅
4. **30-min timeout remains** underneath (self-heal in `showEscalationActiveState`, unchanged). ✅

---

## Timing horizon — unified at 45 min (owner decision, 2026-07-03)
The single "max plausible live escalation" horizon is now **45 min** in all four places, so they agree:
backend `ESCALATION_LIVE_TTL_SECONDS` (2700 s), app `ESCALATION_LOCAL_STALE_MS`, app cold-init stale-clear
(×2), and the self-heal `ALARM_ESCALATION_TIMEOUT_MS`. (The self-heal must be REDEPLOYED — device last ran
20 min.)

## Verification done / still owed

- ✅ `py_compile` (webhook) clean; `ff"` count 0. `node --check` (app.js) clean.
- ✅ **Backend liveness logic unit-proven against the real module:** unknown→not-live, marked→live,
  outcome-pop→not-live, self-expiry→not-live+auto-removed; TTL = 2700 s confirmed.
- ✅ **DEPLOYED + ON-DEVICE VERIFIED (Pixel 4a, 2026-07-03 ~08:3x, servers up):** `cap copy` +
  `gradlew installDebug` BUILD SUCCESSFUL; endpoint live through public ngrok + CORS preflight OK.
  - **B1 stuck→summons — PASS:** `Fake stuck` → physical `SUMMON (short)` → backend logged
    `[LIVENESS] rec='recHAIFdUyiYC5rZ5' -> live=False (app: summon)` → stuck flag healed, press summoned.
    (Because this member is on Speakerphone mode, the summon then committed a real self-test bridge — the
    heal is proven by the liveness line, independent of what the summon resolves to.)
  - **B2 flurry→one — PASS:** 10 rapid `Sim press` from idle → cancelled → **0 new bridge conferences**
    (count held at 2) — de-dup held (`_summonCountdownActive`/`_summonEvaluating`). No `[LIVENESS]` line
    (idle short-circuits before the backend read, as designed).
  - **B3 live→absorbs — PASS:** `Fake live` → press absorbed, no cancel window, **no** `[LIVENESS]` line
    (local `device_dial_active` short-circuit before any backend call).
- Added a one-line `[LIVENESS]` log in `_handle_pwa_escalation_live` for observability (worth keeping —
  a liveness read is a signal, like the self-heal log).

### Quick on-device sit-down (temporary Flic dev panel, bottom-right — new "press-time recovery" row)
Servers up first (`run_servers.sh` — webhook + ngrok). Then, per behaviour (a cancel window = "the press
summoned" → tap **CANCEL** to avoid committing a real escalation):
- **B1 stuck→summons:** tap **Fake stuck** (sets active + fresh ts, no backend escalation → forces the
  backend read, which returns not-live). Then a **physical Flic press** *or* **Sim press** → cancel window
  appears = PASS (the young-stuck flag healed via the backend read). Then CANCEL.
- **B2 flurry→one:** from resting Today, tap **Sim press** rapidly ×5 → exactly **one** cancel window = PASS.
  Then CANCEL.
- **B3 live→absorbs:** tap **Fake live** (active + `device_dial_active` → confirmed-live). Then physical
  press *or* **Sim press** → **no** cancel window (absorbed) = PASS. Relaunch to clear the test artifact.

## Open items for the captain
- Confirm the bias-to-summon reading of Req 3 for the offline-during-live-escalation edge (we re-summon; the
  brief's bias rule sanctions it).
- Remove the dev-panel test rig (Fake stuck / Fake live / Sim press) when the whole `_initFlicDevPanel` goes
  at Phase 3.
