# Tasks: Choose How Help Reaches You

**Input**: Design documents from `/specs/004-escalation-mode-picker/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/reactive-method-endpoints.md
**Tests**: No automated test tasks — this project's definition of done is **on-device verification on the
Pixel** (screencap / logcat / tap), never build-deploy or server-side-only. Backend behaviour is proven
by curl + on-device press-help; app behaviour by observed render/tap. `py_compile` / `node --check` are
**push preconditions**, not the DoD.

## Format & legend

`[ID] [P?] [Repo] [Story?] Description (path) — ✓ push-gate · DoD on-device`

- **[P]**: parallelizable (different file, no dependency on an incomplete task)
- **[Repo]**: `[BE]` = backend, repo `/Users/Henry/.openclaw/workspace/howsu` · `[APP]` = app, repo `/Users/Henry/iona-app`
  *(the two live in different repos and push independently — BE to the howsu workspace; APP to `iona-app` + `cap copy` + `gradlew installDebug` to the Pixel)*
- **[Story]**: `[US1]` choose · `[US2]` safety floor · `[US3]` invitation (from spec.md; US4 was dropped at clarify)
- **✓** = syntax push-gate · **DoD** = definition of done (on-device)

---

## Phase 0 — Prerequisites (OWNER ACTIONS — not build tasks; do not check off as engineering)

**These block the tasks that reference them. They are owner/UI actions, deliberately outside the build list.**

- [x] PRE-1 [Owner · Airtable UI] Create Table 1 field **`escalation_mode`** — single-line text. Supply its `fld…` ID for T001. *(Schema wall — no code workaround.)*
- [x] PRE-2 [Owner · Airtable UI] Create Table 1 field **`handsfree_addon`** — checkbox. Supply its `fld…` ID for T001. *(Schema wall.)*
- [x] PRE-3 [Owner · iona-app] Drop **`reactive_method_mockup_locked.html`** into `/Users/Henry/iona-app/` (repo root) — authoritative UI source; **blocks the UI tasks T007–T012**.

**Deferred ship-gates (NOT tasks in this build — required before going live for real money):**

- [ ] SHIP-1 [Deferred] Hands-free add-on plan exists in Memberstack; `pln_…` / `prc_…` IDs added to the master reference.
- [ ] SHIP-2 [Deferred] No Memberstack Plan-Logic rule auto-removes the main plan when the add-on is added.
- [ ] SHIP-3 [Deferred] Make scenario **1039536** writes `handsfree_addon` reliably **in production** (real add-on plan ID swapped into `contains(map(1.planConnections; active; planId; pln_handsfree-xxxx); true)`). A paid-but-unpropagated member is worse than a bug.

---

## Phase 1 — Setup & Foundational (backend config — blocks everything)

- [x] T001 [BE] Add feature constants to `/Users/Henry/.openclaw/workspace/howsu/config.py`: `HANDSFREE_ADDON_FIELD_ID` (from PRE-2), `ESCALATION_MODE_FIELD_ID` (from PRE-1), `HANDSFREE_ADDON_FIELD_NAME = "handsfree_addon"`, `ESCALATION_MODE_FIELD_NAME = "escalation_mode"`, `ESCALATION_MODE_DEFAULT = "escalation"`, `VALID_ESCALATION_MODES = ("escalation", "handsfree")`. **Depends on PRE-1, PRE-2.** — ✓ `python3 -m py_compile config.py`; `validate_config()` still passes · DoD: constants import cleanly in the webhook.

**Checkpoint**: constants available to the gate + PWA handlers.

---

## Phase 2 — User Story 2: Safety floor (the gate) — Priority P1 🎯 SAFETY MVP (prove this first)

**Goal**: The press-time decision + fallback live server-side in the existing `/bridge/contacts` gate.
Whatever is stored, entitlement decides; a non-granted case falls through to the standard way.

**Independent Test**: With `escalation_mode` / `handsfree_addon` **hand-set in Airtable** (no picker yet),
press I NEED HELP on the Pixel and observe the routing matrix + fallbacks. No app change is needed for this
story — it is provable on its own.

> **Intended behaviour change (not a regression):** once the gate ships, a Guardian Angel member with **no
> stored choice** now defaults to the **standard way** (escalation), not the bridge — this is the new
> default per FR-017 / OQ-1. The bridge is reached only after an explicit hands-free pick (US1). Confirm on
> device that this is understood, not treated as a bug.

- [x] T002 [BE] [US2] Edit `_handle_bridge_contacts` (~line 1400) in `/Users/Henry/.openclaw/workspace/howsu/reply_to_airtable_webhook.py`: after the existing `returnFieldsByFieldId=true` fetch, compute `has_hands_free = (plan_name == GUARDIAN_ANGEL_PLAN_VALUE) or bool(fields.get(HANDSFREE_ADDON_FIELD_ID, False))` and `mode = fields.get(ESCALATION_MODE_FIELD_ID, "") or ESCALATION_MODE_DEFAULT`; **replace** the single `plan_name != GUARDIAN_ANGEL_PLAN_VALUE` condition with `if not (mode == "handsfree" and has_hands_free): 403` (reason `not_chosen` vs `not_entitled`). Keep the 403 block + contact-building + all other branches **verbatim**. SURGICAL — never full-regen. — ✓ `python3 -m py_compile`; grep no stray `ff"` · DoD: see T003.
- [x] T003 [BE] [US2] **On-device safety-floor verification (Pixel)** — hand-set Airtable values and press I NEED HELP for each row of the matrix, observing the outcome (screencap/logcat): (a) `handsfree` + entitled → **bridge**; (b) `handsfree` + not-entitled → **escalation** (the lapsed/downgraded fallback); (c) `escalation`/blank + entitled → **escalation** (the default); (d) `escalation`/blank + not-entitled → **escalation**; (e) backend unreachable → **device-dial floor → escalation** (curl a 502 / stop ngrok to simulate). This proves the four safety-floor branches (lapsed / drifted-safe / unreadable / blank) all resolve to the standard way. — DoD: all five observed on the Pixel; no case leaves the person un-helped.

**Checkpoint**: the safety floor is proven on hardware **before** any picker/polish exists.

---

## Phase 3 — User Story 1: Choose how help reaches you (the picker) — Priority P1

**Goal**: An entitled member picks their way in Service settings; it persists; press-help honours it.
Backend read/write first, then the app card.

**Independent Test**: On the Pixel, open Settings → Service, switch the selection, reopen (persists), then
press I NEED HELP and confirm the chosen way runs.

### Backend (howsu) — the read + write plumbing

- [x] T004 [BE] [US1] Extend `_handle_pwa_status` (~line 941) in `reply_to_airtable_webhook.py`: add `"hasHandsFree": (planName == GUARDIAN_ANGEL_PLAN_VALUE) or bool(fields.get(HANDSFREE_ADDON_FIELD_NAME, False))` and `"escalationMode": fields.get(ESCALATION_MODE_FIELD_NAME) or ESCALATION_MODE_DEFAULT` to the return dict; add the same two keys (`false` / `"escalation"`) to **every** fail-safe return in this handler. Read by display name (this handler's mode). — ✓ `py_compile` · DoD: `curl POST /pwa-status` returns both keys, correct for a hand-set record.
- [x] T005 [BE] [US1] Add `update_table1_escalation_mode(record_id, mode)` to `reply_to_airtable_webhook.py`, mirroring `update_table1_service_status` (~line 251): reject if `mode not in VALID_ESCALATION_MODES`; else PATCH `{"fields": {ESCALATION_MODE_FIELD_NAME: mode}}`. — ✓ `py_compile` · DoD: helper writes a valid value, rejects an invalid one (no PATCH).
- [x] T006 [BE] [US1] Add `POST /pwa-escalation-mode`: register `/pwa-escalation-mode` in the `do_POST` group (~line 565) and add `_handle_pwa_escalation_mode(body)` mirroring `_handle_pwa_pause` (~line 849) — lookup by `fcm_token`, validate `escalation_mode`, call T005, **apply-then-return** `200 {ok, escalation_mode}`. (depends on T005) — ✓ `py_compile` · DoD: `curl` round-trips the write; invalid value returns a clean reject (no 5xx); Airtable field updates.

### App (iona-app) — the card

- [x] T007 [P] [APP] [US1] Add the **"How help reaches you"** card to the Service pane in `/Users/Henry/iona-app/www/index.html` (tab `data-tab="service"`, beside `#service-card`): two rows (icon tile · title + one-line subtitle · right-hand control), copy **verbatim from the locked mockup**. **Depends on PRE-3.** — ✓ file loads · DoD: card renders in the Service tab on the Pixel.
- [x] T008 [APP] [US1] In `/Users/Henry/iona-app/www/app.js`, extend `readAndApplyServiceState()` (~line 961) to capture `hasHandsFree` + `escalationMode` from `/pwa-status`, then add `_renderReactiveMethodPicker()` — select the row from `escalationMode` (default `escalation`); when `hasHandsFree`, the hands-free row is selectable with an "Included" marker. (depends on T004, T007) — ✓ `node --check www/app.js` · DoD: on-device render matches the record's stored state; gaining entitlement makes the row selectable **without** changing the active selection (FR-020).
- [x] T009 [APP] [US1] Add the method-select handler in `www/app.js`: on selecting a row, `POST /pwa-escalation-mode {fcm_token, escalation_mode}`, then **re-read `/pwa-status` and re-render** (every save refetches); hands-free is only selectable when entitled. (depends on T006, T008) — ✓ `node --check` · DoD on Pixel: pick hands-free → persists across reopen → press I NEED HELP → **bridge**; switch to standard → press → **escalation**.

**Checkpoint**: an entitled member chooses, it persists, and press-help honours the choice — on device.

---

## Phase 4 — User Story 3: Invitation to unlock hands-free — Priority P2

**Goal**: A non-entitled member sees the standard way selected and the hands-free row as an add-invitation
in the same geometry; tapping it deep-links to the dashboard Account tab.

**Independent Test**: On the Pixel with a non-entitled record, the hands-free row shows the price pill in
the same row shape (no layout shift), tapping opens `#account`, and press-help still runs the standard way.

- [x] T010 [APP] [US3] In `_renderReactiveMethodPicker()` (`www/app.js`), non-entitled branch: render the hands-free row's control as the **price pill** (placeholder amount held in ONE clearly-commented constant — **not** final pricing, per FR-021), preserving the exact row geometry; tapping opens `https://iona.today/dashboard#account` via the existing `Browser.open` deep-link pattern (reuse the `dashLinks` mechanism, ~line 1480). (depends on T008) — ✓ `node --check` · DoD on Pixel: same geometry as the entitled view (no reflow), tap opens `#account`, press-help → standard way, never a mid-press choice.

**Checkpoint**: all three stories independently functional on device.

---

## Phase 5 — Polish & Cross-Cutting

- [x] T011 [P] [APP] Style the picker in `/Users/Henry/iona-app/www/style.css`, bound to **live tokens** (not mockup hex): `--surface` / `--card` / `--teal-glow` / `--amber-500` / `--radius`; row title `--fs-row-label`, subtitle `--fs-hint`; reuse `.settings-card-tile` (+`--amber`, add a teal variant); selected row = teal border + teal-soft fill (confirm the exact selected treatment against the live sheet). — ✓ `node --check` (CSS braces balanced) · DoD on Pixel: correct in **night AND day** themes; text-size stepper (US6) scales row text while safety buttons + chrome stay fixed (FR-023).
- [x] T012 [P] [APP] Confirm the **icon source** in `www/` (mockup uses Tabler via CDN) — use the app's existing icon approach rather than adding a CDN dependency; wire the teal `users` (escalation) + amber `microphone` (hands-free) tiles. — DoD on Pixel: icons render; no new external dependency added.
- [x] T013 [P] [BE] Update `/Users/Henry/.openclaw/workspace/howsu/skills/howsu_master_reference_v3_5.md`: record `escalation_mode` as the **2nd app-writable Table 1 field** (alongside `service status`); entitlement `= (planName == GA) OR handsfree_addon`; document `handsfree_addon`, `POST /pwa-escalation-mode`, the extended `/bridge/contacts` gate, and the `/pwa-status` additions. (doc only) — DoD: master reference reflects the shipped surface.
- [x] T014 [P] [APP] Copy audit of the picker strings (`index.html` / `app.js`): no "check-in" anywhere; the standard-way default never reads as "help off" (FR-022); price shown as provisional (FR-021). — DoD: reviewed, compliant.
- [x] T015 Run the full `quickstart.md` validation on the Pixel — every US scenario + the safety-floor matrix + accessibility (US6 scaling) + the regression guards (pause/restart, Beacon gate, orb, device-dial floor, offline). — DoD: all observed on device; no regressions.

---

## Dependencies & Execution Order

- **Prerequisites (PRE-1/2/3)** gate the tasks that name them: PRE-1/PRE-2 → **T001**; PRE-3 → **T007–T012**.
- **T001 (config)** blocks all backend behaviour (T002, T004–T006).
- **Phase 2 (US2 gate)** is the safety MVP — build + prove on device **before** the picker or polish.
- **Phase 3 (US1)**: backend T004→T005→T006 (same file, sequential), then app T007→T008→T009 (T008/T009 same file, sequential). T009 exercises the gate from Phase 2.
- **Phase 4 (US3)**: T010 depends on T008 (extends the same render function).
- **Phase 5 (Polish)**: T011–T014 are `[P]` (different files/repos); T015 runs last.
- **Cross-repo**: backend tasks push to the **howsu workspace**; app tasks push to **iona-app** (+ `cap copy` + `gradlew installDebug`). Never update one repo's working copy without the other where a change spans both (none here do — BE and APP changes are cleanly separated).

## Parallel opportunities

- After T001: **T002 (gate, BE)** and **T007 (card markup, APP)** touch different files/repos and can proceed in parallel — but T003's on-device proof and T008's render both need their counterpart, so verify in order.
- Polish T011 / T012 / T013 / T014 are mutually independent (`style.css` / icons / howsu doc / copy audit) — parallelizable.

## Implementation strategy

1. **PRE-1/2/3** (owner) → **T001** (config).
2. **Safety MVP** = Phase 2 (T002–T003): ship + **prove the gate + all four fallback branches on the Pixel** first. This is the load-bearing safety floor; nothing cosmetic precedes it.
3. **US1** (T004–T009): the picker read/write/render — the member can now choose.
4. **US3** (T010): the invitation for non-entitled members.
5. **Polish** (T011–T015): live-token CSS, icons, master-reference doc, copy audit, full quickstart run.

Each increment is independently on-device verifiable; stop at any checkpoint to validate before proceeding.

## Notes

- `[P]` = different files, no incomplete-task dependency. Backend edits to `reply_to_airtable_webhook.py`
  (T002/T004/T005/T006) share one file → sequential, not `[P]`.
- Definition of done is **on-device on the Pixel** — `py_compile` / `node --check` are push preconditions,
  not proof of "works".
- Surgical edits only; never regenerate `reply_to_airtable_webhook.py` in full (re-introduces hardcoded
  credentials). Import all IDs/credentials from `config.py`.
- No git commits unless the owner asks.
