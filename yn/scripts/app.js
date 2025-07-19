// アプリケーション初期化・ルーティング（Phase A+B統合版）
class YourNewsApp {
    constructor() {
        this.currentPage = 'index';
        this.isInitialized = false;
        
        // Phase B統合: 追加コンポーネント
        this.dataManager = null;
        this.rssFetcher = null;
        this.articleCard = null;
        this.uiController = null;
        
        // イベントリスナーバインディング
        this.handleNavigation = this.handleNavigation.bind(this);
        this.handleRefresh = this.handleRefresh.bind(this);
        this.handleAddRss = this.handleAddRss.bind(this);
    }
    
    async initialize() {
        try {
            console.log('YourNewsApp初期化開始');
            
            // TensorFlow.js初期化確認
            await this.initializeTensorFlow();
            
            // データマネージャー初期化
            if (typeof DataManager === 'undefined') {
                throw new Error('DataManager not loaded');
            }
            
            this.dataManager = new DataManager();
            await this.dataManager.initialize();
            
            // イベントリスナー設定
            this.setupEventListeners();
            
            // 初期画面表示
            await this.loadMainPage();
            
            this.isInitialized = true;
            console.log('YourNewsApp初期化完了');
            
            this.showNotification('アプリケーションが正常に初期化されました', 'success');
            
        } catch (error) {
            console.error('初期化エラー:', error);
            this.showNotification('アプリケーションの初期化に失敗しました: ' + error.message, 'error');
        }
    }
    
    async initializeTensorFlow() {
        if (typeof tf === 'undefined') {
            throw new Error('TensorFlow.js not loaded');
        }
        
        // TensorFlow.jsバックエンド初期化
        await tf.ready();
        console.log('TensorFlow.js初期化完了, バックエンド:', tf.getBackend());
        
        return true;
    }
    
    setupEventListeners() {
        // ナビゲーションボタン
        const navButtons = document.querySelectorAll('.nav-btn');
        navButtons.forEach(btn => {
            btn.addEventListener('click', this.handleNavigation);
        });
        
        // 更新ボタン
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', this.handleRefresh);
        }
        
        // RSS追加FAB
        const addRssFab = document.getElementById('addRssFab');
        if (addRssFab) {
            addRssFab.addEventListener('click', this.handleAddRss);
        }
        
        // フィルター変更
        const filters = ['categoryFilter', 'readStatusFilter', 'sortFilter'];
        filters.forEach(filterId => {
            const filter = document.getElementById(filterId);
            if (filter) {
                filter.addEventListener('change', () => {
                    if (this.uiController) {
                        this.uiController.applyFilters();
                    }
                });
            }
        });
        
        console.log('イベントリスナー設定完了');
    }
    
    async handleNavigation(event) {
        const targetPage = event.target.dataset.page;
        if (!targetPage || targetPage === this.currentPage) return;
        
        try {
            // アクティブ状態更新
            document.querySelectorAll('.nav-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            event.target.classList.add('active');
            
            this.currentPage = targetPage;
            
            switch (targetPage) {
                case 'index':
                    await this.loadMainPage();
                    break;
                case 'rss-manager':
                    this.showNotification('RSS管理ページはPhase Cで実装予定です', 'info');
                    break;
                case 'favorites':
                    this.showNotification('お気に入りページはPhase Cで実装予定です', 'info');
                    break;
                case 'settings':
                    this.showNotification('設定ページはPhase Cで実装予定です', 'info');
                    break;
                default:
                    console.warn('未知のページ:', targetPage);
            }
            
        } catch (error) {
            console.error('ナビゲーションエラー:', error);
            this.showNotification('ページ切り替えに失敗しました', 'error');
        }
    }
    
    async handleRefresh() {
        try {
            const refreshBtn = document.getElementById('refreshBtn');
            if (refreshBtn) {
                refreshBtn.disabled = true;
                refreshBtn.textContent = '🔄 更新中...';
            }
            
            // Phase B統合: UIControllerの更新処理を呼び出し
            if (this.uiController) {
                await this.uiController.refreshArticles();
                this.showNotification('記事を更新しました', 'success');
            } else {
                this.showNotification('記事更新機能は初期化中です', 'info');
            }
            
        } catch (error) {
            console.error('更新エラー:', error);
            this.showNotification('更新に失敗しました', 'error');
        } finally {
            const refreshBtn = document.getElementById('refreshBtn');
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.textContent = '🔄 更新';
            }
        }
    }
    
    handleAddRss() {
        this.showNotification('RSS追加機能はPhase Cで実装予定です', 'info');
    }
    
    async loadMainPage() {
        try {
            // Phase B統合: UIControllerの初期化と統合
            if (!this.uiController) {
                // 必要なクラスの確認
                if (typeof RSSFetcher === 'undefined') {
                    throw new Error('RSSFetcher not loaded');
                }
                if (typeof ArticleCard === 'undefined') {
                    throw new Error('ArticleCard not loaded');
                }
                if (typeof UIController === 'undefined') {
                    throw new Error('UIController not loaded');
                }
                
                // インスタンス作成
                this.rssFetcher = new RSSFetcher();
                this.articleCard = new ArticleCard();
                this.uiController = new UIController(this.dataManager, this.rssFetcher, this.articleCard);
                
                // UIController初期化
                await this.uiController.initialize();
                
                console.log('UIController初期化完了');
            }
            
            console.log('メインページ読み込み完了（Phase B版）');
            
        } catch (error) {
            console.error('メインページ読み込みエラー:', error);
            this.showNotification('画面の初期化に失敗しました: ' + error.message, 'error');
            
            // フォールバック: Phase A版の基本表示
            await this.loadMainPageFallback();
        }
    }
    
    // Phase A版フォールバック処理
    async loadMainPageFallback() {
        try {
            const articlesContainer = document.getElementById('articlesContainer');
            const loadingMessage = document.getElementById('loadingMessage');
            const noArticlesMessage = document.getElementById('noArticlesMessage');
            
            if (!articlesContainer) {
                throw new Error('Articles container not found');
            }
            
            // ローディング表示
            if (loadingMessage) loadingMessage.style.display = 'block';
            if (noArticlesMessage) noArticlesMessage.style.display = 'none';
            
            // データ読み込み（Phase Aでは基本構造のみ）
            const articles = await this.dataManager.loadArticles();
            
            // フィルター適用（Phase Aでは基本実装）
            this.updateCategoryFilter();
            
            // 記事表示（Phase Bで詳細実装済みだが、フォールバック時）
            setTimeout(() => {
                if (loadingMessage) loadingMessage.style.display = 'none';
                if (articles.length === 0) {
                    if (noArticlesMessage) noArticlesMessage.style.display = 'block';
                } else {
                    this.renderArticlesFallback(articles);
                }
            }, 1000);
            
        } catch (error) {
            console.error('フォールバックページ読み込みエラー:', error);
            this.showNotification('記事の読み込みに失敗しました', 'error');
        }
    }
    
    updateCategoryFilter() {
        const categoryFilter = document.getElementById('categoryFilter');
        if (!categoryFilter) return;
        
        // Phase Aでは基本カテゴリのみ
        const categories = this.dataManager.getCategories();
        
        // 既存オプションをクリア（最初のオプション以外）
        while (categoryFilter.children.length > 1) {
            categoryFilter.removeChild(categoryFilter.lastChild);
        }
        
        // カテゴリオプション追加
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categoryFilter.appendChild(option);
        });
    }
    
    renderArticlesFallback(articles) {
        // Phase Aフォールバック表示
        const articlesContainer = document.getElementById('articlesContainer');
        if (!articlesContainer) return;
        
        // 一時的なプレースホルダー表示
        articlesContainer.innerHTML = `
            <div class="placeholder-message">
                ${articles.length}件の記事があります<br>
                Phase B統合機能を初期化中です...
            </div>
        `;
    }
    
    // Phase B統合: フィードバック処理の統合
    async processFeedback(articleId, feedback) {
        try {
            if (this.uiController) {
                await this.uiController.processFeedback(articleId, feedback);
                console.log(`フィードバック処理完了: ${articleId}, feedback: ${feedback}`);
            } else {
                console.warn('UIController not initialized, storing feedback for later processing');
                // フィードバックをキューに保存（Phase Cで詳細実装）
                this.queueFeedback(articleId, feedback);
            }
        } catch (error) {
            console.error('フィードバック処理エラー:', error);
            this.showNotification('フィードバック処理に失敗しました', 'error');
        }
    }
    
    // フィードバックキューイング（Phase C実装予定）
    queueFeedback(articleId, feedback) {
        const queuedFeedback = JSON.parse(localStorage.getItem('yourNews_queuedFeedback') || '[]');
        queuedFeedback.push({
            articleId: articleId,
            feedback: feedback,
            timestamp: new Date().toISOString()
        });
        localStorage.setItem('yourNews_queuedFeedback', JSON.stringify(queuedFeedback));
        
        console.log('フィードバックをキューに追加:', { articleId, feedback });
    }
    
    // キューイングされたフィードバックの処理（Phase C実装予定）
    async processQueuedFeedback() {
        const queuedFeedback = JSON.parse(localStorage.getItem('yourNews_queuedFeedback') || '[]');
        
        if (queuedFeedback.length > 0 && this.uiController) {
            console.log(`キューイングされたフィードバック ${queuedFeedback.length}件を処理中...`);
            
            for (const feedback of queuedFeedback) {
                try {
                    await this.uiController.processFeedback(feedback.articleId, feedback.feedback);
                } catch (error) {
                    console.error('キューイングフィードバック処理エラー:', error);
                }
            }
            
            // キュークリア
            localStorage.removeItem('yourNews_queuedFeedback');
            console.log('キューイングフィードバック処理完了');
        }
    }
    
    // 通知表示
    showNotification(message, type = 'info', duration = 5000) {
        const notificationArea = document.getElementById('notificationArea');
        if (!notificationArea) return;
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            ${message}
            <button onclick="this.parentElement.remove()" style="float: right; background: none; border: none; color: white; cursor: pointer; font-size: 1.2em; margin-left: 10px;">×</button>
        `;
        
        notificationArea.appendChild(notification);
        
        // 自動削除
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, duration);
    }
    
    // 公開メソッド（デバッグ・外部連携用）
    getComponents() {
        return {
            dataManager: this.dataManager,
            rssFetcher: this.rssFetcher,
            articleCard: this.articleCard,
            uiController: this.uiController
        };
    }
    
    getStatus() {
        return {
            initialized: this.isInitialized,
            currentPage: this.currentPage,
            componentsReady: {
                dataManager: !!this.dataManager,
                rssFetcher: !!this.rssFetcher,
                articleCard: !!this.articleCard,
                uiController: !!this.uiController
            }
        };
    }
    
    // 強制リセット（デバッグ用）
    async forceReset() {
        try {
            console.log('アプリケーション強制リセット開始...');
            
            // 全データクリア
            if (this.dataManager) {
                this.dataManager.clearAllData();
            }
            
            // コンポーネントリセット
            this.dataManager = null;
            this.rssFetcher = null;
            this.articleCard = null;
            this.uiController = null;
            this.isInitialized = false;
            
            // 再初期化
            await this.initialize();
            
            this.showNotification('アプリケーションをリセットしました', 'success');
            
        } catch (error) {
            console.error('強制リセットエラー:', error);
            this.showNotification('リセットに失敗しました: ' + error.message, 'error');
        }
    }
}

// アプリケーション開始
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM読み込み完了');
    
    try {
        window.yourNewsApp = new YourNewsApp();
        await window.yourNewsApp.initialize();
        
        // Phase B統合: キューイングされたフィードバック処理
        await window.yourNewsApp.processQueuedFeedback();
        
    } catch (error) {
        console.error('アプリケーション開始エラー:', error);
        document.body.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #f44336;">
                <h2>アプリケーションエラー</h2>
                <p>アプリケーションの初期化に失敗しました。</p>
                <p>詳細: ${error.message}</p>
                <button onclick="location.reload()">再読み込み</button>
            </div>
        `;
    }
});

// Phase A+B完了確認用統合デバッグ関数
window.debugIntegratedApp = function() {
    console.log('=== Phase A+B Integrated App Debug ===');
    
    // アプリインスタンス確認
    if (window.yourNewsApp) {
        console.log('YourNewsApp status:', window.yourNewsApp.getStatus());
        console.log('Components:', window.yourNewsApp.getComponents());
        
        // 各コンポーネントの動作確認
        const components = window.yourNewsApp.getComponents();
        
        if (components.dataManager) {
            console.log('DataManager stats:', components.dataManager.getStorageStats());
        }
        
        if (components.rssFetcher) {
            console.log('RSSFetcher stats:', components.rssFetcher.getStats());
        }
        
        if (components.uiController) {
            console.log('UIController display stats:', components.uiController.getDisplayStats());
        }
        
    } else {
        console.error('YourNewsApp instance not found');
    }
    
    console.log('=== Integrated App Debug Complete ===');
};

// グローバルアクセス用のユーティリティ関数
window.appUtils = {
    // 記事数統計
    getArticleStats: () => {
        const app = window.yourNewsApp;
        if (app && app.uiController) {
            return app.uiController.getDisplayStats();
        }
        return null;
    },
    
    // 手動更新トリガー
    refreshArticles: async () => {
        const app = window.yourNewsApp;
        if (app && app.uiController) {
            await app.uiController.refreshArticles();
        }
    },
    
    // フィルターリセット
    resetFilters: () => {
        const app = window.yourNewsApp;
        if (app && app.uiController) {
            app.uiController.resetFilters();
        }
    },
    
    // 強制リセット
    forceReset: async () => {
        const app = window.yourNewsApp;
        if (app) {
            await app.forceReset();
        }
    }
};
