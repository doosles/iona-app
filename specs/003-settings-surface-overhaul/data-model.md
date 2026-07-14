# Data Model: Settings Surface Overhaul

This feature stores only local UI preferences and consumes read-only backend state. It introduces no new persisted user data, no health/case data (constitution §I.1).

## Local preferences (Capacitor Preferences — device-local)

Read/written via the existing `getPreference`/`setPreference` pattern (as `orb_button`). Applied on launch **before first paint**.

| Key | Values | Default | Drives | Notes |
|---|---|---|---|---|
| `theme` | `night` \| `day` | `night` | `body.light` class (day) vs `:root` (night) | New. Existing app is night-only. |
| `text_size` | `base` \| `lg` \| `xl` | `base` | base text-size token on the scaled set only | New. Three fixed steps (default / large / extra-large), no slider, no "small". |
| `font_set` | `app` \| `system` | `app` | `--font-ui` value | New. Brand fonts excluded. |
| `orb_button` | `true` \| `false` | `false` | orb button visibility | **Existing — unchanged.** |
| `device_dial_passes` | `keep` (only) | `keep` (hardcoded in code) | device-dial fallback cycle | **Changed:** UI control removed; safe value fixed in code so the cycle is always full. `once` no longer reachable. |

## Consumed backend state (read-only; never written by the app)

| Field | Source | Consumed by | Notes |
|---|---|---|---|
| service status (Active / Paused) | howsu `/pwa-status` (Airtable Table 1, existing) | status indicator, Today paused banner, orb rings, pause/resume | Read on settings-open AND Today-load. Indeterminate if unreadable — never assumed "Active". See `contracts/service-status.md`. **The only backend signal this feature consumes.** |

## Derived UI state (not stored)

| State | Derivation |
|---|---|
| Service tab layout | status indicator + pause/resume, driven by `service_status`. |
| Account tab layout | dashboard deep-links + sign-out. |
| Today orb rings | `service_status == Active` (running) → teal rings, livelier pulse; `Paused` → amber rings, slower pulse; amber core always. No `has_proactive` input. |
| Paused banner | shown ⇔ `service_status == Paused`. |
| Sign-out flow | idle → confirm → logout/cancel. |

## Invariants
- Summon-help + escalation engine availability is **not** represented by any toggle here — it is always-on and never disabled by this feature (FR-007).
- No field in this model stores a pause *reason* or any health/clinical/case data (§I.1).
- Appearance prefs are cosmetic and device-local; they never affect safety behaviour.
