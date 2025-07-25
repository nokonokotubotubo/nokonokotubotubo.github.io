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
            stars += `<span class="star ${filled}" onclick="updateRating('${articleId}', ${i})">★</span>`;
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

    // RSSデータエクスポート（OPML形式）
    window.handleExportRSSData = () => {
        const rssHook = window.DataHooks.useRSSManager();
        const foldersHook = window.DataHooks.useFolders();

        let opmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
<head>
    <title>Minews RSS Feeds Export</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
</head>
<body>`;

        // フォルダごとにグループ化
        foldersHook.folders.forEach(folder => {
            const feedsInFolder = rssHook.rssFeeds.filter(feed => feed.folderId === folder.id);
            if (feedsInFolder.length > 0) {
                opmlContent += `
    <outline text="${window.escapeXml(folder.name)}" title="${window.escapeXml(folder.name)}">`;
                feedsInFolder.forEach(feed => {
                    opmlContent += `
        <outline type="rss" text="${window.escapeXml(feed.title)}" title="${window.escapeXml(feed.title)}" xmlUrl="${window.escapeXml(feed.url)}" />`;
                });
                opmlContent += `
    </outline>`;
            }
        });

        // 未分類のフィード
        const uncategorizedFeeds = rssHook.rssFeeds.filter(feed => 
            !foldersHook.folders.some(folder => folder.id === feed.folderId)
        );
        if (uncategorizedFeeds.length > 0) {
            uncategorizedFeeds.forEach(feed => {
                opmlContent += `
    <outline type="rss" text="${window.escapeXml(feed.title)}" title="${window.escapeXml(feed.title)}" xmlUrl="${window.escapeXml(feed.url)}" />`;
            });
        }

        opmlContent += `
</body>
</opml>`;

        const dataBlob = new Blob([opmlContent], { type: 'text/xml' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `minews_rss_feeds_${new Date().toISOString().split('T')[0]}.opml`;
        link.click();
        alert('RSSフィードをOPML形式でエクスポートしました');
    };

    // RSSデータインポート（OPML形式）
    window.handleImportRSSData = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const opmlContent = e.target.result;
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(opmlContent, 'text/xml');

                const parseError = xmlDoc.querySelector('parsererror');
                if (parseError) {
                    throw new Error('OPML解析エラー: ' + parseError.textContent);
                }

                const rssHook = window.DataHooks.useRSSManager();
                const foldersHook = window.DataHooks.useFolders();
                let importedCount = 0;

                // フォルダ構造を持つoutlineを処理
                const folderOutlines = xmlDoc.querySelectorAll('body > outline:not([type="rss"])');
                folderOutlines.forEach(folderOutline => {
                    const folderName = folderOutline.getAttribute('text') || folderOutline.getAttribute('title');
                    if (!folderName) return;

                    // フォルダを作成または取得
                    let folder = foldersHook.folders.find(f => f.name === folderName);
                    if (!folder) {
                        folder = foldersHook.addFolder(folderName, window.CONFIG.FOLDER_COLORS[0].value);
                    }

                    // フォルダ内のRSSフィードを処理
                    const feedOutlines = folderOutline.querySelectorAll('outline[type="rss"]');
                    feedOutlines.forEach(outline => {
                        const title = outline.getAttribute('text') || outline.getAttribute('title');
                        const url = outline.getAttribute('xmlUrl');
                        if (url && title) {
                            rssHook.addRSSFeed(url, title, folder.id);
                            importedCount++;
                        }
                    });
                });

                // 直接のRSSフィード（フォルダなし）を処理
                const directFeeds = xmlDoc.querySelectorAll('body > outline[type="rss"]');
                directFeeds.forEach(outline => {
                    const title = outline.getAttribute('text') || outline.getAttribute('title');
                    const url = outline.getAttribute('xmlUrl');
                    if (url && title) {
                        rssHook.addRSSFeed(url, title, 'default-general');
                        importedCount++;
                    }
                });

                alert(`${importedCount}個のRSSフィードをインポートしました`);
                window.render();
            } catch (error) {
                alert('OPMLインポートに失敗しました: ' + error.message);
            }
        };
        reader.readAsText(file);

        // ファイル選択をリセット
        event.target.value = '';
    };

    // =========================================== 
    // イベントハンドラ 
    // =========================================== 
    window.updateRating = (articleId, rating) => {
        const articlesHook = window.DataHooks.useArticles();
        const aiHook = window.DataHooks.useAILearning();
        const article = window.state.articles.find(a => a.id === articleId);

        if (article) {
            // 既存評価を取り消し
            if (article.userRating > 0) {
                aiHook.updateLearningData(article, article.userRating, true);
            }

            // 新しい評価を適用
            articlesHook.updateArticle(articleId, { userRating: rating });
            aiHook.updateLearningData(article, rating);
        }
    };

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

    window.markAsRead = (url, articleId) => {
        window.toggleReadStatus(articleId);
        window.open(url, '_blank');
    };

    window.refreshFeeds = async () => {
        window.setState({ isLoading: true });
        
        try {
            const rssHook = window.DataHooks.useRSSManager();
            const result = await rssHook.fetchAllFeeds();
            
            let message = `更新完了!\n`;
            message += `新着記事: ${result.totalAdded}件\n`;
            message += `対象フィード: ${result.totalFeeds}件\n`;
            
            if (result.totalErrors > 0) {
                message += `エラー: ${result.totalErrors}件\n\n`;
                message += `詳細:\n`;
                result.feedResults.forEach(feed => {
                    if (!feed.success) {
                        message += `・${feed.name}: ${feed.error}\n`;
                    }
                });
            } else {
                message += `\n詳細:\n`;
                result.feedResults.forEach(feed => {
                    if (feed.success) {
                        message += `・${feed.name}: ${feed.added}/${feed.total}件追加\n`;
                    }
                });
            }
            
            alert(message);
            window.setState({ 
                lastUpdate: new Date().toISOString(),
                articles: window.DataHooksCache.articles
            });
        } catch (error) {
            alert('更新中にエラーが発生しました: ' + error.message);
        } finally {
            window.setState({ isLoading: false });
        }
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

    // RSS管理
    window.addRSSFeed = () => {
        const url = prompt('RSS URLを入力してください:');
        if (!url) return;

        const foldersHook = window.DataHooks.useFolders();
        if (foldersHook.folders.length === 0) {
            alert('先にフォルダを作成してください');
            return;
        }

        // フォルダ選択
        const folderOptions = foldersHook.folders.map(folder => 
            `${folder.name} (${folder.id})`
        ).join('\n');
        
        const selectedFolder = prompt(`フォルダを選択してください:\n\n${folderOptions}\n\nフォルダID を入力:`);
        if (!selectedFolder) return;

        const folder = foldersHook.folders.find(f => f.id === selectedFolder);
        if (!folder) {
            alert('無効なフォルダIDです');
            return;
        }

        const title = prompt('フィードのタイトル（省略可）:') || 'Unknown Feed';
        
        try {
            const rssHook = window.DataHooks.useRSSManager();
            rssHook.addRSSFeed(url, title, folder.id);
            alert('RSSフィードを追加しました');
            window.render();
        } catch (error) {
            alert('RSS追加に失敗しました: ' + error.message);
        }
    };

    window.removeRSSFeed = (feedId) => {
        if (confirm('このRSSフィードを削除しますか？')) {
            const rssHook = window.DataHooks.useRSSManager();
            rssHook.removeRSSFeed(feedId);
            alert('RSSフィードを削除しました');
            window.render();
        }
    };

    window.toggleRSSActive = (feedId) => {
        const rssHook = window.DataHooks.useRSSManager();
        const feed = rssHook.rssFeeds.find(f => f.id === feedId);
        if (feed) {
            rssHook.updateRSSFeed(feedId, { isActive: !feed.isActive });
            window.render();
        }
    };

    // フォルダ管理
    window.addFolder = () => {
        const name = prompt('フォルダ名を入力してください:');
        if (!name || !name.trim()) return;

        const colorOptions = window.CONFIG.FOLDER_COLORS.map((color, index) => 
            `${index + 1}. ${color.name} (${color.value})`
        ).join('\n');
        
        const colorIndex = prompt(`カラーを選択してください:\n\n${colorOptions}\n\n番号を入力:`);
        if (!colorIndex) return;

        const selectedColor = window.CONFIG.FOLDER_COLORS[parseInt(colorIndex) - 1];
        if (!selectedColor) {
            alert('無効な色番号です');
            return;
        }

        try {
            const foldersHook = window.DataHooks.useFolders();
            const result = foldersHook.addFolder(name.trim(), selectedColor.value);
            if (result) {
                alert('フォルダを追加しました');
                window.render();
            } else {
                alert('フォルダの追加に失敗しました');
            }
        } catch (error) {
            alert('フォルダ追加に失敗しました: ' + error.message);
        }
    };

    window.removeFolder = (folderId) => {
        if (confirm('このフォルダを削除しますか？\n※フォルダ内にRSSフィードがある場合は削除できません')) {
            const foldersHook = window.DataHooks.useFolders();
            const result = foldersHook.removeFolder(folderId);
            
            if (result.success) {
                alert('フォルダを削除しました');
                window.render();
            } else if (result.reason === 'FEEDS_EXIST') {
                alert(`フォルダ内に${result.feedCount}個のRSSフィードがあるため削除できません。\n先にRSSフィードを移動または削除してください。`);
            } else {
                alert('フォルダの削除に失敗しました');
            }
        }
    };

    // ワード管理
    window.addInterestWord = () => {
        const word = prompt('興味のあるワードを入力してください:');
        if (!word || !word.trim()) return;

        const wordHook = window.DataHooks.useWordFilters();
        if (wordHook.addInterestWord(word.trim())) {
            alert('興味ワードを追加しました');
            window.render();
        } else {
            alert('既に登録されているワードです');
        }
    };

    window.removeInterestWord = (word) => {
        if (confirm(`「${word}」を興味ワードから削除しますか？`)) {
            const wordHook = window.DataHooks.useWordFilters();
            wordHook.removeInterestWord(word);
            window.render();
        }
    };

    window.addNGWord = () => {
        const word = prompt('NGワードを入力してください:');
        if (!word || !word.trim()) return;

        const wordHook = window.DataHooks.useWordFilters();
        if (wordHook.addNGWord(word.trim())) {
            alert('NGワードを追加しました');
            window.render();
        } else {
            alert('既に登録されているワードです');
        }
    };

    window.removeNGWord = (word) => {
        if (confirm(`「${word}」をNGワードから削除しますか？`)) {
            const wordHook = window.DataHooks.useWordFilters();
            wordHook.removeNGWord(word);
            window.render();
        }
    };

    // =========================================== 
    // レンダリング 
    // =========================================== 
    window.render = () => {
        const app = document.getElementById('root');
        if (!app) return;

        // データ取得
        const articlesHook = window.DataHooks.useArticles();
        const aiHook = window.DataHooks.useAILearning();
        const wordHook = window.DataHooks.useWordFilters();
        const foldersHook = window.DataHooks.useFolders();
        const rssHook = window.DataHooks.useRSSManager();

        // 記事のフィルタリングとソート
        let filteredArticles = [...window.state.articles];

        // ビューモードフィルタ
        if (window.state.viewMode === 'unread') {
            filteredArticles = filteredArticles.filter(article => article.readStatus === 'unread');
        } else if (window.state.viewMode === 'read') {
            filteredArticles = filteredArticles.filter(article => article.readStatus === 'read');
        } else if (window.state.viewMode === 'readLater') {
            filteredArticles = filteredArticles.filter(article => article.readLater);
        }

        // フォルダフィルタ
        if (window.state.selectedFolder !== 'all') {
            const selectedFeedIds = rssHook.rssFeeds
                .filter(feed => feed.folderId === window.state.selectedFolder)
                .map(feed => feed.title);
            
            filteredArticles = filteredArticles.filter(article => 
                selectedFeedIds.some(feedTitle => 
                    article.rssSource === feedTitle || 
                    article.rssSource.includes(feedTitle) ||
                    feedTitle.includes(article.rssSource)
                )
            );
        }

        // NGワードフィルタ
        filteredArticles = window.WordFilterManager.filterArticles(filteredArticles, wordHook.wordFilters);

        // AIスコアでソート
        filteredArticles = window.AIScoring.sortArticlesByScore(filteredArticles, aiHook.aiLearning, wordHook.wordFilters);

        app.innerHTML = `
            <div class="app">
                <nav class="nav">
                    <div class="nav-left">
                        <h1>Minews</h1>
                        ${window.state.lastUpdate ? `<div class="last-update">最終更新: ${window.formatDate(window.state.lastUpdate)}</div>` : ''}
                    </div>
                    <div class="nav-filters">
                        <div class="filter-group">
                            <label>表示:</label>
                            <select class="filter-select" onchange="setState({viewMode: this.value})">
                                <option value="all" ${window.state.viewMode === 'all' ? 'selected' : ''}>すべて</option>
                                <option value="unread" ${window.state.viewMode === 'unread' ? 'selected' : ''}>未読</option>
                                <option value="read" ${window.state.viewMode === 'read' ? 'selected' : ''}>既読</option>
                                <option value="readLater" ${window.state.viewMode === 'readLater' ? 'selected' : ''}>後で読む</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <label>フォルダ:</label>
                            <select class="filter-select" onchange="setState({selectedFolder: this.value})">
                                <option value="all" ${window.state.selectedFolder === 'all' ? 'selected' : ''}>すべて</option>
                                ${foldersHook.folders.map(folder => 
                                    `<option value="${folder.id}" ${window.state.selectedFolder === folder.id ? 'selected' : ''}>${folder.name}</option>`
                                ).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="nav-actions">
                        <button class="action-btn refresh-btn ${window.state.isLoading ? 'loading' : ''}" 
                                onclick="refreshFeeds()" ${window.state.isLoading ? 'disabled' : ''}>
                            ${window.state.isLoading ? '更新中...' : '更新'}
                        </button>
                        <button class="action-btn" onclick="showModal('rss')">RSS管理</button>
                        <button class="action-btn" onclick="showModal('words')">ワード管理</button>
                        <button class="action-btn" onclick="showModal('folders')">フォルダ管理</button>
                        <button class="action-btn" onclick="showModal('data')">データ管理</button>
                    </div>
                </nav>

                <main class="main-content">
                    ${filteredArticles.length === 0 ? 
                        '<div class="empty-message">記事が見つかりませんでした</div>' :
                        `<div class="article-grid">
                            ${filteredArticles.map(article => `
                                <article class="article-card" data-read-status="${article.readStatus}">
                                    <div class="article-header">
                                        <h2 class="article-title">
                                            <a href="#" onclick="markAsRead('${article.url}', '${article.id}')">${article.title}</a>
                                        </h2>
                                        <div class="article-meta">
                                            <span class="date">${window.formatDate(article.publishDate)}</span>
                                            <span class="source">${article.rssSource}</span>
                                            <span class="category">${article.category}</span>
                                            <span class="ai-score">スコア: ${article.aiScore || 0}</span>
                                            ${article.userRating > 0 ? `<span class="rating-badge">${article.userRating}★</span>` : ''}
                                        </div>
                                    </div>
                                    <div class="article-content">
                                        ${window.truncateText(article.content)}
                                    </div>
                                    ${article.keywords && article.keywords.length > 0 ? `
                                        <div class="article-keywords">
                                            ${article.keywords.map(keyword => `<span class="keyword">${keyword}</span>`).join('')}
                                        </div>
                                    ` : ''}
                                    <div class="article-actions">
                                        <button class="simple-btn read-status" onclick="toggleReadStatus('${article.id}')">
                                            ${article.readStatus === 'read' ? '未読にする' : '既読にする'}
                                        </button>
                                        <button class="simple-btn read-later" data-active="${article.readLater}" onclick="toggleReadLater('${article.id}')">
                                            ${article.readLater ? '後で読む解除' : '後で読む'}
                                        </button>
                                    </div>
                                    ${window.createStarRating(article.userRating, article.id)}
                                </article>
                            `).join('')}
                        </div>`
                    }
                </main>

                ${window.state.showModal ? renderModal() : ''}
            </div>
        `;
    };

    const renderModal = () => {
        const wordHook = window.DataHooks.useWordFilters();
        const rssHook = window.DataHooks.useRSSManager();
        const foldersHook = window.DataHooks.useFolders();

        if (window.state.showModal === 'rss') {
            return `
                <div class="modal-overlay" onclick="closeModal()">
                    <div class="modal" onclick="event.stopPropagation()">
                        <div class="modal-header">
                            <h2>RSS管理</h2>
                            <button class="modal-close" onclick="closeModal()">×</button>
                        </div>
                        <div class="modal-body">
                            <div class="modal-actions">
                                <button class="action-btn success" onclick="addRSSFeed()">RSS追加</button>
                                <button class="action-btn" onclick="handleExportRSSData()">OPML出力</button>
                                <button class="action-btn">
                                    OPML取込
                                    <input type="file" accept=".opml,.xml" onchange="handleImportRSSData(event)" style="position: absolute; opacity: 0; width: 100%; height: 100%; cursor: pointer;">
                                </button>
                            </div>
                            <div class="rss-list">
                                ${rssHook.rssFeeds.map(feed => {
                                    const folder = foldersHook.folders.find(f => f.id === feed.folderId);
                                    return `
                                        <div class="rss-item">
                                            <div class="rss-info">
                                                <strong>${feed.title}</strong>
                                                <span class="rss-url">${feed.url}</span>
                                                <span class="rss-updated">最終更新: ${window.formatDate(feed.lastUpdated)}</span>
                                                <span class="rss-status ${feed.isActive ? 'active' : 'inactive'}">
                                                    ${feed.isActive ? '有効' : '無効'}
                                                </span>
                                                ${folder ? `<div>フォルダ: ${folder.name}</div>` : '<div>フォルダ: 未分類</div>'}
                                            </div>
                                            <div class="rss-actions">
                                                <button class="action-btn" onclick="toggleRSSActive('${feed.id}')">
                                                    ${feed.isActive ? '無効化' : '有効化'}
                                                </button>
                                                <button class="action-btn danger" onclick="removeRSSFeed('${feed.id}')">削除</button>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                            <div class="rss-help">
                                <h4>RSS管理について</h4>
                                <ul>
                                    <li>RSS追加: 新しいRSSフィードを追加します</li>
                                    <li>有効/無効: フィードの取得を制御します</li>
                                    <li>OPML出力: 設定をファイルに保存します</li>
                                    <li>OPML取込: 他のRSSリーダーから設定を読み込みます</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        if (window.state.showModal === 'words') {
            return `
                <div class="modal-overlay" onclick="closeModal()">
                    <div class="modal" onclick="event.stopPropagation()">
                        <div class="modal-header">
                            <h2>ワード管理</h2>
                            <button class="modal-close" onclick="closeModal()">×</button>
                        </div>
                        <div class="modal-body">
                            <div class="word-section">
                                <div class="word-section-header">
                                    <h3>興味のあるワード</h3>
                                    <button class="action-btn success" onclick="addInterestWord()">追加</button>
                                </div>
                                <div class="word-list">
                                    ${wordHook.wordFilters.interestWords.map(word => 
                                        `<span class="word-tag interest">${word}
                                            <button class="word-remove" onclick="removeInterestWord('${word}')">×</button>
                                        </span>`
                                    ).join('')}
                                </div>
                            </div>
                            <div class="word-section">
                                <div class="word-section-header">
                                    <h3>NGワード</h3>
                                    <button class="action-btn danger" onclick="addNGWord()">追加</button>
                                </div>
                                <div class="word-list">
                                    ${wordHook.wordFilters.ngWords.map(word => 
                                        `<span class="word-tag ng">${word}
                                            <button class="word-remove" onclick="removeNGWord('${word}')">×</button>
                                        </span>`
                                    ).join('')}
                                </div>
                            </div>
                            <div class="word-help">
                                <h4>ワードフィルターについて</h4>
                                <ul>
                                    <li>興味ワード: 含む記事のスコアが上がります</li>
                                    <li>NGワード: 含む記事は表示されません</li>
                                    <li>ワードは記事タイトルと内容で判定されます</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        if (window.state.showModal === 'folders') {
            return `
                <div class="modal-overlay" onclick="closeModal()">
                    <div class="modal" onclick="event.stopPropagation()">
                        <div class="modal-header">
                            <h2>フォルダ管理</h2>
                            <button class="modal-close" onclick="closeModal()">×</button>
                        </div>
                        <div class="modal-body">
                            <div class="modal-actions">
                                <button class="action-btn success" onclick="addFolder()">フォルダ追加</button>
                            </div>
                            <div class="rss-list">
                                ${foldersHook.folders.map(folder => {
                                    const feedCount = rssHook.rssFeeds.filter(feed => feed.folderId === folder.id).length;
                                    return `
                                        <div class="rss-item">
                                            <div class="rss-info">
                                                <strong style="color: ${folder.color}">${folder.name}</strong>
                                                <span class="rss-url">作成日: ${window.formatDate(folder.createdAt)}</span>
                                                <div>フィード数: ${feedCount}個</div>
                                                <div>カラー: ${window.FolderManager.getColorName(folder.color)}</div>
                                            </div>
                                            <div class="rss-actions">
                                                <button class="action-btn danger" onclick="removeFolder('${folder.id}')">削除</button>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        if (window.state.showModal === 'data') {
            return `
                <div class="modal-overlay" onclick="closeModal()">
                    <div class="modal" onclick="event.stopPropagation()">
                        <div class="modal-header">
                            <h2>データ管理</h2>
                            <button class="modal-close" onclick="closeModal()">×</button>
                        </div>
                        <div class="modal-body">
                            <div class="word-section">
                                <div class="word-section-header">
                                    <h3>学習データ</h3>
                                </div>
                                <div class="modal-actions">
                                    <button class="action-btn" onclick="handleExportLearningData()">学習データ出力</button>
                                    <button class="action-btn">
                                        学習データ取込
                                        <input type="file" accept=".json" onchange="handleImportLearningData(event)" style="position: absolute; opacity: 0; width: 100%; height: 100%; cursor: pointer;">
                                    </button>
                                </div>
                            </div>
                            <div class="word-help">
                                <h4>データ管理について</h4>
                                <ul>
                                    <li>学習データ出力: AI学習とワードフィルター設定をJSONファイルで保存</li>
                                    <li>学習データ取込: 保存したJSONファイルから設定を復元</li>
                                    <li>データはブラウザのローカルストレージに保存されます</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        return '';
    };

    // =========================================== 
    // アプリケーション初期化 
    // =========================================== 
    document.addEventListener('DOMContentLoaded', () => {
        initializeData();
        window.render();
    });

})();
