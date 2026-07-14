# Contract: GET /twiml/wait-audio

**Purpose**: TwiML served as the conference `waitUrl` — played to the user (person) while the system is attempting to reach contacts. Oran's voice. Must never be silent.

## Request

```
GET /twiml/wait-audio
```

No parameters required.

## Response — 200 OK, text/xml

Option A — hosted MP3 (preferred when recording exists):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Play loop="0">https://static.iona.today/audio/bridge-waiting.mp3</Play>
</Response>
```

Option B — TTS fallback (used until MP3 recording is produced):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="[Oran TTS voice]" loop="0">
        [COPY TASK — placeholder: "I'm trying to reach your contacts. Please hold on."]
    </Say>
</Response>
```

**`loop="0"`**: Twilio's `waitUrl` is re-fetched periodically, so a single loop is fine. `loop="0"` ensures continuous audio if fetched only once.

**Copy constraint**: Must promise the attempt, not the outcome (FR-013). No "emergency", "alarm", "alert", "escalation", "care". Exact copy is a separate task.

**Fallback rule**: If the MP3 URL is unreachable, the backend MUST serve TTS — silence is not an acceptable fallback (edge case from spec).

## Where this is referenced

The user leg in `/twiml/conference` is extended to include `waitUrl`:

```xml
<Conference startConferenceOnEnter="true"
            endConferenceOnExit="false"
            beep="false"
            waitUrl="{NGROK_BASE_URL}/twiml/wait-audio">
    {conference_name}
</Conference>
```

This is a surgical addition to the existing `_handle_twiml_conference` handler — only added when `leg=user` and `bridge=true` param is present, so existing spike/test calls are unaffected.
