export const timeStringToMinutes = timeString => {
    const [hours, minutes] = timeString.split(':').map(Number);
    return (Number.isFinite(hours) && Number.isFinite(minutes)) ? (hours * 60) + minutes : 0;
};

export const minutesToTimeString = minutes => {
    const safeMinutes = Number.isFinite(minutes) ? minutes : 0;
    const hours = Math.floor(safeMinutes / 60);
    const remainder = safeMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
};

export const timeStringToPixels = (timeString, pixelsPerMinute) => {
    const safePixelsPerMinute = pixelsPerMinute > 0 ? pixelsPerMinute : 1;
    const [hours, minutes] = timeString.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
    const totalMinutes = (hours - 4) * 60 + minutes;
    return totalMinutes * safePixelsPerMinute;
};

export const pixelsToTimeString = (pixels, pixelsPerMinute) => {
    const safePixelsPerMinute = pixelsPerMinute > 0 ? pixelsPerMinute : 1;
    const totalMinutes = safePixelsPerMinute ? pixels / safePixelsPerMinute : 0;
    const roundedMinutes = Math.round(totalMinutes / 15) * 15;
    const hours = Math.max(4, Math.min(24, Math.floor(roundedMinutes / 60) + 4));
    const minutes = hours === 24 ? 0 : roundedMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};
