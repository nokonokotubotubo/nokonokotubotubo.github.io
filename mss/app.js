// Mysews PWA - 第1段階：基盤実装
(function() {
    'use strict';

    // React-like state management
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

    // Sample data for demonstration
    const sampleArticles = [
        {
            id: '1',
            title: 'AIパーソナライズニュースリーダーの未来',
            url: '#',
            content: 'AI技術を活用したニュース配信の新しい形...',
            publishDate: new Date().toISOString(),
            rssSource: 'Tech News',
            category: 'Technology',
            readStatus: 'unread',
            readLater: false,
            userRating: 0,
            keywords: ['AI', 'ニュース', '技術']
        },
        {
            id: '2',
            title: 'PWAアプリケーションの開発手法',
            url: '#',
            content: 'Progressive Web Appの効率的な開発方法について...',
            publishDate: new Date(Date.now() - 86400000).toISOString(),
            rssSource: 'Web Dev',
            category: 'Development',
            readStatus: 'read',
            readLater: true,
            userRating: 4,
            keywords: ['PWA', '開発', 'Web']
        }
    ];

    // Initialize articles
    state.articles = sampleArticles;

    // Utility functions
    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('ja-JP');
    }

    function createStarRating(rating, articleId) {
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            const filled = i <= rating ? 'filled' : '';
            stars += `<span class="star ${filled}" data-rating="${i}" data-article-id="${articleId}">★</span>`;
        }
        return `<div class="star-rating">${stars}</div>`;
    }

    // Event handlers
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
            console.log(`Rating ${rating} for article ${articleId}`);
            // Update article rating logic would go here
        }
    }

    function handleReadStatusToggle(articleId) {
        const articles = state.articles.map(article => {
            if (article.id === articleId) {
                return {
                    ...article,
                    readStatus: article.readStatus === 'read' ? 'unread' : 'read'
                };
            }
            return article;
        });
        setState({ articles });
    }

    function handleReadLaterToggle(articleId) {
        const articles = state.articles.map(article => {
            if (article.id === articleId) {
                return {
                    ...article,
                    readLater: !article.readLater
                };
            }
            return article;
        });
        setState({ articles });
    }

    // Filter articles based on view mode
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

    // Render functions
    function renderNavigation() {
        const modes = [
            { key: 'all', label: 'すべて' },
            { key: 'unread', label: '未読' },
            { key: 'read', label: '既読' },
            { key: 'readLater', label: '後で読む' }
        ];

        const filterButtons = modes.map(mode => {
            const active = state.viewMode === mode.key ? 'active' : '';
            return `<button class="filter-btn ${active}" data-mode="${mode.key}">${mode.label}</button>`;
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
                </div>
            </nav>
        `;
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
                </div>
                <div class="article-content">
                    ${article.content}
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

        return `
            <div class="article-grid">
                ${filteredArticles.map(renderArticleCard).join('')}
            </div>
        `;
    }

    function renderModal() {
        if (!state.showModal) return '';

        let modalContent = '';
        if (state.showModal === 'rss') {
            modalContent = `
                <div class="modal-header">
                    <h2>RSS管理</h2>
                    <button class="modal-close">×</button>
                </div>
                <div class="modal-body">
                    <p>RSS管理機能は第3段階で実装されます</p>
                </div>
            `;
        } else if (state.showModal === 'words') {
            modalContent = `
                <div class="modal-header">
                    <h2>ワード管理</h2>
                    <button class="modal-close">×</button>
                </div>
                <div class="modal-body">
                    <p>ワード管理機能は第3段階で実装されます</p>
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
                    console.log('記事を更新しています...');
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
                // Mark as read when clicked
                const articleId = e.target.dataset.articleId;
                setTimeout(() => handleReadStatusToggle(articleId), 100);
            });
        });
    }

    // Initialize app
    document.addEventListener('DOMContentLoaded', () => {
        render();
    });

})();
