// RSS取得・プロキシAPI管理（仕様書準拠）
class RSSFetcher {
    constructor() {
        // 仕様書記載のプロキシサービス優先順位
        this.PROXY_SERVICES = [
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
        
        this.fetchingFeeds = new Set();
        this.lastFetchTime = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5分キャッシュ
    }
    
    // 仕様書記載のフォールバック実装
    async fetchRSSWithFallback(rssUrl) {
        const errors = [];
        
        // 同時取得防止
        if (this.fetchingFeeds.has(rssUrl)) {
            return { success: false, error: 'Already fetching this RSS' };
        }
        
        // キャッシュチェック
        const cached = this.getCachedFeed(rssUrl);
        if (cached) {
            return { success: true, articles: cached, source: 'cache' };
        }
        
        this.fetchingFeeds.add(rssUrl);
        
        try {
            for (let i = 0; i < this.PROXY_SERVICES.length; i++) {
                const service = this.PROXY_SERVICES[i];
                
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
                        
                        const contentType = response.headers.get('content-type');
                        let data;
                        
                        if (contentType && contentType.includes('application/json')) {
                            data = await response.json();
                        } else {
                            data = await response.text();
                        }
                        
                        const articles = service.parser(data);
                        
                        if (articles && articles.length > 0) {
                            console.log(`Success with ${service.name}: ${articles.length} articles`);
                            
                            // 記事データ正規化
                            const normalizedArticles = this.normalizeArticles(articles, rssUrl);
                            
                            // キャッシュ保存
                            this.cacheFeeed(rssUrl, normalizedArticles);
                            
                            return {
                                success: true,
                                articles: normalizedArticles,
                                service: service.name,
                                attempt: retry + 1,
                                count: normalizedArticles.length
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
            
            return {
                success: false,
                articles: [],
                errors: errors,
                fallbackMessage: 'すべてのRSSサービスが利用できません。しばらく後に再試行してください。'
            };
            
        } finally {
            this.fetchingFeeds.delete(rssUrl);
        }
    }
    
    // 仕様書記載のRSSXMLパーサー
    parseRSSXML(xml) {
        const articles = [];
        
        // RSS 2.0形式
        const rssItems = xml.querySelectorAll('item');
        if (rssItems.length > 0) {
            rssItems.forEach(item => {
                const article = this.parseRSSItem(item);
                if (article) articles.push(article);
            });
            return articles;
        }
        
        // Atom形式
        const atomEntries = xml.querySelectorAll('entry');
        if (atomEntries.length > 0) {
            atomEntries.forEach(entry => {
                const article = this.parseAtomEntry(entry);
                if (article) articles.push(article);
            });
            return articles;
        }
        
        // RDF形式
        const rdfItems = xml.querySelectorAll('item');
        if (rdfItems.length > 0) {
            rdfItems.forEach(item => {
                const article = this.parseRDFItem(item);
                if (article) articles.push(article);
            });
            return articles;
        }
        
        return null;
    }
    
    parseRSSItem(item) {
        try {
            const title = this.getTextContent(item.querySelector('title'));
            const link = this.getTextContent(item.querySelector('link'));
            const description = this.getTextContent(item.querySelector('description'));
            const pubDate = this.getTextContent(item.querySelector('pubDate'));
            const guid = this.getTextContent(item.querySelector('guid'));
            
            if (!title || !link) return null;
            
            return {
                title: this.cleanText(title),
                link: link.trim(),
                description: this.cleanHTML(description),
                pubDate: this.parseDate(pubDate),
                guid: guid || link
            };
        } catch (error) {
            console.warn('RSS item parse error:', error);
            return null;
        }
    }
    
    parseAtomEntry(entry) {
        try {
            const title = this.getTextContent(entry.querySelector('title'));
            const link = entry.querySelector('link');
            const content = this.getTextContent(entry.querySelector('content, summary'));
            const published = this.getTextContent(entry.querySelector('published, updated'));
            const id = this.getTextContent(entry.querySelector('id'));
            
            if (!title || !link) return null;
            
            const href = link.getAttribute('href') || link.textContent;
            
            return {
                title: this.cleanText(title),
                link: href.trim(),
                description: this.cleanHTML(content),
                pubDate: this.parseDate(published),
                guid: id || href
            };
        } catch (error) {
            console.warn('Atom entry parse error:', error);
            return null;
        }
    }
    
    parseRDFItem(item) {
        try {
            const title = this.getTextContent(item.querySelector('title'));
            const link = this.getTextContent(item.querySelector('link'));
            const description = this.getTextContent(item.querySelector('description'));
            const date = this.getTextContent(item.querySelector('dc\\:date, date'));
            
            if (!title || !link) return null;
            
            return {
                title: this.cleanText(title),
                link: link.trim(),
                description: this.cleanHTML(description),
                pubDate: this.parseDate(date),
                guid: link
            };
        } catch (error) {
            console.warn('RDF item parse error:', error);
            return null;
        }
    }
    
    // 記事データ正規化（仕様書データ構造準拠）
    normalizeArticles(articles, rssUrl) {
        const domain = this.extractDomain(rssUrl);
        const now = Date.now();
        
        return articles.map((article, index) => {
            const publishDate = article.pubDate || article.published || new Date().toISOString();
            const articleUrl = article.link || article.url || '';
            const articleDomain = this.extractDomain(articleUrl) || domain;
            
            // 仕様書記載のarticleIdフォーマット
            const articleId = `${articleDomain}_${this.hashString(articleUrl)}_${Date.parse(publishDate) || now}`;
            
            return {
                articleId: articleId,
                title: article.title || '無題',
                excerpt: this.generateExcerpt(article.description || article.content || ''),
                url: articleUrl,
                domain: articleDomain,
                publishDate: publishDate,
                category: 'uncategorized', // Phase Cで詳細実装
                readStatus: 'unread',
                favorited: false,
                interestScore: 50, // デフォルトスコア
                matchedKeywords: [],
                feedbackHistory: [],
                rssSource: rssUrl,
                fetchTimestamp: new Date().toISOString()
            };
        });
    }
    
    // ユーティリティ関数群
    getTextContent(element) {
        if (!element) return '';
        return element.textContent || element.innerText || '';
    }
    
    cleanText(text) {
        return text.replace(/\s+/g, ' ').trim().substring(0, 200);
    }
    
    cleanHTML(html) {
        if (!html) return '';
        
        // HTMLタグ除去
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const text = temp.textContent || temp.innerText || '';
        
        return text.replace(/\s+/g, ' ').trim();
    }
    
    generateExcerpt(content) {
        const cleaned = this.cleanHTML(content);
        return cleaned.length > 200 ? cleaned.substring(0, 197) + '...' : cleaned;
    }
    
    parseDate(dateString) {
        if (!dateString) return new Date().toISOString();
        
        try {
            const date = new Date(dateString);
            return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
        } catch (error) {
            return new Date().toISOString();
        }
    }
    
    extractDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace(/^www\./, '');
        } catch (error) {
            return 'unknown';
        }
    }
    
    hashString(str) {
        let hash = 0;
        if (str.length === 0) return hash.toString();
        
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 32bit整数に変換
        }
        
        return Math.abs(hash).toString();
    }
    
    // キャッシュ管理
    getCachedFeed(rssUrl) {
        const cacheKey = `rss_cache_${this.hashString(rssUrl)}`;
        const lastFetch = this.lastFetchTime.get(rssUrl) || 0;
        
        if (Date.now() - lastFetch < this.cacheTimeout) {
            try {
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    console.log('Using cached RSS data');
                    return JSON.parse(cached);
                }
            } catch (error) {
                console.warn('Cache read error:', error);
            }
        }
        
        return null;
    }
    
    cacheFeeed(rssUrl, articles) {
        const cacheKey = `rss_cache_${this.hashString(rssUrl)}`;
        
        try {
            localStorage.setItem(cacheKey, JSON.stringify(articles));
            this.lastFetchTime.set(rssUrl, Date.now());
        } catch (error) {
            console.warn('Cache write error:', error);
        }
    }
    
    // 複数RSS一括取得
    async fetchAllRSSFeeds(rssFeeds) {
        if (!Array.isArray(rssFeeds) || rssFeeds.length === 0) {
            return { success: false, message: 'RSSフィードが設定されていません' };
        }
        
        const enabledFeeds = rssFeeds.filter(feed => feed.enabled);
        if (enabledFeeds.length === 0) {
            return { success: false, message: '有効なRSSフィードがありません' };
        }
        
        console.log(`Fetching ${enabledFeeds.length} RSS feeds...`);
        
        const results = await Promise.allSettled(
            enabledFeeds.map(async feed => {
                const result = await this.fetchRSSWithFallback(feed.url);
                return {
                    feedId: feed.id,
                    feedName: feed.name,
                    category: feed.category,
                    ...result
                };
            })
        );
        
        const successResults = results.filter(r => r.status === 'fulfilled' && r.value.success);
        const failedResults = results.filter(r => r.status === 'rejected' || !r.value.success);
        
        // 成功した記事を統合
        const allArticles = [];
        successResults.forEach(result => {
            if (result.value.articles) {
                // カテゴリ情報を追加
                const categorizedArticles = result.value.articles.map(article => ({
                    ...article,
                    category: result.value.category || 'uncategorized',
                    rssId: result.value.feedId,
                    rssName: result.value.feedName
                }));
                allArticles.push(...categorizedArticles);
            }
        });
        
        return {
            success: true,
            articles: allArticles,
            successCount: successResults.length,
            failedCount: failedResults.length,
            totalFeeds: enabledFeeds.length,
            errors: failedResults.map(r => r.reason || r.value)
        };
    }
    
    // RSS妥当性検証
    async validateRSSFeed(rssUrl) {
        try {
            const result = await this.fetchRSSWithFallback(rssUrl);
            
            if (!result.success) {
                return {
                    valid: false,
                    error: result.fallbackMessage || 'RSS取得に失敗しました',
                    details: result.errors
                };
            }
            
            return {
                valid: true,
                articleCount: result.articles.length,
                service: result.service,
                sampleTitle: result.articles[0]?.title || ''
            };
            
        } catch (error) {
            return {
                valid: false,
                error: 'RSS検証中にエラーが発生しました',
                details: error.message
            };
        }
    }
    
    // デバッグ・統計情報
    getStats() {
        return {
            proxySErvices: this.PROXY_SERVICES.map(s => s.name),
            cacheEntries: this.lastFetchTime.size,
            activeFetches: this.fetchingFeeds.size,
            cacheTimeout: this.cacheTimeout / 1000 + ' seconds'
        };
    }
}

// Phase B確認用デバッグ関数
window.debugRSSFetcher = async function() {
    console.log('=== RSS Fetcher Debug ===');
    
    const fetcher = new RSSFetcher();
    console.log('RSSFetcher created:', fetcher);
    console.log('Proxy services:', fetcher.PROXY_SERVICES.map(s => s.name));
    
    // テスト用RSSで動作確認
    const testUrl = 'https://feeds.bbci.co.uk/news/rss.xml';
    console.log('Testing with BBC News RSS...');
    
    try {
        const result = await fetcher.validateRSSFeed(testUrl);
        console.log('RSS validation result:', result);
    } catch (error) {
        console.error('RSS test error:', error);
    }
    
    console.log('=== RSS Fetcher Debug Complete ===');
};
