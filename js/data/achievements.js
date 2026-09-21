// 成就数据:
//   UserGameStatsSchema_<appid>.bin — 定义(旧式 KV):root[appid].stats → {statId: {bits: {key: {name, display{...}}}}}
//   UserGameStats_<sid32>_<appid>.bin — 解锁数据:
//     新版 cache 格式:root.cache → {statId: {data: 32位位图, AchievementTimes: {key: unix秒}}}
//     旧式:root[appid].stats → {api: {earned, earnedtime}}
//   配对规则:cache 节 id = schema 的 statId,同一 statId 内键直接对应
import { parseBinaryVdf } from '../parsers/bin-vdf.js';
import { readFileBuffer, getDir } from '../fs/steam-folder.js';
import { storeGet, storePut } from '../storage.js';

export const ACH_ICON_BASE = 'https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/';

function loc(obj) {
  if (!obj || typeof obj !== 'object') return { name: '', desc: '' };
  const name = obj.schinese || obj.tchinese || obj.english || '';
  return { name: String(name), desc: '' };
}

function iconUrl(v, appid) {
  if (!v) return null;
  const s = String(v);
  if (/^https?:/i.test(s)) return s;
  return ACH_ICON_BASE + appid + '/' + s;
}

// 解析成就定义 → Map<statId, Map<key, def>>(key = 该 statId 内成就键,通常为索引)
export function parseSchemaBin(buffer, appid) {
  const out = new Map();
  let root;
  try { root = parseBinaryVdf(buffer, {}); } catch (e) { console.warn(`[ach] schema ${appid} 解析失败`, e); return out; }
  const node = (root && root[appid]) || root;
  const stats = node && node.stats;
  if (!stats || typeof stats !== 'object') return out;

  for (const [statId, group] of Object.entries(stats)) {
    if (!group || typeof group !== 'object' || !group.bits || typeof group.bits !== 'object') continue;
    const defs = new Map();
    for (const [key, def] of Object.entries(group.bits)) {
      if (!def || typeof def !== 'object') continue;
      const disp = def.display && typeof def.display === 'object' ? def.display : {};
      const nameLoc = disp.name && typeof disp.name === 'object' ? loc(disp.name) : { name: '', desc: '' };
      const descLoc = disp.desc && typeof disp.desc === 'object' ? loc(disp.desc) : { name: '', desc: '' };
      defs.set(key, {
        key,
        api: String(def.name || key),
        name: nameLoc.name || String(def.name || key),
        desc: descLoc.name || '',
        hidden: disp.hidden === 1 || disp.hidden === '1' || disp.hidden === true,
        icon: iconUrl(disp.icon, appid),
        iconGray: iconUrl(disp.icon_gray || disp.iconGray, appid),
      });
    }
    if (defs.size > 0) out.set(statId, defs);
  }
  return out;
}

// 解析用户成就 → { steamId, gameName, groups: Map<statId, Map<key, {earned, earnedtime}>>, oldStyle: Map<api, {earned, earnedtime}> }
export function parseUserStatsBin(buffer, appid) {
  const res = { steamId: null, gameName: '', groups: new Map(), oldStyle: new Map(), bitData: new Map() };
  let root;
  try { root = parseBinaryVdf(buffer, {}); } catch (e) { console.warn(`[ach] stats ${appid} 解析失败`, e); return res; }

  // 新版 cache 格式
  if (root.cache && typeof root.cache === 'object') {
    const cache = root.cache;
    for (const [statId, sec] of Object.entries(cache)) {
      if (!sec || typeof sec !== 'object') continue;
      if (sec.data !== undefined) res.bitData.set(statId, sec.data);
      if (sec.AchievementTimes && typeof sec.AchievementTimes === 'object') {
        const m = new Map();
        for (const [k, t] of Object.entries(sec.AchievementTimes)) {
          m.set(k, {
            earned: true,
            earnedtime: typeof t === 'number' ? t : parseInt(t, 10) || 0,
          });
        }
        res.groups.set(statId, m);
      }
    }
    return res;
  }

  // 旧式格式
  const node = (root && root[appid]) || root;
  if (node.steam_id !== undefined) {
    res.steamId = typeof node.steam_id === 'bigint' ? node.steam_id.toString() : String(node.steam_id);
  }
  if (node.game_name !== undefined) res.gameName = String(node.game_name);
  const stats = node.stats;
  if (!stats || typeof stats !== 'object') return res;
  for (const [api, rec] of Object.entries(stats)) {
    if (!rec || typeof rec !== 'object' || !('earned' in rec)) continue;
    res.oldStyle.set(api, {
      earned: rec.earned === 1 || rec.earned === '1' || rec.earned === true,
      earnedtime: typeof rec.earnedtime === 'number' ? rec.earnedtime
        : typeof rec.earnedtime === 'string' ? parseInt(rec.earnedtime, 10) : 0,
    });
  }
  return res;
}

// 对成就列表做 SAM 批量解锁检测
export function detectSamBatches(list) {
  const unlocked = (list || []).filter(a => a.earned && a.earnedtime > 0);
  if (unlocked.length === 0) return { batchTime: 0, fullBatch: false, batchCount: 0 };
  const byTime = new Map();
  for (const a of unlocked) {
    if (!byTime.has(a.earnedtime)) byTime.set(a.earnedtime, []);
    byTime.get(a.earnedtime).push(a);
  }
  let batchTime = 0, batchCount = 0;
  for (const [t, arr] of byTime) {
    if (arr.length >= 4 && t > batchTime) { batchTime = t; batchCount = arr.length; }
  }
  let fullBatch = false;
  for (const arr of byTime.values()) {
    if (arr.length === unlocked.length && unlocked.length >= 2) fullBatch = true;
  }
  return { batchTime, fullBatch, batchCount };
}

// 读取某账号全部成就
// 返回 Map<appid, {unlocked, total, list, sam, gameName}>
export async function loadAchievements(folderHandle, sid32, onProgress) {
  const out = new Map();
  const statsDir = await getDir(folderHandle, ['appcache', 'stats']);
  if (!statsDir) return out;

  const statsFiles = [];
  const prefix = `UserGameStats_${sid32}_`;
  for await (const [name, handle] of statsDir.entries()) {
    if (handle.kind === 'file' && name.startsWith(prefix) && name.endsWith('.bin')) statsFiles.push(name);
  }
  statsFiles.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

  let done = 0;
  for (const name of statsFiles) {
    const appid = name.slice(prefix.length, -4);
    if (!/^\d+$/.test(appid)) continue;
    const ck = `${sid32}:${appid}`;
    const cached = await storeGet('achievements', ck);
    let statMeta = null;
    try { statMeta = await statsDir.getFileHandle(name).then(fh => ({ size: fh.size, mtime: fh.lastModified })); } catch { /* 忽略 */ }
    if (cached && cached.list && statMeta && cached.size === statMeta.size && cached.mtime === statMeta.mtime) {
      out.set(appid, { unlocked: cached.unlocked, total: cached.total, list: cached.list, sam: cached.sam });
      done++;
      if (onProgress) onProgress({ done, total: statsFiles.length, label: `成就 ${done}/${statsFiles.length}` });
      continue;
    }
    const [statsBuf, schemaBuf] = await Promise.all([
      readFileBuffer(folderHandle, ['appcache', 'stats', name]),
      readFileBuffer(folderHandle, ['appcache', 'stats', `UserGameStatsSchema_${appid}.bin`]),
    ]);
    if (!statsBuf) { done++; continue; }
    const user = parseUserStatsBin(statsBuf, appid);
    let defsByGroup = new Map();
    if (schemaBuf) defsByGroup = parseSchemaBin(schemaBuf, appid);

    const list = [];
    const seen = new Set();

    function pushAch(key, def, earned, earnedtime) {
      if (seen.has(key)) return;
      seen.add(key);
      list.push({
        key,
        api: def ? def.api : String(key),
        name: def ? def.name : String(key),
        desc: def ? def.desc : '',
        hidden: def ? def.hidden : false,
        icon: def ? def.icon : null,
        iconGray: def ? def.iconGray : null,
        earned: !!earned,
        earnedtime: earnedtime || 0,
      });
    }

    if (user.groups.size > 0) {
      // 新版:按 statId 配对
      const allIds = new Set([...user.groups.keys(), ...defsByGroup.keys()]);
      const sortedIds = [...allIds].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
      for (const statId of sortedIds) {
        const times = user.groups.get(statId) || new Map();
        const defs = defsByGroup.get(statId) || new Map();
        const bits = user.bitData.get(statId);
        const keys = new Set([...defs.keys(), ...times.keys()]);
        const sortedKeys = [...keys].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
        for (const key of sortedKeys) {
          const def = defs.get(key) || null;
          const rec = times.get(key);
          let earned = !!rec;
          if (!earned && bits !== undefined && /^\d+$/.test(key)) {
            const bit = parseInt(key, 10);
            if (bit >= 0 && bit < 32) earned = ((bits >>> bit) & 1) === 1;
          }
          pushAch(`${statId}:${key}`, def, earned, rec ? rec.earnedtime : 0);
        }
      }
      // 有 statId 但两边都没有 bits/times 的(纯数值 stat)不进入成就列表
    } else if (user.oldStyle.size > 0) {
      // 旧式:按 api 名配对
      for (const [api, rec] of user.oldStyle) {
        let def = null;
        for (const defs of defsByGroup.values()) {
          for (const d of defs.values()) { if (d.api === api) { def = d; break; } }
          if (def) break;
        }
        pushAch(api, def, rec.earned, rec.earnedtime);
      }
      for (const defs of defsByGroup.values()) {
        for (const [key, d] of defs) {
          pushAch(key, d, false, 0);
        }
      }
    } else if (defsByGroup.size > 0) {
      // 无解锁记录,但补齐 schema 定义(全未解锁)
      for (const defs of defsByGroup.values()) {
        for (const [key, d] of defs) pushAch(key, d, false, 0);
      }
    }

    const unlocked = list.filter(a => a.earned).length;
    const sam = detectSamBatches(list);
    out.set(appid, { unlocked, total: list.length, list, sam, gameName: user.gameName });
    await storePut('achievements', ck, { unlocked, total: list.length, list, sam, size: statMeta && statMeta.size, mtime: statMeta && statMeta.mtime });
    done++;
    if (onProgress) onProgress({ done, total: statsFiles.length, label: `成就 ${done}/${statsFiles.length}` });
  }
  return out;
}
