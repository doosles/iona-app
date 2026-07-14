# Safety Requirements Quality Checklist: A Physical Button That Summons Help

**Purpose**: Validate the QUALITY and completeness of the safety-critical requirements on this **reactive
entry path** (Constitution I.4 — higher reliability bar; must fail loudly, never silently). Covers the two
load-bearing safety rules ("act now or not at all"; "never stack"), the always-armed/reconnect reliability,
the honest phone-tethered scope, and the copy/vocabulary floor. Requirement-quality items test the spec;
on-device gates (marked ⌾) are the "verified means on the physical Pixel + Flic" bar and are checked only
after bring-up.
**Created**: 2026-07-02
**Feature**: [spec.md](../spec.md) · [plan.md](../plan.md)
**Focus**: Reactive trigger safety · act-now-or-not-at-all · never-stack · always-armed · fail loudly ·
**service test never dispatches** · **no silent death** (reboot re-arm / OEM survival / low battery)

## A. "A press acts now, or not at all" — the stale-press guard (Safety Rule 1)

- [ ] CHK001 Is there a requirement that a **late-delivered (stale) press MUST NOT start a help sequence** — only a just-pressed press summons? [Coverage, Spec §FR-007 / US2 AC1]
- [x] CHK002 Is the staleness bounded and dropped in the right place? **Yes — bounded at 15 s, in `FlicPlugin.routePress` before any JS.** A QUEUED press FIRES if fresh (≤15 s before reconnect) and drops if older. *(On-device 2026-07-02: dropped ages read 33 s / 243 s — correctly dropped.)* [Plan §Native architecture]
- [x] CHK003 Is the age judged reliably (same clock)? **Yes — a same-clock DELTA: `Flic2Button.getReadyTimestamp() − pressTimestamp`.** *(On-device 2026-07-02: flic2lib's event timestamp is a button-relative clock — comparing it to a phone clock gave ~56 000 yr / ~4 day ages; the delta against the button's own ready time gives real seconds. Restores the ≤15 s "brief-blip still fires" allowance. The drop is LOUD — `summonDropped` → JS logs + a calm on-screen note — never a silent vanish, Constitution I.4.)* [Plan §stale guard]
- [x] ⌾ CHK004 On-device: press while **out of range** (Bluetooth off), press, wait >15 s, reconnect → **no** help sequence fired; 3 queued presses dropped, 0 `buttonSummon` leaked. **PASS 2026-07-02.** [SC-002]

## B. "A press never stacks" — duplicate absorption via the EXISTING guard (Safety Rule 2)

- [ ] CHK005 Is it stated that a press during a running sequence is **absorbed**, starts no second sequence, and **does not disturb the live one**? [Coverage, Spec §FR-008 / US2 AC2]
- [x] CHK006 Is absorption enforced across the cancel-window countdown too? **Yes — a countdown-scoped guard, not purely inherited.** *(On-device 2026-07-02: `escalation_state` only guards the **committed** phase; a 2nd press during the **countdown** re-entered `_startHelpSequence` (replayed siren, spawned a 2nd timer). Fix: **`_summonCountdownActive`** — set at countdown start, cleared on cancel/commit. Scoped to the countdown ONLY, so a terminal's "I NEED HELP" retry (escalation_state='idle', app.js:1398) is **never blocked** and the flag **can't get stuck**. Committed phase still guarded by escalation_state; a hung escalation is healed by the 20-min self-heal — see CHK012c. Hardens the in-app path too.)* [Plan §Web-layer wiring]
- [x] CHK007 Is the summon wired to the **same** `_startHelpSequence` entry as the in-app control (no new/parallel help path)? **Yes** — `buttonSummon → _startHelpSequence('physical_button')`; cancel window inherited, absorption now guard-enforced (CHK006). [Spec §FR-001/FR-002 / Plan]
- [x] ⌾ CHK008 On-device: with a sequence running, press-and-hold again (2nd + 3rd) → both **absorbed**, live sequence undisturbed, no second siren/timer. **PASS 2026-07-02** (native: 3 `buttonSummon` fired, guard absorbed 2nd/3rd). [SC-003]

## C. Always-armed & reconnect-on-launch (no silent death of the listener)

- [ ] CHK009 Is **reconnect-on-launch** a MANDATORY requirement — on app/service start, re-attach listeners to already-paired buttons (`getButtons()`→connect) at the right moment, or presses silently don't fire? [Gap, Plan §reconnect gotcha]
- [ ] CHK010 Is the **always-armed listener** requirement tied to a foreground service (persistent notification) so BLE callbacks fire while backgrounded — never a WebView timer (Constitution IV)? [Clarity, Plan §FGS]
- [ ] CHK011 Is durable pairing specified across **app restart, phone reboot, and battery change** with **no re-pairing**? [Coverage, Spec §FR-015/FR-016 / US3]
- [ ] ⌾ CHK012 On-device: pair → kill+relaunch app → reboot phone → change battery; after **each**, a press still summons with **0 re-pairings**. [SC-004]
- [ ] CHK012a Is reboot re-arm specified so the listener restarts **without the person opening the app** (a `BootReceiver` on `BOOT_COMPLETED`) — since SDK storage persists the pairing, not a running listener? [Gap, Spec §FR-030 / Plan §BootReceiver]
- [ ] CHK012b Is protection against **OEM background power management** specified (battery-optimization exemption), and is the residual case where an OEM still kills the listener **surfaced honestly** (logged no-response) rather than silent? [Gap, Spec §FR-031 / Plan §battery-opt]
- [x] CHK012c Does a **hung escalation self-heal** so it can't brick re-summon? **Yes (built 2026-07-02).** `showEscalationActiveState` sets `_alarmFlowActive`+`escalation_state='active'` with no natural end if the outcome FCM is lost — which would block re-summon. Fix: the (previously dead) `ALARM_ESCALATION_TIMEOUT_MS` (20 min) is armed; on fire it clears both flags, re-arms, and **logs** (`escalation_self_heal` — a lost-FCM symptom, not a silent tidy-up). Backstop only; timeout **must exceed the longest legitimate ladder run** (sanity-check owed). [Spec §FR-008 / Plan §Web-layer wiring]

## D. Honest scope — phone-tethered, stated not hidden

- [ ] CHK013 Is it explicit that the button reaches help **only through the phone** (on, in range, running), with **no independent-cellular** implication? [Clarity, Spec §FR-006 / Assumptions]
- [ ] CHK014 Is the phone-off / out-of-range / service-not-running boundary framed as **stated honest scope**, not a defect, and never over-promised in copy? [Consistency, Spec §Edge Cases]

## E. Fail loudly, never silently (Constitution I.4)

- [ ] CHK015 Are the drop-stale and absorb-duplicate outcomes **deterministic and visible** on the reactive path (no silent no-op that leaves the person believing help is coming)? [Clarity, Spec §FR-009]
- [ ] CHK016 Is there a requirement that the button gives **immediate local confirmation** (felt click + light) so there is never "did that work?" doubt — independent of phone state? [Coverage, Spec §FR-004 / US1 AC3]
- [ ] CHK017 Is the summon path specified to add **no new latency** and to inherit the existing cancel window unchanged? [Consistency, Plan §Performance]
- [x] ⌾ CHK017a Does a press reach help while the app is **CLOSED** (not just backgrounded)? **Yes (built + verified 2026-07-02).** The FGS keeps the process/BLE alive, but the JS help path needs the WebView — so a full-screen intent launches the app into `_startHelpSequence`, waking over the lock. **PASS on device**: closed+locked → one clean sequence. The launch summon is a **one-shot** (a retained event LOOPED — fixed). Denied-FSI floor = a sounding max-priority notification, never silent. [Spec §FR-033/FR-033a]

## F. Gesture & false-alarm resistance

- [ ] CHK018 Is the **default** summon gesture press-and-hold, justified as accident-resistant (a knock/fidget cannot trigger it)? [Coverage, Spec §FR-003 / US1 AC4]
- [ ] CHK019 If the person opts into a **short-press** summon, is it framed as their informed choice made in calm settings (trading accident-resistance for easier actuation), and is only the CHOSEN gesture forwarded as a summon (double-tap routed to the self-test, never a summon)? [Clarity, Spec §FR-005/FR-026]

## G. Copy & vocabulary safety (Constitution II / I.6)

- [ ] CHK020 Is the persistent-notification copy fixed as **"Iona is here for you."** and confirmed free of banned terms (no "watching"/"check-in"/care/welfare/alarm words) and pronoun-free (I.6)? [Completeness, Spec §FR-023/FR-024]
- [ ] CHK021 Does the pairing-flow copy stay within the banned list, present pressing for help as **fully working (never "off")**, and calmly pre-explain both the OS permission prompt and the Android "Pair & Connect" system dialog? [Coverage, Spec §FR-011/FR-024 / Plan]

## H. Removal & lifecycle safety

- [ ] CHK022 Is it specified that removing the button governs **future presses only** and MUST NOT disturb a help sequence already running? [Consistency, Spec §FR-020 / Edge Cases]
- [ ] CHK023 After removal, is it required that presses **no longer summon** and that **re-pairing works cleanly**? [Coverage, Spec §FR-018/FR-019 / US5]

## I. The service test — must never dispatch, must fail loudly (US6, safety-critical)

- [ ] CHK024 Is it explicit that a service test (double-tap / "Test service") **MUST NOT** open the cancel window, reach any contact, or start escalation — it logs and returns only? [Coverage, Spec §FR-026]
- [ ] CHK025 Is the separation load-bearing and specified at **two independent layers** — a distinct gesture (`buttonSelfTest` ≠ `buttonSummon`) **and** a distinct endpoint (`/service-test` ≠ the summon path) — so a test can never dispatch and a real summon is never downgraded to a test? [Consistency, Plan §suppression proof]
- [ ] CHK025a **Classification-level breach closed:** when summon = short-press, do **all** press gestures (incl. an SDK-classified double-click from a tremor) route to summon, with the button-based test **disabled** (test via the in-app control only)? A short-press summon MUST NEVER be stolen by a double-click → test. [Gap, Spec §FR-026a / US6 AC5 — the OQ1-B safety edge]
- [ ] CHK026 Is **both** outcomes-logging required — a **pass** and a **no-response** — so a test that heard nothing is a recorded, carer-visible fact, never silence? [Coverage, Spec §FR-028]
- [ ] CHK027 Is the new EventLog Type/Status required to be **registered before first log** (the silent-drop pitfall), with free-text fields and no Airtable schema change? [Gap, Plan §service test]
- [ ] ⌾ CHK028 On-device: double-tap → multi-channel confirmation appears **and** a passing event is logged, with **0** help sequences and **0** contacts reached. [SC-008]
- [ ] ⌾ CHK029 On-device: with the listener stopped, double-tap → honest "couldn't confirm" **and** a no-response event is logged (a stopped button never reads as working). [SC-009]
- [x] ⌾ CHK029a On-device (**short-press summoner**): **PASS 2026-07-02** — in short mode every press incl. double-taps → `buttonSummon`, ZERO `buttonSelfTest`; back to hold → double-tap = self-test. Tremor-as-double-click can't downgrade a short-press summon. [FR-026a]

## J. Low button battery — surfaced early, never silent (FR-032)

- [ ] CHK030 Is a **low button-battery heads-up** required — surfaced in the status row + a calm notification **before** the button dies, and **logged** — phrased as reassurance/action, never "failure"/alarm? [Coverage, Spec §FR-032 / SC-010]
- [ ] ⌾ CHK031 On-device: drive a low-battery state → confirm the calm heads-up + status indicator appear and the event is logged, before any loss of function. [SC-010]

## Notes

- ⌾ = on-device verification gate (physical Pixel + physical Flic). "Verified" is never build/deploy alone.
- CHK006/CHK007 are the crux: the duplicate-summon guard is **inherited** from the existing help entry —
  the plan must verify it on device, and must not introduce a second guard or a parallel summon path.
- The stale-press guard (A) and reconnect-on-launch (C) are the two places this feature could fail
  *silently*; both are mandatory and each has an on-device gate.
- **Section I is co-critical with A/B:** a service test that could dispatch is as unsafe as a stale press
  firing — the two-layer separation (gesture + endpoint) is the guard and must be verified on device.
- **The silent-death family** now has four defences with on-device gates: reconnect-on-launch (CHK004/012),
  reboot re-arm (CHK012a), OEM survival (CHK012b), and low battery (CHK030/031) — plus the **service test**
  (I) as the person-facing check that surfaces any of them that slip through.
