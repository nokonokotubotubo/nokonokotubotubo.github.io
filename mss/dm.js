// Minews PWA - データ管理・処理レイヤー（無駄機能削除・簡素化完了版）

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
    RETRY_DELAY: 3000
};

window.DEFAULT_DATA = {
    articles: [],
    aiLearning: {
        version: window.CONFIG.DATA_VERSION,
        wordWeights: {},
        sourceWeights: {},
        lastUpdated: new Date().toISOString()
    },
    wordFilters: {
        interestWords: ['生成AI', 'Claude', 'Perplexity'],
        ngWords: [],
        lastUpdated: new Date().toISOString()
    }
};

// ===========================================
// GitHub Gist API連携システム（シンプル版）
// ===========================================

window.GistSyncManager = {
    token: null,
    gistId: null,
    isEnabled: false,
    isSyncing: false,
    lastSyncTime: null,
    
    // 定期同期システム（1分間隔）
    periodicSyncEnabled: false,
    periodicSyncInterval: null,
    pendingChanges: false,
    lastChangeTime: null,
    
    // 簡易暗号化機能（XOR ベース）
    _encrypt(text, key = 'minews_secret_key') {
        if (!text) return '';
        let result = '';
        for (let i = 0; i < text.length; i++) {
            result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return btoa(result);
    },

    _decrypt(encryptedText, key = 'minews_secret_key') {
        if (!encryptedText) return '';
        try {
            const text = atob(encryptedText);
            let result = '';
            for (let i = 0; i < text.length; i++) {
                result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            }
            return result;
        } catch (error) {
            return '';
        }
    },
    
    // 初期化（設定画面で呼び出し）
    init(token, gistId = null) {
        this.token = token;
        this.gistId = gistId;
        this.isEnabled = !!token;
        
        try {
            localStorage.setItem('minews_gist_config', JSON.stringify({
                encryptedToken: token ? this._encrypt(token) : null,
                gistId: gistId,
                isEnabled: this.isEnabled,
                configuredAt: new Date().toISOString(),
                lastSyncTime: this.lastSyncTime || null
            }));
            
            if (this.isEnabled) {
                this.startPeriodicSync(60);
            }
        } catch (error) {
            console.warn('Gist設定の保存に失敗:', error);
        }
    },
    
    // 設定読み込み
    loadConfig() {
        try {
            const config = localStorage.getItem('minews_gist_config');
            if (config) {
                const parsed = JSON.parse(config);
                
                if (parsed.encryptedToken) {
                    this.token = this._decrypt(parsed.encryptedToken);
                    this.isEnabled = !!this.token;
                } else {
                    this.isEnabled = false;
                }
                
                this.gistId = parsed.gistId;
                this.lastSyncTime = parsed.lastSyncTime || null;
                
                return {
                    hasToken: !!this.token,
                    gistId: parsed.gistId,
                    isEnabled: this.isEnabled,
                    configuredAt: parsed.configuredAt,
                    lastSyncTime: this.lastSyncTime
                };
            }
        } catch (error) {
            console.warn('Gist設定の読み込みに失敗:', error);
        }
        return null;
    },
    
    // 定期同期の開始
    startPeriodicSync(intervalSeconds = 60) {
        if (this.periodicSyncInterval) {
            clearInterval(this.periodicSyncInterval);
        }
        
        this.periodicSyncEnabled = true;
        
        this.periodicSyncInterval = setInterval(async () => {
            await this._executePeriodicSync();
        }, intervalSeconds * 1000);
    },

    // 定期同期の停止
    stopPeriodicSync() {
        if (this.periodicSyncInterval) {
            clearInterval(this.periodicSyncInterval);
            this.periodicSyncInterval = null;
        }
        this.periodicSyncEnabled = false;
    },

    // 変更フラグの設定
    markAsChanged() {
        this.pendingChanges = true;
        this.lastChangeTime = new Date().toISOString();
    },

    // 定期同期実行（シンプル版）
    async _executePeriodicSync() {
        if (!this.isEnabled || !this.token || !this.pendingChanges || this.isSyncing) {
            return;
        }
        
        this.isSyncing = true;
        
        try {
            const syncData = this.collectSyncData();
            const result = await this.syncToCloud(syncData);
            
            if (result) {
                this.lastSyncTime = new Date().toISOString();
                this._saveLastSyncTime(this.lastSyncTime);
                this.pendingChanges = false;
            }
            
            return result;
        } catch (error) {
            return false;
        } finally {
            this.isSyncing = false;
        }
    },
    
    // 手動同期
    async autoSync(triggerType = 'manual') {
        if (!this.isEnabled || !this.token) {
            return { success: false, reason: 'disabled_or_not_configured' };
        }
        
        if (triggerType === 'manual') {
            return await this._executeManualSync();
        }
        
        this.markAsChanged();
        return { success: true, reason: 'marked_for_periodic_sync' };
    },

    // 手動同期実行
    async _executeManualSync() {
        if (this.isSyncing) {
            return { success: false, reason: 'already_syncing' };
        }
        
        this.isSyncing = true;
        
        try {
            const syncData = this.collectSyncData();
            const result = await this.syncToCloud(syncData);
            
            if (result) {
                this.lastSyncTime = new Date().toISOString();
                this._saveLastSyncTime(this.lastSyncTime);
                this.pendingChanges = false;
            }
            
            return { success: result, triggerType: 'manual' };
        } catch (error) {
            return { success: false, error: error.message, triggerType: 'manual' };
        } finally {
            this.isSyncing = false;
        }
    },

    // タイムスタンプ比較判定（シンプル版）
    _shouldPullFromCloud(cloudTimestamp) {
        if (!cloudTimestamp || !this.lastSyncTime) {
            return false;
        }
        
        try {
            const cloudTime = new Date(cloudTimestamp).getTime();
            const localTime = new Date(this.lastSyncTime).getTime();
            return cloudTime > localTime;
        } catch (error) {
            return false;
        }
    },

    // 最終同期時刻の保存
    _saveLastSyncTime(timestamp) {
        try {
            const config = this.loadConfig() || {};
            config.lastSyncTime = timestamp;
            this.lastSyncTime = timestamp;
            localStorage.setItem('minews_gist_config', JSON.stringify(config));
        } catch (error) {
            console.error('最終同期時刻の保存に失敗:', error);
        }
    },
    
    // 同期対象データ収集
    collectSyncData() {
        const aiHook = window.DataHooks.useAILearning();
        const wordHook = window.DataHooks.useWordFilters();
        const articlesHook = window.DataHooks.useArticles();
        
        const articleStates = {};
        articlesHook.articles.forEach(article => {
            articleStates[article.id] = {
                readStatus: article.readStatus,
                userRating: article.userRating || 0,
                readLater: article.readLater || false
            };
        });
        
        return {
            version: window.CONFIG.DATA_VERSION,
            syncTime: new Date().toISOString(),
            aiLearning: aiHook.aiLearning,
            wordFilters: wordHook.wordFilters,
            articleStates: articleStates
        };
    },

    // クラウド同期（アップロード）
    async syncToCloud(data) {
        if (!this.token) {
            return false;
        }
        
        const payload = {
            description: `Minews User Data Backup - ${new Date().toLocaleString('ja-JP')}`,
            public: false,
            files: {
                "minews_data.json": {
                    content: JSON.stringify(data, null, 2)
                }
            }
        };
        
        const url = this.gistId 
            ? `https://api.github.com/gists/${this.gistId}`
            : 'https://api.github.com/gists';
            
        const method = this.gistId ? 'PATCH' : 'POST';
        
        try {
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify(payload)
            });
            
            if (response.ok) {
                const result = await response.json();
                
                if (!this.gistId) {
                    this.gistId = result.id;
                    this.saveGistId(result.id);
                }
                
                return true;
            }
            
            return false;
        } catch (error) {
            return false;
        }
    },
    
    // クラウド同期（ダウンロード）
    async syncFromCloud() {
        if (!this.token || !this.gistId) return null;
        
        const response = await fetch(`https://api.github.com/gists/${this.gistId}`, {
            headers: {
                'Authorization': `token ${this.token}`
            }
        });
        
        if (response.ok) {
            const gist = await response.json();
            const content = gist.files['minews_data.json'].content;
            return JSON.parse(content);
        }
        return null;
    },
    
    // GistID保存
    saveGistId(gistId) {
        try {
            const config = this.loadConfig() || {};
            config.gistId = gistId;
            config.lastSyncTime = this.lastSyncTime || null;
            localStorage.setItem('minews_gist_config', JSON.stringify(config));
            this.gistId = gistId;
        } catch (error) {
            console.warn('GistID保存に失敗:', error);
        }
    },

    // 同期テスト
    async testSync() {
        const testResults = {
            timestamp: new Date().toISOString(),
            config: {
                hasToken: !!this.token,
                hasGistId: !!this.gistId,
                isEnabled: this.isEnabled
            },
            tests: []
        };
        
        testResults.tests.push({
            name: '基本設定確認',
            status: (this.token && this.gistId) ? 'pass' : 'fail',
            details: {
                token: this.token ? '設定済み' : '未設定',
                gistId: this.gistId ? `${this.gistId.substring(0, 8)}...` : '未設定'
            }
        });
        
        return testResults;
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
            delete this[key];
            delete this.lastUpdate[key];
        } else {
            Object.keys(this).forEach(k => {
                if (k !== 'clear' && k !== 'lastUpdate') {
                    delete this[k];
                }
            });
            this.lastUpdate = {};
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
    filterArticles(articles, wordFilters) {
        if (!wordFilters.ngWords || wordFilters.ngWords.length === 0) return articles;
        return articles.filter(article => {
            const content = (article.title + ' ' + article.content).toLowerCase();
            return !wordFilters.ngWords.some(ngWord => content.includes(ngWord.toLowerCase()));
        });
    },
    calculateScore(article, aiLearning, wordFilters) {
        let score = 0;
    
        if (article.keywords && aiLearning.wordWeights) {
            article.keywords.forEach(keyword => {
                const weight = aiLearning.wordWeights[keyword] || 0;
                score += Math.max(-20, Math.min(20, weight));
            });
        }
        
        if (article.rssSource && aiLearning.sourceWeights) {
            const weight = aiLearning.sourceWeights[article.rssSource] || 0;
            score += Math.max(-5, Math.min(5, weight));
        }
        
        if (wordFilters.interestWords && article.title) {
            const content = (article.title + ' ' + article.content).toLowerCase();
            const hasInterestWord = wordFilters.interestWords.some(word => content.includes(word.toLowerCase()));
            if (hasInterestWord) score += 10;
        }
        
        if (article.userRating > 0) {
            score += (article.userRating - 3) * 10;
        }
        
        return Math.max(0, Math.min(100, Math.round(score + 30)));
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
        
        if (article.rssSource) {
            const sourceWeight = Math.round(weight * 0.5);
            const newWeight = (aiLearning.sourceWeights[article.rssSource] || 0) + sourceWeight;
            aiLearning.sourceWeights[article.rssSource] = Math.max(-20, Math.min(20, newWeight));
        }
        
        aiLearning.lastUpdated = new Date().toISOString();
        return aiLearning;
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
            if (key === window.CONFIG.STORAGE_KEYS.AI_LEARNING && oldData.data.categoryWeights) {
                oldData.data = {
                    ...oldData.data,
                    sourceWeights: {},
                    categoryWeights: undefined
                };
                delete oldData.data.categoryWeights;
            }
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
                
                if (exists) {
                    return false;
                }
                
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
            updateArticle(articleId, updates, options = {}) {
                const { skipRender = false } = options;
                const updatedArticles = window.DataHooksCache.articles.map(article =>
                    article.id === articleId ? { ...article, ...updates } : article
                );
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
                window.DataHooksCache.articles = updatedArticles;
                window.DataHooksCache.lastUpdate.articles = new Date().toISOString();
                
                if (window.state) {
                    window.state.articles = updatedArticles;
                }
                if (window.render && !skipRender) {
                    window.render();
                }
            }
        };
    },
    useRSSManager() {
        const stored = localStorage.getItem(window.CONFIG.STORAGE_KEYS.RSS_FEEDS);
        const timestamp = stored ? JSON.parse(stored).timestamp : null;
        
        if (!window.DataHooksCache.rssFeeds || window.DataHooksCache.lastUpdate.rssFeeds !== timestamp) {
            window.DataHooksCache.rssFeeds = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.RSS_FEEDS, []);
            window.DataHooksCache.lastUpdate.rssFeeds = timestamp;
        }
        
        return {
            rssFeeds: window.DataHooksCache.rssFeeds,
            async fetchAllFeeds() {
                const articlesHook = window.DataHooks.useArticles();
                
                try {
                    const data = await window.ArticleLoader.loadArticlesFromJSON();
                    let addedCount = 0;
                    let skippedCount = 0;
                    
                    data.articles.forEach(article => {
                        if (articlesHook.addArticle(article)) {
                            addedCount++;
                        } else {
                            skippedCount++;
                        }
                    });
                    
                    return {
                        totalAdded: addedCount,
                        totalSkipped: skippedCount,
                        totalErrors: 0,
                        totalFeeds: 1,
                        feedResults: [{
                            name: 'GitHub Actions RSS',
                            success: true,
                            added: addedCount,
                            skipped: skippedCount,
                            total: data.articles.length
                        }],
                        lastUpdated: data.lastUpdated
                    };
                } catch (error) {
                    console.error('記事読み込みエラー:', error);
                    return {
                        totalAdded: 0,
                        totalSkipped: 0,
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
    useAILearning() {
        const stored = localStorage.getItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING);
        const timestamp = stored ? JSON.parse(stored).timestamp : null;
        
        if (!window.DataHooksCache.aiLearning || window.DataHooksCache.lastUpdate.aiLearning !== timestamp) {
            window.DataHooksCache.aiLearning = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, window.DEFAULT_DATA.aiLearning);
            window.DataHooksCache.lastUpdate.aiLearning = timestamp;
        }
        
        return {
            aiLearning: window.DataHooksCache.aiLearning,
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
