'use strict';
// 只读扫描 sourceDirs 下的微信读书笔记。
// 对 Obsidian 库目录只调用 fs.readFile / readdir / stat（withFileTypes），
// 任何写入都只发生在项目自身的 data/ 目录，绝不触及库。

const fs = require('fs');
const path = require('path');
const { parseBook } = require('./parser');

// { path: { mtimeMs, size, book } }
const cache = new Map();

async function walkMarkdown(dir, base, out) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === '.obsidian' || ent.name.startsWith('.')) continue;
      await walkMarkdown(full, base, out);
    } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.md')) {
      const rel = path.relative(base, full);
      const category = rel.includes(path.sep) ? rel.split(path.sep)[0] : '';
      out.push({ full, category });
    }
  }
}

async function scanSource(sourceDir) {
  const files = [];
  await walkMarkdown(sourceDir, sourceDir, files);
  let changed = false;
  const books = [];
  for (const { full, category } of files) {
    const st = await fs.promises.stat(full);
    const key = path.normalize(full).toLowerCase();
    const prev = cache.get(key);
    let book;
    if (prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size) {
      book = prev.book;
    } else {
      const text = await fs.promises.readFile(full, 'utf8');
      book = parseBook(full, text.replace(/^\uFEFF/, ''), category);
      cache.set(key, { mtimeMs: st.mtimeMs, size: st.size, book });
      changed = true;
    }
    if (book) books.push(book);
  }
  return { books, changed };
}

let lastSnapshot = null;

// 每次调用都重新 stat（目录很小，开销可忽略），文件变化时才重新解析
async function getLibrary(sourceDirs) {
  const books = [];
  let changed = false;
  for (const dir of sourceDirs) {
    try {
      const r = await scanSource(dir);
      books.push(...r.books);
      changed = changed || r.changed;
    } catch (err) {
      console.error(`[library] 读取数据源失败: ${dir}\n  ${err.message}`);
    }
  }
  books.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  lastSnapshot = { books, changed, scannedAt: new Date().toISOString() };
  return lastSnapshot;
}

// 检查单个目录：是否存在、可读，以及含多少本微信读书笔记（只读）
async function inspectSource(dir) {
  const info = { path: dir, exists: false, isDirectory: false, readable: false, count: 0, error: '' };
  let st;
  try {
    st = await fs.promises.stat(dir);
  } catch (err) {
    info.error = err.code === 'ENOENT' ? '目录不存在' : `无法访问：${err.message}`;
    return info;
  }
  info.exists = true;
  if (!st.isDirectory()) { info.error = '该路径不是文件夹'; return info; }
  info.isDirectory = true;
  try {
    const r = await scanSource(dir);
    info.readable = true;
    info.count = r.books.length;
  } catch (err) {
    info.error = `读取失败：${err.message}`;
  }
  return info;
}

// 数据源变更后丢弃不再属于任何数据源的缓存条目
function pruneCache(sourceDirs) {
  const roots = sourceDirs.map((d) => path.normalize(d).toLowerCase().replace(/[\\/]+$/, '') + path.sep);
  for (const key of cache.keys()) {
    if (!roots.some((r) => key.startsWith(r))) cache.delete(key);
  }
  lastSnapshot = null;
}

module.exports = { getLibrary, inspectSource, pruneCache };
