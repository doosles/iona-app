# Phase 1 — Endpoint Contracts: Choose How Help Reaches You

Three backend touch-points in `reply_to_airtable_webhook.py`. Two are **extensions** of existing endpoints
(additive/surgical); one is **new** (mirrors pause/restart). Base: the app calls the webhook via
`NGROK_BASE` (bridge/gate) and `STATUS_BASE` (`/pwa-status`), as today.

---

## 1. `GET /bridge/contacts` — EXTENDED (the entitlement + preference gate)

The press-time decision point. Behaviour outside the gate condition is unchanged.

**Request**: `GET /bridge/contacts?member_airtable_id=rec…` (unchanged)

**Gate logic (the only change)** — after the existing `returnFieldsByFieldId=true` fetch:

```
plan_name = fields.get(MEMBER_PLAN_NAME_FIELD_ID, "")
addon     = bool(fields.get(HANDSFREE_ADDON_FIELD_ID, False))
has_hands_free = (plan_name == GUARDIAN_ANGEL_PLAN_VALUE) or addon
mode      = fields.get(ESCALATION_MODE_FIELD_ID, "") or ESCALATION_MODE_DEFAULT

if not (mode == "handsfree" and has_hands_free):
    → 403  {"error": "not_entitled" | "not_chosen", "message": …}
else:
    → 200  [ {index, name, phone}, … ]   # unchanged contact array
```

- Reason code: `not_chosen` when `mode != "handsfree"`; `not_entitled` when `mode == "handsfree"` but not
  entitled. (Informational only — the app treats any 403 identically: fall through to Iona escalation.)
- **App contract unchanged**: `summonHelp` already maps 403 → `return false` → escalation fall-through
  (`app.js:2150`). No app edit on this endpoint.
- Error/unreadable (non-200 from Airtable): existing 502 path → app device-dial floor → escalation.

**Responses**: `200` contacts array · `403` not granted (→ escalation) · `400` missing param · `404`
not found · `502` Airtable error (→ floor). All pre-existing shapes.

---

## 2. `POST /pwa-status` — EXTENDED (what the app learns for the picker)

**Request** (unchanged): `{ "fcm_token": "…" }`

**Response** — two fields added:

```json
{
  "service_status": "Active" | "Paused",
  "active_message": "… or null",
  "planName": "Guardian Angel" | "Beacon" | "",
  "hasHandsFree": true | false,
  "escalationMode": "escalation" | "handsfree"
}
```

- `hasHandsFree` = `(planName == GUARDIAN_ANGEL_PLAN_VALUE) OR bool(handsfree_addon)`, both read by display
  name (this handler's existing mode).
- `escalationMode` = `fields.get("escalation_mode") or "escalation"` (blank → standard).
- All existing keys unchanged (003 Beacon gate keeps reading `planName`).
- Failure/unknown record: return the existing fail-safe dict plus `"hasHandsFree": false,
  "escalationMode": "escalation"` (fail toward the standard way, controls safe).

**App contract**: `readAndApplyServiceState()` captures both, then `_renderReactiveMethodPicker()`.

---

## 3. `POST /pwa-escalation-mode` — NEW (the preference write)

Mirrors `/pwa-pause` / `/pwa-restart` exactly (routing group, threaded apply-then-return).

**Request**: `{ "fcm_token": "…", "escalation_mode": "escalation" | "handsfree" }`

**Handler** `_handle_pwa_escalation_mode(body)`:
1. `fcm_token` present? else no-op.
2. `escalation_mode ∈ VALID_ESCALATION_MODES`? else reject (no write) — the VALID_* guard.
3. `record = _lookup_by_fcm_token(fcm_token)`; else no-op.
4. `update_table1_escalation_mode(record_id, escalation_mode)` → guarded PATCH of `escalation_mode` **by
   field name** (mirrors `update_table1_service_status`).
5. Optional: `log_event(event_type="PWA", status="Reactive method changed", …)`.
6. Apply-then-return: write, then respond 200 `{ "ok": true, "escalation_mode": "…" }`.

**Guard (`update_table1_escalation_mode`)**:
```
if mode not in VALID_ESCALATION_MODES:  return False   # never PATCH an invalid value
PATCH {BASE}/{TABLE_1}/{rec}  {"fields": {ESCALATION_MODE_FIELD_NAME: mode}}
```

**Responses**: `200 {ok:true}` on success · `200 {ok:false}`/no-op on missing/invalid (never 5xx for a bad
value — reject cleanly). The picker is not on the safety path; the press-time gate reads the live stored
value regardless.

**App contract**: on radio-select of a way, `POST /pwa-escalation-mode`, then **re-read `/pwa-status` and
re-render** (constitution IV — every save refetches). Selecting `handsfree` is only possible when
`hasHandsFree` is true (otherwise that row is the price-pill invitation, which deep-links to `#account`,
not a radio).

---

## Routing (do_POST)

Add `/pwa-escalation-mode` to the existing POST group alongside `/pwa-pause`, `/pwa-restart`,
`/pwa-status` (`reply_to_airtable_webhook.py:~565`), and dispatch to `_handle_pwa_escalation_mode` in the
same apply-then-return style used for pause/restart (`:~676`–`710`).
