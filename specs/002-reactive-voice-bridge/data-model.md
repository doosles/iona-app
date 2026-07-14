# Data Model: Reactive Voice Bridge

**Phase 1 output** | Feature: 002-reactive-voice-bridge | Date: 2026-06-23

---

## Entities

### BridgeAttempt (runtime — app.js in-memory)

Held in `bridgeEngine` for the lifecycle of one summon. Not persisted — EventLog is the durable record.

| Field | Type | Notes |
|---|---|---|
| `conferenceId` | string | `bridge-{member_airtable_id}-{ts_ms}` — unique per attempt |
| `state` | enum | See state machine below. `terminal_exhausted` and `error` are interim absorbing until FR-016 hand-off is built. |
| `contacts` | ContactEntry[] | Ordered list fetched from backend at summon time |
| `currentIndex` | int | 0-based index into contacts; advances on no-answer or FR-014 failure |
| `reconnectAttempted` | bool | True after one FR-014 reconnect has been issued for the current contact |
| `startTime` | timestamp | summon time — used for max-duration watchdog |
| `triggerSource` | string | `'help_control'` \| `'orb'` \| future values |

**State machine**:

```
idle
  → summoning          (summonHelp() guards pass)
  → already_connecting (summonHelp() called while non-idle)

summoning
  → dialing            (contacts fetched, connectOutbound() called)
  → error              (contact fetch fails, token fetch fails)

dialing
  → in_call            (onConnected fires)
  → dialing            (30s ring timeout or no keypress → advance to next contact)
  → terminal_exhausted (no next contact)
  → terminal_duration  (watchdog fires)
  → error              (connect failure)

in_call
  → resolved           (onDisconnected, error == null → contact ended deliberately)
  → reconnecting       (onDisconnected, error != null → involuntary drop)
  → terminal_duration  (watchdog fires mid-call)

reconnecting
  → in_call            (reconnect connectOutbound() succeeds)
  → dialing            (reconnect times out/fails → advance to next contact)
  → terminal_exhausted (no next contact)
  → terminal_duration  (watchdog fires during reconnect)

terminal_exhausted
  → device_pass_pending  (DEPENDENCY-GATED — FR-016; hand-off when device fallback feature built)
  [interim absorbing — calm "no one reached" message until FR-016 implemented]

terminal_duration      (absorbing — TRUE terminal; applies to full ladder; not dependency-gated)

resolved               (absorbing — contact ended deliberately, attempt over)

error
  → device_pass_pending  (DEPENDENCY-GATED — FR-016; hand-off when device fallback feature built)
  [interim absorbing — visible error message until FR-016 implemented]

device_pass_pending    (DEPENDENCY-GATED — placeholder; transitions defined in device fallback feature spec)
```

---

### ContactEntry (fetched from backend at summon time)

| Field | Type | Source |
|---|---|---|
| `index` | int | 0-based order position |
| `name` | string | Airtable contact name field |
| `phone` | string | Airtable contact phone field (fld… ID) |

Fetched once per attempt from `GET /bridge/contacts`. Not re-fetched mid-attempt.

---

### BridgeSettings (Capacitor Preferences — persisted)

| Key | Type | Default | Notes |
|---|---|---|---|
| `bridge_orb_trigger` | boolean | false | Orb as summon trigger (FR-003) |
| `member_airtable_id` | string | — | Written at login; read by bridge for contact lookup |

---

### EventLog entries (Airtable — durable record)

Each bridge event is a row in the existing EventLog table. Fields follow the existing EventLog schema. Key fields added/used:

| Field | Notes |
|---|---|
| `event_type` | One of the BRIDGE_* types from research.md D8 |
| `member_airtable_id` | Links event to person |
| `conference_id` | Links all events in one attempt |
| `contact_index` | Which contact was being attempted (where applicable) |
| `detail` | JSON blob: error message, duration, reason, trigger_source |

---

## State Transitions — FR-007 / FR-014 routing (key decision)

The single branch point that distinguishes deliberate contact end from involuntary drop:

```
onDisconnected(call, error)
    │
    ├─ error == null  ──→  state = 'resolved'
    │                      EventLog: BRIDGE_RESOLVED
    │                      Show: resolved UI (attempt ended, contact spoke to person)
    │
    └─ error != null  ──→  state = 'reconnecting'
                           EventLog: BRIDGE_DROPPED
                           if reconnectAttempted == false:
                               reconnectAttempted = true
                               connectOutbound() to same conferenceId
                               EventLog: BRIDGE_RECONNECT
                               (30s timeout → if fails → advance to next contact)
                           else:
                               advance to next contact (reconnect already used)
                               EventLog: BRIDGE_RECONNECT_FAILED
```

This is implemented entirely in app.js bridge engine. `TwilioVoicePlugin.java` adds `involuntary: true` to the disconnected event payload when `error != null` — no other Java changes needed.
