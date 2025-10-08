const weatherEmojiMap = {
    0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
    45: '🌫️', 48: '🌫️',
    51: '🌦️', 53: '🌦️', 55: '🌧️', 56: '🌧️', 57: '🌧️',
    61: '🌧️', 63: '🌧️', 65: '🌧️', 66: '🌧️', 67: '🌧️',
    71: '🌨️', 73: '🌨️', 75: '🌨️', 77: '🌨️',
    80: '🌦️', 81: '🌦️', 82: '🌧️',
    85: '🌨️', 86: '🌨️',
    95: '⛈️', 96: '⛈️', 99: '⛈️'
};

export const getWeatherEmoji = weatherCode => weatherEmojiMap[weatherCode] || '';

export const fetchEventWeather = async (event, tripDays, weatherCache, weatherCacheExpiry) => {
    if (!event.coordinates) return null;
    try {
        const [lat, lng] = event.coordinates.split(',').map(Number);
        if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

        const cacheKey = `${lat},${lng}_${event.dayIndex}`;
        const cached = weatherCache[cacheKey];
        if (cached && Date.now() - cached.timestamp < weatherCacheExpiry) {
            return cached.data;
        }

        const dayData = tripDays[event.dayIndex];
        if (!dayData) return null;

        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode&timezone=auto&start_date=${dayData.fullDate}&end_date=${dayData.fullDate}`);
        if (!response.ok) throw new Error('Weather API request failed');

        const data = await response.json();
        const weatherCode = data.daily.weathercode[0];
        weatherCache[cacheKey] = { data: weatherCode, timestamp: Date.now() };
        return weatherCode;
    } catch {
        return null;
    }
};

export const getEventWeatherEmoji = (event, weatherCache, weatherCacheExpiry) => {
    if (!event.coordinates) return '';
    const cacheKey = `${event.coordinates}_${event.dayIndex}`;
    const cachedWeather = weatherCache[cacheKey];
    if (!cachedWeather || Date.now() - cachedWeather.timestamp >= weatherCacheExpiry) return '';
    return getWeatherEmoji(cachedWeather.data);
};
