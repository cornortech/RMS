// =====================================================================
// 📋 SESSION TRACKER — tells the server when this restaurant's app is open / closed
//
//   startSessionTracking()  → after login (or when the app opens and is still logged in)
//   every 1 minute          → "still open" signal
//   endSession('logout')    → Log out button
//   tab / browser closed    → "tab-closed" is sent automatically
//   PC off / internet lost  → no signal for 5 min → the server closes it by itself
// A page refresh continues the same session (the id is kept in sessionStorage).
// =====================================================================

const API = (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '');
const KEY = 'activitySessionId';
const PING_MS = 60 * 1000;

let sessionId: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let starting: Promise<void> | null = null;
let listening = false;
let lastToken = ''; // kept so "logged out" can still be sent if the token was cleared first

const token = () => {
  try {
    const t = localStorage.getItem('authToken') || '';
    if (t) lastToken = t;
    return t;
  } catch {
    return '';
  }
};

const post = (path: string, body: unknown, keepalive = false) =>
  fetch(`${API}/api/activity/${path}`, {
    method: 'POST',
    keepalive, // lets the "closed" message finish even while the tab is closing
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token() || lastToken}` },
    body: JSON.stringify(body),
  });

async function open() {
  if (!token()) return;
  let resumeId: string | null = null;
  try {
    resumeId = sessionStorage.getItem(KEY);
  } catch {
    /* ignore */
  }
  try {
    const res = await post('start', resumeId ? { resumeId } : {});
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.sessionId) {
      sessionId = data.sessionId;
      try {
        sessionStorage.setItem(KEY, data.sessionId);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* offline → the next ping tries again */
  }
}

async function ping() {
  if (!token()) return;
  if (!sessionId) {
    await startSessionTracking();
    return;
  }
  try {
    const res = await post('ping', { sessionId });
    const data = await res.json().catch(() => ({}));
    if (data.closed) {
      // Closed by the server (no signal for a while) → start a new one
      sessionId = null;
      try {
        sessionStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
      await startSessionTracking();
    }
  } catch {
    /* offline → try again in 1 minute */
  }
}

function onPageHide() {
  if (!sessionId || !token()) return;
  // Sent on refresh too — the server re-opens the same session when the page loads again
  post('end', { sessionId, reason: 'tab-closed' }, true).catch(() => {});
}

function onVisible() {
  if (document.visibilityState === 'visible') ping();
}

export function startSessionTracking() {
  if (starting) return starting;
  starting = open().finally(() => {
    starting = null;
  });
  if (!timer) timer = setInterval(ping, PING_MS);
  if (!listening) {
    listening = true;
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisible);
  }
  return starting;
}

/** Call BEFORE removing the token on logout. */
export async function endSession(reason: 'logout' | 'tab-closed' = 'logout') {
  const id = sessionId;
  if (timer) clearInterval(timer);
  timer = null;
  sessionId = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  if (!id || !(token() || lastToken)) return;
  try {
    await Promise.race([post('end', { sessionId: id, reason }, true), new Promise((r) => setTimeout(r, 2500))]);
  } catch {
    /* offline → the server closes it after 5 minutes without a signal */
  }
}