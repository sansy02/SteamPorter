// 分享卡片:1080×1080 canvas → PNG 下载(装逼利器)
import { state } from '../state.js';
import { fmtHours } from '../logic/format.js';
import { calcValue, fmtValue } from '../logic/value.js';
import { runPurity, GRADE_COLORS } from '../logic/idle-detect.js';
import { isActuallyPlayed } from './library-view.js';
import { initialOf, hueOf, sanitizeName } from '../logic/format.js';

const SIZE = 1080;
const COVER_W = 180, COVER_H = 270;

export async function generateShareCard() {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const acc = state.account || { personaName: 'Steam 玩家', sid64: '0' };
  const name = acc.personaName || 'Steam 玩家';

  // 背景
  const bg = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  bg.addColorStop(0, '#131722');
  bg.addColorStop(1, '#0d0f14');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // 糖果装饰圆
  const deco = [
    { x: 90, y: 100, r: 150, c: 'rgba(255,107,107,.16)' },
    { x: 1020, y: 60, r: 190, c: 'rgba(167,139,250,.15)' },
    { x: 980, y: 1000, r: 170, c: 'rgba(56,189,248,.12)' },
    { x: 60, y: 980, r: 120, c: 'rgba(45,212,167,.13)' },
  ];
  for (const d of deco) {
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fillStyle = d.c;
    ctx.fill();
  }

  // 头像
  const hue = hueOf(acc.sid64);
  const avX = 90, avY = 70, avR = 52;
  const avGrad = ctx.createLinearGradient(avX - avR, avY - avR, avX + avR, avY + avR);
  avGrad.addColorStop(0, `hsl(${hue},72%,62%)`);
  avGrad.addColorStop(1, `hsl(${(hue + 60) % 360},72%,50%)`);
  ctx.beginPath();
  ctx.arc(avX + avR, avY + avR, avR, 0, Math.PI * 2);
  ctx.fillStyle = avGrad;
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 52px "Microsoft YaHei","PingFang SC",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initialOf(name), avX + avR, avY + avR + 4);

  // 名字 + 等级
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e8ebf2';
  ctx.font = 'bold 40px "Microsoft YaHei","PingFang SC",sans-serif';
  ctx.fillText(truncate(ctx, name, 560), avX + avR * 2 + 30, avY + avR - 6);
  if (acc.playerLevel) {
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 26px "Microsoft YaHei",sans-serif';
    ctx.fillText(`Lv.${acc.playerLevel}`, avX + avR * 2 + 32, avY + avR + 42);
  }

  // 标题
  ctx.fillStyle = '#8b93a5';
  ctx.font = '26px "Microsoft YaHei",sans-serif';
  ctx.fillText('我的 Steam 库', 90, 300);

  // 价值大字(渐变)
  const value = calcValue(state.games);
  const valueText = fmtValue(value.sumFen);
  const vGrad = ctx.createLinearGradient(90, 380, 900, 500);
  vGrad.addColorStop(0, '#ff6b6b');
  vGrad.addColorStop(.5, '#a78bfa');
  vGrad.addColorStop(1, '#38bdf8');
  ctx.font = 'bold 118px "Segoe UI","Microsoft YaHei",sans-serif';
  ctx.fillStyle = vGrad;
  ctx.fillText(valueText, 90, 470);

  // 数据行
  const totalMin = [...state.games.values()].reduce((s, g) => s + g.playtimeMin, 0);
  const totalAch = [...state.games.values()].reduce((s, g) => s + g.achUnlocked, 0);
  const playedCount = [...state.games.values()].filter(isActuallyPlayed).length;
  const stats = [
    { label: '总时长', value: fmtHours(totalMin) },
    { label: '游戏数量', value: `${state.games.size} 款` },
    { label: '成就总数', value: totalAch.toLocaleString('zh-CN') },
  ];
  let sx = 90;
  for (const s of stats) {
    ctx.fillStyle = '#e8ebf2';
    ctx.font = 'bold 46px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.fillText(s.value, sx, 600);
    ctx.fillStyle = '#8b93a5';
    ctx.font = '24px "Microsoft YaHei",sans-serif';
    ctx.fillText(s.label, sx, 646);
    sx += 340;
  }

  // 纯净度徽章
  const p = runPurity();
  const pColor = GRADE_COLORS[p.grade] || '#a78bfa';
  ctx.fillStyle = 'rgba(255,255,255,.06)';
  roundRect(ctx, 90, 690, 900, 110, 24);
  ctx.fill();
  ctx.fillStyle = pColor;
  ctx.font = 'bold 72px "Segoe UI",sans-serif';
  ctx.fillText(p.grade, 140, 762);
  ctx.fillStyle = '#e8ebf2';
  ctx.font = 'bold 40px "Microsoft YaHei",sans-serif';
  ctx.fillText(`库纯净度 ${p.title} · ${p.score} 分`, 230, 745);
  ctx.fillStyle = '#8b93a5';
  ctx.font = '24px "Microsoft YaHei",sans-serif';
  ctx.fillText(`真正玩过 ${playedCount} 款 · ${p.caption}`, 230, 790);

  // 封面条
  const topGames = [...state.games.values()].sort((a, b) => b.playtimeMin - a.playtimeMin).slice(0, 5);
  await drawCovers(ctx, topGames);

  // 底部
  ctx.fillStyle = '#5c6474';
  ctx.font = '24px "Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SteamPorter · 数据仅存于本地', SIZE / 2, 1032);

  // 下载
  const dataUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `steamporter-${sanitizeName(name)}.png`;
  a.click();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function truncate(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

async function drawCovers(ctx, games) {
  const gap = 14;
  const totalW = games.length * COVER_W + (games.length - 1) * gap;
  let x = (SIZE - totalW) / 2;
  const y = 840;
  for (const g of games) {
    const img = await loadImage(`https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/library_600x900.jpg`);
    ctx.save();
    roundRect(ctx, x, y, COVER_W, COVER_H, 14);
    ctx.clip();
    if (img) {
      ctx.drawImage(img, x, y, COVER_W, COVER_H);
    } else {
      const grad = ctx.createLinearGradient(x, y, x + COVER_W, y + COVER_H);
      grad.addColorStop(0, '#2a3040');
      grad.addColorStop(1, '#1c212e');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, COVER_W, COVER_H);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 64px "Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(initialOf(g.name), x + COVER_W / 2, y + COVER_H / 2);
      ctx.textAlign = 'left';
    }
    ctx.restore();
    x += COVER_W + gap;
  }
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
