const fs = require('fs');
const fetch = require('node-fetch');
const { DOMParser } = require('xmldom'); // GitHub ActionsのNode.js環境で利用可能なxmldomを使用（追加require）

// ストップワードの定義
const stopWords = new Set([
  'これ', 'それ', 'あれ', 'この', 'その', 'あの', 'する', 'なる', 'ある', 'いる', 
  'です', 'である', 'について', 'という', 'など', 'もの', 'こと', 'ため', 'よう',
  'の', 'が', 'は', 'を', 'に', 'へ', 'と', 'で', 'から', 'より', 'まで',
  'より', 'まで', 'ます', 'です', 'か', 'よ', 'ね', 'や', 'も', 'ばかり', 'だけ', 
  'でも', 'しかし', 'また', 'そして', 'にて', 'により', 'にて', 'として', 'しています',
  '企業', '改革', '模索', 'ベクトル', 'フロントランナー', '旗手', '保有', '現金',
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
  'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'has', 
  'have', 'had', 'do', 'does', 'did', 'will', 'would', 'can', 'could'
]);

// キーワード抽出関数（RakutenMA版）
function extractKeywords(text) {
  // RakutenMAの初期化（Node.js環境用）
  const RakutenMA = require('./rakutenma'); // 軽量化: 必要最小限のrequire
  const rma = new RakutenMA(); // インスタンス生成
  
  // モデルのロード（信頼性向上: エラーハンドリング追加）
  try {
    const modelData = fs.readFileSync('./model_ja.min.json', 'utf8');
    rma.set_model(JSON.parse(modelData)); // モデル設定
  } catch (error) {
    console.error('RakutenMAモデルロードエラー:', error);
    return []; // エラーハンドリング: 空配列返却で処理継続
  }
  
  // 形態素解析実行
  const tokens = rma.tokenize(text);
  
  // 定数化（調整しやすく保守性向上）
  const MAX_KEYWORDS = 8;
  const MIN_KEYWORD_LENGTH = 2;
  const MAX_KEYWORD_LENGTH = 10;
  
  // キーワード抽出（形態素から名詞/動詞を優先）
  const keywordSet = new Set(); // 重複防止
  tokens.forEach(token => {
    const word = token[0]; // 形態素の単語部分
    const pos = token[1];  // 品詞
    
    // 精度向上: 名詞・動詞のみを対象とし、ストップワード除去
    if ((pos.startsWith('名詞') || pos.startsWith('動詞')) &&
        word.length >= MIN_KEYWORD_LENGTH && 
        word.length <= MAX_KEYWORD_LENGTH && 
        !stopWords.has(word.toLowerCase())) {
      keywordSet.add(word);
    }
  });
  
  // 最大8個に制限
  return Array.from(keywordSet).slice(0, MAX_KEYWORDS);
}

// RSSフィード取得関数
async function fetchRSS(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    console.error('RSS取得エラー:', error);
    return null;
  }
}

// カスタムRSSパース関数（rss-parserの代替）
async function parseRSSString(rssContent) {
  const domParser = new DOMParser();
  const doc = domParser.parseFromString(rssContent, 'text/xml');
  const items = doc.getElementsByTagName('item');
  const feedItems = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const getText = (tag) => {
      const elem = item.getElementsByTagName(tag)[0];
      return elem ? elem.textContent : '';
    };

    feedItems.push({
      title: getText('title'),
      link: getText('link'),
      description: getText('description'),
      pubDate: getText('pubDate'),
      categories: Array.from(item.getElementsByTagName('category')).map(cat => cat.textContent)
    });
  }

  return { items: feedItems };
}

// 記事解析関数
async function parseRSSItem(item, sourceUrl) {
  const title = item.title || '';
  const link = item.link || '';
  const description = item.description || ''; // contentSnippetはカスタムで対応不要
  const pubDate = item.pubDate || '';
  const category = item.categories ? item.categories.join(', ') : '';

  const fullText = `${title} ${description}`;
  const keywords = extractKeywords(fullText);

  return {
    title: title.trim(),
    link: link.trim(),
    description: description.trim(),
    pubDate: pubDate,
    category: category,
    keywords: keywords,
    source: sourceUrl
  };
}

// メイン処理
async function main() {
  const rssUrls = ['https://example.com/rss']; // RSS URLのリスト（実際のURLに置き換え）
  let articles = [];

  for (const url of rssUrls) {
    const rssContent = await fetchRSS(url);
    if (rssContent) {
      try {
        const feed = await parseRSSString(rssContent); // カスタム関数に置き換え
        for (const item of feed.items) {
          const article = await parseRSSItem(item, url);
          if (article) articles.push(article);
        }
      } catch (error) {
        console.error('RSS解析エラー:', error);
      }
    }
  }

  // articles.jsonに保存
  fs.writeFileSync('articles.json', JSON.stringify(articles, null, 2));
  console.log('articles.jsonを生成しました。');
}

main();
