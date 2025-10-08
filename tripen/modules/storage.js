import TrippenGistSync from './trippenGistSync.js';

const STORAGE_KEYS = {
    events: 'trippenEvents',
    days: 'trippenDays',
    title: 'trippenTitle',
    layerOrder: 'trippenLayerOrder',
    maxZIndex: 'trippenMaxZIndex'
};

export const saveLayerState = (eventLayerOrder, maxZIndex) => {
    localStorage.setItem(STORAGE_KEYS.layerOrder, JSON.stringify(eventLayerOrder));
    localStorage.setItem(STORAGE_KEYS.maxZIndex, (maxZIndex ?? '').toString());
};

export const loadLayerState = (defaultBaseZIndex = 10) => {
    try {
        const savedLayerOrder = localStorage.getItem(STORAGE_KEYS.layerOrder);
        const savedMaxZIndex = localStorage.getItem(STORAGE_KEYS.maxZIndex);
        return {
            eventLayerOrder: savedLayerOrder ? JSON.parse(savedLayerOrder) : [],
            maxZIndex: savedMaxZIndex ? parseInt(savedMaxZIndex, 10) || defaultBaseZIndex : defaultBaseZIndex
        };
    } catch {
        return { eventLayerOrder: [], maxZIndex: defaultBaseZIndex };
    }
};

export const saveAppData = ({ events, tripDays, tripTitle, eventLayerOrder, maxZIndex }) => {
    localStorage.setItem(STORAGE_KEYS.events, JSON.stringify(events));
    localStorage.setItem(STORAGE_KEYS.days, JSON.stringify(tripDays));
    localStorage.setItem(STORAGE_KEYS.title, tripTitle);
    saveLayerState(eventLayerOrder, maxZIndex);
    if (TrippenGistSync.isEnabled) TrippenGistSync.markChanged();
};

export const loadAppData = () => {
    try {
        const events = JSON.parse(localStorage.getItem(STORAGE_KEYS.events) || '[]');
        const tripDays = JSON.parse(localStorage.getItem(STORAGE_KEYS.days) || '[]');
        const tripTitle = localStorage.getItem(STORAGE_KEYS.title) || '';
        return { events, tripDays, tripTitle };
    } catch {
        return { events: [], tripDays: [], tripTitle: '' };
    }
};
