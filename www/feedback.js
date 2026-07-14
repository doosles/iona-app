/* ══════════════════════════════════════════════════════════════════════════
   IONA — INTERFACE FEEDBACK  (feedback.js)
   ──────────────────────────────────────────────────────────────────────────
   Sound + haptic response to member taps. Three voices, one family:

     tap()      Teal    · 1046Hz, 11ms          — rows, toggles, cards
     nav()      Orb     · 880 + 1320 together   — tabs, screens, back
     confirm()  Signal  · 784 → 987 in sequence — save, paired, done

   All synthesised via the SAME AudioContext app.js already owns
   (getAudioContext). No audio assets. No new context.

   ── SAFETY INVARIANT ─────────────────────────────────────────────────────
   The alarm path NEVER makes an interface sound. Those controls already
   carry their own audio meaning (playAlarmSiren / playVoiceMessage) and a
   UI chirp layered under a siren is noise at the moment clarity matters
   most. SILENT_IDS below is the single authority — there is no second
   exclude list anywhere. Adding a new alarm-path control means adding its
   id here, and nowhere else.

   Preference key: `feedback`  ·  values: sound | vibrate | off
   Default: sound. Read before first paint by applyAppearanceOnLaunch().
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  /* ── The controls that must never sound ─────────────────────────────────
     btn-alert   I NEED HELP        btn-cancel  CANCEL (cancel window)
     dd-stop     YES — STOP         dd-next     KEEP TRYING
     btn-okay is included: it resolves a live contact, not a menu tap.
     btn-done  ↩ RETURN TO IONA — a live alarm-path exit (app.js:1708) that sits
       OUTSIDE .today-actions, so the surface rule below does NOT catch it; its
       twin btn-alarm-done lives inside .today-actions and is covered there.
       (CC 09-Jul: added to honour "↩ RETURN TO IONA are silent" — the brief's
       5-id list missed it. Flagged for owner confirmation.)                 */
  const SILENT_IDS = [
    'btn-alert',
    'btn-cancel',
    'dd-stop',
    'dd-next',
    'btn-okay',
    'btn-done',
  ];

  /* ── Mode ──────────────────────────────────────────────────────────────
     Held in memory; written through by setMode(). Defaults to 'sound' so a
     failed preference read is never silent-by-accident.                   */
  let _mode = 'sound';
  const _sound = () => _mode === 'sound';
  const _haptic = () => _mode === 'sound' || _mode === 'vibrate';

  /* ── Retrigger guard ───────────────────────────────────────────────────
     Two taps inside this window play once. Stops double-taps and delegated
     bubbling from stacking oscillators into mush.                         */
  const GUARD_MS = 55;
  let _last = 0;

  /* ── Voice ─────────────────────────────────────────────────────────────
     Borrows app.js's getAudioContext() — same singleton, same resume guard.
     Silently no-ops if unavailable (browser preview, blocked autoplay).   */
  function _ctx() {
    try {
      if (typeof global.getAudioContext === 'function') return global.getAudioContext();
    } catch (e) {}
    return null;
  }

  function _voice(c, spec, base) {
    const t0 = c.currentTime + (spec.at || 0);
    const osc = c.createOscillator();
    const gain = c.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(spec.f, t0);

    osc.connect(gain);
    gain.connect(c.destination);

    const peak = Math.max(0.0001, (spec.g || 1) * base);
    const atk = spec.atk || 0.002;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.dur);

    osc.start(t0);
    osc.stop(t0 + spec.dur + 0.03);
  }

  /* ── The three voices ──────────────────────────────────────────────────
     Frequencies + envelopes are owner-selected (sound lab, 09 Jul).
     Do not retune without re-auditioning as a set.                        */
  const VOICES = {
    tap: {
      base: 0.07,
      vib: 8,
      notes: [{ f: 1046, dur: 0.011 }],
    },
    nav: {
      base: 0.07,
      vib: 12,
      notes: [
        { f: 880,  dur: 0.075 },
        { f: 1320, dur: 0.075, g: 0.42 },
      ],
    },
    confirm: {
      base: 0.08,
      vib: [10, 40, 16],
      notes: [
        { f: 784, dur: 0.10 },
        { f: 987, dur: 0.20, at: 0.095, atk: 0.003 },
      ],
    },
  };

  function _play(name) {
    const v = VOICES[name];
    if (!v) return;

    const now = Date.now();
    if (now - _last < GUARD_MS) return;
    _last = now;

    if (_sound()) {
      const c = _ctx();
      if (c) {
        try { v.notes.forEach((n) => _voice(c, n, v.base)); }
        catch (e) { /* audio must never break a tap */ }
      }
    }
    if (_haptic() && global.navigator && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(v.vib); } catch (e) {}
    }
  }

  /* ── Should this element speak, and with which voice? ──────────────────
     Returns null for anything on the alarm path, or anything that isn't a
     control. Walks up from the tap target so an <i> or <span> inside a
     button still resolves to the button.                                  */
  function _voiceFor(target) {
    const el = target && target.closest
      ? target.closest('button, [role="radio"], .msg-font-option, .settings-card, .method-row')
      : null;
    if (!el) return null;

    // Safety invariant — checked on the element AND any ancestor control.
    if (el.id && SILENT_IDS.indexOf(el.id) !== -1) return null;
    for (let i = 0; i < SILENT_IDS.length; i++) {
      if (el.closest('#' + SILENT_IDS[i])) return null;
    }
    // Any control living inside the alarm surfaces stays silent.
    if (el.closest('#device-dial-prompt')) return null;
    if (el.closest('.today-actions')) return null;

    if (el.disabled) return null;

    // The Sound & touch options own their own feedback via their click handler
    // (Feedback.preview) — sounding here too would double-fire, and the shared
    // retrigger guard would let this tap win and swallow the confirm preview,
    // breaking "tap Vibrate → buzz, no sound". Let them self-preview.
    // (CC 09-Jul.)
    if (el.hasAttribute('data-feedback')) return null;

    // Confirm — the deliberate, saving actions.
    if (el.classList.contains('sa-save') ||
        el.classList.contains('sc-save') ||
        el.classList.contains('pairing-cta') ||
        el.id === 'sv-save') return 'confirm';

    // Navigate — anything that moves the member between surfaces.
    if (el.classList.contains('nav-tab') ||
        el.classList.contains('settings-tab') ||
        el.classList.contains('account-card') ||
        el.classList.contains('sc-back') ||
        el.classList.contains('cm-back') ||
        el.classList.contains('settings-close') ||
        el.classList.contains('sc-footer-back') ||
        el.classList.contains('cm-footer-back') ||
        el.id === 'nav-settings' ||
        el.id === 'nav-today') return 'nav';

    // Everything else that's a control — a tap.
    return 'tap';
  }

  /* ── Public surface ────────────────────────────────────────────────────*/
  const Feedback = {
    tap:     () => _play('tap'),
    nav:     () => _play('nav'),
    confirm: () => _play('confirm'),

    /** Play a named voice regardless of element context (used by the
     *  Appearance control so each option previews itself). Respects mode. */
    preview(name) { _play(name); },

    /** Current mode. */
    mode() { return _mode; },

    /** Set mode in memory. Persistence is the caller's job (setPreference). */
    setMode(m) {
      _mode = (m === 'vibrate' || m === 'off') ? m : 'sound';
      return _mode;
    },

    /** The silent list, exposed read-only for tests / audit. */
    silentIds() { return SILENT_IDS.slice(); },

    /** One delegated listener for the whole app. Call once, from initSettings.
     *  Capture phase: we sound on the way DOWN, before any handler can
     *  navigate away and swap the element out from under us. */
    init() {
      if (Feedback._bound) return;
      Feedback._bound = true;
      document.addEventListener('click', (e) => {
        if (_mode === 'off') return;
        const voice = _voiceFor(e.target);
        if (voice) _play(voice);
      }, true);
    },
  };

  global.Feedback = Feedback;
})(window);
