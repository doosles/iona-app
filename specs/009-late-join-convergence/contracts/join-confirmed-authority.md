# Contract: /bridge/conference-events — observation → join authority

**Direction**: Twilio → webhook (POST, form-encoded). **Exists today** as 008 Stage-0
logging-only (`_handle_bridge_conference_events` :3026); this contract is its promotion.

## Inbound (already wired at both live mint sites + svc-test for the spike)

| Field | Use |
|---|---|
| `StatusCallbackEvent` | `participant-join` / `participant-leave` (subscribed: "join leave") |
| `FriendlyName` | conference_name — the correlation key |
| `ParticipantLabel` | `member` / `contact-{i}` — leg identity minted at TwiML time, carried by the event (no inference) |
| `CallSid`, `SequenceNumber`, `Timestamp`, `ReasonParticipantLeft` | latency/reliability logging (R8) + diagnostics |

## Behaviour after promotion (gated on spike verdict + captain ruling)

1. Always fast-200 first (Twilio requirement) — processing after, as today.
2. `participant-join` + `ParticipantLabel == "member"` + conference has a held contact →
   one-shot `member_join_confirmed`; cancel the boundary timer; ADMIT the held contact
   (Calls-API redirect of `hold_contact_call_sid` into the conference); send join-confirmed push.
3. `participant-leave` handling beyond logging is OUT OF SCOPE for 009's join phase (post-join
   drop remains 008's shipped territory) — any temptation to infer state from leave events is
   refused: positive-event-only governs joins; leaves stay diagnostic.
4. Unknown conference / no held contact / duplicate event → log-and-ignore (idempotent; one-shot
   guards make replays harmless).

## Invariants

- No consumer may treat press-1, an app claim, or a REST participant poll as "joined" once this
  authority lands (R4). The event is the single source; its absence NEVER proves absence.
- All state touched is the in-memory hold state (data-model §2) — single-worker boundary (R0.6).
