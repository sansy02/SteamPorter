// 我的库:统计卡 + 全部/曾经玩过 + 排序/搜索 + 封面网格
import { state } from '../state.js';
import { el, toast, coverImg, searchBox, countUp } from './ui.js';
import { fmtHours, fmtHoursCompact, fmtDate } from '../logic/format.js';
import { calcValue, fmtValue, loadPrices } from '../logic/value.js';

// 「曾经玩过」判定:① 有解锁成就 ② 无 4+ 同秒批量解锁 ③ 有游玩时长
export function isActuallyPlayed(g) {
  const unlocked = (g.achList || []).filter(a => a.earned && a.earnedtime > 0).length;
  if (unlocked < 1) return false;
  const sam = g.sam || {};
  if (sam.fullBatch || (sam.batchTime > 0 && sam.batchCount >= 4)) return false;
  if (!(g.playtimeMin > 0)) return false;
  return true;
}

const SORTS = {
  time: { label: '按时长', cmp: (a, b) => (b.playtimeMin - a.playtimeMin) || (b.achUnlocked - a.achUnlocked) },
  ach: { label: '按成就', cmp: (a, b) => (b.achUnlocked - a.achUnlocked) || (b.playtimeMin - a.playtimeMin) },
  name: { label: '按名称', cmp: (a, b) => a.name.localeCompare(b.name, 'zh-CN') },
  recent: { label: '按最近游玩', cmp: (a, b) => (b.lastPlayed - a.lastPlayed) || (b.playtimeMin - a.playtimeMin) },
};

export async function libraryView() {
  if (state.games.size === 0) {
    return el('div', { class: 'empty-state' },
      el('div', { class: 'big' }, '🎮'),
      '还没有数据,先点右上角「连接 Steam」',
    );
  }
  if (!state.prices) await loadPrices().catch(() => {});

  const wrap = el('div');
  const gridHost = el('div');
  let tab = 'all';
  let sort = 'time';
  let query = '';

  // ---- 统计卡 ----
  const value = calcValue(state.games);
  const totalMin = [...state.games.values()].reduce((s, g) => s + g.playtimeMin, 0);
  const totalAch = [...state.games.values()].reduce((s, g) => s + g.achUnlocked, 0);
  const playedGames = [...state.games.values()].filter(isActuallyPlayed);
  const playedMin = playedGames.reduce((s, g) => s + g.playtimeMin, 0);
  const playedAch = playedGames.reduce((s, g) => s + g.achUnlocked, 0);

  const valEl = el('div', { class: 'stat-value num' });
  const hoursEl = el('div', { class: 'stat-value num' });
  const countEl = el('div', { class: 'stat-value num' });
  const achEl = el('div', { class: 'stat-value num' });
  const hoursSub = el('div', { class: 'stat-sub' });
  const countSub = el('div', { class: 'stat-sub' });
  const achSub = el('div', { class: 'stat-sub' });

  const meta = (state.prices && state.prices.meta) || {};
  const statsRow = el('div', { class: 'stats-row' },
    el('div', { class: 'stat-card stat-hero' },
      el('div', { class: 'stat-label' }, el('span', { class: 'dot', style: { background: 'var(--coral)' } }), '账号价值'),
      valEl,
      el('div', { class: 'stat-sub' },
        meta.generatedAt ? `价格快照 ${String(meta.generatedAt).slice(0, 10)} · 未收录 ${value.missing} 款` : '价格快照加载中…'),
    ),
    el('div', { class: 'stat-card' },
      el('div', { class: 'stat-label' }, el('span', { class: 'dot', style: { background: 'var(--cyan)' } }), '总时长'),
      hoursEl, hoursSub,
    ),
    el('div', { class: 'stat-card' },
      el('div', { class: 'stat-label' }, el('span', { class: 'dot', style: { background: 'var(--amber)' } }), '游戏数量'),
      countEl, countSub,
    ),
    el('div', { class: 'stat-card' },
      el('div', { class: 'stat-label' }, el('span', { class: 'dot', style: { background: 'var(--purple)' } }), '成就总数'),
      achEl, achSub,
    ),
  );

  function refreshStats() {
    const played = tab === 'played';
    countUp(valEl, value.sumFen, { format: (n) => fmtValue(n) });
    if (played) {
      hoursEl.textContent = fmtHours(playedMin);
      countEl.textContent = `${state.games.size} (${playedGames.length})`;
      achEl.textContent = playedAch.toLocaleString('zh-CN');
      hoursSub.textContent = '曾经玩过合计';
      countSub.textContent = '括号内为曾经玩过数量';
      achSub.textContent = '曾经玩过合计';
    } else {
      hoursEl.textContent = fmtHours(totalMin);
      countEl.textContent = state.games.size.toLocaleString('zh-CN');
      achEl.textContent = totalAch.toLocaleString('zh-CN');
      hoursSub.textContent = '';
      countSub.textContent = '';
      achSub.textContent = '';
    }
  }

  // ---- 工具条 ----
  const segAll = el('button', { class: 'seg-tab active', onclick: () => { tab = 'all'; segAll.classList.add('active'); segPlayed.classList.remove('active'); refresh(); } }, '全部');
  const segPlayed = el('button', { class: 'seg-tab', onclick: () => { tab = 'played'; segPlayed.classList.add('active'); segAll.classList.remove('active'); refresh(); } }, '曾经玩过');

  const sortSelect = el('select', { class: 'sort-select', onchange: (e) => { sort = e.target.value; refresh(); } },
    Object.entries(SORTS).map(([k, s]) => el('option', { value: k, selected: k === sort ? '' : null }, s.label)),
  );

  const search = searchBox((q) => { query = q; refresh(); });

  const toolbar = el('div', { class: 'toolbar' },
    el('div', { class: 'seg-tabs' }, segAll, segPlayed),
    search,
    sortSelect,
  );

  // ---- 网格 ----
  function refresh() {
    gridHost.innerHTML = '';
    let list = [...state.games.values()];
    if (tab === 'played') list = list.filter(isActuallyPlayed);
    if (query) {
      list = list.filter(g => g.name.toLowerCase().includes(query) || g.appid.includes(query) || (g.nameEn || '').toLowerCase().includes(query));
    }
    list.sort(SORTS[sort].cmp);
    if (list.length === 0) {
      gridHost.appendChild(el('div', { class: 'empty-state' }, el('div', { class: 'big' }, '🔍'), '没有符合条件的游戏'));
      return;
    }
    const grid = el('div', { class: 'cover-grid' });
    list.forEach((g, i) => {
      const card = el('div', {
        class: 'cover-card',
        style: { animationDelay: Math.min(i * 28, 600) + 'ms' },
        onclick: () => { location.hash = '#/game/' + g.appid; },
      },
        coverImg(g.appid, g.name),
        el('div', { class: 'card-meta' },
          el('div', { class: 'card-name', title: g.name }, g.name),
          el('div', { class: 'card-badges' },
            el('span', { class: 'badge badge-time', title: `总时长 ${fmtHours(g.playtimeMin)}` }, '⏱ ' + fmtHoursCompact(g.playtimeMin)),
            g.achTotal > 0
              ? el('span', { class: 'badge badge-ach', title: '成就' }, `🏆 ${g.achUnlocked}/${g.achTotal}`)
              : null,
            (g.sam && (g.sam.fullBatch || (g.sam.batchTime > 0 && g.sam.batchCount >= 4)))
              ? el('span', { class: 'badge badge-warn', title: '检测到批量解锁' }, '⚠')
              : null,
          ),
        ),
      );
      grid.appendChild(card);
    });
    gridHost.appendChild(grid);
  }

  wrap.appendChild(statsRow);
  wrap.appendChild(toolbar);
  wrap.appendChild(gridHost);
  refreshStats();
  refresh();
  return wrap;
}
