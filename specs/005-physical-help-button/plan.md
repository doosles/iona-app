# Implementation Plan: A Physical Button That Summons Help

**Branch**: `005-physical-help-button` | **Date**: 2026-07-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-physical-help-button/spec.md`

## Summary

Give a person a Flic 2 button they keep nearby that, on their chosen summon gesture (press-and-hold by
default), starts **the existing help sequence** — the very same one the in-app help control starts. The
button is a *second front door*, not a second system: the native press surfaces to the web layer and calls
`_startHelpSequence(...)`, so the existing cancel window, the `escalation_state` idle-guard (duplicate
absorption), and all downstream behaviour apply unchanged. A one-time, four-screen pairing flow lives in
calm settings; pairing persists across app/phone restarts and battery changes; an always-armed listener is
kept alive by a foreground service. Two safety rules are load-bearing (Constitution I.4): **a press acts
now or not at all** (stale, queued out-of-range presses are dropped) and **a press never stacks** (a second
summon during a live sequence is absorbed by the existing guard — verified, not rebuilt).

**Reassurance & no silent death.** A **double-tap** runs an **end-to-end service test** (US6): it travels
the real path — button → phone → a purpose-built webhook endpoint that **logs the test and suppresses
dispatch** — and returns a multi-channel confirmation (sound/orb/ping/haptic); **both** a pass and a
no-response are written to the EventLog (carer-visible). Three silent-death defences sit alongside it: the
listener **re-arms on boot** (a `BootReceiver`, since SDK storage persists only the pairing, not a running
listener), a **battery-optimization exemption** is requested in calm setup against OEM power management, and
the **button's own low battery** is surfaced early (status row + calm heads-up + logged) — a dying cell being
the commonest real-world cause of a button going quietly dead.

**Technical approach — reuse two proven patterns, add one bridge.** The reactive help path already exists
and is entered at `_startHelpSequence('help_control')` (`www/app.js:1207`). The Android side already has
**custom Capacitor plugins** (`ZeroCallPlugin`, `TwilioVoicePlugin`) and a **foreground service**
(`BridgeService`). This feature adds a third plugin — a thin bridge over the official `flic2lib-android`
SDK — following those same in-repo patterns, plus a listening foreground service, and wires its press
event into the unchanged help entry. **No new or parallel help path is built.**

## Technical Context

**Language/Version**: JavaScript ES2017+ (Capacitor WebView app, no framework); **Java** (new native
Capacitor plugin + Application class + foreground service, matching the existing `com.iona.app.*` sources).

**Primary Dependencies**: **`flic2lib-android`** via **JitPack** (`com.github.50ButtonsEach:flic2lib-android`);
Capacitor 8.4 (`@capacitor/core`, `@capacitor/android`); existing Capacitor `Preferences` plugin (gesture
preference + paired-state cache); the existing `_startHelpSequence` help path (unchanged).

**Storage**: **Device-local only** — the Flic SDK persists pairings in the phone's internal storage
(survives reboots); the summon-gesture preference is a Capacitor Preference. **No backend/Airtable schema
change** (unlike feature 004) — the button is a local trigger into an existing path.

**Testing**: `node --check` (app.js) + a clean `gradlew assembleDebug` (native) as push preconditions;
**on-device verification on the physical Pixel + the physical Flic unit is the only "verified"** (per
constitution + project memory — build/deploy alone is not "verified").

**Target Platform**: Android (Capacitor). **minSdk 24, compileSdk 36, targetSdk 36** (from
`android/variables.gradle`) — so **Android 12+ runtime BLE permissions** and **Android 14+ foreground-service
type rules** both apply and must be handled.

**Project Type**: Mobile app (Capacitor WebView + native Android), primary repo `/Users/Henry/iona-app`.
The **summon path is single-repo**; the **service test is cross-repo** (howsu backend) — a permanent
`/service-test` webhook endpoint + two new EventLog types. This *replaces* the throwaway `/flic-test` rig
rather than merely retiring it (contrast the earlier plan's "cleanup only").

**Performance Goals**: No added latency on the summon path — the native press event calls the same
`_startHelpSequence` the in-app control uses. The always-armed listener is a passive BLE connection kept up
by the foreground service; no polling.

**Constraints**: Reactive path must **fail loudly, never silently** (I.4). The stale-press guard and the
reconnect-on-launch re-attach are the two places this feature could fail *silently* if done wrong, so both
are mandatory and on the safety checklist. Time-critical logic stays **native/SDK-driven, never a WebView
timer** (IV) — the press delivery, the stale-age check, and the listening service are all native.

**Scale/Scope**: Small–medium. Native: 1 plugin + 1 Application class + 1 foreground service + manifest +
Gradle. Web: pairing flow (4 states) + Service-tab row + gesture setting + press→help wiring + stale guard.
No multi-button, no hub, no purchase flow.

## Constitution Check

*GATE: evaluated before build. Re-check after the mockup is in hand and after on-device bring-up.*

| Principle | Status | Notes |
|---|---|---|
| I.1 Contact/escalation layer only — no health/case data | ✅ Pass | Stores only a device pairing identity + a gesture preference. No health, reasons, or case data. |
| I.2 Proactive & reactive both first-class; **a device trigger fires the escalation the system already knows how to run** | ✅ **Exemplary** | This feature is the literal embodiment of I.2 — an external button is the *same event* as an in-app help press; it triggers the existing sequence, builds no new one. |
| I.3 Promise the attempt, not the outcome | ✅ Pass | The button *starts* the existing sequence; SC-001 defines "summons help" as the sequence starting, never a contact answering. Copy promises the attempt. |
| I.4 Reactive path = higher reliability bar, **fail loudly** | ✅ Pass (rigour required) | Stale press **dropped deterministically in native** (age check), duplicate **absorbed by the existing `escalation_state` guard**, **reconnect-on-launch** re-attach mandated, foreground service keeps the path alive. Every failure mode named + on the safety checklist. |
| I.5 Not elderly/medical framing | ✅ Pass | "Keep it nearby" framing; no medical/institutional copy or imagery. |
| I.6 Iona is a presence, name only (pronoun-free); Oran = escalation voice | ✅ Pass | Ongoing notification reads **"Iona is here for you."** — name only, no pronoun. Pairing copy must stay name-only (checklist item). |
| I — SETTLED reactive gating (hands-free = premium) | ✅ Pass / no conflict | The button triggers the **escalation floor** (the universal, never-gated summon), NOT the premium bridge — so OQ3 "available to all plans" is consistent with the gating rule; the button grants no entitlement. |
| II Vocabulary — no "check-in"/"watching"/care/welfare/alarm words; no raw field values as labels | ✅ Pass | FR-024 bans them explicitly; notification copy "Iona is here for you." is compliant (the earlier "watching" wording was caught and removed at Clarify). |
| III **Mockups precede code** | ✅ **Resolved (commit pending)** | The pairing mockup `iona_pair_button_flow_four_states.html` is now **in the repo** (root; night tokens, orb idiom, amber confirm-press); the **"Pair & Connect"** step-2 line **and a fifth button-test feedback state** (working / couldn't-confirm — US6) have been added. Only the git commit remains (owner). Gating task **PRE-1**. |
| III Simplicity / surgical / stay in scope | ✅ Pass | Reuses the `ZeroCallPlugin` plugin pattern, the `BridgeService` FGS pattern, and the existing help entry. Only added complexity is the owner-chosen gesture setting (OQ1-B) — modest, and scoped. Scope walls listed. |
| IV Credentials/IDs from config; field IDs not names | ✅ N/A | No credentials and no data-layer field IDs — the button is device-local; no Airtable read/write on the summon path. |
| IV Stop at the schema wall | ✅ N/A | No data-store schema change at all. |
| IV **Time-critical logic native/FCM-driven, never WebView `setTimeout`** | ✅ Pass | Press delivery, the stale-age check, and the listening service are **native**; the cancel window is the existing (already-compliant) one. The FGS keeps the *process* alive for BLE callbacks — exactly the pattern this rule prescribes. |
| IV Hands-free/reactive is native-SDK work | ✅ Pass | Consistent — this is native-SDK integration by design. |
| IV Validate before pushing; repo + working copy together | ✅ Pass | `node --check` + `gradlew assembleDebug`; on-device verification is the bar. |

**Gate: PASS, with one blocking dependency** — the pairing mockup (III) must be in-repo and updated before
pairing-flow UI code. No governance amendment is required (the constitution already anticipates this
feature in I.2). No code violations.

## Native architecture — the plugin skeleton & build chain (state before tasks)

### Plugin skeleton (follows the existing `ZeroCallPlugin` pattern)

- **`FlicPlugin extends Plugin`** (`com.iona.app.FlicPlugin`), registered in `MainActivity.onCreate` via
  `registerPlugin(FlicPlugin.class)` alongside the existing two. A `static FlicPlugin instance` (exactly as
  `ZeroCallPlugin` does) lets the SDK's button callbacks fire events back to JS via `notifyListeners`.
- **Commands exposed to the web layer** (`@PluginMethod`): `startScan()`, `stopScan()`, `getButtons()`
  (paired list + connection state), `removeButton(uuid)`, `getPairingState()`, `readBattery()` (button cell
  level, FR-032), `isIgnoringBatteryOptimizations()` + `requestBatteryExemption()` (OEM survival, FR-031). A
  `startScan` result drives the pairing flow's *searching → confirm-press* transition (the SDK's scan
  callback fires when the person presses the button being paired — this doubles as the "right button"
  confirm, matching mockup step 3).
- **Events emitted to the web layer** (`notifyListeners`): `buttonSummon` (the summon-gesture press, carrying
  the gesture type **and the press's age/timestamp** for the stale guard), **`buttonSelfTest`** (a
  **double-tap** — distinct event, never enters the help path; drives the service test, US6), `buttonFound`
  (scan hit), `pairingComplete`, `connectionChanged` (connected/disconnected — feeds the settings status
  row), and **`batteryLevel`** (low-battery heads-up, FR-032). The SDK's `Flic2ButtonListener` battery
  callback backs `readBattery`/`batteryLevel`.
- **The stale-press guard lives in the plugin** (native, authoritative), before anything reaches JS.
  *(Final after on-device bring-up 2026-07-02:)* a QUEUED press (buffered while out of range, delivered on
  reconnect) fires ONLY if fresh — pressed ≤15 s before this connection's ready — else it drops, **LOUDLY**
  (emit `summonDropped` → JS logs + a calm on-screen note; never silent). Age is a **same-clock delta**
  `getReadyTimestamp() − pressTimestamp`: flic2lib's event `timestamp` is a **button-relative clock**
  (comparing to a phone clock gave ~56 000 yr / ~4 day ages on device), so only the delta against the
  button's own ready time is reliable — real seconds (verified: 33 s / 243 s drops). A live press
  (`wasQueued=false`) is trusted. Fully compliant with IV (no timer). JS is a backstop.
- **The summon-gesture filter (routing depends on the chosen gesture — FR-026a):**
  - **hold summon (default):** `hold` → `buttonSummon`; `double-tap` → `buttonSelfTest` (never a summon, so a
    test can't enter the help path); single-click ignored.
  - **short-press summon:** **single, double, and hold ALL → `buttonSummon`**; `buttonSelfTest` is **not**
    emitted from the button. This closes a **classification-level** breach — for the tremor/dexterity user the
    short-press option exists to serve, the SDK can read an intended single press as a double-click; if that
    routed to the test, a crisis press would become a "your button's working" chime. Short-press users test
    via the in-app "Test service" control (never the button).
  The chosen gesture is read from the JS layer and passed to the plugin.

### One-time init & always-armed listening

- **`IonaApplication extends Application`** (new) — initialises the Flic manager **once** in `onCreate`
  (SDK requirement). The manifest `<application>` currently has **no `android:name`**, so add
  `android:name=".IonaApplication"`.
- **`FlicListeningService`** (new foreground service, modelled on `BridgeService`) with
  `android:foregroundServiceType="connectedDevice"` and the persistent notification **"Iona is here for you."**
  Keeps the process alive so BLE press callbacks fire while backgrounded (I.4 / IV).
- **Reconnect-on-launch (the known SDK gotcha):** on app/service start, call `getButtons()` and re-attach
  listeners/connect to already-paired buttons at the right moment, or presses silently don't fire. This is
  a **mandatory** step (safety checklist item), not optional.
- **`BootReceiver extends BroadcastReceiver`** (new) — on `BOOT_COMPLETED` + `LOCKED_BOOT_COMPLETED`, start
  `FlicListeningService` as an FGS so the button re-arms **after a cold reboot with no app launch** (FR-030).
  SDK internal storage persists the *pairing*, not a running listener — without this, SC-004's reboot leg
  silently fails. **Android-14 caveat:** BOOT_COMPLETED is an allowed reason to start a `connectedDevice`
  FGS, but the declared type + BLE runtime perms must already be granted (they are, post-pairing) — verify
  on the S22, not just the Pixel.
- **Battery-optimization exemption (FR-031):** after pairing, JS calls `isIgnoringBatteryOptimizations()`
  then `requestBatteryExemption()` (fires `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`) with one calm
  pre-line, so aggressive OEM power management doesn't kill the FGS. Where an OEM still wins, the **service
  test surfaces it** (logged no-response) rather than dying silently.
- **Low-battery surfacing (FR-032):** the SDK battery callback feeds `batteryLevel`; below a threshold the
  app shows a calm heads-up + status-row indicator and logs a "Button Battery Low" event — surfaced *before*
  the button dies, never framed as "failure".

### Build-chain implications

- **`android/build.gradle`** (project-level `allprojects { repositories { … } }`, which today holds only
  `google()` + `mavenCentral()` — there is **no** `dependencyResolutionManagement` in `settings.gradle`):
  add **`maven { url 'https://jitpack.io' }`**.
- **`android/app/build.gradle`** `dependencies { … }`: add
  **`implementation 'com.github.50ButtonsEach:flic2lib-android:<pinned-version>'`** (pin the exact JitPack
  release tag during bring-up).
- **`android/app/src/main/AndroidManifest.xml`**: add permissions
  **`ACCESS_FINE_LOCATION`** (OS rule for BLE scan), **`BLUETOOTH_SCAN`** (with
  `usesPermissionFlags="neverForLocation"` only if we can guarantee scan-without-location-derivation —
  otherwise plain), **`BLUETOOTH_CONNECT`** (Android 12+), and
  **`FOREGROUND_SERVICE_CONNECTED_DEVICE`** (Android 14+ FGS type); declare the new
  **`<service android:name=".FlicListeningService" android:foregroundServiceType="connectedDevice" android:exported="false"/>`**;
  and set **`<application android:name=".IonaApplication">`**.
- **Runtime permission flow**: the pairing flow requests FINE_LOCATION + BLUETOOTH_SCAN/CONNECT with a calm
  one-line explanation *before* the system prompt (mockup step 2), and the copy at step 2→3 tells the person
  to tap Android's own **"Pair & Connect"** system dialog (the one addition the mockup needs).

## Web-layer wiring (the summon path — reuse, don't rebuild)

- On `buttonSummon` (already freshness-filtered + gesture-filtered by the plugin), the app calls
  **`_startHelpSequence('physical_button')`** — a new *trigger label* for provenance only; the path is
  byte-for-byte the in-app one, so the **existing cancel window** applies automatically.
- **Duplicate absorption — corrected after on-device bring-up 2026-07-02.** The `escalation_state` idle-guard
  only covers the **committed** phase (state goes `'active'` after the countdown). A second summon **during
  the cancel-window countdown** re-entered `_startHelpSequence` (replayed siren, spawned a 2nd timer); the
  always-pressable button exposed the hole. Fix: a **countdown-scoped** flag **`_summonCountdownActive`** (set
  at countdown start, cleared on cancel/commit) — absorbs the duplicate, scoped so a terminal's "I NEED HELP"
  retry (`escalation_state='idle'`, app.js:1398) is never blocked and it can't get stuck. The **committed**
  phase stays guarded by `escalation_state`; a **hung escalation** (lost outcome FCM) self-heals via the
  20-min `ALARM_ESCALATION_TIMEOUT_MS` backstop (re-arm + log — previously dead code). Guard-enforced, not
  purely inherited (SC-003 verified on device); hardens the in-app path too.
- **Works-while-closed (FR-033) — added after on-device bring-up 2026-07-02.** The FGS keeps the process +
  BLE alive while the app is swiped closed, but the summon logic is in the **WebView, which is destroyed on
  close** — so a closed-app press fired `buttonSummon` into nothing. Fix: when a summon lands and the app is
  **not foreground** (`handleOnResume`/`handleOnStop` track it), `FlicPlugin` raises a **full-screen-intent**
  notification → `MainActivity` (extra `flic_summon`) → `_startHelpSequence`, waking the phone **over the
  lock screen**. The launch summon is a **one-shot flag** consumed exactly once by JS (`consumePendingSummon`
  on load OR resume) — a first cut using a *retained* Capacitor event **looped** (re-fired on every WebView
  reload). **Denied-FSI floor (FR-033a):** the summon notification uses a high-importance **sounding** channel
  so the press is loud even where a full-screen launch is revoked (A14+/Play); `canUseFullScreenIntent()` +
  grant-redirect commands are exposed for the Phase-3 pairing sequence. Needs `USE_FULL_SCREEN_INTENT` +
  `POST_NOTIFICATIONS`. Verified on device: closed + locked → one clean sequence over the lock.
- The listener is registered at app launch (and the plugin re-attaches to paired buttons then, per the
  gotcha).
- On `buttonSelfTest` (double-tap) the app runs the **service test** (below), **not** `_startHelpSequence` —
  a hard separation so a test can never dispatch. An immediate local ack (orb pulse + haptic) fires while the
  round-trip completes; the confirmation (or honest "couldn't confirm") lands when the server replies or the
  timeout elapses.

## The service test — end-to-end test path (cross-repo, US6)

The service test is the one genuinely cross-repo piece of this feature (the summon path is single-repo). It
proves the *whole road* a real summon travels, without waking anyone:

- **Trigger:** a **double-tap** (`buttonSelfTest`) — proving button + BLE + app + server end-to-end — or the
  in-app **"Test service"** control (proves app→server→log→confirm, minus the BLE hop).
- **Path:** the app POSTs to a **new, permanent `/service-test` endpoint** on the howsu webhook
  (`reply_to_airtable_webhook.py`). The endpoint **logs a test event and returns OK — it MUST NOT trigger
  reminders, escalation, or any contact** (the load-bearing suppression rule, FR-026). This *replaces* the
  throwaway `/flic-test` bring-up rig (T021 formalises it rather than merely deleting it).
- **Logging (both outcomes, FR-028):** on confirm, log **"Service Test — Passed"**; if the round-trip does
  not return within the timeout, the app records **"Service Test — No Response"** so a stopped button is a
  recorded fact, never silence. This uses the **existing EventLog recipe** — register the new Type/Status in
  `event_logger.py` `VALID_*` sets + master-ref §5; EventLog fields are free-text (singleLineText), **no
  Airtable schema change**. **Heed the known pitfall:** an unregistered `event_type` is *silently dropped*
  (the PWA-pause bug) — so the new type MUST be registered before it can log.
- **Suppression proof:** the summon-gesture and the double-tap are distinct at the plugin, and `/service-test`
  is a different endpoint from the summon path — so a test never dispatches and a real summon is never
  downgraded to a test (safety checklist item).
- **Confirmation channels (FR-027):** sound, orb animation, in-app ping, haptic — a multi-sensory "heard you,
  all the way through." The status row's "last confirmed working" line is stamped from the passing event.

## Project Structure

### Documentation (this feature)

```text
specs/005-physical-help-button/
├── spec.md              # /speckit.specify + /speckit.clarify (done)
├── plan.md              # This file
├── checklists/
│   ├── requirements.md  # spec-quality checklist (16/16 after clarify)
│   └── safety.md        # /speckit.checklist — reactive-path safety gate (this pass)
└── tasks.md             # /speckit.tasks — numbered task list (this pass)
```

### Source Code (real files, repo `/Users/Henry/iona-app`)

```text
# Native (new + edits) — android/app/src/main/java/com/iona/app/
+ FlicPlugin.java              (new — extends Plugin; static instance; commands + notifyListeners events; stale-age drop; battery read; battery-opt cmds; double-tap→buttonSelfTest)
+ IonaApplication.java         (new — extends Application; Flic2Manager.init once)
+ FlicListeningService.java    (new — foreground service, connectedDevice type, "Iona is here for you." notification; reconnect-on-launch)
+ BootReceiver.java            (new — BroadcastReceiver; BOOT_COMPLETED/LOCKED_BOOT_COMPLETED → start FlicListeningService; FR-030 reboot re-arm)
~ MainActivity.java            (:14 — add registerPlugin(FlicPlugin.class))

# Native build/manifest
~ android/build.gradle                         (allprojects repositories += jitpack)
~ android/app/build.gradle                     (dependencies += flic2lib-android)
~ android/app/src/main/AndroidManifest.xml     (+BLE/FGS perms +RECEIVE_BOOT_COMPLETED +REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, +<service>, +<receiver .BootReceiver>, set <application android:name>)

# Web — www/
~ www/app.js      (buttonSummon → _startHelpSequence('physical_button'); buttonSelfTest → service test; pairing-flow controller + battery-opt request; settings row + remove + battery + last-tested; "Test service" control; gesture-choice; reconnect on resume)
~ www/index.html  (Service-tab: connected-status row [battery + last-tested] + remove + "Test service", below #reactive-method-card; the 4-state pairing flow container)
~ www/style.css   (pairing-flow states + status row + service-test confirmation, bound to live Iona night tokens/orb idiom — NOT mockup hex)

# UI source (dependency)
? reactive_/ pairing mockup (4-state)  — LOCATE + commit to repo root, add step 2→3 system-dialog line (T-U1)

# Cross-repo (howsu backend) — service test is a permanent product surface, not just cleanup
~ reply_to_airtable_webhook.py  — REPLACE the throwaway /flic-test rig with a permanent POST /service-test endpoint (logs a test event, SUPPRESSES dispatch); retire the old Flic-app Internet Request rig
~ skills/event_logger/scripts/event_logger.py  — register new EventLog Type/Status: "Service Test" (Passed / No Response) + "Button Battery Low" in the VALID_* sets (free-text fields; no Airtable change)
```

**Structure Decision**: No new module or project. The native side extends the existing `com.iona.app`
plugin+service pattern; the web side edits the existing settings surface and reuses the existing help
entry. This honours "the simple thing already exists" and keeps the summon path single-sourced.

## Scope walls (the plan must NOT expand into these)

- **Multi-button support** and **button-serial → member mapping** (the hub / no-phone model).
- **The Flic Hub (WiFi) architecture** — this feature is phone-tethered BLE only.
- **Affiliate / purchase flow / the postcard** — no commerce here.
- **Any change to the help sequence itself** — the button only *starts* the existing one.
- **The service test MUST NOT touch the dispatch path** — `/service-test` logs and returns; it never fires a
  reminder, escalation, or contact (FR-026). A test that could summon help is a wall breach.
- **Plan/pricing decisions** beyond OQ3 (available to all).
- **Reviving the throwaway `/flic-test` rig as-is** — the feature adds a *purpose-built* `/service-test`
  endpoint instead; the old rig is removed.
- **The deferred self-test settings surface** (test cadence, reminders-to-test, finer per-outcome copy) —
  worked through in the later settings pass, not built here.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Pairing mockup absent** (blocks III mockups-precede-code) | **Resolved:** mockup in-repo (root), "Pair & Connect" line + fifth test-feedback state added (PRE-1); only the commit remains before pairing UI code. |
| **Reconnect-on-launch gotcha** — presses silently stop firing after relaunch | Mandatory `getButtons()`→connect on start; explicit on-device relaunch + reboot test (SC-004); safety-checklist item. |
| **Stale queued press fires a phantom alarm** | Native age-drop (~15 s) before JS; on-device out-of-range→return test (SC-002). |
| **FGS-type/permission rejection on Android 14+ (target 36)** | Correct `connectedDevice` FGS type + the 3 runtime perms; verify the service starts and the notification shows on the Pixel. |
| **Duplicate summon stacks** | Inherited `escalation_state` idle-guard in `_startHelpSequence`; verify absorption on device (do not rebuild). |
| **JitPack version drift** | Pin the exact release tag in `app/build.gradle` at bring-up. |
| **A service test accidentally dispatches** (wakes a contact) | Distinct gesture (`buttonSelfTest` ≠ `buttonSummon`) **and** a distinct endpoint (`/service-test` logs + returns, never escalates); suppression is a safety-checklist item verified on device. |
| **Short-press summon stolen by a double-click classification** (tremor → "test" in a crisis — the OQ1-B user) | For short-press summon, **all** gestures route to `buttonSummon`; the button-based test is disabled (in-app "Test service" only) — FR-026a; on-device gate CHK029a. |
| **Listener dead after cold reboot** (silent) | `BootReceiver` re-arms the FGS on boot with no app launch (FR-030); verified by SC-004's no-launch reboot leg + on the S22. |
| **Aggressive OEM kills the FGS** (silent) | Battery-opt exemption in pairing (FR-031) + the S22 survival gate; where it still wins, the service test's logged no-response **surfaces** it rather than hiding it. |
| **Button's own battery dies** (commonest silent death) | SDK battery callback → early calm heads-up + status-row indicator + logged "Button Battery Low" *before* it fails (FR-032). |
| **New EventLog type silently dropped** (the PWA-pause bug) | Register "Service Test"/"Button Battery Low" Type+Status in `event_logger.py` `VALID_*` + master-ref §5 **before** first log; verify a live row lands. |

## Post-bring-up Constitution re-check (to run after on-device)

Re-confirm on the Pixel: no banned copy shipped (II), the persistent notification reads "Iona is here for you."
(I.6), stale + duplicate presses behave (I.4), reconnect-on-launch holds (I.4), and the summon path is the
unchanged in-app one (I.2 / simplicity). **Then, for the reassurance layer:** a double-tap service test
confirms end-to-end and logs a pass; a no-response is logged honestly (I.4 fail-loud); the test never
dispatches (I.2 — no parallel path breach); reboot re-arm and low-battery heads-up both surface on device.
Then the plan is complete.
