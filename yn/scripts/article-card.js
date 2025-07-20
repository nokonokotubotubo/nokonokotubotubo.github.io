// 記事カードコンポーネント（仕様書UI仕様準拠・未読既読機能修正版）
class ArticleCard {
    constructor() {
        // 仕様書記載のカード要素テンプレート
        this.cardTemplate = null;
        this.initializeTemplate();
        
        // 画像遅延読み込みObserver
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
        }, { 
            rootMargin: '50px'
        });
        
        // スワイプ操作状態管理
        this.touchState = {
            startX: 0,
            startY: 0,
            currentX: 0,
            currentY: 0,
            isDragging: false
        };
    }
    
    initializeTemplate() {
        // 仕様書記載のHTML構造テンプレート
        this.cardTemplate = document.createElement('template');
        this.cardTemplate.innerHTML = `
            <div class="article-card" data-article-id="" data-read-status="unread">
                <div class="card-header">
                    <span class="interest-score">50点</span>
                    <div class="matched-keywords"></div>
                    <div class="card-meta">
                        <span class="domain"></span>
                        <span class="publish-date"></span>
                    </div>
                </div>
                <div class="card-content">
                    <div class="article-thumbnail">
                        <img class="lazy article-image" alt="記事画像" data-src="">
                        <div class="thumbnail-placeholder">📰</div>
                    </div>
                    <div class="article-info">
                        <h3 class="article-title"></h3>
                        <p class="article-excerpt"></p>
                    </div>
                </div>
                <div class="card-actions">
                    <div class="feedback-buttons">
                        <button class="feedback-btn interest" data-feedback="1" title="興味あり">
                            👍 <span class="btn-text">興味あり</span>
                        </button>
                        <button class="feedback-btn disinterest" data-feedback="-1" title="興味なし">
                            👎 <span class="btn-text">興味なし</span>
                        </button>
                        <button class="feedback-btn ng-domain" data-feedback="ng" title="ドメインNG">
                            🚫 <span class="btn-text">ドメインNG</span>
                        </button>
                    </div>
                    <div class="card-actions-right">
                        <button class="favorite-btn" data-favorited="false" title="お気に入り">
                            ⭐ <span class="favorite-text">保存</span>
                        </button>
                        <button class="read-toggle-btn" data-read="false" title="既読/未読切替">
                            📖 <span class="read-text">未読</span>
                        </button>
                    </div>
                </div>
                <div class="swipe-indicator"></div>
            </div>
        `;
    }
    
    // 記事カード作成（仕様書データ構造準拠）
    createCard(article) {
        if (!article || !article.articleId) {
            console.error('Invalid article data:', article);
            return null;
        }
        
        try {
            // テンプレートクローン
            const cardElement = this.cardTemplate.content.cloneNode(true);
            const card = cardElement.querySelector('.article-card');
            
            // データ属性設定
            card.dataset.articleId = article.articleId;
            card.dataset.readStatus = article.readStatus || 'unread';
            card.dataset.domain = article.domain || 'unknown';
            
            // 基本情報表示
            this.populateCardContent(card, article);
            
            // 興味度スコア表示
            this.updateInterestScore(card, article.interestScore || 50);
            
            // キーワードハイライト（仕様書準拠）
            this.displayMatchedKeywords(card, article.matchedKeywords || []);
            
            // 状態反映
            this.updateCardStates(card, article);
            
            // イベントリスナー設定
            this.attachEventListeners(card, article);
            
            // 画像遅延読み込み設定
            this.setupLazyLoading(card);
            
            return card;
            
        } catch (error) {
            console.error('Card creation error:', error, article);
            return this.createErrorCard(article.articleId, error.message);
        }
    }
    
    populateCardContent(card, article) {
        // タイトル
        const titleElement = card.querySelector('.article-title');
        if (titleElement) {
            titleElement.textContent = article.title || '無題';
            titleElement.onclick = () => this.openArticle(article.url);
        }
        
        // 抜粋
        const excerptElement = card.querySelector('.article-excerpt');
        if (excerptElement) {
            excerptElement.textContent = article.excerpt || '内容を読み込み中...';
        }
        
        // ドメイン
        const domainElement = card.querySelector('.domain');
        if (domainElement) {
            domainElement.textContent = article.domain || '';
        }
        
        // 公開日
        const dateElement = card.querySelector('.publish-date');
        if (dateElement) {
            dateElement.textContent = this.formatDate(article.publishDate);
        }
        
        // 記事画像
        const imageElement = card.querySelector('.article-image');
        if (imageElement) {
            const extractedImage = this.extractImageUrl(article.excerpt);
            const placeholderImage = extractedImage || this.createPlaceholderImage(article.domain);
            
            imageElement.dataset.src = placeholderImage;
            imageElement.alt = article.title;
        }
    }
    
    createPlaceholderImage(domain) {
        const cleanDomain = (domain || 'news').substring(0, 10);
        const svg = `
            <svg width="200" height="120" xmlns="http://www.w3.org/2000/svg">
                <rect width="200" height="120" fill="#e0e0e0"/>
                <text x="100" y="60" text-anchor="middle" dominant-baseline="middle" 
                      font-family="Arial, sans-serif" font-size="14" fill="#666">
                    📰 ${cleanDomain}
                </text>
            </svg>
        `;
        
        return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    }
    
    updateInterestScore(card, score) {
        const scoreElement = card.querySelector('.interest-score');
        if (!scoreElement) return;
        
        const clampedScore = Math.max(0, Math.min(100, score));
        scoreElement.textContent = `${clampedScore}点`;
        
        // スコア別色分け
        scoreElement.className = 'interest-score';
        if (clampedScore >= 80) {
            scoreElement.classList.add('score-high');
        } else if (clampedScore >= 60) {
            scoreElement.classList.add('score-medium');
        } else {
            scoreElement.classList.add('score-low');
        }
    }
    
    displayMatchedKeywords(card, keywords) {
        const keywordsContainer = card.querySelector('.matched-keywords');
        if (!keywordsContainer || !keywords.length) return;
        
        keywordsContainer.innerHTML = '';
        
        keywords.slice(0, 3).forEach(keyword => {
            const keywordSpan = document.createElement('span');
            keywordSpan.className = 'keyword-highlight';
            keywordSpan.textContent = keyword;
            keywordsContainer.appendChild(keywordSpan);
        });
        
        if (keywords.length > 3) {
            const moreSpan = document.createElement('span');
            moreSpan.className = 'keyword-more';
            moreSpan.textContent = `+${keywords.length - 3}個`;
            keywordsContainer.appendChild(moreSpan);
        }
    }
    
    updateCardStates(card, article) {
        // 既読状態
        const readBtn = card.querySelector('.read-toggle-btn');
        if (readBtn) {
            const isRead = article.readStatus === 'read';
            readBtn.dataset.read = isRead;
            readBtn.querySelector('.read-text').textContent = isRead ? '既読' : '未読';
            
            if (isRead) {
                card.classList.add('read');
            }
        }
        
        // お気に入り状態
        const favoriteBtn = card.querySelector('.favorite-btn');
        if (favoriteBtn) {
            const isFavorited = article.favorited;
            favoriteBtn.dataset.favorited = isFavorited;
            favoriteBtn.querySelector('.favorite-text').textContent = isFavorited ? '保存済' : '保存';
            
            if (isFavorited) {
                favoriteBtn.classList.add('active');
            }
        }
    }
    
    attachEventListeners(card, article) {
        const articleId = article.articleId;
        
        // フィードバックボタン
        const feedbackButtons = card.querySelectorAll('.feedback-btn');
        feedbackButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const feedback = btn.dataset.feedback;
                this.handleFeedback(articleId, feedback, btn);
            });
        });
        
        // お気に入りボタン
        const favoriteBtn = card.querySelector('.favorite-btn');
        if (favoriteBtn) {
            favoriteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleFavorite(articleId, favoriteBtn);
            });
        }
        
        // 【修正2】既読切替ボタン
        const readBtn = card.querySelector('.read-toggle-btn');
        if (readBtn) {
            readBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleRead(articleId, readBtn);
            });
        }
        
        // スワイプ操作
        this.attachSwipeListeners(card, articleId);
        
        // カードクリック（記事開く）
        card.addEventListener('click', (e) => {
            // ボタンクリック時は無視
            if (e.target.closest('.card-actions')) return;
            
            this.openArticle(article.url, articleId);
        });
    }
    
    // 【修正2】既読状態切替関数（完全修正版）
    toggleRead(articleId, buttonElement) {
        try {
            const currentState = buttonElement.dataset.read === 'true';
            const newState = !currentState;
            
            console.log(`Toggling read status: ${articleId}, current: ${currentState}, new: ${newState}`);
            
            // データ更新
            if (window.yourNewsApp && window.yourNewsApp.dataManager) {
                const newStatus = newState ? 'read' : 'unread';
                
                // 非同期更新を実行
                window.yourNewsApp.dataManager.updateArticle(articleId, { readStatus: newStatus })
                    .then(success => {
                        if (success) {
                            console.log(`Read status updated successfully: ${articleId} -> ${newStatus}`);
                            
                            // UI更新
                            this.updateReadStatusUI(articleId, buttonElement, newState);
                            
                            // 成功通知
                            if (window.yourNewsApp && window.yourNewsApp.showNotification) {
                                const message = newState ? '既読にしました' : '未読にしました';
                                window.yourNewsApp.showNotification(message, 'success', 2000);
                            }
                            
                            // 記事一覧の統計更新
                            if (window.yourNewsApp && window.yourNewsApp.uiController) {
                                window.yourNewsApp.uiController.updateArticleStats();
                            }
                            
                        } else {
                            console.error(`Failed to update read status: ${articleId}`);
                            
                            // エラー時は元の状態に戻す
                            buttonElement.dataset.read = currentState;
                            
                            if (window.yourNewsApp && window.yourNewsApp.showNotification) {
                                window.yourNewsApp.showNotification('既読状態の更新に失敗しました', 'error');
                            }
                        }
                    })
                    .catch(error => {
                        console.error('Read status update error:', error);
                        
                        // エラー時は元の状態に戻す
                        buttonElement.dataset.read = currentState;
                        
                        if (window.yourNewsApp && window.yourNewsApp.showNotification) {
                            window.yourNewsApp.showNotification('既読状態の更新でエラーが発生しました', 'error');
                        }
                    });
            } else {
                console.error('DataManager not available');
                
                if (window.yourNewsApp && window.yourNewsApp.showNotification) {
                    window.yourNewsApp.showNotification('データ管理機能が利用できません', 'error');
                }
            }
            
        } catch (error) {
            console.error('既読状態切替エラー:', error);
            
            if (window.yourNewsApp && window.yourNewsApp.showNotification) {
                window.yourNewsApp.showNotification('既読状態の切替でエラーが発生しました', 'error');
            }
        }
    }
    
    // 【修正2】UI更新専用関数（新規追加）
    updateReadStatusUI(articleId, buttonElement, newState) {
        try {
            const card = buttonElement.closest('.article-card');
            
            // ボタン状態更新
            buttonElement.dataset.read = newState;
            const readText = buttonElement.querySelector('.read-text');
            if (readText) {
                readText.textContent = newState ? '既読' : '未読';
            }
            
            // カード全体の既読状態クラス更新
            if (card) {
                if (newState) {
                    card.classList.add('read');
                    card.dataset.readStatus = 'read';
                } else {
                    card.classList.remove('read');
                    card.dataset.readStatus = 'unread';
                }
                
                // 既読変更アニメーション
                card.classList.add('read-transition');
                setTimeout(() => {
                    card.classList.remove('read-transition');
                }, 500);
            }
            
            // ボタンアイコン更新
            buttonElement.title = newState ? '未読にする' : '既読にする';
            
            console.log(`UI updated for article ${articleId}: read=${newState}`);
            
        } catch (error) {
            console.error('UI update error:', error);
        }
    }
    
    attachSwipeListeners(card, articleId) {
        let touchStartTime = 0;
        
        card.addEventListener('touchstart', (e) => {
            this.touchState.startX = e.touches[0].clientX;
            this.touchState.startY = e.touches[0].clientY;
            this.touchState.isDragging = false;
            touchStartTime = Date.now();
            
            card.classList.add('touching');
        });
        
        card.addEventListener('touchmove', (e) => {
            if (!this.touchState.startX || !this.touchState.startY) return;
            
            this.touchState.currentX = e.touches[0].clientX;
            this.touchState.currentY = e.touches[0].clientY;
            
            const diffX = this.touchState.startX - this.touchState.currentX;
            const diffY = this.touchState.startY - this.touchState.currentY;
            
            // 水平スワイプ判定
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 30) {
                this.touchState.isDragging = true;
                e.preventDefault();
                
                // スワイプ視覚効果
                const swipeIndicator = card.querySelector('.swipe-indicator');
                if (swipeIndicator) {
                    if (diffX > 0) {
                        swipeIndicator.innerHTML = '👎 興味なし';
                        swipeIndicator.className = 'swipe-indicator swipe-left';
                    } else {
                        swipeIndicator.innerHTML = '👍 興味あり';
                        swipeIndicator.className = 'swipe-indicator swipe-right';
                    }
                    swipeIndicator.style.opacity = Math.min(Math.abs(diffX) / 100, 1);
                }
            }
        });
        
        card.addEventListener('touchend', (e) => {
            const touchDuration = Date.now() - touchStartTime;
            
            if (this.touchState.isDragging && touchDuration > 100) {
                const diffX = this.touchState.startX - this.touchState.currentX;
                
                if (Math.abs(diffX) > 80) {
                    const feedback = diffX > 0 ? -1 : 1;
                    this.handleFeedback(articleId, feedback.toString());
                    
                    card.classList.add('swiped');
                    setTimeout(() => {
                        if (card.parentElement) {
                            card.style.opacity = '0.5';
                        }
                    }, 300);
                }
            }
            
            // 状態リセット
            card.classList.remove('touching');
            const swipeIndicator = card.querySelector('.swipe-indicator');
            if (swipeIndicator) {
                swipeIndicator.style.opacity = '0';
                swipeIndicator.className = 'swipe-indicator';
            }
            
            this.touchState = { startX: 0, startY: 0, currentX: 0, currentY: 0, isDragging: false };
        });
    }
    
    setupLazyLoading(card) {
        const images = card.querySelectorAll('.lazy');
        images.forEach(img => {
            this.imageObserver.observe(img);
        });
    }
    
    handleFeedback(articleId, feedback, buttonElement) {
        try {
            if (window.yourNewsApp && window.yourNewsApp.processFeedback) {
                window.yourNewsApp.processFeedback(articleId, feedback);
            }
            
            if (buttonElement) {
                buttonElement.classList.add('feedback-sent');
                
                const originalText = buttonElement.innerHTML;
                buttonElement.innerHTML = feedback === '1' ? '👍 評価済' : 
                                        feedback === '-1' ? '👎 評価済' : 
                                        '🚫 NG設定';
                
                setTimeout(() => {
                    if (buttonElement.parentElement) {
                        buttonElement.innerHTML = originalText;
                        buttonElement.classList.remove('feedback-sent');
                    }
                }, 2000);
            }
            
            if (feedback === 'ng') {
                const card = document.querySelector(`[data-article-id="${articleId}"]`);
                if (card) {
                    card.style.opacity = '0.3';
                    card.classList.add('ng-domain');
                }
            }
            
        } catch (error) {
            console.error('Feedback処理エラー:', error);
        }
    }
    
    toggleFavorite(articleId, buttonElement) {
        try {
            const currentState = buttonElement.dataset.favorited === 'true';
            const newState = !currentState;
            
            if (window.yourNewsApp && window.yourNewsApp.dataManager) {
                window.yourNewsApp.dataManager.updateArticle(articleId, { favorited: newState });
            }
            
            buttonElement.dataset.favorited = newState;
            buttonElement.querySelector('.favorite-text').textContent = newState ? '保存済' : '保存';
            
            if (newState) {
                buttonElement.classList.add('active');
            } else {
                buttonElement.classList.remove('active');
            }
            
            const message = newState ? 'お気に入りに追加しました' : 'お気に入りから削除しました';
            if (window.yourNewsApp && window.yourNewsApp.showNotification) {
                window.yourNewsApp.showNotification(message, 'success', 2000);
            }
            
        } catch (error) {
            console.error('お気に入り切替エラー:', error);
        }
    }
    
    openArticle(url, articleId) {
        if (!url) return;
        
        try {
            // 既読状態に更新
            if (articleId && window.yourNewsApp && window.yourNewsApp.dataManager) {
                window.yourNewsApp.dataManager.updateArticle(articleId, { readStatus: 'read' });
            }
            
            window.open(url, '_blank', 'noopener,noreferrer');
            
        } catch (error) {
            console.error('記事オープンエラー:', error);
        }
    }
    
    formatDate(dateString) {
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            
            if (diffDays === 0) {
                const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                if (diffHours === 0) {
                    const diffMinutes = Math.floor(diffMs / (1000 * 60));
                    return `${diffMinutes}分前`;
                }
                return `${diffHours}時間前`;
            } else if (diffDays < 7) {
                return `${diffDays}日前`;
            } else {
                return date.toLocaleDateString('ja-JP');
            }
        } catch (error) {
            return '不明';
        }
    }
    
    extractImageUrl(content) {
        if (!content) return null;
        
        try {
            const imgRegex = /<img[^>]+src="([^">]+)"/i;
            const match = content.match(imgRegex);
            return match ? match[1] : null;
        } catch (error) {
            return null;
        }
    }
    
    createErrorCard(articleId, errorMessage) {
        const errorCard = document.createElement('div');
        errorCard.className = 'article-card error-card';
        errorCard.dataset.articleId = articleId || 'error';
        errorCard.innerHTML = `
            <div class="card-content">
                <div class="article-info">
                    <h3 class="article-title">記事表示エラー</h3>
                    <p class="article-excerpt">記事データの表示中にエラーが発生しました: ${errorMessage}</p>
                </div>
            </div>
        `;
        return errorCard;
    }
    
    createMultipleCards(articles) {
        if (!Array.isArray(articles)) {
            console.error('Articles must be an array');
            return [];
        }
        
        const fragment = document.createDocumentFragment();
        const cards = [];
        
        articles.forEach(article => {
            const card = this.createCard(article);
            if (card) {
                fragment.appendChild(card);
                cards.push(card);
            }
        });
        
        return { fragment, cards };
    }
    
    updateCard(articleId, updates) {
        const card = document.querySelector(`[data-article-id="${articleId}"]`);
        if (!card) return false;
        
        try {
            if (updates.interestScore !== undefined) {
                this.updateInterestScore(card, updates.interestScore);
            }
            
            if (updates.matchedKeywords) {
                this.displayMatchedKeywords(card, updates.matchedKeywords);
            }
            
            if (updates.readStatus) {
                const readBtn = card.querySelector('.read-toggle-btn');
                if (readBtn) {
                    this.updateCardStates(card, { readStatus: updates.readStatus });
                }
            }
            
            if (updates.favorited !== undefined) {
                const favoriteBtn = card.querySelector('.favorite-btn');
                if (favoriteBtn) {
                    this.updateCardStates(card, { favorited: updates.favorited });
                }
            }
            
            return true;
            
        } catch (error) {
            console.error('Card update error:', error);
            return false;
        }
    }
    
    removeCard(articleId) {
        const card = document.querySelector(`[data-article-id="${articleId}"]`);
        if (card) {
            card.style.transition = 'all 0.3s ease';
            card.style.opacity = '0';
            card.style.transform = 'translateY(-20px)';
            
            setTimeout(() => {
                if (card.parentElement) {
                    card.remove();
                }
            }, 300);
            
            return true;
        }
        return false;
    }
}
