// Minews PWA - 最適化版
(function() {
    'use strict';
    
    // =========================================== 
    // 必要な定数定義（追加）
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
        },

        matchArticleToFeed(article, feed) {
            if (article.sourceUrl === feed.url) {
                return { exact: true };
            }
            
            try {
                const articleDomain = new URL(article.sourceUrl || '').hostname;
                const feedDomain = new URL(feed.url).hostname;
                if (articleDomain === feedDomain) {
                    return { domain: true };
                }
            } catch (e) {
                // URL解析エラーは無視
            }
            
            return null;
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
        // RakutenMAモデル読み込み済みフラグ
        rakutenmaModelLoaded: false,
        rakutenmaModelData: null,

        // モデル読み込み関数
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

                // AllOrigins APIのレスポンス形式をチェック
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

                // 次のプロキシサーバーを試す
                if (proxyIndex < PROXY_SERVERS.length - 1) {
                    await this.delay(RETRY_DELAY);
                    return this.fetchRSS(url, proxyIndex + 1, retryCount);
                }

                // 全プロキシで失敗した場合、リトライ
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

                // RSS 2.0 / RSS 1.0 処理
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
                // RFC 2822 形式の日付をパース
                let date = new Date(dateString);
                if (isNaN(date.getTime())) {
                    // ISO 8601 形式を試す
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
            // RakutenMAライブラリの確認
            if (typeof RakutenMA === 'undefined') {
                console.warn('RakutenMA library not loaded, falling back to simple extraction');
                // フォールバック処理（元の実装）
                const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'は', 'が', 'を', 'に', 'で', 'と', 'の', 'から', 'まで', 'について', 'という', 'など'];
                return [...new Set(
                    text.toLowerCase()
                        .replace(/[^\w\sぁ-んァ-ン一-龯ー]/g, ' ')
                        .split(/[\s,、。・\-･▪▫◦‣⁃\u3000]/)
                        .filter(word => word.length > 2 && !stopWords.includes(word) && word !== 'ー')
                        .slice(0, 8)
                )];
            }

            try {
                // JSONからモデルデータを読み込み
                const modelData = await this.loadRakutenMAModel();

                // RakutenMAインスタンス作成
                const rma = new RakutenMA();
                // featsetとmodelを設定
                rma.featset = RakutenMA.default_featset_ja;
                rma.model = modelData; // JSONから読み込んだモデルデータを使用

                // モデルが正しく設定されたか確認
                if (!rma.model || Object.keys(rma.model).length === 0) {
                    throw new Error('RakutenMA model data is empty');
                }

                console.log('RakutenMA initialized with JSON model data');

                // 入力テキストの前処理
                const cleanText = text.substring(0, 1000).trim();
                if (!cleanText) {
                    return [];
                }

                // 形態素解析実行
                const tokens = rma.tokenize(cleanText);
                const keywords = [];

                // 日本語ストップワード
                const stopWords = new Set([
                    'の', 'に', 'は', 'を', 'た', 'が', 'で', 'て', 'と', 'し', 'れ', 'さ', 'な', 'も', 
                    'から', 'まで', 'について', 'という', 'など', 'この', 'その', 'あの', 'する', 
                    'なる', 'ある', 'いる', 'できる', 'れる', 'られる', 'こと', 'もの'
                ]);

                // 形態素解析結果の処理
                for (let i = 0; i < tokens.length; i++) {
                    const token = tokens[i];
                    
                    if (Array.isArray(token) && token.length >= 2) {
                        const surface = token[0]; // 表層形
                        const features = token[1]; // 品詞情報

                        if (features && Array.isArray(features) && features.length > 0) {
                            const pos = features[0]; // 主品詞

                            // 名詞、動詞、形容詞のみを抽出
                            if ((pos === '名詞' || pos === '動詞' || pos === '形容詞') && 
                                surface && 
                                surface.length > 1 && 
                                !stopWords.has(surface) && 
                                !/^[a-zA-Z0-9\s]+$/.test(surface)) { // 英数字のみは除外
                                
                                keywords.push(surface.toLowerCase());
                            }
                        }
                    }
                    
                    // 最大8個まで
                    if (keywords.length >= 8) break;
                }

                // 重複除去して返す
                const result = [...new Set(keywords)];
                console.log('RakutenMA keywords extracted:', result);
                return result;

            } catch (error) {
                console.error('Error in RakutenMA keyword extraction with JSON model:', error);
                // エラー時フォールバック（元の実装）
                const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'は', 'が', 'を', 'に', 'で', 'と', 'の', 'から', 'まで', 'について', 'という', 'など'];
                return [...new Set(
                    text.toLowerCase()
                        .replace(/[^\w\sぁ-んァ-ン一-龯ー]/g, ' ')
                        .split(/[\s,、。・\-･▪▫◦‣⁃\u3000]/)
                        .filter(word => word.length > 2 && !stopWords.includes(word) && word !== 'ー')
                        .slice(0, 8)
                )];
            }
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

            // 1. 鮮度スコア（0-20点、指数減衰）
            const hours = (Date.now() - new Date(article.publishDate).getTime()) / (1000 * 60 * 60);
            const freshness = Math.exp(-hours / 72) * 20;
            score += freshness;

            // 2. キーワード学習重み（-20～+20点にクリッピング）
            if (article.keywords && aiLearning.wordWeights) {
                article.keywords.forEach(keyword => {
                    const weight = aiLearning.wordWeights[keyword] || 0;
                    score += Math.max(-20, Math.min(20, weight));
                });
            }

            // 3. カテゴリ学習重み（-15～+15点にクリッピング）
            if (article.category && aiLearning.categoryWeights) {
                const weight = aiLearning.categoryWeights[article.category] || 0;
                score += Math.max(-15, Math.min(15, weight));
            }

            // 4. 興味ワードマッチ（+10点、重複なし）
            if (wordFilters.interestWords && article.title) {
                const content = (article.title + ' ' + article.content).toLowerCase();
                const hasInterestWord = wordFilters.interestWords.some(word => 
                    content.includes(word.toLowerCase())
                );
                if (hasInterestWord) score += 10;
            }

            // 5. ユーザー評価（-20～+20点）
            if (article.userRating > 0) {
                score += (article.userRating - 3) * 10;
            }

            // 6. 最終スコアを0-100に正規化
            return Math.max(0, Math.min(100, Math.round(score + 50)));
        },

        updateLearning(article, rating, aiLearning, isRevert = false) {
            const weights = [0, -6, -2, 0, 2, 6];
            let weight = weights[rating] || 0;
            if (isRevert) weight = -weight;

            // キーワード重み更新（±60でクリッピング）
            if (article.keywords) {
                article.keywords.forEach(keyword => {
                    const newWeight = (aiLearning.wordWeights[keyword] || 0) + weight;
                    aiLearning.wordWeights[keyword] = Math.max(-60, Math.min(60, newWeight));
                });
            }

            // カテゴリ重み更新（±42でクリッピング）
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
                if (defaultValue) this.setItem(key, defaultValue);
                return defaultValue;
            }
        },

        removeItem(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (error) {
                return false;
            }
        },

        migrateData(key, oldData, defaultValue) {
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
                        article.id !== articleId);
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
                            const parsed = RSSProcessor.parseRSS(rssContent, feed.url);
                            let addedCount = 0;

                            parsed.articles.forEach(article => {
                                if (articlesHook.addArticle(article)) addedCount++;
                            });

                            this.updateRSSFeed(feed.id, {
                                lastUpdated: new Date().toISOString()
                                // titleの自動更新を削除
                            });

                            totalAdded += addedCount;
                            feedResults.push({
                                name: feed.title,
                                success: true,
                                added: addedCount,
                                total: parsed.articles.length
                            });
                        } catch (error) {
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

    // XMLエスケープ関数
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
    
    // 学習データエクスポート
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

    // 学習データインポート
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

                // AI学習データのマージ
                Object.keys(importData.aiLearning.wordWeights || {}).forEach(word => {
                    const weight = importData.aiLearning.wordWeights[word];
                    aiHook.updateWordWeight(word, weight);
                });

                Object.keys(importData.aiLearning.categoryWeights || {}).forEach(category => {
                    const weight = importData.aiLearning.categoryWeights[category];
                    aiHook.updateCategoryWeight(category, weight);
                });

                // ワードフィルターのマージ
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
        
        // ファイル選択をリセット
        event.target.value = '';
    };

    // RSSデータエクスポート（OPML形式）
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

        // フォルダごとにRSSフィードを整理
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

    // =========================================== 
    // イベントハンドラー
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
            // 前の評価を取り消し
            if (article.userRating > 0) {
                aiHook.updateLearningData(article, article.userRating, true);
            }
            
            // 新しい評価を適用
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

    // 修正: handleRefresh → handleRefreshFeeds に関数名変更
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

    const render = () => {
        const aiHook = DataHooks.useAILearning();
        const wordHook = DataHooks.useWordFilters();
        const foldersHook = DataHooks.useFolders();
        const rssHook = DataHooks.useRSSManager();

        // 記事フィルタリング
        let filteredArticles = [...state.articles];

        // NGワードフィルタリング
        filteredArticles = WordFilterManager.filterArticles(filteredArticles, wordHook.wordFilters);

        // フォルダフィルタリング
        if (state.selectedFolder !== 'all') {
            const folderFeeds = rssHook.rssFeeds.filter(feed => feed.folderId === state.selectedFolder);
            const folderSources = folderFeeds.map(feed => RSSProcessor.extractDomain(feed.url));
            filteredArticles = filteredArticles.filter(article => 
                folderSources.includes(article.rssSource)
            );
        }

        // 表示モードフィルタリング
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

        // AIスコアでソート
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
                            記事がありません。RSSフィードを追加して「更新」ボタンをクリックしてください。
                        </div>
                    `}
                </main>
            </div>
        `;

        document.body.innerHTML = appHtml;
    };

    // =========================================== 
    // グローバル関数登録（修正: handleRefreshFeeds）
    // ===========================================
    
    // HTMLから呼び出される関数をグローバルスコープに登録
    window.handleFilterClick = handleFilterClick;
    window.handleFolderChange = handleFolderChange;
    window.handleModalOpen = handleModalOpen;
    window.handleModalClose = handleModalClose;
    window.handleStarClick = handleStarClick;
    window.handleArticleClick = handleArticleClick;
    window.handleToggleReadStatus = handleToggleReadStatus;
    window.handleToggleReadLater = handleToggleReadLater;
    window.handleRefreshFeeds = handleRefreshFeeds; // 修正済み関数名
    window.handleExportLearningData = handleExportLearningData;

    // =========================================== 
    // アプリケーション初期化
    // ===========================================
    
    const initializeApp = () => {
        initializeData();
        render();
        console.log('Minews PWA initialized successfully');
    };

    // アプリケーション開始
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp);
    } else {
        initializeApp();
    }

})();
