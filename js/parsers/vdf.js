// Valve 文本 VDF 解析器 — 纯 ES Module,浏览器/Node 通用
// 容错:跳过 BOM、// 注释、#base/#include 行;未知转义按字面量保留

const RE_COMMENT_LINE = /^\s*\/\//;
const RE_BASE_LINE = /^\s*#(base|include)\b/;

export function parseTextVdf(text, opts = {}) {
  if (typeof text !== 'string') throw new TypeError('parseTextVdf: 需要字符串');
  let pos = 0;
  const len = text.length;
  if (text.charCodeAt(0) === 0xFEFF) pos = 1;

  function skipWhitespaceAndComments() {
    while (pos < len) {
      const c = text[pos];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { pos++; continue; }
      if (c === '/') {
        if (text.startsWith('//', pos)) {
          const nl = text.indexOf('\n', pos);
          if (nl === -1) { pos = len; return; }
          pos = nl + 1;
          continue;
        }
        break;
      }
      if (c === '#') {
        const nl = text.indexOf('\n', pos);
        if (nl === -1) { pos = len; return; }
        pos = nl + 1;
        continue;
      }
      break;
    }
  }

  function readQuotedString() {
    // 调用时 text[pos] === '"'
    pos++;
    let out = '';
    while (pos < len) {
      const c = text[pos];
      if (c === '\\') {
        const n = text[pos + 1];
        if (n === '"') { out += '"'; pos += 2; }
        else if (n === '\\') { out += '\\'; pos += 2; }
        else if (n === 'n') { out += '\n'; pos += 2; }
        else if (n === 't') { out += '\t'; pos += 2; }
        else if (n === 'r') { out += '\r'; pos += 2; }
        else { out += c; pos++; }
      } else if (c === '"') {
        pos++;
        return out;
      } else {
        out += c;
        pos++;
      }
    }
    return out;
  }

  function readBareToken() {
    let out = '';
    while (pos < len) {
      const c = text[pos];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '{' || c === '}') break;
      if (c === '/' && text.startsWith('//', pos)) break;
      out += c;
      pos++;
    }
    return out;
  }

  function parseValue() {
    skipWhitespaceAndComments();
    if (pos >= len) return null;
    const c = text[pos];
    if (c === '"') return readQuotedString();
    if (c === '{') {
      pos++;
      return parseObject();
    }
    return readBareToken();
  }

  function parseObject() {
    const obj = {};
    for (;;) {
      skipWhitespaceAndComments();
      if (pos >= len) break;
      if (text[pos] === '}') { pos++; break; }
      let key;
      if (text[pos] === '"') key = readQuotedString();
      else key = readBareToken();
      if (key === '' || key === '}') {
        if (key === '}') { pos++; break; }
        continue;
      }
      skipWhitespaceAndComments();
      if (pos >= len) break;
      if (text[pos] === '}') { pos++; break; }
      const value = parseValue();
      if (value !== null) obj[key] = value;
    }
    return obj;
  }

  const root = parseObject();
  return root ?? {};
}

// 在对象中按路径取嵌套值,任一环节缺失返回 undefined
export function getPath(obj, ...path) {
  let cur = obj;
  for (const p of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}
