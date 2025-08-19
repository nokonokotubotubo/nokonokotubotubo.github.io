// Minews PWA - UI・メイン画面レイヤー（ui-main.js - 分割版）
(function() {
    'use strict';

    // フィルター設定管理（軽量化版）
    const getFilterSettings = () => {
        try {
            const stored = localStorage.getItem('minews_filterSettings');
            return stored ? JSON.parse(stored) : { scoreMin: 0, scoreMax: 100, dateMin: 0, dateMax: 14 };
        } catch {
            return { scoreMin: 0, scoreMax: 100, dateMin: 0, dateMax: 14 };
        }
    };

    const saveFilterSettings = (settings) => {
        try {
            localStorage.setItem('minews_filterSettings', JSON.stringify(settings));
        } catch (error) {
            console.warn('フィルター設定の保存に失敗:', error);
        }
    };

    const updateScoreDisplay = (type, value) => {
        const numValue = parseInt(value);
        const isMin = type === 'min';
        const otherSlider = document.getElementById(isMin ? 'scoreMaxSlider' : 'scoreMinSlider');
        const otherValue = parseInt(otherSlider.value);
        const adjustedValue = isMin ? Math.min(numValue, otherValue) : Math.max(numValue, otherValue);
        
        document.getElementById(`score${type === 'min' ? 'Min' : 'Max'}Value`).textContent = adjustedValue;
        document.getElementById(`score${type === 'min' ? 'Min' : 'Max'}Slider`).value = adjustedValue;
        
        const display = document.querySelector('.modal-section-group:first-child .filter-range-display');
        if (display) {
            const minVal = isMin ? adjustedValue : otherValue;
            const maxVal = isMin ? otherValue : adjustedValue;
            display.textContent = `${minVal}点 - ${maxVal}点`;
        }
    };

    const updateDateDisplay = (type, value) => {
        const numValue = parseInt(value);
        const isMin = type === 'min';
        const otherSlider = document.getElementById(isMin ? 'dateMaxSlider' : 'dateMinSlider');
        const otherValue = parseInt(otherSlider.value);
        const adjustedValue = isMin ? Math.min(numValue, otherValue) : Math.max(numValue, otherValue);
        
        document.getElementById(`date${type === 'min' ? 'Min' : 'Max'}Value`).textContent = adjustedValue;
        document.getElementById(`date${type === 'min' ? 'Min' : 'Max'}Slider`).value = adjustedValue;
        
        const displays = document.querySelectorAll('.filter-range-display');
        if (displays.length >= 2) {
            const minVal = isMin ? adjustedValue : otherValue;
            const maxVal = isMin ? otherValue : adjustedValue;
            displays[1].textContent = `${minVal}日前 - ${maxVal}日前`;
        }
    };

    const applyFilterSettings = () => {
        const settings = {
            scoreMin: parseInt(document.getElementById('scoreMinSlider').value),
            scoreMax: parseInt(document.getElementById('scoreMaxSlider').value),
            dateMin: parseInt(document.getElementById('dateMinSlider').value),
            dateMax: parseInt(document.getElementById('dateMaxSlider').value)
        };
        
        saveFilterSettings(settings);
        // 【修正】明示的更新フラグを設定
        window.state.allowArticleUpdate = true;
        updateArticleListOnly();
        alert('フィルター設定を適用しました');
    };

    const resetFilterSettings = () => {
        const defaultSettings = { scoreMin: 0, scoreMax: 100, dateMin: 0, dateMax: 14 };
        saveFilterSettings(defaultSettings);
        
        ['scoreMin', 'scoreMax', 'dateMin', 'dateMax'].forEach(key => {
            const value = defaultSettings[key];
            document.getElementById(key + 'Slider').value = value;
            document.getElementById(key + 'Value').textContent = value;
        });
        
        const displays = document.querySelectorAll('.filter-range-display');
        if (displays[0]) displays[0].textContent = '0点 - 100点';
        if (displays[1]) displays[1].textContent = '0日前 - 14日前';
        
        // 【修正】明示的更新フラグを設定
        window.state.allowArticleUpdate = true;
        updateArticleListOnly();
        alert('フィルター設定をリセットしました');
    };

    // ユニークID生成機能
    const encodeToValidId = (text) => encodeURIComponent(text).replace(/[^A-Za-z0-9_-]/g, '_');

    const generateUniqueIds = (articles, prefix = '') => {
        const folders = [...new Set(articles.map(a => a.folderName))].sort();
        const folderIds = {};
        const feedIds = {};
        
        folders.forEach((folder) => {
            const encodedFolder = encodeToValidId(folder);
            folderIds[folder] = `${prefix}folder_${encodedFolder}`;
            feedIds[folder] = {};
            
            const feeds = [...new Set(articles.filter(a => a.folderName === folder).map(a => a.rssSource))].sort();
            feeds.forEach((feed) => {
                const encodedFeed = encodeToValidId(feed);
                feedIds[folder][feed] = `${prefix}feed_${encodedFolder}_${encodedFeed}`;
            });
        });
        
        return { folderIds, feedIds };
    };

    // フィルター状態永続化（sortMode追加）
    const getStoredFilterState = () => {
        try {
            const stored = localStorage.getItem('minews_filterState');
            return stored ? JSON.parse(stored) : { 
                viewMode: 'all', 
                selectedFolders: [], 
                selectedFeeds: [], 
                sortMode: 'aiScore' 
            };
        } catch {
            return { 
                viewMode: 'all', 
                selectedFolders: [], 
                selectedFeeds: [], 
                sortMode: 'aiScore' 
            };
        }
    };

    const saveFilterState = (viewMode, selectedFolders, selectedFeeds, sortMode) => {
        try {
            localStorage.setItem('minews_filterState', JSON.stringify({ 
                viewMode, 
                selectedFolders, 
                selectedFeeds, 
                sortMode 
            }));
        } catch (error) {
            console.warn('フィルター状態の保存に失敗:', error);
        }
    };

    // アプリケーション状態管理（sortMode追加）
    const initialFilterState = getStoredFilterState();
    window.state = {
        viewMode: initialFilterState.viewMode,
        selectedFolders: initialFilterState.selectedFolders,
        selectedFeeds: initialFilterState.selectedFeeds,
        sortMode: initialFilterState.sortMode || 'aiScore', // デフォルトはAIスコア順
        showModal: null,
        articles: [],
        isLoading: false,
        lastUpdate: null,
        isSyncUpdating: false,
        isBackgroundSyncing: false,
        allowArticleUpdate: false // 記事リスト更新制御フラグ
    };

    const initializeFolderFeeds = () => {
        const folders = [...new Set(window.state.articles.map(article => article.folderName))].sort();
        const feeds = [...new Set(window.state.articles.map(article => article.rssSource))].sort();
        
        if (window.state.selectedFolders.length === 0) window.state.selectedFolders = [...folders];
        if (window.state.selectedFeeds.length === 0) window.state.selectedFeeds = [...feeds];
    };

    // setState関数を修正（sortMode対応）
    window.setState = (newState) => {
        window.state = { ...window.state, ...newState };
        
        if (newState.viewMode !== undefined || newState.selectedFolders !== undefined || 
            newState.selectedFeeds !== undefined || newState.sortMode !== undefined) {
            saveFilterState(
                newState.viewMode || window.state.viewMode,
                newState.selectedFolders || window.state.selectedFolders,
                newState.selectedFeeds || window.state.selectedFeeds,
                newState.sortMode || window.state.sortMode
            );
        }
        
        window.render();
    };

    const initializeData = () => {
        const articlesData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.ARTICLES, window.DEFAULT_DATA.articles);
        const aiData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, window.DEFAULT_DATA.aiLearning);
        const wordData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, window.DEFAULT_DATA.wordFilters);

        Object.assign(window.DataHooksCache, { articles: articlesData, aiLearning: aiData, wordFilters: wordData });
        window.state.articles = articlesData;
        initializeFolderFeeds();
    };

    const initializeGistSync = () => {
        if (window.GistSyncManager) {
            const config = window.GistSyncManager.loadConfig();
            if (config?.hasToken) {
                window.GistSyncManager.startPeriodicSync(60);
            }
        }
    };

    window.initializeGistSync = initializeGistSync;

    // ユーティリティ関数
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

    window.truncateText = (text, maxLength = 200) => text.length <= maxLength ? text : text.substring(0, maxLength).trim() + '...';

    const formatLastSyncTime = (isoString) => {
        try {
            const date = new Date(isoString);
            return date.toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
        } catch {
            return '日時不明';
        }
    };

    // 部分更新関数（画面更新制御機能追加）
    const updateArticleCount = () => {
        const count = getFilteredArticles().length;
        const mobileUpdate = document.querySelector('.last-update-mobile');
        const desktopUpdate = document.querySelector('.last-update');
        
        if (mobileUpdate) mobileUpdate.textContent = `表示中: ${count}件`;
        if (desktopUpdate) desktopUpdate.textContent = `表示中: ${count}件`;
    };

    const updateArticleListOnly = () => {
        // 更新許可フラグをチェック
        if (!window.state.allowArticleUpdate) {
            console.log('記事リスト表示更新は保留されています');
            return;
        }

        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.innerHTML = renderArticleList();
            updateArticleCount();
        }

        // 更新後はフラグを戻す
        window.state.allowArticleUpdate = false;
    };

    const updateFolderButtonCount = () => {
        const folders = [...new Set(window.state.articles.map(article => article.folderName))].sort();
        
        document.querySelectorAll('.folder-dropdown-btn').forEach(btn => {
            const countText = `フォルダ選択 (${window.state.selectedFolders.length}/${folders.length})`;
            const textNode = btn.childNodes[0];
            if (textNode?.nodeType === Node.TEXT_NODE) {
                textNode.textContent = countText;
            } else {
                btn.innerHTML = `${countText}<span class="dropdown-arrow">▼</span>`;
            }
        });
    };

    const updateFeedCheckboxStates = () => {
        document.querySelectorAll('.folder-dropdown-content').forEach(dropdown => {
            const feedCheckboxes = dropdown.querySelectorAll('[id*="feed_"]');
            feedCheckboxes.forEach(checkbox => {
                const feedElement = checkbox.closest('label').querySelector('.feed-name');
                if (feedElement) {
                    const feedName = feedElement.textContent.trim();
                    checkbox.checked = window.state.selectedFeeds.includes(feedName);
                }
            });
        });
    };

    const updateFolderCheckboxStates = () => {
        const folders = [...new Set(window.state.articles.map(article => article.folderName))].sort();
        
        document.querySelectorAll('.folder-dropdown-content').forEach(dropdown => {
            const selectAllCheckbox = dropdown.querySelector('[id$="selectAllFolders"]');
            if (selectAllCheckbox) {
                selectAllCheckbox.checked = folders.every(folder => window.state.selectedFolders.includes(folder));
            }
            
            folders.forEach(folder => {
                const checkbox = dropdown.querySelector(`[id$="folder_${encodeToValidId(folder)}"]`);
                if (checkbox) {
                    checkbox.checked = window.state.selectedFolders.includes(folder);
                }
            });
        });
        
        updateFeedCheckboxStates();
    };

    // 表示順切り替えハンドラー（新規追加）
    const handleSortModeToggle = (event) => {
        event?.stopPropagation();
        
        const newSortMode = window.state.sortMode === 'aiScore' ? 'time' : 'aiScore';
        window.state.sortMode = newSortMode;
        
        saveFilterState(
            window.state.viewMode, 
            window.state.selectedFolders, 
            window.state.selectedFeeds, 
            newSortMode
        );
        
        // 明示的更新フラグを設定
        window.state.allowArticleUpdate = true;
        updateArticleListOnly();
        
        // トグルスイッチの表示も更新
        updateSortToggleDisplay();
    };

    // トグル表示更新（新規追加）
    const updateSortToggleDisplay = () => {
        document.querySelectorAll('.sort-toggle').forEach(toggle => {
            const checkbox = toggle.querySelector('input[type="checkbox"]');
            const label = toggle.querySelector('.sort-toggle-label');
            if (checkbox && label) {
                checkbox.checked = window.state.sortMode === 'time';
                label.textContent = window.state.sortMode === 'time' ? '時間順' : 'AIスコア順';
            }
        });
    };

    // 一括既読化処理
    const handleBulkMarkAsRead = () => {
        if (!confirm('表示している記事を一括で既読にしますか？')) return;
        
        const filteredArticles = getFilteredArticles();
        const articlesHook = window.DataHooks.useArticles();
        let updatedCount = 0;
        
        filteredArticles.forEach(article => {
            if (article.readStatus === 'unread') {
                articlesHook.updateArticle(article.id, { readStatus: 'read' }, { skipRender: true });
                updatedCount++;
            }
        });
        
        if (updatedCount > 0) {
            // 明示的更新フラグを設定
            window.state.allowArticleUpdate = true;
            updateArticleListOnly();
            if (window.GistSyncManager?.isEnabled) {
                window.GistSyncManager.markAsChanged();
            }
            alert(`${updatedCount}件の記事を既読にしました`);
        } else {
            alert('既読にする記事がありませんでした');
        }
    };

    // フォルダ・フィード管理（明示的更新フラグ設定）
    const handleFolderToggle = (folderName, event) => {
        event?.stopPropagation();
        
        const selectedFolders = [...window.state.selectedFolders];
        const selectedFeeds = [...window.state.selectedFeeds];
        const index = selectedFolders.indexOf(folderName);
        
        const feedsInFolder = [...new Set(window.state.articles
            .filter(article => article.folderName === folderName)
            .map(article => article.rssSource)
        )];
        
        if (index > -1) {
            selectedFolders.splice(index, 1);
            feedsInFolder.forEach(feed => {
                const feedIndex = selectedFeeds.indexOf(feed);
                if (feedIndex > -1) selectedFeeds.splice(feedIndex, 1);
            });
        } else {
            selectedFolders.push(folderName);
            feedsInFolder.forEach(feed => {
                if (!selectedFeeds.includes(feed)) selectedFeeds.push(feed);
            });
        }
        
        window.state.selectedFolders = selectedFolders;
        window.state.selectedFeeds = selectedFeeds;
        saveFilterState(window.state.viewMode, selectedFolders, selectedFeeds, window.state.sortMode);
        
        // 明示的更新フラグを設定
        window.state.allowArticleUpdate = true;
        updateArticleListOnly();
        updateFolderButtonCount();
        updateFolderCheckboxStates();
    };

    const handleFeedToggle = (feedName, event) => {
        event?.stopPropagation();
        
        const selectedFeeds = [...window.state.selectedFeeds];
        const index = selectedFeeds.indexOf(feedName);
        
        if (index > -1) {
            selectedFeeds.splice(index, 1);
        } else {
            selectedFeeds.push(feedName);
        }
        
        window.state.selectedFeeds = selectedFeeds;
        saveFilterState(window.state.viewMode, window.state.selectedFolders, selectedFeeds, window.state.sortMode);
        
        // 明示的更新フラグを設定
        window.state.allowArticleUpdate = true;
        updateArticleListOnly();
        updateFolderButtonCount();
        updateFeedCheckboxStates();
    };

    const handleSelectAllFolders = (selectAll, event) => {
        event?.stopPropagation();
        
        let selectedFolders, selectedFeeds;
        if (selectAll) {
            selectedFolders = [...new Set(window.state.articles.map(article => article.folderName))].sort();
            selectedFeeds = [...new Set(window.state.articles.map(article => article.rssSource))].sort();
        } else {
            selectedFolders = [];
            selectedFeeds = [];
        }
        
        window.state.selectedFolders = selectedFolders;
        window.state.selectedFeeds = selectedFeeds;
        saveFilterState(window.state.viewMode, selectedFolders, selectedFeeds, window.state.sortMode);
        
        // 明示的更新フラグを設定
        window.state.allowArticleUpdate = true;
        updateArticleListOnly();
        updateFolderButtonCount();
        updateFolderCheckboxStates();
    };

    const renderFolderDropdown = (prefix = '') => {
        const folders = [...new Set(window.state.articles.map(article => article.folderName))].sort();
        const uniqueIds = generateUniqueIds(window.state.articles, prefix);
        
        const foldersByFeed = {};
        window.state.articles.forEach(article => {
            if (!foldersByFeed[article.folderName]) {
                foldersByFeed[article.folderName] = new Set();
            }
            foldersByFeed[article.folderName].add(article.rssSource);
        });
        
        const allFoldersSelected = folders.every(folder => window.state.selectedFolders.includes(folder));
        
        return `
            <div class="folder-dropdown">
                <button type="button" class="folder-dropdown-btn" onclick="toggleFolderDropdown('${prefix}')">
                    フォルダ選択 (${window.state.selectedFolders.length}/${folders.length})
                    <span class="dropdown-arrow">▼</span>
                </button>
                <div class="folder-dropdown-content" id="${prefix}folderDropdownContent" style="display: none; position: fixed; left: 0; top: 120px; width: 100vw; max-height: calc(100vh - 120px); overflow-y: auto; background-color: #1f2937; z-index: 1000; box-shadow: 0 4px 6px rgba(0,0,0,0.3); padding: 1rem;">
                    <div class="folder-controls">
                        <div class="folder-controls-row">
                            <label class="folder-item" for="${prefix}selectAllFolders">
                                <input type="checkbox" id="${prefix}selectAllFolders" name="${prefix}selectAllFolders" ${allFoldersSelected ? 'checked' : ''} onchange="event.stopPropagation(); handleSelectAllFolders(this.checked, event)">
                                <span>すべてのフォルダ</span>
                            </label>
                            <div class="sort-toggle" onclick="event.stopPropagation()">
                                <label class="sort-toggle-container" for="${prefix}sortToggle">
                                    <input type="checkbox" id="${prefix}sortToggle" ${window.state.sortMode === 'time' ? 'checked' : ''} onchange="handleSortModeToggle(event)">
                                    <span class="sort-slider"></span>
                                    <span class="sort-toggle-label">${window.state.sortMode === 'time' ? '時間順' : 'AIスコア順'}</span>
                                </label>
                            </div>
                        </div>
                    </div>
                    <hr class="folder-separator">
                    ${folders.map((folder) => {
                        const folderId = uniqueIds.folderIds[folder];
                        return `
                        <div class="folder-group">
                            <label class="folder-item" for="${folderId}">
                                <input type="checkbox" id="${folderId}" name="${folderId}" ${window.state.selectedFolders.includes(folder) ? 'checked' : ''} onchange="event.stopPropagation(); handleFolderToggle('${folder.replace(/'/g, "\\'")}', event)">
                                <span class="folder-name">${folder}</span>
                            </label>
                            <div class="feed-list">
                                ${Array.from(foldersByFeed[folder]).map((feed) => {
                                    const feedId = uniqueIds.feedIds[folder][feed];
                                    return `
                                    <label class="feed-item" for="${feedId}">
                                        <input type="checkbox" id="${feedId}" name="${feedId}" ${window.state.selectedFeeds.includes(feed) ? 'checked' : ''} onchange="event.stopPropagation(); handleFeedToggle('${feed.replace(/'/g, "\\'")}', event)">
                                        <span class="feed-name">${feed}</span>
                                    </label>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    };

    const toggleFolderDropdown = (prefix = '') => {
        const content = document.getElementById(`${prefix}folderDropdownContent`);
        if (!content) return;

        const isVisible = content.style.display !== 'none';
        
        if (isVisible) {
            content.style.display = 'none';
            if (window._currentCloseHandler) {
                document.removeEventListener('click', window._currentCloseHandler);
                window._currentCloseHandler = null;
            }
        } else {
            content.style.display = 'block';

            setTimeout(() => {
                const closeOnOutsideClick = (event) => {
                    const isInsideDropdown = content.contains(event.target);
                    const isDropdownButton = event.target.closest('.folder-dropdown-btn');
                    
                    if (!isInsideDropdown && !isDropdownButton) {
                        content.style.display = 'none';
                        document.removeEventListener('click', closeOnOutsideClick);
                        window._currentCloseHandler = null;
                    }
                };
                
                if (window._currentCloseHandler) {
                    document.removeEventListener('click', window._currentCloseHandler);
                }
                
                document.addEventListener('click', closeOnOutsideClick);
                window._currentCloseHandler = closeOnOutsideClick;
            }, 100);
        }
    };

    // イベントハンドラ（明示的更新フラグ対応版）
    const handleFilterChange = (mode) => {
        window.setState({ viewMode: mode });
        // フィルター変更は明示的更新
        window.state.allowArticleUpdate = true;
        updateArticleListOnly();
    };

    const handleRefresh = async () => {
        window.setState({ isLoading: true });
        
        try {
            const rssHook = window.DataHooks.useRSSManager();
            const result = await rssHook.fetchAllFeeds();
            alert(`記事を更新しました（追加: ${result.totalAdded}件、エラー: ${result.totalErrors}件）`);
            
            window.setState({ lastUpdate: new Date() });
            
            if (window.GistSyncManager?.isEnabled) {
                window.GistSyncManager.markAsChanged();
            }
        } catch (error) {
            alert('記事の更新に失敗しました: ' + error.message);
        } finally {
            window.setState({ isLoading: false });
        }
    };

    const handleArticleClick = (event, articleId, actionType) => {
    if (actionType !== 'read') {
        event.preventDefault();
        event.stopPropagation();
    }

    const articlesHook = window.DataHooks.useArticles();
    const article = articlesHook.articles.find(a => a.id === articleId);
    if (!article) return;

    switch (actionType) {
        case 'toggleRead':
            event.preventDefault();
            event.stopPropagation();
            const newReadStatus = article.readStatus === 'read' ? 'unread' : 'read';
            
            articlesHook.updateArticle(articleId, { readStatus: newReadStatus }, { skipRender: true });
            
            // 【修正】正確な角ボタン要素を取得して即座に更新
            const readStatusButton = event.target;
            readStatusButton.className = `corner-read-status ${newReadStatus}`;
            
            // 【追加】確実にレイアウトを再計算
            readStatusButton.style.display = 'none';
            readStatusButton.offsetHeight; // 強制reflow
            readStatusButton.style.display = 'flex';

            if (window.GistSyncManager?.isEnabled) {
                window.GistSyncManager.markAsChanged();
            }
            break;

        case 'readLater':
            event.preventDefault();
            event.stopPropagation();
            
            const newReadLater = !article.readLater;
            
            articlesHook.updateArticle(articleId, { readLater: newReadLater }, { skipRender: true });
            
            // 【修正】正確な角ボタン要素を取得して即座に更新
            const readLaterButton = event.target;
            if (newReadLater) {
                readLaterButton.classList.add('active');
            } else {
                readLaterButton.classList.remove('active');
            }
            
            // 【追加】確実にレイアウトを再計算
            readLaterButton.style.display = 'none';
            readLaterButton.offsetHeight; // 強制reflow
            readLaterButton.style.display = 'flex';

            if (window.GistSyncManager?.isEnabled) {
                window.GistSyncManager.markAsChanged();
            }
            break;
            
        case 'read':
            if (article.readStatus !== 'read') {
                articlesHook.updateArticle(articleId, { readStatus: 'read' });
                if (window.GistSyncManager?.isEnabled) {
                    window.GistSyncManager.markAsChanged();
                }
            }
            break;
    }
};



    const handleCloseModal = () => {
        window._pendingTextSelection = null;
        if (window.currentInlineRating !== undefined) {
            window.currentInlineRating = 0;
        }
        window.setState({ showModal: null });
    };

    const handleOpenModal = (modalType) => window.setState({ showModal: modalType });

    // レンダリング（軽量化版）
    const renderNavigation = () => {
        return `
            <nav class="nav">
                <div class="nav-top-row">
                    <div class="nav-left-mobile">
                        <h1><span class="title-mine">Mine</span><span class="title-ws">ws</span></h1>
                        <span class="last-update-mobile">表示中: ${getFilteredArticles().length}件</span>
                    </div>
                    <div class="nav-actions-mobile">
                        <button class="action-btn refresh-btn ${window.state.isLoading ? 'loading' : ''}" onclick="handleRefresh()" ${window.state.isLoading ? 'disabled' : ''}>${window.state.isLoading ? '更新中...' : '記事更新'}</button>
                        <button class="action-btn" onclick="handleOpenModal('settings')">設定</button>
                    </div>
                </div>
                
                <div class="nav-filters-mobile">
                    <div class="filter-row">${renderFolderDropdown('mobile_')}</div>
                    
                    <div class="filter-row">
                        <label for="viewFilterMobile">表示:</label>
                        <select id="viewFilterMobile" name="viewFilterMobile" class="filter-select" onchange="handleFilterChange(this.value)">
                            <option value="all" ${window.state.viewMode === 'all' ? 'selected' : ''}>全て</option>
                            <option value="unread" ${window.state.viewMode === 'unread' ? 'selected' : ''}>未読のみ</option>
                            <option value="read" ${window.state.viewMode === 'read' ? 'selected' : ''}>既読のみ</option>
                            <option value="readLater" ${window.state.viewMode === 'readLater' ? 'selected' : ''}>後で読む</option>
                        </select>
                        <button class="action-btn bulk-read-btn" onclick="handleBulkMarkAsRead()" title="表示中の記事を一括既読">✓</button>
                    </div>
                </div>

                <div class="nav-left desktop-only">
                    <h1><span class="title-mine">Mine</span><span class="title-ws">ws</span></h1>
                    <div class="last-update">表示中: ${getFilteredArticles().length}件</div>
                </div>
                
                <div class="nav-filters desktop-only">
                    <div class="filter-group">${renderFolderDropdown('desktop_')}</div>
                    
                    <div class="filter-group">
                        <label for="viewFilterDesktop">表示:</label>
                        <select id="viewFilterDesktop" name="viewFilterDesktop" class="filter-select" onchange="handleFilterChange(this.value)">
                            <option value="all" ${window.state.viewMode === 'all' ? 'selected' : ''}>全て</option>
                            <option value="unread" ${window.state.viewMode === 'unread' ? 'selected' : ''}>未読のみ</option>
                            <option value="read" ${window.state.viewMode === 'read' ? 'selected' : ''}>既読のみ</option>
                            <option value="readLater" ${window.state.viewMode === 'readLater' ? 'selected' : ''}>後で読む</option>
                        </select>
                        <button class="action-btn bulk-read-btn" onclick="handleBulkMarkAsRead()" title="表示中の記事を一括既読">✓</button>
                    </div>
                </div>

                <div class="nav-actions desktop-only">
                    <button class="action-btn refresh-btn ${window.state.isLoading ? 'loading' : ''}" onclick="handleRefresh()" ${window.state.isLoading ? 'disabled' : ''}>${window.state.isLoading ? '更新中...' : '記事更新'}</button>
                    <button class="action-btn" onclick="handleOpenModal('settings')">設定</button>
                </div>
            </nav>
        `;
    };

    const getFilteredArticles = () => {
        let filtered = [...window.state.articles];

        // フォルダ・フィード フィルター
        filtered = filtered.filter(article => 
            window.state.selectedFolders.includes(article.folderName) || 
            window.state.selectedFeeds.includes(article.rssSource)
        );

        // スコアフィルター
        const filterSettings = getFilterSettings();
        const aiHook = window.DataHooks.useAILearning();
        const wordHook = window.DataHooks.useWordFilters();
        
        filtered = filtered.filter(article => {
            const aiScore = window.AIScoring.calculateScore(article, aiHook.aiLearning, wordHook.wordFilters);
            return aiScore >= filterSettings.scoreMin && aiScore <= filterSettings.scoreMax;
        });

        // 日付フィルター
        const now = new Date();
        filtered = filtered.filter(article => {
            const articleDate = new Date(article.publishDate);
            const daysDiff = Math.floor((now - articleDate) / (1000 * 60 * 60 * 24));
            return daysDiff >= filterSettings.dateMin && daysDiff <= filterSettings.dateMax;
        });

        // 既読・未読フィルター
        switch (window.state.viewMode) {
            case 'unread':
                filtered = filtered.filter(article => article.readStatus === 'unread' && !article.readLater);
                break;
            case 'read':
                filtered = filtered.filter(article => article.readStatus === 'read');
                break;
            case 'readLater':
                filtered = filtered.filter(article => article.readLater);
                break;
        }

        // NGワードフィルター
        filtered = window.WordFilterManager.filterArticles(filtered, wordHook.wordFilters);

        if (window.state.isSyncUpdating && !window.state.isBackgroundSyncing) {
            return filtered;
        }

        // AIスコア計算
        const articlesWithScores = filtered.map(article => ({
            ...article,
            aiScore: window.AIScoring.calculateScore(article, aiHook.aiLearning, wordHook.wordFilters)
        }));

        // ソート処理（修正）
        return articlesWithScores.sort((a, b) => {
            if (window.state.sortMode === 'time') {
                // 時間順ソート（新しい順）
                const dateCompare = new Date(b.publishDate) - new Date(a.publishDate);
                if (dateCompare !== 0) return dateCompare;
                // 日付が同じ場合はIDで安定ソート
                return a.id.localeCompare(b.id);
            } else {
                // AIスコア順ソート（デフォルト）
                if (a.aiScore !== b.aiScore) return b.aiScore - a.aiScore;
                const dateCompare = new Date(b.publishDate) - new Date(a.publishDate);
                if (dateCompare !== 0) return dateCompare;
                return a.id.localeCompare(b.id);
            }
        });
    };

    // キーワード統合機能を追加したrenderArticleCard関数
    const renderArticleCard = (article) => {
        // 興味ワードとの統合キーワード生成
        const generateCombinedKeywords = (article) => {
            const wordHook = window.DataHooks.useWordFilters();
            const interestWords = wordHook.wordFilters.interestWords || [];
            
            // 記事本来のキーワード
            const originalKeywords = new Set(article.keywords || []);
            
            // 記事のタイトル・内容を結合してテキスト検索用に準備
            const articleText = (article.title + ' ' + article.content).toLowerCase();
            
            // 興味ワードのうち、記事に含まれるが元のキーワードに無いものを抽出
            const additionalInterestKeywords = interestWords.filter(word => {
                // 既に記事のキーワードに含まれている場合は除外
                if (originalKeywords.has(word)) return false;
                
                // 記事のタイトル・内容に含まれている場合のみ追加
                return articleText.includes(word.toLowerCase());
            });
            
            // 記事キーワード + 追加興味ワードを結合（記事キーワードを優先順序）
            const combinedKeywords = [
                ...Array.from(originalKeywords),
                ...additionalInterestKeywords
            ];
            
            return combinedKeywords;
        };
        
        // 統合キーワードを使用
        const combinedKeywords = generateCombinedKeywords(article);
        const keywords = combinedKeywords.map(keyword => {
            const sanitizedKeyword = keyword.replace(/[<>"'&]/g, match => {
                const escapeChars = { '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' };
                return escapeChars[match];
            });
            
            const rating = window.WordRatingManager?.getWordRating(keyword) || 0;
            const ratingClass = rating > 0 ? `rated-${rating}` : '';
            
            return `
                <span class="keyword ${ratingClass}" onclick="showKeywordSelectionMenu('${keyword.replace(/'/g, "\\'")}', event)" title="クリックして操作 (現在: ${rating > 0 ? rating + '星' : '未評価'})">
                    ${sanitizedKeyword}${rating > 0 ? ` ★${rating}` : ''}
                </span>
            `;
        }).join('');

        return `
            <div class="article-card" data-read-status="${article.readStatus}">
                <div class="article-header">
                    <h3 class="article-title">
                        <a href="${article.url}" target="_blank" rel="noopener noreferrer" onclick="handleArticleClick(event, '${article.id}', 'read')" onauxclick="handleArticleClick(event, '${article.id}', 'read')">
                            ${article.title}
                        </a>
                    </h3>
                    
                    <div class="article-meta">
                        <span class="date">${window.formatDate(article.publishDate)}</span>
                        <span class="source">${article.rssSource}</span>
                        <span class="ai-score">AI: ${article.aiScore || 0}</span>
                    </div>
                </div>

                <div class="article-content">${window.truncateText(article.content)}</div>

                ${keywords ? `<div class="article-keywords">${keywords}</div>` : ''}

                <!-- 角の三角形ボタン -->
<div class="corner-read-later ${article.readLater ? 'active' : ''}" 
     onclick="handleArticleClick(event, '${article.id}', 'readLater')" 
     data-article-id="${article.id}"
     title="${article.readLater ? '後で読む解除' : '後で読む'}">
</div>
<div class="corner-read-status ${article.readStatus === 'read' ? 'read' : 'unread'}" 
     onclick="handleArticleClick(event, '${article.id}', 'toggleRead')" 
     data-article-id="${article.id}"
     title="${article.readStatus === 'read' ? '未読にする' : '既読にする'}">
</div>
            </div>
        `;
    };

    const renderArticleList = () => {
        const articles = getFilteredArticles();

        if (articles.length === 0) {
            return '<div class="empty-message">表示する記事がありません</div>';
        }

        return `<div class="article-grid">${articles.map(renderArticleCard).join('')}</div>`;
    };

    const renderModal = () => {
        // モーダルのレンダリングはui-modals.jsに委譲
        if (window.renderModalContent) {
            return window.renderModalContent();
        }
        return '';
    };

    // メインレンダー関数（修正版）
    window.render = () => {
        const app = document.getElementById('app');
        if (!app) return;

        app.innerHTML = `
            <div class="app">
                ${renderNavigation()}
                <main class="main-content">${renderArticleList()}</main>
                ${renderModal()}
            </div>
        `;
        
        // モーダル表示後の初期化処理をui-modals.jsに委譲
        if (window.initializeModalEvents) {
            setTimeout(() => {
                window.initializeModalEvents();
            }, 50);
        }
    };

    // クラウド同期処理（userRating除外版）
    window.handleSyncFromCloud = async () => {
        if (!window.GistSyncManager.isEnabled) {
            alert('GitHub同期が設定されていません');
            return;
        }
        
        window.setState({ isSyncUpdating: true, isBackgroundSyncing: false });
        
        try {
            const cloudData = await window.GistSyncManager.syncFromCloud();
            if (!cloudData) {
                alert('クラウドからデータを取得できませんでした');
                return;
            }
            
            if (cloudData.aiLearning) {
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, cloudData.aiLearning);
                window.DataHooksCache.clear('aiLearning');
            }
            
            if (cloudData.wordFilters) {
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, cloudData.wordFilters);
                window.DataHooksCache.clear('wordFilters');
            }

            if (cloudData.articleStates) {
                const articlesHook = window.DataHooks.useArticles();
                const currentArticles = articlesHook.articles;
                
                const updatedArticles = currentArticles.map(article => {
                    const state = cloudData.articleStates[article.id];
                    if (state) {
                        return {
                            ...article,
                            readStatus: state.readStatus,
                            readLater: state.readLater,
                            lastModified: state.lastModified || article.lastModified
                        };
                    }
                    return article;
                });
                
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
                window.DataHooksCache.clear('articles');
                window.setState({ articles: updatedArticles });
            }

            alert('クラウドからデータを復元しました');

        } catch (error) {
            alert('データの復元に失敗しました: ' + error.message);
        } finally {
            window.setState({ isSyncUpdating: false, isBackgroundSyncing: false });
        }
    };

    // グローバル関数のエクスポート
    Object.assign(window, {
        handleFilterChange, handleRefresh, handleArticleClick, handleCloseModal, handleOpenModal,
        initializeGistSync, handleFolderToggle, handleFeedToggle,
        handleSelectAllFolders, toggleFolderDropdown, handleBulkMarkAsRead,
        updateScoreDisplay, updateDateDisplay, applyFilterSettings, resetFilterSettings, getFilterSettings,
        handleSortModeToggle, updateSortToggleDisplay  // 新規追加
    });

    // 初期化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initializeData();
            initializeGistSync();
            if (window.initializeTextSelection) {
                window.initializeTextSelection();
            }
            window.render();
        });
    } else {
        initializeData();
        initializeGistSync();
        if (window.initializeTextSelection) {
            window.initializeTextSelection();
        }
        window.render();
    }

})();
