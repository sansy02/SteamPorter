// loginusers.vdf → 本地账号列表
import { parseTextVdf, getPath } from '../parsers/vdf.js';
import { readFileText } from '../fs/steam-folder.js';

const BASE = 76561197960265728n;

export function sid64To32(sid64) {
  return (BigInt(sid64) - BASE).toString();
}
export function sid32To64(sid32) {
  return (BigInt(sid32) + BASE).toString();
}

export function parseLoginUsers(text) {
  const root = parseTextVdf(text);
  const users = getPath(root, 'users');
  const out = [];
  if (!users || typeof users !== 'object') return out;
  for (const [sid64, info] of Object.entries(users)) {
    if (!/^\d{17}$/.test(sid64) || !sid64.startsWith('7656119')) continue;
    if (!info || typeof info !== 'object') continue;
    out.push({
      sid64,
      sid32: sid64To32(sid64),
      accountName: typeof info.AccountName === 'string' ? info.AccountName : '',
      personaName: typeof info.PersonaName === 'string' ? info.PersonaName : info.AccountName || sid64,
      autoLogin: info.AutoLogin === '1' || info.AutoLogin === 1,
    });
  }
  return out;
}

export async function loadLoginUsers(folderHandle) {
  const text = await readFileText(folderHandle, ['config', 'loginusers.vdf']);
  if (!text) return [];
  try {
    return parseLoginUsers(text);
  } catch (e) {
    console.warn('[loginusers] 解析失败', e);
    return [];
  }
}
