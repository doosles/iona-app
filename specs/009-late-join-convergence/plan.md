# Implementation Plan: Late-Join Audio Convergence

**Branch**: `009-late-join-convergence` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

**Input**: Settled feature spec ([spec.md](./spec.md), five clarify flags + R-009-6 ONE PATH ruled
2026-07-14) + the facts file ([FACTS_FOR_PLAN_CLARIFY_2026-07-14.md](./FACTS_FOR_PLAN_CLARIFY_2026-07-14.md))
+ the captain's spike constraints (14 Jul "Captain go" — binding, reproduced in research.md R0).

> **Feature identity**: tracked via `.specify/feature.json` (no per-feature git branch; all features
> live on `main`). "Branch" above is the spec-kit identity.

> **Build gates standing**: the git accumulation session (R-008.1-1) lands BEFORE any `[BUILD]` task
> runs; the join-confirmation spike verdict + captain ruling land before the live path is touched;
> the deck extension (N1/N2/N4/N5) is a parallel track that gates build, not plan.

## Summary

A hands-free summon today puts the person inside a phone call for the whole reaching phase,
listening to 8kHz hold audio, while the standard path has the full Signal narration. 009 deletes
the waiting room: the person's device runs the SAME reaching phase as the standard path (same
reducer, same clips, same chips — R-009-6 ONE PATH), and the phone line exists only from the
moment a contact presses 1. The join is masked inside the connect announcement; the contact's
press-1 line becomes the pre-briefed bridge line; a join that fails its 8-second window (provisional)
fires one boundary — member failed-join card (008 shell, spoken locally) + graceful contact close,
engine halted.

**Technical spine — hold-then-admit, keyed on a positive join event.** The order of arrival flips:
today the member sits in the conference first and the accepting contact joins an occupied room;
under 009 the room is EMPTY until press-1. The choreography becomes: contact presses 1 → contact
hears the pre-brief line and is HELD (not yet in the room) → the server triggers the member's
device to place its call leg → the server observes the member's **participant-join event arrive**
(positive-event-only — never timeout inference, never absence-of-events) → the contact is admitted
into the room → live conversation. **The load-bearing asset already exists**: the 008 Stage-0
observation wiring is still live on both legs — `<Conference statusCallback>` → `POST
/bridge/conference-events` with `participantLabel="member"` (webhook `:2656`) and
`participantLabel="contact-{i}"` (`:4047`), handler at `:3026` (logging-only, fast-200,
ms-stamped). The spike promotes this from observation to authority — proven on the service-test
conference namespace FIRST, never the live path, with the live path adopting the mechanism only
after the spike verdict and a captain ruling.

**What the spike proves and measures.** (1) The hold primitive end-to-end once: press-1 → held
contact → member VoIP join → join event observed at the server → contact admitted → live
conversation. (2) The real number for Flag 1: press-1 → member-connect-start → participant-join
arrival, ms-stamped, multiple runs, on BOTH wifi and cellular — the distribution confirms or moves
the provisional 8s, not re-debated. (3) Delivery-path honesty: the events traverse the ngrok
tunnel — arrival reliability and tunnel latency/loss are logged and reported plainly (a material
risk verdict interacts with the parked VPS cutover — captain decision, not spike scope).

**ONE PATH mechanics (R-009-6).** The app's reaching phase becomes mode-blind: the Signal reducer
(006/007) runs both modes; the `refreshSignalAudioCache` hands-free exclusion (`app.js:3686` via
`_saIsSignal():3613`) is DELETED — one cache pipeline, which is also what makes the failed-join
and dropped cards offline-speakable (R-008.1-2, +N4/N5 clips in the per-contact set). Mode gates
exactly one thing: arming the join layer at contact-accept. The member-side phone-leg audio
machinery this feature orphans is DELETED, not kept alongside: the wait-audio hold loop, the
press-1 named-connect flags, and the member-participant exhausted announce (deletion inventory in
research.md R7).

## Technical Context

**Language/Version**: Python 3 (howsu backend — `reply_to_airtable_webhook.py` v2.14+,
`ThreadingHTTPServer`, single worker); JavaScript ES2017+ (`iona-app/www/app.js` — Signal reducer,
join layer, cards); Java (`TwilioVoicePlugin.java` — Story 4 volume + existing speaker routing;
otherwise expected minimal).

**Primary Dependencies**: Twilio Voice — `<Conference>` participant events (statusCallback wiring
already live from the 008 spike, promotion to authority is THE spike subject), Calls-API redirect
(the existing admit/close primitive), VoIP client leg via `TwilioVoice.connectOutbound` (three
existing call sites); FCM data pushes via `pwa_sender.send_bridge_data_push` (data-only + high —
the proven backgrounded shape); `escalation_copy.py` (deck) for N1/N2/N4/N5; the 006/007 clip
pipeline (server text-keyed Polly cache → base64 Preferences) for the two new member clips.
Credentials from `config.py` only.

**Storage**: No Airtable schema change expected. Any new EventLog vocabulary is free-text
`singleLineText` via the code-side `VALID_*` guard (established recipe); see data-model.md. All
hold/sequencing state is webhook **process memory** — the accepted single-worker boundary (master
ref v5.28) is NOT widened; if the design ever wants persistence, that is flagged, not built.

**Testing**: `/escalation-test` harness (direct 19/19 · bridge 12/12 baseline must stay green;
new checks for hold-then-admit under dispatch suppression); `sa_sim.js` (39/39 baseline) extended
with join-phase reducer states; `py_compile` + `node --check` gates; **on-device Pixel with real
PSTN contact legs is the only verification bar**; persisted `signal_audio_trace` is the capture
mechanism of record.

**Target Platform**: Android (Capacitor app on the Pixel) + howsu backend (webhook behind ngrok).

**Project Type**: Two-repo feature (the 004/006/007/008 pattern) — spec-kit artifacts + app surface
in iona-app; backend surface in the howsu tree, recorded in the master reference changelog +
`/howsu-align` at close.

**Performance Goals**: Join masked inside the connect announcement's natural breath on success
(SC-003); failed-join boundary at 8s provisional (SC-004 — spike evidence confirms or moves);
zero waiting-room seconds (SC-001); reaching narration identical to standard path (SC-002).

**Constraints**: Positive-event-only join confirmation (captain constraint 2 — the 13 Jul durable
fact: passive events cannot see a dead radio; silence proves nothing). Window timer is
server-side, one boundary, both terminals from one fire (FR-006 — never WebView `setTimeout` for
safety timing, Constitution IV). Service-test namespace first (constraint 1). Restart boundary
unchanged (constraint 6). MAXIMUM REUSE (FR-017) + ONE PATH (FR-018) govern every design choice.

**Scale/Scope**: Pre-launch, single test device. Touches: webhook (conference-events promotion,
hold-then-admit at the press-1 confirm site, 8s boundary driver, deletion inventory),
`escalation_copy.py` (deck lines), `pwa_sender.py` (join-trigger/confirmed/failed pushes),
`app.js` (join layer arming, reducer join states, two card copy-variants, cache exclusion
deletion, Story 4 volume), `TwilioVoicePlugin.java` (Story 4 volume; join leg reuses existing
connect machinery).

## Constitution Check

*GATE: passes. Re-check after Phase 1 design: no change.*

- **I.3 Promise the attempt, never the outcome** — PASS. The pre-brief line promises nothing
  ("they've requested your help" is fact, not promise); the failed-join card states what is true
  and hands the member the way. No "reconnecting you", no "please hold" anywhere.
- **I.4 Reactive path fails loudly, never silently** — PASS. The failed-join boundary fires two
  honest terminals from one event; the contact's informed state is established at press-1 (the
  close is a cue, not silence); detection failure degrades to the existing watchdog floor while
  the spike exists precisely to prove the event arrives.
- **II Vocabulary** — PASS with GATE-COPY. Four lines (N1 if needed, N2, N4, N5) to the deck
  before build; working copy owner-ruled in substance; no banned words; exhausted language
  firewalled from the failed-join and dropped cards.
- **III Build discipline** — PASS. Mockup gate satisfied by ruling (R-009-3: copy-variant of the
  existing dropped-card shell — no new mockup surface); copy deck signed before audio work;
  surgical webhook edits only; scope walls: engine untouched, standard path untouched, no
  operator, 010/unattended-bridge/N-of-M excluded.
- **IV Technical guardrails** — PASS. Server-side boundary timer; positive-event-only; credentials
  from `config.py`; free-text EventLog guard values; `py_compile`/`node --check`; two-repo
  commits in their own trees; no global find/replace; no full-file webhook regeneration.

## Project Structure

### Documentation (this feature)

```text
specs/009-late-join-convergence/
├── spec.md                                  # Settled (5 flags + R-009-6, 2026-07-14)
├── FACTS_FOR_PLAN_CLARIFY_2026-07-14.md     # Settled context + ruled clarify outcomes
├── plan.md                                  # This file
├── research.md                              # Phase 0 — R0 spike constraints + decisions R1–R9
├── data-model.md                            # Phase 1 — join-phase states, signals, vocabulary
├── quickstart.md                            # Phase 1 — spike runbook (service-test first) + pin run
├── contracts/
│   ├── join-confirmed-authority.md          # /bridge/conference-events: observation → authority
│   ├── hold-then-admit-contact-leg.md       # press-1 TwiML: pre-brief + hold + admit/close
│   └── join-phase-pushes.md                 # join-trigger / join-confirmed / failed-join FCM
└── tasks.md                                 # Phase 2 (/speckit.tasks — NOT created by plan)
```

### Source Code (repository root)

```text
# Backend — howsu workspace (~/.openclaw/workspace/howsu/)
reply_to_airtable_webhook.py    # Conference-events handler :3026 — promote logging-only → join
                                #   authority (svc-test namespace first); press-1 confirm site
                                #   :3958/:4051 — pre-brief + hold-then-admit; 8s boundary driver;
                                #   member-side deletions (wait-audio :4077, press-1 name flags,
                                #   member-participant exhausted announce in :3600) — see R7.
                                # Conference mint sites (must stay in lockstep): member :2663,
                                #   contact :4056, svc-test :2635. Terminal one-shot sites:
                                #   _bridge_watchdog_terminal :3103, _handle_bridge_speak_to_
                                #   conference :3600, _bridge_server_terminal :5470.
escalation_copy.py              # Deck bump: N2 pre-brief, N5 failed-join, N4 dropped, N1 if ruled
pwa_sender.py                   # Join-phase data pushes (reuse send_bridge_data_push shape)
skills/event_logger/scripts/event_logger.py   # VALID_* additions if data-model rows confirmed
log_narrator.py                 # MATRIX rows for failed-join terminal (0-gaps gate as always)

# App — iona-app (this repo)
www/app.js                      # Reaching phase goes mode-blind (ONE PATH): join layer armed by
                                #   mode at accept only; reducer join states (data-model.md);
                                #   connectOutbound sites :2694 (live — becomes join-triggered),
                                #   :2771 (FR-014 reconnect — DELETE, R7), :5556 (service test —
                                #   spike reuses); refreshSignalAudioCache exclusion :3686/:3613
                                #   DELETED; failed-join + dropped cards = copy-variants of the
                                #   008 shell, spoken via per-contact clips; Story 4 volume calls.
android/.../TwilioVoicePlugin.java   # Story 4: media/call stream volume max + restore; speaker
                                #   routing exists (:299 setCommunicationDevice) — reuse.
```

**Structure Decision**: Two-repo feature per the established pattern. Backend lands in the howsu
tree with master-reference changelog + `/howsu-align` at close; app + spec-kit artifacts here.

## Phase 0 — the spike (research.md + quickstart.md)

Phase 0 is the gate. research.md R0 reproduces the captain's six binding constraints verbatim;
R1–R9 pin the design decisions (join authority, hold-then-admit choreography, boundary ownership,
anchor/order-of-arrival semantics, push re-derivation, ONE PATH mechanics, deletion inventory,
delivery-path honesty, Story 4). quickstart.md is the on-device runbook: service-test-namespace
event proof → latency matrix (wifi + cellular) → ONE full hold-then-admit choreography run (the
pass bar) → the R-008.1-3 pin run folded into the same device days. **Spike findings return to the
captain before the live path is touched and before `/speckit.tasks` generates any `[BUILD]` task.**
Anything the spike surfaces that the constraints don't cover: flagged, not resolved.

## Phase 1 — design artifacts

data-model.md (join-phase reducer states, server hold state, push vocabulary, EventLog/narrator
rows — each value marked spike-verified vs doc-asserted) + contracts/ (the three interfaces
above). Written against the decided mechanism so a spike surprise updates one authority.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Order-of-arrival flip (member joins an empty room; contact held outside it) | The one-audio-system ruling requires the member NOT to be in a call during reaching; someone must still anchor teardown (FR-007: contact ends the call) | Keeping the member in the room "muted with local audio on top" preserves the waiting-room call (violates FR-002) and the two-audio-system drift 009 exists to delete |
| A server hold state keyed by conference (in-memory) | The contact must be admitted only on the positive member-join event; something must correlate press-1 → join event → admit/close within 8s | Client-side sequencing puts safety timing in the WebView (Constitution IV) and on the device whose network is the thing in doubt |
| Deleting (not narrowing) the FR-014 auto-reconnect | R-008-4 ruled it stale; ONE PATH terminals + the spoken dropped card + halt ruling leave no honest place for a silent auto-rejoin into a possibly-dead room | Narrowed reconnect (008's §5 shape) was designed for the waiting-room era's room semantics; under late-join the room dies with the contact anchor — flagged as a captain checkpoint in R7, not silently decided |
