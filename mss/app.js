// Mysews PWA - 第2段階：データ管理実装
(function() {
    'use strict';

    // ===========================================
    // データ型定義・定数
    // ===========================================

    const STORAGE_KEYS = {
        ARTICLES: 'mysews_articles',
        RSS_FEEDS: 'mysews_rssFeeds', 
        AI_LEARNING: 'mysews_aiLearning',
        WORD_FILTERS: 'mysews_wordFilters'
    };

    const MAX_ARTICLES = 1000;
    const DATA_VERSION = '1.0';

    // デフォルトデータ
    const DEFAULT_DATA = {
        articles: [],
        rssFeeds: [
            {
                id: 'default-tech',
                url: 'https://example.com/tech.rss',
                title: 'Tech News',
                lastUpdated: new Date().toISOString()
            }
        ],
        aiLearning: {
            version: DATA_VERSION,
            wordWeights: {},
            categoryWeights: {
                'Technology': 0,
                'Development': 0,
                'Business': 0,
                'Science': 0
            },
            lastUpdated: new Date().toISOString()
        },
        wordFilters: {
            interestWords: ['AI', 'React', 'JavaScript'],
            ngWords: [],
            lastUpdated: new Date().toISOString()
        }
    };

    // ===========================================
    // ローカルストレージ管理システム
    // ===========================================

    const LocalStorageManager = {
        // データ保存（型安全）
        setItem: function(key, data) {
            try {
                const serializedData = JSON.stringify({
                    data: data,
                    timestamp: new Date().toISOString(),
                    version: DATA_VERSION
                });
                localStorage.setItem(key, serializedData);
                console.log('[Storage] Saved:', key, 'Size:', serializedData.length);
                return true;
            } catch (error) {
                console.error('[Storage] Save failed:', key, error);
                return false;
            }
        },

        // データ取得（型安全・エラーハンドリング）
        getItem: function(key, defaultValue) {
            try {
                const stored = localStorage.getItem(key);
                if (!stored) {
                    console.log('[Storage] No data found for:', key, 'Using default');
                    return defaultValue;
                }

                const parsed = JSON.parse(stored);
                
                // バージョンチェック
                if (parsed.version !== DATA_VERSION) {
                    console.warn('[Storage] Version mismatch:', key, 'Migrating data');
                    return this.migrateData(key, parsed, defaultValue);
                }

                console.log('[Storage] Loaded:', key, 'Timestamp:', parsed.timestamp);
                return parsed.data;
            } catch (error) {
                console.error('[Storage] Load failed:', key, error);
                return defaultValue;
            }
        },

        // データ削除
        removeItem: function(key) {
            try {
                localStorage.removeItem(key);
                console.log('[Storage] Removed:', key);
                return true;
            } catch (error) {
                console.error('[Storage] Remove failed:', key, error);
                return false;
            }
        },

        // データ移行処理
        migrateData: function(key, oldData, defaultValue) {
            // 将来的なデータ形式変更時の移行処理
            console.log('[Storage] Migrating data for:', key);
            
            // 現在はシンプルに新形式で保存し直す
            if (oldData.data) {
                this.setItem(key, oldData.data);
                return oldData.data;
            }
            
            return defaultValue;
        },

        // ストレージ容量チェック
        getStorageInfo: function() {
            let totalSize = 0;
            let itemCount = 0;
            
            for (let key in localStorage) {
                if (localStorage.hasOwnProperty(key) && key.startsWith('mysews_')) {
                    totalSize += localStorage[key].length;
                    itemCount++;
                }
            }
            
            return {
                totalSize: totalSize,
                itemCount: itemCount,
                available: 5000000 - totalSize // 5MB制限想定
            };
        }
    };

    // ===========================================
    // データ操作フック
    // ===========================================

    const DataHooks = {
        // 記事データ管理
        useArticles: function() {
            const articles = LocalStorageManager.getItem(STORAGE_KEYS.ARTICLES, DEFAULT_DATA.articles);
            
            return {
                articles: articles,
                
                // 記事追加
                addArticle: function(newArticle) {
                    const updatedArticles = [...articles];
                    
                    // 重複チェック
                    const exists = updatedArticles.find(article => article.id === newArticle.id || article.url === newArticle.url);
                    if (exists) {
                        console.warn('[Articles] Duplicate article:', newArticle.title);
                        return false;
                    }
                    
                    // 容量制限チェック
                    if (updatedArticles.length >= MAX_ARTICLES) {
                        // 古い記事を削除（既読かつ評価なしを優先）
                        updatedArticles.sort((a, b) => {
                            const aScore = (a.readStatus === 'read' && a.userRating === 0) ? 1 : 0;
                            const bScore = (b.readStatus === 'read' && b.userRating === 0) ? 1 : 0;
                            if (aScore !== bScore) return bScore - aScore;
                            return new Date(a.publishDate) - new Date(b.publishDate);
                        });
                        updatedArticles.pop();
                        console.log('[Articles] Removed old article for capacity');
                    }
                    
                    updatedArticles.unshift(newArticle);
                    LocalStorageManager.setItem(STORAGE_KEYS.ARTICLES, updatedArticles);
                    state.articles = updatedArticles;
                    return true;
                },
                
                // 記事更新
                updateArticle: function(articleId, updates) {
                    const updatedArticles = articles.map(article => 
                        article.id === articleId ? { ...article, ...updates } : article
                    );
                    LocalStorageManager.setItem(STORAGE_KEYS.ARTICLES, updatedArticles);
                    state.articles = updatedArticles;
                    render();
                },
                
                // 記事削除
                removeArticle: function(articleId) {
                    const updatedArticles = articles.filter(article => article.id !== articleId);
                    LocalStorageManager.setItem(STORAGE_KEYS.ARTICLES, updatedArticles);
                    state.articles = updatedArticles;
                    render();
                },
                
                // 記事一括操作
                bulkUpdateArticles: function(articleIds, updates) {
                    const updatedArticles = articles.map(article => 
                        articleIds.includes(article.id) ? { ...article, ...updates } : article
                    );
                    LocalStorageManager.setItem(STORAGE_KEYS.ARTICLES, updatedArticles);
                    state.articles = updatedArticles;
                    render();
                }
            };
        },

        // RSS管理
        useRSSManager: function() {
            const rssFeeds = LocalStorageManager.getItem(STORAGE_KEYS.RSS_FEEDS, DEFAULT_DATA.rssFeeds);
            
            return {
                rssFeeds: rssFeeds,
                
                addRSSFeed: function(url, title) {
                    const newFeed = {
                        id: 'rss_' + Date.now(),
                        url: url,
                        title: title || 'Unknown Feed',
                        lastUpdated: new Date().toISOString()
                    };
                    
                    const updatedFeeds = [...rssFeeds, newFeed];
                    LocalStorageManager.setItem(STORAGE_KEYS.RSS_FEEDS, updatedFeeds);
                    console.log('[RSS] Added feed:', title);
                    return newFeed;
                },
                
                removeRSSFeed: function(feedId) {
                    const updatedFeeds = rssFeeds.filter(feed => feed.id !== feedId);
                    LocalStorageManager.setItem(STORAGE_KEYS.RSS_FEEDS, updatedFeeds);
                    console.log('[RSS] Removed feed:', feedId);
                }
            };
        },

        // AI学習データ管理
        useAILearning: function() {
            const aiLearning = LocalStorageManager.getItem(STORAGE_KEYS.AI_LEARNING, DEFAULT_DATA.aiLearning);
            
            return {
                aiLearning: aiLearning,
                
                updateWordWeight: function(word, weight) {
                    const updatedLearning = {
                        ...aiLearning,
                        wordWeights: {
                            ...aiLearning.wordWeights,
                            [word]: (aiLearning.wordWeights[word] || 0) + weight
                        },
                        lastUpdated: new Date().toISOString()
                    };
                    LocalStorageManager.setItem(STORAGE_KEYS.AI_LEARNING, updatedLearning);
                    console.log('[AI] Updated word weight:', word, weight);
                },
                
                updateCategoryWeight: function(category, weight) {
                    const updatedLearning = {
                        ...aiLearning,
                        categoryWeights: {
                            ...aiLearning.categoryWeights,
                            [category]: (aiLearning.categoryWeights[category] || 0) + weight
                        },
                        lastUpdated: new Date().toISOString()
                    };
                    LocalStorageManager.setItem(STORAGE_KEYS.AI_LEARNING, updatedLearning);
                    console.log('[AI] Updated category weight:', category, weight);
                }
            };
        },

        // ワードフィルター管理
        useWordFilters: function() {
            const wordFilters = LocalStorageManager.getItem(STORAGE_KEYS.WORD_FILTERS, DEFAULT_DATA.wordFilters);
            
            return {
                wordFilters: wordFilters,
                
                addInterestWord: function(word) {
                    if (!wordFilters.interestWords.includes(word)) {
                        const updatedFilters = {
                            ...wordFilters,
                            interestWords: [...wordFilters.interestWords, word],
                            lastUpdated: new Date().toISOString()
                        };
                        LocalStorageManager.setItem(STORAGE_KEYS.WORD_FILTERS, updatedFilters);
                        console.log('[WordFilter] Added interest word:', word);
                    }
                },
                
                addNGWord: function(word) {
                    if (!wordFilters.ngWords.includes(word)) {
                        const updatedFilters = {
                            ...wordFilters,
                            ngWords: [...wordFilters.ngWords, word],
                            lastUpdated: new Date().toISOString()
                        };
                        LocalStorageManager.setItem(STORAGE_KEYS.WORD_FILTERS, updatedFilters);
                        console.log('[WordFilter] Added NG word:', word);
                    }
                }
            };
        }
    };

    // ===========================================
    // 既存のアプリケーション状態管理
    // ===========================================

    let state = {
        viewMode: 'all',
        showModal: null,
        articles: []
    };

    // State update function
    function setState(newState) {
        state = { ...state, ...newState };
        render();
    }

    // データ初期化
    function initializeData() {
        console.log('[App] Initializing data...');
        
        // 既存データを読み込み
        const articlesHook = DataHooks.useArticles();
        state.articles = articlesHook.articles;
        
        // サンプルデータがない場合のみ追加
        if (state.articles.length === 0) {
            console.log('[App] No existing articles, adding samples');
            
            const sampleArticles = [
                {
                    id: 'sample_1',
                    title: 'AIパーソナライズニュースリーダーの未来',
                    url: '#',
                    content: 'AI技術を活用したニュース配信の新しい形が注目されています。機械学習により、ユーザーの興味や読書履歴を分析し、最適な記事を推薦する技術が発達しています。',
                    publishDate: new Date().toISOString(),
                    rssSource: 'Tech News',
                    category: 'Technology',
                    readStatus: 'unread',
                    readLater: false,
                    userRating: 0,
                    keywords: ['AI', 'ニュース', '技術', '機械学習']
                },
                {
                    id: 'sample_2',
                    title: 'PWAアプリケーションの開発手法',
                    url: '#',
                    content: 'Progressive Web Appの効率的な開発方法について詳しく解説します。Service WorkerやWeb App Manifestの活用により、ネイティブアプリに近い体験を提供できます。',
                    publishDate: new Date(Date.now() - 86400000).toISOString(),
                    rssSource: 'Web Dev',
                    category: 'Development',
                    readStatus: 'read',
                    readLater: true,
                    userRating: 4,
                    keywords: ['PWA', '開発', 'Web', 'Service Worker']
                },
                {
                    id: 'sample_3',
                    title: 'localStorage活用によるオフラインデータ管理',
                    url: '#',
                    content: 'ブラウザのlocalStorageを効率的に活用し、オフライン環境でもデータを保持する方法を紹介します。型安全性とエラーハンドリングが重要なポイントです。',
                    publishDate: new Date(Date.now() - 172800000).toISOString(),
                    rssSource: 'Frontend Tips',
                    category: 'Development',
                    readStatus: 'unread',
                    readLater: false,
                    userRating: 0,
                    keywords: ['localStorage', 'オフライン', 'データ管理', 'JavaScript']
                }
            ];
            
            // サンプル記事を追加
            sampleArticles.forEach(article => {
                articlesHook.addArticle(article);
            });
            
            state.articles = LocalStorageManager.getItem(STORAGE_KEYS.ARTICLES, []);
        }
        
        // ストレージ情報をログ出力
        const storageInfo = LocalStorageManager.getStorageInfo();
        console.log('[App] Storage info:', storageInfo);
        
        console.log('[App] Data initialization complete. Articles:', state.articles.length);
    }

    // ===========================================
    // 既存のUtility functions（拡張）
    // ===========================================

    function formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = now - date;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            return '今日';
        } else if (diffDays === 1) {
            return '昨日';
        } else if (diffDays < 7) {
            return diffDays + '日前';
        } else {
            return date.toLocaleDateString('ja-JP');
        }
    }

    function createStarRating(rating, articleId) {
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            const filled = i <= rating ? 'filled' : '';
            stars += `<span class="star ${filled}" data-rating="${i}" data-article-id="${articleId}">★</span>`;
        }
        return `<div class="star-rating">${stars}</div>`;
    }

    // ===========================================
    // Event handlers（データ管理対応版）
    // ===========================================

    function handleFilterClick(mode) {
        setState({ viewMode: mode });
    }

    function handleModalOpen(modalType) {
        setState({ showModal: modalType });
    }

    function handleModalClose() {
        setState({ showModal: null });
    }

    function handleStarClick(event) {
        if (event.target.classList.contains('star')) {
            const rating = parseInt(event.target.dataset.rating);
            const articleId = event.target.dataset.articleId;
            
            // 記事評価を更新
            const articlesHook = DataHooks.useArticles();
            const aiHook = DataHooks.useAILearning();
            
            const article = state.articles.find(a => a.id === articleId);
            if (article) {
                // 記事の評価を更新
                articlesHook.updateArticle(articleId, { userRating: rating });
                
                // AI学習データを更新
                const weights = [0, -30, -15, 0, 15, 30]; // 1星=-30, 5星=+30
                const weight = weights[rating] || 0;
                
                // キーワード重み更新
                if (article.keywords) {
                    article.keywords.forEach(keyword => {
                        aiHook.updateWordWeight(keyword, weight);
                    });
                }
                
                // カテゴリ重み更新
                if (article.category) {
                    aiHook.updateCategoryWeight(article.category, weight);
                }
                
                console.log(`[Rating] Article "${article.title}" rated ${rating} stars`);
            }
        }
    }

    function handleReadStatusToggle(articleId) {
        const articlesHook = DataHooks.useArticles();
        const article = state.articles.find(a => a.id === articleId);
        
        if (article) {
            const newStatus = article.readStatus === 'read' ? 'unread' : 'read';
            articlesHook.updateArticle(articleId, { readStatus: newStatus });
            console.log(`[ReadStatus] Article "${article.title}" marked as ${newStatus}`);
        }
    }

    function handleReadLaterToggle(articleId) {
        const articlesHook = DataHooks.useArticles();
        const article = state.articles.find(a => a.id === articleId);
        
        if (article) {
            const newReadLater = !article.readLater;
            articlesHook.updateArticle(articleId, { readLater: newReadLater });
            console.log(`[ReadLater] Article "${article.title}" read later: ${newReadLater}`);
        }
    }

    function handleRefresh() {
        console.log('[App] Refreshing data...');
        
        // データ整合性チェック
        const storageInfo = LocalStorageManager.getStorageInfo();
        console.log('[Refresh] Current storage:', storageInfo);
        
        // 今後はRSS取得処理を追加予定
        alert('記事更新機能は第3段階で実装されます');
    }

    // ===========================================
    // 既存のフィルタリング・レンダリング関数
    // ===========================================

    function getFilteredArticles() {
        switch (state.viewMode) {
            case 'unread':
                return state.articles.filter(article => article.readStatus === 'unread');
            case 'read':
                return state.articles.filter(article => article.readStatus === 'read');
            case 'readLater':
                return state.articles.filter(article => article.readLater);
            default:
                return state.articles;
        }
    }

    function renderNavigation() {
        const modes = [
            { key: 'all', label: 'すべて' },
            { key: 'unread', label: '未読' },
            { key: 'read', label: '既読' },
            { key: 'readLater', label: '後で読む' }
        ];

        const filterButtons = modes.map(mode => {
            const count = getFilteredArticleCount(mode.key);
            const active = state.viewMode === mode.key ? 'active' : '';
            return `<button class="filter-btn ${active}" data-mode="${mode.key}">${mode.label} (${count})</button>`;
        }).join('');

        return `
            <nav class="nav">
                <h1>Mysews</h1>
                <div class="nav-filters">
                    ${filterButtons}
                </div>
                <div class="nav-actions">
                    <button class="action-btn" data-modal="rss">RSS管理</button>
                    <button class="action-btn" data-modal="words">ワード管理</button>
                    <button class="action-btn" data-action="refresh">更新</button>
                    <button class="action-btn" data-action="storage">データ</button>
                </div>
            </nav>
        `;
    }

    function getFilteredArticleCount(mode) {
        switch (mode) {
            case 'unread':
                return state.articles.filter(article => article.readStatus === 'unread').length;
            case 'read':
                return state.articles.filter(article => article.readStatus === 'read').length;
            case 'readLater':
                return state.articles.filter(article => article.readLater).length;
            default:
                return state.articles.length;
        }
    }

    function renderArticleCard(article) {
        const readStatusLabel = article.readStatus === 'read' ? '未読にする' : '既読にする';
        const readLaterLabel = article.readLater ? '後で読む解除' : '後で読む';

        return `
            <div class="article-card" data-read-status="${article.readStatus}">
                <div class="article-header">
                    <h3 class="article-title">
                        <a href="${article.url}" target="_blank" data-article-id="${article.id}">${article.title}</a>
                    </h3>
                </div>
                <div class="article-meta">
                    <span class="date">${formatDate(article.publishDate)}</span>
                    <span class="source">${article.rssSource}</span>
                    <span class="category">${article.category}</span>
                    ${article.userRating > 0 ? `<span class="rating-badge">★${article.userRating}</span>` : ''}
                </div>
                <div class="article-content">
                    ${article.content}
                </div>
                <div class="article-keywords">
                    ${article.keywords ? article.keywords.map(keyword => `<span class="keyword">${keyword}</span>`).join('') : ''}
                </div>
                <div class="article-actions">
                    <button class="action-btn read-status" data-article-id="${article.id}">${readStatusLabel}</button>
                    <button class="action-btn read-later" data-article-id="${article.id}">${readLaterLabel}</button>
                </div>
                ${createStarRating(article.userRating, article.id)}
            </div>
        `;
    }

    function renderArticleGrid() {
        const filteredArticles = getFilteredArticles();
        if (filteredArticles.length === 0) {
            return '<div class="empty-message">該当する記事がありません</div>';
        }

        // AIスコアベースのソート（今後実装予定）
        const sortedArticles = [...filteredArticles].sort((a, b) => {
            // 暫定：評価済み記事を上位に、その後日付順
            if (a.userRating !== b.userRating) {
                return b.userRating - a.userRating;
            }
            return new Date(b.publishDate) - new Date(a.publishDate);
        });

        return `
            <div class="article-grid">
                ${sortedArticles.map(renderArticleCard).join('')}
            </div>
        `;
    }

    function renderModal() {
        if (!state.showModal) return '';

        let modalContent = '';
        
        if (state.showModal === 'rss') {
            const rssHook = DataHooks.useRSSManager();
            modalContent = `
                <div class="modal-header">
                    <h2>RSS管理</h2>
                    <button class="modal-close">×</button>
                </div>
                <div class="modal-body">
                    <div class="rss-list">
                        <h3>登録済みRSSフィード</h3>
                        ${rssHook.rssFeeds.map(feed => `
                            <div class="rss-item">
                                <strong>${feed.title}</strong><br>
                                <small>${feed.url}</small><br>
                                <small>更新: ${formatDate(feed.lastUpdated)}</small>
                            </div>
                        `).join('')}
                    </div>
                    <p><em>RSS追加・削除機能は第3段階で実装されます</em></p>
                </div>
            `;
        } else if (state.showModal === 'words') {
            const wordHook = DataHooks.useWordFilters();
            modalContent = `
                <div class="modal-header">
                    <h2>ワード管理</h2>
                    <button class="modal-close">×</button>
                </div>
                <div class="modal-body">
                    <div class="word-filters">
                        <h3>気になるワード</h3>
                        <div class="word-list">
                            ${wordHook.wordFilters.interestWords.map(word => `<span class="word-tag interest">${word}</span>`).join('')}
                        </div>
                        
                        <h3>NGワード</h3>
                        <div class="word-list">
                            ${wordHook.wordFilters.ngWords.map(word => `<span class="word-tag ng">${word}</span>`).join('')}
                        </div>
                    </div>
                    <p><em>ワード追加・削除機能は第3段階で実装されます</em></p>
                </div>
            `;
        } else if (state.showModal === 'storage') {
            const storageInfo = LocalStorageManager.getStorageInfo();
            const aiLearning = LocalStorageManager.getItem(STORAGE_KEYS.AI_LEARNING, DEFAULT_DATA.aiLearning);
            
            modalContent = `
                <div class="modal-header">
                    <h2>データ管理</h2>
                    <button class="modal-close">×</button>
                </div>
                <div class="modal-body">
                    <div class="storage-info">
                        <h3>ストレージ使用状況</h3>
                        <p>使用容量: ${(storageInfo.totalSize / 1024).toFixed(1)} KB</p>
                        <p>保存項目数: ${storageInfo.itemCount}</p>
                        <p>記事数: ${state.articles.length} / ${MAX_ARTICLES}</p>
                        
                        <h3>AI学習データ</h3>
                        <p>単語重み学習数: ${Object.keys(aiLearning.wordWeights).length}</p>
                        <p>カテゴリ重み学習数: ${Object.keys(aiLearning.categoryWeights).length}</p>
                        <p>最終更新: ${formatDate(aiLearning.lastUpdated)}</p>
                    </div>
                </div>
            `;
        }

        return `
            <div class="modal-overlay">
                <div class="modal">
                    ${modalContent}
                </div>
            </div>
        `;
    }

    function render() {
        const app = document.getElementById('root');
        app.innerHTML = `
            <div class="app">
                ${renderNavigation()}
                <main class="main-content">
                    ${renderArticleGrid()}
                </main>
                ${renderModal()}
            </div>
        `;

        // Add event listeners
        addEventListeners();
    }

    function addEventListeners() {
        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                handleFilterClick(e.target.dataset.mode);
            });
        });

        // Action buttons
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.dataset.modal;
                const action = e.target.dataset.action;
                
                if (modal) {
                    handleModalOpen(modal);
                } else if (action === 'refresh') {
                    handleRefresh();
                } else if (action === 'storage') {
                    handleModalOpen('storage');
                }
            });
        });

        // Modal close
        const closeBtn = document.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', handleModalClose);
        }

        // Modal overlay close
        const overlay = document.querySelector('.modal-overlay');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    handleModalClose();
                }
            });
        }

        // Star rating
        document.querySelectorAll('.star-rating').forEach(rating => {
            rating.addEventListener('click', handleStarClick);
        });

        // Read status toggle
        document.querySelectorAll('.read-status').forEach(btn => {
            btn.addEventListener('click', (e) => {
                handleReadStatusToggle(e.target.dataset.articleId);
            });
        });

        // Read later toggle
        document.querySelectorAll('.read-later').forEach(btn => {
            btn.addEventListener('click', (e) => {
                handleReadLaterToggle(e.target.dataset.articleId);
            });
        });

        // Article title links
        document.querySelectorAll('.article-title a').forEach(link => {
            link.addEventListener('click', (e) => {
                const articleId = e.target.dataset.articleId;
                if (articleId) {
                    setTimeout(() => handleReadStatusToggle(articleId), 100);
                }
            });
        });
    }

    // Initialize app
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[App] Starting Mysews PWA - Stage 2: Data Management');
        initializeData();
        render();
    });

})();
