# Change: Driver App Screen Navigation

**Phase**: 2 of 9 ([roadmap](./README.md))
**SDD artifact store**: Engram (project `sistema-de-reparto`, topic keys `sdd/driver-app-navigation/*`)
**Status**: Implemented and verified locally — all 10 chained PRs (23/23 tasks) applied under Strict TDD (131/131 tests passing, typecheck/build clean), `sdd-verify` passed with 0 critical/4 warning/2 suggestion findings. Not yet pushed or opened as PRs on GitHub.

## Session Preflight (applies to this change)

- Pace: `auto` (phases run back-to-back; orchestrator gate-validates each result before launching the next)
- Artifact store: `engram`
- Delivery strategy: `ask-on-risk`
- Review budget: 800 changed lines
- Chain strategy (this change only, since it exceeds budget by far): `feature-branch-chain`, 10 chained PRs off a `driver-app-navigation` tracker branch; only the tracker merges to `main` once all 10 land

## Business Decisions Confirmed by the Owner

These were resolved conversationally before/during the SDD phases and are binding for this change:

| Decision | Chosen |
|---|---|
| Navigation shape | Auth Stack (Login) wrapping Main Bottom Tabs; no drawer/hamburger |
| Tabs (exactly 4) | Inicio, Nueva Venta (primary, higher visual hierarchy), Gastos, Sincronización |
| Tab presentation | Icon + short label always visible, never icon-only; max 4-5 tabs |
| Navigation library | React Navigation (native-stack + bottom-tabs), resolved via `npx expo install`, never manually pinned |
| Cross-screen state | Multiple focused React Contexts (`AuthProvider`, `SyncProvider`) — not route params, not a new state library |
| Folder structure | `apps/driver-app/src/{navigation,screens,services,context,components,theme}/` |
| Shared API client | `services/` wrapper owning base URL + `Authorization: Bearer` injection, replacing 8+ duplicated `fetch` blocks |
| Theme | Centralized tokens; placeholder palette (swappable for real company branding later — see Design) |
| Spacing / touch targets | 4/8/16/24 scale; minimum 48x48px touch targets |
| UX consistency | Loading / error / success / empty states consistent across all 4 screens; correct safe-area/notch handling; responsive phone/tablet/web |
| `GET /sales` driver 403 bug | In scope for this phase (HomeScreen depends on it) |
| Fix shape for that bug | Additive driver-scoped endpoint (`GET /sales/mine`), not loosening the existing admin route |
| Stuck queued sale (SyncScreen) | Manual retry only — no discard/delete action in this phase |
| Driver-scoped sales endpoint | Returns ALL of that driver's sales (not just today's); "today" filtering stays client-side, identical to current behavior |
| Feedback message banner | Scoped per-screen, resets on tab switch — not persisted globally |
| Test posture | Strict TDD; offline queue (backoff, retry, persistence) gets the first real coverage for this app |
| PR division | 10 chained PRs (`feature-branch-chain`, tracker branch) — confirmed after Review Workload Forecast showed ~4800–5600 estimated changed lines, far over the 800-line budget |

---

## 1. Explore

## Exploration: driver-app-navigation (Phase 2 — screen navigation refactor)

### Current State

`apps/driver-app/App.tsx` is a single 1174-line file (component `App`, exported default from `App.tsx`, mounted via `index.ts` → `registerRootComponent(App)`). No routing/navigation library is installed. `app.json` has no navigation-relevant config (no deep-link scheme, no expo-router plugin). It renders 3 states inline via early returns: `authStatus === 'checking'` (spinner), `authStatus !== 'authenticated'` (login form), else the full authenticated screen — a single `ScrollView` stacking ALL cards (sync status, day summary, sale form, edit/cancel last sale, expense form) sequentially. There is no separate API client module — every network call is an inline `fetch()` call repeating the `Authorization: Bearer <token>` / `Content-Type: application/json` boilerplate.

All state lives as ~25 `useState` hooks in one component (starting ~line 70), grouped by future screen as follows:

**Auth (→ Auth Stack / LoginScreen, but token/username needed app-wide):**
- State: `authToken`, `authStatus` ('checking'|'anonymous'|'authenticated'), `authUsername`, `authPassword`, `authLoading`
- Functions: `loadAuthToken()` (validates saved token against `GET /auth/me`, called once on mount), `login()` (`POST /auth/login`), `logout()`, `requireAuthToken()` (gate helper used by nearly every other action)
- Persistence: `AsyncStorage` key `driver_auth_token_v1` (`DRIVER_AUTH_TOKEN_KEY`)
- This state gates which navigator (Auth vs Main) renders, and `authToken`/`authUsername` are read by almost every other section (API calls, driverName fallback for sales) — must be available outside the screen tree, not scoped to LoginScreen alone.

**New Sale (primary tab, higher visual hierarchy per agreed IA):**
- State: `truckCode`, `customerType`, `paymentMethod`, `customerName`, `quantities` (Record<ProductCode, number>), `saving`, `lastSaleId`, `cancelReason`, `editReason`, `updating`, `canceling`
- Derived: `currentItems` (useMemo over quantities), `total` (useMemo via `calculateSaleTotal` from `@distribuidor/shared`)
- Functions: `changeQty()`, `buildClientGeneratedId()`, `saveSale()` (`POST /sales`, falls back to `enqueueSale()` on failure — this is the offline-queue integration point), `cancelLastSale()` (`PATCH /sales/:id/cancel`), `updateLastSale()` (`PATCH /sales/:id`)
- `truckCode` is also read by `loadPendingSales()` (offline queue) as a fallback value when normalizing queued payloads — cross-cutting coupling between New Sale and Sync.

**Sync / offline queue (business-critical, → SyncScreen):**
- State: `pendingSales: PendingSale[]`, `syncing`
- Types: `PendingSale = { queueId, payload: CreateSaleInput, createdAt, retries, nextRetryAt, lastError? }`
- Persistence: `AsyncStorage` key `driver_pending_sales_v1` (`OFFLINE_QUEUE_KEY`)
- Functions: `loadPendingSales()` (loads + re-normalizes driverName/truckCode fallback, runs once when `authToken` becomes available), `persistPendingSales()`, `enqueueSale()` (called from `saveSale()` on network/API failure), `computeBackoff()` (exponential backoff: `min(5000 * 2^retries, 5min)`), `trySendSale()` (shared low-level POST used by both `saveSale()` and `syncPendingSales()`), `syncPendingSales(manual)` (iterates queue, respects `nextRetryAt` unless manual, updates retry/backoff/lastError per entry)
- A `setInterval` effect (`AUTO_SYNC_INTERVAL_MS = 15000`) calls `syncPendingSales(false)` on a timer, with `[pendingSales]` as its dependency array (interval is torn down/recreated on every queue mutation) — this exact re-subscription behavior must be preserved or deliberately improved, not silently changed, when this logic moves into a provider/context.
- `refreshDaySummary()` is called after every successful sync batch, coupling Sync → Home.

**Home / day summary (→ HomeScreen):**
- State: `daySummary: { activeCount, canceledCount, activeTotal }`
- Functions: `refreshDaySummary()` — calls `GET /sales`, filters by today's date client-side, computes active/canceled counts and active total. Called on: `authToken` becoming available, after `saveSale()` success, after `cancelLastSale()` success, after `updateLastSale()` success, after `syncPendingSales()` completes, and via a manual "Actualizar resumen" button.
- **Real bug found (not part of this refactor's scope, but will surface when isolated)**: `refreshDaySummary()` calls `GET /sales`, but `apps/api/src/sales/sales.controller.ts` guards that route with `@Roles('admin')` only (`listSales()`, line 33-37) — drivers authenticate as `chofer`. This call likely 403s silently for real driver accounts today (the `catch` block at line 330-332 swallows all errors with just a comment). Confirmed via reading `sales.controller.ts` directly. Already documented as a known issue in `docs/plans/README.md` ("driver's daily summary calls GET /sales, which is admin-only on the backend — latent bug"). Flag to business/backlog; do not silently fix inside a pure navigation refactor.

**Expenses (→ ExpensesScreen):**
- State: `expenseCategory`, `expenseAmount`, `expenseNote`, `expenseReceiptRef`, `savingExpense`, `uploadingReceipt`
- Functions: `saveExpense()` (`POST /expenses`), `uploadReceipt(uri)` (`POST /uploads/receipt`, multipart `FormData`), `pickReceiptImage()` (gallery via `expo-image-picker`), `captureReceiptImage()` (camera via `expo-image-picker`)
- Self-contained except for the shared `requireAuthToken()` gate and `authUsername` (driverName).

**Cross-cutting / shared across all sections:**
- `message: string | null` — single global toast/banner-style feedback state, set by almost every action across every future screen. Needs an explicit decision (per-screen local state vs. a shared toast/snackbar context) since it currently has no per-section ownership.
- `requireAuthToken()` — auth gate helper called before every authenticated API call across all sections.
- `API_URL` — `process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000'`, module-level constant, no dedicated API client wrapper exists yet (all `fetch()` calls duplicate headers inline).

### Affected Areas
- `apps/driver-app/App.tsx` — entire file, to be decomposed into `navigation/`, `screens/`, `components/`, `theme/` per the agreed target structure.
- `apps/driver-app/index.ts` — trivial, `registerRootComponent(App)` stays valid as long as `App` still default-exports a root component (now `RootNavigator`-wrapping component); no change needed to the mount mechanism itself.
- `apps/driver-app/app.json` — no navigation-relevant config exists today; nothing blocking, but deep-linking/scheme config may be worth adding later (out of scope now).
- `apps/driver-app/package.json` — **must add** `@react-navigation/native`, `@react-navigation/native-stack`, `@react-navigation/bottom-tabs`, `react-native-screens`, `react-native-safe-area-context` (install via `npx expo install ...` to resolve versions matching Expo SDK ~57 / RN 0.86, not manual pinning), and `@expo/vector-icons` for tab icons (confirmed **not** currently present in `node_modules/@expo/vector-icons`, despite shipping inside the Expo SDK — must be added explicitly since it isn't hoisted/installed today).
- `packages/shared/src/domain.ts` — no changes needed for this phase; already exports all types (`CreateSaleInput`, `SaleRecord`, `CreateExpenseInput`, `AuthLoginResponse`, etc.) consumed by App.tsx. Just confirms the screens will keep importing from `@distribuidor/shared` as-is.
- `apps/api/src/sales/sales.controller.ts` — not to be modified in this phase's original scope, but the `GET /sales` admin-only bug (line 33-37) is directly relevant to correctly scoping the future `HomeScreen`'s data-fetch responsibility; later folded into scope (see Proposal).
- No existing test files for `apps/driver-app` (`**/*.test.{ts,tsx}` glob returned zero results) — this refactor is a green field for adding the first test coverage, relevant given Strict TDD Mode is enabled for this session.
- `apps/dashboard` (Next.js admin web app) and `apps/api` (NestJS) are unrelated to this phase's navigation change; dashboard confirmed to use Next.js routing (not React Navigation), so no pattern to mirror there.

### Approaches (cross-screen state management)

1. **Multiple focused React Contexts** (e.g., `AuthProvider` holding token/username/login/logout, `SyncProvider` holding pendingSales/daySummary/sync functions/interval effect) — zero new dependency, idiomatic React/React Navigation pairing. Effort: Low-Medium.
2. **Lift all shared state to navigator route params** — rejected, route params are the wrong tool for state that must survive tab switches and background timers.
3. **Lightweight external state manager (e.g., Zustand)** — scales better long-term but adds a new runtime dependency in a phase scoped as a structural refactor. Effort: Low-Medium.

### Recommendation

Use **multiple focused React Contexts** (`AuthProvider`, `SyncProvider`) for this phase — keeps the refactor's blast radius to "extract + wire," adds zero new runtime dependencies. Re-evaluate a state library starting Phase 3 (load manifest) if context nesting becomes unwieldy. Also recommend extracting a minimal shared API client wrapper — raised as a design-phase question (a `services/` folder) rather than assumed here.

### Risks
- Cross-cutting implicit state (`message`, `requireAuthToken`, `trySendSale`, `refreshDaySummary`, `truckCode`) currently flows via closures; splitting into screens without an explicit context/prop contract risks silently breaking behavior.
- Offline sync path is business-critical and must not regress — zero existing tests today, Strict TDD Mode is active.
- Navigation library version compatibility: must install via `npx expo install`, not manual pinning; verify `react-native-screens`/bottom-tabs under `react-native-web`.
- The auto-sync `setInterval` effect's `[pendingSales]` dependency array must be preserved or deliberately changed, not lost silently.
- Pre-existing bug: `refreshDaySummary()` calls admin-only `GET /sales` while authenticated as `chofer`.
- `@expo/vector-icons` is not currently installed — must be added explicitly.

### Ready for Proposal
Yes. Two open questions carried into proposal: (1) whether to add a `services/` folder for the shared fetch wrapper, (2) whether the `GET /sales` admin-only bug gets fixed in this phase or deferred.

---

## 2. Proposal

# Proposal: Driver App Screen Navigation (Phase 2)

## Intent

`apps/driver-app/App.tsx` is one 1174-line component (~25 `useState` hooks) that stacks every card in a single `ScrollView`. Roadmap phases 3-9 each add driver flows; stacking them on this monolith is not viable. Two user-visible symptoms today: the offline sync queue is buried inside the summary card with no dedicated surface, and the day summary silently fails for real drivers (`GET /sales` is `@Roles('admin')`, drivers are `chofer`; the `catch` swallows the 403). This phase introduces real navigation, extracts 4 screens, and establishes the first test coverage for `apps/driver-app` (currently zero).

## Scope

### In Scope

- Add React Navigation deps via `npx expo install` (`@react-navigation/native`, `native-stack`, `bottom-tabs`, `react-native-screens`, `react-native-safe-area-context`) plus `@expo/vector-icons` (confirmed absent today).
- `RootNavigator`: Auth Stack ↔ Main Bottom Tabs, switched by `authStatus`.
- Extract `LoginScreen`, `HomeScreen`, `NewSaleScreen`, `ExpensesScreen`, `SyncScreen` from `App.tsx` — relocation of existing JSX/handlers, not redesign of form fields.
- `AuthProvider` (token, username, login/logout, `requireAuthToken`) and `SyncProvider` (pendingSales, daySummary, backoff/retry, auto-sync interval, `refreshDaySummary` chaining).
- `services/` API client wrapper; all screens call through it.
- `theme/` tokens + shared `components/` (Button, Card, StatusBadge, feedback/empty states).
- Backend: additive driver-scoped sales listing (`@Roles('admin','chofer')`) returning only the caller's own sales, scoped server-side by the authenticated username. `createSale`/`updateSale` already stamp `driverName` from `req.user.username`, so the scoping key exists. `GET /sales` stays `@Roles('admin')` untouched, so the dashboard is unaffected.
- First test coverage for `apps/driver-app`: queue enqueue/persist, `computeBackoff`, `nextRetryAt` gating, auth gate, navigator auth switching.

### Out of Scope (Non-Goals)

- Any new business logic or screen beyond the 4 listed — load manifest, visits, containers, geolocation are phases 3-9.
- Redesign of sale/expense form fields, validation rules, or pricing behavior. Fields move; they do not change.
- Any other pre-existing bug. Only the `GET /sales` driver 403 is fixed here.
- New state-management library (re-evaluate Zustand at Phase 3, not now).
- Deep linking / URL scheme config in `app.json`.
- Real company branding (placeholder tokens ship; swap is a later, cheap edit).
- Dashboard (`apps/dashboard`) and unrelated API modules.

## Capabilities

### New Capabilities
- `driver-app-navigation`: auth-gated stack + 4-tab bottom navigation, per-screen responsibilities, consistent loading/error/empty/success states, touch-target and safe-area rules.
- `driver-offline-sync`: offline sale queue behavior made explicit and testable (enqueue on failure, exponential backoff `min(5000 * 2^retries, 5min)`, `nextRetryAt` gating, manual override, AsyncStorage key `driver_pending_sales_v1`), plus its dedicated screen surface.
- `driver-sales-scope`: a driver may list their own sales; admin-only listing of all sales is unchanged.

## Approach

1. Tests first (Strict TDD): pin current queue/backoff/auth behavior before moving any code.
2. Install navigation deps through `npx expo install` so versions resolve against Expo ~57 / RN 0.86 / React 19.2.
3. Land `theme/`, `services/`, and shared `components/` first — screens depend on them.
4. Lift shared state into `AuthProvider` / `SyncProvider` with memoized `value` objects, preserving the auto-sync `setInterval` re-subscription behavior (`[pendingSales]` dep) or changing it deliberately with a test, never silently.
5. Extract screens one at a time, each keeping its existing markup and handlers.
6. Add the driver-scoped sales endpoint and point `HomeScreen` at it.
7. `index.ts` / `registerRootComponent(App)` stays valid: `App.tsx` becomes a thin providers + `RootNavigator` shell.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `apps/driver-app/App.tsx` | Modified | 1174 lines → thin provider/navigator shell |
| `apps/driver-app/src/{navigation,screens,services,components,theme}/` | New | Extracted screens, contexts, API client, tokens |
| `apps/driver-app/package.json` | Modified | React Navigation + `react-native-screens` + `safe-area-context` + `@expo/vector-icons` |
| `apps/api/src/sales/sales.controller.ts` + `sales.service.ts` | Modified | Additive driver-scoped listing; existing routes untouched |
| `apps/driver-app/**/*.test.ts(x)` | New | First test coverage for this app |
| `packages/shared`, `apps/dashboard`, `apps/driver-app/index.ts`, `app.json` | Unchanged | No changes required |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Closure-shared state breaks silently when split across screens | High | Explicit context contracts; tests pin the save→enqueue-on-failure and sync→refreshDaySummary chains before extraction |
| Offline queue regression (business-critical, zero coverage today) | High | TDD first; queue behavior, backoff formula, and AsyncStorage key are frozen by tests before any move |
| Auto-sync `setInterval` re-subscription semantics lost in the provider move | Medium | Test asserts current behavior; any change is explicit and documented |
| `react-native-screens` / bottom-tabs behavior under `react-native-web` | Medium | Verify web build early, before all screens are extracted |
| Driver-scoped endpoint leaks other drivers' sales if scoping is client-supplied | Medium | Scope server-side from `req.user.username` only; never accept a driver filter from the payload |
| Refactor exceeds the 400-line review budget | High | `sdd-tasks` slices into chained PRs |

## Rollback Plan

Structural work is additive under `apps/driver-app/src/`; revert the branch (or the specific PR slice) to restore the monolithic `App.tsx` — `index.ts` and `app.json` are unchanged, so no mount-path migration is needed. The backend change is a new route: removing it restores exact prior API behavior, since `GET /sales` and all other routes are untouched. New deps are removable via `package.json` revert + reinstall.

## Success Criteria

- [ ] Driver navigates between 4 tabs; unauthenticated users only reach Login.
- [ ] No functional regression in sale creation, edit/cancel, expenses, receipt upload, or offline enqueue/sync.
- [ ] Offline queue survives app restart with unchanged AsyncStorage key and backoff behavior, proven by tests.
- [ ] Day summary loads for a `chofer` account (no silent 403) and shows only that driver's sales.
- [ ] `App.tsx` reduced to a providers + navigator shell; no screen file is a monolith.
- [ ] Every screen has explicit loading, error, empty, and success states; all touch targets ≥48x48px; safe areas correct on notched devices.
- [ ] App still builds and runs on web via `react-native-web`.
- [ ] `apps/driver-app` has passing tests where it previously had none.

---

## 3. Spec

# Spec: Driver App Screen Navigation (Phase 2)

## Domain: driver-app-navigation (New)

### Requirement: Auth Stack ↔ Main Tabs switching
`RootNavigator` MUST render the Auth Stack (Login) when `AuthProvider.authStatus` is unauthenticated, and the Main Bottom Tab Navigator when authenticated. No drawer/hamburger MUST exist.

#### Scenario: Unauthenticated user only reaches Login
- GIVEN no valid token is stored
- WHEN the app launches
- THEN only the Login screen is reachable

#### Scenario: Login switches to tabs
- GIVEN a valid login
- WHEN `AuthProvider.login` resolves
- THEN the Main Bottom Tabs render

### Requirement: 4-tab bottom navigation contract
The Main Bottom Tab Navigator MUST expose exactly 4 tabs — Inicio, Nueva Venta, Gastos, Sincronización — each with an icon AND a visible label (never icon-only). Nueva Venta MUST have higher visual hierarchy (primary emphasis).

#### Scenario: All tabs show icon and label
- GIVEN the driver is authenticated
- WHEN the tab bar renders
- THEN all 4 tabs show icon+label and no 5th tab exists

### Requirement: Screen extraction preserves functional parity
`HomeScreen`, `NewSaleScreen`, `ExpensesScreen`, `SyncScreen` MUST retain existing handlers/markup/fields relocated from `App.tsx`, with no redesign of form fields or validation.

#### Scenario: Sale creation unaffected
- GIVEN a driver on Nueva Venta
- WHEN they submit a sale with the same fields as before
- THEN the created Sale is identical in shape to pre-refactor behavior

### Requirement: AuthProvider contract
`AuthProvider` MUST expose `token`, `username`, `authStatus`, `login()`, `logout()`, `requireAuthToken()`. `requireAuthToken()` MUST block/throw when called without a valid token.

#### Scenario: requireAuthToken blocks unauthenticated calls
- GIVEN no token is present
- WHEN a screen calls `requireAuthToken()`
- THEN the call is rejected before any network request fires

### Requirement: SyncProvider contract
`SyncProvider` MUST expose `pendingSales`, `daySummary`, `refreshDaySummary()`, retry/backoff for queued sales, and the auto-sync interval, chaining `refreshDaySummary()` after a successful sync.

#### Scenario: Successful sync refreshes summary
- GIVEN a queued sale syncs successfully
- WHEN the sync completes
- THEN `refreshDaySummary()` is invoked automatically

### Requirement: Per-screen feedback message scoping
Feedback messages (success/error banners) MUST be scoped to the screen that produced them and MUST reset on tab switch; they MUST NOT persist globally across screens.

#### Scenario: Message clears on tab switch
- GIVEN a success message is shown on Gastos
- WHEN the driver switches to Sincronización
- THEN no leftover message from Gastos is visible

### Requirement: Touch target, safe-area, and responsive tokens
All interactive elements MUST use centralized theme tokens and meet a 48x48px minimum touch target. Screens MUST respect safe-area insets and render correctly on phone, tablet, and web (`react-native-web`).

#### Scenario: Touch target minimum enforced
- GIVEN any tappable control on any of the 4 screens
- WHEN measured
- THEN its hit area is ≥48x48px

#### Scenario: Web build renders
- GIVEN the app is built for web
- WHEN a screen renders via `react-native-web`
- THEN navigation and tab bar render without crash

## Domain: driver-offline-sync (New)

### Requirement: Exponential backoff formula frozen
`computeBackoff(retries)` MUST equal `min(5000 * 2^retries, 300000)` (ms).

#### Scenario: Backoff values pinned
- GIVEN retries = 0, 3, and 10
- WHEN `computeBackoff` is called
- THEN results are 5000, 40000, and 300000 respectively

### Requirement: Queue persistence key
The offline queue MUST persist under AsyncStorage key `driver_pending_sales_v1` and MUST survive app restart unchanged.

#### Scenario: Restart restores queue
- GIVEN 2 sales are queued and the app is force-closed
- WHEN the app relaunches
- THEN both sales remain in `pendingSales`, read from `driver_pending_sales_v1`

### Requirement: Auto-sync interval resubscription
The auto-sync interval MUST re-run every 15s and MUST resubscribe (new closure) whenever `pendingSales` changes.

#### Scenario: Interval resubscribes on queue change
- GIVEN the interval is running with an empty queue
- WHEN a sale is enqueued
- THEN the interval resubscribes and the next tick observes the updated queue

### Requirement: Retry-only queue action (no discard)
`SyncScreen` MUST offer manual retry for a queued sale. It MUST NOT offer delete/discard for a stuck queued sale in this phase.

#### Scenario: Manual retry succeeds
- GIVEN a queued sale exceeded its backoff window
- WHEN the driver taps retry
- THEN the sale is removed from the queue on success

#### Scenario: No discard control exists
- GIVEN a sale is stuck retrying
- WHEN the driver views it on SyncScreen
- THEN no delete/discard action is rendered, only retry

## Domain: driver-sales-scope (New)

### Requirement: Driver-scoped sales listing endpoint
The system MUST add an additive endpoint restricted to `@Roles('admin','chofer')` that returns ALL sales belonging to the authenticated driver, scoped server-side from `req.user.username`. It MUST NOT accept a client-supplied driver filter. `GET /sales` (admin-only, all drivers) MUST remain unchanged.

#### Scenario: Driver retrieves own full sales history
- GIVEN a chofer with 40 historical sales
- WHEN they call the driver-scoped endpoint
- THEN all 40 sales are returned, not only today's

#### Scenario: Driver cannot see another driver's sales
- GIVEN chofer D1 calls the driver-scoped endpoint
- WHEN the response is built
- THEN it contains only sales where `driverName` matches D1's `req.user.username`

#### Scenario: Admin route untouched
- GIVEN a chofer calls `GET /sales`
- WHEN the request is authorized
- THEN it is rejected with 403, exactly as before

### Requirement: Client-side "today" filtering
`HomeScreen` MUST fetch the driver's full sales list from the driver-scoped endpoint and MUST compute the day summary by filtering to today client-side.

#### Scenario: Day summary reflects only today
- GIVEN the driver-scoped endpoint returns sales spanning multiple days
- WHEN HomeScreen renders the day summary
- THEN only today's sales are included in the displayed total

---

## 4. Design

# Design: Driver App Screen Navigation (Phase 2)

## Technical Approach

`App.tsx` becomes a shell: `<SafeAreaProvider><AuthProvider><SyncProvider><RootNavigator/>`. `RootNavigator` reads `useAuth().status` and renders a spinner (`checking`), the native-stack Auth Stack (`anonymous`), or the 4-tab bottom navigator (`authenticated`). Shared state moves into two focused contexts with memoized values; all 8+ inline `fetch` calls move behind one `createApiClient(getToken)` factory. Pure queue logic is extracted to a React-free module so it can be unit-tested first under Strict TDD.

## Architecture Decisions

| # | Decision | Choice | Rejected | Rationale |
|---|---|---|---|---|
| 1 | Provider home | New `src/context/` folder (`AuthContext.tsx`, `SyncContext.tsx`) | Providers inside `services/` or `navigation/` | Confirmed structure has no slot for them; `services/` is I/O-only, keeping React out of it makes it trivially testable |
| 2 | Auth-to-navigator switch | Conditional subtree in `RootNavigator` on `status` | `navigation.reset()` / imperative redirects | Nothing to reset on logout — the Main tree unmounts, killing stale screen state for free |
| 3 | Queue logic split | Pure `services/offlineQueue.ts` (`computeBackoff`, `applySyncFailure`, `isDue`, `normalizePendingSalePayload`) consumed by `SyncProvider` | Keeping arithmetic inside the provider | RED tests need no renderer, no fake timers, no AsyncStorage; the business-critical formulas get direct coverage |
| 4 | Feedback (`message`) | Per-screen `useState`, resets on tab switch (owner-confirmed). Providers return typed results/throw; they never set UI text | Shared toast context | Owner decision; also removes the hidden `requireAuthToken` → `setMessage` side effect |
| 5 | `requireAuthToken()` | Pure gate returning `string \| null`, no side effect | Current setMessage-on-failure version | Callers now live in different screens; each renders its own error state |
| 6 | `truckCode` coupling | `SyncProvider` owns `fallbackTruckCode` + setter; `NewSaleScreen` binds its input to it | Duplicating truck code in both screens | Makes the queue-normalization dependency explicit instead of closure-implicit |
| 7 | Token injection | `createApiClient(getToken)` closure created once in `AuthProvider`, exposed as `api` | Global singleton mutated on login; passing token per call | Stable identity (no re-render fan-out), token never stale, header logic exists once |
| 8 | Driver sales scope | New `GET /sales/mine`, `@Roles('admin','chofer')`, scoped from `req.user.username` | Loosening `@Roles` on `GET /sales`; accepting a `driverName` query param | Additive and revertible; a client-supplied filter would leak other drivers' sales |
| 9 | Day-summary filter | Endpoint returns ALL of the driver's sales; today-filter stays client-side (owner-confirmed) | Server-side date filter | Keeps the refactor behavior-neutral; `HomeScreen` logic is unchanged |

## Target Structure

```
apps/driver-app/src/
  navigation/RootNavigator.tsx, AuthStack.tsx, MainTabs.tsx
  context/AuthContext.tsx, SyncContext.tsx
  services/config.ts, apiClient.ts, offlineQueue.ts, storage.ts
  screens/{Login,Home,NewSale,Expenses,Sync}Screen.tsx
  components/Button.tsx, Card.tsx, StatusBadge.tsx, FeedbackBanner.tsx, EmptyState.tsx, ScreenContainer.tsx
  theme/colors.ts, spacing.ts, typography.ts, index.ts
```

## Interfaces

```ts
// services/apiClient.ts
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export type ApiClient = {
  get<T>(path: string, opts?: { auth?: boolean; cache?: RequestCache }): Promise<T>;
  post<T>(path: string, body: unknown, opts?: { auth?: boolean }): Promise<T>;
  patch<T>(path: string, body: unknown): Promise<T>;
  postForm<T>(path: string, form: FormData): Promise<T>; // no Content-Type: RN sets the boundary
};
export const createApiClient: (getToken: () => string | null) => ApiClient;
```

Contract: base `API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000'`; `Authorization: Bearer <token>` injected unless `auth: false` (login); `Content-Type: application/json` on JSON bodies; missing token when `auth` is required throws `ApiError(401, 'auth required')`. Non-2xx throws `ApiError(status, (await res.text()) || \`API ${status}\`)` — this exact message shape is required because it is persisted as `PendingSale.lastError`. Network failures propagate the original `TypeError` untouched.

```ts
type AuthContextValue = {
  status: 'checking' | 'anonymous' | 'authenticated';
  token: string | null; username: string; loading: boolean;
  api: ApiClient;                            // stable identity
  login(username: string, password: string): Promise<void>;  // throws ApiError | AuthRoleError
  logout(): Promise<void>;
  requireAuthToken(): string | null;
};

type SyncContextValue = {
  pendingSales: PendingSale[]; syncing: boolean;
  daySummary: DaySummary; summaryLoading: boolean; summaryError: string | null;
  fallbackTruckCode: string; setFallbackTruckCode(code: string): void;
  trySendSale(payload: CreateSaleInput): Promise<string>;         // saleId
  enqueueSale(payload: CreateSaleInput, cause: string): Promise<number>; // new queue length
  syncPendingSales(manual: boolean): Promise<{ synced: number; remaining: number; skipped: boolean }>;
  refreshDaySummary(): Promise<void>;
};
```

Consumers: `RootNavigator`/`LoginScreen` → Auth only. `HomeScreen` → `daySummary`, `summaryError`, `refreshDaySummary`, `pendingSales.length`. `NewSaleScreen` → `trySendSale`, `enqueueSale`, `refreshDaySummary`, `fallbackTruckCode`, plus `api` for cancel/edit. `ExpensesScreen` → `api`, `username`. `SyncScreen` → `pendingSales`, `syncing`, `syncPendingSales(true)` (retry only — no discard action, owner-confirmed).

## Backend

```ts
// sales.controller.ts — declared after listSales(), existing routes untouched
@Roles('admin', 'chofer')
@Get('mine')
async listMySales(@Req() req: AuthRequest) {
  const username = req.user?.username?.trim();
  if (!username) throw new UnauthorizedException();
  return this.salesService.listSalesByDriver(username);
}

// sales.service.ts
async listSalesByDriver(driverName: string): Promise<SaleRecord[]>
// prisma.sale.findMany({ where: { driverName }, include: { items: true }, orderBy: { createdAt: 'desc' } }) → toSaleRecord
```

Response shape is identical to `GET /sales` (`SaleRecord[]`). `driverName` is the trusted server-side identity already stamped by `createSale`/`updateSale` (`actorUsername?.trim() || input.driverName`); no client input is ever accepted as the scoping key. No path conflict: `mine` is one segment, `:id/audits` is two.

## Data Flow

    NewSaleScreen.saveSale
      -> SyncProvider.trySendSale -> api.post('/sales')
           ok  -> setLastSaleId -> refreshDaySummary -> api.get('/sales/mine') -> HomeScreen
           err -> enqueueSale -> AsyncStorage['driver_pending_sales_v1'] -> SyncScreen badge
    setInterval(15000) -> syncPendingSales(false) -> per entry: isDue? -> trySendSale
           ok  -> drop entry, persist        err -> applySyncFailure, persist
      -> refreshDaySummary

## Preserve vs New

| Must stay identical | New |
|---|---|
| `computeBackoff = min(5000 * 2**retries, 300000)` and the call site passing `retries + 1` | `GET /sales/mine` + `listSalesByDriver` |
| AsyncStorage keys `driver_pending_sales_v1`, `driver_auth_token_v1` | `services/apiClient.ts` (replaces 8+ inline fetches) |
| Auto-sync effect `[pendingSales]` dep — interval torn down and recreated on every queue mutation | `AuthProvider` / `SyncProvider` |
| `PendingSale` JSON shape + `lastError` string content | `theme/`, shared `components/` |
| Persist-after-every-entry inside the sync loop | First test suite for `apps/driver-app` |
| `clientGeneratedId` idempotency, load-time payload normalization | Per-screen feedback banner |
| Silent-catch on summary refresh becomes a visible `summaryError` (deliberate, tested) | |

**Load-bearing detail verified against source, not assumed**: `App.tsx:372` — the failure path is `nextRetryAt: Date.now() + computeBackoff(item.retries + 1)`, not `computeBackoff(item.retries)`. The first failure already waits 10s, not 5s. A test written against the pre-increment `retries` would encode a behavior change as if it were a preservation test.

## Theme

`colors.ts` exports 11 confirmed tokens (see Business Decisions table below for the palette); `spacing.ts` exports `{ xs: 4, sm: 8, md: 16, lg: 24 }` plus `MIN_TOUCH_TARGET = 48`; `typography.ts` sizes/weights; `index.ts` re-exports `theme`. Swapping branding later touches `colors.ts` only.

**Placeholder token values** (company will provide real branding later): `primary` `#1E3A5F`, `primaryLight` `#2E5A8F`, `secondary` `#0F9B8E`, `background` `#F5F6F8`, `surface` `#FFFFFF`, `border` `#E1E4E8`, `textPrimary` `#1A1D21`, `textSecondary` `#6B7280`, `success` `#2E9E5B`, `warning` `#D89614`, `error` `#D93B3B`.

## Testing Strategy

`apps/driver-app` has no test infra: add `jest-expo` + `jest` via `npx expo install`, dev-deps `@testing-library/react-native`, `react-test-renderer`, `@types/jest`, a `"test": "jest"` script, and `preset: 'jest-expo'`. Mock `@react-native-async-storage/async-storage` with its official jest mock; mock `global.fetch`.

| Layer | What | Approach |
|---|---|---|
| Unit (pure) | `computeBackoff`, `isDue`, `applySyncFailure`, `normalizePendingSalePayload` | Plain function assertions, no renderer |
| Unit (client) | Header injection, `auth:false`, `ApiError` status/message mapping, FormData has no `Content-Type` | `fetch` double |
| Hook | `AuthProvider`, `SyncProvider` | `renderHook` + provider wrapper, fake timers, AsyncStorage mock |
| Component | `RootNavigator` gate; 4 tabs present; per-screen loading/error/empty | RNTL render |
| API unit | `listSalesByDriver` where-clause; `@Roles('admin','chofer')` metadata; username taken only from `req.user` | Nest `TestingModule` + Prisma mock, mirroring `users/` specs |

RED order (each red before the corresponding extraction): (1) pure queue module; (2) api client; (3) `AuthProvider` — restores valid token, clears the key on invalid/`403`/non-driver role, `requireAuthToken()` returns `null` with no side effect; (4) `SyncProvider` — enqueue persists under the exact key, non-due entries skipped unless `manual`, failure sets `nextRetryAt = now + computeBackoff(retries + 1)`, success removes and persists, interval fires at 15000 and re-subscribes on every queue mutation; (5) `RootNavigator` gate; (6) screens, extracted one at a time; (7) API endpoint specs.

## Threat Matrix

N/A — no shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary; "routing" here is in-app React Navigation plus one additive HTTP route behind the existing `JwtAuthGuard`/`RolesGuard`. The one adversarial case in scope is decision #8 and its RED test: the driver scope key must come from `req.user.username` only, never from the request payload or query.

## Open Questions (resolved before tasks/apply where noted)

- [x] Verify `react-native-screens` + bottom-tabs under `react-native-web` — scheduled as the first manual check in PR5 (navigation shell), before further screens are extracted.
- [x] `loadPendingSales` currently emits "Hay N ventas pendientes" globally at startup; with per-screen feedback confirmed, this becomes the `SyncScreen` tab badge.
- [ ] `jest-expo` must resolve against Expo ~57 / RN 0.86 / React 19.2 via `npx expo install`; if unavailable, pure-unit layers still run under plain `ts-jest` and only the component layer is blocked — verify in PR1.

---

## 5. Tasks

# Tasks: Driver App Screen Navigation (Phase 2)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~4800–5600 total (10 PRs) |
| 400-line budget risk (assessed against this session's 800-line override) | High |
| Chained PRs recommended | Yes |
| Suggested split | Tracker branch → PR1..PR10 |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain (confirmed by owner) |

Base: tracker=`driver-app-navigation` (off main). PR1→tracker; PR2→PR1; PR3→PR2; PR4→PR3; PR5→PR4; PR6→PR5; PR7→PR6; PR8→PR7; PR9→PR8; PR10→PR9. Tracker→main after PR10.

### Suggested Work Units

| Unit | Goal | PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Test infra + theme + components | PR1 | `yarn jest theme components` | `expo start --web` smoke (App.tsx untouched) | revert PR1, isolated new files only |
| 2 | Pure services: offlineQueue, apiClient, config, storage | PR2 | `yarn jest offlineQueue apiClient` | N/A — pure fns, unwired | revert PR2, unused by App.tsx |
| 3 | AuthContext | PR3 | `yarn jest AuthContext` | N/A — unwired | revert PR3 |
| 4 | SyncContext | PR4 | `yarn jest SyncContext` (fake timers) | N/A — unwired | revert PR4 |
| 5 | Navigation shell + LoginScreen; App.tsx→shell | PR5 | `yarn jest RootNavigator LoginScreen` | `expo start` manual: login gate + 4 tab stubs | revert PR5 to PR4 tip |
| 6 | HomeScreen extraction | PR6 | `yarn jest HomeScreen` | `expo start` manual: Inicio summary loads | revert PR6, stub restored |
| 7 | NewSaleScreen extraction | PR7 | `yarn jest NewSaleScreen` | `expo start` manual: sale online+offline | revert PR7, stub restored |
| 8 | ExpensesScreen extraction | PR8 | `yarn jest ExpensesScreen` | `expo start` manual: expense submit | revert PR8, stub restored |
| 9 | SyncScreen extraction | PR9 | `yarn jest SyncScreen` | `expo start` manual: retry queued sale | revert PR9, stub restored |
| 10 | `GET /sales/mine` + HomeScreen repoint | PR10 | `yarn test sales.controller sales.service` | `curl` local Nest server w/ chofer token | revert PR10, `GET /sales` untouched |

### Phase 1: Test infra + theme + components (PR1)
- [ ] 1.1 `npx expo install` jest-expo/RNTL/react-test-renderer/@types/jest; `"test":"jest"`, `preset:'jest-expo'`.
- [ ] 1.2 RED `theme/colors.test.ts` (11 tokens, `MIN_TOUCH_TARGET=48`) → GREEN `theme/{colors,spacing,typography,index}.ts`.
- [ ] 1.3 RED+GREEN `components/{Button,Card,StatusBadge,FeedbackBanner,EmptyState,ScreenContainer}.tsx` (+tests; 48x48 hit area).

### Phase 2: Pure services (PR2)
- [ ] 2.1 RED `offlineQueue.test.ts`: `computeBackoff(0/3/10)=5000/40000/300000` → GREEN `services/offlineQueue.ts`.
- [ ] 2.2 RED `isDue`, `applySyncFailure`, `normalizePendingSalePayload` → GREEN same file.
- [ ] 2.3 RED `apiClient.test.ts`: auth header injection, `auth:false`, `ApiError(status,msg)`, FormData no Content-Type → GREEN `services/apiClient.ts`.
- [ ] 2.4 `services/config.ts` (API_URL), `services/storage.ts` (wraps key `driver_pending_sales_v1`).

### Phase 3: AuthContext (PR3)
- [ ] 3.1 RED `AuthContext.test.tsx`: restores valid token; clears key on invalid/403/non-driver role; `requireAuthToken()` returns null, no side effect → GREEN `context/AuthContext.tsx`.

### Phase 4: SyncContext (PR4)
- [ ] 4.1 RED enqueue persists under `driver_pending_sales_v1`; non-due entries skipped unless manual → GREEN `context/SyncContext.tsx`.
- [ ] 4.2 RED failure sets `nextRetryAt=now+computeBackoff(retries+1)`; success removes+persists.
- [ ] 4.3 RED interval fires at 15000ms, resubscribes on `[pendingSales]` change (fake timers).
- [ ] 4.4 RED sync success chains `refreshDaySummary()`; summary fetch failure sets visible `summaryError`.

### Phase 5: Navigation shell + LoginScreen (PR5)
- [ ] 5.1 `npx expo install` React Navigation (native-stack, bottom-tabs) + react-native-screens + safe-area-context + @expo/vector-icons.
- [ ] 5.2 RED `RootNavigator.test.tsx`: checking/anonymous/authenticated gate → GREEN `navigation/{RootNavigator,AuthStack,MainTabs}.tsx` (4 tabs, icon+label, Nueva Venta emphasis; other 3 tabs temp stubs).
- [ ] 5.3 Extract `screens/LoginScreen.tsx` (relocate JSX/handlers only) + test.
- [ ] 5.4 Reduce `App.tsx` to `SafeAreaProvider>AuthProvider>SyncProvider>RootNavigator`.
- [ ] 5.5 Manual check: `react-native-screens` + bottom-tabs render correctly under `expo start --web`.

### Phase 6: HomeScreen (PR6)
- [ ] 6.1 Extract `screens/HomeScreen.tsx`; consumes `daySummary`, `summaryError`, `refreshDaySummary`, `pendingSales.length`; loading/error/empty/success tests.

### Phase 7: NewSaleScreen (PR7)
- [ ] 7.1 Extract `screens/NewSaleScreen.tsx`; consumes `trySendSale`, `enqueueSale`, `refreshDaySummary`, `fallbackTruckCode`; online-success + offline-enqueue tests.

### Phase 8: ExpensesScreen (PR8)
- [ ] 8.1 Extract `screens/ExpensesScreen.tsx`; consumes `api`, `username`; loading/error/empty/success tests.

### Phase 9: SyncScreen (PR9)
- [ ] 9.1 Extract `screens/SyncScreen.tsx`; consumes `pendingSales`, `syncing`, `syncPendingSales(true)`; RED test asserting no discard/delete control renders (retry only); pending-count badge (replaces the old global startup message).

### Phase 10: Driver sales scope endpoint (PR10)
- [ ] 10.1 RED `sales.service.spec.ts`: `listSalesByDriver` where-clause scoped to `driverName`, rejects client filter → GREEN `sales.service.ts`.
- [ ] 10.2 RED `sales.controller.spec.ts`: `@Roles('admin','chofer')` on `GET /sales/mine`, username from `req.user` only → GREEN `sales.controller.ts`.
- [ ] 10.3 Repoint `HomeScreen` to `/sales/mine`; keep existing client-side today filter; verify `GET /sales` still 403s for chofer.

### Notes
- RED-first order matches design: pure modules(2) → contexts(3,4) → nav gate(5) → screens(6-9) → endpoint(10).
- SyncContext (PR4) carries the highest silent-breakage risk (backoff formula + `[pendingSales]` interval resubscription) — kept as its own isolated PR intentionally.
- NewSaleScreen (PR7) is the largest single-screen extraction (form-heavy) and may itself need further splitting if its actual diff exceeds 800 lines.

---

## Implementation Summary

All 23 tasks across 10 chained PRs are implemented and locally committed (Strict TDD throughout — every GREEN task preceded by a failing RED test):

| PR | Branch | Content | Tests added | Authored lines |
|---|---|---|---|---|
| 1 | `driver-app-navigation-pr1-test-infra` | Test infra, theme tokens, 6 shared components | 22 | 547 |
| 2 | `driver-app-navigation-pr2-pure-services` | offlineQueue, apiClient, config, storage (pure) | 29 | 513 |
| 3 | `driver-app-navigation-pr3-auth-context` | AuthContext | 13 | 467 |
| 4 | `driver-app-navigation-pr4-sync-context` | SyncContext (highest-risk unit) | 16 | 740 |
| 5 | `driver-app-navigation-pr5-navigation-shell` | React Navigation install, RootNavigator/AuthStack/MainTabs, LoginScreen, App.tsx → shell | 9 | 1635 (mostly App.tsx deletion) |
| 6 | `driver-app-navigation-pr6-home-screen` | HomeScreen | 5 | 249 |
| 7 | `driver-app-navigation-pr7-new-sale-screen` | NewSaleScreen | 8 | 610 |
| 8 | `driver-app-navigation-pr8-expenses-screen` | ExpensesScreen | 8 | 477 |
| 9 | `driver-app-navigation-pr9-sync-screen` | SyncScreen + stub cleanup | 7 | 336 |
| 10 | `driver-app-navigation-pr10-sales-scope-endpoint` | `GET /sales/mine` + HomeScreen repoint | 14 | 270 |

All branches stack linearly off the `driver-app-navigation` tracker branch (off `main`). **Nothing has been pushed; no PRs are open on GitHub.**

`sdd-verify` passed with 0 critical findings (4 warnings, 2 suggestions — see `sdd/driver-app-navigation/verify-report` in Engram): no live e2e/HTTP proof exists for the `GET /sales` 403 regression or `/sales/mine` round-trip (this repo has no working e2e harness at all, pre-existing gap, not introduced by this change), and web-compat verification is bundle-export-level only (`expo export --platform web`), never a live browser render.

## Next Step

Push the branch chain and open the 10 chained PRs (tracker-based `feature-branch-chain`: each PR targets the previous PR's branch, only the tracker merges to `main` once PR10 is approved) — pending explicit go-ahead, since this is a real, visible action on shared state.
