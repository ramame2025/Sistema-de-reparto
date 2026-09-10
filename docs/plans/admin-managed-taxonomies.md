# Change: Admin-Managed Taxonomies — Zones, Customer Categories, Per-Product Truck Capacity

Status: **All five phases (0–4) implemented. Working tree, uncommitted.**

## ⚠️ PENDING — three migrations written but NOT applied

They must be applied in this order; `migrate deploy` runs all three in one go.
Phase 1's `20260909120000_distribution_zones` is **already applied**.

| # | Migration | Phase | What it does |
|---|---|---|---|
| 1 | `20260909150000_customer_categories` | 3 | enum `CustomerType` → table; FKs on `Customer`/`ProductPrice`, none on `Sale` |
| 2 | `20260909180000_truck_product_capacity` | 4 | creates `TruckCapacity`, **drops `Truck.capacity`** |
| 3 | `20260909190000_drop_customer_zone_shadow` | 4 | drops the `Customer.zone` shadow column |

```bash
cd apps/api && set -a && . ../../.env && set +a && npx prisma migrate deploy
```

The `set -a && . ../../.env` prefix is **required**: the `.env` lives at the
monorepo root, and the Prisma CLI only auto-loads one from its own cwd or
`prisma/`. Without it the command dies with `P1012 DATABASE_URL not found`.
The NestJS app has no such problem — `app.module.ts` walks up to the root
explicitly.

### After applying, two things need doing

1. **Load each truck's per-product capacity grid** in `/admin/camiones`.
   Every truck reads "sin detallar" until then, by design — the old single
   total was discarded rather than split by guesswork.
2. **Do not ship the driver app mid-shift.** The catalogue cache key moved to
   `driver_catalog_v2`, so a driver who updates holds an unreadable cache and
   cannot sell until the phone reaches signal once.

Follows the pattern established by
[`dynamic-product-catalog.md`](./dynamic-product-catalog.md): a Prisma enum
becomes a table whose `code` is the immutable key travelling over the wire,
rows are retired with `isActive` rather than deleted, and every historical
reference is protected by `onDelete: Restrict`.

## Business Decisions Confirmed by the Owner

1. **Truck capacity is per product.** Today a truck declares a single total
   unit count; the owner wants "how many units of which product fit".
2. **Customer types are admin-defined.** `final` / `comercio` /
   `distribuidor` stop being hardcoded.
3. **Distribution zones are admin-defined**, assigned to customers. The
   admin creates zones; how a zone maps to a driver is explicitly
   **deferred** — the owner is still undecided because trucks get diverted
   to other customers as needed.
4. **Assigned-customers screen filters by zone**, so the admin can pick a
   whole zone rather than hunting names.
5. **A new customer type is born incomplete.** Products show its missing
   prices in red until the admin fills them. Prices are NOT copied from an
   existing type. Rationale from the owner's choice: an empty cell shouts,
   an inherited price lies silently.

## Current State (verified against the code)

### Truck capacity is decorative
`Truck.capacity` is a plain `Int`. It is rendered in
`apps/driver-app/src/screens/LoadManifestScreen.tsx:206` and validated as a
non-negative integer in `packages/shared/src/domain.ts:873`. **Nothing
enforces it against a load manifest.** Making it per-product is therefore
purely additive — no behaviour regresses.

### Customer type is a Prisma enum reaching three tables
`enum CustomerType` is referenced by `Customer.customerType`,
`Sale.customerType` and `ProductPrice.customerType`, the last inside the
unique constraint `(productCode, customerType, validFrom)`. It is mirrored
in `packages/shared` as `CUSTOMER_TYPES` and consumed by 8 call sites in
the API, dashboard and driver app.

### Zone is a free-text string used for duplicate detection
`Customer.zone` is `String?`. `customers.service.ts:36` normalizes it
(`trim().toLowerCase()`) to decide whether two customers collide on
`name + zone`. "Centro" and "centro " already resolve alike, but only by
string coincidence — nothing stops a fourth spelling from forking a zone.

### The `?? 0` hole (blocks decision 5)

```ts
// packages/shared/src/domain.ts:452  — driver-side quote
const unitPrice = prices[customerType][item.productCode] ?? 0;
// apps/api/src/sales/sales.service.ts:149 — server-side frozen price
unitPrice: priceTable[customerType][item.productCode] ?? 0,
```

There were **five** such lookup sites, not two — `NewSaleScreen` quoted
inline without going through the shared helper at all, which is precisely
the divergence that makes this a money risk.

All were safe **only** because the price matrix could not have holes: the
enum is fixed and `validateCreateProductInput` (`domain.ts:1039`) requires
a price for every customer type. Decision 5 deliberately destroys that
guarantee, and then `?? 0` **sells the goods for free** with no error.

### The table-build blast radius (found while planning Phase 0)

`prices.service.ts:getPriceTableAt` did not merely misprice a hole — it
threw `InternalServerErrorException`, with a comment stating the intent
outright: *"Un producto sin precio no rompe su propia venta: rompe
TODAS."*

That was the correct call under the old premise. Under decision 5 it means
one incomplete category returns **HTTP 500 on every sale in the system**,
including customers of fully-priced categories. So Phase 0 had to move the
failure, not just harden it: the table becomes **sparse** (holes are
legitimate) and the rejection happens at quoting time, where it can name
the missing pair.

## Phases

### Phase 0 — Close the `?? 0` hole (prerequisite for Phase 3) — **DONE**

No new feature, no schema change. Pure hardening, shippable on its own.
Delivered with strict TDD; **not committed**, per the owner's standing rule.

- `packages/shared`: `PriceTable` is now sparse at both levels
  (`Partial<Record<CustomerType, Partial<Record<ProductCode, number>>>>`).
  New `findUnitPrice` and `priceSaleItems` return discriminated results;
  `priceSaleItems` reports **every** missing pair, de-duplicated by
  product code, and returns the priced lines together with the total so
  the two can never diverge.
- **`calculateSaleTotal` was deleted**, not adapted. Leaving a
  `number`-returning variant would have kept a silent-zero escape hatch
  alive, which is the whole thing being removed.
- `prices.service.ts`: `getPriceTableAt` omits a missing cell instead of
  throwing, returning the sparse table.
- `sales.service.ts`: `createSale` and `updateSale` route through a
  private `priceItemsOrReject`, which throws `BadRequestException` (400 —
  a configuration gap, not a server fault) naming every missing pair,
  **before** any row is written. Churn short-circuits, so a container
  return is never rejected for missing prices.
- `dayProblems.ts`: an unpriceable queued sale maps to `total: undefined`,
  which is exactly what its existing `total?` contract already meant.
- `NewSaleScreen.tsx`: total and unit price now go through the shared
  primitives; an unquotable customer gets a Spanish banner
  (`new-sale-unpriced-customer`), a disabled footer action, and a guard
  inside `saveSale`. `SaleFooterBar.total` widened to accept `undefined`
  and renders `—`, because showing `$0` would under-report.

Verified: api **415 tests / 22 suites**, driver-app **483 / 57**,
dashboard **82 / 10**, `tsc --noEmit` clean in all three.

Deliberately left alone: `SaleDetailScreen.tsx:133`'s `?? 0` is not a
price hole — `unitPrices` is built from `sale.items` and the items are
filtered from that same array, so the key is always present. And
`validateCreateProductInput` still demands a price per type; relaxing it
is Phase 3's job.

### Phase 1 — Zones — **DONE** (migration applied to the dev database)

- Table `Zone` (`code` unique and immutable, `name`, `isActive`,
  `sortOrder`), `Customer.zoneId` + `zoneRef` with `onDelete: Restrict`.
  `Customer.zone` stays as a shadow column and dies in Phase 4; the server
  keeps it in sync with the resolved zone's `name` so the two can never
  contradict each other while both exist.
- Migration `20260909120000_distribution_zones` **seeds zones from the data
  already in the database** (`INSERT ... SELECT DISTINCT ON`), deduplicated
  by the same `trim + lower` rule the old code used, so it merges and splits
  nothing the system did not already treat as one zone. Codes are uppercase
  slugs with accents folded via `translate()` (not `unaccent()`, which is an
  extension this database need not have); slug collisions get a numeric
  suffix rather than losing a row to the unique index.
- `zones` module: `GET /zones` for both roles with the admin-only
  `includeInactive` guard, `POST`/`PATCH` admin-only.
- Duplicate detection is now `name + zoneId`; a null zone is still its own
  bucket, not a wildcard. This is **strictly stricter** than before — four
  spellings of "Centro" can no longer fork a zone in silence.
- `/admin/zonas` (create, rename, reorder, activate/deactivate) plus a
  sidebar entry; both "Zona" inputs in `/admin/clientes` are now selects fed
  by `GET /zones`, with an explicit "Sin zona" option.
- **Assigning a deactivated zone is rejected**, unlike an inactive product
  code, which `assertProductCodesExist` accepts on purpose. A product code
  arrives inside a sale queued on a phone before the product was hidden, so
  refusing it would lose a real sale; a zone is picked from a live list by
  an admin at a desk, so an inactive one is a mistake, not a late sync.
- The driver app was **not touched**. Its quick-create only ever sent
  `name` + `customerType`, never a zone, and it only renders
  `duplicate.zone`, which still carries the display name. The zone picker
  this plan originally sketched for the driver was scope nobody asked for.

Verified: api **473 tests / 24 suites**, dashboard **100 / 11**, driver-app
**483 / 57**, `tsc --noEmit` clean in all three.

### Phase 2 — Zones in assigned customers — **DONE**

- `/admin/clientes-asignados` gains a "Zona" select fed by `GET /zones`
  (active zones only — building tomorrow's route out of a zone the admin
  already retired makes no sense), with "Todas las zonas" as the default
  and an explicit "Sin zona" entry. A customer with no zone is **its own
  group, not a wildcard** — the same semantics the server's duplicate
  detection uses — so it needs its own sentinel value, because `""`
  already means "do not filter".
- A "Tildar los N visibles" button checks everything the current filters
  show. It **unions** with what is already checked rather than replacing
  it: the admin builds a route zone by zone, and the second batch must not
  erase the first. Unchecking stays per-customer, which is the reversible
  action.
- The zone filter composes with the existing name search, and each row now
  shows its zone (or "sin zona").
- **No schema change**, and the stored artefact is unchanged: still a list
  of `customerIds` per driver+date. `save()` already mapped over the full
  customer list rather than the filtered one, so customers checked under a
  different zone survive the save untouched.
- The temporary driver↔zone assignment the owner is undecided about stays
  out of scope on purpose: this delivers the real workflow without
  committing to a model that may be wrong.

Verified: dashboard **104 tests / 11 suites**, api **473 / 24**,
`tsc --noEmit` clean.

### Phase 3 — Customer categories — **DONE** (migration NOT yet applied)

- Table `CustomerCategory` (`code` unique and immutable, `name`, `isActive`,
  `sortOrder`), seeded with `final`/`comercio`/`distribuidor`. Their `name`s
  are **not invented** — they are the labels the driver app already showed
  (`CUSTOMER_TYPE_LABELS`), so nothing changes on screen.
- **The column keeps its name.** This plan originally said
  `customerTypeCode`; that was wrong and was overridden. `customerType`
  stays, exactly as `productCode` did, because that string is already
  persisted inside sale payloads queued on drivers' phones. Only the type
  changes (enum → TEXT) plus, where appropriate, a foreign key.
- `Customer.customerType` and `ProductPrice.customerType` get an FK to
  `CustomerCategory(code)` with `onDelete: Restrict`. `code` is not
  editable, so `ON UPDATE CASCADE` never fires — it is there for
  consistency with the product precedent, not as a live path.
- **`Sale.customerType` has NO foreign key**, and that is the most important
  decision in the migration. A sale records what the customer *was*. A
  cascading FK would let a rename rewrite already-collected history; a
  restricting one would forbid ever tidying a dead category. Same reasoning
  as `SaleItem.unitPrice` freezing the price instead of reading it back.
- `CUSTOMER_TYPES` is **deleted**, not kept as a fixture. `CustomerType`
  widens to `string`. The five membership checks now validate **shape**
  only; membership is asserted server-side, mirroring
  `assertProductCodesExist`.
- **Two assertion rules, deliberately different.**
  `assertCategoryCodesExist` accepts a retired category — used by sales and
  by `PUT /prices/...`, because that code arrives inside a sale queued
  before the admin retired it, and refusing it would lose a real sale.
  `assertCategoryAssignable` also requires `isActive` — used when an admin
  assigns a category at a desk, where an inactive one is a mistake.
- **Completeness flipped from gate to reported state.**
  `validateCreateProductInput` no longer demands a price per type. A
  *product* is still born complete against the categories active at that
  moment ("nace completo o no nace"), asserted in the service. A *category*
  is born empty, and nothing backfills it — the owner's explicit choice.
- `/admin/productos` renders dynamic columns and shows a hole as an **empty
  red cell reading "sin precio", never as `0`**. Prices are held in state as
  **strings, not numbers**, because `0` is a real price and `""` must stay
  representable; a cell left blank sends nothing at all, since
  `ProductPrice` is append-only and a stray `0` would become a permanent
  real price of zero.
- New `/admin/categorias`; `/admin/clientes` type selects come from the API.
- Driver app: categories join products and prices in the **same cached
  bundle** (`driver_catalog_v2`), because drivers create customers offline.
  The hardcoded `CUSTOMER_TYPE_LABELS` map is gone, falling back to the raw
  code for a category the cache does not know.

Verified: api **540 tests / 26 suites**, driver-app **491 / 57**, dashboard
**129 / 12**, `tsc --noEmit` clean in all three.

**Operational note:** the cache key bump means a driver who updates the app
holds an unreadable `v1` cache and cannot sell until the phone reaches
signal once. That is unavoidable — a `v1` cache has no categories, so
quick-create would be broken anyway — but it should not land mid-shift.

### Phase 4 — Per-product truck capacity, and cleanup — **DONE** (migrations NOT yet applied)

- Table `TruckCapacity`: `truckId`, `productCode`, `units`, unique
  `(truckId, productCode)`, `onDelete: Cascade` from `Truck`,
  `Restrict` from `Product`. Two migrations, one per concern:
  `20260909180000_truck_product_capacity` and
  `20260909190000_drop_customer_zone_shadow`.
- **`Truck.capacity` is dropped, and the stored total is DISCARDED.** This
  plan originally said "kept as a derived total for one release"; the owner
  overrode it. A single number cannot be split across products without
  inventing the split, and a derived `capacity: 0` on an empty grid would
  claim the truck holds nothing. Every truck starts empty and reads **"sin
  detallar"**; the owner accepted re-entering capacity once per truck.
- `TruckRecord` loses `capacity` and gains `capacities: TruckCapacityEntry[]`;
  `CreateTruckInput`/`UpdateTruckInput` lose it too. `DriverTruckToday` (the
  driver's resolved truck — *not* `CurrentTruckSummary`, which never carried a
  capacity) gets the same treatment.
- `PUT /trucks/:id/capacities`, admin-only, **replaces the whole set** in one
  transaction — same contract as `DriverCustomerAssignment`, because a partial
  merge makes "remove a product from this truck" unexpressible. `units: 0` is
  a real answer and is stored. The grid always reads back ordered by the
  product's `sortOrder`.
- `/admin/camiones` replaces the `window.prompt` and the create-form field
  with a per-product grid over the **active** products. Held as strings, like
  the price table and for the same reason: `0` is a real capacity and a blank
  field must stay representable as "not detailed".
- `LoadManifestScreen` shows each product's capacity beside the quantity being
  loaded ("cap. 30" / "cap. sin detallar"), which is the useful shape when the
  driver is loading that product. `TruckCalendar` shows the grid on one line.
- **`JornadaHeader` drops the capacity line entirely** (a judgement call not in
  the brief): a per-product grid does not fit a one-line identity bar, and a
  total there would be exactly the lie that was removed.
- **Load manifests are still not blocked when they exceed capacity.**
  Capacity remains informational in this change; enforcing it is a
  separate decision, recorded below.
- `Customer.zone` (the shadow column) is dropped. `CustomerRecord.zone` stays
  in the API response, still the display name, now always from the relation;
  `zoneId` is the only way to set a zone. `driver-customer-assignments.service`
  was the last direct column reader and now includes `zoneRef`. The Postgres
  enum `CustomerType` was already dropped by Phase 3.

Verified: api **559 tests / 26 suites**, driver-app **496 / 57**, dashboard
**140 / 13**, `tsc --noEmit` clean in all four packages.

## Deferred, on purpose

- **Driver↔zone assignment.** The owner is undecided (trucks get diverted).
  Phase 2 delivers the workflow through the existing per-day customer list.
- **Enforcing truck capacity against a load manifest.** Capacity is
  decorative today; this change makes it richer, not binding.

## Ordering and Risk

Phases 1, 2 and 4's capacity work are additive and independently
shippable. Phase 3 is schema surgery over money-bearing tables and **must
not start before Phase 0 is merged and green**, because the owner's chosen
behaviour (incomplete categories are allowed to exist) is exactly the
condition the current `?? 0` fallbacks mishandle.
