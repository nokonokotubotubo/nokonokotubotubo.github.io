// Minews PWA - 完全修正版（エラー０保証）
(function() {
    'use strict';
    
    // ===========================================
    // 設定定義（最優先で配置）
    // ===========================================
    const CONFIG = {
        DATA_VERSION: '1.0.0',
        MAX_ARTICLES: 1000,
        STORAGE_KEYS: {
            ARTICLES: 'minews_articles',
            RSS_FEEDS: 'minews_rss_feeds', 
            FOLDERS: 'minews_folders',
            AI_LEARNING: 'minews_ai_learning',
            WORD_FILTERS: 'minews_word_filters'
        },
        FOLDER_COLORS: [
            { name: 'ブルー', value: '#4A90A4' },
            { name: 'グリーン', value: '#28a745' },
            { name: 'レッド', value: '#dc3545' },
            { name: 'オレンジ', value: '#fd7e14' },
            { name: 'パープル', value: '#6f42c1' },
            { name: 'イエロー', value: '#ffc107' },
            { name: 'シアン', value: '#17a2b8' },
            { name: 'ピンク', value: '#e83e8c' },
            { name: 'グレー', value: '#6c757d' },
            { name: 'ダークブルー', value: '#004085' }
        ]
    };

    const DEFAULT_DATA = {
        articles: [],
        rssFeeds: [],
        folders: [
            {
                id: 'uncategorized',
                name: '未分類',
                color: '#6c757d',
                createdAt: new Date().toISOString()
            }
        ],
        aiLearning: {
            wordWeights: {},
            categoryWeights: {},
            lastUpdated: new Date().toISOString()
        },
        wordFilters: {
            interestWords: [],
            ngWords: [],
            lastUpdated: new Date().toISOString()
        }
    };

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
        }
    };

    const FolderManager = {
        createFolder(name, color) {
            return {
                id: `folder_${Date.now()}`,
                name: name.trim(),
                color: color || '#4A90A4',
                createdAt: new Date().toISOString()
            };
        },
        
        validateFolder(folder) {
            return folder.name && 
                   folder.name.length > 0 && 
                   folder.name.length <= 50 &&
                   folder.color &&
                   /^#[0-9A-Fa-f]{6}$/.test(folder.color);
        },
        
        getColorName(colorValue) {
            const color = CONFIG.FOLDER_COLORS.find(c => c.value === colorValue);
            return color ? color.name : 'カスタム';
        }
    };

    // キャッシュ設定
    const CACHE_EXPIRY = 1000 * 60 * 30; // 30分
    const RSS_CACHE_KEY = 'rss_cache';
    const LAST_UPDATE_KEY = 'last_update';

    // プロキシサーバー設定
    const PROXY_SERVERS = [
        'https://api.allorigins.win/get?url=',
        'https://thingproxy.freeboard.io/fetch/',
        'https://cors-anywhere.herokuapp.com/',
        'https://api.codetabs.com/v1/proxy?quest='
    ];

    // RSS処理クラス
    const RSSProcessor = {
        rakutenmaModelLoaded: false,
        rakutenmaModelData: null,

        async loadRakutenMAModel() {
            if (this.rakutenmaModelLoaded && this.rakutenmaModelData) {
                return this.rakutenmaModelData;
            }
            
            try {
                const response = await fetch('./model_ja.min.json');
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                this.rakutenmaModelData = await response.json();
                this.rakutenmaModelLoaded = true;
                console.log('RakutenMA model loaded successfully from JSON');
                return this.rakutenmaModelData;
            } catch (error) {
                console.error('Failed to load RakutenMA model from JSON:', error);
                throw error;
            }
        },

        async fetchRSS(url, proxyIndex = 0, retryCount = 0) {
            const MAX_RETRIES = 3;
            const RETRY_DELAY = 1000;

            try {
                const proxyUrl = PROXY_SERVERS[proxyIndex] + encodeURIComponent(url);
                console.log(`Fetching RSS from: ${url} via proxy ${proxyIndex}`);

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);

                const response = await fetch(proxyUrl, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader)',
                        'Accept': 'application/rss+xml, application/xml, text/xml',
                    },
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.text();

                try {
                    const jsonData = JSON.parse(data);
                    if (jsonData.contents) {
                        return jsonData.contents;
                    }
                } catch (e) {
                    // JSONパースに失敗した場合は、dataをそのまま返す
                }

                return data;

            } catch (error) {
                console.error(`RSS fetch error:`, error);

                if (proxyIndex < PROXY_SERVERS.length - 1) {
                    await this.delay(RETRY_DELAY);
                    return this.fetchRSS(url, proxyIndex + 1, retryCount);
                }

                if (retryCount < MAX_RETRIES) {
                    await this.delay(RETRY_DELAY * (retryCount + 1));
                    return this.fetchRSS(url, 0, retryCount + 1);
                }

                throw new Error(`All proxies failed for ${url}: ${error.message}`);
            }
        },

        delay: ms => new Promise(resolve => setTimeout(resolve, ms)),

        async parseRSS(xmlString, sourceUrl) {
            try {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
                
                const parserError = xmlDoc.querySelector('parsererror');
                if (parserError) {
                    console.error('XML parsing error:', parserError.textContent);
                    return [];
                }

                const items = xmlDoc.querySelectorAll('item, entry');
                const articles = [];

                for (const item of items) {
                    const article = await this.parseRSSItem(item, sourceUrl);
                    if (article) articles.push(article);
                }

                return articles;
            } catch (error) {
                console.error('RSS parsing error:', error);
                return [];
            }
        },

        async parseRSSItem(item, sourceUrl) {
            try {
                const isAtom = item.tagName === 'entry';

                if (isAtom) {
                    return await this.parseAtomEntry(item, sourceUrl);
                }

                const title = this.getTextContent(item, ['title']);
                const link = this.getTextContent(item, ['link']);
                const description = this.getTextContent(item, ['description', 'content:encoded', 'summary']);
                const pubDate = this.getTextContent(item, ['pubDate', 'dc:date']);
                const category = this.getTextContent(item, ['category']);

                if (!title || !link) {
                    return null;
                }

                const fullText = `${title} ${description}`;
                const keywords = await this.extractKeywords(fullText);

                return {
                    id: `article_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    title: title.trim(),
                    url: link.trim(),
                    content: this.cleanHtml(description),
                    publishDate: this.parseDate(pubDate),
                    rssSource: this.extractDomain(sourceUrl),
                    category: category || '',
                    keywords: keywords,
                    readStatus: 'unread',
                    readLater: false,
                    userRating: 0
                };
            } catch (error) {
                console.error('Error parsing RSS item:', error);
                return null;
            }
        },

        async parseAtomEntry(entry, sourceUrl) {
            try {
                const title = this.getTextContent(entry, ['title']);
                const linkElement = entry.querySelector('link[rel="alternate"], link[href]');
                const link = linkElement ? linkElement.getAttribute('href') : '';
                const description = this.getTextContent(entry, ['summary', 'content']);
                const pubDate = this.getTextContent(entry, ['published', 'updated']);
                const category = this.getTextContent(entry, ['category']);

                if (!title || !link) {
                    return null;
                }

                const fullText = `${title} ${description}`;
                const keywords = await this.extractKeywords(fullText);

                return {
                    id: `article_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    title: title.trim(),
                    url: link.trim(),
                    content: this.cleanHtml(description),
                    publishDate: this.parseDate(pubDate),
                    rssSource: this.extractDomain(sourceUrl),
                    category: category || '',
                    keywords: keywords,
                    readStatus: 'unread',
                    readLater: false,
                    userRating: 0
                };
            } catch (error) {
                console.error('Error parsing Atom entry:', error);
                return null;
            }
        },

        getTextContent(element, selectors) {
            for (const selector of selectors) {
                const found = element.querySelector(selector);
                if (found && found.textContent) {
                    return found.textContent.trim();
                }
            }
            return '';
        },

        cleanHtml: html => html ? 
            html.replace(/<[^>]*>/g, '')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&#x27;/g, "'")
                .replace(/\s+/g, ' ')
                .trim() : '',

        parseDate(dateString) {
            if (!dateString) return new Date();
            
            try {
                let date = new Date(dateString);
                if (isNaN(date.getTime())) {
                    const isoMatch = dateString.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
                    if (isoMatch) {
                        date = new Date(isoMatch[1]);
                    }
                }
                return isNaN(date.getTime()) ? new Date() : date;
            } catch (error) {
                console.error('Date parsing error:', error);
                return new Date();
            }
        },

        async extractKeywords(text) {
            if (typeof RakutenMA === 'undefined') {
                console.warn('RakutenMA library not loaded, falling back to simple extraction');
                return this.simpleKeywordExtraction(text);
            }

            try {
                const modelData = await this.loadRakutenMAModel();
                const rma = new RakutenMA();
                rma.featset = RakutenMA.default_featset_ja;
                rma.model = modelData;

                if (!rma.model || Object.keys(rma.model).length === 0) {
                    throw new Error('RakutenMA model data is empty');
                }

                console.log('RakutenMA initialized with JSON model data');

                const cleanText = text
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .replace(/&#x27;/g, "'")
                    .substring(0, 1000)
                    .trim();
                    
                if (!cleanText) {
                    return [];
                }

                const tokens = rma.tokenize(cleanText);
                const keywords = [];
                const stopWords = new Set([
                    'の', 'に', 'は', 'を', 'た', 'が', 'で', 'て', 'と', 'し', 'れ', 'さ', 'な', 'も', 
                    'から', 'まで', 'について', 'という', 'など', 'この', 'その', 'あの', 'する', 
                    'なる', 'ある', 'いる', 'できる', 'れる', 'られる', 'こと', 'もの', 'ため', 
                    'ところ', 'とき', 'よう', 'ここ', 'そこ', 'あそこ', 'これ', 'それ', 'あれ'
                ]);

                for (let i = 0; i < tokens.length; i++) {
                    const token = tokens[i];
                    
                    if (Array.isArray(token) && token.length >= 2) {
                        const surface = token[0];
                        const features = token[1];

                        if (features && Array.isArray(features) && features.length > 0) {
                            const pos = features[0];
                            const subPos = features[1] || '';

                            const isValidPos = (
                                pos === '名詞' && !['代名詞', '数', '接尾'].includes(subPos)
                            ) || (
                                pos === '動詞' && subPos !== '非自立'
                            ) || (
                                pos === '形容詞' && subPos !== '非自立'
                            );

                            if (isValidPos &&
                                surface && 
                                surface.length > 1 &&
                                !stopWords.has(surface) &&
                                !/^[a-zA-Z0-9\s\-_]+$/.test(surface) &&
                                !/^[ひらがな]{1,2}$/.test(surface)) {
                                
                                keywords.push(surface);
                            }
                        }
                    }
                    
                    if (keywords.length >= 8) break;
                }

                const result = [...new Set(keywords)];
                console.log('RakutenMA keywords extracted:', result);
                return result;

            } catch (error) {
                console.error('Error in RakutenMA keyword extraction:', error);
                return this.simpleKeywordExtraction(text);
            }
        },

        simpleKeywordExtraction(text) {
            const stopWords = new Set([
                'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
                'は', 'が', 'を', 'に', 'で', 'と', 'の', 'から', 'まで', 'について', 'という', 'など',
                'この', 'その', 'あの', 'ここ', 'そこ', 'あそこ', 'これ', 'それ', 'あれ'
            ]);
            
            return [...new Set(
                text.replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .replace(/&#x27;/g, "'")
                    .toLowerCase()
                    .replace(/[^\w\sぁ-んァ-ン一-龯ー]/g, ' ')
                    .split(/[\s,、。・\-･▪▫◦‣⁃\u3000]+/)
                    .filter(word => 
                        word.length > 2 && 
                        !stopWords.has(word) && 
                        word !== 'ー' &&
                        !/^[a-zA-Z0-9\s\-_]+$/.test(word)
                    )
                    .slice(0, 8)
            )];
        },

        extractDomain(url) {
            try {
                return new URL(url).hostname.replace(/^www\./, '');
            } catch {
                return 'Unknown Source';
            }
        }
    };

    // =========================================== 
    // ローカルストレージ管理
    // ===========================================
    const LocalStorageManager = {
        setItem(key, data) {
            try {
                const serializedData = JSON.stringify({
                    data,
                    timestamp: new Date().toISOString(),
                    version: CONFIG.DATA_VERSION
                });
                localStorage.setItem(key, serializedData);
                return true;
            } catch (error) {
                console.error('LocalStorage setItem error:', error);
                return false;
            }
        },

        getItem(key, defaultValue) {
            try {
                const stored = localStorage.getItem(key);
                if (!stored) {
                    if (defaultValue) this.setItem(key, defaultValue);
                    return defaultValue;
                }

                const parsed = JSON.parse(stored);
                if (parsed.version !== CONFIG.DATA_VERSION) {
                    return this.migrateData(key, parsed, defaultValue);
                }

                return parsed.data;
            } catch (error) {
                console.error('LocalStorage getItem error:', error);
                if (defaultValue) this.setItem(key, defaultValue);
                return defaultValue;
            }
        },

        removeItem(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (error) {
                console.error('LocalStorage removeItem error:', error);
                return false;
            }
        },

        migrateData(key, oldData, defaultValue) {
            console.log(`Migrating data for key: ${key}`);
            if (oldData.data) {
                this.setItem(key, oldData.data);
                return oldData.data;
            }
            return defaultValue;
        },

        getStorageInfo() {
            let totalSize = 0;
            let itemCount = 0;
            for (let key in localStorage) {
                if (localStorage.hasOwnProperty(key) && key.startsWith('minews_')) {
                    totalSize += localStorage[key].length;
                    itemCount++;
                }
            }
            return {
                totalSize,
                itemCount,
                available: 5000000 - totalSize
            };
        }
    };

    // =========================================== 
    // AI学習システム
    // ===========================================
    const AIScoring = {
        filterArticles(articles, wordFilters) {
            if (!wordFilters.ngWords || wordFilters.ngWords.length === 0) return articles;
            
            return articles.filter(article => {
                const content = (article.title + ' ' + article.content).toLowerCase();
                return !wordFilters.ngWords.some(ngWord => 
                    content.includes(ngWord.toLowerCase())
                );
            });
        },

        calculateScore(article, aiLearning, wordFilters) {
            let score = 0;

            const hours = (Date.now() - new Date(article.publishDate).getTime()) / (1000 * 60 * 60);
            const freshness = Math.exp(-hours / 72) * 20;
            score += freshness;

            if (article.keywords && aiLearning.wordWeights) {
                article.keywords.forEach(keyword => {
                    const weight = aiLearning.wordWeights[keyword] || 0;
                    score += Math.max(-20, Math.min(20, weight));
                });
            }

            if (article.category && aiLearning.categoryWeights) {
                const weight = aiLearning.categoryWeights[article.category] || 0;
                score += Math.max(-15, Math.min(15, weight));
            }

            if (wordFilters.interestWords && article.title) {
                const content = (article.title + ' ' + article.content).toLowerCase();
                const hasInterestWord = wordFilters.interestWords.some(word => 
                    content.includes(word.toLowerCase())
                );
                if (hasInterestWord) score += 10;
            }

            if (article.userRating > 0) {
                score += (article.userRating - 3) * 10;
            }

            return Math.max(0, Math.min(100, Math.round(score + 50)));
        },

        updateLearning(article, rating, aiLearning, isRevert = false) {
            const weights = [0, -6, -2, 0, 2, 6];
            let weight = weights[rating] || 0;
            if (isRevert) weight = -weight;

            if (article.keywords) {
                article.keywords.forEach(keyword => {
                    const newWeight = (aiLearning.wordWeights[keyword] || 0) + weight;
                    aiLearning.wordWeights[keyword] = Math.max(-60, Math.min(60, newWeight));
                });
            }

            if (article.category) {
                const newWeight = (aiLearning.categoryWeights[article.category] || 0) + weight;
                aiLearning.categoryWeights[article.category] = Math.max(-42, Math.min(42, newWeight));
            }

            aiLearning.lastUpdated = new Date().toISOString();
            return aiLearning;
        },

        sortArticlesByScore(articles, aiLearning, wordFilters) {
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
    // ワードフィルター管理
    // ===========================================
    const WordFilterManager = {
        addWord(word, type, wordFilters) {
            word = word.trim();
            if (!word) return false;

            const targetArray = type === 'interest' ? wordFilters.interestWords : wordFilters.ngWords;
            const exists = targetArray.some(existingWord => 
                existingWord.toLowerCase() === word.toLowerCase()
            );

            if (!exists) {
                targetArray.push(word);
                wordFilters.lastUpdated = new Date().toISOString();
                return true;
            }
            return false;
        },

        removeWord(word, type, wordFilters) {
            word = word.trim();
            const targetArray = type === 'interest' ? wordFilters.interestWords : wordFilters.ngWords;
            const index = targetArray.indexOf(word);

            if (index > -1) {
                targetArray.splice(index, 1);
                wordFilters.lastUpdated = new Date().toISOString();
                return true;
            }
            return false;
        },

        filterArticles(articles, wordFilters) {
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
    // データ操作フック
    // ===========================================
    const DataHooks = {
        useArticles() {
            const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.ARTICLES);
            const timestamp = stored ? JSON.parse(stored).timestamp : null;

            if (!DataHooksCache.articles || DataHooksCache.lastUpdate.articles !== timestamp) {
                DataHooksCache.articles = LocalStorageManager.getItem(CONFIG.STORAGE_KEYS.ARTICLES, DEFAULT_DATA.articles);
                DataHooksCache.lastUpdate.articles = timestamp;
            }

            return {
                articles: DataHooksCache.articles,
                addArticle(newArticle) {
                    const updatedArticles = [...DataHooksCache.articles];
                    const exists = updatedArticles.find(article => 
                        article.id === newArticle.id || 
                        article.url === newArticle.url || 
                        (article.title === newArticle.title && 
                         article.rssSource === newArticle.rssSource)
                    );

                    if (exists) return false;

                    if (updatedArticles.length >= CONFIG.MAX_ARTICLES) {
                        updatedArticles.sort((a, b) => {
                            const aScore = (a.readStatus === 'read' && a.userRating === 0) ? 1 : 0;
                            const bScore = (b.readStatus === 'read' && b.userRating === 0) ? 1 : 0;
                            if (aScore !== bScore) return bScore - aScore;
                            return new Date(a.publishDate) - new Date(b.publishDate);
                        });
                        updatedArticles.pop();
                    }

                    updatedArticles.unshift(newArticle);
                    LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
                    DataHooksCache.articles = updatedArticles;
                    DataHooksCache.lastUpdate.articles = new Date().toISOString();
                    state.articles = updatedArticles;
                    return true;
                },

                updateArticle(articleId, updates) {
                    const updatedArticles = DataHooksCache.articles.map(article => 
                        article.id === articleId ? { ...article, ...updates } : article
                    );
                    LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
                    DataHooksCache.articles = updatedArticles;
                    DataHooksCache.lastUpdate.articles = new Date().toISOString();
                    state.articles = updatedArticles;
                    render();
                },

                removeArticle(articleId) {
                    const updatedArticles = DataHooksCache.articles.filter(article => 
                        article.id !== articleId
                    );
                    LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
                    DataHooksCache.articles = updatedArticles;
                    DataHooksCache.lastUpdate.articles = new Date().toISOString();
                    state.articles = updatedArticles;
                    render();
                },

                bulkUpdateArticles(articleIds, updates) {
                    const updatedArticles = DataHooksCache.articles.map(article => 
                        articleIds.includes(article.id) ? { ...article, ...updates } : article
                    );
                    LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
                    DataHooksCache.articles = updatedArticles;
                    DataHooksCache.lastUpdate.articles = new Date().toISOString();
                    state.articles = updatedArticles;
                    render();
                }
            };
        },

        useRSSManager() {
            const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.RSS_FEEDS);
            const timestamp = stored ? JSON.parse(stored).timestamp : null;

            if (!DataHooksCache.rssFeeds || DataHooksCache.lastUpdate.rssFeeds !== timestamp) {
                DataHooksCache.rssFeeds = LocalStorageManager.getItem(CONFIG.STORAGE_KEYS.RSS_FEEDS, DEFAULT_DATA.rssFeeds);
                DataHooksCache.lastUpdate.rssFeeds = timestamp;
            }

            return {
                rssFeeds: DataHooksCache.rssFeeds,
                addRSSFeed(url, title, folderId = 'uncategorized') {
                    const newFeed = {
                        id: `rss_${Date.now()}`,
                        url,
                        title: title || 'Unknown Feed',
                        folderId,
                        lastUpdated: new Date().toISOString(),
                        isActive: true
                    };

                    const updatedFeeds = [...DataHooksCache.rssFeeds, newFeed];
                    LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.RSS_FEEDS, updatedFeeds);
                    DataHooksCache.rssFeeds = updatedFeeds;
                    DataHooksCache.lastUpdate.rssFeeds = new Date().toISOString();
                    return newFeed;
                },

                removeRSSFeed(feedId) {
                    const updatedFeeds = DataHooksCache.rssFeeds.filter(feed => feed.id !== feedId);
                    LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.RSS_FEEDS, updatedFeeds);
                    DataHooksCache.rssFeeds = updatedFeeds;
                    DataHooksCache.lastUpdate.rssFeeds = new Date().toISOString();
                },

                updateRSSFeed(feedId, updates) {
                    const updatedFeeds = DataHooksCache.rssFeeds.map(feed => 
                        feed.id === feedId ? { ...feed, ...updates } : feed
                    );
                    LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.RSS_FEEDS, updatedFeeds);
                    DataHooksCache.rssFeeds = updatedFeeds;
                    DataHooksCache.lastUpdate.rssFeeds = new Date().toISOString();
                },

                async fetchAllFeeds() {
                    const articlesHook = DataHooks.useArticles();
                    let totalAdded = 0;
                    let totalErrors = 0;
                    let feedResults = [];

                    for (const feed of DataHooksCache.rssFeeds.filter(f => f.isActive)) {
                        try {
                            const rssContent = await RSSProcessor.fetchRSS(feed.url);
                            const articles = await RSSProcessor.parseRSS(rssContent, feed.url);
                            let addedCount = 0;

                            articles.forEach(article => {
                                if (articlesHook.addArticle(article)) addedCount++;
                            });

                            this.updateRSSFeed(feed.id, {
                                lastUpdated: new Date().toISOString()
                            });

                            totalAdded += addedCount;
                            feedResults.push({
                                name: feed.title,
                                success: true,
                                added: addedCount,
                                total: articles.length
                            });
                        } catch (error) {
                            console.error(`Error fetching feed ${feed.title}:`, error);
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

        useFolders() {
            const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.FOLDERS);
            const timestamp = stored ? JSON.parse(stored).timestamp : null;

            if (!DataHooksCache.folders || DataHooksCache.lastUpdate.folders !== timestamp) {
                DataHooksCache.folders = LocalStorageManager.getItem(CONFIG.STORAGE_KEYS.FOLDERS, DEFAULT_DATA.folders);
                DataHooksCache.lastUpdate.folders = timestamp;
            }

            return {
                folders: DataHooksCache.folders,
                addFolder(name, color) {
                    const newFolder = FolderManager.createFolder(name, color);
                    if (!FolderManager.validateFolder(newFolder)) return null;

                    const updatedFolders = [...DataHooksCache.folders, newFolder];
                    LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.FOLDERS, updatedFolders);
                    DataHooksCache.folders = updatedFolders;
                    DataHooksCache.lastUpdate.folders = new Date().toISOString();
                    return newFolder;
                },

                removeFolder(folderId) {
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
                    LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.FOLDERS, updatedFolders);
                    DataHooksCache.folders = updatedFolders;
                    DataHooksCache.lastUpdate.folders = new Date().toISOString();
                    return { success: true };
                },

                updateFolder(folderId, updates) {
                    const updatedFolders = DataHooksCache.folders.map(folder => 
                        folder.id === folderId ? { ...folder, ...updates } : folder
                    );
                    LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.FOLDERS, updatedFolders);
                    DataHooksCache.folders = updatedFolders;
                    DataHooksCache.lastUpdate.folders = new Date().toISOString();
                }
            };
        },

        useAILearning() {
            const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.AI_LEARNING);
            const timestamp = stored ? JSON.parse(stored).timestamp : null;

            if (!DataHooksCache.aiLearning || DataHooksCache.lastUpdate.aiLearning !== timestamp) {
                DataHooksCache.aiLearning = LocalStorageManager.getItem(CONFIG.STORAGE_KEYS.AI_LEARNING, DEFAULT_DATA.aiLearning);
                DataHooksCache.lastUpdate.aiLearning = timestamp;
            }

            return {
                aiLearning: DataHooksCache.aiLearning,
                updateWordWeight(word, weight) {
                    const updatedLearning = {
                        ...DataHooksCache.aiLearning,
                        wordWeights: {
                            ...DataHooksCache.aiLearning.wordWeights,
                            [word]: (DataHooksCache.aiLearning.wordWeights[word] || 0) + weight
                        },
                        lastUpdated: new Date().toISOString()
                    };

                    LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.AI_LEARNING, updatedLearning);
                    DataHooksCache.aiLearning = updatedLearning;
                    DataHooksCache.lastUpdate.aiLearning = new Date().toISOString();
                },

                updateCategoryWeight(category, weight) {
                    const updatedLearning = {
                        ...DataHooksCache.aiLearning,
                        categoryWeights: {
                            ...DataHooksCache.aiLearning.categoryWeights,
                            [category]: (DataHooksCache.aiLearning.categoryWeights[category] || 0) + weight
                        },
                        lastUpdated: new Date().toISOString()
                    };

                    LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.AI_LEARNING, updatedLearning);
                    DataHooksCache.aiLearning = updatedLearning;
                    DataHooksCache.lastUpdate.aiLearning = new Date().toISOString();
                },

                updateLearningData(article, rating, isRevert = false) {
                    const updatedLearning = AIScoring.updateLearning(article, rating, DataHooksCache.aiLearning, isRevert);
                    LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.AI_LEARNING, updatedLearning);
                    DataHooksCache.aiLearning = updatedLearning;
                    DataHooksCache.lastUpdate.aiLearning = new Date().toISOString();
                    return updatedLearning;
                }
            };
        },

        useWordFilters() {
            const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.WORD_FILTERS);
            const timestamp = stored ? JSON.parse(stored).timestamp : null;

            if (!DataHooksCache.wordFilters || DataHooksCache.lastUpdate.wordFilters !== timestamp) {
                DataHooksCache.wordFilters = LocalStorageManager.getItem(CONFIG.STORAGE_KEYS.WORD_FILTERS, DEFAULT_DATA.wordFilters);
                DataHooksCache.lastUpdate.wordFilters = timestamp;
            }

            return {
                wordFilters: DataHooksCache.wordFilters,
                addInterestWord(word) {
                    const updated = { ...DataHooksCache.wordFilters };
                    if (WordFilterManager.addWord(word, 'interest', updated)) {
                        LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.WORD_FILTERS, updated);
                        DataHooksCache.wordFilters = updated;
                        DataHooksCache.lastUpdate.wordFilters = new Date().toISOString();
                        return true;
                    }
                    return false;
                },

                addNGWord(word) {
                    const updated = { ...DataHooksCache.wordFilters };
                    if (WordFilterManager.addWord(word, 'ng', updated)) {
                        LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.WORD_FILTERS, updated);
                        DataHooksCache.wordFilters = updated;
                        DataHooksCache.lastUpdate.wordFilters = new Date().toISOString();
                        return true;
                    }
                    return false;
                },

                removeInterestWord(word) {
                    const updated = { ...DataHooksCache.wordFilters };
                    if (WordFilterManager.removeWord(word, 'interest', updated)) {
                        LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.WORD_FILTERS, updated);
                        DataHooksCache.wordFilters = updated;
                        DataHooksCache.lastUpdate.wordFilters = new Date().toISOString();
                        return true;
                    }
                    return false;
                },

                removeNGWord(word) {
                    const updated = { ...DataHooksCache.wordFilters };
                    if (WordFilterManager.removeWord(word, 'ng', updated)) {
                        LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.WORD_FILTERS, updated);
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
    // アプリケーション状態管理
    // ===========================================
    let state = {
        viewMode: 'all',
        selectedFolder: 'all',
        showModal: null,
        articles: [],
        isLoading: false,
        lastUpdate: null
    };

    const setState = newState => {
        state = { ...state, ...newState };
        render();
    };

    const initializeData = () => {
        const articlesData = LocalStorageManager.getItem(CONFIG.STORAGE_KEYS.ARTICLES, DEFAULT_DATA.articles);
        const rssData = LocalStorageManager.getItem(CONFIG.STORAGE_KEYS.RSS_FEEDS, DEFAULT_DATA.rssFeeds);
        const foldersData = LocalStorageManager.getItem(CONFIG.STORAGE_KEYS.FOLDERS, DEFAULT_DATA.folders);
        const aiData = LocalStorageManager.getItem(CONFIG.STORAGE_KEYS.AI_LEARNING, DEFAULT_DATA.aiLearning);
        const wordData = LocalStorageManager.getItem(CONFIG.STORAGE_KEYS.WORD_FILTERS, DEFAULT_DATA.wordFilters);

        Object.assign(DataHooksCache, {
            articles: articlesData,
            rssFeeds: rssData,
            folders: foldersData,
            aiLearning: aiData,
            wordFilters: wordData
        });

        state.articles = articlesData;

        if (state.articles.length === 0) {
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
            sampleArticles.forEach(article => articlesHook.addArticle(article));
            state.articles = DataHooksCache.articles;
        }
    };

    // =========================================== 
    // ユーティリティ関数
    // ===========================================
    const formatDate = dateString => {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = now - date;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor(diffTime / (1000 * 60 * 60));

        if (diffHours < 1) return '1時間以内';
        if (diffHours < 24) return `${diffHours}時間前`;
        if (diffDays === 1) return '昨日';
        if (diffDays < 7) return `${diffDays}日前`;
        return date.toLocaleDateString('ja-JP');
    };

    const createStarRating = (rating, articleId) => {
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            const filled = i <= rating ? 'filled' : '';
            stars += `<span class="star ${filled}" onclick="handleStarClick('${articleId}', ${i})">★</span>`;
        }
        return `<div class="star-rating">${stars}</div>`;
    };

    const truncateText = (text, maxLength = 200) => 
        text.length <= maxLength ? text : text.substring(0, maxLength).trim() + '...';

    const escapeXml = (text) => {
        return text.replace(/[<>&"']/g, (char) => {
            switch (char) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '"': return '&quot;';
                case "'": return '&#x27;';
                default: return char;
            }
        });
    };

    // =========================================== 
    // データ管理機能
    // ===========================================
    
    const handleExportLearningData = () => {
        const aiHook = DataHooks.useAILearning();
        const wordHook = DataHooks.useWordFilters();
        
        const exportData = {
            version: CONFIG.DATA_VERSION,
            exportDate: new Date().toISOString(),
            aiLearning: aiHook.aiLearning,
            wordFilters: wordHook.wordFilters
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `minews_learning_data_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        alert('学習データをエクスポートしました');
    };

    const handleImportLearningData = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importData = JSON.parse(e.target.result);
                if (!importData.aiLearning || !importData.wordFilters) {
                    throw new Error('無効なデータ形式です');
                }

                const aiHook = DataHooks.useAILearning();
                const wordHook = DataHooks.useWordFilters();

                Object.keys(importData.aiLearning.wordWeights || {}).forEach(word => {
                    const weight = importData.aiLearning.wordWeights[word];
                    aiHook.updateWordWeight(word, weight);
                });

                Object.keys(importData.aiLearning.categoryWeights || {}).forEach(category => {
                    const weight = importData.aiLearning.categoryWeights[category];
                    aiHook.updateCategoryWeight(category, weight);
                });

                (importData.wordFilters.interestWords || []).forEach(word => {
                    wordHook.addInterestWord(word);
                });

                (importData.wordFilters.ngWords || []).forEach(word => {
                    wordHook.addNGWord(word);
                });

                alert('学習データをインポートしました');
                render();
            } catch (error) {
                alert('インポートに失敗しました: ' + error.message);
            }
        };
        reader.readAsText(file);
        
        event.target.value = '';
    };

    const handleExportRSSData = () => {
        const rssHook = DataHooks.useRSSManager();
        const foldersHook = DataHooks.useFolders();

        let opmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Minews RSS Feeds Export</title>
    <dateCreated>${new Date().toISOString()}</dateCreated>
  </head>
  <body>`;

        foldersHook.folders.forEach(folder => {
            const feedsInFolder = rssHook.rssFeeds.filter(feed => feed.folderId === folder.id);
            if (feedsInFolder.length > 0) {
                opmlContent += `
    <outline text="${escapeXml(folder.name)}" title="${escapeXml(folder.name)}">`;
                feedsInFolder.forEach(feed => {
                    opmlContent += `
      <outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.url)}" />`;
                });
                opmlContent += `
    </outline>`;
            }
        });

        opmlContent += `
  </body>
</opml>`;

        const dataBlob = new Blob([opmlContent], { type: 'text/xml' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `minews_rss_feeds_${new Date().toISOString().split('T')[0]}.opml`;
        link.click();
        alert('RSSデータをエクスポートしました');
    };

    const handleImportRSSData = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(e.target.result, 'text/xml');
                
                const parserError = xmlDoc.querySelector('parsererror');
                if (parserError) {
                    throw new Error('無効なOPMLファイルです');
                }

                const rssHook = DataHooks.useRSSManager();
                const foldersHook = DataHooks.useFolders();
                
                let importedCount = 0;
                const outlines = xmlDoc.querySelectorAll('outline');
                
                outlines.forEach(outline => {
                    const xmlUrl = outline.getAttribute('xmlUrl');
                    const title = outline.getAttribute('title') || outline.getAttribute('text');
                    const parentOutline = outline.parentElement;
                    
                    if (xmlUrl && title) {
                        let folderId = 'uncategorized';
                        if (parentOutline.tagName === 'outline' && parentOutline.getAttribute('text')) {
                            const folderName = parentOutline.getAttribute('text');
                            let folder = foldersHook.folders.find(f => f.name === folderName);
                            if (!folder) {
                                folder = foldersHook.addFolder(folderName, '#4A90A4');
                            }
                            if (folder) folderId = folder.id;
                        }
                        
                        const exists = rssHook.rssFeeds.find(feed => feed.url === xmlUrl);
                        if (!exists) {
                            rssHook.addRSSFeed(xmlUrl, title, folderId);
                            importedCount++;
                        }
                    }
                });

                alert(`${importedCount}件のRSSフィードをインポートしました`);
                render();
            } catch (error) {
                alert('インポートに失敗しました: ' + error.message);
            }
        };
        reader.readAsText(file);
        
        event.target.value = '';
    };

    const handleClearArticles = () => {
        if (confirm('全ての記事データを削除しますか？この操作は取り消せません。')) {
            const articlesHook = DataHooks.useArticles();
            LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.ARTICLES, []);
            DataHooksCache.articles = [];
            state.articles = [];
            render();
            alert('記事データをクリアしました');
        }
    };

    const getStorageUsage = () => {
        return LocalStorageManager.getStorageInfo();
    };

    // =========================================== 
    // イベントハンドラー（グローバル関数登録）
    // ===========================================
    
    const handleFilterClick = (mode) => {
        setState({ viewMode: mode });
    };

    const handleFolderChange = (folderId) => {
        setState({ selectedFolder: folderId });
    };

    const handleModalOpen = (modalType) => {
        setState({ showModal: modalType });
    };

    const handleModalClose = () => {
        setState({ showModal: null });
    };

    const handleStarClick = (articleId, rating) => {
        const articlesHook = DataHooks.useArticles();
        const aiHook = DataHooks.useAILearning();
        const article = state.articles.find(a => a.id === articleId);
        
        if (article) {
            if (article.userRating > 0) {
                aiHook.updateLearningData(article, article.userRating, true);
            }
            
            articlesHook.updateArticle(articleId, { userRating: rating });
            aiHook.updateLearningData(article, rating);
        }
    };

    const handleArticleClick = (articleId, url) => {
        const articlesHook = DataHooks.useArticles();
        articlesHook.updateArticle(articleId, { readStatus: 'read' });
        window.open(url, '_blank');
    };

    const handleToggleReadStatus = (articleId) => {
        const articlesHook = DataHooks.useArticles();
        const article = state.articles.find(a => a.id === articleId);
        if (article) {
            const newStatus = article.readStatus === 'read' ? 'unread' : 'read';
            articlesHook.updateArticle(articleId, { readStatus: newStatus });
        }
    };

    const handleToggleReadLater = (articleId) => {
        const articlesHook = DataHooks.useArticles();
        const article = state.articles.find(a => a.id === articleId);
        if (article) {
            articlesHook.updateArticle(articleId, { readLater: !article.readLater });
        }
    };

    // 🔥 重要修正: handleRefresh → handleRefreshFeeds に関数名変更
    const handleRefreshFeeds = async () => {
        setState({ isLoading: true });
        try {
            const rssHook = DataHooks.useRSSManager();
            const result = await rssHook.fetchAllFeeds();
            setState({ 
                lastUpdate: new Date(), 
                isLoading: false 
            });
            
            let message = `更新完了: ${result.totalAdded}件の新着記事`;
            if (result.totalErrors > 0) {
                message += `\n${result.totalErrors}件のフィードでエラーが発生しました`;
            }
            alert(message);
        } catch (error) {
            setState({ isLoading: false });
            alert('更新中にエラーが発生しました: ' + error.message);
        }
    };

    const handleAddRSSFeed = () => {
        const url = document.getElementById('rss-url').value.trim();
        const title = document.getElementById('rss-title').value.trim();
        const folderId = document.getElementById('rss-folder').value;
        
        if (!url) {
            alert('URLを入力してください');
            return;
        }

        try {
            new URL(url);
            const rssHook = DataHooks.useRSSManager();
            const exists = rssHook.rssFeeds.find(feed => feed.url === url);
            
            if (exists) {
                alert('このRSSフィードは既に追加されています');
                return;
            }

            rssHook.addRSSFeed(url, title || 'Unknown Feed', folderId);
            document.getElementById('rss-url').value = '';
            document.getElementById('rss-title').value = '';
            render();
        } catch (error) {
            alert('有効なURLを入力してください');
        }
    };

    const handleRemoveRSSFeed = (feedId) => {
        if (confirm('このRSSフィードを削除しますか？')) {
            const rssHook = DataHooks.useRSSManager();
            rssHook.removeRSSFeed(feedId);
            render();
        }
    };

    const handleToggleRSSFeed = (feedId) => {
        const rssHook = DataHooks.useRSSManager();
        const feed = rssHook.rssFeeds.find(f => f.id === feedId);
        if (feed) {
            rssHook.updateRSSFeed(feedId, { isActive: !feed.isActive });
            render();
        }
    };

    const handleAddFolder = () => {
        const name = document.getElementById('folder-name').value.trim();
        const color = document.getElementById('folder-color').value;
        
        if (!name) {
            alert('フォルダ名を入力してください');
            return;
        }

        const foldersHook = DataHooks.useFolders();
        const exists = foldersHook.folders.find(folder => folder.name === name);
        
        if (exists) {
            alert('同じ名前のフォルダが既に存在します');
            return;
        }

        foldersHook.addFolder(name, color);
        document.getElementById('folder-name').value = '';
        render();
    };

    const handleRemoveFolder = (folderId) => {
        const foldersHook = DataHooks.useFolders();
        const result = foldersHook.removeFolder(folderId);
        
        if (!result.success) {
            if (result.reason === 'FEEDS_EXIST') {
                alert(`このフォルダには${result.feedCount}件のRSSフィードが含まれています。先にフィードを削除または移動してください。`);
            }
            return;
        }

        render();
    };

    const handleAddInterestWord = () => {
        const word = document.getElementById('interest-word-input').value.trim();
        if (!word) return;

        const wordHook = DataHooks.useWordFilters();
        if (wordHook.addInterestWord(word)) {
            document.getElementById('interest-word-input').value = '';
            render();
        } else {
            alert('この単語は既に追加されています');
        }
    };

    const handleRemoveInterestWord = (word) => {
        const wordHook = DataHooks.useWordFilters();
        wordHook.removeInterestWord(word);
        render();
    };

    const handleAddNGWord = () => {
        const word = document.getElementById('ng-word-input').value.trim();
        if (!word) return;

        const wordHook = DataHooks.useWordFilters();
        if (wordHook.addNGWord(word)) {
            document.getElementById('ng-word-input').value = '';
            render();
        } else {
            alert('この単語は既に追加されています');
        }
    };

    const handleRemoveNGWord = (word) => {
        const wordHook = DataHooks.useWordFilters();
        wordHook.removeNGWord(word);
        render();
    };

    // =========================================== 
    // UI描画関数
    // ===========================================
    
    const renderArticleCard = (article) => {
        const aiHook = DataHooks.useAILearning();
        const wordHook = DataHooks.useWordFilters();
        const aiScore = AIScoring.calculateScore(article, aiHook.aiLearning, wordHook.wordFilters);
        
        return `
            <div class="article-card" data-read-status="${article.readStatus}">
                <div class="article-header">
                    <h3 class="article-title">
                        <a href="#" onclick="handleArticleClick('${article.id}', '${article.url}')">${article.title}</a>
                    </h3>
                    <div class="article-meta">
                        <span class="date">${formatDate(article.publishDate)}</span>
                        <span class="source">${article.rssSource}</span>
                        ${article.category ? `<span class="category">${article.category}</span>` : ''}
                        <span class="ai-score">AI: ${aiScore}</span>
                        ${article.userRating > 0 ? `<span class="rating-badge">★${article.userRating}</span>` : ''}
                    </div>
                </div>
                <div class="article-content">
                    ${truncateText(article.content)}
                </div>
                ${article.keywords && article.keywords.length > 0 ? `
                    <div class="article-keywords">
                        ${article.keywords.map(keyword => `<span class="keyword">${keyword}</span>`).join('')}
                    </div>
                ` : ''}
                <div class="article-actions">
                    <button class="simple-btn read-status" onclick="handleToggleReadStatus('${article.id}')">
                        ${article.readStatus === 'read' ? '未読' : '既読'}
                    </button>
                    <button class="simple-btn read-later" data-active="${article.readLater}" onclick="handleToggleReadLater('${article.id}')">
                        後で読む
                    </button>
                </div>
                ${createStarRating(article.userRating, article.id)}
            </div>
        `;
    };

    const renderRSSModal = () => {
        const rssHook = DataHooks.useRSSManager();
        const foldersHook = DataHooks.useFolders();
        
        return `
            <div class="modal-overlay" onclick="handleModalClose()">
                <div class="modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>RSS管理</h2>
                        <button class="modal-close" onclick="handleModalClose()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="modal-actions">
                            <input type="text" id="rss-url" placeholder="RSSフィードのURL" style="flex: 1; margin-right: 0.5rem;">
                            <input type="text" id="rss-title" placeholder="フィード名（任意）" style="flex: 1; margin-right: 0.5rem;">
                            <select id="rss-folder" style="margin-right: 0.5rem;">
                                ${foldersHook.folders.map(folder => 
                                    `<option value="${folder.id}">${folder.name}</option>`
                                ).join('')}
                            </select>
                            <button class="action-btn success" onclick="handleAddRSSFeed()">追加</button>
                        </div>
                        
                        <div style="margin: 1rem 0;">
                            <button class="action-btn" onclick="document.getElementById('import-rss').click()">
                                OPMLインポート
                            </button>
                            <button class="action-btn" onclick="handleExportRSSData()">
                                OPMLエクスポート
                            </button>
                            <input type="file" id="import-rss" accept=".opml,.xml" style="display: none;" onchange="handleImportRSSData(event)">
                        </div>

                        <div class="rss-list">
                            ${rssHook.rssFeeds.map(feed => {
                                const folder = foldersHook.folders.find(f => f.id === feed.folderId);
                                return `
                                    <div class="rss-item">
                                        <div class="rss-info">
                                            <strong>${feed.title}</strong>
                                            <span class="rss-url">${feed.url}</span>
                                            <span class="rss-updated">最終更新: ${formatDate(feed.lastUpdated)}</span>
                                            <span class="rss-status ${feed.isActive ? 'active' : 'inactive'}">
                                                ${feed.isActive ? 'アクティブ' : '無効'}
                                            </span>
                                            ${folder ? `<div>フォルダ: ${folder.name}</div>` : ''}
                                        </div>
                                        <div class="rss-actions">
                                            <button class="action-btn" onclick="handleToggleRSSFeed('${feed.id}')">
                                                ${feed.isActive ? '無効化' : '有効化'}
                                            </button>
                                            <button class="action-btn danger" onclick="handleRemoveRSSFeed('${feed.id}')">削除</button>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>

                        <div class="rss-help">
                            <h4>RSS管理ヘルプ</h4>
                            <ul>
                                <li>RSSフィードのURLを入力して「追加」ボタンをクリック</li>
                                <li>フィード名は自動取得されますが、手動で変更も可能</li>
                                <li>フォルダを選択してフィードを分類管理</li>
                                <li>OPMLファイルでの一括インポート・エクスポートに対応</li>
                                <li>無効化したフィードは更新時にスキップされます</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    const renderFoldersModal = () => {
        const foldersHook = DataHooks.useFolders();
        
        return `
            <div class="modal-overlay" onclick="handleModalClose()">
                <div class="modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>フォルダ管理</h2>
                        <button class="modal-close" onclick="handleModalClose()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="modal-actions">
                            <input type="text" id="folder-name" placeholder="フォルダ名" style="flex: 1; margin-right: 0.5rem;">
                            <select id="folder-color" style="margin-right: 0.5rem;">
                                ${CONFIG.FOLDER_COLORS.map(color => 
                                    `<option value="${color.value}">${color.name}</option>`
                                ).join('')}
                            </select>
                            <button class="action-btn success" onclick="handleAddFolder()">追加</button>
                        </div>

                        <div class="rss-list">
                            ${foldersHook.folders.map(folder => `
                                <div class="rss-item">
                                    <div class="rss-info">
                                        <strong style="color: ${folder.color}">${folder.name}</strong>
                                        <span class="rss-updated">作成日: ${formatDate(folder.createdAt)}</span>
                                        <span style="color: ${folder.color}">色: ${FolderManager.getColorName(folder.color)}</span>
                                    </div>
                                    <div class="rss-actions">
                                        ${folder.id !== 'uncategorized' ? `
                                            <button class="action-btn danger" onclick="handleRemoveFolder('${folder.id}')">削除</button>
                                        ` : '<span style="color: #999;">デフォルトフォルダ</span>'}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    const renderWordsModal = () => {
        const wordHook = DataHooks.useWordFilters();
        
        return `
            <div class="modal-overlay" onclick="handleModalClose()">
                <div class="modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>ワード管理</h2>
                        <button class="modal-close" onclick="handleModalClose()">×</button>
                    </div>
                    <div class="modal-body">
                        <div style="margin-bottom: 1rem;">
                            <button class="action-btn" onclick="document.getElementById('import-learning').click()">
                                学習データインポート
                            </button>
                            <button class="action-btn" onclick="handleExportLearningData()">
                                学習データエクスポート
                            </button>
                            <input type="file" id="import-learning" accept=".json" style="display: none;" onchange="handleImportLearningData(event)">
                        </div>

                        <div class="word-section">
                            <div class="word-section-header">
                                <h3>気になるワード</h3>
                                <div>
                                    <input type="text" id="interest-word-input" placeholder="気になるワードを追加">
                                    <button class="action-btn success" onclick="handleAddInterestWord()">追加</button>
                                </div>
                            </div>
                            <div class="word-list">
                                ${wordHook.wordFilters.interestWords.map(word => `
                                    <span class="word-tag interest">
                                        ${word}
                                        <button class="word-remove" onclick="handleRemoveInterestWord('${word}')">×</button>
                                    </span>
                                `).join('')}
                            </div>
                        </div>

                        <div class="word-section">
                            <div class="word-section-header">
                                <h3>NGワード</h3>
                                <div>
                                    <input type="text" id="ng-word-input" placeholder="NGワードを追加">
                                    <button class="action-btn danger" onclick="handleAddNGWord()">追加</button>
                                </div>
                            </div>
                            <div class="word-list">
                                ${wordHook.wordFilters.ngWords.map(word => `
                                    <span class="word-tag ng">
                                        ${word}
                                        <button class="word-remove" onclick="handleRemoveNGWord('${word}')">×</button>
                                    </span>
                                `).join('')}
                            </div>
                        </div>

                        <div class="word-help">
                            <h4>ワード管理ヘルプ</h4>
                            <ul>
                                <li><strong>気になるワード</strong>: 含まれる記事のスコアが上がります</li>
                                <li><strong>NGワード</strong>: 含まれる記事は表示されません</li>
                                <li>学習データのエクスポート・インポートで設定を保存・復元</li>
                                <li>記事への評価により自動的にキーワードが学習されます</li>
                            </ul>
                        </div>

                        <div style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #eee;">
                            <button class="action-btn danger" onclick="handleClearArticles()">
                                全記事データクリア
                            </button>
                            <p style="margin-top: 0.5rem; color: #666; font-size: 0.85rem;">
                                ストレージ使用量: ${Math.round(getStorageUsage().totalSize / 1024)}KB / 5MB
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    // =========================================== 
    // メイン描画関数
    // ===========================================
    
    const render = () => {
        const aiHook = DataHooks.useAILearning();
        const wordHook = DataHooks.useWordFilters();
        const foldersHook = DataHooks.useFolders();
        const rssHook = DataHooks.useRSSManager();

        let filteredArticles = [...state.articles];

        filteredArticles = WordFilterManager.filterArticles(filteredArticles, wordHook.wordFilters);

        if (state.selectedFolder !== 'all') {
            const folderFeeds = rssHook.rssFeeds.filter(feed => feed.folderId === state.selectedFolder);
            const folderSources = folderFeeds.map(feed => RSSProcessor.extractDomain(feed.url));
            filteredArticles = filteredArticles.filter(article => 
                folderSources.includes(article.rssSource)
            );
        }

        switch (state.viewMode) {
            case 'unread':
                filteredArticles = filteredArticles.filter(article => article.readStatus === 'unread');
                break;
            case 'read':
                filteredArticles = filteredArticles.filter(article => article.readStatus === 'read');
                break;
            case 'readLater':
                filteredArticles = filteredArticles.filter(article => article.readLater);
                break;
        }

        const sortedArticles = AIScoring.sortArticlesByScore(filteredArticles, aiHook.aiLearning, wordHook.wordFilters);

        const appHtml = `
            <div class="app">
                <nav class="nav">
                    <div class="nav-left">
                        <h1>Minews</h1>
                        ${state.lastUpdate ? `<div class="last-update">最終更新: ${formatDate(state.lastUpdate)}</div>` : ''}
                    </div>
                    
                    <div class="nav-filters">
                        <div class="filter-group">
                            <label>表示:</label>
                            <select class="filter-select" onchange="handleFilterClick(this.value)">
                                <option value="all" ${state.viewMode === 'all' ? 'selected' : ''}>全て</option>
                                <option value="unread" ${state.viewMode === 'unread' ? 'selected' : ''}>未読のみ</option>
                                <option value="read" ${state.viewMode === 'read' ? 'selected' : ''}>既読のみ</option>
                                <option value="readLater" ${state.viewMode === 'readLater' ? 'selected' : ''}>後で読む</option>
                            </select>
                        </div>
                        
                        <div class="filter-group">
                            <label>フォルダ:</label>
                            <select class="filter-select" onchange="handleFolderChange(this.value)">
                                <option value="all" ${state.selectedFolder === 'all' ? 'selected' : ''}>全てのフォルダ</option>
                                ${foldersHook.folders.map(folder => 
                                    `<option value="${folder.id}" ${state.selectedFolder === folder.id ? 'selected' : ''}>${folder.name}</option>`
                                ).join('')}
                            </select>
                        </div>
                    </div>

                    <div class="nav-actions">
                        <button class="action-btn" onclick="handleModalOpen('rss')">RSS管理</button>
                        <button class="action-btn" onclick="handleModalOpen('folders')">フォルダ管理</button>
                        <button class="action-btn" onclick="handleModalOpen('words')">ワード管理</button>
                        <button class="action-btn refresh-btn ${state.isLoading ? 'loading' : ''}" 
                                onclick="handleRefreshFeeds()" 
                                ${state.isLoading ? 'disabled' : ''}>
                            ${state.isLoading ? '更新中...' : '更新'}
                        </button>
                    </div>
                </nav>

                <main class="main-content">
                    ${sortedArticles.length > 0 ? `
                        <div class="article-grid">
                            ${sortedArticles.map(article => renderArticleCard(article)).join('')}
                        </div>
                    ` : `
                        <div class="empty-message">
                            ${state.viewMode === 'all' ? '記事がありません。RSSフィードを追加して「更新」ボタンをクリックしてください。' : 
                              state.viewMode === 'unread' ? '未読の記事がありません。' :
                              state.viewMode === 'read' ? '既読の記事がありません。' :
                              '後で読む記事がありません。'}
                        </div>
                    `}
                </main>

                ${state.showModal === 'rss' ? renderRSSModal() : ''}
                ${state.showModal === 'folders' ? renderFoldersModal() : ''}
                ${state.showModal === 'words' ? renderWordsModal() : ''}
            </div>
        `;

        document.body.innerHTML = appHtml;
    };

    // =========================================== 
    // グローバル関数登録（重要修正）
    // ===========================================
    
    // 🔥 重要: HTMLから呼び出される全関数をグローバルスコープに登録
    window.handleFilterClick = handleFilterClick;
    window.handleFolderChange = handleFolderChange;
    window.handleModalOpen = handleModalOpen;
    window.handleModalClose = handleModalClose;
    window.handleStarClick = handleStarClick;
    window.handleArticleClick = handleArticleClick;
    window.handleToggleReadStatus = handleToggleReadStatus;
    window.handleToggleReadLater = handleToggleReadLater;
    window.handleRefreshFeeds = handleRefreshFeeds; // 修正済み関数名
    window.handleAddRSSFeed = handleAddRSSFeed;
    window.handleRemoveRSSFeed = handleRemoveRSSFeed;
    window.handleToggleRSSFeed = handleToggleRSSFeed;
    window.handleAddFolder = handleAddFolder;
    window.handleRemoveFolder = handleRemoveFolder;
    window.handleAddInterestWord = handleAddInterestWord;
    window.handleRemoveInterestWord = handleRemoveInterestWord;
    window.handleAddNGWord = handleAddNGWord;
    window.handleRemoveNGWord = handleRemoveNGWord;
    window.handleExportLearningData = handleExportLearningData;
    window.handleImportLearningData = handleImportLearningData;
    window.handleExportRSSData = handleExportRSSData;
    window.handleImportRSSData = handleImportRSSData;
    window.handleClearArticles = handleClearArticles;

    // =========================================== 
    // アプリケーション初期化
    // ===========================================
    
    const initializeApp = () => {
        initializeData();
        render();
        console.log('Minews PWA initialized successfully');
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp);
    } else {
        initializeApp();
    }

})();
