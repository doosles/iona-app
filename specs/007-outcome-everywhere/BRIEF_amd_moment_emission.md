# Delta-brief — AMD-moment emission (GATE-ENG-2) — READ-ONLY, awaiting captain sign-off

**Feature**: 007 respec (attempt-anchored narration) · **Created**: 2026-07-13 · **Status**: ⛔ unsigned
**Scope**: ONE new passenger emission so Oran can announce an answerphone **in the moment** (deck L4,
FR-020). Same review posture as the signed GATE-ENG delta-brief (BRIEF_outcome_field_escalation_advance.md).

## What

At the econtact AMD branch — `_handle_twiml_econtact` in `reply_to_airtable_webhook.py` (the
`AnsweredBy machine_*` branch, ~:4256; the site where sync AMD verdicts arrive on the TwiML fetch,
live-verified run `fda93e4e`, v5.31) — emit:

```python
send_escalation_advance(table1_record_id, econtact_index, sweep, "call", contact_first,
                        run_token, phase="amd", outcome="voicemail")
```

The app speaks L4 ("{name}'s phone has gone to answerphone — I'm leaving a message now.") at arrival and
marks the attempt's resolution narrated (the later outcome-bearing `ended` merges silently; L5 is the
lost-signal fallback only).

## Why it is safe (the questions the captain will ask)

1. **Passenger**: fire-and-forget on a thread — the TwiML response (the voicemail message TwiML Twilio is
   waiting for) is built and returned exactly as today; the emission never sits on that path's latency.
   Zero state writes; no EventLog row; no guard/flag touched.
2. **Identity is already at the site**: `econtact_index`, `sweep`, `run_token`, and the contact name ride
   the TwiML URL params (v5.28 run-token plumbing + `first_name` param) — no Airtable read on the hot path.
3. **No classification added**: `machine_*` is the SAME verdict the branch already acts on (it chooses the
   voicemail TwiML). The emission reports the branch taken; it derives nothing new. If the call later fails
   mid-message, the terminal `ended` still carries the `classify_call_status` truth (one authority,
   unchanged); the app then adds no contradictory line (spec edge row — silence over contradiction).
4. **Additive on the wire**: `phase="amd"` is a new value on the existing `escalation_advance` payload;
   006 consumers ignore unknown phases (reducer falls through to dialing handling — the app change R005
   adds the explicit branch BEFORE this emission is enabled; sequencing note below).
5. **Not alarm-class**: rides `send_bridge_data_push` data-only high-priority like every other advance;
   `escalation_started` remains the only ALARM_CLASS_TYPES member.
6. **Bridge untouched**: `_handle_twiml_econtact` is the Signal/escalation econtact mouth; no bridge TwiML
   path is edited (008 wall).

## Sequencing

R005 (app reducer understands `phase="amd"`) deploys in the SAME pass as this emission (single R008
deploy). An old app receiving `amd` before updating: `_saApply` routes unknown-phase to `_saOnDialing`,
which would re-begin the attempt — **mitigation**: gate the emission behind the same deploy (webhook
restart and app install happen together in R008; pre-launch, owner's test device only).

## One open question for the captain

Emit for the **member-leg** AMD too (`_handle_twiml_call`'s machine branch — scheduled-contact voicemails)?
**CC recommendation: NO** — 007's scope is escalation narration; the member-leg voicemail has no listening
member surface. Flagged so the wall is explicit, not accidental.


---

## ✅ CAPTAIN SIGN-OFF — GATE-ENG-2 — 2026-07-13

**Signed.** The emission is a clean passenger: fire-and-forget off the TwiML latency path; identity from
existing URL params (no hot-path Airtable read); reports the branch the engine already took (`machine_*` →
voicemail TwiML) — derives nothing new; additive `phase="amd"` on the existing payload; not alarm-class;
bridge untouched (008 wall). The one-authority rule holds: the terminal `ended` still carries the
`classify_call_status` truth, and the app adds no contradictory line (deck Part E).

**Sequencing condition (as briefed, now binding):** the emission goes live ONLY in the same R008 deploy as
the app's `phase="amd"` reducer branch (R005) — never enabled against an app that routes unknown phases to
dialing. Pre-launch, owner's test device only.

**Ruling on the open question: NO member-leg AMD emission.** 007's scope is escalation narration to a
listening member; a scheduled-contact (member-leg) voicemail has no listening surface — an emission there
would be traffic with no consumer. The scope wall is explicit and ruled.

Build order R001→R009 is unblocked. — Captain


---

## CAPTAIN AMENDMENT — post-build ratification — 2026-07-13

**Delta from the signed brief, flagged by CC at R004 and RATIFIED:** the brief asserted attempt identity
(`econtact_index`, `sweep`) already rode the econtact TwiML URL params; on the live wire only `t1id` +
`run_token` did. Fix: `make_call` (`send_via_twilio.py`) gained **additive** `econtact_index`/`sweep`/`run_ts`
URL params — same safety posture as briefed (no Airtable read on the hot path, no reordering, params read only
by our own handler), but a `send_via_twilio.py` touch the brief did not name. Ratified post-build; the signed
scope now includes this touch. Lesson noted: "identity is already at the site" claims in future briefs get
verified against the live wire, not the plumbing docs. — Captain