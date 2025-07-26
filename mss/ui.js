// Minews PWA - UI・表示レイヤー
(function() {
'use strict';

// ===========================================
// アプリケーション状態管理
// ===========================================

window.state = {
    viewMode: 'all',
    selectedRssSource: 'all',
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
        selectedRssSource: 'all'
    });

    Object.assign(window.DataHooksCache, {
        articles: articlesData,
        rssFeeds: rssData,
        aiLearning: aiData,
        wordFilters: wordData
    });

    window.state.articles = articlesData;
    window.state.viewMode = viewSettings.viewMode;
    window.state.selectedRssSource = viewSettings.selectedRssSource;

    if (window.state.articles.length === 0) {
        const sampleArticles = [
            {
                id: 'sample_1',
                title: 'Minews PWA：RSS配信元フィルター機能実装完了',
                url: '#',
                content: 'RSSフィードの配信元でフィルタリングできる機能を追加しました。記事表示も配信元でフィルタリングでき、情報収集効率が向上。',
                publishDate: new Date().toISOString(),
                rssSource: 'NHKニュース',
                category: 'Design',
                readStatus: 'unread',
                readLater: false,
                userRating: 0,
                keywords: ['RSS', '配信元フィルター', '機能追加']
            },
            {
                id: 'sample_2',
                title: 'RSS配信元別フィルタリングで記事整理が便利に',
                url: '#',
                content: 'NHK、ITmedia、ブログなど配信元別にRSS記事を分類。記事表示も配信元でフィルタリングでき、情報収集効率が大幅向上。',
                publishDate: new Date(Date.now() - 3600000).toISOString(),
                rssSource: 'ITmedia',
                category: 'UX',
                readStatus: 'unread',
                readLater: false,
                userRating: 0,
                keywords: ['RSS配信元', '記事整理', '分類', 'フィルタリング', '効率化']
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

window.truncateText = (text, maxLength = 200) => 
    text.length <= maxLength ? text : text.substring(0, maxLength).trim() + '...';

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
// UI コンポーネント
// ===========================================

const renderNavigation = () => {
    const articles = window.state.articles || [];

    // RSS配信元選択の生成
    const rssSourceOptions = [
        { value: 'all', text: '全配信元' },
        ...Array.from(new Set(articles.map(article => article.rssSource)))
            .filter(source => source)
            .map(source => ({
                value: source,
                text: source
            }))
    ];

    const rssSourceSelect = `
        <div class="filter-group">
            <label for="rss-source-filter">配信元:</label>
            <select id="rss-source-filter" class="filter-select">
                ${rssSourceOptions.map(option => 
                    `<option value="${option.value}" ${window.state.selectedRssSource === option.value ? 'selected' : ''}>${option.text}</option>`
                ).join('')}
            </select>
        </div>
    `;

    const viewModeSelect = `
        <div class="filter-group">
            <label for="view-mode">表示:</label>
            <select id="view-mode" class="filter-select">
                <option value="all" ${window.state.viewMode === 'all' ? 'selected' : ''}>全て</option>
                <option value="unread" ${window.state.viewMode === 'unread' ? 'selected' : ''}>未読のみ</option>
                <option value="read" ${window.state.viewMode === 'read' ? 'selected' : ''}>既読のみ</option>
                <option value="read-later" ${window.state.viewMode === 'read-later' ? 'selected' : ''}>後で読む</option>
            </select>
        </div>
    `;

    return `
        <nav class="nav">
            <div class="nav-left">
                <h1>📰 Minews</h1>
                <div class="last-update">
                    最終更新: ${window.state.lastUpdate ? window.formatDate(window.state.lastUpdate) : '未取得'}
                </div>
            </div>
            <div class="nav-filters">
                ${viewModeSelect}
                ${rssSourceSelect}
            </div>
            <div class="nav-actions">
                <button class="action-btn refresh-btn" onclick="window.handleRefresh()" ${window.state.isLoading ? 'disabled' : ''}>
                    ${window.state.isLoading ? '更新中...' : '🔄 更新'}
                </button>
                <button class="action-btn" onclick="window.showModal('settings')">⚙️ 設定</button>
            </div>
        </nav>
    `;
};

const renderArticleCard = (article) => {
    const aiHook = window.DataHooks.useAILearning();
    const wordHook = window.DataHooks.useWordFilters();
    const aiScore = window.AIScoring.calculateScore(article, aiHook.aiLearning, wordHook.wordFilters);

    return `
        <div class="article-card" data-read-status="${article.readStatus}">
            <div class="article-header">
                <div class="article-title">
                    <a href="${article.url}" target="_blank">${window.escapeXml(article.title)}</a>
                </div>
                <div class="article-meta">
                    <span class="date">${window.formatDate(article.publishDate)}</span>
                    <span class="source">${window.escapeXml(article.rssSource)}</span>
                    <span class="category">${window.escapeXml(article.category)}</span>
                    <span class="ai-score">AI: ${aiScore}</span>
                    ${article.userRating > 0 ? `<span class="rating-badge">★${article.userRating}</span>` : ''}
                </div>
            </div>
            <div class="article-content">
                ${window.escapeXml(window.truncateText(article.content))}
            </div>
            <div class="article-keywords">
                ${(article.keywords || []).map(keyword => 
                    `<span class="keyword">${window.escapeXml(keyword)}</span>`
                ).join('')}
            </div>
            <div class="article-actions">
                <button class="simple-btn read-status" onclick="window.toggleReadStatus('${article.id}')">
                    ${article.readStatus === 'read' ? '未読' : '既読'}
                </button>
                <button class="simple-btn read-later" data-active="${article.readLater}" onclick="window.toggleReadLater('${article.id}')">
                    ${article.readLater ? '解除' : '後読'}
                </button>
            </div>
            ${window.createStarRating(article.userRating, article.id)}
        </div>
    `;
};

const renderArticleGrid = () => {
    const articles = window.state.articles || [];
    
    if (articles.length === 0) {
        return `
            <div class="main-content">
                <div class="empty-message">
                    📄 記事がありません<br>
                    更新ボタンを押して記事を取得してください
                </div>
            </div>
        `;
    }

    const aiHook = window.DataHooks.useAILearning();
    const wordHook = window.DataHooks.useWordFilters();

    // 記事フィルタリング
    const filteredArticles = articles.filter(article => {
        // RSS配信元でのフィルタリング
        const matchesRssSource = window.state.selectedRssSource === 'all' || 
            article.rssSource === window.state.selectedRssSource;

        // 表示モードでのフィルタリング
        const matchesViewMode = (() => {
            switch (window.state.viewMode) {
                case 'unread': return article.readStatus === 'unread';
                case 'read': return article.readStatus === 'read';
                case 'read-later': return article.readLater === true;
                case 'all':
                default: return true;
            }
        })();

        return matchesRssSource && matchesViewMode;
    });

    // NGワードフィルタリング
    const finalArticles = window.AIScoring.filterArticles(filteredArticles, wordHook.wordFilters);
    
    // AIスコア順ソート
    const sortedArticles = window.AIScoring.sortArticlesByScore(finalArticles, aiHook.aiLearning, wordHook.wordFilters);

    if (sortedArticles.length === 0) {
        return `
            <div class="main-content">
                <div class="empty-message">
                    🔍 フィルター条件に該当する記事がありません
                </div>
            </div>
        `;
    }

    return `
        <div class="main-content">
            <div class="article-grid">
                ${sortedArticles.map(article => renderArticleCard(article)).join('')}
            </div>
        </div>
    `;
};

// ===========================================
// モーダル管理
// ===========================================

const renderWordManagementModal = () => {
    const wordHook = window.DataHooks.useWordFilters();
    
    return `
        <div class="modal-overlay" onclick="window.closeModal(event)">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h2>🏷️ ワード管理</h2>
                    <button class="modal-close" onclick="window.closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="word-section">
                        <div class="word-section-header">
                            <h3>興味ワード (記事スコア+10)</h3>
                            <div>
                                <input type="text" id="interest-word-input" placeholder="興味ワードを入力" style="margin-right: 0.5rem; padding: 0.4rem; border: 1px solid #ddd; border-radius: 4px;">
                                <button class="action-btn success" onclick="window.addInterestWord()">追加</button>
                            </div>
                        </div>
                        <div class="word-list">
                            ${(wordHook.wordFilters.interestWords || []).map(word => 
                                `<span class="word-tag interest">${window.escapeXml(word)}<button class="word-remove" onclick="window.removeInterestWord('${word}')">&times;</button></span>`
                            ).join('') || '<span class="text-muted">興味ワードが登録されていません</span>'}
                        </div>
                    </div>

                    <div class="word-section">
                        <div class="word-section-header">
                            <h3>NGワード (記事を非表示)</h3>
                            <div>
                                <input type="text" id="ng-word-input" placeholder="NGワードを入力" style="margin-right: 0.5rem; padding: 0.4rem; border: 1px solid #ddd; border-radius: 4px;">
                                <button class="action-btn danger" onclick="window.addNGWord()">追加</button>
                            </div>
                        </div>
                        <div class="word-list">
                            ${(wordHook.wordFilters.ngWords || []).map(word => 
                                `<span class="word-tag ng">${window.escapeXml(word)}<button class="word-remove" onclick="window.removeNGWord('${word}')">&times;</button></span>`
                            ).join('') || '<span class="text-muted">NGワードが登録されていません</span>'}
                        </div>
                    </div>

                    <div class="word-help">
                        <h4>💡 使い方</h4>
                        <ul>
                            <li><strong>興味ワード:</strong> タイトルや内容に含まれる記事のAIスコアが上がります</li>
                            <li><strong>NGワード:</strong> タイトルや内容に含まれる記事が非表示になります</li>
                            <li>大文字・小文字は区別されません</li>
                            <li>部分一致で判定されます</li>
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
        <div class="modal-overlay" onclick="window.closeModal(event)">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h2>⚙️ 設定</h2>
                    <button class="modal-close" onclick="window.closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="modal-actions">
                        <h3>🧠 学習データ管理</h3>
                        <p>AI学習データとワードフィルターの設定をバックアップ・復元</p>
                        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem;">
                            <button class="action-btn success" onclick="window.handleExportLearningData()">📤 エクスポート</button>
                            <input type="file" id="import-file" accept=".json" onchange="window.handleImportLearningData(event)" style="display: none;">
                            <button class="action-btn" onclick="document.getElementById('import-file').click()">📥 インポート</button>
                            <button class="action-btn" onclick="window.showModal('words')">🏷️ ワード管理</button>
                        </div>
                    </div>

                    <div style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #eee;">
                        <h3>💾 ストレージ使用量</h3>
                        <div>
                            <strong>使用量:</strong> ${Math.round(storageInfo.totalSize / 1024)}KB / 
                            <strong>項目数:</strong> ${storageInfo.itemCount} / 
                            <strong>残り:</strong> ${Math.round(storageInfo.available / 1024)}KB
                        </div>
                    </div>

                    <div style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #eee;">
                        <h3>ℹ️ アプリ情報</h3>
                        <p><strong>バージョン:</strong> ${window.CONFIG.DATA_VERSION}</p>
                        <p><strong>更新方式:</strong> GitHub Actions RSS取得</p>
                        <p><strong>最大記事数:</strong> ${window.CONFIG.MAX_ARTICLES}件</p>
                    </div>
                </div>
            </div>
        </div>
    `;
};

// ===========================================
// イベントハンドラー
// ===========================================

// 記事操作
window.toggleReadStatus = (articleId) => {
    const articlesHook = window.DataHooks.useArticles();
    const article = window.state.articles.find(a => a.id === articleId);
    if (article) {
        const newStatus = article.readStatus === 'read' ? 'unread' : 'read';
        articlesHook.updateArticle(articleId, { readStatus: newStatus });
    }
};

window.toggleReadLater = (articleId) => {
    const articlesHook = window.DataHooks.useArticles();
    const article = window.state.articles.find(a => a.id === articleId);
    if (article) {
        articlesHook.updateArticle(articleId, { readLater: !article.readLater });
    }
};

window.rateArticle = (articleId, rating) => {
    const articlesHook = window.DataHooks.useArticles();
    const aiHook = window.DataHooks.useAILearning();
    const article = window.state.articles.find(a => a.id === articleId);
    
    if (article) {
        const oldRating = article.userRating;
        articlesHook.updateArticle(articleId, { userRating: rating });
        
        // 既存評価を取り消し、新評価を適用
        if (oldRating > 0) {
            aiHook.updateLearningData(article, oldRating, true);
        }
        aiHook.updateLearningData(article, rating, false);
    }
};

// フィルター操作
window.handleViewModeChange = () => {
    const viewMode = document.getElementById('view-mode')?.value || 'all';
    window.setState({ viewMode });
    
    // 設定を保存
    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.VIEW_SETTINGS, {
        viewMode: window.state.viewMode,
        selectedRssSource: window.state.selectedRssSource
    });
};

window.handleRssSourceChange = () => {
    const selectedRssSource = document.getElementById('rss-source-filter')?.value || 'all';
    window.setState({ selectedRssSource });
    
    // 設定を保存
    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.VIEW_SETTINGS, {
        viewMode: window.state.viewMode,
        selectedRssSource: window.state.selectedRssSource
    });
};

// データ更新
window.handleRefresh = async () => {
    if (window.state.isLoading) return;
    
    window.setState({ isLoading: true });
    
    try {
        const rssHook = window.DataHooks.useRSSManager();
        const result = await rssHook.fetchAllFeeds();
        
        window.state.articles = window.DataHooksCache.articles;
        window.state.lastUpdate = result.lastUpdated;
        window.setState({ isLoading: false });
        
        alert(`更新完了: ${result.totalAdded}件の記事を追加しました`);
    } catch (error) {
        console.error('更新エラー:', error);
        alert('更新に失敗しました: ' + error.message);
        window.setState({ isLoading: false });
    }
};

// モーダル操作
window.showModal = (modalType) => {
    window.setState({ showModal: modalType });
};

window.closeModal = (event) => {
    if (!event || event.target.classList.contains('modal-overlay') || event.target.classList.contains('modal-close')) {
        window.setState({ showModal: null });
    }
};

// ワード管理
window.addInterestWord = () => {
    const input = document.getElementById('interest-word-input');
    const word = input?.value?.trim();
    if (word) {
        const wordHook = window.DataHooks.useWordFilters();
        if (wordHook.addInterestWord(word)) {
            input.value = '';
            window.render();
        } else {
            alert('既に登録されている単語です');
        }
    }
};

window.removeInterestWord = (word) => {
    const wordHook = window.DataHooks.useWordFilters();
    wordHook.removeInterestWord(word);
    window.render();
};

window.addNGWord = () => {
    const input = document.getElementById('ng-word-input');
    const word = input?.value?.trim();
    if (word) {
        const wordHook = window.DataHooks.useWordFilters();
        if (wordHook.addNGWord(word)) {
            input.value = '';
            window.render();
        } else {
            alert('既に登録されている単語です');
        }
    }
};

window.removeNGWord = (word) => {
    const wordHook = window.DataHooks.useWordFilters();
    wordHook.removeNGWord(word);
    window.render();
};

// ===========================================
// メインレンダリング
// ===========================================

window.render = () => {
    const app = document.getElementById('app');
    if (!app) return;

    let modalContent = '';
    if (window.state.showModal === 'words') {
        modalContent = renderWordManagementModal();
    } else if (window.state.showModal === 'settings') {
        modalContent = renderSettingsModal();
    }

    app.innerHTML = `
        <div class="app">
            ${renderNavigation()}
            ${renderArticleGrid()}
            ${modalContent}
        </div>
    `;

    // イベントリスナーの再設定
    const viewModeSelect = document.getElementById('view-mode');
    const rssSourceSelect = document.getElementById('rss-source-filter');
    
    if (viewModeSelect) {
        viewModeSelect.addEventListener('change', window.handleViewModeChange);
    }
    
    if (rssSourceSelect) {
        rssSourceSelect.addEventListener('change', window.handleRssSourceChange);
    }
};

// ===========================================
// アプリケーション初期化
// ===========================================

window.initializeApp = () => {
    initializeData();
    window.render();
    
    // 自動更新（初回のみ）
    if (window.state.articles.length === 0 || !window.state.lastUpdate) {
        setTimeout(() => {
            window.handleRefresh();
        }, 1000);
    }
};

})();
