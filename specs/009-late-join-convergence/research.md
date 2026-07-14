# 009 Research — Phase 0 decisions (R0–R9)

Written 2026-07-14 against the settled spec (5 flags + R-009-6) and the live wire as read today.
Rule of the pass: anything the spike surfaces that R0 doesn't cover is **flagged, not resolved**.

## R0 — Captain's spike constraints (binding, 14 Jul — reproduced in substance)

1. **Service-test namespace first, never the live path.** Participant-event wiring proven on the
   service-test conference namespace before anything touches the flagship path (008 spike
   discipline). Live path adopts the mechanism only after the spike verdict + a captain ruling.
2. **Positive-event-only.** Join confirmation keys off the ARRIVAL of a member participant-joined
   event — never absence-of-events or timeout inference (13 Jul durable fact: passive events
   cannot see a dead radio; by the same coin, silence proves nothing).
3. **Measure the real number.** Press-1 → member-VoIP-connect-start → participant-joined arrival
   at the server, ms-stamped, multiple runs, BOTH wifi and cellular on the Pixel. The distribution
   is Flag 1's evidence: 8s confirmed or moved on it, not re-debated.
4. **Prove the hold primitive once, end-to-end.** One full choreography run (press-1 → held
   contact w/ pre-brief → member VoIP join → server observes join event → contact admitted → live
   conversation) is the spike's pass bar; the latency runs are its measurement.
5. **Delivery path honesty.** Events traverse ngrok → log arrival reliability + tunnel latency/
   loss. If the tunnel is a material risk on a safety path, say so plainly (interacts with the
   parked VPS cutover; captain decision, not spike scope).
6. **Restart boundary unchanged.** New hold/sequencing state lives inside the accepted
   single-worker in-memory boundary (v5.28). No silent widening; persistence wants = flagged.

## R1 — Join-confirmation authority: promote the live 008 Stage-0 wiring

**Decision**: the join authority is the conference participant-event callback that ALREADY exists
as observation wiring: both mint sites already carry `statusCallback → POST
/bridge/conference-events, statusCallbackEvent="join leave"`, with leg identity minted at TwiML
time (`participantLabel="member"` at webhook `:2656`; `"contact-{i}"` at `:4047`), and the
handler (`:3026`) already fast-200s and ms-stamps every field the latency table needs. The spike
therefore starts from working wiring, not zero: Stage 1 adds the same attrs to the svc-test
conference branch (`:2627`, test-only edit) and proves event arrival + latency there; promotion
to authority (state mutation, hold release) happens only after the verdict + captain ruling.
**Positive-event-only** (R0.2): the join-confirmed predicate is "participant-join with label
`member` for THIS conference arrived", one-shot per conference. Nothing anywhere infers a join
from silence, timers, or the app's own claim.

## R2 — Hold-then-admit choreography (the order-of-arrival flip)

**Decision**: press-1 no longer Dials the contact straight into the conference. New sequence at
the press-1 confirm site (`_handle_twiml_bridge_contact_confirm` :3958, TwiML at :4051):

1. Press-1 → contact TwiML serves the **N2 pre-brief line** (replaces "Connecting you now." +
   3s pause) and enters a bounded hold (mechanism candidate: `<Pause>`/loop with `<Redirect>`
   re-check, mirroring the wait-audio self-loop pattern — spike decides the exact shape).
2. Same instant, server → member device: **join-trigger data push** (the repurposed press-1
   push slot — today `bridge_contact_joined` is sent HERE, before any real join; see R5). App
   receives it and places the member leg: `connectOutbound` (live site `:2694`), speaker routing
   inherited, join announce (N1 or existing connect line) speaking locally over the connect.
3. Member's `participant-join(member)` event arrives at the server → **admit**: redirect the held
   contact leg into the conference (the existing Calls-API redirect primitive — same mechanism as
   the terminal redirect, reused not reinvented). Contact's Dial carries
   `endConferenceOnExit="true"` exactly as today — the anchor rule (FR-007) survives the flip.
4. No event by the boundary (R3) → **graceful close**: redirect the held contact leg to
   `<Hangup/>` — NO spoken line (Flag 2: the pre-brief was the coverage; the close is the cue) —
   and fire the member's failed-join terminal push (card + local clip speak). Engine HALTED
   (Flag 4) — the existing press-1 halt already did this; nothing new dials.

**Conference start semantics (flagged for the spike, not resolved)**: with the contact held
outside the room, the member now enters an EMPTY room first. `startConferenceOnEnter` on the
member leg starts it (as today); what needs wire-proof is that (a) the member sits in a started,
silent, 1-participant room without any waitUrl audio (the waitUrl attr is DELETED with the
waiting room — the member's ears are local now), and (b) the contact's later entry with
`endConferenceOnExit=true` correctly becomes the anchor. The 008-I0 "empty-room rejoin" risk is
re-decided by construction here: there IS no member-side rejoin (R7 deletes FR-014); a room whose
anchor leaves dies, and a room whose member leg drops pre-admit resolves via the failed-join
boundary (the admit never fires — the boundary does).

## R3 — Boundary ownership: server-side, one timer, one fire

**Decision**: the 8s window (provisional) is a server-side timer armed at press-1
(`threading.Timer`, the `_bridge_arm_gap` pattern), keyed by conference, one-shot-guarded. At
fire: admit-not-yet-happened → graceful close (R2.4) + failed-join push + honest EventLog row.
A join event arriving first cancels it. Both terminals from the ONE fire (FR-006). All state
in-memory per R0.6 — the restart hole is the accepted v5.28 boundary, inherited not widened; the
watchdog floor remains the backstop beneath it.

## R4 — Anchor and "present" under the new order

**Decision**: contact stays the anchor (`endConferenceOnExit=true` on the contact Dial — FR-007:
only the contact ends the call). "Present" for every downstream consumer means **join-confirmed
by participant event**, not press-1, not the app's claim, not a 2-participant REST poll (the old
`_bridge_answered` >=2-participant read remains only as the harness/legacy floor until the
promotion lands — then the event is the single authority; the REST-poll fallback is retired with
a flag if the spike shows event gaps). Member leg stays `endOnExit=false` at every site.

## R5 — Push re-derivation (everConnected + 10-min cap)

**Decision**: the press-1-time `bridge_contact_joined` push (:4069 — sent BEFORE any real join)
is split honestly per the facts-file directive:
- **join-trigger** (at press-1): tells the app "place your leg now + speak the join announce" —
  it must NOT set `everConnected`, NOT arm the 10-min cap, NOT flip chips to connected.
- **join-confirmed** (at participant-join(member) + contact admitted): THE moment a conversation
  exists — sets `everConnected` (app `:602/:640` semantics move here), arms the connect-anchored
  9/10-min timers, settles the accepted chip ✓, freezes the screen per 007.
- **failed-join terminal** (at boundary fire): renders + speaks the N5 card.
Exact push names/fields in contracts/join-phase-pushes.md; all data-only + high via
`send_bridge_data_push` (the proven shape).

## R6 — ONE PATH mechanics (R-009-6, mechanism-level)

- Reaching phase: `app.js` runs the Signal reducer for BOTH modes; the only mode read left in the
  reaching phase is arming the join layer at accept. `_saIsSignal()` (:3613) as a reaching-phase
  gate is deleted; `refreshSignalAudioCache` (:3684) serves hands-free members too — one cache,
  which is what makes N4/N5 offline-speakable (+2 named clips in the per-contact set; pipeline
  supports named clips natively).
- Join-phase states extend the ONE reducer (`_saApply` :3208 family) — data-model.md defines
  them; `sa_sim.js` grows cells, never a second machine.
- Terminals: one card family (008 shell copy-variants) + one local-clip speak for both modes.
- Standard path: zero behavioural change — mode never arms the join layer there (SC-008/SC-009).

## R7 — Deletion inventory (removed, not bypassed — FR-003)

Named so `/speckit.tasks` can carry each as an explicit task with a regression check:

1. **Member waiting-room leg at summon** — the summon-time `connectOutbound` into the conference
   (live site `:2694` flow) stops placing a call at summon; the leg is placed at join-trigger.
2. **`/twiml/wait-audio` member hold loop** (`_handle_twiml_wait_audio` :4077) + `waitUrl` attr at
   the member mint (:2652) + press-1 named-connect flags (`_bridge_press1_name/_announced`) —
   the entire member-side phone-audio machinery. The contact-side confirm TwiML changes shape
   (R2); the svc-test branch keeps its own wait route (unaffected).
3. **Member-participant exhausted announce** — the member-leg `<Say>`/Announce terminal path in
   `_handle_bridge_speak_to_conference` (:3600 — the "phone-leg exhausted <Say>" named by
   R-009-6): the member's exhausted terminal is local-clip speak; the contact-side refuse-guard
   and logging in that funnel survive only where a contact leg still needs them.
4. **FR-014 auto-reconnect** — the app reconnect `connectOutbound` site (:2771) and its state
   (`_bridgeReconnectGaveUp` era) DELETED: under late-join the room dies with its anchor; a
   mid-call drop is 008's territory (truthful card, now spoken). **⚑ CAPTAIN CHECKPOINT**: this
   executes R-008-4's "replace or delete within 009" as DELETE — proposed with rationale
   (Complexity Tracking row 3), not silently decided.
5. **Hands-free clip-cache exclusion** (`_saIsSignal` gate at :3686) — deleted (R6).
Each deletion lands with a matrix/harness check proving no dormant second system remains (SC-009).

## R8 — Delivery-path measurement caveat (downgraded by captain, 14 Jul)

The VPS cutover is already a committed pre-launch item — there is no "is ngrok material" decision
to make, so R8 carries NO verdict line and the VPS interaction is NOT captain scope. What remains
is a one-line measurement caveat in the findings: the spike's latency numbers travel over the
ngrok tunnel, so any weird outlier run is ATTRIBUTED (tunnel artifact vs mechanism) rather than
left to look like a design flaw. The flip side works in the design's favour: an 8-second window
validated over free ngrok holds with margin on a proper VPS — production only gets faster.

## R9 — Story 4 (ships inside 009; severable; Flag 5)

Speaker routing exists at member-VoIP connect (two layers, `TwilioVoicePlugin` :299 area — reuse).
Volume is set nowhere today. Build shape: (a) at activation (episode start, both modes' reaching
phase per ONE PATH — hands-free AND standard both narrate locally): remember current media volume,
set media stream to max + route local clips to speaker; (b) at VoIP connect: call/voice stream to
max (routing already handled); (c) at episode end (terminal dismissed or call ended): restore the
remembered media volume. Native surface: small additions to the existing plugin (`AudioManager`
stream volume get/set) — no new plugin. Severable: (a)–(c) are additive calls at episode
boundaries; cutting them touches nothing else. **⚑ Flag (not resolved here)**: whether the
STANDARD path also gets the activation loudness in this feature or only hands-free — ONE PATH
argues both; Story 4's spec text says "a person who presses for help"; owner wording at the deck/
build gate settles it.
