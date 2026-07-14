# Feature Specification: Settings Surface Overhaul

**Feature Branch**: `003-settings-surface-overhaul`

**Created**: 2026-06-27

**Status**: Draft

**Input**: `speckit_specify_input_settings_overhaul.md` (app-only feature; night theme `style.css`). Authored from that file only — the broader strategy doc (Plan Tiering & Reactive-Mode Architecture v2) is context, not scope.

---

## Codebase context (from the mandatory pre-spec audit)

Findings the spec and downstream plan must build on (no assumptions — confirmed against live `www/`):

- **Current settings** = one flat bottom-sheet `#settings-overlay` titled "Service settings": Status pill, Pause button, **Orb Button** toggle, **Keep trying your contacts** toggle, then a "Manage" group (My schedule / service / contacts / account / Activity log / Sign out). Only two controls are truly wired — `orb_button` and `device_dial_passes` — via a Capacitor Preferences read/write pattern that all new controls must copy.
- **Status pill is cosmetic/stale**: static "Active" in markup, only changed by the Pause click this session; never read from the backend on open. A backend status read already exists (`/pwa-status` returns service status) and is unused by the panel.
- **Hardcoded values to tokenise** (the appearance work): **~120 colour usages** (102 literal hex across 28 distinct values + 18 `rgba()`), **63 `font-size` declarations** (15 distinct, 9–96px), **42 `font-family` declarations** (27× Hanken Grotesk UI, plus JetBrains Mono, Newsreader, and the brand fonts Dancing Script / Eagle Lake). Only **10** colour variables exist today.
- **`body.light` (day) scope** exists but is **never applied** by any code, and overrides only **6 of 10** colour vars — so day mode would render half-dark until the ~120 hardcoded colours are tokenised.
- **Today orb** building blocks already exist: an amber Oran **core**, **two teal pings** and **two amber pings**. Amber pings are currently shown by an unrelated state (`orb--btn-on`, the orb-button toggle), not by service status — this feature re-points ring colour to service status.
- **The feature consumes only `service_status`** (Active/Paused) from the existing `/pwa-status` read — no `has_proactive`/proactive-capability signal is introduced. The orb and pause/resume key off pause state alone; a reactive-only/Beacon member simply reads its own `service_status`. "My schedule" remains a web-dashboard deep-link.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Honest paused state, surfaced where the member looks (Priority: P1)

A member whose service is paused must never be shown as active. On the Today screen and on opening settings, the true paused/active state is read and shown — via the orb's ring colour and a persistent **informational** banner ("Scheduled service paused"). The banner is an indicator, not a control (it taps through to Settings). Resuming is an **action in Settings** (built in US2), not on the Today banner. Summon-help stays fully live throughout.

**Why this priority**: Safety-critical. A paused service silently presented as active is the single biggest hazard in the current surface; this is the feature's core value and ships independently of the tab restructure.

**Independent Test**: With the service paused on the backend, cold-launch the app — Today shows the "Scheduled service paused" banner + amber orb rings, settings pill shows Paused; with it Active → no banner + teal rings. "I need help" works at every step. (Resume is exercised in US2.)

**Acceptance Scenarios**:

1. **Given** the service is paused on the backend, **When** the app launches, **Then** the Today screen shows the persistent "Scheduled service paused" banner and the orb's pulse rings are amber, and the settings status pill shows Paused — never "Active".
2. **Given** the paused banner is showing, **When** the member taps it, **Then** Settings opens (the banner does NOT resume directly — resume lives in Settings, US2).
3. **Given** the service is active, **When** the app launches, **Then** no banner shows and the orb rings are teal.
4. **Given** any paused state, **When** the member triggers "I need help", **Then** summon-help and the escalation engine run fully — pausing never affects them, and no copy implies help is off.
5. **Given** the settings sheet is opened, **When** it renders, **Then** the status pill is read from the backend at open time, not a hardcoded default.

---

### User Story 2 - Tabbed settings sheet (Priority: P1)

The settings entry opens the same bottom sheet (slide-down to dismiss), now organised into three tabs — **Service · Appearance · Account**. Preserved controls (orb button, dashboard deep-links, sign out) keep working; the **pause/resume action is rebuilt properly** in the Service tab with a true-state pill, and made consistent with the Today indicator (US1) — it was effectively broken before (CORS + race), so it is built right, not preserved as-is.

**Why this priority**: The structural spine of the overhaul; houses the other stories. It also carries the **pause/resume action** that US1's Today indicator reflects — the two must stay consistent.

**Independent Test**: Open settings → three tabs; switch between them; exercise preserved controls (orb button, deep-links, sign out); pause then resume in the Service tab and confirm the pill **and** the Today banner/orb both reflect the true new state after the action and after closing the panel; swipe-down dismisses as before.

**Acceptance Scenarios**:

1. **Given** the member taps the settings entry, **When** the sheet opens, **Then** it presents Service, Appearance, and Account tabs and retains slide-down-to-dismiss.
2. **Given** the sheet is open, **When** the member switches tabs, **Then** the tab content changes without dismissing the sheet.
3. **Given** a preserved control (orb button, dashboard deep-links, sign out), **When** used from its new tab, **Then** it behaves exactly as before this feature.
4. **Given** the night theme, **When** the sheet renders, **Then** its styling matches the current surface (sheet surface colour, body font, existing row and toggle styling).
5. **Given** the member pauses or resumes in the Service tab, **When** the action completes, **Then** the status pill reflects the **true** new state read from the backend (FR-024) — never an optimistic or stale value.
6. **Given** a pause/resume done in Settings, **When** the panel is closed (or the action completes), **Then** the **Today screen re-reads** `service_status` and updates the banner + orb to match — no stale load-time state (FR-025).
7. **Given** resume is tapped, **When** the UI updates, **Then** it shows Active only once the backend change has actually landed — it does **not** race ahead of the `/pwa-restart` write (FR-026).

---

### User Story 3 - WITHDRAWN (owner decision, this session)

**Removed.** The original US3 ("Service tab adapts to whether the member has proactive") and its `has_proactive` signal + proactive on/off toggle were withdrawn as overcomplication. The Service tab shows pause/resume + status driven by `service_status` for everyone; the orb keys off `service_status` only (Paused → amber, running → teal); a reactive-only/Beacon member simply reflects its own `service_status` with no special handling. No `has_proactive` signal and no proactive on/off toggle anywhere. (Story number retained to keep US4–US8 / task `[US#]` tags stable.)

---

### User Story 4 - Remove the "keep trying" control; make the safe behaviour permanent (Priority: P1)

The "keep trying your contacts" control is removed from settings, and the device-dial fallback always performs the full safe cycle — the "once" (single-pass) behaviour is no longer reachable.

**Why this priority**: Safety correctness. The control tuned an automatic emergency fallback in a way that could make it weaker ("once") in the exact moment it matters; removing it and locking the safe default closes that hazard. Small and self-contained.

**Independent Test**: Open settings → the control is gone. Exercise the device-dial fallback path → it runs the full multi-pass cycle with no preference set.

**Acceptance Scenarios**:

1. **Given** the settings surface, **When** it renders, **Then** no "keep trying" control is present.
2. **Given** the device-dial fallback runs, **When** no preference has been set, **Then** it performs the full safe cycle (never the single-pass behaviour).
3. **Given** the change, **When** the fallback behaviour is determined, **Then** it does not depend on a preference value that nothing sets.

---

### User Story 5 - Confirm before signing out (Priority: P2)

Signing out requires an explicit confirm step, so an accidental tap cannot strand a member out of the app.

**Why this priority**: Prevents an accidental, high-friction-to-recover action for this audience. Safety-adjacent but off the crisis path.

**Independent Test**: Tap Sign out → a confirm step appears; cancel → still signed in, settings unchanged; confirm → signed out.

**Acceptance Scenarios**:

1. **Given** the member taps Sign out, **When** the action fires, **Then** a confirm step is shown before any sign-out occurs.
2. **Given** the confirm step, **When** the member cancels, **Then** they remain signed in and return to settings with nothing changed.
3. **Given** the confirm step, **When** the member confirms, **Then** the sign-out proceeds as today.

---

### User Story 6 - Appearance: text size (Priority: P2)

A member can choose from a small number of fixed text-size steps. Reading and menu text scales; safety-tuned action targets and chrome do not move.

**Why this priority**: The headline accessibility win for the audience. Independently valuable; requires tokenising the font-sizes of the scaled elements only.

**Independent Test**: Step text size up and down → message text and settings/menu text resize together; the action buttons, status indicator, headings, and chrome stay fixed; at the largest step nothing overflows or pushes a safety control out of reach; the choice persists across launch.

**Acceptance Scenarios**:

1. **Given** the text-size control, **When** the member changes the step, **Then** the Iona/Oran message text AND all settings/menu text (row labels, sub-labels, Account-tab navigation links) resize together.
2. **Given** any step, **When** applied, **Then** the action buttons ("I need help", "I'm okay", orb button, pause/resume), the status indicator, section headings, and structural chrome remain at their fixed sizes.
3. **Given** the largest step, **When** rendered, **Then** no scaled text breaks its container and no safety control is pushed off-screen or out of reach.
4. **Given** a chosen step, **When** the app relaunches, **Then** the choice persists and is applied on launch.
5. **Given** the control, **When** presented, **Then** it offers a small number of fixed steps, not a free slider.

---

### User Story 7 - Appearance: theme Night/Day (Priority: P3)

A member can switch between the existing Night and Day scopes, and Day mode renders fully (no elements stuck dark), which requires tokenising the remaining hardcoded colours.

**Why this priority**: A preference rather than a safety or accessibility necessity, and it carries the largest refactor (the ~120 hardcoded colours). Valuable polish, sequenced last among appearance work.

**Independent Test**: Switch to Day → the whole surface renders in the light scope with no stuck-dark elements; switch back to Night → unchanged from today; the choice persists across launch.

**Acceptance Scenarios**:

1. **Given** the theme control set to Day, **When** the app renders, **Then** every surface renders in the light scope with no element stuck in dark-scope colours.
2. **Given** the theme control set to Night, **When** the app renders, **Then** it matches the current night appearance.
3. **Given** a chosen theme, **When** the app relaunches, **Then** the choice persists and is applied on launch.

---

### User Story 8 - Appearance: font set (Priority: P3)

A member can switch the UI/body font between the current app set and the design-system set; the brand/character fonts never change.

**Why this priority**: A preference; smallest of the appearance trio in user impact, depends on tokenising `font-family`.

**Independent Test**: Switch the font set → UI/body text changes to the alternate set; the Iona (Dancing Script) and Oran (Eagle Lake) brand fonts stay the same; the choice persists across launch.

**Acceptance Scenarios**:

1. **Given** the font-set control, **When** the member switches it, **Then** the UI/body font changes between the current app set and the design-system set.
2. **Given** any font-set choice, **When** applied, **Then** the brand/character fonts — Iona (Dancing Script) and Oran (Eagle Lake) — remain unchanged.
3. **Given** a chosen font set, **When** the app relaunches, **Then** the choice persists and is applied on launch.

---

### Edge Cases

- **Backend status unreadable on open** (offline / slow): the surface must not fall back to falsely showing "Active". It should show an honest indeterminate/last-known state and never assert active when it cannot confirm active. (Reactive "I need help" remains live regardless.)
- **Resume tapped while offline**: the resume action must report whether it actually took effect (consistent with "report deploy reality") and not silently appear resumed if the backend did not confirm.
- **Member pauses, then their plan/proactive changes**: the surface reflects the current backend state on next open/launch, not a cached assumption.
- **Largest text size on the smallest supported screen**: scaled text must reflow without overlapping or displacing any fixed safety control.
- **Theme switched mid-session**: applies immediately and persists; no half-applied state across the two scopes.
- **Sign-out confirm dismissed by back gesture / tapping away**: treated as cancel (no sign-out).

## Requirements *(mandatory)*

### Functional Requirements

**Structure & preservation**

- **FR-001**: The settings surface MUST present three tabs — Service, Appearance, Account — within the existing bottom-sheet, retaining slide-down-to-dismiss.
- **FR-002**: All controls that function today MUST continue to function: pause/resume, orb button, the dashboard deep-links (My schedule / service / contacts / account / Activity log), and sign out.
- **FR-003**: All new toggles and choices MUST persist via the same Preferences read/write pattern used by the existing `orb_button` / `device_dial_passes` controls.

**Honest state (safety)**

- **FR-004**: The surface MUST read the member's true service state from the backend when the settings sheet opens and when the Today screen loads — it MUST NOT display a hardcoded or assumed "Active".
- **FR-005**: When the service is paused, the Today screen MUST show a persistent **informational** banner (not a dismissable toast) stating the scheduled service is paused. The banner is an **indicator, not a resume control** — it may tap through to open Settings but MUST NOT attempt to resume directly. The pause/resume **action** lives in Settings (built in US2). *(Owner decision: a tap-to-resume that fires but doesn't visibly clear is worse than none.)*
- **FR-006**: The Today orb MUST reflect `service_status`: pulse rings **amber when Paused**, **teal when running (Active)**, with the amber core constant. Ring state MUST be driven by `service_status` only (not by the orb-button toggle as today, and not by any proactive-capability signal). A secondary non-colour cue (e.g. pulse pace) SHOULD accompany ring colour so state is not conveyed by colour alone. (A reactive-only/Beacon member shows whatever its `service_status` is — no special-casing.)
- **FR-007**: Summon-help ("I need help") and the escalation engine MUST remain fully available in every state including paused; no control in this feature may disable them, and no copy may imply help is off.

**Service tab + pause/resume action (US2 — built right)**

- **FR-008**: The **Service tab** MUST show the pause/resume control and the status indicator, driven by `service_status`. Pause/resume is a free in-app control — no billing or entitlement gating. There is **no proactive on/off toggle and no `has_proactive` gating** (removed by owner decision, this session, as overcomplication): the surface keys off pause state only.
- **FR-024**: The Service-tab status pill MUST show the **true** state read from the backend after a pause/resume action — never an optimistic or hardcoded value.
- **FR-025**: A pause/resume performed in Settings MUST keep **Today and Settings consistent**: on the change completing (and on the settings panel closing), the Today screen MUST **re-read** `service_status` and update the banner + orb — it MUST NOT display stale load-time state. (This is a refresh-trigger requirement, addressed directly — not worked around.)
- **FR-026**: Pause/resume MUST reflect the **true post-change state**, not race the backend write. Resolve at source: **preferred** — `/pwa-pause` and `/pwa-restart` apply the change *before* returning (synchronous write-then-respond), so any subsequent read is correct for all callers; **acceptable alternative** — the app confirms the change has landed before updating the UI. A fire-and-forget endpoint return + immediate optimistic UI is NOT acceptable. *(Note: the endpoint change is a howsu backend edit; verify it doesn't regress the existing PWA web caller.)*

**Keep-trying removal (safety)**

- **FR-011**: The "keep trying your contacts" control MUST be removed from the settings surface.
- **FR-012**: The device-dial fallback MUST always perform the full safe (multi-pass) cycle; the single-pass behaviour MUST NOT be reachable, and the behaviour MUST NOT depend on a preference value that nothing sets.

**Sign-out**

- **FR-013**: Sign out MUST require an explicit confirm step; cancel leaves the member signed in with no change; confirm performs the existing sign-out.

**Appearance — text size**

- **FR-014**: The surface MUST offer a small number of fixed text-size steps (not a free slider), persisted and applied on launch.
- **FR-015**: Changing the text size MUST scale ONLY (a) Iona/Oran message text and (b) settings/menu text (row labels, sub-labels, Account-tab navigation links).
- **FR-016**: Changing the text size MUST NOT alter the size of the action buttons ("I need help", "I'm okay", orb button, pause/resume), the status indicator, section headings, or structural chrome.
- **FR-017**: At the largest step, scaled text MUST NOT break its container or push any safety control off-screen or out of reach.

**Appearance — theme**

- **FR-018**: The surface MUST offer a Night/Day theme choice, persisted and applied on launch.
- **FR-019**: Day mode MUST render fully with no element stuck in dark-scope colours; this requires tokenising the remaining hardcoded colours so both scopes resolve completely.

**Appearance — font set**

- **FR-020**: The surface MUST offer a font-set choice between the current app set and the design-system set, persisted and applied on launch.
- **FR-021**: The brand/character fonts — Iona (Dancing Script) and Oran (Eagle Lake) — MUST remain constant regardless of font-set choice.

**Copy (constitution-bound)**

- **FR-022**: All user-facing copy in this feature MUST use "Paused" / "Resume" and MUST NOT use any banned term from the constitution — including "check-in/check-ins", "care", "welfare", "watching", "support", "patient", "resident", and the alarming words "emergency", "alert", "failed", "crisis" — nor surface system jargon (e.g. "escalation", "reminder", "SMS") as labels.
- **FR-023**: Iona MUST be referred to by name only (pronoun-free); Oran is the companion voice for escalation/contact alerts only.

### Key Entities

- **Appearance preference set** — three independent member choices persisted locally: theme (Night/Day), text-size step (one of a small fixed set), font-set (app / design-system). No server involvement; cosmetic only.
- **Service state** — the member's true proactive state (active / paused), read from the backend; drives the status indicator, Today banner, and orb rings. Operational state only — never a reason or any health/case data.
- **Device-dial fallback policy** — no longer a member-facing preference; the safe full-cycle behaviour is fixed in code.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of launches where the backend reports the presence as paused, the app shows a paused state on both the Today screen and the settings surface — there is no launch path that shows "Active" while paused.
- **SC-002**: Summon-help succeeds in 100% of attempts made while the presence is paused (pausing has zero effect on the reactive path).
- **SC-003**: The Service tab shows pause/resume + status driven by `service_status`; no `has_proactive` gating and no proactive on/off toggle exist anywhere in the build (verified by code search + UI walkthrough).
- **SC-004**: The single-pass device-dial behaviour is unreachable from the UI and from any unset preference (0 paths to "once").
- **SC-005**: Accidental sign-outs are eliminated — sign-out requires a deliberate two-step confirm; a single tap never signs the member out.
- **SC-006**: In Day mode, 0 elements render in dark-scope colours (full colour tokenisation verified visually across all screens).
- **SC-007**: At every text-size step, message and menu text resize while the action buttons, status indicator, headings, and chrome stay fixed, and no safety control is displaced or any scaled text clipped — verified at the largest step on the smallest supported screen.
- **SC-008**: Brand fonts (Dancing Script, Eagle Lake) are unchanged under every font-set and text-size choice.
- **SC-009**: Every new preference (theme, text-size, font-set) survives an app relaunch and is applied before first paint.
- **SC-010**: No user-facing string introduced by this feature contains a constitution-banned term.

## Assumptions

- The pasted "Plan Tiering & Reactive-Mode Architecture v2" doc is background only; this spec is authored solely from `speckit_specify_input_settings_overhaul.md`.
- A backend service-status read already exists and can supply true paused/active state on open and on Today load (an existing status endpoint returns service status today, unused by the panel).
- Tokenising the ~120 hardcoded colours, the relevant `font-size` subset, and the UI `font-family` is real refactor work touching many `style.css` rules and is **in scope** for this feature; the plan must size it explicitly.
- Mockups for the tabbed sheet, the adapted Service tab, and the paused Today-screen banner exist (this session) and are the visual reference (per the constitution's mockup-precedes-code rule).
- The app builds against its own `style.css`; it does not load `iona.css`. The "design-system font set" for FR-020 means the design-system fonts, applied within `style.css`.
- Text-size steps are three fixed steps — **base (default) / large / extra-large** (no "small" step) — exact px/scale values per step to be fixed at mockup time.

## Out of Scope (do NOT build in this feature)

- Pricing; the signup picker and plans grid (marketing surfaces).
- The web-dashboard Account-tab "add hands-free" card and billing flow. The app's "add hands-free" entry point, if present, is a navigation deep-link only — no billing build.
- Memberstack hands-free add-on setup, the backend hands-free gate extension (`planName == GA OR handsfree_addon`), and the Make.com sync change.
- Entitlement gating of any kind and any new Memberstack plan-reading. Hands-free stays server-gated exactly as today.
- Alert sounds (synthesised; no asset layer — a later build).
- Arbitrary font or colour picking — only the predefined sets and fixed size steps.
