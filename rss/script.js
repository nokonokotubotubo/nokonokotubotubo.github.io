// rss/script.js (完全実装版)
class GitHubActionsRSSReader {
    constructor() {
        this.feeds = [];
        this.currentFeedIndex = 0;
        this.articles = [];
        this.readArticles = new Set();
        
        // 既存データ用のベースURL設定
        this.baseUrl = this.getBaseUrl();
        
        this.autoUpdateInterval = 5 * 60 * 1000;
        this.lastUpdateCheck = 0;
        
        this.init();
    }

    // ベースURL設定（既存データ対応）
    getBaseUrl() {
        if (window.location.hostname.includes('github.io')) {
            return window.location.origin;
        }
        return window.location.origin;
    }

    // 初期化（デバッグ強化版）
    async init() {
        this.loadReadArticles();
        this.loadDarkMode();
        this.bindEvents();
        
        console.log(`🔧 ベースURL: ${this.baseUrl}`);
        console.log(`📡 データ参照先: ${this.baseUrl}/data/`);
        
        // 既存データの確認
        await this.checkExistingData();
        
        // メタデータ読み込み
        await this.loadFeedMetadata();
        this.renderTabs();
        
        if (this.feeds.length > 0) {
            await this.loadCurrentFeed();
        } else {
            // フォールバック: 直接フィードファイルを探す
            await this.discoverFeeds();
        }
        
        this.updateStats();
        this.startAutoUpdate();
        this.hideLoading();
    }

    // 既読記事読み込み
    loadReadArticles() {
        const saved = localStorage.getItem('readArticles');
        if (saved) {
            try {
                this.readArticles = new Set(JSON.parse(saved));
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
            const toggleBtn = document.getElementById('darkModeToggle');
            if (toggleBtn) {
                const icon = toggleBtn.querySelector('.icon');
                if (icon) icon.textContent = '☀️';
            }
        }
    }

    // ダークモード切り替え
    toggleDarkMode() {
        document.body.classList.toggle('dark-mode');
        const isDarkMode = document.body.classList.contains('dark-mode');
        localStorage.setItem('darkMode', isDarkMode);
        
        const toggleBtn = document.getElementById('darkModeToggle');
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('.icon');
            if (icon) {
                icon.textContent = isDarkMode ? '☀️' : '🌙';
            }
        }
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
        this.updateStats();
    }

    // 既存データの確認
    async checkExistingData() {
        console.log('🔍 既存データ確認開始');
        
        // よくあるファイル名をチェック
        const commonFiles = [
            'feeds-meta.json',
            'tech-news.json',
            'nhk-news.json',
            'gigazine.json',
            'yahoo-news.json',
            'itmedia.json',
            'it-media.json'
        ];
        
        const existingFiles = [];
        
        for (const filename of commonFiles) {
            try {
                const response = await fetch(`${this.baseUrl}/data/${filename}`, { method: 'HEAD' });
                if (response.ok) {
                    existingFiles.push(filename);
                    console.log(`✅ 既存ファイル発見: ${filename}`);
                } else {
                    console.log(`❌ ファイル不存在: ${filename} (${response.status})`);
                }
            } catch (error) {
                console.log(`❌ ファイルチェックエラー: ${filename} - ${error.message}`);
            }
        }
        
        console.log(`📊 既存ファイル数: ${existingFiles.length}`);
        this.existingFiles = existingFiles;
    }

    // フィード自動発見
    async discoverFeeds() {
        console.log('🔍 フィード自動発見開始');
        
        if (!this.existingFiles || this.existingFiles.length === 0) {
            this.showError('利用可能なRSSデータが見つかりません');
            return;
        }
        
        const discoveredFeeds = [];
        
        // メタデータファイル以外をフィードとして扱う
        const feedFiles = this.existingFiles.filter(file => file !== 'feeds-meta.json');
        
        for (const filename of feedFiles) {
            try {
                const response = await fetch(`${this.baseUrl}/data/${filename}`);
                if (response.ok) {
                    const data = await response.json();
                    
                    if (data.entries && Array.isArray(data.entries)) {
                        const feedInfo = {
                            id: filename.replace('.json', ''),
                            name: data.title || filename.replace('.json', '').replace(/-/g, ' '),
                            description: data.description || '自動発見されたフィード',
                            file: filename,
                            color: this.generateRandomColor(),
                            articleCount: data.entries.length
                        };
                        
                        discoveredFeeds.push(feedInfo);
                        console.log(`✅ フィード発見: ${feedInfo.name} (${feedInfo.articleCount}件)`);
                    }
                }
            } catch (error) {
                console.warn(`⚠️ フィード解析エラー: ${filename} - ${error.message}`);
            }
        }
        
        if (discoveredFeeds.length > 0) {
            this.feeds = discoveredFeeds;
            console.log(`🎉 ${discoveredFeeds.length}個のフィードを自動発見`);
            
            // 簡易メタデータを生成
            this.generateSimpleMetadata(discoveredFeeds);
        } else {
            this.showError('有効なRSSフィードが見つかりませんでした');
        }
    }

    // ランダム色生成
    generateRandomColor() {
        const colors = [
            '#2E7D32', '#FF4081', '#6F42C1', '#4A90E2', 
            '#FF6B35', '#E91E63', '#9C27B0', '#3F51B5',
            '#009688', '#4CAF50', '#FF9800', '#795548'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    // 簡易メタデータ生成
    generateSimpleMetadata(feeds) {
        const metadata = {
            lastUpdated: new Date().toISOString(),
            totalFeeds: feeds.length,
            totalArticles: feeds.reduce((sum, feed) => sum + (feed.articleCount || 0), 0),
            feeds: feeds,
            source: 'auto-discovery'
        };
        
        // メタデータをメモリに保存（表示用）
        this.metadata = metadata;
        console.log('📋 簡易メタデータ生成完了');
    }

    // フィードメタデータ読み込み（既存データ対応）
    async loadFeedMetadata() {
        try {
            console.log('📊 メタデータ読み込み試行中...');
            
            const metadataUrl = `${this.baseUrl}/data/feeds-meta.json?t=${Date.now()}`;
            const response = await fetch(metadataUrl);
            
            if (response.ok) {
                const metadata = await response.json();
                this.feeds = metadata.feeds || [];
                this.lastServerUpdate = metadata.lastUpdated;
                this.updateTimestamp(this.lastServerUpdate);
                
                console.log(`✅ メタデータから${this.feeds.length}個のフィードを読み込み`);
            } else {
                console.log(`⚠️ メタデータファイルが見つかりません (${response.status})`);
            }
            
        } catch (error) {
            console.warn('⚠️ メタデータ読み込みエラー:', error.message);
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
            
            const feedUrl = `${this.baseUrl}/data/${feed.file}?t=${Date.now()}`;
            console.log(`📡 フィードURL: ${feedUrl}`);
            
            const response = await fetch(feedUrl);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${feed.name}のデータが見つかりません`);
            }
            
            const data = await response.json();
            
            if (!data.entries || !Array.isArray(data.entries)) {
                throw new Error(`${feed.name}: entries配列が見つかりません`);
            }
            
            // データ変換（柔軟な形式対応）
            this.articles = data.entries.map(entry => ({
                title: entry.title || 'タイトル不明',
                link: entry.link || '#',
                summary: this.createSummary(
                    entry.description || 
                    entry.summary || 
                    entry.content || 
                    ''
                ),
                publishedDate: entry.published || entry.pubDate || new Date().toISOString(),
                thumbnail: entry.thumbnail || this.extractThumbnail(entry),
                feedName: feed.name,
                feedColor: feed.color,
                id: entry.id || this.generateArticleId(entry)
            }));
            
            // 日付順ソート
            this.articles.sort((a, b) => new Date(b.publishedDate) - new Date(a.publishedDate));
            
            this.renderArticles();
            this.updateStats();
            
            console.log(`✅ ${feed.name}: ${this.articles.length}件読み込み完了`);
            
        } catch (error) {
            console.error(`${feed.name} 読み込みエラー:`, error);
            this.showError(`${feed.name}の読み込みに失敗しました\n\n詳細: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    // サムネイル抽出
    extractThumbnail(entry) {
        if (entry.thumbnail) return entry.thumbnail;
        
        const description = entry.description || entry.summary || '';
        const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);
        
        return imgMatch ? imgMatch[1] : '';
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
        if (!tabContainer) return;
        
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
                    const feedUrl = `${this.baseUrl}/data/${feed.file}?t=${Date.now()}`;
                    const response = await fetch(feedUrl);
                    
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

    // 記事描画
    renderArticles() {
        const articleList = document.getElementById('articleList');
        if (!articleList) return;
        
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

        const totalElement = document.getElementById('totalArticles');
        const feedsElement = document.getElementById('totalFeeds');
        const unreadElement = document.getElementById('unreadArticles');
        
        if (totalElement) totalElement.textContent = totalArticles;
        if (feedsElement) feedsElement.textContent = totalFeeds;
        if (unreadElement) unreadElement.textContent = unreadArticles;
        
        const statsElement = document.getElementById('feedStats');
        if (statsElement) statsElement.classList.remove('hidden');
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
        
        const updateTimeElement = document.getElementById('updateTime');
        const footerUpdateTimeElement = document.getElementById('footerUpdateTime');
        
        if (updateTimeElement) updateTimeElement.textContent = `${formattedTime} 更新`;
        if (footerUpdateTimeElement) footerUpdateTimeElement.textContent = formattedTime;
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
            const metadataUrl = `${this.baseUrl}/data/feeds-meta.json?t=${Date.now()}`;
            const response = await fetch(metadataUrl);
            
            if (response.ok) {
                const metadata = await response.json();
                if (metadata.lastUpdated !== this.lastServerUpdate) {
                    console.log('🆕 新しい更新を検出');
                    this.lastServerUpdate = metadata.lastUpdated;
                    this.updateTimestamp(this.lastServerUpdate);
                    
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
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<span class="icon spinning">🔄</span>';
        }
        
        try {
            await this.loadFeedMetadata();
            if (this.currentFeedIndex === -1) {
                await this.loadAllFeeds();
            } else {
                await this.loadCurrentFeed();
            }
        } finally {
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = '<span class="icon">🔄</span>';
            }
        }
    }

    // イベントバインド
    bindEvents() {
        const darkModeBtn = document.getElementById('darkModeToggle');
        const refreshBtn = document.getElementById('refreshBtn');
        const retryBtn = document.getElementById('retryBtn');
        
        if (darkModeBtn) {
            darkModeBtn.addEventListener('click', () => {
                this.toggleDarkMode();
            });
        }

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.forceUpdate();
            });
        }

        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                this.loadCurrentFeed();
            });
        }
    }

    // UI状態管理
    showLoading() {
        const loadingElement = document.getElementById('loading');
        if (loadingElement) loadingElement.classList.remove('hidden');
    }

    hideLoading() {
        const loadingElement = document.getElementById('loading');
        if (loadingElement) loadingElement.classList.add('hidden');
    }

    showError(message) {
        const errorTextElement = document.getElementById('errorText');
        const errorMessageElement = document.getElementById('errorMessage');
        
        if (errorTextElement) errorTextElement.textContent = message;
        if (errorMessageElement) errorMessageElement.classList.remove('hidden');
    }

    hideError() {
        const errorMessageElement = document.getElementById('errorMessage');
        if (errorMessageElement) errorMessageElement.classList.add('hidden');
    }
}

// アプリケーション開始
let rssReader;
document.addEventListener('DOMContentLoaded', () => {
    rssReader = new GitHubActionsRSSReader();
});
