const API_BASE = 'https://api.github.com/gists';
const STATE_KEY = 'trippen_sync_state_v1';
const LEGACY_KEY = 'trippen_gist_config';
const SECRET_KEY = 'trippen_secret_key';

const defaultState = {
    encryptedToken: null,
    gistId: null,
    deviceId: null,
    lastRemoteVersion: null,
    lastRemoteHash: null,
    lastRemoteSyncTime: null,
    lastLocalSyncTime: null,
    lastReadTime: null
};

const readJsonArray = key => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const getCrypto = () => {
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) return window.crypto;
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) return globalThis.crypto;
    return null;
};

const generateDeviceId = () => {
    try {
        const cryptoObj = getCrypto();
        if (!cryptoObj) throw new Error('crypto not available');
        const buffer = cryptoObj.getRandomValues(new Uint32Array(4));
        return Array.from(buffer).map(value => value.toString(16).padStart(8, '0')).join('');
    } catch {
        return `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
};

const TrippenGistSync = {
    state: { ...defaultState },
    token: null,
    gistId: null,
    deviceId: null,
    lastRemoteVersion: null,
    lastDataHash: null,
    lastSyncTime: null,
    lastReadTime: null,
    isEnabled: false,
    isSyncing: false,
    hasError: false,
    hasChanged: false,
    status: 'idle',
    periodicSyncInterval: null,

    hooks: {
        onStatusChange: () => {},
        onConflictDetected: () => {}
    },

    init(token = null, gistId = null) {
        this.loadState();
        this.migrateLegacyConfig();
        if (token) {
            this.setCredentials(token, gistId);
            this.startPeriodicSync();
        }
        return this;
    },

    registerHooks(hooks = {}) {
        this.hooks = { ...this.hooks, ...hooks };
    },

    setStatus(status) {
        this.status = status;
        this.hooks.onStatusChange?.(status);
    },

    persistState() {
        try {
            localStorage.setItem(STATE_KEY, JSON.stringify(this.state));
        } catch {
            // ストレージ書き込みに失敗しても処理を継続
        }
    },

    loadState() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
            this.state = { ...defaultState, ...parsed };
        } catch {
            this.state = { ...defaultState };
        }
        if (!this.state.deviceId) {
            this.state.deviceId = generateDeviceId();
            this.persistState();
        }
        this.token = this.state.encryptedToken ? this._decrypt(this.state.encryptedToken) : null;
        this.gistId = this.state.gistId || null;
        this.deviceId = this.state.deviceId;
        this.lastRemoteVersion = this.state.lastRemoteVersion || null;
        this.lastDataHash = this.state.lastRemoteHash || null;
        this.lastSyncTime = this.state.lastLocalSyncTime || null;
        this.lastReadTime = this.state.lastReadTime || null;
        this.isEnabled = !!this.token;
        return this.state;
    },

    migrateLegacyConfig() {
        try {
            const legacyRaw = localStorage.getItem(LEGACY_KEY);
            if (!legacyRaw) return;
            const legacy = JSON.parse(legacyRaw);
            if (!legacy?.encryptedToken) return;
            const token = this._decrypt(legacy.encryptedToken);
            this.setCredentials(token, legacy.gistId || null, { skipReset: true });
            if (legacy.lastSyncTime) this.state.lastLocalSyncTime = legacy.lastSyncTime;
            if (legacy.lastReadTime) this.state.lastReadTime = legacy.lastReadTime;
            if (legacy.lastRemoteVersion) this.state.lastRemoteVersion = legacy.lastRemoteVersion;
            if (legacy.lastDataHash) this.state.lastRemoteHash = legacy.lastDataHash;
            this.persistState();
            localStorage.removeItem(LEGACY_KEY);
            this.loadState();
        } catch {
            // 旧形式の読み込みに失敗しても続行
        }
    },

    setCredentials(token, gistId = null, options = {}) {
        const trimmedToken = token?.trim() || null;
        const trimmedGistId = gistId?.trim() || null;
        this.token = trimmedToken;
        this.gistId = trimmedGistId;
        this.isEnabled = !!this.token;
        this.state.encryptedToken = this.token ? this._encrypt(this.token) : null;
        this.state.gistId = this.gistId;
        if (!options.skipReset) {
            this.state.lastRemoteVersion = null;
            this.state.lastRemoteHash = null;
            this.state.lastRemoteSyncTime = null;
            this.state.lastLocalSyncTime = null;
        }
        this.persistState();
    },

    loadConfig() {
        this.loadState();
        return this.isEnabled ? {
            token: this.token,
            gistId: this.gistId,
            lastSyncTime: this.lastSyncTime,
            lastReadTime: this.lastReadTime,
            lastRemoteVersion: this.lastRemoteVersion
        } : null;
    },

    markChanged() {
        this.hasChanged = true;
    },

    resetChanged() {
        this.hasChanged = false;
    },

    startPeriodicSync() {
        this.stopPeriodicSync();
        this.periodicSyncInterval = setInterval(() => {
            this.autoWriteToCloud();
        }, 60000);
    },

    stopPeriodicSync() {
        if (this.periodicSyncInterval) {
            clearInterval(this.periodicSyncInterval);
            this.periodicSyncInterval = null;
        }
    },

    collectSyncData() {
        const events = readJsonArray('trippenEvents');
        const days = readJsonArray('trippenDays');
        const layerOrder = readJsonArray('trippenLayerOrder');
        const tripTitle = localStorage.getItem('trippenTitle') || '';
        const syncTime = new Date().toISOString();
        return {
            version: '3.1',
            syncTime,
            data: { events, days, layerOrder, tripTitle }
        };
    },

    calculateHash(snapshot) {
        try {
            const payload = snapshot?.data || {};
            const orderedKeys = Object.keys(payload).sort();
            const jsonString = JSON.stringify(payload, orderedKeys);
            let hash = 0;
            for (let i = 0; i < jsonString.length; i += 1) {
                const chr = jsonString.charCodeAt(i);
                hash = ((hash << 5) - hash) + chr;
                hash |= 0;
            }
            return hash.toString();
        } catch {
            return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        }
    },

    buildPayload(snapshot) {
        const now = new Date().toISOString();
        return {
            description: `Tripen sync data - ${now}`,
            public: false,
            files: {
                'trippen_data.json': {
                    content: JSON.stringify({
                        version: '3.1',
                        syncTime: snapshot.syncTime || now,
                        data: snapshot.data || {},
                        meta: {
                            schemaVersion: '3.1',
                            generatedAt: now,
                            deviceId: this.deviceId
                        }
                    }, null, 2)
                }
            }
        };
    },

    async fetchJson(url, { method = 'GET', body = null } = {}) {
        const headers = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Tripen-App',
            'Cache-Control': 'no-cache'
        };
        if (this.token) headers.Authorization = `token ${this.token}`;
        if (body) headers['Content-Type'] = 'application/json';

        const response = await fetch(url, { method, headers, body });
        if (response.ok) return response.json();

        let message = `GitHub API エラー: ${response.status}`;
        try {
            const payload = await response.json();
            if (payload?.message) message = payload.message;
        } catch {
            // ignore
        }
        throw new Error(message);
    },

    async fetchGist() {
        if (!this.gistId) throw new Error('Gist IDが設定されていません');
        if (!this.token) throw new Error('GitHubトークンが設定されていません');
        return this.fetchJson(`${API_BASE}/${this.gistId}?t=${Date.now()}`);
    },

    async pushSnapshot(snapshot) {
        if (!this.token) throw new Error('GitHubトークンが設定されていません');
        const payload = this.buildPayload(snapshot);
        const body = JSON.stringify(payload);

        const result = this.gistId
            ? await this.fetchJson(`${API_BASE}/${this.gistId}`, { method: 'PATCH', body })
            : await this.fetchJson(API_BASE, { method: 'POST', body });

        if (!this.gistId && result.id) {
            this.gistId = result.id;
            this.state.gistId = result.id;
        }

        const latestCommit = result.history?.[0] || null;
        const remoteVersion = latestCommit?.version || latestCommit?.commit || result.version || null;
        const remoteUpdatedAt = result.updated_at || snapshot.syncTime || new Date().toISOString();
        const remoteHash = this.calculateHash(snapshot);

        this.state.lastRemoteVersion = remoteVersion;
        this.state.lastRemoteHash = remoteHash;
        this.state.lastRemoteSyncTime = remoteUpdatedAt;
        this.state.lastLocalSyncTime = snapshot.syncTime || remoteUpdatedAt;
        this.state.lastReadTime = remoteUpdatedAt;
        this.persistState();

        this.lastRemoteVersion = remoteVersion;
        this.lastDataHash = remoteHash;
        this.lastSyncTime = this.state.lastLocalSyncTime;
        this.lastReadTime = this.state.lastReadTime;
        this.isEnabled = !!this.token;
        return result;
    },

    async detectConflict(localHash) {
        if (!this.isEnabled || !this.gistId) return false;
        this.setStatus('checking');
        try {
            const gist = await this.fetchGist();
            const file = gist.files?.['trippen_data.json'] || null;
            const latestCommit = gist.history?.[0] || null;
            const remoteVersion = latestCommit?.version || latestCommit?.commit || gist.version || null;
            const remoteUpdatedAt = gist.updated_at || null;

            if (!file?.content) {
                const versionChanged = Boolean(this.lastRemoteVersion && remoteVersion && remoteVersion !== this.lastRemoteVersion);
                if (versionChanged) {
                    this.state.lastRemoteVersion = remoteVersion;
                    this.persistState();
                    this.lastRemoteVersion = remoteVersion;
                }
                return versionChanged;
            }

            let snapshot;
            try {
                snapshot = JSON.parse(file.content);
            } catch {
                return false;
            }

            const remoteHash = this.calculateHash(snapshot);
            const prevVersion = this.lastRemoteVersion;
            const prevHash = this.lastDataHash;

            this.state.lastRemoteVersion = remoteVersion;
            this.state.lastRemoteHash = remoteHash;
            this.state.lastRemoteSyncTime = snapshot.syncTime || remoteUpdatedAt;
            this.persistState();

            this.lastRemoteVersion = remoteVersion;
            this.lastDataHash = remoteHash;

            const localSyncTime = this.lastSyncTime ? Date.parse(this.lastSyncTime) : null;
            const remoteSyncTime = snapshot.syncTime ? Date.parse(snapshot.syncTime) : null;

            const versionChanged = Boolean(prevVersion && remoteVersion && remoteVersion !== prevVersion);
            const hashChanged = Boolean(localHash && remoteHash && localHash !== remoteHash);
            const remoteAhead = Boolean(localSyncTime && remoteSyncTime && remoteSyncTime > localSyncTime + 1000);

            return versionChanged || hashChanged || remoteAhead;
        } catch (error) {
            console.error('TrippenGistSync.detectConflict failed', error);
            return false;
        } finally {
            this.setStatus('idle');
        }
    },

    async loadFromCloud() {
        if (!this.isEnabled || !this.token || !this.gistId) {
            throw new Error('同期設定が完了していません');
        }
        this.setStatus('pulling');
        try {
            const gist = await this.fetchGist();
            const file = gist.files?.['trippen_data.json'];
            if (!file?.content) throw new Error('Gistにtrippen_data.jsonが存在しません');

            const snapshot = JSON.parse(file.content);
            const remoteHash = this.calculateHash(snapshot);
            const latestCommit = gist.history?.[0] || null;
            const remoteVersion = latestCommit?.version || latestCommit?.commit || gist.version || null;
            const remoteUpdatedAt = snapshot.syncTime || gist.updated_at || new Date().toISOString();

            this.state.lastRemoteVersion = remoteVersion;
            this.state.lastRemoteHash = remoteHash;
            this.state.lastRemoteSyncTime = remoteUpdatedAt;
            this.state.lastReadTime = new Date().toISOString();
            this.persistState();

            this.lastRemoteVersion = remoteVersion;
            this.lastDataHash = remoteHash;
            this.lastReadTime = this.state.lastReadTime;
            this.hasChanged = false;
            return snapshot;
        } finally {
            this.setStatus('idle');
        }
    },

    async initialAutoLoad() {
        if (!this.isEnabled || !this.token || !this.gistId) return null;
        try {
            return await this.loadFromCloud();
        } catch {
            this.hasError = true;
            return null;
        }
    },

    async manualWriteToCloud() {
        if (!this.isEnabled || !this.token) throw new Error('GitHub同期が設定されていません');

        if (window.app?.saveData) window.app.saveData();
        const snapshot = this.collectSyncData();
        this.setStatus('pushing');
        this.isSyncing = true;
        this.hasError = false;

        try {
            const conflict = await this.detectConflict(this.lastDataHash);
            if (conflict) {
                this.hasError = true;
                window.app?.handleSyncConflict?.();
                throw new Error('クラウドに新しい変更があります');
            }

            await this.pushSnapshot(snapshot);
            this.hasChanged = false;
            return true;
        } catch (error) {
            this.hasError = true;
            throw error;
        } finally {
            this.isSyncing = false;
            this.setStatus('idle');
        }
    },

    async autoWriteToCloud() {
        if (!this.isEnabled || !this.token || this.isSyncing) return false;
        if (!this.hasChanged) return false;

        if (window.app?.saveData) window.app.saveData();
        const snapshot = this.collectSyncData();
        this.isSyncing = true;
        this.setStatus('pushing');

        try {
            const conflict = await this.detectConflict(this.lastDataHash);
            if (conflict) {
                this.hasError = true;
                window.app?.handleSyncConflict?.();
                return false;
            }

            await this.pushSnapshot(snapshot);
            this.hasChanged = false;
            this.hasError = false;
            return true;
        } catch (error) {
            this.hasError = true;
            console.error('TrippenGistSync.autoWriteToCloud failed', error);
            return false;
        } finally {
            this.isSyncing = false;
            this.setStatus('idle');
        }
    },

    async checkForNewerCloudData() {
        return this.detectConflict(this.lastDataHash);
    },

    saveGistId(gistId) {
        this.setCredentials(this.token, gistId, { skipReset: true });
    },

    clear() {
        this.stopPeriodicSync();
        localStorage.removeItem(STATE_KEY);
        localStorage.removeItem(LEGACY_KEY);
        this.state = { ...defaultState };
        this.token = null;
        this.gistId = null;
        this.deviceId = null;
        this.lastRemoteVersion = null;
        this.lastDataHash = null;
        this.lastSyncTime = null;
        this.lastReadTime = null;
        this.isEnabled = false;
        this.isSyncing = false;
        this.hasError = false;
        this.hasChanged = false;
        this.status = 'idle';
        this.loadState();
    },

    _encrypt(text, key = SECRET_KEY) {
        if (!text) return '';
        return btoa(text.split('').map((char, i) =>
            String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length))
        ).join(''));
    },

    _decrypt(encryptedText, key = SECRET_KEY) {
        if (!encryptedText) return '';
        const text = atob(encryptedText);
        return text.split('').map((char, i) =>
            String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length))
        ).join('');
    }
};

TrippenGistSync.init();

export default TrippenGistSync;
