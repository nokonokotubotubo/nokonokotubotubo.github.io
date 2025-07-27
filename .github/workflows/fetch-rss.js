const fs = require('fs');
const xml2js = require('xml2js');
const fetch = require('node-fetch');
const Mecab = require('mecab-async');

// MeCabセットアップ (複数パターンを試行)
const mecab = new Mecab();

// 辞書パスの自動検出と設定
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
        console.log(`MeCab辞書パス確定: ${path}`);
        return true;
      }
    } catch (error) {
      console.log(`辞書パス ${path} は無効: ${error.message}`);
    }
  }
  
  // デフォルト辞書を試行
  try {
    mecab.command = 'mecab';
    const testResult = await mecabParsePromise('テスト');
    if (testResult && testResult.length > 0) {
      console.log('MeCab標準辞書で動作確認');
      return true;
    }
  } catch (error) {
    console.error('MeCab標準辞書も失敗:', error);
  }
  
  return false;
}

// MeCab parseをPromiseでラップ (エラーハンドリング強化)
function mecabParsePromise(text) {
  return new Promise((resolve, reject) => {
    if (!text || text.trim().length === 0) {
      resolve([]);
      return;
    }
    
    mecab.parse(text, (err, result) => {
      if (err) {
        console.error('MeCab parseエラー:', err);
        reject(err);
        return;
      }
      
      // 結果の詳細ログ
      console.log(`[DEBUG] MeCab生出力タイプ: ${typeof result}, 長さ: ${result ? result.length : 'undefined'}`);
      console.log(`[DEBUG] MeCab生出力内容: ${JSON.stringify(result).substring(0, 200)}...`);
      
      resolve(result || []);
    });
  });
}

// OPML読み込み関数
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
    
    console.log(`OPML読み込み完了: ${feeds.length}個のフィードを検出`);
    return feeds;
  } catch (error) {
    console.error('OPML読み込みエラー:', error);
    return [];
  }
}

// RSS取得・解析関数
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

// RSS項目解析関数
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

// テキストクリーン関数
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

// 日付解析関数
function parseDate(dateString) {
  if (!dateString) return new Date().toISOString();
  try {
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

// 強化されたキーワード抽出関数
async function extractKeywordsWithMecab(text) {
  const MAX_KEYWORDS = 8;
  const MIN_KEYWORD_LENGTH = 2;
  const TARGET_POS = new Set(['名詞', '固有名詞', '動詞', '形容詞']);
  const stopWords = new Set(['これ', 'それ', 'この', 'その', 'です', 'である', 'の', 'が', 'は', 'を', 'に', 'と', 'で']);

  try {
    // テキストの前処理
    const processedText = text.replace(/[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBFa-zA-Z0-9\s]/g, '').trim();
    
    if (!processedText) {
      console.log('[DEBUG] 処理可能なテキストがありません');
      return [];
    }
    
    console.log(`[DEBUG] 処理対象テキスト: "${processedText.substring(0, 50)}..."`);
    
    const parsed = await mecabParsePromise(processedText);
    
    if (!Array.isArray(parsed) || parsed.length === 0) {
      console.log('[DEBUG] MeCab解析結果が空です');
      return [];
    }
    
    console.log(`[DEBUG] MeCab解析成功: ${parsed.length}個のトークン`);
    
    const keywords = new Set();
    
    // 様々なトークン形式に対応
    parsed.forEach((token, index) => {
      if (index < 3) console.log(`[DEBUG] Token[${index}]: ${JSON.stringify(token)}`);
      
      let surface, pos;
      
      // 形式パターン1: [表層形, [品詞, ...]]
      if (Array.isArray(token) && token.length >= 2 && Array.isArray(token[1])) {
        surface = token[0];
        pos = token[1][0];
      }
      // 形式パターン2: [表層形, 品詞]
      else if (Array.isArray(token) && token.length >= 2) {
        surface = token[0];
        pos = token[1];
      }
      // 形式パターン3: {surface: '...', features: [...]}
      else if (token && typeof token === 'object' && token.surface) {
        surface = token.surface;
        pos = Array.isArray(token.features) ? token.features[0] : token.features;
      }
      else {
        return;
      }
      
      if (surface && pos && TARGET_POS.has(pos) && 
          surface.length >= MIN_KEYWORD_LENGTH && 
          !stopWords.has(surface)) {
        keywords.add(surface);
        console.log(`[DEBUG] キーワード追加: "${surface}" (${pos})`);
      }
    });

    const result = Array.from(keywords).slice(0, MAX_KEYWORDS);
    console.log(`[DEBUG] 最終キーワード: ${JSON.stringify(result)}`);
    
    return result;
  } catch (error) {
    console.error('MeCab解析エラー:', error.message);
    return [];
  }
}

// メイン処理
async function main() {
  console.log('RSS記事取得開始...');
  
  // MeCab設定の自動検出
  const mecabReady = await setupMecab();
  if (!mecabReady) {
    console.error('MeCabの設定に失敗しました');
    process.exit(1);
  }
  
  const feeds = await loadOPML();
  console.log(`${feeds.length}個のRSSフィードを処理します`);
  
  const allArticles = [];
  
  for (const feed of feeds) {
    if (feed.isActive) {
      const articles = await fetchAndParseRSS(feed.url, feed.title);
      allArticles.push(...articles);
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
  }
  
  const output = {
    articles: limitedArticles,
    lastUpdated: new Date().toISOString(),
    totalCount: limitedArticles.length,
    processedFeeds: feeds.length,
    successfulFeeds: feeds.filter(f => f.isActive).length
  };
  
  fs.writeFileSync('./mss/articles.json', JSON.stringify(output, null, 2));
  console.log(`記事取得完了: ${limitedArticles.length}件の記事を保存しました`);
  console.log(`最終更新: ${output.lastUpdated}`);
}

main().catch(error => {
  console.error('メイン処理でエラーが発生しました:', error);
  process.exit(1);
});
