# Data Model — 008 Failed-Join Backstop (Phase 1)

No Airtable schema change. No new tables, no new Table 1 fields. The model is: one state machine in
webhook process memory, one new event vocabulary in the (free-text, code-guarded) EventLog, and the
narrator rows that render it honestly.

## 1. The drop state machine (webhook process memory)

Keyed by `conference_name` (+ a per-drop `drop_instance` token so repeat drops after re-summon can
never cross-talk — the v5.28 run-token lesson applied locally).

```
ESTABLISHED ──participant-leave(member), contact connected──▶ WINDOW_OPEN (3.0s timer armed)
WINDOW_OPEN ──participant-join(member) inside 3s──▶ ESTABLISHED   (blip healed; timer cancelled;
                                                                   NOTHING announced, NOTHING logged
                                                                   member-facing; debug print only)
WINDOW_OPEN ──3.0s expiry──▶ DROP_DECLARED (one-shot)  = the boundary event, atomically:
                              • reconnect is dead (app told; wait-audio guard armed)
                              • contact leg redirected → drop announcement → <Hangup/> (= clean close)
                              • bridge_drop_declared push → person's truthful state
                              • EventLog terminal written (§2)
DROP_DECLARED ──any late member rejoin──▶ served truthful drop line + <Hangup/> (wait-audio guard;
                                          never the exhausted line, never a reaching loop)
```

**Guards consulted at WINDOW_OPEN entry** (all existing, WIRE): `_bridge_answered` (a contact is
genuinely connected — leaves during the reaching phase are out of scope and take today's paths);
`_bridge_terminal_fired` (a terminal already claimed this conference → no window).

**Precedence at the boundary vs other terminals**: DROP_DECLARED claims the existing
`_bridge_terminal_fired` one-shot, so the watchdog / exhausted / end-call sites all no-op after it —
one terminal per conference, same authority as today.

**Cleanup**: DROP_DECLARED triggers `_bridge_sweep_cleanup` + the press-1/flag hygiene identical to
the existing terminal sites; `_bridge_drop_declared` marker is GC'd with the sibling dicts.

## 2. EventLog vocabulary (free-text values + code-side guard — the established recipe)

Existing rows already on this surface (all currently app-written via `/bridge/log-event`, valid):
`BRIDGE_DROPPED`, `BRIDGE_RECONNECT`, `BRIDGE_RECONNECTED`, `BRIDGE_RECONNECT_FAILED`.

**Changes**:

| Row | Disposition |
|---|---|
| Blip healed inside window | **No EventLog row** (the healed blip is invisible by ruling). The app's existing `BRIDGE_DROPPED`/`BRIDGE_RECONNECTED` pair may still arrive (app-written); they remain valid audit churn, hidden from the member (narrator HIDE). |
| Boundary terminal | **Server-written** via the existing `BRIDGE_TERMINAL` log-event path with `detail.reason = "connection lost"` → Description carries the honest story ("call with {name} — connection lost"). Status value: **`Bridge Call Dropped`** — NEW, added to `event_logger.VALID_STATUS_VALUES` (code-side only, no Airtable change). |
| `BRIDGE_RECONNECT_FAILED` | Kept valid (historical rows) but the app path that wrote it retires with `_bridgeReconnectGaveUp`; no new writers. |

**Never**: the boundary terminal must not reuse the exhausted terminal's Status/Response/Description
shapes — FR-004 is enforced at the write site, and the narrator keeps any accidental reuse loud (a
gap fails the coverage gate rather than rendering the wrong story).

## 3. Narrator rows (`log_narrator.py` MATRIX — same commit as the vocabulary, no drift)

| (Type, Status) | Disposition | Member-facing rendering |
|---|---|---|
| Boundary terminal (`Bridge Call Dropped`) | SHOWN | Plain truth: the call with their contact happened and the connection was lost — exact copy from the signed deck; never exhausted language |
| Reconnect churn rows | HIDE | Attempt churn, same posture as `Call Not Placed`/`Call Failed` |

Coverage gate must report **0 gaps** after the additions (the v5.27+ standing bar).

## 4. Push payloads (contracts/drop-state-push.md)

One new data-only push type `bridge_drop_declared` (member-facing UI truth; not alarm-class —
`escalation_started` remains the only `ALARM_CLASS_TYPES` member). Idempotent on
`(conference_id, drop_instance)`.

## 5. Copy deck entries (escalation_copy.py — GATE-COPY, owner-ruled register)

- `CONTACT_DROP_LINE` — what the contact hears at the boundary (names the person; states the
  connection was lost; no instruction to hold, no promise).
- Person drop-state copy (card lead + sub) — truthful, calm, way-back = the existing help button;
  a well person reads it and does nothing.

Both lines are placeholders in code until the deck is signed; nothing ships unsigned (007 GATE-DECK
posture).
