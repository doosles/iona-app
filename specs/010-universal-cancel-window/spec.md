# Feature Specification: Universal Cancel Window

**Feature Branch**: `010-universal-cancel-window`

**Created**: 2026-07-18

**Status**: Settled — ruled by the 2026-07-18 owner ruling + Amendments 1–6 (vaulted as
`03 Decisions/2026-07-18 RULING — Feature 010 universal cancel window, member-configured 5–60s.md`).
Read-only trigger-site investigation complete (`02 CC Briefs/cc_findings_010_cancel_window_trigger_sites_2026-07-18.md`),
mockups approved (owner, 2026-07-18), engine hold spike prepped (`howsu/spikes/feature_010_cancel_hold_spike.py`).
Ready for `/speckit.plan` — where the spike proof run (hold-then-dial + instance-scoped cancel) is
the first thing proven. Mockups before any UI code (done); every member-facing word + audio line goes
to the copy session FIRST (copy gate before build); on-device is the only verification bar.

**Standing directive: MAXIMUM REUSE.** This feature is mostly parameterise-existing. Reuse the
existing amber-outline countdown card, the Story-4 loud audio + volume override, the six-contact
Oran's Promise list and its scroll region, the device-dial-prompt two-button confirm, the settings-row
chrome, and the acknowledge machinery. The only genuinely new mechanisms are the spinny picker, the
Phase-2 nav-locking cancel control, and the engine hold-then-dial state. All copy in this spec is
working copy — the deck/copy session rules final wording.

**Input**: Owner ruling: "Every alarm activation gets a cancel window. No exceptions. Proactive
(no-response) and reactive (Flic, app help button, hands-free) alike. One window per activation, never
two. Member-configured 5–60 seconds, default 10. The member's last word before their people are
involved — a dignity feature, not just a Doze mitigation."

> **Feature identity**: tracked via `.specify/feature.json`, not a git branch (every feature lives on
> `main`). `010-universal-cancel-window` is the spec-kit identity. 010 was reserved for the
> member-cancel feature when 009 was numbered (owner, 2026-07-13).

> **Scope note**: this spec covers the **app** (iona-app) and **engine** (howsu) legs. The **website
> leg** — the same picker on `onboarding.html` + `dashboard.html` (iona-site) writing the Memberstack
> source-of-truth field — and the **schema/sync chain** (Memberstack field → Make 1039536 → Airtable)
> are the **captain's parallel track**, outside this repo. Tracked in
> `02 CC Briefs/UPDATE_010-cancel-window-website-leg_2026-07-18.md`. The code default (10) governs
> until that chain lands, so this build proceeds independently.

---

## Scope Frame *(carried context — read first)*

**The problem today.** An alarm dials contacts with no member grace period on the proactive path, and
with an inconsistent, non-configurable one on the reactive paths:
- **No-response (proactive):** `run_escalation` fires `escalation_started` and then dials contact #1
  effectively back-to-back — "alarm → immediate make_call" (confirmed, `escalation_manager.py` between
  :508 and :546). A napping member who slept through the scheduled check-in and both reminders
  (normal-priority × Doze, by design) is woken by the alarm and has **no window** to stop a false-alarm
  call to their contacts.
- **Reactive (Flic / app button / hands-free):** a device-side ~10-second countdown already exists
  (`ALARM_CANCEL_WINDOW_SECONDS`, `app.js:786`; sole consumer `_startHelpSequence` :1728) — but it is
  **hardcoded, not member-configurable**, and a phone-in-pocket can trigger the app help button several
  times with no dignified allowance to stop it. (Owner's grounding incidents, both lived.)

**The window.** Every alarm activation — all four trigger paths, both modes — opens with a
member-configured cancel window (5–60s, 5s steps, default 10) before any contact is dialled. It is the
napper's wake-up allowance and the pocket's second chance. **One window per activation, never two:**
the Flic's hardcoded ~10s is *absorbed* into the member's configured value — it becomes the setting,
not a second gate stacked before it.

**Two clocks, one lifecycle.** Who holds the countdown depends on the trigger, because the machinery
already differs:
- **Member-initiated (Flic, app button, hands-free): device-side**, exactly as the Flic does today —
  the phone is in hand, the app runs the countdown locally, and cancels before it expires.
- **No-response: engine-side hold-then-dial.** The engine fires `escalation_started` (unchanged
  alarm-class mechanics), waits the member's window, then dials contact #1 **only if uncancelled**.
  **Silence = dial.** A dead/off/offline phone receives no push, sends no cancel, and the dial proceeds
  on time. **Fail toward escalation, always.** Never a device-side timer on this path.

**Two phases, one control (the unified model — Amendments 1–3).**
- **Phase 1 — activation countdown** (all triggers, both modes): the existing alarm screen; the
  member's window; **ONE tap cancels** — speed wins for a groggy napper or a panicked mistap, no confirm
  step. Audio sequence **siren → short spoken prompt → countdown**. Accepted tradeoff (recorded): a
  pocket could single-tap-cancel its own alarm; the loud siren + prompt makes that audible. Rejected
  alternative: hold-to-trigger (the audible countdown is the mistap defence).
- **Phase 2 — sweep running** (Oran's Promise screen, both modes): a **two-step cancel** (tap →
  confirm) halts the escalation, active from the moment the promise plays and **LOCKED the instant any
  contact presses 1** — a live bridge is never half-cancelled (the same commitment boundary the 009
  join machinery already polices). **No cancel-prompting audio during any sweep, either mode** — once
  help is being summoned the system does not suggest stopping it.
- **Navigation locks in Phase 2** (owner, 2026-07-18): the Phase-2 control overlays the Today/Settings
  nav and the tabs disable — an active alarm cannot be tabbed away from. The two-step cancel (or the
  escalation resolving) is the only way off the screen.

**The proactive screen transition (Amendment 3).** Today `escalation_started` lands the app directly
on Oran's Promise ("calling your contacts") — true at that instant under current ordering. Under 010
it is no longer true: the no-response push lands on the **activation screen** (siren → prompt →
countdown → one-tap cancel), and the promise screen appears only when the window expires and the sweep
actually starts. The transition signal is the first `escalation_advance {phase:"dialing"}` push
(engine `escalation_manager.py:607`, fired *after* `make_call`, i.e. *after* the hold; today consumed
only by the SignalAudio reducer, not a screen flip). Push mechanics unchanged.

**Bug A stays durable.** `escalation_started` stays the **sole alarm-class type**, data-only + high
priority. This feature is **copy + engine ordering**, not push mechanics. No new alarm-class types, no
notification promotion.

---

## Permutation Matrix *(mandatory gate at /specify)*

Axes: **trigger path × clock owner × cancel timing × phone state**. Every cell must be honest on all
three surfaces — **screen, dial, log**. Working copy only (copy session rules wording).

### Part A — Phase 1 (activation window; no dial yet)

| Trigger | Clock | Cancel in window | No cancel (expiry) |
|---|---|---|---|
| Flic | device | one-tap → no dial, EventLog *Cancelled Activation*, return to rest | window ends → commit (existing `commitEscalation`) → Phase 2 |
| App help button | device | one-tap → no dial, *Cancelled Activation* | window ends → commit → Phase 2 |
| Hands-free help-press | device | one-tap → no dial, *Cancelled Activation* (join layer never armed) | window ends → pre-arm join + commit → Phase 2 |
| No-response | **engine** | device sends cancel → engine aborts hold, no dial, *Cancelled Activation* | hold elapses (or phone silent/offline) → dial contact #1 → Phase 2 |

### Part B — Phase 2 (sweep running; Oran's Promise; nav locked)

| Cell | Screen | Dial | Log |
|---|---|---|---|
| Sweep in progress, not yet acknowledged | Oran's Promise, six-contact list, two-step cancel present over locked nav | contacts dialled per existing sweep | existing escalation rows |
| Two-step cancel completed (before any press-1) | screen closes / returns to rest | remaining contacts halted via acknowledge machinery | *Cancelled Activation (post-dial)* — distinct vocabulary; routes through ack path |
| A contact presses 1 (bridge/accept) | two-step control disappears (locked) | live bridge established (009 machinery) | existing `Contact Acknowledged (IVR)` / bridge terminal |
| Late cancel arrives after press-1 | ignored for cancel — bridge is the resolution | no effect | (no new state) |

### Part C — Edge rows (all must hold)

- **Offline/dead phone, no-response:** no push received → no cancel possible → engine dials on time
  (silence = dial). The hold is engine-side and time-driven, never device-gated.
- **Stale cancel:** a cancel bearing a previous run's token must NOT suppress a later genuine run
  (instance-scoping, `(record, run_token)`).
- **5-second window:** the spoken prompt must not eat the window it announces. Floor is 5 (ruled); the
  5s-viable prompt length is a **copy-session constraint** (short prompt, or the copy session raises
  the audible-prompt floor while keeping the picker floor at 5).
- **Non-PWA (SMS-channel) member:** out of scope — no alarm surface exists for them (Amendment /
  decision: 010 is app-only). No behaviour change.
- **Cancel exactly at boundary:** a cancel landing as the window hits zero is honoured up to the final
  re-check; once the dial is placed it is a Phase-2 late cancel (ack path), never a half-placed call.
- **Restart during hold:** the engine process dies mid-window → on restart, a past-due orphaned hold
  dials immediately, a within-window one re-arms the remainder; a cancelled one stays cancelled. The
  pending dial is never lost. *(FR-022)*
- **Cross-process cancel:** the cancel (webhook) reaches the runner's hold via durable state, not shared
  memory. *(FR-023)*

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — The napper cancels before their people are called (Priority: P1)

A proactive member naps through the scheduled check-in and both reminders. The alarm fires and wakes
them. Their device shows the activation screen with a loud siren, a short spoken prompt, and a
countdown set to their configured window (e.g. 60s). They tap once to cancel; no contact is called;
the event is recorded in their own history as a cancelled activation.

**Acceptance Scenarios**:
1. **Given** a no-response alarm has fired for a member with cancel window 60s, **When** the member
   taps cancel at t=20s, **Then** no contact is dialled, the engine hold is aborted for this run only,
   and an EventLog *Cancelled Activation* row is written.
2. **Given** the same alarm, **When** the member does nothing, **Then** at t=60s contact #1 is dialled
   and the screen transitions to Oran's Promise on the first "dialing" advance.
3. **Given** the member's phone is offline/dead when the no-response alarm is due, **Then** no push is
   delivered, no cancel is possible, and the engine dials contact #1 on time.

### User Story 2 — The pocket mistap is caught (Priority: P1)

A member's phone is in their pocket, screen unlocked; the app help button (or Flic) is pressed
accidentally. The loud siren + spoken prompt is audible from the pocket; the member hears it and taps
cancel within the window. No contacts are called.

**Acceptance Scenarios**:
1. **Given** the app help button is pressed, **When** the device countdown is running, **Then** the
   siren + prompt play at overridden volume and a single tap on cancel stops everything with no dial.
2. **Given** the member's configured window is 5s, **When** the button is pressed, **Then** the spoken
   prompt is short enough to leave usable cancel time before the countdown reaches zero (copy-session
   constraint).

### User Story 3 — Stopping the sweep after it starts (Priority: P2)

The window expired (or a member-initiated summon committed), contacts are being reached, and the
member decides to stop it. The Oran's Promise screen shows a calm, non-CTA cancel control over a locked
navigation bar. Cancelling takes two steps (tap → confirm). Once a contact has answered and pressed 1,
the control is gone — the live conversation is the resolution.

**Acceptance Scenarios**:
1. **Given** the sweep is running with no contact yet acknowledged, **When** the member taps the
   Phase-2 control and confirms, **Then** further contacts are halted via the acknowledge machinery and
   a *Cancelled Activation (post-dial)* row is written.
2. **Given** a contact has pressed 1, **When** the member attempts to cancel, **Then** the control is
   absent/locked and the bridge proceeds.
3. **Given** the sweep is running, **When** the member tries to navigate to Today/Settings, **Then**
   navigation is locked and no tab responds.

### User Story 4 — One configurable window, set by the member (Priority: P2)

From Account settings, the member opens a Cancel window screen with a spinny picker (5–60s, 5s steps,
default 10) and saves their value. Every subsequent activation — proactive or reactive — uses it.

**Acceptance Scenarios**:
1. **Given** the picker, **When** the member selects 30 and saves, **Then** the Memberstack field
   `alarm-cancel-window` is written 30 and future device countdowns and engine holds use 30.
2. **Given** a member who never set a value, **Then** all activations use the default 10.
3. **Given** the Flic's historical ~10s device countdown, **Then** it now reads the member's value —
   one window, never two.

### Edge Cases
- Window set to 5 with a long spoken prompt → copy-session must keep the prompt short (Part C).
- Cancel tapped at the exact zero boundary → honoured up to the final re-check, else it is a Phase-2
  late cancel.
- App killed during the engine hold (no-response) → cold-wake renders the activation screen from the
  `escalation_started` push; a cancel requires the app to be foreground enough to send it, else silence
  = dial.
- Two rapid summons (duplicate) → existing already-connecting acknowledgement; one window, one run.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every alarm activation MUST open with a member-configured cancel window before any
  contact is dialled — all four trigger paths (Flic, app help button, hands-free, no-response), both
  clock modes. No exceptions on PWA-channel members.
- **FR-002**: The window MUST be member-configured **5–60 seconds in 5-second steps, default 10**, set
  via a spinny picker on its own screen opened from Account settings. Default 10 applies when unset.
- **FR-003**: There MUST be exactly **one window per activation**. The Flic's historical hardcoded
  `ALARM_CANCEL_WINDOW_SECONDS` MUST be absorbed into the member's configured value — no second gate.
- **FR-004**: Member-initiated triggers (Flic, app button, hands-free) MUST run the countdown
  **device-side**, reusing the existing `_startHelpSequence` machinery, parameterised by the member's
  value.
- **FR-005**: The no-response trigger MUST run an **engine-side hold-then-dial**: after
  `escalation_started` is emitted, wait the member's window, then dial contact #1 **only if
  uncancelled**. The hold inserts at the single site `escalation_manager.run_escalation` between the
  `escalation_started` push (~:508) and the first `make_call` (~:546). The webhook's `_fire_one_touch`
  (sweeps 2..N) MUST NOT be wrapped.
- **FR-006**: **Silence = dial.** A no-response member who sends no cancel — including a dead/off/
  offline phone that received no push — MUST be dialled on time. The engine hold MUST be time-driven,
  never device-gated. Fail toward escalation, always.
- **FR-007**: The engine hold MUST be **instance-scoped (run-token class)**: a cancel MUST cancel THIS
  run only, keyed on `(record_id, run_token)`; a stale cancel bearing a previous run's token MUST NOT
  suppress a later genuine run. Reuse the existing `LATEST_RUN_TOKEN` + `_note_run_token` GC discipline.
- **FR-008**: **Phase 1 cancel is ONE tap, no confirm.** A single tap on the activation screen cancels
  with no dial placed.
- **FR-009**: The activation audio sequence MUST be **siren → short spoken prompt → countdown**,
  reusing the Story-4 loud audio + volume override (not rebuilt). The spoken prompt duration MUST NOT
  exceed the window it announces (5s case = copy-session constraint).
- **FR-010**: The hardcoded spoken "…within 10 seconds" (`app.js:161`) MUST be parameterised to the
  member's configured value.
- **FR-011**: **Phase 2 cancel is TWO steps** (tap → confirm), reusing the device-dial-prompt
  two-button confirm (green "Yes, stop" + ghost "Keep calling"). Working label: "Stop calling your
  contacts". It MUST be active from the moment the promise plays.
- **FR-012**: The Phase-2 control MUST **LOCK the instant any contact presses 1** — no cancel after a
  bridge/accept is established. This is the same commitment boundary the 009 join machinery polices.
- **FR-013**: **No cancel-prompting audio during any sweep**, either mode.
- **FR-014**: Phase 2 MUST **lock navigation**: the cancel control overlays the Today/Settings nav and
  the tabs are disabled; the two-step cancel (or the escalation resolving) is the only exit.
- **FR-015**: The Phase-2 control's border MUST be **obvious but calm** — a semi-transparent amber
  outline, NOT a CTA (no glow/pulse). The system does not invite stopping an active alarm.
- **FR-016**: The proactive `escalation_started` push MUST raise the **activation screen** (not Oran's
  Promise). The screen MUST transition to Oran's Promise on the first `escalation_advance
  {phase:"dialing"}` push. Push mechanics unchanged; `escalation_started` stays the sole alarm-class
  type, data-only + high.
- **FR-017**: A **late cancel** (a cancel arriving after the first dial) MUST flow into the **existing
  acknowledge machinery** — no new state. Route it like a press-1 acknowledge: set
  `ESCALATION_ACKNOWLEDGED[(record, live_token)]`, patch the row, call `_send_escalation_outcome_once`;
  the existing callback halt stops the rest.
- **FR-018**: A cancelled activation MUST be recorded in EventLog with **vocabulary distinct by phase**
  (cancelled-in-window ≠ post-dial cancel ≠ acknowledged). Status is singleLineText → a code-whitelist
  addition to `VALID_STATUS_VALUES` only, no Airtable schema change. Any new "cancelled" Status MUST
  be registered in BOTH the runner's `RESPONDED_STATUSES` and `response_handler.ALREADY_RESPONDED_STATUSES`
  or the runner mis-handles it. All Status strings are owner-reserved (copy session).
- **FR-019**: The setting's source of truth is the Memberstack custom field `alarm-cancel-window`; the
  engine reads Airtable `cancel_window_seconds` off the existing `get_table1_fields` dict (zero new
  read) with a clamp resolver `[5,60] default 10` modelled on `_resolve_sweep_count`. No `planName`
  check anywhere (Amendment 6 — no plan gate).
- **FR-020**: MAXIMUM REUSE — no new UI surfaces or mechanisms where an existing one serves. New only:
  the spinny picker, the Phase-2 nav-locking control, the engine hold state.
- **FR-021**: All member-facing copy and audio (activation label, spoken prompt, Phase-2 control label,
  cancelled-activation EventLog vocabulary) is owner-reserved to the copy session; this spec's wording
  is working copy.
- **FR-022 (restart-during-hold — captain-mandated P2)**: If the engine process dies mid-window, the
  pending dial MUST NOT be lost — fail toward escalation. The no-response hold MUST write **durable
  state** (`Escalation Hold — Cancel Window` EventLog status carrying `dial_due_at` + `run_token`)
  *before* the wait. On startup the runner MUST sweep orphaned holds: **past-due → dial immediately;
  still within window → re-arm the remaining seconds**. The 300s runner cycle is too coarse to *time*
  the window, so timing stays a precise in-process wait; the durable state is the restart backstop, not
  the timing source. Proven in `howsu/spikes/feature_010_cancel_hold_spike.py` (durable suite).
- **FR-023 (cross-process cancel)**: The no-response hold runs in the **runner** process; its cancel
  arrives at `/pwa-respond` in the **webhook** process (confirmed: `reply_to_airtable_webhook.py:2411`
  vs `periodic_taskflow_runner.py:270`). The in-memory registry cannot bridge this. The cancel MUST
  therefore be a **durable marker** the webhook writes and the runner's hold reads (and re-checks
  immediately before `make_call`), keyed on and validated against the live `run_token` (a stale token's
  cancel is rejected — FR-007). The user_alert path (member-initiated PWA help) already held its window
  device-side, so the engine does NOT hold again there — the engine hold is a **no-response-only**
  mechanism.

### Key States *(no data entities beyond the one setting — this feature defines moments)*

- **Setting**: `cancel_window_seconds` (Airtable Table 1, numeric) ← Memberstack `alarm-cancel-window`.
  Range 5–60, step 5, default 10.
- **Activation (Phase 1)**: siren + prompt + countdown; one-tap cancel; no dial. Clock = device
  (member-initiated) or engine (no-response).
- **Holding (engine, no-response only)**: between `escalation_started` and the first `make_call`;
  cancellable via `(record, run_token)`; silence → dial.
- **Sweeping (Phase 2)**: Oran's Promise; nav locked; two-step cancel; locks at press-1.
- **Cancelled-in-window**: no dial; distinct EventLog vocabulary.
- **Cancelled-post-dial (late)**: acknowledge machinery; distinct vocabulary.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes
- **SC-001**: For every trigger path, a cancel within the window results in **zero contacts dialled**.
- **SC-002**: For every trigger path, no cancel within the window results in contact #1 dialled within
  the window duration ± the poll interval.
- **SC-003**: A no-response member who is offline is dialled on time (silence = dial) — verified with a
  powered-off / airplane-mode device.
- **SC-004**: A stale cancel from a prior run never suppresses a later run (spike + harness).
- **SC-005**: In Phase 2, navigation is locked (no tab responds) and a contact press-1 removes the
  cancel control.
- **SC-006**: A cancelled activation appears in the member's own history with phase-distinct vocabulary
  and does not re-trigger the schedule.
- **SC-007 (on-device bar)**: a real pocket-style mistap cancel and a set-to-60 wake-up cancel both
  succeed on the physical Pixel; a genuine expiry dials.

---

## Clarifications

### Session 2026-07-18 *(owner ruling + Amendments 1–6; vaulted as `03 Decisions/2026-07-18 RULING — Feature 010…`)*

- **Q: Which triggers get the window?** → **A:** All four; app-only (PWA). SMS-channel members
  unchanged (no alarm surface). *(Decision 1)*
- **Q: Range / steps / default?** → **A:** 5–60s, 5s steps, default 10. Picker on its own screen from
  Account settings, spinny wheel. *(Amendment 6 confirmed "5 to 60"; captain's 30s cap withdrawn.)*
- **Q: One window or two (Flic constant)?** → **A:** One. The Flic's ~10s is absorbed into the member
  value.
- **Q: Who holds the clock?** → **A:** Member-initiated = device-side; no-response = engine-side
  hold-then-dial, silence = dial.
- **Q: Phase-1 cancel — one tap or confirm?** → **A:** One tap, no confirm (Amendment 2 — speed wins).
- **Q: Phase-2 placement?** → **A:** Option C — the two-step control overlays a **locked nav**; obvious
  but not a CTA (calm border). Working label "Stop calling your contacts". *(Owner, mockup approval.)*
- **Q: Does the mid-escalation control already exist to reuse?** → **A:** No — it is net-new (the
  live-escalation screen is deliberately actionless today). Model the confirm on `#device-dial-prompt`.
  *(Findings correction.)*
- **Q: Activation → Promise transition signal?** → **A:** First `escalation_advance {phase:"dialing"}`
  (post-hold). `escalation_started` raises the activation screen. *(Amendment 3, confirmed in findings.)*
- **Q: Plan gating (Beacon)?** → **A:** **No gate.** Picker for all plans, no plan-conditional logic.
  *(Amendment 6.)*
- **Q: Six-contact Oran's Promise scroll?** → **A:** Already accommodated and scrollable — owner-verified
  on device 2026-07-18.
- **Residual (not a blocker):** the 5s-window spoken-prompt length is a **copy-session constraint** —
  the picker floor stays 5; the copy session ensures the prompt fits (or raises only the audible-prompt
  floor).

---

## Assumptions
- The engine `escalation_started` push is PWA-only today; 010's universality is universal-among-PWA
  (SMS members have no alarm surface). Confirmed as scope, not a gap.
- `escalation_advance {phase:"dialing"}` fires only after a real `make_call`, so it is a reliable
  post-hold "we are now dialling" signal. (Findings confirmed; the plan's spike/wiring re-verifies on
  device.)
- The device can send an in-window cancel to the holding engine run via a new value on the existing
  `/pwa-respond` channel (mechanism decided at plan; no new endpoint).
- The code default (10) governs until the Memberstack field + Make 1039536 mapping + Airtable field
  land (captain's parallel track), so app/engine build proceeds independently.

## Out of Scope
- Any member-facing copy or audio wording (owner-reserved → copy session).
- Reminder / scheduled-push priority changes (normal-priority × Doze is by-design, ruled).
- R3/R4 direct-fix brief (white-screen handler, frozen-timer fixes) — separate.
- Sweep mechanics (009, closed) and AMD (exhausted).
- The website leg (onboarding + dashboard picker) and the Memberstack/Make/Airtable schema chain —
  captain's parallel track, tracked in `UPDATE_010-cancel-window-website-leg_2026-07-18.md`.
- Plan-gating / any `planName` logic (Amendment 6 — ruled out).
