# Phase 1 — Quickstart / Validation Guide: Choose How Help Reaches You

End-to-end validation scenarios that prove the feature works. "Works" = **observed on the physical Pixel**
(screencap/logcat/tap), never build-deploy or server-side-only. Backend checks can be curl'd directly.

## Prerequisites

- Two new Table 1 fields exist (owner-created): `escalation_mode` (single-line text), `handsfree_addon`
  (checkbox). Their `fld…` IDs are in `config.py`.
- Servers up (`run_servers.sh`): webhook (8080) + ngrok; app installed on the Pixel from `www/`.
- A test member record with a known `fcm_token` + `member_airtable_id` and at least one emergency contact.
- Syntax gates pass: `python3 -m py_compile reply_to_airtable_webhook.py config.py` and
  `node --check www/app.js`.

## Backend contract checks (curl — no device needed)

1. **/pwa-status carries the new fields**
   `POST /pwa-status {fcm_token}` → response includes `hasHandsFree` and `escalationMode`. With the record's
   `escalation_mode` blank → `escalationMode: "escalation"`. With `planName="Guardian Angel"` OR
   `handsfree_addon=true` → `hasHandsFree: true`.

2. **Preference write round-trips**
   `POST /pwa-escalation-mode {fcm_token, escalation_mode:"handsfree"}` → `200 {ok:true}`; Airtable
   `escalation_mode` now `handsfree`. Repeat with an invalid value (`"foo"`) → no write, clean reject
   (no 5xx), field unchanged.

3. **Gate — entitlement × preference matrix** (`GET /bridge/contacts?member_airtable_id=…`)
   | `escalation_mode` | entitled (`GA` or `addon`)? | Expected |
   |---|---|---|
   | `handsfree` | yes | `200` contacts array (bridge granted) |
   | `handsfree` | no  | `403` (→ escalation) |
   | `escalation` / blank | yes | `403` `not_chosen` (→ escalation) |
   | `escalation` / blank | no  | `403` (→ escalation) |

4. **Fail-safe**: point the gate at an unreadable/non-existent record → non-200; confirm the app path lands
   on device-dial floor → escalation (never a bridge grant).

## On-device scenarios (the definition of done)

Maps to spec user stories / acceptance scenarios.

- **US1 — entitled picks** (entitled record): open Settings → Service. See "How help reaches you" with two
  rows; exactly one selected. Tap **Hands-free voice** → radio moves, `/pwa-escalation-mode` fires, re-read
  re-renders it selected. Close + reopen Settings → still selected (persistence). Press **I NEED HELP** →
  the **bridge** runs. Switch back to **Iona reaches your people** → press → **Iona escalation** runs.

- **US2 — always reached / entitlement wins** (record with `escalation_mode=handsfree`, then set
  `handsfree_addon=false` + non-GA `planName`): press **I NEED HELP** → reached the **standard way**
  (escalation), no error, no dead-end. (Simulates lapse / not-yet-propagated.)

- **US3 — invitation** (not-entitled record): open Settings → Service. Standard way selected; hands-free row
  shows the **price pill** ("Add £[placeholder]") in the **same row geometry** (no layout shift vs. the
  entitled view). Tap it → dashboard **#account** opens via `Browser.open`. Press **I NEED HELP** at any
  time → standard way; never a mid-press choice.

- **US default (OQ-1)** (fresh record, `escalation_mode` blank): Settings shows the **standard way**
  selected by default; nothing reads as "help off".

- **Gaining entitlement (OQ-2)**: with the standard way selected, flip `handsfree_addon` → true and reopen
  Settings: the hands-free row becomes **selectable** but the selection is **unchanged** (still standard)
  until explicitly picked.

- **Accessibility (FR-023)**: change the text-size stepper (003/US6) → the picker row title/subtitle
  **scale**; the safety buttons + chrome do **not**. Check in both night and day themes.

## Regression guards (must stay true)

- Help-press path (`_startHelpSequence` / `summonHelp`) behaves exactly as before for a `handsfree`+entitled
  member (bridge) and any non-granted member (escalation) — no new flashes beyond the already-managed
  summoning→escalation transition.
- Pause/restart, Beacon Service-tab gate (003), orb, device-dial floor, and the offline path are untouched.
- `escalation_mode` is written **only** by the app endpoint; `handsfree_addon` **only** by Make.
