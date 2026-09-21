// 扫描编排:把各数据源合并为 state.games / shotsIndex / savesIndex
import { state, emit } from '../state.js';
import { loadLoginUsers } from './loginusers.js';
import { loadLocalConfig, parseLocalConfigMeta } from './localconfig.js';
import { loadAppInfo } from './appinfo.js';
import { loadAchievements } from './achievements.js';
import { indexAllShots } from './screenshots.js';
import { indexSaves } from './saves.js';
import { kvSet } from '../storage.js';
import { readFileText } from '../fs/steam-folder.js';

const LIB_TYPES = new Set(['game', 'Game', 'demo', 'Demo', 'mod', 'Mod', 'video', 'Video']);

export async function scanAll(folderHandle, account, onProgress) {
  const report = (phase, label, done, total) => {
    if (onProgress) onProgress({ phase, label, done, total });
  };
  emit('scan:start');
  state.scanning = true;

  // 1. 游玩时长 + 账号元信息(等级)
  report('library', '读取游玩时长…', 0, 1);
  const [playtimes, meta] = await Promise.all([
    loadLocalConfig(folderHandle, account.sid32),
    readFileText(folderHandle, ['userdata', account.sid32, 'config', 'localconfig.vdf']).then(t => (t ? parseLocalConfigMeta(t) : { playerLevel: null })).catch(() => ({ playerLevel: null })),
  ]);
  if (meta.playerLevel) account.playerLevel = meta.playerLevel;
  report('library', `游玩时长 ${playtimes.size} 款`, 1, 1);

  // 2. 游戏名称
  report('library', '解析游戏名称库(appinfo.vdf,首次较慢)…', 0, 1);
  const { map: appinfo } = await loadAppInfo(folderHandle);
  report('library', `游戏名称 ${appinfo.size} 条`, 1, 1);

  // 3. 成就
  const achievements = await loadAchievements(folderHandle, account.sid32, (p) => {
    report('library', p.label, p.done, p.total);
  });

  // 4. 截图索引(全部账号)
  const shotsAgg = await indexAllShots(folderHandle, (p) => {
    report('screenshots', p.label, p.done, p.total);
  });

  // 5. 存档索引(选中账号)
  const savesAgg = await indexSaves(folderHandle, account.sid32, (p) => {
    report('saves', p.label, p.done, p.total);
  });

  // 合并库
  const games = new Map();
  const appids = new Set([...playtimes.keys(), ...achievements.keys()]);
  for (const appid of appids) {
    const pt = playtimes.get(appid) || {};
    const info = appinfo.get(appid) || { name: '', nameZh: '', type: '' };
    const ach = achievements.get(appid) || { unlocked: 0, total: 0, list: [], sam: { batchTime: 0, fullBatch: false, batchCount: 0 } };
    const type = info.type || '';
    // 库成员:有游玩时长或有成就数据;未知类型且有数据也纳入
    const isLibType = LIB_TYPES.has(type);
    const include = isLibType || (!type && (pt.playtimeMin > 0 || ach.list.length > 0));
    if (!include) continue;
    games.set(appid, {
      appid,
      name: info.nameZh || info.name || (ach.gameName || `App ${appid}`),
      nameEn: info.name || '',
      type: type || 'Game',
      playtimeMin: pt.playtimeMin || 0,
      playtime2wks: pt.playtime2wks || 0,
      lastPlayed: pt.lastPlayed || 0,
      playtimeDisconnected: pt.playtimeDisconnected || 0,
      cloudSyncState: pt.cloudSyncState || null,
      achUnlocked: ach.unlocked,
      achTotal: ach.total,
      achList: ach.list,
      sam: ach.sam,
    });
  }

  state.games = games;
  state.shotsIndex = new Map();
  for (const [appid, entry] of shotsAgg) {
    state.shotsIndex.set(appid, { accounts: entry.accounts, count: entry.count });
  }
  state.savesIndex = savesAgg;
  state.scanning = false;
  await kvSet('lastScan', { sid32: account.sid32, at: Date.now() });
  emit('scan:done');
  return { games, shotsAgg, savesAgg };
}
