// YourNewsApp - メインアプリケーションクラス（プロジェクトルート対応完全版）
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
        
        // プロジェクトルートパス設定
        this.basePath = '/yn';
    }
    
    async initialize() {
        try {
            console.log('YourNewsApp初期化開始');
            
            // TensorFlow.js初期化
            await this.initializeTensorFlow();
            
            // Phase A: 基盤クラス初期化
            this.dataManager = new DataManager();
            await this.dataManager.initialize();
            
            // Phase B: RSS・UI機能初期化
            this.rssFetcher = new RSSFetcher();
            this.articleCard = new ArticleCard();
            
            // Phase C: AI機能初期化（条件付き）
            if (!this.aiDisabled && typeof AIEngine !== 'undefined') {
                this.aiEngine = new AIEngine();
                await this.aiEngine.initialize();
            }
            
            // UI Controller初期化時に依存関係を正しく注入
            this.uiController = new UIController(this.dataManager, this.rssFetcher, this.articleCard);
            await this.uiController.initialize();
            
            // イベントリスナー設定
            this.setupEventListeners();
            
            this.initialized = true;
            
            console.log('YourNewsApp初期化完了');
            return true;
            
        } catch (error) {
            console.error('YourNewsApp初期化エラー:', error);
            this.showNotification('アプリケーションの初期化に失敗しました', 'error');
            return false;
        }
    }
    
    async initializeTensorFlow() {
        if (typeof tf === 'undefined') {
            console.warn('TensorFlow.js not loaded, AI機能を無効化');
            this.aiDisabled = true;
            return false;
        }
        
        try {
            // TensorFlow.jsバックエンド初期化
            await tf.ready();
            
            // バックエンド確認と設定
            let backend = tf.getBackend();
            console.log('初期バックエンド:', backend);
            
            // バックエンドが利用できない場合のフォールバック
            if (!backend || backend === 'undefined') {
                console.warn('バックエンドが利用できません、手動設定を試行');
                
                // 利用可能なバックエンドを確認
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
            
            // 最終確認
            backend = tf.getBackend();
            if (!backend || backend === 'undefined') {
                console.error('全てのバックエンド設定に失敗');
                throw new Error('TensorFlow.js バックエンドの初期化に失敗しました');
            }
            
            console.log('TensorFlow.js初期化完了, バックエンド:', backend);
            
            // 簡単な動作テスト
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
            
            // AI機能無効化モードで継続
            console.warn('AI機能を無効化してアプリケーションを継続します');
            this.aiDisabled = true;
            
            return false;
        }
    }
    
    setupEventListeners() {
        try {
            // 更新ボタン
            const refreshBtn = document.getElementById('refreshBtn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => {
                    this.refreshArticles();
                });
            }
            
            // カテゴリフィルター
            const categoryFilter = document.getElementById('categoryFilter');
            if (categoryFilter) {
                categoryFilter.addEventListener('change', (e) => {
                    if (this.uiController) {
                        this.uiController.filterByCategory(e.target.value);
                    }
                });
            }
            
            // 既読フィルター
            const readStatusFilter = document.getElementById('readStatusFilter');
            if (readStatusFilter) {
                readStatusFilter.addEventListener('change', (e) => {
                    if (this.uiController) {
                        this.uiController.filterByReadStatus(e.target.value);
                    }
                });
            }
            
            // ソートフィルター
            const sortFilter = document.getElementById('sortFilter');
            if (sortFilter) {
                sortFilter.addEventListener('change', (e) => {
                    if (this.uiController) {
                        this.uiController.sortArticles(e.target.value);
                    }
                });
            }
            
            // AI再学習ボタン
            const aiRetrainBtn = document.getElementById('aiRetrainBtn');
            if (aiRetrainBtn) {
                aiRetrainBtn.addEventListener('click', async () => {
                    await this.performAIRetraining();
                });
            }
            
            console.log('イベントリスナー設定完了');
            
        } catch (error) {
            console.error('イベントリスナー設定エラー:', error);
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
    
    async performAIRetraining() {
        try {
            if (!this.aiEngine || this.aiDisabled) {
                this.showNotification('AI機能が利用できません', 'warning');
                return;
            }
            
            const aiRetrainBtn = document.getElementById('aiRetrainBtn');
            if (aiRetrainBtn) {
                aiRetrainBtn.disabled = true;
                aiRetrainBtn.textContent = '🔄';
            }
            
            this.showNotification('AI再学習を実行中...', 'info', 2000);
            
            // 全記事のAI再計算
            const articles = await this.dataManager.loadArticles();
            const keywords = await this.dataManager.loadData('yourNews_keywords') || 
                           { interestWords: [], ngWords: [] };
            
            for (const article of articles) {
                const newScore = await this.aiEngine.calculateInterestScore(article, keywords);
                article.interestScore = newScore;
            }
            
            await this.dataManager.saveArticles(articles);
            
            // UI更新
            if (this.uiController) {
                await this.uiController.loadAndDisplayArticles(true);
            }
            
            this.showNotification('AI再学習が完了しました', 'success');
            
        } catch (error) {
            console.error('AI再学習エラー:', error);
            this.showNotification('AI再学習に失敗しました', 'error');
        } finally {
            const aiRetrainBtn = document.getElementById('aiRetrainBtn');
            if (aiRetrainBtn) {
                aiRetrainBtn.disabled = false;
                aiRetrainBtn.textContent = '🧠';
            }
        }
    }
    
    async processFeedback(articleId, feedback) {
        try {
            if (!articleId || feedback === undefined) {
                console.error('Invalid feedback parameters');
                return;
            }
            
            console.log(`Processing feedback: ${articleId} -> ${feedback}`);
            
            // データ更新
            const articles = await this.dataManager.loadArticles();
            const articleIndex = articles.findIndex(a => a.articleId === articleId);
            
            if (articleIndex === -1) {
                console.error('Article not found:', articleId);
                return;
            }
            
            const article = articles[articleIndex];
            
            // フィードバック履歴追加
            if (!article.feedbackHistory) {
                article.feedbackHistory = [];
            }
            
            article.feedbackHistory.push({
                type: feedback === 1 ? 'interest' : feedback === -1 ? 'disinterest' : 'ng_domain',
                timestamp: new Date().toISOString(),
                value: feedback
            });
            
            // 興味なし・NGの場合は自動既読
            if (feedback === -1 || feedback === 'ng') {
                article.readStatus = 'read';
            }
            
            // NGドメインの場合は特別処理
            if (feedback === 'ng') {
                article.ngDomain = true;
                
                // 同じドメインの他の記事も非表示
                articles.forEach(a => {
                    if (a.domain === article.domain) {
                        a.ngDomain = true;
                        a.readStatus = 'read';
                    }
                });
            }
            
            // データ保存
            await this.dataManager.saveArticles(articles);
            
            // AI学習（利用可能な場合）
            if (this.aiEngine && !this.aiDisabled && feedback !== 'ng') {
                try {
                    await this.aiEngine.processFeedback(article, feedback);
                } catch (aiError) {
                    console.warn('AI学習エラー:', aiError);
                }
            }
            
            // UI更新
            if (this.uiController) {
                this.uiController.updateArticleDisplay(articleId, {
                    readStatus: article.readStatus,
                    ngDomain: article.ngDomain
                });
                
                this.uiController.updateStats();
            }
            
            // フィードバック通知
            const messages = {
                1: '👍 興味ありとして学習しました',
                '-1': '👎 興味なしとして学習しました',
                'ng': '🚫 ドメインをNGに設定しました'
            };
            
            this.showNotification(messages[feedback] || 'フィードバックを処理しました', 'success', 2000);
            
        } catch (error) {
            console.error('フィードバック処理エラー:', error);
            this.showNotification('フィードバックの処理に失敗しました', 'error');
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
                    <span class="notification-message">${message}</span>
                    <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
                </div>
            `;
            
            notificationArea.appendChild(notification);
            
            // 自動削除
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.remove();
                }
            }, duration);
            
        } catch (error) {
            console.error('通知表示エラー:', error);
        }
    }
    
    getVersion() {
        return '1.0.0';
    }
    
    getStats() {
        return {
            initialized: this.initialized,
            dataManager: !!this.dataManager,
            rssFetcher: !!this.rssFetcher,
            aiEngine: !!this.aiEngine && !this.aiDisabled,
            uiController: !!this.uiController,
            pwaManager: !!this.pwaManager,
            aiDisabled: this.aiDisabled
        };
    }
}

// PWA機能初期化クラス（プロジェクトルート対応版）
class PWAManager {
    constructor(basePath = '/yn') {
        this.deferredPrompt = null;
        this.isOnline = navigator.onLine;
        this.serviceWorker = null;
        this.basePath = basePath;
    }
    
    async initialize() {
        try {
            console.log('PWA Manager初期化開始');
            
            // Service Worker登録
            await this.registerServiceWorker();
            
            // インストールプロンプト準備
            this.setupInstallPrompt();
            
            // オンライン・オフライン監視
            this.setupNetworkMonitoring();
            
            // バックグラウンド同期設定
            this.setupBackgroundSync();
            
            // PWA状態表示
            this.updatePWAStatus();
            
            console.log('PWA Manager初期化完了');
            return true;
            
        } catch (error) {
            console.error('PWA Manager初期化エラー:', error);
            return false;
        }
    }
    
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                // プロジェクトルートに対応したパス
                const swPath = `${this.basePath}/sw.js`;
                const registration = await navigator.serviceWorker.register(swPath, {
                    scope: this.basePath + '/'
                });
                
                this.serviceWorker = registration;
                
                console.log('Service Worker登録成功:', registration.scope);
                
                // 更新チェック
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            this.showUpdateAvailable();
                        }
                    });
                });
                
                // メッセージ受信
                navigator.serviceWorker.addEventListener('message', event => {
                    this.handleServiceWorkerMessage(event.data);
                });
                
                return registration;
                
            } catch (error) {
                console.error('Service Worker登録失敗:', error);
                throw error;
            }
        } else {
            console.warn('Service Worker not supported');
            return null;
        }
    }
    
    setupInstallPrompt() {
        // PWAインストールプロンプト
        window.addEventListener('beforeinstallprompt', (e) => {
            console.log('PWAインストールプロンプト準備');
            e.preventDefault();
            this.deferredPrompt = e;
            this.showInstallPrompt();
        });
        
        // インストール完了検出
        window.addEventListener('appinstalled', () => {
            console.log('PWAインストール完了');
            this.hideInstallPrompt();
            this.deferredPrompt = null;
            
            if (window.yourNewsApp && window.yourNewsApp.showNotification) {
                window.yourNewsApp.showNotification(
                    'アプリがインストールされました！オフラインでも利用できます。',
                    'success',
                    5000
                );
            }
        });
    }
    
    setupNetworkMonitoring() {
        // オンライン状態監視
        window.addEventListener('online', () => {
            console.log('オンライン状態検出');
            this.isOnline = true;
            this.updateNetworkStatus(true);
            this.syncWhenOnline();
        });
        
        window.addEventListener('offline', () => {
            console.log('オフライン状態検出');
            this.isOnline = false;
            this.updateNetworkStatus(false);
        });
    }
    
    setupBackgroundSync() {
        if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
            // バックグラウンド同期登録
            navigator.serviceWorker.ready.then(registration => {
                // RSS自動更新同期
                const settings = JSON.parse(localStorage.getItem('yourNews_settings') || '{}');
                if (settings.rss && settings.rss.autoRefresh) {
                    registration.sync.register('background-rss-fetch');
                    console.log('バックグラウンドRSS同期登録完了');
                }
                
                // AI学習同期
                registration.sync.register('background-ai-learning');
                console.log('バックグラウンドAI学習同期登録完了');
            });
        }
    }
    
    showInstallPrompt() {
        // PWAインストールボタンを表示
        const installBtn = document.createElement('button');
        installBtn.id = 'pwa-install-btn';
        installBtn.className = 'fab-btn install-btn';
        installBtn.innerHTML = '📱';
        installBtn.title = 'アプリをインストール';
        installBtn.style.cssText = `
            position: fixed;
            bottom: 160px;
            right: 20px;
            background: #4CAF50;
            z-index: 1000;
            width: 56px;
            height: 56px;
            border-radius: 50%;
            border: none;
            color: white;
            font-size: 1.5rem;
            cursor: pointer;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        installBtn.addEventListener('click', () => {
            this.triggerInstall();
        });
        
        installBtn.addEventListener('mouseenter', () => {
            installBtn.style.transform = 'scale(1.1)';
        });
        
        installBtn.addEventListener('mouseleave', () => {
            installBtn.style.transform = 'scale(1)';
        });
        
        document.body.appendChild(installBtn);
        
        // 30秒後に自動で非表示
        setTimeout(() => {
            this.hideInstallPrompt();
        }, 30000);
    }
    
    hideInstallPrompt() {
        const installBtn = document.getElementById('pwa-install-btn');
        if (installBtn) {
            installBtn.remove();
        }
    }
    
    async triggerInstall() {
        if (!this.deferredPrompt) return false;
        
        try {
            this.deferredPrompt.prompt();
            const { outcome } = await this.deferredPrompt.userChoice;
            
            console.log('インストールプロンプト結果:', outcome);
            
            if (outcome === 'accepted') {
                console.log('ユーザーがPWAインストールを承認');
            }
            
            this.deferredPrompt = null;
            this.hideInstallPrompt();
            
            return outcome === 'accepted';
            
        } catch (error) {
            console.error('インストールプロンプトエラー:', error);
            return false;
        }
    }
    
    updateNetworkStatus(online) {
        // ネットワーク状態表示
        let statusIndicator = document.getElementById('network-status');
        if (!statusIndicator) {
            statusIndicator = document.createElement('div');
            statusIndicator.id = 'network-status';
            statusIndicator.className = 'network-status';
            statusIndicator.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                padding: 0.5rem 1rem;
                border-radius: 20px;
                font-size: 0.9rem;
                z-index: 1001;
                transition: opacity 0.3s ease;
                color: white;
            `;
            document.body.appendChild(statusIndicator);
        }
        
        statusIndicator.style.background = online ? 'rgba(76,175,80,0.9)' : 'rgba(244,67,54,0.9)';
        statusIndicator.textContent = online ? '🌐 オンライン復帰' : '📴 オフライン';
        statusIndicator.style.opacity = '1';
        
        // 5秒後に非表示
        setTimeout(() => {
            if (statusIndicator) {
                statusIndicator.style.opacity = '0';
                setTimeout(() => {
                    if (statusIndicator.parentElement) {
                        statusIndicator.remove();
                    }
                }, 300);
            }
        }, 5000);
    }
    
    async syncWhenOnline() {
        if (!this.isOnline) return;
        
        try {
            console.log('オンライン復帰時の同期開始');
            
            // Service Workerに同期指示
            if (this.serviceWorker && this.serviceWorker.sync) {
                await this.serviceWorker.sync.register('background-rss-fetch');
                await this.serviceWorker.sync.register('background-ai-learning');
            }
            
            // RSS強制更新
            if (window.yourNewsApp && window.yourNewsApp.uiController) {
                window.yourNewsApp.uiController.loadAndDisplayArticles(true);
            }
            
        } catch (error) {
            console.error('オンライン同期エラー:', error);
        }
    }
    
    updatePWAStatus() {
        // PWA状態を表示エリアに反映
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                            window.navigator.standalone ||
                            document.referrer.includes('android-app://');
        
        if (isStandalone) {
            console.log('PWAスタンドアロンモードで動作中');
            document.body.classList.add('pwa-standalone');
        } else {
            console.log('ブラウザモードで動作中');
            document.body.classList.add('pwa-browser');
        }
    }
    
    showUpdateAvailable() {
        if (window.yourNewsApp && window.yourNewsApp.showNotification) {
            window.yourNewsApp.showNotification(
                'アプリの新しいバージョンが利用可能です。ページを再読み込みしてください。',
                'info',
                10000
            );
        }
    }
    
    handleServiceWorkerMessage(data) {
        console.log('Service Workerメッセージ受信:', data);
        
        switch (data.type) {
            case 'BACKGROUND_RSS_UPDATE':
                this.handleBackgroundRSSUpdate(data);
                break;
                
            case 'BACKGROUND_AI_UPDATE':
                this.handleBackgroundAIUpdate(data);
                break;
                
            case 'NETWORK_STATUS_CHANGE':
                this.updateNetworkStatus(data.online);
                break;
        }
    }
    
    handleBackgroundRSSUpdate(data) {
        if (window.yourNewsApp && window.yourNewsApp.showNotification) {
            const message = `バックグラウンドでRSSを更新（${data.successCount}/${data.totalCount}件成功）`;
            window.yourNewsApp.showNotification(message, 'info', 3000);
        }
        
        // UI更新
        if (window.yourNewsApp && window.yourNewsApp.uiController) {
            window.yourNewsApp.uiController.loadAndDisplayArticles(true);
        }
    }
    
    handleBackgroundAIUpdate(data) {
        if (window.yourNewsApp && window.yourNewsApp.showNotification) {
            const message = `AIが${data.processedCount}件のフィードバックを学習しました`;
            window.yourNewsApp.showNotification(message, 'success', 2000);
        }
    }
}

// PWAManagerクラスをグローバルに公開
window.PWAManager = PWAManager;

// アプリケーション初期化処理
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('DOM読み込み完了');
        
        // メインアプリケーション初期化
        window.yourNewsApp = new YourNewsApp();
        const initSuccess = await window.yourNewsApp.initialize();
        
        if (initSuccess) {
            // PWA機能初期化（プロジェクトルートパス指定）
            window.yourNewsApp.pwaManager = new PWAManager('/yn');
            await window.yourNewsApp.pwaManager.initialize();
            
            console.log('アプリケーション初期化完了');
        } else {
            console.error('アプリケーション初期化失敗');
        }
        
    } catch (error) {
        console.error('初期化処理エラー:', error);
        
        // エラー時のフォールバック表示
        const errorDiv = document.createElement('div');
        errorDiv.innerHTML = `
            <div style="
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                padding: 2rem;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                text-align: center;
                z-index: 10000;
                max-width: 400px;
                width: 90%;
            ">
                <h3 style="color: #f44336; margin: 0 0 1rem 0;">初期化エラー</h3>
                <p style="margin: 0 0 1rem 0;">アプリケーションの初期化に失敗しました</p>
                <p style="margin: 0 0 1rem 0; font-size: 0.9rem; color: #666;">
                    ${error.message}
                </p>
                <button onclick="location.reload()" style="
                    background: #2196F3;
                    color: white;
                    border: none;
                    padding: 0.5rem 1rem;
                    border-radius: 4px;
                    cursor: pointer;
                ">再読み込み</button>
            </div>
        `;
        document.body.appendChild(errorDiv);
    }
});

// グローバルエラーハンドリング
window.addEventListener('error', (event) => {
    console.error('Global Error:', event.error);
    if (window.yourNewsApp && window.yourNewsApp.showNotification) {
        window.yourNewsApp.showNotification('予期しないエラーが発生しました', 'error');
    }
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled Promise Rejection:', event.reason);
    event.preventDefault();
});

// グローバルデバッグ関数
window.debugApp = function() {
    console.log('=== アプリケーションデバッグ情報 ===');
    
    if (window.yourNewsApp) {
        console.log('YourNewsApp stats:', window.yourNewsApp.getStats());
        console.log('Version:', window.yourNewsApp.getVersion());
    } else {
        console.error('YourNewsApp not initialized');
    }
    
    console.log('TensorFlow.js available:', typeof tf !== 'undefined');
    console.log('Local storage available:', typeof Storage !== 'undefined');
    console.log('Service Worker supported:', 'serviceWorker' in navigator);
    console.log('Project base path:', window.yourNewsApp?.basePath || '/yn');
    
    console.log('=== デバッグ情報完了 ===');
};

// エラー復旧用関数
window.reinitializeApp = async function() {
    try {
        console.log('アプリケーション再初期化開始');
        
        if (window.yourNewsApp) {
            window.yourNewsApp = null;
        }
        
        window.yourNewsApp = new YourNewsApp();
        const initSuccess = await window.yourNewsApp.initialize();
        
        if (initSuccess) {
            window.yourNewsApp.pwaManager = new PWAManager('/yn');
            await window.yourNewsApp.pwaManager.initialize();
            
            console.log('再初期化完了');
            return true;
        } else {
            console.error('再初期化失敗');
            return false;
        }
        
    } catch (error) {
        console.error('再初期化エラー:', error);
        return false;
    }
};
