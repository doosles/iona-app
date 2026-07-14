# Engine-touch investigation brief — the `escalation_advance` emission (feature 006, Condition 2)

**Status:** Read-only investigation complete — **awaiting captain review**. Per the entry-point rule
(Constitution I.4), this brief declares, at each emission point, **what engine state is assumed and who
provides it**, before any emission code is written. **The engine-emission tasks (tasks.md T-ENG-*) gate on the
captain signing this off.** No engine code has been changed.

**What is being added:** a new, **additive, fire-and-forget** `escalation_advance` FCM at **each per-contact
dial** on the Oran's Signal (direct-alert) path, so the member's device can narrate "Trying to reach [Name]"
and play a **channel-gated** UK ringback in sync with the actual sweep. It writes **no** escalation state and
must **never** block or delay the sweep (FR-004/011/012). It mirrors the proven bridge pattern
`_bridge_send_advance_fcm` (`reply_to_airtable_webhook.py:4971`), sent via `send_bridge_data_push`
(`pwa_sender.py:218` — data-only + `android:{priority:"high"}`, **not** a tray notification, **not**
alarm-class).

## Headline finding (the load-bearing de-risk)

**At BOTH dial sites, the contact first name AND the attempt channel are already live locals — no extra read,
no lookup.** This is what makes the honesty fence (Condition 1 — ring only on call attempts) cleanly
supportable. The signal must carry **`contact_first`** (name) and **`channel` (call/sms)** explicitly — the
bridge precedent omits channel only because the bridge is call-only.

## The two emission points

### Point 1 — initial contact-1 fire · `escalation_manager.run_escalation()`
- **Dial site:** `make_call(...)` at `skills/escalation_manager/scripts/escalation_manager.py:456` (fires once,
  then `break` at :513 — hands the rest of the sweep to the webhook callback).
- **Channel: always `call`** — `attempt_type = get_attempt_type(sweep=1, …)` at :449 returns `"Emergency Call 1"`
  unconditionally (the SMS branch is only reachable at attempt 3). **Hardcode `channel="call"` here.**
- **Name: in hand** — `contact_first` at :369 (read from `table1_fields[contact_def["first"]]`); index
  `econtact_index` at :382; `sweep=1` at :448.
- **Process:** runs in the **runner process** (`periodic_taskflow_runner.py:267`, `no_response` path) **or** the
  **webhook process** (negative-keyword / user-alert). **FCM-from-runner is already proven** — this function
  already sends `escalation_started` via `send_pwa_contact` at :435 (gated on `User Channel == "PWA"`, :433). A
  fire-and-forget advance send is safe from either process.
- **The one seam (flagged):** this site lives in the **skill module, deliberately decoupled from the webhook**
  (comment at :528). Emitting the mirror here means either importing `pwa_sender.send_bridge_data_push` into the
  skill (partially precedented — it already imports `send_pwa_contact`) or a tiny duplicated helper. **This is
  the single design decision on Point 1** — see "Open question for the captain".
- **Re-sweep:** N/A (fires once, never repeats).

### Point 2 — every subsequent dial · `_fire_one_touch()` (webhook)
- **Dial sites:** `send_sms(...)` at `reply_to_airtable_webhook.py:5189` (SMS branch, `if touch_type == "Alert
  Message"` at :5187) and `make_call(...)` at :5195 (call branch). Driven by `_advance_escalation_sweep` (:5215)
  ← `process_escalation_callback` (:4678).
- **Channel: a live local `touch_type`** — decided at the dial site:
  ```
  :5175  is_final = sweep >= sweep_count
  :5176  channel_input = 3 if (is_final and sweep_count >= 2) else sweep
  :5177  touch_type = get_attempt_type(channel_input, contact_phone)
  ```
  → **`channel = "sms" if touch_type == "Alert Message" else "call"`** (derivable at :5177, before either dial).
  SMS fires **only** when `channel_input == 3` **and** the number is mobile (`is_mobile`); a landline on the
  final sweep is still `Emergency Call 3` (a call); a 1-sweep config is always a call.
- **Name: in hand** — `contact_first` at :5167 (`contact_def = CONTACT_FIELDS[econtact_index]` at :5166);
  `econtact_index`, `sweep`, `sweep_count` are parameters (:5155).
- **Process:** **always the webhook process**, in a per-callback **daemon thread** (`process_escalation_callback`
  spawned at :4197; `ThreadingHTTPServer` at :5339/:5345). `pwa_sender` is already used in this module
  (`send_escalation_complete_push` at :4502/:5307). Same module as the bridge pattern — **clean, no seam.**
- **Re-sweep:** the direct path has **no `(index, sweep)` dedup** (the `_bridge_advanced_contacts` guard is
  bridge-only, :5119). So each re-sweep dial is a genuine fresh dial and a fresh emit is **not** suppressed —
  exactly the re-announce behaviour wanted. **Do not add a dedup guard.**

## Assumptions ledger — what each emit assumes / who provides it

| State assumed at emit | Point 1 (`run_escalation` :456) | Point 2 (`_fire_one_touch` :5187/:5195) |
|---|---|---|
| `table1_record_id` | caller (runner :267 / webhook wrapper :4473) | callback URL → passed down |
| `run_token` | minted here :337 (or webhook-passed) | callback URL → passed down |
| record fields (name/phone/channel) | fresh Airtable read :341 | read once by callback :4764, passed down |
| contact **first name** | `contact_first` :369 ✅ in hand | `contact_first` :5167 ✅ in hand |
| **channel** (call/sms) | constant `"call"` :449 ✅ | live local `touch_type` :5177 ✅ |
| contact index / sweep | `econtact_index` :382 / `sweep=1` :448 | params (:5155) |
| ack/decline guards clear | not checked here (webhook owns them) | checked upstream in the callback (:4697–4717) **before** the dial ✅ |
| FCM token | separate `get_fcm_token` read (in sender) | separate `get_fcm_token` read (in sender) |

**Safe-moment note (Point 2):** by the time `_fire_one_touch` dials, `process_escalation_callback` has already
passed the terminal-status filter (:4697), the per-Call-SID fire-once (:4704), the `ESCALATION_ACKNOWLEDGED`
halt (:4710) and `ECONTACT_DECLINED` (:4717) — the instance is confirmed live + un-acked. Emitting here cannot
race a stand-down.

## Risk flags & required mitigations

1. **Channel MUST be carried explicitly** (load-bearing honesty fence). Set `channel` from `touch_type` at :5177
   (Point 2) and hardcode `"call"` at :449 (Point 1). A missing/`"call"` channel on an SMS attempt would make the
   device play a **false ringback** — the exact thing Condition 1 forbids.
2. **Fire-and-forget / threaded emit** — on the **final mobile SMS sweep**, `_advance_escalation_sweep` walks the
   remaining contacts **synchronously** (:5229–5232), so a synchronous per-contact FCM would serialize and drift
   the pacing **in the very sweep where the ring must NOT play**. Emit on a daemon thread (or best-effort async)
   so it is genuinely fire-and-forget. (Point 1's single send is low-risk but should match for consistency.)
3. **The skill-module seam (Point 1)** — decide the import vs helper (see below). Point 2 is clean.
4. **No dedup** — correctly none exists on the direct path; do **not** add one (re-sweeps must re-announce).
5. **Not alarm-class** — route via `send_bridge_data_push`, not `send_push_notification`; keep out of
   `ALARM_CLASS_TYPES` (`pwa_sender.py:64`) — this is foreground UI narration, not a killed-app wake.

## Proposed signal shape (mirrors `_bridge_send_advance_fcm`, + name + channel)

```
type          = "escalation_advance"
contact_index = <0-5>                     # from econtact_index
sweep         = <n>                        # from sweep
channel       = "call" | "sms"             # Point 1: "call"; Point 2: from touch_type :5177
contact_first = <first name>               # :369 / :5167 (already in hand)
run_token     = <token>                    # instance scoping, parity with other pushes
```
Sent data-only + `android:{priority:"high"}` via the `send_bridge_data_push` pattern (`pwa_sender.py:218`),
fire-and-forget. The device already receives `escalation_started` (before) and `escalation_complete`
(outcome + contact_name, fire-once, `pwa_sender.py:299`) — the new per-attempt signal slots **between** them.

## Open question for the captain (the one real decision)

**Point 1 emission mechanism** — emit the advance from the decoupled skill (`run_escalation`) by:
- **(A)** importing `pwa_sender.send_bridge_data_push` into `escalation_manager.py` (it already imports
  `send_pwa_contact`, so the coupling precedent exists), or
- **(B)** a tiny shared helper (e.g. `send_escalation_advance(...)` in `pwa_sender.py`) called from both points —
  keeps one signal-builder, avoids drift between Point 1 and Point 2. **CC recommends (B)** (single source for the
  signal shape; ADD-006-1 wants it as shared infrastructure anyway).

## Gate

Per Condition 2, the emission tasks (`tasks.md` — the `[ENG]`-tagged tasks) **do not begin until the captain
signs off this brief** (in particular the Point-1 mechanism A/B and the channel-carrying + fire-and-forget
mitigations). The rest of 006 (clip generation, the app playback driver, cache/lifecycle, terminals, fallbacks)
proceeds in parallel and does not gate on this.
