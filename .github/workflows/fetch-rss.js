// ===============================================
// fetch-rss.js  ― YAKE! 版（ID安定化＋3語キーワード）
// Node.js 18 で確認
// ===============================================

console.log('🔍 fetch-rss.js 実行開始（YAKE! キーワード版）');

// 依存モジュール
const fs      = require('fs');
const xml2js  = require('xml2js');
const fetch   = require('node-fetch');
const Yake    = require('yake-js');

// ---------- 共通ユーティリティ ----------

// 安定ID生成
function generateStableIdForRSS(url, title, publishDate) {
  const base = `${url.trim().toLowerCase()}|${title.trim()}|${publishDate}`;
  let h = 0;
  for (let i = 0; i < base.length; i++) {
    h = ((h << 5) - h) + base.charCodeAt(i);
    h &= h;
  }
  return `stable_${Math.abs(h).toString(36)}_${base.length}`;
}

// YAKE! キーワード抽出（上位3語）
async function extractYakeKeywords(text) {
  const cleaned = text
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return [];

  const yake = new Yake({ lan: 'ja', max: 3, n: 1, dedupLim: 0.9 });
  const result = await yake.extract(cleaned);          // [{keyword, score}]
  return result
    .sort((a, b) => a.score - b.score)                 // 小さいほど関連度↑
    .map(k => k.keyword);
}

// 日付パース
function parseDate(d) {
  if (!d) return new Date().toISOString();
  const t = new Date(d);
  return isNaN(t.getTime()) ? new Date().toISOString() : t.toISOString();
}

// 不要タグ除去
function cleanText(t) {
  return (typeof t === 'string' ? t : '')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;|&gt;|&amp;|&quot;|&#39;|&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------- OPML 読み込み ----------------
async function loadOPML() {
  const opmlPath = './.github/workflows/rsslist.xml';
  if (!fs.existsSync(opmlPath)) {
    console.error(`❌ OPML がありません: ${opmlPath}`);
    return [];
  }
  const opml = fs.readFileSync(opmlPath, 'utf8');
  const result = await new xml2js.Parser().parseStringPromise(opml);

  const feeds = [];
  (result.opml.body[0].outline || []).forEach(folder => {
    if (folder.outline) {
      const folderName = folder.$.text || folder.$.title;
      folder.outline.forEach(f => feeds.push({
        id: generateStableIdForRSS(f.$.xmlUrl, f.$.title, new Date().toISOString()),
        url: f.$.xmlUrl,
        title: f.$.title,
        folderName,
        isActive: true
      }));
    }
  });
  return feeds;
}

// ---------------- RSS 解析 ----------------
function looksLikeUrl(v) {
  return typeof v === 'string' && /^https?:\/\//.test(v.trim());
}

function extractUrl(item) {
  if (typeof item.link === 'string' && looksLikeUrl(item.link)) return item.link;
  if (Array.isArray(item.link)) {
    for (const l of item.link) {
      if (l?.$?.rel === 'alternate' && looksLikeUrl(l.$.href)) return l.$.href;
      if (l?.$.href && looksLikeUrl(l.$.href)) return l.$.href;
    }
  }
  if (item.link?.$.href && looksLikeUrl(item.link.$.href)) return item.link.$.href;
  if (item.guid?._ && looksLikeUrl(item.guid._)) return item.guid._;
  return null;
}

async function parseItem(item, feed) {
  const title = cleanText(item.title || '');
  const link  = extractUrl(item);
  if (!title || !link) return null;

  const description = cleanText(item.description || item.summary || item.content?._ || item.content || '');
  const pubISO      = parseDate(item.pubDate || item.published || item.updated);
  const articleDate = new Date(pubISO);
  const now         = new Date();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400_000);
  if (articleDate < twoWeeksAgo || articleDate > now) return null;

  const keywords = await extractYakeKeywords(`${title} ${description.slice(0, 300)}`);

  return {
    id: generateStableIdForRSS(link, title, pubISO),
    title,
    url: link,
    content: description.slice(0, 300) || '記事の概要は提供されていません',
    publishDate: pubISO,
    rssSource: feed.title,
    category: cleanText(item.category?._ || item.category || 'General'),
    readStatus: 'unread',
    readLater: false,
    userRating: 0,
    keywords,
    fetchedAt: new Date().toISOString(),
    folderName: feed.folderName
  };
}

async function fetchFeed(feed) {
  console.log(`🔄 ${feed.title} 取得中…`);
  const res = await fetch(feed.url, { timeout: 15000, headers: { 'User-Agent': 'Minews/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const xml = await res.text();
  const result = await new xml2js.Parser({ explicitArray: false }).parseStringPromise(xml);

  let items = [];
  if (result.rss?.channel?.item)     items = [].concat(result.rss.channel.item);
  else if (result.feed?.entry)       items = [].concat(result.feed.entry);
  else if (result['rdf:RDF']?.item)  items = [].concat(result['rdf:RDF'].item);

  const parsed = [];
  for (const it of items.slice(0, 20)) {
    const art = await parseItem(it, feed);
    if (art) parsed.push(art);
  }
  console.log(`✅ ${feed.title}: ${parsed.length} 件`);
  return parsed;
}

// ---------------- メイン ----------------
(async () => {
  const feeds = await loadOPML();
  if (!feeds.length) process.exit(1);

  const all = [];
  for (const f of feeds) {
    try {
      const arts = await fetchFeed(f);
      all.push(...arts);
    } catch (e) {
      console.error(`❌ ${f.title}:`, e.message);
    }
    await new Promise(r => setTimeout(r, 1000)); // polite delay
  }

  // 重複除去
  const uniq = [];
  const seen = new Set();
  for (const a of all) {
    const k = `${a.title}_${a.rssSource}`;
    if (!seen.has(k)) { seen.add(k); uniq.push(a); }
  }

  uniq.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
  const limited = uniq.slice(0, 1000);

  if (!fs.existsSync('./mss')) fs.mkdirSync('./mss');
  fs.writeFileSync('./mss/articles.json', JSON.stringify({
    articles: limited,
    lastUpdated: new Date().toISOString(),
    totalCount: limited.length,
    processedFeeds: feeds.length
  }, null, 2));

  console.log(`🎉 完了: ${limited.length} 記事を保存`);
})();
