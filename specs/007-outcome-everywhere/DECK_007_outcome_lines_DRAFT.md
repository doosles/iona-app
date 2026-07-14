# 007 Copy Deck Extension — between-attempt outcome lines (RATIFIED — pending final owner nod)

**Feature**: `007-outcome-everywhere` · **Status**: Deck gate — **all four outcome lines resolved**. Ready to
carry into `/specify`. Deck version target on commit: `escalation_copy.py` **→ v1.8**. *(Corrected during
implement 2026-07-12: this deck originally targeted "v1.7", but v1.7 was already consumed by feature 006's
"Take care now." rework — 007's copy lands as v1.8. Wording unchanged; only the version number moved.)*
**Created**: 2026-07-12 · **Resolved**: 2026-07-12 (owner ruling on the decline line)

**What this is**: the new *class* of spoken line 007 introduces — Oran reporting **what happened to the
previous contact** before he moves to the next one. Today the handoff collapses every non-live outcome into
one word: *"There's no answer from [prev]…"*. 007 makes that beat **honest per outcome** (voicemail left / text
sent / unable to assist / genuinely no answer), so the audio finally says what the *log* has said since v5.31.

**Two hard anchors these lines satisfy** (not owner calls — constraints):

1. **The log already chose the words.** `log_narrator.py` v1.5 is the member-facing source of truth. The
   spoken line and the written history are two surfaces of ONE outcome (007 makes ADD-006-2 coherence
   *architectural* — one enriched signal feeds both). If Oran says one thing and the log says another, that's
   the failure. Existing log vocabulary:
   | Outcome | Log says (v1.5) | Deck line agrees? |
   |---|---|---|
   | Voicemail | *Alert call — Voicemail left* | ✅ "I've left [prev] a voicemail" |
   | Last-resort SMS | *Alert message — Sent* | ✅ "I've sent [prev] a text" |
   | Contact declined (press 9) | *Oran's Signal — {name} couldn't take the call* | ⚠️ see coherence note §D |
   | No answer / rang out | *No answer* | ✅ "There's no answer from [prev]" |
   | Answered / acknowledged | *{name} answered* | ✅ (terminal, existing) |

2. **Honesty (Constitution I.3).** Every line states an **observed delivery outcome** — never implies a live
   interaction that didn't happen. The exact principle the voicemail-honesty arc established and verified
   on-device today. "I've left Margaret a voicemail" is true; "I spoke to Margaret" would not be.

**Voice**: Oran (Arthur-Neural), first-person singular — the character-rule amendment ratified at R-006-7.
Register anchored to the frozen terminals: *"I've reached [Name], who knows you need help. Take care now."*

---

## Part A — the four between-attempt outcome lines (ALL RATIFIED)

These play at an advance, in the slot the bare handoff occupies today, naming the **previous** contact's real
outcome, then moving on. Structure ports the current `HANDOFF_TMPL`; the first half now varies by outcome.

Proposed constant family: **`OUTCOME_HANDOFF_TMPL[outcome]`** — one template per outcome, `{prev}` + `{next}`.

| # | Outcome | Line (→ next contact) | Terminal-sweep variant (no next contact) |
|---|---|---|---|
| A1 | **Voicemail left** | *"I've left [prev] a voicemail — trying [next] now."* | *"I've left [prev] a voicemail."* |
| A2 | **Text sent** (final-sweep SMS) | *"I've sent [prev] a text — trying [next] now."* | *"I've sent [prev] a text."* |
| A3 | **Unable to assist** (press 9) | *"[prev] is currently unable to assist — trying [next] now."* | *"[prev] is currently unable to assist."* |
| A4 | **No answer** (rang out) | *"There's no answer from [prev] — trying [next] now."* (unchanged) | *"There's no answer from [prev]."* |

Notes:
- **A1/A2** are the honesty payload — the two outcomes the log SHOWS but Oran currently stays silent on (the
  "Oran falls silent where the log tells the truth" gap you raised).
- **A3** — owner-ratified wording. Frames the *moment* ("currently"), not the person; warmer than any
  "declined"/"couldn't". Coherent with the **contact's own IVR experience**: the contact hears *"press 9 if you
  are unable to help"* and, on pressing 9, *"we will contact the next person who may be able to help"* — so
  Oran's "currently unable to assist → trying [next]" echoes what the declining contact was just told. (Owner
  preferred "assist" over "help"; noted that the contact-side prompt still says "help" — the words are near-
  synonyms and both honest; a future prompt-copy pass could align them if desired, out of scope here.)
- **A4** is the *existing* line, reused unchanged — already honest for a true rang-out. 007's point is that
  A1/A2/A3 **stop being mislabelled as A4**.
- **Verb discipline** matches the log's channel-honest split (v1.5): a text draws "sent," a call "no answer,"
  a voicemail "left." Each names its own channel.
- **Contraction** ("I've…") matches the ratified terminal register.

---

## Part B — the decline line: RESOLVED

**Ruling (owner, 12 Jul):** name the outcome, softened to the moment — **"[prev] is currently unable to
assist."** Chosen over (a) the log's "couldn't take the call" [off from the IVR — the contact answered, they
were unable to *help*, not unable to *take the call*], (b) motion-only "moving on to [next]", and (c) silence
[risked implying no-answer]. Rationale in the owner's words: *currently* not able / unable to assist reads
better than anything framed as "declining to help" — it's the moment, not the person.

Grounding that made the call: the **contact's live-IVR prompt (v5.8)** is
*"…press 1 to acknowledge, or press 9 if you are unable to help,"* and press-9 confirmation is *"Thank you. We
will contact the next person who may be able to help. Goodbye."* The escalation then skips to the next contact.
So "unable to assist" is the honest member-side mirror of "unable to help" — no refusal or rejection is spoken
into a frightened member's ear, and it rhymes with what the contact themselves was told.

---

## Part C — the enriched signal (what makes these lines possible) — spec/plan concern, noted here

These lines need the previous attempt's **outcome** to arrive at the device. That's the 007 spine: the existing
`escalation_complete`/advance signals enriched via the **shared outcome builder** (the enrichment ADD-006-1
anticipated), carrying the classified outcome (`voicemail` / `sms_sent` / `declined` / `no_answer`). The
classification **already exists and is guarded** (the Voicemail-Left work + today's `RESOLVED_STATUSES` guard).
No new engine risk — it's reading a classification already computed. Full treatment is the 007 spec/plan.

**One design note for /specify:** the decline outcome (`declined`) must be **distinguishable in the signal from
`no_answer`** — otherwise A3 can't fire (the whole point is that a press-9 is no longer collapsed into "no
answer"). The classifier already separates them (`Econtact Declined` status via the press-9 `ECONTACT_DECLINED`
path, v5.8), so the enriched signal just needs to carry that distinction through. Flag for the spine story.

---

## Part D — ⚑ log-coherence follow-up (proposed narrator tweak, owner had no preference → my call: DO IT)

With A3 ratified as "currently unable to assist," the **spoken** line and the **written** log now differ: the
member would hear *"[name] is currently unable to assist"* but read *"[name] couldn't take the call"* in their
history. That's precisely the two-surfaces-disagree failure 007 exists to eliminate.

**Proposed** (owner expressed no preference; recording my decision so it's visible and vetoable at build):
align the narrator's decline outcome to the ratified spoken wording —

```python
# log_narrator.py — Econtact Declined rows (currently "{name} couldn't take the call")
("Emergency Call 1", "Econtact Declined"): {"what": "Oran's Signal", "outcome": "{name} was unable to assist"},
("Emergency Call 2", "Econtact Declined"): {"what": "Oran's Signal", "outcome": "{name} was unable to assist"},
("Emergency Call 3", "Econtact Declined"): {"what": "Oran's Signal", "outcome": "{name} was unable to assist"},
```

- One-line copy change, **no logic touched**, coverage gate unaffected (same keys, new outcome string).
- Past tense in the log ("was unable to assist") vs present in the live audio ("is currently unable to
  assist") — correct: the log is history, the audio is the live moment.
- **Not silently assumed** — lands as an explicit line item in the 007 spec so CC and owner both see it; veto
  at build if you'd rather keep "couldn't take the call."

---

## Summary — deck gate status

**RATIFIED and ready for `/specify`:** A1, A2, A3, A4 + all terminal variants.

**Carried into the spec as flagged items** (not blockers):
- Part C design note — the enriched signal must carry `declined` distinct from `no_answer`.
- Part D — the proposed `log_narrator.py` decline-wording alignment (my call: do it; owner veto at build).

**On commit:** deck → **v1.7**; R-006-7 character-rule amendment note extends to cover the report beats
(already sanctioned). Nothing in this deck changes sweep/engine logic — it is copy + one flagged narrator line.

**Next step:** 007 `/specify` — draft the full feature spec (the enriched-signal spine + Consumer 1 Oran
outcome narration using these lines + Consumer 2 the live "calling your contacts" screen mirror). This deck is
the copy authority it will reference.
