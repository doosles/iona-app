<!--
SYNC IMPACT REPORT
==================
Version change: (none) → 1.0.0 (initial adoption)

Added sections:
  - I. Product Philosophy
  - II. Forbidden & Sanctioned Vocabulary
  - III. Build Discipline
  - IV. Technical Guardrails
  - V. Agent Interaction Defaults
  - Governance

Modified principles: N/A (first version)
Removed sections: N/A (first version)

Templates reviewed:
  - .specify/templates/plan-template.md    ✅ Constitution Check gate present; no update required
  - .specify/templates/spec-template.md    ✅ No outdated references; vocabulary standards apply implicitly
  - .specify/templates/tasks-template.md   ✅ No direct constitution references; no update required

Deferred items:
  - Open architectural question (Section I, item 6): packaging model not yet decided.
    Recorded as an explicit open question — not a TODO placeholder.
-->

# iona-app Constitution

**Owner:** Dood (Ian) · **Agent:** Claude Code (CC)
**Scope:** Governs all spec, plan, task, and implementation phases for this repository.
**Status:** Read this file in full at the start of every session and before any task.
Do not write code, create files, or run anything until it has been read.

---

## Core Principles

### I. Product Philosophy

These are non-negotiable framing principles. Every decision MUST be consistent with them.

1. **This is a contact/escalation service layer only.** It is not a case-management,
   health-records, or clinical system. It schedules and makes contact, and it runs an
   escalation cycle — nothing more. Never introduce health data, diagnosis, pause reasons,
   case notes, or clinical state. (It may hold the transient state of an *active* escalation
   — e.g. "cycle running, contact 2 of 4" — but that is operational state, not health or
   case data.)

2. **The app is both proactive and reactive — both first-class.** Proactive: Iona initiates
   scheduled contact. Reactive: the user or a device can trigger an escalation cycle (an
   external trigger such as a button or fall sensor, or an inbound keyword — these are the
   *same event*). A trigger fires the escalation the system already knows how to run. Neither
   direction is subordinate; both are core.

3. **Promise the attempt, never the outcome.** The reactive path connects the user to their
   *own listed contacts*, in order, looping the list until exhausted. Whether a contact
   answers is outside the service's control and outside its promise. User-facing copy MUST
   say the service *attempts to reach* the user's people — never imply guaranteed help, a
   guaranteed answer, or a manned/monitored response. The terminal state (what happens when
   the list is exhausted and no one answered) MUST be explicitly defined; "it stops" is a
   designed moment, not an absence.

4. **The reactive path carries a higher reliability bar than the proactive path.** A missed
   proactive contact is a disappointment; a live-voice SOS bridge that fails silently is a
   safety failure. Anything on the trigger → escalate → bridge path MUST fail loudly and
   visibly, never silently. This path gets extra rigour at spec, build, and test time.

5. **Never frame the product as elderly-focused, institutional, or medical.** The audience
   is anyone who wants a presence checking in on them, or a way to reach their people if
   something's wrong — for themselves or someone they care about. Avoid framing, imagery,
   and copy that reads as "for old people" or "for patients."

6. **Iona is a presence, referred to by name only.** Iona is pronoun-free and ethereal —
   never "she", "her", "it", or "the AI". Oran is the companion voice for
   escalation/emergency-contact alerts only.

**Open architectural question (do not assume an answer):** Whether the product is sold as
telecare-base-with-Iona-as-add-on, Iona-base-with-telecare-as-add-on, or unified tiers over
a shared codebase is *not yet decided*. The old app was proactive-base with an optional alert
button; the new-market ambition leans telecare-first. CC MUST NOT quietly build toward one
shape — surface the question when a task depends on the answer. The capability itself
(live-voice escalation) is well-defined regardless of how it is packaged.

---

### II. Forbidden & Sanctioned Vocabulary

This binds all user-facing output: UI copy, button labels, dropdown options, outbound message
strings, marketing text, and notification content.

**Never use, in any form:**

- **"check-in" / "check in"** — banned throughout, everywhere, no exceptions.
- **"okay"** in outbound SMS/confirmation message strings — it is a positive trigger keyword
  and causes reply loops. (Voice/IVR prompts that say "press 1 if you are okay" are a
  confirmed exception and are not governed by this repo.)
- **"roster"** — the correct term is the scheme list / schemes.
- Clinically adjacent language: **"care", "welfare", "support", "patient", "resident"** as
  product framing, and alarming words like **"failed", "emergency", "alert", "crisis"** in
  user-facing copy.
- System jargon in anything a user sees: no "IVR", "SMS", "PWA", "EventLog", "escalation",
  "reminder", raw field names, or raw field values surfaced as labels.
- **Provenance words in UI values or dropdown options** — never "inherited", "default", or
  similar. Show the value, not where it came from.

**Use only sanctioned vocabulary in dropdowns and options.** If a needed term is not already
established in the project's reference material, stop and ask — do not invent one.

---

## Build & Technical Standards

### III. Build Discipline

How CC is expected to work. Violations of these rules are the project's most common failure
mode — hold the line on them.

- **Mockups precede code.** For any UI work, produce a visual mockup first and wait for a
  reaction. Dood reacts to visuals, not abstract specs. Mock → react → build, every time.
- **Simplicity first.** The simple thing usually already exists. Do not add unrequested
  complexity, abstraction, configuration, or "while I was here" improvements. Build what was
  asked — nothing adjacent.
- **Stay inside the stated scope.** If a task starts to require changes beyond what was
  asked, stop and ask before proceeding. Surfacing a needed extra change is correct; silently
  making it is not.
- **Surgical edits over full regeneration.** Prefer the smallest change that works.
  Full-file regeneration risks silent regressions and re-introducing removed problems — only
  regenerate a whole file when explicitly asked.
- **Never assume names or paths.** Read the actual design system, reference files, and live
  files before using any class name, token, field name, or file path. Project copies can be
  stale — prefer the live/current file.
- **Show the exact lines before saving.** For a fix, present the precise change for review
  before writing it, unless told to proceed autonomously.
- **Produce complete, drop-in deliverables when a file is the output** — not fragmented
  snippets the owner has to assemble. (This is distinct from surgical edits: small *edits*
  are surgical; when a whole new file is the artifact, deliver it whole and ready to use.)
- **Consolidated instructions.** When relaying a build step, produce one clean consolidated
  prompt, never fragmented partial instructions.

### IV. Technical Guardrails

- **Credentials and IDs are never hardcoded.** Import them from config. Never paste a key,
  base ID, table ID, or record ID inline.
- **Field IDs, not field names, for any data layer** (e.g. Airtable `fld…` IDs) — field
  names cause silent failures. Copy IDs by paste, never retype (visually identical characters
  cause silent breakage).
- **Stop at the schema wall.** If a data-store permission or field-option limit blocks the
  clean path, stop and ask — do not engineer around it. Adding the option by hand takes
  seconds; the workaround creates lasting debt.
- **A `.js` file contains only JavaScript.** No HTML comments (`<!-- -->`), no
  `<script>`/`<link>`/`<style>` tags. Those belong only inside an in-page embed. An HTML
  wrapper inside a served `.js` file silently breaks parsing and the whole file dies with no
  obvious error.
- **Validate before pushing.** Run a real syntax check on every file before committing —
  `node --check <file>` for JS, `python3 -m py_compile <file>` for Python. A clean check is
  a precondition of every push, not an afterthought.
- **Repo and working copy move together.** Never update one without the other. Commit with a
  clear, specific message.
- **Never global-replace across files** (no bulk `sed -i`). Scope every change to a specific
  context. Flag pattern-matches for review rather than auto-fixing them.
- **Every save refetches and re-renders.** After a write, immediately reload and re-render
  the affected view so what's on screen reflects what's stored — never assume the write
  landed.

---

## Agent Interaction Defaults

These govern how CC is expected to conduct itself during a session. They are not suggestions.

- **Execute autonomously once a task is agreed** — run the commands and checks directly.
  Stop only when a step fails unexpectedly or scope expands (see Build Discipline, rule 3).
- **Report deploy reality.** After a push, state whether it auto-deploys or needs a cache
  purge, so "pushed" is never mistaken for "live".
- **Dood decides when work ends.** Do not defer items to "a future session" or suggest
  stopping — keep going until told otherwise.

---

## Governance

This constitution is the foundational authority for this repository. Where a specific
reference document (master reference, B2B reference, design system) covers a detail, that
document governs the detail — but nothing in those documents overrides the principles above.

**Amendment procedure:**

- Any change to Core Principles (Section I) or Vocabulary (Section II) MUST be explicitly
  agreed by the owner before taking effect.
- Build Discipline, Technical Guardrails, and Agent Interaction Defaults may be amended by
  owner instruction during a session; the constitution file MUST be updated immediately.
- All amendments increment the version according to semantic versioning:
  - MAJOR: removal or redefinition of a principle.
  - MINOR: new principle or section added.
  - PATCH: clarification, wording, or non-semantic refinement.

**Compliance:** All PRs and implementation phases MUST pass a Constitution Check gate
(see `.specify/templates/plan-template.md`) before proceeding to implementation.

---

**Version**: 1.0.0 | **Ratified**: 2026-06-18 | **Last Amended**: 2026-06-18
