import { type GeoPoint, distanceKm, sortByProximity } from '@distribuidor/shared';

describe('distanceKm', () => {
  // Plaza de Mayo (Buenos Aires) -> Obelisco: ~1.47km real-world distance.
  const plazaDeMayo: GeoPoint = { latitude: -34.6083, longitude: -58.3712 };
  const obelisco: GeoPoint = { latitude: -34.6037, longitude: -58.3816 };

  it('returns a result within a small tolerance of the known real-world distance', () => {
    const result = distanceKm(plazaDeMayo, obelisco);
    expect(result).toBeGreaterThan(0.8);
    expect(result).toBeLessThan(1.3);
  });

  it('returns 0 for the same point', () => {
    expect(distanceKm(plazaDeMayo, plazaDeMayo)).toBe(0);
  });

  it('is symmetric', () => {
    expect(distanceKm(plazaDeMayo, obelisco)).toBeCloseTo(
      distanceKm(obelisco, plazaDeMayo),
      10,
    );
  });
});

describe('sortByProximity', () => {
  const origin: GeoPoint = { latitude: -34.6037, longitude: -58.3816 };

  type LocatedItem = { id: string; latitude?: number; longitude?: number };

  it('orders located items ascending by distance from the origin', () => {
    const near: LocatedItem = { id: 'near', latitude: -34.604, longitude: -58.382 };
    const mid: LocatedItem = { id: 'mid', latitude: -34.62, longitude: -58.4 };
    const far: LocatedItem = { id: 'far', latitude: -34.9, longitude: -58.7 };

    const result = sortByProximity(origin, [far, near, mid]);

    expect(result.map((item) => item.id)).toEqual(['near', 'mid', 'far']);
  });

  it('appends items missing latitude or longitude at the end, in original relative order, without dropping them', () => {
    const located: LocatedItem = { id: 'located', latitude: -34.604, longitude: -58.382 };
    const noLatitude: LocatedItem = { id: 'no-latitude', longitude: -58.4 };
    const noLongitude: LocatedItem = { id: 'no-longitude', latitude: -34.6 };
    const noCoords: LocatedItem = { id: 'no-coords' };

    const result = sortByProximity(origin, [noLatitude, located, noCoords, noLongitude]);

    expect(result).toHaveLength(4);
    expect(result[0].id).toBe('located');
    expect(result.slice(1).map((item) => item.id)).toEqual([
      'no-latitude',
      'no-coords',
      'no-longitude',
    ]);
  });
});
