// データ管理（localStorage操作）
class DataManager {
    constructor() {
        // ストレージキー定数
        this.STORAGE_KEYS = {
            ARTICLES: 'yourNews_articles',
            RSS_FEEDS: 'yourNews_rssFeeds',
            USER_PREFERENCES: 'yourNews_userPrefs',
            AI_MODEL: 'yourNews_aiModel',
            FEEDBACK_HISTORY: 'yourNews_feedback',
            KEYWORDS: 'yourNews_keywords'
        };
        
        // デフォルト設定
        this.DEFAULT_PREFERENCES = {
            theme: 'light',
            articlesPerPage: 20,
            autoRefreshInterval: 30,
            defaultSort: 'interest',
            enableNotifications: true,
            maxArticles: 1000,
            dataRetentionDays: 7
        };
        
        this.isInitialized = false;
    }
    
    async initialize() {
        try {
            console.log('DataManager初期化開始');
            
            // ストレージ利用可能性確認
            this.checkStorageAvailability();
            
            // データ整合性チェック・修復
            await this.validateAndRepairData();
            
            // 古いデータクリーンアップ
            this.cleanOldArticles();
            
            // 記事数制限適用
            this.enforceArticleLimit();
            
            this.isInitialized = true;
            console.log('DataManager初期化完了');
            
        } catch (error) {
            console.error('DataManager初期化エラー:', error);
            throw new Error('データ管理の初期化に失敗しました: ' + error.message);
        }
    }
    
    checkStorageAvailability() {
        if (typeof(Storage) === "undefined") {
            throw new Error('localStorage not supported');
        }
        
        // ストレージ容量テスト
        try {
            const testKey = 'yourNews_test';
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
        } catch (error) {
            throw new Error('localStorage not available: ' + error.message);
        }
        
        console.log('localStorage利用可能');
        return true;
    }
    
    async validateAndRepairData() {
        // 各ストレージキーのデータ整合性確認
        Object.values(this.STORAGE_KEYS).forEach(key => {
            try {
                const data = this.loadData(key);
                if (data === null) {
                    // データが存在しない場合、デフォルト値で初期化
                    this.initializeDefaultData(key);
                }
            } catch (error) {
                console.warn(`データ修復: ${key}`, error);
                this.initializeDefaultData(key);
            }
        });
    }
    
    initializeDefaultData(key) {
        switch (key) {
            case this.STORAGE_KEYS.ARTICLES:
                this.saveData(key, []);
                break;
            case this.STORAGE_KEYS.RSS_FEEDS:
                this.saveData(key, this.getDefaultRssFeeds());
                break;
            case this.STORAGE_KEYS.USER_PREFERENCES:
                this.saveData(key, this.DEFAULT_PREFERENCES);
                break;
            case this.STORAGE_KEYS.AI_MODEL:
                this.saveData(key, { vocabulary: {}, idfValues: {}, documentCount: 0 });
                break;
            case this.STORAGE_KEYS.FEEDBACK_HISTORY:
                this.saveData(key, []);
                break;
            case this.STORAGE_KEYS.KEYWORDS:
                this.saveData(key, { interestWords: [], ngWords: [] });
                break;
            default:
                console.warn('未知のストレージキー:', key);
        }
    }
    
getDefaultRssFeeds() {
    // Phase B: 動作確認済み実RSSフィード（2025年7月時点）
    return [
        {
            id: 'nhk_news',
            name: 'NHKニュース',
            url: 'https://www3.nhk.or.jp/rss/news/cat0.xml',
            category: 'ニュース',
            enabled: true,
            addedDate: new Date().toISOString()
        },
        {
            id: 'itmedia_news',
            name: 'ITmedia News',
            url: 'https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml',
            category: 'テクノロジー',
            enabled: true,
            addedDate: new Date().toISOString()
        },
        {
            id: 'yahoo_news_topics',
            name: 'Yahoo!ニュース - トピックス',
            url: 'https://news.yahoo.co.jp/rss/topics/top-picks.xml',
            category: 'ニュース',
            enabled: true,
            addedDate: new Date().toISOString()
        }
    ];
}
    
    // 汎用データ保存
    saveData(key, data) {
        try {
            const serializedData = JSON.stringify({
                data: data,
                timestamp: Date.now(),
                version: '1.0'
            });
            
            localStorage.setItem(key, serializedData);
            return true;
            
        } catch (error) {
            console.error('データ保存エラー:', key, error);
            
            // ストレージ容量不足の場合
            if (error.name === 'QuotaExceededError') {
                this.handleStorageFull();
                return false;
            }
            
            throw error;
        }
    }
    
    // 汎用データ読み込み
    loadData(key) {
        try {
            const serializedData = localStorage.getItem(key);
            if (serializedData === null) {
                return null;
            }
            
            const parsedData = JSON.parse(serializedData);
            
            // データ形式バリデーション
            if (!parsedData || typeof parsedData !== 'object') {
                throw new Error('Invalid data format');
            }
            
            return parsedData.data;
            
        } catch (error) {
            console.error('データ読み込みエラー:', key, error);
            return null;
        }
    }
    
    // 記事データ管理
    async saveArticles(articles) {
        if (!Array.isArray(articles)) {
            throw new Error('Articles must be an array');
        }
        
        // データバリデーション
        const validatedArticles = articles.filter(article => {
            return article && 
                   typeof article.articleId === 'string' && 
                   typeof article.title === 'string' && 
                   typeof article.url === 'string';
        });
        
        return this.saveData(this.STORAGE_KEYS.ARTICLES, validatedArticles);
    }
    
    async loadArticles() {
        const articles = this.loadData(this.STORAGE_KEYS.ARTICLES) || [];
        
        // Phase Aでは基本構造の記事データを返す
        return articles.map(article => ({
            ...article,
            interestScore: article.interestScore || 50,
            readStatus: article.readStatus || 'unread',
            favorited: article.favorited || false
        }));
    }
    
    // ユーザー設定管理
    saveUserPreferences(preferences) {
        const currentPrefs = this.loadData(this.STORAGE_KEYS.USER_PREFERENCES) || {};
        const mergedPrefs = { ...this.DEFAULT_PREFERENCES, ...currentPrefs, ...preferences };
        return this.saveData(this.STORAGE_KEYS.USER_PREFERENCES, mergedPrefs);
    }
    
    loadUserPreferences() {
        const prefs = this.loadData(this.STORAGE_KEYS.USER_PREFERENCES);
        return { ...this.DEFAULT_PREFERENCES, ...prefs };
    }
    
    // RSS管理
    async saveRssFeeds(feeds) {
        if (!Array.isArray(feeds)) {
            throw new Error('RSS feeds must be an array');
        }
        return this.saveData(this.STORAGE_KEYS.RSS_FEEDS, feeds);
    }
    
    async loadRssFeeds() {
        return this.loadData(this.STORAGE_KEYS.RSS_FEEDS) || [];
    }
    
    // カテゴリ管理
    getCategories() {
        const articles = this.loadData(this.STORAGE_KEYS.ARTICLES) || [];
        const rssFeeds = this.loadData(this.STORAGE_KEYS.RSS_FEEDS) || [];
        
        const categories = new Set();
        
        // RSSフィードから取得
        rssFeeds.forEach(feed => {
            if (feed.category) {
                categories.add(feed.category);
            }
        });
        
        // 記事から取得
        articles.forEach(article => {
            if (article.category) {
                categories.add(article.category);
            }
        });
        
        return Array.from(categories);
    }
    
    // データクリーンアップ
    cleanOldArticles() {
        try {
            const preferences = this.loadUserPreferences();
            const retentionDays = preferences.dataRetentionDays || 7;
            const cutoffDate = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
            
            const articles = this.loadData(this.STORAGE_KEYS.ARTICLES) || [];
            const validArticles = articles.filter(article => {
                const articleDate = new Date(article.publishDate || article.timestamp);
                return articleDate.getTime() > cutoffDate;
            });
            
            if (validArticles.length !== articles.length) {
                this.saveData(this.STORAGE_KEYS.ARTICLES, validArticles);
                console.log(`古い記事を削除: ${articles.length - validArticles.length}件`);
            }
            
        } catch (error) {
            console.error('古い記事削除エラー:', error);
        }
    }
    
    enforceArticleLimit() {
        try {
            const preferences = this.loadUserPreferences();
            const maxArticles = preferences.maxArticles || 1000;
            
            const articles = this.loadData(this.STORAGE_KEYS.ARTICLES) || [];
            
            if (articles.length > maxArticles) {
                // 日付順でソート（新しい順）
                articles.sort((a, b) => {
                    const dateA = new Date(a.publishDate || a.timestamp);
                    const dateB = new Date(b.publishDate || b.timestamp);
                    return dateB.getTime() - dateA.getTime();
                });
                
                // 制限数まで削除
                const limitedArticles = articles.slice(0, maxArticles);
                this.saveData(this.STORAGE_KEYS.ARTICLES, limitedArticles);
                
                console.log(`記事数制限適用: ${articles.length - limitedArticles.length}件削除`);
            }
            
        } catch (error) {
            console.error('記事数制限エラー:', error);
        }
    }
    
    handleStorageFull() {
        console.warn('ストレージ容量不足を検出');
        
        // 緊急クリーンアップ
        try {
            // より短い保持期間で再クリーンアップ
            const articles = this.loadData(this.STORAGE_KEYS.ARTICLES) || [];
            const emergencyRetentionDays = 3;
            const cutoffDate = Date.now() - (emergencyRetentionDays * 24 * 60 * 60 * 1000);
            
            const validArticles = articles.filter(article => {
                const articleDate = new Date(article.publishDate || article.timestamp);
                return articleDate.getTime() > cutoffDate;
            });
            
            // さらに件数制限
            const limitedArticles = validArticles.slice(0, 500);
            this.saveData(this.STORAGE_KEYS.ARTICLES, limitedArticles);
            
            console.log('緊急クリーンアップ完了');
            
        } catch (error) {
            console.error('緊急クリーンアップ失敗:', error);
        }
    }
    
    // デバッグ・統計情報
    getStorageStats() {
        const stats = {};
        
        Object.entries(this.STORAGE_KEYS).forEach(([name, key]) => {
            const data = localStorage.getItem(key);
            stats[name] = {
                exists: data !== null,
                size: data ? data.length : 0,
                sizeKB: data ? Math.round(data.length / 1024 * 100) / 100 : 0
            };
        });
        
        return stats;
    }
    
    // データリセット
    clearAllData() {
        Object.values(this.STORAGE_KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
        console.log('全データクリア完了');
    }
}

// Phase A完了確認用デバッグ関数
window.debugPhaseA = function() {
    console.log('=== Phase A Debug Info ===');
    
    // DataManager存在確認
    console.log('DataManager available:', typeof DataManager !== 'undefined');
    
    // ローカルストレージテスト
    try {
        localStorage.setItem('yourNews_phaseA_test', 'success');
        console.log('LocalStorage test:', localStorage.getItem('yourNews_phaseA_test'));
        localStorage.removeItem('yourNews_phaseA_test');
    } catch (error) {
        console.error('LocalStorage test failed:', error);
    }
    
    // アプリインスタンス確認
    console.log('YourNewsApp instance:', typeof window.yourNewsApp !== 'undefined');
    
    if (window.yourNewsApp && window.yourNewsApp.dataManager) {
        console.log('Storage stats:', window.yourNewsApp.dataManager.getStorageStats());
    }
    
    console.log('=== Phase A Debug Complete ===');
};
