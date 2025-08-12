// Minews PWA - UI・表示レイヤー（すべての修正統合版）
(function() {
    'use strict';

    // ===========================================
    // シンプルなフィルター設定管理
    // ===========================================

    // フィルター設定をLocalStorageから復元
    const getFilterSettings = () => {
        try {
            const stored = localStorage.getItem('minews_filterSettings');
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (error) {
            console.warn('フィルター設定の復元に失敗:', error);
        }
        
        // デフォルト値（全範囲対象）
        return {
            scoreMin: 0,
            scoreMax: 100,
            dateMin: 0,
            dateMax: 14
        };
    };

    // フィルター設定をLocalStorageに保存
    const saveFilterSettings = (settings) => {
        try {
            localStorage.setItem('minews_filterSettings', JSON.stringify(settings));
        } catch (error) {
            console.warn('フィルター設定の保存に失敗:', error);
        }
    };

    // スライダー値の表示のみ更新（フィルター適用なし）
    const updateScoreDisplay = (type, value) => {
        const numValue = parseInt(value);
        
        if (type === 'min') {
            const maxSlider = document.getElementById('scoreMaxSlider');
            const maxValue = parseInt(maxSlider.value);
            const adjustedMin = Math.min(numValue, maxValue);
            
            document.getElementById('scoreMinValue').textContent = adjustedMin;
            document.getElementById('scoreMinSlider').value = adjustedMin;
            
            // 範囲表示の更新
            const display = document.querySelector('.modal-section-group:first-child .filter-range-display');
            if (display) {
                display.textContent = `${adjustedMin}点 - ${maxValue}点`;
            }
        } else {
            const minSlider = document.getElementById('scoreMinSlider');
            const minValue = parseInt(minSlider.value);
            const adjustedMax = Math.max(numValue, minValue);
            
            document.getElementById('scoreMaxValue').textContent = adjustedMax;
            document.getElementById('scoreMaxSlider').value = adjustedMax;
            
            // 範囲表示の更新
            const display = document.querySelector('.modal-section-group:first-child .filter-range-display');
            if (display) {
                display.textContent = `${minValue}点 - ${adjustedMax}点`;
            }
        }
    };

    // スライダー値の表示のみ更新（フィルター適用なし）
    const updateDateDisplay = (type, value) => {
        const numValue = parseInt(value);
        
        if (type === 'min') {
            const maxSlider = document.getElementById('dateMaxSlider');
            const maxValue = parseInt(maxSlider.value);
            const adjustedMin = Math.min(numValue, maxValue);
            
            document.getElementById('dateMinValue').textContent = adjustedMin;
            document.getElementById('dateMinSlider').value = adjustedMin;
            
            // 範囲表示の更新
            const displays = document.querySelectorAll('.filter-range-display');
            if (displays.length >= 2) {
                displays[1].textContent = `${adjustedMin}日前 - ${maxValue}日前`;
            }
        } else {
            const minSlider = document.getElementById('dateMinSlider');
            const minValue = parseInt(minSlider.value);
            const adjustedMax = Math.max(numValue, minValue);
            
            document.getElementById('dateMaxValue').textContent = adjustedMax;
            document.getElementById('dateMaxSlider').value = adjustedMax;
            
            // 範囲表示の更新
            const displays = document.querySelectorAll('.filter-range-display');
            if (displays.length >= 2) {
                displays[1].textContent = `${minValue}日前 - ${adjustedMax}日前`;
            }
        }
    };

    // 設定適用（ボタンクリック時のみ実行）
    const applyFilterSettings = () => {
        // 現在のスライダー値を直接取得
        const scoreMin = parseInt(document.getElementById('scoreMinSlider').value);
        const scoreMax = parseInt(document.getElementById('scoreMaxSlider').value);
        const dateMin = parseInt(document.getElementById('dateMinSlider').value);
        const dateMax = parseInt(document.getElementById('dateMaxSlider').value);
        
        // 設定を保存
        const newSettings = {
            scoreMin: scoreMin,
            scoreMax: scoreMax,
            dateMin: dateMin,
            dateMax: dateMax
        };
        
        saveFilterSettings(newSettings);
        
        // 記事一覧に反映
        updateArticleListOnly();
        
        alert('フィルター設定を適用しました');
    };

    // リセット機能（シンプル版）
    const resetFilterSettings = () => {
        const defaultSettings = {
            scoreMin: 0,
            scoreMax: 100,
            dateMin: 0,
            dateMax: 14
        };
        
        // 設定を保存
        saveFilterSettings(defaultSettings);
        
        // スライダーと表示を初期値に戻す
        document.getElementById('scoreMinSlider').value = 0;
        document.getElementById('scoreMaxSlider').value = 100;
        document.getElementById('dateMinSlider').value = 0;
        document.getElementById('dateMaxSlider').value = 14;
        
        document.getElementById('scoreMinValue').textContent = 0;
        document.getElementById('scoreMaxValue').textContent = 100;
        document.getElementById('dateMinValue').textContent = 0;
        document.getElementById('dateMaxValue').textContent = 14;
        
        // 範囲表示も更新
        const displays = document.querySelectorAll('.filter-range-display');
        if (displays.length >= 1) {
            displays[0].textContent = '0点 - 100点';
        }
        if (displays.length >= 2) {
            displays[1].textContent = '0日前 - 14日前';
        }
        
        // 記事一覧に反映
        updateArticleListOnly();
        
        alert('フィルター設定をリセットしました');
    };

    // ===========================================
    // ユニークID生成機能（日本語対応）
    // ===========================================

    const encodeToValidId = (text) => {
        return encodeURIComponent(text).replace(/[^A-Za-z0-9_-]/g, '_');
    };

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

    // ===========================================
    // フィルター状態永続化機能
    // ===========================================

    const getStoredFilterState = () => {
        try {
            const stored = localStorage.getItem('minews_filterState');
            if (stored) {
                const parsed = JSON.parse(stored);
                return {
                    viewMode: parsed.viewMode || 'all',
                    selectedFolders: parsed.selectedFolders || [],
                    selectedFeeds: parsed.selectedFeeds || []
                };
            }
        } catch (error) {
            console.warn('フィルター状態の復元に失敗:', error);
        }
        return {
            viewMode: 'all',
            selectedFolders: [],
            selectedFeeds: []
        };
    };

    const saveFilterState = (viewMode, selectedFolders, selectedFeeds) => {
        try {
            const filterState = { viewMode, selectedFolders, selectedFeeds };
            localStorage.setItem('minews_filterState', JSON.stringify(filterState));
        } catch (error) {
            console.warn('フィルター状態の保存に失敗:', error);
        }
    };

    // ===========================================
    // アプリケーション状態管理
    // ===========================================

    const initialFilterState = getStoredFilterState();
    window.state = {
        viewMode: initialFilterState.viewMode,
        selectedFolders: initialFilterState.selectedFolders,
        selectedFeeds: initialFilterState.selectedFeeds,
        showModal: null,
        articles: [],
        isLoading: false,
        lastUpdate: null,
        isSyncUpdating: false,
        isBackgroundSyncing: false
    };

    const initializeFolderFeeds = () => {
        const folders = [...new Set(window.state.articles.map(article => article.folderName))].sort();
        const feeds = [...new Set(window.state.articles.map(article => article.rssSource))].sort();
        
        if (window.state.selectedFolders.length === 0) {
            window.state.selectedFolders = [...folders];
        }
        if (window.state.selectedFeeds.length === 0) {
            window.state.selectedFeeds = [...feeds];
        }
    };

    window.setState = (newState) => {
        window.state = { ...window.state, ...newState };
        
        if (newState.viewMode !== undefined || newState.selectedFolders !== undefined || newState.selectedFeeds !== undefined) {
            saveFilterState(
                newState.viewMode || window.state.viewMode,
                newState.selectedFolders || window.state.selectedFolders,
                newState.selectedFeeds || window.state.selectedFeeds
            );
        }
        
        window.render();
    };

    const initializeData = () => {
        const articlesData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.ARTICLES, window.DEFAULT_DATA.articles);
        const aiData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, window.DEFAULT_DATA.aiLearning);
        const wordData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, window.DEFAULT_DATA.wordFilters);

        Object.assign(window.DataHooksCache, {
            articles: articlesData,
            aiLearning: aiData,
            wordFilters: wordData
        });

        window.state.articles = articlesData;
        initializeFolderFeeds();
    };

    const initializeGistSync = () => {
        if (window.GistSyncManager) {
            const config = window.GistSyncManager.loadConfig();
            if (config && config.hasToken) {
                console.log('GitHub同期設定を復元しました');
                window.GistSyncManager.startPeriodicSync(60);
            }
        }
    };

    window.initializeGistSync = initializeGistSync;

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

    const formatLastSyncTime = (isoString) => {
        try {
            const date = new Date(isoString);
            return date.toLocaleString('ja-JP', {
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric'
            });
        } catch (error) {
            return '日時不明';
        }
    };

    // ===========================================
    // 部分更新関数（DOM再構築回避用）
    // ===========================================

    const updateArticleCount = () => {
        const count = getFilteredArticles().length;
        
        const mobileUpdate = document.querySelector('.last-update-mobile');
        if (mobileUpdate) {
            mobileUpdate.textContent = `表示中: ${count}件`;
        }
        
        const desktopUpdate = document.querySelector('.last-update');
        if (desktopUpdate) {
            desktopUpdate.textContent = `表示中: ${count}件`;
        }
    };

    const updateArticleListOnly = () => {
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.innerHTML = renderArticleList();
            
            updateArticleCount();
            
            if (!window._starClickHandler) {
                window._starClickHandler = (e) => {
                    handleArticleClick(e, e.target.getAttribute('data-article-id'), 'rating');
                };
            }

            document.querySelectorAll('.star').forEach(star => {
                star.removeEventListener('click', window._starClickHandler);
                star.addEventListener('click', window._starClickHandler);
            });
        }
    };

    const updateFolderButtonCount = () => {
        const folders = [...new Set(window.state.articles.map(article => article.folderName))].sort();
        
        document.querySelectorAll('.folder-dropdown-btn').forEach(btn => {
            const countText = `フォルダ選択 (${window.state.selectedFolders.length}/${folders.length})`;
            const textNode = btn.childNodes[0];
            if (textNode && textNode.nodeType === Node.TEXT_NODE) {
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
                const allSelected = folders.every(folder => window.state.selectedFolders.includes(folder));
                selectAllCheckbox.checked = allSelected;
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

    // ===========================================
    // 一括既読化処理
    // ===========================================

    const handleBulkMarkAsRead = () => {
        const confirmed = confirm('表示している記事を一括で既読にしますか？');
        if (!confirmed) {
            return;
        }
        
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
            updateArticleListOnly();
            
            if (window.GistSyncManager?.isEnabled) {
                window.GistSyncManager.markAsChanged();
            }
            
            alert(`${updatedCount}件の記事を既読にしました`);
        } else {
            alert('既読にする記事がありませんでした');
        }
    };

    // ===========================================
    // フォルダ・フィード管理（フィード連動対応版）
    // ===========================================

    const handleFolderToggle = (folderName, event) => {
        if (event) {
            event.stopPropagation();
        }
        
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
                if (feedIndex > -1) {
                    selectedFeeds.splice(feedIndex, 1);
                }
            });
        } else {
            selectedFolders.push(folderName);
            feedsInFolder.forEach(feed => {
                if (!selectedFeeds.includes(feed)) {
                    selectedFeeds.push(feed);
                }
            });
        }
        
        window.state.selectedFolders = selectedFolders;
        window.state.selectedFeeds = selectedFeeds;
        saveFilterState(window.state.viewMode, selectedFolders, selectedFeeds);
        
        updateArticleListOnly();
        updateFolderButtonCount();
        updateFolderCheckboxStates();
    };

    const handleFeedToggle = (feedName, event) => {
        if (event) {
            event.stopPropagation();
        }
        
        const selectedFeeds = [...window.state.selectedFeeds];
        const index = selectedFeeds.indexOf(feedName);
        
        if (index > -1) {
            selectedFeeds.splice(index, 1);
        } else {
            selectedFeeds.push(feedName);
        }
        
        window.state.selectedFeeds = selectedFeeds;
        saveFilterState(window.state.viewMode, window.state.selectedFolders, selectedFeeds);
        
        updateArticleListOnly();
        updateFolderButtonCount();
        updateFeedCheckboxStates();
    };

    const handleSelectAllFolders = (selectAll, event) => {
        if (event) {
            event.stopPropagation();
        }
        
        let selectedFolders;
        let selectedFeeds;
        if (selectAll) {
            const folders = [...new Set(window.state.articles.map(article => article.folderName))].sort();
            const feeds = [...new Set(window.state.articles.map(article => article.rssSource))].sort();
            selectedFolders = [...folders];
            selectedFeeds = [...feeds];
        } else {
            selectedFolders = [];
            selectedFeeds = [];
        }
        
        window.state.selectedFolders = selectedFolders;
        window.state.selectedFeeds = selectedFeeds;
        saveFilterState(window.state.viewMode, selectedFolders, selectedFeeds);
        
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
                <div class="folder-dropdown-content" id="${prefix}folderDropdownContent" style="display: none; position: absolute; left: 0; top: 100%; width: 100vw; max-height: calc(100vh - 120px); overflow-y: auto; background-color: #1f2937; z-index: 1000; box-shadow: 0 4px 6px rgba(0,0,0,0.3); padding: 1rem;">
                    <div class="folder-controls">
                        <label class="folder-item" for="${prefix}selectAllFolders">
                            <input type="checkbox" id="${prefix}selectAllFolders" name="${prefix}selectAllFolders" 
                                   ${allFoldersSelected ? 'checked' : ''} 
                                   onchange="event.stopPropagation(); handleSelectAllFolders(this.checked, event)">
                            <span>すべてのフォルダ</span>
                        </label>
                    </div>
                    <hr class="folder-separator">
                    ${folders.map((folder) => {
                        const folderId = uniqueIds.folderIds[folder];
                        return `
                        <div class="folder-group">
                            <label class="folder-item" for="${folderId}">
                                <input type="checkbox" id="${folderId}" name="${folderId}" 
                                       ${window.state.selectedFolders.includes(folder) ? 'checked' : ''} 
                                       onchange="event.stopPropagation(); handleFolderToggle('${folder.replace(/'/g, "\\'")}', event)">
                                <span class="folder-name">${folder}</span>
                            </label>
                            <div class="feed-list">
                                ${Array.from(foldersByFeed[folder]).map((feed) => {
                                    const feedId = uniqueIds.feedIds[folder][feed];
                                    return `
                                    <label class="feed-item" for="${feedId}">
                                        <input type="checkbox" id="${feedId}" name="${feedId}"
                                               ${window.state.selectedFeeds.includes(feed) ? 'checked' : ''} 
                                               onchange="event.stopPropagation(); handleFeedToggle('${feed.replace(/'/g, "\\'")}', event)">
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

    // ===========================================
    // NGワード範囲選択モーダル関数（不具合修正版）
    // ===========================================

    const renderAddNGWordModal = () => {
        const folders = [...new Set(window.state.articles.map(article => article.folderName))].sort();
        const feeds = [...new Set(window.state.articles.map(article => article.rssSource))].sort();
        
        return `
            <div class="modal-overlay" onclick="handleCloseModal()">
                <div class="modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>NGワード追加</h2>
                        <button class="modal-close" onclick="handleCloseModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="modal-section-group">
                            <h3 class="group-title">NGワード設定</h3>
                            
                            <div class="word-section">
                                <div class="word-section-header">
                                    <h3>ワード入力</h3>
                                </div>
                                <input type="text" id="ngWordInput" placeholder="NGワードを入力してください" 
                                       class="filter-select" style="width: 100%; margin-bottom: 1rem;">
                            </div>
                            
                            <div class="word-section">
                                <div class="word-section-header">
                                    <h3>適用範囲</h3>
                                </div>
                                <div style="margin-bottom: 1rem;">
                                    <label style="display: block; margin-bottom: 0.5rem; cursor: pointer;">
                                        <input type="radio" name="ngWordScope" value="all" checked 
                                               onchange="handleNGWordScopeChange(this.value)" 
                                               onclick="handleNGWordScopeChange(this.value)">
                                        <span style="margin-left: 0.5rem;">全体（すべての記事に適用）</span>
                                    </label>
                                    <label style="display: block; margin-bottom: 0.5rem; cursor: pointer;">
                                        <input type="radio" name="ngWordScope" value="folder" 
                                               onchange="handleNGWordScopeChange(this.value)" 
                                               onclick="handleNGWordScopeChange(this.value)">
                                        <span style="margin-left: 0.5rem;">特定のフォルダのみ</span>
                                    </label>
                                    <label style="display: block; margin-bottom: 0.5rem; cursor: pointer;">
                                        <input type="radio" name="ngWordScope" value="feed" 
                                               onchange="handleNGWordScopeChange(this.value)" 
                                               onclick="handleNGWordScopeChange(this.value)">
                                        <span style="margin-left: 0.5rem;">特定のフィードのみ</span>
                                    </label>
                                </div>
                            </div>
                            
                            <div class="word-section" id="ngWordTargetSection" style="display: none;">
                                <div class="word-section-header">
                                    <h3>対象選択</h3>
                                </div>
                                <select id="ngWordTargetSelect" class="filter-select" style="width: 100%; margin-bottom: 1rem;">
                                    <option value="">選択してください</option>
                                </select>
                            </div>
                            
                            <div class="word-help">
                                <h4>範囲設定について</h4>
                                <ul>
                                    <li><strong>全体:</strong> すべての記事に対してNGワードが適用されます</li>
                                    <li><strong>フォルダ:</strong> 指定したフォルダの記事のみにNGワードが適用されます</li>
                                    <li><strong>フィード:</strong> 指定したフィードの記事のみにNGワードが適用されます</li>
                                </ul>
                            </div>
                            
                            <div class="modal-actions">
                                <button class="action-btn" onclick="handleCloseModal()">キャンセル</button>
                                <button class="action-btn success" onclick="handleSubmitNGWord()">NGワードを追加</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    // 【修正版】NGワード範囲変更処理
    const handleNGWordScopeChange = (scope) => {
        console.log('スコープ変更:', scope); // デバッグ用ログ
        
        const targetSection = document.getElementById('ngWordTargetSection');
        const targetSelect = document.getElementById('ngWordTargetSelect');
        
        if (!targetSection || !targetSelect) {
            console.error('必要な要素が見つかりません');
            return;
        }
        
        if (scope === 'all') {
            targetSection.style.display = 'none';
            targetSelect.value = ''; // 【修正】値をクリア
        } else {
            targetSection.style.display = 'block';
            
            // 【修正】既存のoptionを完全にクリア
            targetSelect.innerHTML = '';
            
            // デフォルトオプションを追加
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = '選択してください';
            targetSelect.appendChild(defaultOption);
            
            if (scope === 'folder') {
                const folders = [...new Set(window.state.articles.map(article => article.folderName))].sort();
                folders.forEach(folder => {
                    const option = document.createElement('option');
                    option.value = folder;
                    option.textContent = folder;
                    targetSelect.appendChild(option);
                });
                console.log('フォルダ選択肢を設定:', folders); // デバッグ用ログ
            } else if (scope === 'feed') {
                const feeds = [...new Set(window.state.articles.map(article => article.rssSource))].sort();
                feeds.forEach(feed => {
                    const option = document.createElement('option');
                    option.value = feed;
                    option.textContent = feed;
                    targetSelect.appendChild(option);
                });
                console.log('フィード選択肢を設定:', feeds); // デバッグ用ログ
            }
        }
    };

    // 【修正版】NGワード送信処理
    const handleSubmitNGWord = () => {
        const word = document.getElementById('ngWordInput').value.trim();
        if (!word) {
            alert('NGワードを入力してください');
            return;
        }
        
        // 【修正】ラジオボタンの値取得を確実にする
        const scopeRadio = document.querySelector('input[name="ngWordScope"]:checked');
        if (!scopeRadio) {
            alert('範囲を選択してください');
            return;
        }
        const scope = scopeRadio.value;
        
        console.log('選択されたスコープ:', scope); // デバッグ用ログ
        
        let target = null;
        
        if (scope !== 'all') {
            const targetSelect = document.getElementById('ngWordTargetSelect');
            target = targetSelect ? targetSelect.value : '';
            
            console.log('選択されたターゲット:', target); // デバッグ用ログ
            
            if (!target || target === '') {
                alert('対象を選択してください');
                return;
            }
        }
        
        handleAddNGWordWithScope(word, scope, target);
    };

    // NGワード追加処理（範囲対応版）
    const handleAddNGWordWithScope = (word, scope, target) => {
        if (!word || !word.trim()) return;

        const wordHook = window.DataHooks.useWordFilters();
        const success = wordHook.addNGWord(word.trim(), scope, target);

        if (success) {
            window.setState({ showModal: 'settings' }); // 設定画面に戻る
            window.render();
            
            if (window.GistSyncManager?.isEnabled) {
                window.GistSyncManager.markAsChanged();
            }
        } else {
            alert('そのワードは既に同じ範囲で登録されています');
        }
    };

    // NGワード削除処理（範囲対応版）
    const handleRemoveNGWordWithScope = (word, scope, target) => {
        if (!confirm(`「${word}」を削除しますか？`)) return;

        const wordHook = window.DataHooks.useWordFilters();
        const success = wordHook.removeNGWord(word, scope, target || null);

        if (success) {
            window.render();
            
            if (window.GistSyncManager?.isEnabled) {
                window.GistSyncManager.markAsChanged();
            }
        }
    };

    // ===========================================
    // GitHub同期管理関数
    // ===========================================

    window.handleSaveGitHubToken = () => {
        const token = document.getElementById('githubToken').value.trim();
        const gistId = document.getElementById('gistIdInput').value.trim();
        
        if (!token) {
            alert('GitHub Personal Access Tokenを入力してください');
            return;
        }
        
        try {
            if (gistId) {
                if (!/^[a-zA-Z0-9-_]+$/.test(gistId) || gistId.length < 10) {
                    alert('Gist IDの形式が正しくありません');
                    return;
                }
                
                window.GistSyncManager.init(token, gistId);
                alert('GitHub同期設定を保存しました（既存のGist IDを使用）\n定期同期（1分間隔）が開始されました');
            } else {
                window.GistSyncManager.init(token, null);
                alert('GitHub同期設定を保存しました（新しいGistを作成）\n定期同期（1分間隔）が開始されました');
            }
            
            document.getElementById('githubToken').value = '';
            document.getElementById('gistIdInput').value = '';
            window.render();
        } catch (error) {
            console.error('GitHub設定保存エラー:', error);
            alert('設定の保存に失敗しました: ' + error.message);
        }
    };

    window.handleSyncToCloud = async () => {
        if (!window.GistSyncManager.isEnabled) {
            alert('GitHub同期が設定されていません');
            return;
        }
        
        try {
            const result = await window.GistSyncManager.autoSync('manual');
            if (result.success) {
                alert('データをクラウドに保存しました');
            } else {
                alert('クラウドへの保存に失敗しました: ' + (result.error || result.reason));
            }
        } catch (error) {
            console.error('同期エラー:', error);
            alert('同期処理中にエラーが発生しました: ' + error.message);
        }
    };

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
                            userRating: state.userRating,
                            readLater: state.readLater,
                            lastModified: state.lastModified || article.lastModified
                        };
                    }
                    return article;
                });
                
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
                window.DataHooksCache.clear('articles');
                window.state.articles = updatedArticles;
                
                console.log('記事状態情報を復元しました:', Object.keys(cloudData.articleStates).length, '件');
            }
            
            alert('クラウドからデータを復元しました');
        } catch (error) {
            alert('データの復元に失敗しました: ' + error.message);
        } finally {
            window.setState({ isSyncUpdating: false, isBackgroundSyncing: false });
        }
    };

    window.handleSyncDiagnostic = async () => {
        if (!window.GistSyncManager.isEnabled) {
            alert('GitHub同期が設定されていません');
            return;
        }
        
        try {
            const testResults = await window.GistSyncManager.testSync();
            const passedTests = testResults.tests.filter(t => t.status === 'pass').length;
            const totalTests = testResults.tests.length;
            
            alert(`同期診断結果: ${passedTests}/${totalTests} 項目が正常です`);
        } catch (error) {
            alert('診断テストエラー: ' + error.message);
        }
    };

    window.handleClearGitHubSettings = () => {
        if (!confirm('GitHub同期設定を解除しますか？\n定期同期も停止されます。')) {
            return;
        }
        
        try {
            if (window.GistSyncManager) {
                window.GistSyncManager.stopPeriodicSync();
            }
            
            localStorage.removeItem('minews_gist_config');
            
            if (window.GistSyncManager) {
                window.GistSyncManager.token = null;
                window.GistSyncManager.gistId = null;
                window.GistSyncManager.isEnabled = false;
                window.GistSyncManager.lastSyncTime = null;
                window.GistSyncManager.pendingChanges = false;
            }
            
            alert('GitHub同期設定を解除しました\n定期同期も停止されました');
            window.render();
        } catch (error) {
            alert('設定の解除に失敗しました: ' + error.message);
        }
    };

    window.handleCopyCurrentGistId = async () => {
        if (!window.GistSyncManager?.gistId) {
            alert('コピーするGist IDが設定されていません');
            return;
        }
        
        try {
            await navigator.clipboard.writeText(window.GistSyncManager.gistId);
            alert('Gist IDをコピーしました');
        } catch (error) {
            const textArea = document.createElement('textarea');
            textArea.value = window.GistSyncManager.gistId;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            alert('Gist IDをコピーしました');
        }
    };

    // ===========================================
    // データ管理機能
    // ===========================================

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

                Object.keys(importData.aiLearning.wordWeights || {}).forEach(word => {
                    const weight = importData.aiLearning.wordWeights[word];
                    const currentWeight = aiHook.aiLearning.wordWeights[word] || 0;
                    const newWeight = Math.max(-60, Math.min(60, currentWeight + weight));
                    aiHook.aiLearning.wordWeights[word] = newWeight;
                });

                Object.keys(importData.aiLearning.sourceWeights || {}).forEach(source => {
                    const weight = importData.aiLearning.sourceWeights[source];
                    const currentWeight = aiHook.aiLearning.sourceWeights[source] || 0;
                    const newWeight = Math.max(-20, Math.min(20, currentWeight + weight));
                    aiHook.aiLearning.sourceWeights[source] = newWeight;
                });

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
        event.target.value = '';
    };

    // ===========================================
    // イベントハンドラ
    // ===========================================

    const handleFilterChange = (mode) => {
        window.setState({ viewMode: mode });
    };

    const handleRefresh = async () => {
        window.setState({ isLoading: true });
        
        try {
            const rssHook = window.DataHooks.useRSSManager();
            const result = await rssHook.fetchAllFeeds();
            alert(`記事を更新しました（追加: ${result.totalAdded}件、エラー: ${result.totalErrors}件）`);
            
            window.setState({ 
                lastUpdate: new Date()
            });
            
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
                
                const articleCard = document.querySelector(`[data-article-id="${articleId}"]`).closest('.article-card');
                const readButton = event.target;
                
                if (articleCard) {
                    articleCard.setAttribute('data-read-status', newReadStatus);
                    readButton.textContent = newReadStatus === 'read' ? '既読' : '未読';
                }

                if (window.GistSyncManager?.isEnabled) {
                    window.GistSyncManager.markAsChanged();
                }
                break;

            case 'readLater':
                event.preventDefault();
                event.stopPropagation();
                
                const newReadLater = !article.readLater;
                
                articlesHook.updateArticle(articleId, { readLater: newReadLater }, { skipRender: true });
                
                const readLaterButton = event.target;
                readLaterButton.setAttribute('data-active', newReadLater);
                readLaterButton.textContent = newReadLater ? '解除' : '後で';

                if (window.GistSyncManager?.isEnabled) {
                    window.GistSyncManager.markAsChanged();
                }
                break;

            case 'rating':
                event.preventDefault();
                event.stopPropagation();
                const rating = parseInt(event.target.getAttribute('data-rating'));
                if (rating && rating >= 1 && rating <= 5) {
                    if (article.userRating === rating) {
                        const aiHook = window.DataHooks.useAILearning();
                        aiHook.updateLearningData(article, article.userRating, true);
                        
                        articlesHook.updateArticle(articleId, { userRating: 0 }, { skipRender: true });
                        
                        const starRating = document.querySelector(`.star-rating[data-article-id="${articleId}"]`);
                        if (starRating) {
                            const stars = starRating.querySelectorAll('.star');
                            stars.forEach(star => star.classList.remove('filled'));
                        }

                        if (window.GistSyncManager?.isEnabled) {
                            window.GistSyncManager.markAsChanged();
                        }
                        return;
                    }

                    if (article.userRating > 0) {
                        const aiHook = window.DataHooks.useAILearning();
                        aiHook.updateLearningData(article, article.userRating, true);
                    }

                    const aiHook = window.DataHooks.useAILearning();
                    aiHook.updateLearningData(article, rating, false);

                    articlesHook.updateArticle(articleId, { userRating: rating }, { skipRender: true });
                    
                    const starRating = document.querySelector(`.star-rating[data-article-id="${articleId}"]`);
                    if (starRating) {
                        const stars = starRating.querySelectorAll('.star');
                        stars.forEach((star, index) => {
                            if (index < rating) {
                                star.classList.add('filled');
                            } else {
                                star.classList.remove('filled');
                            }
                        });
                    }

                    if (window.GistSyncManager?.isEnabled) {
                        window.GistSyncManager.markAsChanged();
                    }
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
        window.setState({ showModal: null });
    };

    const handleOpenModal = (modalType) => {
        window.setState({ showModal: modalType });
    };

    // 【修正版】ワード追加処理
    const handleAddWord = (type) => {
        if (type === 'interest') {
            const word = prompt('興味ワードを入力してください:');
            if (!word || !word.trim()) return;

            const wordHook = window.DataHooks.useWordFilters();
            const success = wordHook.addInterestWord(word.trim());

            if (success) {
                window.render();
                if (window.GistSyncManager?.isEnabled) {
                    window.GistSyncManager.markAsChanged();
                }
            } else {
                alert('そのワードは既に登録されています');
            }
        } else {
            // NGワード追加の詳細ダイアログを表示
            window.setState({ showModal: 'addNGWord' });
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
            
            if (window.GistSyncManager?.isEnabled) {
                window.GistSyncManager.markAsChanged();
            }
        }
    };

    // ===========================================
    // レンダリング
    // ===========================================

    const renderNavigation = () => {
        return `
            <nav class="nav">
                <div class="nav-top-row">
                    <div class="nav-left-mobile">
                        <h1><span class="title-mine">Mine</span><span class="title-ws">ws</span></h1>
                        <span class="last-update-mobile">表示中: ${getFilteredArticles().length}件</span>
                    </div>
                    <div class="nav-actions-mobile">
                        <button class="action-btn refresh-btn ${window.state.isLoading ? 'loading' : ''}" 
                                onclick="handleRefresh()" 
                                ${window.state.isLoading ? 'disabled' : ''}>
                            ${window.state.isLoading ? '更新中...' : '記事更新'}
                        </button>
                        <button class="action-btn" onclick="handleOpenModal('settings')">設定</button>
                    </div>
                </div>
                
                <div class="nav-filters-mobile">
                    <div class="filter-row">
                        ${renderFolderDropdown('mobile_')}
                    </div>
                    
                    <div class="filter-row">
                        <label for="viewFilterMobile">表示:</label>
                        <select id="viewFilterMobile" name="viewFilterMobile" class="filter-select" onchange="handleFilterChange(this.value)">
                            <option value="all" ${window.state.viewMode === 'all' ? 'selected' : ''}>全て</option>
                            <option value="unread" ${window.state.viewMode === 'unread' ? 'selected' : ''}>未読のみ</option>
                            <option value="read" ${window.state.viewMode === 'read' ? 'selected' : ''}>既読のみ</option>
                            <option value="readLater" ${window.state.viewMode === 'readLater' ? 'selected' : ''}>後で読む</option>
                        </select>
                        <button class="action-btn bulk-read-btn" onclick="handleBulkMarkAsRead()" title="表示中の記事を一括既読">
                            ✓
                        </button>
                    </div>
                </div>

                <div class="nav-left desktop-only">
                    <h1><span class="title-mine">Mine</span><span class="title-ws">ws</span></h1>
                    <div class="last-update">表示中: ${getFilteredArticles().length}件</div>
                </div>
                
                <div class="nav-filters desktop-only">
                    <div class="filter-group">
                        ${renderFolderDropdown('desktop_')}
                    </div>
                    
                    <div class="filter-group">
                        <label for="viewFilterDesktop">表示:</label>
                        <select id="viewFilterDesktop" name="viewFilterDesktop" class="filter-select" onchange="handleFilterChange(this.value)">
                            <option value="all" ${window.state.viewMode === 'all' ? 'selected' : ''}>全て</option>
                            <option value="unread" ${window.state.viewMode === 'unread' ? 'selected' : ''}>未読のみ</option>
                            <option value="read" ${window.state.viewMode === 'read' ? 'selected' : ''}>既読のみ</option>
                            <option value="readLater" ${window.state.viewMode === 'readLater' ? 'selected' : ''}>後で読む</option>
                        </select>
                        <button class="action-btn bulk-read-btn" onclick="handleBulkMarkAsRead()" title="表示中の記事を一括既読">
                            ✓
                        </button>
                    </div>
                </div>

                <div class="nav-actions desktop-only">
                    <button class="action-btn refresh-btn ${window.state.isLoading ? 'loading' : ''}" 
                            onclick="handleRefresh()" 
                            ${window.state.isLoading ? 'disabled' : ''}>
                        ${window.state.isLoading ? '更新中...' : '記事更新'}
                    </button>
                    <button class="action-btn" onclick="handleOpenModal('settings')">設定</button>
                </div>
            </nav>
        `;
    };

    const getFilteredArticles = () => {
        let filtered = [...window.state.articles];

        filtered = filtered.filter(article => 
            window.state.selectedFolders.includes(article.folderName) || 
            window.state.selectedFeeds.includes(article.rssSource)
        );

        // フィルター設定による追加フィルタリング
        const filterSettings = getFilterSettings();
        const aiHook = window.DataHooks.useAILearning();
        const wordHook = window.DataHooks.useWordFilters();
        
        // AIスコア範囲フィルター
        filtered = filtered.filter(article => {
            const aiScore = window.AIScoring.calculateScore(article, aiHook.aiLearning, wordHook.wordFilters);
            return aiScore >= filterSettings.scoreMin && aiScore <= filterSettings.scoreMax;
        });

        // 日付範囲フィルター
        const now = new Date();
        filtered = filtered.filter(article => {
            const articleDate = new Date(article.publishDate);
            const daysDiff = Math.floor((now - articleDate) / (1000 * 60 * 60 * 24));
            return daysDiff >= filterSettings.dateMin && daysDiff <= filterSettings.dateMax;
        });

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

        filtered = window.WordFilterManager.filterArticles(filtered, wordHook.wordFilters);

        if (window.state.isSyncUpdating && !window.state.isBackgroundSyncing) {
            return filtered;
        }

        const articlesWithScores = filtered.map(article => ({
            ...article,
            aiScore: window.AIScoring.calculateScore(article, aiHook.aiLearning, wordHook.wordFilters)
        }));

        return articlesWithScores.sort((a, b) => {
            if (a.aiScore !== b.aiScore) return b.aiScore - a.aiScore;
            if (a.userRating !== b.userRating) return b.userRating - a.userRating;
            const dateCompare = new Date(b.publishDate) - new Date(a.publishDate);
            if (dateCompare !== 0) return dateCompare;
            return a.id.localeCompare(b.id);
        });
    };

    const renderArticleCard = (article) => {
        const keywords = (article.keywords || []).map(keyword => 
            `<span class="keyword">${keyword}</span>`
        ).join('');

        return `
            <div class="article-card" data-read-status="${article.readStatus}">
                <div class="article-header">
                    <h3 class="article-title">
                        <a href="${article.url}" target="_blank" rel="noopener noreferrer"
                           onclick="handleArticleClick(event, '${article.id}', 'read')"
                           onauxclick="handleArticleClick(event, '${article.id}', 'read')">
                            ${article.title}
                        </a>
                    </h3>
                    
                    <div class="article-meta">
                        <span class="date">${window.formatDate(article.publishDate)}</span>
                        <span class="source">${article.rssSource}</span>
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
                            onclick="handleArticleClick(event, '${article.id}', 'toggleRead')"
                            data-article-id="${article.id}">
                        ${article.readStatus === 'read' ? '既読' : '未読'}
                    </button>
                    <button class="simple-btn read-later" 
                            data-active="${article.readLater}"
                            onclick="handleArticleClick(event, '${article.id}', 'readLater')"
                            data-article-id="${article.id}">
                        ${article.readLater ? '解除' : '後で'}
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

    // 【修正版】設定モーダル（NGワード範囲表示対応）
    const renderSettingsModal = () => {
        const storageInfo = window.LocalStorageManager.getStorageInfo();
        const wordHook = window.DataHooks.useWordFilters();
        
        // フィルター設定の取得（現在保存されている設定）
        const filterSettings = getFilterSettings();
        
        const interestWords = wordHook.wordFilters.interestWords.map(word => 
            `<span class="word-tag interest">
                ${word}
                <button class="word-remove" onclick="handleRemoveWord('${word}', 'interest')">×</button>
            </span>`
        ).join('');

        // 【修正】NGワード表示部分で範囲情報を表示
        const ngWords = wordHook.wordFilters.ngWords.map(ngWordObj => {
            // 旧形式との互換性チェック
            if (typeof ngWordObj === 'string') {
                return `<span class="word-tag ng">
                    ${ngWordObj} <span class="word-scope">[全体]</span>
                    <button class="word-remove" onclick="handleRemoveWord('${ngWordObj}', 'ng')">×</button>
                </span>`;
            } else {
                const scopeText = ngWordObj.scope === 'all' ? '全体' : 
                                 ngWordObj.scope === 'folder' ? `フォルダ: ${ngWordObj.target}` :
                                 `フィード: ${ngWordObj.target}`;
                return `<span class="word-tag ng">
                    ${ngWordObj.word} <span class="word-scope">[${scopeText}]</span>
                    <button class="word-remove" onclick="handleRemoveNGWordWithScope('${ngWordObj.word}', '${ngWordObj.scope}', '${ngWordObj.target || ''}')">×</button>
                </span>`;
            }
        }).join('');
        
        return `
            <div class="modal-overlay" onclick="handleCloseModal()">
                <div class="modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>設定</h2>
                        <button class="modal-close" onclick="handleCloseModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="modal-section-group">
                            <h3 class="group-title">記事フィルター設定</h3>
                            
                            <div class="word-section">
                                <div class="word-section-header">
                                    <h3>AIスコア範囲</h3>
                                    <span class="filter-range-display">${filterSettings.scoreMin}点 - ${filterSettings.scoreMax}点</span>
                                </div>
                                <div class="slider-container">
                                    <label>最小スコア: <span id="scoreMinValue">${filterSettings.scoreMin}</span>点</label>
                                    <input type="range" id="scoreMinSlider" min="0" max="100" value="${filterSettings.scoreMin}" 
                                           oninput="updateScoreDisplay('min', this.value)" class="filter-slider">
                                    
                                    <label>最大スコア: <span id="scoreMaxValue">${filterSettings.scoreMax}</span>点</label>
                                    <input type="range" id="scoreMaxSlider" min="0" max="100" value="${filterSettings.scoreMax}" 
                                           oninput="updateScoreDisplay('max', this.value)" class="filter-slider">
                                </div>
                            </div>

                            <div class="word-section">
                                <div class="word-section-header">
                                    <h3>記事日付範囲</h3>
                                    <span class="filter-range-display">${filterSettings.dateMin}日前 - ${filterSettings.dateMax}日前</span>
                                </div>
                                <div class="slider-container">
                                    <label>最新: <span id="dateMinValue">${filterSettings.dateMin}</span>日前</label>
                                    <input type="range" id="dateMinSlider" min="0" max="14" value="${filterSettings.dateMin}" 
                                           oninput="updateDateDisplay('min', this.value)" class="filter-slider">
                                    
                                    <label>最古: <span id="dateMaxValue">${filterSettings.dateMax}</span>日前</label>
                                    <input type="range" id="dateMaxSlider" min="0" max="14" value="${filterSettings.dateMax}" 
                                           oninput="updateDateDisplay('max', this.value)" class="filter-slider">
                                </div>
                            </div>

                            <div class="modal-actions">
                                <button class="action-btn" onclick="resetFilterSettings()">フィルターをリセット</button>
                                <button class="action-btn success" onclick="applyFilterSettings()">設定を適用</button>
                            </div>
                        </div>
                        
                        <div class="modal-section-group">
                            <h3 class="group-title">クラウド同期</h3>
                            <div class="word-section">
                                <div class="word-section-header">
                                    <h3>GitHub同期設定</h3>
                                </div>
                                
                                <p class="text-muted mb-3">
                                    同期状態: ${window.GistSyncManager?.isEnabled ? '有効' : '無効'}<br>
                                    ${window.GistSyncManager?.gistId ? `Gist ID: ${window.GistSyncManager.gistId}` : ''}
                                    ${window.GistSyncManager?.isEnabled && window.GistSyncManager?.lastSyncTime ? 
                                        `<br>Last update: ${formatLastSyncTime(window.GistSyncManager.lastSyncTime)}` : 
                                        ''}
                                </p>
                                
                                <p class="text-muted mb-3">
                                    GitHub Personal Access Tokenを設定すると、記事の既読・評価・後で読む状態、AI学習データ、ワードフィルターが定期的（1分間隔）に自動で同期されます。
                                </p>
                                
                                ${window.GistSyncManager?.isEnabled ? `
                                    <div style="margin-bottom: 1rem; padding: 0.75rem; background: #374151; border-radius: 6px;">
                                        <div style="color: #9ca3af; font-size: 0.9rem; margin-bottom: 0.75rem;">
                                            GitHub同期は設定済みです。定期同期（1分間隔）が実行中。
                                        </div>
                                        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                                            <button class="action-btn danger" onclick="handleClearGitHubSettings()" style="font-size: 0.85rem;">
                                                設定を解除
                                            </button>
                                            <button class="action-btn" onclick="handleCopyCurrentGistId()" style="font-size: 0.85rem;">
                                                Gist IDコピー
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <div class="modal-actions">
                                        <button class="action-btn" onclick="handleSyncToCloud()">
                                            手動バックアップ
                                        </button>
                                        <button class="action-btn" onclick="handleSyncFromCloud()">
                                            クラウドから復元
                                        </button>
                                        <button class="action-btn" onclick="handleSyncDiagnostic()">
                                            同期診断
                                        </button>
                                    </div>
                                ` : `
                                    <div class="modal-actions">
                                        <div style="margin-bottom: 1rem;">
                                            <label for="githubToken" style="display: block; font-weight: 600; margin-bottom: 0.5rem; color: #e2e8f0;">
                                                GitHub Personal Access Token
                                            </label>
                                            <input type="password" id="githubToken" name="githubToken" placeholder="GitHub Personal Access Tokenを入力" 
                                                   class="filter-select" style="width: 100%;">
                                        </div>
                                        
                                        <div style="margin-bottom: 1rem;">
                                            <label for="gistIdInput" style="display: block; font-weight: 600; margin-bottom: 0.5rem; color: #e2e8f0;">
                                                既存のGist ID（任意）
                                            </label>
                                            <input type="text" id="gistIdInput" name="gistIdInput" placeholder="他のデバイスと同期する場合のみ入力" 
                                                   class="filter-select" style="width: 100%; font-family: monospace;">
                                        </div>
                                        
                                        <button class="action-btn success" onclick="handleSaveGitHubToken()" style="width: 100%; padding: 0.75rem;">
                                            GitHub同期を開始
                                        </button>
                                    </div>
                                `}
                            </div>
                        </div>
                        
                        <div class="modal-section-group">
                            <h3 class="group-title">ワード設定</h3>
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

                        <div class="modal-section-group">
                            <h3 class="group-title">データ管理</h3>
                            <div class="word-section">
                                <div class="word-section-header">
                                    <h3>学習データ管理</h3>
                                </div>
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
                        </div>

                        <div class="modal-section-group">
                            <h3 class="group-title">システム情報</h3>
                            <div class="word-section">
                                <div class="word-section-header">
                                    <h3>ストレージ使用量</h3>
                                </div>
                                <div class="word-list" style="flex-direction: column; align-items: flex-start;">
                                    <p class="text-muted" style="margin: 0;">
                                        使用量: ${Math.round(storageInfo.totalSize / 1024)}KB / 5MB<br>
                                        アイテム数: ${storageInfo.itemCount}
                                    </p>
                                </div>
                            </div>

                            <div class="word-section">
                                <div class="word-section-header">
                                    <h3>バージョン情報</h3>
                                </div>
                                <div class="word-list" style="flex-direction: column; align-items: flex-start;">
                                    <p class="text-muted" style="margin: 0;">
                                        Minews PWA v${window.CONFIG.DATA_VERSION}<br>
                                        すべての修正統合版
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    // 【修正版】モーダル制御（addNGWordケース追加）
    const renderModal = () => {
        switch (window.state.showModal) {
            case 'settings':
                return renderSettingsModal();
            case 'addNGWord':
                return renderAddNGWordModal();
            default:
                return '';
        }
    };

    // ===========================================
    // メインレンダー関数
    // ===========================================

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

        if (!window._starClickHandler) {
            window._starClickHandler = (e) => {
                handleArticleClick(e, e.target.getAttribute('data-article-id'), 'rating');
            };
        }

        document.querySelectorAll('.star').forEach(star => {
            star.removeEventListener('click', window._starClickHandler);
            star.addEventListener('click', window._starClickHandler);
        });
    };

    // ===========================================
    // グローバル関数の追加
    // ===========================================

    window.handleFilterChange = handleFilterChange;
    window.handleRefresh = handleRefresh;
    window.handleArticleClick = handleArticleClick;
    window.handleCloseModal = handleCloseModal;
    window.handleOpenModal = handleOpenModal;
    window.handleAddWord = handleAddWord;
    window.handleRemoveWord = handleRemoveWord;
    window.initializeGistSync = initializeGistSync;
    window.handleFolderToggle = handleFolderToggle;
    window.handleFeedToggle = handleFeedToggle;
    window.handleSelectAllFolders = handleSelectAllFolders;
    window.toggleFolderDropdown = toggleFolderDropdown;
    window.handleBulkMarkAsRead = handleBulkMarkAsRead;
    
    // シンプルフィルター設定関数をグローバルに追加
    window.updateScoreDisplay = updateScoreDisplay;
    window.updateDateDisplay = updateDateDisplay;
    window.applyFilterSettings = applyFilterSettings;
    window.resetFilterSettings = resetFilterSettings;
    window.getFilterSettings = getFilterSettings;

    // 【修正】NGワード範囲選択機能をグローバルに追加
    window.handleAddNGWordWithScope = handleAddNGWordWithScope;
    window.handleNGWordScopeChange = handleNGWordScopeChange;
    window.handleSubmitNGWord = handleSubmitNGWord;
    window.handleRemoveNGWordWithScope = handleRemoveNGWordWithScope;

    // ===========================================
    // 初期化
    // ===========================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initializeData();
            initializeGistSync();
            window.render();
        });
    } else {
        initializeData();
        initializeGistSync();
        window.render();
    }

})();
