// UIController - UI操作・表示制御（依存関係修正版）
class UIController {
    constructor(dataManager = null, rssFetcher = null, articleCard = null) {
        // 【修正】依存関係を外部から注入
        this.dataManager = dataManager;
        this.rssFetcher = rssFetcher;
        this.articleCard = articleCard;
        
        this.currentArticles = [];
        this.filteredArticles = [];
        this.currentPage = 1;
        this.itemsPerPage = 50;
        this.sortBy = 'interest';
        this.filterCategory = 'all';
        this.filterReadStatus = 'all';
        this.virtualScroll = null;
        
        // フィルター状態
        this.activeFilters = new Set();
        this.searchQuery = '';
    }
    
    async initialize() {
        try {
            console.log('UIController初期化開始');
            
            // 【修正】依存関係チェック
            if (!this.dataManager) {
                throw new Error('DataManager is required');
            }
            
            // 仮想スクロール初期化
            this.setupVirtualScroll();
            
            // 記事読み込み・表示
            await this.loadAndDisplayArticles();
            
            // イベントリスナー設定
            this.setupEventListeners();
            
            console.log('UIController初期化完了');
            return true;
            
        } catch (error) {
            console.error('UIController初期化エラー:', error);
            throw error;
        }
    }
    
    setupVirtualScroll() {
        try {
            const container = document.getElementById('articlesContainer');
            if (!container) return;
            
            const itemHeight = 280; // 記事カード高さ
            const visibleItems = Math.ceil(window.innerHeight / itemHeight) + 2;
            
            this.virtualScroll = {
                container: container,
                itemHeight: itemHeight,
                visibleItems: visibleItems,
                scrollTop: 0,
                totalHeight: 0
            };
            
            console.log('仮想スクロール初期化:', this.virtualScroll);
            
        } catch (error) {
            console.error('仮想スクロール初期化エラー:', error);
        }
    }
    
    async loadAndDisplayArticles(forceRefresh = false) {
        try {
            console.log('記事読み込み開始');
            
            // RSS取得（強制更新時または記事がない場合）
            if (forceRefresh || this.currentArticles.length === 0) {
                if (this.rssFetcher) {
                    const rssFeeds = await this.dataManager.loadRssFeeds();
                    
                    if (rssFeeds.length > 0) {
                        console.log(`Fetching ${rssFeeds.length} RSS feeds...`);
                        const newArticles = await this.rssFetcher.fetchAllRSSFeeds(rssFeeds);
                        
                        if (newArticles.length > 0) {
                            // AI興味度計算（利用可能な場合）
                            if (window.yourNewsApp && window.yourNewsApp.aiEngine) {
                                await this.calculateInterestScores(newArticles);
                            }
                            
                            await this.dataManager.saveArticles(newArticles);
                        }
                    }
                }
            }
            
            // 保存された記事を読み込み
            this.currentArticles = await this.dataManager.loadArticles();
            
            // フィルター・ソート適用
            this.applyFilters();
            
            // 記事表示
            this.renderArticles();
            
            // 統計更新
            this.updateStats();
            
            console.log(`記事読み込み完了: ${this.currentArticles.length}件`);
            
        } catch (error) {
            console.error('記事読み込みエラー:', error);
            this.showErrorMessage('記事の読み込みに失敗しました');
        }
    }
    
    async calculateInterestScores(articles) {
        try {
            const keywords = await this.dataManager.loadData('yourNews_keywords') || 
                           { interestWords: [], ngWords: [] };
            
            for (const article of articles) {
                if (window.yourNewsApp && window.yourNewsApp.aiEngine) {
                    const score = await window.yourNewsApp.aiEngine.calculateInterestScore(article, keywords);
                    article.interestScore = score;
                }
            }
            
        } catch (error) {
            console.error('AI興味度計算エラー:', error);
        }
    }
    
    applyFilters() {
        try {
            let filtered = [...this.currentArticles];
            
            // 検索フィルター
            if (this.searchQuery) {
                const query = this.searchQuery.toLowerCase();
                filtered = filtered.filter(article =>
                    article.title.toLowerCase().includes(query) ||
                    article.excerpt.toLowerCase().includes(query) ||
                    article.domain.toLowerCase().includes(query)
                );
            }
            
            // カテゴリフィルター
            if (this.filterCategory !== 'all') {
                filtered = filtered.filter(article => article.category === this.filterCategory);
            }
            
            // 既読状態フィルター
            if (this.filterReadStatus !== 'all') {
                filtered = filtered.filter(article => {
                    if (this.filterReadStatus === 'unread') {
                        return article.readStatus !== 'read';
                    } else if (this.filterReadStatus === 'read') {
                        return article.readStatus === 'read';
                    }
                    return true;
                });
            }
            
            // 高度フィルター
            this.activeFilters.forEach(filter => {
                switch (filter) {
                    case 'interest':
                        filtered = filtered.filter(article => article.interestScore >= 70);
                        break;
                    case 'unread':
                        filtered = filtered.filter(article => article.readStatus !== 'read');
                        break;
                    case 'today':
                        const today = new Date().toDateString();
                        filtered = filtered.filter(article => 
                            new Date(article.publishDate).toDateString() === today
                        );
                        break;
                    case 'ai-recommended':
                        filtered = filtered.filter(article => article.interestScore >= 80);
                        break;
                }
            });
            
            // NGドメイン除外
            filtered = filtered.filter(article => !article.ngDomain);
            
            this.filteredArticles = filtered;
            
            // ソート適用
            this.applySorting();
            
        } catch (error) {
            console.error('フィルター適用エラー:', error);
            this.filteredArticles = this.currentArticles;
        }
    }
    
    applySorting() {
        try {
            this.filteredArticles.sort((a, b) => {
                switch (this.sortBy) {
                    case 'interest':
                        return (b.interestScore || 50) - (a.interestScore || 50);
                    
                    case 'date':
                        return new Date(b.publishDate) - new Date(a.publishDate);
                    
                    case 'domain':
                        return a.domain.localeCompare(b.domain);
                    
                    case 'keyword-match':
                        const aMatches = a.matchedKeywords ? a.matchedKeywords.length : 0;
                        const bMatches = b.matchedKeywords ? b.matchedKeywords.length : 0;
                        return bMatches - aMatches;
                    
                    default:
                        return 0;
                }
            });
            
        } catch (error) {
            console.error('ソート適用エラー:', error);
        }
    }
    
    renderArticles() {
        try {
            const container = document.getElementById('articlesContainer');
            const loadingMessage = document.getElementById('loadingMessage');
            const noArticlesMessage = document.getElementById('noArticlesMessage');
            
            if (!container) return;
            
            // レンダリング開始イベント
            window.dispatchEvent(new CustomEvent('articlesRenderStart'));
            
            // 記事がない場合
            if (this.filteredArticles.length === 0) {
                if (loadingMessage) loadingMessage.style.display = 'none';
                if (noArticlesMessage) noArticlesMessage.style.display = 'block';
                container.innerHTML = '';
                return;
            }
            
            // ローディング非表示
            if (loadingMessage) loadingMessage.style.display = 'none';
            if (noArticlesMessage) noArticlesMessage.style.display = 'none';
            
            // 表示する記事を計算（ページネーション）
            const startIndex = (this.currentPage - 1) * this.itemsPerPage;
            const endIndex = startIndex + this.itemsPerPage;
            const articlesToShow = this.filteredArticles.slice(startIndex, endIndex);
            
            // 記事カード生成
            if (this.articleCard) {
                const { fragment } = this.articleCard.createMultipleCards(articlesToShow);
                container.innerHTML = '';
                container.appendChild(fragment);
            } else {
                // フォールバック表示
                container.innerHTML = articlesToShow.map(article => 
                    this.createSimpleArticleHTML(article)
                ).join('');
            }
            
            console.log(`${articlesToShow.length}件の記事を表示`);
            
            // レンダリング完了イベント
            window.dispatchEvent(new CustomEvent('articlesRenderComplete'));
            
        } catch (error) {
            console.error('記事表示エラー:', error);
            this.showErrorMessage('記事の表示でエラーが発生しました');
        }
    }
    
    createSimpleArticleHTML(article) {
        return `
            <div class="article-card" data-article-id="${article.articleId}">
                <div class="article-info">
                    <h3 class="article-title">${Utils.sanitizeHTML(article.title)}</h3>
                    <p class="article-excerpt">${Utils.sanitizeHTML(article.excerpt)}</p>
                    <div class="article-meta">
                        <span class="domain">${article.domain}</span>
                        <span class="publish-date">${new Date(article.publishDate).toLocaleDateString()}</span>
                        <span class="interest-score">${article.interestScore || 50}点</span>
                    </div>
                </div>
                <div class="card-actions">
                    <button onclick="window.open('${article.url}', '_blank')">記事を読む</button>
                </div>
            </div>
        `;
    }
    
    updateStats() {
        try {
            const stats = {
                total: this.currentArticles.length,
                filtered: this.filteredArticles.length,
                unread: this.currentArticles.filter(a => a.readStatus !== 'read').length,
                favorites: this.currentArticles.filter(a => a.favorited).length
            };
            
            console.log('記事統計:', stats);
            
            // UI要素更新
            const articlesCount = document.getElementById('articlesCount');
            if (articlesCount) {
                if (stats.filtered === stats.total) {
                    articlesCount.textContent = `${stats.total}件の記事`;
                } else {
                    articlesCount.textContent = `${stats.filtered}件の記事（全${stats.total}件中）`;
                }
            }
            
            const unreadBadge = document.getElementById('unreadBadge');
            if (unreadBadge) {
                unreadBadge.textContent = stats.unread;
                unreadBadge.style.display = stats.unread > 0 ? 'inline' : 'none';
            }
            
            return stats;
            
        } catch (error) {
            console.error('統計更新エラー:', error);
            return { total: 0, filtered: 0, unread: 0, favorites: 0 };
        }
    }
    
    setupEventListeners() {
        try {
            // スクロールイベント（仮想スクロール用）
            const container = document.getElementById('articlesContainer');
            if (container) {
                container.addEventListener('scroll', Utils.throttle(() => {
                    this.handleScroll();
                }, 100));
            }
            
            // ウィンドウリサイズ
            window.addEventListener('resize', Utils.debounce(() => {
                this.setupVirtualScroll();
                this.renderArticles();
            }, 250));
            
        } catch (error) {
            console.error('UIイベントリスナー設定エラー:', error);
        }
    }
    
    handleScroll() {
        // 仮想スクロール処理（必要に応じて実装）
        // 現在はシンプルなページネーション対応
    }
    
    // フィルター操作メソッド
    filterByCategory(category) {
        this.filterCategory = category;
        this.applyFilters();
        this.renderArticles();
    }
    
    filterByReadStatus(status) {
        this.filterReadStatus = status;
        this.applyFilters();
        this.renderArticles();
    }
    
    sortArticles(sortBy) {
        this.sortBy = sortBy;
        this.applySorting();
        this.renderArticles();
    }
    
    applyAdvancedFilters(filters) {
        this.activeFilters = new Set(filters);
        this.applyFilters();
        this.renderArticles();
    }
    
    setSearchQuery(query) {
        this.searchQuery = query;
        this.applyFilters();
        this.renderArticles();
    }
    
    // 記事操作メソッド
    updateArticleDisplay(articleId, updates) {
        try {
            const card = document.querySelector(`[data-article-id="${articleId}"]`);
            if (card && this.articleCard) {
                this.articleCard.updateCard(articleId, updates);
            }
            
            // ローカルデータも更新
            const article = this.currentArticles.find(a => a.articleId === articleId);
            if (article) {
                Object.assign(article, updates);
            }
            
        } catch (error) {
            console.error('記事表示更新エラー:', error);
        }
    }
    
    removeArticleFromDisplay(articleId) {
        try {
            if (this.articleCard) {
                this.articleCard.removeCard(articleId);
            }
            
            // 配列からも削除
            this.currentArticles = this.currentArticles.filter(a => a.articleId !== articleId);
            this.filteredArticles = this.filteredArticles.filter(a => a.articleId !== articleId);
            
            this.updateStats();
            
        } catch (error) {
            console.error('記事削除表示エラー:', error);
        }
    }
    
    // ユーティリティメソッド
    getCurrentArticles() {
        return this.currentArticles;
    }
    
    getFilteredArticles() {
        return this.filteredArticles;
    }
    
    getUnreadCount() {
        return this.currentArticles.filter(a => a.readStatus !== 'read').length;
    }
    
    getFavoritesCount() {
        return this.currentArticles.filter(a => a.favorited).length;
    }
    
    showErrorMessage(message, details = '') {
        try {
            if (window.yourNewsApp && window.yourNewsApp.showNotification) {
                window.yourNewsApp.showNotification(message, 'error');
            } else {
                console.error(message, details);
            }
        } catch (error) {
            console.error('エラーメッセージ表示失敗:', error);
        }
    }
    
    // ページネーション
    goToPage(page) {
        const totalPages = Math.ceil(this.filteredArticles.length / this.itemsPerPage);
        
        if (page >= 1 && page <= totalPages) {
            this.currentPage = page;
            this.renderArticles();
        }
    }
    
    nextPage() {
        const totalPages = Math.ceil(this.filteredArticles.length / this.itemsPerPage);
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.renderArticles();
        }
    }
    
    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.renderArticles();
        }
    }
}
