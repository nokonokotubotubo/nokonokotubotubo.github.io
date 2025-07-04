const fs = require('fs');

class AdvancedPreferenceAnalyzer {
  constructor() {
    // 技術系キーワード（重み付き）
    this.techKeywords = {
      // プログラミング言語・フレームワーク
      'javascript': 3, 'typescript': 3, 'react': 3, 'vue': 3, 'angular': 2,
      'node.js': 3, 'python': 3, 'java': 2, 'go': 2, 'rust': 2,
      'docker': 3, 'kubernetes': 3, 'aws': 3, 'azure': 2, 'gcp': 2,
      
      // AI・機械学習
      'ai': 4, '人工知能': 4, 'machine learning': 4, '機械学習': 4,
      'deep learning': 4, 'ディープラーニング': 4, 'chatgpt': 3, 'llm': 3,
      
      // 開発・技術トレンド
      'github': 3, 'オープンソース': 3, 'api': 2, 'rest': 2, 'graphql': 2,
      'マイクロサービス': 3, 'serverless': 3, 'devops': 3, 'ci/cd': 3,
      
      // データ・インフラ
      'database': 2, 'sql': 2, 'nosql': 2, 'redis': 2, 'mongodb': 2,
      'postgresql': 2, 'mysql': 2, 'elasticsearch': 2
    };
    
    // ネガティブキーワード
    this.negativeKeywords = {
      '政治': -3, '選挙': -3, '政党': -3, '議員': -2, '国会': -2,
      '事件': -2, '事故': -2, '災害': -2, '犯罪': -2,
      '芸能': -2, 'スポーツ': -1, '野球': -1, 'サッカー': -1
    };
    
    // カテゴリ重み
    this.categoryWeights = {
      'tech': 2,
      'business': 0,
      'politics': -2,
      'sports': -1,
      'entertainment': -1
    };
    
    this.userPreferences = this.loadUserPreferences();
  }

  loadUserPreferences() {
    try {
      if (fs.existsSync('ai-rss-temp/data/user-preferences.json')) {
        return JSON.parse(fs.readFileSync('ai-rss-temp/data/user-preferences.json', 'utf8'));
      }
    } catch (error) {
      console.log('📂 新規ユーザー: デフォルト嗜好設定を使用');
    }
    return {
      positivePatterns: [],
      negativePatterns: [],
      learningHistory: []
    };
  }

  analyzeText(text) {
    const normalizedText = text.toLowerCase();
    let score = 0;
    let matchedKeywords = [];

    // 技術キーワード分析
    Object.entries(this.techKeywords).forEach(([keyword, weight]) => {
      if (normalizedText.includes(keyword)) {
        score += weight;
        matchedKeywords.push(`+${keyword}(${weight})`);
      }
    });

    // ネガティブキーワード分析
    Object.entries(this.negativeKeywords).forEach(([keyword, weight]) => {
      if (normalizedText.includes(keyword)) {
        score += weight;
        matchedKeywords.push(`${keyword}(${weight})`);
      }
    });

    return { score, matchedKeywords };
  }

  analyzeArticle(article) {
    const titleAnalysis = this.analyzeText(article.title);
    const descAnalysis = this.analyzeText(article.description);
    
    // タイトルを重視（2倍の重み）
    let totalScore = (titleAnalysis.score * 2) + descAnalysis.score;
    
    // カテゴリ重み追加
    const categoryWeight = this.categoryWeights[article.category] || 0;
    totalScore += categoryWeight;
    
    // 学習データ反映
    this.userPreferences.positivePatterns.forEach(pattern => {
      if (article.title.toLowerCase().includes(pattern.toLowerCase()) ||
          article.description.toLowerCase().includes(pattern.toLowerCase())) {
        totalScore += 3;
      }
    });
    
    this.userPreferences.negativePatterns.forEach(pattern => {
      if (article.title.toLowerCase().includes(pattern.toLowerCase()) ||
          article.description.toLowerCase().includes(pattern.toLowerCase())) {
        totalScore -= 3;
      }
    });
    
    // 嗜好レベル決定
    let preference;
    if (totalScore >= 3) {
      preference = 'interested';
    } else if (totalScore <= -2) {
      preference = 'not-interested';
    } else {
      preference = 'neutral';
    }
    
    return {
      preference,
      score: totalScore,
      titleKeywords: titleAnalysis.matchedKeywords,
      descKeywords: descAnalysis.matchedKeywords
    };
  }

  async analyzeAllArticles() {
    try {
      console.log('🤖 AI分析開始...');
      
      const articles = JSON.parse(
        fs.readFileSync('ai-rss-temp/data/articles.json', 'utf8')
      );
      
      const analyzedArticles = articles.map(article => {
        const analysis = this.analyzeArticle(article);
        
        return {
          ...article,
          preference: analysis.preference,
          preferenceScore: this.getNumericScore(analysis.preference),
          aiScore: analysis.score,
          matchedKeywords: [...analysis.titleKeywords, ...analysis.descKeywords]
        };
      });
      
      // 統計計算
      const stats = {
        interested: analyzedArticles.filter(a => a.preference === 'interested').length,
        neutral: analyzedArticles.filter(a => a.preference === 'neutral').length,
        notInterested: analyzedArticles.filter(a => a.preference === 'not-interested').length,
        total: analyzedArticles.length
      };
      
      console.log('📊 AI分析結果:');
      console.log(`  😍 興味あり: ${stats.interested}件`);
      console.log(`  😐 普通: ${stats.neutral}件`);
      console.log(`  😕 興味なし: ${stats.notInterested}件`);
      console.log(`  📄 総計: ${stats.total}件`);
      
      // 結果保存
      fs.writeFileSync(
        'ai-rss-temp/data/articles.json',
        JSON.stringify(analyzedArticles, null, 2)
      );
      
      // 分析ログ保存
      const analysisLog = {
        timestamp: new Date().toISOString(),
        stats,
        topKeywords: this.getTopKeywords(analyzedArticles)
      };
      
      fs.writeFileSync(
        'ai-rss-temp/data/analysis-log.json',
        JSON.stringify(analysisLog, null, 2)
      );
      
      console.log('✅ AI分析完了');
      
    } catch (error) {
      console.error('💥 AI分析失敗:', error.message);
      process.exit(1);
    }
  }

  getNumericScore(preference) {
    switch (preference) {
      case 'interested': return 3;
      case 'neutral': return 2;
      case 'not-interested': return 1;
      default: return 2;
    }
  }

  getTopKeywords(articles) {
    const keywordCount = {};
    
    articles.forEach(article => {
      if (article.matchedKeywords) {
        article.matchedKeywords.forEach(keyword => {
          const baseKeyword = keyword.replace(/[+\-()0-9]/g, '');
          keywordCount[baseKeyword] = (keywordCount[baseKeyword] || 0) + 1;
        });
      }
    });
    
    return Object.entries(keywordCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([keyword, count]) => ({ keyword, count }));
  }
}

// メイン実行
if (require.main === module) {
  const analyzer = new AdvancedPreferenceAnalyzer();
  analyzer.analyzeAllArticles();
}

module.exports = { AdvancedPreferenceAnalyzer };
