/**
 * Manual mock for `expo-location`, used by NewSaleScreen (Phase 5,
 * point-in-time geolocation) to capture a lat/lng reading when a sale is
 * confirmed. Placed under `<rootDir>/__mocks__/` following the exact same
 * convention already established for `expo-image-picker` (see that file's
 * own comment) -- Jest auto-substitutes it for every test that imports the
 * real module, no `jest.mock('expo-location')` call needed at each call
 * site.
 *
 * Default resolved shape matches the success case (permission granted, a
 * fix available); individual tests override with
 * `mockResolvedValueOnce`/`mockResolvedValue` for the denied-permission case
 * or with an implementation that never resolves to simulate a timeout.
 */
export const Accuracy = { Balanced: 3 };

export const requestForegroundPermissionsAsync = jest.fn(async () => ({ granted: true }));

export const getCurrentPositionAsync = jest.fn(async () => ({
  coords: {
    latitude: -34.6037,
    longitude: -58.3816,
  },
}));
