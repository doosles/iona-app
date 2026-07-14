# Feature Specification: Oran's Signal Escalation Audio — device-side replica of the bridge audio

**Feature Branch**: `006-signal-audio`

**Created**: 2026-07-11

**Status**: Draft — **merged scope, captain-ratified (R-006-6, 2026-07-11)**. Supersedes the earlier Option-A
split. Spec/plan/tasks redone on the merged scope; **engine-emission tasks gate on the `escalation_advance`
investigation brief** (Condition 2). Ready for `/plan` (redone alongside).

**Input**: Owner ruling — "Oran's Signal audio should be a direct replica of the handsfree (bridge) audio; the
only difference is that at the end it says a contact has been reached, instead of the contact being announced
and joining the conference." Delivered **on the member's device** (audio only; Signal stays a non-call product).

## Clarifications

### Session 2026-07-11 (merged scope — supersedes the Option-A split)

**R-006-6 — Merged scope RATIFIED.** 006 ships the **full device-side replica of the bridge audio** from
cached clips: **Iona handover → per-contact "Trying to reach [Name]" + UK ringback → between-contact handoffs
→ spoken terminal**, driven by a **new per-attempt `escalation_advance` signal**. The Option-A split
dissolves (named progress, UK ring, handoffs, and the engine per-attempt signal are all in the first ship).
**Abstract progress tones are dropped** (the three tone candidates are cancelled; the static *voice* clip
renders survive). **Signal remains a non-call product — the replica is audio only, on the member's device**
(delivery option #1; the app plays cached clips synced to the sweep — never a call placed to the member).

**Condition 1 — the ringback is CHANNEL-GATED (honesty fence, non-negotiable).** The ring is honest **only
while a contact's phone is genuinely ringing**. The Signal channel ladder sends **SMS** on later sweeps for
some contacts — a ringback over an SMS attempt would be a false claim. Therefore **`escalation_advance` MUST
carry the attempt channel (call vs SMS)**, and the app plays the ring **only on call attempts**; an **SMS
attempt gets the named line + a pause, no ring**. This is the bridge's R6 "observed-truth" rule ported to the
device.

**R-006-7 — Terminal wording superseded (replaces R-006-1 and R-006-5).** Named: **"I've reached [Name], who
knows you need help."** Generic: **"I've reached one of your contacts, who knows you need help."** (warmth over
name-first). **Character-rule amendment (recorded in the deck):** Oran may now speak in the **first person
singular** in terminal lines — a deliberate, sanctioned change to Constitution I.6's Oran voicing, noted in
`escalation_copy.py` so future copy does not oscillate. **Copy bump → deck v1.4** (Signal-only constants;
bridge outputs verified byte-unchanged as the fence). *(Already landed in the deck.)*

**Condition 2 — the engine touch gets its own investigation brief FIRST.** The `escalation_advance` emission is
on the **critical safety path** (it touches the escalation engine's in-flight dial sites). The **entry-point
rule** applies in full: a read-only brief declares, at each emission point, **what engine state is assumed and
who provides it**, → captain review → **then** the emission tasks. Spec/plan redo may proceed in parallel;
**engine tasks gate on the brief.**

**Condition 3 — carried invariants reaffirmed.** **ADD-006-1:** `escalation_advance` lands as **shared
infrastructure** (the deferred screen mirror consumes it later; screen UI stays out of scope). **ADD-006-2:**
**audio–visual coherence** stands — with named audio against today's **static** contact list, verify no
contradiction is possible (list order vs spoken name) and note any tension for the screen task. **I.4
passenger-never-driver, never-silent, offline-at-escalation-time (for the clip assets), and the missing-clip
fallback chain** all stand unchanged. **R-006-2 (announce-once + abstract tone) is superseded by the replica
loop** — the bridge's cycle/pause structure ports as the pacing model.

*(Superseded from the Option-A pass: the abstract-tone candidates; R-006-1/R-006-5 wording; R-006-2 repetition
rule; the "US4 deferred to 007" split — 007 remains only for the eventual on-screen per-contact mirror, which
consumes the same signal 006 builds.)*

## User Scenarios & Testing *(mandatory)*

This feature makes an Oran's Signal escalation **sound like the handsfree (bridge) experience, on the member's
own device** — the same reaching journey the bridge plays, replicated from **cached clips synced to the real
sweep**, with **one** difference at the end (a spoken "I've reached your person" instead of the bridge's live
conference join). Oran's Signal stays a **non-call** product: the member is never phoned; the replica is audio
on their device.

Why a replica rather than the abstract "working tone" of the earlier pass: **field research (telecare, Jul
2026)** — audio must carry **changing information**, and the **familiar UK ringback + named, per-contact
progress** are what make "help is being reached" legible and reassuring, far more than an abstract tone. And
the **accessibility requirement** (owner, first-hand): the whole journey — *and both terminals* — must be
**spoken**, so a member who cannot read the screen hears it worked, or it didn't and to press again.

Two hard fences run through every requirement:
- **Honesty (Constitution I.3 + Condition 1).** Nothing the audio plays may claim something untrue. The
  **ringback is channel-gated** — it plays **only** for an attempt that is genuinely a **call**; an **SMS**
  attempt gets the named line + a pause, never a ring. When the device can't confirm what's happening
  (lost/late signal), it degrades to a generic "still trying" bed — **never** a ring or a name it can't back.
- **Passenger, never driver (Constitution I.4).** The audio reads existing signals; it writes no escalation
  state and never blocks or delays the engine. If it breaks, the escalation runs identically. The one new
  engine emission (`escalation_advance`) is **fire-and-forget** and is gated behind its own safety brief.

---

### User Story 1 - The escalation opens in Iona's voice, then Oran narrates — as on the bridge (Priority: P1)

On escalation start the member hears Iona hand over — *"This is Iona. Your call for help has been received.
Oran is calling your contacts now."* — then Oran is the voice for everything after (one voice switch, never
back), exactly as the bridge does.

**Why this priority**: The entry to the replica; establishes the two-voice model and "never silent from the
first instant." Rides the existing `escalation_started` push.

**Independent Test**: On the Pixel, trigger a Signal escalation → hear the Iona handover, then Oran; one switch.

**Acceptance Scenarios**:
1. **Given** a Signal-method member, **When** an escalation starts, **Then** the Iona handover plays first
   (`OPENING_HANDOVER`, Amy), verbatim.
2. **Given** the handover has played, **When** reaching begins, **Then** every later line is Oran (Arthur), never
   returning to Iona.

---

### User Story 2 - Named, per-contact progress in sync with the real sweep (Priority: P1)

As the service works through the contacts, the member hears Oran name each one — *"Trying to reach
[Name]…"* — **in sync with the actual attempt**, and, when the service moves on, the between-contact
handoff — *"There's no answer from [prev] — trying [Name] now."* A new name = audible proof of real progress,
exactly like the bridge.

**Why this priority**: The field-research core and the reason for the replica. It requires the **new
`escalation_advance` signal** (the device has no per-attempt knowledge today — Condition 2 / the investigation
brief covers the engine emission).

**Independent Test**: A multi-contact escalation on the Pixel → each attempt names its contact as the sweep
reaches it; advancing is heard as a new name + handoff; a re-sweep re-announces the same contact.

**Acceptance Scenarios**:
1. **Given** the sweep dials contact N, **When** the `escalation_advance` for N arrives, **Then** the member
   hears "Trying to reach [Name of N]…" within the latency target (SC-006).
2. **Given** an advance from one contact to the next within a sweep, **When** it happens, **Then** the handoff
   line names the previous and next contact.
3. **Given** the same contact is dialled again on a later sweep, **When** that attempt fires, **Then** the
   member hears its name again (the signal is not deduped across sweeps).

---

### User Story 3 - The ringback is honest — it plays only when a contact is genuinely being CALLED (Priority: P1)

While a contact is being **called**, the member hears a genuine **UK ringback** (the familiar sound), just as
on the bridge. But when an attempt is an **SMS** (the channel ladder sends SMS on later sweeps), the member
hears the **named line + a pause — no ring**, because nothing is ringing. The audio never claims a call that
isn't happening.

**Why this priority**: The honesty fence (Condition 1, non-negotiable). A ring over an SMS attempt is a false
claim; this is the bridge's R6 observed-truth rule ported to the device, and it is the load-bearing reason
`escalation_advance` must carry the attempt channel.

**Independent Test**: On the Pixel, run a sweep that includes both call and SMS attempts (e.g. a later sweep) →
call attempts ring, SMS attempts play the named line + pause with **no** ring. Force a lost signal → **no** ring.

**Acceptance Scenarios**:
1. **Given** an attempt whose channel is **call**, **When** its `escalation_advance` arrives, **Then** the
   member hears the named line + UK ringback.
2. **Given** an attempt whose channel is **SMS**, **When** its `escalation_advance` arrives, **Then** the member
   hears the named line + a pause, and **no** ring.
3. **Given** a lost/late signal (the device can't confirm a call is ringing), **When** the gap elapses, **Then**
   the audio holds on the generic "still trying" bed — **never** a ring.

---

### User Story 4 - Both terminals spoken — "I've reached [Name]…" or method-aware exhausted (Priority: P1)

When a contact acknowledges, the member hears Oran report back: **"I've reached [Name], who knows you need
help."** (or the generic "…one of your contacts…" when no per-contact clip exists). When the list is exhausted,
the member hears the **method-aware exhausted** terminal (button / app / both-options). Either way the member —
even with the screen unread — hears the outcome and what to do next.

**Why this priority**: The accessibility core and the one deliberate difference from the bridge (an
acknowledgement report instead of the live conference join). Rides the existing `escalation_complete` push
(outcome + contact name).

**Independent Test**: Run to an acknowledgement → hear "I've reached [Name]…"; run to exhaustion (button, then
in-app; then unknown) → the matching exhausted variant. Screen unread throughout.

**Acceptance Scenarios**:
1. **Given** a contact acknowledges, **When** `escalation_complete{outcome:acknowledged, contact_name}` arrives,
   **Then** the member hears "I've reached [contact_name], who knows you need help." — reaching audio stops.
2. **Given** no per-contact acknowledged clip (first-run/missing), **When** an acknowledgement occurs, **Then**
   the **generic** "I've reached one of your contacts…" plays (never silence).
3. **Given** the list is exhausted, **When** `escalation_complete{outcome:exhausted}` arrives, **Then** the
   method-aware exhausted terminal plays (from the app's local summon source), ending in "try again".

---

### User Story 5 - It works offline for the clips, degrades honestly, and is never silent (Priority: P1)

Every **clip** plays without a fetch at escalation time (they're cached at contact-save / app-start). The
escalation *events* (which contact, which channel, the outcome) are inherently server-driven and arrive over
the network; when they're lost or late, the audio **degrades honestly** — the generic "still trying" bed, no
names it can't back, no ring it can't confirm — and it is **never silent**. A missing/stale clip at playback
falls back the same way.

**Why this priority**: Poor-signal is the design assumption (I.4 / IV). Clips must never depend on the network
at the moment they play; the narration must degrade honestly rather than promise progress it cannot see.

**Independent Test**: Airplane mode with clips pre-cached → the sequence that *can* play (handover, terminals
via cached clips) plays with zero clip-fetch; a deleted per-contact clip → generic fallback, no fetch; simulate
lost mid-sweep signal → generic bed, no wrong name, no ring, no silence.

**Acceptance Scenarios**:
1. **Given** clips are cached, **When** any clip plays, **Then** no network request is made for the clip asset.
2. **Given** a required per-contact clip is missing/stale, **When** its point is reached, **Then** the generic
   fallback (or static bed) plays — never a wrong name, never a fetch, never silence.
3. **Given** `escalation_advance`/`escalation_complete` are lost under poor signal, **When** the gap elapses,
   **Then** the audio holds on the generic bed and the existing screen/native reconcile still covers the terminal.

---

### User Story 6 - The audio is a passenger — it never blocks, delays, or drives the escalation (Priority: P1)

Nothing the audio does — including the new `escalation_advance` emission — may block, delay, or alter the
escalation. If the audio layer fails entirely, the escalation runs identically and still reaches its terminal.

**Why this priority**: The reactive-path reliability bar (I.4). The one new engine emission is the sharpest
place this could be violated, which is why it is fire-and-forget and gated behind its own safety brief.

**Independent Test**: Force the audio to fail (clips deleted; playback throwing; the emission stubbed to error)
→ the escalation runs byte-identically and still ends in a spoken terminal or the documented fallback; the
escalation harness stays green.

**Acceptance Scenarios**:
1. **Given** the audio layer is failing, **When** an escalation runs, **Then** the engine behaves identically
   (same sweep, timing, terminal) and writes are unaffected.
2. **Given** the `escalation_advance` emission errors/throws, **When** a dial happens, **Then** the sweep
   proceeds without delay (fire-and-forget), and no escalation state is written by the audio path.

---

### Edge Cases

- **Handoff names two contacts.** "There's no answer from [prev] — trying [Name] now." is per-(prev,next); the
  generation/composition strategy (pre-render pairs vs decompose into per-contact halves) is a `/plan` decision.
- **Channel per attempt** must ride `escalation_advance` (Condition 1). Where the call/SMS branch is decided,
  and whether a channel value is in scope at each dial site, is the **load-bearing** question in the engine
  investigation brief.
- **Re-sweep** — the same contact index recurs each sweep; the per-attempt signal **re-announces** (not deduped).
- **Coherence vs the static list (ADD-006-2)** — the screen shows a **static** contact list (no live highlight
  in 006). Verify the list **order** cannot contradict the audio's attempt order (spoken "David" while the list
  reads Margaret-first is the failure); note any tension for the 007 screen-mirror task.
- **Terminal before any attempt** — a first contact that acknowledges immediately fires `escalation_complete`
  right after `escalation_started`; the driver treats "terminal with no prior attempt narration" as normal.
- **First run / no cache** — the bundled static-fallback (Iona handover → generic bed → generic terminal), no
  per-contact names or ring.
- **Bridge (Speakerphone) members** — this feature plays **only** for Oran's Signal; it must not play, or
  interact with the bridge audio, for a Speakerphone member.
- **Killed/backgrounded** — out of scope (foreground/awake only; rides the existing native-FSI decision).

## Requirements *(mandatory)*

### Functional Requirements

**The replica sequence & voices**
- **FR-001**: During an Oran's Signal escalation (method = Signal), the device MUST play the bridge reaching
  sequence from cached clips — Iona handover → per-contact "Trying to reach [Name]" (+ ring per Condition 1) →
  between-contact handoffs → spoken terminal — **never silent** through the escalation.
- **FR-002**: Voices MUST match the bridge/Twilio — Iona = Amy-Neural (handover only), Oran = Arthur-Neural
  (everything else); exactly **one** voice switch (Iona→Oran), never back.
- **FR-003**: All spoken lines MUST be **byte-identical to the frozen deck** (`escalation_copy.py` v1.4). The
  pacing MUST follow the **bridge's cycle/pause model** (R-006-2's announce-once rule is superseded).

**Per-attempt signal & channel gate (Condition 1) — engine-touching, gated on the brief (Condition 2)**
- **FR-004**: A new **`escalation_advance`** signal MUST be emitted server-side at **each per-contact dial** on
  the direct-alert path, carrying at minimum **contact identity/index, sweep, and the attempt CHANNEL (call vs
  SMS)**. It MUST be **fire-and-forget** (never blocks/delays the sweep), write **no** escalation state, and
  **not** be deduped across sweeps (a re-sweep re-announces). It MUST be built as **shared infrastructure**
  (ADD-006-1) — the future screen mirror consumes the same signal; not audio-private.
- **FR-005**: The device MUST play the **UK ringback ONLY for a call attempt**; for an **SMS attempt** it MUST
  play the named line + a pause with **no ring** (Condition 1 — the honesty fence). If the channel is unknown or
  the signal is lost, it MUST NOT play a ring.
- **FR-006**: On a within-sweep advance, the device MUST play the **handoff** line naming the previous and next
  contact (`HANDOFF_TMPL`).
- **FR-007**: The `escalation_advance` emission MUST NOT ship until its **investigation brief** (Condition 2)
  has declared each emission point's assumed engine state + provider, passed captain review. *(Spec/plan may
  proceed; the emission tasks gate on the brief.)*

**Terminals (both spoken)**
- **FR-008**: On acknowledgement, the device MUST play **`ACKNOWLEDGED_TMPL`** ("I've reached [Name], who knows
  you need help.") for `escalation_complete.contact_name`; the **generic** `ACKNOWLEDGED_GENERIC` when no
  per-contact clip exists; then stop the reaching audio (terminal is final).
- **FR-009**: On exhaustion, the device MUST play the **method-aware** exhausted terminal (`exhausted_line` —
  button / app / both-options) chosen from the app's **local** summon source; unknown → both-options.
- **FR-010**: Every escalation with audio enabled MUST end in a spoken terminal **or** the documented fallback —
  never silence.

**Safety invariants (I.4)**
- **FR-011**: The audio layer (incl. the `escalation_advance` emission) MUST be a **passenger** — it MUST never
  block, delay, or alter the escalation engine; the engine runs identically whether audio plays, fails, or is absent.
- **FR-012**: The audio layer MUST write **zero** escalation state (read-only consumption; the new emission
  writes no state).
- **FR-013**: **Clip assets** MUST require **no network at escalation time** (cached at contact-save / app-start).
  The sync events (`escalation_advance`/`escalation_complete`) are inherently networked; on loss the audio
  degrades to the generic bed (no name/ring it can't back) — never silence, never a fetch.
- **FR-014**: A missing/stale clip at playback MUST fall back to the generic clip / static bed — never a wrong
  name, never a fetch.

**Coherence, scope & routing**
- **FR-015**: **Audio–visual coherence (ADD-006-2)** — the spoken names/outcomes MUST NOT contradict the
  escalation screen. In 006 the screen is a **static** contact list; the audio's attempt order MUST match the
  list order so no contradiction is possible; any residual tension is noted for the 007 screen-mirror task.
- **FR-016**: This audio MUST play **only** for Oran's Signal (method = Signal); it MUST NOT play, or interact
  with the bridge audio, for a Speakerphone member.
- **FR-017**: Scope is **foreground/awake app only**; killed-state audio is out (native-FSI decision unchanged).
- **FR-018**: Playback MUST be **at least as audible as today's foreground alarm audio** — full-volume on the
  media stream (parity with the existing in-app siren/voice). Alarm-grade routing (`USAGE_ALARM`, DND-immune) is
  a new native capability, out of 006 unless separately elected.

**Copy & cache integrity**
- **FR-019**: The device clip cache MUST be **manifest-driven** with a **`COPY_VERSION` tag** (deck v1.4); a
  wording change MUST invalidate + regenerate on reconcile — a stale-copy clip MUST never play.
- **FR-020**: Copy is the deck (`escalation_copy.py` v1.4). Acknowledged terminals are Oran first-person
  ("I've reached …", R-006-7); the character-rule amendment (Oran first-person in terminals) is recorded in the deck.

### Key Entities *(include if feature involves data)*

- **Clip**: pre-rendered audio for one spoken line, one voice. **Static/bundled** (handover; exhausted variants;
  generic no-name acknowledged; the gap/"still trying" bed line; the **UK ringback**). **Per-contact
  (generated)** (the attempt line; the handoff "no answer from [name]" component; the acknowledged line).
- **`escalation_advance` signal** *(new, shared — ADD-006-1)*: a fire-and-forget per-attempt push carrying
  contact identity/index, sweep, and **channel (call/SMS)**. Drives named narration + the channel-gated ring;
  consumed by the audio driver now and the screen mirror later; writes no state; not deduped across sweeps.
- **Manifest / `COPY_VERSION` tag**: device cache index keyed to `escalation_copy.py` v1.4; tag mismatch → regenerate.
- **Summon source**: the app's local record of how help was summoned (button / in-app / unknown) → the method-aware
  exhausted terminal.

## Success Criteria *(mandatory)*

- **SC-001**: **100%** of Signal escalations with audio enabled end in a spoken terminal or the documented
  fallback — **zero** silent endings across the on-device matrix.
- **SC-002**: **Zero** clip-asset network fetches at escalation time (airplane-mode run of the cached-playable parts).
- **SC-003**: A member relying on **audio only** correctly determines the outcome (reached vs no-one-reached,
  press again) on **every** acknowledged and exhausted run.
- **SC-004**: The ring plays on **100%** of **call** attempts and on **0%** of **SMS** attempts (and never on a
  lost/unknown-channel attempt) — the honesty fence holds (Condition 1).
- **SC-005**: Each attempt names the **correct** contact for that dial, in the correct sweep order; a re-sweep
  re-announces; **zero** name/order contradictions with the screen list (FR-015).
- **SC-006**: A contact's name is audible within **2 s of its `escalation_advance` arriving at the device**;
  transport latency (server dial → device receives the signal) is measured and reported **separately**.
- **SC-007**: With audio force-failed (clips deleted; emission stubbed to throw), the escalation runs
  **byte-identically** and the **harness stays green** — the passenger invariant holds (I.4 / FR-011).
- **SC-008**: A deck wording change regenerates the affected clips on reconcile; a stale clip **never** plays.

## Assumptions

- **Method gating exists** — Signal vs Speakerphone is resolved by feature-004 / press-time entitlement; 006
  only reads it. No gating change.
- **The deck is the copy authority (v1.4)** — handover, attempt/handoff lines, exhausted variants are the
  existing bridge constants; the Signal acknowledged terminals (v1.4, R-006-7) are the only Signal-specific copy.
- **The escalation runs server-side** — the device has **no** per-attempt knowledge today; the whole named/ring
  experience depends on the new `escalation_advance` signal (hence Condition 2's brief).
- **Summon source is locally known** — the exhausted terminal needs no server round-trip.
- **Foreground/awake only**; media-stream playback parity with today's in-app audio.

### Settled architecture — recorded for `/plan`

- **Delivery = device-side (#1).** App plays cached clips synced to the sweep via `escalation_advance`. No call
  is placed to the member.
- **Generation = AWS Polly** (deck v1.4; Amy/Arthur), creds from `config.py`. Static clips rendered once +
  bundled (**incl. the UK ringback** — reuse/bundle `/audio/uk-ring`); per-contact clips (attempt / handoff-half
  / acknowledged) generated at contact-save / app-start reconcile.
- **`escalation_advance`** — server emits at each direct-alert dial (initial fire in `escalation_manager`; each
  `_fire_one_touch`), **carrying channel**; app wires to the playback driver + (later) the screen mirror.
  **Exact emission points, assumed state, and — load-bearing — where the channel value is in scope: the
  investigation brief (Condition 2).**
- **Pacing** ports the bridge's cycle/pause structure. **No abstract tone.**

## Dependencies / Owner Actions

- **AWS Polly IAM** — LIVE (in `howsu/.env`; smoke-tested). Restart condition: the running webhook loads the AWS
  env only on its next bounce — time with the backend deploy.
- **`escalation_advance` investigation brief** (Condition 2) — CC produces it (read-only); **captain review
  gates the engine-emission tasks**.
- **Owner listening session (PRE-2)** — now auditions the **full replica sequence** (handover, named attempts +
  ring, handoffs, both terminals, both exhausted variants) — build-phase sign-off gate.

## Out of Scope

- **Bridge-path audio** — shipped (Brief A); must not be touched/duplicated (verified byte-unchanged as the fence).
- **The escalation SCREEN's live per-contact mirror** — a separate task (**consumes** the shared
  `escalation_advance` signal 006 builds); screen visuals unchanged in 006 (ADD-006-1).
- **Killed-state native playback**; **alarm-grade routing** (USAGE_ALARM/DND-immune); **econtact-side audio**.
- **Any change to escalation sweep/timing/terminal LOGIC or state** — the sole engine addition is the additive,
  fire-and-forget `escalation_advance` emission (channel-carrying), gated behind its own investigation brief.

## Verification Standard

**Harness green is necessary but never sufficient.** Accepted on **on-device (Pixel 4a)** full-**replica** runs:
- The full sequence: handover → named attempts (call → ring; SMS → named line + pause) → handoffs → **each**
  terminal (acknowledged "I've reached…"; both exhausted variants + unknown).
- Channel gate: a mixed call/SMS sweep → ring only on calls (SC-004).
- Sync + order: names match the sweep + the screen list order; re-sweep re-announces (SC-005/006).
- Offline/fallback: cached-playable parts with no fetch; missing-clip → generic; lost-signal → generic bed, no
  ring/name, no silence.
- **I.4 passenger proof:** audio force-failed → engine byte-identical + harness green (SC-007).
- **PRE-2 owner listening audition** of the full replica; **wifi-only tablet** parity run.
