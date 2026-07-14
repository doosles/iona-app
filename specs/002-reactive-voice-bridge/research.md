# Research: Reactive Voice Bridge

**Phase 0 output** | Feature: 002-reactive-voice-bridge | Date: 2026-06-23

All decisions below are settled — derived from hardware proof, prior sessions, and the
clarification session. No open items.

---

## D1 — Deliberate vs involuntary disconnect (FR-007 / FR-014)

**Decision**: Route on the `error` parameter of `onDisconnected(Call call, CallException error)` in TwilioVoicePlugin.java:
- `error == null` → contact-initiated end (conference ended cleanly). Treat as **resolved**. No further contacts attempted.
- `error != null` → involuntary drop (user-side network or SDK fault). Trigger **FR-014 recovery**: re-issue `connectOutbound()` to the same conference name once (30s timeout). If that reconnect errors or times out → continue to next contact in the ladder.

**Rationale**: The Twilio Voice Android SDK guarantees `error == null` for a clean session end and `error != null` for unexpected disconnections. This is the correct and minimal seam for the FR-007/FR-014 distinction — no extra signalling, no status-callback disambiguation.

**Edge case acknowledged**: If the contact's PSTN carrier drops involuntarily, Twilio ends the conference cleanly (contact is the anchor, `endConferenceOnExit=true`), and the user's SDK fires `onDisconnected(call, null)`. This is treated as a contact-initiated end (resolved). The person sees the terminal/next state. This is acceptable — the call ended, the system did not fail silently.

**Implementation touch**: Add `involuntary: true` flag to the `disconnected` event payload in `TwilioVoicePlugin.java` when `error != null`. The bridge engine in app.js checks `event.involuntary` to branch.

---

## D2 — Contact lookup (Option B — constitution §IV, binding)

**Decision**: `GET /bridge/contacts?member_airtable_id={id}` — backend reads the Airtable table, returns ordered list `[{index, name, phone}]`. The app reads `member_airtable_id` from Capacitor Preferences (written at login). No Memberstack API is called on the call path.

**Rationale**: Mandated by constitution §IV. Keeps the call path independent of Memberstack v1→v2 migration. The `member_airtable_id` is already in Preferences.

**Field IDs**: The existing backend uses field names (`"Contact One Mobile Number"` etc). The new endpoint MUST use Airtable field IDs (`fld…`) from config.py per §IV. Field IDs for the six contact phone fields and their corresponding name fields must be retrieved from the Airtable schema and added to config.py before the endpoint is built. This is Task 0.

**Entitlement enforcement**: The `/bridge/contacts` endpoint also verifies GA tier (checks the member's plan field in Airtable). Returns 403 if not entitled. Backend enforcement is the real gate; client-side check is UX only.

---

## D3 — Entitlement gating (layer on top, not woven through)

**Decision**: `summonHelp()` in app.js is the single summon entry point (FR-002). It runs four guards in order before firing the bridge engine:
1. Already in progress? → FR-015: show "already connecting" state, return.
2. No contacts configured? → visible "no contacts set up" message, return.
3. Not GA tier? → visible "available with Guardian Angel" message, return. (Client-side UX gate only — backend enforces.)
4. All clear → fire `bridgeEngine.start()`.

**The bridge engine has no awareness of plan/tier.** If the gate passes, the engine runs identically regardless of plan. New tier logic never touches the engine.

---

## D4 — IVR keypress sequence for contact leg

**Decision**: Two-step TwiML sequence on the contact's PSTN leg (extends the proven econtact IVR pattern already in the backend):

Step 1 — `/twiml/bridge-contact-prompt?conference_name=X`:
```xml
<Gather numDigits="1" action="/twiml/bridge-contact-confirm?conference_name=X" timeout="10">
    <Say voice="[Oran TTS voice]">Someone you care about needs you. Press any key to speak with them.</Say>
</Gather>
<Hangup/>
```

Step 2 — `/twiml/bridge-contact-confirm?conference_name=X` (on any digit):
```xml
<Dial><Conference endConferenceOnExit="true" beep="false">X</Conference></Dial>
```

On keypress timeout (10s): `<Hangup>` — the contact call ends, Twilio fires a status callback, the app engine advances to the next contact.

**Vocabulary note**: Prompt copy must not say "emergency", "alarm", "alert", or "care". Exact copy is a task; the phrase above is a placeholder only.

---

## D5 — Wait audio (Oran voice, conference waitUrl)

**Decision**: The conference `waitUrl` on the user leg points to `/twiml/wait-audio`. This endpoint returns TwiML that plays an Oran voice MP3 or TTS phrase in a loop. Content promises the attempt: "I'm trying to reach your contacts — please hold on." (placeholder; exact copy is a task subject to FR-013 and §II vocabulary).

**Fallback**: If the audio file is unreachable, the `waitUrl` returns TTS using the same Polly Neural voice already used in the backend — never silence.

**Existing extension**: `/twiml/conference` endpoint is extended to accept an optional `waitUrl` param; for bridge user-leg calls it is passed. Non-bridge calls (spike, existing) are unaffected (no waitUrl passed = no change).

---

## D6 — Conference naming

**Decision**: `bridge-{member_airtable_id}-{unix_timestamp_ms}`. Unique per attempt. Enables FR-014 reconnect — the same conference name is reused so the user re-joins the existing conference if the contact is still present.

---

## D7 — Max duration watchdog (FR-011)

**Decision**: `setTimeout` in the bridge engine at 240,000ms (4 minutes) from summon time. On fire: call `TwilioVoice.hangup()`, transition to `terminal_duration` state. EventLog: `BRIDGE_TERMINAL` with `reason: max_duration`. This cannot be blocked by any in-progress contact attempt.

---

## D8 — EventLog entries (observability — deferred from clarify, resolved here)

Every bridge state transition writes to the existing EventLog pattern. No blank fields.

| Event type | When it fires | Key fields |
|---|---|---|
| `BRIDGE_SUMMONED` | Guards pass, engine starts | trigger_source, member_airtable_id |
| `BRIDGE_DIALING` | connectOutbound() called | contact_index, conference_name |
| `BRIDGE_NO_ANSWER` | 30s ring timeout or no keypress | contact_index |
| `BRIDGE_KEYPRESS` | Contact pressed key, bridge connecting | contact_index |
| `BRIDGE_CONNECTED` | onConnected fires (user side) | contact_index |
| `BRIDGE_DROPPED` | onDisconnected(error != null) | error_message |
| `BRIDGE_RECONNECT` | FR-014 reconnect attempt started | contact_index |
| `BRIDGE_RECONNECT_FAILED` | Reconnect timed out or errored | contact_index |
| `BRIDGE_RESOLVED` | onDisconnected(null) — contact ended cleanly | contact_index, duration_s |
| `BRIDGE_TERMINAL` | All contacts exhausted or max duration | reason: exhausted\|max_duration |

---

## D9 — Orb trigger setting

**Decision**: New Preferences key `bridge_orb_trigger` (boolean, default false). New row in the Settings overlay: "Summon by tapping the orb" toggle. When true, the orb's tap handler calls `summonHelp()` after its existing animation. No change to orb visual or existing behaviour.
