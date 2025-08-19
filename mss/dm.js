// Minews PWA - データ管理・処理レイヤー（完全統合最適化版）
(function() {
'use strict';

// 設定定数
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

// デフォルトデータ
window.DEFAULT_DATA = {
    articles: [],
    folders: [],
    feeds: [],
    aiLearning: {
        version: window.CONFIG.DATA_VERSION,
        wordWeights: {},
        lastUpdated: new Date().toISOString()
    },
    wordFilters: {
        interestWords: ['生成AI', 'Claude', 'Perplexity'],
        ngWords: [],
        lastUpdated: new Date().toISOString()
    }
};

// 共通ユーティリティ
const Utils = {
    safeJsonParse: (str, def = null) => { try { return JSON.parse(str); } catch { return def; } },
    safeJsonStringify: (obj, format = false) => JSON.stringify(obj, null, format ? 2 : 0),
    getCurrentTime: () => new Date().toISOString(),
    normalizeRating: (rating) => Math.max(0, Math.min(5, parseInt(rating) || 0)),
    handleError: (context, error, fallback = null) => {
        console.error(`${context}エラー:`, error);
        return fallback;
    }
};

// ワード評価管理システム（最適化版）
window.WordRatingManager = {
    STORAGE_KEY: 'minews_keyword_ratings',
    AUTO_ADDED_KEY: 'minews_auto_added_words',
    
    getWordRating: (word) => Utils.safeJsonParse(localStorage.getItem(this.STORAGE_KEY), {})[word] || 0,
    getAllRatings: () => Utils.safeJsonParse(localStorage.getItem(this.STORAGE_KEY), {}),
    getAutoAddedWords: () => Utils.safeJsonParse(localStorage.getItem(this.AUTO_ADDED_KEY), {}),
    
    saveWordRating(word, rating) {
        try {
            const normalizedRating = Utils.normalizeRating(rating);
            const ratings = this.getAllRatings();
            const autoAdded = this.getAutoAddedWords();
            
            if (normalizedRating > 0) {
                ratings[word] = normalizedRating;
                if (this._updateInterestWords(word, true)) {
                    autoAdded[word] = true;
                }
            } else {
                delete ratings[word];
                if (autoAdded[word]) {
                    this._updateInterestWords(word, false);
                    delete autoAdded[word];
                }
            }
            
            localStorage.setItem(this.STORAGE_KEY, Utils.safeJsonStringify(ratings));
            localStorage.setItem(this.AUTO_ADDED_KEY, Utils.safeJsonStringify(autoAdded));
            this._updateAILearningFromRating(word, normalizedRating);
            
            return true;
        } catch (error) {
            return Utils.handleError('WordRating保存', error, false);
        }
    },
    
    _updateInterestWords(word, isAdd) {
        try {
            const wordHook = window.DataHooks.useWordFilters();
            const wordFilters = { ...wordHook.wordFilters };
            const index = wordFilters.interestWords.indexOf(word);
            
            if (isAdd && index === -1) {
                wordFilters.interestWords.push(word);
                wordFilters.lastUpdated = Utils.getCurrentTime();
                this._saveWordFilters(wordFilters);
                console.log(`自動追加: 興味ワード「${word}」`);
                return true;
            } else if (!isAdd && index > -1) {
                wordFilters.interestWords.splice(index, 1);
                wordFilters.lastUpdated = Utils.getCurrentTime();
                this._saveWordFilters(wordFilters);
                console.log(`自動削除: 興味ワード「${word}」`);
                return true;
            }
            return false;
        } catch (error) {
            return Utils.handleError('興味ワード更新', error, false);
        }
    },
    
    _saveWordFilters(wordFilters) {
        window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, wordFilters);
        window.DataHooksCache.clear('wordFilters');
        window.DataHooksCache.wordFilters = wordFilters;
    },
    
    _updateAILearningFromRating(word, rating) {
        try {
            const aiHook = window.DataHooks.useAILearning();
            const aiLearning = { ...aiHook.aiLearning };
            const weightMapping = { 1: -10, 2: -5, 3: 0, 4: 5, 5: 10 };
            
            if (rating > 0) {
                aiLearning.wordWeights[word] = weightMapping[rating] || 0;
            } else {
                delete aiLearning.wordWeights[word];
            }
            
            aiLearning.lastUpdated = Utils.getCurrentTime();
            window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, aiLearning);
            window.DataHooksCache.clear('aiLearning');
            window.DataHooksCache.aiLearning = aiLearning;
        } catch (error) {
            Utils.handleError('AI学習データ更新', error);
        }
    },
    
    setInterestWordRating(word, rating) {
        const success = this.saveWordRating(word, rating);
        if (success && window.GistSyncManager?.isEnabled) {
            window.GistSyncManager.markAsChanged();
        }
        return success;
    },
    
    getAllInterestWordRatings(interestWords) {
        const ratings = {};
        interestWords.forEach(word => {
            ratings[word] = this.getWordRating(word);
        });
        return ratings;
    }
};

// 安定ID生成システム
window.StableIDGenerator = {
    generateStableId: (url, title, publishDate = null) => {
        const baseString = `${url.trim().toLowerCase()}|${title.trim()}${publishDate ? '|' + publishDate : ''}`;
        return this._simpleHash(baseString);
    },
    
    _simpleHash(str) {
        if (!str.length) return 'stable_' + Date.now();
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return `stable_${Math.abs(hash).toString(36)}_${str.length}`;
    }
};

// GitHub Gist同期システム（完全統合最適化版）
window.GistSyncManager = {
    token: null,
    gistId: null,
    isEnabled: false,
    isSyncing: false,
    lastSyncTime: null,
    periodicSyncEnabled: false,
    periodicSyncInterval: null,
    pendingChanges: false,
    _isBackgroundSyncing: false,
    _configValidated: false,
    _lastValidConfig: null,
    
    // 暗号化ユーティリティ
    _cryptoOp: (text, isEncrypt, key = 'minews_secret_key') => {
        if (!text) return '';
        try {
            const input = isEncrypt ? text : atob(text);
            let result = '';
            for (let i = 0; i < input.length; i++) {
                result += String.fromCharCode(input.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            }
            result = isEncrypt ? btoa(result) : result;
            if (!isEncrypt && (result.length < 10 || !/^[a-zA-Z0-9_]+$/.test(result))) {
                throw new Error('復号化データが無効です');
            }
            return result;
        } catch (error) {
            throw new Error(`${isEncrypt ? '暗号化' : '復号化'}処理に失敗しました`);
        }
    },
    
    // 安全なストレージ操作
    _storage: {
        get: (key, defaultValue = null) => Utils.safeJsonParse(localStorage.getItem(key), defaultValue),
        set: (key, value) => { try { localStorage.setItem(key, Utils.safeJsonStringify(value)); return true; } catch { return false; } }
    },
    
    loadConfig() {
        try {
            const parsed = this._storage.get('minews_gist_config');
            if (!parsed) return this._lastValidConfig || null;
            
            let decryptedToken = null;
            if (parsed.encryptedToken) {
                try {
                    decryptedToken = this._cryptoOp(parsed.encryptedToken, false);
                    this.token = decryptedToken;
                    this.isEnabled = true;
                } catch {
                    this.token = null;
                    this.isEnabled = false;
                }
            }
            
            this.gistId = parsed.gistId || this.gistId;
            this.lastSyncTime = parsed.lastSyncTime || this.lastSyncTime;
            
            const validConfig = {
                hasToken: !!this.token,
                gistId: this.gistId,
                isEnabled: this.isEnabled,
                configuredAt: parsed.configuredAt,
                lastSyncTime: this.lastSyncTime
            };
            
            this._lastValidConfig = validConfig;
            this._configValidated = true;
            return validConfig;
        } catch (error) {
            return Utils.handleError('設定読み込み', error, this._lastValidConfig || {
                hasToken: false,
                gistId: null,
                isEnabled: false,
                configuredAt: null,
                lastSyncTime: null
            });
        }
    },
    
    init(token, gistId = null) {
        if (!token?.trim()) throw new Error('有効なトークンが必要です');
        
        const encryptedToken = this._cryptoOp(token.trim(), true);
        const existingConfig = this.loadConfig();
        
        this.token = token.trim();
        this.gistId = gistId?.trim() || existingConfig?.gistId || null;
        this.isEnabled = true;
        
        const configData = {
            encryptedToken,
            gistId: this.gistId,
            isEnabled: true,
            configuredAt: Utils.getCurrentTime(),
            lastSyncTime: this.lastSyncTime || existingConfig?.lastSyncTime || null,
            version: '1.3'
        };
        
        if (!this._storage.set('minews_gist_config', configData)) {
            throw new Error('設定の保存に失敗しました');
        }
        
        this._lastValidConfig = {
            hasToken: true,
            gistId: this.gistId,
            isEnabled: true,
            configuredAt: configData.configuredAt,
            lastSyncTime: this.lastSyncTime
        };
        
        if (this.isEnabled) this.startPeriodicSync(60);
    },
    
    startPeriodicSync(intervalSeconds = 60) {
        this.stopPeriodicSync();
        this.periodicSyncEnabled = true;
        this.periodicSyncInterval = setInterval(() => this._executePeriodicSync(), intervalSeconds * 1000);
    },
    
    stopPeriodicSync() {
        if (this.periodicSyncInterval) {
            clearInterval(this.periodicSyncInterval);
            this.periodicSyncInterval = null;
        }
        this.periodicSyncEnabled = false;
    },
    
    markAsChanged() {
        this.pendingChanges = true;
    },
    
    async _executePeriodicSync() {
        if (!this.isEnabled || !this.token || this.isSyncing) return false;
        
        this.isSyncing = true;
        this._isBackgroundSyncing = true;
        
        try {
            const result = await this._performSync(true);
            if (result && window.render) setTimeout(() => window.render(), 100);
            return result;
        } catch (error) {
            return Utils.handleError('定期同期', error, false);
        } finally {
            this.isSyncing = false;
            this._isBackgroundSyncing = false;
        }
    },
    
    // 【統合】共通同期処理
    async _performSync(isBackground = false) {
        try {
            const cloudData = await this.syncFromCloud();
            const localData = await this.collectSyncData();
            const mergedData = this._mergeData(localData, cloudData);
            const uploadResult = await this.syncToCloud(mergedData);
            
            if (uploadResult) {
                await this._applyMergedData(mergedData, isBackground);
                await this._updateConfigSafely(Utils.getCurrentTime());
                this.pendingChanges = false;
                return true;
            }
            return false;
        } catch (error) {
            return Utils.handleError('同期処理', error, false);
        }
    },
    
    _mergeData(localData, cloudData) {
        if (!cloudData) return localData;
        
        return {
            version: window.CONFIG.DATA_VERSION,
            syncTime: Utils.getCurrentTime(),
            aiLearning: this._mergeAILearning(localData.aiLearning, cloudData.aiLearning),
            wordFilters: this._mergeWordFilters(localData.wordFilters, cloudData.wordFilters),
            articleStates: this._mergeArticleStates(localData.articleStates, cloudData.articleStates, localData.deletedArticleIds || [])
        };
    },
    
    _mergeAILearning(localAI, cloudAI) {
        if (!cloudAI) return localAI;
        if (!localAI) return cloudAI;
        
        const localTime = new Date(localAI.lastUpdated || 0).getTime();
        const cloudTime = new Date(cloudAI.lastUpdated || 0).getTime();
        
        return {
            version: window.CONFIG.DATA_VERSION,
            wordWeights: { ...(cloudTime > localTime ? cloudAI : localAI).wordWeights },
            lastUpdated: Utils.getCurrentTime()
        };
    },
    
    _mergeWordFilters(localWords, cloudWords) {
        if (!cloudWords) return localWords;
        if (!localWords) return cloudWords;
        
        const allInterestWords = new Map();
        const processWords = (words, source) => {
            (words.interestWords || []).forEach(word => {
                const wordStr = typeof word === 'string' ? word : word.word || word;
                const rating = window.WordRatingManager?.getWordRating(wordStr) || 0;
                if (!allInterestWords.has(wordStr) || (source === 'cloud' && rating > (allInterestWords.get(wordStr).rating || 0))) {
                    allInterestWords.set(wordStr, { word: wordStr, scope: 'all', target: null, rating, source });
                }
            });
        };
        
        // クラウドの詳細データを優先処理
        if (cloudWords.interestWordsDetailed) {
            cloudWords.interestWordsDetailed.forEach(wordObj => {
                const existing = allInterestWords.get(wordObj.word);
                if (!existing || wordObj.rating > existing.rating) {
                    allInterestWords.set(wordObj.word, {
                        word: wordObj.word,
                        scope: wordObj.scope || 'all',
                        target: wordObj.target || null,
                        rating: wordObj.rating || 0,
                        source: 'cloud'
                    });
                }
            });
        } else {
            processWords(cloudWords, 'cloud');
        }
        
        processWords(localWords, 'local');
        
        const sortedWords = Array.from(allInterestWords.values())
            .sort((a, b) => a.word.localeCompare(b.word, 'ja', { numeric: true }));
        
        // NGワードのマージ
        const allNGWords = new Set();
        [...(localWords.ngWords || []), ...(cloudWords.ngWords || [])]
            .forEach(word => allNGWords.add(Utils.safeJsonStringify(word)));
        
        const sortedNGWords = Array.from(allNGWords)
            .map(wordStr => Utils.safeJsonParse(wordStr))
            .sort((a, b) => {
                const wordA = typeof a === 'string' ? a : a.word || a;
                const wordB = typeof b === 'string' ? b : b.word || b;
                return wordA.localeCompare(wordB, 'ja', { numeric: true });
            });
        
        return {
            interestWords: sortedWords.map(item => item.word),
            interestWordsDetailed: sortedWords,
            ngWords: sortedNGWords,
            lastUpdated: Utils.getCurrentTime()
        };
    },
    
    _mergeArticleStates(localStates, cloudStates, deletedIds = []) {
        if (!cloudStates) return localStates;
        if (!localStates) return cloudStates;
        
        const currentArticleIds = new Set(window.DataHooks.useArticles().articles.map(article => article.id));
        const mergedStates = {};
        
        [...new Set([...Object.keys(localStates), ...Object.keys(cloudStates)])]
            .filter(id => currentArticleIds.has(id) && !deletedIds.includes(id))
            .forEach(articleId => {
                const localState = localStates[articleId];
                const cloudState = cloudStates[articleId];
                
                if (!cloudState) {
                    mergedStates[articleId] = localState;
                } else if (!localState) {
                    mergedStates[articleId] = cloudState;
                } else {
                    const localTime = new Date(localState.lastModified || 0).getTime();
                    const cloudTime = new Date(cloudState.lastModified || 0).getTime();
                    mergedStates[articleId] = localTime >= cloudTime ? localState : cloudState;
                }
            });
        
        return mergedStates;
    },
    
    // 【統合】データ適用処理（背景同期・手動同期共通）
    async _applyMergedData(mergedData, isBackground = false) {
        try {
            // 1. 興味ワード評価の復元
            if (mergedData.wordFilters?.interestWordsDetailed && window.WordRatingManager) {
                mergedData.wordFilters.interestWordsDetailed.forEach(wordObj => {
                    if (wordObj.rating > 0) {
                        window.WordRatingManager.saveWordRating(wordObj.word, wordObj.rating);
                    }
                });
            }
            
            // 2. データの一括更新
            const updatePromises = [];
            
            if (mergedData.aiLearning) {
                updatePromises.push(this._updateDataCache('aiLearning', mergedData.aiLearning, window.CONFIG.STORAGE_KEYS.AI_LEARNING));
            }
            
            if (mergedData.wordFilters) {
                updatePromises.push(this._updateDataCache('wordFilters', mergedData.wordFilters, window.CONFIG.STORAGE_KEYS.WORD_FILTERS));
            }
            
            await Promise.all(updatePromises);
            
            // 3. 記事データの更新
            if (mergedData.articleStates) {
                await this._updateArticles(mergedData);
            }
            
            // 4. UI更新（手動同期の場合のみ即座に更新）
            if (!isBackground && window.render) {
                window.render();
                setTimeout(() => window.render && window.render(), 100);
            }
            
            return true;
        } catch (error) {
            return Utils.handleError('マージデータ適用', error, false);
        }
    },
    
    async _updateDataCache(cacheKey, data, storageKey) {
        window.LocalStorageManager.setItem(storageKey, data);
        window.DataHooksCache.clear(cacheKey);
        window.DataHooksCache[cacheKey] = data;
        await new Promise(resolve => setTimeout(resolve, 5)); // 微小な遅延で順序保証
    },
    
    async _updateArticles(mergedData) {
        const articlesHook = window.DataHooks.useArticles();
        const currentArticles = articlesHook.articles;
        const aiLearningData = window.DataHooksCache.aiLearning;
        const wordFiltersData = window.DataHooksCache.wordFilters;
        
        const updatedArticles = currentArticles.map(article => {
            const state = mergedData.articleStates[article.id];
            let updatedArticle = { ...article };
            
            if (state) {
                updatedArticle = {
                    ...article,
                    readStatus: state.readStatus || article.readStatus,
                    readLater: state.readLater || article.readLater,
                    userRating: state.userRating || article.userRating || 0,
                    lastModified: state.lastModified || article.lastModified
                };
            }
            
            // AIスコア再計算
            if (aiLearningData && wordFiltersData) {
                updatedArticle.aiScore = window.AIScoring.calculateScore(updatedArticle, aiLearningData, wordFiltersData);
            }
            
            return updatedArticle;
        });
        
        window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
        window.DataHooksCache.clear('articles');
        window.DataHooksCache.articles = updatedArticles;
        
        if (window.state) window.state.articles = updatedArticles;
    },
    
    async _updateConfigSafely(timestamp) {
        try {
            const currentConfig = this._storage.get('minews_gist_config') || {
                encryptedToken: this.token ? this._cryptoOp(this.token, true) : null,
                gistId: this.gistId,
                isEnabled: this.isEnabled,
                configuredAt: Utils.getCurrentTime(),
                version: '1.3'
            };
            
            currentConfig.lastSyncTime = timestamp;
            currentConfig.lastUpdated = Utils.getCurrentTime();
            
            const success = this._storage.set('minews_gist_config', currentConfig);
            if (success) {
                this.lastSyncTime = timestamp;
                if (this._lastValidConfig) this._lastValidConfig.lastSyncTime = timestamp;
            }
            return success;
        } catch (error) {
            return Utils.handleError('設定更新', error, false);
        }
    },
    
    // 手動同期用エントリポイント
    async autoSync(triggerType = 'manual') {
        if (!this.isEnabled || !this.token) {
            return { success: false, reason: 'disabled_or_not_configured' };
        }
        
        if (triggerType !== 'manual') {
            this.markAsChanged();
            return { success: true, reason: 'marked_for_periodic_sync' };
        }
        
        if (this.isSyncing) return { success: false, reason: 'already_syncing' };
        
        if (window.setState) window.setState({ isSyncUpdating: true, isBackgroundSyncing: false });
        
        this.isSyncing = true;
        
        try {
            const result = await this._performSync(false);
            if (result) {
                this.lastSyncTime = Utils.getCurrentTime();
                await this._updateConfigSafely(this.lastSyncTime);
                return { success: true, triggerType: 'manual' };
            }
            return { success: false, error: 'sync_failed', triggerType: 'manual' };
        } catch (error) {
            return { success: false, error: 'sync_failed', triggerType: 'manual', details: error.message };
        } finally {
            this.isSyncing = false;
            if (window.setState) window.setState({ isSyncUpdating: false, isBackgroundSyncing: false });
        }
    },
    
    async collectSyncData() {
        const aiHook = window.DataHooks.useAILearning();
        const wordHook = window.DataHooks.useWordFilters();
        const articlesHook = window.DataHooks.useArticles();
        
        const currentTime = Utils.getCurrentTime();
        const articleStates = {};
        
        // 記事状態の収集（最適化）
        articlesHook.articles
            .filter(article => article.readStatus !== 'unread' || article.readLater === true || (article.userRating && article.userRating > 0))
            .forEach(article => {
                articleStates[article.id] = {
                    readStatus: article.readStatus || 'unread',
                    readLater: article.readLater || false,
                    userRating: article.userRating || 0,
                    lastModified: article.lastModified || currentTime
                };
            });
        
        // 興味ワード詳細データの生成（最適化）
        const interestWordsDetailed = wordHook.wordFilters.interestWords
            .map(word => ({
                word: typeof word === 'string' ? word : word.word || word,
                scope: typeof word === 'string' ? 'all' : word.scope || 'all',
                target: typeof word === 'string' ? null : word.target || null,
                rating: window.WordRatingManager?.getWordRating(typeof word === 'string' ? word : word.word || word) || 0
            }))
            .sort((a, b) => a.word.localeCompare(b.word, 'ja', { numeric: true }));
        
        return {
            version: window.CONFIG.DATA_VERSION,
            syncTime: currentTime,
            aiLearning: aiHook.aiLearning,
            wordFilters: {
                ...wordHook.wordFilters,
                lastUpdated: currentTime,
                interestWordsDetailed
            },
            articleStates,
            deletedArticleIds: [] // 必要に応じて実装
        };
    },
    
    async syncToCloud(data) {
        if (!this.token) return false;
        
        const url = this.gistId ? `https://api.github.com/gists/${this.gistId}` : 'https://api.github.com/gists';
        const method = this.gistId ? 'PATCH' : 'POST';
        
        try {
            const response = await fetch(url, {
                method,
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: Utils.safeJsonStringify({
                    description: `Minews User Data Backup - ${new Date().toLocaleString('ja-JP')}`,
                    public: false,
                    files: { "minews_data.json": { content: Utils.safeJsonStringify(data, true) } }
                })
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
            return Utils.handleError('クラウド同期', error, false);
        }
    },
    
    async syncFromCloud() {
        if (!this.token || !this.gistId) return null;
        
        try {
            const response = await fetch(`https://api.github.com/gists/${this.gistId}`, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (response.ok) {
                const gist = await response.json();
                return gist.files?.['minews_data.json'] ? 
                    Utils.safeJsonParse(gist.files['minews_data.json'].content) : null;
            }
            return null;
        } catch (error) {
            return Utils.handleError('クラウドデータ取得', error, null);
        }
    },
    
    saveGistId(gistId) {
        const currentConfig = this._storage.get('minews_gist_config');
        if (currentConfig) {
            currentConfig.gistId = gistId;
            this._storage.set('minews_gist_config', currentConfig);
            this.gistId = gistId;
            if (this._lastValidConfig) this._lastValidConfig.gistId = gistId;
        }
    },

    validateCurrentConfig() {
        const diagnostics = {
            timestamp: Utils.getCurrentTime(),
            results: []
        };

        try {
            const configStr = localStorage.getItem('minews_gist_config');
            diagnostics.results.push({
                test: 'LocalStorage存在確認',
                status: configStr ? 'PASS' : 'FAIL',
                details: configStr ? 'OK' : '設定が見つかりません'
            });

            if (configStr) {
                const config = Utils.safeJsonParse(configStr);
                if (config) {
                    diagnostics.results.push({
                        test: 'JSON解析',
                        status: 'PASS',
                        details: 'OK'
                    });

                    if (config.encryptedToken) {
                        try {
                            const decrypted = this._cryptoOp(config.encryptedToken, false);
                            diagnostics.results.push({
                                test: 'トークン復号化',
                                status: decrypted.length > 10 ? 'PASS' : 'FAIL',
                                details: decrypted.length > 10 ? 'OK' : '復号化結果が短すぎます'
                            });
                        } catch (decryptError) {
                            diagnostics.results.push({
                                test: 'トークン復号化',
                                status: 'FAIL',
                                details: decryptError.message
                            });
                        }
                    }
                } else {
                    diagnostics.results.push({
                        test: 'JSON解析',
                        status: 'FAIL',
                        details: 'JSON解析に失敗しました'
                    });
                }
            }
        } catch (error) {
            diagnostics.results.push({
                test: 'LocalStorage確認',
                status: 'ERROR',
                details: error.message
            });
        }
        return diagnostics;
    },

    async testSync() {
        const testResults = {
            timestamp: Utils.getCurrentTime(),
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
        
        try {
            const cloudData = await this.syncFromCloud();
            testResults.tests.push({
                name: 'クラウドデータ取得',
                status: cloudData ? 'pass' : 'fail',
                details: cloudData ? 'データ取得成功' : 'データ取得失敗'
            });
        } catch (error) {
            testResults.tests.push({
                name: 'クラウドデータ取得',
                status: 'fail',
                details: error.message
            });
        }
        
        return testResults;
    }
};

// キャッシュシステム（最適化版）
window.DataHooksCache = {
    clear: (key) => key ? delete this[key] && delete this.lastUpdate?.[key] : Object.keys(this).forEach(k => k !== 'clear' && k !== 'lastUpdate' && delete this[k]) && (this.lastUpdate = {}),
    lastUpdate: {}
};

// 記事データ読み込み（最適化版）
window.ArticleLoader = {
    async loadArticlesFromJSON() {
        try {
            const response = await fetch('./articles.json');
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            
            const data = await response.json();
            
            // 並列でデータを保存
            const savePromises = [];
            if (data.folders) {
                savePromises.push(window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.FOLDERS, data.folders));
                window.DataHooksCache.folders = data.folders;
            }
            if (data.feeds) {
                savePromises.push(window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.RSS_FEEDS, data.feeds));
                window.DataHooksCache.feeds = data.feeds;
            }
            
            await Promise.all(savePromises);
            
            return {
                articles: data.articles || [],
                folders: data.folders || [],
                feeds: data.feeds || [],
                lastUpdated: data.lastUpdated || Utils.getCurrentTime(),
                totalCount: data.totalCount || 0
            };
        } catch (error) {
            return Utils.handleError('記事データ読み込み', error, {
                articles: [], folders: [], feeds: [],
                lastUpdated: Utils.getCurrentTime(), totalCount: 0
            });
        }
    }
};

// AI学習システム（最適化版）
window.AIScoring = {
    calculateScore(article, aiLearning, wordFilters) {
        let rawScore = 0;
        
        // 1. キーワード評価
        if (article.keywords?.length && aiLearning.wordWeights) {
            const topKeywords = this._getTopKeywords(article.keywords, aiLearning.wordWeights);
            rawScore += this._calculateKeywordScore(topKeywords);
        }
        
        // 2. 興味ワード評価
        if (wordFilters.interestWords?.length && article.title) {
            const content = `${article.title} ${article.content}`.toLowerCase();
            const matchedWords = wordFilters.interestWords.filter(word => content.includes(word.toLowerCase()));
            
            if (matchedWords.length > 0) {
                let positiveScore = 0, negativeScore = 0, positiveCount = 0;
                
                matchedWords.forEach(word => {
                    const weight = aiLearning.wordWeights[word] || 0;
                    if (weight >= 0) {
                        positiveScore += (weight === 0 ? 8 : 8 + weight);
                        positiveCount++;
                    } else {
                        negativeScore += weight;
                    }
                });
                
                if (positiveCount > 0) {
                    rawScore += positiveScore * Math.log(positiveCount + 1);
                }
                rawScore += negativeScore;
            }
        }
        
        return Math.round(this._normalize(rawScore) * 10) / 10;
    },
    
    _getTopKeywords: (keywords, weights) => keywords
        .map(k => ({ keyword: k, weight: Math.abs(weights[k] || 0), originalWeight: weights[k] || 0 }))
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 3),
    
    _calculateKeywordScore(topKeywords) {
        if (!topKeywords.length) return 0;
        
        const individual = topKeywords.reduce((sum, item) => sum + item.originalWeight, 0);
        const combination = topKeywords.length > 1 ? 
            (topKeywords.length === 2 ? 3 : 8) * (topKeywords.reduce((sum, item) => sum + Math.abs(item.originalWeight), 0) / topKeywords.length > 5 ? 1.5 : 1.0) : 0;
        const intensity = topKeywords.reduce((sum, item) => sum + item.weight, 0) / topKeywords.length;
        const multiplier = intensity >= 8 ? 0.25 : intensity >= 3 ? 0.15 : 0.05;
        
        return (individual * 0.5) + (combination * 0.2) + (individual * multiplier * 0.12);
    },
    
    _normalize: (score) => {
        const adjusted = 50 + (score * 0.35);
        if (adjusted < 10) return Math.max(5, adjusted * 0.5 + 5);
        if (adjusted > 90) return Math.min(95, 90 + (adjusted - 90) * 0.2);
        return adjusted;
    }
};

// ワードフィルター管理（最適化版）
window.WordFilterManager = {
    addWord(word, type, wordFilters, scope = 'all', target = null) {
        word = word.trim();
        if (!word) return false;
        
        if (type === 'interest') {
            const exists = wordFilters.interestWords.some(existingWord => 
                existingWord.toLowerCase() === word.toLowerCase()
            );
            if (!exists) {
                wordFilters.interestWords.push(word);
                wordFilters.lastUpdated = Utils.getCurrentTime();
                return true;
            }
        } else {
            const normalizedScope = scope || 'all';
            const normalizedTarget = normalizedScope === 'all' ? null : (target || null);
            
            const exists = wordFilters.ngWords.some(ngWordObj => 
                ngWordObj.word.toLowerCase() === word.toLowerCase() &&
                ngWordObj.scope === normalizedScope &&
                ngWordObj.target === normalizedTarget
            );
            
            if (!exists) {
                wordFilters.ngWords.push({
                    word: word,
                    scope: normalizedScope,
                    target: normalizedTarget
                });
                wordFilters.lastUpdated = Utils.getCurrentTime();
                return true;
            }
        }
        return false;
    },
    
    removeWord(word, type, wordFilters, scope = null, target = null) {
        word = word.trim();
        
        if (type === 'interest') {
            const index = wordFilters.interestWords.indexOf(word);
            if (index > -1) {
                wordFilters.interestWords.splice(index, 1);
                wordFilters.lastUpdated = Utils.getCurrentTime();
                if (window.GistSyncManager?.isEnabled) {
                    window.GistSyncManager.markAsChanged();
                }
                return true;
            }
        } else {
            const index = wordFilters.ngWords.findIndex(ngWordObj => 
                ngWordObj.word === word &&
                (scope === null || ngWordObj.scope === scope) &&
                (target === null || ngWordObj.target === target)
            );
            
            if (index > -1) {
                wordFilters.ngWords.splice(index, 1);
                wordFilters.lastUpdated = Utils.getCurrentTime();
                if (window.GistSyncManager?.isEnabled) {
                    window.GistSyncManager.markAsChanged();
                }
                return true;
            }
        }
        return false;
    },
    
    filterArticles(articles, wordFilters) {
        if (!wordFilters.ngWords.length) return articles;
        
        return articles.filter(article => {
            const text = (article.title + ' ' + article.content).toLowerCase();
            
            return !wordFilters.ngWords.some(ngWordObj => {
                if (!text.includes(ngWordObj.word.toLowerCase())) return false;
                
                switch (ngWordObj.scope) {
                    case 'all': return true;
                    case 'folder': return article.folderName === ngWordObj.target;
                    case 'feed': return article.rssSource === ngWordObj.target;
                    default: return false;
                }
            });
        });
    }
};

// ローカルストレージ管理（最適化版）
window.LocalStorageManager = {
    setItem: (key, data) => {
        try {
            localStorage.setItem(key, Utils.safeJsonStringify({
                data, timestamp: Utils.getCurrentTime(), version: window.CONFIG.DATA_VERSION
            }));
            return true;
        } catch { return false; }
    },
    
    getItem: (key, defaultValue) => {
        try {
            const stored = localStorage.getItem(key);
            if (!stored) {
                if (defaultValue) this.setItem(key, defaultValue);
                return defaultValue;
            }
            return Utils.safeJsonParse(stored)?.data || defaultValue;
        } catch {
            if (defaultValue) this.setItem(key, defaultValue);
            return defaultValue;
        }
    },
    
    removeItem: (key) => { try { localStorage.removeItem(key); return true; } catch { return false; } },
    
    getStorageInfo: () => {
        let totalSize = 0, itemCount = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key) && key.startsWith('minews_')) {
                totalSize += localStorage[key].length;
                itemCount++;
            }
        }
        return { totalSize, itemCount, available: 5000000 - totalSize };
    }
};

// データ操作フック（最適化版）
window.DataHooks = {
    _createHook(storageKey, defaultData, cacheKey) {
        return () => {
            const stored = localStorage.getItem(storageKey);
            const timestamp = stored ? Utils.safeJsonParse(stored)?.timestamp : null;
            
            if (!window.DataHooksCache[cacheKey] || window.DataHooksCache.lastUpdate[cacheKey] !== timestamp) {
                window.DataHooksCache[cacheKey] = window.LocalStorageManager.getItem(storageKey, defaultData);
                window.DataHooksCache.lastUpdate[cacheKey] = timestamp;
            }
            
            return { [cacheKey]: window.DataHooksCache[cacheKey] };
        };
    },
    
    useArticles() {
        const hook = this._createHook(window.CONFIG.STORAGE_KEYS.ARTICLES, window.DEFAULT_DATA.articles, 'articles')();
        
        return {
            ...hook,
            addArticle(newArticle) {
                const articles = [...window.DataHooksCache.articles];
                const exists = articles.find(a => 
                    a.id === newArticle.id || a.url === newArticle.url || 
                    (a.title === newArticle.title && a.rssSource === newArticle.rssSource && a.publishDate === newArticle.publishDate)
                );
                
                if (exists) return false;
                
                if (articles.length >= window.CONFIG.MAX_ARTICLES) {
                    articles.sort((a, b) => {
                        if (a.readStatus !== b.readStatus) return (a.readStatus === 'read' ? 1 : 0) - (b.readStatus === 'read' ? 1 : 0);
                        return new Date(a.publishDate) - new Date(b.publishDate);
                    });
                    articles.pop();
                }
                
                articles.unshift(newArticle);
                this._updateCache('articles', articles);
                return true;
            },
            
            updateArticle(articleId, updates, options = {}) {
                const articles = window.DataHooksCache.articles.map(article =>
                    article.id === articleId ? { ...article, ...updates, lastModified: Utils.getCurrentTime() } : article
                );
                this._updateCache('articles', articles);
                if (window.render && !options.skipRender) window.render();
            }
        };
    },
    
    useRSSManager: () => ({
        rssFeeds: window.DataHooksCache.rssFeeds || window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.RSS_FEEDS, []),
        async fetchAllFeeds() {
            const articlesHook = window.DataHooks.useArticles();
            try {
                const data = await window.ArticleLoader.loadArticlesFromJSON();
                let addedCount = 0;
                
                data.articles.forEach(article => {
                    if (articlesHook.addArticle(article)) addedCount++;
                });
                
                if (data.folders && window.state) window.state.folders = data.folders;
                if (data.feeds && window.state) window.state.feeds = data.feeds;
                
                return {
                    totalAdded: addedCount,
                    totalSkipped: data.articles.length - addedCount,
                    totalErrors: 0,
                    totalFeeds: 1,
                    feedResults: [{ name: 'GitHub Actions RSS', success: true, added: addedCount, total: data.articles.length }],
                    lastUpdated: data.lastUpdated
                };
            } catch (error) {
                return Utils.handleError('フィード取得', error, {
                    totalAdded: 0, totalSkipped: 0, totalErrors: 1, totalFeeds: 1,
                    feedResults: [{ name: 'GitHub Actions RSS', success: false, error: error.message }]
                });
            }
        }
    }),
    
    useAILearning: () => window.DataHooks._createHook(window.CONFIG.STORAGE_KEYS.AI_LEARNING, window.DEFAULT_DATA.aiLearning, 'aiLearning')(),
    
    useWordFilters() {
        const hook = this._createHook(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, window.DEFAULT_DATA.wordFilters, 'wordFilters')();
        return {
            ...hook,
            _updateWordFilters(updater) {
                const updated = { ...window.DataHooksCache.wordFilters };
                if (updater(updated)) {
                    updated.lastUpdated = Utils.getCurrentTime();
                    this._updateCache('wordFilters', updated);
                    return true;
                }
                return false;
            },
            
            addInterestWord: (word) => this._updateWordFilters(wf => {
                if (!wf.interestWords.some(w => w.toLowerCase() === word.toLowerCase())) {
                    wf.interestWords.push(word);
                    return true;
                }
                return false;
            }),
            
            addNGWord: (word, scope = 'all', target = null) => this._updateWordFilters(wf => {
                const exists = wf.ngWords.some(ngWordObj => 
                    ngWordObj.word.toLowerCase() === word.toLowerCase() && 
                    ngWordObj.scope === scope && ngWordObj.target === target);
                if (!exists) {
                    wf.ngWords.push({ word, scope, target });
                    return true;
                }
                return false;
            }),
            
            removeInterestWord: (word) => this._updateWordFilters(wf => {
                const index = wf.interestWords.indexOf(word);
                if (index > -1) {
                    wf.interestWords.splice(index, 1);
                    return true;
                }
                return false;
            }),
            
            removeNGWord: (word, scope = null, target = null) => this._updateWordFilters(wf => {
                const index = wf.ngWords.findIndex(ngWordObj => 
                    ngWordObj.word === word && 
                    (scope === null || ngWordObj.scope === scope) && 
                    (target === null || ngWordObj.target === target));
                if (index > -1) {
                    wf.ngWords.splice(index, 1);
                    return true;
                }
                return false;
            })
        };
    },
    
    useFolders: () => window.DataHooks._createHook(window.CONFIG.STORAGE_KEYS.FOLDERS, window.DEFAULT_DATA.folders, 'folders')(),
    useFeeds: () => window.DataHooks._createHook(window.CONFIG.STORAGE_KEYS.RSS_FEEDS, window.DEFAULT_DATA.feeds, 'feeds')(),
    
    _updateCache(cacheKey, data) {
        const storageKeys = {
            articles: window.CONFIG.STORAGE_KEYS.ARTICLES,
            wordFilters: window.CONFIG.STORAGE_KEYS.WORD_FILTERS
        };
        
        if (storageKeys[cacheKey]) {
            window.LocalStorageManager.setItem(storageKeys[cacheKey], data);
            window.DataHooksCache[cacheKey] = data;
            window.DataHooksCache.lastUpdate[cacheKey] = Utils.getCurrentTime();
            if (window.state && window.state[cacheKey]) window.state[cacheKey] = data;
        }
    }
};

// エクスポート・インポート機能（最適化版）
window.exportMinewsData = () => {
    const aiHook = window.DataHooks.useAILearning();
    const wordHook = window.DataHooks.useWordFilters();
    const articlesHook = window.DataHooks.useArticles();
    
    const articleStates = Object.fromEntries(
        articlesHook.articles
            .filter(article => article.readStatus !== 'unread' || article.readLater || (article.userRating > 0))
            .map(article => [article.id, {
                readStatus: article.readStatus || 'unread',
                readLater: article.readLater || false,
                userRating: article.userRating || 0,
                lastModified: article.lastModified || Utils.getCurrentTime(),
                title: article.title,
                url: article.url
            }])
    );
    
    const stats = {
        totalArticles: articlesHook.articles.length,
        statesRead: Object.values(articleStates).filter(s => s.readStatus === 'read').length,
        statesReadLater: Object.values(articleStates).filter(s => s.readLater).length
    };
    
    const exportData = {
        version: window.CONFIG.DATA_VERSION,
        exportDate: Utils.getCurrentTime(),
        exportType: 'complete_evaluation_state',
        aiLearning: { ...aiHook.aiLearning, wordWeights: { ...aiHook.aiLearning.wordWeights } },
        wordFilters: { ...wordHook.wordFilters },
        articleStates,
        statistics: stats
    };
    
    // ファイルダウンロード
    const blob = new Blob([Utils.safeJsonStringify(exportData, true)], { type: "application/json" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `minews_complete_state_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    
    alert(`完全な評価状態データのエクスポートが完了しました\n記事状態: ${stats.totalArticles}件\n既読: ${stats.statesRead}件`);
};

window.importMinewsData = async function(file) {
    try {
        const text = await file.text();
        const importData = Utils.safeJsonParse(text);
        
        if (!importData?.aiLearning || !importData?.wordFilters) {
            throw new Error('無効なデータ形式です。必要なデータが不足しています。');
        }
        
        const aiHook = window.DataHooks.useAILearning();
        const wordHook = window.DataHooks.useWordFilters();
        const articlesHook = window.DataHooks.useArticles();
        
        // AI学習データの復元
        aiHook.aiLearning.wordWeights = {};
        Object.entries(importData.aiLearning.wordWeights || {}).forEach(([word, weight]) => {
            aiHook.aiLearning.wordWeights[word] = Math.max(-60, Math.min(60, weight));
        });
        
        // ワードフィルターの復元
        wordHook.wordFilters.interestWords.length = 0;
        wordHook.wordFilters.ngWords.length = 0;
        
        (importData.wordFilters.interestWords || []).forEach(word => {
            if (!wordHook.wordFilters.interestWords.includes(word)) {
                wordHook.wordFilters.interestWords.push(word);
            }
        });
        
        (importData.wordFilters.ngWords || []).forEach(word => {
            if (!wordHook.wordFilters.ngWords.includes(word)) {
                wordHook.wordFilters.ngWords.push(word);
            }
        });
        
        // 記事状態の復元
        if (importData.articleStates && typeof importData.articleStates === 'object') {
            const currentArticles = articlesHook.articles;
            let restoredCount = 0;
            
            const updatedArticles = currentArticles.map(article => {
                const state = importData.articleStates[article.id];
                if (state) {
                    restoredCount++;
                    
                    let updatedArticle = {
                        ...article,
                        readStatus: state.readStatus || 'unread',
                        readLater: state.readLater || false,
                        userRating: state.userRating || 0,
                        lastModified: state.lastModified || article.lastModified || Utils.getCurrentTime()
                    };
                    
                    updatedArticle.aiScore = window.AIScoring.calculateScore(
                        updatedArticle, aiHook.aiLearning, wordHook.wordFilters
                    );
                    
                    return updatedArticle;
                }
                
                const recalculatedArticle = { ...article };
                recalculatedArticle.aiScore = window.AIScoring.calculateScore(
                    recalculatedArticle, aiHook.aiLearning, wordHook.wordFilters
                );
                return recalculatedArticle;
            });
            
            window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
            window.DataHooksCache.articles = updatedArticles;
            window.DataHooksCache.lastUpdate.articles = Utils.getCurrentTime();
            
            if (window.state) window.state.articles = updatedArticles;
        }
        
        // データの保存
        aiHook.aiLearning.lastUpdated = Utils.getCurrentTime();
        wordHook.wordFilters.lastUpdated = Utils.getCurrentTime();
        
        window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, aiHook.aiLearning);
        window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, wordHook.wordFilters);
        
        window.DataHooksCache.clear('aiLearning');
        window.DataHooksCache.clear('wordFilters');
        window.DataHooksCache.aiLearning = aiHook.aiLearning;
        window.DataHooksCache.wordFilters = wordHook.wordFilters;
        
        if (window.render) {
            window.render();
            setTimeout(() => {
                if (window.render) {
                    window.render();
                    console.log('最終画面更新完了 - 点数計算が反映されました');
                }
            }, 100);
        }
        
        const stats = importData.statistics || {};
        alert(`✅ 評価状態の完全復元が成功しました！\n\n` +
              `📊 復元統計:\n` +
              `• 総記事数: ${stats.totalArticles || '不明'}\n` +
              `• 既読記事: ${stats.statesRead || '不明'}\n` +
              `• 後で読む記事: ${stats.statesReadLater || '不明'}\n\n` +
              `🔄 点数計算が更新され、エクスポート元と同じ状態が復元されました`);
        
    } catch (error) {
        console.error('インポート詳細エラー:', error);
        alert(`❌ インポートエラーが発生しました:\n${error.message}\n\nファイル形式を確認してください。`);
    }
};

window.handleExportLearningData = window.exportMinewsData;
window.handleImportLearningData = (event) => {
    const file = event.target.files[0];
    if (file) window.importMinewsData(file);
    event.target.value = '';
};

})();
