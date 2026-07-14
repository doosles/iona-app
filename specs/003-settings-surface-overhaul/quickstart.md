# Quickstart: validating Settings Surface Overhaul

On-device (Pixel 4a / Android 13). Run the **P1 safety scenarios first**. Deploy: `npx cap sync android` + `./gradlew installDebug`, then launch. Validate each user story's Independent Test.

## P1 — Honest paused state (US1) — do first
1. Set the test member to **paused** on the backend (Airtable / pause action).
2. **Cold-launch** the app → Today shows the **persistent paused banner** ("Paused — tap to resume") and the orb **rings are amber** (slower pulse). Open settings → Service tab shows **paused** (not "Active").
3. Tap the banner → presence **resumes**, banner clears, rings turn **teal** (livelier pulse).
4. While paused, tap **"I need help"** → summon-help/escalation runs **fully**. Confirm no copy implies help was off.
5. Force offline, relaunch paused → UI shows indeterminate, **never "Active"**; "I need help" still live.

## P1 — Tabbed sheet (US2)
6. Open settings → **Service · Appearance · Account** tabs; switch between them (sheet stays open); swipe-down dismisses.
7. Exercise every preserved control from its tab: pause/resume, orb button, the five dashboard deep-links, sign out. Each behaves as before.

## P1 — Keep-trying removed + safe cycle (US4)
8. Settings → **no "keep trying" control** anywhere.
9. Trigger the device-dial fallback path with no pref set → it runs the **full cycle** (never single-pass).

## P2 — Service tab adapts (US3) — WITHDRAWN
10–11. *Removed (owner decision). `has_proactive` + proactive on/off toggle dropped. Service tab shows pause/resume + status for everyone via `service_status`; nothing to test here. (Step numbers retained so 12+ stay stable.)*

## P2 — Sign-out confirm (US5)
12. Account → Sign out → **confirm** appears. Cancel → still signed in, nothing changed. Confirm → signed out.

## P2 — Text size (US6)
13. Appearance → step text size. **Message text + settings/menu text resize together.** Action buttons, status pill, headings, chrome **unchanged**.
14. At the **largest step on the smallest screen**: no clipped text, no safety control pushed off-screen/out of reach.
15. Relaunch → chosen step persists, applied before first paint.

## P3 — Theme (US7)
16. Appearance → **Day** → entire surface renders light, **no element stuck dark** (walk every screen). **Night** → matches today.
17. Relaunch → theme persists, no flash of the other theme.

## P3 — Font set (US8)
18. Appearance → switch font set → UI/body font changes; **Iona (Dancing Script) + Oran (Eagle Lake) unchanged**.
19. Relaunch → font choice persists.

## Cross-cutting checks
- **Copy:** no banned term anywhere in new strings (emergency/alert/failed/crisis/care/welfare/support/check-in/etc.); "Paused"/"Resume" used; Iona pronoun-free.
- **Build hygiene:** `node --check www/app.js` clean before any push; tokenisation done as scoped edits (no global sed); both theme scopes verified.
- **Reports reality:** after deploy, state whether it's live on the device (rebuild needed) — "pushed" ≠ "live".
