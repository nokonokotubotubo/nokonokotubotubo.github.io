// AI処理エンジン（仕様書準拠TensorFlow.js実装）
class AIEngine {
    constructor() {
        this.model = null;
        this.vocabulary = new Map();
        this.idfValues = new Map();
        this.documentCount = 0;
        this.isInitialized = false;
        
        // 学習データキャッシュ
        this.trainingData = [];
        this.feedbackHistory = [];
        
        // 日本語処理用設定
        this.stopWords = new Set([
            'の', 'に', 'は', 'を', 'が', 'で', 'と', 'て', 'だ', 'である',
            'です', 'ます', 'した', 'する', 'される', 'ある', 'いる',
            'これ', 'それ', 'あれ', 'この', 'その', 'あの', 'ここ', 'そこ', 'あそこ'
        ]);
    }
    
    async initialize() {
        try {
            console.log('AIEngine初期化開始');
            
            // TensorFlow.js利用可能性確認
            if (typeof tf === 'undefined') {
                throw new Error('TensorFlow.js not loaded');
            }
            
            // 保存済み語彙・IDF値読み込み
            await this.loadSavedModel();
            
            // 基本語彙が空の場合、初期化
            if (this.vocabulary.size === 0) {
                await this.initializeBaseVocabulary();
            }
            
            this.isInitialized = true;
            console.log(`AIEngine初期化完了 - 語彙数: ${this.vocabulary.size}`);
            
            return true;
            
        } catch (error) {
            console.error('AIEngine初期化エラー:', error);
            throw new Error('AI機能の初期化に失敗しました: ' + error.message);
        }
    }
    
    async loadSavedModel() {
        try {
            // localStorageから保存データ読み込み
            const savedVocab = localStorage.getItem('yourNews_vocabulary');
            if (savedVocab) {
                const vocabArray = JSON.parse(savedVocab);
                this.vocabulary = new Map(vocabArray);
            }
            
            const savedIdf = localStorage.getItem('yourNews_idf');
            if (savedIdf) {
                const idfArray = JSON.parse(savedIdf);
                this.idfValues = new Map(idfArray);
            }
            
            const savedHistory = localStorage.getItem('yourNews_feedback');
            if (savedHistory) {
                this.feedbackHistory = JSON.parse(savedHistory);
            }
            
            const savedDocCount = localStorage.getItem('yourNews_docCount');
            if (savedDocCount) {
                this.documentCount = parseInt(savedDocCount);
            }
            
            console.log('保存モデル読み込み完了');
            
        } catch (error) {
            console.warn('保存モデル読み込み失敗、新規作成:', error);
        }
    }
    
    async saveModel() {
        try {
            // 語彙・IDF値・履歴をlocalStorageに保存
            localStorage.setItem('yourNews_vocabulary', 
                JSON.stringify(Array.from(this.vocabulary.entries())));
            localStorage.setItem('yourNews_idf', 
                JSON.stringify(Array.from(this.idfValues.entries())));
            localStorage.setItem('yourNews_feedback', 
                JSON.stringify(this.feedbackHistory));
            localStorage.setItem('yourNews_docCount', 
                this.documentCount.toString());
            
            console.log('AIモデル保存完了');
            
        } catch (error) {
            console.error('AIモデル保存エラー:', error);
        }
    }
    
    initializeBaseVocabulary() {
        // 基本的な日本語単語を初期語彙に追加
        const baseWords = [
            // ニュース関連
            'ニュース', 'news', '記事', '情報', '速報', '最新',
            '政治', '経済', '社会', '国際', '技術', 'テクノロジー',
            '科学', 'IT', 'AI', '人工知能', '企業', '会社',
            
            // 感情・評価語
            '重要', '注目', '話題', '人気', '関心', '興味',
            '問題', '課題', '成功', '失敗', '向上', '改善',
            
            // 時間・頻度
            '今日', '昨日', '明日', '今週', '来週', '月',
            '年', '時間', '分', '秒', '頻繁', '時々'
        ];
        
        baseWords.forEach((word, index) => {
            this.vocabulary.set(word, index);
            this.idfValues.set(word, 1.0); // 初期IDF値
        });
        
        console.log(`基本語彙初期化完了: ${baseWords.length}語`);
    }
    
    // テキスト前処理・トークン化（仕様書準拠）
    tokenize(text) {
        if (!text || typeof text !== 'string') return [];
        
        try {
            // 日本語・英語混在テキストの処理
            return text
                .toLowerCase()
                .replace(/[^\w\s\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, ' ') // 日本語文字保持
                .split(/\s+/)
                .filter(token => 
                    token.length > 0 && 
                    !this.stopWords.has(token) &&
                    token.length <= 20 // 異常に長いトークン除外
                )
                .slice(0, 100); // トークン数制限
            
        } catch (error) {
            console.error('トークン化エラー:', error, text);
            return [];
        }
    }
    
    // TF-IDF計算（仕様書アルゴリズム準拠）
    calculateTFIDF(tokens) {
        if (!tokens || tokens.length === 0) return [];
        
        try {
            // TF（単語頻度）計算
            const tf = new Map();
            const totalTokens = tokens.length;
            
            tokens.forEach(token => {
                tf.set(token, (tf.get(token) || 0) + 1);
            });
            
            // TF-IDFベクトル構築
            const maxVocabSize = 1000; // 語彙数制限
            const tfidfVector = new Array(Math.min(this.vocabulary.size, maxVocabSize)).fill(0);
            
            this.vocabulary.forEach((index, token) => {
                if (index >= maxVocabSize) return;
                
                const tfValue = (tf.get(token) || 0) / totalTokens;
                const idfValue = this.idfValues.get(token) || 0;
                tfidfVector[index] = tfValue * idfValue;
            });
            
            return tfidfVector;
            
        } catch (error) {
            console.error('TF-IDF計算エラー:', error);
            return [];
        }
    }
    
    // コサイン類似度計算
    cosineSimilarity(vector1, vector2) {
        if (!vector1 || !vector2 || vector1.length !== vector2.length) {
            return 0;
        }
        
        try {
            let dotProduct = 0;
            let magnitude1 = 0;
            let magnitude2 = 0;
            
            for (let i = 0; i < vector1.length; i++) {
                dotProduct += vector1[i] * vector2[i];
                magnitude1 += vector1[i] * vector1[i];
                magnitude2 += vector2[i] * vector2[i];
            }
            
            const magnitude = Math.sqrt(magnitude1) * Math.sqrt(magnitude2);
            return magnitude === 0 ? 0 : dotProduct / magnitude;
            
        } catch (error) {
            console.error('類似度計算エラー:', error);
            return 0;
        }
    }
    
    // メイン関数：興味度スコア計算（仕様書アルゴリズム準拠）
    calculateInterestScore(article, keywords = { interestWords: [], ngWords: [] }) {
        if (!this.isInitialized) {
            console.warn('AIEngine未初期化、デフォルトスコアを返却');
            return 50;
        }
        
        try {
            // Step1: NGワード判定（仕様書準拠）
            const articleText = (article.title || '') + ' ' + (article.excerpt || '');
            
            if (this.containsNGWords(articleText, keywords.ngWords || [])) {
                console.log('NGワード検出、非表示対象:', article.articleId);
                return -1; // 非表示フラグ
            }
            
            // Step2: テキストベクトル化
            const tokens = this.tokenize(articleText);
            if (tokens.length === 0) {
                return 50; // デフォルトスコア
            }
            
            const articleVector = this.calculateTFIDF(tokens);
            
            // Step3: 過去フィードバックとの類似度計算
            let similarityScore = this.calculateAverageSimilarity(articleVector);
            
            // Step4: キーワードマッチング（仕様書準拠）
            const keywordMatches = this.checkKeywordMatch(articleText, keywords.interestWords || []);
            const keywordBonus = keywordMatches.length * 20; // 1キーワード=+20点
            
            // Step5: 最終スコア算出（0-100点）
            const baseScore = Math.max(0, similarityScore * 70);
            const finalScore = Math.min(100, Math.max(0, baseScore + keywordBonus));
            
            // Step6: マッチキーワード情報付与
            article.matchedKeywords = keywordMatches;
            
            console.log(`興味度算出: ${article.articleId} = ${Math.round(finalScore)}点 (基本:${Math.round(baseScore)}, キーワード:+${keywordBonus})`);
            
            return Math.round(finalScore);
            
        } catch (error) {
            console.error('興味度計算エラー:', error, article);
            return 50; // フォールバックスコア
        }
    }
    
    // NGワード判定（仕様書準拠）
    containsNGWords(text, ngWords) {
        if (!text || !Array.isArray(ngWords) || ngWords.length === 0) {
            return false;
        }
        
        const lowerText = text.toLowerCase();
        
        return ngWords.some(ngWord => {
            const lowerNGWord = ngWord.toLowerCase();
            return lowerText.includes(lowerNGWord);
        });
    }
    
    // キーワードマッチング（仕様書準拠）
    checkKeywordMatch(text, interestWords) {
        if (!text || !Array.isArray(interestWords) || interestWords.length === 0) {
            return [];
        }
        
        const lowerText = text.toLowerCase();
        const matches = [];
        
        interestWords.forEach(keyword => {
            const lowerKeyword = keyword.toLowerCase();
            if (lowerText.includes(lowerKeyword)) {
                matches.push(keyword);
            }
        });
        
        return matches;
    }
    
    // 過去フィードバックとの平均類似度計算
    calculateAverageSimilarity(articleVector) {
        if (this.feedbackHistory.length === 0 || articleVector.length === 0) {
            return 0.5; // 中立スコア
        }
        
        try {
            let positiveScores = [];
            let negativeScores = [];
            
            this.feedbackHistory.slice(-50).forEach(feedback => { // 最新50件のみ使用
                if (feedback.vector && feedback.vector.length > 0) {
                    const similarity = this.cosineSimilarity(articleVector, feedback.vector);
                    
                    if (feedback.feedback > 0) {
                        positiveScores.push(similarity);
                    } else if (feedback.feedback < 0) {
                        negativeScores.push(similarity);
                    }
                }
            });
            
            // 正負のスコア統合
            const avgPositive = positiveScores.length > 0 
                ? positiveScores.reduce((a, b) => a + b) / positiveScores.length 
                : 0.5;
                
            const avgNegative = negativeScores.length > 0
                ? negativeScores.reduce((a, b) => a + b) / negativeScores.length
                : 0.5;
            
            // 最終類似度 = 正類似度 - 負類似度 + 0.5（正規化）
            return Math.max(0, Math.min(1, avgPositive - avgNegative + 0.5));
            
        } catch (error) {
            console.error('類似度計算エラー:', error);
            return 0.5;
        }
    }
    
    // フィードバック学習処理（仕様書準拠）
    async processFeedback(articleId, feedback, article) {
        if (!this.isInitialized || !article) {
            console.warn('AIEngine未初期化またはarticleなし');
            return false;
        }
        
        try {
            console.log(`フィードバック学習開始: ${articleId}, feedback: ${feedback}`);
            
            // テキストベクトル化
            const articleText = (article.title || '') + ' ' + (article.excerpt || '');
            const tokens = this.tokenize(articleText);
            
            if (tokens.length === 0) {
                console.warn('トークンが空、学習スキップ');
                return false;
            }
            
            // 新語彙追加
            this.updateVocabulary(tokens);
            
            // ベクトル計算
            const articleVector = this.calculateTFIDF(tokens);
            
            // フィードバック履歴追加
            const feedbackData = {
                articleId: articleId,
                feedback: parseInt(feedback) || 0,
                vector: articleVector,
                timestamp: new Date().toISOString(),
                domain: article.domain,
                category: article.category
            };
            
            this.feedbackHistory.push(feedbackData);
            
            // 履歴サイズ制限（最新1000件）
            if (this.feedbackHistory.length > 1000) {
                this.feedbackHistory = this.feedbackHistory.slice(-1000);
            }
            
            // IDF値更新
            this.updateIDF();
            
            // モデル保存
            await this.saveModel();
            
            console.log(`フィードバック学習完了: ${articleId}`);
            return true;
            
        } catch (error) {
            console.error('フィードバック学習エラー:', error);
            return false;
        }
    }
    
    // 語彙更新
    updateVocabulary(tokens) {
        const maxVocabSize = 1000;
        
        tokens.forEach(token => {
            if (!this.vocabulary.has(token) && this.vocabulary.size < maxVocabSize) {
                const index = this.vocabulary.size;
                this.vocabulary.set(token, index);
                this.idfValues.set(token, 1.0); // 初期IDF値
            }
        });
    }
    
    // IDF値更新
    updateIDF() {
        try {
            const totalDocs = this.feedbackHistory.length;
            if (totalDocs === 0) return;
            
            // 各単語の文書頻度計算
            const documentFreq = new Map();
            
            this.feedbackHistory.forEach(feedback => {
                const tokens = this.tokenize(feedback.title + ' ' + feedback.excerpt || '');
                const uniqueTokens = new Set(tokens);
                
                uniqueTokens.forEach(token => {
                    documentFreq.set(token, (documentFreq.get(token) || 0) + 1);
                });
            });
            
            // IDF計算: log(総文書数 / 単語を含む文書数)
            this.vocabulary.forEach((index, token) => {
                const df = documentFreq.get(token) || 1;
                const idf = Math.log(totalDocs / df);
                this.idfValues.set(token, Math.max(0.1, idf)); // 最小値0.1
            });
            
        } catch (error) {
            console.error('IDF更新エラー:', error);
        }
    }
    
    // バッチ処理：複数記事の興味度一括計算
    async calculateBatchInterestScores(articles, keywords = { interestWords: [], ngWords: [] }) {
        if (!Array.isArray(articles) || articles.length === 0) {
            return [];
        }
        
        console.log(`AI一括処理開始: ${articles.length}件`);
        const startTime = Date.now();
        
        try {
            const results = articles.map(article => {
                const score = this.calculateInterestScore(article, keywords);
                return {
                    ...article,
                    interestScore: score
                };
            });
            
            const endTime = Date.now();
            console.log(`AI一括処理完了: ${articles.length}件, ${endTime - startTime}ms`);
            
            return results;
            
        } catch (error) {
            console.error('AI一括処理エラー:', error);
            return articles.map(article => ({ ...article, interestScore: 50 }));
        }
    }
    
    // デバッグ・統計情報
    getStats() {
        return {
            initialized: this.isInitialized,
            vocabularySize: this.vocabulary.size,
            feedbackCount: this.feedbackHistory.length,
            documentCount: this.documentCount,
            avgIDF: this.idfValues.size > 0 
                ? Array.from(this.idfValues.values()).reduce((a, b) => a + b) / this.idfValues.size 
                : 0
        };
    }
    
    // AI処理リセット（デバッグ用）
    async resetModel() {
        console.log('AIモデルリセット実行');
        
        this.vocabulary.clear();
        this.idfValues.clear();
        this.feedbackHistory = [];
        this.documentCount = 0;
        
        // localStorage削除
        ['yourNews_vocabulary', 'yourNews_idf', 'yourNews_feedback', 'yourNews_docCount']
            .forEach(key => localStorage.removeItem(key));
        
        // 再初期化
        await this.initializeBaseVocabulary();
        await this.saveModel();
        
        console.log('AIモデルリセット完了');
    }
}

// Phase C確認用デバッグ関数
window.debugAIEngine = async function() {
    console.log('=== AI Engine Debug ===');
    
    try {
        const aiEngine = new AIEngine();
        await aiEngine.initialize();
        
        console.log('AI Engine stats:', aiEngine.getStats());
        
        // テスト記事でのスコア計算
        const testArticle = {
            articleId: 'test_ai_001',
            title: 'AI技術の最新動向について',
            excerpt: 'AI技術が急速に発展しており、様々な分野で応用が期待されています。',
            domain: 'tech-news.com'
        };
        
        const testKeywords = {
            interestWords: ['AI', '技術'],
            ngWords: ['広告', 'スパム']
        };
        
        const score = aiEngine.calculateInterestScore(testArticle, testKeywords);
        console.log('Test interest score:', score);
        console.log('Matched keywords:', testArticle.matchedKeywords);
        
        // フィードバック学習テスト
        await aiEngine.processFeedback('test_ai_001', 1, testArticle);
        console.log('Feedback learning test completed');
        
        console.log('Updated stats:', aiEngine.getStats());
        
    } catch (error) {
        console.error('AI Engine debug error:', error);
    }
    
    console.log('=== AI Engine Debug Complete ===');
};
