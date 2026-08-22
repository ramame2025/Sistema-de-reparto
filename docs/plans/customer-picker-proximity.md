# Change: Customer Picker + Quick Creation + Proximity Suggestion

**Phase**: 6 of 9 ([roadmap](./README.md))
**SDD artifact store**: Engram (project `sistema-de-reparto`, topic keys `sdd/customer-picker-proximity/*`)
**Status**: Planned — explore/proposal/spec/design/tasks complete, not yet implemented.

## Session Preflight (applies to this change)

- Pace: `auto` (phases run back-to-back; orchestrator gate-validates each result before launching the next)
- Artifact store: `engram`
- Delivery strategy: `ask-on-risk`
- Review budget: 800 changed lines
- Chain strategy: **pre-committed 3-PR chain** — forecast (Tasks §) puts this change at ~1230 total lines, well over the single-PR budget; each of the 3 PRs individually stays under 800, split at natural dependency/value boundaries (same chaining approach used in phases 3 and 4)

## Business Decisions Confirmed by the Owner

Only one decision for this phase was made at roadmap level (binding, not re-litigated here):

| Decision | Chosen |
|---|---|
| What this phase builds | "Customer picker + quick creation + proximity suggestion — depends on 1 (registry) and 5 (location)." Both dependencies are already merged: `Customer` (with optional `latitude`/`longitude`) since phase 1, `Sale.latitude`/`Sale.longitude` since phase 5. This phase is the first to build real search/selection UI and the first to do a geographic calculation in this codebase. |

## Open Questions (Owner Unavailable — Conservative Assumptions Applied)

The owner was not available to resolve these before planning. Each was given the most conservative/reversible assumption — the one that adds the least new mandatory behavior and is cheapest to tighten later if the real answer turns out stricter. This mirrors the exact methodology used in phases 3, 4, 5, and 7. All five are carried forward as explicit "Resolved Open Questions" in the Design section too, and must be re-confirmed with the owner before `sdd-apply` starts.

| # | Question | Conservative assumption taken | Why reversible |
|---|---|---|---|
| 1 | Does the picker replace the free-text `customerName` field, or coexist with it? | **Coexists.** `customerName` stays a directly-editable `TextInput`, exactly as today. The picker is an additive shortcut: picking a customer fills `customerName`/`customerType`/`customerId` from the registry, but the driver can still type a name freely for a customer that isn't registered yet. Not all customers will be loaded into the system on day 1 — forcing every sale through the registry would block real sales for exactly the population phase 1's registry hasn't caught up to yet. | Making the picker mandatory later (reject `POST /sales` without a `customerId`, or hide the free-text field) is a small, later, explicit tightening. Removing the free-text field today and discovering half the customer base isn't registered yet would block real sales — not reversible without a field hotfix, same class of risk phase 5's Open Question 1 flagged for GPS mandatoriness. |
| 2 | How many "nearby" customers are suggested, and with what radius/threshold? | **No radius cutoff.** The picker's list is re-sorted so the closest customers with known coordinates float to the top (default: highlight the 5 nearest), but the full alphabetical/searchable list stays reachable below — nothing is hidden or filtered out by distance. | A hard radius filter is strictly *more* restrictive and easy to add later (`distanceKm(origin, c) <= radiusKm`) once real data shows what a sane cutoff is. Filtering aggressively today risks hiding the exact customer the driver is standing in front of because their stored coordinates are a little off — a data-integrity problem no radius tuning fixes retroactively for that visit. Sort-not-filter is the safer default. |
| 3 | Does proximity use a fresh GPS read at picker-open time, or the last position captured on a previous sale? | **Fresh, one-shot read at the moment the picker screen mounts.** Phase 5 only ever captures `Sale.latitude`/`Sale.longitude` when a *previous* sale is confirmed — reusing that value here would mean suggesting customers based on where the driver was standing during their last confirmed sale, not where they are right now, potentially a different address entirely. The picker needs its own, independent GPS read, at a different moment than phase 5's point-in-time capture. | The exact moment/trigger (on mount vs. a manual "actualizar ubicación" button) is a small, contained UX tweak inside one screen — no data model or API implication either way. |
| 4 | Does quick customer creation require `latitude`/`longitude`? | **Optional, same as today's `CreateCustomerInput`.** The quick-create form never exposes raw numeric lat/lng inputs (nothing in this app has the driver type coordinates by hand, and this phase doesn't start that pattern). If the picker's own GPS read succeeded, the coordinates are silently attached to the new customer as a best-effort convenience; if there's no fix, the customer is still created with `latitude`/`longitude` left unset. | Making coordinates mandatory for quick-create is a one-line validator tightening later (`validateCreateCustomerInput`), the exact same shape of change phase 5 identified for its own mandatoriness question. Requiring it today would block quick-creation precisely where it's most likely to fail — weak/no signal in an underserved or newly-covered area, which is also where a fast, low-friction "just save the name and move on" flow matters most. |
| 5 | What happens if there's no GPS signal when the picker opens? | **Falls back to the plain alphabetical, still-searchable list — the picker is never blocked or disabled.** Extends the exact "no running tab / always charge" / "a sale is never blocked by a missing device signal" invariant phase 5 already established for `latitude`/`longitude` on `Sale`. | Nothing to reverse — this is the same permissive default already chosen for every other optional-hardware-signal case in this codebase (phase 5's Open Questions 1 and 4). Tightening it into "proximity is required, no list without it" later is a larger, deliberate UX regression that would need explicit owner sign-off; it isn't the direction this assumption would ever need loosening. |

---

## 1. Explore

## Exploration: customer-picker-proximity

### Current State

**`apps/api/src/customers/` — read directly, all four files (`customers.controller.ts`, `customers.service.ts`, `customers.module.ts`, `customers.service.spec.ts`):**
- `CustomersController` (`customers.controller.ts`, 18 lines to `@Controller`, read in full) carries a single class-level `@Roles('admin')` (line 19) and **zero per-route `@Roles` overrides** on `listCustomers` (`GET /customers`), `createCustomer` (`POST /customers`), or `deactivateCustomer` (`DELETE /customers/:id`). Confirmed against `apps/api/src/auth/roles.guard.ts` (read in full): `RolesGuard.canActivate` uses `this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()])` — handler-level metadata wins when present, but here none of the three handlers declare any, so **all three routes resolve to the class-level `['admin']`** and reject any `chofer` token. This is the exact "latent bug" pattern the roadmap's own README already documents for `GET /sales` (fixed in phase 2) — confirmed by direct comparison, not assumed from the roadmap's wording alone.
- The established fix pattern already exists twice in this codebase, both read in full: `apps/api/src/expenses/expenses.controller.ts` (class-level `@Roles('admin')`, then `@Roles('admin', 'chofer')` on the one route drivers need) and `apps/api/src/load-manifests/load-manifests.controller.ts` (identical shape — class-level `admin`, per-route `admin, chofer` override on `createManifest`/`listManifestsByDriver`). `apps/api/src/sales/sales.controller.ts` goes further and drops the class-level decorator entirely, annotating every route individually — also a valid variant of the same idea. Grepping `@Roles` across `apps/api/src` (12 files) confirms this "class default + per-route override for driver-facing routes" shape is the codebase's actual convention, not a one-off.
- `apps/api/src/load-manifests/load-manifests.controller.spec.ts` (read, lines 1-60) is the concrete test precedent for asserting this: `Reflect.getMetadata(ROLES_KEY, LoadManifestsController.prototype.createManifest)` compared with `toEqual(['admin', 'chofer'])`. `apps/api/src/customers/` has **no `customers.controller.spec.ts` today** — this phase adds the first one, following that exact pattern.
- `CustomersService.createCustomer`/`listCustomers`/`deactivateCustomer` (`customers.service.ts`, read in full, 81 lines) have no role-awareness themselves — the fix is entirely a controller-decorator change, zero service-layer changes needed for the access-control half of this phase.
- `CustomerRecord` (`customers.service.ts`, lines 5-15) is declared **locally** in the service file, not exported from `packages/shared`. Compared directly against `apps/api/src/trucks/trucks.service.ts` (read, lines 1-14): `TrucksService` imports `type TruckRecord` from `@distribuidor/shared` and re-exports it (`export type { TruckRecord };`) — the established convention for every other `*Record` type is "declared once in shared, re-exported from the owning service," and `Customer` is the one entity that currently breaks this pattern. `packages/shared/src/domain.ts` (read in full, 714 lines) confirms: `CreateCustomerInput` exists (lines 236-242) but no `CustomerRecord` does. The driver-app cannot type a `GET /customers` response today without either duplicating the shape a third time or importing directly from `apps/api` (which it never does anywhere else — every driver-app/shared boundary crossing goes through `@distribuidor/shared`).

**`packages/shared/src/domain.ts` — read in full:**
- `CreateCustomerInput` (236-242): `{ name: string; customerType: CustomerType; zone?: string; latitude?: number; longitude?: number }`. `validateCreateCustomerInput` (580-610) already range-checks `latitude`/`longitude` when present (`-90..90`/`-180..180`, same guards phase 5 added to `validateCreateSaleInput`) — this phase reuses both unchanged; no validator work needed for creation itself.
- `CreateSaleInput` (48-63) **already has** `customerId?: string` (line 57) and `latitude?`/`longitude?` (61-62, phase 5). Nothing needs to be added here — the type-level contract for "a sale linked to a registered customer, from a captured position" already fully exists.
- No `CustomerRecord` export anywhere in the file (confirmed by reading the whole 714 lines, not just grepping) — this is the one concrete gap in shared for this phase to close.
- No distance/geo utility of any kind exists in `packages/shared/src` — confirmed by both reading `domain.ts` in full and `packages/shared/src/index.ts` (2 lines: `export * from "./domain.js"`, the package's only export surface). `packages/shared/src` contains exactly two files today (`index.ts`, `domain.ts`) — this phase is the first to introduce a second module, a genuine (small) precedent-setting choice, not an assumption.

**`apps/api/src/sales/sales.service.ts` — read in full, lines 1-100 in detail, remainder skimmed for `customerId`/`customerName`/`customerType` occurrences (13 matches, all read in context):**
- `resolveCustomerAndTruck` (private method, lines 52-94) is the load-bearing discovery of this exploration: **the backend already fully supports linking a `Sale` to a real `Customer` via `customerId`.** Given `input.customerId`, it does `prisma.customer.findUnique`, throws `NotFoundException` if missing, `ConflictException` if `!customer.isActive`, and — critically — **overrides** `customerType`/`customerName` from the stored `Customer` row rather than trusting whatever the caller sent for those two fields (lines 71-73). This method already serves `createSale`, `recordEmptyVisit`, and `updateSale` (confirmed via all three call sites, lines 128, 193, 257) through the shared `SaleIdentityLookupInput` type (lines 40-43), explicitly documented in the code's own comment as deliberately shared to avoid duplicating the lookup logic across `CreateSaleInput` and `RecordEmptyVisitInput`.
- **Consequence for this phase's scope**: zero changes needed to `sales.service.ts`, `sales.controller.ts`, or `packages/shared`'s `CreateSaleInput`/`validateCreateSaleInput` to make "a sale linked to a picked customer" work end-to-end. The backend contract phase 6 needs was actually finished in phase 1, just never consumed by any UI. This phase's backend work is narrowly: (a) the `CustomersController` role fix so a chofer can call `GET`/`POST /customers` at all, and (b) exporting `CustomerRecord` from shared so the driver-app can type the response. Nothing else on the API side.
- `apps/api/prisma/schema.prisma` (grepped directly for `customerId|latitude|longitude|model Sale|model Customer`): `Sale.customerId String?` (line 81) with `@@index([customerId])` (line 95) and a `customer Customer? @relation(...)` (line 88) already exist, alongside `Sale.latitude`/`Sale.longitude` (86-87, phase 5) and `Customer.latitude`/`Customer.longitude` (150-151, phase 1). **No Prisma migration is needed this phase** — every column and index this phase's backend behavior depends on is already in the schema and already migrated.

**`apps/driver-app/src/screens/NewSaleScreen.tsx` — read in full, 680 lines:**
- `customerName` (line 119) defaults to the literal string `'Cliente de prueba'` and is bound to a plain `TextInput` (lines 431-436) — free text, confirmed exactly as the task brief described, not assumed.
- The outgoing `CreateSaleInput` payload assembled in `saveSale()` (lines 261-279) sends `customerName`/`customerType` but **never sends `customerId`** — confirmed by reading the full object literal. Even though the type and the backend both support it (see above), today's UI has no way to populate it. This is the actual gap this phase closes on the driver-app side.
- Phase 5's `captureSaleLocation()` (lines 40-90, read in full) is a self-contained module-level function: `requestForegroundPermissionsAsync()` → `.granted` check → `Promise.race([getCurrentPositionAsync(...), timeout])` with a `LOCATION_TIMEOUT_MS = 8000` constant, `try/finally` clearing the timeout handle, catch-all returning `null` on any failure. It is called **only from inside `saveSale()`**, at sale-confirmation time (Design decision #2 of phase 5, explicit in its own comment: "captured only here... never on screen mount"). This is a different moment than what phase 6 needs: the picker needs a position *before* a sale is even being assembled, to suggest nearby customers while the driver is still choosing who they're selling to. Reusing `captureSaleLocation()` as-is (calling it from the picker too) is technically possible since it's a plain exported-shape function, but it currently lives inlined in `NewSaleScreen.tsx`, not in a shared/reusable location — a second call site (`CustomerPickerScreen`) importing a helper out of a sibling screen file would be an unusual dependency direction for this codebase (screens import from `services`/`context`/`components`, never from each other, confirmed by the import blocks of every screen file read this exploration). This is a real "where does this code live" decision (Design decision, not an assumption): extracting the permission+timeout+race logic into `apps/driver-app/src/services/location.ts`, parameterized by timeout, keeps both call sites (phase 5's confirm-time capture, phase 6's picker-open-time capture) importing from `services/`, consistent with the existing `apiClient.ts`/`offlineQueue.ts`/`storage.ts` pattern, and avoids copy-pasting the permission/race/timeout logic a second time.
- **Data-integrity finding, not previously documented anywhere**: because `resolveCustomerAndTruck` (above) unconditionally overrides `customerName`/`customerType` from the stored `Customer` row whenever `customerId` is present, a screen that (a) lets the driver pick a customer (setting `customerId` + prefilling `customerName`) and (b) still lets the driver freely edit that same `customerName` `TextInput` afterward has a latent trap: an edit made *after* picking would be silently discarded server-side, because the server never reads the submitted `customerName` when `customerId` is set — the driver would see their edited text locally, submit it, and the sale would silently record the *original* registered name instead. This is a genuine UX/data-integrity bug this phase's design must close explicitly (see Design decision below: clear `customerId` the moment `customerName` is edited after a pick), found only by reading `resolveCustomerAndTruck` and `NewSaleScreen`'s free-text field side by side — not stated anywhere in the roadmap or task brief.

**`apps/driver-app/src/navigation/` — `MainTabs.tsx`, `HomeStack.tsx` read in full:**
- `MainTabs.tsx` (78 lines) wires 4 flat `Tab.Screen`s. `"Nueva Venta"` points **directly** at `component={NewSaleScreen}` (line 52) — unlike `"Inicio"`, which points at `component={HomeStack}` (line 45), a nested stack navigator. `NewSaleScreen` today has **no stack wrapper at all** and therefore no route-params channel to receive anything back from a pushed/presented screen.
- `HomeStack.tsx` (38 lines, read in full) is the direct, load-bearing precedent for "how a new screen gets added inside an existing tab" in this codebase: a `createNativeStackNavigator<HomeStackParamList>()`, `initialRouteName` pointing at the tab's existing screen, a second `Stack.Screen` for the new flow (`LoadManifest`), `headerShown: false` at the navigator level with the new screen opting back into `headerShown: true` for its own "volver" affordance. Its own doc comment states explicitly this was "phase 3 PR5... a stack screen pushed from HomeScreen, not a 5th bottom tab" — the exact same reasoning applies here: a customer picker is not a fifth tab, it's a flow nested under "Nueva Venta."
- No React Navigation screen in this codebase currently uses `presentation: 'modal'` or passes params back from a pushed screen to its opener (`HomeStackParamList`'s `LoadManifest: undefined` — no params at all, confirmed by reading the type). This phase introduces both: the first modal-presented screen, and the first "pick something, return it to the caller via nav params" flow.

**`apps/driver-app/src/screens/LoadManifestScreen.tsx` — read (first 120 lines, enough to confirm shape) as the second reference for "how much UI a driver-app form screen already runs to" (photo permission/upload flow, quantity stepper, `useAuth()`/`useTruck()` consumed directly, no dedicated Context): a full, dedicated screen file in this codebase for a comparably-scoped feature runs several hundred lines including its test file — used below to size the new `CustomerPickerScreen.tsx`.

**`apps/api/src/customers/customers.service.spec.ts` — read in full, 183 lines**: existing coverage is `createCustomer` (isActive default, same-name-different-zone case), `listCustomers` (excludes inactive), `deactivateCustomer` (soft delete, doesn't touch `Sale`, 404 on missing). None of this needs to change — the role/access fix is entirely at the controller layer, and this spec file's Prisma-double pattern (`buildCustomerRow`) is reused as-is by the new `customers.controller.spec.ts`'s service mocks.

### Affected Areas

- `apps/api/src/customers/customers.controller.ts` — add `@Roles('admin', 'chofer')` to `listCustomers` and `createCustomer`; leave `deactivateCustomer` on the class-level `admin`-only default (deactivation stays an admin action, consistent with every other "soft delete" in this codebase being admin-gated).
- `apps/api/src/customers/customers.controller.spec.ts` — **new file**, `Reflect.getMetadata(ROLES_KEY, ...)` assertions, same shape as `load-manifests.controller.spec.ts`.
- `apps/api/src/customers/customers.service.ts` — replace the locally-declared `CustomerRecord` type with `import { type CustomerRecord } from '@distribuidor/shared'` + `export type { CustomerRecord };`, matching `trucks.service.ts`'s pattern exactly. No behavioral change.
- `packages/shared/src/domain.ts` — add and export `CustomerRecord` (mirrors `CustomerType`/`zone`/`latitude`/`longitude`/`isActive`/`createdAt`/`updatedAt`, the exact shape already used locally in `customers.service.ts`).
- `packages/shared/src/geo.ts` — **new file**, first module split in this package: a pure Haversine `distanceKm(a, b)` function plus a `sortByProximity` helper, no I/O, no dependency on `domain.ts`.
- `packages/shared/src/index.ts` — add `export * from "./geo.js";`.
- `apps/driver-app/src/services/location.ts` — **new file**, extraction of phase 5's `captureSaleLocation` permission+timeout+race logic into a reusable, timeout-parameterized helper.
- `apps/driver-app/src/screens/NewSaleScreen.tsx` — switch to importing the extracted location helper (no behavior change); add a "Elegir cliente" button; accept an optional `pickedCustomer` route param; sync it into `customerId`/`customerName`/`customerType` state; clear `customerId` if `customerName` is hand-edited afterward (closes the data-integrity gap found above); include `customerId` in the outgoing payload when set.
- `apps/driver-app/src/navigation/NewSaleStack.tsx` — **new file**, mirrors `HomeStack.tsx`: `Sale` (existing `NewSaleScreen`, now params-aware) and `CustomerPicker` (new, `presentation: 'modal'`) routes.
- `apps/driver-app/src/navigation/MainTabs.tsx` — `"Nueva Venta"` tab points at `NewSaleStack` instead of `NewSaleScreen` directly.
- `apps/driver-app/src/screens/CustomerPickerScreen.tsx` — **new file**: search box, customer list (`GET /customers`), proximity-aware sort using `packages/shared`'s `distanceKm`/`sortByProximity` plus the extracted `services/location.ts` helper, tap-to-select (navigates back with `pickedCustomer`), inline quick-create form (`POST /customers`).
- `apps/dashboard` — **no changes this phase** (no customer UI exists there at all yet — confirmed via search; out of scope, consistent with phase 8's "admin-assigned daily customer list" being the eventual dashboard-side consumer).

### Approaches

**Screen architecture — inline dropdown vs. plain pushed screen vs. modal-presented screen (real tradeoff, resolved with a recommendation):**

**A — Inline dropdown/autocomplete inside `NewSaleScreen`'s existing card** (no new screen, no new stack).
- *Pros*: zero navigation changes, smallest possible diff, no `NewSaleStack` needed.
- *Cons*: `NewSaleScreen` is already a long, multi-card scroll screen (680 lines, 6 cards: cliente, productos, total/guardar, visita sin venta, editar, anular). A real search-as-you-type list plus a "cliente cercano" section plus a quick-create mini-form competing for space inside one `TextInput`'s dropdown is cramped, and this is the field the driver touches on **every single sale** — the highest-frequency interaction in the whole app. A small, scroll-constrained dropdown is a worse fit for "search + proximity-sorted list + create" than it is for a handful of autocomplete suggestions.

**B — Plain pushed screen, `LoadManifestScreen`-style** (native-stack default header + back arrow, no modal presentation).
- *Pros*: reuses the exact, already-proven `HomeStack`/`LoadManifestScreen` pattern with zero new navigation concepts.
- *Cons*: `LoadManifestScreen` is a ~once-a-day action; a full stack push (with its default slide-from-the-right, "deep navigation" feel) for an action repeated on every sale reads as heavier than the interaction actually is. Roadmap phase 9 ("driver UX polish — big buttons, minimal typing") is explicitly about reducing friction for exactly this kind of frequent action; introducing a heavyweight-feeling pattern here now just to lighten it again in phase 9 is avoidable.

**C — Modal-presented screen inside a new `NewSaleStack`** (React Navigation `presentation: 'modal'`, slide-up, explicit close affordance) — **recommended**.
- *Pros*: gets the same full screen real estate as B (room for a search box, a proximity-sorted list, and an inline quick-create form — much more than A's cramped dropdown) while the modal presentation itself signals "quick lookup, snap back to what you were doing" rather than "navigate away," a better semantic match for an action repeated many times a day. Still only one new navigation concept (`NewSaleStack`, directly modeled on `HomeStack`) plus one presentation-mode flag.
- *Cons*: this is the first modal-presented screen and the first "pick something, return it via nav params" flow in this codebase — some genuinely new navigation plumbing (documented in Design), not a copy-paste of an existing pattern the way B would be.

**Recommendation: C.** The frequency of use (every sale, not once a day) is the deciding factor over B, and the amount of UI the picker needs (search + proximity list + quick-create) is the deciding factor over A.

**Distance calculation — where it lives (real tradeoff, resolved with a recommendation):**

**A — Server-side, a new `GET /customers/nearby?lat=&lng=` endpoint** computing distance in the service layer (or via a DB spatial query).
- *Pros*: centralizes the logic, could later use a real spatial index if the customer list grows large enough to matter.
- *Cons*: adds a second network round-trip to picker-open (fetch customers, *then* fetch nearby-sorted customers, or replace the plain list fetch with a lat/lng-parameterized one every time the picker opens) in an app whose whole architecture (`trySendSale`/`enqueueSale`, single-payload-per-action) is built around minimizing extra network dependencies for offline-friendliness. Nothing else in this codebase computes geography server-side yet, and the customer list size for a small distribution business doesn't remotely need spatial indexing today — introducing that machinery now is solving a scale problem this business doesn't have.

**B — Client-side, a pure function in `packages/shared`, computed in the driver-app against an already-fetched customer list** — **recommended**.
- *Pros*: `GET /customers` is fetched once per picker-open (or cached across opens, same as `TruckContext`'s `/driver-truck-assignments/me` pattern), and sorting/filtering by distance happens entirely on-device against data already in memory — zero extra network calls. Putting the pure math (`distanceKm`) in `packages/shared` rather than only in `apps/driver-app` means `apps/api` can import the exact same function later without duplicating it, if phase 8 (live dashboard) or any future phase ever wants server-side proximity/geofencing — it costs nothing to place it where both consumers can reach it, and this codebase already has the precedent of pure, side-effect-free domain functions (`calculateSaleTotal`) living in shared for exactly this "logic both apps might need" reason.
- *Cons*: sends the full active customer list to the driver-app on every picker fetch rather than a pre-filtered subset. Judged acceptable — this is a small distribution business's customer registry, not a metropolitan-scale directory, and `GET /customers` already returns the full list today for the (currently admin-only) dashboard use case with no pagination; this phase doesn't need to solve a scale problem the existing endpoint doesn't already have.

**Recommendation: B.** No new endpoint, no new network round-trip, reuses this codebase's only existing "logic needed by more than one app" pattern (`packages/shared` pure functions).

### Risks

- Open Questions 1-5 unresolved without the owner; conservative assumptions taken and must be re-confirmed before `sdd-apply`, same protocol as every prior phase.
- This is the first screen in `apps/driver-app` doing a **search-as-you-type over a fetched list** — no existing precedent for debouncing, empty-state copy, or "no results" UX in this codebase. Some UI-polish decisions will be made ad hoc during `sdd-apply` inside the conservative defaults this doc sets, not because the roadmap or owner specified them.
- The data-integrity gap found in Explore (a `customerName` edit after picking a customer being silently discarded server-side) is a genuinely new class of bug for this codebase — the first UI screen where two different fields feed into a single, order-dependent backend resolution (`customerId` overriding `customerName`/`customerType`). Mitigated by an explicit design decision (clear `customerId` on manual edit) and a dedicated test, but a maintainer changing `NewSaleScreen`'s field-editing logic later could reintroduce the trap without realizing why the clear-on-edit line is there — same class of risk phase 5 flagged for `updateSale`'s unconditional field-ignore, mitigated the same way (explicit comment).
- Quick customer creation is deliberately **online-only** this phase (no offline queue) — see Design decision below. A chofer who tries to quick-create a customer while offline gets an error and must fall back to the free-text `customerName` field (Open Question 1's coexistence). This is a real, user-visible limitation, not a hidden one; flagged explicitly rather than silently degrading.
- `packages/shared` gaining a second source file (`geo.ts`, alongside `domain.ts`) is a small structural precedent this phase sets for the whole package — reasonable given `distanceKm` has no conceptual relationship to any of the business-entity types `domain.ts` owns, but worth flagging as a deliberate, first-of-its-kind choice, not an unconsidered one.
- The picker's own GPS read (Open Question 3) is a **second, independent** location-permission prompt/read in the same user session as phase 5's sale-confirmation capture — the driver may see the OS permission dialog at picker-open time even though they already granted it once for a previous sale (Expo/OS-level permission grants persist across requests once granted, so in practice this is a no-op re-check after the first grant, but the first time a driver opens the picker in a fresh install, they'll see the location prompt earlier in their flow than phase 5 alone would have surfaced it).

---

## 2. Proposal

# Proposal: Customer Picker + Quick Creation + Proximity Suggestion

### Intent

Every sale today identifies a customer by free-text name only — `Sale.customerId` and the backend logic to resolve it (`resolveCustomerAndTruck`) have existed since phase 1, but no driver-app screen has ever set it, so no sale has ever actually been linked to a `Customer` record in practice. This blocks any future feature that depends on "which real customer was this sale for" (a daily assigned visit list in phase 8, deduplicated customer history, proximity-based routing). This phase closes that gap: a chofer can search/browse the customer registry, get proximity-sorted suggestions based on their current GPS position, pick a customer (auto-filling name/type and setting `customerId` on the sale), or quick-create a new customer inline when the real one isn't registered yet — all without ever blocking a sale, matching the "no running tab / always charge" invariant this roadmap has protected in every prior phase.

### Scope

**In Scope**
- `apps/api/src/customers/customers.controller.ts`: `@Roles('admin', 'chofer')` on `GET /customers` and `POST /customers`; `DELETE /customers/:id` stays admin-only.
- `apps/api/src/customers/customers.controller.spec.ts`: new file, role-metadata assertions (`Reflect.getMetadata`).
- `apps/api/src/customers/customers.service.ts`: `CustomerRecord` re-exported from `@distribuidor/shared` instead of declared locally — no behavior change.
- `packages/shared/src/domain.ts`: export `CustomerRecord`.
- `packages/shared/src/geo.ts` (new) + `packages/shared/src/index.ts`: pure `distanceKm`/`sortByProximity` helpers, no I/O.
- `apps/driver-app/src/services/location.ts` (new): extracted, timeout-parameterized permission+read helper, reused by phase 5's sale-confirmation capture and this phase's picker-open capture.
- `apps/driver-app/src/navigation/NewSaleStack.tsx` (new) + `MainTabs.tsx`: `"Nueva Venta"` becomes a 2-screen modal-capable stack (`Sale`, `CustomerPicker`).
- `apps/driver-app/src/screens/CustomerPickerScreen.tsx` (new): search, proximity-sorted list, quick-create form.
- `apps/driver-app/src/screens/NewSaleScreen.tsx`: "Elegir cliente" entry point, `pickedCustomer` route-param sync, `customerId` in the outgoing payload, clear-`customerId`-on-manual-edit.
- Jest tests in `apps/api`, `packages/shared`, and `apps/driver-app` for every new/changed path, strict TDD.

**Out of Scope**
- Any Prisma schema/migration change — `Sale.customerId`/`latitude`/`longitude` and `Customer.latitude`/`longitude` already exist (phases 1 and 5).
- Any change to `sales.service.ts`, `sales.controller.ts`, or `CreateSaleInput`'s validator — `resolveCustomerAndTruck`'s `customerId` handling already fully supports this phase's needs.
- Making the picker mandatory or removing the free-text `customerName` field (Open Question 1 — coexistence).
- A hard proximity radius/cutoff that hides customers (Open Question 2 — sort, don't filter).
- Reusing a previously-captured sale location for proximity, instead of a fresh read (Open Question 3).
- Requiring `latitude`/`longitude` to quick-create a customer, or adding manual coordinate-entry inputs (Open Question 4).
- Offline queueing for `POST /customers` — quick creation is online-only this phase; a failed/offline attempt shows an error and the driver falls back to free text, mirroring `LoadManifestScreen`'s existing "no offline queue for the photo, a failed POST just errors" precedent for a non-sale write.
- Any server-side proximity endpoint or spatial indexing — client-side computation against an already-fetched list, per the Explore section's approach comparison.
- Any dashboard UI for customers — none exists today; out of scope for this phase, likely phase 8's territory.
- Editing or deactivating a customer from the driver-app — `DELETE /customers/:id` stays admin-only, no driver-app UI for it.

### Capabilities

**New**: `customer-directory-access` (chofer role gains read+create access to the customer registry, previously admin-only) and `customer-proximity-picker` (driver-app UI: search, proximity sort, quick creation, linking a sale to a real customer).
**Modified**: none at the API contract level — `sale-recording`'s `customerId` support was already complete as of phase 1; this phase is the first to exercise it from a real UI.

### Approach

Almost entirely additive, and unusually backend-light for this roadmap: the two backend changes are a `@Roles` decorator fix (2 lines) and moving one type definition into `packages/shared` for reuse. The bulk of the work is new driver-app UI (`CustomerPickerScreen`) plus a new, small, pure geometry utility (`packages/shared/src/geo.ts`) and a navigation restructuring (`NewSaleStack`) that gives `NewSaleScreen` its first-ever route-params channel. No new database columns, no new Prisma migration, no changes to any existing sale-creation validation or service logic.

### Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `apps/api/src/customers/customers.controller.ts` | Modified | `@Roles('admin', 'chofer')` on list/create routes |
| `apps/api/src/customers/customers.controller.spec.ts` | New | Role-metadata assertions |
| `apps/api/src/customers/customers.service.ts` | Modified | `CustomerRecord` imported/re-exported from shared, no behavior change |
| `packages/shared/src/domain.ts` | Modified | `CustomerRecord` exported |
| `packages/shared/src/geo.ts` | New | Pure `distanceKm`/`sortByProximity` |
| `packages/shared/src/index.ts` | Modified | Re-export `geo.ts` |
| `apps/driver-app/src/services/location.ts` | New | Extracted, reusable permission+timeout+read helper |
| `apps/driver-app/src/navigation/NewSaleStack.tsx` | New | `Sale`/`CustomerPicker` stack, modal presentation for the picker |
| `apps/driver-app/src/navigation/MainTabs.tsx` | Modified | `"Nueva Venta"` points at `NewSaleStack` |
| `apps/driver-app/src/screens/CustomerPickerScreen.tsx` | New | Search, proximity sort, quick-create |
| `apps/driver-app/src/screens/NewSaleScreen.tsx` | Modified | Picker entry point, route-param sync, `customerId` in payload, clear-on-edit |
| `apps/api/prisma/schema.prisma` | Unchanged | No migration needed — all columns already exist |
| `apps/dashboard` | Unchanged | No customer UI exists there yet; out of scope |

### Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Data-integrity trap: editing `customerName` after picking silently discards the edit server-side (found in Explore) | Medium | Explicit clear-`customerId`-on-edit behavior, dedicated test, code comment explaining why |
| First modal-presented, params-returning screen in this codebase — new navigation plumbing, no copy-paste precedent | Medium | Modeled closely on `HomeStack`'s already-proven stack-inside-a-tab shape; only the presentation mode and the params-back call are genuinely new |
| Sending the full active customer list to the driver-app on every picker fetch (no server-side filtering) | Low | Judged acceptable at this business's scale; `GET /customers` already returns the unfiltered full list today for its (admin-only) existing consumer |
| Quick customer creation is online-only; a chofer offline can't quick-create | Medium | Explicit fallback to free-text `customerName` (Open Question 1's coexistence design); flagged, not hidden |
| Assumptions taken for Open Questions 1-5 turn out wrong once the owner is reachable | Medium | All five chosen as the cheapest-to-tighten-later option; flagged for re-confirmation before `sdd-apply` |
| Forecast exceeds the 800-line review budget | High (confirmed) | Pre-committed 3-PR chain (Tasks §), each PR independently under budget |

### Rollback Plan

Fully additive, no schema migration to roll back. Each of the 3 chained PRs (Tasks §) is independently revertible: PR1 (backend role fix + shared types/geo helper) reverting restores `CustomersController` to admin-only and removes the unused `geo.ts` — no other code depends on it yet. PR2 (driver-app navigation skeleton + basic picker) reverting restores `MainTabs` to pointing directly at `NewSaleScreen` and removes the picker entirely — `NewSaleScreen` without the picker button behaves exactly as it does today. PR3 (proximity + quick-create) reverting removes only the sort/create additions to an already-shipped, functioning picker from PR2. No historical `Sale` or `Customer` row is touched by any of the three.

### Success Criteria

- [ ] A `chofer`-role token can call `GET /customers` and `POST /customers` successfully; `DELETE /customers/:id` still rejects a `chofer` token.
- [ ] `CustomerRecord` is importable from `@distribuidor/shared` and used by both `apps/api` and `apps/driver-app`.
- [ ] `distanceKm`/`sortByProximity` in `packages/shared` are pure, tested independently of any UI or network code.
- [ ] A driver can open the customer picker from `NewSaleScreen`, search/browse the registry, and pick a customer — `customerName`/`customerType`/`customerId` populate on `NewSaleScreen` and `customerId` is included in the sale payload.
- [ ] When the picker has a GPS fix, the nearest customers with known coordinates are sorted to the top of the list; the full list stays reachable/searchable regardless.
- [ ] When the picker has no GPS fix (denied/no signal/timeout), the list still renders and is still searchable — the picker is never blocked.
- [ ] Editing `customerName` by hand after picking a customer clears the linked `customerId` — the sale is submitted with the edited free-text name, not silently discarded.
- [ ] A driver can quick-create a customer from the picker (`POST /customers`) with only `name`/`customerType` required; `latitude`/`longitude` are attached automatically when a GPS fix is available, omitted otherwise.
- [ ] Quick creation while offline surfaces an error and does not silently fail or hang; the sale can still proceed via free-text `customerName`.
- [ ] Jest suites in `apps/api`, `packages/shared`, and `apps/driver-app` cover every new/changed path and pass.

---

## 3. Spec

# Spec: Customer Picker + Quick Creation + Proximity Suggestion

### Domain: customer-directory-access (New)

**Requirement: `chofer` role can list and create customers**
`GET /customers` and `POST /customers` MUST accept requests authenticated with either the `admin` or `chofer` role. `DELETE /customers/:id` MUST continue to accept only `admin`. *(Previously: all three routes were admin-only.)*

- *Scenario: Chofer lists customers* — GIVEN a valid `chofer`-role JWT, WHEN `GET /customers` is called, THEN it returns 200 with the active customer list, identical in shape to what an admin sees.
- *Scenario: Chofer creates a customer* — GIVEN a valid `chofer`-role JWT and a valid `CreateCustomerInput`, WHEN `POST /customers` is called, THEN it returns 201 and the created `CustomerRecord`.
- *Scenario: Chofer cannot deactivate a customer* — GIVEN a valid `chofer`-role JWT, WHEN `DELETE /customers/:id` is called, THEN it is rejected with 403, unchanged from today's behavior.
- *Scenario: Admin access unchanged* — GIVEN a valid `admin`-role JWT, WHEN any of the three routes is called, THEN behavior is identical to before this change.

### Domain: customer-proximity-picker (New)

**Requirement: A picked customer sets `customerId` on the sale**
When a customer is selected in the picker, `NewSaleScreen`'s local state MUST set `customerId` to the picked customer's `id` and prefill `customerName`/`customerType` from the picked record. The outgoing `CreateSaleInput` payload MUST include `customerId` when set.

- *Scenario: Picking a customer links the sale* — GIVEN the driver opens the picker and taps a customer named "Kiosco Sur" (`id: 'customer-1'`, `customerType: 'comercio'`), WHEN they return to `NewSaleScreen` and save the sale, THEN the submitted payload includes `customerId: 'customer-1'`, `customerName: 'Kiosco Sur'`, `customerType: 'comercio'`.

**Requirement: Editing the customer name after picking clears the link**
If `customerId` is set (a customer was picked) and the driver subsequently changes the `customerName` text field, `customerId` MUST be cleared before the payload is assembled — the sale reverts to free-text identification rather than silently submitting a `customerId` whose registered name the driver has since diverged from.

- *Scenario: Manual edit after a pick reverts to free text* — GIVEN a picked customer has set `customerId: 'customer-1'` and `customerName: 'Kiosco Sur'`, WHEN the driver edits the text field to `"Kiosco Sur (nueva sucursal)"`, THEN `customerId` is cleared and the saved sale's payload has no `customerId` key, only the edited `customerName`.
- *Scenario: No edit, no change* — GIVEN a picked customer has set `customerId`, WHEN the driver saves the sale without touching `customerName`, THEN `customerId` remains set and is included in the payload.

**Requirement: Proximity sort, never a filter**
When the picker has a successful GPS reading and the fetched customer list includes entries with both `latitude` and `longitude` set, those entries MUST be sorted by ascending distance from the current reading and shown first; customers without both coordinates MUST still appear in the list (in their existing alphabetical order), never hidden.

- *Scenario: Nearest customers surface first* — GIVEN a GPS reading and three customers with known coordinates at distances 0.5km, 2km, and 10km, WHEN the picker renders, THEN they appear in that ascending-distance order at the top of the list.
- *Scenario: Customers without coordinates are not hidden* — GIVEN a customer with `latitude`/`longitude` both `undefined`, WHEN the picker renders with a successful GPS reading, THEN that customer still appears in the list (not filtered out), positioned after the coordinate-bearing entries.
- *Scenario: No GPS reading falls back to the plain list* — GIVEN the picker's location read fails (permission denied, no fix, or timeout), WHEN the picker renders, THEN the full customer list still renders, unsorted by distance (alphabetical, as returned by the API), and remains searchable.

**Requirement: Quick creation succeeds with only required fields, coordinates best-effort**
`POST /customers` from the picker's quick-create form MUST succeed with only `name` and `customerType` provided. When the picker's own GPS reading succeeded, `latitude`/`longitude` MUST be attached automatically to the create payload; when it did not, the create payload MUST omit both, exactly as `validateCreateCustomerInput` already allows.

- *Scenario: Quick create with a GPS fix* — GIVEN the picker has a successful GPS reading of `latitude: -34.60, longitude: -58.38`, WHEN the driver quick-creates "Almacén Norte" (`customerType: 'final'`) without touching any coordinate field (none exists), THEN the `POST /customers` payload includes those coordinates automatically.
- *Scenario: Quick create without a GPS fix* — GIVEN no GPS reading is available, WHEN the driver quick-creates a customer, THEN the `POST /customers` payload omits `latitude`/`longitude` and the request still succeeds.
- *Scenario: Quick create while offline fails visibly* — GIVEN the device has no connectivity, WHEN the driver attempts to quick-create a customer, THEN the request fails, an error is shown, and no customer is enqueued or silently retried — the driver can still complete the sale via free-text `customerName`.

---

## 4. Design

# Design: Customer Picker + Quick Creation + Proximity Suggestion

### Technical Approach

No schema changes. Two small backend changes (role decorator + type relocation to shared). One new pure module in `packages/shared` (`geo.ts`) for distance math. One extraction in `apps/driver-app` (`services/location.ts`) so the existing phase-5 GPS-capture logic is reusable from a second call site without duplication. One new navigation shape (`NewSaleStack`, modeled directly on `HomeStack`) giving `"Nueva Venta"` its first nested/modal screen. One new screen (`CustomerPickerScreen`) that fetches the customer list, sorts it client-side by distance when a GPS reading succeeds, supports search, supports quick creation, and returns the selection to `NewSaleScreen` via React Navigation params. `NewSaleScreen` gains a picker entry point, param-sync logic, and the clear-`customerId`-on-edit safeguard.

### Architecture Decisions

| # | Decision | Choice | Rejected | Rationale |
|---|---|---|---|---|
| 1 | Access-control fix | Per-route `@Roles('admin', 'chofer')` override on `GET`/`POST /customers`, class-level `admin` default kept for `DELETE` | Remove the class-level decorator entirely (sales.controller.ts style) | Matches `expenses.controller.ts`/`load-manifests.controller.ts`'s exact "class default + override the driver-facing routes" shape — the more common of the two existing patterns in this codebase, and the smaller diff |
| 2 | `CustomerRecord` location | Declared in `packages/shared/src/domain.ts`, re-exported from `customers.service.ts` (`export type { CustomerRecord }`) | Leave it declared locally in `customers.service.ts`, duplicate the shape in the driver-app | Matches the exact, already-established `TruckRecord` precedent in `trucks.service.ts`; needed for the driver-app to type `GET /customers` without importing from `apps/api` (a boundary this codebase never crosses) |
| 3 | Distance calculation location | Pure `distanceKm`/`sortByProximity` in new `packages/shared/src/geo.ts`, computed client-side in the driver-app against an already-fetched customer list | New server-side `GET /customers/nearby?lat=&lng=` endpoint | Avoids a second network round-trip at picker-open time in an offline-first app; `packages/shared` already hosts the one other pure "logic more than one app might need" function (`calculateSaleTotal`); no endpoint work needed at all this phase |
| 4 | `packages/shared` module split | `geo.ts` as a second source file alongside `domain.ts`, re-exported via `index.ts`'s existing `export *` pattern | Cram the Haversine function into `domain.ts` alongside 10 unrelated business-entity types | `distanceKm` has no conceptual relationship to any business entity `domain.ts` owns; the package's `export *` re-export mechanism already trivially supports a second file with zero consumer-facing change |
| 5 | GPS-capture code reuse | Extract phase 5's permission+timeout+race logic from `NewSaleScreen.tsx` into `apps/driver-app/src/services/location.ts`, parameterized by timeout; both `NewSaleScreen` (sale-confirmation capture, unchanged behavior) and `CustomerPickerScreen` (picker-open proximity capture) import from `services/` | Duplicate the permission/timeout/race logic inline in `CustomerPickerScreen`, or have `CustomerPickerScreen` import directly from `NewSaleScreen.tsx` | Screens in this codebase import from `services`/`context`/`components`, never from sibling screens (confirmed across every screen file read); duplicating hardware-permission handling a second time is exactly the class of risk this codebase's own comments already flag as worth avoiding |
| 6 | Screen architecture for the picker | Full-screen, modal-presented (`presentation: 'modal'`) `CustomerPicker` route inside a new `NewSaleStack`, replacing `NewSaleScreen`'s direct tab wiring | Inline dropdown/autocomplete inside `NewSaleScreen`'s existing card; plain (non-modal) pushed screen, `LoadManifestScreen`-style | Frequency of use (every sale, not once a day) favors a lighter-feeling modal over a full stack push; the amount of UI needed (search + proximity list + quick-create form) rules out a cramped inline dropdown |
| 7 | Returning the selection to `NewSaleScreen` | React Navigation's standard params-back idiom: `navigation.navigate('Sale', { pickedCustomer: {...} })` from `CustomerPickerScreen` | A new shared React Context for "currently picked customer" | No new global state; the selection is scoped entirely to the one navigation round-trip inside `NewSaleStack`, the idiomatic React Navigation pattern, and avoids introducing a Context whose only two consumers are two screens already directly connected by a stack |
| 8 | Free text vs. picker (Open Question 1) | Coexist — `customerName` stays a directly-editable `TextInput`; the picker is an additive shortcut | Picker-only, remove the free-text field | Day-1 registry incompleteness — not every customer will be registered yet; forcing the registry would block real sales |
| 9 | Data-integrity safeguard | Clear `customerId` the instant `customerName` is hand-edited after a pick | Leave `customerId` set regardless of subsequent edits | `resolveCustomerAndTruck` (phase 1, `sales.service.ts`) always overrides the submitted `customerName`/`customerType` from the stored `Customer` row whenever `customerId` is present — an un-cleared `customerId` after a manual edit would silently discard the driver's edit server-side, a genuine bug found by reading the two code paths together |
| 10 | Proximity suggestion shape (Open Question 2) | Sort by distance, no radius cutoff or filter; full list stays visible/searchable | Hard radius filter hiding customers beyond a threshold | Imprecise device or stored coordinates could wrongly hide the exact customer the driver is standing in front of; sorting is reversible/tightenable later, filtering that hides a real customer is not |
| 11 | GPS timing for the picker (Open Question 3) | Fresh one-shot read at `CustomerPickerScreen` mount, via the extracted `services/location.ts` helper | Reuse the `latitude`/`longitude` captured on the driver's last confirmed sale | `Sale.latitude`/`longitude` reflect where the driver was during a *past* sale, not necessarily where they are now, before this sale has even been assembled — a different moment entirely |
| 12 | Quick-create coordinates (Open Question 4) | Optional; auto-attached best-effort from the picker's own GPS reading; no manual coordinate-entry UI added | Mandatory `latitude`/`longitude` to quick-create | Would block quick creation exactly where signal is weakest — often precisely where a brand-new, previously-unregistered customer is being met for the first time |
| 13 | Quick-create offline behavior | Online-only this phase; a failed/offline `POST /customers` shows an error, is not queued | Add customer creation to the offline queue | An offline-created customer has no server `id` yet, so an offline sale referencing it can't carry a real `customerId` — solving that needs a "pending customer" reconciliation mechanism, a materially larger feature; the conservative fallback (free-text `customerName`, Open Question 1) already covers the offline case without it |
| 14 | No-GPS fallback (Open Question 5) | Full alphabetical, still-searchable list; picker never blocked or disabled | Disable/hide the picker without a GPS fix | Extends the "a sale/action is never blocked by a missing device signal" invariant already established for `Sale.latitude`/`longitude` in phase 5 |

### `packages/shared/src/geo.ts` (new file, pure functions, no I/O)

```ts
export type GeoPoint = { latitude: number; longitude: number };

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance between two lat/lng points, in kilometers. */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Stable sort: items with both coordinates set are ordered nearest-to-origin
 * first; items missing either coordinate are left in their original relative
 * order, appended after every located item (Design decision #10 — sort, never
 * filter).
 */
export function sortByProximity<T extends Partial<GeoPoint>>(
  origin: GeoPoint,
  items: T[],
): T[] {
  const located = items
    .map((item, index) => ({ item, index }))
    .filter(
      (entry): entry is { item: T & GeoPoint; index: number } =>
        entry.item.latitude !== undefined && entry.item.longitude !== undefined,
    );
  const unlocated = items.filter(
    (item) => item.latitude === undefined || item.longitude === undefined,
  );

  located.sort(
    (a, b) =>
      distanceKm(origin, a.item) - distanceKm(origin, b.item) || a.index - b.index,
  );

  return [...located.map((entry) => entry.item), ...unlocated];
}
```

### `apps/driver-app/src/services/location.ts` (new file — extraction, not new logic)

```ts
export type CapturedLocation = { latitude: number; longitude: number };

/**
 * Extracted from NewSaleScreen.tsx's phase-5 captureSaleLocation (Design
 * decision #5): the same permission-request + timeout-guarded one-shot read,
 * now reusable from more than one call site. Behavior is byte-for-byte
 * identical to phase 5's original inline version -- this is a pure move, not
 * a rewrite. timeoutMs defaults to 8000 (phase 5's LOCATION_TIMEOUT_MS),
 * overridable per call site if a future screen needs a different budget.
 */
export async function captureDeviceLocation(
  timeoutMs = 8000,
): Promise<CapturedLocation | null> {
  // permission request -> Promise.race(getCurrentPositionAsync, timeout) ->
  // null on denial/timeout/any thrown error. Same shape as phase 5's
  // captureSaleLocation, moved verbatim.
}
```

`NewSaleScreen.tsx`'s `saveSale()` calls `captureDeviceLocation()` where it previously called the inline `captureSaleLocation()` — no behavior change, confirmed by keeping every existing phase-5 test passing unmodified. `CustomerPickerScreen.tsx` calls the same function on mount.

### Navigation

```
apps/driver-app/src/navigation/NewSaleStack.tsx  (new, mirrors HomeStack.tsx)

export type NewSaleStackParamList = {
  Sale: { pickedCustomer?: { id: string; name: string; customerType: CustomerType } } | undefined;
  CustomerPicker: undefined;
};

<Stack.Navigator initialRouteName="Sale" screenOptions={{ headerShown: false }}>
  <Stack.Screen name="Sale" component={NewSaleScreen} />
  <Stack.Screen
    name="CustomerPicker"
    component={CustomerPickerScreen}
    options={{ presentation: 'modal', headerShown: true, title: 'Elegir cliente' }}
  />
</Stack.Navigator>

apps/driver-app/src/navigation/MainTabs.tsx
  <Tab.Screen name="Nueva Venta" component={NewSaleStack} .../>   // was: component={NewSaleScreen}
```

### Data Flow

```
GET /customers, POST /customers (existing routes, role fix only)
  -> CustomersController.listCustomers / .createCustomer
       @Roles('admin', 'chofer')   [NEW -- was implicitly admin-only]
  -> CustomersService (unchanged)

apps/driver-app/src/screens/CustomerPickerScreen.tsx (new), on mount:
  |- customers = await api.get<CustomerRecord[]>('/customers')
  |- location = await captureDeviceLocation()   // fresh read, Design decision #11
  |- visibleList = location
  |      ? sortByProximity(location, customers)   // packages/shared, Design decision #10
  |      : customers                              // unsorted fallback, Design decision #14
  |- search text further filters visibleList client-side (name substring match)
  |
  |- on tap "customer": navigation.navigate('Sale', {
  |      pickedCustomer: { id: customer.id, name: customer.name, customerType: customer.customerType }
  |    })
  |
  `- quick-create form: POST /customers { name, customerType, ...(location ? { latitude: location.latitude, longitude: location.longitude } : {}) }
       on success -> same navigate('Sale', { pickedCustomer: {...} }) as picking an existing customer

apps/driver-app/src/screens/NewSaleScreen.tsx (modified):
  |- useEffect on route.params?.pickedCustomer:
  |    setCustomerId(pickedCustomer.id)
  |    setCustomerName(pickedCustomer.name)
  |    setCustomerType(pickedCustomer.customerType)
  |
  |- onChangeText(customerName): setCustomerName(value); if (customerId) setCustomerId(undefined)
  |      [NEW -- Design decision #9, closes the silent-discard trap]
  |
  `- saveSale(): payload includes ...(customerId ? { customerId } : {}), same conditional-spread
        pattern already used for containerReturned/paymentProofRef/latitude/longitude
```

### File Changes

| File | Action | Description |
|---|---|---|
| `apps/api/src/customers/customers.controller.ts` | Modify | `@Roles('admin', 'chofer')` on `listCustomers`/`createCustomer` |
| `apps/api/src/customers/customers.controller.spec.ts` | Create | RED-first: role-metadata assertions for all three routes |
| `apps/api/src/customers/customers.service.ts` | Modify | `CustomerRecord` imported/re-exported from `@distribuidor/shared` |
| `packages/shared/src/domain.ts` | Modify | Export `CustomerRecord` |
| `packages/shared/src/geo.ts` | Create | `distanceKm`, `sortByProximity` |
| `packages/shared/src/geo.spec.ts` | Create | RED-first: known-distance assertions, symmetry, zero-distance, `sortByProximity` ordering + unlocated-items-appended behavior |
| `packages/shared/src/index.ts` | Modify | Re-export `geo.ts` |
| `apps/driver-app/src/services/location.ts` | Create | Extracted `captureDeviceLocation` |
| `apps/driver-app/src/services/location.test.ts` | Create | RED-first: granted+fix, denied, timeout paths (moved/adapted from `NewSaleScreen.test.tsx`'s existing phase-5 coverage) |
| `apps/driver-app/src/navigation/NewSaleStack.tsx` | Create | `Sale`/`CustomerPicker` stack, modal presentation |
| `apps/driver-app/src/navigation/NewSaleStack.test.tsx` | Create | Mirrors `HomeStack.test.tsx`'s existing coverage shape |
| `apps/driver-app/src/navigation/MainTabs.tsx` | Modify | `"Nueva Venta"` -> `NewSaleStack` |
| `apps/driver-app/src/screens/CustomerPickerScreen.tsx` | Create | Search, proximity sort, quick-create |
| `apps/driver-app/src/screens/CustomerPickerScreen.test.tsx` | Create | RED-first: list render, proximity ordering, no-GPS fallback, search filter, select-and-navigate-back, quick-create success/failure/offline |
| `apps/driver-app/src/screens/NewSaleScreen.tsx` | Modify | "Elegir cliente" button, `pickedCustomer` param sync, clear-`customerId`-on-edit, `customerId` in payload, `captureSaleLocation` replaced by `services/location.ts` import |
| `apps/driver-app/src/screens/NewSaleScreen.test.tsx` | Modify | New coverage for pick/clear-on-edit/payload `customerId`; existing phase-5 location tests still pass unmodified against the extracted helper |
| `apps/api/prisma/schema.prisma` | Unchanged | No migration needed |
| `apps/dashboard` | Unchanged | No customer UI this phase |

### Interfaces

```ts
// packages/shared/src/domain.ts
export type CustomerRecord = {
  id: string;
  name: string;
  customerType: CustomerType;
  zone?: string;
  latitude?: number;
  longitude?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

// packages/shared/src/geo.ts
export type GeoPoint = { latitude: number; longitude: number };
export function distanceKm(a: GeoPoint, b: GeoPoint): number;
export function sortByProximity<T extends Partial<GeoPoint>>(origin: GeoPoint, items: T[]): T[];

// apps/driver-app/src/services/location.ts
export type CapturedLocation = { latitude: number; longitude: number };
export function captureDeviceLocation(timeoutMs?: number): Promise<CapturedLocation | null>;

// apps/driver-app/src/navigation/NewSaleStack.tsx
export type NewSaleStackParamList = {
  Sale: { pickedCustomer?: { id: string; name: string; customerType: CustomerType } } | undefined;
  CustomerPicker: undefined;
};
```

### Testing Strategy

`apps/api` (Jest), `packages/shared` (Jest), and `apps/driver-app` (Jest + React Native Testing Library) are all already covered projects — no new test infra needed.

| Layer | What to Test | Approach |
|---|---|---|
| Unit — API roles | `listCustomers`/`createCustomer` carry `['admin', 'chofer']`; `deactivateCustomer` still resolves to the class-level `['admin']` | New `customers.controller.spec.ts`, `Reflect.getMetadata(ROLES_KEY, ...)` pattern from `load-manifests.controller.spec.ts` |
| Unit — shared geo | `distanceKm` matches a known real-world distance within tolerance, is symmetric, returns 0 for identical points; `sortByProximity` orders located items ascending and appends unlocated items unchanged | New `packages/shared/src/geo.spec.ts` |
| Unit — driver-app location | `captureDeviceLocation` behaves identically to phase 5's original inline `captureSaleLocation` for granted+fix, denied, and timeout paths | New `apps/driver-app/src/services/location.test.ts`; `NewSaleScreen.test.tsx`'s existing phase-5 assertions re-target the extracted helper and must keep passing unmodified |
| Component — CustomerPickerScreen | List renders from `GET /customers`; proximity sort applied when GPS succeeds; plain list when it doesn't; search filters by name; tapping a customer calls `navigation.navigate('Sale', { pickedCustomer })`; quick-create posts with/without coordinates; quick-create failure (incl. offline) shows an error and does not navigate away | New `CustomerPickerScreen.test.tsx`, same render/interaction/mocking conventions as `NewSaleScreen.test.tsx`/`LoadManifestScreen.test.tsx` |
| Component — NewSaleScreen | `pickedCustomer` param populates `customerId`/`customerName`/`customerType`; editing `customerName` after a pick clears `customerId`; `saveSale()`'s payload includes `customerId` only when set | Extend `NewSaleScreen.test.tsx` |
| Navigation | `NewSaleStack` renders `Sale` as the initial route; `CustomerPicker` is registered with `presentation: 'modal'` | New `NewSaleStack.test.tsx`, mirrors `HomeStack.test.tsx` |
| E2E | None this phase | Consistent with every prior phase's precedent (`test/jest-e2e.json` needs live Postgres, deferred) |

Mandatory RED tests before any implementation: role-metadata assertions for the two newly-`chofer`-accessible routes; `distanceKm`/`sortByProximity` correctness; the clear-`customerId`-on-edit behavior (the data-integrity bug found in Explore); the no-GPS-fallback-never-blocks-the-picker behavior.

### Migration / Rollout

No database migration. Deploy order: API (role fix + shared type export) can ship independently and has zero visible effect until the driver-app consumes it — safe to deploy PR1 alone at any time. `packages/shared`'s version bump (if the monorepo's tooling requires one for `apps/driver-app` to pick up the new `geo.ts`/`CustomerRecord` exports) follows the same process already used for phases 1-7's shared-package changes. Rollback: revert the relevant PR's commits; PR1's role fix reverting simply restores today's admin-only behavior with no other code depending on the wider access yet (PR2/PR3 depend on PR1, not the reverse).

### Resolved Open Questions

Carried from the top of this document, restated here as design-binding until the owner is reachable:

1. Picker coexists with the free-text `customerName` field — never removed, never made mandatory.
2. Proximity suggestion sorts, never filters; no hard radius cutoff; full list always reachable.
3. A fresh, independent GPS read at picker-open time — never reuses a previously-captured sale location.
4. Quick-create coordinates are optional, auto-attached best-effort; no manual coordinate-entry UI.
5. No GPS signal falls back to the plain alphabetical/searchable list — the picker is never blocked.

---

## 5. Tasks

# Tasks: Customer Picker + Quick Creation + Proximity Suggestion

### Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1230 total across 3 PRs (PR1 ~200, PR2 ~570, PR3 ~460) |
| Review budget | 800 lines per PR |
| 800-line budget risk | High for a single PR (confirmed over budget); Low per individual chained PR (each stays well under 800) |
| Chained PRs recommended | **Yes — 3 PRs, pre-committed** (forecast is unambiguously over budget, same reasoning phases 3 and 4 used to pre-commit rather than "ask-on-risk" mid-flight) |
| Chain strategy | PR1: backend + shared foundations (no driver-app change, deployable/mergeable independently). PR2: driver-app navigation skeleton + functional picker (search + manual select, no proximity/quick-create yet) — already a complete, shippable user-facing improvement on its own. PR3: proximity sort + quick creation, layered onto PR2's already-working picker. |

### Work Units

| Unit | Goal | Focused test command | Runtime check | Rollback boundary |
|------|------|----------------------|------------------|--------------------|
| 1 (PR1) | Backend role fix, `CustomerRecord`/`geo.ts` in `packages/shared` | `pnpm --filter api test -- customers` && `pnpm --filter shared test -- geo` | `pnpm --filter api start:dev` + curl `GET /customers` with a chofer token | Revert; `CustomersController` returns to admin-only, `geo.ts` has no consumer yet |
| 2 (PR2) | `NewSaleStack`, `CustomerPickerScreen` v1 (search + manual select, alphabetical list, no proximity/quick-create), `NewSaleScreen` param sync + clear-on-edit | `pnpm --filter driver-app test -- NewSaleStack CustomerPickerScreen NewSaleScreen` | Run the app, open "Elegir cliente" from a sale in progress, search, pick a customer, confirm it prefills and the sale saves with `customerId` | Revert Unit 2 only; Unit 1's API/shared changes remain valid without a driver-app consumer |
| 3 (PR3) | Extract `services/location.ts`; add proximity sort + quick-create to `CustomerPickerScreen` | `pnpm --filter driver-app test -- location CustomerPickerScreen` | Run the app with location granted, confirm nearest customers surface first; deny/disable location, confirm the list still works; quick-create a customer and confirm it's immediately selectable | Revert Unit 3; Units 1-2's picker remains fully functional (manual search/select) without proximity or quick-create |

Unit 2 depends only on Unit 1 (needs `CustomerRecord`/role access to exist). Unit 3 depends on Units 1-2 (needs the picker screen and stack to already exist).

### Phase 1: Backend Access + Shared Foundations (PR1)
- [ ] 1.1 RED: `apps/api/src/customers/customers.controller.spec.ts` (new) — `Reflect.getMetadata(ROLES_KEY, CustomersController.prototype.listCustomers)` equals `['admin', 'chofer']`; same for `createCustomer`; `Reflect.getMetadata(ROLES_KEY, CustomersController)` (class-level) equals `['admin']`, confirming `deactivateCustomer` still resolves to admin-only with no method-level override.
- [ ] 1.2 GREEN: `apps/api/src/customers/customers.controller.ts` — add `@Roles('admin', 'chofer')` above `listCustomers` and `createCustomer`.
- [ ] 1.3 `packages/shared/src/domain.ts` — add and export `CustomerRecord` (matching `customers.service.ts`'s existing local shape exactly: `id`, `name`, `customerType`, `zone?`, `latitude?`, `longitude?`, `isActive`, `createdAt`, `updatedAt`).
- [ ] 1.4 `apps/api/src/customers/customers.service.ts` — replace the local `CustomerRecord` type declaration with `import { type CustomerRecord } from '@distribuidor/shared'` + `export type { CustomerRecord };`; run `customers.service.spec.ts` unmodified to confirm zero behavior change.
- [ ] 1.5 RED: `packages/shared/src/geo.spec.ts` (new) — `distanceKm` between two known real-world coordinates matches within a small tolerance; `distanceKm(a, a) === 0`; `distanceKm(a, b) === distanceKm(b, a)`; `sortByProximity` orders three located points ascending by distance; `sortByProximity` appends items missing either coordinate, unchanged in relative order, after all located items.
- [ ] 1.6 GREEN: `packages/shared/src/geo.ts` (new) — `distanceKm`/`sortByProximity` implementations to pass 1.5.
- [ ] 1.7 `packages/shared/src/index.ts` — add `export * from "./geo.js";`.

### Phase 2: Driver-App Navigation Skeleton + Basic Picker (PR2)
- [ ] 2.1 RED: `apps/driver-app/src/navigation/NewSaleStack.test.tsx` (new) — `Sale` renders as the initial route; `CustomerPicker` is registered with `presentation: 'modal'` in its screen options.
- [ ] 2.2 GREEN: `apps/driver-app/src/navigation/NewSaleStack.tsx` (new) — `NewSaleStackParamList`, `Stack.Navigator` with `Sale`/`CustomerPicker` routes, mirroring `HomeStack.tsx`'s shape.
- [ ] 2.3 `apps/driver-app/src/navigation/MainTabs.tsx` — `"Nueva Venta"` `Tab.Screen`'s `component` changes from `NewSaleScreen` to `NewSaleStack`.
- [ ] 2.4 RED: `apps/driver-app/src/screens/CustomerPickerScreen.test.tsx` (new, v1 scope) — renders the fetched `GET /customers` list; a text search filters by name substring; tapping a customer calls `navigation.navigate('Sale', { pickedCustomer: { id, name, customerType } })`.
- [ ] 2.5 GREEN: `apps/driver-app/src/screens/CustomerPickerScreen.tsx` (new, v1 scope) — fetch via `useAuth().api.get<CustomerRecord[]>('/customers')`, local search-text state filtering the fetched list, `FlatList`/list rendering, tap handler calling `navigation.navigate`. No proximity sort, no quick-create yet (Phase 3).
- [ ] 2.6 RED: `apps/driver-app/src/screens/NewSaleScreen.test.tsx` — a `route.params.pickedCustomer` prop populates `customerId`/`customerName`/`customerType`; editing `customerName` after a pick clears `customerId`; `saveSale()`'s submitted payload includes `customerId` only when set.
- [ ] 2.7 GREEN: `apps/driver-app/src/screens/NewSaleScreen.tsx` — accept `NativeStackScreenProps<NewSaleStackParamList, 'Sale'>`; `useEffect` syncing `route.params?.pickedCustomer` into state; `customerName`'s `onChangeText` clears `customerId` when set; "Elegir cliente" `Button` navigating to `CustomerPicker`; payload gains `...(customerId ? { customerId } : {})`.
- [ ] 2.8 Manual/runtime check: open the app, tap "Elegir cliente" from "Nueva Venta," search, pick a customer, confirm the name/type prefill and the saved sale includes `customerId` (inspect via `GET /sales/mine`).

### Phase 3: Proximity Suggestion + Quick Creation (PR3)
- [ ] 3.1 RED: `apps/driver-app/src/services/location.test.ts` (new) — granted-permission-plus-fix, denied-permission, and timeout paths all match phase 5's existing `captureSaleLocation` behavior exactly (moved test cases, not new ones).
- [ ] 3.2 GREEN: `apps/driver-app/src/services/location.ts` (new) — `captureDeviceLocation(timeoutMs = 8000)`, extracted verbatim from `NewSaleScreen.tsx`'s existing `captureSaleLocation`.
- [ ] 3.3 `apps/driver-app/src/screens/NewSaleScreen.tsx` — `saveSale()` calls `captureDeviceLocation()` from the new service instead of the now-removed inline `captureSaleLocation`; confirm all of `NewSaleScreen.test.tsx`'s existing phase-5 location assertions still pass unmodified.
- [ ] 3.4 RED: `apps/driver-app/src/screens/CustomerPickerScreen.test.tsx` — with a mocked successful `captureDeviceLocation` and customers at known distances, the rendered list order matches `sortByProximity`'s expected ascending order; with a mocked failed/denied `captureDeviceLocation`, the list still renders (unsorted, unfiltered) and search still works.
- [ ] 3.5 GREEN: `apps/driver-app/src/screens/CustomerPickerScreen.tsx` — on mount, call `captureDeviceLocation()`; when it resolves to a location, run the fetched (and currently search-filtered) list through `sortByProximity` before rendering; render a "cerca tuyo" visual marker on the first N (default 5) sorted entries.
- [ ] 3.6 RED: `CustomerPickerScreen.test.tsx` — quick-create form with only `name`/`customerType` filled submits successfully; when a GPS reading is present, the `POST /customers` call includes `latitude`/`longitude` matching the mocked reading; when absent, the call omits both keys; a failed/offline `POST /customers` shows an error banner and does not call `navigation.navigate`.
- [ ] 3.7 GREEN: `CustomerPickerScreen.tsx` — inline "Crear cliente rápido" form (name `TextInput`, customer-type segment control, no coordinate inputs), `api.post<CustomerRecord>('/customers', { name, customerType, ...(location ? { latitude: location.latitude, longitude: location.longitude } : {}) })`, success path navigates back exactly like picking an existing customer, failure path shows `FeedbackBanner` and stays on the picker.
- [ ] 3.8 Manual/runtime check: with location permission granted, open the picker near two or three seeded customers with known coordinates, confirm the nearest one appears first; deny/disable location and confirm the picker still works; quick-create a customer with location on, confirm the created `Customer` row has coordinates; quick-create with airplane mode on, confirm a visible error and no crash/hang.

### Phase 4: Verification
- [ ] 4.1 Run `pnpm --filter api test` (all suites green, including unmodified `customers.service.spec.ts`).
- [ ] 4.2 Run `pnpm --filter shared test` (all suites green, including new `geo.spec.ts`).
- [ ] 4.3 Run `pnpm --filter driver-app test` (all suites green, including unmodified phase-5 location assertions now targeting the extracted helper).
- [ ] 4.4 Full manual smoke, end to end: as a `chofer` user, open "Nueva Venta," tap "Elegir cliente," confirm nearby customers are suggested first when GPS is on, search for and pick a different (farther) customer, confirm the sale saves with the correct `customerId`; edit the customer-name field afterward and confirm the next save has no `customerId`; quick-create a brand-new customer from the picker and immediately use it on a sale.

### Notes
- No threat-matrix rows apply (design: N/A — no routing/shell/subprocess/VCS boundary; this phase adds a read/create HTTP surface already governed by the existing `RolesGuard`/JWT mechanism, not a new auth mechanism).
- Open Questions 1-5 (top of document) are design-binding assumptions, not confirmed answers — re-confirm with the owner before `sdd-apply` if there is any opportunity to do so. None currently block starting any phase above, since all five resolve toward the more permissive, easier-to-tighten-later option. Open Question 2 (exactly how many "nearby" customers to highlight, and any future radius cutoff) is the most likely to need real-world tuning once drivers actually use the feature.
- PR2 is deliberately scoped to be a complete, shippable improvement on its own (manual search-and-pick, no proximity/quick-create) — if PR3 needs to slip for any reason, PR1+PR2 alone already close the roadmap's core "no sale has ever been linked to a real Customer record" gap.

---

## Next Step

Run `sdd-apply` for Unit 1 (backend role fix + `packages/shared` foundations) once implementation starts. Strict TDD Mode is active for both `apps/api` and `apps/driver-app` — every GREEN task must be preceded by a failing RED test. Before starting, flag Open Questions 1-5 to the owner one more time if they become reachable; none currently block any phase, but Open Question 1 (does the picker replace or coexist with free text) is the one most visible to drivers day-to-day, and Open Question 2 (how many "nearby" suggestions, what radius) is the one most likely to need a follow-up tuning pass once real usage data exists. This phase is also the direct unblocker for phase 8's "admin-assigned daily customer list" — that phase's dashboard-side customer UI will be the first real consumer of the `CustomerRecord` type this phase adds to `packages/shared`.
