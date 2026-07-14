# UI Mockup: Reactive Voice Bridge States

**T009 — Gate artifact. No UI code until this is confirmed.**

**Date**: 2026-06-23 | **Screen**: today-screen (`#screen-today`) only

All bridge states live inside the existing `today-messages` area — no new screens, no new routes. The bridge card (`#bridge-card`) is a single element added to `index.html` alongside the existing alarm cards. JS updates its class and content to reflect the current state.

---

## Today-screen layout reference

```
┌─────────────────────────────────────────┐
│  Iona             Tuesday 23 June        │  ← topbar
├─────────────────────────────────────────┤
│                                         │
│           [ ORB BACKDROP ]              │  ← absolute, behind
│                                         │
│  ┌─────────────────────────────────┐    │
│  │         BRIDGE CARD             │    │  ← today-messages
│  └─────────────────────────────────┘    │
│                                         │
├─────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐    │  ← action buttons
│  │  OKAY THANKS │  │  I NEED HELP │    │
│  └──────────────┘  └──────────────┘    │
├─────────────────────────────────────────┤
│     ☀ Today          ⚙ Settings        │  ← nav
└─────────────────────────────────────────┘
```

The bridge card replaces the normal message thread in the today-messages area when a bridge attempt is active. When idle, it has `display: none`. When active, it takes flex: 1 (fills the available space).

---

## State 1 — `summoning` / `dialing`

Shown immediately on tap. Shows which contact is being tried.

```
┌───────────────────────────────────────────┐
│                                           │
│   CONNECTING           ◉ amber dot       │  ← label row
│                                           │
│   Reaching your contacts…                 │  ← main line (amber)
│                                           │
│   ● ○ ○ ○ ○ ○                           │  ← contact progress dots
│   Trying Sarah                            │  ← current contact name (muted)
│                                           │
└───────────────────────────────────────────┘
```

- **Card border**: amber `#E0973A` (1.5px)
- **Background**: `#0C1C30`
- **Label**: `CONNECTING` — 11px, uppercase, amber, letter-spaced
- **Live dot**: 8px amber circle, pulsing (`btnPulseAmber` keyframe)
- **Main text**: `Reaching your contacts…` — 16px, amber
- **Progress dots**: 6 dots; current index = amber filled, remainder = `#1B344F` (muted ring)
- **Contact name**: `Trying [name]` — 13px, `--text-muted`
- **Action area**: `btn-alert` dims to 30% opacity, disabled (FR-002 guard: `already_connecting` shows on tap, not duplicate attempt)

---

## State 2 — `in_call`

Contact has confirmed by keypress. Live two-way audio.

```
┌───────────────────────────────────────────┐
│                                           │
│   CONNECTED            ◉ green dot       │  ← label row
│                                           │
│   You're connected                        │  ← main line (teal)
│                                           │
│   Set the phone down — hands-free         │  ← sub line (muted, 13px)
│                                           │
│   ┌─────────────────────────────────┐     │
│   │  Sarah  ·  in call              │     │  ← contact name badge (muted bg)
│   └─────────────────────────────────┘     │
│                                           │
└───────────────────────────────────────────┘
```

- **Card border**: teal `#25C9BA` (1.5px)
- **Background**: `#0C1C30`
- **Label**: `CONNECTED` — green `#2BB682`
- **Main text**: `You're connected` — 16px, teal `#25C9BA`
- **Sub text**: `Set the phone down — hands-free` — 13px, `--text-muted`
- **Contact badge**: small pill — `[name] · in call` — `#0C1C30` bg, `--border` border, 12px muted text
- **Action area**: `btn-alert` hidden; `btn-okay` hidden; no controls visible (FR-007: person cannot end the call)
- **Note**: Tapping anywhere on the card does nothing. The person cannot end the call.

---

## State 3 — `already_connecting`

Fires when `summonHelp()` is called while state ≠ idle. Shown briefly (≈3s), then reverts to the current active state. Does not restart or interrupt the attempt.

```
┌───────────────────────────────────────────┐
│                                           │
│   ALREADY CONNECTING   ◉ amber dot       │  ← label row
│                                           │
│   I'm already reaching your contacts      │  ← main line (amber)
│                                           │
│   Oran's voice will let you know          │  ← sub line (muted)
│                                           │
└───────────────────────────────────────────┘
```

- **Card border**: amber `#E0973A` (1.5px)
- **Same shell as `dialing`** — just different label, main text, sub text
- **Duration**: card reverts to previous state after 3 seconds (JS `setTimeout`)
- **Audio**: Oran's ongoing wait audio already confirms — this card is secondary confirmation for screen-watchers only
- **No dismiss button** — reverts automatically

---

## State 4 — `reconnecting`

Contact dropped involuntarily (FR-014). One reconnect attempt in progress.

```
┌───────────────────────────────────────────┐
│                                           │
│   RECONNECTING         ◉ amber dot       │  ← label row
│                                           │
│   Reconnecting…                           │  ← main line (amber)
│                                           │
└───────────────────────────────────────────┘
```

- **Card border**: amber `#E0973A`
- **Minimal content** — brief moment, transitions to `in_call` or next contact attempt quickly
- **No progress indicator** — reconnect is a single attempt, not a ladder

---

## State 5 — `terminal_exhausted`

Bridge pass exhausted — all contacts tried via conference, none answered. **Interim ending** — when the device fallback feature is built (FR-016), this state hands off to the device pass rather than ending. Until then it shows the calm designed ending.

```
┌───────────────────────────────────────────┐
│                                           │
│         ○                                 │  ← muted circle icon (not checkmark, not X)
│                                           │
│   [COPY TASK T023]                        │  ← main line (--text, 16px)
│   Placeholder: No one was available.      │
│                                           │
│   [COPY TASK T023]                        │  ← sub line (--text-muted, 13px)
│   Placeholder: You can try again or       │
│   reach out another way.                  │
│                                           │
└───────────────────────────────────────────┘
```

- **Card border**: `--border` `#1B344F` (subtle — not green, not red, not amber)
- **Background**: `#0C1C30`
- **Icon**: 32px circle, muted ring — `--border` fill; NOT a checkmark or X (no implied meaning)
- **Main text**: 16px, `--text` (white) — copy from T023
- **Sub text**: 13px, `--text-muted` — copy from T023
- **No action button in card** — `btn-okay` and `btn-alert` return to their normal idle state
- **Tone**: calm, not apologetic, not alarming — a designed interim ending, not a dead-end
- **Implementation note**: built as interim; `bridgeEngine.onExhausted()` is the hook where device-pass hand-off plugs in (FR-016). Do not hard-code this card as the final state.

---

## State 6 — `terminal_duration`

Max 4-minute ceiling hit. This is the **only TRUE terminal state** — it applies to the full reactive ladder (bridge pass + device pass combined) and cannot be bypassed by FR-016. Same visual language as `terminal_exhausted` but semantically different: the time ceiling ended the attempt, not contact exhaustion.

```
┌───────────────────────────────────────────┐
│                                           │
│         ○                                 │  ← same muted circle icon
│                                           │
│   [COPY TASK T023]                        │  ← same treatment
│   Placeholder: I wasn't able to connect   │
│   in time.                                │
│                                           │
│   [COPY TASK T023]                        │
│   Placeholder: You can try again.         │
│                                           │
└───────────────────────────────────────────┘
```

- **Same card styling as `terminal_exhausted`** — both are designed ends, not errors
- Distinction in copy only (T023 will write both variants)
- After ~5s the card dismisses and today-screen returns to idle
- **This state does NOT call `onExhausted()`** — the watchdog fires the terminal directly, bypassing the hand-off seam. The 4-minute ceiling is absolute.

---

## State 7 — `error`

System failure — bridge could not start or failed mid-attempt (FR-012). Must be visible — never silent. **Interim ending** — when the device fallback feature (FR-016) is built, this state hands off to the device pass. Until then it shows a visible error state.

```
┌───────────────────────────────────────────┐
│                                           │
│  ✕  Something went wrong                  │  ← icon + main line (error red)
│                                           │
│  The connection couldn't be started.      │  ← sub line (muted)
│  Try again or check your connection.      │
│                                           │
└───────────────────────────────────────────┘
```

- **Card border**: `#E2604A` (error red, 1.5px)
- **Icon**: `ti-x` — 16px, red, inline with text
- **Main text**: `Something went wrong` — 15px, `#E2604A`
- **Sub text**: context-appropriate detail, 13px, `--text-muted`
- **Action area**: `btn-alert` returns to normal (person can retry)
- **Not dismissible by the person** — disappears when bridge state returns to idle on retry
- **Implementation note**: Error renders first (FR-012: fail loudly), then engine calls `onExhausted()`. Do not hard-code as final dead-end.

---

## State 8 — `resolved`

Contact ended the call deliberately (FR-007). The attempt is complete.

```
No special card state — bridge card dismisses.
Today-screen returns silently to idle.
```

The person set the phone down to speak — a full-screen "call ended" message would interrupt a moment that ended naturally. Resolved = no UI needed. The card fades out; the normal message thread returns.

---

## Action button behaviour per state

| State | `btn-alert` | `btn-okay` |
|---|---|---|
| `idle` | normal | normal |
| `summoning` / `dialing` | 30% opacity; tap → `already_connecting` | hidden |
| `in_call` | hidden | hidden |
| `reconnecting` | hidden | hidden |
| `already_connecting` | 30% opacity; no additional action | hidden |
| `terminal_exhausted` | normal (retry available) | normal |
| `terminal_duration` | normal (retry available) | normal |
| `error` | normal (retry available) | normal |
| `resolved` | normal | normal |

---

## Proposed HTML addition (index.html — surgical)

Add inside `#today-messages`, after `#alarm-terminal-card`:

```html
<!-- Bridge card — reactive voice bridge (feature 002) -->
<div class="bridge-card hidden" id="bridge-card">
  <div class="bridge-label-row">
    <span class="bridge-label" id="bridge-label">CONNECTING</span>
    <span class="bridge-dot" id="bridge-dot"></span>
  </div>
  <div class="bridge-main" id="bridge-main">Reaching your contacts…</div>
  <div class="bridge-sub" id="bridge-sub"></div>
  <div class="bridge-progress" id="bridge-progress"></div>
</div>
```

One element, JS-driven. State reflected via CSS class on the card (`bridge-card--dialing`, `bridge-card--in-call`, `bridge-card--terminal`, `bridge-card--error`) and text content updates.

---

## Proposed CSS additions (style.css — surgical)

New classes only. No modifications to existing rules.

```css
/* Bridge card — reactive voice bridge */

.bridge-card {
  background: #0C1C30;
  border: 1.5px solid #E0973A;  /* default amber; overridden per state */
  border-radius: 16px;
  padding: 20px 18px;
  flex: 1;                       /* fills today-messages when visible */
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bridge-card--in-call   { border-color: #25C9BA; }
.bridge-card--terminal  { border-color: #1B344F; }
.bridge-card--error     { border-color: #E2604A; }

.bridge-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.bridge-label {
  font-size: 11px;
  font-weight: 700;
  color: #E0973A;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.bridge-card--in-call  .bridge-label { color: #2BB682; }
.bridge-card--terminal .bridge-label { color: #586A7A; }
.bridge-card--error    .bridge-label { color: #E2604A; }

.bridge-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #E0973A;
  animation: btnPulseAmber 1.6s ease-in-out infinite;
}

.bridge-card--in-call  .bridge-dot { background: #2BB682; animation: none; }
.bridge-card--terminal .bridge-dot { display: none; }
.bridge-card--error    .bridge-dot { background: #E2604A; animation: none; }

.bridge-main {
  font-size: 16px;
  font-weight: 500;
  color: #E0973A;
  line-height: 1.4;
}

.bridge-card--in-call  .bridge-main { color: #25C9BA; }
.bridge-card--terminal .bridge-main { color: #ECF2F6; }
.bridge-card--error    .bridge-main { color: #E2604A; font-size: 15px; }

.bridge-sub {
  font-size: 13px;
  color: #586A7A;
  line-height: 1.5;
}

/* Contact progress dots (summoning / dialing) */
.bridge-progress {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 4px;
}

.bridge-dot-step {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #1B344F;
  border: 1px solid #294662;
}

.bridge-dot-step--active {
  background: #E0973A;
  border-color: #E0973A;
}

/* Contact name badge (in_call) */
.bridge-contact-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 0.5px solid #1B344F;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  color: #586A7A;
  margin-top: 4px;
  align-self: flex-start;
}

/* Terminal icon */
.bridge-terminal-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid #1B344F;
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  color: #294662;
  font-size: 14px;
}
```

---

## Review checklist

Before confirming, check:

- [ ] Amber for active states (summoning, dialing, already_connecting, reconnecting) — consistent with Oran's color
- [ ] Teal for `in_call` — consistent with positive/connected Iona palette
- [ ] `terminal_exhausted` / `terminal_duration` — subtle border, not red, not green — designed end not error
- [ ] `error` — red, clearly distinct from terminal
- [ ] No end-call control visible in `in_call` (FR-007)
- [ ] `already_connecting` reverts automatically (3s) — no manual dismiss
- [ ] Contact progress dots (6 total) in dialing state — shows which is being tried
- [ ] Contact name shown in `in_call` badge
- [ ] `resolved` = no card — silent return to idle (natural call end)
- [ ] `btn-alert` / `btn-okay` behaviour per state table above
