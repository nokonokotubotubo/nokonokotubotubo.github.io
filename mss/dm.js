// Minews PWA - データ管理・処理レイヤー
(function() {
    'use strict';

    // =========================================== 
    // 定数・設定 
    // =========================================== 
    window.CONFIG = {
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

    window.DEFAULT_DATA = {
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
            version: window.CONFIG.DATA_VERSION,
            wordWeights: {},
            categoryWeights: {
                'Technology': 0, 'Development': 0, 'Business': 0, 'Science': 0,
                'Design': 0, 'AI': 0, 'Web': 0, 'Mobile': 0
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
    window.DataHooksCache = {
        articles: null,
        rssFeeds: null,
        folders: null,
        aiLearning: null,
        wordFilters: null,
        lastUpdate: {
            articles: null, rssFeeds: null, folders: null, aiLearning: null, wordFilters: null
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
    window.FolderManager = {
        createFolder: (name, color = '#4A90A4') => ({
            id: `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: name.trim(),
            color,
            createdAt: new Date().toISOString()
        }),
        validateFolder: folder => folder && typeof folder.name === 'string' && folder.name.trim().length > 0 && folder.name.trim().length <= 50,
        getColorName: colorValue => window.CONFIG.FOLDER_COLORS.find(c => c.value === colorValue)?.name || 'カスタム',
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
    window.RSSProcessor = {
        async fetchRSS(url, proxyIndex = 0, retryCount = 0) {
            if (proxyIndex >= window.CONFIG.RSS_PROXY_URLS.length) {
                if (retryCount < window.CONFIG.MAX_RETRIES) {
                    await this.delay(window.CONFIG.RETRY_DELAY);
                    return this.fetchRSS(url, 0, retryCount + 1);
                }
                throw new Error('All proxy servers failed after retries');
            }

            const proxyUrl = window.CONFIG.RSS_PROXY_URLS[proxyIndex];
            const fullUrl = proxyUrl + encodeURIComponent(url);

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), window.CONFIG.REQUEST_TIMEOUT);
                
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

        extractKeywords(text) {
            const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'は', 'が', 'を', 'に', 'で', 'と', 'の', 'から', 'まで', 'について', 'という', 'など'];
            return [...new Set(
                text.toLowerCase()
                    .replace(/[^\w\sぁ-んァ-ン一-龯ー]/g, ' ')
                    .split(/[\s,、。・\-･▪▫◦‣⁃\u3000]/)
                    .filter(word => word.length > 2 && !stopWords.includes(word) && word !== 'ー')
                    .slice(0, 8)
            )];
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
    window.AIScoring = {
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
    window.WordFilterManager = {
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
    window.LocalStorageManager = {
        setItem(key, data) {
            try {
                const serializedData = JSON.stringify({
                    data,
                    timestamp: new Date().toISOString(),
                    version: window.CONFIG.DATA_VERSION
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
                if (parsed.version !== window.CONFIG.DATA_VERSION) {
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
    window.DataHooks = {
        useArticles() {
            const stored = localStorage.getItem(window.CONFIG.STORAGE_KEYS.ARTICLES);
            const timestamp = stored ? JSON.parse(stored).timestamp : null;

            if (!window.DataHooksCache.articles || window.DataHooksCache.lastUpdate.articles !== timestamp) {
                window.DataHooksCache.articles = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.ARTICLES, window.DEFAULT_DATA.articles);
                window.DataHooksCache.lastUpdate.articles = timestamp;
            }

            return {
                articles: window.DataHooksCache.articles,
                addArticle(newArticle) {
                    const updatedArticles = [...window.DataHooksCache.articles];
                    const exists = updatedArticles.find(article =>
                        article.id === newArticle.id ||
                        article.url === newArticle.url ||
                        (article.title === newArticle.title && article.rssSource === newArticle.rssSource)
                    );

                    if (exists) return false;

                    if (updatedArticles.length >= window.CONFIG.MAX_ARTICLES) {
                        updatedArticles.sort((a, b) => {
                            const aScore = (a.readStatus === 'read' && a.userRating === 0) ? 1 : 0;
                            const bScore = (b.readStatus === 'read' && b.userRating === 0) ? 1 : 0;
                            if (aScore !== bScore) return bScore - aScore;
                            return new Date(a.publishDate) - new Date(b.publishDate);
                        });
                        updatedArticles.pop();
                    }

                    updatedArticles.unshift(newArticle);
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
                    window.DataHooksCache.articles = updatedArticles;
                    window.DataHooksCache.lastUpdate.articles = new Date().toISOString();
                    if (window.state) {
                        window.state.articles = updatedArticles;
                    }
                    return true;
                },

                updateArticle(articleId, updates) {
                    const updatedArticles = window.DataHooksCache.articles.map(article =>
                        article.id === articleId ? { ...article, ...updates } : article
                    );
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
                    window.DataHooksCache.articles = updatedArticles;
                    window.DataHooksCache.lastUpdate.articles = new Date().toISOString();
                    if (window.state) {
                        window.state.articles = updatedArticles;
                    }
                    if (window.render) {
                        window.render();
                    }
                },

                removeArticle(articleId) {
                    const updatedArticles = window.DataHooksCache.articles.filter(article => article.id !== articleId);
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
                    window.DataHooksCache.articles = updatedArticles;
                    window.DataHooksCache.lastUpdate.articles = new Date().toISOString();
                    if (window.state) {
                        window.state.articles = updatedArticles;
                    }
                    if (window.render) {
                        window.render();
                    }
                },

                bulkUpdateArticles(articleIds, updates) {
                    const updatedArticles = window.DataHooksCache.articles.map(article =>
                        articleIds.includes(article.id) ? { ...article, ...updates } : article
                    );
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
                    window.DataHooksCache.articles = updatedArticles;
                    window.DataHooksCache.lastUpdate.articles = new Date().toISOString();
                    if (window.state) {
                        window.state.articles = updatedArticles;
                    }
                    if (window.render) {
                        window.render();
                    }
                }
            };
        },

        useRSSManager() {
            const stored = localStorage.getItem(window.CONFIG.STORAGE_KEYS.RSS_FEEDS);
            const timestamp = stored ? JSON.parse(stored).timestamp : null;

            if (!window.DataHooksCache.rssFeeds || window.DataHooksCache.lastUpdate.rssFeeds !== timestamp) {
                window.DataHooksCache.rssFeeds = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.RSS_FEEDS, window.DEFAULT_DATA.rssFeeds);
                window.DataHooksCache.lastUpdate.rssFeeds = timestamp;
            }

            return {
                rssFeeds: window.DataHooksCache.rssFeeds,
                addRSSFeed(url, title, folderId = 'uncategorized') {
                    const newFeed = {
                        id: `rss_${Date.now()}`,
                        url,
                        title: title || 'Unknown Feed',
                        folderId,
                        lastUpdated: new Date().toISOString(),
                        isActive: true
                    };
                    const updatedFeeds = [...window.DataHooksCache.rssFeeds, newFeed];
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.RSS_FEEDS, updatedFeeds);
                    window.DataHooksCache.rssFeeds = updatedFeeds;
                    window.DataHooksCache.lastUpdate.rssFeeds = new Date().toISOString();
                    return newFeed;
                },

                removeRSSFeed(feedId) {
                    const updatedFeeds = window.DataHooksCache.rssFeeds.filter(feed => feed.id !== feedId);
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.RSS_FEEDS, updatedFeeds);
                    window.DataHooksCache.rssFeeds = updatedFeeds;
                    window.DataHooksCache.lastUpdate.rssFeeds = new Date().toISOString();
                },

                updateRSSFeed(feedId, updates) {
                    const updatedFeeds = window.DataHooksCache.rssFeeds.map(feed =>
                        feed.id === feedId ? { ...feed, ...updates } : feed
                    );
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.RSS_FEEDS, updatedFeeds);
                    window.DataHooksCache.rssFeeds = updatedFeeds;
                    window.DataHooksCache.lastUpdate.rssFeeds = new Date().toISOString();
                },

                async fetchAllFeeds() {
                    const articlesHook = window.DataHooks.useArticles();
                    let totalAdded = 0;
                    let totalErrors = 0;
                    let feedResults = [];

                    for (const feed of window.DataHooksCache.rssFeeds.filter(f => f.isActive)) {
                        try {
                            const rssContent = await window.RSSProcessor.fetchRSS(feed.url);
                            const parsed = window.RSSProcessor.parseRSS(rssContent, feed.url);
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
                        totalFeeds: window.DataHooksCache.rssFeeds.filter(f => f.isActive).length,
                        feedResults
                    };
                }
            };
        },

        useFolders() {
            const stored = localStorage.getItem(window.CONFIG.STORAGE_KEYS.FOLDERS);
            const timestamp = stored ? JSON.parse(stored).timestamp : null;

            if (!window.DataHooksCache.folders || window.DataHooksCache.lastUpdate.folders !== timestamp) {
                window.DataHooksCache.folders = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.FOLDERS, window.DEFAULT_DATA.folders);
                window.DataHooksCache.lastUpdate.folders = timestamp;
            }

            return {
                folders: window.DataHooksCache.folders,
                addFolder(name, color) {
                    const newFolder = window.FolderManager.createFolder(name, color);
                    if (!window.FolderManager.validateFolder(newFolder)) return null;
                    const updatedFolders = [...window.DataHooksCache.folders, newFolder];
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.FOLDERS, updatedFolders);
                    window.DataHooksCache.folders = updatedFolders;
                    window.DataHooksCache.lastUpdate.folders = new Date().toISOString();
                    return newFolder;
                },

                removeFolder(folderId) {
                    const rssHook = window.DataHooks.useRSSManager();
                    const feedsInFolder = rssHook.rssFeeds.filter(feed => feed.folderId === folderId);
                    if (feedsInFolder.length > 0) {
                        return {
                            success: false,
                            reason: 'FEEDS_EXIST',
                            feedCount: feedsInFolder.length
                        };
                    }
                    const updatedFolders = window.DataHooksCache.folders.filter(folder => folder.id !== folderId);
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.FOLDERS, updatedFolders);
                    window.DataHooksCache.folders = updatedFolders;
                    window.DataHooksCache.lastUpdate.folders = new Date().toISOString();
                    return { success: true };
                },

                updateFolder(folderId, updates) {
                    const updatedFolders = window.DataHooksCache.folders.map(folder =>
                        folder.id === folderId ? { ...folder, ...updates } : folder
                    );
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.FOLDERS, updatedFolders);
                    window.DataHooksCache.folders = updatedFolders;
                    window.DataHooksCache.lastUpdate.folders = new Date().toISOString();
                }
            };
        },

        useAILearning() {
            const stored = localStorage.getItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING);
            const timestamp = stored ? JSON.parse(stored).timestamp : null;

            if (!window.DataHooksCache.aiLearning || window.DataHooksCache.lastUpdate.aiLearning !== timestamp) {
                window.DataHooksCache.aiLearning = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, window.DEFAULT_DATA.aiLearning);
                window.DataHooksCache.lastUpdate.aiLearning = timestamp;
            }

            return {
                aiLearning: window.DataHooksCache.aiLearning,
                updateWordWeight(word, weight) {
                    const updatedLearning = {
                        ...window.DataHooksCache.aiLearning,
                        wordWeights: {
                            ...window.DataHooksCache.aiLearning.wordWeights,
                            [word]: (window.DataHooksCache.aiLearning.wordWeights[word] || 0) + weight
                        },
                        lastUpdated: new Date().toISOString()
                    };
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, updatedLearning);
                    window.DataHooksCache.aiLearning = updatedLearning;
                    window.DataHooksCache.lastUpdate.aiLearning = new Date().toISOString();
                },

                updateCategoryWeight(category, weight) {
                    const updatedLearning = {
                        ...window.DataHooksCache.aiLearning,
                        categoryWeights: {
                            ...window.DataHooksCache.aiLearning.categoryWeights,
                            [category]: (window.DataHooksCache.aiLearning.categoryWeights[category] || 0) + weight
                        },
                        lastUpdated: new Date().toISOString()
                    };
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, updatedLearning);
                    window.DataHooksCache.aiLearning = updatedLearning;
                    window.DataHooksCache.lastUpdate.aiLearning = new Date().toISOString();
                },

                updateLearningData(article, rating, isRevert = false) {
                    const updatedLearning = window.AIScoring.updateLearning(article, rating, window.DataHooksCache.aiLearning, isRevert);
                    window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, updatedLearning);
                    window.DataHooksCache.aiLearning = updatedLearning;
                    window.DataHooksCache.lastUpdate.aiLearning = new Date().toISOString();
                    return updatedLearning;
                }
            };
        },

        useWordFilters() {
            const stored = localStorage.getItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS);
            const timestamp = stored ? JSON.parse(stored).timestamp : null;

            if (!window.DataHooksCache.wordFilters || window.DataHooksCache.lastUpdate.wordFilters !== timestamp) {
                window.DataHooksCache.wordFilters = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, window.DEFAULT_DATA.wordFilters);
                window.DataHooksCache.lastUpdate.wordFilters = timestamp;
            }

            return {
                wordFilters: window.DataHooksCache.wordFilters,
                addInterestWord(word) {
                    const updated = { ...window.DataHooksCache.wordFilters };
                    if (window.WordFilterManager.addWord(word, 'interest', updated)) {
                        window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, updated);
                        window.DataHooksCache.wordFilters = updated;
                        window.DataHooksCache.lastUpdate.wordFilters = new Date().toISOString();
                        return true;
                    }
                    return false;
                },

                addNGWord(word) {
                    const updated = { ...window.DataHooksCache.wordFilters };
                    if (window.WordFilterManager.addWord(word, 'ng', updated)) {
                        window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, updated);
                        window.DataHooksCache.wordFilters = updated;
                        window.DataHooksCache.lastUpdate.wordFilters = new Date().toISOString();
                        return true;
                    }
                    return false;
                },

                removeInterestWord(word) {
                    const updated = { ...window.DataHooksCache.wordFilters };
                    if (window.WordFilterManager.removeWord(word, 'interest', updated)) {
                        window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, updated);
                        window.DataHooksCache.wordFilters = updated;
                        window.DataHooksCache.lastUpdate.wordFilters = new Date().toISOString();
                        return true;
                    }
                    return false;
                },

                removeNGWord(word) {
                    const updated = { ...window.DataHooksCache.wordFilters };
                    if (window.WordFilterManager.removeWord(word, 'ng', updated)) {
                        window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, updated);
                        window.DataHooksCache.wordFilters = updated;
                        window.DataHooksCache.lastUpdate.wordFilters = new Date().toISOString();
                        return true;
                    }
                    return false;
                }
            };
        }
    };

})();
