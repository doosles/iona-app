# Implementation Plan: Choose How Help Reaches You

**Branch**: `004-escalation-mode-picker` | **Date**: 2026-07-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-escalation-mode-picker/spec.md`

## Summary

Add a calm, in-advance picker to the app's **Service** settings that lets a person choose how help
reaches them when they press for help — **"Iona reaches your people"** (the standard way; the service
calls/messages their contacts) or **"Hands-free voice"** (the live-voice bridge). The choice is stored
on the person's record; entitlement to hands-free is read live at press-time and **always wins over the
stored preference** (a stored hands-free choice with no live entitlement falls back to the standard way).

**Technical approach — extend, don't rebuild.** The existing press-help path already routes
`_startHelpSequence → summonHelp → GET /bridge/contacts`, and a **403 from that gate already falls
through to Iona escalation**. This feature moves the decision *into that same gate*: the gate now grants
the bridge only when `escalation_mode == "handsfree" AND hasHandsFree`, and returns 403 otherwise —
reusing the proven fall-through as the safety floor. The app's help-press path is therefore **unchanged**;
app work is confined to the settings picker, reading two new values off `/pwa-status`, and a new
preference-write endpoint that mirrors pause/restart.

## Technical Context

**Language/Version**: Python 3 (backend webhook + skills); JavaScript ES2017+ (Capacitor WebView app, no framework)

**Primary Dependencies**: Capacitor plugins (`Preferences`, `Browser`, `KeepAwake`, `TwilioVoice`); Airtable REST API v0; the existing `http.server` webhook (`reply_to_airtable_webhook.py`); Make.com (entitlement sync — **deferred precondition, not built here**)

**Storage**: Airtable **Table 1** — two NEW fields: `escalation_mode` (single-line text; app-written preference) and `handsfree_addon` (checkbox; Make-written entitlement). `escalation_mode`'s source of truth is Airtable — it is **not** mirrored into Capacitor Preferences (deliberate: keeps preference + entitlement co-located and the press-time read authoritative)

**Testing**: `node --check` (JS), `python3 -m py_compile` (Python) as push preconditions; **on-device verification on the Pixel** is the definition of "works" (per constitution / project memory — build+deploy alone is not "verified")

**Target Platform**: Android (Capacitor, Pixel 4a); night + day themes both shipped in feature 003

**Project Type**: Mobile app (Capacitor WebView, repo `/Users/Henry/iona-app`) + backend web-service (Python webhook, repo `/Users/Henry/.openclaw/workspace/howsu`). **Multi-repo feature.**

**Performance Goals**: No new press-time latency — the decision rides the existing `/bridge/contacts` round-trip; the picker state rides the existing `/pwa-status` call. Entitlement read stays **off the safety-critical path** (a single live Airtable field read inside the already-existing gate fetch, never a live Memberstack call)

**Constraints**: Reactive path must **fail loudly, never silently** (constitution I.4) — enforced server-side; help-press remains fully functional offline (device-dial floor untouched); the standard way is **never gated on an entitlement read** (unreadable entitlement → standard way)

**Scale/Scope**: Small. Backend: 2 handler edits + 1 new endpoint + 1 write helper + config constants. App: 1 settings card + `/pwa-status` capture + 1 write call + CSS. Docs: master-reference field/rule updates. No sweep engine, no billing.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| Principle | Status | Notes |
|---|---|---|
| I.1 Contact/escalation layer only — no health/case data | ✅ Pass | Stores only a delivery-method preference + an entitlement boolean. No health, no reasons. |
| I.2 Proactive & reactive both first-class | ✅ Pass | Pure reactive-path feature; proactive untouched. |
| I.3 Promise the attempt, not the outcome | ✅ Pass | Copy: "We call and message your contacts for you" / "Speak with someone…" — attempt language, no guaranteed answer. |
| I.4 Reactive path = higher reliability bar, fail loudly | ✅ Pass | Decision + fallback are **server-authoritative** in the gate; unreadable/lapsed entitlement → standard way; help-press path unchanged; device-dial offline floor intact. |
| I.5 Not elderly/medical framing | ✅ Pass | Neutral copy; no medical/institutional language. |
| I.6 Iona is a presence, name only (pronoun-free); Oran = escalation voice | ✅ Pass | UI label "Iona reaches your people" — name only, no pronoun. |
| I — SETTLED reactive gating (hands-free entitlement) | ✅ **Ratified 2026-07-01 (constitution 1.2.0 → 1.3.0)** | The rule was extended from "Guardian Angel only" to **Guardian Angel OR hands-free add-on**, owner-ratified as a MINOR amendment (gating principle unchanged; entitlement set gains the add-on path). No longer an open flag. See Complexity Tracking. |
| II Vocabulary — no "check-in", no care/welfare/alarm words in UI; no raw field values as labels | ✅ Pass | Spec bans "check-in" (FR-022); the stored values `escalation`/`handsfree` are **never shown** — UI shows "Iona reaches your people" / "Hands-free voice". |
| III Mockups precede code | ✅ Pass | `reactive_method_mockup_locked.html` is the authoritative UI source (owner-supplied); build binds to it. |
| III Surgical edits, stay in scope | ✅ Pass | Gate condition swap; additive handler/endpoint; no full-file regen; scope walls listed. |
| IV Credentials/IDs from config; **field IDs, not names**, for the data layer | ✅ Pass (with note) | New constants in `config.py`. The gate fetch uses `returnFieldsByFieldId=true` → reads new fields **by ID**. `/pwa-status` reads **by display name** (its existing mode) — a pre-existing per-handler inconsistency, carried, not introduced. |
| IV Stop at the schema wall | ✅ Pass | Two new Table 1 fields are **owner-created in the Airtable UI** (confirmed); plan does not code around them. |
| IV Contact/entitlement lookup = backend-from-Airtable, never client-from-Memberstack | ✅ Pass | `hasHandsFree` is read from Airtable Table 1, off the safety path — explicitly not a live Memberstack call. |
| IV Time-critical logic server/FCM-driven, never WebView `setTimeout` | ✅ Pass | The method decision is server-side in the gate; the optional client short-circuit was **declined** precisely to keep it so. |
| IV Validate before pushing; repo+working-copy together | ✅ Pass | `py_compile` + `node --check` gates; GitHub static-JS + workspace updated together per project rule. |

**Gate: PASS.** The one Section-I amendment (GA-only → GA-or-add-on) was **ratified by the owner on 2026-07-01** and the constitution bumped to **1.3.0**. No open governance items; no code violations; no gates blocked.

## Project Structure

### Documentation (this feature)

```text
specs/004-escalation-mode-picker/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions + rationale
├── data-model.md        # Phase 1 — the two new fields, values, entitlement computation
├── quickstart.md        # Phase 1 — end-to-end validation scenarios (on-device)
├── contracts/
│   └── reactive-method-endpoints.md   # Phase 1 — the 3 endpoint contracts
├── checklists/
│   └── requirements.md  # from /speckit.specify + /speckit.clarify (16/16)
└── tasks.md             # /speckit.tasks — NOT created by this command
```

### Source Code (real files, across two repos)

```text
# Backend — repo /Users/Henry/.openclaw/workspace/howsu
config.py
  + HANDSFREE_ADDON_FIELD_ID     (owner supplies fld… after creating the field)
  + ESCALATION_MODE_FIELD_ID     (owner supplies fld… after creating the field)
  + ESCALATION_MODE_FIELD_NAME  = "escalation_mode"     (for the /pwa-status name-read + PATCH body)
  + HANDSFREE_ADDON_FIELD_NAME  = "handsfree_addon"     (for the /pwa-status name-read)
  + ESCALATION_MODE_DEFAULT     = "escalation"
  + VALID_ESCALATION_MODES      = ("escalation", "handsfree")

reply_to_airtable_webhook.py   (SURGICAL — never full regen)
  ~ _handle_bridge_contacts  (:~1400) — swap the single GA condition for the
      escalation_mode + hasHandsFree gate; keep the 403 block + fall-through verbatim
  ~ _handle_pwa_status       (:~941)  — add hasHandsFree (bool) + escalationMode (string) to the return dict
  + do_POST routing          (:~565)  — add /pwa-escalation-mode to the POST group + dispatch
  + _handle_pwa_escalation_mode(body)  — mirror _handle_pwa_pause (lookup by fcm_token, validate, write)
  + update_table1_escalation_mode(rec, mode) — mirror update_table1_service_status (whitelist + PATCH by name)

skills/howsu_master_reference_v3_5.md
  ~ record escalation_mode as the 2nd app-writable Table 1 field (alongside `service status`)
  ~ record entitlement = (planName == GA) OR (handsfree_addon == true); document handsfree_addon field
  ~ document POST /pwa-escalation-mode + the extended /bridge/contacts gate + /pwa-status additions

# App — repo /Users/Henry/iona-app
www/index.html   — new "How help reaches you" card in the Service pane (data-tab="service", by #service-card)
www/style.css    — picker row/tile/radio/price-pill styles, bound to LIVE tokens (see mapping below)
www/app.js
  ~ readAndApplyServiceState() (:~961) — capture hasHandsFree + escalationMode; call _renderReactiveMethodPicker()
  + _renderReactiveMethodPicker()      — selected row from escalationMode (default escalation); entitled → radio + "Included"; not-entitled → price pill + #account deep-link
  + method-select handler              — POST /pwa-escalation-mode, then re-read /pwa-status and re-render
  (help-press path — _startHelpSequence / summonHelp — UNCHANGED)

reactive_method_mockup_locked.html  — authoritative UI source (owner to drop into repo root)
```

**Structure Decision**: No new modules or projects. Every change is an edit or small addition to files
that already own the relevant concern — the bridge gate, the PWA-status handler, the settings sheet. This
honours "the simple thing already exists" (constitution III) and keeps the reactive path's logic in one
server-side place.

**Live-token binding (confirmed against `www/style.css`; mockup hex NOT used as the source):**

| Mockup value | Live token to bind |
|---|---|
| sheet/card `#0C1C30` | `--surface` |
| tonal `rgba(255,255,255,.05)` | `--card` |
| teal `#34ECD9` | `--teal-glow` (identity `--teal` = `#25C9BA`) |
| amber `#E0973A` | `--amber-500` / `--signal-watch` |
| radii 16/12/10 | `--radius` (12px) + existing `.settings-card` radius |
| row title / subtitle size | `--fs-row-label` / `--fs-hint` (US6 — scale together) |
| icon tiles | reuse `.settings-card-tile` + `.settings-card-tile--amber` (+ a teal variant) |

Selected-row treatment (teal border + teal-soft fill) to match the existing active/selected pattern
(`.status-badge--active` uses `--teal-glow`) — confirm the exact selected treatment against the live
sheet during build, not from the mockup.

## Deferred preconditions (ship-gates — surfaced as dependencies, NOT build steps)

These block **going live for real money**, not the build. The feature is built and testable (with the
add-on field toggled by hand in Airtable) before these land.

1. **Hands-free add-on plan exists in Memberstack** — its `pln_…` / `prc_…` IDs added to the master reference.
2. **No Memberstack Plan-Logic rule auto-removes the main plan** when the add-on is added (dashboard config check — silently breaks the Beacon/tier gates if wrong).
3. **Make sync (scenario 1039536) writes `handsfree_addon` reliably in production** — swapping the real add-on plan ID into `contains(map(1.planConnections; active; planId; pln_handsfree-xxxx); true)`. A member who pays but whose unlock doesn't propagate is worse than a bug. **Do not build this now** — it is tied to precondition 1.
4. **Owner creates the two Table 1 fields** (`escalation_mode` single-line text, `handsfree_addon` checkbox) and supplies their `fld…` IDs so the `config.py` constants can be filled. (Schema wall — owner action, confirmed.)

## Scope walls (the plan must NOT expand into these)

- The proactive on/off toggle.
- The dashboard billing card / any billing or payment build (incl. the post-purchase "added, settling shortly" reassurance — that lives in the dashboard billing confirmation, per the clarify decision).
- The breadth-first sweep engine.
- The `/bridge/contacts`-only choke-point / IDOR hardening (existing deferred item).

## Complexity Tracking

*One governance amendment — now ratified. No code-complexity violations.*

| Item | Why needed | Resolution |
|---|---|---|
| **Section-I amendment: hands-free = "GA only" → "GA OR hands-free add-on"** | The feature's whole commercial purpose is to sell hands-free as an add-on to non-GA members; the entitlement gate must honour the add-on. Owner-authored in the FACTS. | **Ratified 2026-07-01 — constitution bumped 1.2.0 → 1.3.0 (MINOR).** The SETTLED reactive-gating block now records the two-path entitlement; the gating principle is unchanged. No open item. |

## Post-Design Constitution Re-Check

Re-evaluated after Phase 1 (data-model, contracts, quickstart): **no new violations introduced.** The
design keeps the method decision server-side (I.4 / IV), reads entitlement from Airtable not Memberstack
(IV), shows no raw field values or banned vocabulary (II), and touches only additive/surgical points. The
previously flagged Section-I amendment is now **ratified (constitution 1.3.0)** — no outstanding
governance or design items. Plan is clear to proceed to `/speckit.checklist` / `/speckit.tasks` on your go.
