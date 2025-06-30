// script.js (GitHub Actions API対応版)
class GitHubActionsRSSReader {
    constructor() {
        this.feeds = [];
        this.currentFeedIndex = 0;
        this.articles = [];
        this.readArticles = new Set();
        
        // GitHub PagesのベースURL自動判定
        this.baseUrl = this.getBaseUrl();
        
        // 自動更新間隔（5分ごとにチェック）
        this.autoUpdateInterval = 5 * 60 * 1000;
        this.lastUpdateCheck = 0;
        
        this.init();
    }

    // ベースURL自動判定
    getBaseUrl() {
        if (window.location.hostname.includes('github.io')) {
            return window.location.origin + window.location.pathname.replace(/\/$/, '');
        }
        return window.location.origin;
    }

    // 初期化
    async init() {
        this.loadReadArticles();
        this.loadDarkMode();
        this.bindEvents();
        
        // GitHub Actionsで生成されたフィードメタデータを読み込み
        await this.loadFeedMetadata();
        this.renderTabs();
        
        if (this.feeds.length > 0) {
            await this.loadCurrentFeed();
        }
        
        // 統計情報を更新
        this.updateStats();
        
        // 自動更新を開始
        this.startAutoUpdate();
        
        this.hideLoading();
    }

    // イベントバインド
    bindEvents() {
        // ダークモード切り替え
        document.getElementById('darkModeToggle').addEventListener('click', () => {
            this.toggleDarkMode();
        });

        // 手動更新ボタン
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.forceUpdate();
        });

        // 再試行ボタン
        document.getElementById('retryBtn').addEventListener('click', () => {
            this.loadCurrentFeed();
        });
    }

    // フィードメタデータ読み込み
    async loadFeedMetadata() {
        try {
            console.log('📊 フィードメタデータを読み込み中...');
            
            const response = await fetch(`${this.baseUrl}/data/feeds-meta.json?t=${Date.now()}`);
            
            if (!response.ok) {
                throw new Error(`メタデータ取得エラー: ${response.status}`);
            }
            
            const metadata = await response.json();
            this.feeds = metadata.feeds;
            this.lastServerUpdate = metadata.lastUpdated;
            
            // 更新時刻を表示
            this.updateTimestamp(this.lastServerUpdate);
            
            console.log(`✅ ${this.feeds.length}個のフィードを読み込み完了`);
            
        } catch (error) {
            console.error('メタデータ読み込みエラー:', error);
            this.feeds = []; // フォールバック用空配列
            this.showError(`フィード設定の読み込みに失敗しました: ${error.message}`);
        }
    }

    // 現在のフィード読み込み
    async loadCurrentFeed() {
        if (this.feeds.length === 0) {
            this.showError('読み込み可能なフィードがありません');
            return;
        }

        const feed = this.feeds[this.currentFeedIndex];
        this.showLoading();
        this.hideError();

        try {
            console.log(`📡 ${feed.name} を読み込み中...`);
            
            // キャッシュバスターを追加
            const response = await fetch(`${this.baseUrl}/data/${feed.file}?t=${Date.now()}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${feed.name}のデータが見つかりません`);
            }
            
            const data = await response.json();
            
            // データ形式の検証
            if (!data.entries || !Array.isArray(data.entries)) {
                throw new Error(`${feed.name}: 無効なデータ形式`);
            }
            
            // 記事データの変換
            this.articles = data.entries.map(entry => ({
                title: entry.title || 'タイトル不明',
                link: entry.link || '#',
                summary: this.createSummary(entry.description || entry.summary || ''),
                publishedDate: entry.published || entry.pubDate || new Date().toISOString(),
                thumbnail: this.extractThumbnail(entry),
                feedName: feed.name,
                feedColor: feed.color,
                id: this.generateArticleId(entry)
            }));
            
            // 日付順ソート
            this.articles.sort((a, b) => new Date(b.publishedDate) - new Date(a.publishedDate));
            
            this.renderArticles();
            this.updateStats();
            
            console.log(`✅ ${feed.name}: ${this.articles.length}件読み込み完了`);
            
        } catch (error) {
            console.error(`${feed.name} 読み込みエラー:`, error);
            this.showError(`${feed.name}の読み込みに失敗しました: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    // サムネイル抽出
    extractThumbnail(entry) {
        // RSS Feed Fetch Actionが提供する形式に対応
        if (entry.media && entry.media.thumbnail) {
            return entry.media.thumbnail.url;
        }
        
        if (entry.enclosures && entry.enclosures.length > 0) {
            const imageEnclosure = entry.enclosures.find(enc => 
                enc.type && enc.type.startsWith('image/'));
            if (imageEnclosure) {
                return imageEnclosure.url;
            }
        }
        
        // description内の画像検索
        const description = entry.description || entry.summary || '';
        const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
        if (imgMatch) {
            return imgMatch[1];
        }
        
        return '';
    }

    // サマリー作成
    createSummary(description, maxLength = 120) {
        if (!description) return '説明がありません';
        
        // HTMLタグを除去
        let text = description
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/\s+/g, ' ')
            .trim();
        
        if (text.length <= maxLength) {
            return text;
        }
        
        return text.substring(0, maxLength) + '...';
    }

    // 記事ID生成
    generateArticleId(entry) {
        const source = (entry.title || '') + (entry.link || '') + (entry.published || '');
        return btoa(unescape(encodeURIComponent(source))).replace(/[^a-zA-Z0-9]/g, '');
    }

    // タブ描画
    renderTabs() {
        const tabContainer = document.getElementById('rssTabs');
        tabContainer.innerHTML = '';

        // 全フィード表示タブ
        const allTab = document.createElement('div');
        allTab.className = `rss-tab ${this.currentFeedIndex === -1 ? 'active' : ''}`;
        allTab.innerHTML = `
            <span class="tab-icon">📰</span>
            <span>すべて</span>
        `;
        allTab.addEventListener('click', () => {
            this.currentFeedIndex = -1;
            this.renderTabs();
            this.loadAllFeeds();
        });
        tabContainer.appendChild(allTab);

        // 個別フィードタブ
        this.feeds.forEach((feed, index) => {
            const tab = document.createElement('div');
            tab.className = `rss-tab ${index === this.currentFeedIndex ? 'active' : ''}`;
            tab.style.borderColor = feed.color;
            tab.innerHTML = `
                <span class="tab-color" style="background-color: ${feed.color}"></span>
                <span>${feed.name}</span>
            `;
            
            tab.addEventListener('click', () => {
                this.currentFeedIndex = index;
                this.renderTabs();
                this.loadCurrentFeed();
            });

            tabContainer.appendChild(tab);
        });
    }

    // 全フィード読み込み
    async loadAllFeeds() {
        this.showLoading();
        this.hideError();
        
        try {
            console.log('📚 全フィードを読み込み中...');
            
            const allArticles = [];
            
            for (const feed of this.feeds) {
                try {
                    const response = await fetch(`${this.baseUrl}/data/${feed.file}?t=${Date.now()}`);
                    if (response.ok) {
                        const data = await response.json();
                        const articles = data.entries.map(entry => ({
                            title: entry.title || 'タイトル不明',
                            link: entry.link || '#',
                            summary: this.createSummary(entry.description || entry.summary || ''),
                            publishedDate: entry.published || entry.pubDate || new Date().toISOString(),
                            thumbnail: this.extractThumbnail(entry),
                            feedName: feed.name,
                            feedColor: feed.color,
                            id: this.generateArticleId(entry)
                        }));
                        
                        allArticles.push(...articles);
                    }
                } catch (error) {
                    console.warn(`${feed.name}の読み込みをスキップ:`, error.message);
                }
            }
            
            // 日付順ソート
            this.articles = allArticles.sort((a, b) => 
                new Date(b.publishedDate) - new Date(a.publishedDate));
            
            this.renderArticles();
            this.updateStats();
            
            console.log(`✅ 全フィード読み込み完了: ${this.articles.length}件`);
            
        } catch (error) {
            console.error('全フィード読み込みエラー:', error);
            this.showError(`全フィードの読み込みに失敗しました: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    // 記事描画（改良版）
    renderArticles() {
        const articleList = document.getElementById('articleList');
        
        if (this.articles.length === 0) {
            articleList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <h3>記事がありません</h3>
                    <p>フィードの更新をお待ちください</p>
                </div>
            `;
            return;
        }

        articleList.innerHTML = this.articles.map(article => {
            const isRead = this.readArticles.has(article.id);
            const publishedDate = new Date(article.publishedDate).toLocaleDateString('ja-JP', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            return `
                <article class="article-card ${isRead ? 'read' : ''}" data-feed-color="${article.feedColor}">
                    ${article.thumbnail ? 
                        `<img src="${article.thumbnail}" alt="${article.title}" class="article-thumbnail" 
                             onerror="this.style.display='none'" loading="lazy">` : 
                        `<div class="article-thumbnail placeholder" style="background: linear-gradient(135deg, ${article.feedColor}20, ${article.feedColor}40);">
                            <span style="color: ${article.feedColor}; font-size: 2rem;">📰</span>
                         </div>`
                    }
                    <div class="article-content">
                        <div class="article-header">
                            <span class="feed-badge" style="background-color: ${article.feedColor}">
                                ${article.feedName}
                            </span>
                            <span class="article-date">${publishedDate}</span>
                        </div>
                        <h3 class="article-title">${article.title}</h3>
                        <p class="article-summary">${article.summary}</p>
                        <div class="article-actions">
                            <button class="read-btn ${isRead ? 'marked' : ''}" 
                                    onclick="rssReader.toggleReadStatus('${article.id}')">
                                ${isRead ? '✓ 既読' : '○ 未読'}
                            </button>
                            <a href="${article.link}" target="_blank" rel="noopener" class="read-more-btn">
                                記事を読む →
                            </a>
                        </div>
                    </div>
                </article>
            `;
        }).join('');
    }

    // 統計情報更新
    updateStats() {
        const totalArticles = this.articles.length;
        const totalFeeds = this.feeds.length;
        const unreadArticles = this.articles.filter(article => 
            !this.readArticles.has(article.id)).length;

        document.getElementById('totalArticles').textContent = totalArticles;
        document.getElementById('totalFeeds').textContent = totalFeeds;
        document.getElementById('unreadArticles').textContent = unreadArticles;
        
        document.getElementById('feedStats').classList.remove('hidden');
    }

    // 更新時刻表示
    updateTimestamp(timestamp) {
        if (!timestamp) return;
        
        const date = new Date(timestamp);
        const formattedTime = date.toLocaleString('ja-JP', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        document.getElementById('updateTime').textContent = `${formattedTime} 更新`;
        document.getElementById('footerUpdateTime').textContent = formattedTime;
    }

    // 自動更新開始
    startAutoUpdate() {
        setInterval(async () => {
            const now = Date.now();
            if (now - this.lastUpdateCheck > this.autoUpdateInterval) {
                console.log('🔄 定期更新チェック実行');
                await this.checkForUpdates();
                this.lastUpdateCheck = now;
            }
        }, this.autoUpdateInterval);
    }

    // 更新チェック
    async checkForUpdates() {
        try {
            const response = await fetch(`${this.baseUrl}/data/feeds-meta.json?t=${Date.now()}`);
            if (response.ok) {
                const metadata = await response.json();
                if (metadata.lastUpdated !== this.lastServerUpdate) {
                    console.log('🆕 新しい更新を検出');
                    this.lastServerUpdate = metadata.lastUpdated;
                    this.updateTimestamp(this.lastServerUpdate);
                    
                    // 現在表示中のフィードを再読み込み
                    if (this.currentFeedIndex === -1) {
                        await this.loadAllFeeds();
                    } else {
                        await this.loadCurrentFeed();
                    }
                }
            }
        } catch (error) {
            console.error('更新チェックエラー:', error);
        }
    }

    // 強制更新
    async forceUpdate() {
        const refreshBtn = document.getElementById('refreshBtn');
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<span class="icon spinning">🔄</span>';
        
        try {
            await this.loadFeedMetadata();
            if (this.currentFeedIndex === -1) {
                await this.loadAllFeeds();
            } else {
                await this.loadCurrentFeed();
            }
        } finally {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<span class="icon">🔄</span>';
        }
    }

    // 既読記事管理
    loadReadArticles() {
        const saved = localStorage.getItem('readArticles');
        if (saved) {
            try {
                this.readArticles = new Set(JSON.parse(saved));
            } catch (e) {
                this.readArticles = new Set();
            }
        }
    }

    saveReadArticles() {
        localStorage.setItem('readArticles', JSON.stringify([...this.readArticles]));
    }

    toggleReadStatus(articleId) {
        if (this.readArticles.has(articleId)) {
            this.readArticles.delete(articleId);
        } else {
            this.readArticles.add(articleId);
        }
        
        this.saveReadArticles();
        this.renderArticles();
        this.updateStats();
    }

    // ダークモード管理
    loadDarkMode() {
        const darkMode = localStorage.getItem('darkMode');
        if (darkMode === 'true') {
            document.body.classList.add('dark-mode');
            document.getElementById('darkModeToggle').querySelector('.icon').textContent = '☀️';
        }
    }

    toggleDarkMode() {
        document.body.classList.toggle('dark-mode');
        const isDarkMode = document.body.classList.contains('dark-mode');
        localStorage.setItem('darkMode', isDarkMode);
        
        const icon = document.getElementById('darkModeToggle').querySelector('.icon');
        icon.textContent = isDarkMode ? '☀️' : '🌙';
    }

    // UI状態管理
    showLoading() {
        document.getElementById('loading').classList.remove('hidden');
    }

    hideLoading() {
        document.getElementById('loading').classList.add('hidden');
    }

    showError(message) {
        document.getElementById('errorText').textContent = message;
        document.getElementById('errorMessage').classList.remove('hidden');
    }

    hideError() {
        document.getElementById('errorMessage').classList.add('hidden');
    }
}

// アプリケーション開始
let rssReader;
document.addEventListener('DOMContentLoaded', () => {
    rssReader = new GitHubActionsRSSReader();
});
