// appinfo.vdf 解析:支持 v27('DV\x07)/v28((DV\x07)/v29()DV\x07) 三种节格式
// v29:键名经 int32 索引引用文件末尾键表;每节 = [appid,size,...] 头 + 二进制 VDF
// 只提取每节 appinfo/common 下的 name/type/name_localized,其余子树跳过
import { BinVdfError, Reader } from '../parsers/bin-vdf.js';
import { readFileBuffer, fileMeta } from '../fs/steam-folder.js';
import { kvGet, kvSet } from '../storage.js';

const KV_APPINFO = 'appinfoCache';

const MAGIC_V27 = 0x07564427; // 'DV\x07
const MAGIC_V28 = 0x07564428; // (DV\x07
const MAGIC_V29 = 0x07564429; // )DV\x07

function decode(reader, keyTable) {
  const r = reader;
  const readKey = () => {
    if (keyTable) {
      const idx = r.readInt32();
      return keyTable[idx] !== undefined ? keyTable[idx] : `#${idx}`;
    }
    return r.readCString();
  };
  // 键表模式下 map 内键按 int32 索引读,不能用 Reader.skipValue
  const skip = (type, depth = 0) => {
    if (depth > 80) throw new BinVdfError('跳过嵌套过深', r.pos);
    switch (type) {
      case 0x00:
        for (;;) {
          const t = r.readByte();
          if (t === 0x08 || t === 0x0b) return;
          readKey();
          skip(t, depth + 1);
        }
      case 0x01: r.readCString(); return;
      case 0x05: r.readWString(); return;
      case 0x02: case 0x03: case 0x04: case 0x06: r.pos += 4; return;
      case 0x07: case 0x0a: r.pos += 8; return;
      default: r.pos += 4; return;
    }
  };

  // 节内剪枝遍历:找 appinfo → common,提取 name/type/name_localized
  const out = { name: '', nameZh: '', type: '' };

  function walkCommon(depth) {
    for (;;) {
      const t = r.readByte();
      if (t === 0x08 || t === 0x0b) return;
      const key = readKey();
      if (t === 0x00) {
        if (key === 'name_localized') {
          for (;;) {
            const lt = r.readByte();
            if (lt === 0x08 || lt === 0x0b) break;
            const lang = readKey();
            if (lt === 0x01 && (lang === 'schinese' || lang === 'tchinese') && !out.nameZh) {
              out.nameZh = r.readCString();
            } else {
              skip(lt);
            }
          }
        } else {
          skip(t);
        }
      } else if (t === 0x01) {
        const v = r.readCString();
        if (key === 'name') out.name = v;
        else if (key === 'type') out.type = v;
        else if (key === 'name_schinese' && !out.nameZh) out.nameZh = v;
      } else {
        skip(t);
      }
    }
  }

  function walkAppinfo(depth) {
    for (;;) {
      const t = r.readByte();
      if (t === 0x08 || t === 0x0b) return;
      const key = readKey();
      if (t === 0x00 && key === 'common') {
        walkCommon(depth + 1);
      } else {
        skip(t);
      }
    }
  }

  function walkRoot(depth) {
    for (;;) {
      const t = r.readByte();
      if (t === 0x08 || t === 0x0b) return;
      const key = readKey();
      if (t === 0x00 && key === 'appinfo') {
        walkAppinfo(depth + 1);
      } else {
        skip(t);
      }
    }
  }

  walkRoot(0);
  return out;
}

// 解析整个文件 → Map<appid, {name, nameZh, type}>
export function extractAppInfo(buffer, onProgress) {
  const out = new Map();
  const dv = new DataView(buffer);
  if (buffer.byteLength < 8) return out;
  const magic = dv.getUint32(0, true);
  let pos;
  let keyTable = null;
  let structSize;

  if (magic === MAGIC_V27) { pos = 8; structSize = 52; }        // LLLL Q 20s L = 4*4+8+20+4 = 48? 计算见下
  else if (magic === MAGIC_V28 || magic === MAGIC_V29) {
    if (magic === MAGIC_V29) {
      const keyTableOffset = Number(dv.getBigInt64(8, true));
      // 键表:int32 数量 + N 个 C 字符串
      const count = dv.getInt32(keyTableOffset, true);
      keyTable = [];
      const bytes = new Uint8Array(buffer);
      let p = keyTableOffset + 4;
      for (let i = 0; i < count; i++) {
        const start = p;
        while (p < bytes.length && bytes[p] !== 0) p++;
        keyTable.push(new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(start, p)));
        p++;
      }
      pos = 16;
      structSize = 68; // LLLL Q 20s L 20s
    } else {
      pos = 8;
      structSize = 68;
    }
  } else {
    return out; // 未知魔数(超老格式等),返回空
  }

  // 修正 v27 结构大小:appid,size,infostate,lastUpdated,accessToken(u64),sha1(20),changeNumber = 4+4+4+4+8+20+4 = 48
  if (magic === MAGIC_V27) structSize = 48;

  const endLimit = magic === MAGIC_V29 ? Number(dv.getBigInt64(8, true)) - 4 : buffer.byteLength - 4;
  let guard = 0;
  while (pos < endLimit && guard++ < 3000000) {
    const appid = dv.getUint32(pos, true);
    if (appid === 0) break;
    const entrySize = dv.getUint32(pos + 4, true);
    const vdfSize = entrySize - (structSize - 8);
    if (vdfSize < 0 || pos + structSize + vdfSize > buffer.byteLength) break;
    if (vdfSize >= 4) {
      const slice = buffer.slice(pos + structSize, pos + structSize + vdfSize);
      try {
        const info = decode(new Reader(slice), keyTable);
        if (info.name || info.type || info.nameZh) {
          out.set(String(appid), { name: info.name, nameZh: info.nameZh, type: info.type });
        }
      } catch (e) {
        if (typeof console !== 'undefined') console.warn('[appinfo] 节解析失败', appid, e);
      }
    }
    pos += structSize + Math.max(vdfSize, 0);
    if (onProgress && (guard & 0x3fff) === 0) onProgress({ done: pos, total: buffer.byteLength });
  }
  return out;
}

export async function loadAppInfo(folderHandle, { force = false } = {}) {
  const meta = await fileMeta(folderHandle, ['appcache', 'appinfo.vdf']);
  if (!meta) return { map: new Map(), meta: null };

  if (!force) {
    const cached = await kvGet(KV_APPINFO);
    if (cached && cached.size === meta.size && cached.mtime === meta.lastModified && cached.map) {
      return { map: new Map(Object.entries(cached.map)), meta };
    }
  }

  const buf = await readFileBuffer(folderHandle, ['appcache', 'appinfo.vdf']);
  if (!buf) return { map: new Map(), meta };
  let map;
  try {
    map = extractAppInfo(buf);
  } catch (e) {
    console.warn('[appinfo] 解析失败', e);
    return { map: new Map(), meta };
  }
  try {
    if (map.size > 0 && map.size <= 400000) {
      await kvSet(KV_APPINFO, { size: meta.size, mtime: meta.lastModified, map: Object.fromEntries(map) });
    }
  } catch { /* 配额不足则下次重新解析 */ }
  return { map, meta };
}
