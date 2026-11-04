'use strict';
/* Marginalia · 书斋 —— 微信读书摘抄馆 前端逻辑（原生 JS，无依赖） */

// 旧版 localStorage 键（shuzhai.*）迁移到 marginalia.*，避免丢失本地偏好
for (const k of ['settings', 'card']) {
  try {
    const old = localStorage.getItem('shuzhai.' + k);
    if (old !== null) {
      if (localStorage.getItem('marginalia.' + k) === null) localStorage.setItem('marginalia.' + k, old);
      localStorage.removeItem('shuzhai.' + k);
    }
  } catch {}
}

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const LAYOUTS = [
  { id: 'shelf', name: '书架' },
  { id: 'cards', name: '卡片' },
  { id: 'timeline', name: '时间轴' },
  { id: 'scroll', name: '书卷' },
  { id: 'daily', name: '每日一签' },
];
const THEMES = [
  { id: 'paper', name: '宣纸' }, { id: 'ink', name: '墨韵' }, { id: 'celadon', name: '青瓷' },
  { id: 'night', name: '夜航' }, { id: 'mocha', name: '咖啡' }, { id: 'mono', name: '极简' },
];
const FONTS = [
  { id: 'song', name: '宋体' }, { id: 'kai', name: '楷体' }, { id: 'hei', name: '黑体' },
];
const STATUSES = [{ id: '', name: '全部' }, { id: '4', name: '读完' }, { id: '2', name: '在读' }];
const THEME_ACCENTS = {
  paper: '#9a6b41', ink: '#c8a464', celadon: '#4e8d7c',
  night: '#82aede', mocha: '#a2603a', mono: '#1d1d1f',
};
const THEME_DOTS = {
  paper: ['#f6f1e6', '#9a6b41'], ink: ['#191919', '#c8a464'], celadon: ['#edf2ec', '#4e8d7c'],
  night: ['#0f1622', '#82aede'], mocha: ['#efe4d7', '#a2603a'], mono: ['#fafafa', '#1d1d1f'],
};

const DEFAULTS = {
  layout: 'shelf', theme: 'paper', font: 'song',
  fontSize: 17, lineHeight: 1.9, measure: 780, accent: '',
  showCover: true, showChapter: true, showDate: true, showCategory: true,
};

const state = {
  books: [],
  settings: { ...DEFAULTS },
  q: '', cat: '', status: '',
  dailyOffset: 0,
  saveTimer: null,
  searchTimer: null,
  srcCount: 0,
};

/* ================= 数据 ================= */

function filteredBooks() {
  const q = state.q.trim().toLowerCase();
  return state.books.filter((b) => {
    if (state.cat && b.categoryTop !== state.cat) return false;
    if (state.status && b.readingStatus !== state.status) return false;
    if (!q) return true;
    return [b.title, b.author, b.category].some((f) => String(f).toLowerCase().includes(q))
      || b.chapters.some((c) => c.quotes.some((t) => t.toLowerCase().includes(q)));
  });
}

function filteredQuotes() {
  const q = state.q.trim().toLowerCase();
  const out = [];
  for (const b of filteredBooks()) {
    const bookHit = q && (b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q));
    for (const c of b.chapters) {
      for (const t of c.quotes) {
        if (q && !bookHit && !t.toLowerCase().includes(q)) continue;
        out.push({
          book: b, chapter: c.title, text: t,
          date: b.finishedDate || b.readingDate || b.created || '',
        });
      }
    }
  }
  return out;
}

const fmtChars = (n) => (n >= 10000 ? (n / 10000).toFixed(1) + ' 万' : String(n || 0));

/* ================= 片段模板 ================= */

function coverHtml(b, cls = '') {
  if (!state.settings.showCover) {
    return `<div class="cover-fallback ${cls}"><span>${esc(b.title)}</span></div>`;
  }
  return `<div class="cover-wrap ${cls}">
    <img loading="lazy" alt="${esc(b.title)}" src="/api/cover?id=${encodeURIComponent(b.bookId)}"
      onerror="this.closest('.cover-wrap').classList.add('no-img')">
    <div class="cover-fallback"><span>${esc(b.title)}</span></div>
  </div>`;
}

const emptyHtml = () =>
  `<div class="empty">书斋暂无匹配的内容。<br><small>试试清空搜索框，或更换上方筛选。</small></div>`;

function quoteMeta(x) {
  return [
    state.settings.showChapter ? esc(x.chapter) : '',
    state.settings.showDate && x.date ? esc(x.date.slice(0, 10)) : '',
  ].filter(Boolean).join(' · ');
}

/* ================= 五种版式 ================= */

function renderShelf(el) {
  const groups = new Map();
  for (const b of filteredBooks()) {
    const k = b.categoryTop || '未分类';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(b);
  }
  el.innerHTML = [...groups.entries()].map(([cat, list]) => `
    <section class="cat-section">
      ${state.settings.showCategory ? `<h2 class="cat-title">${esc(cat)}<small>${list.length} 本</small></h2>` : ''}
      <div class="book-grid">
        ${list.map((b) => `
          <figure class="book-card" data-book="${esc(b.bookId)}" title="打开《${esc(b.title)}》">
            ${coverHtml(b)}
            <figcaption>
              <div class="book-title">${esc(b.title)}</div>
              <div class="book-sub">${esc(b.author)}${state.settings.showDate && (b.finishedDate || b.readingDate)
                ? ' · ' + esc((b.finishedDate || b.readingDate).slice(0, 7)) : ''}</div>
              <div class="book-n">${b.highlightCount} 条划线${b.reviewCount ? ' · 书评 ' + b.reviewCount : ''}</div>
            </figcaption>
          </figure>`).join('')}
      </div>
    </section>`).join('') || emptyHtml();
}

function renderCards(el) {
  const quotes = filteredQuotes();
  el.innerHTML = quotes.length
    ? `<div class="masonry">${quotes.map((x) => `
      <article class="q-card">
        <span class="q-mark">「</span>
        <p class="q-text">${esc(x.text)}</p>
        <div class="q-meta">
          <span class="q-book" data-book="${esc(x.book.bookId)}">——《${esc(x.book.title)}》</span>
          <span class="q-sub">${quoteMeta(x)}</span>
          <button class="copy-btn" data-card="${regQuote(x)}">制卡</button>
          <button class="copy-btn" data-copy="${esc(x.text)}">复制</button>
        </div>
      </article>`).join('')}</div>`
    : emptyHtml();
}

function renderTimeline(el) {
  const quotes = filteredQuotes().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!quotes.length) return (el.innerHTML = emptyHtml());
  const groups = new Map();
  for (const x of quotes) {
    const d = x.date ? x.date.slice(0, 10) : '日期未知';
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(x);
  }
  el.innerHTML = `<div class="timeline">${[...groups.entries()].map(([d, list]) => `
    <div class="tl-group">
      <div class="tl-date">${esc(d)}<small>${list.length} 条摘抄</small></div>
      <div class="tl-body">${list.map((x) => `
        <div class="tl-item">
          <div class="tl-dot"></div>
          <p class="q-text">${esc(x.text)}</p>
          <div class="tl-meta">
            <span class="q-book" data-book="${esc(x.book.bookId)}">《${esc(x.book.title)}》</span>${state.settings.showChapter ? ' · ' + esc(x.chapter) : ''}
            <button class="copy-btn" data-card="${regQuote(x)}">制卡</button>
            <button class="copy-btn" data-copy="${esc(x.text)}">复制</button>
          </div>
        </div>`).join('')}</div>
    </div>`).join('')}</div>`;
}

function renderScroll(el) {
  const books = filteredBooks();
  el.innerHTML = books.length
    ? `<div class="scroll-wrap">${books.map((b) => `
      <article class="scroll-book">
        <header class="sb-head">
          ${coverHtml(b)}
          <div>
            <h2 class="sb-title">${esc(b.title)}</h2>
            <div class="sb-meta">${esc(b.author)}${b.publisher ? ' · ' + esc(b.publisher) : ''}</div>
            <div class="sb-meta">${state.settings.showDate && b.finishedDate ? '读完于 ' + esc(b.finishedDate.slice(0, 10)) + ' · ' : ''}${b.highlightCount} 条划线 · 约 ${fmtChars(b.charCount)} 字</div>
          </div>
        </header>
        ${b.chapters.map((c) => `
          <section>
            ${state.settings.showChapter ? `<h3 class="ch-title">${esc(c.title)}</h3>` : ''}
            ${c.quotes.map((t) => `<blockquote class="sq"><p>${esc(t)}</p></blockquote>`).join('')}
          </section>`).join('')}
        ${b.review ? `<div class="review-box"><h4>书 评</h4><p>${esc(b.review).replace(/\n/g, '<br>')}</p></div>` : ''}
      </article>`).join('')}</div>`
    : emptyHtml();
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function renderDaily(el) {
  const quotes = filteredQuotes();
  if (!quotes.length) return (el.innerHTML = emptyHtml());
  const today = new Date().toLocaleDateString('sv'); // YYYY-MM-DD（本地时区）
  const x = quotes[(hashStr(today) + state.dailyOffset) % quotes.length];
  el.innerHTML = `<div class="daily-stage"><div class="daily-card">
    <div class="d-tag">每 日 一 签 · ${esc(today)}</div>
    <p class="d-text">${esc(x.text)}</p>
    <div class="d-meta">
      <span class="q-book" data-book="${esc(x.book.bookId)}">——《${esc(x.book.title)}》</span>
      ${x.book.author ? esc(x.book.author) : ''}${state.settings.showChapter ? ' · ' + esc(x.chapter) : ''}
    </div>
    <div class="d-actions">
      <button class="btn" id="redrawBtn">再 抽 一 签</button>
      <button class="btn ghost" data-card="${regQuote(x)}">制 卡</button>
      <button class="btn ghost" data-copy="${esc(x.text)}">复 制</button>
    </div>
  </div></div>`;
  $('#redrawBtn').addEventListener('click', () => {
    state.dailyOffset = Math.floor(Math.random() * 1e5);
    renderApp();
  });
}

const RENDERERS = {
  shelf: renderShelf, cards: renderCards, timeline: renderTimeline,
  scroll: renderScroll, daily: renderDaily,
};

function renderApp() {
  const el = $('#app');
  (RENDERERS[state.settings.layout] || renderShelf)(el);
}

/* ================= 筛选条与统计 ================= */

function renderChips() {
  const cats = new Map();
  for (const b of state.books) cats.set(b.categoryTop || '未分类', (cats.get(b.categoryTop || '未分类') || 0) + 1);
  const catChip = (id, name, count) =>
    `<button class="chip ${state.cat === id ? 'on' : ''}" data-cat="${esc(id)}">${esc(name)} <i>${count}</i></button>`;
  $('#chipbar').innerHTML = `
    <div class="chip-group">
      ${catChip('', '全部', state.books.length)}
      ${[...cats.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => catChip(c, c, n)).join('')}
    </div>
    <div class="chip-group">
      ${STATUSES.map((s) => `<button class="chip ${state.status === s.id ? 'on' : ''}" data-status="${esc(s.id)}">${esc(s.name)}</button>`).join('')}
    </div>`;
}

function renderStats() {
  const books = state.books;
  const hl = books.reduce((n, b) => n + b.highlightCount, 0);
  const chars = books.reduce((n, b) => n + b.charCount, 0);
  const reviews = books.reduce((n, b) => n + b.reviewCount, 0);
  $('#statsBar').innerHTML = `
    <span>共 ${books.length} 本书 · ${hl} 条划线 · 约 ${fmtChars(chars)} 字 · ${reviews} 篇书评</span>
    <span class="src">数据源：${state.srcCount ? state.srcCount + ' 个笔记目录' : 'Obsidian「微信读书」笔记'} · 只读</span>`;
}

/* ================= 书籍弹窗 ================= */

function openBook(id) {
  const b = state.books.find((x) => x.bookId === id);
  if (!b) return;
  $('#bookModal').innerHTML = `
    <button class="modal-close" id="modalClose" title="关闭">✕</button>
    <header class="bm-head">
      ${coverHtml(b)}
      <div>
        <h2>${esc(b.title)}</h2>
        <div class="bm-meta">${esc(b.author)} · ${esc(b.category)}</div>
        ${b.publisher ? `<div class="bm-meta">${esc(b.publisher)}${b.publishDate ? ' · ' + esc(b.publishDate) : ''}</div>` : ''}
        <div class="bm-tags">
          ${[b.statusLabel + (b.progress ? ' · ' + b.progress : ''),
             b.readingTime && '阅读时长 ' + b.readingTime,
             b.highlightCount + ' 条划线',
             b.isbn && 'ISBN ' + b.isbn].filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join('')}
        </div>
      </div>
    </header>
    <div class="bm-body">
      ${b.chapters.map((c) => `
        <section>
          ${state.settings.showChapter ? `<h3 class="ch-title">${esc(c.title)}</h3>` : ''}
          ${c.quotes.map((t) => {
            const q = { book: b, chapter: c.title, text: t, date: b.finishedDate || b.readingDate || b.created || '' };
            return `<blockquote class="sq"><p>${esc(t)}</p>
              <div class="sq-actions">
                <button class="copy-btn" data-card="${regQuote(q)}">制卡</button>
                <button class="copy-btn" data-copy="${esc(t)}">复制</button>
              </div>
            </blockquote>`;
          }).join('')}
        </section>`).join('')}
      ${b.review ? `<div class="review-box"><h4>书 评</h4><p>${esc(b.review).replace(/\n/g, '<br>')}</p></div>` : ''}
    </div>`;
  $('#modalBackdrop').hidden = false;
  document.body.classList.add('locked');
  $('#modalClose').addEventListener('click', closeBook);
}

function closeBook() {
  $('#modalBackdrop').hidden = true;
  document.body.classList.remove('locked');
}

/* ================= 设置 ================= */

function applySettings() {
  const s = state.settings;
  const html = document.documentElement;
  html.dataset.theme = s.theme;
  html.dataset.font = s.font;
  html.style.setProperty('--fs', s.fontSize + 'px');
  html.style.setProperty('--lh', s.lineHeight);
  html.style.setProperty('--measure', s.measure + 'px');
  if (s.accent) html.style.setProperty('--accent', s.accent);
  else html.style.removeProperty('--accent');
  syncControls();
}

function syncControls() {
  const s = state.settings;
  $$('#layoutSwitch button').forEach((b) => b.classList.toggle('on', b.dataset.layout === s.layout));
  $$('#setLayout .opt-card').forEach((b) => b.classList.toggle('on', b.dataset.layout === s.layout));
  $$('#setTheme .swatch').forEach((b) => b.classList.toggle('on', b.dataset.theme === s.theme));
  $$('#setFont button').forEach((b) => b.classList.toggle('on', b.dataset.font === s.font));
  $('#setFontSize').value = s.fontSize;
  $('#fsOut').textContent = s.fontSize + ' px';
  $('#setLineHeight').value = s.lineHeight;
  $('#lhOut').textContent = Number(s.lineHeight).toFixed(1);
  $('#setMeasure').value = s.measure;
  $('#mOut').textContent = s.measure + ' px';
  $('#setAccent').value = s.accent || THEME_ACCENTS[s.theme] || '#888888';
  $('#tgCover').checked = !!s.showCover;
  $('#tgChapter').checked = !!s.showChapter;
  $('#tgDate').checked = !!s.showDate;
  $('#tgCategory').checked = !!s.showCategory;
}

function setSetting(key, value) {
  state.settings[key] = value;
  applySettings();
  if (['layout', 'showCover', 'showChapter', 'showDate', 'showCategory'].includes(key)) renderApp();
  scheduleSave();
}

function scheduleSave() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => {
    try {
      const resp = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state.settings),
      });
      if (!resp.ok) throw new Error(await resp.text());
      localStorage.setItem('marginalia.settings', JSON.stringify(state.settings));
      $('#saveHint').textContent = '已保存 ✓ ' + new Date().toLocaleTimeString();
    } catch {
      $('#saveHint').textContent = '保存失败：服务未响应';
    }
  }, 450);
}

/* ================= 数据源 ================= */

// saved：服务端当前生效的列表；draft：抽屉里编辑中的列表（含检查结果）
const sources = { saved: [], draft: [], busy: false };

async function apiJson(url, opts) {
  const resp = await fetch(url, opts);
  let data = null;
  try { data = await resp.json(); } catch {}
  if (!resp.ok) throw new Error((data && data.error) || `服务返回 ${resp.status}`);
  return data;
}
const postJson = (url, body) => apiJson(url, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

const srcKey = (p) => p.toLowerCase().replace(/[\\/]+$/, '');
const srcDirty = () =>
  sources.draft.map((d) => d.path).join('\n') !== sources.saved.map((d) => d.path).join('\n');

function srcStatText(d) {
  if (d.checking) return '检查中…';
  if (d.error) return d.error;
  if (d.count == null) return '待检查';
  return d.count ? `${d.count} 本微信读书笔记` : '可读取，但没有找到微信读书笔记';
}

function srcMsg(text, kind = '') {
  const el = $('#srcMsg');
  el.textContent = text;
  el.className = 'src-msg' + (kind ? ' ' + kind : '');
}

function renderSources() {
  const savedKeys = new Set(sources.saved.map((d) => srcKey(d.path)));
  $('#srcList').innerHTML = sources.draft.length
    ? sources.draft.map((d, i) => `
      <li class="src-item ${d.error ? 'bad' : ''} ${savedKeys.has(srcKey(d.path)) ? '' : 'pending'}">
        <div class="src-body">
          <div class="src-path">${esc(d.path)}</div>
          <div class="src-stat">${esc(srcStatText(d))}${savedKeys.has(srcKey(d.path)) ? '' : ' · 未保存'}</div>
        </div>
        <button class="src-del" data-src-del="${i}" title="移除此目录">✕</button>
      </li>`).join('')
    : '<li class="src-empty">还没有数据源，请在下方添加一个文件夹。</li>';
  $('#srcOut').textContent = sources.draft.length ? sources.draft.length + ' 个' : '';
  const dirty = srcDirty();
  $('#srcSave').disabled = sources.busy || !dirty;
  $('#srcReset').disabled = sources.busy || !dirty;
  $('#srcCheck').disabled = sources.busy;
}

async function loadSources() {
  try {
    const data = await apiJson('/api/sources');
    sources.saved = data.sourceDirs || [];
    sources.draft = sources.saved.map((d) => ({ ...d }));
    state.srcCount = sources.saved.length;
    renderSources();
    if (state.books.length) renderStats();
  } catch (err) {
    $('#srcList').innerHTML = `<li class="src-empty">读取数据源失败：${esc(err.message)}</li>`;
  }
}

async function addSource() {
  const input = $('#srcInput');
  const raw = input.value.trim().replace(/^"(.*)"$/, '$1').trim();
  if (!raw) { srcMsg('请先填写文件夹路径', 'err'); return; }
  if (sources.draft.some((d) => srcKey(d.path) === srcKey(raw))) { srcMsg('这个目录已经在列表里了', 'err'); return; }
  sources.busy = true;
  renderSources();
  srcMsg('检查中…');
  try {
    const info = await postJson('/api/sources/check', { path: raw });
    if (info.error || !info.isDirectory) {
      srcMsg(`无法添加：${info.error || '不是文件夹'}`, 'err');
    } else if (sources.draft.some((d) => srcKey(d.path) === srcKey(info.path))) {
      srcMsg('这个目录已经在列表里了', 'err');
    } else {
      sources.draft.push(info);
      input.value = '';
      srcMsg(info.count
        ? `找到 ${info.count} 本微信读书笔记，已加入列表，点「保存并重新载入」生效`
        : '目录可读取，但里面没有找到微信读书笔记；仍已加入列表，确认无误再保存', info.count ? 'ok' : '');
    }
  } catch (err) {
    srcMsg('检查失败：' + err.message, 'err');
  } finally {
    sources.busy = false;
    renderSources();
  }
}

async function saveSources() {
  if (!sources.draft.length) { srcMsg('至少需要保留一个数据源目录', 'err'); return; }
  sources.busy = true;
  renderSources();
  srcMsg('保存中…');
  try {
    const data = await postJson('/api/sources', { sourceDirs: sources.draft.map((d) => d.path) });
    sources.saved = data.sourceDirs || [];
    sources.draft = sources.saved.map((d) => ({ ...d }));
    state.srcCount = sources.saved.length;
    await loadBooks();
    srcMsg(`已保存，当前共 ${state.books.length} 本书`, 'ok');
    toast('数据源已更新');
  } catch (err) {
    srcMsg('保存失败：' + err.message, 'err');
  } finally {
    sources.busy = false;
    renderSources();
  }
}

async function loadBooks() {
  const data = await apiJson('/api/books');
  state.books = data.books || [];
  if (state.cat && !state.books.some((b) => b.categoryTop === state.cat)) state.cat = '';
  renderChips();
  renderApp();
  renderStats();
}

/* ================= 复制与提示 ================= */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('已复制到剪贴板');
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 1600);
}

/* ================= 摘抄制卡 ================= */

// 摘抄注册表：渲染时登记，按钮持 id 引用，避免把长文塞进 DOM 属性
const quoteRegistry = new Map();
let quoteSeq = 0;
const regQuote = (x) => { const id = 'q' + (++quoteSeq); quoteRegistry.set(id, x); return id; };

// 卡片尺寸 900×1200，导出时 2 倍 = 1800×2400
const CARD_W = 900, CARD_H = 1200, CARD_SCALE = 2;

// 按字数适配字号
function qfs(text, sizes) {
  const n = text.length;
  return n <= 55 ? sizes[0] : n <= 110 ? sizes[1] : n <= 190 ? sizes[2] : sizes[3];
}
// 用户字号比例 → 实际像素（四舍五入保持数值干净）
const scaled = (px, o) => Math.round(px * (o.fontScale || 1));
const cardMetaStr = (x, o) => esc([
  o.chapter && x.chapter ? x.chapter : '',
  o.date && x.date ? x.date.slice(0, 10) : '',
].filter(Boolean).join(' · '));
const cardAuthor = (x, o) => (o.author && x.book.author ? ' ' + esc(x.book.author) : '');

const CARD_STYLES = [
  {
    id: 'paper', name: '宣纸', dot: ['#f7f1e3', '#9a6b41'],
    render(x, o) {
      const fs = scaled(qfs(x.text, [42, 36, 30, 26]), o);
      return `<div style="width:${CARD_W}px;height:${CARD_H}px;box-sizing:border-box;position:relative;background:#f7f1e3;font-family:Georgia,'Noto Serif SC','Songti SC',SimSun,serif;color:#3b3428;">
  <div style="position:absolute;inset:32px;border:2px solid rgba(150,115,72,.5);"></div>
  <div style="position:absolute;inset:42px;border:1px solid rgba(150,115,72,.28);"></div>
  <div style="position:absolute;top:78px;right:78px;width:58px;height:58px;background:#9a6b41;color:#fdf8ee;display:flex;align-items:center;justify-content:center;font-size:28px;">斋</div>
  <div style="position:absolute;top:116px;left:104px;font-size:110px;line-height:1;color:#9a6b41;opacity:.25;">「</div>
  <div style="position:absolute;top:230px;left:104px;right:104px;bottom:250px;display:flex;align-items:center;">
    <p data-cardtext="1" style="margin:0;font-size:${fs}px;line-height:2;text-align:justify;">${esc(x.text)}</p>
  </div>
  <div style="position:absolute;left:104px;right:104px;bottom:104px;">
    <div style="height:1px;background:rgba(150,115,72,.45);margin-bottom:22px;"></div>
    <div style="font-size:25px;">——《${esc(x.book.title)}》${cardAuthor(x, o)}</div>
    ${cardMetaStr(x, o) ? `<div style="margin-top:12px;font-size:17px;color:#8d8168;letter-spacing:.08em;">${cardMetaStr(x, o)}</div>` : ''}
  </div>
</div>`;
    },
  },
  {
    id: 'ink', name: '墨笺', dot: ['#1a1a19', '#c8a464'],
    render(x, o) {
      const fs = scaled(qfs(x.text, [44, 38, 32, 27]), o);
      return `<div style="width:${CARD_W}px;height:${CARD_H}px;box-sizing:border-box;position:relative;background:#1a1a19;font-family:Georgia,'Noto Serif SC','Songti SC',SimSun,serif;color:#ece7da;">
  <div style="position:absolute;inset:36px;border:1px solid rgba(200,164,100,.65);"></div>
  <div style="position:absolute;top:92px;left:0;right:0;text-align:center;font-size:64px;line-height:1;color:#c8a464;opacity:.7;">「</div>
  <div style="position:absolute;top:206px;left:110px;right:110px;bottom:290px;display:flex;align-items:center;justify-content:center;">
    <p data-cardtext="1" style="margin:0;font-size:${fs}px;line-height:2.1;text-align:center;">${esc(x.text)}</p>
  </div>
  <div style="position:absolute;left:0;right:0;bottom:168px;text-align:center;">
    <div style="width:64px;height:1px;background:#c8a464;margin:0 auto 26px;opacity:.8;"></div>
    <div style="font-size:26px;color:#d9cdb2;">——《${esc(x.book.title)}》${cardAuthor(x, o)}</div>
    <div style="margin-top:14px;font-size:17px;color:#8f8468;letter-spacing:.3em;">${cardMetaStr(x, o)}</div>
  </div>
  <div style="position:absolute;bottom:74px;left:0;right:0;text-align:center;font-size:44px;line-height:1;color:#c8a464;opacity:.7;">」</div>
</div>`;
    },
  },
  {
    id: 'vertical', name: '竖笺', dot: ['#f2ecdd', '#a33c2f'],
    render(x, o) {
      const fs = scaled(qfs(x.text, [34, 29, 25, 21]), o);
      const ls = (o.fontScale || 1) > 1.2 ? '.08em' : '.12em';
      return `<div style="width:${CARD_W}px;height:${CARD_H}px;box-sizing:border-box;position:relative;background:#f2ecdd;font-family:'Kaiti SC',STKaiti,KaiTi,'楷体','Noto Serif SC',serif;color:#33302a;">
  <div style="position:absolute;inset:30px;border:1px solid rgba(90,80,60,.35);"></div>
  <div style="position:absolute;inset:30px;border:4px solid rgba(90,80,60,.14);pointer-events:none;"></div>
  <div data-cardtext="1" style="position:absolute;top:86px;bottom:86px;right:110px;left:190px;writing-mode:vertical-rl;font-size:${fs}px;line-height:1.9;letter-spacing:${ls};">${esc(x.text)}</div>
  <div style="position:absolute;left:110px;bottom:96px;writing-mode:vertical-rl;font-size:19px;letter-spacing:.26em;color:#6f6753;max-height:360px;">${cardMetaStr(x, o) || '微信读书'}　——《${esc(x.book.title)}》${cardAuthor(x, o)}</div>
  <div style="position:absolute;left:100px;top:96px;width:56px;height:56px;background:#a33c2f;color:#f6efe0;display:flex;align-items:center;justify-content:center;font-size:26px;border-radius:6px;">斋</div>
</div>`;
    },
  },
  {
    id: 'note', name: '便签', dot: ['#fff9d9', '#e8b64c'],
    render(x, o) {
      const fs = scaled(qfs(x.text, [38, 33, 28, 24]), o);
      return `<div style="width:${CARD_W}px;height:${CARD_H}px;box-sizing:border-box;position:relative;background:#fbf6ea;font-family:'Kaiti SC',STKaiti,KaiTi,'楷体','Noto Serif SC',serif;">
  <div style="position:absolute;top:56px;left:330px;width:240px;height:46px;background:rgba(226,205,140,.55);transform:rotate(-2deg);"></div>
  <div style="position:absolute;top:92px;left:70px;right:70px;bottom:216px;background:#fff9d9;box-shadow:0 14px 34px rgba(120,100,40,.18);transform:rotate(-0.6deg);padding:96px 64px 60px;box-sizing:border-box;">
    <p data-cardtext="1" style="margin:0;font-size:${fs}px;line-height:2.05;color:#4a4232;text-align:justify;">${esc(x.text)}</p>
  </div>
  <div style="position:absolute;left:100px;right:100px;bottom:112px;">
    <div style="font-size:24px;color:#5c5240;">——《${esc(x.book.title)}》${cardAuthor(x, o)}</div>
    ${cardMetaStr(x, o) ? `<div style="margin-top:10px;font-size:17px;color:#9a8d6e;">${cardMetaStr(x, o)}</div>` : ''}
  </div>
</div>`;
    },
  },
  {
    id: 'minimal', name: '素卡', dot: ['#ffffff', '#1d1d1f'],
    render(x, o) {
      const fs = scaled(qfs(x.text, [40, 34, 28, 24]), o);
      return `<div style="width:${CARD_W}px;height:${CARD_H}px;box-sizing:border-box;position:relative;background:#ffffff;font-family:system-ui,'PingFang SC','Microsoft YaHei','Segoe UI',sans-serif;color:#1d1d1f;">
  <div style="position:absolute;top:96px;left:96px;bottom:96px;width:6px;background:#1d1d1f;"></div>
  <div style="position:absolute;top:150px;left:150px;right:110px;">
    <div style="font-size:15px;letter-spacing:.42em;color:#9a9a9e;margin-bottom:44px;">摘 抄</div>
    <p data-cardtext="1" style="margin:0;font-size:${fs}px;line-height:1.95;">${esc(x.text)}</p>
  </div>
  <div style="position:absolute;left:150px;right:110px;bottom:110px;border-top:1px solid #e8e8ea;padding-top:24px;">
    <div style="font-size:21px;color:#3c3c40;">《${esc(x.book.title)}》${cardAuthor(x, o)}</div>
    ${cardMetaStr(x, o) ? `<div style="margin-top:10px;font-size:15px;color:#9a9a9e;">${cardMetaStr(x, o)}</div>` : ''}
  </div>
</div>`;
    },
  },
  {
    id: 'dusk', name: '夜读', dot: ['#232c48', '#8f9fe8'],
    render(x, o) {
      const fs = scaled(qfs(x.text, [42, 36, 30, 25]), o);
      return `<div style="width:${CARD_W}px;height:${CARD_H}px;box-sizing:border-box;position:relative;background:linear-gradient(165deg,#1b2340 0%,#2a2545 55%,#3a2a52 100%);font-family:Georgia,'Noto Serif SC','Songti SC',SimSun,serif;color:#e9e7f4;">
  <div style="position:absolute;top:108px;left:0;right:0;text-align:center;font-size:20px;letter-spacing:.5em;color:#8f9fe8;">✦</div>
  <div style="position:absolute;top:226px;left:100px;right:100px;bottom:280px;display:flex;align-items:center;justify-content:center;">
    <p data-cardtext="1" style="margin:0;font-size:${fs}px;line-height:2.15;text-align:center;">${esc(x.text)}</p>
  </div>
  <div style="position:absolute;left:0;right:0;bottom:150px;text-align:center;">
    <div style="width:180px;height:1px;background:linear-gradient(to right,transparent,#8f9fe8,transparent);margin:0 auto 26px;"></div>
    <div style="font-size:25px;color:#cfd2ee;">——《${esc(x.book.title)}》${cardAuthor(x, o)}</div>
    <div style="margin-top:14px;font-size:16px;color:#7d84ad;letter-spacing:.3em;">${cardMetaStr(x, o)}</div>
  </div>
</div>`;
    },
  },
];

// 制卡偏好（样式与显示项），本地记忆
const CARD_DEFAULTS = { style: 'paper', chapter: true, date: true, author: true, fontScale: 1 };
let cardPref = { ...CARD_DEFAULTS };
try { Object.assign(cardPref, JSON.parse(localStorage.getItem('marginalia.card') || '{}')); } catch {}
const saveCardPref = () => localStorage.setItem('marginalia.card', JSON.stringify(cardPref));

const cardDesigner = { quote: null, html: '' };

function openCardDesigner(q) {
  cardDesigner.quote = q;
  $('#cardBackdrop').hidden = false;
  document.body.classList.add('locked');
  renderCardDesigner();
}

function closeCardDesigner() {
  $('#cardBackdrop').hidden = true;
  if ($('#modalBackdrop').hidden) document.body.classList.remove('locked');
}

// 离屏量尺：用与卡面完全一致的 900×1200 环境检测文字是否溢出
let cardProbe = null;
function ensureCardProbe() {
  if (!cardProbe) {
    cardProbe = document.createElement('div');
    cardProbe.style.cssText =
      'position:fixed;left:-30000px;top:0;width:900px;height:1200px;visibility:hidden;pointer-events:none;';
    document.body.appendChild(cardProbe);
  }
  cardProbe.innerHTML = '';
}

function cardTextOverflows(html) {
  cardProbe.innerHTML = html;
  const el = cardProbe.querySelector('[data-cardtext]');
  if (!el) return false;
  const box = el.parentElement || el;
  return box.scrollHeight > box.clientHeight + 2 || box.scrollWidth > box.clientWidth + 2;
}

function renderCardDesigner() {
  const x = cardDesigner.quote;
  if (!x) return;
  $('#cardStyles').innerHTML = CARD_STYLES.map((c) => `
    <button class="cd-style ${cardPref.style === c.id ? 'on' : ''}" data-cstyle="${c.id}">
      <span class="sw" style="background:linear-gradient(135deg, ${c.dot[0]} 55%, ${c.dot[1]} 55%)"></span>${c.name}
    </button>`).join('');
  $('#cdAuthor').checked = !!cardPref.author;
  $('#cdChapter').checked = !!cardPref.chapter;
  $('#cdDate').checked = !!cardPref.date;
  $('#cdFs').value = Math.round((cardPref.fontScale || 1) * 100);
  $('#cdFsOut').textContent = Math.round((cardPref.fontScale || 1) * 100) + '%';

  const def = CARD_STYLES.find((c) => c.id === cardPref.style) || CARD_STYLES[0];
  // 字号和谐保障：从用户选择的比例开始，若长文放不下则逐步微调到能容纳的最大值
  ensureCardProbe();
  let scale = Math.min(Math.max(cardPref.fontScale || 1, 0.5), 1.5);
  let auto = false;
  cardDesigner.html = def.render(x, { ...cardPref, fontScale: scale });
  while (scale > 0.5 && cardTextOverflows(cardDesigner.html)) {
    scale = Math.max(0.5, Math.round((scale - 0.05) * 100) / 100);
    cardDesigner.html = def.render(x, { ...cardPref, fontScale: scale });
    auto = true;
  }
  $('#cdFsHint').textContent = auto
    ? `长文较大，已自动适配为 ${Math.round(scale * 100)}% 保持版面协调`
    : '';

  const wrap = $('#cardStageWrap');
  const scale2 = Math.max(0.1, Math.min(
    (wrap.clientWidth - 36) / CARD_W,
    (wrap.clientHeight - 36) / CARD_H,
  ));
  const stage = $('#cardStage');
  stage.style.width = CARD_W * scale2 + 'px';
  stage.style.height = CARD_H * scale2 + 'px';
  stage.innerHTML = `<div class="cd-fit" style="width:${CARD_W}px;height:${CARD_H}px;transform:scale(${scale2});">${cardDesigner.html}</div>`;
}

// DOM 卡片 → SVG foreignObject → canvas → PNG
async function buildCardBlob() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W * CARD_SCALE}" height="${CARD_H * CARD_SCALE}" viewBox="0 0 ${CARD_W} ${CARD_H}">
<foreignObject width="${CARD_W}" height="${CARD_H}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${CARD_W}px;height:${CARD_H}px;overflow:hidden;margin:0;">${cardDesigner.html}</div></foreignObject></svg>`;
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error('卡片渲染失败'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W * CARD_SCALE;
  canvas.height = CARD_H * CARD_SCALE;
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return await new Promise((res) => canvas.toBlob(res, 'image/png'));
}

/* ================= 控件构建与事件 ================= */

function buildControls() {
  $('#layoutSwitch').innerHTML = LAYOUTS.map((l) => `<button data-layout="${l.id}">${l.name}</button>`).join('');
  $('#setLayout').innerHTML = LAYOUTS.map((l) => `<button class="opt-card" data-layout="${l.id}">${l.name}</button>`).join('');
  $('#setTheme').innerHTML = THEMES.map((t) =>
    `<button class="swatch" data-theme="${t.id}"><span class="dot"></span>${t.name}</button>`).join('');
  $$('#setTheme .dot').forEach((d) => {
    const sw = d.closest('.swatch');
    const [bg, ac] = THEME_DOTS[sw.dataset.theme];
    d.style.background = `linear-gradient(135deg, ${bg} 55%, ${ac} 55%)`;
    d.style.border = '1px solid rgba(0,0,0,.18)';
  });
  $('#setFont').innerHTML = FONTS.map((f) => `<button data-font="${f.id}">${f.name}</button>`).join('');
}

function bindEvents() {
  $('#layoutSwitch').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-layout]');
    if (b) setSetting('layout', b.dataset.layout);
  });
  $('#setLayout').addEventListener('click', (e) => {
    const b = e.target.closest('.opt-card');
    if (b) setSetting('layout', b.dataset.layout);
  });
  $('#setTheme').addEventListener('click', (e) => {
    const b = e.target.closest('.swatch');
    if (b) setSetting('theme', b.dataset.theme);
  });
  $('#setFont').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-font]');
    if (b) setSetting('font', b.dataset.font);
  });
  $('#setFontSize').addEventListener('input', (e) => setSetting('fontSize', Number(e.target.value)));
  $('#setLineHeight').addEventListener('input', (e) => setSetting('lineHeight', Number(e.target.value)));
  $('#setMeasure').addEventListener('input', (e) => setSetting('measure', Number(e.target.value)));
  $('#setAccent').addEventListener('input', (e) => setSetting('accent', e.target.value));
  $('#resetAccent').addEventListener('click', () => setSetting('accent', ''));
  $('#tgCover').addEventListener('change', (e) => setSetting('showCover', e.target.checked));
  $('#tgChapter').addEventListener('change', (e) => setSetting('showChapter', e.target.checked));
  $('#tgDate').addEventListener('change', (e) => setSetting('showDate', e.target.checked));
  $('#tgCategory').addEventListener('change', (e) => setSetting('showCategory', e.target.checked));

  $('#settingsBtn').addEventListener('click', () => {
    $('#settingsDrawer').hidden = false;
    $('#drawerBackdrop').hidden = false;
    if (!sources.busy && !srcDirty()) loadSources();
  });

  // ---- 数据源 ----
  $('#srcList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-src-del]');
    if (!b || sources.busy) return;
    sources.draft.splice(Number(b.dataset.srcDel), 1);
    srcMsg(sources.draft.length ? '已移除，点「保存并重新载入」生效' : '至少需要保留一个数据源目录', sources.draft.length ? '' : 'err');
    renderSources();
  });
  $('#srcCheck').addEventListener('click', addSource);
  $('#srcInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') addSource(); });
  $('#srcSave').addEventListener('click', saveSources);
  $('#srcReset').addEventListener('click', () => {
    sources.draft = sources.saved.map((d) => ({ ...d }));
    srcMsg('');
    renderSources();
  });
  const closeDrawer = () => {
    $('#settingsDrawer').hidden = true;
    $('#drawerBackdrop').hidden = true;
  };
  $('#closeSettings').addEventListener('click', closeDrawer);
  $('#drawerBackdrop').addEventListener('click', closeDrawer);

  $('#shuffleBtn').addEventListener('click', () => {
    state.dailyOffset = Math.floor(Math.random() * 1e5);
    setSetting('layout', 'daily');
  });

  $('#modalBackdrop').addEventListener('click', (e) => {
    if (e.target === $('#modalBackdrop')) closeBook();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeBook(); closeDrawer(); closeCardDesigner(); }
  });

  $('#searchInput').addEventListener('input', (e) => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      state.q = e.target.value;
      renderApp();
    }, 130);
  });

  document.addEventListener('click', (e) => {
    const cb = e.target.closest('[data-card]');
    if (cb) {
      const q = quoteRegistry.get(cb.dataset.card);
      if (q) openCardDesigner(q);
      return;
    }
    const cp = e.target.closest('[data-copy]');
    if (cp) { copyText(cp.dataset.copy); return; }
    const bk = e.target.closest('[data-book]');
    if (bk) { openBook(bk.dataset.book); return; }
    const cat = e.target.closest('[data-cat]');
    if (cat) { state.cat = cat.dataset.cat; renderChips(); renderApp(); return; }
    const st = e.target.closest('[data-status]');
    if (st) { state.status = st.dataset.status; renderChips(); renderApp(); }
  });

  // ---- 制卡器 ----
  $('#cardStyles').addEventListener('click', (e) => {
    const b = e.target.closest('.cd-style');
    if (b) { cardPref.style = b.dataset.cstyle; saveCardPref(); renderCardDesigner(); }
  });
  $('#cdAuthor').addEventListener('change', (e) => { cardPref.author = e.target.checked; saveCardPref(); renderCardDesigner(); });
  $('#cdChapter').addEventListener('change', (e) => { cardPref.chapter = e.target.checked; saveCardPref(); renderCardDesigner(); });
  $('#cdDate').addEventListener('change', (e) => { cardPref.date = e.target.checked; saveCardPref(); renderCardDesigner(); });
  const setCardFontScale = (v) => {
    cardPref.fontScale = Math.min(Math.max(v, 0.8), 1.5);
    saveCardPref();
    renderCardDesigner();
  };
  $('#cdFs').addEventListener('input', (e) => setCardFontScale(Number(e.target.value) / 100));
  $('#cdFsMinus').addEventListener('click', () => setCardFontScale((cardPref.fontScale || 1) - 0.05));
  $('#cdFsPlus').addEventListener('click', () => setCardFontScale((cardPref.fontScale || 1) + 0.05));
  $('#cdFsReset').addEventListener('click', () => setCardFontScale(1));
  $('#cardClose').addEventListener('click', closeCardDesigner);
  $('#cardBackdrop').addEventListener('click', (e) => {
    if (e.target === $('#cardBackdrop')) closeCardDesigner();
  });
  $('#cardExport').addEventListener('click', async () => {
    try {
      const blob = await buildCardBlob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `摘抄卡片《${cardDesigner.quote.book.title}》.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('已导出 PNG（1800 × 2400）');
    } catch (err) {
      toast('导出失败：' + err.message);
    }
  });
  $('#cardCopy').addEventListener('click', async () => {
    try {
      const blob = await buildCardBlob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('图片已复制，可直接粘贴');
    } catch {
      toast('复制失败，请使用「导出 PNG」');
    }
  });
  window.addEventListener('resize', () => {
    if (!$('#cardBackdrop').hidden) renderCardDesigner();
  });
}

/* ================= 启动 ================= */

(async function init() {
  try { Object.assign(state.settings, JSON.parse(localStorage.getItem('marginalia.settings') || '{}')); } catch {}
  buildControls();
  applySettings();
  bindEvents();

  try {
    const remote = await (await fetch('/api/settings')).json();
    state.settings = { ...DEFAULTS, ...remote };
    applySettings();
  } catch {}

  loadSources();
  try {
    await loadBooks();
  } catch {
    $('#app').innerHTML = `<div class="empty">无法连接 Marginalia 服务。<br><small>请先在本项目目录运行 <code>node server.js</code>，或双击「start.bat」。</small></div>`;
  }
})();
