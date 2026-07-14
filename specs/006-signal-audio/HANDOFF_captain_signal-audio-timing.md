# HANDOFF → Captain — 006 Signal-audio: call-state SYNC needs a design review

**Date:** 2026-07-11 · **Requested by:** owner ("going from bad to worse, time to rope in the captain")
**Ask:** review the *approach* to device-side call-sync — CC has been patching it symptom-by-symptom on-device
and it isn't converging. The core feature works and is owner-approved; only the fine ring/timing sync is fighting us.

## Where 006 stands — built + OWNER-CONFIRMED working on-device
The merged-scope device replica (R-006-6) is live on the Pixel and, on the owner's own testing, these are **good**:
- Iona handover → Oran narration (one voice switch).
- **Recurring named cadence** (ring → re-say "Trying to reach {name}" → ring …) — owner: *"like an actual call in progress."*
- Between-contact **handoffs** + **re-sweep** line ("no answer from John — trying Margaret again", v1.6).
- **Terminals**: acknowledged "I've reached {name}, who knows you need help. Take care now." (v1.7) + matching **card**; method-aware/both-options exhausted.
- **Screen** now shows the Airtable contacts (Margaret + John), not the account holder (was reading Memberstack; repointed to the device-dial/Airtable cache).
- **SMS / channel-gate** confirmed (SMS received on sweep 2; no ring on an SMS attempt).
- Deck **v1.7**; `escalation_advance` emission harness-green (direct 16/16 · bridge 12/12); bridge byte-unchanged throughout.
- **Owner audition of the core = PASS.**

## The unresolved problem — RING vs real call state
The device only stops/starts the ring cleanly in *some* cases. The symptom has **moved** with each fix, which is
itself the diagnosis — the discrete model has no single source of truth to lock onto:

- **First:** a **mobile to voicemail** rang ~30s (through the whole voicemail message) before moving on.
  Log-confirmed timeline:
  ```
  ringing (~10-15s)  →  in-progress (voicemail picks up)  →  completed, AnsweredBy: machine_start (~30s, after the message)
  ```
  `TERMINAL_CALL_STATUSES = {no-answer, busy, failed, completed, canceled}` — so "call ended" was only *terminal* at
  **completed** (~30s). CC moved the ring-stop to also fire at **in-progress**/**answered** (connect).
- **Then (after that change):** **contact 2 doesn't ring at all.** Near-certain cause: contact 1's late
  `in-progress`/`completed` callback fires an **`ended`** *after* contact 2 has already started dialing — and the app's
  `ended` handler just stops "whatever is ringing" because **the `ended` signal has no per-attempt identity the app
  validates**. A stale `ended` from the previous contact kills the current contact's fresh ring.
- **Then (same run):** after the **acknowledged terminal** (a contact reached in sweep 2, escalation over), the device
  **keeps playing "still trying to reach your contacts"** — the complete/terminal does **not cancel the gap-bed loop**,
  so it leaks past the ending.

**All three are one root cause, not three bugs:** several independent audio loops (reach-loop, gap-bed, terminal) are
each started/stopped by separate, out-of-order FCM pushes, with **no single authoritative "current attempt / escalation
is over" state that every loop must obey**. You cannot reliably reconstruct precise leg state from independent pushes
without (a) an attempt token the receiver validates and (b) one owner that arbitrates which loop may sound. This is a
**design gap, not a tuning bug** — which is why each patch just moves the symptom.

## The architectural crux (why this is hard)
- **Bridge (works):** the ring is **server-side**. The wait-audio TwiML **polls the live conference leg state every
  cycle** and plays ring **only while a leg genuinely rings** (the R6 "observed-truth" rule). Precise by construction.
- **Device replica (fighting us):** it **reconstructs** that from **discrete FCM pushes** — `escalation_advance`
  `phase:"dialing"` at each dial, `phase:"ended"` at connect/terminal. The device has **no continuous call-state
  feed**; it *infers* ring/stop from these pushes. Reconstructing exact call-state timing (voicemail in-progress vs
  completed, AMD verdict lag, the 10s between-sweep gap) from discrete pushes is inherently fragile — every call
  outcome is a separate edge case the device has to get right.

## What CC has tried (each fixed a symptom; the sync kept finding edges)
1. Serial playback **queue** — fixed the handover being cut by the near-simultaneous first advance.
2. **Recurring cadence loop** — fixed "all ringing with snippets" (owner approved).
3. **CORS fix** on `/signal-audio/clips` — clips weren't caching (preflight was blocked).
4. **Screen source** → device-dial/Airtable cache — fixed the account holder showing as a contact.
5. **"Take care now"** copy + **card match**.
6. **`ended` signal** to stop the ring: first at `completed` only (→ still ~30s), then also at `in-progress`/`answered`
   (→ owner: "bad to worse").
7. **Gap bed** — loop "still trying to reach your contacts" during the between-sweep pause (mirrors the bridge).

## Current deployed state
- **Backend:** deck v1.7; `send_escalation_advance(..., phase=)` (dialing|ended); "ended" emitted at
  `answered`/`in-progress` (connect) AND at terminal; T005 `/signal-audio/clips` (base64 clips + handoffs + resweep);
  `do_OPTIONS` CORS for `/signal-audio/`. Harness green.
- **App (`www/app.js`, SignalAudio module):** queue + reach-loop (ring+re-say) + gap-bed + terminal lead-in/tail +
  `phase:"ended"` → `_saStopReach`; clips cached in Preferences (base64), cache-busted fetch.

## Questions for the captain (the design call)
1. **Is discrete-push reconstruction the right model** for device-side call-sync? Options:
   - (a) Emit **more granular per-call-state signals** (a clean ringing / answered / ended event stream) so the
     device mirrors the leg exactly — pushes the "observed truth" to the device instead of inferring it.
   - (b) **Simplify the device model** — a bounded ring per attempt (e.g. cap at the ring-timeout), don't chase the
     exact call end; accept the ring may slightly lead/lag reality.
   - (c) **Accept imperfect sync for 006 v1**, ship the owner-approved core, and make precise sync a 007 item.
   - (d) **Reconsider the device ring entirely** — is a literal ringback the right device sound, vs a simpler
     "working" bed that doesn't need call-state sync?
2. Given the **core replica is owner-approved** and only the fine call-sync is fighting us, **where is the right
   "done" line for 006**, and should the sync work be its own scoped slice (with the granular-signal question decided first)?

## Files
- **howsu:** `escalation_copy.py` (v1.7) · `signal_audio_render.py` · `render_signal_static.py` · `pwa_sender.py`
  (`send_escalation_advance`) · `reply_to_airtable_webhook.py` (`_handle_signal_audio_clips`, the two
  `escalation_advance` dial emits + the callback `ended` emits, `do_OPTIONS`) · `escalation_manager.py` (Point-1 emit).
- **iona-app:** `www/app.js` (SignalAudio module) · `www/audio/signal/*` (bundled clips).
- **specs/006-signal-audio/:** spec.md · plan.md · tasks.md · BRIEF_escalation_advance_engine_touch.md · this handoff.
