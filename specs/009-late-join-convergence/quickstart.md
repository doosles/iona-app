# 009 Quickstart — join-confirmation spike runbook (the gate)

The spike verdict + captain ruling gate the live path. Service-test namespace FIRST (R0.1).
On-device, real PSTN contact legs, ms-stamped server logs; `signal_audio_trace` for app-side
capture. Nothing here touches the flagship summon path.

## Stage 1 — event proof on the service-test namespace

Test-only edit: add the participant-event attrs (statusCallback → `/bridge/conference-events`,
`participantLabel="member"`) to the svc-test conference branch (webhook `:2627` block — the live
mint sites already carry the observation attrs; this stage just gives the spike a live-path-free
room). Run the existing Service Test call (app `runServiceTestCall` → `connectOutbound` into
`svc-test-…`, site `:5556`):

- **S1-A**: member VoIP leg joins the empty svc-test room → confirm `participant-join` with
  `label="member"` arrives at the handler, ms-stamped. 5+ runs.
- **S1-B**: hang up / kill the leg → confirm `participant-leave` arrival + `ReasonParticipantLeft`.
- **S1-C**: log SequenceNumber gaps, duplicate deliveries, ngrok anomalies (R8 table starts here).

Pass: events arrive for every run, labels intact. Fail: stop — captain, with the R8 table.

## Stage 2 — the latency matrix (Flag 1's evidence)

Same namespace. Measure the full trigger chain the live design will use:
`t0` press-1-equivalent (server sends join-trigger push) → `t1` app receives push →
`t2` `connectOutbound` starts → `t3` `participant-join(member)` arrives at server.

- ≥6 runs **wifi** + ≥6 runs **cellular data** (wifi off) on the Pixel.
- Record t0→t3 distribution; note worst case. The 8s window is confirmed if p-max + pre-brief
  masking comfortably clears it; otherwise the number MOVES on this evidence (no re-debate).
- App killed/backgrounded variants NOT in scope (the reaching phase keeps the app foreground by
  construction); note if observed anyway.

## Stage 3 — the hold primitive, once, end-to-end (the pass bar)

Spike-namespaced conference (not the live summon path; owner's phone as the contact, 008-spike
choreography discipline):

1. Contact leg dialled (spike harness), answers, presses 1.
2. Contact hears a stand-in pre-brief line + hold (no room entry).
3. Server sends join-trigger; member device places its leg into the room.
4. Server observes `participant-join(member)` → redirects the held contact leg into the room.
5. Live two-way conversation confirmed by ear; contact hangup tears down (anchor rule holds).

Also probe (same session if time): boundary path — hold the member leg back deliberately, let the
8s timer fire, confirm graceful contact close (redirect → Hangup, no line) + the failed-join push
arrives app-side. (Full card/copy behaviour is build scope; the spike proves the primitive.)

**Pass bar**: step 1–5 succeeds once, cleanly. Everything else is measurement.

## Stage 4 — report

Findings note to the captain (vault, `cc_findings_009_spike_join_confirmation_<date>.md`):
latency table (wifi/cellular), window verdict (8s confirmed/moved), empty-room + anchor
observations (R2 flags), anything not covered by R0 — flagged. R8 measurement caveat (one line):
numbers travelled over ngrok — outliers attributed (tunnel vs mechanism), and a window that holds
over free ngrok holds with margin on the committed VPS. **No live-path adoption, no [BUILD]
tasks, until the captain rules on this note.**

## Folded-in owner pin run (R-008.1-3 — same device days, no separate session)

One re-press from the dropped card on-device: confirm the 10s window runs (device-dial way-back).
Record in the same findings note.

## Standing reminders

- Flip `recHAIFdUyiYC5rZ5` to Speakerphone for contact-leg runs; flip back to Oran's Signal after.
- Webhook edits: surgical only, `py_compile` + `ff"` grep, unbuffered restart; svc-test branch
  changes are test-only and live TwiML stays byte-unchanged until the captain's adoption ruling.
- Suppress Python warnings in any helper scripts (owner reads them as errors).
