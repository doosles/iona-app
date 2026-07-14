# Contract: GET /bridge/contacts

**Purpose**: Fetch the person's ordered nominated contact list from Airtable. Verifies GA entitlement. Called once at summon time by the bridge engine.

## Request

```
GET /bridge/contacts?member_airtable_id={airtable_record_id}
```

| Param | Required | Notes |
|---|---|---|
| `member_airtable_id` | Yes | The person's Airtable record ID (from Capacitor Preferences) |

## Response — 200 OK

```json
{
  "contacts": [
    { "index": 0, "name": "Sarah", "phone": "+447700900001" },
    { "index": 1, "name": "James", "phone": "+447700900002" }
  ]
}
```

Only contacts with a non-empty phone number are returned. Ordered by index ascending (contact one first).

## Response — 403 Forbidden

```json
{ "error": "not_entitled", "message": "Bridge requires Guardian Angel plan" }
```

Returned when the member's Airtable record does not carry GA entitlement.

## Response — 404 Not Found

```json
{ "error": "not_found" }
```

Returned when `member_airtable_id` does not match any record.

## Response — 400 Bad Request

```json
{ "error": "missing_param", "param": "member_airtable_id" }
```

## Backend implementation notes

- Uses Airtable field IDs (fld…) for all contact name and phone fields — field names MUST NOT be used (§IV)
- Field IDs for 6 contact name fields and 6 contact phone fields must be in config.py before implementation
- Entitlement check: read plan field from the member's record; if not GA, return 403
- Empty phone fields are skipped silently — a person with 3 contacts returns 3 entries, not 6
