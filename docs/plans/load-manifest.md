# Change: Load Manifest ("remito de carga")

**Phase**: 3 of 9 ([roadmap](./README.md))
**SDD artifact store**: this file (no live orchestrator session ran for this phase; produced by direct exploration + drafting, mirroring the file-based fallback described in the SDD Init Guard)
**Status**: Planning only — Explore through Tasks are complete below. Nothing has been applied: no schema migration generated, no code written under `apps/` or `packages/`, no PRs opened.

## Session Preflight

- Pace: not chosen yet — recommend `interactive` when `/sdd-continue` picks this change up, given how many business questions below are unresolved assumptions rather than owner-confirmed decisions.
- Artifact store: this markdown file for now; promote to Engram (`sdd/load-manifest/*`) or `openspec/` once a live orchestrator session starts `/sdd-apply`.
- Delivery strategy: `ask-on-risk` (cross-cutting rule from `README.md`).
- Review budget: 800 changed lines per PR (cross-cutting rule).
- Chain strategy: forecast exceeds the budget — see Tasks. Recommend a tracker-branch chain of ~5 PRs, the same shape Phase 2 used for its 10.

## Business Decisions Confirmed by the Owner

**The product owner was not available during this planning session.** Unlike Phase 2 — where every row in the equivalent table was a decision made live with the owner — every genuinely new business question below was resolved by picking the most conservative, most reversible option, and is flagged explicitly as unconfirmed. Nothing here should be read as binding. Purely structural continuations of Phase 1/2 patterns (module shape, `@Roles` usage, `driverName` server-side stamping, etc.) are not re-litigated as "decisions" since they aren't new judgment calls.

| # | Open question | Assumption chosen (revisable) | Why this one, not another |
|---|---|---|---|
| 1 | Is the load manifest mandatory before the first sale of the day? | **No** — informational only, not a gate | Blocking sales on a missing manifest risks locking a driver out of income-generating work over a UI hiccup or missed connectivity window; trivially upgradable to a hard gate later once the feature has run for a while |
| 2 | What happens if a driver sells without a manifest loaded today? | **Nothing is validated at the API.** The driver-app shows a passive, non-modal banner ("No cargaste el remito de hoy") on Inicio | Direct consequence of decision 1; keeps `Sale` creation and `LoadManifest` creation fully decoupled at the backend |
| 3 | Does "stock per truck" need a persisted `TruckStock` model, or can it be derived on-the-fly? | **Derived on-the-fly**: `sum(LoadManifestItem.quantity) − sum(SaleItem.quantity for active sales)`, per truck, per product, as of a given date | No "close of day" workflow exists to anchor a running balance to; a derived query is trivially correct today and can become a persisted cache later without discarding anything. A persisted balance that's wrong from day one (no close-of-day logic to keep it honest) is the harder direction to walk back |
| 4 | Can a truck have more than one manifest per day (mid-day reload)? | **Yes, unlimited** — no unique constraint on `(truckId, date)` | Simplest data model; the roadmap itself names mid-day reload as a real case. Blocking it would require a rule nobody has specified |
| 5 | Is the manifest photo mandatory or optional? | **Optional**, exactly like the expense receipt today | Direct precedent already shipped (`ExpensesScreen`'s `receiptRef` is optional); no reason to hold this feature to a stricter bar than the one it's copying |
| 6 | Does the manifest photo move to cloud/S3 storage as part of this phase? | **No.** Reuses the existing `POST /uploads/receipt` endpoint unchanged (local disk) | The roadmap explicitly marks the S3 migration as cross-cutting debt "not yet scheduled to a specific phase." Nothing about the manifest photo is more urgent than the receipt/expense photos already accumulating on disk today. Carried forward as a risk, not silently absorbed |
| 7 | Where does "load manifest" live in navigation — a 5th tab, or nested under an existing tab? | **Nested**: a stack screen pushed from `HomeScreen`, not a new tab | Frequency mismatch — manifest is a ~1x/day action, `Nueva Venta` is dozens of times/day. A 5th tab dilutes the tab bar hierarchy Phase 2 just established (`Nueva Venta` primary emphasis). See Explore §Approaches |
| 8 | Does the offline sync queue (`SyncContext`) need to cover manifest submission? | **No**, not in this phase | Loading the truck happens at the depot in the morning, materially more likely to have connectivity than a customer's doorstep mid-route (where the sales queue earns its keep). Revisit if drivers report depot connectivity problems |

---

## 1. Explore

### Current State

The domain model has no concept of a load manifest today — confirmed against `apps/api/prisma/schema.prisma`: `Sale`, `SaleItem`, `SaleAudit`, `DriverExpense`, `UserAccount`, `Customer`, `Truck`, `DriverTruckAssignment`, `ProductPrice` are the only models. `Truck` has `capacity: Int` but nothing reads it yet — no model tracks what's actually loaded on a truck.

**Precedent for the two hard parts of this phase already exists in the codebase, unmodified reuse candidates:**

- **Photo capture/upload**: `apps/driver-app/src/screens/ExpensesScreen.tsx` (`pickReceiptImage`/`captureReceiptImage` via `expo-image-picker` `~57.0.7`, already installed) → `api.postForm('/uploads/receipt', form)` → `apps/api/src/uploads/uploads.controller.ts`. That controller stores to local disk (`multer` `diskStorage`, destination `uploads/`, 5MB limit, `image/*` filter only) and returns `{ filename, url }`; it is generic — nothing about it is expense-specific, so it can be reused verbatim for manifest photos with zero backend changes.
- **Per-product quantity entry**: `apps/driver-app/src/screens/NewSaleScreen.tsx`'s `+`/`-` stepper over `PRODUCT_CODES`, building a `SaleItemInput[]`-shaped array by filtering `quantity > 0`.
- **"Which truck do I have today"**: `apps/driver-app/src/context/TruckContext.tsx` (`useTruck()` → `AssignedTruck | null`, resolved server-side via `GET /driver-truck-assignments/me?date=...`, `req.user.sub` only — never client-supplied). `NewSaleScreen` already guards on `!truck` before allowing a sale; the manifest screen has the identical guard to make.
- **Additive, role-scoped endpoint pattern**: `sales.controller.ts`'s `GET /sales/mine` (`@Roles('admin', 'chofer')`, driver identity taken from `req.user.username`, never from the payload) is the direct precedent for a `GET /load-manifests/mine`.
- **A controller injecting a sibling module's service for a read-only derived view**: `trucks.controller.ts`'s `GET /trucks/:id/calendar` already injects `DriverTruckAssignmentsService` into `TrucksController` for exactly this shape of thing (one controller, one URL family, logic that spans two domains). The stock endpoint is the same shape.
- **A second native-stack navigator already exists**: `apps/driver-app/src/navigation/AuthStack.tsx` proves `@react-navigation/native-stack` is installed and wired; nesting a second stack under a tab costs zero new dependencies.

**Gaps confirmed by reading, not assumed:**
- `Sale` has `@@index([createdAt])`, `@@index([driverName, createdAt])`, `@@index([customerId])` — **no index on `truckId`**, despite `truckId String?` existing on the model since Phase 1. A stock query that sums `SaleItem` quantities by truck will need one.
- `apps/api/src/uploads/uploads.module.ts` has no service, just the controller — the upload mechanism has no abstraction to extend or intercept even if we wanted to (confirms decision 6's "reuse as-is, don't touch" is the low-effort path).
- `MainTabs.tsx` has exactly 4 `Tab.Screen` entries today (`Inicio`, `Nueva Venta`, `Gastos`, `Sincronización`) — no reserved 5th slot, no `+` action button pattern exists in the codebase to imitate instead.

### Affected Areas

- `apps/api/prisma/schema.prisma` — new `LoadManifest` + `LoadManifestItem` models; new index on `Sale(truckId, createdAt)`; new `loadManifests LoadManifest[]` back-relation on `Truck`.
- `apps/api/src/load-manifests/` — new module: `load-manifests.controller.ts`, `load-manifests.service.ts`, `load-manifests.module.ts`, plus spec files.
- `apps/api/src/trucks/trucks.controller.ts` — new `GET /trucks/:id/stock` route, injecting `LoadManifestsService` the same way `DriverTruckAssignmentsService` is already injected for `/calendar`. `trucks.service.ts` itself is untouched.
- `apps/api/src/app.module.ts` — register `LoadManifestsModule`.
- `packages/shared/src/domain.ts` — new types (`CreateLoadManifestInput`, `LoadManifestRecord`, `TruckStockLine`, `TruckStockSummary`) + `validateCreateLoadManifestInput`.
- `apps/driver-app/src/screens/LoadManifestScreen.tsx` — new screen (+ test).
- `apps/driver-app/src/screens/HomeScreen.tsx` — new manifest-status banner + a CTA into the manifest screen (+ test updates).
- `apps/driver-app/src/navigation/HomeStack.tsx` — new native-stack wrapping `HomeScreen` → `LoadManifestScreen`; `MainTabs.tsx` points `Inicio` at `HomeStack` instead of `HomeScreen` directly (+ test updates).
- `apps/driver-app/src/context/TruckContext.tsx`, `services/apiClient.ts`, `theme/`, shared `components/` — **unchanged**, reused as-is. This is exactly the reuse Phase 2's design anticipated ("Re-evaluate a state library starting Phase 3 if context nesting becomes unwieldy" — it doesn't; no new context is needed, see Design decision 6).
- `apps/dashboard` — **not touched** in this phase (see Scope/Out).

### Approaches (navigation placement)

1. **5th bottom tab ("Carga").** Rejected — dilutes the tab bar hierarchy Phase 2 just shipped (`Nueva Venta` primary emphasis, "max 4-5 tabs" as a ceiling not a target); a manifest is a ~1x/day action next to a many-times/day action, so equal tab billing overstates its frequency.
2. **Stack screen pushed from `HomeScreen` (chosen).** Zero new dependencies — native-stack is already installed and proven via `AuthStack`. `Inicio` becomes a 2-screen stack (`Home` → `LoadManifest`) instead of a bare screen component.
3. **Modal presentation over `HomeScreen`.** Rejected — nothing about this flow needs modal semantics (it's a full form with photo capture, not a quick confirm/cancel), and it introduces a second presentation style with no upside.

### Approaches (stock computation)

1. **Derived on-the-fly query (chosen).** See decision 3 in the table above.
2. **Persisted `TruckStock` running-balance model** updated transactionally on every manifest/sale write, with a "close of day" job to seed tomorrow's opening balance. Rejected for this phase — there is no close-of-day workflow to anchor it to yet, and a persisted number that's wrong from day one is harder to trust and harder to revert than a query that can be cached later.

### Recommendation

Nested stack screen for navigation; derived query for stock. Both keep this phase additive and reversible: no existing route, screen, or table is modified in a breaking way, and either direction (5th tab, persisted stock model) remains a cheap upgrade later if usage proves the assumption wrong.

### Risks

- The manifest photo still lands on local disk (`apps/api/uploads/`), same as every receipt today — this phase does not create the S3 migration risk, but it does add one more photo type depending on it.
- No `truckId` index exists on `Sale` today; a stock query summing `SaleItem` by truck without one is an easy detail to miss — called out explicitly in Design so it isn't lost between Explore and Tasks.
- Multiple manifests/day plus zero manifest-vs-sale enforcement (decisions 1, 2, 4) means the derived "remaining" stock number can go **negative** if a truck sold more than was ever loaded for it (bad data entry, or a sale recorded against the wrong truck). Decision: surface this as-is (a negative number), do not clamp or hide it — hiding it would make a real data problem invisible.
- All 8 assumptions in the Business Decisions table are unconfirmed. If decision 1 flips (manifest becomes mandatory before selling), `NewSaleScreen`'s save path needs a second guard shaped exactly like its existing `!truck` guard — cheap to add later, but explicitly not free, and not built preemptively here (YAGNI).

### Ready for Proposal

Yes, with all 8 open questions carried forward explicitly into Proposal/Design/Tasks — none are silently assumed away.

---

## 2. Proposal

# Proposal: Load Manifest ("remito de carga") (Phase 3)

## Intent

Phase 1 gave trucks a `capacity` field nobody reads. Phase 2 gave the driver-app a screen for every existing flow. This phase adds the one flow the roadmap has been building toward since Phase 1: a driver records what's physically loaded onto their truck at the start of the day (per-product quantities + an optional photo), and that record becomes the input side of a derived "how much stock is on this truck right now" view (loaded minus sold, carrying over day to day since nothing resets it). No new business logic is added to `Sale` — the manifest and the sale stay decoupled per the owner-unavailable assumptions above.

## Scope

### In Scope

- Prisma: `LoadManifest` + `LoadManifestItem` models; index `Sale(truckId, createdAt)`; `Truck.loadManifests` back-relation.
- `packages/shared`: `CreateLoadManifestInput`, `LoadManifestItemInput`, `LoadManifestRecord`, `TruckStockLine`, `TruckStockSummary`, `validateCreateLoadManifestInput`.
- API: `load-manifests` module — `POST /load-manifests` (`@Roles('admin','chofer')`), `GET /load-manifests/mine` (`@Roles('admin','chofer')`, driver-scoped from `req.user.username`, mirrors `GET /sales/mine`), `GET /load-manifests` (`@Roles('admin')`, all manifests, for a future dashboard).
- API: `GET /trucks/:id/stock` (`@Roles('admin')`, inherits `TrucksController`'s class-level guard) — derived stock summary for one truck as of an optional `asOf` date (default: today, business timezone, same helper pattern as `driver-truck-assignments.controller.ts`).
- driver-app: `LoadManifestScreen` (product stepper copy-adapted from `NewSaleScreen`, optional photo pick/capture copy-adapted from `ExpensesScreen`, truck-assigned guard identical in shape to `NewSaleScreen`'s).
- driver-app: `HomeStack` (`Home` → `LoadManifest`), `MainTabs` repointed at it; `HomeScreen` gains a manifest-status banner + CTA.
- Tests for all of the above under Strict TDD.

### Out of Scope (Non-Goals)

- Blocking `POST /sales` on a missing manifest (decisions 1, 2) — `Sale` and `LoadManifest` stay fully decoupled at the API.
- A persisted `TruckStock` model or any "close of day" workflow (decision 3).
- Migrating uploads to S3/cloud storage (decision 6) — reuses `POST /uploads/receipt` unchanged. Cross-cutting debt, not scheduled here.
- Adding manifest submission to the offline sync queue (decision 8) — `SyncContext` is untouched.
- A dashboard (`apps/dashboard`) screen for stock — this phase ships the API (`GET /trucks/:id/stock`) only; the roadmap's "live dashboard" is Phase 8. Explicitly not pulled forward, to keep this phase's blast radius bounded.
- Editing or canceling a submitted manifest — `Sale` has edit/cancel because money and audit trail are involved; no equivalent need has been identified for a manifest yet. If mis-entry turns out to be common, that's a follow-up phase, not a silent addition here.
- Any change to the container/visit/churn model (Phase 4).
- A 5th bottom tab (decision 7, rejected in Explore).

## Capabilities

### New Capabilities
- `load-manifest`: a `chofer` submits a manifest (assigned truck, per-product quantity, optional photo, optional note) at any point in the day; unlimited manifests per truck per day.
- `truck-stock-view`: a derived read (loaded − sold, active sales only) per product per truck, exposed via `GET /trucks/:id/stock`, admin-only in this phase.

## Approach

1. Tests first (Strict TDD): shared validator → API service/controller → driver-app screen, each RED before its GREEN, mirroring Phase 2's order.
2. Schema change first (migration applied before anything depends on it), then shared types, then the `load-manifests` API module, then the `trucks` stock endpoint, then the driver-app screen and navigation.
3. `LoadManifestScreen` relocates zero pre-existing code — unlike Phase 2's screens, there's no manifest UI in `App.tsx` history to extract. Its shape (stepper, photo actions, save button, feedback banner) is copy-adapted from `NewSaleScreen` + `ExpensesScreen`, not invented from scratch, to keep the UI vocabulary consistent with what a driver already knows from those two screens.
4. `HomeScreen` fetches manifest status once on mount, alongside the existing `refreshDaySummary()` call, with the same visible-error posture Phase 2 established (no silent catch — `summaryError`'s precedent, not the pre-Phase-2 swallowed one).

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Modified | New `LoadManifest`, `LoadManifestItem` models; new `Sale(truckId, createdAt)` index; `Truck.loadManifests` relation |
| `apps/api/src/load-manifests/` | New | Controller, service, module, specs |
| `apps/api/src/trucks/trucks.controller.ts` | Modified | New `GET /trucks/:id/stock` route |
| `apps/api/src/app.module.ts` | Modified | Registers `LoadManifestsModule` |
| `packages/shared/src/domain.ts` | Modified | New types + validator, additive only |
| `apps/driver-app/src/screens/LoadManifestScreen.tsx` | New | Manifest form |
| `apps/driver-app/src/screens/HomeScreen.tsx` | Modified | Manifest status banner + CTA |
| `apps/driver-app/src/navigation/HomeStack.tsx` | New | Wraps `Home` + `LoadManifest` |
| `apps/driver-app/src/navigation/MainTabs.tsx` | Modified | `Inicio` points at `HomeStack` |
| `apps/driver-app/src/context/{Truck,Sync,Auth}Context.tsx`, `services/apiClient.ts`, `theme/`, `components/` | Unchanged | Reused as-is |
| `apps/dashboard`, `apps/api/src/uploads/` | Unchanged | No dashboard UI this phase; upload mechanism reused verbatim |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Missing `truckId` index makes the stock query slow as `Sale`/`LoadManifestItem` volume grows | Medium | Add the index in the same migration as the new models, not as an afterthought |
| Stock can go negative with bad/mismatched data (decision-4 consequence) | Medium | Surface the negative number as-is in the API response; do not clamp — a hidden negative is a hidden data problem |
| Any of the 8 unconfirmed assumptions gets overturned by the owner after this ships | Medium | Every assumption is isolated to one guard/rule (e.g., decision 1 → one guard in `NewSaleScreen`'s save path), not threaded through multiple files, so reversal cost stays low |
| Photo upload keeps depending on local disk | Low (accepted debt) | Explicitly not fixed here; tracked as the pre-existing cross-cutting item in `README.md` |
| Refactor/feature exceeds the 800-line review budget | High (forecast confirms it) | `sdd-tasks` slices into chained PRs, see Tasks |

## Rollback Plan

This phase is additive at the schema level (two new tables, one new index, one new relation field) — no existing table or column is altered. Reverting the branch removes the new files and reverts `schema.prisma`; because this is the first phase to touch the schema after Phase 1's foundation migrations, the down-migration path (`prisma migrate resolve` or a generated down migration) needs to be exercised explicitly if the migration has already been applied to a shared database — Phase 1/2's rollback plans never had to say this because Phase 2 touched no schema. Backend routes are new (`/load-manifests/*`, `/trucks/:id/stock`) — removing them restores exact prior behavior everywhere else. New driver-app files are additive under `src/screens/` and `src/navigation/`; `MainTabs.tsx`'s one-line change (`HomeScreen` → `HomeStack`) is the only edit to an existing file outside `HomeScreen.tsx` itself.

## Success Criteria

- [ ] A `chofer` with an assigned truck today can submit a manifest (truck, ≥1 product quantity, optional photo, optional note) from `Inicio → Cargar camión`.
- [ ] A `chofer` without an assigned truck today sees the same class of guard `NewSaleScreen` already shows, cannot submit.
- [ ] A truck can receive more than one manifest on the same day without error.
- [ ] `POST /sales` behavior is provably unchanged — no new validation, no new required field, no new dependency on `LoadManifest` existing.
- [ ] `GET /trucks/:id/stock` returns loaded/sold/remaining per product for a truck, correct against manually seeded fixtures, including a case where remaining goes negative and is not clamped.
- [ ] `HomeScreen` shows whether a manifest was submitted today, without blocking any other action on that screen.
- [ ] `apps/driver-app` still builds and runs with the 4-tab bar unchanged in count; only `Inicio`'s content becomes a 2-screen stack.
- [ ] New backend and driver-app code has test coverage where it previously had none (this is all new code, not a refactor of covered code).

---

## 3. Spec

# Spec: Load Manifest ("remito de carga") (Phase 3)

## Domain: load-manifest (New)

### Requirement: Manifest creation endpoint
The system MUST expose `POST /load-manifests`, restricted to `@Roles('admin', 'chofer')`, accepting a truck, at least one `(productCode, quantity)` line, an optional photo reference, and an optional note. `driverName` MUST be resolved server-side from `req.user.username`, exactly like `createSale`/`updateSale`, and MUST NOT be accepted as trusted client input.

#### Scenario: Chofer submits a valid manifest
- GIVEN an authenticated `chofer` with a truck assigned today
- WHEN they POST a manifest with 2 product lines and no photo
- THEN a `LoadManifest` is created with `driverName` taken from the token, not the payload

#### Scenario: Empty items array is rejected
- GIVEN a manifest payload with `items: []`
- WHEN it is submitted
- THEN the request is rejected with a validation error, mirroring `validateCreateSaleInput`'s "items must include at least one product" rule

### Requirement: Driver-scoped manifest listing
The system MUST expose `GET /load-manifests/mine`, restricted to `@Roles('admin', 'chofer')`, returning only the authenticated driver's manifests, scoped server-side — same shape as `GET /sales/mine`.

#### Scenario: Driver sees only their own manifests
- GIVEN chofer D1 has submitted manifests and chofer D2 has submitted manifests
- WHEN D1 calls `GET /load-manifests/mine`
- THEN only D1's manifests are returned

### Requirement: Admin manifest listing
The system MUST expose `GET /load-manifests`, restricted to `@Roles('admin')`, returning all manifests across all drivers, for future dashboard use.

#### Scenario: Admin lists all manifests
- GIVEN manifests exist for multiple drivers
- WHEN an admin calls `GET /load-manifests`
- THEN all of them are returned regardless of driver

### Requirement: Multiple manifests per truck per day
The system MUST allow more than one `LoadManifest` for the same truck on the same calendar day. No unique constraint on `(truckId, date)` MUST exist.

#### Scenario: Mid-day reload
- GIVEN truck T already has a manifest submitted this morning
- WHEN a second manifest for truck T is submitted later the same day
- THEN both manifests persist and both count toward that truck's loaded total

### Requirement: Manifest photo is optional
`photoRef` MUST be optional on `CreateLoadManifestInput`, matching `CreateExpenseInput.receiptRef`'s optionality exactly.

#### Scenario: Manifest without a photo is accepted
- GIVEN a valid manifest payload with no `photoRef`
- WHEN it is submitted
- THEN the manifest is created successfully

### Requirement: Manifest does not gate sale creation
`POST /sales` MUST NOT validate, check, or depend on the existence of any `LoadManifest` for the driver's truck today. This is a deliberate behavior contract (owner-unavailable decisions 1–2), not an omission.

#### Scenario: Driver sells with zero manifests submitted today
- GIVEN a chofer with an assigned truck and no `LoadManifest` submitted today
- WHEN they POST a valid sale
- THEN the sale is created exactly as it would be with a manifest present — no new error, no new required field

## Domain: truck-stock-view (New)

### Requirement: Derived stock summary endpoint
The system MUST expose `GET /trucks/:id/stock`, restricted to `@Roles('admin')` (inherited from `TrucksController`'s class-level guard), accepting an optional `asOf` date query param (default: today in `America/Argentina/Buenos_Aires`, same helper pattern as `driver-truck-assignments.controller.ts`). For each `ProductCode`, it MUST return `loaded` (sum of `LoadManifestItem.quantity` for that truck, manifests created on or before `asOf`), `sold` (sum of `SaleItem.quantity` for that truck, only `status: 'active'` sales, created on or before `asOf`), and `remaining = loaded - sold`.

#### Scenario: Stock reflects manifests and active sales only
- GIVEN truck T has a manifest of 10×G10 and two sales of 3×G10 each, one canceled
- WHEN `GET /trucks/:id/stock` is called for T
- THEN `loaded=10`, `sold=3` (the canceled sale's 3 units are excluded), `remaining=7`

#### Scenario: Remaining can go negative and is not hidden
- GIVEN truck T sold more units of a product than were ever loaded onto it (bad data entry)
- WHEN `GET /trucks/:id/stock` is called for T
- THEN `remaining` for that product is a negative number, returned as-is, not clamped to 0

#### Scenario: A truck with zero manifests returns zero loaded, not an error
- GIVEN truck T has never received a manifest
- WHEN `GET /trucks/:id/stock` is called for T
- THEN every product line has `loaded=0` and the response is a normal 200, not a 404

## Domain: driver-app-load-manifest-screen (New)

### Requirement: Truck-assigned guard on the manifest screen
`LoadManifestScreen` MUST block manifest submission when the driver has no assigned truck today, showing the same class of guard message `NewSaleScreen` already shows for the identical condition.

#### Scenario: No truck assigned today
- GIVEN `useTruck().truck` is `null` and status is not `loading`
- WHEN the driver opens `LoadManifestScreen`
- THEN a guard message is shown and the save action is unavailable

### Requirement: HomeScreen manifest status banner
`HomeScreen` MUST show whether a manifest was submitted today for the driver's assigned truck, fetched once on mount alongside the existing day-summary refresh, with a visible error state on fetch failure (no silent catch).

#### Scenario: No manifest submitted today
- GIVEN the driver has an assigned truck and has not submitted a manifest today
- WHEN `HomeScreen` renders
- THEN a passive, non-blocking banner indicates no manifest was submitted today

#### Scenario: Manifest fetch fails
- GIVEN the manifest-status fetch fails (network error)
- WHEN `HomeScreen` renders
- THEN a visible error state is shown for that banner specifically — it does not silently disappear, and it does not block the rest of the screen

---

## 4. Design

# Design: Load Manifest ("remito de carga") (Phase 3)

## Technical Approach

Two new Prisma models (`LoadManifest`, `LoadManifestItem`) mirror the existing `Sale`/`SaleItem` parent-child shape exactly — same `id/createdAt/driverName` header fields, same child-table-with-cascade-delete pattern for line items. A new `load-manifests` Nest module follows the `sales` module's controller/service split verbatim: role-gated routes, `driverName` always resolved server-side from `req.user.username`, a `toRecord()` mapper at the bottom of the service. The stock view adds one route to the *existing* `TrucksController`, following the exact precedent `GET /trucks/:id/calendar` already set (inject a sibling module's service into this controller rather than growing `TrucksService`'s own responsibility). On the driver-app side, no new React Context is introduced — `LoadManifestScreen` calls `AuthContext.api` directly (same shape as `ExpensesScreen`'s consumer contract) and reads `useTruck()` directly (same as `NewSaleScreen`). Navigation grows by exactly one native-stack (`HomeStack`), reusing the `@react-navigation/native-stack` dependency `AuthStack` already proved out — zero new packages.

## Architecture Decisions

| # | Decision | Choice | Rejected | Rationale |
|---|---|---|---|---|
| 1 | Manifest model shape | `LoadManifest` (header) + `LoadManifestItem` (line, cascade delete) | A single JSON `items` column on `LoadManifest` | Matches `Sale`/`SaleItem` exactly — same query patterns (`include: { items: true }`), same audit-ability if edit/cancel is ever added later, no new serialization convention to learn |
| 2 | `driverName` trust boundary | Resolved server-side from `req.user.username` in the controller, exactly like `createSale` | Accepting a `driverName` field on the payload | Direct precedent (`sales.controller.ts`); a client-supplied driver name would let one chofer file a manifest as another |
| 3 | `truckId` trust boundary | Client supplies `truckId` (from `TruckContext.truck.truckId`, already server-resolved for *today*), server validates the truck exists and is active before writing — same `resolveCustomerAndTruck`-style check `sales.service.ts` already does for `input.truckId` | Trusting `truckId` blindly | Reuses the exact validation `SalesService.resolveCustomerAndTruck` already performs; no new trust model invented |
| 4 | Stock computation location | New method on `LoadManifestsService` (`getTruckStock`), injected into `TrucksController` for the route | A method on `TrucksService` | `TrucksService` owns truck CRUD only, same boundary the `calendar` endpoint already respects by injecting `DriverTruckAssignmentsService` instead of growing `TrucksService` |
| 5 | Stock query shape | Two `findMany` queries (`loadManifestItem` filtered by `manifest: { truckId, createdAt: { lte } }`, `saleItem` filtered by `sale: { truckId, status: 'active', createdAt: { lte } }`), reduced to per-product totals in TypeScript | A single raw SQL aggregate | Every existing service in this codebase reduces in JS (`calculateSaleTotal`, `toSaleRecord`), not SQL — consistent with the codebase's existing comfort level; can be optimized to a DB-side aggregate later without changing the response shape |
| 6 | Driver-app state management for the new screen | No new Context — `LoadManifestScreen` reads `useAuth()` and `useTruck()` directly, exactly like `ExpensesScreen`/`NewSaleScreen` already do | A new `ManifestContext` | Phase 2's design explicitly flagged re-evaluating a state library "if context nesting becomes unwieldy" — it isn't; this screen needs nothing that isn't already exposed |
| 7 | Navigation placement | New `HomeStack` (native-stack: `Home` → `LoadManifest`), `MainTabs`'s `Inicio` entry repointed at it | 5th bottom tab | Explore §Approaches — frequency mismatch with `Nueva Venta`; zero new dependencies since native-stack is already installed |
| 8 | Photo upload path | Reuse `POST /uploads/receipt` unchanged, same `api.postForm` pattern `ExpensesScreen.uploadReceipt` already uses | A dedicated `POST /uploads/manifest` route, or moving to S3 | The existing endpoint is already generic (nothing expense-specific in `uploads.controller.ts`); a dedicated route would be a distinction without a difference. S3 migration is explicitly out of scope (decision 6) |
| 9 | Sale/Manifest coupling | None — `POST /sales` is completely untouched by this phase | Adding a manifest-exists check to `createSale` | Owner-unavailable decisions 1–2; keeps this phase's blast radius on `sales.controller.ts`/`sales.service.ts` at exactly zero lines changed |
| 10 | Negative stock handling | Returned as-is, not clamped | Clamping `remaining` to `Math.max(0, ...)` | A clamp would hide a real data-integrity problem (sold more than ever loaded) instead of surfacing it |

## Target Structure

```
apps/api/src/load-manifests/
  load-manifests.controller.ts
  load-manifests.controller.spec.ts
  load-manifests.service.ts
  load-manifests.service.spec.ts
  load-manifests.module.ts

apps/api/src/trucks/
  trucks.controller.ts        (modified: + GET :id/stock)
  trucks.controller.spec.ts   (modified)

apps/driver-app/src/
  screens/LoadManifestScreen.tsx
  screens/LoadManifestScreen.test.tsx
  screens/HomeScreen.tsx              (modified: + manifest banner/CTA)
  navigation/HomeStack.tsx
  navigation/HomeStack.test.tsx
  navigation/MainTabs.tsx             (modified: Inicio -> HomeStack)
```

## Interfaces

```ts
// packages/shared/src/domain.ts — additive only
export type LoadManifestItemInput = {
  productCode: ProductCode;
  quantity: number;
};

export type CreateLoadManifestInput = {
  driverName: string;   // resolved server-side; present here only for the SaleRecord-style symmetry callers already expect
  truckId: string;
  truckCode?: string;
  items: LoadManifestItemInput[];
  photoRef?: string;
  note?: string;
};

export type LoadManifestRecord = {
  id: string;
  createdAt: string;
  driverName: string;
  truckId: string;
  truckCode?: string;
  items: LoadManifestItemInput[];
  photoRef?: string;
  note?: string;
};

export type TruckStockLine = {
  productCode: ProductCode;
  loaded: number;
  sold: number;
  remaining: number;   // may be negative — see design decision 10
};

export type TruckStockSummary = {
  truckId: string;
  asOf: string;
  lines: TruckStockLine[];
};

export function validateCreateLoadManifestInput(input: CreateLoadManifestInput): string[];
// mirrors validateCreateSaleInput: truckId required non-empty, items.length >= 1,
// each item.productCode in PRODUCT_CODES and quantity a positive integer,
// photoRef/note optional with the same non-empty-when-present rule as truckCode.
```

```ts
// apps/api/src/load-manifests/load-manifests.service.ts
async createManifest(input: CreateLoadManifestInput, actorUsername?: string): Promise<LoadManifestRecord>
async listManifests(): Promise<LoadManifestRecord[]>
async listManifestsByDriver(driverName: string): Promise<LoadManifestRecord[]>
async getTruckStock(truckId: string, asOf: string): Promise<TruckStockSummary>
// getTruckStock: two findMany calls (loadManifestItem where manifest.truckId + createdAt<=asOf;
// saleItem where sale.truckId + sale.status='active' + createdAt<=asOf), reduced per ProductCode.
```

```ts
// apps/api/src/trucks/trucks.controller.ts — additive route, existing routes untouched
@Get(':id/stock')
async getTruckStock(
  @Param('id') id: string,
  @Query('asOf') asOf?: string,
): Promise<TruckStockSummary> {
  await this.trucksService.getTruck(id);  // 404s on an unknown/inactive truck first, same as :id/calendar
  return this.loadManifestsService.getTruckStock(id, asOf || todayInBusinessZone());
}
```

Consumers on the driver-app side: `LoadManifestScreen` → `useAuth().api` (`postForm` for the photo, `post` for the manifest itself), `useTruck()` (guard + `truckId`/`truckCode`). `HomeScreen` → adds one `api.get<LoadManifestRecord[]>('/load-manifests/mine', { cache: 'no-store' })` call alongside its existing `refreshDaySummary()`, filtered client-side to today exactly like `SyncContext.refreshDaySummary` already filters sales to today (`createdAt.slice(0,10) === today`).

## Data Flow

    LoadManifestScreen.saveManifest
      -> (optional) pickReceiptImage/captureReceiptImage -> api.postForm('/uploads/receipt') -> photoRef
      -> api.post('/load-manifests', { truckId, truckCode, items, photoRef, note })
           ok  -> feedback banner success, quantities reset
           err -> feedback banner error (NO offline enqueue — decision 8)

    HomeScreen (on mount, alongside refreshDaySummary)
      -> api.get('/load-manifests/mine') -> filter today -> manifestSubmittedToday: boolean
           err -> visible banner error (no silent catch, same posture as summaryError)

    GET /trucks/:id/stock (admin, future dashboard consumer)
      -> TrucksController.getTruckStock -> trucksService.getTruck(id)  [404 guard]
                                         -> loadManifestsService.getTruckStock(id, asOf)
                                              -> loadManifestItem.findMany(manifest.truckId, createdAt<=asOf)
                                              -> saleItem.findMany(sale.truckId, sale.status='active', createdAt<=asOf)
                                              -> reduce both per ProductCode -> TruckStockLine[]

## Preserve vs New

| Must stay identical | New |
|---|---|
| `POST /sales`, `sales.controller.ts`, `sales.service.ts` — zero lines changed | `LoadManifest` + `LoadManifestItem` models, `Sale(truckId, createdAt)` index |
| `TruckContext`, `SyncContext`, `AuthContext` — zero lines changed | `load-manifests` module (controller/service/module + specs) |
| 4-tab bottom bar (count and labels) | `GET /trucks/:id/stock` on the existing `TrucksController` |
| `POST /uploads/receipt` behavior (disk storage, 5MB limit, image/* filter) | `LoadManifestScreen`, `HomeStack` |
| `NewSaleScreen`'s `!truck` guard pattern — reused, not modified | `HomeScreen` manifest-status banner (screen itself modified to add it) |
| | `validateCreateLoadManifestInput` + shared types |

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (shared) | `validateCreateLoadManifestInput` — required truckId, items >= 1, product/quantity shape, optional photoRef/note | Plain function assertions, mirrors `domain-validators.spec.ts` |
| Unit (API service) | `createManifest` resolves `driverName` from `actorUsername` only, `truckId` validated against `Truck` (404/inactive), `listManifestsByDriver` where-clause scoped, `getTruckStock` arithmetic (loaded/sold/remaining, negative-not-clamped, canceled sales excluded, zero-manifest truck returns zeros) | Nest `TestingModule` + Prisma mock, mirroring `sales.service.spec.ts` |
| Unit (API controller) | `@Roles` metadata per route (`admin,chofer` on POST/mine, `admin` on the plain list and on `:id/stock`), username never taken from body | Mirrors `sales.controller.spec.ts` / `trucks.controller.spec.ts` |
| Component (driver-app) | `LoadManifestScreen` — truck guard renders/blocks correctly, product stepper, optional photo pick/capture success + permission-denied + upload-failure paths (mirrors `ExpensesScreen.test.tsx`), save success/error feedback | RNTL render, `fetch`/`expo-image-picker` doubles |
| Component (driver-app) | `HomeStack` navigates `Home -> LoadManifest` and back; `HomeScreen`'s new banner: no-manifest-today, manifest-submitted-today, fetch-error states | RNTL render + navigation test helpers |

RED order: (1) shared validator; (2) `load-manifests` service (create + list + stock arithmetic); (3) `load-manifests` controller (roles + wiring); (4) `trucks.controller` stock route; (5) `LoadManifestScreen`; (6) `HomeStack` + `MainTabs` repoint; (7) `HomeScreen` banner.

## Threat Matrix

N/A for shell/subprocess/VCS/PR-automation/executable-classification concerns — this phase is in-app React Navigation, three additive HTTP routes behind the existing `JwtAuthGuard`/`RolesGuard`, and reuse of an already-shipped file-upload route. The one adversarial case in scope is design decisions 2 and 3: `driverName` and truck validity must never be trusted from the client payload — `driverName` comes only from `req.user.username`, and `truckId` is checked against the `Truck` table (exists + `isActive`) before any write, exactly like `SalesService.resolveCustomerAndTruck` already does. RED tests for both are listed in Testing Strategy row 2.

## Open Questions (resolved before tasks/apply where noted)

All eight are the Business Decisions table's assumptions, repeated here in the design's own checklist format for traceability. None are owner-confirmed; all were resolved to the most conservative, most reversible option to keep this document's Tasks section concrete instead of blocked.

- [ ] Is the manifest mandatory before the first sale of the day? — assumed **no** (informational only). Revisit if a driver-side incentive to file it turns out to be necessary.
- [ ] What happens on a sale with no manifest filed? — assumed **nothing enforced**, passive `HomeScreen` banner only.
- [ ] Persisted `TruckStock` vs. derived query? — assumed **derived**; revisit if the query becomes a measured performance problem.
- [ ] Multiple manifests per truck per day? — assumed **yes, unlimited**.
- [ ] Photo mandatory or optional? — assumed **optional**, matching the expense receipt precedent exactly.
- [ ] Cloud/S3 storage for the manifest photo? — assumed **no**, reuses `POST /uploads/receipt` as-is; tracked as pre-existing cross-cutting debt, not this phase's problem to solve.
- [ ] 5th tab vs. nested stack screen? — assumed **nested stack**, reusing native-stack already installed for `AuthStack`.
- [ ] Offline queue coverage for manifest submission? — assumed **no**, depot connectivity assumed more reliable than route connectivity; revisit if drivers report otherwise.

---

## 5. Tasks

# Tasks: Load Manifest ("remito de carga") (Phase 3)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1900–2300 total, across backend + driver-app |
| 800-line budget risk | High — roughly 2.5–3x the budget in a single unsplit PR |
| Chained PRs recommended | Yes |
| Suggested split | Tracker branch → PR1..PR5 |
| Delivery strategy | ask-on-risk |
| Chain strategy | `feature-branch-chain` (mirrors Phase 2's tracker-branch pattern; smaller chain since this phase's surface area is roughly a third of Phase 2's) |

Sizing basis (grounded in this repo's own precedent, not guessed): `sales.controller.ts`+`sales.service.ts` together are ~415 lines, their specs together ~460 lines (`sales.controller.spec.ts` 85 + `sales.service.spec.ts` 373); `trucks.service.spec.ts` alone is 261 lines for a service half `TrucksService`'s size; `ExpensesScreen.tsx` (271 lines) + its test (175 lines) is the closest single-screen precedent for `LoadManifestScreen`, which is larger (stepper + photo + guard combined, unlike Expenses which has no assigned-truck guard).

Base: tracker=`load-manifest` (off `main`). PR1→tracker; PR2→PR1; PR3→PR2; PR4→PR3; PR5→PR4. Tracker→`main` after PR5.

### Suggested Work Units

| Unit | Goal | PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Schema + shared types/validator | PR1 | `pnpm --filter shared test domain` | `pnpm --filter api exec prisma migrate dev` (local db) | revert PR1: drop migration, revert `schema.prisma`/`domain.ts` |
| 2 | `load-manifests` API module (controller+service+module+specs) | PR2 | `pnpm --filter api test load-manifests` | `curl` local Nest server w/ chofer + admin tokens | revert PR2, module unregistered from `app.module.ts` |
| 3 | `GET /trucks/:id/stock` | PR3 | `pnpm --filter api test trucks.controller trucks.service load-manifests.service` | `curl` local Nest server | revert PR3, `GET /trucks` family otherwise untouched |
| 4 | `LoadManifestScreen` (form + photo + guard) | PR4 | `yarn jest LoadManifestScreen` | `expo start` manual: submit manifest online, guard w/o truck | revert PR4, screen unwired |
| 5 | `HomeStack` + `MainTabs` repoint + `HomeScreen` banner | PR5 | `yarn jest HomeStack HomeScreen` | `expo start` manual: Inicio → Cargar camión → back, banner states | revert PR5, `Inicio` reverts to bare `HomeScreen` |

### Phase 1: Schema + shared types/validator (PR1)
- [ ] 1.1 RED `domain-validators.spec.ts` additions for `validateCreateLoadManifestInput` (missing truckId, empty items, invalid product/quantity, optional photoRef/note) → GREEN `packages/shared/src/domain.ts` (types + validator, additive only).
- [ ] 1.2 `LoadManifest` + `LoadManifestItem` models in `schema.prisma`; `Truck.loadManifests` relation; `Sale(truckId, createdAt)` index.
- [ ] 1.3 Generate + apply migration (`prisma migrate dev --name add_load_manifest`); verify `prisma generate` output includes the new client types.

### Phase 2: `load-manifests` API module (PR2)
- [ ] 2.1 RED `load-manifests.service.spec.ts`: `createManifest` stamps `driverName` from `actorUsername` only, validates `truckId` exists/active (404/409 like `SalesService.resolveCustomerAndTruck`) → GREEN `load-manifests.service.ts` (`createManifest`, `toRecord`).
- [ ] 2.2 RED `listManifests`/`listManifestsByDriver` where-clause tests → GREEN same file.
- [ ] 2.3 RED `load-manifests.controller.spec.ts`: `@Roles('admin','chofer')` on POST and `/mine`, `@Roles('admin')` on the plain list, username never taken from body → GREEN `load-manifests.controller.ts`.
- [ ] 2.4 `load-manifests.module.ts`; register in `app.module.ts`.

### Phase 3: Truck stock endpoint (PR3)
- [ ] 3.1 RED `load-manifests.service.spec.ts` additions: `getTruckStock` arithmetic — loaded/sold/remaining per product, canceled sales excluded, negative remaining not clamped, zero-manifest truck returns zeros → GREEN `getTruckStock` method.
- [ ] 3.2 RED `trucks.controller.spec.ts` addition: `GET :id/stock` 404s on unknown truck before computing stock, `asOf` defaults to today (business timezone) → GREEN route in `trucks.controller.ts`, injecting `LoadManifestsService`.

### Phase 4: `LoadManifestScreen` (PR4)
- [ ] 4.1 RED `LoadManifestScreen.test.tsx`: renders guard message and disables save when `useTruck().truck` is null → GREEN guard, copy-adapted from `NewSaleScreen`.
- [ ] 4.2 RED product stepper tests (increment/decrement, filters zero-quantity before submit) → GREEN stepper, copy-adapted from `NewSaleScreen`.
- [ ] 4.3 RED photo pick/capture tests: permission denied, cancel, success sets `photoRef`, upload failure shows error — copy-adapted from `ExpensesScreen.test.tsx` → GREEN.
- [ ] 4.4 RED save success/error feedback tests → GREEN `api.post('/load-manifests', ...)` call + `FeedbackBanner` wiring.

### Phase 5: Navigation + HomeScreen banner (PR5)
- [ ] 5.1 RED `HomeStack.test.tsx`: `Home` is the initial route, navigating to `LoadManifest` and back works → GREEN `HomeStack.tsx` (native-stack, `headerShown` decision left to implementation — default Nest/RN header is fine, no design requirement against it).
- [ ] 5.2 `MainTabs.tsx`: `Inicio` component becomes `HomeStack` (one-line change) + test update confirming the tab still renders.
- [ ] 5.3 RED `HomeScreen.test.tsx` additions: no-manifest-today banner, manifest-submitted-today state, fetch-error visible state → GREEN `HomeScreen.tsx` (`api.get('/load-manifests/mine')` alongside `refreshDaySummary`, today-filter client-side) + CTA button into `LoadManifestScreen`.

### Notes
- RED-first order matches Design: schema/shared(1) → API module(2) → stock endpoint(3) → screen(4) → navigation/banner(5) — same dependency order Phase 2 used (pure/backend before UI, UI before navigation wiring).
- PR2 is the largest single unit (~650–800 lines: controller+service+module+2 specs) and is the one most likely to itself need a second look against the 800-line budget once real line counts are known — flagged here rather than pre-split speculatively.
- PR4 (`LoadManifestScreen`) is the closest analog to Phase 2's PR7 (`NewSaleScreen`, its largest single-screen extraction) — same risk noted there applies: may need splitting further if the actual diff runs long.
- None of these PRs touch `apps/dashboard` — if the owner wants the stock view surfaced in the admin dashboard sooner than Phase 8, that is a follow-up change, not a hidden addition to this one.
