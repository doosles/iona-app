// ============================================================
// Iona — The Receiving App (Product A)
// www/app.js — all app logic
// ============================================================

// --- Section 1: Constants ---

// --- Section 2: Utilities (Preferences, routing, messaging) ---

async function getPreference(key) {
  if (!window.Capacitor?.Plugins?.Preferences) {
    throw new Error(`[Prefs] getPreference('${key}') — Capacitor.Plugins.Preferences not available`);
  }
  const { value } = await Capacitor.Plugins.Preferences.get({ key });
  return value;
}

async function setPreference(key, value) {
  if (!window.Capacitor?.Plugins?.Preferences) {
    throw new Error(`[Prefs] setPreference('${key}') — Capacitor.Plugins.Preferences not available`);
  }
  await Capacitor.Plugins.Preferences.set({ key, value: String(value) });
}

async function removePreference(key) {
  if (!window.Capacitor?.Plugins?.Preferences) {
    throw new Error(`[Prefs] removePreference('${key}') — Capacitor.Plugins.Preferences not available`);
  }
  await Capacitor.Plugins.Preferences.remove({ key });
}

function show(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  const target = document.getElementById(screenId);
  if (!target) throw new Error(`[Router] show() — no element with id '${screenId}'`);
  target.classList.remove('hidden');
}

function setMsg(elementId, text) {
  const el = document.getElementById(elementId);
  if (!el) throw new Error(`[Router] setMsg() — no element with id '${elementId}'`);
  el.textContent = text;
}

function fmtTime() {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function buildIonaCard(text, timeStr, isReply, character) {
  const who = character === 'oran' ? 'oran' : 'iona';
  const label = who === 'oran' ? 'Oran' : 'Iona';
  return `
    <div class="iona-card card--${who}">
      <div class="orb ${isReply ? 'orb--sm' : 'orb--lg'} orb--${who}">
        <div class="orb-ring"></div>
      </div>
      <div class="iona-card-content">
        <div class="iona-label">${label} · ${isReply ? timeStr : 'Just now'}</div>
        <div class="iona-msg">${text}</div>
        ${!isReply ? `<div class="iona-time">${timeStr}</div>` : ''}
      </div>
    </div>`;
}

function buildBoutRow(text, timeStr) {
  // 'You' message card — mirrors the Iona card on the user's (right) side, in a neutral grey tone.
  // Header [You · time] + avatar on the right; message + checkmark below, right-aligned and nowrap.
  return `
    <div class="bout-row">
      <div class="bout-card">
        <div class="bout-content">
          <div class="bout-label">You · ${timeStr}</div>
          <div class="bout-msg-row">
            <span class="bout-msg">${text}</span>
            <i class="ti ti-circle-check-filled bout-check" aria-hidden="true"></i>
          </div>
        </div>
        <div class="bout-avatar"><i class="ti ti-user" aria-hidden="true"></i></div>
      </div>
    </div>`;
}

// --- Section 2b: Audio (alarm siren, voice message, pulse tone) ---

let escalationCountdownTimer = null;
let escalationCountdownValue = 0;
let _summonCountdownActive = false;   // feature 005 — true only during the cancel-window countdown (dup guard)
let _summonEvaluating = false;        // feature 005 — true only while a press is evaluating liveness; guards the _escalationConfirmedLive await window so a rapid flurry still resolves to ONE sequence
let _escalationSelfHealTimer = null;  // feature 005 — backstop that re-arms if the outcome FCM is lost
let escalationTransitionTimer = null;
let _orbFadeInRaf = null;
let _audioCtx = null;

const ALARM_SIREN_LOW_FREQ = 400;
const ALARM_SIREN_HIGH_FREQ = 900;
const ALARM_SIREN_DURATION = 5.0;
const ALARM_SIREN_CYCLES = 3;
const ALARM_SIREN_TYPE = 'sine';
const ALARM_PULSE_FREQ = 660;
const ALARM_PULSE_DURATION = 80;
// Escalation-active self-heal backstop (feature 005). MUST exceed the longest LEGITIMATE ladder run or it
// would fire mid-escalation and re-arm the button while calls are live (double-summon). Live worst case
// (6 contacts × 3 attempts, none acknowledged, callback-driven): ring-out ≈ 22 min (60s Twilio default ring
// + 15s ECONTACT_ATTEMPT_DELAY × 18); answered-no-press ≈ 27 min (3× re-prompt IVR + AMD). 45 min = ~27 × 1.5
// (captain rule: err high — a lost-FCM backstop can be slow, never early).
const ALARM_ESCALATION_TIMEOUT_MS = 45 * 60 * 1000; // 45 minutes

function getAudioContext() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

function playAlarmSiren() {
  return new Promise((resolve) => {
    const c = getAudioContext();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.connect(g);
    g.connect(c.destination);
    osc.type = ALARM_SIREN_TYPE;
    const now = c.currentTime;
    const cycleDur = ALARM_SIREN_DURATION / ALARM_SIREN_CYCLES;
    osc.frequency.setValueAtTime(ALARM_SIREN_LOW_FREQ, now);
    for (let i = 0; i < ALARM_SIREN_CYCLES; i++) {
      const t = now + i * cycleDur;
      osc.frequency.linearRampToValueAtTime(ALARM_SIREN_HIGH_FREQ, t + cycleDur * 0.5);
      osc.frequency.linearRampToValueAtTime(ALARM_SIREN_LOW_FREQ, t + cycleDur);
    }
    g.gain.setValueAtTime(1.0, now);
    g.gain.setValueAtTime(1.0, now + ALARM_SIREN_DURATION - 0.1);
    g.gain.linearRampToValueAtTime(0, now + ALARM_SIREN_DURATION);
    osc.start(now);
    osc.stop(now + ALARM_SIREN_DURATION);
    osc.onended = resolve;
  });
}

// Feature 010 / Amendment 9 addendum — the EXISTING pre-Iona attention tone, made awaitable so the
// sequential run (siren → tone → clip → countdown) can order it. playArrivalPing() is fire-and-forget
// WebAudio (3 notes, last stops at ~1.02s); no new asset is created — this only awaits the existing one.
const ATTENTION_TONE_MS = 1100;
function playAttentionTone() {
  return new Promise((resolve) => {
    try { playArrivalPing(); } catch (e) {}
    setTimeout(resolve, ATTENTION_TONE_MS);
  });
}

// Feature 010 / Amendment 8 — the activation prompt as a pre-recorded Oran (Polly Arthur-Neural) clip,
// one per ladder step (5–60 by 5). Clip text is the byte-exact Amendment-7 template with {n} rendered in.
// Selected by the member's configured window; clamped to the ladder so an out-of-range value can never
// request a missing asset (falls back to the ruled default 10).
function _activationClipFor(seconds) {
  let n = Math.round((Number(seconds) || _CW_DEFAULT) / _CW_STEP) * _CW_STEP;
  n = Math.min(_CW_MAX, Math.max(_CW_MIN, n));
  return SA_STATIC_BASE + 'activation_' + String(n).padStart(2, '0') + '.mp3';
}

// RETIRED from member-facing use (Amendment 8). The Web-Speech path never played on Android WebView:
// speechSynthesis.getVoices() populates asynchronously, so the voices-ready guard below trips on the
// first synchronous ask every time and the function returns before speak() is ever reached (logcat
// showed zero TTS activity). All member-facing lines are now pre-recorded Polly clips on the
// _saPlayOnce pipeline. Kept only as a non-member-facing reference; do not wire it to new callers.
function playVoiceMessage(windowSeconds = ALARM_CANCEL_WINDOW_SECONDS) {
  // v2 — replace with a pre-recorded Amy Neural file (new Audio('https://static.iona.today/audio/alert-message.mp3')).
  // Feature 010: the cancel window is member-configured (5–60s); windowSeconds is interpolated below (FR-010).
  // Spoken wording remains owner-reserved (copy session) — only the number is made dynamic here.
  return new Promise((resolve) => {
    const ctx = getAudioContext();
    const fallback = () => {
      const freqs = [880, 660, 550];
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.type = 'sine';
        const t = ctx.currentTime + i * 0.4;
        osc.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.4, t);
        g.gain.linearRampToValueAtTime(0, t + 0.3);
        osc.start(t); osc.stop(t + 0.3);
      });
      setTimeout(resolve, freqs.length * 400 + 100);
    };
    if (!window.speechSynthesis || speechSynthesis.getVoices().length === 0) {
      fallback(); return;
    }
    const msg = new SpeechSynthesisUtterance(
      `This is Iona. You have pressed the HELP button. If you do not cancel within ${windowSeconds} seconds, we will attempt to call your contacts to let them know you are in need of assistance.`
    );
    msg.rate = 0.95;
    msg.pitch = 1.0;
    msg.volume = 1.0;
    const fallbackTimer = setTimeout(() => { speechSynthesis.cancel(); fallback(); }, 12000);
    msg.onend = () => { clearTimeout(fallbackTimer); resolve(); };
    msg.onerror = () => { clearTimeout(fallbackTimer); fallback(); };
    speechSynthesis.speak(msg);
  });
}

// Bridge hard-failure fallthrough line. Amendment 9 condition 3 moved it off TTS onto the clip pipeline
// (it had never played for TWO reasons: the Android-WebView voices-guard, AND no caller at all).
// DELIBERATELY UNCALLED — captain ruling 2026-07-18: the clip's wording and voice are owner-reserved to
// the copy session and no placeholder debuts in a crisis moment. The asset is rendered and ready
// (bridge_fallthrough.mp3, placeholder wording carried verbatim from the old TTS string); wire this at the
// fallthrough site in _startIonaEscalation ONLY once the copy session rules. Until then the path stays
// silent exactly as it is today — no behaviour change.
function _playBridgeFallthroughMessage() {
  return _saPlayOnce(SA_STATIC_BASE + 'bridge_fallthrough.mp3');
}

function playPulseTone() {
  const c = getAudioContext();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.connect(g);
  g.connect(c.destination);
  osc.type = 'sine';
  osc.frequency.value = ALARM_PULSE_FREQ;
  const now = c.currentTime;
  g.gain.setValueAtTime(0.35, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + ALARM_PULSE_DURATION / 1000);
  osc.start(now);
  osc.stop(now + ALARM_PULSE_DURATION / 1000 + 0.05);
}

function playArrivalPing() {
  const c = getAudioContext();
  const notes = [587, 740, 880];
  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.connect(g); g.connect(c.destination);
    osc.type = 'sine';
    const t = c.currentTime + i * 0.16;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (i === 2 ? 0.6 : 0.35));
    osc.start(t); osc.stop(t + 0.7);
  });
}

// --- Section 3: Auth (Memberstack init, session check, sign-in, logout) ---

let ms = null;            // Memberstack DOM instance — set once at init
let currentMember = null; // cached from init; used by session check
let memberConfig = null;  // held in memory post-login; never fetched on alarm tap

function buildMemberConfig(memberData) {
  return {
    alarmCancelWindow: memberData.customFields?.['alarm-cancel-window'] ?? null,
  };
}

// Cache the Memberstack member locally so the app can launch with NO data (offline floor).
// Consistent with the member id / FCM token / contact cache already stored in Preferences.
async function cacheMemberOffline(member) {
  try { if (member) await setPreference('cached_member', JSON.stringify(member)); } catch (e) {}
}
async function loadCachedMember() {
  try { const raw = await getPreference('cached_member'); return raw ? JSON.parse(raw) : null; }
  catch (e) { return null; }
}

async function initMemberstack() {
  const INTERVAL_MS = 200;
  // Returning users (cached session) fall back fast offline; first-run waits longer for the CDN SDK.
  const cached = await loadCachedMember();
  const deadline = Date.now() + (cached ? 3000 : 8000);

  while (Date.now() < deadline) {
    if (window.$memberstackDom) {
      ms = window.$memberstackDom;
      break;
    }
    await new Promise(r => setTimeout(r, INTERVAL_MS));
  }

  if (ms) {
    try {
      const result = await ms.getCurrentMember();
      currentMember = result?.data?.member ?? result?.data ?? null;
      if (currentMember) {
        memberConfig = buildMemberConfig(currentMember);
        cacheMemberOffline(currentMember);   // keep the offline copy fresh
      }
      return;   // SDK answered (member, or null = genuinely logged out) — authoritative
    } catch (e) {
      console.warn('[Init] getCurrentMember failed (offline?) — falling back to cached session', e);
    }
  }

  // Reached only if the SDK never loaded (offline) OR the session fetch threw (offline).
  // Launch from the cached member so the app renders and the device-dial floor works with no data.
  if (cached) {
    currentMember = cached;
    memberConfig = buildMemberConfig(cached);
    console.warn('[Init] launched from cached member (offline mode)');
    return;
  }

  // No SDK and no cached session (never signed in online) — genuine dead end.
  if (!ms) {
    show('screen-check');
    setMsg('msg-check', 'Something went wrong loading. Please reload and try again.');
    throw new Error('[Init] $memberstackDom unavailable and no cached session');
  }
}

async function checkSession() {
  if (!currentMember) {
    show('screen-login');
    return;
  }

  const airtableId = currentMember.customFields?.['airtable-id'];
  if (!airtableId || !airtableId.startsWith('rec')) {
    show('screen-login');
    console.error('[Session] airtable-id missing or malformed — showing sign-in');
    return;
  }

  await setPreference('member_airtable_id', airtableId);
  cacheMemberOffline(currentMember);   // store for offline launch
  memberConfig = buildMemberConfig(currentMember);

  await setupPush();
  show('screen-today');
  readAndApplyServiceState();  // US1 — reflect true paused state on Today load (fire-and-forget)
  // Cache refresh runs AFTER render — fire-and-forget, time-boxed, offline-safe — so it can
  // never delay or block launch. Offline it fails silently and the existing cache is used.
  refreshDeviceDialCache();
  refreshSignalAudioCache();  // feature 006 — Signal replica clip cache (fire-and-forget, offline-safe)
  // A device-dial cycle never survives a process restart (native — dies with the process). So if it
  // was marked active, the app was killed/closed mid-cycle: clear it and start clean. A fresh launch
  // must NEVER resume a device-dial cycle — it's a clean today-screen start.
  if (await getPreference('device_dial_active') === 'true') {
    await removePreference('device_dial_active');
    await setPreference('escalation_state', 'idle');
  }
  let savedEscState = await getPreference('escalation_state');
  if (savedEscState === 'active') {
    // Stale-screen reconcile (08 Jul): a killed app can miss the escalation-complete FCM and, on next
    // open, re-surface a FINISHED escalation's "calling your contacts" screen off the local flag. Don't
    // trust the flag — confirm against the server's single liveness authority before rendering.
    // _escalationConfirmedLive() already carries the 45-min local fast-path + a tight timeout + bias-to-
    // not-live on ANY uncertainty (server unreachable → not-live → idle), so a stale flag can never
    // strand a member on the calling surface, and a genuinely-live escalation still renders it.
    if (!(await _escalationConfirmedLive())) {
      await setPreference('escalation_state', 'idle');
      savedEscState = 'idle';
    }
  }
  if (savedEscState === 'active') {
    showEscalationActiveState();
  } else if (savedEscState === 'terminal') {
    // Restore the RIGHT terminal on reopen while it still holds (captain fix 2026-07-12): acknowledged
    // success vs exhausted, from the outcome persisted by handleEscalationComplete.
    if (await getPreference('escalation_terminal_outcome') === 'acknowledged') {
      showEscalationAcknowledgedState((await getPreference('escalation_terminal_name')) || '');
    } else {
      showTerminalState();
    }
  } else {
    setTimeout(() => { if (!launchedFromPush) showOrb(); }, 400);
  }
}

async function onLoginSuccess(member) {
  currentMember = member;

  const airtableId = member.customFields?.['airtable-id'];
  if (!airtableId || !airtableId.startsWith('rec')) {
    setMsg('msg-login-code', 'Your account isn\'t fully set up yet. Please contact support.');
    console.error('[Login] airtable-id missing or malformed:', member.customFields);
    return;
  }

  await setPreference('member_airtable_id', airtableId);
  cacheMemberOffline(member);   // store for offline launch
  memberConfig = buildMemberConfig(member);

  await setupPush();
  show('screen-today');
  readAndApplyServiceState();  // US1 — reflect true paused state on Today load (fire-and-forget)
  refreshDeviceDialCache();  // after render — fire-and-forget, time-boxed, offline-safe
  // A device-dial cycle never survives a process restart (native — dies with the process). So if it
  // was marked active, the app was killed/closed mid-cycle: clear it and start clean. A fresh launch
  // must NEVER resume a device-dial cycle — it's a clean today-screen start.
  if (await getPreference('device_dial_active') === 'true') {
    await removePreference('device_dial_active');
    await setPreference('escalation_state', 'idle');
  }
  let savedEscState = await getPreference('escalation_state');
  if (savedEscState === 'active') {
    // Stale-screen reconcile (08 Jul): a killed app can miss the escalation-complete FCM and, on next
    // open, re-surface a FINISHED escalation's "calling your contacts" screen off the local flag. Don't
    // trust the flag — confirm against the server's single liveness authority before rendering.
    // _escalationConfirmedLive() already carries the 45-min local fast-path + a tight timeout + bias-to-
    // not-live on ANY uncertainty (server unreachable → not-live → idle), so a stale flag can never
    // strand a member on the calling surface, and a genuinely-live escalation still renders it.
    if (!(await _escalationConfirmedLive())) {
      await setPreference('escalation_state', 'idle');
      savedEscState = 'idle';
    }
  }
  if (savedEscState === 'active') {
    showEscalationActiveState();
  } else if (savedEscState === 'terminal') {
    // Restore the RIGHT terminal on reopen while it still holds (captain fix 2026-07-12): acknowledged
    // success vs exhausted, from the outcome persisted by handleEscalationComplete.
    if (await getPreference('escalation_terminal_outcome') === 'acknowledged') {
      showEscalationAcknowledgedState((await getPreference('escalation_terminal_name')) || '');
    } else {
      showTerminalState();
    }
  } else {
    setTimeout(() => { if (!launchedFromPush) showOrb(); }, 400);
  }
}

function initSignIn() {
  const emailInput   = document.getElementById('login-email');
  const emailSection = document.getElementById('login-email-section');
  const codeSection  = document.getElementById('login-code-section');
  const otpBoxes     = Array.from(document.querySelectorAll('.otp-box'));
  const otpError     = document.getElementById('login-otp-error');
  let pendingEmail   = '';

  function getOtpValue() {
    return otpBoxes.map(b => b.value).join('');
  }

  function clearOtp() {
    otpBoxes.forEach(b => {
      b.value = '';
      b.classList.remove('filled', 'error');
    });
    otpError.classList.add('hidden');
  }

  async function verifyCode() {
    const token = getOtpValue();
    const email = pendingEmail;
    if (token.length < 6 || !email) return;
    try {
      const result = await ms.loginMemberPasswordless({
        email: email,
        passwordlessToken: token
      });
      await onLoginSuccess(result?.data?.member ?? result?.data ?? result);
    } catch (err) {
      otpBoxes.forEach(b => {
        b.value = '';
        b.classList.remove('filled');
        b.classList.add('error');
      });
      otpError.classList.remove('hidden');
      otpBoxes[0].focus();
    }
  }

  otpBoxes.forEach((box, i) => {
    box.addEventListener('input', (e) => {
      const digit = e.target.value.replace(/\D/g, '');
      e.target.value = digit ? digit[digit.length - 1] : '';
      if (e.target.value) {
        e.target.classList.add('filled');
        e.target.classList.remove('error');
        if (i < otpBoxes.length - 1) {
          otpBoxes[i + 1].focus();
        } else {
          verifyCode();
        }
      } else {
        e.target.classList.remove('filled');
      }
    });

    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) {
        otpBoxes[i - 1].value = '';
        otpBoxes[i - 1].classList.remove('filled');
        otpBoxes[i - 1].focus();
      }
    });
  });

  document.getElementById('btn-send-code').addEventListener('click', async () => {
    const email = emailInput.value.trim();
    if (!email) return;
    document.getElementById('msg-login-email').classList.add('hidden');
    try {
      await ms.sendMemberLoginPasswordlessEmail({ email });
      pendingEmail = email;
      document.getElementById('code-sent-email').textContent = email;
      clearOtp();
      emailSection.classList.add('hidden');
      codeSection.classList.remove('hidden');
      otpBoxes[0].focus();
    } catch (err) {
      console.error('[SignIn] sendMemberLoginPasswordlessEmail failed:', err);
      document.getElementById('msg-login-email').classList.remove('hidden');
      setMsg('msg-login-email', 'Couldn\'t send a code. Please check your email and try again.');
    }
  });

  document.getElementById('btn-verify-code').addEventListener('click', () => {
    verifyCode();
  });

  document.getElementById('btn-new-code').addEventListener('click', () => {
    clearOtp();
    codeSection.classList.add('hidden');
    emailSection.classList.remove('hidden');
    pendingEmail = '';
  });
}

function initLogout() {
  const confirmEl   = document.getElementById('logout-confirm');
  const accountMain = document.getElementById('account-main');

  // US5/T021 — toggle the in-sheet confirm. Cancel/back returns to the Account list unchanged.
  function showLogoutConfirm(show) {
    if (show) {
      accountMain.style.display = 'none';
      confirmEl.classList.add('is-open');
    } else {
      confirmEl.classList.remove('is-open');
      accountMain.style.display = '';
    }
  }

  // Sign out asks first — an accidental tap must not strand an older member out of the app.
  document.getElementById('btn-logout').addEventListener('click', () => showLogoutConfirm(true));
  document.getElementById('btn-logout-cancel').addEventListener('click', () => showLogoutConfirm(false));

  // Only the deliberate "Sign out" in the confirm actually logs out.
  document.getElementById('btn-logout-confirm').addEventListener('click', async () => {
    try {
      await ms.logout();
    } catch (err) {
      console.error('[Logout] ms.logout() failed:', err);
    }
    await removePreference('fcm_token');
    await removePreference('member_airtable_id');
    await removePreference('escalation_state');
    // Clear the offline session + device-dial caches so a logged-out / handed-over phone can't
    // cold-launch offline showing the previous user's screen or contacts (PII).
    await removePreference('cached_member');
    await removePreference('device_dial_contacts');
    await removePreference('device_dial_contacts_ts');
    await removePreference('device_dial_log_queue');
    currentMember = null;
    memberConfig  = null;
    showLogoutConfirm(false);  // reset the sheet for the next session
    document.getElementById('settings-overlay').classList.add('hidden');  // don't leave the sheet over login
    show('screen-login');
  });
}

// --- Section 4: Push registration (FCM listeners, register, backend POST) ---

let pushRegistrationPending = false;
let launchedFromPush = false;

function initPushListeners() {
  const { PushNotifications } = Capacitor.Plugins;

  PushNotifications.addListener('registration', async (token) => {
    if (!pushRegistrationPending) return;
    pushRegistrationPending = false;
    const newToken = token.value;
    const stored = await getPreference('fcm_token');
    if (newToken !== stored) {
      await setPreference('fcm_token', newToken);
      const airtableId = await getPreference('member_airtable_id');
      await registerTokenWithBackend(newToken, airtableId);
    }
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.error('[Push] Registration error:', JSON.stringify(err));
    setMsg('msg-today-warning', 'Device registration incomplete — please restart the app.');
    document.getElementById('msg-today-warning').classList.remove('hidden');
  });

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    const type = notification.data?.type;
    if (type === 'scheduled_contact' || type === 'reminder_1' || type === 'reminder_2') {
      showTodayMessage(notification.body ?? notification.notification?.body ?? null, notification.data);
    } else if (type === 'escalation_started') {
      // Feature 010 P3c — ONE push type, TWO moments. The engine marks a no-response activation
      // (`trigger:'no_response'`) because only it knows the member's window is still open and nothing is
      // dialling yet: that gets the activation screen (Amendment 3). Everything else — a member-initiated
      // alert, or any pre-010 push with no marker — keeps the original behaviour byte-for-byte, so the
      // reactive path and older senders are untouched.
      if (notification.data?.trigger === 'no_response' && notification.data?.cancel_window) {
        _startSilenceActivation(notification.data);
      } else {
        // Proactive escalation entry. Mark the escalation active — mirrors the reactive commitEscalation
        // path — so handleEscalationComplete's `savedState === 'active'` gate passes and the terminal card
        // renders for a PROACTIVE escalation too (fixes the "stuck on Calling your contacts" gap).
        setPreference('escalation_state', 'active');
        setPreference('escalation_state_ts', String(Date.now()));
        showEscalationActiveState();
        _maxVolumeNow();   // 009 Story 4 — loud from word one for a FOREGROUND proactive escalation (cold-wake = T018/native)
        _activeRunToken = notification.data?.run_token || null;   // Feature 010 — carry the run_token for a later cancel POST
        signalAudioStarted(notification.data);   // feature 006 — begin the Signal audio replica (Iona handover)
      }
    } else if (type === 'escalation_complete') {
      handleEscalationComplete(notification.data);
      signalAudioComplete(notification.data);   // feature 006 — spoken terminal (ack / exhausted)
      // 009 (R-009-20/21) — the escalation resolved WITHOUT a join (a hands-free accept holds → this never
      // fires; so reaching this with a pre-armed 'armed' bridgeAttempt means exhausted/no-accept). Drop the
      // dormant pre-arm so it can't leak into the next summon (a genuine join set state to 'in_call', which
      // this guard skips).
      if (bridgeAttempt && bridgeAttempt.state === 'armed') _clearBridgeAttempt();
    } else if (type === 'escalation_advance') {
      signalAudioAdvance(notification.data);     // feature 006 — per-attempt narration + channel-gated ring
    } else if (type === 'bridge_contact_joined' || type === 'bridge_join_confirmed') {
      // 009 T008 — 'bridge_join_confirmed' is the split's honest connected moment (member joined + contact
      // ADMITTED by the server; R5). It carries the call-plumbing half of R5 here — everConnected, the
      // connect-anchored 9/10-min teardown timers, in_call — reusing the proven bridge_contact_joined path.
      // (The reducer chip-settle + 007 screen-freeze are Phase 4, T013 — expected gaps at this seam.) The
      // legacy 'bridge_contact_joined' arm is retained until Phase 6 strips it; the server no longer sends it.
      _ensureBridgeAttemptForJoin(notification.data?.conference_name);   // R-009-27 FIX A
      if (bridgeAttempt && bridgeAttempt.state !== 'idle' && bridgeAttempt.state !== 'in_call') {
        _clearJoinConfirmTimeout();           // R-009-34 FIX H (belt) — join confirmed → disarm the watchdog
        _clearRingTimer();
        bridgeAttempt.everConnected = true;   // connected wins — the reaching sweep is resolved
        bridgeAttempt.connectedContactFirst = (notification.data?.contact_first || '').trim();  // 009 T016 — carry the name to the dropped terminal
        bridgeAttempt.connectedContactPhone = (notification.data?.contact_phone || '').trim();  // 009 R-009-22 — capture at join-confirmed
        _setBridgeState('in_call');
        _hideStopControl();                       // Feature 010 — press-1 locks the cancel: a live bridge is never half-cancelled
        _saJoined();                              // 009 T013 — reducer → joined (device silent; conversation is the audio)
        escalationScreenComplete({ outcome: 'acknowledged' });   // 009 T013 — settle the accepted chip ✓ (007 mirror)
        logBridgeEvent('BRIDGE_CONNECTED', { contact_index: bridgeAttempt.currentIndex });
        // R-009-29 Directive B — the post-join Participants-Announce is RETIRED; "Connecting with {name}" now
        // plays as a LOCAL PRE-JOIN clip at join_pending (before the bridge connects). No in-call announce here.
        _startBridgeCallTimers();    // connect-anchored 9-min warning + 10-min hard end
      }
    } else if (type === 'bridge_join_trigger') {
      // 009 T008/T011/T013 — the server held the accepting contact OUTSIDE the room and fired this join-trigger:
      // place the member leg INTO the pushed conference NOW (push-authoritative room — R4). The held contact is
      // admitted on the member-join participant event (server authority), then bridge_join_confirmed lands.
      // T013: enter join_pending — STOP the device reaching audio (the existing server-side "Connecting with
      // {name}" connect line into the joining leg is the join announce, R-009-16/R-009-19) and FREEZE the chips
      // (accepted → connecting, others frozen honest).
      const _jtConf = notification.data?.conference_name || null;
      console.log('[009] bridge_join_trigger received conf=' + (_jtConf || '(none)'));
      // R-009-29 FIX F (app guard) — a STALE/late join_trigger (delayed FCM: airplane / slow-backgrounded) that
      // arrives AFTER the join already resolved to a terminal (bridge_join_failed→join_failed, or a drop→dropped)
      // must NOT place the member into a now-dead room. Skip. Covers the failed-first FCM ordering; the server
      // /twiml/conference hangup (FIX F) covers trigger-first.
      if (_saState.joinPhase === 'join_failed' || _saState.joinPhase === 'dropped') {
        console.warn('[009] bridge_join_trigger IGNORED — join already terminal (' + _saState.joinPhase + '); not joining a dead room (FIX F)');
        return;
      }
      _ensureBridgeAttemptForJoin(_jtConf);   // R-009-27 FIX A — reconstruct if the pre-arm lost the /pwa-status race
      if (bridgeAttempt && bridgeAttempt.state !== 'idle') {
        bridgeAttempt.state = 'join_pending';
        bridgeAttempt.joinedConference = _jtConf;   // 009 — the SERVER-minted room the member actually joins (≠ the app-minted conferenceId)
        _saJoinPending();                 // T013 + R-009-31 #14(b) — device goes quiet; the connect line rides the join leg (server <Say>)
        escalationScreenFreeze();         // T013 — accepted chip stays connecting, others frozen
        _joinConference(_jtConf);
        _armJoinConfirmTimeout(notification.data?.contact_first);   // R-009-34 FIX H (belt) — never dangle if no confirm/fail lands
      } else {
        console.warn('[009] bridge_join_trigger with no active bridgeAttempt — ignoring');
      }
    } else if (type === 'bridge_join_failed') {
      // 009 T013/T015 — the 8s boundary closed the held contact before the member device joined. A contact
      // ANSWERED and accepted (N4: "answered and knows you need help") but the join didn't land in the window —
      // so this is NOT re-escalation: speak the local failed_join clip (T013) and render the N4 failed-join
      // card (T015: the 008 dropped-card shell, failed-join copy, device-dial primary + I-NEED-HELP floor).
      // The honest EventLog row + contact-side graceful close are already server-side (R-009-18).
      console.log('[009] bridge_join_failed received — N4 failed-join card');
      _clearJoinConfirmTimeout();             // R-009-34 FIX H (belt) — server drove the failed-join → disarm
      _clearRingTimer();
      _ensureBridgeAttemptForJoin(notification.data?.conference_name);   // R-009-27 FIX A — render N4 even if the pre-arm was missing
      if (bridgeAttempt && bridgeAttempt.state !== 'idle' && bridgeAttempt.state !== 'in_call') {
        const _fjName = (notification.data?.contact_first || '').trim();
        const _fjPhone = (notification.data?.contact_phone || '').trim();   // R-009-22 — for the "Call {name}" action
        _saJoinFailed(_fjName);                     // T013 — speak the N4 line (local clip, offline-safe)
        _showFailedJoinTerminal(_fjName, _fjPhone); // T015 + R-009-22 — render the N4 card with "Call {name}"
      }
    }
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const type = action.notification?.data?.type;
    if (type === 'scheduled_contact' || type === 'reminder_1' || type === 'reminder_2') {
      launchedFromPush = true;
      showTodayMessage(action.notification?.body ?? action.notification?.notification?.body ?? null, action.notification?.data);
    } else if (type === 'escalation_started') {
      // Feature 010 P3c — same two-moment fork as the received handler above (see there for the reasoning).
      if (action.notification?.data?.trigger === 'no_response' && action.notification?.data?.cancel_window) {
        _startSilenceActivation(action.notification.data);
      } else {
        // Proactive escalation entry. Mark the escalation active — mirrors the reactive commitEscalation
        // path — so handleEscalationComplete's `savedState === 'active'` gate passes and the terminal card
        // renders for a PROACTIVE escalation too (fixes the "stuck on Calling your contacts" gap).
        setPreference('escalation_state', 'active');
        setPreference('escalation_state_ts', String(Date.now()));
        showEscalationActiveState();
        _maxVolumeNow();   // 009 Story 4 — loud from word one for a FOREGROUND proactive escalation (cold-wake = T018/native)
        _activeRunToken = action.notification?.data?.run_token || null;   // Feature 010 — carry the run_token for a later cancel POST
        signalAudioStarted(action.notification?.data);   // feature 006 — begin the Signal audio replica
      }
    } else if (type === 'escalation_complete') {
      handleEscalationComplete(action.notification?.data);
      signalAudioComplete(action.notification?.data);   // feature 006 — spoken terminal
      if (bridgeAttempt && bridgeAttempt.state === 'armed') _clearBridgeAttempt();   // 009 — drop a never-joined pre-arm
    } else if (type === 'escalation_advance') {
      signalAudioAdvance(action.notification?.data);     // feature 006 — per-attempt narration + channel-gated ring
    } else if (type === 'bridge_contact_joined') {
      if (bridgeAttempt && bridgeAttempt.state !== 'idle' && bridgeAttempt.state !== 'in_call') {
        _clearRingTimer();
        bridgeAttempt.everConnected = true;   // connected wins — the reaching sweep is resolved
        _setBridgeState('in_call');
        logBridgeEvent('BRIDGE_CONNECTED', { contact_index: bridgeAttempt.currentIndex });
        // R-009-29 Directive B — the post-join Participants-Announce is RETIRED; "Connecting with {name}" now
        // plays as a LOCAL PRE-JOIN clip at join_pending (before the bridge connects). No in-call announce here.
        _startBridgeCallTimers();    // connect-anchored 9-min warning + 10-min hard end
      }
    } else {
      show('screen-today');
    }
  });
}


// ── Single backend base — every webhook call reads this (register-token · pwa-status · pwa-respond ·
// pwa-escalation-live · eventlog). Centralized so the production cutover (VPS migration) is a one-line flip.
// /eventlog lives on the webhook (:8080) → ngrok only (the Cloudflare tunnel serves the portal proxy :8081).
const STATUS_BASE = 'https://ferris-causing-shed.ngrok-free.dev';

async function registerTokenWithBackend(token, airtableId) {
  try {
    const res = await fetch(`${STATUS_BASE}/register-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({ token, member_id: airtableId }),
    });
    if (!res.ok) {
      throw new Error('HTTP ' + res.status);
    }
  } catch (err) {
    console.error('[Push] registerTokenWithBackend failed:', err);
    setMsg('msg-today-warning', 'Setup incomplete — your device may not receive contacts. Please restart the app.');
    document.getElementById('msg-today-warning').classList.remove('hidden');
  }
}

async function setupPush() {
  // Never fatal to launch — a push failure (e.g. offline) must not stop the app rendering.
  try {
    const { PushNotifications } = Capacitor.Plugins;

    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') {
      console.error('[Push] Permission not granted:', permission.receive);
      setMsg('msg-today-warning', 'Push notifications are off — some features won\'t work.');
      document.getElementById('msg-today-warning').classList.remove('hidden');
      return;
    }

    pushRegistrationPending = true;
    await PushNotifications.register();
  } catch (e) {
    console.warn('[Push] setup failed (offline?) — continuing without push:', e);
  }
}

// ═══════════════════════ Alarm surface arbiter (safety) ═══════════════════════
// RULE: the alarm surface ALWAYS wins the screen. On any alarm-state entry (cancel window ·
// escalation · incoming bridge) — and, behind a flag, in-app message delivery — every overlay is
// closed and we land on the Today/alarm surface. The cancel window especially MUST be seen so a
// false trigger can be stopped. ONE arbiter, no per-screen listeners: closeable surfaces register a
// closer; takeover() walks the registry (tolerating already-closed) then shows Today. Future screens
// inherit by registering their closer. Takeover changes what is on screen — it never interrupts an
// in-flight optimistic save (those settle in the background as normal).
const _alarmSurfaceClosers = [];
function registerAlarmSurface(closer) { if (typeof closer === 'function') _alarmSurfaceClosers.push(closer); }

// The current closeable surfaces: the Settings overlay + the three mirror full-screens. Each closer
// just hides its element (idempotent). A future screen adds one id to this list (or its own register).
['settings-overlay', 'screen-contacts', 'screen-schedule', 'screen-service-delivery', 'screen-logs'].forEach(function (id) {
  registerAlarmSurface(function () { const el = document.getElementById(id); if (el) el.classList.add('hidden'); });
});

// Tier 2 (owner recommendation, pending confirm): in-app message delivery also takes the screen — an
// unanswered message IS the escalation trigger, so one buried behind a mirror screen causes false
// family alarms. Flip to false to strike tier 2 without touching the call site.
const ALARM_TIER2_MESSAGE_TAKEOVER = true;

// Idempotent hard takeover — safe to call twice / when already on Today. reason is logged only.
function alarmSurfaceTakeover(reason) {
  for (let i = 0; i < _alarmSurfaceClosers.length; i++) { try { _alarmSurfaceClosers[i](); } catch (e) {} }
  try { show('screen-today'); } catch (e) {}   // clears every .screen mirror view + lands on the alarm surface
  try { console.log('[ALARM] surface takeover —', reason); } catch (e) {}
}

// --- Section 5: Alarm (constants, tone, countdown, cancel, commit, terminal) ---

const ALARM_CANCEL_WINDOW_SECONDS = 10;

// True while the help/alarm flow owns the Today screen (cancel window · escalation · bridge ·
// device dial · terminal). OKAY THANKS must stay hidden for ALL plans during this. Set by every
// alarm-state entry, cleared only on return to the resting Today screen. Guards the context-blind,
// plan-based OKAY reveal in _applyBeaconOkayGate (which runs on launch fire-and-forget read,
// foreground visibilitychange, settings open/close) from un-hiding OKAY mid-alarm. The bug was
// non-Beacon-only because on Beacon OKAY is permanently plan-hidden so the reveal never fired.
let _alarmFlowActive = false;

function getCancelWindowSeconds(config) {
  return config?.alarmCancelWindow ?? ALARM_CANCEL_WINDOW_SECONDS;
}

function showCancelWindowState() {
  _alarmFlowActive = true;
  _disarmHelpButton();   // ruling 4 — the armed state never outlives the screen it belongs to. Belt to
                         // the handler's own disarm: this window can also be raised by the orb, the Flic
                         // or a silence push while the help button happens to sit armed behind it.
  alarmSurfaceTakeover('cancel-window');   // sharpest case — the countdown MUST be seen to stop a false trigger
  hideOrb();
  document.getElementById('today-empty').classList.add('hidden');
  document.getElementById('today-thread').classList.add('hidden');
  document.getElementById('alarm-escalation-card').classList.add('hidden');
  document.getElementById('alarm-terminal-card').classList.add('hidden');
  document.getElementById('bridge-card').classList.add('hidden');
  const _warnEl = document.getElementById('msg-today-warning');
  _warnEl.classList.add('hidden');
  _warnEl.textContent = '';
  _warnEl.style.cursor = '';
  document.getElementById('alarm-countdown-num').textContent = escalationCountdownValue;
  document.getElementById('alarm-countdown-card').classList.remove('hidden');
  document.getElementById('btn-okay').classList.add('hidden');
  document.getElementById('btn-okay').classList.remove('btn--pulse');
  document.getElementById('btn-alert').classList.add('hidden');
  document.getElementById('btn-alert').classList.remove('btn--pulse');
  document.getElementById('btn-cancel').classList.remove('hidden');
  document.getElementById('btn-alarm-done').classList.add('hidden');
}

// --- Shared "calling your contacts" screen (escalation · bridge · device dial) ---
// One layout, method-aware STATUS vocabulary. Each row shows: position, name, phone, status.
// Renders into the shared #alarm-escalation-card / #alarm-contacts-list container.
const CALLING_VOCAB = {
  // escalation (007) — the live Signal screen: channel-honest active + per-outcome resolved states.
  escalation:  { waiting: 'Waiting', active: 'Ringing', active_sms: 'Sending a text…',
                 voicemail: 'Voicemail left', text_sent: 'Text sent', declined: 'Unable to assist',
                 called: 'Called', noanswer: 'No answer', reached: 'Reached' },
  bridge:      { waiting: 'Waiting', active: 'Ringing…',    noanswer: 'No answer', reached: 'Connected'    },
  device_dial: { waiting: 'Waiting', active: 'Ringing…',    noanswer: 'No answer', reached: 'Reached', called: 'Called' },
};
// Colour rule (007, captain-signed): amber = Oran — the live pulse AND every resolved outcome (voicemail /
// text / unable-to-assist / called); grey = not-yet-started or rang-out (no answer); teal = reached. Maps to the
// existing dot/text classes: 'trying' = amber (--amber-500), 'waiting' = grey (--border-soft), 'done' = teal.
const CALLING_DOT = { waiting: 'waiting', active: 'trying', active_sms: 'trying',
                      voicemail: 'trying', text_sent: 'trying', declined: 'trying', called: 'trying',
                      noanswer: 'waiting', reached: 'done' };

let _callingMethod = 'escalation';
let _callingContacts = [];

function _fmtContactPhone(p) {
  return String(p || '').replace(/\s+/g, ' ').trim();
}

// 007 — "Oran's Promise" row (the signed mockup design): avatar + name + N-of-M + an outcome chip.
// amber pulse orb on the active CALL (the live pulse), teal active label, amber resolved outcomes, teal tick
// on reached, grey for waiting / no-answer. Escalation only.
function _callingRowHTMLOran(c, i, total, state) {
  const vocab = CALLING_VOCAB.escalation;
  const dot = CALLING_DOT[state] || 'waiting';
  const text = vocab[state] || vocab.waiting;
  const isLive = (state === 'active' || state === 'active_sms');
  const tone = isLive ? 'live' : (dot === 'trying' ? 'amber' : dot === 'done' ? 'reached' : 'muted');
  // R006 cosmetics (captain-directed): FIRST NAME ONLY on the row — the surname caused a wrap; the audio
  // and the log already speak in first names, so the screen matches.
  const firstName = String(c.name || 'Contact').trim().split(/\s+/)[0] || 'Contact';
  const initial = (firstName.charAt(0) || 'C').toUpperCase();
  const orb = (state === 'active') ? '<span class="oran-orb"></span>' : '';   // pulse only on a live CALL (no ring on SMS)
  const tick = (state === 'reached') ? '<span class="oran-tick">✓</span> ' : '';
  return `
      <div class="oran-av${state === 'active' ? ' oran-av--live' : ''}">${initial}</div>
      <div class="oran-who">
        <div class="oran-nm">${firstName}</div>
        <div class="oran-pos">${i + 1} of ${total}</div>
      </div>
      <div class="oran-status oran-status--${tone}">${orb}${tick}${text}</div>`;
}

function _callingRowHTML(c, i, total, method, state) {
  if (method === 'escalation') return _callingRowHTMLOran(c, i, total, state);
  const vocab = CALLING_VOCAB[method] || CALLING_VOCAB.escalation;
  const dot = CALLING_DOT[state] || 'waiting';
  const text = vocab[state] || vocab.waiting;
  // 007 — an escalation "in-progress" state shows an amber ORB (the --trying pulse-dot) but a TEAL label:
  // amber text is reserved for Oran's resolved outcomes + the pulse, not the "Ringing/Sending a text" label.
  // Escalation-scoped so the bridge/device-dial screens are untouched.
  const live = method === 'escalation' && (state === 'active' || state === 'active_sms');
  const statusCls = live ? ' alarm-contact-status--live'
                  : dot === 'trying' ? ' alarm-contact-status--trying'
                  : dot === 'done'  ? ' alarm-contact-status--done' : '';
  const phone = c.phone ? `<div class="alarm-contact-phone">${_fmtContactPhone(c.phone)}</div>` : '';
  return `
      <div class="alarm-dot alarm-dot--${dot}"></div>
      <div class="alarm-contact-meta">
        <div class="alarm-contact-name">${c.name || 'Contact'}</div>
        ${phone}
      </div>
      <div class="alarm-contact-right">
        <div class="alarm-contact-pos">${i + 1} of ${total}</div>
        <div class="alarm-contact-status${statusCls}">${text}</div>
      </div>`;
}

// activeIndex: contact currently being tried (rows before it = noanswer, after = waiting).
// reachedIndex: a contact that was reached/connected (overrides that row to 'reached').
function renderCallingScreen({ method = 'escalation', label = 'Calling your contacts', sublabel = '',
                              contacts = [], activeIndex = -1, reachedIndex = -1 } = {}) {
  _callingMethod = method;
  _callingContacts = contacts;
  const _card = document.getElementById('alarm-escalation-card');
  if (_card) _card.classList.toggle('alarm-escalation-card--oran', method === 'escalation');   // 007 mockup design (escalation only)
  const _lbl = document.getElementById('alarm-esc-label');
  _lbl.textContent = label;
  // 007 — the escalation capability is named "Oran's Promise": amber + title-case (escalation only; the
  // bridge/device-dial screens keep the plain uppercase label).
  _lbl.classList.toggle('alarm-esc-label--oran', method === 'escalation');
  const _sub = document.getElementById('alarm-esc-sub');
  if (_sub) { _sub.textContent = sublabel || ''; _sub.hidden = !sublabel; }
  const list = document.getElementById('alarm-contacts-list');
  list.innerHTML = '';
  const total = contacts.length;
  if (total === 0) {
    // Never show an empty calling card (e.g. bridge 'summoning' before contacts load, or a
    // fallback takeover). The card appears once there are real contacts to show.
    document.getElementById('alarm-escalation-card').classList.add('hidden');
    return;
  }
  contacts.forEach((c, i) => {
    let state;
    if (i === reachedIndex) state = 'reached';
    else if (activeIndex < 0) state = 'waiting';
    else if (i < activeIndex) state = (method === 'device_dial') ? 'called' : 'noanswer';
    else if (i === activeIndex) state = 'active';
    else state = 'waiting';
    const row = document.createElement('div');
    row.className = 'alarm-contact-row';
    row.dataset.index = String(i);
    row.innerHTML = _callingRowHTML(c, i, total, method, state);
    list.appendChild(row);
  });
  document.getElementById('alarm-escalation-card').classList.remove('hidden');
  // BONUS cache top-up: if these contacts carry real numbers (bridge / device dial), refresh
  // the offline device-dial cache opportunistically. Escalation rows (no phone) are skipped.
  writeDeviceDialCache(contacts);
}

// Live single-row update — for native / FCM progress without a full re-render.
function setContactStatus(index, state) {
  const row = document.querySelector(`#alarm-contacts-list .alarm-contact-row[data-index="${index}"]`);
  const c = _callingContacts[index];
  if (!row || !c) return;
  row.innerHTML = _callingRowHTML(c, index, _callingContacts.length, _callingMethod, state);
  // Captain polish addendum (13 Jul): with up to SIX contacts the list scrolls — on each advance the
  // ACTIVE card auto-scrolls into view so the live attempt is never off-screen. 'nearest' is a no-op
  // when already visible (short lists unchanged). Best-effort, never disturbs the escalation.
  if (state === 'active' || state === 'active_sms') {
    try { row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* best-effort */ }
  }
}

// --- 007: live "calling your contacts" screen mirror ---------------------------------------------------------
// Consumes the SAME escalation_advance/complete signals as the Signal audio, but runs for EVERYONE (Q2 — a
// hands-free member who fell back to Iona escalation still gets the honest visual; the AUDIO stays Signal-only).
// The signal carries the RAW econtact slot index (0-5, may have gaps); the screen rows are DENSE (0..N-1). Both
// the dial sequence and the render are in ascending slot order, so mapping raw→dense by order-of-first-sighting
// is exact and gap-proof: the k-th distinct contact the escalation dials is dense row k. Best-effort UI — every
// path is guarded and can never disturb the escalation.
let _escScreenRun = null;   // current run token — a new run resets the slot→row map
let _escSlotToRow = {};     // raw econtact_index -> dense screen row
let _escLastRow = -1;       // last row shown active — the contact an 'acknowledged' terminal resolves to 'Reached'
let _escRowGate = {};       // R009 run-2 R2: row -> {seq, rank} ordering guard (see escalationScreenAdvance)
let _escScreenSettled = false;   // #5 ruling: the run's complete SETTLES the mirror — no later paint may touch it
const _ESC_OUTCOME_STATE = { voicemail: 'voicemail', sms_sent: 'text_sent', declined: 'declined', no_answer: 'noanswer' };
function escalationScreenReset(runToken) { _escScreenRun = runToken || null; _escSlotToRow = {}; _escLastRow = -1; _escRowGate = {}; _escScreenSettled = false; }
function _escScreenRow(rawIndex) {
  if (rawIndex == null || rawIndex < 0) return -1;
  if (!(rawIndex in _escSlotToRow)) _escSlotToRow[rawIndex] = Object.keys(_escSlotToRow).length;
  return _escSlotToRow[rawIndex];
}
function escalationScreenAdvance(data) {
  try {
    if (!data) return;
    const runToken = data.run_token || null;
    if (runToken && runToken !== _escScreenRun) escalationScreenReset(runToken);   // new run → fresh map
    // #5 ruling (R009 final matrix) — the complete SETTLES the screen: a straggler ended landing AFTER the
    // terminal (trace-proven on the fast-ack run: 'complete oc=acknowledged' then 'ended oc=no_answer' 1.1s
    // later — same family as the R2 SMS race) must never repaint a settled chip ("Reached ✓" → "No answer").
    // A NEW run resets via the token branch above, so this only freezes the finished run's rows.
    if (_escScreenSettled) return;
    const row = _escScreenRow(parseInt(data.contact_index ?? '-1', 10));
    if (row < 0) return;
    if (data.phase === 'amd') return;   // R005 — the AMD moment is an audio beat; the chip resolves on the ended outcome (engine truth)
    // R009 run-2 R2 — ordering guard. The SMS attempt emits dialing + ended in the SAME instant from two
    // racing threads, and FCM guarantees no order: an ended-before-dialing delivery painted "Text sent"
    // for a frame, then the dialing overwrote it back to "Sending a text…" forever (the stuck chip).
    // Rule: per row, a signal applies only if (attempt_seq, rank) is not older than the last applied —
    // rank: ended(2) outranks dialing(1) within one attempt; a HIGHER attempt_seq (the sweep-2 re-dial of
    // the same contact) always applies, so supersession keeps working. Legacy signals without attempt_seq
    // apply unguarded.
    const seq = parseInt(data.attempt_seq ?? '-1', 10);
    const rank = data.phase === 'ended' ? 2 : 1;
    if (seq >= 0) {
      const g = _escRowGate[row];
      if (g && (seq < g.seq || (seq === g.seq && rank < g.rank))) return;   // stale / reordered — never downgrade
      _escRowGate[row] = { seq, rank };
    }
    if (data.phase === 'ended') {
      // resolved — the per-contact outcome (unknown/None → neutral "Called", never a WRONG claim, FR-010)
      setContactStatus(row, _ESC_OUTCOME_STATE[data.outcome] || 'called');
    } else {
      // dialing — channel-honest active (never "Ringing" on a text)
      _escLastRow = row;
      setContactStatus(row, (data.channel === 'sms') ? 'active_sms' : 'active');
    }
  } catch (e) { /* best-effort UI — swallow */ }
}
function escalationScreenComplete(data) {
  try {
    // #5 ruling — paint the acknowledged contact "Reached ✓" THEN settle the whole mirror: the run is
    // over, the chips now show engine-final truth, and no straggler advance may repaint them (the
    // trace-proven late 'ended oc=no_answer' overwrite). New-run signals reset via the token branch.
    if (data && data.outcome === 'acknowledged' && _escLastRow >= 0) setContactStatus(_escLastRow, 'reached');
    _escScreenSettled = true;
  } catch (e) { /* best-effort UI — swallow */ }
}

// 009 (T013) — a hands-free contact accepted (via the bridge_join_* pushes, not escalation_complete). FREEZE
// the mirror at join_pending: the accepted contact's chip stays 'active' (reads as connecting), every other
// contact's honest state is frozen (no straggler advance repaints it). The 'reached ✓' settle lands at
// join-confirmed via escalationScreenComplete({outcome:'acknowledged'}).
function escalationScreenFreeze() {
  try { _escScreenSettled = true; } catch (e) { /* best-effort UI — swallow */ }
}

function showEscalationActiveState() {
  _alarmFlowActive = true;
  alarmSurfaceTakeover('escalation');   // escalation in progress — close any overlay/mirror on top
  // Backstop: if the outcome FCM is lost, escalation-active never ends → the button would be stuck.
  // Arm a self-heal (feature 005 / captain-approved). The outcome FCM remains the real closer.
  _clearEscalationSelfHealTimer();
  _escalationSelfHealTimer = setTimeout(_escalationSelfHeal, ALARM_ESCALATION_TIMEOUT_MS);
  show('screen-today');
  playArrivalPing();
  hideOrb();
  document.getElementById('today-empty').classList.add('hidden');
  document.getElementById('today-thread').classList.add('hidden');
  document.getElementById('alarm-countdown-card').classList.add('hidden');
  document.getElementById('alarm-terminal-card').classList.add('hidden');
  document.getElementById('bridge-card').classList.add('hidden');
  // Contacts: use the device-dial cache (the Airtable-mirrored source — the SAME contacts the escalation
  // actually calls and the Signal audio names), so the screen shows the real emergency contacts and NEVER
  // the account holder. Async Preferences read → render as soon as it resolves; empty on a cold cache
  // (better than the wrong contact). (feature 006 — closes the Memberstack-source coherence gap, ADD-006-2.)
  getDeviceDialContacts().then((dd) => {
    const contacts = (Array.isArray(dd) ? dd : []).map(c => ({ name: c.name, phone: c.phone || '' }));
    renderCallingScreen({ method: 'escalation', label: "Oran's Promise", sublabel: 'Oran is reaching your contacts', contacts });
  }).catch(() => {
    renderCallingScreen({ method: 'escalation', label: "Oran's Promise", sublabel: 'Oran is reaching your contacts', contacts: [] });
  });
  document.getElementById('btn-okay').classList.add('hidden');
  document.getElementById('btn-okay').classList.remove('btn--pulse');
  document.getElementById('btn-alert').classList.add('hidden');
  document.getElementById('btn-alert').classList.remove('btn--pulse');
  document.getElementById('btn-cancel').classList.add('hidden');
  // No exit button while contacts are actively being called — matches the bridge dialing/in-call
  // screens (④/⑤), which present no buttons during the active phase. The exit (Return to Iona) lives
  // on the TERMINAL screen (③) once the escalation has finished.
  document.getElementById('btn-alarm-done').classList.add('hidden');
  _showStopControl();   // Feature 010 — Phase-2 nav-locking cancel control on Oran's Promise
}

/* ── Feature 010 — Phase-2 cancel control (both modes). Two-step (tap → confirm) over a LOCKED nav;
   hidden the instant a contact presses 1 (a live bridge is never half-cancelled). "Yes, stop" POSTs
   /pwa-respond {response:'cancel'} — the engine treats a post-dial cancel as an acknowledge (halts the
   sweep). Copy is placeholder (owner-reserved). ── */
let _activeRunToken = null;   // set from escalation_started; carried on the cancel POST for instance-scoping
/* ── Feature 010 window authority (captain ruling 19 Jul — the four laws) ─────────────────────────
   Set ONLY by collision B: a member-raised button window is live on screen when a silence
   escalation_started arrives underneath it. The engine's absolute dial moment (device-clock ms) is
   ADOPTED into the window already showing, rather than a second window being opened over it (law 1).
   Null whenever no adoption is in force — which is every case except that collision.
   Read by the button countdown tick, which floors its own value against it: the adopted deadline can
   only ever SHORTEN the visible window, never extend it. Both directions are honesty requirements —
   showing time past the engine's dial is the screen-lies failure the anchoring work was ratified to
   kill, and showing time past the button window's own zero would outlive the member's own commit. ── */
let _adoptedEngineDeadlineAt = null;
let _stopWired = false;
function _lockNav(locked) {
  const nav = document.querySelector('.today-nav');
  if (nav) nav.classList.toggle('nav-locked', !!locked);
}
async function postAlarmCancel() {
  const fcmToken = await getPreference('fcm_token');
  if (!fcmToken) return false;
  try {
    const res = await fetch(`${STATUS_BASE}/pwa-respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({ fcm_token: fcmToken, response: 'cancel', run_token: _activeRunToken || '' }),
    });
    return res.ok;
  } catch (e) { console.warn('[Alarm] cancel POST failed:', e); return false; }
}
function _hideStopControl() {
  const ctl = document.getElementById('alarm-stop-control');
  if (ctl) ctl.classList.add('hidden');
  const cf = document.getElementById('alarm-stop-confirm');
  if (cf) cf.classList.add('hidden');
  _lockNav(false);
}
function _showStopControl() {
  const ctl = document.getElementById('alarm-stop-control');
  const bar = document.getElementById('btn-stop-calling');
  const confirm = document.getElementById('alarm-stop-confirm');
  if (!ctl || !bar || !confirm) return;
  confirm.classList.add('hidden');
  bar.classList.remove('hidden');
  ctl.classList.remove('hidden');
  _lockNav(true);   // navigation locks — the two-step cancel (or a resolution) is the only way off
  if (!_stopWired) {
    _stopWired = true;
    bar.addEventListener('click', () => { bar.classList.add('hidden'); confirm.classList.remove('hidden'); });
    document.getElementById('btn-stop-keep').addEventListener('click', () => {
      confirm.classList.add('hidden'); bar.classList.remove('hidden');
    });
    document.getElementById('btn-stop-yes').addEventListener('click', async () => {
      _hideStopControl();
      _saCancelledLocal();           // silence the narration AT THE TAP (no wait for the complete push)
      _restoreVolumeNow();           // the alarm is over — hand the volume back
      await postAlarmCancel();       // engine halts the sweep (post-dial cancel → existing acknowledge machinery)
      showAlarmIdleReset();
    });
  }
}

/* RULING 2026-07-21 — THE CANCEL CONTROL MUST NEVER APPEAR ON ANY TERMINAL CARD.
   The single reveal point for the one shared terminal card (#alarm-terminal-card). Revealing the card and
   tearing down the live-calling controls are now ONE act, so they cannot drift apart: a terminal card
   physically cannot be drawn with the stop control still up, and a future terminal cannot forget the
   teardown, because showing the card IS the teardown.

   Chosen over a per-card teardown deliberately. The defect existed precisely because showSuccessTerminal
   (the shared success card, v5.20) and showBridgeTerminalState (008/009) were written BEFORE the 010
   control and never learned it existed — they each carefully hid the older btn-cancel and knew nothing of
   this one. Leaving three sites to each remember is the same trap as the §22 four-site copy-sync line, and
   it is the trap that produced this bug. The choke point also swept up a FIFTH terminal card
   (_showServiceTestTerminal) that the Step 0 source pass had missed — which is the argument for it in one
   sentence.

   _hideStopControl() also unlocks the nav (_lockNav(false)); both belong to the live calling state and
   neither belongs to a terminal, which is why the member could not reach Settings from the stuck card. */
function _showTerminalCard() {
  _hideStopControl();
  document.getElementById('alarm-terminal-card').classList.remove('hidden');
}

function showTerminalState() {
  // Teardown is owned by _showTerminalCard() below — one authority, no second writer. (Was an explicit
  // _hideStopControl() here; the exhausted card was the ONLY terminal that had it.)
  _alarmFlowActive = true;
  show('screen-today');
  hideOrb();
  document.getElementById('today-empty').classList.add('hidden');
  document.getElementById('today-thread').classList.add('hidden');
  document.getElementById('alarm-countdown-card').classList.add('hidden');
  document.getElementById('alarm-escalation-card').classList.add('hidden');
  document.getElementById('bridge-card').classList.add('hidden');
  // Own exhausted copy — set explicitly so this never inherits leftover DOM text from a prior bridge /
  // device-dial terminal. Same honest wording as the bridge-exhausted card (⑥) so the two "nobody
  // reached" terminals match — the SERVER source for that spoken line is escalation_copy.exhausted_line()
  // (deck v1.2; the both-options default). App wording here unchanged.
  document.getElementById('alarm-terminal-title').textContent = 'None of your contacts are able to help right now.';
  document.getElementById('alarm-terminal-sub').textContent   = 'Press I NEED HELP to try again.';
  _showTerminalCard();
  document.getElementById('btn-okay').classList.add('hidden');
  document.getElementById('btn-okay').classList.remove('btn--pulse');
  // Both buttons, matching ⑥: I NEED HELP (retry) + Return to Iona. escalation_state STAYS 'terminal' (set
  // by handleEscalationComplete) — the RENDER owns the state's lifetime (captain fix 2026-07-12). The old
  // inline reset-to-idle here was the "9ms writer" that dropped the card on reopen; state now clears to idle
  // ONLY in the dismissal path (showAlarmIdleReset: the 60s auto-return / Return-to-Iona) or on a retry press
  // (_startHelpSequence heals a non-idle flag), so a reopen shortly after completion restores this card.
  document.getElementById('btn-alert').classList.remove('hidden');
  document.getElementById('btn-alert').classList.remove('btn--pulse');
  document.getElementById('btn-cancel').classList.add('hidden');
  document.getElementById('btn-done').classList.add('hidden');
  document.getElementById('btn-alarm-done').classList.remove('hidden');
  // 60s auto-return to resting Today if the user doesn't act (reuses the bridge terminal mechanism).
  _clearBridgeTerminalReturnTimer();
  _bridgeTerminalReturnTimer = setTimeout(showAlarmIdleReset, BRIDGE_TERMINAL_AUTORETURN_MS);
}

// Shared SUCCESS terminal (restyled) — the SINGLE success/finish card for BOTH the bridge resolved
// path and the escalation acknowledged path. One card to maintain: green tick icon (shared markup),
// the name in teal cursive (--msg-font-iona) on its own row, a structured two-line sub with amber
// I NEED HELP, the Return-to-Iona + I NEED HELP buttons, escalation_state reset, and the 60s
// auto-return. Only the outcome sentence (leadCopy) and the name vary; all styling/structure/buttons/
// timing are identical — change this once, both success outcomes change.
//   leadCopy     — the outcome sentence ("We connected you with" / "We've reached")
//   name         — contact first name (rendered on its own teal row)
//   nameFallback — used when name is absent ("your contact" / "a contact")
function showSuccessTerminal({ leadCopy, name, nameFallback, subLines, callPhone }) {
  _alarmFlowActive = true;
  _teardownCallAudioNow();   // R-009-32 ④ (generalized #13) — a bridge success follows a LIVE call: fully reset
                             // the audio route/mode (not just volume) so the phone isn't left in comm-speaker and
                             // any success audio would land on the media route. Superset of the old volume restore;
                             // harmless on the escalation-acknowledged path (no live call → route reset is a no-op).
  show('screen-today');
  _stopVoiceEq();
  hideOrb();
  document.getElementById('today-empty').classList.add('hidden');
  document.getElementById('today-thread').classList.add('hidden');
  document.getElementById('alarm-countdown-card').classList.add('hidden');
  document.getElementById('alarm-escalation-card').classList.add('hidden');
  document.getElementById('bridge-card').classList.add('hidden');
  const _name = ((name || '').trim()) || nameFallback;
  // Title: muted lead row + the name on its OWN row (teal cursive --msg-font-iona). lead + name via
  // textContent (no injection surface from a contact name).
  const titleEl = document.getElementById('alarm-terminal-title');
  titleEl.innerHTML =
    '<span class="terminal-conn-lead"></span>' +
    '<span class="terminal-conn-name"></span>';
  titleEl.querySelector('.terminal-conn-lead').textContent = leadCopy;
  titleEl.querySelector('.terminal-conn-name').textContent = _name;
  // Two-line instruction; "I NEED HELP" amber-bold, always plain Hanken (functional safety text).
  // Sub-copy: escalation-acknowledged passes its own lines to MATCH the spoken terminal; the bridge/
  // default keeps the retry instruction. subLines are STATIC deck-aligned strings (no dynamic injection).
  document.getElementById('alarm-terminal-sub').innerHTML = (subLines && subLines.length)
    ? subLines.map((l) => `<span class="terminal-instr-line">${l}</span>`).join('')
    : ('<span class="terminal-instr-line">Press <span class="terminal-instr-help">I NEED HELP</span> again</span>' +
       '<span class="terminal-instr-line">anytime you need it</span>');
  _showTerminalCard();
  document.getElementById('btn-okay').classList.add('hidden');
  document.getElementById('btn-okay').classList.remove('btn--pulse');
  document.getElementById('btn-cancel').classList.add('hidden');
  document.getElementById('btn-done').classList.add('hidden');
  // R-009-33 — the completed bridge terminal's SINGLE re-reach button: "📞 Call {name}" to the contact just on
  // the line (same device-dial primitive as N4/N5). A contact-side drop is indistinguishable from a hangup, so
  // this one button lets a cut-off member call straight back. Only when a number was carried (bridge success);
  // the escalation-acknowledged path passes no callPhone → button stays hidden. I NEED HELP stays the floor.
  const _succBtn = document.getElementById('btn-call-contact');
  if (callPhone) {
    const _cn = (name || '').trim();
    _succBtn.textContent = _cn ? `📞 Call ${_cn}` : '📞 Call your contact';
    _succBtn.onclick = () => { _callContactDirect(callPhone); };
    _succBtn.classList.remove('hidden');
  } else {
    _succBtn.classList.add('hidden');
  }
  document.getElementById('btn-alert').classList.remove('hidden');
  document.getElementById('btn-alert').classList.remove('btn--pulse');
  document.getElementById('btn-alarm-done').classList.remove('hidden');
  // escalation_state STAYS 'terminal' (set by handleEscalationComplete) — the render owns its lifetime
  // (captain fix 2026-07-12); idle happens ONLY in the dismissal path (showAlarmIdleReset) or on a retry
  // press. Keeps this success card on a reopen shortly after completion.
  // 60s auto-return to resting Today.
  _clearBridgeTerminalReturnTimer();
  _bridgeTerminalReturnTimer = setTimeout(showAlarmIdleReset, BRIDGE_TERMINAL_AUTORETURN_MS);
}

// Escalation success → the shared success terminal. Distinct sentence (a contact ACKNOWLEDGED — we
// didn't necessarily speak to them), identical styling/structure/buttons/timing as the bridge card.
function showEscalationAcknowledgedState(contactName) {
  // Match the spoken acknowledged terminal (deck v1.7): "I've reached [name], who knows you need help. Take care now."
  showSuccessTerminal({
    leadCopy: "I've reached",
    name: contactName,
    nameFallback: 'one of your contacts',
    subLines: ['who knows you need help.', 'Take care now.'],
  });
}

function _clearEscalationSelfHealTimer() {
  if (_escalationSelfHealTimer) { clearTimeout(_escalationSelfHealTimer); _escalationSelfHealTimer = null; }
}

// Backstop ONLY — the outcome FCM (handleEscalationComplete) is the real closer. This fires solely
// when that push is LOST (the only way escalation-active runs the full ALARM_ESCALATION_TIMEOUT_MS,
// which is set to exceed the longest legitimate ladder run — never firing mid-real-escalation). A lost
// push must never brick the help button, so we clear BOTH flags + re-arm — and LOG it, because a fired
// self-heal is a push-reliability symptom worth seeing, not a silent tidy-up. (feature 005, captain-approved.)
async function _escalationSelfHeal() {
  _escalationSelfHealTimer = null;
  console.warn('[Escalation] self-heal fired — outcome FCM not received within '
    + (ALARM_ESCALATION_TIMEOUT_MS / 60000) + ' min; re-arming');
  try { logBridgeEvent('escalation_self_heal', { reason: 'outcome_fcm_timeout' }); } catch (e) {}
  await setPreference('escalation_state', 'idle');
  showAlarmIdleReset();  // clears _alarmFlowActive + returns to resting Today (full re-arm)
}

function showAlarmIdleReset() {
  _alarmFlowActive = false;  // back to the resting Today screen — OKAY's normal plan-based visibility resumes
  _disarmHelpButton();       // ruling 4 — return to rest returns the help button to rest with it
  _restoreVolumeNow();   // 009 Story 4 (R-009-5/T019) — catch-all: any return to resting restores prior volume
  // THE single dismissal-path clear (captain fix 2026-07-12 — "one authority over the moment"). The terminal
  // render keeps escalation_state='terminal'; it returns to idle ONLY here — the 60s auto-return, the cancel,
  // the self-heal, and Return-to-Iona all route through this. (A retry press heals its own flag in
  // _startHelpSequence.) Clear the persisted terminal outcome too so a later launch never restores a stale card.
  setPreference('escalation_state', 'idle');
  removePreference('escalation_terminal_outcome');
  removePreference('escalation_terminal_name');
  // Law-3 companion (2026-07-19): the run token is now a PREDICATE, not just a payload — the button-path
  // cancel POSTs iff one is known. That only stays honest if "known" means "a run is live or held", so the
  // token retires here, on the same single dismissal path that retires escalation_state. Left uncleared it
  // was sticky for the life of the process, and a later button-window cancel would have POSTed a dead run's
  // token against whatever row Last Check-in then pointed at.
  _activeRunToken = null;
  _clearBridgeTerminalReturnTimer();  // any pending success-terminal auto-return is now moot
  _clearEscalationSelfHealTimer();     // escalation completed or was reset — cancel the self-heal backstop
  _hideStopControl();   // Feature 010 — on-device bug: the stop-calling control (and the nav lock) survived
                        // the return to rest. This is THE single dismissal path, so clearing it here covers
                        // every route back — cancel, terminal, 60s auto-return, self-heal, Return to Iona.
  document.getElementById('alarm-countdown-card').classList.add('hidden');
  document.getElementById('alarm-escalation-card').classList.add('hidden');
  document.getElementById('alarm-terminal-card').classList.add('hidden');
  document.getElementById('bridge-card').classList.add('hidden');
  const warningEl = document.getElementById('msg-today-warning');
  warningEl.classList.add('hidden');
  warningEl.textContent = '';
  warningEl.style.cursor = '';
  document.getElementById('alarm-countdown-num').textContent = '10';
  document.getElementById('btn-alarm-done').classList.add('hidden');
  const thread = document.getElementById('today-thread');
  thread.innerHTML = '';
  thread.classList.add('hidden');
  document.getElementById('today-empty').classList.remove('hidden');
  document.getElementById('btn-okay').classList.add('btn--dim');
  document.getElementById('btn-okay').classList.remove('btn--pulse');
  document.getElementById('btn-okay').style.pointerEvents = 'none';
  _applyBeaconOkayGate();  // OKAY visibility is plan-gated (hidden default; revealed only for a known
                           // non-Beacon plan) — reset no longer force-reveals it.
  document.getElementById('btn-alert').classList.remove('hidden');
  document.getElementById('btn-alert').classList.remove('btn--pulse');
  document.getElementById('btn-cancel').classList.add('hidden');
  showOrb();
}

function hideOrb() {
  if (_orbFadeInRaf) { cancelAnimationFrame(_orbFadeInRaf); _orbFadeInRaf = null; }
  const orb = document.getElementById('orb-backdrop-system');
  if (!orb) return;
  orb.classList.remove('orb--on');
  orb.classList.add('hidden-orb');
}
function showOrb(force) {
  // The orb is a resting-Today-screen element — never show it over an active alarm/help flow (e.g. a
  // cold boot from a closed-app summon can race the normal Today render against the cancel window).
  // force=true is the ONE deliberate in-flow exception: the bridge in-call orb (showBridgeInCallState),
  // which SHOULD render during the bridge even though _alarmFlowActive is true.
  if (_alarmFlowActive && !force) return;
  const orb = document.getElementById('orb-backdrop-system');
  if (!orb) return;
  orb.classList.remove('hidden-orb');
  _orbFadeInRaf = requestAnimationFrame(() => {
    _orbFadeInRaf = null;
    orb.classList.add('orb--on');
  });
}

// ── Feature 003 / US1 — honest paused state ──────────────────────────────────────────────
// Reads the TRUE service_status from the backend (never assumes "Active") and reflects it on
// the Today screen (persistent tap-to-resume banner + orb ring colour) and the settings status
// pill. service_status only — no has_proactive. "I need help" is never affected by pause.
// (STATUS_BASE is defined once near the top of the file — the single backend base.)

// US3 — Beacon (reactive-only) plan hides the Service-tab pause/restart + status pill. Determined
// the same way as every plan: the Airtable `planName` string (exposed on /pwa-status). Mirrors the
// backend constant config.py BEACON_PLAN_VALUE.
const BEACON_PLAN = 'Beacon';
let _servicePlanName = null;  // last planName from /pwa-status; null = unknown (fail-safe → show rows)
let _statusReadOk   = false;  // did the LAST /pwa-status read reach 200? Lets the OKAY gate tell a
                              // successful read with an empty planName (→ non-Beacon, reveal OKAY)
                              // apart from a failed/offline read (→ leave OKAY hidden, no flash).
let _lastServiceStatus = null;  // last status rendered by applyServiceState ('Active'|'Paused'|null).
                                // The pause/resume handler reads this to decide pause-vs-resume from
                                // the state the UI already shows — no pre-read /pwa-status round-trip.

// Feature 004 — reactive-method picker state, sourced from /pwa-status. Source of truth is Airtable
// (NOT Preferences): a stale local copy must never drive a safety decision — the press-time gate reads
// the live value server-side. _hasHandsFree null = unknown (not yet read).
let _hasHandsFree   = null;
let _escalationMode = 'escalation';  // 'escalation' | 'handsfree'; blank/unknown → standard way

async function readServiceStatus() {
  // → 'Active' | 'Paused' | null (indeterminate: offline / slow / unknown). Never throws,
  //   never blocks: time-boxed so it can't delay launch or the settings sheet.
  _servicePlanName = null;  // reset; set below only from a successful read (US3 Beacon gate)
  _statusReadOk    = false; // reset per-read; set true only on a 200 (paired with _servicePlanName)
  try {
    const fcmToken = await getPreference('fcm_token');
    if (!fcmToken) return null;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${STATUS_BASE}/pwa-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({ fcm_token: fcmToken }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    _statusReadOk = true;  // reached 200 + parsed → plan is now KNOWN (even if planName is empty/null)
    _servicePlanName = typeof data.planName === 'string' ? data.planName : null;  // US3 — for the Beacon gate
    _hasHandsFree   = (data.hasHandsFree === true);                                       // feature 004 — entitlement
    _escalationMode = (data.escalationMode === 'handsfree') ? 'handsfree' : 'escalation'; // feature 004 — stored choice
    if (data.service_status === 'Paused') return 'Paused';
    if (data.service_status === 'Active') return 'Active';
    return null;
  } catch (e) {
    console.warn('[Status] readServiceStatus indeterminate:', e);
    return null;
  }
}

// Service status now lives on the Memberstack member (single source of truth — the same `service-status`
// field the website writes). Read it from the cached member (instant, offline-tolerant); map the member's
// 'Live'/'Paused' to the app-internal 'Active'/'Paused'. Unknown → null (indeterminate → pill shows '—').
function serviceStatusFromMember() {
  const v = currentMember?.customFields?.['service-status'];
  if (v === 'Paused') return 'Paused';
  if (v === 'Live')   return 'Active';
  return null;
}

// Best-effort refresh of the cached member from Memberstack so the pill reflects cross-device changes
// (e.g. paused on the website). Offline / SDK-down → keep the cached member (never blocks, never throws).
async function _refreshMemberStatus() {
  try {
    if (ms && ms.getCurrentMember) {
      const r = await ms.getCurrentMember();
      const m = r?.data?.member ?? r?.data ?? null;
      if (m) { currentMember = m; cacheMemberOffline(m); }
    }
  } catch (e) { /* offline — keep the cached member */ }
}

function applyServiceState(status) {
  // Banner shown ONLY on confirmed Paused. Orb rings amber iff Paused (else default teal).
  // Settings pill: true state — indeterminate shows "—", NEVER a false "Active".
  _lastServiceStatus = status;  // remember what the UI is showing (for the pause/resume decision)
  const banner = document.getElementById('today-paused-banner');
  if (banner) banner.classList.toggle('hidden', status !== 'Paused');

  const orb = document.getElementById('orb-backdrop-system');
  if (orb) orb.classList.toggle('orb--paused', status === 'Paused');  // amber rings + slower pace

  const badge = document.getElementById('settings-status-badge');
  if (badge) {
    if (status === 'Paused')      { badge.textContent = 'Paused'; badge.className = 'status-badge status-badge--paused'; }
    else if (status === 'Active') { badge.textContent = 'Active'; badge.className = 'status-badge status-badge--active'; }
    else                          { badge.textContent = '—';      badge.className = 'status-badge'; }  // indeterminate
  }

  // US2 — pause-button label follows the true state too (Active → "Pause service", Paused → "Restart service").
  const pauseBtn = document.getElementById('btn-pause-restart');
  if (pauseBtn) {
    if (status === 'Paused')      pauseBtn.textContent = 'Restart service';
    else if (status === 'Active') pauseBtn.textContent = 'Pause service';
    // indeterminate: leave the label unchanged
  }
}

// US3 — Beacon plan hides the Service-tab status + pause/restart (orb card only, no gap). Status and
// pause now live together in the combined #service-card, so hiding that whole card is the same
// outcome as the prior per-control hide. Inline display (not the .hidden class) so '' reliably
// reverts to the stylesheet value for every non-Beacon / unknown plan (fail-safe → card shown).
function _applyPlanGate() {
  const isBeacon = _servicePlanName === BEACON_PLAN;
  const serviceCard = document.getElementById('service-card');
  if (serviceCard) serviceCard.style.display = isBeacon ? 'none' : '';
  const scheduleRow = document.getElementById('btn-schedule');   // Beacon (reactive-only) → no Schedule row
  if (scheduleRow) scheduleRow.style.display = isBeacon ? 'none' : '';
}

// OKAY visibility is gated on the resolved plan. Default is HIDDEN (set in index.html) so a Beacon
// member never flashes a dimmed OKAY on cold launch. Two-way, and only acts on a KNOWN plan (a 200
// from /pwa-status, tracked by _statusReadOk — paired with _servicePlanName):
//   • Beacon                      → hide (the un-armable button stays gone; "I need help" fills the row)
//   • known non-Beacon (incl. an empty planName from a successful read) → reveal (normal dimmed-at-rest)
//   • read failed / not yet read  → leave OKAY's current visibility (err hidden; no flash, no clobber)
// Only touches the .hidden class — never the dim/arm state. Runs on every plan-resolve path
// (readAndApplyServiceState → launch, foreground, settings, pause/resume) so non-Beacon reliably
// gets OKAY back. Independent of the bridge terminal_exhausted hide (that is state-driven).
function _applyBeaconOkayGate() {
  const okay = document.getElementById('btn-okay');
  if (!okay) return;
  // Alarm/help flow takes precedence over the plan-based reveal: while the alarm owns the Today
  // screen (cancel window / escalation / bridge / device dial / terminal) OKAY stays hidden for
  // ALL plans. Without this, a context-blind plan reveal (launch fire-and-forget read, foreground
  // visibilitychange, settings open/close) un-hid OKAY mid-alarm on non-Beacon members.
  // Each decisive branch also clears the born `okay-pending` reserve (the plan is now decided). The
  // `else` (no fresh read) deliberately LEAVES okay-pending in place → help stays half-width, never
  // flashing the full-width Beacon layout while the plan read is still unresolved.
  if (_alarmFlowActive)                 { okay.classList.add('hidden'); okay.classList.remove('okay-pending'); return; }
  if (_servicePlanName === BEACON_PLAN) { okay.classList.add('hidden'); okay.classList.remove('okay-pending'); }       // confirmed Beacon → hidden (full-width help)
  else if (_statusReadOk)               { okay.classList.remove('hidden'); okay.classList.remove('okay-pending'); }    // known non-Beacon → reveal (two buttons)
  // else (no fresh successful read): leave as-is — okay-pending stays (neutral reserved layout), or a
  // prior reveal is preserved.
}

// Feature 004 — placeholder price; NOT settled pricing (FR-021). One constant — swap when priced.
const HANDSFREE_ADDON_PRICE_LABEL = 'Add £6';

// Feature 004 — render the reactive-method picker from the last /pwa-status read. Entitled → both rows
// selectable (hands-free marked "Included"); not entitled → the hands-free row becomes the add-invitation
// (price pill → dashboard #account) in the SAME geometry (no reflow). Only renders after a KNOWN read
// (_statusReadOk) so a failed/offline read never mislabels entitlement. Selection shows the EFFECTIVE
// way: a stored 'handsfree' with no entitlement displays the standard way — mirrors the press-time
// fallback (entitlement wins over stored preference).
function _renderReactiveMethodPicker() {
  const card = document.getElementById('reactive-method-card');
  if (!card) return;
  if (!_statusReadOk) { card.hidden = true; return; }  // wait for a known read

  const entitled  = _hasHandsFree === true;
  const stored    = _escalationMode === 'handsfree' ? 'handsfree' : 'escalation';
  const effective = (entitled && stored === 'handsfree') ? 'handsfree' : 'escalation';

  const escRow   = document.getElementById('method-row-escalation');
  const hfRow    = document.getElementById('method-row-handsfree');
  const escRadio = document.getElementById('method-esc-radio');
  const hfRadio  = document.getElementById('method-hf-radio');
  const hfPrice  = document.getElementById('method-hf-price');
  if (!escRow || !hfRow) return;

  // selection — exactly one
  const escSel = effective === 'escalation';
  escRow.classList.toggle('method-row--selected', escSel);
  escRadio.classList.toggle('method-radio--on', escSel);
  escRow.setAttribute('aria-checked', escSel ? 'true' : 'false');
  hfRow.classList.toggle('method-row--selected', !escSel);
  hfRadio.classList.toggle('method-radio--on', !escSel);

  // entitled → radio + "Included"; not entitled → the SAME control slot holds the price pill instead.
  // Radio/pill/badge visibility is driven purely by the .method-row--upgrade class in CSS, so the slot
  // always holds exactly one element — no appended sibling, no reflow (SC-004).
  hfPrice.textContent = HANDSFREE_ADDON_PRICE_LABEL;  // single placeholder source (FR-021)
  hfRow.classList.toggle('method-row--upgrade', !entitled);
  if (entitled) {
    hfRow.setAttribute('role', 'radio');
    hfRow.setAttribute('aria-checked', (!escSel).toString());
    hfRow.setAttribute('aria-label', 'Speakerphone');
  } else {
    hfRow.setAttribute('role', 'button');
    hfRow.removeAttribute('aria-checked');
    hfRow.setAttribute('aria-label', 'Add speakerphone');
  }

  card.hidden = false;
}

/* ── Rounds (sweep-count) selector — Service settings. Memberstack-only ('sweep-count'); NEVER Airtable.
   Visible on ALL plans (no gating). Write-on-select via _cmWrite (optimistic + revert-on-failure), mirroring
   the app's other immediate-write settings. Copy + structure shared verbatim with the website dashboard +
   onboarding. Strict clamp (non-1/2/3 → 2, per brief) — deliberately NOT the engine's _clampSweepCount()
   which nearest-clamps (9→3); the UI never renders an out-of-range state. ── */
const _RND_ROWS = {
  1: ["We call each of your contacts once, in order."],
  2: ["Round 1 — we call each contact in turn.", "Round 2 (moments later) — we try everyone again."],
  3: ["Rounds 1 and 2 — we call each contact in turn.", "Round 3 — a final try around everyone."]
};
const _RND_NOTES = {
  1: "Fastest. One pass through everyone.",
  2: "Recommended. A second chance for anyone who missed the first call.",
  3: "Most persistent. Three full passes through everyone."
};
const _RND_PHONE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.7 2.34a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.74-1.74a2 2 0 0 1 2.11-.45c.74.34 1.53.57 2.34.7A2 2 0 0 1 22 16.92z"/></svg>';
function _roundsClamp(v) { return (v === '1' || v === '2' || v === '3' || v === 1 || v === 2 || v === 3) ? Number(v) : 2; }
function _roundsFromMember() { return _roundsClamp(currentMember && currentMember.customFields && currentMember.customFields['sweep-count']); }
function _paintRounds(v) {   // paints ALL .rounds-sec instances (Service tab + Contacts screen stay in sync — one field)
  const n = _roundsClamp(v);
  document.querySelectorAll('.rnd-seg').forEach(seg => {
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', Number(b.dataset.n) === n));
  });
  document.querySelectorAll('.rnd-preview').forEach(pv => {
    pv.innerHTML = '';
    (_RND_ROWS[n] || []).forEach(txt => {
      const d = document.createElement('div');
      d.className = 'rnd-row';
      d.innerHTML = _RND_PHONE_SVG + '<span></span>';
      d.querySelector('span').textContent = txt;   // textContent — no injection surface
      pv.appendChild(d);
    });
  });
  document.querySelectorAll('.rnd-note').forEach(note => { note.textContent = _RND_NOTES[n] || ''; });
}
function _renderRoundsSelector() { _paintRounds(_roundsFromMember()); }
let _roundsBound = false;
function _bindRoundsSelector() {
  const segs = document.querySelectorAll('.rnd-seg');
  if (!segs.length || _roundsBound) return;
  _roundsBound = true;
  segs.forEach(seg => seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => _roundsPick(Number(b.dataset.n)))));
  _paintRounds(_roundsFromMember());
}
async function _roundsPick(n) {
  n = _roundsClamp(n);
  const prev = _roundsFromMember();
  _paintRounds(n);   // optimistic
  if (n === prev) return;
  if (currentMember) { currentMember.customFields = currentMember.customFields || {}; currentMember.customFields['sweep-count'] = String(n); }
  const ok = await _cmWrite({ 'sweep-count': String(n) });
  if (!ok) {
    if (currentMember && currentMember.customFields) currentMember.customFields['sweep-count'] = String(prev);
    _paintRounds(prev);
    if (typeof _showCalmNote === 'function') _showCalmNote('Could not save that just now. Please try again.');
  }
}

/* ── Feature 010 — cancel-window picker. Member-controlled, Memberstack-only ('alarm-cancel-window'),
   NEVER Airtable (the engine reads its own Airtable field via Make sync). Visible on ALL plans (no
   gating — Amendment 6). Persistence mirrors the rounds selector (_cmWrite, optimistic + revert-on-fail).
   The spinny wheel is net-new UI; write-on-settle (debounced) matches the app's immediate-write settings. ── */
const _CW_MIN = 5, _CW_MAX = 60, _CW_STEP = 5, _CW_DEFAULT = 10;
function _cwClamp(v) {
  let n = parseInt(v, 10);
  if (!Number.isFinite(n)) return _CW_DEFAULT;
  n = Math.round(n / _CW_STEP) * _CW_STEP;
  return Math.min(_CW_MAX, Math.max(_CW_MIN, n));
}
function _cwFromMember() {
  return _cwClamp(currentMember && currentMember.customFields && currentMember.customFields['alarm-cancel-window']);
}
function _cwRenderRowValue() {
  // On-device finding (owner, 2026-07-18): showing the value on the settings row made the label wrap to two
  // lines, and no other row carries a value — so the chip was removed. Kept as a null-guarded no-op so the
  // call site stays harmless; restore the span in index.html if a value on the row is ever wanted again.
  const el = document.getElementById('cw-row-value');
  if (el) el.textContent = _cwFromMember() + 's';
}
let _cwBuilt = false, _cwCommitTimer = null, _cwWired = false;
function _cwBuildWheel() {
  const wheel = document.getElementById('cw-wheel');
  if (!wheel || _cwBuilt) return;
  for (let s = _CW_MIN; s <= _CW_MAX; s += _CW_STEP) {
    const d = document.createElement('div');
    d.className = 'cw-item';
    d.dataset.v = String(s);
    d.innerHTML = s + '<span class="cw-unit">sec</span>';
    d.addEventListener('click', () => _cwCenter(Number(d.dataset.v), true));
    wheel.appendChild(d);
  }
  wheel.addEventListener('scroll', _cwOnScroll);
  _cwBuilt = true;
}
function _cwCenteredValue() {
  const wheel = document.getElementById('cw-wheel');
  if (!wheel) return _CW_DEFAULT;
  const mid = wheel.scrollTop + wheel.clientHeight / 2;
  let best = null, bd = Infinity;
  wheel.querySelectorAll('.cw-item').forEach(it => {
    const c = it.offsetTop + it.offsetHeight / 2, dd = Math.abs(c - mid);
    if (dd < bd) { bd = dd; best = it; }
  });
  return best ? _cwClamp(best.dataset.v) : _CW_DEFAULT;
}
function _cwMark() {
  const n = _cwCenteredValue();
  document.querySelectorAll('#cw-wheel .cw-item').forEach(it => it.classList.toggle('sel', _cwClamp(it.dataset.v) === n));
  return n;
}
function _cwCenter(v, smooth) {
  const wheel = document.getElementById('cw-wheel');
  const el = wheel && wheel.querySelector('.cw-item[data-v="' + v + '"]');
  if (!el) return;
  wheel.scrollTo({ top: el.offsetTop - (wheel.clientHeight / 2 - el.offsetHeight / 2), behavior: smooth ? 'smooth' : 'auto' });
  setTimeout(_cwMark, smooth ? 180 : 0);
}
let _cwLastTick = null;
function _cwOnScroll() {
  const n = _cwMark();
  // Owner request (on-device): the wheel should click as it cycles. Reuse the EXISTING interface-feedback
  // tap — the same sound the app/text/call buttons make — and fire it only when the CENTRED value actually
  // changes, so it ticks once per notch rather than on every scroll pixel. Respects the member's
  // sound/vibrate/off setting automatically (Feedback owns that); silent if the plugin is absent.
  if (n !== _cwLastTick) {
    _cwLastTick = n;
    try { if (window.Feedback) window.Feedback.tap(); } catch (e) {}
  }
  if (_cwCommitTimer) clearTimeout(_cwCommitTimer);
  _cwCommitTimer = setTimeout(_cwCommit, 400);   // write-on-settle (debounced), matches app's immediate-write settings
}
async function _cwCommit() {
  _cwCommitTimer = null;
  const n = _cwMark();
  const prev = _cwFromMember();
  if (n === prev) return;
  if (currentMember) { currentMember.customFields = currentMember.customFields || {}; currentMember.customFields['alarm-cancel-window'] = String(n); }
  if (memberConfig) memberConfig.alarmCancelWindow = n;   // keep the live device countdown in sync at once
  _cwRenderRowValue();
  const ok = await _cmWrite({ 'alarm-cancel-window': String(n) });
  if (!ok) {
    if (currentMember && currentMember.customFields) currentMember.customFields['alarm-cancel-window'] = String(prev);
    if (memberConfig) memberConfig.alarmCancelWindow = prev;
    _cwRenderRowValue();
    _cwCenter(prev, true);
    if (typeof _showCalmNote === 'function') _showCalmNote('Could not save that just now. Please try again.');
  }
}
function _cwExit() {
  if (_cwCommitTimer) { clearTimeout(_cwCommitTimer); _cwCommit(); }   // flush any pending settle before leaving
  show('screen-today');
  const ov = document.getElementById('settings-overlay');
  if (ov) ov.classList.remove('hidden');
  if (typeof _activateSettingsTab === 'function') _activateSettingsTab('account');
}
function openCancelWindowScreen() {
  show('screen-cancel-window');
  _cwBuildWheel();
  if (!_cwWired) {
    const back = document.getElementById('btn-cw-back');
    if (back) back.addEventListener('click', _cwExit);
    const done = document.getElementById('btn-cw-done');
    if (done) done.addEventListener('click', _cwExit);
    _cwWired = true;
  }
  _cwLastTick = _cwFromMember();   // seed so the programmatic landing below doesn't click on open
  setTimeout(() => _cwCenter(_cwFromMember(), false), 0);   // land on the member's current value once laid out
}

async function readAndApplyServiceState() {
  await readServiceStatus();      // plan/entitlement side effects (planName / hasHandsFree / escalationMode)
  await _refreshMemberStatus();   // service status source of truth = the Memberstack member (best-effort)
  applyServiceState(serviceStatusFromMember());  // pill/banner/orb reflect the member, not a stale Airtable read
  _applyPlanGate();          // US3 — applied after the read populates _servicePlanName
  _applyBeaconOkayGate();    // Beacon — hide the un-armable OKAY button on the Today screen
  _renderReactiveMethodPicker();  // feature 004 — reflect stored choice + entitlement in the picker
  _renderRoundsSelector();        // rounds (sweep-count) — reflect the member's stored choice
  _cwRenderRowValue();            // Feature 010 — cancel-window row shows the member's stored value
}

// US1 — the paused banner is INDICATOR ONLY. Tapping opens Settings (where pause/resume is
// built in US2); it does NOT resume directly. (A tap-to-resume that fires but doesn't visibly
// clear is worse than none — owner decision.)
function initServiceState() {
  const banner = document.getElementById('today-paused-banner');
  if (!banner) return;
  banner.addEventListener('click', () => {
    document.getElementById('settings-overlay')?.classList.remove('hidden');
    _activateSettingsTab('service');  // US2 — banner opens settings on the Service tab
    readAndApplyServiceState();  // settings pill reflects true state on open
  });
}

async function commitEscalation(fcmToken) {
  const _post = () => fetch(`${STATUS_BASE}/pwa-respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
    body: JSON.stringify({ fcm_token: fcmToken, response: 'alert' }),
  });
  try {
    const res = await _post();
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return;
  } catch (firstErr) {
    console.warn('[Alarm] commitEscalation first attempt failed — retrying in 1.5s:', firstErr);
    await new Promise(r => setTimeout(r, 1500));
    try {
      const res = await _post();
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return;
    } catch (err) {
      console.error('[Alarm] commitEscalation retry failed:', err);
    }
  }
  // Backend unreachable — drop to the offline device-dial floor (FR-012). No cancel window: the
  // user already passed it at the front door. If the floor can't run (no telephony / empty cache),
  // fall through to the honest warning below.
  try {
    const floored = await startDeviceDial('escalation_floor', true);
    if (floored) return;
  } catch (e) { console.error('[Alarm] device-dial floor failed:', e); }
  const warningEl = document.getElementById('msg-today-warning');
  warningEl.textContent = 'Could not reach the service — your contacts may not have been called. Tap to retry.';
  warningEl.classList.remove('hidden');
  warningEl.style.cursor = 'pointer';
  warningEl.addEventListener('click', async () => {
    warningEl.classList.add('hidden');
    warningEl.style.cursor = '';
    try {
      const res = await _post();
      if (!res.ok) throw new Error('HTTP ' + res.status);
    } catch (retryErr) {
      warningEl.textContent = 'Still unable to reach the service — your contacts may not have been called.';
      warningEl.classList.remove('hidden');
    }
  }, { once: true });
}

// Escalation entry point — called from btn-alert (bridgeFallthrough=false) and
// _onBridgeExhausted (bridgeFallthrough=true). Never called directly anywhere else.
// Bridge hard-failure fallthrough — cancel window already ran at the front door (_startHelpSequence).
// Dispatches straight to escalation: no second cancel window.
async function _startIonaEscalation(bridgeFallthrough) {
  const fcmToken = await getPreference('fcm_token');
  if (!fcmToken) {
    const warningEl = document.getElementById('msg-today-warning');
    warningEl.textContent = 'Your device is not fully registered — the alarm cannot be raised right now.';
    warningEl.classList.remove('hidden');
    return;
  }
  const currentEscState = await getPreference('escalation_state');
  if (currentEscState === 'active' || currentEscState === 'terminal') return;

  const { KeepAwake } = Capacitor.Plugins;
  KeepAwake.keepAwake();
  await setPreference('escalation_state', 'active');
  await setPreference('escalation_state_ts', String(Date.now()));

  await playAlarmSiren();
  // Amendment 8/9 — the old TTS line here is retired: it announced a cancel window that does not exist on
  // this path (the window already ran at the front door in _startHelpSequence) and never played anyway.
  // BRIDGE HARD-FAILURE LINE: deliberately NOT wired. Captain ruling 2026-07-18 — the clip exists
  // (bridge_fallthrough.mp3) but its wording and voice are owner-reserved to the copy session, and no
  // placeholder debuts in a crisis moment. Behaviour here is therefore unchanged from today (silent from
  // this point; the Signal-audio pipeline narrates). Wire the call in _playBridgeFallthroughMessage's
  // caller ONLY once the copy session has ruled.
  showEscalationActiveState();
  commitEscalation(fcmToken);
}

// feature 005 (a help press must never be silent) — press-time liveness confirmation. Returns TRUE only
// when an escalation is CONFIRMED genuinely live, so the caller ABSORBS the press. EVERY other outcome
// returns FALSE so the caller SUMMONS. Bias rule (load-bearing): a possible duplicate escalation is
// recoverable; a bricked help button in distress is not — so anything short of a positive "yes, live"
// (stale flag, backend says not-live, timeout, offline, error, missing id) heals and summons. Instant +
// offline for the common stale case (local fast-path); the backend is consulted ONLY for a RECENT active
// flag, with a tight timeout, to learn the one thing the app cannot know locally: whether the outcome
// already fired even though our FCM was lost.
const ESCALATION_LOCAL_STALE_MS = 45 * 60 * 1000;   // 45 min — the single "max plausible live escalation" horizon shared with cold-init, the backend TTL, and the self-heal timer; a flag older than this cannot be live
const ESCALATION_LIVE_READ_TIMEOUT_MS = 1200;       // tight bound so a stuck-flag press never feels slow to summon

async function _escalationConfirmedLive() {
  // A live device-dial cycle is genuinely live and known LOCALLY (native; its flag is cleared at
  // completion and on cold-init, and the backend has no view of it) — absorb.
  if (await getPreference('device_dial_active') === 'true') return true;

  // Local fast-path — instant + offline. A flag older than the max plausible ladder cannot be live; heal
  // without any network round-trip (covers the common lost-end-of-ladder-FCM case).
  const tsStr = await getPreference('escalation_state_ts');
  const ts = tsStr ? parseInt(tsStr, 10) : 0;
  if (!ts || Date.now() - ts > ESCALATION_LOCAL_STALE_MS) return false;

  // Recent active flag → ask the backend the one thing we can't know locally: is this escalation still in
  // flight, or did its outcome already fire (even if our FCM was lost)? Tight timeout; ANY uncertainty
  // (non-200, offline, abort, parse error, missing id) → not-live → summon.
  const rec = await getPreference('member_airtable_id');
  if (!rec) return false;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), ESCALATION_LIVE_READ_TIMEOUT_MS);
    let live = false;
    try {
      const res = await fetch(`${STATUS_BASE}/pwa-escalation-live?rec=${encodeURIComponent(rec)}`, {
        method: 'GET',
        headers: { 'ngrok-skip-browser-warning': 'true' },
        signal: ctrl.signal,
      });
      if (res.ok) { const data = await res.json(); live = data.live === true; }
    } finally {
      clearTimeout(to);
    }
    return live;   // absorb ONLY on a positive live
  } catch (e) {
    return false;  // timeout / offline / error → summon
  }
}

// Resume-time "confirmed dead" check — the mirror of _escalationConfirmedLive, with the OPPOSITE
// default under uncertainty. Returns true ONLY on a POSITIVE confirmation from the single liveness
// authority that the escalation has resolved (HTTP 200 + {live:false}). ANY uncertainty — timeout,
// offline, non-200, parse error, missing id — returns false = "not confirmed resolved" → KEEP the
// screen. On resume the calling screen is process-owned (a real escalation-start THIS live process
// handled) — a far stronger prior than a cold flag — so a network wobble must never clear it; only the
// authority saying "resolved" does. Non-latching: the complete-FCM + terminal-card remain the primary
// clears and fire independently, and the resume reconcile re-runs on the next foreground so a recovered
// network converges (mirror of cold-launch's bias-to-idle-with-retry).
async function _escalationConfirmedResolved() {
  const rec = await getPreference('member_airtable_id');
  if (!rec) return false;   // can't confirm → keep
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), ESCALATION_LIVE_READ_TIMEOUT_MS);
    try {
      const res = await fetch(`${STATUS_BASE}/pwa-escalation-live?rec=${encodeURIComponent(rec)}`, {
        method: 'GET',
        headers: { 'ngrok-skip-browser-warning': 'true' },
        signal: ctrl.signal,
      });
      if (!res.ok) return false;                  // non-200 → not confirmed → keep
      const data = await res.json();
      return data.live === false;                 // ONLY a positive live:false confirms resolution
    } finally {
      clearTimeout(to);
    }
  } catch (e) {
    return false;   // timeout / offline / error → not confirmed → keep
  }
}

// 009 Story 4 (R-009-8 / T017 / T019) — Oran loud from the first word. Max media+call volume (both Android
// streams) + speaker the instant a summon commits, BEFORE the siren/cancel window; mode-blind (shared reaching
// phase). Restore the prior level at the terminal (R-009-5 — no midnight ambush). Best-effort native calls;
// never block or fail the alarm.
function _maxVolumeNow() {
  try { const { TwilioVoice } = Capacitor.Plugins; if (TwilioVoice) TwilioVoice.maxVolume().catch(() => {}); } catch (e) {}
}
function _restoreVolumeNow() {
  try { const { TwilioVoice } = Capacitor.Plugins; if (TwilioVoice) TwilioVoice.restoreVolume().catch(() => {}); } catch (e) {}
}
// 009 (R-009-31 #13) — drop-time audio teardown. Called BEFORE the N5 dropped clip on a live-call drop: it
// abandons the call's comm-speaker route, resets the audio mode to NORMAL (so the USAGE_MEDIA terminal clip
// plays out the speaker, not the dying voice-call route — the "no audio at all" symptom), and folds in the
// Story-4 volume restore. Awaited so the clip that follows lands on a clean media route. Best-effort.
async function _teardownCallAudioNow() {
  try { const { TwilioVoice } = Capacitor.Plugins; if (TwilioVoice) await TwilioVoice.teardownCallAudio(); } catch (e) {}
}

// Cancel window → bridge → escalation. Entry point for all btn-alert and orb presses.
// The cancel window gates EVERYTHING: bridge fires only after the countdown completes.
async function _startHelpSequence(triggerSource) {
  // Press-time recovery front door (feature 005 — a help press must never be silent). The always-pressable
  // physical button means a press can land in ANY state, including a STUCK one (a lost outcome FCM leaves
  // escalation_state='active' forever). The old guard blind-absorbed every 'active'/'terminal' press, so a
  // stuck flag bricked the button until the self-heal backstop. Now the button heals on the NEXT press:
  // absorb ONLY a genuinely-live escalation, summon otherwise.
  //   - _summonCountdownActive: a live cancel-window countdown owns this press (SC-003) — absorb.
  //   - _summonEvaluating: a prior press is still in the _escalationConfirmedLive await below — a rapid
  //     flurry could slip through that window, so this closes it (a flurry still resolves to ONE sequence).
  // Both flags are synchronous, so the check-and-set completes before any await yields.
  //
  // COLLISION A (captain ruling 19 Jul; BUILT 20 Jul, coupled to the engine-side collapse) — a help
  // press during a live SILENCE window is now CONVERTED, not swallowed.
  //
  // The old absorb satisfied law 1 by accident and broke law 2: a silence escalation is always Oran's
  // Signal (Amendment 4), so a hands-free member pressing for help here was silently denied their
  // bridge. The press is a deliberate act and must be honoured whole.
  //
  // NO SECOND WINDOW (law 1). The countdown already on screen keeps running, on the engine's adopted
  // deadline; nothing is re-rendered, no second siren plays, no second timer starts. What changes is
  // what happens at the END of it — the run becomes member-initiated, so the reactive mode and the
  // bridge entitlement apply.
  //
  // THIS IS THE HALF THAT WAS HELD. Converting locally without the collapse would have been strictly
  // worse than the bug: at zero the device would commit a member escalation while the engine's hold
  // dialled its own. The summon POST below reaches _collapse_hold_for_summon, which stands the hold
  // down BEFORE any dispatch, so exactly one run reaches the contacts. Coupled halves — this branch and
  // the collapse ship in the same deploy, or neither does.
  if (_summonCountdownActive && _silenceActivation && _silenceActivation.memberInitiated) return;
  if (_summonCountdownActive && _silenceActivation && !_summonEvaluating) {
    console.log('[ALARM] collision A — help press during a silence window: converting to member-initiated');
    // Clear the silence marker so Amendment 11's flip selects Iona's line, not Oran's silence line:
    // the member asked for this, it is no longer a silence run.
    _silenceRunToken = null;
    _silenceActivation.memberInitiated = true;
    // Tell the engine. The summon row is what triggers the collapse server-side; the ORIGINAL run token
    // is carried forward there, so `_activeRunToken` stays valid and the member's one cancel still
    // reaches the row (law 3).
    //
    // POSTED DIRECTLY, NOT via logBridgeEvent(): that helper returns early when `bridgeAttempt` is null,
    // and during a silence window it IS null (no press flow has created one). Routing through it would
    // have no-op'd silently and the collapse would never have fired — the conversion would look built
    // and do nothing. Caught before deploy.
    _postSummonForCollapse(triggerSource || 'help_control');
    return;
  }
  if (_summonCountdownActive || _summonEvaluating) return;
  _summonEvaluating = true;
  try {
    // Press-time recovery (feature 005 — a help press must never be silent). Absorb ONLY a CONFIRMED-live
    // escalation. A stuck/glitched 'active' flag (e.g. a lost outcome FCM) is NOT confirmably live, so it
    // heals and THIS press summons — the button never waits on the self-heal backstop. Bias-to-summon:
    // anything short of a positive "yes, live" (stale, not-live, timeout, offline, terminal) summons.
    const currentEscState = await getPreference('escalation_state');
    if (currentEscState === 'active' && await _escalationConfirmedLive()) return;  // genuinely live — absorb
    if (currentEscState !== 'idle') await setPreference('escalation_state', 'idle');  // heal a stale/terminal flag
    _summonCountdownActive = true;
  } finally {
    _summonEvaluating = false;
  }

  // RULING 1 (21 Jul) — the activation is recorded HERE, at press, before a single sound plays and
  // before the countdown exists. Deliberately NOT awaited: the record must never delay the siren, and
  // the alarm is what matters — the paperwork rides alongside it. This is a PURE LOG LINE (ruling A′):
  // it arms nothing server-side, and the law-2 collapse does not ride on it.
  _startActivationRecord(triggerSource || 'help_control');

  _clearBridgeTerminalReturnTimer();  // a fresh help press cancels any pending success-terminal auto-return
  _clearEscalationSelfHealTimer();    // and any stale escalation self-heal backstop from a prior run
  _maxVolumeNow();   // 009 Story 4 (R-009-8) — FIRST act of the press: loud + speaker BEFORE siren/cancel window
  _adoptedEngineDeadlineAt = null;   // a fresh window adopts nothing until a silence run lands underneath it
  escalationCountdownValue = getCancelWindowSeconds(memberConfig);
  showCancelWindowState();

  let cancelledByUser = false;
  const cancelBtn = document.getElementById('btn-cancel');

  async function cancelAlarm() {
    if (cancelledByUser) return;
    cancelledByUser = true;
    _summonCountdownActive = false;  // countdown ended (cancelled) — release the duplicate guard
    _adoptedEngineDeadlineAt = null; // and drop any adopted engine deadline with the window that held it
    if (escalationCountdownTimer) { clearInterval(escalationCountdownTimer); escalationCountdownTimer = null; }
    if (_audioCtx) { try { _audioCtx.close(); } catch (e) {} _audioCtx = null; }
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
    // Amendment 9 condition 1 — the cancel tap is live THROUGH the siren and the speech, so it must also
    // SILENCE them. The WebAudio siren/tone die with the context above; Oran's clip is an <audio> element
    // held in _saCurrent, so stop it explicitly. This is a MEMBER-INITIATED stop, not one of the internal
    // signal transitions the atomic-clip ruling governs: once the member has cancelled, "your contacts will
    // be called in N seconds" is false, and continuing to speak it would be the dishonest choice.
    try { if (_saCurrent) { _saCurrent.pause(); _saCurrent = null; } } catch (e) {}
    // LAW 3 (captain ruling 2026-07-19 — window collision, the four laws): a member's cancel resolves
    // BOTH questions in one tap. This window is member-raised and owns its own deadline, so the cancel
    // was historically LOCAL-ONLY — correct while a button window was the only thing that could be open.
    // It is not: an engine hold can be open UNDERNEATH it (collision C). The silence run's
    // escalation_started set _activeRunToken, and the RUNNER process is holding a clock this screen knows
    // nothing about. A local reset then clears the screen while the engine dials anyway — the member
    // believes they have stopped it and they have not. That was live until this change.
    // So: whenever a run token is known, the cancel POSTs. postAlarmCancel patches the durable hold row,
    // the only cross-process channel there is; the server decides in-window vs late off the row's real
    // status, so a tap racing the deadline is resolved by the engine, never guessed at here.
    // ORDER IS LOAD-BEARING: showAlarmIdleReset() clears _activeRunToken (it is the single dismissal
    // path), so the POST must complete before it — otherwise the token is gone before it ships.
    if (_activeRunToken) {
      _markContactResolvedByAlarm();   // law 3 — the one tap also answers the silence run's open contact
      await postAlarmCancel();
    }
    // RULING 2 — the tap-cancel outcome. This resolves THIS activation's own row and nothing else; the
    // postAlarmCancel above is the separate, unchanged channel that reaches an underlying silence hold.
    // Two rows, two owners: the button's record here, the engine's hold row there.
    _resolveActivation('cancelled_tap');
    showAlarmIdleReset();
  }

  cancelBtn.addEventListener('click', cancelAlarm, { once: true });

  // Siren then tones fire immediately — cancel is live during playback (matches pre-bridge behaviour).
  // Feature 010 / Amendment 9 — SEQUENTIAL: siren → attention tone → Oran's clip → countdown.
  // Owner's ear ruled sequential over countdown-under-speech: every setting's spoken promise is then
  // TRUE (the countdown genuinely starts with N seconds left), which is what keeps the 5s floor viable.
  // The cancel tap is live THROUGHOUT — the listener + visible button are armed by showCancelWindowState()
  // above, before a single sound plays (condition 1), and cancelAlarm() stops whatever is mid-play.
  await playAlarmSiren();
  if (cancelledByUser) return;
  await playAttentionTone();                                   // addendum — the existing pre-Iona tone, reused
  if (cancelledByUser) return;
  await _saPlayOnce(_activationClipFor(escalationCountdownValue));   // Oran speaks ONCE, number included
  if (cancelledByUser) return;

  escalationCountdownTimer = setInterval(async () => {
    if (cancelledByUser) { clearInterval(escalationCountdownTimer); return; }
    escalationCountdownValue--;
    // LAW 1 / collision B — if a silence run landed underneath this window, its engine deadline was
    // adopted here rather than a second window being opened. FLOOR, never extend: the visible number is
    // the sooner of the member's own remaining ticks and what the engine will actually honour. Applied
    // per-tick (not once at adoption) so it holds even if the push lands mid-countdown.
    //
    // Math.floor, NOT ceil, and that is the correctness half. This tick is 1s wide, so the engine's
    // deadline almost always falls mid-tick. Rounding UP hands the member the leftover fraction and the
    // screen then shows "1" while the engine is already dialling — the exact screen-lies failure the
    // anchoring ruling was ratified to kill (a verifier cell caught it doing this: commit landed ~880ms
    // AFTER the engine's dial). Flooring spends the fraction instead, so the window closes just BEFORE
    // the engine's deadline rather than just after. Same convention, same reasoning, as the silence
    // path's own _remaining().
    if (_adoptedEngineDeadlineAt) {
      escalationCountdownValue = Math.min(
        escalationCountdownValue,
        Math.max(0, Math.floor((_adoptedEngineDeadlineAt - Date.now()) / 1000)));
    }
    const numEl = document.getElementById('alarm-countdown-num');
    numEl.textContent = escalationCountdownValue;
    numEl.classList.add('pulse');
    setTimeout(() => numEl.classList.remove('pulse'), 200);
    playPulseTone();
    if (escalationCountdownValue <= 0) {
      clearInterval(escalationCountdownTimer);
      escalationCountdownTimer = null;
      _summonCountdownActive = false;  // countdown ended (committing) — escalation_state now guards re-entry
      _adoptedEngineDeadlineAt = null; // the window that adopted it is spent
      cancelBtn.removeEventListener('click', cancelAlarm);
      if (cancelledByUser) return;

      // Dismiss the countdown screen immediately — next state takes over and renders its own UI.
      // Keep OKAY THANKS / I NEED HELP HIDDEN through the transition so they don't flash before the
      // bridge / escalation / device-dial screen appears. (The no-FCM error path below restores them
      // via showAlarmIdleReset.)
      document.getElementById('alarm-countdown-card').classList.add('hidden');
      document.getElementById('btn-cancel').classList.add('hidden');
      document.getElementById('btn-okay').classList.add('hidden');
      document.getElementById('btn-alert').classList.add('hidden');

      // 009 (R-009-20/21) ONE reaching engine — summonHelp now only PRE-ARMS the join capability for a
      // hands-free member (it always returns false); the ENGINE below drives reaching for BOTH modes, and
      // the server's econtact press-1 fork decides the accept consequence. (Device dial is the automatic
      // offline FLOOR, fired from commitEscalation on backend failure — not a user-selectable method.)
      await summonHelp(triggerSource);

      // Dispatch the engine escalation (reaching for both modes). Siren already played at cancel-window
      // start; go straight to the voice message.
      const fcmToken = await getPreference('fcm_token');
      if (!fcmToken) {
        const warningEl = document.getElementById('msg-today-warning');
        warningEl.textContent = 'Your device is not fully registered — the alarm cannot be raised right now.';
        warningEl.classList.remove('hidden');
        showAlarmIdleReset();
        return;
      }
      const { KeepAwake } = Capacitor.Plugins;
      KeepAwake.keepAwake();
      await setPreference('escalation_state', 'active');
      await setPreference('escalation_state_ts', String(Date.now()));
      // Amendment 8 — the second TTS line here is retired: it repeated the cancel instruction AFTER the
      // window had closed and the cancel button was hidden (false), always said "10" regardless of the
      // member's setting, and never played anyway. Oran speaks ONCE at activation; the Signal audio
      // takes over from here.
      showEscalationActiveState();
      // RULING 2 — the third outcome. Resolved BEFORE the commit POST so the marker already names
      // 'escalated': if the process dies between here and the commit landing, the next launch replays
      // THAT, not an app-close cancel. The server's wall 4 makes the late duplicate a no-op.
      _resolveActivation('escalated');
      commitEscalation(fcmToken);
    }
  }, 1000);
}

/* ══ Feature 010 P3c — the SILENCE-TRIGGER activation screen (Amendment 3) ═══════════════════════
   Until now a no-response escalation_started landed straight on Oran's Promise. Under 010 that screen
   is a LIE at that moment: the engine is holding the member's cancel window and nothing is dialling.
   This is the screen Amendment 3 called for and that no device has yet seen — siren → tone → Oran's
   clip → countdown → one-tap cancel — with Oran's Promise appearing only when the sweep actually
   starts.

   THE ONE STRUCTURAL DIFFERENCE from the button path (_startHelpSequence): that countdown OWNS its
   deadline — at zero the device itself commits the escalation. This countdown owns NOTHING. The engine
   holds the clock (lead-in + window) and dials on silence; this is a faithful MIRROR of a deadline
   being kept elsewhere. So at zero it does not commit, does not dial, and does not flip itself to the
   Promise — it waits for the engine to say the sweep began (the first escalation_advance). That is why
   the cancel here POSTs to the engine instead of just returning locally: the member's tap has to reach
   the process holding the clock, or the contacts get called anyway.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

// Amendment 7 item 3 — the silence trigger's cancel reads as CONFIRMING OKAY (nobody has been called
// and the member is answering the day's open contact), not as escaping a mistap. Button triggers keep
// the plain "CANCEL". The EventLog vocabulary splits on the same line.
const SILENCE_CANCEL_LABEL = "I'M OKAY — CANCEL";
const BUTTON_CANCEL_LABEL = 'CANCEL';

// Backstop for the activation→Promise flip. The flip is normally driven by the first escalation_advance;
// this covers that push being lost (FCM is not guaranteed) so the member is never stranded on a dead
// countdown showing 0. Generous — the advance almost always beats it — and it fails toward the TRUTH:
// by the time it fires the engine's deadline has certainly passed, so the sweep genuinely is running.
const SILENCE_FLIP_BACKSTOP_MS = 12000;

// Poll cadence for the deadline-anchored countdown (see the loop for why it is anchored rather than
// counted). Sub-second so the displayed number turns over promptly at each boundary instead of lagging
// up to a full second behind the deadline it is reporting; the loop repaints only on an actual change,
// so the pulse and its tone still fire exactly once per second.
const SILENCE_TICK_MS = 250;

// The ruled silence-trigger line (owner, 19 Jul): "This is Oran. Iona hasn't been able to reach you
// today. If you're okay, please tap cancel now." Oran/Arthur, bundled static.
// It carries NO number, and that is what makes it usable everywhere: the twelve numbered clips could
// only ever play on a full window, so a cold landing (where part of the window is already gone) had to
// run silent. This line is true at any remaining time, so Oran finally speaks on the path a silence
// trigger actually takes — a backgrounded phone. It also replaces "You have activated your alarm",
// which was false here: the member activated nothing, they were unreachable.
// The BUTTON path is untouched and keeps its numbered clips — there the member did activate the alarm
// and the full window is guaranteed, so both halves of that line stay true.
// Resolved at CALL time, not load time — deliberately a function, matching _activationClipFor. As a
// top-level `const` this read SA_STATIC_BASE (declared ~1300 lines below) while it was still in the
// temporal dead zone, which threw at module load and took the whole of app.js with it: no handlers, no
// screens, blank app. `node --check` cannot see this — it is a runtime fault, not a syntax one.
function _silenceActivationClip() { return SA_STATIC_BASE + 'activation_silence.mp3'; }
// siren 5.00 + attention tone 1.10 + Oran 6.07 = 12.17, rounded up. Paired with the engine's 14s
// lead-in constant — re-measure both if any of the three assets changes.
const SILENCE_SEQUENCE_SECONDS = 13;

let _silenceActivation = null;   // { data, runToken, cancelled, flipped, timer, backstop } while on screen

function _silenceCancelBtn() { return document.getElementById('btn-cancel'); }

// Tear down every timer/listener the activation screen owns. Safe to call twice (both exits use it).
function _silenceTeardown() {
  const s = _silenceActivation;
  if (!s) return;
  if (s.timer) { clearInterval(s.timer); s.timer = null; }
  if (s.backstop) { clearTimeout(s.backstop); s.backstop = null; }
  try { _silenceCancelBtn().removeEventListener('click', s.onCancel); } catch (e) {}
  _silenceCancelBtn().textContent = BUTTON_CANCEL_LABEL;   // restore for the button path
  _summonCountdownActive = false;
}

// The engine says the sweep has begun → hand the screen to Oran's Promise and release the Signal audio
// that escalation_started deliberately did NOT start. Idempotent: only the first caller acts.
function _silenceFlipToPromise(data) {
  const s = _silenceActivation;
  if (!s || s.flipped || s.cancelled) return false;
  s.flipped = true;
  // EXPIRE path — the window ran out and the sweep has begun. Captain 19 Jul: the escalation surface
  // now owns the screen, so the prompts that went unanswered are SUPERSEDED. Offering a stale OKAY
  // against a contact the engine has moved past is the stale-state class.
  _markContactResolvedByAlarm();
  _silenceTeardown();
  _silenceActivation = null;
  // signalAudioStarted was DEFERRED from escalation_started to exactly here (P3c item 3). Starting it at
  // push time would have narrated a reaching phase that had not begun — the audio equivalent of the
  // Promise screen's lie — and would have collided with the activation clip. `data` is the advance's own
  // payload when the flip is advance-driven, so the reducer gets the run's true identity.
  try { signalAudioStarted(data || s.data); } catch (e) { console.warn('[010] deferred signalAudioStarted failed:', e); }
  showEscalationActiveState();
  return true;
}

// CAPTAIN RULING 19 Jul — ENGINE DECLARES, DEVICE OBEYS.
// Both landings now anchor to the engine's ABSOLUTE dial deadline, reconstructed from the three values it
// already sends: `run_ts + device_lead_in + cancel_window`. The semantic shift is intended and ratified:
// the 14s constant is no longer "how long the device's audio takes" — it is the engine's DECLARED lead-in,
// and the device conforms to it, showing only what truly remains.
//
// This is what makes the screen honest under FCM latency, which is the whole problem. Delivery took 5.08s
// on the 08:59 run and 1.16s on the 16:09 one — same device, same network, 4× apart. The old foreground
// path started a full-length window whenever the push happened to land, so every one of those seconds came
// straight off the margin and the engine dialled while the screen still showed time (08:59: 5.04s early).
// Anchored, a slow push simply means a shorter countdown — the screen's zero is DERIVED from the engine's
// deadline and so can never outlive it.
//
// opts.resumeSeconds — retained only as the COLD landing's already-computed remainder (the native ring has
// sounded and the member has been looking at a locked phone). It no longer drives the countdown: the
// deadline does, for both paths.
async function _startSilenceActivation(data, opts) {
  if (_silenceActivation) return;            // duplicate push — one window, never two
  const resumeSeconds = opts && opts.resumeSeconds;
  const _win = _cwClamp(data && data.cancel_window);
  const _lead = parseInt((data && data.device_lead_in) ?? '0', 10) || 0;
  const _runTs = parseInt((data && data.run_ts) ?? '0', 10) || 0;
  // (c) The engine's PUSH-LATENCY BUDGET, carried on the wire. The engine's hold is
  // lead_in + window + budget, so the deadline must include it or the device's zero lands `budget`
  // seconds EARLY — the member would watch the countdown finish and then sit through 8 silent seconds
  // before anything happened. Absent (pre-graft engine) → 0, which reproduces the old arithmetic exactly.
  const _budget = parseInt((data && data.latency_budget) ?? '0', 10) || 0;
  // The engine's dial moment, in device-clock terms. Null when run_ts is absent (a pre-010 or malformed
  // push) — then we fall back to the member's window, which is the old behaviour and no worse than it was.
  const _deadlineAt = _runTs ? _runTs + (_lead + _win + _budget) * 1000 : null;

  /* ── COLLISION B — the observed bug (captain ruling 19 Jul, laws 1 and 3) ───────────────────────
     A member-raised BUTTON window is already live on screen: `_summonCountdownActive` is true but
     `_silenceActivation` is null, because the button path owns `escalationCountdownTimer` and this
     function's own duplicate guard above only sees ITS own window.
     Until this branch, the function ran straight on into a second window over the first — it
     re-rendered via showCancelWindowState(), took the SHARED `escalationCountdownValue` and the
     shared `alarm-countdown-num` node for its own timer, played a second siren/tone/Oran sequence
     over the one still playing, and left the button's timer running to `commitEscalation`
     underneath. That is how one member-situation produced TWO escalations.
     ENGINE WINS BY DEFAULT: adopt the engine's dial deadline into the window already on screen and
     take its run token, so the member's ONE cancel reaches the durable hold row (law 3) — the button
     path's cancelAlarm POSTs whenever a token is known. No second window, no second render, no
     second audio sequence, no second timer.
     Deliberately NOT set here: `_silenceRunToken`. The member pressed help, so their commit governs
     the mode (law 2) and the flip must select Iona's line, not Oran's silence line.
     Deliberately NOT set here: `escalation_state='active'`. The button window has not committed, and
     arming the flag early would hand the button path a lifecycle it does not expect; re-entry is
     already guarded by `_summonCountdownActive`, which is true throughout.
     KNOWN RESIDUAL, ruled to Phase 2: at expiry the device still commits a member-initiated
     escalation while the engine's hold dials its own — two runs. Closing that is the engine-side
     COLLAPSE, which the captain gated behind the restart spike (a half-collapsed hold re-armed by
     orphan recovery would dial contacts the member had superseded). This branch fixes law 1 and
     law 3 today and does not make the expiry case any worse than it already is. ── */
  if (_summonCountdownActive && !_silenceActivation) {
    if (_deadlineAt) _adoptedEngineDeadlineAt = _deadlineAt;
    _activeRunToken = (data && data.run_token) || _activeRunToken;
    return;
  }
  // Remaining per the engine, clamped to the full hold so device/server clock skew can shorten the
  // countdown but never invent time, and FLOORED so the fraction is spent rather than handed out.
  const _remaining = () => (_deadlineAt
    ? Math.max(0, Math.min(_lead + _win + _budget, Math.floor((_deadlineAt - Date.now()) / 1000)))
    : _win);
  const seconds = resumeSeconds != null ? resumeSeconds : (_deadlineAt ? _remaining() : _win);
  // Too little left to be a window at all — a badly delayed push, where the engine has dialled or is about
  // to. Opening a 2-second countdown here would offer a cancel that cannot be honoured; the sweep screen
  // is the truth. Mark the run as silence-triggered first so Amendment 11 still selects Oran's line, then
  // let the reducer's own no-'started'-seen synthesis narrate it off the incoming advance.
  if (seconds > 0 && seconds < SILENCE_SHORT_REMAINDER_DIAGNOSTIC_SECONDS) {
    console.log(`[ALARM] short remainder — ${seconds}s of a ${_win}s window survived delivery latency ` +
                `(run_ts ${_runTs}); showing it anyway per the no-floor ruling`);
  }
  if (seconds <= 0) {
    _silenceRunToken = (data && data.run_token) || null;
    setPreference('escalation_state', 'active');
    setPreference('escalation_state_ts', String(Date.now()));
    showEscalationActiveState();
    return;
  }

  _summonCountdownActive = true;   // reuses the SC-003 duplicate guard: a help press during this window is
                                   // ABSORBED rather than opening a second, competing window.
  // Mirrors the pre-010 handler: the activation is in progress and WILL dial unless cancelled, so the
  // state that gates handleEscalationComplete's terminal render is armed here, exactly as before. The
  // cancel path returns it to idle via showAlarmIdleReset.
  setPreference('escalation_state', 'active');
  setPreference('escalation_state_ts', String(Date.now()));
  _activeRunToken = (data && data.run_token) || null;   // the cancel POST is instance-scoped on this
  _silenceRunToken = _activeRunToken;                   // Amendment 11 — mark THIS run as silence-triggered,
                                                        // so the flip selects Oran's line over Iona's

  const s = { data: data || null, runToken: _activeRunToken, cancelled: false, flipped: false,
              timer: null, backstop: null, onCancel: null };
  _silenceActivation = s;

  escalationCountdownValue = seconds;
  _silenceCancelBtn().textContent = SILENCE_CANCEL_LABEL;
  showCancelWindowState();
  _maxVolumeNow();   // 009 Story 4 — loud from word one, as on every other alarm entry

  s.onCancel = async () => {
    if (s.cancelled || s.flipped) return;
    s.cancelled = true;
    // CANCEL path — Amendment 7: this tap IS the member confirming okay, and it resolves the day's open
    // contact exactly as an okay does. So the queued prompts asking "are you okay?" have already been
    // answered; re-presenting them would ask a question the member just answered, with an OKAY button
    // for a contact that is already closed.
    _markContactResolvedByAlarm();
    // Amendment 9 condition 1 — the tap is live from second zero, through siren, tone and speech, so it
    // must SILENCE them. Same reasoning as the button path: the moment the member cancels, "your contacts
    // will be called in N seconds" is false, and continuing to say it would be the dishonest choice.
    if (_audioCtx) { try { _audioCtx.close(); } catch (e) {} _audioCtx = null; }
    try { if (_saCurrent) { _saCurrent.pause(); _saCurrent = null; } } catch (e) {}
    _silenceTeardown();
    _silenceActivation = null;
    // THE LOAD-BEARING LINE. The clock is in the runner process; a local reset would leave it running and
    // the contacts would be called regardless. postAlarmCancel patches the durable hold row, which is the
    // only cross-process channel there is. The server decides in-window vs late off the row's real status,
    // so a tap racing the deadline is resolved by the engine, never guessed at here.
    await postAlarmCancel();
    showAlarmIdleReset();
  };
  _silenceCancelBtn().addEventListener('click', s.onCancel);

  // Amendment 9 — SEQUENTIAL: siren → attention tone → Oran → countdown. The engine's 14s lead-in
  // constant is the measurement of exactly these three sounds; changing the order or the assets here
  // without re-measuring CANCEL_WINDOW_DEVICE_LEAD_IN_SECONDS would desynchronise screen and engine.
  // A cold landing plays it too now — only skipping when what remains could not fit it, in which case
  // the countdown alone is the honest surface rather than audio that would outlive the engine's dial.
  // Gated on TIME REMAINING, not on which landing this is. Before anchoring, the foreground path always
  // had a full window so the audio always fitted; anchored, it can arrive with very little left if the
  // push was slow, and playing a 12s sequence into a 9s remainder would put Oran still speaking after the
  // contacts had been rung. Same rule now governs both landings: if it does not fit, the countdown alone
  // is the honest surface.
  if (seconds > SILENCE_SEQUENCE_SECONDS + 2) {
    await playAlarmSiren();
    if (s.cancelled || s.flipped) return;
    await playAttentionTone();
    if (s.cancelled || s.flipped) return;
    await _saPlayOnce(_silenceActivationClip());
    if (s.cancelled || s.flipped) return;
  }

  // The sequence has just consumed real time, so re-read the engine's deadline rather than trusting the
  // figure computed before it played. This single line is what the anchoring buys on BOTH paths: whatever
  // the push cost and whatever the audio cost, what the member now sees is what the engine will actually
  // honour. Without a deadline (no run_ts) we keep the old arithmetic as a floor.
  escalationCountdownValue = _deadlineAt
    ? _remaining()
    : Math.max(1, resumeSeconds ? seconds - SILENCE_SEQUENCE_SECONDS : seconds);

  document.getElementById('alarm-countdown-num').textContent = escalationCountdownValue;

  // DEADLINE-ANCHORED, not tick-counted — and this is a correctness choice, not a tidiness one. The
  // margin between this countdown reaching zero and the engine dialling is only ~0.5s (the engine's 14s
  // constant against a measured 13.44s lead-in, rounded up). A setInterval that merely decrements drifts
  // LATE under load — never early — and over 60 ticks at the top of the ladder it can easily accumulate
  // past half a second. That drift points the wrong way: a slow countdown still shows seconds remaining
  // at the moment the engine dials, which is precisely the screen-lies failure the rounding was ratified
  // to prevent. Reading a fixed deadline each tick means drift affects only how promptly a number is
  // repainted, and can never accumulate into the displayed value.
  //
  // ANCHORED (captain ruling): the countdown counts down to the ENGINE'S DIAL MOMENT itself, not to a
  // device-local target derived from it. There is no arithmetic left to drift — the screen's zero IS the
  // engine's deadline. The device-local form survives only as the no-run_ts fallback.
  const zeroAt = _deadlineAt || (Date.now() + escalationCountdownValue * 1000);
  s.timer = setInterval(() => {
    if (s.cancelled || s.flipped) { clearInterval(s.timer); s.timer = null; return; }
    const remaining = Math.max(0, Math.ceil((zeroAt - Date.now()) / 1000));
    if (remaining === escalationCountdownValue) return;   // sub-second tick, nothing to repaint
    escalationCountdownValue = remaining;
    const numEl = document.getElementById('alarm-countdown-num');
    numEl.textContent = escalationCountdownValue;
    numEl.classList.add('pulse');
    setTimeout(() => numEl.classList.remove('pulse'), 200);
    playPulseTone();
    if (escalationCountdownValue <= 0) {
      clearInterval(s.timer); s.timer = null;
      // Zero reached — the member's window is spent. Hide the cancel: the engine's deadline has passed
      // (or is about to), so continuing to offer a one-tap cancel would promise something this screen
      // can no longer guarantee. A member who still wants to stop it gets the Phase-2 two-step control
      // the moment the Promise renders — which routes to the same endpoint and the acknowledge machinery.
      _silenceCancelBtn().classList.add('hidden');
      // And now we WAIT. Not flipping here is the whole point: the engine owns the dial, so only the
      // engine can say the sweep began. Holding at 0 for a beat is the honest reading of the ratified
      // rounding (0 → brief pause → dialing, never "8 seconds left" while contacts already ring).
      s.backstop = setTimeout(() => _silenceFlipToPromise(null), SILENCE_FLIP_BACKSTOP_MS);
    }
  }, SILENCE_TICK_MS);
}

// --- Section 6: Today screen (message display, response POST) ---

let hasResponded = false;
let pendingNotifData = null;

/* ── Captain ruling 19 Jul — the resolved contact's queued prompts are DISCARDED ─────────────────
   Set when an alarm resolves the day's open contact. Two paths, one consequence (captain: "discard,
   both paths"): a CANCEL is the member answering (Amendment 7 — it resolves the day's contact exactly
   as an okay does), and an EXPIRE is superseded (the escalation surface owns the screen; a stale OKAY
   offered against a closed contact is the stale-state class).

   Why a flag alone is not enough: the queued pushes flush when the app foregrounds, which is often
   AFTER the alarm has already returned to rest — so the guard below has to outlive the alarm, not just
   cover it. That is precisely the case the owner reported.

   BOUNDARY (captain, explicit): only the RESOLVED contact's prompts are discarded — a LATER scheduled
   contact must arrive untouched. That is why the two types are treated differently below. ── */
let _contactResolvedByAlarm = false;

function _markContactResolvedByAlarm() { _contactResolvedByAlarm = true; }

// AMENDMENT 11 — which RUN came from a silence trigger, so the sweep-start line can be trigger-selected
// at the flip. Keyed by run_token rather than a bare boolean so a later reactive run in the same app
// session can never inherit the silence routing: the token must match the run the reducer is playing for.
let _silenceRunToken = null;

function showTodayMessage(body, notifData) {
  const _type = notifData?.type;
  // (1) THE GUARD — an alarm is live: a check-in message must never paint over it. This is the defect
  // the owner saw (countdown card and message thread sharing the screen). _alarmFlowActive already
  // encodes "the alarm owns this screen"; this path used to CLEAR it and paint anyway.
  if (_alarmFlowActive) {
    console.log('[010] proactive message suppressed — alarm owns the screen (type=' + _type + ')');
    return;
  }
  // (2) THE DISCARD — the contact this belongs to was resolved by an alarm.
  // Reminders are unambiguous: reminder_1/reminder_2 exist ONLY to chase an unanswered scheduled
  // contact, so once that contact is resolved they are stale BY CONSTRUCTION and can never become
  // valid again. Drop them however late they flush.
  // A scheduled_contact is deliberately NOT dropped here — it opens a NEW cycle, which the captain's
  // boundary says must arrive untouched. Its own in-alarm case is already covered by the guard above.
  // The asymmetry is intentional and it errs the safe way: the worst case is a member seeing one stale
  // greeting, never a real contact being hidden from them.
  if (_contactResolvedByAlarm && (_type === 'reminder_1' || _type === 'reminder_2')) {
    console.log('[010] stale reminder discarded — contact already resolved by an alarm (type=' + _type + ')');
    return;
  }
  if (_type === 'scheduled_contact') _contactResolvedByAlarm = false;   // new cycle — the slate clears
  _alarmFlowActive = false;  // a proactive message now owns the Today screen — OKAY arms normally
  if (ALARM_TIER2_MESSAGE_TAKEOVER) alarmSurfaceTakeover('message');   // tier 2: don't let a reply-awaiting message hide behind a mirror screen
  hideOrb();
  playArrivalPing();
  pendingNotifData = notifData ?? null;
  hasResponded = false;
  let text = body || notifData?.msg || 'How are you?';
  if (notifData?.type === 'reminder_2') {
    text = text.replace('OKAY THANKS', '<span style="color:#25C9BA">OKAY THANKS</span>');
  }
  const timeStr = fmtTime();
  const thread = document.getElementById('today-thread');
  const character = (notifData?.type === 'reminder_1' || notifData?.type === 'reminder_2' || notifData?.type === 'escalation_complete') ? 'oran' : 'iona';
  const card = buildIonaCard(text, timeStr, false, character);
  if (notifData?.type === 'scheduled_contact') {
    thread.innerHTML = card;
  } else {
    thread.insertAdjacentHTML('beforeend', card);
  }
  requestAnimationFrame(() => { const m = document.getElementById('today-messages'); m.scrollTop = m.scrollHeight; });
  document.getElementById('today-empty').classList.add('hidden');
  thread.classList.remove('hidden');
  // Beacon never gets a proactive message; belt-and-braces, never reveal/arm OKAY for Beacon (it is
  // also .hidden via the plan gate). For non-Beacon, a proactive message implies OKAY must be present
  // (and tappable) — reveal it here too, so it shows even if the plan read hasn't resolved yet (the
  // hidden-by-default model). Non-Beacon arm behaviour otherwise unchanged.
  if (_servicePlanName !== BEACON_PLAN) {
    document.getElementById('btn-okay').classList.remove('hidden');
    document.getElementById('btn-okay').classList.remove('okay-pending');  // a message resolves the plan-pending reserve → okay actually shows
    document.getElementById('btn-okay').classList.remove('btn--dim');
    document.getElementById('btn-okay').style.pointerEvents = 'auto';
    document.getElementById('btn-okay').classList.add('btn--pulse');
  }
  document.getElementById('btn-alert').classList.add('btn--pulse');
  document.getElementById('btn-done').classList.add('hidden');
}

async function handleEscalationComplete(data) {
  // R-006-12 C — the card joins the audio authority: consult the SAME verdict FIRST (before any await, so it reads
  // the same pre-mutation state the audio reducer will). A complete the audio would discard (older-run straggler /
  // foreign token) must NOT draw a card — card and audio can no longer disagree. escalation_state is a subordinate belt.
  if (!_saAcceptsComplete({ runToken: (data && data.run_token) || null, runTs: _saParseTs(data) })) {
    console.log(`[SignalAudio] CARD suppressed — stale complete run=${_saTok(data && data.run_token)} ts=${_saParseTs(data)} vs current ts=${_saState.runTs}`);
    return;
  }
  // 009 — a live-call (hands-free) episode owns its terminal CARD (bridge success / dropped / failed-join). The
  // engine's escalation_complete still fires (it retires the feature-005 liveness), but it must not draw a
  // Signal ack card over the conversation the member had. joinPhase is null for Signal + hands-free exhaustion.
  if (_saState.joinPhase) { console.log('[009] escalation_complete card suppressed — join-phase owns the terminal'); return; }
  const savedState = await getPreference('escalation_state');
  if (savedState !== 'active') return; // belt (subordinate to the verdict above): user already dismissed
  // Feature 010 — member-cancelled: neither terminal card is true (nobody was reached, nobody was exhausted).
  // The member acted deliberately and the local cancel path already returned them to rest, so close quietly:
  // restore volume, release the wake-lock, clear state. No card.
  if (data && data.outcome === 'cancelled') {
    _restoreVolumeNow();
    try { Capacitor.Plugins.KeepAwake.allowSleep(); } catch (e) {}
    _hideStopControl();
    await setPreference('escalation_state', 'idle');
    return;
  }
  _restoreVolumeNow();   // 009 Story 4 (R-009-5/T019) — a genuine escalation terminal (ack OR exhausted) → restore prior volume
  await setPreference('escalation_state', 'terminal');
  // Persist the outcome + name alongside 'terminal' so a reopen WHILE THE TERMINAL STILL HOLDS restores the
  // RIGHT card — acknowledged (success/reached) vs exhausted (captain fix 2026-07-12; the restore paths in
  // preLoginBoot/onLoginSuccess read these). Cleared on dismissal by showAlarmIdleReset.
  const _termAck = !!(data && data.outcome === 'acknowledged');
  await setPreference('escalation_terminal_outcome', _termAck ? 'acknowledged' : 'exhausted');
  await setPreference('escalation_terminal_name', (data && data.contact_name) || '');
  const { KeepAwake } = Capacitor.Plugins;
  KeepAwake.allowSleep();
  // Branch on the escalation outcome carried on the push (acknowledged vs exhausted). Default/absent →
  // exhausted (the historical behaviour). A contact who acknowledged gets the positive success terminal.
  if (_termAck) {
    // #5 ruling — coherence: the audio says "I've reached {name}"; the SCREEN must show it. The success
    // card replaces the contact list, so hold the settled calling screen (the "Reached ✓" chip just
    // painted by escalationScreenComplete, now frozen against stragglers) for a beat before the card —
    // the spoken ack terminal plays over this hold. Cold-open/resume restores go straight to the card
    // (escalation_state is already 'terminal' — this hold only shapes the live-foreground moment).
    await _saSettleBeforeCard();   // R-009-29 Directive A — uniform 2000ms settle before the success card
    if ((await getPreference('escalation_state')) === 'terminal') {
      showEscalationAcknowledgedState(data.contact_name || '');
    }
  } else {
    await _saSettleBeforeCard();   // R-009-29 Directive A — uniform 2000ms settle before the exhausted card
    if ((await getPreference('escalation_state')) === 'terminal') {
      showTerminalState();
    }
  }
}

function initTodayDate() {
  const d = new Date();
  const label = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' });
  document.getElementById('today-date').textContent = label;
}

function initTodayActions() {
  document.getElementById('btn-okay').addEventListener('click', async () => {
    if (hasResponded) return;
    hasResponded = true;
    const tapTime = Date.now();
    const REPLY_DELAY_MS = 1000;
    const timeStr = fmtTime();
    const thread = document.getElementById('today-thread');
    // Instant button feedback — tap registers immediately
    thread.insertAdjacentHTML('beforeend', buildBoutRow('Okay, thanks', timeStr));
    document.getElementById('btn-okay').classList.add('btn--dim');
    document.getElementById('btn-okay').classList.remove('btn--pulse');
    document.getElementById('btn-alert').classList.remove('btn--pulse');
    const fcmToken = await getPreference('fcm_token');
    try {
      const res = await fetch(`${STATUS_BASE}/pwa-respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ fcm_token: fcmToken, response: 'okay' }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json().catch(() => ({}));
      const confirmText = data.confirmation
        ? data.confirmation
        : 'Great to hear this. I will be in touch again soon.';
      // Hold until REPLY_DELAY_MS from tap — feels like Iona responding, not a system ack
      const remaining = Math.max(0, REPLY_DELAY_MS - (Date.now() - tapTime));
      await new Promise(r => setTimeout(r, remaining));
      playArrivalPing();
      thread.insertAdjacentHTML('beforeend', buildIonaCard(confirmText, fmtTime(), true));
      requestAnimationFrame(() => { const m = document.getElementById('today-messages'); m.scrollTop = m.scrollHeight; });
    } catch (err) {
      console.error('[Today] pwa-respond failed:', err);
      const remaining = Math.max(0, REPLY_DELAY_MS - (Date.now() - tapTime));
      await new Promise(r => setTimeout(r, remaining));
      playArrivalPing();
      thread.insertAdjacentHTML('beforeend', buildIonaCard('We couldn\'t send your response — please try again.', fmtTime(), true));
      requestAnimationFrame(() => { const m = document.getElementById('today-messages'); m.scrollTop = m.scrollHeight; });
    }
    document.getElementById('btn-done').classList.remove('hidden');
  });

  // RULING 4 (21 Jul) — the in-app help button is TWO-TAP to activate. First tap arms it in place;
  // second tap raises the alarm. The orb and the Flic are UNCHANGED and still fire on one press.
  document.getElementById('btn-alert').addEventListener('click', async () => {
    if (!_helpButtonIsArmed()) { _armHelpButton(); return; }
    _disarmHelpButton();          // clear the armed visuals before the cancel window takes the screen
    await _startHelpSequence('help_control');
  });
  document.getElementById('btn-alert-notnow').addEventListener('click', () => _disarmHelpButton());

  document.getElementById('btn-alarm-done').addEventListener('click', async () => {
    _clearBridgeTerminalReturnTimer();  // manual Return-to-Iona cancels the success-terminal auto-return
    document.getElementById('btn-alarm-done').classList.add('hidden');
    // Fully end any device-dial cycle on "Return to Iona": null _deviceDial FIRST so the native
    // stop's terminal event is ignored (clean today return, not the reached card), then stop the
    // native cycle and clear its persisted state — no lingering cycle, no restore on next launch.
    _hideDeviceDialDecision();
    _deviceDial = null;
    const { ZeroCall } = Capacitor.Plugins;
    if (ZeroCall) ZeroCall.stopDialCycle({}).catch(() => {});
    await removePreference('device_dial_active');
    await setPreference('escalation_state', 'idle');
    const { KeepAwake } = Capacitor.Plugins;
    KeepAwake.allowSleep();
    showAlarmIdleReset();
    showOrb();
  });

  document.getElementById('btn-done').addEventListener('click', async () => {
    _alarmFlowActive = false;  // post-okay-thanks return to resting Today
    hasResponded = false;
    escalationCountdownTimer = null;
    if (escalationTransitionTimer) { clearTimeout(escalationTransitionTimer); escalationTransitionTimer = null; }
    document.getElementById('btn-okay').classList.add('btn--dim');
    document.getElementById('btn-okay').classList.remove('btn--pulse');
    document.getElementById('btn-okay').style.pointerEvents = 'none';
    document.getElementById('btn-alert').classList.remove('hidden');
    document.getElementById('btn-alert').classList.remove('btn--pulse');
    document.getElementById('btn-done').classList.add('hidden');
    document.getElementById('alarm-countdown-card').classList.add('hidden');
    document.getElementById('alarm-escalation-card').classList.add('hidden');
    document.getElementById('alarm-terminal-card').classList.add('hidden');
    document.getElementById('today-thread').innerHTML = '';
    document.getElementById('today-thread').classList.add('hidden');
    document.getElementById('today-empty').classList.remove('hidden');
    await setPreference('escalation_state', 'idle');
    const { KeepAwake } = Capacitor.Plugins;
    KeepAwake.allowSleep();
    showOrb();
  });

  // US3 — Orb as summon trigger (FR-002 seam: orb calls summonHelp, no bridge logic here)
  // pointer-events on the core are controlled via CSS (.orb--btn-on) — only tappable when toggle on
  document.querySelector('#orb-backdrop-system .orb-backdrop-core').addEventListener('click', async () => {
    // RULED (captain, 2026-07-19): THE ORB TAKES NO INPUT BENEATH A LIVE SURFACE.
    // The orb stayed tappable underneath whatever was drawn over it, so a tap aimed at a countdown —
    // or at nothing at all — reached the orb behind and raised a help alert. Owner hit this live on
    // 19 Jul: tapping the middle of a stuck "calling your contacts" screen summoned a fresh alarm.
    // It is also the likeliest real-world source of the window collision the four laws govern (the
    // ruling's origin case was "a screen-wake tap opened a button window 28s before a silence alarm").
    //
    // Reuses _alarmOwnsScreen() — the SAME predicate the back gesture already absorbs on, rather than
    // a second authority that could drift from it (the RESOLVED_STATUSES lesson: two lists is how this
    // bug class recurs). It is DOM/state-derived and biased safe: unreadable state reads as live.
    //
    // Deliberately NOT gated on _alarmFlowActive, which is also true on TERMINAL cards. A member whose
    // escalation ended "nobody could be reached" must still be able to summon again from the orb —
    // blocking that would make a help press silent, which feature 005 forbids. A terminal is a settled
    // surface, not a live one; the ruling says beneath a LIVE surface, and this is that line.
    if (await _alarmOwnsScreen()) return;
    if (!bridgeAttempt || bridgeAttempt.state === 'idle') {
      await _startHelpSequence('orb');
    }
  });
}

/* ══ RULING 4 (21 Jul) — TWO-TAP ACTIVATE on the in-app help button ══════════════════════════════
   Mockup shape A, owner-approved: the button ARMS ITSELF IN PLACE. It fills, its label names the second
   action, and a quiet escape appears beneath it. One target that never moves — so a member who has
   already decided is never asked to find a new button, and the confirmation is carried by the fill and
   the wording instead of by a new surface.

   WHAT THIS IS NOT: it does not touch Amendment 2's ONE-TAP CANCEL during the countdown, which stands
   exactly as ruled. Guard the trigger, keep the escape instant — this is the trigger half. The
   demographic objection that retired two-tap CANCEL (two taps under a 5s clock) does not transfer,
   because there is no clock on the confirm.

   Button-specific by design: the ORB stays one-tap (the deliberately-chosen fast path a member opts
   into in settings) and the physical FLIC is untouched (harder to press by accident, and often the
   fall-case device, where a confirm step would work against the moment it exists for).

   THE ARM LAPSES SILENTLY after ARM_TIMEOUT (owner-ruled 10s, matching the cancel-window ladder's
   default). No record, no EventLog row, no server contact: a first tap that is never confirmed IS NOT
   AN ACTIVATION — nothing fired. Logging lapsed arms would flood the record and, worse, would turn the
   false-tap noise this two-tap exists to absorb into a source of rows. Recording begins at the
   confirming second tap, exactly as ruling 1 says. The lapse is a visual settle, not a message: a
   message would imply something happened, and nothing did. ── */
const HELP_BUTTON_ARM_TIMEOUT_MS = 10000;
const HELP_BUTTON_REST_LABEL  = 'I NEED<br>HELP';
const HELP_BUTTON_ARMED_LABEL = 'TAP AGAIN<br>TO GET HELP';   // PLACEHOLDER copy — owner-reserved.
                                                              // Names the ACTION, not "confirm": a member
                                                              // should not have to recall what the first
                                                              // tap was for.
let _helpBtnArmTimer = null;

// DOM-derived, deliberately — the same lesson as _alarmOwnsScreen: one authority, no second flag that
// can drift out of step with what is actually on screen.
function _helpButtonIsArmed() {
  const b = document.getElementById('btn-alert');
  return !!(b && b.classList.contains('is-armed'));
}

function _armHelpButton() {
  const b = document.getElementById('btn-alert');
  const n = document.getElementById('btn-alert-notnow');
  if (!b) return;
  b.classList.add('is-armed');
  b.innerHTML = HELP_BUTTON_ARMED_LABEL;
  if (n) n.classList.remove('hidden');
  if (_helpBtnArmTimer) clearTimeout(_helpBtnArmTimer);
  _helpBtnArmTimer = setTimeout(_disarmHelpButton, HELP_BUTTON_ARM_TIMEOUT_MS);
}

// Idempotent and safe to call from any state transition — the armed state must never outlive the screen
// it belongs to (the sign-out confirm's lesson: never carry an open confirm across a screen change).
function _disarmHelpButton() {
  const b = document.getElementById('btn-alert');
  const n = document.getElementById('btn-alert-notnow');
  if (_helpBtnArmTimer) { clearTimeout(_helpBtnArmTimer); _helpBtnArmTimer = null; }
  if (b) { b.classList.remove('is-armed'); b.innerHTML = HELP_BUTTON_REST_LABEL; }
  if (n) n.classList.add('hidden');
}

function _applyOrbButtonState(on) {
  const orb = document.getElementById('orb-backdrop-system');
  if (on) orb.classList.add('orb--btn-on');
  else orb.classList.remove('orb--btn-on');
}

// US8 — message font-set (Handwritten ↔ Easy-read). Stamps body[data-font-set] (consumed by the
// CSS --msg-font-* tokens on .iona-msg / .card--oran .iona-msg) and reflects the choice in the
// Appearance control. 'easyread' = Hanken on the two message faces; anything else = 'app' (Handwritten).
function _applyMessageFont(fontSet) {
  const set = fontSet === 'easyread' ? 'easyread' : 'app';
  document.body.dataset.fontSet = set;
  document.querySelectorAll('.msg-font-option').forEach((opt) => {
    opt.classList.toggle('is-selected', opt.dataset.fontSet === set);
  });
}

// US8 — preview greeting for the Appearance font cards: the member's real first name (same source
// the bridge uses, currentMember.customFields['first-name']). Fallback: nameless, no stray comma/gap.
function _previewGreeting() {
  const first = (currentMember?.customFields?.['first-name'] || '').trim();
  return first ? `Good morning ${first}, how are you?` : 'Good morning, how are you?';
}

// US6 — text size (Standard/Large/Larger). Stamps body[data-text-size], which drives the --text-scale
// multiplier the --fs-* reading tokens derive from (scales the message + menu/nav text as a group, and
// the live preview). Reflects the choice in the segmented control. Values: base | large | xl.
function _applyTextSize(size) {
  const s = (size === 'large' || size === 'xl') ? size : 'base';
  document.body.dataset.textSize = s;
  document.querySelectorAll('.text-size-opt').forEach((opt) => {
    opt.classList.toggle('is-selected', opt.dataset.textSize === s);
  });
}

// US7 — theme (Night/Day). Toggles body.light, the element the day-scope colour tokens live on, so
// every semantic token re-resolves on flip (US6 lesson: re-map on the stamped element). Reflects the
// choice in the segmented control. Default night (bare body). Values: night | day.
function _applyTheme(theme) {
  const t = (theme === 'day') ? 'day' : 'night';
  document.body.classList.toggle('light', t === 'day');
  document.querySelectorAll('.theme-opt').forEach((opt) => {
    opt.classList.toggle('is-selected', opt.dataset.theme === t);
  });
}

// Interface feedback mode — sound | vibrate | off. Mirrors _applyTextSize/_applyTheme.
function _applyFeedbackMode(mode) {
  const m = (mode === 'vibrate' || mode === 'off') ? mode : 'sound';
  if (window.Feedback) window.Feedback.setMode(m);
  document.querySelectorAll('.fb-opt').forEach((opt) => {
    opt.classList.toggle('is-selected', opt.dataset.feedback === m);
  });
}

// US2 — settings sheet tab switcher (Service / Appearance / Account). Queries the DOM on each
// call so both open paths (settings nav + paused banner) can reset to the default Service tab.
function _activateSettingsTab(name) {
  document.querySelectorAll('#settings-overlay .settings-tab')
    .forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
  document.querySelectorAll('#settings-overlay .settings-pane')
    .forEach((p) => p.classList.toggle('is-active', p.dataset.pane === name));
  // Ruling 4 — and never carry an ARMED help button behind an opened settings sheet either. Same
  // lesson, same line: a confirm state must not outlive the screen the member was looking at.
  if (typeof _disarmHelpButton === 'function') _disarmHelpButton();
  // US5/T021 — never carry an open sign-out confirm across an open or tab switch.
  const lc = document.getElementById('logout-confirm');
  const am = document.getElementById('account-main');
  if (lc) lc.classList.remove('is-open');
  if (am) am.style.display = '';
  // US6/robustness — return the scroll body to the top on every tab switch / open, so a pane
  // previously scrolled (e.g. Appearance at Larger) doesn't leave a shorter pane scrolled blank.
  const body = document.querySelector('#settings-overlay .settings-body');
  if (body) body.scrollTop = 0;
  if (name === 'service' && typeof _renderGestureChooser === 'function') _renderGestureChooser();  // T019 — reflect the active summon gesture on open
  if (name === 'account' && typeof _saRender === 'function') _saRender();  // settings completion — populate Account cards on open
  else if (typeof _saStopTzClock === 'function') _saStopTzClock();  // stop the Account-tab live clock when leaving it
}

// Settings sheet close — extracted from the ✕ handler so the system back gesture (_initBackButton)
// runs the SAME close, not a copy. Safe when the overlay is already hidden: add('hidden') is
// idempotent, _saStopTzClock is guarded, readAndApplyServiceState() is a re-read. The ONE change from
// the inline body: the captured local `overlay` becomes a fresh getElementById at module scope — the
// same pattern _cmExit/_scExit/_svExit/_lgExit already use for this element.
function _closeSettings() {
  document.getElementById('settings-overlay').classList.add('hidden');
  if (typeof _saStopTzClock === 'function') _saStopTzClock();  // stop the Account-tab live clock on close
  readAndApplyServiceState();  // US2 (FR-025) — Today re-reads on settings close (no stale state)
}

function initSettings() {
  // v2 — Settings: theme toggle (day/night). Saves to Preferences, applies dark/light class on launch.
  // v2 — Settings: button colour toggle ('Iona theme' teal/red vs default white/red). Saves to Preferences, applies btn-theme class on btn-area on launch.
  // v2 — Settings: message font toggle ('Iona style' Dancing Script teal vs plain Newsreader white). Saves to Preferences.
  const overlay = document.getElementById('settings-overlay');

  document.getElementById('nav-settings').addEventListener('click', () => {
    overlay.classList.remove('hidden');
    _activateSettingsTab('service');  // US2 — always open on the Service tab
    readAndApplyServiceState();  // US1 — settings status pill reads true state on open
  });

  // US2 — tab switcher (Service / Appearance / Account)
  overlay.querySelectorAll('.settings-tab').forEach((tab) => {
    tab.addEventListener('click', () => _activateSettingsTab(tab.dataset.tab));
  });

  _bindRoundsSelector();  // rounds (sweep-count) — bind the segmented control once (its DOM is static)

  // Hidden dev toggle (T021 deferred): 7 rapid taps on the Service tab flips dev_mode and reloads, so the
  // FLIC DEV panel is available for field troubleshooting but is OFF by default — a member switching tabs
  // taps once, never seven times, and never sees it. (Standard "tap build-number 7×" pattern.)
  (() => {
    const svc = overlay.querySelector('.settings-tab[data-tab="service"]');
    if (!svc) return;
    let taps = 0, last = 0;
    svc.addEventListener('click', async () => {
      const now = Date.now();
      taps = (now - last < 600) ? taps + 1 : 1;
      last = now;
      if (taps >= 7) {
        taps = 0;
        const on = (await getPreference('dev_mode')) === 'true';
        await setPreference('dev_mode', on ? 'false' : 'true');
        window.location.reload();  // re-init cleanly with the new dev_mode (panel appears/disappears)
      }
    });
  })();

  document.getElementById('btn-settings-close').addEventListener('click', _closeSettings);

  const panel = document.querySelector('.settings-panel');
  const settingsBody = panel.querySelector('.settings-body');
  let startY = 0;
  panel.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
  }, { passive: true });
  panel.addEventListener('touchend', (e) => {
    const endY = e.changedTouches[0].clientY;
    // Only dismiss on a downward swipe when the scroll body is at the top — otherwise a
    // scroll-up gesture through long content would accidentally close the sheet. With short
    // (non-scrolling) content scrollTop stays 0, so this is identical to the old behaviour.
    if (endY - startY > 60 && (!settingsBody || settingsBody.scrollTop <= 0)) {
      overlay.classList.add('hidden');
      readAndApplyServiceState();  // US2 (FR-025) — Today re-reads on swipe-dismiss
    }
  }, { passive: true });

  const { Browser } = Capacitor.Plugins;
  const dashLinks = [];   // Schedule/Contacts/Account/Service/Logs are all native now (no web-punt rows remain)
  dashLinks.forEach(({ id, url }) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', async () => {
      overlay.classList.add('hidden');
      await Browser.open({ url });
    });
  });
  // Local-mirror step 2 — Contacts opens the NATIVE full-screen editor (mockup v4), not the web
  // dashboard. Repurposes the existing Feature-003 deep-link row: hide Settings, show #screen-contacts.
  const _btnContacts = document.getElementById('btn-contacts');
  if (_btnContacts) _btnContacts.addEventListener('click', () => { overlay.classList.add('hidden'); openContactsScreen(); });
  // Local-mirror steps 4/6 — Service delivery opens its native full-screen editor (split out of the Account tab).
  const _btnService = document.getElementById('btn-service');
  if (_btnService) _btnService.addEventListener('click', () => { overlay.classList.add('hidden'); openServiceDeliveryScreen(); });
  // Local-mirror step 3 — Schedule opens the native full-screen editor (Phase A: Standard), not the web dashboard.
  const _btnSchedule = document.getElementById('btn-schedule');
  if (_btnSchedule) _btnSchedule.addEventListener('click', () => { overlay.classList.add('hidden'); openScheduleScreen(); });
  const _btnCancelWindow = document.getElementById('btn-cancel-window');   // Feature 010 — open the cancel-window picker
  if (_btnCancelWindow) _btnCancelWindow.addEventListener('click', () => { overlay.classList.add('hidden'); openCancelWindowScreen(); });
  // Local-mirror step 5 — Activity log opens the native read-only Service history screen (not the web dashboard).
  const _btnLogs = document.getElementById('btn-logs');
  if (_btnLogs) _btnLogs.addEventListener('click', () => { overlay.classList.add('hidden'); openLogsScreen(); });

  // Feature 004 — reactive-method picker: pick a way (writes the preference + re-renders), or, for a
  // non-entitled member, the hands-free row deep-links to the dashboard Account tab to add it. The
  // press-time gate reads the stored value live, so this write is preference-only, never on the safety path.
  async function _setReactiveMethod(mode) {
    const prev = _escalationMode;
    if (mode === prev) return;  // already selected — no write, no flash

    // OPTIMISTIC: move the radio NOW, before any await — a tap must feel instant (0ms perceived).
    // Safe to be optimistic HERE, and ONLY here: this preference NEVER touches the press-time gate. A
    // help-press reads the LIVE SERVER value of escalation_mode at press-time (unchanged by this UI), so
    // in the window where the radio shows the new pick but the write hasn't landed, a press uses the
    // server's value, not the optimistic UI. And no value of escalation_mode — stale, blank, or otherwise
    // — ever leaves a member un-contacted: it only chooses WHICH reaching method; the safety floor
    // (summon-help + escalation) sits underneath and reaches the person regardless. Worst case of a failed
    // write is "reached via the previous method", never "not reached". That is why the help-press itself
    // must NEVER be optimistic — only this settings radio.
    _escalationMode = mode;
    _renderReactiveMethodPicker();

    const fcmToken = await getPreference('fcm_token');
    if (!fcmToken) { _escalationMode = prev; _renderReactiveMethodPicker(); return; }  // can't persist → quiet revert
    try {
      const res = await fetch(`${STATUS_BASE}/pwa-escalation-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ fcm_token: fcmToken, escalation_mode: mode }),
      });
      const data = res.ok ? await res.json().catch(() => null) : null;
      // ok:true (apply-then-return) confirms the write landed → keep the optimistic state (silent confirm,
      // nothing visible happens). Gate on data.ok, NOT res.ok — the route returns HTTP 200 even on a failed
      // write. Re-sync to the server's returned value only if it somehow differs (a no-op when it matches).
      if (data && data.ok === true &&
          (data.escalation_mode === 'escalation' || data.escalation_mode === 'handsfree')) {
        if (data.escalation_mode !== _escalationMode) {
          _escalationMode = data.escalation_mode;
          _renderReactiveMethodPicker();
        }
        return;
      }
    } catch (e) { console.warn('[Method] set failed:', e); }
    // Not confirmed (ok:false / bad body / network error): a failed write means the server value is
    // unchanged, so quietly reconcile the radio back to its pre-tap value. Silent — NO error UI, NO retry,
    // NO alarming state; the radio simply settles to true. (Revert, not a re-read: a re-read can itself
    // fail with the tunnel down and would then hide the picker via _statusReadOk — revert is instant and
    // cannot fail.)
    _escalationMode = prev;
    _renderReactiveMethodPicker();
  }
  const _escRow = document.getElementById('method-row-escalation');
  const _hfRow  = document.getElementById('method-row-handsfree');
  if (_escRow) {
    const pick = () => _setReactiveMethod('escalation');
    _escRow.addEventListener('click', pick);
    _escRow.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  }
  if (_hfRow) {
    const act = async () => {
      if (_hasHandsFree === true) { _setReactiveMethod('handsfree'); }
      else { overlay.classList.add('hidden'); await Browser.open({ url: 'https://iona.today/dashboard#account' }); }
    };
    _hfRow.addEventListener('click', act);
    _hfRow.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
  }

  // Orb Button toggle — OFF by default, persisted via Preferences
  (async () => {
    const stored = await getPreference('orb_button');
    const on = stored === 'true';
    document.getElementById('toggle-orb-btn').checked = on;
    _applyOrbButtonState(on);
  })();
  document.getElementById('toggle-orb-btn').addEventListener('change', async (e) => {
    const on = e.target.checked;
    await setPreference('orb_button', on ? 'true' : 'false');
    _applyOrbButtonState(on);
  });

  // US8 — message font-set (Handwritten ↔ Easy-read), persisted via Preferences. Default 'app'.
  // applyAppearanceOnLaunch already stamps body[data-font-set] before first paint; here we reflect
  // the stored choice in the Appearance control and bind the two option cards.
  // Personalise the preview lines (US8 font cards + US6 text-size preview) to the member's real first name.
  const _greeting = _previewGreeting();
  document.querySelectorAll('.msg-font-preview').forEach((el) => { el.textContent = _greeting; });
  (async () => {
    const stored = (await getPreference('font_set')) || 'app';
    _applyMessageFont(stored === 'easyread' ? 'easyread' : 'app');
  })();
  document.querySelectorAll('.msg-font-option').forEach((opt) => {
    opt.addEventListener('click', async () => {
      const fontSet = opt.dataset.fontSet === 'easyread' ? 'easyread' : 'app';
      await setPreference('font_set', fontSet);
      _applyMessageFont(fontSet);
    });
  });

  // US6 — text size (Standard/Large/Larger), persisted via Preferences. Default 'base'.
  // applyAppearanceOnLaunch already stamps body[data-text-size] before first paint; reflect + bind here.
  (async () => {
    const stored = (await getPreference('text_size')) || 'base';
    _applyTextSize(stored);
  })();
  document.querySelectorAll('.text-size-opt').forEach((opt) => {
    opt.addEventListener('click', async () => {
      const size = opt.dataset.textSize;
      if (!size) return;  // the Theme buttons share .text-size-opt (they carry data-theme, not
                          // data-text-size, and switch via their own separate .theme-opt handler) — bail
                          // so a theme tap never spuriously resets text_size to 'base'.
      await setPreference('text_size', (size === 'large' || size === 'xl') ? size : 'base');
      _applyTextSize(size);
      // Keep the stepper under the finger: the cards above just grew and pushed it down, so after the
      // reflow (next frame — the app's post-layout scroll idiom) scroll it minimally back into view.
      // block:'nearest' = no jump-to-top, no recentre.
      const stepper = opt.closest('.text-size-card') || opt;
      requestAnimationFrame(() => stepper.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    });
  });

  // US7 — theme (Night/Day), persisted via Preferences. Default 'night'. applyAppearanceOnLaunch
  // already stamps body.light before first paint (no flash); reflect the stored choice + bind live.
  (async () => {
    const stored = (await getPreference('theme')) || 'night';
    _applyTheme(stored);
  })();
  document.querySelectorAll('.theme-opt').forEach((opt) => {
    opt.addEventListener('click', async () => {
      const theme = opt.dataset.theme === 'day' ? 'day' : 'night';
      await setPreference('theme', theme);
      _applyTheme(theme);
    });
  });

  // Sound & touch — interface feedback. applyAppearanceOnLaunch already called
  // Feedback.setMode() before first paint; reflect the stored choice + bind live.
  // Each option previews ITSELF on tap (same idiom as the US8 font cards).
  (async () => {
    const stored = (await getPreference('feedback')) || 'sound';
    _applyFeedbackMode(stored);
  })();
  document.querySelectorAll('.fb-opt').forEach((opt) => {
    opt.addEventListener('click', async () => {
      const mode = opt.dataset.feedback;
      if (!mode) return;  // .fb-opt shares .text-size-opt with Theme + Text size —
                          // bail so a tap here never resets those, and vice versa.
      await setPreference('feedback', mode);
      _applyFeedbackMode(mode);
      // Preview the choice the moment it's made. 'off' stays silent, which is
      // itself the honest preview.
      if (mode !== 'off') window.Feedback && window.Feedback.preview('confirm');
    });
  });

  // One delegated listener for the whole app. Never add per-button calls.
  if (window.Feedback) window.Feedback.init();

  // (US4 — "keep trying" passes toggle removed: device dial is automatic fallback, never a user
  // setting. Telephony is detected at launch in the load handler; getDevicePasses() runs the full
  // safe cycle by default. Nothing to bind here.)

  document.getElementById('btn-pause-restart').addEventListener('click', async () => {
    const btn = document.getElementById('btn-pause-restart');
    // Pause/resume writes the SINGLE SOURCE OF TRUTH — the Memberstack member's `service-status` field
    // (the same field the website writes) — and the instant, webhook-triggered Make sync (scenario
    // 1039536) carries it to Airtable in seconds, so the engine acts on it. NO direct Airtable write.
    // Optimistic UI (mirrors _setReactiveMethod / _setSummonGestureChoice): flip the pill/banner/orb NOW,
    // write to Memberstack in the background, revert quietly on failure so the UI never claims a state
    // the engine won't see (a failed pause fail-safes to still-running; a failed resume stays paused + note).
    const prev = _lastServiceStatus;
    const pausing = prev !== 'Paused';
    const msValue = pausing ? 'Paused' : 'Live';        // Memberstack / Airtable / Make vocab — NOT 'Active'
    applyServiceState(pausing ? 'Paused' : 'Active');   // app-internal vocab — optimistic flip (0ms perceived)
    btn.disabled = true;
    let ok = false;
    try {
      if (ms && ms.updateMember) {
        await ms.updateMember({ customFields: { 'service-status': msValue } });
        ok = true;
        // keep the cached member current so a re-read / relaunch reflects the new status instantly
        if (currentMember) {
          currentMember.customFields = currentMember.customFields || {};
          currentMember.customFields['service-status'] = msValue;
          cacheMemberOffline(currentMember);
        }
      }
    } catch (err) {
      console.error('[Settings] service-status write failed:', err);
    }
    if (!ok) {
      applyServiceState(prev);   // quiet revert — never show a state that didn't reach the source of truth
      _showCalmNote(pausing ? 'Couldn’t pause just now — please try again.' : 'Couldn’t restart just now — please try again.');
    }
    btn.disabled = false;
  });
}

// --- Section 7: Setup (contact list, first-time prompt) ---

// --- Section 8: Bridge (reactive voice conference — feature 002) ---

const BRIDGE_RING_TIMEOUT_MS = 30000;
// PHASE 2 — the between-sweep gap is now server-owned (SWEEP_GAP_SECONDS in reply_to_airtable_webhook).
// The app no longer schedules re-sweeps, so no client-side gap constant exists here.
const BRIDGE_DEFAULT_SWEEP_COUNT = 2;
// Clamp a member's sweep count to [1,3], default 2 — SAME floor/ceiling/default as the direct-alert
// engine's _resolve_sweep_count, so the two reactive methods can never diverge on the value.
function _clampSweepCount(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(1, Math.min(3, n)) : BRIDGE_DEFAULT_SWEEP_COUNT;
}
// Connect-anchored call timers (replace the old summon-anchored absolute ceiling). Armed when the
// contact actually JOINS the conference (2 participants), NOT at summon — so they can never cut off a
// call relative to summon. Single tunable pair (ms).
const BRIDGE_CALL_MAX_MS  = 600000;  // 10 min — hard end of a connected call (backstop for a long/open call)
const BRIDGE_CALL_WARN_MS = 540000;  // 9 min — best-effort spoken heads-up before the 10-min end
// Auto-return from the SUCCESS terminal card to the resting Today screen if the user doesn't act.
// Single tunable value (ms). Only the resolved/success terminal arms it (see showBridgeTerminalState).
const BRIDGE_TERMINAL_AUTORETURN_MS = 60000;
// (bridge/device-dial/twilio calls read the single STATUS_BASE defined near the top of the file.)
const NGROK_HEADERS = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' };

let bridgeAttempt = null;
let _bridgeRingTimer = null;
let _bridgeCallEndTimer  = null;  // connect-anchored 10-min hard-end handle
let _bridgeCallWarnTimer = null;  // connect-anchored 9-min warning handle
let _bridgeTerminalReturnTimer = null;  // success-terminal auto-return handle (cleared on any manual act)
let _joinConfirmTimer = null;     // R-009-34 FIX H (app belt) — join-confirmation watchdog handle
const JOIN_CONFIRM_TIMEOUT_MS = 20000;   // R-009-35 A — TRUE last resort. The server primary responds in ~12s
                                         // (8s admit-verify watchdog + its with-phone join_failed push over FCM);
                                         // a belt at 10s FRONT-RAN it and won with worse data (no phone →
                                         // buttonless N4) + a destructive early hangup (R-009-34 ③). At 20s the
                                         // server always wins; the belt fires ONLY if the server is genuinely dark.

// R-009-34 FIX H (app belt) — arm/clear the join-confirmation watchdog. Armed when the member leg joins
// (bridge_join_trigger → _joinConference); cleared the moment join resolves (confirmed / failed / dropped).
function _clearJoinConfirmTimeout() {
  if (_joinConfirmTimer) { clearTimeout(_joinConfirmTimer); _joinConfirmTimer = null; }
}
function _armJoinConfirmTimeout(contactFirst) {
  _clearJoinConfirmTimeout();
  const _name = (contactFirst || '').trim();
  _joinConfirmTimer = setTimeout(() => {
    _joinConfirmTimer = null;
    // Fire ONLY if the join never resolved (still pending). If join_confirmed/failed/dropped already ran, the
    // phase moved off join_pending and this is a no-op — the belt never overrides a real outcome.
    if (_saState.joinPhase !== 'join_pending') return;
    console.warn('[009] FIX H belt — no join_confirmed within ' + JOIN_CONFIRM_TIMEOUT_MS + 'ms; leaving the room + rendering N4 (member never dangles)');
    try { const { TwilioVoice } = Capacitor.Plugins; if (TwilioVoice) TwilioVoice.hangup({}); } catch (e) {}  // leave the room
    _clearRingTimer();
    _saJoinFailed(_name);                  // speak the N4 line (local clip, offline-safe)
    _showFailedJoinTerminal(_name, '');    // N4 card; no phone on the trigger push → re-press floor beneath
  }, JOIN_CONFIRM_TIMEOUT_MS);
}

// Cancel a pending success-terminal auto-return (manual Return-to-Iona, a fresh I NEED HELP press,
// or the resting-Today reset). Safe no-op if none is pending.
function _clearBridgeTerminalReturnTimer() {
  if (_bridgeTerminalReturnTimer) { clearTimeout(_bridgeTerminalReturnTimer); _bridgeTerminalReturnTimer = null; }
}

// Single teardown point: clears the attempt object and stops the foreground service.
// stopService() has no background restriction — safe to call from timers/background events.
function _clearBridgeAttempt() {
  _clearBridgeCallTimers();  // connect-anchored 9-/10-min timers never outlive the attempt
  bridgeAttempt = null;
  const { TwilioVoice } = Capacitor.Plugins;
  if (TwilioVoice) TwilioVoice.stopBridgeService({}).catch(() => {});
}

// T011 — BridgeAttempt runtime state
function _createBridgeAttempt(triggerSource, memberAirtableId) {
  return {
    conferenceId: `bridge-${memberAirtableId}-${Date.now()}`,
    state: 'idle',
    contacts: [],
    currentIndex: 0,                             // read by the join-confirmed / name-lookup survivors; the sweep that DROVE it is gone (Phase 6)
    currentAttemptRecordId: null,
    everConnected: false,                         // PHASE 2 — set true when a contact genuinely joins; gates the disconnected handler
    startTime: Date.now(),
    triggerSource,
    memberAirtableId,
  };
}

// R-009-27 FIX A (#3) — self-sufficient join. The SERVER is the mode authority: if it forked to hold and
// sent a join push, this member IS entitled hands-free. The app must NOT veto the join because its local
// pre-arm (summonHelp) lost the race with the async /pwa-status mode-load (bridgeAttempt still null). If
// there's no active attempt, RECONSTRUCT a minimal armed one from the push — the member rec id is encoded in
// the conference name (bridge-<memberRecId>-<ts>) — so bridge_join_trigger/confirmed/failed all proceed.
// Idempotent: a genuine armed/live attempt stands untouched.
function _ensureBridgeAttemptForJoin(conf) {
  if (bridgeAttempt && bridgeAttempt.state !== 'idle') return true;
  let mid = '';
  try { const p = String(conf || '').split('-'); if (p[1] && p[1].indexOf('rec') === 0) mid = p[1]; } catch (e) {}
  const { TwilioVoice: _tvFgs } = Capacitor.Plugins;
  if (_tvFgs) _tvFgs.startBridgeServiceNow({}).catch(() => {});   // parity with the summonHelp pre-arm (place-leg-from-background)
  bridgeAttempt = _createBridgeAttempt('server_join', mid);
  bridgeAttempt.state = 'armed';
  console.log('[009] FIX A — reconstructed bridgeAttempt for a server join (pre-arm was missing) mid=' + (mid || '(none)'));
  return true;
}

// T018 — EventLog write: retry once, console.error on second failure, never blocking
function logBridgeEvent(eventType, payload = {}) {
  if (!bridgeAttempt) return Promise.resolve(null);
  const currentContact = bridgeAttempt.contacts?.[bridgeAttempt.currentIndex];
  const body = {
    event_type:         eventType,
    member_airtable_id: bridgeAttempt.memberAirtableId,
    conference_id:      bridgeAttempt.conferenceId,
    contact_index:      payload.contact_index ?? null,
    contact_name:       payload.contact_name  || currentContact?.name  || '',
    contact_phone:      payload.contact_phone || currentContact?.phone || '',
    attempt_record_id:  bridgeAttempt.currentAttemptRecordId || null,
    detail:             JSON.stringify(payload),
  };
  const tryPost = () => fetch(`${STATUS_BASE}/bridge/log-event`, {
    method: 'POST', headers: NGROK_HEADERS, body: JSON.stringify(body),
  }).then(r => r.ok ? r.json().then(d => d?.record_id || null) : null);
  return tryPost().catch(() => tryPost().catch(err => {
    console.error('[Bridge] EventLog write failed:', eventType, err);
    return null;
  }));
}

// COLLISION A (feature 010) — summon POST with NO bridgeAttempt.
// logBridgeEvent() above requires one and returns early without it. A help press during a SILENCE window
// has no bridgeAttempt (the press is being converted, not starting a fresh flow), so it needs its own
// minimal poster. Sends only what the BRIDGE_SUMMONED branch actually reads: member id + trigger_source.
// Best-effort by design — a failed POST must never disturb the countdown already on screen. The cost of
// failure is bounded and understood: no collapse, so the engine's hold dials on its own deadline, which
// is exactly today's behaviour (law 4). It degrades to the bug, never past it.
function _postSummonForCollapse(triggerSource) {
  return getPreference('member_airtable_id').then((memberId) => {
    if (!memberId) { console.log('[ALARM] collision A — no member_airtable_id; no collapse'); return null; }
    return fetch(`${STATUS_BASE}/bridge/log-event`, {
      method: 'POST', headers: NGROK_HEADERS,
      body: JSON.stringify({
        event_type: 'BRIDGE_SUMMONED',
        member_airtable_id: memberId,
        detail: JSON.stringify({ trigger_source: triggerSource }),
      }),
    }).then(r => r.ok ? r.json().catch(() => null) : null);
  }).catch((e) => {
    console.log('[ALARM] collision A — summon POST failed; engine keeps its hold (law 4):', e);
    return null;
  });
}

/* ══ RULING 1 + 2 (21 Jul) — RECORD EVERY ACTIVATION, AND HOW IT ENDED ═══════════════════════════
   Until now the first server-side trace of a button/orb/Flic activation appeared at COMMIT — the end of
   the device-side countdown. An activation cancelled or swiped away inside the window therefore left no
   trace at all: the member pressed for help and the record showed nothing. That absence was the defect —
   NOT the missing rescue. A swipe is a legitimate cancel (ruling 3); it simply has to be recorded.

   So: one row per activation, written at press, resolved to exactly ONE outcome.

   `activation_pending` is the durable half. It carries the row id AND the outcome we intend, and it is
   written BEFORE each POST, so a process killed mid-POST replays the RIGHT outcome on next launch rather
   than assuming the worst. Without the stored outcome a failed tap-cancel POST would later be reported as
   an app-close cancel — the same substance, but a lie about the mechanism, and this whole ruling exists
   to stop the record lying.

   The server owns the vocabulary (config.ACTIVATION_OUTCOMES); the device only ever names WHICH outcome,
   never its words — so a copy correction never needs a handset. ── */
let _activationRecordId = null;        // the row THIS window's outcome belongs to
let _activationRecordPromise = null;   // …and the in-flight request for it, because the member can win the race

async function _stashActivationPending(recordId, outcome) {
  try { await setPreference('activation_pending', JSON.stringify({ id: recordId, outcome: outcome || null })); }
  catch (e) { console.log('[ACTIVATION] could not stash pending marker:', e); }
}

// Press-time record (ruling 1). Fire-and-forget by design: a failure must never delay or block the
// member's countdown — the alarm matters more than its paperwork. The cost of failure is bounded and
// honest: no row, exactly as today, never a wrong row.
async function _startActivationRecord(triggerSource) {
  _activationRecordId = null;
  _activationRecordPromise = _requestActivationRecord(triggerSource);
  return _activationRecordPromise;
}

async function _requestActivationRecord(triggerSource) {
  try {
    const memberId = await getPreference('member_airtable_id');
    if (!memberId) { console.log('[ACTIVATION] no member_airtable_id — activation not recorded'); return null; }
    const res = await fetch(`${STATUS_BASE}/bridge/log-event`, {
      method: 'POST', headers: NGROK_HEADERS,
      body: JSON.stringify({
        event_type: 'ACTIVATION_STARTED',
        member_airtable_id: memberId,
        detail: JSON.stringify({ trigger_source: triggerSource }),
      }),
    });
    const d = res.ok ? await res.json().catch(() => null) : null;
    _activationRecordId = (d && d.record_id) || null;
    if (_activationRecordId) {
      await _stashActivationPending(_activationRecordId, null);
      console.log(`[ACTIVATION] recorded at press — ${_activationRecordId} (${triggerSource})`);
    } else {
      console.log('[ACTIVATION] press-time record not written — the window continues regardless');
    }
    return _activationRecordId;
  } catch (e) {
    console.log('[ACTIVATION] press-time record failed — the window continues regardless:', e);
    return null;
  }
}

// Resolve an activation to its one outcome. Stash-then-POST, clear only on a settled answer, so an
// interrupted resolve is retried on the next launch with the outcome it was always meant to carry.
async function _resolveActivation(outcome, recordId) {
  let id = recordId || _activationRecordId;
  /* THE MEMBER CAN BEAT THE RECORD HOME, and usually will (device-found 21 Jul).
     The press-time POST is a real network round trip — measured at 1.2s+ over ngrok on the 6a — while a
     cancel window exists precisely so the member can stop it FAST. Reading only the in-memory id meant a
     cancel inside that round trip found `null` and returned silently: no POST, no log, the row left
     unresolved forever. On the handset the tap-cancels vanished while the swipe (which reads the durable
     marker at next launch) resolved correctly — the two paths disagreed because they consulted different
     sources of truth.
     So: wait for the row this outcome belongs to, then fall back to the marker on disk. A fast cancel is
     the COMMON case, not an edge case, and it is the one the member most wants recorded. This is not
     awaited by cancelAlarm, so nothing on screen waits for it. */
  if (!id && _activationRecordPromise) {
    try { id = await _activationRecordPromise; } catch (e) { id = null; }
  }
  if (!id) {
    try {
      const raw = await getPreference('activation_pending');
      if (raw) id = (JSON.parse(raw) || {}).id || null;
    } catch (e) { id = null; }
  }
  if (!id) return false;
  await _stashActivationPending(id, outcome);
  let settled = false;
  try {
    const res = await fetch(`${STATUS_BASE}/activation-outcome`, {
      method: 'POST', headers: NGROK_HEADERS,
      body: JSON.stringify({ record_id: id, outcome }),
    });
    // 2xx = written (or already resolved — the server's wall 4 answers ok:true for a late duplicate).
    // 404/409 are TERMINAL too: the row is gone, or it is not ours to write. Retrying either on every
    // launch forever would be a permanent false signal, so both settle the marker.
    settled = res.ok || res.status === 404 || res.status === 409;
    console.log(`[ACTIVATION] ${id} → ${outcome} (HTTP ${res.status})`);
  } catch (e) {
    console.log(`[ACTIVATION] ${id} → ${outcome} failed; will retry on next launch:`, e);
  }
  if (settled) {
    try { await removePreference('activation_pending'); } catch (e) {}
    if (id === _activationRecordId) _activationRecordId = null;
  }
  return settled;
}

/* RULING 3 — closing the app IS a cancel for a member-initiated activation, and this is where that
   becomes visible. Teardown is completely silent on Android (verified: no onTaskRemoved anywhere, no
   pagehide/beforeunload, and `visibilitychange → hidden` cannot tell a background — where the countdown
   MUST continue — from a kill), so the honest moment to record it is the next cold launch: a pending
   activation that never resolved means the app went away mid-window.

   MUST RUN BEFORE the launch summon consumers, which can start a fresh activation and overwrite the
   marker. It lifts the marker out before doing anything slow, so a concurrent new press cannot lose it.

   RESIDUAL, stated rather than papered over (accepted at ruling): press → swipe → never reopen leaves
   the row unresolved. Strictly better than today's nothing — and an unresolved activation is itself a
   visible signal. */
async function _reconcileUnresolvedActivation() {
  let raw = null;
  try { raw = await getPreference('activation_pending'); } catch (e) { return; }
  if (!raw) return;
  let pending = null;
  try { pending = JSON.parse(raw); } catch (e) { pending = null; }
  if (!pending || !pending.id) { try { await removePreference('activation_pending'); } catch (e) {} return; }
  const outcome = pending.outcome || 'cancelled_app_close';
  console.log(`[ACTIVATION] unresolved activation ${pending.id} found at launch — resolving as ${outcome}`);
  await _resolveActivation(outcome, pending.id);
}

// PHASE 6 (009) — the parallel bridge sweep is DELETED. Reaching is the ENGINE (run_escalation) for BOTH
// modes; the reaching-exhausted terminal arrives as the engine's escalation_complete (exhausted) → the
// reducer speaks the local exhausted clip + handleEscalationComplete renders the terminal.

// Error states: bridge never connected — no conference to announce to; clear attempt after delay.
function _clearBridgeAttemptAfterDelay() {
  setTimeout(() => { _clearBridgeAttempt(); }, 3000);
}

// Tier 2 — best-effort "Connecting you to {name} now" to the USER when an econtact joins the LIVE
// bridge. Fire-and-forget: never awaited, never blocks or affects the call. The backend endpoint is
// NON-TERMINAL (speaks without hanging up) and handles the 2-participant race + retry itself; the app
// only supplies the locally-known contact name. Any failure is swallowed — the call is unaffected.
function _announceConnectedToUser() {
  // 009 — target the SERVER-minted room the member actually joined (join-trigger), not the stale app-minted
  // conferenceId; and take the name from the join-confirmed push (connectedContactFirst) since the pre-armed
  // attempt has no contacts list. Both fall back to the legacy sources for the pre-009 bridge path.
  const conf = bridgeAttempt && (bridgeAttempt.joinedConference || bridgeAttempt.conferenceId);
  if (!conf) return;
  const name = (bridgeAttempt.connectedContactFirst
    || bridgeAttempt.contacts?.[bridgeAttempt.currentIndex]?.name || '');
  fetch(`${STATUS_BASE}/bridge/announce-to-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'ngrok-skip-browser-warning': 'true' },
    body: new URLSearchParams({ conference_name: conf, contact_name: name }),
  }).catch(err => console.warn('[Bridge] announce-to-user failed (non-fatal):', err));
}

// --- Voice equaliser (orb bars during active bridge) ---
// Imitates a voice pattern: product of two slow irrational-ratio sines creates natural
// pauses (phrase envelope), each bar has its own two-frequency oscillator (syllable
// texture), bell-curve weights keep centre bars louder (voice formant shape).
const _EQ_MIN = 12, _EQ_MAX = 50, _EQ_BARS = 7;
const _EQ_WEIGHTS = [0.55, 0.75, 0.95, 1.0, 0.9, 0.72, 0.5];
let _eqRaf = null;

function _startVoiceEq() {
  const el = document.getElementById('orb-voice');
  if (!el || _eqRaf) return;
  el.classList.remove('hidden');
  const bars = el.querySelectorAll('.orb-bar');
  let t0 = null;
  (function tick(ts) {
    if (!_eqRaf) return; // stopped
    if (!t0) t0 = ts;
    const t = (ts - t0) / 1000;
    // Phrase envelope: product goes negative → natural pauses (baseline height)
    const phrase = Math.max(0, Math.sin(t * 0.72) * Math.sin(t * 0.29)) * 1.45;
    for (let i = 0; i < _EQ_BARS; i++) {
      const osc = (
        Math.sin(t * (2.3 + i * 0.35) + i * 1.2) * 0.55 +
        Math.sin(t * (4.1 + i * 0.5)  + i * 2.5) * 0.45
      ) * 0.5 + 0.5;
      const h = _EQ_MIN + Math.min(1, phrase * osc * _EQ_WEIGHTS[i]) * (_EQ_MAX - _EQ_MIN);
      bars[i].style.height = Math.max(_EQ_MIN, h).toFixed(1) + 'px';
    }
    _eqRaf = requestAnimationFrame(tick);
  })(_eqRaf = 1); // seed non-null so guard passes, first tick replaces it
}

function _stopVoiceEq() {
  if (_eqRaf) { cancelAnimationFrame(_eqRaf); _eqRaf = null; }
  const el = document.getElementById('orb-voice');
  if (!el) return;
  el.classList.add('hidden');
  el.querySelectorAll('.orb-bar').forEach(b => { b.style.height = _EQ_MIN + 'px'; });
}

// Bridge screen 1 — named contacts + Waiting (replaces bare "reaching" bridge-card)
// Bridge screen 2 — orb + voice EQ (contact answered, call live)
function showBridgeInCallState() {
  document.getElementById('alarm-escalation-card').classList.add('hidden');
  document.getElementById('alarm-countdown-card').classList.add('hidden');
  document.getElementById('alarm-terminal-card').classList.add('hidden');
  document.getElementById('bridge-card').classList.add('hidden');
  document.getElementById('btn-okay').classList.add('hidden');
  document.getElementById('btn-okay').classList.remove('btn--pulse');
  document.getElementById('btn-alert').classList.add('hidden');
  document.getElementById('btn-alert').classList.remove('btn--pulse');
  document.getElementById('btn-cancel').classList.add('hidden');
  document.getElementById('btn-alarm-done').classList.add('hidden');
  showOrb(true);   // in-call orb is a deliberate in-flow render — bypass the _alarmFlowActive guard
  _startVoiceEq();
}

// Bridge screen 3 — terminal end screen.
// state='terminal_exhausted': contacts tried, retry allowed via btn-alert.
// Anything else (resolved, duration): escalation-style terminal, Return to Iona only.
function showBridgeTerminalState(state, connectedName, contactPhone) {
  _alarmFlowActive = true;
  _stopVoiceEq();
  hideOrb();
  document.getElementById('alarm-escalation-card').classList.add('hidden');
  document.getElementById('alarm-countdown-card').classList.add('hidden');
  document.getElementById('bridge-card').classList.add('hidden');
  document.getElementById('today-empty').classList.add('hidden');
  document.getElementById('today-thread').classList.add('hidden');
  document.getElementById('btn-okay').classList.add('hidden');
  document.getElementById('btn-okay').classList.remove('btn--pulse');
  document.getElementById('btn-cancel').classList.add('hidden');
  document.getElementById('btn-call-contact').classList.add('hidden');   // default hidden; re-shown per-branch — N4 (R-009-22), N5 (R-009-31 C), completed (R-009-33) all carry the "Call {name}" re-reach button
  _teardownCallAudioNow();   // R-009-32 ④ (generalized #13) — every bridge terminal (N4/N5/exhausted/success)
                             // fully resets the audio route/mode + volume here, not just volume; the spoken
                             // clips (N4/N5) also tear down before their own clip for audibility (belt + braces).
  if (state === 'terminal_dropped') {
    // R-008-5 (feature 008) — TRUTHFUL connected-then-dropped terminal. Shown ONLY when a contact
    // was genuinely connected (everConnected) and the call then dropped involuntarily: the old
    // exhausted copy ("none of your contacts are able to help") was a lie for this case — the
    // conversation happened (FR-009: the exhausted terminal is only permitted after the full ladder
    // is exhausted). Owner-ruled copy; name = the connected contact, captured before the attempt
    // cleared; fallback register matches the resolved card ('your contact').
    const _dn = (connectedName || '').trim();
    document.getElementById('alarm-terminal-title').textContent =
      _dn ? `You were connected to ${_dn}, then the line dropped.`
          : 'You were connected to your contact, then the line dropped.';
    // 009 (R-009-31 Directive C) — PARITY with N4: a device-dial "📞 Call {name}" to the contact who was just
    // on the line (they know you need help — R-009-4). Same primitive as N4 (_callContactDirect / ZeroCall).
    // The I NEED HELP re-press stays the standing floor beneath it. No number captured → the shell's floor only.
    const _dropBtn = document.getElementById('btn-call-contact');
    if (contactPhone) {
      _dropBtn.textContent = _dn ? `📞 Call ${_dn}` : '📞 Call your contact';
      _dropBtn.onclick = () => { _callContactDirect(contactPhone); };
      _dropBtn.classList.remove('hidden');
      document.getElementById('alarm-terminal-sub').textContent = 'Tap to call them, or press I NEED HELP to try again.';
    } else {
      document.getElementById('alarm-terminal-sub').textContent = 'Press I NEED HELP to try again.';
    }
    document.getElementById('btn-alert').classList.remove('hidden');
    document.getElementById('btn-alert').classList.remove('btn--pulse');
    document.getElementById('btn-alarm-done').classList.remove('hidden');
  } else if (state === 'terminal_failed_join') {
    // 009 (R-009-16 N4 / T015) — the contact ANSWERED and accepted, but the member device could not join in
    // the 8s window. NOT the exhausted lie (a willing human is standing by, R-009-4): reuse this 008
    // dropped-card SHELL with its EXISTING actions — I NEED HELP re-press (the standing floor, which reaches
    // the accepting contact via the engine / device-dial floor) + Return to Iona. Spoken locally by
    // _saJoinFailed (offline-safe). Name carried per R-009-16.
    const _fj = (connectedName || '').trim();
    document.getElementById('alarm-terminal-title').textContent =
      _fj ? `${_fj} answered and knows you need help.`
          : 'Your contact answered and knows you need help.';
    // 009 (R-009-22) — PRIMARY action: a device-driven "Call {name}" to the accepting contact (a willing human
    // is standing by — R-009-4). The I NEED HELP re-press stays the standing floor beneath it.
    const _fjBtn = document.getElementById('btn-call-contact');
    if (contactPhone) {
      _fjBtn.textContent = _fj ? `📞 Call ${_fj}` : '📞 Call your contact';
      _fjBtn.onclick = () => { _callContactDirect(contactPhone); };
      _fjBtn.classList.remove('hidden');
      document.getElementById('alarm-terminal-sub').textContent = 'Tap to call them, or press I NEED HELP to try again.';
    } else {
      // No number captured (rare) — fall to the shell's re-press floor, never a dead button.
      document.getElementById('alarm-terminal-sub').textContent = 'Press I NEED HELP to try again.';
    }
    document.getElementById('btn-alert').classList.remove('hidden');
    document.getElementById('btn-alert').classList.remove('btn--pulse');
    document.getElementById('btn-alarm-done').classList.remove('hidden');
  } else if (state === 'terminal_exhausted') {
    // T022 — exhausted card. COPY-SYNC (captain Finding 1): the title is the FIRST sentence of the
    // SERVER-spoken terminal line (escalation_copy.exhausted_line() in reply_to_airtable_webhook — deck
    // v1.2 moved it out of the old BRIDGE_TERMINAL_MESSAGE constant; shared by the sweep terminal and the
    // safety-floor watchdog); the sub carries the retry instruction. The server line is now method-aware
    // (it names the physical button OR the app), but this card keeps the BOTH-options wording — the safe
    // default — so a member reading it always sees every way back in. Keep in step with escalation_copy.py.
    document.getElementById('alarm-terminal-title').textContent = 'None of your contacts are able to help right now.';
    document.getElementById('alarm-terminal-sub').textContent   = 'Press your button, or I NEED HELP, to try again.';
    document.getElementById('btn-alert').classList.remove('hidden');
    document.getElementById('btn-alert').classList.remove('btn--pulse');
    document.getElementById('btn-alarm-done').classList.remove('hidden');
  } else {
    // Resolved/success → the SHARED restyled success terminal (one card for bridge + escalation).
    // Bridge truth: the user was on a call with them. Returns — the shared fn owns card-show + 60s arm.
    // R-009-33 — pass the contact number so the completed bridge terminal shows the single re-reach button
    // (covers the connect-then-DONE and the indistinguishable connect-then-DROPPED cases). Escalation-
    // acknowledged calls showSuccessTerminal with NO callPhone → no button (unchanged).
    showSuccessTerminal({ leadCopy: 'We connected you with', name: connectedName, nameFallback: 'your contact', callPhone: contactPhone });
    return;
  }
  _showTerminalCard();
  // 60s auto-return to resting Today (the EXHAUSTED terminal). Cancelled by a manual Return-to-Iona,
  // a fresh I NEED HELP press, or any resting-Today reset.
  _clearBridgeTerminalReturnTimer();
  _bridgeTerminalReturnTimer = setTimeout(showAlarmIdleReset, BRIDGE_TERMINAL_AUTORETURN_MS);
}

// T016 / T017 — Bridge UI state rendering
function showBridgeCard(state, connectedName, contactPhone) {
  _alarmFlowActive = true;  // any bridge screen (incl. already_connecting/error fallback) owns the Today screen
  alarmSurfaceTakeover('bridge');   // incoming bridge/Oran call — close any overlay/mirror screen first
  if (state === 'in_call') {
    showBridgeInCallState();
    return;
  }
  if (state === 'terminal_exhausted' || state === 'terminal_dropped' || state === 'terminal_failed_join') {
    showBridgeTerminalState(state, connectedName, contactPhone);
    return;
  }

  // Fallback: already_connecting / error — bare bridge-card
  const card  = document.getElementById('bridge-card');
  const label = document.getElementById('bridge-label');
  const sub   = document.getElementById('bridge-sub');
  card.classList.remove('bridge-card--dialing', 'bridge-card--in-call',
                        'bridge-card--terminal', 'bridge-card--error');
  if (state === 'already_connecting') {
    card.classList.add('bridge-card--dialing');
    label.textContent = 'Already connecting…';
    sub.textContent   = '';
  } else if (state === 'error') {
    card.classList.add('bridge-card--error');
    label.textContent = 'Something stopped me from reaching your contacts.';
    sub.textContent   = 'Press I NEED HELP to try again.';
    _stopVoiceEq();
    _clearBridgeAttemptAfterDelay();
  }
  card.classList.remove('hidden');
}

function hideBridgeCard() {
  _alarmFlowActive = false;  // bridge resolved → back to the resting Today screen
  _stopVoiceEq();
  hideOrb();
  document.getElementById('bridge-card').classList.add('hidden');
  document.getElementById('bridge-card').classList.remove(
    'bridge-card--dialing', 'bridge-card--in-call', 'bridge-card--terminal', 'bridge-card--error');
  document.getElementById('alarm-escalation-card').classList.add('hidden');
  document.getElementById('btn-okay').classList.remove('hidden');
  document.getElementById('btn-okay').classList.remove('okay-pending');  // belt-and-braces: bridge end resolves any lingering plan-pending reserve
  document.getElementById('btn-alert').classList.remove('hidden');
}

function _setBridgeState(state) {
  if (bridgeAttempt) bridgeAttempt.state = state;
  if (state !== 'idle') showBridgeCard(state);
}

// Connect-anchored call timers (replace the old summon-anchored watchdog). Armed at CONNECT
// (contact joined → 2 participants), cleared only when the call ends. At 9 min a best-effort spoken
// heads-up; at 10 min a hard end that routes into the EXISTING terminal (the user-leg hangup fires
// the normal 'disconnected' → resolved path). Best-effort: a failed warning never blocks the call.
function _startBridgeCallTimers() {
  _clearBridgeCallTimers();
  _bridgeCallWarnTimer = setTimeout(() => { _announceBridgeWarning(); }, BRIDGE_CALL_WARN_MS);
  _bridgeCallEndTimer  = setTimeout(() => { _endBridgeCallByTimer(); }, BRIDGE_CALL_MAX_MS);
}

function _clearBridgeCallTimers() {
  if (_bridgeCallWarnTimer) { clearTimeout(_bridgeCallWarnTimer); _bridgeCallWarnTimer = null; }
  if (_bridgeCallEndTimer)  { clearTimeout(_bridgeCallEndTimer);  _bridgeCallEndTimer  = null; }
}

// 9-min heads-up — best-effort, NON-terminal (reuses the Tier-2 announce path, which speaks without
// hanging up). Owner-locked copy. Any failure is swallowed: the call still ends cleanly at 10 min.
function _announceBridgeWarning() {
  if (!bridgeAttempt || !bridgeAttempt.conferenceId) return;
  fetch(`${STATUS_BASE}/bridge/announce-to-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'ngrok-skip-browser-warning': 'true' },
    body: new URLSearchParams({
      conference_name: bridgeAttempt.conferenceId,
      message: 'Just to let you know, this call will end in a minute or so.',
      scope: 'all',  // announce to BOTH legs (user + contact) — the heads-up is for both
    }),
  }).catch(err => console.warn('[Bridge] 9-min warning announce failed (non-fatal):', err));
}

// 10-min hard end — end the USER's leg (deliberate → the normal 'disconnected' resolved path renders
// the existing terminal) and best-effort drop the CONTACT (anchor) leg so they aren't left alone in
// the conference. No spoken line here — the 9-min warning already gave the heads-up.
function _endBridgeCallByTimer() {
  if (!bridgeAttempt) return;
  const conf = bridgeAttempt.conferenceId;
  _clearBridgeCallTimers();
  if (conf) {
    fetch(`${STATUS_BASE}/bridge/end-call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'ngrok-skip-browser-warning': 'true' },
      body: new URLSearchParams({ conference_name: conf }),
    }).catch(err => console.warn('[Bridge] end-call (contact leg) failed (non-fatal):', err));
  }
  const { TwilioVoice } = Capacitor.Plugins;
  if (TwilioVoice) TwilioVoice.hangup({});  // → 'disconnected' (deliberate) → existing resolved terminal
}

function _clearRingTimer() {
  if (_bridgeRingTimer) { clearTimeout(_bridgeRingTimer); _bridgeRingTimer = null; }
}

function _cleanupBridgeTimers() {
  _clearRingTimer();
  _clearBridgeCallTimers();
  _clearJoinConfirmTimeout();   // R-009-34 FIX H (belt) — any terminal cleanup disarms the join watchdog
}

// FR-016 — hard bridge failure (contacts never tried) falls through to Iona escalation.
// Covers: mic denied, voice-token error, contacts-fetch error.
// NOT contact exhaustion — that is a user-initiated retry via btn-alert.
// Escalation is independent: uses SpeechSynthesis + /pwa-respond, no mic or Twilio SDK needed.
function _onBridgeExhausted() {
  _startIonaEscalation(true);
}

async function _fetchVoiceToken() {
  const identity = bridgeAttempt?.memberAirtableId ?? 'bridge-user';
  const res = await fetch(
    `${STATUS_BASE}/twilio/voice-token?identity=${encodeURIComponent(identity)}`,
    { headers: { 'ngrok-skip-browser-warning': 'true' } }
  );
  if (!res.ok) throw new Error(`voice-token HTTP ${res.status}`);
  const data = await res.json();
  return data.token ?? data.value;
}

// PHASE 6 (009) — the app-side sweep surface (_advanceContact/_scheduleReSweep, and the display-only
// bridge_advance/bridge_terminal reflectors) is DELETED. Reaching is the ENGINE for both modes; the app
// reflects it through the escalation_* reducer (007 screen), not a bridge sweep.

// T013 — dial current contact: user joins conference + backend dials contact
// Join user's leg to the conference — called ONCE at bridge start, never on contact advance.
async function _joinConference(conferenceOverride = null) {
  if (!bridgeAttempt) return false;
  // 009 T011 — push-authoritative room: the join-trigger carries the conference the server is holding the
  // accepting contact for, so the member leg MUST land there or the admit never matches _hold_state. Falls
  // back to the app-minted id (they are the same room; the override is the single authority — R4).
  const _joinConf = conferenceOverride || bridgeAttempt.conferenceId;

  let accessToken;
  try {
    accessToken = await _fetchVoiceToken();
  } catch (err) {
    console.error('[Bridge] voice-token fetch failed:', err);
    logBridgeEvent('BRIDGE_TERMINAL', { reason: 'token_error', error: err.message });
    _clearBridgeAttempt();
    hideBridgeCard();
    _cleanupBridgeTimers();
    _onBridgeExhausted();
    return false;
  }

  const { TwilioVoice } = Capacitor.Plugins;
  try {
    await TwilioVoice.connectOutbound({
      accessToken,
      conferenceName: _joinConf,
      endOnExit: 'false',
      bridge: 'true',
    });
  } catch (err) {
    console.error('[Bridge] connectOutbound failed:', err);
    logBridgeEvent('BRIDGE_TERMINAL', { reason: 'connect_failure', error: err.message });
    _clearBridgeAttempt();
    hideBridgeCard();
    _cleanupBridgeTimers();
    _onBridgeExhausted();
    return false;
  }
  return true;
}

// PHASE 2 — a connected call dropped involuntarily. The server owns the reaching sweep; the app does
// NOT re-drive contacts here. (009 T023 — FR-014 auto-reconnect deleted: a dropped LIVE call now goes
// STRAIGHT to this truthful dropped terminal, no silent re-ring.) End cleanly on the TRUTHFUL dropped
// terminal (R-008-5): this path only runs after a contact genuinely connected, so the old exhausted
// card ("none of your contacts are able to help") was false here — the conversation happened. Name
// captured BEFORE _clearBridgeAttempt nulls the attempt (the resolved-terminal capture-before-clear
// pattern). Retry way-back unchanged (I NEED HELP; offline it lands on the device-dial floor).
async function _bridgeDroppedTerminal() {
  // 009 T016 — the R-008-5 dropped card is UNCHANGED in copy + actions; 009 only teaches it to SPEAK (N5),
  // carrying the name (R-009-16). Name = the connected contact — the join-confirmed push's contact_first
  // under late-join (the pre-armed attempt has no contacts list), falling back to the legacy contacts lookup.
  const _dropName = (bridgeAttempt?.connectedContactFirst
    || (bridgeAttempt?.contacts?.[bridgeAttempt.currentIndex]?.name || '').split(' ')[0] || '');
  // R-009-31 Directive C — carry the connected contact's number onto the N5 dropped card so it gains the
  // SAME "📞 Call {name}" device-dial action as N4 (a willing human was just on the line — R-009-4). Captured
  // BEFORE _clearBridgeAttempt nulls it (join-confirmed push, R-009-22 connectedContactPhone).
  const _dropPhone = (bridgeAttempt?.connectedContactPhone || '').trim();
  setPreference('escalation_state', 'idle');
  _cleanupBridgeTimers();
  await _saDropped(_dropName);   // R-009-31 #13 — teardown the live-call audio route + restore media/volume, THEN speak the N5 clip (awaited so the settle+card follow the clip, not the drop)
  _clearBridgeAttempt();
  await _saSettleBeforeCard();   // R-009-29 Directive A — uniform 2000ms settle before the N5 dropped card (clip plays during the hold)
  showBridgeCard('terminal_dropped', _dropName, _dropPhone);
}

// 009 (T015) — N4 failed-join terminal. Capture the name, tidy the attempt/timers, reset escalation_state so
// a re-press summons cleanly, then render the 008 dropped-card SHELL with the N4 copy-variant (the spoken N4
// line fires from _saJoinFailed in the push handler). Mirrors _bridgeDroppedTerminal's capture-before-clear.
async function _showFailedJoinTerminal(contactFirst, contactPhone) {
  setPreference('escalation_state', 'idle');
  _cleanupBridgeTimers();
  _clearBridgeAttempt();
  await _saSettleBeforeCard();   // R-009-29 Directive A — uniform 2000ms settle before the N4 card (the _saJoinFailed clip plays during the hold)
  showBridgeCard('terminal_failed_join', contactFirst || '', contactPhone || '');
}

// 009 (R-009-22) — place a SINGLE real carrier call to the accepting contact from the member's own phone,
// via the SAME native primitive as the device-dial floor (ZeroCall). One number, one pass: the native dialer
// takes over the screen. Best-effort — a member with no telephony still has the I-NEED-HELP re-press floor.
async function _callContactDirect(phone) {
  if (!phone) return;
  const { ZeroCall } = Capacitor.Plugins;
  if (!ZeroCall || !_hasTelephony) { console.warn('[009] Call contact — no telephony; use I NEED HELP'); return; }
  try { await ZeroCall.startDialCycle({ numbers: [phone], passes: 1 }); }
  catch (e) { console.error('[009] Call contact dial failed:', e); }
}

// T010 — summonHelp: single entry point for all triggers (FR-002, FR-001: no confirmation step)
async function summonHelp(triggerSource) {
  // 009 (R-009-20/21) ONE reaching engine — summonHelp NO LONGER kicks a parallel bridge sweep. The ENGINE
  // (run_escalation, reached via the caller's commitEscalation fall-through) drives reaching for BOTH modes,
  // emitting the escalation_* stream the reducer + 007 chips render; the server's econtact press-1 fork is
  // the SOLE mode authority for the accept consequence (Signal ack vs hold-then-admit). summonHelp's only
  // remaining job is to PRE-ARM the join capability for a member THIS APP knows is hands-free — an FGS + a
  // bridgeAttempt in 'armed' state — so a later bridge_join_trigger (a contact accepted → server holding
  // them) can place the member leg fast (_joinConference). It ALWAYS returns false → the caller proceeds to
  // the engine. Arming keys off the app's OWN mode knowledge (R-009-21 #2): arming a lapsed member is a
  // harmless FGS start + a dormant bridgeAttempt; the live entitlement decision is the server fork.
  // (The old /bridge/contacts gate + _dialCurrentContact sweep kick were DELETED in Phase 6.)
  if (bridgeAttempt && bridgeAttempt.state !== 'idle') return false;   // already armed/joined — let it stand
  const _wantJoin = (_hasHandsFree === true && _escalationMode === 'handsfree');
  if (!_wantJoin) return false;   // Signal (or mode not yet known) → nothing to pre-arm; the engine drives reaching

  // Start the foreground service NOW — synchronously, before any await — so it reaches the main thread while
  // the Activity is still foreground (Android 12+ blocks startForegroundService() after onStop()). Needed so
  // the member leg can be placed from background at the join-trigger. Cleared with the bridgeAttempt.
  const { TwilioVoice: _tvFgs } = Capacitor.Plugins;
  if (_tvFgs) _tvFgs.startBridgeServiceNow({}).catch(() => {});
  const { KeepAwake } = Capacitor.Plugins;
  KeepAwake.keepAwake();

  const memberAirtableId = await getPreference('member_airtable_id');
  if (!memberAirtableId) {
    console.error('[Bridge] summonHelp pre-arm — member_airtable_id not found; engine still runs (never-silent)');
    if (_tvFgs) _tvFgs.stopBridgeService({}).catch(() => {});
    return false;
  }
  // Pre-arm: a bridgeAttempt in 'armed' (state != 'idle', so the bridge_join_trigger / _confirmed handlers
  // fire) but with NO reaching UI — the 007 escalation screen (shown by the caller / escalation_started)
  // owns reaching in both modes now, so we deliberately do NOT _setBridgeState('summoning') (the retired
  // bridge dialing screen). The join-phase screen transitions land at accept (T013).
  bridgeAttempt = _createBridgeAttempt(triggerSource, memberAirtableId);
  bridgeAttempt.state = 'armed';
  logBridgeEvent('BRIDGE_SUMMONED', { trigger_source: triggerSource });
  console.log('[Bridge] summonHelp — hands-free PRE-ARMED (armed-don\'t-dial); engine drives reaching');
  return false;   // ALWAYS false → caller runs the engine (commitEscalation)
}

// T014 — TwilioVoice event listeners: FR-007 (resolved) / FR-014 (involuntary drop)
function _initBridgeListeners() {
  const { TwilioVoice } = Capacitor.Plugins;
  if (!TwilioVoice) return;

  TwilioVoice.addListener('connected', () => {
    if (_svcTestCall.active) {                                            // Brief B v3 — service-test leg connected
      _svcTestCall.connected = true;
      // Audio has begun — schedule the Ringing→Connected flip to land ~at the "Connecting with Iona" beat.
      _svcTestClearTimers();
      _svcTestFlipTimer = setTimeout(() => {
        _svcTestCall.reachedConnect = true;
        try { setContactStatus(0, 'reached'); } catch (e) {}
      }, SERVICE_TEST_CONNECT_FLIP_MS);
      return;
    }
    if (!bridgeAttempt || bridgeAttempt.state === 'idle') return;
    // Initial dial: user is in the conference but contact hasn't joined yet.
    // Do NOT clear the ring timer — it fires at 30s to advance on no-answer.
    // in_call is set via bridge_contact_joined FCM push when contact presses a key.
  });

  TwilioVoice.addListener('disconnected', (event) => {
    if (_svcTestCall.active) {                                            // Brief B v3 — service-test leg ended
      const reached = _svcTestCall.reachedConnect;
      const wasConnected = _svcTestCall.connected;
      const { conferenceName, recId, source } = _svcTestCall;
      _svcTestClear();
      // Terminal is best-effort (the server EventLog row is authoritative): reached the connect beat → success;
      // else "didn't finish". A leg that NEVER connected → never-silent report so the server logs one Unanswered.
      if (!wasConnected) _reportServiceTestNotConnected(conferenceName, recId, source);
      _showServiceTestTerminal(reached);
      return;
    }
    if (!bridgeAttempt || bridgeAttempt.state === 'idle') return;
    _clearRingTimer();

    // Terminal already claimed (server terminal FCM, or a prior exhausted flip): show the card.
    // Sequence: server speaks → Twilio <Hangup/> → disconnected fires here → card appears.
    if (bridgeAttempt.state === 'terminal_exhausted') {
      const terminalState = bridgeAttempt.state;
      _clearBridgeAttempt();
      showBridgeCard(terminalState);
      return;
    }
    // Error: card already shown upstream; just clear the attempt.
    if (bridgeAttempt.state === 'error') {
      _clearBridgeAttempt();
      return;
    }

    // PHASE 2 — gate on whether a contact ever genuinely connected (everConnected), NOT on involuntary
    // alone. During the REACHING phase (no contact connected yet) the SERVER owns the sweep and its
    // terminal: any disconnect here means the reaching phase ended server-side (exhausted terminal, or the
    // leg dropped). Show the exhausted card (retry via I NEED HELP) — never claim success, never reconnect
    // into a dead reaching conference.
    if (!bridgeAttempt.everConnected) {
      setPreference('escalation_state', 'idle');
      _cleanupBridgeTimers();
      _clearBridgeAttempt();
      showBridgeCard('terminal_exhausted');
      return;
    }

    // Below: a contact genuinely connected (everConnected === true).
    if (!event?.involuntary) {
      // FR-007: deliberate end — contact hung up, attempt is resolved.
      // Capture the connected contact's name NOW — _clearBridgeAttempt() below nulls bridgeAttempt
      // before the terminal card renders, so the name must be read first (empty → generic fallback).
      // 009 — under late-join the pre-armed attempt has NO contacts list; the name is the join-confirmed
      // push's contact_first (stored at connectedContactFirst), falling back to the legacy contacts lookup.
      const _connectedName = bridgeAttempt.connectedContactFirst
        || bridgeAttempt.contacts?.[bridgeAttempt.currentIndex]?.name || '';
      // R-009-33 — a contact-side drop is INDISTINGUISHABLE from a hangup (Twilio reports both as
      // participant_hung_up), so this completed terminal covers BOTH "we finished" and "the line dropped".
      // Carry the contact's number onto it (captured before clear, R-009-22 connectedContactPhone) so the
      // card can offer the single re-reach button — a member cut off mid-call taps it to call them straight back.
      const _connectedPhone = (bridgeAttempt.connectedContactPhone
        || bridgeAttempt.contacts?.[bridgeAttempt.currentIndex]?.phone || '').trim();
      logBridgeEvent('BRIDGE_RESOLVED', {
        contact_index: bridgeAttempt.currentIndex,
        contact_phone: bridgeAttempt.contacts?.[bridgeAttempt.currentIndex]?.phone || '',
        duration_s: Math.round((Date.now() - bridgeAttempt.startTime) / 1000),
      });
      _cleanupBridgeTimers();
      _clearBridgeAttempt();
      showBridgeTerminalState(undefined, _connectedName, _connectedPhone);
      return;
    }

    // 009 T023 — FR-014 auto-reconnect DELETED. An involuntary drop of a LIVE (connected) call goes
    // STRAIGHT to the truthful dropped terminal (N5) — no silent re-ring into a call the member can't
    // hear. The server owns the reaching sweep; the app never re-drives contacts.
    logBridgeEvent('BRIDGE_DROPPED', {
      contact_index: bridgeAttempt.currentIndex,
      error: event.error ?? null,
    });
    _bridgeDroppedTerminal();
  });

  TwilioVoice.addListener('error', (event) => {
    if (_svcTestCall.active) {                                            // Brief B v3 — service-test leg errored
      const wasConnected = _svcTestCall.connected;
      const { conferenceName, recId, source } = _svcTestCall;
      _svcTestClear();
      if (!wasConnected) _reportServiceTestNotConnected(conferenceName, recId, source);   // never-silent
      _showServiceTestTerminal(false);
      return;
    }
    if (!bridgeAttempt || bridgeAttempt.state === 'idle') return;
    _clearRingTimer();

    // mic denied = hard conference failure: user has no voice leg regardless of how many
    // contacts are dialled. Skip contact iteration — clean up and fall through to escalation.
    if (event?.error === 'microphone_denied') {
      logBridgeEvent('BRIDGE_TERMINAL', { reason: 'microphone_denied' });
      _cleanupBridgeTimers();
      _clearBridgeAttempt();
      hideBridgeCard();
      _onBridgeExhausted();
      return;
    }

    // PHASE 2 — any other user-leg error (e.g. connectFailure). The SERVER owns contact iteration now
    // (it dials each contact via REST + StatusCallback), so the app does NOT advance the sweep here.
    // Record the event for the audit trail and clear the ring timer; the server sweep + terminal + the
    // safety-floor watchdog own how the bridge ends.
    logBridgeEvent('BRIDGE_NO_ANSWER', {
      contact_index: bridgeAttempt.currentIndex,
      error: event?.error,
    });
  });
}

// --- Section 9: Device dial — offline carrier-call fallback floor ---
// The cache is the ONLY contact source device dial reads at call time (it must work with no
// network). OVERWRITE-only, never cleared, timestamped. Refreshed on launch/foreground (the
// reliable backbone, independent of the reactive path) and topped up opportunistically
// whenever a calling screen loads. An empty cache is worse than a stale one — stale wins.

const DEVICE_DIAL_CACHE_KEY = 'device_dial_contacts';
const DEVICE_DIAL_CACHE_TS_KEY = 'device_dial_contacts_ts';
let _lastDeviceDialCacheRefresh = 0;

// Write contacts to the cache. OVERWRITE only — never clears. Skips a write with no usable
// numbers (so a failed/empty fetch can never wipe a good cache).
async function writeDeviceDialCache(contacts) {
  try {
    const usable = (contacts || [])
      .filter(c => c && c.phone)
      .map(c => ({ name: c.name || '', phone: c.phone }));
    if (usable.length === 0) return;
    await setPreference(DEVICE_DIAL_CACHE_KEY, JSON.stringify(usable));
    await setPreference(DEVICE_DIAL_CACHE_TS_KEY, String(Date.now()));
  } catch (e) {
    console.warn('[DeviceDial] cache write failed:', e);
  }
}

// Read the cached contacts (offline-safe). Returns [] if never populated (first-run).
async function getDeviceDialContacts() {
  try {
    const raw = await getPreference(DEVICE_DIAL_CACHE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.warn('[DeviceDial] cache read failed:', e);
    return [];
  }
}

// Age of the cache in ms (null if never populated) — for age-awareness, never to block dialling.
async function getDeviceDialCacheAge() {
  const ts = await getPreference(DEVICE_DIAL_CACHE_TS_KEY);
  return ts ? Date.now() - parseInt(ts, 10) : null;
}

// PRIMARY refresh: pull the caller's own contacts and OVERWRITE the cache. Runs on
// launch/foreground so the cache can't go stale for months waiting on a reactive event.
// On any failure the existing cache is left untouched (stale beats empty).
async function refreshDeviceDialCache({ throttleMs = 0 } = {}) {
  if (throttleMs && Date.now() - _lastDeviceDialCacheRefresh < throttleMs) return;
  _lastDeviceDialCacheRefresh = Date.now();
  let memberAirtableId;
  try { memberAirtableId = await getPreference('member_airtable_id'); } catch (e) { return; }
  if (!memberAirtableId) return;
  // Time-boxed so a hung/offline fetch can never linger; failure is normal (offline) — keep the cache.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(
      `${STATUS_BASE}/device-dial/contacts?member_airtable_id=${encodeURIComponent(memberAirtableId)}`,
      { headers: { 'ngrok-skip-browser-warning': 'true' }, signal: ctrl.signal }
    );
    if (!res.ok) { console.warn('[DeviceDial] cache refresh HTTP', res.status); return; }
    const contacts = await res.json();
    if (Array.isArray(contacts)) await writeDeviceDialCache(contacts);
    flushDeviceDialLogQueue();  // connectivity confirmed — flush any queued offline audit records
  } catch (err) {
    console.warn('[DeviceDial] cache refresh failed (offline?) — keeping existing cache:', err);
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// SignalAudio (feature 006) — Oran's Signal escalation audio: a device-side replica
// of the bridge reaching audio, played from CACHED clips synced to the real sweep via
// the escalation_* FCM family. Signal-only (the server never emits escalation_* on the
// bridge path). PASSENGER: reads pushes, never drives/blocks the escalation; every
// playback is best-effort and degrades silently. Clips are cached at contact-save /
// app-start (NEVER fetched at escalation time). Static clips are bundled in www/audio/signal/;
// per-contact clips (attempt / handoff / ack) come base64 from GET /signal-audio/clips.
// ============================================================================
const SA_STATIC_BASE = 'audio/signal/';           // bundled static clips (relative www path)
const SA_MANIFEST_KEY = 'signal_audio_manifest';  // Preferences: {version, ts, contacts:[{index,first}]}
const SA_CLIP_PREFIX = 'signal_clip_';            // Preferences: signal_clip_<i>_{attempt|ack|trying_now|trying_again|amd|outcome_<oc>} = base64 mp3 (v1.9 attempt-anchored)
// ─── The single audio authority (R-006-11 B) ────────────────────────────────────────────────────────
// ONE state machine owns every loop; NO loop starts/stops itself. Every signal (started/advance/ended/
// complete) is validated against the live run + attempt BEFORE it can act — a stale-run, stale-attempt, or
// post-terminal signal is discarded and logged, never played. This is the settled cure (instance tokens +
// one liveness authority), the same as the stale-flag and Track-2 fixes.
const SA_RING_CAP_MS = 65000;   // backstop ONLY. ≈ the server per-leg ring timeout (send_via_twilio.py
                                //  RING_TIMEOUT_SECONDS = 60s) + a grace: the ring self-terminates if an 'ended'
                                //  signal is ever lost, so it can never ring past what the real call could. If you
                                //  change RING_TIMEOUT_SECONDS, change this (grep both names). (R-006-11 C2)
let _saState = {
  runToken: null,       // current escalation instance (identity — proves difference, not order)
  runTs: 0,             // R-006-12 — the run's mint-ts (epoch ms). TOTAL ORDER over runs: newer wins, older discards
  attemptSeq: -1,       // monotonic (sweep, contact) ordinal of the CURRENT attempt; -1 = pre-first-attempt
  phase: 'idle',        // idle | handover | ready | ringing | gap | terminal
  terminal: false,      // ABSORBING for its OWN run — a strictly newer run (run_ts) supersedes it
  attempts: {},         // R005 attempt-anchored (FR-021): attemptSeq -> {index, sweep, channel, outcome,
                        //   amdSpoken, resolutionSpoken}. Outcomes LAND here regardless of audio phase or
                        //   the ring-stop/outcome ordering — the two-ended discard cure (vault 2026-07-12).
  pendingAttempt: null, // an advance that arrived DURING the handover (applied when the handover ends)
  joinPhase: null,      // 009 (T013) — null | 'join_pending' | 'joined' | 'join_failed' | 'dropped'. States
                        //   ONLY a live-call (hands-free accept) episode enters (FR-018e); driven by the
                        //   bridge_join_* pushes, NOT _saApply. A mode-only extension of the ONE machine.
};
let _saEpoch = 0;       // bumps on every ACCEPTED transition; every loop (ring/gap) + queued step self-exits when it changes
let _saReachAudio = null;   // the loop's currently-playing element (ring OR re-say) — stoppable
let _saCurrent = null;      // the current one-shot clip (handover / lead / terminal) — stoppable
let _saSummonSource = null; // 'physical_button' | 'help_control' | 'orb' — method-aware exhausted (null → both-options)
let _saLastRefresh = 0;

function _saTok(t) { return t ? String(t).slice(0, 8) : '—'; }
// R009 run-2 — persisted field trace. Logcat churn (Messenger noise) has destroyed the device-side capture
// TWICE; the C3 "field-readable diagnosis" promise needs a trail that survives. Last ~250 SignalAudio events
// are kept in memory and flushed to Preferences ('signal_audio_trace') at every accepted attempt boundary,
// so a post-run `run-as … CapacitorStorage.xml` read always recovers the tick sequence. Best-effort, tiny.
let _saTraceBuf = [];
function _saTrace(line) {
  try {
    _saTraceBuf.push(new Date().toISOString().slice(11, 23) + ' ' + line);
    if (_saTraceBuf.length > 250) _saTraceBuf.splice(0, _saTraceBuf.length - 250);
  } catch (e) {}
}
function _saTraceFlush() {
  try { setPreference('signal_audio_trace', JSON.stringify(_saTraceBuf)); } catch (e) {}
}
function _saBump() { _saEpoch++; return _saEpoch; }             // supersede all loops/steps (call SYNC, before any await)
// ATOMIC-CLIP RULING (captain, 13 Jul — R009 final matrix): no spoken clip is ever cut mid-play. Every
// spoken line (queue clips AND spoken reach elements: re-say / L17 / L9) registers its completion in
// _saSpokenDone; a superseding step QUEUES to that boundary via _saClipBoundary() before its first line,
// and the superseded step aborts at its next epoch check — so the in-flight line finishes, the next line
// follows at the clip boundary, and only the BED (ring bursts, pauses, future iterations) is preemptible.
// The old _saStopOneShot mid-play cut is REMOVED (all its callers were signal transitions). The hard caps
// in _saPlayOnce (12s) / _saPlayReach (9s) bound the wait — a stuck clip can never wedge the queue.
let _saSpokenDone = Promise.resolve();   // boundary of the in-flight SPOKEN clip (resolved when idle)
let _saReachSpoken = false;              // is the in-flight reach element a spoken line? (never cut those)
async function _saClipBoundary() {
  // Wait until no spoken clip is in flight. Loops in case a line was mid-registration when we started
  // waiting (at most one — the superseded step aborts after its current clip).
  for (;;) { const p = _saSpokenDone; await p; if (p === _saSpokenDone) return; }
}
function _saStopLoops() {
  // Only the BED is preemptible: cut the reach element only if it is NOT a spoken line (ring burst).
  // A spoken reach line (re-say / L17 / L9) finishes naturally; its owning loop exits at the next epoch
  // check and the successor queues via _saClipBoundary.
  try { if (_saReachAudio && !_saReachSpoken) { _saReachAudio.pause(); _saReachAudio = null; } } catch (e) {}
}
function _saReset(runToken, runTs) {
  _saState = { runToken: runToken || null, runTs: runTs || 0, attemptSeq: -1, phase: 'idle', terminal: false, attempts: {}, pendingAttempt: null, joinPhase: null };
}
// R005 — per-attempt records (the attempt-anchored keystone). A record is created at the attempt's dialing
// and back-filled by any signal that beats it. Outcome merge is IDEMPOTENT, first-wins: presence is never
// overwritten by absence, and ring-stop-then-outcome / outcome-then-ring-stop converge to the same state.
function _saAttemptRec(seq, sig) {
  let r = _saState.attempts[seq];
  if (!r) {
    r = _saState.attempts[seq] = { index: sig ? sig.index : null, sweep: sig ? sig.sweep : null,
      channel: sig ? sig.channel : null, outcome: null, amdSpoken: false, resolutionSpoken: false,
      moreSweeps: null };
  } else if (sig) {
    if (r.index == null) r.index = sig.index;
    if (r.sweep == null) r.sweep = sig.sweep;
  }
  return r;
}
function _saMergeOutcome(sig) {
  const r = _saAttemptRec(sig.attemptSeq, sig);
  if (sig.outcome && !r.outcome) r.outcome = sig.outcome;
  // L9 refined ruling — first-wins, same idempotence as outcome (presence never overwritten by absence)
  if (sig.moreSweeps != null && r.moreSweeps == null) r.moreSweeps = sig.moreSweeps;
  return r;
}
function _saDiscard(kind, sig, reason) {
  // C3 — ONE field-readable line per discarded signal: what came in, why it was dropped, and the live state
  // it was measured against. When a device misbehaves in the field, THIS log line is the diagnosis.
  _saTrace('DISCARD ' + kind + '/' + ((sig && sig.phase) || '-') + ' seq=' + (sig ? sig.attemptSeq : '-') + ' ' + reason);
  console.log(`[SignalAudio] DISCARD ${kind}/${(sig && sig.phase) || '-'} run=${_saTok(sig && sig.runToken)} `
    + `ts=${(sig && sig.runTs) || 0} seq=${sig ? sig.attemptSeq : '-'} reason=${reason} — current run=${_saTok(_saState.runToken)} `
    + `ts=${_saState.runTs} seq=${_saState.attemptSeq} phase=${_saState.phase} terminal=${_saState.terminal}`);
}

// The ONE reducer — every signal enters here and is validated before it may touch a loop. The three
// signalAudio* adapters just normalise the FCM payload and call this.
function _saApply(sig) {
  _saTrace('sig ' + sig.kind + '/' + (sig.phase || '-') + ' seq=' + (sig.attemptSeq != null ? sig.attemptSeq : '-')
    + ' oc=' + (sig.outcome || '-') + ' run=' + _saTok(sig.runToken));
  if (sig.kind !== 'advance' || sig.phase !== 'dialing') _saTraceFlush();   // persist at every boundary beat
  const st = _saState.runTs || 0;
  const rt = sig.runTs || 0;

  // ── R-006-12 TOP RULE — total order over runs via run_ts (tokens prove difference, not order). ──
  if (rt && st && rt > st) {
    // A strictly NEWER run supersedes whatever we were — INCLUDING a previous run's terminal (run-scoped
    // absorption ends the moment a newer run speaks). THIS is tonight's fix: an old terminal can no longer
    // swallow the next run's signals.
    console.log(`[SignalAudio] NEW RUN run=${_saTok(sig.runToken)} ts=${rt} supersedes ts=${st}`);
    if (sig.kind === 'started') return _saOnStarted(sig);        // resets + handover (its token-differs guard passes)
    _saReset(sig.runToken, rt);                                  // advance/complete: clear the prior run's terminal
    if (sig.kind === 'complete') return _saOnComplete(sig);
    if (sig.phase === 'ended' || sig.phase === 'amd') return;    // a stray 'ended'/'amd' opening a run — nothing to stop
    return _saOnDialing(sig);                                    // dialing → phase idle → synthesises the handover opening (F2)
  }
  if (rt && st && rt < st) {
    // A straggler from an OLDER run can never reset or touch a live/newer run (tonight's inverse).
    return _saDiscard(sig.kind, sig, 'stale-run-ts');
  }

  // ── same-run gates (run_ts equal, or unknown on either side) ──
  // token mismatch we cannot order by ts → keep the current run
  if (sig.kind !== 'started' && _saState.runToken && sig.runToken && sig.runToken !== _saState.runToken) {
    return _saDiscard(sig.kind, sig, 'stale-run');
  }
  // terminal is ABSORBING for its OWN run — but NEVER absorbs a 'started' (the run-opener always resets) or a
  // 'complete'. This keeps symptom 3 killed while never re-breaking run boundaries even if run_ts can't order.
  if (_saState.terminal && sig.kind !== 'complete' && sig.kind !== 'started') {
    return _saDiscard(sig.kind, sig, 'terminal-absorbed');
  }
  // stale attempt within the run (a late 'ended' from contact 1 cannot touch contact 2 — symptom 2).
  // R005 (FR-021/FR-022): a late OUTCOME for a prior attempt of THIS run still lands on its record —
  // merged silently, never spoken (a live attempt is never interrupted by a stale line; chips render
  // engine truth independently). Everything else stays discarded exactly as before.
  if (sig.kind === 'advance' && sig.attemptSeq != null && sig.attemptSeq < _saState.attemptSeq) {
    if (sig.phase === 'ended' && sig.outcome) _saMergeOutcome(sig);
    return _saDiscard(sig.kind, sig, 'stale-attempt');
  }
  if (sig.kind === 'started') return _saOnStarted(sig);
  // 009 — a live-call (hands-free) episode owns its OWN terminal (the bridge success / dropped / failed-join
  // card). The engine STILL fires escalation_complete/acknowledged when the joined call ends (it retires the
  // feature-005 liveness on the server), but the reducer must NOT speak the Signal ack over a conversation the
  // member actually had. joinPhase is set ONLY for a live-call episode — null for Signal AND for hands-free
  // EXHAUSTION (no accept), which still speaks its terminal. A genuinely newer run reset joinPhase above.
  if (sig.kind === 'complete' && _saState.joinPhase) return _saDiscard('complete', sig, 'join-phase-owns-terminal');
  if (sig.kind === 'complete') return _saOnComplete(sig);
  if (sig.phase === 'amd') return _saOnAmd(sig);
  if (sig.phase === 'ended') return _saOnEnded(sig);
  return _saOnDialing(sig);
}

// R-006-12 C — the ONE shared verdict for a terminal/complete signal. The audio reducer AND the terminal CARD
// consult this SAME judge (token + run_ts), so the two surfaces can NEVER disagree (ADD-006-2 coherence, made
// structural). PURE — no mutation. true = this complete should act (speak terminal / draw card); false = discard.
function _saAcceptsComplete(sig) {
  const st = _saState.runTs || 0;
  const rt = (sig && sig.runTs) || 0;
  if (rt && st) {
    if (rt > st) return true;    // strictly newer run — accept
    if (rt < st) return false;   // older-run straggler — discard (tonight's inverse)
    // equal ts → same run → fall through
  }
  // equal/unknown ts: accept unless the token positively mismatches a known current run
  if (sig && sig.runToken && _saState.runToken && sig.runToken !== _saState.runToken) return false;
  return true;
}

function _saOnStarted(sig) {
  // A genuinely new run resets everything. A duplicate 'started' for the SAME run (same token AND run_ts) is
  // ignored — never resurrect a run's audio or replay the handover.
  if (_saState.runToken && sig.runToken && sig.runToken === _saState.runToken && (_saState.runTs || 0) === (sig.runTs || 0)) {
    return _saDiscard('started', sig, _saState.terminal ? 'terminal-absorbed' : 'duplicate-started');
  }
  _saReset(sig.runToken, sig.runTs);
  _saState.phase = 'handover';
  _saPlayHandover();
}

// Play the handover FULLY, then either the attempt that arrived during it (pendingAttempt) or settle into
// 'ready' to await the first advance. Shared by the real 'started' and the killed-state synthesis below.
//
// AMENDMENT 11 (owner, 19 Jul) — the sweep-start line is TRIGGER-SELECTED. Iona's "your request for help
// has been received" is FALSE on a silence escalation: nothing was requested, the member simply could not
// be reached. It stays BYTE-UNTOUCHED on the reactive/button paths, where it is true. On a silence run the
// flip plays Oran instead: "Oran here, just to let you know I am now calling your contacts." — number-free,
// no re-introduction (the activation line introduced him seconds earlier), and preceded by the attention
// tone so the announcement is not sprung on the member cold.
function _saPlayHandover() {
  const e = _saBump();
  _saStopLoops();
  const silence = !!(_silenceRunToken && _saState.runToken && _silenceRunToken === _saState.runToken);
  (async () => {
    await _saClipBoundary();                              // ATOMIC — queue behind any in-flight spoken line
    if (e !== _saEpoch) return;
    if (silence) await playAttentionTone();               // Amendment 11 — the tone precedes the announcement
    if (e !== _saEpoch) return;
    await _saPlayOnce(SA_STATIC_BASE + (silence ? 'handover_silence.mp3' : 'handover.mp3'));   // never cut by an advance
    if (e !== _saEpoch) return;                            // superseded (terminal / newer run) during the handover
    if (_saState.phase === 'handover' && _saState.pendingAttempt) {
      const p = _saState.pendingAttempt; _saState.pendingAttempt = null;
      _saBeginAttempt(p);
    } else if (_saState.phase === 'handover') {
      _saState.phase = 'ready';                            // handover done — await the first advance
    }
  })();
}

// F2 accommodation — a run whose ALARM-CLASS 'started' the native full-screen path consumed (killed state), so JS
// never saw it: the FIRST advance synthesises the opening — play the handover, THEN this attempt. We do NOT
// rebuild the native alarm path (Bug A settled architecture); we accommodate its absence here.
function _saOpenWithHandover(sig) {
  if (!_saState.runToken) { _saState.runToken = sig.runToken; _saState.runTs = sig.runTs || 0; }
  _saState.attemptSeq = sig.attemptSeq;
  _saState.pendingAttempt = sig;
  _saState.phase = 'handover';
  console.log(`[SignalAudio] synthesise started (no JS 'started' seen) run=${_saTok(sig.runToken)} ts=${sig.runTs || 0}`);
  _saPlayHandover();
}

function _saOnDialing(sig) {
  if (_saState.phase === 'handover') {
    // handover still playing — DEFER (never cut it). Adopt the identity now so a later stale attempt is rejected.
    _saState.attemptSeq = sig.attemptSeq;
    _saState.pendingAttempt = sig;
    return;
  }
  if (_saState.phase === 'idle') {
    // no 'started'/handover has opened this run in JS (killed state) — synthesise it: handover THEN this attempt.
    return _saOpenWithHandover(sig);
  }
  // phase 'ready' (handover done) / 'ringing' / 'gap' → handover already played → straight to the attempt.
  _saBeginAttempt(sig);
}

function _saBeginAttempt(sig) {
  // R005 attempt-anchored: an unspoken PRIOR resolution (L5–L8) leads, then THIS attempt's start beat —
  // L1 "Trying to reach {name}." (first attempt) / L2 "Trying {name} now." (same sweep) / L3 "Trying
  // {name} again." (new sweep). The transition IS the opening — no fused two-contact line exists any more.
  const prevSeq = _saState.attemptSeq;
  const prev = (prevSeq >= 0 && prevSeq !== sig.attemptSeq) ? _saState.attempts[prevSeq] : null;
  _saState.attemptSeq = sig.attemptSeq;
  _saState.phase = 'ringing';
  const rec = _saAttemptRec(sig.attemptSeq, sig);
  const e = _saBump();          // supersede any prior ring/gap SYNCHRONOUSLY (before the awaits below)
  _saStopLoops();
  (async () => {
    if (e !== _saEpoch) return;
    await _saClipBoundary();    // ATOMIC-CLIP RULING — L2/L3 queue to the in-flight line's boundary (L17/L4/L5–L8 tails)
    if (e !== _saEpoch) return;
    const attemptSrc = await _saCachedSrc(sig.index + '_attempt');
    // Unspoken prior resolution → speak it FIRST (once — FR-022). Normally it was already spoken in the
    // gap (or as the AMD moment); this catches an outcome that landed just as the next dialing arrived.
    let resolveSrc = null;
    if (prev && prev.outcome && !prev.resolutionSpoken && !prev.amdSpoken && prev.index != null) {
      resolveSrc = await _saCachedSrc(prev.index + '_outcome_' + prev.outcome);
      if (resolveSrc) prev.resolutionSpoken = true;
      else console.log('[SignalAudio] CLIP MISS ' + prev.index + '_outcome_' + prev.outcome + ' — lead resolution falls to neutral (cache stale?)');
    }
    // Outcome unknown/lost (or clip missing) and nothing was ever narrated for the prior attempt →
    // NEUTRAL "still trying" beat: never a WRONG claim (FR-010), never silence.
    if (prev && !prev.resolutionSpoken && !prev.amdSpoken && !resolveSrc) {
      if (e === _saEpoch) await _saPlayOnce(SA_STATIC_BASE + 'gap.mp3');
    }
    if (resolveSrc) {
      if (e !== _saEpoch) return;
      await _saPlayOnce(resolveSrc);
    }
    // Start beat (L1/L2/L3); missing transition clip (stale cache) → the bare attempt line — honest either way.
    let startSrc = null;
    if (prev) {
      startSrc = (prev.sweep != null && sig.sweep > prev.sweep)
        ? await _saCachedSrc(sig.index + '_trying_again')
        : await _saCachedSrc(sig.index + '_trying_now');
    }
    if (!startSrc) startSrc = attemptSrc;
    _saTrace('begin seq=' + sig.attemptSeq + ' lead=' + (resolveSrc ? 'resolution' : '-') + ' start=' + (startSrc ? 'named' : 'GAP-FALLBACK'));
    if (!startSrc) console.log('[SignalAudio] CLIP MISS ' + sig.index + '_attempt/_trying_* — start beat falls to gap line, NO NAME (cache stale? — the run-1 Defect A signature)');
    if (e !== _saEpoch) return;
    await _saPlayOnce(startSrc || (SA_STATIC_BASE + 'gap.mp3'));   // start beat — never silence
    if (e !== _saEpoch) return;
    if (sig.channel === 'call') _saReachLoop(e, attemptSrc);      // recurring ring + re-say (handsfree cadence)
    // SMS: the named line + a natural pause, NO ring, no cycle (Condition 1 honesty fence)
  })();
}

function _saOnEnded(sig) {
  // R005 attempt-anchored (FR-021 — the two-ended discard cure): an outcome-less RING-STOP is pacing only;
  // an outcome-bearing ended LANDS on its attempt's record regardless of the audio phase or its ordering
  // relative to the ring-stop. Narration triggers off the RECORD, exactly once (FR-022).
  if (!sig.outcome) {
    // ring-stop: stop the ring if it names the CURRENT ringing attempt; otherwise nothing to pace.
    if (sig.attemptSeq !== _saState.attemptSeq || _saState.phase !== 'ringing') {
      return _saDiscard('advance', sig, 'ringstop-not-current (pacing only — no outcome carried)');
    }
    _saState.phase = 'gap';
    const e = _saBump();          // stop the ring loop
    _saStopLoops();
    // R009 run-2 R1: an outcome-less ring-stop IS a connect by construction (the webhook emits it only on
    // answered/in-progress). In a connect-opened gap "Still trying to reach your contacts" is wrong for
    // EVERY continuation (machine → contradicts the imminent L4; human → they're on the line) — so this
    // gap holds SILENT until the truth lands (amd → L17 via the per-tick re-check; ack/decline/terminal →
    // their own beats). This closes the ordering hole where L9 played because the amd FCM (a separate
    // racing push describing the same instant) landed after the bed's first tick.
    _saStartGapBed(e, { connectHold: true });
    return;
  }
  const rec = _saMergeOutcome(sig);
  if (sig.attemptSeq !== _saState.attemptSeq) {
    return _saDiscard('advance', sig, 'outcome-merged-record-only');   // record updated; never spoken (FR-022)
  }
  if (rec.resolutionSpoken || rec.amdSpoken) {
    // already narrated (AMD moment / duplicate terminal) — just make sure pacing has left the ring.
    if (_saState.phase === 'ringing') {
      _saState.phase = 'gap';
      const e = _saBump(); _saStopLoops(); _saStartGapBed(e);
    }
    return;
  }
  // Current attempt resolved → speak ITS OWN standalone resolution line now (L5–L8), then the gap bed.
  _saState.phase = 'gap';
  const e = _saBump();
  _saStopLoops();
  (async () => {
    if (e !== _saEpoch) return;
    await _saClipBoundary();    // ATOMIC — the resolution queues behind any in-flight spoken line
    if (e !== _saEpoch) return;
    const src = (rec.index != null && rec.outcome) ? await _saCachedSrc(rec.index + '_outcome_' + rec.outcome) : null;
    if (src) {
      rec.resolutionSpoken = true;
      await _saPlayOnce(src);
      if (e !== _saEpoch) return;
    } else {
      console.log('[SignalAudio] CLIP MISS ' + rec.index + '_outcome_' + rec.outcome + ' — resolution unspoken (cache stale? — the run-1 Defect B signature)');
    }
    _saStartGapBed(e);
  })();
}

function _saOnAmd(sig) {
  // R005 (FR-020, GATE-ENG-2 signed): answerphone detected on the CURRENT attempt — announce it in the
  // moment (L4 "{name}'s phone has gone to answerphone — I'm leaving a message now."). The moment IS the
  // attempt's narration: L5 plays only if this beat was missed (fallback-only-never-both, signed). The call
  // has connected (machine), so the ring stops here; the later ring-stop/terminal ended merge silently.
  const rec = _saAttemptRec(sig.attemptSeq, sig);
  if (sig.attemptSeq !== _saState.attemptSeq) return _saDiscard('advance', sig, 'amd-not-current');
  if (rec.amdSpoken || rec.resolutionSpoken) return _saDiscard('advance', sig, 'amd-duplicate');
  _saState.phase = 'gap';
  const e = _saBump();
  _saStopLoops();
  (async () => {
    if (e !== _saEpoch) return;
    await _saClipBoundary();    // ATOMIC — L4 queues behind any in-flight spoken line (e.g. a re-say tail)
    if (e !== _saEpoch) return;
    const src = (rec.index != null) ? await _saCachedSrc(rec.index + '_amd') : null;
    if (!src) console.log('[SignalAudio] CLIP MISS ' + rec.index + '_amd — AMD moment unspoken; terminal ended keeps sole authority (cache stale?)');
    if (src) {
      // Spoken → this beat IS the resolution narration; record the outcome only alongside the spoken claim
      // (if the clip is missing, nothing was said — the terminal ended keeps sole authority, deck Part E).
      rec.amdSpoken = true; rec.resolutionSpoken = true;
      if (!rec.outcome) rec.outcome = 'voicemail';
      await _saPlayOnce(src);
      if (e !== _saEpoch) return;
    }
    _saStartGapBed(e);
  })();
}

// Feature 010 — the member cancelled. Silence the narration LOCALLY at the tap (don't wait for the
// escalation_complete round-trip, which can lag or be lost). Respects the ATOMIC-CLIP RULING: no spoken
// clip is cut mid-play — we bump the epoch so no NEW line starts, cut only the preemptible bed, and mark
// the reducer terminal/absorbing so nothing non-terminal can sound again.
function _saCancelledLocal() {
  try {
    _saState.phase = 'terminal';
    _saState.terminal = true;
    _saState.pendingAttempt = null;
    _saBump();
    _saStopLoops();
  } catch (e) { /* best-effort silence — never block the cancel */ }
}

function _saOnComplete(sig) {
  _saState.phase = 'terminal';
  _saState.terminal = true;     // ABSORBING from here — nothing non-terminal may sound again
  _saState.pendingAttempt = null;
  const e = _saBump();
  _saStopLoops();   // cut the ring/bed; a SPOKEN in-flight line finishes (ATOMIC — terminals queue to outcome lines)
  // Feature 010 — the MEMBER cancelled. No contact was reached and nobody was exhausted, so BOTH terminal
  // lines would lie ("I've reached {name}" / "nobody could help"). The member performed the action and knows
  // the outcome — the honest close is silence. Loops are already cut above; just stop here.
  if (sig && sig.outcome === 'cancelled') return;
  (async () => {
    await _saClipBoundary();
    if (e !== _saEpoch) return;
    let src;
    if (sig.outcome === 'acknowledged') {
      src = (await _saAckSrc(sig.contactName)) || (SA_STATIC_BASE + 'ack_generic.mp3');
    } else {
      // R005 attempt-anchored: if the FINAL attempt's resolution (L5–L8) was never narrated (late outcome,
      // or it landed with the complete), speak it before the exhausted line — the standalone lines serve
      // every position including last/only, so nothing here needs a fused "terminal variant" clip. If it
      // was already spoken (the normal case now), the exhausted line plays alone. Never-silent either way.
      const rec = _saState.attempts[_saState.attemptSeq];
      if (rec && rec.outcome && !rec.resolutionSpoken && !rec.amdSpoken && rec.index != null) {
        const tsrc = await _saCachedSrc(rec.index + '_outcome_' + rec.outcome);
        if (tsrc) {
          rec.resolutionSpoken = true;
          if (e !== _saEpoch) return;
          await _saPause(700);
          await _saPlayOnce(tsrc);                                  // the honest last resolution (L5–L8)
          await _saPause(300);
          if (e !== _saEpoch) return;
          await _saPlayOnce(SA_STATIC_BASE + _saExhaustedClip());   // then the exhausted terminal
          await _saPause(1600);
          return;                                                  // terminal fully played (resolution + exhausted)
        }
      }
      src = SA_STATIC_BASE + _saExhaustedClip();
    }
    if (e !== _saEpoch) return;   // a newer run superseded this terminal (rare)
    await _saPause(700);          // lead-in beat — let the reaching settle before the terminal (no abrupt jump)
    if (e !== _saEpoch) return;
    await _saPlayOnce(src);       // never-silent: always a spoken terminal (named ack, generic, or exhausted)
    await _saPause(1600);         // tail — wind down gently instead of cutting off bluntly
  })();
}

// 009 (T013) — join-phase transitions extend the ONE reducer (R-009-6 / FR-018e). Driven by the bridge_join_*
// pushes (a contact accepted on the hands-free path), NOT _saApply (which owns the escalation_* reaching
// family). They are sibling transitions on the SAME _saState — no second machine. Each STOPS the device
// reaching audio; from join_pending on, the audio is the LIVE CALL (the existing server-side "Connecting
// with {name}" connect line into the member's joining leg — the join announce, R-009-16 — masks the ~2-3s
// wait, R-009-19), EXCEPT the offline-safe N4/N5 terminal cards, which speak LOCAL clips (T014 set).
function _saJoinPending() {
  // A contact accepted → the member is being placed into the live bridge. Stop the device reaching audio.
  // R-009-31 #14(b) — the "Connecting with {name}" line now rides the MEMBER'S JOIN TwiML as CALL-AUDIO (a
  // <Say> before <Conference>, server-side) — NOT a local media clip (a media clip either got clipped by the
  // join audio or, when awaited, delayed the join past the boundary → bridge failed, #14). So the device goes
  // QUIET at join_pending; the call leg carries the connect line, ~2s inside the N2-end+5s grace.
  _saState.joinPhase = 'join_pending';
  _saState.terminal = true;     // reaching is over — no device reaching audio resumes for this run
  _saState.phase = 'terminal';
  _saBump();                    // supersede any ring/gap/queued reach step (SYNC, before any await)
  _saStopLoops();
  _saTrace('joinPhase → join_pending (reaching stopped; connect line rides the join leg — device quiet)');
}
function _saJoined() {
  // Positive join confirmation — the conversation IS the audio. Silence device-side.
  _saState.joinPhase = 'joined';
  _saBump();
  _saStopLoops();
  _saTrace('joinPhase → joined (live conversation — device silent)');
}
async function _saJoinFailed(contactFirst) {
  // 8s boundary closed the held contact before the member joined. Speak the local failed_join clip (N4,
  // name-bearing, offline-safe); the N4 CARD is rendered by the push handler (T015).
  _saState.joinPhase = 'join_failed';
  const e = _saBump();
  _saStopLoops();
  // R-009-32 ④ (generalized #13) — this terminal follows a live/comm-audio context (Story-4 speaker route +,
  // in the misclassified-late case, a call the device briefly touched). Reset the route/mode + restore volume
  // BEFORE the N4 clip so it lands on the media route, same ordering as the N5 dropped clip.
  await _teardownCallAudioNow();
  await _saClipBoundary();
  if (e !== _saEpoch) return;
  const src = await _saJoinClipSrc('failed_join', contactFirst);
  if (src) await _saPlayOnce(src);
  else console.log('[SignalAudio] CLIP MISS failed_join — N4 line falls silent (cache populates at T014/T022)');
}
async function _saDropped(contactFirst) {
  // A live joined call dropped (008 territory, post-`joined` only). Speak the local dropped clip (N5,
  // name-bearing, offline-safe); the R-008-5 CARD is rendered by the drop handler (T016).
  _saState.joinPhase = 'dropped';
  const e = _saBump();
  _saStopLoops();
  // R-009-31 #13 — the drop just tore a LIVE call down; reset the audio route/mode + restore volume BEFORE the
  // clip so the N5 line plays out the media route (not the dead voice-call path). Ordered: teardown → clip.
  await _teardownCallAudioNow();
  await _saClipBoundary();
  if (e !== _saEpoch) return;
  const src = await _saJoinClipSrc('dropped', contactFirst);
  if (src) await _saPlayOnce(src);
  else console.log('[SignalAudio] CLIP MISS dropped — N5 line falls silent (cache populates at T014/T022)');
}
async function _saJoinClipSrc(kind, contactFirst) {
  // kind: 'failed_join' (N4) | 'dropped' (N5). Map the contact's first name → that contact's cached clip
  // (same manifest lookup as the ack terminal). Offline-safe: reads Preferences, zero fetch (SC-006).
  if (!contactFirst) return null;
  try {
    const raw = await getPreference(SA_MANIFEST_KEY);
    const man = raw ? JSON.parse(raw) : null;
    const first = String(contactFirst).trim().split(/\s+/)[0].toLowerCase();
    const hit = man && man.contacts && man.contacts.find((c) => (c.first || '').trim().toLowerCase() === first);
    if (hit) return await _saCachedSrc(hit.index + '_' + kind);
  } catch (e) {}
  return null;
}

function _saPlayOnce(src) {
  // Play one QUEUE clip to completion (handover / lead line / terminal). Best-effort: resolves on
  // end/error/exception/timeout, NEVER rejects. Held in _saCurrent for bookkeeping. Every queue clip is
  // a SPOKEN line → registers the atomic-clip boundary (never cut; successors queue to this promise).
  const p = new Promise((resolve) => {
    if (!src) return resolve();
    let a; let done = false;
    const fin = () => { if (!done) { done = true; if (_saCurrent === a) _saCurrent = null; resolve(); } };
    try {
      a = new Audio(src); a.volume = 1.0; _saCurrent = a;
      a.onended = fin; a.onerror = fin;
      const pl = a.play(); if (pl && pl.catch) pl.catch(fin);
      setTimeout(fin, 12000);   // hard cap so a stuck clip never wedges the sequence
    } catch (e) { fin(); }
  });
  _saSpokenDone = p;   // ATOMIC-CLIP RULING — the boundary successors queue to
  return p;
}
function _saPlayReach(src, epoch, spoken) {
  // Play ONE reaching element, held in _saReachAudio. Bails if superseded. `spoken` marks a spoken line
  // (re-say / L17 / L9) — ATOMIC (never cut by _saStopLoops; registers the boundary); a ring burst is
  // bed and stays preemptible.
  const p = new Promise((resolve) => {
    if (!src || epoch !== _saEpoch) return resolve();
    let a; let done = false;
    const fin = () => { if (!done) { done = true; if (_saReachAudio === a) { _saReachAudio = null; _saReachSpoken = false; } resolve(); } };
    try {
      a = new Audio(src); a.volume = 1.0; _saReachAudio = a; _saReachSpoken = !!spoken;
      a.onended = fin; a.onerror = fin;
      const pl = a.play(); if (pl && pl.catch) pl.catch(fin);
      setTimeout(fin, 9000);
    } catch (e) { fin(); }
  });
  if (spoken) _saSpokenDone = p;   // ATOMIC-CLIP RULING — spoken reach lines share the same boundary
  return p;
}
async function _saReachLoop(epoch, attemptSrc) {
  // Match the handsfree wait-audio cadence: recur [ UK ring → re-say "Trying to reach {name}." ] until a new
  // advance / ended / terminal supersedes this attempt (epoch bump). The name recurs every cycle, exactly like
  // the bridge's wait-audio loop. Self-caps at SA_RING_CAP_MS — the backstop for a LOST 'ended' (R-006-11 C2):
  // the ring can never outlast what the real call could ring.
  const start = Date.now();
  while (epoch === _saEpoch) {
    if (Date.now() - start > SA_RING_CAP_MS) {
      console.log('[SignalAudio] ring cap reached — stopping (no ended signal received; backstop)');
      break;
    }
    await _saPlayReach(SA_STATIC_BASE + 'uk_ring.wav', epoch);   // ~6s genuine UK ringback (bed — preemptible)
    if (epoch !== _saEpoch) break;
    await _saPlayReach(attemptSrc, epoch, true);                 // re-say the name — SPOKEN (atomic, never cut)
  }
}
async function _saStartGapBed(epoch, opts) {
  // R009 pacing rules (captain-ruled 13 Jul, deck L17 amendment; R1 ordering fix run-2; L9 FINAL RULING run-3):
  //  - POST-AMD window: the filler is L17 "I'm leaving {name} a voicemail — one moment, please." at the
  //    standard cadence for the whole window. L9 is PROHIBITED here. L17 clip missing → silent bed.
  //  - connectHold gap (opened by an outcome-less ring-stop = the call CONNECTED): NO L9 EVER — silence
  //    until the truth lands. postAmd is RE-CHECKED EVERY TICK, so the bed upgrades to L17 the moment the
  //    (independently-delivered, possibly-late) amd signal lands — no new bed needed. This is the R1 fix:
  //    the prohibition now keys off the CONNECT, not off the amd signal's arrival time.
  //  - INTER-SWEEP mask (L9 RULING REFINED, owner-directed after run 3): the engine stamps the sweep's
  //    FINAL populated contact's outcome 'ended' with more_sweeps (only the engine knows the sweep
  //    config). true → another sweep follows, so L9 "Still trying to reach your contacts." is TRUE and
  //    plays at the STANDARD CADENCE to mask the natural inter-sweep pause until the next attempt-open
  //    (L3). false or ABSENT → bed-only (safe default, back-compat) — the pre-terminal prohibition is
  //    absolute: run 3 heard L9 between the FINAL outcome and the exhausted terminal ("still trying"
  //    with nobody left). Post-outcome gaps without the true flag are bed-only.
  //  - ANYWHERE else (L9's remaining role — emergency fallback ONLY, i.e. nothing has been narrated for
  //    this attempt, e.g. a missing outcome clip): L9 plays at most ONCE per gap, then silence — never loops.
  // The ~2.5s grace stays: a quick advance flows straight to the next beat, no filler.
  const connectHold = !!(opts && opts.connectHold);
  await _saClipBoundary();      // ATOMIC — never tick over an in-flight spoken line
  await _saPause(2500);
  let l9Spoken = false;
  let l17 = null, l17For = null;
  while (epoch === _saEpoch) {
    const rec = _saState.attempts[_saState.attemptSeq];   // per-tick re-check — amdSpoken can land mid-bed (R1)
    const postAmd = !!(rec && rec.amdSpoken);
    const outcomeSpoken = !!(rec && (rec.resolutionSpoken || rec.amdSpoken));   // L9 final ruling (run 3)
    const interSweep = !!(rec && rec.moreSweeps === true);                      // L9 refined — engine-stamped
    if (postAmd) {
      if (rec.index != null && l17For !== rec.index) {
        l17 = await _saCachedSrc(rec.index + '_vm_hold');
        l17For = rec.index;
        if (!l17) console.log('[SignalAudio] CLIP MISS ' + rec.index + '_vm_hold — post-AMD hold falls to silent bed (cache stale?)');
      }
      _saTrace('bed tick: L17' + (l17 ? '' : '-MISS(silent)'));
      if (l17) await _saPlayReach(l17, epoch, true);       // L17 at standard cadence — SPOKEN (atomic)
    } else if (!connectHold && interSweep) {
      _saTrace('bed tick: L9 (inter-sweep mask)');
      await _saPlayReach(SA_STATIC_BASE + 'gap.mp3', epoch, true); // L9 at standard cadence — SPOKEN (atomic); TRUE: another sweep follows
    } else if (!connectHold && !outcomeSpoken && !l9Spoken) {
      _saTrace('bed tick: L9 (once)');
      await _saPlayReach(SA_STATIC_BASE + 'gap.mp3', epoch, true); // L9 — emergency fallback, SPOKEN (atomic), capped at ONE play
      l9Spoken = true;
    } else if (connectHold && !outcomeSpoken) {
      // R-009-28 (owner overturn of R1 silence) — the connect gap is an UNRESOLVED ATTEMPT, not line-state:
      // CONTINUE the settled attempt-line ("Trying to reach {name}") + fake-ring cadence — EXISTING clips,
      // EXISTING ring, NOTHING NEW — until the outcome lands (silence read as the system dying at the member's
      // most anxious moment). L9 stays PROHIBITED here; the per-tick upgrade above still yields to amd→L17 /
      // any outcome the instant it lands, and a fast accept (join_pending) supersedes cleanly.
      _saTrace('bed tick: connectHold reach (attempt-line + ring)');
      const _chSrc = (rec && rec.index != null) ? await _saCachedSrc(rec.index + '_attempt') : null;
      await _saPlayReach(SA_STATIC_BASE + 'uk_ring.wav', epoch);                  // fake-ring bed (preemptible)
      if (epoch === _saEpoch && _chSrc) await _saPlayReach(_chSrc, epoch, true);  // re-say "Trying to reach {name}" (atomic)
    } else {
      _saTrace('bed tick: silence' + (connectHold ? ' (connectHold)' : outcomeSpoken ? ' (post-outcome)' : ''));
    }
    if (epoch !== _saEpoch) break;
    await _saPause(3500);
  }
}
async function _saCachedSrc(key) {
  try { const b64 = await getPreference(SA_CLIP_PREFIX + key); return b64 ? ('data:audio/mpeg;base64,' + b64) : null; }
  catch (e) { return null; }
}
function _saExhaustedClip() {
  if (_saSummonSource === 'physical_button') return 'exhausted_button.mp3';
  if (_saSummonSource === 'help_control' || _saSummonSource === 'orb') return 'exhausted_app.mp3';
  return 'exhausted_both.mp3';   // unknown → both-options (honest default, FR-009)
}
async function _saAckSrc(contactName) {
  // Map the terminal's contact_name (first name) → that contact's cached "I've reached {name}" clip.
  if (!contactName) return null;
  try {
    const raw = await getPreference(SA_MANIFEST_KEY);
    const man = raw ? JSON.parse(raw) : null;
    const first = String(contactName).trim().split(/\s+/)[0].toLowerCase();
    const hit = man && man.contacts && man.contacts.find((c) => (c.first || '').trim().toLowerCase() === first);
    if (hit) return await _saCachedSrc(hit.index + '_ack');
  } catch (e) {}
  return null;
}

// --- FCM adapters (wired into BOTH push listeners). Each just NORMALISES the FCM payload (every wire value
//     arrives as a string) and hands it to the single reducer _saApply, which validates identity and owns every
//     loop. NO lifecycle logic lives here — that is the whole point of the state machine. --------------------
function _saPause(ms) { return new Promise((r) => setTimeout(r, ms)); }
// R-009-29 Directive A — the ONE shared hold-then-card settle. A uniform 2000ms hold after the final audio,
// BEFORE every terminal card (success / exhausted / N4 failed-join / N5 dropped), so the screen always lands
// AFTER the audio and never overlaps the outcome/terminal clip. LIVE landings only — cold-open/resume restores
// render the card straight (the terminal already settled).
const SETTLE_BEFORE_CARD_MS = 2000;
function _saSettleBeforeCard() { return _saPause(SETTLE_BEFORE_CARD_MS); }
function _saParseTs(data) { return parseInt((data && data.run_ts) || '0', 10) || 0; }
function signalAudioStarted(data) {
  escalationScreenReset((data && data.run_token) || null);   // 007 screen mirror — EVERYONE
  // 009 (R-009-20/21) ONE reaching engine: the reaching phase is now mode-BLIND. The engine drives reaching
  // for BOTH modes (escalation_* emitted for hands-free too), so the reducer runs unconditionally here — the
  // hands-free member hears the SAME device-side reaching narration as Signal (SC-002/SC-009). Mode gates
  // exactly ONE thing, server-side: the contact's press-1 consequence. (The clip-CACHE exclusion stays until
  // Phase 6 / T022 — reaching clips for hands-free arrive when that lands; harness/sa_sim unaffected.)
  _saApply({ kind: 'started', runToken: (data && data.run_token) || null, runTs: _saParseTs(data) });
}
function signalAudioAdvance(data) {
  if (!data) return;
  // Feature 010 P3c — THE FLIP. The first advance of a run is the engine's own word that the sweep has
  // started, which is the only trustworthy moment to replace the activation screen with Oran's Promise
  // and release the deferred Signal audio. Runs BEFORE escalationScreenAdvance/_saApply so the reducer
  // and the 007 screen mirror both receive their 'started' before this first 'advance' — the order they
  // require. Flips on ANY advance, not just phase 'dialing': if a dialing push were lost and only the
  // 'ended' arrived, flipping is still the truthful reading (contacts ARE being reached), and stranding
  // the member on a spent countdown would not be.
  if (_silenceActivation) _silenceFlipToPromise(data);
  escalationScreenAdvance(data);   // 007 screen mirror — EVERYONE (channel-honest per-contact chips)
  // 009 (R-009-20/21) — mode-blind reaching: the reducer runs for BOTH modes (see signalAudioStarted).
  const index = parseInt(data.contact_index ?? '-1', 10);
  const sweep = parseInt(data.sweep ?? '1', 10);
  // attempt_seq is stamped by the ONE backend builder (pwa_sender.build_escalation_advance_payload). Fall back
  // to the same formula (sweep * SA_CONTACT_STRIDE=100 + index) only if a push ever omits it — keep in step.
  const attemptSeq = (data.attempt_seq != null && data.attempt_seq !== '')
    ? parseInt(data.attempt_seq, 10) : (sweep * 100 + index);
  _saApply({
    kind: 'advance',
    // R005 — 'amd' is the answerphone-moment beat (FR-020); anything unrecognised still normalises to
    // 'dialing' (the pre-007 behaviour for unknown phases).
    phase: data.phase === 'ended' ? 'ended' : (data.phase === 'amd' ? 'amd' : 'dialing'),
    runToken: data.run_token || null,
    runTs: _saParseTs(data),
    attemptSeq: attemptSeq,
    index: index,
    sweep: sweep,
    channel: (data.channel === 'sms') ? 'sms' : 'call',
    outcome: data.outcome || null,   // 007 — classified attempt outcome (voicemail|sms_sent|declined|no_answer); rides phase="ended" + "amd"
    // L9 refined ruling (13 Jul) — engine-computed inter-sweep flag; rides ONLY the final-contact-of-sweep
    // outcome 'ended'. true = another sweep follows (L9 may mask that gap); false/absent = bed-only.
    moreSweeps: data.more_sweeps === 'true' ? true : (data.more_sweeps === 'false' ? false : null),
  });
}
function signalAudioComplete(data) {
  // Feature 010 P3c — a run can resolve while the activation screen is still up (an SMS-side cancel, or a
  // sweep that started and finished inside the backstop window). Drop the screen's timers/listener so
  // nothing fires over the terminal; no flip — handleEscalationComplete owns the terminal render.
  if (_silenceActivation) { _silenceTeardown(); _silenceActivation = null; }
  escalationScreenComplete(data);   // 007 screen mirror — EVERYONE (resolve the acknowledged contact to "Reached")
  // 009 (R-009-20/21) — mode-blind terminal: the reducer runs for BOTH modes. A hands-free member only ever
  // receives escalation_complete with outcome 'exhausted' (the accept path holds → bridge_join_confirmed, it
  // never fires escalation_complete/acknowledged) — so the device speaks the exhausted terminal for both
  // modes (T021 deletes the server-side member exhausted <Say>). An acknowledged terminal reaches only a
  // Signal-floor member (lapsed entitlement acked at the press-1 fork), where the ack card is correct.
  _saApply({
    kind: 'complete',
    runToken: (data && data.run_token) || null,
    runTs: _saParseTs(data),
    outcome: (data && data.outcome) || 'exhausted',
    contactName: (data && data.contact_name) || '',
  });
}

// --- cache reconcile (contact-save / app-start / foreground) — NEVER at escalation time ---
async function refreshSignalAudioCache({ throttleMs = 0 } = {}) {
  if (throttleMs && Date.now() - _saLastRefresh < throttleMs) return;
  // 009 T022 (FR-018d) — the hands-free clip-cache exclusion is DELETED: ONE cache pipeline for BOTH modes.
  // Under late-join a hands-free member hears the SAME device-side reaching + N4/N5 clips, so they must cache
  // them exactly like Signal. (The old mode-gate helper is removed — no other caller after the T012 gates.)
  let memberAirtableId;
  try { memberAirtableId = await getPreference('member_airtable_id'); } catch (e) { return; }
  if (!memberAirtableId) return;
  _saLastRefresh = Date.now();
  const ctrl = new AbortController();
  // R009 fix: 9s aborted a 3-contact fetch mid-flight (27 Polly renders ≈ 7.8s server-side pre-cache) —
  // the run-1 stale-cache delivery cliff. This refresh is background fire-and-forget (never user-blocking),
  // so a generous ceiling is safe; the server-side render cache makes warm fetches sub-second anyway.
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(
      `${STATUS_BASE}/signal-audio/clips?member_airtable_id=${encodeURIComponent(memberAirtableId)}&_t=${Date.now()}`,
      { headers: { 'ngrok-skip-browser-warning': 'true' }, cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) { console.warn('[SignalAudio] cache refresh HTTP', res.status); return; }
    const data = await res.json();
    if (!data || !Array.isArray(data.contacts)) return;
    // R-009-27 FIX E — manifest-diff re-cache: signature = deck version + the contact set (index:first). If it
    // matches the cached manifest, NOTHING changed → skip the clip re-writes (keeps foreground reconciles
    // cheap). Any real change — a contact added / removed / renamed, or a deck bump — differs → re-cache. This
    // is what picks up a contact edited outside the app (website / Airtable) on the next reconcile.
    const _sig = String(data.version) + '|' + data.contacts.map((c) => c.index + ':' + (c.first || '')).join(',');
    try {
      const _cached = JSON.parse((await getPreference(SA_MANIFEST_KEY)) || '{}');
      if (_cached && _cached.sig === _sig) { console.log('[SignalAudio] cache current (manifest unchanged) — skip'); return; }
    } catch (e) { /* no / bad cached manifest → fall through and re-cache */ }
    for (const c of data.contacts) {
      if (c.attempt) await setPreference(SA_CLIP_PREFIX + c.index + '_attempt', c.attempt);
      if (c.ack) await setPreference(SA_CLIP_PREFIX + c.index + '_ack', c.ack);
      // R005 (deck v1.9, attempt-anchored) — transitions L2/L3, the AMD moment L4, standalone resolutions
      // L5-L8. All keyed to the contact's OWN index; the fused v1.8 handoff/resweep map is retired.
      if (c.trying_now) await setPreference(SA_CLIP_PREFIX + c.index + '_trying_now', c.trying_now);
      if (c.trying_again) await setPreference(SA_CLIP_PREFIX + c.index + '_trying_again', c.trying_again);
      if (c.amd) await setPreference(SA_CLIP_PREFIX + c.index + '_amd', c.amd);
      if (c.vm_hold) await setPreference(SA_CLIP_PREFIX + c.index + '_vm_hold', c.vm_hold);   // L17 post-AMD hold (deck amendment 13 Jul)
      if (c.connect) await setPreference(SA_CLIP_PREFIX + c.index + '_connect', c.connect);   // R-009-29 B — local pre-join "Connecting with {name}" announce
      // 009 (T014) — the two join-phase terminal cards, name-bearing, played offline (SC-006). Keyed like
      // every other clip: signal_clip_<i>_{failed_join|dropped}. _saJoinClipSrc reads them at play time.
      if (c.failed_join) await setPreference(SA_CLIP_PREFIX + c.index + '_failed_join', c.failed_join);   // N4
      if (c.dropped) await setPreference(SA_CLIP_PREFIX + c.index + '_dropped', c.dropped);               // N5
      for (const oc of ['voicemail', 'sms_sent', 'declined', 'no_answer']) {
        const b = c['outcome_' + oc];
        if (b) await setPreference(SA_CLIP_PREFIX + c.index + '_outcome_' + oc, b);
      }
    }
    const inv = data.contacts.map((c) => ({ index: c.index, first: c.first || '' }));
    await setPreference(SA_MANIFEST_KEY, JSON.stringify({ version: data.version, sig: _sig, ts: Date.now(), contacts: inv }));  // R-009-27 FIX E — store the diff signature
    console.log('[SignalAudio] cache updated — v' + data.version, inv.length, 'contacts');
  } catch (err) {
    console.warn('[SignalAudio] cache refresh failed (offline?) — keeping existing cache:', err);
  } finally {
    clearTimeout(timer);
  }
}

// --- Device-dial reactive method: chosen primary (via _startHelpSequence, after the cancel
//     window) and automatic floor (when the data path can't reach the backend). ---

const DEVICE_DIAL_PASSES = { once: 1, keep: 3 };  // plain-language passes → loop count
const DEVICE_DIAL_LOG_QUEUE_KEY = 'device_dial_log_queue';
const DEVICE_DIAL_DECISION_MS = 10000;  // window to tap "reached someone — stop" before auto-advance (matches native CYCLE_DECISION_WINDOW_MS)
let _ddDecisionTimer = null;
let _hasTelephony = true;   // set at init via ZeroCall.hasTelephony()
let _deviceDial = null;     // active cycle runtime state (null when idle)

async function getReactiveMethod() {
  // 'device_dial' only when explicitly chosen AND the device can place calls; else 'auto'.
  let m;
  try { m = await getPreference('reactive_method'); } catch (e) { m = null; }
  return (m === 'device_dial' && _hasTelephony) ? 'device_dial' : 'auto';
}

async function getDevicePasses() {
  let p;
  try { p = await getPreference('device_dial_passes'); } catch (e) { p = null; }
  return DEVICE_DIAL_PASSES[p] || DEVICE_DIAL_PASSES.keep;  // default: keep trying
}

// Start the offline carrier-dial floor. triggerSource: 'help_control' | 'orb' | 'escalation_floor'.
// isFloor=true means the data path already failed (no cancel window; takes over the active event).
// Returns true if dialling started, false if it couldn't (no telephony / empty cache) so the
// caller can fall through to its own honest failure handling.
// Hard-clear any in-flight bridge/escalation UI + alarm audio so the device-dial fallback starts clean
// (no empty calling card, siren, escalation screen, or stray today-screen buttons bleeding through).
function _clearReactiveUiForDeviceDial() {
  if (_audioCtx) { try { _audioCtx.close(); } catch (e) {} _audioCtx = null; }
  try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
  if (escalationCountdownTimer) { clearInterval(escalationCountdownTimer); escalationCountdownTimer = null; }
  _stopVoiceEq();
  ['bridge-card', 'alarm-escalation-card', 'alarm-terminal-card', 'alarm-countdown-card'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.add('hidden');
  });
  ['btn-okay', 'btn-alert', 'btn-cancel', 'btn-alarm-done', 'btn-done'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.add('hidden');
  });
}

async function startDeviceDial(triggerSource, isFloor) {
  const { ZeroCall, KeepAwake } = Capacitor.Plugins;
  if (!ZeroCall || !_hasTelephony) return false;

  const escState = await getPreference('escalation_state');
  if (!isFloor && (escState === 'active' || escState === 'terminal')) return true;

  // Contacts come from the offline cache. If empty (first-run), try one online refresh.
  let contacts = await getDeviceDialContacts();
  if (contacts.length === 0) { await refreshDeviceDialCache(); contacts = await getDeviceDialContacts(); }
  if (contacts.length === 0) { console.warn('[DeviceDial] no cached contacts — cannot dial'); return false; }

  const passes = await getDevicePasses();
  const memberAirtableId = await getPreference('member_airtable_id');
  _deviceDial = {
    contacts, passes, triggerSource, isFloor, memberAirtableId,
    sessionId: `devicedial-${Date.now()}`, startTime: Date.now(),
  };

  if (KeepAwake) KeepAwake.keepAwake();
  await setPreference('escalation_state', 'active');
  await setPreference('escalation_state_ts', String(Date.now()));
  // Marker so a launch knows this 'active' state is a device-dial cycle — which NEVER survives a
  // process restart (it's native and dies with the process). The launch handler clears it and
  // starts clean, so a fresh launch never restores into a dead device-dial calling screen.
  await setPreference('device_dial_active', 'true');

  // Takeover: clear any bridge/escalation UI + alarm audio still mid-flight before rendering.
  _alarmFlowActive = true;  // device-dial calling screen owns the Today screen
  _clearReactiveUiForDeviceDial();
  show('screen-today');
  renderCallingScreen({ method: 'device_dial', label: 'Calling your contacts', contacts, activeIndex: 0 });
  document.getElementById('btn-okay').classList.add('hidden');
  document.getElementById('btn-alert').classList.add('hidden');
  document.getElementById('btn-cancel').classList.add('hidden');
  document.getElementById('btn-alarm-done').classList.add('hidden');

  logDeviceDialEvent('DEVICE_DIAL_SUMMONED', {});

  try {
    await ZeroCall.startDialCycle({ numbers: contacts.map(c => c.phone), passes });
  } catch (err) {
    console.error('[DeviceDial] startDialCycle failed:', err);
    _deviceDialTerminal('error');
  }
  return true;
}

// Native progress events from the cycle (ZeroCall 'dial_cycle').
function _initDeviceDialListeners() {
  const { ZeroCall } = Capacitor.Plugins;
  if (!ZeroCall) return;
  ZeroCall.addListener('dial_cycle', (e) => {
    if (!_deviceDial) return;
    const idx = typeof e.index === 'number' ? e.index : -1;
    switch (e.state) {
      case 'dialing':
        _hideDeviceDialDecision();
        if (idx >= 0) {
          // Re-render: prior contacts show "Called", current "Ringing…", rest "Waiting".
          renderCallingScreen({
            method: 'device_dial',
            label: (e.passes > 1) ? `Calling your contacts (round ${e.pass} of ${e.passes})` : 'Calling your contacts',
            contacts: _deviceDial.contacts,
            activeIndex: idx,
          });
          logDeviceDialEvent('DEVICE_DIAL_DIALING', { contact_index: idx });
        }
        break;
      case 'called':
        // Call ended — outcome UNCONFIRMED (PSTN gives no answered-vs-rang-out signal). Mark "Called"
        // and ask the user whether they reached someone (B); native auto-advances if they don't tap.
        if (idx >= 0) setContactStatus(idx, 'called');
        _showDeviceDialDecision();
        break;
      case 'terminal':
        _hideDeviceDialDecision();
        _deviceDialTerminal(e.reason || 'exhausted');
        break;
      case 'monitor_unavailable':
        console.warn('[DeviceDial] call-state monitor unavailable — cannot auto-advance');
        break;
      default:
        break;
    }
  });

  // B — decision-prompt buttons (wired once).
  document.getElementById('dd-stop')?.addEventListener('click', () => {
    _hideDeviceDialDecision();
    const { ZeroCall: ZC } = Capacitor.Plugins;
    if (ZC) ZC.stopDialCycle({}).catch(() => {});
  });
  document.getElementById('dd-next')?.addEventListener('click', () => {
    _hideDeviceDialDecision();
    const { ZeroCall: ZC } = Capacitor.Plugins;
    if (ZC) ZC.advanceDialCycle({}).catch(() => {});
  });
}

// B — decision prompt shown after each call ends: "Did you reach someone?", with a visual countdown
// matching the native auto-advance window. Buttons wired in _initDeviceDialListeners.
function _showDeviceDialDecision() {
  const el = document.getElementById('device-dial-prompt');
  if (!el) return;
  el.classList.remove('hidden');
  let n = Math.ceil(DEVICE_DIAL_DECISION_MS / 1000);
  const countEl = document.getElementById('dd-prompt-count');
  if (countEl) countEl.textContent = `Trying the next contact in ${n}s…`;
  if (_ddDecisionTimer) clearInterval(_ddDecisionTimer);
  _ddDecisionTimer = setInterval(() => {
    n--;
    if (n <= 0) { _hideDeviceDialDecision(); return; }  // native auto-advances; UI catches up on next 'dialing'
    if (countEl) countEl.textContent = `Trying the next contact in ${n}s…`;
  }, 1000);
}

function _hideDeviceDialDecision() {
  if (_ddDecisionTimer) { clearInterval(_ddDecisionTimer); _ddDecisionTimer = null; }
  const el = document.getElementById('device-dial-prompt');
  if (el) el.classList.add('hidden');
}

async function _deviceDialTerminal(reason) {
  _alarmFlowActive = true;  // terminal card is still part of the alarm flow (retry / Return to Iona)
  logDeviceDialEvent('DEVICE_DIAL_TERMINAL', { reason: reason || 'exhausted' });
  _deviceDial = null;
  const { KeepAwake } = Capacitor.Plugins;
  if (KeepAwake) KeepAwake.allowSleep();
  // Honest terminal — device dial never claims a contact "connected" (it can't verify an answer).
  // A retry press is allowed, same ethos as the bridge's exhaustion.
  await setPreference('escalation_state', 'idle');
  await removePreference('device_dial_active');
  hideOrb();
  document.getElementById('alarm-escalation-card').classList.add('hidden');
  document.getElementById('alarm-countdown-card').classList.add('hidden');
  document.getElementById('bridge-card').classList.add('hidden');
  document.getElementById('today-empty').classList.add('hidden');
  document.getElementById('today-thread').classList.add('hidden');
  document.getElementById('btn-okay').classList.add('hidden');
  document.getElementById('btn-cancel').classList.add('hidden');
  const problem = (reason === 'error' || reason === 'permission_denied');
  if (reason === 'reached') {
    // User (holding the phone) confirmed they reached someone — honest, not auto-detected.
    document.getElementById('alarm-terminal-title').textContent = 'You reached someone.';
    document.getElementById('alarm-terminal-sub').textContent   = 'I\'ve stopped calling. If you need more help, press I NEED HELP.';
  } else if (problem) {
    document.getElementById('alarm-terminal-title').textContent = 'Couldn\'t place the call.';
    document.getElementById('alarm-terminal-sub').textContent   = 'Please allow phone access, then press I NEED HELP to try again.';
  } else {
    document.getElementById('alarm-terminal-title').textContent = 'I\'ve called all your contacts.';
    document.getElementById('alarm-terminal-sub').textContent   = 'If you still need help, press I NEED HELP to try again, or return to Iona.';
  }
  document.getElementById('btn-alert').classList.remove('hidden');
  document.getElementById('btn-alert').classList.remove('btn--pulse');
  document.getElementById('btn-alarm-done').classList.remove('hidden');
  _showTerminalCard();
  // 60s auto-return to resting Today (same mechanism as the bridge/escalation terminals).
  _clearBridgeTerminalReturnTimer();
  _bridgeTerminalReturnTimer = setTimeout(showAlarmIdleReset, BRIDGE_TERMINAL_AUTORETURN_MS);
}

// --- Device-dial event logging: online write, else queue locally + flush when online ---
// Device dial reaches real emergency contacts, so it leaves the same EventLog audit trail as
// the bridge/escalation. Offline (the floor case) there's no backend to write to, so events
// queue in Preferences and flush when connectivity returns — the record is written late, not lost.
function _deviceDialLogBody(eventType, payload) {
  const dd = _deviceDial;
  const idx = payload.contact_index;
  const contact = (dd && typeof idx === 'number') ? dd.contacts[idx] : null;
  return {
    event_type:         eventType,
    member_airtable_id: dd?.memberAirtableId || '',
    session_id:         dd?.sessionId || '',
    contact_index:      (typeof idx === 'number') ? idx : null,
    contact_name:       payload.contact_name  || contact?.name  || '',
    contact_phone:      payload.contact_phone || contact?.phone || '',
    trigger_source:     dd?.triggerSource || '',
    detail:             JSON.stringify(payload),
    client_ts:          Date.now(),
  };
}

async function logDeviceDialEvent(eventType, payload = {}) {
  const body = _deviceDialLogBody(eventType, payload);
  try {
    const res = await fetch(`${STATUS_BASE}/device-dial/log-event`, {
      method: 'POST', headers: NGROK_HEADERS, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
  } catch (err) {
    await _queueDeviceDialLog(body);   // offline — write late on next flush
  }
}

async function _queueDeviceDialLog(body) {
  try {
    const raw = await getPreference(DEVICE_DIAL_LOG_QUEUE_KEY);
    const q = raw ? JSON.parse(raw) : [];
    q.push(body);
    await setPreference(DEVICE_DIAL_LOG_QUEUE_KEY, JSON.stringify(q));
  } catch (e) { console.warn('[DeviceDial] log queue write failed:', e); }
}

// Flush queued audit records (called when an online cache refresh succeeds). Failed posts stay queued.
async function flushDeviceDialLogQueue() {
  let q;
  try {
    const raw = await getPreference(DEVICE_DIAL_LOG_QUEUE_KEY);
    if (!raw) return;
    q = JSON.parse(raw);
  } catch (e) { return; }
  if (!Array.isArray(q) || q.length === 0) return;
  const remaining = [];
  for (const body of q) {
    try {
      const res = await fetch(`${STATUS_BASE}/device-dial/log-event`, {
        method: 'POST', headers: NGROK_HEADERS, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
    } catch (e) { remaining.push(body); }
  }
  try {
    if (remaining.length) await setPreference(DEVICE_DIAL_LOG_QUEUE_KEY, JSON.stringify(remaining));
    else await removePreference(DEVICE_DIAL_LOG_QUEUE_KEY);
  } catch (e) {}
}

// --- Entry point ---

// Feature 003 — apply persisted appearance prefs BEFORE first paint, so there is no flash of
// the default theme/size/font. Reads via the same Preferences pattern as orb_button. Defaults
// (night / base / app) are inert — body.light already exists; the data-* hooks are consumed by
// the US6 (text-size) and US8 (font-set) CSS once those land. Never throws on the launch path.
async function applyAppearanceOnLaunch() {
  try {
    const theme    = (await getPreference('theme'))     || 'night';
    const textSize = (await getPreference('text_size')) || 'base';
    const fontSet  = (await getPreference('font_set'))  || 'app';
    const feedback = (await getPreference('feedback'))  || 'sound';
    document.body.classList.toggle('light', theme === 'day');
    document.body.dataset.textSize = textSize;  // CSS hook — US6 text-size
    document.body.dataset.fontSet  = fontSet;   // CSS hook — US8 font-set
    if (window.Feedback) window.Feedback.setMode(feedback);  // interface feedback — before first tap
  } catch (e) {
    console.warn('[Appearance] applyAppearanceOnLaunch failed (using defaults):', e);
  }
}

// Feature 005 — physical help button. A summon enters the SAME reactive help sequence as the
// in-app control (trigger label 'physical_button' is for provenance only). The cancel window and
// the escalation_state idle-guard (duplicate absorption) are inherited from _startHelpSequence —
// nothing new is built here. See specs/005-physical-help-button.
function _initFlicListeners() {
  const { Flic } = Capacitor.Plugins;
  if (!Flic) return;
  Flic.addListener('buttonSummon', () => { _startHelpSequence('physical_button'); });
  // T025 — double-tap self-test (hold-summon users; native emits buttonSelfTest, NEVER buttonSummon) →
  // the SAME service-test helper as the in-app control. Distinct gesture + distinct endpoint means a test
  // can never become a summon (and never touches _startHelpSequence).
  Flic.addListener('buttonSelfTest', () => { runServiceTest('physical_button'); });
  // A queued press too old to be a live summon is dropped natively — but NEVER silently (Constitution
  // I.4): the person felt the click and believes help is coming, so surface it (+ it's logged natively).
  Flic.addListener('summonDropped', (e) => {
    console.warn('[Flic] summon dropped — too old to act on', e);
    _showCalmNote('A button press just now couldn’t be acted on — press again if you need help.');
  });
  // RULING 3 (21 Jul) — FIRST, before either consumer below can start a fresh activation and overwrite
  // the pending marker: an activation left unresolved by an app-close/swipe is recorded as the cancel it
  // was.
  _reconcileUnresolvedActivation();
  _consumeFlicLaunchSummon();  // a press while the app was closed launched us here (full-screen intent)
  _consumeEscalationAlarm();   // Bug A — an escalation_started push while killed launched us here
}

// Exactly-once consume of a closed-app summon: the native flag is cleared atomically, so whether this
// runs first on load or on resume — and however many times the WebView reloads — it starts the help
// sequence only once. (Replaces the retained event that looped.)
async function _consumeFlicLaunchSummon() {
  const { Flic } = Capacitor.Plugins;
  if (!Flic || !Flic.consumePendingSummon) return;
  try {
    const r = await Flic.consumePendingSummon();
    if (r && r.pending) _startHelpSequence('physical_button');
  } catch (e) {}
}

// Bug A — exactly-once consume of a killed-app escalation-alarm launch (escalation_started push
// arrived while the app was closed/hidden and raised the native full-screen ring). The native flag is
// cleared atomically, so whether this runs first on load or on resume — and however many WebView
// reloads — it lands on "Calling your contacts" exactly once (no re-trigger on a later cold open).
// Routes to showEscalationActiveState (which takes over the alarm-surface arbiter), NOT a fresh cancel
// window: the escalation already started server-side. Mirrors the existing escalation_started push
// handler and _consumeFlicLaunchSummon.
// Feature 010 — THE FLOOR IS GONE (captain ruling 20 Jul, item 2). It previously dropped any resumed
// window shorter than 3s on the grounds that "a 2-second countdown reads as broken rather than generous".
// Ruled otherwise, and the ruling is right: 2.6 SECONDS IS A CANCEL OPPORTUNITY. A member who taps in
// that window and wins has genuinely stopped their contacts being called; a member who loses the race
// gets the honest late-cancel path (contacts reached, then stood down), which is a real and different
// outcome — not a failure. Dropping the countdown decided FOR them that their tap was not worth
// offering. The screen now shows the true remainder however short.
// A window is only skipped when there is genuinely none left (remaining <= 0), which is not a floor but
// the plain fact that the engine has already dialled.
// This threshold now only makes the tail MEASURABLE — the provisional 8s latency budget is to be
// revisited from a real distribution at close-out, and this is what feeds it.
const SILENCE_SHORT_REMAINDER_DIAGNOSTIC_SECONDS = 5;

async function _consumeEscalationAlarm() {
  const { Flic } = Capacitor.Plugins;
  if (!Flic || !Flic.consumePendingEscalationAlarm) return;
  try {
    const r = await Flic.consumePendingEscalationAlarm();
    if (!r || !r.pending) return;
    const d = r.data || {};
    // Feature 010 P3c — a killed-app landing for a no-response activation. The member has been looking at
    // a locked, ringing phone and has NO idea how much of their window they slept through, so the screen
    // must show only what genuinely remains: reconstruct the engine's absolute deadline from the values it
    // sent (run_ts + device_lead_in + cancel_window) rather than restarting a full window, which would
    // promise time the engine will not honour.
    //
    // CLOCK NOTE: run_ts is the SERVER's epoch ms and Date.now() is the DEVICE's, so a skewed device clock
    // skews this arithmetic. It is bounded deliberately — clamped to at most the full hold, so the worst
    // case is a countdown that is too SHORT (the member lands on the Promise early and still has the
    // two-step control) and never one that invents time. The authoritative correction remains the engine's
    // own advance push, which flips the screen whatever this countdown believes.
    if (d.trigger === 'no_response' && d.cancel_window) {
      const win = _cwClamp(d.cancel_window);
      const lead = parseInt(d.device_lead_in ?? '0', 10) || 0;
      const runTs = parseInt(d.run_ts ?? '0', 10) || 0;
      const budget = parseInt(d.latency_budget ?? '0', 10) || 0;   // (c) — same arithmetic as foreground
      const remainingMs = runTs ? ((runTs + (lead + win + budget) * 1000) - Date.now()) : 0;
      // FLOOR, not ceil — the rounding direction is load-bearing. Rounding UP hands the countdown up to
      // an extra second, which pushes its zero PAST the engine's dial deadline: the member would see time
      // still on the clock while their contacts were already being rung. Measured on the 19 Jul run, ceil
      // turned a comfortable ~0.8s of margin into 0.01s by rounding 27.16s up to 28. Flooring spends the
      // fraction instead of inventing it, so the screen always finishes a beat BEFORE the dial — the same
      // safe direction the ratified 14s lead-in was rounded in.
      const remaining = Math.min(lead + win + budget, Math.floor(remainingMs / 1000));
      if (remaining > 0 && remaining < SILENCE_SHORT_REMAINDER_DIAGNOSTIC_SECONDS) {
        console.log(`[ALARM] short remainder on cold landing — ${remaining}s of a ${win}s window ` +
                    `(run_ts ${runTs}); showing it anyway per the no-floor ruling`);
      }
      if (remaining > 0) {
        _startSilenceActivation(d, { resumeSeconds: remaining });
        return;
      }
    }
    // Member-initiated alert, a pre-010 push with no marker, or a window already spent → today's landing:
    // the sweep is (or is about to be) running, and Oran's Promise with its Phase-2 control is the truth.
    setPreference('escalation_state', 'active');
    setPreference('escalation_state_ts', String(Date.now()));
    showEscalationActiveState();
  } catch (e) {}
}

/* ══════════════════════════════════════════════════════════════════════════
   CONTACTS MIRROR (local-mirror step 2) — full-screen emergency-contacts editor.
   Source of truth = the Memberstack member (cached in `currentMember`). Writes are
   OPTIMISTIC `ms.updateMember` → update currentMember + cacheMemberOffline; on failure,
   quiet-revert + a calm note (no queueing this pass — simplicity first). NO Airtable
   write — the instant Make sync (scenario 1039536) carries the fields to the engine so
   the escalation list stays current. Slot order = call order (SAFETY-CRITICAL). Opened
   from Settings ▸ Account ▸ Contacts (repurposed Feature-003 deep-link row).
   Phase A: list / expand-edit / add / remove / reorder + full country picker.
   Phase B: "Choose from your contacts" via the in-house ContactPicker native plugin
   (system ACTION_PICK — one chosen number, no READ_CONTACTS prompt); normalisePicked
   (verbatim, below) tidies the picked number before it fills the fields.

   Country helpers (COUNTRIES / flagEmoji / PINNED / DIAL_OPTIONS / ALL_DIALS /
   populatePrefix / splitDial / normalisePicked) are VERBATIM from the website dashboard
   V7.1 so app and web behave identically (same 174-country dial table, same +1242-style
   longest-match split, same prefix-restore). Do not diverge these from the website copy.
   ══════════════════════════════════════════════════════════════════════════ */
/* ── shared timezone module (byte-identical across surfaces) ── */
/* ═══════════════════════════════════════════════════════════════
   IONA SHARED TIMEZONE MODULE — v1
   Canonical timezone picker + helpers. BYTE-IDENTICAL on all three
   surfaces (app www/, dashboard.html, onboarding.html) — same rule
   as the COUNTRIES dial-code helpers. Do not fork per surface.

   Source list: pytz common_timezones (the TextIt default list),
   legacy US/*, Canada/*, GMT aliases removed (canonical zones cover
   them; the engine still parses legacy values in old records).
   419 zones. Stored value is ALWAYS the IANA name, never an offset.
   ═══════════════════════════════════════════════════════════════ */

var IONA_TZ_PINNED = ["Europe/London", "Europe/Dublin"];

var IONA_TZ_GROUPS = {
  "Europe": ["Arctic/Longyearbyen","Europe/Amsterdam","Europe/Andorra","Europe/Astrakhan","Europe/Athens","Europe/Belgrade","Europe/Berlin","Europe/Bratislava","Europe/Brussels","Europe/Bucharest","Europe/Budapest","Europe/Busingen","Europe/Chisinau","Europe/Copenhagen","Europe/Gibraltar","Europe/Guernsey","Europe/Helsinki","Europe/Isle_of_Man","Europe/Istanbul","Europe/Jersey","Europe/Kaliningrad","Europe/Kirov","Europe/Kyiv","Europe/Lisbon","Europe/Ljubljana","Europe/Luxembourg","Europe/Madrid","Europe/Malta","Europe/Mariehamn","Europe/Minsk","Europe/Monaco","Europe/Moscow","Europe/Oslo","Europe/Paris","Europe/Podgorica","Europe/Prague","Europe/Riga","Europe/Rome","Europe/Samara","Europe/San_Marino","Europe/Sarajevo","Europe/Saratov","Europe/Simferopol","Europe/Skopje","Europe/Sofia","Europe/Stockholm","Europe/Tallinn","Europe/Tirane","Europe/Ulyanovsk","Europe/Vaduz","Europe/Vatican","Europe/Vienna","Europe/Vilnius","Europe/Volgograd","Europe/Warsaw","Europe/Zagreb","Europe/Zurich"],
  "America": ["America/Adak","America/Anchorage","America/Anguilla","America/Antigua","America/Araguaina","America/Argentina/Buenos_Aires","America/Argentina/Catamarca","America/Argentina/Cordoba","America/Argentina/Jujuy","America/Argentina/La_Rioja","America/Argentina/Mendoza","America/Argentina/Rio_Gallegos","America/Argentina/Salta","America/Argentina/San_Juan","America/Argentina/San_Luis","America/Argentina/Tucuman","America/Argentina/Ushuaia","America/Aruba","America/Asuncion","America/Atikokan","America/Bahia","America/Bahia_Banderas","America/Barbados","America/Belem","America/Belize","America/Blanc-Sablon","America/Boa_Vista","America/Bogota","America/Boise","America/Cambridge_Bay","America/Campo_Grande","America/Cancun","America/Caracas","America/Cayenne","America/Cayman","America/Chicago","America/Chihuahua","America/Ciudad_Juarez","America/Costa_Rica","America/Coyhaique","America/Creston","America/Cuiaba","America/Curacao","America/Danmarkshavn","America/Dawson","America/Dawson_Creek","America/Denver","America/Detroit","America/Dominica","America/Edmonton","America/Eirunepe","America/El_Salvador","America/Fort_Nelson","America/Fortaleza","America/Glace_Bay","America/Goose_Bay","America/Grand_Turk","America/Grenada","America/Guadeloupe","America/Guatemala","America/Guayaquil","America/Guyana","America/Halifax","America/Havana","America/Hermosillo","America/Indiana/Indianapolis","America/Indiana/Knox","America/Indiana/Marengo","America/Indiana/Petersburg","America/Indiana/Tell_City","America/Indiana/Vevay","America/Indiana/Vincennes","America/Indiana/Winamac","America/Inuvik","America/Iqaluit","America/Jamaica","America/Juneau","America/Kentucky/Louisville","America/Kentucky/Monticello","America/Kralendijk","America/La_Paz","America/Lima","America/Los_Angeles","America/Lower_Princes","America/Maceio","America/Managua","America/Manaus","America/Marigot","America/Martinique","America/Matamoros","America/Mazatlan","America/Menominee","America/Merida","America/Metlakatla","America/Mexico_City","America/Miquelon","America/Moncton","America/Monterrey","America/Montevideo","America/Montserrat","America/Nassau","America/New_York","America/Nome","America/Noronha","America/North_Dakota/Beulah","America/North_Dakota/Center","America/North_Dakota/New_Salem","America/Nuuk","America/Ojinaga","America/Panama","America/Paramaribo","America/Phoenix","America/Port-au-Prince","America/Port_of_Spain","America/Porto_Velho","America/Puerto_Rico","America/Punta_Arenas","America/Rankin_Inlet","America/Recife","America/Regina","America/Resolute","America/Rio_Branco","America/Santarem","America/Santiago","America/Santo_Domingo","America/Sao_Paulo","America/Scoresbysund","America/Sitka","America/St_Barthelemy","America/St_Johns","America/St_Kitts","America/St_Lucia","America/St_Thomas","America/St_Vincent","America/Swift_Current","America/Tegucigalpa","America/Thule","America/Tijuana","America/Toronto","America/Tortola","America/Vancouver","America/Whitehorse","America/Winnipeg","America/Yakutat"],
  "Africa": ["Africa/Abidjan","Africa/Accra","Africa/Addis_Ababa","Africa/Algiers","Africa/Asmara","Africa/Bamako","Africa/Bangui","Africa/Banjul","Africa/Bissau","Africa/Blantyre","Africa/Brazzaville","Africa/Bujumbura","Africa/Cairo","Africa/Casablanca","Africa/Ceuta","Africa/Conakry","Africa/Dakar","Africa/Dar_es_Salaam","Africa/Djibouti","Africa/Douala","Africa/El_Aaiun","Africa/Freetown","Africa/Gaborone","Africa/Harare","Africa/Johannesburg","Africa/Juba","Africa/Kampala","Africa/Khartoum","Africa/Kigali","Africa/Kinshasa","Africa/Lagos","Africa/Libreville","Africa/Lome","Africa/Luanda","Africa/Lubumbashi","Africa/Lusaka","Africa/Malabo","Africa/Maputo","Africa/Maseru","Africa/Mbabane","Africa/Mogadishu","Africa/Monrovia","Africa/Nairobi","Africa/Ndjamena","Africa/Niamey","Africa/Nouakchott","Africa/Ouagadougou","Africa/Porto-Novo","Africa/Sao_Tome","Africa/Tripoli","Africa/Tunis","Africa/Windhoek"],
  "Asia": ["Asia/Aden","Asia/Almaty","Asia/Amman","Asia/Anadyr","Asia/Aqtau","Asia/Aqtobe","Asia/Ashgabat","Asia/Atyrau","Asia/Baghdad","Asia/Bahrain","Asia/Baku","Asia/Bangkok","Asia/Barnaul","Asia/Beirut","Asia/Bishkek","Asia/Brunei","Asia/Chita","Asia/Colombo","Asia/Damascus","Asia/Dhaka","Asia/Dili","Asia/Dubai","Asia/Dushanbe","Asia/Famagusta","Asia/Gaza","Asia/Hebron","Asia/Ho_Chi_Minh","Asia/Hong_Kong","Asia/Hovd","Asia/Irkutsk","Asia/Jakarta","Asia/Jayapura","Asia/Jerusalem","Asia/Kabul","Asia/Kamchatka","Asia/Karachi","Asia/Kathmandu","Asia/Khandyga","Asia/Kolkata","Asia/Krasnoyarsk","Asia/Kuala_Lumpur","Asia/Kuching","Asia/Kuwait","Asia/Macau","Asia/Magadan","Asia/Makassar","Asia/Manila","Asia/Muscat","Asia/Nicosia","Asia/Novokuznetsk","Asia/Novosibirsk","Asia/Omsk","Asia/Oral","Asia/Phnom_Penh","Asia/Pontianak","Asia/Pyongyang","Asia/Qatar","Asia/Qostanay","Asia/Qyzylorda","Asia/Riyadh","Asia/Sakhalin","Asia/Samarkand","Asia/Seoul","Asia/Shanghai","Asia/Singapore","Asia/Srednekolymsk","Asia/Taipei","Asia/Tashkent","Asia/Tbilisi","Asia/Tehran","Asia/Thimphu","Asia/Tokyo","Asia/Tomsk","Asia/Ulaanbaatar","Asia/Urumqi","Asia/Ust-Nera","Asia/Vientiane","Asia/Vladivostok","Asia/Yakutsk","Asia/Yangon","Asia/Yekaterinburg","Asia/Yerevan"],
  "Australia": ["Australia/Adelaide","Australia/Brisbane","Australia/Broken_Hill","Australia/Darwin","Australia/Eucla","Australia/Hobart","Australia/Lindeman","Australia/Lord_Howe","Australia/Melbourne","Australia/Perth","Australia/Sydney"],
  "Pacific": ["Pacific/Apia","Pacific/Auckland","Pacific/Bougainville","Pacific/Chatham","Pacific/Chuuk","Pacific/Easter","Pacific/Efate","Pacific/Fakaofo","Pacific/Fiji","Pacific/Funafuti","Pacific/Galapagos","Pacific/Gambier","Pacific/Guadalcanal","Pacific/Guam","Pacific/Honolulu","Pacific/Kanton","Pacific/Kiritimati","Pacific/Kosrae","Pacific/Kwajalein","Pacific/Majuro","Pacific/Marquesas","Pacific/Midway","Pacific/Nauru","Pacific/Niue","Pacific/Norfolk","Pacific/Noumea","Pacific/Pago_Pago","Pacific/Palau","Pacific/Pitcairn","Pacific/Pohnpei","Pacific/Port_Moresby","Pacific/Rarotonga","Pacific/Saipan","Pacific/Tahiti","Pacific/Tarawa","Pacific/Tongatapu","Pacific/Wake","Pacific/Wallis"],
  "Atlantic": ["Atlantic/Azores","Atlantic/Bermuda","Atlantic/Canary","Atlantic/Cape_Verde","Atlantic/Faroe","Atlantic/Madeira","Atlantic/Reykjavik","Atlantic/South_Georgia","Atlantic/St_Helena","Atlantic/Stanley"],
  "Indian": ["Indian/Antananarivo","Indian/Chagos","Indian/Christmas","Indian/Cocos","Indian/Comoro","Indian/Kerguelen","Indian/Mahe","Indian/Maldives","Indian/Mauritius","Indian/Mayotte","Indian/Reunion"],
  "Antarctica": ["Antarctica/Casey","Antarctica/Davis","Antarctica/DumontDUrville","Antarctica/Macquarie","Antarctica/Mawson","Antarctica/McMurdo","Antarctica/Palmer","Antarctica/Rothera","Antarctica/Syowa","Antarctica/Troll","Antarctica/Vostok"],
  "Other": ["UTC"]
};

var IONA_TZ_DEFAULT = "Europe/London";

/* Full flat list (pinned first) — for validation */
function ionaTzAll() {
  var all = IONA_TZ_PINNED.slice();
  for (var g in IONA_TZ_GROUPS) all = all.concat(IONA_TZ_GROUPS[g]);
  return all;
}

/* Is this string a zone we offer? */
function ionaTzValid(zone) {
  return ionaTzAll().indexOf(zone) !== -1;
}

/* Browser-detected IANA zone, validated against our list.
   Falls back to Europe/London. NEVER call this to overwrite a
   saved value — prefill on onboarding only. */
function ionaTzDetect() {
  try {
    var z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (z && ionaTzValid(z)) return z;
  } catch (e) {}
  return IONA_TZ_DEFAULT;
}

/* Current UTC offset label for a zone, e.g. "GMT+01:00".
   Computed live — correct through DST, never stored. */
function ionaTzOffsetLabel(zone) {
  try {
    var parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone, timeZoneName: "longOffset"
    }).formatToParts(new Date());
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type === "timeZoneName") {
        var v = parts[i].value;               /* "GMT+1" or "GMT+01:00" */
        return v === "GMT" ? "GMT+00:00" : v;
      }
    }
  } catch (e) {}
  return "";
}

/* Current wall-clock time in a zone, e.g. "14:32" — the live clock. */
function ionaTzTime(zone) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false
    }).format(new Date());
  } catch (e) {
    return "";
  }
}

/* Friendly option label: "London — GMT+01:00" */
function ionaTzLabel(zone) {
  var city = zone.indexOf("/") !== -1
    ? zone.substring(zone.indexOf("/") + 1).replace(/_/g, " ").replace(/\//g, " / ")
    : zone;
  var off = ionaTzOffsetLabel(zone);
  return off ? city + " \u2014 " + off : city;
}

/* Populate a native <select>: pinned UK/Ireland, divider, then
   region optgroups. Restores savedValue if present + valid;
   legacy saved values NOT in the list get a temporary option so
   nothing silently changes on load. */
function ionaTzPopulate(sel, savedValue) {
  if (!sel) return;
  sel.innerHTML = "";
  IONA_TZ_PINNED.forEach(function (z) {
    var o = document.createElement("option");
    o.value = z; o.textContent = ionaTzLabel(z);
    sel.appendChild(o);
  });
  var div = document.createElement("option");
  div.disabled = true; div.textContent = "\u2500\u2500\u2500\u2500\u2500\u2500";
  sel.appendChild(div);
  for (var g in IONA_TZ_GROUPS) {
    var og = document.createElement("optgroup");
    og.label = g;
    IONA_TZ_GROUPS[g].forEach(function (z) {
      var o = document.createElement("option");
      o.value = z; o.textContent = ionaTzLabel(z);
      og.appendChild(o);
    });
    sel.appendChild(og);
  }
  if (savedValue) {
    if (!ionaTzValid(savedValue)) {
      var legacy = document.createElement("option");
      legacy.value = savedValue; legacy.textContent = savedValue + " (saved)";
      sel.insertBefore(legacy, sel.firstChild);
    }
    sel.value = savedValue;
  } else {
    sel.value = IONA_TZ_DEFAULT;
  }
}

/* Live clock line. Give it the element + a function returning the
   currently selected zone; updates now + every 30s while visible.
   Returns the interval id (clear on screen exit). Copy pattern:
   "It's currently 14:32 there" — caller supplies the sentence. */
function ionaTzStartClock(el, getZone, render) {
  if (!el) return null;
  function tick() {
    var z = getZone();
    var t = z ? ionaTzTime(z) : "";
    el.textContent = t ? render(t, z) : "";
  }
  tick();
  return setInterval(tick, 30000);
}
/* ═══════════════ END IONA SHARED TIMEZONE MODULE ═══════════════ */

const COUNTRIES=[["Afghanistan","+93","af"],["Albania","+355","al"],["Algeria","+213","dz"],["Andorra","+376","ad"],["Angola","+244","ao"],["Argentina","+54","ar"],["Armenia","+374","am"],["Australia","+61","au"],["Austria","+43","at"],["Azerbaijan","+994","az"],["Bahamas","+1242","bs"],["Bahrain","+973","bh"],["Bangladesh","+880","bd"],["Barbados","+1246","bb"],["Belarus","+375","by"],["Belgium","+32","be"],["Belize","+501","bz"],["Benin","+229","bj"],["Bhutan","+975","bt"],["Bolivia","+591","bo"],["Bosnia and Herzegovina","+387","ba"],["Botswana","+267","bw"],["Brazil","+55","br"],["Brunei","+673","bn"],["Bulgaria","+359","bg"],["Burkina Faso","+226","bf"],["Burundi","+257","bi"],["Cambodia","+855","kh"],["Cameroon","+237","cm"],["Canada","+1","ca"],["Cape Verde","+238","cv"],["Chad","+235","td"],["Chile","+56","cl"],["China","+86","cn"],["Colombia","+57","co"],["Congo","+242","cg"],["Costa Rica","+506","cr"],["Croatia","+385","hr"],["Cuba","+53","cu"],["Cyprus","+357","cy"],["Czechia","+420","cz"],["Denmark","+45","dk"],["Djibouti","+253","dj"],["Dominican Republic","+1809","do"],["DR Congo","+243","cd"],["Ecuador","+593","ec"],["Egypt","+20","eg"],["El Salvador","+503","sv"],["Estonia","+372","ee"],["Eswatini","+268","sz"],["Ethiopia","+251","et"],["Fiji","+679","fj"],["Finland","+358","fi"],["France","+33","fr"],["Gabon","+241","ga"],["Gambia","+220","gm"],["Georgia","+995","ge"],["Germany","+49","de"],["Ghana","+233","gh"],["Gibraltar","+350","gi"],["Greece","+30","gr"],["Grenada","+1473","gd"],["Guatemala","+502","gt"],["Guernsey","+44","gg"],["Guinea","+224","gn"],["Guyana","+592","gy"],["Haiti","+509","ht"],["Honduras","+504","hn"],["Hong Kong","+852","hk"],["Hungary","+36","hu"],["Iceland","+354","is"],["India","+91","in"],["Indonesia","+62","id"],["Iran","+98","ir"],["Iraq","+964","iq"],["Isle of Man","+44","im"],["Israel","+972","il"],["Italy","+39","it"],["Ivory Coast","+225","ci"],["Jamaica","+1876","jm"],["Japan","+81","jp"],["Jersey","+44","je"],["Jordan","+962","jo"],["Kazakhstan","+7","kz"],["Kenya","+254","ke"],["Kuwait","+965","kw"],["Kyrgyzstan","+996","kg"],["Laos","+856","la"],["Latvia","+371","lv"],["Lebanon","+961","lb"],["Lesotho","+266","ls"],["Liberia","+231","lr"],["Libya","+218","ly"],["Liechtenstein","+423","li"],["Lithuania","+370","lt"],["Luxembourg","+352","lu"],["Macau","+853","mo"],["Madagascar","+261","mg"],["Malawi","+265","mw"],["Malaysia","+60","my"],["Maldives","+960","mv"],["Mali","+223","ml"],["Malta","+356","mt"],["Mauritania","+222","mr"],["Mauritius","+230","mu"],["Mexico","+52","mx"],["Moldova","+373","md"],["Monaco","+377","mc"],["Mongolia","+976","mn"],["Montenegro","+382","me"],["Morocco","+212","ma"],["Mozambique","+258","mz"],["Myanmar","+95","mm"],["Namibia","+264","na"],["Nepal","+977","np"],["Netherlands","+31","nl"],["New Zealand","+64","nz"],["Nicaragua","+505","ni"],["Niger","+227","ne"],["Nigeria","+234","ng"],["North Macedonia","+389","mk"],["Norway","+47","no"],["Oman","+968","om"],["Pakistan","+92","pk"],["Panama","+507","pa"],["Papua New Guinea","+675","pg"],["Paraguay","+595","py"],["Peru","+51","pe"],["Philippines","+63","ph"],["Poland","+48","pl"],["Portugal","+351","pt"],["Qatar","+974","qa"],["Romania","+40","ro"],["Russia","+7","ru"],["Rwanda","+250","rw"],["Saudi Arabia","+966","sa"],["Senegal","+221","sn"],["Serbia","+381","rs"],["Seychelles","+248","sc"],["Sierra Leone","+232","sl"],["Singapore","+65","sg"],["Slovakia","+421","sk"],["Slovenia","+386","si"],["Somalia","+252","so"],["South Africa","+27","za"],["South Korea","+82","kr"],["South Sudan","+211","ss"],["Spain","+34","es"],["Sri Lanka","+94","lk"],["Sudan","+249","sd"],["Suriname","+597","sr"],["Sweden","+46","se"],["Switzerland","+41","ch"],["Syria","+963","sy"],["Taiwan","+886","tw"],["Tajikistan","+992","tj"],["Tanzania","+255","tz"],["Thailand","+66","th"],["Togo","+228","tg"],["Trinidad and Tobago","+1868","tt"],["Tunisia","+216","tn"],["Turkey","+90","tr"],["Turkmenistan","+993","tm"],["Uganda","+256","ug"],["Ukraine","+380","ua"],["United Arab Emirates","+971","ae"],["United States","+1","us"],["Uruguay","+598","uy"],["Uzbekistan","+998","uz"],["Venezuela","+58","ve"],["Vietnam","+84","vn"],["Yemen","+967","ye"],["Zambia","+260","zm"],["Zimbabwe","+263","zw"]];
const flagEmoji=iso=>[...iso].map(c=>String.fromCodePoint(0x1F1E6+c.charCodeAt(0)-97)).join('');
const PINNED=[["United Kingdom","+44","gb"],["Ireland","+353","ie"]];
const DIAL_OPTIONS=
  PINNED.map(([n,d,f])=>`<option value="${d}" data-iso="${f}">${flagEmoji(f)} ${d} · ${n}</option>`).join('')
  +'<option disabled>──────</option>'
  +COUNTRIES.map(([n,d,f])=>`<option value="${d}" data-iso="${f}">${flagEmoji(f)} ${d} · ${n}</option>`).join('');
const ALL_DIALS=[...new Set([...PINNED,...COUNTRIES].map(c=>c[1]))].sort((a,b)=>b.length-a.length);
function populatePrefix(sel,prfx){ if(!sel) return; sel.innerHTML=DIAL_OPTIONS; sel.value=(prfx&&ALL_DIALS.includes(prfx))?prfx:'+44'; }
function splitDial(full){ if(!full) return {prfx:'+44',rest:''}; const hit=ALL_DIALS.find(d=>full.startsWith(d)); return hit?{prfx:hit,rest:full.slice(hit.length)}:{prfx:'+44',rest:full.replace(/^\+/,'')}; }
function normalisePicked(raw,currentPrfx){ let n=(raw||'').replace(/[^\d+]/g,''); if(n.startsWith('00')) n='+'+n.slice(2); if(n.startsWith('+')){ const sp=splitDial(n); return {prfx:sp.prfx,rest:sp.rest}; } return {prfx:currentPrfx||'+44',rest:n}; }  // Phase B
// Option A — the visible prefix chip shows only the selected country's flag; keep it in sync with the <select>.
function _cmSyncPrfxFlag(sel){
  const wrap = (sel && sel.closest) ? sel.closest('.cm-prfx-wrap') : null;
  if(!wrap) return;
  const flagEl = wrap.querySelector('.cm-prfx-flag');
  if(!flagEl) return;
  const opt = sel.selectedOptions && sel.selectedOptions[0];
  const iso = (opt && opt.dataset) ? opt.dataset.iso : '';
  flagEl.textContent = iso ? flagEmoji(iso) : '🌐';
}

// —— slot model: ORDINALS map to contact-{ord}-{first-name,last-name,mobile-number}. Slot order = call order.
const CM_ORDINALS = ['one','two','three','four','five','six'];
let _cmOpenOrd = null;   // ord of the currently-expanded card (one open at a time), or null
let _cmNewOrd  = null;   // ord of an unsaved "add" card, or null
let _cmWired   = false;  // one-time back/add button binding
let _cmWriting = false;  // an optimistic write is in flight — serialise mutating actions (call-order safety)

function _cmFields() { return (currentMember && currentMember.customFields) || {}; }
function _cmSlot(ord) {
  const cf = _cmFields();
  return {
    first: cf['contact-' + ord + '-first-name'] || '',
    last:  cf['contact-' + ord + '-last-name']  || '',
    phone: cf['contact-' + ord + '-mobile-number'] || '',
  };
}
function _cmOccupied(ord) { const s = _cmSlot(ord); return !!(s.first || s.last || s.phone); }
function _cmOccupiedOrds() { return CM_ORDINALS.filter(_cmOccupied); }
// Display list = occupied slots (call order) + the unsaved "add" slot (last), if any.
function _cmDisplayOrds() {
  const occ = _cmOccupiedOrds();
  if (_cmNewOrd && !occ.includes(_cmNewOrd)) occ.push(_cmNewOrd);
  return occ;
}
function _cmEsc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function openContactsScreen() {
  _cmOpenOrd = null; _cmNewOrd = null;
  show('screen-contacts');
  if (!_cmWired) {
    const backTop = document.getElementById('btn-contacts-back');
    if (backTop) backTop.addEventListener('click', _cmExit);
    const backBottom = document.getElementById('btn-contacts-done');
    if (backBottom) backBottom.addEventListener('click', _cmExit);
    const add = document.getElementById('cm-add-btn');
    if (add) add.addEventListener('click', cmAddContact);
    _cmWired = true;
  }
  renderContactsScreen();
  const sc = document.querySelector('#screen-contacts .cm-scroll');
  if (sc) sc.scrollTop = 0;   // always start at the top
}

// Exit → back to the Settings sheet, Account pane (the row the member came from). We explicitly
// re-activate Account rather than trusting persisted overlay state, so a lost/other tab state
// (backgrounding, a future entry point) can never leave the member on the wrong pane or a blank sheet.
function _cmExit() {
  show('screen-today');
  const ov = document.getElementById('settings-overlay');
  if (ov) ov.classList.remove('hidden');
  if (typeof _activateSettingsTab === 'function') _activateSettingsTab('account');
}

function renderContactsScreen() {
  const list = document.getElementById('cm-list');
  if (!list) return;
  list.innerHTML = '';
  const ords = _cmDisplayOrds();
  const occ = _cmOccupiedOrds();
  ords.forEach((ord, i) => {
    const isNew = (ord === _cmNewOrd) && !occ.includes(ord);
    list.appendChild(_cmMakeCard(ord, i + 1, isNew, occ));
  });
  const pending = (_cmNewOrd && !occ.includes(_cmNewOrd)) ? 1 : 0;
  _cmUpdateAddBtn(occ.length + pending);
}

function _cmMakeCard(ord, num, isNew, occ) {
  const s = _cmSlot(ord);
  const sp = splitDial(s.phone);
  const open = (ord === _cmOpenOrd);
  const nameDisplay = (s.first || '—') + ' ' + (s.last || '');
  const phoneDisplay = s.phone || 'Not set';
  // Reorder runs over OCCUPIED slots only (call order); an unsaved "add" card gets no arrows.
  const occIdx = occ.indexOf(ord);
  const canReorder = !isNew && occ.length > 1;
  const upDis = (occIdx <= 0);
  const downDis = (occIdx === occ.length - 1);

  const card = document.createElement('div');
  card.className = 'cm-card' + (open ? ' is-open' : '');
  card.dataset.ord = ord;
  card.innerHTML =
    '<div class="cm-top">' +
      '<div class="cm-num">' + num + '</div>' +
      '<div class="cm-meta">' +
        '<div class="cm-hdr">Contact ' + num + '</div>' +
        '<div class="cm-summary">' + _cmEsc(nameDisplay) + ' · ' + _cmEsc(phoneDisplay) + '</div>' +
      '</div>' +
      (canReorder ? '<div class="cm-reorder">' +
        '<button class="cm-up" ' + (upDis ? 'disabled' : '') + ' aria-label="Move up in call order">▲</button>' +
        '<button class="cm-down" ' + (downDis ? 'disabled' : '') + ' aria-label="Move down in call order">▼</button>' +
      '</div>' : '') +
      '<div class="cm-chev">›</div>' +
    '</div>' +
    '<div class="cm-form">' +
      (_cmPickAvailable() ? '<button type="button" class="cm-pick">📒 Add from phone</button>' : '') +
      '<div class="cm-row-2">' +
        '<div><label class="cm-fld-lbl">First name</label>' +
          '<input type="text" class="cm-first" value="' + _cmEsc(s.first) + '" placeholder="First name"></div>' +
        '<div><label class="cm-fld-lbl">Last name</label>' +
          '<input type="text" class="cm-last" value="' + _cmEsc(s.last) + '" placeholder="Last name"></div>' +
      '</div>' +
      '<label class="cm-fld-lbl">Phone number</label>' +
      '<div class="cm-ph-row">' +
        '<div class="cm-prfx-wrap">' +
          '<span class="cm-prfx-flag" aria-hidden="true"></span>' +
          '<span class="cm-prfx-caret" aria-hidden="true">▾</span>' +
          '<select class="cm-prfx" aria-label="Country dialling code"></select>' +
        '</div>' +
        '<input type="text" class="cm-num-inp" inputmode="tel" value="' + _cmEsc(sp.rest) + '" placeholder="07123456789"></div>' +
      '<div class="cm-actions"><button class="cm-save">Save contact</button></div>' +
      (num > 1 ? '<button class="cm-remove">Remove this contact</button>' : '') +
      '<div class="cm-confirm">' +
        'Remove ' + _cmEsc(s.first || 'this contact') + ' from the list? They will no longer be called.' +
        '<div class="cm-confirm-row">' +
          '<button class="cm-confirm-keep">Keep</button>' +
          '<button class="cm-confirm-remove">Remove</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  // country picker — populate options + restore saved prefix on the detached node; the visible chip
  // shows only the flag (the full "flag +code · name" list still opens on tap).
  const prfxSel = card.querySelector('.cm-prfx');
  populatePrefix(prfxSel, sp.prfx);
  _cmSyncPrfxFlag(prfxSel);
  prfxSel.addEventListener('change', () => _cmSyncPrfxFlag(prfxSel));

  // —— wiring ——
  card.querySelector('.cm-top').addEventListener('click', () => cmToggle(ord));
  const up = card.querySelector('.cm-up');
  if (up) up.addEventListener('click', (e) => { e.stopPropagation(); cmMove(ord, -1); });
  const down = card.querySelector('.cm-down');
  if (down) down.addEventListener('click', (e) => { e.stopPropagation(); cmMove(ord, 1); });
  card.querySelector('.cm-save').addEventListener('click', () => cmSaveContact(ord, card));
  const pick = card.querySelector('.cm-pick');
  if (pick) pick.addEventListener('click', (e) => { e.stopPropagation(); cmPickContact(ord, card); });
  const rmv = card.querySelector('.cm-remove');
  if (rmv) rmv.addEventListener('click', () => card.querySelector('.cm-confirm').classList.add('show'));
  const keep = card.querySelector('.cm-confirm-keep');
  if (keep) keep.addEventListener('click', () => card.querySelector('.cm-confirm').classList.remove('show'));
  const rmYes = card.querySelector('.cm-confirm-remove');
  if (rmYes) rmYes.addEventListener('click', () => cmRemoveContact(ord));

  return card;
}

function cmToggle(ord) {
  const closing = (_cmOpenOrd === ord);
  // Discard an unsaved "add" card whenever we leave it (open another card, or collapse it).
  if (_cmNewOrd && !_cmOccupied(_cmNewOrd) && (ord !== _cmNewOrd || closing)) _cmNewOrd = null;
  _cmOpenOrd = closing ? null : ord;
  renderContactsScreen();
}

function _cmApplyToMember(fields) {
  if (!currentMember) return;
  currentMember.customFields = currentMember.customFields || {};
  Object.assign(currentMember.customFields, fields);
}

// The one write path: optimistic caller already mutated currentMember; persist to Memberstack, and on
// success refresh the offline cache. Returns true only on a confirmed write (caller reverts on false).
async function _cmWrite(fields) {
  if (!ms || !ms.updateMember) return false;
  try {
    await ms.updateMember({ customFields: fields });
    cacheMemberOffline(currentMember);   // persist confirmed state for offline launch
    return true;
  } catch (e) {
    console.warn('[Contacts] write failed:', e);
    return false;
  }
}

async function cmSaveContact(ord, card) {
  if (_cmWriting) return;   // a write is in flight — absorb the tap (serialise; no racing background writes)
  const first = (card.querySelector('.cm-first').value || '').trim();
  const last  = (card.querySelector('.cm-last').value  || '').trim();
  const prfx  = card.querySelector('.cm-prfx').value || '+44';
  const ph    = (card.querySelector('.cm-num-inp').value || '').trim();
  const digits = ph.replace(/\D/g, '').replace(/^0/, '');   // local part, sans non-digits + leading zero
  const full  = digits ? prfx + digits : '';
  if (!first || !last || !full) { _showCalmNote('Please add a first name, last name and phone number.'); return; }
  if (digits.length < 9) { _showCalmNote('Please enter a valid phone number.'); return; }   // min 9 — parity with onboarding/dashboard

  const prev = _cmSlot(ord);   // snapshot for revert
  const fields = {
    ['contact-' + ord + '-first-name']: first,
    ['contact-' + ord + '-last-name']: last,
    ['contact-' + ord + '-mobile-number']: full,
  };
  _cmWriting = true;
  try {
    // OPTIMISTIC: commit to the cached member + collapse so the list reflects the save instantly.
    _cmApplyToMember(fields);
    if (_cmNewOrd === ord) _cmNewOrd = null;
    _cmOpenOrd = null;
    renderContactsScreen();
    const ok = await _cmWrite(fields);
    if (!ok) {
      _cmApplyToMember({
        ['contact-' + ord + '-first-name']: prev.first,
        ['contact-' + ord + '-last-name']: prev.last,
        ['contact-' + ord + '-mobile-number']: prev.phone,
      });
      renderContactsScreen();
      _showCalmNote('Couldn’t save just now — please try again.');
    } else {
      _showCalmNote('Contact saved.');
      refreshSignalAudioCache();  // feature 006 — regenerate this member's Signal clips after a contact change
    }
  } finally {
    _cmWriting = false;
  }
}

// Phase B — "Choose from your contacts" via the in-house ContactPicker native plugin.
function _cmPickAvailable() {
  return !!(window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.ContactPicker);
}
async function cmPickContact(ord, card) {
  const CP = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.ContactPicker;
  if (!CP) return;
  let res = null;
  try {
    res = await CP.pickContact();   // { name, tel } — one chosen number; empty object on cancel
  } catch (e) {
    _showCalmNote('Couldn’t open your contacts just now.');
    return;
  }
  const tel = (res && res.tel) || '';
  if (!tel) return;   // cancelled / no number chosen — no-op
  if (_alarmFlowActive) return;   // an alarm took over while the picker was open — discard; the emergency owns the screen
  const name = (res && res.name) || '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const firstEl = card.querySelector('.cm-first');
  const lastEl = card.querySelector('.cm-last');
  if (parts[0] && firstEl) firstEl.value = parts[0];
  if (parts.length > 1 && lastEl) lastEl.value = parts.slice(1).join(' ');
  const prfxEl = card.querySelector('.cm-prfx');
  const numEl = card.querySelector('.cm-num-inp');
  const np = normalisePicked(tel, prfxEl ? prfxEl.value : '+44');
  if (prfxEl) { prfxEl.value = np.prfx; _cmSyncPrfxFlag(prfxEl); }
  if (numEl) numEl.value = np.rest;
  // Nothing is saved on pick — the member reviews the filled fields + taps Save (brief behaviour 7).
  _showCalmNote('Filled from your contacts — check the details and save.');
}

function cmAddContact() {
  const occ = _cmOccupiedOrds();
  if (occ.length >= 6) return;                       // guard (button is disabled at 6 anyway)
  const empty = CM_ORDINALS.find((o) => !_cmOccupied(o));   // first empty slot, in call order
  if (!empty) return;
  _cmNewOrd = empty;
  _cmOpenOrd = empty;
  renderContactsScreen();
  const card = document.querySelector('#cm-list .cm-card[data-ord="' + empty + '"]');
  const f = card && card.querySelector('.cm-first');
  if (f) f.focus();
}

async function cmRemoveContact(ord) {
  if (_cmWriting) return;   // a write is in flight — absorb the tap (serialise; no racing background writes)
  // Unsaved "add" card — nothing persisted, just drop it.
  if (_cmNewOrd === ord && !_cmOccupied(ord)) { _cmNewOrd = null; _cmOpenOrd = null; renderContactsScreen(); return; }
  const prev = _cmSlot(ord);
  const cleared = {
    ['contact-' + ord + '-first-name']: '',
    ['contact-' + ord + '-last-name']: '',
    ['contact-' + ord + '-mobile-number']: '',
  };
  _cmWriting = true;
  try {
    _cmApplyToMember(cleared);
    _cmOpenOrd = null;
    renderContactsScreen();
    const ok = await _cmWrite(cleared);
    if (!ok) {
      _cmApplyToMember({
        ['contact-' + ord + '-first-name']: prev.first,
        ['contact-' + ord + '-last-name']: prev.last,
        ['contact-' + ord + '-mobile-number']: prev.phone,
      });
      renderContactsScreen();
      _showCalmNote('Couldn’t remove just now — please try again.');
    } else {
      _showCalmNote('Contact removed.');
    }
  } finally {
    _cmWriting = false;
  }
}

// Reorder = swap the CONTENTS of the two slots backing adjacent displayed cards (call order = slot order).
async function cmMove(ord, dir) {
  if (_cmWriting) return;   // a write is in flight — absorb overlapping taps (no racing writes on the call ladder)
  const occ = _cmOccupiedOrds();
  const i = occ.indexOf(ord);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= occ.length) return;
  const ordA = ord, ordB = occ[j];
  const a = _cmSlot(ordA), b = _cmSlot(ordB);
  const swap = {
    ['contact-' + ordA + '-first-name']: b.first, ['contact-' + ordA + '-last-name']: b.last, ['contact-' + ordA + '-mobile-number']: b.phone,
    ['contact-' + ordB + '-first-name']: a.first, ['contact-' + ordB + '-last-name']: a.last, ['contact-' + ordB + '-mobile-number']: a.phone,
  };
  _cmWriting = true;
  try {
    _cmApplyToMember(swap);
    _cmOpenOrd = null;
    renderContactsScreen();
    const ok = await _cmWrite(swap);
    if (!ok) {
      _cmApplyToMember({
        ['contact-' + ordA + '-first-name']: a.first, ['contact-' + ordA + '-last-name']: a.last, ['contact-' + ordA + '-mobile-number']: a.phone,
        ['contact-' + ordB + '-first-name']: b.first, ['contact-' + ordB + '-last-name']: b.last, ['contact-' + ordB + '-mobile-number']: b.phone,
      });
      renderContactsScreen();
      _showCalmNote('Couldn’t update the call order — please try again.');
    } else {
      _showCalmNote('Call order updated.');
    }
  } finally {
    _cmWriting = false;
  }
}

function _cmUpdateAddBtn(count) {
  const btn = document.getElementById('cm-add-btn');
  const note = document.getElementById('cm-cap-note');
  if (btn) btn.disabled = count >= 6;
  if (note) {
    const left = 6 - count;
    note.textContent = count >= 6 ? 'All 6 places are in use.' : left + ' more place' + (left === 1 ? '' : 's') + ' available.';
  }
}

/* ══════════════════════════════════════════════════════════════════════
   SCHEDULE mirror — local-mirror step 3 (Standard + Advanced).
   Full-screen editor from Settings ▸ Schedule. Mirrors the website dashboard
   saveSchedule write model EXACTLY: day-one..seven packed sequentially;
   {day}-time-1..4 cleared-ALL-FIRST (load-bearing for the engine) then active
   days written — Standard = time-1 per active day; Advanced = packed per-day
   times time-1..N (≤ plan.times); time-delay ∈ {10,15,20,25,30}. One
   ms.updateMember for the whole schedule, optimistic + in-flight guard (as Contacts).
══════════════════════════════════════════════════════════════════════ */
const SC_ALL_DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const SC_DAY_SHORT = { Monday:'M', Tuesday:'T', Wednesday:'W', Thursday:'T', Friday:'F', Saturday:'S', Sunday:'S' };
const SC_DAY_KEYS = ['day-one','day-two','day-three','day-four','day-five','day-six','day-seven'];
const SC_DELAYS = [10,15,20,25,30];
// Plan limits — SAME values as the website PLANS dict, keyed by the /pwa-status planName string.
const SC_PLANS = {
  'Protector':      { maxDays: 2, times: 2, days: ['Saturday','Sunday'] },
  'Guardian':       { maxDays: 5, times: 3, days: ['Monday','Tuesday','Wednesday','Thursday','Friday'] },
  'Guardian Angel': { maxDays: 7, times: 4, days: [...SC_ALL_DAYS] },
};
const SC_DEFAULT_PLAN = 'Guardian Angel';   // website DEFAULT_PLAN_ID → Guardian Angel; used when planName unknown

let _scActiveDays = [];   // day NAMES, calendar order
let _scMode = 'standard'; // 'standard' | 'advanced'
let _scTime = '09:00';    // Standard: one time for all active days
let _scDayTimes = {};     // Advanced: { 'Monday': ['09:00','13:00'], … } — packed, no empty slots
let _scDelay = 15;
let _scWired = false;
let _scWriting = false;   // in-flight guard — a double-tap of Save is absorbed (mirrors _cmWriting)

function _scPlan() { return SC_PLANS[_servicePlanName] || SC_PLANS[SC_DEFAULT_PLAN]; }
function _scPlanName() { return SC_PLANS[_servicePlanName] ? _servicePlanName : SC_DEFAULT_PLAN; }
function _scEnsureTimes(day) { if (!_scDayTimes[day] || !_scDayTimes[day].length) _scDayTimes[day] = ['09:00']; return _scDayTimes[day]; }  // Time 1 always present (required-slot rule)

// PURE payload builder — (mode, activeDays, time, dayTimes, delay) → customFields. Standard: one time →
// each active day's time-1. Advanced: packed per-day times → time-1..N. Both mirror saveSchedule: pack day
// names; clear ALL {day}-time-1..4 first; then write. Kept pure so the parity test can assert app payload
// === website saveSchedule payload for identical inputs.
function _scComputeFields(mode, activeDays, time, dayTimes, delay) {
  const fields = {};
  SC_DAY_KEYS.forEach((k, i) => { fields[k] = activeDays[i] || ''; });        // packed sequentially
  fields['time-delay'] = delay;
  SC_ALL_DAYS.forEach(day => {                                               // clear-ALL-slots-first (load-bearing)
    const dl = day.toLowerCase();
    for (let s = 1; s <= 4; s++) fields[dl + '-time-' + s] = '';
  });
  if (mode === 'advanced') {
    activeDays.forEach(day => {
      const dl = day.toLowerCase();
      ((dayTimes && dayTimes[day]) || []).filter(Boolean).forEach((t, i) => { if (i < 4) fields[dl + '-time-' + (i + 1)] = t; });  // packed time-1..N
    });
  } else {
    activeDays.forEach(day => { fields[day.toLowerCase() + '-time-1'] = time; });  // Standard: time-1 only
  }
  return fields;
}

function _scReadFromMember() {
  const cf = (currentMember && currentMember.customFields) || {};
  const packed = SC_DAY_KEYS.map(k => cf[k]).filter(Boolean);
  _scActiveDays = SC_ALL_DAYS.filter(d => packed.includes(d));
  if (!_scActiveDays.length) _scActiveDays = [..._scPlan().days];            // no saved days → plan defaults
  // Advanced per-day times — compact (drop empties/gaps; the chip model is packed by design).
  _scDayTimes = {};
  SC_ALL_DAYS.forEach(day => {
    const dl = day.toLowerCase();
    const times = [];
    for (let s = 1; s <= 4; s++) { const v = cf[dl + '-time-' + s]; if (v) times.push(v); }
    if (times.length) _scDayTimes[day] = times;
  });
  // Standard time = first active day's saved time-1 (RESTORED — website defaults to 09:00 and would
  // overwrite on save; we restore to avoid that data-loss quirk; write logic identical, parity holds).
  let t = '';
  for (const day of _scActiveDays) { const v = cf[day.toLowerCase() + '-time-1']; if (v) { t = v; break; } }
  _scTime = t || '09:00';
  const d = parseInt(cf['time-delay'], 10);
  _scDelay = SC_DELAYS.includes(d) ? d : 15;
}

function openScheduleScreen() {
  show('screen-schedule');
  if (!_scWired) {
    const backTop = document.getElementById('btn-schedule-back');
    if (backTop) backTop.addEventListener('click', _scExit);
    const backBottom = document.getElementById('btn-schedule-done');
    if (backBottom) backBottom.addEventListener('click', _scExit);
    const timeEl = document.getElementById('sc-time');
    if (timeEl) timeEl.addEventListener('change', () => { _scTime = timeEl.value || '09:00'; _scMarkDirty(); });
    const mStd = document.getElementById('sc-mode-std');
    if (mStd) mStd.addEventListener('click', () => _scSetMode('standard'));
    const mAdv = document.getElementById('sc-mode-adv');
    if (mAdv) mAdv.addEventListener('click', () => _scSetMode('advanced'));
    const reset = document.getElementById('sc-reset');
    if (reset) reset.addEventListener('click', _scResetDefaults);
    const saveBtn = document.getElementById('sc-save');
    if (saveBtn) saveBtn.addEventListener('click', saveScheduleScreen);
    _scWired = true;
  }
  _scMode = 'standard';          // open in Standard (mirrors website schedMode default)
  _scReadFromMember();
  renderScheduleScreen();
  _scClearDirty();               // fresh load = not dirty
  const sc = document.querySelector('#screen-schedule .sc-scroll');
  if (sc) sc.scrollTop = 0;
}

// Exit → Settings ▸ Account (same cold-path hardening as _cmExit).
function _scExit() {
  show('screen-today');
  const ov = document.getElementById('settings-overlay');
  if (ov) ov.classList.remove('hidden');
  if (typeof _activateSettingsTab === 'function') _activateSettingsTab('account');
}

function _scSetMode(m) { _scMode = m; renderScheduleScreen(); }
// Save-prompt pulse — any edit to loaded state flashes the Save button (mirrors the website markChanged/.ready).
function _scMarkDirty() { const b = document.getElementById('sc-save'); if (b) b.classList.add('is-dirty'); }
function _scClearDirty() { const b = document.getElementById('sc-save'); if (b) b.classList.remove('is-dirty'); }

function _scResetDefaults() {
  _scActiveDays = [..._scPlan().days];
  _scDayTimes = {};
  _scActiveDays.forEach(d => { _scDayTimes[d] = ['09:00']; });
  _scMarkDirty();
  renderScheduleScreen();
  _showCalmNote('Back to your ' + _scPlanName() + ' plan defaults.');
}

function _scAddTime(day) { const t = _scEnsureTimes(day); if (t.length < _scPlan().times) { t.push('12:00'); _scMarkDirty(); renderScheduleScreen(); } }
function _scRemoveTime(day, i) { const t = _scEnsureTimes(day); if (i > 0) { t.splice(i, 1); _scMarkDirty(); renderScheduleScreen(); } }

function _scRenderDelay(id) {
  const dwrap = document.getElementById(id);
  if (!dwrap) return;
  dwrap.innerHTML = '';
  SC_DELAYS.forEach(v => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sc-delay-btn' + (v === _scDelay ? ' is-on' : '');
    b.textContent = v;                                     // numeric only (no "m")
    b.addEventListener('click', () => { _scDelay = v; _scMarkDirty(); renderScheduleScreen(); });
    dwrap.appendChild(b);
  });
}

// Advanced — one ROW per active day (day name + packed time chips). "+ Add time" only under the plan slot
// entitlement; × on every chip beyond Time 1 (Time 1 has no × — required-slot rule enforced structurally).
function _scRenderDayRows() {
  const rows = document.getElementById('sc-day-rows');
  if (!rows) return;
  rows.innerHTML = '';
  const plan = _scPlan();
  const act = SC_ALL_DAYS.filter(d => _scActiveDays.includes(d));
  if (!act.length) { rows.innerHTML = '<p class="sc-note">Choose at least one day above.</p>'; return; }
  act.forEach(day => {
    const times = _scEnsureTimes(day);
    const row = document.createElement('div'); row.className = 'sc-day-row';
    const name = document.createElement('div'); name.className = 'sc-day-name'; name.textContent = day;
    const chips = document.createElement('div'); chips.className = 'sc-chips';
    times.forEach((t, i) => {
      const chip = document.createElement('span'); chip.className = 'sc-chip';
      const inp = document.createElement('input');
      inp.type = 'time'; inp.value = t; inp.className = 'sc-chip-inp';
      inp.setAttribute('aria-label', day + ' time ' + (i + 1));
      inp.addEventListener('change', () => { if (_scDayTimes[day]) _scDayTimes[day][i] = inp.value; _scMarkDirty(); });
      chip.appendChild(inp);
      if (i > 0) {
        const x = document.createElement('button');
        x.type = 'button'; x.className = 'sc-chip-x'; x.textContent = '×'; x.setAttribute('aria-label', 'Remove time');
        x.addEventListener('click', () => _scRemoveTime(day, i));
        chip.appendChild(x);
      }
      chips.appendChild(chip);
    });
    if (times.length < plan.times) {
      const add = document.createElement('button');
      add.type = 'button'; add.className = 'sc-add-time'; add.textContent = '+ Add time';
      add.addEventListener('click', () => _scAddTime(day));
      chips.appendChild(add);
    }
    row.appendChild(name); row.appendChild(chips);
    rows.appendChild(row);
  });
}

function renderScheduleScreen() {
  const plan = _scPlan();
  // mode toggle + pane visibility
  const mStd = document.getElementById('sc-mode-std');
  const mAdv = document.getElementById('sc-mode-adv');
  if (mStd) mStd.classList.toggle('is-on', _scMode === 'standard');
  if (mAdv) mAdv.classList.toggle('is-on', _scMode === 'advanced');
  const stdPane = document.getElementById('sc-std-pane');
  const advPane = document.getElementById('sc-adv-pane');
  if (stdPane) stdPane.style.display = _scMode === 'standard' ? '' : 'none';
  if (advPane) advPane.style.display = _scMode === 'advanced' ? '' : 'none';
  const wrap = document.getElementById('sc-days');
  if (wrap) {
    wrap.innerHTML = '';
    SC_ALL_DAYS.forEach(day => {
      const on = _scActiveDays.includes(day);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sc-day' + (on ? ' is-on' : '');
      b.textContent = SC_DAY_SHORT[day];
      b.setAttribute('aria-label', day);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.disabled = !on && _scActiveDays.length >= plan.maxDays;    // gating: cap at plan.maxDays
      b.addEventListener('click', () => _scToggleDay(day));
      wrap.appendChild(b);
    });
  }
  const note = document.getElementById('sc-plan-note');
  if (note) note.textContent = 'Your ' + _scPlanName() + ' plan includes ' + plan.maxDays + ' days a week' + (plan.maxDays === 7 ? ' — every day.' : '.');
  const timeEl = document.getElementById('sc-time');
  if (timeEl) timeEl.value = _scTime;
  _scRenderDelay('sc-delay');       // Standard pane
  _scRenderDelay('sc-delay-adv');   // Advanced pane (same _scDelay)
  if (_scMode === 'advanced') _scRenderDayRows();
}

function _scToggleDay(day) {
  const plan = _scPlan();
  if (_scActiveDays.includes(day)) {
    _scActiveDays = _scActiveDays.filter(d => d !== day);
  } else if (_scActiveDays.length < plan.maxDays) {
    _scActiveDays = SC_ALL_DAYS.filter(d => _scActiveDays.includes(d) || d === day);   // keep calendar order
  }
  _scMarkDirty();
  renderScheduleScreen();
}

// The one write — optimistic, in-flight guarded, one ms.updateMember for the whole schedule (mirrors _cmWrite).
async function saveScheduleScreen() {
  if (_scWriting) return;
  if (!_scActiveDays.length) { _showCalmNote('Choose at least one day.'); return; }
  const timeEl = document.getElementById('sc-time');
  if (timeEl && timeEl.value) _scTime = timeEl.value;
  const fields = _scComputeFields(_scMode, _scActiveDays, _scTime, _scDayTimes, _scDelay);
  const prev = {};
  Object.keys(fields).forEach(k => { prev[k] = (currentMember && currentMember.customFields) ? currentMember.customFields[k] : undefined; });
  _scWriting = true;
  try {
    if (currentMember) { currentMember.customFields = currentMember.customFields || {}; Object.assign(currentMember.customFields, fields); }
    let ok = false;
    if (ms && ms.updateMember) {
      try { await ms.updateMember({ customFields: fields }); cacheMemberOffline(currentMember); ok = true; }
      catch (e) { console.warn('[Schedule] write failed:', e); }
    }
    if (ok) { _scClearDirty(); _showCalmNote('Schedule saved.'); }
    else {
      if (currentMember && currentMember.customFields) Object.assign(currentMember.customFields, prev);   // revert
      _scReadFromMember(); renderScheduleScreen();
      _showCalmNote('Couldn’t save just now — please try again.');
    }
  } finally { _scWriting = false; }
}

/* ══════════════════════════════════════════════════════════════════════
   ACCOUNT tab (settings completion, mirror steps 4+6) — inline cards in the
   settings Account pane (not a full-screen). Populated on Account-tab open.
   ONE ms.updateMember per Save: holder names + [service-user-* only when
   account-type='other', mirroring the website] + number-for-service-delivery +
   [user-channel only if a segment is picked] + time-zone. Optimistic
   + in-flight guard; the number field reuses the Contacts flag chip verbatim.
══════════════════════════════════════════════════════════════════════ */
const SA_CHANNELS = [{ val: 'PWA', label: 'App', icon: 'ti-device-mobile' }, { val: 'SMS', label: 'Text', icon: 'ti-message' }, { val: 'Voice', label: 'Call', icon: 'ti-phone' }];
// Account-tab live timezone clock (shared iona_timezones.js module drives it)
let _saTzClock = null;
let _saTzName = '';
function _saTzLine(t) { return _saTzName ? ('It’s currently ' + t + ' where ' + _saTzName + ' is') : ('It’s currently ' + t + ' there'); }
function _saStartTzClock() { const el = document.getElementById('sa-tz-clock'); if (!el) return; if (_saTzClock) clearInterval(_saTzClock); _saTzClock = ionaTzStartClock(el, () => document.getElementById('sa-tz')?.value, (t) => _saTzLine(t)); }
function _saStopTzClock() { if (_saTzClock) { clearInterval(_saTzClock); _saTzClock = null; } }
function _saTzClockTick() { const el = document.getElementById('sa-tz-clock'); if (!el) return; const z = document.getElementById('sa-tz')?.value; el.textContent = z ? _saTzLine(ionaTzTime(z)) : ''; }
registerAlarmSurface(_saStopTzClock);   // clear the interval on any alarm takeover
// Plan orb arc-count — the homepage price-card convention (arcs = contacts/day tier). Rendered as
// N <i> children of #sa-plan-badge (.sa-plan-orb) by _saRender. Beacon (reactive) = a single arc.
const SA_PLAN_ARCS = { 'Guardian Angel': 4, 'Guardian': 3, 'Protector': 2 };  // Beacon handled specially — pulsing rings, not arcs

let _saChannel = null;   // selected channel (PWA|SMS|Voice) or null — WhatsApp/unknown leaves it unchanged on save
let _saWired = false;
let _saWriting = false;

function _saNow() { return (currentMember && currentMember.customFields) || {}; }
function _saSet(id, v) { const el = document.getElementById(id); if (el) el.value = v || ''; }
function _saMarkDirty() { const b = document.getElementById('sa-save'); if (b) b.classList.add('is-dirty'); }
function _saClearDirty() { const b = document.getElementById('sa-save'); if (b) b.classList.remove('is-dirty'); }

// Account-tab inline accordions — "Account holder" (always) + "Who Iona is there for" (account-type
// 'other' only; its wrapper is display-toggled in _saRender). Each collapsed = nav row; tap shows/hides
// its .sa-* body WITHOUT destroying field state (an in-progress edit survives collapse+expand). The
// shared "Save account details" button shows whenever either accordion is open (both collapsed → hidden,
// so the rows read as a clean nav list). Save still writes holder names always + svcuser names only for
// 'other' (saveAccountDetails is unchanged).
const _SA_ACCS = ['sa-holder-acc', 'sa-svcuser-acc'];
function _saSyncSaveVisibility() {
  const save = document.getElementById('sa-save');
  if (!save) return;
  const anyOpen = _SA_ACCS.some(id => document.getElementById(id)?.classList.contains('is-open'));
  save.style.display = anyOpen ? '' : 'none';
}
function _saSetAcc(accId, open) {
  const acc = document.getElementById(accId);
  if (!acc) return;
  acc.classList.toggle('is-open', !!open);
  const head = acc.querySelector('.sa-acc-head');
  if (head) head.setAttribute('aria-expanded', open ? 'true' : 'false');
  _saSyncSaveVisibility();
}
function _saToggleAcc(accId) {
  const acc = document.getElementById(accId);
  _saSetAcc(accId, !(acc && acc.classList.contains('is-open')));
}

function _saPlanEntitlement(name) {
  if (name === BEACON_PLAN) return 'Reactive help — when you press for it';
  const p = SC_PLANS[name] || SC_PLANS[SC_DEFAULT_PLAN];
  const days = p.maxDays === 7 ? 'Every day' : (p.maxDays + ' days a week');
  return days + ' · up to ' + p.times + ' time' + (p.times === 1 ? '' : 's') + ' a day' + (_hasHandsFree ? ' · hands-free included' : '');
}

function _saRenderChannel() {
  const wrap = document.getElementById('sa-channel');
  if (!wrap) return;
  wrap.innerHTML = '';
  SA_CHANNELS.forEach(c => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sa-seg-btn' + (c.val === _saChannel ? ' is-on' : '');
    b.innerHTML = '<i class="ti ' + c.icon + '" aria-hidden="true"></i><span>' + c.label + '</span>';
    b.setAttribute('aria-label', c.label);
    b.addEventListener('click', () => { _saChannel = c.val; _svMarkDirty(); _saRenderChannel(); });
    wrap.appendChild(b);
  });
}

// Populate all cards from the cached member + plan state. Called when the Account tab is opened.
function _saRender() {
  _saWireOnce();
  const cf = _saNow();
  const planName = _servicePlanName || SC_DEFAULT_PLAN;
  const nameEl = document.getElementById('sa-plan-name');
  const subEl = document.getElementById('sa-plan-sub');
  const badgeEl = document.getElementById('sa-plan-badge');
  if (nameEl) nameEl.textContent = planName;
  if (subEl) subEl.textContent = _saPlanEntitlement(planName);
  if (badgeEl) {
    const isBeacon = (planName === BEACON_PLAN);
    badgeEl.classList.toggle('sa-plan-orb--beacon', isBeacon);   // Beacon = amber orb + pulsing amber rings, no arcs
    badgeEl.innerHTML = isBeacon ? '' : '<i></i>'.repeat(SA_PLAN_ARCS[planName] || 2);
  }
  _saSet('sa-first', cf['first-name']);
  _saSet('sa-last', cf['last-name']);
  _saSet('sa-email', cf['email'] || (currentMember && currentMember.auth && currentMember.auth.email) || '');
  const accountType = cf['account-type'] || 'self';   // mirror website: service-user card only for 'other'
  const suAcc = document.getElementById('sa-svcuser-acc');
  if (suAcc) suAcc.style.display = (accountType === 'other') ? '' : 'none';   // "Who Iona is there for" accordion only for 'other'
  _saSet('sa-su-first', cf['service-user-first-name']);
  _saSet('sa-su-last', cf['service-user-last-name']);
  _saSetAcc('sa-holder-acc', false);    // collapse both accordions on every Account-tab open (arbiter closes the sheet → reopen re-renders collapsed);
  _saSetAcc('sa-svcuser-acc', false);   // the second call also re-syncs Save visibility, after the svcuser display is set above
  _saClearDirty();
}

function _saWireOnce() {
  if (_saWired) return;
  ['sa-first', 'sa-last', 'sa-su-first', 'sa-su-last'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', _saMarkDirty);
  });
  const save = document.getElementById('sa-save');
  if (save) save.addEventListener('click', saveAccountDetails);
  const holderHead = document.getElementById('btn-account-holder');
  if (holderHead) holderHead.addEventListener('click', () => _saToggleAcc('sa-holder-acc'));
  const svcuserHead = document.getElementById('btn-svcuser');
  if (svcuserHead) svcuserHead.addEventListener('click', () => _saToggleAcc('sa-svcuser-acc'));
  _saWired = true;
}

async function saveAccountDetails() {
  if (_saWriting) return;
  const cf = _saNow();
  const first = (document.getElementById('sa-first')?.value || '').trim();
  const last = (document.getElementById('sa-last')?.value || '').trim();
  if (!first || !last) { _showCalmNote('Please add a first and last name.'); return; }
  const fields = { 'first-name': first, 'last-name': last };
  if ((cf['account-type'] || 'self') === 'other') {   // only write service-user-* for 'other' (self → leave alone, per website)
    fields['service-user-first-name'] = (document.getElementById('sa-su-first')?.value || '').trim();
    fields['service-user-last-name'] = (document.getElementById('sa-su-last')?.value || '').trim();
  }
  const prev = {};
  Object.keys(fields).forEach(k => { prev[k] = cf[k]; });
  _saWriting = true;
  try {
    if (currentMember) { currentMember.customFields = currentMember.customFields || {}; Object.assign(currentMember.customFields, fields); }
    let ok = false;
    if (ms && ms.updateMember) { try { await ms.updateMember({ customFields: fields }); cacheMemberOffline(currentMember); ok = true; } catch (e) { console.warn('[Account] write failed:', e); } }
    if (ok) { _saClearDirty(); _showCalmNote('Saved.'); }
    else { if (currentMember && currentMember.customFields) Object.assign(currentMember.customFields, prev); _saRender(); _showCalmNote('Couldn’t save just now — please try again.'); }
  } finally { _saWriting = false; }
}

/* ══════════════════════════════════════════════════════════════════════
   SERVICE DELIVERY (mirror steps 4/6) — full-screen editor, split out of the
   Account tab so the deep-link rows sit near the top (short scroll). Own screen
   + own Save, mirroring Contacts/Schedule. Writes number-for-service-delivery,
   [user-channel only if a segment is picked] + time-zone. Optimistic + in-flight
   guard; the number field reuses the Contacts flag chip verbatim; the shared
   channel + live tz clock (SA_CHANNELS / _saChannel / _sa*TzClock) now render here.
══════════════════════════════════════════════════════════════════════ */
let _svWired = false;
let _svWriting = false;
function _svMarkDirty() { const b = document.getElementById('sv-save'); if (b) b.classList.add('is-dirty'); }
function _svClearDirty() { const b = document.getElementById('sv-save'); if (b) b.classList.remove('is-dirty'); }

// Populate the service-delivery fields from the cached member. Called when the screen opens.
function _svRender() {
  const cf = _saNow();
  const sp = splitDial(cf['number-for-service-delivery'] || '');   // reuse Contacts helpers verbatim
  const prfxSel = document.getElementById('sa-prfx');
  if (prfxSel) { populatePrefix(prfxSel, sp.prfx); _cmSyncPrfxFlag(prfxSel); }
  _saSet('sa-num', sp.rest);
  const stored = cf['user-channel'] || '';
  _saChannel = SA_CHANNELS.some(c => c.val === stored) ? stored : null;   // WhatsApp/unknown → none selected
  _saRenderChannel();
  const tzSel = document.getElementById('sa-tz');
  if (tzSel) {
    ionaTzPopulate(tzSel, cf['time-zone'] || '');
    _saTzName = cf['service-user-first-name'] || cf['first-name'] || '';
    _saStartTzClock();
  }
  _svClearDirty();
}

function _svWireOnce() {
  if (_svWired) return;
  const num = document.getElementById('sa-num');
  if (num) num.addEventListener('input', _svMarkDirty);
  const tz = document.getElementById('sa-tz');
  if (tz) tz.addEventListener('change', () => { _svMarkDirty(); _saTzClockTick(); });
  const prfx = document.getElementById('sa-prfx');
  if (prfx) prfx.addEventListener('change', () => { _cmSyncPrfxFlag(prfx); _svMarkDirty(); });
  const save = document.getElementById('sv-save');
  if (save) save.addEventListener('click', saveServiceDelivery);
  _svWired = true;
}

function openServiceDeliveryScreen() {
  show('screen-service-delivery');
  if (!_svWired) {
    const backTop = document.getElementById('btn-service-back');
    if (backTop) backTop.addEventListener('click', _svExit);
    const backBottom = document.getElementById('btn-service-done');
    if (backBottom) backBottom.addEventListener('click', _svExit);
  }
  _svWireOnce();
  _svRender();
  const sc = document.querySelector('#screen-service-delivery .sc-scroll');
  if (sc) sc.scrollTop = 0;   // always start at the top
}

// Exit → back to the Settings sheet, Account pane (the row the member came from). Mirrors _cmExit;
// stops the live tz clock since the screen (and its clock element) is leaving view.
function _svExit() {
  _saStopTzClock();
  show('screen-today');
  const ov = document.getElementById('settings-overlay');
  if (ov) ov.classList.remove('hidden');
  if (typeof _activateSettingsTab === 'function') _activateSettingsTab('account');
}

async function saveServiceDelivery() {
  if (_svWriting) return;
  const cf = _saNow();
  const prfx = document.getElementById('sa-prfx')?.value || '+44';
  const digits = (document.getElementById('sa-num')?.value || '').replace(/\D/g, '').replace(/^0/, '');
  if (digits && digits.length < 9) { _showCalmNote('Please enter a valid phone number.'); return; }
  const fields = {};
  if (digits) fields['number-for-service-delivery'] = prfx + digits;
  if (_saChannel) fields['user-channel'] = _saChannel;   // only if picked — never clobber a WhatsApp member
  fields['time-zone'] = document.getElementById('sa-tz')?.value || 'Europe/London';
  const prev = {};
  Object.keys(fields).forEach(k => { prev[k] = cf[k]; });
  _svWriting = true;
  try {
    if (currentMember) { currentMember.customFields = currentMember.customFields || {}; Object.assign(currentMember.customFields, fields); }
    let ok = false;
    if (ms && ms.updateMember) { try { await ms.updateMember({ customFields: fields }); cacheMemberOffline(currentMember); ok = true; } catch (e) { console.warn('[ServiceDelivery] write failed:', e); } }
    if (ok) { _svClearDirty(); _showCalmNote('Saved.'); }
    else { if (currentMember && currentMember.customFields) Object.assign(currentMember.customFields, prev); _svRender(); _showCalmNote('Couldn’t save just now — please try again.'); }
  } finally { _svWriting = false; }
}

/* ══════════════════════════════════════════════════════════════════════
   SERVICE HISTORY / Logs (local-mirror step 5) — full-screen READ-ONLY history.
   Mirrors the website: same /eventlog endpoint + server-narrated {datetime,
   sentence} rows. Loop = fetch → render → cache. No Memberstack, no writes.
   Sentences rendered VERBATIM via textContent (server-narrated → member-safe;
   the app never invents or rewrites narrative).
══════════════════════════════════════════════════════════════════════ */
let _lgWired = false;
let _lgLoading = false;

function openLogsScreen() {
  show('screen-logs');
  if (!_lgWired) {
    const bt = document.getElementById('btn-logs-back'); if (bt) bt.addEventListener('click', _lgExit);
    const bb = document.getElementById('btn-logs-done'); if (bb) bb.addEventListener('click', _lgExit);
    const rf = document.getElementById('btn-logs-refresh'); if (rf) rf.addEventListener('click', () => _lgFetch(true));
    _lgWired = true;
  }
  _lgRenderCached();     // instant paint from the last successful fetch
  _lgFetch(false);       // then refresh from the network
  const sc = document.querySelector('#screen-logs .sc-scroll'); if (sc) sc.scrollTop = 0;
}

function _lgExit() {
  show('screen-today');
  const ov = document.getElementById('settings-overlay'); if (ov) ov.classList.remove('hidden');
  if (typeof _activateSettingsTab === 'function') _activateSettingsTab('account');
}

async function _lgRenderCached() {
  try { const raw = await getPreference('cached_logs'); if (raw) { const c = JSON.parse(raw); _lgRender(c.entries || [], c.at); } }
  catch (e) {}
}

async function _lgFetch(manual) {
  if (_lgLoading) return;
  const t1id = currentMember && currentMember.customFields && currentMember.customFields['airtable-id'];
  const list = document.getElementById('lg-list');
  const hasRows = () => !!(list && list.querySelector('.lg-row'));
  if (!t1id) { if (list && !hasRows()) list.innerHTML = '<p class="lg-empty">No service history yet.</p>'; return; }
  _lgLoading = true;
  if (list && !hasRows()) list.innerHTML = '<p class="lg-empty">Loading your service history…</p>';  // server narrates each row (LLM) — can take a few seconds
  const rf = document.getElementById('btn-logs-refresh'); if (rf) rf.classList.add('is-spinning');
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 30000);  // allow time for server-side narration (was 8s → aborted mid-response)
    const res = await fetch(`${STATUS_BASE}/eventlog?t1id=${encodeURIComponent(t1id)}`, {
      headers: { 'ngrok-skip-browser-warning': 'true' }, signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) throw new Error('http ' + res.status);
    const data = await res.json();
    const entries = data.entries || [];
    const at = Date.now();
    try { await setPreference('cached_logs', JSON.stringify({ entries, at })); } catch (e) {}
    _lgRender(entries, at);
  } catch (e) {
    if (list && !hasRows()) list.innerHTML = '<p class="lg-empty">Unable to load service history right now.</p>';  // never a silent blank
    else if (manual) _showCalmNote('Couldn’t update just now — showing your last history.');   // has a cached list → keep it
  } finally {
    _lgLoading = false;
    const rf2 = document.getElementById('btn-logs-refresh'); if (rf2) rf2.classList.remove('is-spinning');
  }
}

function _lgDayLabel(d) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((today - that) / 86400000);
  const dated = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  if (diff === 0) return 'Today — ' + dated;
  if (diff === 1) return 'Yesterday — ' + dated;
  return dated;
}

function _lgRender(entries, at) {
  const list = document.getElementById('lg-list');
  if (!list) return;
  const asof = document.getElementById('lg-asof');
  if (asof) asof.textContent = at ? ('Up to date as of ' + new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })) : '';
  if (!entries.length) { list.innerHTML = '<p class="lg-empty">No service history yet.</p>'; return; }
  list.innerHTML = '';
  let lastDay = null;
  entries.forEach(e => {
    const d = new Date(e.datetime);
    const valid = !isNaN(d.getTime());
    const dayKey = valid ? d.toDateString() : 'x';
    if (dayKey !== lastDay) {
      lastDay = dayKey;
      const h = document.createElement('div'); h.className = 'lg-day';
      h.textContent = valid ? _lgDayLabel(d) : 'Earlier';
      list.appendChild(h);
    }
    const row = document.createElement('div'); row.className = 'lg-row';
    const time = document.createElement('div'); time.className = 'lg-time';
    time.textContent = valid ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
    const sen = document.createElement('div'); sen.className = 'lg-sentence';
    sen.textContent = e.sentence || '';   // server-narrated, rendered VERBATIM (textContent — never innerHTML)
    row.appendChild(time); row.appendChild(sen);
    list.appendChild(row);
  });
}

// A calm, auto-dismissing note — only meaningful when the app is on screen (if it's closed the native
// log is the record). Non-alarming copy, vocabulary-clean.
function _showCalmNote(msg) {
  if (document.visibilityState !== 'visible') return;
  let n = document.getElementById('flic-calm-note');
  if (!n) {
    n = document.createElement('div');
    n.id = 'flic-calm-note';
    n.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:80px;z-index:2147483647;'
      + 'pointer-events:none;'  // a passive note must never intercept taps (belt-and-braces for stuck screens)
      + 'background:#11233A;color:#EAF4F4;border:1px solid rgba(52,236,217,.4);border-radius:12px;'
      + 'padding:12px 16px;font-size:14px;line-height:1.4;max-width:88%;text-align:center;'
      + 'box-shadow:0 6px 24px rgba(0,0,0,.4);transition:opacity .3s;';
    document.body.appendChild(n);
  }
  n.textContent = msg;
  n.style.opacity = '1';
  clearTimeout(n._t);
  n._t = setTimeout(() => { n.style.opacity = '0'; }, 6000);
}

// ─── Feature 005 (T013) — pairing flow wiring ───────────────────────────────────────────────
// Drives the T012 #pairing-overlay through the REAL FlicPlugin: intro → (scan + BLE/location
// perms) → searching → buttonFound → connecting → pairingComplete → ready, then the battery-opt
// exemption ("so Iona stays awake to hear your button"). Never a dead end — any failure returns
// to intro with a calm note. Registers its own scan listeners (separate from the summon listener
// in _initFlicListeners). Exposes window._openPairingFlow for the Settings entry + dev launcher.
function _wirePairingFlow() {
  const { Flic } = Capacitor.Plugins;
  const overlay = document.getElementById('pairing-overlay');
  if (!overlay) return;
  const steps = Array.from(overlay.querySelectorAll('.pairing-step'));
  const show = (name) => steps.forEach(s => s.classList.toggle('is-active', s.getAttribute('data-step') === name));
  const q = (sel, step) => overlay.querySelector('.pairing-step[data-step="' + step + '"] ' + sel);
  const devPanel = () => document.getElementById('flic-dev-panel');
  let _pairing = false;

  const openPairing = () => {
    show('intro');
    const so = document.getElementById('settings-overlay'); if (so) so.classList.add('hidden'); // full-screen over Settings
    const dp = devPanel(); if (dp) dp.style.display = 'none';                                     // clear the dev chip
    overlay.classList.remove('hidden');
  };
  const closePairing = () => {
    overlay.classList.add('hidden');
    const dp = devPanel(); if (dp) dp.style.display = '';
    if (_pairing && Flic && Flic.stopScan) { try { Flic.stopScan(); } catch (e) {} }
    _pairing = false;
  };
  window._openPairingFlow = openPairing;
  // CC 09-Jul: expose the close too, mirroring _openPairingFlow above. The back handler
  // (_initBackButton) needs it, and closePairing is a closure local to _wirePairingFlow — calling it
  // from module scope would ReferenceError. Exposing (not duplicating) keeps ONE close path with its
  // real cleanup (stops the Flic scan, resets _pairing). Flagged: repairs a scope gap in the build brief.
  window._closePairingFlow = closePairing;

  // Buttons: ✕ / "Not now" close (stop any scan); "Pair my button" begins; "Done" closes; Settings entry opens.
  const closeBtn = document.getElementById('btn-pairing-close'); if (closeBtn) closeBtn.onclick = closePairing;
  const notNow = q('.pairing-dismiss', 'intro'); if (notNow) notNow.onclick = closePairing;
  const pairBtn = q('.pairing-cta', 'intro'); if (pairBtn) pairBtn.onclick = _beginPairing;
  const doneBtn = q('.pairing-cta', 'ready'); if (doneBtn) doneBtn.onclick = closePairing;
  // Belt-and-braces: ANY tap on the 'ready' screen exits — the user must never be stuck on the
  // success card, whatever the state of the Done button or any transient overlay after pairing.
  const readyStep = overlay.querySelector('.pairing-step[data-step="ready"]');
  if (readyStep) readyStep.addEventListener('click', closePairing);
  // Entry point lives in the T017 status row (#button-status CTA) + the dev "Pair flow ▸" — both call window._openPairingFlow().

  async function _beginPairing() {
    if (_pairing) return;
    if (!Flic || !Flic.startScan) { _showCalmNote('Pairing isn’t available on this device.'); return; }
    _pairing = true;
    // Calm one-line pre-explanation, shown BEFORE the OS permission prompt (never a cold prompt).
    _showCalmNote('Iona needs Bluetooth and nearby-devices access to find your button.');
    show('searching');
    try {
      await Flic.startScan();               // requests perms if needed, then scans; events drive the rest
    } catch (e) {
      _pairing = false;
      show('intro');
      _showCalmNote('Iona needs Bluetooth and nearby-devices access to pair your button — allow it and try again.');
    }
  }

  if (Flic && Flic.addListener) {
    // Flic2 hold-to-discover IS the pairing gesture → discovery/connect maps to the confirm/connecting step.
    Flic.addListener('buttonFound', () => {
      if (!_pairing) return;
      show('confirm');
      const cs = q('.pairing-status span', 'confirm'); if (cs) cs.textContent = 'Connecting…';
    });
    Flic.addListener('pairingComplete', (e) => {
      if (!_pairing) return;
      _pairing = false;
      if (e && e.success) { show('ready'); _requestBatteryExemptionCalm(); }
      else { show('intro'); _showCalmNote('That didn’t connect. Hold the button down until its light blinks, then try again.'); }
    });
  }

  async function _requestBatteryExemptionCalm() {
    if (!Flic || !Flic.isIgnoringBatteryOptimizations) return;
    try {
      const r = await Flic.isIgnoringBatteryOptimizations();
      if (r && r.ignoring) return;          // already exempt — skip gracefully
      _showCalmNote('One more thing — so Iona stays awake to hear your button.');
      if (Flic.requestBatteryExemption) await Flic.requestBatteryExemption();
    } catch (e) { /* unsupported — skip gracefully */ }
  }
}

// ─── Feature 005 (T017) — connected-status row (the help button's proof-of-life surface) ─────
// A status SURFACE over existing FlicPlugin signals — no new native work; does NOT touch the
// summon path / press-time recovery / pairing logic. Two states: unpaired → Pair CTA (opens the
// T013 flow); paired → live connection (honest — "Connected" only when the button is READY now),
// "last confirmed working" (a confirmed connection OR a passed service test), optional battery,
// and Test / Remove actions. Never shows connected/working when it isn't (Constitution I.4).
const FLIC_CONN_READY = 3;   // Flic2Button.CONNECTION_STATE_CONNECTED_READY — usable right now
const FLIC_BATT_LOW_PCT = 25; // T031 — calm low-battery threshold; shared by the status row + the heads-up
let _battLowNotified = false;  // fire the heads-up + log once per low episode (reset by a fresh battery)

async function _flicLastConfirmed() {
  const s = await getPreference('flic_last_confirmed_working');
  return s ? parseInt(s, 10) : 0;
}
async function _markFlicConfirmed() { await setPreference('flic_last_confirmed_working', String(Date.now())); }

function _humanConfirmed(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  const t = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s/g, '').toLowerCase();
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const startThat = new Date(ts); startThat.setHours(0, 0, 0, 0);
  const days = Math.round((startToday - startThat) / 86400000);
  if (days <= 0) return 'today, ' + t;
  if (days === 1) return 'yesterday, ' + t;
  return days + ' days ago';
}

function _playConfirmChime() {
  try { const a = new Audio('iona_success_chime.mp3'); a.volume = 0.7; a.play().catch(() => {}); } catch (e) {}
}

async function _renderButtonStatus() {
  const el = document.getElementById('button-status');
  if (!el) return;
  const { Flic } = Capacitor.Plugins;
  let ps = { paired: false };
  if (window.__bsFake) ps = window.__bsFake;                                        // dev preview override
  else { try { if (Flic && Flic.getPairingState) ps = await Flic.getPairingState(); } catch (e) {} }

  if (!ps.paired) {                                                                 // State A — no button paired
    el.className = 'button-status';
    el.innerHTML =
      '<button type="button" class="settings-card account-card" id="bs-pair">'
      + '<span class="settings-card-tile"><i class="ti ti-bluetooth" aria-hidden="true"></i></span>'
      + '<span class="settings-card-label">Pair a help button</span>'
      + '<i class="ti ti-chevron-right settings-card-chevron" aria-hidden="true"></i></button>';
    const b = document.getElementById('bs-pair');
    if (b) b.onclick = () => { if (window._openPairingFlow) window._openPairingFlow(); };
    return;
  }

  const connected = ps.connectionState === FLIC_CONN_READY;                          // State B — paired
  const lastHuman = _humanConfirmed(await _flicLastConfirmed());
  let batt = null;
  if (window.__bsFakeBatt != null) batt = window.__bsFakeBatt;                    // dev sim override ("Sim low batt" row)
  else if (!window.__bsFake) { try { if (Flic && Flic.readBattery) { const r = await Flic.readBattery(); if (r && r.available) batt = r.percentage; } } catch (e) {} }
  const battLow = batt != null && batt <= FLIC_BATT_LOW_PCT;

  el.className = 'button-status button-status--paired';
  el.innerHTML =
    '<p class="method-eyebrow">Your help button</p>'
    + '<div class="bs-conn ' + (connected ? 'bs-conn--on' : 'bs-conn--off') + '">'
    +   '<span class="bs-dot"></span><span class="bs-conn-text">'
    +   (connected ? 'Connected' : 'Not connected right now') + '</span></div>'
    + (connected ? '' : '<p class="bs-hint">Make sure your button is nearby.</p>')
    + '<p class="bs-confirmed">'
    +   (lastHuman ? ('Last confirmed working: ' + lastHuman) : 'Not tested yet — tap Test service to confirm it’s working.')
    + '</p>'
    + (batt != null
        ? ('<p class="bs-batt ' + (battLow ? 'bs-batt--low' : '') + '">'
           + (battLow ? ('Battery getting low (' + batt + '%) — worth changing it soon') : ('Battery ' + batt + '%')) + '</p>')
        : '')
    + '<div class="bs-actions">'
    +   '<button type="button" class="bs-btn bs-btn--test" id="bs-test">Test service</button>'
    // Brief B v2 — device-driven voice test: places a REAL call so the member hears what a real call for
    // help sounds like. Deliberately shown on ALL plans (R4) — do NOT plan-gate this in _applyPlanGate.
    +   '<button type="button" class="bs-btn bs-btn--test" id="bs-test-call">Test my service call</button>'
    +   '<button type="button" class="bs-btn bs-btn--remove" id="bs-remove">Remove button</button>'
    + '</div>';
  const testBtn = document.getElementById('bs-test'); if (testBtn) testBtn.onclick = () => runServiceTest('in_app');
  const testCallBtn = document.getElementById('bs-test-call'); if (testCallBtn) testCallBtn.onclick = () => runServiceTestCall('in_app');
  const remBtn = document.getElementById('bs-remove'); if (remBtn) remBtn.onclick = _removeButton;
}

// T031 — low-battery heads-up. The status row (above) already shows the calm amber battery line whenever
// it renders; this adds the PROACTIVE half: on a batteryLevel emit crossing the low threshold, surface a
// gentle one-line nudge AND log a carer-visible "Button Battery Low" event — ONCE per low episode, not on
// every poll. Best-effort throughout: a failed note/log never blocks anything, the button still works.
// Never "failure"/alarm wording (FR-024) — a heads-up with time in hand, separate from summon/service-test.
async function _handleBatteryLevel(pct) {
  if (typeof pct === 'number' && !isNaN(pct)) {
    if (pct <= FLIC_BATT_LOW_PCT && !_battLowNotified) {
      _battLowNotified = true;                                   // once per low episode this session
      _showCalmNote('Your button’s battery is getting low — worth changing it soon.');
      _logButtonBatteryLow(pct);                                 // best-effort carer-visible record
    } else if (pct > FLIC_BATT_LOW_PCT + 5) {
      _battLowNotified = false;                                  // hysteresis — re-arm once a fresh battery is in
    }
  }
  await _renderButtonStatus();                                   // refresh the status-row battery line
}

// Best-effort log of the low-battery heads-up (EventLog "Button Battery Low" via the /button-battery-low
// leaf) so it is carer-visible, not just on-screen. Never blocks; any failure is swallowed.
async function _logButtonBatteryLow(pct) {
  try {
    const rec = await getPreference('member_airtable_id');
    if (!rec) return;
    fetch(`${STATUS_BASE}/button-battery-low`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({ recId: rec, percentage: pct }),
    }).catch(() => {});
  } catch (e) {}
}

const SERVICE_TEST_TIMEOUT_MS = 6000;   // a few seconds — tight for the person, room for a healthy round-trip
let _serviceTestDismissTimer = null;

// Shared service-test path (T029 in-app "Test service" + T025 double-tap) — ONE helper, two entry points.
// Hits /service-test ONLY: a leaf that logs + returns, sharing NO summon/escalation code (a test can NEVER
// dispatch help — the suppression wall). PASS → chime + "working" card + last-confirmed updates; NO RESPONSE
// → no chime + honest "couldn't confirm" card + a best-effort Service Test — No Response log (a dead chain
// is carer-visible, never silence — FR-028).
async function runServiceTest(source) {
  const btn = document.getElementById('bs-test');
  if (btn) { btn.disabled = true; btn.textContent = 'Testing…'; }
  const rec = await getPreference('member_airtable_id');
  if (!rec) { _showServiceTestResult(false); await _renderButtonStatus(); return; }
  let ok = false;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), SERVICE_TEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${STATUS_BASE}/service-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ recId: rec, source }),
        signal: ctrl.signal,
      });
      if (res.ok) { const d = await res.json().catch(() => ({})); ok = d && d.ok === true; }
    } finally { clearTimeout(to); }
  } catch (e) { ok = false; }
  if (ok) {
    await _markFlicConfirmed();
    _playConfirmChime();                 // chime ONLY on a confirmed pass — proves the WHOLE chain works
    _showServiceTestResult(true);
  } else {
    _showServiceTestResult(false);       // honest "couldn't confirm" — calm, never an alarm
    // best-effort: log the honest no-response so a dead chain is carer-visible (never silence)
    fetch(`${STATUS_BASE}/service-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({ recId: rec, source, outcome: 'no_response' }),
    }).catch(() => {});
  }
  await _renderButtonStatus();            // refresh last-confirmed + reset the button label
}

// Brief B v3 — BRIDGED voice Service Test. A full SHOWCASE: the member sees the same "calling your contacts"
// screen a real help-call shows (with "Iona" as the simulated contact — ringing, then connected) AND hears the
// stand-in reaching script over the SAME hands-free VoIP leg a real bridge uses (so it works on SIM-less wifi
// tablets), ending on a terminal card confirming the test worked. We place the member's VoIP leg DIRECTLY into
// a test-namespaced conference (svc-test-…) via connectOutbound — importing NONE of the summon side-effects (no
// bridgeAttempt, no /bridge/log-event). The visual is driven off the connect/disconnect events + a timed flip
// synced to the audio's "Connecting with Iona" beat. Never-silent: a token/connect failure re-POSTs
// outcome:"not_connected" so the server logs the one terminal even when no leg ever formed.
const SERVICE_TEST_CONNECT_FLIP_MS = 22000;   // ≈ when the audio reaches "Connecting with Iona" → flip Ringing→Connected
let _svcTestCall = { active: false, conferenceName: null, connected: false, reachedConnect: false, recId: null, source: null };
let _svcTestFlipTimer = null;
function _svcTestClearTimers() { if (_svcTestFlipTimer) { clearTimeout(_svcTestFlipTimer); _svcTestFlipTimer = null; } }
function _svcTestClear() { _svcTestClearTimers(); _svcTestCall = { active: false, conferenceName: null, connected: false, reachedConnect: false, recId: null, source: null }; }

// Never-silent failure leg — the app cannot write EventLog, so it asks the server to log the one Unanswered.
function _reportServiceTestNotConnected(conferenceName, recId, source) {
  fetch(`${STATUS_BASE}/service-test-call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
    body: JSON.stringify({ recId, source, conferenceName, outcome: 'not_connected' }),
  }).catch(() => {});
}

// Screen 1 — the "calling your contacts" showcase: reuses the SHARED calling screen with "Iona" as the single
// simulated contact (bridge vocab → "Ringing…"). Takes over the Today surface (closing the settings sheet).
function _showServiceTestCalling() {
  _alarmFlowActive = true;
  alarmSurfaceTakeover('service-test');           // close settings/overlays + land on screen-today
  hideOrb();
  document.getElementById('today-empty').classList.add('hidden');
  document.getElementById('today-thread').classList.add('hidden');
  document.getElementById('alarm-countdown-card').classList.add('hidden');
  document.getElementById('alarm-terminal-card').classList.add('hidden');
  document.getElementById('bridge-card').classList.add('hidden');
  renderCallingScreen({ method: 'bridge', label: 'Calling your contacts', contacts: [{ name: 'Iona', phone: '' }], activeIndex: 0 });
  ['btn-okay', 'btn-alert', 'btn-cancel', 'btn-alarm-done', 'btn-done'].forEach(id => {
    const e = document.getElementById(id); if (e) { e.classList.add('hidden'); e.classList.remove('btn--pulse'); }
  });
}

// Terminal — confirms the test outcome, reusing the shared alarm-terminal-card. Return to Iona + 60s auto-return.
function _showServiceTestTerminal(success) {
  _alarmFlowActive = true;
  show('screen-today');
  hideOrb();
  document.getElementById('today-empty').classList.add('hidden');
  document.getElementById('today-thread').classList.add('hidden');
  document.getElementById('alarm-countdown-card').classList.add('hidden');
  document.getElementById('alarm-escalation-card').classList.add('hidden');
  document.getElementById('bridge-card').classList.add('hidden');
  const _fn = (currentMember?.customFields?.['first-name'] || '').trim();
  if (success) {
    document.getElementById('alarm-terminal-title').textContent = _fn ? `All done, ${_fn}` : 'All done';
    document.getElementById('alarm-terminal-sub').textContent   = 'That’s exactly what happens when you press for help — everything’s working. Thank you for testing.';
  } else {
    document.getElementById('alarm-terminal-title').textContent = _fn ? `We couldn’t finish just now, ${_fn}` : 'We couldn’t finish just now';
    document.getElementById('alarm-terminal-sub').textContent   = 'Nothing was sent to your contacts. Please try again in a moment.';
  }
  _showTerminalCard();
  ['btn-okay', 'btn-alert', 'btn-cancel', 'btn-done'].forEach(id => {
    const e = document.getElementById(id); if (e) { e.classList.add('hidden'); e.classList.remove('btn--pulse'); }
  });
  document.getElementById('btn-alarm-done').classList.remove('hidden');   // Return to Iona only (no real summon from a test)
  _clearBridgeTerminalReturnTimer();
  _bridgeTerminalReturnTimer = setTimeout(showAlarmIdleReset, BRIDGE_TERMINAL_AUTORETURN_MS);
}

async function runServiceTestCall(source) {
  const rec = await getPreference('member_airtable_id');
  if (!rec) { _showServiceTestResult(false); return; }
  const conferenceName = `svc-test-${rec}-${Date.now()}`;
  // 1. Guard gate — refuse if a real escalation is live; else the server stashes source and returns ok.
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), SERVICE_TEST_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(`${STATUS_BASE}/service-test-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ recId: rec, source, conferenceName }),
        signal: ctrl.signal,
      });
    } finally { clearTimeout(to); }
    if (res.status === 409) { _showCalmNote('A call for help is in progress. Try again afterwards.'); return; }
    if (!res.ok) { _showServiceTestResult(false); return; }
  } catch (e) { _showServiceTestResult(false); return; }
  // 2. Take over the screen with the showcase calling screen, then place the VoIP member leg DIRECTLY into the
  //    test conference — reuse connectOutbound (the live member-leg call site); NO summon flow, so zero _bridge_*
  //    / /bridge/log-event footprint. connected/disconnected events drive ringing → connected → terminal.
  _svcTestCall = { active: true, conferenceName, connected: false, reachedConnect: false, recId: rec, source };
  _showServiceTestCalling();
  try {
    const tRes = await fetch(`${STATUS_BASE}/twilio/voice-token?identity=${encodeURIComponent(rec)}`, { headers: { 'ngrok-skip-browser-warning': 'true' } });
    if (!tRes.ok) throw new Error(`voice-token HTTP ${tRes.status}`);
    const tData = await tRes.json();
    const accessToken = tData.token ?? tData.value;
    const { TwilioVoice } = Capacitor.Plugins;
    await TwilioVoice.connectOutbound({ accessToken, conferenceName, endOnExit: 'false', bridge: 'true' });
    // The rest is event-driven: 'connected' → schedule the Ringing→Connected flip; 'disconnected' → terminal.
  } catch (e) {
    console.error('[ServiceTestCall] connect failed:', e);
    _reportServiceTestNotConnected(conferenceName, rec, source);   // never-silent
    _svcTestClear();
    _showServiceTestTerminal(false);
  }
}

// The "working" / "couldn't confirm" confirmation = the mockup's 5th state, reusing the T012 pairing-overlay
// test-working / test-failed cards. Auto-dismisses after a few seconds; ✕ also closes (wired in _wirePairingFlow).
function _showServiceTestResult(passed) {
  const overlay = document.getElementById('pairing-overlay');
  if (!overlay) return;
  const name = passed ? 'test-working' : 'test-failed';
  overlay.querySelectorAll('.pairing-step').forEach(s => s.classList.toggle('is-active', s.getAttribute('data-step') === name));
  const dp = document.getElementById('flic-dev-panel'); if (dp) dp.style.display = 'none';
  const so = document.getElementById('settings-overlay'); if (so) so.classList.add('hidden');
  overlay.classList.remove('hidden');
  clearTimeout(_serviceTestDismissTimer);
  _serviceTestDismissTimer = setTimeout(() => {
    overlay.classList.add('hidden');
    const d = document.getElementById('flic-dev-panel'); if (d) d.style.display = '';
  }, 5000);
}

let _bsRemoveArmed = false;
async function _removeButton() {
  const btn = document.getElementById('bs-remove');
  if (!_bsRemoveArmed) {                                                            // two-tap confirm (recoverable act)
    _bsRemoveArmed = true;
    if (btn) btn.textContent = 'Tap again to remove';
    setTimeout(() => { _bsRemoveArmed = false; const b = document.getElementById('bs-remove'); if (b) b.textContent = 'Remove button'; }, 4000);
    return;
  }
  _bsRemoveArmed = false;
  const { Flic } = Capacitor.Plugins;
  try { if (Flic && Flic.removeButton) await Flic.removeButton({}); } catch (e) {}
  await setPreference('flic_last_confirmed_working', '');   // clear proof-of-life once the button is gone
  window.__bsFake = null;
  _showCalmNote('Your button has been removed.');
  await _renderButtonStatus();
}

// Feature 005 (T019) — summon-gesture chooser (Service tab). Reflects + writes the native gesture, which
// FlicPlugin persists to device-protected SharedPreferences (survives reboot — FR-005a). Reuses the
// feature-004 method-* picker markup/behaviour exactly. Shown only when a button is paired. Optimistic
// like the reactive-method picker: move the radio instantly, reconcile to the plugin's echoed value, and
// quiet-revert if the plugin call fails — choosing how you press for help must never feel broken.
let _summonGesture = 'short';   // reflected from the plugin; single-press is the default

async function _renderGestureChooser() {
  const card = document.getElementById('gesture-card');
  if (!card) return;
  const { Flic } = Capacitor.Plugins;
  let ps = { paired: false, summonGesture: 'short' };
  try { if (Flic && Flic.getPairingState) ps = await Flic.getPairingState(); } catch (e) {}
  if (!ps.paired) { card.hidden = true; return; }   // gesture only matters once a button is paired
  _summonGesture = ps.summonGesture === 'hold' ? 'hold' : 'short';
  _applyGestureSelection();
  card.hidden = false;
}

function _applyGestureSelection() {
  const single = _summonGesture !== 'hold';
  const sRow   = document.getElementById('gesture-row-single');
  const hRow   = document.getElementById('gesture-row-hold');
  const sRadio = document.getElementById('gesture-single-radio');
  const hRadio = document.getElementById('gesture-hold-radio');
  if (!sRow || !hRow) return;
  sRow.classList.toggle('method-row--selected', single);
  sRadio.classList.toggle('method-radio--on', single);
  sRow.setAttribute('aria-checked', single ? 'true' : 'false');
  hRow.classList.toggle('method-row--selected', !single);
  hRadio.classList.toggle('method-radio--on', !single);
  hRow.setAttribute('aria-checked', !single ? 'true' : 'false');
}

async function _setSummonGestureChoice(gesture) {
  const g = gesture === 'hold' ? 'hold' : 'short';
  if (g === _summonGesture) return;                  // already selected — no write, no flash
  const prev = _summonGesture;
  _summonGesture = g;                                 // OPTIMISTIC — move the radio now (0ms perceived)
  _applyGestureSelection();
  const { Flic } = Capacitor.Plugins;
  try {
    if (Flic && Flic.setSummonGesture) {
      const r = await Flic.setSummonGesture({ gesture: g });   // persists natively (device-protected prefs)
      if (r && (r.summonGesture === 'short' || r.summonGesture === 'hold') && r.summonGesture !== _summonGesture) {
        _summonGesture = r.summonGesture; _applyGestureSelection();   // reconcile to the plugin's truth
      }
      return;
    }
  } catch (e) { console.warn('[Gesture] set failed:', e); }
  _summonGesture = prev; _applyGestureSelection();    // plugin unavailable/threw → quiet revert
}

// Stale-screen reconcile on RESUME (08 Jul, Option A — bias-to-KEEP). The cold-launch reconcile covers
// a killed app; this covers a backgrounded-alive app that missed the escalation-complete FCM. On
// foreground, if the local flag still says 'active', ask the single liveness authority — but clear the
// "calling your contacts" screen ONLY on a CONFIRMED resolution (live:false). On any uncertainty the
// screen is KEPT: on resume it is process-owned, so a genuinely-live escalation must never vanish on a
// network wobble (a member would think help was called off). Non-latching — complete-FCM / terminal-card
// / self-heal remain the primary clears, and this re-runs each foreground so a recovered network converges.
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  if (await getPreference('escalation_state') !== 'active') return;
  if (await _escalationConfirmedResolved()) {
    await setPreference('escalation_state', 'idle');
    showAlarmIdleReset();
  }
});

function _initButtonStatus() {
  const { Flic } = Capacitor.Plugins;
  _renderButtonStatus();
  _renderGestureChooser();   // T019 — reflect the current summon gesture
  if (Flic && Flic.addListener) {
    // A confirmed live connection ("ready") IS a proof-of-life event → stamp last-confirmed + re-render.
    Flic.addListener('connectionChanged', async (e) => { if (e && e.state === 'ready') await _markFlicConfirmed(); await _renderButtonStatus(); _renderGestureChooser(); });
    Flic.addListener('pairingComplete', async (e) => { if (e && e.success) await _markFlicConfirmed(); await _renderButtonStatus(); _renderGestureChooser(); });
    Flic.addListener('batteryLevel', (e) => _handleBatteryLevel(e && e.percentage));
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { _renderButtonStatus(); _renderGestureChooser(); } });

  // T019 — wire the gesture chooser rows ONCE (optimistic write to the persisted native gesture).
  const gsRow = document.getElementById('gesture-row-single');
  const ghRow = document.getElementById('gesture-row-hold');
  if (gsRow) {
    const pick = () => _setSummonGestureChoice('short');
    gsRow.addEventListener('click', pick);
    gsRow.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  }
  if (ghRow) {
    const pick = () => _setSummonGestureChoice('hold');
    ghRow.addEventListener('click', pick);
    ghRow.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  }
}

// ─── TEMPORARY DEV — Flic pairing/status harness (feature 005 Safety-MVP, T010/T011) ───
// A dev-only on-phone control so the button can be paired + exercised WITHOUT the real
// pairing UI (Phase 3, T012–T014). Self-contained — delete this whole function + its call
// when the real pairing flow lands. NOT shippable.
function _initFlicDevPanel() {
  const { Flic } = Capacitor.Plugins;
  if (!Flic || document.getElementById('flic-dev-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'flic-dev-panel';
  panel.style.cssText = 'position:fixed;left:8px;top:96px;z-index:99999;background:#11233A;'
    + 'border:1px solid #34ECD9;border-radius:10px;padding:8px;font:12px/1.3 monospace;'
    + 'color:#EAF4F4;max-width:190px;max-height:calc(100vh - 120px);overflow-y:auto;opacity:.96;';
  panel.innerHTML =
    '<style>#flic-dev-panel button{background:#0C6A61;color:#EAF4F4;border:none;'
    + 'border-radius:6px;padding:6px 8px;font:11px monospace;margin:2px;}</style>'
    + '<div id="fd-toggle" style="color:#34ECD9;font-weight:bold;margin-bottom:4px;cursor:pointer;">⚙ FLIC DEV ▾</div>'
    + '<div id="fd-body">'
    + '<div style="border-bottom:1px solid #34ECD9;margin-bottom:4px;padding-bottom:4px;">'
    + '<div style="color:#34ECD9;font-size:10px;margin-bottom:2px;">pairing flow (T012/T013)</div>'
    + '<button id="fd-pairing">Pair flow ▸</button>'
    + '<button id="fd-bstatus">Status B</button>'
    + '<button id="fd-incall">In-call</button></div>'
    + '<div><button id="fd-pair">Pair</button><button id="fd-status">Status</button>'
    + '<button id="fd-gesture">Gesture: short</button><button id="fd-remove">Remove</button></div>'
    + '<div style="border-top:1px solid #34ECD9;margin-top:4px;padding-top:4px;">'
    + '<div style="color:#34ECD9;font-size:10px;margin-bottom:2px;">press-time recovery (005)</div>'
    + '<button id="fd-fakestuck">Fake stuck</button><button id="fd-fakelive">Fake live</button>'
    + '<button id="fd-simpress">Sim press</button>'
    + '<button id="fd-simbatt">Sim low batt</button></div>'
    + '<div id="fd-log" style="margin-top:6px;max-height:130px;overflow:auto;'
    + 'white-space:pre-wrap;color:#A8C0C6;"></div>'
    + '</div>';
  document.body.appendChild(panel);

  // Collapsible so the panel doesn't cover the app UI (settings tab etc.). Starts COLLAPSED —
  // tap the "⚙ DEV ▸" chip to expand; tap again to tuck it away. (Temporary — goes at Phase 3.)
  const _fdToggle = document.getElementById('fd-toggle');
  const _fdBody = document.getElementById('fd-body');
  let _fdOpen = false;
  const _fdApply = () => {
    _fdBody.style.display = _fdOpen ? '' : 'none';
    _fdToggle.textContent = _fdOpen ? '⚙ FLIC DEV ▾' : '⚙ DEV ▸';
  };
  _fdToggle.onclick = () => { _fdOpen = !_fdOpen; _fdApply(); };
  _fdApply();  // collapsed by default

  const log = (m) => {
    const el = document.getElementById('fd-log');
    el.textContent = '[' + new Date().toLocaleTimeString() + '] ' + m + '\n' + el.textContent;
  };

  // Live events for the tester to watch (buttonSummon also runs the real help sequence above).
  Flic.addListener('buttonFound', e => log('found: ' + (e.state || '') + ' ' + (e.uuid || e.bdAddr || '')));
  Flic.addListener('pairingComplete', e => log(e.success ? ('PAIRED ' + (e.button && e.button.uuid || '')) : ('pair FAILED: ' + (e.error || e.result))));
  Flic.addListener('connectionChanged', e => log('conn: ' + e.state));
  Flic.addListener('buttonSelfTest', () => log('SELF-TEST (double-tap)'));
  Flic.addListener('batteryLevel', e => log('battery: ' + e.percentage + '%'));
  Flic.addListener('buttonSummon', e => log('SUMMON (' + e.gesture + ')'));

  document.getElementById('fd-pair').onclick = async () => {
    log('scanning… press+HOLD the button');
    try { await Flic.startScan(); } catch (e) { log('scan err: ' + (e.message || e)); }
  };
  document.getElementById('fd-status').onclick = async () => {
    try {
      const s = await Flic.getPairingState();
      const b = await Flic.getButtons();
      log('paired=' + s.paired + ' conn=' + s.connectionState + ' gesture=' + s.summonGesture + ' n=' + ((b.buttons || []).length));
    } catch (e) { log('status err: ' + (e.message || e)); }
  };
  let gesture = 'short';   // matches the new native default (single-press, telecare-familiar)
  document.getElementById('fd-gesture').onclick = async () => {
    gesture = gesture === 'hold' ? 'short' : 'hold';
    try { await Flic.setSummonGesture({ gesture }); } catch (e) {}
    document.getElementById('fd-gesture').textContent = 'Gesture: ' + gesture;
    log('summon gesture → ' + gesture + (gesture === 'short' ? ' (every press summons)' : ' (hold summons; double-tap = self-test)'));
  };
  document.getElementById('fd-remove').onclick = async () => {
    try { await Flic.removeButton({}); log('removed'); } catch (e) { log('remove err: ' + (e.message || e)); }
  };

  // feature 005 press-time-recovery test rig (TEMPORARY — remove with this dev panel at Phase 3). Lets the
  // three acceptance behaviours be proven at the Pixel in a couple of taps, with the webhook up so the
  // /pwa-escalation-live read is live. NOTE: a cancel window appearing = "the press summoned" (PASS) — tap
  // CANCEL to avoid committing a REAL escalation. device_dial_active/escalation_state artifacts self-clear
  // on relaunch (cold-init). Requires a paired button only for a real physical press; Sim press does not.
  document.getElementById('fd-fakestuck').onclick = async () => {
    await removePreference('device_dial_active');
    await setPreference('escalation_state', 'active');
    await setPreference('escalation_state_ts', String(Date.now()));   // RECENT ts → forces the backend liveness read (the young-stuck path that needs the backend)
    showEscalationActiveState();
    log('FAKE young-stuck: active + ts=now, NO backend escalation. Physical press (or Sim press) → should SUMMON (cancel window). B1.');
  };
  document.getElementById('fd-fakelive').onclick = async () => {
    await setPreference('escalation_state', 'active');
    await setPreference('escalation_state_ts', String(Date.now()));
    await setPreference('device_dial_active', 'true');   // local "genuinely live" signal → confirmed live → should ABSORB
    showEscalationActiveState();
    log('FAKE live (device-dial): active + device_dial_active. Physical press (or Sim press) → should ABSORB (no cancel window). B3.');
  };
  document.getElementById('fd-simpress').onclick = () => {
    log('sim press → _startHelpSequence (tap fast ×N from idle for the B2 flurry → one cancel window)');
    _startHelpSequence('physical_button');
  };
  document.getElementById('fd-simbatt').onclick = () => {
    window.__bsFakeBatt = 18;              // fake a low level so the amber status line shows too (dev override)
    _battLowNotified = false;              // re-arm so a repeat tap always re-fires the note + log
    log('sim low batt 18% → calm heads-up + amber status line + Button Battery Low log (T031). Watch webhook.log [BATTERY-LOW]. Reload to clear the fake.');
    _handleBatteryLevel(18);
  };

  // TEMPORARY — T012 pairing UI on-device preview (remove with this dev panel at Phase 3).
  // Opens the INERT pairing overlay and steps through its 6 states on each tap; the overlay ✕
  // closes it. Pure visual review — no BLE, no wiring (that's T013). The dev panel (z 99999)
  // sits above the overlay (z 60), so Pairing ▸ and ✕ stay tappable while it's open.
  // T013 — the dev "Pair flow ▸" launches the REAL pairing flow (scan + BLE/location perms +
  // battery-opt), owned by _wirePairingFlow(). The inert 6-state design preview was retired once
  // the real flow landed — the pairing states are exercised live now (button-test states = T025).
  document.getElementById('fd-pairing').onclick = () => {
    if (window._openPairingFlow) { log('launching real pairing flow (scan)…'); window._openPairingFlow(); }
    else log('pairing flow not wired');
  };
  // T017 — preview the paired status row (State B) on-device without a physical button:
  // cycles unpaired(real) → paired·connected → paired·not-connected. Open Settings → Service to view.
  let _bsFakeIdx = 0;
  document.getElementById('fd-bstatus').onclick = () => {
    _bsFakeIdx = (_bsFakeIdx + 1) % 3;
    window.__bsFake = _bsFakeIdx === 1 ? { paired: true, connectionState: 3 }
                    : _bsFakeIdx === 2 ? { paired: true, connectionState: 0 } : null;
    _renderButtonStatus();
    log('status B: ' + (_bsFakeIdx === 1 ? 'paired·connected' : _bsFakeIdx === 2 ? 'paired·not-connected' : 'unpaired(real)') + ' — open Settings → Service');
  };
  // DIAG — force the bridge in-call screen (orb + voice-eq) WITHOUT a real call, to test whether
  // the orb-voice actually paints. If it shows here, rendering is fine → the real-call issue is
  // foreground/backgrounding. Relaunch to clear.
  const _incall = document.getElementById('fd-incall');
  if (_incall) _incall.onclick = () => {
    try { showBridgeInCallState(); log('forced in-call — orb-voice should be showing'); }
    catch (e) { log('in-call err: ' + (e.message || e)); }
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   SYSTEM BACK (Android edge-swipe / back button)          Feature: back-gesture
   ──────────────────────────────────────────────────────────────────────────
   Capacitor 8.4.0's BridgeActivity has NO back handling (verified: no
   onBackPressed, no OnBackPressedCallback, no canGoBack). With no listener the
   Activity simply finishes → the app backgrounds. Registering this listener means
   back does NOTHING unless we act. Absorbing a press is therefore the default, and
   the alarm path is safe by construction.

   Navigation state is READ FROM THE DOM — there is no back stack. The alarm
   arbiter closes surfaces by hiding elements, so the DOM is already the single
   source of truth and cannot go stale. Do not introduce a stack.

   Order is innermost-first: pairing dialog → mirror screen → settings overlay →
   Today. Exits are NOT no-ops when their screen is already closed (they un-hide
   the settings sheet), so we call ONLY the exit for the screen that is visible.
   ══════════════════════════════════════════════════════════════════════════ */

// The four mirror screens, each with the exit that already exists. Order irrelevant —
// at most one is ever visible. A future mirror screen adds one line here.
const _BACK_SCREENS = [
  { id: 'screen-contacts',         exit: () => _cmExit() },
  { id: 'screen-schedule',         exit: () => _scExit() },
  { id: 'screen-service-delivery', exit: () => _svExit() },
  { id: 'screen-logs',             exit: () => _lgExit() },
  { id: 'screen-cancel-window',    exit: () => _cwExit() },   // Feature 010 — back/swipe parity with the others
];

function _isVisible(id) {
  const el = document.getElementById(id);
  return !!el && !el.classList.contains('hidden');
}

// True while an alarm OWNS the screen and back must be swallowed whole.
// Deliberately NOT gated on _alarmFlowActive alone: that flag is true on TERMINALS
// too, and gating on it would trap the member on a terminal with a dead back gesture
// — the exact mistake Fix 3 (2026-07-02) had to undo in the I-NEED-HELP retry path.
async function _alarmOwnsScreen() {
  if (_summonCountdownActive) return true;                 // cancel window
  if (_deviceDial != null) return true;                    // device-dial calling
  if (bridgeAttempt && ['dialing', 'summoning', 'in_call']
        .includes(bridgeAttempt.state)) return true;       // live bridge
  try {
    if ((await getPreference('escalation_state')) === 'active') return true;
  } catch (e) { return true; }   // unreadable state → assume live. Never background mid-alarm.
  return false;
}

function _initBackButton() {
  const { App } = Capacitor.Plugins;
  if (!App || _initBackButton._bound) return;
  _initBackButton._bound = true;

  App.addListener('backButton', async () => {
    // 1 — pairing dialog (index.html:588, role="dialog") sits above everything.
    // closePairing is a closure local to _wirePairingFlow (stops the Flic scan + resets _pairing);
    // call it via the window handle it exposes (CC 09-Jul — repairs a module-scope gap in the brief).
    // openPairing() went full-screen and HID the settings sheet, so closing pairing alone would drop to
    // Today; re-show Settings so back returns to where the flow was launched from (owner feedback 09-Jul).
    if (_isVisible('pairing-overlay')) {
      if (window._closePairingFlow) window._closePairingFlow();
      document.getElementById('settings-overlay').classList.remove('hidden');   // back to Settings, not Today
      _backTone();
      return;
    }

    // 2 — a mirror full-screen. Call ONLY the visible one's exit (§5.3: exits are
    //     not no-ops when their screen is already closed).
    for (const s of _BACK_SCREENS) {
      if (_isVisible(s.id)) { s.exit(); _backTone(); return; }
    }

    // 3 — the settings overlay itself. Same close the ✕ runs.
    if (_isVisible('settings-overlay')) { _closeSettings(); _backTone(); return; }

    // 4 — Today. An alarm may own it.
    if (await _alarmOwnsScreen()) return;   // absorbed. Silent. No sound, no exit.

    if (_alarmFlowActive) {
      // A terminal: alarm flow finished, card still up. Back = "Return to Iona".
      // Same function the RETURN TO IONA button calls — full re-arm.
      showAlarmIdleReset();
      return;                                // no tone: this is an alarm surface
    }

    // 5 — resting Today. Background the app. NEVER exitApp() — the process must live.
    App.minimizeApp();
  });
}

// Back is a navigation, so it speaks with the nav voice — but only on a real
// navigation, never on an absorbed press or a minimise.
function _backTone() {
  if (window.Feedback) window.Feedback.nav();
}

window.addEventListener('load', async () => {
  const { SplashScreen } = Capacitor.Plugins;
  try {
    await applyAppearanceOnLaunch();  // feature 003 — before first paint
    await initMemberstack();
    initSignIn();
    initLogout();
    initPushListeners();
    initTodayDate();
    initTodayActions();
    initSettings();
    _initBackButton();   // system back (Android edge-swipe) — @capacitor/app backButton listener
    initServiceState();
    _initBridgeListeners();
    _initDeviceDialListeners();
    _initFlicListeners();
    _wirePairingFlow();   // feature 005 T013 — real pairing flow wiring (scan/perms/battery-opt)
    _initButtonStatus();  // feature 005 T017 — connected-status row (proof-of-life surface)
    if ((await getPreference('dev_mode')) === 'true') _initFlicDevPanel();  // DEV panel hidden behind dev_mode (default off → invisible to members; T021 deferred). 7-tap the Service tab to toggle.
    try {
      const { ZeroCall } = Capacitor.Plugins;
      if (ZeroCall) { const _t = await ZeroCall.hasTelephony(); _hasTelephony = !!_t?.hasTelephony; }
    } catch (e) { /* default _hasTelephony = true */ }
    // Foreground refresh of the device-dial cache (no @capacitor/app — visibilitychange covers it).
    // Also re-resolve the plan on foreground so a non-Beacon member who launched offline reliably
    // gets OKAY revealed once back online (the plan gate runs inside readAndApplyServiceState).
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        refreshDeviceDialCache({ throttleMs: 60000 });
        refreshSignalAudioCache({ throttleMs: 60000 });  // feature 006 — Signal clip cache top-up
        readAndApplyServiceState();
        // Feature 005 — re-attach + reconnect the paired button on foreground so a press never
        // silently stops firing after the app was backgrounded (reconnect-on-launch, native).
        const { Flic } = Capacitor.Plugins;
        if (Flic) Flic.reconnect().catch(() => {});
        _consumeFlicLaunchSummon();  // resumed via the summon full-screen intent (app was alive but hidden)
        _consumeEscalationAlarm();   // Bug A — resumed via the escalation-alarm full-screen intent
      }
    });
    await checkSession();
    try { await SplashScreen.hide({ fadeOutDuration: 500 }); } catch(e) {}
  } catch (err) {
    console.error('[App] Init failed:', err);
  }
});
