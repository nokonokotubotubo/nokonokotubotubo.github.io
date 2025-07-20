// ArticleCard - NGドメイン機能削除版・構文エラー完全修正版

class ArticleCard {
    constructor() {
        this.cardTemplate = null;
        this.initializeTemplate();
        this.imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.classList.remove('lazy');
                        this.imageObserver.unobserve(img);
                    }
                }
            });
        }, { rootMargin: '50px' });
        this.touchState = { startX: 0, startY: 0, currentX: 0, currentY: 0, isDragging: false };
    }

    // テンプレート初期化（重要メソッド・完全定義）
    initializeTemplate() {
        try {
            this.cardTemplate = {
                // 基本テンプレート構造
                structure: {
                    header: ['interest-score', 'keywords'],
                    meta: ['domain', 'date', 'category'],
                    content: ['title', 'excerpt'],
                    actions: ['feedback-buttons', 'action-buttons']
                },
                // スコア分類
                scoreClassification: {
                    high: { threshold: 70, class: 'score-high' },
                    medium: { threshold: 40, class: 'score-medium' },
                    low: { threshold: 0, class: 'score-low' }
                },
                // デフォルト設定
                defaults: {
                    scoreRange: { min: 0, max: 100 },
                    excerptLength: 200,
                    titleLength: 100,
                    keywordLimit: 5
                }
            };
            console.log('ArticleCard template initialized');
        } catch (error) {
            console.error('Template initialization error:', error);
            this.cardTemplate = null;
        }
    }

    // 記事カード作成（メインメソッド）
    createCard(article) {
        try {
            if (!article) {
                console.error('Article data is required');
                return '';
            }

            const interestScore = this.validateScore(article.interestScore);
            const scoreClass = this.getScoreClass(interestScore);

            return `
                <div class="article-card ${article.readStatus === 'read' ? 'read' : ''}" 
                     data-article-id="${article.articleId}">
                    
                    <div class="card-header">
                        <div class="interest-score ${scoreClass}">${interestScore}点</div>
                        ${this.createKeywordHighlights(article.matchedKeywords)}
                    </div>

                    <div class="card-meta">
                        <span class="domain">${this.sanitizeText(article.domain)}</span>
                        <span class="publish-date">${this.formatDate(article.publishDate)}</span>
                        <span class="category">${this.sanitizeText(article.category)}</span>
                    </div>

                    <div class="card-content">
                        <h3 class="article-title" onclick="openArticle('${article.articleId}')">
                            ${this.sanitizeText(article.title)}
                        </h3>
                        <p class="article-excerpt">${this.sanitizeText(article.excerpt)}</p>
                    </div>

                    <div class="card-actions">
                        ${this.createFeedbackButtons(article)}
                        <div class="card-actions-right">
                            ${this.createActionButtons(article)}
                        </div>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Card creation error:', error);
            return this.createErrorCard(article, error.message);
        }
    }

    // フィードバックボタン生成（NGドメイン削除版）
    createFeedbackButtons(article) {
        try {
            return `
                <div class="feedback-buttons">
                    <button class="feedback-btn interest" onclick="processFeedback('${article.articleId}', 1)">
                        👍 興味あり
                    </button>
                    <button class="feedback-btn disinterest" onclick="processFeedback('${article.articleId}', -1)">
                        👎 興味なし
                    </button>
                </div>
            `;
        } catch (error) {
            console.error('Feedback buttons creation error:', error);
            return '<div class="feedback-buttons"><!-- Error: 按钮生成失败 --></div>';
        }
    }

    // アクションボタン生成
    createActionButtons(article) {
        try {
            return `
                <button class="favorite-btn ${article.favorited ? 'active' : ''}" 
                        onclick="toggleFavorite('${article.articleId}')">
                    ⭐ ${article.favorited ? 'お気に入り済み' : 'お気に入り'}
                </button>
                <button class="read-toggle-btn" 
                        data-read="${article.readStatus === 'read'}" 
                        onclick="toggleReadStatus('${article.articleId}')">
                    ${article.readStatus === 'read' ? '✅ 既読' : '📖 未読'}
                </button>
            `;
        } catch (error) {
            console.error('Action buttons creation error:', error);
            return '<div class="action-buttons"><!-- Error: アクションボタン生成失敗 --></div>';
        }
    }

    // キーワードハイライト生成
    createKeywordHighlights(keywords) {
        try {
            if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
                return '';
            }

            const maxDisplay = this.cardTemplate?.defaults?.keywordLimit || 5;
            const displayKeywords = keywords.slice(0, maxDisplay);
            const remainingCount = keywords.length - maxDisplay;

            const keywordHtml = displayKeywords.map(keyword => 
                `<span class="keyword-highlight">${this.sanitizeText(keyword)}</span>`
            ).join('');

            const moreHtml = remainingCount > 0 ? 
                `<span class="keyword-more">+${remainingCount}</span>` : '';

            return `
                <div class="matched-keywords">
                    ${keywordHtml}
                    ${moreHtml}
                </div>
            `;
        } catch (error) {
            console.error('Keyword highlights creation error:', error);
            return '';
        }
    }

    // スコア検証
    validateScore(score) {
        try {
            if (typeof score !== 'number' || isNaN(score)) {
                return 50; // デフォルト値
            }

            const min = this.cardTemplate?.defaults?.scoreRange?.min || 0;
            const max = this.cardTemplate?.defaults?.scoreRange?.max || 100;

            return Math.min(Math.max(Math.round(score), min), max);
        } catch (error) {
            console.error('Score validation error:', error);
            return 50;
        }
    }

    // スコアクラス取得
    getScoreClass(score) {
        try {
            if (!this.cardTemplate?.scoreClassification) {
                // フォールバック分類
                if (score >= 70) return 'score-high';
                if (score >= 40) return 'score-medium';
                return 'score-low';
            }

            const classification = this.cardTemplate.scoreClassification;
            
            if (score >= classification.high.threshold) {
                return classification.high.class;
            } else if (score >= classification.medium.threshold) {
                return classification.medium.class;
            } else {
                return classification.low.class;
            }
        } catch (error) {
            console.error('Score class determination error:', error);
            return 'score-medium';
        }
    }

    // 日付フォーマット
    formatDate(dateString) {
        try {
            if (!dateString) return '不明';

            const date = new Date(dateString);
            if (isNaN(date.getTime())) return '不明';

            const now = new Date();
            const diffMs = now - date;
            const diffMinutes = Math.floor(diffMs / (1000 * 60));
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            if (diffMinutes < 1) return '今';
            if (diffMinutes < 60) return `${diffMinutes}分前`;
            if (diffHours < 24) return `${diffHours}時間前`;
            if (diffDays < 7) return `${diffDays}日前`;
            
            return date.toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (error) {
            console.error('Date formatting error:', error);
            return '不明';
        }
    }

    // テキストサニタイズ
    sanitizeText(text) {
        try {
            if (!text || typeof text !== 'string') return '';

            // HTMLタグ除去
            const withoutTags = text.replace(/<[^>]*>/g, '');
            
            // HTMLエンティティデコード
            const textarea = document.createElement('textarea');
            textarea.innerHTML = withoutTags;
            const decoded = textarea.value;

            // 空白文字正規化
            return decoded.replace(/\s+/g, ' ').trim();
        } catch (error) {
            console.error('Text sanitization error:', error);
            return String(text || '');
        }
    }

    // エラーカード生成
    createErrorCard(article, errorMessage) {
        try {
            const articleId = article?.articleId || `error_${Date.now()}`;
            
            return `
                <div class="article-card error-card" data-article-id="${articleId}">
                    <div class="card-header">
                        <div class="interest-score score-low">0点</div>
                    </div>
                    <div class="card-meta">
                        <span class="domain">エラー</span>
                        <span class="category">システム</span>
                    </div>
                    <div class="card-content">
                        <h3 class="article-title">記事表示エラー</h3>
                        <p class="article-excerpt">記事の表示中にエラーが発生しました: ${errorMessage}</p>
                    </div>
                    <div class="card-actions">
                        <div class="error-actions">
                            <button class="btn-retry" onclick="location.reload()">
                                🔄 ページ再読み込み
                            </button>
                        </div>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Error card creation failed:', error);
            return '<div class="article-card error-card">記事表示に失敗しました</div>';
        }
    }

    // カードレイアウト取得
    getCardLayout() {
        return this.cardTemplate?.structure || null;
    }

    // テンプレート設定更新
    updateTemplate(newConfig) {
        try {
            if (newConfig && typeof newConfig === 'object') {
                this.cardTemplate = { ...this.cardTemplate, ...newConfig };
                console.log('Template configuration updated');
                return true;
            }
            return false;
        } catch (error) {
            console.error('Template update error:', error);
            return false;
        }
    }

    // デバッグ用：テンプレート情報表示
    debugTemplate() {
        console.log('ArticleCard Template Debug:', this.cardTemplate);
        return this.cardTemplate;
    }

    // タッチイベント処理（モバイル対応）
    handleTouchStart(event, articleId) {
        try {
            const touch = event.touches[0];
            this.touchState = {
                startX: touch.clientX,
                startY: touch.clientY,
                currentX: touch.clientX,
                currentY: touch.clientY,
                isDragging: false,
                articleId: articleId
            };
        } catch (error) {
            console.error('Touch start handling error:', error);
        }
    }

    handleTouchMove(event, articleId) {
        try {
            if (!this.touchState || this.touchState.articleId !== articleId) return;

            const touch = event.touches[0];
            this.touchState.currentX = touch.clientX;
            this.touchState.currentY = touch.clientY;

            const deltaX = Math.abs(this.touchState.currentX - this.touchState.startX);
            const deltaY = Math.abs(this.touchState.currentY - this.touchState.startY);

            if (deltaX > 10 || deltaY > 10) {
                this.touchState.isDragging = true;
            }
        } catch (error) {
            console.error('Touch move handling error:', error);
        }
    }

    handleTouchEnd(event, articleId) {
        try {
            if (!this.touchState || this.touchState.articleId !== articleId) return;

            const wasDragging = this.touchState.isDragging;
            this.touchState = { startX: 0, startY: 0, currentX: 0, currentY: 0, isDragging: false };

            return !wasDragging; // ドラッグしていなければクリックとして処理
        } catch (error) {
            console.error('Touch end handling error:', error);
            return false;
        }
    }

    // カード統計情報取得
    getCardStats() {
        return {
            templateInitialized: this.cardTemplate !== null,
            observerActive: this.imageObserver !== null,
            touchSupported: 'ontouchstart' in window,
            lastUpdate: new Date().toISOString()
        };
    }
}
