# 009 — Facts for /speckit.plan and /speckit.clarify *(NOT part of the spec — settled context so nothing is re-litigated or lost)*

Recorded 2026-07-14 at specify time, from the owner-prepared kickoff brief. The spec deliberately
contains no mechanism; this file is where the mechanism-bearing settled facts live until plan.

## The ratified architecture (12 Jul owner ruling — the spec implements it, not reopens it)

One audio machine (006 state machine + cached Polly clips + escalation signals) narrates every
escalation at Signal quality; the hands-free bridge = that same system plus a VoIP conference join
at contact-accept, masked by the local "Connecting with [Name]" announce (~3s natural window); the
server sequences contact entry — hold the contact's redirect until the member's join is confirmed,
then bring them in; 8kHz is reserved for the live human conversation only.

Vault: `03 Decisions/2026-07-12 Audio target architecture — convergence, 007-008 split.md`.

## The load-bearing new mechanism (from 008-I0, verified live)

The server today receives ZERO participant-level events — no conference statusCallback exists on
any live leg, and the member TwiML app's status callback is None. "Hold the contact until the
member has joined" therefore requires new wiring: conference statusCallback with participant
events (or equivalent) on the flagship path. **This is the single riskiest addition and should be
spiked/proven first in plan.** Related durable fact: passive Twilio events CANNOT detect a dead
radio (~28–63s latency, wire-proven 13 Jul — vault `03 Decisions/2026-07-13 Twilio passive events
dont detect radio death.md`) — the join confirmation must key off a positive join event, never off
absence-of-events.

## Baseline facts 009 inherits (008-I0, all code/run-confirmed)

- Contact leg is the conference anchor (`endConferenceOnExit=true`); contact hangup = full
  teardown. Member leg is endOnExit=false at both connect sites.
- Under late-join the member joins an already-anchored room — `startConferenceOnEnter` semantics,
  the empty-room rejoin edge (008-I0 risk 2), and who counts as "present" all need re-deciding for
  the new order of arrival.
- Terminal has 4+ fire sites unified only by an in-memory one-shot; conference TwiML is minted at
  two sites; `connectOutbound` has three app call sites duplicating literals. A conference-
  semantics change must touch ALL of them or drift. **Plan should name each.**
- `everConnected` + the 10-min cap arm on one FCM (`bridge_contact_joined`) sent at press-1 time,
  BEFORE the real join — under late-join this ordering changes materially; re-derive both from the
  new join-confirmed signal, not the old push.
- All bridge state is webhook process-memory (accepted single-worker cost) — the new hold-then-
  admit sequencing inherits the restart hole; keep it inside the same accepted boundary, do not
  silently widen it.
- FR-014 (one reconnect then continue the list) ruled STALE on record (R-008-4) — replace or
  delete within this design; do not leave it live to collide.
- R-008-5's truthful dropped card ships before 009 and must survive it.

Source: `02 CC Briefs/cc_findings_008I0_bridge_baseline_2026-07-13.md` — every forward risk named
there is this feature's design homework.

## Signal system facts (007, closed 13 Jul)

Attempt-anchored narration; AMD moment L4 + L17 post-AMD hold (repeatable at cadence); L9
sweep-aware masking + per-tick outcomeSpoken guard; atomic clips (no mid-play cuts by
construction); connectHold (an outcome-less ring-stop IS a connect — that gap never speaks L9);
per-row (attempt_seq, rank) chip ordering; settle-at-terminal freeze. The bridge adopts ALL of this
by consuming the same signals — **009 should add join-phase states to the reducer, not fork it.**
Deck v1.10 is the copy authority; new lines needed (at minimum: contact-side bridge line,
contact-side failed-join line, member-side dropped line, member-side join announce if it differs
from the existing connect line) go to the deck FIRST — copy gate before build, owner rules
emotional register.

## Dropped-card audio (R-008.1-2, folded in from 008.1)

At drop time both existing terminal speak mechanisms are dead by construction (no call leg, no
network) and Speakerphone members are today EXCLUDED from the per-contact clip cache
(`refreshSignalAudioCache` skips confirmed hands-free members) — only the 7 static bundled clips
exist for them. 009 opens that cache to hands-free members by construction; the dropped-line clip
is +1 clip in the per-contact set (pipeline supports named clips natively — 10 Polly clips per
contact, base64 in Preferences, text-keyed server cache). Whether the SPOKEN line carries the name
(the card copy does) is an owner ruling at the deck stage. The clip must play fully offline — zero
fetch at play time is the bar.

Source: `cc_findings_008_1_dropped_card_audio_repress_parity_2026-07-14.md`.

## Story 4 facts (008-I0 §B)

Speaker routing at member-VoIP connect already exists, two layers (AudioManager + Telecom pin with
drift re-pin). Volume is set NOWHERE in app JS or native. The escalation path has no route/volume
management at all; Signal clips play via WebView Audio at element volume 1.0 — device media volume
governs loudness. Story 4 = (a) media-stream volume to max + speaker routing for local clips at
activation, (b) call-stream volume to max at VoIP connect, (c) restore policy at episode end
(owner ruling — flag for clarify). Severable by construction.

## Failed-join-at-accept window — ✅ ALL FIVE RULED 2026-07-14 (R-009 clarify rulings)

Applied to spec.md (Clarifications, Session 2026-07-14); vaulted as `03 Decisions/2026-07-14 R-009
clarify rulings — window, pre-brief line, reuse, halt, story 4.md`. Standing directive: MAXIMUM
REUSE. Summary:

1. Window = **8s from press-1, provisional** — confirmed/moved on the plan spike's wire-measured
   join latency, not re-debated. One boundary fires both terminals (member card + graceful contact
   close, no second line).
2. Contact failed-join copy **DISSOLVED into the pre-briefed bridge line** (spoken at press-1;
   covers failed join AND later drop; no separate failed-join line exists).
3. Member failed-join screen = **reuse the 008 dropped-card shell**, speaks locally via the 009
   per-contact clip set. Working copy: "[Name] answered and knows you need help — tap below to
   call them."
4. **HALT, no continuation** after a failed join (no re-dial — 008-I1 double-activation collision
   ruled out; press-1 halt stands).
5. Story 4: **restore prior volume at episode end; ships INSIDE 009**, severable, cut only if the
   build runs long.

Plan note: the join-confirmation spike (participant-event wiring on the flagship path) is the
first thing plan proves, and it doubles as the evidence for ruling 1's number.

## Explicitly OUT of 009 (owner-confirmed at kickoff, 14 Jul)

- Sweep-position narration / "calling 1 of 2, 2 of 2" — separate micro-item with the parked N-of-M
  mockups.
- Sweep counter UI, contacts-changed nudge, sweep-pause duration — parked queue.
- Member cancel of an in-flight escalation — Feature 010.
- Unattended escalation bridge — separate feature, own forks.
- Zombie-leg server-side duration cap — candidate follow-on (008-I0 A4).

## Process gates binding this arc

- Permutation matrix at specify (done — in spec.md, Parts A–C).
- 002's FRs are binding context and were READ at specify (14 Jul), not summarised from memory.
- 009 is the riskiest change on the board and is NEVER bundled with any other feature.
- Mockups before any UI code. Never-silent invariant. On-device (Pixel 4a, real PSTN contact legs)
  is the only verification bar; persisted SignalAudio trace (`signal_audio_trace`) is the capture
  mechanism of record; push to origin gated on on-device green.
- BUILD GATE: 008 CLOSED (on-device drop-run passed ×2, 14 Jul). The git accumulation (R-008-5 +
  ~55 working-tree files, features 002–008) is its OWN dedicated session (R-008.1-1) — strong
  recommendation it lands BEFORE 009's build phase begins.
