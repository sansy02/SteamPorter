// 账号价值计算(内置价格表)+ 数字滚动动画
import { state } from '../state.js';
import { kvGet, kvSet } from '../storage.js';
import { fmtYuan } from './format.js';

const PRICES_URL = 'data/prices.json';
const KV_PRICES = 'pricesCache';

export async function loadPrices() {
  try {
    const res = await fetch(PRICES_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.prices = { meta: data._meta || {}, map: data.prices || {} };
    await kvSet(KV_PRICES, { meta: state.prices.meta, map: state.prices.map });
    return state.prices;
  } catch {
    // 离线兜底:用缓存
    const cached = await kvGet(KV_PRICES);
    if (cached && cached.map) {
      state.prices = { meta: cached.meta || {}, map: cached.map };
      return state.prices;
    }
    state.prices = { meta: {}, map: {} };
    return state.prices;
  }
}

// 计算库价值:返回 {sumFen, covered, missing}
export function calcValue(games) {
  const prices = state.prices && state.prices.map ? state.prices.map : {};
  let sumFen = 0, covered = 0, missing = 0;
  for (const g of games.values()) {
    const p = prices[g.appid];
    if (p && p.price > 0) { sumFen += p.price; covered++; }
    else missing++;
  }
  return { sumFen, covered, missing };
}

export function fmtValue(sumFen) {
  return '¥ ' + fmtYuan(sumFen);
}

// 数字滚动(rAF + easeOutCubic),el 为 DOM 节点,to 为最终数字
export function countUp(el, to, { duration = 1200, format = (n) => Math.round(n).toLocaleString('zh-CN') } = {}) {
  if (!el) return;
  const start = performance.now();
  const from = 0;
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = format(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
