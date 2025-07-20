// RSS取得エンジン（プロキシサービス強化・完全版）
class RSSFetcher {
    constructor() {
        // プロキシサービス設定（信頼性順に並び替え）
        this.proxyServices = [
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
                maxRetries: 2,
                priority: 1
            },
            {
                name: 'ThingProxy',
                endpoint: 'https://thingproxy.freeboard.io/fetch/',
                params: (url) => encodeURIComponent(url),
                parser: (data) => {
                    try {
                        if (typeof data === 'string') {
                            const xml = new DOMParser().parseFromString(data, 'text/xml');
                            return this.parseRSSXML(xml);
                        }
                        return null;
                    } catch (e) {
                        return null;
                    }
                },
                timeout: 12000,
                maxRetries: 2,
                priority: 2
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
                timeout: 18000,
                maxRetries: 1,
                priority: 3
            },
            {
                name: 'Bridged',
                endpoint: 'https://bridged.cc/',
                params: (url) => encodeURIComponent(url),
                parser: (data) => {
                    try {
                        if (typeof data === 'string') {
                            const xml = new DOMParser().parseFromString(data, 'text/xml');
                            return this.parseRSSXML(xml);
                        }
                        return null;
                    } catch (e) {
                        return null;
                    }
                },
                timeout: 10000,
                maxRetries: 1,
                priority: 4
            },
            {
                name: 'YQL-Alternative',
                endpoint: 'https://query.yahooapis.com/v1/public/yql',
                params: (url) => `?q=select%20*%20from%20rss%20where%20url%3D%22${encodeURIComponent(url)}%22&format=json`,
                parser: (data) => {
                    try {
                        if (data.query && data.query.results && data.query.results.item) {
                            const items = Array.isArray(data.query.results.item) 
                                ? data.query.results.item 
                                : [data.query.results.item];
                            return items.map(item => ({
                                title: item.title || '',
                                description: item.description || '',
                                link: item.link || '',
                                pubDate: item.pubDate || item.published || ''
                            }));
                        }
                        return null;
                    } catch (e) {
                        return null;
                    }
                },
                timeout: 8000,
                maxRetries: 1,
                priority: 5
            },
            {
                name: 'RSS2JSON',
                endpoint: 'https://api.rss2json.com/v1/api.json',
                params: (url) => `?rss_url=${encodeURIComponent(url)}&count=50`,
                parser: (data) => data.status === 'ok' ? data.items : null,
                timeout: 8000,
                maxRetries: 1,
                priority: 6
            }
        ];
        
        this.cache = new Map();
        this.rateLimitDelay = 800;
        this.lastRequestTime = 0;
        
        // サービス成功率トラッキング
        this.serviceStats = new Map();
        this.initializeServiceStats();
    }
    
    initializeServiceStats() {
        this.proxyServices.forEach(service => {
            this.serviceStats.set(service.name, {
                attempts: 0,
                successes: 0,
                failures: 0,
                lastSuccess: null,
                avgResponseTime: 0
            });
        });
    }
    
    // 動的優先度調整
    getDynamicServiceOrder() {
        const servicesWithStats = this.proxyServices.map(service => {
            const stats = this.serviceStats.get(service.name);
            const successRate = stats.attempts > 0 ? stats.successes / stats.attempts : 0;
            const recentSuccess = stats.lastSuccess ? (Date.now() - new Date(stats.lastSuccess).getTime()) : Infinity;
            
            const score = (successRate * 100) + 
                         (stats.avgResponseTime > 0 ? (10000 / stats.avgResponseTime) : 0) +
                         (recentSuccess < 3600000 ? 10 : 0);
            
            return {
                ...service,
                dynamicScore: score,
                stats: stats
            };
        });
        
        return servicesWithStats.sort((a, b) => b.dynamicScore - a.dynamicScore);
    }
    
    // RSS取得メイン関数
    async fetchRSSWithFallback(rssUrl) {
        const errors = [];
        const startTime = Date.now();
        
        await this.enforceRateLimit();
        
        const orderedServices = this.getDynamicServiceOrder();
        
        console.log('RSS取得開始 - サービス優先順位:', 
            orderedServices.map(s => `${s.name}(${s.dynamicScore.toFixed(1)})`));
        
        for (let i = 0; i < orderedServices.length; i++) {
            const service = orderedServices[i];
            const serviceStats = this.serviceStats.get(service.name);
            
            for (let retry = 0; retry <= service.maxRetries; retry++) {
                const attemptStartTime = Date.now();
                serviceStats.attempts++;
                
                try {
                    console.log(`Trying ${service.name} (attempt ${retry + 1}/${service.maxRetries + 1})`);
                    
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), service.timeout);
                    
                    const fetchUrl = service.name === 'ThingProxy' || service.name === 'Bridged' 
                        ? service.endpoint + service.params(rssUrl)
                        : service.endpoint + service.params(rssUrl);
                    
                    const response = await fetch(fetchUrl, { 
                        signal: controller.signal,
                        headers: {
                            'User-Agent': 'YourNewsApp/1.0',
                            'Accept': 'application/json, application/xml, text/xml, text/plain',
                            'Cache-Control': 'no-cache'
                        }
                    });
                    
                    clearTimeout(timeoutId);
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    
                    const responseTime = Date.now() - attemptStartTime;
                    let data;
                    
                    const contentType = response.headers.get('content-type') || '';
                    if (contentType.includes('application/json')) {
                        data = await response.json();
                    } else {
                        data = await response.text();
                    }
                    
                    const articles = service.parser(data);
                    
                    if (articles && articles.length > 0) {
                        // 成功統計更新
                        serviceStats.successes++;
                        serviceStats.lastSuccess = new Date().toISOString();
                        serviceStats.avgResponseTime = 
                            (serviceStats.avgResponseTime + responseTime) / 2;
                        
                        console.log(`Success with ${service.name}: ${articles.length} articles (${responseTime}ms)`);
                        
                        const normalizedArticles = articles.map(article => 
                            this.normalizeArticleData(article, rssUrl)
                        );
                        
                        this.cache.set(rssUrl, {
                            articles: normalizedArticles,
                            timestamp: Date.now(),
                            service: service.name,
                            responseTime: responseTime
                        });
                        
                        return {
                            success: true,
                            articles: normalizedArticles,
                            service: service.name,
                            attempt: retry + 1,
                            responseTime: responseTime,
                            totalTime: Date.now() - startTime
                        };
                    }
                    
                    throw new Error('No articles found or parse failed');
                    
                } catch (error) {
                    serviceStats.failures++;
                    
                    const errorInfo = {
                        service: service.name,
                        attempt: retry + 1,
                        error: error.message,
                        responseTime: Date.now() - attemptStartTime,
                        timestamp: new Date().toISOString()
                    };
                    
                    errors.push(errorInfo);
                    console.warn(`${service.name} attempt ${retry + 1} failed (${errorInfo.responseTime}ms):`, error.message);
                    
                    if (retry < service.maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            }
        }
        
        // キャッシュフォールバック
        const cachedData = this.cache.get(rssUrl);
        if (cachedData && Date.now() - cachedData.timestamp < 24 * 60 * 60 * 1000) {
            console.log('Using cached data due to fetch failure');
            return {
                success: true,
                articles: cachedData.articles,
                service: cachedData.service + ' (cached)',
                attempt: 1,
                fromCache: true,
                totalTime: Date.now() - startTime
            };
        }
        
        return {
            success: false,
            articles: [],
            errors: errors,
            totalTime: Date.now() - startTime,
            fallbackMessage: 'すべてのRSSサービスが利用できません。しばらく後に再試行してください。',
            serviceStats: this.getServiceStatsReport()
        };
    }
    
    // RSS XML解析（改善版）
    parseRSSXML(xmlDoc) {
        try {
            const articles = [];
            
            // RSS 2.0形式
            let items = xmlDoc.querySelectorAll('item');
            
            // Atom形式
            if (items.length === 0) {
                items = xmlDoc.querySelectorAll('entry');
            }
            
            // RDF形式
            if (items.length === 0) {
                items = xmlDoc.querySelectorAll('rdf\\:RDF item, RDF item');
            }
            
            // JSONフィード検出
            if (items.length === 0) {
                try {
                    const jsonFeed = JSON.parse(xmlDoc.textContent || xmlDoc.innerHTML);
                    if (jsonFeed.items) {
                        return jsonFeed.items.map(item => ({
                            title: item.title,
                            description: item.content_text || item.content_html || item.summary,
                            link: item.url,
                            pubDate: item.date_published || item.date_modified
                        }));
                    }
                } catch (e) {
                    // JSONフィードではない
                }
            }
            
            items.forEach(item => {
                try {
                    const article = {
                        title: this.getXMLText(item, 'title'),
                        description: this.getXMLText(item, 'description') || 
                                   this.getXMLText(item, 'content') ||
                                   this.getXMLText(item, 'summary') ||
                                   this.getXMLText(item, 'content:encoded'),
                        link: this.getXMLText(item, 'link') || 
                              this.getXMLText(item, 'guid') ||
                              item.getAttribute('rdf:about'),
                        pubDate: this.getXMLText(item, 'pubDate') || 
                                this.getXMLText(item, 'published') ||
                                this.getXMLText(item, 'dc:date') ||
                                this.getXMLText(item, 'updated')
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
    
    // XML要素テキスト取得
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
            
            for (const feed of rssFeeds) {
                if (!feed.enabled) continue;
                
                try {
                    const result = await this.fetchRSSWithFallback(feed.url);
                    results.push({
                        feedName: feed.name,
                        feedUrl: feed.url,
                        success: result.success,
                        articleCount: result.articles.length,
                        service: result.service || 'unknown',
                        responseTime: result.responseTime || 0
                    });
                    
                    if (result.success) {
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
            
            const uniqueArticles = this.removeDuplicateArticles(allArticles);
            
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
            const key = `${article.url}_${article.title}_${article.publishDate}`;
            
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(article);
            }
        });
        
        return unique;
    }
    
    // 記事データ正規化
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
                interestScore: 50,
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
    
    // RSS取得テスト
    async testRSSFeed(url) {
        try {
            console.log(`Testing RSS feed: ${url}`);
            
            const result = await this.fetchRSSWithFallback(url);
            
            return {
                success: result.success,
                url: url,
                articleCount: result.articles.length,
                service: result.service,
                responseTime: result.responseTime,
                totalTime: result.totalTime,
                sampleArticle: result.articles[0] || null,
                errors: result.errors || [],
                serviceStats: result.serviceStats,
                fromCache: result.fromCache || false,
                message: result.success ? 
                    `取得成功: ${result.articles.length}件の記事が見つかりました (${result.service}, ${result.totalTime}ms)` :
                    `取得失敗: ${result.fallbackMessage}`
            };
            
        } catch (error) {
            console.error('RSS test error:', error);
            return {
                success: false,
                url: url,
                articleCount: 0,
                service: 'none',
                responseTime: 0,
                totalTime: 0,
                sampleArticle: null,
                errors: [{ error: error.message }],
                serviceStats: this.getServiceStatsReport(),
                message: `テストエラー: ${error.message}`
            };
        }
    }
    
    // ユーティリティ関数群
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
            hash = hash & hash;
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
        
        const withoutTags = text.replace(/<[^>]*>/g, '');
        
        const textarea = document.createElement('textarea');
        textarea.innerHTML = withoutTags;
        const decoded = textarea.value;
        
        return decoded.replace(/\s+/g, ' ').trim().substring(0, 500);
    }
    
    inferCategory(article, sourceUrl) {
        try {
            const domain = this.extractDomain(sourceUrl);
            const title = (article.title || '').toLowerCase();
            const description = (article.description || '').toLowerCase();
            const content = title + ' ' + description;
            
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
            readStatus: 'read',
            favorited: false,
            interestScore: 0,
            matchedKeywords: [],
            feedbackHistory: [],
            addedDate: new Date().toISOString(),
            sourceUrl: sourceUrl,
            isError: true
        };
    }
    
    // サービス統計レポート
    getServiceStatsReport() {
        const report = {};
        this.serviceStats.forEach((stats, serviceName) => {
            report[serviceName] = {
                successRate: stats.attempts > 0 ? 
                    Math.round((stats.successes / stats.attempts) * 100) : 0,
                attempts: stats.attempts,
                successes: stats.successes,
                avgResponseTime: Math.round(stats.avgResponseTime),
                lastSuccess: stats.lastSuccess
            };
        });
        return report;
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
