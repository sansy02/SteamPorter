// 全局状态 + 微型事件总线
export const state = {
  folderHandle: null,     // Steam 根目录 FileSystemDirectoryHandle
  accounts: [],           // 本地发现的账号 [{sid64, sid32, accountName, personaName}]
  account: null,          // 当前选中账号
  login: null,            // OpenID 扫码登录结果 {sid64, at}
  games: new Map(),       // appid → 合并后的游戏对象(见 data/index.js)
  appinfoMeta: null,      // appinfo.vdf 的 size+mtime(缓存判定用)
  shotsIndex: new Map(),  // appid → {name, accounts:[...], files:[...]}
  savesIndex: new Map(),  // appid → {accounts:[...], files:[...], latest, size}
  prices: null,           // {meta, map: appid→price分}
  purity: null,           // {score, grade, caption, flags:[...]}
  scanning: false,
};

const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event).delete(fn);
}

export function emit(event, payload) {
  const set = listeners.get(event);
  if (set) for (const fn of [...set]) {
    try { fn(payload); } catch (e) { console.error('[bus]', event, e); }
  }
}
