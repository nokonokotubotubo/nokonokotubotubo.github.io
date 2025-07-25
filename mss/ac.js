// ac.js - UI制御・状態管理系
import {
    CONFIG,
    DEFAULT_DATA,
    DataHooksCache,
    FolderManager,
    RSSProcessor,
    AIScoring,
    WordFilterManager,
    LocalStorageManager,
    DataHooks
} from './dm.js';

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

const escapeXml = (text) => {
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
    event.target.value = '';
};

const handleExportRSSData = () => {
    const rssHook = DataHooks.useRSSManager();
    const foldersHook = DataHooks.useFolders();

    let opmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
<head>
<title>Minews RSS Feeds</title>
<dateCreated>${new Date().toUTCString()}</dateCreated>
</head>
<body>
`;

    // フォルダごとにグループ化
    const folders = foldersHook.folders;
    const feeds = rssHook.rssFeeds;

    folders.forEach(folder => {
        const folderFeeds = feeds.filter(feed => feed.folderId === folder.id);
        if (folderFeeds.length > 0) {
            opmlContent += `  <outline text="${escapeXml(folder.name)}" title="${escapeXml(folder.name)}">\n`;
            folderFeeds.forEach(feed => {
                opmlContent += `    <outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.url)}"/>\n`;
            });
            opmlContent += `  </outline>\n`;
        }
    });

    // フォルダに属さないフィード
    const uncategorizedFeeds = feeds.filter(feed => 
        !folders.some(folder => folder.id === feed.folderId)
    );
    if (uncategorizedFeeds.length > 0) {
        opmlContent += `  <outline text="未分類" title="未分類">\n`;
        uncategorizedFeeds.forEach(feed => {
            opmlContent += `    <outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.url)}"/>\n`;
        });
        opmlContent += `  </outline>\n`;
    }

    opmlContent += `</body>
</opml>`;

    const dataBlob = new Blob([opmlContent], { type: 'text/xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `minews_rss_feeds_${new Date().toISOString().split('T')[0]}.opml`;
    link.click();

    alert('RSSデータをOPML形式でエクスポートしました');
};

// =========================================== 
// イベントハンドラー 
// =========================================== 
const handleRefresh = async () => {
    setState({ isLoading: true });
    
    try {
        const rssHook = DataHooks.useRSSManager();
        const result = await rssHook.fetchAllFeeds();
        
        setState({ 
            isLoading: false, 
            lastUpdate: new Date().toISOString(),
            articles: DataHooksCache.articles
        });

        const message = `更新完了！
追加: ${result.totalAdded}件
エラー: ${result.totalErrors}件
処理済み: ${result.totalFeeds}フィード`;

        alert(message);
    } catch (error) {
        setState({ isLoading: false });
        alert('更新中にエラーが発生しました: ' + error.message);
    }
};

const handleRating = (articleId, rating) => {
    const articlesHook = DataHooks.useArticles();
    const aiHook = DataHooks.useAILearning();
    
    const article = state.articles.find(a => a.id === articleId);
    if (!article) return;

    const oldRating = article.userRating;
    
    // 前の評価を取り消し
    if (oldRating > 0) {
        aiHook.updateLearningData(article, oldRating, true);
    }
    
    // 新しい評価を適用
    if (rating !== oldRating) {
        aiHook.updateLearningData(article, rating);
        articlesHook.updateArticle(articleId, { userRating: rating });
    } else {
        // 同じ評価をクリックした場合は評価を削除
        articlesHook.updateArticle(articleId, { userRating: 0 });
    }
    
    setState({ articles: DataHooksCache.articles });
};

const handleMarkAsRead = (articleId) => {
    const articlesHook = DataHooks.useArticles();
    const article = state.articles.find(a => a.id === articleId);
    
    if (article) {
        const newStatus = article.readStatus === 'read' ? 'unread' : 'read';
        articlesHook.updateArticle(articleId, { readStatus: newStatus });
        setState({ articles: DataHooksCache.articles });
    }
};

const handleReadLater = (articleId) => {
    const articlesHook = DataHooks.useArticles();
    const article = state.articles.find(a => a.id === articleId);
    
    if (article) {
        articlesHook.updateArticle(articleId, { readLater: !article.readLater });
        setState({ articles: DataHooksCache.articles });
    }
};

const handleAddFolder = () => {
    const name = prompt('フォルダ名を入力してください:');
    if (!name) return;

    setState({ showModal: 'color-selection', modalData: { action: 'create-folder', name } });
};

const handleColorSelection = (color) => {
    const { action, name, folderId } = state.modalData;
    const foldersHook = DataHooks.useFolders();
    
    if (action === 'create-folder') {
        const newFolder = foldersHook.addFolder(name, color);
        if (newFolder) {
            alert(`フォルダ「${name}」を作成しました`);
        } else {
            alert('フォルダの作成に失敗しました');
        }
    } else if (action === 'update-folder-color') {
        foldersHook.updateFolder(folderId, { color });
        alert('フォルダの色を変更しました');
    }
    
    setState({ showModal: null, modalData: null });
    render();
};

const handleAddRSSFeed = () => {
    setState({ showModal: 'folder-selection', modalData: { action: 'add-rss' } });
};

const handleFolderSelection = (folderId) => {
    const { action } = state.modalData;
    
    if (action === 'add-rss') {
        const url = prompt('RSS URL を入力してください:');
        if (!url) {
            setState({ showModal: null });
            return;
        }
        
        const rssHook = DataHooks.useRSSManager();
        const newFeed = rssHook.addRSSFeed(url, 'RSS Feed', folderId);
        alert(`RSS フィードを追加しました: ${newFeed.title}`);
    }
    
    setState({ showModal: null, modalData: null });
    render();
};

// =========================================== 
// レンダリング関数 
// =========================================== 
const render = () => {
    const articlesHook = DataHooks.useArticles();
    const rssHook = DataHooks.useRSSManager();
    const foldersHook = DataHooks.useFolders();
    const aiHook = DataHooks.useAILearning();
    const wordHook = DataHooks.useWordFilters();

    // フィルタリングとソート
    let filteredArticles = [...state.articles];
    
    // NGワードフィルター適用
    filteredArticles = WordFilterManager.filterArticles(filteredArticles, wordHook.wordFilters);

    // フォルダフィルター
    if (state.selectedFolder !== 'all') {
        const selectedFolderFeeds = rssHook.rssFeeds.filter(feed => feed.folderId === state.selectedFolder);
        const feedSources = selectedFolderFeeds.map(feed => FolderManager.extractDomainFromUrl(feed.url));
        filteredArticles = filteredArticles.filter(article => 
            feedSources.includes(article.rssSource) ||
            selectedFolderFeeds.some(feed => feed.title === article.rssSource)
        );
    }

    // 表示モードフィルター
    if (state.viewMode === 'unread') {
        filteredArticles = filteredArticles.filter(article => article.readStatus === 'unread');
    } else if (state.viewMode === 'readLater') {
        filteredArticles = filteredArticles.filter(article => article.readLater);
    } else if (state.viewMode === 'favorites') {
        filteredArticles = filteredArticles.filter(article => article.userRating >= 4);
    }

    // AIスコアでソート
    filteredArticles = AIScoring.sortArticlesByScore(filteredArticles, aiHook.aiLearning, wordHook.wordFilters);

    // HTML生成
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="app">
            ${renderNavigation(foldersHook.folders)}
            ${renderMainContent(filteredArticles)}
            ${state.showModal ? renderModal() : ''}
        </div>
    `;
};

const renderNavigation = (folders) => {
    const folderOptions = folders.map(folder => 
        `<option value="${folder.id}" ${state.selectedFolder === folder.id ? 'selected' : ''}>${folder.name}</option>`
    ).join('');

    return `
        <nav class="nav">
            <div class="nav-left">
                <h1>Minews</h1>
                ${state.lastUpdate ? `<div class="last-update">最終更新: ${formatDate(state.lastUpdate)}</div>` : ''}
            </div>
            <div class="nav-filters">
                <div class="filter-group">
                    <label>表示モード:</label>
                    <select class="filter-select" onchange="setState({viewMode: this.value})">
                        <option value="all" ${state.viewMode === 'all' ? 'selected' : ''}>すべて</option>
                        <option value="unread" ${state.viewMode === 'unread' ? 'selected' : ''}>未読</option>
                        <option value="readLater" ${state.viewMode === 'readLater' ? 'selected' : ''}>後で読む</option>
                        <option value="favorites" ${state.viewMode === 'favorites' ? 'selected' : ''}>お気に入り</option>
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
                        onclick="handleRefresh()" 
                        ${state.isLoading ? 'disabled' : ''}>
                    ${state.isLoading ? '更新中...' : '更新'}
                </button>
                <button class="action-btn" onclick="handleAddRSSFeed()">RSS追加</button>
                <button class="action-btn" onclick="handleAddFolder()">フォルダ追加</button>
                <button class="action-btn" onclick="setState({showModal: 'rss-manager'})">RSS管理</button>
                <button class="action-btn" onclick="setState({showModal: 'word-filter'})">ワード管理</button>
                <button class="action-btn" onclick="setState({showModal: 'data-manager'})">データ管理</button>
            </div>
        </nav>
    `;
};

const renderMainContent = (articles) => {
    if (articles.length === 0) {
        return `
            <main class="main-content">
                <div class="empty-message">
                    表示する記事がありません
                </div>
            </main>
        `;
    }

    const articleCards = articles.map(article => `
        <article class="article-card" data-read-status="${article.readStatus}">
            <div class="article-header">
                <h2 class="article-title">
                    <a href="${article.url}" target="_blank" rel="noopener">${article.title}</a>
                </h2>
                <div class="article-meta">
                    <span class="date">${formatDate(article.publishDate)}</span>
                    <span class="source">${article.rssSource}</span>
                    <span class="category">${article.category}</span>
                    ${article.aiScore ? `<span class="ai-score">AI: ${article.aiScore}</span>` : ''}
                    ${article.userRating > 0 ? `<span class="rating-badge">★${article.userRating}</span>` : ''}
                </div>
            </div>
            <div class="article-content">
                ${truncateText(article.content)}
            </div>
            ${article.keywords && article.keywords.length > 0 ? `
                <div class="article-keywords">
                    ${article.keywords.map(keyword => `<span class="keyword">${keyword}</span>`).join('')}
                </div>
            ` : ''}
            <div class="article-actions">
                <button class="simple-btn read-status" onclick="handleMarkAsRead('${article.id}')">
                    ${article.readStatus === 'read' ? '未読にする' : '既読にする'}
                </button>
                <button class="simple-btn read-later" data-active="${article.readLater}" onclick="handleReadLater('${article.id}')">
                    ${article.readLater ? '後で読む解除' : '後で読む'}
                </button>
            </div>
            ${createStarRating(article.userRating, article.id)}
        </article>
    `).join('');

    return `
        <main class="main-content">
            <div class="article-grid">
                ${articleCards}
            </div>
        </main>
    `;
};

const renderModal = () => {
    const rssHook = DataHooks.useRSSManager();
    const foldersHook = DataHooks.useFolders();
    const wordHook = DataHooks.useWordFilters();

    switch (state.showModal) {
        case 'rss-manager':
            return renderRSSManagerModal(rssHook.rssFeeds, foldersHook.folders);
        case 'word-filter':
            return renderWordFilterModal(wordHook.wordFilters);
        case 'data-manager':
            return renderDataManagerModal();
        case 'folder-selection':
            return renderFolderSelectionModal(foldersHook.folders);
        case 'color-selection':
            return renderColorSelectionModal();
        default:
            return '';
    }
};

const renderRSSManagerModal = (rssFeeds, folders) => {
    const rssItems = rssFeeds.map(feed => {
        const folder = folders.find(f => f.id === feed.folderId);
        const folderName = folder ? folder.name : '未分類';
        
        return `
            <div class="rss-item">
                <div class="rss-info">
                    <strong onclick="editRSSFeedTitle('${feed.id}')">${feed.title}</strong>
                    <span class="rss-url" onclick="editRSSFeedUrl('${feed.id}')">${feed.url}</span>
                    <div onclick="editRSSFeedFolder('${feed.id}')">フォルダ: ${folderName}</div>
                    <small class="rss-updated">最終更新: ${formatDate(feed.lastUpdated)}</small>
                    <span class="rss-status ${feed.isActive ? 'active' : 'inactive'}">
                        ${feed.isActive ? 'アクティブ' : '非アクティブ'}
                    </span>
                </div>
                <div class="rss-actions">
                    <button class="action-btn" onclick="toggleRSSFeed('${feed.id}')">
                        ${feed.isActive ? '無効化' : '有効化'}
                    </button>
                    <button class="action-btn danger" onclick="removeRSSFeed('${feed.id}')">削除</button>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="modal-overlay" onclick="setState({showModal: null})">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h2>RSS管理</h2>
                    <button class="modal-close" onclick="setState({showModal: null})">×</button>
                </div>
                <div class="modal-body">
                    <div class="modal-actions">
                        <button class="action-btn success" onclick="handleAddRSSFeed()">新しいRSSを追加</button>
                        <button class="action-btn" onclick="handleExportRSSData()">OPML出力</button>
                    </div>
                    <div class="rss-list">
                        ${rssItems}
                    </div>
                    <div class="rss-help">
                        <h4>RSS管理について</h4>
                        <ul>
                            <li>タイトル、URL、フォルダをクリックして編集できます</li>
                            <li>非アクティブなフィードは更新時にスキップされます</li>
                            <li>OPMLファイルで他のRSSリーダーとの連携が可能です</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    `;
};

const renderWordFilterModal = (wordFilters) => {
    const interestWords = wordFilters.interestWords.map(word => 
        `<span class="word-tag interest">${word}<button class="word-remove" onclick="removeInterestWord('${word}')">×</button></span>`
    ).join('');
    
    const ngWords = wordFilters.ngWords.map(word => 
        `<span class="word-tag ng">${word}<button class="word-remove" onclick="removeNGWord('${word}')">×</button></span>`
    ).join('');

    return `
        <div class="modal-overlay" onclick="setState({showModal: null})">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h2>ワードフィルター管理</h2>
                    <button class="modal-close" onclick="setState({showModal: null})">×</button>
                </div>
                <div class="modal-body">
                    <div class="word-section">
                        <div class="word-section-header">
                            <h3>興味ワード</h3>
                            <button class="action-btn success" onclick="addInterestWord()">追加</button>
                        </div>
                        <div class="word-list">
                            ${interestWords || '<span class="text-muted">興味ワードがありません</span>'}
                        </div>
                    </div>
                    
                    <div class="word-section">
                        <div class="word-section-header">
                            <h3>NGワード</h3>
                            <button class="action-btn danger" onclick="addNGWord()">追加</button>
                        </div>
                        <div class="word-list">
                            ${ngWords || '<span class="text-muted">NGワードがありません</span>'}
                        </div>
                    </div>
                    
                    <div class="word-help">
                        <h4>ワードフィルターについて</h4>
                        <ul>
                            <li>興味ワード：含まれる記事のAIスコアが上がります</li>
                            <li>NGワード：含まれる記事は表示されません</li>
                            <li>大文字小文字は区別されません</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    `;
};

const renderDataManagerModal = () => {
    const storageInfo = LocalStorageManager.getStorageInfo();
    const storageUsed = (storageInfo.totalSize / 1024).toFixed(1);
    const storageAvailable = (storageInfo.available / 1024).toFixed(1);

    return `
        <div class="modal-overlay" onclick="setState({showModal: null})">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h2>データ管理</h2>
                    <button class="modal-close" onclick="setState({showModal: null})">×</button>
                </div>
                <div class="modal-body">
                    <div class="data-section">
                        <h3>ストレージ使用状況</h3>
                        <p>使用済み: ${storageUsed} KB</p>
                        <p>利用可能: ${storageAvailable} KB</p>
                        <p>アイテム数: ${storageInfo.itemCount}</p>
                    </div>
                    
                    <div class="data-section">
                        <h3>学習データ</h3>
                        <button class="action-btn success" onclick="handleExportLearningData()">エクスポート</button>
                        <input type="file" id="import-learning" accept=".json" onchange="handleImportLearningData(event)" style="display: none;">
                        <button class="action-btn" onclick="document.getElementById('import-learning').click()">インポート</button>
                    </div>
                    
                    <div class="data-section">
                        <h3>RSSデータ</h3>
                        <button class="action-btn success" onclick="handleExportRSSData()">OPML出力</button>
                    </div>
                    
                    <div class="data-section">
                        <h3>全データ削除</h3>
                        <button class="action-btn danger" onclick="confirmClearAllData()">全データ削除</button>
                        <p class="text-muted">※この操作は取り消せません</p>
                    </div>
                </div>
            </div>
        </div>
    `;
};

const renderFolderSelectionModal = (folders) => {
    const folderItems = folders.map(folder => `
        <div class="folder-selection-item" onclick="handleFolderSelection('${folder.id}')">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="width: 12px; height: 12px; background: ${folder.color}; border-radius: 50%; display: inline-block;"></span>
                <span>${folder.name}</span>
            </div>
        </div>
    `).join('');

    return `
        <div class="modal-overlay" onclick="setState({showModal: null})">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h2>フォルダを選択</h2>
                    <button class="modal-close" onclick="setState({showModal: null})">×</button>
                </div>
                <div class="modal-body">
                    <div class="folder-selection-list">
                        ${folderItems}
                    </div>
                </div>
            </div>
        </div>
    `;
};

const renderColorSelectionModal = () => {
    const colorItems = CONFIG.FOLDER_COLORS.map(color => `
        <div class="color-selection-item" onclick="handleColorSelection('${color.value}')">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="width: 20px; height: 20px; background: ${color.value}; border-radius: 50%; display: inline-block;"></span>
                <span>${color.name}</span>
            </div>
        </div>
    `).join('');

    return `
        <div class="modal-overlay" onclick="setState({showModal: null})">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h2>色を選択</h2>
                    <button class="modal-close" onclick="setState({showModal: null})">×</button>
                </div>
                <div class="modal-body">
                    <div class="color-selection-list">
                        ${colorItems}
                    </div>
                </div>
            </div>
        </div>
    `;
};

// =========================================== 
// グローバル関数（イベントハンドラー用） 
// =========================================== 
window.setState = setState;
window.handleRefresh = handleRefresh;
window.handleRating = handleRating;
window.handleMarkAsRead = handleMarkAsRead;
window.handleReadLater = handleReadLater;
window.handleAddFolder = handleAddFolder;
window.handleColorSelection = handleColorSelection;
window.handleAddRSSFeed = handleAddRSSFeed;
window.handleFolderSelection = handleFolderSelection;
window.handleExportLearningData = handleExportLearningData;
window.handleImportLearningData = handleImportLearningData;
window.handleExportRSSData = handleExportRSSData;

// RSS管理用のグローバル関数
window.toggleRSSFeed = (feedId) => {
    const rssHook = DataHooks.useRSSManager();
    const feed = rssHook.rssFeeds.find(f => f.id === feedId);
    if (feed) {
        rssHook.updateRSSFeed(feedId, { isActive: !feed.isActive });
        render();
    }
};

window.removeRSSFeed = (feedId) => {
    if (confirm('このRSSフィードを削除しますか？')) {
        const rssHook = DataHooks.useRSSManager();
        rssHook.removeRSSFeed(feedId);
        render();
    }
};

// ワード管理用のグローバル関数  
window.addInterestWord = () => {
    const word = prompt('興味ワードを入力してください:');
    if (word) {
        const wordHook = DataHooks.useWordFilters();
        if (wordHook.addInterestWord(word)) {
            render();
        } else {
            alert('既に登録されているワードです');
        }
    }
};

window.addNGWord = () => {
    const word = prompt('NGワードを入力してください:');
    if (word) {
        const wordHook = DataHooks.useWordFilters();
        if (wordHook.addNGWord(word)) {
            render();
        } else {
            alert('既に登録されているワードです');
        }
    }
};

window.removeInterestWord = (word) => {
    const wordHook = DataHooks.useWordFilters();
    wordHook.removeInterestWord(word);
    render();
};

window.removeNGWord = (word) => {
    const wordHook = DataHooks.useWordFilters();
    wordHook.removeNGWord(word);
    render();
};

// データ管理用のグローバル関数
window.confirmClearAllData = () => {
    if (confirm('全てのデータを削除しますか？この操作は取り消せません。')) {
        if (confirm('本当に削除しますか？')) {
            Object.values(CONFIG.STORAGE_KEYS).forEach(key => {
                LocalStorageManager.removeItem(key);
            });
            DataHooksCache.clear();
            location.reload();
        }
    }
};

// RSS編集用のグローバル関数
window.editRSSFeedTitle = (feedId) => {
    const rssHook = DataHooks.useRSSManager();
    const feed = rssHook.rssFeeds.find(f => f.id === feedId);
    if (feed) {
        const newTitle = prompt('新しいタイトルを入力してください:', feed.title);
        if (newTitle && newTitle !== feed.title) {
            rssHook.updateRSSFeed(feedId, { title: newTitle });
            render();
        }
    }
};

window.editRSSFeedUrl = (feedId) => {
    const rssHook = DataHooks.useRSSManager();
    const feed = rssHook.rssFeeds.find(f => f.id === feedId);
    if (feed) {
        const newUrl = prompt('新しいURLを入力してください:', feed.url);
        if (newUrl && newUrl !== feed.url) {
            rssHook.updateRSSFeed(feedId, { url: newUrl });
            render();
        }
    }
};

window.editRSSFeedFolder = (feedId) => {
    setState({ 
        showModal: 'folder-selection', 
        modalData: { action: 'update-rss-folder', feedId } 
    });
};

// =========================================== 
// アプリケーション初期化 
// =========================================== 
document.addEventListener('DOMContentLoaded', () => {
    initializeData();
    render();
});
