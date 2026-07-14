# Safety Requirements Quality Checklist: Choose How Help Reaches You

**Purpose**: Validate the QUALITY of the safety-critical requirements — especially the safety-floor
branches where a degraded entitlement (lapsed / drifted / unreadable / blank-preference) must resolve to
the standard way. Tests whether the requirements are complete, clear, consistent, and measurable — NOT
whether the implementation works.
**Created**: 2026-07-01
**Feature**: [spec.md](../spec.md) · [plan.md](../plan.md) · [research.md](../research.md) · [data-model.md](../data-model.md)
**Focus**: Reactive safety floor · entitlement-overrides-preference · fail-safe on degraded reads

## Safety-Floor Branch Coverage (the four degradation cases → standard way)

- [ ] CHK001 Are requirements defined for a **lapsed** entitlement (was hands-free, add-on/plan since lost) resolving to the standard way at press-time? [Coverage, Spec §FR-015 / US2 AC1]
- [ ] CHK002 Are requirements defined for a **blank/unset preference** defaulting to the standard way — for every person, including one entitled-but-not-yet-chosen? [Coverage, Spec §FR-017 / Edge Cases]
- [ ] CHK003 Are requirements defined for an **unreadable entitlement** (cannot be confirmed at press-time) resolving to the standard way, with the standard way **never gated on an entitlement read**? [Edge Case, Spec §Edge Cases / Research §D6]
- [x] CHK004 Are requirements defined for **entitlement drift** (the stored entitlement flag disagreeing with true Memberstack state) — is it clear which value is authoritative at press-time, and in which drift direction the person is (and is not) protected? [Ambiguity/Gap, Spec §FR-014] — RESOLVED 2026-07-01: Edge Cases now names both drift directions (safe → standard way; over-entitlement → precondition-bounded billing-leakage risk, not safety).
- [ ] CHK005 Is the "**current entitlement wins over stored preference**" rule stated as a single authoritative requirement and not contradicted anywhere else? [Consistency, Spec §FR-014/FR-016]
- [ ] CHK006 Do the requirements make explicit that a stored preference for a non-entitled way **never blocks or delays** being reached? [Completeness, Spec §FR-016]
- [ ] CHK007 Is it specified that the fallback to the standard way is **not surfaced as an error** to the person? [Clarity, Spec §FR-015 / US2 AC2]
- [ ] CHK008 Are all four degradation branches specified to converge on the **same** outcome (standard way) with no divergent handling? [Consistency/Coverage]
- [x] CHK009 Is "reached the standard way" defined consistently as **the service reaching the person's people on their behalf** — and never conflated with the device-dial offline floor — across US2/FR-002/FR-015? [Clarity, Spec §FR-002/FR-015 / Research §D6] — RESOLVED 2026-07-01: unreachable Edge Case + SC-001 now name the standard way AND the device-based offline floor distinctly.

## Entitlement Read — Completeness & Clarity

- [ ] CHK010 Is "currently entitled to hands-free" defined at requirement level (mechanics-free), including that it is evaluated **live at the moment of pressing**? [Clarity, Spec §Key Entities]
- [ ] CHK011 Is it specified that entitlement is a **live yes/no with no distinct pending state** (a just-purchased-not-yet-active person reads as not-entitled)? [Completeness, Spec §Clarifications / Key Entities]
- [ ] CHK012 Do the requirements state the entitlement read must stay **off the safety-critical path** (a degraded read never prevents the person being reached)? [Clarity, Spec §Edge Cases / Plan Constraints]
- [ ] CHK013 Is the entitlement source's authority documented as an **assumption/dependency** (who owns it; that it may lag reality)? [Assumption, Spec §Assumptions]

## Preference vs. Entitlement — Consistency & No-Auto-Switch

- [ ] CHK014 Are requirements consistent that **losing** entitlement forces the standard way while **gaining** it only unlocks the option (no auto-switch)? [Consistency, Spec §FR-020 / Clarifications]
- [ ] CHK015 Is it specified that gaining entitlement MUST NOT change the stored/active selection until the person explicitly picks hands-free? [Completeness, Spec §FR-020]
- [ ] CHK016 Is a stored preference unambiguously defined as an **intent, never an entitlement**? [Clarity, Spec §Key Entities / Assumptions]

## Copy & UX Safety Requirements

- [ ] CHK017 Is the requirement that the standard-way default **must never read as "help off"** stated specifically enough to be reviewable (what is prohibited / required)? [Clarity, Spec §FR-022]
- [ ] CHK018 Are requirements clear that the person is **never asked to choose at the moment of pressing** (0 mid-press choices)? [Coverage, Spec §FR-005 / SC-002]
- [ ] CHK019 Is the prohibition on the banned term "check-in" in this feature's copy stated? [Completeness, Spec §FR-022]
- [ ] CHK020 Is it explicit that pressing for help stays fully functional in the standard/default state (help is never gated by this feature)? [Consistency, Spec §FR-006/FR-022]

## Acceptance Criteria Quality (measurability)

- [x] CHK021 Is SC-001 ("100% reached; none un-helped, incl. a non-entitled stored preference") objectively measurable — and is "**reached**" defined as an attempt **initiated** (promise-the-attempt), not a contact answering? [Measurability/Ambiguity, Spec §SC-001 / Constitution I.3] — RESOLVED 2026-07-01: "reached = an attempt is initiated" now defined at the head of Measurable Outcomes.
- [ ] CHK022 Is SC-002 ("0 mid-press choices") objectively verifiable? [Measurability, Spec §SC-002]
- [ ] CHK023 Do the US2 acceptance scenarios cover each degradation branch with a testable Given/When/Then? [Acceptance Criteria, Spec §US2]

## Non-Functional / Reliability

- [ ] CHK024 Are "fail loudly, never silently" requirements for the reactive path expressed as verifiable criteria (no silent un-helped path exists)? [Measurability, Constitution I.4 / Spec §SC-001]
- [ ] CHK025 Is there a requirement that entitlement evaluation adds **no new press-time latency / no new blocking dependency** on the reach path? [Gap, Plan Constraints]

## Dependencies, Assumptions & Preconditions

- [ ] CHK026 Are the ship-gate preconditions (add-on plan exists; no auto-remove of the main plan; reliable production sync) documented as **dependencies** with the safety rationale (paid-but-blocked is worse than a bug)? [Dependency, Plan Deferred Preconditions]
- [ ] CHK027 Is the assumption that reliable entitlement propagation is required **before real-money launch** captured in the spec itself (not only the plan)? [Assumption, Spec §Assumptions]
- [ ] CHK028 Is it assumed/stated that the two underlying ways are pre-existing and unchanged, so this feature introduces no new reach behaviour that could itself fail? [Assumption, Spec §Assumptions]

## Ambiguities & Conflicts

- [ ] CHK029 Is there any latent conflict between "the standard way is always available / never switched off" (FR-006) and any state in which the picker or an entitlement read could suppress it? [Conflict, Spec §FR-006]
- [x] CHK030 Is the distinction between the **two picker ways** and the **device-dial offline floor** clear enough that "standard way" can never be mis-specified as device-dial in the safety requirements? [Ambiguity, Spec §FR-018 / Research §D6] — RESOLVED 2026-07-01: the offline floor is now named only in the backend-unreachable branch, distinct from the two picker ways.

## Notes

- Work each item as a yes/no on the *requirement text*. A "no" means the spec/plan needs a wording or
  coverage fix before `/speckit.tasks`, not that code is wrong.
- Traceability: every item cites a spec section or a `[Gap]/[Ambiguity]/[Conflict]/[Assumption]` marker.
- Safety-floor emphasis (per request): CHK001–CHK009 are the degradation-branch core; CHK004 (drift
  direction) and CHK009/CHK030 (standard-way vs device-dial) are the items most likely to surface a real
  wording gap — see the run summary.
