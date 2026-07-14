# Mockup: US1 — Honest paused state (Today screen)

Night theme (`style.css`). Orb core is amber (Oran) in every state — constant. Rings + banner carry the state. Copy is constitution-safe ("Paused" / "Resume"; no banned terms).

## State: ACTIVE (service running)  — `service_status == "Active"`
```
┌───────────────────────────────┐
│ Iona                 Sat 27    │  topbar
│                               │
│            ((( ◉ )))          │  orb: amber core, TEAL rings, livelier pulse
│           (teal rings)        │
│                               │
│         (today thread)        │
│                               │
│  [ OKAY THANKS ]  [ I NEED ]  │  actions (help always live)
│                   [  HELP  ]  │
│   ◉ Today        ⚙ Settings   │
└───────────────────────────────┘
   No banner.
```

## State: PAUSED  — `service_status == "Paused"`
```
┌───────────────────────────────┐
│ Iona                 Sat 27    │  topbar
│  ┌─────────────────────────┐  │
│  │  Scheduled service paused │  │  ← persistent INFORMATIONAL banner (amber-tinted)
│  └─────────────────────────┘  │     indicator only · taps through to Settings · does NOT resume
│            ((( ◉ )))          │  orb: amber core, AMBER rings, slower pulse
│          (amber rings)        │
│         (today thread)        │
│  [ OKAY THANKS ]  [ I NEED ]  │  "I NEED HELP" STILL FULLY LIVE while paused
│                   [  HELP  ]  │
│   ◉ Today        ⚙ Settings   │
└───────────────────────────────┘
```

## State: INDETERMINATE  — status unreadable (offline/slow)
```
- No banner (don't assert paused).
- Orb left at default (teal) — not specially handled (owner decision A).
- Settings status pill shows "—", NEVER a false "Active".
- "I NEED HELP" fully live.
```

## Settings → Service tab status pill
- Active → green "Active" pill. Paused → neutral "Paused" pill. Indeterminate → "—".
- Read from backend on settings-open (and Today-load) — never the old static "Active".

## Behaviour notes
- Banner is a persistent, **informational** element (NOT a dismissable toast, NOT a resume button) — present the whole time service is paused. Copy: "Scheduled service paused".
- Tapping the banner **opens Settings** — it does NOT resume directly. Pause/resume as an action lives in Settings, built in US2 (with the true-state pill and the `/pwa-restart` async-write handled properly).
- Orb rings: teal (Active) vs amber (Paused) + a pulse-pace difference (slower when paused) so colour isn't the only cue.
- A Beacon/reactive-only member simply reflects its own `service_status` — no special handling (parked until Beacon provisioning exists).
