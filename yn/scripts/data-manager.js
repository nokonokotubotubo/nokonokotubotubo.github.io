// DataManager - 記事状態保持機能強化版
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
            
            // localStorage利用可能性チェック
            this.storageAvailable = this.checkStorageAvailability();
            
            if (!this.storageAvailable) {
                throw new Error('localStorage is not available');
            }
            
            console.log('localStorage利用可能');
            
            // データ整合性チェック
            await this.validateStorageData();
            
            console.log('DataManager初期化完了');
            return true;
            
        } catch (error) {
            console.error('DataManager初期化エラー:', error);
            return false;
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
    
    async validateStorageData() {
        try {
            // 各ストレージキーの整合性チェック
            Object.values(this.STORAGE_KEYS).forEach(key => {
                try {
                    const data = localStorage.getItem(key);
                    if (data) {
                        JSON.parse(data);
                    }
                } catch (e) {
                    console.warn(`Invalid data found for key ${key}, clearing...`);
                    localStorage.removeItem(key);
                }
            });
        } catch (error) {
            console.error('Storage validation error:', error);
        }
    }
    
    // 【新機能】記事保存時のマージ処理
    async saveArticles(newArticles) {
        try {
            console.log(`記事保存開始: ${newArticles.length}件`);
            
            // 既存記事データを読み込み
            const existingArticles = await this.loadArticles();
            const existingMap = new Map();
            
            // 既存記事をURL基準でマップ化
            existingArticles.forEach(article => {
                const key = this.generateStableArticleKey(article);
                existingMap.set(key, article);
            });
            
            console.log(`既存記事: ${existingArticles.length}件, 新記事: ${newArticles.length}件`);
            
            // 新記事と既存記事をマージ
            const mergedArticles = newArticles.map(newArticle => {
                const key = this.generateStableArticleKey(newArticle);
                const existingArticle = existingMap.get(key);
                
                if (existingArticle) {
                    // 既存記事が見つかった場合はマージ
                    return this.mergeArticleData(existingArticle, newArticle);
                } else {
                    // 新記事の場合はそのまま
                    return newArticle;
                }
            });
            
            // 既存記事で新記事にない物も保持（期限内なら）
            const newArticleKeys = new Set(newArticles.map(a => this.generateStableArticleKey(a)));
            const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            
            existingArticles.forEach(existingArticle => {
                const key = this.generateStableArticleKey(existingArticle);
                const articleDate = new Date(existingArticle.addedDate || existingArticle.publishDate).getTime();
                
                // 新記事にない && 1週間以内 && 重要な状態がある記事は保持
                if (!newArticleKeys.has(key) && 
                    articleDate > oneWeekAgo && 
                    this.hasImportantState(existingArticle)) {
                    mergedArticles.push(existingArticle);
                }
            });
            
            // 重複除去とソート
            const uniqueArticles = this.removeDuplicateArticles(mergedArticles);
            const sortedArticles = this.sortArticlesByDate(uniqueArticles);
            
            // 件数制限
            const finalArticles = this.enforceArticleLimit(sortedArticles);
            
            // 保存実行
            const saveData = {
                articles: finalArticles,
                lastUpdate: new Date().toISOString(),
                version: '1.0'
            };
            
            localStorage.setItem(this.STORAGE_KEYS.ARTICLES, JSON.stringify(saveData));
            
            console.log(`記事保存完了: ${finalArticles.length}件 (${mergedArticles.length - finalArticles.length}件の重複除去)`);
            return true;
            
        } catch (error) {
            console.error('記事保存エラー:', error);
            return false;
        }
    }
    
    // 【新機能】安定した記事キー生成
    generateStableArticleKey(article) {
        // URLを主キーとし、タイトルをサブキーとする
        const url = article.url || '';
        const title = (article.title || '').substring(0, 50);
        const domain = article.domain || '';
        
        // URLが同じなら同一記事として扱う
        if (url) {
            return `${domain}_${this.simpleHash(url)}`;
        }
        
        // URLがない場合はタイトル+ドメインで判定
        return `${domain}_${this.simpleHash(title)}`;
    }
    
    // 【新機能】記事データマージ
    mergeArticleData(existingArticle, newArticle) {
        // 既存の状態を保持しつつ、新しい情報で更新
        const merged = {
            ...newArticle, // 新記事の基本情報
            
            // 【重要】既存の状態情報を保持
            articleId: existingArticle.articleId, // 既存IDを維持
            readStatus: existingArticle.readStatus || 'unread',
            favorited: existingArticle.favorited || false,
            interestScore: existingArticle.interestScore || newArticle.interestScore || 50,
            matchedKeywords: existingArticle.matchedKeywords || [],
            feedbackHistory: existingArticle.feedbackHistory || [],
            ngDomain: existingArticle.ngDomain || false,
            
            // メタデータ更新
            addedDate: existingArticle.addedDate || newArticle.addedDate,
            lastUpdated: new Date().toISOString(),
            
            // 新しい情報で更新される項目
            title: newArticle.title || existingArticle.title,
            excerpt: newArticle.excerpt || existingArticle.excerpt,
            publishDate: newArticle.publishDate || existingArticle.publishDate
        };
        
        console.log(`記事マージ: "${merged.title.substring(0, 30)}..." (状態保持: ${existingArticle.readStatus})`);
        return merged;
    }
    
    // 重要な状態を持つ記事かチェック
    hasImportantState(article) {
        return article.readStatus === 'read' ||
               article.favorited === true ||
               (article.feedbackHistory && article.feedbackHistory.length > 0) ||
               article.ngDomain === true;
    }
    
    // 重複記事除去（改善版）
    removeDuplicateArticles(articles) {
        const seen = new Map();
        const unique = [];
        
        articles.forEach(article => {
            const key = this.generateStableArticleKey(article);
            
            if (!seen.has(key)) {
                seen.add(key, article);
                unique.push(article);
            } else {
                // 既に存在する場合は、より多くの状態情報を持つ方を採用
                const existing = seen.get(key);
                if (this.hasMoreImportantState(article, existing)) {
                    // 既存を置き換え
                    const index = unique.findIndex(a => this.generateStableArticleKey(a) === key);
                    if (index !== -1) {
                        unique[index] = article;
                        seen.set(key, article);
                    }
                }
            }
        });
        
        return unique;
    }
    
    // より重要な状態を持つかチェック
    hasMoreImportantState(articleA, articleB) {
        const scoreA = this.calculateStateImportance(articleA);
        const scoreB = this.calculateStateImportance(articleB);
        return scoreA > scoreB;
    }
    
    calculateStateImportance(article) {
        let score = 0;
        
        if (article.readStatus === 'read') score += 10;
        if (article.favorited) score += 20;
        if (article.feedbackHistory && article.feedbackHistory.length > 0) score += 15;
        if (article.ngDomain) score += 5;
        if (article.interestScore && article.interestScore !== 50) score += 5;
        
        return score;
    }
    
    // 日付順ソート
    sortArticlesByDate(articles) {
        return articles.sort((a, b) => {
            const dateA = new Date(a.publishDate || a.addedDate);
            const dateB = new Date(b.publishDate || b.addedDate);
            return dateB - dateA; // 新しい順
        });
    }
    
    // 件数制限（改善版）
    enforceArticleLimit(articles) {
        const maxArticles = 1000;
        
        if (articles.length <= maxArticles) {
            return articles;
        }
        
        // 重要な記事を優先的に残す
        const important = articles.filter(a => this.hasImportantState(a));
        const normal = articles.filter(a => !this.hasImportantState(a));
        
        // 重要な記事 + 残り枠で新しい記事
        const remainingSlots = maxArticles - important.length;
        const finalArticles = [
            ...important,
            ...normal.slice(0, Math.max(0, remainingSlots))
        ];
        
        return this.sortArticlesByDate(finalArticles);
    }
    
    // ハッシュ関数
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 32bit integer
        }
        return Math.abs(hash);
    }
    
    // 【新機能】記事状態更新（既存記事IDでの更新）
    async updateArticle(articleId, updates) {
        try {
            const articles = await this.loadArticles();
            const articleIndex = articles.findIndex(a => a.articleId === articleId);
            
            if (articleIndex === -1) {
                console.warn(`記事が見つかりません: ${articleId}`);
                return false;
            }
            
            // 記事更新
            articles[articleIndex] = {
                ...articles[articleIndex],
                ...updates,
                lastUpdated: new Date().toISOString()
            };
            
            // 保存（マージ処理をスキップして直接保存）
            const saveData = {
                articles: articles,
                lastUpdate: new Date().toISOString(),
                version: '1.0'
            };
            
            localStorage.setItem(this.STORAGE_KEYS.ARTICLES, JSON.stringify(saveData));
            
            console.log(`記事状態更新: ${articleId}`, updates);
            return true;
            
        } catch (error) {
            console.error('記事状態更新エラー:', error);
            return false;
        }
    }
    
    // 記事読み込み
    async loadArticles() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEYS.ARTICLES);
            
            if (!data) {
                console.log('保存された記事がありません');
                return [];
            }
            
            const parsed = JSON.parse(data);
            const articles = parsed.articles || [];
            
            console.log(`記事読み込み完了: ${articles.length}件`);
            return articles;
            
        } catch (error) {
            console.error('記事読み込みエラー:', error);
            return [];
        }
    }
    
    // RSSフィード管理
    async saveRssFeeds(feeds) {
        try {
            const saveData = {
                feeds: feeds,
                lastUpdate: new Date().toISOString(),
                version: '1.0'
            };
            
            localStorage.setItem(this.STORAGE_KEYS.RSS_FEEDS, JSON.stringify(saveData));
            console.log(`RSSフィード保存完了: ${feeds.length}件`);
            return true;
            
        } catch (error) {
            console.error('RSSフィード保存エラー:', error);
            return false;
        }
    }
    
    async loadRssFeeds() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEYS.RSS_FEEDS);
            
            if (!data) {
                console.log('保存されたRSSフィードがありません');
                return [];
            }
            
            const parsed = JSON.parse(data);
            const feeds = parsed.feeds || [];
            
            console.log(`RSSフィード読み込み完了: ${feeds.length}件`);
            return feeds;
            
        } catch (error) {
            console.error('RSSフィード読み込みエラー:', error);
            return [];
        }
    }
    
    // ユーザー設定管理
    async saveUserPreferences(preferences) {
        try {
            const saveData = {
                preferences: preferences,
                lastUpdate: new Date().toISOString(),
                version: '1.0'
            };
            
            localStorage.setItem(this.STORAGE_KEYS.USER_PREFERENCES, JSON.stringify(saveData));
            console.log('ユーザー設定保存完了');
            return true;
            
        } catch (error) {
            console.error('ユーザー設定保存エラー:', error);
            return false;
        }
    }
    
    async loadUserPreferences() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEYS.USER_PREFERENCES);
            
            if (!data) {
                return {};
            }
            
            const parsed = JSON.parse(data);
            return parsed.preferences || {};
            
        } catch (error) {
            console.error('ユーザー設定読み込みエラー:', error);
            return {};
        }
    }
    
    // 汎用データ管理
    async saveData(key, data) {
        try {
            const saveData = {
                data: data,
                timestamp: Date.now(),
                version: '1.0'
            };
            
            localStorage.setItem(key, JSON.stringify(saveData));
            return true;
            
        } catch (error) {
            console.error(`Data save error for key ${key}:`, error);
            return false;
        }
    }
    
    async loadData(key) {
        try {
            const data = localStorage.getItem(key);
            
            if (!data) {
                return null;
            }
            
            const parsed = JSON.parse(data);
            return parsed.data || null;
            
        } catch (error) {
            console.error(`Data load error for key ${key}:`, error);
            return null;
        }
    }
    
    // データクリーンアップ
    async cleanOldArticles() {
        try {
            const articles = await this.loadArticles();
            const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            
            const filteredArticles = articles.filter(article => {
                const articleDate = new Date(article.addedDate || article.publishDate).getTime();
                return articleDate > oneWeekAgo || this.hasImportantState(article);
            });
            
            if (filteredArticles.length !== articles.length) {
                await this.saveArticles(filteredArticles);
                console.log(`古い記事を削除: ${articles.length - filteredArticles.length}件`);
            }
            
            return true;
            
        } catch (error) {
            console.error('古い記事削除エラー:', error);
            return false;
        }
    }
    
    // 全データ削除
    async clearAllData() {
        try {
            Object.values(this.STORAGE_KEYS).forEach(key => {
                localStorage.removeItem(key);
            });
            
            console.log('全データ削除完了');
            return true;
            
        } catch (error) {
            console.error('全データ削除エラー:', error);
            return false;
        }
    }
    
    // データエクスポート
    async exportData() {
        try {
            const exportData = {
                articles: await this.loadArticles(),
                rssFeeds: await this.loadRssFeeds(),
                userPreferences: await this.loadUserPreferences(),
                keywords: await this.loadData(this.STORAGE_KEYS.KEYWORDS),
                feedback: await this.loadData(this.STORAGE_KEYS.FEEDBACK_HISTORY),
                exportDate: new Date().toISOString(),
                version: '1.0'
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
            
            if (importData.userPreferences) {
                await this.saveUserPreferences(importData.userPreferences);
            }
            
            if (importData.keywords) {
                await this.saveData(this.STORAGE_KEYS.KEYWORDS, importData.keywords);
            }
            
            if (importData.feedback) {
                await this.saveData(this.STORAGE_KEYS.FEEDBACK_HISTORY, importData.feedback);
            }
            
            console.log('データインポート完了');
            return true;
            
        } catch (error) {
            console.error('データインポートエラー:', error);
            return false;
        }
    }
}
