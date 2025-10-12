const API_BASE = 'https://api.github.com/gists';
const STATE_KEY = 'trippen_sync_state_v1';
const LEGACY_KEY = 'trippen_gist_config';
const DEFAULT_POLL_INTERVAL_MS = 60000;
const MIN_POLL_INTERVAL_MS = 15000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;
const SECRET_KEY = 'trippen_secret_key';

const defaultState = {
    encryptedToken: null,
    gistId: null,
    deviceId: null,
    pendingChangeId: null,
    lastPendingHash: null,
    localRevision: 0,
    lastSyncedRevision: 0,
    lastBaseVersion: null,
    lastBaseHash: null,
    lastBaseSnapshot: null,
    lastLocalHash: null,
    lastRemoteVersion: null,
    lastRemoteHash: null,
    lastRemoteSyncTime: null,
    lastLocalSyncTime: null,
    lastReadTime: null
};

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const toJstIsoString = date => new Date(date.getTime() + JST_OFFSET_MS).toISOString().replace('Z', '+09:00');
const getJstNow = () => toJstIsoString(new Date());
const toJstIsoStringFromIso = value => {
    if (!value) return null;
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) return value;
    return toJstIsoString(new Date(timestamp));
};

const generateChangeId = () => {
    try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch {
        /* noop */
    }
    try {
        const cryptoObj = getCrypto();
        if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
        if (cryptoObj) {
            const buffer = cryptoObj.getRandomValues(new Uint32Array(4));
            return Array.from(buffer).map(value => value.toString(16).padStart(8, '0')).join('');
        }
    } catch {
        /* noop */
    }
    return `chg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

const readSyncDataFromStorage = () => {
    const events = readJsonArray('trippenEvents');
    const days = readJsonArray('trippenDays');
    const layerOrder = readJsonArray('trippenLayerOrder');
    const tripTitle = localStorage.getItem('trippenTitle') || '';
    return { events, days, layerOrder, tripTitle };
};

const cloneDataSnapshot = source => ({
    events: normalizeArray(source?.events).map(item => {
        const event = cloneDeep(item);
        if (event && typeof event === 'object') {
            if (event.startTime) event.startTime = normalizeTimeString(event.startTime);
            if (event.endTime) event.endTime = normalizeTimeString(event.endTime);
        }
        return event;
    }),
    days: normalizeArray(source?.days).map(item => cloneDeep(item)),
    layerOrder: normalizeArray(source?.layerOrder),
    tripTitle: source?.tripTitle || ''
});

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

const cloneDeep = value => {
    if (value === null || value === undefined) return null;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return null;
    }
};

const stableStringify = value => {
    if (value === null || value === undefined) return 'null';
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
        return `[${value.map(item => stableStringify(item)).join(',')}]`;
    }
    const keys = Object.keys(value).sort();
    const serializedEntries = keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${serializedEntries.join(',')}}`;
};

const isEqual = (a, b) => {
    if (a === b) return true;
    try {
        return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    } catch {
        return false;
    }
};

const normalizeArray = value => (Array.isArray(value) ? value : []);
const normalizeTimeString = value => {
    if (typeof value !== 'string') return value;
    const match = value.match(/^(\d{1,2}):(\d{1,2})$/);
    if (!match) return value;
    const rawHours = Number.parseInt(match[1], 10);
    const rawMinutes = Number.parseInt(match[2], 10);
    if (rawHours === 24 && rawMinutes === 0) return '24:00';
    const hours = Math.max(0, Math.min(23, rawHours));
    const minutes = Math.max(0, Math.min(59, rawMinutes));
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

const buildItemKey = (item, fallbackIndex = 0) => {
    if (!item || typeof item !== 'object') return `static:${fallbackIndex}`;
    if (item.id !== undefined && item.id !== null) return `id:${String(item.id)}`;
    if (item.fullDate) return `date:${item.fullDate}`;
    if (item.dayNumber !== undefined) return `day:${item.dayNumber}`;
    try {
        return `json:${JSON.stringify(item)}`;
    } catch {
        return `static:${fallbackIndex}`;
    }
};

const createArrayMap = array => {
    const map = new Map();
    normalizeArray(array).forEach((item, index) => {
        map.set(buildItemKey(item, index), item);
    });
    return map;
};

const TrippenGistSync = {
    state: { ...defaultState },
    token: null,
    gistId: null,
    deviceId: null,
    pendingChangeId: null,
    lastPendingHash: null,
    localRevision: 0,
    lastSyncedRevision: 0,
    lastBaseVersion: null,
    lastBaseHash: null,
    lastBaseSnapshot: null,
    lastLocalHash: null,
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
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    pollTimer: null,
    syncBackoffMs: 0,
    visibilityListener: null,
    immediateSyncTimer: null,

    hooks: {
        onStatusChange: () => {},
        onSyncStatus: () => {},
        onConflictDetected: () => {},
        onRemoteMerge: () => {},
        getLocalData: null,
        hasUnsavedChanges: null
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
        if (typeof this.hooks.onSyncStatus === 'function') {
            const payload = typeof status === 'string' ? { status } : status;
            this.hooks.onSyncStatus(payload);
        }
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
        if (!this.state.lastBaseVersion && this.state.lastRemoteVersion) {
            this.state.lastBaseVersion = this.state.lastRemoteVersion;
        }
        if (!this.state.lastBaseHash && this.state.lastRemoteHash) {
            this.state.lastBaseHash = this.state.lastRemoteHash;
        }
        if (!this.state.deviceId) {
            this.state.deviceId = generateDeviceId();
            this.persistState();
        }
        this.token = this.state.encryptedToken ? this._decrypt(this.state.encryptedToken) : null;
        this.gistId = this.state.gistId || null;
        this.deviceId = this.state.deviceId;
        this.pendingChangeId = this.state.pendingChangeId || null;
        this.lastPendingHash = this.state.lastPendingHash || null;
        this.localRevision = this.state.localRevision || 0;
        this.lastSyncedRevision = this.state.lastSyncedRevision || 0;
        this.lastBaseVersion = this.state.lastBaseVersion || null;
        this.lastBaseHash = this.state.lastBaseHash || null;
        this.lastBaseSnapshot = this.state.lastBaseSnapshot || null;
        this.lastRemoteVersion = this.state.lastRemoteVersion || null;
        this.lastDataHash = this.state.lastRemoteHash || null;
        if (!this.state.lastLocalHash && this.state.lastRemoteHash) {
            this.state.lastLocalHash = this.state.lastRemoteHash;
        }
        this.lastLocalHash = this.state.lastLocalHash || this.state.lastRemoteHash || null;
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
            this.state.lastBaseVersion = this.state.lastRemoteVersion;
            this.state.lastBaseHash = this.state.lastRemoteHash;
            this.state.lastBaseSnapshot = null;
            this.state.lastLocalHash = this.state.lastRemoteHash;
            this.state.lastPendingHash = null;
            this.state.pendingChangeId = null;
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
            this.state.pendingChangeId = null;
            this.state.lastPendingHash = null;
            this.state.lastBaseVersion = null;
            this.state.lastBaseHash = null;
            this.state.lastRemoteVersion = null;
            this.state.lastRemoteHash = null;
            this.state.lastRemoteSyncTime = null;
            this.state.lastLocalSyncTime = null;
            this.state.lastReadTime = null;
            this.state.lastBaseSnapshot = null;
            this.state.lastLocalHash = null;
            this.pendingChangeId = null;
            this.lastPendingHash = null;
            this.lastBaseVersion = null;
            this.lastBaseHash = null;
            this.lastBaseSnapshot = null;
            this.lastRemoteVersion = null;
            this.lastDataHash = null;
            this.lastSyncTime = null;
            this.lastReadTime = null;
            this.lastLocalHash = null;
            this.hasChanged = false;
        }
        this.persistState();
        if (this.isEnabled) {
            this.startPeriodicSync();
        } else {
            this.stopPeriodicSync();
        }
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
        const data = this.getLocalDataSnapshot();
        const currentHash = this.calculateHash({ data });
        const lastLocalHash = this.state.lastLocalHash || this.state.lastRemoteHash || null;
        const lastPendingHash = this.state.lastPendingHash || null;

        if (lastLocalHash && currentHash === lastLocalHash) {
            return;
        }
        if (lastPendingHash && currentHash === lastPendingHash) {
            this.hasChanged = true;
            this.scheduleImmediateSync('pending-hash');
            return;
        }

        this.ensurePendingChangeContext();
        this.pendingChangeId = this.state.pendingChangeId;
        this.state.lastPendingHash = currentHash;
        this.lastPendingHash = currentHash;
        this.state.lastLocalHash = currentHash;
        this.lastLocalHash = currentHash;
        this.state.localRevision = (this.state.localRevision || 0) + 1;
        this.localRevision = this.state.localRevision;
        this.hasChanged = true;
        this.persistState();
        this.scheduleImmediateSync('mark-changed');
    },

    resetChanged() {
        this.hasChanged = false;
        this.pendingChangeId = null;
        this.lastPendingHash = null;
        this.lastBaseVersion = this.lastRemoteVersion || null;
        this.lastBaseHash = this.lastDataHash || null;
        const stableHash = this.lastDataHash || this.state.lastRemoteHash || this.lastBaseHash;
        this.lastLocalHash = stableHash || null;
        this.state.pendingChangeId = null;
        this.state.lastPendingHash = null;
        this.state.lastBaseVersion = this.lastBaseVersion;
        this.state.lastBaseHash = this.lastBaseHash;
        this.state.lastBaseSnapshot = this.lastBaseSnapshot ? cloneDeep(this.lastBaseSnapshot) : null;
        this.state.lastLocalHash = stableHash || null;
        this.state.lastSyncedRevision = this.state.localRevision || this.state.lastSyncedRevision || 0;
        this.state.localRevision = this.state.lastSyncedRevision;
        this.lastSyncedRevision = this.state.lastSyncedRevision;
        this.localRevision = this.state.localRevision;
        this.persistState();
    },

    ensurePendingChangeContext() {
        if (!this.state.pendingChangeId) {
            this.state.pendingChangeId = generateChangeId();
            if (this.lastRemoteVersion) this.state.lastBaseVersion = this.lastRemoteVersion;
            if (this.lastDataHash) this.state.lastBaseHash = this.lastDataHash;
            if (this.lastBaseSnapshot) this.state.lastBaseSnapshot = cloneDeep(this.lastBaseSnapshot);
            this.persistState();
        }
        this.pendingChangeId = this.state.pendingChangeId;
        this.lastBaseVersion = this.state.lastBaseVersion || null;
        this.lastBaseHash = this.state.lastBaseHash || null;
        this.lastBaseSnapshot = this.state.lastBaseSnapshot || this.lastBaseSnapshot || null;
    },

    getLocalDataSnapshot() {
        let hookData = null;
        if (typeof this.hooks.getLocalData === 'function') {
            try {
                hookData = this.hooks.getLocalData();
            } catch {
                hookData = null;
            }
        }
        if (!hookData || typeof hookData !== 'object') {
            return cloneDataSnapshot(readSyncDataFromStorage());
        }
        return cloneDataSnapshot(hookData);
    },

    startPeriodicSync() {
        this.stopPeriodicSync();
        if (!this.isEnabled || !this.token) return;
        this.syncBackoffMs = 0;
        this.pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;
        this.bindVisibilityHandler();
        this.scheduleNextPoll(0);
    },

    stopPeriodicSync() {
        if (this.periodicSyncInterval) {
            clearInterval(this.periodicSyncInterval);
            this.periodicSyncInterval = null;
        }
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
        this.unbindVisibilityHandler();
    },

    collectSyncData({ ensureContext = true } = {}) {
        const data = this.getLocalDataSnapshot();
        if (ensureContext !== false) this.ensurePendingChangeContext();
        const syncTime = getJstNow();
        const baseVersion = this.state.lastBaseVersion || this.lastRemoteVersion || null;
        const baseHash = this.state.lastBaseHash || this.lastDataHash || null;
        const changeId = this.state.pendingChangeId || null;
        return {
            version: '3.1',
            syncTime,
            baseVersion,
            baseHash,
            changeId,
            originDeviceId: this.deviceId,
            data
        };
    },

    calculateHash(snapshot) {
        try {
            const payload = snapshot?.data || {};
            const jsonString = stableStringify(payload);
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

    mergeSnapshots({ baseSnapshot, localSnapshot, remoteSnapshot }) {
        const conflicts = [];
        const mergedData = {};
        const baseData = baseSnapshot?.data || {};
        const localData = localSnapshot?.data || {};
        const remoteData = remoteSnapshot?.data || {};
        const handledFields = new Set();

        const mergeObjectArray = field => {
            handledFields.add(field);
            const baseArray = normalizeArray(baseData[field]);
            const localArray = normalizeArray(localData[field]);
            const remoteArray = normalizeArray(remoteData[field]);

            const baseMap = createArrayMap(baseArray);
            const localMap = createArrayMap(localArray);
            const remoteMap = createArrayMap(remoteArray);

            const allKeys = new Set([
                ...baseMap.keys(),
                ...localMap.keys(),
               ...remoteMap.keys()
            ]);

            const resolutionOrder = [];
            const seen = new Set();
            const registerOrder = key => {
                if (!seen.has(key)) {
                    resolutionOrder.push(key);
                    seen.add(key);
                }
            };

            [...remoteMap.keys()].forEach(registerOrder);
            [...localMap.keys()].forEach(registerOrder);
            [...baseMap.keys()].forEach(registerOrder);

            const resultMap = new Map();

            for (const key of allKeys) {
                const baseItem = baseMap.get(key);
                const localItem = localMap.get(key);
                const remoteItem = remoteMap.get(key);

                if (!baseItem && !remoteItem && localItem) {
                    resultMap.set(key, cloneDeep(localItem));
                    continue;
                }
                if (!baseItem && !localItem && remoteItem) {
                    resultMap.set(key, cloneDeep(remoteItem));
                    continue;
                }
                if (!baseItem && remoteItem && localItem) {
                    if (isEqual(remoteItem, localItem)) {
                        resultMap.set(key, cloneDeep(remoteItem));
                    } else {
                        conflicts.push({ field, key, type: 'new-item-conflict', remote: remoteItem, local: localItem });
                    }
                    continue;
                }
                if (baseItem && !remoteItem && !localItem) {
                    continue;
                }
                if (baseItem && !remoteItem && localItem) {
                    if (isEqual(localItem, baseItem)) {
                        continue;
                    }
                    conflicts.push({ field, key, type: 'remote-deleted-local-edited', base: baseItem, local: localItem });
                    continue;
                }
                if (baseItem && remoteItem && !localItem) {
                    if (isEqual(remoteItem, baseItem)) {
                        continue;
                    }
                    conflicts.push({ field, key, type: 'local-deleted-remote-edited', base: baseItem, remote: remoteItem });
                    continue;
                }
                if (baseItem && remoteItem && localItem) {
                    const remoteChanged = !isEqual(remoteItem, baseItem);
                    const localChanged = !isEqual(localItem, baseItem);
                    if (remoteChanged && localChanged) {
                        if (isEqual(remoteItem, localItem)) {
                            resultMap.set(key, cloneDeep(remoteItem));
                        } else {
                            conflicts.push({ field, key, type: 'both-modified', base: baseItem, remote: remoteItem, local: localItem });
                        }
                    } else if (remoteChanged) {
                        resultMap.set(key, cloneDeep(remoteItem));
                    } else if (localChanged) {
                        resultMap.set(key, cloneDeep(localItem));
                    } else {
                        resultMap.set(key, cloneDeep(baseItem));
                    }
                    continue;
                }
                if (baseItem) {
                    resultMap.set(key, cloneDeep(baseItem));
                }
            }

            if (conflicts.length > 0) {
                return;
            }

            const mergedArray = [];
            resolutionOrder.forEach(key => {
                if (!resultMap.has(key)) return;
                const value = resultMap.get(key);
                if (value !== null && value !== undefined) {
                    mergedArray.push(cloneDeep(value));
                }
            });
            mergedData[field] = mergedArray;
        };

        const mergePrimitiveArray = field => {
            handledFields.add(field);
            const baseArray = normalizeArray(baseData[field]);
            const localArray = normalizeArray(localData[field]);
            const remoteArray = normalizeArray(remoteData[field]);

            const remoteChanged = !isEqual(remoteArray, baseArray);
            const localChanged = !isEqual(localArray, baseArray);

            if (remoteChanged && localChanged && !isEqual(remoteArray, localArray)) {
                conflicts.push({ field, type: 'order-conflict', base: baseArray, remote: remoteArray, local: localArray });
                return;
            }
            if (remoteChanged) {
                mergedData[field] = cloneDeep(remoteArray);
                return;
            }
            if (localChanged) {
                mergedData[field] = cloneDeep(localArray);
                return;
            }
            mergedData[field] = cloneDeep(baseArray);
        };

        const mergeSimpleField = (field, defaultValue = null) => {
            handledFields.add(field);
            const baseHas = Object.prototype.hasOwnProperty.call(baseData, field);
            const localHas = Object.prototype.hasOwnProperty.call(localData, field);
            const remoteHas = Object.prototype.hasOwnProperty.call(remoteData, field);
            if (!baseHas && !localHas && !remoteHas) return;

            const baseValue = baseHas ? baseData[field] : defaultValue;
            const localValue = localHas ? localData[field] : baseValue;
            const remoteValue = remoteHas ? remoteData[field] : baseValue;

            const remoteChanged = !isEqual(remoteValue, baseValue);
            const localChanged = !isEqual(localValue, baseValue);

            if (remoteChanged && localChanged && !isEqual(remoteValue, localValue)) {
                conflicts.push({ field, type: 'value-conflict', base: baseValue, remote: remoteValue, local: localValue });
                return;
            }
            if (remoteChanged) {
                mergedData[field] = cloneDeep(remoteValue);
                return;
            }
            if (localChanged) {
                mergedData[field] = cloneDeep(localValue);
                return;
            }
            if (baseHas) mergedData[field] = cloneDeep(baseValue);
        };

        const mergeGenericField = field => {
            handledFields.add(field);
            const baseHas = Object.prototype.hasOwnProperty.call(baseData, field);
            const localHas = Object.prototype.hasOwnProperty.call(localData, field);
            const remoteHas = Object.prototype.hasOwnProperty.call(remoteData, field);
            if (!baseHas && !localHas && !remoteHas) return;

            const baseValue = baseHas ? baseData[field] : undefined;
            const localValue = localHas ? localData[field] : baseValue;
            const remoteValue = remoteHas ? remoteData[field] : baseValue;

            const remoteChanged = !isEqual(remoteValue, baseValue);
            const localChanged = !isEqual(localValue, baseValue);

            if (remoteChanged && localChanged && !isEqual(remoteValue, localValue)) {
                conflicts.push({ field, type: 'generic-conflict', base: baseValue, remote: remoteValue, local: localValue });
                return;
            }
            if (remoteChanged) {
                mergedData[field] = cloneDeep(remoteValue);
                return;
            }
            if (localChanged) {
                mergedData[field] = cloneDeep(localValue);
                return;
            }
            if (baseHas) mergedData[field] = cloneDeep(baseValue);
        };

        mergeObjectArray('events');
        mergeObjectArray('days');
        mergePrimitiveArray('layerOrder');
        mergeSimpleField('tripTitle', '');

        const dataKeys = new Set([
            ...Object.keys(baseData),
            ...Object.keys(localData),
            ...Object.keys(remoteData)
        ]);

        dataKeys.forEach(field => {
            if (handledFields.has(field)) return;
            mergeGenericField(field);
        });

        return { data: mergedData, conflicts };
    },

    prepareSnapshotForPush(localSnapshot, remoteState) {
        const baseVersion = localSnapshot.baseVersion ?? this.state.lastBaseVersion ?? null;
        const baseHash = localSnapshot.baseHash ?? this.state.lastBaseHash ?? null;
        const remoteVersion = remoteState.remoteVersion ?? null;
        const remoteHash = remoteState.remoteHash ?? null;
        const remoteSnapshot = remoteState.snapshot;
        const remoteUpdatedAt = remoteState.remoteUpdatedAt ?? null;
        const localHash = this.calculateHash(localSnapshot);

        const revisionChanged = (this.state.localRevision || 0) !== (this.state.lastSyncedRevision || 0);
        let localChanged = this.hasChanged === true || revisionChanged;
        if (!localChanged) {
            if (localHash && baseHash) localChanged = localHash !== baseHash;
            else if (localHash && !baseHash) localChanged = true;
            else if (!localHash && baseHash) localChanged = true;
        }

        let remoteChanged = false;
        if (remoteVersion && baseVersion && remoteVersion !== baseVersion) remoteChanged = true;
        if (!remoteChanged && remoteHash && baseHash && remoteHash !== baseHash) remoteChanged = true;
        if (!remoteChanged && remoteHash && !baseHash) remoteChanged = true;
        if (!remoteChanged && remoteSnapshot && Object.keys(remoteSnapshot.data || {}).length > 0 && !baseVersion) {
            remoteChanged = true;
        }

        if (!remoteChanged && !localChanged) {
            return {
                conflict: false,
                snapshot: null,
                shouldSkip: true,
                needsLocalRefresh: false,
                remoteChanged: false,
                conflicts: [],
                localHash
            };
        }

        if (!remoteChanged) {
            const syncTime = getJstNow();
            const snapshotToPush = {
                version: localSnapshot.version || '3.1',
                syncTime,
                baseVersion: remoteVersion ?? baseVersion ?? null,
                baseHash: remoteHash ?? baseHash ?? null,
                changeId: generateChangeId(),
                originDeviceId: this.deviceId,
                data: cloneDeep(localSnapshot.data) || {}
            };
            return {
                conflict: false,
                snapshot: snapshotToPush,
                shouldSkip: false,
                needsLocalRefresh: false,
                remoteChanged: false,
                conflicts: [],
                localHash
            };
        }

        const baseSnapshot = this.lastBaseSnapshot || this.state.lastBaseSnapshot || null;
        if (!baseSnapshot) {
            return {
                conflict: true,
                conflicts: [{ type: 'missing-base', message: 'ローカルの基準データが見つからないため自動マージできません。' }],
                remoteSnapshot,
                remoteChanged: true
            };
        }

        const effectiveRemoteSnapshot = remoteSnapshot || {
            version: localSnapshot.version || '3.1',
            syncTime: remoteUpdatedAt || getJstNow(),
            data: {}
        };

        const mergeResult = this.mergeSnapshots({
            baseSnapshot,
            localSnapshot,
            remoteSnapshot: effectiveRemoteSnapshot
        });

        if (mergeResult.conflicts.length > 0) {
            return {
                conflict: true,
                conflicts: mergeResult.conflicts,
                remoteSnapshot: effectiveRemoteSnapshot,
                remoteChanged: true,
                shouldSkip: false,
                localHash
            };
        }

        const mergedSyncTime = getJstNow();
        const mergedSnapshot = {
            version: localSnapshot.version || effectiveRemoteSnapshot.version || '3.1',
            syncTime: mergedSyncTime,
            baseVersion: remoteVersion,
            baseHash: remoteHash,
            changeId: generateChangeId(),
            originDeviceId: this.deviceId,
            data: mergeResult.data || {}
        };

        if (!mergedSnapshot.data && localSnapshot.data) {
            mergedSnapshot.data = cloneDeep(localSnapshot.data);
        }

        const localDataKeys = Object.keys(localSnapshot.data || {});
        localDataKeys.forEach(field => {
            if (mergedSnapshot.data[field] === undefined) {
                mergedSnapshot.data[field] = cloneDeep(localSnapshot.data[field]);
            }
        });

        const remoteDataKeys = Object.keys(effectiveRemoteSnapshot.data || {});
        remoteDataKeys.forEach(field => {
            if (mergedSnapshot.data[field] === undefined) {
                mergedSnapshot.data[field] = cloneDeep(effectiveRemoteSnapshot.data[field]);
            }
        });

        return {
            conflict: false,
            snapshot: mergedSnapshot,
            shouldSkip: false,
            needsLocalRefresh: true,
            remoteChanged: true,
            conflicts: [],
            localHash
        };
    },

    applyMergedSnapshot(snapshot, { silent = true } = {}) {
        if (!snapshot) return;
        if (window.app?.applyCloudData) {
            window.app.applyCloudData(snapshot, { silent });
            return;
        }

        const data = snapshot.data || {};
        try {
            if (Array.isArray(data.events)) {
                localStorage.setItem('trippenEvents', JSON.stringify(data.events));
            }
            if (Array.isArray(data.days)) {
                localStorage.setItem('trippenDays', JSON.stringify(data.days));
            }
            if (Array.isArray(data.layerOrder)) {
                localStorage.setItem('trippenLayerOrder', JSON.stringify(data.layerOrder));
            }
            if (data.tripTitle !== undefined) {
                localStorage.setItem('trippenTitle', data.tripTitle || '');
            }
        } catch {
            // ローカルストレージ更新に失敗しても致命的ではない
        }
    },

    applyRemoteState(remoteState, { silent = true } = {}) {
        const snapshot = remoteState?.snapshot || null;
        const remoteVersion = remoteState?.remoteVersion || null;
        const remoteHash = remoteState?.remoteHash || null;
        const remoteUpdatedAt = remoteState?.remoteUpdatedAt || null;
        if (!snapshot) return false;

        const syncTime = toJstIsoStringFromIso(snapshot?.syncTime) || toJstIsoStringFromIso(remoteUpdatedAt) || getJstNow();
        const readTime = getJstNow();

        this.state.lastRemoteVersion = remoteVersion;
        this.state.lastRemoteHash = remoteHash;
        this.state.lastRemoteSyncTime = remoteUpdatedAt || syncTime;
        this.state.lastLocalSyncTime = syncTime;
        this.state.lastReadTime = readTime;
        this.state.lastBaseVersion = remoteVersion;
        this.state.lastBaseHash = remoteHash;
        this.state.lastBaseSnapshot = cloneDeep(snapshot);
        this.state.lastLocalHash = remoteHash;
        this.state.lastPendingHash = null;
        this.state.lastSyncedRevision = this.state.localRevision || this.state.lastSyncedRevision || 0;
        this.state.localRevision = this.state.lastSyncedRevision;
        this.state.pendingChangeId = null;
        this.persistState();

        this.lastRemoteVersion = remoteVersion;
        this.lastDataHash = remoteHash;
        this.lastSyncTime = syncTime;
        this.lastReadTime = readTime;
        this.lastBaseVersion = remoteVersion;
        this.lastBaseHash = remoteHash;
        this.lastBaseSnapshot = cloneDeep(snapshot);
        this.lastLocalHash = remoteHash;
        this.lastPendingHash = null;
        this.pendingChangeId = null;
        this.lastSyncedRevision = this.state.lastSyncedRevision;
        this.localRevision = this.state.localRevision;
        this.hasChanged = false;

        this.applyMergedSnapshot(snapshot, { silent });
        return true;
    },

    hasRemoteChange(remoteState) {
        if (!remoteState) return false;
        const baseVersion = this.state.lastBaseVersion || null;
        const baseHash = this.state.lastBaseHash || null;
        const remoteVersion = remoteState.remoteVersion || null;
        const remoteHash = remoteState.remoteHash || null;
        const lastLocalHash = this.state.lastLocalHash || null;
        if (remoteHash && lastLocalHash && remoteHash === lastLocalHash) return false;
        if (remoteVersion && baseVersion && remoteVersion !== baseVersion) return true;
        if (remoteHash && baseHash && remoteHash !== baseHash) return true;
        if (remoteHash && !baseHash) return true;
        return false;
    },

    scheduleNextPoll(delayMs = this.pollIntervalMs) {
        if (!this.isEnabled || !this.token) return;
        const safeDelay = delayMs === 0 ? 0 : Math.max(delayMs, MIN_POLL_INTERVAL_MS);
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
        this.pollTimer = setTimeout(() => {
            this.periodicSyncTick().catch(error => {
                console.error('TrippenGistSync.periodicSyncTick failed', error);
                this.syncBackoffMs = Math.min((this.syncBackoffMs || this.pollIntervalMs) * 2, MAX_BACKOFF_MS);
                this.scheduleNextPoll(this.pollIntervalMs + this.syncBackoffMs);
            });
        }, safeDelay);
    },

    async periodicSyncTick({ triggeredByVisibility = false } = {}) {
        if (!this.isEnabled || !this.token) return;
        if (this.isSyncing) {
            this.scheduleNextPoll(this.pollIntervalMs);
            return;
        }

        let nextDelay = this.pollIntervalMs;
        try {
            const remoteState = await this.fetchRemoteState();
            const unsavedDraft = typeof this.hooks.hasUnsavedChanges === 'function' && this.hooks.hasUnsavedChanges();

            if (this.hasChanged) {
                const success = await this.autoWriteToCloud(remoteState);
                if (!success && this.hasError) {
                    window.app?.handleSyncConflict?.([{ type: 'push-conflict' }]);
                }
            }

            if (!this.hasChanged && !unsavedDraft && this.hasRemoteChange(remoteState)) {
                const applied = this.applyRemoteState(remoteState, { silent: triggeredByVisibility });
                if (!applied) {
                    this.hasError = true;
                    window.app?.handleSyncConflict?.([{ type: 'remote-update-error' }]);
                }
            }

            this.syncBackoffMs = 0;
        } catch (error) {
            this.hasError = true;
            console.error('TrippenGistSync.periodicSyncTick failed', error);
            this.syncBackoffMs = Math.min((this.syncBackoffMs || this.pollIntervalMs) * 2, MAX_BACKOFF_MS);
            nextDelay += this.syncBackoffMs;
        }

        this.scheduleNextPoll(nextDelay);
    },

    bindVisibilityHandler() {
        if (typeof document === 'undefined') return;
        if (this.visibilityListener) return;
        this.visibilityListener = () => {
            if (document.visibilityState === 'visible') {
                this.scheduleNextPoll(0);
            }
        };
        document.addEventListener('visibilitychange', this.visibilityListener);
    },
    unbindVisibilityHandler() {
        if (typeof document === 'undefined') return;
        if (!this.visibilityListener) return;
        document.removeEventListener('visibilitychange', this.visibilityListener);
        this.visibilityListener = null;
    },

    buildPayload(snapshot) {
        const now = getJstNow();
        const baseVersion = snapshot.baseVersion ?? this.state.lastBaseVersion ?? this.lastRemoteVersion ?? null;
        const baseHash = snapshot.baseHash ?? this.state.lastBaseHash ?? this.lastDataHash ?? null;
        const changeId = snapshot.changeId ?? this.state.pendingChangeId ?? null;
        const originDeviceId = snapshot.originDeviceId || this.deviceId || null;
        return {
            description: `Tripen sync data - ${now}`,
            public: false,
            files: {
                'trippen_data.json': {
                    content: JSON.stringify({
                        version: '3.1',
                        syncTime: snapshot.syncTime || now,
                        baseVersion,
                        baseHash,
                        changeId,
                        originDeviceId,
                        data: snapshot.data || {},
                        meta: {
                            schemaVersion: '3.1',
                            generatedAt: now,
                            deviceId: this.deviceId,
                            baseVersion,
                            baseHash,
                            changeId,
                            originDeviceId
                        }
                    }, null, 2)
                }
            }
        };
    },

    async fetchJson(url, { method = 'GET', body = null, cache = 'no-store' } = {}) {
        const headers = {
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        };
        if (this.token) headers.Authorization = `token ${this.token}`;
        if (body) headers['Content-Type'] = 'application/json';

        const response = await fetch(url, { method, headers, body, cache, mode: 'cors' });
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

    async fetchRemoteState() {
        if (!this.isEnabled || !this.token || !this.gistId) {
            return { snapshot: null, remoteVersion: null, remoteHash: null, remoteUpdatedAt: null };
        }

        const gist = await this.fetchGist();
        const file = gist.files?.['trippen_data.json'] || null;
        let snapshot = null;

        if (file?.content) {
            try {
                snapshot = JSON.parse(file.content);
            } catch {
                snapshot = null;
            }
        }

        const latestCommit = gist.history?.[0] || null;
        const remoteVersion = latestCommit?.version || latestCommit?.commit || gist.version || null;
        const remoteUpdatedAt = toJstIsoStringFromIso(snapshot?.syncTime) || toJstIsoStringFromIso(gist.updated_at) || getJstNow();
        const remoteHash = snapshot ? this.calculateHash(snapshot) : null;
        const readTime = getJstNow();

        this.state.lastRemoteVersion = remoteVersion;
        this.state.lastRemoteHash = remoteHash;
        this.state.lastRemoteSyncTime = remoteUpdatedAt;
        this.state.lastReadTime = readTime;
        this.persistState();

        this.lastRemoteVersion = remoteVersion;
        this.lastDataHash = remoteHash;
        this.lastReadTime = readTime;

        if (snapshot) {
            if (snapshot.syncTime) snapshot.syncTime = toJstIsoStringFromIso(snapshot.syncTime) || snapshot.syncTime;
            if (!snapshot.baseVersion) snapshot.baseVersion = remoteVersion;
            if (!snapshot.baseHash) snapshot.baseHash = remoteHash;
        }

        return { snapshot, remoteVersion, remoteHash, remoteUpdatedAt };
    },

    async pushSnapshot(snapshot) {
        if (!this.token) throw new Error('GitHubトークンが設定されていません');
        if (snapshot?.syncTime) snapshot.syncTime = toJstIsoStringFromIso(snapshot.syncTime) || snapshot.syncTime;
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
        const remoteUpdatedAt = toJstIsoStringFromIso(result.updated_at) || toJstIsoStringFromIso(snapshot.syncTime) || getJstNow();
        const remoteHash = this.calculateHash(snapshot);
        const baseSnapshotCopy = cloneDeep(snapshot);

        this.state.lastRemoteVersion = remoteVersion;
        this.state.lastRemoteHash = remoteHash;
        this.state.lastRemoteSyncTime = remoteUpdatedAt;
        this.state.lastLocalSyncTime = snapshot.syncTime || remoteUpdatedAt;
        this.state.lastReadTime = remoteUpdatedAt;
        this.state.lastBaseVersion = remoteVersion;
        this.state.lastBaseHash = remoteHash;
        this.state.lastBaseSnapshot = baseSnapshotCopy;
        this.state.lastLocalHash = remoteHash;
        this.state.lastPendingHash = null;
        this.state.lastSyncedRevision = this.state.localRevision || this.state.lastSyncedRevision || 0;
        this.state.localRevision = this.state.lastSyncedRevision;
        this.state.pendingChangeId = null;
        this.persistState();

        this.lastRemoteVersion = remoteVersion;
        this.lastDataHash = remoteHash;
        this.lastSyncTime = this.state.lastLocalSyncTime;
        this.lastReadTime = this.state.lastReadTime;
        this.lastBaseVersion = this.state.lastBaseVersion;
        this.lastBaseHash = this.state.lastBaseHash;
        this.lastBaseSnapshot = baseSnapshotCopy;
        this.lastLocalHash = remoteHash;
        this.lastPendingHash = null;
        this.pendingChangeId = null;
        this.lastSyncedRevision = this.state.lastSyncedRevision;
        this.localRevision = this.state.localRevision;
        this.hasChanged = false;
        this.isEnabled = !!this.token;
        return result;
    },

    async detectConflict(localHash) {
        if (!this.isEnabled || !this.gistId) return false;
        this.setStatus('checking');
        try {
            const remoteState = await this.fetchRemoteState();
            const baseVersion = this.state.lastBaseVersion || null;
            const baseHash = this.state.lastBaseHash || null;
            const remoteVersion = remoteState.remoteVersion || null;
            const remoteHash = remoteState.remoteHash || null;

            const versionChanged = Boolean(remoteVersion && baseVersion && remoteVersion !== baseVersion);
            const hashChanged = Boolean(remoteHash && baseHash && remoteHash !== baseHash);
            const localDiffers = Boolean(remoteHash && localHash && remoteHash !== localHash);
            const remoteHasDataWithoutBase = Boolean(remoteHash && !baseHash);

            return versionChanged || hashChanged || localDiffers || remoteHasDataWithoutBase;
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
            if (snapshot?.syncTime) snapshot.syncTime = toJstIsoStringFromIso(snapshot.syncTime) || snapshot.syncTime;
            const remoteHash = this.calculateHash(snapshot);
            const latestCommit = gist.history?.[0] || null;
            const remoteVersion = latestCommit?.version || latestCommit?.commit || gist.version || null;
            const remoteUpdatedAt = toJstIsoStringFromIso(snapshot.syncTime) || toJstIsoStringFromIso(gist.updated_at) || getJstNow();
            const readTime = getJstNow();

            if (!snapshot.baseVersion) snapshot.baseVersion = remoteVersion;
            if (!snapshot.baseHash) snapshot.baseHash = remoteHash;
            if (!snapshot.originDeviceId) snapshot.originDeviceId = null;
            if (!snapshot.changeId) snapshot.changeId = null;

            this.state.lastRemoteVersion = remoteVersion;
            this.state.lastRemoteHash = remoteHash;
            this.state.lastRemoteSyncTime = remoteUpdatedAt;
            this.state.lastLocalSyncTime = remoteUpdatedAt;
            this.state.lastReadTime = readTime;
            this.state.lastBaseVersion = remoteVersion;
            this.state.lastBaseHash = remoteHash;
            this.state.lastBaseSnapshot = cloneDeep(snapshot);
            this.state.lastLocalHash = remoteHash;
            this.state.lastPendingHash = null;
            this.state.lastSyncedRevision = this.state.localRevision || this.state.lastSyncedRevision || 0;
            this.state.localRevision = this.state.lastSyncedRevision;
            this.state.pendingChangeId = null;
            this.persistState();

            this.lastRemoteVersion = remoteVersion;
            this.lastDataHash = remoteHash;
            this.lastSyncTime = remoteUpdatedAt;
            this.lastReadTime = readTime;
            this.lastBaseVersion = remoteVersion;
            this.lastBaseHash = remoteHash;
            this.lastBaseSnapshot = cloneDeep(snapshot);
            this.lastLocalHash = remoteHash;
            this.lastPendingHash = null;
            this.pendingChangeId = null;
            this.lastSyncedRevision = this.state.lastSyncedRevision;
            this.localRevision = this.state.localRevision;
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

    handleRemoteMerge(preparation, remoteState) {
        const snapshotToApply = preparation?.snapshot
            ? cloneDeep(preparation.snapshot)
            : (remoteState?.snapshot ? cloneDeep(remoteState.snapshot) : null);
        this.setStatus('merging');
        this.applyRemoteState(remoteState, { silent: true });
        if (snapshotToApply) {
            this.applyMergedSnapshot(snapshotToApply, { silent: true });
        }
        if (this.immediateSyncTimer) {
            clearTimeout(this.immediateSyncTimer);
            this.immediateSyncTimer = null;
        }
        const mergedData = this.getLocalDataSnapshot();
        const mergedHash = this.calculateHash({ data: mergedData });
        this.ensurePendingChangeContext();
        this.state.pendingChangeId = generateChangeId();
        this.pendingChangeId = this.state.pendingChangeId;
        this.state.lastPendingHash = mergedHash;
        this.lastPendingHash = mergedHash;
        this.state.lastLocalHash = mergedHash;
        this.lastLocalHash = mergedHash;
        this.state.localRevision = (this.state.localRevision || 0) + 1;
        this.localRevision = this.state.localRevision;
        this.hasChanged = true;
        this.hasError = false;
        this.persistState();
        this.hooks.onRemoteMerge?.({
            snapshot: snapshotToApply,
            remoteState
        });
        this.setStatus('needs-review');
    },

    async manualWriteToCloud(remoteStateInput = null) {
        if (!this.isEnabled || !this.token) throw new Error('GitHub同期が設定されていません');

        if (window.app?.saveData) window.app.saveData();
        if (!this.hasChanged) {
            this.hasError = false;
            return true;
        }
        const localSnapshot = this.collectSyncData();
        this.setStatus('pushing');
        this.isSyncing = true;
        this.hasError = false;

        try {
            const remoteState = remoteStateInput || await this.fetchRemoteState();
            const preparation = this.prepareSnapshotForPush(localSnapshot, remoteState);
            if (preparation.conflict) {
                this.hasError = true;
                window.app?.handleSyncConflict?.(preparation.conflicts);
                throw new Error('クラウドに新しい変更があります');
            }
            if (preparation.remoteChanged) {
                this.handleRemoteMerge(preparation, remoteState);
                this.hasError = false;
                return true;
            }
            if (preparation.shouldSkip) {
                this.resetChanged();
                this.state.lastPendingHash = null;
                this.lastPendingHash = null;
                this.persistState();
                return true;
            }

            await this.pushSnapshot(preparation.snapshot);
            this.hasError = false;

            if (preparation.needsLocalRefresh) {
                this.applyMergedSnapshot(preparation.snapshot, { silent: true });
            }

            return true;
        } catch (error) {
            this.hasError = true;
            throw error;
        } finally {
            this.isSyncing = false;
            this.setStatus('idle');
        }
    },

    requestImmediateSync(reason = 'auto') {
        if (!this.isEnabled || !this.token) return;
        Promise.resolve().then(async () => {
            if (!this.hasChanged) return;
            try {
                await this.autoWriteToCloud();
            } catch (error) {
                console.error(`TrippenGistSync.requestImmediateSync failed (${reason})`, error);
            }
        });
    },

    scheduleImmediateSync(reason = 'mark-changed', delay = 200) {
        if (!this.isEnabled || !this.token) return;
        if (this.immediateSyncTimer) clearTimeout(this.immediateSyncTimer);
        this.immediateSyncTimer = setTimeout(() => {
            this.immediateSyncTimer = null;
            this.requestImmediateSync(reason);
        }, delay);
    },

    async autoWriteToCloud(remoteStateInput = null) {
        if (!this.isEnabled || !this.token || this.isSyncing) return false;
        if (!this.hasChanged) return false;

        if (window.app?.saveData) window.app.saveData();
        const localSnapshot = this.collectSyncData();
        this.isSyncing = true;
        this.setStatus('pushing');

        try {
            const remoteState = remoteStateInput || await this.fetchRemoteState();
            const preparation = this.prepareSnapshotForPush(localSnapshot, remoteState);
            if (preparation.conflict) {
                this.hasError = true;
                window.app?.handleSyncConflict?.(preparation.conflicts);
                return false;
            }
            if (preparation.remoteChanged) {
                this.handleRemoteMerge(preparation, remoteState);
                this.hasError = false;
                return true;
            }
            if (preparation.shouldSkip) {
                this.resetChanged();
                this.state.lastPendingHash = null;
                this.lastPendingHash = null;
                this.persistState();
                this.hasError = false;
                return true;
            }

            await this.pushSnapshot(preparation.snapshot);
            this.hasError = false;

            if (preparation.needsLocalRefresh) {
                this.applyMergedSnapshot(preparation.snapshot, { silent: true });
            }

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
        if (!this.isEnabled || !this.token || !this.gistId) return false;
        const remoteState = await this.fetchRemoteState();
        const baseVersion = this.state.lastBaseVersion || null;
        const baseHash = this.state.lastBaseHash || null;
        const remoteVersion = remoteState.remoteVersion || null;
        const remoteHash = remoteState.remoteHash || null;

        const versionChanged = Boolean(remoteVersion && baseVersion && remoteVersion !== baseVersion);
        const hashChanged = Boolean(remoteHash && baseHash && remoteHash !== baseHash);

        if (versionChanged || hashChanged) return true;
        if (!remoteHash && !remoteVersion) return false;
        const lastSyncTime = this.lastSyncTime ? Date.parse(this.lastSyncTime) : null;
        const remoteSyncTime = remoteState.remoteUpdatedAt ? Date.parse(remoteState.remoteUpdatedAt) : null;
        return Boolean(remoteSyncTime && lastSyncTime && remoteSyncTime > lastSyncTime);
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
        this.pendingChangeId = null;
        this.lastPendingHash = null;
        this.localRevision = 0;
        this.lastSyncedRevision = 0;
        this.lastBaseVersion = null;
        this.lastBaseHash = null;
        this.lastBaseSnapshot = null;
        this.lastLocalHash = null;
        this.lastRemoteVersion = null;
        this.lastDataHash = null;
        this.lastSyncTime = null;
        this.lastReadTime = null;
        this.isEnabled = false;
        this.isSyncing = false;
        this.hasError = false;
        this.hasChanged = false;
        this.status = 'idle';
        this.syncBackoffMs = 0;
        this.pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;
        this.pollTimer = null;
        this.visibilityListener = null;
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
