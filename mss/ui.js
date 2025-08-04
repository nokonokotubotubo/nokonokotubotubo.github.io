// Minews PWA - UI・表示レイヤー（フィルター機能・アクセシビリティ修正版）
(function() {
    'use strict';

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
                    selectedSource: parsed.selectedSource || 'all'
                };
            }
        } catch (error) {
            console.warn('フィルター状態の復元に失敗:', error);
        }
        return {
            viewMode: 'all',
            selectedSource: 'all'
        };
    };

    const saveFilterState = (viewMode, selectedSource) => {
        try {
            const filterState = { viewMode, selectedSource };
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
        selectedSource: initialFilterState.selectedSource,
        showModal: null,
        articles: [],
        isLoading: false,
        lastUpdate: null,
        isSyncUpdating: false,
        isBackgroundSyncing: false
    };

    // 【修正】setState関数の実装確認
    window.setState = (newState) => {
        const oldState = { ...window.state };
        window.state = { ...window.state, ...newState };
        
        // フィルター関連の状態変更時は自動保存
        if (newState.viewMode !== undefined || newState.selectedSource !== undefined) {
            saveFilterState(
                newState.viewMode || window.state.viewMode,
                newState.selectedSource || window.state.selectedSource
            );
            console.log('フィルター状態を保存:', {
                viewMode: window.state.viewMode,
                selectedSource: window.state.selectedSource
            });
        }
        
        // 状態変更をログ出力（デバッグ用）
        console.log('状態変更:', {
            old: oldState,
            new: window.state,
            changed: newState
        });
        
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
        console.log('データ初期化完了:', {
            articlesCount: articlesData.length,
            viewMode: window.state.viewMode,
            selectedSource: window.state.selectedSource
        });
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
    // 【修正】フィルター・イベントハンドラー
    // ===========================================

    // 【修正】フィルター変更処理を修正
    const handleFilterChange = (mode) => {
        console.log('フィルター変更:', mode);
        window.setState({ viewMode: mode });
    };

    const handleSourceChange = (sourceId) => {
        console.log('ソース変更:', sourceId);
        window.setState({ selectedSource: sourceId });
    };

    const handleRefresh = async () => {
        console.log('記事更新開始');
        window.setState({ isLoading: true });
        
        try {
            const rssHook = window.DataHooks.useRSSManager();
            const result = await rssHook.fetchAllFeeds();
            alert(`記事を更新しました（追加: ${result.totalAdded}件、エラー: ${result.totalErrors}件）`);
            
            window.setState({ 
                lastUpdate: new Date(),
                isLoading: false
            });
            
            if (window.GistSyncManager?.isEnabled) {
                window.GistSyncManager.markAsChanged();
            }
            
        } catch (error) {
            console.error('記事更新エラー:', error);
            alert('記事の更新に失敗しました: ' + error.message);
            window.setState({ isLoading: false });
        }
    };

    // ===========================================
    // 記事操作（同期マーク設定対応）
    // ===========================================

    const handleArticleClick = (event, articleId, actionType) => {
        console.log('記事操作:', { articleId, actionType });
        
        if (actionType !== 'read') {
            event.preventDefault();
            event.stopPropagation();
        }

        const articlesHook = window.DataHooks.useArticles();
        const article = articlesHook.articles.find(a => a.id === articleId);
        
        if (!article) {
            console.error('記事が見つかりません:', articleId);
            return;
        }

        switch (actionType) {
            case 'toggleRead':
                event.preventDefault();
                event.stopPropagation();
                const newReadStatus = article.readStatus === 'read' ? 'unread' : 'read';
                
                articlesHook.updateArticle(articleId, { readStatus: newReadStatus }, { skipRender: true });
                
                // DOM直接更新
                const articleCard = document.querySelector(`[data-article-id="${articleId}"]`)?.closest('.article-card');
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

    // ===========================================
    // モーダル・ワード管理
    // ===========================================

    const handleCloseModal = () => {
        window.setState({ showModal: null });
    };

    const handleOpenModal = (modalType) => {
        window.setState({ showModal: modalType });
    };

    const handleAddWord = (type) => {
        const word = prompt(type === 'interest' ? '興味ワードを入力してください:' : 'NGワードを入力してください:');
        if (!word || !word.trim()) return;

        const wordHook = window.DataHooks.useWordFilters();
        const success = type === 'interest' 
            ? wordHook.addInterestWord(word.trim())
            : wordHook.addNGWord(word.trim());

        if (success) {
            window.render();
            if (window.GistSyncManager?.isEnabled) {
                window.GistSyncManager.markAsChanged();
            }
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
            if (window.GistSyncManager?.isEnabled) {
                window.GistSyncManager.markAsChanged();
            }
        }
    };

    // ===========================================
    // GitHub同期管理関数
    // ===========================================

    window.handleSaveGitHubToken = () => {
        const token = document.getElementById('githubToken')?.value?.trim();
        const gistId = document.getElementById('gistIdInput')?.value?.trim();
        
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
            
            const tokenInput = document.getElementById('githubToken');
            const gistInput = document.getElementById('gistIdInput');
            if (tokenInput) tokenInput.value = '';
            if (gistInput) gistInput.value = '';
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
    // 【修正】レンダリング（アクセシビリティ対応）
    // ===========================================

    const renderNavigation = () => {
        const sources = [...new Set(window.state.articles.map(article => article.rssSource))].sort();
        const sourceOptions = [
            '<option value="all">全提供元</option>',
            ...sources.map(source => 
                `<option value="${window.escapeXml(source)}" ${window.state.selectedSource === source ? 'selected' : ''}>${window.escapeXml(source)}</option>`
            )
        ].join('');

        return `
            <nav class="nav">
                <div class="nav-top-row">
                    <div class="nav-left-mobile">
                        <h1><span class="title-mine">Mine</span><span class="title-ws">ws</span></h1>
                        ${window.state.lastUpdate ? `<span class="last-update-mobile">最終更新: ${window.formatDate(window.state.lastUpdate)}</span>` : ''}
                    </div>
                    <div class="nav-actions-mobile">
                        <button class="action-btn refresh-btn ${window.state.isLoading ? 'loading' : ''}" 
                                onclick="handleRefresh()" 
                                ${window.state.isLoading ? 'disabled' : ''}
                                type="button">
                            ${window.state.isLoading ? '更新中...' : '記事更新'}
                        </button>
                        <button class="action-btn" onclick="handleOpenModal('settings')" type="button">設定</button>
                    </div>
                </div>
                
                <div class="nav-filters-mobile">
                    <div class="filter-row">
                        <label for="sourceFilter-mobile">提供元:</label>
                        <select id="sourceFilter-mobile" 
                                name="sourceFilter" 
                                class="filter-select" 
                                onchange="handleSourceChange(this.value)"
                                aria-label="提供元を選択">
                            ${sourceOptions}
                        </select>
                    </div>
                    
                    <div class="filter-row">
                        <label for="viewFilter-mobile">表示:</label>
                        <select id="viewFilter-mobile" 
                                name="viewFilter" 
                                class="filter-select" 
                                onchange="handleFilterChange(this.value)"
                                aria-label="表示モードを選択">
                            <option value="all" ${window.state.viewMode === 'all' ? 'selected' : ''}>全て</option>
                            <option value="unread" ${window.state.viewMode === 'unread' ? 'selected' : ''}>未読のみ</option>
                            <option value="read" ${window.state.viewMode === 'read' ? 'selected' : ''}>既読のみ</option>
                            <option value="readLater" ${window.state.viewMode === 'readLater' ? 'selected' : ''}>後で読む</option>
                        </select>
                    </div>
                </div>

                <div class="nav-left desktop-only">
                    <h1><span class="title-mine">Mine</span><span class="title-ws">ws</span></h1>
                    ${window.state.lastUpdate ? `<div class="last-update">最終更新: ${window.formatDate(window.state.lastUpdate)}</div>` : ''}
                </div>
                
                <div class="nav-filters desktop-only">
                    <div class="filter-group">
                        <label for="sourceFilter-desktop">提供元:</label>
                        <select id="sourceFilter-desktop" 
                                name="sourceFilterDesktop" 
                                class="filter-select" 
                                onchange="handleSourceChange(this.value)"
                                aria-label="提供元を選択">
                            ${sourceOptions}
                        </select>
                    </div>
                    
                    <div class="filter-group">
                        <label for="viewFilter-desktop">表示:</label>
                        <select id="viewFilter-desktop" 
                                name="viewFilterDesktop" 
                                class="filter-select" 
                                onchange="handleFilterChange(this.value)"
                                aria-label="表示モードを選択">
                            <option value="all" ${window.state.viewMode === 'all' ? 'selected' : ''}>全て</option>
                            <option value="unread" ${window.state.viewMode === 'unread' ? 'selected' : ''}>未読のみ</option>
                            <option value="read" ${window.state.viewMode === 'read' ? 'selected' : ''}>既読のみ</option>
                            <option value="readLater" ${window.state.viewMode === 'readLater' ? 'selected' : ''}>後で読む</option>
                        </select>
                    </div>
                </div>

                <div class="nav-actions desktop-only">
                    <button class="action-btn refresh-btn ${window.state.isLoading ? 'loading' : ''}" 
                            onclick="handleRefresh()" 
                            ${window.state.isLoading ? 'disabled' : ''}
                            type="button">
                        ${window.state.isLoading ? '更新中...' : '記事更新'}
                    </button>
                    <button class="action-btn" onclick="handleOpenModal('settings')" type="button">設定</button>
                </div>
            </nav>
        `;
    };

    // 【修正】記事フィルタリング機能の実装確認
    const getFilteredArticles = () => {
        console.log('フィルタリング開始:', {
            totalArticles: window.state.articles.length,
            viewMode: window.state.viewMode,
            selectedSource: window.state.selectedSource
        });

        let filtered = [...window.state.articles];

        // 提供元フィルター
        if (window.state.selectedSource !== 'all') {
            const beforeCount = filtered.length;
            filtered = filtered.filter(article => article.rssSource === window.state.selectedSource);
            console.log(`提供元フィルター: ${beforeCount} → ${filtered.length} (${window.state.selectedSource})`);
        }

        // 表示モードフィルター
        switch (window.state.viewMode) {
            case 'unread':
                const beforeUnread = filtered.length;
                filtered = filtered.filter(article => article.readStatus === 'unread' && !article.readLater);
                console.log(`未読フィルター: ${beforeUnread} → ${filtered.length}`);
                break;
            case 'read':
                const beforeRead = filtered.length;
                filtered = filtered.filter(article => article.readStatus === 'read');
                console.log(`既読フィルター: ${beforeRead} → ${filtered.length}`);
                break;
            case 'readLater':
                const beforeReadLater = filtered.length;
                filtered = filtered.filter(article => article.readLater);
                console.log(`後で読むフィルター: ${beforeReadLater} → ${filtered.length}`);
                break;
        }

        // NGワードフィルター
        const wordHook = window.DataHooks.useWordFilters();
        const beforeNgFilter = filtered.length;
        filtered = window.WordFilterManager.filterArticles(filtered, wordHook.wordFilters);
        console.log(`NGワードフィルター: ${beforeNgFilter} → ${filtered.length}`);

        // ソート処理
        if (window.state.isSyncUpdating && !window.state.isBackgroundSyncing) {
            console.log('手動同期中のためソートを抑制');
            return filtered;
        }

        // AIスコア計算とソート
        const aiHook = window.DataHooks.useAILearning();
        const articlesWithScores = filtered.map(article => ({
            ...article,
            aiScore: window.AIScoring.calculateScore(article, aiHook.aiLearning, wordHook.wordFilters)
        }));

        const sorted = articlesWithScores.sort((a, b) => {
            if (a.aiScore !== b.aiScore) return b.aiScore - a.aiScore;
            if (a.userRating !== b.userRating) return b.userRating - a.userRating;
            const dateCompare = new Date(b.publishDate) - new Date(a.publishDate);
            if (dateCompare !== 0) return dateCompare;
            return a.id.localeCompare(b.id);
        });

        console.log(`最終結果: ${sorted.length}件の記事`);
        return sorted;
    };

    const renderArticleCard = (article) => {
        const keywords = (article.keywords || []).map(keyword => 
            `<span class="keyword">${window.escapeXml(keyword)}</span>`
        ).join('');

        return `
            <div class="article-card" data-read-status="${article.readStatus}">
                <div class="article-header">
                    <h3 class="article-title">
                        <a href="${window.escapeXml(article.url)}" target="_blank" rel="noopener noreferrer"
                           onclick="handleArticleClick(event, '${article.id}', 'read')"
                           onauxclick="handleArticleClick(event, '${article.id}', 'read')">
                            ${window.escapeXml(article.title)}
                        </a>
                    </h3>
                    
                    <div class="article-meta">
                        <span class="date">${window.formatDate(article.publishDate)}</span>
                        <span class="source">${window.escapeXml(article.rssSource)}</span>
                        <span class="ai-score">AI: ${article.aiScore || 0}</span>
                        ${article.userRating > 0 ? `<span class="rating-badge">★${article.userRating}</span>` : ''}
                    </div>
                </div>

                <div class="article-content">
                    ${window.truncateText(window.escapeXml(article.content))}
                </div>

                ${keywords ? `<div class="article-keywords">${keywords}</div>` : ''}

                <div class="article-actions">
                    <button class="simple-btn read-status" 
                            onclick="handleArticleClick(event, '${article.id}', 'toggleRead')"
                            data-article-id="${article.id}"
                            type="button"
                            aria-label="${article.readStatus === 'read' ? '未読にする' : '既読にする'}">
                        ${article.readStatus === 'read' ? '既読' : '未読'}
                    </button>
                    <button class="simple-btn read-later" 
                            data-active="${article.readLater}"
                            onclick="handleArticleClick(event, '${article.id}', 'readLater')"
                            data-article-id="${article.id}"
                            type="button"
                            aria-label="${article.readLater ? '後で読むを解除' : '後で読むに追加'}">
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

    const renderSettingsModal = () => {
        const storageInfo = window.LocalStorageManager.getStorageInfo();
        const wordHook = window.DataHooks.useWordFilters();
        
        const interestWords = wordHook.wordFilters.interestWords.map(word => 
            `<span class="word-tag interest">
                ${window.escapeXml(word)}
                <button class="word-remove" onclick="handleRemoveWord('${window.escapeXml(word)}', 'interest')" type="button" aria-label="${word}を削除">×</button>
            </span>`
        ).join('');

        const ngWords = wordHook.wordFilters.ngWords.map(word => 
            `<span class="word-tag ng">
                ${window.escapeXml(word)}
                <button class="word-remove" onclick="handleRemoveWord('${window.escapeXml(word)}', 'ng')" type="button" aria-label="${word}を削除">×</button>
            </span>`
        ).join('');
        
        return `
            <div class="modal-overlay" onclick="handleCloseModal()">
                <div class="modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>設定</h2>
                        <button class="modal-close" onclick="handleCloseModal()" type="button" aria-label="モーダルを閉じる">×</button>
                    </div>
                    <div class="modal-body">
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
                                            <button class="action-btn danger" onclick="handleClearGitHubSettings()" style="font-size: 0.85rem;" type="button">
                                                設定を解除
                                            </button>
                                            <button class="action-btn" onclick="handleCopyCurrentGistId()" style="font-size: 0.85rem;" type="button">
                                                Gist IDコピー
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <div class="modal-actions">
                                        <button class="action-btn" onclick="handleSyncToCloud()" type="button">
                                            手動バックアップ
                                        </button>
                                        <button class="action-btn" onclick="handleSyncFromCloud()" type="button">
                                            クラウドから復元
                                        </button>
                                        <button class="action-btn" onclick="handleSyncDiagnostic()" type="button">
                                            同期診断
                                        </button>
                                    </div>
                                ` : `
                                    <div class="modal-actions">
                                        <div style="margin-bottom: 1rem;">
                                            <label for="githubToken" style="display: block; font-weight: 600; margin-bottom: 0.5rem; color: #e2e8f0;">
                                                GitHub Personal Access Token
                                            </label>
                                            <input type="password" 
                                                   id="githubToken" 
                                                   name="githubToken"
                                                   placeholder="GitHub Personal Access Tokenを入力" 
                                                   class="filter-select" 
                                                   style="width: 100%;"
                                                   autocomplete="off">
                                        </div>
                                        
                                        <div style="margin-bottom: 1rem;">
                                            <label for="gistIdInput" style="display: block; font-weight: 600; margin-bottom: 0.5rem; color: #e2e8f0;">
                                                既存のGist ID（任意）
                                            </label>
                                            <input type="text" 
                                                   id="gistIdInput" 
                                                   name="gistIdInput"
                                                   placeholder="他のデバイスと同期する場合のみ入力" 
                                                   class="filter-select" 
                                                   style="width: 100%; font-family: monospace;"
                                                   autocomplete="off">
                                        </div>
                                        
                                        <button class="action-btn success" onclick="handleSaveGitHubToken()" style="width: 100%; padding: 0.75rem;" type="button">
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
                                    <button class="action-btn success" onclick="handleAddWord('interest')" type="button">追加</button>
                                </div>
                                <div class="word-list">
                                    ${interestWords || '<div class="text-muted">設定されていません</div>'}
                                </div>
                            </div>

                            <div class="word-section">
                                <div class="word-section-header">
                                    <h3>NGワード</h3>
                                    <button class="action-btn danger" onclick="handleAddWord('ng')" type="button">追加</button>
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
                                    <button class="action-btn success" onclick="handleExportLearningData()" type="button">
                                        学習データエクスポート
                                    </button>
                                    
                                    <label class="action-btn" style="cursor: pointer; display: inline-block;">
                                        学習データインポート
                                        <input type="file" 
                                               id="importLearningData"
                                               name="importLearningData"
                                               accept=".json" 
                                               onchange="handleImportLearningData(event)" 
                                               style="display: none;">
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
                                        フィルター機能・アクセシビリティ修正版
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
            default:
                return '';
        }
    };

    // ===========================================
    // メインレンダー関数
    // ===========================================

    window.render = () => {
        const app = document.getElementById('app');
        if (!app) {
            console.error('app要素が見つかりません');
            return;
        }

        console.log('レンダリング開始:', {
            articlesCount: window.state.articles.length,
            viewMode: window.state.viewMode,
            selectedSource: window.state.selectedSource
        });

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
        if (!window._starClickHandler) {
            window._starClickHandler = (e) => {
                handleArticleClick(e, e.target.getAttribute('data-article-id'), 'rating');
            };
        }

        document.querySelectorAll('.star').forEach(star => {
            star.removeEventListener('click', window._starClickHandler);
            star.addEventListener('click', window._starClickHandler);
        });

        console.log('レンダリング完了');
    };

    // ===========================================
    // 初期化
    // ===========================================

    // グローバル関数をウィンドウに追加
    window.handleFilterChange = handleFilterChange;
    window.handleSourceChange = handleSourceChange;
    window.handleRefresh = handleRefresh;
    window.handleArticleClick = handleArticleClick;
    window.handleCloseModal = handleCloseModal;
    window.handleOpenModal = handleOpenModal;
    window.handleAddWord = handleAddWord;
    window.handleRemoveWord = handleRemoveWord;
    window.initializeGistSync = initializeGistSync;

    // DOM読み込み完了時の初期化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('DOM読み込み完了、初期化開始');
            initializeData();
            initializeGistSync();
            window.render();
        });
    } else {
        console.log('DOM既に読み込み済み、初期化開始');
        initializeData();
        initializeGistSync();
        window.render();
    }

})();
