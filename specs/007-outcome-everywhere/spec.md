# Feature Specification: The outcome, everywhere

**Feature Branch**: `007-outcome-everywhere`

**Created**: 2026-07-12

**Status**: **RESPEC 2026-07-13 — attempt-anchored narration (owner-ruled).** The transition-anchored audio
model below (fused "[outcome] — trying [next]" handoff lines) was found structurally unspeakable for
last-contact / single-contact / connect-first outcomes on the 12 Jul on-device reckoning, and is superseded
by the **attempt-anchored** model: see *Narration Model (respec)* + the *Permutation Matrix* sections. The
spine (enriched `outcome` on `escalation_advance`, `classify_call_status()` one-authority, no-drift T003),
US2 chips (on-device verified), and `/signal-audio/clips` are KEPT — the respec targets the audio consumer
only. Copy authority: `DECK_007_attempt_anchored_v1_9_DRAFT.md` (⛔ unsigned — GATE-DECK).

**Input**: User description: "The outcome, everywhere. Relay the escalation engine's already-classified per-attempt outcome to the member across two surfaces — the Signal audio Oran speaks between attempts, and the live *calling your contacts* screen — driven by one enriched signal so the surfaces cannot disagree."

> **Note on feature identity**: this repository tracks features via `.specify/feature.json`, not per-feature
> git branches — every feature (001–006) lives on `main`. `007-outcome-everywhere` is the spec-kit feature
> identity, not a git branch.

---

## Scope Frame *(carried context — read first)*

**What this feature is.** Today, when the escalation cycle moves from one contact to the next, Oran collapses
*every* non-live outcome into one line: *"There's no answer from [prev]…"* — even when the truth was a
voicemail left or a text sent. The member's history (the log) has told the honest, per-outcome story since
v5.31; the *audio* has not. 007 closes that gap and extends the same honesty to the live *calling your
contacts* screen — **driven by one enriched signal**, so the spoken word, the on-screen status, and the written
history are three renderings of a single classified outcome and **cannot contradict one another**.

**Source of truth for this spec.**
- Owner decision: `03 Decisions/2026-07-12 Audio target architecture — convergence, 007-008 split.md` (the 007/008 split; 007 = "the outcome, everywhere", first/fast/safe).
- Ratified copy: `specs/007-outcome-everywhere/DECK_007_outcome_lines_DRAFT.md` (all four outcome lines + terminal variants resolved; deck → v1.7 on commit). The deck is the copy authority.
- Predraft (reference only, **not** a spec-kit artifact): `PREDRAFT_007_spec_web_2026-07-12.md`.

**The spine.** A shared **outcome builder** enriches the attempt-end signal (extends the 006 `escalation_advance`
shared infrastructure, ADD-006-1) with the attempt's **classified outcome** — one of
`{ voicemail | sms_sent | declined | no_answer | acknowledged }`. It **reads existing classification only** (the
`RESOLVED_STATUSES` guard shipped v5.31, verified on-device 12 Jul); it adds **no** classification, sweep,
timing, or terminal logic. It is a **passenger**: fire-and-forget, zero state writes (Constitution I.4).

**Coherence is architectural, not a review discipline.** Because both surfaces (and the log) read the one
enriched field, agreement is structural — this makes the ADD-006-2 coherence property *built-in* rather than
verified-after-the-fact.

**Hard scope walls** (see Out of Scope): do **not** build outcome lines into the bridge TwiML wait-loop (008
deletes that path); change **no** classification / sweep / timing / terminal logic; foreground/awake only (no
killed-state mirroring, no alarm-grade routing); **never** bundle with 008.

---

## Narration Model (respec 2026-07-13) — attempt-anchored *(supersedes the transition-anchored reading of US1/FR-007/FR-008/FR-011)*

**The ruling.** Each attempt narrates its **own lifecycle when known**; transitions shrink to connective
tissue. No spoken line pairs two contacts in one fused sentence. The audible beats of one attempt:

1. **Start** — "Trying to reach {name}." (first attempt) / "Trying {name} now." (subsequent, same sweep) /
   "Trying {name} again." (new sweep). The transition IS the next attempt's opening — one line, not two.
2. **AMD moment** *(voicemail only, the centrepiece)* — the instant an answerphone is detected:
   *"{name}'s phone has gone to answerphone — I'm leaving a message now."* Present tense — at detection the
   message is being left, not yet left. Oran is the actor (03 Decisions 2026-07-12).
3. **Resolution** *(once, when the outcome lands — whenever that is)* — the attempt's own standalone outcome
   line: no answer / text sent / unable to assist / voicemail-fallback (only if the AMD moment was missed).
   `acknowledged` resolves to the existing success terminal.
4. **Hand-on** — the next attempt's Start beat (or the terminal, on the last/only contact).

**Why attempt-anchored survives where transition-anchored failed:** the outcome line no longer needs a
`{next}` to exist — so the last contact, the only contact, and connect-first outcomes (voicemail, press-9)
are all speakable by construction. This is the model the US2 chips already use (attempt-anchored), which is
why the chips worked on-device while the audio failed.

**Root cause consumed by design (FR-021).** A connecting call emits TWO `phase="ended"` signals: an
outcome-less ring-stop, then the outcome-bearing terminal. The old model gated `ended` on a global audio
phase (`phase==='ringing'`), so the ring-stop flipped the phase and the real outcome was **discarded**
(`ended-not-current` — vault finding 2026-07-12). Attempt-anchored keying REQUIRES the outcome to land on
its attempt's record **regardless of ordering or current audio phase**: the ring-stop affects pacing only
(stop the ring); the outcome-bearing ended merges onto the attempt record whenever it arrives; narration
triggers off the record, not off a phase transition.

### Permutation Matrix *(mandatory gate at /specify — standing process rule for any sequenced-narration feature, captain-ruled 2026-07-13)*

Every cell must be speakable. Axes: contact position × outcome × sweep. Deck line refs (L*) per
`DECK_007_attempt_anchored_v1_9_DRAFT.md`.

| Position \ Outcome | no_answer | voicemail | declined (press-9) | sms_sent | acknowledged | missing/lost |
|---|---|---|---|---|---|---|
| **First of ≥2** | L1 → L8 → L2(next) | L1 → **L4** → L2(next) | L1 → L7 → L2(next) | *(engine: SMS is final-sweep-last only — n/a)* | L1 → L10 terminal | L1 → L9 gap → L2(next) |
| **Middle** | L2 → L8 → L2(next) | L2 → **L4** → L2(next) | L2 → L7 → L2(next) | *(n/a as above)* | L2 → L10 | L2 → L9 → L2(next) |
| **Last of sweep, another sweep follows** | L2 → L8 → **L3**(first, again) | L2 → **L4** → L3 | L2 → L7 → L3 | *(n/a — SMS only on final sweep)* | L2 → L10 | L2 → L9 → L3 |
| **Last of FINAL sweep** | L2 → L8 → exhausted (L12+tail) | L2 → **L4** → exhausted | L2 → L7 → exhausted | L2 → L6 → exhausted | L2 → L10 | L2 → L9 → exhausted |
| **ONLY contact (final sweep)** | L1 → L8 → exhausted | L1 → **L4** → exhausted | L1 → L7 → exhausted | L1 → L6 → exhausted | L1 → L10 | L1 → L9 → exhausted |

Edge rows (also speakable, ruled):
- **Voicemail on ANY position where the AMD-moment signal is lost** → the resolution fallback L5 ("I've left
  {name} a voicemail.") plays at the outcome-bearing ended instead; never both L4 and L5.
- **Answerphone detected, call then fails mid-message** → L4 stood honestly; NO contradictory resolution line
  is added (silence over contradiction); chip/log carry engine truth.
- **Fast acknowledge (press-1 while the attempt line/ring still plays)** → terminal cuts everything, L10.
- **Outcome lands after the next attempt's Start already began** → audio skips the missed resolution (never
  interrupts a live attempt with a stale line); the chip still resolves — surfaces stay individually honest.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Oran speaks the previous contact's real outcome between attempts (Priority: P1)

When the cycle moves from one of the member's people to the next, the member hears **what actually happened** to
the previous one — a voicemail was left, a text was sent, that person is currently unable to assist, or there was
genuinely no answer — and then that Oran is moving on to the next person. This is the honesty payload: the audio
finally says what the history already says.

**Why this priority**: This is the feature's core value and its reason to exist. It is independently shippable —
even with no screen work, honest between-attempt audio is a complete, demonstrable improvement over today's
"no answer for everyone." It also carries the emotional-safety weight (a frightened member must never be told
something false or cold about the people trying to help them).

**Independent Test**: Run an escalation for a Signal-method member across contacts that produce each outcome
(voicemail, last-resort text, press-9 decline, rang-out) and confirm the member hears the matching ratified line
between attempts, with the correct terminal variant on the final contact.

**Acceptance Scenarios**:

*(Respec 2026-07-13 — attempt-anchored; these supersede the fused-handoff scenarios.)*

1. **Given** an attempt's call is detected as an answerphone, **When** detection lands (mid-attempt, in the
   moment), **Then** the member hears *"[name]'s phone has gone to answerphone — I'm leaving a message now."*
   — and when the attempt concludes, the next attempt opens with *"Trying [next] now."* (no second voicemail
   line).
2. **Given** a contact was reached by the final-sweep text, **When** the attempt resolves, **Then** the member
   hears *"I've sent [name] a text."* followed by the next Start beat or the terminal.
3. **Given** a contact pressed 9, **When** the attempt resolves, **Then** the member hears *"[name] is
   currently unable to assist."* followed by the next Start beat or the terminal.
4. **Given** a contact genuinely rang out, **When** the attempt resolves, **Then** the member hears *"There's
   no answer from [name]."* followed by the next Start beat or the terminal.
5. **Given** the resolving contact is the **last or only** contact, **When** the attempt resolves, **Then**
   its standalone resolution line plays (every outcome type — including voicemail and decline), followed by
   the exhausted or acknowledged terminal. **No cell of the permutation matrix is unspeakable.**
6. **Given** the enriched outcome for an attempt is **missing or lost**, **When** the cycle moves on, **Then**
   the member hears the neutral gap line and the next Start beat — never silence, never a wrong outcome.
7. **Given** a connecting call's two `ended` signals arrive in EITHER order (ring-stop before or after the
   outcome-bearing terminal), **When** the outcome-bearing signal lands, **Then** it reaches the attempt's
   record and its resolution line plays exactly once (FR-021/FR-022) — ordering can never discard it.

---

### User Story 2 — The live "calling your contacts" screen mirrors each contact's real status (Priority: P2)

While the cycle runs, the member watching the *calling your contacts* screen sees a per-contact live status —
which contact is being tried now (N of M), whether that contact is ringing (for a call) or being texted (for a
message), and the resolved outcome for each contact as it lands — instead of a static list.

**Why this priority**: A second, independent honest surface. It is separately shippable and testable, but the
audio (US1) is the stronger stand-alone MVP, so the screen mirror is P2. Per Build Discipline (Constitution III),
this surface gets an **internal mockup gate** before code.

**Independent Test**: Open the calling screen during a live Signal escalation and confirm each contact's chip
updates to the correct live status and then to the correct resolved outcome, with channel-honest wording.

**Acceptance Scenarios**:

1. **Given** the cycle is dialling contact N of M by **call**, **When** the screen renders, **Then** contact N
   shows a call-appropriate live status (e.g. "N of M · ringing") and no other contact claims to be active.
2. **Given** an attempt is delivered by **text**, **When** the screen renders that contact, **Then** it shows a
   text-appropriate status and **never** shows "ringing" (channel honesty on-screen).
3. **Given** a contact's attempt resolves (voicemail / text sent / unable to assist / no answer / acknowledged),
   **When** the resolution arrives, **Then** that contact's chip shows the matching resolved outcome.
4. **Given** the screen mockup, **When** it is reviewed internally, **Then** it is approved before any screen
   code is written.

---

### User Story 3 — The member never gets two different stories (Priority: P2)

For any single attempt, what Oran says, what the calling screen shows, and what the history later reads all
describe the **same** outcome. The member can look, listen, and read back, and never be told three things.

**Why this priority**: This is the property 007 exists to guarantee, and it is what makes the feature
trustworthy. It is P2 rather than P1 only because it is the *conjunction* of US1 and US2 plus the log — it is
tested by comparing surfaces, not shipped alone.

**Independent Test**: For each outcome type, capture the spoken line, the on-screen chip, and the history row for
the same attempt and confirm all three name the same outcome.

**Acceptance Scenarios**:

1. **Given** an attempt resolved to a given outcome, **When** the member hears the audio, sees the screen, and
   later reads the history for that attempt, **Then** all three name the same outcome — a mismatch is a defect.
2. **Given** the press-9 decline outcome, **When** the history is rendered, **Then** its wording is aligned to
   the ratified spoken framing ("unable to assist"), so the live audio *"[name] is currently unable to assist"*
   and the past-tense history *"[name] was unable to assist"* describe one event (deck Part D).

---

### Edge Cases

- **Missing / lost outcome** (poor signal drops the enriched field): the audio falls back to a neutral,
  non-false handoff (never silence, never a fabricated outcome); the screen leaves the prior chip state rather
  than inventing a resolution. (US1 #6.)
- **`declined` collapsed into `no_answer`**: if the signal fails to carry the press-9 distinction, the decline
  line (A3) cannot fire and the member is mislabelled — the enriched signal **MUST** carry `declined` distinct
  from `no_answer` (deck Part C).
- **Channel mismatch on screen**: a text-delivered attempt must never render "ringing" (US2 #2).
- **Terminal (last) contact**: the outcome line uses the terminal variant (no "trying [next]"), for every
  outcome type (US1 #5).
- **Method is not Signal**: the **audio** outcome lines must not play or interfere for non-Signal members
  (FR-017). The **screen** mirror is universal (FR-012, Q2 resolved) — a hands-free member sees honest per-contact
  status on screen even though their audio stays unchanged until 008.
- **Enrichment source unavailable / errors**: the enrichment is a passenger — any failure in building or sending
  the enriched signal must leave the sweep entirely undisturbed (FR-012).

---

## Requirements *(mandatory)*

### Functional Requirements — the enriched-signal spine

- **FR-001**: The system MUST enrich the per-attempt attempt-end signal with the attempt's **classified
  outcome**, drawn from the set `{ voicemail | sms_sent | declined | no_answer | acknowledged }`, delivered to
  the member's device.
- **FR-002**: The enrichment MUST **read existing classification only** — the `RESOLVED_STATUSES` guard (v5.31).
  It MUST NOT add, alter, or re-derive any classification, sweep, timing, or terminal logic.
- **FR-003**: The enriched signal MUST carry **`declined` as distinct from `no_answer`** (the press-9
  `ECONTACT_DECLINED` distinction, v5.8), so the decline line can fire and is never collapsed into "no answer".
- **FR-004**: The enrichment MUST be built by a **single shared outcome builder** (extending the 006
  `escalation_advance` shared infrastructure, ADD-006-1) so that **both** consuming surfaces read the **one**
  field.
- **FR-005**: The enriched signal MUST be **fire-and-forget** and MUST perform **zero state writes** — it is a
  passenger on the escalation, never an authority over it (Constitution I.4).
- **FR-006**: **Attachment point (resolved) + engine-touch safety gate** — the enrichment MUST **extend the
  existing `escalation_advance` per-attempt signal** (owner ruling 2026-07-12, Q1: *"it already fires from a safe
  spot 006 proved out"*). Because this is a **payload extension of an already-established, already-Condition-2-
  reviewed emission** — not a new engine emission — the residual review scope is the **outcome field on
  `escalation_advance`**, and it MUST carry that payload extension through the same **read-only brief + captain
  review** posture as 006 Condition 2 (surfaced at the `/plan` Constitution Check), never a silent engine change.

### Functional Requirements — Consumer 1: Signal audio (Oran)

- **FR-007** *(amended 2026-07-13 — attempt-anchored)*: Each attempt MUST narrate its **own** lifecycle using
  the deck's standalone lines (deck v1.9 Part A): Start (L1/L2/L3) → AMD moment (L4, voicemail only, spoken at
  detection) → Resolution (L5–L8, once, when the outcome lands). No fused two-contact line may be spoken.
- **FR-008** *(amended 2026-07-13)*: The resolution line MUST be speakable in **every** cell of the
  permutation matrix (position × outcome × sweep) — including voicemail and decline on the **last** and
  **only** contact — because it stands alone and needs no `{next}`. Transitions are connective tissue only
  (L2 "Trying {name} now." / L3 "Trying {name} again."), doubling as the next attempt's opening.
- **FR-009**: The outcome lines MUST be spoken in **Oran's voice** (first-person singular), consistent with the
  frozen terminal register, and MUST state only an **observed delivery outcome** — never implying a live
  interaction that did not happen (Constitution I.3; deck honesty anchor).
- **FR-010**: When the enriched outcome is **missing or lost**, the audio MUST use a **neutral fallback** that is
  never silent and never states a wrong outcome.
- **FR-011** *(amended 2026-07-13)*: The new per-contact clips (Start forms L2/L3, AMD moment L4, resolutions
  L5–L8) MUST reuse the 006 per-contact clip pipeline, keyed per contact index — scale **O(N) per line
  family**, never O(N²) (the fused `{prev}×{next}` pairing is retired with the fused lines).
- **FR-020** *(new 2026-07-13)*: When an answerphone is detected on an attempt's call, the system MUST deliver
  an **AMD-moment signal** to the device at detection time so Oran can announce it **in the moment** (L4).
  The emission is a passenger (fire-and-forget, threaded, zero state writes, never delays the TwiML response)
  and is an engine-touch requiring its own read-only delta-brief + captain sign-off before build (GATE-ENG-2).
- **FR-021** *(new 2026-07-13 — consumes the two-ended discard root cause)*: The audio consumer MUST key
  attempt-end signals to the **attempt's record** (by `attempt_seq`), not to a global audio phase. An
  outcome-less ring-stop `ended` affects **pacing only** (stop the ring); an outcome-bearing `ended` MUST
  land its outcome on the attempt record **regardless of arrival order relative to the ring-stop and
  regardless of the current audio phase**. The `ended-not-current` discard of an outcome-bearing signal for
  the current run's current-or-prior attempt is a defect.
- **FR-022** *(new 2026-07-13)*: Each attempt speaks each beat **at most once** (per-attempt spoken-beat
  guard): never both L4 and L5 for one voicemail; never a repeated resolution on duplicate signals; a
  resolution landing after the next attempt's Start has begun is **skipped in audio** (chips still resolve) —
  a live attempt is never interrupted by a stale line.
- **FR-023** *(new 2026-07-13 — standing process rule, captain-ruled)*: Any sequenced-narration feature MUST
  present a full permutation matrix (contact position × outcome × sweep) at `/specify`, with every cell
  speakable, before planning proceeds.
- **FR-024** *(new 2026-07-13, R009 run-1 pacing ruling + deck L17 amendment, captain-signed)*: Spoken
  fillers must never contradict or nag. In the **post-AMD window** (L4 spoken, next attempt not yet
  advanced) the filler is **L17** (*"I'm leaving [name] a voicemail — one moment, please."*), repeatable at
  the standard cadence for the whole window; **L9 is PROHIBITED post-AMD** (it contradicts L4); L17 clip
  unavailable → bed only (silence), never L9. **Anywhere else L9 plays at most ONCE per inter-attempt
  gap** — it must never loop.

### Functional Requirements — Consumer 2: live "calling your contacts" screen mirror

- **FR-012**: The calling screen MUST show a **per-contact live status** consuming the **same** enriched signal —
  which contact is active ("N of M"), its live state, and its resolved outcome as it lands — reusing the 006 app
  plumbing (`setContactStatus`, `renderCallingScreen`). **Audience = everyone** (owner ruling 2026-07-12, Q2):
  the screen mirror is shown to **all members who see the calling screen**, Signal and hands-free alike. For
  hands-free members in the 007→008 interim this adds an honest *visual* while their audio is unchanged — not a
  contradiction (the screen states more; the audio states nothing false — see FR-017 and the interim-honesty
  ruling in the owner decision).
- **FR-013**: The screen MUST be **channel-honest**: it MUST render a call-appropriate status for call attempts
  and a text-appropriate status for text attempts, and MUST NOT show "ringing" (or any call-only state) for a
  text attempt.
- **FR-014**: The screen mirror MUST pass an **internal mockup gate** (mock → react → build) before any screen
  code is written (Constitution III).

### Functional Requirements — coherence & safety

- **FR-015**: The spoken outcome, the on-screen outcome, and the written-history outcome for a given attempt
  MUST NOT contradict one another. Because all read the one enriched field, agreement is structural (ADD-006-2
  made architectural).
- **FR-016**: The history wording for the press-9 decline outcome MUST be aligned to the ratified spoken framing
  — the narrator's *"[name] couldn't take the call"* becomes *"[name] was unable to assist"* (past tense in
  history; present in live audio) — as a **copy-only** change with **no logic touched** (deck Part D). *(Owner
  veto retained at build time.)*
- **FR-017**: This audio MUST play **only** for Oran's Signal (method = Signal); it MUST NOT play, or interact
  with the audio of, any other method (parity with 006 FR-016).
- **FR-018**: The audio/screen layer MUST be a **passenger** — it MUST never block, delay, or alter the
  escalation sweep. Any failure in building, sending, or consuming the enriched signal MUST leave the sweep
  entirely undisturbed (Constitution I.4).
- **FR-019**: The feature MUST be **foreground/awake only** — no killed-state mirroring and no alarm-grade
  routing are in scope (those belong to other paths).

### Key Entities

- **Enriched attempt outcome (the one field)** *(new, shared — extends ADD-006-1)*: the per-attempt classified
  outcome `{ voicemail | sms_sent | declined | no_answer | acknowledged }` that rides the attempt-end signal and
  feeds every surface. It is the single point of truth the two consumers (and the log) render.
- **Outcome classification (read-only source)**: the existing engine classification guarded by
  `RESOLVED_STATUSES` (v5.31). 007 reads it; it never recomputes or mutates it.
- **Between-attempt outcome line (`OUTCOME_HANDOFF_TMPL[outcome]`)**: the spoken template family (deck Part A),
  one line per outcome, each with a terminal variant.
- **Per-contact screen status**: the live on-screen state of a contact (active/ringing/texting → resolved
  outcome), rendered by the reused app plumbing from the same enriched field.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every non-live outcome type (voicemail, text, unable-to-assist, no answer), the between-attempt
  audio names **that specific outcome** — **4/4** outcome types produce a distinct, correct line, and **0**
  collapse into a generic "no answer" the member did not experience.
- **SC-002**: The correct between-attempt outcome line is **audible within ~2 seconds** of the enriched signal
  arriving at the device (parity with 006 SC-006).
- **SC-003**: For any single attempt, the outcome the member **hears**, **sees on screen**, and later **reads in
  history** agree **100%** of the time (0 cross-surface contradictions).
- **SC-004**: The calling screen shows a call-only status (e.g. "ringing") for a text-delivered attempt in **0**
  cases.
- **SC-005**: The escalation sweep completes **identically** with the audio/screen layer on versus off — **0**
  measurable change to sweep timing or behaviour (passenger property).
- **SC-006**: When the enriched outcome is missing or lost, the member hears a neutral, non-false line in
  **100%** of such cases — never silence, never a wrong outcome.

---

## Assumptions

- The per-attempt **classification already exists and is trustworthy** — the `RESOLVED_STATUSES` guard (v5.31),
  verified on-device 12 Jul 2026. 007 reads it and never recomputes it.
- The 006 **shared infrastructure is in place to extend**: the `escalation_advance` shared signal builder
  (ADD-006-1) and the per-contact app plumbing (`setContactStatus`, `renderCallingScreen`).
- The device is **foreground/awake**; killed-state and alarm-grade routing are explicitly out of scope.
- The Signal-audio surface (Consumer 1) is **Signal-method only** (per 006 FR-016). The **screen mirror**
  (Consumer 2) is shown to **everyone** who sees the calling screen (Q2 resolved 2026-07-12).
- The deck (`DECK_007_outcome_lines_DRAFT.md`, → v1.7 on commit) is the **copy authority**; all four lines and
  terminal variants are ratified.

---

## Dependencies & Open Items Carried to `/plan`

*(Recorded here explicitly — not silently resolved. Items marked Q feed the Clarifications below.)*

- **Builder attachment point** *(Q1 — resolved: extend `escalation_advance`)* — the outcome enriches the
  existing `escalation_advance` payload. As a payload extension of an already-proven, already-Condition-2-reviewed
  emission, it still carries a **read-only brief + captain review** of the added field at the Constitution Check
  (FR-006) — but not a fresh engine-touch investigation.
- **`declined` distinct from `no_answer`** — a hard requirement (FR-003); the classifier already separates them
  (`Econtact Declined` via the press-9 `ECONTACT_DECLINED` path, v5.8), so the enriched signal must carry the
  distinction through.
- **New per-contact half-clips (A1/A2/A3)** — reuse the 006 per-contact clip pipeline (attempt/handoff-half
  decompose, plan §3); confirm **decompose-vs-pre-render** for the outcome halves at `/plan`.
- **Log-coherence pass (deck Part D)** — align `log_narrator.py` `Econtact Declined` rows from *"couldn't take
  the call"* → *"was unable to assist"* in the **same** coherence pass (FR-016); **owner veto at build**.
- **Screen-mirror audience** *(Q2 — resolved: everyone)* — the calling-screen mirror is shown to all members,
  Signal and hands-free. Audio outcome lines stay Signal-only (FR-017); hands-free members get the honest visual
  in the interim.

## Out of Scope (Scope Walls)

- **No outcome lines in the bridge TwiML wait-loop** — 008 deletes that whole path; never build what the next
  feature demolishes.
- **No classification / sweep / timing / terminal logic change** — 007 reads classification only.
- **No killed-state mirroring, no alarm-grade routing** — foreground/awake only.
- **Never bundled with 008** (audio convergence / late-join) — 007 ships first, fast, and safe on its own.

---

## Clarifications (Resolved 2026-07-12)

Both open decisions were settled by owner ruling at the `/specify` review gate. No `[NEEDS CLARIFICATION]`
markers remain; the spec is unblocked for `/plan`.

### Q1 — Where does the shared outcome builder attach? → **Extend `escalation_advance`**

The outcome enriches the **existing `escalation_advance` per-attempt signal**. Owner rationale: *"it already
fires from a safe spot 006 proved out."* Consequence for `/plan`: this is a **payload extension** of an
already-established, already-Condition-2-reviewed emission — the Constitution Check carries a read-only brief +
captain review of the **added outcome field** only, not a fresh engine-touch investigation (FR-006).

### Q2 — Who sees the live screen mirror? → **Everyone**

The calling-screen mirror is shown to **all members** who see the calling screen — Signal and hands-free alike.
Audio outcome lines remain Signal-only (FR-017); hands-free members get the honest **visual** in the 007→008
interim while their audio is unchanged, consistent with the owner's interim-honesty ruling (nothing false is
spoken; the screen adds an honest surface).
