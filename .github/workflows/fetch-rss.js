// エラー詳細出力版（記事ID安定化対応・類義語機能付き完全版）
console.log('🔍 fetch-rss.js実行開始（類義語機能付き完全版）');
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
  const sqlite3 = require('sqlite3').verbose();
  const path = require('path');
  console.log('✅ 全モジュール読み込み成功');
} catch (error) {
  console.error('❌ モジュール読み込みエラー:', error);
  process.exit(1);
}

const fs = require('fs');
const xml2js = require('xml2js');
const fetch = require('node-fetch');
const Mecab = require('mecab-async');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// MeCabセットアップ
const mecab = new Mecab();

// WordNetデータベース
let wordnetDb = null;

// 【新機能】簡易同義語辞書（WordNetが利用できない場合の代替）
const simpleSynonymDict = {
  'スマホ': ['スマートフォン', '携帯電話'],
  'AI': ['人工知能', 'エーアイ'],
  'PC': ['パソコン', 'コンピューター'],
  'アプリ': ['アプリケーション', 'ソフト'],
  'ネット': ['インターネット', 'Web'],
  'サイト': ['ウェブサイト', 'ホームページ'],
  'データ': ['情報', 'デジタル情報'],
  'システム': ['仕組み', '体系'],
  'サービス': ['事業', 'ビジネス'],
  'テクノロジー': ['技術', 'テクノロジ'],
  'クラウド': ['雲', 'オンライン'],
  'セキュリティ': ['安全性', 'セキュリティー'],
  'プラットフォーム': ['基盤', 'プラットホーム'],
  'ソフトウェア': ['ソフト', 'プログラム'],
  'ハードウェア': ['ハード', '機器'],
  'デバイス': ['機器', '端末'],
  'ユーザー': ['利用者', '使用者'],
  'コンテンツ': ['内容', '情報'],
  'ブラウザ': ['閲覧ソフト', 'ウェブブラウザ'],
  'エンジン': ['機構', 'システム'],
  'IoT': ['アイオーティー', 'モノのインターネット'],
  'DX': ['デジタル変革', 'デジタルトランスフォーメーション'],
  'サーバー': ['サーバ', 'サービス提供機'],
  'データベース': ['DB', 'データ蓄積'],
  'ネットワーク': ['網', '通信網'],
  'プログラム': ['ソフトウェア', 'アプリケーション'],
  'API': ['エーピーアイ', 'インターフェース'],
  'OS': ['オペレーティングシステム', 'システム基盤'],
  'クラウド': ['雲計算', 'オンラインサービス'],
  'ビッグデータ': ['大量データ', 'データ群'],
  'ロボット': ['自動機械', '機械人間'],
  'VR': ['仮想現実', 'バーチャルリアリティ'],
  'AR': ['拡張現実', '混合現実'],
  '5G': ['第5世代移動通信', '高速通信'],
  'ゲーム': ['遊戯', 'エンターテイメント'],
  'SNS': ['ソーシャルネットワーク', '社交媒体'],
  'ECサイト': ['電子商取引', 'オンラインショップ'],
  'フィンテック': ['金融技術', 'デジタル金融'],
  'ブロックチェーン': ['分散台帳', 'チェーン技術'],
  '仮想通貨': ['暗号通貨', 'デジタル通貨'],
  'NFT': ['非代替トークン', 'デジタル資産'],
  'メタバース': ['仮想空間', 'デジタル世界']
};

// RSS用安定ID生成関数
function generateStableIdForRSS(url, title, publishDate) {
    const baseString = `${url.trim().toLowerCase()}|${title.trim()}|${publishDate}`;
    let hash = 0;
    
    for (let i = 0; i < baseString.length; i++) {
        const char = baseString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    
    const hashStr = Math.abs(hash).toString(36);
    return `stable_${hashStr}_${baseString.length}`;
}

// 【新機能】WordNetデータベースセットアップ
async function setupWordNet() {
  console.log('📚 WordNetデータベースセットアップ開始...');
  const dbPath = path.join(__dirname, 'wnjpn.db');
  
  if (!fs.existsSync(dbPath)) {
    console.log('⚠️  WordNetデータベースファイルが見つかりません。簡易辞書を使用します。');
    return false;
  }
  
  try {
    wordnetDb = new sqlite3.Database(dbPath);
    console.log('✅ WordNetデータベース接続成功');
    return true;
  } catch (error) {
    console.error('❌ WordNetデータベース接続エラー:', error);
    return false;
  }
}

// 【新機能】WordNetから類義語を取得
function getSynonymsFromWordNet(word) {
  return new Promise((resolve) => {
    if (!wordnetDb) {
      resolve([]);
      return;
    }

    const wordsql = `
      SELECT DISTINCT sense.synset AS synset 
      FROM word 
      JOIN sense ON sense.wordid = word.wordid 
      WHERE word.lemma = ? AND word.lang = 'jpn'
    `;

    wordnetDb.all(wordsql, [word], (err, wordrows) => {
      if (err || !wordrows || wordrows.length === 0) {
        resolve([]);
        return;
      }

      const synsets = wordrows.map(row => row.synset);
      if (synsets.length === 0) {
        resolve([]);
        return;
      }

      const synosql = `
        SELECT DISTINCT word.lemma AS lemma 
        FROM sense 
        JOIN word ON word.wordid = sense.wordid 
        WHERE sense.synset IN (${synsets.map(() => '?').join(',')}) 
        AND word.lang = 'jpn' 
        AND word.lemma != ?
        LIMIT 5
      `;

      wordnetDb.all(synosql, [...synsets, word], (synoerr, synorows) => {
        if (synoerr || !synorows) {
          resolve([]);
          return;
        }

        const synonyms = synorows.map(row => row.lemma).slice(0, 2);
        resolve(synonyms);
      });
    });
  });
}

// 【新機能】OpenAI APIから類義語を取得（API KEYが設定されている場合）
async function getSynonymsFromOpenAI(word) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return [];
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{
          role: 'user',
          content: `「${word}」の日本語での同義語・類義語を2つだけ、カンマ区切りで回答してください。「スマホ」なら「スマートフォン,携帯電話」のように。説明は不要です。`
        }],
        max_tokens: 50,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    
    if (content) {
      return content.split(',').map(s => s.trim()).filter(s => s.length > 0).slice(0, 2);
    }
    return [];
  } catch (error) {
    console.error('OpenAI API エラー:', error.message);
    return [];
  }
}

// 【新機能】統合類義語取得関数
async function getSynonyms(word) {
  console.log(`🔍 [${word}] 類義語検索開始`);
  
  // 1. WordNetから試行
  let synonyms = await getSynonymsFromWordNet(word);
  console.log(`📚 [${word}] WordNet結果: ${synonyms.join(', ')}`);
  
  // 2. WordNetで見つからない場合はOpenAI APIを試行
  if (synonyms.length === 0) {
    synonyms = await getSynonymsFromOpenAI(word);
    console.log(`🤖 [${word}] OpenAI結果: ${synonyms.join(', ')}`);
  }
  
  // 3. それでも見つからない場合は簡易辞書を使用
  if (synonyms.length === 0 && simpleSynonymDict[word]) {
    synonyms = simpleSynonymDict[word].slice(0, 2);
    console.log(`📖 [${word}] 簡易辞書結果: ${synonyms.join(', ')}`);
  }
  
  // 重複排除と元の単語除外
  const filteredSynonyms = synonyms
    .filter((syn, index, arr) => arr.indexOf(syn) === index)
    .filter(syn => syn !== word && syn.length > 0)
    .slice(0, 2);
  
  console.log(`✅ [${word}] 最終類義語: ${filteredSynonyms.join(', ')}`);
  return filteredSynonyms;
}

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

// フォルダ構造対応版のOPML読み込み
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
    if (!result.opml || !result.opml.body || !result.opml.body[0] || !result.opml.body.outline) {
      console.error('❌ OPML構造が不正です');
      console.error('OPML内容:', JSON.stringify(result, null, 2).substring(0, 500));
      return [];
    }
    
    const feeds = [];
    const outlines = result.opml.body[0].outline;
    
    outlines.forEach(outline => {
      if (outline.outline) {
        // フォルダ内のフィード
        const folderName = outline.$.text || outline.$.title;
        console.log(`📂 フォルダ処理: ${folderName}`);
        outline.outline.forEach(feed => {
          feeds.push({
            id: generateStableIdForRSS(feed.$.xmlUrl, feed.$.title, new Date().toISOString()),
            url: feed.$.xmlUrl,
            title: feed.$.title,
            folderName: folderName,
            lastUpdated: new Date().toISOString(),
            isActive: true
          });
        });
      } else {
        // フォルダなしのフィード
        console.log(`📄 単体フィード処理: ${outline.$.title}`);
        feeds.push({
          id: generateStableIdForRSS(outline.$.xmlUrl, outline.$.title, new Date().toISOString()),
          url: outline.$.xmlUrl,
          title: outline.$.title,
          folderName: 'その他',
          lastUpdated: new Date().toISOString(),
          isActive: true
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

// URL抽出関数
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

// 【重要修正】安定ID生成版のparseRSSItem関数
async function parseRSSItem(item, sourceUrl, feedTitle) {
  try {
    console.log(`🔍 [${feedTitle}] 記事解析開始`);
    console.log(`   元データキー: ${Object.keys(item).join(', ')}`);
    const title = cleanText(item.title || '');
    const link = extractUrlFromItem(item);
    const description = cleanText(item.description || item.summary || item.content?._ || item.content || '');
    const pubDate = item.pubDate || item.published || item.updated || new Date().toISOString();
    const category = cleanText(item.category?._ || item.category || 'General');
    
    // 日付フィルター処理
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const publishDate = parseDate(pubDate);
    const articleDate = new Date(publishDate);

    if (articleDate < twoWeeksAgo || articleDate > now) {
      return null;
    }
    
    if (!title || !link) {
      return null;
    }
    
    const cleanDescription = description.substring(0, 300) || '記事の概要は提供されていません';
    
    // 【修正】キーワード抽出を上位3つに限定し、類義語を追加
    const baseKeywords = await extractKeywordsWithMecab(title + ' ' + cleanDescription);
    const top3Keywords = baseKeywords.slice(0, 3);
    
    // 各キーワードに対して類義語を取得
    const keywordsWithSynonyms = [];
    for (const keyword of top3Keywords) {
      keywordsWithSynonyms.push(keyword);
      
      const synonyms = await getSynonyms(keyword);
      keywordsWithSynonyms.push(...synonyms);
    }
    
    console.log(`🔍 [${feedTitle}] 最終キーワード: ${keywordsWithSynonyms.join(', ')}`);
    
    // 安定したID生成
    const stableId = generateStableIdForRSS(link, title, publishDate);
    
    return {
      id: stableId,
      title: title.trim(),
      url: link.trim(),
      content: cleanDescription,
      publishDate: publishDate,
      rssSource: feedTitle,
      category: category.trim(),
      readStatus: 'unread',
      readLater: false,
      userRating: 0,
      keywords: keywordsWithSynonyms, // キーワード+類義語の統合配列
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

// 【修正】キーワード抽出を上位3つに限定
async function extractKeywordsWithMecab(text) {
  const MAX_KEYWORDS = 3; // 8から3に変更
  const MIN_LENGTH = 2;
  const stopWords = new Set([
    'これ', 'それ', 'この', 'その', 'です', 'ます', 'である', 'だっ',
    'する', 'なる', 'ある', 'いる', 'こと', 'もの', 'ため', 'よう',
    'という', 'として', 'について', 'による', 'において', 'に対して',
    '場合', '時', '際', '中', '間', '後', '前', '上', '下', '内', '外'
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
      const pos = features;
      const baseForm = features[2] || surface;
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

// main関数
async function main() {
  try {
    const startTime = Date.now();
    console.log('🚀 RSS記事取得開始 (類義語機能付き完全版)');
    console.log(`📅 実行時刻: ${new Date().toISOString()}`);
    console.log(`🖥️  実行環境: Node.js ${process.version} on ${process.platform}`);
    
    // MeCabセットアップ
    console.log('🔧 MeCab初期化開始...');
    const mecabReady = await setupMecab();
    if (!mecabReady) {
      console.error('❌ MeCabの設定に失敗しました');
      console.error('⭕ システム確認: MeCabがインストールされているか確認してください');
      process.exit(1);
    }
    console.log('✅ MeCab準備完了');
    
    // 【新機能】WordNetセットアップ
    console.log('📚 WordNet初期化開始...');
    const wordnetReady = await setupWordNet();
    if (wordnetReady) {
      console.log('✅ WordNet準備完了');
    } else {
      console.log('⚠️  WordNet未使用 - 簡易辞書とOpenAI APIを利用');
    }
    
    // OPML読み込み
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
        console.log(`\n🔄 [${processedCount}/${feeds.length}] 処理中: ${feed.title} (${feed.folderName})`);
        try {
          const articles = await fetchAndParseRSS(feed.url, feed.title);
          
          const articlesWithFolder = articles.map(article => ({
            ...article,
            folderName: feed.folderName
          }));
          
          allArticles.push(...articlesWithFolder);
          successCount++;
          console.log(`✅ [${feed.title}] 処理成功: ${articles.length}件の記事を取得 (フォルダ: ${feed.folderName})`);
        } catch (error) {
          errorCount++;
          console.error(`❌ [${feed.title}] 処理失敗:`, error.message);
        }
        // 待機時間（類義語取得のため少し長めに）
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    const processingTime = (Date.now() - startTime) / 1000;
    console.log(`\n⏱️  フィード処理完了: ${processingTime.toFixed(1)}秒`);
    console.log(`📊 処理統計:`);
    console.log(`   処理フィード数: ${processedCount}`);
    console.log(`   成功: ${successCount}件`);
    console.log(`   失敗: ${errorCount}件`);
    console.log(`   取得記事数: ${allArticles.length}件`);
    
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
    
    // フォルダ統計表示
    const folderStats = {};
    limitedArticles.forEach(article => {
      const folder = article.folderName || 'その他';
      folderStats[folder] = (folderStats[folder] || 0) + 1;
    });
    console.log(`📂 フォルダ別記事数:`);
    Object.keys(folderStats).sort().forEach(folder => {
      console.log(`   ${folder}: ${folderStats[folder]}件`);
    });
    
    // キーワード統計表示
    const keywordStats = {};
    limitedArticles.forEach(article => {
      if (article.keywords && Array.isArray(article.keywords)) {
        article.keywords.forEach(keyword => {
          keywordStats[keyword] = (keywordStats[keyword] || 0) + 1;
        });
      }
    });
    const topKeywords = Object.entries(keywordStats)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);
    console.log(`🔑 上位キーワード:`);
    topKeywords.forEach(([keyword, count]) => {
      console.log(`   ${keyword}: ${count}回`);
    });
    
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
      folderStats: folderStats,
      keywordStats: Object.fromEntries(topKeywords),
      debugInfo: {
        processingTime: processingTime,
        errorCount: errorCount,
        debugVersion: 'v1.5-類義語機能付き完全版',
        synonymFeatures: {
          wordnetEnabled: wordnetReady,
          openaiEnabled: !!process.env.OPENAI_API_KEY,
          simpleDictEnabled: true,
          simpleDictSize: Object.keys(simpleSynonymDict).length
        }
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
    console.log(`   キーワード機能: 関連度上位3つ + 類義語最大2つ/キーワード`);
    console.log(`   類義語ソース: WordNet:${wordnetReady}, OpenAI:${!!process.env.OPENAI_API_KEY}, 簡易辞書:有効`);
    
    // WordNetデータベースクローズ
    if (wordnetDb) {
      wordnetDb.close();
      console.log('📚 WordNetデータベース接続終了');
    }
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
console.log('🚀 スクリプト実行開始（類義語機能付き完全版）');
main().catch(error => {
  console.error('💥 トップレベルエラー:', error);
  console.error('エラー詳細:', {
    name: error.name,
    message: error.message,
    stack: error.stack
  });
  process.exit(1);
});
