/**
 * Manual mock for `expo-image-picker`, used by ExpensesScreen (PR8) for
 * gallery/camera receipt capture. Placed under `<rootDir>/__mocks__/` so
 * Jest auto-substitutes it for every test that imports the real module —
 * no `jest.mock('expo-image-picker')` call needed at each call site (this
 * is Jest's documented behavior for node_modules-scoped manual mocks, as
 * opposed to user modules which always require an explicit call).
 *
 * Default resolved shape matches the success case
 * (`{ canceled: false, assets: [{ uri: 'file://fake.jpg' }] }`); individual
 * tests override with `mockResolvedValueOnce`/`mockResolvedValue` for the
 * cancel case (`{ canceled: true }`) or permission-denied case.
 */
export const MediaTypeOptions = { Images: 'Images' };

export const requestMediaLibraryPermissionsAsync = jest.fn(async () => ({ granted: true }));
export const requestCameraPermissionsAsync = jest.fn(async () => ({ granted: true }));

export const launchImageLibraryAsync = jest.fn(async () => ({
  canceled: false,
  assets: [{ uri: 'file://fake.jpg' }],
}));

export const launchCameraAsync = jest.fn(async () => ({
  canceled: false,
  assets: [{ uri: 'file://fake.jpg' }],
}));
