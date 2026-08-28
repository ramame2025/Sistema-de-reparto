# Change: Admin-Managed Product Catalogue with Historical Pricing

Status: **planned — not implemented**.

Supersedes [`product-prices-admin.md`](./product-prices-admin.md), which
assumed a fixed catalogue. The owner has since decided products must be
created by the admin, so that plan's premise no longer holds. Its analysis
of the `DEFAULT_PRICE_TABLE` divergence still stands and is carried over.

## Business Decisions Confirmed by the Owner

1. The **admin creates products and sets their prices**. Nothing about the
   catalogue is hardcoded.
2. **Only the admin** may change products or prices.
3. The driver **sees the active catalogue and enters quantities sold** —
   nothing else. Global catalogue, not per-truck: the load manifest stays
   the driver's, exactly as today.
4. **A sale keeps the prices in force when it happened.** A later price
   change applies only to later sales.

**Operational context, from the owner:** drivers sync and close their
sales the same day, before ending their shift. A sale surviving overnight
into a price change is therefore unlikely — the price snapshot is wanted
as insurance, not as a routine path.

## Current State (verified against the code and the live database)

### Already built
- `ProductPrice` is a real table with all 12 rows (4 products × 3 customer
  types) seeded by migration; `GET /prices`, `GET /prices/table` and
  `PUT /prices/:productCode/:customerType` exist and work.
- Sales are priced server-side from that table (`sales.service.ts:127`).

### What blocks the requirements

**A. Products are a Prisma enum.** `ProductCode` (`G10`, `G15`, `G45`,
`G15_AUTO`) is referenced by three tables — `SaleItem`,
`LoadManifestItem`, `ProductPrice` — and mirrored as `PRODUCT_CODES` in
`packages/shared`. Adding a product needs a migration and a deploy.

**B. Requirement 4 fails today, by three independent paths.** This is the
core of the change, and no single fix covers all three:

1. **`SaleItem` has no unit price.** It stores `productCode` and
   `quantity`; only the aggregate `Sale.total` is kept. The price a line
   sold at was never recorded, so it cannot be recovered for any past sale.
2. **Editing a sale reprices it at today's rates.** `updateSale`
   (`sales.service.ts:256`) calls `getPriceTable()` and recomputes. Fixing
   a quantity on a March sale moves its total to August prices.
3. **Offline sales are priced when they sync, not when they happen.** The
   queue stores quantities only (`offlineQueue.ts`); the API computes the
   total on arrival. A sale made Monday without signal and synced
   Wednesday, after a price change, is recorded at Wednesday's price.

   Path 3 is the dangerous one: it needs nobody to edit anything. It
   happens by itself, silently, after the driver already collected a
   different amount.

**C. `Sale` has no notion of when the sale happened.** `createdAt`
defaults to `now()` at insert and `createSale` never overrides it, and
`CreateSaleInput` carries no timestamp. So a synced-Wednesday sale is also
*dated* Wednesday — which is what makes path 3 unfixable without a new
field.

**D. The driver app still prices from `DEFAULT_PRICE_TABLE`.**
`NewSaleScreen.tsx:141` computes the on-screen total from the hardcoded
constant while the API records one from the database. They agree only
because the migration seeded identical numbers. Editable prices is the
event that breaks the tie.

**E. The whole `/prices` controller is admin-only**, so the driver app
cannot read prices even if it wanted to.

### Why now

The live database holds **3 sales, 5 sale items, 4 manifest items**. The
enum-to-table migration is therefore a data migration of five rows. The
same change against a year of sales is a different project. If it is ever
going to happen, this is the cheapest it will ever be.

## Design Decisions

**D1 — `Product` table, `code` kept as a stable human-readable key.**
`id`, `code` (unique), `name`, `isActive`, `sortOrder`. Existing enum
values become the first four rows, so `G10` still reads as `G10`
everywhere.

**D2 — Products are deactivated, never deleted.** `onDelete: Restrict` on
every reference. A product that ever appeared on a sale must remain
readable forever; `isActive: false` merely hides it from the driver.

**D3 — `ProductPrice` becomes append-only, keyed by `validFrom`.**
Changing a price *inserts* a row rather than updating one. The current
price is the newest row with `validFrom <= now`. This is what makes
"price as of a date" answerable at all, and it yields the price audit
trail for free.

**D4 — `SaleItem` stores `unitPrice`, frozen at creation.** Even with D3,
the line item keeps its own copy. It is the definitive record, immune to
any later correction of the history table, and it makes reporting a plain
read with no temporal join.

**D5 — `Sale` gains `occurredAt`, supplied by the device.** Pricing uses
`occurredAt`, not `createdAt`. This is what lets an offline sale be priced
at the moment it happened.

To keep a wrong or malicious device clock from buying old prices,
`occurredAt` is clamped server-side: never in the future, never older than
30 days, falling back to `now()` outside that window.

> **Justification revised by the owner.** Drivers sync before closing
> their shift, so a sale outliving a price change is rare to the point of
> hypothetical, and `occurredAt` cannot be defended on price drift alone.
> It earns its place on a duller case instead: **midnight**. A sale made
> at 23:50 and synced at 00:05 is otherwise recorded on the following
> day, which corrupts the day's takings and the driver's own cash count
> even when no price has ever changed. `unitPrice` (D4) stays regardless
> — the owner wants the price recorded on the sale "just in case", and it
> costs one column.

**D6 — Editing a sale reprices at that sale's own `occurredAt`,** never
at today's. Requirement 4 applies to corrections too.

**D7 — Creating a product creates its three prices in the same
transaction.** `getPriceTable()` throws a 500 if any product is missing
any customer type's price, which would break *every* sale in the system.
A product without prices must therefore never exist, not even briefly.

**D8 — `DEFAULT_PRICE_TABLE` stops being a runtime fallback.** It remains
only as the seed source. The driver app fetches and caches the catalogue
and prices; offline it uses the last cached copy **with a visible
out-of-date warning**, and with no cache at all it blocks the sale rather
than inventing a number. A confidently displayed wrong price is worse than
a refusal.

**D9 — Reports keep filtering by `createdAt` in this change.** Adding
`occurredAt` exposes a second, more truthful date, and moving the reports
onto it is a real improvement — but it changes numbers the owner already
reads, so it belongs to its own change with its own review.

## Phases

Each phase is a reviewable slice. The ordering is deliberate: **the
correctness fixes ship before the admin screen that would otherwise
weaponise them.**

**Phase 1 — `Product` table and data migration. ✅ DONE.** Enum to table, FKs on
the three referencing tables, four seeded products, `products` module with
admin-only writes and a catalogue readable by both roles. `packages/shared`
loses `PRODUCT_CODES` as a closed set. No visible behaviour change.

**Phase 2 — Historical pricing. ✅ DONE.** `validFrom` on `ProductPrice`
(D3), `unitPrice` on `SaleItem` (D4), `occurredAt` on `Sale` (D5), pricing
at a date, repricing an edit at its own date (D6). This is the phase that
actually satisfies requirement 4.

Verified over HTTP against a clone of the live database: a sale at 8500
stays at 17000 with `unitPrice` 8500 after the price moves to 12000; a new
sale takes 24000; a sale carrying an `occurredAt` 30 hours old is recorded
at 8500; editing the old sale's quantity yields 25500 rather than 36000;
and an `occurredAt` two years old is clamped to now and pays 12000. API
suite 352 tests, 21 suites.

The `unitPrice` backfill is honest about its limit — that figure was never
recorded, so existing rows are *reconstructed* from the price in force.
The migration verifies the premise instead of assuming it, aborting if any
row is left without a price or if any pair already had more than one
version. On the live data the five reconstructed lines sum to the stored
totals exactly.

**Phase 3 — The driver app consumes the catalogue. ✅ DONE.** Fetch and
cache products and prices, render the product list from the catalogue
instead of a constant, send `occurredAt`, show the staleness warning, block
with no cache (D8). After this phase the number the driver sees and the
number the API records cannot disagree.

Shipped: `GET /prices/table` opened to `chofer` (reads only — writes stay
admin-only); `services/catalog.ts` caching products and prices as one
entry; `CatalogContext` exposing `stale` and `canSell`; both `NewSaleScreen`
and `LoadManifestScreen` rendering from the catalogue; `occurredAt` stamped
on sales and empty visits. `DEFAULT_PRICE_TABLE` and `PRODUCT_CODES` no
longer appear anywhere in the driver app's runtime code. Driver-app suite
274 tests, 31 suites.

**Phase 4 — Admin screens. ✅ DONE.** `/admin/productos`: create a product
with its three prices, rename, reorder, activate/deactivate, and edit
prices. The report product filter becomes dynamic.

Verified end-to-end against a clone of the live database: renaming `G10` to
"Garrafa 10 kg"; creating `G20` with its three prices and seeing it appear
for the driver; deactivating `G45`, which disappears from the driver's
catalogue **while its price stays in the table**, so a sale for it queued
earlier still syncs at 39000. A driver gets 403 on `POST /products` and
`PUT /prices/...`, and 200 on `GET /prices/table`. Dashboard suite 40
tests, 6 suites.

It also fixed a latent bug Phase 2 introduced: with `ProductPrice`
append-only, `GET /prices` was returning **every historical version**. Any
screen listing it would have shown the same product repeated at different
prices with no indication of which one was in force. It now returns the
current row per product and customer type.

**All four phases are complete.**

## Risks

**R1 — The enum-to-table migration is irreversible in practice.** It is
also the whole point. Mitigated by the tiny data volume, a rehearsal
against a dump before running it, and by keeping `code` stable so every
existing value still reads the same.

**R2 — Backfilling `unitPrice` on the five existing sale items is
best-effort.** That data was never recorded. Prices have not changed since
the seed, so backfilling from the current table is exact today — but the
migration must verify that assumption rather than assume it.

**R3 — A stale offline cache still quotes stale prices.** Mitigated, not
removed: the warning makes it visible and the cache refreshes on every
start and sync. Removing it entirely would mean refusing to sell offline,
which is worse for the business.

**R4 — `getPriceTable()` throws 500 when any product lacks a price.** D7
closes the creation path. A test must pin the invariant, because the
failure mode is total: no sale can be recorded.

## Deferred: driver's daily close

The owner raised a "close the day" action for the driver, which would
notify the admin. **Deliberately not in this change**, and nothing here
depends on it, so deferring costs no rework.

Why it waits:

- **The integrity half is largely built.** `HomeScreen` already shows a
  pending count and warns on logout with the exact number and its
  consequence; `SyncScreen` lists each stuck sale with a manual retry. The
  driver is already told.
- **The real gap is admin visibility**, which is a supervision feature
  with a different audience and a different screen — not a data-integrity
  fix, and not part of pricing.
- **A button cannot force a sync.** With no signal, "close the day" sends
  nothing. Its actual value is to *refuse to close* and make the gap
  visible to the admin — accountability and a record, not delivery. Worth
  designing with that framing rather than the one the name suggests.

Open questions to settle before it becomes a plan of its own: may a driver
keep selling after closing; what happens to a sale that arrives after the
close; does closing require zero pending sales or close anyway and report
the gap; and how the admin is notified.

## Success Criteria

- The admin creates a product with its three prices; the driver sees it
  after a restart or sync and can sell it, with no deploy.
- The admin raises a price; sales recorded before the change keep their
  original totals, and a sale made offline before the change and synced
  after it is still recorded at the old price.
- Correcting a quantity on an old sale does not move its unit prices.
- Deactivating a product hides it from the driver and leaves every past
  sale readable.
- A driver cannot create, edit or price a product through the API.
- With no network, the driver still sells at the last known prices, with a
  visible warning.
