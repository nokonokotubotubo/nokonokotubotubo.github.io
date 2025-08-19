// Minews PWA - データ管理・処理レイヤー（削除評価保護対応版）
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

// ワード評価管理システム（削除記録保護版）
window.WordRatingManager = {
    STORAGE_KEY: 'minews_keyword_ratings',
    AUTO_ADDED_KEY: 'minews_auto_added_words',
    DELETED_WORDS_KEY: 'minews_deleted_ratings', // 【追加】削除記録用キー
    
    getWordRating(word) {
        try {
            const ratings = localStorage.getItem(this.STORAGE_KEY);
            return ratings ? (JSON.parse(ratings)[word] || 0) : 0;
        } catch {
            return 0;
        }
    },
    
    // 【追加】削除記録の管理
    getDeletedWords() {
        try {
            const deleted = localStorage.getItem(this.DELETED_WORDS_KEY);
            return deleted ? JSON.parse(deleted) : {};
        } catch {
            return {};
        }
    },
    
    markAsDeleted(word) {
        try {
            const deleted = this.getDeletedWords();
            deleted[word] = new Date().toISOString();
            localStorage.setItem(this.DELETED_WORDS_KEY, JSON.stringify(deleted));
        } catch (error) {
            console.error('削除記録の保存に失敗:', error);
        }
    },
    
    isDeleted(word) {
        const deleted = this.getDeletedWords();
        return word in deleted;
    },
    
    saveWordRating(word, rating) {
        try {
            const ratings = this.getAllRatings();
            const autoAdded = this.getAutoAddedWords();
            const normalizedRating = Math.max(0, Math.min(5, parseInt(rating)));
            
            if (normalizedRating > 0) {
                ratings[word] = normalizedRating;
                
                // 削除記録から除去（再評価された場合）
                const deleted = this.getDeletedWords();
                if (word in deleted) {
                    delete deleted[word];
                    localStorage.setItem(this.DELETED_WORDS_KEY, JSON.stringify(deleted));
                }
                
                // 自動追加の記録
                if (this._addToInterestWords(word)) {
                    autoAdded[word] = true;
                    localStorage.setItem(this.AUTO_ADDED_KEY, JSON.stringify(autoAdded));
                }
            } else {
                // 【修正】評価削除時の処理 - 削除記録を追加
                delete ratings[word];
                this.markAsDeleted(word); // 削除記録
                
                // 自動追加されたワードの場合は興味ワードからも削除
                if (autoAdded[word]) {
                    this._removeFromInterestWords(word);
                    delete autoAdded[word];
                    localStorage.setItem(this.AUTO_ADDED_KEY, JSON.stringify(autoAdded));
                }
            }
            
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(ratings));
            this._updateAILearningFromRating(word, normalizedRating);
            return true;
        } catch {
            return false;
        }
    },
    
    getAllRatings() {
        try {
            const ratings = localStorage.getItem(this.STORAGE_KEY);
            return ratings ? JSON.parse(ratings) : {};
        } catch {
            return {};
        }
    },
    
    getAutoAddedWords() {
        try {
            const autoAdded = localStorage.getItem(this.AUTO_ADDED_KEY);
            return autoAdded ? JSON.parse(autoAdded) : {};
        } catch {
            return {};
        }
    },
    
    _addToInterestWords(word) {
        try {
            const wordHook = window.DataHooks.useWordFilters();
            const wordFilters = { ...wordHook.wordFilters };
            
            if (!wordFilters.interestWords.includes(word)) {
                wordFilters.interestWords.push(word);
                wordFilters.lastUpdated = new Date().toISOString();
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, wordFilters);
                window.DataHooksCache.clear('wordFilters');
                window.DataHooksCache.wordFilters = wordFilters;
                console.log(`自動追加: 興味ワード「${word}」`);
                return true; // 新規追加された
            }
            return false; // 既に存在していた
        } catch (error) {
            console.error('興味ワード自動追加エラー:', error);
            return false;
        }
    },
    
    _removeFromInterestWords(word) {
        try {
            const wordHook = window.DataHooks.useWordFilters();
            const wordFilters = { ...wordHook.wordFilters };
            
            const index = wordFilters.interestWords.indexOf(word);
            if (index > -1) {
                wordFilters.interestWords.splice(index, 1);
                wordFilters.lastUpdated = new Date().toISOString();
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, wordFilters);
                window.DataHooksCache.clear('wordFilters');
                window.DataHooksCache.wordFilters = wordFilters;
                console.log(`自動削除: 興味ワード「${word}」`);
                return true;
            }
            return false;
        } catch (error) {
            console.error('興味ワード自動削除エラー:', error);
            return false;
        }
    },
    
    _updateAILearningFromRating(word, rating) {
        try {
            const aiHook = window.DataHooks.useAILearning();
            const aiLearning = { ...aiHook.aiLearning };
            const weightMapping = { 1: -10, 2: -5, 3: 0, 4: 5, 5: 10 };
            const weight = weightMapping[rating] || 0;
            
            if (rating > 0) {
                aiLearning.wordWeights[word] = weight;
            } else {
                delete aiLearning.wordWeights[word];
            }
            
            aiLearning.lastUpdated = new Date().toISOString();
            window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, aiLearning);
            window.DataHooksCache.clear('aiLearning');
            window.DataHooksCache.aiLearning = aiLearning;
        } catch (error) {
            console.error('AI学習データの更新に失敗:', error);
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
    generateStableId(url, title, publishDate = null) {
        const baseString = `${url.trim().toLowerCase()}|${title.trim()}${publishDate ? '|' + publishDate : ''}`;
        return this._simpleHash(baseString);
    },
    
    _simpleHash(str) {
        let hash = 0;
        if (str.length === 0) return 'stable_' + Date.now();
        
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        
        const hashStr = Math.abs(hash).toString(36);
        return `stable_${hashStr}_${str.length}`;
    }
};

// GitHub Gist同期システム（削除評価保護版）
window.GistSyncManager = {
    token: null,
    gistId: null,
    isEnabled: false,
    isSyncing: false,
    lastSyncTime: null,
    periodicSyncEnabled: false,
    periodicSyncInterval: null,
    pendingChanges: false,
    lastChangeTime: null,
    _isBackgroundSyncing: false,
    _configValidated: false,
    _lastValidConfig: null,
    
    _cryptoOp(text, isEncrypt, key = 'minews_secret_key') {
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
            console.error(`${isEncrypt ? '暗号化' : '復号化'}エラー:`, error);
            throw new Error(`${isEncrypt ? '暗号化' : '復号化'}処理に失敗しました`);
        }
    },
    
    _encrypt(text, key) { return this._cryptoOp(text, true, key); },
    _decrypt(text, key) { return this._cryptoOp(text, false, key); },
    
    _safeStorage: {
        get(key, defaultValue = null) {
            try {
                const data = localStorage.getItem(key);
                return data ? JSON.parse(data) : defaultValue;
            } catch {
                return defaultValue;
            }
        },
        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch {
                return false;
            }
        }
    },

    _log(level, msg, data = null) {
        if (level === 'error' || (typeof window !== 'undefined' && window.location?.hostname === 'localhost')) {
            console[level](msg, data);
        }
    },

    _jsonSafe: {
        str(obj, format = false) { return JSON.stringify(obj, null, format ? 2 : 0); },
        parse(str, def = null) { try { return JSON.parse(str); } catch { return def; } }
    },
    
    loadConfig() {
        try {
            const configStr = localStorage.getItem('minews_gist_config');
            if (!configStr) return null;

            let parsed = this._jsonSafe.parse(configStr);
            if (!parsed) {
                if (this._lastValidConfig) return this._lastValidConfig;
                throw new Error('設定解析に失敗しました');
            }

            let decryptedToken = null;
            if (parsed.encryptedToken) {
                try {
                    decryptedToken = this._decrypt(parsed.encryptedToken);
                } catch {
                    if (this._lastValidConfig?.hasToken) {
                        this.token = this.token;
                        this.isEnabled = true;
                    } else {
                        this.token = null;
                        this.isEnabled = false;
                    }
                }
            } else {
                decryptedToken = null;
                this.isEnabled = false;
            }

            if (decryptedToken) {
                this.token = decryptedToken;
                this.isEnabled = true;
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
            console.error('設定読み込み中の重大エラー:', error);
            
            if (this._lastValidConfig) return this._lastValidConfig;
            
            return {
                hasToken: false,
                gistId: this.gistId || null,
                isEnabled: false,
                configuredAt: null,
                lastSyncTime: this.lastSyncTime || null,
                error: error.message
            };
        }
    },

    init(token, gistId = null) {
        if (!token?.trim()) throw new Error('有効なトークンが必要です');

        let encryptedToken;
        try {
            encryptedToken = this._encrypt(token.trim());
            const testDecrypted = this._decrypt(encryptedToken);
            if (testDecrypted !== token.trim()) {
                throw new Error('暗号化処理の整合性確認に失敗');
            }
        } catch (error) {
            throw new Error('トークンの暗号化処理に失敗しました: ' + error.message);
        }

        const existingConfig = this.loadConfig();
        
        this.token = token.trim();
        this.gistId = gistId?.trim() || existingConfig?.gistId || null;
        this.isEnabled = true;

        const configData = {
            encryptedToken: encryptedToken,
            gistId: this.gistId,
            isEnabled: this.isEnabled,
            configuredAt: new Date().toISOString(),
            lastSyncTime: this.lastSyncTime || existingConfig?.lastSyncTime || null,
            version: '1.2'
        };

        if (!this._safeStorage.set('minews_gist_config', configData)) {
            throw new Error('設定の保存に失敗しました');
        }

        this._lastValidConfig = {
            hasToken: true,
            gistId: this.gistId,
            isEnabled: true,
            configuredAt: configData.configuredAt,
            lastSyncTime: this.lastSyncTime
        };
        this._configValidated = true;

        this._initializeSafely();

        if (this.isEnabled) {
            this.startPeriodicSync(60);
        }
    },

    startPeriodicSync(intervalSeconds = 60) {
        if (this.periodicSyncInterval) {
            clearInterval(this.periodicSyncInterval);
        }
        
        this.periodicSyncEnabled = true;
        this.periodicSyncInterval = setInterval(async () => {
            await this._executePeriodicSync();
        }, intervalSeconds * 1000);
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
        this.lastChangeTime = new Date().toISOString();
    },

    async _executePeriodicSync() {
        if (!this.isEnabled || !this.token || this.isSyncing) return false;
        
        this.isSyncing = true;
        this._isBackgroundSyncing = true;
        
        try {
            const cloudData = await this.syncFromCloud();
            const localData = await this.collectSyncData();
            const mergedData = this._mergeData(localData, cloudData);
            const uploadResult = await this.syncToCloud(mergedData);
            
            if (uploadResult) {
                await this._applyMergedDataSilentBatch(mergedData);
                await this._updateConfigSafely(new Date().toISOString());
                this.pendingChanges = false;
                
                if (window.render) {
                    setTimeout(() => window.render(), 100);
                }
                return true;
            }
            return false;
        } catch (error) {
            console.error('シンプル同期エラー:', error);
            return false;
        } finally {
            this.isSyncing = false;
            this._isBackgroundSyncing = false;
        }
    },

    _mergeData(localData, cloudData) {
        if (!cloudData) return localData;
        
        return {
            version: window.CONFIG.DATA_VERSION,
            syncTime: new Date().toISOString(),
            aiLearning: this._mergeAILearning(localData.aiLearning, cloudData.aiLearning),
            wordFilters: this._mergeWordFilters(localData.wordFilters, cloudData.wordFilters),
            articleStates: this._mergeArticleStates(
                localData.articleStates, 
                cloudData.articleStates,
                localData.deletedArticleIds || []
            )
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
            lastUpdated: new Date().toISOString()
        };
    },

    _mergeWordFilters(localWords, cloudWords) {
        if (!cloudWords) return localWords;
        if (!localWords) return cloudWords;
        
        const localTime = new Date(localWords.lastUpdated || 0).getTime();
        const cloudTime = new Date(cloudWords.lastUpdated || 0).getTime();
        
        const mergedWords = {
            interestWords: [],
            ngWords: [],
            lastUpdated: new Date(Math.max(localTime, cloudTime)).toISOString()
        };
        
        // 興味ワードのマージ（重複排除と評価情報保持）
        const allInterestWords = new Map();
        
        // ローカルの興味ワードを処理
        (localWords.interestWords || []).forEach(word => {
            const wordStr = typeof word === 'string' ? word : word.word || word;
            const rating = window.WordRatingManager?.getWordRating(wordStr) || 0;
            allInterestWords.set(wordStr, {
                word: wordStr,
                scope: 'all',
                target: null,
                rating: rating,
                source: 'local'
            });
        });
        
        // クラウドの興味ワードを処理
        if (cloudWords.interestWordsDetailed) {
            cloudWords.interestWordsDetailed.forEach(wordObj => {
                const wordStr = wordObj.word;
                const existing = allInterestWords.get(wordStr);
                
                if (!existing) {
                    allInterestWords.set(wordStr, {
                        word: wordStr,
                        scope: wordObj.scope || 'all',
                        target: wordObj.target || null,
                        rating: wordObj.rating || 0,
                        source: 'cloud'
                    });
                } else {
                    // 既存がある場合、評価の高い方を採用
                    if (wordObj.rating > existing.rating) {
                        existing.rating = wordObj.rating;
                        existing.scope = wordObj.scope || existing.scope;
                        existing.target = wordObj.target || existing.target;
                        existing.source = 'merged';
                    }
                }
            });
        } else if (cloudWords.interestWords) {
            // 従来形式のクラウドデータへの対応
            (cloudWords.interestWords || []).forEach(word => {
                const wordStr = typeof word === 'string' ? word : word.word || word;
                if (!allInterestWords.has(wordStr)) {
                    allInterestWords.set(wordStr, {
                        word: wordStr,
                        scope: 'all',
                        target: null,
                        rating: 0,
                        source: 'cloud'
                    });
                }
            });
        }
        
        // 詳細情報から基本配列を生成
        mergedWords.interestWordsDetailed = Array.from(allInterestWords.values())
            .sort((a, b) => a.word.localeCompare(b.word, 'ja', { numeric: true }));
        
        // 従来形式との互換性のため、基本配列も生成
        mergedWords.interestWords = mergedWords.interestWordsDetailed.map(item => item.word);
        
        // NGワードのマージ
        const allNGWords = new Set();
        (localWords.ngWords || []).forEach(word => allNGWords.add(JSON.stringify(word)));
        (cloudWords.ngWords || []).forEach(word => allNGWords.add(JSON.stringify(word)));
        mergedWords.ngWords = Array.from(allNGWords)
            .map(wordStr => JSON.parse(wordStr))
            .sort((a, b) => {
                const wordA = typeof a === 'string' ? a : a.word || a;
                const wordB = typeof b === 'string' ? b : b.word || b;
                return wordA.localeCompare(wordB, 'ja', { numeric: true });
            });
        
        return mergedWords;
    },

    _mergeArticleStates(localStates, cloudStates, deletedIds = []) {
        if (!cloudStates) return localStates;
        if (!localStates) return cloudStates;
        
        const articlesHook = window.DataHooks.useArticles();
        const currentArticleIds = new Set(articlesHook.articles.map(article => article.id));
        const mergedStates = {};
        
        const allRelevantIds = new Set([...Object.keys(localStates), ...Object.keys(cloudStates)]);
        
        allRelevantIds.forEach(articleId => {
            if (!currentArticleIds.has(articleId) || deletedIds.includes(articleId)) return;
            
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

    // 【修正】削除された評価を考慮した同期処理
    async _applyMergedDataSilentBatch(mergedData) {
        try {
            const batchUpdates = {};
            
            if (mergedData.aiLearning) batchUpdates.aiLearning = mergedData.aiLearning;
            if (mergedData.wordFilters) {
                batchUpdates.wordFilters = mergedData.wordFilters;
                
                // 【修正】削除された評価を考慮した同期処理
                if (mergedData.wordFilters.interestWordsDetailed && window.WordRatingManager) {
                    // 現在のローカル評価を取得
                    const currentRatings = window.WordRatingManager.getAllRatings();
                    const deletedWords = window.WordRatingManager.getDeletedWords();
                    
                    // クラウドの評価データを処理
                    mergedData.wordFilters.interestWordsDetailed.forEach(wordObj => {
                        const word = wordObj.word;
                        const cloudRating = wordObj.rating || 0;
                        
                        // ローカルで削除されたワードはクラウドデータを無視
                        if (!deletedWords[word] && cloudRating > 0) {
                            const localRating = currentRatings[word] || 0;
                            // より新しい評価または高い評価を採用
                            const finalRating = Math.max(localRating, cloudRating);
                            if (finalRating > 0) {
                                window.WordRatingManager.saveWordRating(word, finalRating);
                            }
                        }
                    });
                }
            }
            
            if (mergedData.articleStates) {
                const articlesHook = window.DataHooks.useArticles();
                const currentArticles = articlesHook.articles;
                const aiLearningData = mergedData.aiLearning || window.DataHooksCache.aiLearning;
                const wordFiltersData = mergedData.wordFilters || window.DataHooksCache.wordFilters;
                
                const updatedArticles = currentArticles.map(article => {
                    const state = mergedData.articleStates[article.id];
                    let updatedArticle = { ...article };
                    
                    if (state) {
                        updatedArticle = {
                            ...article,
                            readStatus: state.readStatus || article.readStatus,
                            readLater: state.readLater || article.readLater,
                            lastModified: state.lastModified || article.lastModified
                        };
                    }
                    
                    updatedArticle.aiScore = window.AIScoring.calculateScore(
                        updatedArticle, aiLearningData, wordFiltersData
                    );
                    
                    return updatedArticle;
                });
                
                batchUpdates.articles = updatedArticles;
            }
            
            await this._executeBatchUpdate(batchUpdates);
            return true;
        } catch (error) {
            console.error('順序安定化一括更新エラー:', error);
            return false;
        }
    },

    async _executeBatchUpdate(batchUpdates) {
        const updateSequence = [
            { key: 'aiLearning', storageKey: window.CONFIG.STORAGE_KEYS.AI_LEARNING, cacheKey: 'aiLearning' },
            { key: 'wordFilters', storageKey: window.CONFIG.STORAGE_KEYS.WORD_FILTERS, cacheKey: 'wordFilters' }
        ];
        
        for (const update of updateSequence) {
            if (batchUpdates[update.key]) {
                window.LocalStorageManager.setItem(update.storageKey, batchUpdates[update.key]);
                window.DataHooksCache.clear(update.cacheKey);
                window.DataHooksCache[update.cacheKey] = batchUpdates[update.key];
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
        
        if (batchUpdates.articles) {
            const updatedAILearning = window.DataHooksCache.aiLearning;
            const updatedWordFilters = window.DataHooksCache.wordFilters;
            
            const recalculatedArticles = batchUpdates.articles.map(article => ({
                ...article,
                aiScore: window.AIScoring.calculateScore(article, updatedAILearning, updatedWordFilters)
            }));
            
            window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.ARTICLES, recalculatedArticles);
            window.DataHooksCache.clear('articles');
            window.DataHooksCache.articles = recalculatedArticles;
            
            if (window.state) window.state.articles = recalculatedArticles;
        }
    },

    async _updateConfigSafely(timestamp) {
        try {
            let currentConfig = this._safeStorage.get('minews_gist_config');
            
            if (!currentConfig && this.token && this.gistId && this.isEnabled) {
                currentConfig = {
                    encryptedToken: this._encrypt(this.token),
                    gistId: this.gistId,
                    isEnabled: this.isEnabled,
                    configuredAt: new Date().toISOString(),
                    version: '1.2',
                    recreated: true
                };
            }
            
            if (currentConfig) {
                currentConfig.lastSyncTime = timestamp;
                currentConfig.lastUpdated = new Date().toISOString();
                
                this._safeStorage.set('minews_gist_config', currentConfig);
                this.lastSyncTime = timestamp;
                
                if (this._lastValidConfig) {
                    this._lastValidConfig.lastSyncTime = timestamp;
                }
                return true;
            }
            return false;
        } catch (error) {
            console.error('設定更新エラー:', error);
            return false;
        }
    },

    // 【修正】手動同期での削除評価保護処理
    async _applyMergedDataToLocal(mergedData) {
        try {
            if (mergedData.aiLearning) {
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, mergedData.aiLearning);
                window.DataHooksCache.clear('aiLearning');
                window.DataHooksCache.aiLearning = mergedData.aiLearning;
            }
            
            if (mergedData.wordFilters) {
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, mergedData.wordFilters);
                window.DataHooksCache.clear('wordFilters');
                window.DataHooksCache.wordFilters = mergedData.wordFilters;
                
                // 【修正】削除された評価を保護する同期処理
                if (mergedData.wordFilters.interestWordsDetailed && window.WordRatingManager) {
                    // 現在のローカル削除記録を確認
                    const deletedWords = window.WordRatingManager.getDeletedWords();
                    const currentRatings = window.WordRatingManager.getAllRatings();
                    
                    mergedData.wordFilters.interestWordsDetailed.forEach(wordObj => {
                        const word = wordObj.word;
                        const cloudRating = wordObj.rating || 0;
                        
                        // ローカルで削除されたワードは同期しない
                        if (!deletedWords[word]) {
                            // ローカルに評価が存在しない場合のみクラウドの評価を適用
                            if (!(word in currentRatings) && cloudRating > 0) {
                                window.WordRatingManager.saveWordRating(word, cloudRating);
                            }
                        }
                    });
                }
            }
            
            if (mergedData.articleStates) {
                const articlesHook = window.DataHooks.useArticles();
                const currentArticles = articlesHook.articles;
                const aiLearningData = window.DataHooksCache.aiLearning || window.DataHooks.useAILearning().aiLearning;
                const wordFiltersData = window.DataHooksCache.wordFilters || window.DataHooks.useWordFilters().wordFilters;
                
                const updatedArticles = currentArticles.map(article => {
                    const state = mergedData.articleStates[article.id];
                    let updatedArticle = { ...article };
                    
                    if (state) {
                        updatedArticle = {
                            ...article,
                            readStatus: state.readStatus,
                            readLater: state.readLater,
                            lastModified: state.lastModified || article.lastModified
                        };
                    }
                    
                    updatedArticle.aiScore = window.AIScoring.calculateScore(updatedArticle, aiLearningData, wordFiltersData);
                    return updatedArticle;
                });
                
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
                window.DataHooksCache.clear('articles');
                window.DataHooksCache.articles = updatedArticles;
                
                if (window.state) window.state.articles = updatedArticles;
                
                if (window.render) {
                    window.render();
                    setTimeout(() => {
                        if (window.render) window.render();
                    }, 100);
                }
            }
            return true;
        } catch (error) {
            console.error('手動同期ローカルデータ更新エラー:', error);
            return false;
        }
    },
    
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

    async _executeManualSync() {
        if (this.isSyncing) return { success: false, reason: 'already_syncing' };
        
        if (window.setState) {
            window.setState({ isSyncUpdating: true, isBackgroundSyncing: false });
        }
        
        this.isSyncing = true;
        
        try {
            const cloudData = await this.syncFromCloud();
            const localData = await this.collectSyncData();
            const mergedData = this._mergeData(localData, cloudData);
            const uploadResult = await this.syncToCloud(mergedData);
            
            if (uploadResult) {
                await this._applyMergedDataToLocal(mergedData);
                this.lastSyncTime = new Date().toISOString();
                await this._updateConfigSafely(this.lastSyncTime);
                this.pendingChanges = false;
                return { success: true, triggerType: 'manual' };
            }
            
            return { success: false, error: 'sync_failed', triggerType: 'manual' };
        } catch (error) {
            console.error('手動同期エラー:', error);
            return { success: false, error: 'sync_failed', triggerType: 'manual' };
        } finally {
            this.isSyncing = false;
            if (window.setState) {
                window.setState({ isSyncUpdating: false, isBackgroundSyncing: false });
            }
        }
    },

    _isCurrentlyBackgroundSyncing() {
        return this._isBackgroundSyncing || false;
    },

    _initializeSafely() {
        this._isBackgroundSyncing = false;
        try {
            const configStr = localStorage.getItem('minews_gist_config');
            if (configStr) {
                const config = this._jsonSafe.parse(configStr);
                return !!(config?.encryptedToken && config?.gistId);
            }
            return false;
        } catch {
            return false;
        }
    },

    _shouldPullFromCloud(cloudTimestamp) {
        if (!cloudTimestamp || !this.lastSyncTime) return true;
        try {
            const cloudTime = new Date(cloudTimestamp).getTime();
            const localTime = new Date(this.lastSyncTime).getTime();
            return cloudTime > localTime;
        } catch {
            return true;
        }
    },
    
    async collectSyncData() {
        const aiHook = window.DataHooks.useAILearning();
        const wordHook = window.DataHooks.useWordFilters();
        const articlesHook = window.DataHooks.useArticles();
        
        const articleStates = {};
        const currentTime = new Date().toISOString();
        const currentArticleIds = new Set(articlesHook.articles.map(article => article.id));
        
        articlesHook.articles.forEach(article => {
            const hasAnyCustomState = article.readStatus !== 'unread' || article.readLater === true;
            if (hasAnyCustomState) {
                articleStates[article.id] = {
                    readStatus: article.readStatus || 'unread',
                    readLater: article.readLater || false,
                    lastModified: article.lastModified || currentTime
                };
            }
        });
        
        this._cleanupOldArticleStates(currentArticleIds);
        const deletedArticleIds = await this._collectDeletedArticleIds(currentArticleIds);
        
        const enrichedWordFilters = {
            ...wordHook.wordFilters,
            lastUpdated: currentTime,
            interestWordsDetailed: wordHook.wordFilters.interestWords.map(word => {
                const rating = window.WordRatingManager?.getWordRating(word) || 0;
                return {
                    word: typeof word === 'string' ? word : word.word || word,
                    scope: typeof word === 'string' ? 'all' : word.scope || 'all',
                    target: typeof word === 'string' ? null : word.target || null,
                    rating: rating
                };
            }).sort((a, b) => a.word.localeCompare(b.word, 'ja', { numeric: true }))
        };
        
        return {
            version: window.CONFIG.DATA_VERSION,
            syncTime: currentTime,
            aiLearning: aiHook.aiLearning,
            wordFilters: enrichedWordFilters,
            articleStates: articleStates,
            deletedArticleIds: deletedArticleIds
        };
    },

    async _collectDeletedArticleIds(currentArticleIds) {
        const deletedIds = [];
        try {
            const cloudData = await this.syncFromCloud();
            if (!cloudData?.articleStates) return deletedIds;
            
            Object.keys(cloudData.articleStates).forEach(articleId => {
                if (!currentArticleIds.has(articleId)) {
                    deletedIds.push(articleId);
                }
            });
        } catch (error) {
            this._log('warn', 'クラウドからの削除対象記事ID収集エラー:', error);
        }
        return deletedIds;
    },

    _cleanupOldArticleStates(currentArticleIds) {
        try {
            const lastCleanupKey = 'minews_last_cleanup';
            const lastCleanup = this._safeStorage.get(lastCleanupKey);
            const now = Date.now();
            
            if (lastCleanup && (now - parseInt(lastCleanup)) < 86400000) return;
            
            const articlesData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.ARTICLES, []);
            if (Array.isArray(articlesData)) {
                const validArticles = articlesData.filter(article => currentArticleIds.has(article.id));
                const removedCount = articlesData.length - validArticles.length;
                
                if (removedCount > 0) {
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.ARTICLES, validArticles);
                }
            }
            
            this._safeStorage.set(lastCleanupKey, now.toString());
        } catch {
            // クリーンアップエラーは無視
        }
    },

    async syncToCloud(data) {
        if (!this.token) return false;
        
        const payload = {
            description: `Minews User Data Backup - ${new Date().toLocaleString('ja-JP')}`,
            public: false,
            files: {
                "minews_data.json": {
                    content: this._jsonSafe.str(data, true)
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
                body: this._jsonSafe.str(payload)
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
            console.error('クラウド同期エラー:', error);
            return false;
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
                if (gist.files?.['minews_data.json']) {
                    return this._jsonSafe.parse(gist.files['minews_data.json'].content);
                }
            }
            return null;
        } catch (error) {
            console.error('クラウドデータ取得エラー:', error);
            return null;
        }
    },
    
    saveGistId(gistId) {
        try {
            const currentConfigStr = localStorage.getItem('minews_gist_config');
            if (!currentConfigStr) return;

            const config = this._jsonSafe.parse(currentConfigStr);
            if (config) {
                config.gistId = gistId;
                config.lastSyncTime = this.lastSyncTime || null;
                this._safeStorage.set('minews_gist_config', config);
                this.gistId = gistId;
                
                if (this._lastValidConfig) {
                    this._lastValidConfig.gistId = gistId;
                }
            }
        } catch (error) {
            console.error('GistID保存エラー:', error);
            this.gistId = gistId;
        }
    },

    validateCurrentConfig() {
        const diagnostics = {
            timestamp: new Date().toISOString(),
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
                const config = this._jsonSafe.parse(configStr);
                if (config) {
                    diagnostics.results.push({
                        test: 'JSON解析',
                        status: 'PASS',
                        details: 'OK'
                    });

                    if (config.encryptedToken) {
                        try {
                            const decrypted = this._decrypt(config.encryptedToken);
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

// キャッシュシステム
window.DataHooksCache = {
    articles: null,
    rssFeeds: null,
    folders: null,
    feeds: null,
    aiLearning: null,
    wordFilters: null,
    lastUpdate: {
        articles: null, rssFeeds: null, folders: null, feeds: null, aiLearning: null, wordFilters: null
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

// 記事データ読み込み
window.ArticleLoader = {
    async loadArticlesFromJSON() {
        try {
            const response = await fetch('./articles.json');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            
            if (data.folders) {
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.FOLDERS, data.folders);
                window.DataHooksCache.folders = data.folders;
            }
            
            if (data.feeds) {
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.RSS_FEEDS, data.feeds);
                window.DataHooksCache.feeds = data.feeds;
            }
            
            return {
                articles: data.articles || [],
                folders: data.folders || [],
                feeds: data.feeds || [],
                lastUpdated: data.lastUpdated || new Date().toISOString(),
                totalCount: data.totalCount || 0
            };
        } catch (error) {
            console.error('記事データの読み込みに失敗しました:', error);
            return {
                articles: [],
                folders: [],
                feeds: [],
                lastUpdated: new Date().toISOString(),
                totalCount: 0
            };
        }
    }
};

// AI学習システム（スコア計算精度向上版）
window.AIScoring = {
    calculateScore(article, aiLearning, wordFilters) {
        let rawScore = 0;
        
        // 1. 記事キーワードによるAI評価
        if (article.keywords?.length && aiLearning.wordWeights) {
            const topKeywords = this._getTopKeywordsByAIWeights(article.keywords, aiLearning.wordWeights);
            rawScore += this._calculateMultidimensionalKeywordScore(topKeywords, aiLearning);
        }
        
        // 2. 興味ワード評価システム - 個別計算方式
        if (wordFilters.interestWords && article.title) {
            const content = (article.title + ' ' + article.content).toLowerCase();
            const matchedWords = wordFilters.interestWords.filter(word => 
                content.includes(word.toLowerCase())
            );
            
            if (matchedWords.length > 0) {
                let positiveWordsScore = 0;
                let negativeWordsScore = 0;
                let positiveWordsCount = 0;
                let negativeWordsCount = 0;
                
                matchedWords.forEach(word => {
                    const aiWeight = aiLearning.wordWeights[word] || 0;
                    
                    if (aiWeight === 0) {
                        // 未評価の興味ワード: 基本ボーナス
                        positiveWordsScore += 8;
                        positiveWordsCount++;
                    } else if (aiWeight > 0) {
                        // 高評価ワード: 基本ボーナス + 追加ボーナス
                        const baseBonus = 8;
                        const ratingBonus = aiWeight;
                        positiveWordsScore += baseBonus + ratingBonus;
                        positiveWordsCount++;
                    } else {
                        // 低評価ワード: 負のペナルティのみ
                        negativeWordsScore += aiWeight;
                        negativeWordsCount++;
                    }
                });
                
                // 個別乗数効果の適用
                let finalInterestScore = 0;
                
                if (positiveWordsCount > 0) {
                    const positiveMultiplier = Math.log(positiveWordsCount + 1);
                    finalInterestScore += positiveWordsScore * positiveMultiplier;
                }
                
                if (negativeWordsCount > 0) {
                    // 負のスコアはそのまま（乗数効果なし）
                    finalInterestScore += negativeWordsScore;
                }
                
                rawScore += finalInterestScore;
            }
        }
        
        return Math.round(this._linearNormalization(rawScore) * 10) / 10;
    },
    
    _getTopKeywordsByAIWeights(keywords, wordWeights) {
        return keywords.map(keyword => ({
            keyword: keyword,
            weight: Math.abs(wordWeights[keyword] || 0),
            originalWeight: wordWeights[keyword] || 0
        })).sort((a, b) => b.weight - a.weight).slice(0, 3);
    },
    
    _calculateMultidimensionalKeywordScore(topKeywords, aiLearning) {
        if (topKeywords.length === 0) return 0;
        
        const individualScore = topKeywords.reduce((sum, item) => sum + item.originalWeight, 0);
        const combinationBonus = this._calculateCombinationBonus(topKeywords);
        const intensityMultiplier = this._calculateIntensityMultiplier(topKeywords);
        
        return (individualScore * 0.5) + (combinationBonus * 0.2) + (individualScore * intensityMultiplier * 0.12);
    },
    
    _calculateCombinationBonus(topKeywords) {
        if (topKeywords.length < 2) return 0;
        
        const bonusTable = { 2: 3, 3: 8 };
        const keywordCount = topKeywords.length;
        const baseBonus = bonusTable[keywordCount] || 0;
        
        const avgWeight = topKeywords.reduce((sum, item) => sum + item.originalWeight, 0) / keywordCount;
        const avgAbsWeight = topKeywords.reduce((sum, item) => sum + Math.abs(item.originalWeight), 0) / keywordCount;
        
        const synergy = avgAbsWeight > 5 ? 1.5 : (avgAbsWeight > 2 ? 1.2 : 1.0);
        const bonus = baseBonus * synergy;
        
        return avgWeight >= 0 ? bonus : -bonus;
    },
    
    _calculateIntensityMultiplier(topKeywords) {
        const avgAbsWeight = topKeywords.reduce((sum, item) => sum + item.weight, 0) / topKeywords.length;
        
        if (avgAbsWeight >= 8) return 0.25;
        if (avgAbsWeight >= 3) return 0.15;
        return 0.05;
    },
    
    _linearNormalization(rawScore) {
        const baseScore = 50;
        const adjustedScore = baseScore + (rawScore * 0.35);
        
        if (adjustedScore < 10) return Math.max(5, adjustedScore * 0.5 + 5);
        if (adjustedScore > 90) return Math.min(95, 90 + (adjustedScore - 90) * 0.2);
        
        return adjustedScore;
    }
};

// ワードフィルター管理
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
                wordFilters.lastUpdated = new Date().toISOString();
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
                wordFilters.lastUpdated = new Date().toISOString();
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
                wordFilters.lastUpdated = new Date().toISOString();
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
                wordFilters.lastUpdated = new Date().toISOString();
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

// ローカルストレージ管理
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
        } catch {
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
            return parsed.data || defaultValue;
        } catch {
            if (defaultValue) this.setItem(key, defaultValue);
            return defaultValue;
        }
    },
    
    removeItem(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch {
            return false;
        }
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

// データ操作フック
window.DataHooks = {
    useArticles() {
        const stored = localStorage.getItem(window.CONFIG.STORAGE_KEYS.ARTICLES);
        const timestamp = stored ? JSON.parse(stored).timestamp : null;
        
        if (!window.DataHooksCache.articles || window.DataHooksCache.lastUpdate.articles !== timestamp) {
            window.DataHooksCache.articles = window.LocalStorageManager.getItem(
                window.CONFIG.STORAGE_KEYS.ARTICLES, window.DEFAULT_DATA.articles
            );
            window.DataHooksCache.lastUpdate.articles = timestamp;
        }
        
        return {
            articles: window.DataHooksCache.articles,
            addArticle(newArticle) {
                const updatedArticles = [...window.DataHooksCache.articles];
                const exists = updatedArticles.find(article => {
                    return article.id === newArticle.id ||
                           article.url === newArticle.url ||
                           (article.title === newArticle.title && 
                            article.rssSource === newArticle.rssSource &&
                            article.publishDate === newArticle.publishDate);
                });
                
                if (exists) return false;
                
                if (updatedArticles.length >= window.CONFIG.MAX_ARTICLES) {
                    updatedArticles.sort((a, b) => {
                        const aScore = (a.readStatus === 'read') ? 1 : 0;
                        const bScore = (b.readStatus === 'read') ? 1 : 0;
                        if (aScore !== bScore) return bScore - aScore;
                        return new Date(a.publishDate) - new Date(b.publishDate);
                    });
                    updatedArticles.pop();
                }
                
                updatedArticles.unshift(newArticle);
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
                window.DataHooksCache.articles = updatedArticles;
                window.DataHooksCache.lastUpdate.articles = new Date().toISOString();
                if (window.state) window.state.articles = updatedArticles;
                return true;
            },
            updateArticle(articleId, updates, options = {}) {
                const { skipRender = false } = options;
                const updatesWithTimestamp = {
                    ...updates,
                    lastModified: new Date().toISOString()
                };
                const updatedArticles = window.DataHooksCache.articles.map(article =>
                    article.id === articleId ? { ...article, ...updatesWithTimestamp } : article
                );
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
                window.DataHooksCache.articles = updatedArticles;
                window.DataHooksCache.lastUpdate.articles = new Date().toISOString();
                if (window.state) window.state.articles = updatedArticles;
                if (window.render && !skipRender) window.render();
            }
        };
    },
    
    useRSSManager() {
        const stored = localStorage.getItem(window.CONFIG.STORAGE_KEYS.RSS_FEEDS);
        const timestamp = stored ? JSON.parse(stored).timestamp : null;
        
        if (!window.DataHooksCache.rssFeeds || window.DataHooksCache.lastUpdate.rssFeeds !== timestamp) {
            window.DataHooksCache.rssFeeds = window.LocalStorageManager.getItem(
                window.CONFIG.STORAGE_KEYS.RSS_FEEDS, []
            );
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
                    
                    if (data.folders && window.state) window.state.folders = data.folders;
                    if (data.feeds && window.state) window.state.feeds = data.feeds;
                    
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
            window.DataHooksCache.aiLearning = window.LocalStorageManager.getItem(
                window.CONFIG.STORAGE_KEYS.AI_LEARNING, window.DEFAULT_DATA.aiLearning
            );
            window.DataHooksCache.lastUpdate.aiLearning = timestamp;
        }
        
        return {
            aiLearning: window.DataHooksCache.aiLearning
        };
    },
    
    useWordFilters() {
        const stored = localStorage.getItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS);
        const timestamp = stored ? JSON.parse(stored).timestamp : null;
        
        if (!window.DataHooksCache.wordFilters || window.DataHooksCache.lastUpdate.wordFilters !== timestamp) {
            window.DataHooksCache.wordFilters = window.LocalStorageManager.getItem(
                window.CONFIG.STORAGE_KEYS.WORD_FILTERS, window.DEFAULT_DATA.wordFilters
            );
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
            addNGWord(word, scope = 'all', target = null) {
                const updated = { ...window.DataHooksCache.wordFilters };
                if (window.WordFilterManager.addWord(word, 'ng', updated, scope, target)) {
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
            removeNGWord(word, scope = null, target = null) {
                const updated = { ...window.DataHooksCache.wordFilters };
                if (window.WordFilterManager.removeWord(word, 'ng', updated, scope, target)) {
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

// 自動初期化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (window.GistSyncManager) {
            window.GistSyncManager.loadConfig();
        }
    });
} else {
    if (window.GistSyncManager) {
        window.GistSyncManager.loadConfig();
    }
}

// システム初期化完了
console.log('Minews PWA Data Management Layer - 削除評価保護対応版 initialized');

})();
