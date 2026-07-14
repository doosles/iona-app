# Implementation Plan: Reactive Voice Bridge

**Branch**: `002-reactive-voice-bridge` | **Date**: 2026-06-23 | **Spec**: [spec.md](06%20Specs/002-reactive-voice-bridge/spec.md)

**Input**: Feature specification from `specs/002-reactive-voice-bridge/spec.md`

---

## Summary

A single tap fires a shared summon entry point, which runs a GA entitlement gate before handing off to the bridge engine. The engine cycles through the person's Airtable contacts (fetched via backend using `member_airtable_id` — Option B, §IV), dials each via PSTN into a Twilio conference, confirms live presence via IVR keypress, and connects the contact and person hands-free via the native Twilio Android SDK. The contact is the conference anchor (`endConferenceOnExit=true`); only a contact can end the call.

**This feature builds the bridge pass — the first rung of a two-pass reactive ladder.** When the bridge pass is exhausted or fails, the architecture hands off to the device pass (FR-016, dependency-gated — separate future feature). The max-duration watchdog (4 min) is shared across both passes. `terminal_exhausted` and `error` are designed as interim states — not hard dead-ends — so the hand-off can be added without architectural rework. All state transitions are logged to EventLog.

---

## Technical Context

**Language/Version**: Python 3.x (backend) · Java (Android native plugin) · JavaScript ES2020 (Capacitor web layer)

**Primary Dependencies**:
- Twilio Voice Android SDK v6.10.3 — existing, hardware-proven on Pixel 4a
- Twilio REST API — existing (`make_call`, `/twiml/conference`, `/inh-trigger`)
- Airtable REST API — existing (contact lookup, EventLog writes)
- Capacitor 3.x + Capacitor Preferences — existing
- `TwilioVoicePlugin.java` — existing, minor extension needed

**Storage**: Airtable (Contacts table, EventLog table) · Capacitor Preferences (`member_airtable_id`, `bridge_orb_trigger`)

**Testing**: Manual on physical Pixel 4a + real PSTN numbers (see quickstart.md)

**Target Platform**: Android 13+ (hands-free via native SDK only — system-dialler ruled out on hardware, §IV)

**Constraints**:
- Hands-free: native Twilio SDK only — no CALL_PHONE/ACTION_CALL path (§IV, proven 2026-06-23)
- Contact lookup: backend → Airtable only, never `currentMember.customFields` (§IV)
- Credentials: never hardcoded, all via config.py (§IV)
- Max attempt duration: 4 minutes (6 × 40s) enforced by client watchdog
- Per-contact timing: 30s ring timeout + 10s keypress window

**Scale/Scope**: Single-user per-attempt · up to 6 contacts · max 4 minutes per attempt

---

## Constitution Check

| Rule | Source | Status |
|---|---|---|
| Hands-free via native SDK only | §IV settled 2026-06-23 | ✅ PASS — no system-dialler anywhere in this plan |
| Contact lookup backend-from-Airtable (Option B) | §IV settled | ✅ PASS — `/bridge/contacts` endpoint; `member_airtable_id` from Preferences |
| Credentials never hardcoded | §IV | ✅ PASS — all keys via config.py |
| Promise attempt, never outcome | §I.3 | ✅ PASS — FR-013; Oran copy and terminal copy reviewed before ship |
| Reactive path fails loudly, never silently | §I.4 | ✅ PASS — FR-012, full EventLog, visible error for every failure |
| No banned vocabulary in user-facing copy | §II | ✅ PASS — no "emergency", "alert", "escalation", "check-in" in any copy string |
| Surgical edits over full regeneration | §III | ✅ PASS — extends existing plugin, endpoints, app.js; nothing rebuilt |
| Mockups precede UI code | §III | ⚠️ PENDING — bridge UI states must be mocked and reviewed before app.js implementation |
| Field IDs not field names | §IV | ✅ PASS — `/bridge/contacts` uses fld… IDs; field IDs must be in config.py (Task 0) |
| Gating as a layer, not woven through | §I settled | ✅ PASS — entitlement checked in `summonHelp()` guard, not in bridge engine |
| Stop at schema wall | §IV | ✅ PASS — field IDs retrieved from Airtable schema; no workarounds |

**Mockup gate**: Bridge UI states (summoning, in_call, terminal_exhausted, terminal_duration, error, already_connecting) require mockup review before implementation of app.js UI code. This is a hard gate, not advisory.

---

## Project Structure

### Documentation (this feature)

```text
specs/002-reactive-voice-bridge/
├── plan.md              ← this file
├── research.md          ← Phase 0: resolved decisions (D1–D9)
├── data-model.md        ← Phase 1: entities, state machine, FR-007/FR-014 routing
├── quickstart.md        ← Phase 1: 7 end-to-end validation scenarios
├── contracts/
│   ├── bridge-contacts.md          ← GET /bridge/contacts
│   ├── bridge-dial-contact.md      ← POST /bridge/dial-contact
│   ├── twiml-contact-prompt.md     ← GET /twiml/bridge-contact-prompt + confirm
│   └── twiml-wait-audio.md         ← GET /twiml/wait-audio (conference waitUrl)
└── tasks.md             ← Phase 2 (/speckit.tasks — not yet generated)
```

### Source code — what changes

```text
EXTEND (surgical edits only — never full regeneration):

android/app/src/main/java/com/iona/app/
  TwilioVoicePlugin.java
    · onDisconnected: add `involuntary: true` to event payload when error != null
    · No other Java changes needed

www/
  app.js
    · summonHelp() — shared summon entry point + 4-guard gate layer
    · BridgeEngine — state machine, contact ladder, FR-014, watchdog, EventLog writes
    · Orb trigger wiring (reads bridge_orb_trigger setting)
    · Bridge UI state updates (within existing today-screen — no new routes)

reply_to_airtable_webhook.py  (surgical — NEVER regenerate in full)
    · GET  /bridge/contacts              NEW route
    · POST /bridge/dial-contact          NEW route (extends _handle_inh_trigger pattern)
    · GET  /twiml/bridge-contact-prompt  NEW route (extends econtact IVR pattern)
    · GET  /twiml/bridge-contact-confirm NEW route
    · GET  /twiml/wait-audio             NEW route
    · _handle_twiml_conference: add optional waitUrl param for bridge user leg only

config.py / .env
    · 12 new Airtable field ID constants (6 contact name fld… + 6 contact phone fld…)
    · GA plan field ID constant

www/index.html (Settings overlay)
    · New toggle row: "Summon by tapping the orb"

NO CHANGES TO:
    TwilioFirebaseMsgService.java · MainActivity.java · AndroidManifest.xml
    build.gradle · ZeroCallPlugin.java (spike cleanup deferred)
```

---

## Phase 0: Architecture Decisions

*Full decision log: research.md. Key decisions summarised here for review.*

### FR-007 / FR-014 — Deliberate vs involuntary disconnect

The central routing decision. The Twilio SDK contract provides the seam:

```
onDisconnected(call, error)
    error == null  →  contact ended deliberately  →  RESOLVED (FR-007: only contact ends call)
    error != null  →  involuntary drop             →  FR-014 recovery
```

**FR-014 recovery sequence** (per-contact, bounded by max-duration watchdog):
1. `reconnectAttempted` is false → set true, re-issue `connectOutbound()` to same `conferenceId` (30s)
2. Reconnect succeeds → resume `in_call`
3. Reconnect times out or errors → advance `currentIndex`, continue ladder
4. `reconnectAttempted` resets when `currentIndex` advances

**What changes in Java**: One line in `callListener.onDisconnected` — add `data.put("involuntary", true)` when `error != null`. The bridge engine in app.js reads `event.involuntary` to branch. No status-callback disambiguation, no new Java methods.

**Edge case — accepted as designed, do not add disambiguation**: Contact's PSTN carrier drops involuntarily → Twilio ends conference cleanly (contact is anchor) → SDK fires `onDisconnected(null)`. Indistinguishable from deliberate hang-up at SDK level → treated as resolved. A contact's call dropping after they have connected is outside the product's responsibility — consistent with the product boundary (the product alerts and connects; what happens on the contact's side after connection is not the software's concern). Do NOT build call-duration tracking or any added complexity to chase this case.

---

### Option B contact lookup (§IV — binding)

```
summon → app reads member_airtable_id from Capacitor Preferences
       → GET /bridge/contacts?member_airtable_id={id}  (backend)
       → backend reads Airtable using fld… field IDs
       → returns [{index, name, phone}] (empty phone slots skipped)
       → engine holds list for duration of attempt
```

No Memberstack API on this path. `currentMember.customFields` never read. Memberstack v1→v2 migration cannot affect this.

Backend also enforces GA entitlement at this endpoint: 403 if not entitled. Client-side check in `summonHelp()` is UX only — backend 403 is the enforcement layer.

---

### Gating as a layer (§I settled)

`summonHelp(triggerSource)` is the single entry point for all trigger sources (FR-002). Four guards in order:

```
1. state !== 'idle'?          → FR-015: "already connecting" state, return
2. no contacts configured?    → visible message, return
3. member not GA?             → visible "available with Guardian Angel" message, return
4. all clear                  → bridgeEngine.start(contacts, conferenceId, triggerSource)
```

`bridgeEngine.start()` receives only a contact list, a conference ID, and a trigger source label (for EventLog). It has no knowledge of plan, tier, or entitlement. Changing gating logic in future never touches the engine. New trigger sources (orb, hardware button, BLE) call `summonHelp()` — they never call the engine directly (FR-002).

**Hand-off architecture (FR-016 — dependency-gated)**: When the engine reaches `terminal_exhausted` or `error`, it calls `bridgeEngine.onExhausted()` — a no-op placeholder in feature 002. This is the seam where the device-pass hand-off plugs in. When the device fallback feature is built, `onExhausted()` is replaced; the bridge engine itself does not change. `terminal_duration` is the one state that bypasses `onExhausted()` — it is the absolute ceiling for both passes combined and fires unconditionally.

---

### IVR keypress (contact leg TwiML sequence)

Extends the proven `_handle_twiml_econtact` pattern already in the backend:

```
/twiml/bridge-contact-prompt?conference_name=X&user_name={name}
    <Gather timeout="10" action="/twiml/bridge-contact-confirm?conference_name=X">
        <Say>[Oran prompt — COPY TASK — see constraint below]</Say>
    </Gather>
    <Hangup/>  ← timeout: no keypress = no-answer, engine advances

/twiml/bridge-contact-confirm?conference_name=X  (on any digit)
    <Conference endConferenceOnExit="true">X</Conference>  ← contact is anchor
```

**Prompt must state what acceptance means**: The prompt is not only a liveness check — it MUST tell the contact who is asking to connect (user by name) and that pressing the key accepts that connection. Frame as accepting the call from the user; do NOT frame as accepting responsibility for an outcome. Avoid banned vocabulary. Placeholder: "[User's name] has asked to reach you — press 1 to connect." Exact copy is a task before ship; governed by FR-013 + §II. The `user_name` param is passed by the bridge engine from the member's profile and injected into the TwiML `<Say>`.

The existing `/twiml/conference` endpoint handles the user leg unchanged, extended only to accept an optional `waitUrl` param pointing to `/twiml/wait-audio`.

---

## Phase 1: Design

### UI states

All bridge UI is within the existing today-screen. No new routes or screens.

| State | Person sees | Audio |
|---|---|---|
| `summoning` / `dialing` | "Reaching your contacts…" card | Oran voice (conference waitUrl) |
| `already_connecting` | "Already connecting — hold on" overlay | Oran audio continues |
| `in_call` | "You're connected — hands-free" card | Live call audio |
| `reconnecting` | "Reconnecting…" card | Brief gap |
| `terminal_exhausted` | [COPY TASK] calm "no one reached" message | — |
| `terminal_duration` | [COPY TASK] calm "no one reached" message | — |
| `resolved` | Natural return to idle | — |
| `error` | Visible error message — never silent | — |

**Mockup gate (§III — hard)**: These states must be reviewed as visual mockups before any app.js UI code is written.

### Copy tasks (not blocking plan — blocking ship)

Three copy strings are placeholders until written and reviewed:
1. Oran prompt to contact (FR-006) — currently: "Someone you know needs you. Press any key to speak with them."
2. Oran wait audio (FR-010) — currently: "I'm trying to reach your contacts. Please hold on."
3. Terminal message to person (FR-009) — must be calm, clear, no banned vocabulary

All three governed by FR-013 (promise attempt only) and §II (no "emergency", "alert", "care", "escalation").

### Orb trigger (FR-003)

New Settings row: "Summon by tapping the orb" · toggle · default OFF · stored as `bridge_orb_trigger` in Preferences. When ON: orb tap handler calls `summonHelp('orb')` after existing animation. Orb visual is unchanged.

### Observability (EventLog — every transition)

See research.md D8 for full event type table. Every state transition in the bridge engine writes one EventLog row. On write failure: retry once; if retry also fails, write to `console.error` — never silently dropped. A logging gap on a safety attempt contradicts "fail loudly, never silently." The bridge MUST continue regardless of logging outcome — a logging failure is never a call-blocking condition.

---

## Complexity Tracking

No constitution violations. The FR-007/FR-014 distinction uses the SDK's existing error-null contract — no added complexity. All new backend routes extend proven patterns. The bridge engine is a new JS state machine over existing primitives (connectOutbound, hangup, EventLog). No new dependencies, no schema workarounds, no new native plugins.
