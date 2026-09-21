// 全屏查看器:方向键/Esc/预加载相邻图
import { el } from './ui.js';

export function openLightbox(shots, index) {
  let i = index;
  const urls = [];
  const MAX_LIVE = 6; // 当前+前后各预载 2 张,超出回收

  const box = el('div', { class: 'lightbox' });
  const imgEl = el('img', { alt: '' });
  const count = el('span', { class: 'lb-count' });

  const closeBtn = el('button', { class: 'lb-close', title: '关闭 (Esc)', onclick: close }, '✕');
  const prevBtn = el('button', { class: 'lb-nav lb-prev', title: '上一张 (←)', onclick: () => move(-1) }, '‹');
  const nextBtn = el('button', { class: 'lb-nav lb-next', title: '下一张 (→)', onclick: () => move(1) }, '›');

  box.appendChild(el('div', { class: 'lb-top' }, count, closeBtn));
  box.appendChild(prevBtn);
  box.appendChild(nextBtn);
  box.appendChild(imgEl);
  document.body.appendChild(box);

  function recycle() {
    for (const u of urls.splice(0, Math.max(0, urls.length - MAX_LIVE))) URL.revokeObjectURL(u);
  }

  function show() {
    count.textContent = `${i + 1} / ${shots.length} · ${shots[i].name}`;
    const s = shots[i];
    s.handle.getFile().then(f => {
      const url = URL.createObjectURL(f);
      urls.push(url);
      imgEl.src = url;
      recycle();
    }).catch(() => {});
    // 预加载相邻
    [-1, 1].forEach(d => {
      const j = i + d;
      if (j >= 0 && j < shots.length) {
        shots[j].handle.getFile().then(f => { urls.push(URL.createObjectURL(f)); recycle(); }).catch(() => {});
      }
    });
  }

  function move(d) {
    const j = i + d;
    if (j < 0 || j >= shots.length) return;
    i = j;
    show();
  }

  function close() {
    document.removeEventListener('keydown', onKey);
    for (const u of urls) URL.revokeObjectURL(u);
    box.remove();
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') move(-1);
    else if (e.key === 'ArrowRight') move(1);
  }
  document.addEventListener('keydown', onKey);
  show();
}
