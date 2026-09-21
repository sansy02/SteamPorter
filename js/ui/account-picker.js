// 连接 Steam:选择文件夹 → 识别账号 → 选号 → 扫描
import { state } from '../state.js';
import { el, toast, modal, letterAvatar } from './ui.js';
import {
  pickSteamFolder, verifySteamFolder, persistHandle, restoreFolderHandle,
  requestPermission, isSupported, getSelectedSid64, setSelectedSid64,
  listDir,
} from '../fs/steam-folder.js';
import { loadLoginUsers } from '../data/loginusers.js';
import { scanAll } from '../data/index.js';
import { loadPrices } from '../logic/value.js';
import { startOpenIdLogin, saveLoginState } from '../openid.js';
import { route } from '../router.js';
import { renderTopbar } from './topbar.js';

export async function openAccountPicker() {
  if (!isSupported()) {
    toast('请使用桌面版 Chrome / Edge 浏览器', 'err');
    return;
  }
  let folder = state.folderHandle;
  if (!folder) {
    folder = await restoreFolderHandle();
    if (folder && !(await requestPermission(folder))) {
      toast('需要重新授权访问 Steam 文件夹', 'err');
      return;
    }
  }
  if (!folder) {
    try {
      folder = await pickSteamFolder();
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      if (e && e.message === 'NOT_STEAM_FOLDER') { toast('这看起来不是 Steam 文件夹(需要包含 userdata、steamapps)', 'err'); return; }
      toast('选择失败:' + (e.message || e), 'err');
      return;
    }
  }
  state.folderHandle = folder;

  const accounts = await loadLoginUsers(folder);
  // 补充 userdata 中存在但 loginusers 未记录的账号
  const userdataSids = await listDir(folder, ['userdata']).then(list => list.filter(e => e.kind === 'directory' && /^\d+$/.test(e.name)).map(e => e.name));
  for (const sid32 of userdataSids) {
    if (!accounts.some(a => a.sid32 === sid32)) {
      accounts.push({ sid64: sid32To64Safe(sid32), sid32, accountName: '', personaName: `未知账号 ${sid32.slice(-4)}` });
    }
  }
  state.accounts = accounts;

  const prev = await getSelectedSid64();
  const listBox = el('div', { class: 'account-list' },
    accounts.map(a => {
      const item = el('div', { class: 'account-item', onclick: () => select(a) },
        letterAvatar(a.sid64, a.personaName, 32),
        el('div', {},
          el('div', { class: 'ac-name' }, a.personaName),
          el('div', { class: 'ac-id' }, a.sid64),
        ),
      );
      return item;
    }),
  );

  const m = modal({
    title: '选择账号',
    body: el('div', {},
      el('p', { style: { marginBottom: '8px' } }, `在 ${accounts.length} 个本地账号中,选择要读取的账号:`),
      listBox,
      el('div', { style: { marginTop: '16px', display: 'flex', gap: '10px' } },
        el('button', { class: 'candy-btn candy-cyan', onclick: (e) => { e.stopPropagation(); m.close(); startOpenIdLogin(); } }, 'Steam 扫码登录(官方验证)'),
      ),
    ),
    actions: [{ label: '取消', color: 'purple', onClick: () => {} }],
  });

  async function select(a) {
    m.close();
    state.account = { ...a, playerLevel: null };
    await setSelectedSid64(a.sid64);
    renderTopbar();
    toast(`已选择 ${a.personaName},开始读取数据…`);
    await showScanAndRun(a);
  }
}

function sid32To64Safe(sid32) {
  try { return (BigInt(sid32) + 76561197960265728n).toString(); }
  catch { return '0'; }
}

export async function showScanAndRun(account) {
  const overlay = document.getElementById('scan-overlay');
  const phaseEl = document.getElementById('scan-phase');
  const fillEl = document.getElementById('scan-bar-fill');
  const detailEl = document.getElementById('scan-detail');
  overlay.hidden = false;
  fillEl.style.width = '0%';
  let currentPhase = '';

  const onProgress = (p) => {
    if (p.phase && p.phase !== currentPhase) {
      currentPhase = p.phase;
      phaseEl.textContent = { library: '读取游戏库数据…', screenshots: '索引截图…', saves: '索引存档…' }[p.phase] || p.phase;
    }
    if (p.total > 0) {
      const pct = Math.round((p.done / p.total) * 100);
      fillEl.style.width = pct + '%';
      detailEl.textContent = p.label || '';
    } else {
      detailEl.textContent = p.label || '';
    }
  };

  try {
    await scanAll(state.folderHandle, account, onProgress);
    await loadPrices().catch(() => {});
  } catch (e) {
    console.error('[scan]', e);
    toast('读取失败:' + (e.message || e), 'err', 6000);
  } finally {
    overlay.hidden = true;
  }
  renderTopbar();
  route();
}

// 扫码登录回调处理(主窗口)
export async function handleOpenIdResult(result) {
  if (!result) return;
  if (result.cancelled) { toast('已取消登录'); return; }
  if (result.error) { toast('登录失败:返回数据异常'); return; }
  const login = { sid64: result.sid64, at: Date.now() };
  await saveLoginState(login);
  state.login = login;
  toast('Steam 官方验证成功 ✓', 'ok');
  // 与本地账号匹配:如果已连接文件夹且登录账号在本地,自动选为当前账号
  if (state.folderHandle && !state.account) {
    const match = state.accounts.find(a => a.sid64 === result.sid64);
    if (match) {
      state.account = { ...match, playerLevel: null };
      await setSelectedSid64(match.sid64);
      renderTopbar();
      await showScanAndRun(match);
      return;
    }
  }
  renderTopbar();
}
