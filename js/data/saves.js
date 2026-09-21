// 存档索引:选中账号的 userdata/<sid32>/<appid>/remote/(Steam 云存档本地缓存)
// 以目录列举为唯一事实源;remotecache.vdf 仅作参考
import { listDir, getDir } from '../fs/steam-folder.js';

// 返回 Map<appid, {files:[{name,size,lastModified}], latest, totalSize, count}>
export async function indexSaves(folderHandle, sid32, onProgress) {
  const out = new Map();
  const userDir = await getDir(folderHandle, ['userdata', sid32]);
  if (!userDir) return out;

  const appDirs = [];
  for await (const [name, h] of userDir.entries()) {
    if (h.kind === 'directory' && /^\d+$/.test(name)) appDirs.push(name);
  }
  appDirs.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

  let done = 0;
  for (const appid of appDirs) {
    const remote = await getDir(folderHandle, ['userdata', sid32, appid, 'remote']);
    if (!remote) { done++; continue; }
    const files = [];
    for await (const [name, h] of remote.entries()) {
      if (h.kind !== 'file') continue;
      if (/\.vdf$/i.test(name) || name === '.DS_Store' || name === 'Thumbs.db') continue;
      files.push({ name, size: h.size, lastModified: h.lastModified });
    }
    if (files.length > 0) {
      files.sort((a, b) => b.lastModified - a.lastModified);
      let totalSize = 0, latest = 0;
      for (const f of files) { totalSize += f.size; if (f.lastModified > latest) latest = f.lastModified; }
      out.set(appid, { appid, files, latest, totalSize, count: files.length });
    }
    done++;
    if (onProgress) onProgress({ done, total: appDirs.length, label: `存档索引 ${done}/${appDirs.length}` });
  }
  return out;
}
