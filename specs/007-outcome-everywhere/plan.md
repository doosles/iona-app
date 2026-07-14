# Implementation Plan: The outcome, everywhere

**Branch**: `007-outcome-everywhere` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature spec ([spec.md](./spec.md), both clarifications resolved 2026-07-12) + the ratified copy deck
([DECK_007_outcome_lines_DRAFT.md](./DECK_007_outcome_lines_DRAFT.md), → v1.7 on commit) + the outcome-field
delta-brief ([BRIEF_outcome_field_escalation_advance.md](./BRIEF_outcome_field_escalation_advance.md)).

> **Feature identity**: tracked via `.specify/feature.json` (no per-feature git branch; all features live on
> `main`). "Branch" above is the spec-kit identity.

## Summary

Make the escalation's already-classified per-attempt **outcome** reach the member on **two surfaces** — Oran's
between-attempt audio and the live *calling your contacts* screen — from **one enriched signal**, so audio,
screen, and history cannot tell three stories. Today Oran collapses every non-live attempt into *"There's no
answer from [prev]…"*; the log has told the honest per-outcome story since v5.31. 007 closes that gap.

**Technical spine — one field on an emission that already fires.** The device already receives a per-attempt
`escalation_advance` signal (006) that carries a **`phase`** (`"dialing"` | `"ended"`). The **`phase="ended"`**
emission already fires at attempt-end (`reply_to_airtable_webhook.py:4987`, after the terminal-status filter) —
today outcome-less (`contact_first=""`, no outcome). 007 **adds one classified `outcome` field** to that ended
emission (and populates `contact_first`), plus the ack/decline terminal signals. The outcome is **read from
existing classification** — the `RESOLVED_STATUSES` authority (`:4853`), `_reconcile_call_row`, the
`ECONTACT_DECLINED` (press-9, `:182`) and `ESCALATION_ACKNOWLEDGED` guards — all **live locals at the emit
site**. `pwa_sender.build_escalation_advance_payload` / `send_escalation_advance` gain an **optional `outcome=`**
(additive; 006 callers unchanged). The app's existing `SignalAudio` driver + per-contact plumbing
(`setContactStatus`, `renderCallingScreen`) consume the one field for both surfaces.

**Why this is lighter than 006.** 006 added a *new* emission at the dial sites (its Condition-2 gate). 007 adds
**no new emission and touches no dial site** — it enriches the *payload* of an emission 006 already shipped and
the captain already reviewed. The residual engine-touch review (FR-006) is therefore a **delta**: *may the
outcome be derived at the ended-emit site from existing locals, and does the emit need to sit a few lines later,
after `_reconcile_call_row`?* — captured in the delta-brief, gating only the `[ENG]` tasks.

## Respec 2026-07-13 — attempt-anchored narration (owner-ruled; supersedes §1/§3/§4 below where they conflict)

**What is kept (no blanket revert):** the enriched `outcome` on `escalation_advance` (T003–T006, harness-
proven), `classify_call_status()` / `outcome_for_ended_call()` one-authority + the no-drift condition, the
US2 chips (on-device verified 12 Jul), the Part-D narrator alignment (T013), `/signal-audio/clips`. The
respec targets the **audio consumer** (app `SignalAudio`) + the copy deck + one new backend emission.

### R1. The narration model

Each attempt is a first-class record narrating its own lifecycle (spec *Narration Model* + permutation
matrix): Start (L1/L2/L3 — the transition IS the next attempt's opening) → AMD moment (L4, at detection) →
Resolution (L5–L8, once, when the outcome lands) → hand-on. Fused `{prev}×{next}` lines are retired
(`OUTCOME_HANDOFF_TMPL`, `HANDOFF_TMPL`-as-lead, `RESWEEP_TMPL` — decomposed).

### R2. The mechanism — how the two-ended discard is consumed (FR-021)

Today `_saOnEnded` gates on `sig.attemptSeq === _saState.attemptSeq && _saState.phase === 'ringing'` — a
global-phase key, so a connecting call's outcome-less ring-stop (`:5029` in the webhook) flips
`phase→'gap'` and the outcome-bearing terminal ended (`:5050`) is discarded (`ended-not-current`).

Replacement — **per-attempt records in the reducer**:

- `_saState.attempts[attemptSeq] = { index, sweep, channel, outcome: null, spoken: {start, amd, resolution} }`
  — created at the attempt's `dialing` signal (and back-filled by an ended that beats its dialing).
- **Ring-stop ended (outcome-less):** pacing only — if it names the current attempt while ringing, stop the
  ring and enter the gap bed. It **never** finalises an outcome and never blocks a later outcome. Out-of-order
  → ignore (no record change).
- **Outcome-bearing ended:** merge `outcome` onto `attempts[seq]` **unconditionally with respect to audio
  phase** (idempotent — first outcome wins; absence never overwrites presence). Ring-stop-then-outcome and
  outcome-then-ring-stop converge to the identical record state — ordering independence by construction.
- **Narration triggers off the record, not the phase:** when an outcome lands on the **current** attempt and
  `spoken.resolution` is false → speak the resolution line now (in the gap), mark spoken. If the outcome is
  already known when the **next** attempt's dialing arrives and resolution is unspoken → speak it as the lead,
  then the Start beat. If it lands **after** the next Start began → audio skips it (FR-022; chips resolve).
  Voicemail: the AMD-moment signal marks `spoken.amd` + counts as the resolution narration; the later
  outcome-bearing ended merges silently (L5 plays only if `spoken.amd` is false — the lost-signal fallback).
- **Stale-attempt gate amended:** `attemptSeq < _saState.attemptSeq` still never *speaks*, but an
  outcome-bearing ended for a prior attempt of the SAME run still merges onto that record (chip coherence).
  Run-boundary rules (run_ts total order, R-006-12) are untouched.
- **Terminal:** `_saOnComplete`'s pre-exhausted "last outcome" beat re-keys to the record — if the final
  attempt's resolution is unspoken, speak it (L5–L8), then the exhausted line; if already spoken (normal
  case now), exhausted only. Never-silent shape preserved.

### R3. The AMD-moment emission (new engine touch — GATE-ENG-2, delta-brief required)

New passenger emission at the **econtact AMD branch** (`_handle_twiml_econtact`, `AnsweredBy machine_*` —
the site live-verified on run `fda93e4e`): `send_escalation_advance(..., phase="amd", outcome="voicemail")`.
Fire-and-forget + threaded so the TwiML response is never delayed; identity (econtact_index / sweep /
run_token) already rides the TwiML URL (v5.28). Read-only brief:
`BRIEF_amd_moment_emission.md` — **captain sign-off gates this task**, same posture as GATE-ENG.

### R4. Clip inventory (replaces §3's decompose plan) — O(N) per family

Per contact index *i*: `trying_now_{i}` (L2), `trying_again_{i}` (L3), `amd_moment_{i}` (L4),
`outcome_voicemail_{i}` (L5), `outcome_sms_{i}` (L6), `outcome_declined_{i}` (L7), `outcome_noanswer_{i}`
(L8). Existing `{i}_attempt` (L1), ack + statics carried. Retired keys: `handoff_{prev}_{next}`,
`handoff_{oc}_{prev}_{next}`, `handoff_{oc}_terminal_{i}`, `resweep_{prev}_{first}`. `COPY_VERSION` → 1.9
invalidates the device cache wholesale. **⛔ GATE-DECK: no clip regenerates until the captain signs
`DECK_007_attempt_anchored_v1_9_DRAFT.md` line-by-line.**

### R5. Folded into the same pass

Cosmetics (header font → Dancing Script per the signed mockup; avatar initial **teal not amber**;
**first-name only** in rows — fixes the surname wrap); remove `// PROBE-007` logging + rebuild; T015
master-ref changelog + `/howsu-align` at the end. Sweep counter stays **parked** (owner decision pending;
sweep index on the wire, unread). Deploy of ANY of this rides the post-GATE-DECK build — nothing ships
unsigned.

---

## Technical Context

**Language/Version**: JavaScript ES2017+ (`iona-app/www/app.js`); **Python 3** (howsu backend). No native
Kotlin/Java change (foreground/awake playback + on-screen chips ride the WebView; killed-state is out — FR-019).

**Primary Dependencies**: the existing 006 infra — `pwa_sender.send_escalation_advance` /
`build_escalation_advance_payload` (`pwa_sender.py:305/322`, the shared builder, ADD-006-1) sent via
`send_bridge_data_push` (data-only, `android:{priority:"high"}`, not alarm-class); the `SignalAudio` app driver +
per-contact plumbing (`setContactStatus`, `renderCallingScreen`); AWS Polly via `boto3` for any new outcome
half-clips; `log_narrator.py` (v1.5) for the Part-D history alignment. Creds from `config.py`.

**Storage**: On-device clip cache + manifest (`COPY_VERSION` tag) — existing 006 mechanism, extended with the
new outcome half-clips (A1/A2/A3). **No Airtable schema change** (outcome is derived from existing Status values;
`Voicemail Left` / `Econtact Declined` / `Missed Call` / `Alert Message`,`Message Sent` / `Call Answered` all
already valid).

**Testing**: `node --check` + `python3 -m py_compile` as push preconditions; the **escalation harness must stay
green** (the outcome field adds no engine path, no sweep/timing/terminal change — SC-005). On-device (Pixel 4a)
outcome-matrix runs (one attempt per outcome type + a terminal-variant run) are the bar; a **wifi-tablet**
parity run for the universal screen mirror (Q2).

**Target Platform**: Android (Capacitor WebView), foreground/awake only. Media-stream audio + on-screen chips.

**Project Type**: Cross-repo mobile + backend. App: `/Users/Henry/iona-app` (`www/app.js`,
`www/audio/signal/*`). Backend: `/Users/Henry/.openclaw/workspace/howsu`
(`reply_to_airtable_webhook.py`, `pwa_sender.py`, `escalation_copy.py`, `render_signal_static.py`,
`log_narrator.py`).

**Performance Goals**: **Zero clip-asset fetch at escalation time** (new half-clips pre-generated at
contact-save / app-start, like 006). The enriched emission stays **fire-and-forget** — zero added sweep latency
(esp. the final synchronous mobile SMS sweep). Outcome line audible within ~2 s of the enriched signal arriving
(SC-002).

**Constraints**: **Passenger** — no escalation-state writes; never blocks/delays/alters the sweep (I.4;
FR-005/018; SC-005). **Reads classification only** — no new classification/sweep/timing/terminal logic
(FR-002). **`declined` distinct from `no_answer`** on the wire (FR-003). **Copy = deck v1.7**, byte-identical.
Foreground/awake only (FR-019).

**Scale/Scope**: Small-to-medium. Backend: one optional `outcome=` param on the shared builder + populate it at
the ended/ack/decline emit sites (a payload delta, not a new emission); the Part-D `log_narrator.py` one-line
copy alignment; new outcome half-clips in the render tool. App: outcome branch in the `SignalAudio` handoff slot
+ the screen-mirror chips consuming the same field + the neutral fallback. No native module, no Airtable change,
**no change to sweep/timing/terminal/classification logic.**

## Constitution Check

*GATE: evaluated pre-Phase-0; re-check after Phase 1 (below).*

| Principle | Status | Notes |
|---|---|---|
| I.1 no health/case data | ✅ Pass | The outcome (`voicemail`/`sms_sent`/`declined`/`no_answer`/`acknowledged`) is transient operational escalation state, not health/case data. |
| I.2 proactive & reactive first-class | ✅ Pass | Makes the reactive escalation's outcomes legible; no trigger/engine-logic change. |
| I.3 promise the attempt; honesty | ✅ **Load-bearing / Pass** | Every line states an **observed delivery outcome** (voicemail left / text sent / unable to assist / no answer) — never a live interaction that didn't happen (FR-009; deck honesty anchor, verified on-device 12 Jul). Terminal variants honest. |
| I.4 reactive higher bar; **fail loudly, never silently**; passenger | ✅ **Pass (max rigour)** | The enriched signal is a **passenger** — additive field on a fire-and-forget emission; zero state writes; never blocks/delays/alters the sweep (FR-005/018; SC-005). Missing outcome → neutral non-false line, never silent (FR-010; SC-006). |
| I.5 not elderly/medical | ✅ Pass | Companion-presence framing; no medical vocabulary. |
| I.6 Iona presence; Oran voice | ✅ Pass | Outcome lines are Oran (Arthur), first-person singular — the R-006-7 amendment already covers report beats (deck note). |
| I — reactive gating | ✅ Pass | Audio Signal-only (FR-017). Screen mirror universal (Q2) — a **read-only visual**, no entitlement/method change; the safety floor is untouched. |
| II vocabulary | ✅ Pass | User-facing copy is the frozen deck (no banned words, no raw field values). Screen wording channel-honest, no "ringing" on text (FR-013). |
| III **mockups precede code** | ✅ Pass (gated) | New visual surface (the per-contact screen mirror) → **internal mockup gate before screen code** (FR-014; US2 #4). The audio reuses 006's audition posture. |
| III simplicity / scope | ✅ Pass | Reuses the 006 emission, builder, app driver, per-contact plumbing, clip pipeline. Net-new: one optional field + outcome branch + chips + 3 half-clips + a 1-line narrator copy change. Scope walls listed. |
| IV creds/IDs from config; field IDs | ✅ Pass | AWS creds from `config.py`; outcome derived from existing Status values (no new field IDs). |
| IV schema wall | ✅ N/A | No Airtable change (all outcome Status values already valid). |
| IV `.js` only JS | ✅ Pass | `app.js` stays JS. |
| IV validate before push; repo+copy together | ✅ Pass | `node --check` + `py_compile`; app via `cap copy` + `installDebug`; backend restart (deploy reality reported). |
| IV **time-critical logic server/FCM-driven, not WebView `setTimeout`** | ✅ Pass | Outcome is server-derived + FCM-delivered (the enriched `escalation_advance`); the app only renders. Passenger pacing is foreground/awake only. |
| IV hands-free = native-SDK | ✅ N/A | 007 touches no call/speaker routing. |
| IV contact lookup backend-from-Airtable | ✅ Pass | Outcome + name derived backend-side; half-clips generated from backend contact reads. |

**Gate: PASS.** One **gating dependency (not a violation)**: the outcome-field addition to the `phase="ended"`
`escalation_advance` emission carries a **read-only delta-brief + captain review** (FR-006) — the `[ENG]` tasks
do not start until the captain signs the delta-brief. Everything else (half-clips, app outcome branch, screen
mirror + mockup gate, the Part-D narrator line) proceeds in parallel. New infra justified in Complexity Tracking.

**Post-design re-check (after Phase 1):** the design artifacts (`research.md`, `data-model.md`, `contracts/`,
`quickstart.md`) introduced **no new violation** — the outcome stays an additive, read-only, fire-and-forget
field on a proven emission (I.4 passenger holds), all Status values remain valid (no schema wall), the screen
keeps its mockup gate (III), and copy stays deck-frozen (II). Gate remains **PASS**; the single gating dependency
(the FR-006 delta-brief captain sign-off) is unchanged.

## Architecture (state before tasks)

### 1. The one enriched field (the spine)

`escalation_advance` already carries `{ type, contact_index, sweep, channel, contact_first, run_token, phase,
attempt_seq }` (`pwa_sender.py:305`). 007 adds **`outcome`** — one of
`{ voicemail | sms_sent | declined | no_answer | acknowledged }` — populated on the **attempt-end** signals only
(`phase="ended"` and the ack/decline terminals). `phase="dialing"` emissions are unchanged (no outcome yet).

```
phase="dialing"  → (006, unchanged) "Trying to reach {name}" + channel-gated ring
phase="ended"    → (007) carries outcome + contact_first:
     no_answer   → "There's no answer from {prev} — trying {next} now."       (A4, existing line)
     voicemail   → "I've left {prev} a voicemail — trying {next} now."         (A1)
     sms_sent    → "I've sent {prev} a text — trying {next} now."              (A2)
     declined    → "{prev} is currently unable to assist — trying {next} now." (A3)
terminal (ack)   → acknowledged → existing spoken terminal ("I've reached {name}…")
last contact     → terminal VARIANT of each line (no "trying {next}")          (deck terminal column)
missing/lost     → neutral fallback bed, never silent, never a wrong outcome   (FR-010)
```

### 2. Outcome derivation (backend, READ-ONLY — the FR-006 review item)

The outcome maps 1:1 from existing classification, all live at the ended-emit site:

| Enriched `outcome` | Derived from (existing) |
|---|---|
| `no_answer` | terminal `no-answer` / provisional `Missed Call` (and `Call Not Placed`/`Call Failed`, which classify like it) |
| `voicemail` | `AnsweredBy machine_*` → reconciled **`Voicemail Left`** (`_reconcile_call_row`) |
| `sms_sent` | final-sweep SMS branch → **`Alert Message` / `Message Sent`** |
| `declined` | press-9 → **`ECONTACT_DECLINED`** (`:182`) / Status `Econtact Declined` (`:3257`) — **distinct from `no_answer`** (FR-003) |
| `acknowledged` | press-1 → **`ESCALATION_ACKNOWLEDGED`** / Status `Call Answered` |

The classifier already separates `declined` from `no_answer`, so FR-003 needs only that the field **carries** the
distinction. **Delta-brief question (captain):** the terminal ended-emit at `:4987` fires *before*
`_reconcile_call_row` runs; deriving `voicemail` vs `no_answer` needs the reconcile verdict (`answered_by`,
`call_status`) — confirm whether the outcome is derived from those raw locals at `:4987` or the emit moves a few
lines to sit after reconciliation. **Read-only; no sweep/timing/terminal change either way.**

### 3. The outcome half-clips (deck A1/A2/A3) — generation strategy

New per-contact / per-outcome half-clips: *"I've left {prev} a voicemail"*, *"I've sent {prev} a text"*,
*"{prev} is currently unable to assist"* (each + the shared "— trying {next} now" tail already produced by the
006 handoff pipeline). **Reuse the 006 per-contact clip pipeline** (attempt/handoff-half decompose, 006 plan §3).
`no_answer` (A4) is the existing handoff clip, unchanged. **Decompose-vs-pre-render** for the three new outcome
halves is confirmed at `/tasks` — **CC recommends decompose** (per-contact scale N not N², natural reuse of the
"— trying {next}" tail), mirroring 006's ruling.

### 4. Consumer 1 — Signal audio (app, `SignalAudio`)

The existing driver's **handoff slot** (today: single "no answer" line) branches on `outcome` → the four deck
lines; the terminal (last-contact) path uses the terminal variants; missing/stale outcome → neutral fallback bed
(FR-010). Signal-method only (FR-017). One voice (Oran). No new lifecycle triggers.

### 5. Consumer 2 — live screen mirror (app) — **mockup gate first (FR-014)**

The *calling your contacts* screen becomes per-contact live status consuming the **same** `escalation_advance`:
`phase="dialing"` → "N of M · ringing" (call) / channel-appropriate text status (never "ringing" on SMS —
FR-013); `phase="ended"` `outcome` → the resolved per-contact chip. Reuses `setContactStatus` /
`renderCallingScreen`. **Audience = everyone** (Q2) — Signal and hands-free; for hands-free members the screen
is honest while their audio stays unchanged until 008 (no contradiction — the screen says more, the audio says
nothing false). **Internal mockup → react → build before any screen code.**

### 6. Coherence — architectural (ADD-006-2 made structural) + Part-D log alignment

Audio (§4) and screen (§5) read the **one** `outcome` field, so they cannot disagree (FR-015). The **history**
is the third surface: align `log_narrator.py` `Econtact Declined` rows from *"{name} couldn't take the call"* →
*"{name} was unable to assist"* (deck Part D; FR-016) in the same coherence pass — **copy-only, no logic, same
keys, coverage gate unaffected**; **owner veto at build**. Past tense in history vs present in live audio is
correct (history vs the live moment).

### 7. Scope walls (enforced in tasks)

No outcome lines in the **bridge TwiML wait-loop** (008 deletes it). **No** classification / sweep / timing /
terminal change. **No** killed-state mirroring, **no** alarm-grade routing (foreground/awake only). **Never**
bundled with 008.

## Project Structure

```text
specs/007-outcome-everywhere/
├── spec.md                                    # clarifications resolved
├── plan.md                                    # this file
├── DECK_007_outcome_lines_DRAFT.md            # copy authority (→ v1.7 on commit)
├── PREDRAFT_007_spec_web_2026-07-12.md        # web pre-draft (reference only)
├── BRIEF_outcome_field_escalation_advance.md  # FR-006 delta-brief (captain review gates [ENG] tasks)
├── research.md                                # Phase 0
├── data-model.md                              # Phase 1 — the enriched signal + outcome map
├── contracts/
│   ├── escalation_advance_outcome.md          # backend→device signal contract (the added field)
│   └── screen_mirror.md                        # app UI contract (per-contact status, channel honesty)
├── quickstart.md                              # Phase 1 — validation runs
└── checklists/requirements.md                 # spec-quality checklist (passing)

iona-app/  (app)
└── www/app.js            # SignalAudio handoff slot → outcome branch; screen-mirror chips (mockup-gated); fallback

howsu/  (backend)
├── pwa_sender.py                 # build_escalation_advance_payload / send_escalation_advance += optional outcome=   [ENG — gated]
├── reply_to_airtable_webhook.py  # populate outcome + contact_first at the ended/ack/decline emit sites             [ENG — gated]
├── escalation_copy.py            # deck v1.7 — OUTCOME_HANDOFF_TMPL family (+ terminal variants)
├── render_signal_static.py       # + A1/A2/A3 outcome half-clips (reuse 006 pipeline)
└── log_narrator.py               # Part-D: Econtact Declined → "was unable to assist" (copy-only, owner veto)
```

**Structure Decision:** Cross-repo; backend owns copy + outcome derivation + the (gated) payload delta; app owns
both surfaces from the one field. No native module, no Airtable change, no sweep/terminal-logic change.

## Complexity Tracking

| Addition | Why needed | Simpler alternative rejected |
|---|---|---|
| **`outcome` field on `escalation_advance`** | The device has no per-attempt *outcome* knowledge; A1–A4 and the screen chips are impossible without it. | A dedicated signal (Q1 option C) — rejected by owner: `escalation_advance` "already fires from a safe spot 006 proved out." Device-side inference — impossible (classification is server-side). |
| **3 new outcome half-clips (A1/A2/A3)** | Honest per-outcome audio needs the spoken halves. | Generic "no answer" for all — rejected: it is the exact dishonesty 007 exists to remove. |
| **Part-D narrator copy change** | Keep the third surface (history) coherent with the ratified spoken decline framing. | Leave the log saying "couldn't take the call" — rejected: reintroduces a two-surfaces-disagree failure (owner veto retained). |

## Phases / sequencing

0. **Gates.** Deck → v1.7 (copy authority, done at commit). **Captain sign-off of the delta-brief** (FR-006) →
   unblocks `[ENG]` tasks. **Internal screen mockup** (FR-014) → unblocks screen-code tasks.
1. **Copy + half-clips (backend).** `escalation_copy.py` v1.7 (`OUTCOME_HANDOFF_TMPL` + terminal variants);
   `render_signal_static.py` renders A1/A2/A3 halves (reuse 006 pipeline).
2. **`[ENG]` payload delta (gated on the delta-brief).** `pwa_sender` optional `outcome=`; populate outcome +
   `contact_first` at the ended/ack/decline emit sites (fire-and-forget, additive). Verify harness green + SC-005
   (sweep byte-identical on/off).
3. **Consumer 1 (app).** `SignalAudio` handoff slot → outcome branch + terminal variants + neutral fallback.
4. **Consumer 2 (app).** Mockup → react → build the per-contact screen mirror (channel-honest); universal
   audience (Q2).
5. **Coherence pass.** Part-D `log_narrator.py` line (owner veto); verify audio = screen = history for each
   outcome (SC-003).
6. **Verify to done.** Pixel outcome matrix (voicemail / text / declined / no-answer + terminal variants +
   missing-outcome fallback) + wifi-tablet screen parity + I.4 passenger proof + narrator coverage gate.

## Open items / dependencies

- **Captain delta-brief sign-off** (FR-006) — gates `[ENG]`; the one question is outcome-derivation at the
  ended-emit site (raw locals vs move-after-reconcile). Read-only; no engine-logic change either way.
- **Internal screen mockup** (FR-014) — gates screen-code tasks (Constitution III).
- **Decompose-vs-pre-render** for A1/A2/A3 halves — confirmed at `/tasks` (CC recommends decompose).
- **Part-D narrator wording** — owner veto retained at build.
- **008 wall** — do not touch the bridge TwiML wait-loop; never bundle with 008.
