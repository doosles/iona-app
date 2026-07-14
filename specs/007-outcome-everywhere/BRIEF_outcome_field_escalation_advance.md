# Engine-touch delta-brief — the `outcome` field on `escalation_advance` (feature 007, FR-006)
**Status:** ✅ **SIGNED OFF — captain, 2026-07-12** (Option A + no-drift condition — see the sign-off block at
the foot of this brief). `[ENG]` tasks unblocked. Per Constitution I.4 and the 006 precedent, this brief declared
what is added at the emission site and what engine state it reads before any emission code was written. No engine
code was changed at brief time.

**Relationship to the 006 brief.** 006's `BRIEF_escalation_advance_engine_touch.md` established and the captain
signed off the **new `escalation_advance` emission** at the dial sites. 007 adds **no new emission and touches no
dial site** — it adds **one field (`outcome`) to the already-shipped, already-reviewed `phase="ended"`
emission**. This brief is therefore a **delta**, not a fresh engine touch.

---

## DELTA 2 — `more_sweeps` on the final-contact outcome `ended` (L9 RULING REFINED, owner-directed) — 2026-07-13

**Captain pre-signed conditional** (run-2 capture brief, "L9 RULING REFINED" section) on: value derived from
locals/config already at the emit site, no new reads, no reordering, and this note naming the exact
computation before deploy. Same governance as the ratified R004 delta.

**What is added.** ONE additive key on the already-signed `phase="ended"` outcome emission — present ONLY on
the sweep's FINAL populated contact's outcome ended: `more_sweeps: "true"` (another sweep follows this gap —
the device may mask the inter-sweep pause with L9, TRUE there) / `"false"` (the exhausted terminal follows —
device stays bed-only). Absent on every other emission (non-final contacts, dialing, ring-stop, amd) — the
builder omits the key exactly as it omits `outcome` (byte-identical posture), and an absent key is the
device's safe default (bed-only, back-compat both directions).

**The exact computation** — at the DIAL site, `_fire_one_touch` (reply_to_airtable_webhook.py), where every
input is already a local/param (zero new reads, zero reordering):

```python
_last_populated = not any(table1_fields.get(CONTACT_FIELDS[i]["phone"], "")
                          for i in range(econtact_index + 1, len(CONTACT_FIELDS)))
more_sweeps = (sweep < sweep_count) if _last_populated else None
```

`table1_fields`, `econtact_index`, `sweep`, `sweep_count` are `_fire_one_touch` parameters; `CONTACT_FIELDS`
is already imported there. "Last populated contact of the sweep" is static per run (the walk visits populated
contacts in index order), so dial-time computation is exact for every outcome path including press-9 decline
and human-no-ack.

**Carriage to the emit sites** (the emit sites themselves are byte-positioned exactly where they were):
- **SMS ended** and **fail-to-place ended** (both inside `_fire_one_touch`): the local is attached directly.
- **Call terminal ended** (`process_escalation_callback`): the flag rides the StatusCallback URL from
  `make_call` (`callback_params["more_sweeps"] = "true"/"false"`, omitted when None) — the SAME carriage
  pattern as the signed v5.28 `run_token` — parsed in `_handle_twiml_callback`, passed as a new trailing
  parameter (default `""` = legacy/absent), decoded to bool/None at the emit line. At the emit it is a
  parsed local, exactly like `run_token`/`sweep`. No read, no reorder; fire-and-forget unchanged.

**Files:** `reply_to_airtable_webhook.py` (compute + carriage + emit param), `send_via_twilio.py`
(`make_call(more_sweeps=None)` → callback URL param), `pwa_sender.py` (builder + sender additive param).
`py_compile` clean ×3; strict `ff"` prefix check 0. Device rule + sim (31/31, incl. both ruled cells and
absent-flag back-compat) in the run-2 capture brief trail. — CC

**DELTA 2 addendum (same pass, pre-deploy) — the SECOND fire site.** The escalation has two dial sites
(the 08 Jul parity lesson): the webhook's `_fire_one_touch` AND the initial contact-1 fire in
`escalation_manager.run_escalation`. For a SINGLE-populated-contact member the initial fire's contact is
itself the sweep's last populated contact — the owner's "single-contact voicemail" matrix case — so the
identical flag rides its `make_call` too. Exact computation there (all inputs in scope, zero new reads;
`sweep` is the literal 1 of the initial fire):

```python
_last_populated = not any(table1_fields.get(CONTACT_FIELDS[i]["phone"], "")
                          for i in range(econtact_index + 1, len(CONTACT_FIELDS)))
more_sweeps = None
if _last_populated:
    _sc_raw = table1_fields.get("Sweep Count", 2)         # mirrors _resolve_sweep_count: default 2,
    _sc = int(_sc_raw) if _sc_raw not in (None, "") else 2  # clamp [1,3]; int-guard falls to 2
    more_sweeps = sweep < max(1, min(3, _sc))
```

The mirror of `_resolve_sweep_count` is inline (the skill cannot import the webhook — layering) with a
grep-both cross-reference comment at both sites. `escalation_manager.py` v2.6→v2.7. — CC
