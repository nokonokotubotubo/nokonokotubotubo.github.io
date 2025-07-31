// Minews PWA - データ管理・処理レイヤー（GitHub Gist同期診断機能統合版）

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
// GitHub Gist API連携システム（診断機能強化版）
// ===========================================

window.GistSyncManager = {
    token: null,
    gistId: null,
    isEnabled: false,
    isSyncing: false,
    lastSyncTime: null,
    
    // 簡易暗号化機能（XOR ベース）
    _encrypt(text, key = 'minews_secret_key') {
        if (!text) return '';
        let result = '';
        for (let i = 0; i < text.length; i++) {
            result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return btoa(result); // Base64エンコード
    },

    _decrypt(encryptedText, key = 'minews_secret_key') {
        if (!encryptedText) return '';
        try {
            const text = atob(encryptedText); // Base64デコード
            let result = '';
            for (let i = 0; i < text.length; i++) {
                result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            }
            return result;
        } catch (error) {
            console.error('トークン復号化エラー:', error);
            return '';
        }
    },
    
    // 初期化（設定画面で呼び出し）
    init(token, gistId = null) {
        this.token = token;
        this.gistId = gistId;
        this.isEnabled = !!token;
        
        // 設定をLocalStorageに保存（トークンを暗号化）
        try {
            localStorage.setItem('minews_gist_config', JSON.stringify({
                encryptedToken: token ? this._encrypt(token) : null,
                gistId: gistId,
                isEnabled: this.isEnabled
            }));
        } catch (error) {
            console.warn('Gist設定の保存に失敗:', error);
        }
    },
    
    // 設定読み込み（トークン復号化機能付き）
    loadConfig() {
        try {
            const config = localStorage.getItem('minews_gist_config');
            if (config) {
                const parsed = JSON.parse(config);
                
                // 暗号化されたトークンを復号化
                if (parsed.encryptedToken) {
                    this.token = this._decrypt(parsed.encryptedToken);
                    this.isEnabled = !!this.token;
                } else {
                    this.isEnabled = false;
                }
                
                this.gistId = parsed.gistId;
                return {
                    hasToken: !!this.token,
                    gistId: parsed.gistId,
                    isEnabled: this.isEnabled
                };
            }
        } catch (error) {
            console.warn('Gist設定の読み込みに失敗:', error);
        }
        return null;
    },
    
    // 🔥 自動同期メイン関数
    async autoSync(triggerType = 'manual') {
        if (!this.isEnabled || this.isSyncing || !this.token) {
            return { success: false, reason: 'disabled_or_syncing' };
        }
        
        console.log(`🔄 自動同期開始 (${triggerType})`);
        this.isSyncing = true;
        
        try {
            // 同期対象データを収集
            const syncData = this.collectSyncData();
            const result = await this.syncToCloud(syncData);
            
            if (result) {
                this.lastSyncTime = new Date().toISOString();
                console.log(`✅ 自動同期完了 (${triggerType}) - Gist ID: ${this.gistId}`);
                
                // 同期成功の軽微な通知（必要に応じて）
                if (triggerType === 'manual') {
                    this.showSyncNotification(
                        `同期完了 - Gist ID: ${this.gistId?.substring(0, 8)}...`, 
                        'success'
                    );
                }
            }
            
            return { success: result, triggerType };
        } catch (error) {
            console.error(`❌ 自動同期失敗 (${triggerType}):`, error);
            
            // 🔥 エラー通知を表示
            this.showSyncNotification(
                `同期エラー: ${this.getErrorMessage(error)}`, 
                'error'
            );
            
            return { success: false, error: error.message, triggerType };
        } finally {
            this.isSyncing = false;
        }
    },
    
    // 同期対象データ収集
    collectSyncData() {
        const aiHook = window.DataHooks.useAILearning();
        const wordHook = window.DataHooks.useWordFilters();
        
        return {
            version: window.CONFIG.DATA_VERSION,
            syncTime: new Date().toISOString(),
            aiLearning: aiHook.aiLearning,
            wordFilters: wordHook.wordFilters,
            filterState: {
                viewMode: window.state?.viewMode || 'all',
                selectedSource: window.state?.selectedSource || 'all'
            }
        };
    },
    
    // 🔥 強化版エラーメッセージとデバッグ情報
    getErrorMessage(error, includeDebugInfo = false) {
        let message = '';
        let debugInfo = {};
        
        if (error.message.includes('fetch') || error.name === 'TypeError') {
            message = 'ネットワークエラー';
            debugInfo = {
                type: 'network',
                suggestion: 'インターネット接続を確認してください',
                originalError: error.message
            };
        } else if (error.message.includes('401')) {
            message = 'Personal Access Tokenが無効です';
            debugInfo = {
                type: 'authentication',
                suggestion: 'Personal Access Tokenを再生成してください',
                checkUrl: 'https://github.com/settings/tokens'
            };
        } else if (error.message.includes('403')) {
            message = 'アクセス権限がありません（Rate Limit制限の可能性）';
            debugInfo = {
                type: 'permission',
                suggestion: 'gistスコープの権限があるか確認、またはRate Limit（60回/時間）を超過した可能性',
                rateLimitInfo: 'GitHub API制限: 未認証60回/時間、認証済み5000回/時間'
            };
        } else if (error.message.includes('404')) {
            message = 'Gistが見つかりません';
            debugInfo = {
                type: 'not_found',
                suggestion: 'Gist IDが正しいか確認してください',
                gistId: this.gistId
            };
        } else if (error.message.includes('422')) {
            message = 'リクエストデータが無効です';
            debugInfo = {
                type: 'validation',
                suggestion: 'データ形式を確認してください'
            };
        } else {
            message = '不明なエラー';
            debugInfo = {
                type: 'unknown',
                originalError: error.message,
                errorStack: error.stack
            };
        }
        
        if (includeDebugInfo) {
            return { message, debugInfo };
        }
        return message;
    },
    
    // 🔥 詳細同期テスト機能
    async testSync() {
        console.log('🔍 GitHub Gist同期テスト開始');
        const testResults = {
            timestamp: new Date().toISOString(),
            config: {
                hasToken: !!this.token,
                hasGistId: !!this.gistId,
                isEnabled: this.isEnabled
            },
            tests: []
        };
        
        // テスト1: 基本設定確認
        testResults.tests.push({
            name: '基本設定確認',
            status: (this.token && this.gistId) ? 'pass' : 'fail',
            details: {
                token: this.token ? '設定済み' : '未設定',
                gistId: this.gistId ? `${this.gistId.substring(0, 8)}...` : '未設定'
            }
        });
        
        // テスト2: GitHub API接続テスト
        try {
            const response = await fetch('https://api.github.com/gists', {
                headers: this.token ? {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                } : {}
            });
            
            const rateLimitHeaders = {
                limit: response.headers.get('X-RateLimit-Limit'),
                remaining: response.headers.get('X-RateLimit-Remaining'),
                reset: response.headers.get('X-RateLimit-Reset')
            };
            
            testResults.tests.push({
                name: 'GitHub API接続テスト',
                status: response.ok ? 'pass' : 'fail',
                details: {
                    httpStatus: response.status,
                    statusText: response.statusText,
                    rateLimit: rateLimitHeaders,
                    resetTime: rateLimitHeaders.reset ? 
                        new Date(parseInt(rateLimitHeaders.reset) * 1000).toLocaleString('ja-JP') : null
                }
            });
            
        } catch (error) {
            testResults.tests.push({
                name: 'GitHub API接続テスト',
                status: 'fail',
                details: {
                    error: error.message,
                    errorType: error.name
                }
            });
        }
        
        // テスト3: Gist存在確認テスト
        if (this.token && this.gistId) {
            try {
                const response = await fetch(`https://api.github.com/gists/${this.gistId}`, {
                    headers: {
                        'Authorization': `token ${this.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });
                
                if (response.ok) {
                    const gistData = await response.json();
                    testResults.tests.push({
                        name: 'Gist存在確認',
                        status: 'pass',
                        details: {
                            description: gistData.description,
                            files: Object.keys(gistData.files),
                            lastUpdated: gistData.updated_at,
                            owner: gistData.owner.login
                        }
                    });
                } else {
                    testResults.tests.push({
                        name: 'Gist存在確認',
                        status: 'fail',
                        details: {
                            httpStatus: response.status,
                            statusText: response.statusText
                        }
                    });
                }
                
            } catch (error) {
                testResults.tests.push({
                    name: 'Gist存在確認',
                    status: 'fail',
                    details: {
                        error: error.message
                    }
                });
            }
        }
        
        return testResults;
    },
    
    // クラウド同期（アップロード）
    async syncToCloud(data) {
        if (!this.token) return false;
        
        const payload = {
            description: "Minews User Data Backup (Auto Sync)",
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
            
        const response = await fetch(url, {
            method: this.gistId ? 'PATCH' : 'POST',
            headers: {
                'Authorization': `token ${this.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            const result = await response.json();
            if (!this.gistId) {
                this.gistId = result.id;
                // GistIDを設定に保存
                this.saveGistId(result.id);
            }
            return true;
        }
        return false;
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
            localStorage.setItem('minews_gist_config', JSON.stringify(config));
            this.gistId = gistId;
        } catch (error) {
            console.warn('GistID保存に失敗:', error);
        }
    },
    
    // 軽微な通知表示（エラー対応強化版）
    showSyncNotification(message, type = 'info') {
        // 簡易通知（エラーは5秒、その他は3秒で消去）
        const notification = document.createElement('div');
        notification.className = `sync-notification ${type}`;
        notification.textContent = message;
        
        const backgroundColor = {
            'success': '#4caf50',
            'info': '#2196f3',
            'error': '#f44336',
            'warning': '#ff9800'
        }[type] || '#2196f3';
        
        notification.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 9999;
            background: ${backgroundColor}; color: white;
            padding: 0.75rem 1.25rem; border-radius: 6px;
            font-size: 0.9rem; font-weight: 500;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            opacity: 0.95; cursor: pointer;
            max-width: 300px; word-wrap: break-word;
        `;
        
        // クリックで消去機能
        notification.addEventListener('click', () => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        });
        
        document.body.appendChild(notification);
        
        // 自動消去（エラーは長めに表示）
        const duration = type === 'error' ? 5000 : 3000;
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, duration);
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
    
    // 2. キーワード学習重み（-20～+20点にクリッピング）
    if (article.keywords && aiLearning.wordWeights) {
        article.keywords.forEach(keyword => {
            const weight = aiLearning.wordWeights[keyword] || 0;
            score += Math.max(-20, Math.min(20, weight));
        });
    }
    
    // 3. 配信元重み（-5～+5点にクリッピング、軽量化）
    if (article.rssSource && aiLearning.sourceWeights) {
        const weight = aiLearning.sourceWeights[article.rssSource] || 0;
        score += Math.max(-5, Math.min(5, weight));
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
    
    // 6. 最終スコアを0-100に正規化／★ベーススコアを+30へ
    return Math.max(0, Math.min(100, Math.round(score + 30)));
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
        
        // 配信元重み更新（±20でクリッピング、軽量化）
        if (article.rssSource) {
            const sourceWeight = Math.round(weight * 0.5); // 軽量化：重みを半分に
            const newWeight = (aiLearning.sourceWeights[article.rssSource] || 0) + sourceWeight;
            aiLearning.sourceWeights[article.rssSource] = Math.max(-20, Math.min(20, newWeight));
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
            // categoryWeightsが含まれる旧データの場合はsourceWeightsに初期化
            if (key === window.CONFIG.STORAGE_KEYS.AI_LEARNING && oldData.data.categoryWeights) {
                oldData.data = {
                    ...oldData.data,
                    sourceWeights: {},
                    categoryWeights: undefined // 削除
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
                
                // 重複判定
                const exists = updatedArticles.find(article =>
                    article.id === newArticle.id ||
                    article.url === newArticle.url ||
                    (article.title === newArticle.title && article.rssSource === newArticle.rssSource)
                );
                
                if (exists) {
                    return false; // 重複のため追加せず
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
                // レンダリングスキップの場合は render() を呼ばない
                if (window.render && !skipRender) {
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
