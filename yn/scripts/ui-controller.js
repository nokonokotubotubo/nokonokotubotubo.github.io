// UI操作・イベント管理（仕様書準拠）
class UIController {
    constructor(dataManager, rssFetcher, articleCard) {
        this.dataManager = dataManager;
        this.rssFetcher = rssFetcher;
        this.articleCard = articleCard;
        
        // 表示状態管理
        this.currentFilter = {
            category: 'all',
            readStatus: 'all',
            sort: 'interest'
        };
        
        this.displayedArticles = [];
        this.isRefreshing = false;
        
        // 仮想スクロール設定（仕様書パフォーマンス最適化）
        this.virtualScroll = {
            itemHeight: 280,
            visibleItems: 0,
            scrollTop: 0,
            totalHeight: 0
        };
        
        // 検索・フィルタリング
        this.searchQuery = '';
        this.filteredArticles = [];
        
        // イベントリスナーバインディング
        this.handleScroll = this.throttle(this.handleScroll.bind(this), 100);
        this.handleResize = this.debounce(this.handleResize.bind(this), 250);
    }
    
    async initialize() {
        try {
            console.log('UIController初期化開始');
            
            // フィルターイベント設定
            this.setupFilterListeners();
            
            // スクロールイベント設定
            this.setupScrollListeners();
            
            // リサイズイベント設定
            this.setupResizeListeners();
            
            // 検索機能設定
            this.setupSearchFunctionality();
            
            // 仮想スクロール初期化
            this.initializeVirtualScroll();
            
            // 初期表示
            await this.loadAndDisplayArticles();
            
            console.log('UIController初期化完了');
            
        } catch (error) {
            console.error('UIController初期化エラー:', error);
            throw error;
        }
    }
    
    setupFilterListeners() {
        // カテゴリフィルター
        const categoryFilter = document.getElementById('categoryFilter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', (e) => {
                this.currentFilter.category = e.target.value;
                this.applyFilters();
            });
        }
        
        // 既読状態フィルター
        const readStatusFilter = document.getElementById('readStatusFilter');
        if (readStatusFilter) {
            readStatusFilter.addEventListener('change', (e) => {
                this.currentFilter.readStatus = e.target.value;
                this.applyFilters();
            });
        }
        
        // ソートフィルター
        const sortFilter = document.getElementById('sortFilter');
        if (sortFilter) {
            sortFilter.addEventListener('change', (e) => {
                this.currentFilter.sort = e.target.value;
                this.applySorting();
                this.renderArticles();
            });
        }
    }
    
    setupScrollListeners() {
        const articlesContainer = document.getElementById('articlesContainer');
        if (articlesContainer) {
            // スクロール最適化（仕様書パフォーマンス要件）
            articlesContainer.addEventListener('scroll', this.handleScroll);
            
            // 無限スクロール（Phase Cで詳細実装予定）
            articlesContainer.addEventListener('scroll', () => {
                const { scrollTop, scrollHeight, clientHeight } = articlesContainer;
                
                if (scrollTop + clientHeight >= scrollHeight - 200) {
                    this.loadMoreArticles();
                }
            });
        }
    }
    
    setupResizeListeners() {
        window.addEventListener('resize', this.handleResize);
    }
    
    setupSearchFunctionality() {
        // 検索ボックス作成（Phase Bで基本実装）
        this.createSearchBox();
        
        // 検索イベント
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'f') {
                e.preventDefault();
                this.focusSearch();
            }
        });
    }
    
    createSearchBox() {
        const filterContainer = document.querySelector('.filter-container');
        if (!filterContainer) return;
        
        // 検索ボックスが既に存在する場合はスキップ
        if (document.getElementById('searchBox')) return;
        
        const searchBox = document.createElement('input');
        searchBox.type = 'text';
        searchBox.id = 'searchBox';
        searchBox.className = 'search-box';
        searchBox.placeholder = '記事を検索...';
        
        searchBox.addEventListener('input', this.debounce((e) => {
            this.searchQuery = e.target.value.trim();
            this.applyFilters();
        }, 300));
        
        filterContainer.appendChild(searchBox);
    }
    
    initializeVirtualScroll() {
        const articlesContainer = document.getElementById('articlesContainer');
        if (!articlesContainer) return;
        
        // 可視アイテム数計算
        const containerHeight = articlesContainer.clientHeight || window.innerHeight - 200;
        this.virtualScroll.visibleItems = Math.ceil(containerHeight / this.virtualScroll.itemHeight) + 5;
        
        console.log('仮想スクロール初期化:', this.virtualScroll);
    }
    
    async loadAndDisplayArticles(forceRefresh = false) {
        try {
            this.showLoadingState();
            
            let articles = [];
            
            if (forceRefresh || this.displayedArticles.length === 0) {
                // RSSフィードから取得
                const rssFeeds = await this.dataManager.loadRssFeeds();
                
                if (rssFeeds.length > 0) {
                    const result = await this.rssFetcher.fetchAllRSSFeeds(rssFeeds);
                    
                    if (result.success) {
                        // 記事保存
                        await this.dataManager.saveArticles(result.articles);
                        articles = result.articles;
                        
                        // 取得結果通知
                        if (window.yourNewsApp && window.yourNewsApp.showNotification) {
                            window.yourNewsApp.showNotification(
                                `${result.articles.length}件の記事を取得しました（成功: ${result.successCount}/${result.totalFeeds}フィード）`,
                                'success'
                            );
                        }
                        
                        // エラーがある場合は警告
                        if (result.failedCount > 0) {
                            this.showRSSErrors(result.errors);
                        }
                    } else {
                        // RSS取得失敗時はローカルデータを使用
                        articles = await this.dataManager.loadArticles();
                        
                        if (window.yourNewsApp && window.yourNewsApp.showNotification) {
                            window.yourNewsApp.showNotification(
                                'RSS取得に失敗しました。ローカルデータを表示します',
                                'warning'
                            );
                        }
                    }
                } else {
                    // RSSフィードが設定されていない場合
                    if (window.yourNewsApp && window.yourNewsApp.showNotification) {
                        window.yourNewsApp.showNotification(
                            'RSSフィードが設定されていません。RSS管理から追加してください',
                            'info'
                        );
                    }
                }
            } else {
                // キャッシュされた記事を使用
                articles = await this.dataManager.loadArticles();
            }
            
            this.displayedArticles = articles;
            this.updateCategoryOptions();
            this.applyFilters();
            
            this.hideLoadingState();
            
        } catch (error) {
            console.error('記事読み込みエラー:', error);
            this.hideLoadingState();
            
            if (window.yourNewsApp && window.yourNewsApp.showNotification) {
                window.yourNewsApp.showNotification(
                    '記事の読み込みに失敗しました: ' + error.message,
                    'error'
                );
            }
            
            // エラー時は既存データを表示
            const existingArticles = await this.dataManager.loadArticles();
            if (existingArticles.length > 0) {
                this.displayedArticles = existingArticles;
                this.applyFilters();
            }
        }
    }
    
    applyFilters() {
        let filtered = [...this.displayedArticles];
        
        // カテゴリフィルター
        if (this.currentFilter.category !== 'all') {
            filtered = filtered.filter(article => 
                article.category === this.currentFilter.category
            );
        }
        
        // 既読状態フィルター
        if (this.currentFilter.readStatus !== 'all') {
            filtered = filtered.filter(article => {
                if (this.currentFilter.readStatus === 'unread') {
                    return article.readStatus !== 'read';
                } else if (this.currentFilter.readStatus === 'read') {
                    return article.readStatus === 'read';
                }
                return true;
            });
        }
        
        // 検索フィルター
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(article => 
                article.title.toLowerCase().includes(query) ||
                article.excerpt.toLowerCase().includes(query) ||
                article.domain.toLowerCase().includes(query)
            );
        }
        
        this.filteredArticles = filtered;
        this.applySorting();
        this.renderArticles();
        
        // フィルター結果統計表示
        this.updateFilterStats();
    }
    
    applySorting() {
        const sortMethod = this.currentFilter.sort;
        
        this.filteredArticles.sort((a, b) => {
            switch (sortMethod) {
                case 'interest':
                    return (b.interestScore || 50) - (a.interestScore || 50);
                
                case 'date':
                    return new Date(b.publishDate) - new Date(a.publishDate);
                
                case 'domain':
                    return a.domain.localeCompare(b.domain);
                
                default:
                    return 0;
            }
        });
    }
    
    renderArticles() {
        const articlesContainer = document.getElementById('articlesContainer');
        if (!articlesContainer) return;
        
        // ローディング・エラーメッセージ非表示
        this.hideLoadingState();
        
        if (this.filteredArticles.length === 0) {
            this.showNoArticlesMessage();
            return;
        }
        
        try {
            // 既存のカードをクリア
            const existingCards = articlesContainer.querySelectorAll('.article-card');
            existingCards.forEach(card => card.remove());
            
            // 仮想スクロール実装（Phase Bでは簡易版）
            const visibleArticles = this.getVisibleArticles();
            
            // カード作成・表示
            const { fragment } = this.articleCard.createMultipleCards(visibleArticles);
            articlesContainer.appendChild(fragment);
            
            // 統計更新
            this.updateArticleStats();
            
            console.log(`${visibleArticles.length}件の記事を表示`);
            
        } catch (error) {
            console.error('記事表示エラー:', error);
            this.showErrorMessage('記事の表示中にエラーが発生しました');
        }
    }
    
    getVisibleArticles() {
        // Phase Bでは全記事表示（Phase Cで仮想スクロール最適化）
        const maxDisplay = 50; // パフォーマンス考慮
        return this.filteredArticles.slice(0, maxDisplay);
    }
    
    updateCategoryOptions() {
        const categoryFilter = document.getElementById('categoryFilter');
        if (!categoryFilter) return;
        
        // 既存カテゴリを保持して新しいカテゴリを追加
        const currentValue = categoryFilter.value;
        const existingOptions = new Set(
            Array.from(categoryFilter.options).map(opt => opt.value)
        );
        
        // 記事からカテゴリ抽出
        const categories = [...new Set(
            this.displayedArticles.map(article => article.category).filter(Boolean)
        )];
        
        categories.forEach(category => {
            if (!existingOptions.has(category)) {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category;
                categoryFilter.appendChild(option);
            }
        });
        
        // 元の選択値を復元
        categoryFilter.value = currentValue;
    }
    
    updateFilterStats() {
        // フィルター統計情報を表示（Phase Bでは基本実装）
        const stats = {
            total: this.displayedArticles.length,
            filtered: this.filteredArticles.length,
            unread: this.filteredArticles.filter(a => a.readStatus !== 'read').length,
            favorites: this.filteredArticles.filter(a => a.favorited).length
        };
        
        // デバッグ用統計出力
        console.log('記事統計:', stats);
        
        // UI表示（将来的に統計表示エリアに表示）
        document.title = `あなたのニュース (${stats.unread}未読/${stats.total}総数)`;
    }
    
    updateArticleStats() {
        const articlesContainer = document.getElementById('articlesContainer');
        if (!articlesContainer) return;
        
        const displayedCount = articlesContainer.querySelectorAll('.article-card').length;
        const totalCount = this.filteredArticles.length;
        
        // 表示件数情報（Phase Cで詳細UI実装予定）
        if (totalCount > displayedCount) {
            this.showLoadMoreIndicator(displayedCount, totalCount);
        }
    }
    
    // UI状態管理
    showLoadingState() {
        const loadingMessage = document.getElementById('loadingMessage');
        const noArticlesMessage = document.getElementById('noArticlesMessage');
        
        if (loadingMessage) loadingMessage.style.display = 'block';
        if (noArticlesMessage) noArticlesMessage.style.display = 'none';
    }
    
    hideLoadingState() {
        const loadingMessage = document.getElementById('loadingMessage');
        if (loadingMessage) loadingMessage.style.display = 'none';
    }
    
    showNoArticlesMessage() {
        const noArticlesMessage = document.getElementById('noArticlesMessage');
        if (noArticlesMessage) {
            noArticlesMessage.style.display = 'block';
            
            // 状況に応じたメッセージ
            let message = '記事がありません。';
            if (this.searchQuery) {
                message = `「${this.searchQuery}」に一致する記事が見つかりません。`;
            } else if (this.currentFilter.category !== 'all' || this.currentFilter.readStatus !== 'all') {
                message = 'フィルター条件に一致する記事がありません。';
            } else if (this.displayedArticles.length === 0) {
                message = 'RSSフィードを追加してニュースを取得してください。';
            }
            
            noArticlesMessage.textContent = message;
        }
    }
    
    showErrorMessage(message) {
        const articlesContainer = document.getElementById('articlesContainer');
        if (!articlesContainer) return;
        
        articlesContainer.innerHTML = `
            <div class="error-message">
                <h3>エラーが発生しました</h3>
                <p>${message}</p>
                <button onclick="location.reload()">再読み込み</button>
            </div>
        `;
    }
    
    showRSSErrors(errors) {
        if (!errors || errors.length === 0) return;
        
        // 詳細エラー情報をコンソールに出力
        console.warn('RSS取得エラー詳細:', errors);
        
        // 簡潔な通知をユーザーに表示
        const failedServices = [...new Set(errors.map(e => e.service || 'Unknown'))];
        
        if (window.yourNewsApp && window.yourNewsApp.showNotification) {
            window.yourNewsApp.showNotification(
                `一部のRSSフィードの取得に失敗しました（${failedServices.join(', ')}）`,
                'warning',
                8000
            );
        }
    }
    
    showLoadMoreIndicator(displayed, total) {
        const articlesContainer = document.getElementById('articlesContainer');
        if (!articlesContainer) return;
        
        // 既存のインジケーターを削除
        const existing = articlesContainer.querySelector('.load-more-indicator');
        if (existing) existing.remove();
        
        const indicator = document.createElement('div');
        indicator.className = 'load-more-indicator';
        indicator.innerHTML = `
            <p>表示中: ${displayed}件 / 全${total}件</p>
            <button class="load-more-btn" onclick="window.yourNewsApp.uiController.loadMoreArticles()">
                さらに表示
            </button>
        `;
        
        articlesContainer.appendChild(indicator);
    }
    
    // 追加記事読み込み（Phase Cで詳細実装）
    async loadMoreArticles() {
        const currentDisplay = document.querySelectorAll('.article-card').length;
        const nextBatch = this.filteredArticles.slice(currentDisplay, currentDisplay + 20);
        
        if (nextBatch.length > 0) {
            const { fragment } = this.articleCard.createMultipleCards(nextBatch);
            const articlesContainer = document.getElementById('articlesContainer');
            
            // load-more-indicatorの前に挿入
            const indicator = articlesContainer.querySelector('.load-more-indicator');
            if (indicator) {
                articlesContainer.insertBefore(fragment, indicator);
            } else {
                articlesContainer.appendChild(fragment);
            }
            
            this.updateArticleStats();
        }
    }
    
    // 記事更新処理
    async refreshArticles() {
        if (this.isRefreshing) return;
        
        this.isRefreshing = true;
        
        try {
            await this.loadAndDisplayArticles(true);
        } finally {
            this.isRefreshing = false;
        }
    }
    
    // イベントハンドラー
    handleScroll(e) {
        this.virtualScroll.scrollTop = e.target.scrollTop;
        // Phase Cで詳細な仮想スクロール実装予定
    }
    
    handleResize() {
        this.initializeVirtualScroll();
        // 表示を再計算
        this.renderArticles();
    }
    
    focusSearch() {
        const searchBox = document.getElementById('searchBox');
        if (searchBox) {
            searchBox.focus();
            searchBox.select();
        }
    }
    
    // フィードバック処理（Phase Cで詳細実装）
    async processFeedback(articleId, feedback) {
        try {
            // データ更新
            const article = this.displayedArticles.find(a => a.articleId === articleId);
            if (!article) return;
            
            // フィードバック履歴追加
            article.feedbackHistory = article.feedbackHistory || [];
            article.feedbackHistory.push({
                type: feedback === '1' ? 'interest' : feedback === '-1' ? 'disinterest' : 'ng_domain',
                timestamp: new Date().toISOString(),
                value: parseInt(feedback) || 0
            });
            
            // NGドメイン処理
            if (feedback === 'ng') {
                // 同じドメインの記事を非表示
                this.hideArticlesByDomain(article.domain);
                
                // NGドメインをユーザー設定に保存
                const prefs = await this.dataManager.loadUserPreferences();
                prefs.ngDomains = prefs.ngDomains || [];
                if (!prefs.ngDomains.includes(article.domain)) {
                    prefs.ngDomains.push(article.domain);
                    await this.dataManager.saveUserPreferences(prefs);
                }
            } else {
                // 興味度スコア更新（Phase Cで詳細AI実装）
                const currentScore = article.interestScore || 50;
                const adjustment = feedback === '1' ? 10 : -10;
                article.interestScore = Math.max(0, Math.min(100, currentScore + adjustment));
                
                // 自動既読処理
                if (feedback === '-1') {
                    article.readStatus = 'read';
                }
            }
            
            // データ保存
            await this.dataManager.saveArticles(this.displayedArticles);
            
            // UI更新
            this.articleCard.updateCard(articleId, {
                interestScore: article.interestScore,
                readStatus: article.readStatus
            });
            
            console.log(`フィードバック処理完了: ${articleId}, feedback: ${feedback}`);
            
        } catch (error) {
            console.error('フィードバック処理エラー:', error);
        }
    }
    
    hideArticlesByDomain(domain) {
        const domainCards = document.querySelectorAll(`[data-domain="${domain}"]`);
        domainCards.forEach(card => {
            card.style.opacity = '0.3';
            card.classList.add('ng-domain');
        });
    }
    
    // ユーティリティ関数
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
    
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
    
    // 公開メソッド
    getCurrentArticles() {
        return this.filteredArticles;
    }
    
    getDisplayStats() {
        return {
            total: this.displayedArticles.length,
            filtered: this.filteredArticles.length,
            displayed: document.querySelectorAll('.article-card').length
        };
    }
    
    resetFilters() {
        this.currentFilter = {
            category: 'all',
            readStatus: 'all',
            sort: 'interest'
        };
        
        this.searchQuery = '';
        
        // UI更新
        const filters = ['categoryFilter', 'readStatusFilter', 'sortFilter'];
        filters.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.selectedIndex = 0;
            }
        });
        
        const searchBox = document.getElementById('searchBox');
        if (searchBox) searchBox.value = '';
        
        this.applyFilters();
    }
}

// Phase B確認用デバッグ関数
window.debugUIController = function() {
    console.log('=== UI Controller Debug ===');
    
    if (window.yourNewsApp && window.yourNewsApp.uiController) {
        const ui = window.yourNewsApp.uiController;
        console.log('UI Controller exists:', ui);
        console.log('Current filter:', ui.currentFilter);
        console.log('Display stats:', ui.getDisplayStats());
        console.log('Displayed articles count:', ui.displayedArticles.length);
        console.log('Filtered articles count:', ui.filteredArticles.length);
    } else {
        console.log('UI Controller not found');
    }
    
    console.log('=== UI Controller Debug Complete ===');
};
