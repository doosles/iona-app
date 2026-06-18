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

// --- Section 3: Auth (Memberstack init, session check, sign-in, logout) ---

let ms = null;            // Memberstack DOM instance — set once at init
let currentMember = null; // cached from init; used by session check (T013)
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

  const greeting = currentMember.customFields?.['first-name']
    ? `Hello, ${currentMember.customFields['first-name']}.`
    : 'Hello.';
  setMsg('msg-home-greeting', greeting);

  await setupPush();
  show('screen-home');
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

  const greeting = member.customFields?.['first-name']
    ? `Hello, ${member.customFields['first-name']}.`
    : 'Hello.';
  setMsg('msg-home-greeting', greeting);

  await setupPush();
  show('screen-home');
}

function initSignIn() {
  const emailInput   = document.getElementById('login-email');
  const codeInput    = document.getElementById('login-code');
  const emailSection = document.getElementById('login-email-section');
  const codeSection  = document.getElementById('login-code-section');
  let pendingEmail   = '';

  document.getElementById('btn-send-code').addEventListener('click', async () => {
    const email = emailInput.value.trim();
    if (!email) return;
    setMsg('msg-login-email', '');
    document.getElementById('msg-login-email').classList.add('hidden');
    try {
      await ms.sendMemberLoginPasswordlessEmail({ email });
      pendingEmail = email;
      emailSection.classList.add('hidden');
      codeSection.classList.remove('hidden');
    } catch (err) {
      console.error('[SignIn] sendMemberLoginPasswordlessEmail failed:', err);
      document.getElementById('msg-login-email').classList.remove('hidden');
      setMsg('msg-login-email', 'Couldn\'t send a code. Please check your email and try again.');
    }
  });

  document.getElementById('btn-verify-code').addEventListener('click', async () => {
    const token = codeInput.value.trim();
    const email = pendingEmail;
    if (!token || !email) return;
    try {
      const result = await ms.loginMemberPasswordless({
        email: email,
        passwordlessToken: token
      });
      await onLoginSuccess(result?.data?.member ?? result?.data ?? result);
    } catch (err) {
      setMsg('msg-login-code', err?.message || 'Please check the code and try again.');
      document.getElementById('msg-login-code').classList.remove('hidden');
      document.getElementById('btn-new-code').classList.remove('hidden');
    }
  });

  document.getElementById('btn-new-code').addEventListener('click', () => {
    codeSection.classList.add('hidden');
    emailSection.classList.remove('hidden');
    document.getElementById('msg-login-code').classList.add('hidden');
    document.getElementById('btn-new-code').classList.add('hidden');
    codeInput.value = '';
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
    setMsg('msg-home-warning', 'Device registration incomplete — please restart the app.');
    document.getElementById('msg-home-warning').classList.remove('hidden');
  });

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    const type = notification.data?.type;
    if (type === 'scheduled_contact') {
      showContactScreen(notification.notification?.body ?? null);
    } else if (type === 'escalation_complete') {
      handleEscalationComplete();
    }
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const type = action.notification?.data?.type;
    if (type === 'scheduled_contact') {
      showContactScreen(action.notification?.notification?.body ?? null);
    } else if (type === 'escalation_complete') {
      handleEscalationComplete();
    } else {
      show('screen-home');
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
    setMsg('msg-home-warning', 'Setup incomplete — your device may not receive contacts. Please restart the app.');
    document.getElementById('msg-home-warning').classList.remove('hidden');
  }
}

async function setupPush() {
  const { PushNotifications } = Capacitor.Plugins;

  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') {
    console.error('[Push] Permission not granted:', permission.receive);
    setMsg('msg-home-warning', 'Push notifications are off — some features won\'t work.');
    document.getElementById('msg-home-warning').classList.remove('hidden');
    return;
  }

  pushRegistrationPending = true;
  await PushNotifications.register();
}

// --- Section 5: Alarm (constants, tone, countdown, cancel, commit, terminal) ---

// --- Section 6: Contact response (scheduled contact screen, response POST) ---

function showContactScreen(body) {
  const msg = body || 'How are you?';
  setMsg('contact-message', msg);
  document.getElementById('contact-confirm').classList.add('hidden');
  document.getElementById('msg-contact-error').classList.add('hidden');
  const btn = document.getElementById('btn-respond');
  btn.disabled = false;
  btn.textContent = 'OKAY THANKS';
  show('screen-contact');
}

function handleEscalationComplete() {
  // T031 — wired in next phase
}

function initContactResponse() {
  document.getElementById('btn-respond').addEventListener('click', async () => {
    const btn = document.getElementById('btn-respond');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    const fcmToken = await getPreference('fcm_token');
    if (!fcmToken) {
      setMsg('msg-contact-error', 'Your device isn\'t fully registered. Please restart the app.');
      document.getElementById('msg-contact-error').classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'OKAY THANKS';
      return;
    }
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
      const confirmMsg = data.next_contact
        ? 'Got it. Next contact: ' + data.next_contact + '.'
        : 'Got it — Iona has been notified.';
      setMsg('contact-confirm-msg', confirmMsg);
      document.getElementById('contact-confirm').classList.remove('hidden');
      document.getElementById('btn-respond').classList.add('hidden');
    } catch (err) {
      console.error('[Contact] pwa-respond failed:', err);
      setMsg('msg-contact-error', 'We couldn\'t send your response — please try again.');
      document.getElementById('msg-contact-error').classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'OKAY THANKS';
    }
  });

  document.getElementById('btn-contact-done').addEventListener('click', () => {
    show('screen-home');
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
    initContactResponse();
    await checkSession();
  } catch (err) {
    console.error('[App] Init failed:', err);
  }
});
