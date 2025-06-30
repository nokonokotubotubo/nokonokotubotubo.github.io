// RSSリーダーアプリケーション（修正版）
class RSSReader {
    constructor() {
        this.feeds = [];
        this.currentFeedIndex = 0;
        this.articles = [];
        this.readArticles = new Set();
        this.maxRetries = 3;
        this.retryDelay = 1000; // 遅延を増加
        
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
            this.showError(`フィードの読み込みに失敗しました: ${error.message}\n\n別のプロキシサービスを試しています...`);
            
            // 代替プロキシで再試行
            try {
                const articles = await this.fetchRSSWithFallback(feed.url);
                this.articles = articles.map(article => ({
                    ...article,
                    feedName: feed.name,
                    id: this.generateArticleId(article)
                }));
                this.renderArticles();
                this.hideError();
            } catch (fallbackError) {
                console.error('代替プロキシも失敗:', fallbackError);
                this.showError(`全てのプロキシサービスでフィード取得に失敗しました。\nRSSフィードのURLが正しいか確認してください。`);
            }
        } finally {
            this.hideLoading();
        }
    }

    // 複数プロキシサービスを使用したRSS取得（修正版）
    async fetchRSSWithRetry(url, retryCount = 0) {
        // 複数のプロキシサービスを定義
        const proxyServices = [
            `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
            `https://cors-anywhere.herokuapp.com/${url}`,
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
        ];
        
        const currentProxy = proxyServices[retryCount % proxyServices.length];
        
        try {
            console.log(`プロキシ試行 ${retryCount + 1}: ${currentProxy}`);
            
            // AbortControllerでタイムアウト制御
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            const response = await fetch(currentProxy, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json, text/xml, application/xml',
                    'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader)'
                },
                signal: controller.signal,
                mode: 'cors', // CORSを明示的に指定
                cache: 'no-cache' // キャッシュを無効化
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            // allorigins.winの場合
            if (data.contents) {
                return this.parseRSS(data.contents);
            }
            // その他のプロキシの場合
            else if (typeof data === 'string') {
                return this.parseRSS(data);
            }
            else {
                throw new Error('有効なRSSデータが見つかりません');
            }
            
        } catch (error) {
            console.error(`プロキシ ${retryCount + 1} でエラー:`, error.message);
            
            if (retryCount < this.maxRetries) {
                const delay = this.retryDelay * Math.pow(1.5, retryCount); // 指数バックオフを緩和
                console.log(`${delay}ms後に次のプロキシで再試行...`);
                
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.fetchRSSWithRetry(url, retryCount + 1);
            }
            
            throw new Error(`全プロキシサービスで失敗: ${error.message}`);
        }
    }

    // 代替プロキシサービス
    async fetchRSSWithFallback(url) {
        const fallbackProxies = [
            `https://thingproxy.freeboard.io/fetch/${url}`,
            `https://cors.bridged.cc/${url}`
        ];
        
        for (const proxy of fallbackProxies) {
            try {
                console.log(`代替プロキシ試行: ${proxy}`);
                
                const response = await fetch(proxy, {
                    method: 'GET',
                    headers: {
                        'Accept': 'text/xml, application/xml',
                    },
                    timeout: 10000
                });

                if (response.ok) {
                    const text = await response.text();
                    return this.parseRSS(text);
                }
            } catch (error) {
                console.error(`代替プロキシエラー: ${error.message}`);
                continue;
            }
        }
        
        throw new Error('全ての代替プロキシでも失敗しました');
    }

    // RSS解析（改良版）
    parseRSS(xmlString) {
        try {
            // 空文字やnullチェック
            if (!xmlString || typeof xmlString !== 'string') {
                throw new Error('有効なXMLデータがありません');
            }
            
            // HTMLエンティティのデコード
            const cleanXml = xmlString
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'");
            
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(cleanXml, 'application/xml');
            
            // パースエラーチェック
            const parserError = xmlDoc.querySelector('parsererror');
            if (parserError) {
                console.error('XML解析エラー詳細:', parserError.textContent);
                throw new Error(`XML解析エラー: ${parserError.textContent}`);
            }

            // RSS 2.0 または Atom フィードの検出
            const items = xmlDoc.querySelectorAll('item, entry');
            
            if (items.length === 0) {
                console.warn('RSS項目が見つかりません。XMLを確認:', xmlString.substring(0, 500));
                throw new Error('RSS項目が見つかりません');
            }

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

    // 記事アイテム解析（改良版）
    parseArticleItem(item) {
        try {
            const title = this.getTextContent(item, 'title') || 'タイトル不明';
            const link = this.getTextContent(item, 'link, guid, id') || '#';
            const description = this.getTextContent(item, 'description, summary, content:encoded, content') || '';
            
            // 日付の解析を改善
            let publishedDate = this.getTextContent(item, 'pubDate, published, updated, dc:date');
            if (!publishedDate) {
                publishedDate = new Date().toISOString();
            } else {
                // 日付の正規化
                try {
                    publishedDate = new Date(publishedDate).toISOString();
                } catch {
                    publishedDate = new Date().toISOString();
                }
            }
            
            // サムネイル画像の取得（改良版）
            let thumbnail = this.extractThumbnail(item, description);

            // 説明文からHTMLタグを除去してサマリーを作成
            const summary = this.createSummary(description);

            return {
                title: title.trim(),
                link: link.trim(),
                summary,
                publishedDate,
                thumbnail
            };
        } catch (error) {
            console.error('記事解析エラー:', error);
            return null;
        }
    }

    // サムネイル抽出（改良版）
    extractThumbnail(item, description) {
        let thumbnail = '';
        
        // メディア要素からの取得
        const mediaContent = item.querySelector('media\\:content, content, enclosure[type^="image"]');
        if (mediaContent) {
            thumbnail = mediaContent.getAttribute('url') || mediaContent.getAttribute('href');
        }
        
        // description内のimg要素から取得
        if (!thumbnail) {
            const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/i;
            const imgMatch = description.match(imgRegex);
            if (imgMatch) {
                thumbnail = imgMatch[1];
            }
        }
        
        // og:imageの取得
        if (!thumbnail) {
            const ogImageRegex = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i;
            const ogMatch = description.match(ogImageRegex);
            if (ogMatch) {
                thumbnail = ogMatch[1];
            }
        }
        
        return thumbnail;
    }

    // テキストコンテンツ取得（改良版）
    getTextContent(element, selectors) {
        const selectorList = selectors.split(',').map(s => s.trim());
        for (const selector of selectorList) {
            try {
                const found = element.querySelector(selector);
                if (found && found.textContent.trim()) {
                    return found.textContent.trim();
                }
                // CDATA対応
                if (found && found.innerHTML) {
                    return found.innerHTML.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
                }
            } catch (e) {
                // セレクターエラーを無視して続行
                continue;
            }
        }
        return '';
    }

    // サマリー作成（改良版）
    createSummary(description, maxLength = 120) {
        if (!description) return '説明がありません';
        
        // HTMLタグとCDATAを除去
        let text = description
            .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
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
