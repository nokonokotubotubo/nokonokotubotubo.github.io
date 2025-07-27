const fs = require('fs');
const xml2js = require('xml2js');
const fetch = require('node-fetch');
const Mecab = require('mecab-async'); // 新規追加: MeCabラッパー

// MeCabセットアップ (mecab-ipadic-NEologd辞書使用。環境変数で辞書パス指定)
const mecab = new Mecab();
mecab.command = 'mecab -d /usr/lib/mecab/dic/mecab-ipadic-neologd'; // 辞書パスを環境に合わせて設定 (GitHub Actionsでインストール)

// MeCab parseをPromiseでラップ (信頼性向上)
function mecabParsePromise(text) {
  return new Promise((resolve, reject) => {
    mecab.parse(text, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

// OPML読み込み関数 (変更なし)
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

// RSS取得・解析関数 (parseRSSItem呼び出しをawaitで同期化)
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
    
    console.log(`[DEBUG] Parsed items count: ${items.length}`); // デバッグログ: itemsの数確認
    
    // 非同期parseRSSItemをawaitで処理 (信頼性向上)
    for (const item of items.slice(0, 20)) {
      const article = await parseRSSItem(item, url, title); // await追加
      console.log(`[DEBUG] Parsed article: ${article ? JSON.stringify(article.id) : 'null'}`); // デバッグログ: articleの値確認
      if (article) {
        articles.push(article);
      } else {
        console.warn(`記事解析失敗: ${title} - 項目スキップ`); // ログ追加 (保守性向上)
      }
    }
    
    console.log(`取得完了: ${title} - ${articles.length}件`);
    return articles;
  } catch (error) {
    console.error(`RSS取得エラー: ${title} - ${error.message}`);
    return [];
  }
}

// RSS項目解析関数 (keywords抽出をMeCabベースに変更)
async function parseRSSItem(item, sourceUrl, feedTitle) {
  try {
    const title = cleanText(item.title || '');
    let link = item.link?.href || item.link || item.guid?.$?.text || item.guid || '';
    if (typeof link !== 'string') link = ''; // チューニング: 文字列でない場合を安全に扱う
    const description = cleanText(item.description || item.summary || item.content?._ || item.content || '');
    const pubDate = item.pubDate || item.published || item.updated || new Date().toISOString();
    const category = cleanText(item.category?._ || item.category || 'General');
    
    console.log(`[DEBUG] Parsed title: ${title}, link: ${link}`); // デバッグログ: title/link確認
    
    if (!title || !link) return null;
    
    const cleanDescription = description.substring(0, 300) || '記事の概要は提供されていません';
    const keywords = await extractKeywordsWithMecab(title + ' ' + cleanDescription); // MeCabに置き換え (非同期対応)
    console.log(`[DEBUG] Extracted keywords: ${keywords.length}`); // デバッグログ: keywords確認
    
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

// テキストクリーン関数 (変更なし)
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

// 日付解析関数 (変更なし)
function parseDate(dateString) {
  if (!dateString) return new Date().toISOString();
  try {
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

// 新規: MeCabを使ったキーワード抽出関数 (抽出条件最適化)
async function extractKeywordsWithMecab(text) {
  const MAX_KEYWORDS = 8;
  const MIN_KEYWORD_LENGTH = 2;
  const TARGET_POS = new Set(['名詞', '固有名詞', '動詞', '形容詞']); // 拡張 (ニュース向け)
  const stopWords = new Set([ // 最小限に最適化
    'これ', 'それ', 'あれ', 'この', 'その', 'あの', 'する', 'なる', 'ある', 'いる', 
    'です', 'である', 'について', 'という', 'など', 'もの', 'こと', 'ため', 'よう',
    'の', 'が', 'は', 'を', 'に', 'へ', 'と', 'で', 'から', 'より', 'まで'
  ]);

  try {
    const parsed = await mecabParsePromise(text); // MeCabで形態素解析 (非同期)
    
    console.log(`[DEBUG] MeCab parsed tokens count: ${parsed.length}`); // デバッグログ
    
    if (!Array.isArray(parsed) || parsed.length === 0) {
      console.warn('MeCab parse returned invalid or empty result - テキスト:', text);
      return [];
    }

    const keywords = new Set();

    parsed.forEach(token => {
      if (!Array.isArray(token) || token.length < 2) return;
      const [surface, features] = token;
      const pos = features[0] || '';
      if (TARGET_POS.has(pos) && surface.length >= MIN_KEYWORD_LENGTH && !stopWords.has(surface)) {
        keywords.add(surface);
      }
    });

    let result = Array.from(keywords).slice(0, MAX_KEYWORDS);
    if (result.length === 0) { // 空時フォールバック: 基本名詞抽出
      parsed.forEach(token => {
        if (token[1][0] === '名詞' && token[0].length >= MIN_KEYWORD_LENGTH) {
          keywords.add(token[0]);
        }
      });
      result = Array.from(keywords).slice(0, MAX_KEYWORDS);
      console.log('[DEBUG] Fallback keywords used');
    }

    return result;
  } catch (error) {
    console.error('MeCab解析エラー:', error.message, '- テキスト:', text);
    return [];
  }
}

// メイン処理 (変更なし、extractKeywordsが置き換わったため間接的に影響)
async function main() {
  console.log('RSS記事取得開始...');
  
  // MeCabセットアップ検証 (信頼性向上、async関数内に移動)
  try {
    await mecabParsePromise('テスト'); // テスト解析でセットアップを確認
    console.log('MeCabセットアップ成功');
  } catch (error) {
    console.error('MeCabセットアップエラー:', error);
    process.exit(1); // セットアップ失敗時は終了
  }
  
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
  
  console.log(`[DEBUG] All articles count before unique: ${allArticles.length}`); // デバッグログ
  
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
  
  console.log(`[DEBUG] Unique articles count: ${uniqueArticles.length}`); // デバッグログ
  
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
  
  console.log(`[DEBUG] Limited articles count: ${limitedArticles.length}`); // デバッグログ
  
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
