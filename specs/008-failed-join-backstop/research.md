# Research — 008 Failed-Join Backstop (Phase 0)

**Date**: 2026-07-13 · **Inputs**: settled spec (3 s boundary, narrow-to-blip), facts file,
baseline `cc_findings_008I0_bridge_baseline_2026-07-13.md` (all file:line cites below are from that
live-wire pass unless marked otherwise).

**Evidence discipline**: every decision below is tagged **WIRE** (proven on the live wire in the
baseline), **DOC** (asserted by Twilio documentation — the spike must verify it), or **RULED**
(owner/captain decision). Nothing DOC-tagged may be built on until the spike converts it to WIRE.

---

## R1 — Detection mechanism: conference status events (facts-file option a)

**Decision**: Wire `statusCallback` + `statusCallbackEvent="join leave"` onto the bridge
`<Conference>` TwiML, pointing at a new webhook endpoint `POST /bridge/conference-events`.

**Why**: It is the only option that closes the live hole (facts file §3, captain steer). The baseline
proved (WIRE) that today no participant-level event reaches the server at all: no
`<Conference statusCallback>` on any live leg (`reply_to_airtable_webhook.py:2653`, `:4011` carry
none) and the member leg's TwiML app has `status_callback = None` (verified against the live Twilio
Application resource 13 Jul). A member drop is therefore server-invisible — FR-001 is unbuildable
without new wiring.

**Alternatives rejected**:
- *Richer call observability (Voice Insights)* — not enabled on the account (the baseline's Insights
  queries 404'd, WIRE), analytics-oriented, not a live trigger. Rejected per facts file §3(b).
- *Post-hoc conference-record reads* — how the baseline gathered evidence (`reason_conference_ended`
  etc.), useless for acting while the contact is still on the line. Rejected per facts file §3(c).
- *App-side detection only (status quo)* — the detecting device is the device that dropped; its
  timers/pushes cannot be trusted at the exact moment they are needed (and Constitution IV forbids
  WebView timers on the critical path). This is the architecture of today's C2/C3 bugs.

**DOC claims the spike must verify** (quickstart steps 1–2): (a) the `statusCallback` on a
`<Conference>` noun is honoured **only from the participant that creates the conference** — in the
live bridge the member joins first and creates it, which is convenient, but the attribute will be
minted on BOTH legs via the shared builder so creation order can never silently drop the wiring;
(b) `participant-leave` fires promptly on a genuine radio-loss (not just a clean SDK disconnect) —
Twilio ends a media-dead leg after its own loss detection; the observed leave latency on a real
airplane-mode drop is THE number the spike exists to measure (it consumes part of the 3 s budget).

## R2 — Leg identity: participant labels minted at TwiML time

**Decision**: Set `participantLabel="member"` on the member leg and `participantLabel="contact-{i}"`
on the contact leg, in the shared `<Conference>` builder. The conference-events handler reads the
label off the event payload — "who left" is carried by the event itself.

**Why**: Closes baseline risk C1 (member-drop vs contact-hangup distinguishability) **by
construction** rather than by SID bookkeeping. The server already tracks the contact SID
(`_bridge_active_contact_sids`, WIRE) and the member leg is identifiable by
`From = client:<recId>` (WIRE, real run 10 Jul 19:12) — those remain as belt-and-braces cross-checks —
but the label is the primary key because it survives every ordering race.

**Alternative rejected**: SID-set difference ("the leaving SID isn't the tracked contact SID, so it
must be the member") — inference, and exactly the kind that breaks when a stale SID or a
cancelled-previous-leg race is in flight (`:5276–5285` cancels previous legs mid-sweep).

**DOC claim for the spike**: `participantLabel` is a supported `<Conference>` TwiML attribute and is
echoed in status events. If it turns out REST-only, fallback = SID bookkeeping (the belt becomes the
primary) — a mechanism swap inside one handler, no design change.

## R3 — Boundary ownership: one server-side timer, one flip

**Decision**: On `participant-leave(member)` **while a contact is genuinely connected**
(`_bridge_answered`, WIRE `:3786–3795`), the webhook arms a **3.0 s `threading.Timer`** keyed by
`(conference, drop_instance)` — the same pattern as `_bridge_arm_gap` (`:5394`, WIRE). A
`participant-join(member)` for the same conference inside the window cancels it: blip healed, no
announcement, nothing shown to anyone (the healed blip is invisible — RULED). At expiry the timer
fires the **single boundary event**, one-shot-guarded.

**Why**: The clarify ruling demands one boundary, no second timer, no gap — reconnect death and
announcement birth are the same event. Server ownership is forced by Constitution IV and by physics:
the only other candidate clock lives on the device that just lost its connection.

**The app's role inside the window (narrowed reconnect)**: on `disconnected(involuntary)` with
`everConnected`, the app starts its single rejoin attempt **immediately** (today's FR-014 path,
`app.js:2735`, minus the 30 s reconnect ring timer — that dies). It gets no vote on the boundary: if
its rejoin lands inside 3 s, the server sees `participant-join(member)` and cancels; if not, the
boundary fires regardless of what the app is doing. `_bridgeReconnectGaveUp` (`app.js:2726–2731`) is
retired — its job (and its two bugs, C2/C3) moves to the boundary event.

**Note on the 3 s budget**: the ceiling is drop→announcement. It contains (leave-event latency) +
(timer) + (redirect latency). If the spike measures leave latency at L seconds, the timer arms for
max(0, 3 − L − ε) is NOT the model — the ruling is one 3 s window from the drop; pragmatically the
timer runs 3 s from the *event*, and the spike must confirm event latency is small enough that
drop→announcement stays ≈3 s and blips get a genuine heal window. If leave latency proves large
(> ~1 s), that finding goes to the captain BEFORE build (it squeezes the blip window and the ceiling
from both ends — a facts-file §5-adjacent judgement, not CC's to make).

## R4 — Late-rejoin honesty: the boundary is a one-way door

**Decision**: The boundary event sets a `_bridge_drop_declared` marker (in-memory set, keyed by
conference). After it: (a) the app is told via the `bridge_drop_declared` push to abandon any rejoin
and show the truthful drop state; (b) **belt for the lost-push case**: if a late member rejoin lands
anyway (name-addressed `connectOutbound` would mint a **fresh empty conference** — baseline risk C2's
nasty edge), the wait-audio handler (`:4032`) checks the marker FIRST and serves the truthful drop
line + `<Hangup/>` instead of entering the reaching loop — never the exhausted line, never a ghost
sweep.

**Why**: Structural non-contradiction must survive FCM loss. Without the wait-audio guard, a late
rejoin lands in a fresh conference, the 30 s stall watchdog fires, and the member who just had a live
conversation hears "none of your contacts are able to help" (WIRE-traced failure chain, baseline C2).

**Alternative rejected**: preventing the rejoin by tearing down Twilio-side state — there is nothing
to tear down (the rejoin CREATES the conference); the guard must live where the rejoin lands.

## R5 — Close semantics: the announcement IS the clean close

**Decision**: The boundary event redirects the **contact's leg** (tracked SID) to a new TwiML,
`/twiml/bridge-drop-announcement`: brief lead-in, the owner-ruled contact line, short tail,
`<Hangup/>` — the exact pacing shape of the proven member-terminal primitive
(`_handle_twiml_bridge_announcement`, `:3697–3703`, WIRE). Because the contact is the anchor
(`endConferenceOnExit="true"`, WIRE + real-run confirmed), their hangup ends the conference — the
clean close (FR-003, FR-008) is a side-effect of the honest announcement, one mechanism, no separate
teardown.

**Why**: Reuses the one redirect primitive that is already live-proven on this exact conference
shape; no new teardown machinery; C3 (stranded contact) is fixed by the same line that informs them.

**Edge (both sides gone)**: if the contact's leg is already gone when the boundary fires (they hung
up during the window), the redirect 404s/no-ops — swallow, write the EventLog terminal anyway, still
push the person's truthful state. The close already happened; honesty still lands.

## R6 — State & coherence: one mint authority, accepted in-memory cost, watchdog floor

**Decision**:
- **One `<Conference>` TwiML builder** used by both mint sites (member `:2650–2655`, contact
  `:4006–4013`) so statusCallback/labels/anchor attributes cannot drift (baseline C4). The service-test
  branch keeps its own namespace untouched.
- Boundary/drop state (`timer`, `_bridge_drop_declared`, drop-instance key) is **webhook process
  memory** — consistent with every existing bridge guard (accepted single-worker cost, v5.28 posture,
  baseline C6). **Restart floor**: if the webhook restarts mid-window, the timer dies — the
  participant-leave already happened and won't re-fire. Accepted degradation: the contact-side
  announcement is lost for that drop; what remains is the contact's own agency plus the wait-audio
  drop guard's sibling (a marker-less restart also clears `_bridge_answered`, so a late rejoin falls
  to the existing watchdog). This is the same class of restart hole every bridge terminal already
  carries — documented, not solved here.
- **connectOutbound literals**: the app's three `connectOutbound` call sites (join/reconnect/svc-test)
  keep duplicated params (baseline C4b) — folding them is a one-line helper done opportunistically in
  the app edit, not a design item.

## R7 — What the spike proves, and the fallback ladder

**The spike (quickstart.md) must convert to WIRE**:
1. `participant-leave` arrives at the new endpoint on a **real radio loss** (airplane mode mid-call),
   with usable leg identity, and its latency (the number that eats the 3 s budget).
2. `participant-join` arrives on the narrowed rejoin inside the window (blip-heal cancellation works
   end-to-end, nothing announced).
3. A normal contact hang-up produces NO drop behaviour (leave(contact)/conference-end events are
   observed and correctly ignored → SC-004).
4. The boundary chain end-to-end: drop → ≤3 s → contact hears the line → call closes → person's app
   shows the truthful state (or shows it on next open).

**Fallback ladder if a DOC claim fails on the wire**:
- Labels unsupported in events → SID bookkeeping (R2 belt) — same handler, same design.
- Leave-event latency too large for the 3 s ceiling → STOP; findings to captain/owner (the ceiling and
  the blip window are owner numbers, not engineering numbers).
- Events unreliable on real radio loss (the catastrophic case) → the mechanism as designed is
  unbuildable; candidate fallback is an app-independent server poll (participants list on a short
  cadence during connected calls — heavier, latency-bounded by cadence) — **explicitly a captain
  decision, do not build the poll on CC initiative**.

---

## Adjacent findings routed, not built (scope wall)

- **General dead-app duration cap** (baseline A4: a connected call with a *live* member leg but dead
  app has no cap beyond provider defaults) — NOT this feature (no drop occurred). With
  `participant-join` events now wired, a server-side connect-anchored cap becomes cheap — flagged for
  the captain as a candidate follow-on, one paragraph, no design here.
- **Lifecycle reference doc** (facts file §10): the settled termination model gets re-captured into a
  current on-disk reference as part of this feature's paperwork — carried as a `[DOC]` task for
  `/speckit.tasks`, content = baseline section A + this feature's boundary addition.
