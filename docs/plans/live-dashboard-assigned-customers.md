# Change: Live Dashboard + Admin-Assigned Daily Customer List

**Phase**: 8 of 9 ([roadmap](./README.md))
**SDD artifact store**: Engram (project `sistema-de-reparto`, topic keys `sdd/live-dashboard-assigned-customers/*`)
**Status**: Planned — explore/proposal/spec/design/tasks complete, not yet implemented.

This phase bundles two roadmap-adjacent but structurally independent features under one
document, per the roadmap's own phase-8 description. Explore's Approaches section below
resolves — as a real, considered tradeoff, not an assumption — whether to build them as one
undivided change or two separately-shippable sub-changes. The recommendation (two sub-changes,
four chained PRs total) is carried through Proposal, Spec, Design, and Tasks, each split into an
**A** (dashboard live polling) and **B** (admin-assigned daily customer list) track.

## Session Preflight (applies to this change)

- Pace: `auto` (phases run back-to-back; orchestrator gate-validates each result before launching the next)
- Artifact store: `engram`
- Delivery strategy: `ask-on-risk` for sub-change A (single PR, forecast well under budget); **pre-committed chain** for sub-change B (forecast is unambiguously over the 800-line budget once schema + shared + API + two UIs are counted, same reasoning phases 3, 4, and 6 used to pre-commit rather than negotiate mid-flight)
- Review budget: 800 changed lines per PR
- Chain strategy: **4 PRs total** — PR1 (sub-change A, standalone), PR2/PR3/PR4 (sub-change B's pre-committed 3-PR chain, modeled directly on phase 6's split: backend+shared foundations, then admin UI, then driver-app UI)

## Business Decisions Confirmed by the Owner

Only two decisions for this phase were made at roadmap level (binding, not re-litigated here):

| Decision | Chosen |
|---|---|
| What this phase builds | "Live dashboard + admin-assigned daily customer list." Confirmed by reading the roadmap's own gap analysis: "Live dashboard: zero auto-refresh mechanism (everything is on-demand fetch)" (README §2) and phase 6's own forward-reference: "likely phase 8's territory" for a dashboard-side customer UI (`customer-picker-proximity.md`, Affected Areas). Both halves depend on work already merged — phase 1's `Customer`/`DriverTruckAssignment` precedent and phase 6's `CustomerRecord`/`GET /customers` (chofer-readable) for part B; nothing new for part A, which is dashboard-only. |
| Dashboard real-time mechanism | "Simple polling (10–15s), not WebSockets/SSE, for the MVP of phase 8" (README, Cross-Cutting Decisions). Confirmed against `apps/dashboard`'s actual fetch layer (Explore, below): SWR (`useSWR`, `swr` package) is already the only data-fetching mechanism in the dashboard, and SWR's `refreshInterval` option implements polling natively — **no new dependency, no new fetch mechanism, this is a configuration change.** |

## Open Questions (Owner Unavailable — Conservative Assumptions Applied)

The owner was not available to resolve these before planning. Each was given the most
conservative/reversible assumption — the one that adds the least new mandatory behavior and is
cheapest to tighten later if the real answer turns out stricter. This mirrors the exact
methodology used in phases 3, 4, 5, 6, and 7. All are carried forward as explicit "Resolved Open
Questions" in the Design section too, and must be re-confirmed with the owner before `sdd-apply`
starts.

| # | Question | Conservative assumption taken | Why reversible |
|---|---|---|---|
| 1 | Is the assigned list mandatory (chofer can only sell to listed customers) or a suggestion? | **Suggestion only — never enforced server-side, never blocks a sale.** `Sale.customerId`/`customerName` keep accepting any active `Customer` or free text, exactly as phase 6 left them; the assigned list is a read-only display the driver can act on, with zero coupling to `POST /sales`' validation. Extends phase 6's own already-established invariant verbatim: "the picker's list is re-sorted... nothing is hidden or filtered out" and the roadmap's "no running tab / always charge" posture — a sale is never blocked by data the admin did or didn't enter. | Enforcing it later (reject `POST /sales` when `customerId` isn't in today's assigned list) is a small, later, explicit tightening confined to `sales.service.ts`'s existing `resolveCustomerAndTruck`. Enforcing it today and discovering the admin forgot to assign someone, or a walk-in customer shows up, would block a real sale — not reversible without a field hotfix, the same class of risk phase 5 and phase 6 both flagged for their own mandatoriness questions. |
| 2 | Is there a maximum number of customers an admin can assign to one driver per day? | **No hard limit enforced server-side.** `validateCreateDriverCustomerAssignmentInput` rejects an empty/malformed list and de-duplicates repeated `customerId`s, but does not cap the count. Same reasoning as phase 6's Open Question 2 (no radius cutoff): this business's real-world visit-list sizes aren't known yet, and a wrong guess at a cap would silently reject a legitimate, larger list. | A cap is one `if (customerIds.length > N)` guard in the validator later, once real usage shows a sane number — strictly additive, no data migration, no UI change needed to add it. |
| 3 | Can the list be edited/reassigned after creation, or does it lock once the day starts? | **Always editable — no lock.** The write endpoint is a full-list *replace*, not an append-only log: `PUT /driver-customer-assignments` with `{ driverId, date, customerIds }` deletes and recreates that day's entries in one transaction, at any time, including for a date already in progress or in the past. Mirrors this codebase's own `Truck.capacity`/`isActive` PATCH pattern (`apps/api/src/trucks/trucks.service.ts`) — every other "the admin sets this, and can change their mind" resource in this codebase (truck capacity, truck active flag, driver-truck assignments via `closeAssignment`) is editable by an admin action, not frozen once created. | Locking edits after a cutoff (e.g. after the first sale of the day references the list) is a later, additive guard in the service layer — strictly more restrictive, easy to add once there's a real "the driver already started their route" signal to key it off. Locking today, before that signal exists, risks freezing an admin's honest mistake (wrong customer added) with no way to fix it same-day. |
| 4 | Does the dashboard's 10–15s polling apply to every admin screen, or only the summary/portada? | **Portada only** (`apps/admin/page.tsx`'s KPI cards). `admin/reportes` (large, filterable sales/expenses tables with an open audit-detail modal), `admin/usuarios`, and `admin/camiones` (calendar with in-progress day-range selection state) keep on-demand fetch + the existing manual "Actualizar lista" pattern already present in `usuarios/page.tsx`. Reasoning, confirmed by reading all four pages (Explore, below): none of the other three screens hold local in-progress state that a background data swap could silently disrupt (`reportes`' filter state is independent of the fetched rows and is fine; the real risk is a *large table re-rendering/re-scrolling under the user's cursor*, or `TruckCalendar`'s active day-range selection being visually contradicted mid-click by a revalidated `days[]` array) — the portada's four static KPI tiles have neither problem, and it's also the screen most valuable to a manager glancing at a wall-mounted or background browser tab. | Extending `refreshInterval` to any other screen later is a one-line addition to that screen's `useSWR` call (or hoisting it into `SWRConfig`'s shared `value`) — additive, no removal, no migration. Turning it on everywhere today and discovering it disrupts `TruckCalendar`'s click-to-select flow or resets a scrolled `reportes` table mid-review is a worse, user-visible regression that's harder to walk back gracefully (a manager mid-audit losing their scroll position reads as a bug, not a feature). |
| 5 | Does the assigned-list screen show visit progress (how many of today's list were already sold to), or just the plain list? | **Plain list only, no progress this phase.** `GET /driver-customer-assignments/me` returns the assigned `CustomerRecord[]` for the day with no cross-reference to `Sale`. | Computing "visited" is a strict *addition* later — cross-referencing `Sale.customerId` + `Sale.createdAt` (same-day) against the assigned list's `customerId`s, entirely inside the existing `resolveMyTruckForDate`-style resolver, no schema change needed since `Sale.customerId` already exists (phase 1). Building it now would be scope creep never asked for at roadmap level and adds a query-shape decision (does a *canceled* sale count as "visited"? does a churn/empty-visit count?) with no owner available to resolve it — better deferred to a real follow-up once the plain list ships and someone asks for progress. |

---

## 1. Explore

## Exploration: live-dashboard-assigned-customers

### Current State — Part A: Dashboard fetch mechanism

**`apps/dashboard/src/app/admin/layout.tsx` — read in full (84 lines):** a single `SWRConfig` wraps
every admin page, `key={auth.token}` (so a new login never sees a stale cache), `value={{ provider:
() => new Map(), fetcher: (path) => api.get(path) }}`. **No `refreshInterval` anywhere in this
config** — confirmed by reading the full file, not just grepping. Every `useSWR` call across the
app inherits only `fetcher`; no polling, no `revalidateOnFocus` override (SWR's own default,
`true`, already applies — the dashboard already silently re-fetches when the browser tab regains
focus, but never on a timer).

**All four current admin pages read in full — `admin/page.tsx` (105 lines), `admin/reportes/page.tsx`
(667 lines), `admin/usuarios/page.tsx` (223 lines), `admin/camiones/page.tsx` (257 lines) — plus
`components/TruckCalendar.tsx` (387 lines, itself a `useSWR` consumer nested under `camiones`):**
- `admin/page.tsx` (the portada): two `useSWR` calls (`/sales`, `/expenses`), both bare — no options
  object at all — feeding a `useMemo`'d `summarize()` for four static KPI tiles. No local
  interactive state of any kind on this screen.
- `admin/reportes/page.tsx`: three `useSWR` calls (`/sales`, `/expenses`, and a conditional
  `/sales/:id/audits` keyed off `selectedSaleForAudit`), each also bare. Holds a large amount of
  local UI state — nine separate filter fields, an open/closed audit modal, a selected-sale-for-audit
  pointer — all independent of the fetched data itself, but the rendered rows are large
  (`filteredSales`/`filteredExpenses` tables, no pagination) and the screen is explicitly a
  cierre/audit tool a manager scrolls through and reads carefully.
- `admin/usuarios/page.tsx`: one `useSWR<UserSummary[]>("/users")`, bare, **already has its own manual
  refresh affordance** — a "Actualizar lista" button calling `reloadUsers()` (SWR's `mutate`),
  independent of any polling. This is the one existing precedent in the dashboard for "let the user
  decide when to refresh" as an alternative to automatic polling.
- `admin/camiones/page.tsx` + `TruckCalendar.tsx`: `useSWR<TruckRecord[]>` for the truck list and,
  inside `TruckCalendar`, `useSWR<TruckCalendarResponse>` for the selected truck's month grid plus a
  second `useSWR<UserSummary[]>("/users")` for the driver dropdown. `TruckCalendar` holds **live,
  multi-click, in-progress local state** — `range` (a two-click day-range selector, `EMPTY_RANGE`
  until both ends are picked), `driverId`, `kind` — that is derived independently of the fetched
  `calendar` but rendered *together with it* in the same grid (`inSelection(cell.date)` overlays the
  local `range` on top of `calendar.days`). A background data swap here wouldn't corrupt `range`
  itself (React state, untouched by SWR's revalidation), but a same-second `days[]` change while a
  user is mid-click could visually contradict what they just selected — this is the one screen where
  an automatic background refresh has a real, if narrow, UX interaction to consider, not just a
  performance cost.
- **No dependency install needed**: `swr` is already a `apps/dashboard` dependency (confirmed via all
  four pages' imports); `refreshInterval` is a documented, built-in `useSWR` option, not a plugin or
  add-on.
- **SWR's own default already avoids the "polling a backgrounded tab" problem**: SWR's
  `refreshWhenHidden` option defaults to `false` — a `refreshInterval` timer does not keep firing
  while `document.visibilityState !== 'visible'`. No extra visibility-tracking code is needed to get
  "stop polling when the tab isn't in front," the library already does this by default; confirmed
  against SWR's own documented default (not previously used in this codebase since no `useSWR` call
  here has ever set a `refreshInterval`, but it is the library's stated out-of-the-box behavior).

### Current State — Part B: Admin-assigned daily customer list

**`apps/api/prisma/schema.prisma` — read in full (226 lines):** `Customer` (145-158), `Truck`
(160-173), and `DriverTruckAssignment` (175-189) are the three models this sub-change draws precedent
from. `DriverTruckAssignment` models a **date range** (`startDate`/`endDate`, `endDate` nullable for
"open-ended titular") with a `kind` (`titular`/`cobertura`) specificity-resolution rule — deliberately
more complex than what a same-day customer list needs, because a truck assignment can legitimately
span months. `LoadManifest`/`LoadManifestItem` (191-215) is the other relevant precedent: a **single
parent row per creation event + a one-to-many child items table** — no range, no specificity
resolution, just "this manifest, these items." The daily customer list's actual shape (**one list per
driver per single calendar day**, no open-ended range, no titular/cobertura precedence) is structurally
closer to `LoadManifest`'s parent+items shape than to `DriverTruckAssignment`'s range-with-precedence
shape — confirmed by comparing the business rule (Open Question 3: the list is always fully replaced
on edit, not layered like cobertura-over-titular) against both models' actual code, not assumed from
naming similarity alone.

**`apps/api/src/driver-truck-assignments/` — `driver-truck-assignments.controller.ts` (145 lines) and
`.service.ts` (538 lines), both read in full:**
- Controller pattern: `@Controller('driver-truck-assignments')` `@Roles('admin')` at class level, then
  a single `@Roles('admin', 'chofer')` override on the one route drivers call directly — `GET
  /driver-truck-assignments/me?date=`. Identity for "me" is read **from the JWT** (`req.user?.sub`),
  never from a query param or body — "a chofer can't ask for another driver's assignment," the exact
  invariant this sub-change's `GET /driver-customer-assignments/me` must copy verbatim.
- `resolveMyTruckForDate` (256-284) is the load-bearing precedent for "resolve one driver's
  assignment for one date, already joined with the assigned resource's details, in one response" —
  the client never has to chain "get my assignment" then "get that truck's info" as two calls. This
  sub-change's `GET /driver-customer-assignments/me` copies this shape: the response carries fully
  resolved `CustomerRecord[]`, not bare `customerId` strings.
- `resolveAssignmentsForDriversOnDate` (292-326) is the load-bearing precedent for a **batch**
  resolver — "N drivers' assignment for one date in a single query," explicitly built (per its own
  comment) to avoid an N+1 when `UsersService.listUsers()` needed every chofer's truck-today in one
  response (confirmed live in `apps/api/src/users/users.service.ts`, read in full, 139 lines — `GET
  /users` already does exactly this for trucks). No batch resolver is strictly required for this
  sub-change's MVP scope (the admin UI queries one driver+date at a time to build/edit a list), but
  the pattern is flagged in Design as the one to reach for if a future "who has a list today, at a
  glance" admin view is ever requested.
- `previewAssignment`/`AssignmentWarning` (151-181): a **dry-run** endpoint the truck calendar calls
  before confirming an assignment, to surface a cross-cutting warning ("this leaves the driver's own
  truck uncovered") the calendar view alone can't compute. No equivalent cross-cutting warning exists
  for a customer list (there's no "you're leaving this customer uncovered" concept) — confirmed no
  analogous warning is needed for this sub-change, not simply omitted by oversight.

**`apps/driver-app/src/context/TruckContext.tsx` (107 lines) and
`apps/driver-app/src/screens/HomeScreen.tsx` (199 lines), both read in full:** `TruckContext` is the
exact, direct precedent for "the driver consumes something the admin assigned them for today" —
`localDay()` (device-local calendar day, deliberately not UTC, with its own comment explaining why: a
driver at 21:00 local is already "tomorrow" in UTC and would see the wrong truck), a `load()` callback
fetching `/driver-truck-assignments/me?date=${today}` with `cache: 'no-store'`, exposed via `useTruck()`.
`HomeScreen` consumes it directly (`const { truck } = useTruck()`) for a single-line banner ("Hoy
manejas el CAMION-01"), and separately runs its own **inline**, non-Context fetch for load-manifest
status (`refreshManifestStatus`, a plain `useState`+`useCallback`+`useEffect` triplet, not a Context) —
confirmed HomeScreen already mixes both patterns (a shared Context for truck, a screen-local fetch for
manifest status) depending on whether more than one screen needs the data. `TruckContext` is consumed
from more than one place implicitly (any screen could call `useTruck()`); manifest status today is only
ever read by `HomeScreen` itself.

**`apps/driver-app/src/navigation/HomeStack.tsx` (39 lines) and `MainTabs.tsx` (79 lines), both read in
full:** `HomeStack` is the exact, direct precedent for "push a full-screen flow from `HomeScreen`,
reachable via a card + button, not a new bottom tab" — `LoadManifestScreen` is wired exactly this way
(`Stack.Screen name="LoadManifest"`, `headerShown: true` override for its own "volver" affordance,
reached from `HomeScreen`'s "Cargar camión" `Button`). This is the same shape the new assigned-customers
screen should use — **not** a modal (phase 6's `CustomerPicker` precedent doesn't apply here: this
screen is read-only, opened at most a few times a day, not a picker invoked on every sale), a plain
pushed screen, `LoadManifestScreen`-style.

**`apps/driver-app/src/screens/CustomerPickerScreen.tsx` (322 lines) and
`packages/shared/src/geo.ts`/`domain.ts`'s `CustomerRecord`/`CUSTOMER_TYPES` exports (phase 6, already
merged), both read in full:** `CustomerPickerScreen` already fetches the **full, unfiltered**
`GET /customers` list and renders it with a local search filter — this sub-change's "customers of the
day" screen does **not** need to duplicate that fetch or that type. `CustomerRecord` (already exported
from `@distribuidor/shared`) is exactly the shape `GET /driver-customer-assignments/me` should return
for its `customers` array — reusing it end-to-end means zero new shared types for the customer shape
itself, only a new type for the assignment envelope around it. Confirmed no `AssignedCustomersScreen`
or equivalent exists yet anywhere in `apps/driver-app/src/screens/` (full directory listing read).

**`apps/dashboard/src/components/TruckCalendar.tsx` (387 lines, read in full) and
`apps/dashboard/src/app/admin/camiones/page.tsx` (already read for Part A):** the calendar's UI
skeleton — a `useSWR`'d list feeding a form below it (driver `<select>` populated from a second
`useSWR<UserSummary[]>("/users")` filtered to `role === 'chofer'`), an action button, inline
success/error notices via local `notice`/`actionError` state, a below-the-fold list of existing rows
with a per-row "close/undo" action — is a real, reusable **structural** precedent (SWR list + form +
notices + existing-rows list, all in one client component), but its actual interaction (a two-click
month-grid day-*range* picker) is overkill for what this sub-change needs: picking **one single day**
and a **multi-select set of customers**, not a date range. Confirmed by re-reading `buildMonthGrid`/
`selectRange`/`shiftMonth` (`apps/dashboard/src/lib/calendar.ts`, referenced by `TruckCalendar`) — that
module is purpose-built for range selection across a visible month grid, not for "here's today's list of
15 customers, check the ones you want."

### Affected Areas

**Sub-change A (dashboard live polling):**
- `apps/dashboard/src/app/admin/page.tsx` — add `{ refreshInterval: 15000 }` to both `useSWR` calls
  (`/sales`, `/expenses`); no other file changes needed for the mechanism itself.
- `apps/dashboard/src/app/admin/page.test.tsx` (or wherever dashboard's existing Jest specs for pages
  live — confirmed dashboard has Jest infra from the `test(dashboard): infra de jest y logica de
  calendario probada` commit) — **new/extended**: assert the portada's `useSWR` calls are invoked with
  `refreshInterval: 15000`.
- No change to `admin/reportes/page.tsx`, `admin/usuarios/page.tsx`, `admin/camiones/page.tsx`, or
  `TruckCalendar.tsx` — Open Question 4's conservative scope (portada only).

**Sub-change B (admin-assigned daily customer list):**
- `apps/api/prisma/schema.prisma` — **new models** `DriverCustomerAssignment` (parent, one row per
  driver+date) and `DriverCustomerAssignmentEntry` (child, one row per assigned customer); a small
  back-relation array field added to `Customer` and `UserAccount`. New Prisma migration.
- `apps/api/src/driver-customer-assignments/` — **new module**: `.module.ts`, `.controller.ts`,
  `.service.ts`, plus `.controller.spec.ts` and `.service.spec.ts`, mirroring
  `driver-truck-assignments/`'s file layout exactly.
- `packages/shared/src/domain.ts` — new `DriverCustomerAssignmentRecord`,
  `CreateDriverCustomerAssignmentInput`, `validateCreateDriverCustomerAssignmentInput`,
  `MyAssignedCustomersResponse`. No changes to existing `CustomerRecord`/`CUSTOMER_TYPES` — reused as-is.
- `apps/dashboard/src/app/admin/clientes-asignados/page.tsx` — **new page**: driver `<select>` + date
  `<input type="date">` + searchable multi-select customer list (reusing `GET /customers`, already
  chofer-*and-admin*-readable since phase 6) + save button, structurally modeled on
  `TruckCalendar.tsx`'s "SWR list + form + notices + existing-rows" shape but without its month-grid/
  range-picker machinery.
- `apps/dashboard/src/components/AdminSidebar.tsx` — one new `NAV_ITEMS` entry, `{ href:
  "/admin/clientes-asignados", label: "Clientes asignados" }`.
- `apps/driver-app/src/screens/AssignedCustomersScreen.tsx` — **new file**: fetches
  `GET /driver-customer-assignments/me?date=${today}`, renders the resolved `CustomerRecord[]` as a
  plain list (name + type, no search, no proximity — Open Question 5's conservative scope, this is a
  read-only display, not a second picker).
- `apps/driver-app/src/navigation/HomeStack.tsx` — one new `Stack.Screen`
  (`AssignedCustomers`), pushed from `HomeScreen`, `LoadManifestScreen`-style (plain push, own header).
- `apps/driver-app/src/screens/HomeScreen.tsx` — one new card, "Clientes de hoy" (mirrors the existing
  "Remito de carga" card's shape: status line + CTA button navigating to the new screen), and a new
  inline fetch (count-only, for the card's status line) following `refreshManifestStatus`'s exact
  existing pattern — **not** a new Context, since (like manifest status, unlike truck) only `HomeScreen`
  itself needs this data this phase.
- `apps/dashboard`/`apps/driver-app`/`apps/api` — new Jest specs alongside every new/changed file above,
  strict TDD.

### Approaches

**One undivided change vs. two independent sub-changes (real tradeoff, resolved with a recommendation):**

**A — One undivided change, one PR chain, sequenced arbitrarily** (e.g. polling first, then the
assigned-list feature, or interleaved).
- *Pros*: one Explore/Proposal/Spec/Design document, matching the roadmap's phase-8 line item
  literally as written ("Live dashboard + admin-assigned daily customer list").
- *Cons*: the two halves share **zero code** — confirmed by the Affected Areas above: part A touches
  exactly one existing file (`admin/page.tsx`) plus its test; part B touches a new Prisma migration, a
  new API module, a new shared-type surface, a new dashboard page, and a new driver-app screen. They
  also have wildly different risk profiles (A is a config tweak; B is a new domain model end-to-end)
  and wildly different sizes (A: ~150 lines; B: ~1500+ lines, confirmed over budget on its own). Forcing
  them into one PR chain either delays shipping the trivial, high-value polling change behind the much
  larger feature, or arbitrarily front-loads it and leaves the chain's later PRs entirely about part B
  anyway — there's no sequencing that makes them feel like one coherent unit of review.

**B — Two independent sub-changes, each its own PR chain, documented together — recommended.**
- *Pros*: part A can ship, be reviewed, and be merged in well under an hour of review time,
  independently of part B's timeline — a manager gets the live portada immediately rather than waiting
  on a multi-PR feature to land first. Part B's own internal chaining (backend+shared, then dashboard
  UI, then driver-app UI) follows the exact same "each PR independently shippable and revertible"
  discipline phase 6 already established, and is unaffected by whatever happens to part A. Matches this
  roadmap's own precedent: phase 1 already bundled three conceptually-related-but-structurally-separate
  entities (`Customer`, `Truck`, driver↔truck assignment) as one phase name but multiple consolidated
  PRs (README: "PRs #3–#8, consolidated by #22").
- *Cons*: one planning document now describes two independently-versioned pieces of work, which needs
  clear internal labeling (the **A**/**B** convention used throughout this document) so `sdd-apply`
  and `sdd-verify` don't conflate their task lists or progress tracking.

**Recommendation: B.** The near-total lack of shared code, the order-of-magnitude size difference, and
the value of shipping the trivial, low-risk half immediately rather than gating it behind the larger
feature all point the same direction. This document's Proposal/Spec/Design/Tasks sections are each
split into an A and a B track accordingly.

**Data model for the daily list — mirror `DriverTruckAssignment`'s range model vs. `LoadManifest`'s
parent+items model (real tradeoff, resolved with a recommendation):**

**A — Mirror `DriverTruckAssignment`**: one row per "assignment event," `startDate`/`endDate` range,
`kind`/specificity-resolution rule for overlaps.
- *Pros*: maximum structural consistency with the codebase's only other "driver + date-scoped resource"
  precedent.
- *Cons*: the actual business rule (Open Question 3: a list, once set for a day, is *replaced* wholesale
  on edit — never layered, never partially overridden by a second, more-specific assignment the way
  `cobertura` overrides `titular`) doesn't need a range or a specificity rule at all. Building the
  overlap-conflict detection, the `pickMostSpecific` resolution, and the day-by-day projection logic
  `DriverTruckAssignmentsService` needs (485 of its 538 lines are exactly this machinery) would be
  building unused capability for a problem this feature doesn't have — a real precedent-blindness risk,
  copying a shape because it's nearby rather than because the rule matches.

**B — Mirror `LoadManifest`/`LoadManifestItem`**: one parent row per driver+date (unique constraint),
one child row per assigned customer, whole-list replace on edit — **recommended**.
- *Pros*: matches the actual business rule exactly (Open Question 3's "always editable, always a full
  replace" is a natural fit for "delete this driver+date's existing entries, insert the new set, in one
  transaction" — no range math, no overlap detection, no specificity resolution needed anywhere).
  `@@unique([driverId, date])` on the parent gives "one list per driver per day" for free at the
  database layer, the same way `LoadManifest` doesn't need one because a manifest isn't keyed to a
  single day in the first place — but `Customer.isActive`/`Truck.code`'s existing unique-constraint
  precedent shows this codebase already leans on the database for exactly this kind of invariant.
- *Cons*: `position` (visit order) on `DriverCustomerAssignmentEntry` is new — no existing model in this
  schema orders its children explicitly (`SaleItem`, `LoadManifestItem` are both unordered bags). Judged
  worth the one extra `Int @default(0)` column: an admin arming a list plausibly cares about a rough
  visit order, and it costs nothing to store even if the driver-app's read-only MVP screen (Open
  Question 5's scope) doesn't yet do anything with it beyond preserving array order.

**Recommendation: B.** The business rule is a straightforward full-replace, not a range with
precedence — building `DriverTruckAssignment`'s heavier machinery here would be solving a problem this
feature doesn't have.

### Risks

- Open Questions 1-5 unresolved without the owner; conservative assumptions taken and must be
  re-confirmed before `sdd-apply`, same protocol as every prior phase.
- Sub-change B introduces the first Prisma model in this codebase with a `@@unique([driverId, date])`
  parent + cascading child-items shape used for a genuinely new business concept (a daily assignment
  list) rather than an existing one (`LoadManifest` already existed as a precedent, but nothing in this
  schema combines "unique per driver+date" with "has ordered child rows" until now) — a maintainer
  extending this model later should read both `DriverTruckAssignment` (why it's *not* a range) and
  `LoadManifest` (why it *is* parent+items) side by side, same as this Explore did, to avoid
  reintroducing range/overlap logic this feature doesn't need.
- Sub-change A's Open Question 4 (portada-only polling) is a genuinely partial rollout — a manager who
  expects "the whole dashboard refreshes itself" from the roadmap's own wording ("Live dashboard") may
  be surprised `reportes`/`usuarios`/`camiones` still require a manual refresh. Flagged explicitly, not
  silently narrowed; the Design section's Resolved Open Questions restates this plainly as a
  design-binding scope call, not an oversight.
- `TruckCalendar.tsx`'s in-progress day-range-selection state (`range`) is the one place in the existing
  dashboard where *any* future background revalidation (even outside this phase's scope) has a real,
  narrow UX interaction to consider — noted here so a later phase extending polling to `camiones` reads
  this Explore first rather than rediscovering the same interaction from scratch.
- Reusing `GET /customers` (phase 6, already both admin- and chofer-readable) for the dashboard's
  assignment-builder UI means the admin picks from the **same** full active-customer list the driver-app
  picker already fetches — no new endpoint, but also no server-side "customers near this driver's usual
  zone" narrowing; for a large customer registry this could make the admin's multi-select UI a long,
  unfiltered list. Judged acceptable at this business's current scale (same judgment call phase 6 already
  made for the picker itself), with a client-side search filter (same pattern as
  `CustomerPickerScreen`'s `searchFilteredCustomers`) as the only concession needed this phase.
- Forecast for sub-change B alone (Tasks §) is well over the single-PR 800-line budget — mitigated by
  the same pre-committed 3-PR chain strategy phase 6 already validated.

---

## 2. Proposal

# Proposal: Live Dashboard + Admin-Assigned Daily Customer List

### Intent

**Sub-change A** closes the roadmap's own documented gap — "Live dashboard: zero auto-refresh
mechanism (everything is on-demand fetch)" — with the smallest change that satisfies the roadmap-level
decision (simple 10–15s polling, no WebSockets/SSE): configuring SWR's existing, already-installed
`refreshInterval` option on the portada's two data hooks. No new infrastructure, no new dependency.

**Sub-change B** gives an admin a way to tell each driver which customers to visit on a given day —
something `CustomerId`/`Customer` (phase 1) and the driver-readable `GET /customers` (phase 6) made
possible in principle but nothing yet surfaces as an actual admin workflow or driver-facing screen. It
follows the exact "admin assigns, driver consumes their own assignment for today" shape this codebase
already proved out for trucks (`DriverTruckAssignment` → `TruckContext`), adapted to a same-day,
full-replace list instead of a date-range single resource, and deliberately never blocks or restricts
what a driver can otherwise sell (Open Question 1: suggestion, not enforcement) — consistent with every
prior phase's "never blocks a sale" invariant.

### Scope

**Sub-change A — In Scope**
- `apps/dashboard/src/app/admin/page.tsx`: `refreshInterval: 15000` on both `useSWR` calls.
- A test asserting the portada's hooks are configured with that interval.

**Sub-change A — Out of Scope**
- Any change to `admin/reportes/page.tsx`, `admin/usuarios/page.tsx`, `admin/camiones/page.tsx`, or
  `TruckCalendar.tsx` (Open Question 4 — portada only).
- WebSockets, Server-Sent Events, or any push-based mechanism (roadmap-level decision, binding).
- A visible "last updated" timestamp or manual pause/resume control — not requested, and SWR's own
  `refreshWhenHidden: false` default already covers the one behavior ("don't burn requests on a
  backgrounded tab") that would otherwise motivate one.
- Any backend change — polling is purely a client-side re-fetch of existing, unchanged endpoints.

**Sub-change B — In Scope**
- `apps/api/prisma/schema.prisma`: new `DriverCustomerAssignment` + `DriverCustomerAssignmentEntry`
  models, new migration.
- `apps/api/src/driver-customer-assignments/`: new module (controller, service, module + specs).
- `packages/shared/src/domain.ts`: new types + validator for the assignment envelope (reusing existing
  `CustomerRecord`/`CUSTOMER_TYPES` for the customer shape itself).
- `apps/dashboard/src/app/admin/clientes-asignados/page.tsx` (new) + `AdminSidebar.tsx` (one new nav
  entry): admin UI to build/replace a driver's list for a chosen day.
- `apps/driver-app/src/screens/AssignedCustomersScreen.tsx` (new) + `HomeStack.tsx`/`HomeScreen.tsx`
  updates: driver-facing read-only view of today's assigned list, reached from a new "Clientes de hoy"
  card on `HomeScreen`.
- Jest tests in `apps/api`, `packages/shared`, `apps/dashboard`, and `apps/driver-app` for every
  new/changed path, strict TDD.

**Sub-change B — Out of Scope**
- Enforcing the assigned list against `POST /sales` in any way (Open Question 1 — suggestion only).
- A maximum customers-per-day cap (Open Question 2 — no limit enforced).
- Locking edits once a day starts or a sale references the list (Open Question 3 — always editable,
  full-replace).
- Visit-progress tracking — cross-referencing today's `Sale`s against the assigned list to show
  "3 of 8 visited" (Open Question 5 — plain list only this phase).
- Any change to `resolveCustomerAndTruck`, `sales.service.ts`, or `CreateSaleInput` — the assigned list
  is entirely read-side for the driver-app; no sale-creation path changes.
- Cross-tab navigation from `AssignedCustomersScreen` (under the `Inicio` tab's `HomeStack`) directly
  into `NewSaleStack`'s picker with a pre-filled customer — the driver reads the list, then manually
  switches to the "Nueva Venta" tab and uses the existing phase-6 picker/search to find that same
  customer by name. A same-app-two-taps flow, not a one-tap deep link (see Design decision below for the
  full rationale — this is a genuine scope cut, not an oversight).
- A batch "which drivers have a list today, at a glance" admin overview — `resolveAssignmentsForDriversOnDate`'s
  batch-resolver pattern is flagged in Design as the one to reach for if this is ever requested, but
  isn't built speculatively this phase.

### Capabilities

**New**: `dashboard-live-polling` (portada auto-refreshes every 15s while the tab is visible) and
`driver-customer-daily-assignment` (admin builds/edits a per-driver, per-day customer visit list; driver
reads their own list for today).
**Modified**: none at the API contract level for existing routes — `GET /customers` (phase 6) is reused
unchanged by sub-change B's dashboard UI; no existing endpoint's request/response shape changes.

### Approach

Sub-change A is a one-file, backend-untouched configuration change. Sub-change B is a small, fully
additive vertical slice — one new Prisma parent+child pair (no range/overlap logic, full-replace
semantics), one new NestJS module mirroring `driver-truck-assignments`'s existing controller/service
shape, one new shared-type envelope reusing phase 6's already-exported `CustomerRecord`, one new
dashboard admin page structurally modeled on `TruckCalendar` (SWR list + form + notices) without its
range-picker machinery, and one new read-only driver-app screen pushed from `HomeStack` exactly the way
`LoadManifestScreen` already is. No existing endpoint, service method, or UI component is modified in a
way that changes its existing behavior — every touch to an existing file (`admin/page.tsx`,
`AdminSidebar.tsx`, `HomeStack.tsx`, `HomeScreen.tsx`) is additive.

### Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| **A** — `apps/dashboard/src/app/admin/page.tsx` | Modified | `refreshInterval: 15000` on both `useSWR` calls |
| **A** — portada test file | New/Modified | Asserts the polling interval is configured |
| **B** — `apps/api/prisma/schema.prisma` | Modified | New `DriverCustomerAssignment`/`DriverCustomerAssignmentEntry` models, new migration |
| **B** — `apps/api/src/driver-customer-assignments/` | New | Controller, service, module, specs |
| **B** — `packages/shared/src/domain.ts` | Modified | New assignment envelope types + validator |
| **B** — `apps/dashboard/src/app/admin/clientes-asignados/page.tsx` | New | Admin list-builder UI |
| **B** — `apps/dashboard/src/components/AdminSidebar.tsx` | Modified | One new nav entry |
| **B** — `apps/driver-app/src/screens/AssignedCustomersScreen.tsx` | New | Driver-facing read-only list |
| **B** — `apps/driver-app/src/navigation/HomeStack.tsx` | Modified | One new pushed screen |
| **B** — `apps/driver-app/src/screens/HomeScreen.tsx` | Modified | New "Clientes de hoy" card |
| `apps/driver-app/src/screens/CustomerPickerScreen.tsx`, `packages/shared/src/geo.ts` | Unchanged | Reused as-is (customer shape, no proximity math needed here) |
| `apps/api/src/sales/`, `CreateSaleInput` | Unchanged | No enforcement, no sale-creation path change |

### Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| **A** — Portada-only polling reads as an incomplete "Live dashboard" against the roadmap's literal wording | Medium | Explicit, documented scope cut (Open Question 4); trivially extensible per-screen later |
| **A** — A future screen naively copies `refreshInterval` onto `TruckCalendar`'s `useSWR` calls without reading this Explore's note on `range` state | Low | Flagged explicitly in Risks/Design as a specific, named interaction to consider first |
| **B** — Assumptions taken for Open Questions 1-5 turn out wrong once the owner is reachable | Medium | All five chosen as the cheapest-to-tighten-later option; flagged for re-confirmation before `sdd-apply` |
| **B** — New Prisma model shape (unique parent + ordered child items) has no exact precedent combining both traits in this schema yet | Low | Modeled explicitly off `LoadManifest`'s parent+items shape, not `DriverTruckAssignment`'s range shape — rationale documented in Explore/Design so a future maintainer doesn't reintroduce range logic |
| **B** — Reusing the full, unfiltered `GET /customers` list for the admin's multi-select UI doesn't scale indefinitely | Low | Judged acceptable at current business scale, same call phase 6 already made; client-side search filter included |
| **B** — Forecast exceeds the 800-line review budget | High (confirmed) | Pre-committed 3-PR chain (Tasks §), each PR independently under budget |

### Rollback Plan

**Sub-change A**: fully revertible by removing the two `refreshInterval` options — no schema, no
backend, no other UI touched. Its single PR reverting restores today's on-demand-only portada with zero
side effects on any other screen.

**Sub-change B**: fully additive, no existing table's columns are removed or altered (only a back-relation
array field is added to `Customer`/`UserAccount`, which is a no-op on existing rows). Each of the 3
chained PRs is independently revertible, mirroring phase 6's own rollback structure: PR2 (backend +
shared foundations) reverting drops the new module and migration with nothing else depending on it yet.
PR3 (dashboard admin UI) reverting removes only the admin's ability to build a list — any lists already
created via direct API use remain valid rows, simply unreachable from the UI. PR4 (driver-app UI)
reverting removes only the driver's ability to *view* a list — no data loss, the underlying rows are
untouched. No historical `Sale`, `Customer`, or `DriverTruckAssignment` row is touched by any of the
four PRs across both sub-changes.

### Success Criteria

- [ ] **A** — The portada's KPI tiles refresh automatically roughly every 15 seconds while the browser
  tab is visible, without a manual reload; polling stops while the tab is hidden (SWR's default
  behavior, not custom code).
- [ ] **A** — `reportes`/`usuarios`/`camiones` behavior is unchanged — still on-demand/manual-refresh
  only.
- [ ] **B** — An admin can select a chofer, a date, and a set of customers (search-filterable), and save
  — creating or fully replacing that driver's list for that day.
- [ ] **B** — A `chofer`-role token can call `GET /driver-customer-assignments/me?date=` and receive
  their own, already-resolved `CustomerRecord[]` for that date; requesting another driver's assignment
  by ID is rejected (identity always comes from the JWT, same as `driver-truck-assignments/me`).
- [ ] **B** — A driver can open "Clientes de hoy" from the home screen and see today's assigned list (or
  an explicit "no tenes clientes asignados hoy" empty state) without it blocking or altering any part of
  the existing sale-creation flow.
- [ ] **B** — Editing/re-saving a list for a driver+date that already has one fully replaces it (no
  duplicate/leftover entries from the prior save).
- [ ] **B** — Nothing about `POST /sales`, `resolveCustomerAndTruck`, or the phase-6 `CustomerPickerScreen`
  changes behavior — a chofer can still sell to any active customer or free-text name, assigned or not.
- [ ] Jest suites in `apps/api`, `packages/shared`, `apps/dashboard`, and `apps/driver-app` cover every
  new/changed path and pass.

---

## 3. Spec

# Spec: Live Dashboard + Admin-Assigned Daily Customer List

### Domain: dashboard-live-polling (New)

**Requirement: The portada's KPI data refreshes on a fixed interval**
`admin/page.tsx`'s `/sales` and `/expenses` `useSWR` calls MUST be configured with
`refreshInterval: 15000` (15 seconds). No other admin screen's `useSWR` calls are affected.

- *Scenario: Data refreshes without user action* — GIVEN an admin has the portada open and idle, WHEN
  15 seconds elapse, THEN the KPI tiles re-fetch `/sales` and `/expenses` and re-render if the data
  changed, with no click or reload from the admin.
- *Scenario: Other screens are unaffected* — GIVEN an admin has `reportes`, `usuarios`, or `camiones`
  open, WHEN 15 seconds elapse with no user action, THEN no automatic re-fetch occurs on those screens
  (unchanged from today's on-demand behavior).
- *Scenario: Polling stops on a hidden tab* — GIVEN the portada is open in a background/hidden browser
  tab, WHEN the refresh interval would otherwise fire, THEN no request is made (SWR's `refreshWhenHidden:
  false` default), and polling resumes once the tab is visible again.

### Domain: driver-customer-daily-assignment (New)

**Requirement: `chofer` role can read only their own assignment**
`GET /driver-customer-assignments/me?date=` MUST accept requests authenticated with either the `admin`
or `chofer` role, and MUST resolve the driver identity from the JWT (`req.user.sub`), never from a query
parameter or body. All other routes on this controller remain `admin`-only.

- *Scenario: Chofer reads their own list* — GIVEN a valid `chofer`-role JWT for driver `driver-1`, and an
  assignment exists for `driver-1` on `2026-08-21` with customers `[c1, c2]`, WHEN
  `GET /driver-customer-assignments/me?date=2026-08-21` is called, THEN it returns 200 with `{ date:
  "2026-08-21", customers: [<CustomerRecord c1>, <CustomerRecord c2>] }`.
- *Scenario: No assignment today is a valid, non-error response* — GIVEN a valid `chofer`-role JWT and
  no assignment exists for that driver on the requested date, WHEN the route is called, THEN it returns
  200 with `{ date: "...", customers: [] }`, not a 404.
- *Scenario: A chofer cannot request another driver's list* — there is no `driverId` parameter on this
  route at all — identity is JWT-derived, so this is structurally impossible rather than a rejected
  request, matching `driver-truck-assignments/me`'s existing shape.
- *Scenario: Admin manages assignments, chofer cannot* — GIVEN a valid `chofer`-role JWT, WHEN
  `PUT /driver-customer-assignments` (create/replace) or `GET /driver-customer-assignments` (list) is
  called, THEN it is rejected with 403.

**Requirement: Saving a list for a driver+date fully replaces any existing list for that driver+date**
`PUT /driver-customer-assignments` with `{ driverId, date, customerIds }` MUST, within a single
transaction, remove every existing `DriverCustomerAssignmentEntry` for that driver+date's assignment (if
one exists) and insert one entry per `customerId` in `customerIds`, preserving array order as `position`.
No partial/merge update exists — the array sent is the complete list for that day afterward.

- *Scenario: First save for a driver+date creates the assignment* — GIVEN no assignment exists yet for
  `driver-1`/`2026-08-21`, WHEN `PUT /driver-customer-assignments` is called with `customerIds: [c1, c2,
  c3]`, THEN a `DriverCustomerAssignment` row is created with three ordered `DriverCustomerAssignmentEntry`
  rows.
- *Scenario: Re-saving replaces, not appends* — GIVEN `driver-1`/`2026-08-21` already has entries `[c1,
  c2]`, WHEN `PUT /driver-customer-assignments` is called again with `customerIds: [c2, c3]`, THEN the
  resulting list is exactly `[c2, c3]` — `c1` is removed, `c3` is added, `c2` is kept, no duplicate `c2`
  row exists.
- *Scenario: An empty array clears the list* — GIVEN an existing assignment with entries, WHEN
  `PUT /driver-customer-assignments` is called with `customerIds: []`, THEN all entries are removed and
  the assignment row itself may be removed or kept empty (implementation's choice, either is a valid
  "no customers assigned today" state for the `/me` read to return).
- *Scenario: Duplicate customer IDs in the input are de-duplicated* — GIVEN `customerIds: [c1, c1, c2]`,
  WHEN the request is validated, THEN it is rejected by `validateCreateDriverCustomerAssignmentInput`
  with an explicit "duplicate customerId" error (the client is expected to de-duplicate before sending,
  same posture as other validators in this codebase rejecting rather than silently fixing malformed input).

**Requirement: The assigned list never restricts sale creation**
No change to `POST /sales`, `PATCH /sales/:id`, `resolveCustomerAndTruck`, or `CreateSaleInput`'s
validator. A sale referencing any active `Customer` (assigned or not) or free-text `customerName`
continues to succeed exactly as before this phase.

- *Scenario: Selling to an unassigned customer succeeds* — GIVEN driver `driver-1`'s list for today is
  `[c1, c2]`, WHEN `driver-1` creates a sale with `customerId: c9` (not in their list) via the
  phase-6 picker or free text, THEN the sale is created successfully, identical to today's behavior.
- *Scenario: Not selling to every assigned customer is not an error* — GIVEN driver `driver-1`'s list for
  today has 5 customers, WHEN the day ends with sales recorded for only 2 of them, THEN no error, warning,
  or blocked state occurs anywhere in the sale-creation flow — the list is informational only.

---

## 4. Design

# Design: Live Dashboard + Admin-Assigned Daily Customer List

### Technical Approach

**Sub-change A** is a two-line configuration change to `admin/page.tsx`'s existing `useSWR` calls — no
new file, no new dependency, no backend touch.

**Sub-change B** adds one new Prisma parent+child pair (`DriverCustomerAssignment` /
`DriverCustomerAssignmentEntry`, full-replace semantics, no range/overlap logic — Explore's resolved
data-model tradeoff), one new NestJS module mirroring `driver-truck-assignments`'s controller/service
shape (class-level `admin` default, per-route `admin, chofer` override on `/me`), one small addition to
`packages/shared` (an assignment envelope reusing phase 6's existing `CustomerRecord`), one new dashboard
admin page structurally modeled on `TruckCalendar` without its range-picker machinery, and one new
read-only driver-app screen pushed from `HomeStack` exactly the way `LoadManifestScreen` already is.

### Architecture Decisions

| # | Decision | Choice | Rejected | Rationale |
|---|---|---|---|---|
| 1 | Scope structure | Two independent sub-changes (A, B), one document, four chained PRs | One undivided change/PR chain | Zero shared code between the two halves, order-of-magnitude size difference, and A is high-value/low-risk enough to not gate behind B's larger timeline (Explore Approaches) |
| 2 | Polling mechanism | SWR's native `refreshInterval` option on the portada's existing `useSWR` calls | A new WebSocket/SSE channel | Roadmap-level binding decision; `refreshInterval` is already available with zero new dependencies |
| 3 | Polling scope | Portada (`admin/page.tsx`) only | All admin screens via a global `SWRConfig` default | `TruckCalendar`'s in-progress day-range selection and `reportes`'/`usuarios`'s large, actively-scrolled/reviewed tables have real (if narrow) background-refresh interaction risks the portada's static KPI tiles don't (Open Question 4) |
| 4 | Daily assignment data model | `DriverCustomerAssignment` (parent, unique per driver+date) + `DriverCustomerAssignmentEntry` (ordered child rows), full-replace on edit | Mirror `DriverTruckAssignment`'s date-range + kind/specificity-resolution shape | The actual business rule (Open Question 3) is a full replace, not a layered range — building unused overlap/specificity machinery would be precedent-copying without a matching rule (Explore Approaches) |
| 5 | Assignment mutation semantics | Single `PUT /driver-customer-assignments` (whole-list replace, transactional delete+recreate) | Separate `POST` (add one)/`DELETE` (remove one) endpoints, or an append-only log | A full-replace endpoint matches how the dashboard UI naturally works (admin checks/unchecks customers, hits save) and needs no client-side diffing against the server's current state before sending |
| 6 | `GET /driver-customer-assignments/me` response shape | Fully resolved `CustomerRecord[]`, not bare `customerId`s | Return IDs only, driver-app fetches `GET /customers` separately and joins client-side | Matches `resolveMyTruckForDate`'s already-established "resolve once, server-side, one response" precedent — avoids a second network round trip on every screen open |
| 7 | Reused vs. new shared types | Reuse phase 6's `CustomerRecord`/`CUSTOMER_TYPES` unchanged; only the assignment envelope (`DriverCustomerAssignmentRecord`, `MyAssignedCustomersResponse`) is new | Duplicate a customer shape scoped to this feature | No behavioral or shape difference between "a customer in the picker" and "a customer in an assigned list" — duplicating the type would be pure, unjustified duplication |
| 8 | Dashboard admin UI shape | New page structurally modeled on `TruckCalendar` (SWR list + form + notices + existing-rows), but a plain date `<input>` + multi-select list instead of a month-grid range picker | Reuse/extend `TruckCalendar`'s `buildMonthGrid`/`selectRange` machinery for a single-day, multi-customer selection | That machinery is purpose-built for date-*range* selection across a visible month; a single day + a set of customers is a different, simpler UI shape entirely (Explore) |
| 9 | Driver-app screen shape | Plain pushed screen (`AssignedCustomersScreen`) inside the existing `HomeStack`, `LoadManifestScreen`-style | A `presentation: 'modal'` screen, phase-6-`CustomerPicker`-style | This is a read-only view opened a few times a day at most, not a picker invoked on every sale — the frequency/UI-weight tradeoff that favored a modal for phase 6's picker doesn't apply here |
| 10 | State management for the assigned list on the driver-app | Screen-local `useState`/`useEffect` fetch inside `AssignedCustomersScreen` (+ a small inline status fetch on `HomeScreen`, mirroring `refreshManifestStatus`) | A new `AssignedCustomersContext`, `TruckContext`-style | Only `HomeScreen` (status line) and `AssignedCustomersScreen` (full list) consume this data this phase — matches the existing precedent of using a Context only when genuinely shared app-wide (`TruckContext`) vs. a screen-local fetch when not (manifest status) |
| 11 | Suggestion vs. mandatory list (Open Question 1) | Suggestion only — zero coupling to `POST /sales`/`resolveCustomerAndTruck` | Reject a sale to a customer not on today's list | Extends the roadmap's "never blocks a sale" invariant, already established for free-text customers (phase 6) and every optional-signal case since phase 5 |
| 12 | Max customers per list (Open Question 2) | No server-side cap | A fixed maximum (e.g. 20) | No real usage data yet to pick a sane number; a wrong guess would silently reject a legitimate list |
| 13 | Editability (Open Question 3) | Always editable, full-replace, no lock | Freeze the list once the day starts or a sale references it | No reliable "day has started" signal exists yet to key a lock off; freezing an honest admin mistake with no fix path is worse than staying editable |
| 14 | Cross-tab deep link (Out of Scope item) | None this phase — driver manually switches tabs and re-searches | `AssignedCustomersScreen` navigates directly into `NewSaleStack`'s `CustomerPicker` with a pre-filled selection | No cross-tab navigation pattern exists anywhere in this codebase yet (`MainTabs`' four tabs are each self-contained stacks); building one for a single, lower-frequency screen is a disproportionate amount of new navigation plumbing for this phase's read-only MVP scope |
| 15 | Visit progress (Open Question 5) | Plain list only, no cross-reference to `Sale` | Show "N of M visited today" by joining against today's sales | Real scope creep beyond what was asked; the query-shape ambiguity (does canceled/churn count as "visited"?) has no owner available to resolve, and the underlying data (`Sale.customerId`) already exists for a clean follow-up later |

### Prisma Schema Additions (illustrative — not applied to the real schema in this phase)

```prisma
model DriverCustomerAssignment {
  id        String                          @id @default(cuid())
  driverId  String
  date      DateTime
  createdAt DateTime                        @default(now())
  updatedAt DateTime                        @updatedAt
  driver    UserAccount                     @relation(fields: [driverId], references: [id], onDelete: Restrict)
  entries   DriverCustomerAssignmentEntry[]

  @@unique([driverId, date])
  @@index([driverId, date])
}

model DriverCustomerAssignmentEntry {
  id           String                    @id @default(cuid())
  assignmentId String
  customerId   String
  position     Int                       @default(0)
  assignment   DriverCustomerAssignment  @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  customer     Customer                  @relation(fields: [customerId], references: [id], onDelete: Restrict)

  @@unique([assignmentId, customerId])
  @@index([assignmentId])
  @@index([customerId])
}

// Existing models gain only a back-relation array field, no new columns:
// model UserAccount { ... customerAssignments DriverCustomerAssignment[] }
// model Customer     { ... assignmentEntries   DriverCustomerAssignmentEntry[] }
```

`date` follows `DriverTruckAssignmentsService`'s own `toUtcDay`/UTC-midnight convention for
day-granularity comparisons — the same helper (or a copy of its logic, since this is a different
service) resolves `PUT`'s `date: string` into a UTC-midnight `Date` before the `@@unique([driverId,
date])` lookup.

### `packages/shared/src/domain.ts` additions

```ts
export type DriverCustomerAssignmentRecord = {
  id: string;
  driverId: string;
  date: string; // YYYY-MM-DD
  customerIds: string[]; // preserves assigned order
  createdAt: string;
  updatedAt: string;
};

export type CreateDriverCustomerAssignmentInput = {
  driverId: string;
  date: string; // YYYY-MM-DD
  customerIds: string[];
};

export function validateCreateDriverCustomerAssignmentInput(
  input: CreateDriverCustomerAssignmentInput,
): string[]; // non-empty driverId/date, valid date format, no duplicate customerIds

// GET /driver-customer-assignments/me response — resolved, not bare IDs (Design decision #6)
export type MyAssignedCustomersResponse = {
  date: string;
  customers: CustomerRecord[]; // reused from phase 6, unchanged
};
```

### API Routes

```
apps/api/src/driver-customer-assignments/driver-customer-assignments.controller.ts

@Controller('driver-customer-assignments')
@Roles('admin')
export class DriverCustomerAssignmentsController {
  @Get()                                    // admin: list assignments (optional ?driverId=&date=)
  @Roles('admin', 'chofer')
  @Get('me')                                // ?date=, identity from JWT (mirrors /driver-truck-assignments/me)
  @Put()                                    // { driverId, date, customerIds } -- full replace, mirrors PUT semantics
}
```

`GET /driver-customer-assignments/me` and `PUT /driver-customer-assignments` are the only two routes
this sub-change's UIs actually call this phase; the bare `GET /driver-customer-assignments` (admin,
optionally filtered) exists mainly so the dashboard's builder page can load "does driver X already have
a list for date Y" before rendering the multi-select, mirroring how `TruckCalendar` loads the existing
calendar before rendering its picker.

### Data Flow

```
apps/dashboard/src/app/admin/clientes-asignados/page.tsx (new):
  |- drivers = useSWR<UserSummary[]>('/users').filter(role === 'chofer')   // same pattern as TruckCalendar
  |- customers = useSWR<CustomerRecord[]>('/customers')                    // reused, unchanged endpoint
  |- selectedDriverId, selectedDate (plain useState, no calendar.ts range machinery)
  |- existing = useSWR<DriverCustomerAssignmentRecord | null>(
  |      selectedDriverId && selectedDate
  |        ? `/driver-customer-assignments?driverId=${selectedDriverId}&date=${selectedDate}`
  |        : null,
  |    )                                                                    // preloads current list, if any
  |- checkedCustomerIds (useState<Set<string>>, seeded from `existing` when it loads)
  |- search text filters the rendered customer list client-side (same pattern as CustomerPickerScreen)
  `- onSave(): api.put('/driver-customer-assignments', {
        driverId: selectedDriverId, date: selectedDate,
        customerIds: [...checkedCustomerIds],
      })

apps/driver-app/src/screens/HomeScreen.tsx (modified):
  |- new inline fetch (mirrors refreshManifestStatus): assignedCount via
  |      api.get<MyAssignedCustomersResponse>(`/driver-customer-assignments/me?date=${localDay()}`)
  |- new card "Clientes de hoy": status line (`${assignedCount} clientes asignados hoy` / "Sin
  |      clientes asignados hoy") + Button navigating to AssignedCustomers

apps/driver-app/src/screens/AssignedCustomersScreen.tsx (new):
  |- on mount: api.get<MyAssignedCustomersResponse>(`/driver-customer-assignments/me?date=${localDay()}`)
  `- renders response.customers as a plain FlatList (name + customerType), EmptyState if empty --
       no search, no proximity, no tap-to-navigate (Design decisions #9, #14)
```

### File Changes

| File | Action | Description |
|---|---|---|
| **A** `apps/dashboard/src/app/admin/page.tsx` | Modify | `refreshInterval: 15000` on both `useSWR` calls |
| **A** portada test file | Create/Modify | RED-first: asserts the interval option is passed |
| **B** `apps/api/prisma/schema.prisma` | Modify | New models + back-relation fields, new migration |
| **B** `apps/api/src/driver-customer-assignments/driver-customer-assignments.service.spec.ts` | Create | RED-first: create, full-replace, `/me` resolution, empty-list behavior |
| **B** `apps/api/src/driver-customer-assignments/driver-customer-assignments.service.ts` | Create | GREEN: transactional replace, `/me` resolver, list |
| **B** `apps/api/src/driver-customer-assignments/driver-customer-assignments.controller.spec.ts` | Create | RED-first: role-metadata assertions, same `Reflect.getMetadata` pattern as `driver-truck-assignments.controller.spec.ts` |
| **B** `apps/api/src/driver-customer-assignments/driver-customer-assignments.controller.ts` | Create | GREEN |
| **B** `apps/api/src/driver-customer-assignments/driver-customer-assignments.module.ts` | Create | Wires controller/service, registered in `AppModule` |
| **B** `packages/shared/src/domain.ts` | Modify | New envelope types + validator |
| **B** `packages/shared/src/domain.spec.ts` (or equivalent) | Modify | RED-first: validator coverage (dedupe, required fields) |
| **B** `apps/dashboard/src/app/admin/clientes-asignados/page.tsx` | Create | Admin list-builder |
| **B** `apps/dashboard/src/app/admin/clientes-asignados/page.test.tsx` | Create | RED-first: load existing list, save/replace, search filter |
| **B** `apps/dashboard/src/components/AdminSidebar.tsx` | Modify | New nav entry |
| **B** `apps/driver-app/src/screens/AssignedCustomersScreen.tsx` | Create | Driver-facing read-only list |
| **B** `apps/driver-app/src/screens/AssignedCustomersScreen.test.tsx` | Create | RED-first: renders list, empty state, error state |
| **B** `apps/driver-app/src/navigation/HomeStack.tsx` | Modify | New `AssignedCustomers` route |
| **B** `apps/driver-app/src/navigation/HomeStack.test.tsx` | Modify | New route coverage |
| **B** `apps/driver-app/src/screens/HomeScreen.tsx` | Modify | New "Clientes de hoy" card |
| **B** `apps/driver-app/src/screens/HomeScreen.test.tsx` | Modify | New card coverage |

### Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| **A** — Component | Portada's `useSWR` calls include `refreshInterval: 15000`; other screens' calls are unaffected | Extend/create `admin/page.test.tsx`, mock `swr` and assert call arguments (same mocking convention as the existing calendar-logic Jest infra) |
| **B** — Unit, API service | Create-on-first-save; full replace (not append) on re-save; empty array clears; `/me` resolves to joined `CustomerRecord[]`, empty array (not error) when nothing assigned | `driver-customer-assignments.service.spec.ts`, Prisma-double pattern reused from `driver-truck-assignments.service.spec.ts`/`customers.service.spec.ts` |
| **B** — Unit, API roles | `GET .../me` carries `['admin', 'chofer']`; `GET`/`PUT` (bare) resolve to class-level `['admin']` | `driver-customer-assignments.controller.spec.ts`, `Reflect.getMetadata(ROLES_KEY, ...)` pattern |
| **B** — Unit, shared validator | Rejects duplicate `customerId`s, empty `customerIds` is valid (clears the list), missing `driverId`/`date` rejected | Extend `packages/shared`'s existing validator spec file |
| **B** — Component, dashboard | Selecting a driver+date preloads any existing list (checkboxes pre-checked); search filters the customer list; save calls `PUT` with the checked set; a second save with a different set fully replaces | New `clientes-asignados/page.test.tsx`, same SWR-mocking convention as `TruckCalendar`'s existing tests |
| **B** — Component, driver-app | List renders from `GET .../me`; empty state when `customers: []`; error state on a failed fetch; `HomeScreen`'s new card shows the count and navigates on tap | New `AssignedCustomersScreen.test.tsx`; extend `HomeScreen.test.tsx` |
| **B** — Navigation | `AssignedCustomers` is registered in `HomeStack` with its own header (`LoadManifestScreen`-style) | Extend `HomeStack.test.tsx` |
| E2E | None this phase | Consistent with every prior phase's precedent (`test/jest-e2e.json` needs live Postgres, deferred) |

Mandatory RED tests before any implementation: role-metadata assertions for `.../me`; full-replace
(not append) semantics on the service; the validator's duplicate-`customerId` rejection; the portada's
`refreshInterval` assertion.

### Migration / Rollout

**Sub-change A**: no migration, no backend deploy needed — a frontend-only change, deployable and
revertible independently at any time.

**Sub-change B**: one Prisma migration (additive: two new tables, two new nullable-free back-relation
fields on existing models — no existing column altered or dropped). Deploy order: PR2 (backend + shared,
migration included) can ship and be deployed independently with zero visible effect until a UI consumes
it — safe to merge and deploy alone, same posture phase 6's PR1 took for its role-decorator fix. PR3
(dashboard UI) and PR4 (driver-app UI) each depend on PR2 having shipped, not on each other — either
order between PR3/PR4 is valid, though PR3-then-PR4 is the natural order (an admin needs somewhere to
create a list before a driver has anything to view). `packages/shared`'s version bump (if the monorepo's
tooling requires one) follows the same process already used for every prior phase's shared-package change.

### Resolved Open Questions

Carried from the top of this document, restated here as design-binding until the owner is reachable:

1. The assigned list is a suggestion only — never enforced against `POST /sales`, never blocks a sale.
2. No maximum customers-per-day cap is enforced server-side.
3. The list is always editable — every save is a full replace, no lock once a day starts.
4. Live polling (10–15s) applies to the portada only, not to `reportes`/`usuarios`/`camiones`.
5. The driver-app's assigned-list screen shows the plain list only — no visit-progress tracking this phase.

---

## 5. Tasks

# Tasks: Live Dashboard + Admin-Assigned Daily Customer List

### Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines — Sub-change A | ~130 total (single PR) |
| Estimated changed lines — Sub-change B | ~1,550 total across 3 PRs (PR2 ~750, PR3 ~380, PR4 ~420) |
| Estimated changed lines — phase 8 total | ~1,680 across 4 PRs |
| Review budget | 800 lines per PR |
| 800-line budget risk | None for A (well under budget, single PR); High for B as a single PR (confirmed over budget), Low per individual chained PR within B (each stays under 800) |
| Chained PRs recommended | **A: no** (single PR, `ask-on-risk` applies but forecast is already comfortably under budget). **B: yes — pre-committed 3-PR chain**, same reasoning phases 3, 4, and 6 used to pre-commit rather than negotiate mid-flight given a confirmed-over-budget forecast. |
| Chain strategy | PR1 (A, standalone): portada polling config + test. PR2 (B): Prisma migration + shared types/validator + full `driver-customer-assignments` API module + specs — deployable/mergeable independently, no UI consumer yet. PR3 (B): dashboard admin list-builder page + sidebar entry — depends on PR2. PR4 (B): driver-app read-only screen + `HomeStack`/`HomeScreen` updates — depends on PR2, independent of PR3. |

### Work Units

| Unit | Goal | Focused test command | Runtime check | Rollback boundary |
|------|------|----------------------|------------------|--------------------|
| 1 (PR1, A) | Portada `refreshInterval` | `pnpm --filter dashboard test -- admin/page` | Open the portada, wait ~15s with the network tab open, confirm `/sales`/`/expenses` re-fire without a click | Revert; portada returns to on-demand only |
| 2 (PR2, B) | Prisma models + migration, `packages/shared` envelope, `driver-customer-assignments` module | `pnpm --filter api test -- driver-customer-assignments` && `pnpm --filter shared test` | `pnpm --filter api start:dev`; curl `PUT /driver-customer-assignments` as admin, then `GET .../me` as that driver, confirm the resolved list matches | Revert; new tables/module unused by any UI yet, no other code depends on them |
| 3 (PR3, B) | Dashboard admin list-builder page + sidebar entry | `pnpm --filter dashboard test -- clientes-asignados` | Open `/admin/clientes-asignados`, pick a driver+date, check a few customers, save, reload the page, confirm the checkboxes reflect the saved state | Revert Unit 3 only; Unit 2's API/shared changes remain valid without this UI |
| 4 (PR4, B) | Driver-app `AssignedCustomersScreen` + `HomeStack`/`HomeScreen` | `pnpm --filter driver-app test -- AssignedCustomersScreen HomeStack HomeScreen` | Run the app as a chofer with a list assigned for today (via Unit 3's UI or a direct API call), open "Clientes de hoy" from Inicio, confirm the list renders; with nothing assigned, confirm the empty state | Revert Unit 4 only; Units 2-3 remain fully functional (admin can still build lists) without a driver-facing view |

Unit 1 has no dependency on any other unit. Unit 3 depends only on Unit 2 (needs the API + shared types
to exist). Unit 4 depends only on Unit 2 (not on Unit 3 — a list built via a direct API call is enough to
verify Unit 4 in isolation, though in practice Unit 3 will usually land first).

### Phase 1: Dashboard Live Polling (PR1, Sub-change A)
- [ ] 1.1 RED: portada test — assert both `useSWR` calls in `admin/page.tsx` are invoked with
  `{ refreshInterval: 15000 }`.
- [ ] 1.2 GREEN: `apps/dashboard/src/app/admin/page.tsx` — add the option to both `useSWR` calls.
- [ ] 1.3 Manual/runtime check: open the portada with dev tools' network tab open, confirm periodic
  re-fetches roughly every 15s while visible, none while the tab is hidden/backgrounded.

### Phase 2: Backend + Shared Foundations (PR2, Sub-change B)
- [ ] 2.1 `apps/api/prisma/schema.prisma` — add `DriverCustomerAssignment`/`DriverCustomerAssignmentEntry`
  models and the two back-relation fields; generate and apply the migration.
- [ ] 2.2 RED: `packages/shared`'s validator spec — `validateCreateDriverCustomerAssignmentInput` rejects
  missing `driverId`/`date`, rejects duplicate `customerId`s, accepts an empty `customerIds` array.
- [ ] 2.3 GREEN: `packages/shared/src/domain.ts` — add `DriverCustomerAssignmentRecord`,
  `CreateDriverCustomerAssignmentInput`, `MyAssignedCustomersResponse`, and the validator.
- [ ] 2.4 RED: `driver-customer-assignments.service.spec.ts` — first save creates; re-save fully replaces
  (no leftover/duplicate entries); empty array clears; `resolveMyAssignmentForDate` returns joined
  `CustomerRecord[]` in `position` order, or `[]` when nothing is assigned.
- [ ] 2.5 GREEN: `driver-customer-assignments.service.ts` — transactional replace (`prisma.$transaction`:
  delete existing entries for the driver+date's assignment, if any, then create the new set), `/me`
  resolver joining `Customer` rows.
- [ ] 2.6 RED: `driver-customer-assignments.controller.spec.ts` — `Reflect.getMetadata(ROLES_KEY, ...)`:
  `getMyAssignedCustomers` carries `['admin', 'chofer']`; class-level `['admin']` covers the bare
  `GET`/`PUT`.
- [ ] 2.7 GREEN: `driver-customer-assignments.controller.ts` — `@Controller`, class-level `@Roles('admin')`,
  `GET`/`GET :me`/`PUT` routes, `validateCreateDriverCustomerAssignmentInput` guarding `PUT`.
- [ ] 2.8 `driver-customer-assignments.module.ts` — wire controller/service; register in `AppModule`.
- [ ] 2.9 Manual/runtime check: `pnpm --filter api start:dev`; as admin, `PUT` a list for a seeded chofer
  + today's date; as that chofer, `GET .../me?date=<today>` and confirm the resolved customers match;
  `PUT` again with a different set and confirm the prior entries are gone, not additive.

### Phase 3: Dashboard Admin List-Builder (PR3, Sub-change B)
- [ ] 3.1 RED: `clientes-asignados/page.test.tsx` — selecting a driver+date with an existing assignment
  pre-checks the right customers; search filters the rendered customer list by name; save calls `PUT`
  with the currently-checked set.
- [ ] 3.2 GREEN: `apps/dashboard/src/app/admin/clientes-asignados/page.tsx` — driver `<select>` (chofer-only,
  same filter as `TruckCalendar`'s), date `<input type="date">`, `useSWR` for `/customers` and the
  existing assignment (if any), local checked-set state seeded from the fetch, search input, save button
  calling `PUT /driver-customer-assignments`, inline notice/error (same pattern as every other admin page).
- [ ] 3.3 `apps/dashboard/src/components/AdminSidebar.tsx` — add the `"Clientes asignados"` nav entry.
- [ ] 3.4 Manual/runtime check: as admin, build a list for a chofer+date, save, reload the page, confirm
  it reloads pre-checked; change the selection and re-save, confirm the prior selection doesn't linger.

### Phase 4: Driver-App Assigned List View (PR4, Sub-change B)
- [ ] 4.1 RED: `AssignedCustomersScreen.test.tsx` — renders the fetched `customers` list; shows an
  `EmptyState` when the list is empty; shows a `FeedbackBanner` on a failed fetch.
- [ ] 4.2 GREEN: `apps/driver-app/src/screens/AssignedCustomersScreen.tsx` — fetch
  `GET /driver-customer-assignments/me?date=${localDay()}` on mount, render a plain `FlatList`
  (name + `customerType`), `EmptyState`/error handling per RED.
- [ ] 4.3 RED: `HomeStack.test.tsx` — `AssignedCustomers` is registered as a route with its own header.
- [ ] 4.4 GREEN: `apps/driver-app/src/navigation/HomeStack.tsx` — add the `Stack.Screen`, `headerShown:
  true`, `LoadManifestScreen`-style.
- [ ] 4.5 RED: `HomeScreen.test.tsx` — new "Clientes de hoy" card shows the assigned count/empty copy and
  navigates to `AssignedCustomers` on tap.
- [ ] 4.6 GREEN: `apps/driver-app/src/screens/HomeScreen.tsx` — new inline fetch (mirrors
  `refreshManifestStatus`) for the count, new `Card` + `Button`.
- [ ] 4.7 Manual/runtime check: as a chofer with a list assigned for today (via Phase 3's UI or a direct
  `PUT`), open "Clientes de hoy" from Inicio, confirm the list renders; with nothing assigned, confirm
  the empty-state copy; confirm no part of "Nueva Venta" changed behavior.

### Phase 5: Verification
- [ ] 5.1 Run `pnpm --filter api test` (all suites green, including the new
  `driver-customer-assignments` specs and unmodified `sales.service.spec.ts`).
- [ ] 5.2 Run `pnpm --filter shared test` (all suites green, including the new validator coverage).
- [ ] 5.3 Run `pnpm --filter dashboard test` (all suites green, including the portada polling assertion
  and the new `clientes-asignados` page tests).
- [ ] 5.4 Run `pnpm --filter driver-app test` (all suites green, including `AssignedCustomersScreen`,
  `HomeStack`, and `HomeScreen`).
- [ ] 5.5 Full manual smoke, end to end: as admin, watch the portada auto-refresh; build a customer list
  for a chofer; log in as that chofer, see the list on Inicio; confirm a sale to a customer *not* on the
  list still saves normally.

### Notes
- No threat-matrix rows apply beyond what `RolesGuard`/JWT already governs — this phase adds a
  read/write HTTP surface under the existing auth mechanism, not a new one, and a client-side polling
  config with no new attack surface.
- Open Questions 1-5 (top of document) are design-binding assumptions, not confirmed answers —
  re-confirm with the owner before `sdd-apply` if there is any opportunity to do so. None currently block
  starting any phase above, since all five resolve toward the more permissive, easier-to-tighten-later
  option. Open Question 4 (polling scope) is the one most visible to the roadmap's own "Live dashboard"
  wording and worth flagging first if the owner becomes reachable.
- PR2 is deliberately scoped to be a complete, shippable, independently-useful backend surface (an admin
  could manage lists via direct API calls even before PR3 exists) — if PR3 or PR4 need to slip, PR2 alone
  still closes the "the data model and API exist" half of this sub-change.
- Sub-change A (PR1) has no dependency on Sub-change B and can ship in any order relative to PR2-4.

---

## Next Step

Run `sdd-apply` for Unit 1 (sub-change A, portada polling) and/or Unit 2 (sub-change B's backend
foundations) — the two have no dependency on each other and can proceed in parallel or in either order.
Strict TDD Mode is active for `apps/api`, `packages/shared`, `apps/dashboard`, and `apps/driver-app` —
every GREEN task must be preceded by a failing RED test. Before starting, flag Open Questions 1-5 to the
owner one more time if they become reachable; none currently block any phase, but Open Question 1 (does
the assigned list ever restrict what a driver can sell) is the one most consequential to get wrong in the
stricter direction without sign-off, and Open Question 4 (polling scope) is the one most likely to
surface as a "why doesn't X screen auto-refresh too" question once this ships. This phase's sub-change B
is the direct, final consumer the roadmap flagged back in phase 6's own Explore section ("likely phase
8's territory") for a dashboard-side customer UI — with this phase done, every dependency phase 9
("driver UX polish") might reasonably want to touch is in place.
