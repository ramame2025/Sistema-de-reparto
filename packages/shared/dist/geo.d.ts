export type GeoPoint = {
    latitude: number;
    longitude: number;
};
/** Great-circle distance between two lat/lng points, in kilometers. */
export declare function distanceKm(a: GeoPoint, b: GeoPoint): number;
/**
 * Stable sort: items with both coordinates set are ordered nearest-to-origin
 * first; items missing either coordinate are left in their original relative
 * order, appended after every located item (Design decision #10 — sort, never
 * filter).
 */
export declare function sortByProximity<T extends Partial<GeoPoint>>(origin: GeoPoint, items: T[]): T[];
