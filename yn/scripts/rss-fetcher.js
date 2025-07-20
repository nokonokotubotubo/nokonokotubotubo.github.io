// RSS取得エンジン（完全修正版 - 全ての問題対応済み）
class RSSFetcher {
    constructor() {
        // 【修正】AllOriginsを最優先に、成功実績のあるサービス順に配置
        this.proxyServices = [
            {
                name: 'AllOrigins-Primary',
                endpoint: 'https://api.allorigins.win/get',
                params: (url) => `?url=${encodeURIComponent(url)}`,
                parser: (data) => {
                    try {
                        if (data && data.contents) {
                            const xml = new DOMParser().parseFromString(data.contents, 'text/xml');
                            const result = this.parseRSSXML(xml);
                            if (result && result.length > 0) {
                                console.log(`📰 AllOrigins-Primary: ${result.length} items parsed successfully`);
                                return result;
                            }
                        }
                        return null;
                    } catch (e) {
                        console.warn('AllOrigins-Primary parse error:', e);
                        return null;
                    }
                },
                timeout: 12000,
                maxRetries: 2,
                priority: 1,
                headers: {
                    'Accept': 'application/json'
                }
            },
            {
                name: 'AllOrigins-Raw',
                endpoint: 'https://api.allorigins.win/raw',
                params: (url) => `?url=${encodeURIComponent(url)}`,
                parser: (data) => {
                    try {
                        if (typeof data === 'string' && data.length > 0) {
                            const xml = new DOMParser().parseFromString(data, 'text/xml');
                            const result = this.parseRSSXML(xml);
                            if (result && result.length > 0) {
                                console.log(`📰 AllOrigins-Raw: ${result.length} items parsed successfully`);
                                return result;
                            }
                        }
                        return null;
                    } catch (e) {
                        console.warn('AllOrigins-Raw parse error:', e);
                        return null;
                    }
                },
                timeout: 10000,
                maxRetries: 1,
                priority: 2,
                headers: {
                    'Accept': 'text/xml, application/xml, text/plain'
                }
            },
            {
                name: 'CodeTabs-Proxy',
                endpoint: 'https://api.codetabs.com/v1/proxy',
                params: (url) => `?quest=${encodeURIComponent(url)}`,
                parser: (data) => {
                    try {
                        if (typeof data === 'string' && data.length > 0) {
                            const xml = new DOMParser().parseFromString(data, 'text/xml');
                            const result = this.parseRSSXML(xml);
                            if (result && result.length > 0) {
                                console.log(`📰 CodeTabs-Proxy: ${result.length} items parsed successfully`);
                                return result;
                            }
                        }
                        return null;
                    } catch (e) {
                        console.warn('CodeTabs-Proxy parse error:', e);
                        return null;
                    }
                },
                timeout: 8000,
                maxRetries: 1,
                priority: 3,
                headers: {
                    'Accept': 'text/xml, application/xml'
                }
            },
            {
                name: 'RSS2JSON-Free',
                endpoint: 'https://api.rss2json.com/v1/api.json',
                params: (url) => `?rss_url=${encodeURIComponent(url)}&count=20`,
                parser: (data) => {
                    try {
                        if (data && data.status === 'ok' && data.items && data.items.length > 0) {
                            console.log(`📰 RSS2JSON-Free: ${data.items.length} items received`);
                            return data.items;
                        }
                        return null;
                    } catch (e) {
                        console.warn('RSS2JSON-Free parse error:', e);
                        return null;
                    }
                },
                timeout: 6000,
                maxRetries: 1,
                priority: 4,
                headers: {
                    'Accept': 'application/json'
                }
            },
            {
                name: 'JSONP-YQL',
                endpoint: 'https://query.yahooapis.com/v1/public/yql',
                params: (url) => `?q=select%20*%20from%20xml%20where%20url%3D%22${encodeURIComponent(url)}%22&format=json`,
                parser: (data) => {
                    try {
                        if (data && data.query && data.query.results) {
                            const result = this.parseYQLResults(data.query.results);
                            if (result && result.length > 0) {
                                console.log(`📰 JSONP-YQL: ${result.length} items parsed successfully`);
                                return result;
                            }
                        }
                        return null;
                    } catch (e) {
                        console.warn('JSONP-YQL parse error:', e);
                        return null;
                    }
                },
                timeout: 5000,
                maxRetries: 1,
                priority: 5,
                headers: {
                    'Accept': 'application/json'
                }
            }
        ];
        
        this.cache = new Map();
        this.rateLimitDelay = 1500; // 【修正】レート制限強化
        this.lastRequestTime = 0;
        
        // サービス成功率トラッキング
        this.serviceStats = new Map();
        this.initializeServiceStats();
        
        // 【新機能】実行時ログ詳細化
        this.debugMode = true;
    }
    
    initializeServiceStats() {
        this.proxyServices.forEach(service => {
            this.serviceStats.set(service.name, {
                attempts: 0,
                successes: 0,
                failures: 0,
                lastSuccess: null,
                avgResponseTime: 0,
                lastError: null
            });
        });
    }
    
    // 【修正】RSS取得メイン関数（エラーハンドリング強化）
    async fetchRSSWithFallback(rssUrl) {
        const errors = [];
        const startTime = Date.now();
        
        await this.enforceRateLimit();
        
        // 固定優先順序（成功実績重視）
        const orderedServices = [...this.proxyServices].sort((a, b) => a.priority - b.priority);
        
        this.log(`🚀 RSS取得開始: ${rssUrl}`);
        this.log(`📋 サービス試行順序: ${orderedServices.map(s => s.name).join(' → ')}`);
        
        for (let i = 0; i < orderedServices.length; i++) {
            const service = orderedServices[i];
            const serviceStats = this.serviceStats.get(service.name);
            
            for (let retry = 0; retry <= service.maxRetries; retry++) {
                const attemptStartTime = Date.now();
                serviceStats.attempts++;
                
                try {
                    this.log(`🔄 Trying ${service.name} (attempt ${retry + 1}/${service.maxRetries + 1})`);
                    
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), service.timeout);
                    
                    const fetchUrl = service.endpoint + service.params(rssUrl);
                    this.log(`📡 Request URL: ${fetchUrl}`);
                    
                    // 【修正】最小限のヘッダー設定（CORS問題回避）
                    const response = await fetch(fetchUrl, { 
                        signal: controller.signal,
                        method: 'GET',
                        headers: service.headers,
                        mode: 'cors',
                        credentials: 'omit',
                        cache: 'no-cache'
                    });
                    
                    clearTimeout(timeoutId);
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    
                    const responseTime = Date.now() - attemptStartTime;
                    this.log(`⏱️ Response time: ${responseTime}ms`);
                    
                    let data;
                    const contentType = response.headers.get('content-type') || '';
                    
                    if (contentType.includes('application/json')) {
                        data = await response.json();
                        this.log(`📋 Received JSON data`);
                    } else {
                        data = await response.text();
                        this.log(`📋 Received text data (${data.length} chars)`);
                    }
                    
                    const articles = service.parser(data);
                    
                    if (articles && articles.length > 0) {
                        // 成功統計更新
                        serviceStats.successes++;
                        serviceStats.lastSuccess = new Date().toISOString();
                        serviceStats.avgResponseTime = 
                            (serviceStats.avgResponseTime + responseTime) / 2;
                        serviceStats.lastError = null;
                        
                        this.log(`✅ SUCCESS with ${service.name}: ${articles.length} articles (${responseTime}ms)`);
                        
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
                    serviceStats.lastError = error.message;
                    
                    const errorInfo = {
                        service: service.name,
                        attempt: retry + 1,
                        error: error.message,
                        responseTime: Date.now() - attemptStartTime,
                        timestamp: new Date().toISOString()
                    };
                    
                    errors.push(errorInfo);
                    this.log(`❌ ${service.name} attempt ${retry + 1} failed (${errorInfo.responseTime}ms): ${error.message}`);
                    
                    if (retry < service.maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
            }
        }
        
        // 【修正】キャッシュフォールバック強化
        const cachedData = this.cache.get(rssUrl);
        if (cachedData && Date.now() - cachedData.timestamp < 24 * 60 * 60 * 1000) {
            this.log(`📦 Using cached data (${cachedData.articles.length} articles from ${cachedData.service})`);
            return {
                success: true,
                articles: cachedData.articles,
                service: cachedData.service + ' (cached)',
                attempt: 1,
                fromCache: true,
                totalTime: Date.now() - startTime
            };
        }
        
        // 完全失敗
        this.log(`💥 ALL SERVICES FAILED for ${rssUrl}`);
        return {
            success: false,
            articles: [],
            errors: errors,
            totalTime: Date.now() - startTime,
            fallbackMessage: `全てのRSSサービスが利用できません (${errors.length}個のサービスで失敗)。ネットワーク接続とURLを確認してください。`,
            serviceStats: this.getServiceStatsReport()
        };
    }
    
    // 【修正】RSS XML解析（堅牢性向上）
    parseRSSXML(xmlDoc) {
        try {
            const articles = [];
            
            // XML構文エラーチェック
            if (!xmlDoc || xmlDoc.querySelector('parsererror')) {
                this.log(`⚠️ XML parse error detected`);
                return null;
            }
            
            // RSS 2.0形式
            let items = xmlDoc.querySelectorAll('item');
            let format = 'RSS 2.0';
            
            // Atom形式
            if (items.length === 0) {
                items = xmlDoc.querySelectorAll('entry');
                format = 'Atom';
            }
            
            // RDF形式
            if (items.length === 0) {
                items = xmlDoc.querySelectorAll('rdf\\:item, item');
                format = 'RDF';
            }
            
            this.log(`📰 Detected ${format} format with ${items.length} items`);
            
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
                    
                    // 必須フィールドチェック
                    if (article.title && article.link) {
                        articles.push(article);
                        this.log(`📄 Item ${index + 1}: "${article.title.substring(0, 50)}..."`);
                    } else {
                        this.log(`⚠️ Item ${index + 1} missing required fields: title=${!!article.title}, link=${!!article.link}`);
                    }
                    
                } catch (error) {
                    this.log(`❌ Item ${index + 1} parse error: ${error.message}`);
                }
            });
            
            this.log(`✅ Successfully parsed ${articles.length} articles from ${format} feed`);
            return articles;
            
        } catch (error) {
            this.log(`💥 RSS XML parse error: ${error.message}`);
            return null;
        }
    }
    
    // 【新機能】YQL結果パーサー
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
            this.log(`❌ YQL parse error: ${error.message}`);
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
    
    // 【修正】複数RSS一括取得（成功率重視）
    async fetchAllRSSFeeds(rssFeeds) {
        try {
            this.log(`🔄 Starting bulk RSS fetch for ${rssFeeds.length} feeds`);
            
            const allArticles = [];
            const results = [];
            
            // 有効なフィードのみ処理
            const enabledFeeds = rssFeeds.filter(feed => feed.enabled);
            this.log(`📊 Processing ${enabledFeeds.length} enabled feeds (${rssFeeds.length - enabledFeeds.length} disabled)`);
            
            // 順次処理（安定性重視）
            for (const feed of enabledFeeds) {
                try {
                    this.log(`\n📡 === Fetching: "${feed.name}" ===`);
                    this.log(`🔗 URL: ${feed.url}`);
                    
                    const result = await this.fetchRSSWithFallback(feed.url);
                    
                    results.push({
                        feedName: feed.name,
                        feedUrl: feed.url,
                        success: result.success,
                        articleCount: result.articles.length,
                        service: result.service || 'unknown',
                        responseTime: result.responseTime || 0,
                        fromCache: result.fromCache || false,
                        error: result.success ? null : result.fallbackMessage
                    });
                    
                    if (result.success) {
                        // フィード固有カテゴリ適用
                        result.articles.forEach(article => {
                            if (feed.category) {
                                article.category = feed.category;
                            }
                            article.feedName = feed.name;
                            article.feedUrl = feed.url;
                        });
                        
                        allArticles.push(...result.articles);
                        
                        const cacheNote = result.fromCache ? ' (from cache)' : '';
                        this.log(`✅ SUCCESS: ${result.articles.length} articles${cacheNote}`);
                    } else {
                        this.log(`❌ FAILED: ${result.fallbackMessage}`);
                    }
                    
                } catch (error) {
                    this.log(`💥 Exception for feed "${feed.name}": ${error.message}`);
                    results.push({
                        feedName: feed.name,
                        feedUrl: feed.url,
                        success: false,
                        articleCount: 0,
                        error: error.message
                    });
                }
                
                // レート制限
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // 重複除去
            const uniqueArticles = this.removeDuplicateArticles(allArticles);
            
            // 結果サマリー
            const successCount = results.filter(r => r.success).length;
            const cacheCount = results.filter(r => r.fromCache).length;
            
            this.log(`\n📊 === BULK FETCH SUMMARY ===`);
            this.log(`✅ Success: ${successCount}/${enabledFeeds.length} feeds`);
            this.log(`📦 From cache: ${cacheCount} feeds`);
            this.log(`📄 Total articles: ${uniqueArticles.length} (${allArticles.length - uniqueArticles.length} duplicates removed)`);
            
            // 詳細結果
            results.forEach(result => {
                const status = result.success ? '✅' : '❌';
                const cache = result.fromCache ? ' (cached)' : '';
                const service = result.service ? ` [${result.service}]` : '';
                this.log(`${status} ${result.feedName}: ${result.articleCount} articles${cache}${service}`);
            });
            
            return uniqueArticles;
            
        } catch (error) {
            this.log(`💥 Bulk RSS fetch error: ${error.message}`);
            return [];
        }
    }
    
    // 重複記事除去
    removeDuplicateArticles(articles) {
        const seen = new Set();
        const unique = [];
        
        articles.forEach(article => {
            // URLとタイトルで重複判定
            const key = `${article.url}_${article.title.substring(0, 50)}`;
            
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(article);
            }
        });
        
        if (articles.length !== unique.length) {
            this.log(`🔄 Removed ${articles.length - unique.length} duplicate articles`);
        }
        
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
            this.log(`❌ Article normalization error: ${error.message}`);
            return this.createErrorArticle(rawArticle, sourceUrl, error.message);
        }
    }
    
    // 【修正】RSS取得テスト（詳細ログ付き）
    async testRSSFeed(url) {
        try {
            this.log(`🧪 === RSS FEED TEST ===`);
            this.log(`🔗 Testing URL: ${url}`);
            
            const result = await this.fetchRSSWithFallback(url);
            
            const testResult = {
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
            
            this.log(`🧪 Test result: ${testResult.message}`);
            
            if (testResult.sampleArticle) {
                this.log(`📄 Sample article: "${testResult.sampleArticle.title}"`);
            }
            
            return testResult;
            
        } catch (error) {
            this.log(`💥 RSS test error: ${error.message}`);
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
    
    // ユーティリティ関数群
    async enforceRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.rateLimitDelay) {
            const waitTime = this.rateLimitDelay - timeSinceLastRequest;
            this.log(`⏳ Rate limiting: waiting ${waitTime}ms`);
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
            
            // ドメイン別カテゴリ推定
            const domainCategories = {
                'nhk.or.jp': 'ニュース',
                'nikkei.com': '経済',
                'itmedia.co.jp': 'テクノロジー',
                'techcrunch.com': 'テクノロジー',
                'gigazine.net': 'テクノロジー',
                'reuters.com': 'ニュース',
                'bbc.com': 'ニュース',
                'cnn.com': 'ニュース',
                'asahi.com': 'ニュース',
                'mainichi.jp': 'ニュース',
                'yomiuri.co.jp': 'ニュース'
            };
            
            for (const [domainPattern, category] of Object.entries(domainCategories)) {
                if (domain.includes(domainPattern)) {
                    return category;
                }
            }
            
            // キーワード別カテゴリ推定
            const keywordCategories = {
                'テクノロジー': ['ai', 'iot', '技術', 'アプリ', 'システム', 'プログラミング', 'デジタル'],
                '経済': ['経済', '株価', '投資', '企業', '業績', '売上', '市場'],
                'スポーツ': ['野球', 'サッカー', '選手', '試合', 'オリンピック', 'スポーツ'],
                'エンタメ': ['映画', '音楽', 'アニメ', '芸能', 'ゲーム', 'エンタメ'],
                '政治': ['政治', '政府', '選挙', '国会', '法案', '大臣'],
                '科学': ['研究', '実験', '発見', '論文', '学会', '科学']
            };
            
            for (const [category, keywords] of Object.entries(keywordCategories)) {
                if (keywords.some(keyword => content.includes(keyword))) {
                    return category;
                }
            }
            
            return 'その他';
            
        } catch (error) {
            this.log(`⚠️ Category inference error: ${error.message}`);
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
                lastSuccess: stats.lastSuccess,
                lastError: stats.lastError
            };
        });
        return report;
    }
    
    // 【新機能】ログ出力（デバッグモード対応）
    log(message) {
        if (this.debugMode) {
            console.log(`[RSSFetcher] ${message}`);
        }
    }
    
    // キャッシュ管理
    clearCache() {
        this.cache.clear();
        this.log('📦 RSS cache cleared');
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
    
    // 【新機能】デバッグモード切替
    setDebugMode(enabled) {
        this.debugMode = enabled;
        this.log(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    // 【新機能】統計情報取得
    getOverallStats() {
        const stats = this.getServiceStatsReport();
        const totalAttempts = Object.values(stats).reduce((sum, s) => sum + s.attempts, 0);
        const totalSuccesses = Object.values(stats).reduce((sum, s) => sum + s.successes, 0);
        const overallSuccessRate = totalAttempts > 0 ? Math.round((totalSuccesses / totalAttempts) * 100) : 0;
        
        return {
            overallSuccessRate: overallSuccessRate,
            totalAttempts: totalAttempts,
            totalSuccesses: totalSuccesses,
            serviceStats: stats,
            cacheStats: this.getCacheStats()
        };
    }
}
