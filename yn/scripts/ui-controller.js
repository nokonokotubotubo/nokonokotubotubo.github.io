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

            const keywords = await this.dataManager.loadData('yourNews_keywords') || { interestWords: [], ngWords: [] };

            console.log(`🧠 AI興味度計算開始: ${articles.length}件`);
            for (const article of articles) {
                try {
                    const score = await window.yourNewsApp.aiEngine.calculateInterestScore(article, keywords);
                    
                    // 【重要】計算結果を確実に記事データに保存
                    article.interestScore = score;
                    console.log(`📊 記事スコア設定: "${article.title.substring(0, 30)}..." = ${score}点`);

                    // NGワード判定
                    if (score === -1) {
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

    // 【緊急修正】フィルター適用（ソート問題完全解決版）
    applyFilters() {
        try {
            console.log(`🔍 フィルター処理開始: 対象 ${this.currentArticles.length}件`);

            // 【重要】currentArticlesの新しいコピーを作成
            let filtered = [...this.currentArticles];
            console.log(`📋 配列コピー完了: ${filtered.length}件`);

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

            // NGワード記事を除外（スコア-1の記事）
            filtered = filtered.filter(article => article.interestScore !== -1);
            console.log(`🚫 NGワード記事除外後: ${filtered.length}件`);

            // 【重要】ソート適用（強制実行・詳細ログ付き）
            console.log('🔄 ソート処理実行前...');
            console.log(`現在のソート設定: ${this.sortBy}`);

            // ソート前の検証
            console.log('ソート前トップ3:');
            filtered.slice(0, 3).forEach((article, index) => {
                console.log(`  ${index + 1}: ${article.interestScore}点 - "${article.title.substring(0, 30)}..."`);
            });

            this.applySorting(filtered);

            // ソート後の検証
            console.log('ソート後トップ3:');
            filtered.slice(0, 3).forEach((article, index) => {
                console.log(`  ${index + 1}: ${article.interestScore}点 - "${article.title.substring(0, 30)}..."`);
            });
            console.log('✅ ソート処理完了');

            // 結果を設定
            this.filteredArticles = filtered;
            console.log(`✅ フィルター処理完了: ${this.filteredArticles.length}件`);

        } catch (error) {
            console.error('🚨 フィルター適用エラー:', error);
            console.error('エラースタック:', error.stack);
            // エラー時は元の配列をそのまま使用
            this.filteredArticles = [...this.currentArticles];
        }
    }

    // 【緊急修正】ソート適用（強制デバッグ・確実実行版）
    applySorting(articles) {
        console.log('🚨 applySorting メソッド開始 - 強制ログ出力');
        try {
            console.log(`📊 ソート処理開始: ${this.sortBy} (対象: ${articles.length}件)`);

            // 【追加】ソート前の状態確認
            console.log('=== ソート前の最初の5件 ===');
            articles.slice(0, 5).forEach((article, index) => {
                console.log(`ソート前${index + 1}: ${article.interestScore}点 - "${article.title.substring(0, 30)}..."`);
            });

            // 【重要】確実なインプレース・ソート
            if (this.sortBy === 'interest') {
                console.log('🔄 AI興味度順ソート実行中...');
                articles.sort((a, b) => {
                    const scoreA = (typeof a.interestScore === 'number') ? a.interestScore : 50;
                    const scoreB = (typeof b.interestScore === 'number') ? b.interestScore : 50;
                    const result = scoreB - scoreA; // 降順（高いスコアが上）

                    // 全ての比較をログ出力（最初の10件のみ）
                    if (articles.indexOf(a) < 10 || articles.indexOf(b) < 10) {
                        console.log(`🔄 ソート比較: ${scoreA}点 vs ${scoreB}点 = ${result} (${scoreA < scoreB ? 'B優先' : scoreA > scoreB ? 'A優先' : '同点'})`);
                    }
                    return result;
                });
            } else {
                // 他のソート処理
                articles.sort((a, b) => {
                    switch (this.sortBy) {
                        case 'date':
                            const dateA = new Date(a.publishDate || a.addedDate);
                            const dateB = new Date(b.publishDate || b.addedDate);
                            return dateB - dateA;
                        case 'domain':
                            return a.domain.localeCompare(b.domain);
                        case 'keyword-match':
                            const matchA = a.matchedKeywords?.length || 0;
                            const matchB = b.matchedKeywords?.length || 0;
                            return matchB - matchA;
                        default:
                            return 0;
                    }
                });
            }

            // 【追加】ソート後の状態確認
            console.log('=== ソート後の最初の5件 ===');
            articles.slice(0, 5).forEach((article, index) => {
                console.log(`ソート後${index + 1}: ${article.interestScore}点 - "${article.title.substring(0, 30)}..."`);
            });

            console.log(`✅ ソート完了 (${this.sortBy}): ${articles.length}件`);
        } catch (error) {
            console.error('🚨 ソート処理エラー:', error);
            console.error('エラースタック:', error.stack);
            // エラー時はデフォルトソートを試行
            try {
                console.log('🔧 デフォルトソート実行中...');
                articles.sort((a, b) => (b.interestScore || 50) - (a.interestScore || 50));
                console.log('✅ デフォルトソートで復旧しました');
            } catch (fallbackError) {
                console.error('🚨 デフォルトソートも失敗:', fallbackError);
            }
        }
        console.log('🚨 applySorting メソッド終了 - 強制ログ出力');
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

        // 【修正】興味度スコアの確実な取得
        const interestScore = article.interestScore !== undefined ? article.interestScore : 50;
        console.log(`🎯 カード生成時スコア: "${article.title.substring(0, 30)}..." = ${interestScore}点 (データ値: ${article.interestScore})`);

        const scoreClass = interestScore >= 70 ? 'score-high' :
                          interestScore >= 40 ? 'score-medium' : 'score-low';

        const keywordsHtml = article.matchedKeywords?.length > 0 ? 
            `<div class="matched-keywords">
                ${article.matchedKeywords.slice(0, 3).map(k => 
                    `<span class="keyword-highlight">${k}</span>`
                ).join('')}
                ${article.matchedKeywords.length > 3 ? 
                    `<span class="keyword-more">+${article.matchedKeywords.length - 3}</span>` : ''}
            </div>` : '';

        cardDiv.innerHTML = `
            <div class="card-header">
                <div class="interest-score ${scoreClass}">${interestScore}点</div>
                ${keywordsHtml}
            </div>
            <div class="card-meta">
                <span class="domain">${article.domain}</span>
                <span class="publish-date">${this.formatDate(article.publishDate)}</span>
                <span class="category">${article.category}</span>
            </div>
            <div class="card-content">
                <h3 class="article-title" onclick="openArticle('${article.articleId}')">${article.title}</h3>
                <p class="article-excerpt">${article.excerpt}</p>
            </div>
            <div class="card-actions">
                <div class="feedback-buttons">
                    <button class="feedback-btn interest" onclick="processFeedback('${article.articleId}', 1)">
                        👍 興味あり
                    </button>
                    <button class="feedback-btn disinterest" onclick="processFeedback('${article.articleId}', -1)">
                        👎 興味なし
                    </button>
                </div>
                <div class="card-actions-right">
                    <button class="favorite-btn ${article.favorited ? 'active' : ''}" onclick="toggleFavorite('${article.articleId}')">
                        ⭐ ${article.favorited ? 'お気に入り済み' : 'お気に入り'}
                    </button>
                    <button class="read-toggle-btn" data-read="${article.readStatus === 'read'}" onclick="toggleReadStatus('${article.articleId}')">
                        ${article.readStatus === 'read' ? '✅ 既読' : '📖 未読'}
                    </button>
                </div>
            </div>
        `;

        return cardDiv;
    }

    // 空状態表示
    showEmptyState() {
        const container = document.getElementById('articlesContainer');
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📰</div>
                    <h3>記事がありません</h3>
                    <p>${this.getEmptyStateMessage()}</p>
                    <button class="btn btn-primary" onclick="yourNewsApp.refreshArticles()">
                        🔄 記事を更新
                    </button>
                </div>
            `;
        }
    }

    getEmptyStateMessage() {
        if (this.currentArticles.length === 0) {
            return 'RSSフィードを追加するか、フィルターを変更してください。';
        }
        return 'フィルター条件に一致する記事がありません。フィルターを変更してください。';
    }

    // 統計更新
    updateStats() {
        try {
            const totalCount = this.currentArticles.length;
            const unreadCount = this.currentArticles.filter(a => a.readStatus !== 'read').length;
            const favoriteCount = this.currentArticles.filter(a => a.favorited).length;

            // UI更新
            const totalElement = document.querySelector('.stats .total-count');
            const displayElement = document.querySelector('.stats .display-count');
            const unreadElement = document.querySelector('.stats .unread-count');
            const favoriteElement = document.querySelector('.stats .favorite-count');

            if (totalElement) totalElement.textContent = totalCount;
            if (displayElement) displayElement.textContent = this.filteredArticles.length;
            if (unreadElement) unreadElement.textContent = unreadCount;
            if (favoriteElement) favoriteElement.textContent = favoriteCount;

        } catch (error) {
            console.error('統計更新エラー:', error);
        }
    }

    // 日付フォーマット
    formatDate(dateString) {
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffMinutes = Math.floor(diffMs / (1000 * 60));
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            if (diffMinutes < 1) return '今';
            if (diffMinutes < 60) return `${diffMinutes}分前`;
            if (diffHours < 24) return `${diffHours}時間前`;
            if (diffDays < 7) return `${diffDays}日前`;
            return date.toLocaleDateString('ja-JP');
        } catch (error) {
            return '不明';
        }
    }

    // カテゴリフィルター
    filterByCategory(category) {
        this.filterCategory = category;
        this.applyFilters();
        this.renderArticles();
        this.updateStats();
    }

    // 既読状態フィルター
    filterByReadStatus(status) {
        this.filterReadStatus = status;
        this.applyFilters();
        this.renderArticles();
        this.updateStats();
    }

    // ソート
    sortArticles(sortBy) {
        this.sortBy = sortBy;
        this.applyFilters();
        this.renderArticles();
    }

    // エラーメッセージ表示
    showErrorMessage(message) {
        if (window.yourNewsApp) {
            window.yourNewsApp.showNotification(message, 'error');
        } else {
            console.error(message);
        }
    }

    // イベントリスナー設定
    setupEventListeners() {
        // 実装省略（NGドメイン関連なし）
    }

    // 記事イベントリスナー再設定
    attachArticleEventListeners() {
        // 実装省略（NGドメイン関連なし）
    }
}
