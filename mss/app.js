// Minews PWA - 統合設定モーダル対応完全版
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

    // キャッシュシステム
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

    // フォルダ管理
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
            try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
        }
    };

    // RSS処理システム
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
                    headers: { 'Accept': '*/*', 'User-Agent': 'Mozilla/5.0 (compatible; Minews/1.0)' },
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
            return [...new Set(text.toLowerCase().replace(/[^\w\sぁ-んァ-ン一-龯]/g, ' ').split(/\s+/).filter(word => word.length > 2 && !stopWords.includes(word)).slice(0, 8))];
        },

        extractDomain(url) {
            try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Unknown Source'; }
        }
    };

    // AI学習システム
    const AIScoring = {
        calculateScore(article, aiLearning, wordFilters) {
            let score = 0;
            const ageInDays = (Date.now() - new Date(article.publishDate).getTime()) / (1000 * 60 * 60 * 24);
            score += Math.max(0, 10 - ageInDays);

            if (article.keywords && aiLearning.wordWeights) {
                article.keywords.forEach(keyword => { score += aiLearning.wordWeights[keyword] || 0; });
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

    // ワードフィルター管理
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

    // ローカルストレージ管理
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
            try { localStorage.removeItem(key); return true; } catch (error) { return false; }
        },

        migrateData(key, oldData, defaultValue) {
            if (oldData.data) {
                this.setItem(key, oldData.data);
                return oldData.data;
            }
            return defaultValue;
        }
    };

    // データ操作フック
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
                        return { success: false, reason: 'FEEDS_EXIST', feedCount: feedsInFolder.length };
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

    // アプリケーション状態管理（統合設定モーダル対応）
    let state = {
        viewMode: 'all',
        selectedFolder: 'all',
        showModal: null,                    // null | 'settings' | 'rss' | 'words' | 'folders'
        settingsTab: 'rss',                 // 'rss' | 'words' | 'data'
        selectedFolderInSettings: 'all',    // RSS管理用フォルダ選択
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
                    title: 'Minews PWA：統合設定モーダル実装完了',
                    url: '#',
                    content: 'RSS管理・ワード設定・データ管理を1つのモーダルにまとめ、タブ切り替えで各機能にアクセス可能になりました。',
                    publishDate: new Date().toISOString(),
                    rssSource: 'NHKニュース',
                    category: 'Design',
                    readStatus: 'unread',
                    readLater: false,
                    userRating: 0,
                    keywords: ['設定統合', 'タブ', 'UI改善', '機能統合']
                },
                {
                    id: 'sample_2',
                    title: '設定画面のユーザビリティ向上',
                    url: '#',
                    content: '統合設定モーダルにより、全ての管理機能が1画面で操作可能に。RSS・フォルダ・ワード・データ管理が効率化されました。',
                    publishDate: new Date(Date.now() - 3600000).toISOString(),
                    rssSource: 'ITmedia',
                    category: 'UX',
                    readStatus: 'unread',
                    readLater: false,
                    userRating: 0,
                    keywords: ['統合管理', 'ユーザビリティ', '効率化', 'モーダル設計']
                }
            ];

            const articlesHook = DataHooks.useArticles();
            sampleArticles.forEach(article => articlesHook.addArticle(article));
            state.articles = DataHooksCache.articles;
        }
    };

    // ユーティリティ関数
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
            stars += `<span class="star ${filled}" data-rating="${i}" data-article-id="${articleId}">★</span>`;
        }
        return `<div class="star-rating">${stars}</div>`;
    };

    const truncateText = (text, maxLength = 200) => text.length <= maxLength ? text : text.substring(0, maxLength).trim() + '...';

    // 統合設定モーダル（新規実装）
    const renderSettingsModal = () => {
        if (state.showModal !== 'settings') return '';
        
        return `
            <div class="modal-overlay" onclick="handleModalClose()">
                <div class="modal settings-modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>⚙️ 設定</h2>
                        <button class="modal-close" onclick="handleModalClose()">×</button>
                    </div>
                    
                    <!-- タブナビゲーション -->
                    <div class="settings-tabs">
                        <button class="tab-btn ${state.settingsTab === 'rss' ? 'active' : ''}" 
                                onclick="handleSettingsTabChange('rss')">
                            📁 RSS管理
                        </button>
                        <button class="tab-btn ${state.settingsTab === 'words' ? 'active' : ''}" 
                                onclick="handleSettingsTabChange('words')">
                            🔤 ワード設定
                        </button>
                        <button class="tab-btn ${state.settingsTab === 'data' ? 'active' : ''}" 
                                onclick="handleSettingsTabChange('data')">
                            📊 データ管理
                        </button>
                    </div>
                    
                    <!-- タブコンテンツ -->
                    <div class="modal-body">
                        ${renderSettingsTabContent()}
                    </div>
                </div>
            </div>
        `;
    };

    const handleSettingsTabChange = (tabId) => {
        setState({ settingsTab: tabId });
    };

    const renderSettingsTabContent = () => {
        switch (state.settingsTab) {
            case 'rss':
                return renderRSSManagementTab();
            case 'words':
                return renderWordsManagementTab();
            case 'data':
                return renderDataManagementTab();
            default:
                return '<p>タブが見つかりません</p>';
        }
    };

    // 暫定：既存機能をそのまま表示（Phase 2で統合予定）
    const renderRSSManagementTab = () => {
        return `<div class="tab-content-placeholder">
            <h3>📁 RSS管理機能</h3>
            <p>Phase 2で統合RSS・フォルダ管理インターフェイスを実装します</p>
            <p>現在の機能：</p>
            <ul>
                <li>RSS追加・削除</li>
                <li>フォルダ管理</li>
                <li>フィード更新</li>
            </ul>
        </div>`;
    };

    const renderWordsManagementTab = () => {
        return `<div class="tab-content-placeholder">
            <h3>🔤 ワード設定機能</h3>
            <p>既存のワード管理機能をここに移行します</p>
            <p>現在の機能：</p>
            <ul>
                <li>気になるワード管理</li>
                <li>NGワード管理</li>
                <li>フィルタリング設定</li>
            </ul>
        </div>`;
    };

    const renderDataManagementTab = () => {
        return `<div class="tab-content-placeholder">
            <h3>📊 データ管理機能</h3>
            <p>OPML機能とデータ統計をここに実装します</p>
            <p>予定機能：</p>
            <ul>
                <li>OPMLインポート・エクスポート</li>
                <li>データ統計表示</li>
                <li>記事アーカイブ管理</li>
            </ul>
        </div>`;
    };

    // イベントハンドラー
    const handleFilterClick = mode => setState({ viewMode: mode });
    const handleFolderFilterClick = folderId => setState({ selectedFolder: folderId });
    
    // 統合設定モーダル対応（修正版）
    const handleModalOpen = modalType => {
        if (modalType === 'settings') {
            setState({ showModal: 'settings', settingsTab: 'rss' }); // デフォルトはRSSタブ
        } else {
            setState({ showModal: modalType });
        }
    };

    const handleModalClose = () => setState({ showModal: null });

    const handleStarClick = event => {
        if (!event.target.classList.contains('star')) return;

        const rating = parseInt(event.target.dataset.rating);
        const articleId = event.target.dataset.articleId;
        const articlesHook = DataHooks.useArticles();
        const aiHook = DataHooks.useAILearning();
        const article = state.articles.find(a => a.id === articleId);

        if (!article || article.userRating === rating) return;

        if (article.userRating > 0) {
            aiHook.updateLearningData(article, article.userRating, true);
        }

        const updateData = { userRating: rating };
        if (rating === 1 || rating === 2) {
            updateData.readStatus = 'read';
        }

        articlesHook.updateArticle(articleId, updateData);
        aiHook.updateLearningData(article, rating);
    };

    const handleReadStatusToggle = articleId => {
        const articlesHook = DataHooks.useArticles();
        const article = state.articles.find(a => a.id === articleId);
        if (article) {
            const newStatus = article.readStatus === 'read' ? 'unread' : 'read';
            articlesHook.updateArticle(articleId, { readStatus: newStatus });
        }
    };

    const handleReadLaterToggle = articleId => {
        const articlesHook = DataHooks.useArticles();
        const article = state.articles.find(a => a.id === articleId);
        if (article) {
            articlesHook.updateArticle(articleId, { readLater: !article.readLater });
        }
    };

    const handleRefresh = async () => {
        if (state.isLoading) return;

        setState({ isLoading: true });
        try {
            const rssHook = DataHooks.useRSSManager();
            const result = await rssHook.fetchAllFeeds();

            setState({
                isLoading: false,
                lastUpdate: new Date().toISOString()
            });

            let message = `更新完了！${result.totalAdded}件の新記事を追加しました。\n`;
            if (result.feedResults?.length > 0) {
                message += '\n【フィード別結果】\n';
                result.feedResults.forEach(feedResult => {
                    if (feedResult.success) {
                        message += `✅ ${feedResult.name}: ${feedResult.added}/${feedResult.total}件追加\n`;
                    } else {
                        message += `❌ ${feedResult.name}: 取得失敗\n`;
                    }
                });
            }

            if (result.totalErrors > 0) {
                message += `\n${result.totalErrors}件のフィードで取得エラーが発生しました。`;
            }

            alert(message);
        } catch (error) {
            setState({ isLoading: false });
            alert('記事の更新に失敗しました: ' + error.message);
        }
    };

    const handleRSSAdd = () => {
        const url = prompt('RSSフィードのURLを入力してください:');
        if (!url) return;

        showFolderSelectionModal(selectedFolderId => {
            const rssHook = DataHooks.useRSSManager();
            const tempFeed = rssHook.addRSSFeed(url, '... フィード取得中...', selectedFolderId);
            fetchFeedTitleAndUpdate(tempFeed.id, url);
            if (state.showModal === 'rss') render();
        });
    };

    const fetchFeedTitleAndUpdate = async (feedId, url) => {
        try {
            const rssContent = await RSSProcessor.fetchRSS(url);
            const parsed = RSSProcessor.parseRSS(rssContent, url);
            const rssHook = DataHooks.useRSSManager();
            rssHook.updateRSSFeed(feedId, {
                title: parsed.feedTitle || 'タイトル不明',
                lastUpdated: new Date().toISOString()
            });
            if (state.showModal === 'rss') render();
        } catch (error) {
            const rssHook = DataHooks.useRSSManager();
            rssHook.updateRSSFeed(feedId, {
                title: `フィード（${new URL(url).hostname}）`,
                lastUpdated: new Date().toISOString()
            });
            if (state.showModal === 'rss') render();
        }
    };

    const handleRSSEdit = (feedId, field, currentValue) => {
        const rssHook = DataHooks.useRSSManager();
        if (field === 'title') {
            const newTitle = prompt('新しいタイトルを入力してください:', currentValue);
            if (newTitle && newTitle.trim() !== currentValue) {
                rssHook.updateRSSFeed(feedId, { title: newTitle.trim() });
                if (state.showModal === 'rss') render();
            }
        } else if (field === 'url') {
            const newUrl = prompt('新しいURLを入力してください:', currentValue);
            if (newUrl && newUrl.trim() !== currentValue) {
                rssHook.updateRSSFeed(feedId, { url: newUrl.trim() });
                if (state.showModal === 'rss') render();
            }
        } else if (field === 'folder') {
            showFolderSelectionModal(selectedFolderId => {
                rssHook.updateRSSFeed(feedId, { folderId: selectedFolderId });
                if (state.showModal === 'rss') render();
            });
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

    const showFolderSelectionModal = callback => {
        const foldersHook = DataHooks.useFolders();
        const folderOptions = [
            { id: 'uncategorized', name: '未分類', color: '#6c757d' },
            ...foldersHook.folders
        ];

        const modalId = `folder-selection-modal-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        document.querySelectorAll('[id^="folder-selection-modal-"]').forEach(modal => modal.remove());

        const modalHtml = `
            <div id="${modalId}" class="modal-overlay" style="z-index: 1001;">
                <div class="modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>📁 フォルダを選択</h2>
                        <button class="modal-close">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="folder-selection-list">
                            ${folderOptions.map(folder => `
                                <div class="folder-selection-item" data-folder-id="${folder.id}">
                                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                                        <div style="width: 20px; height: 20px; background: ${folder.color}; border-radius: 4px;"></div>
                                        <strong>${folder.name}</strong>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalElement = document.getElementById(modalId);

        modalElement.querySelector('.modal-close').addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            modalElement.remove();
        });

        modalElement.querySelectorAll('.folder-selection-item').forEach(item => {
            item.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const folderId = item.dataset.folderId;
                modalElement.remove();
                callback(folderId);
            });

            item.addEventListener('mouseenter', () => {
                item.style.borderColor = '#4A90A4';
                item.style.background = '#E3F4F7';
            });

            item.addEventListener('mouseleave', () => {
                item.style.borderColor = '#e9ecef';
                item.style.background = 'white';
            });
        });

        modalElement.addEventListener('click', e => {
            if (e.target === modalElement) modalElement.remove();
        });
    };

    const showColorSelectionModal = callback => {
        const modalId = `color-selection-modal-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        document.querySelectorAll('[id^="color-selection-modal-"]').forEach(modal => modal.remove());

        const modalHtml = `
            <div id="${modalId}" class="modal-overlay" style="z-index: 1001;">
                <div class="modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>🎨 カラーを選択</h2>
                        <button class="modal-close">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="color-selection-list">
                            ${CONFIG.FOLDER_COLORS.map(color => `
                                <div class="color-selection-item" data-color-value="${color.value}">
                                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                                        <div style="width: 30px; height: 30px; background: ${color.value}; border-radius: 6px;"></div>
                                        <strong>${color.name}</strong>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalElement = document.getElementById(modalId);

        modalElement.querySelector('.modal-close').addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            modalElement.remove();
        });

        modalElement.querySelectorAll('.color-selection-item').forEach(item => {
            item.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const colorValue = item.dataset.colorValue;
                modalElement.remove();
                callback(colorValue);
            });

            item.addEventListener('mouseenter', () => {
                item.style.borderColor = '#4A90A4';
                item.style.background = '#E3F4F7';
            });

            item.addEventListener('mouseleave', () => {
                item.style.borderColor = '#e9ecef';
                item.style.background = 'white';
            });
        });

        modalElement.addEventListener('click', e => {
            if (e.target === modalElement) modalElement.remove();
        });
    };

    const handleRSSRemove = feedId => {
        if (!confirm('このRSSフィードを削除しますか？')) return;
        const rssHook = DataHooks.useRSSManager();
        rssHook.removeRSSFeed(feedId);
        if (state.showModal === 'rss') render();
    };

    const handleWordAdd = type => {
        const word = prompt(type === 'interest' ? '気になるワードを入力してください:' : 'NGワードを入力してください:');
        if (!word) return;

        const wordHook = DataHooks.useWordFilters();
        const success = type === 'interest' ? wordHook.addInterestWord(word) : wordHook.addNGWord(word);

        if (success) {
            if (state.showModal === 'words') render();
        } else {
            alert('このワードは既に登録されています');
        }
    };

    const handleWordRemove = (word, type) => {
        if (!confirm(`「${word}」を削除しますか？`)) return;

        const wordHook = DataHooks.useWordFilters();
        const success = type === 'interest' ? wordHook.removeInterestWord(word) : wordHook.removeNGWord(word);

        if (success && state.showModal === 'words') render();
    };

    const handleFolderRemove = folderId => {
        const foldersHook = DataHooks.useFolders();
        const folder = foldersHook.folders.find(f => f.id === folderId);
        if (!folder) return;

        if (!confirm(`フォルダ「${folder.name}」を削除しますか？`)) return;

        const result = foldersHook.removeFolder(folderId);
        if (result.success) {
            if (state.selectedFolder === folderId) {
                setState({ selectedFolder: 'all' });
            }
            if (state.showModal === 'folders') render();
        } else if (result.reason === 'FEEDS_EXIST') {
            if (confirm(`このフォルダには${result.feedCount}件のRSSフィードが含まれています。\nフィードを「未分類」に移動してからフォルダを削除しますか？`)) {
                const rssHook = DataHooks.useRSSManager();
                const feedsToMove = rssHook.rssFeeds.filter(feed => feed.folderId === folderId);

                feedsToMove.forEach(feed => {
                    rssHook.updateRSSFeed(feed.id, { folderId: 'uncategorized' });
                });

                const retryResult = foldersHook.removeFolder(folderId);
                if (retryResult.success) {
                    if (state.selectedFolder === folderId) {
                        setState({ selectedFolder: 'all' });
                    }
                    if (state.showModal === 'folders') render();
                    alert(`${feedsToMove.length}件のフィードを「未分類」に移動し、フォルダを削除しました`);
                }
            }
        }
    };

    // フィルタリング・レンダリング
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
                    <h1>📰 Minews</h1>
                    ${state.lastUpdate ? `<div class="last-update">最終更新: ${formatDate(state.lastUpdate)}</div>` : ''}
                </div>
                
                <div class="nav-filters">
                    <div class="filter-group">
                        <label>表示:</label>
                        <select class="filter-select" value="${state.viewMode}" onchange="handleFilterChange(this.value)">
                            ${modes.map(mode => 
                                `<option value="${mode.key}" ${state.viewMode === mode.key ? 'selected' : ''}>
                                    ${mode.label} (${getFilteredArticleCount(mode.key, state.selectedFolder)})
                                </option>`
                            ).join('')}
                        </select>
                    </div>
                    
                    <div class="filter-group">
                        <label>フォルダ:</label>
                        <select class="filter-select" value="${state.selectedFolder}" onchange="handleFolderChange(this.value)">
                            ${folderOptions.map(folder => 
                                `<option value="${folder.id}" ${state.selectedFolder === folder.id ? 'selected' : ''}>
                                    ${folder.name} (${getFilteredArticleCount(state.viewMode, folder.id)})
                                </option>`
                            ).join('')}
                        </select>
                    </div>
                </div>
                
                <!-- 統合設定ボタン（既存デザイン踏襲） -->
                <div class="nav-actions">
                    <button class="${refreshButtonClass}" onclick="handleRefresh()" ${state.isLoading ? 'disabled' : ''}>
                        ${refreshButtonText}
                    </button>
                    <button class="action-btn" onclick="handleModalOpen('settings')">
                        ⚙️ 設定
                    </button>
                </div>
            </nav>
        `;
    };

    const handleFilterChange = mode => setState({ viewMode: mode });
    const handleFolderChange = folderId => setState({ selectedFolder: folderId });

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
                    <h3 class="article-title">
                        <a href="${article.url}" target="_blank" onclick="handleReadStatusToggle('${article.id}')">${article.title}</a>
                    </h3>
                    
                    <div class="article-meta">
                        <span class="date">${formatDate(article.publishDate)}</span>
                        <span class="source">${article.rssSource}</span>
                        <span class="category">${article.category}</span>
                        ${scoreDisplay ? `<span class="ai-score">${scoreDisplay}</span>` : ''}
                        ${article.userRating > 0 ? `<span class="rating-badge">★${article.userRating}</span>` : ''}
                    </div>
                </div>
                
                <div class="article-content">
                    ${truncateText(article.content)}
                </div>
                
                ${article.keywords && article.keywords.length > 0 ? `
                    <div class="article-keywords">
                        ${article.keywords.map(keyword => `<span class="keyword">${keyword}</span>`).join('')}
                    </div>
                ` : ''}
                
                <div class="article-actions">
                    <button class="simple-btn read-status" onclick="handleReadStatusToggle('${article.id}')">
                        ${readStatusLabel}
                    </button>
                    <button class="simple-btn read-later" data-active="${article.readLater}" onclick="handleReadLaterToggle('${article.id}')">
                        ${readLaterLabel}
                    </button>
                </div>
                
                ${createStarRating(article.userRating, article.id)}
            </div>
        `;
    };

    // 既存モーダル関数（Phase 2まで保持）
    const renderRSSModal = () => {
        if (state.showModal !== 'rss') return '';

        const rssHook = DataHooks.useRSSManager();
        const foldersHook = DataHooks.useFolders();

        return `
            <div class="modal-overlay" onclick="handleModalClose()">
                <div class="modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>📡 RSS管理</h2>
                        <button class="modal-close" onclick="handleModalClose()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="modal-actions">
                            <button class="action-btn success" onclick="handleRSSAdd()">➕ RSS追加</button>
                        </div>
                        
                        <div class="rss-list">
                            ${rssHook.rssFeeds.map(feed => {
                                const folder = foldersHook.folders.find(f => f.id === feed.folderId) || 
                                              { name: '未分類', color: '#6c757d' };
                                return `
                                    <div class="rss-item">
                                        <div class="rss-info">
                                            <div class="rss-editable-row">
                                                <strong onclick="handleRSSEdit('${feed.id}', 'title', '${feed.title}')">${feed.title}</strong>
                                            </div>
                                            <div class="rss-editable-row">
                                                <span class="rss-url" onclick="handleRSSEdit('${feed.id}', 'url', '${feed.url}')">${feed.url}</span>
                                            </div>
                                            <div class="rss-editable-row">
                                                <div onclick="handleRSSEdit('${feed.id}', 'folder', '${feed.folderId}')" style="cursor: pointer;">
                                                    📁 フォルダ: 
                                                    <span style="color: ${folder.color}; font-weight: 600;">${folder.name}</span>
                                                </div>
                                            </div>
                                            <span class="rss-updated">最終更新: ${formatDate(feed.lastUpdated)}</span>
                                            <span class="rss-status ${feed.isActive ? 'active' : 'inactive'}">
                                                ${feed.isActive ? 'アクティブ' : '無効'}
                                            </span>
                                        </div>
                                        <div class="rss-actions">
                                            <button class="action-btn danger" onclick="handleRSSRemove('${feed.id}')">削除</button>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                        
                        <div class="rss-help">
                            <h4>RSS管理のヒント</h4>
                            <ul>
                                <li>タイトル・URL・フォルダをクリックすると編集できます</li>
                                <li>フォルダ分類により記事の整理が効率的になります</li>
                                <li>無効なフィードは自動的に非アクティブになります</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    const renderWordsModal = () => {
        if (state.showModal !== 'words') return '';

        const wordHook = DataHooks.useWordFilters();

        return `
            <div class="modal-overlay" onclick="handleModalClose()">
                <div class="modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>🔤 ワード管理</h2>
                        <button class="modal-close" onclick="handleModalClose()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="word-section">
                            <div class="word-section-header">
                                <h3>💚 気になるワード</h3>
                                <button class="action-btn success" onclick="handleWordAdd('interest')">➕ 追加</button>
                            </div>
                            <div class="word-list">
                                ${wordHook.wordFilters.interestWords.map(word => `
                                    <span class="word-tag interest">
                                        ${word}
                                        <button class="word-remove" onclick="handleWordRemove('${word}', 'interest')">×</button>
                                    </span>
                                `).join('')}
                                ${wordHook.wordFilters.interestWords.length === 0 ? '<p class="text-muted">気になるワードが登録されていません</p>' : ''}
                            </div>
                        </div>
                        
                        <div class="word-section">
                            <div class="word-section-header">
                                <h3>🚫 NGワード</h3>
                                <button class="action-btn danger" onclick="handleWordAdd('ng')">➕ 追加</button>
                            </div>
                            <div class="word-list">
                                ${wordHook.wordFilters.ngWords.map(word => `
                                    <span class="word-tag ng">
                                        ${word}
                                        <button class="word-remove" onclick="handleWordRemove('${word}', 'ng')">×</button>
                                    </span>
                                `).join('')}
                                ${wordHook.wordFilters.ngWords.length === 0 ? '<p class="text-muted">NGワードが登録されていません</p>' : ''}
                            </div>
                        </div>
                        
                        <div class="word-help">
                            <h4>ワード管理について</h4>
                            <p><strong>気になるワード:</strong> 含まれる記事のスコアが+20されます</p>
                            <p><strong>NGワード:</strong> 含まれる記事は表示されなくなります</p>
                            <p>両方とも記事のタイトルと内容を対象に判定されます</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    const renderFoldersModal = () => {
        if (state.showModal !== 'folders') return '';

        const foldersHook = DataHooks.useFolders();
        const rssHook = DataHooks.useRSSManager();

        return `
            <div class="modal-overlay" onclick="handleModalClose()">
                <div class="modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>📁 フォルダ管理</h2>
                        <button class="modal-close" onclick="handleModalClose()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="modal-actions">
                            <button class="action-btn success" onclick="handleFolderAdd()">➕ フォルダ追加</button>
                        </div>
                        
                        <div class="rss-list">
                            ${foldersHook.folders.map(folder => {
                                const feedCount = rssHook.rssFeeds.filter(feed => feed.folderId === folder.id).length;
                                return `
                                    <div class="rss-item" style="border-left-color: ${folder.color};">
                                        <div class="rss-info">
                                            <strong style="color: ${folder.color};">${folder.name}</strong>
                                            <span class="rss-url">カラー: ${FolderManager.getColorName(folder.color)}</span>
                                            <span class="rss-updated">作成日: ${formatDate(folder.createdAt)}</span>
                                            <span class="rss-status active">${feedCount}個のフィード</span>
                                        </div>
                                        <div class="rss-actions">
                                            <button class="action-btn danger" onclick="handleFolderRemove('${folder.id}')">削除</button>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                        
                        <div class="rss-help">
                            <h4>フォルダ管理について</h4>
                            <ul>
                                <li>フォルダにはRSSフィードを分類して整理できます</li>
                                <li>削除するフォルダにフィードがある場合、「未分類」に移動されます</li>
                                <li>カラーはフォルダの識別に使用されます</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    // メインレンダリング関数（統合設定モーダル対応）
    const render = () => {
        const filteredArticles = getFilteredArticles();
        
        document.getElementById('root').innerHTML = `
            <div class="app">
                ${renderNavigation()}
                <main class="main-content">
                    ${filteredArticles.length > 0 
                        ? `<div class="article-grid">${filteredArticles.map(renderArticleCard).join('')}</div>` 
                        : '<div class="empty-message">📰 記事がありません</div>'
                    }
                </main>
                ${renderSettingsModal()}
                ${renderRSSModal()}
                ${renderWordsModal()}
                ${renderFoldersModal()}
            </div>
        `;
    };

    // イベントリスナー設定
    document.addEventListener('click', handleStarClick);

    // アプリケーション初期化
    document.addEventListener('DOMContentLoaded', () => {
        initializeData();
        render();
    });

    // 手動初期化（DOM already loaded）
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initializeData();
            render();
        });
    } else {
        initializeData();
        render();
    }

    // =========================================== 
    // グローバル関数公開（HTML onclick用）
    // ===========================================
    window.handleModalOpen = handleModalOpen;
    window.handleModalClose = handleModalClose;
    window.handleSettingsTabChange = handleSettingsTabChange;
    window.handleFilterChange = handleFilterChange;
    window.handleFolderChange = handleFolderChange;
    window.handleRefresh = handleRefresh;
    window.handleStarClick = handleStarClick;
    window.handleReadStatusToggle = handleReadStatusToggle;
    window.handleReadLaterToggle = handleReadLaterToggle;
    window.handleRSSAdd = handleRSSAdd;
    window.handleRSSEdit = handleRSSEdit;
    window.handleRSSRemove = handleRSSRemove;
    window.handleWordAdd = handleWordAdd;
    window.handleWordRemove = handleWordRemove;
    window.handleFolderAdd = handleFolderAdd;
    window.handleFolderRemove = handleFolderRemove;

})(); // ← IIFE終了
