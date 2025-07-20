// AI処理エンジン（TensorFlow.js・仕様書準拠完全実装版）
class AIEngine {
    constructor() {
        this.model = null;
        this.vocabulary = new Map();
        this.idfValues = new Map();
        this.documentCount = 0;
        this.feedbackHistory = [];
        this.initialized = false;
        
        // 学習パラメータ
        this.learningRate = 0.01;
        this.maxVocabularySize = 10000;
        this.minWordFrequency = 2;
        
        // TF-IDF計算用
        this.documentFrequency = new Map();
        this.totalDocuments = 0;
    }
    
    async initialize() {
        try {
            console.log('AIEngine初期化開始');
            
            if (typeof tf === 'undefined') {
                throw new Error('TensorFlow.js not loaded');
            }
            
            // 保存されたモデル・データの読み込み
            await this.loadSavedModel();
            await this.loadVocabulary();
            await this.loadFeedbackHistory();
            
            // 基本語彙の初期化
            await this.initializeBasicVocabulary();
            
            console.log(`AIEngine初期化完了 - 語彙数: ${this.vocabulary.size}`);
            this.initialized = true;
            
            return true;
            
        } catch (error) {
            console.error('AIEngine初期化エラー:', error);
            
            // フォールバック初期化
            await this.initializeBasicVocabulary();
            this.initialized = true;
            
            return false;
        }
    }
    
    async loadSavedModel() {
        try {
            const savedModel = localStorage.getItem('yourNews_aiModel');
            if (savedModel) {
                const modelData = JSON.parse(savedModel);
                // 簡易モデルデータの復元
                this.documentCount = modelData.documentCount || 0;
                console.log('保存モデル読み込み完了');
            }
        } catch (error) {
            console.warn('保存モデル読み込み失敗:', error);
        }
    }
    
    async loadVocabulary() {
        try {
            const savedVocab = localStorage.getItem('yourNews_vocabulary');
            if (savedVocab) {
                this.vocabulary = new Map(JSON.parse(savedVocab));
            }
            
            const savedIdf = localStorage.getItem('yourNews_idf');
            if (savedIdf) {
                this.idfValues = new Map(JSON.parse(savedIdf));
            }
            
        } catch (error) {
            console.warn('語彙読み込み失敗:', error);
        }
    }
    
    async loadFeedbackHistory() {
        try {
            const saved = localStorage.getItem('yourNews_feedback');
            if (saved) {
                this.feedbackHistory = JSON.parse(saved);
            }
        } catch (error) {
            console.warn('フィードバック履歴読み込み失敗:', error);
        }
    }
    
    async initializeBasicVocabulary() {
        try {
            // 基本的な日本語・英語語彙を初期化
            const basicWords = [
                // 日本語基本語彙
                'ニュース', '記事', '情報', '発表', '発見', '開発', '技術', '政治', '経済',
                '社会', '文化', '科学', '研究', '企業', '会社', '政府', '国際', '世界',
                '日本', '東京', '大阪', '投資', '株価', '市場', '業界', '製品', 'サービス',
                '発売', '販売', '購入', '利用', '使用', '導入', '採用', '実施', '開始',
                
                // 英語基本語彙
                'news', 'article', 'information', 'technology', 'business', 'company',
                'market', 'product', 'service', 'research', 'development', 'innovation',
                'industry', 'economy', 'politics', 'science', 'culture', 'society'
            ];
            
            basicWords.forEach((word, index) => {
                if (!this.vocabulary.has(word)) {
                    this.vocabulary.set(word, index);
                    this.idfValues.set(word, 1.0); // 基本IDF値
                }
            });
            
            console.log(`基本語彙初期化完了: ${basicWords.length}語`);
            
        } catch (error) {
            console.error('基本語彙初期化エラー:', error);
        }
    }
    
    // 仕様書準拠：AI興味度計算メイン関数
    async calculateInterestScore(article, keywords = { interestWords: [], ngWords: [] }) {
        try {
            if (!this.initialized) {
                console.warn('AI Engine not initialized, using fallback');
                return this.calculateFallbackScore(article, keywords);
            }
            
            // 1. NGワード判定：含有時→即座非表示
            if (this.containsNGWords(article.title + ' ' + article.excerpt, keywords.ngWords)) {
                return -1; // NGマーク
            }
            
            // 2. テキスト前処理・ベクトル化
            const articleText = this.preprocessText(article.title + ' ' + article.excerpt);
            const tokens = this.tokenize(articleText);
            const articleVector = this.calculateTFIDF(tokens);
            
            // 3. 過去のフィードバックとの類似度計算
            let similarityScore = 0;
            if (this.feedbackHistory.length > 0) {
                similarityScore = this.calculateAverageSimilarity(articleVector, this.feedbackHistory);
            }
            
            // 4. 気になるワード判定：含有時→+20点ボーナス
            const keywordMatches = this.checkKeywordMatch(article, keywords.interestWords);
            const keywordBonus = keywordMatches.length * 20;
            
            // 5. 最終スコア算出（0-100点）
            const baseScore = Math.max(0, similarityScore * 70);
            const finalScore = Math.min(100, Math.max(0, baseScore + keywordBonus));
            
            // 6. マッチワード情報を記事に付与
            article.matchedKeywords = keywordMatches;
            
            return Math.round(finalScore);
            
        } catch (error) {
            console.error('AI calculation error:', error);
            return this.calculateFallbackScore(article, keywords);
        }
    }
    
    // NGワード検出
    containsNGWords(text, ngWords) {
        if (!Array.isArray(ngWords) || ngWords.length === 0) return false;
        
        const normalizedText = text.toLowerCase();
        return ngWords.some(word => 
            normalizedText.includes(word.toLowerCase())
        );
    }
    
    // キーワードマッチング
    checkKeywordMatch(article, interestWords) {
        if (!Array.isArray(interestWords) || interestWords.length === 0) return [];
        
        const text = (article.title + ' ' + article.excerpt).toLowerCase();
        const matches = [];
        
        interestWords.forEach(word => {
            if (text.includes(word.toLowerCase())) {
                matches.push(word);
            }
        });
        
        return matches;
    }
    
    // テキスト前処理
    preprocessText(text) {
        if (!text) return '';
        
        // HTMLタグ除去
        let processed = text.replace(/<[^>]*>/g, ' ');
        
        // 特殊文字正規化
        processed = processed.replace(/[０-９]/g, (char) => 
            String.fromCharCode(char.charCodeAt(0) - 0xFF10 + 0x30)
        );
        
        // 改行・空白正規化
        processed = processed.replace(/\s+/g, ' ').trim();
        
        return processed;
    }
    
    // トークン化（日本語・英語対応）
    tokenize(text) {
        if (!text) return [];
        
        // 英単語と日本語を分離
        const tokens = [];
        
        // 英単語抽出
        const englishWords = text.match(/[a-zA-Z]+/g) || [];
        englishWords.forEach(word => {
            if (word.length > 2) {
                tokens.push(word.toLowerCase());
            }
        });
        
        // 日本語N-gram（バイグラム）
        const japaneseText = text.replace(/[a-zA-Z0-9\s]/g, '');
        for (let i = 0; i < japaneseText.length - 1; i++) {
            const bigram = japaneseText.substring(i, i + 2);
            if (bigram.length === 2) {
                tokens.push(bigram);
            }
        }
        
        // 単語分割（簡易版）
        const words = text.split(/[\s\p{P}]+/u);
        words.forEach(word => {
            if (word.length > 1 && !/^[0-9]+$/.test(word)) {
                tokens.push(word.toLowerCase());
            }
        });
        
        return tokens.filter(token => token.length > 1);
    }
    
    // TF-IDF計算
    calculateTFIDF(tokens) {
        if (!tokens || tokens.length === 0) return [];
        
        // TF（Term Frequency）計算
        const tf = new Map();
        const totalTokens = tokens.length;
        
        tokens.forEach(token => {
            tf.set(token, (tf.get(token) || 0) + 1);
        });
        
        // 語彙に新しい単語を追加
        tokens.forEach(token => {
            if (!this.vocabulary.has(token) && this.vocabulary.size < this.maxVocabularySize) {
                this.vocabulary.set(token, this.vocabulary.size);
                this.idfValues.set(token, 1.0); // 初期IDF値
            }
        });
        
        // TF-IDFベクトル作成
        const tfidfVector = new Array(this.vocabulary.size).fill(0);
        
        this.vocabulary.forEach((index, token) => {
            const tfValue = (tf.get(token) || 0) / totalTokens;
            const idfValue = this.idfValues.get(token) || 0;
            tfidfVector[index] = tfValue * idfValue;
        });
        
        return tfidfVector;
    }
    
    // 類似度計算
    calculateAverageSimilarity(articleVector, feedbackHistory) {
        try {
            let totalSimilarity = 0;
            let weightSum = 0;
            
            feedbackHistory.forEach(feedback => {
                if (feedback.vector && feedback.feedback !== 0) {
                    const similarity = this.cosineSimilarity(articleVector, feedback.vector);
                    const weight = feedback.feedback; // 1 or -1
                    totalSimilarity += similarity * weight;
                    weightSum += Math.abs(weight);
                }
            });
            
            return weightSum > 0 ? totalSimilarity / weightSum : 0;
            
        } catch (error) {
            console.error('Similarity calculation error:', error);
            return 0;
        }
    }
    
    // コサイン類似度
    cosineSimilarity(vectorA, vectorB) {
        try {
            if (!vectorA || !vectorB || vectorA.length !== vectorB.length) {
                return 0;
            }
            
            let dotProduct = 0;
            let normA = 0;
            let normB = 0;
            
            for (let i = 0; i < vectorA.length; i++) {
                dotProduct += vectorA[i] * vectorB[i];
                normA += vectorA[i] * vectorA[i];
                normB += vectorB[i] * vectorB[i];
            }
            
            if (normA === 0 || normB === 0) return 0;
            
            return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
            
        } catch (error) {
            console.error('Cosine similarity error:', error);
            return 0;
        }
    }
    
    // フィードバック学習処理
    async processFeedback(article, feedback) {
        try {
            if (!article || feedback === undefined) {
                console.error('Invalid feedback data');
                return false;
            }
            
            console.log(`Processing feedback: ${article.articleId} -> ${feedback}`);
            
            // フィードバック正規化
            const normalizedFeedback = this.normalizeFeedback(feedback);
            if (normalizedFeedback === 0) return false; // NG等はスキップ
            
            // 記事ベクトル化
            const articleText = this.preprocessText(article.title + ' ' + article.excerpt);
            const tokens = this.tokenize(articleText);
            const articleVector = this.calculateTFIDF(tokens);
            
            // フィードバック履歴に追加
            const feedbackData = {
                articleId: article.articleId,
                vector: articleVector,
                feedback: normalizedFeedback,
                tokens: tokens,
                timestamp: new Date().toISOString(),
                domain: article.domain,
                category: article.category
            };
            
            this.feedbackHistory.push(feedbackData);
            
            // IDF値更新
            this.updateIDFValues(tokens, normalizedFeedback);
            
            // モデル保存
            await this.saveModel();
            
            console.log(`Feedback processed successfully. History: ${this.feedbackHistory.length} items`);
            return true;
            
        } catch (error) {
            console.error('Feedback processing error:', error);
            return false;
        }
    }
    
    normalizeFeedback(feedback) {
        if (feedback === 1 || feedback === '1' || feedback === 'interest') return 1;
        if (feedback === -1 || feedback === '-1' || feedback === 'disinterest') return -1;
        return 0; // ng等
    }
    
    // IDF値更新
    updateIDFValues(tokens, feedback) {
        try {
            const learningRate = this.learningRate * Math.abs(feedback);
            
            tokens.forEach(token => {
                if (this.idfValues.has(token)) {
                    const currentIdf = this.idfValues.get(token);
                    const newIdf = currentIdf + (learningRate * feedback);
                    this.idfValues.set(token, Math.max(0.1, Math.min(5.0, newIdf)));
                }
            });
            
        } catch (error) {
            console.error('IDF update error:', error);
        }
    }
    
    // フォールバック興味度計算
    calculateFallbackScore(article, keywords) {
        try {
            let score = 50; // ベーススコア
            
            // キーワードマッチング
            const keywordMatches = this.checkKeywordMatch(article, keywords.interestWords || []);
            score += keywordMatches.length * 15;
            
            // ドメイン評価（簡易）
            const trustedDomains = ['nhk.or.jp', 'nikkei.com', 'reuters.com', 'bbc.com'];
            if (trustedDomains.some(domain => article.domain.includes(domain))) {
                score += 10;
            }
            
            // 新しさ評価
            const publishDate = new Date(article.publishDate);
            const now = new Date();
            const hoursDiff = (now - publishDate) / (1000 * 60 * 60);
            
            if (hoursDiff < 24) score += 5;
            if (hoursDiff < 6) score += 5;
            
            return Math.min(100, Math.max(0, Math.round(score)));
            
        } catch (error) {
            console.error('Fallback score calculation error:', error);
            return 50;
        }
    }
    
    // モデル保存
    async saveModel() {
        try {
            // 語彙保存
            const vocabArray = Array.from(this.vocabulary.entries());
            localStorage.setItem('yourNews_vocabulary', JSON.stringify(vocabArray));
            
            // IDF値保存
            const idfArray = Array.from(this.idfValues.entries());
            localStorage.setItem('yourNews_idf', JSON.stringify(idfArray));
            
            // フィードバック履歴保存（最新1000件のみ）
            const recentHistory = this.feedbackHistory.slice(-1000);
            localStorage.setItem('yourNews_feedback', JSON.stringify(recentHistory));
            
            // モデルメタデータ保存
            const modelData = {
                documentCount: this.documentCount,
                vocabularySize: this.vocabulary.size,
                lastUpdated: new Date().toISOString(),
                version: '1.0'
            };
            localStorage.setItem('yourNews_aiModel', JSON.stringify(modelData));
            
            return true;
            
        } catch (error) {
            console.error('Model save error:', error);
            return false;
        }
    }
    
    // モデルリセット
    async resetModel() {
        try {
            this.vocabulary.clear();
            this.idfValues.clear();
            this.feedbackHistory = [];
            this.documentCount = 0;
            
            // ストレージクリア
            localStorage.removeItem('yourNews_vocabulary');
            localStorage.removeItem('yourNews_idf');
            localStorage.removeItem('yourNews_feedback');
            localStorage.removeItem('yourNews_aiModel');
            
            // 基本語彙再初期化
            await this.initializeBasicVocabulary();
            
            console.log('AI model reset completed');
            return true;
            
        } catch (error) {
            console.error('Model reset error:', error);
            return false;
        }
    }
    
    // 統計情報取得
    getStats() {
        return {
            initialized: this.initialized,
            vocabularySize: this.vocabulary.size,
            feedbackCount: this.feedbackHistory.length,
            documentCount: this.documentCount,
            avgIDF: this.calculateAverageIDF(),
            lastActivity: this.feedbackHistory.length > 0 ? 
                this.feedbackHistory[this.feedbackHistory.length - 1].timestamp : null
        };
    }
    
    calculateAverageIDF() {
        if (this.idfValues.size === 0) return 0;
        
        let sum = 0;
        this.idfValues.forEach(value => sum += value);
        return sum / this.idfValues.size;
    }
    
    // デバッグ・分析機能
    analyzeArticle(article) {
        try {
            const text = this.preprocessText(article.title + ' ' + article.excerpt);
            const tokens = this.tokenize(text);
            const vector = this.calculateTFIDF(tokens);
            
            return {
                articleId: article.articleId,
                tokenCount: tokens.length,
                uniqueTokens: new Set(tokens).size,
                vectorLength: vector.length,
                vectorNorm: Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0)),
                topTokens: this.getTopTokens(tokens, 10)
            };
            
        } catch (error) {
            console.error('Article analysis error:', error);
            return null;
        }
    }
    
    getTopTokens(tokens, count = 10) {
        const frequency = new Map();
        tokens.forEach(token => {
            frequency.set(token, (frequency.get(token) || 0) + 1);
        });
        
        return Array.from(frequency.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, count)
            .map(([token, freq]) => ({ token, frequency: freq }));
    }
}
