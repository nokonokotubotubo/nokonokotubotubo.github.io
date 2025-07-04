const fs = require('fs');

class DashboardGenerator {
  constructor() {
    this.currentDate = new Date().toISOString();
    console.log('🔧 DashboardGenerator インスタンス作成完了');
  }

  generateHTML() {
    console.log('🎨 generateHTML() 関数開始');
    
    try {
      console.log('📂 記事データ読み込み開始...');
      
      const articles = JSON.parse(fs.readFileSync('ai-rss-temp/data/articles.json', 'utf8'));
      console.log(`✅ 記事データ読み込み完了: ${articles.length}件`);
      
      const categories = [...new Set(articles.map(article => article.category))];
      console.log(`📊 カテゴリ検出: ${categories.join(', ')}`);
      
      const articlesByPreference = {
        interested: articles.filter(a => a.preference === 'interested'),
        neutral: articles.filter(a => a.preference === 'neutral'),
        'not-interested': articles.filter(a => a.preference === 'not-interested')
      };
      
      console.log(`📊 嗜好分類: 興味${articlesByPreference.interested.length}件, 普通${articlesByPreference.neutral.length}件, 興味なし${articlesByPreference['not-interested'].length}件`);
      
      console.log('🔄 HTML生成開始...');
      const html = this.generateHTMLContent(articles, categories, articlesByPreference);
      console.log(`✅ HTML生成完了: ${html.length}文字`);
      
      // ✅ 強制的にディレクトリ作成とログ出力
      console.log('📁 出力ディレクトリ確認...');
      if (!fs.existsSync('ai-rss-temp')) {
        console.log('📁 ai-rss-temp ディレクトリ作成中...');
        fs.mkdirSync('ai-rss-temp', { recursive: true });
        console.log('✅ ai-rss-temp ディレクトリ作成完了');
      } else {
        console.log('✅ ai-rss-temp ディレクトリ既存確認');
      }
      
      console.log('💾 dashboard.html ファイル書き込み開始...');
      const filePath = 'ai-rss-temp/dashboard.html';
      
      // ファイル書き込み前の最終確認
      console.log(`📍 書き込み先: ${filePath}`);
      console.log(`📏 データサイズ: ${html.length} 文字`);
      
      fs.writeFileSync(filePath, html, 'utf8');
      console.log('✅ dashboard.html ファイル書き込み完了');
      
      // ✅ 書き込み後の検証
      if (fs.existsSync(filePath)) {
        const fileSize = fs.statSync(filePath).size;
        console.log(`✅ ファイル存在確認: ${filePath} (${fileSize} bytes)`);
      } else {
        console.error(`❌ ファイル書き込み検証失敗: ${filePath}`);
        throw new Error('File write verification failed');
      }
      
      console.log(`📊 統計情報:`);
      console.log(`  😍 興味あり: ${articlesByPreference.interested.length}件`);
      console.log(`  😐 普通: ${articlesByPreference.neutral.length}件`);
      console.log(`  😕 興味なし: ${articlesByPreference['not-interested'].length}件`);
      console.log('🎉 HTML生成処理完全終了');
      
    } catch (error) {
      console.error('💥 HTML生成でエラー発生:');
      console.error(`エラー名: ${error.name}`);
      console.error(`エラーメッセージ: ${error.message}`);
      console.error(`スタックトレース: ${error.stack}`);
      
      // ディレクトリ状況の診断出力
      console.log('🔍 エラー発生時のディレクトリ状況:');
      try {
        console.log('📁 カレントディレクトリ:', process.cwd());
        console.log('📁 ai-rss-temp 存在:', fs.existsSync('ai-rss-temp'));
        if (fs.existsSync('ai-rss-temp')) {
          console.log('📁 ai-rss-temp 内容:', fs.readdirSync('ai-rss-temp'));
        }
      } catch (diagError) {
        console.error('📁 ディレクトリ診断エラー:', diagError.message);
      }
      
      process.exit(1);
    }
  }

  generateHTMLContent(articles, categories, articlesByPreference) {
    console.log('🔧 HTMLコンテンツ生成開始...');
    
    const html = `<!DOCTYPE html>
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
        ${this.getJavaScript(articles)}
    </script>
</body>
</html>`;

    console.log(`✅ HTMLコンテンツ生成完了: ${html.length}文字`);
    return html;
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
          transition: all 0.4s ease;
          position: relative;
          box-shadow: var(--card-shadow);
          width: 100%;
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
    `;
  }

  generateArticleContainers(articles, articlesByPreference) {
    console.log('🔧 記事コンテナ生成開始...');
    
    const result = `
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

    console.log('✅ 記事コンテナ生成完了');
    return result;
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
        
        function setRating(articleId, rating) {
            const stars = document.querySelectorAll('[data-article-id="' + articleId + '"] .star');
            stars.forEach((star, index) => {
                star.classList.toggle('filled', index < rating);
            });
            
            const card = document.querySelector('[data-article-id="' + articleId + '"]');
            card.style.transform = 'scale(1.05)';
            setTimeout(() => {
                card.style.transform = '';
            }, 200);
        }
        
        document.querySelectorAll('.star').forEach(star => {
            star.addEventListener('click', () => {
                const articleId = star.closest('[data-article-id]').dataset.articleId;
                const rating = parseInt(star.dataset.rating);
                setRating(articleId, rating);
            });
        });
    `;
  }
}

// ✅ 強制実行確認
console.log('🚀 ai-data-generator.js 読み込み開始');
console.log('📍 require.main === module:', require.main === module);
console.log('📍 module.filename:', module.filename);

if (require.main === module) {
  console.log('✅ メインモジュールとして実行されています');
  const generator = new DashboardGenerator();
  generator.generateHTML();
} else {
  console.log('⚠️ メインモジュールとして実行されていません');
}

module.exports = { DashboardGenerator };
