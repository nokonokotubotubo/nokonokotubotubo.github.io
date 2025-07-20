// YourNewsApp - フィードバック重複防止完全対応版

class YourNewsApp {
    constructor() {
        this.dataManager = null;
        this.rssFetcher = null;
        this.aiEngine = null;
        this.uiController = null;
        this.articleCard = null;
        this.pwaManager = null;

        this.initialized = false;
        this.aiDisabled = false;

        // フィードバック処理制御（永続化対応）
        this.feedbackProcessing = false;
        this.feedbackQueue = [];
        this.processingArticles = new Set();
        this.buttonCooldowns = new Map();

        // ストレージキー
        this.FEEDBACK_STATE_KEY = 'yourNews_feedbackState';
        this.basePath = '/yn';
    }

    async initialize() {
        try {
            console.log('YourNewsApp初期化開始');

            // 【追加】フィードバック状態復元
            this.restoreFeedbackState();

            await this.initializeTensorFlow();

            this.dataManager = new DataManager();
            await this.dataManager.initialize();

            this.rssFetcher = new RSSFetcher();
            this.articleCard = new ArticleCard();

            if (!this.aiDisabled && typeof AIEngine !== 'undefined') {
                this.aiEngine = new AIEngine();
                await this.aiEngine.initialize();
                console.log('✅ AI機能初期化完了');
            } else {
                console.warn('⚠️ AI機能無効 - フォールバックモード');
            }

            this.uiController = new UIController(this.dataManager, this.rssFetcher, this.articleCard);
            await this.uiController.initialize();

            this.setupEventListeners();
            this.setupGlobalFunctions();

            // 【追加】定期クリーンアップ開始
            this.startFeedbackStateCleanup();

            this.initialized = true;
            console.log('YourNewsApp初期化完了');
            return true;
        } catch (error) {
            console.error('YourNewsApp初期化エラー:', error);
            this.showNotification('アプリケーションの初期化に失敗しました', 'error');
            return false;
        }
    }

    // 【新機能】フィードバック状態復元
    restoreFeedbackState() {
        try {
            const stored = localStorage.getItem(this.FEEDBACK_STATE_KEY);
            if (!stored) return;

            const state = JSON.parse(stored);
            const now = Date.now();

            // 処理中記事の復元（5分以内のもののみ）
            if (state.processingArticles) {
                state.processingArticles.forEach(articleData => {
                    if (now - articleData.timestamp < 5 * 60 * 1000) { // 5分
                        this.processingArticles.add(articleData.articleId);
                        console.log(`🔄 処理中状態復元: ${articleData.articleId}`);
                    }
                });
            }

            // クールダウンの復元（残り時間があるもののみ）
            if (state.buttonCooldowns) {
                state.buttonCooldowns.forEach(cooldownData => {
                    if (now < cooldownData.endTime) {
                        this.buttonCooldowns.set(cooldownData.key, cooldownData.endTime);
                        console.log(`⏱️ クールダウン復元: ${cooldownData.key} (残り${Math.round((cooldownData.endTime - now) / 1000)}秒)`);
                    }
                });
            }

            console.log(`✅ フィードバック状態復元完了: 処理中${this.processingArticles.size}件, クールダウン${this.buttonCooldowns.size}件`);
        } catch (error) {
            console.error('フィードバック状態復元エラー:', error);
            // エラー時は状態クリア
            localStorage.removeItem(this.FEEDBACK_STATE_KEY);
        }
    }

    // 【新機能】フィードバック状態保存
    saveFeedbackState() {
        try {
            const now = Date.now();

            // 処理中記事をタイムスタンプ付きで保存
            const processingArticles = Array.from(this.processingArticles).map(articleId => ({
                articleId: articleId,
                timestamp: now
            }));

            // クールダウンを期限付きで保存
            const buttonCooldowns = Array.from(this.buttonCooldowns.entries()).map(([key, endTime]) => ({
                key: key,
                endTime: endTime
            }));

            const state = {
                processingArticles: processingArticles,
                buttonCooldowns: buttonCooldowns,
                lastUpdate: now
            };

            localStorage.setItem(this.FEEDBACK_STATE_KEY, JSON.stringify(state));
        } catch (error) {
            console.error('フィードバック状態保存エラー:', error);
        }
    }

    // 【新機能】定期クリーンアップ
    startFeedbackStateCleanup() {
        // 30秒ごとにクリーンアップ実行
        setInterval(() => {
            this.cleanupFeedbackState();
        }, 30000);

        // 初回実行
        this.cleanupFeedbackState();
    }

    // 【新機能】期限切れ状態のクリーンアップ
    cleanupFeedbackState() {
        try {
            const now = Date.now();
            let cleaned = false;

            // 期限切れクールダウンの削除
            for (const [key, endTime] of this.buttonCooldowns.entries()) {
                if (now >= endTime) {
                    this.buttonCooldowns.delete(key);
                    cleaned = true;
                    console.log(`🧹 期限切れクールダウン削除: ${key}`);
                }
            }

            // 長時間処理中の記事をクリア（5分超過）
            const staleArticles = [];
            const stored = localStorage.getItem(this.FEEDBACK_STATE_KEY);
            if (stored) {
                const state = JSON.parse(stored);
                if (state.processingArticles) {
                    state.processingArticles.forEach(articleData => {
                        if (now - articleData.timestamp > 5 * 60 * 1000) { // 5分超過
                            if (this.processingArticles.has(articleData.articleId)) {
                                this.processingArticles.delete(articleData.articleId);
                                staleArticles.push(articleData.articleId);
                                cleaned = true;
                            }
                        }
                    });
                }
            }

            if (staleArticles.length > 0) {
                console.log(`🧹 長時間処理中記事クリア: ${staleArticles.length}件`);
                // ボタンも再有効化
                staleArticles.forEach(articleId => {
                    this.enableFeedbackButtons(articleId);
                });
            }

            // 状態が変更された場合は保存
            if (cleaned) {
                this.saveFeedbackState();
            }
        } catch (error) {
            console.error('フィードバック状態クリーンアップエラー:', error);
        }
    }

    async initializeTensorFlow() {
        if (typeof tf === 'undefined') {
            console.warn('TensorFlow.js not loaded, AI機能を無効化');
            this.aiDisabled = true;
            return false;
        }

        try {
            await tf.ready();

            let backend = tf.getBackend();
            console.log('初期バックエンド:', backend);

            if (!backend || backend === 'undefined') {
                const availableBackends = ['webgl', 'cpu'];
                for (const backendName of availableBackends) {
                    try {
                        await tf.setBackend(backendName);
                        await tf.ready();
                        backend = tf.getBackend();
                        if (backend && backend !== 'undefined') {
                            console.log(`バックエンド設定成功: ${backend}`);
                            break;
                        }
                    } catch (error) {
                        console.warn(`${backendName}バックエンド設定失敗:`, error);
                    }
                }
            }

            backend = tf.getBackend();
            if (!backend || backend === 'undefined') {
                throw new Error('TensorFlow.js バックエンドの初期化に失敗しました');
            }

            console.log('TensorFlow.js初期化完了, バックエンド:', backend);

            const testTensor = tf.tensor1d([1, 2, 3]);
            const sum = testTensor.sum();
            const result = await sum.data();
            testTensor.dispose();
            sum.dispose();

            if (result[0] !== 6) {
                throw new Error('TensorFlow.js 動作テストに失敗');
            }

            console.log('TensorFlow.js 動作テスト成功');
            return true;
        } catch (error) {
            console.error('TensorFlow.js初期化エラー:', error);
            console.warn('AI機能を無効化してアプリケーションを継続します');
            this.aiDisabled = true;
            return false;
        }
    }

    setupEventListeners() {
        try {
            const refreshBtn = document.getElementById('refreshBtn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => {
                    this.refreshArticles();
                });
            }

            const categoryFilter = document.getElementById('categoryFilter');
            if (categoryFilter) {
                categoryFilter.addEventListener('change', (e) => {
                    if (this.uiController) {
                        this.uiController.filterByCategory(e.target.value);
                    }
                });
            }

            const readStatusFilter = document.getElementById('readStatusFilter');
            if (readStatusFilter) {
                readStatusFilter.addEventListener('change', (e) => {
                    if (this.uiController) {
                        this.uiController.filterByReadStatus(e.target.value);
                    }
                });
            }

            const sortFilter = document.getElementById('sortFilter');
            if (sortFilter) {
                sortFilter.addEventListener('change', (e) => {
                    if (this.uiController) {
                        this.uiController.sortArticles(e.target.value);
                    }
                });
            }

            console.log('イベントリスナー設定完了');
        } catch (error) {
            console.error('イベントリスナー設定エラー:', error);
        }
    }

    setupGlobalFunctions() {
        try {
            window.yourNewsApp = this;

            window.openArticle = (articleId) => {
                this.openArticle(articleId);
            };

            window.processFeedback = (articleId, feedback) => {
                this.processFeedback(articleId, feedback);
            };

            console.log('グローバル関数設定完了');
        } catch (error) {
            console.error('グローバル関数設定エラー:', error);
        }
    }

    async refreshArticles() {
        try {
            if (!this.uiController) {
                console.error('UIController not initialized');
                return;
            }

            const refreshBtn = document.getElementById('refreshBtn');
            if (refreshBtn) {
                refreshBtn.disabled = true;
                refreshBtn.textContent = '🔄 更新中...';
            }

            this.showNotification('記事を更新しています...', 'info', 2000);
            await this.uiController.loadAndDisplayArticles(true);
            this.showNotification('記事を更新しました', 'success', 3000);

        } catch (error) {
            console.error('記事更新エラー:', error);
            this.showNotification('記事の更新に失敗しました', 'error');
        } finally {
            const refreshBtn = document.getElementById('refreshBtn');
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.textContent = '🔄 更新';
            }
        }
    }

    // 【完全修正】フィードバック処理（状態永続化対応・NGドメイン削除）
    async processFeedback(articleId, feedback) {
        try {
            if (!articleId || feedback === undefined) {
                console.error('Invalid feedback parameters');
                return false;
            }

            // 【強化1】厳格な重複防止チェック
            if (this.processingArticles.has(articleId)) {
                console.log(`❌ フィードバック処理中のため拒否: ${articleId}`);
                return false;
            }

            // 【強化2】ボタンクールダウンチェック
            const cooldownKey = `${articleId}_cooldown`;
            if (this.buttonCooldowns.has(cooldownKey)) {
                const cooldownEnd = this.buttonCooldowns.get(cooldownKey);
                if (Date.now() < cooldownEnd) {
                    console.log(`❌ ボタンクールダウン中のため拒否: ${articleId} (残り${Math.round((cooldownEnd - Date.now()) / 1000)}秒)`);
                    return false;
                }
            }

            // 【強化3】ボタン状態の事前確認
            const card = document.querySelector(`[data-article-id="${articleId}"]`);
            if (!card) {
                console.error('記事カードが見つかりません');
                return false;
            }

            const buttons = card.querySelectorAll('.feedback-btn');
            const isAnyButtonDisabled = Array.from(buttons).some(btn => btn.disabled);
            if (isAnyButtonDisabled) {
                console.log(`❌ ボタン無効化中のため拒否: ${articleId}`);
                return false;
            }

            // 【重要】処理開始マーク（最優先設定）
            this.processingArticles.add(articleId);

            // クールダウン設定（3秒間）
            this.buttonCooldowns.set(cooldownKey, Date.now() + 3000);

            // 【追加】状態を永続化
            this.saveFeedbackState();

            // 【即座】全ボタン無効化
            this.disableFeedbackButtons(articleId);

            console.log(`🧠 フィードバック処理開始: ${articleId} -> ${feedback}`);

            // データ取得
            const articles = await this.dataManager.loadArticles();
            const articleIndex = articles.findIndex(a => a.articleId === articleId);

            if (articleIndex === -1) {
                console.error('記事が見つかりません:', articleId);
                return false;
            }

            const article = articles[articleIndex];
            const originalScore = article.interestScore || 50;

            // フィードバック履歴追加
            if (!article.feedbackHistory) {
                article.feedbackHistory = [];
            }

            article.feedbackHistory.push({
                type: feedback === 1 ? 'interest' : feedback === -1 ? 'disinterest' : 'unknown',
                timestamp: new Date().toISOString(),
                value: feedback,
                originalScore: originalScore
            });

            // AI学習実行（即座学習）
            if (this.aiEngine && !this.aiDisabled) {
                try {
                    console.log('🧠 AI学習実行中...');
                    await this.aiEngine.processFeedback(article, feedback);

                    // 新しい興味度スコア再計算
                    const newScore = await this.aiEngine.calculateInterestScore(article);
                    article.interestScore = newScore;

                    console.log(`✅ AI学習完了 - スコア変化: ${originalScore}点 → ${newScore}点`);
                } catch (aiError) {
                    console.warn('AI学習エラー:', aiError);
                }
            }

            // 状態更新
            if (feedback === -1) {
                article.readStatus = 'read';
            }

            // データ保存
            await this.dataManager.saveArticles(articles);

            // UI即座更新
            if (this.uiController) {
                this.uiController.updateArticleScore(articleId, article.interestScore);
                this.uiController.updateArticleDisplay(articleId, {
                    readStatus: article.readStatus,
                    interestScore: article.interestScore
                });
                this.uiController.updateStats();
            }

            // フィードバック完了通知
            this.showFeedbackComplete(articleId, feedback, article.interestScore);

            return true;

        } catch (error) {
            console.error('フィードバック処理エラー:', error);
            this.showNotification('フィードバックの処理に失敗しました', 'error');
            return false;
        } finally {
            // 【重要】確実なクリーンアップ（3秒後）
            setTimeout(() => {
                this.processingArticles.delete(articleId);
                this.enableFeedbackButtons(articleId);

                // クールダウンクリア
                const cooldownKey = `${articleId}_cooldown`;
                this.buttonCooldowns.delete(cooldownKey);

                // 【追加】状態を永続化
                this.saveFeedbackState();

                console.log(`🔓 フィードバック処理完了: ${articleId}`);
            }, 3000);
        }
    }

    // 【強化】ボタン無効化処理
    disableFeedbackButtons(articleId) {
        const card = document.querySelector(`[data-article-id="${articleId}"]`);
        if (card) {
            const buttons = card.querySelectorAll('.feedback-btn');
            buttons.forEach(btn => {
                btn.disabled = true;
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
                btn.style.pointerEvents = 'none'; // 完全にクリック無効化
                btn.setAttribute('data-processing', 'true'); // 処理中マーク
            });

            // 視覚的フィードバック追加
            card.style.filter = 'grayscale(0.3)';
            console.log(`🔒 ボタン無効化完了: ${articleId}`);
        }
    }

    // 【強化】ボタン再有効化処理
    enableFeedbackButtons(articleId) {
        const card = document.querySelector(`[data-article-id="${articleId}"]`);
        if (card) {
            const buttons = card.querySelectorAll('.feedback-btn');
            buttons.forEach(btn => {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                btn.style.pointerEvents = 'auto'; // クリック再有効化
                btn.removeAttribute('data-processing'); // 処理中マーク削除
            });

            // 視覚的フィードバック削除
            card.style.filter = '';
            console.log(`🔓 ボタン再有効化完了: ${articleId}`);
        }
    }

    // フィードバック完了通知
    showFeedbackComplete(articleId, feedback, score) {
        const messages = {
            1: `👍 興味ありとして学習しました (${score}点)`,
            '-1': `👎 興味なしとして学習しました (${score}点)`
        };

        this.showNotification(messages[feedback] || 'フィードバックを処理しました', 'success', 3000);
    }

    async openArticle(articleId) {
        try {
            if (!articleId) return;

            const articles = await this.dataManager.loadArticles();
            const article = articles.find(a => a.articleId === articleId);

            if (!article) {
                console.error('記事が見つかりません:', articleId);
                return;
            }

            if (article.readStatus !== 'read') {
                await this.dataManager.updateArticle(articleId, {
                    readStatus: 'read',
                    lastReadAt: new Date().toISOString()
                });

                if (this.uiController) {
                    this.uiController.updateArticleDisplay(articleId, { readStatus: 'read' });
                    this.uiController.updateStats();
                }
            }

            window.open(article.url, '_blank', 'noopener,noreferrer');
            console.log(`記事を開きました: ${article.title}`);

        } catch (error) {
            console.error('記事オープンエラー:', error);
            this.showNotification('記事を開けませんでした', 'error');
        }
    }

    async recalculateAllArticlesInterest() {
        try {
            if (!this.aiEngine || this.aiDisabled) {
                console.warn('AI機能無効のため再計算をスキップ');
                return;
            }

            this.showNotification('キーワード設定変更により全記事を再評価中...', 'info', 2000);

            const articles = await this.dataManager.loadArticles();
            console.log(`🔄 全記事興味度再計算開始: ${articles.length}件`);

            const keywords = await this.dataManager.loadData('yourNews_keywords') || { interestWords: [], ngWords: [] };
            await this.aiEngine.updateKeywordSettings(keywords);

            let updatedCount = 0;
            let ngArticleCount = 0;

            for (const article of articles) {
                try {
                    const oldScore = article.interestScore || 50;
                    const newScore = await this.aiEngine.calculateInterestScore(article);

                    article.interestScore = newScore;

                    // NGワード判定（スコア-1で非表示）
                    if (newScore === -1) {
                        article.readStatus = 'read';
                        ngArticleCount++;
                    }

                    if (Math.abs(newScore - oldScore) > 1 || newScore === -1) {
                        updatedCount++;
                    }
                } catch (error) {
                    console.warn(`記事 ${article.articleId} の再計算エラー:`, error);
                }
            }

            if (updatedCount > 0) {
                await this.dataManager.saveArticles(articles);

                if (this.uiController) {
                    await this.uiController.loadAndDisplayArticles(false);
                }

                let message = `${updatedCount}件の記事スコアを更新しました`;
                if (ngArticleCount > 0) {
                    message += `（${ngArticleCount}件をNG記事として非表示）`;
                }
                this.showNotification(message, 'success');
            } else {
                this.showNotification('記事スコアに変更はありませんでした', 'info');
            }

            console.log(`✅ 全記事再計算完了: ${updatedCount}件更新, ${ngArticleCount}件NG化`);

        } catch (error) {
            console.error('全記事再計算エラー:', error);
            this.showNotification('記事の再評価に失敗しました', 'error');
        }
    }

    async executeAIRetraining() {
        try {
            if (!this.aiEngine || this.aiDisabled) {
                this.showNotification('AI機能が利用できません', 'warning');
                return false;
            }

            this.showNotification('AI再学習を実行中...', 'info', 2000);
            await this.recalculateAllArticlesInterest();

            this.aiEngine.updateLearningStatistics();
            await this.aiEngine.saveAIData();

            this.showNotification('AI再学習が完了しました', 'success');
            return true;
        } catch (error) {
            console.error('AI再学習エラー:', error);
            this.showNotification('AI再学習に失敗しました', 'error');
            return false;
        }
    }

    showNotification(message, type = 'info', duration = 5000) {
        try {
            const notificationArea = document.getElementById('notificationArea');
            if (!notificationArea) {
                console.warn('Notification area not found');
                return;
            }

            const notification = document.createElement('div');
            notification.className = `notification ${type}`;
            notification.innerHTML = `
                <div class="notification-content">
                    <span>${message}</span>
                    <button class="notification-close">&times;</button>
                </div>
            `;

            notificationArea.appendChild(notification);

            // 閉じるボタンイベント
            const closeBtn = notification.querySelector('.notification-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    notification.remove();
                });
            }

            // 自動削除
            if (duration > 0) {
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, duration);
            }

        } catch (error) {
            console.error('通知表示エラー:', error);
        }
    }

    // エラーハンドリング
    handleError(error, context = '') {
        console.error(`Error in ${context}:`, error);
        this.showNotification(`エラーが発生しました: ${error.message}`, 'error');
    }
}

// アプリケーション初期化
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('アプリケーション開始');
        const app = new YourNewsApp();
        const initialized = await app.initialize();

        if (!initialized) {
            throw new Error('アプリケーションの初期化に失敗しました');
        }

        console.log('✅ アプリケーション初期化成功');

    } catch (error) {
        console.error('💥 アプリケーション初期化エラー:', error);
        
        // エラー表示
        const errorHtml = `
            <div style="padding: 2rem; text-align: center; color: #d32f2f; background: #ffebee; border-radius: 8px; margin: 1rem;">
                <h3>⚠️ アプリケーションエラー</h3>
                <p>アプリケーションの初期化に失敗しました</p>
                <details style="margin-top: 1rem;">
                    <summary>エラー詳細</summary>
                    <pre style="text-align: left; margin-top: 0.5rem; font-size: 0.9rem;">${error.message}</pre>
                </details>
            </div>
        `;
        
        const container = document.getElementById('articlesContainer') || document.body;
        container.innerHTML = errorHtml;
    }
});
