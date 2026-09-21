// 截图索引:聚合所有本地账号的 userdata/*/760/remote/<appid>/screenshots
import { listDir, getDir, readFileBuffer } from '../fs/steam-folder.js';

const EXT_RE = /\.(jpe?g|png)$/i;

// 列出所有 userdata 下的账号目录(数字命名)
export async function listUserdataAccounts(folderHandle) {
  const entries = await listDir(folderHandle, ['userdata']);
  return entries.filter(e => e.kind === 'directory' && /^\d+$/.test(e.name)).map(e => e.name);
}

// 某账号截图量:返回 Map<appid, count>
export async function indexAccountShots(folderHandle, sid32) {
  const out = new Map();
  const remoteRoot = await getDir(folderHandle, ['userdata', sid32, '760', 'remote']);
  if (!remoteRoot) return out;
  for await (const [appid, appDir] of remoteRoot.entries()) {
    if (appDir.kind !== 'directory' || !/^\d+$/.test(appid)) continue;
    let shotsDir = null;
    try { shotsDir = await appDir.getDirectoryHandle('screenshots'); } catch { continue; }
    let count = 0;
    for await (const [name, h] of shotsDir.entries()) {
      if (h.kind === 'file' && EXT_RE.test(name)) count++;
    }
    if (count > 0) out.set(appid, count);
  }
  return out;
}

// 某账号某游戏截图文件列表(懒加载):[{name, size, handle, sid32}]
export async function listGameShots(folderHandle, sid32, appid) {
  const out = [];
  const dir = await getDir(folderHandle, ['userdata', sid32, '760', 'remote', appid, 'screenshots']);
  if (!dir) return out;
  for await (const [name, h] of dir.entries()) {
    if (h.kind === 'file' && EXT_RE.test(name)) {
      out.push({ name, sid32, size: h.size, handle: h });
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// 聚合索引:返回 Map<appid, {accounts:[sid32], count}>
export async function indexAllShots(folderHandle, onProgress) {
  const sids = await listUserdataAccounts(folderHandle);
  const agg = new Map();
  let done = 0;
  for (const sid32 of sids) {
    const perAccount = await indexAccountShots(folderHandle, sid32);
    for (const [appid, count] of perAccount) {
      let entry = agg.get(appid);
      if (!entry) { entry = { accounts: [], count: 0 }; agg.set(appid, entry); }
      entry.accounts.push(sid32);
      entry.count += count;
    }
    done++;
    if (onProgress) onProgress({ done, total: sids.length, label: `截图索引 ${done}/${sids.length}` });
  }
  return agg;
}
