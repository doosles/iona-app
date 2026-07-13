# 008-failed-join-backstop — Facts for /speckit.clarify + /speckit.plan

**NOT spec content.** These are settled or established context supplied by the owner alongside the
specify block, deliberately withheld from `spec.md` (they are mechanism/context, not requirements).
Feed them into the clarify and plan stages.

1. **This is the 008-arc gate.** No late-join build proceeds until this backstop is specified, its
   detection mechanism is proven on a real on-device connection loss, and the owner has signed it.
   (Standing ruling: the late-join convergence is the riskiest change on the board, never bundled.)
2. **The load-bearing unknown is DETECTION, and it is currently absent server-side.** Baseline
   investigation 008-I0 (vault: `02 CC Briefs/cc_findings_008I0_bridge_baseline_2026-07-13.md`)
   established on the live wire that today the server receives no participant-level events during a
   bridge — no conference-level status callback is wired on any live leg, and the person's leg has no
   status callback — so a person's mid-call drop is completely invisible to the server. Every
   requirement that depends on "the system tells the contact" therefore depends first on adding
   server-side detection of the person leaving the call. Proving that detection works reliably on a
   real connection loss (not a harness) is the spike, and the gate.
3. **Observability options identified (captain steer: the first):**
   (a) a conference-level status callback carrying participant-leave events — the purpose-built,
   real-time mechanism, and the only one that supports acting mid-call;
   (b) enabling richer call observability — currently not enabled on the account, and
   analytics-oriented rather than a live trigger;
   (c) reading the conference record after the fact — how the baseline gathered evidence, but useless
   for acting while a contact is still on the line.
   Only (a) closes the live hole. Confirm at plan.
4. **Distinguishing a real drop from a normal contact hang-up is a named risk (008-I0 risk C1):**
   today a contact hang-up produces one call-level completion event, a person-drop produces total
   server silence — the detection wiring must be able to tell "the person left" from "the contact
   ended the call, resolved," or it will announce a dropped connection when the call simply ended
   normally.
5. **The blip-vs-real-drop timing question (only relevant if any self-reconnect is retained):** if a
   momentary self-reconnect survives the spec's §5 decision, the contact announcement must not fire on
   a sub-moment flicker that the reconnect immediately heals — detection would need a brief grace
   before declaring the drop real. If §5 removes the self-reconnect, this question disappears.
   Sequencing: settle §5 first; the grace only exists downstream of keeping a reconnect.
6. **Existing live bug on this exact surface, to fold in (008-I0 risk C3):** when the current single
   self-reconnect fails, the contact is left in a live call with no announcement (stranded until they
   hang up or provider default ~4h), and the person is shown the dishonest "no contacts could be
   reached" card for a call that connected. This is the §1/§3 requirement failing in production today.
   It should be resolved as part of this feature's design, not separately — its correct fix is this
   feature.
7. **No server-side call-duration cap exists on the live bridge (008-I0 risk A4):** the only
   deliberate maximum is a client-side timer that dies if the app dies. FR-008 (never leave a call
   hanging open) must account for the fact that today, a dropped-and-abandoned call has no backstop
   cap at all beyond provider defaults.
8. **Mechanism-coherence risks for plan (008-I0 risks C4/C6):** conference/bridge behaviour is minted
   at more than one code site and load-bearing bridge state is held in process memory (lost on
   restart). Any detection/teardown/announcement mechanism added here must account for both — a change
   to call-close semantics that touches only one site will drift, and any state a backstop keys off
   inherits the restart hole.
9. **Copy is owner-owned, emotional-register, and precedes implementation.** Two lines are needed and
   are the owner's to rule: what the contact hears on a drop, and what the person hears on a drop (the
   plain "connection lost, here's your way back" prompt, worded to leave a well person at ease and a
   person-in-need clearly directed). Neither may reuse the exhausted-cycle language.
10. **Doc-hygiene note carried from 008-I0:** the previously-referenced
    `iona_conference_lifecycle_note.md` was not found on disk; its claims were verified directly
    against the live wire in the baseline. The settled termination model (contact-as-anchor; person
    cannot end the call; deliberate close only for the no-contact-reached case) stands as
    wire-confirmed, but should be re-captured into a current, on-disk reference as part of this
    feature's paperwork.
