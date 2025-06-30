// RSSリーダーアプリケーション
class RSSReader {
    constructor() {
        this.feeds = [];
        this.currentFeedIndex = 0;
        this.articles = [];
        this.readArticles = new Set();
        this.maxRetries = 3;
        this.retryDelay = 500;
        
        this.init();
    }

    // 初期化
    init() {
        this.loadFeeds();
        this.loadReadArticles();
        this.loadDarkMode();
        this.bindEvents();
        this.renderTabs();
        
        // 初期フィードがある場合は読み込み
        if (this.feeds.length > 0) {
            this.loadCurrentFeed();
        }
    }

    // イベントバインド
    bindEvents() {
        // RSS追加ボタン
        document.getElementById('addRssBtn').addEventListener('click', () => {
            this.toggleRssForm();
        });

        // RSS追加フォーム
        document.getElementById('addFeedBtn').addEventListener('click', () => {
            this.addFeed();
        });

        document.getElementById('cancelBtn').addEventListener('click', () => {
            this.toggleRssForm();
        });

        // ダークモード切り替え
        document.getElementById('darkModeToggle').addEventListener('click', () => {
            this.toggleDarkMode();
        });

        // 再試行ボタン
        document.getElementById('retryBtn').addEventListener('click', () => {
            this.loadCurrentFeed();
        });
    }

    // ローカルストレージからフィード読み込み
    loadFeeds() {
        const savedFeeds = localStorage.getItem('rssFeeds');
        if (savedFeeds) {
            try {
                this.feeds = JSON.parse(savedFeeds);
            } catch (e) {
                console.error('フィード読み込みエラー:', e);
                this.feeds = [];
            }
        }
    }

    // フィードをローカルストレージに保存
    saveFeeds() {
        localStorage.setItem('rssFeeds', JSON.stringify(this.feeds));
    }

    // 既読記事読み込み
    loadReadArticles() {
        const savedReadArticles = localStorage.getItem('readArticles');
        if (savedReadArticles) {
            try {
                this.readArticles = new Set(JSON.parse(savedReadArticles));
            } catch (e) {
                console.error('既読記事読み込みエラー:', e);
                this.readArticles = new Set();
            }
        }
    }

    // 既読記事保存
    saveReadArticles() {
        localStorage.setItem('readArticles', JSON.stringify([...this.readArticles]));
    }

    // ダークモード読み込み
    loadDarkMode() {
        const darkMode = localStorage.getItem('darkMode');
        if (darkMode === 'true') {
            document.body.classList.add('dark-mode');
            document.getElementById('darkModeToggle').querySelector('.icon').textContent = '☀️';
        }
    }

    // ダークモード切り替え
    toggleDarkMode() {
        document.body.classList.toggle('dark-mode');
        const isDarkMode = document.body.classList.contains('dark-mode');
        localStorage.setItem('darkMode', isDarkMode);
        
        const icon = document.getElementById('darkModeToggle').querySelector('.icon');
        icon.textContent = isDarkMode ? '☀️' : '🌙';
    }

    // RSS追加フォーム表示切り替え
    toggleRssForm() {
        const form = document.getElementById('rssForm');
        form.classList.toggle('hidden');
        
        if (!form.classList.contains('hidden')) {
            document.getElementById('rssName').focus();
        } else {
            // フォームをクリア
            document.getElementById('rssName').value = '';
            document.getElementById('rssUrl').value = '';
        }
    }

    // フィード追加
    async addFeed() {
        const name = document.getElementById('rssName').value.trim();
        const url = document.getElementById('rssUrl').value.trim();

        if (!name || !url) {
            alert('フィード名とURLを入力してください');
            return;
        }

        // URL検証
        try {
            new URL(url);
        } catch (e) {
            alert('有効なURLを入力してください');
            return;
        }

        // 重複チェック
        if (this.feeds.some(feed => feed.url === url)) {
            alert('このフィードは既に追加されています');
            return;
        }

        const feed = { name, url };
        this.feeds.push(feed);
        this.saveFeeds();
        this.renderTabs();
        this.toggleRssForm();

        // 新しいフィードを読み込み
        this.currentFeedIndex = this.feeds.length - 1;
        this.loadCurrentFeed();
    }

    // タブ描画
    renderTabs() {
        const tabContainer = document.getElementById('rssTabs');
        tabContainer.innerHTML = '';

        this.feeds.forEach((feed, index) => {
            const tab = document.createElement('div');
            tab.className = `rss-tab ${index === this.currentFeedIndex ? 'active' : ''}`;
            tab.innerHTML = `
                <span>${feed.name}</span>
                <button class="tab-delete" data-index="${index}">×</button>
            `;
            
            // タブクリックイベント
            tab.addEventListener('click', (e) => {
                if (!e.target.classList.contains('tab-delete')) {
                    this.currentFeedIndex = index;
                    this.renderTabs();
                    this.loadCurrentFeed();
                }
            });

            // 削除ボタンイベント
            tab.querySelector('.tab-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteFeed(index);
            });

            tabContainer.appendChild(tab);
        });
    }

    // フィード削除
    deleteFeed(index) {
        if (confirm('このフィードを削除しますか？')) {
            this.feeds.splice(index, 1);
            this.saveFeeds();
            
            // 現在のインデックス調整
            if (this.currentFeedIndex >= this.feeds.length) {
                this.currentFeedIndex = Math.max(0, this.feeds.length - 1);
            }
            
            this.renderTabs();
            
            if (this.feeds.length > 0) {
                this.loadCurrentFeed();
            } else {
                this.articles = [];
                this.renderArticles();
            }
        }
    }

    // 現在のフィード読み込み
    async loadCurrentFeed() {
        if (this.feeds.length === 0) return;

        const feed = this.feeds[this.currentFeedIndex];
        this.showLoading();
        this.hideError();

        try {
            const articles = await this.fetchRSSWithRetry(feed.url);
            this.articles = articles.map(article => ({
                ...article,
                feedName: feed.name,
                id: this.generateArticleId(article)
            }));
            this.renderArticles();
        } catch (error) {
            console.error('フィード読み込みエラー:', error);
            this.showError('フィードの読み込みに失敗しました: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    // RSS取得（リトライ機能付き）
    async fetchRSSWithRetry(url, retryCount = 0) {
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        
        try {
            const response = await fetch(proxyUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                timeout: 10000
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (!data.contents) {
                throw new Error('フィードデータが見つかりません');
            }

            return this.parseRSS(data.contents);
            
        } catch (error) {
            console.error(`フィード取得エラー (試行 ${retryCount + 1}):`, error);
            
            if (retryCount < this.maxRetries) {
                const delay = this.retryDelay * Math.pow(2, retryCount);
                console.log(`${delay}ms後に再試行します...`);
                
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.fetchRSSWithRetry(url, retryCount + 1);
            }
            
            throw new Error(`${this.maxRetries + 1}回の試行後も失敗: ${error.message}`);
        }
    }

    // RSS解析
    parseRSS(xmlString) {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
            
            // パースエラーチェック
            const parserError = xmlDoc.querySelector('parsererror');
            if (parserError) {
                throw new Error('XML解析エラー: ' + parserError.textContent);
            }

            const items = xmlDoc.querySelectorAll('item, entry');
            const articles = [];

            for (let i = 0; i < Math.min(items.length, 5); i++) {
                const item = items[i];
                const article = this.parseArticleItem(item);
                if (article) {
                    articles.push(article);
                }
            }

            // 日付順でソート（新しい順）
            articles.sort((a, b) => new Date(b.publishedDate) - new Date(a.publishedDate));
            
            return articles;
            
        } catch (error) {
            console.error('RSS解析エラー:', error);
            throw new Error('RSSフィードの解析に失敗しました');
        }
    }

    // 記事アイテム解析
    parseArticleItem(item) {
        try {
            const title = this.getTextContent(item, 'title') || 'タイトル不明';
            const link = this.getTextContent(item, 'link, guid') || '#';
            const description = this.getTextContent(item, 'description, summary, content') || '';
            const publishedDate = this.getTextContent(item, 'pubDate, published, updated') || new Date().toISOString();
            
            // サムネイル画像の取得
            let thumbnail = '';
            const mediaContent = item.querySelector('media\\:content, content');
            const enclosure = item.querySelector('enclosure[type^="image"]');
            const imgRegex = /<img[^>]+src="([^">]+)"/;
            const imgMatch = description.match(imgRegex);

            if (mediaContent && mediaContent.getAttribute('url')) {
                thumbnail = mediaContent.getAttribute('url');
            } else if (enclosure && enclosure.getAttribute('url')) {
                thumbnail = enclosure.getAttribute('url');
            } else if (imgMatch) {
                thumbnail = imgMatch[1];
            }

            // 説明文からHTMLタグを除去してサマリーを作成
            const summary = this.createSummary(description);

            return {
                title,
                link,
                summary,
                publishedDate,
                thumbnail
            };
        } catch (error) {
            console.error('記事解析エラー:', error);
            return null;
        }
    }

    // テキストコンテンツ取得
    getTextContent(element, selectors) {
        const selectorList = selectors.split(',').map(s => s.trim());
        for (const selector of selectorList) {
            const found = element.querySelector(selector);
            if (found) {
                return found.textContent.trim();
            }
        }
        return '';
    }

    // サマリー作成
    createSummary(description, maxLength = 120) {
        // HTMLタグ除去
        const text = description.replace(/<[^>]*>/g, '').trim();
        
        if (text.length <= maxLength) {
            return text;
        }
        
        return text.substring(0, maxLength) + '...';
    }

    // 記事ID生成
    generateArticleId(article) {
        return btoa(unescape(encodeURIComponent(article.title + article.link))).replace(/[^a-zA-Z0-9]/g, '');
    }

    // 記事一覧描画
    renderArticles() {
        const articleList = document.getElementById('articleList');
        
        if (this.articles.length === 0) {
            articleList.innerHTML = '<div class="text-center"><p>記事がありません</p></div>';
            return;
        }

        articleList.innerHTML = this.articles.map(article => {
            const isRead = this.readArticles.has(article.id);
            const publishedDate = new Date(article.publishedDate).toLocaleDateString('ja-JP');
            
            return `
                <article class="article-card ${isRead ? 'read' : ''}">
                    ${article.thumbnail ? 
                        `<img src="${article.thumbnail}" alt="${article.title}" class="article-thumbnail" onerror="this.style.display='none'">` : 
                        '<div class="article-thumbnail" style="background: linear-gradient(45deg, var(--secondary-color), var(--primary-color)); display: flex; align-items: center; justify-content: center; color: var(--accent-color); font-size: 2rem;">📰</div>'
                    }
                    <div class="article-content">
                        <h3 class="article-title">${article.title}</h3>
                        <p class="article-summary">${article.summary}</p>
                        <div class="article-meta">
                            <span class="article-date">${publishedDate}</span>
                            <span class="article-feed">${article.feedName}</span>
                        </div>
                        <div class="article-actions">
                            <button class="read-btn ${isRead ? 'marked' : ''}" onclick="rssReader.toggleReadStatus('${article.id}')">
                                ${isRead ? '既読' : '未読'}
                            </button>
                            <a href="${article.link}" target="_blank" class="btn btn-primary" style="text-decoration: none; font-size: 0.9rem; padding: 0.5rem 1rem;">
                                記事を読む
                            </a>
                        </div>
                    </div>
                </article>
            `;
        }).join('');
    }

    // 既読状態切り替え
    toggleReadStatus(articleId) {
        if (this.readArticles.has(articleId)) {
            this.readArticles.delete(articleId);
        } else {
            this.readArticles.add(articleId);
        }
        
        this.saveReadArticles();
        this.renderArticles();
    }

    // ローディング表示
    showLoading() {
        document.getElementById('loading').classList.remove('hidden');
    }

    // ローディング非表示
    hideLoading() {
        document.getElementById('loading').classList.add('hidden');
    }

    // エラー表示
    showError(message) {
        document.getElementById('errorText').textContent = message;
        document.getElementById('errorMessage').classList.remove('hidden');
    }

    // エラー非表示
    hideError() {
        document.getElementById('errorMessage').classList.add('hidden');
    }
}

// アプリケーション開始
let rssReader;
document.addEventListener('DOMContentLoaded', () => {
    rssReader = new RSSReader();
});
