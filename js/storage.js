// IndexedDB 封装:登录态句柄 + 扫描缓存
const DB_NAME = 'steamporter';
const DB_VERSION = 1;
const STORES = ['kv', 'games', 'achievements', 'shotsIndex', 'savesIndex'];

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'k' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('IDB abort'));
  });
}

export async function kvGet(key) {
  try {
    const req = await tx('kv', 'readonly', s => s.get(key));
    return req ? req.v : undefined;
  } catch { return undefined; }
}

export async function kvSet(key, value) {
  try { await tx('kv', 'readwrite', s => s.put({ k: key, v: value })); } catch { /* 隐私模式等场景静默 */ }
}

export async function kvDel(key) {
  try { await tx('kv', 'readwrite', s => s.delete(key)); } catch { /* 同上 */ }
}

export async function storeGet(store, key) {
  try {
    const r = await tx(store, 'readonly', s => s.get(key));
    return r || undefined;
  } catch { return undefined; }
}

export async function storePut(store, key, value) {
  try { await tx(store, 'readwrite', s => s.put({ k: key, ...value })); } catch { /* 静默 */ }
}

export async function storeClear(store) {
  try { await tx(store, 'readwrite', s => s.clear()); } catch { /* 静默 */ }
}

export async function storeKeys(store) {
  try {
    return await tx(store, 'readonly', s => s.getAllKeys()) || [];
  } catch { return []; }
}
