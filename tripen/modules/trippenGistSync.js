const TrippenGistSync = {
    token: null,
    gistId: null,
    isEnabled: false,
    isSyncing: false,
    lastSyncTime: null,
    lastReadTime: null,
    periodicSyncInterval: null,
    hasError: false,
    hasChanged: false,
    lastDataHash: null,
    lastRemoteVersion: null,

    calculateHash(data) {
        try {
            const jsonString = JSON.stringify({
                events: data.data.events || [],
                days: data.data.days || [],
                layerOrder: data.data.layerOrder || [],
                tripTitle: data.data.tripTitle || ''
            }, Object.keys(data.data).sort());
            return jsonString.split('').reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0).toString();
        } catch {
            return Date.now().toString();
        }
    },

    async fetchLatestGistVersion() {
        if (!this.token || !this.gistId) return null;
        try {
            const response = await fetch(`https://api.github.com/gists/${this.gistId}/commits?per_page=1`, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Trippen-App'
                }
            });
            if (!response.ok) return null;
            const commits = await response.json();
            return commits?.[0]?.version || commits?.[0]?.oid || null;
        } catch {
            return null;
        }
    },

    markChanged() { this.hasChanged = true; },
    resetChanged() { this.hasChanged = false; },

    _encrypt(text, key = 'trippen_secret_key') {
        if (!text) return '';
        try {
            return btoa(text.split('').map((char, i) =>
                String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length))
            ).join(''));
        } catch {
            throw new Error('暗号化処理に失敗しました');
        }
    },

    _decrypt(encryptedText, key = 'trippen_secret_key') {
        if (!encryptedText) return '';
        try {
            const text = atob(encryptedText);
            return text.split('').map((char, i) =>
                String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length))
            ).join('');
        } catch {
            throw new Error('復号化に失敗しました');
        }
    },

    getUTCTimestamp: () => new Date().toISOString(),

    loadConfig() {
        try {
            const config = JSON.parse(localStorage.getItem('trippen_gist_config') || '{}');
            if (!config.encryptedToken) return null;

            Object.assign(this, {
                token: this._decrypt(config.encryptedToken),
                gistId: config.gistId || null,
                lastSyncTime: config.lastSyncTime || null,
                lastReadTime: config.lastReadTime || null,
                lastDataHash: config.lastDataHash || null,
                lastRemoteVersion: config.lastRemoteVersion || null
            });
            this.isEnabled = !!this.token;
            return config;
        } catch {
            this.hasError = true;
            this.isEnabled = false;
            return null;
        }
    },

    init(token, gistId = null) {
        if (!token?.trim()) throw new Error('有効なトークンが必要です');

        Object.assign(this, {
            token: token.trim(),
            gistId: gistId?.trim() || null,
            isEnabled: true,
            hasError: false,
            hasChanged: false
        });

        const config = {
            encryptedToken: this._encrypt(token.trim()),
            gistId: this.gistId,
            isEnabled: true,
            configuredAt: this.getUTCTimestamp(),
            lastSyncTime: this.lastSyncTime,
            lastReadTime: this.lastReadTime,
            lastDataHash: this.lastDataHash,
            lastRemoteVersion: this.lastRemoteVersion,
            version: '3.0'
        };

        localStorage.setItem('trippen_gist_config', JSON.stringify(config));
        this.startPeriodicSync();
    },

    startPeriodicSync() {
        clearInterval(this.periodicSyncInterval);
        this.periodicSyncInterval = setInterval(() => this.autoWriteToCloud(), 60000);
    },

    stopPeriodicSync() {
        clearInterval(this.periodicSyncInterval);
        this.periodicSyncInterval = null;
    },

    // 修正1: tripTitle追加
    collectSyncData() {
        const getData = key => JSON.parse(localStorage.getItem(key) || '[]');
        return {
            version: '3.0',
            syncTime: this.getUTCTimestamp(),
            data: {
                events: getData('trippenEvents'),
                days: getData('trippenDays'),
                layerOrder: getData('trippenLayerOrder'),
                tripTitle: localStorage.getItem('trippenTitle') || '' // 追加
            }
        };
    },

    async syncToCloud(data) {
        if (!this.token) return false;

        const payload = {
            description: `とりっぺんちゃん 旅行データ - ${new Date().toLocaleString('ja-JP')}`,
            public: false,
            files: { "trippen_data.json": { content: JSON.stringify(data, null, 2) } }
        };

        try {
            const response = await fetch(
                this.gistId ? `https://api.github.com/gists/${this.gistId}` : 'https://api.github.com/gists',
                {
                    method: this.gistId ? 'PATCH' : 'POST',
                    headers: {
                        'Authorization': `token ${this.token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/vnd.github.v3+json',
                        'User-Agent': 'Trippen-App'
                    },
                    body: JSON.stringify(payload)
                }
            );

            if (response.ok) {
                const result = await response.json();
                if (!this.gistId && result.id) {
                    this.gistId = result.id;
                    this.saveGistId(result.id);
                }
                let latestVersion = result.history?.[0]?.version || result.history?.[0]?.commit || result.version || null;
                if (!latestVersion) latestVersion = await this.fetchLatestGistVersion();
                if (latestVersion) {
                    this.lastRemoteVersion = latestVersion;
                    this.saveConfig('lastRemoteVersion');
                }
                return true;
            }
            return false;
        } catch {
            this.hasError = true;
            return false;
        }
    },

    async loadFromCloud() {
        if (!this.token || !this.gistId) {
            throw new Error(!this.token ? 'トークンが設定されていません' : 'Gist IDが設定されていません');
        }

        try {
            const response = await fetch(`https://api.github.com/gists/${this.gistId}`, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Trippen-App'
                }
            });

            if (!response.ok) {
                const errors = {
                    404: 'Gistが見つかりません',
                    401: 'GitHub Personal Access Tokenが無効です',
                    403: 'GitHub APIの利用制限に達しています'
                };
                throw new Error(errors[response.status] || `GitHub API エラー: ${response.status}`);
            }

            const gist = await response.json();
            if (!gist.files?.['trippen_data.json']) {
                throw new Error('Gistにtrippen_data.jsonファイルが見つかりません');
            }

            const parsedData = JSON.parse(gist.files['trippen_data.json'].content);
            let latestVersion = gist.history?.[0]?.version || gist.history?.[0]?.commit || gist.version || null;
            if (!latestVersion) latestVersion = await this.fetchLatestGistVersion();
            if (latestVersion) {
                this.lastRemoteVersion = latestVersion;
                this.saveConfig('lastRemoteVersion');
            }
            this.lastDataHash = this.calculateHash(parsedData);
            this.lastReadTime = this.getUTCTimestamp();
            this.saveLastReadTime();
            this.resetChanged();

            return parsedData;
        } catch (error) {
            this.hasError = true;
            throw error;
        }
    },

    async checkForNewerCloudData() {
        if (!this.token || !this.gistId) return false;
        try {
            const latestVersion = await this.fetchLatestGistVersion();
            if (!latestVersion) return false;
            if (!this.lastRemoteVersion) {
                this.lastRemoteVersion = latestVersion;
                this.saveConfig('lastRemoteVersion');
                return false;
            }
            return latestVersion !== this.lastRemoteVersion;
        } catch {
            return false;
        }
    },

    // 修正3: 同期前データ保存追加
    async autoWriteToCloud() {
        if (!this.isEnabled || !this.token || this.isSyncing) return false;

        this.isSyncing = true;
        this.hasError = false;

        try {
            const hasNewerData = await this.checkForNewerCloudData();
            if (hasNewerData) {
                window.app?.handleSyncConflict?.();
                return false;
            }

            if (!this.hasChanged) return false;

            // 修正3: Vueインスタンスの最新データを保存してから同期
            if (window.app?.saveData) window.app.saveData();

            const localData = this.collectSyncData();
            const uploadResult = await this.syncToCloud(localData);

            if (uploadResult) {
                this.lastSyncTime = this.getUTCTimestamp();
                this.lastDataHash = this.calculateHash(localData);
                this.saveLastSyncTime();
                this.resetChanged();
                return true;
            }
            return false;
        } catch {
            this.hasError = true;
            return false;
        } finally {
            this.isSyncing = false;
        }
    },

    async manualWriteToCloud() {
        if (!this.isEnabled || !this.token) {
            throw new Error('GitHub同期が設定されていません');
        }

        this.isSyncing = true;
        this.hasError = false;

        try {
            const hasNewerData = await this.checkForNewerCloudData();
            if (hasNewerData) {
                window.app?.handleSyncConflict?.();
                throw new Error('データ競合が検出されました');
            }

            const localData = this.collectSyncData();
            const uploadResult = await this.syncToCloud(localData);

            if (uploadResult) {
                this.lastSyncTime = this.getUTCTimestamp();
                this.lastDataHash = this.calculateHash(localData);
                this.saveLastSyncTime();
                this.resetChanged();
                return true;
            }
            throw new Error('書き込みに失敗しました');
        } catch (error) {
            this.hasError = true;
            throw error;
        } finally {
            this.isSyncing = false;
        }
    },

    async initialAutoLoad() {
        if (!this.isEnabled || !this.token || !this.gistId) return null;

        try {
            const cloudData = await this.loadFromCloud();
            return cloudData?.data ? cloudData : null;
        } catch {
            this.hasError = true;
            return null;
        }
    },

    saveGistId(gistId) {
        try {
            const config = JSON.parse(localStorage.getItem('trippen_gist_config') || '{}');
            Object.assign(config, {
                gistId,
                lastSyncTime: this.lastSyncTime,
                lastReadTime: this.lastReadTime,
                lastDataHash: this.lastDataHash,
                lastRemoteVersion: this.lastRemoteVersion
            });
            localStorage.setItem('trippen_gist_config', JSON.stringify(config));
            this.gistId = gistId;
            if (window.app?.gistSync) window.app.gistSync.gistId = gistId;
        } catch {
            this.gistId = gistId;
        }
    },

    saveLastSyncTime() { this.saveConfig('lastSyncTime'); },
    saveLastReadTime() { this.saveConfig('lastReadTime'); },

    saveConfig(key) {
        try {
            const config = JSON.parse(localStorage.getItem('trippen_gist_config') || '{}');
            config[key] = this[key];
            config.lastDataHash = this.lastDataHash;
            localStorage.setItem('trippen_gist_config', JSON.stringify(config));
        } catch {
            // 保存失敗時は黙殺
        }
    },

    clear() {
        this.stopPeriodicSync();
        localStorage.removeItem('trippen_gist_config');
        Object.assign(this, {
            token: null,
            gistId: null,
            isEnabled: false,
            lastSyncTime: null,
            lastReadTime: null,
            hasError: false,
            hasChanged: false,
            lastDataHash: null,
            lastRemoteVersion: null
        });
    }
};

export default TrippenGistSync;
