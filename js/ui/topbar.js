// 顶栏:头像 + 昵称 + 等级 + 退出登录 / 连接按钮 / 分享按钮
import { state } from '../state.js';
import { el, letterAvatar, toast } from './ui.js';
import { openAccountPicker } from './account-picker.js';
import { generateShareCard } from './share-card.js';
import { clearLoginState } from '../openid.js';
import { forgetHandle } from '../fs/steam-folder.js';
import { kvDel } from '../storage.js';
import { route } from '../router.js';

export function initTopbar() {
  const chip = document.getElementById('user-chip');
  const btnConnect = document.getElementById('btn-connect');
  const btnShare = document.getElementById('btn-share');
  const btnLogout = document.getElementById('btn-logout');

  btnConnect.addEventListener('click', () => { openAccountPicker(); });
  btnShare.addEventListener('click', async () => {
    if (state.games.size === 0) { toast('先连接 Steam', 'err'); return; }
    toast('正在生成分享卡片…');
    try {
      await generateShareCard();
      toast('分享卡片已保存', 'ok');
    } catch (e) {
      console.error(e);
      toast('生成失败:' + (e.message || e), 'err');
    }
  });
  btnLogout.addEventListener('click', async () => {
    const { modal } = await import('./ui.js');
    modal({
      title: '退出登录',
      body: el('p', {}, '将清除本地保存的账号状态与缓存。是否同时忘记 Steam 文件夹授权?(忘记后下次需重新选择并授权)'),
      actions: [
        { label: '只退出,保留文件夹', color: 'purple', onClick: async () => { await doLogout(false); } },
        { label: '退出并忘记文件夹', color: 'coral', onClick: async () => { await doLogout(true); } },
        { label: '取消', color: 'cyan', onClick: () => {} },
      ],
    });
  });

  async function doLogout(forgetFolder) {
    state.account = null;
    state.login = null;
    state.games.clear();
    state.shotsIndex.clear();
    state.savesIndex.clear();
    state.purity = null;
    await clearLoginState();
    await kvDel('selectedSid64');
    if (forgetFolder) {
      await forgetHandle();
      state.folderHandle = null;
    }
    renderTopbar();
    toast('已退出登录', 'ok');
    location.hash = '#/library';
    setTimeout(() => route(), 50);
  }

  renderTopbar();
}

export function renderTopbar() {
  const chip = document.getElementById('user-chip');
  const btnConnect = document.getElementById('btn-connect');
  const btnShare = document.getElementById('btn-share');
  if (state.account) {
    chip.hidden = false;
    const old = document.getElementById('user-avatar');
    const av = letterAvatar(state.account.sid64, state.account.personaName, 38);
    av.id = 'user-avatar';
    if (old) old.replaceWith(av); else chip.prepend(av);
    document.getElementById('user-name').textContent = state.account.personaName || state.account.accountName || 'Steam 玩家';
    const sub = document.getElementById('user-sub');
    sub.innerHTML = '';
    if (state.account.playerLevel) {
      sub.appendChild(el('span', { class: 'level-badge' }, `Lv.${state.account.playerLevel}`));
    }
    sub.appendChild(el('span', {}, state.login ? '已通过 Steam 官方验证' : '本地模式'));
    btnConnect.textContent = '切换账号';
    btnShare.hidden = false;
  } else {
    chip.hidden = true;
    btnConnect.textContent = '连接 Steam';
    btnShare.hidden = true;
  }
}
