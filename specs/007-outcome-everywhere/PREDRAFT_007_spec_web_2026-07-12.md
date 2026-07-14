# Feature Specification: The Outcome, Everywhere

**Feature Branch**: `007-outcome-everywhere`

**Created**: 2026-07-12

**Status**: Draft — first `/specify`. **Copy gate CLEARED** (see
[[DECK_007_outcome_lines_DRAFT]] — the four between-attempt outcome lines ratified, incl. the owner's decline
ruling). Ready for `/plan`.

**Input**: Owner ruling (12 Jul, evening) —
[[2026-07-12 Audio target architecture — convergence, 007-008 split]]: *"Log honesty (Voicemail Left / Message
Sent) is not yet relayed in the audio — Oran falls silent where the log tells the truth."* 007 closes that gap
on the surfaces that can adopt it now (Signal audio + the live calling-contacts screen), and deliberately does
**not** touch the bridge TwiML wait-loop (008 deletes that path — never build what the next feature demolishes).

---

## The one-paragraph shape

Today the escalation engine already **classifies** every attempt's true outcome — a delivered voicemail
(`Voicemail Left`), a sent last-resort text (`Message Sent`), an active decline (`Econtact Declined`), a genuine
no-answer — and the **written log** shows each honestly (since v5.31; the classification hardened + verified
on-device 12 Jul via the `RESOLVED_STATUSES` guard). But the member who is *listening*, not reading, hears none
of it: Oran narrates only "trying [name]" and the terminal, collapsing every non-live outcome into silence or
"no answer." 007 carries the **already-classified outcome** to the member across the two surfaces that can adopt
it without the risky bridge rework: **Oran speaks the outcome between attempts** ("I've left Margaret a
voicemail — trying David now"), and the **live "calling your contacts" screen shows per-contact status** ("1 of
2 · ringing", "Voicemail left") — both driven by **one enriched signal** so the two surfaces cannot disagree.

---

## Architecture spine — one enriched signal, two consumers

**The spine (what makes this ONE feature, not two overlapping ones).** The device already receives the
per-attempt `escalation_advance` signal (006, shared infra per ADD-006-1) and the `escalation_complete`
terminal signal. 007 **enriches the attempt-end beat** with the classified outcome via a **shared outcome
builder** — the enrichment ADD-006-1 explicitly anticipated. One builder stamps the outcome
(`voicemail` / `sms_sent` / `declined` / `no_answer` / `acknowledged`) onto the signal; every consumer reads the
same field. This is the load-bearing design choice: **coherence becomes architectural** (ADD-006-2 was "verify
the surfaces don't contradict"; 007 makes it structural — one signal, the surfaces *cannot* disagree).

```
escalation engine (classifies outcome already — RESOLVED_STATUSES, v5.31)
        │
        ▼
 shared outcome builder  ──►  enriched signal { contact, index, sweep, channel, OUTCOME }
        │
        ├──► Consumer 1: Signal AUDIO — Oran speaks the outcome between attempts
        │        (the four ratified deck lines; clips from the existing 006 pipeline)
        │
        └──► Consumer 2: the live "calling your contacts" SCREEN — per-contact status chips
                 (reuses the 006 app plumbing: setContactStatus / renderCallingScreen)

   ✗ NOT a consumer: the bridge TwiML wait-loop outcome lines — 008 deletes that path.
```

**Why the bridge is excluded (deliberate, from the decision):** under the ratified late-join target
architecture, the bridge stops having its own 8kHz wait-audio at all — it adopts the Signal audio system
wholesale (008) and inherits this outcome narration **for free** (same machine, same enriched signal). Building
outcome lines into the doomed TwiML loop now would be throwaway work. Between 007 and 008, hands-free members
keep today's working 8kHz wait audio **without** outcome lines — acceptable and short-lived (nothing spoken is
false; it's silent where 008 will speak).

---

## User Scenarios & Testing *(mandatory)*

Two honesty fences run through every requirement, inherited from the escalation audio work:
- **Honesty (Constitution I.3).** Every spoken line and every screen chip states an **observed delivery
  outcome** — never implies a live interaction that didn't happen. "I've left a voicemail" / "Voicemail left"
  are true; "spoke with" would not be. This is the exact principle verified on-device 12 Jul.
- **Passenger, never driver (Constitution I.4).** The enrichment and both consumers **read** a classification
  the engine already computes; they write **no** escalation state and never block, delay, or alter the sweep.
  If the audio or the screen fails, the escalation runs byte-identically.

---

### User Story 1 — Oran speaks the outcome between attempts (Priority: P1)

A member relying on audio hears not just "trying David" but **what happened to Margaret first**: *"I've left
Margaret a voicemail — trying David now."* Across a sweep they hear the real texture of the reaching — a
voicemail here, a text there, someone currently unable to assist — instead of a flat "no answer" for
everything.

**Why this priority**: This is the owner's core ask — closing the "Oran falls silent where the log tells the
truth" gap. It's the reason 007 exists.

**Independent Test**: A multi-contact escalation on the Pixel where attempts have mixed outcomes (one voicemail,
one SMS, one decline, one true no-answer) → each advance names the previous contact's **correct** outcome using
the ratified deck line, then moves on.

**Acceptance Scenarios**:
1. **Given** the previous attempt was classified `voicemail`, **When** the advance fires, **Then** Oran plays
   *"I've left [prev] a voicemail — trying [next] now."* (A1).
2. **Given** the previous attempt was a final-sweep `sms_sent`, **When** the advance fires, **Then** Oran plays
   *"I've sent [prev] a text — trying [next] now."* (A2).
3. **Given** the previous attempt was `declined` (press 9), **When** the advance fires, **Then** Oran plays
   *"[prev] is currently unable to assist — trying [next] now."* (A3).
4. **Given** the previous attempt was a genuine `no_answer`, **When** the advance fires, **Then** Oran plays the
   unchanged *"There's no answer from [prev] — trying [next] now."* (A4).
5. **Given** it is the terminal contact of the sweep (no next), **When** its outcome resolves, **Then** the
   terminal-variant line plays (no "trying [next]") before the terminal.
6. **Given** the enriched outcome is missing/unknown at playback, **Then** Oran falls back to the neutral
   existing handoff (A4 form) or the generic bed — **never** a wrong outcome, never silence.

---

### User Story 2 — The live "calling your contacts" screen mirrors the same outcomes (Priority: P1)

A member (or a family member watching over their shoulder) looking at the screen during an escalation sees a
**live per-contact status**: which contact is being tried right now ("1 of 2 · ringing"), and what happened to
each one as the sweep advances ("Margaret — Voicemail left", "David — Ringing…"). The screen stops being a
static list and becomes a truthful live mirror of the reaching.

**Why this priority**: The owner named this directly ("the live call status update, 1 of 2, ringing against the
contact"). It's Consumer 2 of the same signal — and the reason the coherence guarantee has to be architectural:
the screen and the audio are two faces of one outcome and must never disagree.

**Independent Test**: Same mixed-outcome escalation on the Pixel with the calling screen foregrounded → each
contact chip updates live to the correct status/outcome, in the correct sweep order, matching what Oran says.

**Acceptance Scenarios**:
1. **Given** an attempt is in progress on a **call** channel, **When** its advance arrives, **Then** the
   contact's chip shows a live "ringing" / "calling" state with its position ("N of M").
2. **Given** an attempt is on an **SMS** channel, **When** its advance arrives, **Then** the chip shows a
   "texting"/"message sent" state — **no** "ringing" (the channel-honesty fence, mirrored on the screen).
3. **Given** an attempt resolves to an outcome (`voicemail`/`sms_sent`/`declined`/`no_answer`), **When** the
   next advance or the completion arrives, **Then** the resolved chip shows that outcome in wording consistent
   with both Oran and the log (voicemail left / message sent / unable to assist / no answer).
4. **Given** the audio and the screen are both active, **Then** for every contact the spoken outcome and the
   chip outcome are **identical** (same source field) — no contradiction is possible.
5. **Given** the signal is lost/late, **Then** the screen holds the last known honest state (no invented
   progress) and reconciles on the next signal or the terminal.

---

### User Story 3 — Both surfaces degrade honestly and stay coherent under poor signal (Priority: P1)

The enriched signal is server-driven and arrives over the network. When outcomes are lost or late, **neither**
surface may invent an outcome: the audio holds the neutral bed / neutral handoff, the screen holds its last
honest state, and both reconcile when truth arrives (or at the terminal). Under no condition does one surface
show an outcome the other doesn't, and under no condition is a false outcome shown.

**Why this priority**: Poor-signal is the design assumption (I.4). The honesty fence is only real if it holds
when information is missing, not just when it's present.

**Independent Test**: Force a lost/late enriched signal mid-sweep → audio stays neutral (no wrong outcome, no
ring it can't back), screen stays on last-honest, both catch up on the next signal; airplane-mode the clip
assets → the cached-playable parts still play; no surface ever shows a false outcome.

**Acceptance Scenarios**:
1. **Given** the enriched outcome for an attempt never arrives, **When** the gap elapses, **Then** the audio
   uses the neutral handoff/bed and the screen holds last-honest — never a guessed outcome.
2. **Given** a late outcome arrives after the audio already moved on, **When** it lands, **Then** the screen
   updates to the truthful resolved state (the terminal record/reconcile remains the backstop).
3. **Given** any mismatch would arise between audio and screen, **Then** it cannot — both read the one field;
   verify no code path lets them diverge.

---

### Edge Cases

- **Decline vs no-answer must be distinguishable in the signal.** If the enrichment collapses `declined` into
  `no_answer`, A3 can never fire — the whole point is lost. The classifier already separates them
  (`Econtact Declined`, v5.8 press-9 path); the enriched signal MUST carry the distinction. *(Deck Part C.)*
- **Outcome arrives after the member acknowledged / escalation ended.** A trailing outcome for an earlier
  attempt must not re-open or re-narrate a finished escalation — the terminal is final (as 006 established with
  the token-scoped guard). Screen may still settle the historical chip; audio does not restart.
- **First attempt acknowledged immediately.** No prior outcome to narrate — the terminal ("I've reached…")
  fires directly; the driver treats "terminal with no prior outcome beat" as normal (as 006 does).
- **Re-sweep re-announces.** A contact tried again on a later sweep gets a fresh attempt beat + its own outcome;
  outcomes are not deduped across sweeps (parity with 006's advance behaviour).
- **Log ↔ audio wording coherence.** With A3 = "currently unable to assist," the log's decline row must align
  (proposed `log_narrator.py` tweak, Deck Part D) so the read and heard surfaces agree.
- **Bridge (Speakerphone) member.** 007's audio consumer plays **only** for Signal (as 006). Bridge members get
  no 007 outcome audio (they get it in 008). The screen mirror: scope decision below (F-1).
- **Screen backgrounded / killed.** Live screen updates are foreground/awake only (parity with 006 audio
  scope); the terminal/native reconcile remains the backstop. Killed-state live mirroring is out.

---

## Requirements *(mandatory)*

### Functional Requirements

**The enriched signal (spine)**
- **FR-001**: The attempt-end beat MUST be enriched with the **classified outcome** of that attempt
  (`voicemail` / `sms_sent` / `declined` / `no_answer` / `acknowledged`) via a **single shared outcome builder**
  — the enrichment ADD-006-1 anticipated. Every consumer MUST read the same field; no consumer re-derives the
  outcome independently.
- **FR-002**: The enriched outcome MUST come from the engine's **existing** classification (the
  `RESOLVED_STATUSES` family, v5.31, hardened + verified 12 Jul). 007 MUST NOT add or change escalation
  classification logic — it reads what is already computed.
- **FR-003**: The signal MUST carry `declined` **distinct from** `no_answer` (the press-9 distinction, v5.8) so
  the decline line/chip can fire. Collapsing them is a defect.
- **FR-004**: The enrichment MUST be a **passenger** — fire-and-forget, writing **zero** escalation state, never
  blocking/delaying/altering the sweep. The engine MUST run byte-identically whether enrichment succeeds,
  fails, or is absent. *(Inherits the 006 `escalation_advance` fire-and-forget discipline; if the enrichment
  rides an engine-touching emission point, it is gated by the same brief/verification bar as 006 Condition 2.)*

**Consumer 1 — Oran speaks the outcome (Signal audio)**
- **FR-005**: On an advance, the Signal audio MUST speak the **previous** contact's outcome using the ratified
  deck line for that outcome (A1 voicemail / A2 text / A3 unable-to-assist / A4 no-answer), then proceed to the
  next attempt. Terminal-sweep contacts use the terminal variant (no "trying [next]").
- **FR-006**: Copy MUST be the deck (byte-identical); on commit the deck is **v1.7**. The lines are Oran
  (Arthur), first-person, per the R-006-7 character amendment (extended to these report beats).
- **FR-007**: If the enriched outcome is missing/unknown at playback, the audio MUST fall back to the neutral
  handoff (A4 form) or the generic bed — **never** a wrong outcome, never silence (I.4 never-silent).
- **FR-008**: This audio MUST play **only** for Signal-method members (as 006 FR-016); it MUST NOT play for, or
  interact with, the bridge audio path.

**Consumer 2 — the live calling-contacts screen mirror**
- **FR-009**: During an escalation, the calling-contacts screen MUST show **live per-contact status** driven by
  the same enriched signal: the in-progress contact with its position ("N of M") and channel-appropriate state
  (ringing/calling for call; texting/message-sent for SMS), and each resolved contact's **outcome**.
- **FR-010**: The screen MUST reuse the existing 006 app plumbing (`setContactStatus` / `renderCallingScreen`
  and the per-contact slot model) so it inherits the ordering contract (ADD-006-2) rather than introducing a
  parallel one.
- **FR-011**: Channel honesty MUST hold on the screen: an SMS attempt MUST NOT show a "ringing" state
  (mirror of the audio's channel-gated ring).
- **FR-012**: Per-contact chip wording MUST be **consistent with both** Oran's spoken line and the log's row
  for the same outcome (one vocabulary across heard / live-seen / historically-read).

**Coherence & honesty (cross-consumer)**
- **FR-013**: The audio and the screen MUST be **incapable of disagreeing** about a contact's outcome — both
  read the one enriched field; no code path may let them diverge. *(This is the architectural form of
  ADD-006-2.)*
- **FR-014**: Under lost/late signal, **neither** surface may invent an outcome: audio holds neutral, screen
  holds last-honest; both reconcile on the next signal or the terminal. No false outcome is ever shown/spoken.
- **FR-015**: A trailing outcome arriving after acknowledgement/exhaustion MUST NOT re-open or re-narrate a
  finished escalation (the terminal is final; inherits 006's token-scoped terminal guard).

**Scope walls**
- **FR-016**: 007 MUST NOT build outcome lines into the **bridge TwiML wait-loop** — that path is deleted by
  008. Hands-free members' interim wait audio is unchanged (no outcome lines) between 007 and 008.
- **FR-017**: 007 MUST NOT change escalation **sweep/timing/terminal logic or classification** — the only
  additions are the shared enrichment (reading existing classification) + the two read-only consumers.
- **FR-018**: Live screen mirroring and outcome audio are **foreground/awake only** (parity with 006);
  killed-state live mirroring and alarm-grade routing are out.

### Key Entities *(include if feature involves data)*

- **Enriched outcome signal** *(extends the 006 `escalation_advance` / `escalation_complete`)*: the per-attempt
  push now carrying the **classified outcome** in addition to contact/index/sweep/channel. Built by the shared
  outcome builder; consumed by the audio driver and the screen mirror; writes no state; not deduped across
  sweeps.
- **Shared outcome builder**: the single server-side function that stamps the classified outcome onto the
  signal (one authority for the wire format — the Bug-A-family lesson, R-006-8). The point FR-013 coherence
  hangs on.
- **Outcome vocabulary**: `voicemail` / `sms_sent` / `declined` / `no_answer` / `acknowledged` — each mapping to
  one ratified spoken line (deck v1.7), one screen chip state, and one log row (`log_narrator.py`), by
  construction identical wording.
- **Per-contact chip / slot**: the existing 006 calling-screen per-contact model (`setContactStatus`), now fed
  live outcomes.

## Success Criteria *(mandatory)*

- **SC-001**: On a mixed-outcome sweep, Oran speaks the **correct** outcome line for **every** attempt
  (voicemail/text/unable-to-assist/no-answer), in correct sweep order — zero mislabelled outcomes.
- **SC-002**: The live screen shows the **correct** per-contact status and outcome for every attempt, in order,
  matching the audio — zero screen/audio contradictions across the on-device matrix (FR-013).
- **SC-003**: A member relying on **audio only** can tell voicemail from text from unable-to-assist from
  no-answer on every attempt (the outcomes are now audibly distinct, not collapsed).
- **SC-004**: Channel honesty holds on **both** surfaces — no "ringing" on an SMS attempt, spoken or shown
  (SC-004 parity with 006).
- **SC-005**: Under forced lost/late signal, **neither** surface ever shows/speaks a false or guessed outcome;
  both reconcile to truth on the next signal or the terminal (FR-014).
- **SC-006**: With the audio/screen force-failed, the escalation runs **byte-identically** and the harness stays
  green — the passenger invariant holds (I.4 / FR-004).
- **SC-007**: The log row, the spoken line, and the live chip for the same outcome use **consistent** wording
  (one vocabulary across read/heard/seen).

## Assumptions

- **Classification already exists and is honest** — the `RESOLVED_STATUSES` guard (v5.31, verified on-device 12
  Jul) means the outcome 007 carries is already truthful at source. 007 relays it; it does not compute it.
- **The 006 signal + app plumbing exist** — `escalation_advance` (shared infra, ADD-006-1), the Signal audio
  driver, and the calling-screen slot model (`setContactStatus`) are in place for 007 to extend/consume.
- **The deck is the copy authority** — the four outcome lines are ratified ([[DECK_007_outcome_lines_DRAFT]]);
  deck → v1.7 on commit.
- **008 will subsume the bridge** — the late-join convergence means the bridge inherits this narration for free
  later; hence the bridge is out of 007 by design, not omission.
- **Foreground/awake** for the live surfaces; the terminal/native reconcile is the backstop (as 006).

## Dependencies / Owner Actions

- **Copy gate — CLEARED** (this deck). Deck → v1.7 on commit; the Part D `log_narrator.py` decline-wording
  alignment is a flagged line item (owner veto at build).
- **Enrichment emission point review** — if the shared outcome builder rides an engine-touching emission site,
  it takes the same read-only brief + captain review + verification bar as 006's Condition 2 (the engine is on
  the safety path). To be determined at `/plan` (where the builder attaches).
- **Screen-mirror scope call (F-1)** — decide whether the live screen mirror is Signal-only (parity with the
  audio consumer) or also applies to hands-free members in the interim (they have a screen even while their
  *audio* is unchanged). Owner/plan decision; flagged below.
- **Mockup gate (Consumer 2)** — the calling-screen live states get an internal mock→react→build gate (the
  screen is a visual surface; III mockups-precede-code applies). Audio consumer rides the existing PRE-2-style
  listening audition.

## Out of Scope

- **Bridge TwiML wait-loop outcome lines** — deleted by 008; never built here (FR-016).
- **The late-join convergence itself** — 008 (bridge adopts the Signal audio system; VoIP join at accept).
  Gated on the failed-join backstop spike; **never bundled with 007** (owner ruling — 008 is the riskiest change
  on the board).
- **Any change to escalation classification / sweep / timing / terminal logic** (FR-017).
- **Killed-state live mirroring; alarm-grade routing; econtact-side audio** (FR-018).
- **The push-chokepoint refactor** — parked until after 007/008 settle the signal traffic (prior ruling).

## Constitution Check (first pass — re-check at /plan)

| Principle | Status | Note |
|---|---|---|
| I.3 honesty | ✅ **Load-bearing / Pass** | Every surface states an observed outcome; no false live-interaction implied. Relays the already-verified honest classification. Channel honesty mirrored on both surfaces. |
| I.4 passenger / never-silent / fail-loud | ✅ **Pass (max rigour)** | Enrichment + both consumers are read-only, fire-and-forget, zero state writes; engine byte-identical (SC-006). Never-silent fallback (FR-007). Engine-touching emission (if any) gated as 006 Condition 2. |
| I.6 Iona/Oran voice | ✅ Pass (amended) | Oran first-person report beats — R-006-7 amendment extended; deck-frozen copy. |
| II vocabulary | ✅ Pass | One ratified vocabulary across audio/screen/log; no banned terms / raw field values. |
| III mockups precede code | ✅ Pass | Consumer 2 (screen) gets an internal mockup gate; Consumer 1 (audio) the listening audition. |
| IV coherence / one authority | ✅ **Pass** | One shared outcome builder = one wire-format authority (R-006-8 lesson); coherence architectural (FR-013). |
| IV time-critical = server/FCM-driven | ✅ Pass | Outcomes are server-classified + signal-driven; on-device is foreground/awake passenger rendering. |
| Scope walls | ✅ Pass | Bridge TwiML excluded (FR-016); no classification/sweep change (FR-017). |

**Gate: PASS (first pass).** One flagged dependency, not a violation: **where the shared outcome builder
attaches** may touch an engine emission site → same gated brief as 006 Condition 2, resolved at `/plan`.

## Open items for /plan

1. **Where the shared outcome builder attaches** — extend the existing `escalation_advance` emission to carry
   the outcome, vs. enrich `escalation_complete`, vs. a dedicated attempt-end signal. Determines whether the
   006 engine-touch brief must be reopened (Condition-2 gate).
2. **Screen-mirror scope (F-1)** — Signal-only or also hands-free-interim? (They have a screen even while their
   audio is unchanged pre-008.)
3. **Handoff clip generation for the new outcome halves** — A1/A2/A3 introduce new per-contact half-clips
   ("I've left [prev] a voicemail" etc.); reuse the 006 per-contact pipeline (attempt/handoff-half decomposition,
   plan §3) — confirm the decompose-vs-pre-render strategy for the outcome halves.
4. **Log Part D alignment** — land the `log_narrator.py` decline-wording change in the same coherence pass
   (owner veto at build).
