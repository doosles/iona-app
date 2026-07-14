# Feature Specification: Late-Join Audio Convergence

**Feature Branch**: `009-late-join-convergence`

**Created**: 2026-07-14

**Status**: Draft — awaiting `/speckit.clarify` (five flagged rulings, listed under Clarifications).
This is the riskiest change on the board and is NEVER bundled with any other feature (standing owner
ruling). Mockups before any UI code; every new spoken line goes to the deck FIRST (copy gate before
build); on-device is the only verification bar.

**Input**: User description: "One audio system, one screen, join at accept. Give the hands-free
person the same Oran they'd have had on the standard path — the same voice, the same honesty, the
same live picture of who is being reached — and only place them into a live phone conversation at
the moment a contact has actually said yes."

> **Note on feature identity**: this repository tracks features via `.specify/feature.json`, not
> per-feature git branches — every feature (001–008) lives on `main`. `009-late-join-convergence` is
> the spec-kit feature identity, not a git branch. *Numbering (owner-ruled 2026-07-13, persisted in
> `.specify/feature.json`): 009 = this convergence; vault documents written before that date calling
> it "008" are superseded. The member-cancel feature proposed 13 Jul takes 010.*

> **Build gate (14 Jul)**: Feature 008's on-device drop-run PASSED (two runs, card + way-back) —
> 008 CLOSED. The accumulated git work (R-008-5 + ~55 working-tree files, features 002–008) is ruled
> its OWN dedicated session (R-008.1-1). Spec / clarify / plan proceed now; strong recommendation
> that the git session lands BEFORE 009's build phase begins, so 009's diffs sit on a clean
> committed base.

---

## Scope Frame *(carried context — read first)*

**The problem today.** A hands-free person who presses for help is immediately put into a
phone-line waiting room: they sit inside a live call for the entire time their contacts are being
dialled, listening to phone-quality hold audio that knows nothing of what is actually happening —
no "I'm leaving Margaret a voicemail," no live screen of chips, none of the crisp, warm narration
the standard path now has. Two audio systems exist where the service has ruled there is one
(ratified target architecture, owner decision 2026-07-12). The waiting-room audio is the muffled
one, and it plays at precisely the moment a frightened person most needs the clear one.

**The convergence.** From the first moment of a hands-free summon, Oran speaks locally — the full
Signal experience delivered in 007: the reaching lines, the answerphone moment, the between-attempt
outcomes, the live Oran's Promise screen with its per-contact chips. The person is NOT in a phone
call while their contacts are being reached. Contacts are dialled exactly as today. When a contact
answers and presses 1 to accept, the person's device joins the live conversation at that moment —
and the join itself is hidden inside the "Connecting you with [Name]" announcement, so to the
person it feels like one continuous Oran experience that blossoms into their contact's voice. The
phone line is reserved for the only thing that needs a phone line: the live human conversation.

**What this feature deletes.** The phone-line waiting-room audio path ceases to exist for this
flow. It is removed, not bypassed — no dormant second audio system remains to drift. The old
"rejoin the same room" behaviour designed for the waiting-room era (002 FR-014, ruled STALE on
record — R-008-4) is replaced by whatever this design makes true, not left to collide.

**Binding context (002's FRs, read in full 14 Jul — not summarised from memory).** Feature 002's
requirements remain the constitution of the reactive path. This feature must honour, in their
current ruled form: FR-004 (contacts one at a time, person's order), FR-006 (contact press-1
acceptance with its keypress window — unchanged), FR-007 (only the contact ends the call), FR-008
(move on when a contact does not result in a live human), FR-009 (the calm terminal is the end of
the full ladder), FR-010 (the person MUST hear Oran's calm voice while contacts are reached — this
feature is FR-010's *fulfilment* at full quality, not its replacement), FR-012 (fail loudly, never
silently), FR-013 (promise the attempt only), FR-015 (already-connecting acknowledgement on a
duplicate summon), FR-016 (the device-pass way-back floor sits beneath this feature and must remain
reachable). FR-014 alone is stale and is retired/replaced within this design. R-008-5's truthful
dropped card ("You were connected to [Name], then the line dropped") ships before 009 and must
survive it — and gains a spoken form here (Story 3).

**What the contact experiences.** The contact's side changes as little as possible: same call, same
announcement, same press-1 accept. The one new moment: between their press of 1 and the person
arriving there may be a short natural pause. It must feel deliberate and brief — a spoken bridge
line ("Connecting you with [first name] now") covers it. If the person's device cannot join within
a short, defined window, the contact must be told honestly what is happening and what to do — never
left in silence wondering if anyone is there. A contact who pressed 1 because someone needs help
must never be stranded in a silent room. (Exact copy and window length are owner rulings — flagged
for clarify.)

---

## Permutation Matrix *(mandatory gate at /specify — standing process rule for any
sequenced-behaviour feature, captain-ruled 2026-07-13)*

Axes ruled for this feature: **contact position × attempt outcome × accept timing × join
success/failure × sweep**. Every cell must be honest on all three surfaces — **audio, chips, log**
(the one-signal coherence promise carries over untouched). Deck line refs (L*) per deck v1.10, the
copy authority. New lines are placeholders (N*) and go to the deck FIRST: **N1** member-side join
announce (only if it differs from the existing "Connecting you with [Name]" connect line), **N2**
contact-side bridge line, **N3** contact-side failed-join line, **N4** member-side dropped line
(spoken form of the R-008-5 card copy).

### Part A — Reaching phase (no accept yet): the 007 matrix adopted wholesale

The hands-free reaching phase consumes the SAME signals and speaks the SAME lines as the standard
path — 007's full matrix (position × outcome × sweep, including its edge rows: lost-AMD fallback
L5, mid-message call failure, outcome-after-next-start skip, L9 sweep-aware masking, per-tick
outcomeSpoken guard, atomic clips, settle-at-terminal freeze) applies **verbatim, with one delta in
every cell**: the person's acoustic location is their own device at full Signal quality — never a
phone line, never hold audio. No cell of Part A introduces new copy or new narration behaviour.

| Position \ Outcome | no_answer | voicemail | declined (press-9) | sms_sent | accepted (press-1) | missing/lost |
|---|---|---|---|---|---|---|
| **First of ≥2** | L1 → L8 → L2(next) | L1 → **L4** → L2(next) | L1 → L7 → L2(next) | *(n/a — SMS is final-sweep-last only)* | → **Part B** | L1 → L9 gap → L2(next) |
| **Middle** | L2 → L8 → L2(next) | L2 → **L4** → L2(next) | L2 → L7 → L2(next) | *(n/a)* | → **Part B** | L2 → L9 → L2(next) |
| **Last of sweep, another follows** | L2 → L8 → **L3** | L2 → **L4** → L3 | L2 → L7 → L3 | *(n/a)* | → **Part B** | L2 → L9 → L3 |
| **Last of FINAL sweep** | L2 → L8 → exhausted (local) | L2 → **L4** → exhausted | L2 → L7 → exhausted | L2 → L6 → exhausted | → **Part B** | L2 → L9 → exhausted |
| **ONLY contact (final sweep)** | L1 → L8 → exhausted | L1 → **L4** → exhausted | L1 → L7 → exhausted | L1 → L6 → exhausted | → **Part B** | L1 → L9 → exhausted |

The **exhausted terminal** in every Part-A cell is spoken locally — same words as today's honest
terminal, better voice — with the existing retry card shown. At no point on a no-accept run was the
person inside a phone call. The standard path's acknowledged terminal (L10 "We've reached [name]")
is unchanged on the standard path; on the hands-free path, acceptance opens Part B instead.

### Part B — Accept-and-join phase (the new cells)

On the hands-free path, a contact's press-1 replaces the L10 terminal with the join sequence. Join
behaviour is invariant across position and sweep **except** after a failed join, where "contacts
remaining vs none remaining" splits the cell (both sub-cells flagged for clarify).

| Accept timing \ Join outcome | **Join confirmed within announce window** | **Join NOT confirmed within window (failed join)** | **Joined, then dropped mid-conversation** |
|---|---|---|---|
| **Normal accept** (any position, either sweep, reaching lines played) | Member: join announce (N1 or existing connect line) → contact's voice inside its natural breath — no perceptible seam. Contact: N2 bridge line → the person. Chips: accepted contact settles ✓; screen → live-conversation state. Log: honest accept + connect rows. | Member: screen tells the truth (008 dropped-card honesty precedent; exact behaviour = clarify). Contact: N3 honest line at the window — never silence. Chips/log: honest, no false "connected". Engine continues to next contact or ends = **clarify** (interacts with the call-anchor teardown — design carefully). | R-008-5 truthful card renders AND its line (N4) is SPOKEN locally with the device fully offline (clips on-device — zero fetch at play time). Way-back (re-summon → device-pass floor) intact. Contact side: 008's ruled behaviour, unchanged. |
| **Fast-ack** (accept on first ring — reaching line may still be playing; incl. single-contact member) | Same as above at maximum speed: atomic clips guarantee no mid-line cut; the 007 settled-screen freeze holds; join is clean even at maximum speed. | Same as above — window and honesty identical at speed. | Same as above. |
| **Accept while a previous attempt's outcome line is playing** | Outcome line completes at its atomic boundary, then the join sequence — never two lines fighting; chips already honest per-row. | As normal-accept failed join. | As above. |
| **Accept at the exhaustion boundary** (last contact accepts as the terminal would fire) | Exactly ONE of {join sequence, exhausted terminal} fires — an accepted contact is never told "no one could help", and a person never hears exhausted-then-a-voice. Accept wins if the join sequence has begun; otherwise terminal truth stands. | Failed join on the last contact with none remaining — the "none remaining" sub-cell of the clarify ruling; whichever way ruled, both legs get honest endings. | As above. |

### Part C — Edge rows (all must hold)

- **Contact hangs up between press-1 and the person's arrival** → the room the person was joining
  no longer exists. Both parties get honest, defined outcomes; the person is never joined into an
  empty room and never told they were connected. (The waiting-room era's "rejoin the same room"
  semantics are dead — what "present" means under the new order of arrival is re-decided at plan.)
- **The person's device is unreachable at accept time** (radio died during the reaching phase) →
  indistinguishable from a slow join at the moment of accept; the failed-join window governs. Join
  confirmation MUST key off a positive "the person is here" event, never off absence-of-events.
- **Duplicate summon mid-episode** → 002 FR-015 unchanged: visible already-connecting state, no
  duplicate attempt, Oran's ongoing local narration IS the audible acknowledgement.
- **Story 4 — media volume at zero at activation** → Oran is loud from the first word; the live
  conversation is loud on speaker; nothing about the join changes the loudness; nothing is restored
  until the episode ends.
- **Standard-path member presses for help** → bit-for-bit identical to before this feature.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One Oran from press to voice (Priority: P1)

A hands-free person presses for help (any trigger their plan gives them). Oran begins speaking
immediately, locally, at full Signal quality. The Oran's Promise screen is live throughout — each
contact's chip moves through its honest states exactly as on the standard path. Between attempts
they hear the true outcomes — voicemail left, text sent, no answer — in the exact copy the deck
already rules. They are not in a phone call. When a contact accepts, they hear "Connecting you with
[Name]" and, within that announcement's natural breath, they are live with their contact —
hands-free, on speaker, no tap needed, no perceptible seam between Oran's voice and the
conversation beginning. If no contact accepts, they hear the honest exhausted terminal from Oran
locally — same words, better voice — and see the existing retry card.

**Why this priority**: This is the feature — the ratified one-audio-system architecture made real.
The waiting room is deleted and the person gets the same honesty the standard path already has, at
the moment they most need it.

**Independent Test**: On-device hands-free runs: (a) contact 1 voicemails, contact 2 accepts —
person hears reaching lines, the answerphone moment, the voicemail outcome, then the connect
announcement and is live with contact 2, seamlessly, chips matching throughout; (b) all contacts
exhaust across both sweeps — every true outcome and the honest local exhausted terminal, retry card
shown, never inside a call.

**Acceptance Scenarios**:

1. **Given** a hands-free person presses for help, **When** the reaching phase runs, **Then** Oran
   narrates locally at Signal quality from the first moment, the person is in no live call, and
   audio, chips, and log tell one story in every cell of Part A.
2. **Given** contact 1 goes to answerphone and contact 2 accepts, **When** the episode runs,
   **Then** the person hears the reaching lines, the answerphone moment, the true voicemail
   outcome, then the connect announcement, and is live with contact 2 within its natural breath.
3. **Given** no contact accepts across both sweeps, **When** the attempt exhausts, **Then** the
   person hears every true outcome and the honest exhausted terminal locally and sees the retry
   card — at no point having sat in a phone call.
4. **Given** a single-contact member whose contact accepts on the first ring (fast-ack), **When**
   the join runs at maximum speed, **Then** the join is clean, no spoken line is cut mid-play, and
   the settled-screen freeze holds.

---

### User Story 2 - The contact is never stranded at the join (Priority: P2)

A contact presses 1 because someone needs help. Between their press and the person arriving there
is a short natural pause covered by a spoken bridge line, so it feels deliberate and brief. If the
person's device cannot join within the short, defined window, the contact is told honestly what is
happening and what to do — never left in a silent room. The person's own screen tells the truth
about the failed join.

**Why this priority**: The join-at-accept is the riskiest new moment this feature creates. The
never-silent invariant must hold on BOTH legs at that moment, or the convergence has traded the
person's waiting room for the contact's.

**Independent Test**: Staged failed-join runs (person's device prevented from joining): the contact
hears the bridge line, then the honest failed-join line within the ruled window; the person's
screen shows the ruled truthful state; no leg experiences silence.

**Acceptance Scenarios**:

1. **Given** a contact presses 1 and the person's device joins within the window, **When** the join
   completes, **Then** the contact heard the bridge line and then the person, with no perceptible
   dead air.
2. **Given** a contact presses 1 and the person's device CANNOT join within the window, **When**
   the window elapses, **Then** the contact hears the honest line about what is happening, the
   person's screen tells the truth, and the never-silent invariant holds on both legs.
3. **Given** the accepting contact hangs up before the person arrives, **When** the join would
   complete, **Then** the person is never placed into an empty room and both parties receive
   honest, defined endings.

---

### User Story 3 - The dropped call speaks, even fully offline (Priority: P3)

Mid-conversation the person's connection drops. The truthful "You were connected to [Name], then
the line dropped" card (008's fix) still renders — and now also SPEAKS its line, locally, with the
device fully offline, because this feature puts the voice clips on-device. The way-back still
works.

**Why this priority**: R-008.1-2 folded in — at drop time every existing spoken mechanism is dead
by construction, so only an on-device clip can keep the never-silent promise. It rides the same
cache this feature opens to hands-free members; small, but it completes 008's honesty.

**Independent Test**: Live bridged call, radio killed; the card renders AND its line plays with the
device fully offline — zero fetch at play time; a re-press still reaches the device-dial floor.

**Acceptance Scenarios**:

1. **Given** a connected-then-dropped call with the device fully offline, **When** the drop is
   declared, **Then** the truthful card renders and its line is spoken from on-device audio with no
   network fetch, and the way-back works.

---

### User Story 4 - Loud from the first word (Priority: P3 — severable)

A person who presses for help may have dropped the phone, be across the room, or be on the floor.
From the moment of activation, Oran's voice plays through the loudspeaker at full volume — not at
whatever the media volume happened to be after last night's radio. When the live conversation
begins, it is also on speaker at proper volume. Nothing is restored until the episode ends; a
person mid-crisis never wants it quieter.

**Why this priority**: Severable by construction (owner-ruled) — may ship inside 009 or be cut to
its own micro-feature without touching the rest. The join design never depends on it.

**Independent Test**: Set media volume to zero, activate: Oran is loud from the first word; the
conversation is loud on speaker; the join changed nothing about loudness.

**Acceptance Scenarios**:

1. **Given** media volume at zero, **When** a hands-free person activates help, **Then** Oran's
   voice is at full loudspeaker volume from the first word, the live conversation is loud on
   speaker, and no volume is restored until the episode ends.

---

### Edge Cases

- **Accept at the exhaustion boundary**: the last contact accepts at the same moment the exhausted
  terminal would fire — exactly one of the two fires; an accepted contact is never told nobody
  could help, and the person never hears "no one could be reached" followed by a live voice.
- **Accept while an outcome line is playing**: the line completes at its atomic boundary before the
  join sequence — no mid-play cuts (007 construction), no overlapping speech.
- **Person's device already offline at accept**: presents as a failed join; governed by the window;
  join confirmation keys off a positive join event only.
- **Contact hangs up between press-1 and the person's arrival**: no empty-room join; honest endings
  both sides; "who counts as present" under the new order of arrival is settled at plan.
- **Failed join, contacts remaining vs none remaining**: whichever continuation is ruled at
  clarify, every leg in both sub-cases gets an honest, defined ending.
- **Repeat episode**: a re-summon after any outcome (failed join, drop, exhaustion) behaves
  identically to a first summon — no degraded second run.
- **Duplicate summon mid-episode**: FR-015 behaviour unchanged; local narration is the audible
  already-connecting acknowledgement.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: From the moment of a hands-free summon, the person's reaching-phase experience MUST
  be delivered by the same single audio system, the same live screen, and the same ruled copy as
  the standard path — same signals consumed, same lines spoken, at full Signal quality, locally.
  Nothing spoken during the reaching phase is new copy; deck v1.10 is the copy authority.
- **FR-002**: The person MUST NOT be inside any live phone call while their contacts are being
  reached. The phone line is reserved for the live human conversation only.
- **FR-003**: The phone-line waiting-room audio path MUST be removed, not bypassed — no dormant
  second audio system may remain. 002's FR-014 (one reconnect then continue the list), ruled STALE
  on record (R-008-4), MUST be replaced or deleted within this design — never left live to collide.
- **FR-004**: When a contact accepts, the person's device MUST join the live conversation at that
  moment, and the join MUST be masked inside the connect announcement's natural breath — on a
  successful join the person perceives no seam and no dead air between Oran's voice and the
  contact's.
- **FR-005**: The contact's experience MUST change as little as possible: same call, same
  announcement, same press-1 accept (002 FR-006 unchanged). Between press-1 and the person's
  arrival the contact MUST hear a spoken bridge line so the pause feels deliberate and brief.
- **FR-006**: If the person's device does not join within a short, defined window after the
  contact's accept, the contact MUST be told honestly what is happening and what to do — never left
  in silence. Window length and line copy are owner rulings [NEEDS CLARIFICATION: window length —
  008's 3s promptness ceiling was ruled in a now-superseded context and must be re-ruled here;
  contact failed-join copy — emotional register, owner's].
- **FR-007**: During and after the person's own failed join, the person's surface MUST tell the
  truth (the 008 dropped-card pattern is the honesty precedent) [NEEDS CLARIFICATION: exact member
  screen behaviour on failed join].
- **FR-008**: Whether the attempt continues to the next contact after a failed join — and what the
  accepting contact is told if it does — is an owner ruling [NEEDS CLARIFICATION: interacts with
  the call-anchor teardown; both the contacts-remaining and none-remaining sub-cases must resolve
  to honest, defined endings for every reachable party whichever way ruled].
- **FR-009**: Join confirmation MUST key off a positive event confirming the person's presence in
  the conversation — never off the absence of events (durable platform fact: passive signals cannot
  detect a dead radio). No party may be told the person has joined before that positive
  confirmation exists.
- **FR-010**: On a no-accept run the person MUST hear every true between-attempt outcome and the
  honest exhausted terminal locally — same words as today's ruled terminal — and see the existing
  retry card, having never been inside a phone call.
- **FR-011**: Audio, chips, and log MUST tell one story in every cell of the permutation matrix —
  the 007 one-signal coherence promise, extended to the join phase. All 007 guarantees carried:
  atomic clips (no mid-play cuts), settle-at-terminal freeze, sweep-aware masking, honest chip
  ordering.
- **FR-012**: R-008-5's truthful dropped card MUST survive this feature unchanged in substance —
  and its line MUST also be SPOKEN, locally, with the device fully offline: zero network fetch at
  play time is the bar. Whether the spoken line carries the contact's name is an owner ruling at
  the deck stage.
- **FR-013**: (Story 4 — severable) From activation, Oran's local voice MUST play through the
  loudspeaker at full volume regardless of prior media volume; the live conversation MUST also be
  on speaker at proper volume; nothing is restored until the episode ends [NEEDS CLARIFICATION:
  restore policy at episode end — restore prior volume or leave].
- **FR-014**: The engine is untouched: who is dialled, in what order, on what schedule, and how
  outcomes are classified MUST NOT change. The standard (non-hands-free) path MUST be bit-for-bit
  identical to before this feature.
- **FR-015**: Every new spoken line this feature needs (at minimum: the contact-side bridge line,
  the contact-side failed-join line, the member-side spoken dropped line, and the member-side join
  announce if it differs from the existing connect line) MUST go to the deck FIRST and be
  owner-approved before build — the copy gate; the owner rules emotional register.
- **FR-016**: The never-silent invariant MUST hold on every leg in every cell: no person and no
  contact is ever left in unexplained silence by any path of this feature, and any failure on this
  path MUST surface visibly and audibly (002 FR-012), with the device-pass way-back floor (002
  FR-016) remaining reachable beneath it.

### Key States *(no data entities — this feature defines moments)*

- **Local reaching**: the person's device narrating the live attempt at Signal quality; no call.
- **The moment of yes**: a contact's press-1 — the only event that may bring the person into a
  live call.
- **The join window**: the short, defined span between accept and confirmed join, masked by the
  connect announcement on the person's side and the bridge line on the contact's side.
- **Joined**: positive confirmation the person is present in the conversation — the only state in
  which anyone may be told the person has joined; arms everything downstream that previously armed
  on accept.
- **Failed join**: the window elapsed without positive confirmation — both legs told the truth.
- **Dropped after join**: 008's territory, inherited: truthful card, now spoken, fully offline.
- **Exhausted locally**: the honest terminal spoken on-device; retry card; no call ever existed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Across the full on-device matrix, the person is inside a live call ONLY after a
  contact's accept — zero seconds of waiting-room call time on every run, including full
  exhaustion runs.
- **SC-002**: The hands-free reaching narration is line-for-line identical to the standard path's
  for the same engine events — zero copy or ordering divergence across all Part-A cells.
- **SC-003**: On successful joins, the person hears no dead air: Oran's announcement flows into the
  contact's voice within the announcement's natural breath on 100% of staged success runs; the
  contact hears the bridge line and then the person.
- **SC-004**: On staged failed joins, the contact hears the honest failed-join line within the
  ruled window on 100% of runs; zero contacts left in silence beyond the window across the matrix.
- **SC-005**: Zero cells in the executed matrix where audio, chips, and log diverge.
- **SC-006**: The dropped-line clip plays fully offline (device radio dead) with zero fetch at play
  time, on 100% of staged drop runs; the 008 card and way-back behave unchanged.
- **SC-007**: (Story 4) With media volume at zero at activation, Oran is audibly loud from the
  first word and the conversation is loud on speaker, on every staged run.
- **SC-008**: The standard path shows zero behavioural difference before/after this feature, and
  the engine's dialling order, schedule, and outcome classification are byte-identical in the log.

## Clarifications

### Pending (for `/speckit.clarify`)

1. **Failed-join window length** — how long after the contact's press-1 before the contact is told
   the join hasn't happened (008 ruled 3s as a promptness ceiling in its now-superseded context —
   re-rule for this design).
2. **Contact failed-join copy** — the honest line's wording (emotional register — owner's; deck).
3. **Member's screen on their own failed join** — exact truthful state (008 dropped-card pattern is
   the precedent).
4. **Continuation after a failed join** — does the engine continue to the next contact, and what is
   the accepting contact told if so (interacts with the call-anchor teardown — design carefully).
5. **Story 4 restore policy** — at episode end, restore prior volume or leave at maximum; and
   whether Story 4 ships inside 009 or is severed to its own micro-feature.

## Assumptions

- Deck v1.10 is the copy authority; the 007 Signal system (attempt-anchored narration, atomic
  clips, chip ordering, settle-freeze, sweep-aware masking) is adopted wholesale by consuming the
  same signals — this feature adds join-phase states to that one system rather than forking it.
- The single riskiest addition — the positive join-confirmation signal that lets the contact be
  held until the person has actually arrived — must be spiked/proven FIRST at plan stage, before
  any build sequencing depends on it.
- The contact who accepts is a capable adult; informing them honestly at a failed join is
  sufficient within this feature.
- On-device (Pixel, real PSTN contact legs) is the only verification bar; harness green is
  necessary, never sufficient. The persisted SignalAudio trace is the capture mechanism of record.
  Push to origin stays gated on on-device green.
- All copy follows the constitution's vocabulary rules: plain, warm, brief, true; nothing may imply
  guaranteed help, a monitored or manned response, or recovery work not reliably performed.

## Out of Scope

- **Sweep-position narration** ("calling 1 of 2, 2 of 2") — separate micro-item with the parked
  N-of-M mockups.
- **Sweep counter UI, contacts-changed nudge, sweep-pause duration** — parked queue.
- **Member cancel of an in-flight escalation** — Feature 010.
- **The unattended escalation bridge** — separate feature, own forks.
- **Zombie-leg server-side duration cap** — candidate follow-on (008-I0 A4).
- **Any engine change** — who is dialled, order, schedule, outcome classification.
- **Any operator, anywhere** — there is deliberately none in this architecture.
