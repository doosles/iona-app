# FORENSIC — 006 Signal-audio, tonight's two test runs (2026-07-11)

**Requested by captain: timeline + three answers, NO fix.** Sources: `howsu/webhook.log` (server) + `adb logcat`
(device `[SignalAudio]`). Five run tokens minted this evening; the first three (`515cbd95`, `b1510216`, `0979f16`)
+ the bridge block are **my harness runs** (all `[SUPPRESSED]`, `passed=17/12`). The two REAL device runs:

## Run tokens (real device runs)
| Test | run_token | started | outcome |
|------|-----------|---------|---------|
| **Test 1** | `d12ceb25bd5c…c2c8e094` | 19:52–19:53 | **ACKNOWLEDGED** (Margaret pressed 1) ~19:56:54 |
| **Test 2** | `f65a63a9493…a7033e47` | ~19:57:33 | **ACKNOWLEDGED** (Margaret pressed 1) ~19:59:54 |

## Server timeline — TEST 1 (`d12ceb25`)
- 19:52 — `escalation_started` PWA push sent (ALARM-CLASS) — **carries NO run_token** (see Finding F1)
- **Sweep 1 c0** 19:53:27 → Margaret +441753350869 (SID `CAc116…f574`): initiated→ringing→**no-answer**
- **Sweep 1 c1** 19:54:29 → John +447812178361 (SID `CA2234…b0ba`): initiated→ringing→in-progress→**completed AnsweredBy=machine_start (voicemail)**
- Sweep 1 complete → 10s gap → Sweep 2
- **Sweep 2 c0** 19:56:28 → Margaret +441753350869 (SID `CA7e80…b22f`): initiated→ringing→in-progress →
  IVR gather **Digit 1** → `Escalation acknowledged flag set (token d12ceb25)` → **`escalation_complete (acknowledged)` push sent, contact='Margaret'** (msg id ts ≈ **19:56:54**)
- completed callback (AnsweredBy unknown) → `already acknowledged — stopping` → `outcome FCM already fired … skipping duplicate`
- `[LIVENESS] … -> live=False (app: summon)` — **test 1 fully retired.** No exhausted terminal, no operator alert for test 1.

## Server timeline — TEST 1 → TEST 2 boundary (the "operator alert" at log line 368)
- After test 1's ack + liveness False: **`/pwa-respond` — response: alert** → Ian pressed I NEED HELP AGAIN → new EventLog `recyonAJbmvIXaZKs`
- `Found 1 operator(s) for trigger: Alert on Negative Keyword` → **`Alerting Operator01: Charlie Brown`** (SMS 19:57:33) — this is **test 2's operator notification**, not a test-1 terminal
- `[ESCALATION] Starting … trigger: user_alert` → **`Instance run token: f65a63a9…`** (test 2)

## Server timeline — TEST 2 (`f65a63a9`)
- ~19:57:33 — `escalation_started` PWA push sent (ALARM-CLASS, no run_token)
- **Sweep 1 c0** 19:57:37 → Margaret +441753350869 (SID `CA7f01…ec46`): ringing→**no-answer**
- **Sweep 1 c1** 19:58:39 → John **+447388162337** (SID `CAd609…2066`): ringing→**busy** *(note: a DIFFERENT number than test 1's John +447812178361 — the contact record was changed between runs)*
- Sweep 2 c0 19:59:27 → Margaret (SID `CA9ee0…9572`): ringing→in-progress → **Digit 1** → `acknowledged (token f65a63a9)` → `escalation_complete (acknowledged)` sent (ts ≈ 19:59:54) → completed → `already acknowledged — stopping`

## Device timeline — `[SignalAudio]` (logcat buffer only retained 19:59:15+; test-1 + test-2-start audio scrolled off)
Every test-2 signal the device processed was **DISCARDED**, against a state left over from test 1:
```
19:59:15  advance/ended   seq=101 run=f65a63a9  → DISCARD terminal-absorbed   (current run=—  seq=101 phase=terminal terminal=true)
19:59:29  advance/dialing seq=200 run=f65a63a9  → DISCARD terminal-absorbed   (current run=—  phase=terminal terminal=true)
19:59:42  advance/ended   seq=200 run=f65a63a9  → DISCARD terminal-absorbed
19:59:56  advance/ended   seq=200 run=f65a63a9  → DISCARD terminal-absorbed
19:59:59  escalation_complete tap (outcome=acknowledged, run=f65a63a9, Margaret)   ← card path (see Q2)
20:00:02  cache updated — v1.7, 2 contacts
```
Raw FCM data confirms the advances carried correct identity (`attempt_seq:"101"/"200"`, `run_token:"f65a63a9…"`). The
device **received** them fine — it **discarded** them because its audio state never left test 1's terminal.

---

## THE THREE ANSWERS

### Q1 — Was test 1 still in flight when test 2 started; did its exhausted terminal fire during test 2's sweep 1?
**Server: NO overlap, and no exhausted terminal ever fired for test 1.** Test 1 resolved cleanly as *acknowledged* at
~19:56:54, retired liveness, and its trailing completed callback hit `already acknowledged — stopping`. The two
escalations ran strictly sequentially; the only operator alert (Charlie Brown) belongs to **test 2's** trigger.

**Device: YES, in effect — but not a re-fire.** The device's AUDIO state machine was still sitting in **test 1's
absorbing terminal** (`terminal=true`, `run=—`) when test 2's sweep-1 signals arrived, so it swallowed all of them as
`terminal-absorbed`. This is not test 1 re-firing a terminal during test 2 — it is **test 2 failing to reset the
machine** (see F1/F2). So the audio was dead for the entirety of test 2.

### Q2 — Does the terminal CARD path (`handleEscalationComplete`) validate run_token like the audio reducer?
**NO.** `handleEscalationComplete(data)` (app.js:1637–1650) gates **only** on the local preference
`escalation_state === 'active'`; it never reads `data.run_token`. So **any** `escalation_complete` push draws the card
whenever escalation_state is 'active' — a stale/superseded run's complete would clobber a live run's card. The audio
reducer (`_saApply`) validates run_token (stale-run discard) **and** enforces an absorbing terminal; the card path does
**neither**. The two paths are out of step: R-006-11 hardened the audio, the card was left on the old gate.

### Q3 — In test 1, was contact 2's dial placed, to which number, what did Twilio return?
**YES.** Contact 2 = **John Duncan**, dialled **19:54:29** to **+447812178361**, SID
**`CA2234f626a071280ad5d6bced7639b0ba`**. Twilio returned: initiated → ringing → in-progress → **completed,
AnsweredBy = machine_start** — i.e. it connected to **voicemail** (machine), not a no-answer.

---

## Two structural findings behind Q1 (evidence, not fixes)
- **F1 — `escalation_started` carries NO run_token.** `escalation_manager.py:434–440` sends it via `send_pwa_contact`
  with no token. So on the device `signalAudioStarted` always resets with `runToken=null` — the audio machine's
  identity is never stamped, and its stale-run guard is inert (it can't tell two runs apart). This is why the terminal
  state reads `run=—`. It contradicts the plan's B2 assumption ("started: reset → {runToken}").
- **F2 — the device terminal persisted from test 1 into test 2.** Proven by the discard lines (`terminal=true`
  absorbing test 2's `seq=101/200`). The reset that R-006-11 relies on (a `started` clearing `terminal`) **did not
  land** for test 2. The *why* is not fully provable from the retained buffer (test 2's `started` at ~19:57:33 had
  already scrolled off): the leading candidate is the ALARM-CLASS `escalation_started` being handled by the native
  full-screen path (Bug A) rather than the JS `pushNotificationReceived → signalAudioStarted`, so the reducer never
  saw the reset — while the plain-data `escalation_advance` pushes DID reach the JS listener (and got absorbed). This
  needs a live repro with logcat captured from the moment of the second I-NEED-HELP to confirm.

## Footnote
- `webhook.log:~307` — a `BrokenPipeError` in `_handle_signal_audio_clips` (device closed the `/signal-audio/clips`
  GET early). Harmless to the run; the cache still updated to v1.7 (device log 20:00:02).
