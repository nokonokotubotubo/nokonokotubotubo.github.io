/**
 * TrippenGistSync v2
 * -------------------
 * 新しい同期モジュールの土台となる骨組みを先に用意しておく。
 * この段階ではまだ内部ロジックは未実装であり、ステート構造と
 * 公開インターフェースだけを定義する。
 *
 * 実装方針:
 *  - enqueueSync による逐次同期処理
 *  - 差分検出 / Gist API 通信レイヤーの切り分け
 *  - フックベースで UI との疎結合を維持
 */

const STORAGE_KEY = 'trippen_sync_v2_state';

const createEmptySnapshot = () => ({
    revision: 0,
    data: {
        events: [],
        days: [],
        layerOrder: [],
        tripTitle: ''
    }
});

const TrippenGistSyncV2 = {
    // 認証情報・識別子
    token: null,
    gistId: null,
    userAgent: 'Tripen Sync v2',

    // 動作フラグ
    isEnabled: false,
    isSyncing: false,
    hasError: false,

    // ステート
    state: {
        localSnapshot: createEmptySnapshot(),
        lastSyncedSnapshot: createEmptySnapshot(),
        lastRemoteEtag: null,
        lastRemoteVersion: null,
        queueRevision: 0
    },

    // UI フック
    hooks: {
        getLocalSnapshot: () => createEmptySnapshot(),
        applySnapshot: () => {},
        onSyncStatus: () => {},
        onConflictDetected: () => {}
    },

    // 同期キュー
    syncQueue: Promise.resolve(),
    schedulerTimer: null,

    /**
     * 内部で API を呼ぶとき共通で使うヘルパー。
     */
    async request(endpoint, { method = 'GET', body = null, etag = null } = {}) {
        if (!this.token) throw new Error('GitHub トークンが設定されていません');
        const headers = {
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': this.userAgent
        };
        if (this.token) headers.Authorization = `token ${this.token}`;
        if (body) headers['Content-Type'] = 'application/json';
        if (etag) headers['If-Match'] = etag;

        const response = await fetch(endpoint, {
            method,
            headers,
            body,
            cache: 'no-store',
            mode: 'cors'
        });

        if (response.ok) {
            const data = await response.json();
            return { data, etag: response.headers.get('ETag') };
        }

        let message = `GitHub API エラー: ${response.status}`;
        try {
            const payload = await response.json();
            if (payload?.message) message = payload.message;
        } catch {
            // ignore
        }
        throw new Error(message);
    },

    async fetchRemoteSnapshot() {
        if (!this.gistId) throw new Error('Gist ID が未設定です');
        const endpoint = `https://api.github.com/gists/${this.gistId}`;
        const { data, etag } = await this.request(endpoint);
        const file = data.files?.['trippen_data.json'];
        if (!file?.content) throw new Error('Gist に trippen_data.json が存在しません');
        const snapshot = JSON.parse(file.content);
        this.lastReadTime = new Date().toISOString();
        return { snapshot, etag, version: data.history?.[0]?.version || null };
    },

    async pushSnapshot(snapshot) {
        if (!this.gistId) throw new Error('Gist ID が未設定です');
        const endpoint = `https://api.github.com/gists/${this.gistId}`;
        const body = JSON.stringify({
            files: {
                'trippen_data.json': {
                    content: JSON.stringify(snapshot, null, 2)
                }
            }
        });
        const { data, etag } = await this.request(endpoint, {
            method: 'PATCH',
            body,
            etag: this.state.lastRemoteEtag || undefined
        });
        return { data, etag, version: data.history?.[0]?.version || null };
    },

    /**
     * 差分検出
     */
    detectLocalChanges(localSnapshot, lastSyncedSnapshot) {
        const changes = {
            events: [],
            days: [],
            layerOrder: null,
            tripTitle: null,
            hasChanges: false
        };

        const localEvents = Array.isArray(localSnapshot.data.events) ? localSnapshot.data.events.slice() : [];
        const syncedEvents = Array.isArray(lastSyncedSnapshot.data.events) ? lastSyncedSnapshot.data.events.slice() : [];

        const localMap = new Map(localEvents.map(item => [item.id, item]));
        const syncedMap = new Map(syncedEvents.map(item => [item.id, item]));

        localMap.forEach((localItem, id) => {
            const remoteItem = syncedMap.get(id);
            if (!remoteItem) {
                changes.events.push({ type: 'added', item: localItem });
                changes.hasChanges = true;
                return;
            }
            if (JSON.stringify(localItem) !== JSON.stringify(remoteItem)) {
                changes.events.push({ type: 'updated', item: localItem });
                changes.hasChanges = true;
            }
        });

        syncedMap.forEach((remoteItem, id) => {
            if (!localMap.has(id)) {
                changes.events.push({ type: 'removed', item: remoteItem });
                changes.hasChanges = true;
            }
        });

        if (JSON.stringify(localSnapshot.data.days) !== JSON.stringify(lastSyncedSnapshot.data.days)) {
            changes.days = localSnapshot.data.days;
            changes.hasChanges = true;
        }

        if (JSON.stringify(localSnapshot.data.layerOrder) !== JSON.stringify(lastSyncedSnapshot.data.layerOrder)) {
            changes.layerOrder = localSnapshot.data.layerOrder;
            changes.hasChanges = true;
        }

        if (localSnapshot.data.tripTitle !== lastSyncedSnapshot.data.tripTitle) {
            changes.tripTitle = localSnapshot.data.tripTitle;
            changes.hasChanges = true;
        }

        return changes;
    },

    mergeRemoteChanges(localSnapshot, remoteSnapshot) {
        const merged = JSON.parse(JSON.stringify(remoteSnapshot || createEmptySnapshot()));
        merged.revision = Math.max(localSnapshot?.revision || 0, remoteSnapshot?.revision || 0) + 1;
        merged.syncedAt = new Date().toISOString();
        return merged;
    },

    /**
     * 初期化: トークン / Gist ID を設定し、保持しているステートを読み込む。
     */
    init(token = null, gistId = null) {
        this.loadState();
        if (token) this.token = token.trim();
        if (gistId) this.gistId = gistId.trim();
        this.isEnabled = Boolean(this.token && this.gistId);
        if (this.isEnabled) {
            return this.initialSync();
        }
        return this;
    },

    /**
     * UI フックの登録
     */
    registerHooks(hooks = {}) {
        this.hooks = { ...this.hooks, ...hooks };
    },

    /**
     * 外部から同期を要求するためのエントリポイント。
     */
    enqueueSync(reason = 'manual') {
        if (!this.isEnabled) return Promise.resolve(false);

        const currentQueue = this.syncQueue.catch(() => {});
        const nextTask = currentQueue.then(async () => {
            this.hooks.onSyncStatus?.({ status: 'scheduled', reason });
            return this.executeSync(reason);
        });

        this.syncQueue = nextTask;
        return nextTask;
    },
    markChanged() {
        this.hasPendingChanges = true;
        this.state.queueRevision += 1;
        this.scheduleImmediateSync('mark-changed');
    },

    resetChanged() {
        this.hasPendingChanges = false;
        const snapshot = this.hooks.getLocalSnapshot?.() || null;
        if (snapshot) {
            this.state.lastSyncedSnapshot = snapshot;
            this.state.localSnapshot = snapshot;
            this.persistState();
        }
    },

    requestImmediateSync(reason = 'immediate') {
        this.enqueueSync(reason).catch(error => {
            console.error(`TrippenGistSyncV2.requestImmediateSync failed (${reason})`, error);
        });
    },

    scheduleImmediateSync(reason = 'scheduled', delay = 400) {
        if (this.schedulerTimer) clearTimeout(this.schedulerTimer);
        this.schedulerTimer = setTimeout(() => {
            this.schedulerTimer = null;
            this.requestImmediateSync(reason);
        }, delay);
    },

    manualWriteToCloud() {
        return this.enqueueSync('manual');
    },

    async loadFromCloud() {
        if (!this.isEnabled) throw new Error('同期設定が完了していません');
        const remoteState = await this.fetchRemoteSnapshot();
        this.state.lastRemoteEtag = remoteState.etag;
        this.state.lastRemoteVersion = remoteState.version;
        const snapshot = remoteState.snapshot;
        if (!snapshot.syncedAt) snapshot.syncedAt = new Date().toISOString();
        this.state.lastSyncedSnapshot = snapshot;
        this.state.localSnapshot = snapshot;
        this.lastSyncTime = snapshot.syncedAt;
        this.lastReadTime = new Date().toISOString();
        this.hasPendingChanges = false;
        this.persistState();
        return snapshot;
    },

    async initialAutoLoad() {
        try {
            const snapshot = await this.loadFromCloud();
            this.hooks.applySnapshot?.(snapshot);
            return snapshot;
        } catch (error) {
            this.hasError = true;
            throw error;
        }
    },

    startPeriodicSync() {
        this.stopPeriodicSync();
        if (!this.isEnabled) return;
        this.periodicTimer = setInterval(() => {
            this.enqueueSync('periodic');
        }, this.periodicIntervalMs);
    },

    stopPeriodicSync() {
        if (this.periodicTimer) {
            clearInterval(this.periodicTimer);
            this.periodicTimer = null;
        }
    },

    loadConfig() {
        if (!this.isEnabled) return null;
        return {
            token: this.token,
            gistId: this.gistId
        };
    },

    calculateHash(snapshot) {
        try {
            return JSON.stringify(snapshot.data || {});
        } catch {
            return '';
        }
    },

    /**
     * 実際の同期処理（差分検出→プッシュ→プル）
     * まだ実装していないため、骨組みのみ。
     */
    async executeSync(reason) {
        this.isSyncing = true;
        this.hooks.onSyncStatus?.({ status: 'syncing', reason });
        try {
            const localSnapshot = this.hooks.getLocalSnapshot?.() || createEmptySnapshot();
            const changes = this.detectLocalChanges(localSnapshot, this.state.lastSyncedSnapshot);

            if (changes.hasChanges) {
                const updatedSnapshot = {
                    revision: (localSnapshot.revision || 0) + 1,
                    data: {
                        events: localSnapshot.data.events || [],
                        days: localSnapshot.data.days || [],
                        layerOrder: localSnapshot.data.layerOrder || [],
                        tripTitle: localSnapshot.data.tripTitle || ''
                    },
                    syncedAt: new Date().toISOString()
                };
                const pushResult = await this.pushSnapshot(updatedSnapshot);
                this.state.lastRemoteEtag = pushResult.etag;
                this.state.lastRemoteVersion = pushResult.version;
                this.state.lastSyncedSnapshot = updatedSnapshot;
                this.state.localSnapshot = updatedSnapshot;
                this.lastSyncTime = updatedSnapshot.syncedAt;
                this.hasPendingChanges = false;
                this.persistState();
            }

            const remoteState = await this.fetchRemoteSnapshot();
            this.state.lastRemoteEtag = remoteState.etag;
            this.state.lastRemoteVersion = remoteState.version;
            this.persistState();
            const mergedSnapshot = this.mergeRemoteChanges(this.state.lastSyncedSnapshot, remoteState.snapshot);
            this.state.lastSyncedSnapshot = mergedSnapshot;
            this.state.localSnapshot = mergedSnapshot;
            this.lastSyncTime = mergedSnapshot.syncedAt;
            this.persistState();
            this.hooks.applySnapshot?.(mergedSnapshot);
            this.hasPendingChanges = false;

            return true;
        } finally {
            this.isSyncing = false;
            this.hooks.onSyncStatus?.({ status: 'idle', reason });
        }
    },

    async initialSync() {
        if (!this.isEnabled) return;
        try {
            const snapshot = await this.loadFromCloud();
            this.hooks.applySnapshot?.(snapshot);
        } catch (error) {
            console.error('TrippenGistSyncV2.initialSync failed', error);
        }
    },

    /**
     * トークン / Gist 情報の設定
     */
    setCredentials(token, gistId) {
        this.token = token?.trim() || null;
        this.gistId = gistId?.trim() || null;
        this.isEnabled = Boolean(this.token && this.gistId);
        this.persistState();
        if (this.isEnabled) this.initialSync();
    },

    /**
     * ステートの永続化
     */
    persistState() {
        try {
            const payload = {
                gistId: this.gistId,
                token: this.token,
                lastRemoteEtag: this.state.lastRemoteEtag,
                lastRemoteVersion: this.state.lastRemoteVersion,
                lastSyncedSnapshot: this.state.lastSyncedSnapshot,
                queueRevision: this.state.queueRevision
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch {
            // ストレージ書き込みに失敗しても致命的ではないため握り潰す
        }
    },

    /**
     * ステートの読み込み
     */
    loadState() {
        try {
            const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            this.gistId = stored.gistId || this.gistId;
            this.token = stored.token || this.token;
            this.state.lastRemoteEtag = stored.lastRemoteEtag || null;
            this.state.lastRemoteVersion = stored.lastRemoteVersion || null;
            this.state.lastSyncedSnapshot = stored.lastSyncedSnapshot || createEmptySnapshot();
            this.state.localSnapshot = stored.lastSyncedSnapshot || createEmptySnapshot();
            this.state.queueRevision = stored.queueRevision || 0;
            this.isEnabled = Boolean(this.token && this.gistId);
            this.lastSyncTime = this.state.lastSyncedSnapshot?.syncedAt || null;
        } catch {
            this.state.lastSyncedSnapshot = createEmptySnapshot();
            this.state.localSnapshot = createEmptySnapshot();
            this.isEnabled = false;
            this.lastSyncTime = null;
        }
    },

    /**
     * クリア処理
     */
    clear() {
        this.stop();
        localStorage.removeItem(STORAGE_KEY);
        this.token = null;
        this.gistId = null;
        this.isEnabled = false;
        this.state = {
            localSnapshot: createEmptySnapshot(),
            lastSyncedSnapshot: createEmptySnapshot(),
            lastRemoteEtag: null,
            lastRemoteVersion: null,
            queueRevision: 0
        };
        this.hasPendingChanges = false;
        this.lastSyncTime = null;
        this.lastReadTime = null;
        if (this.schedulerTimer) {
            clearTimeout(this.schedulerTimer);
            this.schedulerTimer = null;
        }
        this.stopPeriodicSync();
    },

    /**
     * 同期の開始（周期実行など）
     * 既存アプリとのインターフェース継続のためダミー提供。
     */
    start() {
        this.startPeriodicSync();
    },

    stop() {
        this.stopPeriodicSync();
        if (this.schedulerTimer) {
            clearTimeout(this.schedulerTimer);
            this.schedulerTimer = null;
        }
    }
};

TrippenGistSyncV2.loadState();
if (TrippenGistSyncV2.isEnabled) {
    TrippenGistSyncV2.initialSync();
}

export default TrippenGistSyncV2;
