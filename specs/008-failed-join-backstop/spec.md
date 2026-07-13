# Feature Specification: Failed-join backstop

**Feature Branch**: `008-failed-join-backstop`

**Created**: 2026-07-13

**Status**: Settled — both clarification markers resolved by the 2026-07-13 clarify ruling (§5
self-reconnect → narrow-to-blip; contact-announcement promptness ceiling → 3 seconds; one shared
boundary governs both). Ready for `/speckit.plan`. This feature is the **gate** for the late-join
convergence ("008 proper"): it is specified and proven first, separately, and the convergence does not
proceed until this backstop is signed. *Numbering note (owner-ruled 2026-07-13): this spec takes the sequential `008` slot; the
late-join convergence itself will be specified as `009` when its turn comes. Vault documents written
before this date use "008" to mean the convergence.*

**Input**: User description: "Build the failed-join backstop: define what happens when a person's
connection is lost during a live bridged call with one of their contacts, so that a dropped connection
is handled honestly and no one is left stranded, confused, or misinformed."

> **Note on feature identity**: this repository tracks features via `.specify/feature.json`, not
> per-feature git branches — every feature (001–007) lives on `main`. `008-failed-join-backstop` is the
> spec-kit feature identity, not a git branch.

---

## Scope Frame *(carried context — read first)*

**The governing reality.** Connection loss is not an edge case — it is a normal, expected condition.
Home broadband drops. Mobile signal dies. Whole lines go down for hours, days, or weeks. A safety
service used by people living independently must treat "the connection just failed" as an ordinary
event it meets gracefully, not a rare fault it engineers elaborate recovery against. The design
principle throughout: **the simplest honest behaviour beats any clever recovery**, because clever
recovery is precisely what fails when there is nothing left to recover to.

**The core scenario.** A person has summoned their contacts. A contact has answered and is now in a
live, hands-free conversation with the person — the contact hearing the room, able to judge the
situation and act. Mid-call, the person's connection is lost: their side of the call simply drops. The
person may be fine (a passing signal blip), or may genuinely need help (and the drop is incidental to
their emergency), or the line may be gone for an extended period. The system cannot know which. What it
must do is ensure both parties are left in an honest, actionable position rather than in silence.

**The defining asymmetry.** When the person's connection drops, the party still connected is the
contact — a capable, clear-headed adult who already accepted this call because the person may need
help. The contact is not confused about whether something might be wrong (they already know it might
be); they are only at risk of being confused about **what just happened to the call**. The backstop's
job is to remove that specific confusion, nothing more. The contact is already the capable party
present — the system does not need to become a rescuer; it needs to stop leaving the capable party
guessing.

**Reference behaviour to respect (the established model).** In the traditional monitored model, when a
call drops the monitoring operator actively re-establishes contact — rings the unit back, rings the
person's own phone, or hands the situation off to the person's nominated contact. The recovery is owned
by a human who decides which channel to try. This system has deliberately no operator. Its equivalent
of "the operator hands off to the contact" is **not something to build** — the contact is already
present in the call. The hand-off the monitored model reaches toward on a drop has, in this
architecture, **already happened before the drop occurred**. This spec therefore does not reconstruct
an operator's channel-switching recovery; it ensures the already-present contact — the endpoint the
operator would otherwise be phoning — is simply **informed** rather than stranded, so they can fulfil
the role the model already handed them.

---

## §5 — Self-reconnect: RULED — narrow-to-blip *(captain ruling, clarified 2026-07-13)*

**Disposition.** The person's existing single self-reconnect is **retained, but narrowed to a
momentary-blip healer only**, bounded to the same 3-second window that governs the contact
announcement (see The 3-Second Boundary, below).

- It is **not "keep" as-is**: the current unqualified reconnect is what strands the contact and shows
  the person a dishonest exhausted card — that behaviour is a defect and does not survive this
  feature.
- It is **not a clean "remove"**: a sub-second signal flicker that heals before anyone has been told
  anything is a genuine case where silent self-heal is better than announcing a "drop" that did not
  functionally occur. That one case is worth keeping.
- Therefore: the self-reconnect may attempt to bring the person back **only within the 3-second
  window**. If the person's connection is restored inside that window, the call continues and nothing
  is announced to anyone — the blip healed, correctly invisibly.
- The instant the 3-second window elapses without restoration, **the drop is declared real**: the
  self-reconnect is abandoned (it must not keep running), the honest announcement to the contact
  fires, and the person is shown the truthful drop state with their plain way back.

**Structural non-contradiction.** The rule "a reconnect that contradicts the announcement is a defect"
is now structural, not aspirational: because the reconnect is dead the moment the window closes and
the announcement lives only after the window closes, it is impossible for a reconnect to be quietly
pulling the person back into a room the contact has already been told is lost. **The two cannot
coexist in time by construction.**

### The 3-Second Boundary *(one number, not two — the coupling is the point)*

The 3-second window is a **single boundary serving both rulings**:

- **Inside 0–3 s**: the narrowed self-reconnect owns the moment. A restored connection here = blip
  healed, call continues, no announcement, no one told anything.
- **At 3 s with no restoration**: the boundary flips **once**. Reconnect abandoned; drop declared
  real; contact announcement fires; person shown the truthful drop state.

There is no second timer and no gap between the two behaviours — the reconnect's death and the
announcement's birth are **the same boundary event**. The ceiling is long enough that a genuine
momentary blip heals silently within it and the contact never hears a false alarm; short enough that a
contact sitting in sudden silence is told what happened before the silence has time to turn to worry
or prompt them to hang up and lose the thread (owner's field-experience judgement: a worried contact
on a live call about someone they care for should not be left guessing longer than this).

*How the 3 seconds is measured, how detection is wired, and how the boundary event is fired are
plan-stage mechanism — deliberately not specified here.*

---

## Clarifications

### Session 2026-07-13

- Q: §5 — should the system itself attempt to re-establish the person's connection (keep /
  narrow-to-blip / remove)? → A: **NARROW-TO-BLIP** (captain ruling). The single self-reconnect is
  retained but bounded to the 3-second window; abandoned the instant the window elapses; the contact
  announcement lives only after the same boundary, so reconnect and announcement cannot coexist in
  time by construction. The current unqualified reconnect (which strands the contact and shows the
  person a dishonest exhausted card) does not survive.
- Q: Contact-announcement promptness ceiling? → A: **3 SECONDS** from the person's leg dropping to the
  contact being told (owner ruling — long enough for a genuine blip to heal silently, short enough
  that a worried contact is never left guessing).
- Coupling (why one number, not two): the 3-second window is a single boundary serving both rulings —
  reconnect strictly inside it, announcement strictly after it, one boundary event, no second timer,
  no gap. Mechanism (measurement, detection wiring, boundary-event firing) is deliberately left to
  `/speckit.plan`.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The contact is told, and released (Priority: P1)

A contact is in a live, hands-free conversation with the person when the person's side of the call
drops. The contact promptly hears a plain statement that the connection to the person has been lost —
so they can decide their own next action (phone the person directly, go to them) with accurate
information rather than sitting in a silent call wondering if it froze, if the person hung up, or if
something is wrong. Their call then ends cleanly. They are never held in an open, dead room.

**Why this priority**: This is the backstop's entire reason to exist. The contact is the capable party
already engaged; leaving them in unexplained silence is the single failure this feature removes. Every
other behaviour is secondary to "the contact is informed, then released."

**Independent Test**: Can be fully tested by establishing a live bridged call and killing the person's
connection for real (not simulated), then observing what the contact hears and that their call ends —
delivers the core value on its own even if nothing else ships.

**Acceptance Scenarios**:

1. **Given** a live bridged call between the person and a contact, **When** the person's connection is
   lost mid-conversation, **Then** the contact hears a plain, prompt statement that the connection to
   the person has dropped, and **Then** the contact's call ends cleanly.
2. **Given** the drop announcement has played to the contact, **When** the announcement completes,
   **Then** the contact's line is closed deliberately — it is never left open, silent, and running.
3. **Given** a live bridged call, **When** the **contact** ends the call normally (hangs up), **Then**
   the drop announcement does NOT play and the existing resolved ending applies unchanged — a normal
   hang-up is never misreported as a lost connection.

---

### User Story 2 - The person is told the truth, and shown the way back (Priority: P2)

The person's connection returns after a drop (or was only briefly interrupted). What the person sees
and hears reflects what actually happened: the conversation with their contact took place and the
connection was then lost. They are never told "no one could be reached" or any equivalent failure
message. Whatever they encounter on a drop leaves the ball clearly in their court: a person who is okay
does nothing; a person who still needs help knows exactly what to do — re-summon, by the same plain
means they used the first time. No dependence on the system having silently kept something alive in the
background.

**Why this priority**: Honesty of state is absolute, and the way back must be plain — but this story
serves the person who is present and able to act, whereas Story 1 serves the moment of drop itself.
The current live behaviour violates this story today (a connected-then-dropped call is reported as if
no one could be reached); this feature is that defect's correct fix.

**Independent Test**: Can be tested by dropping the person's connection mid-call, restoring it, and
verifying what the person's surface shows: no failure language borrowed from the "nobody was reached"
ending, and an evident, ordinary route to re-summon that works.

**Acceptance Scenarios**:

1. **Given** a live bridged call that drops on the person's side, **When** the person's surface next
   renders the outcome, **Then** it must not state or imply that no contact could be reached, and must
   not reuse any language from the exhausted-cycle ending.
2. **Given** a person whose connection has returned and who still needs help, **When** they act on what
   their surface tells them, **Then** a single, ordinary re-summon starts a fresh attempt — with no
   requirement that any prior call state survived the drop.
3. **Given** a person whose connection has returned and who is fine, **When** they read what their
   surface tells them, **Then** doing nothing is a safe and clearly acceptable choice — nothing shown
   demands action or alarms a well person.

---

### User Story 3 - Nothing is ever left hanging (Priority: P3)

The person's connection is lost and never comes back — the line is gone for hours or longer, the
person's device may be dead, and no honest re-establishment happens within the feature's defined
behaviour. Every open call is still brought to a clean, deliberate close, and every reachable party
still gets a defined, honest ending. The failure of a connection never itself becomes a silent failure
of the service.

**Why this priority**: This is the degradation floor under the governing reality (total, extended
loss). Stories 1 and 2 define the good behaviour; this story guarantees the behaviour still terminates
honestly when there is nothing left to recover to.

**Independent Test**: Can be tested by dropping the person's connection and leaving it down
indefinitely (device off, extended wait), then verifying no call remains open beyond the feature's
defined close, and that whatever party is reachable received a defined ending rather than silence.

**Acceptance Scenarios**:

1. **Given** the person's connection is lost and not honestly re-established within the feature's
   defined behaviour, **When** the backstop resolves, **Then** the live call the contact is on is
   brought to a clean, deliberate close — never left open, silent, and indefinitely running.
2. **Given** a total, extended loss (the person's side is simply gone), **When** every path of this
   feature runs to completion, **Then** each reachable party has received a defined, honest ending, and
   no state is left implying the attempt is still live.

---

### Edge Cases

- **Both sides gone**: the contact hangs up (or their line drops) while the person's side is already
  dropped — the backstop must still resolve cleanly with no announcement target remaining, and the
  person's eventual surface must still be truthful (the conversation happened).
- **Momentary blip**: an interruption that heals inside the 3-second window must not trigger the
  contact announcement — the call continues and no one is told anything. The announcement and a
  successful reconnect can never both occur for the same drop (structural, per the 3-Second Boundary).
- **Drop during the announcement**: the contact's line drops while the drop statement is playing — the
  close must still complete; no retry loop against a dead line.
- **Repeat drop after re-summon**: the person re-summons, a contact joins, and the connection drops
  again — the backstop must behave identically on every occurrence (no degraded second run).
- **Boundary of "established"**: the drop happens after a contact has accepted but before the
  conversation is genuinely joined — this feature governs loss during an *established live
  conversation*; the reaching phase is existing behaviour (see Out of Scope). The boundary moment must
  be defined precisely enough at plan stage that no drop falls between the two definitions.
- **Indistinguishable causes**: the person's device dying, their app being killed, and their network
  failing may be indistinguishable from the other end — the backstop must not depend on knowing which
  happened.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST detect that the person's side has left an established live bridged call,
  and MUST distinguish this from the contact ending the call normally. A normal contact hang-up MUST
  never produce the dropped-connection behaviour, and a person-side drop MUST never produce the normal
  resolved ending.
- **FR-002**: When the person's connection is lost during an established live conversation and is not
  restored within the 3-second window, the contact MUST be told that the connection to the person has
  dropped — **no later than 3 seconds after the person's leg dropped** (the promptness ceiling, owner-
  ruled 2026-07-13). The moment is explicit: what the contact hears is a defined, owner-approved line;
  the contact is never left in unexplained silence. The same 3-second window is the blip-heal window
  (FR-007) — one boundary governs both, so a false alarm on a healed blip is impossible by
  construction.
- **FR-003**: After the contact is told, the contact's call MUST end cleanly and deliberately — the
  contact is never held in an open, dead room, and is never asked to hold or wait.
- **FR-004**: The person MUST never be told something untrue about the attempt. A connection that
  dropped after a real conversation MUST never be reported to the person as "no one could be reached"
  or any equivalent failure message. The person's drop experience MUST be distinct from, and MUST never
  borrow the language of, the exhausted-cycle ending (the separate case where the whole attempt
  genuinely reached no one).
- **FR-005**: The person, if still present and in need, MUST have a plain way back: an ordinary
  re-summon by the same means they used originally. The way back MUST NOT depend on the system having
  silently kept anything alive in the background. Whatever the person hears or sees on a drop MUST
  leave the ball clearly in their court — a person who is okay can safely do nothing; a person who
  still needs help knows exactly what to do.
- **FR-006**: The system MUST NOT promise recovery it cannot guarantee. No behaviour may tell either
  party the system is "reconnecting" them or ask them to "please hold" unless that recovery work is
  real, bounded, and reliable. When in doubt, the system tells the truth and hands control to the
  people.
- **FR-007**: The self-reconnect is RULED narrow-to-blip (§5, clarified 2026-07-13): it MUST attempt
  to restore the person only within the 3-second window, MUST be abandoned the instant the window
  elapses without restoration (it must not keep running), and the contact announcement MUST live only
  after that same boundary — the reconnect's death and the announcement's birth are one boundary
  event, so the two can never coexist in time. The current unqualified single-rejoin behaviour does
  not survive: it is replaced by this bounded form as part of this feature. A restored connection
  inside the window MUST be invisible — the call continues and nothing is announced to anyone.
- **FR-008**: A dropped-and-abandoned connection MUST never leave a live call hanging open. When the
  person's connection is lost and is not (or cannot be) honestly re-established within this feature's
  defined behaviour, the live call MUST be brought to a clean, deliberate close — never left open,
  silent, and indefinitely running.
- **FR-009**: The behaviour MUST degrade safely under total loss. When the connection is simply gone
  for an extended period, every path MUST still resolve to a defined, honest ending for whoever is
  reachable. The failure of a connection MUST never itself become a silent failure of the service.
- **FR-010**: All spoken and shown copy for this feature — what the contact hears on a drop, and what
  the person hears/sees on a drop — MUST be owner-approved before implementation (emotional-register
  decisions), MUST follow the constitution's vocabulary rules (plain, warm, brief, true; nothing may
  imply guaranteed help, a monitored/manned response, or recovery work the system is not reliably
  performing), and MUST NOT reuse exhausted-cycle language.

### Key States *(no data entities — this feature defines moments and endings)*

- **Established live conversation**: the person and a contact genuinely joined and talking — the state
  this feature guards. Its precise start boundary is defined at plan stage (see Edge Cases).
- **Person-side drop**: the person's leg leaves the established conversation involuntarily — the
  triggering moment. Distinct by definition from the contact ending the call.
- **Contact's honest release**: the defined moment where the contact is told and their call is closed —
  the P1 deliverable.
- **Person's honest ending**: the truthful state the person encounters on return — never the
  exhausted-cycle ending; always carries the plain way back.
- **The 3-second boundary**: the single boundary event at which — absent restoration — the
  self-reconnect dies and the drop is declared real, triggering the contact's honest release and the
  person's honest ending. One timer, one flip, no overlap (ruled 2026-07-13).
- **Clean close**: the deliberate termination guaranteeing no call is left open under any path.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In staged real connection-loss tests (genuine loss on a physical device — not a harness
  simulation), the contact hears the drop statement on 100% of real drops (drops not healed inside the
  window), no later than 3 seconds after the person's leg dropped.
- **SC-002**: In the same tests, the contact's call is closed within a short, defined interval after
  the statement completes; across the whole test matrix, zero calls remain open beyond the feature's
  defined close.
- **SC-003**: Zero occurrences, across all drop tests, of the person being shown or told
  exhausted-cycle language (or any "no one could be reached" equivalent) after a call that connected.
- **SC-004**: Zero false drop announcements across the normal-ending test matrix: a contact hanging up
  normally never triggers the dropped-connection behaviour.
- **SC-005**: Under total-loss tests (person's device off / line gone, extended duration), every path
  resolves to its defined ending for every reachable party, with no silent open state remaining.
- **SC-006**: Tests demonstrate the structural non-overlap of the ruled §5 disposition: a blip healed
  inside the 3-second window produces no announcement and no visible state change to either party, and
  the announcement and a successful reconnect never both occur for the same drop — including at the
  boundary itself.

## Assumptions

- The contact who answered is a capable adult who accepted the call knowing the person may need help;
  informing them plainly is sufficient — the system does not escalate further on their behalf within
  this feature.
- The person's "way back" is the existing summon surface they already used (button or app press); this
  feature adds no new summon mechanism.
- Loss before any contact has joined remains governed by existing reaching-phase behaviour; this
  feature begins where an established live conversation exists.
- The mechanism by which the system detects a person-side drop is a plan-stage concern; this spec
  assumes such detection can be made reliable, and the feature's gate includes proving it on a real
  on-device connection loss before build.
- There is deliberately no operator anywhere in this architecture; no requirement herein may be
  satisfied by assuming one.

## Out of Scope

- **The late-join convergence itself** ("008 proper" — the bridge adopting the Signal audio system,
  the person joining the conference after the contact accepts). This backstop is its gate, specified
  and proven first, separately.
- **Any change to the exhausted-cycle terminal** (how the whole attempt behaves when it genuinely
  reaches no contact at all) — except the strict requirement that the drop case be clearly distinct
  from it and never reuse its language.
- **Connection loss before any contact has joined** — that is ordinary "still trying to reach someone"
  behaviour, already handled. This feature is specifically about loss during an established live
  conversation.
- **The person's audio experience and hands-free readiness during the reaching phase**
  (speakerphone/volume at activation) — related, tracked separately; not this feature.
