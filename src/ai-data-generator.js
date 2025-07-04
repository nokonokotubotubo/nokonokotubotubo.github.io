const fs = require('fs');

class DashboardGenerator {
  constructor() {
    this.currentDate = new Date().toISOString();
  }

  generateHTML() {
    try {
      console.log('🎨 HTMLダッシュボード生成開始...');
      
      const articles = JSON.parse(fs.readFileSync('ai-rss-temp/data/articles.json', 'utf8'));
      const categories = [...new Set(articles.map(article => article.category))];
      
      const articlesByPreference = {
        interested: articles.filter(a => a.preference === 'interested'),
        neutral: articles.filter(a => a.preference === 'neutral'),
        'not-interested': articles.filter(a => a.preference === 'not-interested')
      };
      
      const html = this.generateHTMLContent(articles, categories, articlesByPreference);
      
      // 出力ディレクトリ作成
      if (!fs.existsSync('ai-rss-temp')) {
        fs.mkdirSync('ai-rss-temp', { recursive: true });
      }
      
      fs.writeFileSync('ai-rss-temp/dashboard.html', html);
      
      console.log('✅ HTMLダッシュボード生成完了');
      console.log(`📊 記事統計:`);
      console.log(`  😍 興味あり: ${articlesByPreference.interested.length}件`);
      console.log(`  😐 普通: ${articlesByPreference.neutral.length}件`);
      console.log(`  😕 興味なし: ${articlesByPreference['not-interested'].length}件`);
      
    } catch (error) {
      console.error('💥 HTML生成失敗:', error.message);
      process.exit(1);
    }
  }

  generateHTMLContent(articles, categories, articlesByPreference) {
    return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🤖 AI RSS ダッシュボード</title>
    
    <!-- Google Fonts -->
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
        ${this.getJavaScript(articles)}
    </script>
</body>
</html>`;
  }

  getCSS() {
    return `
        /* CSS Variables */
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
          font-family: 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: var(--background-gradient);
          color: var(--text-primary);
          line-height: 1.7;
          min-height: 100vh;
          font-feature-settings: "palt";
        }

        .header {
          background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary-accent) 100%);
          padding: 2rem;
          text-align: center;
          margin-bottom: 3rem;
          position: relative;
          overflow: hidden;
        }

        .header h1 {
          color: #fff;
          font-size: 3.5rem;
          font-weight: 900;
          letter-spacing: -0.03em;
          margin-bottom: 1rem;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }

        .header p {
          color: rgba(255, 255, 255, 0.95);
          font-size: 1.3rem;
          font-weight: 400;
          letter-spacing: 0.02em;
          text-shadow: 0 1px 5px rgba(0, 0, 0, 0.1);
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

        .category-filter:hover {
          border-color: var(--border-hover);
          transform: translateY(-2px);
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
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
          cursor: pointer;
          user-select: none;
        }

        .stat-tab-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          transform: scaleX(0);
          transition: transform 0.3s ease;
        }

        .stat-tab-card.interested::before {
          background: linear-gradient(90deg, var(--interested-color), #059669);
        }

        .stat-tab-card.neutral::before {
          background: linear-gradient(90deg, var(--neutral-color), #D97706);
        }

        .stat-tab-card.not-interested::before {
          background: linear-gradient(90deg, var(--not-interested-color), #DC2626);
        }

        .stat-tab-card.all::before {
          background: linear-gradient(90deg, var(--primary-accent), var(--primary-dark));
        }

        .stat-tab-card:hover::before {
          transform: scaleX(1);
        }

        .stat-tab-card:hover {
          transform: translateY(-8px) scale(1.05);
          box-shadow: var(--card-shadow-hover);
          border-color: var(--border-hover);
        }

        .stat-tab-card.active {
          transform: translateY(-8px) scale(1.05);
          box-shadow: var(--card-shadow-hover);
        }

        .stat-tab-card.active.interested {
          background: linear-gradient(135deg, var(--interested-color) 0%, #059669 100%);
          border-color: var(--interested-color);
          color: #fff;
        }

        .stat-tab-card.active.neutral {
          background: linear-gradient(135deg, var(--neutral-color) 0%, #D97706 100%);
          border-color: var(--neutral-color);
          color: #fff;
        }

        .stat-tab-card.active.not-interested {
          background: linear-gradient(135deg, var(--not-interested-color) 0%, #DC2626 100%);
          border-color: var(--not-interested-color);
          color: #fff;
        }

        .stat-tab-card.active.all {
          background: linear-gradient(135deg, var(--primary-accent) 0%, var(--primary-dark) 100%);
          border-color: var(--primary-accent);
          color: #fff;
        }

        .stat-tab-card.active::before {
          transform: scaleX(1);
        }

        .stat-number {
          font-size: 3rem;
          font-weight: 900;
          margin-bottom: 0.5rem;
          background: linear-gradient(45deg, var(--primary-accent), var(--primary-dark));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          transition: all 0.3s ease;
        }

        .stat-tab-card.active .stat-number {
          background: #fff;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .stat-label {
          font-size: 1rem;
          color: var(--text-secondary);
          font-weight: 600;
          transition: color 0.3s ease;
        }

        .stat-tab-card.active .stat-label {
          color: rgba(255, 255, 255, 0.95);
        }

        .articles-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 2rem;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
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
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          box-shadow: var(--card-shadow);
          backdrop-filter: blur(10px);
          animation: fadeInUp 0.6s ease-out;
          width: 100%;
        }

        .article-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          transform: scaleX(0);
          transition: transform 0.3s ease;
        }

        .article-card.interested::before {
          background: linear-gradient(90deg, var(--interested-color), #059669);
        }

        .article-card.neutral::before {
          background: linear-gradient(90deg, var(--neutral-color), #D97706);
        }

        .article-card.not-interested::before {
          background: linear-gradient(90deg, var(--not-interested-color), #DC2626);
        }

        .article-card:hover::before {
          transform: scaleX(1);
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
          letter-spacing: -0.02em;
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
          position: relative;
        }

        .rating-section::before {
          content: '';
          position: absolute;
          top: -2px;
          left: 0;
          width: 60px;
          height: 2px;
          background: linear-gradient(90deg, var(--primary-accent), var(--primary-dark));
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
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
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

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.08); }
          100% { transform: scale(1.05); }
        }

        .stat-tab-card.clicked {
          animation: pulse 0.3s ease;
        }

        @media (max-width: 1024px) {
          .stats-tabs {
            grid-template-columns: repeat(2, 1fr);
          }
          
          .articles-container {
            grid-template-columns: repeat(2, 1fr);
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
            width: 100%;
          }
          
          .stats-section {
            padding: 0 1rem;
          }
          
          .category-filter-wrapper {
            position: relative;
            left: 0;
            margin-bottom: 1rem;
          }
          
          .article-card {
            width: 100%;
            max-width: none;
          }
        }

        @media (max-width: 480px) {
          .header h1 {
            font-size: 2.2rem;
          }
          
          .stat-tab-card {
            padding: 1.5rem;
          }
          
          .stat-number {
            font-size: 2.5rem;
          }
          
          .article-content {
            padding: 2rem;
          }
        }
    `;
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

  generateArticleCard(article) {
    const publishDate = new Date(article.pubDate).toLocaleDateString('ja-JP');
    const relativeTime = this.getRelativeTime(article.pubDate);
    
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
            </div>
            <div class="article-description">
                ${article.description.substring(0, 200)}${article.description.length > 200 ? '...' : ''}
            </div>
            <div class="rating-section">
                <div class="rating-stars">
                    ${[1,2,3,4,5].map(rating => `
                        <span class="star" data-rating="${rating}" title="${rating}つ星">⭐</span>
                    `).join('')}
                </div>
                <div class="rating-label">この記事を評価</div>
            </div>
        </div>
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

  getJavaScript(articles) {
    return `
        const articles = ${JSON.stringify(articles, null, 2)};
        
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
        
        document.querySelectorAll('.stat-tab-card').forEach(card => {
            card.addEventListener('click', () => {
                card.classList.add('clicked');
                setTimeout(() => card.classList.remove('clicked'), 300);
                
                const tabType = card.dataset.tab;
                switchTab(tabType);
                
                const labelText = card.querySelector('.stat-label').textContent;
                showNotification(\`\${labelText} タブに切り替えました\`);
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
            
            showNotification(\`カテゴリ: \${selectedCategory === 'all' ? 'すべて' : selectedCategory} に絞り込みました\`);
        });
        
        function setRating(articleId, rating) {
            const stars = document.querySelectorAll(\`[data-article-id="\${articleId}"] .star\`);
            stars.forEach((star, index) => {
                star.classList.toggle('filled', index < rating);
            });
            
            const card = document.querySelector(\`[data-article-id="\${articleId}"]\`);
            card.style.transform = 'scale(1.05)';
            setTimeout(() => {
                card.style.transform = '';
            }, 200);
            
            submitRating(articleId, rating);
        }
        
        async function submitRating(articleId, rating) {
            try {
                const article = articles.find(a => a.id === articleId);
                const ratingData = {
                    articleId,
                    rating,
                    title: article.title,
                    url: article.link,
                    timestamp: new Date().toISOString(),
                    preference: article.preference
                };
                
                console.log('評価データ:', ratingData);
                showNotification(\`評価 \${rating}/5 を記録しました ⭐\`);
                
            } catch (error) {
                console.error('評価送信エラー:', error);
                showNotification('評価の送信に失敗しました ❌', 'error');
            }
        }
        
        function showNotification(message, type = 'success') {
            const notification = document.createElement('div');
            notification.style.cssText = \`
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 1rem 2rem;
                border-radius: 12px;
                color: white;
                font-weight: 600;
                z-index: 9999;
                background: \${type === 'success' ? 'linear-gradient(135deg, var(--interested-color), #059669)' : 'linear-gradient(135deg, var(--not-interested-color), #DC2626)'};
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                animation: slideIn 0.3s ease;
                max-width: 300px;
                word-wrap: break-word;
            \`;
            notification.textContent = message;
            document.body.appendChild(notification);
            
            setTimeout(() => {
                notification.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => notification.remove(), 300);
            }, 3000);
        }
        
        document.querySelectorAll('.star').forEach(star => {
            star.addEventListener('click', () => {
                const articleId = star.closest('[data-article-id]').dataset.articleId;
                const rating = parseInt(star.dataset.rating);
                setRating(articleId, rating);
            });
        });
        
        const style = document.createElement('style');
        style.textContent = \`
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        \`;
        document.head.appendChild(style);
        
        // 初期化時にアニメーションを追加
        document.addEventListener('DOMContentLoaded', () => {
            showNotification('AI RSS ダッシュボードへようこそ！ 🎉');
        });
    `;
  }
}

if (require.main === module) {
  const generator = new DashboardGenerator();
  generator.generateHTML();
}

module.exports = { DashboardGenerator };
`;
