// エラー詳細出力版
console.log('🔍 fetch-rss.js実行開始');
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

// main関数の強化
async function main() {
  try {
    const startTime = Date.now();
    console.log('🚀 RSS記事取得開始 (堅牢化デバッグ版)');
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
    const activeFeeds = feeds.filter(f => f.isActive);
    console.log(`📋 フィード情報: 全${feeds.length}件中${activeFeeds.length}件がアクティブ`);
    
    // RSS取得処理
    console.log('🌐 RSS取得処理開始...');
    let allArticles;
    try {
      allArticles = await processFeedsWithConcurrency(feeds);
    } catch (error) {
      console.error('❌ フィード処理中にクリティカルエラー:', error);
      console.error('スタックトレース:', error.stack);
      process.exit(1);
    }
    
    const processingTime = (Date.now() - startTime) / 1000;
    console.log(`⏱️  フィード処理完了: ${processingTime.toFixed(1)}秒`);
    console.log(`📊 取得記事数: ${allArticles.length}件`);
    
    // データ処理の続行...
    if (allArticles.length === 0) {
      console.warn('⚠️  記事が取得できませんでしたが、処理を続行します');
    }
    
    // 以下、既存の処理と同じ...
    
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

// setupMecab関数の強化
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
  
  // 標準辞書のテスト
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

// loadOPML関数の強化
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
    
    if (!result.opml || !result.opml.body || !result.opml.body[0] || !result.opml.body[0].outline) {
      console.error('❌ OPML構造が不正です');
      console.error('OPML内容:', JSON.stringify(result, null, 2).substring(0, 500));
      return [];
    }
    
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
    
    console.log(`📋 OPML読み込み完了: ${feeds.length}個のフィードを検出`);
    return feeds;
  } catch (error) {
    console.error('❌ OPML読み込みエラー:', error);
    console.error('エラー詳細:', error.stack);
    return [];
  }
}

// 実行開始
console.log('🚀 スクリプト実行開始');
main().catch(error => {
  console.error('💥 トップレベルエラー:', error);
  console.error('エラー詳細:', {
    name: error.name,
    message: error.message,
    stack: error.stack
  });
  process.exit(1);
});
