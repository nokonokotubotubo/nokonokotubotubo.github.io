// UIController - AI興味度ソート問題完全解決版
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
        
        // フィードバック処理状態
        this.processingFeedback = new Set();
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
    
    // 記事読み込み・表示（状態保持対応）
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
                            // 【重要】AI興味度計算（確実な記事データ反映）
                            console.log('🧠 AI興味度計算開始（記事データ更新前）');
                            await this.calculateInterestScores(newArticles);
                            console.log('✅ AI興味度計算完了（記事データ更新済み）');
                            
                            // マージ機能を使用して保存（状態保持）
                            await this.dataManager.saveArticles(newArticles);
                        }
                    }
                }
            }
            
            // 保存された記事を読み込み（マージ済み）
            this.currentArticles = await this.dataManager.loadArticles();
            
            // 【追加】読み込み後のスコア検証
            console.log('📊 読み込み記事スコア検証:');
            this.currentArticles.slice(0, 3).forEach((article, index) => {
                console.log(`記事${index + 1}: "${article.title.substring(0, 30)}..." = ${article.interestScore}点`);
            });
            
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
    
    // UI状態保持
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
    
    // UI状態復元
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
    
    // 【重要】記事スコア更新（即座反映）
    updateArticleScore(articleId, newScore) {
        try {
            const card = document.querySelector(`[data-article-id="${articleId}"]`);
            if (!card) {
                console.warn(`記事カードが見つかりません: ${articleId}`);
                return;
            }
            
            const scoreElement = card.querySelector('.interest-score');
            if (scoreElement) {
                // スコア表示更新
                scoreElement.textContent = `${newScore}点`;
                
                // スコア色分け更新
                scoreElement.className = 'interest-score';
                if (newScore >= 70) {
                    scoreElement.classList.add('score-high');
                } else if (newScore >= 40) {
                    scoreElement.classList.add('score-medium');
                } else if (newScore >= 0) {
                    scoreElement.classList.add('score-low');
                }
                
                // アニメーション効果
                scoreElement.style.transform = 'scale(1.2)';
                scoreElement.style.background = '#4CAF50';
                scoreElement.style.transition = 'all 0.3s ease';
                
                setTimeout(() => {
                    scoreElement.style.transform = 'scale(1)';
                    scoreElement.style.background = '';
                }, 500);
            }
            
            // 記事のローカルデータも更新
            const article = this.currentArticles.find(a => a.articleId === articleId);
            if (article) {
                article.interestScore = newScore;
            }
            
            console.log(`📊 スコア表示更新: ${articleId} -> ${newScore}点`);
            
        } catch (error) {
            console.error('スコア表示更新エラー:', error);
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
            
            // 興味度スコア反映
            if (updates.interestScore !== undefined) {
                this.updateArticleScore(articleId, updates.interestScore);
            }
            
        } catch (error) {
            console.error('記事表示更新エラー:', error);
        }
    }
    
    // 【修正】AI興味度計算（記事データ確実反映版）
    async calculateInterestScores(articles) {
        try {
            if (!window.yourNewsApp.aiEngine || window.yourNewsApp.aiDisabled) {
                console.log('AI機能無効、デフォルトスコア使用');
                // デフォルトスコアを明示的に設定
                articles.forEach(article => {
                    if (article.interestScore === undefined) {
                        article.interestScore = 50;
                    }
                });
                return;
            }
            
            const keywords = await this.dataManager.loadData('yourNews_keywords') || 
                           { interestWords: [], ngWords: [] };
            
            console.log(`🧠 AI興味度計算開始: ${articles.length}件`);
            
            for (const article of articles) {
                try {
                    const score = await window.yourNewsApp.aiEngine.calculateInterestScore(article, keywords);
                    
                    // 【重要】計算結果を確実に記事データに保存
                    article.interestScore = score;
                    
                    console.log(`📊 記事スコア設定: "${article.title.substring(0, 30)}..." = ${score}点`);
                    
                    // NGワード判定
                    if (score === -1) {
                        article.ngDomain = true;
                        article.readStatus = 'read';
                        console.log(`🚫 NG記事検出: ${article.title}`);
                    }
                    
                } catch (error) {
                    console.warn(`AI score calculation failed for article ${article.articleId}:`, error);
                    article.interestScore = 50; // デフォルトスコア
                }
            }
            
            console.log('✅ AI興味度計算完了 - 記事データ更新済み');
            
            // 【追加】計算結果検証
            console.log('🔍 計算結果検証:');
            articles.slice(0, 3).forEach((article, index) => {
                console.log(`検証${index + 1}: "${article.title.substring(0, 30)}..." = ${article.interestScore}点`);
            });
            
        } catch (error) {
            console.error('AI興味度計算エラー:', error);
            // エラー時はデフォルトスコアを設定
            articles.forEach(article => {
                if (article.interestScore === undefined) {
                    article.interestScore = 50;
                }
            });
        }
    }
    
    // 仮想スクロール初期化
    initializeVirtualScroll() {
        try {
            const container = document.getElementById('articlesContainer');
            if (!container) return;
            
            const itemHeight = 280;
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
    
    // 【修正1】フィルター適用（ソート問題対応版）
    applyFilters() {
        try {
            console.log(`🔍 フィルター処理開始: 対象 ${this.currentArticles.length}件`);
            
            // 【重要】currentArticlesの新しいコピーを作成
            let filtered = [...this.currentArticles];
            
            // カテゴリフィルター
            if (this.filterCategory !== 'all') {
                filtered = filtered.filter(article => article.category === this.filterCategory);
                console.log(`📂 カテゴリフィルター後: ${filtered.length}件`);
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
                console.log(`📖 既読フィルター後: ${filtered.length}件`);
            }
            
            // NGドメイン記事を除外
            filtered = filtered.filter(article => !article.ngDomain);
            console.log(`🚫 NGドメイン除外後: ${filtered.length}件`);
            
            // 【重要】ソート適用（確実な実行）
            console.log('🔄 ソート処理実行前...');
            this.applySorting(filtered);
            console.log('✅ ソート処理完了');
            
            // 結果を設定
            this.filteredArticles = filtered;
            
            console.log(`✅ フィルター処理完了: ${this.filteredArticles.length}件`);
            
        } catch (error) {
            console.error('フィルター適用エラー:', error);
            // エラー時は元の配列をそのまま使用
            this.filteredArticles = [...this.currentArticles];
        }
    }
    
    // 【修正2】ソート適用（確実なインプレース・ソート版）
    applySorting(articles) {
        try {
            console.log(`📊 ソート処理開始: ${this.sortBy} (対象: ${articles.length}件)`);
            
            // 【重要】確実なインプレース・ソート
            articles.sort((a, b) => {
                switch (this.sortBy) {
                    case 'interest':
                        // AI興味度順（高い順）- 型安全な比較
                        const scoreA = (typeof a.interestScore === 'number') ? a.interestScore : 50;
                        const scoreB = (typeof b.interestScore === 'number') ? b.interestScore : 50;
                        
                        // デバッグログ（最初の5件のみ）
                        if (articles.indexOf(a) < 5 || articles.indexOf(b) < 5) {
                            console.log(`🔄 ソート比較: ${scoreA}点 vs ${scoreB}点 = ${scoreB - scoreA}`);
                        }
                        
                        return scoreB - scoreA; // 降順（高いスコアが上）
                        
                    case 'date':
                        // 更新日時順（新しい順）
                        const dateA = new Date(a.publishDate || a.addedDate);
                        const dateB = new Date(b.publishDate || b.addedDate);
                        return dateB - dateA;
                        
                    case 'domain':
                        // ドメイン順（アルファベット順）
                        return a.domain.localeCompare(b.domain);
                        
                    case 'keyword-match':
                        // キーワード一致度順（多い順）
                        const matchA = a.matchedKeywords?.length || 0;
                        const matchB = b.matchedKeywords?.length || 0;
                        return matchB - matchA;
                        
                    default:
                        return 0;
                }
            });
            
            // 【追加】ソート結果の検証ログ
            if (this.sortBy === 'interest') {
                console.log('✅ ソート結果検証:');
                articles.slice(0, 5).forEach((article, index) => {
                    console.log(`${index + 1}位: ${article.interestScore}点 - "${article.title.substring(0, 30)}..."`);
                });
            }
            
            console.log(`✅ ソート完了 (${this.sortBy}): ${articles.length}件`);
            
        } catch (error) {
            console.error('ソート処理エラー:', error);
            // エラー時はデフォルトソートを試行
            try {
                articles.sort((a, b) => (b.interestScore || 50) - (a.interestScore || 50));
                console.warn('デフォルトソートで復旧しました');
            } catch (fallbackError) {
                console.error('デフォルトソートも失敗:', fallbackError);
            }
        }
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
            
            // 【追加】ソート結果の確認
            if (this.sortBy === 'interest') {
                console.log('=== AI興味度ソート結果確認 ===');
                this.filteredArticles.slice(0, 5).forEach((article, index) => {
                    console.log(`${index + 1}位: "${article.title.substring(0, 30)}..." = ${article.interestScore}点`);
                });
                console.log('============================');
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
    
    // 【修正】記事カード作成（スコア表示確実反映版）
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
        
        // 【修正】興味度スコアの確実な取得
        const interestScore = article.interestScore !== undefined ? article.interestScore : 50;
        console.log(`🎯 カード生成時スコア: "${article.title.substring(0, 30)}..." = ${interestScore}点 (データ値: ${article.interestScore})`);
        
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
                    <button class="feedback-btn interest" 
                            data-feedback="1" 
                            data-article-id="${article.articleId}"
                            onclick="window.yourNewsApp.processFeedback('${article.articleId}', 1)">
                        👍 興味有り
                    </button>
                    <button class="feedback-btn disinterest" 
                            data-feedback="-1" 
                            data-article-id="${article.articleId}"
                            onclick="window.yourNewsApp.processFeedback('${article.articleId}', -1)">
                        👎 興味無し
                    </button>
                    <button class="feedback-btn ng-domain" 
                            data-feedback="ng" 
                            data-article-id="${article.articleId}"
                            onclick="window.yourNewsApp.processFeedback('${article.articleId}', 'ng')">
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
    
    // 【修正】ソート変更ハンドラー（強化版）
    sortArticles(sortBy) {
        try {
            console.log(`🔄 ソート変更: ${this.sortBy} → ${sortBy}`);
            
            this.sortBy = sortBy;
            
            // フィルター・ソート再適用
            this.applyFilters();
            
            // 強制再描画
            this.renderArticles();
            
            // ソート完了通知
            if (sortBy === 'interest') {
                const scoreRange = this.getScoreRange();
                const message = `AI興味度順でソート完了 (${scoreRange.min}点〜${scoreRange.max}点)`;
                if (window.yourNewsApp && window.yourNewsApp.showNotification) {
                    window.yourNewsApp.showNotification(message, 'success', 3000);
                }
            }
            
            console.log(`✅ ソート変更完了: ${sortBy}`);
            
        } catch (error) {
            console.error('ソート変更エラー:', error);
        }
    }
    
    // スコア範囲取得
    getScoreRange() {
        const scores = this.filteredArticles.map(a => a.interestScore || 50);
        return {
            min: Math.min(...scores),
            max: Math.max(...scores)
        };
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
