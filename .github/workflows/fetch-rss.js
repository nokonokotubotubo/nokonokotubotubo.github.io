// エラー詳細出力版（YAKE!キーワード抽出対応・修正版）
console.log('🔍 fetch-rss.js実行開始（YAKE!キーワード抽出修正版）');
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
  const { spawn } = require('child_process');
  const path = require('path');
  console.log('✅ 全モジュール読み込み成功');
} catch (error) {
  console.error('❌ モジュール読み込みエラー:', error);
  process.exit(1);
}

const fs = require('fs');
const xml2js = require('xml2js');
const fetch = require('node-fetch');
const { spawn } = require('child_process');
const path = require('path');

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

// YAKE!による日本語キーワード抽出（修正版）
async function extractKeywordsWithYAKE(text) {
  try {
    console.log('🔍 YAKE!によるキーワード抽出開始');
    
    if (!text || text.trim().length === 0) {
      console.log('❌ 入力テキストが空です');
      return [];
    }

    const cleanedText = text.replace(/[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBFa-zA-Z0-9\s]/g, ' ')
                           .replace(/\s+/g, ' ')
                           .trim();
    
    if (!cleanedText) {
      console.log('❌ 前処理後のテキストが空です');
      return [];
    }

    console.log(`🔍 処理対象テキスト: "${cleanedText.substring(0, 100)}..."`);
    
    const keywords = await callYAKEPython(cleanedText);
    console.log(`✅ YAKE!結果: ${JSON.stringify(keywords)}`);
    
    // 【重要】文字列配列であることを確認
    const validKeywords = keywords.filter(kw => typeof kw === 'string' && kw.length > 0);
    console.log(`✅ 有効キーワード: ${JSON.stringify(validKeywords)}`);
    
    return validKeywords.slice(0, 3);
    
  } catch (error) {
    console.error('❌ YAKE!キーワード抽出エラー:', error.message);
    return [];
  }
}

function callYAKEPython(text) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, 'yake_extractor.py');
    console.log(`🐍 Pythonスクリプト実行: ${pythonScript}`);
    
    const python = spawn('python3', [pythonScript]);
    
    let output = '';
    let errorOutput = '';
    
    python.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    python.on('close', (code) => {
      console.log(`🐍 Pythonプロセス終了: コード ${code}`);
      
      if (code !== 0) {
        console.error(`❌ Python stderr: ${errorOutput}`);
        reject(new Error(`Python script failed with code ${code}: ${errorOutput}`));
        return;
      }
      
      try {
        console.log(`🐍 Python stdout: ${output.trim()}`);
        const result = JSON.parse(output.trim());
        
        // 【重要】keywords配列の型チェック
        if (Array.isArray(result.keywords)) {
          const keywords = result.keywords.filter(kw => typeof kw === 'string');
          resolve(keywords);
        } else {
          resolve([]);
        }
      } catch (parseError) {
        console.error(`❌ JSON パースエラー: ${parseError.message}`);
        console.error(`❌ パース対象: "${output.trim()}"`);
        reject(new Error(`Failed to parse Python output: ${parseError.message}`));
      }
    });
    
    python.on('error', (error) => {
      console.error(`❌ Pythonプロセスエラー: ${error.message}`);
      reject(error);
    });
    
    python.stdin.write(text);
    python.stdin.end();
  });
}

// 既存のOPML読み込み処理を維持
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

// YAKE!対応版のparseRSSItem関数
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
    const keywords = await extractKeywordsWithYAKE(title + ' ' + cleanDescription);
    
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
      keywords,
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

// main関数内でフォルダ名を記事に追加
async function main() {
  try {
    const startTime = Date.now();
    console.log('🚀 RSS記事取得開始 (YAKE!キーワード抽出修正版)');
    console.log(`📅 実行時刻: ${new Date().toISOString()}`);
    console.log(`🖥️  実行環境: Node.js ${process.version} on ${process.platform}`);
    
    // YAKE!システム初期化
    console.log('🔧 YAKE!キーワード抽出システム初期化完了');
    
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
          
          // 記事にフォルダ名を追加
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
      debugInfo: {
        processingTime: processingTime,
        errorCount: errorCount,
        debugVersion: 'v2.0-YAKE!キーワード抽出修正版'
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
    console.log(`   キーワード抽出: YAKE!アルゴリズム（上位3件・文字列型保証）`);
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
console.log('🚀 スクリプト実行開始（YAKE!キーワード抽出修正版）');
main().catch(error => {
  console.error('💥 トップレベルエラー:', error);
  console.error('エラー詳細:', {
    name: error.name,
    message: error.message,
    stack: error.stack
  });
  process.exit(1);
});
