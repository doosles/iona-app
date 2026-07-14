# Contract: join-phase FCM pushes (webhook → app)

All data-only + `android:{priority:"high"}` via `pwa_sender.send_bridge_data_push` (the proven
backgrounded-delivery shape; NOT alarm-class — `escalation_started` remains the only
`ALARM_CLASS_TYPES` member). Names indicative; finalised at build with a grep gate proving no
consumer still reads the legacy press-1 `bridge_contact_joined` meaning (R5).

| Push (type) | Fired at | Payload | App contract |
|---|---|---|---|
| `bridge_join_trigger` | press-1 (with N2/hold start) | conference_name, contact first name, contact index | enter `join_pending`: place member leg (`connectOutbound`, live site :2694 machinery), speak join announce (N1/existing connect line). MUST NOT: set everConnected, arm 9/10-min cap, settle chip ✓ |
| `bridge_join_confirmed` | member participant-join observed + contact admitted | conference_name, contact first name | enter `joined`: everConnected=true; arm connect-anchored 9/10-min timers; chip ✓ settle; 007 settle-freeze |
| `bridge_join_failed` | 8s boundary fire (provisional) | conference_name, contact first name | enter `join_failed`: render 008-shell failed-join card + speak N5 from per-contact clip cache (zero fetch) |

## Invariants

- `everConnected` and the duration cap key ONLY off `bridge_join_confirmed` — never off press-1
  (the facts-file re-derivation directive, executed).
- Push loss degrades honestly: the server-side boundary + hold state are authoritative; a lost
  `join_confirmed` push leaves the app in `join_pending` with a live conversation audible (the
  conversation IS the signal) — flag at build for a reconcile read if the spike shows push loss.
- Standard path receives none of these (FR-018).
