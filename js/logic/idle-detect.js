// 挂机检测:库纯净度评分 + 可疑游戏清单
import { state } from '../state.js';

const GRADE_TIERS = [
  { min: 90, grade: 'S', title: '绝世清流', caption: '这库干净得能反光,你的每一分钟都货真价实。' },
  { min: 75, grade: 'A', title: '清流玩家', caption: '你的时长经得起拷打,是个实在人。' },
  { min: 55, grade: 'B', title: '略有水分', caption: '有一些故事,但不多。整体还是很体面的。' },
  { min: 35, grade: 'C', title: '挂机练习生', caption: '时长是挂的,快乐是真的。练级之路还长。' },
  { min: 0, grade: 'D', title: '挂出强大', caption: '恭喜达成「赛博上班」成就,你的 Steam 会感谢你的陪伴。' },
];

const REASONS = {
  fullBatch: { label: '批量解锁', weight: 15 },
  batch: { label: '同秒解锁', weight: 10 },
  zeroTime: { label: '零时长解锁', weight: 8 },
  ratio: { label: '百小时零成就', weight: 7 },
  burst: { label: '成就突增', weight: 4 },
};

// 分析全部游戏,返回 {score, grade, title, caption, flags}
export function analyzePurity(games) {
  const flags = [];
  let penalty = 0;

  for (const g of games.values()) {
    const reasons = [];
    const list = g.achList || [];
    const unlocked = list.filter(a => a.earned && a.earnedtime > 0);
    const sam = g.sam || { batchTime: 0, fullBatch: false, batchCount: 0 };
    const hasSchema = g.achTotal > 0 || unlocked.length > 0;

    if (sam.fullBatch && unlocked.length >= 2) {
      reasons.push('fullBatch');
    } else if (sam.batchTime > 0 && sam.batchCount >= 4) {
      reasons.push('batch');
    }
    if (unlocked.length >= 3 && g.playtimeMin === 0) {
      reasons.push('zeroTime');
    }
    // 仅对"有成就定义"的游戏判失衡,避免无成就游戏误伤
    if (hasSchema && g.playtimeMin >= 3600 && unlocked.length <= 2) {
      reasons.push('ratio');
    }
    if (unlocked.length >= 5) {
      const times = unlocked.map(a => a.earnedtime).filter(t => t > 0).sort((a, b) => a - b);
      let burst = false;
      for (let i = 0; i + 4 < times.length; i++) {
        if (times[i + 4] - times[i] <= 120) { burst = true; break; }
      }
      if (burst) reasons.push('burst');
    }

    if (reasons.length > 0) {
      const w = reasons.reduce((s, r) => s + REASONS[r].weight, 0);
      penalty += w;
      flags.push({
        appid: g.appid,
        name: g.name,
        playtimeMin: g.playtimeMin,
        achUnlocked: g.achUnlocked,
        achTotal: g.achTotal,
        reasons,
        weight: w,
      });
    }
  }

  flags.sort((a, b) => b.weight - a.weight || b.playtimeMin - a.playtimeMin);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const tier = GRADE_TIERS.find(t => score >= t.min) || GRADE_TIERS[GRADE_TIERS.length - 1];
  return {
    score,
    grade: tier.grade,
    title: tier.title,
    caption: tier.caption,
    flags: flags.slice(0, 60),
    suspectCount: flags.length,
  };
}

export function runPurity() {
  state.purity = analyzePurity(state.games);
  return state.purity;
}

export const GRADE_COLORS = {
  S: '#a78bfa', A: '#2dd4a7', B: '#38bdf8', C: '#fbbf24', D: '#ff6b6b',
};
