# Contract — bridge_drop_declared (webhook → app FCM data push)

**New data-only push type** sent by the boundary event via the existing
`pwa_sender.send_bridge_data_push` (data-only + `android:{priority:"high"}` — the shape proven to
reach a backgrounded app). **Not alarm-class**: `escalation_started` remains the only
`ALARM_CLASS_TYPES` member; a drop terminal is a truth update, not a wake-the-house moment.

## Payload

```json
{
  "type": "bridge_drop_declared",
  "conference_id": "bridge-<recId>-<epoch>",
  "drop_instance": "<per-drop token>",
  "contact_first": "<connected contact's first name — for the truthful card copy>"
}
```

## App behaviour on receipt (`www/app.js` push handler, both handler sites)

1. **Abandon any in-flight rejoin** for this `conference_id` immediately (the reconnect is dead — the
   boundary already fired; a rejoin succeeding after this push would be the contradiction the ruling
   forbids). Tear down the local call attempt without entering `_bridgeReconnectGaveUp` (retired).
2. Show the **truthful drop-state card** (signed copy: the call with `{contact_first}` happened; the
   connection was lost; the way back is the existing help button). NEVER `terminal_exhausted`, never
   its copy.
3. Idempotent on `(conference_id, drop_instance)` — duplicate delivery renders once.
4. `escalation_state` → `idle` (the way back must be a clean, ordinary re-summon — FR-005; nothing
   kept alive in the background).

## Lost-push posture (belt)

The push is best-effort. If it never arrives (killed app / Doze): the person's device was dropped
anyway — on next open/rejoin, truth is served server-side (the wait-audio drop-declared guard serves
the truthful line + hangup to a late rejoin, R4) and the app's cold-open reconcile converges to idle
via the existing `/pwa-escalation-live` authority. No path falls back to the exhausted card for a
connected-then-dropped call (SC-003).
