// DOM 构建与通用 UI 组件
import { coverUrl, initialOf, hueOf, sanitizeName } from '../logic/format.js';

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// Toast
export function toast(msg, type = '', ms = 3200) {
  const root = document.getElementById('toast-root');
  const t = el('div', { class: 'toast ' + type }, msg);
  root.appendChild(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

// 模态
export function modal({ title, body, actions }) {
  const root = document.getElementById('modal-root');
  const backdrop = el('div', { class: 'modal-backdrop' });
  const box = el('div', { class: 'modal' });
  if (title) box.appendChild(el('h2', {}, title));
  if (body) box.appendChild(body);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  const actRow = el('div', { class: 'modal-actions' });
  for (const a of actions || []) {
    actRow.appendChild(el('button', {
      class: 'candy-btn ' + (a.color ? 'candy-' + a.color : 'candy-purple'),
      onclick: () => { const r = a.onClick && a.onClick(close); if (r !== false) close(); },
    }, a.label));
  }
  if (actions && actions.length) box.appendChild(actRow);
  backdrop.appendChild(box);
  root.appendChild(backdrop);
  return { close, box };
}

// 字母头像(糖果色)
export function letterAvatar(sid64, name, size = 38) {
  const hue = hueOf(sid64);
  const av = el('div', {
    class: 'avatar',
    style: {
      width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.45) + 'px',
      background: `linear-gradient(135deg, hsl(${hue},72%,62%), hsl(${(hue + 60) % 360},72%,52%))`,
    },
  }, initialOf(name));
  return av;
}

// 封面图(带渐变占位兜底)
export function coverImg(appid, name = '', { cls = '', alt = '' } = {}) {
  const wrap = el('div', { class: 'cover-wrap ' + cls });
  const img = el('img', { loading: 'lazy', alt: alt || name || appid, draggable: 'false' });
  const fb = el('div', { class: 'cover-fallback' }, initialOf(name || appid));
  img.addEventListener('error', () => { img.remove(); });
  img.src = coverUrl(appid);
  wrap.appendChild(fb);
  wrap.appendChild(img);
  return wrap;
}

// 小图标(方形,用于相册/存档列表)
export function iconImg(appid, name = '', { cls = '' } = {}) {
  const box = el('div', { class: cls });
  const img = el('img', { loading: 'lazy', alt: name || appid, draggable: 'false' });
  const fb = el('div', { class: 'cover-fallback' }, initialOf(name || appid));
  img.addEventListener('error', () => { img.remove(); });
  img.src = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
  box.appendChild(fb);
  box.appendChild(img);
  return box;
}

// 数字滚动(easeOutCubic)
export function countUp(targetEl, to, { duration = 1200, format = (n) => Math.round(n).toLocaleString('zh-CN') } = {}) {
  if (!targetEl) return;
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    targetEl.textContent = format(0 + (to - 0) * eased);
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// 搜索框
export function searchBox(onInput, placeholder = '搜索游戏…') {
  return el('div', { class: 'search-input' },
    el('svg', { viewBox: '0 0 24 24', width: '15', height: '15', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' },
      el('circle', { cx: '11', cy: '11', r: '7' }),
      el('path', { d: 'M20 20l-4-4' }),
    ),
    el('input', {
      type: 'text', placeholder,
      oninput: (e) => onInput(e.target.value.trim().toLowerCase()),
    }),
  );
}

export { sanitizeName };
