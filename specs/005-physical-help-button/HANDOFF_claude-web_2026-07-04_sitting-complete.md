# Handoff — Claude web — Feature 005 verification sitting COMPLETE

**Date:** 2026-07-04 · **Device:** Pixel 4a, Android 13 (secure lock) · Stack: webhook + ngrok up,
runner down. All on-device, owner-driven; CC tailing logcat + webhook.log.

## Outcome — all four Master-Sheet blocks PASS

| Block | Result | Closes |
|---|---|---|
| **1 Service test** | PASS — `Service Test — Passed` row + **0 dispatch** (log-confirmed); offline → honest "couldn't confirm" card | SC-008/009 · **T026** |
| **2 Durability** | PASS — kill+relaunch; **reboot** (nudge + press delivered + arm + full bridge, no crash); battery swap (0 re-pairing). Static-router refactor **cleared, no regression** | SC-004/CHK012 · **T016** |
| **3 Low battery** | PASS — calm note + amber status line + `Button Battery Low` row (via Sim low batt) | SC-010/CHK030-031 · **T032** |
| **4 Gesture default + persistence** | PASS — single-press default summons post-reboot; **opt-in hold PERSISTS across reboot** (exactly 1 summon FSI from the hold, single tap ignored); chooser reflects live state | FR-005a · **T019** |

## Three real bugs the sitting caught + fixed on-device
1. **Direct-boot crash.** directBootAware + `LOCKED_BOOT_COMPLETED` started the app process pre-unlock →
   `IonaApplication.onCreate` → Flic2Manager's credential-encrypted SQLite DB → `SQLiteCantOpenDatabase`
   → crash, FGS never armed. **Fix:** defer the manager init until unlock (see #2), keep BOOT_COMPLETED
   as the reliable arm.
2. **`getInstance()` throws before init.** My `ensureManagerInitialized` guarded on
   `Flic2Manager.getInstance() != null` — but the SDK's `getInstance()` **throws
   `IllegalStateException("Not initialized")`** before init (does NOT return null), crashing
   `onCreate` on *every* launch/boot. **Fix:** gate on our own boolean flag; wrapped all 8 call sites
   in `safeManager()` (returns null on throw) so every `(m == null)` guard degrades gracefully.
3. **Boot-window stale gap** (captain item 1). 15s → 120s. Verified: **0 stale-drops**, the press made
   on the lock screen delivered on arm and summoned (at 15s it would have vanished).

## Captain items 1/2/3 — status
- **Item 1 (120s stale threshold):** built + **verified on-device**.
- **Item 2 (unlock nudge):** built + **verified** — "Unlock your phone once so Iona can hear your
  button." seen on the lock screen after reboot; cleared automatically when the FGS armed on unlock.
  Foundation: `IonaApplication` now defers Flic init until unlock (double-guarded: `isUserUnlocked`
  AND try/catch); BootReceiver directBootAware, unlocked→arm+clear, locked→nudge only.
- **Item 3 (DP-storage pre-unlock spike):** **BLOCKED on a live device**, implemented but gated OFF
  (`SPIKE_DP_STORAGE = false`). A fence-safe live version isn't achievable: Flic2Manager is a process
  singleton (a pre-unlock init on empty DP storage would leave the button un-armed after unlock) and
  the CE→DP migration is destructive with no verify-before-commit (risks the live pairing). Code is in
  place, one-flag-flip testable on a **spare pairing / spare device only**. The nudge is the honest
  scope: after a restart, unlock once to re-arm.

## Bonus coverage
The full reactive **Speakerphone bridge** ran end-to-end *after a reboot*: summon → escalation → bridge
call connected to contact ("Ian") → `StatusCallback status='completed'` → terminal card. So the reboot
path exercised the whole reactive chain, not just the button.

## Residual / for captain judgement
- **Pre-unlock arming gap** (risk register): after a reboot the button arms on first unlock (Flic SDK
  CE-storage constraint). Made visible by the nudge. Decision: accept + document, or authorise the
  spare-device DP spike to try for over-the-lock arming?
- **Deferred hardware legs unchanged:** S22 / Android-14 boot-FGS + aggressive-OEM survival (T024).

## Close-out readiness (awaiting go)
1. all four blocks passed ✅
2. → **T020** copy sweep (all new strings; "Iona is here for you." exact; banned-list)
3. → **T021** remove scaffolding + dev panel (only after the sitting — now unblocked)
4. → **T022** Constitution re-check (on-device)
5. → mark [[Feature 005 - Status]] done

## Files touched this sitting
Native: `FlicPlugin.java` (120s, deferred/guarded init, safeManager, gated spike), `IonaApplication.java`
(deferred init + nudge channel), `BootReceiver.java` (both actions + nudge), `FlicListeningService.java`
(cancel nudge on arm), `AndroidManifest.xml`. App: `www/app.js`, `www/index.html`, `www/style.css`
(T019 gesture chooser + Sim low batt dev row). Backend (earlier today): `reply_to_airtable_webhook.py`
(`/service-test` + `/button-battery-low`), `event_logger.py`. Spec: FR-001/003/005 corrected + FR-005a
added; `tasks.md` updated. Two test EventLog rows pending cleanup (owner call); real bridge records kept.
