// 截图:相册墙 → 游戏内网格 → lightbox,多选 ZIP 下载
import { state } from '../state.js';
import { el, toast, iconImg, searchBox } from './ui.js';
import { listGameShots } from '../data/screenshots.js';
import { sanitizeName } from '../logic/format.js';
import { openLightbox } from './lightbox.js';

const MAX_ZIP = 200;

export async function screenshotsView() {
  if (state.shotsIndex.size === 0) {
    return el('div', { class: 'empty-state' }, el('div', { class: 'big' }, '📸'), '本地没有找到截图(截图保存在 Steam 文件夹的 userdata 下,授权 Steam 文件夹后即可查看)');
  }
  const wrap = el('div');
  const host = el('div');
  let query = '';

  function render() {
    host.innerHTML = '';
    const entries = [...state.shotsIndex.entries()]
      .map(([appid, v]) => ({ appid, name: gameName(appid), ...v }))
      .filter(e => !query || e.name.toLowerCase().includes(query) || e.appid.includes(query))
      .sort((a, b) => b.count - a.count);
    if (entries.length === 0) {
      host.appendChild(el('div', { class: 'empty-state' }, '没有匹配的游戏'));
      return;
    }
    const grid = el('div', { class: 'album-grid' });
    entries.forEach((e, i) => {
      grid.appendChild(el('div', {
        class: 'album-card', style: { animationDelay: Math.min(i * 26, 500) + 'ms' },
        onclick: () => { location.hash = '#/shots/' + e.appid; },
      },
        el('div', { class: 'album-icon' }, iconImg(e.appid, e.name)),
        el('div', { class: 'album-name', title: e.name }, e.name),
        el('div', { class: 'album-count' }, `${e.count} 张截图 · ${e.accounts.length} 个账号`),
      ));
    });
    host.appendChild(grid);
  }

  wrap.appendChild(el('div', { class: 'toolbar' }, searchBox((q) => { query = q; render(); }, '搜索游戏…')));
  wrap.appendChild(host);
  render();
  return wrap;
}

function gameName(appid) {
  const g = state.games.get(appid);
  return g ? g.name : `App ${appid}`;
}

export async function shotsGameView([appid]) {
  if (!state.folderHandle) return el('div', { class: 'empty-state' }, '未连接 Steam 文件夹');
  const info = state.shotsIndex.get(appid) || { accounts: [], count: 0 };
  const wrap = el('div');
  wrap.appendChild(el('button', { class: 'ghost-btn back-btn', onclick: () => { location.hash = '#/screenshots'; } }, '← 返回相册'));

  // 懒加载全部账号的截图列表
  const shots = [];
  for (const sid32 of info.accounts) {
    const list = await listGameShots(state.folderHandle, sid32, appid);
    shots.push(...list);
  }
  shots.sort((a, b) => a.name.localeCompare(b.name));

  if (shots.length === 0) {
    wrap.appendChild(el('div', { class: 'empty-state' }, '这个游戏没有本地截图'));
    return wrap;
  }

  const name = gameName(appid);
  wrap.appendChild(el('div', { style: { marginBottom: '16px', fontSize: '19px', fontWeight: '700' } }, `${name} · ${shots.length} 张`));

  // 多选状态
  const selected = new Set();
  const grid = el('div', { class: 'shot-grid' });
  const items = [];
  const objUrls = [];
  const MAX_LIVE = 300;

  const bar = el('div', { class: 'selection-bar', style: { display: 'none' } },
    el('span', { id: 'sel-count', style: { fontWeight: '700' } }, '0 张已选'),
    el('button', { class: 'candy-btn candy-mint', onclick: async () => { await downloadZip(selected, shots, name); refreshSel(); } }, '保存 ZIP'),
    el('button', { class: 'ghost-btn', onclick: () => { selected.clear(); refreshSel(); } }, '清空选择'),
  );

  function refreshSel() {
    bar.style.display = selected.size > 0 ? 'flex' : 'none';
    bar.querySelector('#sel-count').textContent = `${selected.size} 张已选`;
    items.forEach(({ item, name }) => {
      item.classList.toggle('selected', selected.has(name));
      const cb = item.querySelector('.shot-check');
      if (cb) cb.textContent = selected.has(name) ? '✓' : '';
    });
  }

  function toggle(name) {
    if (selected.has(name)) selected.delete(name);
    else selected.add(name);
    refreshSel();
  }

  const observer = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const { item, name, handle } = en.target.__shotData || {};
      observer.unobserve(en.target);
      const img = en.target.querySelector('img');
      if (!img || img.dataset.loaded) continue;
      if (objUrls.length >= MAX_LIVE) {
        const old = objUrls.shift();
        URL.revokeObjectURL(old.url);
        const oldImg = grid.querySelector(`[data-url="${old.url}"]`);
        if (oldImg) { oldImg.removeAttribute('src'); oldImg.dataset.loaded = ''; }
      }
      handle.getFile().then(file => {
        const url = URL.createObjectURL(file);
        objUrls.push({ url });
        img.dataset.url = url;
        img.dataset.loaded = '1';
        img.src = url;
      }).catch(() => {});
    }
  }, { rootMargin: '400px' });

  shots.forEach((s, i) => {
    const item = el('div', { class: 'shot-item', onclick: () => { if (selected.size > 0) toggle(s.name); else openLightbox(shots, i); } },
      el('img', { alt: s.name }),
      el('div', { class: 'shot-check' }),
      el('div', { class: 'shot-account', style: { background: `hsl(${Number(BigInt(s.sid32) % 360n)},70%,60%)` }, title: `账号 ${s.sid32}` }),
    );
    item.__shotData = { item, name: s.name, handle: s.handle };
    items.push({ item, name: s.name });
    observer.observe(item);
    grid.appendChild(item);
  });

  wrap.appendChild(bar);
  wrap.appendChild(grid);
  return wrap;
}

async function downloadZip(selected, shots, gameNameStr) {
  const list = shots.filter(s => selected.has(s.name));
  if (list.length === 0) { toast('先选择截图', 'err'); return; }
  if (list.length > MAX_ZIP) { toast(`一次最多打包 ${MAX_ZIP} 张,请分批保存`, 'err'); return; }
  if (!window.JSZip) { toast('JSZip 未加载', 'err'); return; }
  toast(`正在打包 ${list.length} 张截图…`);
  const zip = new JSZip();
  const folder = zip.folder(sanitizeName(gameNameStr));
  const used = new Set();
  for (const s of list) {
    let base = s.name.replace(/\.[^.]+$/, '');
    base = sanitizeName(base);
    let fname = base;
    let n = 1;
    while (used.has(fname)) fname = `${base}_${n++}`;
    used.add(fname);
    const ext = (s.name.match(/\.[^.]+$/) || ['.jpg'])[0].toLowerCase();
    const file = await s.handle.getFile();
    folder.file(fname + ext, file);
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${sanitizeName(gameNameStr)}-截图-${list.length}张.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  toast(`已打包 ${list.length} 张截图`, 'ok');
  selected.clear();
}
