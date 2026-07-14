# Feature Specification: Choose How Help Reaches You

**Feature Branch**: `004-escalation-mode-picker`

**Created**: 2026-07-01

**Status**: Draft

**Input**: User description: "Let a person choose, calmly and in advance, how help reaches
them when they press for help — the standard way (the service reaches their nominated people
on their behalf) or a premium hands-free way (connected into a live voice conversation). The
choice is made in calm settings, never mid-crisis, and is used when they press for help. Only
a person who has unlocked hands-free can pick it; anyone who hasn't sees an invitation to add
it, with its price, in the same place. Whatever is chosen, pressing for help must always reach
the person — a stored preference for a premium way the person is not currently entitled to
falls back quietly to the standard way, never leaving anyone un-helped. This feature is the
choosing surface and the invitation to unlock only — nothing downstream of the choice."

## User Scenarios & Testing *(mandatory)*

This feature adds a single calm decision to Service settings: *how* help reaches the person when
they press for help. The two ways it can reach them already exist and work; this feature lets the
person choose between them in advance, invites people who haven't unlocked the premium way to add
it, and guarantees that pressing for help always reaches the person regardless of what is stored.

### User Story 1 - Choose how help reaches you (Priority: P1)

A person setting up their service, or revisiting their settings on a quiet afternoon, opens
Service settings and sees a plain statement of how help will reach them when they press for
help, followed by the ways they can choose between. A person who has unlocked the hands-free
way sees both ways as rows and picks the one they want. When they later press for help, the
service uses the way they chose. The choice persists — returning to settings shows the same way
still selected.

**Why this priority**: This is the core value of the feature — the calm, in-advance choice that
everything else supports. It is a viable slice on its own: a person who can unlock hands-free
can set their preferred way and have it honoured.

**Independent Test**: With a person entitled to both ways, open Service settings, confirm both ways
appear as selectable rows with exactly one selected, switch the selection, reopen settings to
confirm it persisted, and confirm that pressing for help uses the selected way.

**Acceptance Scenarios**:

1. **Given** a person who has unlocked hands-free and has chosen the standard way, **When** they press
   for help, **Then** the service reaches their nominated people on their behalf.
2. **Given** a person who has unlocked hands-free and has chosen the hands-free way, **When** they press
   for help, **Then** they are connected into the live hands-free voice conversation.
3. **Given** a person who has just changed their chosen way in settings, **When** they leave and reopen
   Service settings, **Then** the way they chose is still shown as selected.
4. **Given** the settings surface is open, **When** the person views the ways, **Then** exactly one way is
   shown as selected at any time.

---

### User Story 2 - Always reached, whatever is stored (Priority: P1)

Whatever a person has chosen, the moment they press for help they must be reached. A person may
once have chosen the hands-free way but no longer be entitled to it — their add-on lapsed, their
plan changed, or a recent unlock has not yet taken effect. In every such case, pressing for help
quietly uses the standard way, which the person always has. Their current entitlement at the
moment of pressing decides the way; a stored preference for a way they cannot currently use never
leaves them un-helped and is never surfaced as an error.

**Why this priority**: This is the safety floor. A stored preference that silently blocked help would
be a safety failure, not a cosmetic one. It carries the highest reliability bar and must hold
before the feature can ship, so it is co-critical with the core choice.

**Independent Test**: Store a hands-free preference for a person who is not currently entitled to
hands-free, then trigger a press for help and confirm they are reached the standard way with no
error state and no dead-end.

**Acceptance Scenarios**:

1. **Given** a person who previously chose hands-free but is no longer entitled to it, **When** they press
   for help, **Then** they are reached the standard way, with no error and no dead-end.
2. **Given** a person whose stored preference is a way they cannot currently use, **When** they press for
   help, **Then** they are reached without delay and the fallback is not presented as a problem.
3. **Given** any stored preference, **When** the person presses for help, **Then** current entitlement decides
   the way used, taking precedence over the stored preference.
4. **Given** a person who has just added hands-free but whose unlock has not yet taken effect, **When**
   they press for help, **Then** they are reached the standard way, unchanged and without error.

---

### User Story 3 - Invitation to unlock hands-free (Priority: P2)

A person who has not unlocked the hands-free way opens Service settings and sees the standard way
selected. In the exact place where an entitled person would pick hands-free, this person instead
sees an invitation to add it, showing its price. The row keeps the same shape and position as the
selectable version, so the screen does not jump or reflow depending on whether the person is
entitled. Tapping the invitation takes them to where hands-free can be added. They are never asked
to choose a way at the moment of pressing for help.

**Why this priority**: This turns the choosing surface into the natural place to discover and unlock
the premium way, but the feature already delivers safe, correct behaviour for everyone without it,
so it ranks below the core choice and the safety floor.

**Independent Test**: With a person who has not unlocked hands-free, open Service settings and confirm
the standard way is selected and the hands-free row shows an add-invitation with a price in the
same position and shape as the selectable row; tap it and confirm it leads to where hands-free is
added.

**Acceptance Scenarios**:

1. **Given** a person who has not unlocked hands-free, **When** they open Service settings, **Then** the
   standard way is shown selected and the hands-free row shows an invitation to add it with its
   price instead of a selection control.
2. **Given** the hands-free row is shown as an add-invitation, **When** it is compared with the selectable
   version, **Then** it occupies the same position and shape and the settings screen does not jump or
   reflow.
3. **Given** a person who has not unlocked hands-free, **When** they tap the add-invitation, **Then** they are
   taken to where hands-free can be added.
4. **Given** a person who has not unlocked hands-free, **When** they press for help at any point, **Then** they
   are reached the standard way and are never presented with a mid-press choice.

---

### Edge Cases

- **Entitlement lapses while hands-free is the selected way** → on the next press for help, the person
  is reached the standard way; the lapse is not shown as an error (US2).
- **Unlock has not yet taken effect at the moment of pressing** (a just-added purchase still settling)
  → the person is reached the standard way. There is no distinct "being added" state — the person
  continues to see the "Add" invitation until entitlement actually takes effect (US2; see
  Clarifications 2026-07-01).
- **The person has never made a choice** → the standard way is shown as selected by default, so there
  is always exactly one selection (FR-017).
- **Current entitlement cannot be confirmed at the moment of pressing** → the system treats the person
  as not currently entitled to hands-free and reaches them **the standard way — or, if the backend
  itself is unreachable, the device-based offline floor** — so a person is reached even when entitlement
  (or the backend) is momentarily unavailable. The standard way is the universal floor and is never
  gated on an entitlement read.
- **Entitlement has drifted out of sync** → in the **safe direction** — shown *not* entitled when the
  person actually is (e.g. a completed purchase not yet propagated) — the person simply falls back to
  the standard way; fully handled. In the **opposite direction** — shown *still* entitled when the
  person no longer is (e.g. a cancellation not yet reflected) — the person may briefly retain the
  hands-free option: this is a **billing-leakage / commercial risk (a no-longer-entitled person keeping
  a paid capability), NOT a safety risk**, and is bounded by the launch preconditions (no automatic
  removal of the main plan + reliable entitlement propagation). Named here, not left silent.
- **The person taps the add-invitation but returns without completing** → the settings state is
  unchanged; the standard way remains selected.
- **Entitlement is newly gained** (hands-free just becomes available) → the hands-free row becomes
  selectable, but the person's active selection is unchanged; it stays as previously stored (the
  standard way by default) until the person explicitly picks hands-free (FR-020).

## Clarifications

### Session 2026-07-01

- Q: What is the default selected way for a person who has not yet chosen (including an entitled person who hasn't picked)? → A: The **standard way**, for everyone. A blank/absent choice always reads as the standard way — the universal floor — and hands-free is never selected by default or inferred from the absence of a choice.
- Q: When hands-free becomes newly available to a person, does their active selection change? → A: **No.** Gaining entitlement unlocks the option (the hands-free row becomes selectable) but MUST NOT change the active selection; the stored choice stays as it was (the standard way by default) until the person explicitly picks hands-free. A safety-critical behaviour must never change by itself under someone — the add-on grants the ability to choose, not an auto-switch. (Mirror of the fallback: losing entitlement forces the standard way; gaining it offers, never imposes, hands-free.)
- Q: How is the "just added, not yet active" propagation window handled — is a "being added / ready shortly" state built here? → A: **No — handled by the safety fallback only (US2); US4 and its requirements are dropped from this feature.** Entitlement is a live yes/no with no "pending" signal, so a just-added purchase is indistinguishable from never-had without inventing new state this feature deliberately avoids. US2 already reaches the person the standard way throughout the propagation window, and reliable production sync is already a ship-gate precondition, so the window is covered without a pending state. The post-purchase "you're added, settling shortly" reassurance belongs in the dashboard billing confirmation (out of scope here), not the app picker.
- Q: Which ways appear in the picker, and as what kind of control? → A: Exactly the **two** user-selectable ways (standard and hands-free), as a **single-select** choice (choosing one deselects the other), not an on/off toggle. The automatic device-based fallback is not shown as a choice in this picker.
- Q: Is the price shown in the add-invitation final? → A: **No** — it is a placeholder pending final pricing. The settled amount is supplied at a later stage and must not be presented as the final price.
- Q: Copy constraints on the default/standard state? → A: The standard-way default must **never read as "help off"** — pressing for help always works and must be presented that way. The term **"check-in" must not appear** anywhere in this feature's copy.
- Q: Does the picker respect the person's text-size setting? → A: **Yes** — the row text (way name and one-line description) scales with the person's existing text-size setting; the safety action controls and structural chrome stay at their fixed sizes.

**Safety-checklist resolutions (`checklists/safety.md`, 2026-07-01):**

- Q: [CHK004] How is entitlement **drift** handled, and in which direction? → A: The **safe direction** (shown not-entitled when actually entitled) falls back to the standard way — fully handled. The **over-entitlement direction** (shown still-entitled after a cancellation) is a **billing-leakage / commercial risk, not a safety risk**, bounded by the launch preconditions (no auto-removal of the main plan + reliable propagation). Named in Edge Cases, not left silent.
- Q: [CHK009 / CHK030] Is "reached the standard way" precise for the backend-unreachable branch? → A: Reworded — on a backend-unreachable press the person is reached via the **standard way, or the device-based offline floor** when the backend can't be reached. "Standard way" is no longer conflated with the offline floor; the Edge Case and SC-001 now name both.
- Q: [CHK021] What does "reached" mean in SC-001? → A: **An attempt is initiated** (a way is engaged), per Constitution I.3 (promise the attempt, not the outcome) — not whether a contact answers. Defined at the head of Measurable Outcomes.

## Requirements *(mandatory)*

### Functional Requirements

**The choosing surface**

- **FR-001**: Service settings MUST present a clear, plain-language statement of how help reaches the
  person when they press for help, followed by the way(s) they can choose between.
- **FR-002**: The system MUST offer two ways help can reach the person: (a) **the standard way** — the
  service reaches the person's nominated contacts on their behalf; and (b) **the hands-free way** — the
  person is connected into a live voice conversation without holding the phone.
- **FR-003**: Each way MUST be presented as a row containing an icon that identifies it, a plain-language
  name, a one-line description of what it does, and — on the right — the control to select it.
- **FR-004**: Exactly one way MUST be shown as selected at any time.
- **FR-005**: The choice of way MUST be made only in settings; the person MUST NOT be asked to choose a
  way at the moment of pressing for help.

**Availability and entitlement**

- **FR-006**: The standard way MUST always be available to every person and MUST NOT be able to be
  switched off.
- **FR-007**: Only a person who has currently unlocked the hands-free way MUST be able to select it as
  their way.
- **FR-008**: For a person who has unlocked hands-free, both ways MUST be selectable, the hands-free row
  MUST indicate that it is available to them, and the person MUST be able to select either way.
- **FR-009**: For a person who has not unlocked hands-free, the standard way MUST be shown selected, and
  the hands-free row's selection control MUST be replaced by an invitation to add it that shows its
  price.
- **FR-010**: Tapping the add-invitation MUST take the person to where hands-free can be added. Adding,
  payment, and pricing are out of scope for this feature — the invitation is a hand-off only.
- **FR-011**: The hands-free row MUST occupy the same position and shape whether it is shown as a
  selectable way or as an add-invitation, so the settings screen does not visually jump or reflow
  depending on the person's entitlement.

**Persistence and use**

- **FR-012**: The person's chosen way MUST persist across sessions; on returning to settings, the chosen
  way MUST be shown as selected.
- **FR-013**: When the person presses for help, the system MUST use the way they chose, subject to the
  safety fallback (FR-014–FR-016).

**Safety fallback (the load-bearing guarantee)**

- **FR-014**: At the moment of pressing for help, the system MUST decide the way to use from the person's
  **current** entitlement, and current entitlement MUST take precedence over any stored preference.
- **FR-015**: If a person has a stored preference for the hands-free way but is not currently entitled to
  it (lapsed, plan changed, or unlock not yet in effect), pressing for help MUST fall back to the
  standard way and reach the person. It MUST NOT leave the person un-helped and MUST NOT present the
  fallback as an error.
- **FR-016**: A stored preference for a way the person is not currently entitled to MUST NEVER block or
  delay the person from being reached.

**Default and selection behaviour**

- **FR-017**: When the person has not made a choice, the standard way MUST be the selected default — for
  every person, including one who is entitled to hands-free but has not yet chosen. The absence of a
  stored choice MUST always read as the standard way; the hands-free way MUST NEVER be selected by
  default or inferred from a blank choice.
- **FR-018**: The picker MUST present exactly the two user-selectable ways (standard and hands-free). The
  automatic device-based fallback MUST NOT appear as a choice in this picker.
- **FR-019**: Selection MUST be single-select — choosing one way deselects the other — and MUST NOT be
  presented as an on/off toggle.
- **FR-020**: When the person becomes newly entitled to hands-free, the hands-free row MUST become
  selectable, but the person's active selection MUST NOT change automatically; it MUST remain as
  previously stored (the standard way by default) until the person explicitly selects hands-free.

**Invitation, copy, and accessibility**

- **FR-021**: The price shown in the add-invitation MUST be treated as provisional; the settled amount is
  determined at a later stage and MUST NOT be presented as the final price.
- **FR-022**: User-facing copy MUST NOT imply that pressing for help is unavailable while the standard way
  is selected; pressing for help MUST always be presented as fully working. The term "check-in" MUST
  NOT appear anywhere in this feature's copy.
- **FR-023**: The picker's row text (the way's name and one-line description) MUST scale with the person's
  existing text-size setting; the safety action controls and structural chrome MUST remain at their
  fixed sizes.

### Key Entities

- **Help-delivery choice**: The way the person has selected for how help reaches them when they press for
  help. Persists across sessions; exactly one at a time; the standard way when unset. It is only ever an
  *intent* — never an entitlement.
- **Help-delivery way**: A way help can reach the person — either the standard way (the service reaches
  the person's people on their behalf) or the hands-free way (a live voice conversation). Each has an
  identifying icon, a plain-language name, and a one-line description.
- **Hands-free entitlement (current)**: A live yes/no read at the moment of pressing for help — the
  person either currently has hands-free unlocked or does not. There is no distinct "pending" state: a
  just-added-but-not-yet-settled purchase simply reads as not-yet-unlocked until it takes effect.
  Decides the way used, ahead of any stored preference.
- **Add-hands-free invitation**: What replaces the hands-free selection control for a person who is not
  entitled — shows the (provisional) price and leads to where hands-free is added. Occupies the same row
  position and shape as the selectable control.

## Success Criteria *(mandatory)*

### Measurable Outcomes

**Definition — "reached":** a person is *reached* when an attempt to deliver help is **initiated** (a way
is engaged on their behalf). Per the promise-the-attempt principle (Constitution I.3), this measures that
the attempt starts — never whether a contact answers.

- **SC-001**: 100% of press-for-help events result in the person being reached by one of the two ways —
  or, if the backend itself is unreachable, by the device-based offline floor — including every case
  where the stored preference is a way the person is not currently entitled to (lapsed, downgraded, or a
  purchase still settling). No press for help leaves a person un-helped.
- **SC-002**: The person is asked to choose a way 0 times at the moment of pressing for help — the choice
  is only ever made in settings.
- **SC-003**: For 100% of people, the way shown as selected on returning to Service settings matches the
  way they last chose (persistence).
- **SC-004**: The hands-free row occupies the same position and shape in both the selectable and
  add-invitation states, so the settings screen shows no visual jump or reflow between the two —
  verifiable by direct comparison.
- **SC-005**: An entitled person can change how help reaches them from within the Service settings screen
  in a single selection, with no separate confirmation step required to make it take effect.
- **SC-006**: A person who has not unlocked hands-free can get from the settings choice to where
  hands-free is added in a single tap.

## Assumptions

- The two underlying ways already exist and behave as built — the standard reaching-out and the
  hands-free conversation are not changed by this feature. This feature is only the choosing surface
  plus the invitation to unlock.
- Adding and paying for hands-free happen elsewhere; this feature only hands off to that place
  (navigation only). The price shown in the invitation is provisional — the final amount is supplied at
  a later stage and must not be presented as settled.
- A stored preference is only ever an intent. Entitlement is always evaluated live at the moment of
  pressing for help, never inferred from the stored preference.
- Changing the selected way takes effect immediately and persists, with no separate save step —
  consistent with how the app's existing settings choices behave.
- After tapping the add-invitation and returning without completing the add, the settings state is
  unchanged and the standard way remains selected.
- Entitlement is a live yes/no with no "pending" signal; the propagation window after a purchase is
  covered by the safety fallback (the person is reached the standard way) rather than by any in-app
  "being added" state. Reliable propagation of a completed purchase is treated as a launch precondition.
- **Out of scope (walls — not built here):** the proactive on/off toggle; the dashboard billing card and
  any billing/payment build — **including the post-purchase "hands-free added, settling shortly"
  reassurance, which belongs to the dashboard billing confirmation, not the app picker**; any
  breadth-first sweep engine; and any webhook-authentication / access-hardening work. None of these are
  part of this feature.
