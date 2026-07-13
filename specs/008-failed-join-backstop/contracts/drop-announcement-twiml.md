# Contract — /twiml/bridge-drop-announcement (contact-leg boundary TwiML)

**New TwiML route** served when the boundary event redirects the contact's leg (Calls-API redirect of
the tracked contact SID — the same primitive as the member terminal, `:3660–3670`).

## Response shape (mirrors the proven terminal pacing, `:3697–3703`)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Pause length="1"/>
    <Say voice="Polly.Arthur-Neural">{CONTACT_DROP_LINE — signed deck, names the person}</Say>
    <Pause length="2"/>
    <Hangup/>
</Response>
```

- **The `<Hangup/>` IS the clean close**: the contact is the anchor (`endConferenceOnExit="true"`,
  wire-confirmed), so their leg ending ends the conference. No separate teardown call exists or is
  needed (R5).
- Voice = Arthur (Oran) — matches every other contact-facing bridge line (no voice switch).
- Copy constraints: states the connection to the person was lost; never "please hold", never
  "reconnecting", never exhausted-cycle language, no banned vocabulary (Constitution II). Line text is
  owner-gated (GATE-COPY) — the route ships with the signed constant from `escalation_copy.py`, never
  a hardcoded string.
- XML-escape the person's name via the existing `xml_name()` helper (user-derived text).

## Failure posture

- Redirect returns 404/error (contact already gone — both-sides-gone edge): swallow, write the
  EventLog terminal anyway, still push the person's truthful state (R5 edge).
- The route itself erroring must never strand the contact worse than today: any exception serves a
  bare `<Hangup/>` (close without the line beats an open dead room — announcement is best-effort,
  close is mandatory; FR-003/FR-008 rank the close above the words).
