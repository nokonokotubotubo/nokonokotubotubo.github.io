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
            this.lastUpdate = { 
                articles: null, 
                rssFeeds: null, 
                folders: null, 
                aiLearning: null, 
                wordFilters: null 
            }; 
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
    
    extractKeywords(text) { 
        const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'は', 'が', 'を', 'に', 'で', 'と', 'の', 'から', 'まで', 'について', 'という', 'など']; 
        
        // 長音符「ー」を分割文字から除外し、単語の一部として保持
        return [...new Set(
            text.toLowerCase()
                .replace(/[^\w\sぁ-んァ-ン一-龯ー]/g, ' ')  // 「ー」を保護
                .split(/[\s,、。・\-･▪▫◦‣⁃\u3000]/)        // 長音符以外で分割
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
// AI学習システム（修正版）
// =========================================== 
const AIScoring = {
    // NGワード事前フィルタリング
    filterArticles(articles, wordFilters) {
        if (!wordFilters.ngWords || wordFilters.ngWords.length === 0) return articles;
        
        return articles.filter(article => {
            const content = (article.title + ' ' + article.content).toLowerCase();
            return !wordFilters.ngWords.some(ngWord => 
                content.includes(ngWord.toLowerCase())
            );
        });
    },

    calculateScore(article, aiLearning, wordFilters) {
        let score = 0;
        
        // 1. 鮮度スコア（0-20点、指数減衰）
        const hours = (Date.now() - new Date(article.publishDate).getTime()) / (1000 * 60 * 60);
        const freshness = Math.exp(-hours / 72) * 20;  // 72時間半減期
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
        return Math.max(0, Math.min(100, Math.round(score + 50))); // +50でベースライン調整
    },

    updateLearning(article, rating, aiLearning, isRevert = false) {
        // 学習重み：±6点ベース
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
        // 1. NGワード除外
        const filteredArticles = this.filterArticles(articles, wordFilters);
        
        // 2. スコア計算＆ソート
        return filteredArticles.map(article => ({
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
// ワードフィルター管理（修正版）
// =========================================== 
const WordFilterManager = {
    addWord(word, type, wordFilters) {
        word = word.trim();
        if (!word) return false;
        
        const targetArray = type === 'interest' ? wordFilters.interestWords : wordFilters.ngWords;
        
        // 大文字小文字を区別せずに重複チェック
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
        
        // 完全一致で検索（大文字小文字も含めて）
        const index = targetArray.indexOf(word);
        if (index > -1) {
            targetArray.splice(index, 1);
            wordFilters.lastUpdated = new Date().toISOString();
            return true;
        }
        return false;
    },

    // この関数は今後AIScoring.filterArticlesが使用されるため削除可能
    // 互換性のため残しておく
    filterArticles(articles, wordFilters) {
        return AIScoring.filterArticles(articles, wordFilters);
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
        stars += `★`; 
    } 
    return ``; 
}; 

const truncateText = (text, maxLength = 200) => text.length <= maxLength ? text : text.substring(0, maxLength).trim() + '...'; 

// =========================================== 
// イベントハンドラー 
// =========================================== 
const handleFilterClick = mode => setState({ viewMode: mode }); 

const handleFolderFilterClick = folderId => setState({ selectedFolder: folderId }); 

const handleModalOpen = modalType => setState({ showModal: modalType }); 

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
    
    const modalHtml = ` `; 
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
    
    const modalHtml = ` `; 
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

const handleRSSMoveFolderChange = (feedId, newFolderId) => { 
    const rssHook = DataHooks.useRSSManager(); 
    rssHook.updateRSSFeed(feedId, { folderId: newFolderId }); 
    
    if (state.showModal === 'rss') render(); 
}; 

// =========================================== 
// フィルタリング・レンダリング 
// =========================================== 
const getFilteredArticles = () => {
    const aiHook = DataHooks.useAILearning();
    const wordHook = DataHooks.useWordFilters();
    const rssHook = DataHooks.useRSSManager();
    
    // NGワードフィルタリングはAIScoring.sortArticlesByScore内で実行されるため
    // ここでは従来通りの処理を維持
    let filteredByFolder = state.articles;
    
    if (state.selectedFolder !== 'all') {
        if (state.selectedFolder === 'uncategorized') {
            const uncategorizedFeeds = rssHook.rssFeeds.filter(feed => !feed.folderId || feed.folderId === 'uncategorized');
            filteredByFolder = state.articles.filter(article => {
                return uncategorizedFeeds.some(feed => {
                    const matched = FolderManager.matchArticleToFeed(article, [feed]);
                    return matched !== null;
                });
            });
        } else {
            const folderFeeds = rssHook.rssFeeds.filter(feed => feed.folderId === state.selectedFolder);
            filteredByFolder = state.articles.filter(article => {
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

    // AIScoring.sortArticlesByScore内でNGワード除外とスコア計算が実行される
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
    
    return ` `; 
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
    return ``;
}

})();
