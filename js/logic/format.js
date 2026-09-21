// 格式化工具
export function fmtHours(minutes) {
  const m = Math.round(minutes || 0);
  if (m <= 0) return '0 分钟';
  if (m < 60) return `${m} 分钟`;
  const h = m / 60;
  if (h < 100) return `${h.toFixed(1)} 小时`;
  return `${Math.round(h).toLocaleString('zh-CN')} 小时`;
}

export function fmtHoursCompact(minutes) {
  const m = Math.round(minutes || 0);
  if (m <= 0) return '0分钟';
  if (m < 60) return `${m}分钟`;
  const h = m / 60;
  if (h < 100) return `${h.toFixed(1)}小时`;
  return `${Math.round(h).toLocaleString('zh-CN')}小时`;
}

export function fmtYuan(fen) {
  const yuan = Math.round((fen || 0) / 100);
  return yuan.toLocaleString('zh-CN');
}

export function fmtDate(unix) {
  if (!unix) return '—';
  const d = new Date(unix * 1000);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fmtDateTime(unix) {
  if (!unix) return '—';
  const d = new Date(unix * 1000);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtFileTime(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

// 文件名消毒(保留中文,去掉路径非法字符)
export function sanitizeName(s) {
  return String(s || 'unknown').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80);
}

// 封面 URL
export function coverUrl(appid) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`;
}

export function iconUrl(appid) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
}

// 从游戏名取首字符(字母头像)
export function initialOf(name) {
  const s = String(name || '?').trim();
  if (!s) return '?';
  const ch = Array.from(s)[0];
  if (/[A-Za-z0-9]/.test(ch)) return ch.toUpperCase();
  return ch;
}

// 由 sid64 生成稳定的糖果色色相
export function hueOf(sid64) {
  const n = BigInt(sid64 || 0) % 360n;
  return Number(n);
}
