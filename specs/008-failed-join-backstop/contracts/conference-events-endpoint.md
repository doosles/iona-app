# Contract — POST /bridge/conference-events (Twilio → webhook)

**New endpoint** on `reply_to_airtable_webhook.py` (port 8080, ngrok). Registered as the
`statusCallback` of the bridge `<Conference>`, minted by the shared conference-TwiML builder on BOTH
legs (only the creating leg's registration is honoured by Twilio — minting on both makes creation
order irrelevant). `statusCallbackEvent="join leave"` (start/end not required by this feature; if the
spike shows `end` is free and useful for the both-sides-gone edge, it may be added — one flag).

## Request (Twilio form-encoded POST)

Fields consumed (all others ignored):

| Field | Use |
|---|---|
| `StatusCallbackEvent` | `participant-join` \| `participant-leave` — the only two acted on |
| `FriendlyName` | The conference name (`bridge-<recId>-<epoch>`) — the state key. Non-`bridge-` names (svc-test etc.) are ignored outright |
| `ParticipantLabel` | `member` \| `contact-{i}` — primary leg identity (R2). If absent on the wire (spike fallback), `CallSid` vs `_bridge_active_contact_sids` is the belt |
| `CallSid` | Belt identity + logging |
| `ConferenceSid` | Logging / REST cross-checks only |

## Behaviour

- **Always respond `200` immediately** (Twilio requires fast ACK; all action is post-response, the
  StatusCallback handler pattern at `:3016` is the model).
- `participant-leave` + label `member` + `_bridge_answered[conf]` is true + no terminal fired →
  **arm the 3.0 s boundary timer** (state machine, data-model.md §1). Leaves during the reaching phase
  (no contact connected) are ignored — out of scope, existing behaviour owns them.
- `participant-join` + label `member` + a window is open → **cancel the timer** (blip healed, silent).
- `participant-leave` + label `contact-*` → **no drop behaviour ever** (SC-004). Logged for the spike's
  distinguishability evidence; the existing resolved path (SDK `disconnected(null)` on the member leg)
  remains the contact-hangup authority.
- Unknown conference / restart-orphaned events → log and drop (never guess; watchdog floor stands).

## Idempotency & races

- Timer arm/cancel is idempotent per `(conference, drop_instance)`; a duplicate leave never arms two
  timers; a join after expiry does NOT un-declare (the boundary is a one-way door — R4 guard owns the
  late rejoin).
- Boundary fire claims `_bridge_terminal_fired` (single terminal authority shared with all existing
  terminal sites).

## Security posture

Same as every existing Twilio-facing endpoint on this webhook: reachable via ngrok, no
X-Twilio-Signature validation yet — that is the standing pre-launch item and is NOT expanded or
resolved by this feature (no new data is exposed; the endpoint only mutates in-memory bridge state
keyed by conference names).
