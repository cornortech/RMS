import { db, type OutboxItem } from './db';

// =====================================================================
// OFFLINE LAYER
// Your whole app uses fetch(). We wrap fetch() once, here, so every page
// gets offline support WITHOUT changing each component:
//
//   GET (read)   → online: save a copy of the answer in IndexedDB
//                  offline: return the saved copy (+ changes made offline)
//   Order/Bill writes → online: send normally (with a unique key)
//                  offline: save in the "outbox" and pretend it worked
//   When the internet comes back → send the outbox to the server in order
// =====================================================================

export const API_ROOT = (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '');

// Only these writes can be done offline. Everything else (menu, staff,
// settings, tables...) still needs internet, which is safer.
const OFFLINE_WRITES: { method: string; pattern: RegExp; collection: string | null }[] = [
  { method: 'POST', pattern: /^\/api\/orders\/?$/, collection: '/api/orders' },          // new order
  { method: 'PUT', pattern: /^\/api\/orders\/[^/]+$/, collection: '/api/orders' },       // order status change
  { method: 'POST', pattern: /^\/api\/bills\/?$/, collection: '/api/bills' },            // new bill
  { method: 'PATCH', pattern: /^\/api\/bills\/[^/]+$/, collection: '/api/bills' },       // pay a pending bill
  { method: 'PATCH', pattern: /^\/api\/loyalty\/[^/]+\/points$/, collection: null },     // loyalty points
];

// Login, session check and the customer QR pages are never handled offline.
const NEVER_OFFLINE = /^\/api\/(auth\/|staff\/login|public\/)/;

// Pages to pre-load into the local cache while online
const WARM_PATHS = ['/api/menu', '/api/tables', '/api/orders', '/api/bills', '/api/loyalty'];

const GET_TIMEOUT_MS = 8000;    // if a GET takes longer and we have a saved copy, use the copy
const WRITE_TIMEOUT_MS = 15000; // if a write takes longer, save it offline (the unique key prevents duplicates)
const SYNC_EVERY_MS = 15000;
const WARM_EVERY_MS = 5 * 60 * 1000;

const LOCAL_ID_RE = /local-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

let originalFetch: typeof window.fetch;

/* ------------------------------------------------------------------ */
/*  Small status store (the OfflineBanner reads this)                  */
/* ------------------------------------------------------------------ */
export interface SyncState {
  online: boolean;
  pending: number;
  failed: number;
  syncing: boolean;
  needsLogin: boolean;
  lastSyncedAt: number | null;
}

let state: SyncState = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pending: 0,
  failed: 0,
  syncing: false,
  needsLogin: false,
  lastSyncedAt: null,
};
const listeners = new Set<() => void>();

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export const subscribeSync = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export const getSyncState = () => state;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

// crypto.randomUUID only exists on https/localhost, so we have a backup.
export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Which restaurant is logged in? (read from the login token, no server needed)
export function currentOwnerUid(): string | null {
  const token = localStorage.getItem('authToken');
  if (!token) return null;
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part)).uid || null;
  } catch {
    return null;
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-RMS-Offline': '1' },
  });
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  if (init.signal) return originalFetch(url, init); // the page already controls cancelling
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await originalFetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

const markOnline = () => state.online || setState({ online: true });
const markOffline = () => state.online && setState({ online: false });

function ruleFor(method: string, path: string) {
  return OFFLINE_WRITES.find((r) => r.method === method && r.pattern.test(path));
}

// Replace "local-..." ids with real server ids once we know them
async function resolveIds(text: string): Promise<string> {
  const found = text.match(LOCAL_ID_RE);
  if (!found) return text;
  let out = text;
  for (const localId of Array.from(new Set(found))) {
    const m = await db.idMap.get(localId);
    if (m) out = out.split(localId).join(m.realId);
  }
  return out;
}

async function pendingItems(owner: string) {
  // index order = ownerUid, then seq → oldest change first
  return db.outbox.where('ownerUid').equals(owner).filter((i) => i.status === 'pending').toArray();
}

async function refreshCounts() {
  const owner = currentOwnerUid();
  if (!owner) return setState({ pending: 0, failed: 0 });
  const all = await db.outbox.where('ownerUid').equals(owner).toArray();
  setState({
    pending: all.filter((i) => i.status === 'pending').length,
    failed: all.filter((i) => i.status === 'failed').length,
  });
}

/* ------------------------------------------------------------------ */
/*  Show offline changes inside lists (e.g. new offline order appears  */
/*  in the Orders page even before it reaches the server)              */
/* ------------------------------------------------------------------ */
async function applyPendingChanges(owner: string, path: string, body: any) {
  if (!body || !Array.isArray(body.data)) return body;
  const cleanPath = path.replace(/\/+$/, '');
  const items = (await pendingItems(owner)).filter((i) => {
    const r = ruleFor(i.method, new URL(i.url).pathname);
    return r?.collection === cleanPath;
  });
  if (items.length === 0) return body;

  let list: any[] = [...body.data];
  for (const item of items) {
    const data = JSON.parse(item.body || '{}');
    if (item.method === 'POST') {
      list.unshift({
        ...data,
        _id: item.localId,
        id: item.localId,
        createdAt: new Date(item.createdAt).toISOString(),
        updatedAt: new Date(item.createdAt).toISOString(),
        _offline: true,
      });
    } else {
      const targetId = decodeURIComponent(new URL(item.url).pathname.split('/').pop() || '');
      const mapped = (await db.idMap.get(targetId))?.realId;
      list = list.map((d) =>
        String(d._id) === targetId || (mapped && String(d._id) === mapped) ? { ...d, ...data, _offline: true } : d
      );
    }
  }
  return { ...body, data: list, count: list.length };
}

/* ------------------------------------------------------------------ */
/*  READS                                                              */
/* ------------------------------------------------------------------ */
async function findCached(owner: string, url: string, path: string) {
  const exact = await db.apiCache.get(`${owner}|${url}`);
  if (exact) return exact;
  // Same page but different ?query → use the newest one we have
  const same = await db.apiCache.where('path').equals(path).filter((c) => c.ownerUid === owner).toArray();
  return same.sort((a, b) => b.savedAt - a.savedAt)[0];
}

async function handleGet(url: string, path: string, init: RequestInit): Promise<Response> {
  const owner = currentOwnerUid();
  if (!owner) return originalFetch(url, init);

  const cached = await findCached(owner, url, path);
  try {
    // With a saved copy we don't wait forever (e.g. Render waking up); without one we must wait.
    const res = cached ? await fetchWithTimeout(url, init, GET_TIMEOUT_MS) : await originalFetch(url, init);
    if (res.status >= 502 && cached) throw new Error('Server unavailable');
    markOnline();

    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    if (!res.ok || !isJson) return res;

    const body = await res.clone().json();
    await db.apiCache.put({ key: `${owner}|${url}`, ownerUid: owner, url, path, body, savedAt: Date.now() });

    // Still have unsynced changes? Show them on top of the fresh server data.
    if (state.pending > 0) return jsonResponse(await applyPendingChanges(owner, path, body), res.status);
    return res;
  } catch (err) {
    markOffline();
    if (cached) return jsonResponse(await applyPendingChanges(owner, path, cached.body));
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/*  WRITES                                                             */
/* ------------------------------------------------------------------ */
async function handleWrite(url: string, method: string, init: RequestInit): Promise<Response> {
  const owner = currentOwnerUid();
  if (!owner) return originalFetch(url, init);

  const key = uuid(); // the same key is used if we have to retry later
  const finalUrl = await resolveIds(url);
  const body = await resolveIds(typeof init.body === 'string' ? init.body : '');

  const mustQueue =
    !navigator.onLine ||
    (await pendingItems(owner)).length > 0 || // keep changes in the right order
    LOCAL_ID_RE.test(finalUrl + body);        // refers to a record that isn't on the server yet
  LOCAL_ID_RE.lastIndex = 0;

  if (!mustQueue) {
    const headers = new Headers(init.headers);
    headers.set('Idempotency-Key', key);
    try {
      const res = await fetchWithTimeout(finalUrl, { ...init, body, headers }, WRITE_TIMEOUT_MS);
      if (res.status < 502) {
        markOnline();
        return res; // real server answer (success or a normal error message)
      }
    } catch {
      /* no internet / timeout → save offline below */
    }
  }

  // ---- Save to the outbox ----
  const localId = method === 'POST' ? `local-${uuid()}` : undefined;
  const item: OutboxItem = {
    id: key,
    ownerUid: owner,
    method,
    url: finalUrl,
    body,
    localId,
    status: 'pending',
    attempts: 0,
    createdAt: Date.now(),
  };
  await db.outbox.add(item);
  await refreshCounts();
  setTimeout(syncNow, 1000);

  const data = JSON.parse(body || '{}');
  const now = new Date().toISOString();
  const doc =
    method === 'POST'
      ? { ...data, _id: localId, id: localId, createdAt: now, updatedAt: now, _offline: true }
      : { ...data, _id: decodeURIComponent(new URL(finalUrl).pathname.split('/').pop() || ''), _offline: true };

  return jsonResponse(
    { success: true, offline: true, message: 'Saved on this device. It will sync when the internet is back.', data: doc },
    method === 'POST' ? 201 : 200
  );
}

/* ------------------------------------------------------------------ */
/*  SYNC: send the outbox to the server, oldest first                  */
/* ------------------------------------------------------------------ */
let syncing = false;

async function serverReachable() {
  try {
    const res = await fetchWithTimeout(`${API_ROOT}/health`, { cache: 'no-store' }, 6000);
    return res.ok;
  } catch {
    return false;
  }
}

export async function syncNow() {
  const owner = currentOwnerUid();
  if (syncing || !owner) return;
  syncing = true;
  setState({ syncing: true });
  let synced = 0;

  try {
    if (!(await serverReachable())) {
      markOffline();
      return;
    }
    markOnline();
    setState({ needsLogin: false });

    while (true) {
      const [item] = await pendingItems(owner);
      if (!item) break;

      const url = await resolveIds(item.url);
      const body = await resolveIds(item.body);
      const unresolved = (url + body).match(LOCAL_ID_RE);
      if (unresolved) {
        // Its parent record (e.g. the offline order) never reached the server
        await db.outbox.update(item.seq!, { status: 'failed', lastError: 'Linked record failed to sync.' });
        continue;
      }

      let res: Response;
      try {
        res = await fetchWithTimeout(
          url,
          {
            method: item.method,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${localStorage.getItem('authToken') || ''}`,
              'Idempotency-Key': item.id,
            },
            body,
          },
          30000
        );
      } catch {
        markOffline();
        break; // internet dropped again → try later
      }

      if (res.ok) {
        if (item.localId) {
          const j = await res.json().catch(() => null);
          const realId = j?.data?._id || j?.data?.id;
          if (realId) await db.idMap.put({ localId: item.localId, realId: String(realId) });
        }
        await db.outbox.delete(item.seq!);
        synced++;
        continue;
      }

      if (res.status === 401) {
        setState({ needsLogin: true }); // login expired → wait for the user to log in again
        break;
      }
      if (res.status === 409 || res.status === 429 || res.status >= 500) {
        await db.outbox.update(item.seq!, { attempts: item.attempts + 1, lastError: `Server busy (${res.status})` });
        break; // try again later
      }

      // 400 / 403 / 404: the server refused it; retrying won't help
      const j = await res.json().catch(() => null);
      await db.outbox.update(item.seq!, { status: 'failed', lastError: j?.message || `Rejected (${res.status})` });
    }
  } finally {
    syncing = false;
    await refreshCounts();
    setState({ syncing: false, ...(synced ? { lastSyncedAt: Date.now() } : {}) });
    if (synced) window.dispatchEvent(new CustomEvent('rms:synced', { detail: { count: synced } }));
  }
}

/* ------------------------------------------------------------------ */
/*  Actions for the banner                                             */
/* ------------------------------------------------------------------ */
export async function hasUnsyncedChanges() {
  const owner = currentOwnerUid();
  if (!owner) return false;
  return (await db.outbox.where('ownerUid').equals(owner).count()) > 0;
}

export async function getFailedItems() {
  const owner = currentOwnerUid();
  if (!owner) return [];
  return db.outbox.where('ownerUid').equals(owner).filter((i) => i.status === 'failed').toArray();
}

export async function retryFailed() {
  const failed = await getFailedItems();
  await Promise.all(failed.map((i) => db.outbox.update(i.seq!, { status: 'pending', attempts: 0, lastError: '' })));
  await refreshCounts();
  syncNow();
}

export async function discardFailed() {
  const failed = await getFailedItems();
  await db.outbox.bulkDelete(failed.map((i) => i.seq!));
  await refreshCounts();
}

/* ------------------------------------------------------------------ */
/*  Pre-load important pages so they work offline                      */
/* ------------------------------------------------------------------ */
let lastWarm = 0;
async function warmCache() {
  if (!currentOwnerUid() || !navigator.onLine || Date.now() - lastWarm < WARM_EVERY_MS) return;
  lastWarm = Date.now();
  for (const p of WARM_PATHS) {
    try {
      await window.fetch(`${API_ROOT}${p}`); // goes through our wrapper → gets saved
    } catch {
      /* ignore */
    }
  }
}

/* ------------------------------------------------------------------ */
/*  INSTALL — call once in main.tsx                                    */
/* ------------------------------------------------------------------ */
export function installOfflineFetch() {
  originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(API_ROOT)) return originalFetch(input, init);

    // Add the login token (same as your old main.tsx code)
    const token = localStorage.getItem('authToken');
    const headers = new Headers(init.headers);
    if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    const reqInit: RequestInit = { ...init, headers };

    const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const path = new URL(url).pathname;

    let res: Response;
    if (input instanceof Request || NEVER_OFFLINE.test(path)) {
      res = await originalFetch(input, reqInit);
    } else if (method === 'GET') {
      res = await handleGet(url, path, reqInit);
    } else if (ruleFor(method, path) && (init.body == null || typeof init.body === 'string')) {
      res = await handleWrite(url, method, reqInit);
    } else {
      res = await originalFetch(input, reqInit);
    }

    // Login expired → back to the login screen (same as before)
    const isLoginCall = /\/(auth\/login|auth\/verify|staff\/login)$/.test(path);
    if (token && res.status === 401 && !isLoginCall) {
      localStorage.removeItem('authToken');
      window.location.reload();
    }
    return res;
  };

  window.addEventListener('online', () => {
    markOnline();
    syncNow();
  });
  window.addEventListener('offline', markOffline);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow();
  });

  setInterval(() => {
    if (state.pending > 0 || !state.online) syncNow();
    else warmCache();
  }, SYNC_EVERY_MS);

  refreshCounts();
  setTimeout(() => {
    syncNow();
    warmCache();
  }, 3000);
}