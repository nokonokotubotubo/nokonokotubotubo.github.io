// Minews PWA - データ管理・処理レイヤー

(function() {

'use strict';

// ===========================================
// 定数・設定
// ===========================================

window.CONFIG = {
    STORAGE_KEYS: {
        ARTICLES: 'minews_articles',
        RSS_FEEDS: 'minews_rssFeeds',
        FOLDERS: 'minews_folders',
        AI_LEARNING: 'minews_aiLearning',
        WORD_FILTERS: 'minews_wordFilters'
    },
    MAX_ARTICLES: 1000,
    DATA_VERSION: '1.0',
    REQUEST_TIMEOUT: 15000,
    MAX_RETRIES: 2,
    RETRY_DELAY: 3000,
    FOLDER_COLORS: [
        { name: 'ブルー', value: '#4A90A4' },
        { name: 'グリーン', value: '#28a745' },
        { name: 'オレンジ', value: '#fd7e14' },
        { name: 'パープル', value: '#6f42c1' },
        { name: 'レッド', value: '#dc3545' },
        { name: 'グレー', value: '#6c757d' }
    ]
};

window.DEFAULT_DATA = {
    folders: [
        { id: 'default-general', name: 'ニュース', color: '#4A90A4', createdAt: new Date().toISOString() },
        { id: 'default-tech', name: 'テック', color: '#28a745', createdAt: new Date().toISOString() }
    ],
    articles: [],
    rssFeeds: [
        { id: 'default-nhk', url: 'https://www3.nhk.or.jp/rss/news/cat0.xml', title: 'NHKニュース', folderId: 'default-general', lastUpdated: new Date().toISOString(), isActive: true },
        { id: 'default-itmedia', url: 'https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml', title: 'ITmedia', folderId: 'default-tech', lastUpdated: new Date().toISOString(), isActive: true }
    ],
    aiLearning: {
        version: window.CONFIG.DATA_VERSION,
        wordWeights: {},
        categoryWeights: {
            'Technology': 0, 'Development': 0, 'Business': 0, 'Science': 0,
            'Design': 0, 'AI': 0, 'Web': 0, 'Mobile': 0
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
// キャッシュシステム
// ===========================================

window.DataHooksCache = {
    articles: null,
    rssFeeds: null,
    folders: null,
    aiLearning: null,
    wordFilters: null,
    lastUpdate: {
        articles: null, rssFeeds: null, folders: null, aiLearning: null, wordFilters: null
    },
    clear(key) {
        if (key) {
            this[key] = null;
            this.lastUpdate[key] = null;
        } else {
            Object.keys(this).forEach(k => k !== 'clear' && k !== 'lastUpdate' && (this[k] = null));
            this.lastUpdate = { articles: null, rssFeeds: null, folders: null, aiLearning: null, wordFilters: null };
        }
    }
};

// ===========================================
// フォルダ管理
// ===========================================

window.FolderManager = {
    createFolder: (name, color = '#4A90A4') => ({
        id: `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: name.trim(),
        color,
        createdAt: new Date().toISOString()
    }),
    validateFolder: folder => folder && typeof folder.name === 'string' && folder.name.trim().length > 0 && folder.name.trim().length <= 50,
    getColorName: colorValue => window.CONFIG.FOLDER_COLORS.find(c => c.value === colorValue)?.name || 'カスタム',
    matchArticleToFeed(article, feeds) {
        return feeds.find(feed =>
            feed.title === article.rssSource ||
            article.rssSource.includes(feed.title) ||
            feed.title.includes(article.rssSource) ||
            this.extractDomainFromSource(article.rssSource) === this.extractDomainFromUrl(feed.url)
        ) || null;
    },
    extractDomainFromSource: source => source.includes('.') ? source.toLowerCase().replace(/^www\./, '') : source.toLowerCase(),
    extractDomainFromUrl(url) {
        try {
            return new URL(url).hostname.replace(/^www\./, '');
        } catch {
            return '';
        }
    }
};

// ===========================================
// JSON記事データ読み込みシステム
// ===========================================

window.ArticleLoader = {
    async loadArticlesFromJSON() {
        try {
            const response = await fetch('./articles.json');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            return {
                articles: data.articles || [],
                lastUpdated: data.lastUpdated || new Date().toISOString(),
                totalCount: data.totalCount || 0
            };
        } catch (error) {
            console.error('記事データの読み込みに失敗しました:', error);
            return {
                articles: [],
                lastUpdated: new Date().toISOString(),
                totalCount: 0
            };
        }
    }
};

// ===========================================
// AI学習システム
// ===========================================

window.AIScoring = {
    // 追加: 日本語ストップワードリスト（軽量で追加）
    STOP_WORDS: ['の', 'は', 'に', 'を', 'が', 'で', 'と', 'です', 'ます', 'から', 'へ', 'や', 'など', 'する', 'した'],

    filterArticles(articles, wordFilters) {
        if (!wordFilters.ngWords || wordFilters.ngWords.length === 0) return articles;
        return articles.filter(article => {
            const content = (article.title + ' ' + article.content).toLowerCase();
            return !wordFilters.ngWords.some(ngWord => content.includes(ngWord.toLowerCase()));
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
            const hasInterestWord = wordFilters.interestWords.some(word => content.includes(word.toLowerCase()));
            if (hasInterestWord) score += 10;
        }
        
        // 5. ユーザー評価（-20～+20点）
        if (article.userRating > 0) {
            score += (article.userRating - 3) * 10;
        }
        
        // 6. 最終スコアを0-100に正規化
        return Math.max(0, Math.min(100, Math.round(score + 50)));
    },
    // 修正: キーワード抽出関数を強化（RakutenMA使用を最適化、エラーハンドリング強化）
extractKeywords(text, maxKeywords = 8) {
    if (!text || typeof text !== 'string' || text.trim() === '') {
        console.warn('Invalid or empty text input for keyword extraction, returning empty array');
        return [];
    }

    if (!window.model_ja || !window.RakutenMA) {
        console.warn('RakutenMA model not loaded, falling back to simple keyword extraction');
        // フォールバック: シンプルなスペース分割（元の簡易版に近づけ精度低下を最小限に）
        return text.split(/\s+/).filter(word => word.length > 1).slice(0, maxKeywords);
    }

    try {
        const rma = new RakutenMA(window.model_ja);
        rma.chunk_size = 100;  // チャンクサイズを調整して精度向上（デフォルトより小さく）
        rma.phi = 1024;  // フィーチャー調整で複合語処理を強化

        // 追加: tokenize前にテキストをサニタイズ（特殊文字除去）
        const sanitizedText = text.replace(/[^\p{L}\p{N}\s]+/gu, ' ').trim();

        // テキストをトークナイズ
        const tokens = rma.tokenize(sanitizedText);

        if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
            throw new Error('Tokenization returned invalid or empty result');
        }

        // ストップワード除去と名詞・動詞のみ抽出
        const keywords = tokens
            .filter(token => 
                token[1] && (token[1].startsWith('N') || token[1].startsWith('V')) &&  // 名詞・動詞のみ
                !this.STOP_WORDS.includes(token[0]) && token[0].length > 1  // ストップワード除去、長さ1以上
            )
            .map(token => token[0]);

        // 頻度ベースでソート（簡易TF: 出現回数）
        const freqMap = keywords.reduce((acc, word) => {
            acc[word] = (acc[word] || 0) + 1;
            return acc;
        }, {});

        // 頻度降順でソートし、上位maxKeywordsを取得
        return Object.keys(freqMap)
            .sort((a, b) => freqMap[b] - freqMap[a])
            .slice(0, maxKeywords);
    } catch (error) {
        console.error('Keyword extraction error:', error);
        // エラー時フォールバック
        return text.split(/\s+/).filter(word => word.length > 1).slice(0, maxKeywords);
    }
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
        return articles.map(article => {
            // 修正: キーワード抽出を強化版に変更
            article.keywords = this.extractKeywords(article.title + ' ' + article.content);
            return {
                ...article,
                aiScore: this.calculateScore(article, aiLearning, wordFilters)
            };
        }).sort((a, b) => {
            if (a.aiScore !== b.aiScore) return b.aiScore - a.aiScore;
            if (a.userRating !== b.userRating) return b.userRating - a.userRating;
            return new Date(b.publishDate) - new Date(a.publishDate);
        });
    }
};

// ===========================================
// ワードフィルター管理
// ===========================================

window.WordFilterManager = {
    addWord(word, type, wordFilters) {
        word = word.trim();
        if (!word) return false;
        
        const targetArray = type === 'interest' ? wordFilters.interestWords : wordFilters.ngWords;
        const exists = targetArray.some(existingWord => existingWord.toLowerCase() === word.toLowerCase());
        
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
            return !wordFilters.ngWords.some(ngWord => text.includes(ngWord.toLowerCase()));
        });
    }
};

// ===========================================
// ローカルストレージ管理
// ===========================================

window.LocalStorageManager = {
    setItem(key, data) {
        try {
            const serializedData = JSON.stringify({
                data,
                timestamp: new Date().toISOString(),
                version: window.CONFIG.DATA_VERSION
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
            if (parsed.version !== window.CONFIG.DATA_VERSION) {
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

window.DataHooks = {
    useArticles() {
        const stored = localStorage.getItem(window.CONFIG.STORAGE_KEYS.ARTICLES);
        const timestamp = stored ? JSON.parse(stored).timestamp : null;
        
        if (!window.DataHooksCache.articles || window.DataHooksCache.lastUpdate.articles !== timestamp) {
            window.DataHooksCache.articles = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.ARTICLES, window.DEFAULT_DATA.articles);
            window.DataHooksCache.lastUpdate.articles = timestamp;
        }
        
        return {
            articles: window.DataHooksCache.articles,
            addArticle(newArticle) {
                const updatedArticles = [...window.DataHooksCache.articles];
                const exists = updatedArticles.find(article =>
                    article.id === newArticle.id ||
                    article.url === newArticle.url ||
                    (article.title === newArticle.title && article.rssSource === newArticle.rssSource)
                );
                
                if (exists) return false;
                
                if (updatedArticles.length >= window.CONFIG.MAX_ARTICLES) {
                    updatedArticles.sort((a, b) => {
                        const aScore = (a.readStatus === 'read' && a.userRating === 0) ? 1 : 0;
                        const bScore = (b.readStatus === 'read' && b.userRating === 0) ? 1 : 0;
                        if (aScore !== bScore) return bScore - aScore;
                        return new Date(a.publishDate) - new Date(b.publishDate);
                    });
                    updatedArticles.pop();
                }
                
                updatedArticles.unshift(newArticle);
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
                window.DataHooksCache.articles = updatedArticles;
                window.DataHooksCache.lastUpdate.articles = new Date().toISOString();
                
                if (window.state) {
                    window.state.articles = updatedArticles;
                }
                return true;
            },
            updateArticle(articleId, updates) {
                const updatedArticles = window.DataHooksCache.articles.map(article =>
                    article.id === articleId ? { ...article, ...updates } : article
                );
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
                window.DataHooksCache.articles = updatedArticles;
                window.DataHooksCache.lastUpdate.articles = new Date().toISOString();
                
                if (window.state) {
                    window.state.articles = updatedArticles;
                }
                if (window.render) {
                    window.render();
                }
            },
            bulkUpdateArticles(articleIds, updates) {
                const updatedArticles = window.DataHooksCache.articles.map(article =>
                    articleIds.includes(article.id) ? { ...article, ...updates } : article
                );
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
                window.DataHooksCache.articles = updatedArticles;
                window.DataHooksCache.lastUpdate.articles = new Date().toISOString();
                
                if (window.state) {
                    window.state.articles = updatedArticles;
                }
                if (window.render) {
                    window.render();
                }
            }
        };
    },
    useRSSManager() {
        const stored = localStorage.getItem(window.CONFIG.STORAGE_KEYS.RSS_FEEDS);
        const timestamp = stored ? JSON.parse(stored).timestamp : null;
        
        if (!window.DataHooksCache.rssFeeds || window.DataHooksCache.lastUpdate.rssFeeds !== timestamp) {
            window.DataHooksCache.rssFeeds = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.RSS_FEEDS, window.DEFAULT_DATA.rssFeeds);
            window.DataHooksCache.lastUpdate.rssFeeds = timestamp;
        }
        
        return {
            rssFeeds: window.DataHooksCache.rssFeeds,
            addRSSFeed(url, title, folderId = 'uncategorized') {
                const newFeed = {
                    id: `rss_${Date.now()}`,
                    url,
                    title: title || 'Unknown Feed',
                    folderId,
                    lastUpdated: new Date().toISOString(),
                    isActive: true
                };
                const updatedFeeds = [...window.DataHooksCache.rssFeeds, newFeed];
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.RSS_FEEDS, updatedFeeds);
                window.DataHooksCache.rssFeeds = updatedFeeds;
                window.DataHooksCache.lastUpdate.rssFeeds = new Date().toISOString();
                return newFeed;
            },
            removeRSSFeed(feedId) {
                const updatedFeeds = window.DataHooksCache.rssFeeds.filter(feed => feed.id !== feedId);
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.RSS_FEEDS, updatedFeeds);
                window.DataHooksCache.rssFeeds = updatedFeeds;
                window.DataHooksCache.lastUpdate.rssFeeds = new Date().toISOString();
            },
            updateRSSFeed(feedId, updates) {
                const updatedFeeds = window.DataHooksCache.rssFeeds.map(feed =>
                    feed.id === feedId ? { ...feed, ...updates } : feed
                );
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.RSS_FEEDS, updatedFeeds);
                window.DataHooksCache.rssFeeds = updatedFeeds;
                window.DataHooksCache.lastUpdate.rssFeeds = new Date().toISOString();
            },
            async fetchAllFeeds() {
                const articlesHook = window.DataHooks.useArticles();
                
                try {
                    const data = await window.ArticleLoader.loadArticlesFromJSON();
                    let addedCount = 0;
                    
                    // 既存記事をクリアして新しい記事で置き換え
                    window.DataHooksCache.articles = [];
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.ARTICLES, []);
                    
                    data.articles.forEach(article => {
                        if (articlesHook.addArticle(article)) {
                            addedCount++;
                        }
                    });
                    
                    return {
                        totalAdded: addedCount,
                        totalErrors: 0,
                        totalFeeds: 1,
                        feedResults: [{
                            name: 'GitHub Actions RSS',
                            success: true,
                            added: addedCount,
                            total: data.articles.length
                        }],
                        lastUpdated: data.lastUpdated
                    };
                } catch (error) {
                    console.error('記事読み込みエラー:', error);
                    return {
                        totalAdded: 0,
                        totalErrors: 1,
                        totalFeeds: 1,
                        feedResults: [{
                            name: 'GitHub Actions RSS',
                            success: false,
                            error: error.message
                        }]
                    };
                }
            }
        };
    },
    useFolders() {
        const stored = localStorage.getItem(window.CONFIG.STORAGE_KEYS.FOLDERS);
        const timestamp = stored ? JSON.parse(stored).timestamp : null;
        
        if (!window.DataHooksCache.folders || window.DataHooksCache.lastUpdate.folders !== timestamp) {
            window.DataHooksCache.folders = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.FOLDERS, window.DEFAULT_DATA.folders);
            window.DataHooksCache.lastUpdate.folders = timestamp;
        }
        
        return {
            folders: window.DataHooksCache.folders,
            addFolder(name, color) {
                const newFolder = window.FolderManager.createFolder(name, color);
                if (!window.FolderManager.validateFolder(newFolder)) return null;
                
                const updatedFolders = [...window.DataHooksCache.folders, newFolder];
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.FOLDERS, updatedFolders);
                window.DataHooksCache.folders = updatedFolders;
                window.DataHooksCache.lastUpdate.folders = new Date().toISOString();
                return newFolder;
            },
            removeFolder(folderId) {
                const rssHook = window.DataHooks.useRSSManager();
                const feedsInFolder = rssHook.rssFeeds.filter(feed => feed.folderId === folderId);
                
                if (feedsInFolder.length > 0) {
                    return {
                        success: false,
                        reason: 'FEEDS_EXIST',
                        feedCount: feedsInFolder.length
                    };
                }
                
                const updatedFolders = window.DataHooksCache.folders.filter(folder => folder.id !== folderId);
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.FOLDERS, updatedFolders);
                window.DataHooksCache.folders = updatedFolders;
                window.DataHooksCache.lastUpdate.folders = new Date().toISOString();
                return { success: true };
            },
            updateFolder(folderId, updates) {
                const updatedFolders = window.DataHooksCache.folders.map(folder =>
                    folder.id === folderId ? { ...folder, ...updates } : folder
                );
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.FOLDERS, updatedFolders);
                window.DataHooksCache.folders = updatedFolders;
                window.DataHooksCache.lastUpdate.folders = new Date().toISOString();
            }
        };
    },
    useAILearning() {
        const stored = localStorage.getItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING);
        const timestamp = stored ? JSON.parse(stored).timestamp : null;
        
        if (!window.DataHooksCache.aiLearning || window.DataHooksCache.lastUpdate.aiLearning !== timestamp) {
            window.DataHooksCache.aiLearning = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, window.DEFAULT_DATA.aiLearning);
            window.DataHooksCache.lastUpdate.aiLearning = timestamp;
        }
        
        return {
            aiLearning: window.DataHooksCache.aiLearning,
            updateWordWeight(word, weight) {
                const updatedLearning = {
                    ...window.DataHooksCache.aiLearning,
                    wordWeights: {
                        ...window.DataHooksCache.aiLearning.wordWeights,
                        [word]: (window.DataHooksCache.aiLearning.wordWeights[word] || 0) + weight
                    },
                    lastUpdated: new Date().toISOString()
                };
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, updatedLearning);
                window.DataHooksCache.aiLearning = updatedLearning;
                window.DataHooksCache.lastUpdate.aiLearning = new Date().toISOString();
            },
            updateCategoryWeight(category, weight) {
                const updatedLearning = {
                    ...window.DataHooksCache.aiLearning,
                    categoryWeights: {
                        ...window.DataHooksCache.aiLearning.categoryWeights,
                        [category]: (window.DataHooksCache.aiLearning.categoryWeights[category] || 0) + weight
                    },
                    lastUpdated: new Date().toISOString()
                };
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, updatedLearning);
                window.DataHooksCache.aiLearning = updatedLearning;
                window.DataHooksCache.lastUpdate.aiLearning = new Date().toISOString();
            },
            updateLearningData(article, rating, isRevert = false) {
                const updatedLearning = window.AIScoring.updateLearning(article, rating, window.DataHooksCache.aiLearning, isRevert);
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, updatedLearning);
                window.DataHooksCache.aiLearning = updatedLearning;
                window.DataHooksCache.lastUpdate.aiLearning = new Date().toISOString();
                return updatedLearning;
            }
        };
    },
    useWordFilters() {
        const stored = localStorage.getItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS);
        const timestamp = stored ? JSON.parse(stored).timestamp : null;
        
        if (!window.DataHooksCache.wordFilters || window.DataHooksCache.lastUpdate.wordFilters !== timestamp) {
            window.DataHooksCache.wordFilters = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, window.DEFAULT_DATA.wordFilters);
            window.DataHooksCache.lastUpdate.wordFilters = timestamp;
        }
        
        return {
            wordFilters: window.DataHooksCache.wordFilters,
            addInterestWord(word) {
                const updated = { ...window.DataHooksCache.wordFilters };
                if (window.WordFilterManager.addWord(word, 'interest', updated)) {
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, updated);
                    window.DataHooksCache.wordFilters = updated;
                    window.DataHooksCache.lastUpdate.wordFilters = new Date().toISOString();
                    return true;
                }
                return false;
            },
            addNGWord(word) {
                const updated = { ...window.DataHooksCache.wordFilters };
                if (window.WordFilterManager.addWord(word, 'ng', updated)) {
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, updated);
                    window.DataHooksCache.wordFilters = updated;
                    window.DataHooksCache.lastUpdate.wordFilters = new Date().toISOString();
                    return true;
                }
                return false;
            },
            removeInterestWord(word) {
                const updated = { ...window.DataHooksCache.wordFilters };
                if (window.WordFilterManager.removeWord(word, 'interest', updated)) {
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, updated);
                    window.DataHooksCache.wordFilters = updated;
                    window.DataHooksCache.lastUpdate.wordFilters = new Date().toISOString();
                    return true;
                }
                return false;
            },
            removeNGWord(word) {
                const updated = { ...window.DataHooksCache.wordFilters };
                if (window.WordFilterManager.removeWord(word, 'ng', updated)) {
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, updated);
                    window.DataHooksCache.wordFilters = updated;
                    window.DataHooksCache.lastUpdate.wordFilters = new Date().toISOString();
                    return true;
                }
                return false;
            }
        };
    }
};

})();

