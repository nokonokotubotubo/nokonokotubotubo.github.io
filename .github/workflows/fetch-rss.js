console.log('🔍 fetch-rss.js実行開始');
console.log('📅 実行環境:', process.version, process.platform);

process.on('uncaughtException', (error) => {
  console.error('💥 未処理の例外が発生しました:', error);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('💥 未処理のPromise拒否:', reason);
  process.exit(1);
});

const fs = require('fs');
const xml2js = require('xml2js');
const fetch = require('node-fetch');
const Mecab = require('mecab-async');
const mecab = new Mecab();

// ---- MeCab辞書自動検出 ---
async function setupMecab() {
  console.log('🔍 MeCab辞書パス検索開始...');
  const possiblePaths = [
    '/usr/lib/mecab/dic/mecab-ipadic-neologd',
    '/usr/lib/x86_64-linux-gnu/mecab/dic/mecab-ipadic-neologd',
    '/var/lib/mecab/dic/mecab-ipadic-neologd',
    '/usr/share/mecab/dic/mecab-ipadic-neologd'
  ];
  for (const path of possiblePaths) {
    try {
      mecab.command = `mecab -d ${path}`;
      const testResult = await mecabParsePromise('テスト');
      if (testResult && testResult.length > 0) {
        console.log(`✅ MeCab辞書パス確定: ${path}`);
        return true;
      }
    } catch {}
  }
  try {
    mecab.command = 'mecab';
    const testResult = await mecabParsePromise('テスト');
    if (testResult && testResult.length > 0) {
      console.log('✅ MeCab標準辞書で動作確認');
      return true;
    }
  } catch {}
  return false;
}

function mecabParsePromise(text) {
  return new Promise((resolve, reject) => {
    if (!text || text.trim().length === 0) {
      resolve([]);
      return;
    }
    mecab.parse(text, (err, result) => {
      if (err) reject(err);
      resolve(result || []);
    });
  });
}

async function loadOPML() {
  const opmlPath = './.github/workflows/rsslist.xml';
  if (!fs.existsSync(opmlPath)) {
    console.error(`❌ OPMLファイルが見つかりません: ${opmlPath}`);
    return [];
  }
  const opmlContent = fs.readFileSync(opmlPath, 'utf8');
  const parser = new xml2js.Parser();
  const result = await parser.parseStringPromise(opmlContent);
  if (!result.opml || !result.opml.body || !result.opml.body[0] || !result.opml.body[0].outline) {
    console.error('❌ OPML構造が不正です');
    return [];
  }
  const feeds = [];
  const outlines = result.opml.body[0].outline;
  outlines.forEach(folder => {
    if (folder.outline) {
      folder.outline.forEach(feed => {
        feeds.push({
          id: `rss_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          url: feed.$.xmlUrl,
          title: feed.$.title,
          folderId: feed.$.folderId || 'default-general',
          lastUpdated: new Date().toISOString(),
          isActive: true
        });
      });
    }
  });
  console.log(`📋 OPML読み込み完了: ${feeds.length}個のフィードを検出`);
  return feeds;
}

async function fetchAndParseRSS(url, title) {
  try {
    console.log(`🔍 [${title}] RSS取得開始: ${url}`);
    const response = await fetch(url, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Minews/1.0; +https://github.com)' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const xmlContent = await response.text();
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false, trim: true });
    const result = await parser.parseStringPromise(xmlContent);
    let items = [];
    if (result.rss && result.rss.channel && result.rss.channel.item) {
      items = Array.isArray(result.rss.channel.item) ? result.rss.channel.item : [result.rss.channel.item];
    } else if (result.feed && result.feed.entry) {
      items = Array.isArray(result.feed.entry) ? result.feed.entry : [result.feed.entry];
    } else if (result['rdf:RDF'] && result['rdf:RDF'].item) {
      items = Array.isArray(result['rdf:RDF'].item) ? result['rdf:RDF'].item : [result['rdf:RDF'].item];
    }
    const articles = [];
    for (const item of items.slice(0, 20)) {
      const article = await parseRSSItem(item, url, title);
      if (article) articles.push(article);
    }
    console.log(`🎉 [${title}] 取得完了: ${articles.length}件`);
    return articles;
  } catch (error) {
    console.error(`❌ [${title}] RSS取得エラー: ${error.message}`);
    return [];
  }
}

// --- "全て絶対に除外されない" 安全なURL抽出ロジック ---
function extractUrlFromItem(item) {
  // link: string
  if (typeof item.link === 'string' && looksLikeUrl(item.link)) return item.link;
  // link: object
  if (typeof item.link === 'object' && item.link) {
    if (item.link.$ && item.link.$.href && looksLikeUrl(item.link.$.href)) return item.link.$.href;
    if (item.link.href && looksLikeUrl(item.link.href)) return item.link.href;
    if (item.link._ && looksLikeUrl(item.link._)) return item.link._;
  }
  // link: array
  if (Array.isArray(item.link)) {
    for (const l of item.link) {
      if (l && l.$ && l.$.rel === 'alternate' && looksLikeUrl(l.$.href)) return l.$.href;
    }
    for (const l of item.link) {
      if (l && l.href && looksLikeUrl(l.href)) return l.href;
      if (l && l._ && looksLikeUrl(l._)) return l._;
      if (typeof l === 'string' && looksLikeUrl(l)) return l;
    }
  }
  // rdf:about（RDF型）
  if (item['rdf:about'] && looksLikeUrl(item['rdf:about'])) return item['rdf:about'];
  // guid
  if (item.guid) {
    if (typeof item.guid === 'object') {
      if (item.guid._ && looksLikeUrl(item.guid._)) return item.guid._;
    } else if (looksLikeUrl(item.guid)) return item.guid;
  }
  // url
  if (item.url && looksLikeUrl(item.url)) return item.url;
  // id
  if (item.id && looksLikeUrl(item.id)) return item.id;
  return null;
}
function looksLikeUrl(v) {
  return typeof v === 'string' && /^https?:\/\//.test(v.trim());
}

async function parseRSSItem(item, sourceUrl, feedTitle) {
  try {
    const title = cleanText(item.title || '');
    const link = extractUrlFromItem(item);
    const description = cleanText(item.description || item.summary || item.content?._ || item.content || '');
    const pubDate = item.pubDate || item.published || item.updated || item.date || new Date().toISOString();
    const category = cleanText(item.category?._ || item.category || 'General');
    if (!title || !link) {
      console.log(`❌ [${feedTitle}] 記事除外: タイトル="${title || 'なし'}", リンク="${link || 'なし'}"`);
      console.log(`   item構造:`, JSON.stringify(item, null, 2).substring(0, 500));
      return null;
    }
    const cleanDescription = description.substring(0, 300) || '記事の概要は提供されていません';
    const keywords = await extractKeywordsWithMecab(title + ' ' + cleanDescription);
    return {
      id: `rss_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: title.trim(),
      url: link.trim(),
      content: cleanDescription,
      publishDate: parseDate(pubDate),
      rssSource: feedTitle,
      category: category.trim(),
      readStatus: 'unread',
      readLater: false,
      userRating: 0,
      keywords,
      fetchedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error(`❌ [${feedTitle}] 記事解析エラー:`, error);
    return null;
  }
}

function cleanText(text) {
  if (typeof text !== 'string' || !text) return '';
  return text.replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(dateString) {
  if (!dateString) return new Date().toISOString();
  try {
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

async function extractKeywordsWithMecab(text) {
  const MAX_KEYWORDS = 8, MIN_LENGTH = 2;
  const stopWords = new Set(['これ', 'それ', 'この', 'その', 'です', 'ます', 'である', 'だっ', 'する', 'なる', 'ある', 'いる', 'こと', 'もの', 'ため', 'よう']);
  try {
    const clean = text.replace(/[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBFa-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const parsed = await mecabParsePromise(clean);
    if (!Array.isArray(parsed) || parsed.length === 0) return [];
    const keywords = new Map();
    parsed.forEach(token => {
      if (!Array.isArray(token) || token.length < 2) return;
      const surface = token[0];
      const features = Array.isArray(token[1]) ? token[1] : [token[1]];
      const pos = features[0];
      const baseForm = features[6] || surface;
      const isValid = pos === '名詞' || pos === '固有名詞'
        || (pos === '動詞' && features[1] === '自立')
        || (pos === '形容詞' && features[1] === '自立');
      if (!isValid) return;
      const keyword = (baseForm && baseForm !== '*' && baseForm !== surface) ? baseForm : surface;
      if (keyword.length >= MIN_LENGTH && !stopWords.has(keyword) && !/^[0-9]+$/.test(keyword)) {
        const count = keywords.get(keyword) || 0;
        keywords.set(keyword, count + 1);
      }
    });
    return Array.from(keywords.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, MAX_KEYWORDS)
      .map(([keyword]) => keyword);
  } catch { return []; }
}

async function main() {
  try {
    const startTime = Date.now();
    console.log('🚀 RSS記事取得開始（完全パターン網羅型）');
    if (!await setupMecab()) {
      console.error('❌ MeCabの設定に失敗しました');
      process.exit(1);
    }
    const feeds = await loadOPML();
    if (feeds.length === 0) {
      console.error('❌ フィードが取得できませんでした');
      process.exit(1);
    }
    const allArticles = [];
    let processedCount = 0, successCount = 0, errorCount = 0;
    for (const feed of feeds) {
      if (feed.isActive) {
        processedCount++;
        console.log(`\n🔄 [${processedCount}/${feeds.length}] 処理中: ${feed.title}`);
        try {
          const articles = await fetchAndParseRSS(feed.url, feed.title);
          allArticles.push(...articles);
          successCount++;
        } catch {
          errorCount++;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    const uniqueArticles = [];
    const seen = new Set();
    allArticles.forEach(article => {
      const key = `${article.title}_${article.rssSource}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueArticles.push(article);
      }
    });
    uniqueArticles.forEach(article => {
      const hours = (Date.now() - new Date(article.publishDate).getTime()) / (1000 * 60 * 60);
      const freshness = Math.exp(-hours / 72) * 20;
      article.aiScore = Math.max(0, Math.min(100, Math.round(freshness + 50)));
    });
    uniqueArticles.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
    const limitedArticles = uniqueArticles.slice(0, 1000);
    if (!fs.existsSync('./mss')) {
      fs.mkdirSync('./mss');
      console.log('📁 mssディレクトリを作成しました');
    }
    const output = {
      articles: limitedArticles,
      lastUpdated: new Date().toISOString(),
      totalCount: limitedArticles.length,
      processedFeeds: feeds.length,
      successfulFeeds: successCount
    };
    fs.writeFileSync('./mss/articles.json', JSON.stringify(output, null, 2));
    const totalTime = (Date.now() - startTime) / 1000;
    console.log('🎉 RSS記事取得完了!');
    console.log(`保存記事数: ${limitedArticles.length}件`);
    console.log(`最終更新: ${output.lastUpdated}`);
    console.log(`総実行時間: ${totalTime.toFixed(1)}秒`);
    console.log(`処理効率: ${(limitedArticles.length / totalTime).toFixed(1)}記事/秒`);
  } catch (error) {
    console.error('💥 main関数エラー:', error);
    process.exit(1);
  }
}

console.log('🚀 スクリプト実行開始');
main().catch(error => {
  console.error('💥 トップレベルエラー:', error);
  process.exit(1);
});
