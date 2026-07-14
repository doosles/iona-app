# Handoff — Claude web — Feature 005 reboot survival: 2 decisions

**Date:** 2026-07-04 · **Device:** Pixel 4a, Android 13 (FBE) · **Context:** on-device
verification sitting (Block 2 durability). Stack up (webhook + ngrok; runner down).

## What is VERIFIED today (no decision needed)
- **Service test** (Block 1): PASS row + 0 dispatch (log-confirmed); offline "couldn't
  confirm" card shown. SC-008/009 ✓.
- **Reboot survival core** (Block 2b): after a reboot, with the app closed —
  `BootReceiver → FlicListeningService re-arm (FGS foreground) → static-router headless
  reconnect → a fresh press → summon full-screen intent → cancel window`, **no app opened
  first**, no crash. Log-confirmed (`START …MainActivity (has extras)`). The static-router
  refactor is cleared (no regression).

## Bug caught + already fixed on-device (recorded, not a decision)
First 2b attempt **crashed the app on boot**. Root cause: I had made `BootReceiver`
`directBootAware=true` + `LOCKED_BOOT_COMPLETED` to arm before unlock. That starts the app
process in **direct boot** (pre-unlock), where `IonaApplication.onCreate` →
`Flic2Manager.initAndGetInstance` opens the SDK's SQLite DB in **credential-encrypted (CE)
storage that isn't mounted yet** → `SQLiteCantOpenDatabaseException` → process dies.
**Fix (applied + reinstalled):** `BootReceiver` now handles **`BOOT_COMPLETED` only**, not
directBootAware. Post-unlock, CE storage is available and the re-arm is safe. This is the
standard pattern.

---

## DECISION 1 — the boot-window press gap (fixable in code)
**Observed:** presses made *during* the ~90 s boot window (before the FGS re-arms at
`BOOT_COMPLETED`) are buffered by the button, flushed on reconnect, then **dropped by the
T007 stale-guard** (`STALE_PRESS_MAX_MS = 15 s`): log showed `stale queued press dropped
ageMs=84674 / 73343 / 62724`. So a help press during the reboot window currently vanishes.

**Extra wrinkle (the "never silent" tension):** the stale-drop fires a `summonDropped` event
to JS — but on a headless boot there is **no WebView**, so `deliverToJs` is a no-op. The
dropped boot-window press is therefore **silent** right now.

**Options:**
- (a) Leave 15 s. Boot-window presses lost; person must press again after arming. Simplest,
  but a help press can silently vanish.
- (b) Lengthen `STALE_PRESS_MAX_MS` (e.g. 2–5 min). A recent-ish queued press then summons;
  risk = a genuinely old accidental press summons late.
- (c) Special-case the first post-arm reconnect: accept a longer window only for the initial
  flush after service start (covers reboot without loosening the general guard).
- (d) Never-silent: whatever the window, surface a dropped boot-window press (a native
  notification, since there's no WebView) — "a press during restart couldn't be acted on,
  press again."

**CC lean:** (c)+(d) — don't loosen the general guard, but treat the post-reboot flush as a
special case AND never drop a help press silently (native surface, given no WebView).

## DECISION 2 — pre-unlock / over-the-lock operation (platform constraint)
**Owner instinct:** "should work without unlocking; an earlier version did." **Clarification:**
the earlier over-lock success was **app-closed-but-FGS-still-running** (a swipe-away, not a
reboot) — no re-arm needed. A **reboot** is the one case where the FGS must be rebuilt, and
the **Flic2 SDK cannot initialise before first unlock** (CE-storage DB — the exact crash
above). So after a reboot the button genuinely cannot arm until the phone is unlocked once.

**Options:**
- (a) Accept post-unlock-only arming; **document** it (after a reboot the button re-arms on
  first unlock). Most reboots are followed by the person unlocking. Residual gap: phone
  reboots and stays locked (asleep/away) → button dead until unlock.
- (b) Chase Flic2 SDK direct-boot support (move its DB to device-encrypted storage). Likely
  unsupported by the SDK; high effort, uncertain.
- (c) Mitigate + surface: a boot notification / carer-visible signal that the button needs
  one unlock to re-arm after a restart. Doesn't remove the gap, makes it visible.

**CC lean:** (a)+(c) — accept the platform constraint, document + surface it in the risk
register, rather than chase SDK direct-boot support. Flag as a genuine residual safety gap.

**The gesture-persistence device-protected storage (FR-005a) still stands** — it's readable
post-unlock too, so no change needed there; the pre-unlock rationale in its comment is now
moot but harmless.

---

## Remaining sitting (paused pending these decisions)
- Block 2c (battery swap), Block 3 (low-batt sim), Block 4 (gesture default + persistence).
- Then close-out: T020 copy sweep → T021 remove scaffolding + dev panel → T022 constitution.

---

## RESOLUTION 2026-07-04 (captain ruling implemented)
- **Item 1 — stale threshold 15s → 120s.** `FlicPlugin.STALE_PRESS_MAX_MS = 120000` (+ rationale in
  the constant). A press made during the ~60–90s boot window now delivers on reconnect and summons;
  >120s still drops loudly. `compileDebugJavaWithJavac` clean. **Built + deployed.**
- **Item 2 — unlock nudge + direct-boot-safe foundation.** `IonaApplication.onCreate` now defers the
  Flic2 manager init until unlock (via `FlicPlugin.ensureManagerInitialized`, **double-guarded**:
  `isUserUnlocked` AND try/catch — the 2b boot crash cannot recur). BootReceiver re-enabled
  directBootAware + `LOCKED_BOOT_COMPLETED`: **unlocked → arm + clear nudge; locked → post one calm
  nudge** "Unlock your phone once so Iona can hear your button." (channel `flic_boot_nudge`, cleared
  when the FGS arms). `BOOT_COMPLETED` remains the reliable post-unlock arm. **Built + deployed.**
- **Item 3 — DP-storage spike: BLOCKED on a live device; implemented but gated OFF
  (`SPIKE_DP_STORAGE = false`).** Recorded finding: a fence-safe LIVE implementation is not achievable
  within a bounded spike — (a) `Flic2Manager` is a process singleton, so a pre-unlock init on empty DP
  storage (if the SDK ignores the DP context) leaves the button **un-armed after unlock** for the whole
  session (fence violation); (b) the CE→DP migration is **destructive** (`moveDatabaseFrom`, no
  copy/verify-before-commit) → a failure loses the live pairing until a re-pair, unacceptable on the
  user's daily phone. No non-destructive probe exists (singleton + no copy API), so it can't be
  tried-and-rolled-back live. The DP code path is in `ensureManagerInitialized` behind the OFF flag —
  **one-flag-flip testable on a SPARE pairing / spare device**, never on the live one. Per the brief's
  own bounds ("if it misbehaves, STOP, revert, record"), the **nudge (item 2) stands as the honest
  scope**: after a restart, unlock once to re-arm.
- **Files:** `FlicPlugin.java` (threshold, `ensureManagerInitialized` + gated spike), `IonaApplication.java`
  (deferred init + nudge channel), `BootReceiver.java` (both actions + nudge post/cancel),
  `FlicListeningService.java` (cancel nudge on arm), `AndroidManifest.xml` (directBootAware + LOCKED).
