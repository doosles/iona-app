# Contract — live "calling your contacts" screen mirror (app UI)

**Interface**: the per-contact live status on the *calling your contacts* screen, rendered by the reused
`setContactStatus` / `renderCallingScreen`, driven by the same `escalation_advance` signal (see
`escalation_advance_outcome.md`).

## Behaviour

- Renders **one status per contact slot**, in the **same order** the contact list renders (ordering contract,
  006 §7) — audio and screen must never name different people for the same slot.
- **Active state is channel-honest** (FR-013):
  - `channel="call"` → a call-appropriate live status (e.g. "N of M · ringing").
  - `channel="sms"` → a text-appropriate status; **MUST NOT** display "ringing" or any call-only state.
- **Resolved state** (on `phase="ended"` + `outcome`): the channel-honest resolved chip per the map in
  `escalation_advance_outcome.md`.
- **Missing/lost signal**: keep the prior chip state; **never** invent a resolution (FR-010).

## Audience

- **Everyone** who sees the calling screen — Signal and hands-free members (Q2, resolved 2026-07-12).
- For hands-free members in the 007→008 interim the screen is honest while their audio is unchanged — permitted
  (the screen states more; the audio states nothing false).

## Gate

- **Internal mockup → react → build** before any screen code (Constitution III; FR-014; US2 #4). This contract
  describes the behaviour the mockup must realise; it is not a licence to skip the mockup.

## Invariants

- Read-only visual — no method/entitlement change, no effect on the safety floor.
- Coherent by construction with the audio and the history (all render the one `outcome`; FR-015).
