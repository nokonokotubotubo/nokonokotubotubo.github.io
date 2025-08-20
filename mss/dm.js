// Minews PWA - データ管理・処理レイヤー（データ構造一本化版）
(function() {
'use strict';

// 設定定数（一本化対応）
window.CONFIG = {
    STORAGE_KEYS: {
        ARTICLES: 'minews_articles',
        WORD_INDEX: 'minews_wordIndex' // 唯一のワードデータ
    },
    MAX_ARTICLES: 1000,
    DATA_VERSION: '2.0',
    REQUEST_TIMEOUT: 15000,
    MAX_RETRIES: 2,
    RETRY_DELAY: 3000
};

// デフォルトデータ（簡素化）
window.DEFAULT_DATA = {
    articles: [],
    wordIndex: {
        version: '2.0',
        lastUpdated: new Date().toISOString(),
        interest: [],
        ng: []
    }
};

// 【新設】統合ワード管理システム（WordRatingManager/WordFilterManager/aiLearning統合）
window.WordIndexManager = {
    KEY: window.CONFIG.STORAGE_KEYS.WORD_INDEX,
    
    _load() {
        const data = window.LocalStorageManager.getItem(this.KEY, window.DEFAULT_DATA.wordIndex);
        // データを2.0スキーマで強制化（過去互換不要）
        if (!data.version || data.version !== '2.0') {
            const reset = JSON.parse(JSON.stringify(window.DEFAULT_DATA.wordIndex));
            window.LocalStorageManager.setItem(this.KEY, reset);
            return reset;
        }
        return data;
    },
    
    _save(data) {
        data.lastUpdated = new Date().toISOString();
        return window.LocalStorageManager.setItem(this.KEY, data);
    },
    
    _norm(word) {
        return (word || '').trim().toLowerCase();
    },
    
    getAll() {
        return this._load();
    },
    
    // 興味ワード: 追加/更新（ratingは0-5）
    upsertInterest({ word, display, scope = 'all', target = null, rating = 0 }) {
        const d = this._load();
        const w = this._norm(word);
        if (!w) return false;
        
        const existingIdx = d.interest.findIndex(i => 
            this._norm(i.word) === w && 
            i.scope === scope && 
            (i.target || null) === (target || null)
        );
        const now = new Date().toISOString();
        
        if (existingIdx >= 0) {
            d.interest[existingIdx] = {
                ...d.interest[existingIdx],
                display: display || d.interest[existingIdx].display || word,
                rating: Math.max(0, Math.min(5, parseInt(rating || 0))),
                updatedAt: now
            };
        } else {
            d.interest.push({
                word: w,
                display: display || word,
                scope,
                target: scope === 'all' ? null : (target || null),
                rating: Math.max(0, Math.min(5, parseInt(rating || 0))),
                addedAt: now,
                updatedAt: now
            });
        }
        return this._save(d);
    },
    
    removeInterest({ word, scope = 'all', target = null }) {
        const d = this._load();
        const w = this._norm(word);
        const before = d.interest.length;
        d.interest = d.interest.filter(i => !(
            this._norm(i.word) === w && 
            i.scope === scope && 
            (i.target || null) === (target || null)
        ));
        const changed = before !== d.interest.length;
        if (changed) this._save(d);
        return changed;
    },
    
    // NGワード
    upsertNG({ word, display, scope = 'all', target = null }) {
        const d = this._load();
        const w = this._norm(word);
        if (!w) return false;
        
        const existingIdx = d.ng.findIndex(i => 
            this._norm(i.word) === w && 
            i.scope === scope && 
            (i.target || null) === (target || null)
        );
        const now = new Date().toISOString();
        
        if (existingIdx >= 0) {
            d.ng[existingIdx] = {
                ...d.ng[existingIdx],
                display: display || d.ng[existingIdx].display || word,
                updatedAt: now
            };
        } else {
            d.ng.push({
                word: w,
                display: display || word,
                scope,
                target: scope === 'all' ? null : (target || null),
                addedAt: now,
                updatedAt: now
            });
        }
        return this._save(d);
    },
    
    removeNG({ word, scope = 'all', target = null }) {
        const d = this._load();
        const w = this._norm(word);
        const before = d.ng.length;
        d.ng = d.ng.filter(i => !(
            this._norm(i.word) === w && 
            i.scope === scope && 
            (i.target || null) === (target || null)
        ));
        const changed = before !== d.ng.length;
        if (changed) this._save(d);
        return changed;
    },
    
    // 評価のみ更新
    setRating(word, rating) {
        const d = this._load();
        const w = this._norm(word);
        let updated = false;
        d.interest = d.interest.map(i => {
            if (this._norm(i.word) === w) {
                updated = true;
                return { 
                    ...i, 
                    rating: Math.max(0, Math.min(5, parseInt(rating || 0))), 
                    updatedAt: new Date().toISOString() 
                };
            }
            return i;
        });
        if (updated) this._save(d);
        return updated;
    },
    
    // 特定ワードの評価取得
    getRating(word) {
        const d = this._load();
        const w = this._norm(word);
        const hit = d.interest.find(i => this._norm(i.word) === w);
        return hit?.rating || 0;
    }
};

// 安定ID生成システム（既存維持）
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

// GitHub Gist同期システム（wordIndex一本化対応版）
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
        
        const pickLatest = (local, cloud) => {
            if (!cloud) return local;
            if (!local) return cloud;
            const localTime = new Date(local.lastUpdated || 0).getTime();
            const cloudTime = new Date(cloud.lastUpdated || 0).getTime();
            return cloudTime > localTime ? cloud : local;
        };
        
        return {
            version: window.CONFIG.DATA_VERSION,
            syncTime: new Date().toISOString(),
            wordIndex: pickLatest(localData.wordIndex, cloudData.wordIndex),
            articleStates: this._mergeArticleStates(
                localData.articleStates, 
                cloudData.articleStates,
                localData.deletedArticleIds || []
            )
        };
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

    async _applyMergedDataSilentBatch(mergedData) {
        try {
            if (mergedData.wordIndex) {
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_INDEX, mergedData.wordIndex);
            }
            
            if (mergedData.articleStates) {
                const articlesHook = window.DataHooks.useArticles();
                const currentArticles = articlesHook.articles;
                
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
                    
                    updatedArticle.aiScore = window.AIScoring.calculateScore(updatedArticle);
                    return updatedArticle;
                });
                
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
                window.DataHooksCache.articles = updatedArticles;
                
                if (window.state) window.state.articles = updatedArticles;
            }
            return true;
        } catch (error) {
            console.error('時刻比較同期エラー:', error);
            return false;
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

    async _applyMergedDataToLocal(mergedData) {
        try {
            if (mergedData.wordIndex) {
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_INDEX, mergedData.wordIndex);
            }
            
            if (mergedData.articleStates) {
                const articlesHook = window.DataHooks.useArticles();
                const currentArticles = articlesHook.articles;
                
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
                    
                    updatedArticle.aiScore = window.AIScoring.calculateScore(updatedArticle);
                    return updatedArticle;
                });
                
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
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
        const articlesHook = window.DataHooks.useArticles();
        const wordIndex = window.WordIndexManager.getAll();
        
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
        
        return {
            version: window.CONFIG.DATA_VERSION,
            syncTime: currentTime,
            wordIndex,
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

// キャッシュシステム（簡素化）
window.DataHooksCache = {
    articles: null,
    lastUpdate: { articles: null },
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

// 記事データ読み込み（既存維持）
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

// AI学習システム（一本化対応版）
window.AIScoring = {
    // rating→重みマップ（旧仕様を踏襲）
    _weight(rating) {
        const map = { 1: -10, 2: -5, 3: 0, 4: 5, 5: 10 };
        return map[rating] || 0;
    },

    calculateScore(article) {
        const idx = window.WordIndexManager.getAll();
        const text = ((article.title || '') + ' ' + (article.content || '')).toLowerCase();
        let score = 0;

        // 興味ワード一致（scopeチェック）
        const matches = [];
        idx.interest.forEach(i => {
            const inText = text.includes(i.word);
            if (!inText) return;
            let scopeOK = true;
            if (i.scope === 'folder') scopeOK = article.folderName === i.target;
            if (i.scope === 'feed') scopeOK = article.rssSource === i.target;
            if (scopeOK) matches.push(i);
        });

        if (matches.length) {
            let positive = 0, negative = 0, pCount = 0, nCount = 0;
            matches.forEach(i => {
                const w = this._weight(i.rating || 0);
                if (w > 0) { positive += 8 + w; pCount++; }
                else if (w === 0) { positive += 8; pCount++; }
                else { negative += w; nCount++; }
            });
            let final = 0;
            if (pCount > 0) final += positive * Math.log(pCount + 1);
            if (nCount > 0) final += negative;
            score += final;
        }

        return Math.round(this._linearNormalization(score) * 10) / 10;
    },
    
    _linearNormalization(rawScore) {
        const base = 50;
        const adjusted = base + (rawScore * 0.35);
        if (adjusted < 10) return Math.max(5, adjusted * 0.5 + 5);
        if (adjusted > 90) return Math.min(95, 90 + (adjusted - 90) * 0.2);
        return adjusted;
    }
};

// ワードフィルター（NG専用・一本化対応版）
window.WordFilter = {
    filterArticles(articles) {
        const idx = window.WordIndexManager.getAll();
        return articles.filter(article => {
            const text = ((article.title || '') + ' ' + (article.content || '')).toLowerCase();
            // 1つでも適用範囲で一致すれば非表示
            for (const g of idx.ng) {
                if (!text.includes(g.word)) continue;
                if (g.scope === 'all') return false;
                if (g.scope === 'folder' && article.folderName === g.target) return false;
                if (g.scope === 'feed' && article.rssSource === g.target) return false;
            }
            return true;
        });
    }
};

// ローカルストレージ管理（既存維持）
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

// データ操作フック（一本化対応版）
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
        return {
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
    
    useWordIndex() {
        return {
            wordIndex: window.WordIndexManager.getAll(),
            addInterest(word, scope = 'all', target = null, rating = 0, display = null) {
                const ok = window.WordIndexManager.upsertInterest({ 
                    word, 
                    scope, 
                    target, 
                    rating, 
                    display: display || word 
                });
                return ok;
            },
            removeInterest(word, scope = 'all', target = null) {
                return window.WordIndexManager.removeInterest({ word, scope, target });
            },
            addNG(word, scope = 'all', target = null, display = null) {
                return window.WordIndexManager.upsertNG({ 
                    word, 
                    scope, 
                    target, 
                    display: display || word 
                });
            },
            removeNG(word, scope = 'all', target = null) {
                return window.WordIndexManager.removeNG({ word, scope, target });
            },
            setRating(word, rating) {
                return window.WordIndexManager.setRating(word, rating);
            }
        };
    }
};

// 旧データクリア（初期化時）
try {
    localStorage.removeItem('minews_wordFilters');
    localStorage.removeItem('minews_aiLearning');
    localStorage.removeItem('minews_keyword_ratings');
    localStorage.removeItem('minews_auto_added_words');
} catch {}

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
console.log('Minews PWA Data Management Layer - データ構造一本化版 initialized');

})();
