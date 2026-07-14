# Contract: GET /twiml/bridge-contact-prompt

**Purpose**: TwiML served to the contact's incoming PSTN leg. Plays an Oran voice prompt and waits up to 10 seconds for a keypress. On any keypress, redirects to confirm endpoint which joins the conference. On timeout, hangs up (system treats as no-answer, moves to next contact).

## Request

```
GET /twiml/bridge-contact-prompt?conference_name={name}&user_name={display_name}
```

| Param | Required | Notes |
|---|---|---|
| `conference_name` | Yes | Conference to join on keypress |
| `user_name` | Yes | Person's display name — injected into the prompt so the contact knows who is calling |

## Response — 200 OK, text/xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather numDigits="1"
            action="/twiml/bridge-contact-confirm?conference_name={conference_name}"
            method="GET"
            timeout="10">
        <Say voice="[Oran TTS voice]">
            [COPY TASK — placeholder: "Someone you know needs you. Press any key to speak with them."]
        </Say>
    </Gather>
    <Hangup/>
</Response>
```

**Copy constraint — prompt must state what acceptance means**: The prompt is not only a liveness check. It MUST tell the contact: (a) who is asking to connect (the user, by name), and (b) that pressing the key accepts that connection. This gives the contact context before being bridged to a distressed person, and reinforces that the contact is the responder — the software connects; the contact accepts.

Frame it as accepting the connection / call from the user. Do NOT frame it as accepting responsibility for an outcome — that would overpromise on the contact's behalf. Avoid all banned vocabulary ("emergency", "alert", "care", etc.) and do not imply a guaranteed result.

Acceptable placeholder shape: "[User's name] has asked to reach you — press 1 to connect."

Exact copy is a separate task, subject to FR-013 and §II vocabulary rules, to be written and reviewed before ship. Delivered in Oran's voice.

**Oran TTS voice**: The specific Polly Neural voice representing Oran on this path is a task — placeholder uses `Polly.Amy-Neural` (existing backend pattern) until determined.

---

# Contract: GET /twiml/bridge-contact-confirm

**Purpose**: Called by Twilio after the contact presses a key. Joins the contact into the named conference as the anchor leg.

## Request

```
GET /twiml/bridge-contact-confirm?conference_name={name}
```

## Response — 200 OK, text/xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Dial>
        <Conference endConferenceOnExit="true" beep="false">{conference_name}</Conference>
    </Dial>
</Response>
```

`endConferenceOnExit="true"` on the contact leg is the anchor. When the contact hangs up, the conference ends, the user's WebRTC call fires `onDisconnected(null)` — interpreted as resolved (FR-007).
