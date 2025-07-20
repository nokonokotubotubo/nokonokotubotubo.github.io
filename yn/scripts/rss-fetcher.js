// RSS取得エンジン（仕様書準拠・プロキシフォールバック対応）
class RSSFetcher {
    constructor() {
        // 仕様書記載のプロキシサービス設定
        this.proxyServices = [
            {
                name: 'RSS2JSON',
                endpoint: 'https://api.rss2json.com/v1/api.json',
                params: (url) => `?rss_url=${encodeURIComponent(url)}&count=50`,
                parser: (data) => data.status === 'ok' ? data.items : null,
                timeout: 10000,
                maxRetries: 2
            },
            {
                name: 'AllOrigins',
                endpoint: 'https://api.allorigins.win/get',
                params: (url) => `?url=${encodeURIComponent(url)}&format=json`,
                parser: (data) => {
                    try {
                        const xml = new DOMParser().parseFromString(data.contents, 'text/xml');
                        return this.parseRSSXML(xml);
                    } catch (e) {
                        return null;
                    }
                },
                timeout: 15000,
                maxRetries: 1
            },
            {
                name: 'CORSProxy',
                endpoint: 'https://corsproxy.io/',
                params: (url) => `?${encodeURIComponent(url)}`,
                parser: (data) => {
                    try {
                        const xml = new DOMParser().parseFromString(data, 'text/xml');
                        return this.parseRSSXML(xml);
                    } catch (e) {
                        return null;
                    }
                },
                timeout: 20000,
                maxRetries: 1
            }
        ];
        
        this.cache = new Map();
        this.rateLimitDelay = 1000; // 1秒間隔
        this.lastRequestTime = 0;
    }
    
    // 仕様書準拠：複数プロキシサービス順次試行
    async fetchRSSWithFallback(rssUrl) {
        const errors = [];
        
        // レート制限適用
        await this.enforceRateLimit();
        
        for (let i = 0; i < this.proxyServices.length; i++) {
            const service = this.proxyServices[i];
            
            for (let retry = 0; retry <= service.maxRetries; retry++) {
                try {
                    console.log(`Trying ${service.name} (attempt ${retry + 1}/${service.maxRetries + 1})`);
                    
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), service.timeout);
                    
                    const response = await fetch(
                        service.endpoint + service.params(rssUrl),
                        { 
                            signal: controller.signal,
                            headers: {
                                'User-Agent': 'YourNewsApp/1.0',
                                'Accept': 'application/json, application/xml, text/xml'
                            }
                        }
                    );
                    
                    clearTimeout(timeoutId);
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    
                    const data = await response.json();
                    const articles = service.parser(data);
                    
                    if (articles && articles.length > 0) {
                        console.log(`Success with ${service.name}: ${articles.length} articles`);
                        
                        // 記事データ正規化
                        const normalizedArticles = articles.map(article => 
                            this.normalizeArticleData(article, rssUrl)
                        );
                        
                        // キャッシュ保存
                        this.cache.set(rssUrl, {
                            articles: normalizedArticles,
                            timestamp: Date.now(),
                            service: service.name
                        });
                        
                        return {
                            success: true,
                            articles: normalizedArticles,
                            service: service.name,
                            attempt: retry + 1
                        };
                    }
                    
                    throw new Error('No articles found or parse failed');
                    
                } catch (error) {
                    const errorInfo = {
                        service: service.name,
                        attempt: retry + 1,
                        error: error.message,
                        timestamp: new Date().toISOString()
                    };
                    
                    errors.push(errorInfo);
                    console.warn(`${service.name} attempt ${retry + 1} failed:`, error.message);
                    
                    if (retry < service.maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            }
        }
        
        // すべて失敗した場合はキャッシュから取得を試行
        const cachedData = this.cache.get(rssUrl);
        if (cachedData && Date.now() - cachedData.timestamp < 24 * 60 * 60 * 1000) {
            console.log('Using cached data due to fetch failure');
            return {
                success: true,
                articles: cachedData.articles,
                service: cachedData.service + ' (cached)',
                attempt: 1
            };
        }
        
        return {
            success: false,
            articles: [],
            errors: errors,
            fallbackMessage: 'すべてのRSSサービスが利用できません。しばらく後に再試行してください。'
        };
    }
    
    // 仕様書準拠：RSSデータ正規化
    normalizeArticleData(rawArticle, sourceUrl) {
        try {
            const domain = this.extractDomain(rawArticle.link || rawArticle.url || sourceUrl);
            const publishDate = this.parseDate(rawArticle.pubDate || rawArticle.published || rawArticle.date);
            const articleId = this.generateArticleId(rawArticle, sourceUrl, publishDate);
            
            return {
                articleId: articleId,
                title: this.sanitizeText(rawArticle.title || '無題'),
                excerpt: this.sanitizeText(rawArticle.description || rawArticle.content || rawArticle.summary || ''),
                url: rawArticle.link || rawArticle.url || '',
                domain: domain,
                publishDate: publishDate,
                category: this.inferCategory(rawArticle, sourceUrl),
                readStatus: 'unread',
                favorited: false,
                interestScore: 50, // デフォルト値
                matchedKeywords: [],
                feedbackHistory: [],
                addedDate: new Date().toISOString(),
                sourceUrl: sourceUrl
            };
            
        } catch (error) {
            console.error('Article normalization error:', error, rawArticle);
            return this.createErrorArticle(rawArticle, sourceUrl, error.message);
        }
    }
    
    // RSS XML解析（AllOrigins、CORSProxy用）
    parseRSSXML(xmlDoc) {
        try {
            const articles = [];
            
            // RSS 2.0形式
            let items = xmlDoc.querySelectorAll('item');
            
            // Atom形式も対応
            if (items.length === 0) {
                items = xmlDoc.querySelectorAll('entry');
            }
            
            // RDF形式も対応
            if (items.length === 0) {
                items = xmlDoc.querySelectorAll('rdf\\:RDF item, RDF item');
            }
            
            items.forEach(item => {
                try {
                    const article = {
                        title: this.getXMLText(item, 'title'),
                        description: this.getXMLText(item, 'description') || 
                                   this.getXMLText(item, 'content') ||
                                   this.getXMLText(item, 'summary'),
                        link: this.getXMLText(item, 'link') || 
                              this.getXMLText(item, 'guid'),
                        pubDate: this.getXMLText(item, 'pubDate') || 
                                this.getXMLText(item, 'published') ||
                                this.getXMLText(item, 'dc:date')
                    };
                    
                    if (article.title && article.link) {
                        articles.push(article);
                    }
                    
                } catch (error) {
                    console.warn('XML item parse error:', error);
                }
            });
            
            return articles;
            
        } catch (error) {
            console.error('RSS XML parse error:', error);
            return null;
        }
    }
    
    getXMLText(element, tagName) {
        try {
            const node = element.querySelector(tagName);
            return node ? node.textContent.trim() : '';
        } catch (error) {
            return '';
        }
    }
    
    // 複数RSS一括取得
    async fetchAllRSSFeeds(rssFeeds) {
        try {
            console.log(`Fetching ${rssFeeds.length} RSS feeds...`);
            
            const allArticles = [];
            const results = [];
            
            // 並列処理ではなく順次処理（レート制限対応）
            for (const feed of rssFeeds) {
                if (!feed.enabled) continue;
                
                try {
                    const result = await this.fetchRSSWithFallback(feed.url);
                    results.push({
                        feedName: feed.name,
                        feedUrl: feed.url,
                        success: result.success,
                        articleCount: result.articles.length,
                        service: result.service || 'unknown'
                    });
                    
                    if (result.success) {
                        // フィード固有のカテゴリを適用
                        result.articles.forEach(article => {
                            if (feed.category) {
                                article.category = feed.category;
                            }
                        });
                        
                        allArticles.push(...result.articles);
                    }
                    
                } catch (error) {
                    console.error(`Feed fetch error (${feed.name}):`, error);
                    results.push({
                        feedName: feed.name,
                        feedUrl: feed.url,
                        success: false,
                        error: error.message
                    });
                }
            }
            
            // 重複記事の除去
            const uniqueArticles = this.removeDuplicateArticles(allArticles);
            
            // 取得結果サマリー
            const successCount = results.filter(r => r.success).length;
            const totalArticles = uniqueArticles.length;
            
            console.log(`RSS fetch completed: ${successCount}/${rssFeeds.length} feeds, ${totalArticles} unique articles`);
            
            return uniqueArticles;
            
        } catch (error) {
            console.error('Bulk RSS fetch error:', error);
            return [];
        }
    }
    
    // 重複記事除去
    removeDuplicateArticles(articles) {
        const seen = new Set();
        const unique = [];
        
        articles.forEach(article => {
            // URL, タイトル, 公開日でユニーク判定
            const key = `${article.url}_${article.title}_${article.publishDate}`;
            
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(article);
            }
        });
        
        return unique;
    }
    
    // ユーティリティ関数
    async enforceRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.rateLimitDelay) {
            const waitTime = this.rateLimitDelay - timeSinceLastRequest;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        this.lastRequestTime = Date.now();
    }
    
    generateArticleId(article, sourceUrl, publishDate) {
        try {
            const domain = this.extractDomain(sourceUrl);
            const timestamp = new Date(publishDate).getTime();
            const titleHash = this.simpleHash(article.title || 'untitled');
            
            return `${domain}_${titleHash}_${timestamp}`;
            
        } catch (error) {
            return `article_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
    }
    
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 32bit integer
        }
        return Math.abs(hash);
    }
    
    extractDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace('www.', '');
        } catch (error) {
            return 'unknown-domain';
        }
    }
    
    parseDate(dateString) {
        try {
            if (!dateString) return new Date().toISOString();
            
            const date = new Date(dateString);
            return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
            
        } catch (error) {
            return new Date().toISOString();
        }
    }
    
    sanitizeText(text) {
        if (!text) return '';
        
        // HTMLタグ除去
        const withoutTags = text.replace(/<[^>]*>/g, '');
        
        // HTMLエンティティデコード
        const textarea = document.createElement('textarea');
        textarea.innerHTML = withoutTags;
        const decoded = textarea.value;
        
        // 改行・空白正規化
        return decoded.replace(/\s+/g, ' ').trim().substring(0, 500);
    }
    
    inferCategory(article, sourceUrl) {
        try {
            const domain = this.extractDomain(sourceUrl);
            const title = (article.title || '').toLowerCase();
            const description = (article.description || '').toLowerCase();
            const content = title + ' ' + description;
            
            // ドメインベースのカテゴリ推定
            const domainCategories = {
                'nhk.or.jp': 'ニュース',
                'nikkei.com': '経済',
                'itmedia.co.jp': 'テクノロジー',
                'techcrunch.com': 'テクノロジー',
                'gigazine.net': 'テクノロジー',
                'reuters.com': 'ニュース',
                'bbc.com': 'ニュース',
                'cnn.com': 'ニュース'
            };
            
            for (const [domainPattern, category] of Object.entries(domainCategories)) {
                if (domain.includes(domainPattern)) {
                    return category;
                }
            }
            
            // キーワードベースのカテゴリ推定
            const keywordCategories = {
                'テクノロジー': ['ai', 'iot', '技術', 'アプリ', 'システム', 'プログラミング'],
                '経済': ['経済', '株価', '投資', '企業', '業績', '売上'],
                'スポーツ': ['野球', 'サッカー', '選手', '試合', 'オリンピック'],
                'エンタメ': ['映画', '音楽', 'アニメ', '芸能', 'ゲーム'],
                '政治': ['政治', '政府', '選挙', '国会', '法案'],
                '科学': ['研究', '実験', '発見', '論文', '学会']
            };
            
            for (const [category, keywords] of Object.entries(keywordCategories)) {
                if (keywords.some(keyword => content.includes(keyword))) {
                    return category;
                }
            }
            
            return 'その他';
            
        } catch (error) {
            console.warn('Category inference error:', error);
            return 'その他';
        }
    }
    
    createErrorArticle(rawArticle, sourceUrl, errorMessage) {
        return {
            articleId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: '記事解析エラー',
            excerpt: `記事データの解析中にエラーが発生しました: ${errorMessage}`,
            url: rawArticle.link || rawArticle.url || sourceUrl,
            domain: this.extractDomain(sourceUrl),
            publishDate: new Date().toISOString(),
            category: 'エラー',
            readStatus: 'read', // エラー記事は既読扱い
            favorited: false,
            interestScore: 0,
            matchedKeywords: [],
            feedbackHistory: [],
            addedDate: new Date().toISOString(),
            sourceUrl: sourceUrl,
            isError: true
        };
    }
    
    // RSS取得テスト機能
    async testRSSFeed(url) {
        try {
            console.log(`Testing RSS feed: ${url}`);
            
            const result = await this.fetchRSSWithFallback(url);
            
            return {
                success: result.success,
                url: url,
                articleCount: result.articles.length,
                service: result.service,
                sampleArticle: result.articles[0] || null,
                errors: result.errors || [],
                message: result.success ? 
                    `取得成功: ${result.articles.length}件の記事が見つかりました` :
                    `取得失敗: ${result.fallbackMessage}`
            };
            
        } catch (error) {
            console.error('RSS test error:', error);
            return {
                success: false,
                url: url,
                articleCount: 0,
                service: 'none',
                sampleArticle: null,
                errors: [{ error: error.message }],
                message: `テストエラー: ${error.message}`
            };
        }
    }
    
    // キャッシュ管理
    clearCache() {
        this.cache.clear();
        console.log('RSS cache cleared');
    }
    
    getCacheStats() {
        const stats = {
            cacheSize: this.cache.size,
            cacheEntries: []
        };
        
        this.cache.forEach((value, key) => {
            stats.cacheEntries.push({
                url: key,
                articleCount: value.articles.length,
                timestamp: value.timestamp,
                age: Date.now() - value.timestamp,
                service: value.service
            });
        });
        
        return stats;
    }
}
