#!/usr/bin/env python3
"""R-006-12 D — STALE-STRAGGLER controlled proof (captain-directed synthetic injection).

WHAT THIS PROVES
  The device audio reducer's TOP RULE (run_ts total order): a late signal from an OLDER run, arriving while a
  NEWER run is live, is DISCARDED `stale-run-ts` on BOTH surfaces — the audio (reducer) AND the terminal card
  (`_saAcceptsComplete`) — with neither moving. This is tonight's bug's INVERSE (there, an old terminal wrongly
  swallowed a new run; here, an old straggler must never touch a live newer run).

HOW TO RE-RUN
  1. Foreground the Iona app on the connected Pixel (data pushes are processed by the JS push listener only when
     the app is in the foreground; backgrounded data pushes queue).
  2. From the howsu workspace:  adb logcat -c && python3 <this file> && sleep 2 && \
       adb logcat -d | grep -iE "SignalAudio|NEW RUN|stale-run-ts|CARD suppressed"
  3. EXPECT in the device log, in order:
       [SignalAudio] NEW RUN run=STRAGGL… ts=<T2> …            (run 2 established via F2 synthesis)
       [SignalAudio] DISCARD advance/dialing run=STRAGGL… ts=<T1> … reason=stale-run-ts …   (audio unmoved)
       [SignalAudio] CARD suppressed — stale complete run=STRAGGL… ts=<T1> vs current ts=<T2>  (card unmoved)

INJECTION METHOD (the whole trick)
  run_ts is stamped by the ONE builder from a per-process cache (pwa_sender._RUN_TS). We seed that cache with
  note_run_ts(token, ts) BEFORE sending, so we control each run's mint-ts precisely: RUN2 = now, RUN1 = now-60s
  (strictly older). We establish run 2 with an ADVANCE (a plain data push → F2 synthesis plays the handover) —
  NOT the alarm-class `escalation_started`, so no full-screen ring fires on the owner's device.

SAFE: sends only to the TEST record's FCM token; plays a brief handover + ring in-app; never starts a real
escalation, never dials, never writes EventLog. Tokens are prefixed STRAGGLER- so they can't collide.
"""
import sys, time
sys.path.insert(0, "/Users/Henry/.openclaw/workspace/howsu")
import pwa_sender  # noqa: E402

REC = "recHAIFdUyiYC5rZ5"                 # test record — carries the owner's Pixel FCM token
now_ms = int(time.time() * 1000)
uniq = str(now_ms)[-6:]
T2 = now_ms                              # RUN 2 — the LIVE / newer run
T1 = now_ms - 60_000                     # RUN 1 — 60s OLDER: its stragglers must lose the run_ts comparison
RUN2 = f"STRAGGLER-RUN2-{uniq}"
RUN1 = f"STRAGGLER-RUN1-{uniq}"

# Seed the run_ts cache so the builder stamps our controlled mint-ts on each run's signals.
pwa_sender.note_run_ts(RUN2, T2)
pwa_sender.note_run_ts(RUN1, T1)
print(f"[STRAGGLER] RUN2={RUN2} ts={T2} (live)   RUN1={RUN1} ts={T1} (older by 60s)")

# 1) Establish RUN 2 as the live run: a dialing advance with the newer run_ts. The reducer's top rule sees a
#    strictly-newer run and (no JS 'started' seen) synthesises the opening — handover, then this attempt.
print("[STRAGGLER] establishing RUN 2 (advance dialing seq=100)…")
pwa_sender.send_escalation_advance(REC, 0, 1, "call", "Margaret", RUN2, phase="dialing")
time.sleep(6)   # let the handover + first ring settle so run 2 is unambiguously current

# 2) INJECT the stale straggler — a RUN 1 (older run_ts) advance arriving DURING run 2.
#    EXPECT: DISCARD stale-run-ts (the ring keeps ringing run 2's contact; audio unmoved).
print("[STRAGGLER] injecting stale RUN-1 advance (older run_ts) → expect DISCARD stale-run-ts…")
pwa_sender.send_escalation_advance(REC, 1, 1, "call", "John", RUN1, phase="dialing")
time.sleep(3)

# 3) INJECT a stale RUN 1 COMPLETE — EXPECT: CARD suppressed (the card must not draw for a superseded run).
print("[STRAGGLER] injecting stale RUN-1 complete → expect CARD suppressed…")
pwa_sender.send_escalation_complete_push(REC, outcome="exhausted", run_token=RUN1)
time.sleep(3)
print("[STRAGGLER] done — read the device log for NEW RUN / stale-run-ts / CARD suppressed.")
