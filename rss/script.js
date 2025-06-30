// rss/script.js (正しいパス参照版)
class GitHubActionsRSSReader {
    constructor() {
        this.feeds = [];
        this.currentFeedIndex = 0;
        this.articles = [];
        this.readArticles = new Set();
        
        // 正しいベースURL設定
        this.baseUrl = this.getBaseUrl();
        
        this.autoUpdateInterval = 5 * 60 * 1000;
        this.lastUpdateCheck = 0;
        
        this.init();
    }

    // ベースURL自動判定（修正版）
    getBaseUrl() {
        // /rss/ サブディレクトリから /data/ を参照する場合
        if (window.location.hostname.includes('github.io')) {
            // 現在のパス: https://username.github.io/rss/
            // データパス: https://username.github.io/data/
            const origin = window.location.origin;
            return origin; // ルートドメインを返す
        }
        
        // ローカル環境
        return window.location.origin;
    }

    // 初期化
    async init() {
        this.loadReadArticles();
        this.loadDarkMode();
        this.bindEvents();
        
        console.log(`🔧 ベースURL: ${this.baseUrl}`);
        console.log(`📡 データ参照先: ${this.baseUrl}/data/`);
        
        // ルートのdata/feeds-meta.jsonを読み込み
        await this.loadFeedMetadata();
        this.renderTabs();
        
        if (this.feeds.length > 0) {
            await this.loadCurrentFeed();
        }
        
        this.updateStats();
        this.startAutoUpdate();
        this.hideLoading();
    }

    // イベントバインド
    bindEvents() {
        document.getElementById('darkModeToggle').addEventListener('click', () => {
            this.toggleDarkMode();
        });

        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.forceUpdate();
        });

        document.getElementById('retryBtn').addEventListener('click', () => {
            this.loadCurrentFeed();
        });
    }

    // フィードメタデータ読み込み（修正版）
    async loadFeedMetadata() {
        try {
            console.log('📊 フィードメタデータを読み込み中...');
            
            // ルートのdata/feeds-meta.jsonを参照
            const metadataUrl = `${this.baseUrl}/data/feeds-meta.json?t=${Date.now()}`;
            console.log(`📡 メタデータURL: ${metadataUrl}`);
            
            const response = await fetch(metadataUrl);
            
            if (!response.ok) {
                throw new Error(`メタデータ取得エラー: ${response.status} (${metadataUrl})`);
            }
            
            const metadata = await response.json();
            this.feeds = metadata.feeds;
            this.lastServerUpdate = metadata.lastUpdated;
            
            this.updateTimestamp(this.lastServerUpdate);
            
            console.log(`✅ ${this.feeds.length}個のフィードを読み込み完了`);
            
        } catch (error) {
            console.error('メタデータ読み込みエラー:', error);
            this.feeds = [];
            this.showError(`フィード設定の読み込みに失敗しました: ${error.message}`);
        }
    }

    // 現在のフィード読み込み（修正版）
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
            
            // ルートのdata/フィード.jsonを参照
            const feedUrl = `${this.baseUrl}/data/${feed.file}?t=${Date.now()}`;
            console.log(`📡 フィードURL: ${feedUrl}`);
            
            const response = await fetch(feedUrl);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${feed.name}のデータが見つかりません (${feedUrl})`);
            }
            
            const data = await response.json();
            
            if (!data.entries || !Array.isArray(data.entries)) {
                throw new Error(`${feed.name}: 無効なデータ形式`);
            }
            
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

    // 全フィード読み込み（修正版）
    async loadAllFeeds() {
        this.showLoading();
        this.hideError();
        
        try {
            console.log('📚 全フィードを読み込み中...');
            
            const allArticles = [];
            
            for (const feed of this.feeds) {
                try {
                    // ルートのdata/を参照
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

    // 更新チェック（修正版）
    async checkForUpdates() {
        try {
            // ルートのdata/feeds-meta.jsonを参照
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

    // 残りのメソッドは既存と同じ...
    // (extractThumbnail, createSummary, generateArticleId, renderTabs, renderArticles, etc.)
}

// アプリケーション開始
let rssReader;
document.addEventListener('DOMContentLoaded', () => {
    rssReader = new GitHubActionsRSSReader();
});
