# Contract: POST /bridge/dial-contact

**Purpose**: Dials a PSTN contact into the named conference. The contact's leg uses the IVR keypress prompt TwiML. Extends the proven `_handle_inh_trigger` pattern.

## Request

```
POST /bridge/dial-contact
Content-Type: application/x-www-form-urlencoded

conference_name={name}&contact_phone={e164}&contact_index={n}
```

| Param | Required | Notes |
|---|---|---|
| `conference_name` | Yes | Must match the conference the user leg is already in |
| `contact_phone` | Yes | E.164 format |
| `contact_index` | Yes | 0-based; logged to EventLog |

## Response — 200 OK

```json
{ "ok": true, "call_sid": "CA…", "contact_index": 0 }
```

## Response — 400 Bad Request

```json
{ "error": "missing_param", "param": "…" }
```

## Response — 502 Bad Gateway

```json
{ "error": "twilio_error", "status": 400, "detail": "…" }
```

Returned when the Twilio REST call fails.

## Twilio REST call issued by this endpoint

```
POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Calls.json
To:     {contact_phone}
From:   {TWILIO_FROM_NUMBER}
Url:    {NGROK_BASE_URL}/twiml/bridge-contact-prompt?conference_name={conference_name}
Method: GET
```

The `Url` points to the IVR keypress prompt (not directly to `/twiml/conference`), so the contact must press a key before entering the conference.
