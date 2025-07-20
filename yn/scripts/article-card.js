// ArticleCard - NGドメイン機能削除版

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

    // フィードバックボタン生成（NGドメイン削除版）
    createFeedbackButtons(article) {
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
    }

    // 記事カード作成（NGドメイン機能削除版）
    createCard(article) {
        const interestScore = article.interestScore !== undefined ? article.interestScore : 50;
        const scoreClass = interestScore >= 70 ? 'score-high' : 
                          interestScore >= 40 ? 'score-medium' : 'score-low';

        return `
            <div class="article-card ${article.readStatus === 'read' ? 'read' : ''}" 
                 data-article-id="${article.articleId}">
                
                <div class="card-header">
                    <div class="interest-score ${scoreClass}">${interestScore}点</div>
                    ${this.createKeywordHighlights(article.matchedKeywords)}
                </div>

                <div class="card-meta">
                    <span class="domain">${article.domain}</span>
                    <span class="publish-date">${this.formatDate(article.publishDate)}</span>
                    <span class="category">${article.category}</span>
                </div>

                <div class="card-content">
                    <h3 class="article-title" onclick="openArticle('${article.articleId}')">
                        ${article.title}
                    </h3>
                    <p class="article-excerpt">${article.excerpt}</p>
                </div>

                <div class="card-actions">
                    ${this.createFeedbackButtons(article)}
                    <div class="card-actions-right">
                        ${this.createActionButtons(article)}
                    </div>
                </div>
            </div>
        `;
    }

    // その他のメソッドは既存のまま...
    createKeywordHighlights(keywords) { /* 省略 */ }
    createActionButtons(article) { /* 省略 */ }
    formatDate(dateString) { /* 省略 */ }
}
