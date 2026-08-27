# Change: Editable Product Prices in Admin

Status: **planned — not implemented**.

Related: [`customer-truck-pricing-foundations.md`](./customer-truck-pricing-foundations.md)
made prices DB-backed. This change makes them *editable by a human*, and
closes the gap that decision knowingly left open.

## Business Decision Confirmed by the Owner

The **product catalogue stays fixed** — `G10`, `G15`, `G45`, `G15_AUTO`
remain a Prisma enum. Adding a fifth product keeps requiring a migration
and a deploy. Only **prices** become editable from the admin.

Rejected alternatives, recorded so the question is not reopened blindly:
turning the enum into a `Product` table (biggest change in the roadmap so
far: FKs on `SaleItem`, `LoadManifestItem` and `ProductPrice`, plus data
migration of live sales), and a middle option adding a catalogue table for
display name / ordering / active flag without new products.

## Current State (verified, not assumed)

### Already built

| Piece | Location |
|---|---|
| `ProductPrice` table, unique on `(productCode, customerType)` | `apps/api/prisma/schema.prisma` |
| All 12 rows (4 products × 3 customer types) seeded by migration | `20260815160105_add_customer_truck_pricing/migration.sql` |
| `GET /prices`, `GET /prices/table`, `PUT /prices/:productCode/:customerType` | `apps/api/src/prices/prices.controller.ts` |
| `PricesService.getPriceTable()` — throws 500 if any of the 12 is missing | `apps/api/src/prices/prices.service.ts` |
| Sales priced from the DB table | `apps/api/src/sales/sales.service.ts:127` |

### Gaps

1. **No admin screen.** `apps/dashboard` contains no reference to prices
   at all. The only way to change one today is a raw HTTP call.
2. **The whole `/prices` controller is admin-only.** The class carries
   `@Roles('admin')` and no method overrides it, so a driver cannot read
   the price table even though the app needs it.
3. **The driver app prices sales from a hardcoded constant.**
   `NewSaleScreen.tsx:141` calls `calculateSaleTotal(..., DEFAULT_PRICE_TABLE)`
   while the API records a total computed from the database.

## The bug this change would otherwise create

Gap 3 is the reason the admin screen cannot ship alone.

Today the two totals agree, but only by coincidence: the migration seeded
exactly the numbers in `DEFAULT_PRICE_TABLE`. The moment an admin raises
the price of a G15 through the new screen, the driver quotes the **old**
price to the customer, collects it, and the API records the **new** one.
The difference comes out of the driver's pocket or the customer's, and
nobody finds out until the till is counted.

This was a deliberate, documented tradeoff
(`customer-truck-pricing-foundations.md`, "Approach": *DEFAULT_PRICE_TABLE
remains … as the driver-app's client-side preview fallback*). It was sound
while nobody could change a price. Making prices editable is exactly the
event that invalidates it.

**Therefore the driver app is fixed first, before the screen that would
weaponise the divergence exists.**

## Design Decisions

**D1 — The driver app reads the price table from the API and caches it.**
`GET /prices/table` already returns exactly the `PriceTable` shape
`calculateSaleTotal` expects, so nothing is reshaped.

**D2 — `GET /prices/table` opens to `chofer`; every write stays admin-only.**
Per-method `@Roles`, mirroring how `CustomersController` already grants
`listCustomers` and `createCustomer` to both roles while leaving the class
default at admin.

**D3 — Offline: last cached table, never the hardcoded one, and never
silently.** The app persists each fetched table to `AsyncStorage` next to
the existing offline queue. On a failed fetch it uses the last cached
table and **says on screen that prices may be out of date**. A wrong
number shown confidently is worse than a wrong number shown with a
warning.

**D4 — With no cache at all, the sale is blocked, not guessed.** A fresh
install that has never reached the API has no honest price to show.
`DEFAULT_PRICE_TABLE` stays in `packages/shared` as the migration's seed
source only — it stops being a runtime fallback. This is the decision that
actually removes the class of bug, rather than narrowing it.

**D5 — No price history in this change.** Past sales already store their
own `total`, so editing a price never rewrites history. An audit trail of
who changed which price and when is a real need, but a separate one; it is
recorded under "Out of scope" rather than smuggled in.

**D6 — Amounts stay whole pesos (`Int`).** Consistent with `Sale.total`
and the seeded values. No cents, no decimals, no currency change.

## Scope

### `apps/api`
- `@Roles('admin', 'chofer')` on `getPriceTable` only (D2).
- Controller-level test asserting the writes stay admin-only — the whole
  point is that a driver reads prices and never sets them.

### `apps/driver-app`
- `services/prices.ts` — fetch + cache the table, expose the cached one
  with a staleness flag.
- `context/PriceContext.tsx` — mirrors the existing `TruckContext` shape,
  so the app has one price table rather than one per screen.
- `NewSaleScreen` — price from the context; show the staleness warning;
  block the sale when there is no table at all (D4).
- `LoadManifestScreen` — uses `PRODUCT_CODES` only for quantities, no
  prices; verify it is untouched.

### `apps/dashboard`
- New `/admin/precios`: the 4 × 3 grid, one editable amount per cell,
  saved through `PUT /prices/:productCode/:customerType`.
- Sidebar entry.

### Out of scope
- New products, renaming, activating/deactivating (owner's decision).
- Price history / audit trail (D5).
- Per-customer or per-zone prices.

## Risks

**R1 — A driver on a stale cache still quotes a stale price.** Mitigated,
not eliminated: the warning makes it visible, and the table refreshes on
every app start and on every successful sync. Eliminating it entirely
would require refusing to sell offline, which is worse for the business.

**R2 — `getPriceTable` throws 500 when any of the 12 rows is missing.**
Today all 12 are seeded and `updatePrice` cannot create or delete rows, so
the set is closed. Worth a test that pins that invariant, since a future
product would silently break every sale until its 3 rows exist.

## Phases

**Phase 1 — the correctness fix.** Open `GET /prices/table` to drivers;
driver app fetches, caches, warns when stale, blocks when empty. No admin
UI. Shipping this alone already removes the divergence.

**Phase 2 — the admin screen.** `/admin/precios`, the grid, the sidebar
entry. Safe to ship only once Phase 1 is in.

## Success Criteria

- An admin changes a price; the driver app shows the new one after a
  restart or a sync, and the recorded total matches what the driver saw.
- With the network off, the driver still sells, at the last known prices,
  with a visible staleness warning.
- A driver cannot change a price through the API.
- Past sales keep their recorded totals after a price change.
