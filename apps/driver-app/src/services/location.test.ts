import * as Location from 'expo-location';
import { captureDeviceLocation } from './location';

const mockedRequestForegroundPermissionsAsync =
  Location.requestForegroundPermissionsAsync as jest.Mock;
const mockedGetCurrentPositionAsync = Location.getCurrentPositionAsync as jest.Mock;

beforeEach(() => {
  mockedRequestForegroundPermissionsAsync.mockClear();
  mockedRequestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
  mockedGetCurrentPositionAsync.mockClear();
  mockedGetCurrentPositionAsync.mockResolvedValue({
    coords: { latitude: -34.6037, longitude: -58.3816 },
  });
});

// Phase 6 PR3 (docs/plans/customer-picker-proximity.md, Design decision #5):
// captureDeviceLocation is a verbatim extraction of NewSaleScreen.tsx's
// former inline captureSaleLocation -- these are the same three cases phase
// 5 already covered in NewSaleScreen.test.tsx, moved here to prove the
// extracted function behaves identically.
describe('captureDeviceLocation', () => {
  it('returns latitude/longitude when permission is granted and the read succeeds', async () => {
    const result = await captureDeviceLocation();

    expect(result).toEqual({ latitude: -34.6037, longitude: -58.3816 });
  });

  it('returns null when the location permission is denied', async () => {
    mockedRequestForegroundPermissionsAsync.mockResolvedValue({ granted: false });

    const result = await captureDeviceLocation();

    expect(result).toBeNull();
    expect(mockedGetCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('returns null when the read never resolves before the timeout', async () => {
    jest.useFakeTimers();
    try {
      mockedGetCurrentPositionAsync.mockReturnValue(new Promise(() => {}));

      const pending = captureDeviceLocation();
      await jest.advanceTimersByTimeAsync(8000);

      await expect(pending).resolves.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
