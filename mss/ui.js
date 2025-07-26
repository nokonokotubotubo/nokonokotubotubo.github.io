// Minews PWA - UI・表示レイヤー
(function() {
    'use strict';

    // ===========================================
    // アプリケーション状態管理
    // ===========================================
    window.state = {
        viewMode: 'all',
        selectedSource: 'all', // selectedFolder → selectedSource に変更
        showModal: null,
        articles: [],
        isLoading: false,
        lastUpdate: null
    };

    window.setState = (newState) => {
        window.state = { ...window.state, ...newState };
        window.render();
    };

    const initializeData = () => {
        const articlesData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.ARTICLES, window.DEFAULT_DATA.articles);
        const rssData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.RSS_FEEDS, window.DEFAULT_DATA.rssFeeds);
        const aiData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, window.DEFAULT_DATA.aiLearning);
        const wordData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, window.DEFAULT_DATA.wordFilters);

        // フィルタ設定の読み込み
        const viewSettings = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.VIEW_SETTINGS, {
            viewMode: 'all',
            selectedSource: 'all' // selectedFolder → selectedSource に変更
        });

        Object.assign(window.DataHooksCache, {
            articles: articlesData,
            rssFeeds: rssData,
            aiLearning: aiData,
            wordFilters: wordData
        });

        window.state.articles = articlesData;
        window.state.viewMode = viewSettings.viewMode;
        window.state.selectedSource = viewSettings.selectedSource; // selectedFolder → selectedSource に変更

        if (window.state.articles.length === 0) {
            const sampleArticles = [
                {
                    id: 'sample_1',
                    title: 'Minews PWA：フィード提供元フィルタ機能追加完了',
                    url: '#',
                    content: 'RSSフィードを提供元で分類管理し、記事表示も提供元でフィルタリングできる機能を追加しました。ユーザビリティも向上。',
                    publishDate: new Date().toISOString(),
                    rssSource: 'NHKニュース',
                    category: 'Design',
                    readStatus: 'unread',
                    readLater: false,
                    userRating: 0,
                    keywords: ['フィード', 'RSS', 'フィルタ', '機能追加']
                },
                {
                    id: 'sample_2',
                    title: '提供元管理で記事整理が便利に',
                    url: '#',
                    content: 'ニュース、テック、ブログなど提供元別にRSSフィードを分類。記事表示も提供元単位でフィルタリングでき、情報収集効率が大幅向上。',
                    publishDate: new Date(Date.now() - 3600000).toISOString(),
                    rssSource: 'ITmedia',
                    category: 'UX',
                    readStatus: 'unread',
                    readLater: false,
                    userRating: 0,
                    keywords: ['提供元管理', '記事整理', '分類', 'フィルタリング', '効率化']
                }
            ];

            const articlesHook = window.DataHooks.useArticles();
            sampleArticles.forEach(article => articlesHook.addArticle(article));
            window.state.articles = window.DataHooksCache.articles;
        }
    };

    // ===========================================
    // ユーティリティ関数
    // ===========================================
    window.formatDate = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = now - date;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor(diffTime / (1000 * 60 * 60));

        if (diffHours < 1) return '1時間以内';
        if (diffHours < 24) return `${diffHours}時間前`;
        if (diffDays === 1) return '昨日';
        if (diffDays < 7) return `${diffDays}日前`;
        return date.toLocaleDateString('ja-JP');
    };

    window.createStarRating = (rating, articleId) => {
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            const filled = i <= rating ? 'filled' : '';
            stars += `<span class="star ${filled}" onclick="handleRateArticle('${articleId}', ${i})">★</span>`;
        }
        return `<div class="star-rating">${stars}</div>`;
    };

    window.truncateText = (text, maxLength = 200) => text.length <= maxLength ? text : text.substring(0, maxLength).trim() + '...';

    // XMLエスケープ関数
    window.escapeXml = (text) => {
        return text.replace(/[<>&'"]/g, (char) => {
            switch (char) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '"': return '&quot;';
                case "'": return '&#39;';
                default: return char;
            }
        });
    };

    // ===========================================
    // データ管理機能
    // ===========================================
    // 学習データエクスポート
    window.handleExportLearningData = () => {
        const aiHook = window.DataHooks.useAILearning();
        const wordHook = window.DataHooks.useWordFilters();
        
        const exportData = {
            version: window.CONFIG.DATA_VERSION,
            exportDate: new Date().toISOString(),
            aiLearning: aiHook.aiLearning,
            wordFilters: wordHook.wordFilters
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `minews_learning_data_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        alert('学習データをエクスポートしました');
    };

    // 学習データインポート
    window.handleImportLearningData = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importData = JSON.parse(e.target.result);
                if (!importData.aiLearning || !importData.wordFilters) {
                    throw new Error('無効なデータ形式です');
                }

                const aiHook = window.DataHooks.useAILearning();
                const wordHook = window.DataHooks.useWordFilters();

                // AI学習データのマージ
                Object.keys(importData.aiLearning.wordWeights || {}).forEach(word => {
                    const weight = importData.aiLearning.wordWeights[word];
                    aiHook.updateWordWeight(word, weight);
                });

                Object.keys(importData.aiLearning.categoryWeights || {}).forEach(category => {
                    const weight = importData.aiLearning.categoryWeights[category];
                    aiHook.updateCategoryWeight(category, weight);
                });

                // ワードフィルターのマージ
                (importData.wordFilters.interestWords || []).forEach(word => {
                    wordHook.addInterestWord(word);
                });

                (importData.wordFilters.ngWords || []).forEach(word => {
                    wordHook.addNGWord(word);
                });

                alert('学習データをインポートしました');
                window.render();
            } catch (error) {
                alert('インポートに失敗しました: ' + error.message);
            }
        };
        reader.readAsText(file);
        
        // ファイル選択をリセット
        event.target.value = '';
    };

    // ===========================================
    // 記事フィルタリング機能
    // ===========================================
    // 記事フィルタリング関数
    window.getFilteredArticles = () => {
        const { articles, viewMode, selectedSource } = window.state;
        const aiHook = window.DataHooks.useAILearning();
        const wordHook = window.DataHooks.useWordFilters();

        let filtered = [...articles];

        // NGワードフィルター
        filtered = window.AIScoring.filterArticles(filtered, wordHook.wordFilters);

        // 読み状態フィルター
        if (viewMode === 'unread') {
            filtered = filtered.filter(article => article.readStatus === 'unread');
        } else if (viewMode === 'read') {
            filtered = filtered.filter(article => article.readStatus === 'read');
        } else if (viewMode === 'readLater') {
            filtered = filtered.filter(article => article.readLater);
        }

        // ソースフィルター（フォルダフィルターの代わり）
        if (selectedSource && selectedSource !== 'all') {
            filtered = filtered.filter(article => article.rssSource === selectedSource);
        }

        // AIスコアによるソート
        return window.AIScoring.sortArticlesByScore(filtered, aiHook.aiLearning, wordHook.wordFilters);
    };

    // ===========================================
    // UI レンダリング機能
    // ===========================================
    // ナビゲーション表示関数
    window.renderNavigation = () => {
        const { viewMode, selectedSource, isLoading, lastUpdate } = window.state;
        
        // 利用可能なソース一覧を取得
        const availableSources = ['all', ...new Set(window.state.articles.map(article => article.rssSource))];
        
        return `
            <nav class="nav">
                <div class="nav-left">
                    <h1>📰 Minews</h1>
                    ${lastUpdate ? `<div class="last-update">最終更新: ${window.formatDate(lastUpdate)}</div>` : ''}
                </div>
                <div class="nav-filters">
                    <div class="filter-group">
                        <label>表示:</label>
                        <select class="filter-select" onchange="handleViewModeChange(this.value)">
                            <option value="all" ${viewMode === 'all' ? 'selected' : ''}>全て</option>
                            <option value="unread" ${viewMode === 'unread' ? 'selected' : ''}>未読のみ</option>
                            <option value="read" ${viewMode === 'read' ? 'selected' : ''}>既読のみ</option>
                            <option value="readLater" ${viewMode === 'readLater' ? 'selected' : ''}>後で読む</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>提供元:</label>
                        <select class="filter-select" onchange="handleSourceChange(this.value)">
                            ${availableSources.map(source => 
                                `<option value="${source}" ${selectedSource === source ? 'selected' : ''}>
                                    ${source === 'all' ? '全て' : source}
                                </option>`
                            ).join('')}
                        </select>
                    </div>
                </div>
                <div class="nav-actions">
                    <button class="action-btn refresh-btn ${isLoading ? 'loading' : ''}" 
                            onclick="handleRefreshArticles()" ${isLoading ? 'disabled' : ''}>
                        ${isLoading ? '更新中...' : '更新'}
                    </button>
                    <button class="action-btn" onclick="handleShowModal('wordManager')">
                        ワード管理
                    </button>
                    <button class="action-btn" onclick="handleShowModal('settings')">
                        設定
                    </button>
                </div>
            </nav>
        `;
    };

    // 記事一覧表示
    window.renderArticleList = () => {
        const filteredArticles = window.getFilteredArticles();
        
        if (filteredArticles.length === 0) {
            return `
                <div class="empty-message">
                    <p>表示する記事がありません</p>
                    <p>フィルターを変更するか、記事を更新してください</p>
                </div>
            `;
        }

        return `
            <div class="article-grid">
                ${filteredArticles.map(article => window.renderArticleCard(article)).join('')}
            </div>
        `;
    };

    // 記事カード表示
    window.renderArticleCard = (article) => {
        return `
            <div class="article-card" data-read-status="${article.readStatus}" data-id="${article.id}">
                <div class="article-header">
                    <h3 class="article-title">
                        <a href="${article.url}" target="_blank" onclick="handleMarkRead('${article.id}')">${window.escapeXml(article.title)}</a>
                    </h3>
                    <div class="article-meta">
                        <span class="date">${window.formatDate(article.publishDate)}</span>
                        <span class="source">${window.escapeXml(article.rssSource)}</span>
                        <span class="category">${window.escapeXml(article.category)}</span>
                        <span class="ai-score">AI: ${article.aiScore || 0}</span>
                        ${article.userRating > 0 ? `<span class="rating-badge">★${article.userRating}</span>` : ''}
                    </div>
                </div>
                <div class="article-content">
                    ${window.escapeXml(window.truncateText(article.content))}
                </div>
                ${article.keywords && article.keywords.length > 0 ? `
                    <div class="article-keywords">
                        ${article.keywords.map(keyword => `<span class="keyword">${window.escapeXml(keyword)}</span>`).join('')}
                    </div>
                ` : ''}
                ${window.renderArticleActions(article)}
                ${window.createStarRating(article.userRating, article.id)}
            </div>
        `;
    };

    // 記事アクション表示関数（削除ボタンを削除）
    window.renderArticleActions = (article) => {
        return `
            <div class="article-actions">
                <button class="simple-btn read-status" onclick="handleToggleRead('${article.id}')">
                    ${article.readStatus === 'read' ? '未読' : '既読'}
                </button>
                <button class="simple-btn read-later ${article.readLater ? 'active' : ''}" 
                        data-active="${article.readLater}" onclick="handleToggleReadLater('${article.id}')">
                    ${article.readLater ? '通常' : '後読'}
                </button>
            </div>
        `;
    };

    // モーダル表示
    window.renderModal = () => {
        const { showModal } = window.state;
        if (!showModal) return '';

        const modals = {
            wordManager: window.renderWordManagerModal,
            settings: window.renderSettingsModal
        };

        const renderFunction = modals[showModal];
        if (!renderFunction) return '';

        return `
            <div class="modal-overlay" onclick="handleCloseModal()">
                <div class="modal" onclick="event.stopPropagation()">
                    ${renderFunction()}
                </div>
            </div>
        `;
    };

    // ワード管理モーダル
    window.renderWordManagerModal = () => {
        const wordHook = window.DataHooks.useWordFilters();
        
        return `
            <div class="modal-header">
                <h2>ワード管理</h2>
                <button class="modal-close" onclick="handleCloseModal()">×</button>
            </div>
            <div class="modal-body">
                <div class="word-section">
                    <div class="word-section-header">
                        <h3>興味ワード</h3>
                        <input type="text" id="interestWordInput" placeholder="興味ワードを入力" onkeypress="handleWordInputKeypress(event, 'interest')">
                        <button class="action-btn success" onclick="handleAddWord('interest')">追加</button>
                    </div>
                    <div class="word-list">
                        ${wordHook.wordFilters.interestWords.map(word => 
                            `<span class="word-tag interest">
                                ${window.escapeXml(word)}
                                <button class="word-remove" onclick="handleRemoveWord('${word}', 'interest')">×</button>
                            </span>`
                        ).join('')}
                    </div>
                </div>
                
                <div class="word-section">
                    <div class="word-section-header">
                        <h3>NGワード</h3>
                        <input type="text" id="ngWordInput" placeholder="NGワードを入力" onkeypress="handleWordInputKeypress(event, 'ng')">
                        <button class="action-btn danger" onclick="handleAddWord('ng')">追加</button>
                    </div>
                    <div class="word-list">
                        ${wordHook.wordFilters.ngWords.map(word => 
                            `<span class="word-tag ng">
                                ${window.escapeXml(word)}
                                <button class="word-remove" onclick="handleRemoveWord('${word}', 'ng')">×</button>
                            </span>`
                        ).join('')}
                    </div>
                </div>

                <div class="word-help">
                    <h4>ワードフィルター機能について</h4>
                    <ul>
                        <li><strong>興味ワード:</strong> 含まれる記事のAIスコアが上がります</li>
                        <li><strong>NGワード:</strong> 含まれる記事は表示されません</li>
                        <li>大文字・小文字は区別されません</li>
                        <li>部分一致で判定されます</li>
                    </ul>
                </div>
            </div>
        `;
    };

    // 設定モーダル
    window.renderSettingsModal = () => {
        const storageInfo = window.LocalStorageManager.getStorageInfo();
        
        return `
            <div class="modal-header">
                <h2>設定</h2>
                <button class="modal-close" onclick="handleCloseModal()">×</button>
            </div>
            <div class="modal-body">
                <div class="modal-actions">
                    <h3>学習データ管理</h3>
                    <p>AIの学習データとワードフィルターをバックアップ・復元できます。</p>
                    <button class="action-btn success" onclick="handleExportLearningData()">
                        学習データをエクスポート
                    </button>
                    <input type="file" id="importLearningData" accept=".json" onchange="handleImportLearningData(event)" style="display: none;">
                    <button class="action-btn" onclick="document.getElementById('importLearningData').click()">
                        学習データをインポート
                    </button>
                </div>

                <div class="modal-actions">
                    <h3>ストレージ情報</h3>
                    <p>使用量: ${Math.round(storageInfo.totalSize / 1024)}KB / 5MB</p>
                    <p>保存項目数: ${storageInfo.itemCount}個</p>
                </div>

                <div class="modal-actions">
                    <h3>アプリケーション情報</h3>
                    <p>Version: ${window.CONFIG.DATA_VERSION}</p>
                    <p>GitHub Actions対応版</p>
                </div>
            </div>
        `;
    };

    // ===========================================
    // イベントハンドラー
    // ===========================================
    // ソース変更ハンドラー（フォルダ変更ハンドラーの代わり）
    window.handleSourceChange = (source) => {
        window.setState({ selectedSource: source });
        
        // 設定を保存
        const currentSettings = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.VIEW_SETTINGS, {});
        window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.VIEW_SETTINGS, {
            ...currentSettings,
            selectedSource: source
        });
    };

    // 表示モード変更ハンドラー
    window.handleViewModeChange = (mode) => {
        window.setState({ viewMode: mode });
        
        // 設定を保存
        const currentSettings = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.VIEW_SETTINGS, {});
        window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.VIEW_SETTINGS, {
            ...currentSettings,
            viewMode: mode
        });
    };

    // 記事更新
    window.handleRefreshArticles = async () => {
        window.setState({ isLoading: true });
        try {
            const rssHook = window.DataHooks.useRSSManager();
            const result = await rssHook.fetchAllFeeds();
            window.setState({ 
                isLoading: false,
                lastUpdate: new Date(),
                articles: window.DataHooksCache.articles
            });
            alert(`記事を更新しました\n追加: ${result.totalAdded}件`);
        } catch (error) {
            window.setState({ isLoading: false });
            alert('記事の更新に失敗しました: ' + error.message);
        }
    };

    // 既読状態切り替え
    window.handleToggleRead = (articleId) => {
        const articlesHook = window.DataHooks.useArticles();
        const article = window.state.articles.find(a => a.id === articleId);
        if (article) {
            const newStatus = article.readStatus === 'read' ? 'unread' : 'read';
            articlesHook.updateArticle(articleId, { readStatus: newStatus });
        }
    };

    // 後で読む切り替え
    window.handleToggleReadLater = (articleId) => {
        const articlesHook = window.DataHooks.useArticles();
        const article = window.state.articles.find(a => a.id === articleId);
        if (article) {
            articlesHook.updateArticle(articleId, { readLater: !article.readLater });
        }
    };

    // 記事評価
    window.handleRateArticle = (articleId, rating) => {
        const articlesHook = window.DataHooks.useArticles();
        const aiHook = window.DataHooks.useAILearning();
        const article = window.state.articles.find(a => a.id === articleId);
        
        if (article) {
            const oldRating = article.userRating;
            
            // 前の評価を取り消し
            if (oldRating > 0) {
                aiHook.updateLearningData(article, oldRating, true);
            }
            
            // 新しい評価を適用
            if (rating > 0) {
                aiHook.updateLearningData(article, rating, false);
            }
            
            articlesHook.updateArticle(articleId, { userRating: rating });
        }
    };

    // 既読マーク
    window.handleMarkRead = (articleId) => {
        const articlesHook = window.DataHooks.useArticles();
        articlesHook.updateArticle(articleId, { readStatus: 'read' });
    };

    // モーダル表示
    window.handleShowModal = (modalType) => {
        window.setState({ showModal: modalType });
    };

    // モーダル閉じる
    window.handleCloseModal = () => {
        window.setState({ showModal: null });
    };

    // ワード追加
    window.handleAddWord = (type) => {
        const inputId = type === 'interest' ? 'interestWordInput' : 'ngWordInput';
        const input = document.getElementById(inputId);
        const word = input.value.trim();
        
        if (!word) return;
        
        const wordHook = window.DataHooks.useWordFilters();
        const success = type === 'interest' ? 
            wordHook.addInterestWord(word) : 
            wordHook.addNGWord(word);
        
        if (success) {
            input.value = '';
            window.render();
        } else {
            alert('既に登録されているワードです');
        }
    };

    // ワード削除
    window.handleRemoveWord = (word, type) => {
        const wordHook = window.DataHooks.useWordFilters();
        const success = type === 'interest' ? 
            wordHook.removeInterestWord(word) : 
            wordHook.removeNGWord(word);
        
        if (success) {
            window.render();
        }
    };

    // ワード入力エンターキー処理
    window.handleWordInputKeypress = (event, type) => {
        if (event.key === 'Enter') {
            window.handleAddWord(type);
        }
    };

    // ===========================================
    // メインレンダリング・初期化
    // ===========================================
    window.render = () => {
        const app = document.getElementById('app');
        if (!app) return;

        app.innerHTML = `
            ${window.renderNavigation()}
            <div class="main-content">
                ${window.renderArticleList()}
            </div>
            ${window.renderModal()}
        `;
    };

    // アプリ初期化
    window.initApp = () => {
        initializeData();
        window.render();
    };

    // DOMContentLoaded時に初期化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', window.initApp);
    } else {
        window.initApp();
    }

})();
