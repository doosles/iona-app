# Tasks: Settings Surface Overhaul (003)

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Research**: [research.md](./research.md) · **Data model**: [data-model.md](./data-model.md) · **Contracts**: [contracts/](./contracts/) · **Quickstart**: [quickstart.md](./quickstart.md)

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: can run in parallel (different file, no dependency on another incomplete task).
- **[US#]**: the user story a task serves. Setup/Foundational/Polish carry no story tag.
- **[howsu]**: lands in the **howsu repo** (`reply_to_airtable_webhook.py` / `config.py`), NOT iona-app. Kept in 003 per owner decision.
- Every UI task is gated by a confirmed mockup (constitution §III). Run `node --check www/app.js` before any push; tokenisation is **scoped edits, never global `sed`** (§IV).

## Path conventions

- App: `www/index.html`, `www/app.js`, `www/style.css` (the app does NOT load `iona.css`).
- Backend: howsu repo `reply_to_airtable_webhook.py`, `config.py`.

---

## Phase 1: Setup

- *(No setup tasks. `has_proactive` / proactive-schedule field IDs were dropped with US3 — owner decision. `service_status` is read by the existing handler via field name; no new constants needed.)*

## Phase 2: Foundational (blocking prerequisite — blocks US1)

- [x] **T003** [howsu] `POST /pwa-status` returns the true service status (`Active`/`Paused`) for the app to read on settings-open and Today-load. **DONE + verified this session** (Paused→`"Paused"`, Live→`"Active"`, via reversible field toggle on the test record). No code change needed — the existing read already works. Contract: `contracts/service-status.md`. *(T001/T002 removed — `has_proactive` withdrawn; the earlier `has_proactive` additions were reverted from `reply_to_airtable_webhook.py`.)*
- [x] **T004** `www/app.js` — `applyAppearanceOnLaunch()` reads `theme` / `text_size` / `font_set` Preferences and applies `body.light` + `data-text-size`/`data-font-set` hooks **before first paint** (existing `getPreference` pattern). No-op-safe when unset (defaults: night / base / app). Wired first in the `load` handler. **DONE this session** (defaults inert until US6–US8 CSS lands).

---

## Phase 3: User Story 1 — Honest paused state (Priority: P1) 🎯 MVP — ✅ BUILT & DEPLOYED (this session)

**Goal**: true paused/active state read on open and Today-load; surfaced via a persistent banner + orb rings; resume works; "I need help" always live. **Built, `node --check` clean, deployed to Pixel 4a — awaiting on-device review.**

### Mockup gate (§III)
- [x] **T005** [US1] Paused-Today mockup recorded in `mockup.md` (active / paused / indeterminate states; banner + orb rings).

### Implementation
- [x] **T006** [US1] `www/app.js` — `readServiceStatus()` reads `/pwa-status` on **settings-open** and **Today-load**; time-boxed (6 s AbortController) + offline-safe; failure → indeterminate, **never "Active"**.
- [x] **T007** [US1] `www/index.html` — persistent `#today-paused-banner` button at the top of the Today screen (hidden by default).
- [x] **T008** [US1] `www/app.js` — banner shown ⇔ `service_status == Paused`; **informational only** — tap opens Settings (does NOT resume directly). Copy: "Scheduled service paused". *(Resume as an action deferred to US2 — owner decision: a tap-to-resume that fires but doesn't visibly clear is worse than none. The async-write race on `/pwa-restart` is handled there with the proper settings control + true-state pill.)*
- [x] **T009** [US1] `www/app.js` + `www/style.css` — orb rings driven by `service_status` (`orb--paused` → amber + slower pulse; default → teal); amber core constant; removed the `orb--btn-on` amber-ping gating.
- [x] **T010** [US1] `www/app.js` — settings status pill reflects true state (Active/Paused/"—"); replaces the static "Active".
- [x] **T011** [US1] Verified: neither the pause handler nor the banner touches `btn-alert` — "I need help" stays fully live in every state (no code change needed).
- [x] **T012** [P] [US1] `www/style.css` — paused-banner + `orb--paused` ring styles (night-theme literals now; tokenised in US7).

**Checkpoint (US1 independently testable)**: quickstart steps 1–5 — ready for on-device review.

---

## Phase 4: User Story 2 — Tabbed settings sheet (Priority: P1)

**Goal**: the bottom sheet becomes Service · Appearance · Account, all existing controls preserved.

### Mockup gate (§III)
- [ ] **T013** [US2] Confirm the existing 3-tab sheet mockup; record in `mockup.md`.

### Implementation
- [ ] **T014** [US2] `www/index.html` — restructure `#settings-overlay` into three tab panes (Service / Appearance / Account) + a tab bar; keep the close button and slide-down dismiss. Relocate existing controls: pause/resume + status pill + orb button → Service; dashboard deep-links + Sign out → Account; Appearance pane empty for now.
- [ ] **T015** [US2] `www/app.js` — tab switcher (active-pane class), default to Service; ensure preserved handlers (orb button, the five dashboard deep-links, sign out) still bind and work from their new tab; preserve swipe-down dismiss.
- [ ] **T016** [P] [US2] `www/style.css` — tab bar + pane show/hide styles matching the current night surface (sheet `#0C1C30`, Hanken Grotesk, existing row/toggle styling).

### Pause/resume action — built right (FR-024/025/026; owner-flagged this session) — ✅ ON-DEVICE VERIFIED
- [x] **T037** [US2] [howsu] **Race fixed at source:** `/pwa-pause` and `/pwa-restart` now **apply the Airtable write before returning** (write-then-respond) — verified server-side (pause → immediate `/pwa-status` read = Paused; restart → Active). Only JS caller in-repo is the iona-app; change is backward-compatible (still 200 + JSON). *(app.howsu.today PWA code not in this workspace — couldn't drive it, but contract preserved.)*
- [x] **T038** [US2] `www/app.js` — pause/resume reads true state to decide the action, calls the endpoint, then a **single re-read** sets pill + pause-button label (no optimistic, no poll). On-device: Active→tap→Paused pill + "Restart service"; Paused→tap→Active pill + "Pause service" (FR-024).
- [x] **T039** [US2] `www/app.js` — **Today↔Settings consistency:** `readAndApplyServiceState()` runs after the action AND on settings close (✕ + swipe-dismiss). On-device: pause→dismiss→Today shows "Scheduled service paused" + amber orb; resume→dismiss→Today teal/no-banner. No stale state (FR-025).
- [x] **T040** [US2] On-device verified (screencaps): full pause→Today-amber and resume→Today-teal cycle, pill always true state, no race. ⚠️ Note: each action takes ~5–6 s (endpoint now does 2 synchronous Airtable writes + re-read); button disabled during. Correct but a touch slow — **polish candidate** (e.g. trim the re-read's active-message lookup, or the pause handler's log write).

**Checkpoint**: quickstart steps 6–7 + Today↔Settings consistency across a full pause/resume cycle — **PASS (on-device)**.

---

## Phase 5: User Story 4 — Remove "keep trying"; lock safe cycle (Priority: P1)

- [ ] **T017** [US4] `www/index.html` — remove the "keep trying your contacts" row from settings.
- [ ] **T018** [US4] `www/app.js` — remove the `device_dial_passes` toggle handler; hardcode the consuming logic to the full safe cycle (`'keep'`) so no unset preference can resolve to single-pass (`'once'`).

**Checkpoint**: quickstart steps 8–9 pass.

---

## Phase 6: User Story 3 — WITHDRAWN

*Removed by owner decision (this session). `has_proactive` + the proactive on/off toggle were overcomplication. T019/T020 deleted. The Service tab shows pause/resume + status driven by `service_status` (built within US1/US2); the orb keys off `service_status` only (T009). No `has_proactive` consumption, no proactive on/off toggle anywhere.*

---

## Phase 7: User Story 5 — Confirm before sign out (Priority: P2)

- [ ] **T021** [US5] `www/index.html` + `www/app.js` — insert an explicit confirm step before `ms.logout()` in the Account tab; cancel returns to Account with no change; confirm performs the existing sign-out + Preferences clear. Plain confirm/cancel copy (no alarming words, §II).

**Checkpoint**: quickstart step 12 passes.

---

## Phase 8: User Story 6 — Text-size stepper (Priority: P2)

*Depends on Phase 2 (T004 apply-on-launch) and Phase 4 (Appearance tab).*

### Mockup gate (§III)
- [ ] **T022** [US6] Mock the Appearance tab text-size control (3 steps: base / large / extra-large) and the scaled vs fixed elements; record in `mockup.md`.

### Implementation
- [ ] **T023** [US6] `www/style.css` — introduce a base text-size token and convert ONLY the scaled set to derive from it: Iona/Oran message text + settings/menu text (row labels, sub-labels, Account-tab nav links). Scoped edits to those rules only — leave action buttons, status pill, section headings, chrome at literal px. Define the 3 step values (base/lg/xl).
- [ ] **T024** [US6] `www/app.js` — add the `text_size` control (3 fixed steps, not a slider) in Appearance; persist via Preferences; apply via the T004 hook on launch and on change.
- [ ] **T025** [US6] Verify FR-016/017: at every step the action buttons, status pill, headings, chrome are unchanged; at extra-large on the smallest supported screen no scaled text clips and no safety control is displaced.

**Checkpoint**: quickstart steps 13–15 pass.

---

## Phase 9: User Story 7 — Theme Night/Day + colour tokenisation (Priority: P3)

*The largest work item. Scoped edits only — never global `sed` (§IV).*

### Mockup gate (§III)
- [ ] **T026** [US7] Confirm Day-mode appearance across all screens (palette mapping for the ~120 colours); record in `mockup.md`.

### Implementation
- [ ] **T027** [US7] `www/style.css` — catalogue the 28 distinct hex + 18 rgba usages into semantic CSS variables; define values for both `:root` (night) and `body.light` (day). (Token definition step — no replacements yet.)
- [ ] **T028** [US7] `www/style.css` — replace the literal colour usages with `var(--token)` in **scoped, reviewed passes grouped by section/rule** (NOT `sed`). Includes the US1 banner/orb styles from T012. Verify both scopes after each group.
- [ ] **T029** [US7] `www/app.js` — add the Night/Day control in Appearance; toggle the `body.light` class; persist via Preferences; apply via the T004 hook on launch.
- [ ] **T030** [US7] Verify FR-019: in Day mode, 0 elements render in dark-scope colours (walk every screen).

**Checkpoint**: quickstart steps 16–17 pass.

---

## Phase 10: User Story 8 — Font-set switch (Priority: P3)

- [ ] **T031** [US8] `www/style.css` — introduce `--font-ui`; repoint the 27 `'Hanken Grotesk'` UI declarations to `var(--font-ui)` (scoped edits). Leave brand fonts (Dancing Script, Eagle Lake) and JetBrains Mono literal/fixed.
- [ ] **T032** [US8] `www/app.js` — add the font-set control (app ↔ design-system) in Appearance; switch `--font-ui`'s value; persist via Preferences; apply via the T004 hook on launch.
- [ ] **T033** [US8] Verify FR-021: brand/character fonts unchanged under every font-set and text-size choice.

**Checkpoint**: quickstart steps 18–19 pass.

---

## Phase 11: Polish & Cross-Cutting

- [ ] **T034** Copy audit — enumerate every new user-facing string (banner, tabs, Appearance labels, sign-out confirm, indeterminate state) and check against the FULL constitution §II banned list (check-in/care/welfare/watching/support/patient/resident/emergency/alert/failed/crisis + system jargon as labels); Iona pronoun-free. Fix any leak.
- [ ] **T035** Build hygiene — `node --check www/app.js` clean; confirm tokenisation was done as scoped edits (no global sed); both theme scopes verified; appearance prefs apply before first paint (no flash).
- [ ] **T036** Full on-device validation — run all quickstart scenarios on Pixel 4a (P1 safety first), then report deploy reality (rebuilt/installed = live; "pushed" ≠ "live").

---

## Dependencies & Execution Order

### Phase dependencies
- **Phase 1 (Setup)** — none.
- **Phase 2 (Foundational, T003/T004)** — both **DONE** this session. T003 (service_status read) verified live; blocks US1. T004 (appearance launch hook) blocks the appearance stories (US6/7/8).
- **Phase 3 (US1)** — depends on T003 (✓). The MVP slice; can ship before the tab restructure.
- **Phase 4 (US2)** — independent of US1; **prerequisite for US6, US7, US8** (they live in the Appearance tab) and US5 (Account tab).
- **Phase 5 (US4)** — independent; can run any time after Phase 4 (the control lives in settings).
- **Phase 6 (US3)** — WITHDRAWN.
- **Phase 7 (US5)** — depends on Phase 4 (Account tab).
- **Phase 8 (US6)** — depends on Phase 4 + T004 (✓).
- **Phase 9 (US7)** — depends on Phase 4 + T004 (✓); largest; sequence late.
- **Phase 10 (US8)** — depends on Phase 4 + T004 (✓).
- **Phase 11 (Polish)** — after all story phases.

### Suggested order
(T003 ✓, T004 ✓) → **US1 (MVP)** → US2 → US4 → US5 → US6 → US7 → US8 → Polish.

### Parallel opportunities
- Within a story, `style.css` tasks marked [P] (T012, T016) run alongside the `app.js` task of the same story (different files).
- US4 (T017/T018) is independent of US5 and can slot in opportunistically once US2 exists.

### Story independence
Each user-story phase is independently testable via its quickstart checkpoint. US1 alone is a viable, shippable safety improvement (the MVP) even if no other story ships.

---

## Notes for the owner (flagged, not assumed)
- **has_proactive + proactive on/off toggle WITHDRAWN** (owner decision, this session) — overcomplication. The `has_proactive` additions were reverted from `reply_to_airtable_webhook.py`; US3 / Phase 6 / T001 / T002 removed. The surface now keys off `service_status` only.
- **Foundational layer DONE + verified**: T003 (service_status read — verified Active/Paused live via reversible field toggle) and T004 (appearance launch hook, `node --check` clean). Ready for US1.
- **⚠️ Beacon/orb open question** (confirm before US1 orb build, T009): a Live member with no schedule (how a Beacon looks) returns `service_status = Active` → **teal** rings under `service_status`-only logic, NOT amber. "Beacon naturally amber" only holds if a Beacon's `service status` is set to something other than Live. Needs owner confirmation of how a Beacon's `service status` is set.
- **Backend**: the only howsu touch is the (already-working, now-verified) `/pwa-status` read; no new backend code remains for 003. The rest is iona-app `www/`.
