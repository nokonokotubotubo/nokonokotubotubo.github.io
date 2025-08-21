// エラー詳細出力版（Wikipedia + 簡易辞書版）
console.log('🔍 fetch-rss.js実行開始（Wikipedia + 簡易辞書版）');
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

// 【拡張】簡易同義語辞書（大幅拡張版）
const simpleSynonymDict = {
  // IT・テクノロジー関連
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
  'クラウド': ['雲計算', 'オンライン'],
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
  'ビッグデータ': ['大量データ', 'データ群'],
  'ロボット': ['自動機械', '機械人間'],
  'VR': ['仮想現実', 'バーチャルリアリティ'],
  'AR': ['拡張現実', '混合現実'],
  '5G': ['第5世代移動通信', '高速通信'],
  'SNS': ['ソーシャルネットワーク', '社交媒体'],
  
  // ビジネス・経済関連
  'ビジネス': ['事業', '商売'],
  '企業': ['会社', '法人'],
  '経済': ['エコノミー', '景気'],
  '市場': ['マーケット', '相場'],
  '投資': ['出資', '資金投入'],
  '売上': ['売り上げ', '収益'],
  '利益': ['収益', 'プロフィット'],
  '成長': ['拡大', '発展'],
  '戦略': ['作戦', 'ストラテジー'],
  'マーケティング': ['販売促進', '市場開拓'],
  '顧客': ['お客様', 'カスタマー'],
  '製品': ['商品', 'プロダクト'],
  'ブランド': ['銘柄', '商標'],
  '競合': ['ライバル', '競争相手'],
  '価格': ['値段', '料金'],
  '品質': ['クオリティ', '質'],
  '効率': ['能率', 'エフィシェンシー'],
  '生産性': ['効率性', 'プロダクティビティ'],
  
  // エンターテイメント・メディア関連
  'ゲーム': ['遊戯', 'エンターテイメント'],
  'コンテンツ': ['内容', '情報'],
  'メディア': ['媒体', '報道'],
  'ニュース': ['報道', '情報'],
  'エンタメ': ['エンターテイメント', '娯楽'],
  '映画': ['シネマ', '映像作品'],
  '音楽': ['ミュージック', '楽曲'],
  '動画': ['ビデオ', '映像'],
  '写真': ['フォト', '画像'],
  '配信': ['ストリーミング', '放送'],
  
  // 金融・フィンテック関連
  'フィンテック': ['金融技術', 'デジタル金融'],
  'ブロックチェーン': ['分散台帳', 'チェーン技術'],
  '仮想通貨': ['暗号通貨', 'デジタル通貨'],
  'NFT': ['非代替トークン', 'デジタル資産'],
  'メタバース': ['仮想空間', 'デジタル世界'],
  '決済': ['支払い', 'ペイメント'],
  '送金': ['振込', 'マネー転送'],
  '資産': ['財産', 'アセット'],
  '投資': ['運用', 'インベストメント'],
  '保険': ['インシュアランス', '保障'],
  
  // 一般用語・形容詞
  '新しい': ['新規', '最新'],
  '古い': ['旧式', 'レガシー'],
  '大きい': ['巨大', 'ビッグ'],
  '小さい': ['コンパクト', 'ミニ'],
  '速い': ['高速', 'スピーディー'],
  '遅い': ['低速', 'スロー'],
  '便利': ['使いやすい', '実用的'],
  '簡単': ['シンプル', '容易'],
  '複雑': ['煩雑', '難解'],
  '重要': ['大切', '必要'],
  '効果的': ['有効', '実用的'],
  '人気': ['評判', 'ポピュラー'],
  '最適': ['ベスト', '理想的'],
  '安全': ['セキュア', '安心'],
  '危険': ['リスク', 'ハザード'],
  
  // 業界・分野関連
  '医療': ['メディカル', '医学'],
  '教育': ['エデュケーション', '学習'],
  '交通': ['運輸', '輸送'],
  '建設': ['建築', '工事'],
  '製造': ['メーカー', '生産'],
  '小売': ['販売', 'リテール'],
  '物流': ['配送', 'ロジスティクス'],
  '不動産': ['リアルエステート', '物件'],
  '農業': ['農作', 'アグリ'],
  '環境': ['エコ', '自然'],
  
  // 時間・場所関連
  '今日': ['本日', 'きょう'],
  '明日': ['あす', 'あした'],
  '昨日': ['きのう', '前日'],
  '今年': ['本年', '当年'],
  '来年': ['翌年', 'らいねん'],
  '去年': ['昨年', '前年'],
  '世界': ['グローバル', '国際'],
  '日本': ['国内', 'ジャパン'],
  '東京': ['首都', '都内'],
  '地方': ['ローカル', '地域'],
  
  // 動作・状態関連
  '開発': ['開発', 'デベロップメント'],
  '改善': ['向上', 'インプルーブ'],
  '分析': ['解析', 'アナリシス'],
  '管理': ['マネジメント', '運営'],
  '運用': ['オペレーション', '稼働'],
  '導入': ['実装', 'インプリメント'],
  '更新': ['アップデート', '新版'],
  '削除': ['除去', 'デリート'],
  '追加': ['付加', 'アド'],
  '変更': ['修正', 'チェンジ']
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

// 【新機能】Wikipedia APIを使った類義語取得
async function getSynonymsFromWikipedia(word) {
  try {
    console.log(`📚 [${word}] Wikipedia検索開始`);
    const synonyms = [];
    
    // 1. Wikipedia検索APIで関連記事を取得
    const searchUrl = `https://ja.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(word)}&limit=8&format=json&origin=*`;
    const searchResponse = await fetch(searchUrl, { timeout: 5000 });
    
    if (!searchResponse.ok) {
      console.log(`⚠️  [${word}] Wikipedia検索API応答エラー`);
      return [];
    }
    
    const searchData = await searchResponse.json();
    
    if (searchData[1] && searchData[1].length > 0) {
      console.log(`📊 [${word}] Wikipedia検索結果: ${searchData[1].length}件`);
      
      // 関連語候補を抽出
      searchData[1].forEach(title => {
        if (title !== word && synonyms.length < 3) {
          // 類似度判定
          if (isSimilarTerm(word, title)) {
            synonyms.push(title);
            console.log(`✅ [${word}] Wikipedia類義語候補: ${title}`);
          }
        }
      });
    }
    
    // 2. 記事の要約から追加的な類義語を抽出
    if (synonyms.length < 2) {
      try {
        const summaryUrl = `https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`;
        const summaryResponse = await fetch(summaryUrl, { timeout: 5000 });
        
        if (summaryResponse.ok) {
          const summaryData = await summaryResponse.json();
          
          // タイトルの別表記をチェック
          if (summaryData.displaytitle && summaryData.displaytitle !== word && synonyms.length < 2) {
            const displayTitle = summaryData.displaytitle.replace(/<[^>]*>/g, ''); // HTMLタグ除去
            if (displayTitle !== word && displayTitle.length > 1) {
              synonyms.push(displayTitle);
              console.log(`✅ [${word}] Wikipedia別表記: ${displayTitle}`);
            }
          }
          
          // 説明文から類義語を抽出（カッコ内の別名など）
          if (summaryData.extract && synonyms.length < 2) {
            const aliases = extractAliasesFromText(summaryData.extract, word);
            aliases.forEach(alias => {
              if (synonyms.length < 2 && !synonyms.includes(alias)) {
                synonyms.push(alias);
                console.log(`✅ [${word}] Wikipedia別名抽出: ${alias}`);
              }
            });
          }
        }
      } catch (summaryError) {
        console.log(`⚠️  [${word}] Wikipedia要約取得エラー:`, summaryError.message);
      }
    }
    
    const result = synonyms.slice(0, 2);
    console.log(`📚 [${word}] Wikipedia最終結果: ${result.join(', ')}`);
    return result;
    
  } catch (error) {
    console.error(`❌ [${word}] Wikipedia API エラー:`, error.message);
    return [];
  }
}

// 類似度判定関数
function isSimilarTerm(original, candidate) {
  // 完全一致は除外
  if (original === candidate) return false;
  
  // 長さチェック
  if (candidate.length < 2 || candidate.length > 20) return false;
  
  // 基本的な類似度チェック
  const originalLower = original.toLowerCase();
  const candidateLower = candidate.toLowerCase();
  
  // 包含関係チェック
  if (candidateLower.includes(originalLower) || originalLower.includes(candidateLower)) {
    return true;
  }
  
  // カタカナ・ひらがな変換での類似度チェック
  const originalKana = convertToKatakana(original);
  const candidateKana = convertToKatakana(candidate);
  
  if (originalKana === candidateKana) return true;
  
  // 英数字混在パターン
  const hasAlpha = /[a-zA-Z]/.test(original) || /[a-zA-Z]/.test(candidate);
  if (hasAlpha && (candidateLower.includes(originalLower.substring(0, 3)) || 
                   originalLower.includes(candidateLower.substring(0, 3)))) {
    return true;
  }
  
  return false;
}

// カタカナ変換関数
function convertToKatakana(str) {
  return str.replace(/[\u3041-\u3096]/g, (match) => {
    const char = match.charCodeAt(0) + 0x60;
    return String.fromCharCode(char);
  });
}

// テキストから別名を抽出
function extractAliasesFromText(text, originalWord) {
  const aliases = [];
  
  // カッコ内の別名を抽出
  const bracketMatches = text.match(/[（(]([^）)]+)[）)]/g);
  if (bracketMatches) {
    bracketMatches.forEach(match => {
      const alias = match.replace(/[（()）]/g, '');
      if (alias !== originalWord && alias.length > 1 && alias.length < 15) {
        aliases.push(alias);
      }
    });
  }
  
  // 「〜とも呼ばれる」「〜または」パターンを抽出
  const alsoCalledMatches = text.match(/(とも呼ばれる|または|もしくは|別名|通称)([^、。]+)/g);
  if (alsoCalledMatches) {
    alsoCalledMatches.forEach(match => {
      const alias = match.replace(/(とも呼ばれる|または|もしくは|別名|通称)/, '').trim();
      if (alias !== originalWord && alias.length > 1 && alias.length < 15) {
        aliases.push(alias);
      }
    });
  }
  
  return aliases;
}

// 【統合】類義語取得関数（Wikipedia + 簡易辞書）
async function getSynonyms(word) {
  console.log(`🔍 [${word}] 類義語検索開始（Wikipedia + 簡易辞書版）`);
  let synonyms = [];
  let source = '';
  
  try {
    // 1. Wikipedia APIから類義語を取得
    synonyms = await getSynonymsFromWikipedia(word);
    if (synonyms.length > 0) {
      source = 'Wikipedia';
    }
    
    // 2. 簡易辞書から類義語を取得（Wikipediaで不足の場合）
    if (synonyms.length < 2 && simpleSynonymDict[word]) {
      const dictSynonyms = simpleSynonymDict[word].slice(0, 2 - synonyms.length);
      // Wikipedia結果と重複しないものを追加
      dictSynonyms.forEach(syn => {
        if (!synonyms.includes(syn)) {
          synonyms.push(syn);
        }
      });
      if (dictSynonyms.length > 0) {
        source = source ? `${source}+簡易辞書` : '簡易辞書';
      }
    }
    
    // 重複排除と元の単語除外
    const filteredSynonyms = synonyms
      .filter((syn, index, arr) => arr.indexOf(syn) === index)
      .filter(syn => syn !== word && syn.length > 0)
      .slice(0, 2);
    
    console.log(`✅ [${word}] 類義語取得完了 (${source}): ${filteredSynonyms.join(', ')}`);
    return filteredSynonyms;
  } catch (error) {
    console.error(`❌ [${word}] 類義語取得エラー:`, error.message);
    return [];
  }
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

// 【修正】フォルダ構造対応版のOPML読み込み（エラー耐性強化）
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
    
    // 【重要】詳細な構造チェックとデバッグ出力を復活
    console.log('🔍 OPML解析結果の構造確認:');
    console.log(`   トップレベルキー: ${Object.keys(result).join(', ')}`);
    
    if (!result.opml) {
      console.error('❌ OPML構造エラー: opml要素が見つかりません');
      console.error('解析結果:', JSON.stringify(result, null, 2).substring(0, 500));
      return [];
    }
    
    if (!result.opml.body) {
      console.error('❌ OPML構造エラー: body要素が見つかりません');
      console.error('opml内容:', JSON.stringify(result.opml, null, 2).substring(0, 500));
      return [];
    }
    
    if (!result.opml.body[0]) {
      console.error('❌ OPML構造エラー: body配列が空です');
      console.error('body内容:', JSON.stringify(result.opml.body, null, 2).substring(0, 500));
      return [];
    }
    
    if (!result.opml.body[0].outline) {
      console.error('❌ OPML構造エラー: outline要素が見つかりません');
      console.error('body[0]内容:', JSON.stringify(result.opml.body[0], null, 2).substring(0, 500));
      return [];
    }
    
    const feeds = [];
    const outlines = result.opml.body[0].outline;
    
    console.log(`📊 outline要素数: ${Array.isArray(outlines) ? outlines.length : '1個（非配列）'}`);
    
    // 配列でない場合の対応
    const outlinesArray = Array.isArray(outlines) ? outlines : [outlines];
    
    outlinesArray.forEach((outline, index) => {
      console.log(`🔍 outline[${index}]の処理開始`);
      console.log(`   属性: ${outline.$ ? Object.keys(outline.$).join(', ') : 'なし'}`);
      console.log(`   子要素: ${outline.outline ? (Array.isArray(outline.outline) ? outline.outline.length + '個' : '1個') : 'なし'}`);
      
      if (outline.outline) {
        // フォルダ内のフィード
        const folderName = (outline.$ && (outline.$.text || outline.$.title)) || `フォルダ${index}`;
        console.log(`📂 フォルダ処理: ${folderName}`);
        
        const childOutlines = Array.isArray(outline.outline) ? outline.outline : [outline.outline];
        childOutlines.forEach((feed, feedIndex) => {
          if (feed.$ && feed.$.xmlUrl) {
            const feedTitle = feed.$.title || feed.$.text || `フィード${feedIndex}`;
            feeds.push({
              id: generateStableIdForRSS(feed.$.xmlUrl, feedTitle, new Date().toISOString()),
              url: feed.$.xmlUrl,
              title: feedTitle,
              folderName: folderName,
              lastUpdated: new Date().toISOString(),
              isActive: true
            });
            console.log(`  ✅ フィード追加: ${feedTitle}`);
          } else {
            console.log(`  ⚠️  無効なフィード[${feedIndex}]: xmlUrlが見つかりません`);
            if (feed.$) {
              console.log(`    属性: ${Object.keys(feed.$).join(', ')}`);
            }
          }
        });
      } else if (outline.$ && outline.$.xmlUrl) {
        // フォルダなしのフィード
        const feedTitle = outline.$.title || outline.$.text || `単体フィード${index}`;
        console.log(`📄 単体フィード処理: ${feedTitle}`);
        feeds.push({
          id: generateStableIdForRSS(outline.$.xmlUrl, feedTitle, new Date().toISOString()),
          url: outline.$.xmlUrl,
          title: feedTitle,
          folderName: 'その他',
          lastUpdated: new Date().toISOString(),
          isActive: true
        });
        console.log(`  ✅ フィード追加: ${feedTitle}`);
      } else {
        console.log(`⚠️  outline[${index}]はフォルダでもフィードでもありません`);
        if (outline.$) {
          console.log(`   属性: ${Object.keys(outline.$).join(', ')}`);
        }
      }
    });
    
    console.log(`📋 OPML読み込み完了: ${feeds.length}個のフィードを検出`);
    
    // フィードが0個の場合の詳細ログ
    if (feeds.length === 0) {
      console.error('❌ 有効なフィードが見つかりませんでした');
      console.error('   すべてのoutline要素の詳細:');
      outlinesArray.forEach((outline, index) => {
        console.error(`   outline[${index}]:`, JSON.stringify(outline, null, 2).substring(0, 200));
      });
    }
    
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

    const articles = [];
    let items = [];
    if (result.rss && result.rss.channel && result.rss.channel.item) {
      items = Array.isArray(result.rss.channel.item) ? result.rss.channel.item : [result.rss.channel.item];
    } else if (result.feed && result.feed.entry) {
      items = Array.isArray(result.feed.entry) ? result.feed.entry : [result.feed.entry];
    } else if (result['rdf:RDF'] && result['rdf:RDF'].item) {
      items = Array.isArray(result['rdf:RDF'].item) ? result['rdf:RDF'].item : [result['rdf:RDF'].item];
    }

    console.log(`🔄 [${title}] アイテム解析開始: ${items.length}件を処理`);
    for (const item of items.slice(0, 20)) {
      const article = await parseRSSItem(item, url, title);
      if (article) {
        articles.push(article);
      }
    }
    console.log(`🎉 [${title}] 取得完了: ${articles.length}件`);
    return articles;
  } catch (error) {
    console.error(`❌ [${title}] RSS取得エラー: ${error.message}`);
    return [];
  }
}

function looksLikeUrl(v) {
  return typeof v === 'string' && /^https?:\/\//.test(v.trim());
}

function extractUrlFromItem(item) {
  if (typeof item.link === 'string' && looksLikeUrl(item.link)) return item.link;
  
  if (typeof item.link === 'object' && item.link && !Array.isArray(item.link)) {
    if (item.link.$ && item.link.$.href && looksLikeUrl(item.link.$.href)) return item.link.$.href;
    if (item.link.href && looksLikeUrl(item.link.href)) return item.link.href;
    if (item.link._ && looksLikeUrl(item.link._)) return item.link._;
  }
  
  if (Array.isArray(item.link)) {
    for (const l of item.link) {
      if (l && l.$ && l.$.rel === 'alternate' && looksLikeUrl(l.$.href)) return l.$.href;
    }
    
    for (const l of item.link) {
      if (l && l.$ && l.$.href && l.$.rel !== 'enclosure' && looksLikeUrl(l.$.href)) return l.$.href;
    }
    
    for (const l of item.link) {
      if (l && l.href && looksLikeUrl(l.href)) return l.href;
      if (l && l._ && looksLikeUrl(l._)) return l._;
      if (typeof l === 'string' && looksLikeUrl(l)) return l;
    }
  }
  
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

async function parseRSSItem(item, sourceUrl, feedTitle) {
  try {
    const title = cleanText(item.title || '');
    const link = extractUrlFromItem(item);
    const description = cleanText(item.description || item.summary || item.content?._ || item.content || '');
    const pubDate = item.pubDate || item.published || item.updated || new Date().toISOString();
    const category = cleanText(item.category?._ || item.category || 'General');
    
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
    
    // キーワード抽出を上位3つに限定し、類義語を追加
    const baseKeywords = await extractKeywordsWithMecab(title + ' ' + cleanDescription);
    const top3Keywords = baseKeywords.slice(0, 3);
    
    // 各キーワードに対して類義語を取得
    const keywordsWithSynonyms = [];
    for (const keyword of top3Keywords) {
      keywordsWithSynonyms.push(keyword);
      
      const synonyms = await getSynonyms(keyword);
      keywordsWithSynonyms.push(...synonyms);
    }
    
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
      keywords: keywordsWithSynonyms,
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

async function extractKeywordsWithMecab(text) {
  const MAX_KEYWORDS = 3;
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
    console.log('🚀 RSS記事取得開始 (Wikipedia + 簡易辞書版)');
    console.log(`📅 実行時刻: ${new Date().toISOString()}`);
    
    // MeCabセットアップ
    console.log('🔧 MeCab初期化開始...');
    const mecabReady = await setupMecab();
    if (!mecabReady) {
      console.error('❌ MeCabの設定に失敗しました');
      process.exit(1);
    }
    console.log('✅ MeCab準備完了');
    
    // 類義語機能の確認
    console.log('📚 類義語機能確認...');
    console.log(`   Wikipedia API: 利用可能`);
    console.log(`   簡易辞書語彙数: ${Object.keys(simpleSynonymDict).length}語`);
    
    const feeds = await loadOPML();
    if (feeds.length === 0) {
      console.error('❌ フィードが取得できませんでした');
      process.exit(1);
    }
    
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
          console.log(`✅ [${feed.title}] 処理成功: ${articles.length}件の記事を取得`);
        } catch (error) {
          errorCount++;
          console.error(`❌ [${feed.title}] 処理失敗:`, error.message);
        }
        // Wikipedia APIレート制限を考慮した待機
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
    
    const processingTime = (Date.now() - startTime) / 1000;
    console.log(`\n📊 処理統計:`);
    console.log(`   取得記事数: ${allArticles.length}件`);
    console.log(`   処理時間: ${processingTime.toFixed(1)}秒`);
    
    // 重複除去処理
    const uniqueArticles = [];
    const seen = new Set();
    allArticles.forEach(article => {
      const key = `${article.title}_${article.rssSource}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueArticles.push(article);
      }
    });
    
    uniqueArticles.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
    const limitedArticles = uniqueArticles.slice(0, 1000);
    
    // 統計情報生成
    const folderStats = {};
    const keywordStats = {};
    limitedArticles.forEach(article => {
      const folder = article.folderName || 'その他';
      folderStats[folder] = (folderStats[folder] || 0) + 1;
      
      if (article.keywords && Array.isArray(article.keywords)) {
        article.keywords.forEach(keyword => {
          keywordStats[keyword] = (keywordStats[keyword] || 0) + 1;
        });
      }
    });
    
    const topKeywords = Object.entries(keywordStats)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15);
      
    console.log(`🔑 上位キーワード (Wikipedia+簡易辞書):`);
    topKeywords.slice(0, 10).forEach(([keyword, count]) => {
      console.log(`   ${keyword}: ${count}回`);
    });
    
    if (!fs.existsSync('./mss')) {
      fs.mkdirSync('./mss');
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
        debugVersion: 'v2.0-Wikipedia+簡易辞書版',
        synonymFeatures: {
          wikipediaEnabled: true,
          simpleDictEnabled: true,
          simpleDictSize: Object.keys(simpleSynonymDict).length,
          wordnetEnabled: false,
          openaiEnabled: false
        }
      }
    };
    
    fs.writeFileSync('./mss/articles.json', JSON.stringify(output, null, 2));
    const totalTime = (Date.now() - startTime) / 1000;
    console.log('\n🎉 RSS記事取得完了!');
    console.log(`📊 最終結果:`);
    console.log(`   保存記事数: ${limitedArticles.length}件`);
    console.log(`   総実行時間: ${totalTime.toFixed(1)}秒`);
    console.log(`   類義語ソース: Wikipedia API + 簡易辞書(${Object.keys(simpleSynonymDict).length}語)`);
  } catch (error) {
    console.error('💥 main関数内でエラーが発生しました:', error);
    process.exit(1);
  }
}

console.log('🚀 スクリプト実行開始（Wikipedia + 簡易辞書版）');
main().catch(error => {
  console.error('💥 トップレベルエラー:', error);
  process.exit(1);
});
