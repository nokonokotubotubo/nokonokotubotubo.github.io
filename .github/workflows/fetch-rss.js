const fs = require('fs');
const xml2js = require('xml2js');
const fetch = require('node-fetch');

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
    
    // RSS 2.0
    if (result.rss && result.rss.channel && result.rss.channel.item) {
      items = Array.isArray(result.rss.channel.item) ? result.rss.channel.item : [result.rss.channel.item];
    }
    // Atom
    else if (result.feed && result.feed.entry) {
      items = Array.isArray(result.feed.entry) ? result.feed.entry : [result.feed.entry];
    }
    
    items.slice(0, 20).forEach(item => {
      const article = parseRSSItem(item, url, title);
      if (article) {
        articles.push(article);
      }
    });
    
    console.log(`取得完了: ${title} - ${articles.length}件`);
    return articles;
  } catch (error) {
    console.error(`RSS取得エラー: ${title} - ${error.message}`);
    return [];
  }
}

// RSS項目解析関数
function parseRSSItem(item, sourceUrl, feedTitle) {
  try {
    const title = cleanText(item.title || '');
    let link = item.link?.href || item.link || item.guid?.$?.text || item.guid || '';
    if (typeof link !== 'string') link = ''; // チューニング: 文字列でない場合を安全に扱う
    const description = cleanText(item.description || item.summary || item.content?._ || item.content || '');
    const pubDate = item.pubDate || item.published || item.updated || new Date().toISOString();
    const category = cleanText(item.category?._ || item.category || 'General');
    
    if (!title || !link) return null;
    
    const cleanDescription = description.substring(0, 300) || '記事の概要は提供されていません';
    const keywords = extractKeywords(title + ' ' + cleanDescription);
    
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

// キーワード抽出関数（簡易版）
function extractKeywords(text) {
  // 定数化（調整しやすく保守性向上）
  const MAX_KEYWORDS = 8;
  const MIN_KEYWORD_LENGTH = 2;
  const EXCLUDE_SUFFIX = 'の'; // チューニング: 助詞終わりを除去（例: 「キーエンスの」）
  
  const stopWords = new Set([
    'これ', 'それ', 'あれ', 'この', 'その', 'あの', 'する', 'なる', 'ある', 'いる', 
    'です', 'である', 'について', 'という', 'など', 'もの', 'こと', 'ため', 'よう',
    'の', 'が', 'は', 'を', 'に', 'へ', 'と', 'で', 'から', 'より', 'まで',
    'より', 'まで', 'ます', 'です', 'か', 'よ', 'ね', 'や', 'も', 'ばかり', 'だけ', 
    'でも', 'しかし', 'また', 'そして', 'にて', 'により', 'にて', 'として', 'しています',
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
    'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'has', 
    'have', 'had', 'do', 'does', 'did', 'will', 'would', 'can', 'could'
  ]);
  
  const words = text.replace(/[^\w\sぁ-んァ-ン一-龯ー]/g, ' ')
                   .split(/\s+/)
                   .filter(word => word.length >= MIN_KEYWORD_LENGTH 
                                   && !stopWords.has(word.toLowerCase()) 
                                   && !word.endsWith(EXCLUDE_SUFFIX))
                   .slice(0, MAX_KEYWORDS);
  
  return [...new Set(words)];
}

// メイン処理
async function main() {
  console.log('RSS記事取得開始...');
  
  const feeds = await loadOPML();
  console.log(`${feeds.length}個のRSSフィードを処理します`);
  
  const allArticles = [];
  
  for (const feed of feeds) {
    if (feed.isActive) {
      const articles = await fetchAndParseRSS(feed.url, feed.title);
      allArticles.push(...articles);
      
      // レート制限のため1秒待機
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // 重複記事の除去
  const uniqueArticles = [];
  const seen = new Set();
  
  allArticles.forEach(article => {
    const key = `${article.title}_${article.rssSource}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueArticles.push(article);
    }
  });
  
  // AIスコア追加（簡易版）
  uniqueArticles.forEach(article => {
    const hours = (Date.now() - new Date(article.publishDate).getTime()) / (1000 * 60 * 60);
    const freshness = Math.exp(-hours / 72) * 20;
    article.aiScore = Math.max(0, Math.min(100, Math.round(freshness + 50)));
  });
  
  // 日付順でソート
  uniqueArticles.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
  
  // 最大1000件に制限
  const limitedArticles = uniqueArticles.slice(0, 1000);
  
  // mss/ディレクトリが存在しない場合は作成
  if (!fs.existsSync('./mss')) {
    fs.mkdirSync('./mss');
  }
  
  // JSONファイル保存
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

// エラーハンドリング付きで実行
main().catch(error => {
  console.error('メイン処理でエラーが発生しました:', error);
  process.exit(1);
});
