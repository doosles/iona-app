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

function buildIonaCard(text, timeStr, isReply) {
  return `
    <div class="iona-card">
      <div class="orb ${isReply ? 'orb--sm' : 'orb--lg'}">
        <div class="orb-ring"></div>
      </div>
      <div class="iona-card-content">
        <div class="iona-label">Iona · ${isReply ? timeStr : 'Just now'}</div>
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
    if (type === 'scheduled_contact') {
      showTodayMessage(notification.notification?.body ?? null, notification.data);
    } else if (type === 'escalation_complete') {
      handleEscalationComplete();
    }
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const type = action.notification?.data?.type;
    if (type === 'scheduled_contact') {
      showTodayMessage(action.notification?.notification?.body ?? null, action.notification?.data);
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

// --- Section 6: Today screen (message display, response POST) ---

let hasResponded = false;
let pendingNotifData = null;

function showTodayMessage(body, notifData) {
  pendingNotifData = notifData ?? null;
  hasResponded = false;
  const text = body || 'How are you?';
  const timeStr = fmtTime();
  const thread = document.getElementById('today-thread');
  thread.innerHTML = buildIonaCard(text, timeStr, false);
  document.getElementById('today-empty').classList.add('hidden');
  thread.classList.remove('hidden');
  document.getElementById('btn-okay').classList.remove('btn--dim');
  document.getElementById('btn-done').classList.add('hidden');
}

function handleEscalationComplete() {
  // T031 — wired in next phase
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
    hasResponded = true;
    const timeStr = fmtTime();
    const thread = document.getElementById('today-thread');
    thread.insertAdjacentHTML('beforeend', buildBoutRow('ALERT CONTACTS', timeStr));
    document.getElementById('btn-okay').classList.add('btn--dim');
    const fcmToken = await getPreference('fcm_token');
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
      console.error('[Today] pwa-respond alert failed:', err);
    }
    thread.insertAdjacentHTML('beforeend', buildIonaCard('Sending an alert to your contacts right away.', fmtTime(), true));
    document.getElementById('btn-done').classList.remove('hidden');
  });

  document.getElementById('btn-done').addEventListener('click', () => {
    hasResponded = false;
    document.getElementById('btn-okay').classList.add('btn--dim');
    document.getElementById('btn-done').classList.add('hidden');
  });
}

function initSettings() {
  const overlay = document.getElementById('settings-overlay');

  document.getElementById('nav-settings').addEventListener('click', () => {
    overlay.classList.remove('hidden');
  });

  document.getElementById('btn-settings-close').addEventListener('click', () => {
    overlay.classList.add('hidden');
  });

  const { Browser } = Capacitor.Plugins;
  const dashLinks = [
    { id: 'btn-schedule', url: 'https://howsu.today/dashboard#schedule' },
    { id: 'btn-service',  url: 'https://howsu.today/dashboard#service' },
    { id: 'btn-contacts', url: 'https://howsu.today/dashboard#contacts' },
    { id: 'btn-account',  url: 'https://howsu.today/dashboard#account' },
    { id: 'btn-logs',     url: 'https://howsu.today/dashboard#logs' },
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
  try {
    await initMemberstack();
    initSignIn();
    initLogout();
    initPushListeners();
    initTodayDate();
    initTodayActions();
    initSettings();
    await checkSession();
  } catch (err) {
    console.error('[App] Init failed:', err);
  }
});
