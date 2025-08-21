${limitedArticles.length}件（上限1000件）`);
    
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
        debugVersion: 'v1.4-記事ID安定化対応版'
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
