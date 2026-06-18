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
  currentMember = result?.data ?? null;
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

  // TODO: call setupPush() here on session restore — wired in T019
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

  // TODO: call setupPush() here post-login — wired in T019
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
    if (!token || !pendingEmail) return;
    setMsg('msg-login-code', '');
    document.getElementById('msg-login-code').classList.add('hidden');
    try {
      const { data: member } = await ms.loginMemberPasswordless({
        email: pendingEmail,
        passwordlessToken: token,
      });
      await onLoginSuccess(member);
    } catch (err) {
      console.error('[SignIn] loginMemberPasswordless failed:', err);
      document.getElementById('msg-login-code').classList.remove('hidden');
      setMsg('msg-login-code', 'That code didn\'t work. Please check it and try again.');
    }
  });
}

// --- Section 4: Push registration (FCM listeners, register, backend POST) ---

// --- Section 5: Alarm (constants, tone, countdown, cancel, commit, terminal) ---

// --- Section 6: Contact response (scheduled contact screen, response POST) ---

// --- Section 7: Setup (contact list, first-time prompt) ---

// --- Entry point ---

window.addEventListener('load', async () => {
  try {
    await initMemberstack();
    initSignIn();
    await checkSession();
  } catch (err) {
    console.error('[App] Init failed:', err);
  }
});
