// Minews PWA - RakutenMA統合版（元仕様準拠）
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
            {
                id: 'default-nhk',
                url: 'https://www3.nhk.or.jp/rss/news/cat0.xml',
                title: 'NHKニュース',
                folderId: 'default-general',
                lastUpdated: new Date().toISOString(),
                isActive: true
            },
            {
                id: 'default-itmedia',
                url: 'https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml',
                title: 'ITmedia',
                folderId: 'default-tech',
                lastUpdated: new Date().toISOString(),
                isActive: true
            }
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
                                      .replace(/&#39;/g, "'")
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

                            // ★ 追加: 非同期キーワード抽出を待つ
                            for (const article of parsed.articles) {
                                article.keywords = await RSSProcessor.extractKeywords(article.title + ' ' + article.content);
                                if (articlesHook.addArticle(article)) addedCount++;
                            }

                            // ★ 復活: フィード名自動更新
                            this.updateRSSFeed(feed.id, {
                                title: parsed.feedTitle,
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
            stars += `<span class="star ${filled}" onclick="handleRating('${articleId}', ${i})">★</span>`;
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
                case "'": return '&#39;';
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
    <docs>http://www.opml.org/spec2</docs>
</head>
<body>
`;

        // フォルダ別にRSSフィードを整理
        foldersHook.folders.forEach(folder => {
            const feedsInFolder = rssHook.rssFeeds.filter(feed => feed.folderId === folder.id);
            if (feedsInFolder.length > 0) {
                opmlContent += `    <outline text="${escapeXml(folder.name)}" title="${escapeXml(folder.name)}">\n`;
                feedsInFolder.forEach(feed => {
                    opmlContent += `        <outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.url)}" />\n`;
                });
                opmlContent += `    </outline>\n`;
            }
        });

        // フォルダに属さないRSSフィード
        const uncategorizedFeeds = rssHook.rssFeeds.filter(feed => 
            !foldersHook.folders.some(folder => folder.id === feed.folderId)
        );
        if (uncategorizedFeeds.length > 0) {
            opmlContent += `    <outline text="未分類" title="未分類">\n`;
            uncategorizedFeeds.forEach(feed => {
                opmlContent += `        <outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.url)}" />\n`;
            });
            opmlContent += `    </outline>\n`;
        }

        opmlContent += `</body>
</opml>`;

        const dataBlob = new Blob([opmlContent], { type: 'application/xml' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `minews_rss_feeds_${new Date().toISOString().split('T')[0]}.opml`;
        link.click();
        alert('RSSデータをエクスポートしました');
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
                
                const parseError = xmlDoc.querySelector('parsererror');
                if (parseError) {
                    throw new Error('OPMLファイルの解析に失敗しました');
                }

                const rssHook = DataHooks.useRSSManager();
                const foldersHook = DataHooks.useFolders();
                let importCount = 0;

                // OPMLのoutline要素を解析
                const processOutline = (outline, parentFolderId = null) => {
                    const text = outline.getAttribute('text') || outline.getAttribute('title') || '';
                    const xmlUrl = outline.getAttribute('xmlUrl');
                    const type = outline.getAttribute('type');

                    if (xmlUrl && type === 'rss') {
                        // RSSフィード
                        const existingFeed = rssHook.rssFeeds.find(feed => feed.url === xmlUrl);
                        if (!existingFeed) {
                            rssHook.addRSSFeed(xmlUrl, text, parentFolderId);
                            importCount++;
                        }
                    } else if (text && !xmlUrl) {
                        // フォルダ
                        const existingFolder = foldersHook.folders.find(folder => folder.name === text);
                        let folderId = existingFolder ? existingFolder.id : null;
                        
                        if (!existingFolder) {
                            const newFolder = foldersHook.addFolder(text, CONFIG.FOLDER_COLORS[0].value);
                            if (newFolder) folderId = newFolder.id;
                        }

                        // 子要素を処理
                        const childOutlines = outline.querySelectorAll('outline');
                        childOutlines.forEach(childOutline => processOutline(childOutline, folderId));
                    }
                };

                const outlines = xmlDoc.querySelectorAll('opml body > outline');
                outlines.forEach(outline => processOutline(outline));

                alert(`${importCount}件のRSSフィードをインポートしました`);
                render();
            } catch (error) {
                alert('インポートに失敗しました: ' + error.message);
            }
        };
        reader.readAsText(file);
        
        // ファイル選択をリセット
        event.target.value = '';
    };

    // 全データクリア
    const handleClearAllData = () => {
        if (!confirm('⚠️ 全データを削除します。この操作は取り消せません。\n\n削除対象:\n• 記事データ\n• RSSフィード設定\n• フォルダ設定\n• AI学習データ\n• ワードフィルター\n\n本当に削除しますか？')) {
            return;
        }

        // 全ストレージキーを削除
        Object.values(CONFIG.STORAGE_KEYS).forEach(key => {
            LocalStorageManager.removeItem(key);
        });

        // キャッシュクリア
        DataHooksCache.clear();

        // デフォルトデータで初期化
        initializeData();
        
        alert('全データを削除しました');
        render();
    };

    // ===========================================
    // イベントハンドラー
    // ===========================================
    
    // 記事評価処理
    const handleRating = (articleId, rating) => {
        const articlesHook = DataHooks.useArticles();
        const aiHook = DataHooks.useAILearning();
        
        const article = articlesHook.articles.find(a => a.id === articleId);
        if (!article) return;

        // 既存評価の取り消し
        if (article.userRating > 0) {
            aiHook.updateLearningData(article, article.userRating, true);
        }

        // 新しい評価の適用
        articlesHook.updateArticle(articleId, { userRating: rating });
        if (rating > 0) {
            aiHook.updateLearningData(article, rating, false);
        }
    };

    // 記事の既読/未読切り替え
    const toggleReadStatus = (articleId) => {
        const articlesHook = DataHooks.useArticles();
        const article = articlesHook.articles.find(a => a.id === articleId);
        if (!article) return;

        const newStatus = article.readStatus === 'read' ? 'unread' : 'read';
        articlesHook.updateArticle(articleId, { readStatus: newStatus });
    };

    // あとで読む切り替え
    const toggleReadLater = (articleId) => {
        const articlesHook = DataHooks.useArticles();
        const article = articlesHook.articles.find(a => a.id === articleId);
        if (!article) return;

        articlesHook.updateArticle(articleId, { readLater: !article.readLater });
    };

    // 記事削除
    const deleteArticle = (articleId) => {
        if (!confirm('この記事を削除しますか？')) return;
        const articlesHook = DataHooks.useArticles();
        articlesHook.removeArticle(articleId);
    };

    // 一括既読処理
    const markAllAsRead = () => {
        const articlesHook = DataHooks.useArticles();
        const visibleArticles = getFilteredArticles();
        const unreadIds = visibleArticles.filter(article => article.readStatus === 'unread').map(article => article.id);
        
        if (unreadIds.length === 0) return;
        
        if (!confirm(`${unreadIds.length}件の記事を既読にしますか？`)) return;
        articlesHook.bulkUpdateArticles(unreadIds, { readStatus: 'read' });
    };

    // RSS取得処理
    const handleFetchRSS = async () => {
        setState({ isLoading: true });
        try {
            const rssHook = DataHooks.useRSSManager();
            const result = await rssHook.fetchAllFeeds();
            
            let message = `RSS取得完了\n\n`;
            message += `📊 統計:\n`;
            message += `• 対象フィード数: ${result.totalFeeds}件\n`;
            message += `• 新規記事数: ${result.totalAdded}件\n`;
            message += `• エラー数: ${result.totalErrors}件\n\n`;
            
            if (result.feedResults.length > 0) {
                message += `📋 詳細:\n`;
                result.feedResults.forEach(feed => {
                    if (feed.success) {
                        message += `✅ ${feed.name}: ${feed.added}/${feed.total}件追加\n`;
                    } else {
                        message += `❌ ${feed.name}: ${feed.error.substring(0, 50)}...\n`;
                    }
                });
            }

            alert(message);
            setState({ lastUpdate: new Date().toISOString() });
        } catch (error) {
            alert('RSS取得中にエラーが発生しました: ' + error.message);
        } finally {
            setState({ isLoading: false });
        }
    };

    // フォルダ作成
    const handleCreateFolder = () => {
        const name = prompt('フォルダ名を入力してください:');
        if (!name || !name.trim()) return;

        const colorIndex = Math.floor(Math.random() * CONFIG.FOLDER_COLORS.length);
        const color = CONFIG.FOLDER_COLORS[colorIndex].value;
        
        const foldersHook = DataHooks.useFolders();
        const newFolder = foldersHook.addFolder(name.trim(), color);
        
        if (newFolder) {
            alert(`フォルダ「${newFolder.name}」を作成しました`);
            render();
        } else {
            alert('フォルダの作成に失敗しました');
        }
    };

    // フォルダ削除
    const handleDeleteFolder = (folderId) => {
        const foldersHook = DataHooks.useFolders();
        const folder = foldersHook.folders.find(f => f.id === folderId);
        if (!folder) return;

        if (!confirm(`フォルダ「${folder.name}」を削除しますか？`)) return;

        const result = foldersHook.removeFolder(folderId);
        if (result.success) {
            alert('フォルダを削除しました');
            if (state.selectedFolder === folderId) {
                setState({ selectedFolder: 'all' });
            }
            render();
        } else if (result.reason === 'FEEDS_EXIST') {
            alert(`このフォルダには${result.feedCount}件のRSSフィードが含まれています。\n先にRSSフィードを削除または移動してください。`);
        }
    };

    // RSSフィード追加
    const handleAddRSSFeed = () => {
        setState({ showModal: 'addRss' });
    };

    // RSSフィード削除
    const handleDeleteRSSFeed = (feedId) => {
        const rssHook = DataHooks.useRSSManager();
        const feed = rssHook.rssFeeds.find(f => f.id === feedId);
        if (!feed) return;

        if (!confirm(`RSSフィード「${feed.title}」を削除しますか？`)) return;

        rssHook.removeRSSFeed(feedId);
        alert('RSSフィードを削除しました');
        render();
    };

    // 興味ワード追加
    const handleAddInterestWord = () => {
        const word = prompt('興味のあるキーワードを入力してください:');
        if (!word || !word.trim()) return;

        const wordHook = DataHooks.useWordFilters();
        if (wordHook.addInterestWord(word.trim())) {
            alert(`興味ワード「${word.trim()}」を追加しました`);
            render();
        } else {
            alert('このキーワードは既に登録されています');
        }
    };

    // NGワード追加
    const handleAddNGWord = () => {
        const word = prompt('NGワードを入力してください:');
        if (!word || !word.trim()) return;

        const wordHook = DataHooks.useWordFilters();
        if (wordHook.addNGWord(word.trim())) {
            alert(`NGワード「${word.trim()}」を追加しました`);
            render();
        } else {
            alert('このワードは既に登録されています');
        }
    };

    // 興味ワード削除
    const handleRemoveInterestWord = (word) => {
        if (!confirm(`興味ワード「${word}」を削除しますか？`)) return;
        
        const wordHook = DataHooks.useWordFilters();
        if (wordHook.removeInterestWord(word)) {
            alert('興味ワードを削除しました');
            render();
        }
    };

    // NGワード削除
    const handleRemoveNGWord = (word) => {
        if (!confirm(`NGワード「${word}」を削除しますか？`)) return;
        
        const wordHook = DataHooks.useWordFilters();
        if (wordHook.removeNGWord(word)) {
            alert('NGワードを削除しました');
            render();
        }
    };

    // ===========================================
    // フィルタリング・ソート処理
    // ===========================================
    
    const getFilteredArticles = () => {
        const articlesHook = DataHooks.useArticles();
        const aiHook = DataHooks.useAILearning();
        const wordHook = DataHooks.useWordFilters();
        const rssHook = DataHooks.useRSSManager();
        const foldersHook = DataHooks.useFolders();

        let filteredArticles = [...articlesHook.articles];

        // NGワードフィルタリング
        filteredArticles = WordFilterManager.filterArticles(filteredArticles, wordHook.wordFilters);

        // 表示モードフィルタリング
        if (state.viewMode === 'unread') {
            filteredArticles = filteredArticles.filter(article => article.readStatus === 'unread');
        } else if (state.viewMode === 'readLater') {
            filteredArticles = filteredArticles.filter(article => article.readLater);
        } else if (state.viewMode === 'starred') {
            filteredArticles = filteredArticles.filter(article => article.userRating > 0);
        }

        // フォルダフィルタリング
        if (state.selectedFolder !== 'all') {
            const selectedFolder = foldersHook.folders.find(f => f.id === state.selectedFolder);
            if (selectedFolder) {
                const feedsInFolder = rssHook.rssFeeds.filter(feed => feed.folderId === selectedFolder.id);
                const feedTitles = feedsInFolder.map(feed => feed.title);
                const feedDomains = feedsInFolder.map(feed => FolderManager.extractDomainFromUrl(feed.url));
                
                filteredArticles = filteredArticles.filter(article => {
                    return feedTitles.some(title => 
                        article.rssSource === title || 
                        article.rssSource.includes(title) || 
                        title.includes(article.rssSource)
                    ) || feedDomains.includes(FolderManager.extractDomainFromSource(article.rssSource));
                });
            }
        }

        // AIスコアでソート
        return AIScoring.sortArticlesByScore(filteredArticles, aiHook.aiLearning, wordHook.wordFilters);
    };

    // ===========================================
    // UI関数
    // ===========================================
    
    const renderHeader = () => {
        const foldersHook = DataHooks.useFolders();
        const rssHook = DataHooks.useRSSManager();
        
        const folderOptions = foldersHook.folders.map(folder => {
            const feedCount = rssHook.rssFeeds.filter(feed => feed.folderId === folder.id).length;
            return `<option value="${folder.id}"${state.selectedFolder === folder.id ? ' selected' : ''}>${folder.name} (${feedCount})</option>`;
        }).join('');

        return `
            <header class="app-header">
                <h1 class="app-title">📰 Minews</h1>
                <div class="header-controls">
                    <select class="folder-select" onchange="setState({selectedFolder: this.value})">
                        <option value="all"${state.selectedFolder === 'all' ? ' selected' : ''}>すべてのフォルダ</option>
                        ${folderOptions}
                    </select>
                    <button class="fetch-button" onclick="handleFetchRSS()" ${state.isLoading ? 'disabled' : ''}>
                        ${state.isLoading ? '⏳ 取得中...' : '🔄 RSS取得'}
                    </button>
                    <button class="settings-button" onclick="setState({showModal: 'settings'})">⚙️</button>
                </div>
            </header>
        `;
    };

    const renderTabs = () => {
        const articlesHook = DataHooks.useArticles();
        const tabs = [
            { key: 'all', label: 'すべて', count: articlesHook.articles.length },
            { key: 'unread', label: '未読', count: articlesHook.articles.filter(a => a.readStatus === 'unread').length },
            { key: 'readLater', label: 'あとで読む', count: articlesHook.articles.filter(a => a.readLater).length },
            { key: 'starred', label: 'お気に入り', count: articlesHook.articles.filter(a => a.userRating > 0).length }
        ];

        return `
            <nav class="tabs">
                ${tabs.map(tab => `
                    <button class="tab ${state.viewMode === tab.key ? 'active' : ''}" 
                            onclick="setState({viewMode: '${tab.key}'})">
                        ${tab.label} <span class="tab-count">${tab.count}</span>
                    </button>
                `).join('')}
            </nav>
        `;
    };

    const renderActionBar = () => {
        const filteredArticles = getFilteredArticles();
        const unreadCount = filteredArticles.filter(article => article.readStatus === 'unread').length;

        return `
            <div class="action-bar">
                <div class="action-info">
                    表示中: ${filteredArticles.length}件
                    ${state.lastUpdate ? `(最終更新: ${formatDate(state.lastUpdate)})` : ''}
                </div>
                <div class="action-buttons">
                    ${unreadCount > 0 ? `<button class="action-button" onclick="markAllAsRead()">📖 一括既読 (${unreadCount})</button>` : ''}
                </div>
            </div>
        `;
    };

    const renderArticleCard = (article) => {
        const keywordTags = article.keywords ? article.keywords.slice(0, 3).map(keyword => 
            `<span class="keyword-tag">${keyword}</span>`
        ).join('') : '';

        return `
            <article class="article-card ${article.readStatus}" data-score="${article.aiScore || 0}">
                <div class="article-header">
                    <h3 class="article-title">
                        <a href="${article.url}" target="_blank" onclick="toggleReadStatus('${article.id}')">${article.title}</a>
                    </h3>
                    <div class="article-meta">
                        <span class="article-source">${article.rssSource}</span>
                        <span class="article-date">${formatDate(article.publishDate)}</span>
                        ${article.aiScore ? `<span class="ai-score">AI: ${article.aiScore}</span>` : ''}
                    </div>
                </div>
                
                <div class="article-content">
                    <p class="article-excerpt">${truncateText(article.content)}</p>
                    ${keywordTags ? `<div class="keyword-tags">${keywordTags}</div>` : ''}
                </div>
                
                <div class="article-actions">
                    <div class="article-rating">
                        ${createStarRating(article.userRating, article.id)}
                    </div>
                    <div class="article-buttons">
                        <button class="action-btn ${article.readStatus === 'read' ? 'active' : ''}" 
                                onclick="toggleReadStatus('${article.id}')" title="既読切り替え">
                            ${article.readStatus === 'read' ? '📖' : '📄'}
                        </button>
                        <button class="action-btn ${article.readLater ? 'active' : ''}" 
                                onclick="toggleReadLater('${article.id}')" title="あとで読む">
                            🔖
                        </button>
                        <button class="action-btn delete" onclick="deleteArticle('${article.id}')" title="削除">
                            🗑️
                        </button>
                    </div>
                </div>
            </article>
        `;
    };

    const renderArticleList = () => {
        const articles = getFilteredArticles();
        
        if (articles.length === 0) {
            return `
                <div class="empty-state">
                    <h3>📭 記事がありません</h3>
                    <p>RSSフィードを追加して記事を取得してください</p>
                    <button class="primary-button" onclick="handleAddRSSFeed()">📡 RSSフィード追加</button>
                </div>
            `;
        }

        return `
            <div class="article-list">
                ${articles.map(article => renderArticleCard(article)).join('')}
            </div>
        `;
    };

    const renderAddRSSModal = () => {
        const foldersHook = DataHooks.useFolders();
        const folderOptions = foldersHook.folders.map(folder => 
            `<option value="${folder.id}">${folder.name}</option>`
        ).join('');

        return `
            <div class="modal-overlay" onclick="if(event.target === this) setState({showModal: null})">
                <div class="modal">
                    <div class="modal-header">
                        <h3>📡 RSSフィード追加</h3>
                        <button class="modal-close" onclick="setState({showModal: null})">×</button>
                    </div>
                    <form class="modal-form" onsubmit="handleSubmitRSSForm(event)">
                        <div class="form-group">
                            <label>RSS URL *</label>
                            <input type="url" name="url" required placeholder="https://example.com/rss.xml">
                            <small>RSS/Atom/RDFフィードのURLを入力してください</small>
                        </div>
                        <div class="form-group">
                            <label>タイトル</label>
                            <input type="text" name="title" placeholder="自動取得されます">
                            <small>空欄の場合はフィードから自動取得されます</small>
                        </div>
                        <div class="form-group">
                            <label>フォルダ *</label>
                            <select name="folderId" required>
                                ${folderOptions}
                            </select>
                        </div>
                        <div class="modal-actions">
                            <button type="button" class="secondary-button" onclick="setState({showModal: null})">キャンセル</button>
                            <button type="submit" class="primary-button">追加</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    };

    const renderSettingsModal = () => {
        const rssHook = DataHooks.useRSSManager();
        const foldersHook = DataHooks.useFolders();
        const wordHook = DataHooks.useWordFilters();
        const aiHook = DataHooks.useAILearning();
        const storageInfo = LocalStorageManager.getStorageInfo();

        const wordWeightsCount = Object.keys(aiHook.aiLearning.wordWeights).length;
        const categoryWeightsCount = Object.keys(aiHook.aiLearning.categoryWeights).filter(k => aiHook.aiLearning.categoryWeights[k] !== 0).length;
        const interestWordsCount = wordHook.wordFilters.interestWords.length;
        const ngWordsCount = wordHook.wordFilters.ngWords.length;

        return `
            <div class="modal-overlay" onclick="if(event.target === this) setState({showModal: null})">
                <div class="modal settings-modal">
                    <div class="modal-header">
                                               <h3>⚙️ 設定</h3>
                        <button class="modal-close" onclick="setState({showModal: null})">×</button>
                    </div>
                    <div class="modal-content">
                        <div class="settings-tabs">
                            <button class="settings-tab active" onclick="showSettingsTab('feeds')">📡 フィード管理</button>
                            <button class="settings-tab" onclick="showSettingsTab('folders')">📁 フォルダ管理</button>
                            <button class="settings-tab" onclick="showSettingsTab('words')">🔤 ワード管理</button>
                            <button class="settings-tab" onclick="showSettingsTab('data')">💾 データ管理</button>
                            <button class="settings-tab" onclick="showSettingsTab('info')">ℹ️ システム情報</button>
                        </div>
                        
                        <div class="settings-content">
                            <div id="settings-feeds" class="settings-panel active">
                                <h4>📡 RSSフィード管理</h4>
                                <div class="settings-actions">
                                    <button class="primary-button" onclick="handleAddRSSFeed(); setState({showModal: null})">
                                        ➕ フィード追加
                                    </button>
                                </div>
                                <div class="feed-list">
                                    ${rssHook.rssFeeds.map(feed => {
                                        const folder = foldersHook.folders.find(f => f.id === feed.folderId);
                                        return `
                                            <div class="feed-item">
                                                <div class="feed-info">
                                                    <strong>${feed.title}</strong>
                                                    <small>${feed.url}</small>
                                                    <span class="feed-folder">📁 ${folder ? folder.name : '未分類'}</span>
                                                </div>
                                                <div class="feed-actions">
                                                    <button class="action-btn" onclick="handleDeleteRSSFeed('${feed.id}')" title="削除">
                                                        🗑️
                                                    </button>
                                                </div>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                            
                            <div id="settings-folders" class="settings-panel">
                                <h4>📁 フォルダ管理</h4>
                                <div class="settings-actions">
                                    <button class="primary-button" onclick="handleCreateFolder()">
                                        ➕ フォルダ作成
                                    </button>
                                </div>
                                <div class="folder-list">
                                    ${foldersHook.folders.map(folder => {
                                        const feedCount = rssHook.rssFeeds.filter(feed => feed.folderId === folder.id).length;
                                        return `
                                            <div class="folder-item">
                                                <div class="folder-color" style="background-color: ${folder.color}"></div>
                                                <div class="folder-info">
                                                    <strong>${folder.name}</strong>
                                                    <small>${feedCount}件のフィード</small>
                                                    <span class="folder-color-name">${FolderManager.getColorName(folder.color)}</span>
                                                </div>
                                                <div class="folder-actions">
                                                    <button class="action-btn" onclick="handleDeleteFolder('${folder.id}')" title="削除">
                                                        🗑️
                                                    </button>
                                                </div>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                            
                            <div id="settings-words" class="settings-panel">
                                <h4>🔤 ワード管理</h4>
                                
                                <div class="word-section">
                                    <h5>💚 興味ワード</h5>
                                    <div class="settings-actions">
                                        <button class="primary-button" onclick="handleAddInterestWord()">
                                            ➕ 興味ワード追加
                                        </button>
                                    </div>
                                    <div class="word-list">
                                        ${wordHook.wordFilters.interestWords.map(word => `
                                            <div class="word-item interest">
                                                <span>${word}</span>
                                                <button class="word-remove" onclick="handleRemoveInterestWord('${word}')">×</button>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                                
                                <div class="word-section">
                                    <h5>🚫 NGワード</h5>
                                    <div class="settings-actions">
                                        <button class="secondary-button" onclick="handleAddNGWord()">
                                            ➕ NGワード追加
                                        </button>
                                    </div>
                                    <div class="word-list">
                                        ${wordHook.wordFilters.ngWords.map(word => `
                                            <div class="word-item ng">
                                                <span>${word}</span>
                                                <button class="word-remove" onclick="handleRemoveNGWord('${word}')">×</button>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                            
                            <div id="settings-data" class="settings-panel">
                                <h4>💾 データ管理</h4>
                                
                                <div class="data-section">
                                    <h5>📤 エクスポート</h5>
                                    <div class="data-actions">
                                        <button class="primary-button" onclick="handleExportLearningData()">
                                            📊 学習データ書き出し
                                        </button>
                                        <button class="primary-button" onclick="handleExportRSSData()">
                                            📡 RSSデータ書き出し (OPML)
                                        </button>
                                    </div>
                                </div>
                                
                                <div class="data-section">
                                    <h5>📥 インポート</h5>
                                    <div class="data-actions">
                                        <label class="file-input-label">
                                            📊 学習データ読み込み
                                            <input type="file" accept=".json" onchange="handleImportLearningData(event)" style="display: none;">
                                        </label>
                                        <label class="file-input-label">
                                            📡 RSSデータ読み込み (OPML)
                                            <input type="file" accept=".opml,.xml" onchange="handleImportRSSData(event)" style="display: none;">
                                        </label>
                                    </div>
                                </div>
                                
                                <div class="data-section danger-zone">
                                    <h5>⚠️ 危険な操作</h5>
                                    <button class="danger-button" onclick="handleClearAllData()">
                                        🗑️ 全データ削除
                                    </button>
                                    <small>この操作は取り消せません</small>
                                </div>
                            </div>
                            
                            <div id="settings-info" class="settings-panel">
                                <h4>ℹ️ システム情報</h4>
                                
                                <div class="info-section">
                                    <h5>📱 アプリケーション</h5>
                                    <div class="info-grid">
                                        <div class="info-item">
                                            <span class="info-label">バージョン</span>
                                            <span class="info-value">${CONFIG.DATA_VERSION}</span>
                                        </div>
                                        <div class="info-item">
                                            <span class="info-label">形態素解析</span>
                                            <span class="info-value">${rakutenMAInitialized ? '✅ RakutenMA有効' : '❌ フォールバック'}</span>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="info-section">
                                    <h5>💡 使用方法</h5>
                                    <p><strong>ヒント</strong>: 興味のあるトピックをキーワード登録し、星評価で学習させると記事の自動優先順位付けが向上します。</p>
                                </div>
                                
                                <div class="info-section">
                                    <h5>💾 ストレージ使用状況</h5>
                                    <div class="info-grid">
                                        <div class="info-item">
                                            <span class="info-label">使用容量</span>
                                            <span class="info-value">${Math.round(storageInfo.totalSize / 1024)}KB / 5MB</span>
                                        </div>
                                        <div class="info-item">
                                            <span class="info-label">データ項目数</span>
                                            <span class="info-value">${storageInfo.itemCount}個</span>
                                        </div>
                                        <div class="info-item">
                                            <span class="info-label">残り容量</span>
                                            <span class="info-value">${Math.round(storageInfo.available / 1024)}KB</span>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="info-section">
                                    <h5>📊 データ統計</h5>
                                    <div class="info-grid">
                                        <div class="info-item">
                                            <span class="info-label">記事数</span>
                                            <span class="info-value">${articlesHook.articles.length}件</span>
                                        </div>
                                        <div class="info-item">
                                            <span class="info-label">RSSフィード数</span>
                                            <span class="info-value">${rssHook.rssFeeds.length}件</span>
                                        </div>
                                        <div class="info-item">
                                            <span class="info-label">フォルダ数</span>
                                            <span class="info-value">${foldersHook.folders.length}個</span>
                                        </div>
                                        <div class="info-item">
                                            <span class="info-label">学習済みキーワード数</span>
                                            <span class="info-value">${wordWeightsCount}語</span>
                                        </div>
                                        <div class="info-item">
                                            <span class="info-label">学習済みカテゴリ数</span>
                                            <span class="info-value">${categoryWeightsCount}個</span>
                                        </div>
                                        <div class="info-item">
                                            <span class="info-label">興味キーワード数</span>
                                            <span class="info-value">${interestWordsCount}語</span>
                                        </div>
                                        <div class="info-item">
                                            <span class="info-label">NGワード数</span>
                                            <span class="info-value">${ngWordsCount}語</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    // 設定タブ切り替え
    const showSettingsTab = (tabName) => {
        // 全パネルを非アクティブに
        document.querySelectorAll('.settings-panel').forEach(panel => {
            panel.classList.remove('active');
        });
        document.querySelectorAll('.settings-tab').forEach(tab => {
            tab.classList.remove('active');
        });

        // 選択されたパネルとタブをアクティブに
        const targetPanel = document.getElementById(`settings-${tabName}`);
        const targetTab = document.querySelector(`[onclick="showSettingsTab('${tabName}')"]`);
        
        if (targetPanel) targetPanel.classList.add('active');
        if (targetTab) targetTab.classList.add('active');
    };

    // RSSフォーム送信処理
    const handleSubmitRSSForm = async (event) => {
        event.preventDefault();
        const formData = new FormData(event.target);
        const url = formData.get('url');
        const title = formData.get('title');
        const folderId = formData.get('folderId');

        if (!url || !folderId) {
            alert('URL とフォルダは必須です');
            return;
        }

        try {
            setState({ isLoading: true });
            const rssHook = DataHooks.useRSSManager();
            
            // フィード追加
            const newFeed = rssHook.addRSSFeed(url, title, folderId);
            
            // 即座にフィードを取得してタイトルを更新
            if (!title) {
                try {
                    const rssContent = await RSSProcessor.fetchRSS(url);
                    const parsed = RSSProcessor.parseRSS(rssContent, url);
                    rssHook.updateRSSFeed(newFeed.id, {
                        title: parsed.feedTitle,
                        lastUpdated: new Date().toISOString()
                    });
                } catch (error) {
                    console.warn('フィードタイトル取得失敗:', error);
                }
            }

            alert('RSSフィードを追加しました');
            setState({ showModal: null });
        } catch (error) {
            alert('RSSフィード追加に失敗しました: ' + error.message);
        } finally {
            setState({ isLoading: false });
        }
    };

    // ===========================================
    // メインレンダリング関数
    // ===========================================
    
    const render = () => {
        const app = document.getElementById('app');
        if (!app) return;

        let content = `
            ${renderHeader()}
            ${renderTabs()}
            ${renderActionBar()}
            ${renderArticleList()}
        `;

        // モーダル表示
        if (state.showModal === 'addRss') {
            content += renderAddRSSModal();
        } else if (state.showModal === 'settings') {
            content += renderSettingsModal();
        }

        app.innerHTML = content;
    };

    // ===========================================
    // アプリケーション初期化
    // ===========================================
    
    // グローバル関数として公開（HTML内のonclick属性で使用）
    window.setState = setState;
    window.handleRating = handleRating;
    window.toggleReadStatus = toggleReadStatus;
    window.toggleReadLater = toggleReadLater;
    window.deleteArticle = deleteArticle;
    window.markAllAsRead = markAllAsRead;
    window.handleFetchRSS = handleFetchRSS;
    window.handleCreateFolder = handleCreateFolder;
    window.handleDeleteFolder = handleDeleteFolder;
    window.handleAddRSSFeed = handleAddRSSFeed;
    window.handleDeleteRSSFeed = handleDeleteRSSFeed;
    window.handleAddInterestWord = handleAddInterestWord;
    window.handleAddNGWord = handleAddNGWord;
    window.handleRemoveInterestWord = handleRemoveInterestWord;
    window.handleRemoveNGWord = handleRemoveNGWord;
    window.handleExportLearningData = handleExportLearningData;
    window.handleImportLearningData = handleImportLearningData;
    window.handleExportRSSData = handleExportRSSData;
    window.handleImportRSSData = handleImportRSSData;
    window.handleClearAllData = handleClearAllData;
    window.showSettingsTab = showSettingsTab;
    window.handleSubmitRSSForm = handleSubmitRSSForm;

    // DOMContentLoaded後にアプリケーション初期化
    document.addEventListener('DOMContentLoaded', () => {
        initializeData();
        render();
    });

})();

// app.jsの最後に以下を追加

// =========================================== 
// レンダリング関数
// ===========================================
const render = () => {
    const app = document.getElementById('app');
    if (!app) return;

    const { articles } = DataHooks.useArticles();
    const { folders } = DataHooks.useFolders();
    const { rssFeeds } = DataHooks.useRSSManager();
    const { aiLearning } = DataHooks.useAILearning();
    const { wordFilters } = DataHooks.useWordFilters();

    // フィルタリングされた記事
    let filteredArticles = articles;
    
    // フォルダフィルター
    if (state.selectedFolder !== 'all') {
        const selectedFolderFeeds = rssFeeds.filter(feed => feed.folderId === state.selectedFolder);
        const selectedFeedSources = selectedFolderFeeds.map(feed => RSSProcessor.extractDomain(feed.url));
        filteredArticles = filteredArticles.filter(article => 
            selectedFeedSources.some(source => article.rssSource.includes(source) || source.includes(article.rssSource))
        );
    }

    // 表示モードフィルター
    if (state.viewMode === 'unread') {
        filteredArticles = filteredArticles.filter(article => article.readStatus === 'unread');
    } else if (state.viewMode === 'readLater') {
        filteredArticles = filteredArticles.filter(article => article.readLater);
    }

    // NGワードフィルター
    filteredArticles = WordFilterManager.filterArticles(filteredArticles, wordFilters);

    // AIスコアによるソート
    filteredArticles = AIScoring.sortArticlesByScore(filteredArticles, aiLearning, wordFilters);

    app.innerHTML = `
        <nav class="nav">
            <div class="nav-left">
                <h1>📰 Minews</h1>
                ${state.lastUpdate ? `<div class="last-update">最終更新: ${formatDate(state.lastUpdate)}</div>` : ''}
            </div>
            <div class="nav-filters">
                <div class="filter-group">
                    <label>表示:</label>
                    <select class="filter-select" onchange="handleViewModeChange(this.value)" ${state.isLoading ? 'disabled' : ''}>
                        <option value="all" ${state.viewMode === 'all' ? 'selected' : ''}>すべて</option>
                        <option value="unread" ${state.viewMode === 'unread' ? 'selected' : ''}>未読のみ</option>
                        <option value="readLater" ${state.viewMode === 'readLater' ? 'selected' : ''}>後で読む</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label>フォルダ:</label>
                    <select class="filter-select" onchange="handleFolderChange(this.value)" ${state.isLoading ? 'disabled' : ''}>
                        <option value="all" ${state.selectedFolder === 'all' ? 'selected' : ''}>すべて</option>
                        ${folders.map(folder => `
                            <option value="${folder.id}" ${state.selectedFolder === folder.id ? 'selected' : ''}>
                                ${escapeXml(folder.name)}
                            </option>
                        `).join('')}
                    </select>
                </div>
            </div>
            <div class="nav-actions">
                <button class="action-btn refresh-btn ${state.isLoading ? 'loading' : ''}" 
                        onclick="handleRefreshFeeds()" 
                        ${state.isLoading ? 'disabled' : ''}>
                    ${state.isLoading ? '更新中...' : '🔄 更新'}
                </button>
                <button class="action-btn" onclick="showModal('rss')">📡 RSS管理</button>
                <button class="action-btn" onclick="showModal('folders')">📁 フォルダ</button>
                <button class="action-btn" onclick="showModal('words')">🔍 ワード</button>
                <button class="action-btn" onclick="showModal('export')">⚙️ データ</button>
            </div>
        </nav>

        <main class="main-content">
            ${filteredArticles.length > 0 ? `
                <div class="article-grid">
                    ${filteredArticles.map(article => `
                        <article class="article-card" data-read-status="${article.readStatus}">
                            <header class="article-header">
                                <h2 class="article-title">
                                    <a href="${article.url}" target="_blank" rel="noopener noreferrer" 
                                       onclick="handleArticleClick('${article.id}')">
                                        ${escapeXml(article.title)}
                                    </a>
                                </h2>
                                <div class="article-meta">
                                    <span class="date">${formatDate(article.publishDate)}</span>
                                    <span class="source">${escapeXml(article.rssSource)}</span>
                                    <span class="category">${escapeXml(article.category)}</span>
                                    <span class="ai-score">スコア: ${article.aiScore || 50}</span>
                                    ${article.userRating > 0 ? `<span class="rating-badge">${'★'.repeat(article.userRating)}</span>` : ''}
                                </div>
                            </header>
                            <div class="article-content">${truncateText(article.content)}</div>
                            ${article.keywords && article.keywords.length > 0 ? `
                                <div class="article-keywords">
                                    ${article.keywords.map(keyword => `<span class="keyword">${escapeXml(keyword)}</span>`).join('')}
                                </div>
                            ` : ''}
                            <div class="article-actions">
                                <button class="simple-btn read-status" onclick="toggleReadStatus('${article.id}')">
                                    ${article.readStatus === 'read' ? '未読に戻す' : '既読'}
                                </button>
                                <button class="simple-btn read-later" data-active="${article.readLater}" onclick="toggleReadLater('${article.id}')">
                                    ${article.readLater ? '解除' : '後で読む'}
                                </button>
                                <button class="simple-btn" onclick="removeArticle('${article.id}')">削除</button>
                            </div>
                            ${createStarRating(article.userRating, article.id)}
                        </article>
                    `).join('')}
                </div>
            ` : `
                <div class="empty-message">
                    ${state.isLoading ? '記事を読み込み中...' : 'RSSフィードを追加して記事を取得してください'}
                </div>
            `}
        </main>

        ${renderModal()}
    `;
};

// =========================================== 
// イベントハンドラー関数
// ===========================================
const handleViewModeChange = (viewMode) => {
    setState({ viewMode });
};

const handleFolderChange = (selectedFolder) => {
    setState({ selectedFolder });
};

const handleArticleClick = (articleId) => {
    const articlesHook = DataHooks.useArticles();
    articlesHook.updateArticle(articleId, { readStatus: 'read' });
};

const toggleReadStatus = (articleId) => {
    const articlesHook = DataHooks.useArticles();
    const article = state.articles.find(a => a.id === articleId);
    const newStatus = article.readStatus === 'read' ? 'unread' : 'read';
    articlesHook.updateArticle(articleId, { readStatus: newStatus });
};

const toggleReadLater = (articleId) => {
    const articlesHook = DataHooks.useArticles();
    const article = state.articles.find(a => a.id === articleId);
    articlesHook.updateArticle(articleId, { readLater: !article.readLater });
};

const removeArticle = (articleId) => {
    if (confirm('この記事を削除しますか？')) {
        const articlesHook = DataHooks.useArticles();
        articlesHook.removeArticle(articleId);
    }
};

const handleRefreshFeeds = async () => {
    setState({ isLoading: true });
    try {
        const rssHook = DataHooks.useRSSManager();
        const result = await rssHook.fetchAllFeeds();
        setState({ 
            isLoading: false, 
            lastUpdate: new Date().toISOString() 
        });
        alert(`更新完了: ${result.totalAdded}件の新しい記事を取得しました`);
    } catch (error) {
        setState({ isLoading: false });
        alert('更新に失敗しました: ' + error.message);
    }
};

const showModal = (modalType) => {
    setState({ showModal: modalType });
};

const hideModal = () => {
    setState({ showModal: null });
};

const renderModal = () => {
    if (!state.showModal) return '';
    
    return `
        <div class="modal-overlay" onclick="event.target === this && hideModal()">
            <div class="modal">
                <div class="modal-header">
                    <h2>${getModalTitle(state.showModal)}</h2>
                    <button class="modal-close" onclick="hideModal()">×</button>
                </div>
                <div class="modal-body">
                    ${getModalContent(state.showModal)}
                </div>
            </div>
        </div>
    `;
};

const getModalTitle = (modalType) => {
    const titles = {
        rss: 'RSS管理',
        folders: 'フォルダ管理',
        words: 'ワード管理',
        export: 'データ管理'
    };
    return titles[modalType] || '';
};

const getModalContent = (modalType) => {
    // モーダルの内容を実装
    return `<p>${modalType}の管理画面（実装中）</p>`;
};

// =========================================== 
// アプリケーション初期化
// ===========================================
const initializeApp = async () => {
    console.log('Minews PWA 初期化開始...');
    
    try {
        // データ初期化
        initializeData();
        
        // 初回レンダリング
        render();
        
        console.log('Minews PWA 初期化完了');
    } catch (error) {
        console.error('初期化エラー:', error);
        document.getElementById('app').innerHTML = `
            <div class="error-message">
                アプリケーションの初期化に失敗しました: ${error.message}
            </div>
        `;
    }
};

// DOM読み込み完了時に初期化実行
document.addEventListener('DOMContentLoaded', initializeApp);

})(); // 即座実行関数の終了
