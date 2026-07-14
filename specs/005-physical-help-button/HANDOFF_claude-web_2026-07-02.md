# Handoff — Feature 005 "A Physical Button That Summons Help" (Flic 2)
**For:** Claude‑web (oversight / captain / reviewer seat) · **From:** Claude Code session · **Date:** 2026‑07‑02
**Repo:** `/Users/Henry/iona-app` (consumer Capacitor app + Spec Kit) — distinct from the howsu backend
**Status:** Spec Kit complete through `tasks.md`; **sitting at the approval gate — nothing built yet.**

---

## 1. What the feature is (one paragraph)
Give a person a small **Flic 2** physical button they keep nearby. A deliberate **press‑and‑hold** starts
**the existing reactive help sequence** — the *same* one the in‑app help control starts (same cancel window,
same reaching of their people). The button is a **second front door into the one help path**, not a second
system. It works **through the phone** (BLE; phone on, in range, service running) — honest, stated scope, not
a defect. An always‑armed listener is kept alive by a **foreground service** ("Iona is here for you." notification).
Two load‑bearing safety rules (Constitution I.4): a press **acts now or not at all** (stale/queued presses
dropped, native age‑check) and a press **never stacks** (duplicate absorbed by the *existing* `escalation_state`
guard — inherited, verified, never rebuilt).

## 2. Spec Kit state
All artifacts in `specs/005-physical-help-button/`:
- `spec.md` — US1–US6, FR‑001…FR‑032, SC‑001…SC‑010 · `plan.md` — architecture + Constitution check
- `checklists/requirements.md` (16/16) · `checklists/safety.md` (reactive‑path safety gate, §A–§J)
- `tasks.md` — **T001–T033 + PRE‑1/PRE‑2** (33 numbered + 2 prereqs), all unchecked
- `iona_pair_button_flow_four_states.html` (repo root) — pairing mockup, **now updated** (see §4)

**Nothing implemented.** `tasks.md` explicitly awaits **owner approval** before any code.

## 3. What changed THIS session (the part Claude‑web missed)
The session took the base spec and hardened it against **silent death** (a help button that has quietly
stopped working is worse than no button). Four threads, all propagated across spec/plan/safety/tasks:

**A. Two reliability gaps closed**
- **Reboot survival** — after a cold reboot nothing runs (SDK storage persists only the *pairing*, not a
  listener). Added a **`BootReceiver`** (`BOOT_COMPLETED`/`LOCKED_BOOT_COMPLETED` → start the FGS **without an
  app launch**). FR‑030 · T003 (perm) · **T023** · verified by T016. Android‑14 boot‑FGS caveat flagged for
  the S22.
- **OEM silent death** — aggressive power management kills the FGS. Added a **battery‑optimization exemption**
  in pairing (FR‑031 · T003 perm · T013) + an **OEM‑survival on‑device gate** (**T024**, incl. Samsung S22).

**B. Double‑tap = full end‑to‑end SERVICE TEST** (the big one — US6, new)
- **Decision:** double‑tap runs a **real end‑to‑end round‑trip** — button → app → a **new permanent
  `/service-test` webhook endpoint** (howsu backend) → **EventLog** → confirmation back. It is **also** an
  in‑app **"Test service"** control.
- **Suppression is safety‑critical (FR‑026):** the test **MUST NOT dispatch** (no cancel window, no contact,
  no escalation). Guarded at **two independent layers** — a distinct gesture (`buttonSelfTest` ≠
  `buttonSummon`) **and** a distinct endpoint (`/service-test` ≠ the summon path). A real summon is never
  downgraded to a test.
- **Logs BOTH outcomes (FR‑028, owner‑decided):** `Service Test — Passed` **and** `Service Test — No
  Response` on timeout — so "I tested and heard nothing" is a recorded, **carer‑visible** fact, never silence.
- **Multi‑channel confirmation (FR‑027):** a **soft calm chime (never an alarm/beep timbre)** + orb ping +
  in‑app ping + haptic; **chime only on a pass**. FRs 025–029 · SC‑008/009 · safety §I · **T025–T029, T033**.
- Cross‑repo: `event_logger.py` gains new EventLog types (**register before first log** or events are silently
  dropped — the known PWA‑pause pitfall); free‑text fields, **no Airtable schema change**.

**C. Low battery** (owner‑added — commonest real cause of a dead button)
- Early **calm heads‑up** + status‑row indicator + **logged** `Button Battery Low`, surfaced *before* the
  button dies, never framed as "failure". FR‑032 · SC‑010 · safety §J · **T030–T032**.

**D. Pairing mockup located + updated**
- `iona_pair_button_flow_four_states.html` — added the missing Android **"Pair & Connect"** line at step 2,
  and built a **fifth state**: the button‑test feedback ("**working**" = teal orb + radiating ping rings +
  chime/wave motif; honest "**couldn't confirm**" sibling for the logged no‑response). PRE‑1 now `[~]`
  (commit remains). Constitution‑III gate flipped to ✅.

## 4. Architecture at a glance
- **Summon path = single‑repo** (iona‑app). Native: `FlicPlugin` (extends the `ZeroCallPlugin` pattern) +
  `IonaApplication` + `FlicListeningService` (FGS `connectedDevice`) + `BootReceiver`. Web: `buttonSummon` →
  **existing** `_startHelpSequence('physical_button')` (new label = provenance only; path byte‑for‑byte).
- **Service test = cross‑repo** (iona‑app ↔ howsu backend `reply_to_airtable_webhook.py` `/service-test` +
  `event_logger.py`). This **replaces** the throwaway `/flic-test` bring‑up rig (T021 formalises, not just
  deletes; `/service-test` stays permanent).
- Time‑critical logic is **native/SDK‑driven** (press delivery, stale‑age drop, FGS), never a WebView timer
  (Constitution IV).

## 5. Invariants a reviewer must guard
1. **No new/parallel help path** — the summon wires into the *existing* `_startHelpSequence`; cancel window +
   duplicate‑absorption are **inherited and verified, never rebuilt** (I.2 / I.4).
2. **The service test never dispatches** — two‑layer separation (gesture + endpoint). A test that could summon
   help is a wall breach.
3. **Fail loudly, never silently** — stale drop, duplicate absorb, reboot re‑arm, OEM survival, low battery,
   and the no‑response log all make failure *visible* (I.4).
4. **Vocabulary** — no "check‑in"/"watching"/care/welfare/alarm/"emergency"/"failed"; Iona is name‑only,
   pronoun‑free; notification is exactly **"Iona is here for you."**; pressing for help never reads as "off" (II/I.6).
5. **"Verified" = on the physical Pixel + physical Flic** — never build/deploy or server‑side alone.

## 6. Current state · blockers · next actions
- **Blocked on owner:** (a) **approve `tasks.md`** before any build; (b) **commit the mockup** (PRE‑1).
- **Mine, unblocked:** **PRE‑2** — pin the latest stable `com.github.50ButtonsEach:flic2lib-android` JitPack
  tag in `android/app/build.gradle` (blocks T002).
- **Then:** Phase 1 native foundation (T001–T006) → Phase 2 the **Safety MVP** (T007–T011: a dev‑paired press
  starts the real help sequence; stale dropped; duplicate absorbed — proven on hardware **first**).

## 7. Open / deferred (where oversight input is welcome)
- **Settings surface for the self‑test is DEFERRED** (test cadence, reminders‑to‑test, finer per‑outcome
  copy) — to be worked through in a later settings pass; explicitly out of scope here.
- **Android‑14+ boot‑time FGS start** for `connectedDevice` — allowed from `BOOT_COMPLETED`, but needs S22
  verification (not just Pixel).
- **`/service-test` auth** — uses the same recId scheme as existing endpoints; auth hardening (IDOR) deferred
  per project norm, consistent with the other contact endpoints.
- **Chime asset** (T033) — needs sourcing; must be soft/reassuring, not a medical‑alarm timbre.

## 8. File pointers
- `specs/005-physical-help-button/{spec.md, plan.md, tasks.md, checklists/safety.md}`
- `iona_pair_button_flow_four_states.html` (repo root — pairing + fifth test state)
- Cross‑repo (howsu): `reply_to_airtable_webhook.py` (`/service-test`), `skills/event_logger/scripts/event_logger.py`
- Existing patterns to mirror: `ZeroCallPlugin.java`, `BridgeService.java`, `_startHelpSequence` in `www/app.js`

---

## 9. Review round 1 — Claude‑web flags, resolved (2026‑07‑02)
- **SAFETY (folded in):** short-press summoner's tremor → SDK double-click → would route to the *test* not the
  summon (the OQ1-B user, in a crisis, gets a "working" chime instead of help). **Fix encoded as FR-026a:**
  when summon = short-press, **every** gesture (single/double/hold) → `buttonSummon` and the **button-based
  test is disabled** (test via the in-app "Test service" only); hold-users keep double-tap = test. Propagated
  to FR-005/FR-025/US6 AC5/edge case · T008 (conditional routing)/T019/T026 · safety CHK025a + ⌾CHK029a ·
  plan gesture-filter + risks.
- **PRE-1 commit question — answered:** **iona-app IS a git repo that uses commits** (recent history), unlike
  the howsu workspace's no-commit norm. Committing the mockup here is expected.
- **T024 S22 gate — deferred:** no S22 owned (cf. the unattended-bridge Android-14 verdict). Pixel legs run
  now; the S22 OEM leg + T023's Android-14 boot-FGS check are marked **deferred until 14+ hardware**, **not
  ship blockers**. (Test Pixel is a 4a on Android 13.)
- **T033 chime — owner-deferred:** tentative pick **Chime 2 (warm rise C→G)** from Claude‑web's 3 synthesised
  soft-sine candidates; owner confirms on the **Pixel's own speaker** before bundling.

---

## 10. Phase 1 + 2 bring-up — DONE on device (2026-07-02) · 2 findings for captain review
Built + verified on the physical Pixel + physical Flic (tag `flic2lib-android:2.0.1`). **T001–T011 + PRE-2
complete; T004/T005/T006/T009/T010/T011 verified on hardware.** Stopped at the Phase-3 gate as instructed.

**Fixes forced by on-device reality (all resolved):**
- **BLE scan permissions** — flic2lib caps `ACCESS_FINE_LOCATION` at maxSdk 30 and uses `BLUETOOTH_SCAN`
  (`neverForLocation`) on 12+. My scan gate wrongly required location on all API levels → scan rejected on
  Android 13. Fix: API-aware gate (31+ → BT perms only) + `neverForLocation` on our `BLUETOOTH_SCAN`.

**Two written premises FALSIFIED on device — corrected in spec/plan/safety (please review):**
1. **FR-007 stale guard — the "~15 s timestamp age" was unworkable.** flic2lib's event `timestamp` is a
   **button-relative clock**, not comparable to any phone clock (`currentTimeMillis`→~56 000 yr age;
   `elapsedRealtime`→~4-day age). **Fix: drop on the SDK's `wasQueued` flag** (queued/out-of-range delivery),
   trust live presses — which is exactly FR-007's literal wording. The numeric threshold is retired.
   *(CHK002/003 + plan §stale guard + FR-007 note updated.)*
2. **FR-008 duplicate absorption was NOT purely inherited.** The `escalation_state` guard only covers the
   **committed** phase; a second summon **during the cancel-window countdown** re-entered `_startHelpSequence`
   (replayed siren, spawned a 2nd countdown timer). The in-app trigger is hidden during the countdown so it
   never hit this — the **always-pressable physical button exposed a latent bug in the shared reactive path.**
   **Fix: `if (_alarmFlowActive) return;` in-flight guard** at the top of `_startHelpSequence` (reuses the flag
   set when the cancel window shows) — hardens the in-app path too. *(CHK006/007 + plan §Web-layer wiring +
   FR-008 note updated.)*

**For the captain:** both fixes touch the **shared, load-bearing reactive path** — worth a review that (a)
`wasQueued`-only staleness is acceptable (a briefly-queued press won't summon on quick reconnect — the person
re-presses while connected; safe vs a phantom alarm), and (b) the `_alarmFlowActive` guard has no path that
could leave it stuck-true and block a real summon (existing resets: cancel/idle/proactive-message/bridge).

## 12. Built + verified per your review (2026-07-02) — two shapes changed from §11
Your review resolved both, and building surfaced two refinements — both improvements:

- **Fix 2 (staleness) — your condition-2 path built + verified.** Not `wasQueued`-only after all:
  `age = Flic2Button.getReadyTimestamp() − pressTimestamp` is a same-clock DELTA, so a **queued-but-fresh
  (≤15 s) press FIRES**, only genuinely-old drops. On-device the dropped ages read **33 s / 243 s** (sane —
  the clock is right). Condition 1 met: drop emits `summonDropped` → JS logs + a **calm on-screen note**
  ("A button press just now couldn't be acted on…"), never silent.
- **Fix 3 (guard) — re-scoped from `_alarmFlowActive` to a countdown-only flag.** The enumeration found
  `_alarmFlowActive` is `true` on **terminals**, where the "I NEED HELP" retry calls `_startHelpSequence`
  (app.js:1398) — so it would have **blocked a legitimate retry**. Switched to **`_summonCountdownActive`**
  (set at countdown start, cleared on cancel/commit) — guards only the actual gap, never blocks terminal
  retry, and can't get stuck (the countdown always resolves). Your #3 reasoning holds unchanged (fresh
  process resets it; live-sequence absorb still works; hung escalation → #12). Duplicate-absorb re-verified.
- **#12 self-heal — wired to your spec.** `ALARM_ESCALATION_TIMEOUT_MS` (20 min) armed in
  `showEscalationActiveState`, cleared on any normal completion; on fire it clears both flags + re-arms +
  `logBridgeEvent('escalation_self_heal', …)` + `console.warn`. **Sanity-check owed:** confirm the worst-case
  ladder run (contacts × rings × retries) stays well under 20 min — if it ever approaches, raise the constant.
- **FR-026a — CHK029a PASS on device:** short-mode, every press incl. double-taps → summon, zero self-test.

**Next: #11 (FSI) building now**, with your three corrections: build FSI unconditionally (A13 sideload),
add `canUseFullScreenIntent()` → grant-screen redirect in pairing (A14/Play deferred with S22/boot-FGS),
and a **max-priority sounding notification as the denied-FSI floor** (loud, never silent). Closed-app press
= the proof.

## 13. #11 works-while-closed — BUILT + VERIFIED on device (2026-07-02), your 3 corrections in
**The core promise landed:** app swiped closed + phone locked → press-and-hold → phone **wakes into the
cancel window over the lock screen**, one clean sequence. Your corrections built exactly:
- **FSI unconditional** on the A13 sideload (works now). **Denied-FSI floor:** high-importance sounding
  channel ("Iona is reaching your people — tap to continue"). **`canUseFullScreenIntent()` +
  grant-screen redirect** commands added for the Phase-3 pairing sequence to wire; A14/Play deferred with
  S22/boot-FGS.
- **Fix-3 interaction confirmed, no bypass logic** (as you called): fresh process cold-inits the guard;
  live-sequence absorb via `_summonCountdownActive`.
- **A real bug the on-device test caught — and fixed:** my first cut used a *retained* Capacitor event for
  the launch summon → it **re-fired on every WebView reload → looped** (repeat countdowns/bridge calls).
  Replaced with a **one-shot flag** the app consumes exactly once (on load OR resume, cleared atomically) —
  a reload can't replay it. Re-verified: one sequence, `escalation_state` back to idle, normal launch fires
  no phantom summon. Also fixed an orb-overlay z-race (guard `showOrb` on `_alarmFlowActive`).

**Phase-2 + the works-while-closed core are DONE on hardware.** Remaining before Phase 3: the FSI grant-check
UI (Phase-3 pairing picks it up), PRE-1 mockup commit (owner), a real terminal-retry sighting, and your
owed sanity-check that the worst-case escalation ladder run stays under the 20-min self-heal.

**Still open:** a **temporary dev panel** (`_initFlicDevPanel` in `www/app.js`) is in the build for
pairing/testing — **must be removed** with the Phase-3 real pairing flow. *(FR-026a CHK029a was subsequently
RUN and PASSED — §12/§13 are reconciled: the earlier "wasn't run" line here was stale, superseded by §12.)*

---

## 11. Captain update — responses to your Phase-2 review + a NEW critical finding (2026-07-02)

### Fix 3 (`_alarmFlowActive` guard) — enumeration DONE; ONE stuck path found
Every `_alarmFlowActive` write mapped (www/app.js). Self-heal per exit path:
- cancel-window cancel → `cancelAlarm` → `showAlarmIdleReset` (1230→899) ✓
- escalation acknowledged/exhausted terminal → `showTerminalState` 60s auto-return (842→899) ✓
- escalation success terminal → `showSuccessTerminal` 60s auto-return (889→899) ✓
- bridge resolved → `hideBridgeCard` (2017) ✓ · bridge exhausted/terminal → 60s auto-return (1977→899) ✓
- device-dial terminal → `_deviceDialTerminal` 60s auto-return (2711→899) ✓
- 60s auto-return → `showAlarmIdleReset` ✓ · app relaunch → cold init `false` (673) ✓
- **STUCK: `showEscalationActiveState` (781, "Calling your contacts") sets it true with NO auto-return / NO
  timeout** — exits only on the outcome FCM. FCM never arrives (escalation hang, a known failure mode) →
  flag stuck true → **button bricked till relaunch.** Same hang also sticks `escalation_state='active'`,
  independently blocking re-summon. **`ALARM_ESCALATION_TIMEOUT_MS` (20 min, line 98) is DEFINED BUT NEVER
  WIRED** — the intended self-heal, dead code.
- **Recommended fix:** wire the dead 20-min constant → on timeout `showAlarmIdleReset` (clears both flags).
  Fixes the one stuck path AND a pre-existing latent escalation-hang bug the always-pressable button exposes.
  (Value/behaviour of the timeout is a design call for you.)

### Fix 2 (staleness) — condition 2 answer: queue duration IS derivable → prefer the ≤15s allowance
The SDK exposes **`Flic2Button.getReadyTimestamp()`** (+ `onReady(button, timestamp)`) — a reconnect
reference in the **same button-relative clock** as press timestamps. So for a queued press,
**age = readyTimestamp − pressTimestamp** is a same-clock DELTA (reliable; the absolute base being
button-relative no longer matters). This restores "**queued but fresh (≤15 s) still fires; only genuinely
old presses drop**" — your preferred outcome. Will verify the delta is sane on-device. **Condition 1 (loud
drop):** a genuinely-old dropped press will be logged + (where foregroundable) surfaced as a calm on-screen
note, so a dropped summon never vanishes silently.

### NEW CRITICAL FINDING — the button does NOT work while the app is CLOSED
On-device: app swiped closed, FGS + "Iona is here for you." still up, process alive, button connected — a press
**fires `buttonSummon` natively (confirmed in logcat) but nothing happens**: the WebView is destroyed on
close, so the JS `_startHelpSequence` can't run. **The FGS keeps the PROCESS, not the WebView.** The plan
conflated "service running" with "summon works." For a help button, works-while-closed is the core promise.
**Fix: native fires a full-screen-intent notification on summon → launches `MainActivity` into the help
sequence** (also wakes + shows over the lock screen — ideal for a help button). Needs `USE_FULL_SCREEN_INTENT`
(Android-14 gated). Spec FR-006 / edge-cases to correct. This is the biggest gap — demo vs real button — and
it interacts with Fix 3: the launched summon must run even while a stale terminal/flag is up.

## 14. PARKED for next session — "a help press must never be silent" (design decision for the captain)
The owed 20-min sanity-check surfaced something bigger than the timer. **Answers to the captain's 3 items:**
- **Ladder maths (live constants):** 6 contacts × 3 attempts, `ECONTACT_ATTEMPT_DELAY_SECONDS=15`, **no
  `Timeout` set → Twilio default 60s ring** (not 35s), answered-no-press IVR **re-prompts 3×** (`timeout="4"`
  Gather). Worst case ≈ **22 min (ring-out) / 27 min (answered-no-press)**. Set (in source, undeployed)
  `ALARM_ESCALATION_TIMEOUT_MS = 45 min` (~27 × 1.5, err high).
- **§12/§13 FR-026a contradiction: RESOLVED** — it WAS run and PASSED (CHK029a). §13's "wasn't run" was a
  stale line, now corrected.
- **Flag coexistence: CONFIRMED legit** — `_alarmFlowActive` (broad "a flow owns the screen": countdown +
  escalation + terminals + bridge; drives OKAY + orb visibility) vs `_summonCountdownActive` (narrow
  countdown-only duplicate guard). The orb guard correctly uses `_alarmFlowActive` (orb hidden across the
  whole flow), not the countdown flag. No rework.

**THE PARKED DECISION (owner's domain insight, telecare):** distressed users press the button **repeatedly**,
even after connecting with a contact. The current guard **silently absorbs** presses while
`escalation_state==='active'` — so if the terminal/outcome FCM is **lost** (stuck active), every repeated
press is swallowed → **the person is locked out of help for the full 45-min backstop.** For a help button
that's a safety failure. **Invariant to adopt:** *a help press must never be met with silence, nor be
un-actionable due to a stale state.* "Never stack" (SC-003) was meant to stop duplicate *parallel*
escalations — not to ignore the person.

**Proposed direction (design next session, run past captain):** a press during active/stuck (1) **re-shows
"Calling your contacts"** (reassurance, no 2nd escalation) and (2) offers a **"Call again / Start over"**
recovery affordance → immediate user-driven recovery, not a 45-min wait. The self-heal timer becomes a pure
last-ditch backstop. **The 45-min value and the self-heal are subordinate to this redesign — decide the
absorb behaviour FIRST.**

**State at park:** feature 005 is otherwise built + on-device-verified (Phase 1+2, works-while-closed FSI,
staleness, FR-026a, escalation self-heal). Device runs the last deployed build (self-heal still 20 min — can
fire slightly early vs the 27-min worst case; 45-min edit is in source, undeployed). Temporary dev panel
still in `www/app.js`. PRE-1 mockup commit still owner-side. Phase 3 (pairing flow) not started.
