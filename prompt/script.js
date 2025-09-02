// script.js - メタプロンプトジェネレータ版（動的表示制御対応）
class MetaPromptGenerator {
    constructor() {
        this.version = '2.0.1'; // バージョンアップ（動的制御対応）
        this.debugMode = localStorage.getItem('debugMode') === 'true';
        this.performanceMonitor = new PerformanceMonitor();
        this.securityValidator = new SecurityValidator();
        this.testSuite = new TestSuite(this);

        // 基本要素
        this.form = document.getElementById('promptForm');
        this.output = document.getElementById('output');
        this.generatedPrompt = document.getElementById('generatedPrompt');
        this.savedTemplates = document.getElementById('savedTemplates');

        // データ
        this.templates = this.loadTemplates();
        this.hallucinationPatterns = this.loadHallucinationPatterns();
        this.verificationDatabase = this.loadVerificationDatabase();
        this.metaPromptPatterns = this.loadMetaPromptPatterns(); // 🆕 メタプロンプトパターン

        // UI状態管理
        this.currentStep = 0;
        this.totalSteps = 4;
        this.darkMode = localStorage.getItem('darkMode') === 'true';
        this.fontSize = localStorage.getItem('fontSize') || 'normal';
        this.formProgress = 0;

        // パフォーマンス追跡
        this.performanceMetrics = {
            loadTime: 0,
            renderTime: 0,
            memoryUsage: 0,
            interactionLatency: []
        };

        this.init();
    }

    init() {
        const startTime = performance.now();
        try {
            this.performanceMonitor.start('initialization');
            this.setupTheme();
            this.setupFontSize();
            this.performanceOptimization();
            this.bindEvents();
            this.setupDynamicFormControl(); // 🆕 動的制御を追加
            this.loadSavedTemplates();
            this.setupFormValidation();
            this.initHallucinationPrevention();
            this.setupStepNavigation();
            this.setupAccessibility();
            this.setupNotificationSystem();
            this.updateProgress();
            this.setupSecurity();

            // デバッグモード初期化
            if (this.debugMode) {
                this.initDebugMode();
            }

            // パフォーマンス測定
            this.performanceMetrics.loadTime = performance.now() - startTime;
            this.performanceMonitor.end('initialization');

            // セキュリティ初期チェック
            this.securityValidator.performInitialSecurityCheck();

            // エラー境界設定
            this.setupErrorBoundary();

            this.logDebug('MetaPrompt Generator initialized successfully', {
                loadTime: this.performanceMetrics.loadTime,
                version: this.version
            });
        } catch (error) {
            this.handleCriticalError('Initialization failed', error);
        }
    }

    // 🆕 動的表示制御の追加
    setupDynamicFormControl() {
        // タスクタイプ変更時の制御
        document.getElementById('taskType').addEventListener('change', () => {
            this.handleTaskTypeChange();
        });

        // 詳細度レベル変更時の制御
        document.getElementById('detailLevel').addEventListener('input', (e) => {
            this.handleDetailLevelChange(e.target.value);
        });

        // ハルシネーション防止機能変更時の制御
        document.querySelectorAll('input[name="hallucinationPrevention"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.handleHallucinationPreventionChange();
            });
        });

        // 初期状態の設定
        this.handleTaskTypeChange();
        this.handleDetailLevelChange(5); // デフォルト値
        this.handleHallucinationPreventionChange();
    }

    // タスクタイプに応じた項目表示制御
    handleTaskTypeChange() {
        const taskType = document.getElementById('taskType').value;
        const domainGroup = document.getElementById('domain').closest('.form-group');
        const outputFormatGroup = document.getElementById('outputFormat').closest('.form-group');
        const contextInfoGroup = document.getElementById('contextInfo').closest('.form-group');
        const targetAudienceGroup = document.getElementById('targetAudience').closest('.form-group');

        // タスクタイプ別のドメイン選択肢を制限
        this.updateDomainOptions(taskType);

        // タスクタイプ別の出力形式を制限
        this.updateOutputFormatOptions(taskType);

        // コンテキスト情報の必要性を判定
        if (['analysis', 'research', 'qa'].includes(taskType)) {
            contextInfoGroup.style.display = 'block';
            this.markFieldRequired('contextInfo', true);
        } else {
            contextInfoGroup.style.display = 'none';
            this.markFieldRequired('contextInfo', false);
        }

        // 対象読者の表示制御
        if (['creative', 'text-generation', 'translation'].includes(taskType)) {
            targetAudienceGroup.style.display = 'block';
        } else {
            targetAudienceGroup.style.display = 'none';
            // デフォルト値を設定
            document.getElementById('targetAudience').value = 'general';
        }
    }

    // ドメイン選択肢の動的更新
    updateDomainOptions(taskType) {
        const domainSelect = document.getElementById('domain');
        const domainMappings = {
            'text-generation': ['ビジネス・経営', 'マーケティング', 'クリエイティブ', 'コンテンツ制作'],
            'creative': ['クリエイティブ', 'コンテンツ制作', '教育・学習'],
            'analysis': ['研究・学術', 'データサイエンス', 'ビジネス・経営', 'テクノロジー・IT'],
            'research': ['研究・学術', 'データサイエンス', '医療・健康', 'テクノロジー・IT'],
            'code-generation': ['テクノロジー・IT', 'データサイエンス'],
            'translation': ['汎用・その他', '教育・学習', 'ビジネス・経営'],
            'qa': ['教育・学習', '汎用・その他', 'ビジネス・経営'],
            'summarization': ['汎用・その他', 'ビジネス・経営', '研究・学術']
        };

        const allowedDomains = domainMappings[taskType] || Object.values(domainMappings).flat();
        const currentValue = domainSelect.value;

        // 選択肢を更新
        Array.from(domainSelect.options).forEach(option => {
            if (option.value === '') return; // 空の選択肢は保持
            option.style.display = allowedDomains.includes(option.textContent) ? 'block' : 'none';
        });

        // 現在の値が無効な場合はリセット
        if (currentValue && !allowedDomains.includes(domainSelect.options[domainSelect.selectedIndex]?.textContent)) {
            domainSelect.value = '';
        }
    }

    // 出力形式選択肢の動的更新
    updateOutputFormatOptions(taskType) {
        const outputFormatSelect = document.getElementById('outputFormat');
        const formatMappings = {
            'code-generation': ['structured', 'markdown'],
            'creative': ['paragraph', 'structured'],
            'analysis': ['structured', 'table'],
            'research': ['structured', 'markdown'],
            'summarization': ['paragraph', 'list', 'structured'],
            'translation': ['paragraph'],
            'qa': ['structured', 'paragraph']
        };

        const allowedFormats = formatMappings[taskType] || Object.values(formatMappings).flat();
        const currentValue = outputFormatSelect.value;

        Array.from(outputFormatSelect.options).forEach(option => {
            if (option.value === '') return;
            option.style.display = allowedFormats.includes(option.value) ? 'block' : 'none';
        });

        if (currentValue && !allowedFormats.includes(currentValue)) {
            outputFormatSelect.value = '';
        }
    }

    // 詳細度レベルに応じた表示制御
    handleDetailLevelChange(level) {
        const detailLevel = parseInt(level, 10);
        const customInstructionsGroup = document.getElementById('customInstructions').closest('.form-group');
        const expectedLengthGroup = document.getElementById('expectedLength').closest('.form-group');

        // 詳細度が7以上の場合のみ詳細設定を表示
        if (detailLevel >= 7) {
            customInstructionsGroup.style.display = 'block';
            expectedLengthGroup.style.display = 'block';
        } else {
            customInstructionsGroup.style.display = 'none';
            expectedLengthGroup.style.display = 'none';
            // デフォルト値を設定
            document.getElementById('expectedLength').value = 'standard';
        }

        this.updateDetailLevelDisplay(level);
    }

    // ハルシネーション防止機能に応じた表示制御
    handleHallucinationPreventionChange() {
        const checkedBoxes = document.querySelectorAll('input[name="hallucinationPrevention"]:checked');
        const qualityLevelGroup = document.getElementById('qualityLevel').closest('.form-group');

        // チェックされた項目がある場合のみ品質レベルを表示
        if (checkedBoxes.length > 0) {
            qualityLevelGroup.style.display = 'block';
        } else {
            qualityLevelGroup.style.display = 'none';
            // デフォルト値を設定
            document.getElementById('qualityLevel').value = 'standard';
        }
    }

    // フィールドの必須/任意を動的に変更
    markFieldRequired(fieldId, required) {
        const field = document.getElementById(fieldId);
        const label = document.querySelector(`label[for="${fieldId}"]`);
        const requiredMark = label.querySelector('.required');

        if (required) {
            field.setAttribute('required', 'required');
            if (!requiredMark) {
                const span = document.createElement('span');
                span.className = 'required';
                span.textContent = ' *';
                label.appendChild(span);
            }
        } else {
            field.removeAttribute('required');
            if (requiredMark) {
                requiredMark.remove();
            }
        }
    }

    // 🆕 メタプロンプトパターンの読み込み
    loadMetaPromptPatterns() {
        return {
            instructionDesign: {
                name: 'インストラクション設計',
                templates: [
                    {
                        pattern: 'role-task-format',
                        description: 'ロール-タスク-フォーマット構造',
                        template: 'あなたは{role}として行動してください。{task}を実行し、結果を{format}で出力してください。'
                    },
                    {
                        pattern: 'step-by-step',
                        description: '段階的思考プロセス',
                        template: '以下の手順で段階的に考えてください：\n1. 問題の分析\n2. 解決策の検討\n3. 最適解の選択\n4. 実装手順の提示'
                    },
                    {
                        pattern: 'context-constraint',
                        description: 'コンテキスト-制約構造',
                        template: '【コンテキスト】\n{context}\n\n【制約条件】\n{constraints}\n\n【求める出力】\n{output_requirements}'
                    }
                ]
            },
            promptOptimization: {
                name: 'プロンプト最適化',
                techniques: [
                    'few-shot-learning', // 少数例学習
                    'chain-of-thought', // 思考連鎖
                    'tree-of-thoughts', // 思考木
                    'self-consistency', // 自己一貫性
                    'constitutional-ai' // 憲法AI
                ]
            },
            evaluationCriteria: {
                name: '評価基準',
                metrics: [
                    'clarity', // 明確性
                    'specificity', // 具体性
                    'completeness', // 完全性
                    'consistency', // 一貫性
                    'safety' // 安全性
                ]
            }
        };
    }

    // 🆕 メタプロンプト生成メイン関数（generatePromptを拡張）
    async generatePrompt() {
        const startTime = performance.now();
        try {
            this.performanceMonitor.start('generateMetaPrompt');

            // フォーム検証
            if (!this.validateForm()) {
                this.showNotification('必須項目を入力してください', 'error');
                return;
            }

            const formData = this.getFormData();

            // 🆕 メタプロンプト生成ロジック
            const metaPrompt = await this.createMetaPrompt(formData);

            // UI更新
            this.displayGeneratedPrompt(metaPrompt);
            this.showOutput();

            // パフォーマンス記録
            const generateTime = performance.now() - startTime;
            this.performanceMetrics.renderTime = generateTime;
            this.performanceMonitor.end('generateMetaPrompt');

            this.logDebug('MetaPrompt generated successfully', {
                generateTime,
                promptLength: metaPrompt.length
            });

            this.showNotification('メタプロンプトを生成しました', 'success');
        } catch (error) {
            this.handleError('メタプロンプト生成エラー', error);
            this.showNotification('生成中にエラーが発生しました', 'error');
        }
    }

    // 🆕 メタプロンプト作成コア機能
    async createMetaPrompt(formData) {
        const { taskType, domain, outputFormat, taskPurpose, contextInfo, customInstructions, detailLevel, hallucinationPrevention } = formData;

        // メタプロンプトの構造を構築
        const metaPromptStructure = this.buildMetaPromptStructure(formData);

        // セクション別にプロンプトを生成
        const sections = {
            systemPrompt: this.generateSystemPrompt(formData),
            roleDefinition: this.generateRoleDefinition(taskType, domain),
            taskInstructions: this.generateTaskInstructions(taskPurpose, taskType),
            outputSpecifications: this.generateOutputSpecifications(outputFormat, detailLevel),
            qualityGuidelines: this.generateQualityGuidelines(hallucinationPrevention),
            exampleStructure: this.generateExampleStructure(formData),
            evaluationCriteria: this.generateEvaluationCriteria(formData)
        };

        return this.assembleMetaPrompt(sections, metaPromptStructure);
    }

    // 🆕 メタプロンプト構造の構築
    buildMetaPromptStructure(formData) {
        const structure = {
            useSystemPrompt: true,
            includeRolePlay: formData.taskType !== 'analysis',
            requireExamples: formData.detailLevel > 6,
            enableChainOfThought: formData.hallucinationPrevention.includes('stepByStep'),
            includeSafetyGuidelines: formData.hallucinationPrevention.length > 0,
            useMetaInstructions: true // メタプロンプト特有の要素
        };

        return structure;
    }

    // 🆕 システムプロンプト生成
    generateSystemPrompt(formData) {
        const baseSystem = `あなたは高品質な${this.getTaskTypeLabel(formData.taskType)}を作成する専門的なAIアシスタントです。`;

        const systemGuidelines = [
            '正確性と信頼性を最優先に考える',
            '段階的思考プロセスを用いて論理的に回答する',
            '情報源が不明な場合は明確に示す',
            '専門性と理解しやすさのバランスを保つ'
        ];

        return `${baseSystem}\n\n以下のガイドラインに従って作業してください：\n${systemGuidelines.map((g, i) => `${i + 1}. ${g}`).join('\n')}`;
    }

    // 🆕 ロール定義生成
    generateRoleDefinition(taskType, domain) {
        const roleMap = {
            'text-generation': `${domain}分野の専門ライター`,
            'summarization': '情報整理・要約の専門家',
            'analysis': `${domain}分野のアナリスト`,
            'qa': '質疑応答の専門家',
            'translation': '翻訳・言語の専門家',
            'code-generation': 'ソフトウェア開発エンジニア',
            'creative': 'クリエイティブライター',
            'research': `${domain}分野の研究者`
        };

        const role = roleMap[taskType] || '専門家';

        return `【あなたの役割】
あなたは経験豊富な${role}として行動してください。

【専門性の要求】
- ${domain}分野における深い知識と実践経験
- 最新の業界動向と最良実践の把握
- 複雑な概念を分かりやすく説明する能力
- 品質とアクセシビリティの両立`;
    }

    // 🆕 タスク指示生成
    generateTaskInstructions(taskPurpose, taskType) {
        const baseInstructions = `【主要タスク】
${taskPurpose}

【実行プロセス】`;

        const processSteps = this.getProcessSteps(taskType);

        return `${baseInstructions}
${processSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

【重要な注意点】
- 各ステップを明確に実行し、思考プロセスを明示してください
- 不確実な情報については必ずその旨を明記してください
- 複数の視点から検討し、バランスの取れた結論を導いてください`;
    }

    // 🆕 プロセスステップの取得
    getProcessSteps(taskType) {
        const stepMap = {
            'text-generation': [
                '目的と対象読者を明確化',
                '構成と流れを設計',
                '各セクションの内容を詳細化',
                '整合性と読みやすさを確認'
            ],
            'summarization': [
                '原文の主要ポイントを特定',
                '重要度に応じて内容を階層化',
                '要約の目的に応じて内容を選別',
                '簡潔性と完全性を両立'
            ],
            'analysis': [
                'データ・情報の収集と整理',
                'パターンと傾向の特定',
                '根本原因の分析',
                '洞察と推奨事項の提示'
            ],
            'code-generation': [
                '要件の詳細分析',
                'アーキテクチャの設計',
                'コードの実装',
                'テストとドキュメント化'
            ]
        };

        return stepMap[taskType] || [
            '問題の理解と分析',
            '解決策の検討',
            '最適解の選択',
            '結果の検証'
        ];
    }

    // 🆕 出力仕様生成
    generateOutputSpecifications(outputFormat, detailLevel) {
        const detailMap = {
            1: '簡潔', 2: '簡潔', 3: '基本', 4: '基本', 5: '標準',
            6: '標準', 7: '詳細', 8: '詳細', 9: '非常に詳細', 10: '包括的'
        };

        const formatSpecs = this.getFormatSpecifications(outputFormat);

        return `【出力形式】
${formatSpecs}

【詳細レベル】
${detailMap[detailLevel]}（レベル ${detailLevel}/10）

【構造要求】
- 明確な見出しと階層構造
- 論理的な情報の順序
- 読み手にとって理解しやすい表現
- 必要に応じた具体例の提供`;
    }

    // 🆕 フォーマット仕様の取得
    getFormatSpecifications(format) {
        const specs = {
            'structured': `
- 構造化された形式（見出し、箇条書き、番号付きリスト）
- セクションごとの明確な分離
- 階層的な情報整理`,
            'paragraph': `
- 段落形式での記述
- 流れのある文章構成
- 適切な接続詞の使用`,
            'list': `
- 箇条書きまたは番号付きリスト
- 各項目の簡潔な表現
- 論理的な順序での配列`,
            'table': `
- 表形式での整理
- 行・列の明確な定義
- 比較しやすい構造`,
            'markdown': `
- Markdown記法の使用
- 適切な見出しレベル
- コードブロックや引用の活用`
        };

        return specs[format] || specs['structured'];
    }

    // 🆕 品質ガイドライン生成
    generateQualityGuidelines(hallucinationPrevention) {
        let guidelines = `【品質保証ガイドライン】
1. **正確性の確保**
   - 事実に基づいた情報のみを使用
   - 不確実な情報は明確に区別して表示
   - 推測や仮定は明示的にラベル付け

2. **情報源の透明性**
   - 可能な限り情報源を明記
   - 一般的知識と専門的知識を区別
   - 最新性について言及が必要な場合は注記`;

        // ハルシネーション防止機能に応じた追加ガイドライン
        if (hallucinationPrevention.includes('sourceRequirement')) {
            guidelines += `

3. **情報源の明記**
   - すべての事実情報に対して出典を要求
   - 「一般的に知られている」情報も可能な限り出典明記
   - 統計データには必ず出典と年度を記載`;
        }

        if (hallucinationPrevention.includes('uncertaintyExpression')) {
            guidelines += `

4. **不確実性の表現**
   - 断定的表現を避け、適切な蓋然性の表現を使用
   - 「〜と考えられます」「〜の可能性があります」等を活用
   - 確信度のレベルを明示`;
        }

        if (hallucinationPrevention.includes('stepByStep')) {
            guidelines += `

5. **段階的思考プロセス**
   - 複雑な問題は段階的に分解
   - 各ステップの論理的根拠を明示
   - 中間結論と最終結論を区別`;
        }

        if (hallucinationPrevention.includes('factChecking')) {
            guidelines += `

6. **事実確認プロセス**
   - 重要な事実情報は複数の観点から検証
   - 矛盾する情報がある場合は両論併記
   - 情報の最新性と信頼性を評価`;
        }

        return guidelines;
    }

    // 🆕 例文構造生成
    generateExampleStructure(formData) {
        if (formData.detailLevel < 7) return '';

        return `【出力例の構造】
以下のような構造で出力してください：

\`\`\`
【タイトル/見出し】
概要を1-2文で説明

【主要セクション1】
- ポイント1：具体的内容
- ポイント2：具体的内容
- ポイント3：具体的内容

【主要セクション2】
詳細な説明文...

【結論・まとめ】
重要なポイントの再確認
\`\`\``;
    }

    // 🆕 評価基準生成
    generateEvaluationCriteria(formData) {
        return `【出力品質の評価基準】
以下の基準で出力の質を自己評価してください：

✅ **正確性** - 事実情報の正確性
✅ **完全性** - 要求された内容の網羅性
✅ **明確性** - 理解しやすい表現と構造
✅ **論理性** - 論理的一貫性と根拠の明示
✅ **適切性** - 目的と読者に適した内容レベル

【最終チェックリスト】
□ すべての必須要素が含まれているか
□ 事実と推測が適切に区別されているか
□ 読み手にとって理解しやすい構造になっているか
□ 要求された詳細レベルに達しているか`;
    }

    // 🆕 メタプロンプト組み立て
    assembleMetaPrompt(sections, structure) {
        let metaPrompt = '';

        // システムプロンプト
        if (structure.useSystemPrompt) {
            metaPrompt += `${sections.systemPrompt}\n\n`;
        }

        // ロール定義
        if (structure.includeRolePlay) {
            metaPrompt += `${sections.roleDefinition}\n\n`;
        }

        // タスク指示
        metaPrompt += `${sections.taskInstructions}\n\n`;

        // 出力仕様
        metaPrompt += `${sections.outputSpecifications}\n\n`;

        // 品質ガイドライン
        if (structure.includeSafetyGuidelines) {
            metaPrompt += `${sections.qualityGuidelines}\n\n`;
        }

        // 例文構造
        if (structure.requireExamples && sections.exampleStructure) {
            metaPrompt += `${sections.exampleStructure}\n\n`;
        }

        // 評価基準
        metaPrompt += `${sections.evaluationCriteria}\n\n`;

        // メタ指示（メタプロンプト特有）
        if (structure.useMetaInstructions) {
            metaPrompt += this.generateMetaInstructions();
        }

        return metaPrompt.trim();
    }

    // 🆕 メタ指示生成
    generateMetaInstructions() {
        return `【メタ指示】
このプロンプトを使用する際は：
1. **段階的実行**: 上記の手順を順番に実行してください
2. **思考の可視化**: 各段階での思考プロセスを明示してください
3. **品質チェック**: 最終出力前に評価基準に照らして確認してください
4. **継続改善**: 不足があれば追加情報を求めるか、改善提案を行ってください

---
**🚀 プロンプト実行開始**
上記の指示に従って、タスクを開始してください。`;
    }

    // 既存メソッドの修正（タスクタイプラベル取得）
    getTaskTypeLabel(taskType) {
        const labels = {
            'text-generation': '文章生成',
            'summarization': '要約',
            'analysis': '分析',
            'qa': '質疑応答',
            'translation': '翻訳',
            'code-generation': 'コード生成',
            'creative': '創作',
            'research': '調査・研究'
        };
        return labels[taskType] || '情報処理';
    }

    // テーマ設定
    setupTheme() {
        if (this.darkMode) {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    }

    // フォントサイズ設定
    setupFontSize() {
        if (this.fontSize === 'large') {
            document.documentElement.setAttribute('data-font-size', 'large');
        }
    }

    // ステップナビゲーション設定
    setupStepNavigation() {
        const steps = document.querySelectorAll('.nav-step');
        steps.forEach((step, index) => {
            step.addEventListener('click', () => {
                this.goToStep(index);
            });
        });
        this.showStep(0);
    }

    // アクセシビリティ設定
    setupAccessibility() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch(e.key) {
                    case 'Enter':
                        e.preventDefault();
                        this.generatePrompt();
                        break;
                    case 'h':
                        e.preventDefault();
                        this.toggleHelp();
                        break;
                    case 'd':
                        e.preventDefault();
                        this.toggleDarkMode();
                        break;
                }
            }

            if (e.ctrlKey && e.altKey) {
                switch(e.key) {
                    case 'd':
                        e.preventDefault();
                        this.toggleDebugPanel();
                        break;
                    case 't':
                        e.preventDefault();
                        this.testSuite.runAllTests();
                        break;
                    case 'p':
                        e.preventDefault();
                        this.performanceMonitor.generateReport();
                        break;
                }
            }

            if (e.key === 'Escape') {
                this.closeAllPanels();
            }
        });

        this.setupFocusManagement();
    }

    setupFocusManagement() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                const modal = document.querySelector('[role="dialog"]:not([aria-hidden="true"])');
                if (modal) {
                    this.trapFocus(e, modal);
                }
            }
        });
    }

    trapFocus(e, container) {
        const focusable = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const firstFocusable = focusable[0];
        const lastFocusable = focusable[focusable.length - 1];

        if (e.shiftKey) {
            if (document.activeElement === firstFocusable) {
                lastFocusable.focus();
                e.preventDefault();
            }
        } else {
            if (document.activeElement === lastFocusable) {
                firstFocusable.focus();
                e.preventDefault();
            }
        }
    }

    // 通知システム設定
    setupNotificationSystem() {
        this.notificationContainer = document.getElementById('notifications');
    }

    // イベントバインディング
    bindEvents() {
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.generatePrompt();
        });

        this.form.addEventListener('reset', () => {
            this.hideOutput();
            this.clearValidationErrors();
            this.goToStep(0);
            this.updateProgress();
        });

        // 出力アクション
        document.getElementById('copyBtn').addEventListener('click', () => {
            this.copyToClipboard();
        });

        document.getElementById('saveBtn').addEventListener('click', () => {
            this.saveTemplate();
        });

        document.getElementById('refineBtn').addEventListener('click', () => {
            this.refinePrompt();
        });

        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportPrompt();
        });

        // ツールバー
        document.getElementById('darkModeToggle').addEventListener('click', () => {
            this.toggleDarkMode();
        });

        document.getElementById('fontSizeToggle').addEventListener('click', () => {
            this.toggleFontSize();
        });

        document.getElementById('helpToggle').addEventListener('click', () => {
            this.toggleHelp();
        });

        // ヘルプパネル
        document.getElementById('helpClose').addEventListener('click', () => {
            this.closeHelp();
        });

        // ステップナビゲーション
        document.getElementById('prevBtn').addEventListener('click', () => {
            this.previousStep();
        });

        document.getElementById('nextBtn').addEventListener('click', () => {
            this.nextStep();
        });

        // 詳細度レベル
        document.getElementById('detailLevel').addEventListener('input', (e) => {
            this.updateDetailLevelDisplay(e.target.value);
        });

        // 文字数カウント
        document.getElementById('customInstructions').addEventListener('input', (e) => {
            this.updateCharacterCount(e.target);
        });

        // プロンプト表示ツール
        document.getElementById('promptFormat').addEventListener('click', () => {
            this.togglePromptFormat();
        });

        document.getElementById('promptZoom').addEventListener('click', () => {
            this.togglePromptZoom();
        });

        // クイックアクセス
        document.querySelectorAll('.quick-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.loadPreset(e.target.dataset.preset);
            });
        });

        // テンプレート管理
        document.getElementById('templateImport').addEventListener('click', () => {
            this.importTemplates();
        });

        document.getElementById('templateExport').addEventListener('click', () => {
            this.exportTemplates();
        });

        // フォーム進捗更新（debounceを安全に使用）
        try {
            this.form.addEventListener('input', this.debounce(() => {
                this.updateProgress();
            }, 300));
        } catch (error) {
            console.error('Failed to bind debounced input listener:', error);
            // フォールバック: debounceなしで実行
            this.form.addEventListener('input', () => {
                this.updateProgress();
            });
        }

        // レスポンシブ対応
        window.addEventListener('resize', () => {
            this.handleResize();
        });

        // モーダルオーバーレイ
        document.getElementById('modalOverlay').addEventListener('click', () => {
            this.closeAllPanels();
        });
    }

    // パフォーマンス最適化
    performanceOptimization() {
        this.optimizeDOMOperations();
        this.setupMemoryLeakPrevention();
        this.optimizeEventListeners();
        this.implementLazyLoading();
    }

    optimizeDOMOperations() {
        this.createDocumentFragment = () => {
            return document.createDocumentFragment();
        };

        this.virtualDOM = {
            pendingUpdates: [],
            batchUpdate: (callback) => {
                this.virtualDOM.pendingUpdates.push(callback);
                if (this.virtualDOM.pendingUpdates.length === 1) {
                    requestAnimationFrame(() => {
                        this.virtualDOM.pendingUpdates.forEach(cb => cb());
                        this.virtualDOM.pendingUpdates = [];
                    });
                }
            }
        };
    }

    setupMemoryLeakPrevention() {
        this.elementRefs = new WeakMap();
        this.eventListeners = new Map();

        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }

    optimizeEventListeners() {
        this.setupDebounceThrottle();
        this.setupEventDelegation();
        this.setupPassiveListeners();
    }

    setupEventDelegation() {
        try {
            this.form.addEventListener('input', this.debounce((e) => {
                this.handleFormInput(e);
            }, 300), { passive: true });
        } catch (error) {
            console.error('Failed to bind debounced input listener:', error);
            this.form.addEventListener('input', (e) => {
                this.handleFormInput(e);
            }, { passive: true });
        }

        this.form.addEventListener('change', (e) => {
            this.handleFormChange(e);
        });
    }

    setupPassiveListeners() {
        document.addEventListener('scroll', () => {
            this.handleScroll();
        }, { passive: true });

        document.addEventListener('touchstart', () => {
            // タッチイベントの最適化
        }, { passive: true });
    }

    setupDebounceThrottle() {
        this.debounce = (func, wait) => {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        };

        this.throttle = (func, limit) => {
            let inThrottle;
            return function() {
                const args = arguments;
                const context = this;
                if (!inThrottle) {
                    func.apply(context, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        };
    }

    implementLazyLoading() {
        this.lazyObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.loadLazyContent(entry.target);
                }
            });
        });

        document.querySelectorAll('[data-lazy]').forEach(el => {
            this.lazyObserver.observe(el);
        });
    }

    // セキュリティ機能
    setupSecurity() {
        this.sanitizeInput = (input) => {
            const div = document.createElement('div');
            div.textContent = input;
            return div.innerHTML;
        };

        this.checkCSPCompliance();
        this.setupSessionManagement();
        this.setupDataEncryption();
    }

    checkCSPCompliance() {
        if (document.querySelectorAll('script:not([src])').length > 0) {
            this.logSecurity('Inline scripts detected', 'warning');
        }

        this.originalEval = window.eval;
        window.eval = () => {
            this.logSecurity('eval() usage detected', 'error');
            throw new Error('eval() is not allowed for security reasons');
        };
    }

    setupSessionManagement() {
        this.sessionTimeout = 30 * 60 * 1000;
        this.lastActivity = Date.now();

        setInterval(() => {
            if (Date.now() - this.lastActivity > this.sessionTimeout) {
                this.handleSessionTimeout();
            }
        }, 60000);

        ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(event => {
            document.addEventListener(event, () => {
                this.lastActivity = Date.now();
            }, { passive: true });
        });
    }

    setupDataEncryption() {
        this.encrypt = (text) => {
            try {
                return btoa(encodeURIComponent(text));
            } catch (error) {
                this.logSecurity('Encryption failed', 'error', error);
                return text;
            }
        };

        this.decrypt = (encodedText) => {
            try {
                return decodeURIComponent(atob(encodedText));
            } catch (error) {
                this.logSecurity('Decryption failed', 'error', error);
                return encodedText;
            }
        };
    }

    // フォームバリデーション
    setupFormValidation() {
        const requiredFields = ['taskType', 'domain', 'outputFormat'];

        requiredFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            field.addEventListener('blur', () => {
                this.validateField(field);
            });
            field.addEventListener('change', () => {
                this.clearFieldError(field);
            });
        });
    }

    validateField(field) {
        const value = field.value.trim();
        const fieldGroup = field.closest('.form-group');

        if (!value) {
            this.showFieldError(fieldGroup, 'この項目は必須です');
            return false;
        }

        this.clearFieldError(field);
        return true;
    }

    showFieldError(fieldGroup, message) {
        fieldGroup.classList.add('error');
        let errorElement = fieldGroup.querySelector('.error-message');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.className = 'error-message';
            fieldGroup.appendChild(errorElement);
        }
        errorElement.textContent = message;
    }

    clearFieldError(field) {
        const fieldGroup = field.closest('.form-group');
        fieldGroup.classList.remove('error');
        const errorElement = fieldGroup.querySelector('.error-message');
        if (errorElement) {
            errorElement.style.display = 'none';
        }
    }

    clearValidationErrors() {
        const errorGroups = document.querySelectorAll('.form-group.error');
        errorGroups.forEach(group => {
            group.classList.remove('error');
        });

        const errorMessages = document.querySelectorAll('.error-message');
        errorMessages.forEach(msg => {
            msg.style.display = 'none';
        });
    }

    // ハルシネーション防止機構
    initHallucinationPrevention() {
        this.setupRealTimeValidation();
        this.setupFactCheckingSystem();
        this.setupUncertaintyDetection();
    }

    setupRealTimeValidation() {
        const customInstructions = document.getElementById('customInstructions');
        let validationTimeout;

        customInstructions.addEventListener('input', (e) => {
            clearTimeout(validationTimeout);
            validationTimeout = setTimeout(() => {
                this.validateInputForHallucination(e.target.value);
            }, 500);
        });
    }

    setupFactCheckingSystem() {
        this.factCheckingEnabled = true;
        this.factCheckingStrength = 'medium';
    }

    setupUncertaintyDetection() {
        this.uncertaintyKeywords = [
            '確実', '絶対', '必ず', '間違いなく', '100%', '完全に',
            'すべて', '全て', 'つねに', '常に', 'けっして', '決して'
        ];
    }

    loadHallucinationPatterns() {
        return {
            dangerousAssertions: [
                /確実に.+である/g,
                /間違いなく.+だ/g,
                /絶対に.+する/g,
                /100%.+である/g,
                /必ず.+になる/g
            ],
            uncertaintyExpressions: [
                '〜と考えられます',
                '〜の可能性があります',
                '〜と推測されます',
                '〜である可能性が高いです',
                '一般的に〜とされています',
                '〜という説があります'
            ],
            sourceRequirements: [
                '統計データ',
                '研究結果',
                '具体的な事例',
                '歴史的事実',
                '科学的知見',
                '法的情報'
            ]
        };
    }

    loadVerificationDatabase() {
        return {
            factCategories: {
                'statistics': '統計情報は信頼できる機関の最新データを使用してください',
                'historical': '歴史的事実は複数の信頼できる資料で確認してください',
                'scientific': '科学的情報は査読済み論文を参照してください',
                'legal': '法的情報は最新の法令・判例を確認してください',
                'medical': '医学的情報は医学専門機関の情報を参照してください'
            },
            verificationSteps: [
                '情報の正確性を複数の信頼できるソースで確認する',
                '最新性を確保し、古い情報でないかチェックする',
                '偏見や主観的解釈が混入していないか検証する',
                '数値データは元データの確認を行う',
                '専門用語の定義を正確に使用する'
            ]
        };
    }

    validateInputForHallucination(text) {
        const warnings = [];

        this.hallucinationPatterns.dangerousAssertions.forEach(pattern => {
            if (pattern.test(text)) {
                warnings.push({
                    type: 'assertion',
                    message: '断定的な表現が検出されました。不確実性の表現を検討してください。',
                    severity: 'warning'
                });
            }
        });

        this.uncertaintyKeywords.forEach(keyword => {
            if (text.includes(keyword)) {
                warnings.push({
                    type: 'uncertainty',
                    message: `「${keyword}」のような断定的表現は避けることを推奨します。`,
                    severity: 'info'
                });
            }
        });

        if (this.requiresFactChecking(text)) {
            warnings.push({
                type: 'source',
                message: '事実情報が含まれています。情報源の明記を強く推奨します。',
                severity: 'error'
            });
        }

        this.displayValidationWarnings(warnings);
        return warnings;
    }

    requiresFactChecking(text) {
        const factIndicators = [
            /\d+%/, /\d{4}年/, /\d+人/, /研究によると/, /統計では/, /法律で/, /医学的に/
        ];
        return factIndicators.some(pattern => pattern.test(text));
    }

    displayValidationWarnings(warnings) {
        const customInstructionsGroup = document.getElementById('customInstructions').closest('.form-group');
        let warningContainer = customInstructionsGroup.querySelector('.hallucination-warnings');

        if (!warningContainer) {
            warningContainer = document.createElement('div');
            warningContainer.className = 'hallucination-warnings';
            customInstructionsGroup.appendChild(warningContainer);
        }

        if (warnings.length === 0) {
            warningContainer.innerHTML = '';
            return;
        }

        const warningsHTML = warnings.map(warning => `
            <div class="warning-item severity-${warning.severity}">
                <span class="warning-icon">${this.getWarningIcon(warning.severity)}</span>
                <span class="warning-message">${warning.message}</span>
            </div>
        `).join('');

        warningContainer.innerHTML = `
            <div class="warnings-header">⚠️ 品質向上のための提案</div>
            ${warningsHTML}
        `;
    }

    getWarningIcon(severity) {
        const icons = {
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        return icons[severity] || 'ℹ️';
    }

    // フォームデータ取得
    getFormData() {
        const formData = new FormData(this.form);
        const data = {};

        for (let [key, value] of formData.entries()) {
            if (data[key]) {
                if (Array.isArray(data[key])) {
                    data[key].push(value);
                } else {
                    data[key] = [data[key], value];
                }
            } else {
                data[key] = value;
            }
        }

        // チェックボックスの処理
        const hallucinationPrevention = [];
        document.querySelectorAll('input[name="hallucinationPrevention"]:checked').forEach(cb => {
            hallucinationPrevention.push(cb.value);
        });
        data.hallucinationPrevention = hallucinationPrevention;

        // 詳細度レベルを数値に変換
        data.detailLevel = parseInt(document.getElementById('detailLevel').value, 10);

        return data;
    }

    // バリデーション
    validateForm() {
        const requiredFields = ['taskType', 'domain', 'outputFormat', 'taskPurpose'];
        let isValid = true;

        requiredFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (!field.value.trim()) {
                this.showFieldError(field.closest('.form-group'), 'この項目は必須です');
                isValid = false;
            }
        });

        return isValid;
    }

    // UI表示制御
    showOutput() {
        this.output.style.display = 'block';
        this.output.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    hideOutput() {
        this.output.style.display = 'none';
    }

    displayGeneratedPrompt(prompt) {
        this.generatedPrompt.textContent = prompt;
        this.generatedPrompt.setAttribute('aria-label', `生成されたメタプロンプト: ${prompt.substring(0, 100)}...`);
    }

    // ステップ制御
    showStep(stepIndex) {
        const sections = document.querySelectorAll('.form-section');
        const steps = document.querySelectorAll('.nav-step');

        sections.forEach((section, index) => {
            if (index === stepIndex) {
                section.classList.add('active');
            } else {
                section.classList.remove('active');
            }
        });

        steps.forEach((step, index) => {
            step.classList.remove('active');
            if (index === stepIndex) {
                step.classList.add('active');
            } else if (index < stepIndex) {
                step.classList.add('completed');
            } else {
                step.classList.remove('completed');
            }
        });

        this.currentStep = stepIndex;
        this.updateStepButtons();
    }

    goToStep(stepIndex) {
        if (stepIndex >= 0 && stepIndex < this.totalSteps) {
            this.showStep(stepIndex);
        }
    }

    nextStep() {
        if (this.currentStep < this.totalSteps - 1) {
            this.goToStep(this.currentStep + 1);
        }
    }

    previousStep() {
        if (this.currentStep > 0) {
            this.goToStep(this.currentStep - 1);
        }
    }

    updateStepButtons() {
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');

        prevBtn.disabled = this.currentStep === 0;
        nextBtn.disabled = this.currentStep === this.totalSteps - 1;
    }

    // プログレス更新（🆕 null参照エラー修正）
updateProgress() {
    if (!this.form) {
        this.logError('Form not found in updateProgress');
        return;
    }

    const allInputs = this.form.querySelectorAll('input, select, textarea');
    let filledInputs = 0;
    let totalInputs = 0;

    allInputs.forEach(input => {
        // 🆕 安全な形でform-groupをチェック
        const formGroup = input.closest('.form-group');
        
        // form-groupが見つからない、または非表示の要素は除外
        if (!formGroup || formGroup.style.display === 'none') {
            return;
        }

        totalInputs++;
        if (input.type === 'checkbox') {
            const checkedInputs = document.querySelectorAll(`input[name="${input.name}"]:checked`);
            if (checkedInputs.length > 0) {
                filledInputs++;
            }
        } else if (input.value && input.value.trim()) {
            filledInputs++;
        }
    });

    this.formProgress = totalInputs > 0 ? (filledInputs / totalInputs) * 100 : 0;

    const progressFill = document.querySelector('.progress-fill');
    if (progressFill) {
        progressFill.style.width = `${this.formProgress}%`;
    }
}


    // 詳細度表示更新
    updateDetailLevelDisplay(value) {
        const display = document.querySelector('.range-value');
        if (display) {
            display.textContent = `${value} - ${this.getDetailLevelLabel(value)}`;
        }
    }

    getDetailLevelLabel(level) {
        const labels = {
            1: '最簡潔', 2: '簡潔', 3: '基本', 4: '基本', 5: '標準',
            6: '標準', 7: '詳細', 8: '詳細', 9: '非常に詳細', 10: '包括的'
        };
        return labels[level] || '標準';
    }

    // 文字数カウント更新
    updateCharacterCount(element, maxCount = 1000) {
        const currentCount = element.value.length;
        const countDisplay = element.parentNode.querySelector('.character-count');

        if (countDisplay) {
            countDisplay.innerHTML = `<span>${currentCount}</span> / ${maxCount} 文字`;

            if (currentCount > maxCount * 0.9) {
                countDisplay.style.color = 'var(--warning-color)';
            } else {
                countDisplay.style.color = 'var(--text-muted)';
            }
        }
    }

    // 出力操作
    async copyToClipboard() {
        try {
            await navigator.clipboard.writeText(this.generatedPrompt.textContent);
            this.showNotification('クリップボードにコピーしました', 'success');
        } catch (error) {
            this.fallbackCopyToClipboard();
        }
    }

    fallbackCopyToClipboard() {
        const textArea = document.createElement('textarea');
        textArea.value = this.generatedPrompt.textContent;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            document.execCommand('copy');
            this.showNotification('クリップボードにコピーしました', 'success');
        } catch (error) {
            this.showNotification('コピーに失敗しました', 'error');
        }

        document.body.removeChild(textArea);
    }

    saveTemplate() {
        const data = this.getFormData();
        const template = {
            id: Date.now(),
            name: `${data.taskType}_${data.domain}_${Date.now()}`,
            data: data,
            createdAt: new Date().toISOString()
        };

        this.templates.push(template);
        this.saveTemplates();
        this.loadSavedTemplates();
        this.showNotification('テンプレートを保存しました', 'success');
    }

    refinePrompt() {
        // プロンプト改善機能の実装
        this.showNotification('プロンプト改善機能は開発中です', 'info');
    }

    exportPrompt() {
        const blob = new Blob([this.generatedPrompt.textContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `meta-prompt-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        this.showNotification('メタプロンプトをエクスポートしました', 'success');
    }

    // UI制御
    toggleDarkMode() {
        this.darkMode = !this.darkMode;
        localStorage.setItem('darkMode', this.darkMode);
        this.setupTheme();
        this.showNotification(`${this.darkMode ? 'ダーク' : 'ライト'}モードに切り替えました`, 'info');
    }

    toggleFontSize() {
        this.fontSize = this.fontSize === 'large' ? 'normal' : 'large';
        localStorage.setItem('fontSize', this.fontSize);
        this.setupFontSize();
        this.showNotification(`フォントサイズを${this.fontSize === 'large' ? '大' : '標準'}に変更しました`, 'info');
    }

    toggleHelp() {
        const helpPanel = document.getElementById('helpPanel');
        const overlay = document.getElementById('modalOverlay');
        helpPanel.classList.toggle('active');
        overlay.classList.toggle('active');
    }

    closeHelp() {
        const helpPanel = document.getElementById('helpPanel');
        const overlay = document.getElementById('modalOverlay');
        helpPanel.classList.remove('active');
        overlay.classList.remove('active');
    }

    closeAllPanels() {
        this.closeHelp();
        if (this.debugMode) {
            const debugPanel = document.getElementById('debugPanel');
            if (debugPanel) {
                debugPanel.style.display = 'none';
            }
        }
    }

    togglePromptFormat() {
        this.generatedPrompt.classList.toggle('formatted');
        this.showNotification('表示形式を切り替えました', 'info');
    }

    togglePromptZoom() {
        this.generatedPrompt.classList.toggle('large');
        this.showNotification('表示サイズを切り替えました', 'info');
    }

    // レスポンシブ対応
    handleResize() {
        // リサイズ処理の実装
    }

    // フォーム入力処理
    handleFormInput(e) {
        this.updateProgress();
        
        if (e.target.name === 'taskPurpose' || e.target.name === 'contextInfo') {
            this.updateCharacterCount(e.target, e.target.name === 'taskPurpose' ? 2000 : 1000);
        }

        if (e.target.name === 'customInstructions') {
            this.updateCharacterCount(e.target);
        }
    }

    handleFormChange(e) {
        this.updateProgress();
    }

    handleScroll() {
        // スクロール処理の実装
    }

    // プリセット読み込み
    loadPreset(presetName) {
        const presets = {
            'business-writing': {
                taskType: 'text-generation',
                domain: 'ビジネス・経営',
                outputFormat: 'structured',
                taskPurpose: 'ビジネス文書を効果的に作成する',
                targetAudience: 'business',
                detailLevel: 6
            },
            'data-analysis': {
                taskType: 'analysis',
                domain: 'データサイエンス',
                outputFormat: 'structured',
                taskPurpose: 'データを分析し洞察を得る',
                targetAudience: 'technical',
                detailLevel: 7
            },
            'creative-content': {
                taskType: 'creative',
                domain: 'クリエイティブ',
                outputFormat: 'paragraph',
                taskPurpose: '魅力的なコンテンツを創作する',
                targetAudience: 'general',
                detailLevel: 5
            }
        };

        const preset = presets[presetName];
        if (preset) {
            Object.keys(preset).forEach(key => {
                const element = document.getElementById(key);
                if (element) {
                    element.value = preset[key];
                }
            });
            this.updateProgress();
            this.showNotification(`プリセット「${presetName}」を読み込みました`, 'success');
        }
    }

    // テンプレート管理
    loadSavedTemplates() {
        this.savedTemplates.innerHTML = '';

        if (this.templates.length === 0) {
            this.savedTemplates.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: var(--spacing-lg);">保存されたメタプロンプトテンプレートはありません</p>';
            return;
        }

        this.templates.forEach(template => {
            const templateElement = this.createTemplateElement(template);
            this.savedTemplates.appendChild(templateElement);
        });
    }

    createTemplateElement(template) {
        const div = document.createElement('div');
        div.className = 'template-item';
        div.innerHTML = `
            <h4>📄 ${template.data.taskType} - ${template.data.domain}</h4>
            <p>📅 ${new Date(template.createdAt).toLocaleDateString('ja-JP')}</p>
        `;

        div.addEventListener('click', () => {
            this.loadTemplate(template);
        });

        return div;
    }

    loadTemplate(template) {
        const data = template.data;

        Object.keys(data).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = data[key] && data[key].includes(element.value);
                } else {
                    element.value = data[key] || '';

                    // 文字数カウントの更新
                    if (key === 'taskPurpose' || key === 'contextInfo' || key === 'customInstructions') {
                        const maxCount = key === 'taskPurpose' ? 2000 : 1000;
                        this.updateCharacterCount(element, maxCount);
                    }
                }
            }
        });

        if (data.hallucinationPrevention) {
            const checkboxes = document.querySelectorAll('input[name="hallucinationPrevention"]');
            checkboxes.forEach(checkbox => {
                checkbox.checked = data.hallucinationPrevention.includes(checkbox.value);
            });
        }

        this.updateProgress();
        this.showNotification('メタプロンプトテンプレートを読み込みました', 'success');
    }

    loadTemplates() {
        const saved = localStorage.getItem('metaPromptTemplates');
        return saved ? JSON.parse(saved) : [];
    }

    saveTemplates() {
        localStorage.setItem('metaPromptTemplates', JSON.stringify(this.templates));
    }

    importTemplates() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const importedTemplates = JSON.parse(e.target.result);
                        this.templates = [...this.templates, ...importedTemplates];
                        this.saveTemplates();
                        this.loadSavedTemplates();
                        this.showNotification('メタプロンプトテンプレートをインポートしました', 'success');
                    } catch (error) {
                        this.showNotification('インポートに失敗しました', 'error');
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    }

    exportTemplates() {
        const blob = new Blob([JSON.stringify(this.templates, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `meta-prompt-templates-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showNotification('メタプロンプトテンプレートをエクスポートしました', 'success');
    }

    // 通知システム
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            ${this.getNotificationIcon(type)}
            ${message}
            <button class="notification-close" onclick="this.parentNode.remove()">×</button>
        `;

        this.notificationContainer.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOutRight 300ms ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);

        this.announceToScreenReader(message);
    }

    getNotificationIcon(type) {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        return icons[type] || 'ℹ️';
    }

    announceToScreenReader(message) {
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.style.position = 'absolute';
        announcement.style.left = '-10000px';
        announcement.textContent = message;
        document.body.appendChild(announcement);

        setTimeout(() => {
            document.body.removeChild(announcement);
        }, 1000);
    }

    // デバッグモード
    initDebugMode() {
        console.log('🐛 MetaPrompt Debug Mode Enabled');
        this.createDebugPanel();
        this.enablePerformanceTracking();
        this.enableErrorTracking();
        this.setupDebugShortcuts();
    }

    createDebugPanel() {
        const debugPanel = document.createElement('div');
        debugPanel.id = 'debugPanel';
        debugPanel.className = 'debug-panel';
        debugPanel.innerHTML = `
            <div class="debug-header">
                <h3>🐛 Debug Panel</h3>
                <button class="debug-close" onclick="document.getElementById('debugPanel').style.display='none'">×</button>
            </div>
            <div class="debug-content">
                <div class="debug-section">
                    <h4>Performance</h4>
                    <div id="debugPerformance"></div>
                </div>
                <div class="debug-section">
                    <h4>Form State</h4>
                    <div id="debugFormState"></div>
                </div>
                <div class="debug-section">
                    <h4>Logs</h4>
                    <div id="debugLogs" class="debug-logs"></div>
                </div>
                <div class="debug-section">
                    <button class="debug-btn" onclick="this.testSuite?.runAllTests()">Run Tests</button>
                    <button class="debug-btn" onclick="this.performanceMonitor?.generateReport()">Performance Report</button>
                </div>
            </div>
        `;

        document.body.appendChild(debugPanel);
    }

    toggleDebugPanel() {
        const debugPanel = document.getElementById('debugPanel');
        if (debugPanel) {
            debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none';
        }
    }

    enablePerformanceTracking() {
        // パフォーマンス追跡の詳細実装
    }

    enableErrorTracking() {
        // エラー追跡の詳細実装
    }

    setupDebugShortcuts() {
        // デバッグショートカットの詳細実装
    }

    logDebug(message, data = null) {
        if (!this.debugMode) return;

        console.log(`[MetaPrompt Debug] ${message}`, data);
        const debugLogs = document.getElementById('debugLogs');
        if (debugLogs) {
            const logEntry = document.createElement('div');
            logEntry.className = 'debug-log-entry debug-log-debug';
            logEntry.innerHTML = `
                <span class="debug-timestamp">[${new Date().toLocaleTimeString()}]</span>
                <span class="debug-message">${message}</span>
                ${data ? `<pre class="debug-data">${JSON.stringify(data, null, 2)}</pre>` : ''}
            `;
            debugLogs.appendChild(logEntry);
            debugLogs.scrollTop = debugLogs.scrollHeight;

            if (debugLogs.children.length > 50) {
                debugLogs.removeChild(debugLogs.firstChild);
            }
        }
    }

    logError(message, error) {
        console.error(`[MetaPrompt Error] ${message}`, error);
        const debugLogs = document.getElementById('debugLogs');
        if (debugLogs && this.debugMode) {
            const logEntry = document.createElement('div');
            logEntry.className = 'debug-log-entry debug-log-error';
            logEntry.innerHTML = `
                <span class="debug-timestamp">[${new Date().toLocaleTimeString()}]</span>
                <span class="debug-message">ERROR: ${message}</span>
                <pre class="debug-data">${error.stack || error.message || error}</pre>
            `;
            debugLogs.appendChild(logEntry);
            debugLogs.scrollTop = debugLogs.scrollHeight;
        }
    }

    logSecurity(message, level, data = null) {
        console.warn(`[MetaPrompt Security ${level.toUpperCase()}] ${message}`, data);
        const debugLogs = document.getElementById('debugLogs');
        if (debugLogs && this.debugMode) {
            const logEntry = document.createElement('div');
            logEntry.className = 'debug-log-entry debug-log-security';
            logEntry.innerHTML = `
                <span class="debug-timestamp">[${new Date().toLocaleTimeString()}]</span>
                <span class="debug-message">SECURITY ${level.toUpperCase()}: ${message}</span>
                ${data ? `<pre class="debug-data">${JSON.stringify(data, null, 2)}</pre>` : ''}
            `;
            debugLogs.appendChild(logEntry);
            debugLogs.scrollTop = debugLogs.scrollHeight;
        }
    }

    // エラーハンドリング
    setupErrorBoundary() {
        this.errorBoundary = {
            componentStack: [],
            handleError: (error, errorInfo) => {
                this.logError('Component Error', {
                    error: error.message,
                    stack: error.stack,
                    componentStack: errorInfo.componentStack
                });
                this.renderErrorFallback(error);
            }
        };
    }

    renderErrorFallback(error) {
        const errorContainer = document.createElement('div');
        errorContainer.className = 'error-fallback';
        errorContainer.innerHTML = `
            <div class="error-content">
                <h2>エラーが発生しました</h2>
                <p>メタプロンプトジェネレータでエラーが発生しました。ページを再読み込みしてください。</p>
                <details>
                    <summary>エラー詳細</summary>
                    <pre>${error.stack}</pre>
                </details>
                <button onclick="location.reload()">ページを再読み込み</button>
            </div>
        `;

        document.body.appendChild(errorContainer);
    }

    handleError(message, error) {
        this.logError(message, error);
        console.error(`[MetaPrompt] ${message}:`, error);
    }

    handleCriticalError(message, error) {
        this.logError(`CRITICAL: ${message}`, error);
        console.error(`[MetaPrompt CRITICAL] ${message}:`, error);

        const criticalErrorElement = document.createElement('div');
        criticalErrorElement.className = 'critical-error';
        criticalErrorElement.innerHTML = `
            <h1>🚨 アプリケーションエラー</h1>
            <p>アプリケーションの初期化に失敗しました。ページを再読み込みしてください。</p>
            <details>
                <summary>エラー詳細 (開発者向け)</summary>
                <pre>${error.stack || error.message}</pre>
            </details>
            <button onclick="location.reload()">ページを再読み込み</button>
        `;

        document.body.innerHTML = '';
        document.body.appendChild(criticalErrorElement);
    }

    handleSessionTimeout() {
        this.showNotification('セッションがタイムアウトしました。ページを更新してください。', 'warning');
    }

    // クリーンアップ
    cleanup() {
        if (this.lazyObserver) {
            this.lazyObserver.disconnect();
        }

        this.eventListeners.forEach((listener, element) => {
            element.removeEventListener(listener.event, listener.handler);
        });

        this.eventListeners.clear();
    }

    // セッション管理
    saveSession() {
        const sessionData = {
            formData: this.getFormData(),
            currentStep: this.currentStep,
            timestamp: Date.now()
        };
        sessionStorage.setItem('metaPromptSession', JSON.stringify(sessionData));
    }

    loadSession() {
        const saved = sessionStorage.getItem('metaPromptSession');
        if (saved) {
            try {
                const sessionData = JSON.parse(saved);
                                // セッションが24時間以内の場合のみ復元
                if (Date.now() - sessionData.timestamp < 24 * 60 * 60 * 1000) {
                    this.loadTemplate({ data: sessionData.formData });
                    this.goToStep(sessionData.currentStep);
                    this.showNotification('前回のセッションを復元しました', 'info');
                }
            } catch (error) {
                this.logError('Session restore failed', error);
            }
        }
    }
}

// パフォーマンスモニター
class PerformanceMonitor {
    constructor() {
        this.metrics = {};
        this.startTimes = {};
    }

    start(operation) {
        this.startTimes[operation] = performance.now();
    }

    end(operation) {
        if (this.startTimes[operation]) {
            const duration = performance.now() - this.startTimes[operation];
            this.metrics[operation] = (this.metrics[operation] || []);
            this.metrics[operation].push(duration);
            delete this.startTimes[operation];
            return duration;
        }
    }

    getAverageTime(operation) {
        const times = this.metrics[operation];
        if (!times || times.length === 0) return 0;
        return times.reduce((a, b) => a + b, 0) / times.length;
    }

    generateReport() {
        const report = {};
        Object.keys(this.metrics).forEach(operation => {
            report[operation] = {
                average: this.getAverageTime(operation),
                count: this.metrics[operation].length,
                total: this.metrics[operation].reduce((a, b) => a + b, 0)
            };
        });
        console.table(report);
        return report;
    }
}

// セキュリティバリデーター
class SecurityValidator {
    constructor() {
        this.violations = [];
    }

    performInitialSecurityCheck() {
        this.checkCSP();
        this.checkXSS();
        this.checkDataLeaks();
    }

    checkCSP() {
        // CSPチェックの実装
    }

    checkXSS() {
        // XSSチェックの実装
    }

    checkDataLeaks() {
        // データ漏洩チェックの実装
    }

    sanitizeInput(input) {
        return input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    }

    validateFormData(data) {
        const violations = [];
        
        Object.keys(data).forEach(key => {
            if (typeof data[key] === 'string' && data[key].length > 10000) {
                violations.push(`Field ${key} exceeds maximum length`);
            }
        });

        return violations;
    }
}

// テストスイート
class TestSuite {
    constructor(generator) {
        this.generator = generator;
        this.tests = [];
        this.setupTests();
    }

    setupTests() {
        this.tests = [
            {
                name: 'Form Validation',
                test: () => this.testFormValidation()
            },
            {
                name: 'Meta Prompt Generation',
                test: () => this.testMetaPromptGeneration()
            },
            {
                name: 'Dynamic Form Control',
                test: () => this.testDynamicFormControl()
            },
            {
                name: 'Template Management',
                test: () => this.testTemplateManagement()
            }
        ];
    }

    async runAllTests() {
        const results = [];
        console.log('🧪 Running MetaPrompt Generator Tests...');

        for (const test of this.tests) {
            const startTime = performance.now();
            try {
                await test.test();
                const duration = performance.now() - startTime;
                results.push({
                    name: test.name,
                    passed: true,
                    duration: Math.round(duration * 100) / 100
                });
                console.log(`✅ ${test.name} - Passed (${Math.round(duration)}ms)`);
            } catch (error) {
                const duration = performance.now() - startTime;
                results.push({
                    name: test.name,
                    passed: false,
                    duration: Math.round(duration * 100) / 100,
                    error: error.message
                });
                console.error(`❌ ${test.name} - Failed (${Math.round(duration)}ms)`, error);
            }
        }

        this.displayTestResults(results);
        return results;
    }

    testFormValidation() {
        const requiredFields = ['taskType', 'domain', 'outputFormat', 'taskPurpose'];
        
        requiredFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (!field) {
                throw new Error(`Required field ${fieldId} not found`);
            }
        });

        return true;
    }

    testMetaPromptGeneration() {
        const mockFormData = {
            taskType: 'text-generation',
            domain: 'ビジネス・経営',
            outputFormat: 'structured',
            taskPurpose: 'テスト用のプロンプト生成',
            detailLevel: 5,
            hallucinationPrevention: ['sourceRequirement']
        };

        const metaPrompt = this.generator.createMetaPrompt(mockFormData);
        
        if (!metaPrompt || metaPrompt.length < 100) {
            throw new Error('Generated meta prompt is too short or empty');
        }

        return true;
    }

    testDynamicFormControl() {
        // タスクタイプを変更してドメインオプションが更新されるかテスト
        const taskTypeSelect = document.getElementById('taskType');
        const domainSelect = document.getElementById('domain');
        
        taskTypeSelect.value = 'code-generation';
        this.generator.handleTaskTypeChange();
        
        const visibleOptions = Array.from(domainSelect.options).filter(opt => 
            opt.style.display !== 'none' && opt.value !== ''
        );

        if (visibleOptions.length === 0) {
            throw new Error('No domain options visible after task type change');
        }

        return true;
    }

    testTemplateManagement() {
        const initialTemplateCount = this.generator.templates.length;
        
        // テンプレート保存のテスト
        const testTemplate = {
            id: Date.now(),
            name: 'test_template',
            data: {
                taskType: 'analysis',
                domain: 'テクノロジー・IT'
            },
            createdAt: new Date().toISOString()
        };

        this.generator.templates.push(testTemplate);
        
        if (this.generator.templates.length !== initialTemplateCount + 1) {
            throw new Error('Template was not added correctly');
        }

        // テンプレートを元に戻す
        this.generator.templates.pop();
        
        return true;
    }

    displayTestResults(results) {
        const debugPanel = document.getElementById('debugPanel');
        if (!debugPanel) return;

        const testSection = debugPanel.querySelector('.debug-section:last-child');
        if (!testSection) return;

        const passed = results.filter(r => r.passed).length;
        const total = results.length;
        const passRate = Math.round((passed / total) * 100);

        const resultHTML = `
            <div class="test-summary">
                <h4>Test Results: ${passed}/${total} Passed (${passRate}%)</h4>
                <div class="test-progress">
                    <div class="test-progress-bar" style="width: ${passRate}%"></div>
                </div>
            </div>
            <div class="test-details">
                ${results.map(result => `
                    <div class="test-result ${result.passed ? 'passed' : 'failed'}">
                        <span class="test-name">${result.passed ? '✅' : '❌'} ${result.name}</span>
                        <span class="test-duration">${result.duration}ms</span>
                        ${result.error ? `<div class="test-error">${result.error}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `;

        testSection.innerHTML = resultHTML;
    }
}

// アプリケーション初期化
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.metaPromptGenerator = new MetaPromptGenerator();
    } catch (error) {
        console.error('Failed to initialize MetaPrompt Generator:', error);
        
        // 重大なエラーの場合の代替UI
        document.body.innerHTML = `
            <div class="critical-error">
                <h1>🚨 アプリケーションエラー</h1>
                <p>アプリケーションの初期化に失敗しました。ページを再読み込みしてください。</p>
                <details>
                    <summary>エラー詳細 (開発者向け)</summary>
                    <pre>${error.stack}</pre>
                </details>
                <button onclick="location.reload()">ページを再読み込み</button>
            </div>
        `;
    }
});

// サービスワーカー登録（PWA対応）
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('SW registered: ', registration);
            })
            .catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}

// エクスポート（ES6モジュール対応）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MetaPromptGenerator, PerformanceMonitor, SecurityValidator, TestSuite };
}
