const fs = require('fs');
const xml2js = require('xml2js');
const fetch = require('node-fetch');
const RakutenMA = require('./rakutenma.js');  // RakutenMAをインポート（GitHub Actionsで使用）

// モデル読み込み（model_ja.min.jsonを同期読み込み）
const modelData = fs.readFileSync('./model_ja.min.json', 'utf8');
const model = JSON.parse(modelData);

// RakutenMAインスタンス作成（GitHub Actionsで使用）
const rma = new RakutenMA(model);
rma.featset = RakutenMA.default_featset_ja;  // 日本語デフォルト特徴セット

// OPML読み込み関数（変更なし）
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

// RSS取得・解析関数（変更なし）
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

// RSS項目解析関数（変更なし、キーワード抽出はここで呼び出し）
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
    const keywords = extractKeywords(title + ' ' + cleanDescription);  // RakutenMA使用
    
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

// テキストクリーン関数（変更なし）
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

// 日付解析関数（変更なし）
function parseDate(dateString) {
  if (!dateString) return new Date().toISOString();
  try {
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

// キーワード抽出関数（RakutenMA使用版に変更）
function extractKeywords(text) {
  const MAX_KEYWORDS = 8;
  const stopWords = new Set([
    'これ', 'それ', 'あれ', 'この', 'その', 'あの', 'する', 'なる', 'ある', 'いる', 
    'です', 'である', 'について', 'という', 'など', 'もの', 'こと', 'ため', 'よう',
    'の', 'が', 'は', 'を', 'に', 'へ', 'と', 'で', 'から', 'より', 'まで',
    // ... (stopWordsの残り部分は元のコードと同じ)
  ]);

  try {
    // RakutenMAで形態素解析を実行
    const tokens = rma.tokenize(text);

    // 名詞・固有名詞を抽出（軽量化: Setで重複除去）
    const keywordSet = new Set();
    tokens.forEach(token => {
      if (token[1] === '名詞' || token[1] === '固有名詞') {  // 日本語の名詞系を対象
        const word = token[0].trim();
        if (word.length >= 2 && !stopWords.has(word.toLowerCase())) {
          keywordSet.add(word);
        }
      }
    });

    // 最大8個に制限して配列化
    return Array.from(keywordSet).slice(0, MAX_KEYWORDS);
  } catch (error) {
    console.error('RakutenMAキーワード抽出エラー:', error);
    return [];  // エラーハンドリング: 空配列を返す
  }
}

// メイン処理（変更なし）
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
