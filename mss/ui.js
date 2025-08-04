// Minews PWA - UI・表示レイヤー（負荷軽減・最適化版）
(function() {
    'use strict';

    // ===========================================
    // フィルター状態永続化機能
    // ===========================================

    // フィルター状態をLocalStorageから復元
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

    // フィルター状態をLocalStorageに保存
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

    // 初期状態でLocalStorageから復元（完全サイレント同期フラグ追加）
    const initialFilterState = getStoredFilterState();
    window.state = {
        viewMode: initialFilterState.viewMode,
        selectedSource: initialFilterState.selectedSource,
        showModal: null,
        articles: [],
        isLoading: false,
        lastUpdate: null,
        isSyncUpdating: false,     // 手動同期中フラグ
        isBackgroundSyncing: false // バックグラウンド同期フラグ
    };

    // setState統合版（自動保存機能付き）
    window.setState = (newState) => {
        window.state = { ...window.state, ...newState };
        
        // フィルター関連の状態変更時は自動保存
        if (newState.viewMode !== undefined || newState.selectedSource !== undefined) {
            saveFilterState(
                newState.viewMode || window.state.viewMode,
                newState.selectedSource || window.state.selectedSource
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
    };

    // Gist同期初期化関数
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

    // 最終同期日時フォーマット関数
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
    // GitHub同期管理関数（完全サイレント同期対応版）
    // ===========================================

    // GitHub同期管理関数
    window.handleSaveGitHubToken = () => {
        const token = document.getElementById('githubToken').value.trim();
        const gistId = document.getElementById('gistIdInput').value.trim();
        
        if (!token) {
            alert('GitHub Personal Access Tokenを入力してください');
            return;
        }
        
        try {
            // GistIDの検証と設定
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

    // 手動同期関数（完全サイレント同期対応版）
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

    // クラウド復元処理（完全サイレント同期対応版）
    window.handleSyncFromCloud = async () => {
        if (!window.GistSyncManager.isEnabled) {
            alert('GitHub同期が設定されていません');
            return;
        }
        
        // 手動復元は非サイレント（ユーザーが意図的に実行）
        window.setState({ isSyncUpdating: true, isBackgroundSyncing: false });
        
        try {
            const cloudData = await window.GistSyncManager.syncFromCloud();
            if (!cloudData) {
                alert('クラウドからデータを取得できませんでした');
                return;
            }
            
            // AI学習データの復元
            if (cloudData.aiLearning) {
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, cloudData.aiLearning);
                window.DataHooksCache.clear('aiLearning');
            }
            
            // ワードフィルターの復元
            if (cloudData.wordFilters) {
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, cloudData.wordFilters);
                window.DataHooksCache.clear('wordFilters');
            }
            
            // 記事状態情報の復元
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
            // 手動復元は明示的に画面更新
        } catch (error) {
            alert('データの復元に失敗しました: ' + error.message);
        } finally {
            window.setState({ isSyncUpdating: false, isBackgroundSyncing: false });
        }
    };

    // 同期診断
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

    // 設定解除機能
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

    // Gist IDコピー機能
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
                    const currentWeight = aiHook.aiLearning.wordWeights[word] || 0;
                    const newWeight = Math.max(-60, Math.min(60, currentWeight + weight));
                    aiHook.aiLearning.wordWeights[word] = newWeight;
                });

                // 配信元重みのマージ
                Object.keys(importData.aiLearning.sourceWeights || {}).forEach(source => {
                    const weight = importData.aiLearning.sourceWeights[source];
                    const currentWeight = aiHook.aiLearning.sourceWeights[source] || 0;
                    const newWeight = Math.max(-20, Math.min(20, currentWeight + weight));
                    aiHook.aiLearning.sourceWeights[source] = newWeight;
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
        event.target.value = '';
    };

    // ===========================================
    // フィルタ・イベントハンドラ
    // ===========================================

    const handleFilterChange = (mode) => {
        setState({ viewMode: mode });
    };

    const handleSourceChange = (sourceId) => {
        setState({ selectedSource: sourceId });
    };

    const handleRefresh = async () => {
        setState({ isLoading: true });
        
        try {
            const rssHook = window.DataHooks.useRSSManager();
            const result = await rssHook.fetchAllFeeds();
            alert(`記事を更新しました（追加: ${result.totalAdded}件、エラー: ${result.totalErrors}件）`);
            
            setState({ 
                lastUpdate: new Date()
            });
            
            // 記事更新後の変更マーク設定
            if (window.GistSyncManager?.isEnabled) {
                window.GistSyncManager.markAsChanged();
            }
            
        } catch (error) {
            alert('記事の更新に失敗しました: ' + error.message);
        } finally {
            setState({ isLoading: false });
        }
    };

    // ===========================================
    // 【確実な同期マーク設定】記事操作（負荷軽減版）
    // ===========================================

    const handleArticleClick = (event, articleId, actionType) => {
        // タイトルクリック（read）以外の場合のみイベントを阻止
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
                
                // updateArticleが自動的にlastModifiedを更新する
                articlesHook.updateArticle(articleId, { readStatus: newReadStatus }, { skipRender: true });
                
                // DOM直接更新
                const articleCard = document.querySelector(`[data-article-id="${articleId}"]`).closest('.article-card');
                const readButton = event.target;
                
                if (articleCard) {
                    articleCard.setAttribute('data-read-status', newReadStatus);
                    readButton.textContent = newReadStatus === 'read' ? '既読' : '未読';
                }

                // 確実な同期マーク設定
                if (window.GistSyncManager?.isEnabled) {
                    window.GistSyncManager.markAsChanged();
                    console.log(`既読状態変更: ${articleId} -> ${newReadStatus}, 同期マーク設定完了`);
                }
                break;

            case 'readLater':
                event.preventDefault();
                event.stopPropagation();
                
                const newReadLater = !article.readLater;
                
                // updateArticleが自動的にlastModifiedを更新する
                articlesHook.updateArticle(articleId, { readLater: newReadLater }, { skipRender: true });
                
                // DOM直接更新
                const readLaterButton = event.target;
                readLaterButton.setAttribute('data-active', newReadLater);
                readLaterButton.textContent = newReadLater ? '解除' : '後で';

                // 確実な同期マーク設定
                if (window.GistSyncManager?.isEnabled) {
                    window.GistSyncManager.markAsChanged();
                    console.log(`後で読む状態変更: ${articleId} -> ${newReadLater}, 同期マーク設定完了`);
                }
                break;

            case 'rating':
                event.preventDefault();
                event.stopPropagation();
                const rating = parseInt(event.target.getAttribute('data-rating'));
                if (rating && rating >= 1 && rating <= 5) {
                    // 評価キャンセル機能
                    if (article.userRating === rating) {
                        const aiHook = window.DataHooks.useAILearning();
                        aiHook.updateLearningData(article, article.userRating, true);
                        
                        articlesHook.updateArticle(articleId, { userRating: 0 }, { skipRender: true });
                        
                        // DOM直接更新
                        const starRating = document.querySelector(`.star-rating[data-article-id="${articleId}"]`);
                        if (starRating) {
                            const stars = starRating.querySelectorAll('.star');
                            stars.forEach(star => star.classList.remove('filled'));
                        }

                        if (window.GistSyncManager?.isEnabled) {
                            window.GistSyncManager.markAsChanged();
                            console.log(`評価キャンセル: ${articleId}, 同期マーク設定完了`);
                        }
                        return;
                    }

                    // 既存評価取り消し
                    if (article.userRating > 0) {
                        const aiHook = window.DataHooks.useAILearning();
                        aiHook.updateLearningData(article, article.userRating, true);
                    }

                    // 新しい評価で更新
                    const aiHook = window.DataHooks.useAILearning();
                    aiHook.updateLearningData(article, rating, false);

                    articlesHook.updateArticle(articleId, { userRating: rating }, { skipRender: true });
                    
                    // DOM直接更新
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
                        console.log(`評価変更: ${articleId} -> ${rating}, 同期マーク設定完了`);
                    }
                }
                break;
                
            case 'read':
    if (article.readStatus !== 'read') {
        // 既読ボタンと同様に即座に表示効果を適用
        articlesHook.updateArticle(articleId, { readStatus: 'read' });
        
        if (window.GistSyncManager?.isEnabled) {
            window.GistSyncManager.markAsChanged();
            console.log(`記事閲覧: ${articleId}, 同期マーク設定完了`);
        }
    }
    break;

        }
    };

    // ===========================================
    // モーダル管理
    // ===========================================

    const handleCloseModal = () => {
        setState({ showModal: null });
    };

    const handleOpenModal = (modalType) => {
        setState({ showModal: modalType });
    };

    // ===========================================
    // ワード管理（同期対応）
    // ===========================================

    const handleAddWord = (type) => {
        const word = prompt(type === 'interest' ? '興味ワードを入力してください:' : 'NGワードを入力してください:');
        if (!word || !word.trim()) return;

        const wordHook = window.DataHooks.useWordFilters();
        const success = type === 'interest' 
            ? wordHook.addInterestWord(word.trim())
            : wordHook.addNGWord(word.trim());

        if (success) {
            window.render();
            
            // 変更マーク設定
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
            
            // 変更マーク設定
            if (window.GistSyncManager?.isEnabled) {
                window.GistSyncManager.markAsChanged();
            }
        }
    };

    // ===========================================
    // レンダリング
    // ===========================================

    const renderNavigation = () => {
        const sources = [...new Set(window.state.articles.map(article => article.rssSource))].sort();
        const sourceOptions = [
            '<option value="all">全提供元</option>',
            ...sources.map(source => 
                `<option value="${source}" ${window.state.selectedSource === source ? 'selected' : ''}>${source}</option>`
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
                                ${window.state.isLoading ? 'disabled' : ''}>
                            ${window.state.isLoading ? '更新中...' : '記事更新'}
                        </button>
                        <button class="action-btn" onclick="handleOpenModal('settings')">設定</button>
                    </div>
                </div>
                
                <div class="nav-filters-mobile">
                    <div class="filter-row">
                        <label for="sourceFilter">提供元:</label>
                        <select id="sourceFilter" class="filter-select" onchange="handleSourceChange(this.value)">
                            ${sourceOptions}
                        </select>
                    </div>
                    
                    <div class="filter-row">
                        <label for="viewFilter">表示:</label>
                        <select id="viewFilter" class="filter-select" onchange="handleFilterChange(this.value)">
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
                        <label for="sourceFilter2">提供元:</label>
                        <select id="sourceFilter2" class="filter-select" onchange="handleSourceChange(this.value)">
                            ${sourceOptions}
                        </select>
                    </div>
                    
                    <div class="filter-group">
                        <label for="viewFilter2">表示:</label>
                        <select id="viewFilter2" class="filter-select" onchange="handleFilterChange(this.value)">
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
                            ${window.state.isLoading ? 'disabled' : ''}>
                        ${window.state.isLoading ? '更新中...' : '記事更新'}
                    </button>
                    <button class="action-btn" onclick="handleOpenModal('settings')">設定</button>
                </div>
            </nav>
        `;
    };

    // 記事フィルタリング（完全サイレント対応版）
    const getFilteredArticles = () => {
        let filtered = [...window.state.articles];

        // 提供元フィルター
        if (window.state.selectedSource !== 'all') {
            filtered = filtered.filter(article => article.rssSource === window.state.selectedSource);
        }

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

        // NGワードフィルター
        const wordHook = window.DataHooks.useWordFilters();
        filtered = window.WordFilterManager.filterArticles(filtered, wordHook.wordFilters);

        // 手動同期中のみソートを抑制（自動同期は関係なし）
        if (window.state.isSyncUpdating && !window.state.isBackgroundSyncing) {
            console.log('手動同期中のためソートを抑制します');
            return filtered;
        }

        // バックグラウンド同期中は通常通りソートを実行
        // これにより、フィルター操作時などに最新データで正しくソートされる

        // AIスコア計算と通常ソート
        const aiHook = window.DataHooks.useAILearning();
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

    const renderSettingsModal = () => {
        const storageInfo = window.LocalStorageManager.getStorageInfo();
        const wordHook = window.DataHooks.useWordFilters();
        
        const interestWords = wordHook.wordFilters.interestWords.map(word => 
            `<span class="word-tag interest">
                ${word}
                <button class="word-remove" onclick="handleRemoveWord('${word}', 'interest')">×</button>
            </span>`
        ).join('');

        const ngWords = wordHook.wordFilters.ngWords.map(word => 
            `<span class="word-tag ng">
                ${word}
                <button class="word-remove" onclick="handleRemoveWord('${word}', 'ng')">×</button>
            </span>`
        ).join('');
        
        return `
            <div class="modal-overlay" onclick="handleCloseModal()">
                <div class="modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>設定</h2>
                        <button class="modal-close" onclick="handleCloseModal()">×</button>
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
                                            <label style="display: block; font-weight: 600; margin-bottom: 0.5rem; color: #e2e8f0;">
                                                GitHub Personal Access Token
                                            </label>
                                            <input type="password" id="githubToken" placeholder="GitHub Personal Access Tokenを入力" 
                                                   class="filter-select" style="width: 100%;">
                                        </div>
                                        
                                        <div style="margin-bottom: 1rem;">
                                            <label style="display: block; font-weight: 600; margin-bottom: 0.5rem; color: #e2e8f0;">
                                                既存のGist ID（任意）
                                            </label>
                                            <input type="text" id="gistIdInput" placeholder="他のデバイスと同期する場合のみ入力" 
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
                                        負荷軽減・最適化版
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
