// Minews PWA - フォルダ機能完全修正版
(function() {
    'use strict';
    
    // ===========================================
    // データ型定義・定数
    // ===========================================
    
    const STORAGE_KEYS = {
        ARTICLES: 'minews_articles',
        RSS_FEEDS: 'minews_rssFeeds',
        FOLDERS: 'minews_folders',
        AI_LEARNING: 'minews_aiLearning',
        WORD_FILTERS: 'minews_wordFilters'
    };
    
    const MAX_ARTICLES = 1000;
    const DATA_VERSION = '1.0';
    
    const RSS_PROXY_URLS = [
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://api.allorigins.win/get?url=',
        'https://thingproxy.freeboard.io/fetch/',
        'https://corsproxy.io/?'
    ];
    
    const REQUEST_TIMEOUT = 15000;
    const MAX_RETRIES = 2;
    const RETRY_DELAY = 3000;
    
    // フォルダカラーパレット
    const FOLDER_COLORS = [
        { name: 'ブルー', value: '#4A90A4' },
        { name: 'グリーン', value: '#28a745' },
        { name: 'オレンジ', value: '#fd7e14' },
        { name: 'パープル', value: '#6f42c1' },
        { name: 'レッド', value: '#dc3545' },
        { name: 'グレー', value: '#6c757d' }
    ];
    
    // デフォルトデータ（フォルダ機能追加）
    const DEFAULT_DATA = {
        folders: [
            {
                id: 'default-general',
                name: 'ニュース',
                color: '#4A90A4',
                createdAt: new Date().toISOString()
            },
            {
                id: 'default-tech',
                name: 'テック',
                color: '#28a745',
                createdAt: new Date().toISOString()
            }
        ],
        articles: [],
        rssFeeds: [
            {
                id: 'default-nhk',
                url: 'https://www3.nhk.or.jp/rss/news/cat0.xml',
                title: 'NHKニュース',
                folderId: 'default-general',
                lastUpdated: new Date().toISOString(),
                isActive: true
            },
            {
                id: 'default-itmedia',
                url: 'https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml',
                title: 'ITmedia',
                folderId: 'default-tech',
                lastUpdated: new Date().toISOString(),
                isActive: true
            }
        ],
        aiLearning: {
            version: DATA_VERSION,
            wordWeights: {},
            categoryWeights: {
                'Technology': 0,
                'Development': 0,
                'Business': 0,
                'Science': 0,
                'Design': 0,
                'AI': 0,
                'Web': 0,
                'Mobile': 0
            },
            lastUpdated: new Date().toISOString()
        },
        wordFilters: {
            interestWords: ['AI', 'React', 'JavaScript', 'PWA', '機械学習'],
            ngWords: [],
            lastUpdated: new Date().toISOString()
        }
    };
    
    // ===========================================
    // データキャッシュシステム（フォルダ対応）
    // ===========================================
    
    const DataHooksCache = {
        articles: null,
        rssFeeds: null,
        folders: null,
        aiLearning: null,
        wordFilters: null,
        lastUpdate: {
            articles: null,
            rssFeeds: null,
            folders: null,
            aiLearning: null,
            wordFilters: null
        },
        clear: function(key) {
            if (key) {
                this[key] = null;
                this.lastUpdate[key] = null;
                console.log(`[Cache] Cleared cache for: ${key}`);
            } else {
                this.articles = null;
                this.rssFeeds = null;
                this.folders = null;
                this.aiLearning = null;
                this.wordFilters = null;
                this.lastUpdate = {
                    articles: null,
                    rssFeeds: null,
                    folders: null,
                    aiLearning: null,
                    wordFilters: null
                };
                console.log('[Cache] Cleared all cache');
            }
        },
        getStats: function() {
            return {
                articles: this.articles ? 'cached' : 'not cached',
                rssFeeds: this.rssFeeds ? 'cached' : 'not cached',
                folders: this.folders ? 'cached' : 'not cached',
                aiLearning: this.aiLearning ? 'cached' : 'not cached',
                wordFilters: this.wordFilters ? 'cached' : 'not cached'
            };
        }
    };
    
    // ===========================================
    // フォルダ管理システム
    // ===========================================
    
    const FolderManager = {
        createFolder: function(name, color = '#4A90A4') {
            return {
                id: 'folder_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                name: name.trim(),
                color: color,
                createdAt: new Date().toISOString()
            };
        },
        
        validateFolder: function(folder) {
            return folder && 
                   typeof folder.name === 'string' && 
                   folder.name.trim().length > 0 && 
                   folder.name.trim().length <= 50;
        },
        
        getColorName: function(colorValue) {
            const color = FOLDER_COLORS.find(c => c.value === colorValue);
            return color ? color.name : 'カスタム';
        },
        
        // 記事とフィードの関連付け改善
        matchArticleToFeed: function(article, feeds) {
            // 1. 完全一致を試行
            let matchedFeed = feeds.find(feed => feed.title === article.rssSource);
            if (matchedFeed) {
                return matchedFeed;
            }
            
            // 2. 部分一致を試行
            matchedFeed = feeds.find(feed => 
                article.rssSource.includes(feed.title) || 
                feed.title.includes(article.rssSource)
            );
            if (matchedFeed) {
                return matchedFeed;
            }
            
            // 3. ドメイン名での一致を試行
            try {
                matchedFeed = feeds.find(feed => {
                    const feedDomain = this.extractDomainFromUrl(feed.url);
                    const articleDomain = this.extractDomainFromSource(article.rssSource);
                    return articleDomain === feedDomain;
                });
                if (matchedFeed) {
                    return matchedFeed;
                }
            } catch (error) {
                console.warn('[FolderManager] Domain matching failed:', error);
            }
            
            return null;
        },
        
        extractDomainFromSource: function(source) {
            if (source.includes('.')) {
                return source.toLowerCase().replace(/^www\./, '');
            }
            return source.toLowerCase();
        },
        
        extractDomainFromUrl: function(url) {
            try {
                const urlObj = new URL(url);
                return urlObj.hostname.replace(/^www\./, '');
            } catch {
                return '';
            }
        }
    };
    
    // ===========================================
    // RSS取得・解析システム（継承）
    // ===========================================
    
    const RSSProcessor = {
        fetchRSS: async function(url, proxyIndex = 0, retryCount = 0) {
            if (proxyIndex >= RSS_PROXY_URLS.length) {
                if (retryCount < MAX_RETRIES) {
                    console.log(`[RSS] Retrying from first proxy (attempt ${retryCount + 1})`);
                    await this.delay(RETRY_DELAY);
                    return this.fetchRSS(url, 0, retryCount + 1);
                }
                throw new Error('All proxy servers failed after retries');
            }
            
            const proxyUrl = RSS_PROXY_URLS[proxyIndex];
            const fullUrl = proxyUrl + encodeURIComponent(url);
            
            console.log(`[RSS] Fetching via proxy ${proxyIndex + 1} (${proxyUrl.split('?')[0]}):`, url);
            
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
                
                const response = await fetch(fullUrl, {
                    signal: controller.signal,
                    headers: {
                        'Accept': '*/*',
                        'User-Agent': 'Mozilla/5.0 (compatible; Minews/1.0)',
                    },
                    mode: 'cors'
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                let xmlContent;
                if (proxyUrl.includes('allorigins.win')) {
                    const data = await response.json();
                    xmlContent = data.contents;
                    if (!xmlContent) throw new Error('No contents in allorigins.win response');
                } else if (proxyUrl.includes('codetabs.com')) {
                    xmlContent = await response.text();
                } else if (proxyUrl.includes('thingproxy.freeboard.io')) {
                    xmlContent = await response.text();
                } else {
                    const contentType = response.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) {
                        try {
                            const data = await response.json();
                            xmlContent = data.contents || data;
                        } catch {
                            xmlContent = await response.text();
                        }
                    } else {
                        xmlContent = await response.text();
                    }
                }
                
                if (!xmlContent || xmlContent.trim().length === 0) {
                    throw new Error('Empty response content');
                }
                
                console.log(`[RSS] Successfully fetched via proxy ${proxyIndex + 1}`);
                return xmlContent;
                
            } catch (error) {
                console.warn(`[RSS] Proxy ${proxyIndex + 1} failed:`, error.message);
                if (error.name === 'AbortError') {
                    console.warn(`[RSS] Request timeout for proxy ${proxyIndex + 1}`);
                }
                return this.fetchRSS(url, proxyIndex + 1, retryCount);
            }
        },
        
        delay: function(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },
        
        parseRSS: function(xmlString, sourceUrl) {
            try {
                const cleanXml = xmlString.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(cleanXml, 'text/xml');
                
                const parseError = xmlDoc.querySelector('parsererror');
                if (parseError) {
                    console.error('[RSS] XML Parse Error:', parseError.textContent);
                    throw new Error('XML parse error: ' + parseError.textContent);
                }
                
                const articles = [];
                let feedTitle = 'Unknown Feed';
                
                // RSS 2.0
                const rss2Items = xmlDoc.querySelectorAll('rss channel item');
                if (rss2Items.length > 0) {
                    feedTitle = xmlDoc.querySelector('rss channel title')?.textContent?.trim() || feedTitle;
                    rss2Items.forEach((item, index) => {
                        if (index < 20) {
                            const article = this.parseRSSItem(item, sourceUrl);
                            if (article) articles.push(article);
                        }
                    });
                }
                
                // Atom
                const atomEntries = xmlDoc.querySelectorAll('feed entry');
                if (atomEntries.length > 0 && articles.length === 0) {
                    feedTitle = xmlDoc.querySelector('feed title')?.textContent?.trim() || feedTitle;
                    atomEntries.forEach((entry, index) => {
                        if (index < 20) {
                            const article = this.parseAtomEntry(entry, sourceUrl);
                            if (article) articles.push(article);
                        }
                    });
                }
                
                // RDF
                const rdfItems = xmlDoc.querySelectorAll('rdf\\:RDF item, RDF item');
                if (rdfItems.length > 0 && articles.length === 0) {
                    feedTitle = xmlDoc.querySelector('channel title')?.textContent?.trim() || feedTitle;
                    rdfItems.forEach((item, index) => {
                        if (index < 20) {
                            const article = this.parseRSSItem(item, sourceUrl);
                            if (article) articles.push(article);
                        }
                    });
                }
                
                console.log(`[RSS] Parsed ${articles.length} articles from ${feedTitle}`);
                return { articles, feedTitle };
                
            } catch (error) {
                console.error('[RSS] Parse error:', error);
                throw new Error('Failed to parse RSS feed: ' + error.message);
            }
        },
        
        parseRSSItem: function(item, sourceUrl) {
            try {
                const title = this.getTextContent(item, ['title']);
                const link = this.getTextContent(item, ['link', 'guid']) || item.getAttribute('rdf:about');
                const description = this.getTextContent(item, [
                    'description', 'content:encoded', 'content', 'summary'
                ]);
                const pubDate = this.getTextContent(item, ['pubDate', 'date']);
                const category = this.getTextContent(item, ['category', 'subject']) || 'General';
                
                if (!title || !link) {
                    console.warn('[RSS] Skipping item: missing title or link');
                    return null;
                }
                
                const cleanDescription = description ? this.cleanHtml(description).substring(0, 300) : '記事の概要は提供されていません';
                const keywords = this.extractKeywords(title + ' ' + cleanDescription);
                
                const article = {
                    id: 'rss_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                    title: this.cleanHtml(title).trim(),
                    url: link.trim(),
                    content: cleanDescription,
                    publishDate: this.parseDate(pubDate),
                    rssSource: this.extractDomain(sourceUrl),
                    category: this.cleanHtml(category).trim(),
                    readStatus: 'unread',
                    readLater: false,
                    userRating: 0,
                    keywords: keywords,
                    fetchedAt: new Date().toISOString()
                };
                
                return article;
                
            } catch (error) {
                console.error('[RSS] Error parsing RSS item:', error);
                return null;
            }
        },
        
        parseAtomEntry: function(entry, sourceUrl) {
            try {
                const title = this.getTextContent(entry, ['title']);
                const link = entry.querySelector('link')?.getAttribute('href') || this.getTextContent(entry, ['id']);
                const content = this.getTextContent(entry, [
                    'content', 'summary', 'description'
                ]);
                const published = this.getTextContent(entry, ['published', 'updated']);
                const category = entry.querySelector('category')?.getAttribute('term') || 
                               entry.querySelector('category')?.textContent || 'General';
                
                if (!title || !link) {
                    console.warn('[RSS] Skipping Atom entry: missing title or link');
                    return null;
                }
                
                const cleanContent = content ? this.cleanHtml(content).substring(0, 300) : '記事の概要は提供されていません';
                const keywords = this.extractKeywords(title + ' ' + cleanContent);
                
                const article = {
                    id: 'atom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                    title: this.cleanHtml(title).trim(),
                    url: link.trim(),
                    content: cleanContent,
                    publishDate: this.parseDate(published),
                    rssSource: this.extractDomain(sourceUrl),
                    category: this.cleanHtml(category).trim(),
                    readStatus: 'unread',
                    readLater: false,
                    userRating: 0,
                    keywords: keywords,
                    fetchedAt: new Date().toISOString()
                };
                
                return article;
                
            } catch (error) {
                console.error('[RSS] Error parsing Atom entry:', error);
                return null;
            }
        },
        
        getTextContent: function(element, selectors) {
            for (const selector of selectors) {
                let result = null;
                
                if (selector.includes(':')) {
                    const elements = element.getElementsByTagName(selector);
                    if (elements.length > 0 && elements[0].textContent) {
                        result = elements[0].textContent.trim();
                    }
                    if (!result) {
                        const localName = selector.split(':')[1];
                        const localElements = element.getElementsByTagName(localName);
                        if (localElements.length > 0 && localElements[0].textContent) {
                            result = localElements[0].textContent.trim();
                        }
                    }
                } else {
                    try {
                        const el = element.querySelector(selector);
                        if (el && el.textContent) {
                            result = el.textContent.trim();
                        }
                    } catch (e) {
                        const elements = element.getElementsByTagName(selector);
                        if (elements.length > 0 && elements[0].textContent) {
                            result = elements[0].textContent.trim();
                        }
                    }
                }
                
                if (result) return result;
            }
            return null;
        },
        
        cleanHtml: function(html) {
            if (!html) return '';
            return html.replace(/<[^>]*>/g, '')
                      .replace(/&lt;/g, '<')
                      .replace(/&gt;/g, '>')
                      .replace(/&amp;/g, '&')
                      .replace(/&quot;/g, '"')
                      .replace(/&#39;/g, "'")
                      .replace(/\s+/g, ' ')
                      .trim();
        },
        
        parseDate: function(dateString) {
            if (!dateString) return new Date().toISOString();
            try {
                const date = new Date(dateString);
                if (isNaN(date.getTime())) {
                    return new Date().toISOString();
                }
                return date.toISOString();
            } catch {
                return new Date().toISOString();
            }
        },
        
        extractKeywords: function(text) {
            const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 
                              'は', 'が', 'を', 'に', 'で', 'と', 'の', 'から', 'まで', 'について', 'という', 'など'];
            
            const words = text.toLowerCase()
                             .replace(/[^\w\sぁ-んァ-ン一-龯]/g, ' ')
                             .split(/\s+/)
                             .filter(word => word.length > 2 && !stopWords.includes(word))
                             .slice(0, 8);
            
            return [...new Set(words)];
        },
        
        extractDomain: function(url) {
            try {
                const urlObj = new URL(url);
                return urlObj.hostname.replace(/^www\./, '');
            } catch {
                return 'Unknown Source';
            }
        }
    };
    // ===========================================
    // AI学習・スコアリングシステム（継承）
    // ===========================================
    
    const AIScoring = {
        calculateScore: function(article, aiLearning, wordFilters) {
            let score = 0;
            
            const ageInDays = (Date.now() - new Date(article.publishDate).getTime()) / (1000 * 60 * 60 * 24);
            score += Math.max(0, 10 - ageInDays);
            
            if (article.keywords && aiLearning.wordWeights) {
                article.keywords.forEach(keyword => {
                    const weight = aiLearning.wordWeights[keyword] || 0;
                    score += weight;
                });
            }
            
            if (article.category && aiLearning.categoryWeights) {
                const categoryWeight = aiLearning.categoryWeights[article.category] || 0;
                score += categoryWeight;
            }
            
            if (wordFilters.interestWords && article.title) {
                wordFilters.interestWords.forEach(word => {
                    if (article.title.toLowerCase().includes(word.toLowerCase()) ||
                        article.content.toLowerCase().includes(word.toLowerCase())) {
                        score += 20;
                    }
                });
            }
            
            if (wordFilters.ngWords && article.title) {
                wordFilters.ngWords.forEach(word => {
                    if (article.title.toLowerCase().includes(word.toLowerCase()) ||
                        article.content.toLowerCase().includes(word.toLowerCase())) {
                        score -= 50;
                    }
                });
            }
            
            if (article.userRating > 0) {
                score += (article.userRating - 3) * 10;
            }
            
            return Math.round(score);
        },
        
        updateLearning: function(article, rating, aiLearning, isRevert = false) {
            const weights = [0, -30, -15, 0, 15, 30];
            let weight = weights[rating] || 0;
            
            if (isRevert) {
                weight = -weight;
            }
            
            if (article.keywords) {
                article.keywords.forEach(keyword => {
                    aiLearning.wordWeights[keyword] = (aiLearning.wordWeights[keyword] || 0) + weight;
                });
            }
            
            if (article.category) {
                aiLearning.categoryWeights[article.category] = (aiLearning.categoryWeights[article.category] || 0) + weight;
            }
            
            aiLearning.lastUpdated = new Date().toISOString();
            
            if (isRevert) {
                console.log(`[AI] Learning reverted for rating ${rating}, weight: ${weight}`);
            } else {
                console.log(`[AI] Learning updated for rating ${rating}, weight: ${weight}`);
            }
            
            return aiLearning;
        },
        
        sortArticlesByScore: function(articles, aiLearning, wordFilters) {
            return articles.map(article => ({
                ...article,
                aiScore: this.calculateScore(article, aiLearning, wordFilters)
            })).sort((a, b) => {
                if (a.aiScore !== b.aiScore) return b.aiScore - a.aiScore;
                if (a.userRating !== b.userRating) return b.userRating - a.userRating;
                return new Date(b.publishDate) - new Date(a.publishDate);
            });
        }
    };
    
    // ===========================================
    // ワードフィルター管理システム（継承）
    // ===========================================
    
    const WordFilterManager = {
        addWord: function(word, type, wordFilters) {
            word = word.trim().toLowerCase();
            if (!word) return false;
            
            if (type === 'interest') {
                if (!wordFilters.interestWords.includes(word)) {
                    wordFilters.interestWords.push(word);
                    wordFilters.lastUpdated = new Date().toISOString();
                    console.log('[WordFilter] Added interest word:', word);
                    return true;
                }
            } else if (type === 'ng') {
                if (!wordFilters.ngWords.includes(word)) {
                    wordFilters.ngWords.push(word);
                    wordFilters.lastUpdated = new Date().toISOString();
                    console.log('[WordFilter] Added NG word:', word);
                    return true;
                }
            }
            return false;
        },
        
        removeWord: function(word, type, wordFilters) {
            word = word.trim().toLowerCase();
            
            if (type === 'interest') {
                const index = wordFilters.interestWords.indexOf(word);
                if (index > -1) {
                    wordFilters.interestWords.splice(index, 1);
                    wordFilters.lastUpdated = new Date().toISOString();
                    console.log('[WordFilter] Removed interest word:', word);
                    return true;
                }
            } else if (type === 'ng') {
                const index = wordFilters.ngWords.indexOf(word);
                if (index > -1) {
                    wordFilters.ngWords.splice(index, 1);
                    wordFilters.lastUpdated = new Date().toISOString();
                    console.log('[WordFilter] Removed NG word:', word);
                    return true;
                }
            }
            return false;
        },
        
        filterArticles: function(articles, wordFilters) {
            if (!wordFilters.ngWords.length) return articles;
            
            return articles.filter(article => {
                const text = (article.title + ' ' + article.content).toLowerCase();
                return !wordFilters.ngWords.some(ngWord => 
                    text.includes(ngWord.toLowerCase())
                );
            });
        }
    };
    
    // ===========================================
    // ローカルストレージ管理システム（継承）
    // ===========================================
    
    const LocalStorageManager = {
        setItem: function(key, data) {
            try {
                const serializedData = JSON.stringify({
                    data: data,
                    timestamp: new Date().toISOString(),
                    version: DATA_VERSION
                });
                localStorage.setItem(key, serializedData);
                console.log('[Storage] Saved:', key, 'Size:', serializedData.length);
                return true;
            } catch (error) {
                console.error('[Storage] Save failed:', key, error);
                return false;
            }
        },
        
        getItem: function(key, defaultValue) {
            try {
                const stored = localStorage.getItem(key);
                if (!stored) {
                    if (defaultValue) {
                        this.setItem(key, defaultValue);
                        console.log('[Storage] Initialized with default for:', key);
                    }
                    return defaultValue;
                }
                
                const parsed = JSON.parse(stored);
                if (parsed.version !== DATA_VERSION) {
                    console.warn('[Storage] Version mismatch:', key, 'Migrating data');
                    return this.migrateData(key, parsed, defaultValue);
                }
                
                console.log('[Storage] Loaded:', key, 'Timestamp:', parsed.timestamp);
                return parsed.data;
            } catch (error) {
                console.error('[Storage] Load failed:', key, error);
                if (defaultValue) {
                    this.setItem(key, defaultValue);
                }
                return defaultValue;
            }
        },
        
        removeItem: function(key) {
            try {
                localStorage.removeItem(key);
                console.log('[Storage] Removed:', key);
                return true;
            } catch (error) {
                console.error('[Storage] Remove failed:', key, error);
                return false;
            }
        },
        
        migrateData: function(key, oldData, defaultValue) {
            console.log('[Storage] Migrating data for:', key);
            if (oldData.data) {
                this.setItem(key, oldData.data);
                return oldData.data;
            }
            return defaultValue;
        },
        
        getStorageInfo: function() {
            let totalSize = 0;
            let itemCount = 0;
            
            for (let key in localStorage) {
                if (localStorage.hasOwnProperty(key) && key.startsWith('minews_')) {
                    totalSize += localStorage[key].length;
                    itemCount++;
                }
            }
            
            return {
                totalSize: totalSize,
                itemCount: itemCount,
                available: 5000000 - totalSize
            };
        }
    };
    
    // ===========================================
    // データ操作フック（フォルダ対応版）
    // ===========================================
    
    const DataHooks = {
        useArticles: function() {
            const stored = localStorage.getItem(STORAGE_KEYS.ARTICLES);
            const timestamp = stored ? JSON.parse(stored).timestamp : null;
            
            if (!DataHooksCache.articles || DataHooksCache.lastUpdate.articles !== timestamp) {
                DataHooksCache.articles = LocalStorageManager.getItem(STORAGE_KEYS.ARTICLES, DEFAULT_DATA.articles);
                DataHooksCache.lastUpdate.articles = timestamp;
                console.log('[Cache] Articles cache updated');
            }
            
            return {
                articles: DataHooksCache.articles,
                
                addArticle: function(newArticle) {
                    const updatedArticles = [...DataHooksCache.articles];
                    
                    const exists = updatedArticles.find(article => 
                        article.id === newArticle.id ||
                        article.url === newArticle.url ||
                        (article.title === newArticle.title && article.rssSource === newArticle.rssSource)
                    );
                    
                    if (exists) {
                        console.warn('[Articles] Duplicate article:', newArticle.title);
                        return false;
                    }
                    
                    if (updatedArticles.length >= MAX_ARTICLES) {
                        updatedArticles.sort((a, b) => {
                            const aScore = (a.readStatus === 'read' && a.userRating === 0) ? 1 : 0;
                            const bScore = (b.readStatus === 'read' && b.userRating === 0) ? 1 : 0;
                            
                            if (aScore !== bScore) return bScore - aScore;
                            return new Date(a.publishDate) - new Date(b.publishDate);
                        });
                        
                        updatedArticles.pop();
                        console.log('[Articles] Removed old article for capacity');
                    }
                    
                    updatedArticles.unshift(newArticle);
                    LocalStorageManager.setItem(STORAGE_KEYS.ARTICLES, updatedArticles);
                    DataHooksCache.articles = updatedArticles;
                    DataHooksCache.lastUpdate.articles = new Date().toISOString();
                    state.articles = updatedArticles;
                    return true;
                },
                
                updateArticle: function(articleId, updates) {
                    const updatedArticles = DataHooksCache.articles.map(article =>
                        article.id === articleId ? { ...article, ...updates } : article
                    );
                    
                    LocalStorageManager.setItem(STORAGE_KEYS.ARTICLES, updatedArticles);
                    DataHooksCache.articles = updatedArticles;
                    DataHooksCache.lastUpdate.articles = new Date().toISOString();
                    state.articles = updatedArticles;
                    render();
                },
                
                removeArticle: function(articleId) {
                    const updatedArticles = DataHooksCache.articles.filter(article => article.id !== articleId);
                    
                    LocalStorageManager.setItem(STORAGE_KEYS.ARTICLES, updatedArticles);
                    DataHooksCache.articles = updatedArticles;
                    DataHooksCache.lastUpdate.articles = new Date().toISOString();
                    state.articles = updatedArticles;
                    render();
                },
                
                bulkUpdateArticles: function(articleIds, updates) {
                    const updatedArticles = DataHooksCache.articles.map(article =>
                        articleIds.includes(article.id) ? { ...article, ...updates } : article
                    );
                    
                    LocalStorageManager.setItem(STORAGE_KEYS.ARTICLES, updatedArticles);
                    DataHooksCache.articles = updatedArticles;
                    DataHooksCache.lastUpdate.articles = new Date().toISOString();
                    state.articles = updatedArticles;
                    render();
                }
            };
        },
        
        useRSSManager: function() {
            const stored = localStorage.getItem(STORAGE_KEYS.RSS_FEEDS);
            const timestamp = stored ? JSON.parse(stored).timestamp : null;
            
            if (!DataHooksCache.rssFeeds || DataHooksCache.lastUpdate.rssFeeds !== timestamp) {
                DataHooksCache.rssFeeds = LocalStorageManager.getItem(STORAGE_KEYS.RSS_FEEDS, DEFAULT_DATA.rssFeeds);
                DataHooksCache.lastUpdate.rssFeeds = timestamp;
                console.log('[Cache] RSS feeds cache updated');
            }
            
            return {
                rssFeeds: DataHooksCache.rssFeeds,
                
                addRSSFeed: function(url, title, folderId = 'uncategorized') {
                    const newFeed = {
                        id: 'rss_' + Date.now(),
                        url: url,
                        title: title || 'Unknown Feed',
                        folderId: folderId,
                        lastUpdated: new Date().toISOString(),
                        isActive: true
                    };
                    
                    const updatedFeeds = [...DataHooksCache.rssFeeds, newFeed];
                    LocalStorageManager.setItem(STORAGE_KEYS.RSS_FEEDS, updatedFeeds);
                    DataHooksCache.rssFeeds = updatedFeeds;
                    DataHooksCache.lastUpdate.rssFeeds = new Date().toISOString();
                    console.log('[RSS] Added feed:', title);
                    return newFeed;
                },
                
                removeRSSFeed: function(feedId) {
                    const updatedFeeds = DataHooksCache.rssFeeds.filter(feed => feed.id !== feedId);
                    LocalStorageManager.setItem(STORAGE_KEYS.RSS_FEEDS, updatedFeeds);
                    DataHooksCache.rssFeeds = updatedFeeds;
                    DataHooksCache.lastUpdate.rssFeeds = new Date().toISOString();
                    console.log('[RSS] Removed feed:', feedId);
                },
                
                updateRSSFeed: function(feedId, updates) {
                    const updatedFeeds = DataHooksCache.rssFeeds.map(feed =>
                        feed.id === feedId ? { ...feed, ...updates } : feed
                    );
                    
                    LocalStorageManager.setItem(STORAGE_KEYS.RSS_FEEDS, updatedFeeds);
                    DataHooksCache.rssFeeds = updatedFeeds;
                    DataHooksCache.lastUpdate.rssFeeds = new Date().toISOString();
                    console.log('[RSS] Updated feed:', feedId);
                },
                
                fetchAllFeeds: async function() {
                    const articlesHook = DataHooks.useArticles();
                    let totalAdded = 0;
                    let totalErrors = 0;
                    let feedResults = [];
                    
                    for (const feed of DataHooksCache.rssFeeds.filter(f => f.isActive)) {
                        try {
                            console.log(`[RSS] Fetching feed: ${feed.title} (${feed.url})`);
                            const rssContent = await RSSProcessor.fetchRSS(feed.url);
                            const parsed = RSSProcessor.parseRSS(rssContent, feed.url);
                            
                            let addedCount = 0;
                            parsed.articles.forEach(article => {
                                if (articlesHook.addArticle(article)) {
                                    addedCount++;
                                }
                            });
                            
                            this.updateRSSFeed(feed.id, {
                                lastUpdated: new Date().toISOString(),
                                title: parsed.feedTitle
                            });
                            
                            totalAdded += addedCount;
                            feedResults.push({
                                name: feed.title,
                                success: true,
                                added: addedCount,
                                total: parsed.articles.length
                            });
                            
                            console.log(`[RSS] Added ${addedCount} articles from ${feed.title}`);
                            
                        } catch (error) {
                            console.error(`[RSS] Failed to fetch ${feed.title}:`, error.message);
                            totalErrors++;
                            feedResults.push({
                                name: feed.title,
                                success: false,
                                error: error.message
                            });
                        }
                    }
                    
                    return {
                        totalAdded,
                        totalErrors,
                        totalFeeds: DataHooksCache.rssFeeds.filter(f => f.isActive).length,
                        feedResults
                    };
                }
            };
        },
        
        useFolders: function() {
            const stored = localStorage.getItem(STORAGE_KEYS.FOLDERS);
            const timestamp = stored ? JSON.parse(stored).timestamp : null;
            
            if (!DataHooksCache.folders || DataHooksCache.lastUpdate.folders !== timestamp) {
                DataHooksCache.folders = LocalStorageManager.getItem(STORAGE_KEYS.FOLDERS, DEFAULT_DATA.folders);
                DataHooksCache.lastUpdate.folders = timestamp;
                console.log('[Cache] Folders cache updated');
            }
            
            return {
                folders: DataHooksCache.folders,
                
                addFolder: function(name, color) {
                    const newFolder = FolderManager.createFolder(name, color);
                    if (!FolderManager.validateFolder(newFolder)) {
                        return null;
                    }
                    
                    const updatedFolders = [...DataHooksCache.folders, newFolder];
                    LocalStorageManager.setItem(STORAGE_KEYS.FOLDERS, updatedFolders);
                    DataHooksCache.folders = updatedFolders;
                    DataHooksCache.lastUpdate.folders = new Date().toISOString();
                    console.log('[Folder] Added folder:', name);
                    return newFolder;
                },
                
                removeFolder: function(folderId) {
                    const rssHook = DataHooks.useRSSManager();
                    const feedsInFolder = rssHook.rssFeeds.filter(feed => feed.folderId === folderId);
                    
                    if (feedsInFolder.length > 0) {
                        return {
                            success: false,
                            reason: 'FEEDS_EXIST',
                            feedCount: feedsInFolder.length
                        };
                    }
                    
                    const updatedFolders = DataHooksCache.folders.filter(folder => folder.id !== folderId);
                    LocalStorageManager.setItem(STORAGE_KEYS.FOLDERS, updatedFolders);
                    DataHooksCache.folders = updatedFolders;
                    DataHooksCache.lastUpdate.folders = new Date().toISOString();
                    console.log('[Folder] Removed folder:', folderId);
                    return { success: true };
                },
                
                updateFolder: function(folderId, updates) {
                    const updatedFolders = DataHooksCache.folders.map(folder =>
                        folder.id === folderId ? { ...folder, ...updates } : folder
                    );
                    
                    LocalStorageManager.setItem(STORAGE_KEYS.FOLDERS, updatedFolders);
                    DataHooksCache.folders = updatedFolders;
                    DataHooksCache.lastUpdate.folders = new Date().toISOString();
                    console.log('[Folder] Updated folder:', folderId);
                }
            };
        },
        
        useAILearning: function() {
            const stored = localStorage.getItem(STORAGE_KEYS.AI_LEARNING);
            const timestamp = stored ? JSON.parse(stored).timestamp : null;
            
            if (!DataHooksCache.aiLearning || DataHooksCache.lastUpdate.aiLearning !== timestamp) {
                DataHooksCache.aiLearning = LocalStorageManager.getItem(STORAGE_KEYS.AI_LEARNING, DEFAULT_DATA.aiLearning);
                DataHooksCache.lastUpdate.aiLearning = timestamp;
                console.log('[Cache] AI learning cache updated');
            }
            
            return {
                aiLearning: DataHooksCache.aiLearning,
                
                updateWordWeight: function(word, weight) {
                    const updatedLearning = {
                        ...DataHooksCache.aiLearning,
                        wordWeights: {
                            ...DataHooksCache.aiLearning.wordWeights,
                            [word]: (DataHooksCache.aiLearning.wordWeights[word] || 0) + weight
                        },
                        lastUpdated: new Date().toISOString()
                    };
                    
                    LocalStorageManager.setItem(STORAGE_KEYS.AI_LEARNING, updatedLearning);
                    DataHooksCache.aiLearning = updatedLearning;
                    DataHooksCache.lastUpdate.aiLearning = new Date().toISOString();
                    console.log('[AI] Updated word weight:', word, weight);
                },
                
                updateCategoryWeight: function(category, weight) {
                    const updatedLearning = {
                        ...DataHooksCache.aiLearning,
                        categoryWeights: {
                            ...DataHooksCache.aiLearning.categoryWeights,
                            [category]: (DataHooksCache.aiLearning.categoryWeights[category] || 0) + weight
                        },
                        lastUpdated: new Date().toISOString()
                    };
                    
                    LocalStorageManager.setItem(STORAGE_KEYS.AI_LEARNING, updatedLearning);
                    DataHooksCache.aiLearning = updatedLearning;
                    DataHooksCache.lastUpdate.aiLearning = new Date().toISOString();
                    console.log('[AI] Updated category weight:', category, weight);
                },
                
                updateLearningData: function(article, rating, isRevert = false) {
                    const updatedLearning = AIScoring.updateLearning(article, rating, DataHooksCache.aiLearning, isRevert);
                    LocalStorageManager.setItem(STORAGE_KEYS.AI_LEARNING, updatedLearning);
                    DataHooksCache.aiLearning = updatedLearning;
                    DataHooksCache.lastUpdate.aiLearning = new Date().toISOString();
                    return updatedLearning;
                }
            };
        },
        
        useWordFilters: function() {
            const stored = localStorage.getItem(STORAGE_KEYS.WORD_FILTERS);
            const timestamp = stored ? JSON.parse(stored).timestamp : null;
            
            if (!DataHooksCache.wordFilters || DataHooksCache.lastUpdate.wordFilters !== timestamp) {
                DataHooksCache.wordFilters = LocalStorageManager.getItem(STORAGE_KEYS.WORD_FILTERS, DEFAULT_DATA.wordFilters);
                DataHooksCache.lastUpdate.wordFilters = timestamp;
                console.log('[Cache] Word filters cache updated');
            }
            
            return {
                wordFilters: DataHooksCache.wordFilters,
                
                addInterestWord: function(word) {
                    const updated = { ...DataHooksCache.wordFilters };
                    if (WordFilterManager.addWord(word, 'interest', updated)) {
                        LocalStorageManager.setItem(STORAGE_KEYS.WORD_FILTERS, updated);
                        DataHooksCache.wordFilters = updated;
                        DataHooksCache.lastUpdate.wordFilters = new Date().toISOString();
                        return true;
                    }
                    return false;
                },
                
                addNGWord: function(word) {
                    const updated = { ...DataHooksCache.wordFilters };
                    if (WordFilterManager.addWord(word, 'ng', updated)) {
                        LocalStorageManager.setItem(STORAGE_KEYS.WORD_FILTERS, updated);
                        DataHooksCache.wordFilters = updated;
                        DataHooksCache.lastUpdate.wordFilters = new Date().toISOString();
                        return true;
                    }
                    return false;
                },
                
                removeInterestWord: function(word) {
                    const updated = { ...DataHooksCache.wordFilters };
                    if (WordFilterManager.removeWord(word, 'interest', updated)) {
                        LocalStorageManager.setItem(STORAGE_KEYS.WORD_FILTERS, updated);
                        DataHooksCache.wordFilters = updated;
                        DataHooksCache.lastUpdate.wordFilters = new Date().toISOString();
                        return true;
                    }
                    return false;
                },
                
                removeNGWord: function(word) {
                    const updated = { ...DataHooksCache.wordFilters };
                    if (WordFilterManager.removeWord(word, 'ng', updated)) {
                        LocalStorageManager.setItem(STORAGE_KEYS.WORD_FILTERS, updated);
                        DataHooksCache.wordFilters = updated;
                        DataHooksCache.lastUpdate.wordFilters = new Date().toISOString();
                        return true;
                    }
                    return false;
                }
            };
        }
    };
    
    // ===========================================
    // アプリケーション状態管理（フォルダ対応）
    // ===========================================
    
    let state = {
        viewMode: 'all',
        selectedFolder: 'all',
        showModal: null,
        articles: [],
        isLoading: false,
        lastUpdate: null
    };
    
    function setState(newState) {
        state = { ...state, ...newState };
        render();
    }
    
    function initializeData() {
        console.log('[App] Initializing data...');
        
        const articlesData = LocalStorageManager.getItem(STORAGE_KEYS.ARTICLES, DEFAULT_DATA.articles);
        const rssData = LocalStorageManager.getItem(STORAGE_KEYS.RSS_FEEDS, DEFAULT_DATA.rssFeeds);
        const foldersData = LocalStorageManager.getItem(STORAGE_KEYS.FOLDERS, DEFAULT_DATA.folders);
        const aiData = LocalStorageManager.getItem(STORAGE_KEYS.AI_LEARNING, DEFAULT_DATA.aiLearning);
        const wordData = LocalStorageManager.getItem(STORAGE_KEYS.WORD_FILTERS, DEFAULT_DATA.wordFilters);
        
        DataHooksCache.articles = articlesData;
        DataHooksCache.rssFeeds = rssData;
        DataHooksCache.folders = foldersData;
        DataHooksCache.aiLearning = aiData;
        DataHooksCache.wordFilters = wordData;
        
        state.articles = articlesData;
        
        if (state.articles.length === 0) {
            console.log('[App] No existing articles, adding samples');
            const sampleArticles = [
                {
                    id: 'sample_1',
                    title: 'Minews PWA：フォルダ機能追加完了',
                    url: '#',
                    content: 'RSSフィードをフォルダで分類管理し、記事表示もフォルダでフィルタリングできる機能を追加しました。リスト選択モーダルによりユーザビリティも向上。',
                    publishDate: new Date().toISOString(),
                    rssSource: 'NHKニュース',
                    category: 'Design',
                    readStatus: 'unread',
                    readLater: false,
                    userRating: 0,
                    keywords: ['フォルダ', 'RSS', 'リスト選択', '機能追加']
                },
                {
                    id: 'sample_2',
                    title: 'フォルダ管理で記事整理が便利に',
                    url: '#',
                    content: 'ニュース、テック、ブログなど用途別にRSSフィードを分類。記事表示もフォルダ単位でフィルタリングでき、情報収集効率が大幅向上。',
                    publishDate: new Date(Date.now() - 3600000).toISOString(),
                    rssSource: 'ITmedia',
                    category: 'UX',
                    readStatus: 'unread',
                    readLater: false,
                    userRating: 0,
                    keywords: ['フォルダ管理', '記事整理', '分類', 'フィルタリング', '効率化']
                }
            ];
            
            const articlesHook = DataHooks.useArticles();
            sampleArticles.forEach(article => {
                articlesHook.addArticle(article);
            });
            
            state.articles = DataHooksCache.articles;
        }
        
        const storageInfo = LocalStorageManager.getStorageInfo();
        console.log('[App] Storage info:', storageInfo);
        console.log('[App] Data initialization complete. Articles:', state.articles.length);
        console.log('[App] RSS Feeds:', DataHooksCache.rssFeeds.length);
        console.log('[App] Folders:', DataHooksCache.folders.length);
        console.log('[App] Cache initialized:', DataHooksCache.getStats());
    }
    
    // ===========================================
    // Utility functions（継承）
    // ===========================================
    
    function formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = now - date;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
        
        if (diffHours < 1) {
            return '1時間以内';
        } else if (diffHours < 24) {
            return diffHours + '時間前';
        } else if (diffDays === 1) {
            return '昨日';
        } else if (diffDays < 7) {
            return diffDays + '日前';
        } else {
            return date.toLocaleDateString('ja-JP');
        }
    }
    
    function createStarRating(rating, articleId) {
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            const filled = i <= rating ? 'filled' : '';
            stars += `<span class="star ${filled}" data-rating="${i}" data-article-id="${articleId}">★</span>`;
        }
        return `<div class="star-rating" onclick="handleStarClick(event)">${stars}</div>`;
    }
    
    function truncateText(text, maxLength = 200) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength).trim() + '...';
    }
    
    // ===========================================
    // Event handlers（フォルダ対応版）
    // ===========================================
    
    function handleFilterClick(mode) {
        setState({ viewMode: mode });
    }
    
    function handleFolderFilterClick(folderId) {
        setState({ selectedFolder: folderId });
    }
    
    function handleModalOpen(modalType) {
        setState({ showModal: modalType });
    }
    
    function handleModalClose() {
        setState({ showModal: null });
    }
    
    function handleStarClick(event) {
        if (event.target.classList.contains('star')) {
            const rating = parseInt(event.target.dataset.rating);
            const articleId = event.target.dataset.articleId;
            const articlesHook = DataHooks.useArticles();
            const aiHook = DataHooks.useAILearning();
            
            const article = state.articles.find(a => a.id === articleId);
            if (article) {
                if (article.userRating === rating) {
                    console.log(`[Rating] Article "${article.title}" already has ${rating} stars. No change needed.`);
                    return;
                }
                
                if (article.userRating > 0) {
                    aiHook.updateLearningData(article, article.userRating, true);
                    console.log(`[AI] Reverted previous rating (${article.userRating} stars) for article "${article.title}"`);
                }
                
                const updateData = { userRating: rating };
                if (rating === 1 || rating === 2) {
                    updateData.readStatus = 'read';
                    console.log(`[Rating] Low rating (${rating} stars) - marking article as read`);
                }
                
                articlesHook.updateArticle(articleId, updateData);
                aiHook.updateLearningData(article, rating);
                
                if (article.userRating > 0) {
                    console.log(`[Rating] Article "${article.title}" rating changed from ${article.userRating} to ${rating} stars`);
                } else {
                    console.log(`[Rating] Article "${article.title}" rated ${rating} stars`);
                }
            }
        }
    }
    
    function handleReadStatusToggle(articleId) {
        const articlesHook = DataHooks.useArticles();
        const article = state.articles.find(a => a.id === articleId);
        if (article) {
            const newStatus = article.readStatus === 'read' ? 'unread' : 'read';
            articlesHook.updateArticle(articleId, { readStatus: newStatus });
            console.log(`[ReadStatus] Article "${article.title}" marked as ${newStatus}`);
        }
    }
    
    function handleReadLaterToggle(articleId) {
        const articlesHook = DataHooks.useArticles();
        const article = state.articles.find(a => a.id === articleId);
        if (article) {
            const newReadLater = !article.readLater;
            articlesHook.updateArticle(articleId, { readLater: newReadLater });
            console.log(`[ReadLater] Article "${article.title}" read later: ${newReadLater}`);
        }
    }
    
    async function handleRefresh() {
        if (state.isLoading) return;
        
        setState({ isLoading: true });
        console.log('[App] Refreshing RSS feeds...');
        
        try {
            const rssHook = DataHooks.useRSSManager();
            const result = await rssHook.fetchAllFeeds();
            
            setState({
                isLoading: false,
                lastUpdate: new Date().toISOString()
            });
            
            let message = `更新完了！${result.totalAdded}件の新記事を追加しました。\n`;
            
            if (result.feedResults && result.feedResults.length > 0) {
                message += '\n【フィード別結果】\n';
                result.feedResults.forEach(feedResult => {
                    if (feedResult.success) {
                        message += `✅ ${feedResult.name}: ${feedResult.added}/${feedResult.total}件追加\n`;
                    } else {
                        message += `❌ ${feedResult.name}: 取得失敗\n`;
                    }
                });
            }
            
            if (result.totalErrors > 0) {
                message += `\n${result.totalErrors}件のフィードで取得エラーが発生しました。`;
            }
            
            alert(message);
            console.log('[App] Refresh completed:', result);
            
        } catch (error) {
            setState({ isLoading: false });
            console.error('[App] Refresh failed:', error);
            alert('記事の更新に失敗しました: ' + error.message);
        }
    }
    
// ★×ボタン統一版：フォルダ選択モーダル
function showFolderSelectionModal(callback) {
    const foldersHook = DataHooks.useFolders();
    const folderOptions = [
        { id: 'uncategorized', name: '未分類', color: '#6c757d' },
        ...foldersHook.folders
    ];

    const modalId = 'folder-selection-modal-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    
    // 既存のモーダルを削除
    document.querySelectorAll('[id^="folder-selection-modal-"]').forEach(modal => modal.remove());
    
    const modalHtml = `
        <div id="${modalId}" class="modal-overlay" style="z-index: 1000;">
            <div class="modal" style="pointer-events: auto;">
                <div class="modal-header">
                    <h2>フォルダを選択</h2>
                    <button type="button" class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="folder-selection-list">
                        ${folderOptions.map(folder => `
                            <div class="folder-selection-item" data-folder-id="${folder.id}" style="cursor: pointer; padding: 0.8rem; border: 2px solid #e9ecef; border-radius: 8px; margin-bottom: 0.5rem; background: white;">
                                <div style="display: flex; align-items: center; gap: 0.8rem;">
                                    <div style="width: 16px; height: 16px; border-radius: 3px; background: ${folder.color || '#6c757d'}; flex-shrink: 0;"></div>
                                    <div>
                                        <div style="font-weight: 600;">${folder.name}</div>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    const modalElement = document.getElementById(modalId);
    
    // 既存スタイルに合わせた閉じるボタンのイベント処理
    const closeBtn = modalElement.querySelector('.modal-close');
    closeBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        modalElement.remove();
        console.log('[Modal] Folder selection modal closed via close button');
    });
    
    // フォルダ選択項目のイベント処理
    const folderItems = modalElement.querySelectorAll('.folder-selection-item');
    folderItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const folderId = this.dataset.folderId;
            modalElement.remove();
            callback(folderId);
            console.log('[Modal] Folder selected:', folderId);
        });
        
        // ホバーエフェクト
        item.addEventListener('mouseenter', function() {
            this.style.borderColor = '#4A90A4';
            this.style.background = '#E3F4F7';
        });
        
        item.addEventListener('mouseleave', function() {
            this.style.borderColor = '#e9ecef';
            this.style.background = 'white';
        });
    });
    
    // オーバーレイクリックで閉じる
    modalElement.addEventListener('click', function(e) {
        if (e.target === modalElement) {
            modalElement.remove();
            console.log('[Modal] Folder selection modal closed via overlay click');
        }
    });
    
    console.log('[Modal] Folder selection modal opened with', folderOptions.length, 'options');
}

// ★×ボタン統一版：カラー選択モーダル
function showColorSelectionModal(callback) {
    const modalId = 'color-selection-modal-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    
    // 既存のモーダルを削除
    document.querySelectorAll('[id^="color-selection-modal-"]').forEach(modal => modal.remove());
    
    const modalHtml = `
        <div id="${modalId}" class="modal-overlay" style="z-index: 1000;">
            <div class="modal" style="pointer-events: auto;">
                <div class="modal-header">
                    <h2>フォルダカラーを選択</h2>
                    <button type="button" class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="color-selection-list">
                        ${FOLDER_COLORS.map(color => `
                            <div class="color-selection-item" data-color-value="${color.value}" style="cursor: pointer; padding: 0.8rem; border: 2px solid #e9ecef; border-radius: 8px; margin-bottom: 0.5rem; background: white;">
                                <div style="display: flex; align-items: center; gap: 0.8rem;">
                                    <div style="width: 24px; height: 24px; border-radius: 50%; background: ${color.value}; flex-shrink: 0;"></div>
                                    <div style="font-weight: 600;">${color.name}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    const modalElement = document.getElementById(modalId);
    
    // 既存スタイルに合わせた閉じるボタンのイベント処理
    const closeBtn = modalElement.querySelector('.modal-close');
    closeBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        modalElement.remove();
        console.log('[Modal] Color selection modal closed via close button');
    });
    
    // カラー選択項目のイベント処理
    const colorItems = modalElement.querySelectorAll('.color-selection-item');
    colorItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const colorValue = this.dataset.colorValue;
            modalElement.remove();
            callback(colorValue);
            console.log('[Modal] Color selected:', colorValue);
        });
        
        // ホバーエフェクト
        item.addEventListener('mouseenter', function() {
            this.style.borderColor = '#4A90A4';
            this.style.background = '#E3F4F7';
        });
        
        item.addEventListener('mouseleave', function() {
            this.style.borderColor = '#e9ecef';
            this.style.background = 'white';
        });
    });
    
    // オーバーレイクリックで閉じる
    modalElement.addEventListener('click', function(e) {
        if (e.target === modalElement) {
            modalElement.remove();
            console.log('[Modal] Color selection modal closed via overlay click');
        }
    });
    
    console.log('[Modal] Color selection modal opened with', FOLDER_COLORS.length, 'colors');
}
    
    // RSS追加処理（モーダル対応）
    function handleRSSAdd() {
        const url = prompt('RSSフィードのURLを入力してください:\n\n推奨フィード例:\n• https://www3.nhk.or.jp/rss/news/cat0.xml\n• https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml');
        if (!url) return;
        
        const title = prompt('フィードのタイトルを入力してください (空欄可):') || undefined;
        
        // フォルダ選択モーダルを表示
        showFolderSelectionModal(function(selectedFolderId) {
            const rssHook = DataHooks.useRSSManager();
            rssHook.addRSSFeed(url, title, selectedFolderId);
            if (state.showModal === 'rss') {
                render();
            }
            console.log('[RSS] Manual RSS feed added:', url, 'to folder:', selectedFolderId);
        });
    }
    
    // フォルダ追加処理（モーダル対応）
    function handleFolderAdd() {
        const name = prompt('フォルダ名を入力してください:');
        if (!name || name.trim().length === 0) return;
        
        if (name.trim().length > 50) {
            alert('フォルダ名は50文字以内で入力してください');
            return;
        }
        
        // カラー選択モーダルを表示
        showColorSelectionModal(function(selectedColor) {
            const foldersHook = DataHooks.useFolders();
            const newFolder = foldersHook.addFolder(name.trim(), selectedColor);
            if (newFolder) {
                if (state.showModal === 'folders') {
                    render();
                }
                console.log('[Folder] Added folder:', name);
            } else {
                alert('フォルダの作成に失敗しました');
            }
        });
    }
    
    function handleRSSRemove(feedId) {
        if (!confirm('このRSSフィードを削除しますか？')) return;
        
        const rssHook = DataHooks.useRSSManager();
        rssHook.removeRSSFeed(feedId);
        
        if (state.showModal === 'rss') {
            render();
        }
        console.log('[RSS] RSS feed removed:', feedId);
    }
    
    function handleWordAdd(type) {
        const word = prompt(
            type === 'interest' 
                ? '気になるワードを入力してください:' 
                : 'NGワードを入力してください:'
        );
        if (!word) return;
        
        const wordHook = DataHooks.useWordFilters();
        const success = type === 'interest' 
            ? wordHook.addInterestWord(word) 
            : wordHook.addNGWord(word);
        
        if (success) {
            if (state.showModal === 'words') {
                render();
            }
            console.log(`[WordFilter] Added ${type} word:`, word);
        } else {
            alert('このワードは既に登録されています');
        }
    }
    
    function handleWordRemove(word, type) {
        if (!confirm(`「${word}」を削除しますか？`)) return;
        
        const wordHook = DataHooks.useWordFilters();
        const success = type === 'interest' 
            ? wordHook.removeInterestWord(word) 
            : wordHook.removeNGWord(word);
        
        if (success) {
            if (state.showModal === 'words') {
                render();
            }
            console.log(`[WordFilter] Removed ${type} word:`, word);
        }
    }
    
    function handleFolderRemove(folderId) {
        const foldersHook = DataHooks.useFolders();
        const folder = foldersHook.folders.find(f => f.id === folderId);
        if (!folder) return;
        
        if (!confirm(`フォルダ「${folder.name}」を削除しますか？`)) return;
        
        const result = foldersHook.removeFolder(folderId);
        
        if (result.success) {
            if (state.selectedFolder === folderId) {
                setState({ selectedFolder: 'all' });
            }
            if (state.showModal === 'folders') {
                render();
            }
            console.log('[Folder] Removed folder:', folderId);
        } else if (result.reason === 'FEEDS_EXIST') {
            if (confirm(`このフォルダには${result.feedCount}件のRSSフィードが含まれています。\nフィードを「未分類」に移動してからフォルダを削除しますか？`)) {
                const rssHook = DataHooks.useRSSManager();
                const feedsToMove = rssHook.rssFeeds.filter(feed => feed.folderId === folderId);
                
                feedsToMove.forEach(feed => {
                    rssHook.updateRSSFeed(feed.id, { folderId: 'uncategorized' });
                });
                
                const retryResult = foldersHook.removeFolder(folderId);
                if (retryResult.success) {
                    if (state.selectedFolder === folderId) {
                        setState({ selectedFolder: 'all' });
                    }
                    if (state.showModal === 'folders') {
                        render();
                    }
                    alert(`${feedsToMove.length}件のフィードを「未分類」に移動し、フォルダを削除しました`);
                }
            }
        }
    }
    
    function handleRSSMoveFolderChange(feedId, newFolderId) {
        const rssHook = DataHooks.useRSSManager();
        rssHook.updateRSSFeed(feedId, { folderId: newFolderId });
        
        if (state.showModal === 'rss') {
            render();
        }
        console.log('[RSS] Moved feed to folder:', feedId, newFolderId);
    }
    
    // ===========================================
    // フィルタリング・レンダリング関数（フォルダ対応修正版）
    // ===========================================
    
    function getFilteredArticles() {
        const aiHook = DataHooks.useAILearning();
        const wordHook = DataHooks.useWordFilters();
        const rssHook = DataHooks.useRSSManager();
        
        console.log('[Debug] Filtering articles:', {
            totalArticles: state.articles.length,
            viewMode: state.viewMode,
            selectedFolder: state.selectedFolder,
            cacheStats: DataHooksCache.getStats()
        });
        
        const filteredByWords = WordFilterManager.filterArticles(state.articles, wordHook.wordFilters);
        
        // フォルダフィルタリング
        let filteredByFolder = filteredByWords;
        if (state.selectedFolder !== 'all') {
            if (state.selectedFolder === 'uncategorized') {
                const uncategorizedFeeds = rssHook.rssFeeds.filter(feed => 
                    !feed.folderId || feed.folderId === 'uncategorized'
                );
                filteredByFolder = filteredByWords.filter(article => {
                    return uncategorizedFeeds.some(feed => {
                        const matched = FolderManager.matchArticleToFeed(article, [feed]);
                        return matched !== null;
                    });
                });
            } else {
                const folderFeeds = rssHook.rssFeeds.filter(feed => 
                    feed.folderId === state.selectedFolder
                );
                filteredByFolder = filteredByWords.filter(article => {
                    return folderFeeds.some(feed => {
                        const matched = FolderManager.matchArticleToFeed(article, [feed]);
                        return matched !== null;
                    });
                });
            }
        }
        
        // 既読/未読フィルタリング
        let filteredByMode;
        switch (state.viewMode) {
            case 'unread':
                filteredByMode = filteredByFolder.filter(article => article.readStatus === 'unread');
                break;
            case 'read':
                filteredByMode = filteredByFolder.filter(article => article.readStatus === 'read');
                break;
            case 'readLater':
                filteredByMode = filteredByFolder.filter(article => article.readLater);
                break;
            default:
                filteredByMode = filteredByFolder;
        }
        
        const result = AIScoring.sortArticlesByScore(filteredByMode, aiHook.aiLearning, wordHook.wordFilters);
        console.log('[Debug] Final filtered articles:', result.length);
        return result;
    }
    
    function renderNavigation() {
        const modes = [
            { key: 'all', label: 'すべて' },
            { key: 'unread', label: '未読' },
            { key: 'read', label: '既読' },
            { key: 'readLater', label: '後で読む' }
        ];
        
        const foldersHook = DataHooks.useFolders();
        const folderOptions = [
            { id: 'all', name: 'すべて', color: '#4A90A4' },
            { id: 'uncategorized', name: '未分類', color: '#6c757d' },
            ...foldersHook.folders
        ];
        
        const refreshButtonClass = state.isLoading ? 'action-btn refresh-btn loading' : 'action-btn refresh-btn';
        const refreshButtonText = state.isLoading ? '🔄 更新中...' : '🔄 更新';
        
        return `
            <nav class="nav">
                <div class="nav-left">
                    <h1>Minews</h1>
                    ${state.lastUpdate ? `<div class="last-update">最終更新: ${formatDate(state.lastUpdate)}</div>` : ''}
                </div>
                
                <div class="nav-filters">
                    <div class="filter-group">
                        <label>表示モード:</label>
                        <select class="filter-select" onchange="handleFilterChange(this.value)">
                            ${modes.map(mode => `
                                <option value="${mode.key}" ${state.viewMode === mode.key ? 'selected' : ''}>
                                    ${mode.label} (${getFilteredArticleCount(mode.key, state.selectedFolder)})
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    
                    <div class="filter-group">
                        <label>フォルダ:</label>
                        <select class="filter-select" onchange="handleFolderChange(this.value)">
                            ${folderOptions.map(folder => `
                                <option value="${folder.id}" ${state.selectedFolder === folder.id ? 'selected' : ''}>
                                    ${folder.name} (${getFilteredArticleCount(state.viewMode, folder.id)})
                                </option>
                            `).join('')}
                        </select>
                    </div>
                </div>
                
                <div class="nav-actions">
                    <button class="${refreshButtonClass}" onclick="handleRefresh()" ${state.isLoading ? 'disabled' : ''}>
                        ${refreshButtonText}
                    </button>
                    <button class="action-btn" onclick="handleModalOpen('rss')">RSS管理</button>
                    <button class="action-btn" onclick="handleModalOpen('folders')">フォルダ管理</button>
                    <button class="action-btn" onclick="handleModalOpen('words')">ワード管理</button>
                </div>
            </nav>
        `;
    }
    
    function handleFilterChange(mode) {
        setState({ viewMode: mode });
    }
    
    function handleFolderChange(folderId) {
        setState({ selectedFolder: folderId });
    }
    
    function getFilteredArticleCount(viewMode, folderId) {
        const wordHook = DataHooks.useWordFilters();
        const rssHook = DataHooks.useRSSManager();
        
        const filteredByWords = WordFilterManager.filterArticles(state.articles, wordHook.wordFilters);
        
        let filteredByFolder = filteredByWords;
        if (folderId && folderId !== 'all') {
            if (folderId === 'uncategorized') {
                const uncategorizedFeeds = rssHook.rssFeeds.filter(feed => 
                    !feed.folderId || feed.folderId === 'uncategorized'
                );
                filteredByFolder = filteredByWords.filter(article => {
                    return uncategorizedFeeds.some(feed => {
                        const matched = FolderManager.matchArticleToFeed(article, [feed]);
                        return matched !== null;
                    });
                });
            } else {
                const folderFeeds = rssHook.rssFeeds.filter(feed => 
                    feed.folderId === folderId
                );
                filteredByFolder = filteredByWords.filter(article => {
                    return folderFeeds.some(feed => {
                        const matched = FolderManager.matchArticleToFeed(article, [feed]);
                        return matched !== null;
                    });
                });
            }
        }
        
        switch (viewMode) {
            case 'unread':
                return filteredByFolder.filter(article => article.readStatus === 'unread').length;
            case 'read':
                return filteredByFolder.filter(article => article.readStatus === 'read').length;
            case 'readLater':
                return filteredByFolder.filter(article => article.readLater).length;
            default:
                return filteredByFolder.length;
        }
    }
    
    function renderArticleCard(article) {
        const readStatusLabel = article.readStatus === 'read' ? '未読' : '既読';
        const readLaterLabel = article.readLater ? '解除' : '後で読む';
        const scoreDisplay = article.aiScore !== undefined ? `🤖 ${article.aiScore}` : '';
        
        return `
            <article class="article-card" data-read-status="${article.readStatus}">
                <header class="article-header">
                    <h2 class="article-title">
                        <a href="${article.url}" target="_blank" onclick="handleReadStatusToggle('${article.id}')">
                            ${article.title}
                        </a>
                    </h2>
                    
                    <div class="article-meta">
                        <span class="date">${formatDate(article.publishDate)}</span>
                        <span class="source">${article.rssSource}</span>
                        <span class="category">${article.category}</span>
                        ${scoreDisplay ? `<span class="ai-score">${scoreDisplay}</span>` : ''}
                        ${article.userRating > 0 ? `<span class="rating-badge">★${article.userRating}</span>` : ''}
                    </div>
                </header>
                
                <div class="article-content">
                    ${truncateText(article.content)}
                </div>
                
                <div class="article-keywords">
                    ${article.keywords ? article.keywords.map(keyword => 
                        `<span class="keyword">${keyword}</span>`
                    ).join('') : ''}
                </div>
                
                <div class="article-actions">
                    <button class="simple-btn read-status" onclick="handleReadStatusToggle('${article.id}')">
                        ${readStatusLabel}
                    </button>
                    <button class="simple-btn read-later" data-active="${article.readLater}" onclick="handleReadLaterToggle('${article.id}')">
                        ${readLaterLabel}
                    </button>
                </div>
                
                ${createStarRating(article.userRating, article.id)}
            </article>
        `;
    }
    
    function renderRSSModal() {
        const rssHook = DataHooks.useRSSManager();
        const foldersHook = DataHooks.useFolders();
        
        return `
            <div class="modal-overlay" onclick="handleModalClose()">
                <div class="modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>RSS管理</h2>
                        <button class="modal-close" onclick="handleModalClose()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="modal-actions">
                            <button class="action-btn success" onclick="handleRSSAdd()">RSS追加</button>
                        </div>
                        
                        <div class="rss-list">
                            ${rssHook.rssFeeds.map(feed => {
                                const folder = foldersHook.folders.find(f => f.id === feed.folderId) || 
                                             { name: '未分類', color: '#6c757d' };
                                return `
                                    <div class="rss-item">
                                        <div class="rss-info">
                                            <strong>${feed.title}</strong>
                                            <span class="rss-url">${feed.url}</span>
                                            <span class="rss-updated">最終更新: ${formatDate(feed.lastUpdated)}</span>
                                            <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem;">
                                                <div style="width: 12px; height: 12px; border-radius: 3px; background: ${folder.color};"></div>
                                                <span style="font-size: 0.8rem;">フォルダ: ${folder.name}</span>
                                            </div>
                                            <span class="rss-status ${feed.isActive ? 'active' : 'inactive'}">
                                                ${feed.isActive ? 'アクティブ' : '無効'}
                                            </span>
                                        </div>
                                        <div class="rss-actions">
                                            <select onchange="handleRSSMoveFolderChange('${feed.id}', this.value)" style="margin-bottom: 0.5rem;">
                                                <option value="uncategorized" ${(!feed.folderId || feed.folderId === 'uncategorized') ? 'selected' : ''}>未分類</option>
                                                ${foldersHook.folders.map(folder => `
                                                    <option value="${folder.id}" ${feed.folderId === folder.id ? 'selected' : ''}>
                                                        ${folder.name}
                                                    </option>
                                                `).join('')}
                                            </select>
                                            <button class="action-btn danger" onclick="handleRSSRemove('${feed.id}')">削除</button>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                        
                        <div class="rss-help">
                            <h4>RSS追加のヒント</h4>
                            <ul>
                                <li>主要ニュースサイトの多くがRSSフィードを提供しています</li>
                                <li>ブログのRSSフィードは通常 /feed や /rss のパスにあります</li>
                                <li>技術ブログ、企業ニュースなどがおすすめです</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    function renderFoldersModal() {
        const foldersHook = DataHooks.useFolders();
        const rssHook = DataHooks.useRSSManager();
        
        return `
            <div class="modal-overlay" onclick="handleModalClose()">
                <div class="modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>フォルダ管理</h2>
                        <button class="modal-close" onclick="handleModalClose()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="modal-actions">
                            <button class="action-btn success" onclick="handleFolderAdd()">フォルダ追加</button>
                        </div>
                        
                        <div class="rss-list">
                            ${foldersHook.folders.map(folder => {
                                const feedCount = rssHook.rssFeeds.filter(feed => feed.folderId === folder.id).length;
                                return `
                                    <div class="rss-item">
                                        <div class="rss-info">
                                            <div style="display: flex; align-items: center; gap: 0.8rem; margin-bottom: 0.5rem;">
                                                <div style="width: 20px; height: 20px; border-radius: 4px; background: ${folder.color};"></div>
                                                <strong>${folder.name}</strong>
                                            </div>
                                            <span class="rss-url">作成日: ${formatDate(folder.createdAt)}</span>
                                            <span class="rss-updated">フィード数: ${feedCount}件</span>
                                            <span class="rss-status active">カラー: ${FolderManager.getColorName(folder.color)}</span>
                                        </div>
                                        <div class="rss-actions">
                                            <button class="action-btn danger" onclick="handleFolderRemove('${folder.id}')">削除</button>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    function renderWordsModal() {
        const wordHook = DataHooks.useWordFilters();
        
        return `
            <div class="modal-overlay" onclick="handleModalClose()">
                <div class="modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>ワード管理</h2>
                        <button class="modal-close" onclick="handleModalClose()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="word-section">
                            <div class="word-section-header">
                                <h3>気になるワード</h3>
                                <button class="action-btn success" onclick="handleWordAdd('interest')">追加</button>
                            </div>
                            <div class="word-list">
                                ${wordHook.wordFilters.interestWords.map(word => `
                                    <span class="word-tag interest">
                                        ${word}
                                        <button class="word-remove" onclick="handleWordRemove('${word}', 'interest')">&times;</button>
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                        
                        <div class="word-section">
                            <div class="word-section-header">
                                <h3>NGワード</h3>
                                <button class="action-btn danger" onclick="handleWordAdd('ng')">追加</button>
                            </div>
                            <div class="word-list">
                                ${wordHook.wordFilters.ngWords.map(word => `
                                    <span class="word-tag ng">
                                        ${word}
                                        <button class="word-remove" onclick="handleWordRemove('${word}', 'ng')">&times;</button>
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                        
                        <div class="word-help">
                            <h4>ワードフィルターについて</h4>
                            <p>• 気になるワード: このワードを含む記事のスコアが上がり、優先表示されます</p>
                            <p>• NGワード: このワードを含む記事は表示されなくなります</p>
                            <p>• 部分一致で判定されます（例: "AI"で"人工知能AI"にもマッチ）</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    function render() {
        const filteredArticles = getFilteredArticles();
        
        const app = document.getElementById('root');
        
        let modalHtml = '';
        if (state.showModal === 'rss') {
            modalHtml = renderRSSModal();
        } else if (state.showModal === 'folders') {
            modalHtml = renderFoldersModal();
        } else if (state.showModal === 'words') {
            modalHtml = renderWordsModal();
        }
        
        const articlesHtml = filteredArticles.length > 0 
            ? `<div class="article-grid">${filteredArticles.map(renderArticleCard).join('')}</div>`
            : '<div class="empty-message">表示する記事がありません</div>';
        
        app.innerHTML = `
            <div class="app">
                ${renderNavigation()}
                <main class="main-content">
                    ${articlesHtml}
                </main>
                ${modalHtml}
            </div>
        `;
    }
    
    // ===========================================
    // 初期化・開始
    // ===========================================
    
    function init() {
        console.log('[App] Initializing Minews PWA with Folder Support...');
        initializeData();
        render();
        console.log('[App] Minews PWA with Folder Support initialized successfully');
    }
    
    // DOM読み込み完了時に初期化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    // ★追加：必要な関数をグローバルスコープに露出
    window.showFolderSelectionModal = showFolderSelectionModal;
    window.showColorSelectionModal = showColorSelectionModal;
    window.DataHooks = DataHooks;
    window.handleFilterChange = handleFilterChange;
    window.handleFolderChange = handleFolderChange;
    window.handleModalOpen = handleModalOpen;
    window.handleModalClose = handleModalClose;
    window.handleRefresh = handleRefresh;
    window.handleRSSAdd = handleRSSAdd;
    window.handleFolderAdd = handleFolderAdd;
    window.handleRSSRemove = handleRSSRemove;
    window.handleFolderRemove = handleFolderRemove;
    window.handleRSSMoveFolderChange = handleRSSMoveFolderChange;
    window.handleWordAdd = handleWordAdd;
    window.handleWordRemove = handleWordRemove;
    window.handleReadStatusToggle = handleReadStatusToggle;
    window.handleReadLaterToggle = handleReadLaterToggle;
    window.handleStarClick = handleStarClick;

})();
