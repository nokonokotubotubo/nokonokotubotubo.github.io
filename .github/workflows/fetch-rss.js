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

// setupMecab関数の強化
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
  
  // 標準辞書のテスト
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

// loadOPML関数の強化
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
    console.log(`Fetching RSS: ${title} (${url})`);
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
    const parser = new xml2js.Parser({ 
      explicitArray: false,
      ignoreAttrs: false,
      trim: true
    });
    const result = await parser.parseStringPromise(xmlContent);
    
    const articles = [];
    let items = [];
    
    if (result.rss && result.rss.channel && result.rss.channel.item) {
      items = Array.isArray(result.rss.channel.item) ? result.rss.channel.item : [result.rss.channel.item];
    } else if (result.feed && result.feed.entry) {
      items = Array.isArray(result.feed.entry) ? result.feed.entry : [result.feed.entry];
    }
    
    for (const item of items.slice(0, 20)) {
      const article = await parseRSSItem(item, url, title);
      if (article) articles.push(article);
    }
    
    console.log(`取得完了: ${title} - ${articles.length}件`);
    return articles;
  } catch (error) {
    console.error(`RSS取得エラー: ${title} - ${error.message}`);
    return [];
  }
}

async function parseRSSItem(item, sourceUrl, feedTitle) {
  try {
    const title = cleanText(item.title || '');
    let link = item.link?.href || item.link || item.guid?.$?.text || item.guid || '';
    if (typeof link !== 'string') link = '';
    const description = cleanText(item.description || item.summary || item.content?._ || item.content || '');
    const pubDate = item.pubDate || item.published || item.updated || new Date().toISOString();
    const category = cleanText(item.category?._ || item.category || 'General');
    
    if (!title || !link) return null;
    
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
    console.error('記事解析エラー:', error);
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

// シンプル・最効率キーワード抽出関数
async function extractKeywordsWithMecab(text) {
  const MAX_KEYWORDS = 8;
  const MIN_LENGTH = 2;
  
  // 最小限のストップワード（本当に不要なもののみ）
  const stopWords = new Set([
    'これ', 'それ', 'この', 'その', 'です', 'ます', 'である', 'だっ',
    'する', 'なる', 'ある', 'いる', 'こと', 'もの', 'ため', 'よう'
  ]);

  try {
    // テキスト前処理（最小限）
    const cleanText = text.replace(/[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBFa-zA-Z0-9\s]/g, ' ')
                          .replace(/\s+/g, ' ')
                          .trim();
    
    if (!cleanText) return [];
    
    const parsed = await mecabParsePromise(cleanText);
    if (!Array.isArray(parsed) || parsed.length === 0) return [];
    
    const keywords = new Map(); // 重複排除と出現頻度管理
    
    parsed.forEach((token) => {
      if (!Array.isArray(token) || token.length < 2) return;
      
      const surface = token[0];
      const features = Array.isArray(token[1]) ? token[1] : [token[1]];
      const pos = features[0];
      const baseForm = features[6] || surface;
      
      // シンプルな品詞判定
      const isValidPOS = pos === '名詞' || pos === '固有名詞' || 
                        (pos === '動詞' && features[1] === '自立') ||
                        (pos === '形容詞' && features[1] === '自立');
      
      if (!isValidPOS) return;
      
      // キーワード決定：基本形があり、表層形と異なる場合は基本形を使用
      const keyword = (baseForm && baseForm !== '*' && baseForm !== surface) ? baseForm : surface;
      
      // 基本的なフィルタリング
      if (keyword.length >= MIN_LENGTH && 
          !stopWords.has(keyword) && 
          !/^[0-9]+$/.test(keyword)) { // 数字のみは除外
        
        const count = keywords.get(keyword) || 0;
        keywords.set(keyword, count + 1);
      }
    });

    // 出現頻度でソートしてトップ取得
    return Array.from(keywords.entries())
                .sort(([,a], [,b]) => b - a)
                .slice(0, MAX_KEYWORDS)
                .map(([keyword]) => keyword);
                
  } catch (error) {
    console.error('MeCab解析エラー:', error.message);
    return [];
  }
}

// main関数の強化
async function main() {
  try {
    const startTime = Date.now();
    console.log('🚀 RSS記事取得開始 (堅牢化デバッグ版)');
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
    console.log(`${feeds.length}個のRSSフィードを処理します`);
    
    // RSS取得処理
    console.log('🌐 RSS取得処理開始...');
    const allArticles = [];
    
    for (const feed of feeds) {
      if (feed.isActive) {
        try {
          const articles = await fetchAndParseRSS(feed.url, feed.title);
          allArticles.push(...articles);
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`❌ フィード処理エラー [${feed.title}]:`, error);
        }
      }
    }
    
    const processingTime = (Date.now() - startTime) / 1000;
    console.log(`⏱️  フィード処理完了: ${processingTime.toFixed(1)}秒`);
    console.log(`📊 取得記事数: ${allArticles.length}件`);
    
    // データ処理の続行...
    if (allArticles.length === 0) {
      console.warn('⚠️  記事が取得できませんでしたが、処理を続行します');
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
    }
    
    const output = {
      articles: limitedArticles,
      lastUpdated: new Date().toISOString(),
      totalCount: limitedArticles.length,
      processedFeeds: feeds.length,
      successfulFeeds: feeds.filter(f => f.isActive).length
    };
    
    fs.writeFileSync('./mss/articles.json', JSON.stringify(output, null, 2));
    
    const totalTime = (Date.now() - startTime) / 1000;
    console.log('🎉 RSS記事取得完了!');
    console.log(`記事取得完了: ${limitedArticles.length}件の記事を保存しました`);
    console.log(`最終更新: ${output.lastUpdated}`);
    console.log(`⏱️  総実行時間: ${totalTime.toFixed(1)}秒`);
    console.log(`🏆 処理効率: ${(limitedArticles.length / totalTime).toFixed(1)}記事/秒`);
    
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
