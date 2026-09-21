// Steam 官方 OpenID 扫码登录(无密码:登录页与二维码均为 Steam 官方页面/App)
import { kvGet, kvSet, kvDel } from './storage.js';

export const LS_KEY = 'steamporter-openid';

const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const ID_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';

export function buildOpenIdUrl() {
  const returnTo = location.origin + location.pathname;
  const p = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': location.origin + '/',
    'openid.identity': ID_SELECT,
    'openid.claimed_id': ID_SELECT,
  });
  return 'https://steamcommunity.com/openid/login?' + p.toString();
}

export function startOpenIdLogin() {
  const w = window.open(buildOpenIdUrl(), 'steamlogin', 'popup,width=1020,height=720');
  if (!w) throw new Error('POPUP_BLOCKED');
  return w;
}

// 在当前窗口解析 OpenID 回调(登录成功/取消时 Steam 会跳回本站)
export function consumeOpenIdResult() {
  const sp = new URLSearchParams(location.search);
  if (!sp.has('openid.ns')) return null;
  const mode = sp.get('openid.mode');
  if (mode === 'cancel') return { cancelled: true };
  if (mode !== 'id_res') return null;
  const claimed = sp.get('openid.claimed_id') || '';
  const m = claimed.match(/(\d{17})$/);
  if (!m) return { error: 'BAD_CLAIMED_ID' };
  return { sid64: m[1] };
}

// 登录窗口与主窗口之间的交接:弹窗解析结果写 localStorage,主窗口监听 storage 事件
export function writeLoginHandoff(result) {
  localStorage.setItem(LS_KEY, JSON.stringify({ ...result, at: Date.now() }));
}

export function readLoginHandoff() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    localStorage.removeItem(LS_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveLoginState(login) {
  await kvSet('openidLogin', login);
}
export async function loadLoginState() {
  return kvGet('openidLogin');
}
export async function clearLoginState() {
  await kvDel('openidLogin');
}
