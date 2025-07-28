const fs = require('fs');
const xml2js = require('xml2js');
const fetch = require('node-fetch');
const Mecab = require('mecab-async');

// MeCabセットアップ
const mecab = new Mecab();

// GitHub Actions環境向け設定
const GITHUB_ACTIONS_CONFIG = {
  CONCURRENT_LIMIT: 5,        // GitHub Actionsでは少し多めに設定可能
  MAX_RETRIES: 2,
  TIMEOUT_MS: 6000,           // さらに短縮
  BATCH_DELAY: 300,           // バッチ間隔を短縮
  PROGRESS_LOG_INTERVAL: 10   // 進捗ログ間隔
};

async function setupMecab() {
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
    } catch (error) {
      console.log(`❌ 辞書パス ${path} は無効`);
    }
  }
  
  try {
    mecab.command = 'mecab';
    const testResult = await mecabParsePromise('テスト');
    if (testResult && testResult.length > 0) {
      console.log('✅ MeCab標準辞書で動作確認');
      return true;
    }
  } catch (error) {
    console.error('❌ MeCab標準辞書も失敗:', error);
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
  try {
    const opmlContent = fs.readFileSync('./.github/workflows/rsslist.xml', 'utf8');
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(opmlContent);
    
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
    return [];
  }
}

async function processFeedsWithConcurrency(feeds) {
  const results = [];
  const activeFeeds = feeds.filter(f => f.isActive);
  let processed = 0;
  
  console.log(`📊 処理開始: ${activeFeeds.length}個のフィードを並列処理します`);
  
  for (let i = 0; i < activeFeeds.length; i += GITHUB_ACTIONS_CONFIG.CONCURRENT_LIMIT) {
    const batch = activeFeeds.slice(i, i + GITHUB_ACTIONS_CONFIG.CONCURRENT_LIMIT);
    const batchNumber = Math.floor(i / GITHUB_ACTIONS_CONFIG.CONCURRENT_LIMIT) + 1;
    const totalBatches = Math.ceil(activeFeeds.length / GITHUB_ACTIONS_CONFIG.CONCURRENT_LIMIT);
    
    console.log(`🔄 バッチ ${batchNumber}/${totalBatches} 処理中 (${batch.length}件)`);
    
    const batchStartTime = Date.now();
    const batchPromises = batch.map(feed => 
      fetchAndParseRSSWithRetry(feed.url, feed.title)
        .then(articles => ({ feed, articles, success: true }))
        .catch(error => ({ feed, articles: [], success: false, error: error.message }))
    );
    
    const batchResults = await Promise.allSettled(batchPromises);
    const batchTime = (Date.now() - batchStartTime) / 1000;
    
    let batchSuccess = 0;
    let batchFailure = 0;
    let batchArticles = 0;
    
    batchResults.forEach((result, index) => {
      processed++;
      
      if (result.status === 'fulfilled' && result.value.success) {
        results.push(...result.value.articles);
        batchSuccess++;
        batchArticles += result.value.articles.length;
      } else {
        batchFailure++;
        const feedName = batch[index]?.title || 'Unknown';
        const errorMsg = result.reason || result.value?.error || 'Unknown error';
        console.error(`❌ ${feedName}: ${errorMsg}`);
      }
      
      // 進捗ログ
      if (processed % GITHUB_ACTIONS_CONFIG.PROGRESS_LOG_INTERVAL === 0 || processed === activeFeeds.length) {
        const progress = Math.round((processed / activeFeeds.length) * 100);
        console.log(`📈 進捗: ${processed}/${activeFeeds.length} (${progress}%) 完了`);
      }
    });
    
    console.log(`✅ バッチ ${batchNumber} 完了: 成功${batchSuccess}件, 失敗${batchFailure}件, 記事${batchArticles}件 (${batchTime.toFixed(1)}秒)`);
    
    // GitHub Actions環境向け短縮待機
    if (i + GITHUB_ACTIONS_CONFIG.CONCURRENT_LIMIT < activeFeeds.length) {
      await new Promise(resolve => setTimeout(resolve, GITHUB_ACTIONS_CONFIG.BATCH_DELAY));
    }
  }
  
  return results;
}

async function fetchAndParseRSSWithRetry(url, title, retryCount = 0) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GITHUB_ACTIONS_CONFIG.TIMEOUT_MS);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Minews/1.0; GitHub-Actions)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Cache-Control': 'no-cache',
        'Connection': 'close'  // GitHub Actions環境でのコネクション管理
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const xmlContent = await response.text();
    
    // XMLサイズチェック（GitHub Actions環境でのメモリ効率化）
    if (xmlContent.length > 10 * 1024 * 1024) { // 10MB制限
      throw new Error('XML size too large (>10MB)');
    }
    
    const parser = new xml2js.Parser({ 
      explicitArray: false,
      ignoreAttrs: false,
      trim: true,
      normalize: true,
      timeout: 3000  // XML解析タイムアウト短縮
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
    
    return articles;
    
  } catch (error) {
    const isTimeout = error.name === 'AbortError';
    const isNetworkError = error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT';
    
    // リトライ条件の改良
    if ((isTimeout || isNetworkError) && retryCount < GITHUB_ACTIONS_CONFIG.MAX_RETRIES) {
      const backoffTime = Math.min(500 * Math.pow(1.5, retryCount), 2000); // より短い待機時間
      console.log(`🔄 リトライ ${retryCount + 1}/${GITHUB_ACTIONS_CONFIG.MAX_RETRIES}: ${title} (${backoffTime}ms後)`);
      
      await new Promise(resolve => setTimeout(resolve, backoffTime));
      return fetchAndParseRSSWithRetry(url, title, retryCount + 1);
    }
    
    throw error;
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
    console.error('❌ 記事解析エラー:', error);
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
    console.error('❌ MeCab解析エラー:', error.message);
    return [];
  }
}

// main関数の改良
async function main() {
  const startTime = Date.now();
  console.log('🚀 RSS記事取得開始 (GitHub Actions最適化版)');
  console.log(`📅 実行時刻: ${new Date().toISOString()}`);
  
  const mecabReady = await setupMecab();
  if (!mecabReady) {
    console.error('❌ MeCabの設定に失敗しました');
    process.exit(1);
  }
  console.log('✅ MeCab準備完了');
  
  const feeds = await loadOPML();
  const activeFeeds = feeds.filter(f => f.isActive);
  console.log(`📋 フィード情報: 全${feeds.length}件中${activeFeeds.length}件がアクティブ`);
  
  let allArticles;
  try {
    allArticles = await processFeedsWithConcurrency(feeds);
  } catch (error) {
    console.error('❌ フィード処理中にクリティカルエラー:', error);
    process.exit(1);
  }
  
  const processingTime = (Date.now() - startTime) / 1000;
  console.log(`⏱️  フィード処理完了: ${processingTime.toFixed(1)}秒`);
  console.log(`📊 取得記事数: ${allArticles.length}件`);
  
  // 重複除去処理
  const dedupeStart = Date.now();
  const uniqueArticles = [];
  const seen = new Set();
  
  allArticles.forEach(article => {
    const key = `${article.title}_${article.rssSource}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueArticles.push(article);
    }
  });
  
  console.log(`🔄 重複除去: ${allArticles.length}件 → ${uniqueArticles.length}件 (${((Date.now() - dedupeStart) / 1000).toFixed(1)}秒)`);
  
  // AIスコア計算
  const scoreStart = Date.now();
  uniqueArticles.forEach(article => {
    const hours = (Date.now() - new Date(article.publishDate).getTime()) / (1000 * 60 * 60);
    const freshness = Math.exp(-hours / 72) * 20;
    article.aiScore = Math.max(0, Math.min(100, Math.round(freshness + 50)));
  });
  
  console.log(`🧠 AIスコア計算完了: ${((Date.now() - scoreStart) / 1000).toFixed(1)}秒`);
  
  // ソートと制限
  uniqueArticles.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
  const limitedArticles = uniqueArticles.slice(0, 1000);
  
  // ファイル出力
  if (!fs.existsSync('./mss')) {
    fs.mkdirSync('./mss');
  }
  
  const output = {
    articles: limitedArticles,
    lastUpdated: new Date().toISOString(),
    totalCount: limitedArticles.length,
    processedFeeds: feeds.length,
    successfulFeeds: feeds.filter(f => f.isActive).length,
    processingTimeSeconds: processingTime,
    githubActionsOptimized: true  // 最適化フラグ
  };
  
  fs.writeFileSync('./mss/articles.json', JSON.stringify(output, null, 2));
  
  const totalTime = (Date.now() - startTime) / 1000;
  console.log('🎉 RSS記事取得完了!');
  console.log(`📊 最終結果: ${limitedArticles.length}件の記事を保存`);
  console.log(`⏱️  総実行時間: ${totalTime.toFixed(1)}秒`);
  console.log(`💾 ファイル: ./mss/articles.json (${Math.round(JSON.stringify(output).length / 1024)}KB)`);
  console.log(`🏆 処理効率: ${(limitedArticles.length / totalTime).toFixed(1)}記事/秒`);
}

main().catch(error => {
  console.error('❌ メイン処理でエラーが発生しました:', error);
  process.exit(1);
});
