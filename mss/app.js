// Minews PWA - RSS管理・フォルダ管理統合・完全版
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
            categoryWeights: { 'Technology': 0, 'Development': 0, 'Business': 0, 'Science': 0, 'Design': 0, 'AI': 0, 'Web': 0, 'Mobile': 0 },
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
        lastUpdate: { articles: null, rssFeeds: null, folders: null, aiLearning: null, wordFilters: null },
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

        cleanHtml: html => html ? html.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim() : '',

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
            return [...new Set(text.toLowerCase().replace(/[^\w\sぁ-んァ-ン一-龯]/g, ' ').split(/\s+/).filter(word => word.length > 2 && !stopWords.includes(word)).slice(0, 8))];
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
        calculateScore(article, aiLearning, wordFilters) {
            let score = 0;

            const ageInDays = (Date.now() - new Date(article.publishDate).getTime()) / (1000 * 60 * 60 * 24);
            score += Math.max(0, 10 - ageInDays);

            if (article.keywords && aiLearning.wordWeights) {
                article.keywords.forEach(keyword => {
                    score += aiLearning.wordWeights[keyword] || 0;
                });
            }

            if (article.category && aiLearning.categoryWeights) {
                score += aiLearning.categoryWeights[article.category] || 0;
            }

            if (wordFilters.interestWords && article.title) {
                wordFilters.interestWords.forEach(word => {
                    if (article.title.toLowerCase().includes(word.toLowerCase()) || article.content.toLowerCase().includes(word.toLowerCase())) {
                        score += 20;
                    }
                });
            }

            if (wordFilters.ngWords && article.title) {
                wordFilters.ngWords.forEach(word => {
                    if (article.title.toLowerCase().includes(word.toLowerCase()) || article.content.toLowerCase().includes(word.toLowerCase())) {
                        score -= 50;
                    }
                });
            }

            if (article.userRating > 0) {
                score += (article.userRating - 3) * 10;
            }

            return Math.round(score);
        },

        updateLearning(article, rating, aiLearning, isRevert = false) {
            const weights = [0, -30, -15, 0, 15, 30];
            let weight = weights[rating] || 0;
            if (isRevert) weight = -weight;

            if (article.keywords) {
                article.keywords.forEach(keyword => {
                    aiLearning.wordWeights[keyword] = (aiLearning.wordWeights[keyword] || 0) + weight;
                });
            }

            if (article.category) {
                aiLearning.categoryWeights[article.category] = (aiLearning.categoryWeights[article.category] || 0) + weight;
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
                                lastUpdated: new Date().toISOString(),
                                title: parsed.feedTitle
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
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffMinutes = Math.floor(diffMs / (1000 * 60));

            if (diffMinutes < 60) return `${diffMinutes}分前`;
            if (diffHours < 24) return `${diffHours}時間前`;
            if (diffDays < 7) return `${diffDays}日前`;
            
            return date.toLocaleDateString('ja-JP');
        } catch {
            return '不明';
        }
    };

    const truncateText = (text, maxLength) => text && text.length > maxLength ? text.substring(0, maxLength) + '...' : text || '';

    const createStarRating = (currentRating, articleId) => {
        return `
            <div class="star-rating" data-article-id="${articleId}">
                ${[1,2,3,4,5].map(star => `
                    <span class="star ${star <= currentRating ? 'active' : ''}" data-rating="${star}">★</span>
                `).join('')}
            </div>
        `;
    };

    const showColorSelectionModal = (callback) => {
        const colorOptions = CONFIG.FOLDER_COLORS.map(color => 
            `${color.name}: ${color.value}`
        ).join('\n');
        
        const selectedIndex = prompt(`色を選択してください（番号を入力）:\n${CONFIG.FOLDER_COLORS.map((color, index) => `${index + 1}. ${color.name}`).join('\n')}`);
        const index = parseInt(selectedIndex) - 1;
        
        if (index >= 0 && index < CONFIG.FOLDER_COLORS.length) {
            callback(CONFIG.FOLDER_COLORS[index].value);
        }
    };

    const showFolderSelectionModal = (callback) => {
        const foldersHook = DataHooks.useFolders();
        const folderOptions = [
            'uncategorized: 未分類',
            ...foldersHook.folders.map(folder => `${folder.id}: ${folder.name}`)
        ];
        
        const selection = prompt(`フォルダを選択してください（番号を入力）:\n${folderOptions.map((option, index) => `${index + 1}. ${option.split(':')[1]}`).join('\n')}`);
        const index = parseInt(selection) - 1;
        
        if (index >= 0 && index < folderOptions.length) {
            const folderId = index === 0 ? 'uncategorized' : folderOptions[index].split(':')[0];
            callback(folderId);
        }
    };

    // ===========================================
    // フィルタリング・レンダリング
    // ===========================================
    const getFilteredArticles = () => {
        const aiHook = DataHooks.useAILearning();
        const wordHook = DataHooks.useWordFilters();
        const rssHook = DataHooks.useRSSManager();
        
        const filteredByWords = WordFilterManager.filterArticles(state.articles, wordHook.wordFilters);
        
        let filteredByFolder = filteredByWords;
        if (state.selectedFolder !== 'all') {
            if (state.selectedFolder === 'uncategorized') {
                const uncategorizedFeeds = rssHook.rssFeeds.filter(feed => !feed.folderId || feed.folderId === 'uncategorized');
                filteredByFolder = filteredByWords.filter(article => {
                    return uncategorizedFeeds.some(feed => {
                        const matched = FolderManager.matchArticleToFeed(article, [feed]);
                        return matched !== null;
                    });
                });
            } else {
                const folderFeeds = rssHook.rssFeeds.filter(feed => feed.folderId === state.selectedFolder);
                filteredByFolder = filteredByWords.filter(article => {
                    return folderFeeds.some(feed => {
                        const matched = FolderManager.matchArticleToFeed(article, [feed]);
                        return matched !== null;
                    });
                });
            }
        }
        
        let filteredByMode;
        switch (state.viewMode) {
            case 'unread':
                filteredByMode = filteredByFolder.filter(article => article.readStatus === 'unread');
                break;
            case 'read':
                filteredByMode = filteredByFolder.filter(article => article.readStatus === 'read');
                break;
            case 'readLater':
                filteredByMode = filteredByFolder.filter(article => article.readLater);
                break;
            default:
                filteredByMode = filteredByFolder;
        }
        
        return AIScoring.sortArticlesByScore(filteredByMode, aiHook.aiLearning, wordHook.wordFilters);
    };

    const renderNavigation = () => {
        const modes = [
            { key: 'all', label: 'すべて' },
            { key: 'unread', label: '未読' },
            { key: 'read', label: '既読' },
            { key: 'readLater', label: '後で読む' }
        ];
        
        const foldersHook = DataHooks.useFolders();
        const folderOptions = [
            { id: 'all', name: 'すべて', color: '#4A90A4' },
            { id: 'uncategorized', name: '未分類', color: '#6c757d' },
            ...foldersHook.folders
        ];
        
        const refreshButtonClass = state.isLoading ? 'action-btn refresh-btn loading' : 'action-btn refresh-btn';
        const refreshButtonText = state.isLoading ? '🔄 更新中...' : '🔄 更新';
        
        return `
            <nav class="nav">
                <div class="nav-left">
                    <h1>Minews</h1>
                    ${state.lastUpdate ? `<div class="last-update">最終更新: ${formatDate(state.lastUpdate)}</div>` : ''}
                </div>
                <div class="nav-filters">
                    <div class="filter-group">
                        <label>表示:</label>
                        <select class="filter-select" onchange="handleFilterChange(this.value)">
                            ${modes.map(mode => `
                                <option value="${mode.key}" ${state.viewMode === mode.key ? 'selected' : ''}>
                                    ${mode.label} (${getFilteredArticleCount(mode.key, state.selectedFolder)})
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>フォルダ:</label>
                        <select class="filter-select" onchange="handleFolderChange(this.value)">
                            ${folderOptions.map(folder => `
                                <option value="${folder.id}" ${state.selectedFolder === folder.id ? 'selected' : ''}>
                                    ${folder.name} (${getFilteredArticleCount(state.viewMode, folder.id)})
                                </option>
                            `).join('')}
                        </select>
                    </div>
                </div>
                <div class="nav-actions">
                    <button class="${refreshButtonClass}" onclick="handleRefresh()" ${state.isLoading ? 'disabled' : ''}>
                        ${refreshButtonText}
                    </button>
                    <button class="action-btn" onclick="handleModalOpen('rss')">RSS管理</button>
                    <button class="action-btn" onclick="handleModalOpen('folders')">フォルダ管理</button>
                    <button class="action-btn" onclick="handleModalOpen('words')">ワード管理</button>
                </div>
            </nav>
        `;
    };

    const getFilteredArticleCount = (viewMode, folderId) => {
        const wordHook = DataHooks.useWordFilters();
        const rssHook = DataHooks.useRSSManager();
        
        const filteredByWords = WordFilterManager.filterArticles(state.articles, wordHook.wordFilters);
        
        let filteredByFolder = filteredByWords;
        if (folderId && folderId !== 'all') {
            if (folderId === 'uncategorized') {
                const uncategorizedFeeds = rssHook.rssFeeds.filter(feed => !feed.folderId || feed.folderId === 'uncategorized');
                filteredByFolder = filteredByWords.filter(article => {
                    return uncategorizedFeeds.some(feed => {
                        const matched = FolderManager.matchArticleToFeed(article, [feed]);
                        return matched !== null;
                    });
                });
            } else {
                const folderFeeds = rssHook.rssFeeds.filter(feed => feed.folderId === folderId);
                filteredByFolder = filteredByWords.filter(article => {
                    return folderFeeds.some(feed => {
                        const matched = FolderManager.matchArticleToFeed(article, [feed]);
                        return matched !== null;
                    });
                });
            }
        }
        
        switch (viewMode) {
            case 'unread':
                return filteredByFolder.filter(article => article.readStatus === 'unread').length;
            case 'read':
                return filteredByFolder.filter(article => article.readStatus === 'read').length;
            case 'readLater':
                return filteredByFolder.filter(article => article.readLater).length;
            default:
                return filteredByFolder.length;
        }
    };

    const renderArticleCard = article => {
        const readStatusLabel = article.readStatus === 'read' ? '既読' : '未読';
        const readLaterLabel = article.readLater ? '解除' : '後で読む';
        const scoreDisplay = article.aiScore !== undefined ? `🤖 ${article.aiScore}` : '';
        
        return `
            <div class="article-card" data-read-status="${article.readStatus}">
                <div class="article-header">
                    <div class="article-title">
                        <a href="${article.url}" target="_blank" onclick="handleReadStatusToggle('${article.id}')">${article.title}</a>
                    </div>
                    <div class="article-meta">
                        <span class="date">${formatDate(article.publishDate)}</span>
                        <span class="source">${article.rssSource}</span>
                        <span class="category">${article.category}</span>
                        ${scoreDisplay ? `<span class="ai-score">${scoreDisplay}</span>` : ''}
                        ${article.userRating > 0 ? `<span class="rating-badge">★${article.userRating}</span>` : ''}
                    </div>
                </div>
                <div class="article-content">${article.content}</div>
                ${article.keywords && article.keywords.length > 0 ? `
                    <div class="article-keywords">
                        ${article.keywords.map(keyword => `<span class="keyword">${keyword}</span>`).join('')}
                    </div>
                ` : ''}
                <div class="article-actions">
                    <button class="simple-btn read-status" onclick="handleReadStatusToggle('${article.id}')">${readStatusLabel}</button>
                    <button class="simple-btn read-later" data-active="${article.readLater}" onclick="handleReadLaterToggle('${article.id}')">${readLaterLabel}</button>
                </div>
                ${createStarRating(article.userRating, article.id)}
            </div>
        `;
    };

    // ===========================================
    // RSS管理モーダル（フォルダ統合版）
    // ===========================================
    const renderRSSModal = () => {
        const rssHook = DataHooks.useRSSManager();
        const foldersHook = DataHooks.useFolders();
        
        // フォルダごとにRSSフィードをグループ化
        const groupedFeeds = {
            'uncategorized': rssHook.rssFeeds.filter(feed => !feed.folderId || feed.folderId === 'uncategorized'),
            ...foldersHook.folders.reduce((acc, folder) => {
                acc[folder.id] = rssHook.rssFeeds.filter(feed => feed.folderId === folder.id);
                return acc;
            }, {})
        };
        
        return `
            <div class="modal-overlay">
                <div class="modal">
                    <div class="modal-header">
                        <h2>RSS管理（フォルダ別）</h2>
                        <button class="modal-close" onclick="handleModalClose()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="modal-actions">
                            <button class="action-btn success" onclick="handleRSSAdd()">新しいRSSフィードを追加</button>
                        </div>
                        
                        ${renderFolderGroups(groupedFeeds, foldersHook.folders)}
                    </div>
                </div>
            </div>
        `;
    };

    const renderFolderGroups = (groupedFeeds, folders) => {
        let html = '';
        
        // 未分類フォルダ
        if (groupedFeeds.uncategorized && groupedFeeds.uncategorized.length > 0) {
            html += renderFolderGroup('uncategorized', '未分類', '#6c757d', groupedFeeds.uncategorized);
        }
        
        // 各フォルダ
        folders.forEach(folder => {
            const feeds = groupedFeeds[folder.id] || [];
            html += renderFolderGroup(folder.id, folder.name, folder.color, feeds);
        });
        
        return html;
    };

    const renderFolderGroup = (folderId, folderName, folderColor, feeds) => {
        const feedCount = feeds.length;
        const folderColorName = FolderManager.getColorName(folderColor);
        
        return `
            <div class="folder-group" data-folder-id="${folderId}">
                <div class="folder-group-header" style="border-left: 4px solid ${folderColor};">
                    <div class="folder-info">
                        <h3 style="color: ${folderColor};">
                            📁 ${folderName} 
                            <span class="feed-count">(${feedCount}件)</span>
                        </h3>
                        <div class="folder-actions">
                            ${folderId !== 'uncategorized' ? `
                                <button class="action-btn" onclick="handleFolderEdit('${folderId}')">フォルダ編集</button>
                            ` : ''}
                            <button class="action-btn" onclick="handleFolderRSSBulkActions('${folderId}')">一括操作</button>
                        </div>
                    </div>
                </div>
                <div class="folder-feeds">
                    ${feeds.length === 0 ? `
                        <div class="empty-folder">
                            <p>このフォルダにはRSSフィードがありません</p>
                            <button class="action-btn success" onclick="handleRSSAddToFolder('${folderId}')">このフォルダにRSSを追加</button>
                        </div>
                    ` : feeds.map(feed => renderRSSItem(feed, folderName)).join('')}
                </div>
            </div>
        `;
    };

    const renderRSSItem = (feed, folderName) => {
        const lastUpdated = feed.lastUpdated ? formatDate(feed.lastUpdated) : '未更新';
        const status = feed.isActive ? 'active' : 'inactive';
        
        return `
            <div class="rss-item enhanced">
                <div class="rss-info">
                    <div class="rss-editable-row">
                        <strong onclick="handleRSSEdit('${feed.id}', 'title', '${feed.title.replace(/'/g, "\\'")}')">
                            ${feed.title}
                        </strong>
                    </div>
                    <div class="rss-editable-row">
                        <span class="rss-url" onclick="handleRSSEdit('${feed.id}', 'url', '${feed.url}')">
                            ${truncateText(feed.url, 60)}
                        </span>
                    </div>
                    <div class="rss-meta">
                        <span class="rss-updated">最終更新: ${lastUpdated}</span>
                        <span class="rss-status ${status}">${status === 'active' ? '有効' : '無効'}</span>
                        <span class="rss-folder-info">📁 ${folderName}</span>
                    </div>
                </div>
                <div class="rss-actions">
                    <button class="action-btn" onclick="handleRSSMoveToFolder('${feed.id}')">📁 移動</button>
                    <button class="action-btn" onclick="handleRSSToggleStatus('${feed.id}')">${status === 'active' ? '無効化' : '有効化'}</button>
                    <button class="action-btn danger" onclick="handleRSSRemove('${feed.id}')">削除</button>
                </div>
            </div>
        `;
    };

    const renderFoldersModal = () => {
        const foldersHook = DataHooks.useFolders();
        const rssHook = DataHooks.useRSSManager();
        
        return `
            <div class="modal-overlay">
                <div class="modal">
                    <div class="modal-header">
                        <h2>フォルダ管理</h2>
                        <button class="modal-close" onclick="handleModalClose()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="modal-actions">
                            <button class="action-btn success" onclick="handleFolderAdd()">新しいフォルダを追加</button>
                        </div>
                        <div class="folder-list">
                            ${foldersHook.folders.map(folder => {
                                const feedsInFolder = rssHook.rssFeeds.filter(feed => feed.folderId === folder.id);
                                const colorName = FolderManager.getColorName(folder.color);
                                return `
                                    <div class="folder-item">
                                        <div class="folder-info">
                                            <div class="folder-name" style="color: ${folder.color};">
                                                📁 ${folder.name}
                                            </div>
                                            <div class="folder-meta">
                                                <span class="folder-color">${colorName}</span>
                                                <span class="folder-feeds-count">${feedsInFolder.length}件のRSSフィード</span>
                                                <span class="folder-created">作成: ${formatDate(folder.createdAt)}</span>
                                            </div>
                                        </div>
                                        <div class="folder-actions">
                                            <button class="action-btn danger" onclick="handleFolderRemove('${folder.id}')">削除</button>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    const renderWordsModal = () => {
        const wordHook = DataHooks.useWordFilters();
        
        return `
            <div class="modal-overlay">
                <div class="modal">
                    <div class="modal-header">
                        <h2>ワード管理</h2>
                        <button class="modal-close" onclick="handleModalClose()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="word-section">
                            <div class="word-section-header">
                                <h3>気になるワード</h3>
                                <button class="action-btn success" onclick="handleWordAdd('interest')">追加</button>
                            </div>
                            <div class="word-list">
                                ${wordHook.wordFilters.interestWords.map(word => `
                                    <span class="word-tag interest">
                                        ${word}
                                        <button class="word-remove" onclick="handleWordRemove('${word}', 'interest')">×</button>
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                        
                        <div class="word-section">
                            <div class="word-section-header">
                                <h3>NGワード</h3>
                                <button class="action-btn danger" onclick="handleWordAdd('ng')">追加</button>
                            </div>
                            <div class="word-list">
                                ${wordHook.wordFilters.ngWords.map(word => `
                                    <span class="word-tag ng">
                                        ${word}
                                        <button class="word-remove" onclick="handleWordRemove('${word}', 'ng')">×</button>
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                        
                        <div class="word-help">
                            <h4>ワード機能について</h4>
                            <p><strong>気になるワード:</strong> これらのワードを含む記事のスコアが上がります</p>
                            <p><strong>NGワード:</strong> これらのワードを含む記事は表示されません</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    // ===========================================
    // イベントハンドラー
    // ===========================================
    const handleFilterChange = mode => setState({ viewMode: mode });
    const handleFolderChange = folderId => setState({ selectedFolder: folderId });

    const handleModalOpen = modalType => setState({ showModal: modalType });
    const handleModalClose = () => setState({ showModal: null });

    const handleRefresh = async () => {
        setState({ isLoading: true });
        try {
            const rssHook = DataHooks.useRSSManager();
            const result = await rssHook.fetchAllFeeds();
            setState({ 
                isLoading: false, 
                lastUpdate: new Date().toISOString() 
            });
            
            let message = `更新完了\n- 追加された記事: ${result.totalAdded}件\n- 更新したフィード: ${result.totalFeeds - result.totalErrors}/${result.totalFeeds}件`;
            if (result.totalErrors > 0) {
                message += `\n- エラー: ${result.totalErrors}件`;
            }
            alert(message);
        } catch (error) {
            setState({ isLoading: false });
            alert('更新中にエラーが発生しました: ' + error.message);
        }
    };

    const handleRSSAdd = () => {
        const url = prompt('RSSフィードのURLを入力してください:');
        if (!url) return;
        
        const rssHook = DataHooks.useRSSManager();
        const tempFeed = rssHook.addRSSFeed(url, '... フィード取得中...', 'uncategorized');
        fetchFeedTitleAndUpdate(tempFeed.id, url);
        if (state.showModal === 'rss') render();
    };

    const handleRSSAddToFolder = (folderId) => {
        const url = prompt('RSSフィードのURLを入力してください:');
        if (!url) return;
        
        const rssHook = DataHooks.useRSSManager();
        const tempFeed = rssHook.addRSSFeed(url, '... フィード取得中...', folderId);
        fetchFeedTitleAndUpdate(tempFeed.id, url);
        if (state.showModal === 'rss') render();
    };

    const handleRSSMoveToFolder = (feedId) => {
        showFolderSelectionModal(selectedFolderId => {
            const rssHook = DataHooks.useRSSManager();
            rssHook.updateRSSFeed(feedId, { folderId: selectedFolderId });
            if (state.showModal === 'rss') render();
        });
    };

    const handleRSSToggleStatus = (feedId) => {
        const rssHook = DataHooks.useRSSManager();
        const feed = rssHook.rssFeeds.find(f => f.id === feedId);
        if (feed) {
            rssHook.updateRSSFeed(feedId, { isActive: !feed.isActive });
            if (state.showModal === 'rss') render();
        }
    };

    const handleFolderRSSBulkActions = (folderId) => {
        const rssHook = DataHooks.useRSSManager();
        const folderFeeds = rssHook.rssFeeds.filter(feed => feed.folderId === folderId);
        
        if (folderFeeds.length === 0) {
            alert('このフォルダにはRSSフィードがありません');
            return;
        }
        
        const action = prompt(`フォルダ内の${folderFeeds.length}件のRSSフィードに対する操作を選択してください:\n1. 全て有効化\n2. 全て無効化\n3. 全て削除\n4. 他のフォルダに一括移動\n\n番号を入力してください:`);
        
        switch(action) {
            case '1':
                folderFeeds.forEach(feed => {
                    rssHook.updateRSSFeed(feed.id, { isActive: true });
                });
                alert('全てのRSSフィードを有効化しました');
                break;
            case '2':
                folderFeeds.forEach(feed => {
                    rssHook.updateRSSFeed(feed.id, { isActive: false });
                });
                alert('全てのRSSフィードを無効化しました');
                break;
            case '3':
                if (confirm(`本当にこのフォルダの${folderFeeds.length}件のRSSフィードを全て削除しますか？`)) {
                    folderFeeds.forEach(feed => {
                        rssHook.removeRSSFeed(feed.id);
                    });
                    alert('全てのRSSフィードを削除しました');
                }
                break;
            case '4':
                showFolderSelectionModal(targetFolderId => {
                    folderFeeds.forEach(feed => {
                        rssHook.updateRSSFeed(feed.id, { folderId: targetFolderId });
                    });
                    alert('全てのRSSフィードを移動しました');
                    if (state.showModal === 'rss') render();
                });
                return;
        }
        
        if (state.showModal === 'rss') render();
    };

    const handleFolderEdit = (folderId) => {
        const foldersHook = DataHooks.useFolders();
        const folder = foldersHook.folders.find(f => f.id === folderId);
        if (!folder) return;
        
        const action = prompt(`フォルダ「${folder.name}」の編集:\n1. 名前変更\n2. 色変更\n\n番号を入力してください:`);
        
        switch(action) {
            case '1':
                const newName = prompt('新しいフォルダ名を入力してください:', folder.name);
                if (newName && newName.trim() !== folder.name && newName.trim().length > 0) {
                    if (newName.trim().length > 50) {
                        alert('フォルダ名は50文字以内で入力してください');
                        return;
                    }
                    foldersHook.updateFolder(folderId, { name: newName.trim() });
                    if (state.showModal === 'rss') render();
                }
                break;
            case '2':
                showColorSelectionModal(selectedColor => {
                    foldersHook.updateFolder(folderId, { color: selectedColor });
                    if (state.showModal === 'rss') render();
                });
                break;
        }
    };

    const handleRSSEdit = (feedId, field, currentValue) => {
        const rssHook = DataHooks.useRSSManager();
        const newValue = prompt(`${field === 'title' ? 'タイトル' : 'URL'}を編集:`, currentValue);
        if (newValue && newValue.trim() !== currentValue) {
            rssHook.updateRSSFeed(feedId, { [field]: newValue.trim() });
            if (state.showModal === 'rss') render();
        }
    };

    const handleRSSRemove = (feedId) => {
        if (confirm('このRSSフィードを削除しますか？')) {
            const rssHook = DataHooks.useRSSManager();
            rssHook.removeRSSFeed(feedId);
            if (state.showModal === 'rss') render();
        }
    };

    const handleFolderAdd = () => {
        const name = prompt('フォルダ名を入力してください:');
        if (!name || name.trim().length === 0) return;
        
        if (name.trim().length > 50) {
            alert('フォルダ名は50文字以内で入力してください');
            return;
        }
        
        showColorSelectionModal(selectedColor => {
            const foldersHook = DataHooks.useFolders();
            const newFolder = foldersHook.addFolder(name.trim(), selectedColor);
            if (newFolder) {
                if (state.showModal === 'folders') render();
            } else {
                alert('フォルダの作成に失敗しました');
            }
        });
    };

    const handleFolderRemove = (folderId) => {
        const foldersHook = DataHooks.useFolders();
        const result = foldersHook.removeFolder(folderId);
        
        if (result.success) {
            if (state.showModal === 'folders') render();
        } else if (result.reason === 'FEEDS_EXIST') {
            alert(`このフォルダには${result.feedCount}件のRSSフィードが含まれています。先にRSSフィードを移動または削除してください。`);
        }
    };

    const handleWordAdd = (type) => {
        const word = prompt(`${type === 'interest' ? '気になる' : 'NG'}ワードを入力してください:`);
        if (!word || word.trim().length === 0) return;
        
        const wordHook = DataHooks.useWordFilters();
        const success = type === 'interest' 
            ? wordHook.addInterestWord(word.trim())
            : wordHook.addNGWord(word.trim());
            
        if (success) {
            if (state.showModal === 'words') render();
        } else {
            alert('このワードは既に登録されています');
        }
    };

    const handleWordRemove = (word, type) => {
        if (!confirm(`「${word}」を削除しますか？`)) return;
        
        const wordHook = DataHooks.useWordFilters();
        const success = type === 'interest' 
            ? wordHook.removeInterestWord(word)
            : wordHook.removeNGWord(word);
            
        if (success && state.showModal === 'words') render();
    };

    const handleReadStatusToggle = (articleId) => {
        const articlesHook = DataHooks.useArticles();
        const article = articlesHook.articles.find(a => a.id === articleId);
        if (article) {
            const newStatus = article.readStatus === 'read' ? 'unread' : 'read';
            articlesHook.updateArticle(articleId, { readStatus: newStatus });
        }
    };

    const handleReadLaterToggle = (articleId) => {
        const articlesHook = DataHooks.useArticles();
        const article = articlesHook.articles.find(a => a.id === articleId);
        if (article) {
            articlesHook.updateArticle(articleId, { readLater: !article.readLater });
        }
    };

    const handleStarClick = (e) => {
        const star = e.target;
        const rating = parseInt(star.dataset.rating);
        const ratingContainer = star.closest('.star-rating');
        const articleId = ratingContainer.dataset.articleId;
        
        const articlesHook = DataHooks.useArticles();
        const aiHook = DataHooks.useAILearning();
        const article = articlesHook.articles.find(a => a.id === articleId);
        
        if (article) {
            if (article.userRating > 0) {
                aiHook.updateLearningData(article, article.userRating, true);
            }
            articlesHook.updateArticle(articleId, { userRating: rating });
            aiHook.updateLearningData(article, rating);
        }
    };

    const fetchFeedTitleAndUpdate = async (feedId, url) => {
        try {
            const rssContent = await RSSProcessor.fetchRSS(url);
            const parsed = RSSProcessor.parseRSS(rssContent, url);
            const rssHook = DataHooks.useRSSManager();
            rssHook.updateRSSFeed(feedId, { title: parsed.feedTitle });
            if (state.showModal === 'rss') render();
        } catch (error) {
            const rssHook = DataHooks.useRSSManager();
            rssHook.updateRSSFeed(feedId, { title: `エラー: ${error.message}` });
            if (state.showModal === 'rss') render();
        }
    };

    // ===========================================
    // メインレンダリング関数
    // ===========================================
    const render = () => {
        const filteredArticles = getFilteredArticles();
        
        document.getElementById('root').innerHTML = `
            <div class="app">
                ${renderNavigation()}
                <main class="main-content">
                    ${filteredArticles.length === 0 ? 
                        '<div class="empty-message">表示する記事がありません</div>' :
                        `<div class="article-grid">${filteredArticles.map(renderArticleCard).join('')}</div>`
                    }
                </main>
                ${state.showModal === 'rss' ? renderRSSModal() : ''}
                ${state.showModal === 'folders' ? renderFoldersModal() : ''}
                ${state.showModal === 'words' ? renderWordsModal() : ''}
            </div>
        `;
    };

    // ===========================================
    // アプリケーション初期化
    // ===========================================
    const init = () => {
        try {
            initializeData();
            render();
            
            // イベントリスナー設定
            document.addEventListener('click', (e) => {
                if (e.target.classList.contains('star')) {
                    handleStarClick(e);
                }
            });
            
            console.log('Minews initialized successfully');
        } catch (error) {
            console.error('Initialization failed:', error);
            document.getElementById('root').innerHTML = `
                <div class="app">
                    <div class="error-message">
                        アプリケーションの初期化に失敗しました: ${error.message}
                    </div>
                </div>
            `;
        }
    };

    // DOMContentLoaded時の初期化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // グローバル関数として公開（HTML onclick用）
    window.handleModalOpen = handleModalOpen;
    window.handleModalClose = handleModalClose;
    window.handleRefresh = handleRefresh;
    window.handleRSSAdd = handleRSSAdd;
    window.handleRSSEdit = handleRSSEdit;
    window.handleRSSRemove = handleRSSRemove;
    window.handleRSSAddToFolder = handleRSSAddToFolder;
    window.handleRSSMoveToFolder = handleRSSMoveToFolder;
    window.handleRSSToggleStatus = handleRSSToggleStatus;
    window.handleFolderRSSBulkActions = handleFolderRSSBulkActions;
    window.handleFolderEdit = handleFolderEdit;
    window.handleFolderAdd = handleFolderAdd;
    window.handleFolderRemove = handleFolderRemove;
    window.handleWordAdd = handleWordAdd;
    window.handleWordRemove = handleWordRemove;
    window.handleReadStatusToggle = handleReadStatusToggle;
    window.handleReadLaterToggle = handleReadLaterToggle;
    window.handleFilterChange = handleFilterChange;
    window.handleFolderChange = handleFolderChange;

})();
