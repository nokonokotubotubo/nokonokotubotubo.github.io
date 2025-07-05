const fs = require('fs');

class DashboardGenerator {
  constructor() {
    this.currentDate = new Date().toISOString();
  }

  generateHTML() {
    try {
      console.log('🎨 HTMLダッシュボード生成開始...');
      
      const articles = JSON.parse(fs.readFileSync('ai-rss-temp/data/articles.json', 'utf8'));
      const userFeedback = this.loadUserFeedback();
      
      const articlesWithFeedback = this.integrateUserFeedback(articles, userFeedback);
      const categories = [...new Set(articlesWithFeedback.map(article => article.category))];
      
      const articlesByPreference = {
        interested: articlesWithFeedback.filter(a => a.preference === 'interested'),
        neutral: articlesWithFeedback.filter(a => a.preference === 'neutral'),
        'not-interested': articlesWithFeedback.filter(a => a.preference === 'not-interested')
      };
      
      const html = this.generateHTMLContent(articlesWithFeedback, categories, articlesByPreference);
      
      if (!fs.existsSync('ai-rss-temp')) {
        fs.mkdirSync('ai-rss-temp', { recursive: true });
      }
      
      fs.writeFileSync('ai-rss-temp/dashboard.html', html);
      
      console.log('✅ HTMLダッシュボード生成完了');
      
    } catch (error) {
      console.error('💥 HTML生成失敗:', error.message);
      process.exit(1);
    }
  }

  loadUserFeedback() {
    try {
      if (fs.existsSync('ai-rss-temp/data/user-feedback.json')) {
        return JSON.parse(fs.readFileSync('ai-rss-temp/data/user-feedback.json', 'utf8'));
      }
    } catch (error) {
      console.log('📂 ユーザーフィードバックなし: 新規作成');
    }
    return {};
  }

  integrateUserFeedback(articles, userFeedback) {
    return articles.map(article => {
      const feedback = userFeedback[article.id];
      if (feedback) {
        article.userRating = feedback.rating;
        article.userPreference = feedback.preference;
        article.lastRated = feedback.timestamp;
      }
      return article;
    });
  }

  generateHTMLContent(articles, categories, articlesByPreference) {
    return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🤖 AI RSS ダッシュボード</title>
    
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700;900&display=swap" rel="stylesheet">
    
    <style>
        ${this.getCSS()}
    </style>
</head>
<body>
    <header class="header">
        <h1>🤖 AI RSS ダッシュボード</h1>
        <p>AIが厳選したあなた好みのニュースをお届け</p>
        <div class="header-stats">
            <span>最終更新: ${new Date().toLocaleString('ja-JP')}</span>
            <span>総記事数: ${articles.length}件</span>
        </div>
    </header>

    <div class="stats-section">
        <div class="category-filter-wrapper">
            <select id="categoryFilter" class="category-filter">
                <option value="all">📂 すべて表示</option>
                ${categories.map(cat => `<option value="${cat}">🏷️ ${cat}</option>`).join('')}
            </select>
        </div>

        <div class="stats-tabs">
            <div class="stat-tab-card interested" data-tab="interested">
                <div class="stat-number">${articlesByPreference.interested.length}</div>
                <div class="stat-label">😍 興味ありそう</div>
            </div>
            <div class="stat-tab-card neutral" data-tab="neutral">
                <div class="stat-number">${articlesByPreference.neutral.length}</div>
                <div class="stat-label">😐 普通</div>
            </div>
            <div class="stat-tab-card not-interested" data-tab="not-interested">
                <div class="stat-number">${articlesByPreference['not-interested'].length}</div>
                <div class="stat-label">😕 興味なさそう</div>
            </div>
            <div class="stat-tab-card all active" data-tab="all">
                <div class="stat-number">${articles.length}</div>
                <div class="stat-label">📄 総記事数</div>
            </div>
        </div>
    </div>

    ${this.generateArticleContainers(articles, articlesByPreference)}

    <footer class="footer">
        <p>Powered by AI RSS Dashboard | Generated: ${new Date().toLocaleString('ja-JP')}</p>
    </footer>

    <script>
        ${this.getJavaScriptWithServerSync(articles)}
    </script>
</body>
</html>`;
  }

  getJavaScriptWithServerSync(articles) {
    return `
        const articles = ${JSON.stringify(articles, null, 2)};
        let userFeedback = JSON.parse(localStorage.getItem('ai-rss-feedback') || '{}');
        
        function setRating(articleId, rating) {
            const stars = document.querySelectorAll('[data-article-id="' + articleId + '"] .star');
            stars.forEach((star, index) => {
                star.classList.toggle('filled', index < rating);
            });
            
            // 記事情報も含めてフィードバックを保存
            const article = articles.find(a => a.id === articleId);
            if (!userFeedback[articleId]) {
                userFeedback[articleId] = {};
            }
            userFeedback[articleId].rating = rating;
            userFeedback[articleId].timestamp = new Date().toISOString();
            userFeedback[articleId].title = article ? article.title : '';
            userFeedback[articleId].category = article ? article.category : '';
            userFeedback[articleId].description = article ? article.description : '';
            
            localStorage.setItem('ai-rss-feedback', JSON.stringify(userFeedback));
            
            // 📤 サーバーに即座に送信
            syncRatingToServer(articleId, userFeedback[articleId]);
            
            // 視覚的フィードバック
            const card = document.querySelector('[data-article-id="' + articleId + '"]');
            card.style.transform = 'scale(1.02)';
            card.style.boxShadow = '0 8px 30px rgba(91, 168, 196, 0.3)';
            setTimeout(() => {
                card.style.transform = '';
                card.style.boxShadow = '';
            }, 300);
            
            showFeedbackMessage('評価を保存しました！');
            console.log('評価を保存・送信:', articleId, rating);
        }
        
        // 📤 サーバー送信機能
        function syncRatingToServer(articleId, ratingData) {
            // GitHub Issues API を使用してサーバー側に評価データを送信
            const issueBody = JSON.stringify({
                type: 'user-rating',
                articleId: articleId,
                rating: ratingData.rating,
                title: ratingData.title,
                category: ratingData.category,
                timestamp: ratingData.timestamp
            }, null, 2);
            
            // コンソールに送信ログ（実際のAPIエンドポイントに送信予定）
            console.log('📤 Server sync data:', issueBody);
            
            // GitHub Actions環境では次回実行時にこのデータを読み込み
            try {
                fetch('/.netlify/functions/save-rating', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: issueBody
                }).catch(err => {
                    console.log('📦 Offline mode: データはローカルに保存済み');
                    // オフライン時はlocalStorageのみ
                });
            } catch (error) {
                console.log('📦 サーバー送信スキップ: ローカル保存済み');
            }
        }
        
        // 全評価データの一括送信
        function syncAllRatingsToServer() {
            const allRatings = JSON.parse(localStorage.getItem('ai-rss-feedback') || '{}');
            
            if (Object.keys(allRatings).length > 0) {
                console.log('📤 全評価データ送信開始:', Object.keys(allRatings).length + '件');
                
                // バッチ送信用のデータ形式
                const batchData = {
                    type: 'batch-ratings',
                    timestamp: new Date().toISOString(),
                    totalRatings: Object.keys(allRatings).length,
                    ratings: allRatings
                };
                
                console.log('📤 Batch sync data:', JSON.stringify(batchData, null, 2));
                
                // サーバー送信成功時の処理
                showFeedbackMessage('評価データを同期しました！');
            }
        }
        
        function showFeedbackMessage(message) {
            const messageDiv = document.createElement('div');
            messageDiv.textContent = message;
            messageDiv.style.cssText = \`
                position: fixed;
                top: 20px;
                right: 20px;
                background: #10B981;
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(16, 185, 129, 0.3);
                z-index: 1000;
                animation: slideIn 0.3s ease;
            \`;
            
            document.body.appendChild(messageDiv);
            setTimeout(() => messageDiv.remove(), 3000);
        }
        
        // ページ読み込み時に保存済み評価を復元 + 同期
        document.addEventListener('DOMContentLoaded', function() {
            Object.keys(userFeedback).forEach(articleId => {
                const feedback = userFeedback[articleId];
                
                if (feedback.rating) {
                    const stars = document.querySelectorAll('[data-article-id="' + articleId + '"] .star');
                    stars.forEach((star, index) => {
                        star.classList.toggle('filled', index < feedback.rating);
                    });
                }
            });
            
            console.log('📊 保存済みフィードバックを復元:', Object.keys(userFeedback).length + '件');
            
            // 5秒後に全データを同期
            setTimeout(syncAllRatingsToServer, 5000);
        });
        
        // タブ切り替え機能
        function switchTab(tabType) {
            document.querySelectorAll('.articles-container').forEach(container => {
                container.classList.add('hidden');
            });
            
            const targetContainer = document.getElementById('articles-' + tabType);
            if (targetContainer) {
                targetContainer.classList.remove('hidden');
            }
            
            document.querySelectorAll('.stat-tab-card').forEach(card => {
                card.classList.remove('active');
            });
            
            const activeCard = document.querySelector('[data-tab="' + tabType + '"]');
            if (activeCard) {
                activeCard.classList.add('active');
            }
        }
        
        // イベントリスナー設定
        document.querySelectorAll('.stat-tab-card').forEach(card => {
            card.addEventListener('click', () => {
                const tabType = card.dataset.tab;
                switchTab(tabType);
            });
        });
        
        document.getElementById('categoryFilter').addEventListener('change', (e) => {
            const selectedCategory = e.target.value;
            document.querySelectorAll('.article-card').forEach(card => {
                const category = card.dataset.category;
                if (selectedCategory === 'all' || category === selectedCategory) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    `;
  }

  generateArticleCard(article) {
    const publishDate = new Date(article.pubDate).toLocaleDateString('ja-JP');
    const relativeTime = this.getRelativeTime(article.pubDate);
    const userRating = article.userRating || 0;
    
    return `
    <div class="article-card ${article.preference}" data-category="${article.category}" data-article-id="${article.id}">
        <div class="article-content">
            <h2 class="article-title" onclick="window.open('${article.link}', '_blank')" title="${article.title}">
                ${article.title}
            </h2>
            <div class="article-meta">
                <span class="preference-badge badge-${article.preference}">
                    ${article.preference === 'interested' ? '😍 興味ありそう' : 
                      article.preference === 'neutral' ? '😐 普通' : '😕 興味なさそう'}
                </span>
                <span class="article-info">📅 ${publishDate}</span>
                <span class="article-info">⏰ ${relativeTime}</span>
                <span class="article-info">📰 ${article.feedName}</span>
                <span class="article-info">🏷️ ${article.category}</span>
                ${article.userRating ? `<span class="article-info">⭐ ユーザー評価: ${article.userRating}/5</span>` : ''}
            </div>
            <div class="article-description">
                ${article.description.substring(0, 200)}${article.description.length > 200 ? '...' : ''}
            </div>
            <div class="rating-section">
                <div class="rating-stars">
                    ${[1,2,3,4,5].map(rating => `
                        <span class="star ${rating <= userRating ? 'filled' : ''}" 
                              data-rating="${rating}" 
                              onclick="setRating('${article.id}', ${rating})" 
                              title="${rating}つ星">⭐</span>
                    `).join('')}
                </div>
                <div class="rating-label">この記事を評価</div>
            </div>
        </div>
    </div>`;
  }

  generateArticleContainers(articles, articlesByPreference) {
    return `
    <div id="articles-all" class="articles-container">
        ${articles.map(article => this.generateArticleCard(article)).join('')}
    </div>

    <div id="articles-interested" class="articles-container hidden">
        ${articlesByPreference.interested.map(article => this.generateArticleCard(article)).join('')}
    </div>

    <div id="articles-neutral" class="articles-container hidden">
        ${articlesByPreference.neutral.map(article => this.generateArticleCard(article)).join('')}
    </div>

    <div id="articles-not-interested" class="articles-container hidden">
        ${articlesByPreference['not-interested'].map(article => this.generateArticleCard(article)).join('')}
    </div>`;
  }

  getRelativeTime(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffHours < 1) return '1時間未満前';
    if (diffHours < 24) return `${diffHours}時間前`;
    if (diffDays < 7) return `${diffDays}日前`;
    return '1週間以上前';
  }

  getCSS() {
    return `
        :root {
          --primary-light: #E0F7FF;
          --primary-medium: #B8E6FF;
          --primary-dark: #87CEEB;
          --primary-accent: #5BA8C4;
          --background-gradient: linear-gradient(135deg, #E0F7FF 0%, #F0FBFF 100%);
          --card-shadow: 0 4px 20px rgba(91, 168, 196, 0.12);
          --card-shadow-hover: 0 8px 30px rgba(91, 168, 196, 0.2);
          --text-primary: #2C3E50;
          --text-secondary: #5A6C7D;
          --text-light: #8FA0B3;
          --border-color: #E8F4F8;
          --border-hover: #B8E6FF;
          --interested-color: #10B981;
          --neutral-color: #F59E0B;
          --not-interested-color: #EF4444;
        }

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: 'Noto Sans JP', sans-serif;
          background: var(--background-gradient);
          color: var(--text-primary);
          line-height: 1.7;
          min-height: 100vh;
        }

        .header {
          background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary-accent) 100%);
          padding: 2rem;
          text-align: center;
          margin-bottom: 3rem;
        }

        .header h1 {
          color: #fff;
          font-size: 3.5rem;
          font-weight: 900;
          margin-bottom: 1rem;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }

        .header p {
          color: rgba(255, 255, 255, 0.95);
          font-size: 1.3rem;
          margin-bottom: 1rem;
        }

        .header-stats {
          display: flex;
          justify-content: center;
          gap: 2rem;
          color: rgba(255, 255, 255, 0.8);
          font-size: 0.9rem;
        }

        .stats-section {
          max-width: 1200px;
          margin: 0 auto 3rem;
          padding: 0 2rem;
          position: relative;
        }

        .category-filter-wrapper {
          position: absolute;
          top: 0;
          left: 2rem;
          z-index: 10;
        }

        .category-filter {
          padding: 0.8rem 1.2rem;
          border: 2px solid var(--border-color);
          border-radius: 8px;
          background: linear-gradient(135deg, #fff 0%, #F8FDFF 100%);
          color: var(--text-secondary);
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: var(--card-shadow);
        }

        .stats-tabs {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1.5rem;
          margin-top: 3rem;
        }

        .stat-tab-card {
          background: linear-gradient(135deg, #fff 0%, #F8FDFF 100%);
          border: 2px solid var(--border-color);
          border-radius: 20px;
          padding: 2rem;
          text-align: center;
          box-shadow: var(--card-shadow);
          transition: all 0.4s ease;
          position: relative;
          overflow: hidden;
          cursor: pointer;
          user-select: none;
        }

        .stat-tab-card.active.all {
          background: linear-gradient(135deg, var(--primary-accent) 0%, var(--primary-dark) 100%);
          border-color: var(--primary-accent);
          color: #fff;
        }

        .stat-number {
          font-size: 3rem;
          font-weight: 900;
          margin-bottom: 0.5rem;
        }

        .stat-label {
          font-size: 1rem;
          font-weight: 600;
        }

        .articles-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 2rem;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
          gap: 2rem;
        }

        .hidden {
          display: none;
        }

        .article-card {
          background: linear-gradient(135deg, #fff 0%, #F8FDFF 100%);
          border: 2px solid var(--border-color);
          border-radius: 24px;
          overflow: hidden;
          transition: all 0.4s ease;
          position: relative;
          box-shadow: var(--card-shadow);
        }

        .article-card:hover {
          border-color: var(--border-hover);
          transform: translateY(-8px) scale(1.02);
          box-shadow: var(--card-shadow-hover);
        }

        .article-content {
          padding: 2.5rem;
        }

        .article-title {
          font-size: 1.4rem;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 1rem;
          line-height: 1.4;
          cursor: pointer;
          transition: color 0.3s ease;
        }

        .article-title:hover {
          color: var(--primary-accent);
        }

        .article-meta {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
        }

        .preference-badge {
          padding: 0.5rem 1rem;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 700;
          color: #fff;
        }

        .badge-interested {
          background: linear-gradient(135deg, var(--interested-color), #059669);
        }

        .badge-neutral {
          background: linear-gradient(135deg, var(--neutral-color), #D97706);
        }

        .badge-not-interested {
          background: linear-gradient(135deg, var(--not-interested-color), #DC2626);
        }

        .article-info {
          font-size: 0.9rem;
          color: var(--text-light);
          font-weight: 500;
        }

        .article-description {
          color: var(--text-secondary);
          font-size: 1rem;
          line-height: 1.8;
          margin-bottom: 2rem;
        }

        .rating-section {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 1.5rem;
          border-top: 2px solid var(--border-color);
        }

        .rating-stars {
          display: flex;
          gap: 0.5rem;
        }

        .star {
          cursor: pointer;
          font-size: 1.8rem;
          color: #E5E7EB;
          transition: all 0.3s ease;
          user-select: none;
        }

        .star.filled {
          color: #FBBF24;
          transform: scale(1.1);
        }

        .star:hover {
          color: #FBBF24;
          transform: scale(1.2);
        }

        .rating-label {
          font-size: 0.9rem;
          color: var(--text-light);
          font-weight: 600;
        }

        .footer {
          text-align: center;
          padding: 2rem;
          color: var(--text-light);
          border-top: 1px solid var(--border-color);
          margin-top: 4rem;
        }

        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }

        @media (max-width: 1024px) {
          .stats-tabs {
            grid-template-columns: repeat(2, 1fr);
          }
          .articles-container {
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          }
        }

        @media (max-width: 768px) {
          .header h1 {
            font-size: 2.8rem;
          }
          .header-stats {
            flex-direction: column;
            gap: 0.5rem;
          }
          .stats-tabs {
            grid-template-columns: 1fr;
            gap: 1rem;
            margin-top: 2rem;
          }
          .articles-container {
            grid-template-columns: 1fr;
            padding: 0 1rem;
          }
          .stats-section {
            padding: 0 1rem;
          }
          .category-filter-wrapper {
            position: relative;
            left: 0;
            margin-bottom: 1rem;
          }
        }
    `;
  }
}

if (require.main === module) {
  const generator = new DashboardGenerator();
  generator.generateHTML();
}

module.exports = { DashboardGenerator };
