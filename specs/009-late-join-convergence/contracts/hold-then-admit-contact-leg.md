# Contract: hold-then-admit — the contact leg from press-1 to conversation

**Site**: `_handle_twiml_bridge_contact_confirm` (webhook :3958; TwiML currently at :4051 —
"Connecting you now." + Pause 3 + Dial/Conference). This contract replaces that TwiML's shape on
the hands-free path. Deck rules final copy (N2); Calls-API redirect is the admit/close primitive
(reuse — same mechanism as the existing terminal redirect).

## Sequence

| Step | Leg state | Spoken | Mechanism |
|---|---|---|---|
| press-1 | contact answered, NOT in room | **N2 pre-brief** (working copy: "Connecting you with [first name] now. If the connection drops, please follow up with [first name] — they've requested your help.") | TwiML `<Say>` then bounded hold (Pause/Redirect loop — exact shape per spike) |
| join-trigger sent | member placing leg | (member hears join announce locally) | data push, same instant as press-1 |
| member join event arrives | admit | — | redirect held leg → `<Dial><Conference endConferenceOnExit="true">` (anchor rule preserved) |
| OR boundary fires (8s provisional) | graceful close | **nothing** — the pre-brief was the coverage; the close is the cue | redirect held leg → `<Hangup/>`; failed-join push to member; engine already halted (press-1 halt stands) |

## Invariants

- Exactly one of {admit, close} per conference (structural one-shots, data-model §2).
- The contact is NEVER in the room before the member's join is confirmed, and NEVER held past the
  boundary — no silent indefinite room (Flag 1).
- No spoken line exists on the close path anywhere (Flag 2: no contact-side failed-join line).
- Press-9 decline, StatusCallback backstop, and watchdog behaviour outside this window: unchanged.
- Standard path: this contract never runs (mode arms the join layer at accept only — FR-018).
