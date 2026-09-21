// 本地存档:列表/全选/备份到桌面(可改路径)/文件详情
import { state } from '../state.js';
import { el, toast, iconImg, searchBox } from './ui.js';
import { fmtFileTime, fmtSize, sanitizeName } from '../logic/format.js';
import { kvGet, kvSet } from '../storage.js';

const KV_DEST = 'savesDestHandle';
const MAX_ZIP_BYTES = 2 * 1024 * 1024 * 1024; // 单包上限 2GB(内存保护)

export async function savesView() {
  if (state.savesIndex.size === 0) {
    return el('div', { class: 'empty-state' }, el('div', { class: 'big' }, '💾'), '没有找到本地存档(存档来自 Steam 云存档的本地缓存 userdata/<账号>/<游戏>/remote)');
  }
  const wrap = el('div');
  const host = el('div');
  const selected = new Set();
  let query = '';

  const destChip = el('span', { class: 'dest-chip' }, await describeDest());

  function render() {
    host.innerHTML = '';
    const entries = [...state.savesIndex.entries()]
      .map(([appid, v]) => ({ appid, ...v, name: gameName(appid) }))
      .filter(e => !query || e.name.toLowerCase().includes(query) || e.appid.includes(query))
      .sort((a, b) => b.latest - a.latest);
    if (entries.length === 0) {
      host.appendChild(el('div', { class: 'empty-state' }, '没有匹配的存档'));
      return;
    }
    const list = el('div', { class: 'saves-list' });
    entries.forEach((e, i) => {
      const cb = el('div', { class: 'checkbox' + (selected.has(e.appid) ? ' on' : '') }, '✓');
      cb.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (selected.has(e.appid)) selected.delete(e.appid); else selected.add(e.appid);
        cb.classList.toggle('on', selected.has(e.appid));
        refreshBar();
      });
      list.appendChild(el('div', { class: 'save-row', style: { animationDelay: Math.min(i * 25, 500) + 'ms' }, onclick: () => { location.hash = '#/saves/' + e.appid; } },
        cb,
        el('div', { class: 'save-icon' }, iconImg(e.appid, e.name)),
        el('div', { class: 'save-info' },
          el('div', { class: 'save-name' }, e.name),
          el('div', { class: 'save-meta' },
            el('span', {}, `存档数量 `, el('b', {}, String(e.count))),
            el('span', {}, `最新存档时间:${fmtFileTime(e.latest)}`),
            el('span', {}, fmtSize(e.totalSize)),
          ),
        ),
      ));
    });
    host.appendChild(list);
  }

  // 工具行:全选 + 保存 + 目标位置
  const barHost = el('div');
  const allCb = el('div', { class: 'checkbox' }, '✓');
  const bar = el('div', { class: 'save-actions' },
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }, onclick: toggleAll }, allCb, el('span', { style: { fontSize: '13px' } }, '全选')),
    el('button', { class: 'candy-btn candy-mint', onclick: () => backupSelected(selected) }, '保存所选'),
    el('button', { class: 'candy-btn candy-cyan', onclick: changeDest }, '更改保存位置'),
    destChip,
  );
  barHost.appendChild(bar);

  function toggleAll() {
    const all = [...state.savesIndex.keys()];
    if (selected.size === all.length) { selected.clear(); allCb.classList.remove('on'); }
    else { all.forEach(k => selected.add(k)); allCb.classList.add('on'); }
    refreshBar();
    render();
  }

  function refreshBar() {
    allCb.classList.toggle('on', selected.size > 0 && selected.size === state.savesIndex.size);
    bar.querySelector('.candy-mint').textContent = `保存所选 (${selected.size})`;
  }

  wrap.appendChild(el('div', { class: 'saves-hint' }, '💡 换机 / 备份存档用 —— 勾选游戏后点「保存所选」,按游戏打包到目标文件夹'));
  wrap.appendChild(barHost);
  wrap.appendChild(el('div', { class: 'toolbar' }, searchBox((q) => { query = q; render(); }, '搜索游戏…')));
  wrap.appendChild(host);
  render();
  refreshBar();
  return wrap;
}

function gameName(appid) {
  const g = state.games.get(appid);
  return g ? g.name : `App ${appid}`;
}

async function describeDest() {
  const h = await kvGet(KV_DEST);
  if (h) return `保存到:${h.name || '已选文件夹'}`;
  return '保存到:桌面(首次保存时选择)';
}

async function changeDest() {
  if (!window.showDirectoryPicker) { toast('浏览器不支持,请使用 Chrome/Edge', 'err'); return; }
  try {
    const h = await window.showDirectoryPicker({ id: 'steamporter-saves', mode: 'readwrite' });
    await kvSet(KV_DEST, h);
    toast(`保存位置已改为:${h.name}`, 'ok');
    const chip = document.querySelector('.dest-chip');
    if (chip) chip.textContent = `保存到:${h.name}`;
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    toast('选择失败', 'err');
  }
}

async function backupSelected(selected) {
  if (selected.size === 0) { toast('先勾选要备份的游戏', 'err'); return; }
  if (!window.JSZip) { toast('JSZip 未加载', 'err'); return; }
  let dest = await kvGet(KV_DEST);
  if (!dest) {
    try {
      dest = await window.showDirectoryPicker({ id: 'steamporter-saves', mode: 'readwrite' });
      await kvSet(KV_DEST, dest);
    } catch { return; }
  }
  toast(`开始备份 ${selected.size} 个游戏的存档…`);
  let ok = 0, fail = 0;
  for (const appid of selected) {
    const info = state.savesIndex.get(appid);
    if (!info) continue;
    const name = gameName(appid);
    try {
      const zip = new JSZip();
      const folder = zip.folder(sanitizeName(name));
      let totalBytes = 0;
      for (const f of info.files) {
        totalBytes += f.size;
        if (totalBytes > MAX_ZIP_BYTES) throw new Error('TOO_BIG');
      }
      for (const f of info.files) {
        const fh = await getSaveFileHandle(appid, f.name);
        if (!fh) continue;
        folder.file(f.name, await fh.getFile());
      }
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      const fname = `${sanitizeName(name)}-存档备份.zip`;
      let outHandle;
      try {
        outHandle = await dest.getFileHandle(fname, { create: true });
      } catch {
        outHandle = await dest.getFileHandle(fname + `-${Date.now()}`, { create: true });
      }
      const writable = await outHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      ok++;
    } catch (e) {
      console.warn('[saves] 备份失败', appid, e);
      fail++;
    }
  }
  toast(`备份完成:成功 ${ok} 个${fail ? `,失败 ${fail} 个` : ''}`, fail ? 'err' : 'ok');
}

async function getSaveFileHandle(appid, fname) {
  if (!state.account || !state.folderHandle) return null;
  try {
    const dir = await state.folderHandle.getDirectoryHandle('userdata')
      .then(d => d.getDirectoryHandle(state.account.sid32))
      .then(d => d.getDirectoryHandle(appid))
      .then(d => d.getDirectoryHandle('remote'));
    return await dir.getFileHandle(fname);
  } catch {
    return null;
  }
}

export async function savesGameView([appid]) {
  const info = state.savesIndex.get(appid);
  if (!info) return el('div', { class: 'empty-state' }, '没有这款游戏的存档数据');
  const name = gameName(appid);
  const wrap = el('div');
  wrap.appendChild(el('button', { class: 'ghost-btn back-btn', onclick: () => { location.hash = '#/saves'; } }, '← 返回存档列表'));
  wrap.appendChild(el('div', { style: { marginBottom: '14px', fontSize: '19px', fontWeight: '700' } }, `${name} · ${info.count} 个文件 · ${fmtSize(info.totalSize)}`));

  const table = el('table', { class: 'file-table' },
    el('thead', {}, el('tr', {}, el('th', {}, '文件名'), el('th', {}, '修改时间'), el('th', {}, '大小'))),
  );
  const tbody = el('tbody');
  for (const f of info.files) {
    tbody.appendChild(el('tr', {},
      el('td', { class: 'f-name' }, f.name),
      el('td', { class: 'f-time', title: 'Steam 云存档记录时间' }, fmtFileTime(f.lastModified)),
      el('td', { class: 'f-size' }, fmtSize(f.size)),
    ));
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  wrap.appendChild(el('div', { style: { marginTop: '14px', fontSize: '11.5px', color: 'var(--text-faint)' } }, '时间来自 Steam 云存档缓存(remotecache),与游戏内实际存档时间一致'));
  return wrap;
}
