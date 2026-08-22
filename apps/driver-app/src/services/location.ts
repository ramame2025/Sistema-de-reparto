import * as Location from 'expo-location';

// Tunable: no timing data exists yet for real GPS-fix latency in the
// driver's actual delivery zones -- this is a placeholder best-guess
// (Design decision #7 / Open Question 4), trivially adjustable in this one
// place without touching any other layer.
const DEFAULT_LOCATION_TIMEOUT_MS = 8000;

export type CapturedLocation = { latitude: number; longitude: number };

/**
 * Extracted from NewSaleScreen.tsx's phase-5 captureSaleLocation (Design
 * decision #5, docs/plans/customer-picker-proximity.md): the same
 * permission-request + timeout-guarded one-shot read, now reusable from
 * more than one call site. Behavior is byte-for-byte identical to phase 5's
 * original inline version -- this is a pure move, not a rewrite. timeoutMs
 * defaults to 8000 (phase 5's LOCATION_TIMEOUT_MS), overridable per call
 * site if a future screen needs a different budget.
 *
 * Optional everywhere (Open Question 1): a denied permission, no fix, or a
 * read slower than timeoutMs all resolve to `null` -- the caller always
 * still proceeds, same "never block on a missing device signal" invariant
 * already proven for containerReturned/paymentProofRef.
 */
export async function captureDeviceLocation(
  timeoutMs = DEFAULT_LOCATION_TIMEOUT_MS,
): Promise<CapturedLocation | null> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      return null;
    }

    let timeoutId: ReturnType<typeof setTimeout>;
    // Cleared in `finally` regardless of which side of the race wins -- an
    // uncleared timer would otherwise keep firing timeoutMs later even
    // after a successful fast read, leaking a handle.
    const timeout = new Promise<null>((resolve) => {
      timeoutId = setTimeout(() => resolve(null), timeoutMs);
    });

    try {
      const reading = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        timeout,
      ]);

      if (!reading) {
        return null;
      }

      return { latitude: reading.coords.latitude, longitude: reading.coords.longitude };
    } finally {
      clearTimeout(timeoutId!);
    }
  } catch {
    return null;
  }
}
