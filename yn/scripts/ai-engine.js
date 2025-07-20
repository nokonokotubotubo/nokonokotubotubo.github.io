// AI処理エンジン（キーワード設定連携完全対応版）
class AIEngine {
    constructor() {
        this.model = null;
        this.vocabulary = new Map();
        this.idfValues = new Map();
        this.documentCount = 0;
        this.feedbackHistory = [];
        this.keywordWeights = new Map();
        this.domainScores = new Map();
        this.categoryScores = new Map();
        this.isInitialized = false;
        
        // キーワード設定（統合管理）
        this.currentKeywords = {
            interestWords: [],
            ngWords: []
        };
        
        // 学習パラメータ
        this.learningRate = 0.1;
        this.feedbackWeight = 1.0;
        this.keywordBonusPoints = 20;
        this.ngWordPenalty = -1;
    }
    
    async initialize() {
        try {
            console.log('AIEngine初期化開始');
            
            if (typeof tf === 'undefined') {
                console.warn('TensorFlow.js not loaded - using fallback AI');
                this.useFallbackAI = true;
            }
            
            // 保存されたデータ読み込み
            await this.loadSavedData();
            
            // キーワード設定読み込み
            await this.loadKeywordSettings();
            
            // 基本語彙初期化
            this.initializeBasicVocabulary();
            
            // フィードバック履歴読み込み
            await this.loadFeedbackHistory();
            
            // 学習データから統計更新
            this.updateLearningStatistics();
            
            this.isInitialized = true;
            console.log(`AIEngine初期化完了 - 語彙数: ${this.vocabulary.size}, フィードバック: ${this.feedbackHistory.length}件, キーワード: ${this.currentKeywords.interestWords.length + this.currentKeywords.ngWords.length}語`);
            
            return true;
            
        } catch (error) {
            console.error('AIEngine初期化エラー:', error);
            this.isInitialized = false;
            return false;
        }
    }
    
    // キーワード設定読み込み
    async loadKeywordSettings() {
        try {
            const savedKeywords = localStorage.getItem('yourNews_keywords');
            if (savedKeywords) {
                const keywordsData = JSON.parse(savedKeywords);
                this.currentKeywords = {
                    interestWords: keywordsData.interestWords || [],
                    ngWords: keywordsData.ngWords || []
                };
                console.log(`キーワード設定読み込み: 気になるワード ${this.currentKeywords.interestWords.length}語, NGワード ${this.currentKeywords.ngWords.length}語`);
            } else {
                console.log('キーワード設定なし、デフォルト値使用');
            }
        } catch (error) {
            console.warn('キーワード設定読み込みエラー:', error);
            this.currentKeywords = { interestWords: [], ngWords: [] };
        }
    }
    
    // キーワード設定更新
    async updateKeywordSettings(newKeywords) {
        try {
            this.currentKeywords = {
                interestWords: newKeywords.interestWords || [],
                ngWords: newKeywords.ngWords || []
            };
            
            // localStorage同期保存
            await this.saveKeywordSettings();
            
            console.log(`✅ キーワード設定更新: 気になるワード ${this.currentKeywords.interestWords.length}語, NGワード ${this.currentKeywords.ngWords.length}語`);
            
            return true;
        } catch (error) {
            console.error('キーワード設定更新エラー:', error);
            return false;
        }
    }
    
    // キーワード設定保存
    async saveKeywordSettings() {
        try {
            const keywordsData = {
                interestWords: this.currentKeywords.interestWords,
                ngWords: this.currentKeywords.ngWords,
                lastUpdated: new Date().toISOString()
            };
            
            localStorage.setItem('yourNews_keywords', JSON.stringify(keywordsData));
            console.log('キーワード設定保存完了');
            
        } catch (error) {
            console.error('キーワード設定保存エラー:', error);
        }
    }
    
    async loadSavedData() {
        try {
            // 語彙データ読み込み
            const savedVocab = localStorage.getItem('yourNews_vocabulary');
            if (savedVocab) {
                const vocabArray = JSON.parse(savedVocab);
                this.vocabulary = new Map(vocabArray);
                console.log(`保存語彙読み込み: ${this.vocabulary.size}語`);
            }
            
            // IDF値読み込み
            const savedIdf = localStorage.getItem('yourNews_idf');
            if (savedIdf) {
                const idfArray = JSON.parse(savedIdf);
                this.idfValues = new Map(idfArray);
                console.log(`IDF値読み込み: ${this.idfValues.size}語`);
            }
            
            // ドメイン学習スコア読み込み
            const savedDomainScores = localStorage.getItem('yourNews_domainScores');
            if (savedDomainScores) {
                const domainArray = JSON.parse(savedDomainScores);
                this.domainScores = new Map(domainArray);
                console.log(`ドメインスコア読み込み: ${this.domainScores.size}ドメイン`);
            }
            
            // カテゴリ学習スコア読み込み
            const savedCategoryScores = localStorage.getItem('yourNews_categoryScores');
            if (savedCategoryScores) {
                const categoryArray = JSON.parse(savedCategoryScores);
                this.categoryScores = new Map(categoryArray);
                console.log(`カテゴリスコア読み込み: ${this.categoryScores.size}カテゴリ`);
            }
            
        } catch (error) {
            console.warn('保存データ読み込みエラー:', error);
        }
    }
    
    async loadFeedbackHistory() {
        try {
            const feedback = localStorage.getItem('yourNews_feedback');
            if (feedback) {
                this.feedbackHistory = JSON.parse(feedback);
                console.log(`フィードバック履歴読み込み: ${this.feedbackHistory.length}件`);
                
                // フィードバックから学習統計を更新
                this.updateKeywordWeights();
                this.updateDomainScores();
                this.updateCategoryScores();
            }
        } catch (error) {
            console.warn('フィードバック履歴読み込みエラー:', error);
            this.feedbackHistory = [];
        }
    }
    
    initializeBasicVocabulary() {
        const basicWords = [
            // ニュース関連基本語彙
            'ニュース', '速報', '発表', '開始', '終了', '決定', '発売',
            '政治', '経済', '技術', 'テクノロジー', 'AI', 'IT', 'DX',
            'スポーツ', 'エンタメ', '芸能', '映画', '音楽', 'ゲーム', 'アニメ',
            '健康', '医療', '科学', '環境', '教育', '社会', '国際', '文化',
            '事件', '事故', '災害', '緊急', '警察', '消防', '救急',
            '企業', '会社', '株式', '投資', '金融', '銀行', '経営',
            '新商品', 'サービス', '技術革新', '開発', '研究', '実験',
            // 感情・評価語
            '重要', '注目', '話題', '人気', '評価', '成功', '失敗',
            '素晴らしい', '最高', '最悪', '驚き', '感動', '期待',
            '新しい', '最新', '画期的', '革新', '伝統', '歴史', '未来',
            // 動作・状態語
            '上昇', '下落', '増加', '減少', '改善', '悪化', '変化',
            '開催', '中止', '延期', '変更', '導入', '廃止', '継続',
            '合格', '不合格', '採用', '解雇', '昇進', '降格', '転職'
        ];
        
        basicWords.forEach((word, index) => {
            if (!this.vocabulary.has(word)) {
                this.vocabulary.set(word, this.vocabulary.size);
                this.idfValues.set(word, 1.0);
            }
        });
        
        console.log('基本語彙初期化完了:', this.vocabulary.size + '語');
    }
    
    // フィードバック処理（即座学習）
    async processFeedback(article, feedbackValue) {
        try {
            console.log(`🧠 AI学習開始: ${article.articleId} -> ${feedbackValue}`);
            
            if (!this.isInitialized) {
                console.warn('AIEngine未初期化のためフィードバック処理をスキップ');
                return false;
            }
            
            // フィードバックデータ作成
            const feedbackData = {
                articleId: article.articleId,
                title: article.title,
                excerpt: article.excerpt,
                domain: article.domain,
                category: article.category,
                feedback: feedbackValue,
                timestamp: new Date().toISOString(),
                keywords: this.extractKeywords(article.title + ' ' + article.excerpt),
                url: article.url,
                // 現在のキーワード設定も記録
                currentInterestWords: [...this.currentKeywords.interestWords],
                currentNGWords: [...this.currentKeywords.ngWords]
            };
            
            // フィードバック履歴に追加
            this.feedbackHistory.push(feedbackData);
            
            // 語彙とIDF値更新
            this.updateVocabularyFromArticle(article, feedbackValue);
            
            // 学習統計更新
            this.updateKeywordWeights();
            this.updateDomainScores();
            this.updateCategoryScores();
            
            // データ保存
            await this.saveAIData();
            
            console.log(`✅ AI学習完了: フィードバック履歴 ${this.feedbackHistory.length}件`);
            
            return true;
            
        } catch (error) {
            console.error('フィードバック処理エラー:', error);
            return false;
        }
    }
    
    // 興味度計算（現在のキーワード設定を使用）
    async calculateInterestScore(article, externalKeywords = null) {
        try {
            if (!this.isInitialized) {
                console.warn('AIEngine未初期化、デフォルトスコア使用');
                return 50;
            }
            
            // キーワード設定を決定（外部指定 or 内部設定）
            const keywords = externalKeywords || this.currentKeywords;
            
            const articleText = article.title + ' ' + article.excerpt;
            console.log(`🎯 興味度計算開始: "${article.title.substring(0, 30)}..."`);
            
            // Step 1: NGワード判定（最優先・即座非表示）
            const ngWords = keywords.ngWords || [];
            if (this.containsNGWords(articleText, ngWords)) {
                console.log(`🚫 NGワード検出により非表示: ${article.title}`);
                article.matchedKeywords = [];
                return this.ngWordPenalty; // -1で非表示マーク
            }
            
            // Step 2: 基本スコア計算（フィードバック履歴ベース）
            let baseScore = this.calculateSimilarityScore(article);
            console.log(`📊 基本スコア（類似度）: ${baseScore}点`);
            
            // Step 3: 気になるワードボーナス（重要）
            const interestWords = keywords.interestWords || [];
            const matchedKeywords = this.checkKeywordMatch(articleText, interestWords);
            const keywordBonus = matchedKeywords.length * this.keywordBonusPoints;
            console.log(`🔍 キーワードマッチ: ${matchedKeywords.length}個 (+${keywordBonus}点)`);
            
            // Step 4: ドメイン学習スコア
            const domainScore = this.calculateDomainScore(article.domain);
            console.log(`🌐 ドメインスコア: ${domainScore}点`);
            
            // Step 5: カテゴリ学習スコア
            const categoryScore = this.calculateCategoryScore(article.category);
            console.log(`📂 カテゴリスコア: ${categoryScore}点`);
            
            // Step 6: 時間経過減衰
            const timeDecay = this.calculateTimeDecay(article.publishDate);
            console.log(`⏰ 時間減衰: ${timeDecay}点`);
            
            // Step 7: 最終スコア計算
            const rawScore = baseScore + keywordBonus + domainScore + categoryScore + timeDecay;
            const finalScore = Math.min(100, Math.max(0, Math.round(rawScore)));
            
            // マッチしたキーワード情報を記事に追加
            article.matchedKeywords = matchedKeywords;
            
            console.log(`🎯 最終興味度: ${finalScore}点 (基本:${baseScore} + キーワード:${keywordBonus} + ドメイン:${domainScore} + カテゴリ:${categoryScore} + 時間:${timeDecay})`);
            
            return finalScore;
            
        } catch (error) {
            console.error('興味度計算エラー:', error);
            return 50; // デフォルトスコア
        }
    }
    
    // NGワード判定
    containsNGWords(text, ngWords) {
        if (!ngWords || ngWords.length === 0) return false;
        
        const lowerText = text.toLowerCase();
        for (const ngWord of ngWords) {
            const lowerNGWord = ngWord.toLowerCase().trim();
            if (lowerNGWord && lowerText.includes(lowerNGWord)) {
                console.log(`🚫 NGワード "${ngWord}" が検出されました`);
                return true;
            }
        }
        
        return false;
    }
    
    // キーワードマッチ検出
    checkKeywordMatch(text, interestWords) {
        if (!interestWords || interestWords.length === 0) return [];
        
        const matchedKeywords = [];
        const lowerText = text.toLowerCase();
        
        interestWords.forEach(keyword => {
            const lowerKeyword = keyword.toLowerCase().trim();
            if (lowerKeyword && lowerText.includes(lowerKeyword)) {
                matchedKeywords.push(keyword);
                console.log(`✅ 気になるワード "${keyword}" がマッチしました`);
            }
        });
        
        return matchedKeywords;
    }
    
    // 類似度スコア計算（フィードバック履歴ベース）
    calculateSimilarityScore(article) {
        try {
            if (this.feedbackHistory.length === 0) return 50;
            
            const articleTokens = this.tokenize(article.title + ' ' + article.excerpt);
            let totalScore = 0;
            let scoreCount = 0;
            
            // 最近のフィードバックほど重要視
            const recentFeedbacks = this.feedbackHistory.slice(-20); // 最新20件
            
            recentFeedbacks.forEach((feedback, index) => {
                const feedbackTokens = this.tokenize(feedback.title + ' ' + feedback.excerpt);
                const similarity = this.calculateCosineSimilarity(articleTokens, feedbackTokens);
                
                if (similarity > 0.1) { // 最小類似度閾値
                    const weight = (index + 1) / recentFeedbacks.length; // 新しいほど重い
                    const feedbackScore = feedback.feedback === 1 ? 80 : 
                                        feedback.feedback === -1 ? 20 : 50;
                    
                    totalScore += similarity * feedbackScore * weight;
                    scoreCount += similarity * weight;
                }
            });
            
            const averageScore = scoreCount > 0 ? totalScore / scoreCount : 50;
            return Math.max(0, Math.min(100, averageScore));
            
        } catch (error) {
            console.warn('類似度計算エラー:', error);
            return 50;
        }
    }
    
    // ドメイン学習スコア
    calculateDomainScore(domain) {
        try {
            const domainScore = this.domainScores.get(domain);
            if (domainScore !== undefined) {
                return Math.round(domainScore);
            }
            
            // ドメインの初回登場時はフィードバック履歴から計算
            const domainFeedbacks = this.feedbackHistory.filter(f => f.domain === domain);
            if (domainFeedbacks.length === 0) return 0;
            
            const positiveCount = domainFeedbacks.filter(f => f.feedback === 1).length;
            const negativeCount = domainFeedbacks.filter(f => f.feedback === -1).length;
            const totalCount = positiveCount + negativeCount;
            
            if (totalCount === 0) return 0;
            
            const ratio = positiveCount / totalCount;
            const score = (ratio - 0.5) * 20; // -10〜+10点
            
            // キャッシュ
            this.domainScores.set(domain, score);
            
            return Math.round(score);
            
        } catch (error) {
            return 0;
        }
    }
    
    // カテゴリ学習スコア
    calculateCategoryScore(category) {
        try {
            if (!category || category === 'その他') return 0;
            
            const categoryScore = this.categoryScores.get(category);
            if (categoryScore !== undefined) {
                return Math.round(categoryScore);
            }
            
            // カテゴリの初回登場時はフィードバック履歴から計算
            const categoryFeedbacks = this.feedbackHistory.filter(f => f.category === category);
            if (categoryFeedbacks.length === 0) return 0;
            
            const positiveCount = categoryFeedbacks.filter(f => f.feedback === 1).length;
            const negativeCount = categoryFeedbacks.filter(f => f.feedback === -1).length;
            const totalCount = positiveCount + negativeCount;
            
            if (totalCount === 0) return 0;
            
            const ratio = positiveCount / totalCount;
            const score = (ratio - 0.5) * 15; // -7.5〜+7.5点
            
            // キャッシュ
            this.categoryScores.set(category, score);
            
            return Math.round(score);
            
        } catch (error) {
            return 0;
        }
    }
    
    // 時間経過による減衰
    calculateTimeDecay(publishDateString) {
        try {
            const publishDate = new Date(publishDateString);
            const now = new Date();
            const hoursDiff = (now - publishDate) / (1000 * 60 * 60);
            
            // 24時間以内: 0点、48時間以内: -5点、それ以降: -10点
            if (hoursDiff <= 24) return 0;
            if (hoursDiff <= 48) return -5;
            return -10;
            
        } catch (error) {
            return 0;
        }
    }
    
    // テキストトークン化
    tokenize(text) {
        return text.toLowerCase()
            .replace(/[^\w\sぁ-んァ-ン一-龯]/g, ' ') // 日本語対応
            .split(/\s+/)
            .filter(token => token.length > 1)
            .slice(0, 100); // トークン数制限
    }
    
    // キーワード抽出
    extractKeywords(text) {
        const tokens = this.tokenize(text);
        const keywords = [];
        
        tokens.forEach(token => {
            if (this.vocabulary.has(token)) {
                keywords.push(token);
            } else {
                // 新しい語彙を動的追加
                this.vocabulary.set(token, this.vocabulary.size);
                this.idfValues.set(token, 1.0);
                keywords.push(token);
            }
        });
        
        return keywords;
    }
    
    // コサイン類似度計算
    calculateCosineSimilarity(tokens1, tokens2) {
        try {
            const set1 = new Set(tokens1);
            const set2 = new Set(tokens2);
            const intersection = new Set([...set1].filter(x => set2.has(x)));
            
            if (set1.size === 0 || set2.size === 0) return 0;
            
            const similarity = intersection.size / Math.sqrt(set1.size * set2.size);
            return Math.min(1.0, similarity);
            
        } catch (error) {
            return 0;
        }
    }
    
    // 語彙更新
    updateVocabularyFromArticle(article, feedbackValue) {
        try {
            const tokens = this.tokenize(article.title + ' ' + article.excerpt);
            
            tokens.forEach(token => {
                if (!this.vocabulary.has(token)) {
                    this.vocabulary.set(token, this.vocabulary.size);
                }
                
                // IDF値更新（フィードバックに基づく）
                const currentIdf = this.idfValues.get(token) || 1.0;
                const adjustment = feedbackValue === 1 ? 
                    this.learningRate : 
                    feedbackValue === -1 ? -this.learningRate * 0.5 : 0;
                    
                this.idfValues.set(token, Math.max(0.1, Math.min(5.0, currentIdf + adjustment)));
            });
            
        } catch (error) {
            console.warn('語彙更新エラー:', error);
        }
    }
    
    // キーワード重み更新
    updateKeywordWeights() {
        try {
            this.keywordWeights.clear();
            
            this.feedbackHistory.forEach(feedback => {
                feedback.keywords?.forEach(keyword => {
                    const currentWeight = this.keywordWeights.get(keyword) || 0;
                    const adjustment = feedback.feedback === 1 ? 1 : 
                                     feedback.feedback === -1 ? -0.5 : 0;
                    this.keywordWeights.set(keyword, currentWeight + adjustment);
                });
            });
            
        } catch (error) {
            console.warn('キーワード重み更新エラー:', error);
        }
    }
    
    // ドメインスコア更新
    updateDomainScores() {
        try {
            const domainStats = new Map();
            
            this.feedbackHistory.forEach(feedback => {
                const domain = feedback.domain;
                if (!domainStats.has(domain)) {
                    domainStats.set(domain, { positive: 0, negative: 0 });
                }
                
                const stats = domainStats.get(domain);
                if (feedback.feedback === 1) {
                    stats.positive++;
                } else if (feedback.feedback === -1) {
                    stats.negative++;
                }
            });
            
            domainStats.forEach((stats, domain) => {
                const total = stats.positive + stats.negative;
                if (total > 0) {
                    const ratio = stats.positive / total;
                    const score = (ratio - 0.5) * 20;
                    this.domainScores.set(domain, score);
                }
            });
            
        } catch (error) {
            console.warn('ドメインスコア更新エラー:', error);
        }
    }
    
    // カテゴリスコア更新
    updateCategoryScores() {
        try {
            const categoryStats = new Map();
            
            this.feedbackHistory.forEach(feedback => {
                const category = feedback.category;
                if (!categoryStats.has(category)) {
                    categoryStats.set(category, { positive: 0, negative: 0 });
                }
                
                const stats = categoryStats.get(category);
                if (feedback.feedback === 1) {
                    stats.positive++;
                } else if (feedback.feedback === -1) {
                    stats.negative++;
                }
            });
            
            categoryStats.forEach((stats, category) => {
                const total = stats.positive + stats.negative;
                if (total > 0) {
                    const ratio = stats.positive / total;
                    const score = (ratio - 0.5) * 15;
                    this.categoryScores.set(category, score);
                }
            });
            
        } catch (error) {
            console.warn('カテゴリスコア更新エラー:', error);
        }
    }
    
    // 学習統計更新
    updateLearningStatistics() {
        try {
            this.updateKeywordWeights();
            this.updateDomainScores();
            this.updateCategoryScores();
            
            console.log(`学習統計更新完了: ドメイン ${this.domainScores.size}件, カテゴリ ${this.categoryScores.size}件`);
            
        } catch (error) {
            console.warn('学習統計更新エラー:', error);
        }
    }
    
    // AI学習データ保存
    async saveAIData() {
        try {
            // 語彙保存
            localStorage.setItem('yourNews_vocabulary', JSON.stringify([...this.vocabulary]));
            
            // IDF値保存
            localStorage.setItem('yourNews_idf', JSON.stringify([...this.idfValues]));
            
            // フィードバック履歴保存（最新1000件のみ）
            const recentFeedback = this.feedbackHistory.slice(-1000);
            localStorage.setItem('yourNews_feedback', JSON.stringify(recentFeedback));
            
            // ドメインスコア保存
            localStorage.setItem('yourNews_domainScores', JSON.stringify([...this.domainScores]));
            
            // カテゴリスコア保存
            localStorage.setItem('yourNews_categoryScores', JSON.stringify([...this.categoryScores]));
            
            // キーワード設定も保存
            await this.saveKeywordSettings();
            
            console.log('AI学習データ保存完了');
            
        } catch (error) {
            console.error('AI学習データ保存エラー:', error);
        }
    }
    
    // 統計情報取得
    getStats() {
        const positiveFeedback = this.feedbackHistory.filter(f => f.feedback === 1).length;
        const negativeFeedback = this.feedbackHistory.filter(f => f.feedback === -1).length;
        
        return {
            vocabularySize: this.vocabulary.size,
            feedbackCount: this.feedbackHistory.length,
            keywordWeights: this.keywordWeights.size,
            domainScores: this.domainScores.size,
            categoryScores: this.categoryScores.size,
            isInitialized: this.isInitialized,
            positiveFeedback: positiveFeedback,
            negativeFeedback: negativeFeedback,
            learningRate: this.learningRate,
            currentKeywords: this.currentKeywords
        };
    }
    
    // モデルリセット（キーワード設定含む完全リセット）
    async resetModel() {
        try {
            console.log('🔄 AIモデル完全リセット開始');
            
            this.vocabulary.clear();
            this.idfValues.clear();
            this.feedbackHistory = [];
            this.keywordWeights.clear();
            this.domainScores.clear();
            this.categoryScores.clear();
            
            // キーワード設定もリセット
            this.currentKeywords = {
                interestWords: [],
                ngWords: []
            };
            
            // ローカルストレージからも完全削除
            const keysToRemove = [
                'yourNews_vocabulary',
                'yourNews_idf', 
                'yourNews_feedback',
                'yourNews_domainScores',
                'yourNews_categoryScores',
                'yourNews_keywords' // キーワード設定も削除
            ];
            
            keysToRemove.forEach(key => {
                localStorage.removeItem(key);
                console.log(`削除: ${key}`);
            });
            
            // 基本語彙再初期化
            this.initializeBasicVocabulary();
            
            console.log('✅ AIモデル完全リセット完了（キーワード設定含む）');
            
            return true;
            
        } catch (error) {
            console.error('AIモデルリセットエラー:', error);
            return false;
        }
    }
    
    // デバッグ用: フィードバック履歴出力
    debugFeedbackHistory() {
        console.log('=== フィードバック履歴 ===');
        this.feedbackHistory.slice(-10).forEach((feedback, index) => {
            console.log(`${index + 1}. ${feedback.title} -> ${feedback.feedback} (${feedback.domain})`);
        });
        console.log('========================');
    }
    
    // デバッグ用: キーワード設定表示
    debugKeywordSettings() {
        console.log('=== 現在のキーワード設定 ===');
        console.log('気になるワード:', this.currentKeywords.interestWords);
        console.log('NGワード:', this.currentKeywords.ngWords);
        console.log('=========================');
    }
    
    // デバッグ用: スコア計算詳細
    debugScoreCalculation(article, keywords) {
        console.log('=== スコア計算詳細 ===');
        console.log('記事:', article.title);
        console.log('NGワード:', keywords?.ngWords || this.currentKeywords.ngWords);
        console.log('気になるワード:', keywords?.interestWords || this.currentKeywords.interestWords);
        
        const result = this.calculateInterestScore(article, keywords);
        console.log('最終スコア:', result);
        console.log('===================');
        
        return result;
    }
}
