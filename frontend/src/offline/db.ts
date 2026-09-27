import Dexie, { type Table } from 'dexie';

// ---------------------------------------------------------------
// The local database that lives INSIDE the browser (IndexedDB).
// It keeps working with no internet and survives page refreshes.
// ---------------------------------------------------------------

/** One saved change waiting to be sent to the server. */
export interface OutboxItem {
  seq?: number;          // auto number → keeps changes in the order they happened
  id: string;            // unique key (UUID) → sent as "Idempotency-Key" so the server never saves it twice
  ownerUid: string;      // which restaurant made this change (never sync it to another restaurant)
  method: string;        // POST / PUT / PATCH
  url: string;           // full API address
  body: string;          // JSON text
  localId?: string;      // for new records: the temporary "local-..." id we gave it
  status: 'pending' | 'failed';
  attempts: number;
  lastError?: string;
  createdAt: number;
}

/** Last successful answer of a GET request, used when offline. */
export interface CachedResponse {
  key: string;           // ownerUid + url
  ownerUid: string;
  url: string;
  path: string;          // url without ?query, to find "any cached version" of a page
  body: any;
  savedAt: number;
}

/** When a "local-..." record is synced, remember its real server id. */
export interface IdMapping {
  localId: string;
  realId: string;
}

class RmsOfflineDB extends Dexie {
  outbox!: Table<OutboxItem, number>;
  apiCache!: Table<CachedResponse, string>;
  idMap!: Table<IdMapping, string>;

  constructor() {
    super('rms-offline');
    this.version(1).stores({
      outbox: '++seq, id, ownerUid, status',
      apiCache: 'key, ownerUid, path, savedAt',
      idMap: 'localId',
    });
  }
}

export const db = new RmsOfflineDB();