# 007 Copy Deck — attempt-anchored narration (v1.9 DRAFT — UNSIGNED, awaiting captain line-by-line sign-off)

**Feature**: `007-outcome-everywhere` (respec 2026-07-13, owner-ruled attempt-anchored model)
**Status**: ⛔ **GATE-DECK — nothing regenerates or deploys until every line below is signed.** The v1.8
outcome lines were deployed unsigned (governance breach, logged 2026-07-12); this deck presents the FULL
line set — new, changed, and carried — for line-by-line sign-off before any clip regeneration.
**Supersedes**: DECK_007_outcome_lines_DRAFT.md (v1.8, transition-anchored `OUTCOME_HANDOFF_TMPL` family).
**On sign-off + commit**: `escalation_copy.py` → **v1.9**; `COPY_VERSION` → `"1.9"` (device cache invalidates).

**The model these lines serve** (owner ruling, 2026-07-13): each attempt narrates its **own** lifecycle when
known — start → (answerphone detected, announced in the moment) → resolution — and transitions shrink to
connective tissue ("Trying [next] now."). No line pairs two contacts in one fused sentence any more, so every
outcome is speakable in every position — including on the LAST and ONLY contact, where the old fused
"— trying [next] now" forms had no next contact to name.

**Standing rules honoured**: Oran is the actor (03 Decisions/2026-07-12 Voicemail copy — Oran leaves the
message; contacts receive it). Every line states an observed event (Constitution I.3). Oran first-person
singular sanctioned (v1.4 character-rule amendment). All names through `xml_name()`.

---

## Part A — attempt lifecycle lines (per attempt, standalone)

### A-START — attempt opening

| # | Beat | Line | Status |
|---|---|---|---|
| L1 | First attempt of a run | "Trying to reach {name}." | **CARRIED** (006, unchanged) |
| L2 | Subsequent attempt, same sweep | "Trying {name} now." | **NEW FORM** — the connective transition IS the next attempt's lead; replaces the tail of the old fused handoff |
| L3 | First attempt of a new sweep | "Trying {name} again." | **NEW FORM** — decomposed from RESWEEP_TMPL; "again" carried over |

### A-AMD — the answerphone moment (the centrepiece)

| # | Beat | Line | Status |
|---|---|---|---|
| L4 | Answerphone detected, in the moment | "{name}'s phone has gone to answerphone — I'm leaving a message now." | **NEW** — spoken AT detection; present tense because the message is being left, not yet left ("gone to answerphone" framing per captain direction; Oran is the actor) |

### A-RESOLVE — attempt resolution (spoken once, when the outcome is known)

| # | Outcome | Line | Status |
|---|---|---|---|
| L5 | Voicemail (fallback/confirm) | "I've left {name} a voicemail." | **CHANGED** — standalone form (was fused "…— trying [next] now."); plays ONLY if the L4 moment was missed (signal lost) — never both |
| L6 | Text sent (final-sweep SMS) | "I've sent {name} a text." | **CHANGED** — standalone form of the v1.8 line |
| L7 | Unable to assist (press 9) | "{name} is currently unable to assist." | **CHANGED** — standalone form; wording itself owner-ratified 12 Jul (deck v1.8 Part B) |
| L8 | No answer (rang out) | "There's no answer from {name}." | **CHANGED** — standalone form of the long-standing handoff head |

*{name} in Part A is always the attempt's OWN contact — no {prev}/{next} pairing anywhere in the deck now.*

---

## Part B — connective tissue & fillers

| # | Beat | Line | Status |
|---|---|---|---|
| L9 | Gap filler (outcome unknown / waiting) | "Still trying to reach your contacts." | **CARRIED** (v1.5 GAP_FALLBACK_BARE, unchanged) — also the neutral never-wrong fallback when an outcome is lost |

*(There is no separate spoken "transition" line — L2/L3 are the transitions, doubling as the next attempt's
opening. This kills the redundancy of "Trying John now." followed by "Trying to reach John.")*

---

## Part C — terminals (all carried, byte-unchanged — listed for the full-set sign-off)

| # | Beat | Line | Status |
|---|---|---|---|
| L10 | Acknowledged (named) | "I've reached {name}, who knows you need help. Take care now." | **CARRIED** (v1.7) |
| L11 | Acknowledged (generic) | "I've reached one of your contacts, who knows you need help. Take care now." | **CARRIED** (v1.7) |
| L12 | Exhausted head | "None of your contacts are able to help right now. " | **CARRIED** |
| L13 | Exhausted tail — button | "Press your button to try again." | **CARRIED** |
| L14 | Exhausted tail — app | "Press the I need help button in the app to try again." | **CARRIED** |
| L15 | Exhausted tail — both/unknown | "Press your button, or the I need help button in the app, to try again." | **CARRIED** |
| L16 | Iona handover (run opening) | "This is Iona. Your call for help has been received. Oran is calling your contacts now." | **CARRIED** |

*Terminal sequencing note: on the final attempt, its A-RESOLVE line (L5–L8) plays as the attempt resolves,
THEN the exhausted terminal (L12+tail) — the old fused `handoff_{outcome}_terminal_{i}` variants are retired;
the standalone resolution lines serve every position including last/only.*

---

## Part D — retired by this deck

- `OUTCOME_HANDOFF_TMPL` fused forms ("I've left {prev} a voicemail — trying {name} now." etc.) — all four,
  next + terminal variants. Structurally unspeakable for last/single/connect-first; replaced by A-RESOLVE + L2/L3.
- `RESWEEP_TMPL` "There's no answer from {prev} — trying {name} again." — decomposed into L8 + L3; this also
  fixes a latent dishonesty: a last-of-sweep voicemail/decline used to feed this "no answer" line.
- `HANDOFF_TMPL` fused "There's no answer from {prev} — trying {name} now." — decomposed into L8 + L2.

## Part E — edge honesty (flagged for the captain, not new lines)

- **Answerphone then call fails mid-message** (rare): L4 was spoken honestly ("I'm leaving a message now" —
  it was being left). If the terminal then classifies non-voicemail, the audio adds NOTHING (no contradictory
  "no answer from {name}"); the chip/log carry the engine truth. Silence over contradiction.
- **Fast acknowledge** (contact answers + presses 1 while the attempt line/ring still plays): terminal cuts
  everything and L10 plays — existing absorbing-terminal behaviour, unchanged.

## Sign-off checklist for the captain

Every line L1–L16 above, individually. New/changed: **L2, L3, L4, L5, L6, L7, L8**. Carried: L1, L9–L16
(signed sets from 006/v1.2–v1.7, re-presented so the deployed set is fully signed for once).


---

## ✅ CAPTAIN SIGN-OFF — GATE-DECK — 2026-07-13

**All sixteen lines (L1–L16) reviewed individually against the full deck text (read from this file, not the
truncated paste). SIGNED — new/changed L2–L8 and carried L1, L9–L16. The deployed set is now fully signed
for the first time.**

Specific rulings:
- **L4 signed as centrepiece** — present tense at detection is the honest tense; "the phone has gone to
  answerphone" correctly avoids implying the person declined; Oran is the actor.
- **L5 fallback-only-never-both** — required behaviour, part of the sign-off.
- **Part D retirements approved** — incl. recognition that the RESWEEP decomposition fixes a latent
  dishonesty predating the respec (last-of-sweep voicemail/decline fed a "no answer" resweep line).
- **Part E silence-over-contradiction** — approved; audio adds nothing when the terminal contradicts a
  spoken L4; chip/log carry engine truth.
- **Non-blocking note (as-designed, recorded):** within a later sweep, subsequent attempts take L2 ("now");
  "again" (L3) marks the sweep boundary only. Honest; intended.

On commit: `escalation_copy.py` → v1.9, `COPY_VERSION` → "1.9". — Captain


---

## DECK AMENDMENT — L17 (owner-directed, captain-signed) — 2026-07-13

Arising from R009 run 1: the post-AMD wait is real (the voicemail is being left in real time) and must be
held honestly, not with the generic gap filler (which contradicts L4 and looped ×4 on-device).

| # | Beat | Line | Status |
|---|---|---|---|
| L17 | Post-AMD hold (once, only if the post-L4 gap stretches) | "I'm leaving {name} a voicemail — one moment, please." | **NEW — SIGNED** (owner-directed copy, 13 Jul) |

**Binding pacing rules (amend spec/tasks, not new engineering):**
1. Post-L4 window: L17 at most ONCE, then bed only, until the next attempt's advance arrives (L2/L3).
2. L9 ("Still trying to reach your contacts.") is PROHIBITED in the post-AMD window — it contradicts L4.
3. L9 elsewhere: at most ONE play per inter-attempt gap. Never loops.

On commit this rides deck v1.9 (clip added to the per-contact set). — Captain


---

## L17 AMENDMENT (owner ruling supersedes the once-only rule) — 2026-07-13

**L17 IS the post-AMD filler, repeatable.** "I'm leaving {name} a voicemail — one moment, please." plays at
the standard filler cadence for as long as the post-AMD window lasts, until the next attempt's advance
arrives (L2/L3). The once-only rule is withdrawn for L17 — the line remains true for the whole window, so
repetition is honest. L9 remains PROHIBITED in the post-AMD window; L9's one-play-per-gap cap elsewhere
stands. — Captain