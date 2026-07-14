# Spec Kit — `/specify` input: Settings Surface Overhaul
**For Iona Android app (`/Users/Henry/iona-app/`) · app-only feature · night theme (`style.css`)**

Paste the body below into `/specify`. It is scoped to ONE feature: the in-app settings
surface and its paused-state indicator. It does NOT touch billing, entitlement gating,
the hands-free server gate, the marketing site, or the web dashboard — those are separate
work (see "Out of scope").

---

## Feature

Overhaul the in-app settings surface from a single flat list into a **tabbed bottom
sheet** (Service · Appearance · Account), add **appearance preferences** (theme,
text-size, font-set) that require tokenising currently-hardcoded values, add a
**confirm-on-sign-out** step, remove the now-redundant **"keep trying" control**, make
the **Service tab adapt to whether the member has proactive**, and add a **paused-state
indicator** (orb ring colour + a tappable banner on the Today screen) so a paused service
is never silently shown as active.

## Why

- The current panel only wires two real controls (`orb_button`, `device_dial_passes`);
  theme/font controls were only ever v2 comments, never built.
- Appearance prefs (especially text-size) are accessibility wins for an older audience,
  but every colour/size/font is hardcoded — they need tokenising before a setting can
  drive them.
- The status pill is cosmetic/stale: it shows "Active" on every launch even when the
  service is paused. For a safety product, a paused service falsely shown as active is a
  real hazard. The fix is to read true state and surface it where the member looks (the
  Today screen), via the orb and a banner.
- "Keep trying" tuned device-dial cycling back when device dial was a choosable mode.
  Device dial is now fallback-only, so a user-facing tuning of an automatic emergency
  fallback is wrong and should be removed (and the safe "keep" behaviour hardcoded).

## MANDATORY first step — read before writing any code

CC must read and report these BEFORE proposing changes (do not assume):
1. The current settings panel markup + handler — confirm the items, order, and how the
   two working controls (`orb_button`, `device_dial_passes`) read/write Preferences. The
   new controls MUST copy this exact proven Preferences pattern.
2. `style.css` — locate every hardcoded colour hex, every `font-size: Npx`, and every
   `font-family` declaration that the appearance prefs will need to tokenise. Report the
   count and the spread (which rules/elements) so the tokenisation scope is known.
3. The `body.light` (day) scope already in `style.css` — what it currently flips vs what
   stays hardcoded, so the theme toggle's tokenisation tail is known.
4. The Today screen markup — where the paused banner inserts, and how the orb is rendered
   (so ring colour/pulse can be driven by state).
5. How the app knows whether a member has proactive scheduled (it already renders the
   schedule) — this drives Service-tab show/hide WITHOUT new Memberstack plan-reading.

## User stories / acceptance criteria

**US1 — Tabbed settings sheet.** The settings entry opens a bottom sheet (slide-down to
dismiss, as today) with three tabs: Service · Appearance · Account. Tabs switch content;
dismiss behaviour unchanged.
- AC: all existing functional items still work (pause/restart, orb button, dashboard
  deep-links, sign out).
- AC: night theme styling matches current `style.css` (sheet `#0C1C30`, Hanken Grotesk,
  existing row/toggle styling).

**US2 — Service tab adapts to proactive.** Pause control + status pill + the proactive
on/off control show ONLY for members who have proactive scheduled. A reactive-only member
(no proactive) sees neither — they see only the reactive controls (help-method, orb).
- AC: proactive member → pause/status/proactive-toggle present.
- AC: reactive-only member → pause/status/proactive-toggle hidden; no empty section.
- AC: show/hide derives from existing proactive-schedule knowledge, NOT new plan-reading.

**US3 — True paused state.** Status is read from the backend on sheet-open (and the orb
reflects true state on Today-screen load) — never a hardcoded "Active".
- AC: launching with service paused shows paused state in settings AND on Today screen.
- AC: no path shows "Active" while actually paused.

**US4 — Paused indicator on Today screen.** When a proactive member's service is paused,
a persistent, tappable banner appears at the top of the Today screen; tapping resumes.
The orb's pulse rings show **amber (reactive-only)** when paused and **teal (Iona)** when
active; amber core is constant.
- AC: paused → banner visible + amber rings; tapping banner resumes service.
- AC: active → no banner + teal rings.
- AC: banner is persistent (not a dismissable toast) while paused.
- AC: **"I need help" remains fully functional while paused** — pausing stops only the
  proactive reaching-out, never summon-help. Copy must not imply help is off.
- AC: wording uses "Paused" / "Resume" — the word "check-ins" must NOT appear (banned
  term, alongside care/welfare/watching).

**US5 — Remove "keep trying".** Remove the "keep trying your contacts" control from
settings. Hardcode `device_dial_passes` default to **"keep"** in code so device-dial
fallback always does the full safe cycle (never the worse "once").
- AC: control gone from UI; device-dial cycling behaviour = keep, by default, with no
  preference required to set it.

**US6 — Confirm on sign out.** Sign out shows a confirm step before `ms.logout()`.
- AC: tapping Sign out → confirm dialog → only logs out on confirm; cancel returns to
  settings with no change.

**US7 — Appearance: theme toggle (Night/Day).** A Night/Day control switches between the
existing scopes. Requires finishing the colour tokenisation so day mode is NOT half-dark.
- AC: tokenise the remaining hardcoded hex colours into variables so BOTH scopes render
  fully (no stuck dark elements in day mode).
- AC: choice persists via the existing Preferences pattern; applied on launch.

**US8 — Appearance: text-size stepper.** A few fixed steps (e.g. A− / default / A+ /
larger). **Scope: reading/menu text scales; safety-tuned action targets do NOT.**
- **Scales:** (a) Iona/Oran message text (the conversation cards), and (b) all
  settings/menu text — settings row labels, sub-labels, and the Account-tab navigation
  links (My schedule / service / contacts / account / Activity log / Sign out).
- **Stays FIXED:** the big action buttons ("I need help", "I'm okay", orb button, Pause),
  the status pill, section headings, and structural chrome — these are deliberately sized
  for accidental-press safety / layout and must not move.
- Requires tokenising the font-sizes of the *scaled* elements so they derive from a base
  scale token (NOT all ~40 sizes — only the message + settings/menu text rules).
- AC: stepping changes message text AND settings/menu text together; action buttons,
  pill, headings, chrome unchanged at every step.
- AC: at the largest step, no scaled text breaks its container or pushes a safety control
  off-screen / out of reach.
- AC: choice persists via the existing Preferences pattern; applies on launch.
- AC: a small number of fixed steps, not a free slider.

**US9 — Appearance: font-set switch.** Switch the UI/body font between the current app
set and the iona.css design-system set. Requires tokenising `font-family`.
- AC: tokenise `font-family` (e.g. `--font-ui`) and drive from a Preference.
- AC: **brand/character fonts are EXCLUDED and constant** — Dancing Script (Iona) and
  Eagle Lake (Oran) never change, to preserve identity.
- AC: choice persists and applies on launch.

## Invariants (must hold across the whole feature)

- **The safety floor is never toggleable off.** Summon-help ("I need help") and the
  escalation engine must remain fully available on every plan and in every state,
  including while proactive service is paused. No control in this feature may disable them.
- **No new Memberstack plan-reading / no entitlement gating / no billing.** Hands-free
  stays server-gated exactly as today. Service-tab adaptation keys off proactive-schedule
  knowledge the app already has.
- **Copy:** never use "check-in/check-ins", "care", "welfare", "watching". Iona is
  pronoun-free (name only). "okay" is banned in outbound SMS confirmations (not relevant
  here, but do not introduce it).
- **Preferences pattern:** all new toggles/choices use the SAME read/write Preferences
  pattern as the existing `orb_button` / `device_dial_passes` controls.

## Out of scope (separate work — do NOT build here)

- Pricing (undecided).
- The signup picker and the plans grid (marketing surfaces).
- The dashboard Account-tab "add hands-free" card and billing flow (web dashboard,
  different codebase). The app's "add hands-free" is only a deep-link out — if included,
  it's navigation only, not a billing build.
- The Memberstack hands-free add-on setup, the backend gate extension
  (`planName == GA OR handsfree_addon`), and the Make.com sync change.
- **Alert sounds** (synthesised, no asset layer — a later build).
- Arbitrary font/colour picking (only the predefined sets and fixed size steps).

## Notes for the spec

- App uses its own `style.css` and does NOT load `iona.css` — build against `style.css`.
- The app currently renders night-only; `body.light` exists but is never applied.
- Tokenisation (colours, sizes, fonts) is real refactor work touching many rules — it IS
  in scope for this feature, but flag it clearly so the plan accounts for its size. The
  sound/font play-functions being centralised does NOT apply here (sounds are out).
- Mockups for the tabbed sheet, the adapted Service tab, and the paused Today-screen
  banner exist (this session) — use them as the visual reference.
