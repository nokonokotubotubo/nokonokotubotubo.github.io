const fs = require('fs');
const xml2js = require('xml2js');
const fetch = require('node-fetch');
const Mecab = require('mecab-async');

// MeCabセットアップ (GitHub ActionsのUbuntuパス調整)
const mecab = new Mecab();
mecab.command = 'mecab -d /usr/lib/x86_64-linux-gnu/mecab/dic/mecab-ipadic-neologd';

// MeCab parseをPromiseでラップ
function mecabParsePromise(text) {
  return new Promise((resolve, reject) => {
    mecab.parse(text, (err, result) => {
      if (err) return reject(err);
      resolve(result);
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

// **原因特定用** MeCab詳細出力版
async function extractKeywordsWithMecab(text) {
  const MAX_KEYWORDS = 8;
  const MIN_KEYWORD_LENGTH = 2;
  const TARGET_POS = new Set(['名詞', '固有名詞', '動詞', '形容詞']);
  const stopWords = new Set(['これ', 'それ', 'あれ', 'この', 'その', 'あの', 'です', 'である', 'の', 'が', 'は', 'を', 'に', 'と', 'で']);

  try {
    const parsed = await mecabParsePromise(text.substring(0, 100)); // テスト用に短縮
    
    // **詳細ログ出力 - 実際のMeCab出力を確認**
    console.log(`[DEBUG] MeCab詳細出力（最初の5トークン）:`);
    for (let i = 0; i < Math.min(5, parsed.length); i++) {
      const token = parsed[i];
      console.log(`  Token[${i}]: ${JSON.stringify(token)}`);
      if (Array.isArray(token) && token.length >= 2) {
        console.log(`    表層形: "${token[0]}", 品詞情報: ${JSON.stringify(token[1])}`);
      }
    }

    if (!Array.isArray(parsed) || parsed.length === 0) return [];
    
    const keywords = new Set();

    parsed.forEach((token, index) => {
      if (!Array.isArray(token) || token.length < 2) {
        console.log(`[DEBUG] 無効トークン[${index}]: ${JSON.stringify(token)}`);
        return;
      }
      
      const [surface, features] = token;
      console.log(`[DEBUG] 処理中 - 表層形:"${surface}", 品詞:"${features[0]}"`);
      
      const pos = features[0] || '';
      if (TARGET_POS.has(pos) && surface.length >= MIN_KEYWORD_LENGTH && !stopWords.has(surface)) {
        keywords.add(surface);
        console.log(`[DEBUG] キーワード追加: "${surface}"`);
      }
    });

    const result = Array.from(keywords).slice(0, MAX_KEYWORDS);
    console.log(`[DEBUG] 最終キーワード: ${JSON.stringify(result)}`);
    return result;
  } catch (error) {
    console.error('MeCabエラー:', error);
    return [];
  }
}

// メイン処理
async function main() {
  console.log('RSS記事取得開始...');
  
  try {
    await mecabParsePromise('テスト');
    console.log('MeCabセットアップ成功');
  } catch (error) {
    console.error('MeCabセットアップエラー:', error);
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
