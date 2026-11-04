'use strict';
// 解析 weread2obsidian 导出的 Markdown 笔记（doc_type: weread-highlights-reviews）。
// 本模块对笔记文件只做读取（字符串处理），不存在任何写入操作。

const STATUS_LABELS = { '1': '想读', '2': '在读', '3': '读过', '4': '读完' };

function unquote(v) {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

// 极简 frontmatter 解析：key: value 与 key: 下的块式数组（  - item）
function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { data: {}, body: text };
  const data = {};
  let currentKey = null;
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const listItem = /^\s+-\s?(.*)$/.exec(line);
    if (listItem && currentKey) {
      if (!Array.isArray(data[currentKey])) data[currentKey] = [];
      data[currentKey].push(unquote(listItem[1]));
      continue;
    }
    const kv = /^([A-Za-z0-9_\u4e00-\u9fff-]+):\s?(.*)$/.exec(line);
    if (kv) {
      currentKey = kv[1];
      data[currentKey] = kv[2] ? unquote(kv[2]) : [];
      if (kv[2]) currentKey = null;
    }
  }
  return { data, body: text.slice(match[0].length) };
}

function cleanQuote(s) {
  return s.replace(/\s+/g, ' ').trim();
}

// 正文结构：封面图 → ### 书名 → 作者 → 出版行 → 划线统计行 → --- → ## 章节 + > 划线 … → ## 书评 + 纯文本
function parseBody(body) {
  const lines = body.split(/\r?\n/);
  const result = { publisher: '', publishDate: '', chapters: [], review: '' };

  let i = 0;
  // 出版行形如「文学-外国文学 · 上海译文出版社 · 2018-03-01 00:00:00」
  for (; i < lines.length; i++) {
    const m = /^(.+?)\s·\s(.+?)\s·\s(\d{4}-\d{2}-\d{2})/.exec(lines[i].trim());
    if (m) {
      result.publisher = m[2].trim();
      result.publishDate = m[3];
      break;
    }
    if (/^划线\s*\d+/.test(lines[i].trim())) break; // 没有出版行，直接到统计行
  }
  // 跳过统计行与其后的水平线
  for (; i < lines.length; i++) {
    if (/^---+\s*$/.test(lines[i])) { i++; break; }
  }

  let chapter = null;
  let inReview = false;
  const pushChapter = () => {
    if (chapter && chapter.quotes.length) result.chapters.push(chapter);
    chapter = null;
  };
  for (; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;
    const heading = /^#{1,6}\s+(.+?)\s*#*$/.exec(line);
    if (heading) {
      pushChapter();
      if (/^书评$/.test(heading[1].trim())) { inReview = true; continue; }
      inReview = false;
      chapter = { title: heading[1].trim(), quotes: [] };
      continue;
    }
    if (inReview) {
      result.review += (result.review ? '\n' : '') + line;
      continue;
    }
    if (line.startsWith('>')) {
      const text = cleanQuote(line.replace(/^>\s?/, ''));
      if (!text) continue;
      if (!chapter) chapter = { title: '正文', quotes: [] };
      chapter.quotes.push(text);
    }
  }
  pushChapter();
  result.review = result.review.trim();
  return result;
}

function parseBook(filePath, text, relCategory) {
  const { data, body } = parseFrontmatter(text);
  if (data.doc_type !== 'weread-highlights-reviews' || !data.title) return null;
  const parsed = parseBody(body);
  const category = String(data.category || relCategory || '未分类');
  const highlightCount = parsed.chapters.reduce((n, c) => n + c.quotes.length, 0);
  const statusKey = String(data.readingStatus || '');
  const charCount = parsed.chapters.reduce(
    (n, c) => n + c.quotes.reduce((m, q) => m + q.length, 0), 0
  );
  return {
    bookId: String(data.bookId || ''),
    title: String(data.title),
    author: String(data.author || '').replace(/^【.*?】\s*/, ''),
    cover: String(data.cover || ''),
    category,
    categoryTop: category.split('-')[0],
    readingStatus: statusKey,
    statusLabel: STATUS_LABELS[statusKey] || (data.finishedDate ? '读完' : '在读'),
    progress: String(data.progress || ''),
    readingTime: String(data.readingTime || ''),
    readingDate: String(data.readingDate || ''),
    finishedDate: String(data.finishedDate || ''),
    created: String(data.created || ''),
    isbn: String(data.isbn || ''),
    tags: Array.isArray(data.tags) ? data.tags : [],
    noteCount: Number(data.noteCount) || 0,
    reviewCount: Number(data.reviewCount) || 0,
    publisher: parsed.publisher,
    publishDate: parsed.publishDate,
    chapters: parsed.chapters,
    review: parsed.review,
    highlightCount,
    charCount,
    fileName: filePath.replace(/^.*[\\/]/, ''),
  };
}

module.exports = { parseBook, parseFrontmatter };
