# Change: Customer, Truck & Pricing Foundations

**Phase**: 1 of 9 ([roadmap](./README.md))
**SDD artifact store**: Engram (project `sistema-de-reparto`, topic keys `sdd/customer-truck-pricing-foundations/*`)
**Status**: Planned — proposal, spec, design and tasks are complete and approved; implementation (`sdd-apply`) not yet started.

## Session Preflight (applies to this change)

- Pace: `auto` (phases run back-to-back; orchestrator gate-validates each result before launching the next)
- Artifact store: `engram`
- Delivery strategy: `ask-on-risk`
- Review budget: 800 changed lines
- Chain strategy (this change only, since it exceeds budget): `stacked-to-main`, 6 chained PRs

## Business Decisions Confirmed by the Owner

These were resolved conversationally before/during the SDD phases and are binding for this change:

| Decision | Chosen |
|---|---|
| Truck capacity unit | Single integer = total cylinder count (not kg, not per-product) |
| Driver↔truck assignment | Full history table (start/end dates), not just "current truck" |
| Sale's `customerType` once linked to a `Customer` | Always inherited from the `Customer` record; the driver/client payload cannot override it |
| Disambiguating customers with duplicate names | `zone` field (neighborhood-level), not full address |
| Price table | Single mutable price per (product, customerType) pair, no historical versioning |
| Sale→Customer/Truck linkage | Nullable FKs added alongside the existing free-text columns; no backfill of historical sales |
| Delete semantics for Customer/Truck | Soft delete via `isActive` flag, not hard delete |

---

## 1. Explore

## Exploration: customer-truck-pricing-foundations

### Current State

**Schema** (`apps/api/prisma/schema.prisma`): 5 models, no `Customer`, `Truck`, price, or driver-truck-assignment models exist.
- `Sale`: `driverName String @default("sin-chofer")` (free text), `truckCode String?` (free text), `customerName String` (free text), `customerType CustomerType` (enum, chosen freely per sale, not linked to any customer record), `total Int` — computed once at creation and persisted (NOT recalculated from current prices later).
- `SaleItem`, `SaleAudit` (before/after JSON snapshots — the codebase already has a "track who/what/when changed" convention here).
- `DriverExpense`: `driverName String` also free text.
- `UserAccount`: `id, username, passwordHash, role (admin|chofer)` — no relation to any truck.

**Pricing** (`packages/shared/src/domain.ts`): `PriceTable = Record<CustomerType, Record<ProductCode, number>>`. `DEFAULT_PRICE_TABLE` is a hardcoded constant (12 entries: 3 customer types × 4 products), imported directly by `apps/api/src/sales/sales.service.ts` (createSale/updateSale, lines 47 & 94) and `apps/driver-app/App.tsx` (line 116, client-side total preview). `calculateSaleTotal(customerType, items, prices)` (domain.ts:146) is a pure function that already takes the price table as a parameter — it is already decoupled from where prices live; only the *source* of the table needs to change.

**Admin CRUD template**: `apps/api/src/users/{users.service,users.controller,users.module}.ts` is the existing pattern for admin-managed entities: Nest module/service/controller triad, `@Roles('admin')` guard at controller level, `validate*Input` functions living in `packages/shared`, `ConflictException`/`NotFoundException` for business rules. This is the direct template to copy for Customer/Truck/Price modules.

**Driver app** (`apps/driver-app/App.tsx`): `customerName` (line 78, default "Cliente de prueba") and `truckCode` (line 75, default "CAMION-01") are plain `TextInput` fields, no picker, no navigation (single file, out of scope for this phase).

**Dashboard** (`apps/dashboard/src/app/page.tsx`): single page, fetches the full sale list once and does **client-side** filtering/search over `sale.driverName`/`sale.truckCode`/`sale.customerName` substrings (lines ~485-535). `GET /sales` has **no query params today** — confirmed by reading `sales.controller.ts` (`listSales()` takes no args). This matters: introducing FKs does not require an immediate server-side filtering contract change, but the dashboard must keep resolving readable names for whatever it displays.

**Testing gap**: codegraph blast-radius analysis flags `SalesService`, `listSales`, `calculateSaleTotal` all with "no covering tests found" — any shape change to `SaleRecord` risks silent breakage in the two large, untested UI files (driver-app 1174 lines, dashboard 1247 lines).

### Affected Areas
- `apps/api/prisma/schema.prisma` — add `Customer`, `Truck`, price table model(s), possibly a driver-truck assignment model; add nullable FK columns on `Sale` (`customerId`, `truckId`) and possibly on `UserAccount`.
- `packages/shared/src/domain.ts` — `PriceTable` type and `DEFAULT_PRICE_TABLE` constant need a DB-backed source; `calculateSaleTotal` signature is already compatible and needs no change; new DTO types for Customer/Truck/Price needed.
- `apps/api/src/sales/sales.service.ts` — `createSale`/`updateSale` currently hardcode `DEFAULT_PRICE_TABLE`; must source prices from a new service/repository; must accept/resolve new optional `customerId`/`truckId` while free-text fields stay valid for transition.
- `apps/api/src/sales/sales.controller.ts` + `packages/shared` `validateCreateSaleInput`/`validateUpdateSaleInput` — payload contract changes if FKs are added.
- `apps/api/src/users/*.ts` — direct copy-template for new Customer/Truck/Price admin modules.
- `apps/dashboard/src/app/page.tsx` — natural home for new Customer/Truck/Price admin screens (already has a user-management section); must keep displaying resolved names post-migration.
- `apps/driver-app/App.tsx` — free-text `customerName`/`truckCode` inputs must keep working unchanged this phase (no nav refactor yet); write path must stay backward compatible.
- `apps/api/src/auth` — existing JWT/RolesGuard infra reused unchanged by new admin-only endpoints.

### Approaches

Six real decisions were compared with trade-offs during exploration (Sale→Customer/Truck linkage, truck capacity modeling, driver-truck assignment, price table storage, Customer model fields). All were resolved by the business owner — see the confirmed decisions table above. Full pros/cons detail available in Engram (`sdd/customer-truck-pricing-foundations/explore`, observation #5) if needed for later phases.

### Risks
- Automatic backfill/matching of legacy free-text customer names is unsafe (confirmed duplicate names across zones) — must not be attempted without explicit manual review tooling.
- `Sale.customerType` is currently freely chosen per sale, independent of any customer record; linking Sale→Customer raised a semantic question (resolved: `customerType` becomes derived from the linked Customer).
- `SalesService`, `listSales`, `calculateSaleTotal` have no test coverage (confirmed via codegraph blast-radius); any `SaleRecord` shape change risks silent breakage in the two large untested UI files (driver-app 1174 lines, dashboard 1247 lines) — addressed via strict TDD in this change.
- Decisions made in this foundational phase constrain all 8 following phases; kept additive and reversible precisely because later phases' exact requirements are still undefined.

---

## 2. Proposal

# Proposal: Customer, Truck & Pricing Foundations

### Intent

Today customers, trucks and drivers exist only as free text on `Sale`/`DriverExpense`, and prices live in the hardcoded `DEFAULT_PRICE_TABLE` constant. Admins cannot maintain a customer registry, cannot know which driver ran which truck on a given date, and cannot change a price without a code deploy. This is phase 1 of a longer roadmap: it creates the master data backbone (registries + DB-backed prices) that later phases (driver-app selectors, load manifest, geolocation, live dashboard) will consume. Success = admins manage this data via API, and `POST /sales` can optionally link a real customer/truck and price from the DB, with zero breakage of existing free-text callers.

### Scope

**In Scope**
- Prisma models: `Customer` (name, customerType, zone, lat/lng nullable placeholders), `Truck` (code, plate, `capacity` single total number), `DriverTruckAssignment` (driverId→`UserAccount`, truckId, startDate, endDate nullable = current), `ProductPrice` (unique `productCode`+`customerType`, mutable amount, no versioning).
- Nullable `customerId`/`truckId` FKs on `Sale`; existing free-text `customerName`/`truckCode`/`customerType` columns stay and remain valid.
- Admin-only CRUD modules in `apps/api` (`customers`, `trucks`, `driver-truck-assignments`, `prices`) copying the `users.service/controller/module.ts` triad + `@Roles('admin')` pattern; `validate*Input` helpers in `packages/shared`.
- `sales.service.ts`: resolve the price table from `ProductPrice` instead of `DEFAULT_PRICE_TABLE`; accept optional `customerId`/`truckId`; when `customerId` is present, `customerType` is derived from the `Customer` record (client-supplied type ignored) and `customerName` is denormalized from it.
- Jest tests in `apps/api` for every new service and for the changed sale pricing/linking paths (strict TDD; `apps/api` is the only Jest-configured app).

**Out of Scope**
- Geolocation logic (columns are inert placeholders), driver-app customer/truck selectors, driver-app navigation refactor, load manifest ("remito de carga"), live dashboard.
- Backfilling or auto-matching historical sales to new records (duplicate names across zones make matching unsafe).
- Price history/versioning, per-product truck capacity, capacity enforcement.
- Server-side `GET /sales` filtering (dashboard filters client-side today).
- Dashboard/driver-app UI is optional and minimal this phase; backend correctness is the priority.

### Capabilities

**New**: `customer-registry`, `truck-registry`, `driver-truck-assignment`, `product-pricing`.
**Modified**: `sale-recording` — prices come from `ProductPrice`; `POST/PATCH /sales` accept optional `customerId`/`truckId`; linked customer's `customerType` wins over any client-supplied value.

### Approach

Additive and reversible. New models are independent tables; `Sale` gains only nullable FKs, so every existing row and every current caller stays valid. `calculateSaleTotal(customerType, items, prices)` already takes the price table as a parameter, so only the *source* changes: a `PricesService.getPriceTable()` reads `ProductPrice` and returns the existing `PriceTable` shape. `DEFAULT_PRICE_TABLE` remains in `packages/shared` as the seed source and as the driver-app's client-side preview fallback. Assignment history follows the existing `SaleAudit` "who/what/when" precedent; overlap is rejected at the service layer with `ConflictException`, mirroring `users.service.ts`.

### Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/prisma/schema.prisma` | Modified | 4 new models + enums; nullable `customerId`/`truckId` on `Sale`; back-relation on `UserAccount` |
| `apps/api/prisma/migrations/` | New | One additive migration + `ProductPrice` seed from `DEFAULT_PRICE_TABLE` |
| `apps/api/src/{customers,trucks,driver-truck-assignments,prices}/` | New | Service/controller/module triads, admin-guarded |
| `apps/api/src/sales/sales.service.ts` | Modified | DB price lookup; optional FK resolution; customerType derivation |
| `apps/api/src/sales/sales.controller.ts` | Modified | Payload accepts optional FKs |
| `apps/api/src/app.module.ts` | Modified | Register 4 new modules |
| `packages/shared/src/domain.ts` | Modified | New DTO/validator types; `DEFAULT_PRICE_TABLE` retained as seed/fallback |
| `apps/dashboard`, `apps/driver-app` | Unchanged (optional) | Must keep working untouched; UI consumption deferred |

### Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Dual source of truth (free text vs. FK) drifts | High | Explicit rule: FK wins when present; denormalize name/type from `Customer` at write time |
| `SalesService` has no existing test coverage; changing it risks silent UI breakage | Medium | TDD-first: write sales pricing/linking tests before touching the service; keep `SaleRecord` shape additive only |
| Empty `ProductPrice` table breaks sale creation | Medium | Seed all 12 rows in the migration; service throws a clear error if a price is missing |
| Assignment overlap rules under-specified (same driver two trucks / same truck two drivers) | Medium | Reject both overlap classes; spec pins exact scenarios |
| Scope creep into deferred phases | Medium | Out-of-scope list is explicit; UI work stays optional |

### Rollback Plan

All changes are additive. Roll back by: (1) reverting the API commit — free-text sale creation and `DEFAULT_PRICE_TABLE` pricing still work because those columns/constant were never removed; (2) running the down migration to drop the 4 new tables and the 2 nullable `Sale` columns. No historical sale data is modified, so rollback is lossless for existing rows.

### Success Criteria

- [ ] Admin can create/list/update/delete customers, trucks, assignments and prices; non-admin gets 403.
- [ ] Assignment queries answer "who drove truck X on date Y"; overlapping open assignments are rejected.
- [ ] `POST /sales` with no `customerId`/`truckId` behaves exactly as today (driver-app unchanged).
- [ ] `POST /sales` with `customerId` derives `customerType` from the customer, ignoring any client-supplied type.
- [ ] Sale totals are computed from `ProductPrice`; editing a price changes new sales only, never historical `Sale.total`.
- [ ] Jest suite in `apps/api` covers all four new services and the changed sale pricing/linking paths, and passes.

---

## 3. Spec

# Spec: Customer, Truck & Pricing Foundations

### Domain: customer-registry (New)

**Requirement: Customer CRUD with zone disambiguation**
The system MUST allow an admin to create, list, retrieve, and update Customer records (name, customerType, zone, nullable lat/lng placeholders). Duplicate names MUST be allowed when zone differs. Non-admin callers MUST receive 403.

- *Scenario: Admin creates a customer* — GIVEN an authenticated admin, WHEN they POST a valid customer payload, THEN the system creates the Customer with isActive=true.
- *Scenario: Duplicate name disambiguated by zone* — GIVEN Customer "Kiosco Sur" exists in zone "Sur", WHEN an admin creates another "Kiosco Sur" in zone "Norte", THEN both records are created successfully.

**Requirement: Customer soft delete**
The system MUST deactivate a Customer via `isActive` instead of permanent deletion. Deactivated customers MUST be excluded from new-sale selection lists. Historical sales referencing a deactivated customer MUST remain unchanged.

- *Scenario: Admin deactivates a referenced customer* — GIVEN an active Customer referenced by an existing Sale, WHEN an admin deactivates it, THEN isActive=false, it is excluded from active-customer lists, and the existing Sale is unaffected.

### Domain: truck-registry (New)

**Requirement: Truck CRUD with unit-count capacity**
The system MUST allow an admin to create, list, retrieve, and update Truck records (code, plate, capacity). `capacity` MUST be a single non-negative integer total unit count (e.g. garrafas), with no per-product breakdown and no weight unit. Non-admin callers MUST receive 403.

- *Scenario: Admin creates a truck* — GIVEN an authenticated admin, WHEN they POST capacity=300, THEN the Truck is created with capacity stored as one integer, no breakdown.

**Requirement: Truck soft delete**
The system MUST deactivate a Truck via `isActive` instead of permanent deletion. Deactivated trucks MUST be excluded from new-sale and new-assignment selection lists. Historical sales/assignments referencing it MUST remain unchanged.

- *Scenario: Admin deactivates a referenced truck* — GIVEN an active Truck referenced by an existing DriverTruckAssignment, WHEN an admin deactivates it, THEN isActive=false, it is excluded from assignment selection, and the existing assignment is unaffected.

### Domain: driver-truck-assignment (New)

**Requirement: Create dated assignment without overlap**
The system MUST allow an admin to create a DriverTruckAssignment (driverId, truckId, startDate, nullable endDate). The system MUST reject creation when the driver already has an open/overlapping assignment, and MUST reject when the truck already has an open/overlapping assignment. Non-admin callers MUST receive 403.

- *Scenario: Driver already has open assignment* — GIVEN driver D has an open assignment to truck A, WHEN an admin assigns driver D to truck B without ending the first, THEN the system throws ConflictException and creates nothing.
- *Scenario: Truck already has open assignment* — GIVEN truck A has an open assignment to driver D1, WHEN an admin assigns driver D2 to truck A without ending the first, THEN the system throws ConflictException and creates nothing.

**Requirement: Query assignment by truck and date**
The system MUST answer "which driver operated truck X on date Y" from assignment date ranges.

- *Scenario: Historical lookup* — GIVEN truck A had driver D1 (Jan 1–10) then driver D2 (Jan 11–), WHEN a caller queries truck A on Jan 5, THEN the system returns driver D1.

### Domain: product-pricing (New)

**Requirement: Admin-editable single-row price per product×customerType**
The system MUST let an admin view/update a mutable price for each unique (productCode, customerType) pair with no version history. Updating a price MUST NOT alter `Sale.total` of any previously recorded sale. Non-admin callers MUST receive 403.

- *Scenario: Editing a price does not affect past sales* — GIVEN Sale S was recorded using the old price, WHEN an admin updates that ProductPrice row, THEN Sale S's stored total remains unchanged.

**Requirement: Missing price is an error**
When a sale requires a price for a (productCode, customerType) pair with no matching `ProductPrice` row, the system MUST reject the sale with a clear error, never a silent zero.

- *Scenario: Sale with unpriced product* — GIVEN no ProductPrice row exists for ("P9", "mayorista"), WHEN a sale is submitted with that product/customerType, THEN the system rejects it with an explicit "price not found" error.

### Domain: sale-recording (Modified)

**Requirement: Sale pricing source**
Sale creation MUST resolve unit prices from `ProductPrice` at request time, keyed by (productCode, resolved customerType), instead of the hardcoded `DEFAULT_PRICE_TABLE`. *(Previously: prices were read directly from the `DEFAULT_PRICE_TABLE` constant in `packages/shared`.)*

- *Scenario: Price resolved from DB* — GIVEN a ProductPrice row exists for the sale's product/customerType, WHEN the sale is created, THEN its line total uses that row's amount.

**Requirement: Optional customer/truck linking with type override**
`POST/PATCH /sales` MUST accept optional `customerId`/`truckId`. Absent, behavior MUST be unchanged (free-text only). When `customerId` is present, `customerType` MUST be derived from the linked active Customer, ignoring any client-supplied value, and `customerName` MUST be denormalized from it. Linking a deactivated (`isActive=false`) Customer or Truck MUST be rejected. *(Previously: only free-text `customerName`/`truckCode`/`customerType`; no relational linking existed.)*

- *Scenario: Sale without FKs unchanged* — GIVEN a payload with only free-text customer/truck fields, WHEN the sale is created, THEN it succeeds exactly as before, customerId/truckId null.
- *Scenario: Client-supplied type overridden* — GIVEN active Customer C has customerType="mayorista", WHEN a sale is created with customerId=C.id and customerType="minorista" in the payload, THEN the stored customerType is "mayorista".
- *Scenario: Linking a deactivated customer rejected* — GIVEN Customer C has isActive=false, WHEN a sale is created with customerId=C.id, THEN the system rejects the request with a clear error.

---

## 4. Design

# Design: Customer, Truck & Pricing Foundations

### Technical Approach

Four independent Prisma models plus two nullable FKs on `Sale`. Four NestJS module triads cloning `apps/api/src/users/` exactly: `*.service.ts` (injects `PrismaService`, throws `Conflict/NotFoundException`), `*.controller.ts` (class-level `@Roles('admin')`, validates via `validate*Input` from `@distribuidor/shared`, `@HttpCode(204)` on mutations without body), `*.module.ts`. `SalesService` swaps the `DEFAULT_PRICE_TABLE` constant for `PricesService.getPriceTable()`; `calculateSaleTotal(customerType, items, prices)` keeps its signature.

### Architecture Decisions

| # | Decision | Choice | Rejected | Rationale |
|---|---|---|---|---|
| 1 | Price source | `SalesModule` imports `PricesModule`, injects `PricesService` | `SalesService` querying `prisma.productPrice` directly; cache layer | One owner of the `PriceTable` shape; trivially mockable in unit tests; no invalidation problem |
| 2 | Seed placement | 12 `INSERT` statements inline in the migration SQL | `prisma/seed.ts` (no `prisma.seed` config or seed infra exists today); lazy insert at runtime | Deploy order is already migrate-then-deploy, so prices exist before the first sale |
| 3 | Delete semantics | Soft delete: `isActive Boolean @default(true)`; `DELETE` flips the flag | Hard delete + `ConflictException` when referenced | User-confirmed; sale history keeps its FK intact |
| 4 | Capacity unit | Single `capacity Int` = cylinder count | kg; per-product breakdown | User-confirmed |
| 5 | Assignment overlap | Service-layer range check + `ConflictException` | Partial unique index / exclusion constraint | Overlap is a date-range predicate; Prisma schema cannot express Postgres `EXCLUDE` |
| 6 | Customer type source | FK wins: when `customerId` is present, load `Customer`, override client `customerType`, denormalize `name` | Trust client payload | Kills the dual-source-of-truth drift risk |
| 7 | Missing price row | `getPriceTable()` throws if any of the 12 pairs is absent | Silent `?? 0` fallback | A zero-total sale is worse than a loud failure |

### Prisma Schema

```prisma
model Customer {
  id           String       @id @default(cuid())
  name         String
  customerType CustomerType
  zone         String?
  latitude     Float?
  longitude    Float?
  isActive     Boolean      @default(true)
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
  sales        Sale[]
  @@index([isActive, name])
}

model Truck {
  id          String   @id @default(cuid())
  code        String   @unique
  plate       String   @unique
  capacity    Int
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  sales       Sale[]
  assignments DriverTruckAssignment[]
  @@index([isActive, code])
}

model DriverTruckAssignment {
  id        String      @id @default(cuid())
  driverId  String
  truckId   String
  startDate DateTime
  endDate   DateTime?
  createdAt DateTime    @default(now())
  driver    UserAccount @relation(fields: [driverId], references: [id], onDelete: Restrict)
  truck     Truck       @relation(fields: [truckId], references: [id], onDelete: Restrict)
  @@index([truckId, startDate])
  @@index([driverId, startDate])
}

model ProductPrice {
  id           String       @id @default(cuid())
  productCode  ProductCode
  customerType CustomerType
  amount       Int
  updatedAt    DateTime     @updatedAt
  @@unique([productCode, customerType])
}
```

`Sale` gains `customerId String?`, `truckId String?`, both relations, `@@index([customerId])`. `UserAccount` gains `assignments DriverTruckAssignment[]`. No existing column is dropped or made required.

### Data Flow

```
POST /sales -> SalesController (validateCreateSaleInput)
  -> SalesService.createSale
       |- PricesService.getPriceTable() ---> ProductPrice (12 rows)
       |- customerId? -> customer.findUnique -> override customerType + customerName
       |                                        (404 unknown / 409 inactive)
       |- truckId?    -> truck.findUnique      (404 unknown / 409 inactive)
       `- calculateSaleTotal(type, items, table) -> sale.create
```

`updateSale` follows the same resolution path; `Sale.total` stays a write-time snapshot, so price edits never touch historical rows.

### File Changes

| File | Action | Description |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Modify | 4 models, 2 nullable FKs on `Sale`, back-relation on `UserAccount` |
| `apps/api/prisma/migrations/<ts>_add_customer_truck_pricing/migration.sql` | Create | 4 `CREATE TABLE`, `ALTER TABLE "Sale"`, 12 `INSERT INTO "ProductPrice"` |
| `apps/api/src/{customers,trucks,driver-truck-assignments,prices}/*.{service,controller,module}.ts` | Create | 12 files, `users/` triad pattern |
| `apps/api/src/{...}/*.service.spec.ts` | Create | 4 unit suites |
| `apps/api/src/sales/sales.service.spec.ts` | Create | RED-first coverage for pricing + FK linking |
| `apps/api/src/sales/sales.service.ts` | Modify | Inject `PricesService`; resolve optional FKs; derive `customerType` |
| `apps/api/src/sales/sales.module.ts` | Modify | Import `PricesModule` |
| `apps/api/src/app.module.ts` | Modify | Register 4 modules |
| `packages/shared/src/domain.ts` | Modify | New records/inputs/validators; `CreateSaleInput` gains optional FKs; `DEFAULT_PRICE_TABLE` retained as seed source and driver-app preview fallback |

`sales.controller.ts` needs no edit: it forwards the typed payload, so widening `CreateSaleInput` and `validateCreateSaleInput` in shared is sufficient.

### Interfaces

```ts
// packages/shared/src/domain.ts
export type CreateCustomerInput = { name: string; customerType: CustomerType; zone?: string; latitude?: number; longitude?: number };
export type CreateTruckInput = { code: string; plate: string; capacity: number };
export type CreateAssignmentInput = { driverId: string; truckId: string; startDate: string; endDate?: string };
export type UpdatePriceInput = { amount: number };
export type CreateSaleInput = { /* existing */ customerId?: string; truckId?: string };
// + validateCreateCustomerInput / ...TruckInput / ...AssignmentInput / ...UpdatePriceInput

// apps/api/src/prices/prices.service.ts
getPriceTable(): Promise<PriceTable>; // throws if any of the 12 pairs is missing
listPrices(): Promise<ProductPriceRecord[]>;
updatePrice(productCode, customerType, amount): Promise<ProductPriceRecord>;
```

### Testing Strategy

`apps/api` is the only Jest-configured app (`rootDir: src`, `testRegex: .*\.spec\.ts$`). Validators live in `packages/shared` but are exercised from `apps/api` specs importing `@distribuidor/shared`.

| Layer | What to Test | Approach |
|---|---|---|
| Unit — validators | New `validate*Input` functions, widened `validateCreateSaleInput` | Pure function assertions, no NestJS container |
| Unit — services | 4 new services + changed `SalesService` paths | `Test.createTestingModule({ providers: [Svc, { provide: PrismaService, useValue: prismaMock }] })`, `jest.fn()` per delegate |
| Integration — module | Controller + service wired, `@Roles('admin')` metadata present via `Reflector` | TestingModule with controller and service, Prisma double, `overrideGuard` |
| E2E | None this phase | `test/jest-e2e.json` needs live Postgres; deferred per proposal |

Mandatory RED tests before any implementation: `getPriceTable` throws on a missing pair and maps rows to `PriceTable`; `createSale` with no FKs behaves exactly as today; `createSale` with `customerId` overrides client `customerType` and denormalizes `customerName`; unknown or inactive `customerId`/`truckId` errors; assignment overlap rejected per driver AND per truck; delete flips `isActive` without removing the row and default list excludes inactive.

### Migration / Rollout

Single additive migration. Order: create tables, alter `Sale`, seed the 12 `ProductPrice` rows as SQL literals mirroring `DEFAULT_PRICE_TABLE` (final/comercio/distribuidor x G10/G15/G45/G15_AUTO). Deploy: migrate, then API. Rollback: revert the commit (free-text sales and the constant still work) and drop the 4 tables plus the 2 nullable columns. Lossless for existing rows.

### Resolved Open Questions

- Price change audit trail intentionally deferred (no versioning per proposal) — acceptable for phase 1.
- Reassigning a driver: creating a new assignment does NOT auto-close the previous open one — the admin must close it explicitly first (create rejects overlap). Carried into task 5.2.

---

## 5. Tasks

# Tasks: Customer, Truck & Pricing Foundations

### Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1470 total (schema 70, migration 90, domain.ts 105, customers 245, trucks 245, assignments 270, prices 235, sales.service+spec ~200, wiring ~10) |
| Review budget | 800 lines (session override) |
| 800-line budget risk | High |
| Chained PRs recommended | Yes — **confirmed by owner** |
| Chain strategy | **stacked-to-main — confirmed by owner** |

### Work Units (chained PRs, stacked to main)

| Unit | Goal | PR | Focused test command | Runtime check | Rollback boundary |
|------|------|-----------|----------------------|------------------|--------------------|
| 1 | Schema, migration, shared domain types/validators | PR 1 | `pnpm --filter api test -- domain` | `pnpm --filter api exec prisma migrate dev` + `prisma generate` | Revert PR, drop migration; nothing built on top yet |
| 2 | Customers module + app.module wiring | PR 2 (base PR1) | `pnpm --filter api test -- customers` | `pnpm --filter api start:dev` + curl `POST /customers` | Revert PR2; no other module references Customer yet |
| 3 | Trucks module + app.module wiring | PR 3 (base PR2, independent of #2 — may reorder before it) | `pnpm --filter api test -- trucks` | curl `POST /trucks` against dev server | Revert PR3 only |
| 4 | Driver-Truck-Assignment module + app.module wiring | PR 4 (base PR3, only needs PR1 schema) | `pnpm --filter api test -- driver-truck-assignments` | curl `POST /driver-truck-assignments` overlap case | Revert PR4 only |
| 5 | Prices module + app.module wiring | PR 5 (base PR4, only needs PR1 schema) | `pnpm --filter api test -- prices` | curl `GET /prices` after seed | Revert PR5 only |
| 6 | Sales pricing/FK integration | PR 6 (base PR5, needs #2/#3/#5 merged) | `pnpm --filter api test -- sales` then `pnpm --filter api test:cov` | curl `POST /sales` with/without customerId | Revert PR6; `DEFAULT_PRICE_TABLE` path restored via git revert |

Units 2–5 depend only on Unit 1 (schema) and may be reordered/parallelized; Unit 6 requires 2, 3, 5 merged (not 4).

### Phase 1: Schema & Migration (Foundation)
- [ ] 1.1 `apps/api/prisma/schema.prisma`: add `Customer`, `Truck`, `DriverTruckAssignment`, `ProductPrice` models; nullable `customerId`/`truckId` + relations on `Sale`; `assignments` back-relation on `UserAccount`; indexes per design.
- [ ] 1.2 `apps/api/prisma/migrations/<ts>_add_customer_truck_pricing/migration.sql`: 4 `CREATE TABLE`, `ALTER TABLE "Sale"`, 12 seed `INSERT INTO "ProductPrice"` mirroring `DEFAULT_PRICE_TABLE`.
- [ ] 1.3 Run `prisma migrate dev` + `prisma generate`; confirm client types compile.

### Phase 2: Shared Types & Validators
- [ ] 2.1 `packages/shared/src/domain.ts`: add `CreateCustomerInput`, `CreateTruckInput`, `CreateAssignmentInput`, `UpdatePriceInput`; widen `CreateSaleInput` with optional `customerId`/`truckId`.
- [ ] 2.2 RED: validator specs (in `apps/api`) for the 4 new `validate*Input` fns + widened `validateCreateSaleInput`.
- [ ] 2.3 GREEN: implement `validateCreateCustomerInput`/`validateCreateTruckInput`/`validateCreateAssignmentInput`/`validateUpdatePriceInput` to pass 2.2.

### Phase 3: Customers Module
- [ ] 3.1 RED: `apps/api/src/customers/customers.service.spec.ts` — create sets `isActive=true`; dup name diff zone both created; list excludes inactive; deactivate flips `isActive` without deleting, existing `Sale` FK unaffected.
- [ ] 3.2 GREEN: `apps/api/src/customers/customers.service.ts` (clone `users.service.ts` triad, `PrismaService` injected).
- [ ] 3.3 `apps/api/src/customers/customers.controller.ts` (`@Roles('admin')`, `validateCreateCustomerInput`) + `customers.module.ts`; register in `apps/api/src/app.module.ts`.

### Phase 4: Trucks Module
- [ ] 4.1 RED: `apps/api/src/trucks/trucks.service.spec.ts` — capacity stored as one non-negative int; deactivate referenced truck leaves `DriverTruckAssignment` unaffected; list excludes inactive.
- [ ] 4.2 GREEN: `apps/api/src/trucks/trucks.service.ts`.
- [ ] 4.3 `apps/api/src/trucks/trucks.controller.ts` + `trucks.module.ts`; register in `app.module.ts`.

### Phase 5: Driver-Truck-Assignment Module
- [ ] 5.1 RED: `apps/api/src/driver-truck-assignments/driver-truck-assignments.service.spec.ts` — reject overlapping open assignment per driver (`ConflictException`, nothing created); reject overlapping open assignment per truck; historical lookup by truck+date returns correct driver.
- [ ] 5.2 GREEN: `.../driver-truck-assignments.service.ts` — range-overlap check, create/list/close(endDate) (admin closes explicitly — new assignment does NOT auto-close prior).
- [ ] 5.3 `.../driver-truck-assignments.controller.ts` + `.module.ts`; register in `app.module.ts`.

### Phase 6: Prices Module
- [ ] 6.1 RED: `apps/api/src/prices/prices.service.spec.ts` — `getPriceTable()` throws on any missing pair; maps 12 rows to `PriceTable`; `updatePrice` mutates single row, no versioning; editing a price leaves prior `Sale.total` untouched.
- [ ] 6.2 GREEN: `apps/api/src/prices/prices.service.ts` — `getPriceTable`/`listPrices`/`updatePrice`.
- [ ] 6.3 `apps/api/src/prices/prices.controller.ts` + `prices.module.ts`; register in `app.module.ts`.

### Phase 7: Sales Integration
- [ ] 7.1 RED: `apps/api/src/sales/sales.service.spec.ts` (new) — no-FK sale unchanged; `customerId` present overrides client `customerType` + denormalizes `customerName`; unknown/inactive `customerId`/`truckId` rejected (404/409); total sourced from `PricesService.getPriceTable()`.
- [ ] 7.2 GREEN: `apps/api/src/sales/sales.service.ts` — inject `PricesService`; resolve optional FKs; replace `DEFAULT_PRICE_TABLE` in `createSale`/`updateSale`.
- [ ] 7.3 `apps/api/src/sales/sales.module.ts`: import `PricesModule`.

### Phase 8: Verification
- [ ] 8.1 Run `pnpm --filter api test` (all suites green).
- [ ] 8.2 Run `pnpm --filter api test:cov`; confirm coverage on 4 new services + changed `sales.service.ts` paths.

### Notes
- No threat-matrix rows apply (design: N/A — no routing/shell/subprocess/VCS boundary).
- Reassignment: explicit-close assumption carried from design into 5.2, not re-litigated.

---

## Next Step

Run `sdd-apply` for Unit 1 (schema, migration, shared types) once implementation starts. Strict TDD Mode is active for `apps/api` — every GREEN task must be preceded by a failing RED test.
