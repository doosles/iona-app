# Phase 1 — Data Model: Choose How Help Reaches You

The spec's abstract entities bound to concrete storage. No new tables; two new Airtable **Table 1** fields.
Field `fld…` IDs are supplied by the owner after the fields are created in the Airtable UI (schema wall).

## Fields (Airtable Table 1)

### `escalation_mode` — the person's chosen way (the "Help-delivery choice" entity)

| Property | Value |
|---|---|
| Airtable type | Single-line text (no schema options — the VALID_* code guard governs values) |
| Valid values | `escalation` \| `handsfree` |
| Default (unset/blank) | `escalation` (the standard way — the universal floor; never assume `handsfree` from a blank) |
| Written by | **App only**, via `POST /pwa-escalation-mode` → webhook → `update_table1_escalation_mode()` (guarded PATCH by field name). Never written by Make. |
| Read by | Gate (`/bridge/contacts`, by field ID) at press-time; `/pwa-status` (by display name) for the settings render |
| Surfaced to user? | **No.** The raw value is never shown — UI shows "Iona reaches your people" / "Hands-free voice" |
| config.py | `ESCALATION_MODE_FIELD_ID` (gate read) · `ESCALATION_MODE_FIELD_NAME = "escalation_mode"` (status read + PATCH body) · `ESCALATION_MODE_DEFAULT = "escalation"` · `VALID_ESCALATION_MODES = ("escalation", "handsfree")` |

**Lifecycle / transitions**
- Unset → (person picks in settings) → `escalation` or `handsfree`.
- Any → any, only by an explicit user selection in the picker. Selecting `handsfree` is only offered when
  `hasHandsFree` is true.
- Gaining entitlement does **not** transition the value (D8 / spec OQ-2).
- Losing entitlement does **not** transition the value either — the value may remain `handsfree`, but the
  press-time gate overrides it to the standard way (see the entitlement rule below). Preference is an
  *intent*, never an entitlement.

### `handsfree_addon` — the add-on entitlement flag

| Property | Value |
|---|---|
| Airtable type | Checkbox (boolean) |
| Written by | **Make sync only** (scenario 1039536), from Memberstack. Never app-written. |
| Read by | Gate (`/bridge/contacts`, by field ID); `/pwa-status` (by display name) to compute `hasHandsFree` |
| config.py | `HANDSFREE_ADDON_FIELD_ID` (gate read) · `HANDSFREE_ADDON_FIELD_NAME = "handsfree_addon"` (status read) |
| Precondition | Populated in production only once the add-on plan exists + the sync expression carries the real plan ID (deferred ship-gate) |

### `planName` (existing — `fldaVi8xhesZkidHB`) — UNCHANGED

Left exactly as-is; still carries the main plan for the Beacon/tier + GA gates. The add-on is a **separate**
field, never squeezed through `planName` (avoids the `planConnections[].planName` array-collapse risk).

## Derived value: `hasHandsFree` (the "Hands-free entitlement (current)" entity)

```
hasHandsFree = (planName == GUARDIAN_ANGEL_PLAN_VALUE) OR (handsfree_addon == true)
```

- A **live yes/no**, computed at read time. No stored "pending" state — a just-purchased-but-not-yet-synced
  member simply reads `false` until Make sets the flag (spec: propagation window covered by the fallback,
  not a UI state).
- Computed in two places: the gate (field-ID reads) and `/pwa-status` (name reads → returned as
  `hasHandsFree`).

## The load-bearing rule: entitlement overrides preference (press-time)

Evaluated server-side in the `/bridge/contacts` gate:

```
mode = escalation_mode or "escalation"           # blank → standard
grant_bridge = (mode == "handsfree") AND hasHandsFree
if not grant_bridge:  → 403  → app falls through to Iona escalation (the standard way)
```

- `mode == "handsfree"` but `hasHandsFree == false` → 403 → standard way (covers lapse, downgrade, sync
  drift, paid-but-not-propagated).
- Entitlement unreadable (Airtable non-200/error) → existing 502/error path → device-dial floor → Iona
  escalation. The standard way is never gated on a successful entitlement read.

## Client-side render state (not persisted on device)

`readAndApplyServiceState()` captures, per `/pwa-status` response:
- `hasHandsFree` (bool) — drives selectable-vs-invitation on the hands-free row.
- `escalationMode` (string, default `escalation`) — drives which row shows selected.

Neither is written to Capacitor Preferences (source of truth is Airtable). This differs from `orb_button` /
`device_dial_passes` (pure UI prefs with no safety role) — deliberate, per D3.
