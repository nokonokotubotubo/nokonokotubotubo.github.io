// ユーティリティ関数集（仕様書準拠）
class Utils {
    // テキストサニタイズ（XSS対策）
    static sanitizeHTML(text) {
        if (!text) return '';
        
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // HTMLエンティティデコード
    static decodeHTML(html) {
        if (!html) return '';
        
        const textarea = document.createElement('textarea');
        textarea.innerHTML = html;
        return textarea.value;
    }
    
    // 日付フォーマット
    static formatDate(dateString, format = 'relative') {
        try {
            const date = new Date(dateString);
            const now = new Date();
            
            if (format === 'relative') {
                const diffMs = now - date;
                const diffMinutes = Math.floor(diffMs / (1000 * 60));
                const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                
                if (diffMinutes < 1) return '今';
                if (diffMinutes < 60) return `${diffMinutes}分前`;
                if (diffHours < 24) return `${diffHours}時間前`;
                if (diffDays < 7) return `${diffDays}日前`;
                
                return date.toLocaleDateString('ja-JP');
            }
            
            if (format === 'full') {
                return date.toLocaleString('ja-JP');
            }
            
            if (format === 'date') {
                return date.toLocaleDateString('ja-JP');
            }
            
            return date.toISOString();
            
        } catch (error) {
            console.error('Date format error:', error);
            return '不明';
        }
    }
    
    // デバウンス（検索入力等で使用）
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
    
    // スロットル（スクロールイベント等で使用）
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
    
    // URL検証
    static isValidURL(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }
    
    // RSS URL検証
    static isValidRSSURL(url) {
        if (!this.isValidURL(url)) return false;
        
        // 一般的なRSSパターンをチェック
        const rssPatterns = [
            /\/rss\/?$/i,
            /\/feed\/?$/i,
            /\/feeds?\/?$/i,
            /\.rss$/i,
            /\.xml$/i,
            /rss\.xml$/i,
            /feed\.xml$/i
        ];
        
        return rssPatterns.some(pattern => pattern.test(url));
    }
    
    // ドメイン抽出
    static extractDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace(/^www\./, '');
        } catch (error) {
            return 'unknown';
        }
    }
    
    // ファイルサイズフォーマット
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // 配列のシャッフル
    static shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
    
    // 重複除去
    static uniqueArray(array, key = null) {
        if (key) {
            const seen = new Set();
            return array.filter(item => {
                const keyValue = item[key];
                if (seen.has(keyValue)) {
                    return false;
                } else {
                    seen.add(keyValue);
                    return true;
                }
            });
        }
        
        return [...new Set(array)];
    }
    
    // オブジェクトのディープコピー
    static deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => this.deepClone(item));
        if (typeof obj === 'object') {
            const cloned = {};
            Object.keys(obj).forEach(key => {
                cloned[key] = this.deepClone(obj[key]);
            });
            return cloned;
        }
    }
    
    // ローカルストレージヘルパー
    static getStorageItem(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error('Storage get error:', error);
            return defaultValue;
        }
    }
    
    static setStorageItem(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Storage set error:', error);
            return false;
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
    
    // クリップボード操作
    static async copyToClipboard(text) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            } else {
                // フォールバック
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                
                const result = document.execCommand('copy');
                document.body.removeChild(textArea);
                return result;
            }
        } catch (error) {
            console.error('Clipboard copy error:', error);
            return false;
        }
    }
    
    // 色関連ユーティリティ
    static hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }
    
    static rgbToHex(r, g, b) {
        return "#" + [r, g, b].map(x => {
            const hex = x.toString(16);
            return hex.length === 1 ? "0" + hex : hex;
        }).join("");
    }
    
    // パフォーマンス測定
    static performance = {
        timers: new Map(),
        
        start(label) {
            this.timers.set(label, performance.now());
        },
        
        end(label) {
            const startTime = this.timers.get(label);
            if (startTime) {
                const duration = performance.now() - startTime;
                console.log(`[Performance] ${label}: ${duration.toFixed(2)}ms`);
                this.timers.delete(label);
                return duration;
            }
            return 0;
        }
    };
    
    // エラーレポート
    static reportError(error, context = '', additionalInfo = {}) {
        const errorReport = {
            message: error.message || 'Unknown error',
            stack: error.stack || 'No stack trace',
            timestamp: new Date().toISOString(),
            url: window.location.href,
            userAgent: navigator.userAgent,
            context: context,
            additionalInfo: additionalInfo
        };
        
        console.error('Error Report:', errorReport);
        
        // 本番環境では外部ログサービスに送信することも可能
        // this.sendErrorToService(errorReport);
        
        return errorReport;
    }
    
    // デバイス検出
    static device = {
        isMobile() {
            return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        },
        
        isTablet() {
            return /iPad|Android/i.test(navigator.userAgent) && window.innerWidth >= 768;
        },
        
        isDesktop() {
            return !this.isMobile() && !this.isTablet();
        },
        
        isIOS() {
            return /iPad|iPhone|iPod/.test(navigator.userAgent);
        },
        
        isAndroid() {
            return /Android/.test(navigator.userAgent);
        },
        
        isChrome() {
            return /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
        },
        
        isSafari() {
            return /Safari/.test(navigator.userAgent) && /Apple Computer/.test(navigator.vendor);
        }
    };
    
    // バリデーション関数
    static validation = {
        email(email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(email);
        },
        
        url(url) {
            try {
                new URL(url);
                return true;
            } catch {
                return false;
            }
        },
        
        notEmpty(value) {
            return value !== null && value !== undefined && value.toString().trim() !== '';
        },
        
        minLength(value, min) {
            return value && value.toString().length >= min;
        },
        
        maxLength(value, max) {
            return value && value.toString().length <= max;
        },
        
        isNumber(value) {
            return !isNaN(value) && !isNaN(parseFloat(value));
        },
        
        isInteger(value) {
            return Number.isInteger(Number(value));
        },
        
        inRange(value, min, max) {
            const num = Number(value);
            return num >= min && num <= max;
        }
    };
    
    // 文字列ユーティリティ
    static string = {
        truncate(str, length, suffix = '...') {
            if (!str || str.length <= length) return str;
            return str.substring(0, length) + suffix;
        },
        
        capitalize(str) {
            if (!str) return '';
            return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
        },
        
        camelCase(str) {
            return str.replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : '');
        },
        
        kebabCase(str) {
            return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
        },
        
        removeAccents(str) {
            return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        },
        
        wordCount(str) {
            return str.trim().split(/\s+/).length;
        },
        
        highlight(text, query, className = 'highlight') {
            if (!query) return text;
            const regex = new RegExp(`(${query})`, 'gi');
            return text.replace(regex, `<span class="${className}">$1</span>`);
        }
    };
    
    // DOM操作ヘルパー
    static dom = {
        createElement(tag, attributes = {}, children = []) {
            const element = document.createElement(tag);
            
            Object.entries(attributes).forEach(([key, value]) => {
                if (key === 'className') {
                    element.className = value;
                } else if (key === 'innerHTML') {
                    element.innerHTML = value;
                } else if (key === 'textContent') {
                    element.textContent = value;
                } else {
                    element.setAttribute(key, value);
                }
            });
            
            children.forEach(child => {
                if (typeof child === 'string') {
                    element.appendChild(document.createTextNode(child));
                } else {
                    element.appendChild(child);
                }
            });
            
            return element;
        },
        
        removeChildren(element) {
            while (element.firstChild) {
                element.removeChild(element.firstChild);
            }
        },
        
        insertAfter(newElement, targetElement) {
            targetElement.parentNode.insertBefore(newElement, targetElement.nextSibling);
        },
        
        getViewportSize() {
            return {
                width: Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0),
                height: Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0)
            };
        },
        
        isElementInViewport(element) {
            const rect = element.getBoundingClientRect();
            const viewport = this.getViewportSize();
            
            return (
                rect.top >= 0 &&
                rect.left >= 0 &&
                rect.bottom <= viewport.height &&
                rect.right <= viewport.width
            );
        },
        
        scrollToElement(element, behavior = 'smooth') {
            element.scrollIntoView({ behavior, block: 'nearest' });
        }
    };
    
    // 数学ユーティリティ
    static math = {
        clamp(value, min, max) {
            return Math.min(Math.max(value, min), max);
        },
        
        lerp(start, end, factor) {
            return start + (end - start) * factor;
        },
        
        randomBetween(min, max) {
            return Math.random() * (max - min) + min;
        },
        
        randomInt(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        },
        
        round(value, decimals = 0) {
            const factor = Math.pow(10, decimals);
            return Math.round(value * factor) / factor;
        },
        
        average(numbers) {
            return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
        },
        
        median(numbers) {
            const sorted = [...numbers].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 === 0 
                ? (sorted[mid - 1] + sorted[mid]) / 2 
                : sorted[mid];
        }
    };
}

// グローバルに公開（後方互換性）
window.Utils = Utils;
