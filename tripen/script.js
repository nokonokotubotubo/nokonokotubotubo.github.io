const { createApp } = Vue;

// GitHub Gist同期システム（変更フラグ管理版・競合チェック対応完全版）
const TrippenGistSync = {
    token: null,
    gistId: null,
    isEnabled: false,
    isSyncing: false,
    lastSyncTime: null,
    lastReadTime: null,
    periodicSyncInterval: null,
    hasError: false,
    
    // 変更フラグ管理
    hasChanged: false,
    lastDataHash: null,

    // データハッシュ計算
    calculateHash(data) {
        try {
            const sortedData = {
                events: data.data.events || [],
                days: data.data.days || [],
                layerOrder: data.data.layerOrder || []
            };
            const jsonString = JSON.stringify(sortedData, Object.keys(sortedData).sort());
            let hash = 0;
            for (let i = 0; i < jsonString.length; i++) {
                const char = jsonString.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash |= 0;
            }
            return hash.toString();
        } catch (error) {
            console.error('ハッシュ計算エラー:', error);
            return Date.now().toString();
        }
    },

    // 変更フラグ設定
    markChanged() {
        this.hasChanged = true;
        console.log('データが変更されました - フラグ設定');
    },

    // 変更フラグリセット
    resetChanged() {
        this.hasChanged = false;
        console.log('変更フラグをリセットしました');
    },

    // 暗号化機能
    _encrypt(text, key = 'trippen_secret_key') {
        if (!text) return '';
        try {
            let result = '';
            for (let i = 0; i < text.length; i++) {
                result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            }
            return btoa(result);
        } catch (error) {
            console.error('暗号化エラー:', error);
            throw new Error('暗号化処理に失敗しました');
        }
    },

    _decrypt(encryptedText, key = 'trippen_secret_key') {
        if (!encryptedText) return '';
        try {
            const text = atob(encryptedText);
            let result = '';
            for (let i = 0; i < text.length; i++) {
                result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            }
            return result;
        } catch (error) {
            console.error('復号化エラー:', error);
            throw new Error('復号化に失敗しました');
        }
    },

    getUTCTimestamp() {
        return new Date().toISOString();
    },

    loadConfig() {
        console.log('TrippenGistSync.loadConfig() 開始');
        
        try {
            const configStr = localStorage.getItem('trippen_gist_config');
            console.log('設定文字列:', configStr);
            
            if (!configStr) {
                console.log('設定が見つかりません');
                return null;
            }

            const config = JSON.parse(configStr);
            console.log('パース済み設定:', config);
            
            if (config.encryptedToken) {
                this.token = this._decrypt(config.encryptedToken);
                console.log('トークン復号化完了:', this.token ? 'あり' : 'なし');
            }
            
            this.gistId = config.gistId || null;
            this.lastSyncTime = config.lastSyncTime || null;
            this.lastReadTime = config.lastReadTime || null;
            this.lastDataHash = config.lastDataHash || null;
            this.isEnabled = !!(this.token);
            
            console.log('最終状態:', {
                isEnabled: this.isEnabled,
                hasToken: !!this.token,
                gistId: this.gistId,
                lastSyncTime: this.lastSyncTime,
                lastReadTime: this.lastReadTime,
                lastDataHash: this.lastDataHash
            });
            
            return config;
        } catch (error) {
            console.error('設定読み込みエラー:', error);
            this.hasError = true;
            this.isEnabled = false;
            return null;
        }
    },

    init(token, gistId = null) {
        console.log('TrippenGistSync.init() 開始:', { token: token ? 'あり' : 'なし', gistId });
        
        if (!token || typeof token !== 'string' || token.trim().length === 0) {
            throw new Error('有効なトークンが必要です');
        }

        const encryptedToken = this._encrypt(token.trim());
        
        this.token = token.trim();
        this.gistId = gistId ? gistId.trim() : null;
        this.isEnabled = true;
        this.hasError = false;
        this.hasChanged = false;

        const configData = {
            encryptedToken: encryptedToken,
            gistId: this.gistId,
            isEnabled: this.isEnabled,
            configuredAt: this.getUTCTimestamp(),
            lastSyncTime: this.lastSyncTime,
            lastReadTime: this.lastReadTime,
            lastDataHash: this.lastDataHash,
            version: '3.0'
        };

        localStorage.setItem('trippen_gist_config', JSON.stringify(configData));
        console.log('設定保存完了:', configData);
        
        this.startPeriodicSync();
    },

    startPeriodicSync() {
        if (this.periodicSyncInterval) {
            clearInterval(this.periodicSyncInterval);
        }
        
        this.periodicSyncInterval = setInterval(async () => {
            await this.autoWriteToCloud();
        }, 60000);
        
        console.log('定期同期開始（1分間隔・変更フラグ管理版）');
    },

    stopPeriodicSync() {
        if (this.periodicSyncInterval) {
            clearInterval(this.periodicSyncInterval);
            this.periodicSyncInterval = null;
            console.log('定期同期停止');
        }
    },

    collectSyncData() {
        const events = JSON.parse(localStorage.getItem('trippenEvents') || '[]');
        const days = JSON.parse(localStorage.getItem('trippenDays') || '[]');
        const layerOrder = JSON.parse(localStorage.getItem('trippenLayerOrder') || '[]');

        console.log('同期データ収集:', {
            eventsCount: events.length,
            daysCount: days.length,
            layerOrderCount: layerOrder.length
        });

        return {
            version: '3.0',
            syncTime: this.getUTCTimestamp(),
            data: {
                events: events,
                days: days,
                layerOrder: layerOrder
            }
        };
    },

    async syncToCloud(data) {
        if (!this.token) {
            console.error('トークンが設定されていません');
            return false;
        }
        
        const payload = {
            description: `とりっぺんちゃん 旅行データ バックアップ - ${new Date().toLocaleString('ja-JP')}`,
            public: false,
            files: {
                "trippen_data.json": {
                    content: JSON.stringify(data, null, 2)
                }
            }
        };
        
        const url = this.gistId 
            ? `https://api.github.com/gists/${this.gistId}`
            : 'https://api.github.com/gists';
            
        const method = this.gistId ? 'PATCH' : 'POST';
        
        console.log('クラウド書き込み開始:', { method, url, gistId: this.gistId });
        
        try {
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Trippen-App'
                },
                body: JSON.stringify(payload)
            });
            
            console.log('レスポンス状態:', response.status);
            
            if (response.ok) {
                const result = await response.json();
                console.log('書き込み成功:', result.id);
                
                if (!this.gistId && result.id) {
                    this.gistId = result.id;
                    this.saveGistId(result.id);
                    console.log('新しいGist IDを保存しました:', result.id);
                }
                
                return true;
            } else {
                const errorText = await response.text();
                console.error('書き込み失敗:', response.status, errorText);
                return false;
            }
        } catch (error) {
            console.error('クラウド書き込みエラー:', error);
            this.hasError = true;
            return false;
        }
    },

    async loadFromCloud() {
        console.log('loadFromCloud() 開始');
        console.log('現在の状態:', { 
            hasToken: !!this.token, 
            hasGistId: !!this.gistId,
            token: this.token ? 'あり' : 'なし',
            gistId: this.gistId || 'なし'
        });
        
        if (!this.token) {
            throw new Error('トークンが設定されていません');
        }
        
        if (!this.gistId) {
            throw new Error('Gist IDが設定されていません');
        }
        
        try {
            console.log('GitHub APIアクセス開始:', `https://api.github.com/gists/${this.gistId}`);
            
            const response = await fetch(`https://api.github.com/gists/${this.gistId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Trippen-App'
                }
            });
            
            console.log('GitHub APIレスポンス:', response.status, response.statusText);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error Response:', errorText);
                
                if (response.status === 404) {
                    throw new Error('Gistが見つかりません。Gist IDを確認してください。');
                } else if (response.status === 401) {
                    throw new Error('GitHub Personal Access Tokenが無効です。設定を確認してください。');
                } else if (response.status === 403) {
                    throw new Error('GitHub APIの利用制限に達しています。しばらく待ってから再試行してください。');
                } else {
                    throw new Error(`GitHub API エラー: ${response.status} - ${response.statusText}`);
                }
            }
            
            const gist = await response.json();
            console.log('取得したGist情報:', {
                id: gist.id,
                description: gist.description,
                files: Object.keys(gist.files || {})
            });
            
            if (!gist.files || !gist.files['trippen_data.json']) {
                throw new Error('Gistにtrippen_data.jsonファイルが見つかりません');
            }
            
            const content = gist.files['trippen_data.json'].content;
            console.log('ファイル内容サイズ:', content ? content.length : 0);
            
            if (!content || content.trim() === '') {
                throw new Error('Gistファイルが空です');
            }
            
            let parsedData;
            try {
                parsedData = JSON.parse(content);
                console.log('JSONパース成功:', {
                    version: parsedData.version,
                    syncTime: parsedData.syncTime,
                    hasData: !!parsedData.data
                });
            } catch (parseError) {
                console.error('JSONパースエラー:', parseError);
                throw new Error(`JSONパースエラー: ${parseError.message}`);
            }
            
            const newHash = this.calculateHash(parsedData);
            this.lastDataHash = newHash;
            console.log('読み込み時ハッシュ更新:', newHash);
            
            this.lastReadTime = this.getUTCTimestamp();
            this.saveLastReadTime();
            this.resetChanged();
            
            console.log('読み込み完了:', {
                eventsCount: parsedData.data?.events?.length || 0,
                daysCount: parsedData.data?.days?.length || 0
            });
            
            return parsedData;
            
        } catch (error) {
            console.error('クラウドデータ読み込みエラー:', error);
            this.hasError = true;
            throw error;
        }
    },

    async checkForNewerCloudData() {
        if (!this.token || !this.gistId) return false;
        
        try {
            const response = await fetch(`https://api.github.com/gists/${this.gistId}`, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Trippen-App'
                }
            });
            
            if (response.ok) {
                const gist = await response.json();
                const cloudUpdatedAt = new Date(gist.updated_at);
                
                const lastReadTime = new Date(this.lastReadTime || 0);
                const lastWriteTime = new Date(this.lastSyncTime || 0);
                
                const hasNewerData = cloudUpdatedAt > lastReadTime && cloudUpdatedAt > lastWriteTime;
                console.log('競合チェック結果:', {
                    cloudUpdated: cloudUpdatedAt.toISOString(),
                    lastRead: lastReadTime.toISOString(),
                    lastWrite: lastWriteTime.toISOString(),
                    hasNewer: hasNewerData
                });
                
                return hasNewerData;
            }
            
            return false;
        } catch (error) {
            console.error('競合チェックエラー:', error);
            return false;
        }
    },

    // 【修正版】自動書き込み（競合チェック優先版）
    async autoWriteToCloud() {
        if (!this.isEnabled || !this.token || this.isSyncing) {
            return false;
        }
        
        this.isSyncing = true;
        this.hasError = false;
        
        try {
            // 【修正】競合チェックを最初に実行（変更フラグに関係なく）
            console.log('競合チェック実行中...');
            const hasNewerData = await this.checkForNewerCloudData();
            if (hasNewerData) {
                console.log('⚠️ 競合検出 - Vue.jsアプリに通知');
                if (window.app && window.app.handleSyncConflict) {
                    window.app.handleSyncConflict();
                }
                return false; // 競合があるため書き込み停止
            }

            // 変更フラグチェック（競合チェック後に移動）
            if (!this.hasChanged) {
                console.log('変更フラグなし - 書き込みスキップ');
                return false;
            }
            
            console.log('変更フラグあり - 書き込み実行');
            
            // データ収集と書き込み
            const localData = this.collectSyncData();
            const uploadResult = await this.syncToCloud(localData);
            
            if (uploadResult) {
                this.lastSyncTime = this.getUTCTimestamp();
                this.lastDataHash = this.calculateHash(localData);
                this.saveLastSyncTime();
                this.resetChanged();
                console.log('自動書き込み完了:', new Date().toLocaleString());
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('自動書き込みエラー:', error);
            this.hasError = true;
            return false;
        } finally {
            this.isSyncing = false;
        }
    },

    // 【修正後】手動書き込みメソッド（競合チェック対応）
    async manualWriteToCloud() {
        if (!this.isEnabled || !this.token) {
            throw new Error('GitHub同期が設定されていません');
        }
        
        this.isSyncing = true;
        this.hasError = false;
        
        try {
            console.log('手動書き込み開始');
            
            // 【追加】競合チェックを実行
            console.log('競合チェック実行中...');
            const hasNewerData = await this.checkForNewerCloudData();
            if (hasNewerData) {
                console.log('⚠️ 競合検出 - Vue.jsアプリに通知');
                if (window.app && window.app.handleSyncConflict) {
                    window.app.handleSyncConflict();
                }
                throw new Error('データ競合が検出されました。クラウドから最新データを読み込んでください。');
            }
            
            // データ収集と書き込み
            const localData = this.collectSyncData();
            const uploadResult = await this.syncToCloud(localData);
            
            if (uploadResult) {
                const currentHash = this.calculateHash(localData);
                this.lastSyncTime = this.getUTCTimestamp();
                this.lastDataHash = currentHash;
                this.saveLastSyncTime();
                this.resetChanged();
                console.log('手動書き込み完了');
                return true;
            }
            
            throw new Error('書き込みに失敗しました');
        } catch (error) {
            this.hasError = true;
            console.error('手動書き込みエラー:', error);
            throw error;
        } finally {
            this.isSyncing = false;
        }
    },

    async initialAutoLoad() {
        if (!this.isEnabled || !this.token || !this.gistId) {
            console.log('初回自動読み込みスキップ:', {
                isEnabled: this.isEnabled,
                hasToken: !!this.token,
                hasGistId: !!this.gistId
            });
            return null;
        }
        
        try {
            console.log('初回自動読み込み開始');
            const cloudData = await this.loadFromCloud();
            if (cloudData && cloudData.data) {
                console.log('初回自動読み込み完了:', new Date().toLocaleString());
                return cloudData;
            }
            return null;
        } catch (error) {
            console.error('初回自動読み込みエラー:', error);
            this.hasError = true;
            return null;
        }
    },

    saveGistId(gistId) {
        try {
            const currentConfigStr = localStorage.getItem('trippen_gist_config');
            if (!currentConfigStr) {
                console.error('設定が見つからないためGistID保存をスキップ');
                return;
            }

            const config = JSON.parse(currentConfigStr);
            config.gistId = gistId;
            config.lastSyncTime = this.lastSyncTime;
            config.lastReadTime = this.lastReadTime;
            config.lastDataHash = this.lastDataHash;

            localStorage.setItem('trippen_gist_config', JSON.stringify(config));
            
            this.gistId = gistId;
            console.log('Gist IDを正常に保存:', gistId);
            
            if (window.app && window.app.gistSync) {
                window.app.gistSync.gistId = gistId;
            }
            
        } catch (error) {
            console.error('GistID保存エラー:', error);
            this.gistId = gistId;
        }
    },

    saveLastSyncTime() {
        try {
            const currentConfigStr = localStorage.getItem('trippen_gist_config');
            if (!currentConfigStr) return;

            const config = JSON.parse(currentConfigStr);
            config.lastSyncTime = this.lastSyncTime;
            config.lastDataHash = this.lastDataHash;
            localStorage.setItem('trippen_gist_config', JSON.stringify(config));
        } catch (error) {
            console.error('書き込み時刻保存エラー:', error);
        }
    },

    saveLastReadTime() {
        try {
            const currentConfigStr = localStorage.getItem('trippen_gist_config');
            if (!currentConfigStr) return;

            const config = JSON.parse(currentConfigStr);
            config.lastReadTime = this.lastReadTime;
            config.lastDataHash = this.lastDataHash;
            localStorage.setItem('trippen_gist_config', JSON.stringify(config));
        } catch (error) {
            console.error('読み込み時刻保存エラー:', error);
        }
    },

    clear() {
        this.stopPeriodicSync();
        localStorage.removeItem('trippen_gist_config');
        this.token = null;
        this.gistId = null;
        this.isEnabled = false;
        this.lastSyncTime = null;
        this.lastReadTime = null;
        this.hasError = false;
        this.hasChanged = false;
        this.lastDataHash = null;
        
        console.log('TrippenGistSync設定をクリアしました（変更フラグ管理版）');
    }
};

const app = createApp({
data() {
return {
tripInitialized: false,
tripStartDate: '',
tripEndDate: '',
today: new Date().toISOString().split('T')[0],
hasExistingData: false,
tripDays: [],
activeDay: 0,
showMobilePopup: false,
selectedDayForPopup: null,
selectedDayIndex: null,
scrollPosition: 0,
maxScrollPosition: 0,
timeSlots: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
events: [],
editModeEvent: null,
clipboardEvent: null,
showContextMenu: false,
contextMenuStyle: {},
pasteTargetTime: null,
isMobile: false,
touchStartTime: 0,
touchStartPosition: { x: 0, y: 0 },
longPressTimer: null,
longPressExecuted: false,
eventTouchOffset: { x: 0, y: 0 },
draggingEvent: null,
isDragComplete: false,
isResizeComplete: false,
dragStarted: false,
longPressEventData: null,
longPressEvent: null,
readyToMoveEventId: null,
showMapModal: false,
map: null,
selectedCoordinates: null,
mapMarker: null,
eventForm: {
title: '',
dayIndex: 0,
startTime: '09:00',
endTime: '10:00',
category: 'travel',
description: '',
coordinates: ''
},
modals: [],
eventLayerOrder: [],
baseZIndex: 10,
maxZIndex: 10,
weatherCache: {},
weatherCacheExpiry: 6 * 60 * 60 * 1000,
showWeatherPopup: false,
weatherPopupUrl: '',
showSettingsModal: false,
showConflictModal: false,
gistSync: {
isEnabled: false,
gistId: null,
lastSyncTime: null,
lastReadTime: null,
isSyncing: false,
isLoading: false,
hasError: false
},
syncForm: {
token: '',
gistId: ''
}
};
},
methods: {
linkifyUrls(text) {
if (!text) return text;
const urlRegex = /(https?:\/\/[^\s]+)/g;
return text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
},
checkExistingData() {
this.hasExistingData = !!(localStorage.getItem('trippenEvents') && localStorage.getItem('trippenDays'));
},
loadExistingData() {
this.loadData();
if (this.tripDays.length > 0) this.tripInitialized = true;
},
initializeTripDays() {
if (!this.tripStartDate || !this.tripEndDate || this.tripStartDate > this.tripEndDate) {
alert('正しい日付を選択してください');
return;
}
this.tripDays = this.generateTripDays(this.tripStartDate, this.tripEndDate);
this.activeDay = 0;
this.tripInitialized = true;
this.saveData();
},
generateTripDays(startDate, endDate) {
const days = [];
const start = new Date(startDate);
const end = new Date(endDate);
const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
let dayNumber = 1;
for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
days.push({
id: Date.now() + dayNumber + Math.random(),
dayNumber: dayNumber++,
date: `${date.getMonth() + 1}/${date.getDate()}(${dayNames[date.getDay()]})`,
fullDate: date.toISOString().split('T')[0]
});
}
return days;
},
setActiveDay(index) { this.activeDay = index; },
detectMobile() { this.isMobile = window.innerWidth <= 768 || 'ontouchstart' in window; },
addDayImmediately() {
const startDate = this.tripDays[0].fullDate;
this.tripDays = this.generateConsecutiveDays(startDate, this.tripDays.length + 1);
this.saveData();
},
deleteDay(index) {
if (this.tripDays.length <= 1) {
alert('最低1つの日程は必要です');
return;
}
if (confirm(`${this.tripDays[index].dayNumber}日目を削除しますか？`)) {
this.events = this.events.filter(event => event.dayIndex !== index)
.map(event => event.dayIndex > index ? { ...event, dayIndex: event.dayIndex - 1 } : event);
this.tripDays = this.generateConsecutiveDays(this.tripDays[0].fullDate, this.tripDays.length - 1);
if (this.activeDay >= this.tripDays.length) this.activeDay = this.tripDays.length - 1;
this.saveData();
}
},
generateConsecutiveDays(startDate, dayCount) {
const days = [];
const start = new Date(startDate);
const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
for (let i = 0; i < dayCount; i++) {
const date = new Date(start);
date.setDate(start.getDate() + i);
days.push({
id: Date.now() + i + Math.random(),
dayNumber: i + 1,
date: `${date.getMonth() + 1}/${date.getDate()}(${dayNames[date.getDay()]})`,
fullDate: date.toISOString().split('T')[0]
});
}
return days;
},
handleDateClick(index) {
if (index === 0) this.openStartDateModal();
else this.setActiveDay(index);
},
getCurrentDayEvents() {
return this.events
.filter(event => event.dayIndex === this.activeDay)
.map(event => {
const inlineText = `${event.title}（${event.startTime}-${event.endTime}）`;
return {
...event,
inlineText
};
});
},
checkEventOverlap(eventA, eventB) {
if (eventA.dayIndex !== eventB.dayIndex) return false;
  
const startA = this.timeToMinutes(eventA.startTime);
const endA = this.timeToMinutes(eventA.endTime);
const startB = this.timeToMinutes(eventB.startTime);
const endB = this.timeToMinutes(eventB.endTime);
  
return !(endA <= startB || endB <= startA);
},
getOverlappingEvents(targetEvent) {
return this.events.filter(event => 
event.id !== targetEvent.id && 
this.checkEventOverlap(targetEvent, event)
);
},
updateEventZIndex(eventId) {
const targetEvent = this.events.find(e => e.id === eventId);
if (!targetEvent) return;
  
const overlappingEvents = this.getOverlappingEvents(targetEvent);
  
if (overlappingEvents.length === 0) return;
  
this.eventLayerOrder = this.eventLayerOrder.filter(id => id !== eventId);
  
this.eventLayerOrder.push(eventId);
  
this.maxZIndex = Math.max(this.maxZIndex, this.baseZIndex + this.eventLayerOrder.length);
  
this.saveLayerOrder();
},
handleEventClick(event, eventData) {
if (this.isDragComplete) {
this.isDragComplete = false;
return;
}
if (this.isResizeComplete) {
this.isResizeComplete = false;
return;
}
if (this.draggingEvent) {
return;
}
if (this.editModeEvent && this.editModeEvent.id === eventData.id) {
return;
}
if (!event.target.closest('.event-action-btn') && 
!event.target.closest('.resize-handle') &&
!event.target.closest('.weather-emoji-top-left')) {
this.openDetailModal(eventData);
}
},
handleEventMouseDown(event, eventData) {
if (this.editModeEvent && this.editModeEvent.id === eventData.id) {
if (!event.target.closest('.event-action-btn') && 
!event.target.closest('.resize-handle')) {
event.preventDefault();
event.stopPropagation();
this.startEventDrag(event, eventData);
}
}
},
handleEventContextMenu(event, eventData) {
event.preventDefault();
event.stopPropagation();
this.editModeEvent = this.editModeEvent?.id === eventData.id ? null : eventData;
if (navigator.vibrate) navigator.vibrate(50);
},
startEventDrag(event, eventData) {
this.draggingEvent = eventData;
this.isDragComplete = false;
const startY = event.clientY;
const container = this.$refs.scrollContainer || this.$refs.mobileTimelineContainer;
const rect = container.getBoundingClientRect();
const timelineHeader = container.querySelector('.timeline-header');
const headerHeight = timelineHeader ? timelineHeader.offsetHeight : 0;
const centerOffset = (this.timeToPixels(eventData.endTime) - this.timeToPixels(eventData.startTime)) / 2;
const moveHandler = (e) => {
const newCenterTop = e.clientY - rect.top - headerHeight + container.scrollTop;
const newStartTop = newCenterTop - centerOffset;
const snappedTop = Math.round(newStartTop / 15) * 15;
this.updateEventTimeFromDrag(eventData, snappedTop);
};
const endHandler = () => {
document.removeEventListener('mousemove', moveHandler);
document.removeEventListener('mouseup', endHandler);
this.draggingEvent = null;
this.isDragComplete = true;

this.updateEventZIndex(eventData.id);

this.saveData();
setTimeout(() => {
this.isDragComplete = false;
}, 150);
};
document.addEventListener('mousemove', moveHandler);
document.addEventListener('mouseup', endHandler);
},
startEventDragTouch(event, eventData) {
this.draggingEvent = eventData;
this.isDragComplete = false;
const coords = event.touches[0];
const container = this.$refs.mobileTimelineContainer;
const rect = container.getBoundingClientRect();
const timelineHeader = container.querySelector('.timeline-header');
const headerHeight = timelineHeader ? timelineHeader.offsetHeight : 0;
const centerOffset = (this.timeToPixels(eventData.endTime) - this.timeToPixels(eventData.startTime)) / 2;
const moveHandler = (e) => {
e.preventDefault();
const touch = e.touches[0];
const newCenterTop = touch.clientY - rect.top - headerHeight + container.scrollTop;
const newStartTop = newCenterTop - centerOffset;
const snappedTop = Math.round(newStartTop / 15) * 15;
this.updateEventTimeFromDrag(eventData, snappedTop);
};
const endHandler = () => {
document.removeEventListener('touchmove', moveHandler);
document.removeEventListener('touchend', endHandler);
this.draggingEvent = null;
this.isDragComplete = true;

this.updateEventZIndex(eventData.id);

this.saveData();
setTimeout(() => {
this.isDragComplete = false;
}, 150);
};
document.addEventListener('touchmove', moveHandler, { passive: false });
document.addEventListener('touchend', endHandler, { passive: true });
},
updateEventTimeFromDrag(eventData, snappedTop) {
const minTime = '04:00';
const maxTime = '24:00';
const eventIndex = this.events.findIndex(ev => ev.id === eventData.id);
if (eventIndex === -1) return;
  
const currentDuration = this.timeToMinutes(this.events[eventIndex].endTime) - this.timeToMinutes(this.events[eventIndex].startTime);
const newTime = this.pixelsToTime(snappedTop);
const newEndTime = this.minutesToTime(this.timeToMinutes(newTime) + currentDuration);
  
if (newTime < minTime) {
this.events[eventIndex].startTime = minTime;
this.events[eventIndex].endTime = this.minutesToTime(this.timeToMinutes(minTime) + currentDuration);
return;
}
  
if (newEndTime > maxTime) {
this.events[eventIndex].endTime = maxTime;
this.events[eventIndex].startTime = this.minutesToTime(this.timeToMinutes(maxTime) - currentDuration);
return;
}
  
this.events[eventIndex].startTime = newTime;
this.events[eventIndex].endTime = newEndTime;
},
handleMobileDayTouchStart(event, index) {
this.touchStartTime = Date.now();
this.longPressTimer = setTimeout(() => {
if (navigator.vibrate) navigator.vibrate(50);
this.showMobilePopupForDay(index);
}, 800);
},
handleMobileDayTouchEnd(event, index) {
if (this.longPressTimer) {
clearTimeout(this.longPressTimer);
this.longPressTimer = null;
}
if (Date.now() - this.touchStartTime < 500) this.setActiveDay(index);
},
showMobilePopupForDay(index) {
this.selectedDayForPopup = this.tripDays[index];
this.selectedDayIndex = index;
this.showMobilePopup = true;
},
closeMobilePopup() {
this.showMobilePopup = false;
this.selectedDayForPopup = null;
this.selectedDayIndex = null;
},
openStartDateModalFromPopup() {
this.closeMobilePopup();
setTimeout(() => this.openStartDateModal(), 300);
},
addDayFromPopup() {
this.closeMobilePopup();
setTimeout(() => this.addDayImmediately(), 300);
},
deleteDayFromPopup() {
const index = this.selectedDayIndex;
this.closeMobilePopup();
setTimeout(() => index !== null && this.deleteDay(index), 300);
},
updateScrollPosition() {
const container = this.$refs.mobileScrollContainer;
if (!container) return;
this.scrollPosition = container.scrollLeft;
this.maxScrollPosition = container.scrollWidth - container.clientWidth;
},
scrollToDirection(direction) {
const container = this.$refs.mobileScrollContainer;
if (!container) return;
container.scrollBy({ left: direction === 'left' ? -120 : 120, behavior: 'smooth' });
},
handleEventTouchStart(event, eventData) {
if (this.isDragComplete) {
return;
}
if (this.draggingEvent) {
return;
}
if (this.editModeEvent && this.editModeEvent.id === eventData.id) {
if (!event.target.closest('.event-action-btn') && 
!event.target.closest('.resize-handle')) {
event.preventDefault();
event.stopPropagation();
this.startEventDragTouch(event, eventData);
}
} else {
if (!event.target.closest('.event-action-btn') && 
!event.target.closest('.resize-handle') &&
!event.target.closest('.weather-emoji-top-left')) {
event.preventDefault();
event.stopPropagation();
this.touchStartTime = Date.now();
this.longPressExecuted = false;
this.dragStarted = false;
this.longPressEventData = eventData;
this.longPressEvent = event;
this.readyToMoveEventId = null;
this.touchStartPosition = { 
x: event.touches[0].clientX, 
y: event.touches[0].clientY 
};
this.longPressTimer = setTimeout(() => {
this.longPressExecuted = true;
this.readyToMoveEventId = eventData.id;
if (navigator.vibrate) navigator.vibrate(50);
}, 500);
const handleTouchMove = (e) => {
if (!this.longPressExecuted) return;
const deltaX = Math.abs(e.touches[0].clientX - this.touchStartPosition.x);
const deltaY = Math.abs(e.touches[0].clientY - this.touchStartPosition.y);
if ((deltaX > 5 || deltaY > 5) && !this.dragStarted) {
this.dragStarted = true;
this.editModeEvent = eventData;
this.readyToMoveEventId = null;
this.startEventDragTouch(this.longPressEvent, eventData);
}
};
const handleTouchEnd = () => {
if (this.longPressTimer) {
clearTimeout(this.longPressTimer);
this.longPressTimer = null;
}
const touchDuration = Date.now() - this.touchStartTime;
if (this.longPressExecuted && !this.dragStarted) {
this.editModeEvent = eventData;
this.readyToMoveEventId = null;
} else if (!this.longPressExecuted && touchDuration < 500) {
this.openDetailModal(eventData);
}
this.dragStarted = false;
this.longPressEventData = null;
this.longPressEvent = null;
this.readyToMoveEventId = null;
document.removeEventListener('touchmove', handleTouchMove);
document.removeEventListener('touchend', handleTouchEnd);
};
document.addEventListener('touchmove', handleTouchMove, { passive: false });
document.addEventListener('touchend', handleTouchEnd, { passive: true });
}
}
},
handleCutButtonClick(event, eventData) {
event.preventDefault();
event.stopPropagation();
this.cutEvent(eventData);
},
cutEvent(event) {
try {
this.clipboardEvent = { ...event };
const eventIndex = this.events.findIndex(e => e.id === event.id);
if (eventIndex !== -1) {
this.events.splice(eventIndex, 1);
this.editModeEvent = null;
this.saveData();
if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
}
} catch (error) {
console.error('予定の切り取り中にエラーが発生しました:', error);
alert('予定の切り取りに失敗しました。');
}
},
pasteFromContext() {
if (!this.clipboardEvent) return;
const newEvent = {
...this.clipboardEvent,
id: Date.now() + Math.random(),
dayIndex: this.activeDay
};
if (this.pasteTargetTime) {
const duration = this.timeToMinutes(this.clipboardEvent.endTime) - this.timeToMinutes(this.clipboardEvent.startTime);
const startMinutes = this.timeToMinutes(this.pasteTargetTime);
let endMinutes = startMinutes + duration;
if (endMinutes > 1440) {
endMinutes = 1440;
}
newEvent.startTime = this.pasteTargetTime;
newEvent.endTime = this.minutesToTime(endMinutes);
}
this.events.push(newEvent);
this.clipboardEvent = null;
this.hideContextMenu();
this.saveData();
},
addEventFromContext() {
if (!this.pasteTargetTime) return;
const startMinutes = this.timeToMinutes(this.pasteTargetTime);
const endTime = this.minutesToTime(startMinutes + 60);
this.eventForm = {
title: '',
dayIndex: this.activeDay,
startTime: this.pasteTargetTime,
endTime: endTime,
category: 'travel',
description: '',
coordinates: ''
};
this.hideContextMenu();
setTimeout(() => {
this.openEventModal(null, true);
}, 100);
},
timeToMinutes(timeString) {
const [hours, minutes] = timeString.split(':').map(Number);
return hours * 60 + minutes;
},
minutesToTime(minutes) {
const hours = Math.floor(minutes / 60);
const mins = minutes % 60;
return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
},
timeToPixels(timeString) {
const [hours, minutes] = timeString.split(':').map(Number);
const totalMinutes = (hours - 4) * 60 + minutes;
return totalMinutes * (this.isMobile ? 50/60 : 1);
},
pixelsToTime(pixels) {
const totalMinutes = pixels / (this.isMobile ? 50/60 : 1);
const roundedMinutes = Math.round(totalMinutes / 15) * 15;
const hours = Math.max(4, Math.min(24, Math.floor(roundedMinutes / 60) + 4));
const minutes = hours === 24 ? 0 : roundedMinutes % 60;
return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
},
handleScheduleContextMenu(event) {
if (!this.isMobile) {
event.preventDefault();
this.showContextMenuAt(event.clientX, event.clientY, event);
}
},
showContextMenuAt(x, y, event) {
const container = this.isMobile ? this.$refs.mobileTimelineContainer : this.$refs.scrollContainer;
const timelineHeader = container.querySelector('.timeline-header');
const scheduleArea = container.querySelector('.schedule-area');
if (!scheduleArea) {
const containerRect = container.getBoundingClientRect();
this.pasteTargetTime = this.pixelsToTime(y - containerRect.top + container.scrollTop);
} else {
const containerRect = container.getBoundingClientRect();
const scheduleAreaRect = scheduleArea.getBoundingClientRect();
const headerHeight = timelineHeader ? timelineHeader.offsetHeight : 0;
const relativeY = y - containerRect.top - headerHeight + container.scrollTop;
const snappedY = Math.round(relativeY / 15) * 15;
this.pasteTargetTime = this.pixelsToTime(Math.max(0, snappedY));
}
this.contextMenuStyle = { left: `${x}px`, top: `${y}px` };
this.showContextMenu = true;
setTimeout(() => {
document.addEventListener('click', this.hideContextMenu, { once: true });
}, 100);
},
hideContextMenu() { this.showContextMenu = false; },
handleScheduleTouchStart(event) {
if (!this.isMobile) return;
if (event.target.closest('.event-block')) {
return;
}
this.touchStartTime = Date.now();
this.touchStartPosition = { x: event.touches[0].clientX, y: event.touches[0].clientY };
this.longPressTimer = setTimeout(() => {
this.showContextMenuAt(this.touchStartPosition.x, this.touchStartPosition.y, event);
if (navigator.vibrate) navigator.vibrate(50);
}, 500);
},
handleScheduleTouchMove(event) {
if (!this.isMobile) return;
if (event.target.closest('.event-block')) {
return;
}
const deltaX = Math.abs(event.touches[0].clientX - this.touchStartPosition.x);
const deltaY = Math.abs(event.touches[0].clientY - this.touchStartPosition.y);
if (deltaX > 10 || deltaY > 10) this.clearLongPress();
},
handleScheduleTouchEnd(event) {
if (!this.isMobile) return;
if (event.target.closest('.event-block')) {
return;
}
this.clearLongPress();
if (Date.now() - this.touchStartTime < 300) this.editModeEvent = null;
},
clearLongPress() {
if (this.longPressTimer) {
clearTimeout(this.longPressTimer);
this.longPressTimer = null;
}
},
startResize(event, eventData, direction) {
this.startResizeHandler(event, direction, 'mouse');
},
startResizeTouch(event, eventData, direction) {
this.startResizeHandler(event, direction, 'touch');
},
startResizeHandler(event, direction, type) {
event.preventDefault();
event.stopPropagation();
const moveEvent = type === 'touch' ? 'touchmove' : 'mousemove';
const endEvent = type === 'touch' ? 'touchend' : 'mouseup';
const moveHandler = (e) => {
const coords = type === 'touch' ? e.touches[0] : e;
const container = this.isMobile ? this.$refs.mobileTimelineContainer : this.$refs.scrollContainer;
const rect = container.getBoundingClientRect();
const timelineHeader = container.querySelector('.timeline-header');
const headerHeight = timelineHeader ? timelineHeader.offsetHeight : 0;
const y = coords.clientY - rect.top - headerHeight + container.scrollTop;
const snappedY = Math.round(y / 15) * 15;
const newTime = this.pixelsToTime(snappedY);
const eventIndex = this.events.findIndex(ev => ev.id === this.editModeEvent.id);
if (eventIndex === -1) return;
if (direction === 'top' && newTime < this.events[eventIndex].endTime) {
this.events[eventIndex].startTime = newTime;
} else if (direction === 'bottom' && newTime > this.events[eventIndex].startTime) {
this.events[eventIndex].endTime = newTime;
}
};
const endHandler = () => {
document.removeEventListener(moveEvent, moveHandler);
document.removeEventListener(endEvent, endHandler);
this.isResizeComplete = true;
this.saveData();
setTimeout(() => {
this.isResizeComplete = false;
}, 150);
};
document.addEventListener(moveEvent, moveHandler, { passive: false });
document.addEventListener(endEvent, endHandler);
},
getEventStyle(event) {
const startPixels = this.timeToPixels(event.startTime);
const endPixels = this.timeToPixels(event.endTime);
const duration = Math.max(endPixels - startPixels, this.isMobile ? 25 : 30);

let zIndex = this.baseZIndex;
const layerIndex = this.eventLayerOrder.indexOf(event.id);
if (layerIndex !== -1) {
zIndex = this.baseZIndex + layerIndex + 1;
}

return {
top: `${startPixels}px`,
height: `${duration}px`,
minHeight: this.isMobile ? '32px' : '35px',
zIndex: zIndex
};
},
getCategoryIcon(category) {
const icons = {
travel: 'fas fa-car',
food: 'fas fa-utensils',
sightseeing: 'fas fa-camera',
accommodation: 'fas fa-bed',
custom: 'fas fa-star'
};
return icons[category] || 'fas fa-calendar';
},

async fetchWeatherForEvent(event) {
if (!event.coordinates) return null;

try {
const [lat, lng] = event.coordinates.split(',').map(Number);
if (isNaN(lat) || isNaN(lng)) return null;

const cacheKey = `${lat},${lng}_${event.dayIndex}`;
const cachedWeather = this.weatherCache[cacheKey];

if (cachedWeather && Date.now() - cachedWeather.timestamp < this.weatherCacheExpiry) {
return cachedWeather.data;
}

const dayData = this.tripDays[event.dayIndex];
if (!dayData) return null;

const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode&timezone=auto&start_date=${dayData.fullDate}&end_date=${dayData.fullDate}`;

const response = await fetch(url);
if (!response.ok) throw new Error('Weather API request failed');

const data = await response.json();
const weatherCode = data.daily.weathercode[0];

this.weatherCache[cacheKey] = {
data: weatherCode,
timestamp: Date.now()
};

return weatherCode;
} catch (error) {
console.error('天気予報の取得に失敗しました:', error);
return null;
}
},

getWeatherEmoji(weatherCode) {
if (weatherCode === null || weatherCode === undefined) return '';

const weatherMap = {
0: '☀️',    // 晴れ
1: '🌤️',   // 主に晴れ
2: '⛅',    // 部分的に曇り
3: '☁️',    // 曇り
45: '🌫️',  // 霧
48: '🌫️',  // 霧氷
51: '🌦️',  // 軽い霧雨
53: '🌦️',  // 中程度の霧雨
55: '🌧️',  // 激しい霧雨
56: '🌧️',  // 軽い氷雨
57: '🌧️',  // 激しい氷雨
61: '🌧️',  // 軽い雨
63: '🌧️',  // 中程度の雨
65: '🌧️',  // 激しい雨
66: '🌧️',  // 軽い氷雨
67: '🌧️',  // 激しい氷雨
71: '🌨️',  // 軽い雪
73: '🌨️',  // 中程度の雪
75: '🌨️',  // 激しい雪
77: '🌨️',  // 雪の粒
80: '🌦️',  // 軽いにわか雨
81: '🌦️',  // 中程度のにわか雨
82: '🌧️',  // 激しいにわか雨
85: '🌨️',  // 軽いにわか雪
86: '🌨️',  // 激しいにわか雪
95: '⛈️',  // 雷雨
96: '⛈️',  // 軽い雹を伴う雷雨
99: '⛈️'   // 激しい雹を伴う雷雨
};

return weatherMap[weatherCode] || '';
},

async loadWeatherForAllEvents() {
const promises = this.events
.filter(event => event.coordinates)
.map(event => this.fetchWeatherForEvent(event));

await Promise.all(promises);
},

getEventWeatherEmoji(event) {
if (!event.coordinates) return '';

const cacheKey = `${event.coordinates}_${event.dayIndex}`;
const cachedWeather = this.weatherCache[cacheKey];

if (cachedWeather && Date.now() - cachedWeather.timestamp < this.weatherCacheExpiry) {
return this.getWeatherEmoji(cachedWeather.data);
}

return '';
},

setLocationFromMap() {
this.showMapModal = true;
this.$nextTick(() => {
this.initializeMap();
});
},

initializeMap() {
const initialLat = 34.7024;
const initialLng = 135.4959;

this.map = L.map('map').setView([initialLat, initialLng], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
attribution: '© OpenStreetMap contributors'
}).addTo(this.map);

this.map.on('click', (e) => {
this.handleMapClick(e);
});
},

handleMapClick(e) {
const lat = e.latlng.lat.toFixed(6);
const lng = e.latlng.lng.toFixed(6);
this.selectedCoordinates = `${lat},${lng}`;

if (this.mapMarker) {
this.map.removeLayer(this.mapMarker);
}

this.mapMarker = L.marker([lat, lng]).addTo(this.map);

const coordinatesInput = document.getElementById('eventCoordinates');
if (coordinatesInput) {
coordinatesInput.value = this.selectedCoordinates;
}

if (navigator.vibrate) navigator.vibrate(100);

this.closeMapModal();
},

closeMapModal() {
this.showMapModal = false;
if (this.map) {
this.map.remove();
this.map = null;
}
this.mapMarker = null;
},

copyCoordinates() {
const coordinatesInput = document.getElementById('eventCoordinates');
if (!coordinatesInput || !coordinatesInput.value.trim()) {
alert('コピーする緯度経度がありません');
return;
}

const coordinates = coordinatesInput.value.trim();

try {
navigator.clipboard.writeText(coordinates).then(() => {
alert('緯度経度をクリップボードにコピーしました');
if (navigator.vibrate) navigator.vibrate(100);
}).catch(() => {
coordinatesInput.select();
document.execCommand('copy');
alert('緯度経度をクリップボードにコピーしました');
if (navigator.vibrate) navigator.vibrate(100);
});
} catch (error) {
console.error('コピーに失敗しました:', error);
alert('コピーに失敗しました');
}
},

openGoogleMap(coordinates) {
if (!coordinates || !coordinates.trim()) {
alert('緯度経度が設定されていません');
return;
}

const coords = coordinates.trim();
const googleMapsUrl = `https://maps.google.co.jp/maps?ll=${coords}&z=15`;

try {
if (this.isMobile) {
window.location.href = googleMapsUrl;
} else {
window.open(googleMapsUrl, '_blank', 'noopener,noreferrer');
}
} catch (error) {
console.error('Googleマップの表示中にエラーが発生しました:', error);
alert('Googleマップの表示に失敗しました');
}
},

openDetailModal(event) {
const eventData = typeof event === 'string' ? this.events.find(e => String(e.id) === String(event)) : event;
if (!eventData) {
console.error('openDetailModal: 予定データが見つかりません:', event);
alert('予定データが見つかりません');
return;
}
const safeEventId = String(eventData.id).replace(/'/g, "\\'");
const safeTitle = String(eventData.title).replace(/'/g, "\\'").replace(/"/g, "&quot;");
const safeCoordinates = String(eventData.coordinates || '').replace(/"/g, "&quot;");
this.openModal('詳細', `
<div class="mb-3"><h6><i class="${this.getCategoryIcon(eventData.category)}"></i> ${safeTitle}</h6></div>
<div class="mb-3"><strong>日付:</strong> ${this.tripDays[eventData.dayIndex]?.date || '不明'}</div>
<div class="mb-3"><strong>時間:</strong> ${eventData.startTime} - ${eventData.endTime}</div>
${eventData.coordinates ? `<div class="mb-3"><strong>緯度経度:</strong> ${safeCoordinates} <button type="button" class="btn btn-outline-primary btn-sm ms-2" onclick="window.app.openGoogleMap('${safeCoordinates}')" title="Googleマップで表示">🗾</button></div>` : ''}
${eventData.description ? `<div class="mb-3"><strong>詳細:</strong><br>${this.linkifyUrls(String(eventData.description).replace(/"/g, "&quot;"))}</div>` : ''}
`, `
<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">閉じる</button>
<button type="button" class="btn btn-danger" onclick="window.app.deleteEventFromDetail('${safeEventId}')">削除</button>
<button type="button" class="btn btn-primary" onclick="window.app.editEventFromDetail('${safeEventId}')">編集</button>
`);
},

deleteEventFromDetail(eventId) {
try {
if (!confirm('この予定を削除しますか？')) {
return;
}
const eventIndex = this.events.findIndex(e => String(e.id) === String(eventId));
if (eventIndex === -1) {
alert('予定が見つかりません。ページを再読み込みしてお試しください。');
return;
}
this.events.splice(eventIndex, 1);
this.saveData();
this.editModeEvent = null;
this.closeAllModals();
if (navigator.vibrate) navigator.vibrate(100);
} catch (error) {
console.error('予定の削除中にエラーが発生しました:', error);
alert('予定の削除に失敗しました。もう一度お試しください。');
}
},

editEventFromDetail(eventId) {
try {
const event = this.events.find(e => String(e.id) === String(eventId));
if (!event) {
alert('予定が見つかりません。ページを再読み込みしてお試しください。');
return;
}
this.closeAllModals();
setTimeout(() => {
this.openEventModal(event);
}, 100);
} catch (error) {
console.error('予定の編集準備中にエラーが発生しました:', error);
alert('予定の編集準備に失敗しました。もう一度お試しください。');
}
},

openEventModal(event = null, fromContextMenu = false) {
    const isEdit = !!event;
    if (isEdit) {
        this.eventForm = { ...event };
    } else if (!fromContextMenu) {
        this.eventForm = {
            title: '',
            dayIndex: this.activeDay,
            startTime: '09:00',
            endTime: '10:00',
            category: 'travel',
            description: '',
            coordinates: ''
        };
    }

const modalTitle = isEdit ? '予定を編集' : '新しい予定を追加';
const modalBody = this.generateEventModalBody();
const modalFooter = this.generateEventModalFooter(isEdit);

this.openModal(modalTitle, modalBody, modalFooter);
},
generateEventModalBody() {
return `
<div class="mb-3">
<label for="eventTitle" class="form-label">予定タイトル</label>
<input type="text" class="form-control" id="eventTitle" value="${this.eventForm.title.replace(/"/g, '&quot;')}" placeholder="予定のタイトルを入力">
</div>
<div class="mb-3">
<label for="eventDay" class="form-label">日程</label>
<select class="form-select" id="eventDay">
${this.tripDays.map((day, index) => 
`<option value="${index}" ${this.eventForm.dayIndex === index ? 'selected' : ''}>${day.dayNumber}日目 (${day.date})</option>`
).join('')}
</select>
</div>
<div class="row">
<div class="col-md-6">
<div class="mb-3">
<label for="eventStartTime" class="form-label">開始時間</label>
<input type="time" class="form-control" id="eventStartTime" value="${this.eventForm.startTime}" min="04:00" max="23:59">
</div>
</div>
<div class="col-md-6">
<div class="mb-3">
<label for="eventEndTime" class="form-label">終了時間</label>
<input type="time" class="form-control" id="eventEndTime" value="${this.eventForm.endTime}" min="04:00" max="24:00">
</div>
</div>
</div>
<div class="mb-3">
<label for="eventCategory" class="form-label">カテゴリー</label>
<select class="form-select" id="eventCategory">
<option value="travel" ${this.eventForm.category === 'travel' ? 'selected' : ''}>🚗 移動</option>
<option value="food" ${this.eventForm.category === 'food' ? 'selected' : ''}>🍽️ 食事</option>
<option value="sightseeing" ${this.eventForm.category === 'sightseeing' ? 'selected' : ''}>📸 観光</option>
<option value="accommodation" ${this.eventForm.category === 'accommodation' ? 'selected' : ''}>🏨 宿泊</option>
<option value="custom" ${this.eventForm.category === 'custom' ? 'selected' : ''}>⭐ その他</option>
</select>
</div>
<div class="mb-3">
<label for="eventCoordinates" class="form-label">緯度経度 (オプション)</label>
<div class="input-group">
<input type="text" class="form-control" id="eventCoordinates" value="${this.eventForm.coordinates.replace(/"/g, '&quot;')}" placeholder="例: 34.702485,135.495951">
<button class="btn btn-outline-secondary" type="button" onclick="window.app.setLocationFromMap()" title="地図から選択">🗾</button>
<button class="btn btn-outline-secondary" type="button" onclick="window.app.copyCoordinates()" title="コピー">📋</button>
</div>
<div class="form-text">地図から位置を選択するか、緯度,経度の形式で入力してください</div>
</div>
<div class="mb-3">
<label for="eventDescription" class="form-label">詳細 (オプション)</label>
<textarea class="form-control" id="eventDescription" rows="3" placeholder="予定の詳細を入力">${this.eventForm.description.replace(/"/g, '&quot;')}</textarea>
</div>
`;
},

generateEventModalFooter(isEdit) {
return `
<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">キャンセル</button>
<button type="button" class="btn btn-primary" onclick="window.app.saveEvent(${isEdit})">${isEdit ? '更新' : '追加'}</button>
`;
},

saveEvent(isEdit) {
const title = document.getElementById('eventTitle').value.trim();
const dayIndex = parseInt(document.getElementById('eventDay').value);
const startTime = document.getElementById('eventStartTime').value;
const endTime = document.getElementById('eventEndTime').value;
const category = document.getElementById('eventCategory').value;
const coordinates = document.getElementById('eventCoordinates').value.trim();
const description = document.getElementById('eventDescription').value.trim();

if (!title) {
alert('予定タイトルを入力してください');
return;
}

if (!startTime || !endTime) {
alert('開始時間と終了時間を選択してください');
return;
}

if (startTime >= endTime) {
alert('終了時間は開始時間より後に設定してください');
return;
}

if (coordinates && !this.validateCoordinates(coordinates)) {
alert('緯度経度の形式が正しくありません。\n正しい形式：34.702485,135.495951');
return;
}

const eventData = {
title,
dayIndex,
startTime,
endTime,
category,
coordinates,
description
};

if (isEdit) {
const eventIndex = this.events.findIndex(e => e.id === this.eventForm.id);
if (eventIndex !== -1) {
this.events[eventIndex] = { ...this.events[eventIndex], ...eventData };
}
} else {
eventData.id = Date.now() + Math.random();
this.events.push(eventData);
}

this.saveData();
this.closeAllModals();
this.editModeEvent = null;

this.activeDay = dayIndex;

this.loadWeatherForAllEvents();

if (navigator.vibrate) navigator.vibrate(100);
},

validateCoordinates(coordinates) {
const coordPattern = /^-?\d+\.?\d*,-?\d+\.?\d*$/;
if (!coordPattern.test(coordinates)) return false;

const [lat, lng] = coordinates.split(',').map(Number);
return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
},

openModal(title, body, footer, size = '') {
const modalId = 'modal-' + Date.now();
const modal = {
id: modalId,
title,
body,
footer,
size
};

this.modals.push(modal);

this.$nextTick(() => {
const modalElement = document.getElementById(modalId);
if (modalElement) {
const bootstrapModal = new bootstrap.Modal(modalElement);
bootstrapModal.show();

modalElement.addEventListener('hidden.bs.modal', () => {
const index = this.modals.findIndex(m => m.id === modalId);
if (index !== -1) {
this.modals.splice(index, 1);
}
});
}
});
},

closeAllModals() {
this.modals.forEach(modal => {
const modalElement = document.getElementById(modal.id);
if (modalElement) {
const bootstrapModal = bootstrap.Modal.getInstance(modalElement);
if (bootstrapModal) {
bootstrapModal.hide();
}
}
});
this.modals = [];
},

openStartDateModal() {
this.openModal('開始日を変更', `
<div class="mb-3">
<label for="newStartDate" class="form-label">新しい開始日</label>
<input type="date" class="form-control" id="newStartDate" value="${this.tripDays[0].fullDate}" min="${this.today}">
</div>
<div class="alert alert-warning">
<i class="fas fa-exclamation-triangle"></i>
<strong>注意:</strong> 開始日を変更すると、既存の予定の日程も自動的に調整されます。
</div>
`, `
<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">キャンセル</button>
<button type="button" class="btn btn-primary" onclick="window.app.updateStartDate()">変更</button>
`);
},

updateStartDate() {
const newStartDate = document.getElementById('newStartDate').value;
if (!newStartDate) {
alert('新しい開始日を選択してください');
return;
}

if (newStartDate < this.today) {
alert('開始日は今日以降の日付を選択してください');
return;
}

if (confirm('開始日を変更しますか？既存の予定も日程が調整されます。')) {
this.tripDays = this.generateConsecutiveDays(newStartDate, this.tripDays.length);
this.saveData();
this.closeAllModals();
this.loadWeatherForAllEvents();
if (navigator.vibrate) navigator.vibrate(100);
}
},

openWeatherPopup(event) {
    if (!event.coordinates) {
        alert('この予定には位置情報が設定されていません。');
        return;
    }
    
    try {
        const [lat, lng] = event.coordinates.split(',');
        const dayData = this.tripDays[event.dayIndex];
        if (!dayData) {
            throw new Error('該当日程データが見つかりません。');
        }
        const date = dayData.fullDate.replace(/-/g, '');
        const hour = event.startTime.split(':')[0].padStart(2, '0');
        const datetime = `${date}${hour}00`;
        
        this.weatherPopupUrl = `https://nokonokotubotubo.github.io/fukunavi/?lat=${lat.trim()}&lng=${lng.trim()}&datetime=${datetime}`;
        this.showWeatherPopup = true;

    } catch (error) {
        console.error('天気予報ポップアップのURL生成中にエラーが発生しました:', error);
        alert('天気予報ポップアップの表示に失敗しました。');
    }
},
closeWeatherPopup() {
    this.showWeatherPopup = false;
    this.weatherPopupUrl = '';
},

openSettingsModal() {
this.showSettingsModal = true;
},

closeSettingsModal() {
this.showSettingsModal = false;
},

// 【改良】GitHub同期設定（変更フラグ管理版）
async saveGitHubSync() {
const token = this.syncForm.token.trim();
const gistId = this.syncForm.gistId.trim();

if (!token) {
alert('GitHub Personal Access Tokenを入力してください');
return;
}

try {
console.log('GitHub同期初期化開始（変更フラグ管理版）');
TrippenGistSync.init(token, gistId || null);

this.gistSync = {
isEnabled: TrippenGistSync.isEnabled,
gistId: TrippenGistSync.gistId,
lastSyncTime: TrippenGistSync.lastSyncTime,
lastReadTime: TrippenGistSync.lastReadTime,
isSyncing: false,
isLoading: false,
hasError: false
};

console.log('Vue.js状態更新完了:', this.gistSync);

const syncResult = await TrippenGistSync.manualWriteToCloud();

if (syncResult) {
this.gistSync.gistId = TrippenGistSync.gistId;
this.gistSync.lastSyncTime = TrippenGistSync.lastSyncTime;

this.syncForm = { token: '', gistId: '' };
alert('GitHub同期を開始しました（変更フラグ管理版）\nGist ID: ' + TrippenGistSync.gistId);
console.log('GitHub同期設定完了');
} else {
throw new Error('初回書き込みに失敗しました');
}
} catch (error) {
console.error('GitHub同期設定エラー:', error);
this.gistSync.hasError = true;
alert('設定に失敗しました: ' + error.message);
}
},

// 【修正】手動書き込み（Vue.js側）
async manualSync() {
if (!TrippenGistSync.isEnabled) {
alert('GitHub同期が設定されていません');
return;
}

this.gistSync.isSyncing = true;

try {
console.log('手動書き込み開始');
const result = await TrippenGistSync.manualWriteToCloud();
if (result) {
this.gistSync.lastSyncTime = TrippenGistSync.lastSyncTime;
this.gistSync.hasError = false;
alert('手動書き込みが完了しました');
console.log('手動書き込み完了');
} else {
throw new Error('書き込みに失敗しました');
}
} catch (error) {
console.error('手動書き込みエラー:', error);
this.gistSync.hasError = true;
alert('書き込みに失敗しました: ' + error.message);
} finally {
this.gistSync.isSyncing = false;
}
},

async loadFromCloud() {
console.log('Vue.js側 loadFromCloud() 開始');
console.log('現在のVue.js状態:', this.gistSync);

if (!TrippenGistSync.isEnabled || !TrippenGistSync.token) {
console.error('TrippenGistSync無効:', {
isEnabled: TrippenGistSync.isEnabled,
hasToken: !!TrippenGistSync.token
});
alert('GitHub同期が設定されていません。設定画面で設定してください。');
return;
}

if (!TrippenGistSync.gistId) {
console.error('GistID未設定');
alert('Gist IDが設定されていません。最初にデータを書き込むか、既存のGist IDを設定してください。');
return;
}

this.gistSync.isLoading = true;

try {
console.log('TrippenGistSync.loadFromCloud() 呼び出し');
const cloudData = await TrippenGistSync.loadFromCloud();

console.log('クラウドデータ取得結果:', cloudData);

if (!cloudData || !cloudData.data) {
throw new Error('クラウドデータの形式が正しくありません');
}

if (cloudData.data.events) {
console.log('イベントデータ更新:', cloudData.data.events.length, '件');
this.events = [...cloudData.data.events];
localStorage.setItem('trippenEvents', JSON.stringify(this.events));
}

if (cloudData.data.days) {
console.log('日程データ更新:', cloudData.data.days.length, '日分');
this.tripDays = [...cloudData.data.days];
localStorage.setItem('trippenDays', JSON.stringify(this.tripDays));

this.$nextTick(() => {
this.tripInitialized = this.tripDays.length > 0;
console.log('tripInitialized更新:', this.tripInitialized);
});
}

if (cloudData.data.layerOrder) {
this.eventLayerOrder = [...cloudData.data.layerOrder];
localStorage.setItem('trippenLayerOrder', JSON.stringify(this.eventLayerOrder));
}

this.gistSync.lastReadTime = TrippenGistSync.lastReadTime;
this.gistSync.hasError = false;

const eventCount = cloudData.data.events ? cloudData.data.events.length : 0;
const dayCount = cloudData.data.days ? cloudData.data.days.length : 0;

alert(`クラウドからデータを読み込みました\n日程: ${dayCount}日分\n予定: ${eventCount}件`);

if (this.events.length > 0) {
this.loadWeatherForAllEvents();
}

console.log('読み込み処理完了');

} catch (error) {
console.error('読み込み処理エラー:', error);
this.gistSync.hasError = true;
alert(`読み込みに失敗しました\nエラー: ${error.message}`);
} finally {
this.gistSync.isLoading = false;
}
},

handleSyncConflict() {
console.log('競合検出 - モーダル表示');
this.showConflictModal = true;
},

closeConflictModal() {
this.showConflictModal = false;
},

async forceLoadFromCloud() {
this.closeConflictModal();
await this.loadFromCloud();
},

copyGistId() {
if (!this.gistSync.gistId) {
alert('コピーするGist IDがありません');
return;
}

try {
navigator.clipboard.writeText(this.gistSync.gistId).then(() => {
alert('Gist IDをクリップボードにコピーしました');
}).catch(() => {
const textArea = document.createElement('textarea');
textArea.value = this.gistSync.gistId;
document.body.appendChild(textArea);
textArea.select();
document.execCommand('copy');
document.body.removeChild(textArea);
alert('Gist IDをクリップボードにコピーしました');
});
} catch (error) {
console.error('コピーエラー:', error);
alert('コピーに失敗しました');
}
},

clearGitHubSync() {
if (!confirm('GitHub同期設定を解除しますか？')) {
return;
}

try {
TrippenGistSync.clear();
this.gistSync = {
isEnabled: false,
gistId: null,
lastSyncTime: null,
lastReadTime: null,
isSyncing: false,
isLoading: false,
hasError: false
};
this.syncForm = { token: '', gistId: '' };
alert('GitHub同期設定を解除しました');
} catch (error) {
console.error('設定解除エラー:', error);
alert('設定の解除に失敗しました');
}
},

formatSyncTime(isoString) {
if (!isoString) return '未実行';
try {
const date = new Date(isoString);
return date.toLocaleString('ja-JP');
} catch (error) {
return '日時不明';
}
},

saveLayerOrder() {
localStorage.setItem('trippenLayerOrder', JSON.stringify(this.eventLayerOrder));
localStorage.setItem('trippenMaxZIndex', this.maxZIndex.toString());
},

loadLayerOrder() {
const savedLayerOrder = localStorage.getItem('trippenLayerOrder');
const savedMaxZIndex = localStorage.getItem('trippenMaxZIndex');

if (savedLayerOrder) {
try {
this.eventLayerOrder = JSON.parse(savedLayerOrder);
} catch (e) {
console.error('レイヤー順序データの読み込みに失敗しました:', e);
this.eventLayerOrder = [];
}
}

if (savedMaxZIndex) {
this.maxZIndex = parseInt(savedMaxZIndex) || this.baseZIndex;
}
},

// 【改良】データ保存（変更フラグ管理版）
saveData() {
localStorage.setItem('trippenEvents', JSON.stringify(this.events));
localStorage.setItem('trippenDays', JSON.stringify(this.tripDays));
this.saveLayerOrder();

// 【新機能】変更フラグを設定
if (TrippenGistSync.isEnabled) {
TrippenGistSync.markChanged();
}
},

loadData() {
const savedEvents = localStorage.getItem('trippenEvents');
const savedDays = localStorage.getItem('trippenDays');

if (savedEvents) {
try {
this.events = JSON.parse(savedEvents);
} catch (e) {
console.error('予定データの読み込みに失敗しました:', e);
this.events = [];
}
}

if (savedDays) {
try {
this.tripDays = JSON.parse(savedDays);
} catch (e) {
console.error('日程データの読み込みに失敗しました:', e);
this.tripDays = [];
}
}

this.loadLayerOrder();
}
},
mounted() {
console.log('Vue.jsアプリ初期化開始（変更フラグ管理版・手動書き込みヘッダー移動版）');

this.detectMobile();
this.checkExistingData();
this.loadData();
if (this.tripDays.length > 0) {
this.tripInitialized = true;
this.loadWeatherForAllEvents();
}
window.addEventListener('resize', this.detectMobile);
window.app = this;

console.log('TrippenGistSync初期化開始');
const config = TrippenGistSync.loadConfig();
console.log('読み込まれた設定:', config);

if (config && TrippenGistSync.isEnabled) {
console.log('GitHub同期有効 - Vue.js状態同期開始');

this.gistSync = {
isEnabled: TrippenGistSync.isEnabled,
gistId: TrippenGistSync.gistId,
lastSyncTime: TrippenGistSync.lastSyncTime,
lastReadTime: TrippenGistSync.lastReadTime,
isSyncing: false,
isLoading: false,
hasError: false
};

console.log('Vue.js同期状態:', this.gistSync);

TrippenGistSync.startPeriodicSync();

if (TrippenGistSync.gistId) {
console.log('初回自動読み込み開始');
setTimeout(async () => {
try {
const cloudData = await TrippenGistSync.initialAutoLoad();
if (cloudData && cloudData.data) {
console.log('初回自動読み込みでデータを取得しました');
}
} catch (error) {
console.error('初回自動読み込みエラー:', error);
}
}, 3000);
}
} else {
console.log('GitHub同期無効');
}

console.log('Vue.jsアプリ初期化完了（変更フラグ管理版・手動書き込みヘッダー移動版）');
}
}).mount('#app');
