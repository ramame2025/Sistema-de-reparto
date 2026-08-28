/**
 * Argentine peso formatting for on-screen amounts: dot as the thousands
 * separator, no decimals.
 *
 * Deliberately hand-rolled instead of `toLocaleString('es-AR')`, which the
 * rest of the app still uses: that call depends on the JS engine shipping
 * full ICU data, and Hermes on a release Android build does not always do
 * so — it silently degrades to `8200` with no separator. A price the driver
 * misreads is money, so this stays deterministic on every device and in
 * every test runner.
 */
export function formatArs(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  const grouped = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${sign}$${grouped}`;
}
