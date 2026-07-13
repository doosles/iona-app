# Implementation Plan: Failed-join backstop

**Branch**: `008-failed-join-backstop` | **Date**: 2026-07-13 | **Spec**: [spec.md](./spec.md)

**Input**: Settled feature spec ([spec.md](./spec.md), both clarifications resolved 2026-07-13:
§5 → narrow-to-blip, promptness ceiling → 3 s, one shared boundary) + the plan/clarify facts file
([FACTS_FOR_PLAN_CLARIFY_2026-07-13.md](./FACTS_FOR_PLAN_CLARIFY_2026-07-13.md)) + the live-wire
baseline (vault: `02 CC Briefs/cc_findings_008I0_bridge_baseline_2026-07-13.md`).

> **Feature identity**: tracked via `.specify/feature.json` (no per-feature git branch; all features
> live on `main`). "Branch" above is the spec-kit identity.

## Summary

When a person's connection drops during a live bridged call, the contact must be told within 3 seconds
and released cleanly; the person must see the truth (never the exhausted card) and a plain way back;
no call is ever left hanging. **The organising constraint is the single 3-second boundary** (clarify
ruling 2026-07-13): inside 0–3 s the narrowed self-reconnect owns the moment (a healed blip is
invisible); at 3 s with no restoration, one boundary event simultaneously kills the reconnect, fires
the contact announcement, and closes the call.

**Technical spine — the server finally sees the member leg.** Baseline 008-I0 proved the server today
receives **no participant-level events at all** (no `<Conference statusCallback>` on any live leg; the
member leg's TwiML app has `status_callback = None`) — a person's mid-call drop is server-invisible.
The plan wires **conference status events (participant-join / participant-leave)** onto the bridge
conference with **per-leg participant labels** minted at TwiML time (`member` / `contact-{i}`), so
"who left" is carried by the event itself — the C1 distinguishability risk is closed by construction,
not inference. On `participant-leave(member)` while a contact is connected, the webhook arms a
**server-side 3-second boundary timer** (same `threading.Timer` pattern as `_bridge_arm_gap`); a
`participant-join(member)` inside the window cancels it (blip healed, silent). At expiry the **one
boundary event** fires once (one-shot guard): redirect the contact's leg to the drop-announcement
TwiML (`<Say>` owner-approved line `<Hangup/>` — hanging up the anchor ends the conference = the clean
close), push the truthful drop state to the person's app, write the honest EventLog terminal. The
member-terminal redirect primitive this reuses is already live (`_handle_twiml_bridge_announcement`
shape); the contact-leg SID is already tracked (`_bridge_active_contact_sids`).

**Why this is the gate, and what the spike proves.** Everything above stands on one unproven claim:
that Twilio's participant-leave event arrives reliably and promptly when a real device genuinely loses
its connection (not a clean SDK disconnect — a dead radio). Phase 0 is therefore an **on-device spike**
(quickstart.md is its runbook): real bridge, real drop (airplane mode mid-call), observe the event, the
3 s boundary, the announcement, the close. **No build past the spike without captain review of its
findings + owner sign-off** (standing ruling: this gates all late-join work).

**The two live bugs fall out of the same mechanism, not separate fixes.** C3 (contact stranded in a
live conference when the reconnect fails — no announcement, ~4 h provider default) and C2 (person shown
the dishonest exhausted card after a connected call) are both resolved by the boundary event: the
contact-leg redirect IS the un-stranding, and the app's drop state (plus a server-side
`drop-declared` guard on the wait-audio path) replaces the exhausted card on this path.

## Technical Context

**Language/Version**: Python 3 (howsu backend webhook — `reply_to_airtable_webhook.py` v2.14,
`ThreadingHTTPServer`, single worker); JavaScript ES2017+ (`iona-app/www/app.js`); Java (Capacitor
plugin `TwilioVoicePlugin.java`) — expected **read-only** this feature (the reconnect narrowing is
JS-side; the SDK disconnect/connect events already surface to JS).

**Primary Dependencies**: Twilio Voice — TwiML `<Conference>` (`statusCallback` +
`statusCallbackEvent` + `participantLabel` attributes, to be wire-verified in the spike), Calls-API
redirect (the existing terminal primitive), REST conference/participant reads (existing
`_bridge_contact_has_joined` pattern); FCM data pushes via `pwa_sender.send_bridge_data_push`
(data-only, high priority — the proven backgrounded-delivery shape); `escalation_copy.py` (deck) for
the two new owner-ruled lines; `log_narrator.py` MATRIX for the honest history rendering. Credentials
from `config.py` only.

**Storage**: No Airtable schema change. New EventLog vocabulary is free-text `singleLineText` guarded
code-side (`event_logger.VALID_*` — the established recipe); see data-model.md. Bridge/boundary state
is webhook **process memory** (accepted single-worker cost, consistent with v5.28) with the watchdog
floor as the restart backstop — see research.md R6.

**Testing**: `/escalation-test` bridge harness (direct-drive of the new callback handler + boundary
timer under dispatch suppression — same pattern as the 12/12 bridge checks); `py_compile` +
`node --check` gates; **on-device Pixel proof is the acceptance bar** ("verified" means on-device):
the spike matrix in quickstart.md (real drop, blip-heal, contact-hangup control, total-loss soak).

**Target Platform**: Android (Capacitor app on the Pixel test device) + the howsu backend (webhook
behind ngrok).

**Project Type**: Two-repo feature — backend surface in the howsu workspace, app surface in iona-app
(the 004/006/007 pattern). Spec-kit artifacts live here; backend edits land in the howsu tree and are
recorded in the master reference per its alignment rule.

**Performance Goals**: Contact told ≤ 3 s from member-leg drop (SC-001 — hard ceiling, owner-ruled);
announcement→close within the defined short interval (SC-002); zero false announcements on normal
contact hang-up (SC-004).

**Constraints**: The 3 s boundary timer MUST be server-side — the device whose timers would run it is
the device that just dropped (Constitution IV: time-critical logic is server- or FCM-driven, never
WebView `setTimeout`). The boundary is ONE timer and ONE flip — no second timer, no gap (clarify
ruling). Reconnect must be structurally dead after the boundary (late rejoin must not resurrect or
create a ghost conference — research.md R4). Copy is owner-gated before build (GATE-COPY); the
person's drop-state card is a mockup gate (Constitution III).

**Scale/Scope**: Pre-launch, single test device; the mechanism must be correct, not scaled. Touches:
webhook (~4 sites: TwiML mint via shared builder, new callback endpoint, boundary driver, wait-audio
guard), `escalation_copy.py`, `pwa_sender.py` (one new push type), `event_logger.py` (guard values),
`log_narrator.py` (MATRIX rows), `app.js` (reconnect narrowing + drop-state card + push handler).

## Constitution Check

*GATE: passes — one justified consolidation recorded in Complexity Tracking. Re-checked after Phase 1
design (no change).*

- **I.3 Promise the attempt, never the outcome** — PASS. Both new lines state what happened and hand
  control to the people; no recovery promise ("reconnecting you" / "please hold" are explicitly
  forbidden by FR-006). The reconnect that does exist is silent and bounded, so nothing spoken ever
  references it.
- **I.4 Reactive path fails loudly, never silently** — PASS (this feature is that principle applied to
  the drop case). Detection failure itself degrades loudly: if the participant-leave event never
  arrives, the existing stall-watchdog floor and the contact's own agency remain; the spike exists
  precisely to prove the event arrives. The boundary terminal always writes an EventLog row.
- **II Vocabulary** — PASS with GATE-COPY. Two owner-ruled lines (contact drop line, person drop
  state); no banned words in anything spoken/shown; the exhausted-cycle language is explicitly
  firewalled from this path (FR-004). Nothing in this feature surfaces system jargon.
- **III Build discipline** — PASS. Mockup gate on the person's drop-state card before app build;
  copy deck extension signed before any TwiML/audio work; surgical edits only (webhook is
  never regenerated); scope walls: no exhausted-terminal change, no reaching-phase change, no
  late-join work.
- **IV Technical guardrails** — PASS. Server-side boundary timer (never WebView `setTimeout`);
  credentials/IDs from `config.py`; free-text EventLog values via the code-side guard (no schema
  wall); `py_compile` / `node --check` before any push; two-repo rule (howsu backend + iona-app app
  surface committed in their own trees); no global find/replace.

## Project Structure

### Documentation (this feature)

```text
specs/008-failed-join-backstop/
├── spec.md                                  # Settled spec (markers cleared 2026-07-13)
├── FACTS_FOR_PLAN_CLARIFY_2026-07-13.md     # Owner-supplied plan/clarify context
├── plan.md                                  # This file
├── research.md                              # Phase 0 — decisions R1–R7 + spike design
├── data-model.md                            # Phase 1 — states, events, EventLog vocabulary
├── quickstart.md                            # Phase 1 — the on-device spike runbook (the gate)
├── contracts/
│   ├── conference-events-endpoint.md        # POST /bridge/conference-events (Twilio → webhook)
│   ├── drop-announcement-twiml.md           # Contact-leg boundary TwiML (Say + Hangup)
│   └── drop-state-push.md                   # bridge_drop_declared FCM (webhook → app)
└── tasks.md                                 # Phase 2 (/speckit.tasks — NOT created by plan)
```

### Source Code (repository root)

```text
# Backend — howsu workspace (~/.openclaw/workspace/howsu/), the 004/006/007 two-repo pattern
reply_to_airtable_webhook.py    # Shared <Conference> TwiML builder (one mint authority — C4);
                                #   POST /bridge/conference-events handler; 3s boundary driver
                                #   (_bridge_arm_drop_boundary / _bridge_drop_boundary_fire);
                                #   wait-audio drop-declared guard (late-rejoin honesty)
escalation_copy.py              # Deck v1.3: CONTACT_DROP_LINE + person drop-state copy (owner-gated)
pwa_sender.py                   # bridge_drop_declared data push (reuses send_bridge_data_push)
skills/event_logger/scripts/event_logger.py   # VALID_* additions (data-model.md)
log_narrator.py                 # MATRIX rows for the drop terminal (never exhausted language)

# App — iona-app (this repo)
www/app.js                      # Reconnect narrowed to the 3s window; bridge_drop_declared handler;
                                #   truthful drop-state card (replaces exhausted card on this path);
                                #   _bridgeReconnectGaveUp retired/replaced by boundary semantics
android/.../TwilioVoicePlugin.java   # Expected read-only (events already surface to JS)
```

**Structure Decision**: Two-repo feature following the established pattern — spec-kit artifacts and
app surface in iona-app; backend surface in the howsu tree, recorded in the master reference
changelog + `/howsu-align` at close (007's T015 pattern).

## Phase 0 — the spike (research.md + quickstart.md)

Phase 0 is not literature research: it is the **gate**. research.md pins the seven design decisions
(R1 detection mechanism, R2 leg identity, R3 boundary ownership, R4 late-rejoin honesty, R5 close
semantics, R6 state/coherence, R7 what the spike must prove and what falls back if it fails);
quickstart.md is the spike's on-device runbook. Spike findings return to the captain (Checkpoint B)
before any `[BUILD]` task is generated by `/speckit.tasks`.

## Phase 1 — design artifacts

data-model.md (states, transitions, EventLog vocabulary, narrator rows) + contracts/ (the three
interface contracts above). Both are written against the *decided* mechanism but marked where a value
is spike-verified vs doc-asserted, so a spike surprise updates one authority, not scattered prose.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Shared `<Conference>` TwiML builder (touches the byte-stable live member TwiML) | The conference attributes (statusCallback, labels) must be identical across the two mint sites (member `:2653`, contact `:4011`) or leg identity drifts (baseline risk C4) | Editing both literals in place keeps the "two sites that must agree by hand" failure mode this feature exists to close; the builder is one function, not an abstraction layer |
| Keeping ANY self-reconnect (bounded) rather than pure remove | Clarify ruling (narrow-to-blip): a sub-3s flicker healing silently is genuinely better than announcing a drop that did not functionally occur | Pure remove was weighed and rejected by the captain — the ruling makes non-contradiction structural (one boundary event), so the retained reconnect carries no honesty risk |
