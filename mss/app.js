// Minews PWA - Application Module (UI・状態管理)
(function() {
'use strict';

// ===========================================
// アプリケーション状態管理
// ===========================================
let state = {
    viewMode: 'all',
    selectedFolder: 'all',
    showModal: null,
    articles: [],
    isLoading: false,
    lastUpdate: null
};

const setState = newState => {
    state = { ...state, ...newState };
    render();
};

const initializeData = () => {
    const articlesData = LocalStorageManager.getItem(CONFIG.STORAGE_KEYS.ARTICLES, DEFAULT_DATA.articles);
    const rssData = LocalStorageManager.getItem(CONFIG.STORAGE_KEYS.RSS_FEEDS, DEFAULT_DATA.rssFeeds);
    const foldersData = LocalStorageManager.getItem(CONFIG.STORAGE_KEYS.FOLDERS, DEFAULT_DATA.folders);
    const aiData = LocalStorageManager.getItem(CONFIG.STORAGE_KEYS.AI_LEARNING, DEFAULT_DATA.aiLearning);
    const wordData = LocalStorageManager.getItem(CONFIG.STORAGE_KEYS.WORD_FILTERS, DEFAULT_DATA.wordFilters);

    Object.assign(DataHooksCache, {
        articles: articlesData,
        rssFeeds: rssData,
        folders: foldersData,
        aiLearning: aiData,
        wordFilters: wordData
    });

    state.articles = articlesData;

    if (state.articles.length === 0) {
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

        const articlesHook = DataHooks.useArticles();
        sampleArticles.forEach(article => articlesHook.addArticle(article));
        state.articles = DataHooksCache.articles;
    }
};

// ===========================================
// ユーティリティ関数
// ===========================================
const formatDate = dateString => {
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

const createStarRating = (rating, articleId) => {
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        const filled = i <= rating ? 'filled' : '';
        stars += `<span class="star ${filled}" onclick="handleRating('${articleId}', ${i})">★</span>`;
    }
    return `<div class="star-rating">${stars}</div>`;
};

const truncateText = (text, maxLength = 200) => 
    text.length <= maxLength ? text : text.substring(0, maxLength).trim() + '...';

// XMLエスケープ関数
const escapeXml = (text) => {
    return text.replace(/[<>&'"]/g, (char) => {
        switch (char) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '"': return '&quot;';
            case "'": return '&apos;';
            default: return char;
        }
    });
};

// ===========================================
// データ管理機能
// ===========================================
// 学習データエクスポート
const handleExportLearningData = () => {
    const aiHook = DataHooks.useAILearning();
    const wordHook = DataHooks.useWordFilters();

    const exportData = {
        version: CONFIG.DATA_VERSION,
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
const handleImportLearningData = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importData = JSON.parse(e.target.result);
            if (!importData.aiLearning || !importData.wordFilters) {
                throw new Error('無効なデータ形式です');
            }

            const aiHook = DataHooks.useAILearning();
            const wordHook = DataHooks.useWordFilters();

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
            render();
        } catch (error) {
            alert('インポートに失敗しました: ' + error.message);
        }
    };

    reader.readAsText(file);
    // ファイル選択をリセット
    event.target.value = '';
};

// RSSデータエクスポート（OPML形式）
const handleExportRSSData = () => {
    const rssHook = DataHooks.useRSSManager();
    const foldersHook = DataHooks.useFolders();

    let opmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
    <head>
        <title>Minews RSS Feeds</title>
        <dateCreated>${new Date().toUTCString()}</dateCreated>
    </head>
    <body>`;

    // フォルダ別にグループ化
    const folderMap = new Map();
    foldersHook.folders.forEach(folder => {
        folderMap.set(folder.id, { ...folder, feeds: [] });
    });

    rssHook.rssFeeds.forEach(feed => {
        const folder = folderMap.get(feed.folderId);
        if (folder) {
            folder.feeds.push(feed);
        }
    });

    folderMap.forEach(folder => {
        if (folder.feeds.length > 0) {
            opmlContent += `\n        <outline text="${escapeXml(folder.name)}" title="${escapeXml(folder.name)}">`;
            folder.feeds.forEach(feed => {
                opmlContent += `\n            <outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.url)}"/>`;
            });
            opmlContent += `\n        </outline>`;
        }
    });

    opmlContent += `\n    </body>
</opml>`;

    const dataBlob = new Blob([opmlContent], { type: 'application/xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `minews_rss_feeds_${new Date().toISOString().split('T')[0]}.opml`;
    link.click();

    alert('RSSデータをエクスポートしました');
};

// RSSデータインポート（OPML形式）
const handleImportRSSData = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(e.target.result, 'text/xml');

            const parseError = xmlDoc.querySelector('parsererror');
            if (parseError) {
                throw new Error('無効なOPMLファイルです');
            }

            const rssHook = DataHooks.useRSSManager();
            const foldersHook = DataHooks.useFolders();
            let importCount = 0;

            const outlines = xmlDoc.querySelectorAll('outline');
            outlines.forEach(outline => {
                const xmlUrl = outline.getAttribute('xmlUrl');
                const text = outline.getAttribute('text') || outline.getAttribute('title');

                if (xmlUrl && text) {
                    // 既存チェック
                    const exists = rssHook.rssFeeds.find(feed => feed.url === xmlUrl);
                    if (!exists) {
                        // デフォルトフォルダに追加
                        const defaultFolder = foldersHook.folders[0];
                        rssHook.addRSSFeed(xmlUrl, text, defaultFolder.id);
                        importCount++;
                    }
                }
            });

            alert(`${importCount}件のRSSフィードをインポートしました`);
            render();
        } catch (error) {
            alert('インポートに失敗しました: ' + error.message);
        }
    };

    reader.readAsText(file);
    event.target.value = '';
};

// データ削除
const handleClearAllData = () => {
    if (confirm('すべてのデータを削除しますか？この操作は取り消せません。')) {
        Object.values(CONFIG.STORAGE_KEYS).forEach(key => {
            LocalStorageManager.removeItem(key);
        });
        DataHooksCache.clear();
        location.reload();
    }
};

// ===========================================
// イベントハンドラ
// ===========================================

// RSS更新
const handleRefreshRSS = async () => {
    setState({ isLoading: true });

    try {
        const rssHook = DataHooks.useRSSManager();
        const result = await rssHook.fetchAllFeeds();

        state.articles = DataHooksCache.articles;
        state.lastUpdate = new Date().toISOString();

        if (result.totalAdded > 0) {
            alert(`${result.totalAdded}件の新しい記事を取得しました`);
        } else {
            alert('新しい記事はありませんでした');
        }
    } catch (error) {
        alert('RSS更新中にエラーが発生しました: ' + error.message);
    } finally {
        setState({ isLoading: false });
    }
};

// 評価ハンドラ
const handleRating = (articleId, rating) => {
    const articlesHook = DataHooks.useArticles();
    const aiHook = DataHooks.useAILearning();
    const article = state.articles.find(a => a.id === articleId);

    if (article) {
        // 既存評価を取り消し
        if (article.userRating > 0) {
            aiHook.updateLearningData(article, article.userRating, true);
        }

        // 新評価を適用
        const newRating = article.userRating === rating ? 0 : rating;
        articlesHook.updateArticle(articleId, { userRating: newRating });

        if (newRating > 0) {
            aiHook.updateLearningData(article, newRating);
        }
    }
};

// 記事アクション
const toggleReadStatus = (articleId) => {
    const articlesHook = DataHooks.useArticles();
    const article = state.articles.find(a => a.id === articleId);
    
    if (article) {
        const newStatus = article.readStatus === 'read' ? 'unread' : 'read';
        articlesHook.updateArticle(articleId, { readStatus: newStatus });
    }
};

const toggleReadLater = (articleId) => {
    const articlesHook = DataHooks.useArticles();
    const article = state.articles.find(a => a.id === articleId);
    
    if (article) {
        articlesHook.updateArticle(articleId, { readLater: !article.readLater });
    }
};

// モーダル管理
const showModal = (modalType) => {
    setState({ showModal: modalType });
};

const closeModal = () => {
    setState({ showModal: null });
};

// RSS管理
const handleAddRSSFeed = () => {
    const url = document.getElementById('rssUrl').value.trim();
    const title = document.getElementById('rssTitle').value.trim();
    const folderId = document.getElementById('rssFolderId').value;

    if (!url) {
        alert('RSS URLを入力してください');
        return;
    }

    try {
        new URL(url); // URL検証
    } catch {
        alert('有効なURLを入力してください');
        return;
    }

    const rssHook = DataHooks.useRSSManager();
    
    // 重複チェック
    const exists = rssHook.rssFeeds.find(feed => feed.url === url);
    if (exists) {
        alert('このRSSフィードは既に登録されています');
        return;
    }

    rssHook.addRSSFeed(url, title || 'Unknown Feed', folderId);
    
    // フォーム初期化
    document.getElementById('rssUrl').value = '';
    document.getElementById('rssTitle').value = '';
    
    alert('RSSフィードを追加しました');
    render();
};

const handleRemoveRSSFeed = (feedId) => {
    if (confirm('このRSSフィードを削除しますか？')) {
        const rssHook = DataHooks.useRSSManager();
        rssHook.removeRSSFeed(feedId);
        render();
    }
};

const handleToggleRSSFeed = (feedId) => {
    const rssHook = DataHooks.useRSSManager();
    const feed = rssHook.rssFeeds.find(f => f.id === feedId);
    
    if (feed) {
        rssHook.updateRSSFeed(feedId, { isActive: !feed.isActive });
        render();
    }
};

// フォルダ管理
const handleAddFolder = () => {
    const name = document.getElementById('folderName').value.trim();
    const color = document.getElementById('folderColor').value;

    if (!name) {
        alert('フォルダ名を入力してください');
        return;
    }

    const foldersHook = DataHooks.useFolders();
    
    // 重複チェック
    const exists = foldersHook.folders.find(folder => 
        folder.name.toLowerCase() === name.toLowerCase());
    if (exists) {
        alert('同じ名前のフォルダが既に存在します');
        return;
    }

    const result = foldersHook.addFolder(name, color);
    if (result) {
        document.getElementById('folderName').value = '';
        alert('フォルダを追加しました');
        render();
    } else {
        alert('フォルダの追加に失敗しました');
    }
};

const handleRemoveFolder = (folderId) => {
    const foldersHook = DataHooks.useFolders();
    const result = foldersHook.removeFolder(folderId);

    if (result.success) {
        alert('フォルダを削除しました');
        render();
    } else if (result.reason === 'FEEDS_EXIST') {
        alert(`このフォルダには${result.feedCount}個のRSSフィードが含まれています。先にRSSフィードを移動または削除してください。`);
    }
};

// ワード管理
const handleAddInterestWord = () => {
    const word = document.getElementById('interestWord').value.trim();
    if (!word) {
        alert('興味ワードを入力してください');
        return;
    }

    const wordHook = DataHooks.useWordFilters();
    if (wordHook.addInterestWord(word)) {
        document.getElementById('interestWord').value = '';
        render();
    } else {
        alert('このワードは既に登録されています');
    }
};

const handleAddNGWord = () => {
    const word = document.getElementById('ngWord').value.trim();
    if (!word) {
        alert('NGワードを入力してください');
        return;
    }

    const wordHook = DataHooks.useWordFilters();
    if (wordHook.addNGWord(word)) {
        document.getElementById('ngWord').value = '';
        render();
    } else {
        alert('このワードは既に登録されています');
    }
};

const handleRemoveInterestWord = (word) => {
    const wordHook = DataHooks.useWordFilters();
    wordHook.removeInterestWord(word);
    render();
};

const handleRemoveNGWord = (word) => {
    const wordHook = DataHooks.useWordFilters();
    wordHook.removeNGWord(word);
    render();
};

// ===========================================
// レンダリング
// ===========================================
const render = () => {
    const app = document.getElementById('app');
    if (!app) return;

    // データフック取得
    const foldersHook = DataHooks.useFolders();
    const aiHook = DataHooks.useAILearning();
    const wordHook = DataHooks.useWordFilters();

    // 記事フィルタリング
    let filteredArticles = [...state.articles];

    // フォルダフィルタ
    if (state.selectedFolder !== 'all') {
        const rssHook = DataHooks.useRSSManager();
        const folderFeeds = rssHook.rssFeeds.filter(feed => feed.folderId === state.selectedFolder);
        const folderSources = folderFeeds.map(feed => FolderManager.extractDomainFromUrl(feed.url));
        
        filteredArticles = filteredArticles.filter(article => {
            const articleDomain = FolderManager.extractDomainFromSource(article.rssSource);
            return folderSources.some(source => source === articleDomain || articleDomain.includes(source));
        });
    }

    // 表示モードフィルタ
    if (state.viewMode === 'unread') {
        filteredArticles = filteredArticles.filter(article => article.readStatus === 'unread');
    } else if (state.viewMode === 'readLater') {
        filteredArticles = filteredArticles.filter(article => article.readLater);
    }

    // NGワードフィルタ
    filteredArticles = WordFilterManager.filterArticles(filteredArticles, wordHook.wordFilters);

    // AIスコアでソート
    filteredArticles = AIScoring.sortArticlesByScore(filteredArticles, aiHook.aiLearning, wordHook.wordFilters);

    // フォルダオプション生成
    const folderOptions = foldersHook.folders.map(folder => 
        `<option value="${folder.id}" ${state.selectedFolder === folder.id ? 'selected' : ''}>${folder.name}</option>`
    ).join('');

    app.innerHTML = `
        <div class="app">
            ${renderNavigation(folderOptions)}
            ${renderMainContent(filteredArticles)}
            ${renderModal()}
        </div>
    `;
};

const renderNavigation = (folderOptions) => `
    <nav class="nav">
        <div class="nav-left">
            <h1>📰 Minews</h1>
            ${state.lastUpdate ? `<div class="last-update">最終更新: ${formatDate(state.lastUpdate)}</div>` : ''}
        </div>
        
        <div class="nav-filters">
            <div class="filter-group">
                <label>表示:</label>
                <select class="filter-select" onchange="setState({viewMode: this.value})">
                    <option value="all" ${state.viewMode === 'all' ? 'selected' : ''}>すべて</option>
                    <option value="unread" ${state.viewMode === 'unread' ? 'selected' : ''}>未読</option>
                    <option value="readLater" ${state.viewMode === 'readLater' ? 'selected' : ''}>後で読む</option>
                </select>
            </div>
            
            <div class="filter-group">
                <label>フォルダ:</label>
                <select class="filter-select" onchange="setState({selectedFolder: this.value})">
                    <option value="all" ${state.selectedFolder === 'all' ? 'selected' : ''}>すべて</option>
                    ${folderOptions}
                </select>
            </div>
        </div>

        <div class="nav-actions">
            <button class="action-btn refresh-btn ${state.isLoading ? 'loading' : ''}" 
                    onclick="handleRefreshRSS()" ${state.isLoading ? 'disabled' : ''}>
                ${state.isLoading ? '更新中...' : '🔄 更新'}
            </button>
            <button class="action-btn" onclick="showModal('rss')">RSS管理</button>
            <button class="action-btn" onclick="showModal('folders')">フォルダ</button>
            <button class="action-btn" onclick="showModal('words')">ワード</button>
            <button class="action-btn" onclick="showModal('settings')">設定</button>
        </div>
    </nav>
`;

const renderMainContent = (articles) => `
    <main class="main-content">
        ${articles.length === 0 ? 
            '<div class="empty-message">記事がありません</div>' :
            `<div class="article-grid">${articles.map(renderArticleCard).join('')}</div>`
        }
    </main>
`;

const renderArticleCard = (article) => `
    <article class="article-card" data-read-status="${article.readStatus}">
        <div class="article-header">
            <h2 class="article-title">
                <a href="${article.url}" target="_blank" rel="noopener noreferrer">${article.title}</a>
            </h2>
        </div>

        <div class="article-meta">
            <span class="date">${formatDate(article.publishDate)}</span>
            <span class="source">${article.rssSource}</span>
            <span class="category">${article.category}</span>
            ${article.aiScore ? `<span class="ai-score">AI: ${article.aiScore}</span>` : ''}
            ${article.userRating > 0 ? `<span class="rating-badge">${article.userRating}★</span>` : ''}
        </div>

        <div class="article-content">${truncateText(article.content)}</div>

        ${article.keywords && article.keywords.length > 0 ? `
            <div class="article-keywords">
                ${article.keywords.map(keyword => `<span class="keyword">${keyword}</span>`).join('')}
            </div>
        ` : ''}

        <div class="article-actions">
            <button class="simple-btn read-status" onclick="toggleReadStatus('${article.id}')">
                ${article.readStatus === 'read' ? '未読' : '既読'}
            </button>
            <button class="simple-btn read-later" data-active="${article.readLater}" onclick="toggleReadLater('${article.id}')">
                ${article.readLater ? '解除' : '後で'}
            </button>
        </div>

        ${createStarRating(article.userRating, article.id)}
    </article>
`;

const renderModal = () => {
    if (!state.showModal) return '';

    const modals = {
        rss: renderRSSModal,
        folders: renderFoldersModal,
        words: renderWordsModal,
        settings: renderSettingsModal
    };

    const renderFunction = modals[state.showModal];
    return renderFunction ? renderFunction() : '';
};

const renderRSSModal = () => {
    const rssHook = DataHooks.useRSSManager();
    const foldersHook = DataHooks.useFolders();

    return `
        <div class="modal-overlay" onclick="event.target === this && closeModal()">
            <div class="modal">
                <div class="modal-header">
                    <h2>RSS管理</h2>
                    <button class="modal-close" onclick="closeModal()">×</button>
                </div>
                <div class="modal-body">
                    <div class="modal-actions">
                        <input type="text" id="rssUrl" name="rssUrl" placeholder="RSS URL" style="width: 60%; margin-right: 0.5rem;">
                        <input type="text" id="rssTitle" name="rssTitle" placeholder="タイトル（任意）" style="width: 30%; margin-right: 0.5rem;">
                        <select id="rssFolderId" name="rssFolderId" style="width: 100%; margin: 0.5rem 0;">
                            ${foldersHook.folders.map(folder => 
                                `<option value="${folder.id}">${folder.name}</option>`
                            ).join('')}
                        </select>
                        <button class="action-btn success" onclick="handleAddRSSFeed()">追加</button>
                    </div>

                    <div class="rss-list">
                        ${rssHook.rssFeeds.map(feed => {
                            const folder = foldersHook.folders.find(f => f.id === feed.folderId);
                            return `
                                <div class="rss-item" style="border-left-color: ${folder?.color || '#4A90A4'}">
                                    <div class="rss-info">
                                        <strong>${feed.title}</strong>
                                        <span class="rss-url">${feed.url}</span>
                                        <span class="rss-updated">最終更新: ${formatDate(feed.lastUpdated)}</span>
                                        <span class="rss-status ${feed.isActive ? 'active' : 'inactive'}">
                                            ${feed.isActive ? '有効' : '無効'}
                                        </span>
                                        <div>フォルダ: ${folder?.name || '不明'}</div>
                                    </div>
                                    <div class="rss-actions">
                                        <button class="action-btn" onclick="handleToggleRSSFeed('${feed.id}')">
                                            ${feed.isActive ? '無効化' : '有効化'}
                                        </button>
                                        <button class="action-btn danger" onclick="handleRemoveRSSFeed('${feed.id}')">削除</button>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>

                    <div class="rss-help">
                        <h4>💡 RSS管理のヒント</h4>
                        <ul>
                            <li>RSS URLはニュースサイトやブログのRSSフィード URLを入力してください</li>
                            <li>タイトルは自動取得されますが、任意で設定することも可能です</li>
                            <li>フィードは追加時に選択したフォルダに分類されます</li>
                            <li>無効化したフィードは更新対象から除外されます</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    `;
};

const renderFoldersModal = () => {
    const foldersHook = DataHooks.useFolders();

    return `
        <div class="modal-overlay" onclick="event.target === this && closeModal()">
            <div class="modal">
                <div class="modal-header">
                    <h2>フォルダ管理</h2>
                    <button class="modal-close" onclick="closeModal()">×</button>
                </div>
                <div class="modal-body">
                    <div class="modal-actions">
                        <input type="text" id="folderName" name="folderName" placeholder="フォルダ名" style="width: 60%; margin-right: 0.5rem;">
                        <select id="folderColor" name="folderColor" style="width: 30%; margin-right: 0.5rem;">
                            ${CONFIG.FOLDER_COLORS.map(color => 
                                `<option value="${color.value}" style="background-color: ${color.value}; color: white;">${color.name}</option>`
                            ).join('')}
                        </select>
                        <button class="action-btn success" onclick="handleAddFolder()">追加</button>
                    </div>

                    <div class="folder-list">
                        ${foldersHook.folders.map(folder => `
                            <div class="rss-item" style="border-left-color: ${folder.color}">
                                <div class="rss-info">
                                    <strong style="color: ${folder.color}">${folder.name}</strong>
                                    <span class="rss-url">作成日: ${formatDate(folder.createdAt)}</span>
                                    <span class="rss-updated">カラー: ${FolderManager.getColorName(folder.color)}</span>
                                </div>
                                <div class="rss-actions">
                                    <button class="action-btn danger" onclick="handleRemoveFolder('${folder.id}')">削除</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
};

const renderWordsModal = () => {
    const wordHook = DataHooks.useWordFilters();

    return `
        <div class="modal-overlay" onclick="event.target === this && closeModal()">
            <div class="modal">
                <div class="modal-header">
                    <h2>ワード管理</h2>
                    <button class="modal-close" onclick="closeModal()">×</button>
                </div>
                <div class="modal-body">
                    <div class="word-section">
                        <div class="word-section-header">
                            <h3>興味ワード</h3>
                            <div>
                                <input type="text" id="interestWord" name="interestWord" placeholder="興味ワードを追加" style="margin-right: 0.5rem;">
                                <button class="action-btn success" onclick="handleAddInterestWord()">追加</button>
                            </div>
                        </div>
                        <div class="word-list">
                            ${wordHook.wordFilters.interestWords.map(word => `
                                <span class="word-tag interest">
                                    ${word}
                                    <button class="word-remove" onclick="handleRemoveInterestWord('${word}')">×</button>
                                </span>
                            `).join('')}
                        </div>
                    </div>

                    <div class="word-section">
                        <div class="word-section-header">
                            <h3>NGワード</h3>
                            <div>
                                <input type="text" id="ngWord" name="ngWord" placeholder="NGワードを追加" style="margin-right: 0.5rem;">
                                <button class="action-btn success" onclick="handleAddNGWord()">追加</button>
                            </div>
                        </div>
                        <div class="word-list">
                            ${wordHook.wordFilters.ngWords.map(word => `
                                <span class="word-tag ng">
                                    ${word}
                                    <button class="word-remove" onclick="handleRemoveNGWord('${word}')">×</button>
                                </span>
                            `).join('')}
                        </div>
                    </div>

                    <div class="word-help">
                        <h4>💡 ワード機能について</h4>
                        <p><strong>興味ワード:</strong> これらのワードを含む記事のAIスコアが上昇します</p>
                        <p><strong>NGワード:</strong> これらのワードを含む記事は表示されません</p>
                        <ul>
                            <li>ワードは部分一致で判定されます</li>
                            <li>大文字小文字は区別されません</li>
                            <li>タイトルと記事概要の両方が検索対象です</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    `;
};

const renderSettingsModal = () => {
    const storageInfo = LocalStorageManager.getStorageInfo();

    return `
        <div class="modal-overlay" onclick="event.target === this && closeModal()">
            <div class="modal">
                <div class="modal-header">
                    <h2>設定</h2>
                    <button class="modal-close" onclick="closeModal()">×</button>
                </div>
                <div class="modal-body">
                    <div class="settings-section">
                        <h3>データ管理</h3>
                        <div style="margin-bottom: 1rem;">
                            <button class="action-btn" onclick="handleExportLearningData()">学習データエクスポート</button>
                            <input type="file" id="importLearning" name="importLearning" accept=".json" onchange="handleImportLearningData(event)" style="display: none;">
                            <button class="action-btn" onclick="document.getElementById('importLearning').click()">学習データインポート</button>
                        </div>
                        <div style="margin-bottom: 1rem;">
                            <button class="action-btn" onclick="handleExportRSSData()">RSS OPMLエクスポート</button>
                            <input type="file" id="importRSS" name="importRSS" accept=".opml,.xml" onchange="handleImportRSSData(event)" style="display: none;">
                            <button class="action-btn" onclick="document.getElementById('importRSS').click()">RSS OPMLインポート</button>
                        </div>
                        <div>
                            <button class="action-btn danger" onclick="handleClearAllData()">全データ削除</button>
                        </div>
                    </div>

                    <div class="settings-section">
                        <h3>ストレージ情報</h3>
                        <p>使用中: ${Math.round(storageInfo.totalSize / 1024)} KB</p>
                        <p>アイテム数: ${storageInfo.itemCount}</p>
                        <p>残り容量: ${Math.round(storageInfo.available / 1024)} KB</p>
                    </div>

                    <div class="settings-section">
                        <h3>アプリ情報</h3>
                        <p>バージョン: ${CONFIG.DATA_VERSION}</p>
                        <p>最大記事数: ${CONFIG.MAX_ARTICLES}</p>
                    </div>
                </div>
            </div>
        </div>
    `;
};

// ===========================================
// アプリケーション初期化
// ===========================================
document.addEventListener('DOMContentLoaded', () => {
    initializeData();
    render();

    // グローバル関数エクスポート
    window.state = state;
    window.setState = setState;
    window.render = render;
    window.handleRefreshRSS = handleRefreshRSS;
    window.handleRating = handleRating;
    window.toggleReadStatus = toggleReadStatus;
    window.toggleReadLater = toggleReadLater;
    window.showModal = showModal;
    window.closeModal = closeModal;
    window.handleAddRSSFeed = handleAddRSSFeed;
    window.handleRemoveRSSFeed = handleRemoveRSSFeed;
    window.handleToggleRSSFeed = handleToggleRSSFeed;
    window.handleAddFolder = handleAddFolder;
    window.handleRemoveFolder = handleRemoveFolder;
    window.handleAddInterestWord = handleAddInterestWord;
    window.handleAddNGWord = handleAddNGWord;
    window.handleRemoveInterestWord = handleRemoveInterestWord;
    window.handleRemoveNGWord = handleRemoveNGWord;
    window.handleExportLearningData = handleExportLearningData;
    window.handleImportLearningData = handleImportLearningData;
    window.handleExportRSSData = handleExportRSSData;
    window.handleImportRSSData = handleImportRSSData;
    window.handleClearAllData = handleClearAllData;
});

})();
