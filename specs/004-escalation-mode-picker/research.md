# Phase 0 — Research & Decisions: Choose How Help Reaches You

All "unknowns" here are integration-shape decisions grounded in the read-and-report audit of the live
code (2026-07-01). The FACTS mechanics are settled inputs, not open questions — recorded here as bound
decisions, not re-litigated.

## D1 — Where the method decision lives: the existing `/bridge/contacts` gate (server-side)

- **Decision**: Extend `_handle_bridge_contacts` (`reply_to_airtable_webhook.py:~1356`). Replace the single
  `if plan_name != GUARDIAN_ANGEL_PLAN_VALUE: 403` with a gate on
  `escalation_mode == "handsfree" AND hasHandsFree`. Keep the 403 block and the app's existing
  fall-through-to-escalation verbatim.
- **Rationale**: The audit confirmed the press path already does `summonHelp → GET /bridge/contacts`, and a
  403 already falls through to Iona escalation (`app.js:2150–2158` → `_startHelpSequence:1194–1210`). The
  safety fallback the spec demands is *already the wiring* — we only change what the gate says "no" to.
  Server-side keeps the decision authoritative and press-time-live (constitution I.4 / IV: time-critical
  logic is server-driven).
- **Alternatives rejected**: (a) Client-side branch in `_startHelpSequence` reading a local pref — rejected
  (owner declined; reintroduces client-side safety logic + a stale-pref risk). (b) A brand-new
  method-decision endpoint — rejected (duplicates the gate that already fetches the record and already
  fronts the bridge).

## D2 — `hasHandsFree` computation and read path

- **Decision**: `hasHandsFree = (planName == GUARDIAN_ANGEL_PLAN_VALUE) OR (handsfree_addon == true)`.
  In the gate (`returnFieldsByFieldId=true`) read both by **field ID** (`MEMBER_PLAN_NAME_FIELD_ID`,
  `HANDSFREE_ADDON_FIELD_ID`). In `/pwa-status` (name-mode fetch) read by **display name**
  (`planName`, `handsfree_addon`).
- **Rationale**: Mirrors the existing GA gate exactly, extended with an OR. Read live from Airtable Table 1,
  off the safety path — never a live Memberstack call (constitution IV). `planName` is deliberately left
  untouched (still carries the main plan for the Beacon/tier gates); the add-on gets its own boolean field,
  sidestepping the `planConnections[].planName` array-collapse risk.
- **Note (carried, not introduced)**: the two endpoints read Table 1 in different modes (gate = field-ID,
  `/pwa-status` = display-name). This is pre-existing. `config.py` therefore carries **both** an ID
  constant (for the gate) and a name constant (for `/pwa-status` + PATCH bodies) for each new field.

## D3 — `escalation_mode` storage, default, and validation

- **Decision**: New Table 1 single-line-text field `escalation_mode ∈ {escalation, handsfree}`; blank/unset
  → treated as `escalation`. Validated in code (`VALID_ESCALATION_MODES`) — the VALID_* convention, so no
  Airtable select-options to configure (single-line text). App-written only; Make never writes it.
- **Rationale**: Matches the FACTS and the project's free-text + code-guard convention (per memory:
  EventLog Type/Status are free-text with code-side guards). Default-to-standard encodes the spec's OQ-1
  resolution and the safety floor (never assume `handsfree` from absence).
- **Alternatives rejected**: single-select field — rejected (would need an Airtable schema/option change =
  schema wall for zero benefit over the code guard). Storing the preference in Capacitor Preferences —
  rejected (would split source-of-truth from the gate and risk a stale local safety pref).

## D4 — Preference write endpoint mirrors pause/restart

- **Decision**: New `POST /pwa-escalation-mode {fcm_token, escalation_mode}` →
  `_handle_pwa_escalation_mode` (mirrors `_handle_pwa_pause`) → `update_table1_escalation_mode()` (mirrors
  `update_table1_service_status`: whitelist the value, PATCH only that field **by name**). Apply-then-return
  (write before responding), so the app's re-read reflects the stored value (constitution IV: every save
  refetches and re-renders).
- **Rationale**: Reuses the proven, audited write path (`app.js` POST → webhook lookup-by-fcm_token →
  guarded PATCH). App owns preference; sync owns entitlement — clean ownership split.

## D5 — `escalation_mode` becomes the 2nd app-writable Table 1 field

- **Decision**: Record in the master reference that `escalation_mode` joins `service status` as an
  app-writable (webhook-written) Table 1 field. "Event Logger is the sole Airtable writer" keeps its
  existing carve-out for the webhook's own service-status/preference writes.
- **Rationale**: Keeps the documented writable set honest (owner approved). Not a new mechanism — the
  webhook already PATCHes `service status` directly via `update_table1_service_status`.

## D6 — Entitlement unreadable at press-time → standard way (fail-safe)

- **Decision**: If the gate can't confirm entitlement (Airtable non-200 / fetch error), the person still
  reaches help the standard way. The existing behaviour already delivers this: a `/bridge/contacts` 502 →
  `summonHelp` catch → device-dial floor → Iona escalation (`app.js:2163–2177`). The standard way is never
  gated on a successful entitlement read.
- **Rationale**: Spec fail-safe edge case + constitution I.4 (fail loudly toward being reached, never
  silently un-helped). No new code — the resilience chain already exists.

## D7 — UI source and token binding

- **Decision**: Build to `reactive_method_mockup_locked.html` (owner-supplied authoritative UI: radio-select,
  two paths, icon-left/text-middle/control-right, "Included" badge vs. price pill in the same geometry).
  Bind colours/sizes/radii to the **live** `www/style.css` semantic tokens (see plan's mapping table), not
  the mockup's literal hex — the mockup file says so explicitly. Reuse existing `.settings-card` /
  `.settings-card-tile(--amber)` patterns; row text uses the US6 `--fs-row-label` / `--fs-hint` tokens so it
  scales; safety buttons + chrome stay fixed.
- **Open confirm at build (not a blocker)**: **icon source.** The mockup uses Tabler Icons via CDN
  (`ti ti-users`, `ti ti-microphone`). Confirm whether the app already bundles an icon set or uses inline
  SVG; if Tabler isn't already present, use the app's existing icon approach rather than adding a CDN
  dependency. To be resolved in `/speckit.tasks` / build, per "never assume names/paths".

## D8 — Gaining/losing entitlement behaviour (from clarify)

- **Decision**: **Losing** entitlement is handled by the gate fallback (D1) — forced to standard. **Gaining**
  entitlement unlocks the option only: when `hasHandsFree` reads true, `_renderReactiveMethodPicker` makes
  the hands-free row selectable, but the stored `escalation_mode` is untouched (stays `escalation` by
  default) until the person explicitly picks it. No auto-switch of a safety-critical behaviour.
- **Rationale**: Spec OQ-2. The render reads the stored value; nothing writes `handsfree` except an explicit
  user selection.

## D9 — Price is provisional

- **Decision**: The add-invitation price is a **placeholder** ("Add £6" in the mockup). Hold it in a single,
  clearly-commented constant in the app so it is trivially swappable; never present it as final. Real
  pricing arrives later (tied to the add-on plan precondition).
- **Rationale**: FACTS + spec FR-021; avoids hard-coding a settled-looking price.
