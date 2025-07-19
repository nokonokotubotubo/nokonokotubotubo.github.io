// 共通ユーティリティ関数（仕様書準拠）
class Utils {
    constructor() {
        // 日本語処理用正規表現
        this.JAPANESE_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
        
        // URL検証用正規表現
        this.URL_REGEX = /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/;
        
        // RSS検証用正規表現
        this.RSS_REGEX = /\.(xml|rss|atom)(\?.*)?$/i;
        
        // 日時フォーマット
        this.DATE_FORMATS = {
            SHORT: 'MM/DD',
            MEDIUM: 'YYYY/MM/DD',
            LONG: 'YYYY/MM/DD HH:mm',
            RELATIVE: 'relative'
        };
    }
    
    // 文字列操作ユーティリティ
    static truncateText(text, maxLength = 100, suffix = '...') {
        if (!text || typeof text !== 'string') return '';
        
        if (text.length <= maxLength) return text;
        
        return text.substring(0, maxLength - suffix.length).trim() + suffix;
    }
    
    static sanitizeHTML(html) {
        if (!html || typeof html !== 'string') return '';
        
        const temp = document.createElement('div');
        temp.textContent = html;
        return temp.innerHTML;
    }
    
    static stripHTML(html) {
        if (!html || typeof html !== 'string') return '';
        
        const temp = document.createElement('div');
        temp.innerHTML = html;
        return temp.textContent || temp.innerText || '';
    }
    
    static escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    
    static highlightKeywords(text, keywords, className = 'keyword-highlight') {
        if (!text || !Array.isArray(keywords) || keywords.length === 0) {
            return text;
        }
        
        let highlightedText = text;
        
        keywords.forEach(keyword => {
            if (keyword && keyword.trim()) {
                const escapedKeyword = this.escapeRegExp(keyword.trim());
                const regex = new RegExp(`(${escapedKeyword})`, 'gi');
                highlightedText = highlightedText.replace(regex, 
                    `<span class="${className}">$1</span>`);
            }
        });
        
        return highlightedText;
    }
    
    // 日時操作ユーティリティ
    static formatDate(dateString, format = 'RELATIVE') {
        try {
            const date = new Date(dateString);
            const now = new Date();
            
            if (isNaN(date.getTime())) {
                return '不明な日時';
            }
            
            switch (format) {
                case 'RELATIVE':
                    return this.getRelativeTime(date, now);
                case 'SHORT':
                    return `${date.getMonth() + 1}/${date.getDate()}`;
                case 'MEDIUM':
                    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
                case 'LONG':
                    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                default:
                    return date.toLocaleDateString('ja-JP');
            }
        } catch (error) {
            console.error('Date formatting error:', error);
            return '日時エラー';
        }
    }
    
    static getRelativeTime(date, now = new Date()) {
        const diffMs = now.getTime() - date.getTime();
        const diffSeconds = Math.floor(diffMs / 1000);
        const diffMinutes = Math.floor(diffSeconds / 60);
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);
        const diffWeeks = Math.floor(diffDays / 7);
        const diffMonths = Math.floor(diffDays / 30);
        
        if (diffSeconds < 60) {
            return 'たった今';
        } else if (diffMinutes < 60) {
            return `${diffMinutes}分前`;
        } else if (diffHours < 24) {
            return `${diffHours}時間前`;
        } else if (diffDays < 7) {
            return `${diffDays}日前`;
        } else if (diffWeeks < 4) {
            return `${diffWeeks}週間前`;
        } else if (diffMonths < 12) {
            return `${diffMonths}ヶ月前`;
        } else {
            return date.toLocaleDateString('ja-JP');
        }
    }
    
    static parseDate(dateString) {
        if (!dateString) return null;
        
        try {
            // 様々な日時フォーマットに対応
            const formats = [
                // ISO形式
                /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/,
                // RFC形式
                /^[A-Za-z]{3},?\s+\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s+\d{2}:\d{2}:\d{2}/,
                // 基本形式
                /^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}$/
            ];
            
            const date = new Date(dateString);
            return isNaN(date.getTime()) ? null : date;
            
        } catch (error) {
            console.error('Date parsing error:', error, dateString);
            return null;
        }
    }
    
    // URL操作ユーティリティ
    static isValidURL(url) {
        if (!url || typeof url !== 'string') return false;
        
        try {
            new URL(url);
            return this.URL_REGEX.test(url);
        } catch {
            return false;
        }
    }
    
    static isValidRSSURL(url) {
        if (!this.isValidURL(url)) return false;
        
        // RSS的なパスを含むかチェック
        const lowerUrl = url.toLowerCase();
        return lowerUrl.includes('rss') || 
               lowerUrl.includes('feed') || 
               lowerUrl.includes('atom') || 
               this.RSS_REGEX.test(lowerUrl);
    }
    
    static extractDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace(/^www\./, '');
        } catch {
            return 'unknown';
        }
    }
    
    static normalizeURL(url) {
        if (!url) return '';
        
        try {
            const urlObj = new URL(url.trim());
            return urlObj.href;
        } catch {
            // プロトコルが未指定の場合はhttpsを追加
            try {
                const urlObj = new URL('https://' + url.trim());
                return urlObj.href;
            } catch {
                return url;
            }
        }
    }
    
    // データ検証ユーティリティ
    static validateArticleData(article) {
        const errors = [];
        
        if (!article || typeof article !== 'object') {
            return { valid: false, errors: ['Invalid article object'] };
        }
        
        // 必須フィールド検証
        const requiredFields = ['articleId', 'title', 'url'];
        requiredFields.forEach(field => {
            if (!article[field] || typeof article[field] !== 'string' || article[field].trim() === '') {
                errors.push(`Missing or invalid ${field}`);
            }
        });
        
        // URL検証
        if (article.url && !this.isValidURL(article.url)) {
            errors.push('Invalid URL format');
        }
        
        // 日時検証
        if (article.publishDate && !this.parseDate(article.publishDate)) {
            errors.push('Invalid publishDate format');
        }
        
        // スコア検証
        if (article.interestScore !== undefined) {
            const score = parseInt(article.interestScore);
            if (isNaN(score) || score < 0 || score > 100) {
                errors.push('Invalid interestScore (must be 0-100)');
            }
        }
        
        return {
            valid: errors.length === 0,
            errors: errors
        };
    }
    
    static validateRSSFeedData(feed) {
        const errors = [];
        
        if (!feed || typeof feed !== 'object') {
            return { valid: false, errors: ['Invalid feed object'] };
        }
        
        // 必須フィールド検証
        if (!feed.id || typeof feed.id !== 'string') {
            errors.push('Missing or invalid id');
        }
        
        if (!feed.name || typeof feed.name !== 'string') {
            errors.push('Missing or invalid name');
        }
        
        if (!feed.url || !this.isValidRSSURL(feed.url)) {
            errors.push('Missing or invalid RSS URL');
        }
        
        return {
            valid: errors.length === 0,
            errors: errors
        };
    }
    
    // 配列操作ユーティリティ
    static groupBy(array, keyFn) {
        if (!Array.isArray(array)) return {};
        
        return array.reduce((groups, item) => {
            const key = keyFn(item);
            groups[key] = groups[key] || [];
            groups[key].push(item);
            return groups;
        }, {});
    }
    
    static sortBy(array, keyFn, order = 'asc') {
        if (!Array.isArray(array)) return [];
        
        return [...array].sort((a, b) => {
            const valueA = keyFn(a);
            const valueB = keyFn(b);
            
            let comparison = 0;
            if (valueA > valueB) comparison = 1;
            if (valueA < valueB) comparison = -1;
            
            return order === 'desc' ? -comparison : comparison;
        });
    }
    
    static uniqueBy(array, keyFn) {
        if (!Array.isArray(array)) return [];
        
        const seen = new Set();
        return array.filter(item => {
            const key = keyFn(item);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }
    
    static chunk(array, size) {
        if (!Array.isArray(array) || size <= 0) return [];
        
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
    
    // ローカルストレージユーティリティ
    static setStorageItem(key, value, expirationHours = null) {
        try {
            const data = {
                value: value,
                timestamp: Date.now(),
                expiration: expirationHours ? Date.now() + (expirationHours * 60 * 60 * 1000) : null
            };
            
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Storage set error:', error);
            return false;
        }
    }
    
    static getStorageItem(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            if (!item) return defaultValue;
            
            const data = JSON.parse(item);
            
            // 有効期限チェック
            if (data.expiration && Date.now() > data.expiration) {
                localStorage.removeItem(key);
                return defaultValue;
            }
            
            return data.value;
        } catch (error) {
            console.error('Storage get error:', error);
            return defaultValue;
        }
    }
    
    static removeStorageItem(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Storage remove error:', error);
            return false;
        }
    }
    
    static getStorageSize() {
        let total = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                total += localStorage[key].length + key.length;
            }
        }
        return total;
    }
    
    static clearExpiredStorage() {
        const keysToRemove = [];
        
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                try {
                    const data = JSON.parse(localStorage[key]);
                    if (data.expiration && Date.now() > data.expiration) {
                        keysToRemove.push(key);
                    }
                } catch {
                    // JSON parse失敗は無視
                }
            }
        }
        
        keysToRemove.forEach(key => localStorage.removeItem(key));
        return keysToRemove.length;
    }
    
    // パフォーマンス関連ユーティリティ
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    static throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
    
    static async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    static measureTime(label) {
        const startTime = performance.now();
        
        return {
            end: () => {
                const endTime = performance.now();
                const duration = endTime - startTime;
                console.log(`${label}: ${duration.toFixed(2)}ms`);
                return duration;
            }
        };
    }
    
    // ハッシュ生成ユーティリティ
    static generateHash(str) {
        let hash = 0;
        if (str.length === 0) return hash.toString();
        
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 32bit整数変換
        }
        
        return Math.abs(hash).toString();
    }
    
    static generateArticleId(url, publishDate) {
        const domain = this.extractDomain(url);
        const urlHash = this.generateHash(url);
        const timestamp = this.parseDate(publishDate)?.getTime() || Date.now();
        
        return `${domain}_${urlHash}_${timestamp}`;
    }
    
    // エラーハンドリングユーティリティ
    static createError(type, message, details = {}) {
        const error = new Error(message);
        error.type = type;
        error.details = details;
        error.timestamp = new Date().toISOString();
        
        return error;
    }
    
    static logError(error, context = '') {
        const errorInfo = {
            message: error.message,
            type: error.type || 'Unknown',
            stack: error.stack,
            context: context,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent
        };
        
        console.error('Application Error:', errorInfo);
        
        // エラーログをローカルストレージに保存（開発用）
        try {
            const errorLogs = JSON.parse(localStorage.getItem('yourNews_errorLogs') || '[]');
            errorLogs.push(errorInfo);
            
            // 最新100件のみ保持
            if (errorLogs.length > 100) {
                errorLogs.splice(0, errorLogs.length - 100);
            }
            
            localStorage.setItem('yourNews_errorLogs', JSON.stringify(errorLogs));
        } catch (logError) {
            console.warn('Error logging failed:', logError);
        }
    }
    
    // UI関連ユーティリティ
    static createElement(tag, className = '', textContent = '', attributes = {}) {
        const element = document.createElement(tag);
        
        if (className) {
            element.className = className;
        }
        
        if (textContent) {
            element.textContent = textContent;
        }
        
        Object.entries(attributes).forEach(([key, value]) => {
            element.setAttribute(key, value);
        });
        
        return element;
    }
    
    static addEventListenerOnce(element, event, handler) {
        const wrapper = (e) => {
            handler(e);
            element.removeEventListener(event, wrapper);
        };
        element.addEventListener(event, wrapper);
    }
    
    static isElementInViewport(element) {
        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    }
    
    static smoothScrollTo(element, duration = 500) {
        const targetPosition = element.offsetTop;
        const startPosition = window.pageYOffset;
        const distance = targetPosition - startPosition;
        let startTime = null;
        
        function animation(currentTime) {
            if (startTime === null) startTime = currentTime;
            const timeElapsed = currentTime - startTime;
            const run = ease(timeElapsed, startPosition, distance, duration);
            window.scrollTo(0, run);
            if (timeElapsed < duration) requestAnimationFrame(animation);
        }
        
        function ease(t, b, c, d) {
            t /= d / 2;
            if (t < 1) return c / 2 * t * t + b;
            t--;
            return -c / 2 * (t * (t - 2) - 1) + b;
        }
        
        requestAnimationFrame(animation);
    }
    
    // 開発・デバッグユーティリティ
    static getAppInfo() {
        return {
            version: '1.0.0',
            buildDate: new Date().toISOString(),
            userAgent: navigator.userAgent,
            screenResolution: `${screen.width}x${screen.height}`,
            windowSize: `${window.innerWidth}x${window.innerHeight}`,
            localStorage: {
                available: typeof Storage !== 'undefined',
                size: this.getStorageSize(),
                used: Object.keys(localStorage).length
            },
            tensorflow: typeof tf !== 'undefined' ? tf.version.tfjs : 'Not loaded',
            features: {
                serviceWorker: 'serviceWorker' in navigator,
                intersectionObserver: 'IntersectionObserver' in window,
                fetch: 'fetch' in window
            }
        };
    }
    
    static exportAppData() {
        const data = {
            articles: JSON.parse(localStorage.getItem('yourNews_articles') || '[]'),
            rssFeeds: JSON.parse(localStorage.getItem('yourNews_rssFeeds') || '[]'),
            preferences: JSON.parse(localStorage.getItem('yourNews_userPrefs') || '{}'),
            keywords: JSON.parse(localStorage.getItem('yourNews_keywords') || '{}'),
            exportDate: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `your-news-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
    }
    
    static async importAppData(file) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            // データ検証
            if (!data.articles || !Array.isArray(data.articles)) {
                throw new Error('Invalid backup file format');
            }
            
            // バックアップ作成
            const backup = {
                articles: localStorage.getItem('yourNews_articles'),
                rssFeeds: localStorage.getItem('yourNews_rssFeeds'),
                preferences: localStorage.getItem('yourNews_userPrefs'),
                keywords: localStorage.getItem('yourNews_keywords')
            };
            localStorage.setItem('yourNews_backup', JSON.stringify(backup));
            
            // データ復元
            localStorage.setItem('yourNews_articles', JSON.stringify(data.articles));
            localStorage.setItem('yourNews_rssFeeds', JSON.stringify(data.rssFeeds || []));
            localStorage.setItem('yourNews_userPrefs', JSON.stringify(data.preferences || {}));
            localStorage.setItem('yourNews_keywords', JSON.stringify(data.keywords || {}));
            
            return { success: true, importedCount: data.articles.length };
            
        } catch (error) {
            console.error('Import error:', error);
            return { success: false, error: error.message };
        }
    }
}

// Phase C確認用デバッグ関数
window.debugUtils = function() {
    console.log('=== Utils Debug ===');
    
    // 基本機能テスト
    console.log('Text truncation:', Utils.truncateText('これは長いテキストのテストです', 10));
    console.log('Date formatting:', Utils.formatDate(new Date(), 'RELATIVE'));
    console.log('URL validation:', Utils.isValidURL('https://example.com/rss.xml'));
    console.log('RSS URL validation:', Utils.isValidRSSURL('https://example.com/feed.xml'));
    
    // ストレージテスト
    Utils.setStorageItem('test_key', 'test_value', 1);
    console.log('Storage test:', Utils.getStorageItem('test_key'));
    
    // ハッシュ生成テスト
    console.log('Hash generation:', Utils.generateHash('test string'));
    
    // アプリ情報取得
    console.log('App info:', Utils.getAppInfo());
    
    console.log('=== Utils Debug Complete ===');
};
