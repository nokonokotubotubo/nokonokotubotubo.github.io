/** biome-ignore-all lint/suspicious/noAssignInExpressions: Vue の初期化で必要な代入式を維持するため */
/** biome-ignore-all lint/correctness/useParseIntRadix: 既存コードの parseInt が既定の挙動を利用するため */
/** biome-ignore-all lint/style/useTemplate: 文字列結合のままにして意図したエスケープ処理を保つため */
/** biome-ignore-all lint/suspicious/noGlobalIsNan: 既存ロジックがグローバル isNaN を直接呼び出すため */
/** biome-ignore-all lint/correctness/noUnusedFunctionParameters: API 互換性のため未使用の引数を保持する必要があるため */
/** biome-ignore-all lint/correctness/noUnusedVariables: デバッグ用の一時変数を残す必要があるため */
import TrippenGistSync from './modules/trippenGistSync.js';
import { saveAppData, loadAppData, saveLayerState, loadLayerState } from './modules/storage.js';
import { timeStringToMinutes, minutesToTimeString, timeStringToPixels, pixelsToTimeString } from './modules/timeUtils.js';
import {
    openModal as openModalHelper,
    closeAllModals as closeAllModalsHelper,
    buildEventModalBody,
    buildEventModalFooter
} from './modules/modals.js';
import {
    fetchEventWeather as fetchEventWeatherData,
    getEventWeatherEmoji as getCachedEventWeatherEmoji,
    getWeatherEmoji as getWeatherEmojiSymbol
} from './modules/weather.js';

const { createApp } = Vue;

window.TrippenGistSync = TrippenGistSync;

// GitHub Gist同期システム（軽量化版）
const app = createApp({
    data: () => ({
        tripInitialized: false, tripStartDate: '', tripEndDate: '',
        tripTitle: '', // 旅行タイトル
        today: new Date().toISOString().split('T')[0],
        hasExistingData: false, tripDays: [], activeDay: 0,
        showMobilePopup: false, selectedDayForPopup: null, selectedDayIndex: null,
        scrollPosition: 0, maxScrollPosition: 0,
        timeSlots: Array.from({length: 20}, (_, i) => i + 4),
        slotPixelHeight: 60,
        timelineHeight: 1200,
        events: [], editModeEvent: null, clipboardEvent: null,
        showContextMenu: false, contextMenuStyle: {}, pasteTargetTime: null,
        isMobile: false, hasUserActivated: false, touchStartTime: 0, touchStartPosition: { x: 0, y: 0 },
        longPressTimer: null, longPressExecuted: false,
        draggingEvent: null,
        isDragComplete: false, isResizeComplete: false, dragStarted: false,
        longPressEventData: null, longPressEvent: null, readyToMoveEventId: null,
        userActivationHandler: null,
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

    computed: {
        timelineStyles() {
            return { height: `${this.timelineHeight}px` };
        },
        pixelsPerMinute() {
            return this.slotPixelHeight > 0 ? this.slotPixelHeight / 60 : 1;
        }
    },

    watch: {
        isMobile() {
            this.updateSlotHeight();
        },
        tripInitialized(initialized) {
            if (initialized) {
                this.updateSlotHeight();
            }
        }
    },

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
                        this.safeVibrate(100);
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
        detectMobile() {
            const nextValue = window.innerWidth <= 768 || 'ontouchstart' in window;
            if (this.isMobile !== nextValue) {
                this.isMobile = nextValue;
            }
            this.updateSlotHeight();
        },

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
                    inlineText: `（${event.startTime}-${event.endTime}）${event.title}`
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
            this.safeVibrate(50);
        },

        startEventDrag(event, eventData) {
            this.draggingEvent = eventData;
            this.isDragComplete = false;
            const container = this.$refs.scrollContainer || this.$refs.mobileTimelineContainer;
            const rect = container.getBoundingClientRect();
            const centerOffset = (this.timeToPixels(eventData.endTime) - this.timeToPixels(eventData.startTime)) / 2;

            const moveHandler = e => {
                const newCenterTop = e.clientY - rect.top  + container.scrollTop;
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
            const centerOffset = (this.timeToPixels(eventData.endTime) - this.timeToPixels(eventData.startTime)) / 2;

            const moveHandler = e => {
                e.preventDefault();
                const touch = e.touches[0];
                const newCenterTop = touch.clientY - rect.top  + container.scrollTop;
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
                this.safeVibrate(50);
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
                        this.safeVibrate(50);
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
                    this.safeVibrate([100, 50, 100]);
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

        timeToMinutes: timeStringToMinutes,

        minutesToTime: minutesToTimeString,

        safeVibrate(pattern) {
            if (!this.hasUserActivated) return;
            if (!navigator.vibrate) return;
            navigator.vibrate(pattern);
        },

        updateSlotHeight() {
            this.$nextTick(() => {
                const containers = [this.$refs.scrollContainer, this.$refs.mobileTimelineContainer].filter(Boolean);
                let measured = 0;
                for (const container of containers) {
                    if (measured) break;
                    const slot = container.querySelector('.time-slot');
                    if (!slot) continue;
                    measured = slot.getBoundingClientRect().height;
                }
                if (!measured) return;
                const normalized = Math.max(measured, 1);
                const timelineHeight = normalized * this.timeSlots.length;
                if (Math.abs(normalized - this.slotPixelHeight) > 0.5 || Math.abs(timelineHeight - this.timelineHeight) > 0.5) {
                    this.slotPixelHeight = normalized;
                    this.timelineHeight = timelineHeight;
                }
            });
        },

        timeToPixels(timeString) {
            const pixelsPerMinute = this.pixelsPerMinute || 1;
            return timeStringToPixels(timeString, pixelsPerMinute);
        },

        pixelsToTime(pixels) {
            const pixelsPerMinute = this.pixelsPerMinute || 1;
            return pixelsToTimeString(pixels, pixelsPerMinute);
        },

        handleScheduleContextMenu(event) {
            if (!this.isMobile) {
                event.preventDefault();
                this.showContextMenuAt(event.clientX, event.clientY, event);
            }
        },

        showContextMenuAt(x, y, event) {
            const container = this.isMobile ? this.$refs.mobileTimelineContainer : this.$refs.scrollContainer;
            const scheduleArea = container.querySelector('.schedule-area');
            
            if (!scheduleArea) {
                const containerRect = container.getBoundingClientRect();
                this.pasteTargetTime = this.pixelsToTime(y - containerRect.top + container.scrollTop);
            } else {
                const containerRect = container.getBoundingClientRect();
                const relativeY = y - containerRect.top  + container.scrollTop;
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
                this.safeVibrate(50);
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
                    const y = coords.clientY - rect.top  + container.scrollTop;
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
            const rawDuration = Math.max(endPixels - startPixels, 0);
            const minimumHeight = Math.max(this.slotPixelHeight * 0.5, 24);
            const duration = Math.max(rawDuration, minimumHeight);
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
                minHeight: `${minimumHeight}px`,
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
            return fetchEventWeatherData(event, this.tripDays, this.weatherCache, this.weatherCacheExpiry);
        },

        getWeatherEmoji: getWeatherEmojiSymbol,

        async loadWeatherForAllEvents() {
            await Promise.all(
                this.events.filter(event => event.coordinates)
                    .map(event => this.fetchWeatherForEvent(event))
            );
        },

        getEventWeatherEmoji(event) {
            return getCachedEventWeatherEmoji(event, this.weatherCache, this.weatherCacheExpiry);
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

            this.safeVibrate(100);
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
                this.safeVibrate(100);
            }).catch(() => {
                coordinatesInput.select();
                document.execCommand('copy');
                alert('緯度経度をクリップボードにコピーしました');
                this.safeVibrate(100);
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
            this.safeVibrate(100);
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
            return buildEventModalBody(this.tripDays, this.eventForm);
        },

        generateEventModalFooter: isEdit => buildEventModalFooter(isEdit),

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
            this.safeVibrate(100);
        },

        validateCoordinates(coordinates) {
            if (!/^-?\d+\.?\d*,-?\d+\.?\d*$/.test(coordinates)) return false;
            const [lat, lng] = coordinates.split(',').map(Number);
            return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
        },

        openModal(title, body, footer, size = '') {
            openModalHelper(this, title, body, footer, size);
        },

        closeAllModals() {
            closeAllModalsHelper(this);
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
                this.safeVibrate(100);
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
            saveLayerState(this.eventLayerOrder, this.maxZIndex);
        },

        loadLayerOrder() {
            const { eventLayerOrder, maxZIndex } = loadLayerState(this.baseZIndex);
            this.eventLayerOrder = eventLayerOrder;
            this.maxZIndex = maxZIndex;
        },

        saveData() {
            saveAppData({
                events: this.events,
                tripDays: this.tripDays,
                tripTitle: this.tripTitle,
                eventLayerOrder: this.eventLayerOrder,
                maxZIndex: this.maxZIndex
            });
        },

        loadData() {
            const { events, tripDays, tripTitle } = loadAppData();
            this.events = events;
            this.tripDays = tripDays;
            this.tripTitle = tripTitle;
            this.loadLayerOrder();
        }
    },

    mounted() {
        this.detectMobile();
        this.checkExistingData();
        this.loadData();
        this.loadThemePreference();
        this.userActivationHandler = () => {
            this.hasUserActivated = true;
            window.removeEventListener('pointerdown', this.userActivationHandler);
            window.removeEventListener('keydown', this.userActivationHandler);
            this.userActivationHandler = null;
        };
        window.addEventListener('pointerdown', this.userActivationHandler);
        window.addEventListener('keydown', this.userActivationHandler);
        
        if (this.tripDays.length > 0) {
            this.tripInitialized = true;
            this.loadWeatherForAllEvents();
        }
        
        window.addEventListener('resize', this.detectMobile);
        window.app = this;
        this.updateSlotHeight();

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
    },

    beforeUnmount() {
        if (this.userActivationHandler) {
            window.removeEventListener('pointerdown', this.userActivationHandler);
            window.removeEventListener('keydown', this.userActivationHandler);
        }
        window.removeEventListener('resize', this.detectMobile);
    },
}).mount('#app');
