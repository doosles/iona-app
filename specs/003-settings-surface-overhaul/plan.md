# Implementation Plan: Settings Surface Overhaul

**Branch**: `003-settings-surface-overhaul` | **Date**: 2026-06-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-settings-surface-overhaul/spec.md`

## Summary

Restructure the in-app settings bottom sheet into three tabs (Service · Appearance · Account); make a paused service impossible to misread (true `service_status` read on open + a persistent tappable Today-screen banner + the orb's rings driven by `service_status`); remove the "keep trying" control and lock the safe device-dial cycle; add a sign-out confirm; and add appearance preferences (theme Night/Day, text-size steps, font-set) — which requires tokenising the currently-hardcoded colours, the scaled-text font-sizes, and the UI font-family in `style.css`.

> **Scope change (owner, this session):** `has_proactive` and the proactive on/off toggle were withdrawn as overcomplication (US3 removed). The surface keys off `service_status` only. The `has_proactive` additions were reverted from the howsu webhook.

Technical approach: vanilla JS + Capacitor Preferences for all controls (copying the proven `orb_button` pattern), CSS custom-property tokenisation in `style.css` (no framework, no new dependency). The only backend dependency is the **existing** `service_status` read from `/pwa-status` (no new backend signal, no Memberstack).

## Technical Context

**Language/Version**: JavaScript (vanilla, Capacitor 8 WebView), CSS3 (custom properties), HTML5. One backend touch in Python 3.9 (howsu `reply_to_airtable_webhook.py`).

**Primary Dependencies**: Capacitor `@capacitor/preferences` (persist prefs), `@capacitor/browser` (existing dashboard deep-links). No new dependencies. Builds against the app's own `style.css` (NOT `iona.css`).

**Storage**: Capacitor Preferences (device-local) for appearance prefs + existing toggles. Service state (`service_status`) is **read-only** from the backend (Airtable Table 1 via the webhook), never written by the app.

**Testing**: Manual on-device (Pixel 4a / Android 13) against the spec's Independent Tests + quickstart; `node --check www/app.js` and visual verification for each theme/text-size/font step. No unit-test framework exists in the app (consistent with 001/002).

**Target Platform**: Android (Capacitor WebView). Smallest supported screen drives the largest-text-step overflow check.

**Project Type**: Mobile app (Capacitor). The only backend touch is the **existing** `/pwa-status` read (howsu repo) — no new backend code.

**Performance Goals**: Appearance prefs applied **before first paint** on launch (no flash of default). The `service_status` read is time-boxed and offline-safe — it must never delay or block launch.

**Constraints**: Never assert "Active" when the true state is unconfirmed (offline/slow). "I need help" stays fully live in every state. Tokenisation must be done as **scoped, reviewed edits — never a global `sed`** (constitution §IV).

**Scale/Scope**: One app surface (settings sheet) + Today screen banner/orb; ~120 colour usages, a font-size subset (message + menu text), and 27 UI font-family refs to tokenise in one `style.css`; one new backend flag.

## Constitution Check

*GATE: re-checked after Phase 1 design — PASS.*

| Principle | Status | Note |
|---|---|---|
| I.1 Contact/escalation layer only — no health/case data | ✅ | Service state is operational only (active/paused). No reasons, no health data introduced. |
| I.2 Proactive & reactive both first-class | ✅ | Feature clarifies the two layers (rings teach core=reactive / rings=proactive) without subordinating either. |
| I.4 Reactive path fails loud, never silent | ✅ | The whole point: true-state read, persistent (non-toast) banner, help-always-live, resume reports real result. |
| I.6 Iona pronoun-free; Oran = alerts only | ✅ | FR-023; copy review in Phase 1. |
| II Forbidden vocabulary | ✅ | FR-022 binds the **full** constitution list (incl. emergency/alert/failed/crisis/care/welfare/support + jargon). "Paused"/"Resume" sanctioned. |
| III Mockups precede code | ✅ | Mockups for the tabbed sheet, adapted Service tab, paused Today banner exist (this session) — the visual reference. |
| III Simplicity / stay in scope | ⚠️→✅ | Tokenisation is large but **required by the appearance stories and explicitly in scope**; no framework added. Sized in Complexity Tracking. |
| IV Backend-from-Airtable, not client-from-Memberstack | ✅ | `service_status` is a backend/Airtable read; **no Memberstack plan-reading** (has_proactive withdrawn). |
| IV Credentials from config; field IDs not names | ✅ | Backend signal reuses existing config + Airtable field-ID conventions. |
| IV **Never global-replace across files** | ⚠️ | Tokenisation touches ~120 colour sites — MUST be done as scoped, reviewed passes, NOT `sed -i`. Called out in Complexity Tracking + Phase 0 D1. |
| IV Validate before push (`node --check`) | ✅ | Precondition per change. |
| IV Time-critical logic server/FCM-driven, not WebView setTimeout | ✅ | Nothing here is background-time-critical; status read is foreground UI catch-up. |

No violations requiring justification beyond the tokenisation size + the no-global-sed discipline (tracked below).

## Project Structure

### Documentation (this feature)

```text
specs/003-settings-surface-overhaul/
├── spec.md              # complete
├── plan.md              # this file
├── research.md          # Phase 0 — decisions (D1–D12)
├── data-model.md        # Phase 1 — preferences, signals, state
├── contracts/           # Phase 1 — backend read the app consumes
│   └── service-status.md
├── quickstart.md        # Phase 1 — validation walkthrough
└── tasks.md             # Phase 2 — created by /tasks (NOT here)
```

### Source code — what changes

App (`/Users/Henry/iona-app/`):
```text
www/index.html   # #settings-overlay → 3 tab panes (Service/Appearance/Account);
                 # Today-screen paused banner element; (orb markup already present)
www/app.js       # settings handler (tabs; new theme/text-size/font prefs via Preferences);
                 # true service_status read on open + Today load; resume action; orb ring re-gate
                 # to service_status; remove keep-trying handler; hardcode device_dial_passes='keep';
                 # sign-out confirm step
www/style.css    # tokenisation: ~120 colours → vars (both :root + body.light);
                 # scaled-text font-sizes → scale token; UI font-family → --font-ui;
                 # tab-pane + paused-banner styles; orb ring colour driven by a state class
```

Backend (howsu, `reply_to_airtable_webhook.py`): **no new code** — the existing `/pwa-status`
already returns `service_status` (Active/Paused), verified this session. (`has_proactive` was
withdrawn and reverted.)

**Structure Decision**: App-only UI feature on the existing Capacitor structure (`www/`), plus one additive, read-only field on an existing backend endpoint. No new modules, no new dependencies, no framework. The backend change lives in the howsu repo and is small/additive; the plan treats it as a dependency of US3 (Service-tab adaptation) and US1's true-state read.

## Phase 0: Architecture Decisions

See [research.md](./research.md) for full rationale. Summary:

- **D1 — Colour tokenisation:** catalogue the 28 distinct hex + 18 rgba into semantic CSS vars, defined in both `:root` (night) and `body.light` (day); replace literals with `var()` in scoped, reviewed passes (never global sed). This is the bulk of US7.
- **D2 — Text-size scaling:** three fixed steps — base (default) / large / extra-large (no "small") — via a single base-size token applied ONLY to the scaled set (Iona/Oran message text + settings/menu text/labels/Account links). Safety buttons, status pill, headings, chrome keep literal px. Persisted pref applied on launch.
- **D3 — Font-set:** introduce `--font-ui`; repoint the 27 'Hanken Grotesk' UI refs to it; switch its value (app set ↔ design-system set) by pref. Brand fonts (Dancing Script/Eagle Lake) + mono stay literal/fixed.
- **D4 — WITHDRAWN:** `has_proactive` signal + proactive on/off toggle dropped (owner decision); reverted from the webhook. Surface keys off `service_status` only.
- **D5 — True service status:** read the existing backend status on settings-open AND Today-load; drive pill + banner + rings; offline/indeterminate never renders "Active". **Verified live this session.**
- **D6 — Orb ring re-gate:** ring colour driven by `service_status` only (teal=Active/running, amber=Paused), amber core constant, plus a pulse-pace difference (non-colour cue). Re-points the existing amber pings off `orb--btn-on`. ⚠️ A Live member with no schedule reads Active→teal — confirm Beacon `service status` setup.
- **D7 — Paused banner:** persistent, tappable element at top of Today; tap → resume (existing restart path); not a dismissable toast.
- **D8 — Tabbed sheet:** restructure `#settings-overlay` into three panes with a tab switcher (CSS show/hide), preserving slide-down dismiss and all existing controls.
- **D9 — Keep-trying removal:** delete the UI control + handler; default `device_dial_passes` to `'keep'` in code so the safe cycle holds with no pref set.
- **D10 — Sign-out confirm:** insert a confirm step before `ms.logout()`; cancel = no-op.
- **D11 — Preferences pattern:** new keys `theme`, `text_size`, `font_set` use `getPreference`/`setPreference` exactly like `orb_button`; applied on launch before first paint.
- **D12 — Copy:** enumerate all new user-facing strings; check against the full constitution banned list; use "Paused"/"Resume".

## Phase 1: Design

### UI states
- **Settings sheet:** Service / Appearance / Account tabs; active-tab class; dismiss unchanged. Service tab shows pause/resume + status (driven by `service_status`).
- **Today screen:** active (no banner, teal rings, faster pulse) / paused (persistent banner, amber rings, slower pulse) / indeterminate (no false "Active"; help still live).
- **Sign-out:** idle → confirm → (confirm: logout · cancel: back to Account tab).

### Data & contracts
- Preferences: `theme` (night|day), `text_size` (step id), `font_set` (app|system) — see [data-model.md](./data-model.md).
- Backend read consumed: `service_status` only — see [contracts/service-status.md](./contracts/service-status.md).

### Copy (constitution-bound; finalise at build, change-freely-later)
- Paused banner: "Paused — tap to resume." Resume confirmation must not imply help was ever off.
- Tabs: "Service" · "Appearance" · "Account". Appearance controls: "Theme" (Night/Day), "Text size" (A− / A+ steps), "Font". Sign-out confirm: plain confirm/cancel — no alarming words.

### Observability / validation
- On-device walkthrough per [quickstart.md](./quickstart.md), covering each P1 safety scenario first (true paused state, help-always-live), then structure, then appearance steps at largest size on smallest screen.

## Complexity Tracking

| Item | Why needed | Discipline / mitigation |
|---|---|---|
| Tokenising ~120 colour usages | US7/FR-019 — day mode renders half-dark otherwise (only 6 of 10 vars flip today) | Scoped, reviewed edits per rule-group; **no global `sed`** (§IV); verify both scopes visually; biggest single work item — sequence last (P3). |
| Tokenising font-size subset | US8/FR-015 — only the scaled set may move | Convert ONLY message + menu/label/Account-link rules; leave safety/chrome px untouched; verify fixed elements unchanged at every step. |

No constitution violations requiring waiver. Tokenisation is in-scope-by-spec; the only standing risk is doing it as scoped passes rather than a bulk replace — explicitly enforced above.
