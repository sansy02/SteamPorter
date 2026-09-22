// 启动:门禁 → OpenID 回调 → 恢复登录态 → 路由
import { state } from './state.js';
import { register, route, navigate } from './router.js';
import { el } from './ui/ui.js';
import { isSupported, restoreFolderHandle, requestPermission, getSelectedSid64 } from './fs/steam-folder.js';
import { loadLoginUsers } from './data/loginusers.js';
import { initTopbar, renderTopbar } from './ui/topbar.js';
import { openAccountPicker, showScanAndRun, handleOpenIdResult } from './ui/account-picker.js';
import { consumeOpenIdResult, writeLoginHandoff, readLoginHandoff, loadLoginState } from './openid.js';
import { libraryView } from './ui/library-view.js';
import { gameDetailView } from './ui/game-detail-view.js';
import { screenshotsView, shotsGameView } from './ui/screenshots-view.js';
import { savesView, savesGameView } from './ui/saves-view.js';
import { purityView } from './ui/purity-view.js';

// 视图注册
register('library', () => (state.account ? libraryView() : guideView()));
register('game', (p) => (state.account ? gameDetailView(p) : guideView()));
register('screenshots', () => (state.account ? screenshotsView() : guideView()));
register('shots', (p) => (state.account ? shotsGameView(p) : guideView()));
register('saves', (p) => (state.account ? (p && p[0] ? savesGameView(p) : savesView()) : guideView()));
register('purity', () => (state.account ? purityView() : guideView()));

function guideView() {
  const supported = isSupported();
  const wrap = el('div', { class: 'guide-wrap' },
    el('div', { class: 'guide-logo' },
      el('svg', { viewBox: '0 0 100 100', width: '74', height: '74' },
        el('circle', { cx: '50', cy: '50', r: '42', fill: 'url(#g1)' }),
        el('circle', { cx: '38', cy: '42', r: '12', fill: '#0d0f14' }),
        el('rect', { x: '52', y: '50', width: '26', height: '10', rx: '5', fill: '#0d0f14', transform: 'rotate(-20 65 55)' }),
        el('defs', {}, el('linearGradient', { id: 'g1', x1: '0', y1: '0', x2: '1', y2: '1' },
          el('stop', { offset: '0', 'stop-color': '#ff6b6b' }), el('stop', { offset: '1', 'stop-color': '#a78bfa' }),
        )),
      ),
    ),
    el('div', { class: 'guide-title' }, '你的 Steam 终端,', el('b', {}, '数据只留在本地')),
    el('div', { class: 'guide-sub', html: '库价值 · 真实时长 · 成就 · 截图 · 存档备份 · 挂机检测<br>不碰密码、不上传任何数据、无服务器' }),
    el('div', { class: 'guide-cards' },
      el('div', { class: 'guide-card' },
        el('h3', {}, '🔌 连接 Steam 文件夹'),
        el('p', {}, '授权一次 Steam 安装目录(浏览器本地读取,不联网)。自动识别本机所有账号,读取游玩时长、成就、截图与存档。'),
      ),
      el('div', { class: 'guide-card' },
        el('h3', {}, '📱 Steam 扫码登录'),
        el('p', {}, '可选:跳转 Steam 官方登录页,用 Steam App 扫码确认。密码只输入在官方页面,本站全程拿不到任何凭据。'),
      ),
    ),
    el('div', { class: 'guide-actions' },
      supported
        ? el('button', { class: 'candy-btn candy-coral', onclick: () => openAccountPicker() }, '连接 Steam')
        : el('div', { class: 'gate-warn' }, '⚠️ 当前浏览器不支持读取本地文件,请使用桌面版 Chrome 或 Edge 打开。'),
    ),
    el('div', { class: 'guide-note', html: '安全说明:纯静态网站,无服务器、无数据库。所有数据只在你的浏览器与本地文件之间流转。<br>截图与存档的打包、备份全部在本地完成。封面图加载自 Steam 官方 CDN。' }),
  );
  return wrap;
}

// 导航按钮
function initNav() {
  document.querySelectorAll('.nav-item').forEach(b => {
    b.addEventListener('click', () => navigate(b.dataset.route.slice(1)));
  });
}

async function boot() {
  initNav();
  initTopbar();
  route();

  // 1) OpenID 回调处理(登录弹窗或主窗口跳回)
  const openidResult = consumeOpenIdResult();
  if (openidResult) {
    writeLoginHandoff(openidResult);
    if (window.opener || (openidResult && location.search.includes('openid.mode'))) {
      // 弹窗窗口:写入握手后关闭
      setTimeout(() => window.close(), 120);
      return;
    }
  }
  // 主窗口:监听弹窗握手
  window.addEventListener('storage', (e) => {
    if (e.key === 'steamporter-openid' && e.newValue) {
      const res = readLoginHandoff();
      if (res) handleOpenIdResult(res);
    }
  });
  // 主窗口自身跳回(直接登录)
  if (openidResult) {
    const res = readLoginHandoff();
    if (res) handleOpenIdResult(res);
  }

  // 2) 恢复登录态
  const savedLogin = await loadLoginState();
  if (savedLogin && savedLogin.sid64) state.login = savedLogin;

  const folder = await restoreFolderHandle();
  const savedSid64 = await getSelectedSid64();
  if (folder && savedSid64) {
    state.folderHandle = folder;
    let granted = false;
    try {
      granted = await requestPermission(folder);
    } catch { granted = false; }
    if (granted) {
      const accounts = await loadLoginUsers(folder);
      state.accounts = accounts;
      const acc = accounts.find(a => a.sid64 === savedSid64);
      if (acc) {
        state.account = { ...acc, playerLevel: null };
        renderTopbar();
        showScanAndRun(acc); // 内部会 route()
        return;
      }
    }
  }

  // 3) 引导页
  route();
}

boot().catch(e => console.error('[boot]', e));
