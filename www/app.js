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
  return `
    <div class="bout-row">
      <div class="bout">
        <div class="bout-txt">${text}</div>
        <div class="bout-time">${timeStr}</div>
      </div>
    </div>`;
}

// --- Section 2b: Audio (alarm siren, voice message, pulse tone) ---

let escalationCountdownTimer = null;
let escalationCountdownValue = 0;
let _audioCtx = null;

const ALARM_SIREN_LOW_FREQ = 400;
const ALARM_SIREN_HIGH_FREQ = 900;
const ALARM_SIREN_DURATION = 5.0;
const ALARM_SIREN_CYCLES = 3;
const ALARM_SIREN_TYPE = 'sine';
const ALARM_PULSE_FREQ = 660;
const ALARM_PULSE_DURATION = 80;
const ALARM_ESCALATION_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes

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

function playVoiceMessage() {
  // v2 — replace with: new Audio('https://static.iona.today/audio/alert-message.mp3').play()
  // using a pre-recorded Amy Neural file. Also make "10 seconds" dynamic based on configured cancel window.
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
      "This is Iona. You have pressed the HELP button. If you do not cancel within 10 seconds, we will attempt to call your contacts to let them know you are in need of assistance."
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

async function initMemberstack() {
  const TIMEOUT_MS = 8000;
  const INTERVAL_MS = 200;
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (window.$memberstackDom) {
      ms = window.$memberstackDom;
      break;
    }
    await new Promise(r => setTimeout(r, INTERVAL_MS));
  }

  if (!ms) {
    show('screen-check');
    setMsg('msg-check', 'Something went wrong loading. Please reload and try again.');
    throw new Error('[Init] $memberstackDom not available after 8s');
  }

  const result = await ms.getCurrentMember();
  currentMember = result?.data?.member ?? result?.data ?? null;
  if (currentMember) {
    memberConfig = buildMemberConfig(currentMember);
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
  memberConfig = buildMemberConfig(currentMember);

  await setupPush();
  show('screen-today');
  const savedEscState = await getPreference('escalation_state');
  if (savedEscState === 'active') {
    showEscalationActiveState();
  } else if (savedEscState === 'terminal') {
    showTerminalState();
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
  memberConfig = buildMemberConfig(member);

  await setupPush();
  show('screen-today');
  const savedEscState = await getPreference('escalation_state');
  if (savedEscState === 'active') {
    showEscalationActiveState();
  } else if (savedEscState === 'terminal') {
    showTerminalState();
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
  document.getElementById('btn-logout').addEventListener('click', async () => {
    try {
      await ms.logout();
    } catch (err) {
      console.error('[Logout] ms.logout() failed:', err);
    }
    await removePreference('fcm_token');
    await removePreference('member_airtable_id');
    await removePreference('escalation_state');
    currentMember = null;
    memberConfig  = null;
    show('screen-login');
  });
}

// --- Section 4: Push registration (FCM listeners, register, backend POST) ---

let pushRegistrationPending = false;

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
    } else if (type === 'escalation_complete') {
      handleEscalationComplete();
    }
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const type = action.notification?.data?.type;
    if (type === 'scheduled_contact' || type === 'reminder_1' || type === 'reminder_2') {
      showTodayMessage(action.notification?.body ?? action.notification?.notification?.body ?? null, action.notification?.data);
    } else if (type === 'escalation_complete') {
      handleEscalationComplete();
    } else {
      show('screen-today');
    }
  });
}

async function registerTokenWithBackend(token, airtableId) {
  try {
    const res = await fetch('https://ferris-causing-shed.ngrok-free.dev/register-token', {
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
}

// --- Section 5: Alarm (constants, tone, countdown, cancel, commit, terminal) ---

const ALARM_CANCEL_WINDOW_SECONDS = 10;

function getCancelWindowSeconds(config) {
  return config?.alarmCancelWindow ?? ALARM_CANCEL_WINDOW_SECONDS;
}

function showCancelWindowState() {
  hideOrb();
  document.getElementById('today-empty').classList.add('hidden');
  document.getElementById('today-thread').classList.add('hidden');
  document.getElementById('alarm-escalation-card').classList.add('hidden');
  document.getElementById('alarm-terminal-card').classList.add('hidden');
  document.getElementById('alarm-countdown-num').textContent = escalationCountdownValue;
  document.getElementById('alarm-countdown-card').classList.remove('hidden');
  document.getElementById('btn-okay').classList.add('hidden');
  document.getElementById('btn-alert').classList.add('hidden');
  document.getElementById('btn-cancel').classList.remove('hidden');
  document.getElementById('btn-alarm-done').classList.add('hidden');
}

function showEscalationActiveState() {
  show('screen-today');
  hideOrb();
  document.getElementById('today-empty').classList.add('hidden');
  document.getElementById('today-thread').classList.add('hidden');
  document.getElementById('alarm-countdown-card').classList.add('hidden');
  document.getElementById('alarm-terminal-card').classList.add('hidden');
  document.getElementById('alarm-escalation-card').classList.remove('hidden');
  // v2 — real-time contact status per attempt via FCM updates; v1 shows all as Waiting
  const list = document.getElementById('alarm-contacts-list');
  list.innerHTML = '';
  const contactFields = [
    'contact-one-first-name', 'contact-two-first-name', 'contact-three-first-name',
    'contact-four-first-name', 'contact-five-first-name', 'contact-six-first-name',
  ];
  const contacts = contactFields.map(f => currentMember?.customFields?.[f]).filter(Boolean);
  contacts.forEach(name => {
    const row = document.createElement('div');
    row.className = 'alarm-contact-row';
    row.innerHTML = `
      <div class="alarm-dot alarm-dot--waiting"></div>
      <div class="alarm-contact-name">${name}</div>
      <div class="alarm-contact-status">Waiting</div>`;
    list.appendChild(row);
  });
  document.getElementById('btn-okay').classList.add('hidden');
  document.getElementById('btn-alert').classList.add('hidden');
  document.getElementById('btn-cancel').classList.add('hidden');
  document.getElementById('btn-alarm-done').classList.add('hidden');
}

function showTerminalState() {
  show('screen-today');
  hideOrb();
  document.getElementById('today-empty').classList.add('hidden');
  document.getElementById('today-thread').classList.add('hidden');
  document.getElementById('alarm-countdown-card').classList.add('hidden');
  document.getElementById('alarm-escalation-card').classList.add('hidden');
  document.getElementById('alarm-terminal-card').classList.remove('hidden');
  document.getElementById('btn-okay').classList.add('hidden');
  document.getElementById('btn-alert').classList.add('hidden');
  document.getElementById('btn-cancel').classList.add('hidden');
  document.getElementById('btn-done').classList.add('hidden');
  document.getElementById('btn-alarm-done').classList.remove('hidden');
}

function showAlarmIdleReset() {
  document.getElementById('alarm-countdown-card').classList.add('hidden');
  document.getElementById('alarm-escalation-card').classList.add('hidden');
  document.getElementById('alarm-terminal-card').classList.add('hidden');
  document.getElementById('alarm-countdown-num').textContent = '10';
  document.getElementById('btn-alarm-done').classList.add('hidden');
  const thread = document.getElementById('today-thread');
  if (thread.innerHTML.trim()) {
    thread.classList.remove('hidden');
    document.getElementById('today-empty').classList.add('hidden');
  } else {
    document.getElementById('today-empty').classList.remove('hidden');
  }
  document.getElementById('btn-okay').classList.remove('hidden');
  document.getElementById('btn-okay').classList.add('btn--dim');
  document.getElementById('btn-okay').style.pointerEvents = 'none';
  document.getElementById('btn-alert').classList.remove('hidden');
  document.getElementById('btn-cancel').classList.add('hidden');
  showOrb();
}

function hideOrb() {
  document.getElementById('orb-backdrop-system')?.classList.add('hidden-orb');
}
function showOrb() {
  document.getElementById('orb-backdrop-system')?.classList.remove('hidden-orb');
}

async function commitEscalation(fcmToken) {
  try {
    const res = await fetch('https://ferris-causing-shed.ngrok-free.dev/pwa-respond', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({ fcm_token: fcmToken, response: 'alert' }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
  } catch (err) {
    console.error('[Alarm] commitEscalation failed:', err);
    const warningEl = document.getElementById('msg-today-warning');
    warningEl.textContent = 'Could not reach the service — your contacts may not have been called. Tap to retry.';
    warningEl.classList.remove('hidden');
    warningEl.style.cursor = 'pointer';
    warningEl.addEventListener('click', async () => {
      warningEl.classList.add('hidden');
      warningEl.style.cursor = '';
      try {
        const retryRes = await fetch('https://ferris-causing-shed.ngrok-free.dev/pwa-respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
          body: JSON.stringify({ fcm_token: fcmToken, response: 'alert' }),
        });
        if (!retryRes.ok) throw new Error('HTTP ' + retryRes.status);
        warningEl.classList.add('hidden');
      } catch (retryErr) {
        warningEl.textContent = 'Still unable to reach the service — your contacts may not have been called.';
      }
    }, { once: true });
  }
}

// --- Section 6: Today screen (message display, response POST) ---

let hasResponded = false;
let pendingNotifData = null;

function showTodayMessage(body, notifData) {
  hideOrb();
  playArrivalPing();
  pendingNotifData = notifData ?? null;
  hasResponded = false;
  const text = body || notifData?.msg || 'How are you?';
  const timeStr = fmtTime();
  const thread = document.getElementById('today-thread');
  const character = (notifData?.type === 'reminder_1' || notifData?.type === 'reminder_2' || notifData?.type === 'escalation_complete') ? 'oran' : 'iona';
  const card = buildIonaCard(text, timeStr, false, character);
  if (notifData?.type === 'scheduled_contact' || thread.classList.contains('hidden')) {
    thread.innerHTML = card;
  } else {
    thread.insertAdjacentHTML('beforeend', card);
  }
  thread.scrollTop = thread.scrollHeight;
  document.getElementById('today-empty').classList.add('hidden');
  thread.classList.remove('hidden');
  document.getElementById('btn-okay').classList.remove('btn--dim');
  document.getElementById('btn-okay').style.pointerEvents = 'auto';
  document.getElementById('btn-done').classList.add('hidden');
}

async function handleEscalationComplete() {
  const savedState = await getPreference('escalation_state');
  await setPreference('escalation_state', 'terminal');
  const { KeepAwake } = Capacitor.Plugins;
  KeepAwake.allowSleep();
  if (savedState === 'active' || savedState === 'terminal') {
    showTerminalState();
    return;
  }
  showTodayMessage(
    'Attempting to call your contacts to let them know you are in need of assistance.',
    { type: 'escalation_complete' }
  );
  document.getElementById('btn-done').classList.remove('hidden');
}

function initTodayDate() {
  const d = new Date();
  const label = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('today-date').textContent = label;
}

function initTodayActions() {
  document.getElementById('btn-okay').addEventListener('click', async () => {
    if (hasResponded) return;
    hasResponded = true;
    const timeStr = fmtTime();
    const thread = document.getElementById('today-thread');
    thread.insertAdjacentHTML('beforeend', buildBoutRow('OKAY THANKS', timeStr));
    document.getElementById('btn-okay').classList.add('btn--dim');
    const fcmToken = await getPreference('fcm_token');
    try {
      const res = await fetch('https://ferris-causing-shed.ngrok-free.dev/pwa-respond', {
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
      thread.insertAdjacentHTML('beforeend', buildIonaCard(confirmText, fmtTime(), true));
    } catch (err) {
      console.error('[Today] pwa-respond failed:', err);
      thread.insertAdjacentHTML('beforeend', buildIonaCard('We couldn\'t send your response — please try again.', fmtTime(), true));
    }
    document.getElementById('btn-done').classList.remove('hidden');
  });

  document.getElementById('btn-alert').addEventListener('click', async () => {
    const fcmToken = await getPreference('fcm_token');
    if (!fcmToken) {
      const warningEl = document.getElementById('msg-today-warning');
      warningEl.textContent = 'Your device is not fully registered — the alarm cannot be raised right now.';
      warningEl.classList.remove('hidden');
      return;
    }
    const currentEscState = await getPreference('escalation_state');
    if (currentEscState === 'active' || currentEscState === 'terminal') return;

    // Step 1 — Immediate local feedback
    const { KeepAwake } = Capacitor.Plugins;
    KeepAwake.keepAwake();
    escalationCountdownValue = getCancelWindowSeconds(memberConfig);
    showCancelWindowState();
    await setPreference('escalation_state', 'active');

    // Step 2 — Cancel is live IMMEDIATELY, before siren/voice play
    let cancelledByUser = false;
    const cancelBtn = document.getElementById('btn-cancel');

    function cancelAlarm() {
      if (cancelledByUser) return;
      cancelledByUser = true;
      if (escalationCountdownTimer) { clearInterval(escalationCountdownTimer); escalationCountdownTimer = null; }
      if (_audioCtx) { try { _audioCtx.close(); } catch (e) {} _audioCtx = null; }
      try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
      setPreference('escalation_state', 'idle');
      KeepAwake.allowSleep();
      showAlarmIdleReset();
    }

    cancelBtn.addEventListener('click', cancelAlarm, { once: true });

    // Step 3 — Siren then voice; abort if cancelled mid-play
    await playAlarmSiren();
    if (cancelledByUser) return;
    await playVoiceMessage();
    if (cancelledByUser) return;

    escalationCountdownTimer = setInterval(() => {
      if (cancelledByUser) { clearInterval(escalationCountdownTimer); return; }
      escalationCountdownValue--;
      const numEl = document.getElementById('alarm-countdown-num');
      numEl.textContent = escalationCountdownValue;
      numEl.classList.add('pulse');
      setTimeout(() => numEl.classList.remove('pulse'), 200);
      playPulseTone();
      if (escalationCountdownValue <= 0) {
        clearInterval(escalationCountdownTimer);
        escalationCountdownTimer = null;
        cancelBtn.removeEventListener('click', cancelAlarm);
        if (cancelledByUser) return;
        // Step 4 — Escalation commits — cancel window closed
        cancelBtn.classList.add('hidden');
        showEscalationActiveState();
        commitEscalation(fcmToken);
      }
    }, 1000);
  });

  document.getElementById('btn-alarm-done').addEventListener('click', async () => {
    document.getElementById('btn-alarm-done').classList.add('hidden');
    await setPreference('escalation_state', 'idle');
    const { KeepAwake } = Capacitor.Plugins;
    KeepAwake.allowSleep();
    showAlarmIdleReset();
    showOrb();
  });

  document.getElementById('btn-done').addEventListener('click', async () => {
    hasResponded = false;
    escalationCountdownTimer = null;
    document.getElementById('btn-okay').classList.add('btn--dim');
    document.getElementById('btn-okay').style.pointerEvents = 'none';
    document.getElementById('btn-alert').classList.remove('hidden');
    document.getElementById('btn-done').classList.add('hidden');
    document.getElementById('alarm-countdown-card').classList.add('hidden');
    document.getElementById('alarm-escalation-card').classList.add('hidden');
    document.getElementById('alarm-terminal-card').classList.add('hidden');
    document.getElementById('today-thread').classList.add('hidden');
    document.getElementById('today-empty').classList.remove('hidden');
    await setPreference('escalation_state', 'idle');
    const { KeepAwake } = Capacitor.Plugins;
    KeepAwake.allowSleep();
    showOrb();
  });
}

function initSettings() {
  // v2 — Settings: theme toggle (day/night). Saves to Preferences, applies dark/light class on launch.
  // v2 — Settings: button colour toggle ('Iona theme' teal/red vs default white/red). Saves to Preferences, applies btn-theme class on btn-area on launch.
  // v2 — Settings: message font toggle ('Iona style' Dancing Script teal vs plain Newsreader white). Saves to Preferences.
  const overlay = document.getElementById('settings-overlay');

  document.getElementById('nav-settings').addEventListener('click', () => {
    overlay.classList.remove('hidden');
  });

  document.getElementById('btn-settings-close').addEventListener('click', () => {
    overlay.classList.add('hidden');
  });

  const panel = document.querySelector('.settings-panel');
  let startY = 0;
  panel.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
  }, { passive: true });
  panel.addEventListener('touchend', (e) => {
    const endY = e.changedTouches[0].clientY;
    if (endY - startY > 60) {
      overlay.classList.add('hidden');
    }
  }, { passive: true });

  const { Browser } = Capacitor.Plugins;
  const dashLinks = [
    { id: 'btn-schedule', url: 'https://iona.today/dashboard#schedule' },
    { id: 'btn-service',  url: 'https://iona.today/dashboard#service' },
    { id: 'btn-contacts', url: 'https://iona.today/dashboard#contacts' },
    { id: 'btn-account',  url: 'https://iona.today/dashboard#account' },
    { id: 'btn-logs',     url: 'https://iona.today/dashboard#logs' },
  ];
  dashLinks.forEach(({ id, url }) => {
    document.getElementById(id).addEventListener('click', async () => {
      overlay.classList.add('hidden');
      await Browser.open({ url });
    });
  });

  document.getElementById('btn-pause-restart').addEventListener('click', async () => {
    const fcmToken = await getPreference('fcm_token');
    const badge = document.getElementById('settings-status-badge');
    const btn = document.getElementById('btn-pause-restart');
    const isPaused = badge.textContent.trim() === 'Paused';
    const endpoint = isPaused ? '/pwa-restart' : '/pwa-pause';
    try {
      await fetch('https://ferris-causing-shed.ngrok-free.dev' + endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ fcm_token: fcmToken }),
      });
      if (isPaused) {
        badge.textContent = 'Active';
        badge.className = 'status-badge status-badge--active';
        btn.textContent = 'Pause service';
      } else {
        badge.textContent = 'Paused';
        badge.className = 'status-badge';
        btn.textContent = 'Restart service';
      }
    } catch (err) {
      console.error('[Settings] pause/restart failed:', err);
    }
  });
}

// --- Section 7: Setup (contact list, first-time prompt) ---

// --- Entry point ---

window.addEventListener('load', async () => {
  const { SplashScreen } = Capacitor.Plugins;
  try {
    await initMemberstack();
    initSignIn();
    initLogout();
    initPushListeners();
    initTodayDate();
    initTodayActions();
    initSettings();
    await checkSession();
    try { await SplashScreen.hide({ fadeOutDuration: 500 }); } catch(e) {}
  } catch (err) {
    console.error('[App] Init failed:', err);
  }
});
