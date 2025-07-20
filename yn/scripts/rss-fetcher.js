// RSS取得エンジン（CORS対応・ヘッダー簡素化版）
class RSSFetcher {
    constructor() {
        // より信頼性の高いプロキシサービス（ヘッダー制約に配慮）
        this.proxyServices = [
            {
                name: 'RSS2JSON-API',
                endpoint: 'https://api.rss2json.com/v1/api.json',
                params: (url) => `?rss_url=${encodeURIComponent(url)}&api_key=tLOxpn3qgcmsh4dRp7LGZ2l7xgpHp1p&count=20`,
                parser: (data) => {
                    if (data && data.status === 'ok' && data.items) {
                        return data.items;
                    }
                    return null;
                },
                timeout: 10000,
                maxRetries: 2,
                priority: 1,
                headers: {
                    'Accept': 'application/json'
                }
            },
            {
                name: 'AllOrigins-Simple',
                endpoint: 'https://api.allorigins.win/get',
                params: (url) => `?url=${encodeURIComponent(url)}`,
                parser: (data) => {
                    try {
                        if (data && data.contents) {
                            const xml = new DOMParser().parseFromString(data.contents, 'text/xml');
                            return this.parseRSSXML(xml);
                        }
                        return null;
                    } catch (e) {
                        console.warn('AllOrigins parse error:', e);
                        return null;
                    }
                },
                timeout: 12000,
                maxRetries: 1,
                priority: 2,
                headers: {
                    'Accept': 'application/json'
                }
            },
            {
                name: 'CORSAnywhere',
                endpoint: 'https://cors-anywhere.herokuapp.com/',
                params: (url) => encodeURIComponent(url),
                parser: (data) => {
                    try {
                        const xml = new DOMParser().parseFromString(data, 'text/xml');
                        return this.parseRSSXML(xml);
                    } catch (e) {
                        return null;
                    }
                },
                timeout: 15000,
                maxRetries: 1,
                priority: 3,
                headers: {
                    'Accept': 'text/xml, application/xml'
                }
            },
            {
                name: 'ProxyWebsite',
                endpoint: 'https://api.codetabs.com/v1/proxy',
                params: (url) => `?quest=${encodeURIComponent(url)}`,
                parser: (data) => {
                    try {
                        const xml = new DOMParser().parseFromString(data, 'text/xml');
                        return this.parseRSSXML(xml);
                    } catch (e) {
                        return null;
                    }
                },
                timeout: 8000,
                maxRetries: 1,
                priority: 4,
                headers: {
                    'Accept': 'text/xml'
                }
            },
            {
                name: 'JSONP-Fallback',
                endpoint: 'https://query.yahooapis.com/v1/public/yql',
                params: (url) => `?q=select%20*%20from%20xml%20where%20url%3D%22${encodeURIComponent(url)}%22&format=json&callback=`,
                parser: (data) => {
                    try {
                        if (data && data.query && data.query.results) {
                            // YQL XML結果をRSS形式に変換
                            return this.parseYQLResults(data.query.results);
                        }
                        return null;
                    } catch (e) {
                        return null;
                    }
                },
                timeout: 6000,
                maxRetries: 1,
                priority: 5,
                headers: {
                    'Accept': 'application/json'
                }
            }
        ];
        
        this.cache = new Map();
        this.rateLimitDelay = 1200; // CORS制約に配慮してレート制限強化
        this.lastRequestTime = 0;
        
        // サービス成功率トラッキング
        this.serviceStats = new Map();
        this.initializeServiceStats();
    }
    
    // サービス統計初期化
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
    
    // RSS取得メイン関数（CORS対応版）
    async fetchRSSWithFallback(rssUrl) {
        const errors = [];
        const startTime = Date.now();
        
        await this.enforceRateLimit();
        
        // 固定優先順序（CORS制約回避のため）
        const orderedServices = [...this.proxyServices].sort((a, b) => a.priority - b.priority);
        
        console.log('RSS取得開始 (CORS対応版):', rssUrl);
        
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
                    
                    const fetchUrl = service.endpoint + service.params(rssUrl);
                    
                    // 【修正】最小限のヘッダー設定
                    const response = await fetch(fetchUrl, { 
                        signal: controller.signal,
                        method: 'GET',
                        headers: service.headers,
                        mode: 'cors',
                        credentials: 'omit'
                    });
                    
                    clearTimeout(timeoutId);
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    
                    const responseTime = Date.now() - attemptStartTime;
                    let data;
                    
                    // レスポンス形式判定
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
                        
                        console.log(`✅ Success with ${service.name}: ${articles.length} articles (${responseTime}ms)`);
                        
                        const normalizedArticles = articles.map(article => 
                            this.normalizeArticleData(article, rssUrl)
                        );
                        
                        // キャッシュ保存
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
                    console.warn(`❌ ${service.name} attempt ${retry + 1} failed (${errorInfo.responseTime}ms):`, error.message);
                    
                    if (retry < service.maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, 1500));
                    }
                }
            }
        }
        
        // キャッシュフォールバック
        const cachedData = this.cache.get(rssUrl);
        if (cachedData && Date.now() - cachedData.timestamp < 24 * 60 * 60 * 1000) {
            console.log('📦 Using cached data due to fetch failure');
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
            fallbackMessage: `全てのRSSサービスが利用できません (${errors.length}個のエラー)。キャッシュデータも見つかりませんでした。`,
            serviceStats: this.getServiceStatsReport()
        };
    }
    
    // YQL結果パーサー
    parseYQLResults(results) {
        try {
            const articles = [];
            
            if (results.rss && results.rss.channel && results.rss.channel.item) {
                const items = Array.isArray(results.rss.channel.item) 
                    ? results.rss.channel.item 
                    : [results.rss.channel.item];
                
                items.forEach(item => {
                    if (item.title && item.link) {
                        articles.push({
                            title: item.title,
                            description: item.description || '',
                            link: item.link,
                            pubDate: item.pubDate || ''
                        });
                    }
                });
            }
            
            return articles;
        } catch (error) {
            console.error('YQL parse error:', error);
            return null;
        }
    }
    
    // RSS XML解析（改善版）
    parseRSSXML(xmlDoc) {
        try {
            const articles = [];
            
            // エラーチェック
            if (!xmlDoc || xmlDoc.querySelector('parsererror')) {
                console.warn('XML parse error detected');
                return null;
            }
            
            // RSS 2.0形式
            let items = xmlDoc.querySelectorAll('item');
            
            // Atom形式
            if (items.length === 0) {
                items = xmlDoc.querySelectorAll('entry');
            }
            
            // RDF形式
            if (items.length === 0) {
                items = xmlDoc.querySelectorAll('rdf\\:item, item');
            }
            
            console.log(`Found ${items.length} items in RSS feed`);
            
            items.forEach((item, index) => {
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
                    } else {
                        console.warn(`Item ${index} missing required fields:`, article);
                    }
                    
                } catch (error) {
                    console.warn(`XML item ${index} parse error:`, error);
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
    
    // 複数RSS一括取得（エラー耐性強化版）
    async fetchAllRSSFeeds(rssFeeds) {
        try {
            console.log(`🔄 Fetching ${rssFeeds.length} RSS feeds...`);
            
            const allArticles = [];
            const results = [];
            
            // 順次処理（CORS制約対応のため並列処理回避）
            for (const feed of rssFeeds) {
                if (!feed.enabled) {
                    console.log(`⏭️ Skipping disabled feed: ${feed.name}`);
                    continue;
                }
                
                try {
                    console.log(`📡 Fetching: ${feed.name} (${feed.url})`);
                    
                    const result = await this.fetchRSSWithFallback(feed.url);
                    
                    results.push({
                        feedName: feed.name,
                        feedUrl: feed.url,
                        success: result.success,
                        articleCount: result.articles.length,
                        service: result.service || 'unknown',
                        responseTime: result.responseTime || 0,
                        fromCache: result.fromCache || false
                    });
                    
                    if (result.success) {
                        // フィード固有カテゴリ適用
                        result.articles.forEach(article => {
                            if (feed.category) {
                                article.category = feed.category;
                            }
                            article.feedName = feed.name; // フィード名を記録
                        });
                        
                        allArticles.push(...result.articles);
                        console.log(`✅ ${feed.name}: ${result.articles.length} articles`);
                    } else {
                        console.warn(`❌ ${feed.name}: Failed`);
                    }
                    
                } catch (error) {
                    console.error(`💥 Feed fetch error (${feed.name}):`, error);
                    results.push({
                        feedName: feed.name,
                        feedUrl: feed.url,
                        success: false,
                        error: error.message,
                        articleCount: 0
                    });
                }
                
                // レート制限（CORS制約対応）
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // 重複記事除去
            const uniqueArticles = this.removeDuplicateArticles(allArticles);
            
            // 結果サマリー
            const successCount = results.filter(r => r.success).length;
            const totalArticles = uniqueArticles.length;
            const cacheCount = results.filter(r => r.fromCache).length;
            
            console.log(`📊 RSS fetch completed: ${successCount}/${rssFeeds.length} feeds, ${totalArticles} unique articles (${cacheCount} from cache)`);
            
            // 詳細結果表示
            results.forEach(result => {
                const status = result.success ? '✅' : '❌';
                const cache = result.fromCache ? ' (cached)' : '';
                console.log(`${status} ${result.feedName}: ${result.articleCount} articles${cache}`);
            });
            
            return uniqueArticles;
            
        } catch (error) {
            console.error('💥 Bulk RSS fetch error:', error);
            return [];
        }
    }
    
    // 重複記事除去
    removeDuplicateArticles(articles) {
        const seen = new Set();
        const unique = [];
        
        articles.forEach(article => {
            const key = `${article.url}_${article.title}`;
            
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(article);
            }
        });
        
        console.log(`🔄 Removed ${articles.length - unique.length} duplicate articles`);
        return unique;
    }
    
    // その他のメソッドは前回版と同様...
    
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
    
    // ユーティリティ関数（変更なし）
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
    
    // RSS取得テスト（簡素化版）
    async testRSSFeed(url) {
        try {
            console.log(`🧪 Testing RSS feed: ${url}`);
            
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
                    `✅ 取得成功: ${result.articles.length}件の記事 (${result.service}, ${result.totalTime}ms)` :
                    `❌ 取得失敗: ${result.fallbackMessage}`
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
                message: `💥 テストエラー: ${error.message}`
            };
        }
    }
    
    // キャッシュ管理
    clearCache() {
        this.cache.clear();
        console.log('📦 RSS cache cleared');
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
