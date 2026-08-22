const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees) => (degrees * Math.PI) / 180;
/** Great-circle distance between two lat/lng points, in kilometers. */
export function distanceKm(a, b) {
    const dLat = toRadians(b.latitude - a.latitude);
    const dLon = toRadians(b.longitude - a.longitude);
    const lat1 = toRadians(a.latitude);
    const lat2 = toRadians(b.latitude);
    const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}
/**
 * Stable sort: items with both coordinates set are ordered nearest-to-origin
 * first; items missing either coordinate are left in their original relative
 * order, appended after every located item (Design decision #10 — sort, never
 * filter).
 */
export function sortByProximity(origin, items) {
    const located = items
        .map((item, index) => ({ item, index }))
        .filter((entry) => entry.item.latitude !== undefined && entry.item.longitude !== undefined);
    const unlocated = items.filter((item) => item.latitude === undefined || item.longitude === undefined);
    located.sort((a, b) => distanceKm(origin, a.item) - distanceKm(origin, b.item) || a.index - b.index);
    return [...located.map((entry) => entry.item), ...unlocated];
}
