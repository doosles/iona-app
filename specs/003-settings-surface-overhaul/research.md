# Research: Settings Surface Overhaul

Phase 0 decisions. Each resolves an unknown or fixes an approach before Phase 1 design. Grounded in the live codebase audit (see spec → Codebase context) and the constitution.

## D1 — Colour tokenisation (US7 / FR-019)
**Decision**: Catalogue the 28 distinct hex values + 18 `rgba()` usages into a set of semantic CSS custom properties, defined for both `:root` (night) and `body.light` (day). Replace each literal in `style.css` with `var(--token)` in scoped, reviewed passes grouped by rule/section.
**Rationale**: Only 10 colour vars exist and `body.light` overrides just 6 — so Day mode renders half-dark today. Full tokenisation is the prerequisite for a clean Day mode; CSS custom properties need no framework and the theme switch becomes a single class flip.
**Constraint**: Constitution §IV forbids global cross-file replace — this MUST be done as scoped edits per rule-group, not `sed -i`, with both scopes verified visually.
**Alternatives rejected**: (a) ship Day mode partially tokenised — rejected, violates FR-019 (no stuck-dark elements). (b) duplicate stylesheet per theme — rejected, doubles maintenance and drifts.

## D2 — Text-size scaling, scaled subset only (US8 / FR-015/016/017)
**Decision**: Three fixed steps — **base (default) / large / extra-large** (no "small") — driven by one base-size token applied ONLY to the scaled set: Iona/Oran message text + settings/menu text (row labels, sub-labels, Account-tab nav links). Safety action buttons, status pill, section headings, and chrome keep their literal px.
**Rationale**: Accessibility win without moving accidental-press-tuned targets or breaking layout. Scoping the token to the scaled rules keeps the blast radius small and the safety sizing guaranteed-fixed.
**Alternatives rejected**: global root font-size scaling — rejected, would move safety buttons/chrome (violates FR-016). Free slider — rejected, FR-014 wants fixed steps.

## D3 — Font-set switch (US9 / FR-020/021)
**Decision**: Introduce `--font-ui`; repoint the 27 `'Hanken Grotesk'` UI declarations to `var(--font-ui)`; switch its value between the current app set and the design-system set via a pref. Brand/character fonts (Dancing Script = Iona, Eagle Lake = Oran) and JetBrains Mono stay literal/fixed.
**Rationale**: One token covers the UI font; brand identity is preserved by simply not tokenising those families.
**Alternatives rejected**: tokenising every font-family — rejected, would risk the brand fonts (violates FR-021).

## D4 — `has_proactive` signal — WITHDRAWN (owner decision, this session)
Dropped as overcomplication. No `has_proactive` signal, no proactive on/off toggle, no US3. The `has_proactive` additions were reverted from `reply_to_airtable_webhook.py`. The settings surface and orb key off **`service_status` only** (see D5/D6). A reactive-only/Beacon member simply reflects its own `service_status` — no special handling. (D-number retained.)

## D5 — True service status read (US1 / FR-004)
**Decision**: Read the backend service status on settings-sheet open AND on Today-screen load; drive the status indicator, paused banner, and orb rings from it. Time-boxed and offline-safe; if unconfirmed, render an honest indeterminate state — never "Active".
**Rationale**: The current pill is static "Active" (audit-confirmed hazard). A backend status read already exists and is unused by the panel. Reusing it closes the gap without new infra.
**Alternatives rejected**: trust cached/last-known as "Active" — rejected, reintroduces the false-active hazard.

## D6 — Orb ring re-gate to service status (US1 / FR-006)
**Decision**: Drive ring colour from `service_status` only — **teal rings = running (Active)**, **amber rings = Paused** — with the amber Oran core constant. Add a pulse-pace difference (slower paused, livelier active) as a non-colour cue. No `has_proactive` input; a reactive-only/Beacon member reflects its own `service_status`. ⚠️ Open: a Live member with no schedule reads `Active` → teal (not amber) — confirm how a Beacon's `service status` is set before relying on "Beacon = amber".
**Rationale**: The orb already has core + teal pings + amber pings; today amber is gated to the unrelated `orb--btn-on`. Re-pointing to status reuses existing assets and teaches the two-layer model. Pace difference protects colour-blind/low-vision users (colour not the only channel).
**Alternatives rejected**: build a new indicator — rejected, the rings already exist. Colour-only signalling — rejected, accessibility.

## D7 — Paused banner on Today (US1 / FR-005)
**Decision**: A persistent, tappable banner at the top of the Today screen while paused; tapping it resumes (existing restart path). Not a dismissable toast.
**Rationale**: Colour alone is too subtle for a safety-relevant state with this audience; a text cue where the member looks. Persistence prevents "missed the toast." Copy must make clear only proactive is paused, never help.
**Alternatives rejected**: toast/snackbar — rejected, transient (FR-005 requires persistent). Banner that implies help is off — rejected (§I + FR-007).

## D8 — Tabbed bottom sheet (US2 / FR-001)
**Decision**: Restructure `#settings-overlay` into three tab panes (Service/Appearance/Account) with a simple active-tab class switcher (CSS show/hide). Preserve slide-down dismiss and every existing control.
**Rationale**: Pure DOM/CSS restructure; no framework (constitution §III simplicity). Existing handlers move into their tab unchanged.
**Alternatives rejected**: a routing/component library — rejected, unnecessary complexity.

## D9 — Remove keep-trying; lock safe cycle (US4 / FR-011/012)
**Decision**: Remove the "keep trying" row + its handler; default `device_dial_passes` to `'keep'` in code so the consuming logic uses the full safe cycle when no pref is set.
**Rationale**: Device dial is now fallback-only; a user-facing tuning of an automatic emergency fallback is wrong, and "once" is strictly worse in the moment that matters. Hardcoding "keep" removes the unsafe path entirely.
**Alternatives rejected**: leave the toggle hidden but readable — rejected, leaves an unset pref that could resolve to the worse "once".

## D10 — Sign-out confirm (US5 / FR-013)
**Decision**: Insert an explicit confirm step before `ms.logout()`; cancel returns to the Account tab with no change.
**Rationale**: Sign-out currently fires immediately; an accidental tap strands an older member (high recovery friction). Confirm is the minimal guard.
**Alternatives rejected**: undo window — rejected, more complex; confirm is sufficient and clear.

## D11 — Preferences pattern + apply-on-launch (FR-003/009-launch)
**Decision**: New keys `theme`, `text_size`, `font_set` read/written via `getPreference`/`setPreference` exactly like `orb_button`; applied on launch before first paint (set the body class / tokens prior to render).
**Rationale**: Proven pattern (audit-confirmed); applying before paint avoids a flash of the default theme/size/font.
**Alternatives rejected**: new storage abstraction — rejected (§III simplicity).

## D12 — Copy compliance (FR-022/023)
**Decision**: Enumerate every new user-facing string at build and check against the FULL constitution §II banned list (incl. emergency/alert/failed/crisis/care/welfare/support/patient/resident + system jargon as labels). Use "Paused"/"Resume"; Iona by name only.
**Rationale**: §II binds all UI copy; the input's four-word ban is a subset. A single enumerated check prevents leakage.
**Alternatives rejected**: rely on the input's shorter list — rejected, would miss constitution terms.

## D13 — Pause/resume state consistency + restart race (US2; owner-flagged this session)
**Decision**: Two problems observed on-device, fixed **at source** (not worked around):
1. **Today↔Settings consistency:** a pause/resume done in Settings must trigger the Today screen to re-read `service_status` (on action-complete and on panel-close) and refresh banner + orb — never stale load-time state. US1 already has a single `applyServiceState()` that updates banner + orb + pill from one read; US2 just ensures it is *triggered* after a settings-side change.
2. **Restart/pause race:** `/pwa-pause` // `/pwa-restart` currently respond 200 then apply the Airtable write in a background thread, so an immediate re-read races and returns the old state. **Fix preferred: make the endpoints apply-then-return** (write Airtable, then respond) so every caller's subsequent read is correct. Then the app needs only a single re-read (no poll). **Fallback** (if apply-then-return is undesirable): app confirms the change landed before updating UI.
**Rationale**: Apply-then-return removes the race for all callers (app + PWA web) in one place; the alternative poll/confirm is an app-side workaround that leaves the endpoint contract misleading. The owner explicitly asked to address both head-on rather than work around them. The earlier banner-resume poll attempt was the workaround being rejected.
**Alternatives rejected**: optimistic UI after a fire-and-forget return — rejected (showed stale/false state, the original bug). App-side poll loop — acceptable only as fallback; not preferred (masks the endpoint contract issue).
**Watch**: the endpoint change is a howsu backend edit — verify the existing PWA web app caller (app.howsu.today) isn't regressed by the now-synchronous response.
