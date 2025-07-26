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

    Object.assign(window.DataHooksCache, {
        articles: articlesData,
        rssFeeds: rssData,
        folders: foldersData,
        aiLearning: aiData,
        wordFilters: wordData
    });

    window.state.articles = articlesData;

    if (window.state.articles.length === 0) {
        const sampleArticles = [
            {
                id: 'sample_1',
                title: 'Minews PWA：GitHub Actions対応完了',
                url: '#',
                content: 'GitHub ActionsによるRSS取得とJSONファイル読み込み方式に対応しました。定期実行により自動的に記事が更新されます。',
                publishDate: new Date().toISOString(),
                rssSource: 'NHKニュース',
                category: 'Development',
                readStatus: 'unread',
                readLater: false,
                userRating: 0,
                keywords: ['GitHub Actions', 'RSS', 'JSON', '自動更新']
            },
            {
                id: 'sample_2',
                title: 'GitHub Pages静的ファイル配信でパフォーマンス向上',
                url: '#',
                content: 'CORSプロキシ依存を廃止し、GitHub Pagesの静的ファイル配信により高速かつ安定した記事取得が可能になりました。',
                publishDate: new Date(Date.now() - 3600000).toISOString(),
                rssSource: 'ITmedia',
                category: 'Performance',
                readStatus: 'unread',
                readLater: false,
                userRating: 0,
                keywords: ['GitHub Pages', '静的配信', 'パフォーマンス', '高速化']
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
        stars += `<span class="star ${filled}" onclick="window.rateArticle('${articleId}', ${i})">★</span>`;
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
// RSS取得・更新機能
// ===========================================

window.refreshRSS = async () => {
    const refreshBtn = document.querySelector('.refresh-btn');
    if (!refreshBtn || window.state.isLoading) return;

    window.setState({ isLoading: true });
    refreshBtn.classList.add('loading');
    refreshBtn.disabled = true;
    refreshBtn.textContent = '更新中...';

    try {
        const rssHook = window.DataHooks.useRSSManager();
        const result = await rssHook.fetchAllFeeds();
        
        window.setState({ 
            lastUpdate: result.lastUpdated || new Date().toISOString(),
            articles: window.DataHooksCache.articles 
        });

        if (result.totalAdded > 0) {
            alert(`記事を更新しました！\n新着記事: ${result.totalAdded}件`);
        } else {
            alert('記事の更新が完了しました。新着記事はありませんでした。');
        }
    } catch (error) {
        console.error('RSS更新エラー:', error);
        alert('記事の更新に失敗しました: ' + error.message);
    } finally {
        window.setState({ isLoading: false });
        refreshBtn.classList.remove('loading');
        refreshBtn.disabled = false;
        refreshBtn.textContent = '🔄 更新';
    }
};

// ===========================================
// 記事管理機能
// ===========================================

window.markAsRead = (articleId) => {
    const articlesHook = window.DataHooks.useArticles();
    const article = articlesHook.articles.find(a => a.id === articleId);
    
    if (article) {
        const newStatus = article.readStatus === 'read' ? 'unread' : 'read';
        articlesHook.updateArticle(articleId, { readStatus: newStatus });
    }
};

window.toggleReadLater = (articleId) => {
    const articlesHook = window.DataHooks.useArticles();
    const article = articlesHook.articles.find(a => a.id === articleId);
    
    if (article) {
        articlesHook.updateArticle(articleId, { readLater: !article.readLater });
    }
};

window.rateArticle = (articleId, rating) => {
    const articlesHook = window.DataHooks.useArticles();
    const aiHook = window.DataHooks.useAILearning();
    const article = articlesHook.articles.find(a => a.id === articleId);
    
    if (article) {
        const oldRating = article.userRating;
        
        // 既存の評価があれば学習データを元に戻す
        if (oldRating > 0) {
            aiHook.updateLearningData(article, oldRating, true);
        }
        
        // 新しい評価で学習データを更新
        if (rating > 0) {
            aiHook.updateLearningData(article, rating, false);
        }
        
        articlesHook.updateArticle(articleId, { userRating: rating });
    }
};

window.removeArticle = (articleId) => {
    if (confirm('この記事を削除しますか？')) {
        const articlesHook = window.DataHooks.useArticles();
        articlesHook.removeArticle(articleId);
    }
};

// ===========================================
// ワード管理機能
// ===========================================

window.showWordModal = () => {
    window.setState({ showModal: 'word' });
};

window.addInterestWord = () => {
    const word = prompt('興味のあるワードを入力してください:');
    if (word && word.trim()) {
        const wordHook = window.DataHooks.useWordFilters();
        if (wordHook.addInterestWord(word.trim())) {
            window.render();
        } else {
            alert('このワードは既に登録されています');
        }
    }
};

window.addNGWord = () => {
    const word = prompt('除外したいワードを入力してください:');
    if (word && word.trim()) {
        const wordHook = window.DataHooks.useWordFilters();
        if (wordHook.addNGWord(word.trim())) {
            window.render();
        } else {
            alert('このワードは既に登録されています');
        }
    }
};

window.removeInterestWord = (word) => {
    const wordHook = window.DataHooks.useWordFilters();
    wordHook.removeInterestWord(word);
    window.render();
};

window.removeNGWord = (word) => {
    const wordHook = window.DataHooks.useWordFilters();
    wordHook.removeNGWord(word);
    window.render();
};

// ===========================================
// モーダル管理
// ===========================================

window.showModal = (modalType) => {
    window.setState({ showModal: modalType });
};

window.closeModal = () => {
    window.setState({ showModal: null });
};

// モーダル外クリックで閉じる
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        window.closeModal();
    }
});

// ESCキーでモーダルを閉じる
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && window.state.showModal) {
        window.closeModal();
    }
});

// ===========================================
// フィルタリング機能
// ===========================================

const getFilteredArticles = () => {
    const aiHook = window.DataHooks.useAILearning();
    const wordHook = window.DataHooks.useWordFilters();
    const folderHook = window.DataHooks.useFolders();
    const rssHook = window.DataHooks.useRSSManager();
    
    let filtered = [...window.state.articles];
    
    // NGワードフィルター
    filtered = window.AIScoring.filterArticles(filtered, wordHook.wordFilters);
    
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
    
    // フォルダフィルター
    if (window.state.selectedFolder !== 'all') {
        const targetFolderFeeds = rssHook.rssFeeds.filter(feed => feed.folderId === window.state.selectedFolder);
        const feedTitles = targetFolderFeeds.map(feed => feed.title);
        filtered = filtered.filter(article => feedTitles.includes(article.rssSource));
    }
    
    // AIスコア順ソート
    filtered = window.AIScoring.sortArticlesByScore(filtered, aiHook.aiLearning, wordHook.wordFilters);
    
    return filtered;
};

// ===========================================
// レンダリング機能
// ===========================================

const renderNavigation = () => {
    const folderHook = window.DataHooks.useFolders();
    const lastUpdateText = window.state.lastUpdate ? 
        `最終更新: ${window.formatDate(window.state.lastUpdate)}` : 
        '未更新';

    return `
        <nav class="nav">
            <div class="nav-left">
                <h1>Minews</h1>
                <div class="last-update">${lastUpdateText}</div>
            </div>
            <div class="nav-filters">
                <div class="filter-group">
                    <label for="viewMode">表示:</label>
                    <select id="viewMode" class="filter-select" value="${window.state.viewMode}" onchange="window.setState({viewMode: this.value})">
                        <option value="all">全て</option>
                        <option value="unread">未読のみ</option>
                        <option value="read">既読のみ</option>
                        <option value="readLater">後で読む</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label for="folderFilter">フォルダ:</label>
                    <select id="folderFilter" class="filter-select" value="${window.state.selectedFolder}" onchange="window.setState({selectedFolder: this.value})">
                        <option value="all">全フォルダ</option>
                        ${folderHook.folders.map(folder => 
                            `<option value="${folder.id}">${folder.name}</option>`
                        ).join('')}
                    </select>
                </div>
            </div>
            <div class="nav-actions">
                <button class="action-btn refresh-btn" onclick="window.refreshRSS()" ${window.state.isLoading ? 'disabled' : ''}>
                    ${window.state.isLoading ? '更新中...' : '🔄 更新'}
                </button>
                <button class="action-btn" onclick="window.showModal('settings')">⚙️ 設定</button>
            </div>
        </nav>
    `;
};

const renderArticleCard = (article) => {
    return `
        <div class="article-card" data-read-status="${article.readStatus}">
            <div class="article-header">
                <h3 class="article-title">
                    <a href="${article.url}" target="_blank" onclick="window.markAsRead('${article.id}')">${article.title}</a>
                </h3>
                <div class="article-meta">
                    <span class="date">${window.formatDate(article.publishDate)}</span>
                    <span class="source">${article.rssSource}</span>
                    <span class="category">${article.category}</span>
                    <span class="ai-score">AI: ${article.aiScore || 50}</span>
                    ${article.userRating > 0 ? `<span class="rating-badge">★${article.userRating}</span>` : ''}
                </div>
            </div>
            <div class="article-content">${window.truncateText(article.content)}</div>
            ${article.keywords && article.keywords.length > 0 ? `
                <div class="article-keywords">
                    ${article.keywords.map(keyword => `<span class="keyword">${keyword}</span>`).join('')}
                </div>
            ` : ''}
            <div class="article-actions">
                <button class="simple-btn read-status" onclick="window.markAsRead('${article.id}')">
                    ${article.readStatus === 'read' ? '未読' : '既読'}
                </button>
                <button class="simple-btn read-later" data-active="${article.readLater}" onclick="window.toggleReadLater('${article.id}')">
                    ${article.readLater ? '解除' : '後で'}
                </button>
                <button class="simple-btn" onclick="window.removeArticle('${article.id}')">削除</button>
            </div>
            ${window.createStarRating(article.userRating, article.id)}
        </div>
    `;
};

const renderWordModal = () => {
    const wordHook = window.DataHooks.useWordFilters();
    
    return `
        <div class="modal-overlay">
            <div class="modal">
                <div class="modal-header">
                    <h2>ワード管理</h2>
                    <button class="modal-close" onclick="window.closeModal()">×</button>
                </div>
                <div class="modal-body">
                    <div class="word-section">
                        <div class="word-section-header">
                            <h3>興味のあるワード</h3>
                            <button class="action-btn" onclick="window.addInterestWord()">追加</button>
                        </div>
                        <div class="word-list">
                            ${wordHook.wordFilters.interestWords.map(word => 
                                `<span class="word-tag interest">${word}<button class="word-remove" onclick="window.removeInterestWord('${word}')">×</button></span>`
                            ).join('')}
                        </div>
                    </div>
                    
                    <div class="word-section">
                        <div class="word-section-header">
                            <h3>除外ワード</h3>
                            <button class="action-btn" onclick="window.addNGWord()">追加</button>
                        </div>
                        <div class="word-list">
                            ${wordHook.wordFilters.ngWords.map(word => 
                                `<span class="word-tag ng">${word}<button class="word-remove" onclick="window.removeNGWord('${word}')">×</button></span>`
                            ).join('')}
                        </div>
                    </div>
                    
                    <div class="word-help">
                        <h4>ワードフィルター機能について</h4>
                        <p><strong>興味のあるワード:</strong> これらのワードを含む記事のAIスコアが上がります</p>
                        <p><strong>除外ワード:</strong> これらのワードを含む記事は表示されません</p>
                        <ul>
                            <li>大文字・小文字は区別されません</li>
                            <li>部分一致で検索されます</li>
                            <li>記事のタイトルと本文が対象です</li>
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
        <div class="modal-overlay">
            <div class="modal">
                <div class="modal-header">
                    <h2>設定</h2>
                    <button class="modal-close" onclick="window.closeModal()">×</button>
                </div>
                <div class="modal-body">
                    <div class="modal-actions">
                        <button class="action-btn" onclick="window.showWordModal()">ワード管理</button>
                    </div>
                    
                    <h3>データ管理</h3>
                    <div class="modal-actions">
                        <button class="action-btn" onclick="window.handleExportLearningData()">学習データエクスポート</button>
                        <label class="action-btn" style="cursor: pointer;">
                            学習データインポート
                            <input type="file" accept=".json" onchange="window.handleImportLearningData(event)" style="display: none;">
                        </label>
                    </div>
                    
                    <h3>ストレージ情報</h3>
                    <p>使用容量: ${Math.round(storageInfo.totalSize / 1024)}KB / 5MB</p>
                    <p>保存アイテム数: ${storageInfo.itemCount}個</p>
                    <p>残り容量: ${Math.round(storageInfo.available / 1024)}KB</p>
                    
                    <h3>アプリ情報</h3>
                    <p>バージョン: 1.0</p>
                    <p>データ形式: ${window.CONFIG.DATA_VERSION}</p>
                    <p>GitHub Actions対応</p>
                </div>
            </div>
        </div>
    `;
};

const renderModal = () => {
    switch (window.state.showModal) {
        case 'word':
            return renderWordModal();
        case 'settings':
            return renderSettingsModal();
        default:
            return '';
    }
};

// ===========================================
// メインレンダリング関数
// ===========================================

window.render = () => {
    const filteredArticles = getFilteredArticles();
    
    const app = document.getElementById('app');
    app.innerHTML = `
        ${renderNavigation()}
        <main class="main-content">
            <div class="article-grid">
                ${filteredArticles.length > 0 ? 
                    filteredArticles.map(article => renderArticleCard(article)).join('') :
                    '<div class="empty-message">表示する記事がありません</div>'
                }
            </div>
        </main>
        ${renderModal()}
    `;
    
    // セレクトボックスの値を設定
    const viewModeSelect = document.getElementById('viewMode');
    const folderFilterSelect = document.getElementById('folderFilter');
    
    if (viewModeSelect) {
        viewModeSelect.value = window.state.viewMode;
    }
    
    if (folderFilterSelect) {
        folderFilterSelect.value = window.state.selectedFolder;
    }
};

// ===========================================
// アプリケーション初期化
// ===========================================

document.addEventListener('DOMContentLoaded', () => {
    initializeData();
    window.render();
    
    // PWA更新チェック
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(() => console.log('Service Worker registered'))
            .catch(err => console.log('Service Worker registration failed'));
    }
});

})();
