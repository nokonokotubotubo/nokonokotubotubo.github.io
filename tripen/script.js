const { createApp } = Vue;

// GitHub Gist同期システム（軽量化版）
const TrippenGistSync = {
    token: null, gistId: null, isEnabled: false, isSyncing: false,
    lastSyncTime: null, lastReadTime: null, periodicSyncInterval: null,
    hasError: false, hasChanged: false, lastDataHash: null,

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

    markChanged() { this.hasChanged = true; },
    resetChanged() { this.hasChanged = false; },

    _encrypt(text, key = 'trippen_secret_key') {
        if (!text) return '';
        try {
            return btoa(text.split('').map((char, i) => 
                String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length))
            ).join(''));
        } catch { throw new Error('暗号化処理に失敗しました'); }
    },

    _decrypt(encryptedText, key = 'trippen_secret_key') {
        if (!encryptedText) return '';
        try {
            const text = atob(encryptedText);
            return text.split('').map((char, i) => 
                String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length))
            ).join('');
        } catch { throw new Error('復号化に失敗しました'); }
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
                lastDataHash: config.lastDataHash || null
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
                return true;
            }
            return false;
        } catch {
            this.hasError = true;
            return false;
        }
    },

    async loadFromCloud() {
        if (!this.token || !this.gistId) 
            throw new Error(!this.token ? 'トークンが設定されていません' : 'Gist IDが設定されていません');
        
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
            if (!gist.files?.['trippen_data.json']) 
                throw new Error('Gistにtrippen_data.jsonファイルが見つかりません');
            
            const parsedData = JSON.parse(gist.files['trippen_data.json'].content);
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
                return cloudUpdatedAt > lastReadTime && cloudUpdatedAt > lastWriteTime;
            }
            return false;
        } catch { return false; }
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
        if (!this.isEnabled || !this.token) throw new Error('GitHub同期が設定されていません');
        
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
                lastDataHash: this.lastDataHash
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
        } catch {}
    },

    clear() {
        this.stopPeriodicSync();
        localStorage.removeItem('trippen_gist_config');
        Object.assign(this, {
            token: null, gistId: null, isEnabled: false,
            lastSyncTime: null, lastReadTime: null, hasError: false,
            hasChanged: false, lastDataHash: null
        });
    }
};

const app = createApp({
    data: () => ({
        tripInitialized: false, tripStartDate: '', tripEndDate: '',
        tripTitle: '', // 旅行タイトル
        today: new Date().toISOString().split('T')[0],
        hasExistingData: false, tripDays: [], activeDay: 0,
        showMobilePopup: false, selectedDayForPopup: null, selectedDayIndex: null,
        scrollPosition: 0, maxScrollPosition: 0,
        timeSlots: Array.from({length: 20}, (_, i) => i + 4),
        events: [], editModeEvent: null, clipboardEvent: null,
        showContextMenu: false, contextMenuStyle: {}, pasteTargetTime: null,
        isMobile: false, touchStartTime: 0, touchStartPosition: { x: 0, y: 0 },
        longPressTimer: null, longPressExecuted: false,
        eventTouchOffset: { x: 0, y: 0 }, draggingEvent: null,
        isDragComplete: false, isResizeComplete: false, dragStarted: false,
        longPressEventData: null, longPressEvent: null, readyToMoveEventId: null,
        showMapModal: false, map: null, selectedCoordinates: null, mapMarker: null,
        eventForm: { title: '', dayIndex: 0, startTime: '09:00', endTime: '10:00', category: 'travel', description: '', coordinates: '' },
        modals: [], eventLayerOrder: [], baseZIndex: 10, maxZIndex: 10,
        weatherCache: {}, weatherCacheExpiry: 21600000,
        showWeatherPopup: false, weatherPopupUrl: '',
        showSettingsModal: false, showConflictModal: false,
        gistSync: { isEnabled: false, gistId: null, lastSyncTime: null, lastReadTime: null, isSyncing: false, isLoading: false, hasError: false },
        syncForm: { token: '', gistId: '' },
        isDarkMode: false,
        logoSrc: 'tripen-day.svg'
    }),

    methods: {
        toggleTheme() {
            this.isDarkMode = !this.isDarkMode;
            this.applyTheme();
            localStorage.setItem('trippenTheme', this.isDarkMode ? 'dark' : 'light');
            this.updateLogoTheme();
        },

        applyTheme() {
            document.documentElement.classList.toggle('dark-mode', this.isDarkMode);
        },

        loadThemePreference() {
            const savedTheme = localStorage.getItem('trippenTheme');
            if (savedTheme) {
                this.isDarkMode = savedTheme === 'dark';
            } else {
                const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
                this.isDarkMode = !!prefersDark;
            }
            this.applyTheme();
            this.updateLogoTheme();
        },

        updateLogoTheme() {
            this.logoSrc = 'tripen-day.svg';
        },

        linkifyUrls: text => text?.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>') || text,
        
        checkExistingData() { 
            this.hasExistingData = !!(localStorage.getItem('trippenEvents') && localStorage.getItem('trippenDays')); 
        },
        
        loadExistingData() {
            this.loadData();
            if (this.tripDays.length > 0) this.tripInitialized = true;
        },

        // 旅行タイトル編集機能
        editTripTitle() {
            const currentTitle = this.tripTitle || '';
            this.openModal('旅行タイトルを編集', `
                <div class="mb-3">
                    <label for="tripTitleInput" class="form-label">旅行タイトル</label>
                    <input type="text" class="form-control" id="tripTitleInput" value="${currentTitle.replace(/"/g, '&quot;')}" placeholder="例：沖縄旅行、温泉巡りの旅など">
                </div>
            `, `
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">キャンセル</button>
                <button type="button" class="btn btn-primary" onclick="
                    const input = document.getElementById('tripTitleInput');
                    if (input) {
                        window.app.tripTitle = input.value.trim();
                        window.app.saveData();
                        window.app.closeAllModals();
                        navigator.vibrate?.(100);
                    }
                ">保存</button>
            `);
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
            const days = [], start = new Date(startDate), end = new Date(endDate);
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
            this.tripDays = this.generateConsecutiveDays(this.tripDays[0].fullDate, this.tripDays.length + 1);
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
            const days = [], start = new Date(startDate);
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
            return this.events.filter(event => event.dayIndex === this.activeDay)
                .map(event => ({
                    ...event,
                    inlineText: `${event.title}（${event.startTime}-${event.endTime}）`
                }));
        },

        checkEventOverlap(eventA, eventB) {
            if (eventA.dayIndex !== eventB.dayIndex) return false;
            const [startA, endA, startB, endB] = [eventA.startTime, eventA.endTime, eventB.startTime, eventB.endTime]
                .map(this.timeToMinutes);
            return !(endA <= startB || endB <= startA);
        },

        getOverlappingEvents(targetEvent) {
            return this.events.filter(event => 
                event.id !== targetEvent.id && this.checkEventOverlap(targetEvent, event)
            );
        },

        updateEventZIndex(eventId) {
            const targetEvent = this.events.find(e => e.id === eventId);
            if (!targetEvent || this.getOverlappingEvents(targetEvent).length === 0) return;
            
            this.eventLayerOrder = this.eventLayerOrder.filter(id => id !== eventId);
            this.eventLayerOrder.push(eventId);
            this.maxZIndex = Math.max(this.maxZIndex, this.baseZIndex + this.eventLayerOrder.length);
            this.saveLayerOrder();
        },

        handleEventClick(event, eventData) {
            if (this.isDragComplete || this.isResizeComplete || this.draggingEvent || 
                (this.editModeEvent?.id === eventData.id)) {
                this.isDragComplete = this.isResizeComplete = false;
                return;
            }
            if (!event.target.closest('.event-action-btn, .resize-handle, .weather-emoji-top-left')) {
                this.openDetailModal(eventData);
            }
        },

        handleEventMouseDown(event, eventData) {
            if (this.editModeEvent?.id === eventData.id && 
                !event.target.closest('.event-action-btn, .resize-handle')) {
                event.preventDefault();
                event.stopPropagation();
                this.startEventDrag(event, eventData);
            }
        },

        handleEventContextMenu(event, eventData) {
            event.preventDefault();
            event.stopPropagation();
            this.editModeEvent = this.editModeEvent?.id === eventData.id ? null : eventData;
            navigator.vibrate?.(50);
        },

        startEventDrag(event, eventData) {
            this.draggingEvent = eventData;
            this.isDragComplete = false;
            const container = this.$refs.scrollContainer || this.$refs.mobileTimelineContainer;
            const rect = container.getBoundingClientRect();
            const headerHeight = container.querySelector('.timeline-header')?.offsetHeight || 0;
            const centerOffset = (this.timeToPixels(eventData.endTime) - this.timeToPixels(eventData.startTime)) / 2;

            const moveHandler = e => {
                const newCenterTop = e.clientY - rect.top - headerHeight + container.scrollTop;
                const snappedTop = Math.round((newCenterTop - centerOffset) / 15) * 15;
                this.updateEventTimeFromDrag(eventData, snappedTop);
            };

            const endHandler = () => {
                document.removeEventListener('mousemove', moveHandler);
                document.removeEventListener('mouseup', endHandler);
                this.draggingEvent = null;
                this.isDragComplete = true;
                this.updateEventZIndex(eventData.id);
                this.saveData();
                setTimeout(() => this.isDragComplete = false, 150);
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
            const headerHeight = container.querySelector('.timeline-header')?.offsetHeight || 0;
            const centerOffset = (this.timeToPixels(eventData.endTime) - this.timeToPixels(eventData.startTime)) / 2;

            const moveHandler = e => {
                e.preventDefault();
                const touch = e.touches[0];
                const newCenterTop = touch.clientY - rect.top - headerHeight + container.scrollTop;
                const snappedTop = Math.round((newCenterTop - centerOffset) / 15) * 15;
                this.updateEventTimeFromDrag(eventData, snappedTop);
            };

            const endHandler = () => {
                document.removeEventListener('touchmove', moveHandler);
                document.removeEventListener('touchend', endHandler);
                this.draggingEvent = null;
                this.isDragComplete = true;
                this.updateEventZIndex(eventData.id);
                this.saveData();
                setTimeout(() => this.isDragComplete = false, 150);
            };

            document.addEventListener('touchmove', moveHandler, { passive: false });
            document.addEventListener('touchend', endHandler, { passive: true });
        },

        updateEventTimeFromDrag(eventData, snappedTop) {
            const eventIndex = this.events.findIndex(ev => ev.id === eventData.id);
            if (eventIndex === -1) return;

            const currentDuration = this.timeToMinutes(this.events[eventIndex].endTime) - 
                                   this.timeToMinutes(this.events[eventIndex].startTime);
            const newTime = this.pixelsToTime(snappedTop);
            const newEndTime = this.minutesToTime(this.timeToMinutes(newTime) + currentDuration);

            if (newTime < '04:00') {
                this.events[eventIndex].startTime = '04:00';
                this.events[eventIndex].endTime = this.minutesToTime(this.timeToMinutes('04:00') + currentDuration);
            } else if (newEndTime > '24:00') {
                this.events[eventIndex].endTime = '24:00';
                this.events[eventIndex].startTime = this.minutesToTime(this.timeToMinutes('24:00') - currentDuration);
            } else {
                this.events[eventIndex].startTime = newTime;
                this.events[eventIndex].endTime = newEndTime;
            }
        },

        handleMobileDayTouchStart(event, index) {
            this.touchStartTime = Date.now();
            this.longPressTimer = setTimeout(() => {
                navigator.vibrate?.(50);
                this.showMobilePopupForDay(index);
            }, 800);
        },

        handleMobileDayTouchEnd(event, index) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
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
            this.$refs.mobileScrollContainer?.scrollBy({ 
                left: direction === 'left' ? -120 : 120, 
                behavior: 'smooth' 
            });
        },

        handleEventTouchStart(event, eventData) {
            if (this.isDragComplete || this.draggingEvent) return;
            
            if (this.editModeEvent?.id === eventData.id) {
                if (!event.target.closest('.event-action-btn, .resize-handle')) {
                    event.preventDefault();
                    event.stopPropagation();
                    this.startEventDragTouch(event, eventData);
                }
            } else {
                if (!event.target.closest('.event-action-btn, .resize-handle, .weather-emoji-top-left')) {
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
                        navigator.vibrate?.(50);
                    }, 500);

                    const handleTouchMove = e => {
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
                        clearTimeout(this.longPressTimer);
                        this.longPressTimer = null;
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
                    navigator.vibrate?.([100, 50, 100]);
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
                const duration = this.timeToMinutes(this.clipboardEvent.endTime) - 
                               this.timeToMinutes(this.clipboardEvent.startTime);
                const startMinutes = this.timeToMinutes(this.pasteTargetTime);
                const endMinutes = Math.min(startMinutes + duration, 1440);
                
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
            this.eventForm = {
                title: '', dayIndex: this.activeDay,
                startTime: this.pasteTargetTime,
                endTime: this.minutesToTime(startMinutes + 60),
                category: 'travel', description: '', coordinates: ''
            };
            
            this.hideContextMenu();
            setTimeout(() => this.openEventModal(null, true), 100);
        },

        timeToMinutes: timeString => {
            const [hours, minutes] = timeString.split(':').map(Number);
            return hours * 60 + minutes;
        },

        minutesToTime: minutes => `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`,

        timeToPixels: timeString => {
            const [hours, minutes] = timeString.split(':').map(Number);
            const totalMinutes = (hours - 4) * 60 + minutes;
            return totalMinutes * (this.isMobile ? 50/60 : 1);
        },

        pixelsToTime: pixels => {
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
                const headerHeight = timelineHeader?.offsetHeight || 0;
                const relativeY = y - containerRect.top - headerHeight + container.scrollTop;
                const snappedY = Math.round(relativeY / 15) * 15;
                this.pasteTargetTime = this.pixelsToTime(Math.max(0, snappedY));
            }
            
            this.contextMenuStyle = { left: `${x}px`, top: `${y}px` };
            this.showContextMenu = true;
            setTimeout(() => document.addEventListener('click', this.hideContextMenu, { once: true }), 100);
        },

        hideContextMenu() { this.showContextMenu = false; },

        handleScheduleTouchStart(event) {
            if (!this.isMobile || event.target.closest('.event-block')) return;
            
            this.touchStartTime = Date.now();
            this.touchStartPosition = { x: event.touches[0].clientX, y: event.touches[0].clientY };
            
            this.longPressTimer = setTimeout(() => {
                this.showContextMenuAt(this.touchStartPosition.x, this.touchStartPosition.y, event);
                navigator.vibrate?.(50);
            }, 500);
        },

        handleScheduleTouchMove(event) {
            if (!this.isMobile || event.target.closest('.event-block')) return;
            
            const deltaX = Math.abs(event.touches[0].clientX - this.touchStartPosition.x);
            const deltaY = Math.abs(event.touches[0].clientY - this.touchStartPosition.y);
            if (deltaX > 10 || deltaY > 10) this.clearLongPress();
        },

        handleScheduleTouchEnd(event) {
            if (!this.isMobile || event.target.closest('.event-block')) return;
            
            this.clearLongPress();
            if (Date.now() - this.touchStartTime < 300) this.editModeEvent = null;
        },

        clearLongPress() {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
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
            
            const moveHandler = e => {
                const coords = type === 'touch' ? e.touches[0] : e;
                const container = this.isMobile ? this.$refs.mobileTimelineContainer : this.$refs.scrollContainer;
                const rect = container.getBoundingClientRect();
                const headerHeight = container.querySelector('.timeline-header')?.offsetHeight || 0;
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
                setTimeout(() => this.isResizeComplete = false, 150);
            };
            
            document.addEventListener(moveEvent, moveHandler, { passive: false });
            document.addEventListener(endEvent, endHandler);
        },

        getEventStyle(event) {
            const startPixels = this.timeToPixels(event.startTime);
            const endPixels = this.timeToPixels(event.endTime);
            const duration = Math.max(endPixels - startPixels, this.isMobile ? 25 : 30);
            const overlappingEvents = this.getOverlappingEvents(event);
            
            let zIndex = this.baseZIndex;
            
            if (overlappingEvents.length > 0) {
                const allEvents = [...overlappingEvents, event];
                const sortedByDuration = allEvents.sort((a, b) => 
                    (this.timeToMinutes(a.endTime) - this.timeToMinutes(a.startTime)) - 
                    (this.timeToMinutes(b.endTime) - this.timeToMinutes(b.startTime))
                );
                const currentEventIndex = sortedByDuration.findIndex(e => e.id === event.id);
                zIndex = this.baseZIndex + sortedByDuration.length - currentEventIndex;
            }

            return {
                top: `${startPixels}px`,
                height: `${duration}px`,
                minHeight: this.isMobile ? '32px' : '35px',
                zIndex
            };
        },

        getCategoryIcon: category => ({
            travel: 'fas fa-car',
            food: 'fas fa-utensils',
            sightseeing: 'fas fa-camera',
            accommodation: 'fas fa-bed',
            custom: 'fas fa-star'
        })[category] || 'fas fa-calendar',

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

                const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode&timezone=auto&start_date=${dayData.fullDate}&end_date=${dayData.fullDate}`);
                if (!response.ok) throw new Error('Weather API request failed');

                const data = await response.json();
                const weatherCode = data.daily.weathercode[0];

                this.weatherCache[cacheKey] = { data: weatherCode, timestamp: Date.now() };
                return weatherCode;
            } catch {
                return null;
            }
        },

        getWeatherEmoji: weatherCode => {
            const weatherMap = {
                0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️', 45: '🌫️', 48: '🌫️',
                51: '🌦️', 53: '🌦️', 55: '🌧️', 56: '🌧️', 57: '🌧️',
                61: '🌧️', 63: '🌧️', 65: '🌧️', 66: '🌧️', 67: '🌧️',
                71: '🌨️', 73: '🌨️', 75: '🌨️', 77: '🌨️',
                80: '🌦️', 81: '🌦️', 82: '🌧️',
                85: '🌨️', 86: '🌨️',
                95: '⛈️', 96: '⛈️', 99: '⛈️'
            };
            return weatherMap[weatherCode] || '';
        },

        async loadWeatherForAllEvents() {
            await Promise.all(
                this.events.filter(event => event.coordinates)
                    .map(event => this.fetchWeatherForEvent(event))
            );
        },

        getEventWeatherEmoji(event) {
            if (!event.coordinates) return '';
            const cacheKey = `${event.coordinates}_${event.dayIndex}`;
            const cachedWeather = this.weatherCache[cacheKey];
            return cachedWeather && Date.now() - cachedWeather.timestamp < this.weatherCacheExpiry
                ? this.getWeatherEmoji(cachedWeather.data) : '';
        },

        setLocationFromMap() {
            this.showMapModal = true;
            this.$nextTick(() => this.initializeMap());
        },

        initializeMap() {
            this.map = L.map('map').setView([34.7024, 135.4959], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(this.map);
            this.map.on('click', this.handleMapClick);
        },

        handleMapClick(e) {
            const lat = e.latlng.lat.toFixed(6);
            const lng = e.latlng.lng.toFixed(6);
            this.selectedCoordinates = `${lat},${lng}`;

            if (this.mapMarker) this.map.removeLayer(this.mapMarker);
            this.mapMarker = L.marker([lat, lng]).addTo(this.map);

            const coordinatesInput = document.getElementById('eventCoordinates');
            if (coordinatesInput) coordinatesInput.value = this.selectedCoordinates;

            navigator.vibrate?.(100);
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
            if (!coordinatesInput?.value.trim()) {
                alert('コピーする緯度経度がありません');
                return;
            }

            const coordinates = coordinatesInput.value.trim();
            navigator.clipboard.writeText(coordinates).then(() => {
                alert('緯度経度をクリップボードにコピーしました');
                navigator.vibrate?.(100);
            }).catch(() => {
                coordinatesInput.select();
                document.execCommand('copy');
                alert('緯度経度をクリップボードにコピーしました');
                navigator.vibrate?.(100);
            });
        },

        openGoogleMap(coordinates) {
            if (!coordinates?.trim()) {
                alert('緯度経度が設定されていません');
                return;
            }

            const googleMapsUrl = `https://maps.google.co.jp/maps?ll=${coordinates.trim()}&z=15`;
            if (this.isMobile) {
                window.location.href = googleMapsUrl;
            } else {
                window.open(googleMapsUrl, '_blank', 'noopener,noreferrer');
            }
        },

        openDetailModal(event) {
            const eventData = typeof event === 'string' ? 
                this.events.find(e => String(e.id) === String(event)) : event;
            
            if (!eventData) {
                alert('予定データが見つかりません');
                return;
            }
            
            const safeData = {
                id: String(eventData.id).replace(/'/g, "\\'"),
                title: String(eventData.title).replace(/'/g, "\\'").replace(/"/g, "&quot;"),
                coordinates: String(eventData.coordinates || '').replace(/"/g, "&quot;")
            };
            
            this.openModal('詳細', `
                <div class="mb-3"><h6><i class="${this.getCategoryIcon(eventData.category)}"></i> ${safeData.title}</h6></div>
                <div class="mb-3"><strong>日付:</strong> ${this.tripDays[eventData.dayIndex]?.date || '不明'}</div>
                <div class="mb-3"><strong>時間:</strong> ${eventData.startTime} - ${eventData.endTime}</div>
                ${eventData.coordinates ? `<div class="mb-3"><strong>緯度経度:</strong> ${safeData.coordinates} <button type="button" class="btn btn-outline-primary btn-sm ms-2" onclick="window.app.openGoogleMap('${safeData.coordinates}')" title="Googleマップで表示">🗾</button></div>` : ''}
                ${eventData.description ? `<div class="mb-3"><strong>詳細:</strong><br>${this.linkifyUrls(String(eventData.description).replace(/"/g, "&quot;"))}</div>` : ''}
            `, `
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">閉じる</button>
                <button type="button" class="btn btn-danger" onclick="window.app.deleteEventFromDetail('${safeData.id}')">削除</button>
                <button type="button" class="btn btn-primary" onclick="window.app.editEventFromDetail('${safeData.id}')">編集</button>
            `);
        },

        deleteEventFromDetail(eventId) {
            if (!confirm('この予定を削除しますか？')) return;
            
            const eventIndex = this.events.findIndex(e => String(e.id) === String(eventId));
            if (eventIndex === -1) {
                alert('予定が見つかりません。ページを再読み込みしてお試しください。');
                return;
            }
            
            this.events.splice(eventIndex, 1);
            this.saveData();
            this.editModeEvent = null;
            this.closeAllModals();
            navigator.vibrate?.(100);
        },

        editEventFromDetail(eventId) {
            const event = this.events.find(e => String(e.id) === String(eventId));
            if (!event) {
                alert('予定が見つかりません。ページを再読み込みしてお試しください。');
                return;
            }
            
            this.closeAllModals();
            setTimeout(() => this.openEventModal(event), 100);
        },

        openEventModal(event = null, fromContextMenu = false) {
            const isEdit = !!event;
            if (isEdit) {
                this.eventForm = { ...event };
            } else if (!fromContextMenu) {
                this.eventForm = {
                    title: '', dayIndex: this.activeDay, startTime: '09:00', endTime: '10:00',
                    category: 'travel', description: '', coordinates: ''
                };
            }

            this.openModal(
                isEdit ? '予定を編集' : '新しい予定を追加',
                this.generateEventModalBody(),
                this.generateEventModalFooter(isEdit)
            );
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

        generateEventModalFooter: isEdit => `
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">キャンセル</button>
            <button type="button" class="btn btn-primary" onclick="window.app.saveEvent(${isEdit})">${isEdit ? '更新' : '追加'}</button>
        `,

        saveEvent(isEdit) {
            const formData = {
                title: document.getElementById('eventTitle').value.trim(),
                dayIndex: parseInt(document.getElementById('eventDay').value),
                startTime: document.getElementById('eventStartTime').value,
                endTime: document.getElementById('eventEndTime').value,
                category: document.getElementById('eventCategory').value,
                coordinates: document.getElementById('eventCoordinates').value.trim(),
                description: document.getElementById('eventDescription').value.trim()
            };

            if (!formData.title) return alert('予定タイトルを入力してください');
            if (!formData.startTime || !formData.endTime) return alert('開始時間と終了時間を選択してください');
            if (formData.startTime >= formData.endTime) return alert('終了時間は開始時間より後に設定してください');
            if (formData.coordinates && !this.validateCoordinates(formData.coordinates)) {
                return alert('緯度経度の形式が正しくありません。\n正しい形式：34.702485,135.495951');
            }

            if (isEdit) {
                const eventIndex = this.events.findIndex(e => e.id === this.eventForm.id);
                if (eventIndex !== -1) this.events[eventIndex] = { ...this.events[eventIndex], ...formData };
            } else {
                this.events.push({ ...formData, id: Date.now() + Math.random() });
            }

            this.saveData();
            this.closeAllModals();
            this.editModeEvent = null;
            this.activeDay = formData.dayIndex;
            this.loadWeatherForAllEvents();
            navigator.vibrate?.(100);
        },

        validateCoordinates(coordinates) {
            if (!/^-?\d+\.?\d*,-?\d+\.?\d*$/.test(coordinates)) return false;
            const [lat, lng] = coordinates.split(',').map(Number);
            return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
        },

        openModal(title, body, footer, size = '') {
            const modalId = 'modal-' + Date.now();
            this.modals.push({ id: modalId, title, body, footer, size });

            this.$nextTick(() => {
                const modalElement = document.getElementById(modalId);
                if (modalElement) {
                    const bootstrapModal = new bootstrap.Modal(modalElement);
                    bootstrapModal.show();
                    modalElement.addEventListener('hidden.bs.modal', () => {
                        const index = this.modals.findIndex(m => m.id === modalId);
                        if (index !== -1) this.modals.splice(index, 1);
                    });
                }
            });
        },

        closeAllModals() {
            this.modals.forEach(modal => {
                const modalElement = document.getElementById(modal.id);
                const bootstrapModal = bootstrap.Modal.getInstance(modalElement);
                bootstrapModal?.hide();
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
            if (!newStartDate) return alert('新しい開始日を選択してください');
            if (newStartDate < this.today) return alert('開始日は今日以降の日付を選択してください');

            if (confirm('開始日を変更しますか？既存の予定も日程が調整されます。')) {
                this.tripDays = this.generateConsecutiveDays(newStartDate, this.tripDays.length);
                this.saveData();
                this.closeAllModals();
                this.loadWeatherForAllEvents();
                navigator.vibrate?.(100);
            }
        },

        openWeatherPopup(event) {
            if (!event.coordinates) return alert('この予定には位置情報が設定されていません。');
            
            try {
                const [lat, lng] = event.coordinates.split(',');
                const dayData = this.tripDays[event.dayIndex];
                if (!dayData) throw new Error('該当日程データが見つかりません。');
                
                const date = dayData.fullDate.replace(/-/g, '');
                const hour = event.startTime.split(':')[0].padStart(2, '0');
                const datetime = `${date}${hour}00`;
                
                this.weatherPopupUrl = `https://nokonokotubotubo.github.io/fukunavi/?lat=${lat.trim()}&lng=${lng.trim()}&datetime=${datetime}`;
                this.showWeatherPopup = true;
            } catch {
                alert('天気予報ポップアップの表示に失敗しました。');
            }
        },

        closeWeatherPopup() {
            this.showWeatherPopup = false;
            this.weatherPopupUrl = '';
        },

        openSettingsModal() { this.showSettingsModal = true; },
        closeSettingsModal() { this.showSettingsModal = false; },

        async saveGitHubSync() {
            const token = this.syncForm.token.trim();
            const gistId = this.syncForm.gistId.trim();

            if (!token) return alert('GitHub Personal Access Tokenを入力してください');

            try {
                TrippenGistSync.init(token, gistId || null);
                this.gistSync = {
                    isEnabled: TrippenGistSync.isEnabled,
                    gistId: TrippenGistSync.gistId,
                    lastSyncTime: TrippenGistSync.lastSyncTime,
                    lastReadTime: TrippenGistSync.lastReadTime,
                    isSyncing: false, isLoading: false, hasError: false
                };

                const syncResult = await TrippenGistSync.manualWriteToCloud();
                if (syncResult) {
                    this.gistSync.gistId = TrippenGistSync.gistId;
                    this.gistSync.lastSyncTime = TrippenGistSync.lastSyncTime;
                    this.syncForm = { token: '', gistId: '' };
                    alert('GitHub同期を開始しました\nGist ID: ' + TrippenGistSync.gistId);
                } else {
                    throw new Error('初回書き込みに失敗しました');
                }
            } catch (error) {
                this.gistSync.hasError = true;
                alert('設定に失敗しました: ' + error.message);
            }
        },

        // 修正2: saveData()呼び出し追加
        async manualSync() {
            if (!TrippenGistSync.isEnabled) return alert('GitHub同期が設定されていません');

            this.saveData(); // 修正2: 同期前に最新データを保存
            this.gistSync.isSyncing = true;
            try {
                const result = await TrippenGistSync.manualWriteToCloud();
                if (result) {
                    this.gistSync.lastSyncTime = TrippenGistSync.lastSyncTime;
                    this.gistSync.hasError = false;
                    alert('手動書き込みが完了しました');
                } else {
                    throw new Error('書き込みに失敗しました');
                }
            } catch (error) {
                this.gistSync.hasError = true;
                alert('書き込みに失敗しました: ' + error.message);
            } finally {
                this.gistSync.isSyncing = false;
            }
        },

        async loadFromCloud() {
            if (!TrippenGistSync.isEnabled || !TrippenGistSync.token) {
                return alert('GitHub同期が設定されていません。設定画面で設定してください。');
            }
            if (!TrippenGistSync.gistId) {
                return alert('Gist IDが設定されていません。最初にデータを書き込むか、既存のGist IDを設定してください。');
            }

            this.gistSync.isLoading = true;
            try {
                const cloudData = await TrippenGistSync.loadFromCloud();
                if (!cloudData?.data) throw new Error('クラウドデータの形式が正しくありません');

                if (cloudData.data.events) {
                    this.events = [...cloudData.data.events];
                    localStorage.setItem('trippenEvents', JSON.stringify(this.events));
                }
                if (cloudData.data.days) {
                    this.tripDays = [...cloudData.data.days];
                    localStorage.setItem('trippenDays', JSON.stringify(this.tripDays));
                    this.$nextTick(() => this.tripInitialized = this.tripDays.length > 0);
                }
                if (cloudData.data.layerOrder) {
                    this.eventLayerOrder = [...cloudData.data.layerOrder];
                    localStorage.setItem('trippenLayerOrder', JSON.stringify(this.eventLayerOrder));
                }
                if (cloudData.data.tripTitle !== undefined) {
                    this.tripTitle = cloudData.data.tripTitle || '';
                    localStorage.setItem('trippenTitle', this.tripTitle);
                }

                this.gistSync.lastReadTime = TrippenGistSync.lastReadTime;
                this.gistSync.hasError = false;

                const eventCount = cloudData.data.events?.length || 0;
                const dayCount = cloudData.data.days?.length || 0;
                alert(`クラウドからデータを読み込みました\n日程: ${dayCount}日分\n予定: ${eventCount}件`);

                if (this.events.length > 0) this.loadWeatherForAllEvents();
            } catch (error) {
                this.gistSync.hasError = true;
                alert(`読み込みに失敗しました\nエラー: ${error.message}`);
            } finally {
                this.gistSync.isLoading = false;
            }
        },

        handleSyncConflict() { this.showConflictModal = true; },
        closeConflictModal() { this.showConflictModal = false; },
        
        async forceLoadFromCloud() {
            this.closeConflictModal();
            await this.loadFromCloud();
        },

        copyGistId() {
            if (!this.gistSync.gistId) return alert('コピーするGist IDがありません');
            
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
        },

        clearGitHubSync() {
            if (!confirm('GitHub同期設定を解除しますか？')) return;
            
            TrippenGistSync.clear();
            this.gistSync = {
                isEnabled: false, gistId: null, lastSyncTime: null, lastReadTime: null,
                isSyncing: false, isLoading: false, hasError: false
            };
            this.syncForm = { token: '', gistId: '' };
            alert('GitHub同期設定を解除しました');
        },

        formatSyncTime: isoString => {
            if (!isoString) return '未実行';
            try {
                return new Date(isoString).toLocaleString('ja-JP');
            } catch {
                return '日時不明';
            }
        },

        saveLayerOrder() {
            localStorage.setItem('trippenLayerOrder', JSON.stringify(this.eventLayerOrder));
            localStorage.setItem('trippenMaxZIndex', this.maxZIndex.toString());
        },

        loadLayerOrder() {
            try {
                const savedLayerOrder = localStorage.getItem('trippenLayerOrder');
                const savedMaxZIndex = localStorage.getItem('trippenMaxZIndex');
                
                if (savedLayerOrder) this.eventLayerOrder = JSON.parse(savedLayerOrder);
                if (savedMaxZIndex) this.maxZIndex = parseInt(savedMaxZIndex) || this.baseZIndex;
            } catch {
                this.eventLayerOrder = [];
            }
        },

        saveData() {
            localStorage.setItem('trippenEvents', JSON.stringify(this.events));
            localStorage.setItem('trippenDays', JSON.stringify(this.tripDays));
            localStorage.setItem('trippenTitle', this.tripTitle);
            this.saveLayerOrder();
            if (TrippenGistSync.isEnabled) TrippenGistSync.markChanged();
        },

        loadData() {
            try {
                const savedEvents = localStorage.getItem('trippenEvents');
                const savedDays = localStorage.getItem('trippenDays');
                const savedTitle = localStorage.getItem('trippenTitle');
                
                if (savedEvents) this.events = JSON.parse(savedEvents);
                if (savedDays) this.tripDays = JSON.parse(savedDays);
                if (savedTitle) this.tripTitle = savedTitle;
            } catch {
                this.events = [];
                this.tripDays = [];
                this.tripTitle = '';
            }
            this.loadLayerOrder();
        }
    },

    mounted() {
        this.detectMobile();
        this.checkExistingData();
        this.loadData();
        this.loadThemePreference();
        
        if (this.tripDays.length > 0) {
            this.tripInitialized = true;
            this.loadWeatherForAllEvents();
        }
        
        window.addEventListener('resize', this.detectMobile);
        window.app = this;

        const config = TrippenGistSync.loadConfig();
        if (config && TrippenGistSync.isEnabled) {
            this.gistSync = {
                isEnabled: TrippenGistSync.isEnabled,
                gistId: TrippenGistSync.gistId,
                lastSyncTime: TrippenGistSync.lastSyncTime,
                lastReadTime: TrippenGistSync.lastReadTime,
                isSyncing: false, isLoading: false, hasError: false
            };

            TrippenGistSync.startPeriodicSync();
            
            if (TrippenGistSync.gistId) {
                setTimeout(async () => {
                    try {
                        await TrippenGistSync.initialAutoLoad();
                    } catch {}
                }, 3000);
            }
        }
    }
}).mount('#app');
