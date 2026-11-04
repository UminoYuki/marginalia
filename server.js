'use strict';
// Marginalia · 书斋 —— 微信读书摘抄馆，零依赖 Node HTTP 服务。
// 对 Obsidian 库只读；本项目一切写入（设置、封面缓存、日志）仅发生在自身目录内。

const http = require('http');
const fs = require('fs');
const path = require('path');
const { getLibrary, inspectSource, pruneCache } = require('./lib/library');

const ROOT = __dirname;
const CONFIG_FILE = path.join(ROOT, 'config.json');
// 首次运行时从示例配置生成本地 config.json（config.json 含个人路径，不入库）
if (!fs.existsSync(CONFIG_FILE)) {
  fs.copyFileSync(path.join(ROOT, 'config.example.json'), CONFIG_FILE);
  console.log('已根据 config.example.json 生成 config.json，请在设置面板的「数据源」中改成你自己的笔记目录。');
}
let config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
let configMtime = fs.statSync(CONFIG_FILE).mtimeMs;
// 可用环境变量 MARGINALIA_PORT 临时覆盖端口（不写回 config.json）
const PORT = Number(process.env.MARGINALIA_PORT) || config.port;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.resolve(ROOT, config.dataDir || 'data');
const COVERS_DIR = path.join(DATA_DIR, 'covers');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

for (const d of [DATA_DIR, COVERS_DIR]) fs.mkdirSync(d, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}
const json = (res, code, obj) => send(res, code, JSON.stringify(obj));

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ---------- 设置（持久化到项目 data/ 下） ----------
const DEFAULT_SETTINGS = {
  layout: 'shelf',      // shelf | cards | timeline | scroll | daily
  theme: 'paper',       // paper | ink | celadon | night | mocha | mono
  font: 'song',         // song | kai | hei
  fontSize: 17,
  lineHeight: 1.9,
  measure: 780,         // 版心宽度 px
  accent: '',           // '' = 跟随主题
  showCover: true,
  showChapter: true,
  showDate: true,
  showCategory: true,
};

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function saveSettings(body) {
  const incoming = JSON.parse(body);
  if (typeof incoming !== 'object' || incoming === null || Array.isArray(incoming)) {
    throw new Error('settings must be an object');
  }
  const merged = { ...loadSettings() };
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (k in incoming) merged[k] = incoming[k];
  }
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

// ---------- 数据源（config.json → sourceDirs，运行时可改，无需重启） ----------
const IS_WIN = process.platform === 'win32';

// 手动编辑 config.json 后也能即时生效：mtime 变化时重读
function currentSourceDirs() {
  try {
    const m = fs.statSync(CONFIG_FILE).mtimeMs;
    if (m !== configMtime) {
      const next = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      configMtime = m;
      config = { ...config, ...next };
      pruneCache(config.sourceDirs || []);
      console.log(`[sources] 检测到 config.json 变更，已重新加载数据源`);
    }
  } catch (err) {
    console.error(`[sources] 重读 config.json 失败，继续使用内存配置：${err.message}`);
  }
  return Array.isArray(config.sourceDirs) ? config.sourceDirs : [];
}

function isAbsoluteDir(p) {
  return IS_WIN ? /^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/.test(p) : path.isAbsolute(p);
}

// 校验并规范化路径列表；失败时抛出带中文说明的错误
async function validateSourceDirs(list) {
  if (!Array.isArray(list)) throw new Error('sourceDirs 必须是路径数组');
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    if (typeof raw !== 'string') throw new Error('路径必须是字符串');
    const t = raw.trim().replace(/^"(.*)"$/, '$1').trim();
    if (!t) continue;
    if (!isAbsoluteDir(t)) throw new Error(`「${t}」不是绝对路径，请填写完整路径（如 D:\\笔记\\微信读书）`);
    const norm = path.resolve(t).replace(/(?<=.)[\\/]+$/, '');
    const key = IS_WIN ? norm.toLowerCase() : norm;
    if (seen.has(key)) continue;
    seen.add(key);
    const info = await inspectSource(norm);
    if (!info.exists) throw new Error(`「${norm}」不存在`);
    if (!info.isDirectory) throw new Error(`「${norm}」不是文件夹`);
    if (!info.readable) throw new Error(`「${norm}」无法读取：${info.error}`);
    out.push(norm);
  }
  if (!out.length) throw new Error('至少需要保留一个数据源目录');
  return out;
}

// 原子写入 config.json：先写临时文件再重命名，保留其他字段
function writeConfig(next) {
  const tmp = CONFIG_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, CONFIG_FILE);
  configMtime = fs.statSync(CONFIG_FILE).mtimeMs;
}

async function listSources() {
  const dirs = currentSourceDirs();
  return { sourceDirs: await Promise.all(dirs.map((d) => inspectSource(d))) };
}

async function saveSources(body) {
  let incoming;
  try { incoming = JSON.parse(body || '{}'); } catch { throw httpError(400, '请求体不是合法的 JSON'); }
  let dirs;
  try { dirs = await validateSourceDirs(incoming && incoming.sourceDirs); } catch (err) { throw httpError(400, err.message); }
  let onDisk = {};
  try { onDisk = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch {}
  const next = { ...onDisk, sourceDirs: dirs };
  writeConfig(next);
  config = { ...config, sourceDirs: dirs };
  pruneCache(dirs);
  console.log(`[sources] 数据源已更新：\n  ${dirs.join('\n  ')}`);
  return listSources();
}

async function checkSource(body) {
  let incoming;
  try { incoming = JSON.parse(body || '{}'); } catch { throw httpError(400, '请求体不是合法的 JSON'); }
  const raw = typeof incoming.path === 'string' ? incoming.path.trim().replace(/^"(.*)"$/, '$1').trim() : '';
  if (!raw) throw httpError(400, '请填写路径');
  if (!isAbsoluteDir(raw)) {
    return { path: raw, exists: false, isDirectory: false, readable: false, count: 0, error: '不是绝对路径' };
  }
  return inspectSource(path.resolve(raw).replace(/(?<=.)[\\/]+$/, ''));
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// ---------- 封面代理（缓存到 data/covers/） ----------
function coverFile(id) {
  for (const ext of ['.jpg', '.png', '.webp']) {
    const f = path.join(COVERS_DIR, id + ext);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

async function serveCover(req, res, id) {
  const safe = id.replace(/[^A-Za-z0-9_-]/g, '');
  if (!safe) return send(res, 400, 'bad id', 'text/plain');
  const cached = coverFile(safe);
  if (cached) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(cached)] || 'image/jpeg', 'Cache-Control': 'public, max-age=86400' });
    return fs.createReadStream(cached).pipe(res);
  }
  if (!config.cacheCovers) return send(res, 404, 'no cover', 'text/plain');
  const { books } = await getLibrary(currentSourceDirs());
  const book = books.find((b) => b.bookId === safe);
  if (!book || !book.cover) return send(res, 404, 'no cover', 'text/plain');
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const resp = await fetch(book.cover, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const type = (resp.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    const ext = type === 'image/png' ? '.png' : type === 'image/webp' ? '.webp' : '.jpg';
    const buf = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(path.join(COVERS_DIR, safe + ext), buf);
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' });
    res.end(buf);
  } catch (err) {
    console.error(`[cover] ${safe}: ${err.message}`);
    send(res, 404, 'cover fetch failed', 'text/plain');
  }
}

// ---------- 静态文件 ----------
function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== PUBLIC_DIR) {
    return send(res, 403, 'forbidden', 'text/plain');
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'not found', 'text/plain');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
}

// ---------- 路由 ----------
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const p = u.pathname;
  try {
    if (p === '/api/books') {
      const lib = await getLibrary(currentSourceDirs());
      return json(res, 200, lib);
    }
    if (p === '/api/sources') {
      if (req.method === 'POST') return json(res, 200, await saveSources(await readBody(req)));
      return json(res, 200, await listSources());
    }
    if (p === '/api/sources/check') {
      if (req.method !== 'POST') return send(res, 405, 'POST only', 'text/plain');
      return json(res, 200, await checkSource(await readBody(req)));
    }
    if (p === '/api/settings') {
      if (req.method === 'POST') {
        const body = await readBody(req);
        const saved = await saveSettings(body);
        console.log(`[settings] 已保存 (layout=${saved.layout}, theme=${saved.theme})`);
        return json(res, 200, saved);
      }
      return json(res, 200, loadSettings());
    }
    if (p === '/api/cover') return await serveCover(req, res, u.searchParams.get('id') || '');
    if (p === '/api/ping') return json(res, 200, { ok: true, time: new Date().toISOString() });
    if (p.startsWith('/api/')) return send(res, 404, 'unknown api', 'text/plain');
    return serveStatic(req, res, p);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(`[server] ${req.method} ${p}: ${err.message}`);
    json(res, status, { error: err.message });
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用。请在 config.json 中更换 port 后重试。`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, config.host || '127.0.0.1', () => {
  console.log(`Marginalia · 书斋已开张：http://${config.host || '127.0.0.1'}:${PORT}`);
  console.log(`数据源（只读）：\n  ${config.sourceDirs.join('\n  ')}`);
  console.log(`项目数据目录：${DATA_DIR}`);
});
