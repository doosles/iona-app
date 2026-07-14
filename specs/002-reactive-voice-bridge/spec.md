# Feature Specification: Reactive Voice Bridge

**Feature Branch**: `002-reactive-voice-bridge`

**Created**: 2026-06-23

**Status**: Draft

**Input**: User description: "Build the reactive voice bridge: a way for a person to summon their own nominated contacts into a live, hands-free voice call by a single action, so they can speak to someone they trust the moment they need help."

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Person summons help, contact reached (Priority: P1)

A person feels frightened, unwell, or in difficulty. They take one action — pressing the on-screen help control — with no multi-step confirmation. The system attempts their nominated contacts in order. When a contact answers, the person and contact are connected in a live, two-way, hands-free conversation. The person can set the phone down and speak; the contact hears the room and decides what to do. Only the contact can end the call — the person cannot accidentally cut off their own connection.

**Why this priority**: This is the core safety scenario. Every other story depends on this path working reliably. A failure here is a safety failure.

**Independent Test**: Can be fully tested with a single button press and a contact available to answer — confirming live two-way audio, hands-free routing, and that only the contact can end the call.

**Acceptance Scenarios**:

1. **Given** the person has at least one nominated contact, **When** they press the help control, **Then** the system immediately begins attempting to reach the first contact with no additional confirmation step.
2. **Given** the system is attempting contacts, **When** a contact answers and presses the IVR confirmation key, **Then** the person and contact are connected in a live, two-way, hands-free conversation.
3. **Given** a live conversation is in progress, **When** the contact ends the call, **Then** the whole attempt ends.
4. **Given** a live conversation is in progress, **When** the person interacts with the device, **Then** the person cannot end the call — that control belongs to the contact only.
5. **Given** a contact does not answer, is unavailable, or voicemail picks up, **When** that attempt concludes, **Then** the system moves to the next contact without leaving a message.

---

### User Story 2 — No contact reached; terminal state (Priority: P2)

The person has pressed the help control. The system attempts every nominated contact in order. None answers. The system reaches the end of the list, ends the attempt deliberately, and tells the person clearly and calmly that no one could be reached. This is a designed moment — not a crash, not silence, not an error screen.

**Why this priority**: The terminal state is as important to design as the success state. A person who triggered the system and received no live connection is still in a moment of need; their experience at that moment must be defined and humane.

**Independent Test**: Can be fully tested with a contact list where no contacts answer — confirming the terminal message appears, the attempt ends cleanly, and no silent or error state occurs.

**Acceptance Scenarios**:

1. **Given** all contacts have been attempted without a live answer, **When** the last attempt concludes, **Then** the system ends deliberately and presents a clear, calm message that no one was reached.
2. **Given** the terminal state is shown, **Then** the person is not left in silence, on hold, or shown a generic error.
3. **Given** the attempt has reached its maximum duration, **When** that limit is hit, **Then** the system ends cleanly rather than running indefinitely, and the person is informed.

---

### User Story 3 — Orb as summon trigger (Priority: P3)

A user has opted in to using the Today-screen orb as a summon trigger — a setting that is OFF by default. On a tablet beside an armchair, the orb is large and always visible. Tapping the orb fires the same summon event as the on-screen help control. Nothing about the bridge changes — only the trigger source is different.

**Why this priority**: Enables a low-friction tablet-hub use case for people who want the orb as their primary summon control. Depends on the core bridge (P1) working first.

**Independent Test**: Can be fully tested by enabling the orb trigger setting and tapping the orb — confirming the bridge initiates identically to a help control press.

**Acceptance Scenarios**:

1. **Given** the orb trigger setting is OFF (default), **When** the person interacts with the orb, **Then** no summon event fires.
2. **Given** the orb trigger is ON, **When** the person interacts with the orb, **Then** the same summon event fires as pressing the help control — the bridge experience is identical.
3. **Given** any trigger source fires a summon event, **Then** it enters the same shared entry point — the bridge never branches on trigger source.

---

### Edge Cases

- What happens if the person has no nominated contacts configured? The system must not attempt to start a bridge with nowhere to call — this must be handled visibly before the summon moment is reached.
- What happens if a contact answers but does not press the IVR confirmation key (e.g. they hear the prompt and hang up, or press no key within the window)? The system treats this as no live human confirmed and moves to the next contact.
- What happens if the bridge fails to initiate entirely (a system failure, not a no-answer)? This must surface visibly — never drop silently with no feedback to the person.
- What happens if the live connection drops mid-conversation? One reconnect attempt to the same contact; if that fails, the system continues down the contact list — the person cannot be relied on to see the screen or act, so the attempt must not end on a visual prompt alone.
- What happens if the maximum attempt duration is reached mid-contact? The attempt ends cleanly and the person is informed — no open-ended hanging state.
- What happens if the person presses the help control while a bridge attempt is already in progress? Shows a visible "already connecting" state — no restart, no duplicate attempt. Oran's ongoing audio already confirms the attempt is running for a person not watching the screen.
- What if Oran's voice audio cannot be delivered? Silence must not be the fallback — a defined minimum floor must exist (e.g. a simple ambient tone rather than nothing).

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A single action by the person MUST initiate the bridge — no multi-step confirmation is required to summon help.
- **FR-002**: The bridge MUST be trigger-source-agnostic: all trigger sources MUST call one shared summon entry point. Bridge logic MUST NOT be wired into any individual trigger's handler.
- **FR-003**: The Today-screen orb MUST be available as an optional summon trigger, controlled by a user-facing setting that is OFF by default. When enabled, interacting with the orb fires the same summon event as all other trigger sources.
- **FR-004**: The system MUST attempt nominated contacts one at a time, in the person's defined order, moving to the next only when the current contact does not result in a live human on the line.
- **FR-005**: A person MAY have up to 6 nominated contacts.
- **FR-006**: When a contact answers, the contact MUST hear a short prompt and press a key to confirm they are a live person. The system MUST give the contact a 10-second window to press the key. Only after that keypress confirmation MUST the system connect the person and contact in a live, two-way, hands-free conversation. The person MUST be able to set the device down and speak.
- **FR-007**: The call MUST end only when the contact ends it. The person MUST NOT have the ability to end the call, so a frightened or confused person cannot accidentally cut off their own connection.
- **FR-008**: When a contact does not result in a confirmed keypress (no answer within 30 seconds, declined, voicemail, or answered but no key pressed within the 10-second window), the system MUST move to the next contact and MUST NOT leave any message for the unreached contact.
- **FR-009**: The designed terminal ending — telling the person clearly that no one could be reached — occurs only after BOTH the bridge pass AND the device pass are exhausted. If the bridge pass is exhausted or fails, the system MUST hand off to the device pass (FR-016) rather than ending. The calm terminal state is the end of the full ladder, not the end of the bridge pass alone. Until the device pass feature is built, bridge-pass exhaustion serves as an interim ending with the same designed calm state.
- **FR-010**: While the person waits for a contact to be reached, they MUST hear Oran's voice — calm, short spoken phrases reassuring them that contacts are being tried. The line MUST NOT feel dead or silent.
- **FR-011**: The summon attempt MUST have a defined maximum duration cap covering the FULL ladder (bridge pass + device pass combined). It MUST NOT run indefinitely. The cap is 4 minutes from summon time. Both passes run within this shared ceiling — if the cap fires mid-device-pass, the attempt ends immediately regardless. The system MUST enforce this ceiling.
- **FR-012**: Any failure on this path MUST surface visibly to the person. This path MUST fail loudly and visibly — never silently.
- **FR-013**: Copy and labels shown to the person MUST NOT imply guaranteed help, a guaranteed answer, or a monitored or manned response. The system promises the attempt only.
- **FR-014**: If the live connection drops unexpectedly mid-conversation (not a deliberate end by the contact), the system MUST make one reconnect attempt to the same contact. If the reconnect succeeds, the conversation resumes. If it fails, the system MUST continue down the contact list from the next contact — the person cannot be relied upon to see the screen or act, so the attempt MUST NOT end on a visual prompt alone.
- **FR-015**: If a summon event fires while a bridge attempt is already in progress, the system MUST show a visible "already connecting" state and MUST NOT restart or duplicate the attempt. Acknowledgement is not screen-only — Oran's ongoing reassurance audio already confirms to a person not looking at the screen that the attempt is running.

- **FR-016** ⚠️ DEPENDENCY-GATED (requires device fallback feature): When the bridge pass is exhausted with no live human reached, OR when the bridge fails to start due to a system error, the system MUST hand off to the device pass — a device-driven carrier-call attempt of the same contacts, in the same order, using an independent delivery path. The two passes use independent delivery mechanisms (backend Twilio conference vs. device carrier line), so a contact unreachable via one may be reachable via the other. The device pass runs within the same max-duration ceiling (FR-011). This FR is not implemented in feature 002; it is recorded here so the architecture anticipates the hand-off and states are not hard-coded as final dead-ends.

### Key Entities

- **Summon event**: The single trigger-source-agnostic signal that starts the bridge. Any trigger source fires this event; the bridge always begins here.
- **Nominated contact**: A person's own chosen contact, with a defined order position. Up to 6 per person.
- **Bridge attempt**: The first pass of the reactive ladder — summon event through sequential bridge contact attempts to resolution (live connection) or hand-off to the device pass.
- **Reactive ladder**: The full two-pass summon lifecycle: bridge pass first (hands-free conference), then device pass (carrier calls), within a shared 4-minute ceiling. A live connection at any point ends the ladder. The designed terminal ending is reached only when both passes are exhausted.
- **Terminal state**: The explicitly designed end of the full reactive ladder where no live connection was made across both passes. Has its own defined copy and behaviour — not an error state. Until the device pass is built, bridge-pass exhaustion serves as an interim terminal.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person can go from zero to a live conversation with a contact in one action, with no additional step required.
- **SC-002**: When a contact answers, the person and contact are connected hands-free — the person can set the device down and both parties can hear each other clearly.
- **SC-003**: A contact attempt that yields no live human progresses automatically to the next contact — the person does nothing.
- **SC-004**: 100% of bridge failures produce a visible response to the person — zero silent failures on the summon-to-connect path.
- **SC-005**: When the contact list is exhausted, the person receives a clear, calm message — no person is left in silence or shown a generic error at the end of an exhausted attempt.
- **SC-006**: Any trigger source (help control, orb, future sources) produces an identical bridge experience — indistinguishable to the person regardless of what fired it.
- **SC-007**: The orb trigger setting can be found, enabled, and tested by the person in one Settings session.

---

## Assumptions

- The person has an active network connection at summon time for the bridge pass. The device pass (carrier calls, no auto-speaker) is the second rung of the reactive ladder and a separate feature, described in FR-016. It is outside the scope of feature 002 to implement, but the ladder architecture is specced here.
- Nominated contacts are already configured before the summon moment. Contact setup and management are existing functionality, not in scope here.
- The person's contact order is pre-defined in their account — the bridge reads this order at summon time; it does not ask the person.
- Live-human confirmation is via IVR keypress: the contact hears a short prompt and presses a key before the bridge connects. No keypress within the prompt window = not confirmed, move to next contact.
- The maximum attempt duration is derived from the per-contact windows: 6 contacts × (30s ring + 10s keypress) = 4 minutes ceiling. The system must enforce this cap.
- Hardware button and external/BLE trigger sources are separate future features. They will fire the same shared summon entry point defined here; they do not change this spec.
- Reassuring audio plays on the person's device while they wait — not to the contact.
- The bridge is available to Guardian Angel tier only. Tier gating is an implementation concern, not a functional requirement of the bridge itself.

---

## Clarifications

### Session 2026-06-23

- Q: How does the system determine that a live human (not voicemail) has answered? → A: IVR keypress — contact hears a short prompt and presses a key to confirm they are live before being bridged.
- Q: How long should the system wait per contact before moving on? → A: 30-second ring timeout; 10-second keypress confirmation window after answer. Derived maximum attempt duration: 4 minutes (6 × 40s).
- Q: What does the person hear while the system attempts contacts? → A: Oran's voice — calm, short spoken phrases reassuring them that contacts are being tried.
- Q: If the live connection drops mid-conversation, what should the system do? → A: One reconnect attempt to the same contact; if it fails, continue down the contact list — person cannot be relied on to see the screen or act, so must not end on a visual prompt alone.
- Q: If the summon event fires while an attempt is already in progress, what happens? → A: Show visible "already connecting" state, no restart. Oran's ongoing audio confirms the attempt is running for a person not watching the screen.
