// DataManager - NGドメイン機能削除版・メソッド未定義エラー完全修正版

class DataManager {
    constructor() {
        this.storageAvailable = false;
        this.STORAGE_KEYS = {
            ARTICLES: 'yourNews_articles',
            RSS_FEEDS: 'yourNews_rssFeeds', 
            USER_PREFERENCES: 'yourNews_userPrefs',
            AI_MODEL: 'yourNews_aiModel',
            FEEDBACK_HISTORY: 'yourNews_feedback',
            KEYWORDS: 'yourNews_keywords'
        };
    }

    async initialize() {
        try {
            console.log('DataManager初期化開始');
            
            // LocalStorage利用可能性チェック
            this.storageAvailable = this.checkStorageAvailability();
            
            if (!this.storageAvailable) {
                console.warn('LocalStorageが利用できません - インメモリモードで動作');
                this.initializeMemoryStorage();
            }

            console.log(`DataManager初期化完了 - Storage: ${this.storageAvailable ? 'LocalStorage' : 'Memory'}`);
            return true;
        } catch (error) {
            console.error('DataManager初期化エラー:', error);
            return false;
        }
    }

    checkStorageAvailability() {
        try {
            const testKey = 'storageTest';
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            return true;
        } catch (error) {
            console.warn('LocalStorage利用不可:', error.message);
            return false;
        }
    }

    initializeMemoryStorage() {
        this.memoryStorage = new Map();
        console.log('インメモリストレージ初期化完了');
    }

    // 【修正】RSSフィード読み込み（必須メソッド追加）
    async loadRssFeeds() {
        try {
            console.log('RSSフィード読み込み開始');
            
            if (this.storageAvailable) {
                const stored = localStorage.getItem(this.STORAGE_KEYS.RSS_FEEDS);
                if (stored) {
                    const feeds = JSON.parse(stored);
                    console.log(`RSSフィード読み込み完了: ${feeds.length}件`);
                    return Array.isArray(feeds) ? feeds : [];
                }
            } else {
                const feeds = this.memoryStorage.get(this.STORAGE_KEYS.RSS_FEEDS) || [];
                console.log(`RSSフィード読み込み完了（メモリ）: ${feeds.length}件`);
                return feeds;
            }

            // デフォルトフィード設定
            const defaultFeeds = this.getDefaultRSSFeeds();
            console.log(`デフォルトRSSフィード使用: ${defaultFeeds.length}件`);
            return defaultFeeds;
        } catch (error) {
            console.error('RSSフィード読み込みエラー:', error);
            return this.getDefaultRSSFeeds();
        }
    }

    // 【修正】RSSフィード保存（必須メソッド追加）
    async saveRssFeeds(feeds) {
        try {
            if (!Array.isArray(feeds)) {
                throw new Error('フィードデータは配列である必要があります');
            }

            console.log(`RSSフィード保存開始: ${feeds.length}件`);

            // データ検証
            const validatedFeeds = feeds.map((feed, index) => {
                if (!feed.url || !feed.name) {
                    console.warn(`無効なフィードをスキップ: index ${index}`, feed);
                    return null;
                }
                
                return {
                    id: feed.id || `feed_${Date.now()}_${index}`,
                    name: feed.name,
                    url: feed.url,
                    enabled: feed.enabled !== false, // デフォルトtrue
                    category: feed.category || 'その他',
                    addedAt: feed.addedAt || new Date().toISOString(),
                    lastFetched: feed.lastFetched || null,
                    fetchCount: feed.fetchCount || 0,
                    errorCount: feed.errorCount || 0,
                    lastError: feed.lastError || null
                };
            }).filter(feed => feed !== null);

            if (this.storageAvailable) {
                localStorage.setItem(this.STORAGE_KEYS.RSS_FEEDS, JSON.stringify(validatedFeeds));
            } else {
                this.memoryStorage.set(this.STORAGE_KEYS.RSS_FEEDS, validatedFeeds);
            }

            console.log(`RSSフィード保存完了: ${validatedFeeds.length}件（無効: ${feeds.length - validatedFeeds.length}件スキップ）`);
            return validatedFeeds;
        } catch (error) {
            console.error('RSSフィード保存エラー:', error);
            throw error;
        }
    }

    // デフォルトRSSフィード設定
    getDefaultRSSFeeds() {
        return [
            {
                id: 'default_nhk_news',
                name: 'NHKニュース',
                url: 'https://www3.nhk.or.jp/rss/news/cat0.xml',
                enabled: true,
                category: 'ニュース',
                addedAt: new Date().toISOString(),
                lastFetched: null,
                fetchCount: 0,
                errorCount: 0,
                lastError: null
            },
            {
                id: 'default_gigazine',
                name: 'GIGAZINE',
                url: 'https://gigazine.net/news/rss_2.0/',
                enabled: true,
                category: 'テクノロジー',
                addedAt: new Date().toISOString(),
                lastFetched: null,
                fetchCount: 0,
                errorCount: 0,
                lastError: null
            }
        ];
    }

    // 記事データ管理
    async loadArticles() {
        try {
            console.log('記事読み込み開始');
            
            if (this.storageAvailable) {
                const stored = localStorage.getItem(this.STORAGE_KEYS.ARTICLES);
                if (stored) {
                    const articles = JSON.parse(stored);
                    console.log(`記事読み込み完了: ${articles.length}件`);
                    return Array.isArray(articles) ? articles : [];
                }
            } else {
                const articles = this.memoryStorage.get(this.STORAGE_KEYS.ARTICLES) || [];
                console.log(`記事読み込み完了（メモリ）: ${articles.length}件`);
                return articles;
            }

            console.log('記事データなし');
            return [];
        } catch (error) {
            console.error('記事読み込みエラー:', error);
            return [];
        }
    }

    async saveArticles(newArticles) {
        try {
            if (!Array.isArray(newArticles)) {
                throw new Error('記事データは配列である必要があります');
            }

            console.log(`記事保存処理開始: 新着${newArticles.length}件`);

            // 既存記事読み込み
            const existingArticles = await this.loadArticles();
            
            // 記事マージ処理
            const mergedArticles = this.mergeArticles(existingArticles, newArticles);
            
            // 保存実行
            if (this.storageAvailable) {
                localStorage.setItem(this.STORAGE_KEYS.ARTICLES, JSON.stringify(mergedArticles));
            } else {
                this.memoryStorage.set(this.STORAGE_KEYS.ARTICLES, mergedArticles);
            }

            console.log(`記事保存完了: 総計${mergedArticles.length}件`);
            return mergedArticles;
        } catch (error) {
            console.error('記事保存エラー:', error);
            throw error;
        }
    }

    // 記事マージ処理（NGドメイン削除版）
    mergeArticles(existingArticles, newArticles) {
        try {
            const existingMap = new Map();
            
            // 既存記事をMapに格納（高速検索用）
            existingArticles.forEach(article => {
                existingMap.set(article.articleId, article);
            });

            const mergedArticles = [...existingArticles];
            let addedCount = 0;
            let updatedCount = 0;

            // 新記事を処理
            newArticles.forEach(newArticle => {
                const existing = existingMap.get(newArticle.articleId);
                
                if (existing) {
                    // 既存記事の更新（重要な状態を保持）
                    if (this.hasImportantState(existing)) {
                        const merged = this.mergeArticleData(existing, newArticle);
                        const index = mergedArticles.findIndex(a => a.articleId === newArticle.articleId);
                        if (index !== -1) {
                            mergedArticles[index] = merged;
                            updatedCount++;
                        }
                    }
                } else {
                    // 新規記事追加
                    mergedArticles.push(newArticle);
                    existingMap.set(newArticle.articleId, newArticle);
                    addedCount++;
                }
            });

            console.log(`記事マージ結果: 追加${addedCount}件, 更新${updatedCount}件, 総計${mergedArticles.length}件`);
            return mergedArticles;
        } catch (error) {
            console.error('記事マージエラー:', error);
            // エラー時は新記事のみ返す
            return newArticles;
        }
    }

    // 重要な状態を持つ記事かチェック（NGドメイン削除版）
    hasImportantState(article) {
        return article.readStatus === 'read' ||
               article.favorited === true ||
               (article.feedbackHistory && article.feedbackHistory.length > 0);
    }

    // より重要な状態を持つかチェック（NGドメイン削除版）
    calculateStateImportance(article) {
        let score = 0;
        if (article.readStatus === 'read') score += 10;
        if (article.favorited) score += 20;
        if (article.feedbackHistory && article.feedbackHistory.length > 0) score += 15;
        if (article.interestScore && article.interestScore !== 50) score += 5;
        return score;
    }

    // 記事データマージ（NGドメイン削除版）
    mergeArticleData(existingArticle, newArticle) {
        try {
            console.log(`記事マージ: "${newArticle.title.substring(0, 30)}..." (状態保持: ${existingArticle.readStatus})`);

            const mergedArticle = {
                ...newArticle,
                interestScore: newArticle.interestScore !== undefined && newArticle.interestScore !== 50
                    ? newArticle.interestScore
                    : (existingArticle.interestScore !== undefined
                        ? existingArticle.interestScore
                        : 50),
                readStatus: existingArticle.readStatus || 'unread',
                favorited: existingArticle.favorited || false,
                feedbackHistory: existingArticle.feedbackHistory || [],
                lastReadAt: existingArticle.lastReadAt,
                matchedKeywords: newArticle.matchedKeywords || existingArticle.matchedKeywords || [],
                articleId: existingArticle.articleId || newArticle.articleId
            };

            return mergedArticle;
        } catch (error) {
            console.error('記事マージエラー:', error);
            return newArticle;
        }
    }

    // 個別記事更新
    async updateArticle(articleId, updates) {
        try {
            console.log(`記事更新: ${articleId}`, updates);
            
            const articles = await this.loadArticles();
            const articleIndex = articles.findIndex(a => a.articleId === articleId);
            
            if (articleIndex === -1) {
                throw new Error(`記事が見つかりません: ${articleId}`);
            }

            // 記事更新
            articles[articleIndex] = {
                ...articles[articleIndex],
                ...updates,
                lastUpdated: new Date().toISOString()
            };

            // 保存
            if (this.storageAvailable) {
                localStorage.setItem(this.STORAGE_KEYS.ARTICLES, JSON.stringify(articles));
            } else {
                this.memoryStorage.set(this.STORAGE_KEYS.ARTICLES, articles);
            }

            console.log(`記事更新完了: ${articleId}`);
            return articles[articleIndex];
        } catch (error) {
            console.error('記事更新エラー:', error);
            throw error;
        }
    }

    // 汎用データ管理
    async loadData(key) {
        try {
            if (this.storageAvailable) {
                const stored = localStorage.getItem(key);
                return stored ? JSON.parse(stored) : null;
            } else {
                return this.memoryStorage.get(key) || null;
            }
        } catch (error) {
            console.error(`データ読み込みエラー (${key}):`, error);
            return null;
        }
    }

    async saveData(key, data) {
        try {
            if (this.storageAvailable) {
                localStorage.setItem(key, JSON.stringify(data));
            } else {
                this.memoryStorage.set(key, data);
            }
            console.log(`データ保存完了: ${key}`);
            return true;
        } catch (error) {
            console.error(`データ保存エラー (${key}):`, error);
            return false;
        }
    }

    // データ削除
    async removeData(key) {
        try {
            if (this.storageAvailable) {
                localStorage.removeItem(key);
            } else {
                this.memoryStorage.delete(key);
            }
            console.log(`データ削除完了: ${key}`);
            return true;
        } catch (error) {
            console.error(`データ削除エラー (${key}):`, error);
            return false;
        }
    }

    // ストレージクリア
    async clearAllData() {
        try {
            if (this.storageAvailable) {
                // YourNews関連のキーのみ削除
                Object.values(this.STORAGE_KEYS).forEach(key => {
                    localStorage.removeItem(key);
                });
                
                // その他のYourNewsキー
                const allKeys = Object.keys(localStorage);
                allKeys.forEach(key => {
                    if (key.startsWith('yourNews_')) {
                        localStorage.removeItem(key);
                    }
                });
            } else {
                this.memoryStorage.clear();
            }

            console.log('全データクリア完了');
            return true;
        } catch (error) {
            console.error('データクリアエラー:', error);
            return false;
        }
    }

    // 統計情報取得
    async getStorageStats() {
        try {
            const stats = {
                storageType: this.storageAvailable ? 'LocalStorage' : 'Memory',
                articles: (await this.loadArticles()).length,
                rssFeeds: (await this.loadRssFeeds()).length,
                totalSize: 0,
                lastUpdate: new Date().toISOString()
            };

            if (this.storageAvailable) {
                // ストレージサイズ計算
                let totalSize = 0;
                Object.values(this.STORAGE_KEYS).forEach(key => {
                    const data = localStorage.getItem(key);
                    if (data) {
                        totalSize += data.length;
                    }
                });
                stats.totalSize = Math.round(totalSize / 1024); // KB
            }

            return stats;
        } catch (error) {
            console.error('統計情報取得エラー:', error);
            return null;
        }
    }

    // データエクスポート
    async exportData() {
        try {
            const exportData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                articles: await this.loadArticles(),
                rssFeeds: await this.loadRssFeeds(),
                keywords: await this.loadData(this.STORAGE_KEYS.KEYWORDS),
                userPreferences: await this.loadData(this.STORAGE_KEYS.USER_PREFERENCES)
            };

            console.log('データエクスポート完了');
            return exportData;
        } catch (error) {
            console.error('データエクスポートエラー:', error);
            throw error;
        }
    }

    // データインポート
    async importData(importData) {
        try {
            if (!importData || typeof importData !== 'object') {
                throw new Error('無効なインポートデータ');
            }

            console.log('データインポート開始');

            // バックアップ作成
            const backup = await this.exportData();
            
            try {
                // データインポート実行
                if (importData.articles) {
                    await this.saveArticles(importData.articles);
                }
                if (importData.rssFeeds) {
                    await this.saveRssFeeds(importData.rssFeeds);
                }
                if (importData.keywords) {
                    await this.saveData(this.STORAGE_KEYS.KEYWORDS, importData.keywords);
                }
                if (importData.userPreferences) {
                    await this.saveData(this.STORAGE_KEYS.USER_PREFERENCES, importData.userPreferences);
                }

                console.log('データインポート完了');
                return true;
            } catch (importError) {
                // インポート失敗時はバックアップから復元
                console.error('インポート失敗、バックアップから復元:', importError);
                await this.restoreFromBackup(backup);
                throw importError;
            }
        } catch (error) {
            console.error('データインポートエラー:', error);
            throw error;
        }
    }

    // バックアップから復元
    async restoreFromBackup(backup) {
        try {
            if (backup.articles) {
                await this.saveArticles(backup.articles);
            }
            if (backup.rssFeeds) {
                await this.saveRssFeeds(backup.rssFeeds);
            }
            if (backup.keywords) {
                await this.saveData(this.STORAGE_KEYS.KEYWORDS, backup.keywords);
            }
            if (backup.userPreferences) {
                await this.saveData(this.STORAGE_KEYS.USER_PREFERENCES, backup.userPreferences);
            }
            console.log('バックアップからの復元完了');
        } catch (error) {
            console.error('バックアップ復元エラー:', error);
            throw error;
        }
    }

    // デバッグ情報取得
    async getDebugInfo() {
        const stats = await this.getStorageStats();
        return {
            initialized: true,
            storageAvailable: this.storageAvailable,
            stats: stats,
            storageKeys: this.STORAGE_KEYS,
            memoryStorageActive: !this.storageAvailable,
            timestamp: new Date().toISOString()
        };
    }
}
