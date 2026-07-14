# Contract — `escalation_advance` outcome field (backend → device)

**Interface**: the fire-and-forget data-only FCM `escalation_advance`, produced by
`pwa_sender.build_escalation_advance_payload` / `send_escalation_advance` and consumed by the app's `SignalAudio`
driver and screen mirror.

## Producer (backend)

- **Signature change** (additive, back-compatible):
  - `build_escalation_advance_payload(contact_index, sweep, channel, contact_first, run_token="", phase="dialing", outcome=None)`
  - `send_escalation_advance(table1_record_id, contact_index, sweep, channel, contact_first, run_token="", phase="dialing", outcome=None)`
- `outcome=None` ⇒ the `outcome` key is **omitted** from the payload (byte-identical to 006 for existing callers).
- **Populated only** on attempt-resolved emits: the `phase="ended"` terminal emit (`reply_to_airtable_webhook.py`
  `:4987`), the ack terminal (press-1), the decline terminal (press-9), and the SMS branch (`:5507`). Each also
  populates `contact_first` (the ended terminal currently passes `""`).
- **Not populated** on `phase="dialing"` or the `:4971` connect ring-stop emit.
- **Values** (closed set): `"voicemail" | "sms_sent" | "declined" | "no_answer" | "acknowledged"`.
- **Derivation**: read-only from existing classification (see `data-model.md` Entity 2 and the delta-brief). No
  Airtable read on the hot path; no state write; fire-and-forget/threaded.

## Consumer (app)

- **MUST** treat a missing/unknown `outcome` as the neutral fallback (audio: non-false handoff bed, never silent;
  screen: keep prior state) — FR-010.
- **MUST** map `outcome` → the deck line (audio) and the resolved chip (screen) exactly:
  | `outcome` | Audio (→ next / terminal variant) | Screen chip |
  |---|---|---|
  | `voicemail` | "I've left {prev} a voicemail — trying {next} now." / "…a voicemail." | voicemail-left |
  | `sms_sent` | "I've sent {prev} a text — trying {next} now." / "…a text." | text-sent |
  | `declined` | "{prev} is currently unable to assist — trying {next} now." / "…unable to assist." | unable-to-assist |
  | `no_answer` | "There's no answer from {prev} — trying {next} now." / "…from {prev}." | no-answer |
  | `acknowledged` | existing spoken terminal ("I've reached {name}…") | success |
- Audio consumption is **Signal-method only** (FR-017); screen consumption is **universal** (Q2).

## Compatibility & invariants

- **Additive**: no field removed or retyped; 006 behaviour on `phase="dialing"` and ring-stop is unchanged.
- **Passenger**: the emission never blocks/delays/alters the sweep; harness stays green; SC-005 (sweep
  byte-identical on/off) is the regression gate.
- **Honesty**: `outcome` reflects an **observed delivery outcome** only (FR-009); `declined` is never derived
  from a call terminal status (FR-003).
