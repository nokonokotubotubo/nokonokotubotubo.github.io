// Minews PWA - RakutenMA統合版（エラーリスク最小化）
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

    // =========================================== 
    // RakutenMA統合システム（エラーリスク最小化版）
    // ===========================================
    let rakutenMA = null;
    let rakutenMAReady = null;
    let rakutenMAInitialized = false;

    // RakutenMA初期化関数（安全化版）
    const initializeRakutenMA = async () => {
        if (rakutenMAReady) return rakutenMAReady;
        
        rakutenMAReady = new Promise(async (resolve) => {
            try {
                console.log('RakutenMA初期化開始...');
                
                // RakutenMAライブラリの存在確認
                if (typeof RakutenMA === 'undefined') {
                    console.warn('RakutenMAライブラリが見つかりません');
                    rakutenMA = null;
                    rakutenMAInitialized = false;
                    resolve(false);
                    return;
                }
                
                // モデルファイルの読み込み
                const response = await fetch('./model_ja.min.json');
                if (!response.ok) {
                    throw new Error(`モデルファイル読み込み失敗: HTTP ${response.status}`);
                }
                
                const model = await response.json();
                if (!model || !model.mu) {
                    throw new Error('無効なモデルデータ');
                }
                
                // RakutenMAインスタンス作成
                rakutenMA = new RakutenMA(model);
                rakutenMA.featset = RakutenMA.default_featset_ja;
                rakutenMA.hash_func = RakutenMA.create_hash_func(15);
                
                rakutenMAInitialized = true;
                console.log('RakutenMA初期化完了');
                resolve(true);
                
            } catch (error) {
                console.error('RakutenMA初期化失敗:', error);
                rakutenMA = null;
                rakutenMAInitialized = false;
                resolve(false);
            }
        });
        
        return rakutenMAReady;
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
    const DataHooksCache = {
        articles: null,
        rssFeeds: null,
        folders: null,
        aiLearning: null,
        wordFilters: null,
        lastUpdate: {
            articles: null, rssFeeds: null, folders: null, 
            aiLearning: null, wordFilters: null
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
        validateFolder: folder => folder && typeof folder.name === 'string' && 
                                 folder.name.trim().length > 0 && folder.name.trim().length <= 50,
        getColorName: colorValue => CONFIG.FOLDER_COLORS.find(c => c.value === colorValue)?.name || 'カスタム',
        matchArticleToFeed(article, feeds) {
            return feeds.find(feed => 
                feed.title === article.rssSource || 
                article.rssSource.includes(feed.title) || 
                feed.title.includes(article.rssSource) ||
                this.extractDomainFromSource(article.rssSource) === this.extractDomainFromUrl(feed.url)
            ) || null;
        },
        extractDomainFromSource: source => source.includes('.') ? 
                                          source.toLowerCase().replace(/^www\./, '') : source.toLowerCase(),
        extractDomainFromUrl(url) {
            try {
                return new URL(url).hostname.replace(/^www\./, '');
            } catch {
                return '';
            }
        }
    };

    // =========================================== 
    // RSS処理システム（extractKeywords修正版）
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
                console.error('RSS item parsing error:', error);
                return null;
            }
        },

        parseAtomEntry(entry, sourceUrl) {
            try {
                const title = this.getTextContent(entry, ['title']);
                const link = entry.querySelector('link')?.getAttribute('href') || this.getTextContent(entry, ['id']);
                const content = this.getTextContent(entry, ['content', 'summary', 'description']);
                const published = this.getTextContent(entry, ['published', 'updated']);
                const category = entry.querySelector('category')?.getAttribute('term') || 
                               entry.querySelector('category')?.textContent || 'General';

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

        cleanHtml: html => html ? html.replace(/<[^>]*>/g, '')
                                    .replace(/&lt;/g, '<')
                                    .replace(/&gt;/g, '>')
                                    .replace(/&amp;/g, '&')
                                    .replace(/&quot;/g, '"')
                                    .replace(/&apos;/g, "'")
                                    .replace(/\s+/g, ' ')
                                    .trim() : '',

        parseDate(dateString) {
            if (!dateString) return new Date().toISOString();
            try {
                const date = new Date(dateString);
                return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
            } catch {
                return new Date().toISOString();
            }
        },

        // ========== RakutenMA統合extractKeywords関数（安全化版） ==========
        async extractKeywords(text) {
            // RakutenMA初期化待機
            if (!rakutenMAInitialized && rakutenMAReady) {
                await rakutenMAReady;
            }

            // RakutenMAが利用可能な場合は形態素解析を使用
            if (rakutenMAInitialized && rakutenMA) {
                try {
                    const tokens = rakutenMA.tokenize(text);
                    const stopWords = ['の', 'に', 'は', 'が', 'を', 'と', 'で', 'から', 'まで', 'について', 'という', 'など', 'する', 'なる', 'ある', 'いる', 'れる', 'られる', 'です', 'ます', 'だ', 'である', 'この', 'その', 'あの', 'どの', 'これ', 'それ', 'あれ', 'どれ'];
                    
                    return [...new Set(
                        tokens
                            .filter(token => {
                                const word = token[0];
                                const pos = token[1];
                                // 名詞、動詞、形容詞、副詞のみを抽出
                                return word.length > 1 && 
                                       !stopWords.includes(word) &&
                                       (pos.startsWith('N-') || pos.startsWith('V-') || pos.startsWith('A-') || pos.startsWith('R')) &&
                                       !/^[\d\s\-\.\,\!\?\;\:\(\)\[\]\{\}]+$/.test(word);
                            })
                            .map(token => token[0])
                            .slice(0, 8)
                    )];
                } catch (error) {
                    console.error('RakutenMA tokenization failed:', error);
                    // エラー時はフォールバック
                }
            }
            
            // フォールバック: 従来の方式
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
                const hasInterestWord = wordFilters.interestWords.some(word => 
                    content.includes(word.toLowerCase())
                );
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
            const exists = targetArray.some(existingWord => 
                existingWord.toLowerCase() === word.toLowerCase()
            );

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
                return !wordFilters.ngWords.some(ngWord => 
                    text.includes(ngWord.toLowerCase())
                );
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
                            for (const article of parsed.articles) {
                                // extractKeywordsが非同期になったため、awaitを追加
                                article.keywords = await RSSProcessor.extractKeywords(article.title + ' ' + article.content);
                                if (articlesHook.addArticle(article)) addedCount++;
                            }

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

        // RakutenMA初期化を非同期で実行
        initializeRakutenMA();
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
            stars += `<span class="star ${filled}" onclick="handleRateArticle('${articleId}', ${i})">★</span>`;
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
                case "'": return '&apos;';
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
<opml version="2.0">
  <head>
    <title>Minews RSS Feeds</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>`;

        // フォルダ別にグループ化
        const folderMap = {};
        foldersHook.folders.forEach(folder => {
            folderMap[folder.id] = {
                name: folder.name,
                feeds: []
            };
        });

        // 未分類フォルダを追加
        folderMap['uncategorized'] = {
            name: '未分類',
            feeds: []
        };

        // フィードをフォルダに分類
        rssHook.rssFeeds.forEach(feed => {
            const folderId = feed.folderId || 'uncategorized';
            if (folderMap[folderId]) {
                folderMap[folderId].feeds.push(feed);
            }
        });

        // OPML出力
        Object.values(folderMap).forEach(folder => {
            if (folder.feeds.length > 0) {
                opmlContent += `
    <outline text="${escapeXml(folder.name)}" title="${escapeXml(folder.name)}">`;
                
                folder.feeds.forEach(feed => {
                    opmlContent += `
      <outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.url)}" />`;
                });
                
                opmlContent += `
    </outline>`;
            }
        });

        opmlContent += `
  </body>
</opml>`;

        const dataBlob = new Blob([opmlContent], { type: 'text/xml' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `minews_rss_feeds_${new Date().toISOString().split('T')[0]}.opml`;
        link.click();

        alert('RSSデータをOPML形式でエクスポートしました');
    };

    // RSSデータインポート（OPML形式）
    const handleImportRSSData = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const opmlContent = e.target.result;
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(opmlContent, 'text/xml');

                const rssHook = DataHooks.useRSSManager();
                const foldersHook = DataHooks.useFolders();

                let importedCount = 0;

                // アウトライン要素を取得
                const outlines = xmlDoc.querySelectorAll('outline');
                
                outlines.forEach(outline => {
                    const type = outline.getAttribute('type');
                    const xmlUrl = outline.getAttribute('xmlUrl');
                    const title = outline.getAttribute('text') || outline.getAttribute('title');

                    if (type === 'rss' && xmlUrl) {
                        // RSSフィードとして処理
                        const parentOutline = outline.parentElement;
                        let folderId = 'uncategorized';

                        if (parentOutline && parentOutline.tagName === 'outline') {
                            const folderName = parentOutline.getAttribute('text') || parentOutline.getAttribute('title');
                            if (folderName && folderName !== 'body') {
                                // フォルダが存在するかチェック
                                let folder = foldersHook.folders.find(f => f.name === folderName);
                                if (!folder) {
                                    // フォルダを作成
                                    folder = foldersHook.addFolder(folderName, CONFIG.FOLDER_COLORS[0].value);
                                }
                                if (folder) {
                                    folderId = folder.id;
                                }
                            }
                        }

                        // 重複チェック
                        const exists = rssHook.rssFeeds.find(feed => feed.url === xmlUrl);
                        if (!exists) {
                            rssHook.addRSSFeed(xmlUrl, title, folderId);
                            importedCount++;
                        }
                    }
                });

                alert(`RSSデータをインポートしました（${importedCount}件追加）`);
                render();

            } catch (error) {
                alert('インポートに失敗しました: ' + error.message);
            }
        };
        reader.readAsText(file);

        // ファイル選択をリセット
        event.target.value = '';
    };

    // データリセット
    const handleResetAllData = () => {
        if (confirm('すべてのデータをリセットしますか？この操作は元に戻せません。')) {
            Object.values(CONFIG.STORAGE_KEYS).forEach(key => {
                LocalStorageManager.removeItem(key);
            });
            DataHooksCache.clear();
            initializeData();
            alert('すべてのデータをリセットしました');
            render();
        }
    };

    // =========================================== 
    // イベントハンドラ 
    // ===========================================
    const handleRefreshFeeds = async () => {
        if (state.isLoading) return;

        setState({ isLoading: true });

        try {
            const rssHook = DataHooks.useRSSManager();
            const result = await rssHook.fetchAllFeeds();

            setState({ 
                isLoading: false, 
                lastUpdate: new Date().toISOString() 
            });

            let message = `更新完了: ${result.totalAdded}件の新着記事を取得しました\n`;
            message += `成功: ${result.totalFeeds - result.totalErrors}/${result.totalFeeds}フィード\n\n`;

            result.feedResults.forEach(feedResult => {
                if (feedResult.success) {
                    message += `✓ ${feedResult.name}: ${feedResult.added}/${feedResult.total}件追加\n`;
                } else {
                    message += `✗ ${feedResult.name}: ${feedResult.error}\n`;
                }
            });

            alert(message);
            render();

        } catch (error) {
            setState({ isLoading: false });
            alert('フィード更新中にエラーが発生しました: ' + error.message);
        }
    };

    const handleToggleReadStatus = (articleId) => {
        const articlesHook = DataHooks.useArticles();
        const article = state.articles.find(a => a.id === articleId);
        
        if (article) {
            const newStatus = article.readStatus === 'read' ? 'unread' : 'read';
            articlesHook.updateArticle(articleId, { readStatus: newStatus });
        }
    };

    const handleToggleReadLater = (articleId) => {
        const articlesHook = DataHooks.useArticles();
        const article = state.articles.find(a => a.id === articleId);
        
        if (article) {
            articlesHook.updateArticle(articleId, { readLater: !article.readLater });
        }
    };

    const handleRateArticle = (articleId, rating) => {
        const articlesHook = DataHooks.useArticles();
        const aiHook = DataHooks.useAILearning();
        const article = state.articles.find(a => a.id === articleId);
        
        if (article) {
            const oldRating = article.userRating;
            
            // 前回の評価を取り消し
            if (oldRating > 0) {
                aiHook.updateLearningData(article, oldRating, true);
            }
            
            // 新しい評価を適用
            if (rating > 0) {
                aiHook.updateLearningData(article, rating, false);
            }
            
            articlesHook.updateArticle(articleId, { userRating: rating });
        }
    };

    const handleViewModeChange = (mode) => {
        setState({ viewMode: mode });
    };

    const handleFolderChange = (folderId) => {
        setState({ selectedFolder: folderId });
    };

    const handleOpenModal = (modalType) => {
        setState({ showModal: modalType });
    };

    const handleCloseModal = () => {
        setState({ showModal: null });
    };

    // =========================================== 
    // RSS管理関数 
    // ===========================================
    const handleAddRSSFeed = (url, title, folderId) => {
        if (!url?.trim()) {
            alert('URLを入力してください');
            return;
        }

        try {
            new URL(url);
        } catch {
            alert('有効なURLを入力してください');
            return;
        }

        const rssHook = DataHooks.useRSSManager();
        const exists = rssHook.rssFeeds.find(feed => feed.url === url);

        if (exists) {
            alert('このRSSフィードは既に登録されています');
            return;
        }

        rssHook.addRSSFeed(url, title, folderId);
        alert('RSSフィードを追加しました');
        render();
    };

    const handleRemoveRSSFeed = (feedId) => {
        if (confirm('このRSSフィードを削除しますか？')) {
            const rssHook = DataHooks.useRSSManager();
            rssHook.removeRSSFeed(feedId);
            alert('RSSフィードを削除しました');
            render();
        }
    };

    const handleToggleRSSFeed = (feedId) => {
        const rssHook = DataHooks.useRSSManager();
        const feed = rssHook.rssFeeds.find(f => f.id === feedId);
        
        if (feed) {
            rssHook.updateRSSFeed(feedId, { isActive: !feed.isActive });
            render();
        }
    };

    const handleEditRSSField = (feedId, field, currentValue) => {
        const newValue = prompt(`${field}を編集:`, currentValue);
        if (newValue && newValue.trim() !== currentValue) {
            const rssHook = DataHooks.useRSSManager();
            rssHook.updateRSSFeed(feedId, { [field]: newValue.trim() });
            render();
        }
    };

    // =========================================== 
    // フォルダ管理関数 
    // ===========================================
    const handleAddFolder = (name, color) => {
        if (!name?.trim()) {
            alert('フォルダ名を入力してください');
            return;
        }

        const foldersHook = DataHooks.useFolders();
        const exists = foldersHook.folders.find(folder => 
            folder.name.toLowerCase() === name.trim().toLowerCase()
        );

        if (exists) {
            alert('このフォルダ名は既に使用されています');
            return;
        }

        const newFolder = foldersHook.addFolder(name.trim(), color);
        if (newFolder) {
            alert('フォルダを作成しました');
            render();
        } else {
            alert('フォルダの作成に失敗しました');
        }
    };

    const handleRemoveFolder = (folderId) => {
        const foldersHook = DataHooks.useFolders();
        const result = foldersHook.removeFolder(folderId);

        if (result.success) {
            alert('フォルダを削除しました');
            if (state.selectedFolder === folderId) {
                setState({ selectedFolder: 'all' });
            }
            render();
        } else if (result.reason === 'FEEDS_EXIST') {
            alert(
                `このフォルダには${result.feedCount}個のRSSフィードが含まれています。\n` +
                'フォルダを削除する前に、フィードを他のフォルダに移動するか削除してください。'
            );
        }
    };

    const handleEditFolder = (folderId) => {
        const foldersHook = DataHooks.useFolders();
        const folder = foldersHook.folders.find(f => f.id === folderId);
        
        if (folder) {
            const newName = prompt('フォルダ名を編集:', folder.name);
            if (newName && newName.trim() !== folder.name) {
                const exists = foldersHook.folders.find(f => 
                    f.id !== folderId && f.name.toLowerCase() === newName.trim().toLowerCase()
                );
                
                if (exists) {
                    alert('このフォルダ名は既に使用されています');
                    return;
                }
                
                foldersHook.updateFolder(folderId, { name: newName.trim() });
                render();
            }
        }
    };

    const handleMoveFeedToFolder = (feedId, newFolderId) => {
        const rssHook = DataHooks.useRSSManager();
        rssHook.updateRSSFeed(feedId, { folderId: newFolderId });
        render();
    };

    // =========================================== 
    // ワード管理関数 
    // ===========================================
    const handleAddInterestWord = (word) => {
        if (!word?.trim()) {
            alert('キーワードを入力してください');
            return;
        }

        const wordHook = DataHooks.useWordFilters();
        if (wordHook.addInterestWord(word.trim())) {
            render();
        } else {
            alert('このキーワードは既に登録されています');
        }
    };

    const handleAddNGWord = (word) => {
        if (!word?.trim()) {
            alert('NGワードを入力してください');
            return;
        }

        const wordHook = DataHooks.useWordFilters();
        if (wordHook.addNGWord(word.trim())) {
            render();
        } else {
            alert('このNGワードは既に登録されています');
        }
    };

    const handleRemoveInterestWord = (word) => {
        const wordHook = DataHooks.useWordFilters();
        wordHook.removeInterestWord(word);
        render();
    };

    const handleRemoveNGWord = (word) => {
        const wordHook = DataHooks.useWordFilters();
        wordHook.removeNGWord(word);
        render();
    };

    // =========================================== 
    // 記事表示・フィルタリング 
    // ===========================================
    const getFilteredArticles = () => {
        const aiHook = DataHooks.useAILearning();
        const wordHook = DataHooks.useWordFilters();
        const foldersHook = DataHooks.useFolders();
        const rssHook = DataHooks.useRSSManager();

        let filteredArticles = [...state.articles];

        // NGワードフィルタリング
        filteredArticles = AIScoring.filterArticles(filteredArticles, wordHook.wordFilters);

        // フォルダフィルタリング
        if (state.selectedFolder !== 'all') {
            const folderFeeds = rssHook.rssFeeds
                .filter(feed => feed.folderId === state.selectedFolder)
                .map(feed => feed.title);

            filteredArticles = filteredArticles.filter(article => 
                folderFeeds.some(feedTitle => 
                    feedTitle === article.rssSource ||
                    article.rssSource.includes(feedTitle) ||
                    feedTitle.includes(article.rssSource)
                )
            );
        }

        // 表示モードフィルタリング
        switch (state.viewMode) {
            case 'unread':
                filteredArticles = filteredArticles.filter(article => article.readStatus === 'unread');
                break;
            case 'read':
                filteredArticles = filteredArticles.filter(article => article.readStatus === 'read');
                break;
            case 'readLater':
                filteredArticles = filteredArticles.filter(article => article.readLater);
                break;
            case 'rated':
                filteredArticles = filteredArticles.filter(article => article.userRating > 0);
                break;
        }

        // AIスコアでソート
        return AIScoring.sortArticlesByScore(filteredArticles, aiHook.aiLearning, wordHook.wordFilters);
    };

    // =========================================== 
    // レンダリング関数 
    // ===========================================
    const renderArticleCard = (article) => {
        const keywords = article.keywords ? article.keywords.map(keyword => 
            `<span class="keyword">${keyword}</span>`
        ).join('') : '';

        const aiScoreBadge = article.aiScore !== undefined 
            ? `<span class="ai-score">AI: ${article.aiScore}</span>` 
            : '';

        const ratingBadge = article.userRating > 0 
            ? `<span class="rating-badge">★${article.userRating}</span>` 
            : '';

        return `
            <article class="article-card" data-read-status="${article.readStatus}">
                <header class="article-header">
                    <h2 class="article-title">
                        <a href="${article.url}" target="_blank" rel="noopener">${article.title}</a>
                    </h2>
                    <div class="article-meta">
                        <span class="date">${formatDate(article.publishDate)}</span>
                        <span class="source">${article.rssSource}</span>
                        <span class="category">${article.category}</span>
                        ${aiScoreBadge}
                        ${ratingBadge}
                    </div>
                </header>
                
                <div class="article-content">
                    ${truncateText(article.content)}
                </div>
                
                <div class="article-keywords">
                    ${keywords}
                </div>
                
                <div class="article-actions">
                    <button class="simple-btn read-status" onclick="handleToggleReadStatus('${article.id}')">
                        ${article.readStatus === 'read' ? '未読' : '既読'}
                    </button>
                    <button class="simple-btn read-later" data-active="${article.readLater}" onclick="handleToggleReadLater('${article.id}')">
                        ${article.readLater ? '解除' : '後読'}
                    </button>
                </div>
                
                ${createStarRating(article.userRating, article.id)}
            </article>
        `;
    };

    const renderNavigation = () => {
        const foldersHook = DataHooks.useFolders();
        const lastUpdateText = state.lastUpdate 
            ? `最終更新: ${new Date(state.lastUpdate).toLocaleString('ja-JP')}`
            : '';

        // フォルダオプションの生成
        const folderOptions = [
            '<option value="all">すべて</option>',
            ...foldersHook.folders.map(folder => 
                `<option value="${folder.id}" ${state.selectedFolder === folder.id ? 'selected' : ''}>${folder.name}</option>`
            )
        ].join('');

        return `
            <nav class="nav">
                <div class="nav-left">
                    <h1>Minews</h1>
                    <div class="last-update">${lastUpdateText}</div>
                </div>
                
                <div class="nav-filters">
                    <div class="filter-group">
                        <label for="viewMode">表示:</label>
                        <select id="viewMode" class="filter-select" onchange="handleViewModeChange(this.value)">
                            <option value="all" ${state.viewMode === 'all' ? 'selected' : ''}>すべて</option>
                            <option value="unread" ${state.viewMode === 'unread' ? 'selected' : ''}>未読</option>
                            <option value="read" ${state.viewMode === 'read' ? 'selected' : ''}>既読</option>
                            <option value="readLater" ${state.viewMode === 'readLater' ? 'selected' : ''}>後で読む</option>
                            <option value="rated" ${state.viewMode === 'rated' ? 'selected' : ''}>評価済み</option>
                        </select>
                    </div>
                    
                    <div class="filter-group">
                        <label for="folderFilter">フォルダ:</label>
                        <select id="folderFilter" class="filter-select" onchange="handleFolderChange(this.value)">
                            ${folderOptions}
                        </select>
                    </div>
                </div>
                
                <div class="nav-actions">
                    <button class="action-btn refresh-btn ${state.isLoading ? 'loading' : ''}" 
                            onclick="handleRefreshFeeds()" 
                            ${state.isLoading ? 'disabled' : ''}>
                        ${state.isLoading ? '更新中...' : '更新'}
                    </button>
                    <button class="action-btn" onclick="handleOpenModal('rss')">RSS</button>
                    <button class="action-btn" onclick="handleOpenModal('folders')">フォルダ</button>
                    <button class="action-btn" onclick="handleOpenModal('words')">ワード</button>
                    <button class="action-btn" onclick="handleOpenModal('data')">データ</button>
                </div>
            </nav>
        `;
    };

    const renderRSSModal = () => {
        const rssHook = DataHooks.useRSSManager();
        const foldersHook = DataHooks.useFolders();

        const feedsList = rssHook.rssFeeds.map(feed => {
            const folder = foldersHook.folders.find(f => f.id === feed.folderId);
            const folderName = folder ? folder.name : '未分類';
            
            return `
                <div class="rss-item">
                    <div class="rss-info">
                        <div class="rss-editable-row">
                            <strong onclick="handleEditRSSField('${feed.id}', 'title', '${feed.title}')">${feed.title}</strong>
                        </div>
                        <div class="rss-editable-row">
                            <span class="rss-url" onclick="handleEditRSSField('${feed.id}', 'url', '${feed.url}')">${feed.url}</span>
                        </div>
                        <div class="rss-editable-row">
                            <div onclick="handleShowFolderSelection('${feed.id}')">フォルダ: ${folderName}</div>
                        </div>
                        <span class="rss-updated">最終更新: ${formatDate(feed.lastUpdated)}</span>
                        <span class="rss-status ${feed.isActive ? 'active' : 'inactive'}">
                            ${feed.isActive ? 'アクティブ' : '無効'}
                        </span>
                    </div>
                    <div class="rss-actions">
                        <button class="action-btn" onclick="handleToggleRSSFeed('${feed.id}')">
                            ${feed.isActive ? '無効化' : '有効化'}
                        </button>
                        <button class="action-btn danger" onclick="handleRemoveRSSFeed('${feed.id}')">削除</button>
                    </div>
                </div>
            `;
        }).join('');

        const folderOptions = [
            '<option value="uncategorized">未分類</option>',
            ...foldersHook.folders.map(folder => 
                `<option value="${folder.id}">${folder.name}</option>`
            )
        ].join('');

        return `
            <div class="modal-body">
                <div class="modal-actions">
                    <h3>新しいRSSフィードを追加</h3>
                    <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap;">
                        <input type="url" id="rssUrl" placeholder="RSS URL" style="flex: 2; min-width: 200px;">
                        <input type="text" id="rssTitle" placeholder="タイトル（省略可）" style="flex: 1; min-width: 150px;">
                        <select id="rssFolder" style="flex: 1; min-width: 100px;">
                            ${folderOptions}
                        </select>
                        <button class="action-btn success" onclick="
                            const url = document.getElementById('rssUrl').value;
                            const title = document.getElementById('rssTitle').value;
                            const folderId = document.getElementById('rssFolder').value;
                            handleAddRSSFeed(url, title, folderId);
                            document.getElementById('rssUrl').value = '';
                            document.getElementById('rssTitle').value = '';
                        ">追加</button>
                    </div>
                </div>
                
                <h3>登録済みRSSフィード</h3>
                <div class="rss-list">
                    ${feedsList}
                </div>
                
                <div class="rss-help">
                    <h4>RSS管理ヘルプ</h4>
                    <ul>
                        <li><strong>編集機能</strong>: タイトル、URL、フォルダをクリックすると編集できます</li>
                        <li><strong>フォルダ移動</strong>: 「フォルダ: ○○」をクリックすると移動先を選択できます</li>
                        <li><strong>有効/無効</strong>: 無効にしたフィードは更新対象から除外されます</li>
                        <li><strong>対応形式</strong>: RSS 2.0、Atom、RDF形式に対応</li>
                        <li><strong>プロキシ使用</strong>: CORS回避のため複数のプロキシサーバーを自動選択</li>
                    </ul>
                </div>
            </div>
        `;
    };

    const renderFoldersModal = () => {
        const foldersHook = DataHooks.useFolders();
        const rssHook = DataHooks.useRSSManager();

        const foldersList = foldersHook.folders.map(folder => {
            const feedCount = rssHook.rssFeeds.filter(feed => feed.folderId === folder.id).length;
            const colorName = FolderManager.getColorName(folder.color);
            
            return `
                <div class="rss-item">
                    <div class="rss-info">
                        <strong>${folder.name}</strong>
                        <span class="rss-url">色: ${colorName}</span>
                        <span class="rss-updated">作成日: ${formatDate(folder.createdAt)}</span>
                        <span class="rss-status active">${feedCount}個のフィード</span>
                    </div>
                    <div class="rss-actions">
                        <button class="action-btn" onclick="handleEditFolder('${folder.id}')">編集</button>
                        <button class="action-btn" onclick="handleShowColorSelection('${folder.id}')">色変更</button>
                        <button class="action-btn danger" onclick="handleRemoveFolder('${folder.id}')">削除</button>
                    </div>
                </div>
            `;
        }).join('');

        const colorOptions = CONFIG.FOLDER_COLORS.map(color => 
            `<option value="${color.value}">${color.name}</option>`
        ).join('');

        return `
            <div class="modal-body">
                <div class="modal-actions">
                    <h3>新しいフォルダを作成</h3>
                    <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap;">
                        <input type="text" id="folderName" placeholder="フォルダ名" style="flex: 2; min-width: 200px;">
                        <select id="folderColor" style="flex: 1; min-width: 120px;">
                            ${colorOptions}
                        </select>
                        <button class="action-btn success" onclick="
                            const name = document.getElementById('folderName').value;
                            const color = document.getElementById('folderColor').value;
                            handleAddFolder(name, color);
                            document.getElementById('folderName').value = '';
                        ">作成</button>
                    </div>
                </div>
                
                <h3>既存フォルダ</h3>
                <div class="rss-list">
                    ${foldersList}
                </div>
                
                <div class="rss-help">
                    <h4>フォルダ管理ヘルプ</h4>
                    <ul>
                        <li><strong>フォルダの役割</strong>: RSSフィードをカテゴリ別に整理できます</li>
                        <li><strong>記事フィルタ</strong>: ナビゲーションでフォルダ別に記事を表示できます</li>
                        <li><strong>色分け</strong>: フォルダごとに色を設定して視覚的に区別できます</li>
                        <li><strong>削除制限</strong>: フィードが含まれるフォルダは削除できません</li>
                        <li><strong>デフォルトフォルダ</strong>: 「ニュース」「テック」は初期設定として提供</li>
                    </ul>
                </div>
            </div>
        `;
    };

    const renderWordsModal = () => {
        const wordHook = DataHooks.useWordFilters();

        const interestWordsList = wordHook.wordFilters.interestWords.map(word => 
            `<span class="word-tag interest">${word}
                <button class="word-remove" onclick="handleRemoveInterestWord('${word}')">×</button>
            </span>`
        ).join('');

        const ngWordsList = wordHook.wordFilters.ngWords.map(word => 
            `<span class="word-tag ng">${word}
                <button class="word-remove" onclick="handleRemoveNGWord('${word}')">×</button>
            </span>`
        ).join('');

        return `
            <div class="modal-body">
                <div class="word-section">
                    <div class="word-section-header">
                        <h3>興味のあるキーワード</h3>
                        <div style="display: flex; gap: 0.5rem;">
                            <input type="text" id="interestWord" placeholder="キーワード" style="min-width: 150px;">
                            <button class="action-btn success" onclick="
                                const word = document.getElementById('interestWord').value;
                                handleAddInterestWord(word);
                                document.getElementById('interestWord').value = '';
                            ">追加</button>
                        </div>
                    </div>
                    <div class="word-list">
                        ${interestWordsList || '<span class="text-muted">キーワードが登録されていません</span>'}
                    </div>
                </div>
                
                <div class="word-section">
                    <div class="word-section-header">
                        <h3>NGワード</h3>
                        <div style="display: flex; gap: 0.5rem;">
                            <input type="text" id="ngWord" placeholder="NGワード" style="min-width: 150px;">
                            <button class="action-btn danger" onclick="
                                const word = document.getElementById('ngWord').value;
                                handleAddNGWord(word);
                                document.getElementById('ngWord').value = '';
                            ">追加</button>
                        </div>
                    </div>
                    <div class="word-list">
                        ${ngWordsList || '<span class="text-muted">NGワードが登録されていません</span>'}
                    </div>
                </div>
                
                <div class="word-help">
                    <h4>ワードフィルター機能</h4>
                    <ul>
                        <li><strong>興味キーワード</strong>: 含まれる記事のAIスコアが+10点されます</li>
                        <li><strong>NGワード</strong>: 含まれる記事は表示から除外されます</li>
                        <li><strong>学習効果</strong>: 星評価と組み合わせて記事の自動スコアリングが向上します</li>
                        <li><strong>大文字小文字</strong>: 区別せずにマッチングします</li>
                        <li><strong>部分一致</strong>: タイトルと本文の両方で部分一致検索を行います</li>
                    </ul>
                    <p><strong>ヒント</strong>: 興味のあるトピックをキーワード登録し、星評価で学習させると記事の自動優先順位付けが向上します。</p>
                </div>
            </div>
        `;
    };

    const renderDataModal = () => {
        const storageInfo = LocalStorageManager.getStorageInfo();
        const articlesHook = DataHooks.useArticles();
        const rssHook = DataHooks.useRSSManager();
        const foldersHook = DataHooks.useFolders();
        const aiHook = DataHooks.useAILearning();
        const wordHook = DataHooks.useWordFilters();

        const wordWeightsCount = Object.keys(aiHook.aiLearning.wordWeights || {}).length;
        const categoryWeightsCount = Object.keys(aiHook.aiLearning.categoryWeights || {}).length;
        const interestWordsCount = wordHook.wordFilters.interestWords?.length || 0;
        const ngWordsCount = wordHook.wordFilters.ngWords?.length || 0;

        return `
            <div class="modal-body">
                <div class="data-section">
                    <h3>ストレージ情報</h3>
                    <div class="storage-info">
                        <p>使用容量: ${Math.round(storageInfo.totalSize / 1024)}KB / 5MB</p>
                        <p>データ項目数: ${storageInfo.itemCount}個</p>
                        <p>残り容量: ${Math.round(storageInfo.available / 1024)}KB</p>
                    </div>
                </div>

                <div class="data-section">
                    <h3>データ統計</h3>
                    <div class="data-stats">
                        <p>記事数: ${articlesHook.articles.length}件</p>
                        <p>RSSフィード数: ${rssHook.rssFeeds.length}件</p>
                        <p>フォルダ数: ${foldersHook.folders.length}個</p>
                        <p>学習済みキーワード数: ${wordWeightsCount}語</p>
                        <p>学習済みカテゴリ数: ${categoryWeightsCount}個</p>
                        <p>興味キーワード数: ${interestWordsCount}語</p>
                        <p>NGワード数: ${ngWordsCount}語</p>
                    </div>
                </div>

                <div class="data-section">
                    <h3>学習データ管理</h3>
                    <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap;">
                        <button class="action-btn success" onclick="handleExportLearningData()">学習データをエクスポート</button>
                        <input type="file" id="learningDataImport" accept=".json" onchange="handleImportLearningData(event)" style="display: none;">
                        <button class="action-btn" onclick="document.getElementById('learningDataImport').click()">学習データをインポート</button>
                    </div>
                </div>

                <div class="data-section">
                    <h3>RSSデータ管理</h3>
                    <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap;">
                        <button class="action-btn success" onclick="handleExportRSSData()">RSSをOPMLでエクスポート</button>
                        <input type="file" id="rssDataImport" accept=".opml,.xml" onchange="handleImportRSSData(event)" style="display: none;">
                        <button class="action-btn" onclick="document.getElementById('rssDataImport').click()">OPMLファイルをインポート</button>
                    </div>
                </div>

                <div class="data-section">
                    <h3>危険操作</h3>
                    <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap;">
                        <button class="action-btn danger" onclick="handleResetAllData()">すべてのデータをリセット</button>
                    </div>
                </div>

                <div class="data-help">
                    <h4>データ管理機能</h4>
                    <ul>
                        <li><strong>学習データ</strong>: AI評価学習とワードフィルターの設定をバックアップ</li>
                        <li><strong>OPMLエクスポート</strong>: 標準的なRSSリーダーで利用できる形式で出力</li>
                        <li><strong>データインポート</strong>: 他のデバイスからデータを移行</li>
                        <li><strong>リセット機能</strong>: すべてのデータを初期状態に戻します（復元不可）</li>
                    </ul>
                </div>
            </div>
        `;
    };

    // モーダル表示の統合関数
    const renderModal = () => {
        if (!state.showModal) return '';

        let modalContent = '';
        let modalTitle = '';

        switch (state.showModal) {
            case 'rss':
                modalTitle = 'RSS管理';
                modalContent = renderRSSModal();
                break;
            case 'folders':
                modalTitle = 'フォルダ管理';
                modalContent = renderFoldersModal();
                break;
            case 'words':
                modalTitle = 'ワード管理';
                modalContent = renderWordsModal();
                break;
            case 'data':
                modalTitle = 'データ管理';
                modalContent = renderDataModal();
                break;
            case 'folderSelection':
                modalTitle = 'フォルダ選択';
                modalContent = renderFolderSelectionModal();
                break;
            case 'colorSelection':
                modalTitle = '色選択';
                modalContent = renderColorSelectionModal();
                break;
        }

        return `
            <div class="modal-overlay" onclick="handleCloseModal()">
                <div class="modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>${modalTitle}</h2>
                        <button class="modal-close" onclick="handleCloseModal()">×</button>
                    </div>
                    ${modalContent}
                </div>
            </div>
        `;
    };

    // フォルダ選択モーダル
    let currentFeedIdForFolderSelection = null;

    const handleShowFolderSelection = (feedId) => {
        currentFeedIdForFolderSelection = feedId;
        setState({ showModal: 'folderSelection' });
    };

    const renderFolderSelectionModal = () => {
        const foldersHook = DataHooks.useFolders();
        const rssHook = DataHooks.useRSSManager();
        const feed = rssHook.rssFeeds.find(f => f.id === currentFeedIdForFolderSelection);

        const foldersList = [
            { id: 'uncategorized', name: '未分類', color: '#6c757d' },
            ...foldersHook.folders
        ].map(folder => `
            <div class="folder-selection-item" onclick="
                handleMoveFeedToFolder('${currentFeedIdForFolderSelection}', '${folder.id}');
                handleCloseModal();
            ">
                <span style="display: inline-block; width: 20px; height: 20px; background: ${folder.color}; border-radius: 3px; margin-right: 0.5rem;"></span>
                ${folder.name}
            </div>
        `).join('');

        return `
            <div class="modal-body">
                <h3>${feed ? feed.title : 'フィード'} の移動先フォルダを選択</h3>
                <div class="folder-selection-list">
                    ${foldersList}
                </div>
            </div>
        `;
    };

    // 色選択モーダル
    let currentFolderIdForColorSelection = null;

    const handleShowColorSelection = (folderId) => {
        currentFolderIdForColorSelection = folderId;
        setState({ showModal: 'colorSelection' });
    };

    const renderColorSelectionModal = () => {
        const foldersHook = DataHooks.useFolders();
        const folder = foldersHook.folders.find(f => f.id === currentFolderIdForColorSelection);

        const colorsList = CONFIG.FOLDER_COLORS.map(color => `
            <div class="color-selection-item" onclick="
                const foldersHook = DataHooks.useFolders();
                foldersHook.updateFolder('${currentFolderIdForColorSelection}', { color: '${color.value}' });
                handleCloseModal();
            ">
                <span style="display: inline-block; width: 30px; height: 30px; background: ${color.value}; border-radius: 6px; margin-right: 0.5rem;"></span>
                ${color.name}
            </div>
        `).join('');

        return `
            <div class="modal-body">
                <h3>${folder ? folder.name : 'フォルダ'} の色を選択</h3>
                <div class="color-selection-list">
                    ${colorsList}
                </div>
            </div>
        `;
    };

    // =========================================== 
    // メインレンダリング関数 
    // ===========================================
    const render = () => {
        const filteredArticles = getFilteredArticles();

        const articlesHTML = filteredArticles.length > 0 
            ? filteredArticles.map(renderArticleCard).join('')
            : '<div class="empty-message">該当する記事がありません</div>';

        const appHTML = `
            <div class="app">
                ${renderNavigation()}
                
                <main class="main-content">
                    <div class="article-grid">
                        ${articlesHTML}
                    </div>
                </main>
                
                ${renderModal()}
            </div>
        `;

        document.body.innerHTML = appHTML;
    };

    // =========================================== 
    // グローバル関数の定義（HTMLから呼び出し用）
    // ===========================================
    window.handleRefreshFeeds = handleRefreshFeeds;
    window.handleToggleReadStatus = handleToggleReadStatus;
    window.handleToggleReadLater = handleToggleReadLater;
    window.handleRateArticle = handleRateArticle;
    window.handleViewModeChange = handleViewModeChange;
    window.handleFolderChange = handleFolderChange;
    window.handleOpenModal = handleOpenModal;
    window.handleCloseModal = handleCloseModal;
    window.handleAddRSSFeed = handleAddRSSFeed;
    window.handleRemoveRSSFeed = handleRemoveRSSFeed;
    window.handleToggleRSSFeed = handleToggleRSSFeed;
    window.handleEditRSSField = handleEditRSSField;
    window.handleAddFolder = handleAddFolder;
    window.handleRemoveFolder = handleRemoveFolder;
    window.handleEditFolder = handleEditFolder;
    window.handleMoveFeedToFolder = handleMoveFeedToFolder;
    window.handleShowFolderSelection = handleShowFolderSelection;
    window.handleShowColorSelection = handleShowColorSelection;
    window.handleAddInterestWord = handleAddInterestWord;
    window.handleAddNGWord = handleAddNGWord;
    window.handleRemoveInterestWord = handleRemoveInterestWord;
    window.handleRemoveNGWord = handleRemoveNGWord;
    window.handleExportLearningData = handleExportLearningData;
    window.handleImportLearningData = handleImportLearningData;
    window.handleExportRSSData = handleExportRSSData;
    window.handleImportRSSData = handleImportRSSData;
    window.handleResetAllData = handleResetAllData;

    // =========================================== 
    // アプリケーション初期化 
    // ===========================================
    document.addEventListener('DOMContentLoaded', () => {
        initializeData();
        render();

        // Service Worker登録
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => console.log('Service Worker registered'))
                .catch(error => console.log('Service Worker registration failed'));
        }

        // キーボードショートカット
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'r':
                        e.preventDefault();
                        if (!state.isLoading) handleRefreshFeeds();
                        break;
                    case 'Escape':
                        if (state.showModal) {
                            e.preventDefault();
                            handleCloseModal();
                        }
                        break;
                }
            }
        });

        // オンライン・オフライン状態の監視
        window.addEventListener('online', () => {
            console.log('オンラインになりました');
        });

        window.addEventListener('offline', () => {
            console.log('オフラインになりました');
        });
    });

})();
