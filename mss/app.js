// Minews PWA - UI改善版
(function() {
    'use strict';

    // ===========================================
    // データ型定義・定数（改良版）
    // ===========================================

    const STORAGE_KEYS = {
        ARTICLES: 'minews_articles',
        RSS_FEEDS: 'minews_rssFeeds', 
        AI_LEARNING: 'minews_aiLearning',
        WORD_FILTERS: 'minews_wordFilters'
    };

    const MAX_ARTICLES = 1000;
    const DATA_VERSION = '1.0';
    const RSS_PROXY_URLS = [
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://api.allorigins.win/get?url=',
        'https://thingproxy.freeboard.io/fetch/',
        'https://corsproxy.io/?'
    ];
    const REQUEST_TIMEOUT = 15000;
    const MAX_RETRIES = 2;
    const RETRY_DELAY = 3000;

    // デフォルトデータ
    const DEFAULT_DATA = {
        articles: [],
        rssFeeds: [
            {
                id: 'default-nhk',
                url: 'https://www3.nhk.or.jp/rss/news/cat0.xml',
                title: 'NHKニュース',
                lastUpdated: new Date().toISOString(),
                isActive: true
            },
            {
                id: 'default-itmedia',
                url: 'https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml',
                title: 'ITmedia',
                lastUpdated: new Date().toISOString(),
                isActive: true
            }
        ],
        aiLearning: {
            version: DATA_VERSION,
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
    // RSS取得・解析システム（継承）
    // ===========================================

    const RSSProcessor = {
        fetchRSS: async function(url, proxyIndex = 0, retryCount = 0) {
            if (proxyIndex >= RSS_PROXY_URLS.length) {
                if (retryCount < MAX_RETRIES) {
                    console.log(`[RSS] Retrying from first proxy (attempt ${retryCount + 1})`);
                    await this.delay(RETRY_DELAY);
                    return this.fetchRSS(url, 0, retryCount + 1);
                }
                throw new Error('All proxy servers failed after retries');
            }

            const proxyUrl = RSS_PROXY_URLS[proxyIndex];
            const fullUrl = proxyUrl + encodeURIComponent(url);
            
            console.log(`[RSS] Fetching via proxy ${proxyIndex + 1} (${proxyUrl.split('?')[0]}):`, url);

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

                const response = await fetch(fullUrl, {
                    signal: controller.signal,
                    headers: {
                        'Accept': '*/*',
                        'User-Agent': 'Mozilla/5.0 (compatible; Minews/1.0)',
                    },
                    mode: 'cors'
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                let xmlContent;
                
                if (proxyUrl.includes('allorigins.win')) {
                    const data = await response.json();
                    xmlContent = data.contents;
                    if (!xmlContent) throw new Error('No contents in allorigins.win response');
                } else if (proxyUrl.includes('codetabs.com')) {
                    xmlContent = await response.text();
                } else if (proxyUrl.includes('thingproxy.freeboard.io')) {
                    xmlContent = await response.text();
                } else {
                    const contentType = response.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) {
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

                if (!xmlContent || xmlContent.trim().length === 0) {
                    throw new Error('Empty response content');
                }

                console.log(`[RSS] Successfully fetched via proxy ${proxyIndex + 1}`);
                return xmlContent;

            } catch (error) {
                console.warn(`[RSS] Proxy ${proxyIndex + 1} failed:`, error.message);
                
                if (error.name === 'AbortError') {
                    console.warn(`[RSS] Request timeout for proxy ${proxyIndex + 1}`);
                }
                
                return this.fetchRSS(url, proxyIndex + 1, retryCount);
            }
        },

        delay: function(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        parseRSS: function(xmlString, sourceUrl) {
            try {
                const cleanXml = xmlString.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
                
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(cleanXml, 'text/xml');

                const parseError = xmlDoc.querySelector('parsererror');
                if (parseError) {
                    console.error('[RSS] XML Parse Error:', parseError.textContent);
                    throw new Error('XML parse error: ' + parseError.textContent);
                }

                const articles = [];
                let feedTitle = 'Unknown Feed';

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

                console.log(`[RSS] Parsed ${articles.length} articles from ${feedTitle}`);
                return { articles, feedTitle };
            } catch (error) {
                console.error('[RSS] Parse error:', error);
                throw new Error('Failed to parse RSS feed: ' + error.message);
            }
        },

        parseRSSItem: function(item, sourceUrl) {
            try {
                const title = this.getTextContent(item, ['title']);
                const link = this.getTextContent(item, ['link', 'guid']) || 
                           item.getAttribute('rdf:about');
                const description = this.getTextContent(item, [
                    'description', 'content:encoded', 'content', 'summary'
                ]);
                const pubDate = this.getTextContent(item, ['pubDate', 'date']);
                const category = this.getTextContent(item, ['category', 'subject']) || 'General';

                if (!title || !link) {
                    console.warn('[RSS] Skipping item: missing title or link');
                    return null;
                }

                const cleanDescription = description ? 
                    this.cleanHtml(description).substring(0, 300) : 
                    '記事の概要は提供されていません';

                const keywords = this.extractKeywords(title + ' ' + cleanDescription);

                const article = {
                    id: 'rss_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                    title: this.cleanHtml(title).trim(),
                    url: link.trim(),
                    content: cleanDescription,
                    publishDate: this.parseDate(pubDate),
                    rssSource: this.extractDomain(sourceUrl),
                    category: this.cleanHtml(category).trim(),
                    readStatus: 'unread',
                    readLater: false,
                    userRating: 0,
                    keywords: keywords,
                    fetchedAt: new Date().toISOString()
                };

                return article;
            } catch (error) {
                console.error('[RSS] Error parsing RSS item:', error);
                return null;
            }
        },

        parseAtomEntry: function(entry, sourceUrl) {
            try {
                const title = this.getTextContent(entry, ['title']);
                const link = entry.querySelector('link')?.getAttribute('href') || 
                           this.getTextContent(entry, ['id']);
                const content = this.getTextContent(entry, [
                    'content', 'summary', 'description'
                ]);
                const published = this.getTextContent(entry, ['published', 'updated']);
                const category = entry.querySelector('category')?.getAttribute('term') || 
                               entry.querySelector('category')?.textContent || 'General';

                if (!title || !link) {
                    console.warn('[RSS] Skipping Atom entry: missing title or link');
                    return null;
                }

                const cleanContent = content ? 
                    this.cleanHtml(content).substring(0, 300) : 
                    '記事の概要は提供されていません';

                const keywords = this.extractKeywords(title + ' ' + cleanContent);

                const article = {
                    id: 'atom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                    title: this.cleanHtml(title).trim(),
                    url: link.trim(),
                    content: cleanContent,
                    publishDate: this.parseDate(published),
                    rssSource: this.extractDomain(sourceUrl),
                    category: this.cleanHtml(category).trim(),
                    readStatus: 'unread',
                    readLater: false,
                    userRating: 0,
                    keywords: keywords,
                    fetchedAt: new Date().toISOString()
                };

                return article;
            } catch (error) {
                console.error('[RSS] Error parsing Atom entry:', error);
                return null;
            }
        },

        getTextContent: function(element, selectors) {
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
                        if (el && el.textContent) {
                            result = el.textContent.trim();
                        }
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

        cleanHtml: function(html) {
            if (!html) return '';
            return html.replace(/<[^>]*>/g, '')
                      .replace(/&lt;/g, '<')
                      .replace(/&gt;/g, '>')
                      .replace(/&amp;/g, '&')
                      .replace(/&quot;/g, '"')
                      .replace(/&#039;/g, "'")
                      .replace(/\s+/g, ' ')
                      .trim();
        },

        parseDate: function(dateString) {
            if (!dateString) return new Date().toISOString();
            
            try {
                const date = new Date(dateString);
                if (isNaN(date.getTime())) {
                    return new Date().toISOString();
                }
                return date.toISOString();
            } catch {
                return new Date().toISOString();
            }
        },

        extractKeywords: function(text) {
            const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 
                             'は', 'が', 'を', 'に', 'で', 'と', 'の', 'から', 'まで', 'について', 'という', 'など'];
            
            const words = text.toLowerCase()
                             .replace(/[^\w\sぁ-んァ-ン一-龯]/g, ' ')
                             .split(/\s+/)
                             .filter(word => word.length > 2 && !stopWords.includes(word))
                             .slice(0, 8);
            
            return [...new Set(words)];
        },

        extractDomain: function(url) {
            try {
                const urlObj = new URL(url);
                return urlObj.hostname.replace(/^www\./, '');
            } catch {
                return 'Unknown Source';
            }
        }
    };

    // ===========================================
    // AI学習・スコアリングシステム（継承）
    // ===========================================

    const AIScoring = {
        calculateScore: function(article, aiLearning, wordFilters) {
            let score = 0;

            const ageInDays = (Date.now() - new Date(article.publishDate).getTime()) / (1000 * 60 * 60 * 24);
            score += Math.max(0, 10 - ageInDays);

            if (article.keywords && aiLearning.wordWeights) {
                article.keywords.forEach(keyword => {
                    const weight = aiLearning.wordWeights[keyword] || 0;
                    score += weight;
                });
            }

            if (article.category && aiLearning.categoryWeights) {
                const categoryWeight = aiLearning.categoryWeights[article.category] || 0;
                score += categoryWeight;
            }

            if (wordFilters.interestWords && article.title) {
                wordFilters.interestWords.forEach(word => {
                    if (article.title.toLowerCase().includes(word.toLowerCase()) ||
                        article.content.toLowerCase().includes(word.toLowerCase())) {
                        score += 20;
                    }
                });
            }

            if (wordFilters.ngWords && article.title) {
                wordFilters.ngWords.forEach(word => {
                    if (article.title.toLowerCase().includes(word.toLowerCase()) ||
                        article.content.toLowerCase().includes(word.toLowerCase())) {
                        score -= 50;
                    }
                });
            }

            if (article.userRating > 0) {
                score += (article.userRating - 3) * 10;
            }

            return Math.round(score);
        },

        updateLearning: function(article, rating, aiLearning) {
            const weights = [0, -30, -15, 0, 15, 30];
            const weight = weights[rating] || 0;

            if (article.keywords) {
                article.keywords.forEach(keyword => {
                    aiLearning.wordWeights[keyword] = (aiLearning.wordWeights[keyword] || 0) + weight;
                });
            }

            if (article.category) {
                aiLearning.categoryWeights[article.category] = (aiLearning.categoryWeights[article.category] || 0) + weight;
            }

            aiLearning.lastUpdated = new Date().toISOString();
            
            console.log(`[AI] Learning updated for rating ${rating}, weight: ${weight}`);
            return aiLearning;
        },

        sortArticlesByScore: function(articles, aiLearning, wordFilters) {
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
    // ワードフィルター管理システム（継承）
    // ===========================================

    const WordFilterManager = {
        addWord: function(word, type, wordFilters) {
            word = word.trim().toLowerCase();
            if (!word) return false;

            if (type === 'interest') {
                if (!wordFilters.interestWords.includes(word)) {
                    wordFilters.interestWords.push(word);
                    wordFilters.lastUpdated = new Date().toISOString();
                    console.log('[WordFilter] Added interest word:', word);
                    return true;
                }
            } else if (type === 'ng') {
                if (!wordFilters.ngWords.includes(word)) {
                    wordFilters.ngWords.push(word);
                    wordFilters.lastUpdated = new Date().toISOString();
                    console.log('[WordFilter] Added NG word:', word);
                    return true;
                }
            }
            return false;
        },

        removeWord: function(word, type, wordFilters) {
            word = word.trim().toLowerCase();
            
            if (type === 'interest') {
                const index = wordFilters.interestWords.indexOf(word);
                if (index > -1) {
                    wordFilters.interestWords.splice(index, 1);
                    wordFilters.lastUpdated = new Date().toISOString();
                    console.log('[WordFilter] Removed interest word:', word);
                    return true;
                }
            } else if (type === 'ng') {
                const index = wordFilters.ngWords.indexOf(word);
                if (index > -1) {
                    wordFilters.ngWords.splice(index, 1);
                    wordFilters.lastUpdated = new Date().toISOString();
                    console.log('[WordFilter] Removed NG word:', word);
                    return true;
                }
            }
            return false;
        },

        filterArticles: function(articles, wordFilters) {
            if (!wordFilters.ngWords.length) return articles;

            return articles.filter(article => {
                const text = (article.title + ' ' + article.content).toLowerCase();
                return !wordFilters.ngWords.some(ngWord => 
                    text.includes(ngWord.toLowerCase())
                );
            });
        }
    };

    // ===========================================
    // ローカルストレージ管理システム（継承）
    // ===========================================

    const LocalStorageManager = {
        setItem: function(key, data) {
            try {
                const serializedData = JSON.stringify({
                    data: data,
                    timestamp: new Date().toISOString(),
                    version: DATA_VERSION
                });
                localStorage.setItem(key, serializedData);
                console.log('[Storage] Saved:', key, 'Size:', serializedData.length);
                return true;
            } catch (error) {
                console.error('[Storage] Save failed:', key, error);
                return false;
            }
        },

        getItem: function(key, defaultValue) {
            try {
                const stored = localStorage.getItem(key);
                if (!stored) {
                    if (defaultValue) {
                        this.setItem(key, defaultValue);
                        console.log('[Storage] Initialized with default for:', key);
                    }
                    return defaultValue;
                }

                const parsed = JSON.parse(stored);
                
                if (parsed.version !== DATA_VERSION) {
                    console.warn('[Storage] Version mismatch:', key, 'Migrating data');
                    return this.migrateData(key, parsed, defaultValue);
                }

                console.log('[Storage] Loaded:', key, 'Timestamp:', parsed.timestamp);
                return parsed.data;
            } catch (error) {
                console.error('[Storage] Load failed:', key, error);
                if (defaultValue) {
                    this.setItem(key, defaultValue);
                }
                return defaultValue;
            }
        },

        removeItem: function(key) {
            try {
                localStorage.removeItem(key);
                console.log('[Storage] Removed:', key);
                return true;
            } catch (error) {
                console.error('[Storage] Remove failed:', key, error);
                return false;
            }
        },

        migrateData: function(key, oldData, defaultValue) {
            console.log('[Storage] Migrating data for:', key);
            
            if (oldData.data) {
                this.setItem(key, oldData.data);
                return oldData.data;
            }
            
            return defaultValue;
        },

        getStorageInfo: function() {
            let totalSize = 0;
            let itemCount = 0;
            
            for (let key in localStorage) {
                if (localStorage.hasOwnProperty(key) && key.startsWith('minews_')) {
                    totalSize += localStorage[key].length;
                    itemCount++;
                }
            }
            
            return {
                totalSize: totalSize,
                itemCount: itemCount,
                available: 5000000 - totalSize
            };
        }
    };

    // ===========================================
    // データ操作フック（継承）
    // ===========================================

    const DataHooks = {
        useArticles: function() {
            const articles = LocalStorageManager.getItem(STORAGE_KEYS.ARTICLES, DEFAULT_DATA.articles);
            
            return {
                articles: articles,
                
                addArticle: function(newArticle) {
                    const updatedArticles = [...articles];
                    
                    const exists = updatedArticles.find(article => 
                        article.id === newArticle.id || 
                        article.url === newArticle.url ||
                        (article.title === newArticle.title && article.rssSource === newArticle.rssSource)
                    );
                    
                    if (exists) {
                        console.warn('[Articles] Duplicate article:', newArticle.title);
                        return false;
                    }
                    
                    if (updatedArticles.length >= MAX_ARTICLES) {
                        updatedArticles.sort((a, b) => {
                            const aScore = (a.readStatus === 'read' && a.userRating === 0) ? 1 : 0;
                            const bScore = (b.readStatus === 'read' && b.userRating === 0) ? 1 : 0;
                            if (aScore !== bScore) return bScore - aScore;
                            return new Date(a.publishDate) - new Date(b.publishDate);
                        });
                        updatedArticles.pop();
                        console.log('[Articles] Removed old article for capacity');
                    }
                    
                    updatedArticles.unshift(newArticle);
                    LocalStorageManager.setItem(STORAGE_KEYS.ARTICLES, updatedArticles);
                    state.articles = updatedArticles;
                    return true;
                },
                
                updateArticle: function(articleId, updates) {
                    const updatedArticles = articles.map(article => 
                        article.id === articleId ? { ...article, ...updates } : article
                    );
                    LocalStorageManager.setItem(STORAGE_KEYS.ARTICLES, updatedArticles);
                    state.articles = updatedArticles;
                    render();
                },
                
                removeArticle: function(articleId) {
                    const updatedArticles = articles.filter(article => article.id !== articleId);
                    LocalStorageManager.setItem(STORAGE_KEYS.ARTICLES, updatedArticles);
                    state.articles = updatedArticles;
                    render();
                },
                
                bulkUpdateArticles: function(articleIds, updates) {
                    const updatedArticles = articles.map(article => 
                        articleIds.includes(article.id) ? { ...article, ...updates } : article
                    );
                    LocalStorageManager.setItem(STORAGE_KEYS.ARTICLES, updatedArticles);
                    state.articles = updatedArticles;
                    render();
                }
            };
        },

        useRSSManager: function() {
            const rssFeeds = LocalStorageManager.getItem(STORAGE_KEYS.RSS_FEEDS, DEFAULT_DATA.rssFeeds);
            
            return {
                rssFeeds: rssFeeds,
                
                addRSSFeed: function(url, title) {
                    const newFeed = {
                        id: 'rss_' + Date.now(),
                        url: url,
                        title: title || 'Unknown Feed',
                        lastUpdated: new Date().toISOString(),
                        isActive: true
                    };
                    
                    const updatedFeeds = [...rssFeeds, newFeed];
                    LocalStorageManager.setItem(STORAGE_KEYS.RSS_FEEDS, updatedFeeds);
                    console.log('[RSS] Added feed:', title);
                    return newFeed;
                },
                
                removeRSSFeed: function(feedId) {
                    const updatedFeeds = rssFeeds.filter(feed => feed.id !== feedId);
                    LocalStorageManager.setItem(STORAGE_KEYS.RSS_FEEDS, updatedFeeds);
                    console.log('[RSS] Removed feed:', feedId);
                },

                updateRSSFeed: function(feedId, updates) {
                    const updatedFeeds = rssFeeds.map(feed =>
                        feed.id === feedId ? { ...feed, ...updates } : feed
                    );
                    LocalStorageManager.setItem(STORAGE_KEYS.RSS_FEEDS, updatedFeeds);
                    console.log('[RSS] Updated feed:', feedId);
                },

                fetchAllFeeds: async function() {
                    const articlesHook = DataHooks.useArticles();
                    let totalAdded = 0;
                    let totalErrors = 0;
                    let feedResults = [];

                    for (const feed of rssFeeds.filter(f => f.isActive)) {
                        try {
                            console.log(`[RSS] Fetching feed: ${feed.title} (${feed.url})`);
                            
                            const rssContent = await RSSProcessor.fetchRSS(feed.url);
                            const parsed = RSSProcessor.parseRSS(rssContent, feed.url);
                            
                            let addedCount = 0;
                            parsed.articles.forEach(article => {
                                if (articlesHook.addArticle(article)) {
                                    addedCount++;
                                }
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
                            console.log(`[RSS] Added ${addedCount} articles from ${feed.title}`);
                            
                        } catch (error) {
                            console.error(`[RSS] Failed to fetch ${feed.title}:`, error.message);
                            totalErrors++;
                            feedResults.push({
                                name: feed.title,
                                success: false,
                                error: error.message
                            });
                        }
                    }

                    state.articles = LocalStorageManager.getItem(STORAGE_KEYS.ARTICLES, []);
                    render();
                    
                    return { 
                        totalAdded, 
                        totalErrors, 
                        totalFeeds: rssFeeds.filter(f => f.isActive).length,
                        feedResults
                    };
                }
            };
        },

        useAILearning: function() {
            const aiLearning = LocalStorageManager.getItem(STORAGE_KEYS.AI_LEARNING, DEFAULT_DATA.aiLearning);
            
            return {
                aiLearning: aiLearning,
                
                updateWordWeight: function(word, weight) {
                    const updatedLearning = {
                        ...aiLearning,
                        wordWeights: {
                            ...aiLearning.wordWeights,
                            [word]: (aiLearning.wordWeights[word] || 0) + weight
                        },
                        lastUpdated: new Date().toISOString()
                    };
                    LocalStorageManager.setItem(STORAGE_KEYS.AI_LEARNING, updatedLearning);
                    console.log('[AI] Updated word weight:', word, weight);
                },
                
                updateCategoryWeight: function(category, weight) {
                    const updatedLearning = {
                        ...aiLearning,
                        categoryWeights: {
                            ...aiLearning.categoryWeights,
                            [category]: (aiLearning.categoryWeights[category] || 0) + weight
                        },
                        lastUpdated: new Date().toISOString()
                    };
                    LocalStorageManager.setItem(STORAGE_KEYS.AI_LEARNING, updatedLearning);
                    console.log('[AI] Updated category weight:', category, weight);
                },

                updateLearningData: function(article, rating) {
                    const updatedLearning = AIScoring.updateLearning(article, rating, aiLearning);
                    LocalStorageManager.setItem(STORAGE_KEYS.AI_LEARNING, updatedLearning);
                    return updatedLearning;
                }
            };
        },

        useWordFilters: function() {
            const wordFilters = LocalStorageManager.getItem(STORAGE_KEYS.WORD_FILTERS, DEFAULT_DATA.wordFilters);
            
            return {
                wordFilters: wordFilters,
                
                addInterestWord: function(word) {
                    const updated = { ...wordFilters };
                    if (WordFilterManager.addWord(word, 'interest', updated)) {
                        LocalStorageManager.setItem(STORAGE_KEYS.WORD_FILTERS, updated);
                        return true;
                    }
                    return false;
                },
                
                addNGWord: function(word) {
                    const updated = { ...wordFilters };
                    if (WordFilterManager.addWord(word, 'ng', updated)) {
                        LocalStorageManager.setItem(STORAGE_KEYS.WORD_FILTERS, updated);
                        return true;
                    }
                    return false;
                },

                removeInterestWord: function(word) {
                    const updated = { ...wordFilters };
                    if (WordFilterManager.removeWord(word, 'interest', updated)) {
                        LocalStorageManager.setItem(STORAGE_KEYS.WORD_FILTERS, updated);
                        return true;
                    }
                    return false;
                },

                removeNGWord: function(word) {
                    const updated = { ...wordFilters };
                    if (WordFilterManager.removeWord(word, 'ng', updated)) {
                        LocalStorageManager.setItem(STORAGE_KEYS.WORD_FILTERS, updated);
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
        showModal: null,
        articles: [],
        isLoading: false,
        lastUpdate: null
    };

    function setState(newState) {
        state = { ...state, ...newState };
        render();
    }

    function initializeData() {
        console.log('[App] Initializing data...');
        
        const articlesData = LocalStorageManager.getItem(STORAGE_KEYS.ARTICLES, DEFAULT_DATA.articles);
        const rssData = LocalStorageManager.getItem(STORAGE_KEYS.RSS_FEEDS, DEFAULT_DATA.rssFeeds);
        const aiData = LocalStorageManager.getItem(STORAGE_KEYS.AI_LEARNING, DEFAULT_DATA.aiLearning);
        const wordData = LocalStorageManager.getItem(STORAGE_KEYS.WORD_FILTERS, DEFAULT_DATA.wordFilters);
        
        state.articles = articlesData;

        if (state.articles.length === 0) {
            console.log('[App] No existing articles, adding samples');
            
            const sampleArticles = [
                {
                    id: 'sample_1',
                    title: 'Minews PWA：UI改善アップデート完了',
                    url: '#',
                    content: 'アプリ名をMinewsに変更し、ナビゲーション改善と記事アクションボタンの視認性向上を実装しました。更新ボタンには絵文字を追加し、より使いやすいインターフェースを実現しています。',
                    publishDate: new Date().toISOString(),
                    rssSource: 'Minews Development',
                    category: 'Technology',
                    readStatus: 'unread',
                    readLater: false,
                    userRating: 0,
                    keywords: ['UI', '改善', 'PWA', 'Minews', 'ナビゲーション']
                },
                {
                    id: 'sample_2',
                    title: 'シンプルで視認性の高いボタンデザイン',
                    url: '#',
                    content: '既読・後で読むボタンを派手にせず、シンプルで視認性の高いデザインに改善。ユーザビリティを重視したアプローチで、より直感的な操作を実現しました。',
                    publishDate: new Date(Date.now() - 3600000).toISOString(),
                    rssSource: 'UX Design',
                    category: 'Design',
                    readStatus: 'unread',
                    readLater: false,
                    userRating: 0,
                    keywords: ['UI/UX', 'ボタン', 'デザイン', 'シンプル', '視認性']
                }
            ];
            
            const articlesHook = DataHooks.useArticles();
            sampleArticles.forEach(article => {
                articlesHook.addArticle(article);
            });
            
            state.articles = LocalStorageManager.getItem(STORAGE_KEYS.ARTICLES, []);
        }
        
        const storageInfo = LocalStorageManager.getStorageInfo();
        console.log('[App] Storage info:', storageInfo);
        console.log('[App] Data initialization complete. Articles:', state.articles.length);
        console.log('[App] RSS Feeds:', rssData.length);
        console.log('[App] Word Filters initialized');
    }

    // ===========================================
    // Utility functions
    // ===========================================

    function formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = now - date;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
        
        if (diffHours < 1) {
            return '1時間以内';
        } else if (diffHours < 24) {
            return diffHours + '時間前';
        } else if (diffDays === 1) {
            return '昨日';
        } else if (diffDays < 7) {
            return diffDays + '日前';
        } else {
            return date.toLocaleDateString('ja-JP');
        }
    }

    function createStarRating(rating, articleId) {
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            const filled = i <= rating ? 'filled' : '';
            stars += `<span class="star ${filled}" data-rating="${i}" data-article-id="${articleId}">★</span>`;
        }
        return `<div class="star-rating">${stars}</div>`;
    }

    function truncateText(text, maxLength = 200) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength).trim() + '...';
    }

    // ===========================================
    // Event handlers
    // ===========================================

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
            
            const articlesHook = DataHooks.useArticles();
            const aiHook = DataHooks.useAILearning();
            
            const article = state.articles.find(a => a.id === articleId);
            if (article) {
                articlesHook.updateArticle(articleId, { userRating: rating });
                aiHook.updateLearningData(article, rating);
                console.log(`[Rating] Article "${article.title}" rated ${rating} stars`);
            }
        }
    }

    function handleReadStatusToggle(articleId) {
        const articlesHook = DataHooks.useArticles();
        const article = state.articles.find(a => a.id === articleId);
        
        if (article) {
            const newStatus = article.readStatus === 'read' ? 'unread' : 'read';
            articlesHook.updateArticle(articleId, { readStatus: newStatus });
            console.log(`[ReadStatus] Article "${article.title}" marked as ${newStatus}`);
        }
    }

    function handleReadLaterToggle(articleId) {
        const articlesHook = DataHooks.useArticles();
        const article = state.articles.find(a => a.id === articleId);
        
        if (article) {
            const newReadLater = !article.readLater;
            articlesHook.updateArticle(articleId, { readLater: newReadLater });
            console.log(`[ReadLater] Article "${article.title}" read later: ${newReadLater}`);
        }
    }

    async function handleRefresh() {
        if (state.isLoading) return;
        
        setState({ isLoading: true });
        console.log('[App] Refreshing RSS feeds...');
        
        try {
            const rssHook = DataHooks.useRSSManager();
            const result = await rssHook.fetchAllFeeds();
            
            setState({ 
                isLoading: false, 
                lastUpdate: new Date().toISOString() 
            });
            
            let message = `📰 更新完了！\n${result.totalAdded}件の新記事を追加しました。\n`;
            
            if (result.feedResults && result.feedResults.length > 0) {
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
            console.log('[App] Refresh completed:', result);
            
        } catch (error) {
            setState({ isLoading: false });
            console.error('[App] Refresh failed:', error);
            alert('記事の更新に失敗しました: ' + error.message);
        }
    }

    function handleRSSAdd() {
        const url = prompt('RSSフィードのURLを入力してください:\n\n推奨フィード例:\n• https://www3.nhk.or.jp/rss/news/cat0.xml\n• https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml');
        if (!url) return;
        
        const title = prompt('フィードのタイトルを入力してください (空欄可):') || undefined;
        
        const rssHook = DataHooks.useRSSManager();
        rssHook.addRSSFeed(url, title);
        
        if (state.showModal === 'rss') {
            render();
        }
        
        console.log('[RSS] Manual RSS feed added:', url);
    }

    function handleRSSRemove(feedId) {
        if (!confirm('このRSSフィードを削除しますか？')) return;
        
        const rssHook = DataHooks.useRSSManager();
        rssHook.removeRSSFeed(feedId);
        
        if (state.showModal === 'rss') {
            render();
        }
        
        console.log('[RSS] RSS feed removed:', feedId);
    }

    function handleWordAdd(type) {
        const word = prompt(type === 'interest' ? '気になるワードを入力してください:' : 'NGワードを入力してください:');
        if (!word) return;
        
        const wordHook = DataHooks.useWordFilters();
        const success = type === 'interest' ? 
            wordHook.addInterestWord(word) : 
            wordHook.addNGWord(word);
        
        if (success) {
            if (state.showModal === 'words') {
                render();
            }
            console.log(`[WordFilter] Added ${type} word:`, word);
        } else {
            alert('このワードは既に登録されています');
        }
    }

    function handleWordRemove(word, type) {
        if (!confirm(`「${word}」を削除しますか？`)) return;
        
        const wordHook = DataHooks.useWordFilters();
        const success = type === 'interest' ? 
            wordHook.removeInterestWord(word) : 
            wordHook.removeNGWord(word);
        
        if (success) {
            if (state.showModal === 'words') {
                render();
            }
            console.log(`[WordFilter] Removed ${type} word:`, word);
        }
    }

    // ===========================================
    // フィルタリング・レンダリング関数
    // ===========================================

    function getFilteredArticles() {
        const aiHook = DataHooks.useAILearning();
        const wordHook = DataHooks.useWordFilters();
        
        const filteredByWords = WordFilterManager.filterArticles(state.articles, wordHook.wordFilters);
        
        let filteredByMode;
        switch (state.viewMode) {
            case 'unread':
                filteredByMode = filteredByWords.filter(article => article.readStatus === 'unread');
                break;
            case 'read':
                filteredByMode = filteredByWords.filter(article => article.readStatus === 'read');
                break;
            case 'readLater':
                filteredByMode = filteredByWords.filter(article => article.readLater);
                break;
            default:
                filteredByMode = filteredByWords;
        }

        return AIScoring.sortArticlesByScore(filteredByMode, aiHook.aiLearning, wordHook.wordFilters);
    }

    function renderNavigation() {
        const modes = [
            { key: 'all', label: 'すべて' },
            { key: 'unread', label: '未読' },
            { key: 'read', label: '既読' },
            { key: 'readLater', label: '後で読む' }
        ];

        const filterButtons = modes.map(mode => {
            const count = getFilteredArticleCount(mode.key);
            const active = state.viewMode === mode.key ? 'active' : '';
            return `<button class="filter-btn ${active}" data-mode="${mode.key}">${mode.label} (${count})</button>`;
        }).join('');

        const refreshButtonClass = state.isLoading ? 'action-btn refresh-btn loading' : 'action-btn refresh-btn';
        const refreshButtonText = state.isLoading ? '📥 更新中...' : '🔄 更新';

        return `
            <nav class="nav">
                <div class="nav-left">
                    <h1>Minews</h1>
                    ${state.lastUpdate ? `<small class="last-update">最終更新: ${formatDate(state.lastUpdate)}</small>` : ''}
                </div>
                <div class="nav-filters">
                    ${filterButtons}
                </div>
                <div class="nav-actions">
                    <button class="action-btn" data-modal="rss">📡 RSS管理</button>
                    <button class="action-btn" data-modal="words">🔤 ワード管理</button>
                    <button class="action-btn" data-action="storage">📊 データ</button>
                    <button class="${refreshButtonClass}" data-action="refresh" ${state.isLoading ? 'disabled' : ''}>${refreshButtonText}</button>
                </div>
            </nav>
        `;
    }

    function getFilteredArticleCount(mode) {
        const wordHook = DataHooks.useWordFilters();
        const filteredByWords = WordFilterManager.filterArticles(state.articles, wordHook.wordFilters);
        
        switch (mode) {
            case 'unread':
                return filteredByWords.filter(article => article.readStatus === 'unread').length;
            case 'read':
                return filteredByWords.filter(article => article.readStatus === 'read').length;
            case 'readLater':
                return filteredByWords.filter(article => article.readLater).length;
            default:
                return filteredByWords.length;
        }
    }

    function renderArticleCard(article) {
        const readStatusLabel = article.readStatus === 'read' ? '未読' : '既読';
        const readLaterLabel = article.readLater ? '解除' : '後で読む';
        const scoreDisplay = article.aiScore !== undefined ? 
            `<span class="ai-score" title="AIスコア">🤖 ${article.aiScore}</span>` : '';

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
                    ${scoreDisplay}
                    ${article.userRating > 0 ? `<span class="rating-badge">★${article.userRating}</span>` : ''}
                </div>
                <div class="article-content">
                    ${truncateText(article.content, 250)}
                </div>
                <div class="article-keywords">
                    ${article.keywords ? article.keywords.slice(0, 5).map(keyword => 
                        `<span class="keyword">${keyword}</span>`
                    ).join('') : ''}
                </div>
                <div class="article-actions">
                    <button class="action-btn-simple read-status" data-article-id="${article.id}">📖 ${readStatusLabel}</button>
                    <button class="action-btn-simple read-later" data-article-id="${article.id}">📌 ${readLaterLabel}</button>
                </div>
                ${createStarRating(article.userRating, article.id)}
            </div>
        `;
    }

    function renderArticleGrid() {
        const filteredArticles = getFilteredArticles();
        if (filteredArticles.length === 0) {
            const emptyMessage = state.viewMode === 'all' ? 
                '記事がありません。RSSフィードを追加して「🔄 更新」ボタンを押してください。' :
                '該当する記事がありません';
            return `<div class="empty-message">${emptyMessage}</div>`;
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
            const rssHook = DataHooks.useRSSManager();
            modalContent = `
                <div class="modal-header">
                    <h2>📡 RSS管理</h2>
                    <button class="modal-close">×</button>
                </div>
                <div class="modal-body">
                    <div class="modal-actions">
                        <button class="action-btn success" data-action="rss-add">➕ RSSフィード追加</button>
                    </div>
                    <div class="rss-list">
                        <h3>登録済みRSSフィード (${rssHook.rssFeeds.length})</h3>
                        ${rssHook.rssFeeds.map(feed => `
                            <div class="rss-item">
                                <div class="rss-info">
                                    <strong>${feed.title}</strong>
                                    <small class="rss-url">${feed.url}</small>
                                    <small class="rss-updated">更新: ${formatDate(feed.lastUpdated)}</small>
                                    <span class="rss-status ${feed.isActive ? 'active' : 'inactive'}">${feed.isActive ? '✅ 有効' : '❌ 無効'}</span>
                                </div>
                                <div class="rss-actions">
                                    <button class="action-btn danger" data-action="rss-remove" data-feed-id="${feed.id}">🗑️ 削除</button>
                                </div>
                            </div>
                        `).join('')}
                        
                        <div class="rss-help">
                            <h4>📝 推奨RSSフィード</h4>
                            <ul>
                                <li><strong>NHKニュース</strong>: https://www3.nhk.or.jp/rss/news/cat0.xml</li>
                                <li><strong>ITmedia</strong>: https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml</li>
                                <li><strong>Qiita</strong>: https://qiita.com/popular-items/feed</li>
                            </ul>
                        </div>
                    </div>
                </div>
            `;
        } else if (state.showModal === 'words') {
            const wordHook = DataHooks.useWordFilters();
            modalContent = `
                <div class="modal-header">
                    <h2>🔤 ワード管理</h2>
                    <button class="modal-close">×</button>
                </div>
                <div class="modal-body">
                    <div class="word-section">
                        <div class="word-section-header">
                            <h3>💡 気になるワード (${wordHook.wordFilters.interestWords.length}) +20pt</h3>
                            <button class="action-btn success" data-action="word-add" data-type="interest">➕ 追加</button>
                        </div>
                        <div class="word-list">
                            ${wordHook.wordFilters.interestWords.map(word => `
                                <span class="word-tag interest">
                                    ${word}
                                    <button class="word-remove" data-action="word-remove" data-word="${word}" data-type="interest">×</button>
                                </span>
                            `).join('') || '<em>登録されたワードはありません</em>'}
                        </div>
                    </div>
                    
                    <div class="word-section">
                        <div class="word-section-header">
                            <h3>🚫 NGワード (${wordHook.wordFilters.ngWords.length}) -50pt</h3>
                            <button class="action-btn danger" data-action="word-add" data-type="ng">➕ 追加</button>
                        </div>
                        <div class="word-list">
                            ${wordHook.wordFilters.ngWords.map(word => `
                                <span class="word-tag ng">
                                    ${word}
                                    <button class="word-remove" data-action="word-remove" data-word="${word}" data-type="ng">×</button>
                                </span>
                            `).join('') || '<em>登録されたワードはありません</em>'}
                        </div>
                    </div>
                    
                    <div class="word-help">
                        <h4>ℹ️ ワードフィルターについて</h4>
                        <p><strong>💡 気になるワード</strong>: 記事のタイトルや内容に含まれると+20ポイント</p>
                        <p><strong>🚫 NGワード</strong>: 記事のタイトルや内容に含まれると-50ポイント（除外対象）</p>
                    </div>
                </div>
            `;
        } else if (state.showModal === 'storage') {
            const storageInfo = LocalStorageManager.getStorageInfo();
            const aiLearning = LocalStorageManager.getItem(STORAGE_KEYS.AI_LEARNING, DEFAULT_DATA.aiLearning);
            const rssFeeds = LocalStorageManager.getItem(STORAGE_KEYS.RSS_FEEDS, DEFAULT_DATA.rssFeeds);
            const wordFilters = LocalStorageManager.getItem(STORAGE_KEYS.WORD_FILTERS, DEFAULT_DATA.wordFilters);
            
            modalContent = `
                <div class="modal-header">
                    <h2>📊 データ管理</h2>
                    <button class="modal-close">×</button>
                </div>
                <div class="modal-body">
                    <div class="storage-info">
                        <h3>💾 ストレージ使用状況</h3>
                        <div class="storage-stats">
                            <div class="stat-item">
                                <span class="stat-label">使用容量</span>
                                <span class="stat-value">${(storageInfo.totalSize / 1024).toFixed(1)} KB</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">保存項目数</span>
                                <span class="stat-value">${storageInfo.itemCount}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">記事数</span>
                                <span class="stat-value">${state.articles.length} / ${MAX_ARTICLES}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">RSSフィード数</span>
                                <span class="stat-value">${rssFeeds.length}</span>
                            </div>
                        </div>
                        
                        <h3>🤖 AI学習データ</h3>
                        <div class="storage-stats">
                            <div class="stat-item">
                                <span class="stat-label">単語重み学習数</span>
                                <span class="stat-value">${Object.keys(aiLearning.wordWeights).length}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">カテゴリ重み学習数</span>
                                <span class="stat-value">${Object.keys(aiLearning.categoryWeights).length}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">最終更新</span>
                                <span class="stat-value">${formatDate(aiLearning.lastUpdated)}</span>
                            </div>
                        </div>

                        <h3>🔤 ワードフィルター</h3>
                        <div class="storage-stats">
                            <div class="stat-item">
                                <span class="stat-label">気になるワード数</span>
                                <span class="stat-value">${wordFilters.interestWords.length}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">NGワード数</span>
                                <span class="stat-value">${wordFilters.ngWords.length}</span>
                            </div>
                        </div>

                        <h3>⚙️ 技術情報</h3>
                        <div class="storage-stats">
                            <div class="stat-item">
                                <span class="stat-label">データバージョン</span>
                                <span class="stat-value">${DATA_VERSION}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">プロキシサーバー数</span>
                                <span class="stat-value">${RSS_PROXY_URLS.length}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">タイムアウト設定</span>
                                <span class="stat-value">${REQUEST_TIMEOUT/1000}秒</span>
                            </div>
                        </div>
                    </div>
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

        addEventListeners();
    }

    function addEventListeners() {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                handleFilterClick(e.target.dataset.mode);
            });
        });

        document.querySelectorAll('.action-btn, .action-btn-simple').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.dataset.modal;
                const action = e.target.dataset.action;
                
                if (modal) {
                    handleModalOpen(modal);
                } else if (action === 'refresh') {
                    handleRefresh();
                } else if (action === 'storage') {
                    handleModalOpen('storage');
                } else if (action === 'rss-add') {
                    handleRSSAdd();
                } else if (action === 'rss-remove') {
                    handleRSSRemove(e.target.dataset.feedId);
                } else if (action === 'word-add') {
                    handleWordAdd(e.target.dataset.type);
                } else if (action === 'word-remove') {
                    handleWordRemove(e.target.dataset.word, e.target.dataset.type);
                }
            });
        });

        const closeBtn = document.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', handleModalClose);
        }

        const overlay = document.querySelector('.modal-overlay');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    handleModalClose();
                }
            });
        }

        document.querySelectorAll('.star-rating').forEach(rating => {
            rating.addEventListener('click', handleStarClick);
        });

        document.querySelectorAll('.read-status').forEach(btn => {
            btn.addEventListener('click', (e) => {
                handleReadStatusToggle(e.target.dataset.articleId);
            });
        });

        document.querySelectorAll('.read-later').forEach(btn => {
            btn.addEventListener('click', (e) => {
                handleReadLaterToggle(e.target.dataset.articleId);
            });
        });

        document.querySelectorAll('.article-title a').forEach(link => {
            link.addEventListener('click', (e) => {
                const articleId = e.target.dataset.articleId;
                if (articleId) {
                    setTimeout(() => handleReadStatusToggle(articleId), 100);
                }
            });
        });

        document.querySelectorAll('.word-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const word = e.target.dataset.word;
                const type = e.target.dataset.type;
                handleWordRemove(word, type);
            });
        });
    }

    // Initialize app
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[App] Starting Minews PWA - UI Improved Version');
        initializeData();
        render();
    });

})();
