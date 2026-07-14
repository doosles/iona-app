# Phase 1 Data Model — The outcome, everywhere

No persistent data model (no Airtable schema change). The "entities" here are the **transient signal** and its
**derived view state** — the one enriched field and how each surface renders it.

## Entity 1 — Enriched attempt-end signal (`escalation_advance`, `phase="ended"`)

The single source of truth both surfaces (and, in wording, the history) render. Extends the 006 payload with one
field.

| Field | Type | Origin | New in 007? |
|---|---|---|---|
| `type` | `"escalation_advance"` | constant | no |
| `contact_index` | int 0–5 | `econtact_index` | no |
| `sweep` | int | `sweep` | no |
| `channel` | `"call" \| "sms"` | dial-site local | no |
| `contact_first` | string | contact record (populated on ended emit) | **populated** (was `""`) |
| `run_token` | string | instance scope | no |
| `phase` | `"dialing" \| "ended"` | emit site | no |
| `attempt_seq` | int | builder | no |
| **`outcome`** | `"voicemail" \| "sms_sent" \| "declined" \| "no_answer" \| "acknowledged"` | derived (see map) | **NEW** |

Rules:
- `outcome` is **present only** on attempt-resolved signals (`phase="ended"` terminal, ack, decline). It is
  **absent** on `phase="dialing"` and on the `:4971` connect ring-stop emit (attempt not yet resolved).
- `outcome` is **optional / additive** — absent ⇒ consumers apply the neutral fallback (FR-010). 006 callers
  omit it and are byte-unchanged.
- The signal is **fire-and-forget**, data-only, not alarm-class; carries **no** escalation authority.

## Entity 2 — Outcome classification map (read-only source → wire value)

| Wire `outcome` | Existing classification read | Notes |
|---|---|---|
| `no_answer` | terminal `no-answer` / `Missed Call` (also `Call Not Placed`, `Call Failed`) | the A4 line (existing) |
| `voicemail` | `AnsweredBy machine_*` → `Voicemail Left` (`_reconcile_call_row`) | A1 |
| `sms_sent` | final-sweep SMS → `Alert Message` / `Message Sent` | A2 |
| `declined` | press-9 → `ECONTACT_DECLINED` / `Econtact Declined` | A3 — **distinct from `no_answer`** (FR-003) |
| `acknowledged` | press-1 → `ESCALATION_ACKNOWLEDGED` / `Call Answered` | terminal success (existing spoken terminal) |

All source Status values are already valid (no schema change). `RESOLVED_STATUSES` is the shared guard authority;
007 reads it, never mutates it.

## Entity 3 — Per-contact screen status (derived view state, app)

Rendered by the reused `setContactStatus` / `renderCallingScreen`, one per contact slot, from the same signal.

| State | Driven by | Display rule |
|---|---|---|
| pending | not yet dialed | neutral |
| active (call) | `phase="dialing"`, `channel="call"` | "N of M · ringing" |
| active (text) | `phase="dialing"`, `channel="sms"` | text-appropriate status — **never "ringing"** (FR-013) |
| resolved | `phase="ended"`, `outcome` | channel-honest resolved chip per outcome |
| unknown/lost | signal missing | keep prior state; never invent a resolution (FR-010) |

Ordering contract (carried from 006 §7): the app's per-attempt naming/rendering MUST follow the same
contact-slot order the list renders, so audio and screen can't name different people for the same slot.

## State transitions (one contact, one sweep)

```
pending ──dialing──▶ active(ringing|texting) ──ended+outcome──▶ resolved(outcome)
                                   │
                                   └── signal lost ─▶ stays active/unknown (no false resolution)
run acknowledged ─▶ terminal success (spoken "I've reached {name}…" + success chip)
```

## Coherence invariant (FR-015)

For any single attempt, `audio.outcome == screen.outcome == history.outcome` — enforced structurally because all
three render the one `outcome` value (history via the aligned narrator wording, FR-016).
