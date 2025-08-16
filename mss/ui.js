// Minews PWA - UI・表示レイヤー（最適化統合版）
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
    // 【最適化】軽量トースト通知関数
    // ===========================================

    // 【最適化】軽量トースト通知関数
    const showToastNotification = (message, type = 'success') => {
        // 既存のトーストがあれば削除
        const existingToast = document.querySelector('.toast-notification');
        if (existingToast) {
            existingToast.remove();
        }
        
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.style.cssText = `
            position: fixed; 
            top: 20px; 
            right: 20px; 
            background: ${type === 'error' ? '#f44336' : '#4caf50'}; 
            color: white; 
            padding: 12px 20px; 
            border-radius: 6px; 
            z-index: 10001;
            font-size: 14px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            max-width: 300px;
            word-wrap: break-word;
            opacity: 0;
            transform: translateX(100%);
            transition: opacity 0.3s ease, transform 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        // アニメーション表示
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        });
        
        // 自動削除
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 2500); // 2.5秒表示
    };

    // 【最適化】評価済みキーワードのみ取得する関数
    const getRatedKeywords = () => {
        if (!window.KeywordRatingManager) return {};
        
        const ratedKeywords = {};
        // KeywordRatingManagerから全評価データを取得（実装されていると仮定）
        try {
            const allRatings = window.KeywordRatingManager.getAllRatings?.() || {};
            Object.keys(allRatings).forEach(keyword => {
                const rating = allRatings[keyword];
                if (rating > 0) {
                    ratedKeywords[keyword] = rating;
                }
            });
        } catch (error) {
            console.warn('評価済みキーワード取得に失敗:', error);
        }
        
        return ratedKeywords;
    };

    // ===========================================
    // 【最適化】キーワードクリック星評価ポップアップ機能（軽量化版）
    // ===========================================

    // 【最適化】キーワードクリック時のポップアップ表示 - 軽量化版
    const showKeywordRatingModal = (keyword) => {
        // 【最適化】KeywordRatingManagerから直接取得（最高速）
        const currentRating = window.KeywordRatingManager?.getKeywordRating(keyword) || 0;
        
        console.log(`キーワード評価ポップアップを表示: ${keyword}, 現在の評価: ${currentRating}`);
        
        // 【最適化】重複評価の確認（簡素化）
        if (currentRating > 0) {
            const confirmChange = confirm(`「${keyword}」は既に${currentRating}星で評価済みです。\n\n評価を変更しますか？\n（変更しない場合はキャンセルを選択してください）`);
            if (!confirmChange) {
                return; // ユーザーがキャンセルした場合は処理終了
            }
        }
        
        // ポップアップモーダルを作成
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            backdrop-filter: blur(3px);
        `;
        
        let starsHtml = '';
        for (let i = 1; i <= 5; i++) {
            const isActive = i <= currentRating;
            starsHtml += `
                <button class="popup-star ${isActive ? 'active' : ''}" 
                        data-rating="${i}" 
                        onmouseover="highlightStars(${i})"
                        onmouseout="resetStars('${keyword.replace(/'/g, "\\'")}', ${currentRating})"
                        onclick="selectRating('${keyword.replace(/'/g, "\\'")}', ${i})">
                    ★
                </button>
            `;
        }
        
        // 【最適化】AI重み表示は評価済みの場合のみ
        let statusMessage;
        if (currentRating > 0) {
            const aiHook = window.DataHooks.useAILearning();
            const aiWeight = aiHook.aiLearning.wordWeights[keyword];
            statusMessage = `<div style="color: #fbbf24; font-weight: 600;">現在の評価: ${currentRating}星${aiWeight !== undefined ? ` (AI重み: ${aiWeight})` : ''}</div>`;
        } else {
            statusMessage = `<div style="color: #9ca3af;">評価なし</div>`;
        }
        
        modal.innerHTML = `
            <div class="keyword-rating-popup" onclick="event.stopPropagation()" style="
                background: #24323d;
                border-radius: 12px;
                padding: 2rem;
                min-width: 350px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
                text-align: center;
                color: #e0e6eb;
            ">
                <h3 style="margin: 0 0 1rem 0; color: #4eb3d3;">キーワード評価</h3>
                <div style="margin-bottom: 1rem;">
                    <span style="font-size: 1.1rem; font-weight: 600;">${keyword}</span>
                </div>
                <div style="margin-bottom: 1rem;">
                    ${statusMessage}
                </div>
                <div class="rating-stars" style="margin-bottom: 1.5rem; display: flex; justify-content: center; gap: 0.5rem;">
                    ${starsHtml}
                </div>
                <div style="margin-bottom: 1.5rem; font-size: 0.9rem; color: #9ca3af;">
                    <div>1星: 低評価 (-10) | 2星: やや低評価 (-5) | 3星: 中立 (0)</div>
                    <div>4星: やや高評価 (+5) | 5星: 高評価 (+10)</div>
                </div>
                <div style="display: flex; gap: 0.75rem; justify-content: center;">
                    <button onclick="closeKeywordRatingModal()" style="
                        background: #6b7280;
                        color: white;
                        border: none;
                        padding: 0.5rem 1rem;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 0.9rem;
                    ">キャンセル</button>
                    ${currentRating > 0 ? `
                    <button onclick="selectRating('${keyword.replace(/'/g, "\\'")}', 0)" style="
                        background: #f44336;
                        color: white;
                        border: none;
                        padding: 0.5rem 1rem;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 0.9rem;
                    ">評価を削除</button>
                    ` : ''}
                </div>
            </div>
        `;
        
        // クリック外で閉じる
        modal.onclick = () => closeKeywordRatingModal();
        
        document.body.appendChild(modal);
        window._currentKeywordModal = modal;
    };

    // ポップアップを閉じる
    const closeKeywordRatingModal = () => {
        if (window._currentKeywordModal) {
            document.body.removeChild(window._currentKeywordModal);
            window._currentKeywordModal = null;
        }
    };

    // 星のハイライト
    const highlightStars = (rating) => {
        const stars = document.querySelectorAll('.popup-star');
        stars.forEach((star, index) => {
            if (index < rating) {
                star.classList.add('active');
            } else {
                star.classList.remove('active');
            }
        });
    };

    // 星をリセット
    const resetStars = (keyword, originalRating) => {
        const stars = document.querySelectorAll('.popup-star');
        stars.forEach((star, index) => {
            if (index < originalRating) {
                star.classList.add('active');
            } else {
                star.classList.remove('active');
            }
        });
    };

    // 【最適化】評価を選択 - 軽量化版
    const selectRating = (keyword, rating) => {
        try {
            if (!window.KeywordRatingManager) {
                console.error('KeywordRatingManagerが見つかりません');
                alert('キーワード評価システムが初期化されていません');
                return;
            }
            
            // 【最適化】現在の評価をKeywordRatingManagerから直接取得
            const currentRating = window.KeywordRatingManager.getKeywordRating(keyword) || 0;
            
            // 【最適化】同じ評価の重複を防止（シンプル）
            if (currentRating === rating && rating > 0) {
                console.log(`「${keyword}」は既に${rating}星で評価済みです`);
                alert(`「${keyword}」は既に${rating}星で評価済みです`);
                closeKeywordRatingModal();
                return;
            }
            
            // 【最適化】評価削除の確認（シンプル）
            if (rating === 0 && currentRating > 0) {
                const confirmDelete = confirm(`「${keyword}」の${currentRating}星評価を削除しますか？`);
                if (!confirmDelete) {
                    closeKeywordRatingModal();
                    return;
                }
            }
            
            const success = window.KeywordRatingManager.saveKeywordRating(keyword, rating);
            
            if (success) {
                // 【最適化】記事スコア再計算と表示更新を非同期実行
                setTimeout(() => {
                    updateArticleListOnly();
                    
                    // 【最適化】該当キーワード要素のみ更新（全体検索を避ける）
                    const keywordElements = document.querySelectorAll(`.keyword`);
                    keywordElements.forEach(element => {
                        // テキスト内容の完全一致チェック（部分一致を避ける）
                        const elementText = element.textContent.replace(/\s★\d+$/, ''); // 星を除去してチェック
                        if (elementText === keyword) {
                            // 評価クラスを更新
                            element.className = `keyword ${rating > 0 ? `rated-${rating}` : ''}`;
                            // 星表示を更新
                            const keywordText = keyword + (rating > 0 ? ` ★${rating}` : '');
                            element.innerHTML = keywordText;
                            // ツールチップを更新
                            element.title = `クリックして評価 (現在: ${rating > 0 ? rating + '星' : '未評価'})`;
                        }
                    });
                    
                }, 50); // UI更新を少し遅延して応答性を向上
                
                // 【最適化】GIST同期マーク（評価変更時のみ）
                if (window.GistSyncManager?.isEnabled) {
                    window.GistSyncManager.markAsChanged();
                    console.log(`GIST同期マーク: キーワード「${keyword}」評価変更 ${currentRating} → ${rating}`);
                    
                    // 【最適化】バックグラウンド同期をデバウンス（連続評価時の負荷軽減）
                    if (window._syncTimeout) {
                        clearTimeout(window._syncTimeout);
                    }
                    window._syncTimeout = setTimeout(() => {
                        if (window.GistSyncManager?.isEnabled && !window.GistSyncManager.isSyncing) {
                            window.GistSyncManager.autoSync('background');
                        }
                        window._syncTimeout = null;
                    }, 3000); // 3秒後に同期（連続操作時はキャンセルされる）
                }
                
                // 成功通知
                const message = rating === 0 
                    ? `「${keyword}」の評価を削除しました`
                    : currentRating > 0 
                        ? `「${keyword}」の評価を${currentRating}星から${rating}星に変更しました`
                        : `「${keyword}」を${rating}星に評価しました`;
                
                // 【最適化】トースト通知を軽量化
                showToastNotification(message, rating === 0 ? 'error' : 'success');
                
                console.log(`✅ ${message}`);
            } else {
                console.error('キーワード評価の保存に失敗しました');
                alert('キーワード評価の保存に失敗しました');
            }
        } catch (error) {
            console.error('キーワード評価処理中にエラーが発生:', error);
            alert('キーワード評価処理中にエラーが発生しました: ' + error.message);
        }
        
        closeKeywordRatingModal();
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
    // NGワード範囲選択モーダル関数
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

    const handleNGWordScopeChange = (scope) => {
        const targetSection = document.getElementById('ngWordTargetSection');
        const targetSelect = document.getElementById('ngWordTargetSelect');
        
        if (!targetSection || !targetSelect) {
            return;
        }
        
        if (scope === 'all') {
            targetSection.style.display = 'none';
            targetSelect.value = '';
        } else {
            targetSection.style.display = 'block';
            
            targetSelect.innerHTML = '';
            
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
            } else if (scope === 'feed') {
                const feeds = [...new Set(window.state.articles.map(article => article.rssSource))].sort();
                feeds.forEach(feed => {
                    const option = document.createElement('option');
                    option.value = feed;
                    option.textContent = feed;
                    targetSelect.appendChild(option);
                });
            }
        }
    };

    const handleSubmitNGWord = () => {
        const word = document.getElementById('ngWordInput').value.trim();
        if (!word) {
            alert('NGワードを入力してください');
            return;
        }
        
        const scopeRadio = document.querySelector('input[name="ngWordScope"]:checked');
        if (!scopeRadio) {
            alert('範囲を選択してください');
            return;
        }
        const scope = scopeRadio.value;
        
        let target = null;
        
        if (scope !== 'all') {
            const targetSelect = document.getElementById('ngWordTargetSelect');
            target = targetSelect ? targetSelect.value : '';
            
            if (!target || target === '') {
                alert('対象を選択してください');
                return;
            }
        }
        
        handleAddNGWordWithScope(word, scope, target);
    };

    const handleAddNGWordWithScope = (word, scope, target) => {
        if (!word || !word.trim()) return;

        const wordHook = window.DataHooks.useWordFilters();
        const success = wordHook.addNGWord(word.trim(), scope, target);

        if (success) {
            window.setState({ showModal: 'settings' });
            window.render();
            
            if (window.GistSyncManager?.isEnabled) {
                window.GistSyncManager.markAsChanged();
            }
        } else {
            alert('そのワードは既に同じ範囲で登録されています');
        }
    };

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
                readLater: state.readLater,
                lastModified: state.lastModified || article.lastModified
            };
        }
        return article;
    });
    
    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
    window.DataHooksCache.clear('articles');
    
    // 【修正】直接代入ではなくsetStateで状態管理経由する
    window.setState({ articles: updatedArticles });
    
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
            const dateCompare = new Date(b.publishDate) - new Date(a.publishDate);
            if (dateCompare !== 0) return dateCompare;
            return a.id.localeCompare(b.id);
        });
    };

    // 【最適化】記事カード描画（評価済みキーワードのみ処理版）
    const renderArticleCard = (article) => {
        const keywords = (article.keywords || []).map(keyword => {
            // キーワードのサニタイズ
            const sanitizedKeyword = keyword.replace(/[<>"'&]/g, function(match) {
                const escapeChars = {
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#39;',
                    '&': '&amp;'
                };
                return escapeChars[match];
            });
            
            // 【最適化】KeywordRatingManagerから評価済みかチェック（高速）
            const ratingManagerRating = window.KeywordRatingManager?.getKeywordRating(keyword) || 0;
            
            // 【最適化】評価済みの場合のみAI学習データと照合
            let rating = ratingManagerRating;
            if (ratingManagerRating > 0) {
                const aiHook = window.DataHooks.useAILearning();
                const aiWeight = aiHook.aiLearning.wordWeights[keyword];
                
                // AI学習データに存在する場合のみ整合性チェック
                if (aiWeight !== undefined) {
                    const weightToRating = { "-10": 1, "-5": 2, "0": 3, "5": 4, "10": 5 };
                    const aiRating = weightToRating[aiWeight.toString()] || 0;
                    
                    // 不整合がある場合のみ修正（ログ出力も最小限）
                    if (aiRating !== ratingManagerRating && aiRating > 0) {
                        console.log(`評価整合性修正: "${keyword}" ${ratingManagerRating} → ${aiRating}`);
                        rating = aiRating;
                        // 非同期で修正（UI描画を遅延させない）
                        setTimeout(() => {
                            if (window.KeywordRatingManager) {
                                window.KeywordRatingManager.saveKeywordRating(keyword, rating);
                            }
                        }, 0);
                    }
                }
            }
            
            const ratingClass = rating > 0 ? `rated-${rating}` : '';
            
            return `
                <span class="keyword ${ratingClass}" 
                      onclick="showKeywordRatingModal('${keyword.replace(/'/g, "\\'")}'); event.stopPropagation();"
                      title="クリックして評価 (現在: ${rating > 0 ? rating + '星' : '未評価'})">
                    ${sanitizedKeyword}
                    ${rating > 0 ? ` ★${rating}` : ''}
                </span>
            `;
        }).join('');

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

    // 設定モーダル
    const renderSettingsModal = () => {
        const storageInfo = window.LocalStorageManager.getStorageInfo();
        const wordHook = window.DataHooks.useWordFilters();
        
        // フィルター設定の取得
        const filterSettings = getFilterSettings();
        
        const interestWords = wordHook.wordFilters.interestWords.map(word => 
            `<span class="word-tag interest">
                ${word}
                <button class="word-remove" onclick="handleRemoveWord('${word}', 'interest')">×</button>
            </span>`
        ).join('');

        const ngWords = wordHook.wordFilters.ngWords.map(ngWordObj => {
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
                                        最適化統合版
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

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

    // NGワード範囲選択機能をグローバルに追加
    window.handleAddNGWordWithScope = handleAddNGWordWithScope;
    window.handleNGWordScopeChange = handleNGWordScopeChange;
    window.handleSubmitNGWord = handleSubmitNGWord;
    window.handleRemoveNGWordWithScope = handleRemoveNGWordWithScope;

    // 【最適化】キーワードクリック星評価機能をグローバルに追加（軽量化版）
    window.showKeywordRatingModal = showKeywordRatingModal;
    window.closeKeywordRatingModal = closeKeywordRatingModal;
    window.highlightStars = highlightStars;
    window.resetStars = resetStars;
    window.selectRating = selectRating;

    // 【最適化】新規追加関数
    window.showToastNotification = showToastNotification;
    window.getRatedKeywords = getRatedKeywords;

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
