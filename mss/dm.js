// Minews PWA - データ管理・処理レイヤー（完全サイレント同期機能統合版）

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
// 改良版GitHub Gist同期システム（完全サイレント同期機能統合版）
// ===========================================

window.GistSyncManager = {
    token: null,
    gistId: null,
    isEnabled: false,
    isSyncing: false,
    lastSyncTime: null,
    
    // 定期同期システム（双方向対応）
    periodicSyncEnabled: false,
    periodicSyncInterval: null,
    pendingChanges: false,
    lastChangeTime: null,
    
    // 【NEW】設定消失防止フラグ
    _configValidated: false,
    _lastValidConfig: null,
    
    // 【改良】暗号化機能（エラー耐性強化）
    _encrypt(text, key = 'minews_secret_key') {
        if (!text) return '';
        try {
            let result = '';
            for (let i = 0; i < text.length; i++) {
                result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            }
            return btoa(result);
        } catch (error) {
            console.error('暗号化エラー:', error);
            throw new Error('暗号化処理に失敗しました');
        }
    },

    // 【根本修正】復号化機能（失敗時の設定保持）
    _decrypt(encryptedText, key = 'minews_secret_key') {
        if (!encryptedText) return '';
        try {
            const text = atob(encryptedText);
            let result = '';
            for (let i = 0; i < text.length; i++) {
                result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            }
            
            // 復号化結果の妥当性チェック
            if (result.length < 10 || !/^[a-zA-Z0-9_]+$/.test(result)) {
                console.warn('復号化結果が不正です:', result.substring(0, 10));
                throw new Error('復号化データが無効です');
            }
            
            return result;
        } catch (error) {
            console.error('復号化エラー:', error);
            throw new Error('復号化に失敗しました');
        }
    },
    
    // 【根本修正】設定読み込み（消失防止版）
    loadConfig() {
        try {
            const configStr = localStorage.getItem('minews_gist_config');
            if (!configStr) {
                console.log('設定が見つかりません');
                return null;
            }

            let parsed;
            try {
                parsed = JSON.parse(configStr);
            } catch (parseError) {
                console.error('設定のJSONパースに失敗:', parseError);
                if (this._lastValidConfig) {
                    console.log('前回の有効な設定を使用します');
                    return this._lastValidConfig;
                }
                throw parseError;
            }

            // トークン復号化試行（失敗しても設定は保持）
            let decryptedToken = null;
            if (parsed.encryptedToken) {
                try {
                    decryptedToken = this._decrypt(parsed.encryptedToken);
                    console.log('トークンの復号化に成功しました');
                } catch (decryptError) {
                    console.warn('トークンの復号化に失敗しました:', decryptError.message);
                    
                    if (this._lastValidConfig && this._lastValidConfig.hasToken) {
                        console.log('前回の有効なトークンを継続使用します');
                        this.token = this.token;
                        this.isEnabled = true;
                    } else {
                        this.token = null;
                        this.isEnabled = false;
                        console.log('トークンは無効ですが、その他の設定は保持します');
                    }
                }
            } else {
                decryptedToken = null;
                this.isEnabled = false;
            }

            // 設定適用
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

            console.log('設定読み込み完了:', validConfig);
            return validConfig;

        } catch (error) {
            console.error('設定読み込み中の重大エラー:', error);
            
            if (this._lastValidConfig) {
                console.log('エラー発生のため、前回の有効設定を使用します');
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

    // 【改良】初期化（設定保持強化版）
    init(token, gistId = null) {
        if (!token || typeof token !== 'string' || token.trim().length === 0) {
            throw new Error('有効なトークンが必要です');
        }

        // 暗号化テスト
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

        try {
            const configString = JSON.stringify(configData);
            localStorage.setItem('minews_gist_config', configString);
            
            const savedConfig = localStorage.getItem('minews_gist_config');
            if (!savedConfig || JSON.parse(savedConfig).encryptedToken !== encryptedToken) {
                throw new Error('設定の保存確認に失敗');
            }
            
            console.log('GitHub同期設定を正常に保存しました');
        } catch (saveError) {
            console.error('設定保存エラー:', saveError);
            throw new Error('設定の保存に失敗しました: ' + saveError.message);
        }

        this._lastValidConfig = {
            hasToken: true,
            gistId: this.gistId,
            isEnabled: true,
            configuredAt: configData.configuredAt,
            lastSyncTime: this.lastSyncTime
        };
        this._configValidated = true;

        if (this.isEnabled) {
            this.startPeriodicSync(60);
        }
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

    // 【完全修正】定期同期実行（完全サイレント版）
    async _executePeriodicSync() {
        if (!this.isEnabled || !this.token || this.isSyncing) {
            return false;
        }
        
        this.isSyncing = true;
        
        // 【重要】画面更新を一切行わない完全サイレント同期
        const wasUpdating = window.state?.isSyncUpdating || false;
        
        // 【NEW】内部フラグのみ更新（画面更新なし）
        if (window.state) {
            window.state.isSyncUpdating = true;
            window.state.isBackgroundSyncing = true;
        }
        
        try {
            const cloudData = await this.syncFromCloud();
            const localData = this.collectSyncData();
            
            const mergedData = this._mergeData(localData, cloudData);
            
            const uploadResult = await this.syncToCloud(mergedData);
            
            if (uploadResult) {
                // 【重要】完全サイレント適用（画面更新一切なし）
                await this._applyMergedDataToLocalCompletelySilent(mergedData);
                
                this.lastSyncTime = new Date().toISOString();
                this._saveLastSyncTime(this.lastSyncTime);
                this.pendingChanges = false;
                
                console.log('完全サイレント同期完了:', new Date().toLocaleString());
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('定期同期エラー:', error);
            return false;
        } finally {
            this.isSyncing = false;
            
            // 【重要】内部フラグのみ更新（画面更新は一切行わない）
            if (window.state) {
                window.state.isSyncUpdating = wasUpdating; // 元の状態に戻す
                window.state.isBackgroundSyncing = false;
            }
            
            // 【削除】setState()は一切呼び出さない
        }
    },

    // データマージ機能
    _mergeData(localData, cloudData) {
        if (!cloudData) {
            return localData;
        }
        
        const mergedData = {
            version: window.CONFIG.DATA_VERSION,
            syncTime: new Date().toISOString(),
            aiLearning: this._mergeAILearning(localData.aiLearning, cloudData.aiLearning),
            wordFilters: this._mergeWordFilters(localData.wordFilters, cloudData.wordFilters),
            articleStates: this._mergeArticleStates(localData.articleStates, cloudData.articleStates)
        };
        
        return mergedData;
    },

    // AI学習データマージ
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

    // ワードフィルターマージ
    _mergeWordFilters(localWords, cloudWords) {
        if (!cloudWords) return localWords;
        if (!localWords) return cloudWords;
        
        const localTime = new Date(localWords.lastUpdated || 0).getTime();
        const cloudTime = new Date(cloudWords.lastUpdated || 0).getTime();
        
        const mergedInterestWords = [...new Set([
            ...(localWords.interestWords || []),
            ...(cloudWords.interestWords || [])
        ])];
        
        const mergedNgWords = [...new Set([
            ...(localWords.ngWords || []),
            ...(cloudWords.ngWords || [])
        ])];
        
        return {
            interestWords: mergedInterestWords,
            ngWords: mergedNgWords,
            lastUpdated: Math.max(localTime, cloudTime) > 0 ? 
                new Date(Math.max(localTime, cloudTime)).toISOString() : 
                new Date().toISOString()
        };
    },

    // 【改良】記事状態マージ（ログ追加版）
    _mergeArticleStates(localStates, cloudStates) {
        if (!cloudStates) return localStates;
        if (!localStates) return cloudStates;
        
        const mergedStates = { ...cloudStates };
        let mergeCount = 0;
        let localWinCount = 0;
        let cloudWinCount = 0;
        
        Object.keys(localStates).forEach(articleId => {
            const localState = localStates[articleId];
            const cloudState = cloudStates[articleId];
            
            if (!cloudState) {
                mergedStates[articleId] = localState;
                mergeCount++;
                console.log(`記事 ${articleId}: ローカルのみ存在 -> ローカルを使用`);
            } else {
                const localTime = new Date(localState.lastModified || 0).getTime();
                const cloudTime = new Date(cloudState.lastModified || 0).getTime();
                
                if (localTime >= cloudTime) {
                    mergedStates[articleId] = localState;
                    localWinCount++;
                    console.log(`記事 ${articleId}: ローカル優先 (${new Date(localTime).toLocaleString()} >= ${new Date(cloudTime).toLocaleString()})`);
                } else {
                    mergedStates[articleId] = cloudState;
                    cloudWinCount++;
                    console.log(`記事 ${articleId}: クラウド優先 (${new Date(cloudTime).toLocaleString()} > ${new Date(localTime).toLocaleString()})`);
                }
                mergeCount++;
            }
        });
        
        console.log(`記事状態マージ完了: 全${mergeCount}件 (ローカル優先: ${localWinCount}件, クラウド優先: ${cloudWinCount}件)`);
        return mergedStates;
    },

    // 【NEW】完全サイレント適用（画面更新を一切行わない版）
    async _applyMergedDataToLocalCompletelySilent(mergedData) {
        try {
            // AI学習データ更新
            if (mergedData.aiLearning) {
                window.LocalStorageManager.setItem(
                    window.CONFIG.STORAGE_KEYS.AI_LEARNING, 
                    mergedData.aiLearning
                );
                window.DataHooksCache.clear('aiLearning');
            }
            
            // ワードフィルター更新
            if (mergedData.wordFilters) {
                window.LocalStorageManager.setItem(
                    window.CONFIG.STORAGE_KEYS.WORD_FILTERS, 
                    mergedData.wordFilters
                );
                window.DataHooksCache.clear('wordFilters');
            }
            
            // 記事状態更新
            if (mergedData.articleStates) {
                const articlesHook = window.DataHooks.useArticles();
                const currentArticles = articlesHook.articles;
                
                const updatedArticles = currentArticles.map(article => {
                    const state = mergedData.articleStates[article.id];
                    if (state) {
                        return {
                            ...article,
                            readStatus: state.readStatus || article.readStatus,
                            userRating: state.userRating || article.userRating,
                            readLater: state.readLater || article.readLater,
                            lastModified: state.lastModified || article.lastModified
                        };
                    }
                    return article;
                });
                
                // 【重要】データ保存とキャッシュ更新のみ
                window.LocalStorageManager.setItem(
                    window.CONFIG.STORAGE_KEYS.ARTICLES, 
                    updatedArticles
                );
                window.DataHooksCache.clear('articles');
                window.DataHooksCache.articles = updatedArticles;
                
                // 【重要】window.stateは更新するが画面更新は行わない
                if (window.state) {
                    window.state.articles = updatedArticles;
                }
                
                // 【削除】render()やsetState()は一切呼び出さない
            }
            
            console.log('完全サイレント同期: データ更新完了（画面更新なし）');
            return true;
        } catch (error) {
            console.error('完全サイレント同期: データ更新エラー:', error);
            return false;
        }
    },

    // マージ結果をローカルに適用（手動同期用）
    async _applyMergedDataToLocal(mergedData) {
        try {
            if (mergedData.aiLearning) {
                window.LocalStorageManager.setItem(
                    window.CONFIG.STORAGE_KEYS.AI_LEARNING, 
                    mergedData.aiLearning
                );
                window.DataHooksCache.clear('aiLearning');
            }
            
            if (mergedData.wordFilters) {
                window.LocalStorageManager.setItem(
                    window.CONFIG.STORAGE_KEYS.WORD_FILTERS, 
                    mergedData.wordFilters
                );
                window.DataHooksCache.clear('wordFilters');
            }
            
            if (mergedData.articleStates) {
                const articlesHook = window.DataHooks.useArticles();
                const currentArticles = articlesHook.articles;
                
                const updatedArticles = currentArticles.map(article => {
                    const state = mergedData.articleStates[article.id];
                    if (state) {
                        return {
                            ...article,
                            readStatus: state.readStatus || article.readStatus,
                            userRating: state.userRating || article.userRating,
                            readLater: state.readLater || article.readLater,
                            lastModified: state.lastModified || article.lastModified
                        };
                    }
                    return article;
                });
                
                window.LocalStorageManager.setItem(
                    window.CONFIG.STORAGE_KEYS.ARTICLES, 
                    updatedArticles
                );
                window.DataHooksCache.clear('articles');
                
                if (window.state) {
                    window.state.articles = updatedArticles;
                }
                
                if (window.render) {
                    window.render();
                }
            }
            
            console.log('ローカルデータ更新完了');
            return true;
        } catch (error) {
            console.error('ローカルデータ更新エラー:', error);
            return false;
        }
    },
    
    // 【NEW】手動同期（ソート抑制対応版）
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

    // 【改良】手動同期実行（明示的画面更新版）
    async _executeManualSync() {
        if (this.isSyncing) {
            return { success: false, reason: 'already_syncing' };
        }
        
        // 【重要】手動同期は明示的に画面更新を行う
        if (window.setState) {
            window.setState({ isSyncUpdating: true, isBackgroundSyncing: false });
        }
        
        this.isSyncing = true;
        
        try {
            const cloudData = await this.syncFromCloud();
            const localData = this.collectSyncData();
            
            const mergedData = this._mergeData(localData, cloudData);
            
            const uploadResult = await this.syncToCloud(mergedData);
            
            if (uploadResult) {
                // 手動同期は通常の適用（画面更新あり）
                await this._applyMergedDataToLocal(mergedData);
                
                this.lastSyncTime = new Date().toISOString();
                this._saveLastSyncTime(this.lastSyncTime);
                this.pendingChanges = false;
                
                console.log('手動同期完了:', new Date().toLocaleString());
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

    // タイムスタンプ比較判定
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

    // 最終同期時刻保存
    _saveLastSyncTime(timestamp) {
        try {
            const currentConfigStr = localStorage.getItem('minews_gist_config');
            if (!currentConfigStr) {
                console.warn('設定が見つからないため同期時刻の保存をスキップ');
                return;
            }

            const config = JSON.parse(currentConfigStr);
            config.lastSyncTime = timestamp;
            this.lastSyncTime = timestamp;

            localStorage.setItem('minews_gist_config', JSON.stringify(config));
            
            if (this._lastValidConfig) {
                this._lastValidConfig.lastSyncTime = timestamp;
            }
            
            console.log('最終同期時刻を更新:', timestamp);
        } catch (error) {
            console.error('同期時刻保存エラー:', error);
        }
    },
    
    // 【修正】同期対象データ収集（タイムスタンプ改善版）
    collectSyncData() {
        const aiHook = window.DataHooks.useAILearning();
        const wordHook = window.DataHooks.useWordFilters();
        const articlesHook = window.DataHooks.useArticles();
        
        const articleStates = {};
        const currentTime = new Date().toISOString();
        
        articlesHook.articles.forEach(article => {
            articleStates[article.id] = {
                readStatus: article.readStatus,
                userRating: article.userRating || 0,
                readLater: article.readLater || false,
                lastModified: article.lastModified || currentTime
            };
        });
        
        return {
            version: window.CONFIG.DATA_VERSION,
            syncTime: currentTime,
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
            console.error('クラウド同期エラー:', error);
            return false;
        }
    },
    
    // クラウド同期（ダウンロード）
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
                    return JSON.parse(content);
                }
            }
            return null;
        } catch (error) {
            console.error('クラウドデータ取得エラー:', error);
            return null;
        }
    },
    
    // GistID保存
    saveGistId(gistId) {
        try {
            const currentConfigStr = localStorage.getItem('minews_gist_config');
            if (!currentConfigStr) {
                console.warn('設定が見つからないためGistID保存をスキップ');
                return;
            }

            const config = JSON.parse(currentConfigStr);
            config.gistId = gistId;
            config.lastSyncTime = this.lastSyncTime || null;

            localStorage.setItem('minews_gist_config', JSON.stringify(config));
            
            this.gistId = gistId;
            
            if (this._lastValidConfig) {
                this._lastValidConfig.gistId = gistId;
            }
            
            console.log('Gist IDを保存:', gistId);
        } catch (error) {
            console.error('GistID保存エラー:', error);
            this.gistId = gistId;
        }
    },

    // 設定診断機能
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
                try {
                    const config = JSON.parse(configStr);
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
                } catch (parseError) {
                    diagnostics.results.push({
                        test: 'JSON解析',
                        status: 'FAIL',
                        details: parseError.message
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
            // 【修正】記事更新時のタイムスタンプ自動追加
            updateArticle(articleId, updates, options = {}) {
                const { skipRender = false } = options;
                
                // 【追加】状態変更時に必ずlastModifiedを更新
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
