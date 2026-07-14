# Implementation Plan: Iona App — The Receiving App (Product A)

**Branch**: `001-receiving-app` | **Date**: 2026-06-18 | **Spec**: [spec.md](06%20Specs/001-receiving-app/spec.md)

**Input**: Feature specification from `specs/001-receiving-app/spec.md`

---

## Summary

Product A is the app a service user holds. Its job is two things: receive Iona's scheduled
contact (push notifications + in-app response), and raise the alarm (trigger the emergency-
contact escalation cycle with immediate on-device feedback). It is a Capacitor hybrid app —
a web layer (HTML/CSS/JS) inside a native Android shell. The existing backend runs unchanged;
the app is a new front-end door onto it. Auth is Memberstack passwordless (email + 6-digit
code), confirmed to persist across restarts in a Capacitor/Android environment. Device push
token registration happens post-login via a native plugin, fixing the install-time token
fragility of the previous PWA.

---

## Technical Context

**Language/Version**: JavaScript (ES2020+) for the web layer. Native Android bridge handled
by Capacitor — no Kotlin/Java written directly.

**Primary Dependencies**:
- Capacitor v8 (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`)
- `@capacitor/push-notifications` — native FCM integration (replaces fragile web push API)
- `@capacitor/preferences` — persistent local storage for session state across restarts
- Memberstack DOM package (`$memberstackDom`) — passwordless auth via JS methods called
  from within the Capacitor WebView

**Storage**:
- `@capacitor/preferences` — local: session presence flag, member ID
- FCM device token — stored on existing backend (Airtable field, already operational);
  app sends token to backend post-login, no new storage layer needed

**Testing**: Manual on-device testing on physical Android hardware. No automated test suite
in v1 — the alarm path (constitution §I.4) gets extra manual rigour at each build step.

**Target Platform**: Android (Capacitor minimum API 22+). Android-first; iOS explicitly
out of scope for v1.

**Project Type**: Mobile app — Capacitor hybrid (web layer in native Android shell).

**Performance Goals** (from spec Success Criteria):
- Sign-in complete in < 2 minutes from fresh install (SC-001)
- Returning user reaches home screen in < 3 seconds from launch (SC-002)
- Push notifications received within 10 seconds of dispatch (SC-003)
- Alarm produces visible feedback within 1 second of activation (SC-004)
- Audio signal audible at default device volume, no user adjustment (SC-005)

**Constraints**:
- Android-first; no iOS in v1
- No new backend — all data flows use existing endpoints
- No health, clinical, or case data introduced at any layer
- Vocabulary: full compliance with constitution §II at every copy-writing step
- Alarm path must fail loudly and visibly — never silently (constitution §I.4)
- Session persistence is confirmed; JWT/cookie managed by Memberstack in WebView storage

**Scale/Scope**: Single user per device. ~5 primary screens. Small initial user base
(testers / early adopters). Existing backend handles all server-side load.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| §I.1 Contact/escalation layer only | No health, clinical, or case data introduced. App scope: auth, notifications, alarm trigger, setup only. | ✅ Pass |
| §I.2 Proactive and reactive both first-class | US2 (receive contact) and US3 (raise alarm) are both P1. Neither is subordinate. | ✅ Pass |
| §I.3 Promise attempt, never outcome | FR-008 + SC-007 mandate explicit terminal state. FR-013 enforces vocabulary. All build-time copy must say "attempts to reach", never "will reach". | ✅ Pass — carry to build |
| §I.4 Reactive path higher reliability bar | FR-006 (1s feedback), FR-007 (persistent non-dismissible state), FR-008 (explicit terminal), SC-006 (100% coverage). Alarm path is extra-rigour at build and test. | ✅ Pass — enforce at build |
| §I.5 Not elderly/institutional/medical | Spec is neutral. No framing language present. | ✅ Pass |
| §I.6 Iona by name only | FR-014 enforces throughout. No pronouns or "the AI" anywhere. | ✅ Pass — carry to build |
| §II Vocabulary | FR-013 lists all banned terms. Verified at every copy-writing step during build. | ✅ Pass — carry to build |
| §I Open arch question | Packaging model unresolved. Plan is neutral. No copy commits to a framing. | ✅ Pass |

**Result: All gates pass. Proceed to Phase 0.**

---

## Project Structure

### Documentation (this feature)

```text
specs/001-receiving-app/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── alarm-trigger.md
│   ├── push-registration.md
│   └── scheduled-contact-response.md
└── tasks.md             # Phase 2 output (/speckit.tasks — not created here)
```

### Source Code (repository root)

```text
www/
├── index.html            # App shell — all screens declared; CSS + Memberstack script loaded
├── app.js                # All app logic: auth flow, screen routing, alarm, push, setup
└── style.css             # App styles — dark theme, Iona design tokens

android/                  # Capacitor-generated native shell — sync target, do not edit directly
├── app/src/main/
│   ├── assets/public/    # Synced from www/ by `npx cap sync android`
│   └── AndroidManifest.xml

capacitor.config.json     # App ID, web-dir, plugin config
package.json              # npm deps: @capacitor/core, android, push-notifications, preferences
```

**Structure Decision**: Capacitor mobile app with a flat web layer (`www/`). No separate
`src/` tree — the web layer is small enough to stay in three files for v1. The `android/`
shell is Capacitor-managed. All spec/planning artifacts live under `specs/`. This is the
structure already established by the auth spike (`~/iona-app-spike`) and carried forward
into this repo.

---

## Complexity Tracking

> No constitution violations found. Section not required.
