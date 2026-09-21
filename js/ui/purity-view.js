// 挂机检测:纯净度评分环 + 等级称号 + 可疑游戏清单
import { state } from '../state.js';
import { el, searchBox } from './ui.js';
import { fmtHours } from '../logic/format.js';
import { runPurity, GRADE_COLORS } from '../logic/idle-detect.js';

const REASON_LABELS = {
  fullBatch: '批量解锁', batch: '同秒解锁', zeroTime: '零时长解锁', ratio: '百小时零成就', burst: '成就突增',
};

export async function purityView() {
  if (state.games.size === 0) {
    return el('div', { class: 'empty-state' }, el('div', { class: 'big' }, '🧪'), '先连接 Steam 才有检测数据');
  }
  const p = runPurity();
  const color = GRADE_COLORS[p.grade] || 'var(--purple)';
  const wrap = el('div');

  // 评分环
  const R = 88, C = 2 * Math.PI * R;
  const gauge = el('div', { class: 'gauge-wrap' },
    el('svg', { width: '210', height: '210', viewBox: '0 0 210 210' },
      el('circle', { class: 'gauge-bg', cx: '105', cy: '105', r: String(R) }),
      el('circle', {
        class: 'gauge-fg', cx: '105', cy: '105', r: String(R),
        stroke: color,
        'stroke-dasharray': String(C),
        'stroke-dashoffset': String(C),
        style: { transitionDelay: '0.1s' },
      }),
    ),
    el('div', { class: 'gauge-center' },
      el('div', { class: 'gauge-grade', style: { color } }, p.grade),
      el('div', { class: 'gauge-score' }, `${p.score} / 100`),
    ),
  );
  requestAnimationFrame(() => {
    const fg = gauge.querySelector('.gauge-fg');
    requestAnimationFrame(() => { fg.style.strokeDashoffset = String(C * (1 - p.score / 100)); });
  });

  const info = el('div', { class: 'purity-info' },
    el('div', { class: 'purity-title' }, `${p.title} · ${p.score}分`),
    el('div', { class: 'purity-sub' }, p.caption),
    el('div', { style: { fontSize: '12.5px', color: 'var(--text-dim)' } },
      `共检测 ${state.games.size} 款游戏,${p.suspectCount > 0 ? `发现 ${p.suspectCount} 款可疑` : '未发现可疑游戏,恭喜!'}`,
    ),
  );

  wrap.appendChild(el('div', { class: 'purity-head' }, gauge, info));

  // 可疑清单
  const listHost = el('div');
  let query = '';
  function render() {
    listHost.innerHTML = '';
    let flags = p.flags;
    if (query) flags = flags.filter(f => f.name.toLowerCase().includes(query));
    if (flags.length === 0) {
      listHost.appendChild(el('div', { class: 'empty-state' }, query ? '没有匹配的可疑游戏' : '太干净了,无可疑游戏 🎉'));
      return;
    }
    const grid = el('div', { class: 'sus-grid' });
    flags.forEach((f, i) => {
      grid.appendChild(el('div', { class: 'sus-card', style: { animationDelay: Math.min(i * 30, 500) + 'ms' }, onclick: () => { location.hash = '#/game/' + f.appid; } },
        el('div', { class: 'sus-icon' },
          el('img', {
            loading: 'lazy',
            src: `https://cdn.cloudflare.steamstatic.com/steam/apps/${f.appid}/header.jpg`,
            alt: f.name,
            onerror: (e) => { e.target.remove(); },
          }),
        ),
        el('div', { style: { flex: '1', minWidth: '0' } },
          el('div', { class: 'sus-name' }, f.name),
          el('div', { class: 'sus-data' }, `⏱ ${fmtHours(f.playtimeMin)} · 🏆 ${f.achUnlocked}/${f.achTotal}`),
          el('div', {}, f.reasons.map(r => el('span', { class: 'reason-chip' }, REASON_LABELS[r] || r))),
        ),
      ));
    });
    listHost.appendChild(grid);
  }
  render();

  wrap.appendChild(el('div', { class: 'toolbar' },
    searchBox((q) => { query = q; render(); }, '搜索可疑游戏…'),
  ));
  wrap.appendChild(listHost);
  return wrap;
}
