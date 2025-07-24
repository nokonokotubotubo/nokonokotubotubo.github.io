// Minews PWA - 最適化版
(function() {
    'use strict';

    // ===========================================
    // 定数・設定
    // ===========================================
    const CONFIG = {
        STORAGE_KEYS: {
            ARTICLES: 'minews_articles',
            RSS_FEEDS: 'minews_rssFeeds',
            FOLDERS: 'minews_folders',
            AI_LEARNING: 'minews_aiLearning',
            WORD_FILTERS: 'minews_wordFilters'
        },
        MAX_ARTICLES: 1000,
        DATA_VERSION: '1.0',
        REQUEST_TIMEOUT: 15000,
        MAX_RETRIES: 2,
        RETRY_DELAY: 3000,
        RSS_PROXY_URLS: [
            'https://api.codetabs.com/v1/proxy?quest=',
            'https://api.allorigins.win/get?url=',
            'https://thingproxy.freeboard.io/fetch/',
            'https://corsproxy.io/?'
        ],
        FOLDER_COLORS: [
            { name: 'ブルー', value: '#4A90A4' },
            { name: 'グリーン', value: '#28a745' },
            { name: 'オレンジ', value: '#fd7e14' },
            { name: 'パープル', value: '#6f42c1' },
            { name: 'レッド', value: '#dc3545' },
            { name: 'グレー', value: '#6c757d' }
        ]
    };

    const DEFAULT_DATA = {
        folders: [
            { id: 'default-general', name: 'ニュース', color: '#4A90A4', createdAt: new Date().toISOString() },
            { id: 'default-tech', name: 'テック', color: '#28a745', createdAt: new Date().toISOString() }
        ],
        articles: [],
        rssFeeds: [
            { id: 'default-nhk', url: 'https://www3.nhk.or.jp/rss/news/cat0.xml', title: 'NHKニュース', folderId: 'default-general', lastUpdated: new Date().toISOString(), isActive: true },
            { id: 'default-itmedia', url: 'https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml', title: 'ITmedia', folderId: 'default-tech', lastUpdated: new Date().toISOString(), isActive: true }
        ],
        aiLearning: {
            version: CONFIG.DATA_VERSION,
            wordWeights: {},
            categoryWeights: {
                'Technology': 0,
                'Development': 0,
                'Business': 0,
                'Science': 0,
                'Design': 0,
                'AI': 0,
                'Web': 0,
                'Mobile': 0
            },
            lastUpdated: new Date().toISOString()
        },
        wordFilters: {
            interestWords: ['AI', 'React', 'JavaScript', 'PWA', '機械学習'],
            ngWords: [],
            lastUpdated: new Date().toISOString()
        }
    };

    // ===========================================
    // キャッシュシステム
    // ===========================================
    const DataHooksCache = {
        articles: null,
        rssFeeds: null,
        folders: null,
        aiLearning: null,
        wordFilters: null,
        lastUpdate: {
            articles: null,
            rssFeeds: null,
            folders: null,
            aiLearning: null,
            wordFilters: null
        },
        clear(key) {
            if (key) {
                this[key] = null;
                this.lastUpdate[key] = null;
            } else {
                Object.keys(this).forEach(k => k !== 'clear' && k !== 'lastUpdate' && (this[k] = null));
                this.lastUpdate = { articles: null, rssFeeds: null, folders: null, aiLearning: null, wordFilters: null };
            }
        }
    };

    // ===========================================
    // フォルダ管理
    // ===========================================
    const FolderManager = {
        createFolder: (name, color = '#4A90A4') => ({
            id: `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: name.trim(),
            color,
            createdAt: new Date().toISOString()
        }),
        validateFolder: folder => folder && typeof folder.name === 'string' && folder.name.trim().length > 0 && folder.name.trim().length <= 50,
        getColorName: colorValue => CONFIG.FOLDER_COLORS.find(c => c.value === colorValue)?.name || 'カスタム',
        matchArticleToFeed(article, feeds) {
            return feeds.find(feed =>
                feed.title === article.rssSource ||
                article.rssSource.includes(feed.title) ||
                feed.title.includes(article.rssSource) ||
                this.extractDomainFromSource(article.rssSource) === this.extractDomainFromUrl(feed.url)
            ) || null;
        },
        extractDomainFromSource: source => source.includes('.') ? source.toLowerCase().replace(/^www\./, '') : source.toLowerCase(),
        extractDomainFromUrl(url) {
            try {
                return new URL(url).hostname.replace(/^www\./, '');
            } catch {
                return '';
            }
        }
    };

    // ===========================================
    // RSS処理システム
    // ===========================================
    const RSSProcessor = {
        async fetchRSS(url, proxyIndex = 0, retryCount = 0) {
            if (proxyIndex >= CONFIG.RSS_PROXY_URLS.length) {
                if (retryCount < CONFIG.MAX_RETRIES) {
                    await this.delay(CONFIG.RETRY_DELAY);
                    return this.fetchRSS(url, 0, retryCount + 1);
                }
                throw new Error('All proxy servers failed after retries');
            }

            const proxyUrl = CONFIG.RSS_PROXY_URLS[proxyIndex];
            const fullUrl = proxyUrl + encodeURIComponent(url);

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

                const response = await fetch(fullUrl, {
                    signal: controller.signal,
                    headers: {
                        'Accept': '*/*',
                        'User-Agent': 'Mozilla/5.0 (compatible; Minews/1.0)'
                    },
                    mode: 'cors'
                });

                clearTimeout(timeoutId);

                if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

                let xmlContent;
                if (proxyUrl.includes('allorigins.win')) {
                    const data = await response.json();
                    xmlContent = data.contents;
                    if (!xmlContent) throw new Error('No contents in allorigins.win response');
                } else {
                    const contentType = response.headers.get('content-type');
                    if (contentType?.includes('application/json')) {
                        try {
                            const data = await response.json();
                            xmlContent = data.contents || data;
                        } catch {
                            xmlContent = await response.text();
                        }
                    } else {
                        xmlContent = await response.text();
                    }
                }

                if (!xmlContent?.trim()) throw new Error('Empty response content');
                return xmlContent;

            } catch (error) {
                if (error.name === 'AbortError') throw new Error(`Request timeout for proxy ${proxyIndex + 1}`);
                return this.fetchRSS(url, proxyIndex + 1, retryCount);
            }
        },

        delay: ms => new Promise(resolve => setTimeout(resolve, ms)),

        parseRSS(xmlString, sourceUrl) {
            try {
                const cleanXml = xmlString.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(cleanXml, 'text/xml');

                const parseError = xmlDoc.querySelector('parsererror');
                if (parseError) throw new Error('XML parse error: ' + parseError.textContent);

                const articles = [];
                let feedTitle = 'Unknown Feed';

                // RSS 2.0
                const rss2Items = xmlDoc.querySelectorAll('rss channel item');
                if (rss2Items.length > 0) {
                    feedTitle = xmlDoc.querySelector('rss channel title')?.textContent?.trim() || feedTitle;
                    rss2Items.forEach((item, index) => {
                        if (index < 20) {
                            const article = this.parseRSSItem(item, sourceUrl);
                            if (article) articles.push(article);
                        }
                    });
                }

                // Atom
                const atomEntries = xmlDoc.querySelectorAll('feed entry');
                if (atomEntries.length > 0 && articles.length === 0) {
                    feedTitle = xmlDoc.querySelector('feed title')?.textContent?.trim() || feedTitle;
                    atomEntries.forEach((entry, index) => {
                        if (index < 20) {
                            const article = this.parseAtomEntry(entry, sourceUrl);
                            if (article) articles.push(article);
                        }
                    });
                }

                // RDF
                const rdfItems = xmlDoc.querySelectorAll('rdf\\:RDF item, RDF item');
                if (rdfItems.length > 0 && articles.length === 0) {
                    feedTitle = xmlDoc.querySelector('channel title')?.textContent?.trim() || feedTitle;
                    rdfItems.forEach((item, index) => {
                        if (index < 20) {
                            const article = this.parseRSSItem(item, sourceUrl);
                            if (article) articles.push(article);
                        }
                    });
                }

                return { articles, feedTitle };

            } catch (error) {
                throw new Error('Failed to parse RSS feed: ' + error.message);
            }
        },

        parseRSSItem(item, sourceUrl) {
            try {
                const title = this.getTextContent(item, ['title']);
                const link = this.getTextContent(item, ['link', 'guid']) || item.getAttribute('rdf:about');
                const description = this.getTextContent(item, ['description', 'content:encoded', 'content', 'summary']);
                const pubDate = this.getTextContent(item, ['pubDate', 'date']);
                const category = this.getTextContent(item, ['category', 'subject']) || 'General';

                if (!title || !link) return null;

                const cleanDescription = description ? this.cleanHtml(description).substring(0, 300) : '記事の概要は提供されていません';
                const keywords = this.extractKeywords(title + ' ' + cleanDescription);

                return {
                    id: `rss_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    title: this.cleanHtml(title).trim(),
                    url: link.trim(),
                    content: cleanDescription,
                    publishDate: this.parseDate(pubDate),
                    rssSource: this.extractDomain(sourceUrl),
                    category: this.cleanHtml(category).trim(),
                    readStatus: 'unread',
                    readLater: false,
                    userRating: 0,
                    keywords,
                    fetchedAt: new Date().toISOString()
                };

            } catch (error) {
                return null;
            }
        },

        parseAtomEntry(entry, sourceUrl) {
            try {
                const title = this.getTextContent(entry, ['title']);
                const link = entry.querySelector('link')?.getAttribute('href') || this.getTextContent(entry, ['id']);
                const content = this.getTextContent(entry, ['content', 'summary', 'description']);
                const published = this.getTextContent(entry, ['published', 'updated']);
                const category = entry.querySelector('category')?.getAttribute('term') || entry.querySelector('category')?.textContent || 'General';

                if (!title || !link) return null;

                const cleanContent = content ? this.cleanHtml(content).substring(0, 300) : '記事の概要は提供されていません';
                const keywords = this.extractKeywords(title + ' ' + cleanContent);

                return {
                    id: `atom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    title: this.cleanHtml(title).trim(),
                    url: link.trim(),
                    content: cleanContent,
                    publishDate: this.parseDate(published),
                    rssSource: this.extractDomain(sourceUrl),
                    category: this.cleanHtml(category).trim(),
                    readStatus: 'unread',
                    readLater: false,
                    userRating: 0,
                    keywords,
                    fetchedAt: new Date().toISOString()
                };

            } catch (error) {
                return null;
            }
        },

        getTextContent(element, selectors) {
            for (const selector of selectors) {
                let result = null;
                if (selector.includes(':')) {
                    const elements = element.getElementsByTagName(selector);
                    if (elements.length > 0 && elements[0].textContent) {
                        result = elements[0].textContent.trim();
                    }
                    if (!result) {
                        const localName = selector.split(':')[1];
                        const localElements = element.getElementsByTagName(localName);
                        if (localElements.length > 0 && localElements[0].textContent) {
                            result = localElements[0].textContent.trim();
                        }
                    }
                } else {
                    try {
                        const el = element.querySelector(selector);
                        if (el?.textContent) result = el.textContent.trim();
                    } catch (e) {
                        const elements = element.getElementsByTagName(selector);
                        if (elements.length > 0 && elements[0].textContent) {
                            result = elements[0].textContent.trim();
                        }
                    }
                }
                if (result) return result;
            }
            return null;
        },

        cleanHtml: html => html ? html.replace(/<[^>]*>/g, '').replace(/</g, '<').replace(/>/g, '>').replace(/&/g, '&').replace(/"/g, '"').replace(/'/g, "'").replace(/\s+/g, ' ').trim() : '',

        parseDate(dateString) {
            if (!dateString) return new Date().toISOString();
            try {
                const date = new Date(dateString);
                return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
            } catch {
                return new Date().toISOString();
            }
        },

        // 修正されたextractKeywords関数（RakutenMA対応）
        extractKeywords(text) {
            try {
                // RakutenMA初期化（初回のみ）
                if (!window.rmaInstance) {
                    window.rmaInstance = new RakutenMA(model_ja);
                    window.rmaInstance.featset = RakutenMA.default_featset_ja;
                    window.rmaInstance.hash_func = RakutenMA.create_hash_func(15);
                }

                // 形態素解析実行
                const tokens = window.rmaInstance.tokenize(text);
                const keywords = [];
                
                tokens.forEach(token => {
                    const [word, pos] = token;
                    // 名詞のみ抽出、2文字以上
                    if (pos.includes('名詞') && word.length >= 2) {
                        const stopWords = ['こと', 'もの', 'ため', 'とき', 'について', 'という', 'など', '記事'];
                        if (!stopWords.includes(word) && !/^[0-9]+$/.test(word)) {
                            keywords.push(word);
                        }
                    }
                });

                // 重複除去して8個まで
                return [...new Set(keywords)].slice(0, 8);
                
            } catch (error) {
                // エラー時は既存のロジックで継続（フォールバック）
                const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'は', 'が', 'を', 'に', 'で', 'と', 'の', 'から', 'まで', 'について', 'という', 'など'];
                return [...new Set(
                    text.toLowerCase()
                        .replace(/[^\w\sぁ-んァ-ン一-龯ー]/g, ' ')
                        .split(/[\s,、。・\-･▪▫◦‣⁃\u3000]/)
                        .filter(word => word.length > 2 && !stopWords.includes(word) && word !== 'ー')
                        .slice(0, 8)
                )];
            }
        },

        extractDomain(url) {
            try {
                return new URL(url).hostname.replace(/^www\./, '');
            } catch {
                return 'Unknown Source';
            }
        }
    };

    // ===========================================
    // AI学習システム
    // ===========================================
    const AIScoring = {
        filterArticles(articles, wordFilters) {
            if (!wordFilters.ngWords || wordFilters.ngWords.length === 0) return articles;
            return articles.filter(article => {
                const content = (article.title + ' ' + article.content).toLowerCase();
                return !wordFilters.ngWords.some(ngWord => content.includes(ngWord.toLowerCase()));
            });
        },

        calculateScore(article, aiLearning, wordFilters) {
            let score = 0;

            // 1. 鮮度スコア（0-20点、指数減衰）
            const hours = (Date.now() - new Date(article.publishDate).getTime()) / (1000 * 60 * 60);
            const freshness = Math.exp(-hours / 72) * 20;
            score += freshness;

            // 2. キーワード学習重み（-20～+20点にクリッピング）
            if (article.keywords && aiLearning.wordWeights) {
                article.keywords.forEach(keyword => {
                    const weight = aiLearning.wordWeights[keyword] || 0;
                    score += Math.max(-20, Math.min(20, weight));
                });
            }

            // 3. カテゴリ学習重み（-15～+15点にクリッピング）
            if (article.category && aiLearning.categoryWeights) {
                const weight = aiLearning.categoryWeights[article.category] || 0;
                score += Math.max(-15, Math.min(15, weight));
            }

            // 4. 興味ワードマッチ（+10点、重複なし）
            if (wordFilters.interestWords && article.title) {
                const content = (article.title + ' ' + article.content).toLowerCase();
                const hasInterestWord = wordFilters.interestWords.some(word => content.includes(word.toLowerCase()));
                if (hasInterestWord) score += 10;
            }

            // 5. ユーザー評価（-20～+20点）
            if (article.userRating > 0) {
                score += (article.userRating - 3) * 10;
            }

            // 6. 最終スコアを0-100に正規化
            return Math.max(0, Math.min(100, Math.round(score + 50)));
        },

        updateLearning(article, rating, aiLearning, isRevert = false) {
            const weights = [0, -6, -2, 0, 2, 6];
            let weight = weights[rating] || 0;
            if (isRevert) weight = -weight;

            // キーワード重み更新（±60でクリッピング）
            if (article.keywords) {
                article.keywords.forEach(keyword => {
                    const newWeight = (aiLearning.wordWeights[keyword] || 0) + weight;
                    aiLearning.wordWeights[keyword] = Math.max(-60, Math.min(60, newWeight));
                });
            }

            // カテゴリ重み更新（±42でクリッピング）
            if (article.category) {
                const newWeight = (aiLearning.categoryWeights[article.category] || 0) + weight;
                aiLearning.categoryWeights[article.category] = Math.max(-42, Math.min(42, newWeight));
            }

            aiLearning.lastUpdated = new Date().toISOString();
            return aiLearning;
        },

        sortArticlesByScore(articles, aiLearning, wordFilters) {
            return articles.map(article => ({
                ...article,
                aiScore: this.calculateScore(article, aiLearning, wordFilters)
            })).sort((a, b) => {
                if (a.aiScore !== b.aiScore) return b.aiScore - a.aiScore;
                if (a.userRating !== b.userRating) return b.userRating - a.userRating;
                return new Date(b.publishDate) - new Date(a.publishDate);
            });
        }
    };

    // ===========================================
    // ワードフィルター管理
    // ===========================================
    const WordFilterManager = {
        addWord(word, type, wordFilters) {
            word = word.trim();
            if (!word) return false;

            const targetArray = type === 'interest' ? wordFilters.interestWords : wordFilters.ngWords;
            const exists = targetArray.some(existingWord => existingWord.toLowerCase() === word.toLowerCase());

            if (!exists) {
                targetArray.push(word);
                wordFilters.lastUpdated = new Date().toISOString();
                return true;
            }
            return false;
        },

        removeWord(word, type, wordFilters) {
            word = word.trim();
            const targetArray = type === 'interest' ? wordFilters.interestWords : wordFilters.ngWords;
            const index = targetArray.indexOf(word);

            if (index > -1) {
                targetArray.splice(index, 1);
                wordFilters.lastUpdated = new Date().toISOString();
                return true;
            }
            return false;
        },

        filterArticles(articles, wordFilters) {
            if (!wordFilters.ngWords.length) return articles;
            return articles.filter(article => {
                const text = (article.title + ' ' + article.content).toLowerCase();
                return !wordFilters.ngWords.some(ngWord => text.includes(ngWord.toLowerCase()));
            });
        }
    };

    // ===========================================
    // ローカルストレージ管理
    // ===========================================
    const LocalStorageManager = {
        setItem(key, data) {
            try {
                const serializedData = JSON.stringify({
                    data,
                    timestamp: new Date().toISOString(),
                    version: CONFIG.DATA_VERSION
                });
                localStorage.setItem(key, serializedData);
                return true;
            } catch (error) {
                return false;
            }
        },

        getItem(key, defaultValue) {
            try {
                const stored = localStorage.getItem(key);
                if (!stored) {
                    if (defaultValue) this.setItem(key, defaultValue);
                    return defaultValue;
                }

                const parsed = JSON.parse(stored);
                if (parsed.version !== CONFIG.DATA_VERSION) {
                    return this.migrateData(key, parsed, defaultValue);
                }
                return parsed.data;

            } catch (error) {
                if (defaultValue) this.setItem(key, defaultValue);
                return defaultValue;
            }
        },

        removeItem(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (error) {
                return false;
            }
        },

        migrateData(key, oldData, defaultValue) {
            if (oldData.data) {
                this.setItem(key, oldData.data);
                return oldData.data;
            }
            return defaultValue;
        },

        getStorageInfo() {
            let totalSize = 0;
            let itemCount = 0;
            for (let key in localStorage) {
                if (localStorage.hasOwnProperty(key) && key.startsWith('minews_')) {
                    totalSize += localStorage[key].length;
                    itemCount++;
                }
            }
            return {
                totalSize,
                itemCount,
                available: 5000000 - totalSize
            };
        }
    };

     // ===========================================
    // データ操作フック
    // ===========================================
    const DataHooks = {
        useArticles() {
            const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.ARTICLES);
            const timestamp = stored ? JSON.parse(stored).timestamp : null;

            if (!DataHooksCache.articles || DataHooksCache.lastUpdate.articles !== timestamp) {
                DataHooksCache.articles = LocalStorageManager.getItem(CONFIG.STORAGE_KEYS.ARTICLES, DEFAULT_DATA.articles);
                DataHooksCache.lastUpdate.articles = timestamp;
            }

            return {
                articles: DataHooksCache.articles,
                addArticle(newArticle) {
                    const updatedArticles = [...DataHooksCache.articles];
                    const exists = updatedArticles.find(article =>
                        article.id === newArticle.id ||
                        article.url === newArticle.url ||
                        (article.title === newArticle.title && article.rssSource === newArticle.rssSource)
                    );

                    if (exists) return false;

                    if (updatedArticles.length >= CONFIG.MAX_ARTICLES) {
                        updatedArticles.sort((a, b) => {
                            const aScore = (a.readStatus === 'read' && a.userRating === 0) ? 1 : 0;
                            const bScore = (b.readStatus === 'read' && b.userRating === 0) ? 1 : 0;
                            if (aScore !== bScore) return bScore - aScore;
                            return new Date(a.publishDate) - new Date(b.publishDate);
                        });
                        updatedArticles.pop();
                    }

                    updatedArticles.unshift(newArticle);
                    LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
                    DataHooksCache.articles = updatedArticles;
                    DataHooksCache.lastUpdate.articles = new Date().toISOString();
                    state.articles = updatedArticles;
                    return true;
                },

                updateArticle(articleId, updates) {
                    const updatedArticles = DataHooksCache.articles.map(article =>
                        article.id === articleId ? { ...article, ...updates } : article
                    );
                    LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
                    DataHooksCache.articles = updatedArticles;
                    DataHooksCache.lastUpdate.articles = new Date().toISOString();
                    state.articles = updatedArticles;
                    render();
                },

                removeArticle(articleId) {
                    const updatedArticles = DataHooksCache.articles.filter(article => article.id !== articleId);
                    LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
                    DataHooksCache.articles = updatedArticles;
                    DataHooksCache.lastUpdate.articles = new Date().toISOString();
                    state.articles = updatedArticles;
                    render();
                },

                bulkUpdateArticles(articleIds, updates) {
                    const updatedArticles = DataHooksCache.articles.map(article =>
                        articleIds.includes(article.id) ? { ...article, ...updates } : article
                    );
                    LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
                    DataHooksCache.articles = updatedArticles;
                    DataHooksCache.lastUpdate.articles = new Date().toISOString();
                    state.articles = updatedArticles;
                    render();
                }
            };
        },

        useRSSManager() {
            const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.RSS_FEEDS);
            const timestamp = stored ? JSON.parse(stored).timestamp : null;

            if (!DataHooksCache.rssFeeds || DataHooksCache.lastUpdate.rssFeeds !== timestamp) {
                DataHooksCache.rssFeeds = LocalStorageManager.getItem(CONFIG.STORAGE_KEYS.RSS_FEEDS, DEFAULT_DATA.rssFeeds);
                DataHooksCache.lastUpdate.rssFeeds = timestamp;
            }

            return {
                rssFeeds: DataHooksCache.rssFeeds,
                addRSSFeed(url, title, folderId = 'uncategorized') {
                    const newFeed = {
                        id: `rss_${Date.now()}`,
                        url,
                        title: title || 'Unknown Feed',
                        folderId,
                        lastUpdated: new Date().toISOString(),
                        isActive: true
                    };

                    const updatedFeeds = [...DataHooksCache.rssFeeds, newFeed];
                    LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.RSS_FEEDS, updatedFeeds);
                    DataHooksCache.rssFeeds = updatedFeeds;
                    DataHooksCache.lastUpdate.rssFeeds = new Date().toISOString();
                    return newFeed;
                },

                removeRSSFeed(feedId) {
                    const updatedFeeds = DataHooksCache.rssFeeds.filter(feed => feed.id !== feedId);
                    LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.RSS_FEEDS, updatedFeeds);
                    DataHooksCache.rssFeeds = updatedFeeds;
                    DataHooksCache.lastUpdate.rssFeeds = new Date().toISOString();
                },

                updateRSSFeed(feedId, updates) {
                    const updatedFeeds = DataHooksCache.rssFeeds.map(feed =>
                        feed.id === feedId ? { ...feed, ...updates } : feed
                    );
                    LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.RSS_FEEDS, updatedFeeds);
                    DataHooksCache.rssFeeds = updatedFeeds;
                    DataHooksCache.lastUpdate.rssFeeds = new Date().toISOString();
                },

                async fetchAllFeeds() {
                    const articlesHook = DataHooks.useArticles();
                    let totalAdded = 0;
                    let totalErrors = 0;
                    let feedResults = [];

                    for (const feed of DataHooksCache.rssFeeds.filter(f => f.isActive)) {
                        try {
                            const rssContent = await RSSProcessor.fetchRSS(feed.url);
                            const parsed = RSSProcessor.parseRSS(rssContent, feed.url);

                            let addedCount = 0;
                            parsed.articles.forEach(article => {
                                if (articlesHook.addArticle(article)) addedCount++;
                            });

                            this.updateRSSFeed(feed.id, {
                                lastUpdated: new Date().toISOString()
                            });

                            totalAdded += addedCount;
                            feedResults.push({
                                name: feed.title,
                                success: true,
                                added: addedCount,
                                total: parsed.articles.length
                            });

                        } catch (error) {
                            totalErrors++;
                            feedResults.push({
                                name: feed.title,
                                success: false,
                                error: error.message
                            });
                        }
                    }

                    return {
                        totalAdded,
                        totalErrors,
                        totalFeeds: DataHooksCache.rssFeeds.filter(f => f.isActive).length,
                        feedResults
                    };
                }
            };
        },

        useFolders() {
            const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.FOLDERS);
            const timestamp = stored ? JSON.parse(stored).timestamp : null;

            if (!DataHooksCache.folders || DataHooksCache.lastUpdate.folders !== timestamp) {
                DataHooksCache.folders = LocalStorageManager.getItem(CONFIG.STORAGE_KEYS.FOLDERS, DEFAULT_DATA.folders);
                DataHooksCache.lastUpdate.folders = timestamp;
            }

            return {
                folders: DataHooksCache.folders,
                addFolder(name, color) {
                    const newFolder = FolderManager.createFolder(name, color);
                    if (!FolderManager.validateFolder(newFolder)) return null;

                    const updatedFolders = [...DataHooksCache.folders, newFolder];
                    LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.FOLDERS, updatedFolders);
                    DataHooksCache.folders = updatedFolders;
                    DataHooksCache.lastUpdate.folders = new Date().toISOString();
                    return newFolder;
                },

                removeFolder(folderId) {
                    const rssHook = DataHooks.useRSSManager();
                    const feedsInFolder = rssHook.rssFeeds.filter(feed => feed.folderId === folderId);

                    if (feedsInFolder.length > 0) {
                        return {
                            success: false,
                            reason: 'FEEDS_EXIST',
                            feedCount: feedsInFolder.length
                        };
                    }

                    const updatedFolders = DataHooksCache.folders.filter(folder => folder.id !== folderId);
                    LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.FOLDERS, updatedFolders);
                    DataHooksCache.folders = updatedFolders;
                    DataHooksCache.lastUpdate.folders = new Date().toISOString();
                    return { success: true };
                },

                updateFolder(folderId, updates) {
                    const updatedFolders = DataHooksCache.folders.map(folder =>
                        folder.id === folderId ? { ...folder, ...updates } : folder
                    );
                    LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.FOLDERS, updatedFolders);
                    DataHooksCache.folders = updatedFolders;
                    DataHooksCache.lastUpdate.folders = new Date().toISOString();
                }
            };
        },

        useAILearning() {
            const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.AI_LEARNING);
            const timestamp = stored ? JSON.parse(stored).timestamp : null;

            if (!DataHooksCache.aiLearning || DataHooksCache.lastUpdate.aiLearning !== timestamp) {
                DataHooksCache.aiLearning = LocalStorageManager.getItem(CONFIG.STORAGE_KEYS.AI_LEARNING, DEFAULT_DATA.aiLearning);
                DataHooksCache.lastUpdate.aiLearning = timestamp;
            }

            return {
                aiLearning: DataHooksCache.aiLearning,
                updateWordWeight(word, weight) {
                    const updatedLearning = {
                        ...DataHooksCache.aiLearning,
                        wordWeights: {
                            ...DataHooksCache.aiLearning.wordWeights,
                            [word]: (DataHooksCache.aiLearning.wordWeights[word] || 0) + weight
                        },
                        lastUpdated: new Date().toISOString()
                    };
                    LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.AI_LEARNING, updatedLearning);
                    DataHooksCache.aiLearning = updatedLearning;
                    DataHooksCache.lastUpdate.aiLearning = new Date().toISOString();
                },

                updateCategoryWeight(category, weight) {
                    const updatedLearning = {
                        ...DataHooksCache.aiLearning,
                        categoryWeights: {
                            ...DataHooksCache.aiLearning.categoryWeights,
                            [category]: (DataHooksCache.aiLearning.categoryWeights[category] || 0) + weight
                        },
                        lastUpdated: new Date().toISOString()
                    };
                    LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.AI_LEARNING, updatedLearning);
                    DataHooksCache.aiLearning = updatedLearning;
                    DataHooksCache.lastUpdate.aiLearning = new Date().toISOString();
                },

                updateLearningData(article, rating, isRevert = false) {
                    const updatedLearning = AIScoring.updateLearning(article, rating, DataHooksCache.aiLearning, isRevert);
                    LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.AI_LEARNING, updatedLearning);
                    DataHooksCache.aiLearning = updatedLearning;
                    DataHooksCache.lastUpdate.aiLearning = new Date().toISOString();
                    return updatedLearning;
                }
            };
        },

        useWordFilters() {
            const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.WORD_FILTERS);
            const timestamp = stored ? JSON.parse(stored).timestamp : null;

            if (!DataHooksCache.wordFilters || DataHooksCache.lastUpdate.wordFilters !== timestamp) {
                DataHooksCache.wordFilters = LocalStorageManager.getItem(CONFIG.STORAGE_KEYS.WORD_FILTERS, DEFAULT_DATA.wordFilters);
                DataHooksCache.lastUpdate.wordFilters = timestamp;
            }

            return {
                wordFilters: DataHooksCache.wordFilters,
                addInterestWord(word) {
                    const updated = { ...DataHooksCache.wordFilters };
                    if (WordFilterManager.addWord(word, 'interest', updated)) {
                        LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.WORD_FILTERS, updated);
                        DataHooksCache.wordFilters = updated;
                        DataHooksCache.lastUpdate.wordFilters = new Date().toISOString();
                        return true;
                    }
                    return false;
                },

                addNGWord(word) {
                    const updated = { ...DataHooksCache.wordFilters };
                    if (WordFilterManager.addWord(word, 'ng', updated)) {
                        LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.WORD_FILTERS, updated);
                        DataHooksCache.wordFilters = updated;
                        DataHooksCache.lastUpdate.wordFilters = new Date().toISOString();
                        return true;
                    }
                    return false;
                },

                removeInterestWord(word) {
                    const updated = { ...DataHooksCache.wordFilters };
                    if (WordFilterManager.removeWord(word, 'interest', updated)) {
                        LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.WORD_FILTERS, updated);
                        DataHooksCache.wordFilters = updated;
                        DataHooksCache.lastUpdate.wordFilters = new Date().toISOString();
                        return true;
                    }
                    return false;
                },

                removeNGWord(word) {
                    const updated = { ...DataHooksCache.wordFilters };
                    if (WordFilterManager.removeWord(word, 'ng', updated)) {
                        LocalStorageManager.setItem(CONFIG.STORAGE_KEYS.WORD_FILTERS, updated);
                        DataHooksCache.wordFilters = updated;
                        DataHooksCache.lastUpdate.wordFilters = new Date().toISOString();
                        return true;
                    }
                    return false;
                }
            };
        }
    };

    // ===========================================
    // アプリケーション状態管理
    // ===========================================
    let state = {
        viewMode: 'all',
        selectedFolder: 'all',
        showModal: null,
        articles: [],
        isLoading: false,
        lastUpdate: null
    };

    const setState = newState => {
        state = { ...state, ...newState };
        render();
    };

    const initializeData = () => {
        const articlesData = LocalStorageManager.getItem(CONFIG.STORAGE_KEYS.ARTICLES, DEFAULT_DATA.articles);
        const rssData = LocalStorageManager.getItem(CONFIG.STORAGE_KEYS.RSS_FEEDS, DEFAULT_DATA.rssFeeds);
        const foldersData = LocalStorageManager.getItem(CONFIG.STORAGE_KEYS.FOLDERS, DEFAULT_DATA.folders);
        const aiData = LocalStorageManager.getItem(CONFIG.STORAGE_KEYS.AI_LEARNING, DEFAULT_DATA.aiLearning);
        const wordData = LocalStorageManager.getItem(CONFIG.STORAGE_KEYS.WORD_FILTERS, DEFAULT_DATA.wordFilters);

        Object.assign(DataHooksCache, {
            articles: articlesData,
            rssFeeds: rssData,
            folders: foldersData,
            aiLearning: aiData,
            wordFilters: wordData
        });

        state.articles = articlesData;

        if (state.articles.length === 0) {
            const sampleArticles = [
                {
                    id: 'sample_1',
                    title: 'Minews PWA：フォルダ機能追加完了',
                    url: '#',
                    content: 'RSSフィードをフォルダで分類管理し、記事表示もフォルダでフィルタリングできる機能を追加しました。リスト選択モーダルによりユーザビリティも向上。',
                    publishDate: new Date().toISOString(),
                    rssSource: 'NHKニュース',
                    category: 'Design',
                    readStatus: 'unread',
                    readLater: false,
                    userRating: 0,
                    keywords: ['フォルダ', 'RSS', 'リスト選択', '機能追加']
                },
                {
                    id: 'sample_2',
                    title: 'フォルダ管理で記事整理が便利に',
                    url: '#',
                    content: 'ニュース、テック、ブログなど用途別にRSSフィードを分類。記事表示もフォルダ単位でフィルタリングでき、情報収集効率が大幅向上。',
                    publishDate: new Date(Date.now() - 3600000).toISOString(),
                    rssSource: 'ITmedia',
                    category: 'UX',
                    readStatus: 'unread',
                    readLater: false,
                    userRating: 0,
                    keywords: ['フォルダ管理', '記事整理', '分類', 'フィルタリング', '効率化']
                }
            ];

            const articlesHook = DataHooks.useArticles();
            sampleArticles.forEach(article => articlesHook.addArticle(article));
            state.articles = DataHooksCache.articles;
        }
    };

    // ===========================================
    // ユーティリティ関数
    // ===========================================
    const formatDate = dateString => {
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

    const createStarRating = (rating, articleId) => {
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            const filled = i <= rating ? 'filled' : '';
            stars += `<span class="star ${filled}" onclick="handleStarRating('${articleId}', ${i})">★</span>`;
        }
        return `<div class="star-rating">${stars}</div>`;
    };

    const truncateText = (text, maxLength = 200) =>
        text.length <= maxLength ? text : text.substring(0, maxLength).trim() + '...';

    // XMLエスケープ関数
    const escapeXml = (text) => {
        return text.replace(/[<>&'"]/g, (char) => {
            switch (char) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '"': return '&quot;';
                case "'": return '&#x27;';
                default: return char;
            }
        });
    };

    // ===========================================
    // データ管理機能
    // ===========================================
    // 学習データエクスポート
    const handleExportLearningData = () => {
        const aiHook = DataHooks.useAILearning();
        const wordHook = DataHooks.useWordFilters();

        const exportData = {
            version: CONFIG.DATA_VERSION,
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
    const handleImportLearningData = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importData = JSON.parse(e.target.result);
                if (!importData.aiLearning || !importData.wordFilters) {
                    throw new Error('無効なデータ形式です');
                }

                const aiHook = DataHooks.useAILearning();
                const wordHook = DataHooks.useWordFilters();

                // AI学習データのマージ
                Object.keys(importData.aiLearning.wordWeights || {}).forEach(word => {
                    const weight = importData.aiLearning.wordWeights[word];
                    aiHook.updateWordWeight(word, weight);
                });

                Object.keys(importData.aiLearning.categoryWeights || {}).forEach(category => {
                    const weight = importData.aiLearning.categoryWeights[category];
                    aiHook.updateCategoryWeight(category, weight);
                });

                // ワードフィルターのマージ
                (importData.wordFilters.interestWords || []).forEach(word => {
                    wordHook.addInterestWord(word);
                });

                (importData.wordFilters.ngWords || []).forEach(word => {
                    wordHook.addNGWord(word);
                });

                alert('学習データをインポートしました');
                render();

            } catch (error) {
                alert('インポートに失敗しました: ' + error.message);
            }
        };

        reader.readAsText(file);
        // ファイル選択をリセット
        event.target.value = '';
    };

    // RSSデータエクスポート（OPML形式）
    const handleExportRSSData = () => {
        const rssHook = DataHooks.useRSSManager();
        const foldersHook = DataHooks.useFolders();

        let opmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
    <head>
        <title>Minews RSS Feeds</title>
        <dateCreated>${new Date().toUTCString()}</dateCreated>
    </head>
    <body>
`;

        // フォルダごとにグループ化
        const folderMap = new Map();
        foldersHook.folders.forEach(folder => {
            folderMap.set(folder.id, { ...folder, feeds: [] });
        });

        rssHook.rssFeeds.forEach(feed => {
            const folder = folderMap.get(feed.folderId);
            if (folder) {
                folder.feeds.push(feed);
            }
        });

        folderMap.forEach(folder => {
            if (folder.feeds.length > 0) {
                opmlContent += `        <outline text="${escapeXml(folder.name)}" title="${escapeXml(folder.name)}">\n`;
                folder.feeds.forEach(feed => {
                    opmlContent += `            <outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.url)}" />\n`;
                });
                opmlContent += `        </outline>\n`;
            }
        });

        opmlContent += `    </body>
</opml>`;

        const blob = new Blob([opmlContent], { type: 'text/xml' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `minews_rss_feeds_${new Date().toISOString().split('T')[0]}.opml`;
        link.click();
        alert('RSSフィードをOPML形式でエクスポートしました');
    };

    // RSSデータインポート（OPML形式）
    const handleImportRSSData = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(e.target.result, 'text/xml');

                const parseError = xmlDoc.querySelector('parsererror');
                if (parseError) throw new Error('無効なOPMLファイルです');

                const rssHook = DataHooks.useRSSManager();
                const foldersHook = DataHooks.useFolders();
                let importCount = 0;

                // フォルダ構造のあるOPMLの処理
                const folderOutlines = xmlDoc.querySelectorAll('body > outline');
                folderOutlines.forEach(folderOutline => {
                    const folderName = folderOutline.getAttribute('text') || folderOutline.getAttribute('title') || '未分類';
                    
                    // フォルダを作成
                    const newFolder = foldersHook.addFolder(folderName, CONFIG.FOLDER_COLORS[0].value);
                    const folderId = newFolder ? newFolder.id : 'default-general';

                    // フィード要素を処理
                    const feedOutlines = folderOutline.querySelectorAll('outline[type="rss"]');
                    feedOutlines.forEach(feedOutline => {
                        const url = feedOutline.getAttribute('xmlUrl');
                        const title = feedOutline.getAttribute('text') || feedOutline.getAttribute('title') || 'Unknown Feed';
                        
                        if (url) {
                            rssHook.addRSSFeed(url, title, folderId);
                            importCount++;
                        }
                    });
                });

                // フラット構造のOPMLも処理
                const flatFeeds = xmlDoc.querySelectorAll('body outline[type="rss"]');
                flatFeeds.forEach(feedOutline => {
                    const url = feedOutline.getAttribute('xmlUrl');
                    const title = feedOutline.getAttribute('text') || feedOutline.getAttribute('title') || 'Unknown Feed';
                    
                    if (url) {
                        rssHook.addRSSFeed(url, title, 'default-general');
                        importCount++;
                    }
                });

                alert(`${importCount}件のRSSフィードをインポートしました`);
                render();

            } catch (error) {
                alert('インポートに失敗しました: ' + error.message);
            }
        };

        reader.readAsText(file);
        event.target.value = '';
    };

    // 記事データ全消去
    const handleClearAllData = () => {
        if (!confirm('すべてのデータを削除しますか？この操作は取り消せません。')) return;

        Object.values(CONFIG.STORAGE_KEYS).forEach(key => {
            LocalStorageManager.removeItem(key);
        });

        DataHooksCache.clear();
        location.reload();
    };

    // ストレージ情報表示
    const handleShowStorageInfo = () => {
        const info = LocalStorageManager.getStorageInfo();
        const sizeInMB = (info.totalSize / 1024 / 1024).toFixed(2);
        const availableInMB = (info.available / 1024 / 1024).toFixed(2);
        
        alert(`ストレージ使用状況:
使用量: ${sizeInMB}MB
アイテム数: ${info.itemCount}件
利用可能: ${availableInMB}MB`);
    };

    // ===========================================
    // イベントハンドラー
    // ===========================================
    
    // RSS更新処理
    const handleRefreshFeeds = async () => {
        if (state.isLoading) return;
        
        setState({ isLoading: true });
        const refreshButton = document.querySelector('.refresh-btn');
        if (refreshButton) {
            refreshButton.classList.add('loading');
            refreshButton.disabled = true;
        }

        try {
            const rssHook = DataHooks.useRSSManager();
            const result = await rssHook.fetchAllFeeds();
            
            setState({ 
                isLoading: false,
                lastUpdate: new Date().toISOString()
            });

            // 結果表示
            let message = `更新完了!\n新規記事: ${result.totalAdded}件`;
            if (result.totalErrors > 0) {
                message += `\nエラー: ${result.totalErrors}件`;
            }
            alert(message);

        } catch (error) {
            setState({ isLoading: false });
            alert('更新中にエラーが発生しました: ' + error.message);
        } finally {
            if (refreshButton) {
                refreshButton.classList.remove('loading');
                refreshButton.disabled = false;
            }
        }
    };

    // 星評価処理
    const handleStarRating = (articleId, rating) => {
        const articlesHook = DataHooks.useArticles();
        const aiHook = DataHooks.useAILearning();
        
        const article = articlesHook.articles.find(a => a.id === articleId);
        if (!article) return;

        const oldRating = article.userRating;
        
        // 既存の評価を取り消し
        if (oldRating > 0) {
            aiHook.updateLearningData(article, oldRating, true);
        }
        
        // 新しい評価を適用
        articlesHook.updateArticle(articleId, { userRating: rating });
        if (rating > 0) {
            aiHook.updateLearningData(article, rating);
        }
    };

    // 記事の読み状態変更
    const handleToggleReadStatus = (articleId) => {
        const articlesHook = DataHooks.useArticles();
        const article = articlesHook.articles.find(a => a.id === articleId);
        if (!article) return;

        const newStatus = article.readStatus === 'read' ? 'unread' : 'read';
        articlesHook.updateArticle(articleId, { readStatus: newStatus });
    };

    // 後で読む切り替え
    const handleToggleReadLater = (articleId) => {
        const articlesHook = DataHooks.useArticles();
        const article = articlesHook.articles.find(a => a.id === articleId);
        if (!article) return;

        articlesHook.updateArticle(articleId, { readLater: !article.readLater });
    };

    // 記事削除
    const handleDeleteArticle = (articleId) => {
        if (!confirm('この記事を削除しますか？')) return;
        
        const articlesHook = DataHooks.useArticles();
        articlesHook.removeArticle(articleId);
    };

    // フォルダフィルター変更
    const handleFolderFilterChange = (event) => {
        setState({ selectedFolder: event.target.value });
    };

    // 表示モード変更
    const handleViewModeChange = (event) => {
        setState({ viewMode: event.target.value });
    };

    // ===========================================
    // レンダリング関数
    // ===========================================
    
    const render = () => {
        const app = document.getElementById('app');
        if (!app) return;

        const foldersHook = DataHooks.useFolders();
        const rssHook = DataHooks.useRSSManager();
        const aiHook = DataHooks.useAILearning();
        const wordHook = DataHooks.useWordFilters();

        // 記事フィルタリング
        let filteredArticles = [...state.articles];

        // フォルダフィルター
        if (state.selectedFolder !== 'all') {
            const folderFeeds = rssHook.rssFeeds
                .filter(feed => feed.folderId === state.selectedFolder)
                .map(feed => feed.title);
            
            filteredArticles = filteredArticles.filter(article =>
                folderFeeds.some(feedTitle => 
                    article.rssSource === feedTitle || 
                    article.rssSource.includes(feedTitle)
                )
            );
        }

        // 表示モードフィルター
        if (state.viewMode === 'unread') {
            filteredArticles = filteredArticles.filter(article => article.readStatus === 'unread');
        } else if (state.viewMode === 'read') {
            filteredArticles = filteredArticles.filter(article => article.readStatus === 'read');
        } else if (state.viewMode === 'later') {
            filteredArticles = filteredArticles.filter(article => article.readLater);
        }

        // NGワードフィルター
        filteredArticles = WordFilterManager.filterArticles(filteredArticles, wordHook.wordFilters);

        // AIスコアでソート
        filteredArticles = AIScoring.sortArticlesByScore(filteredArticles, aiHook.aiLearning, wordHook.wordFilters);

        app.innerHTML = `
            <div class="app">
                <nav class="nav">
                    <div class="nav-left">
                        <h1>Minews PWA</h1>
                        ${state.lastUpdate ? `<div class="last-update">最終更新: ${formatDate(state.lastUpdate)}</div>` : ''}
                    </div>
                    
                    <div class="nav-filters">
                        <div class="filter-group">
                            <label for="folder-filter">フォルダ:</label>
                            <select id="folder-filter" class="filter-select" onchange="handleFolderFilterChange(event)">
                                <option value="all" ${state.selectedFolder === 'all' ? 'selected' : ''}>すべて</option>
                                ${foldersHook.folders.map(folder => 
                                    `<option value="${folder.id}" ${state.selectedFolder === folder.id ? 'selected' : ''}>${folder.name}</option>`
                                ).join('')}
                            </select>
                        </div>
                        
                        <div class="filter-group">
                            <label for="view-mode">表示:</label>
                            <select id="view-mode" class="filter-select" onchange="handleViewModeChange(event)">
                                <option value="all" ${state.viewMode === 'all' ? 'selected' : ''}>すべて</option>
                                <option value="unread" ${state.viewMode === 'unread' ? 'selected' : ''}>未読のみ</option>
                                <option value="read" ${state.viewMode === 'read' ? 'selected' : ''}>既読のみ</option>
                                <option value="later" ${state.viewMode === 'later' ? 'selected' : ''}>後で読む</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="nav-actions">
                        <button class="action-btn refresh-btn" onclick="handleRefreshFeeds()" ${state.isLoading ? 'disabled' : ''}>
                            ${state.isLoading ? '更新中...' : '更新'}
                        </button>
                        <button class="action-btn" onclick="setState({showModal: 'rss'})">RSS管理</button>
                        <button class="action-btn" onclick="setState({showModal: 'folders'})">フォルダ管理</button>
                        <button class="action-btn" onclick="setState({showModal: 'words'})">ワード管理</button>
                        <button class="action-btn" onclick="setState({showModal: 'settings'})">設定</button>
                    </div>
                </nav>

                <main class="main-content">
                    ${filteredArticles.length === 0 ? 
                        '<div class="empty-message">表示する記事がありません</div>' :
                        `<div class="article-grid">
                            ${filteredArticles.map(article => `
                                <article class="article-card" data-read-status="${article.readStatus}">
                                    <div class="article-header">
                                        <h3 class="article-title">
                                            <a href="${article.url}" target="_blank" rel="noopener noreferrer">
                                                ${article.title}
                                            </a>
                                        </h3>
                                    </div>
                                    
                                    <div class="article-meta">
                                        <span class="date">${formatDate(article.publishDate)}</span>
                                        <span class="source">${article.rssSource}</span>
                                        <span class="category">${article.category}</span>
                                        <span class="ai-score">AI: ${article.aiScore}点</span>
                                        ${article.userRating > 0 ? `<span class="rating-badge">★${article.userRating}</span>` : ''}
                                    </div>
                                    
                                    <div class="article-content">
                                        ${truncateText(article.content)}
                                    </div>
                                    
                                    ${article.keywords && article.keywords.length > 0 ? `
                                        <div class="article-keywords">
                                            ${article.keywords.map(keyword => 
                                                `<span class="keyword">${keyword}</span>`
                                            ).join('')}
                                        </div>
                                    ` : ''}
                                    
                                    <div class="article-actions">
                                        <button class="simple-btn read-status" onclick="handleToggleReadStatus('${article.id}')">
                                            ${article.readStatus === 'read' ? '未読' : '既読'}
                                        </button>
                                        <button class="simple-btn read-later" data-active="${article.readLater}" onclick="handleToggleReadLater('${article.id}')">
                                            ${article.readLater ? '解除' : '後で'}
                                        </button>
                                        <button class="simple-btn" onclick="handleDeleteArticle('${article.id}')">削除</button>
                                    </div>
                                    
                                    ${createStarRating(article.userRating, article.id)}
                                </article>
                            `).join('')}
                        </div>`
                    }
                </main>

                ${renderModal()}
            </div>
        `;
    };

    const renderModal = () => {
        if (!state.showModal) return '';

        const modalContent = {
            rss: renderRSSModal(),
            folders: renderFoldersModal(),
            words: renderWordsModal(),
            settings: renderSettingsModal()
        };

        return `
            <div class="modal-overlay" onclick="event.target === this && setState({showModal: null})">
                <div class="modal">
                    <div class="modal-header">
                        <h2>${{
                            rss: 'RSS管理',
                            folders: 'フォルダ管理',
                            words: 'ワード管理',
                            settings: '設定'
                        }[state.showModal]}</h2>
                        <button class="modal-close" onclick="setState({showModal: null})">&times;</button>
                    </div>
                    <div class="modal-body">
                        ${modalContent[state.showModal] || ''}
                    </div>
                </div>
            </div>
        `;
    };

    const renderRSSModal = () => {
        const rssHook = DataHooks.useRSSManager();
        const foldersHook = DataHooks.useFolders();

        return `
            <div class="modal-actions">
                <button class="action-btn success" onclick="showAddRSSForm()">RSS追加</button>
                <button class="action-btn" onclick="handleExportRSSData()">エクスポート</button>
                <button class="action-btn" onclick="document.getElementById('rss-import').click()">インポート</button>
                <input type="file" id="rss-import" accept=".opml,.xml" style="display:none" onchange="handleImportRSSData(event)">
            </div>

            <div id="rss-add-form" style="display:none; margin-bottom: 2rem;">
                <h4>新しいRSS追加</h4>
                <div style="margin-bottom: 1rem;">
                    <input type="url" id="rss-url" placeholder="RSS URL" style="width: 100%; padding: 0.5rem; margin-bottom: 0.5rem;">
                    <input type="text" id="rss-title" placeholder="タイトル（任意）" style="width: 100%; padding: 0.5rem; margin-bottom: 0.5rem;">
                    <select id="rss-folder" style="width: 100%; padding: 0.5rem;">
                        ${foldersHook.folders.map(folder => 
                            `<option value="${folder.id}">${folder.name}</option>`
                        ).join('')}
                    </select>
                </div>
                <button class="action-btn success" onclick="addRSSFeed()">追加</button>
                <button class="action-btn" onclick="hideAddRSSForm()">キャンセル</button>
            </div>

            <div class="rss-list">
                ${rssHook.rssFeeds.map(feed => {
                    const folder = foldersHook.folders.find(f => f.id === feed.folderId);
                    return `
                        <div class="rss-item">
                            <div class="rss-info">
                                <strong>${feed.title}</strong>
                                <span class="rss-url">${feed.url}</span>
                                <span class="rss-updated">最終更新: ${formatDate(feed.lastUpdated)}</span>
                                <span class="rss-status ${feed.isActive ? 'active' : 'inactive'}">
                                    ${feed.isActive ? '有効' : '無効'}
                                </span>
                                ${folder ? `<span style="color: ${folder.color};">📁 ${folder.name}</span>` : ''}
                            </div>
                            <div class="rss-actions">
                                <button class="action-btn" onclick="toggleRSSFeed('${feed.id}')">
                                    ${feed.isActive ? '無効化' : '有効化'}
                                </button>
                                <button class="action-btn danger" onclick="deleteRSSFeed('${feed.id}')">削除</button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>

            <div class="rss-help">
                <h4>使い方</h4>
                <ul>
                    <li>RSS URLを入力してフィードを追加</li>
                    <li>フォルダでRSSフィードを分類管理</li>
                    <li>OPML形式でのインポート/エクスポート対応</li>
                    <li>無効化したフィードは更新対象外</li>
                </ul>
            </div>
        `;
    };

    const renderFoldersModal = () => {
        const foldersHook = DataHooks.useFolders();

        return `
            <div class="modal-actions">
                <button class="action-btn success" onclick="showAddFolderForm()">フォルダ追加</button>
            </div>

            <div id="folder-add-form" style="display:none; margin-bottom: 2rem;">
                <h4>新しいフォルダ</h4>
                <div style="margin-bottom: 1rem;">
                    <input type="text" id="folder-name" placeholder="フォルダ名" style="width: 100%; padding: 0.5rem; margin-bottom: 0.5rem;">
                    <select id="folder-color" style="width: 100%; padding: 0.5rem;">
                        ${CONFIG.FOLDER_COLORS.map(color => 
                            `<option value="${color.value}">${color.name}</option>`
                        ).join('')}
                    </select>
                </div>
                <button class="action-btn success" onclick="addFolder()">追加</button>
                <button class="action-btn" onclick="hideAddFolderForm()">キャンセル</button>
            </div>

            <div class="folder-list">
                ${foldersHook.folders.map(folder => `
                    <div class="rss-item">
                        <div class="rss-info">
                            <strong style="color: ${folder.color};">📁 ${folder.name}</strong>
                            <span class="rss-updated">作成日: ${formatDate(folder.createdAt)}</span>
                        </div>
                        <div class="rss-actions">
                            <button class="action-btn danger" onclick="deleteFolder('${folder.id}')">削除</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    };

    const renderWordsModal = () => {
        const wordHook = DataHooks.useWordFilters();

        return `
            <div class="word-section">
                <div class="word-section-header">
                    <h3>興味ワード</h3>
                    <button class="action-btn success" onclick="addInterestWord()">追加</button>
                </div>
                <div class="word-list">
                    ${wordHook.wordFilters.interestWords.map(word => `
                        <span class="word-tag interest">
                            ${word}
                            <button class="word-remove" onclick="removeInterestWord('${word}')">&times;</button>
                        </span>
                    `).join('')}
                </div>
            </div>

            <div class="word-section">
                <div class="word-section-header">
                    <h3>NGワード</h3>
                    <button class="action-btn danger" onclick="addNGWord()">追加</button>
                </div>
                <div class="word-list">
                    ${wordHook.wordFilters.ngWords.map(word => `
                        <span class="word-tag ng">
                            ${word}
                            <button class="word-remove" onclick="removeNGWord('${word}')">&times;</button>
                        </span>
                    `).join('')}
                </div>
            </div>

            <div class="word-help">
                <h4>使い方</h4>
                <ul>
                    <li>興味ワード: 含まれる記事のスコアが上がる</li>
                    <li>NGワード: 含まれる記事は表示されない</li>
                    <li>部分一致で判定される</li>
                </ul>
            </div>
        `;
    };

    const renderSettingsModal = () => {
        return `
            <div class="modal-actions">
                <button class="action-btn" onclick="handleExportLearningData()">学習データエクスポート</button>
                <button class="action-btn" onclick="document.getElementById('learning-import').click()">学習データインポート</button>
                <input type="file" id="learning-import" accept=".json" style="display:none" onchange="handleImportLearningData(event)">
            </div>

            <div class="modal-actions">
                <button class="action-btn" onclick="handleShowStorageInfo()">ストレージ情報</button>
                <button class="action-btn danger" onclick="handleClearAllData()">全データ削除</button>
            </div>

            <div class="rss-help">
                <h4>設定項目</h4>
                <ul>
                    <li>学習データ: AI評価と単語重みの設定</li>
                    <li>ストレージ情報: 使用量とアイテム数の確認</li>
                    <li>全データ削除: すべての設定と記事を削除</li>
                </ul>
            </div>
        `;
    };

    // ===========================================
    // モーダル操作関数
    // ===========================================
    
    window.showAddRSSForm = () => {
        document.getElementById('rss-add-form').style.display = 'block';
    };

    window.hideAddRSSForm = () => {
        document.getElementById('rss-add-form').style.display = 'none';
    };

    window.addRSSFeed = () => {
        const url = document.getElementById('rss-url').value.trim();
        const title = document.getElementById('rss-title').value.trim();
        const folderId = document.getElementById('rss-folder').value;

        if (!url) {
            alert('URLを入力してください');
            return;
        }

        const rssHook = DataHooks.useRSSManager();
        rssHook.addRSSFeed(url, title, folderId);
        
        document.getElementById('rss-url').value = '';
        document.getElementById('rss-title').value = '';
        hideAddRSSForm();
        render();
    };

    window.toggleRSSFeed = (feedId) => {
        const rssHook = DataHooks.useRSSManager();
        const feed = rssHook.rssFeeds.find(f => f.id === feedId);
        if (feed) {
            rssHook.updateRSSFeed(feedId, { isActive: !feed.isActive });
            render();
        }
    };

    window.deleteRSSFeed = (feedId) => {
        if (!confirm('このRSSフィードを削除しますか？')) return;
        
        const rssHook = DataHooks.useRSSManager();
        rssHook.removeRSSFeed(feedId);
        render();
    };

    window.showAddFolderForm = () => {
        document.getElementById('folder-add-form').style.display = 'block';
    };

    window.hideAddFolderForm = () => {
        document.getElementById('folder-add-form').style.display = 'none';
    };

    window.addFolder = () => {
        const name = document.getElementById('folder-name').value.trim();
        const color = document.getElementById('folder-color').value;

        if (!name) {
            alert('フォルダ名を入力してください');
            return;
        }

        const foldersHook = DataHooks.useFolders();
        foldersHook.addFolder(name, color);
        
        document.getElementById('folder-name').value = '';
        hideAddFolderForm();
        render();
    };

    window.deleteFolder = (folderId) => {
        const foldersHook = DataHooks.useFolders();
        const result = foldersHook.removeFolder(folderId);
        
        if (!result.success) {
            alert(`このフォルダには${result.feedCount}個のRSSフィードが含まれているため削除できません。先にRSSフィードを移動または削除してください。`);
            return;
        }
        
        render();
    };

    window.addInterestWord = () => {
        const word = prompt('興味ワードを入力してください:');
        if (!word) return;

        const wordHook = DataHooks.useWordFilters();
        if (wordHook.addInterestWord(word)) {
            render();
        } else {
            alert('すでに登録されています');
        }
    };

    window.removeInterestWord = (word) => {
        const wordHook = DataHooks.useWordFilters();
        wordHook.removeInterestWord(word);
        render();
    };

    window.addNGWord = () => {
        const word = prompt('NGワードを入力してください:');
        if (!word) return;

        const wordHook = DataHooks.useWordFilters();
        if (wordHook.addNGWord(word)) {
            render();
        } else {
            alert('すでに登録されています');
        }
    };

    window.removeNGWord = (word) => {
        const wordHook = DataHooks.useWordFilters();
        wordHook.removeNGWord(word);
        render();
    };

    // ===========================================
    // グローバル関数の公開
    // ===========================================
    window.handleRefreshFeeds = handleRefreshFeeds;
    window.handleStarRating = handleStarRating;
    window.handleToggleReadStatus = handleToggleReadStatus;
    window.handleToggleReadLater = handleToggleReadLater;
    window.handleDeleteArticle = handleDeleteArticle;
    window.handleFolderFilterChange = handleFolderFilterChange;
    window.handleViewModeChange = handleViewModeChange;
    window.handleExportLearningData = handleExportLearningData;
    window.handleImportLearningData = handleImportLearningData;
    window.handleExportRSSData = handleExportRSSData;
    window.handleImportRSSData = handleImportRSSData;
    window.handleClearAllData = handleClearAllData;
    window.handleShowStorageInfo = handleShowStorageInfo;
    window.setState = setState;
    window.DataHooks = DataHooks;

    // ===========================================
    // 初期化
    // ===========================================
    document.addEventListener('DOMContentLoaded', () => {
        initializeData();
        render();
    });

})();
