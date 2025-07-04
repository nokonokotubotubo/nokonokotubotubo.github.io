const fs = require('fs');
const Parser = require('rss-parser');
const crypto = require('crypto');

// RSS処理設定
const CONFIG = {
  MAX_ARTICLES_PER_FEED: 15,
  MAX_DESCRIPTION_LENGTH: 500,
  OUTPUT_DIR: 'ai-rss-temp/data'
};

class RSSProcessor {
  constructor() {
    this.parser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'AI-RSS-Dashboard/1.0'
      }
    });
  }

  async processFeed(feed) {
    try {
      console.log(`📡 処理中: ${feed.name}`);
      const feedData = await this.parser.parseURL(feed.url);
      
      const items = feedData.items
        .slice(0, CONFIG.MAX_ARTICLES_PER_FEED)
        .map(item => ({
          id: crypto.createHash('md5').update(item.link || '').digest('hex'),
          title: this.cleanText(item.title || ''),
          link: item.link || '',
          pubDate: item.pubDate || new Date().toISOString(),
          description: this.cleanText(item.contentSnippet || item.content || ''),
          category: feed.category,
          feedName: feed.name,
          timestamp: new Date().toISOString(),
          preference: null
        }));

      console.log(`✅ ${feed.name}: ${items.length}件取得`);
      return items;
      
    } catch (error) {
      console.error(`❌ ${feed.name} 取得失敗:`, error.message);
      return [];
    }
  }

  cleanText(text) {
    return text
      .replace(/<[^>]*>/g, '') // HTMLタグ除去
      .replace(/\s+/g, ' ')    // 空白正規化
      .trim()
      .substring(0, CONFIG.MAX_DESCRIPTION_LENGTH);
  }

  removeDuplicates(articles) {
    const seen = new Set();
    return articles.filter(article => {
      if (seen.has(article.id)) {
        return false;
      }
      seen.add(article.id);
      return true;
    });
  }

  async processAllFeeds() {
    try {
      console.log('🚀 RSS処理開始...');
      
      const feedsConfig = JSON.parse(
        fs.readFileSync('config/ai-rss-feeds.json', 'utf8')
      );
      
      const allArticles = [];
      
      // 並列処理で効率化
      const feedPromises = feedsConfig.feeds.map(feed => 
        this.processFeed(feed)
      );
      
      const results = await Promise.allSettled(feedPromises);
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          allArticles.push(...result.value);
        } else {
          console.error(`❌ フィード${index + 1}処理失敗:`, result.reason);
        }
      });
      
      // 重複除去
      const uniqueArticles = this.removeDuplicates(allArticles);
      
      // 日付順ソート（新しい順）
      uniqueArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
      
      // 出力ディレクトリ作成
      if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
        fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
      }
      
      // ファイル保存
      fs.writeFileSync(
        `${CONFIG.OUTPUT_DIR}/articles.json`,
        JSON.stringify(uniqueArticles, null, 2)
      );
      
      console.log(`✅ RSS処理完了: ${uniqueArticles.length}件の記事を処理`);
      
      // 統計出力
      const stats = uniqueArticles.reduce((acc, article) => {
        acc[article.category] = (acc[article.category] || 0) + 1;
        return acc;
      }, {});
      
      console.log('📊 カテゴリ別統計:', stats);
      
    } catch (error) {
      console.error('💥 RSS処理失敗:', error.message);
      process.exit(1);
    }
  }
}

// メイン実行
if (require.main === module) {
  const processor = new RSSProcessor();
  processor.processAllFeeds();
}

module.exports = { RSSProcessor };
