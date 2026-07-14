# Implementation Plan: Oran's Signal Escalation Audio — device-side replica of the bridge audio

**Branch**: `006-signal-audio` | **Date**: 2026-07-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature spec (merged scope, R-006-6) + the engine-touch brief
([BRIEF_escalation_advance_engine_touch.md](./BRIEF_escalation_advance_engine_touch.md)).

**Scope (R-006-6):** 006 ships the **full device-side replica of the bridge audio** from cached clips — Iona
handover → per-contact "Trying to reach [Name]" + **channel-gated UK ringback** → between-contact handoffs →
spoken terminal ("I've reached [Name]…" on ack; method-aware exhausted otherwise) — synced to the real sweep by
a new **`escalation_advance`** signal. Signal stays a **non-call** product (audio only, on the device). The
Option-A split is dissolved; abstract tones are dropped.

## Summary

Make an Oran's Signal escalation **sound like the handsfree experience on the member's own device**. On
`escalation_started` the app plays the Iona handover; then, driven by a new per-attempt **`escalation_advance`**
FCM (carrying **contact name + channel**), it narrates each attempt ("Trying to reach [Name]") and — **only for
a call attempt** — plays a genuine **UK ringback**; an **SMS attempt** gets the named line + a pause, no ring
(Condition 1, the honesty fence). Between contacts it plays the handoff line; on `escalation_complete` it plays
the spoken terminal. All clips are **Polly-rendered, cached** (no fetch at escalation time), voice-matched to
the bridge/Twilio (Amy/Arthur). The audio is a **passenger** — it writes no escalation state and never
blocks/delays the engine; the one new engine emission is **fire-and-forget** and **gated on the captain's
sign-off of the brief**.

**Technical spine — mirror the bridge, add two fields.** The device already receives `escalation_started` and
`escalation_complete`; the missing middle is the per-attempt signal. The engine brief confirms the emission is
low-risk: at **both** dial sites the **contact name and channel are live locals** (`contact_first`; `touch_type`
→ channel), so the signal mirrors the proven `_bridge_send_advance_fcm` and just **adds `contact_first` +
`channel`**. The app side reuses the existing bridge per-contact plumbing (`setContactStatus`,
`renderCallingScreen`) and the `/audio/uk-ring` asset.

## Technical Context

**Language/Version**: JavaScript ES2017+ (`iona-app/www/app.js`); **Python 3** (howsu backend). No native
Kotlin/Java change (foreground/awake playback rides the WebView; no new channel — killed-state is out).

**Primary Dependencies**: **AWS Polly** via `boto3` (LIVE, smoke-tested); Capacitor `Filesystem` + `Preferences`
(clip cache + manifest); existing WebAudio / `HTMLAudioElement` playback; the existing FCM push handlers +
`send_bridge_data_push` (`pwa_sender.py:218`) as the emission vehicle. Creds from `config.py`.

**Storage**: On-device clip cache (Filesystem) + a manifest with the **`COPY_VERSION` tag** (deck v1.4). Backend
serves per-contact clips; static clips (incl. the **UK ringback**) bundled in `www/audio/signal/`. **No Airtable
schema change.**

**Testing**: `node --check` + `python3 -m py_compile` as push preconditions; the **escalation harness must stay
green** (the emission adds no engine path). **On-device (Pixel 4a) full-replica runs are the bar** + a
**wifi-tablet** parity run.

**Target Platform**: Android (Capacitor WebView), foreground/awake only. Media-stream audio.

**Project Type**: Cross-repo mobile + backend. App: `/Users/Henry/iona-app` (`www/app.js`, `www/audio/signal/*`).
Backend: `/Users/Henry/.openclaw/workspace/howsu` (`escalation_copy.py` [v1.4, done]; `signal_audio_render.py`
[done]; `render_signal_static.py`; the per-contact endpoint + the `escalation_advance` emission in
`reply_to_airtable_webhook.py` + `escalation_manager.py` + a shared helper in `pwa_sender.py`).

**Performance Goals**: **Zero clip-asset fetch at escalation time.** The `escalation_advance` emission is
**fire-and-forget** — zero added latency on the sweep (esp. the final mobile SMS sweep, which walks
synchronously — brief risk #2). Name audible within 2 s of the signal arriving (SC-006).

**Constraints**: **Honesty fence** — ring only on genuine call attempts (Condition 1). **Passenger** — no
escalation-state writes, never blocks/delays the engine (I.4). **Copy = deck v1.4**, byte-identical. **No
ringback except on a confirmed call attempt.** Foreground/awake only.

**Scale/Scope**: Medium. Backend: the emission at 2 sites + a shared helper; a per-contact clip endpoint; the
render tool (drop tones, add handoff-half + attempt clips, bundle the ring). App: the `SignalAudio` replica
driver + cache/manifest + 3 lifecycle triggers + the per-attempt FCM handler + channel-gated ring + fallbacks.
No native module, no Airtable change, **no change to sweep/timing/terminal logic**.

## Constitution Check

*GATE: evaluated for the merged scope; re-check after the PRE-2 audition and on-device bring-up.*

| Principle | Status | Notes |
|---|---|---|
| I.1 no health/case data | ✅ Pass | Clips = generic reaching lines + contact first names already held. The signal carries index/sweep/channel/name — operational, not health. |
| I.2 proactive & reactive first-class | ✅ Pass | Makes the reactive Signal escalation audible; no trigger/engine-logic change. |
| I.3 promise the attempt; honesty | ✅ **Load-bearing / Pass** | **Channel-gated ring (Condition 1)** — ring only on a confirmed call attempt; SMS → named line + pause; lost signal → generic bed, no ring. Copy is the frozen deck. Terminals honest ("I've reached…" — Oran did place the call; "reached" not "spoken with"). |
| I.4 reactive higher bar; **fail loudly, never silently**; passenger | ✅ **Pass (max rigour)** | Audio is a **passenger** (FR-011/012): no escalation-state writes; the one engine emission is **additive + fire-and-forget + threaded** (brief risk #2) and **gated on the captain's brief sign-off** (Condition 2). Never-silent (SC-001). Engine byte-unchanged (proven by SC-007). |
| I.5 not elderly/medical | ✅ Pass | Companion-presence framing. |
| I.6 Iona presence; Oran voice | ✅ Pass (**amended**) | Iona (Amy) handover only; Oran (Arthur) all else; one switch. **Amendment recorded (deck v1.4): Oran may speak first-person singular in terminals** ("I've reached…") — R-006-7, captain-sanctioned. |
| I — reactive gating | ✅ Pass | Plays only for method = Signal (FR-016); no entitlement change. |
| II vocabulary | ✅ Pass | Frozen-deck copy; no banned words / raw field values. |
| III **mockups precede code** | ✅ Pass (audio analogue) | No new visual surface (screen mirror = out). The **PRE-2 owner listening audition of the full replica** is the mock→react→build gate. |
| III simplicity / scope | ✅ Pass | Mirrors the bridge signal (+2 fields), reuses `send_bridge_data_push`, the `/audio/uk-ring` asset, the existing per-contact app plumbing (`setContactStatus`) + FCM handlers + terminal cards. Net-new: Polly gen + cache + the replica driver. Scope walls listed. |
| IV creds/IDs from config; field IDs | ✅ Pass | AWS creds from `config.py`; contacts read backend-from-Airtable (Option B). |
| IV schema wall | ✅ N/A | No Airtable change. |
| IV `.js` only JS | ✅ Pass | app.js stays JS. |
| IV validate before push; repo+copy together | ✅ Pass | `node --check` + `py_compile`; app via `cap copy`+`installDebug`; backend restart (deploy reality reported). |
| IV **time-critical logic server/FCM-driven, not WebView `setTimeout`** | ✅ Pass | The escalation is server-driven (untouched); the sync is **FCM-driven** (`escalation_advance`/`_complete`/`_started`). The replica's on-device pacing timers are **foreground/awake only + passenger** — if the WebView freezes, audio stops, engine undisturbed; killed-state is out. |
| IV hands-free = native-SDK | ✅ N/A | 006 touches no call/speaker routing — app-local media playback. |
| IV contact lookup backend-from-Airtable | ✅ Pass | Per-contact clips generated from backend contact reads. |

**Gate: PASS.** The one **gating dependency (not a violation): the `escalation_advance` engine emission is
gated on the captain's sign-off of the brief** (Condition 2) — the `[ENG]` tasks do not start until then; the
rest proceeds in parallel. Justified new dependency/infra in Complexity Tracking.

## Architecture (state before tasks)

### 1. The replica sequence (what the device plays)
```
escalation_started ─▶ Iona handover (Amy)                         [existing push]
         then, per escalation_advance{index,sweep,channel,name}:   [NEW signal]
            channel=call ─▶ "Trying to reach {name}."  + UK ringback
            channel=sms  ─▶ "Trying to reach {name}."  + pause (NO ring)   ← Condition 1
            on advance   ─▶ handoff "There's no answer from {prev} — trying {name} now."
        between sweeps / lost signal ─▶ generic "still trying" bed + pause (no name, no ring)
escalation_complete{outcome,contact_name} ─▶ terminal:            [existing push]
            acknowledged ─▶ "I've reached {contact_name}, who knows you need help."  (generic if no clip)
            exhausted    ─▶ method-aware exhausted (from local summon source)
```
Pacing ports the bridge's cycle/pause model (R-006-2 superseded). No abstract tone.

### 2. The clip set (deck v1.4)
| Clip | Voice | Kind | Source |
|---|---|---|---|
| Iona handover | Amy | static/bundled | `OPENING_HANDOVER` |
| "Trying to reach {name}." | Arthur | **per-contact** | `ATTEMPT_LINE_BARE_TMPL` (bare — the "on the line" clause is bridge-hold copy; use the bare form on Signal) |
| **UK ringback** | — | static/bundled | reuse/bundle `/audio/uk-ring` |
| handoff "no answer from {prev} — trying {name} now" | Arthur | **per-contact pair** | `HANDOFF_TMPL` — see §3 |
| gap/"still trying" bed | Arthur | static/bundled | `GAP_FALLBACK` (bare Signal form — no "on the line") |
| exhausted button/app/both | Arthur | static/bundled | `exhausted_line(*)` |
| acknowledged (named) | Arthur | **per-contact** | `ACKNOWLEDGED_TMPL` (v1.4 "I've reached {name}…") |
| acknowledged (generic) | Arthur | static/bundled | `ACKNOWLEDGED_GENERIC` |

*(Bare-form gap/attempt lines: the deck's `GAP_FALLBACK`/`ATTEMPT_LINE_TMPL` carry "We're staying on the line
with you" — honest on the bridge, a call-claim on Signal. Use `ATTEMPT_LINE_BARE_TMPL` + a bare gap line. This
is a small Signal-copy question to confirm with the deck owner alongside the render — flag, not invent.)*

### 3. The handoff clip (names two contacts) — generation strategy
`HANDOFF_TMPL` = "There's no answer from {prev} — trying {name} now." names both. Options for `/plan`→tasks:
- **(A) Decompose** into a per-contact half "There's no answer from {prev}." + reuse the next contact's
  "Trying to reach {name}." — two cached per-contact clips concatenated. Fewest clips (N, not N²), simplest cache.
- **(B) Pre-render adjacent-pair clips** in sweep order. More faithful to the single deck sentence; more clips.
- **CC recommends (A)** (per-contact scale, natural reuse of the attempt clip). Confirm at build.

### 4. Generation & cache (backend + app)
- **Static clips** (handover, exhausted ×3, generic ack, gap bed, **UK ring**) rendered once + bundled to
  `www/audio/signal/`, tagged `COPY_VERSION`. `render_signal_static.py` updated: **drop the 3 tones**, add the
  bare-form gap, bundle the ring.
- **Per-contact clips** (attempt "Trying to reach {name}.", handoff-half "no answer from {name}.", acknowledged)
  generated via the backend endpoint at **contact-save/rename** + **app-start reconcile**; never at escalation time.
- **Cache**: Filesystem + manifest (`COPY_VERSION`); mismatch → regenerate; GC on delete (the three lifecycle
  triggers).

### 5. The `escalation_advance` emission (backend — GATED on the brief, Condition 2)
Per the brief: emit at **Point 1** (`escalation_manager.run_escalation:456`, hardcode `channel="call"`) and
**Point 2** (`_fire_one_touch`, `channel` from `touch_type:5177`), both carrying `contact_index, sweep, channel,
contact_first, run_token`, via a **shared helper `send_escalation_advance(...)` in `pwa_sender.py`** (brief
recommendation B — one signal-builder, ADD-006-1 shared infra), **fire-and-forget / threaded** (brief risk #2),
**data-only, not alarm-class**, **no dedup**. **These `[ENG]` tasks do not start until the captain signs the brief.**

### 6. App playback driver (`www/app.js`)
New `SignalAudio` replica state machine: consumes `escalation_started`→handover, `escalation_advance`→named
attempt + channel-gated ring/handoff, `escalation_complete`→terminal; reuses `getAudioContext()`/`HTMLAudioElement`
(media stream, full volume, FR-018); gated on method = Signal (FR-016); one voice switch; fallbacks
(missing/stale → generic; lost signal → generic bed, no ring/name; never silent). Wires to the existing
per-contact plumbing so the (later) 007 screen mirror consumes the same signal (ADD-006-1).

### 7. Coherence (ADD-006-2)
The 006 screen is a **static** contact list. Verify the app's `escalation_advance` naming follows the **same
contact-slot order** the list renders, so audio can't name "David" while the list reads Margaret-first. Note the
ordering contract for the 007 screen-mirror task.

## Project Structure

```text
specs/006-signal-audio/
├── spec.md      # merged scope (R-006-6)
├── plan.md      # this file
├── BRIEF_escalation_advance_engine_touch.md   # Condition-2 brief (captain review gates [ENG] tasks)
└── tasks.md     # /tasks output

iona-app/  (app)
├── www/app.js                 # NEW SignalAudio replica driver + cache/manifest + 3 lifecycle triggers
│                              #   + escalation_advance handler + channel-gated ring + fallbacks
└── www/audio/signal/*         # NEW bundled static clips incl. uk-ring (Polly one-time + the ring asset)

howsu/  (backend)
├── escalation_copy.py         # v1.4 — DONE (ACKNOWLEDGED_TMPL/GENERIC + COPY_VERSION + amendment)
├── signal_audio_render.py     # DONE (Polly wrapper)
├── render_signal_static.py    # UPDATE: drop tones, add bare gap, bundle uk-ring
├── pwa_sender.py              # NEW send_escalation_advance() shared helper           [ENG — gated]
├── escalation_manager.py      # Point 1 emission (channel="call")                      [ENG — gated]
├── reply_to_airtable_webhook.py # Point 2 emission (channel from touch_type) + per-contact clip endpoint  [ENG for emission]
└── config.py                  # AWS creds (from .env) — DONE
```

**Structure Decision:** Cross-repo; app owns playback + cache; backend owns copy + generation + the (gated)
emission. No native module, no Airtable change, no sweep/terminal-logic change.

## Complexity Tracking

| Addition | Why needed | Simpler alternative rejected |
|---|---|---|
| **`escalation_advance` engine emission** | The device has **no** per-attempt knowledge; the replica (names, ring, handoffs) is impossible without it. | Deferring it (Option A) — **rejected by the owner** (thin, un-familiar). Device-side inference — impossible (sweep is server-side). |
| **Channel field on the signal** | Condition-1 honesty fence — ring only on call attempts. | Omitting channel (bridge precedent) — **rejected**: would ring over SMS attempts (false claim). |
| **AWS Polly + device cache/manifest** | Voice continuity (Amy/Arthur = Twilio) + offline clips + copy-version integrity. | `SpeechSynthesis` (wrong voice, can't cache-version); fetch-at-escalation (violates poor-signal rule). |

## Phases / sequencing

0. **Gates.** PRE-1 Polly IAM (LIVE). **Captain sign-off of the engine brief** → unblocks `[ENG]` tasks. PRE-2
   owner audition of the **full replica** → sign-off gate.
1. **Copy + static render (backend).** `escalation_copy.py` v1.4 (DONE); update `render_signal_static.py` (drop
   tones, bare gap, bundle ring); render + bundle static clips. **Owner audition here (mockup gate).**
2. **Per-contact generation (backend).** The clip endpoint (attempt / handoff-half / acknowledged).
3. **App foundation (parallel, placeholders).** `SignalAudio` driver skeleton, cache/manifest, 3 lifecycle
   triggers, method gate.
4. **`[ENG]` emission (gated on the brief).** `send_escalation_advance` helper + Point 1 + Point 2 (channel-carrying,
   fire-and-forget). Verify harness green.
5. **Replica wiring (app).** handover / named attempts + channel-gated ring / handoffs / terminals / fallbacks /
   coherence.
6. **Verify to done.** Full Pixel replica matrix (incl. a mixed call/SMS sweep for the ring gate) + wifi tablet
   + I.4 passenger proof + PRE-2 audition + docs.

## Open items / dependencies

- **Captain brief sign-off** (Condition 2) — gates `[ENG]`; includes the Point-1 mechanism (A/B) + channel/fire-forget mitigations.
- **AWS Polly IAM** — LIVE; webhook restart loads the AWS env (time with backend deploy).
- **Bare-form Signal gap/attempt copy** — confirm the "no on-the-line clause" wording with the deck owner (small, flagged).
- **Owner listening session (PRE-2)** — full-replica audition (tone/ring/pacing/terminals) — sign-off gate.
- **007 screen mirror** — consumes the same `escalation_advance` signal (out of 006; ADD-006-1).
