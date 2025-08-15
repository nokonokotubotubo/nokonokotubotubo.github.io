// Minews PWA - データ管理・処理レイヤー（星評価機能削除版）

(function() {

'use strict';

// 定数・設定
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
    folders: [],
    feeds: [],
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

// 【軽量化】安定ID生成システム（マイグレーション機能削除版）
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

// GitHub Gist同期システム（軽量化＋効率化統合版）
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
    
    // 統合暗号化処理（軽量化版）
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

    // 統合エラーハンドリング（軽量化版）
    _safeStorage: {
        get(key, defaultValue = null) {
            try {
                const data = localStorage.getItem(key);
                return data ? JSON.parse(data) : defaultValue;
            } catch (error) {
                console.warn(`Storage読み込みエラー[${key}]:`, error.message);
                return defaultValue;
            }
        },
        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (error) {
                console.warn(`Storage保存エラー[${key}]:`, error.message);
                return false;
            }
        }
    },

    // 開発時のみ詳細ログ、本番では簡潔化
    _log(level, msg, data = null) {
        if (level === 'error' || (typeof window !== 'undefined' && window.location?.hostname === 'localhost')) {
            console[level](msg, data);
        }
    },

    // JSON処理統合（軽量化版）
    _jsonSafe: {
        str(obj, format = false) { 
            return JSON.stringify(obj, null, format ? 2 : 0); 
        },
        parse(str, def = null) { 
            try { return JSON.parse(str); } catch { return def; } 
        }
    },
    
    loadConfig() {
        try {
            const configStr = localStorage.getItem('minews_gist_config');
            if (!configStr) {
                this._log('info', '設定が見つかりません');
                return null;
            }

            let parsed = this._jsonSafe.parse(configStr);
            if (!parsed) {
                if (this._lastValidConfig) {
                    this._log('info', '前回の有効な設定を使用します');
                    return this._lastValidConfig;
                }
                throw new Error('設定解析に失敗しました');
            }

            let decryptedToken = null;
            if (parsed.encryptedToken) {
                try {
                    decryptedToken = this._decrypt(parsed.encryptedToken);
                    this._log('info', 'トークンの復号化に成功しました');
                } catch (decryptError) {
                    this._log('warn', 'トークンの復号化に失敗しました');
                    
                    if (this._lastValidConfig && this._lastValidConfig.hasToken) {
                        this._log('info', '前回の有効なトークンを継続使用します');
                        this.token = this.token;
                        this.isEnabled = true;
                    } else {
                        this.token = null;
                        this.isEnabled = false;
                        this._log('info', 'トークンは無効ですが、その他の設定は保持します');
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

            this._log('info', '設定読み込み完了');
            return validConfig;

        } catch (error) {
            console.error('設定読み込み中の重大エラー:', error);
            
            if (this._lastValidConfig) {
                this._log('info', 'エラー発生のため、前回の有効設定を使用します');
                return this._lastValidConfig;
            }
            
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
        if (!token || typeof token !== 'string' || token.trim().length === 0) {
            throw new Error('有効なトークンが必要です');
        }

        let encryptedToken;
        try {
            encryptedToken = this._encrypt(token.trim());
            const testDecrypted = this._decrypt(encryptedToken);
            if (testDecrypted !== token.trim()) {
                throw new Error('暗号化処理の整合性確認に失敗');
            }
        } catch (error) {
            console.error('暗号化テストエラー:', error);
            throw new Error('トークンの暗号化処理に失敗しました: ' + error.message);
        }

        const existingConfig = this.loadConfig();
        
        this.token = token.trim();
        this.gistId = gistId ? gistId.trim() : (existingConfig?.gistId || null);
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
        
        this._log('info', 'GitHub同期設定を正常に保存しました');

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
        if (!this.isEnabled || !this.token || this.isSyncing) {
            return false;
        }
        
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
                this._log('info', 'シンプル完全サイレント同期完了');
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
        if (!cloudData) {
            return localData;
        }
        
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
        
        const baseAI = cloudTime > localTime ? cloudAI : localAI;
        const otherAI = cloudTime > localTime ? localAI : cloudAI;
        
        const mergedWordWeights = { ...baseAI.wordWeights };
        const mergedSourceWeights = { ...baseAI.sourceWeights };
        
        Object.keys(otherAI.wordWeights || {}).forEach(word => {
            const baseWeight = mergedWordWeights[word] || 0;
            const otherWeight = otherAI.wordWeights[word] || 0;
            const merged = baseWeight + (otherWeight * 0.5);
            mergedWordWeights[word] = Math.max(-60, Math.min(60, merged));
        });
        
        Object.keys(otherAI.sourceWeights || {}).forEach(source => {
            const baseWeight = mergedSourceWeights[source] || 0;
            const otherWeight = otherAI.sourceWeights[source] || 0;
            const merged = baseWeight + (otherWeight * 0.5);
            mergedSourceWeights[source] = Math.max(-20, Math.min(20, merged));
        });
        
        return {
            version: window.CONFIG.DATA_VERSION,
            wordWeights: mergedWordWeights,
            sourceWeights: mergedSourceWeights,
            lastUpdated: new Date().toISOString()
        };
    },

    _mergeWordFilters(localWords, cloudWords) {
        if (!cloudWords) return localWords;
        if (!localWords) return cloudWords;
        
        const localTime = new Date(localWords.lastUpdated || 0).getTime();
        const cloudTime = new Date(cloudWords.lastUpdated || 0).getTime();
        
        let baseWords, baseTime;
        if (localTime >= cloudTime) {
            baseWords = localWords;
            baseTime = localTime;
            this._log('info', 'ワードフィルターマージ: ローカルデータを採用');
        } else {
            baseWords = cloudWords;
            baseTime = cloudTime;
            this._log('info', 'ワードフィルターマージ: クラウドデータを採用');
        }
        
        return {
            interestWords: [...(baseWords.interestWords || [])],
            ngWords: [...(baseWords.ngWords || [])],
            lastUpdated: new Date(baseTime).toISOString()
        };
    },

    // 【修正】_mergeArticleStates関数 - 削除処理統合版（星評価削除対応）
    _mergeArticleStates(localStates, cloudStates, deletedIds = []) {
        if (!cloudStates) return localStates;
        if (!localStates) return cloudStates;
        
        const articlesHook = window.DataHooks.useArticles();
        const currentArticleIds = new Set(articlesHook.articles.map(article => article.id));
        
        const mergedStates = {};
        let mergeCount = 0;
        let localWinCount = 0;
        let cloudWinCount = 0;
        let deletedCount = 0;
        
        const allRelevantIds = new Set([
            ...Object.keys(localStates),
            ...Object.keys(cloudStates)
        ]);
        
        allRelevantIds.forEach(articleId => {
            if (!currentArticleIds.has(articleId) || deletedIds.includes(articleId)) {
                deletedCount++;
                return;
            }
            
            const localState = localStates[articleId];
            const cloudState = cloudStates[articleId];
            
            if (!cloudState) {
                mergedStates[articleId] = localState;
                localWinCount++;
            } else if (!localState) {
                mergedStates[articleId] = cloudState;
                cloudWinCount++;
            } else {
                const localTime = new Date(localState.lastModified || 0).getTime();
                const cloudTime = new Date(cloudState.lastModified || 0).getTime();
                
                if (localTime >= cloudTime) {
                    mergedStates[articleId] = localState;
                    localWinCount++;
                } else {
                    mergedStates[articleId] = cloudState;
                    cloudWinCount++;
                }
            }
            mergeCount++;
        });
        
        this._log('info', `記事状態マージ完了: ${mergeCount}件、クラウド削除: ${deletedCount}件`);
        
        return mergedStates;
    },

    async _applyMergedDataSilentBatch(mergedData) {
        try {
            const batchUpdates = {};
            
            if (mergedData.aiLearning) {
                batchUpdates.aiLearning = mergedData.aiLearning;
            }
            
            if (mergedData.wordFilters) {
                batchUpdates.wordFilters = mergedData.wordFilters;
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
                    
                    // バックグラウンド同期時はAIスコア再計算を回避
                    if (!this._isBackgroundSyncing && aiLearningData && wordFiltersData) {
                        updatedArticle.aiScore = window.AIScoring.calculateScore(
                            updatedArticle, 
                            aiLearningData, 
                            wordFiltersData
                        );
                    }
                    
                    return updatedArticle;
                });
                
                batchUpdates.articles = updatedArticles;
            }
            
            await this._executeBatchUpdate(batchUpdates);
            
            this._log('info', '順序安定化対応一括更新完了');
            return true;
        } catch (error) {
            console.error('順序安定化一括更新エラー:', error);
            return false;
        }
    },

    async _executeBatchUpdate(batchUpdates) {
        const updateSequence = [
            { key: 'aiLearning', storageKey: window.CONFIG.STORAGE_KEYS.AI_LEARNING, cacheKey: 'aiLearning' },
            { key: 'wordFilters', storageKey: window.CONFIG.STORAGE_KEYS.WORD_FILTERS, cacheKey: 'wordFilters' },
            { key: 'articles', storageKey: window.CONFIG.STORAGE_KEYS.ARTICLES, cacheKey: 'articles' }
        ];
        
        for (const update of updateSequence) {
            if (batchUpdates[update.key]) {
                window.LocalStorageManager.setItem(update.storageKey, batchUpdates[update.key]);
                window.DataHooksCache.clear(update.cacheKey);
                
                if (update.key === 'articles') {
                    window.DataHooksCache.articles = batchUpdates[update.key];
                    if (window.state) {
                        window.state.articles = batchUpdates[update.key];
                    }
                }
                
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
    },

    async _updateConfigSafely(timestamp) {
        try {
            let currentConfig = this._safeStorage.get('minews_gist_config');
            
            if (!currentConfig && this.token && this.gistId && this.isEnabled) {
                this._log('info', '設定を再作成します');
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
                
                this._log('info', '設定更新完了');
                return true;
            }
            
            this._log('warn', '設定更新をスキップ: 設定の再作成に失敗');
            return false;
            
        } catch (error) {
            console.error('設定更新エラー:', error);
            return false;
        }
    },

    async _applyMergedDataToLocal(mergedData) {
        try {
            if (mergedData.aiLearning) {
                window.LocalStorageManager.setItem(
                    window.CONFIG.STORAGE_KEYS.AI_LEARNING, 
                    mergedData.aiLearning
                );
                window.DataHooksCache.clear('aiLearning');
                window.DataHooksCache.aiLearning = mergedData.aiLearning;
            }
            
            if (mergedData.wordFilters) {
                window.LocalStorageManager.setItem(
                    window.CONFIG.STORAGE_KEYS.WORD_FILTERS, 
                    mergedData.wordFilters
                );
                window.DataHooksCache.clear('wordFilters');
                window.DataHooksCache.wordFilters = mergedData.wordFilters;
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
                            readStatus: state.readStatus || article.readStatus,
                            readLater: state.readLater || article.readLater,
                            lastModified: state.lastModified || article.lastModified
                        };
                    }
                    
                    updatedArticle.aiScore = window.AIScoring.calculateScore(
                        updatedArticle, 
                        aiLearningData, 
                        wordFiltersData
                    );
                    
                    return updatedArticle;
                });
                
                window.LocalStorageManager.setItem(
                    window.CONFIG.STORAGE_KEYS.ARTICLES, 
                    updatedArticles
                );
                window.DataHooksCache.clear('articles');
                window.DataHooksCache.articles = updatedArticles;
                
                if (window.state) {
                    window.state.articles = updatedArticles;
                }
                
                if (window.render) {
                    window.render();
                    setTimeout(() => {
                        if (window.render) {
                            window.render();
                            this._log('info', '手動同期：最終画面更新完了');
                        }
                    }, 100);
                }
            }
            
            this._log('info', '手動同期ローカルデータ更新完了');
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
        if (this.isSyncing) {
            return { success: false, reason: 'already_syncing' };
        }
        
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
                
                this._log('info', '手動同期完了');
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
                if (config && config.encryptedToken && config.gistId) {
                    this._log('info', '設定整合性確認: OK');
                    return true;
                }
            }
            this._log('warn', '設定整合性確認: 不完全な設定が検出されました');
            return false;
        } catch (error) {
            console.error('設定整合性確認エラー:', error);
            return false;
        }
    },

    _shouldPullFromCloud(cloudTimestamp) {
        if (!cloudTimestamp || !this.lastSyncTime) {
            return true;
        }
        
        try {
            const cloudTime = new Date(cloudTimestamp).getTime();
            const localTime = new Date(this.lastSyncTime).getTime();
            return cloudTime > localTime;
        } catch (error) {
            return true;
        }
    },
    
    // 【修正】collectSyncData関数 - 非同期対応版（星評価削除対応）
    async collectSyncData() {
        const aiHook = window.DataHooks.useAILearning();
        const wordHook = window.DataHooks.useWordFilters();
        const articlesHook = window.DataHooks.useArticles();
        
        const articleStates = {};
        const currentTime = new Date().toISOString();
        
        const currentArticleIds = new Set(articlesHook.articles.map(article => article.id));
        
        // すべての記事状態変更を同期対象に含める（星評価除外）
        articlesHook.articles.forEach(article => {
            const hasAnyCustomState = 
                article.readStatus !== 'unread' ||
                article.readLater === true;
                
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
        
        const updatedWordFilters = {
            ...wordHook.wordFilters,
            lastUpdated: currentTime
        };
        
        this._log('info', `同期対象記事状態: ${Object.keys(articleStates).length}件（未読への変更も含む）`);
        this._log('info', `クラウド削除対象: ${deletedArticleIds.length}件の古い記事データ`);
        
        return {
            version: window.CONFIG.DATA_VERSION,
            syncTime: currentTime,
            aiLearning: aiHook.aiLearning,
            wordFilters: updatedWordFilters,
            articleStates: articleStates,
            deletedArticleIds: deletedArticleIds
        };
    },

    async _collectDeletedArticleIds(currentArticleIds) {
        const deletedIds = [];
        
        try {
            const cloudData = await this.syncFromCloud();
            if (!cloudData || !cloudData.articleStates) {
                this._log('info', 'クラウドデータが存在しないか、記事状態が空です');
                return deletedIds;
            }
            
            const cloudArticleIds = Object.keys(cloudData.articleStates);
            
            cloudArticleIds.forEach(articleId => {
                if (!currentArticleIds.has(articleId)) {
                    deletedIds.push(articleId);
                    this._log('info', `削除対象記事を特定: ${articleId}`);
                }
            });
            
            this._log('info', `クラウド削除対象記事ID特定完了: ${deletedIds.length}件`);
            
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
            
            if (lastCleanup && (now - parseInt(lastCleanup)) < 86400000) {
                return;
            }
            
            const articlesData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.ARTICLES, []);
            if (Array.isArray(articlesData)) {
                const validArticles = articlesData.filter(article => currentArticleIds.has(article.id));
                const removedCount = articlesData.length - validArticles.length;
                
                if (removedCount > 0) {
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.ARTICLES, validArticles);
                    this._log('info', `古い記事データをクリーンアップ: ${removedCount}件削除`);
                }
            }
            
            this._safeStorage.set(lastCleanupKey, now.toString());
            
        } catch (error) {
            this._log('warn', '記事状態クリーンアップエラー');
        }
    },

    async syncToCloud(data) {
        if (!this.token) {
            return false;
        }
        
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
                if (gist.files && gist.files['minews_data.json']) {
                    const content = gist.files['minews_data.json'].content;
                    return this._jsonSafe.parse(content);
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
            if (!currentConfigStr) {
                this._log('warn', '設定が見つからないためGistID保存をスキップ');
                return;
            }

            const config = this._jsonSafe.parse(currentConfigStr);
            if (config) {
                config.gistId = gistId;
                config.lastSyncTime = this.lastSyncTime || null;

                this._safeStorage.set('minews_gist_config', config);
                
                this.gistId = gistId;
                
                if (this._lastValidConfig) {
                    this._lastValidConfig.gistId = gistId;
                }
                
                this._log('info', 'Gist IDを保存');
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

// AI学習システム（星評価機能削除版）
window.AIScoring = {
    calculateScore(article, aiLearning, wordFilters) {
        let rawScore = 0;
        
        if (article.keywords && aiLearning.wordWeights && article.keywords.length > 0) {
            const topKeywords = this._getTopKeywordsByAIWeights(article.keywords, aiLearning.wordWeights);
            const multidimensionalScore = this._calculateMultidimensionalKeywordScore(topKeywords, aiLearning);
            rawScore += multidimensionalScore;
        }
        
        if (article.rssSource && aiLearning.sourceWeights) {
            const weight = aiLearning.sourceWeights[article.rssSource] || 0;
            rawScore += weight;
        }
        
        if (wordFilters.interestWords && article.title) {
            const content = (article.title + ' ' + article.content).toLowerCase();
            const matchedWords = wordFilters.interestWords.filter(word => 
                content.includes(word.toLowerCase())
            );
            
            if (matchedWords.length > 0) {
                const interestBonus = matchedWords.length * 8 * Math.log(matchedWords.length + 1);
                rawScore += interestBonus;
            }
        }
        
        // 【削除】星評価によるスコア計算部分を削除
        
        const normalizedScore = this._linearNormalization(rawScore);
        
        return Math.round(normalizedScore);
    },
    
    _getTopKeywordsByAIWeights(keywords, wordWeights) {
        const keywordsWithWeights = keywords.map(keyword => ({
            keyword: keyword,
            weight: Math.abs(wordWeights[keyword] || 0),
            originalWeight: wordWeights[keyword] || 0
        }));
        
        const topKeywords = keywordsWithWeights
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 3);
        
        return topKeywords;
    },
    
    _calculateMultidimensionalKeywordScore(topKeywords, aiLearning) {
        if (topKeywords.length === 0) return 0;
        
        let totalScore = 0;
        
        let individualScore = 0;
        topKeywords.forEach(item => {
            individualScore += item.originalWeight;
        });
        
        const combinationBonus = this._calculateCombinationBonus(topKeywords);
        const intensityMultiplier = this._calculateIntensityMultiplier(topKeywords);
        
        totalScore = (individualScore * 0.5) + (combinationBonus * 0.2) + (individualScore * intensityMultiplier * 0.12);
        
        return totalScore;
    },
    
    _calculateCombinationBonus(topKeywords) {
        if (topKeywords.length < 2) return 0;
        
        const bonusTable = {
            2: 3,
            3: 8
        };
        
        const keywordCount = topKeywords.length;
        let bonus = bonusTable[keywordCount] || 0;
        
        const avgWeight = topKeywords.reduce((sum, item) => sum + Math.abs(item.originalWeight), 0) / keywordCount;
        const synergy = avgWeight > 5 ? 1.5 : (avgWeight > 2 ? 1.2 : 1.0);
        
        return bonus * synergy;
    },
    
    _calculateIntensityMultiplier(topKeywords) {
        const avgAbsWeight = topKeywords.reduce((sum, item) => sum + item.weight, 0) / topKeywords.length;
        
        if (avgAbsWeight >= 8) {
            return 0.25;
        } else if (avgAbsWeight >= 3) {
            return 0.15;
        } else {
            return 0.05;
        }
    },
    
    _linearNormalization(rawScore) {
        const baseScore = 50;
        const adjustedScore = baseScore + (rawScore * 0.4);
        
        if (adjustedScore < 10) return Math.max(5, adjustedScore * 0.5 + 5);
        if (adjustedScore > 90) return Math.min(95, 90 + (adjustedScore - 90) * 0.2);
        
        return Math.round(adjustedScore);
    }
    
    // 【削除】updateLearning関数を完全削除
};

// ワードフィルター管理
window.WordFilterManager = {
    addWord(word, type, wordFilters, scope = 'all', target = null) {
        word = word.trim();
        if (!word) return false;
        
        if (type === 'interest') {
            const exists = wordFilters.interestWords.some(existingWord => existingWord.toLowerCase() === word.toLowerCase());
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
                if (!text.includes(ngWordObj.word.toLowerCase())) {
                    return false;
                }
                
                switch (ngWordObj.scope) {
                    case 'all':
                        return true;
                    case 'folder':
                        return article.folderName === ngWordObj.target;
                    case 'feed':
                        return article.rssSource === ngWordObj.target;
                    default:
                        return false;
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
            return parsed.data || defaultValue;
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

// データ操作フック（星評価機能削除版）
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
                const exists = updatedArticles.find(article => {
                    if (article.id === newArticle.id) return true;
                    if (article.url === newArticle.url) return true;
                    if (article.title === newArticle.title && 
                        article.rssSource === newArticle.rssSource &&
                        article.publishDate === newArticle.publishDate) {
                        return true;
                    }
                    return false;
                });
                if (exists) {
                    console.log(`重複記事をスキップ: ${newArticle.title} (${newArticle.rssSource})`);
                    return false;
                }
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
                if (window.state) {
                    window.state.articles = updatedArticles;
                }
                console.log(`新しい記事を追加: ${newArticle.title} (${newArticle.rssSource})`);
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
                if (window.state) {
                    window.state.articles = updatedArticles;
                }
                if (window.render && !skipRender) {
                    window.render();
                }
                console.log(`記事 ${articleId} の状態を更新しました:`, updatesWithTimestamp);
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
                    if (data.folders && window.state) {
                        window.state.folders = data.folders;
                    }
                    if (data.feeds && window.state) {
                        window.state.feeds = data.feeds;
                    }
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
            aiLearning: window.DataHooksCache.aiLearning
            // 【削除】updateLearningData関数を削除
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
    },
    useFolders() {
        const stored = localStorage.getItem(window.CONFIG.STORAGE_KEYS.FOLDERS);
        const timestamp = stored ? JSON.parse(stored).timestamp : null;
        
        if (!window.DataHooksCache.folders || window.DataHooksCache.lastUpdate.folders !== timestamp) {
            window.DataHooksCache.folders = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.FOLDERS, window.DEFAULT_DATA.folders);
            window.DataHooksCache.lastUpdate.folders = timestamp;
        }
        
        return {
            folders: window.DataHooksCache.folders
        };
    },
    useFeeds() {
        const stored = localStorage.getItem(window.CONFIG.STORAGE_KEYS.RSS_FEEDS);
        const timestamp = stored ? JSON.parse(stored).timestamp : null;

        if (!window.DataHooksCache.feeds || window.DataHooksCache.lastUpdate.feeds !== timestamp) {
            window.DataHooksCache.feeds = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.RSS_FEEDS, window.DEFAULT_DATA.feeds);
            window.DataHooksCache.lastUpdate.feeds = timestamp;
        }
        
        return {
            feeds: window.DataHooksCache.feeds
        };
    }
};

// エクスポート・インポート機能（星評価削除対応）
window.exportMinewsData = function() {
    const aiHook = window.DataHooks.useAILearning();
    const wordHook = window.DataHooks.useWordFilters();
    const articlesHook = window.DataHooks.useArticles();
    
    const articleStates = {};
    articlesHook.articles.forEach(article => {
        const currentAIScore = article.aiScore || window.AIScoring.calculateScore(
            article, 
            aiHook.aiLearning, 
            wordHook.wordFilters
        );
        
        articleStates[article.id] = {
            readStatus: article.readStatus || 'unread',
            readLater: article.readLater || false,
            lastModified: article.lastModified || new Date().toISOString(),
            aiScore: currentAIScore,
            title: article.title,
            url: article.url,
            keywords: article.keywords || [],
            rssSource: article.rssSource || ''
        };
    });
    
    const exportData = {
        version: window.CONFIG.DATA_VERSION,
        exportDate: new Date().toISOString(),
        exportType: 'complete_evaluation_state',
        aiLearning: {
            ...aiHook.aiLearning,
            wordWeights: { ...aiHook.aiLearning.wordWeights },
            sourceWeights: { ...aiHook.aiLearning.sourceWeights }
        },
        wordFilters: {
            ...wordHook.wordFilters,
            interestWords: [...wordHook.wordFilters.interestWords],
            ngWords: [...wordHook.wordFilters.ngWords]
        },
        articleStates: articleStates,
        statistics: {
            totalArticles: articlesHook.articles.length,
            statesRead: Object.values(articleStates).filter(s => s.readStatus === 'read').length,
            statesReadLater: Object.values(articleStates).filter(s => s.readLater === true).length
        }
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `minews_complete_state_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    alert(`完全な評価状態データのエクスポートが完了しました\n記事状態: ${exportData.statistics.totalArticles}件\n既読: ${exportData.statistics.statesRead}件`);
};

window.importMinewsData = async function(file) {
    try {
        const text = await file.text();
        const importData = JSON.parse(text);
        
        if (!importData.aiLearning || !importData.wordFilters) {
            throw new Error('無効なデータ形式です。必要なデータが不足しています。');
        }
        
        const aiHook = window.DataHooks.useAILearning();
        const wordHook = window.DataHooks.useWordFilters();
        const articlesHook = window.DataHooks.useArticles();
        
        aiHook.aiLearning.wordWeights = {};
        aiHook.aiLearning.sourceWeights = {};
        
        Object.keys(importData.aiLearning.wordWeights || {}).forEach(word => {
            const weight = importData.aiLearning.wordWeights[word];
            aiHook.aiLearning.wordWeights[word] = Math.max(-60, Math.min(60, weight));
        });
        
        Object.keys(importData.aiLearning.sourceWeights || {}).forEach(source => {
            const weight = importData.aiLearning.sourceWeights[source];
            aiHook.aiLearning.sourceWeights[source] = Math.max(-20, Math.min(20, weight));
        });
        
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
        
        if (importData.articleStates && typeof importData.articleStates === 'object') {
            const currentArticles = articlesHook.articles;
            let restoredCount = 0;
            let aiScoreRestoredCount = 0;
            
            const updatedArticles = currentArticles.map(article => {
                const state = importData.articleStates[article.id];
                if (state) {
                    restoredCount++;
                    
                    let updatedArticle = {
                        ...article,
                        readStatus: state.readStatus || 'unread',
                        readLater: state.readLater || false,
                        lastModified: state.lastModified || article.lastModified || new Date().toISOString()
                    };
                    
                    const newAIScore = window.AIScoring.calculateScore(
                        updatedArticle, 
                        aiHook.aiLearning, 
                        wordHook.wordFilters
                    );
                    
                    updatedArticle.aiScore = newAIScore;
                    
                    if (Math.abs((state.aiScore || 0) - newAIScore) > 1) {
                        aiScoreRestoredCount++;
                    }
                    
                    return updatedArticle;
                }
                
                const recalculatedArticle = { ...article };
                recalculatedArticle.aiScore = window.AIScoring.calculateScore(
                    recalculatedArticle, 
                    aiHook.aiLearning, 
                    wordHook.wordFilters
                );
                return recalculatedArticle;
            });
            
            console.log(`記事状態復元完了: ${restoredCount}件中、AIスコア更新: ${aiScoreRestoredCount}件`);
            
            window.LocalStorageManager.setItem(
                window.CONFIG.STORAGE_KEYS.ARTICLES, 
                updatedArticles
            );
            window.DataHooksCache.articles = updatedArticles;
            window.DataHooksCache.lastUpdate.articles = new Date().toISOString();
            
            if (window.state) {
                window.state.articles = updatedArticles;
            }
        }
        
        aiHook.aiLearning.lastUpdated = new Date().toISOString();
        wordHook.wordFilters.lastUpdated = new Date().toISOString();
        
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
    if (file) {
        window.importMinewsData(file);
    }
    event.target.value = '';
};

})();
