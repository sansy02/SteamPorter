// Valve 二进制 VDF(KeyValues 二进制版)解析器 — 纯 ES Module,浏览器/Node 通用
//
// 条目格式:[类型字节][null 结尾 UTF-8 键][值体]
//   0x00 子对象(嵌套条目,直到 0x08 结束)
//   0x01 字符串(null 结尾 UTF-8)
//   0x02 int32(小端)
//   0x03 float32(小端)
//   0x04 指针(4 字节,读取后丢弃)
//   0x05 宽字符串(null 结尾 UTF-16LE)
//   0x06 颜色(4 字节,读取后丢弃)
//   0x07 uint64(小端 → BigInt,steamid64 超出 2^53 必须用 BigInt)
//   0x08 对象结束(仅 1 字节,无键)

const T_MAP = 0x00, T_STRING = 0x01, T_INT = 0x02, T_FLOAT = 0x03,
      T_PTR = 0x04, T_WSTRING = 0x05, T_COLOR = 0x06, T_U64 = 0x07, T_END = 0x08,
      T_INT64 = 0x0a, T_END_ALT = 0x0b;

export class BinVdfError extends Error {
  constructor(message, offset) {
    super(`${message} (offset 0x${offset.toString(16)})`);
    this.offset = offset;
  }
}

export class Reader {
  constructor(buffer) {
    this.dv = buffer instanceof DataView ? buffer : new DataView(buffer);
    this.u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    this.pos = 0;
    this.size = this.u8.byteLength;
  }
  eof() { return this.pos >= this.size; }
  readByte() {
    if (this.pos >= this.size) throw new BinVdfError('读取越界(byte)', this.pos);
    return this.u8[this.pos++];
  }
  readCString() {
    const start = this.pos;
    while (this.pos < this.size && this.u8[this.pos] !== 0) this.pos++;
    if (this.pos >= this.size) throw new BinVdfError('字符串缺少终止符', start);
    const bytes = this.u8.subarray(start, this.pos);
    this.pos++;
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
  readWString() {
    const start = this.pos;
    while (this.pos + 1 < this.size && !(this.u8[this.pos] === 0 && this.u8[this.pos + 1] === 0)) this.pos += 2;
    if (this.pos + 1 >= this.size) throw new BinVdfError('宽字符串缺少终止符', start);
    const bytes = this.u8.slice(start, this.pos);
    this.pos += 2;
    return new TextDecoder('utf-16le', { fatal: false }).decode(bytes);
  }
  readInt32() {
    if (this.pos + 4 > this.size) throw new BinVdfError('读取越界(int32)', this.pos);
    const v = this.dv.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }
  readUint32() {
    if (this.pos + 4 > this.size) throw new BinVdfError('读取越界(uint32)', this.pos);
    const v = this.dv.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  readFloat32() {
    if (this.pos + 4 > this.size) throw new BinVdfError('读取越界(float)', this.pos);
    const v = this.dv.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }
  readUint64() {
    if (this.pos + 8 > this.size) throw new BinVdfError('读取越界(uint64)', this.pos);
    const v = this.dv.getBigUint64(this.pos, true);
    this.pos += 8;
    return v;
  }
  readInt64() {
    if (this.pos + 8 > this.size) throw new BinVdfError('读取越界(int64)', this.pos);
    const v = this.dv.getBigInt64(this.pos, true);
    this.pos += 8;
    return v;
  }
  // 跳过任意类型的值体(键已读出)
  skipValue(type, depth = 0) {
    if (depth > 80) throw new BinVdfError('skipValue 嵌套过深,疑似数据失步', this.pos);
    switch (type) {
      case T_MAP:
        for (;;) {
          const t = this.readByte();
          if (t === T_END || t === T_END_ALT) return;
          this.readCString();
          this.skipValue(t, depth + 1);
        }
      case T_STRING: this.readCString(); return;
      case T_WSTRING: this.readWString(); return;
      case T_INT: case T_FLOAT: case T_PTR: case T_COLOR: this.pos += 4; return;
      case T_U64: case T_INT64: this.pos += 8; return;
      default: {
        // 未知类型:lenient 尝试按 int32 对齐跳过,失败则放弃解析
        const err = new BinVdfError(`未知类型字节 0x${type.toString(16)}`, this.pos);
        this.pos += 4;
        if (this.pos > this.size) this.pos = this.size;
        if (typeof console !== 'undefined') console.warn('[bin-vdf]', err.message);
      }
    }
  }
}

function parseMapInternal(r, opts, depth) {
  if (depth > 60) throw new BinVdfError('嵌套过深,疑似损坏数据', r.pos);
  const obj = {};
  for (;;) {
    const type = r.readByte();
    if (type === T_END || type === T_END_ALT) return obj;
    const key = r.readCString();
    switch (type) {
      case T_MAP: obj[key] = parseMapInternal(r, opts, depth + 1); break;
      case T_STRING: obj[key] = r.readCString(); break;
      case T_INT: obj[key] = r.readInt32(); break;
      case T_FLOAT: obj[key] = r.readFloat32(); break;
      case T_PTR: obj[key] = r.readInt32(); break;
      case T_WSTRING: obj[key] = r.readWString(); break;
      case T_COLOR: obj[key] = r.readUint32(); break;
      case T_U64: obj[key] = r.readUint64(); break;
      case T_INT64: obj[key] = r.readInt64(); break;
      default:
        if (opts && opts.lenient === false) throw new BinVdfError(`未知类型字节 0x${type.toString(16)}`, r.pos);
        if (typeof console !== 'undefined') console.warn('[bin-vdf]', `未知类型字节 0x${type.toString(16)},已跳过, key=${key}`, 'offset', r.pos);
        try { r.skipValue(type); } catch (e) { throw new BinVdfError(`未知类型 ${type.toString(16)} 跳过失败: ${e.message}`, r.pos); }
    }
  }
}

// 整树解析。文件/缓冲区以根键条目开始(首个字节即类型)
export function parseBinaryVdf(buffer, opts = {}) {
  const r = new Reader(buffer);
  if (r.eof()) return {};
  return parseMapInternal(r, opts, 0);
}

const joinPath = (base, key) => (base ? base + '/' + key : key);

// 剪枝式遍历:onEnter 返回 false 则跳过整个子树(onExit 不再回调)
// 供 appinfo.vdf 等大文件按需提取使用
export function walkBinaryVdf(buffer, handlers, opts = {}) {
  const r = new Reader(buffer);
  const h = handlers || {};

  function walkMap(basePath, depth) {
    if (depth > 60) throw new BinVdfError('嵌套过深,疑似损坏数据', r.pos);
    for (;;) {
      const type = r.readByte();
      if (type === T_END || type === T_END_ALT) return;
      const key = r.readCString();
      const path = joinPath(basePath, key);
      switch (type) {
        case T_MAP: {
          let descend = true;
          if (h.onEnter) descend = h.onEnter(path, key, r.pos);
          if (descend === false) {
            r.skipValue(T_MAP);
          } else {
            walkMap(path, depth + 1);
            if (h.onExit) h.onExit(path, key);
          }
          break;
        }
        case T_STRING: h.onString && h.onString(path, key, r.readCString()); break;
        case T_INT: h.onInt && h.onInt(path, key, r.readInt32()); break;
        case T_FLOAT: h.onFloat && h.onFloat(path, key, r.readFloat32()); break;
        case T_U64: h.onU64 && h.onU64(path, key, r.readUint64()); break;
        case T_INT64: h.onI64 && h.onI64(path, key, r.readInt64()); break;
        default:
          if (opts.lenient === false) throw new BinVdfError(`未知类型字节 0x${type.toString(16)}`, r.pos);
          r.skipValue(type);
      }
    }
  }

  if (!r.eof()) walkMap('', 0);
}
