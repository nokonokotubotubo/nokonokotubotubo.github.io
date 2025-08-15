// Minews PWA - データ管理・処理レイヤー（新規作成版）

(function() {
    'use strict';

    // ========== 設定・定数 ==========
    window.CONFIG = {
        STORAGE_KEYS: {
            ARTICLES: 'minews_articles_v2',
            AI_LEARNING: 'minews_aiLearning_v2',
            WORD_FILTERS: 'minews_wordFilters_v2',
            FILTER_STATE: 'minews_filterState_v2',
            APP_SETTINGS: 'minews_appSettings_v2'
        },
        MAX_ARTICLES: 1000,
        DATA_VERSION: '2.0',
        REQUEST_TIMEOUT: 15000,
        MAX_RETRIES: 2,
        RETRY_DELAY: 3000,
        AI_SCORE_RANGE: { min: 0, max: 100 },
        DATE_RANGE: { min: 0, max: 14 } // days
    };

    // ========== デフォルトデータ ==========
    window.DEFAULT_DATA = {
        articles: [],
        aiLearning: {
            version: window.CONFIG.DATA_VERSION,
            wordWeights: {},
            sourceWeights: {},
            lastUpdated: new Date().toISOString()
        },
        wordFilters: {
            interestWords: ['AI', '生成AI', 'Claude', 'Perplexity'],
            ngWords: [],
            lastUpdated: new Date().toISOString()
        },
        filterState: {
            viewMode: 'all',
            selectedFolders: [],
            selectedFeeds: [],
            aiScoreRange: { min: 0, max: 100 },
            dateRange: { min: 0, max: 14 }
        },
        appSettings: {
            darkMode: true,
            autoSync: false,
            syncInterval: 60,
            lastUpdated: new Date().toISOString()
        }
    };

    // ========== ユーティリティ関数 ==========
    window.Utils = {
        generateId() {
            return `article_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        },

        formatDate(dateString) {
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
        },

        truncateText(text, maxLength = 200) {
            return text.length <= maxLength ? text : text.substring(0, maxLength).trim() + '...';
        },

        cleanText(text) {
            if (typeof text !== 'string' || !text) return '';
            return text.replace(/<[^>]*>/g, '')
                      .replace(/&lt;/g, '<')
                      .replace(/&gt;/g, '>')
                      .replace(/&amp;/g, '&')
                      .replace(/&quot;/g, '"')
                      .replace(/&#39;/g, "'")
                      .replace(/&nbsp;/g, ' ')
                      .replace(/\s+/g, ' ')
                      .trim();
        },

        debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }
    };

    // ========== ローカルストレージ管理 ==========
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
                console.error('LocalStorage保存エラー:', error);
                return false;
            }
        },

        getItem(key, defaultValue = null) {
            try {
                const stored = localStorage.getItem(key);
                if (!stored) {
                    if (defaultValue) this.setItem(key, defaultValue);
                    return defaultValue;
                }

                const parsed = JSON.parse(stored);
                return parsed.data || defaultValue;
            } catch (error) {
                console.error('LocalStorage読み込みエラー:', error);
                if (defaultValue) this.setItem(key, defaultValue);
                return defaultValue;
            }
        },

        removeItem(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (error) {
                console.error('LocalStorage削除エラー:', error);
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
                available: 5000000 - totalSize // 5MB制限
            };
        },

        clearAll() {
            try {
                Object.values(window.CONFIG.STORAGE_KEYS).forEach(key => {
                    localStorage.removeItem(key);
                });
                return true;
            } catch (error) {
                console.error('全データ削除エラー:', error);
                return false;
            }
        }
    };

    // ========== AIスコアリングシステム ==========
    window.AIScoring = {
        calculateScore(article, aiLearning, wordFilters) {
            let rawScore = 50; // ベーススコア

            // キーワードスコア
            if (article.keywords && aiLearning.wordWeights && article.keywords.length > 0) {
                const keywordScore = this._calculateKeywordScore(article.keywords, aiLearning.wordWeights);
                rawScore += keywordScore;
            }

            // ソーススコア
            if (article.rssSource && aiLearning.sourceWeights) {
                const sourceWeight = aiLearning.sourceWeights[article.rssSource] || 0;
                rawScore += sourceWeight;
            }

            // 興味ワードスコア
            if (wordFilters.interestWords && article.title) {
                const content = (article.title + ' ' + (article.content || '')).toLowerCase();
                const matchedWords = wordFilters.interestWords.filter(word => 
                    content.includes(word.toLowerCase())
                );
                
                if (matchedWords.length > 0) {
                    const interestBonus = matchedWords.length * 10;
                    rawScore += interestBonus;
                }
            }

            // ユーザー評価スコア
            if (article.userRating > 0) {
                const ratingImpact = (article.userRating - 3) * 15;
                rawScore += ratingImpact;
            }

            // 0-100の範囲に正規化
            return Math.max(0, Math.min(100, Math.round(rawScore)));
        },

        _calculateKeywordScore(keywords, wordWeights) {
            let totalScore = 0;
            const topKeywords = keywords.slice(0, 5); // 上位5個のキーワードのみ

            topKeywords.forEach(keyword => {
                const weight = wordWeights[keyword] || 0;
                totalScore += weight;
            });

            return totalScore * 0.5; // 重みを調整
        },

        updateLearning(article, rating, aiLearning, isRevert = false) {
            const weights = [0, -1.0, -0.5, 0, 0.5, 1.0];
            let weight = weights[rating] || 0;
            if (isRevert) weight = -weight;

            // キーワード学習
            if (article.keywords) {
                article.keywords.slice(0, 5).forEach(keyword => {
                    const currentWeight = aiLearning.wordWeights[keyword] || 0;
                    const newWeight = currentWeight + weight;
                    aiLearning.wordWeights[keyword] = Math.max(-30, Math.min(30, newWeight));
                });
            }

            // ソース学習
            if (article.rssSource) {
                const currentWeight = aiLearning.sourceWeights[article.rssSource] || 0;
                const newWeight = currentWeight + (weight * 0.7);
                aiLearning.sourceWeights[article.rssSource] = Math.max(-20, Math.min(20, newWeight));
            }

            aiLearning.lastUpdated = new Date().toISOString();
            return aiLearning;
        }
    };

    // ========== ワードフィルター管理 ==========
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
            } else if (type === 'ng') {
                const exists = wordFilters.ngWords.some(ngWordObj => 
                    ngWordObj.word.toLowerCase() === word.toLowerCase() &&
                    ngWordObj.scope === scope &&
                    ngWordObj.target === target
                );
                
                if (!exists) {
                    wordFilters.ngWords.push({
                        word: word,
                        scope: scope,
                        target: target
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
                    return true;
                }
            } else if (type === 'ng') {
                const index = wordFilters.ngWords.findIndex(ngWordObj => 
                    ngWordObj.word === word &&
                    (scope === null || ngWordObj.scope === scope) &&
                    (target === null || ngWordObj.target === target)
                );
                
                if (index > -1) {
                    wordFilters.ngWords.splice(index, 1);
                    wordFilters.lastUpdated = new Date().toISOString();
                    return true;
                }
            }
            return false;
        },

        filterArticles(articles, wordFilters) {
            if (!wordFilters.ngWords.length) return articles;

            return articles.filter(article => {
                const text = (article.title + ' ' + (article.content || '')).toLowerCase();
                
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

    // ========== 記事データローダー ==========
    window.ArticleLoader = {
        async loadArticlesFromJSON() {
            try {
                const response = await fetch('./articles.json', {
                    cache: 'no-cache',
                    headers: {
                        'Cache-Control': 'no-cache'
                    }
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                
                return {
                    articles: data.articles || [],
                    lastUpdated: data.lastUpdated || new Date().toISOString(),
                    totalCount: data.totalCount || 0,
                    folderStats: data.folderStats || {}
                };
            } catch (error) {
                console.error('記事データの読み込みに失敗しました:', error);
                return {
                    articles: [],
                    lastUpdated: new Date().toISOString(),
                    totalCount: 0,
                    folderStats: {}
                };
            }
        }
    };

    // ========== データフック ==========
    window.DataHooks = {
        _cache: {},

        useArticles() {
            if (!this._cache.articles) {
                this._cache.articles = window.LocalStorageManager.getItem(
                    window.CONFIG.STORAGE_KEYS.ARTICLES, 
                    window.DEFAULT_DATA.articles
                );
            }

            return {
                articles: this._cache.articles,
                
                setArticles(newArticles) {
                    this._cache.articles = newArticles;
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.ARTICLES, newArticles);
                    if (window.state) {
                        window.state.articles = newArticles;
                    }
                },

                updateArticle(articleId, updates) {
                    const updatedArticles = this._cache.articles.map(article =>
                        article.id === articleId 
                            ? { ...article, ...updates, lastModified: new Date().toISOString() }
                            : article
                    );
                    this.setArticles(updatedArticles);
                },

                addArticle(newArticle) {
                    const updatedArticles = [newArticle, ...this._cache.articles];
                    if (updatedArticles.length > window.CONFIG.MAX_ARTICLES) {
                        updatedArticles.splice(window.CONFIG.MAX_ARTICLES);
                    }
                    this.setArticles(updatedArticles);
                },

                async refreshArticles() {
                    const data = await window.ArticleLoader.loadArticlesFromJSON();
                    
                    // 既存の記事状態を保持
                    const existingStates = {};
                    this._cache.articles.forEach(article => {
                        if (article.readStatus !== 'unread' || 
                            (article.userRating && article.userRating > 0) || 
                            article.readLater === true) {
                            existingStates[article.id] = {
                                readStatus: article.readStatus,
                                userRating: article.userRating,
                                readLater: article.readLater,
                                lastModified: article.lastModified
                            };
                        }
                    });

                    // 新しい記事に既存の状態を適用
                    const updatedArticles = data.articles.map(newArticle => {
                        const existingState = existingStates[newArticle.id];
                        if (existingState) {
                            return { ...newArticle, ...existingState };
                        }
                        return newArticle;
                    });

                    this.setArticles(updatedArticles);
                    return {
                        totalAdded: updatedArticles.length,
                        statesPreserved: Object.keys(existingStates).length,
                        lastUpdated: data.lastUpdated
                    };
                }
            };
        },

        useAILearning() {
            if (!this._cache.aiLearning) {
                this._cache.aiLearning = window.LocalStorageManager.getItem(
                    window.CONFIG.STORAGE_KEYS.AI_LEARNING,
                    window.DEFAULT_DATA.aiLearning
                );
            }

            return {
                aiLearning: this._cache.aiLearning,
                
                updateLearning(article, rating, isRevert = false) {
                    const updatedLearning = window.AIScoring.updateLearning(
                        article, rating, this._cache.aiLearning, isRevert
                    );
                    this._cache.aiLearning = updatedLearning;
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, updatedLearning);
                    return updatedLearning;
                },

                resetLearning() {
                    this._cache.aiLearning = { ...window.DEFAULT_DATA.aiLearning };
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, this._cache.aiLearning);
                }
            };
        },

        useWordFilters() {
            if (!this._cache.wordFilters) {
                this._cache.wordFilters = window.LocalStorageManager.getItem(
                    window.CONFIG.STORAGE_KEYS.WORD_FILTERS,
                    window.DEFAULT_DATA.wordFilters
                );
            }

            return {
                wordFilters: this._cache.wordFilters,
                
                addInterestWord(word) {
                    const updated = { ...this._cache.wordFilters };
                    if (window.WordFilterManager.addWord(word, 'interest', updated)) {
                        this._cache.wordFilters = updated;
                        window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, updated);
                        return true;
                    }
                    return false;
                },

                addNGWord(word, scope = 'all', target = null) {
                    const updated = { ...this._cache.wordFilters };
                    if (window.WordFilterManager.addWord(word, 'ng', updated, scope, target)) {
                        this._cache.wordFilters = updated;
                        window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, updated);
                        return true;
                    }
                    return false;
                },

                removeInterestWord(word) {
                    const updated = { ...this._cache.wordFilters };
                    if (window.WordFilterManager.removeWord(word, 'interest', updated)) {
                        this._cache.wordFilters = updated;
                        window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, updated);
                        return true;
                    }
                    return false;
                },

                removeNGWord(word, scope = null, target = null) {
                    const updated = { ...this._cache.wordFilters };
                    if (window.WordFilterManager.removeWord(word, 'ng', updated, scope, target)) {
                        this._cache.wordFilters = updated;
                        window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, updated);
                        return true;
                    }
                    return false;
                },

                resetFilters() {
                    this._cache.wordFilters = { ...window.DEFAULT_DATA.wordFilters };
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, this._cache.wordFilters);
                }
            };
        },

        useFilterState() {
            if (!this._cache.filterState) {
                this._cache.filterState = window.LocalStorageManager.getItem(
                    window.CONFIG.STORAGE_KEYS.FILTER_STATE,
                    window.DEFAULT_DATA.filterState
                );
            }

            return {
                filterState: this._cache.filterState,
                
                updateFilterState(updates) {
                    this._cache.filterState = { ...this._cache.filterState, ...updates };
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.FILTER_STATE, this._cache.filterState);
                },

                resetFilterState() {
                    this._cache.filterState = { ...window.DEFAULT_DATA.filterState };
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.FILTER_STATE, this._cache.filterState);
                }
            };
        },

        clearCache() {
            this._cache = {};
        }
    };

    // ========== エクスポート・インポート機能 ==========
    window.DataManager = {
        exportSettings() {
            const aiHook = window.DataHooks.useAILearning();
            const wordHook = window.DataHooks.useWordFilters();
            const filterHook = window.DataHooks.useFilterState();

            const exportData = {
                version: window.CONFIG.DATA_VERSION,
                exportDate: new Date().toISOString(),
                exportType: 'complete_settings',
                aiLearning: aiHook.aiLearning,
                wordFilters: wordHook.wordFilters,
                filterState: filterHook.filterState
            };

            const dataStr = JSON.stringify(exportData, null, 2);
            const dataBlob = new Blob([dataStr], { type: "application/json" });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = `minews_settings_${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            URL.revokeObjectURL(link.href);
        },

        async importSettings(file) {
            try {
                const text = await file.text();
                const importData = JSON.parse(text);

                if (!importData.aiLearning || !importData.wordFilters) {
                    throw new Error('無効なデータ形式です');
                }

                const aiHook = window.DataHooks.useAILearning();
                const wordHook = window.DataHooks.useWordFilters();
                const filterHook = window.DataHooks.useFilterState();

                // AI学習データのインポート
                if (importData.aiLearning) {
                    aiHook.aiLearning.wordWeights = { ...importData.aiLearning.wordWeights };
                    aiHook.aiLearning.sourceWeights = { ...importData.aiLearning.sourceWeights };
                    aiHook.aiLearning.lastUpdated = new Date().toISOString();
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, aiHook.aiLearning);
                }

                // ワードフィルターのインポート
                if (importData.wordFilters) {
                    wordHook.wordFilters.interestWords = [...(importData.wordFilters.interestWords || [])];
                    wordHook.wordFilters.ngWords = [...(importData.wordFilters.ngWords || [])];
                    wordHook.wordFilters.lastUpdated = new Date().toISOString();
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, wordHook.wordFilters);
                }

                // フィルター状態のインポート
                if (importData.filterState) {
                    filterHook.updateFilterState(importData.filterState);
                }

                window.DataHooks.clearCache();
                return true;
            } catch (error) {
                console.error('インポートエラー:', error);
                throw error;
            }
        },

        resetAllData() {
            if (!confirm('すべての設定をリセットしますか？この操作は元に戻せません。')) {
                return false;
            }

            try {
                window.LocalStorageManager.clearAll();
                window.DataHooks.clearCache();
                
                // デフォルトデータで初期化
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, window.DEFAULT_DATA.aiLearning);
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, window.DEFAULT_DATA.wordFilters);
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.FILTER_STATE, window.DEFAULT_DATA.filterState);
                
                return true;
            } catch (error) {
                console.error('リセットエラー:', error);
                return false;
            }
        }
    };

    // ========== GitHub同期システム（簡易版） ==========
    window.GitHubSync = {
        isEnabled: false,
        token: null,
        gistId: null,

        init(token, gistId = null) {
            this.token = token;
            this.gistId = gistId;
            this.isEnabled = !!token;

            // 設定を保存
            const config = {
                hasToken: !!token,
                gistId: gistId,
                lastUpdated: new Date().toISOString()
            };
            
            window.LocalStorageManager.setItem('minews_github_config', config);
        },

        async syncToCloud() {
            if (!this.isEnabled || !this.token) {
                throw new Error('GitHub同期が設定されていません');
            }

            const aiHook = window.DataHooks.useAILearning();
            const wordHook = window.DataHooks.useWordFilters();
            const filterHook = window.DataHooks.useFilterState();

            const syncData = {
                version: window.CONFIG.DATA_VERSION,
                syncTime: new Date().toISOString(),
                aiLearning: aiHook.aiLearning,
                wordFilters: wordHook.wordFilters,
                filterState: filterHook.filterState
            };

            const payload = {
                description: `Minews Settings Backup - ${new Date().toLocaleString('ja-JP')}`,
                public: false,
                files: {
                    "minews_settings.json": {
                        content: JSON.stringify(syncData, null, 2)
                    }
                }
            };

            const url = this.gistId 
                ? `https://api.github.com/gists/${this.gistId}`
                : 'https://api.github.com/gists';
                
            const method = this.gistId ? 'PATCH' : 'POST';

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
                    const config = window.LocalStorageManager.getItem('minews_github_config', {});
                    config.gistId = result.id;
                    window.LocalStorageManager.setItem('minews_github_config', config);
                }
                return true;
            } else {
                throw new Error(`同期失敗: ${response.status} ${response.statusText}`);
            }
        },

        async syncFromCloud() {
            if (!this.isEnabled || !this.token || !this.gistId) {
                throw new Error('GitHub同期が設定されていません');
            }

            const response = await fetch(`https://api.github.com/gists/${this.gistId}`, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                const gist = await response.json();
                if (gist.files && gist.files['minews_settings.json']) {
                    const content = gist.files['minews_settings.json'].content;
                    const syncData = JSON.parse(content);
                    
                    // データを復元
                    if (syncData.aiLearning) {
                        window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, syncData.aiLearning);
                    }
                    if (syncData.wordFilters) {
                        window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, syncData.wordFilters);
                    }
                    if (syncData.filterState) {
                        window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.FILTER_STATE, syncData.filterState);
                    }
                    
                    window.DataHooks.clearCache();
                    return true;
                }
            }
            
            throw new Error(`復元失敗: ${response.status} ${response.statusText}`);
        },

        disable() {
            this.isEnabled = false;
            this.token = null;
            this.gistId = null;
            window.LocalStorageManager.removeItem('minews_github_config');
        }
    };

    // ========== 初期化 ==========
    window.addEventListener('DOMContentLoaded', () => {
        console.log('Minews PWA データ管理レイヤー初期化完了');
        
        // GitHub同期設定を復元
        const githubConfig = window.LocalStorageManager.getItem('minews_github_config');
        if (githubConfig && githubConfig.hasToken) {
            // トークンは復元しないが、設定は保持
            window.GitHubSync.gistId = githubConfig.gistId;
        }
    });

})();
