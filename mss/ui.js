// Minews PWA - UI・表示レイヤー
(function() {
    'use strict';

    // ===========================================
    // アプリケーション状態管理
    // ===========================================

    window.state = {
        viewMode: 'all',
        selectedFolder: 'all',
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
        const foldersData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.FOLDERS, window.DEFAULT_DATA.folders);
        const aiData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, window.DEFAULT_DATA.aiLearning);
        const wordData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, window.DEFAULT_DATA.wordFilters);
        
        // フィルタ設定の読み込み
        const viewSettings = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.VIEW_SETTINGS, {
            viewMode: 'all',
            selectedFolder: 'all'
        });

        Object.assign(window.DataHooksCache, {
            articles: articlesData,
            rssFeeds: rssData,
            folders: foldersData,
            aiLearning: aiData,
            wordFilters: wordData
        });

        window.state.articles = articlesData;
        window.state.viewMode = viewSettings.viewMode;
        window.state.selectedFolder = viewSettings.selectedFolder;

        if (window.state.articles.length === 0) {
            const sampleArticles = [
                {
                    id: 'sample_1',
                    title: 'Minews PWA：フォルダ機能追加完了',
                    url: '#',
                    content: 'RSSフィードをフォルダで分類管理し、記事表示もフォルダでフィルタリングできる機能を追加しました。リスト選択モーダルによりユーザビリティも向上。',
                    publishDate: new Date().toISOString(),
                    rssSource: 'NHKニュース',
                    category: 'Design',
                    readStatus: 'unread',
                    readLater: false,
                    userRating: 0,
                    keywords: ['フォルダ', 'RSS', 'リスト選択', '機能追加']
                },
                {
                    id: 'sample_2',
                    title: 'フォルダ管理で記事整理が便利に',
                    url: '#',
                    content: 'ニュース、テック、ブログなど用途別にRSSフィードを分類。記事表示もフォルダ単位でフィルタリングでき、情報収集効率が大幅向上。',
                    publishDate: new Date(Date.now() - 3600000).toISOString(),
                    rssSource: 'ITmedia',
                    category: 'UX',
                    readStatus: 'unread',
                    readLater: false,
                    userRating: 0,
                    keywords: ['フォルダ管理', '記事整理', '分類', 'フィルタリング', '効率化']
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
            stars += `<span class="star ${filled}" data-rating="${i}" data-article-id="${articleId}">★</span>`;
        }
        return `<div class="star-rating" data-article-id="${articleId}">${stars}</div>`;
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

    // RSSデータエクスポート（OPML形式）
    window.handleExportRSSData = () => {
        const rssHook = window.DataHooks.useRSSManager();
        const foldersHook = window.DataHooks.useFolders();

        let opmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
    <head>
        <title>Minews RSS Feeds Export</title>
        <dateCreated>${new Date().toISOString()}</dateCreated>
    </head>
    <body>`;

        // フォルダごとにグループ化
        const folderGroups = {};
        rssHook.rssFeeds.forEach(feed => {
            const folder = foldersHook.folders.find(f => f.id === feed.folderId);
            const folderName = folder ? folder.name : 'uncategorized';
            
            if (!folderGroups[folderName]) {
                folderGroups[folderName] = [];
            }
            folderGroups[folderName].push(feed);
        });

        Object.keys(folderGroups).forEach(folderName => {
            opmlContent += `
        <outline text="${window.escapeXml(folderName)}" title="${window.escapeXml(folderName)}">`;
            
            folderGroups[folderName].forEach(feed => {
                opmlContent += `
            <outline text="${window.escapeXml(feed.title)}" 
                     title="${window.escapeXml(feed.title)}" 
                     xmlUrl="${window.escapeXml(feed.url)}" 
                     type="rss" />`;
            });
            
            opmlContent += `
        </outline>`;
        });

        opmlContent += `
    </body>
</opml>`;

        const dataBlob = new Blob([opmlContent], { type: 'application/xml' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `minews_rss_feeds_${new Date().toISOString().split('T')[0]}.opml`;
        link.click();

        alert('RSSフィードをOPML形式でエクスポートしました');
    };

    // ===========================================
    // フィルタ・イベントハンドラ
    // ===========================================

    const handleFilterChange = (mode) => {
        setState({ viewMode: mode });
        
        // フィルタ設定をLocalStorageに保存
        const currentSettings = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.VIEW_SETTINGS, {
            viewMode: 'all',
            selectedFolder: 'all'
        });
        window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.VIEW_SETTINGS, {
            ...currentSettings,
            viewMode: mode
        });
    };

    const handleFolderChange = (folderId) => {
        setState({ selectedFolder: folderId });
        
        // フィルタ設定をLocalStorageに保存
        const currentSettings = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.VIEW_SETTINGS, {
            viewMode: 'all',
            selectedFolder: 'all'
        });
        window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.VIEW_SETTINGS, {
            ...currentSettings,
            selectedFolder: folderId
        });
    };

    const handleRefresh = async () => {
        setState({ isLoading: true });
        try {
            // GitHub Pages版では外部JSON読み込み
            if (typeof window.loadArticlesFromJSON === 'function') {
                await window.loadArticlesFromJSON();
            } else {
                // フォールバック: RSS再取得
                const rssHook = window.DataHooks.useRSSManager();
                const result = await rssHook.fetchAllFeeds();
                alert(`記事を更新しました（追加: ${result.totalAdded}件、エラー: ${result.totalErrors}件）`);
            }
            setState({ lastUpdate: new Date() });
        } catch (error) {
            alert('記事の更新に失敗しました: ' + error.message);
        } finally {
            setState({ isLoading: false });
        }
    };

    // ===========================================
    // 記事操作
    // ===========================================

    const handleArticleClick = (event, articleId, actionType) => {
        event.preventDefault();
        event.stopPropagation();

        const articlesHook = window.DataHooks.useArticles();
        const article = articlesHook.articles.find(a => a.id === articleId);
        
        if (!article) return;

        switch (actionType) {
            case 'read':
                const newReadStatus = article.readStatus === 'read' ? 'unread' : 'read';
                articlesHook.updateArticle(articleId, { readStatus: newReadStatus });
                break;

            case 'readLater':
                articlesHook.updateArticle(articleId, { readLater: !article.readLater });
                break;

            case 'delete':
                if (confirm('この記事を削除しますか？')) {
                    articlesHook.removeArticle(articleId);
                }
                break;

            case 'rating':
                const rating = parseInt(event.target.getAttribute('data-rating'));
                if (rating) {
                    // 既存の評価を取り消す場合のAI学習データ更新
                    if (article.userRating > 0) {
                        const aiHook = window.DataHooks.useAILearning();
                        aiHook.updateLearningData(article, article.userRating, true);
                    }

                    // 新しい評価でAI学習データ更新
                    if (rating > 0) {
                        const aiHook = window.DataHooks.useAILearning();
                        aiHook.updateLearningData(article, rating, false);
                    }

                    articlesHook.updateArticle(articleId, { userRating: rating });
                }
                break;
        }
    };

    // ===========================================
    // モーダル管理
    // ===========================================

    const handleCloseModal = () => {
        setState({ showModal: null });
    };

    const handleOpenModal = (modalType) => {
        setState({ showModal: modalType });
    };

    // ===========================================
    // ワード管理
    // ===========================================

    const handleAddWord = (type) => {
        const word = prompt(type === 'interest' ? '興味ワードを入力してください:' : 'NGワードを入力してください:');
        if (!word || !word.trim()) return;

        const wordHook = window.DataHooks.useWordFilters();
        const success = type === 'interest' 
            ? wordHook.addInterestWord(word.trim())
            : wordHook.addNGWord(word.trim());

        if (success) {
            window.render();
        } else {
            alert('そのワードは既に登録されています');
        }
    };

    const handleRemoveWord = (word, type) => {
        if (!confirm(`「${word}」を削除しますか？`)) return;

        const wordHook = window.DataHooks.useWordFilters();
        const success = type === 'interest' 
            ? wordHook.removeInterestWord(word)
            : wordHook.removeNGWord(word);

        if (success) {
            window.render();
        }
    };

    // ===========================================
    // レンダリング
    // ===========================================

    const renderNavigation = () => {
        const foldersHook = window.DataHooks.useFolders();
        const folderOptions = [
            '<option value="all">全フォルダ</option>',
            ...foldersHook.folders.map(folder => 
                `<option value="${folder.id}" ${window.state.selectedFolder === folder.id ? 'selected' : ''}>${folder.name}</option>`
            )
        ].join('');

        return `
            <nav class="nav">
                <div class="nav-left">
                    <h1>Minews</h1>
                    ${window.state.lastUpdate ? `<div class="last-update">最終更新: ${window.formatDate(window.state.lastUpdate)}</div>` : ''}
                </div>
                
                <div class="nav-filters">
                    <div class="filter-group">
                        <label for="viewFilter">表示:</label>
                        <select id="viewFilter" class="filter-select" onchange="handleFilterChange(this.value)">
                            <option value="all" ${window.state.viewMode === 'all' ? 'selected' : ''}>全て</option>
                            <option value="unread" ${window.state.viewMode === 'unread' ? 'selected' : ''}>未読のみ</option>
                            <option value="read" ${window.state.viewMode === 'read' ? 'selected' : ''}>既読のみ</option>
                            <option value="readLater" ${window.state.viewMode === 'readLater' ? 'selected' : ''}>後で読む</option>
                        </select>
                    </div>
                    
                    <div class="filter-group">
                        <label for="folderFilter">フォルダ:</label>
                        <select id="folderFilter" class="filter-select" onchange="handleFolderChange(this.value)">
                            ${folderOptions}
                        </select>
                    </div>
                </div>

                <div class="nav-actions">
                    <button class="action-btn refresh-btn ${window.state.isLoading ? 'loading' : ''}" 
                            onclick="handleRefresh()" 
                            ${window.state.isLoading ? 'disabled' : ''}>
                        ${window.state.isLoading ? '更新中...' : '記事更新'}
                    </button>
                    <button class="action-btn" onclick="handleOpenModal('words')">ワード管理</button>
                    <button class="action-btn" onclick="handleOpenModal('settings')">設定</button>
                </div>
            </nav>
        `;
    };

    const getFilteredArticles = () => {
        let filtered = [...window.state.articles];

        // フォルダフィルター
        if (window.state.selectedFolder !== 'all') {
            const rssHook = window.DataHooks.useRSSManager();
            const folderFeeds = rssHook.rssFeeds.filter(feed => feed.folderId === window.state.selectedFolder);
            const folderFeedTitles = folderFeeds.map(feed => feed.title);
            
            filtered = filtered.filter(article => {
                return folderFeedTitles.some(feedTitle => 
                    article.rssSource === feedTitle ||
                    article.rssSource.includes(feedTitle) ||
                    feedTitle.includes(article.rssSource) ||
                    window.FolderManager.extractDomainFromSource(article.rssSource) === 
                    window.FolderManager.extractDomainFromUrl(folderFeeds.find(f => f.title === feedTitle)?.url || '')
                );
            });
        }

        // 表示モードフィルター
        switch (window.state.viewMode) {
            case 'unread':
                filtered = filtered.filter(article => article.readStatus === 'unread');
                break;
            case 'read':
                filtered = filtered.filter(article => article.readStatus === 'read');
                break;
            case 'readLater':
                filtered = filtered.filter(article => article.readLater);
                break;
        }

        // NGワードフィルター
        const wordHook = window.DataHooks.useWordFilters();
        filtered = window.WordFilterManager.filterArticles(filtered, wordHook.wordFilters);

        // AIスコア計算とソート
        const aiHook = window.DataHooks.useAILearning();
        return window.AIScoring.sortArticlesByScore(filtered, aiHook.aiLearning, wordHook.wordFilters);
    };

    const renderArticleCard = (article) => {
        const keywords = (article.keywords || []).map(keyword => 
            `<span class="keyword">${keyword}</span>`
        ).join('');

        return `
            <div class="article-card" data-read-status="${article.readStatus}">
                <div class="article-header">
                    <h3 class="article-title">
                        <a href="${article.url}" target="_blank" rel="noopener noreferrer">
                            ${article.title}
                        </a>
                    </h3>
                    
                    <div class="article-meta">
                        <span class="date">${window.formatDate(article.publishDate)}</span>
                        <span class="source">${article.rssSource}</span>
                        <span class="category">${article.category}</span>
                        <span class="ai-score">AI: ${article.aiScore || 0}</span>
                        ${article.userRating > 0 ? `<span class="rating-badge">★${article.userRating}</span>` : ''}
                    </div>
                </div>

                <div class="article-content">
                    ${window.truncateText(article.content)}
                </div>

                ${keywords ? `<div class="article-keywords">${keywords}</div>` : ''}

                <div class="article-actions">
                    <button class="simple-btn read-status" 
                            onclick="handleArticleClick(event, '${article.id}', 'read')">
                        ${article.readStatus === 'read' ? '未読' : '既読'}
                    </button>
                    <button class="simple-btn read-later" 
                            data-active="${article.readLater}"
                            onclick="handleArticleClick(event, '${article.id}', 'readLater')">
                        ${article.readLater ? '解除' : '後で'}
                    </button>
                    <button class="simple-btn" 
                            onclick="handleArticleClick(event, '${article.id}', 'delete')">
                        削除
                    </button>
                </div>

                ${window.createStarRating(article.userRating, article.id)}
            </div>
        `;
    };

    const renderArticleList = () => {
        const articles = getFilteredArticles();

        if (articles.length === 0) {
            return '<div class="empty-message">表示する記事がありません</div>';
        }

        return `
            <div class="article-grid">
                ${articles.map(renderArticleCard).join('')}
            </div>
        `;
    };

    const renderWordModal = () => {
        const wordHook = window.DataHooks.useWordFilters();
        
        const interestWords = wordHook.wordFilters.interestWords.map(word => 
            `<span class="word-tag interest">
                ${word}
                <button class="word-remove" onclick="handleRemoveWord('${word}', 'interest')">×</button>
            </span>`
        ).join('');

        const ngWords = wordHook.wordFilters.ngWords.map(word => 
            `<span class="word-tag ng">
                ${word}
                <button class="word-remove" onclick="handleRemoveWord('${word}', 'ng')">×</button>
            </span>`
        ).join('');

        return `
            <div class="modal-overlay" onclick="handleCloseModal()">
                <div class="modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>ワード管理</h2>
                        <button class="modal-close" onclick="handleCloseModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="word-section">
                            <div class="word-section-header">
                                <h3>興味ワード</h3>
                                <button class="action-btn success" onclick="handleAddWord('interest')">追加</button>
                            </div>
                            <div class="word-list">
                                ${interestWords || '<div class="text-muted">設定されていません</div>'}
                            </div>
                        </div>

                        <div class="word-section">
                            <div class="word-section-header">
                                <h3>NGワード</h3>
                                <button class="action-btn danger" onclick="handleAddWord('ng')">追加</button>
                            </div>
                            <div class="word-list">
                                ${ngWords || '<div class="text-muted">設定されていません</div>'}
                            </div>
                        </div>

                        <div class="word-help">
                            <h4>ヘルプ</h4>
                            <ul>
                                <li><strong>興味ワード:</strong> 該当する記事のAIスコアが上がります</li>
                                <li><strong>NGワード:</strong> 該当する記事は表示されません</li>
                                <li>大文字・小文字は区別されません</li>
                                <li>部分一致で動作します</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    const renderSettingsModal = () => {
        const storageInfo = window.LocalStorageManager.getStorageInfo();
        
        return `
            <div class="modal-overlay" onclick="handleCloseModal()">
                <div class="modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>設定</h2>
                        <button class="modal-close" onclick="handleCloseModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="word-section">
                            <h3>学習データ管理</h3>
                            <p class="text-muted mb-3">AI学習データとワードフィルターをバックアップ・復元できます</p>
                            
                            <div class="modal-actions">
                                <button class="action-btn success" onclick="handleExportLearningData()">
                                    学習データエクスポート
                                </button>
                                
                                <label class="action-btn" style="cursor: pointer; display: inline-block;">
                                    学習データインポート
                                    <input type="file" accept=".json" onchange="handleImportLearningData(event)" style="display: none;">
                                </label>
                            </div>
                        </div>

                        <div class="word-section">
                            <h3>ストレージ使用量</h3>
                            <p class="text-muted">
                                使用量: ${Math.round(storageInfo.totalSize / 1024)}KB / 5MB<br>
                                アイテム数: ${storageInfo.itemCount}
                            </p>
                        </div>

                        <div class="word-section">
                            <h3>バージョン情報</h3>
                            <p class="text-muted">
                                Minews PWA v${window.CONFIG.DATA_VERSION}<br>
                                GitHub Actions対応版
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    const renderModal = () => {
        switch (window.state.showModal) {
            case 'words':
                return renderWordModal();
            case 'settings':
                return renderSettingsModal();
            default:
                return '';
        }
    };

    // メインレンダー関数
    window.render = () => {
        const app = document.getElementById('app');
        if (!app) return;

        app.innerHTML = `
            <div class="app">
                ${renderNavigation()}
                <main class="main-content">
                    ${renderArticleList()}
                </main>
                ${renderModal()}
            </div>
        `;

        // 星評価のイベントリスナー設定
        document.querySelectorAll('.star').forEach(star => {
            star.addEventListener('click', (e) => {
                handleArticleClick(e, e.target.getAttribute('data-article-id'), 'rating');
            });
        });
    };

    // ===========================================
    // 初期化
    // ===========================================

    // グローバル関数をウィンドウに追加
    window.handleFilterChange = handleFilterChange;
    window.handleFolderChange = handleFolderChange;
    window.handleRefresh = handleRefresh;
    window.handleArticleClick = handleArticleClick;
    window.handleCloseModal = handleCloseModal;
    window.handleOpenModal = handleOpenModal;
    window.handleAddWord = handleAddWord;
    window.handleRemoveWord = handleRemoveWord;

    // DOM読み込み完了時の初期化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initializeData();
            window.render();
        });
    } else {
        initializeData();
        window.render();
    }

})();
