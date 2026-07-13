# Quickstart — the Detection Spike (008 gate runbook)

**Purpose**: convert research.md's DOC claims to WIRE on a real on-device connection loss. This spike
is the standing gate for ALL late-join work: findings go to the captain (Checkpoint B) and the owner
signs before any `[BUILD]` task runs. **The spike uses throwaway wiring on the test member only — no
live-path behaviour changes ship from the spike itself.**

**Cast**: the Pixel (person, test record `recHAIFdUyiYC5rZ5`, mode = Speakerphone), one real contact
phone (owner's), the webhook (restart owner-run, per standing practice).

## Stage 0 — throwaway wiring (the only code the spike needs)

1. Shared-builder skeleton OR a spike-scoped copy of the two `<Conference>` mints with
   `statusCallback="/bridge/conference-events"`, `statusCallbackEvent="join leave"`,
   `participantLabel` (`member` / `contact-{i}`).
2. A logging-only `POST /bridge/conference-events` handler: fast 200, print every field Twilio sends
   (event, FriendlyName, ParticipantLabel, CallSid, timestamps). **No timer, no redirect, no state
   mutation** — observation first.
3. `py_compile` clean; owner restarts the webhook.

## Stage 1 — event inventory on a normal call (baseline traffic)

Run one ordinary bridge (summon → contact press-1 → talk → **contact hangs up**).

- ☐ `participant-join` events observed for both legs, labels present and correct? *(R2 DOC → WIRE)*
- ☐ On contact hangup: what exactly arrives (leave(contact)? leave(member) as the conference
  collapses? order? timing?) — this is the SC-004 distinguishability evidence: the handler must be
  able to ignore this entire shape.
- ☐ Confirm the creating leg's registration carried the callback (member joins first) and that the
  contact-leg mint didn't need to be honoured. *(R1 DOC → WIRE)*

## Stage 2 — THE measurement: real radio loss mid-call

Live bridge, contact connected and talking → **airplane-mode the Pixel mid-sentence** (real radio
death — not app kill, not hangup).

- ☐ Does `participant-leave` (label=member) arrive at all? **This is the go/no-go.**
- ☐ **Latency**: wall-clock from airplane-mode toggle to the leave event hitting the handler. Run ×3,
  record each. This number eats the 3 s budget (research R3 note) — if it is large (> ~1 s), STOP and
  take the finding to the captain before any build.
- ☐ What does the contact experience during that latency (silence texture)? — context for the owner's
  copy register.
- ☐ Repeat once with **wifi-kill instead of airplane mode** (router off — the home-broadband reality)
  if feasible: same event? same latency class?

## Stage 3 — blip-heal plumbing (window cancellation)

Radio loss as Stage 2, then **restore within ~2 s** and let the app's existing single rejoin run.

- ☐ Does the rejoin produce `participant-join(member)` on the SAME conference (anchor still holding)?
  *(R3 cancellation signal exists)*
- ☐ Interval between leave and join on the wire — is a 3 s window physically enough for the current
  rejoin path to land? (If connectOutbound cold-start makes sub-3 s rejoin impossible in practice, the
  blip window only ever heals *transport* blips Twilio itself rides out — a finding for the captain,
  not a defect.)

## Stage 4 — paper close (no build yet)

- ☐ Findings note to the vault (naming convention `cc_findings_008_spike_…`), tagged WIRE per claim,
  with the latency table and the Stage-1 hangup shape.
- ☐ Checkpoint B: captain review → owner sign-off recorded as a Decision note.
- ☐ Only then: `/speckit.tasks` (build tasks assume the signed spike numbers).

## What is deliberately NOT in the spike

- No 3 s timer, no redirect, no announcement, no app change, no copy — observation only.
- No harness simulation substitutes for Stage 2 (the whole point is real-radio behaviour).
- The full test matrix (SC-001…SC-006, repeat-drop, both-sides-gone, total-loss soak) is BUILD-phase
  verification, specified in tasks.md — not the spike.
