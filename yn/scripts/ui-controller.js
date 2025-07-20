// UIController - 記事状態保持機能強化版
class UIController {
    constructor(dataManager, rssFetcher, articleCard) {
        this.dataManager = dataManager;
        this.rssFetcher = rssFetcher;
        this.articleCard = articleCard;
        
        // 記事管理
        this.currentArticles = [];
        this.filteredArticles = [];
        
        // フィルター状態
        this.filterCategory = 'all';
        this.filterReadStatus = 'all';
        this.sortBy = 'interest';
        
        // UI状態保持
        this.lastScrollPosition = 0;
        this.lastFilterState = null;
        this.selectedArticleIds = new Set();
        
        // 仮想スクロール
        this.virtualScroll = null;
        
        // パフォーマンス設定
        this.renderDebounceTime = 100;
        this.renderTimeout = null;
    }
    
    async initialize() {
        try {
            console.log('UIController初期化開始');
            
            // 初期記事読み込み
            await this.loadAndDisplayArticles();
            
            // イベントリスナー設定
            this.setupEventListeners();
            
            // 仮想スクロール初期化
            this.initializeVirtualScroll();
            
            console.log('UIController初期化完了');
            return true;
            
        } catch (error) {
            console.error('UIController初期化エラー:', error);
            return false;
        }
    }
    
    // 【修正】記事読み込み・表示（状態保持対応）
    async loadAndDisplayArticles(forceRefresh = false) {
        try {
            console.log('記事読み込み開始');
            
            // UI状態保持
            this.preserveUIStates();
            
            // RSS取得（強制更新時または記事がない場合）
            if (forceRefresh || this.currentArticles.length === 0) {
                if (this.rssFetcher) {
                    const rssFeeds = await this.dataManager.loadRssFeeds();
                    
                    if (rssFeeds.length > 0) {
                        console.log(`Fetching ${rssFeeds.length} RSS feeds...`);
                        const newArticles = await this.rssFetcher.fetchAllRSSFeeds(rssFeeds);
                        
                        if (newArticles.length > 0) {
                            // AI興味度計算（利用可能な場合）
                            if (window.yourNewsApp && window.yourNewsApp.aiEngine && !window.yourNewsApp.aiDisabled) {
                                await this.calculateInterestScores(newArticles);
                            }
                            
                            // 【重要】マージ機能を使用して保存（状態保持）
                            await this.dataManager.saveArticles(newArticles);
                        }
                    }
                }
            }
            
            // 保存された記事を読み込み（マージ済み）
            this.currentArticles = await this.dataManager.loadArticles();
            
            // フィルター・ソート適用
            this.applyFilters();
            
            // 記事表示
            this.renderArticles();
            
            // 統計更新
            this.updateStats();
            
            // UI状態復元
            this.restoreUIStates();
            
            console.log(`記事読み込み完了: ${this.currentArticles.length}件`);
            
        } catch (error) {
            console.error('記事読み込みエラー:', error);
            this.showErrorMessage('記事の読み込みに失敗しました');
        }
    }
    
    // 【新機能】UI状態保持
    preserveUIStates() {
        try {
            // 現在のスクロール位置を保持
            this.lastScrollPosition = window.pageYOffset;
            
            // 選択中のフィルター状態を保持
            this.lastFilterState = {
                category: this.filterCategory,
                readStatus: this.filterReadStatus,
                sort: this.sortBy
            };
            
            // 選択された記事IDを保持
            this.selectedArticleIds = new Set(
                Array.from(document.querySelectorAll('.article-card.selected')).map(card => card.dataset.articleId)
            );
            
            console.log(`UI状態保持: scroll=${this.lastScrollPosition}, filters=${JSON.stringify(this.lastFilterState)}, selected=${this.selectedArticleIds.size}`);
            
        } catch (error) {
            console.error('UI状態保持エラー:', error);
        }
    }
    
    // 【新機能】UI状態復元
    restoreUIStates() {
        try {
            // フィルター状態復元
            if (this.lastFilterState) {
                this.filterCategory = this.lastFilterState.category;
                this.filterReadStatus = this.lastFilterState.readStatus;
                this.sortBy = this.lastFilterState.sort;
                
                // UI要素に反映
                this.updateFilterUI();
            }
            
            // 選択状態復元
            if (this.selectedArticleIds.size > 0) {
                setTimeout(() => {
                    this.selectedArticleIds.forEach(articleId => {
                        const card = document.querySelector(`[data-article-id="${articleId}"]`);
                        if (card) {
                            card.classList.add('selected');
                        }
                    });
                }, 100);
            }
            
            // スクロール位置復元（少し遅延）
            if (this.lastScrollPosition > 0) {
                setTimeout(() => {
                    window.scrollTo({
                        top: this.lastScrollPosition,
                        behavior: 'smooth'
                    });
                }, 200);
            }
            
            console.log(`UI状態復元完了`);
            
        } catch (error) {
            console.error('UI状態復元エラー:', error);
        }
    }
    
    // フィルターUI更新
    updateFilterUI() {
        try {
            // カテゴリフィルター
            const categoryFilter = document.getElementById('categoryFilter');
            if (categoryFilter) {
                categoryFilter.value = this.filterCategory;
            }
            
            // 既読状態フィルター
            const readStatusFilter = document.getElementById('readStatusFilter');
            if (readStatusFilter) {
                readStatusFilter.value = this.filterReadStatus;
            }
            
            // ソートフィルター
            const sortFilter = document.getElementById('sortFilter');
            if (sortFilter) {
                sortFilter.value = this.sortBy;
            }
            
        } catch (error) {
            console.error('フィルターUI更新エラー:', error);
        }
    }
    
    // AI興味度計算
    async calculateInterestScores(articles) {
        try {
            if (!window.yourNewsApp.aiEngine) return;
            
            const keywords = await this.dataManager.loadData('yourNews_keywords') || 
                           { interestWords: [], ngWords: [] };
            
            for (const article of articles) {
                try {
                    const score = await window.yourNewsApp.aiEngine.calculateInterestScore(article, keywords);
                    article.interestScore = score;
                } catch (error) {
                    console.warn(`AI score calculation failed for article ${article.articleId}:`, error);
                    article.interestScore = 50; // デフォルトスコア
                }
            }
            
        } catch (error) {
            console.error('AI興味度計算エラー:', error);
        }
    }
    
    // 仮想スクロール初期化
    initializeVirtualScroll() {
        try {
            const container = document.getElementById('articlesContainer');
            if (!container) return;
            
            const itemHeight = 280; // 記事カードの推定高さ
            const containerHeight = window.innerHeight - container.offsetTop;
            const visibleItems = Math.ceil(containerHeight / itemHeight) + 2;
            
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
    
    // フィルター適用
    applyFilters() {
        try {
            let filtered = [...this.currentArticles];
            
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
            
            // NGドメイン記事を除外
            filtered = filtered.filter(article => !article.ngDomain);
            
            // ソート適用
            this.applySorting(filtered);
            
            this.filteredArticles = filtered;
            
        } catch (error) {
            console.error('フィルター適用エラー:', error);
            this.filteredArticles = this.currentArticles;
        }
    }
    
    // ソート適用
    applySorting(articles) {
        articles.sort((a, b) => {
            switch (this.sortBy) {
                case 'interest':
                    return (b.interestScore || 50) - (a.interestScore || 50);
                case 'date':
                    return new Date(b.publishDate || b.addedDate) - new Date(a.publishDate || a.addedDate);
                case 'domain':
                    return a.domain.localeCompare(b.domain);
                case 'keyword-match':
                    return (b.matchedKeywords?.length || 0) - (a.matchedKeywords?.length || 0);
                default:
                    return 0;
            }
        });
    }
    
    // 記事表示（デバウンス対応）
    renderArticles() {
        clearTimeout(this.renderTimeout);
        this.renderTimeout = setTimeout(() => {
            this.doRenderArticles();
        }, this.renderDebounceTime);
    }
    
    doRenderArticles() {
        try {
            const container = document.getElementById('articlesContainer');
            if (!container) return;
            
            // 記事数チェック
            if (this.filteredArticles.length === 0) {
                this.showEmptyState();
                return;
            }
            
            // 既存の表示をクリア
            container.innerHTML = '';
            
            // 記事カード生成・表示
            this.filteredArticles.forEach((article, index) => {
                const cardElement = this.createArticleCard(article, index);
                container.appendChild(cardElement);
            });
            
            // イベントリスナー再設定
            this.attachArticleEventListeners();
            
            console.log(`${this.filteredArticles.length}件の記事を表示`);
            
        } catch (error) {
            console.error('記事表示エラー:', error);
        }
    }
    
    // 記事カード作成
    createArticleCard(article, index) {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'article-card';
        cardDiv.dataset.articleId = article.articleId;
        
        // 既読状態の反映
        if (article.readStatus === 'read') {
            cardDiv.classList.add('read');
        }
        
        // NGドメインの反映
        if (article.ngDomain) {
            cardDiv.classList.add('ng-domain');
            cardDiv.style.display = 'none';
        }
        
        const interestScore = article.interestScore || 50;
        const scoreClass = interestScore >= 70 ? 'score-high' : 
                          interestScore >= 40 ? 'score-medium' : 'score-low';
        
        const keywordsHtml = article.matchedKeywords?.length > 0 ? 
            `<div class="matched-keywords">
                ${article.matchedKeywords.slice(0, 3).map(keyword => 
                    `<span class="keyword-highlight">${keyword}</span>`
                ).join('')}
                ${article.matchedKeywords.length > 3 ? 
                    `<span class="keyword-more">+${article.matchedKeywords.length - 3}個</span>` : ''
                }
            </div>` : '';
        
        cardDiv.innerHTML = `
            <div class="card-header">
                <div class="interest-score ${scoreClass}">${interestScore}点</div>
                ${keywordsHtml}
                <div class="card-meta">
                    <span class="domain">${article.domain}</span>
                    <span class="publish-date">${this.formatDate(article.publishDate)}</span>
                    <span class="category">${article.category || 'その他'}</span>
                </div>
            </div>
            <div class="card-content">
                <div class="article-info">
                    <h3 class="article-title" onclick="window.yourNewsApp.openArticle('${article.articleId}')">${article.title}</h3>
                    <p class="article-excerpt">${article.excerpt}</p>
                </div>
            </div>
            <div class="card-actions">
                <div class="feedback-buttons">
                    <button class="feedback-btn interest" data-feedback="1" data-article-id="${article.articleId}">
                        👍 興味有り
                    </button>
                    <button class="feedback-btn disinterest" data-feedback="-1" data-article-id="${article.articleId}">
                        👎 興味無し
                    </button>
                    <button class="feedback-btn ng-domain" data-feedback="ng" data-article-id="${article.articleId}">
                        🚫 ドメインNG
                    </button>
                </div>
                <div class="card-actions-right">
                    <button class="favorite-btn ${article.favorited ? 'active' : ''}" data-article-id="${article.articleId}">
                        ⭐ ${article.favorited ? 'お気に入り済み' : 'お気に入り'}
                    </button>
                    <button class="read-toggle-btn" data-read="${article.readStatus === 'read'}" data-article-id="${article.articleId}">
                        ${article.readStatus === 'read' ? '✅ 既読' : '📖 未読'}
                    </button>
                </div>
            </div>
        `;
        
        return cardDiv;
    }
    
    // 記事イベントリスナー設定
    attachArticleEventListeners() {
        try {
            // フィードバックボタン
            document.querySelectorAll('.feedback-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const articleId = btn.dataset.articleId;
                    const feedback = btn.dataset.feedback;
                    this.processFeedback(articleId, feedback);
                });
            });
            
            // お気に入りボタン
            document.querySelectorAll('.favorite-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const articleId = btn.dataset.articleId;
                    this.toggleFavorite(articleId);
                });
            });
            
            // 既読切替ボタン
            document.querySelectorAll('.read-toggle-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const articleId = btn.dataset.articleId;
                    this.toggleReadStatus(articleId);
                });
            });
            
        } catch (error) {
            console.error('イベントリスナー設定エラー:', error);
        }
    }
    
    // フィードバック処理
    async processFeedback(articleId, feedback) {
        try {
            if (!window.yourNewsApp) return;
            
            await window.yourNewsApp.processFeedback(articleId, feedback);
            
            // UI即座更新
            this.updateArticleDisplay(articleId, feedback);
            
        } catch (error) {
            console.error('フィードバック処理エラー:', error);
        }
    }
    
    // お気に入り切替
    async toggleFavorite(articleId) {
        try {
            const article = this.currentArticles.find(a => a.articleId === articleId);
            if (!article) return;
            
            article.favorited = !article.favorited;
            
            await this.dataManager.updateArticle(articleId, { favorited: article.favorited });
            
            // UI更新
            const btn = document.querySelector(`[data-article-id="${articleId}"].favorite-btn`);
            if (btn) {
                btn.classList.toggle('active', article.favorited);
                btn.textContent = article.favorited ? '⭐ お気に入り済み' : '⭐ お気に入り';
            }
            
            this.updateStats();
            
        } catch (error) {
            console.error('お気に入り切替エラー:', error);
        }
    }
    
    // 既読状態切替
    async toggleReadStatus(articleId) {
        try {
            const article = this.currentArticles.find(a => a.articleId === articleId);
            if (!article) return;
            
            const newStatus = article.readStatus === 'read' ? 'unread' : 'read';
            article.readStatus = newStatus;
            
            await this.dataManager.updateArticle(articleId, { readStatus: newStatus });
            
            // UI更新
            this.updateArticleDisplay(articleId, { readStatus: newStatus });
            this.updateStats();
            
        } catch (error) {
            console.error('既読状態切替エラー:', error);
        }
    }
    
    // 記事表示更新
    updateArticleDisplay(articleId, updates) {
        try {
            const card = document.querySelector(`[data-article-id="${articleId}"]`);
            if (!card) return;
            
            const article = this.currentArticles.find(a => a.articleId === articleId);
            if (!article) return;
            
            // 既読状態反映
            if (updates.readStatus !== undefined) {
                card.classList.toggle('read', updates.readStatus === 'read');
                
                const readBtn = card.querySelector('.read-toggle-btn');
                if (readBtn) {
                    readBtn.dataset.read = (updates.readStatus === 'read').toString();
                    readBtn.textContent = updates.readStatus === 'read' ? '✅ 既読' : '📖 未読';
                }
            }
            
            // NGドメイン状態反映
            if (updates.ngDomain !== undefined) {
                card.classList.toggle('ng-domain', updates.ngDomain);
                if (updates.ngDomain) {
                    card.style.display = 'none';
                }
            }
            
            // フィードバック状態反映
            if (updates === 'ng' || updates === -1) {
                card.classList.add('read');
            }
            
        } catch (error) {
            console.error('記事表示更新エラー:', error);
        }
    }
    
    // 統計情報更新
    updateStats() {
        try {
            const total = this.currentArticles.length;
            const filtered = this.filteredArticles.length;
            const unread = this.currentArticles.filter(a => a.readStatus !== 'read').length;
            const favorites = this.currentArticles.filter(a => a.favorited).length;
            
            console.log('記事統計:', { total, filtered, unread, favorites });
            
            // 統計表示更新（要素が存在する場合）
            const statsElements = {
                totalCount: total,
                filteredCount: filtered,
                unreadCount: unread,
                favoritesCount: favorites
            };
            
            Object.entries(statsElements).forEach(([key, value]) => {
                const element = document.getElementById(key);
                if (element) {
                    element.textContent = value;
                }
            });
            
        } catch (error) {
            console.error('統計更新エラー:', error);
        }
    }
    
    // フィルター変更ハンドラー
    filterByCategory(category) {
        this.filterCategory = category;
        this.applyFilters();
        this.renderArticles();
        this.updateStats();
    }
    
    filterByReadStatus(status) {
        this.filterReadStatus = status;
        this.applyFilters();
        this.renderArticles();
        this.updateStats();
    }
    
    sortArticles(sortBy) {
        this.sortBy = sortBy;
        this.applyFilters();
        this.renderArticles();
    }
    
    // イベントリスナー設定
    setupEventListeners() {
        try {
            // ウィンドウリサイズ
            window.addEventListener('resize', () => {
                this.initializeVirtualScroll();
            });
            
            // スクロールイベント
            window.addEventListener('scroll', () => {
                this.lastScrollPosition = window.pageYOffset;
            });
            
        } catch (error) {
            console.error('イベントリスナー設定エラー:', error);
        }
    }
    
    // 空状態表示
    showEmptyState() {
        const container = document.getElementById('articlesContainer');
        if (!container) return;
        
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📰</div>
                <h3>記事がありません</h3>
                <p>RSSフィードを追加するか、フィルターを変更してください。</p>
                <button class="btn btn-primary" onclick="location.href='pages/rss-manager.html'">
                    RSS管理画面へ
                </button>
            </div>
        `;
    }
    
    // エラーメッセージ表示
    showErrorMessage(message) {
        if (window.yourNewsApp && window.yourNewsApp.showNotification) {
            window.yourNewsApp.showNotification(message, 'error');
        } else {
            console.error(message);
        }
    }
    
    // 日付フォーマット
    formatDate(dateString) {
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            
            if (diffHours < 1) return '今';
            if (diffHours < 24) return `${diffHours}時間前`;
            if (diffDays < 7) return `${diffDays}日前`;
            
            return date.toLocaleDateString('ja-JP');
            
        } catch (error) {
            return '不明';
        }
    }
}
