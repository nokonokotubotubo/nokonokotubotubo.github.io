const fs = require('fs');

class AIAnalyzer {
  constructor() {
    this.preferences = {
      interested: ['AI', 'Python', 'JavaScript', 'Vue', 'Node.js', 'API', 'クラウド', 'AWS', 'Azure', 'Docker', 'セキュリティ', 'ガジェット'],
      neutral: ['ニュース', '発表', 'リリース', '更新', 'アップデート', '企業', '会社', '業界', '市場', '経済'],
      notInterested: ['広告', 'PR', '宣伝', 'スポンサー', '募集', '求人']
    };
    
    // 📤 前回の評価データを読み込み
    this.userFeedback = this.loadPreviousUserFeedback();
    this.learnFromUserFeedback();
  }

  loadPreviousUserFeedback() {
    try {
      // GitHub Actions環境で前回実行時の評価データを読み込み
      if (fs.existsSync('ai-rss/user-ratings-history.json')) {
        const historyData = JSON.parse(fs.readFileSync('ai-rss/user-ratings-history.json', 'utf8'));
        console.log(`📊 前回の評価履歴読み込み: ${Object.keys(historyData.ratings || {}).length}件`);
        return historyData.ratings || {};
      }
      
      // フォールバック: 現在のディレクトリにある場合
      if (fs.existsSync('user-ratings-history.json')) {
        const historyData = JSON.parse(fs.readFileSync('user-ratings-history.json', 'utf8'));
        console.log(`📊 評価履歴読み込み: ${Object.keys(historyData.ratings || {}).length}件`);
        return historyData.ratings || {};
      }
    } catch (error) {
      console.log('📂 評価履歴なし: 初回実行');
    }
    return {};
  }

  learnFromUserFeedback() {
    if (Object.keys(this.userFeedback).length === 0) {
      console.log('📊 学習用データなし: デフォルト嗜好を使用');
      return;
    }

    console.log('🤖 ユーザー評価からの学習開始...');
    
    // 高評価記事（4-5星）のキーワードを興味ありに追加
    const highRatedKeywords = this.extractKeywordsFromRatings(4, 5);
    // 低評価記事（1-2星）のキーワードを興味なしに追加
    const lowRatedKeywords = this.extractKeywordsFromRatings(1, 2);
    
    // 学習結果を嗜好に反映
    if (highRatedKeywords.length > 0) {
      this.preferences.interested.push(...highRatedKeywords);
      console.log(`📚 高評価から学習: ${highRatedKeywords.join(', ')}`);
    }
    
    if (lowRatedKeywords.length > 0) {
      this.preferences.notInterested.push(...lowRatedKeywords);
      console.log(`📚 低評価から学習: ${lowRatedKeywords.join(', ')}`);
    }
    
    // 重複除去
    this.preferences.interested = [...new Set(this.preferences.interested)];
    this.preferences.notInterested = [...new Set(this.preferences.notInterested)];
    
    console.log(`📊 学習完了: 興味あり${this.preferences.interested.length}語, 興味なし${this.preferences.notInterested.length}語`);
  }

  extractKeywordsFromRatings(minRating, maxRating) {
    const keywords = [];
    
    Object.values(this.userFeedback).forEach(feedback => {
      if (feedback.rating >= minRating && feedback.rating <= maxRating && feedback.title) {
        // タイトルからキーワードを抽出
        const titleKeywords = this.extractKeywords(feedback.title);
        keywords.push(...titleKeywords);
        
        // 説明文からもキーワード抽出
        if (feedback.description) {
          const descKeywords = this.extractKeywords(feedback.description);
          keywords.push(...descKeywords);
        }
      }
    });
    
    // 出現頻度でフィルタリング（2回以上出現するキーワードのみ採用）
    const keywordCount = {};
    keywords.forEach(keyword => {
      keywordCount[keyword] = (keywordCount[keyword] || 0) + 1;
    });
    
    return Object.keys(keywordCount).filter(keyword => keywordCount[keyword] >= 2 && keyword.length >= 2);
  }

  extractKeywords(text) {
    const keywords = [];
    
    // 英語キーワード（3文字以上）
    const englishWords = text.match(/[A-Za-z]{3,}/g) || [];
    keywords.push(...englishWords.map(word => word.toLowerCase()));
    
    // カタカナキーワード（3文字以上）
    const katakanaWords = text.match(/[ァ-ヶー]{3,}/g) || [];
    keywords.push(...katakanaWords);
    
    // 技術系日本語キーワード
    const techKeywords = ['機械学習', '人工知能', 'データ', 'システム', 'アプリ', 'サービス', '開発', '技術', 'プログラム', 'ソフトウェア', 'ハードウェア', 'インフラ', 'セキュリティ', 'ネットワーク', 'データベース', 'フレームワーク', 'ライブラリ', 'アルゴリズム'];
    techKeywords.forEach(keyword => {
      if (text.includes(keyword)) {
        keywords.push(keyword);
      }
    });
    
    return keywords.filter(keyword => keyword.length >= 2);
  }

  analyzeAllArticles() {
    try {
      console.log('🤖 AI分析開始...');
      
      const articles = JSON.parse(fs.readFileSync('ai-rss-temp/data/articles.json', 'utf8'));
      
      const analyzedArticles = articles.map(article => {
        const preference = this.analyzePreference(article);
        const preferenceScore = this.calculatePreferenceScore(article);
        const similarityScore = this.calculateSimilarityScore(article);
        
        return {
          ...article,
          preference: preference,
          preferenceScore: preferenceScore,
          similarityScore: similarityScore,
          analyzedAt: new Date().toISOString()
        };
      });

      // 🤖 学習結果を考慮した並び替え
      analyzedArticles.sort((a, b) => {
        // 1. preference順（interested > neutral > not-interested）
        const preferenceOrder = { 'interested': 3, 'neutral': 2, 'not-interested': 1 };
        const prefDiff = preferenceOrder[b.preference] - preferenceOrder[a.preference];
        if (prefDiff !== 0) return prefDiff;
        
        // 2. 同じpreference内では類似性スコア順
        const similarityDiff = (b.similarityScore || 0) - (a.similarityScore || 0);
        if (similarityDiff !== 0) return similarityDiff;
        
        // 3. 最後に日付順
        return new Date(b.pubDate) - new Date(a.pubDate);
      });

      // 分析結果の統計
      const stats = analyzedArticles.reduce((acc, article) => {
        acc[article.preference] = (acc[article.preference] || 0) + 1;
        return acc;
      }, {});

      console.log('📊 AI分析結果:');
      console.log(`  😍 興味あり: ${stats.interested || 0}件`);
      console.log(`  😐 普通: ${stats.neutral || 0}件`);
      console.log(`  😕 興味なし: ${stats['not-interested'] || 0}件`);
      console.log(`  📄 総計: ${analyzedArticles.length}件`);

      // 📊 学習効果の分析ログ
      const learningEffectiveness = this.calculateLearningEffectiveness(analyzedArticles);

      // 分析ログを保存
      const analysisLog = {
        timestamp: new Date().toISOString(),
        totalArticles: analyzedArticles.length,
        preferences: stats,
        userFeedbackCount: Object.keys(this.userFeedback).length,
        learnedKeywords: {
          interested: this.preferences.interested.length,
          notInterested: this.preferences.notInterested.length
        },
        learningEffectiveness: learningEffectiveness
      };

      fs.writeFileSync('ai-rss-temp/data/analysis-log.json', JSON.stringify(analysisLog, null, 2));
      fs.writeFileSync('ai-rss-temp/data/articles.json', JSON.stringify(analyzedArticles, null, 2));

      console.log('✅ AI分析完了（学習効果反映済み）');

    } catch (error) {
      console.error('💥 AI分析失敗:', error.message);
      process.exit(1);
    }
  }

  calculateLearningEffectiveness(articles) {
    if (Object.keys(this.userFeedback).length === 0) {
      return { hasLearning: false, message: 'まだ学習データがありません' };
    }

    const totalFeedback = Object.keys(this.userFeedback).length;
    const highRatedCount = Object.values(this.userFeedback).filter(f => f.rating >= 4).length;
    const lowRatedCount = Object.values(this.userFeedback).filter(f => f.rating <= 2).length;
    
    const interestedCount = articles.filter(a => a.preference === 'interested').length;
    const notInterestedCount = articles.filter(a => a.preference === 'not-interested').length;
    
    return {
      hasLearning: true,
      totalUserRatings: totalFeedback,
      highRatedHistory: highRatedCount,
      lowRatedHistory: lowRatedCount,
      currentInterested: interestedCount,
      currentNotInterested: notInterestedCount,
      learningRatio: totalFeedback > 0 ? (highRatedCount + lowRatedCount) / totalFeedback : 0
    };
  }

  analyzePreference(article) {
    const score = this.calculatePreferenceScore(article);
    
    if (score >= 0.6) return 'interested';
    if (score <= -0.3) return 'not-interested';
    return 'neutral';
  }

  calculatePreferenceScore(article) {
    const text = `${article.title} ${article.description}`.toLowerCase();
    let score = 0;
    let matchCount = 0;

    // 興味ありキーワードのマッチング
    this.preferences.interested.forEach(keyword => {
      if (text.includes(keyword.toLowerCase())) {
        score += 1;
        matchCount++;
      }
    });

    // 興味なしキーワードのマッチング
    this.preferences.notInterested.forEach(keyword => {
      if (text.includes(keyword.toLowerCase())) {
        score -= 1.5;
        matchCount++;
      }
    });

    // 中性キーワードのマッチング
    this.preferences.neutral.forEach(keyword => {
      if (text.includes(keyword.toLowerCase())) {
        score += 0.1;
        matchCount++;
      }
    });

    // マッチしたキーワード数で正規化
    return matchCount > 0 ? score / Math.max(matchCount, 3) : 0;
  }

  calculateSimilarityScore(article) {
    let maxSimilarity = 0;
    
    Object.values(this.userFeedback).forEach(feedback => {
      if (feedback.title && feedback.rating) {
        const titleSimilarity = this.calculateTextSimilarity(article.title, feedback.title);
        const descSimilarity = feedback.description ? this.calculateTextSimilarity(article.description, feedback.description) : 0;
        
        const overallSimilarity = Math.max(titleSimilarity, descSimilarity * 0.7);
        
        if (overallSimilarity > 0.3) { // 30%以上の類似度
          let bonus = 0;
          if (feedback.rating >= 4) {
            bonus = 0.8 * overallSimilarity; // 高評価記事との類似性
          } else if (feedback.rating <= 2) {
            bonus = -0.8 * overallSimilarity; // 低評価記事との類似性
          }
          
          if (Math.abs(bonus) > Math.abs(maxSimilarity)) {
            maxSimilarity = bonus;
          }
        }
      }
    });
    
    return maxSimilarity;
  }

  calculateTextSimilarity(text1, text2) {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }
}

if (require.main === module) {
  const analyzer = new AIAnalyzer();
  analyzer.analyzeAllArticles();
}

module.exports = { AIAnalyzer };
