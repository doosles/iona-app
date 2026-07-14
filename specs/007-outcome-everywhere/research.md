# Phase 0 Research — The outcome, everywhere

All Technical-Context unknowns resolved. This feature extends proven 006 infrastructure, so most "research" is
confirming the existing shape rather than choosing new technology.

## D1 — Attachment point for the enriched outcome (spec Q1)

- **Decision**: Extend the existing `escalation_advance` signal — add an `outcome` field to its already-firing
  `phase="ended"` emission (`reply_to_airtable_webhook.py:4987`) plus the ack/decline terminals.
- **Rationale**: Owner ruling 2026-07-12 — *"it already fires from a safe spot 006 proved out."* Confirmed in
  code: the `phase="ended"` emit exists, is fire-and-forget, and fires at attempt-end after the terminal filter.
  No new emission, no dial-site touch → the lightest possible engine surface, and the app already has the
  handler + per-contact plumbing.
- **Alternatives considered**: (B) enrich terminal `escalation_complete` — rejected: it is a single run-terminal
  signal, not per-attempt, so it can't carry *between-attempt* outcomes. (C) a dedicated attempt-end signal —
  rejected by owner: more new surface to build/sync for no gain over the proven `escalation_advance`.

## D2 — Outcome derivation source

- **Decision**: Derive `outcome` **read-only** from existing classification — `RESOLVED_STATUSES` (`:4853`),
  `_reconcile_call_row` (voicemail/no-answer/answered), `ECONTACT_DECLINED` (`:182`, press-9),
  `ESCALATION_ACKNOWLEDGED` (press-1), and the SMS branch Status. Mapping in `data-model.md`.
- **Rationale**: The classification already exists, is guarded (v5.31, verified on-device 12 Jul), and every
  target Status is already a valid value — so 007 adds **no** classification/sweep/timing/terminal logic (FR-002)
  and **no** Airtable schema change.
- **Alternatives considered**: Recompute outcome device-side — impossible (classification is server-side). Add a
  new Status — unnecessary (all values already valid) and would hit the schema-wall discipline for no reason.
- **Open (delta-brief, captain)**: derive at `:4987` from raw `(call_status, answered_by)` vs move the emit
  after `_reconcile_call_row` — both read-only, sweep byte-unchanged. See
  `BRIEF_outcome_field_escalation_advance.md`.

## D3 — `declined` distinct from `no_answer` (FR-003)

- **Decision**: Carry `declined` as its own value on the wire; never collapse into `no_answer`.
- **Rationale**: The classifier already separates them (press-9 `ECONTACT_DECLINED` / `Econtact Declined` at
  `:3257` vs no-answer `Missed Call`), so the only requirement is that the signal **preserves** the distinction —
  otherwise the A3 decline line cannot fire (deck Part C).
- **Alternatives considered**: Reuse `no_answer` for both — rejected: defeats the feature's honesty purpose.

## D4 — Outcome half-clip generation (A1/A2/A3)

- **Decision**: Reuse the 006 per-contact clip pipeline; **decompose** each outcome line into a per-contact
  first half ("I've left {prev} a voicemail" / "I've sent {prev} a text" / "{prev} is currently unable to
  assist") + the shared "— trying {next} now" tail the 006 handoff already produces. `no_answer` (A4) reuses the
  existing handoff clip unchanged.
- **Rationale**: Per-contact scale is N, not N²; the tail is already generated; mirrors 006's ruling (plan §3).
  Zero clip fetch at escalation time (generated at contact-save / app-start).
- **Alternatives considered**: Pre-render adjacent-pair clips — more faithful to a single sentence but N²
  clips; deferred as the fallback if decompose seams sound wrong on-device. Final decompose-vs-pre-render call
  confirmed at `/tasks`.

## D5 — Screen-mirror audience (spec Q2)

- **Decision**: Show the live calling-screen mirror to **everyone** (Signal + hands-free).
- **Rationale**: Owner ruling 2026-07-12. The screen is a read-only visual with no method/entitlement effect;
  hands-free members get an honest visual in the 007→008 interim while their audio is unchanged — consistent
  with the owner's interim-honesty ruling (the screen says more; the audio says nothing false).
- **Alternatives considered**: Signal-only (matches the audio audience) — rejected by owner in favour of the
  broader honest surface. Audio outcome lines remain Signal-only (FR-017); only the screen is universal.

## D6 — History coherence (deck Part D, FR-016)

- **Decision**: Align `log_narrator.py` `Econtact Declined` rows from *"{name} couldn't take the call"* →
  *"{name} was unable to assist"* in the same coherence pass. Copy-only, same keys, coverage gate unaffected.
- **Rationale**: With A3 ratified as "currently unable to assist," the spoken line and the written history would
  otherwise disagree — the exact failure 007 exists to remove (FR-015). Past tense in history vs present in live
  audio is correct.
- **Alternatives considered**: Keep "couldn't take the call" — retained as the **owner veto at build** option
  (deck author's call is to do it; owner had no preference).
