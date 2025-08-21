// エラー詳細出力版（記事ID安定化対応 + キーワード機能のみ追加）
console.log('🔍 fetch-rss.js実行開始（記事ID安定化対応版）');
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
  // 【キーワード機能のみ追加】同義語辞書読み込み確認
  try {
    require('sudachi-synonyms-dictionary');
    console.log('✅ Sudachi同義語辞書確認成功');
  } catch (error) {
    console.warn('⚠️  Sudachi同義語辞書が見つかりません、フォールバック辞書を使用します');
  }
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

// 【キーワード機能のみ追加】同義語辞書をロード
let synonymsDict = null;

async function loadSynonymsDict() {
  if (synonymsDict) return synonymsDict;
  try {
    const sudachiSynonyms = require('sudachi-synonyms-dictionary');
    synonymsDict = sudachiSynonyms;
    console.log('✅ Sudachi同義語辞書読み込み成功');
    return synonymsDict;
  } catch (error) {
    console.warn('⚠️  Sudachi同義語辞書が利用できません、フォールバック辞書を使用:', error.message);
    synonymsDict = {
      'スマホ': ['スマートフォン', '携帯電話'],
      'スマートフォン': ['スマホ', '携帯電話'], 
      'AI': ['人工知能', '機械学習'],
      '人工知能': ['AI', 'ＡＩ'],
      '技術': ['テクノロジー', 'テック'],
      'テクノロジー': ['技術', 'テック'],
      'アプリ': ['アプリケーション', 'ソフト'],
      'アプリケーション': ['アプリ', 'ソフトウェア'],
      'データ': ['情報', 'デジタル'],
      'システム': ['仕組み', 'プラットフォーム'],
      'サービス': ['機能', 'システム'],
      '開発': ['制作', '構築'],
      'ユーザー': ['利用者', '使用者'],
      'インターネット': ['ネット', 'Web'],
      'ネット': ['インターネット', 'オンライン'],
      'クラウド': ['オンライン', 'ネット'],
      'セキュリティ': ['安全', '保護'],
      'プライバシー': ['個人情報', '秘匿性'],
      'iPhone': ['アイフォン', 'スマートフォン'],
      'Android': ['アンドロイド', 'スマホ'],
      'Google': ['グーグル', '検索'],
      'Apple': ['アップル', 'iPhone'],
      'Microsoft': ['マイクロソフト', 'MS'],
      'AWS': ['Amazon Web Services', 'クラウド'],
      'API': ['インターフェース', '接続'],
      'UI': ['ユーザーインターフェース', '画面'],
      'UX': ['ユーザーエクスペリエンス', '体験'],
      'IoT': ['Internet of Things', 'モノのインターネット'],
      'VR': ['バーチャルリアリティ', '仮想現実'],
      'AR': ['拡張現実', 'オーグメンテッド'],
      'ブロックチェーン': ['暗号通貨', '分散台帳'],
      'ビットコイン': ['仮想通貨', '暗号通貨'],
      'NFT': ['非代替トークン', 'デジタル'],
      'DX': ['デジタル変革', 'デジタルトランスフォーメーション']
    };
    return synonymsDict;
  }
}

function getSynonyms(word) {
  if (!synonymsDict) return [];
  const synonyms = synonymsDict[word];
  if (Array.isArray(synonyms)) {
    return synonyms.slice(0, 2);
  }
  return [];
}

// 【新規追加】RSS用安定ID生成関数
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

// 【元のコード完全保持】フォルダ構造対応版のOPML読み込み
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

// 【キーワード機能のみ追加】強化されたキーワード抽出関数
async function extractEnhancedKeywords(text) {
  const MAX_MAIN_KEYWORDS = 3;
  const MIN_LENGTH = 2;
  const stopWords = new Set([
    'これ', 'それ', 'この', 'その', 'です', 'ます', 'である', 'だっ',
    'する', 'なる', 'ある', 'いる', 'こと', 'もの', 'ため', 'よう',
    '記事', 'ニュース', '情報', '発表', '企業', '会社', '今回', '今日',
    '先日', '最近', '以上', '以下', '場合', '時間', '年月', '予定'
  ]);

  try {
    console.log('🔍 強化されたキーワード抽出処理開始...');
    
    await loadSynonymsDict();
    
    const cleanTexted = text.replace(/[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBFa-zA-Z0-9\s]/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim();
    if (!cleanTexted) return [];

    const parsed = await mecabParsePromise(cleanTexted);
    if (!Array.isArray(parsed) || parsed.length === 0) return [];

    const keywordScores = new Map();

    parsed.forEach((token, index) => {
      if (!Array.isArray(token) || token.length < 8) {
        return;
      }
      
      const surface = token[0];
      const pos = token[1];
      const pos1 = token[2];
      const baseForm = token[3] || surface;
      
      const isValidPOS = 
        pos === '名詞' ||
        pos === '動詞' ||
        pos === '形容詞';
        
      if (!isValidPOS) return;
      
      if (pos === '名詞' && (pos1 === '代名詞' || pos1 === '数' || pos1 === '接尾')) return;
      if (pos === '動詞' && pos1 !== '自立') return;
      if (pos === '形容詞' && pos1 !== '自立') return;
      
      const keyword = (baseForm && baseForm !== '*' && baseForm !== surface) ? baseForm : surface;
      
      if (keyword.length >= MIN_LENGTH && 
          !stopWords.has(keyword) && 
          !/^[0-9]+$/.test(keyword) &&
          !/^[ａ-ｚＡ-Ｚ]+$/.test(keyword) &&
          keyword !== '*') {
        
        const currentScore = keywordScores.get(keyword) || 0;
        let score = 1;
        
        const positionWeight = Math.max(0.5, 1 - (index / parsed.length) * 0.5);
        score *= positionWeight;
        
        if (pos === '名詞') {
          if (pos1 === '固有名詞') score *= 2.0;
          else if (pos1 === 'サ変接続') score *= 1.5;
          else score *= 1.3;
        } else if (pos === '動詞') {
          score *= 1.2;
        } else if (pos === '形容詞') {
          score *= 1.1;
        }
        
        keywordScores.set(keyword, currentScore + score);
      }
    });

    const topKeywords = Array.from(keywordScores.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, MAX_MAIN_KEYWORDS)
      .map(([keyword]) => keyword);

    console.log(`📊 メインキーワード抽出完了: ${topKeywords.join(', ')}`);

    const enhancedKeywords = [];
    for (const keyword of topKeywords) {
      const synonyms = getSynonyms(keyword);
      const keywordData = {
        word: keyword,
        synonyms: synonyms
      };
      enhancedKeywords.push(keywordData);
      console.log(`🔗 [${keyword}] 同義語: ${synonyms.join(', ') || 'なし'}`);
    }

    console.log(`✅ キーワード抽出完了: ${enhancedKeywords.length}個のキーワードと同義語`);
    return enhancedKeywords;

  } catch (error) {
    console.error('❌ 強化キーワード抽出エラー:', error.message);
    return [];
  }
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
    
    // 日付フィルター処理は既存通り
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
    
    // 【キーワード機能のみ変更】新しいキーワード抽出関数を使用
    const keywords = await extractEnhancedKeywords(title + ' ' + cleanDescription);
    
    // 【重要修正】安定したID生成に変更
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
      keywords, // 【キーワード機能のみ追加】構造化されたキーワード（同義語付き）
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

// 【修正】main関数内でフォルダ名を記事に追加
async function main() {
  try {
    const startTime = Date.now();
    console.log('🚀 RSS記事取得開始 (記事ID安定化対応版)');
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
        console.log(`\n🔄 [${processedCount}/${feeds.length}] 処理中: ${feed.title} (${feed.folderName})`);
        try {
          const articles = await fetchAndParseRSS(feed.url, feed.title);
          
          // 【重要】記事にフォルダ名を追加
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
    
    // 【キーワード機能のみ追加】キーワード統計表示
    console.log(`\n🔑 キーワード統計:`);
    const keywordStats = {};
    let totalKeywords = 0;
    let totalSynonyms = 0;
    
    limitedArticles.forEach(article => {
      if (Array.isArray(article.keywords)) {
        article.keywords.forEach(keywordData => {
          if (keywordData.word) {
            keywordStats[keywordData.word] = (keywordStats[keywordData.word] || 0) + 1;
            totalKeywords++;
            if (keywordData.synonyms) {
              totalSynonyms += keywordData.synonyms.length;
            }
          }
        });
      }
    });
    
    console.log(`   総キーワード数: ${totalKeywords}個`);
    console.log(`   総同義語数: ${totalSynonyms}個`);
    console.log(`   ユニークキーワード数: ${Object.keys(keywordStats).length}個`);
    
    if (Object.keys(keywordStats).length > 0) {
      const topKeywords = Object.entries(keywordStats)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);
      console.log(`   頻出キーワード TOP10:`);
      topKeywords.forEach(([keyword, count]) => {
        console.log(`     ${keyword}: ${count}回`);
      });
    }
    
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
      // 【キーワード機能のみ追加】キーワード統計
      keywordStats: {
        totalKeywords: totalKeywords,
        totalSynonyms: totalSynonyms,
        uniqueKeywords: Object.keys(keywordStats).length,
        topKeywords: Object.keys(keywordStats).length > 0 ? 
          Object.entries(keywordStats).sort(([, a], [, b]) => b - a).slice(0, 10) : []
      },
      debugInfo: {
        processingTime: processingTime,
        errorCount: errorCount,
        debugVersion: 'v1.5-キーワード機能追加版'
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
    console.log(`   ID安定化: URL+タイトル+日付ベースのハッシュID使用`);
    console.log(`   キーワード機能: 関連度上位3つ + 同義語最大2つ/語`);
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
console.log('🚀 スクリプト実行開始（記事ID安定化対応版）');
main().catch(error => {
  console.error('💥 トップレベルエラー:', error);
  console.error('エラー詳細:', {
    name: error.name,
    message: error.message,
    stack: error.stack
  });
  process.exit(1);
});
