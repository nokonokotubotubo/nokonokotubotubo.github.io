// DataManager - NGドメイン機能削除版

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

    // その他のメソッドは既存のまま維持...
    async initialize() { /* 省略 */ }
    async saveArticles(newArticles) { /* 省略 */ }
    async loadArticles() { /* 省略 */ }
    // 他のメソッドも同様...
}
