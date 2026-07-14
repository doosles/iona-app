# Feature Specification: A Physical Button That Summons Help

**Feature Branch**: `005-physical-help-button`

**Created**: 2026-07-02

**Status**: Draft

**Input**: User description: "Give a person a small physical button they keep nearby — on the table,
clipped to a pocket — so that reaching for help never depends on finding, unlocking, and navigating a
phone. One press on a real, satisfying, clicky button and help is on its way, exactly as if they had
pressed the help control in the app. The button is a second front door into the one help path that
already exists — not a second system with its own rules. It reaches help through the phone (phone on,
in range, running the service); it does not work without the phone. Pairing happens once, in calm
settings. A deliberate press-and-hold summons help. A press must act now or not at all, and a press
during a running help sequence must be absorbed, never stacked."

## User Scenarios & Testing *(mandatory)*

This feature gives a person a **second front door into the help sequence they already have.** It does
not create a new help path — a press-and-hold on the physical button starts the *same* sequence the
in-app help control starts, including the same brief chance to cancel and the same reaching of the
person's people. The phone does the work from across the room. The honest scope is stated plainly:
the button reaches help *through the phone*, so the phone must be on, within range, and running the
service. Because this rides the reactive path, it carries the higher reliability bar (Constitution
I.4): every guarantee below must hold visibly, never fail silently.

### User Story 1 - Summon help with a single hold-press (Priority: P1)

A person's phone is charging in the kitchen; they are in the armchair. Something is wrong. They press
and hold the button beside them. The same help sequence they already know begins — the same brief
chance to cancel, then the same reaching of their people — with the phone doing its work from across
the room. The button gives them a felt click and a visible light so there is never "did that work?"
doubt; the phone then shows the same screens it always shows for a help sequence.

**Why this priority**: This is the whole point of the feature — reaching help without finding,
unlocking, and navigating a phone. It is a viable slice on its own: a paired button that starts the
existing sequence delivers the core value even before the setup polish is perfected.

**Independent Test**: With a paired button and the phone on and in range, press and hold the button and
confirm the existing help sequence runs end-to-end on the device — the cancel window appears, then the
person's people are reached — identical to pressing the in-app help control. Verified on the Pixel.

**Acceptance Scenarios**:

1. **Given** a paired button and the phone on and in range, **When** the person presses and holds the
   button, **Then** the existing help sequence runs end-to-end, identical to the in-app press, and is
   verified on the device.
2. **Given** the person has just pressed and held the button, **When** the sequence begins, **Then** the
   same cancel window appears and behaves exactly as it does for the in-app help control.
3. **Given** the person presses and holds the button, **When** the press registers, **Then** the button
   confirms it with a felt click and a visible light, and the phone shows the same help-sequence screens
   it always shows.
4. **Given** a knock, a brush, or a fidget against the button, **When** it is not a deliberate
   press-and-hold, **Then** no help sequence starts (the hold gesture guards against false alarms).

---

### User Story 2 - A press acts now, or not at all — and never stacks (Priority: P1)

The button's honesty rests on two safety rules. First: a press summons help *now* or not at all. If a
press somehow arrives late — the person pressed while out of range and the press is delivered when they
walk back in — it must NOT raise a fresh alarm minutes later; old presses are dropped, only a
just-pressed press summons. Second: a press that lands while a help sequence is already running is
absorbed — it must never stack a second sequence on top of a live one.

**Why this priority**: This is the safety floor for this entry path and carries the reactive higher
reliability bar (Constitution I.4). A stale press firing a phantom alarm, or a second press stacking a
duplicate sequence, would each be a safety failure — not cosmetic. These guarantees are co-critical with
the core press and must hold before the feature can ship.

**Independent Test**: (a) Press the button while out of range, then walk back into range, and confirm no
late help sequence fires. (b) With a help sequence already running, press and hold again and confirm the
second press is absorbed with no second sequence started.

**Acceptance Scenarios**:

1. **Given** the person pressed the button while out of range, **When** they walk back into range and the
   delayed press is delivered, **Then** no help sequence starts — the stale press is dropped.
2. **Given** a help sequence is already running for this person, **When** the button is pressed and held
   again, **Then** the second press is absorbed and no second sequence is started.
3. **Given** a delivered press, **When** the system evaluates it, **Then** it acts only if the press is
   recent enough to be a live summon; otherwise it does nothing at all.
4. **Given** a press is dropped or absorbed, **When** this happens, **Then** the person is never left with
   a phantom sequence and the live sequence (if any) is never disturbed.

---

### User Story 3 - Paired once, paired for good (Priority: P1)

Setup should never have to be redone. Once the button is paired, it stays paired — through app restarts,
phone restarts, and battery changes — and keeps working without the person ever repeating the setup flow.

**Why this priority**: A button that quietly stops working after a phone reboot is worse than no button,
because the person believes they still have it. Durable pairing is a reliability guarantee on the
reactive path, so it ranks alongside the core press and the safety rules.

**Independent Test**: Pair the button, then kill and relaunch the app, then reboot the phone, then change
the button's battery — and after each, confirm a press-and-hold still starts the help sequence with no
re-pairing.

**Acceptance Scenarios**:

1. **Given** a paired button, **When** the app is killed and relaunched, **Then** the button still summons
   help with no re-pairing.
2. **Given** a paired button, **When** the phone is rebooted, **Then** the button still summons help with
   no re-pairing.
3. **Given** a paired button, **When** its battery is changed, **Then** it remains paired and still
   summons help.
4. **Given** the app has just come back to life after being closed or the phone restarting, **When** it
   resumes, **Then** it re-attaches to the paired button on its own, without the person doing anything.

---

### User Story 4 - Set it up once, calmly (Priority: P2)

Pairing happens once, in calm settings — never mid-crisis. The person (or a family member setting up for
them) is walked through a short, friendly flow: an introduction to what the button is for, a step where
the app finds the button, a confirming press so they know it is the right one, and a clear "your button
is ready." When the phone itself will ask a question — the phone asks permission to connect to nearby
devices — the flow explains it in one calm line beforehand, so it never reads as alarming.

**Why this priority**: The core press cannot happen without pairing, but the *quality* of the setup flow
(its calm, one-idea-per-screen walkthrough) is a polish layer over the pairing capability itself. It
ranks below the guarantees that make an already-paired button trustworthy.

**Independent Test**: On a real phone with no button yet paired, enter the pairing flow from settings and
complete introduce → find → confirm-press → ready, including answering the phone's own permission
question, and confirm the button ends up paired with no confusing moment.

**Acceptance Scenarios**:

1. **Given** a person in calm settings with no button paired, **When** they enter the pairing flow, **Then**
   they are walked through introduce → find → confirm-press → ready, one idea per screen, in plain language.
2. **Given** the flow reaches the step where the phone asks permission to connect to nearby devices,
   **When** that system question is about to appear, **Then** the flow has already explained it in one calm
   line so it does not read as alarming.
3. **Given** the app is finding the button, **When** the person presses the button to confirm, **Then** the
   flow recognises that specific button and advances to "your button is ready."
4. **Given** the flow completes, **When** the person leaves settings, **Then** the button is paired and
   ready, and setup never has to be repeated (see US3).

---

### User Story 5 - Know it's connected, and remove it (Priority: P2)

After pairing, Service settings shows a row confirming the button is connected, and offers a way to remove
it. Removing the button means pressing it no longer summons help; pairing again works cleanly afterwards.

**Why this priority**: Seeing the button's status and being able to remove it are important for trust and
control, but they sit above a fully working, safely guarded, durably paired button — so they rank after
the P1 guarantees.

**Independent Test**: With a paired button, confirm settings shows a connected row; use the remove control
and confirm a subsequent press no longer summons help; then re-enter the pairing flow and confirm the
button can be paired again.

**Acceptance Scenarios**:

1. **Given** a paired button, **When** the person opens Service settings, **Then** a row shows the button is
   connected.
2. **Given** a paired button, **When** the person removes it in settings, **Then** pressing the button no
   longer summons help.
3. **Given** a button that was removed, **When** the person runs the pairing flow again, **Then** the button
   pairs successfully and summons help once more.

---

### User Story 6 - Reassure yourself the button works, any time (Priority: P2)

A person — or the family member who set it up — wants to *know* the button will work before they ever need
it, and to check again now and then without wondering. A **double-tap** on the button (a gesture kept
distinct from the summon hold) runs a real **end-to-end test**: the press travels the same road a true
summon would — button to phone to the service — and comes back with a clear, friendly confirmation across
**sound, the orb, a ping, and a felt buzz**: "Iona heard that — your button's working." No one is contacted;
nothing is raised. If the round-trip cannot complete — phone asleep, out of range, service stopped — the
person is told honestly that it could not be confirmed, and that "no answer" is **itself recorded**, so a
button that has quietly stopped working can never masquerade as fine. The same test is available as a **"Test
service"** control in settings.

**Why this priority**: The core summon and its safety rules must come first; the self-test is reassurance
built on top of a working path. But it is more than polish — it is the person-facing defence against *silent
death* (a killed listener, a device that stopped the service), turning "I hope it still works" into "I just
checked, and it does" — with a durable, carer-visible record.

**Independent Test**: With a paired button, double-tap and confirm the multi-channel confirmation appears and
a passing test is recorded, with no help sequence and no contact reached. Then stop the listener and
double-tap again, and confirm the person gets an honest "couldn't confirm" and a no-response test is recorded.

**Acceptance Scenarios**:

1. **Given** a paired button and a running service, **When** the person double-taps, **Then** an end-to-end
   test runs, a multi-channel confirmation appears, and a passing test is recorded — with **no** help
   sequence started and **no one** contacted.
2. **Given** the summon gesture and the double-tap, **When** either is used, **Then** a summon never runs a
   test and a test never summons help (the gestures are kept distinct).
3. **Given** the service cannot be reached (phone asleep / out of range / stopped), **When** the person
   double-taps, **Then** they are told honestly it could not be confirmed, and a no-response test is recorded.
4. **Given** the person prefers to check from the app, **When** they use the "Test service" control in
   settings, **Then** the same end-to-end test runs (app → service → confirmation), recorded the same way.
5. **Given** the person chose the **short-press** summon, **When** any press lands — including a tremor the SDK
   reads as a double-click — **Then** it **summons help**, never runs a test (the button-based test is off for
   short-press users; they test via the in-app "Test service" control). [FR-026a]

---

### Edge Cases

- **Phone off, out of range, or service not running** → the button cannot reach help, because it reaches
  help *through* the phone. This is the honest, stated scope ("your phone can be across the room," not
  "works with no phone at all"), not a defect. How the person is helped to understand this boundary is a
  copy concern, not a promise of phoneless operation.
- **A stale press delivered late** (pressed out of range, delivered on return) → dropped; no help sequence
  fires (US2). Only a just-pressed press summons.
- **A press during a running help sequence** → absorbed; no second sequence stacks (US2). The live sequence
  is never disturbed.
- **A knock or fidget** → does not summon; only a deliberate press-and-hold does (US1).
- **App killed / phone rebooted / battery changed** → the button remains paired and re-attaches on its own
  (US3).
- **The person cancels within the cancel window** → identical to cancelling an in-app help sequence; the
  button press inherits the existing cancel behaviour, nothing new (US1).
- **The person presses before pairing has completed** → nothing summons; there is no paired button yet.
- **The button is removed while a help sequence is running** → the running sequence is unaffected (removal
  governs future presses only; it never disturbs a live sequence — consistent with US2's "never disturb the
  live sequence").
- **A double-tap (service test)** → runs the end-to-end test and is recorded; it never opens the cancel
  window or reaches anyone. A double-tap *during* a running help sequence is a test only — it never disturbs
  the live sequence (US6). **(Hold-summon users only** — see next.)
- **A short-press summoner's tremor read as a double-click** → still **summons help.** For short-press summon,
  every press gesture routes to summon and the button-based test is disabled (FR-026a) — a crisis press can
  never be downgraded to a "test" by gesture classification.
- **A service test when the phone is asleep / out of range / the service stopped** → returns *no-response*,
  which is recorded; the person is told honestly it could not be confirmed — never a false "working" (US6).
- **The button's battery runs low** → a calm, early heads-up (status row + gentle notification) and a
  recorded event, so the button is changed before it dies; a dying button battery is never a silent failure
  (FR-032).
- **The app is closed (not just backgrounded)** → the press **still summons**: a full-screen intent launches
  the app into the help sequence and **wakes the phone over the lock screen** (FR-033). Where the OS denies
  the full-screen launch (Android 14+/Play), the press is still **loud** — a sounding max-priority
  notification (FR-033a) — never silent.
- **Phone off / no OS / powered down** → the button cannot reach help (it reaches help *through* the phone).
  Distinct from "app closed", which now works — the honest boundary is a phone that isn't running, not an app
  that isn't open.

## Clarifications

### Session 2026-07-02

- Q: Is the summon gesture fixed, or can the person choose it? → A: **The person chooses** their summon
  gesture in settings — either a short single-press or a press-and-hold. **CORRECTED 2026-07-04 (owner,
  telecare norm): the DEFAULT is single-press** — the muscle memory older users already have from pendants /
  pull-cords / wall buttons; **press-and-hold is the opt-in** (accident-resistant, for anyone who prefers it).
  Double-press is reserved for the self-test **when the gesture is hold** (short-press users test via the
  in-app "Test service" control). Neither option is "wrong" or unsafe. (OQ1; corrected 2026-07-04)
- Q: Reliable always-listening needs a permanent, non-dismissable notification — accept it, and what copy? →
  A: **Accepted** as the price of an always-armed button; the ongoing notification reads **"Iona is here for you."**
  — calm, name-led, no banned terms. (OQ2)
- Q: Is the button available to all plans or gated to an entitlement? → A: **Available to all plans.** The
  button triggers the reactive summon, which is the universal safety floor and is never gated; button
  hardware/pricing is a separate commercial decision that does not gate the summon. (OQ3)
- Q: Where do the pairing entry and connected-status row live? → A: In the **Service tab**, as their own
  row/section directly below the reactive-method picker (feature 004) — the button is a reactive-help
  control and belongs with "how help reaches you." (OQ4)

### Session 2026-07-02 (later)

- Q: What does a double-tap do, and how does a person reassure themselves the button works? → A: A double-tap
  runs a **full end-to-end service test** — the press travels the same road a real summon would (button →
  phone → the service) and returns a **multi-channel confirmation** (sound, orb, ping, haptic), **without
  contacting anyone**. It is also offered as an explicit **"Test service"** control in settings. (OQ5)
- Q: Is only a passing test recorded, or failures too? → A: **Both.** Every service test writes to the event
  log — a **pass** when the round-trip confirms and a **no-response** when it does not — so a button that has
  quietly stopped working can never masquerade as fine. (OQ6)
- Q: Reboot and aggressive power management can silently kill the always-armed listener — how is that
  handled? → A: The listener **re-arms on boot without the person opening the app**, a **battery-optimization
  exemption** is offered in calm setup, and where a device's power management still wins, the **service test
  surfaces it honestly** (a logged no-response) rather than failing silently. (OQ7)

## Requirements *(mandatory)*

### Functional Requirements

**The trigger (a second front door into the existing help sequence)**

- **FR-001**: A deliberate press of the paired physical button, using the person's chosen summon gesture
  (a single short press by default), MUST start the person's existing help sequence — the very same sequence the
  in-app help control starts — including its existing cancel window. The button MUST NOT create a new or
  parallel help path.
- **FR-002**: The help sequence started by the button MUST be indistinguishable, from the person's point of
  view, from the sequence started by the in-app help control (same cancel window, same reaching of their
  people, same on-screen sequence).
- **FR-003**: The **default** summon gesture MUST be **a single short press** — the telecare-familiar action
  (pendants, pull-cords and wall buttons are all single immediate presses), so the most important control
  uses muscle memory the person already has rather than an unfamiliar gesture learned in the worst moment.
  The person MAY change their summon gesture to **press-and-hold** in settings (FR-005) if they prefer a
  button that cannot be pressed by accident. Both are valid; neither is unsafe. *(Corrected 2026-07-04 —
  earlier drafts defaulted to press-and-hold.)*
- **FR-004**: The button MUST give the person immediate confirmation that it registered the press — a felt
  click and a visible light — so there is never "did that work?" doubt.
- **FR-005**: The person MUST be able to choose their summon gesture in settings — either a **short
  single-press** (the default) or a **press-and-hold** (opt-in). The chosen gesture is what FR-001 acts on.
  Settings copy MUST frame single-press as the standard ("one press for help") and press-and-hold as the
  alternative ("press and hold, if you'd prefer a button that can't be pressed by accident"); neither copy
  may imply the person chose wrong or that either option is unsafe. Double-press is reserved for the
  **self-test / service test** (US6, FR-025–FR-029) **only when the summon gesture is hold**; when the summon
  gesture is short-press (the default), double-press — and every other press — summons (FR-026a), and the
  test lives in the in-app "Test service" control.
- **FR-005a** *(added 2026-07-04 — pre-launch safety)*: The chosen summon gesture MUST **persist across a
  reboot** — stored natively and read at process start (before the app opens, before the boot-armed listener
  takes its first press), so the correct gesture is active on the **very first post-reboot press**. Because
  single-press is now the default path, a restart MUST NEVER silently move a person onto an unfamiliar hold
  gesture. Verified on device: set single-press → reboot → without opening the app, a single press summons.

**Honest scope and the safety rules**

- **FR-006**: The button reaches help **through the phone**. The phone MUST be on, within range, and
  running the service for a press to reach help. The feature MUST NOT imply phoneless or independent
  cellular operation.
- **FR-007**: A press MUST **act now or not at all.** A press that is delivered late (e.g. pressed while out
  of range and delivered on return) MUST NOT start a help sequence. Only a just-pressed press summons; stale
  presses are dropped. *(Implementation, verified on device 2026-07-02: a QUEUED press — buffered while
  disconnected, delivered on reconnect — fires only if fresh (pressed ≤15 s before reconnect), judged by a
  same-clock delta `getReadyTimestamp() − pressTimestamp` (the SDK's event timestamp is a button-relative
  clock, so only the delta is reliable). An older one is dropped, but **loudly** — native log + a calm
  on-screen note — never silent. A live press is always honoured.)*
- **FR-008**: A press that lands while a help sequence is already running for this person MUST be
  **absorbed** — it MUST NOT start a second sequence, and MUST NOT disturb the live one. *(Corrected on
  device 2026-07-02: enforced by a **countdown-scoped in-flight guard** (`_summonCountdownActive`) covering
  the cancel-window countdown that the committed-phase `escalation_state` guard missed — scoped to the
  countdown so a terminal's "I NEED HELP" retry is never blocked and the flag can't stick. A hung escalation
  (lost outcome FCM) self-heals via a 20-min backstop that re-arms + logs. Hardens the in-app path too.)*
- **FR-009**: Dropping a stale press or absorbing a duplicate MUST be handled visibly and deterministically
  on the reactive path — never by silent failure (Constitution I.4).

**Setup (pair once, calmly)**

- **FR-010**: The person MUST be able to enter a one-time pairing flow from settings, structured as four
  plain-language steps, one idea per screen: **introduce → find → confirm-press → ready.**
- **FR-011**: When the phone itself will ask its own permission question (permission to connect to nearby
  devices), the flow MUST explain that question in one calm line *before* it appears, so it never reads as
  alarming.
- **FR-012**: The **confirm-press** step MUST require the person to press the button so the app confirms it
  has found the correct, specific button before completing pairing.
- **FR-013**: On completion, the flow MUST show a clear "your button is ready" confirmation.
- **FR-014**: Pairing MUST happen only in calm settings — never as part of, or during, a help sequence.

**Durability (pair once, stays paired)**

- **FR-015**: Once paired, the button MUST remain paired across app restarts, phone restarts, and battery
  changes, and MUST keep working without the person repeating the pairing flow.
- **FR-016**: When the app resumes after being closed or the phone restarting, it MUST re-attach to the
  paired button on its own, with no action required from the person.

**Status and removal**

- **FR-017**: After pairing, settings MUST show a row indicating the button is connected.
- **FR-018**: The person MUST be able to remove the button from settings; after removal, pressing the button
  MUST no longer summon help.
- **FR-019**: After removal, the pairing flow MUST be able to pair the button again cleanly.
- **FR-020**: Removing the button MUST govern only future presses; it MUST NOT disturb a help sequence that
  is already running.

**Where it lives, availability, and any ongoing indicator**

- **FR-021**: The pairing entry and the connected-status row MUST live in the **Service tab**, as their own
  row/section directly below the reactive-method picker (feature 004) — the button is a reactive-help
  control and belongs with "how help reaches you".
- **FR-022**: The physical button MUST be **available to all plans**, because the reactive summon it
  triggers is the universal safety floor, which is never gated. Button hardware and pricing are a separate
  commercial decision that MUST NOT gate the summon.
- **FR-023**: Keeping the phone reliably able to receive the button's press while backgrounded requires an
  ongoing, always-present notification; this is **accepted** as the price of an always-armed button. The
  notification MUST read **"Iona is here for you."** — calm, name-led, and compliant with the vocabulary rules
  (FR-024). It MUST NOT be alarming or use a banned term.
- **FR-023a** *(added 2026-07-04)*: The always-armed service — and therefore its ongoing notification —
  MUST exist ONLY while **at least one button is paired**. With no paired button there is no service, no
  notification, and no battery cost: for a person who has not set up a button, the feature is silent and
  invisible. The service starts on successful pairing and is torn down when the last button is removed; it
  is armed from app launch, boot (BootReceiver) and `START_STICKY` restart **only when a paired button
  exists** (checked against the SDK's persisted pairing list; a device-protected hint gates the pre-unlock
  boot nudge). This MUST NOT weaken the always-armed guarantee for a person who DOES have a button — a
  paired button arms from boot/relaunch exactly as verified.

**Copy and vocabulary**

- **FR-024**: All user-facing copy in this feature MUST obey the constitution's vocabulary rules — no
  "check-in", no "watching", no "care"/"welfare", no clinically adjacent or alarming words ("emergency",
  "alert", "crisis", "failed"), and no system jargon surfaced as labels. Copy MUST present pressing for help
  as fully working, never as "off".

**The self-test / service test (reassurance — US6)**

- **FR-025**: A **double-tap** of the paired button MUST run an **end-to-end service test** — the press
  travels the same path a real summon would (button → phone → the service) and returns a confirmation —
  **without** starting a help sequence. (This applies when the summon gesture is hold; for the short-press
  case the button-based test is disabled — FR-026a.)
- **FR-026**: A service test MUST NOT dispatch: it MUST NOT open the cancel window, MUST NOT reach any
  contact, and MUST NOT start escalation. Conversely, the chosen **summon gesture MUST never be treated as a
  test.** The distinct gestures (summon gesture vs double-tap) are the guard — a test can never summon help,
  and a summon can never be silently downgraded to a test.
- **FR-026a** *(classification-level safety, added 2026-07-02 review)*: The double-tap service test is active
  **only when the summon gesture is hold.** **When the person has chosen the short-press summon, EVERY press
  gesture — single, double, and hold — MUST route to summon**, and the button-based service test MUST be
  disabled (the test remains available via the in-app "Test service" control, FR-029). Rationale: for the very
  person the short-press option exists to serve (tremor/limited dexterity — OQ1-B), a tremor can make the SDK
  classify an intended single press as a **double-click**; if that routed to the test, a crisis press would
  become a cheerful "your button's working" instead of help. This closes that breach at the gesture layer, not
  just in code.
- **FR-027**: On a successful service test the person MUST receive an immediate, **multi-channel
  confirmation** that the button was heard end-to-end — a **sound (a soft, calm chime — never a
  medical-alarm/beep timbre)**, the orb, an in-app ping, and a haptic — phrased as reassurance ("your
  button's working"), within the vocabulary rules (FR-024). The sound plays **only on a pass**; a
  couldn't-confirm result is shown honestly (no celebratory chime).
- **FR-028**: **Every** service test MUST be recorded in the event log — **both outcomes**: a **pass** when
  the round-trip confirms, and a **no-response** when it does not complete in time. "I tested and heard
  nothing" MUST itself become a recorded, carer-visible fact — never silence.
- **FR-029**: The service test MUST also be runnable from an explicit in-app **"Test service"** control in
  settings (reassurance on demand). The in-app control exercises the app → service → log → confirmation path;
  the **double-tap additionally proves the physical button and its wireless link** — the parts that fail
  silently.

**Always-armed across power management and reboot (no silent death)**

- **FR-030**: After a **phone reboot**, the button MUST re-arm **without the person opening the app** — the
  always-armed listener restarts on boot. Durable pairing (FR-015) persists the *pairing*; FR-030 ensures the
  *listener* is running again, not merely that the pairing survives.
- **FR-031**: The always-armed listener MUST be protected against background power management — the person is
  offered a battery-optimization exemption during calm setup. Where a device's power management **still**
  stops the listener, that limitation MUST be surfaced honestly (a service test returns and logs
  *no-response*), never allowed to fail silently (Constitution I.4, FR-009).
- **FR-032**: The app MUST surface the **button's own battery level** and give the person a **calm, early
  low-battery heads-up** — shown in the connected-status row and as a gentle notification — phrased as
  reassurance and action ("your button's battery is getting low — worth changing it soon"), never as an
  alarm or "failure" (FR-024). A low battery is the most common real-world cause of a button quietly going
  dead, so it MUST be surfaced **before** the button stops working, and **recorded in the event log**
  (carer-visible), consistent with the no-silent-death principle (FR-009). A battery change itself never
  requires re-pairing (FR-015).

**Works while the app is closed (the core promise)**

- **FR-033**: A press MUST reach help even when the app is **closed** (not merely backgrounded) — the summon
  **launches the app into the help sequence**, **waking the phone and showing over the lock screen** so the
  person need not find, unlock, or navigate the phone. *(Implementation, verified on device 2026-07-02: a
  full-screen-intent notification launches `MainActivity`; the FGS keeps the process + BLE alive while closed,
  the summon is a **one-shot** the app consumes exactly once — a reload can't replay it. Verified: closed +
  locked → press → one clean sequence, over the lock.)*
- **FR-033a**: Where a full-screen launch is **unavailable** (Android 14+ may revoke it for non-call/alarm
  apps by Play policy), the press MUST still be **loud, never silent** — a maximum-priority **sounding**
  notification ("Iona is reaching your people — tap to continue", vocabulary-clean) is the floor. On the
  current Android-13 sideload FSI is unrestricted; the pairing flow (Phase 3) checks
  `canUseFullScreenIntent()` and routes the person to the grant screen if revoked. *(A14/Play caveat deferred
  with the S22 / boot-FGS items — same revisit trigger.)*

### Key Entities

- **Physical help button**: A small, nearby, clicky physical button the person keeps to hand. Its
  press-and-hold is a *trigger* into the existing help sequence; it holds no help logic of its own and works
  only through the phone.
- **Pairing**: The one-time association between a specific button and the person's phone, made in calm
  settings and durable across app restarts, phone restarts, and battery changes. Exactly one button paired
  at a time (for this feature). Removable; re-pairable.
- **Button press (summon)**: A deliberate press-and-hold that, when *just-pressed* and when no sequence is
  already running, starts the existing help sequence. A stale or duplicate press is dropped or absorbed.
- **Help sequence (existing)**: The reactive sequence the app already runs — cancel window, then reaching
  the person's people. Unchanged by this feature; the button is only a new way to start it.
- **Service test (self-test)**: A double-tap (or the in-app "Test service" control) that exercises the real
  end-to-end path *without dispatching* — confirms across sound/orb/ping/haptic and records a **pass** or a
  **no-response** to the event log. The person-facing defence against silent death.
- **Button battery**: The button's own cell. Its level is surfaced in the status row; a low level triggers a
  calm early heads-up and a recorded event (FR-032). A battery change never requires re-pairing.
- **Connected-status row**: The settings row showing the button is connected, its battery level and last
  confirmed-working time, and offering removal.

## Success Criteria *(mandatory)*

**Definition — "summons help":** the button *summons help* when a just-pressed press-and-hold **starts the
existing help sequence** (the cancel window opens and, absent cancellation, the person's people are
reached). Per the promise-the-attempt principle (Constitution I.3), this measures that the sequence
*starts* — never whether a contact answers.

- **SC-001**: 100% of just-pressed press-and-holds, with the phone on and in range and no sequence already
  running, start the existing help sequence — identical to the in-app help control, verified on the device.
- **SC-002**: 0 help sequences are started by a stale (late-delivered) press — every stale press is dropped.
- **SC-003**: 0 second sequences are started by a press that lands during a running sequence — every such
  press is absorbed, and the live sequence is never disturbed.
- **SC-004**: After app restart, phone reboot, and battery change, the button still summons help with 0
  re-pairings required — including after a reboot **with no app launch** (the listener re-arms on boot).
- **SC-005**: The one-time pairing flow can be completed on a real phone — including the phone's own
  permission question — with no confusing or alarming moment (owner-verified on the Pixel).
- **SC-006**: After removal, 100% of presses no longer summon help, and the button can be paired again.
- **SC-007**: No user-facing copy in the feature contains a forbidden term, and pressing for help is never
  presented as unavailable or "off".
- **SC-008**: A double-tap runs an end-to-end service test that returns a confirmation on the device **and**
  records a passing test event, with **0** help sequences started and **0** contacts reached.
- **SC-009**: When the round-trip cannot complete (phone asleep / out of range / listener stopped), the
  person is told honestly it could not be confirmed **and** a no-response test event is recorded — a stopped
  button can never read as working.
- **SC-010**: A low button battery is surfaced to the person (status row + a calm heads-up) and recorded in
  the event log **before** the button stops working — a dying battery is never a silent failure.

## Assumptions

- The help sequence already exists and behaves as built — the cancel window and the reaching of the
  person's people are **not changed** by this feature. The button is only a new way to start the existing
  sequence (Constitution I.2 — a device trigger fires the escalation the system already knows how to run).
- The button reaches help through the phone only; there is **no independent cellular path**. Phone-off /
  out-of-range / service-not-running is the honest, stated boundary, not a defect.
- The button does **not replace** the in-app help control; it is a second front door alongside it.
- Exactly one button is paired at a time for this feature; multi-button and per-person button assignment are
  not in this feature.
- The earlier `/flic-test` scaffolding was **throwaway bring-up scaffolding and is retired** — the product
  path does not build on that rig. The end-to-end **service test** (FR-025/FR-028) instead uses a distinct,
  purpose-built, permanent test endpoint that **logs a test event and suppresses dispatch** — a new product
  surface, not a revival of the rig.
- **Resolved at Clarify (OQ1–OQ4, Session 2026-07-02):** the summon gesture is a person-chosen setting
  defaulting to press-and-hold (OQ1); the always-on notification is accepted, reading "Iona is here for you." (OQ2);
  the button is available to all plans (OQ3); pairing + status live in the Service tab below the
  reactive-method picker (OQ4).
- **Out of scope (walls — not built here):** any new or parallel help path; phoneless / independent-cellular
  operation; replacing the in-app help control; deciding plan gating or pricing for the button as a product;
  multi-button or button-to-person mapping; and reviving the throwaway `/flic-test` rig as-is (the feature
  instead adds a purpose-built service-test endpoint — FR-025/FR-028). **Deferred (not built here):** the
  settings surface for the self-test beyond the "Test service" control and the gesture split (finer test
  cadence, reminders to test, per-outcome copy) — to be worked through when the settings pass is done.

## Clarification outcomes

All four open questions were resolved at `/speckit.clarify` (Session 2026-07-02) — see the Clarifications
section above:

1. **OQ1 — Summon gesture**: person-chosen in settings (short single-press or press-and-hold), **default
   press-and-hold**; double-press unassigned.
2. **OQ2 — Ongoing notification**: **accepted**; copy is **"Iona is here for you."**
3. **OQ3 — Plan gating**: **available to all plans** (the reactive floor is never gated).
4. **OQ4 — Settings placement**: **Service tab**, own row/section below the reactive-method picker.
