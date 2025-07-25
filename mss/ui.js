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
            stars += `<span class="star ${filled}" data-rating="${i}" data-article-id="${articleId}">★</span>`;
        }
        return `<div class="star-rating" onclick="handleStarClick(event)">${stars}</div>`;
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
    <dateModified>${new Date().toUTCString()}</dateModified>
</head>
<body>`;

        // フォルダーマップの作成
        const folderMap = new Map();
        foldersHook.folders.forEach(folder => folderMap.set(folder.id, folder));
        folderMap.set('uncategorized', { id: 'uncategorized', name: '未分類', color: '#6c757d' });

        folderMap.forEach(folder => {
            const feedsInFolder = rssHook.rssFeeds.filter(feed => 
                feed.folderId === 'uncategorized' || feed.folderId === folder.id
            );
            if (feedsInFolder.length > 0) {
                opmlContent += `
    <outline text="${window.escapeXml(folder.name)}" title="${window.escapeXml(folder.name)}">`;
                feedsInFolder.forEach(feed => {
                    opmlContent += `
        <outline text="${window.escapeXml(feed.title)}" title="${window.escapeXml(feed.title)}" type="rss" xmlUrl="${window.escapeXml(feed.url)}" />`;
                });
                opmlContent += `
    </outline>`;
            }
        });

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
                const xmlContent = e.target.result;
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

                const parseError = xmlDoc.querySelector('parsererror');
                if (parseError) {
                    throw new Error('OPML解析エラー: ' + parseError.textContent);
                }

                const rssHook = window.DataHooks.useRSSManager();
                const foldersHook = window.DataHooks.useFolders();
                let importedCount = 0;
                let skippedCount = 0;

                // OPMLの全てのoutlineを処理
                const outlines = xmlDoc.querySelectorAll('outline[xmlUrl]');
                outlines.forEach(outline => {
                    const url = outline.getAttribute('xmlUrl');
                    const title = outline.getAttribute('title') || outline.getAttribute('text') || 'Unknown Feed';
                    const category = outline.getAttribute('category') || outline.parentElement.getAttribute('title') || 'General';

                    if (url) {
                        // 重複チェック
                        const existingFeed = rssHook.rssFeeds.find(feed => 
                            feed.url === url || (feed.url === url.trim() && feed.title === title)
                        );
                        if (existingFeed) {
                            skippedCount++;
                            return;
                        }

                        // フォルダを検索または作成
                        let targetFolder = foldersHook.folders.find(f => f.name === category);
                        if (!targetFolder) {
                            targetFolder = foldersHook.addFolder(category, window.CONFIG.FOLDER_COLORS[0].value);
                        }

                        // RSSフィードを追加
                        rssHook.addRSSFeed(url.trim(), title, targetFolder.id);
                        importedCount++;
                    }
                });

                let message = `${importedCount}個のRSSフィードをインポートしました`;
                if (skippedCount > 0) {
                    message += `\n${skippedCount}個のフィードは既に存在するためスキップしました`;
                }
                alert(message);
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
    window.handleStarClick = (event) => {
        if (!event.target.classList.contains('star')) return;

        const rating = parseInt(event.target.dataset.rating);
        const articleId = event.target.dataset.articleId;

        const articlesHook = window.DataHooks.useArticles();
        const aiHook = window.DataHooks.useAILearning();
        const article = window.state.articles.find(a => a.id === articleId);

        if (!article || article.userRating === rating) return;

        // 既存評価を取り消し
        if (article.userRating > 0) {
            aiHook.updateLearningData(article, article.userRating, true);
        }

        // 新しい評価を適用
        const updateData = { userRating: rating };
        if (rating === 1 || rating === 2) {
            updateData.readStatus = 'read';
        }

        articlesHook.updateArticle(articleId, updateData);
        aiHook.updateLearningData(article, rating);
    };

    window.handleReadStatusToggle = (articleId) => {
        const articlesHook = window.DataHooks.useArticles();
        const article = window.state.articles.find(a => a.id === articleId);
        if (article) {
            const newStatus = article.readStatus === 'read' ? 'unread' : 'read';
            articlesHook.updateArticle(articleId, { readStatus: newStatus });
        }
    };

    window.handleReadLaterToggle = (articleId) => {
        const articlesHook = window.DataHooks.useArticles();
        const article = window.state.articles.find(a => a.id === articleId);
        if (article) {
            articlesHook.updateArticle(articleId, { readLater: !article.readLater });
        }
    };

    window.handleRefresh = async () => {
        if (window.state.isLoading) return;

        window.setState({ isLoading: true });
        
        try {
            const rssHook = window.DataHooks.useRSSManager();
            const result = await rssHook.fetchAllFeeds();
            
            window.setState({ 
                isLoading: false, 
                lastUpdate: new Date().toISOString()
            });

            let message = `更新完了!\n新着記事: ${result.totalAdded}件\n対象フィード: ${result.totalFeeds}件`;
            
            if (result.feedResults?.length > 0) {
                message += '\n\n詳細:\n';
                result.feedResults.forEach(feedResult => {
                    if (feedResult.success) {
                        message += `・${feedResult.name}: ${feedResult.added}/${feedResult.total}件追加\n`;
                    } else {
                        message += `・${feedResult.name}: エラー\n`;
                    }
                });
            }
            
            if (result.totalErrors > 0) {
                message += `\nエラー: ${result.totalErrors}件`;
            }
            
            alert(message);
        } catch (error) {
            window.setState({ isLoading: false });
            alert('更新中にエラーが発生しました: ' + error.message);
        }
    };

    // フィルター関連
    window.handleFilterClick = (mode) => {
        window.setState({ viewMode: mode });
    };

    window.handleFolderFilterClick = (folderId) => {
        window.setState({ selectedFolder: folderId });
    };

    // モーダル関連
    window.handleModalOpen = (modalType) => {
        window.setState({ showModal: modalType });
    };

    window.handleModalClose = () => {
        window.setState({ showModal: null });
    };

    // RSS管理
    window.handleRSSAdd = () => {
        const url = prompt('RSS URLを入力してください:');
        if (!url) return;

        // フォルダ選択モーダルを表示
        showFolderSelectionModal((selectedFolderId) => {
            const rssHook = window.DataHooks.useRSSManager();
            const tempFeed = rssHook.addRSSFeed(url, '...', selectedFolderId);
            
            // フィードのタイトルを取得して更新
            fetchFeedTitleAndUpdate(tempFeed.id, url);
            
            if (window.state.showModal === 'rss') {
                window.render();
            }
        });
    };

    const fetchFeedTitleAndUpdate = async (feedId, url) => {
        try {
            const rssContent = await window.RSSProcessor.fetchRSS(url);
            const parsed = window.RSSProcessor.parseRSS(rssContent, url);
            
            const rssHook = window.DataHooks.useRSSManager();
            rssHook.updateRSSFeed(feedId, {
                title: parsed.feedTitle || new URL(url).hostname,
                lastUpdated: new Date().toISOString()
            });
            
            if (window.state.showModal === 'rss') {
                window.render();
            }
        } catch (error) {
            const rssHook = window.DataHooks.useRSSManager();
            rssHook.updateRSSFeed(feedId, {
                title: new URL(url).hostname,
                lastUpdated: new Date().toISOString()
            });
            
            if (window.state.showModal === 'rss') {
                window.render();
            }
        }
    };

    window.handleRSSEdit = (feedId, field, currentValue) => {
        const rssHook = window.DataHooks.useRSSManager();

        if (field === 'title') {
            const newTitle = prompt('タイトルを入力してください:', currentValue);
            if (newTitle && newTitle.trim() !== currentValue) {
                rssHook.updateRSSFeed(feedId, { title: newTitle.trim() });
                if (window.state.showModal === 'rss') {
                    window.render();
                }
            }
        } else if (field === 'url') {
            const newUrl = prompt('URL を入力してください:', currentValue);
            if (newUrl && newUrl.trim() !== currentValue) {
                rssHook.updateRSSFeed(feedId, { url: newUrl.trim() });
                if (window.state.showModal === 'rss') {
                    window.render();
                }
            }
        } else if (field === 'folder') {
            showFolderSelectionModal((selectedFolderId) => {
                rssHook.updateRSSFeed(feedId, { folderId: selectedFolderId });
                if (window.state.showModal === 'rss') {
                    window.render();
                }
            });
        }
    };

    window.handleRSSRemove = (feedId) => {
        if (!confirm('このRSSフィードを削除しますか？')) return;

        const rssHook = window.DataHooks.useRSSManager();
        rssHook.removeRSSFeed(feedId);
        
        if (window.state.showModal === 'rss') {
            window.render();
        }
    };

    // フォルダ管理 
    window.handleFolderAdd = () => {
        const name = prompt('フォルダ名を入力してください:');
        if (!name || name.trim().length === 0) return;

        if (name.trim().length > 50) {
            alert('フォルダ名は50文字以内で入力してください');
            return;
        }

        // 色選択モーダルを表示
        showColorSelectionModal((selectedColor) => {
            const foldersHook = window.DataHooks.useFolders();
            const newFolder = foldersHook.addFolder(name.trim(), selectedColor);
            
            if (newFolder) {
                if (window.state.showModal === 'folders') {
                    window.render();
                }
            } else {
                alert('フォルダの追加に失敗しました');
            }
        });
    };

    window.handleFolderRemove = (folderId) => {
        const foldersHook = window.DataHooks.useFolders();
        const folder = foldersHook.folders.find(f => f.id === folderId);
        if (!folder) return;

        if (!confirm(`「${folder.name}」フォルダを削除しますか？\n※フォルダ内にRSSフィードがある場合は削除できません`)) return;

        const result = foldersHook.removeFolder(folderId);
        
        if (result.success) {
            if (window.state.selectedFolder === folderId) {
                window.setState({ selectedFolder: 'all' });
            }
            if (window.state.showModal === 'folders') {
                window.render();
            }
        } else if (result.reason === 'FEEDS_EXIST') {
            if (confirm(`フォルダ内に${result.feedCount}個のRSSフィードがあります。\nフィードを未分類に移動してフォルダを削除しますか？`)) {
                const rssHook = window.DataHooks.useRSSManager();
                const feedsToMove = rssHook.rssFeeds.filter(feed => feed.folderId === folderId);
                
                feedsToMove.forEach(feed => {
                    rssHook.updateRSSFeed(feed.id, { folderId: 'uncategorized' });
                });
                
                const retryResult = foldersHook.removeFolder(folderId);
                if (retryResult.success) {
                    if (window.state.selectedFolder === folderId) {
                        window.setState({ selectedFolder: 'all' });
                    }
                    if (window.state.showModal === 'folders') {
                        window.render();
                    }
                    alert(`${feedsToMove.length}個のフィードを未分類に移動し、フォルダを削除しました`);
                }
            }
        }
    };

    // ワード管理
    window.handleWordAdd = (type) => {
        const word = prompt(type === 'interest' ? '興味のあるワードを入力してください:' : 'NGワードを入力してください:');
        if (!word) return;

        const wordHook = window.DataHooks.useWordFilters();
        const success = type === 'interest' ? 
            wordHook.addInterestWord(word) : 
            wordHook.addNGWord(word);

        if (success) {
            if (window.state.showModal === 'words') {
                window.render();
            }
        } else {
            alert('既に登録されているワードです');
        }
    };

    window.handleWordRemove = (word, type) => {
        if (!confirm(`「${word}」を削除しますか？`)) return;

        const wordHook = window.DataHooks.useWordFilters();
        const success = type === 'interest' ? 
            wordHook.removeInterestWord(word) : 
            wordHook.removeNGWord(word);

        if (success) {
            window.state.showModal === 'words' && window.render();
        }
    };

    // フィルター変更
    window.handleFilterChange = (mode) => {
        window.setState({ viewMode: mode });
    };

    window.handleFolderChange = (folderId) => {
        window.setState({ selectedFolder: folderId });
    };

    window.handleRSSMoveFolderChange = (feedId, newFolderId) => {
        const rssHook = window.DataHooks.useRSSManager();
        rssHook.updateRSSFeed(feedId, { folderId: newFolderId });
        if (window.state.showModal === 'rss') {
            window.render();
        }
    };

    // フォルダ・色選択モーダル
    const showFolderSelectionModal = (callback) => {
        const foldersHook = window.DataHooks.useFolders();
        const folderOptions = [
            { id: 'uncategorized', name: '未分類', color: '#6c757d' },
            ...foldersHook.folders
        ];

        const modalId = `folder-selection-modal-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
        // 既存のモーダルを削除
        document.querySelectorAll('[id^="folder-selection-modal-"]').forEach(modal => modal.remove());

        const modalHtml = `
            <div id="${modalId}" class="modal-overlay">
                <div class="modal">
                    <div class="modal-header">
                        <h2>フォルダ選択</h2>
                        <button class="modal-close">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="folder-selection-list">
                            ${folderOptions.map(folder => `
                                <div class="folder-selection-item" data-folder-id="${folder.id}">
                                    <span style="color: ${folder.color}">●</span> ${folder.name}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const modalElement = document.getElementById(modalId);
        
        // 閉じるボタン
        modalElement.querySelector('.modal-close').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            modalElement.remove();
        });

        // フォルダ選択
        modalElement.querySelectorAll('.folder-selection-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const folderId = item.dataset.folderId;
                modalElement.remove();
                callback(folderId);
            });

            // ホバー効果
            item.addEventListener('mouseenter', () => {
                item.style.borderColor = '#4A90A4';
                item.style.background = '#E3F4F7';
            });
            
            item.addEventListener('mouseleave', () => {
                item.style.borderColor = '#e9ecef';
                item.style.background = 'white';
            });
        });

        // オーバーレイクリック
        modalElement.addEventListener('click', (e) => {
            if (e.target === modalElement) {
                modalElement.remove();
            }
        });
    };

    const showColorSelectionModal = (callback) => {
        const modalId = `color-selection-modal-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
        // 既存のモーダルを削除
        document.querySelectorAll('[id^="color-selection-modal-"]').forEach(modal => modal.remove());

        const modalHtml = `
            <div id="${modalId}" class="modal-overlay">
                <div class="modal">
                    <div class="modal-header">
                        <h2>色選択</h2>
                        <button class="modal-close">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="color-selection-list">
                            ${window.CONFIG.FOLDER_COLORS.map(color => `
                                <div class="color-selection-item" data-color-value="${color.value}">
                                    <span style="color: ${color.value}; font-size: 1.2rem;">●</span> ${color.name}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const modalElement = document.getElementById(modalId);
        
        // 閉じるボタン
        modalElement.querySelector('.modal-close').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            modalElement.remove();
        });

        // 色選択
        modalElement.querySelectorAll('.color-selection-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const colorValue = item.dataset.colorValue;
                modalElement.remove();
                callback(colorValue);
            });

            // ホバー効果
            item.addEventListener('mouseenter', () => {
                item.style.borderColor = '#4A90A4';
                item.style.background = '#E3F4F7';
            });
            
            item.addEventListener('mouseleave', () => {
                item.style.borderColor = '#e9ecef';
                item.style.background = 'white';
            });
        });

        // オーバーレイクリック
        modalElement.addEventListener('click', (e) => {
            if (e.target === modalElement) {
                modalElement.remove();
            }
        });
    };

    // =========================================== 
    // データ取得・フィルタリング
    // =========================================== 
    const getFilteredArticles = () => {
        const aiHook = window.DataHooks.useAILearning();
        const wordHook = window.DataHooks.useWordFilters();
        const rssHook = window.DataHooks.useRSSManager();

        // NGワードでフィルタリング
        const filteredByWords = window.WordFilterManager.filterArticles(window.state.articles, wordHook.wordFilters);

        // フォルダでフィルタリング
        let filteredByFolder = filteredByWords;
        if (window.state.selectedFolder !== 'all') {
            if (window.state.selectedFolder === 'uncategorized') {
                const uncategorizedFeeds = rssHook.rssFeeds.filter(feed => !feed.folderId || feed.folderId === 'uncategorized');
                filteredByFolder = filteredByWords.filter(article => {
                    return uncategorizedFeeds.some(feed => {
                        const matched = window.FolderManager.matchArticleToFeed(article, [feed]);
                        return matched !== null;
                    });
                });
            } else {
                const folderFeeds = rssHook.rssFeeds.filter(feed => feed.folderId === window.state.selectedFolder);
                filteredByFolder = filteredByWords.filter(article => {
                    return folderFeeds.some(feed => {
                        const matched = window.FolderManager.matchArticleToFeed(article, [feed]);
                        return matched !== null;
                    });
                });
            }
        }

        // 表示モードでフィルタリング
        let filteredByMode;
        switch (window.state.viewMode) {
            case 'unread':
                filteredByMode = filteredByFolder.filter(article => article.readStatus === 'unread');
                break;
            case 'read':
                filteredByMode = filteredByFolder.filter(article => article.readStatus === 'read');
                break;
            case 'readLater':
                filteredByMode = filteredByFolder.filter(article => article.readLater);
                break;
            default:
                filteredByMode = filteredByFolder;
        }

        // AIスコアでソート
        return window.AIScoring.sortArticlesByScore(filteredByMode, aiHook.aiLearning, wordHook.wordFilters);
    };

    const getFilteredArticleCount = (viewMode, folderId) => {
        const wordHook = window.DataHooks.useWordFilters();
        const rssHook = window.DataHooks.useRSSManager();

        // NGワードでフィルタリング
        const filteredByWords = window.WordFilterManager.filterArticles(window.state.articles, wordHook.wordFilters);

        // フォルダでフィルタリング
        let filteredByFolder = filteredByWords;
        if (folderId && folderId !== 'all') {
            if (folderId === 'uncategorized') {
                const uncategorizedFeeds = rssHook.rssFeeds.filter(feed => !feed.folderId || feed.folderId === 'uncategorized');
                filteredByFolder = filteredByWords.filter(article => {
                    return uncategorizedFeeds.some(feed => {
                        const matched = window.FolderManager.matchArticleToFeed(article, [feed]);
                        return matched !== null;
                    });
                });
            } else {
                const folderFeeds = rssHook.rssFeeds.filter(feed => feed.folderId === folderId);
                filteredByFolder = filteredByWords.filter(article => {
                    return folderFeeds.some(feed => {
                        const matched = window.FolderManager.matchArticleToFeed(article, [feed]);
                        return matched !== null;
                    });
                });
            }
        }

        // 表示モードでフィルタリング
        switch (viewMode) {
            case 'unread':
                return filteredByFolder.filter(article => article.readStatus === 'unread').length;
            case 'read':
                return filteredByFolder.filter(article => article.readStatus === 'read').length;
            case 'readLater':
                return filteredByFolder.filter(article => article.readLater).length;
            default:
                return filteredByFolder.length;
        }
    };

    // =========================================== 
    // レンダリング
    // =========================================== 
    const renderNavigation = () => {
        const modes = [
            { key: 'all', label: 'すべて' },
            { key: 'unread', label: '未読' },
            { key: 'read', label: '既読' },
            { key: 'readLater', label: '後で読む' }
        ];

        const foldersHook = window.DataHooks.useFolders();
        const folderOptions = [
            { id: 'all', name: 'すべて', color: '#4A90A4' },
            { id: 'uncategorized', name: '未分類', color: '#6c757d' },
            ...foldersHook.folders
        ];

        const refreshButtonClass = window.state.isLoading ? 'action-btn refresh-btn loading' : 'action-btn refresh-btn';
        const refreshButtonText = window.state.isLoading ? '更新中...' : '更新';

        return `
            <nav class="nav">
                <div class="nav-left">
                    <h1>Minews</h1>
                    ${window.state.lastUpdate ? `<div class="last-update">最終更新: ${window.formatDate(window.state.lastUpdate)}</div>` : ''}
                </div>
                <div class="nav-filters">
                    <div class="filter-group">
                        <label>表示:</label>
                        <select class="filter-select" onchange="handleFilterChange(this.value)">
                            ${modes.map(mode => 
                                `<option value="${mode.key}" ${window.state.viewMode === mode.key ? 'selected' : ''}>${mode.label} (${getFilteredArticleCount(mode.key, window.state.selectedFolder)})</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>フォルダ:</label>
                        <select class="filter-select" onchange="handleFolderChange(this.value)">
                            ${folderOptions.map(folder => 
                                `<option value="${folder.id}" ${window.state.selectedFolder === folder.id ? 'selected' : ''}>${folder.name} (${getFilteredArticleCount(window.state.viewMode, folder.id)})</option>`
                            ).join('')}
                        </select>
                    </div>
                </div>
                <div class="nav-actions">
                    <button class="${refreshButtonClass}" onclick="handleRefresh()">${refreshButtonText}</button>
                    <button class="action-btn" onclick="handleModalOpen('rss')">RSS管理</button>
                    <button class="action-btn" onclick="handleModalOpen('folders')">フォルダ管理</button>
                    <button class="action-btn" onclick="handleModalOpen('words')">ワード管理</button>
                    <button class="action-btn" onclick="handleModalOpen('dataManagement')">データ管理</button>
                </div>
            </nav>
        `;
    };

    const renderModal = () => {
        if (!window.state.showModal) return '';

        switch (window.state.showModal) {
            case 'rss':
                return renderRSSModal();
            case 'folders':
                return renderFoldersModal();
            case 'words':
                return renderWordsModal();
            case 'dataManagement':
                return renderDataManagementModal();
            default:
                return '';
        }
    };

    const renderDataManagementModal = () => {
        return `
            <div class="modal-overlay">
                <div class="modal">
                    <div class="modal-header">
                        <h2>データ管理</h2>
                        <button class="modal-close" onclick="handleModalClose()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="rss-list">
                            <div class="rss-item">
                                <div class="rss-info">
                                    <strong>学習データJSON出力</strong>
                                    <div class="rss-updated">AI学習データとワードフィルターをJSONファイルで保存</div>
                                </div>
                                <div class="rss-actions">
                                    <button class="action-btn success" onclick="handleExportLearningData()">出力</button>
                                </div>
                            </div>
                            <div class="rss-item">
                                <div class="rss-info">
                                    <strong>学習データJSON取込</strong>
                                    <div class="rss-updated">保存したJSONファイルから学習データを復元</div>
                                </div>
                                <div class="rss-actions">
                                    <label class="action-btn" style="cursor: pointer; background: var(--accent-blue); color: white;">
                                        取込
                                        <input type="file" accept=".json" onchange="handleImportLearningData(event)" style="display: none;">
                                    </label>
                                </div>
                            </div>
                            <div class="rss-item">
                                <div class="rss-info">
                                    <strong>RSSフィードOPML出力</strong>
                                    <div class="rss-updated">RSSフィード設定をOPMLファイルで保存</div>
                                </div>
                                <div class="rss-actions">
                                    <button class="action-btn success" onclick="handleExportRSSData()">出力</button>
                                </div>
                            </div>
                            <div class="rss-item">
                                <div class="rss-info">
                                    <strong>RSSフィードOPML取込</strong>
                                    <div class="rss-updated">OPMLファイルからRSSフィード設定を復元</div>
                                </div>
                                <div class="rss-actions">
                                    <label class="action-btn" style="cursor: pointer; background: var(--accent-blue); color: white;">
                                        取込
                                        <input type="file" accept=".opml,.xml" onchange="handleImportRSSData(event)" style="display: none;">
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    const renderFoldersModal = () => {
        const foldersHook = window.DataHooks.useFolders();
        const rssHook = window.DataHooks.useRSSManager();

        return `
            <div class="modal-overlay">
                <div class="modal">
                    <div class="modal-header">
                        <h2>フォルダ管理</h2>
                        <button class="modal-close" onclick="handleModalClose()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="modal-actions">
                            <button class="action-btn success" onclick="handleFolderAdd()">フォルダ追加</button>
                        </div>
                        <div class="rss-list">
                            ${foldersHook.folders.map(folder => {
                                const feedCount = rssHook.rssFeeds.filter(feed => feed.folderId === folder.id).length;
                                return `
                                    <div class="rss-item">
                                        <div class="rss-info">
                                            <strong style="color: ${folder.color}">${folder.name}</strong>
                                            <div class="rss-updated">作成日: ${window.formatDate(folder.createdAt)}</div>
                                            <div class="rss-updated">カラー: ${window.FolderManager.getColorName(folder.color)}</div>
                                        </div>
                                        <div class="rss-actions">
                                            <button class="action-btn danger" onclick="handleFolderRemove('${folder.id}')">削除</button>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                        <div class="rss-help">
                            <h4>フォルダ管理について</h4>
                            <ul>
                                <li><strong>フォルダ追加</strong>: 新しいフォルダを作成します</li>
                                <li><strong>削除</strong>: RSSフィードがないフォルダのみ削除可能です</li>
                                <li><strong>色分け</strong>: フォルダごとに異なる色を設定できます</li>
                                <li><strong>フィルタリング</strong>: フォルダ別に記事を表示できます</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    const renderRSSModal = () => {
        const rssHook = window.DataHooks.useRSSManager();
        const foldersHook = window.DataHooks.useFolders();

        // フォルダーマップの作成
        const folderMap = new Map();
        foldersHook.folders.forEach(folder => folderMap.set(folder.id, folder));
        folderMap.set('uncategorized', { id: 'uncategorized', name: '未分類', color: '#6c757d' });

        return `
            <div class="modal-overlay">
                <div class="modal">
                    <div class="modal-header">
                        <h2>RSS管理</h2>
                        <button class="modal-close" onclick="handleModalClose()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="modal-actions">
                            <button class="action-btn success" onclick="handleRSSAdd()">RSS追加</button>
                        </div>
                        <div class="rss-list">
                            ${rssHook.rssFeeds.map(feed => {
                                const folder = folderMap.get(feed.folderId) || folderMap.get('uncategorized');
                                return `
                                    <div class="rss-item">
                                        <div class="rss-info">
                                            <div class="rss-editable-row">
                                                <strong onclick="handleRSSEdit('${feed.id}', 'title', '${feed.title.replace(/'/g, '\\\'')}')">${feed.title}</strong>
                                            </div>
                                            <div class="rss-editable-row">
                                                <div class="rss-url" onclick="handleRSSEdit('${feed.id}', 'url', '${feed.url}')">${feed.url}</div>
                                            </div>
                                            <div class="rss-editable-row">
                                                <div onclick="handleRSSEdit('${feed.id}', 'folder', '${folder?.name}')" style="cursor: pointer;">
                                                    フォルダ: <span style="color: ${folder?.color || '#6c757d'}">●</span> ${folder?.name}
                                                </div>
                                            </div>
                                            <div class="rss-updated">最終更新: ${window.formatDate(feed.lastUpdated)}</div>
                                            <span class="rss-status ${feed.isActive ? 'active' : 'inactive'}">${feed.isActive ? '有効' : '無効'}</span>
                                        </div>
                                        <div class="rss-actions">
                                            <button class="action-btn danger" onclick="handleRSSRemove('${feed.id}')">削除</button>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                        <div class="rss-help">
                            <h4>RSS管理について</h4>
                            <ul>
                                <li><strong>RSS追加</strong>: RSSフィードのURLを入力してください</li>
                                <li><strong>編集</strong>: タイトル、URL、フォルダをクリックで編集できます</li>
                                <li><strong>フォルダ分類</strong>: RSSフィードをフォルダで整理できます</li>
                                <li><strong>自動取得</strong>: 有効なフィードから定期的に記事を取得します</li>
                            </ul>
                            <p><strong>対応フォーマット</strong>: RSS 2.0、Atom、RDF</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    const renderWordsModal = () => {
        const wordHook = window.DataHooks.useWordFilters();

        return `
            <div class="modal-overlay">
                <div class="modal">
                    <div class="modal-header">
                        <h2>ワード管理</h2>
                        <button class="modal-close" onclick="handleModalClose()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="word-section">
                            <div class="word-section-header">
                                <h3>興味のあるワード</h3>
                                <button class="action-btn success" onclick="handleWordAdd('interest')">追加</button>
                            </div>
                            <div class="word-list">
                                ${wordHook.wordFilters.interestWords.map(word => 
                                    `<span class="word-tag interest">${word}
                                        <button class="word-remove" onclick="handleWordRemove('${word}', 'interest')">×</button>
                                    </span>`
                                ).join('')}
                            </div>
                        </div>
                        <div class="word-section">
                            <div class="word-section-header">
                                <h3>NGワード</h3>
                                <button class="action-btn danger" onclick="handleWordAdd('ng')">追加</button>
                            </div>
                            <div class="word-list">
                                ${wordHook.wordFilters.ngWords.map(word => 
                                    `<span class="word-tag ng">${word}
                                        <button class="word-remove" onclick="handleWordRemove('${word}', 'ng')">×</button>
                                    </span>`
                                ).join('')}
                            </div>
                        </div>
                        <div class="word-help">
                            <h4>ワードフィルターについて</h4>
                            <ul>
                                <li><strong>興味ワード</strong>: 含む記事のスコアが上がります</li>
                                <li><strong>NGワード</strong>: 含む記事は表示されません</li>
                                <li><strong>学習機能</strong>: 評価に基づいて自動的に重みが調整されます</li>
                                <li><strong>フィルタリング</strong>: タイトルと内容の両方で判定されます</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    const renderArticleCard = (article) => {
        const readStatusLabel = article.readStatus === 'read' ? '未読にする' : '既読にする';
        const readLaterLabel = article.readLater ? '後で読む解除' : '後で読む';
        const scoreDisplay = article.aiScore !== undefined ? `スコア: ${article.aiScore}` : '';

        return `
            <div class="article-card" data-read-status="${article.readStatus}">
                <div class="article-header">
                    <h3 class="article-title">
                        <a href="${article.url}" target="_blank" rel="noopener noreferrer">${article.title}</a>
                    </h3>
                    <div class="article-meta">
                        <span class="date">${window.formatDate(article.publishDate)}</span>
                        <span class="source">${article.rssSource}</span>
                        <span class="category">${article.category}</span>
                        ${scoreDisplay ? `<span class="ai-score">${scoreDisplay}</span>` : ''}
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
                    <button class="simple-btn read-status" onclick="handleReadStatusToggle('${article.id}')">${readStatusLabel}</button>
                    <button class="simple-btn read-later" data-active="${article.readLater}" onclick="handleReadLaterToggle('${article.id}')">${readLaterLabel}</button>
                </div>
                ${window.createStarRating(article.userRating, article.id)}
            </div>
        `;
    };

    window.render = () => {
        const articles = getFilteredArticles();

        const appHtml = `
            <div class="app">
                ${renderNavigation()}
                <main class="main-content">
                    ${articles.length === 0 ? 
                        `<div class="empty-message">
                            ${window.state.viewMode === 'unread' ? '未読記事がありません' : 
                              window.state.viewMode === 'read' ? '既読記事がありません' : 
                              window.state.viewMode === 'readLater' ? '後で読む記事がありません' : 
                              '記事が見つかりませんでした'}
                        </div>` :
                        `<div class="article-grid">
                            ${articles.map(renderArticleCard).join('')}
                        </div>`
                    }
                </main>
                ${renderModal()}
            </div>
        `;

        document.body.innerHTML = appHtml;
    };

    // =========================================== 
    // アプリケーション初期化 
    // =========================================== 
    const initializeApp = () => {
        // DOM要素の存在確認
        const rootElement = document.getElementById('root');
        if (!rootElement) {
            console.error('Root element not found. Please ensure HTML contains <div id="root"></div>');
            return;
        }

        // データ初期化の確認
        if (!window.DataHooks || !window.LocalStorageManager) {
            console.error('Data management layer not loaded. Please ensure dm.js is loaded before ui.js');
            return;
        }

        try {
            initializeData();
            window.render();
            console.log('Minews PWA initialized successfully');
        } catch (error) {
            console.error('Failed to initialize app:', error);
        }
    };

    // 複数の初期化方法でロバスト性を確保
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp);
    } else {
        // DOMが既に読み込まれている場合
        initializeApp();
    }

    // =========================================== 
    // グローバル関数の登録
    // =========================================== 
    window.handleFilterClick = window.handleFilterClick;
    window.handleFolderFilterClick = window.handleFolderFilterClick;
    window.handleModalOpen = window.handleModalOpen;
    window.handleModalClose = window.handleModalClose;
    window.handleStarClick = window.handleStarClick;
    window.handleReadStatusToggle = window.handleReadStatusToggle;
    window.handleReadLaterToggle = window.handleReadLaterToggle;
    window.handleRefresh = window.handleRefresh;
    window.handleRSSAdd = window.handleRSSAdd;
    window.handleRSSEdit = window.handleRSSEdit;
    window.handleRSSRemove = window.handleRSSRemove;
    window.handleFolderAdd = window.handleFolderAdd;
    window.handleFolderRemove = window.handleFolderRemove;
    window.handleWordAdd = window.handleWordAdd;
    window.handleWordRemove = window.handleWordRemove;
    window.handleFilterChange = window.handleFilterChange;
    window.handleFolderChange = window.handleFolderChange;
    window.handleRSSMoveFolderChange = window.handleRSSMoveFolderChange;
    window.handleExportLearningData = window.handleExportLearningData;
    window.handleImportLearningData = window.handleImportLearningData;
    window.handleExportRSSData = window.handleExportRSSData;
    window.handleImportRSSData = window.handleImportRSSData;

})();
