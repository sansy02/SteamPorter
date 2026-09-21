// hash 路由
import { emit } from './state.js';

const routes = new Map();

export function register(path, handler) {
  routes.set(path, handler);
}

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  if (!h) return { name: 'library', params: [] };
  const parts = h.split('/').filter(Boolean);
  return { name: parts[0] || 'library', params: parts.slice(1) };
}

export function navigate(path) {
  if (location.hash === '#' + path) {
    route();
  } else {
    location.hash = '#' + path;
  }
}

export function currentRoute() {
  return parseHash();
}

export async function route() {
  const { name, params } = parseHash();
  const handler = routes.get(name);
  const view = document.getElementById('view');
  view.innerHTML = '';
  if (!handler) {
    view.innerHTML = '<div class="empty-state"><div class="big">🧭</div>页面不存在</div>';
    return;
  }
  const el = await handler(params);
  if (el instanceof Node) {
    el.classList.add('view-enter');
    view.appendChild(el);
  }
  emit('route', { name, params });
  // 侧边栏高亮
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.route === '#/' + name);
  });
}

window.addEventListener('hashchange', route);
