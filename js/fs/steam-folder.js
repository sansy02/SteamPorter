// Steam 文件夹访问层(File System Access API)
import { kvGet, kvSet, kvDel } from '../storage.js';

export const isSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

const PICKER_ID = 'steamporter-steam';
const KV_HANDLE = 'folderHandle';
const KV_SELECTED = 'selectedSid64';

export class NeedGestureError extends Error {
  constructor() { super('需要用户手势重新授权'); this.name = 'NeedGestureError'; }
}

export async function pickSteamFolder() {
  const handle = await window.showDirectoryPicker({ id: PICKER_ID, mode: 'read' });
  const ok = await verifySteamFolder(handle);
  if (!ok) throw new Error('NOT_STEAM_FOLDER');
  await persistHandle(handle);
  return handle;
}

export async function verifySteamFolder(handle) {
  try {
    await handle.getFileHandle('steam.exe');
    await handle.getDirectoryHandle('userdata');
    return true;
  } catch {
    // 部分精简安装可能没有 steam.exe?以 config/loginusers.vdf 兜底
    try {
      await (await handle.getDirectoryHandle('config')).getFileHandle('loginusers.vdf');
      await handle.getDirectoryHandle('userdata');
      return true;
    } catch {
      return false;
    }
  }
}

export async function restoreFolderHandle() {
  const h = await kvGet(KV_HANDLE);
  if (!h) return null;
  try {
    const perm = await h.queryPermission({ mode: 'read' });
    if (perm === 'granted') return h;
    return null; // 'prompt'/'denied' → UI 用按钮手势触发
  } catch {
    return null;
  }
}

export async function requestPermission(handle) {
  const perm = await handle.requestPermission({ mode: 'read' });
  return perm === 'granted';
}

export async function persistHandle(handle) { await kvSet(KV_HANDLE, handle); }
export async function forgetHandle() { await kvDel(KV_HANDLE); }

export async function getSelectedSid64() { return kvGet(KV_SELECTED); }
export async function setSelectedSid64(sid64) { await kvSet(KV_SELECTED, sid64); }

// 路径下钻工具
export async function getDir(root, parts) {
  let cur = root;
  for (const p of parts) {
    try { cur = await cur.getDirectoryHandle(p); }
    catch { return null; }
  }
  return cur;
}

export async function getFile(root, parts) {
  if (!root) return null;
  let cur = root;
  for (let i = 0; i < parts.length; i++) {
    try {
      cur = i === parts.length - 1
        ? await cur.getFileHandle(parts[i])
        : await cur.getDirectoryHandle(parts[i]);
    } catch {
      return null;
    }
  }
  return cur;
}

export async function listDir(root, parts) {
  const dir = parts && parts.length ? await getDir(root, parts) : root;
  if (!dir) return [];
  const out = [];
  for await (const [name, handle] of dir.entries()) out.push({ name, kind: handle.kind, handle });
  return out;
}

export async function readFile(root, parts) {
  const fh = await getFile(root, parts);
  if (!fh) return null;
  return fh;
}

export async function readFileText(root, parts) {
  const fh = await getFile(root, parts);
  if (!fh) return null;
  return await fh.text();
}

export async function readFileBuffer(root, parts) {
  const fh = await getFile(root, parts);
  if (!fh) return null;
  return await fh.arrayBuffer();
}

export async function fileMeta(root, parts) {
  const fh = await getFile(root, parts);
  if (!fh) return null;
  return { size: fh.size, lastModified: fh.lastModified };
}
