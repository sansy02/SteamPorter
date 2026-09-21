// localconfig.vdf → 每 appid 游玩时长/最近游玩/云状态
import { parseTextVdf, getPath } from '../parsers/vdf.js';
import { readFileText } from '../fs/steam-folder.js';

function toInt(v, fallback = 0) {
  if (typeof v === 'number') return Math.round(v);
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

// 返回 Map<appid(string), {playtimeMin, playtime2wks, lastPlayed, playtimeDisconnected, cloudSyncState}>
export function parseLocalConfigGames(text) {
  const out = new Map();
  if (!text) return out;
  const root = parseTextVdf(text);
  const steam = getPath(root, 'UserLocalConfigStore', 'Software', 'Valve', 'Steam');
  if (!steam || typeof steam !== 'object') return out;
  const section = steam.apps && typeof steam.apps === 'object' ? steam.apps
    : steam.Games && typeof steam.Games === 'object' ? steam.Games : null;
  if (!section) return out;
  for (const [appid, entry] of Object.entries(section)) {
    if (!/^\d{2,10}$/.test(appid) || !entry || typeof entry !== 'object') continue;
    out.set(appid, {
      appid,
      playtimeMin: toInt(entry.Playtime),
      playtime2wks: toInt(entry.Playtime2wks ?? entry.PlaytimeTwoWeeks),
      lastPlayed: toInt(entry.LastPlayed),
      playtimeDisconnected: toInt(entry.PlaytimeDisconnected),
      cloudSyncState: entry.cloud && typeof entry.cloud === 'object' && typeof entry.cloud.last_sync_state === 'string'
        ? entry.cloud.last_sync_state : null,
    });
  }
  return out;
}

// 账号元信息(等级等)
export function parseLocalConfigMeta(text) {
  const out = { playerLevel: null };
  if (!text) return out;
  const root = parseTextVdf(text);
  const steam = getPath(root, 'UserLocalConfigStore', 'Software', 'Valve', 'Steam');
  if (!steam || typeof steam !== 'object') return out;
  if (steam.PlayerLevel !== undefined) out.playerLevel = toInt(steam.PlayerLevel, null);
  return out;
}

export async function loadLocalConfig(folderHandle, sid32) {
  const text = await readFileText(folderHandle, ['userdata', sid32, 'config', 'localconfig.vdf']);
  if (!text) return new Map();
  try {
    return parseLocalConfigGames(text);
  } catch (e) {
    console.warn('[localconfig] 解析失败', e);
    return new Map();
  }
}
