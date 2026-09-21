// 游戏详情:大头图 + 数据 + 成就列表 + SAM 横幅
import { state } from '../state.js';
import { el, toast } from './ui.js';
import { fmtHours, fmtDate, fmtDateTime } from '../logic/format.js';
import { calcValue, fmtValue } from '../logic/value.js';
import { isActuallyPlayed } from './library-view.js';

export async function gameDetailView([appid]) {
  const g = state.games.get(appid);
  if (!g) {
    return el('div', { class: 'empty-state' }, el('div', { class: 'big' }, '👾'), '未找到这款游戏');
  }

  const wrap = el('div');
  wrap.appendChild(el('button', { class: 'ghost-btn back-btn', onclick: () => { location.hash = '#/library'; } }, '← 返回我的库'));

  const sam = g.sam || {};
  const hasSam = sam.fullBatch || (sam.batchTime > 0 && sam.batchCount >= 4);
  const played = isActuallyPlayed(g);

  const priceInfo = state.prices && state.prices.map ? state.prices.map[g.appid] : null;

  const head = el('div', { class: 'detail-head' },
    el('div', { class: 'detail-cover' },
      el('img', {
        src: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`,
        alt: g.name,
        onerror: (e) => { e.target.replaceWith(el('div', { class: 'cover-fallback', style: { aspectRatio: '2/3' } }, g.name[0] || '?')); },
      }),
    ),
    el('div', { class: 'detail-info' },
      el('div', { class: 'detail-name' }, g.name),
      el('div', { class: 'detail-stats' },
        el('div', { class: 'detail-stat' }, el('div', { class: 'v' }, fmtHours(g.playtimeMin)), el('div', { class: 'l' }, '总时长')),
        el('div', { class: 'detail-stat' }, el('div', { class: 'v' }, `${g.achUnlocked}/${g.achTotal}`), el('div', { class: 'l' }, '成就')),
        el('div', { class: 'detail-stat' }, el('div', { class: 'v' }, g.lastPlayed ? fmtDate(g.lastPlayed) : '—'), el('div', { class: 'l' }, '最近游玩')),
        g.playtime2wks ? el('div', { class: 'detail-stat' }, el('div', { class: 'v' }, fmtHours(g.playtime2wks)), el('div', { class: 'l' }, '近两周')) : null,
        priceInfo && priceInfo.price > 0
          ? el('div', { class: 'detail-stat' }, el('div', { class: 'v' }, '¥ ' + (priceInfo.price / 100).toLocaleString('zh-CN')), el('div', { class: 'l' }, '当前价格'))
          : null,
        el('div', { class: 'detail-stat' }, el('div', { class: 'v', style: { color: played ? 'var(--mint)' : 'var(--amber)' } }, played ? '✓ 曾经玩过' : (g.playtimeMin > 0 ? '疑似挂机' : '未游玩')), el('div', { class: 'l' }, '库状态')),
      ),
    ),
  );
  wrap.appendChild(head);

  if (hasSam) {
    wrap.appendChild(el('div', { class: 'sam-banner' },
      el('span', {}, '⚠️'),
      el('span', {}, `检测到批量解锁:${sam.batchCount} 个成就在同一秒解锁(${fmtDateTime(sam.batchTime)}),疑似使用了解锁工具,本游戏不计入「曾经玩过」。`),
    ));
  }

  const list = g.achList || [];
  if (list.length === 0) {
    wrap.appendChild(el('div', { class: 'empty-state' }, '这款游戏没有成就数据'));
  } else {
    const unlocked = list.filter(a => a.earned);
    const locked = list.filter(a => !a.earned);
    const sorted = [...unlocked.sort((a, b) => b.earnedtime - a.earnedtime), ...locked];
    const achGrid = el('div', { class: 'ach-list' });
    sorted.forEach(a => {
      achGrid.appendChild(el('div', { class: 'ach-item' + (a.earned ? '' : ' locked') },
        el('div', { class: 'ach-icon' },
          a.icon ? el('img', { loading: 'lazy', src: a.icon, alt: a.name, onerror: (e) => { e.target.remove(); } }) : el('div', { class: 'cover-fallback', style: { borderRadius: '10px' } }, '🏆'),
        ),
        el('div', { class: 'ach-body' },
          el('div', { class: 'ach-name' }, a.name || a.api),
          a.desc ? el('div', { class: 'ach-desc' }, a.desc) : null,
          el('div', { class: 'ach-date' }, a.earned ? `解锁于 ${fmtDateTime(a.earnedtime)}` : '未解锁'),
        ),
      ));
    });
    wrap.appendChild(el('div', { style: { marginBottom: '12px', color: 'var(--text-dim)', fontSize: '12.5px' } }, `共 ${list.length} 个成就,已解锁 ${unlocked.length} 个`));
    wrap.appendChild(achGrid);
  }

  return wrap;
}
