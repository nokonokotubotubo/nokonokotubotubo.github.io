const fs = require('fs');
const Parser = require('rss-parser');
const crypto = require('crypto');

const CONFIG = {
  MAX_ARTICLES_PER_FEED: 15,
  MAX_DESCRIPTION_LENGTH: 500,
  RETRY_COUNT: 3,
  TIMEOUT: 15000
};

class RSSProcessor {
  constructor() {
    this.parser = new Parser({
      timeout: CONFIG.TIMEOUT,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AI-RSS-Dashboard/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml'
      }
    });
  }

  async processAllFeeds() {
    try {
      console.log('🚀 RSS処理開始...');
      
      const feedsConfig = JSON.parse(
        fs.readFileSync('config/ai-rss-feeds.json', 'utf8')
      );
      
      const allArticles = [];
      const feedPromises = feedsConfig.feeds.map(feed => 
        this.processFeedWithRetry(feed)
      );
      
      const results = await Promise.allSettled(feedPromises);
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.length > 0) {
          allArticles.push(...result.value);
          console.log(`✅ ${feedsConfig.feeds[index].name}: ${result.value.length}件取得`);
        } else {
          console.log(`❌ ${feedsConfig.feeds[index].name}: 取得失敗`);
        }
      });
      
      if (allArticles.length === 0) {
        throw new Error('すべてのフィード取得に失敗しました');
      }
      
      const uniqueArticles = this.removeDuplicates(allArticles);
      uniqueArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
      
      if (!fs.existsSync('ai-rss-temp/data')) {
        fs.mkdirSync('ai-rss-temp/data', { recursive: true });
      }
      
      fs.writeFileSync(
        'ai-rss-temp/data/articles.json',
        JSON.stringify(uniqueArticles, null, 2)
      );
      
      console.log(`✅ RSS処理完了: ${uniqueArticles.length}件の記事を処理`);
      
    } catch (error) {
      console.error('💥 RSS処理失敗:', error.message);
      process.exit(1);
    }
  }

  async processFeedWithRetry(feed) {
    for (let attempt = 1; attempt <= CONFIG.RETRY_COUNT; attempt++) {
      try {
        console.log(`📡 処理中: ${feed.name} (試行 ${attempt}/${CONFIG.RETRY_COUNT})`);
        
        const feedData = await this.parser.parseURL(feed.url);
        
        if (!feedData.items || feedData.items.length === 0) {
          throw new Error('記事が見つかりません');
        }
        
        return this.processItems(feedData.items, feed);
        
      } catch (error) {
        console.log(`⚠️ ${feed.name} 試行${attempt}失敗: ${error.message}`);
        
        if (attempt === CONFIG.RETRY_COUNT) {
          console.log(`❌ ${feed.name} 最終的に失敗`);
          return [];
        }
        
        await this.sleep(1000 * attempt);
      }
    }
    return [];
  }

  processItems(items, feed) {
    return items
      .slice(0, CONFIG.MAX_ARTICLES_PER_FEED)
      .map(item => ({
        id: crypto.createHash('md5').update(item.link || item.guid || '').digest('hex'),
        title: this.cleanText(item.title || ''),
        link: item.link || '',
        pubDate: item.pubDate || new Date().toISOString(),
        description: this.cleanText(item.contentSnippet || item.content || item.summary || ''),
        category: feed.category,
        feedName: feed.name,
        timestamp: new Date().toISOString(),
        preference: null
      }))
      .filter(article => article.title && article.link);
  }

  cleanText(text) {
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .trim()
      .substring(0, CONFIG.MAX_DESCRIPTION_LENGTH);
  }

  removeDuplicates(articles) {
    const seen = new Set();
    return articles.filter(article => {
      const key = article.id || article.link;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

if (require.main === module) {
  const processor = new RSSProcessor();
  processor.processAllFeeds();
}

module.exports = { RSSProcessor };
