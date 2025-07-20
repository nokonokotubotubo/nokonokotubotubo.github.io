// データ管理クラス（仕様書準拠・未読既読機能修正版）
class DataManager {
    constructor() {
        this.storageAvailable = false;
        this.maxArticles = 1000;
        this.retentionDays = 7;
        this.storageKeys = {
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
            
            // ローカルストレージ可用性チェック
            if (this.checkStorageAvailability()) {
                console.log('localStorage利用可能');
                this.storageAvailable = true;
                
                // 古いデータのクリーンアップ
                await this.cleanOldArticles();
                
                // 記事数制限の適用
                await this.enforceArticleLimit();
                
                console.log('DataManager初期化完了');
                return true;
            } else {
                throw new Error('localStorage利用不可');
            }
        } catch (error) {
            console.error('DataManager初期化エラー:', error);
            throw error;
        }
    }
    
    checkStorageAvailability() {
        try {
            const test = 'test';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    }
    
    // 記事データ操作
    async saveArticles(articles) {
        try {
            if (!Array.isArray(articles)) {
                throw new Error('Articles must be an array');
            }
            
            const dataToSave = {
                articles: articles,
                timestamp: Date.now(),
                version: '1.0'
            };
            
            localStorage.setItem(this.storageKeys.ARTICLES, JSON.stringify(dataToSave));
            console.log(`記事保存完了: ${articles.length}件`);
            return true;
        } catch (error) {
            console.error('記事保存エラー:', error);
            return false;
        }
    }
    
    async loadArticles() {
        try {
            const stored = localStorage.getItem(this.storageKeys.ARTICLES);
            if (!stored) {
                console.log('保存された記事がありません');
                return [];
            }
            
            const data = JSON.parse(stored);
            const articles = data.articles || [];
            
            console.log(`記事読み込み完了: ${articles.length}件`);
            return articles;
        } catch (error) {
            console.error('記事読み込みエラー:', error);
            return [];
        }
    }
    
    // 【修正】個別記事更新関数（未読既読機能対応）
    async updateArticle(articleId, updates) {
        try {
            if (!articleId || !updates || typeof updates !== 'object') {
                console.error('Invalid parameters for updateArticle');
                return false;
            }
            
            const articles = await this.loadArticles();
            const articleIndex = articles.findIndex(article => article.articleId === articleId);
            
            if (articleIndex === -1) {
                console.warn(`Article not found: ${articleId}`);
                return false;
            }
            
            // 記事データを更新
            articles[articleIndex] = { ...articles[articleIndex], ...updates };
            
            // 更新日時を記録
            articles[articleIndex].lastUpdated = new Date().toISOString();
            
            // データ保存
            const saveResult = await this.saveArticles(articles);
            
            if (saveResult) {
                console.log(`Article updated successfully: ${articleId}`, updates);
                return true;
            } else {
                console.error(`Failed to save updated article: ${articleId}`);
                return false;
            }
            
        } catch (error) {
            console.error('Article update error:', error);
            return false;
        }
    }
    
    // 【修正】一括記事更新関数
    async updateMultipleArticles(updates) {
        try {
            if (!Array.isArray(updates) || updates.length === 0) {
                console.error('Invalid updates array for updateMultipleArticles');
                return false;
            }
            
            const articles = await this.loadArticles();
            let updateCount = 0;
            
            updates.forEach(({ articleId, data }) => {
                const articleIndex = articles.findIndex(article => article.articleId === articleId);
                if (articleIndex !== -1) {
                    articles[articleIndex] = { ...articles[articleIndex], ...data };
                    articles[articleIndex].lastUpdated = new Date().toISOString();
                    updateCount++;
                }
            });
            
            if (updateCount > 0) {
                const saveResult = await this.saveArticles(articles);
                if (saveResult) {
                    console.log(`${updateCount} articles updated successfully`);
                    return true;
                }
            }
            
            return false;
            
        } catch (error) {
            console.error('Multiple articles update error:', error);
            return false;
        }
    }
    
    // RSSフィード操作
    async saveRssFeeds(feeds) {
        try {
            if (!Array.isArray(feeds)) {
                throw new Error('Feeds must be an array');
            }
            
            const dataToSave = {
                feeds: feeds,
                timestamp: Date.now(),
                version: '1.0'
            };
            
            localStorage.setItem(this.storageKeys.RSS_FEEDS, JSON.stringify(dataToSave));
            console.log(`RSSフィード保存完了: ${feeds.length}件`);
            return true;
        } catch (error) {
            console.error('RSSフィード保存エラー:', error);
            return false;
        }
    }
    
    async loadRssFeeds() {
        try {
            const stored = localStorage.getItem(this.storageKeys.RSS_FEEDS);
            if (!stored) {
                console.log('保存されたRSSフィードがありません');
                return [];
            }
            
            const data = JSON.parse(stored);
            const feeds = data.feeds || [];
            
            console.log(`RSSフィード読み込み完了: ${feeds.length}件`);
            return feeds;
        } catch (error) {
            console.error('RSSフィード読み込みエラー:', error);
            return [];
        }
    }
    
    // ユーザー設定操作
    async saveUserPreferences(preferences) {
        try {
            const dataToSave = {
                preferences: preferences,
                timestamp: Date.now(),
                version: '1.0'
            };
            
            localStorage.setItem(this.storageKeys.USER_PREFERENCES, JSON.stringify(dataToSave));
            console.log('ユーザー設定保存完了');
            return true;
        } catch (error) {
            console.error('ユーザー設定保存エラー:', error);
            return false;
        }
    }
    
    async loadUserPreferences() {
        try {
            const stored = localStorage.getItem(this.storageKeys.USER_PREFERENCES);
            if (!stored) {
                return this.getDefaultPreferences();
            }
            
            const data = JSON.parse(stored);
            return data.preferences || this.getDefaultPreferences();
        } catch (error) {
            console.error('ユーザー設定読み込みエラー:', error);
            return this.getDefaultPreferences();
        }
    }
    
    getDefaultPreferences() {
        return {
            theme: 'light',
            articlesPerPage: 50,
            showImages: true,
            autoRefresh: false,
            refreshInterval: 30,
            sortBy: 'interest',
            filterUnread: false
        };
    }
    
    // データクリーンアップ機能
    async cleanOldArticles() {
        try {
            const articles = await this.loadArticles();
            const cutoffDate = Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000);
            
            const validArticles = articles.filter(article => {
                const articleDate = new Date(article.publishDate || article.addedDate).getTime();
                return articleDate > cutoffDate;
            });
            
            if (validArticles.length < articles.length) {
                await this.saveArticles(validArticles);
                console.log(`古い記事を削除: ${articles.length - validArticles.length}件`);
            }
            
            return true;
        } catch (error) {
            console.error('記事クリーンアップエラー:', error);
            return false;
        }
    }
    
    async enforceArticleLimit() {
        try {
            const articles = await this.loadArticles();
            
            if (articles.length > this.maxArticles) {
                // 新しい記事を優先して保持
                const sortedArticles = articles.sort((a, b) => {
                    const dateA = new Date(a.publishDate || a.addedDate).getTime();
                    const dateB = new Date(b.publishDate || b.addedDate).getTime();
                    return dateB - dateA;
                });
                
                const limitedArticles = sortedArticles.slice(0, this.maxArticles);
                await this.saveArticles(limitedArticles);
                
                console.log(`記事数制限適用: ${articles.length} → ${this.maxArticles}件`);
            }
            
            return true;
        } catch (error) {
            console.error('記事数制限適用エラー:', error);
            return false;
        }
    }
    
    // 汎用データ操作
    async saveData(key, data) {
        try {
            const dataToSave = {
                data: data,
                timestamp: Date.now(),
                version: '1.0'
            };
            
            localStorage.setItem(key, JSON.stringify(dataToSave));
            return true;
        } catch (error) {
            console.error(`データ保存エラー (${key}):`, error);
            return false;
        }
    }
    
    async loadData(key, defaultValue = null) {
        try {
            const stored = localStorage.getItem(key);
            if (!stored) {
                return defaultValue;
            }
            
            const parsed = JSON.parse(stored);
            return parsed.data || defaultValue;
        } catch (error) {
            console.error(`データ読み込みエラー (${key}):`, error);
            return defaultValue;
        }
    }
    
    // ストレージ統計情報
    getStorageStats() {
        try {
            let totalSize = 0;
            let itemCount = 0;
            
            for (let key in localStorage) {
                if (localStorage.hasOwnProperty(key) && key.startsWith('yourNews_')) {
                    totalSize += localStorage[key].length;
                    itemCount++;
                }
            }
            
            return {
                totalArticles: this.loadArticles().then(articles => articles.length),
                rssCount: this.loadRssFeeds().then(feeds => feeds.length),
                usedBytes: totalSize,
                itemCount: itemCount,
                lastCleanup: this.loadData('yourNews_lastCleanup', '未実行')
            };
        } catch (error) {
            console.error('ストレージ統計取得エラー:', error);
            return {
                totalArticles: 0,
                rssCount: 0,
                usedBytes: 0,
                itemCount: 0,
                lastCleanup: '取得エラー'
            };
        }
    }
    
    // データ完全削除
    async clearAllData() {
        try {
            Object.values(this.storageKeys).forEach(key => {
                localStorage.removeItem(key);
            });
            
            console.log('全データを削除しました');
            return true;
        } catch (error) {
            console.error('データ削除エラー:', error);
            return false;
        }
    }
    
    // データエクスポート
    async exportData() {
        try {
            const articles = await this.loadArticles();
            const rssFeeds = await this.loadRssFeeds();
            const preferences = await this.loadUserPreferences();
            
            const exportData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                articles: articles,
                rssFeeds: rssFeeds,
                preferences: preferences
            };
            
            return exportData;
        } catch (error) {
            console.error('データエクスポートエラー:', error);
            return null;
        }
    }
    
    // データインポート
    async importData(importData) {
        try {
            if (!importData || !importData.version) {
                throw new Error('無効なインポートデータ');
            }
            
            if (importData.articles) {
                await this.saveArticles(importData.articles);
            }
            
            if (importData.rssFeeds) {
                await this.saveRssFeeds(importData.rssFeeds);
            }
            
            if (importData.preferences) {
                await this.saveUserPreferences(importData.preferences);
            }
            
            console.log('データインポート完了');
            return true;
        } catch (error) {
            console.error('データインポートエラー:', error);
            return false;
        }
    }
}
