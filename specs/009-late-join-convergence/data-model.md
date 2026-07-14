# 009 Data Model — join-phase states, server hold state, push + log vocabulary

Phase 1 output, 2026-07-14. Every value below is marked **[doc]** (asserted from design) or
**[spike]** (must be confirmed/moved by the spike before build). No Airtable schema change; any
EventLog values are free-text via the code-side `VALID_*` guard.

## 1. Reducer join-phase states (extend the ONE machine — R-009-6)

The 006/007 SignalAudio reducer gains join-phase states; no second machine. Reaching-phase states
are untouched and mode-blind.

| State | Entered on | Audio | Chips/screen | Exits to |
|---|---|---|---|---|
| `join_pending` | join-trigger push (contact pressed 1) | join announce (N1 or existing connect line) — atomic clip | accepted contact chip → connecting; others frozen honest | `joined` (join-confirmed push) · `join_failed` (failed-join push) |
| `joined` | join-confirmed push | silence — the conversation IS the audio | accepted chip ✓ settled; live-conversation state; 007 settle-freeze | conversation end (existing paths) · `dropped` (008 territory) |
| `join_failed` | failed-join push (server 8s boundary [spike]) | N5 card line — local clip, offline-safe | 008 dropped-card shell, failed-join copy-variant; way-back live | idle via re-press (fresh episode) |
| `dropped` | existing 008 drop detection (post-`joined` only) | N4 spoken line — local clip, offline-safe | R-008-5 card (unchanged in substance) | idle via re-press |

Notes: `join_pending`/`joined`/`join_failed`/`dropped` are **states only a live-call episode can
enter** (mode-only states, not a second path — FR-018e). Standard path never receives the pushes
that enter them. `sa_sim.js` grows one cell per state transition [doc].

## 2. Server hold state (in-memory, single-worker boundary — R0.6)

Keyed by `conference_name`, garbage-collected at terminal/instance boundary exactly like the
existing `_bridge_*` dicts:

| Field | Set at | Cleared at | Purpose |
|---|---|---|---|
| `hold_contact_call_sid` | press-1 | admit / boundary fire / teardown | the leg to admit or gracefully close |
| `join_boundary_timer` | press-1 (8s [spike]) | join event (cancel) / fire (one-shot) | the ONE boundary (R3) |
| `member_join_confirmed` | participant-join(member) event | teardown | one-shot join predicate (R1) |
| `admit_fired` / `boundary_fired` | their events | teardown | structural exactly-once (no admit-then-close double) |

## 3. Push vocabulary (all data-only + high via `send_bridge_data_push`)

| Push | Fired at | Carries | App effect |
|---|---|---|---|
| join-trigger | press-1 | conference_name, contact name/index | place member leg (`connectOutbound`), speak join announce, enter `join_pending`. MUST NOT set everConnected/arm cap/flip chips [doc — R5] |
| join-confirmed | member join event observed + contact admitted | conference_name, contact name | enter `joined`: everConnected=true, arm 9/10-min timers, settle chip ✓ |
| failed-join | 8s boundary fire | conference_name, contact name | enter `join_failed`: render + speak N5 card |

Exact field names at build; shapes in contracts/join-phase-pushes.md. The legacy press-1-time
`bridge_contact_joined` push is retired/renamed by the split (R5) — no consumer may be left
reading the old meaning [doc; grep-gated at build].

## 4. Clips (one pipeline — R6)

Per-contact named-clip set grows by 2: `failed_join` (N5, name-bearing per working copy) and
`dropped` (N4 — spoken-name question is an owner deck ruling). Cache serves BOTH modes
(exclusion deleted). Zero fetch at play time for either card [doc; SC-006].

## 5. EventLog + narrator (howsu side)

Candidate rows [doc — confirm at build against the existing vocabulary before adding ANY value]:
- Failed join: reuse the existing escalation/bridge terminal row shape with an honest Description
  ("contact accepted; member device could not join within window"); whether this needs a NEW
  Status value or rides an existing one is resolved against `VALID_STATUS_VALUES` at build — new
  values follow the 4-step recipe (register guard + master ref §5 + narrator MATRIX row + live
  verify, 0-gaps gate).
- Join-confirmed: the existing connected/answered row semantics move to the event moment (R5) —
  timestamps become honest; no new vocabulary expected.

## 6. Spike-owned numbers

| Number | Provisional | Evidence source |
|---|---|---|
| Failed-join window | 8s from press-1 | latency distribution, wifi + cellular, multi-run (R0.3) |
| Pre-brief line length | ~6s (working copy) | must cover trigger→join p50 comfortably; deck + spike inform each other |
| Event arrival reliability | — | R8 delivery-path honesty log (ngrok) |
