// Minews PWA - UI・表示レイヤー（GitHub Gist同期設定UI改善完全統合版）
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

    // 初期状態でLocalStorageから復元
    const initialFilterState = getStoredFilterState();
    window.state = {
        viewMode: initialFilterState.viewMode,
        selectedSource: initialFilterState.selectedSource,
        showModal: null,
        articles: [],
        isLoading: false,
        lastUpdate: null
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
                // 暗号化されたトークンが復号化され、自動的に有効化
                console.log('GitHub同期設定を復元しました（自動同期が有効です）');
                
                // 初回読み込み時に軽微な通知
                setTimeout(() => {
                    window.GistSyncManager.showSyncNotification(
                        'GitHub同期が有効です', 
                        'info'
                    );
                }, 1000);
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
    // GitHub同期管理関数（UI改善完全版）
    // ===========================================

    // GitHub同期管理関数
    window.handleSaveGitHubToken = () => {
        const token = document.getElementById('githubToken').value.trim();
        const gistId = document.getElementById('gistIdInput').value.trim();
        
        if (!token) {
            alert('GitHub Personal Access Tokenを入力してください');
            return;
        }
        
        // GistIDの検証と設定
        if (gistId) {
            // GistID形式の簡易検証（英数字とハイフン、30文字程度）
            if (!/^[a-zA-Z0-9-_]+$/.test(gistId) || gistId.length < 10) {
                alert('Gist IDの形式が正しくありません。\n正しいGist IDを入力してください。');
                return;
            }
            
            // 既存のGist IDを使用
            window.GistSyncManager.init(token, gistId);
            alert(`GitHub同期設定を保存しました\n（既存のGist ID: ${gistId} を使用します）\n\n他のデバイスでも同じGist IDを設定してください。`);
        } else {
            // 新しいGistを作成する場合
            window.GistSyncManager.init(token, null);
            alert('GitHub同期設定を保存しました\n（新しいGistが作成されます）\n\n他のデバイスで同期する場合は、作成されたGist IDをメモしてください。');
        }
        
        document.getElementById('githubToken').value = '';
        
        // 設定保存後に軽微な通知
        window.GistSyncManager.showSyncNotification('GitHub同期が有効になりました', 'success');
        
        // 設定画面を再描画
        window.render();
    };

    // 詳細診断機能付き手動同期
    window.handleSyncToCloud = async () => {
        if (!window.GistSyncManager.isEnabled) {
            alert('先にGitHub Personal Access Tokenを設定してください');
            return;
        }
        
        const result = await window.GistSyncManager.autoSync('manual');
        if (result.success) {
            alert('データをクラウドに保存しました');
        } else {
            const errorDetails = window.GistSyncManager.getErrorMessage(result.error || new Error(result.reason), true);
            let message = `クラウドへの保存に失敗しました\n\n`;
            message += `エラー: ${errorDetails.message}\n`;
            if (errorDetails.debugInfo.suggestion) {
                message += `対処法: ${errorDetails.debugInfo.suggestion}\n`;
            }
            if (errorDetails.debugInfo.rateLimitInfo) {
                message += `\n制限情報: ${errorDetails.debugInfo.rateLimitInfo}`;
            }
            alert(message);
        }
    };

    window.handleSyncFromCloud = async () => {
        if (!window.GistSyncManager.isEnabled) {
            alert('先にGitHub Personal Access Tokenを設定してください');
            return;
        }
        
        try {
            const cloudData = await window.GistSyncManager.syncFromCloud();
            if (!cloudData) {
                alert('クラウドからデータを取得できませんでした');
                return;
            }
            
            // データ復元処理
            if (cloudData.aiLearning) {
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, cloudData.aiLearning);
                window.DataHooksCache.clear('aiLearning');
            }
            
            if (cloudData.wordFilters) {
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, cloudData.wordFilters);
                window.DataHooksCache.clear('wordFilters');
            }
            
            if (cloudData.filterState) {
                window.setState({
                    viewMode: cloudData.filterState.viewMode || 'all',
                    selectedSource: cloudData.filterState.selectedSource || 'all'
                });
            }
            
            alert('クラウドからデータを復元しました');
            window.render();
        } catch (error) {
            alert('データの復元に失敗しました: ' + error.message);
        }
    };

    // 同期診断テスト機能
    window.handleSyncDiagnostic = async () => {
        if (!window.GistSyncManager.isEnabled) {
            alert('先にGitHub Personal Access Tokenを設定してください');
            return;
        }
        
        try {
            const testResults = await window.GistSyncManager.testSync();
            
            let message = '📋 GitHub Gist同期診断結果\n\n';
            testResults.tests.forEach((test, index) => {
                const status = test.status === 'pass' ? '✅' : '❌';
                message += `${index + 1}. ${status} ${test.name}\n`;
                
                if (test.details) {
                    Object.entries(test.details).forEach(([key, value]) => {
                        if (typeof value === 'object') {
                            message += `   ${key}: ${JSON.stringify(value, null, 2)}\n`;
                        } else {
                            message += `   ${key}: ${value}\n`;
                        }
                    });
                }
                message += '\n';
            });
            
            // 診断結果をコンソールにも出力
            console.log('🔍 GitHub Gist同期診断結果:', testResults);
            
            alert(message);
            
        } catch (error) {
            alert(`診断テストでエラーが発生しました: ${error.message}`);
        }
    };

    // 🔥 設定解除機能
    window.handleClearGitHubSettings = () => {
        if (!confirm('GitHub同期設定を完全に解除しますか？\n\n⚠️ 注意: 同期機能が無効になり、他のデバイスとのデータ共有ができなくなります。\n（ローカルの学習データは保持されます）')) {
            return;
        }
        
        try {
            // LocalStorageから設定を削除
            localStorage.removeItem('minews_gist_config');
            
            // GistSyncManagerの状態をリセット
            if (window.GistSyncManager) {
                window.GistSyncManager.token = null;
                window.GistSyncManager.gistId = null;
                window.GistSyncManager.isEnabled = false;
                window.GistSyncManager.lastSyncTime = null;
            }
            
            alert('✅ GitHub同期設定を解除しました。\n\n同期機能を再び使用する場合は、Personal Access Tokenを再設定してください。');
            
            // 設定画面を再描画
            window.render();
            
        } catch (error) {
            alert('❌ 設定の解除に失敗しました: ' + error.message);
            console.error('設定解除エラー:', error);
        }
    };

    // 🔥 現在のGist IDコピー機能
    window.handleCopyCurrentGistId = async () => {
        if (!window.GistSyncManager?.gistId) {
            alert('❌ コピーするGist IDが設定されていません。');
            return;
        }
        
        try {
            await navigator.clipboard.writeText(window.GistSyncManager.gistId);
            window.GistSyncManager.showSyncNotification(
                `📋 Gist IDをコピーしました: ${window.GistSyncManager.gistId.substring(0, 8)}...`, 
                'success'
            );
        } catch (error) {
            // フォールバック: テキスト選択
            const textArea = document.createElement('textarea');
            textArea.value = window.GistSyncManager.gistId;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            
            window.GistSyncManager.showSyncNotification('📋 Gist IDをコピーしました', 'success');
        }
    };

    // ===========================================
    // データ管理機能
    // ===========================================

    // 学習データエクスポート（配信元重み対応版）
    window.handleExportLearningData = () => {
        const aiHook = window.DataHooks.useAILearning();
        const wordHook = window.DataHooks.useWordFilters();

        const exportData = {
            version: window.CONFIG.DATA_VERSION,
            exportDate: new Date().toISOString(),
            aiLearning: aiHook.aiLearning,
            wordFilters: wordHook.wordFilters,
            // 配信元重み機能を含むことを明記
            features: {
                sourceWeights: true,
                categoryWeights: false,
                note: 'v1.1配信元重み対応版'
            }
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `minews_learning_data_${new Date().toISOString().split('T')[0]}.json`;
        link.click();

        alert('学習データをエクスポートしました（配信元重み機能付き）');
    };

    // 学習データインポート（配信元重み対応版）
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

                // AI学習データのマージ（キーワード重み）
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

                // 旧categoryWeightsの移行処理（初回のみ）
                if (importData.aiLearning.categoryWeights && Object.keys(importData.aiLearning.categoryWeights).length > 0) {
                    console.log('旧categoryWeightsを検出しました。データ移行をスキップします。');
                }

                // ワードフィルターのマージ
                (importData.wordFilters.interestWords || []).forEach(word => {
                    wordHook.addInterestWord(word);
                });

                (importData.wordFilters.ngWords || []).forEach(word => {
                    wordHook.addNGWord(word);
                });

                alert('学習データをインポートしました（配信元重み対応）');
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
        
        // 自動同期トリガー追加
        if (window.GistSyncManager?.isEnabled) {
            window.GistSyncManager.autoSync('filter_change');
        }
    };

    const handleSourceChange = (sourceId) => {
        setState({ selectedSource: sourceId });
        
        // 自動同期トリガー追加
        if (window.GistSyncManager?.isEnabled) {
            window.GistSyncManager.autoSync('source_change');
        }
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
            
            // 記事更新後の自動同期
            if (window.GistSyncManager?.isEnabled) {
                window.GistSyncManager.autoSync('article_update');
            }
            
        } catch (error) {
            alert('記事の更新に失敗しました: ' + error.message);
        } finally {
            setState({ isLoading: false });
        }
    };

    // ===========================================
    // 記事操作（完全最適化版 + ユーザー操作時自動同期対応）
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
                // 既読・未読の切り替えのみ実行（リンクは開かない）
                const newReadStatus = article.readStatus === 'read' ? 'unread' : 'read';
                
                // データ更新のみ、レンダリングはスキップ
                articlesHook.updateArticle(articleId, { readStatus: newReadStatus }, { skipRender: true });
                
                // DOM直接更新：既読ボタンのテキストと記事カードの状態を更新
                const articleCard = document.querySelector(`[data-article-id="${articleId}"]`).closest('.article-card');
                const readButton = event.target;
                
                if (articleCard) {
                    // 記事カードの既読状態属性を更新
                    articleCard.setAttribute('data-read-status', newReadStatus);
                    
                    // 既読ボタンのテキストを更新
                    readButton.textContent = newReadStatus === 'read' ? '既読' : '未読';
                }

                // 既読切替後の自動同期
                if (window.GistSyncManager?.isEnabled) {
                    window.GistSyncManager.autoSync('article_read_toggle');
                }
                break;

            case 'read':
                // タイトルクリック時は常に既読状態にする（未読→既読のみ、既読→既読のまま）
                if (article.readStatus !== 'read') {
                    articlesHook.updateArticle(articleId, { readStatus: 'read' });
                    
                    // タイトルクリック既読化後の自動同期
                    if (window.GistSyncManager?.isEnabled) {
                        window.GistSyncManager.autoSync('article_title_read');
                    }
                }
                break;
                
            case 'readLater':
                event.preventDefault();
                event.stopPropagation();
                
                // データ更新のみ、レンダリングはスキップ
                articlesHook.updateArticle(articleId, { readLater: !article.readLater }, { skipRender: true });
                
                // DOM直接更新：後で読むボタンの状態を更新
                const readLaterButton = event.target;
                const newReadLater = !article.readLater;
                
                readLaterButton.setAttribute('data-active', newReadLater);
                readLaterButton.textContent = newReadLater ? '解除' : '後で';

                // 後で読む切替後の自動同期
                if (window.GistSyncManager?.isEnabled) {
                    window.GistSyncManager.autoSync('article_read_later');
                }
                break;

            case 'rating':
                event.preventDefault();
                event.stopPropagation();
                const rating = parseInt(event.target.getAttribute('data-rating'));
                if (rating && rating >= 1 && rating <= 5) {
                    // 評価キャンセル機能：同じ星をクリックした場合は評価をリセット
                    if (article.userRating === rating) {
                        const aiHook = window.DataHooks.useAILearning();
                        aiHook.updateLearningData(article, article.userRating, true);
                        
                        // データ更新のみ、レンダリングはスキップ
                        articlesHook.updateArticle(articleId, { userRating: 0 }, { skipRender: true });
                        
                        // DOM直接更新：星表示をリセット
                        const starRating = document.querySelector(`.star-rating[data-article-id="${articleId}"]`);
                        if (starRating) {
                            const stars = starRating.querySelectorAll('.star');
                            stars.forEach(star => star.classList.remove('filled'));
                        }

                        // 評価キャンセル後の自動同期
                        if (window.GistSyncManager?.isEnabled) {
                            window.GistSyncManager.autoSync('article_rating');
                        }
                        return;
                    }

                    // 既存評価がある場合は学習データを取り消し
                    if (article.userRating > 0) {
                        const aiHook = window.DataHooks.useAILearning();
                        aiHook.updateLearningData(article, article.userRating, true);
                    }

                    // 新しい評価で学習データを更新
                    const aiHook = window.DataHooks.useAILearning();
                    aiHook.updateLearningData(article, rating, false);

                    // データ更新のみ、レンダリングはスキップ
                    articlesHook.updateArticle(articleId, { userRating: rating }, { skipRender: true });
                    
                    // DOM直接更新：星表示を更新
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

                    // 評価設定後の自動同期
                    if (window.GistSyncManager?.isEnabled) {
                        window.GistSyncManager.autoSync('article_rating');
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
    // ワード管理
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
            
            // ワード追加後の自動同期
            if (window.GistSyncManager?.isEnabled) {
                window.GistSyncManager.autoSync('word_add');
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
            
            // ワード削除後の自動同期
            if (window.GistSyncManager?.isEnabled) {
                window.GistSyncManager.autoSync('word_remove');
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

                <!-- デスクトップ用の既存構造を保持 -->
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

        // AIスコア計算と通常ソート
        const aiHook = window.DataHooks.useAILearning();
        const articlesWithScores = filtered.map(article => ({
            ...article,
            aiScore: window.AIScoring.calculateScore(article, aiHook.aiLearning, wordHook.wordFilters)
        }));

        // 通常のソート処理（安定ソート保証 + ID基準）
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
                                
                                <!-- 🔥 設定状態表示セクション（新規追加） -->
                                <div style="margin-bottom: 1.5rem; padding: 1rem; border-radius: 8px; ${window.GistSyncManager?.isEnabled ? 
                                    'background: #065f46; border: 2px solid #10b981;' : 
                                    'background: #7f1d1d; border: 2px solid #dc2626;'}">
                                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;">
                                        <div style="font-size: 1.5rem;">${window.GistSyncManager?.isEnabled ? '✅' : '❌'}</div>
                                        <div style="font-weight: 600; font-size: 1.1rem; color: white;">
                                            GitHub同期設定状況
                                        </div>
                                    </div>
                                    
                                    <div style="background: rgba(0,0,0,0.2); padding: 0.75rem; border-radius: 6px; font-family: monospace; font-size: 0.9rem;">
                                        <div style="margin-bottom: 0.5rem;">
                                            <strong>🔐 Personal Access Token:</strong> 
                                            <span style="color: ${window.GistSyncManager?.isEnabled ? '#6ee7b7' : '#fca5a5'};">
                                                ${window.GistSyncManager?.isEnabled ? '✓ 設定済み' : '× 未設定'}
                                            </span>
                                        </div>
                                        <div style="margin-bottom: 0.5rem;">
                                            <strong>📁 Gist ID:</strong> 
                                            <span style="color: ${window.GistSyncManager?.gistId ? '#6ee7b7' : '#fca5a5'};">
                                                ${window.GistSyncManager?.gistId ? 
                                                    `✓ ${window.GistSyncManager.gistId}` : 
                                                    '× 未設定'}
                                            </span>
                                        </div>
                                        <div>
                                            <strong>🔄 同期機能:</strong> 
                                            <span style="color: ${window.GistSyncManager?.isEnabled ? '#6ee7b7' : '#fca5a5'};">
                                                ${window.GistSyncManager?.isEnabled ? '✓ 有効' : '× 無効'}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    ${window.GistSyncManager?.isEnabled ? 
                                        '<div style="margin-top: 0.75rem; color: #d1fae5; font-size: 0.85rem;">✅ すべてのユーザー操作が自動的にクラウドに同期されます</div>' :
                                        '<div style="margin-top: 0.75rem; color: #fecaca; font-size: 0.85rem;">⚠️ Personal Access Tokenを設定して同期を有効化してください</div>'
                                    }
                                </div>
                                
                                <p class="text-muted mb-3">
                                    GitHub Personal Access Tokenを設定すると、すべてのユーザー操作時に自動でデータがバックアップされます。<br>
                                    <strong>対象データ:</strong> AI学習データ、ワードフィルター、フィルター状態、記事操作（評価・既読・後で読む）
                                </p>
                                
                                <!-- 🔥 設定状態に応じた条件分岐表示 -->
                                ${window.GistSyncManager?.isEnabled ? `
                                    <!-- 設定済みの場合：設定解除と管理機能 -->
                                    <div style="margin-bottom: 1rem; padding: 0.75rem; background: #374151; border-radius: 6px;">
                                        <div style="color: #9ca3af; font-size: 0.9rem; margin-bottom: 0.75rem;">
                                            GitHub同期は既に設定済みです。設定を変更する場合は、先に現在の設定を解除してください。
                                        </div>
                                        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                                            <button class="action-btn danger" onclick="handleClearGitHubSettings()" style="font-size: 0.85rem;">
                                                🗑️ 設定を解除
                                            </button>
                                            <button class="action-btn" onclick="handleCopyCurrentGistId()" style="font-size: 0.85rem;">
                                                📋 Gist IDコピー
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
                                        <button class="action-btn" onclick="handleSyncDiagnostic()" style="background: #ff9800;">
                                            🔍 同期診断テスト
                                        </button>
                                    </div>
                                ` : `
                                    <!-- 未設定の場合：新規設定フォーム -->
                                    <div class="modal-actions">
                                        <div style="margin-bottom: 1rem;">
                                            <label style="display: block; font-weight: 600; margin-bottom: 0.5rem; color: #e2e8f0;">
                                                GitHub Personal Access Token
                                            </label>
                                            <input type="password" id="githubToken" placeholder="GitHub Personal Access Tokenを入力" 
                                                   class="filter-select" style="width: 100%;">
                                        </div>
                                        
                                        <div style="margin-bottom: 1rem; padding: 0.75rem; background: #1e3a8a; border-radius: 6px; border-left: 4px solid #3b82f6;">
                                            <div style="font-weight: 600; color: #93c5fd; margin-bottom: 0.5rem;">
                                                📱 他のデバイスとの同期（任意）
                                            </div>
                                            <div style="color: #dbeafe; font-size: 0.85rem; margin-bottom: 0.5rem;">
                                                他のデバイスで既にGitHub同期を設定済みの場合は、そのGist IDを入力してください。
                                            </div>
                                            <label style="display: block; font-weight: 600; margin-bottom: 0.5rem; color: #93c5fd; font-size: 0.9rem;">
                                                既存のGist ID（任意）
                                            </label>
                                            <input type="text" id="gistIdInput" placeholder="既存のGist IDを入力（新規作成する場合は空欄）" 
                                                   class="filter-select" style="width: 100%; font-family: monospace; font-size: 0.8rem;">
                                        </div>
                                        
                                        <button class="action-btn success" onclick="handleSaveGitHubToken()" style="width: 100%; padding: 0.75rem;">
                                            🚀 GitHub同期を開始
                                        </button>
                                    </div>
                                `}
                                
                                <div class="word-help" style="margin-top: 1rem;">
                                    <h4>完全自動同期について</h4>
                                    <ul>
                                        <li><strong>設定状態表示:</strong> 一目で設定状況を確認可能</li>
                                        <li><strong>フィルター変更時:</strong> 表示モード・配信元フィルター変更</li>
                                        <li><strong>記事更新時:</strong> articles.json再読み込み</li>
                                        <li><strong>記事操作時:</strong> 評価・既読切替・後で読む切替・タイトルクリック</li>
                                        <li><strong>ワード操作時:</strong> 興味ワード・NGワードの追加削除</li>
                                        <li><strong>診断テスト:</strong> 同期できない場合は診断テストで問題を特定</li>
                                        <li><strong>設定管理:</strong> 設定解除・Gist IDコピー機能</li>
                                        <li><strong>セキュリティ:</strong> プライベートGistで安全に保存</li>
                                        <li><strong>デバイス共有:</strong> 同じGist IDで複数デバイス同期</li>
                                    </ul>
                                </div>
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
                                <p class="text-muted mb-3">AI学習データとワードフィルターをバックアップ・復元できます<br>
                                <span style="color: var(--accent-blue); font-weight: bold;">配信元重み機能対応版</span></p>
                                
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
                                        GitHub Actions対応版（GitHub Gist同期設定UI改善完全版）
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
    // メインレンダー関数（最適化版）
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

        // 星評価のイベントリスナー設定（重複防止）
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
