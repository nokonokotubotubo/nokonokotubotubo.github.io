// エラー詳細出力版
console.log('🔍 fetch-rss.js実行開始');
console.log('📅 実行環境:', process.version, process.platform);

// 未処理の例外をキャッチ
process.on('uncaughtException', (error) => {
  console.error('💥 未処理の例外が発生しました:', error);
  console.error('スタックトレース:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 未処理のPromise拒否:', reason);
  console.error('Promise:', promise);
  process.exit(1);
});

// モジュール読み込み検証
try {
  console.log('📦 依存モジュール読み込み開始');
  const fs = require('fs');
  const xml2js = require('xml2js');
  const fetch = require('node-fetch');
  const Mecab = require('mecab-async');
  console.log('✅ 全モジュール読み込み成功');
} catch (error) {
  console.error('❌ モジュール読み込みエラー:', error);
  process.exit(1);
}

const fs = require('fs');
const xml2js = require('xml2js');
const fetch = require('node-fetch');
const Mecab = require('mecab-async');

// MeCabセットアップ
const mecab = new Mecab();

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
      console.log(`🔍 辞書パステスト: ${path}`);
      mecab.command = `mecab -d ${path}`;
      const testResult = await mecabParsePromise('テスト');
      if (testResult && testResult.length > 0) {
        console.log(`✅ MeCab辞書パス確定: ${path}`);
        return true;
      }
    } catch (error) {
      console.log(`❌ 辞書パス ${path} は無効: ${error.message}`);
    }
  }
  try {
    console.log('🔍 標準MeCab辞書テスト...');
    mecab.command = 'mecab';
    const testResult = await mecabParsePromise('テスト');
    if (testResult && testResult.length > 0) {
      console.log('✅ MeCab標準辞書で動作確認');
      return true;
    }
  } catch (error) {
    console.error('❌ MeCab標準辞書も失敗:', error.message);
  }
  return false;
}

function mecabParsePromise(text) {
  return new Promise((resolve, reject) => {
    if (!text || text.trim().length === 0) {
      resolve([]);
      return;
    }
    mecab.parse(text, (err, result) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(result || []);
    });
  });
}

async function loadOPML() {
  console.log('📋 OPML読み込み処理開始...');
  try {
    const opmlPath = './.github/workflows/rsslist.xml';
    console.log(`🔍 OPMLファイル確認: ${opmlPath}`);
    if (!fs.existsSync(opmlPath)) {
      console.error(`❌ OPMLファイルが見つかりません: ${opmlPath}`);
      return [];
    }
    const opmlContent = fs.readFileSync(opmlPath, 'utf8');
    console.log(`📄 OPMLファイル読み込み成功: ${opmlContent.length}文字`);
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(opmlContent);
    if (!result.opml || !result.opml.body || !result.opml.body[0] || !result.opml.body[0].outline) {
      console.error('❌ OPML構造が不正です');
      console.error('OPML内容:', JSON.stringify(result, null, 2).substring(0, 500));
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
  } catch (error) {
    console.error('❌ OPML読み込みエラー:', error);
    console.error('エラー詳細:', error.stack);
    return [];
  }
}

async function fetchAndParseRSS(url, title) {
  try {
    console.log(`🔍 [${title}] RSS取得開始: ${url}`);
    const response = await fetch(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Minews/1.0; +https://github.com)'
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const xmlContent = await response.text();
    console.log(`📄 [${title}] XML読み込み成功: ${xmlContent.length}文字`);
    const parser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: false,
      trim: true
    });
    const result = await parser.parseStringPromise(xmlContent);
    console.log(`🔍 [${title}] XML解析結果の構造確認:`);
    console.log(`   トップレベルキー: ${Object.keys(result).join(', ')}`);

    const articles = [];
    let items = [];
    if (result.rss && result.rss.channel && result.rss.channel.item) {
      items = Array.isArray(result.rss.channel.item) ? result.rss.channel.item : [result.rss.channel.item];
      console.log(`📊 [${title}] RSS形式検出: ${items.length}件のアイテム`);
    } else if (result.feed && result.feed.entry) {
      items = Array.isArray(result.feed.entry) ? result.feed.entry : [result.feed.entry];
      console.log(`📊 [${title}] Atom形式検出: ${items.length}件のエントリ`);
    } else if (result['rdf:RDF'] && result['rdf:RDF'].item) {
      items = Array.isArray(result['rdf:RDF'].item) ? result['rdf:RDF'].item : [result['rdf:RDF'].item];
      console.log(`📊 [${title}] RDF形式検出: ${items.length}件のitem`);
    } else {
      console.log(`❓ [${title}] 不明なXML構造:`);
      console.log(`   結果オブジェクト: ${JSON.stringify(result, null, 2).substring(0, 300)}...`);
    }

    console.log(`🔄 [${title}] アイテム解析開始: ${items.length}件を処理`);
    let validArticles = 0, invalidArticles = 0;
    for (const item of items.slice(0, 20)) {
      const article = await parseRSSItem(item, url, title);
      if (article) {
        articles.push(article); validArticles++;
        console.log(`✅ [${title}] 記事解析成功: "${article.title.substring(0, 50)}..."`);
      } else {
        invalidArticles++;
      }
    }
    console.log(`📈 [${title}] 解析完了: 有効記事${validArticles}件, 無効記事${invalidArticles}件`);
    console.log(`🎉 [${title}] 取得完了: ${articles.length}件`);
    return articles;
  } catch (error) {
    console.error(`❌ [${title}] RSS取得エラー: ${error.message}`);
    console.error(`   URL: ${url}`);
    console.error(`   エラータイプ: ${error.name}`);
    console.error(`   スタックトレース: ${error.stack}`);
    return [];
  }
}

// 🔧 修正: 配列内$.href構造に完全対応
function looksLikeUrl(v) {
  return typeof v === 'string' && /^https?:\/\//.test(v.trim());
}

function extractUrlFromItem(item) {
  // link: string
  if (typeof item.link === 'string' && looksLikeUrl(item.link)) return item.link;
  
  // link: object (非配列)
  if (typeof item.link === 'object' && item.link && !Array.isArray(item.link)) {
    if (item.link.$ && item.link.$.href && looksLikeUrl(item.link.$.href)) return item.link.$.href;
    if (item.link.href && looksLikeUrl(item.link.href)) return item.link.href;
    if (item.link._ && looksLikeUrl(item.link._)) return item.link._;
  }
  
  // link: array
  if (Array.isArray(item.link)) {
    // 優先順位1: rel="alternate" (標準Atom)
    for (const l of item.link) {
      if (l && l.$ && l.$.rel === 'alternate' && looksLikeUrl(l.$.href)) return l.$.href;
    }
    
    // 優先順位2: l.$.href (rel属性なしまたは他の値、ただしenclosureは除外)
    for (const l of item.link) {
      if (l && l.$ && l.$.href && l.$.rel !== 'enclosure' && looksLikeUrl(l.$.href)) return l.$.href;
    }
    
    // 優先順位3: その他のパターン
    for (const l of item.link) {
      if (l && l.href && looksLikeUrl(l.href)) return l.href;
      if (l && l._ && looksLikeUrl(l._)) return l._;
      if (typeof l === 'string' && looksLikeUrl(l)) return l;
    }
  }
  
  // その他のフォールバック
  if (item['rdf:about'] && looksLikeUrl(item['rdf:about'])) return item['rdf:about'];
  if (item.guid) {
    if (typeof item.guid === 'object') {
      if (item.guid._ && looksLikeUrl(item.guid._)) return item.guid._;
    } else if (looksLikeUrl(item.guid)) return item.guid;
  }
  if (item.url && looksLikeUrl(item.url)) return item.url;
  if (item.id && looksLikeUrl(item.id)) return item.id;
  
  return null;
}

async function parseRSSItem(item, sourceUrl, feedTitle) {
  try {
    console.log(`🔍 [${feedTitle}] 記事解析開始`);
    console.log(`   元データキー: ${Object.keys(item).join(', ')}`);
    const title = cleanText(item.title || '');
    const link = extractUrlFromItem(item);

    const description = cleanText(item.description || item.summary || item.content?._ || item.content || '');
    const pubDate = item.pubDate || item.published || item.updated || new Date().toISOString();
    const category = cleanText(item.category?._ || item.category || 'General');
    
    // 🔥 2週間制限フィルター＋未来日付除外
const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
const now = new Date();
const publishDate = parseDate(pubDate);
const articleDate = new Date(publishDate);

// 2週間を超えて古い記事は除外
if (articleDate < twoWeeksAgo) {
  console.log(`❌ [${feedTitle}] 記事除外（2週間超過）: "${title.substring(0, 30)}..."`);
  return null;
}

// 未来の日付の記事は除外
if (articleDate > now) {
  console.log(`❌ [${feedTitle}] 記事除外（未来日付）: "${title.substring(0, 30)}..."`);
  return null;
}

    
    console.log(`   タイトル: "${title}" (長さ: ${title.length})`);
    console.log(`   リンク: "${link}" (型: ${typeof link}, 長さ: ${link ? link.length : 0})`);
    console.log(`   説明: "${description.substring(0, 50)}..." (長さ: ${description.length})`);

    if (!title || !link) {
      console.log(`❌ [${feedTitle}] 記事除外: タイトル="${title || 'なし'}", リンク="${link || 'なし'}"`);
      if (!title) {
        console.log(`   タイトル候補:`, JSON.stringify(item.title));
      }
      if (!link) {
        console.log(`   リンク候補:`, JSON.stringify(item.link));
        console.log(`   url:`, JSON.stringify(item.url));
        console.log(`   guid:`, JSON.stringify(item.guid));
        console.log(`   id:`, JSON.stringify(item.id));
        console.log(`   rdf:about:`, JSON.stringify(item["rdf:about"]));
      }
      return null;
    }
    console.log(`✅ [${feedTitle}] 記事解析成功: "${title}"`);
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
    console.error(`   エラー発生時のアイテムデータ:`, JSON.stringify(item, null, 2).substring(0, 500));
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
  const MAX_KEYWORDS = 8;
  const MIN_LENGTH = 2;
  const stopWords = new Set([
    'これ', 'それ', 'この', 'その', 'です', 'ます', 'である', 'だっ',
    'する', 'なる', 'ある', 'いる', 'こと', 'もの', 'ため', 'よう'
  ]);
  try {
    const cleanTexted = text.replace(/[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBFa-zA-Z0-9\s]/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim();
    if (!cleanTexted) return [];
    const parsed = await mecabParsePromise(cleanTexted);
    if (!Array.isArray(parsed) || parsed.length === 0) return [];
    const keywords = new Map();
    parsed.forEach((token) => {
      if (!Array.isArray(token) || token.length < 2) return;
      const surface = token[0];
      const features = Array.isArray(token[1]) ? token[1] : [token[1]];
      const pos = features[0];
      const baseForm = features[6] || surface;
      const isValidPOS =
        pos === '名詞' || pos === '固有名詞' ||
        (pos === '動詞' && features[1] === '自立') ||
        (pos === '形容詞' && features[1] === '自立');
      if (!isValidPOS) return;
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
  } catch (error) {
    console.error('❌ MeCab解析エラー:', error.message);
    return [];
  }
}

async function main() {
  try {
    const startTime = Date.now();
    console.log('🚀 RSS記事取得開始 (超詳細デバッグ版)');
    console.log(`📅 実行時刻: ${new Date().toISOString()}`);
    console.log(`🖥️  実行環境: Node.js ${process.version} on ${process.platform}`);
    // MeCabセットアップの詳細ログ
    console.log('🔧 MeCab初期化開始...');
    const mecabReady = await setupMecab();
    if (!mecabReady) {
      console.error('❌ MeCabの設定に失敗しました');
      console.error('⭕ システム確認: MeCabがインストールされているか確認してください');
      process.exit(1);
    }
    console.log('✅ MeCab準備完了');
    // OPML読み込みの詳細ログ
    console.log('📋 OPML読み込み開始...');
    const feeds = await loadOPML();
    if (feeds.length === 0) {
      console.error('❌ フィードが取得できませんでした');
      console.error('⭕ システム確認: .github/workflows/rsslist.xmlが存在するか確認してください');
      process.exit(1);
    }
    console.log(`📊 フィード情報: ${feeds.length}個のRSSフィードを処理します`);
    // RSS取得処理
    console.log('🌐 RSS取得処理開始...');
    const allArticles = [];
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    for (const feed of feeds) {
      if (feed.isActive) {
        processedCount++;
        console.log(`\n🔄 [${processedCount}/${feeds.length}] 処理中: ${feed.title}`);
        try {
          const articles = await fetchAndParseRSS(feed.url, feed.title);
          allArticles.push(...articles);
          successCount++;
          console.log(`✅ [${feed.title}] 処理成功: ${articles.length}件の記事を取得`);
        } catch (error) {
          errorCount++;
          console.error(`❌ [${feed.title}] 処理失敗:`, error.message);
        }
        // 待機時間
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    const processingTime = (Date.now() - startTime) / 1000;
    console.log(`\n⏱️  フィード処理完了: ${processingTime.toFixed(1)}秒`);
    console.log(`📊 処理統計:`);
    console.log(`   処理フィード数: ${processedCount}`);
    console.log(`   成功: ${successCount}件`);
    console.log(`   失敗: ${errorCount}件`);
    console.log(`   取得記事数: ${allArticles.length}件`);
    // データ処理の続行...
    if (allArticles.length === 0) {
      console.warn('⚠️  記事が取得できませんでしたが、処理を続行します');
    }
    // 重複除去処理
    console.log('🔄 重複除去処理開始...');
    const uniqueArticles = [];
    const seen = new Set();
    allArticles.forEach(article => {
      const key = `${article.title}_${article.rssSource}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueArticles.push(article);
      }
    });
    console.log(`📊 重複除去結果: ${allArticles.length}件 → ${uniqueArticles.length}件`);
    // ソートと制限
    uniqueArticles.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
    const limitedArticles = uniqueArticles.slice(0, 1000);
    console.log(`📊 最終記事数: ${limitedArticles.length}件（上限1000件）`);
    // ファイル出力
    if (!fs.existsSync('./mss')) {
      fs.mkdirSync('./mss');
      console.log('📁 mssディレクトリを作成しました');
    }
    const output = {
      articles: limitedArticles,
      lastUpdated: new Date().toISOString(),
      totalCount: limitedArticles.length,
      processedFeeds: feeds.length,
      successfulFeeds: successCount,
      debugInfo: {
        processingTime: processingTime,
        errorCount: errorCount,
        debugVersion: 'v1.2-配列構造完全対応版'
      }
    };
    fs.writeFileSync('./mss/articles.json', JSON.stringify(output, null, 2));
    const totalTime = (Date.now() - startTime) / 1000;
    console.log('\n🎉 RSS記事取得完了!');
    console.log(`📊 最終結果:`);
    console.log(`   保存記事数: ${limitedArticles.length}件`);
    console.log(`   最終更新: ${output.lastUpdated}`);
    console.log(`   総実行時間: ${totalTime.toFixed(1)}秒`);
    console.log(`   処理効率: ${(limitedArticles.length / totalTime).toFixed(1)}記事/秒`);
    console.log(`💾 ファイル: ./mss/articles.json (${Math.round(JSON.stringify(output).length / 1024)}KB)`);
    // デバッグサマリー
    console.log(`\n🔍 デバッグサマリー:`);
    console.log(`   成功率: ${Math.round((successCount / processedCount) * 100)}%`);
    console.log(`   平均処理時間: ${(processingTime / processedCount).toFixed(2)}秒/フィード`);
    console.log(`   平均記事数: ${(allArticles.length / successCount).toFixed(1)}件/成功フィード`);
  } catch (error) {
    console.error('💥 main関数内でエラーが発生しました:', error);
    console.error('エラー詳細:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// 実行開始
console.log('🚀 スクリプト実行開始');
main().catch(error => {
  console.error('💥 トップレベルエラー:', error);
  console.error('エラー詳細:', {
    name: error.name,
    message: error.message,
    stack: error.stack
  });
  process.exit(1);
});
