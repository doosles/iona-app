# Contract: Service status read (consumed by the app)

**Purpose**: Give the app the member's TRUE proactive service state so the settings indicator, the Today paused banner, and the orb rings reflect reality — never a hardcoded "Active" (FR-004).

**Endpoint**: existing howsu webhook `POST /pwa-status` (already returns service status; reused — not new). Backend repo: `reply_to_airtable_webhook.py`.

**Auth/identity**: existing pattern (FCM token / member identity as today). No change.

**Request** (as today):
```json
{ "fcm_token": "<token>" }
```

**Response** (existing shape — unchanged):
```json
{
  "service_status": "Active" | "Paused",
  "active_message": "<string|null>"
}
```

**App consumption**:
- Called on **settings-sheet open** AND **Today-screen load**.
- `service_status == "Paused"` → show paused banner + amber rings + paused indicator.
- `service_status == "Active"` → no banner + teal rings.
- **Failure / timeout / offline** → indeterminate UI; MUST NOT render "Active". "I need help" remains live regardless.
- Time-boxed and fire-safe: must never block or delay launch (consistent with the existing offline-safe launch pattern).

**Resume action**: tapping the paused banner calls the existing restart path (`/pwa-restart`); the result must be reflected honestly (no optimistic "resumed" if the backend didn't confirm).

**Out of scope**: the app never writes service status except via the existing pause/restart actions; no new write contract.
