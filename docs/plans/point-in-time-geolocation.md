# Change: Point-in-Time Geolocation

**Phase**: 5 of 9 ([roadmap](./README.md))
**SDD artifact store**: Engram (project `sistema-de-reparto`, topic keys `sdd/point-in-time-geolocation/*`)
**Status**: Planned — explore/proposal/spec/design/tasks complete, not yet implemented.

## Session Preflight (applies to this change)

- Pace: `auto` (phases run back-to-back; orchestrator gate-validates each result before launching the next)
- Artifact store: `engram`
- Delivery strategy: `ask-on-risk`
- Review budget: 800 changed lines
- Chain strategy: not pre-committed — forecast (Tasks §) puts this change well under budget as a single PR; no chaining expected

## Business Decisions Confirmed by the Owner

Only one decision for this phase was made at roadmap level (binding, not re-litigated here):

| Decision | Chosen |
|---|---|
| What this phase captures | "Capture lat/lng when a sale is confirmed (no routing yet)" — a single point-in-time reading, not continuous tracking, not a routing/navigation feature. `expo-location`'s foreground, one-shot API (`getCurrentPositionAsync`), not `watchPositionAsync`/background permissions. |

## Open Questions (Owner Unavailable — Conservative Assumptions Applied)

The owner was not available to resolve these before planning. Each was given the most conservative/reversible assumption — the one that adds the least new mandatory behavior and is cheapest to tighten later if the real answer turns out stricter. This mirrors the exact methodology used in phases 3, 4, and 7. All five are carried forward as explicit "Resolved Open Questions" in the Design section too, and must be re-confirmed with the owner before `sdd-apply` starts.

| # | Question | Conservative assumption taken | Why reversible |
|---|---|---|---|
| 1 | Is the position mandatory to confirm a sale, or can the driver keep selling if the permission is denied or there's no GPS signal? | **Optional.** A sale saves successfully with `latitude`/`longitude` left `null` when the permission is denied, the device has no GPS fix, or the read times out. Extends the exact invariant the roadmap itself states is already established — "No running tab / always charge": no sale has ever been blocked by a missing photo (`paymentProofRef`, phase 7) or a missing container flag (`containerReturned`, phase 4). Blocking on a missing GPS fix would be the *first* time a sale is blocked by a device/environment condition outside the driver's direct control — a strictly bigger behavior change than either precedent, taken without owner sign-off. | Turning it mandatory later (e.g., reject `POST /sales` with no coordinates for `paymentMethod !== 'efectivo'`, or for all sales) is a small validator addition, same shape as tightening `paymentProofRef` would be. Requiring it today and discovering a whole zone has patchy signal would block real sales — not reversible without a field hotfix. |
| 2 | Does it apply only to `createSale` (a normal sale), or also to `recordEmptyVisit` (a churn "visit, nothing sold")? | **`createSale` only, this phase.** The roadmap's own phrasing is "capture lat/lng when **a sale** is confirmed" — not "a visit." `recordEmptyVisit` is left completely untouched: `RecordEmptyVisitInput` gains no fields, `recordEmptyVisit()` gains no lines. | Adding it to `recordEmptyVisit` later is a same-shape additive change — `latitude?`/`longitude?` added directly to `RecordEmptyVisitInput` (it does **not** inherit from `CreateSaleInput` the way `UpdateSaleInput` does — see Explore, this is a real difference from the `paymentProofRef` precedent), plus a few lines in the isolated `prisma.sale.create` call `recordEmptyVisit` already has. Nothing needs to be undone; it's a pure addition to a currently-untouched code path. |
| 3 | Can the position be captured or changed when editing a sale (`PATCH /sales/:id`), or does it stay fixed from the moment of creation? | **Fixed at creation, never editable.** `CreateSaleInput` gains `latitude?`/`longitude?` (needed so `createSale` can accept them), which — through the existing `UpdateSaleInput = CreateSaleInput & {...}` composition — means the fields are structurally *present* on an edit payload too. `updateSale`'s service code deliberately never reads `input.latitude`/`input.longitude` for the write: it always carries forward the row's already-stored `existing.latitude`/`existing.longitude`, exactly the same "field is present in the input type as a hint, but the service treats the persisted row as the only source of truth" pattern already used for `input.kind` (see Explore). This is a *data-integrity* call, not a UX call: a photo attached after the fact is still valid evidence, and a corrected `containerReturned` flag is still a valid correction of a data-entry mistake — but an edited GPS coordinate for a past instant has no honest real-world referent; it can only be fabricated. | If the real answer turns out to be "yes, allow correcting an obviously-wrong pin," that's a small, explicit, deliberate code change (stop ignoring `input.latitude`/`input.longitude` in `updateSale`) — not a data model change. Going the other direction (locking down something already editable) is strictly harder and riskier, since it means auditing whether any already-shipped edits need to be treated as suspect. Starting locked is the cheaper, safer default. |
| 4 | What happens if the GPS read is slow (bad signal)? Is there a timeout, or does the app wait indefinitely? | **App-level timeout, e.g. 8 seconds** (`Promise.race` between `getCurrentPositionAsync()` and a fixed-duration timer), same class of decision as Open Question 1: on timeout, treat it identically to "permission denied" — proceed with the sale, `latitude`/`longitude` stay `null`. The exact duration is a tunable constant, not a hard architectural choice. | The timeout value is trivially adjustable in one place (a single constant) without touching any other layer. The alternative — no timeout — risks an indefinite hang on a screen a driver needs to keep using all day; that failure mode is far more expensive to discover in the field than "8 seconds turned out to be too short/long," which is a one-line tuning fix. |
| 5 | Does the dashboard need to show the position (map, or raw lat/lng in a table), or is it enough that it's stored for future consumption? | **API-only this phase.** `SaleRecord.latitude`/`SaleRecord.longitude` are persisted and exposed over `GET /sales`/`GET /sales/mine`, but no dashboard UI is built. Mirrors phase 7's Open Question 4 precedent exactly ("no distinct dashboard reporting this phase"). Phase 6 (customer picker + proximity suggestion) is the actual, roadmap-stated consumer of this data — it needs the coordinates programmatically, not as a map widget — and phase 8 (live dashboard) is where any admin-facing map/table display would belong if ever built. | Explicitly deferred by roadmap structure (phase 5 vs. phases 6/8 are separate line items); nothing to reverse — building a display later is additive, not a migration. |

---

## 1. Explore

## Exploration: point-in-time-geolocation

### Current State

**`expo-location` is confirmed absent — the roadmap's own claim checks out.** Read directly, not assumed:
- `grep -rn "expo-location" apps/driver-app/package.json apps/driver-app/app.json` → zero matches in either file.
- `apps/driver-app/package.json` (dependencies, read directly) lists no geolocation package at all — only `expo-image-picker: ~57.0.7` for camera/gallery access. There is no alternate geolocation mechanism already present by another name (no `react-native-geolocation-service`, no raw `navigator.geolocation` usage, nothing under `apps/driver-app/src` matching `geolocat|latitude|longitude`). This phase is a genuine greenfield addition of a hardware-permission dependency — the first of its kind in this codebase, exactly as the task brief frames it.
- `apps/driver-app/app.json` (read in full — it's a small file, 21 lines) has **no `plugins` array at all today**. This matters as precedent: `expo-image-picker` is already a live, shipped dependency (three screens use it) with **zero corresponding `app.json` config** — no plugin entry, no custom permission-description strings for iOS/Android. Whatever mechanism currently lets camera/gallery permissions work (Expo Go's or the dev client's baked-in default permission descriptions) is the same mechanism `expo-location`'s `requestForegroundPermissionsAsync()` would rely on if this phase also adds no `app.json` config — consistent with, not a regression from, the existing pattern.

**Precedent for the field's shape**: `apps/api/prisma/schema.prisma`, `model Customer` (read directly, lines 143–156):
```prisma
model Customer {
  id           String       @id @default(cuid())
  name         String
  customerType CustomerType
  zone         String?
  latitude     Float?
  longitude    Float?
  ...
}
```
Two flat, nullable `Float` columns — not a nested/JSON structure. This is the only existing precedent in the schema for storing a coordinate pair, and it settles the "object vs. two scalars" question the task brief raised: nothing else in `schema.prisma` uses a JSON column for structured data outside `SaleAudit.before`/`SaleAudit.after` (which are audit snapshots of whole records, a different concern entirely, not a reusable "structured coordinate" pattern). Matching `Customer.latitude`/`Customer.longitude` exactly — same field names, same type, same nullability — is the direct, unambiguous precedent to follow for `Sale`.

**`packages/shared/src/domain.ts`** (read directly):
- `CreateSaleInput` (lines 48–61) already has `containerReturned?: boolean` (phase 4) and `paymentProofRef?: string` (phase 7) — both optional, both added with zero structural friction. `latitude?: number`/`longitude?: number` would land the same way.
- `SaleRecord` (91–113) mirrors the same two optional fields for read. Same pattern applies.
- `UpdateSaleInput` (80–89) is `CreateSaleInput & { reason: string; kind?: SaleKind }` — confirmed by reading it directly. Its own doc comment (lines 82–87) states explicitly: `kind` is "a validation hint... service SIEMPRE revalida contra el `kind` almacenado en la fila real... este campo nunca es la unica fuente de verdad." **This is the exact mechanism Open Question 3's conservative assumption reuses**: `latitude`/`longitude` will be structurally present on `UpdateSaleInput` (inherited "for free," same as `paymentProofRef` was in phase 7) but the service will treat them exactly like `kind` — present in the type, never trusted as the write's source of truth for an existing row.
- `RecordEmptyVisitInput` (69–78), read directly, does **not** extend `CreateSaleInput` — it's an independently-declared narrower type (`clientGeneratedId`, `driverName`, `truckCode`, `truckId`, `customerName`, `customerType`, `customerId`, `note` — no `items`, no `paymentMethod`, and critically no `containerReturned`/`paymentProofRef` either, since it isn't a subtype of `CreateSaleInput`). This confirms the task brief's implicit question: adding location to churn visits is **not** "free" the way `UpdateSaleInput` edits are — it needs its own explicit fields on `RecordEmptyVisitInput`, deliberately not done this phase (Open Question 2).

**`apps/driver-app/src/screens/NewSaleScreen.tsx`** (read directly, lines 100–343):
- `saveSale()` (187–234) is where the outgoing `CreateSaleInput` payload is assembled, immediately before `trySendSale(payload)`/`enqueueSale(payload, cause)`. The existing pattern for optional fields the driver may or may not have touched (`containerReturned`, `paymentProofRef`) is a conditional spread: `...(containerReturned !== undefined ? { containerReturned } : {})` and `...(paymentProofRef ? { paymentProofRef } : {})` (lines 201–204) — the key is omitted entirely, not sent as `false`/`""`, when there's nothing to report. This is the exact spot and the exact pattern a location read belongs in: capture right before/inside `saveSale()`, spread `latitude`/`longitude` into the payload only when a real reading was obtained, omit the keys entirely on denial/timeout/failure (Open Question 1).
- **Why not capture on screen mount instead**: `NewSaleScreen` is not opened once a day — it's the driver's main working screen, visited repeatedly, and a sale is very often started then abandoned mid-entry (wrong customer, wrong quantities) before `saveSale()` is ever called. Requesting a location permission/reading on every mount would (a) prompt for the permission far more often than necessary, and (b) capture a position that may be stale or unrelated to the eventual real confirmation moment if the driver walks around while filling the form. Capturing inside `saveSale()`, at the moment of confirmation, is what "point-in-time" in the phase name actually means — it ties the coordinate to the exact instant the business event (the sale) became real, matching how `paymentProofRef` is also only captured/uploaded as part of the same confirm action, never speculatively on mount.
- The photo-permission pattern already established three times in this codebase (`NewSaleScreen.tsx` 129–156 for gallery, 158–185 for camera; identical shape in `ExpensesScreen.tsx` 94–133 and `LoadManifestScreen.tsx` 88–118) is:
  ```ts
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    showMessage('...', 'error');
    return;
  }
  ```
  `expo-location`'s `requestForegroundPermissionsAsync()` returns the same `{ granted: boolean, ... }` shape (Expo's permission-result convention is uniform across `expo-image-picker`, `expo-location`, `expo-camera`, etc.), so the `if (!permission.granted) { ...; return/fallback; }` branch is a direct, drop-in continuation of an already-three-times-repeated local convention — not a new pattern to invent.
- Confirmed: no `containerReturned`/`paymentProofRef`-style validator rejects an *absent* value anywhere in `validateCreateSaleInput` — both are purely optional with only "reject if present-but-empty/invalid" guards. The same shape applies to `latitude`/`longitude`.

**`recordEmptyVisit`/churn** (`apps/api/src/sales/sales.service.ts`, read directly, lines 176–224; `NewSaleScreen.tsx` `recordVisit()`, lines 309–343):
- `recordEmptyVisit()` is a real, physical visit to a customer — same as the task brief frames it — with its own isolated `prisma.sale.create` call (Design decision #1 from phase 4, explicitly documented in the code's own comment: "Isolated from `createSale` on purpose"). Technically, adding `latitude`/`longitude` there is not harder than `createSale` — it would be two more scalar fields in one `data: {...}` object, same shape as `containerReturned: true` and `paymentMethod: null` are already forced there.
- What makes it a genuine open question, not an obvious "yes": `recordVisit()` in `NewSaleScreen.tsx` (309–343) is deliberately framed in the code's own comments as a *lighter*, faster action than a full sale — "Accion deliberadamente separada de saveSale... NO requiere items ni forma de pago." Bolting a GPS permission prompt + read (with its own latency, even with a timeout) onto the lightest existing action in the screen works against that deliberate lightness, and the roadmap's own phase-5 wording names "a sale," not "a visit." This is exactly the kind of business-intent question (is a churn visit important enough to also verify geolocation, at the cost of added friction on the app's fastest action) that has no obvious answer from the code alone — correctly left open per the task brief's own instruction.

**`apps/api/src/sales/sales.service.ts` / `sales.controller.ts`** (read directly — same precedent-check the task brief asked for, done against the real merged code, not the plan doc's description of it):
- `createSale` (115–165): one flat `data: {...}` object passed to `prisma.sale.create`, already carrying `paymentProofRef: input.paymentProofRef?.trim() || null` (line 146) and `containerReturned: input.containerReturned ?? null` (line 147) as one-line additions each. `latitude: input.latitude ?? null, longitude: input.longitude ?? null` is exactly the same shape of addition — no branching, no new invariant to protect (confirmed: unlike phase 4's churn work, there is nothing in `createSale` that a coordinate pair could conflict with).
- `updateSale` (226–348): already has the `isChurn` branch (lines 252, 260–278) that forces certain fields (`paymentMethod`, `items`, `total`, `containerReturned`, `paymentProofRef`) to specific values depending on the row's real, stored `kind` — and separately (not shown for any field yet, but the *shape* is already there via the `kind`-hint doc comment) the general principle that some fields on `UpdateSaleInput` are present in the type but not blindly trusted. `latitude`/`longitude` become the **first fields forced to the stored value unconditionally** (regardless of `isChurn`), which is a new variant of an already-existing idea (fields on the input type that the service deliberately doesn't trust), not a new architectural concept.
- `beforeSnapshot`/`after` audit objects (280–294, 326–340) currently snapshot every persisted, editable field. Since `latitude`/`longitude` will be **immutable** on edit (Open Question 3), they do not need to join these snapshot objects — there is nothing to diff, since the value never changes across an edit. This is a deliberate difference from `paymentProofRef`, which does appear in these snapshots because it is editable.
- `sales.controller.ts` (read directly, lines 37–103): `createSale` (55–63), `recordEmptyVisit` (67–75), `updateSale` (79–87) all forward the full `@Body()` to validators/service unchanged, same as phase 7's confirmation — no controller changes needed for this phase either.

**Permissions and runtime failure handling** (Expo, read directly across the three screens listed in the task brief):
- The three-screen pattern (`requestMediaLibraryPermissionsAsync`/`requestCameraPermissionsAsync`, check `.granted`, `showMessage(...)` + early `return` on denial) is the established local convention for "ask for a hardware permission, handle denial gracefully, never crash or hard-block the surrounding flow." `expo-location`'s `requestForegroundPermissionsAsync()` returns the same `PermissionResponse` shape and is the direct analog to reuse — not `requestBackgroundPermissionsAsync` (irrelevant — no background tracking, the roadmap says "no routing yet") and not `watchPositionAsync` (continuous stream — wrong API for a single point-in-time read; `getCurrentPositionAsync()` is the one-shot equivalent).
- `app.json` (read in full): **no `plugins` array today, for any Expo module**, including the three already-shipped `expo-image-picker` consumers. This is the direct, load-bearing precedent for this phase's own `app.json` decision (Design decision #8): adding no plugin config for `expo-location` either is consistent with — not a lowering of the bar set by — the existing, already-shipped hardware-permission integration. It is flagged as a residual risk in both this phase and, implicitly, retroactively in phase 7/3 as well (out of this phase's scope to fix), since a real native/EAS build (as opposed to Expo Go/dev client) may need explicit `NSLocationWhenInUseUsageDescription`/`ACCESS_FINE_LOCATION` plugin config to pass app-store review or to show a customized permission prompt string — untested territory for this whole codebase, not unique to location.

### Affected Areas

- `apps/api/prisma/schema.prisma` — `Sale.latitude Float?`, `Sale.longitude Float?` (two new nullable columns, purely additive, no enum, no index needed — display/reference fields for now; phase 6 may add a spatial/composite index later if proximity queries need one, out of scope here).
- `apps/api/prisma/migrations/` — one additive migration (`ALTER TABLE "Sale" ADD COLUMN "latitude" DOUBLE PRECISION`, `ADD COLUMN "longitude" DOUBLE PRECISION`), no data loss, no backfill (existing rows correctly become `null` = "no position captured," an accurate historical statement, same reasoning phase 7 used for `paymentProofRef`).
- `packages/shared/src/domain.ts` — `CreateSaleInput.latitude?: number` / `.longitude?: number`; `validateCreateSaleInput` gains a pairing guard (both-or-neither) and range guards (`-90..90` / `-180..180`); `SaleRecord.latitude?: number` / `.longitude?: number`. `UpdateSaleInput` inherits the fields "for free" via composition (same as every prior optional `Sale` field) but the *service*, not the type layer, is what enforces immutability on edit (Open Question 3) — flagged explicitly as a residual gap (a client could technically send `latitude` in a `PATCH` body; the API silently ignores it rather than rejecting it, same class of leniency the `kind` hint already has).
- `apps/api/src/sales/sales.service.ts` — `createSale` maps both fields through (two lines, no branching); `updateSale` explicitly does **not** read `input.latitude`/`input.longitude` — the write always carries forward `existing.latitude`/`existing.longitude` unconditionally (not just for churn); `toSaleRecord` maps both fields onto `SaleRecord`. `recordEmptyVisit` is untouched this phase (Open Question 2).
- `apps/api/src/sales/sales.controller.ts` — no route changes; existing `createSale`/`updateSale` handlers already pass the full body through.
- `apps/driver-app/package.json` — add `expo-location` (install via `npx expo install expo-location` at apply time so the version resolves against the installed Expo SDK 57 toolchain automatically, rather than hand-pinning a version number here that could drift from what SDK 57 actually resolves).
- `apps/driver-app/app.json` — **no changes this phase** (Design decision #8), mirroring the zero-plugin-config precedent already set by `expo-image-picker`.
- `apps/driver-app/src/screens/NewSaleScreen.tsx` — location capture (permission request + timeout-guarded one-shot read) invoked from inside `saveSale()`, spread into the `CreateSaleInput` payload only when a reading succeeds, following the existing conditional-spread pattern for `containerReturned`/`paymentProofRef`.
- `apps/dashboard` — **no changes this phase** (Open Question 5).

### Approaches

Two ways to add the fields were compared, using the same "isolate vs. reuse the generic path" framing phases 4 and 7 used.

**A — New, isolated endpoint** (e.g., `PATCH /sales/:id/location`, called right after `POST /sales` succeeds), mirroring how phase 4 isolated `recordEmptyVisit()` from `createSale`.
- *Pros*: keeps `createSale`'s request body unchanged; a dedicated endpoint could enforce "immutable after first write" (Open Question 3) at the database/API layer more explicitly (e.g., reject a second call for the same sale) rather than relying on `updateSale` silently ignoring the fields.
- *Cons*: introduces a real new failure mode — a two-step create (sale succeeds, location call fails/never happens because the driver's connection dropped between the two calls) that the offline-first driver-app's single-payload-per-action architecture (`trySendSale`/`enqueueSale`, one queued item per business action) doesn't have a slot for today. Every other "attach extra data to a sale" case in this codebase (churn's `containerReturned`, phase 7's `paymentProofRef`) rides inside the *same* payload as the sale itself specifically to avoid this class of "sale created, follow-up call lost" problem. Adding a second network round-trip purely to protect an immutability guarantee that a one-line service-side ignore already gives for free is not a proportionate amount of new code/risk.

**B — Additive fields directly on `CreateSaleInput`, flowing through the existing `createSale`, with `updateSale` deliberately ignoring them.**
- *Pros*: rides the same single-payload-per-sale-creation path every offline-first field in this app already uses — zero new network calls, zero new offline-queue wiring (the field is just two more keys in the payload `trySendSale`/`enqueueSale` already carry, same conclusion phase 7 reached for `paymentProofRef`). Immutability (Open Question 3) is enforced with a one-line change to `updateSale` (never read `input.latitude`/`input.longitude`), reusing the exact "input field present, service doesn't trust it" pattern the `kind` hint already established — not new architecture.
- *Cons*: the immutability guarantee lives in application code, not in the type system or the database (a determined API caller bypassing the driver-app UI could still send `latitude` in a `PATCH /sales/:id` body; it would be silently accepted-and-ignored, not rejected with an error). Judged acceptable: the same class of leniency already exists for `kind` on `UpdateSaleInput` today, and this is an internal fleet-management API with role-gated write access (`@Roles('admin','chofer')`), not a public API where a malicious caller is a realistic threat model.

**C — Store the location on a separate `SaleLocation`/audit-adjacent table instead of `Sale` columns (not seriously considered).** Rejected for the same reason phase 4 rejected a separate `Visit` entity and phase 7 rejected a side table for `paymentProofRef`: there is exactly one position per sale (not a position history — Open Question 3 rules out ever needing more than one row per sale), so no relational modeling is warranted, and the direct `Customer.latitude`/`Customer.longitude` precedent already establishes flat scalar columns as this codebase's convention for exactly this kind of data.

**Recommendation: B.** The immutability requirement (Open Question 3) is real but does not require a second endpoint to enforce — the codebase already has a working, established pattern (`kind` as an input hint the service doesn't trust) for exactly this shape of guarantee, and reusing it keeps the location fields inside the same single offline-friendly payload every other per-sale field already uses.

### Risks

- Open Question 1 (mandatory vs. optional) unresolved without the owner; the conservative assumption (fully optional, sale never blocked) is taken and must be re-confirmed before `sdd-apply`, same protocol as phases 3, 4, 7.
- This is the **first hardware-permission dependency** in `apps/driver-app` beyond the already-shipped camera/gallery access — genuinely new risk surface the task brief itself calls out, not an assumption to wave away: a driver can deny the permission, have GPS/location services disabled at the OS level, or be in a signal dead zone at the exact moment of a sale. All three collapse to the same code path (Open Question 1's optional/no-block assumption), but this is the first time this codebase has had to design a "hardware capability might just not be there" UX for a *sale-confirmation* action specifically (photo capture, by contrast, has always been optional/UI-gated, never something the driver is asked to do at the moment of closing the sale for every payment method).
- `updateSale` gains its first *unconditional* (not just `isChurn`-conditional) field-ignore — a maintainer extending `updateSale` later could accidentally start reading `input.latitude`/`input.longitude` for a "looks consistent with other fields" reason, silently breaking the immutability guarantee. Mitigated by an explicit code comment (mirroring the existing `kind`-hint comment style) and a dedicated test asserting a `PATCH` with a different `latitude`/`longitude` does **not** change the stored value.
- `app.json` gaining no plugin config (Design decision #8) is a known, accepted gap shared with the existing `expo-image-picker` integration — not a regression introduced by this phase, but also not fixed by it; flagged for whoever eventually does a real native/EAS build for the first time.
- No timeout value has ever been chosen for anything GPS-related in this codebase (first occurrence); the 8-second default (Open Question 4) is a placeholder best-guess, not a measured/tested figure, and should be revisited once real field data on GPS-fix latency in the driver's actual delivery zones exists.

---

## 2. Proposal

# Proposal: Point-in-Time Geolocation

### Intent

Every sale today records *who* sold it, *what* was sold, and *to whom* — but never *where* it happened. This blocks the roadmap's phase 6 (customer picker with proximity suggestion), which needs a driver's actual location at the moment of a nearby sale to make any "closest customers" suggestion meaningful. Per the binding roadmap decision, this phase captures a single point-in-time GPS reading when a sale is confirmed — not continuous tracking, not routing, not a background service. Success = a driver confirming a sale on a device with a GPS fix and a granted location permission gets `latitude`/`longitude` stored against that sale, retrievable over `GET /sales`/`GET /sales/mine` for phase 6 to consume; a driver without a fix, without the permission, or on a device that's slow to respond can still close the sale exactly as today, with no coordinates recorded.

### Scope

**In Scope**
- Prisma: `Sale.latitude Float?`, `Sale.longitude Float?` (nullable, additive columns, no new enum, matching the existing `Customer.latitude`/`Customer.longitude` precedent exactly).
- `packages/shared/src/domain.ts`: `CreateSaleInput.latitude?: number` / `.longitude?: number`; `validateCreateSaleInput` gains a both-or-neither pairing guard and range guards (`-90..90` / `-180..180`); `SaleRecord.latitude?: number` / `.longitude?: number`. `UpdateSaleInput`/`validateUpdateSaleInput` inherit the fields/checks for free through existing composition (same mechanism as every prior optional `Sale` field), but see the service-layer immutability note below.
- `apps/api/src/sales/sales.service.ts`: `createSale` maps both new fields through; `updateSale` is changed to **never read** `input.latitude`/`input.longitude` — the write always persists `existing.latitude`/`existing.longitude` unconditionally, enforcing Open Question 3's "immutable after creation" decision at the service layer; `toSaleRecord` maps both fields onto `SaleRecord`.
- `apps/api/src/sales/sales.controller.ts`: **no route changes** — existing `createSale`/`updateSale` handlers already forward the full body.
- `apps/driver-app`: add `expo-location` dependency; `NewSaleScreen.tsx` gains a permission request + timeout-guarded one-shot location read, invoked from inside `saveSale()` (not on screen mount), included in the existing `CreateSaleInput` payload only when a reading succeeds — no new offline-queue wiring needed, it rides the existing `trySendSale`/`enqueueSale` payload.
- Jest tests in `apps/api` (validator + `SalesService` create/update-immutability) and `apps/driver-app` (`NewSaleScreen`) for every new/changed path, strict TDD.

**Out of Scope**
- Any change to `recordEmptyVisit`/`RecordEmptyVisitInput` (Open Question 2 — churn visits do not capture location this phase; the roadmap's own wording names "a sale," not "a visit").
- Making the position mandatory to confirm any sale (Open Question 1 — optional everywhere, conservative default, extends the "no running tab / always charge" invariant).
- Allowing the position to be set or changed via `PATCH /sales/:id` (Open Question 3 — immutable after creation, enforced service-side).
- Any dashboard UI to display the position — map or raw-coordinate table (Open Question 5 — API-only this phase, deferred to phase 6's actual consumption and/or a future dashboard phase).
- Background location tracking, continuous position updates, or any form of routing/navigation — explicitly excluded by the binding roadmap decision ("no routing yet").
- Any `app.json` native-permission-description/plugin configuration beyond what already (doesn't) exist for `expo-image-picker` — flagged as a shared, pre-existing gap, not solved in this phase (Design decision #8).
- Migrating uploaded files or any other data off local disk to cloud object storage — unrelated cross-cutting roadmap decision, not touched by this phase.

### Capabilities

**New**: none — this is a field addition to the existing `sale-recording` capability, not a new capability.
**Modified**: `sale-recording` — a normal sale (`kind='sale'`) gains an optional `latitude`/`longitude` pair, settable only at creation and immutable thereafter; a churn row (`kind='churn'`) never carries one, since `recordEmptyVisit` is untouched this phase.

### Approach

Purely additive at the schema/type level, with one deliberate new restriction at the service level. `Sale` gains two nullable columns that change the meaning or requiredness of no existing column for any existing row. The fields flow through the same generic `createSale` path every other optional `Sale` field already uses — no new service method, no new controller route, no new validator function beyond two small guards. The one genuinely new piece of logic is `updateSale` being taught to ignore `input.latitude`/`input.longitude` unconditionally, reusing the "input field present, service doesn't trust it" pattern already established for `input.kind`.

### Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `apps/api/prisma/schema.prisma` | Modified | `Sale.latitude Float?`, `Sale.longitude Float?` added |
| `apps/api/prisma/migrations/` | New | One additive migration, no data loss, no backfill needed |
| `packages/shared/src/domain.ts` | Modified | `CreateSaleInput.latitude?/longitude?`; pairing + range validator guards; `SaleRecord.latitude?/longitude?` |
| `apps/api/src/sales/sales.service.ts` | Modified | `createSale`/`toSaleRecord` map the new fields; `updateSale` ignores `input.latitude`/`input.longitude` unconditionally, always persisting the existing stored value |
| `apps/api/src/sales/sales.controller.ts` | Unchanged | Existing routes already forward the full body |
| `apps/driver-app/package.json` | Modified | Add `expo-location` |
| `apps/driver-app/app.json` | Unchanged | No plugin config this phase (Design decision #8) |
| `apps/driver-app/src/screens/NewSaleScreen.tsx` | Modified | Permission request + timeout-guarded location read inside `saveSale()`, included in the existing sale payload |
| `apps/dashboard` | Unchanged | No display UI this phase (Open Question 5) |
| `apps/api/src/sales/sales.service.ts` (`recordEmptyVisit`) | Unchanged | Deliberately untouched (Open Question 2) |

### Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| First hardware-permission UX at sale-confirmation time; a driver denying it or having no GPS fix must not block a sale | Medium | Explicit optional-by-design decision (Open Question 1), same "never block a sale" invariant already proven for photo/container fields |
| A slow/absent GPS fix hangs the save flow indefinitely | Medium | App-level timeout (Open Question 4) races the location read against a fixed duration; on timeout, proceed exactly like a denied permission |
| `updateSale`'s new unconditional field-ignore is accidentally undone by a future maintainer who starts reading `input.latitude`/`input.longitude` "for consistency" | Low | Explicit code comment mirroring the existing `kind`-hint comment; dedicated test asserting a `PATCH` with different coordinates does not change the stored value |
| Assumptions taken for Open Questions 1–5 turn out wrong once the owner is reachable | Medium | All five chosen as the cheapest-to-tighten-later option; flagged explicitly for re-confirmation before `sdd-apply`, same protocol as phases 3, 4, 7 |
| `app.json` has no native permission-description plugin config for any Expo hardware permission today (pre-existing gap, not introduced by this phase) | Low | Explicitly out of scope to fix here; flagged for awareness, shared with the existing `expo-image-picker` integration |

### Rollback Plan

Fully additive at the schema level: the up-migration only adds two nullable columns, touching no existing row's meaning. Roll back by (1) reverting the API/shared/driver-app commits — `createSale`'s behavior for a payload with no `latitude`/`longitude` is unchanged, so a revert restores exactly today's behavior; (2) down-migration drops both columns (safe unconditionally — no other column or invariant depends on them). No historical `Sale` row is touched by the up-migration.

### Success Criteria

- [ ] `POST /sales` behaves exactly as today when `latitude`/`longitude` are omitted; behaves identically otherwise except the new fields are stored.
- [ ] `POST /sales` with a valid `latitude`/`longitude` pair succeeds and stores both values.
- [ ] `POST /sales` with only one of `latitude`/`longitude` provided is rejected ("must be provided together").
- [ ] `POST /sales` with an out-of-range `latitude` or `longitude` is rejected.
- [ ] `PATCH /sales/:id` cannot change a sale's stored `latitude`/`longitude`, regardless of what the request body contains.
- [ ] `GET /sales` / `GET /sales/mine` return `latitude`/`longitude` on every `SaleRecord`.
- [ ] `recordEmptyVisit`'s existing test suite passes unmodified — zero behavior change for churn visits.
- [ ] Driver-app: a sale can still be saved with no location captured (permission denied, no fix, or timeout), following the same "sale still saves" pattern already proven for photo/container fields.
- [ ] Jest suite in `apps/api` and `apps/driver-app` covers every new/changed path and passes.

---

## 3. Spec

# Spec: Point-in-Time Geolocation

### Domain: sale-recording (Modified)

**Requirement: Optional `latitude`/`longitude` on a normal sale, captured only at creation**
`POST /sales` MUST accept an optional coordinate pair, `latitude: number` and `longitude: number`. Omitting both MUST behave exactly as before this change (both stored as `null`). Providing only one of the two MUST be rejected. When both are provided, `latitude` MUST be within `[-90, 90]` and `longitude` MUST be within `[-180, 180]`. *(Previously: no such fields existed.)*

- *Scenario: Sale without location unchanged* — GIVEN a payload with no `latitude`/`longitude`, WHEN the sale is created, THEN it succeeds exactly as before, both fields stored as `null`.
- *Scenario: Sale with valid location recorded* — GIVEN a payload with `latitude: -34.6037, longitude: -58.3816`, WHEN the sale is created, THEN the stored `Sale.latitude`/`Sale.longitude` equal those values.
- *Scenario: One coordinate without the other rejected* — GIVEN a payload with `latitude: -34.6037` and no `longitude`, WHEN it is submitted, THEN the system rejects it with "latitude and longitude must be provided together."
- *Scenario: Out-of-range latitude rejected* — GIVEN a payload with `latitude: 200`, WHEN it is submitted, THEN the system rejects it with "latitude must be between -90 and 90."
- *Scenario: Out-of-range longitude rejected* — GIVEN a payload with `longitude: -400`, WHEN it is submitted, THEN the system rejects it with "longitude must be between -180 and 180."
- *Scenario: Accepted regardless of payment method* — GIVEN a payload with `paymentMethod: "efectivo"` and a valid coordinate pair, WHEN the sale is created, THEN it succeeds and both values are stored (location capture is independent of how the sale was paid).

**Requirement: A normal sale's `latitude`/`longitude` are immutable after creation**
`PATCH /sales/:id` on a `Sale` with stored `kind='sale'` MUST NOT change `latitude`/`longitude`, regardless of any value present in the request body. The stored values from creation time persist unchanged through any number of subsequent edits. *(Previously: field didn't exist; stated in full as new.)*

- *Scenario: Edit does not change a previously-recorded location* — GIVEN an existing `Sale` with `kind='sale'` and stored `latitude: -34.6037, longitude: -58.3816`, WHEN it is edited with a request body containing a different `latitude`/`longitude`, THEN the stored values remain the original `-34.6037`/`-58.3816` after the edit.
- *Scenario: Edit does not populate a never-captured location* — GIVEN an existing `Sale` with `kind='sale'` and stored `latitude: null, longitude: null` (no location was captured at creation), WHEN it is edited with a request body containing a `latitude`/`longitude`, THEN the stored values remain `null` after the edit — a location can never be added retroactively.

**Requirement: A churn row never carries a position (this phase)**
`POST /sales/empty-visit` MUST continue to accept only `RecordEmptyVisitInput`'s existing fields — `latitude`/`longitude` are not part of that type and MUST NOT be added to it this phase (Open Question 2). *(No behavior change — stated explicitly so this phase's scope is unambiguous: `recordEmptyVisit` requires zero code changes.)*

- *Scenario: Extra fields on a churn request are ignored, not stored* — GIVEN a `POST /sales/empty-visit` request body that includes unexpected `latitude`/`longitude` keys, WHEN it is submitted, THEN the created `Sale` has `latitude=null, longitude=null` (the fields are not part of `RecordEmptyVisitInput`'s shape, so nothing reads them).

**Requirement: `SaleRecord` exposes the captured position**
`GET /sales` and `GET /sales/mine` MUST include `latitude`/`longitude` on every returned `SaleRecord`, `undefined`/absent-equivalent when the sale has no captured position.

- *Scenario: Location returned when present* — GIVEN a `Sale` with stored `latitude: -34.6037, longitude: -58.3816`, WHEN it is fetched via `GET /sales/mine`, THEN the returned record includes both values.
- *Scenario: Location omitted when absent* — GIVEN a `Sale` with `latitude=null, longitude=null`, WHEN it is fetched, THEN the returned record's `latitude`/`longitude` are `undefined` (mirrors how every other optional nullable field on `SaleRecord` is already mapped, e.g. `paymentProofRef`).

---

## 4. Design

# Design: Point-in-Time Geolocation

### Technical Approach

Two new, nullable Prisma columns on `Sale`, matching the existing `Customer.latitude`/`Customer.longitude` precedent exactly. Two new optional fields threaded through `CreateSaleInput`/`SaleRecord`. `UpdateSaleInput` inherits the fields at the type level for free (same composition every prior optional field used), but `updateSale`'s implementation is changed to never read them — the write always persists the row's already-stored values, unconditionally, reusing the "input field present, service treats the stored row as the only source of truth" pattern already established for `input.kind`. No new endpoint, no new NestJS route, no continuous tracking, no routing.

### Architecture Decisions

| # | Decision | Choice | Rejected | Rationale |
|---|---|---|---|---|
| 1 | Field shape | Two flat, nullable `Float` columns: `Sale.latitude`, `Sale.longitude` | A nested/JSON `location: { lat, lng }` object | `Customer.latitude`/`Customer.longitude` is the only existing precedent for storing a coordinate pair in this schema, and it's already two flat scalars — matching it exactly avoids introducing the first structured-JSON-for-a-domain-value pattern in a codebase that has none today |
| 2 | Where the reading is captured | Inside `saveSale()`, at the moment "Guardar venta" is tapped | On `NewSaleScreen` mount | A sale is frequently started and abandoned before confirmation; capturing on mount would prompt for permission more often than needed and could record a stale position if the driver moves while filling the form. Capturing at confirmation matches "point-in-time" literally — tied to the instant the business event became real |
| 3 | Location API | `expo-location`'s `requestForegroundPermissionsAsync()` + one-shot `getCurrentPositionAsync()` | `requestBackgroundPermissionsAsync()` / continuous `watchPositionAsync()` | Binding roadmap decision: "no routing yet." No continuous tracking, no background access — foreground, one-shot only |
| 4 | Mandatory vs. optional | Optional everywhere; a sale always saves, with `latitude`/`longitude` `null` on denial/no-fix/timeout | Required to confirm a sale | Open Question 1's conservative assumption; extends the "no running tab / always charge" invariant already proven for `paymentProofRef`/`containerReturned` — no sale has ever been blocked by a missing photo or container flag, and a missing GPS fix is a strictly less controllable condition than either |
| 5 | `recordEmptyVisit` scope | Not touched this phase — no `latitude`/`longitude` on `RecordEmptyVisitInput` | Capture location for churn visits too | Open Question 2's conservative assumption; the roadmap's own wording names "a sale," and `recordVisit()` is deliberately the app's lightest action — adding a GPS permission/read to it works against that design intent without explicit owner sign-off |
| 6 | Editability | Immutable after creation: `updateSale` never reads `input.latitude`/`input.longitude`, always persists `existing.latitude`/`existing.longitude` | Editable like `paymentProofRef`, inherited "for free" via `UpdateSaleInput` composition | Open Question 3's conservative assumption; a data-integrity distinction, not a UX one — a photo attached after the fact is still valid evidence, but an edited GPS coordinate for a past instant has no honest real-world referent |
| 7 | Slow/absent GPS handling | App-level `Promise.race` against a fixed timeout constant (default 8000ms); on timeout, treat identically to permission-denied | No timeout — wait indefinitely for `getCurrentPositionAsync()` to resolve | Open Question 4's conservative assumption; an indefinite hang on a screen the driver needs to keep using all day is a worse failure mode than a tunable timeout that occasionally fires too early |
| 8 | `app.json` native config | No `plugins` entry added this phase | Add `expo-location` plugin config with custom `NSLocationWhenInUseUsageDescription`/`ACCESS_FINE_LOCATION` strings | `app.json` today has zero plugin config for any Expo module, including the already-shipped `expo-image-picker` (three screens, zero config) — adding none for location is consistent with, not a regression from, the existing bar; flagged as a shared residual risk for a future real native/EAS build, not fixed here |
| 9 | Dashboard display | Not built this phase; API-only storage | Build a map or raw-coordinate table column now | Open Question 5's conservative assumption; mirrors phase 7's Open Question 4 precedent of deferring dashboard work, and the actual near-term consumer (phase 6's proximity picker) needs the data programmatically, not as a display widget |

### Prisma Schema (additive change to the existing `Sale` model)

```prisma
model Sale {
  // ...existing fields unchanged...
  latitude   Float?
  longitude  Float?
}
```

No enum, no index, no change to any other column. `paymentMethod`/`kind`/`containerReturned`/`paymentProofRef` (added in phases 4 and 7) are untouched.

### Data Flow

```
POST /sales (existing path, two new optional fields)
  -> SalesController.createSale -> validateCreateSaleInput (gains pairing + range guards)
  -> SalesService.createSale
       `- prisma.sale.create({ ..., latitude: input.latitude ?? null, longitude: input.longitude ?? null })

PATCH /sales/:id (existing path, kind-aware since phase 4)
  -> SalesController.updateSale -> validateUpdateSaleInput(input)  // same guards, inherited (structurally validated if present, but see below)
  -> SalesService.updateSale
       |- load existing; kind-consistency guard (unchanged, phase 4)
       |- resolvedLatitude = existing.latitude    [NEW LINE -- input.latitude is never read]
       |- resolvedLongitude = existing.longitude  [NEW LINE -- input.longitude is never read]
       `- ...rest unchanged; latitude/longitude do NOT join the audit before/after
          snapshots (nothing to diff -- the value never changes across an edit)

POST /sales/empty-visit (unchanged -- RecordEmptyVisitInput has no latitude/longitude fields)
PATCH /sales/:id/cancel  -> unchanged, no code touches latitude/longitude

apps/driver-app/src/screens/NewSaleScreen.tsx: saveSale()
  |- permission = await Location.requestForegroundPermissionsAsync()
  |- if (!permission.granted) -> proceed with payload unchanged (no lat/lng keys)
  |- reading = await Promise.race([
  |      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
  |      timeout(LOCATION_TIMEOUT_MS),   // resolves to `null` on timeout
  |    ])
  |- if (reading) -> spread { latitude: reading.coords.latitude, longitude: reading.coords.longitude }
  |- else -> proceed with payload unchanged (no lat/lng keys), same as denial
  `- payload flows into the existing trySendSale(payload) / enqueueSale(payload, cause) unchanged
```

### File Changes

| File | Action | Description |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Modify | `Sale.latitude Float?`, `Sale.longitude Float?` added |
| `apps/api/prisma/migrations/<ts>_add_sale_location/migration.sql` | Create | `ALTER TABLE "Sale" ADD COLUMN "latitude" DOUBLE PRECISION, ADD COLUMN "longitude" DOUBLE PRECISION` |
| `packages/shared/src/domain.ts` | Modify | `CreateSaleInput.latitude?/longitude?`; pairing + range guards in `validateCreateSaleInput`; `SaleRecord.latitude?/longitude?` |
| `apps/api/src/shared/domain-validators.spec.ts` | Modify | RED-first coverage: accepts omitted pair, accepts a valid pair, rejects a lone coordinate, rejects out-of-range values |
| `apps/api/src/sales/sales.service.ts` | Modify | `createSale` maps both fields through; `updateSale` is changed to persist `existing.latitude`/`existing.longitude` unconditionally, ignoring `input.latitude`/`input.longitude`; `toSaleRecord` maps both fields |
| `apps/api/src/sales/sales.service.spec.ts` | Modify | RED-first coverage: create stores a valid pair, create stores `null`/`null` when omitted; update never changes a previously-stored pair regardless of the request body, including the "never captured, stays null" case |
| `apps/api/src/sales/sales.controller.ts` | Unchanged | No route changes |
| `apps/driver-app/package.json` | Modify | Add `expo-location` (installed via `npx expo install expo-location` at apply time) |
| `apps/driver-app/app.json` | Unchanged | No plugin config this phase (Decision #8) |
| `apps/driver-app/src/screens/NewSaleScreen.tsx` | Modify | `Location.requestForegroundPermissionsAsync()` + timeout-guarded `getCurrentPositionAsync()` inside `saveSale()`; conditional spread into the payload, mirroring the existing `containerReturned`/`paymentProofRef` pattern |
| `apps/driver-app/src/screens/NewSaleScreen.test.tsx` | Modify | Coverage for granted+fix, denied, and timeout paths, asserting the payload does/doesn't include `latitude`/`longitude` accordingly |
| *(Not this phase)* `apps/api/src/sales/sales.service.ts` (`recordEmptyVisit`) | Deferred | Follow-up if Open Question 2 resolves "yes": add `latitude?/longitude?` to `RecordEmptyVisitInput` and thread through the isolated `prisma.sale.create` call, same shape as this phase's `createSale` change |

### Interfaces

```ts
// packages/shared/src/domain.ts
export type CreateSaleInput = {
  /* ...existing fields... */
  latitude?: number;
  longitude?: number;
};

export type SaleRecord = {
  /* ...existing fields... */
  latitude?: number;
  longitude?: number;
};

// validateCreateSaleInput gains:
//   if ((input.latitude !== undefined) !== (input.longitude !== undefined)) {
//     errors.push('latitude and longitude must be provided together');
//   }
//   if (input.latitude !== undefined && (input.latitude < -90 || input.latitude > 90)) {
//     errors.push('latitude must be between -90 and 90');
//   }
//   if (input.longitude !== undefined && (input.longitude < -180 || input.longitude > 180)) {
//     errors.push('longitude must be between -180 and 180');
//   }
// UpdateSaleInput / validateUpdateSaleInput: no direct changes -- both already
// compose over CreateSaleInput / validateCreateSaleInput for the non-churn
// branch, so a PATCH body with latitude/longitude is still *validated* if
// present (same range/pairing rules) -- it is simply never *written* by
// SalesService.updateSale (see below). Validating-but-ignoring is a
// deliberate, small inconsistency, same class already accepted for `kind`.

// apps/api/src/sales/sales.service.ts (existing methods, no new signatures)
createSale(input: CreateSaleInput, actorUsername?: string): Promise<SaleRecord>;      // unchanged signature
updateSale(id: string, input: UpdateSaleInput, actorUsername?: string): Promise<SaleRecord>; // unchanged signature;
  // input.latitude / input.longitude are present at the type level but
  // deliberately never read here -- the write always carries forward
  // existing.latitude / existing.longitude, mirroring the "kind is a hint,
  // not source of truth" precedent already applied to input.kind.
```

### Testing Strategy

`apps/api` (Jest) and `apps/driver-app` (Jest + React Native Testing Library) are both already covered projects — no new test infra needed.

| Layer | What to Test | Approach |
|---|---|---|
| Unit — validator | `validateCreateSaleInput` accepts an omitted pair; accepts a valid pair regardless of `paymentMethod`; rejects a lone coordinate; rejects out-of-range `latitude`/`longitude` | Extend `domain-validators.spec.ts`'s existing `describe('validateCreateSaleInput', ...)` block |
| Unit — service | `createSale` stores a valid pair when provided, `null`/`null` when omitted; `updateSale` never changes a previously-stored pair regardless of what the request body contains, including when the original value was already `null`/`null` | Extend `sales.service.spec.ts`'s existing Prisma-double pattern (`buildSaleRow`/`buildCreateInput` helpers already exist from phases 4/7) |
| Driver-app — component | A granted permission + successful fix includes `latitude`/`longitude` in the outgoing `CreateSaleInput`; a denied permission omits both keys and the sale still saves; a timed-out read omits both keys and the sale still saves | Extend `NewSaleScreen.test.tsx`'s existing render/interaction pattern; mock `expo-location`'s `requestForegroundPermissionsAsync`/`getCurrentPositionAsync`, following the existing `expo-image-picker` mocking convention if present |
| E2E | None this phase | Consistent with prior phases' precedent (`test/jest-e2e.json` needs live Postgres, deferred) |

Mandatory RED tests before any implementation: `createSale` persists a valid coordinate pair exactly as given and `null`/`null` when omitted; `validateCreateSaleInput` rejects a lone coordinate and out-of-range values; `updateSale` discards any client-supplied `latitude`/`longitude` and always preserves the row's original stored values (both when a value existed and when it was already `null`).

### Migration / Rollout

Single additive migration: add `latitude`/`longitude` (nullable, existing rows correctly become `null`/`null` = "no position captured," zero data movement). Deploy order: migrate, then API, matching prior phases' precedent. Rollback: revert the commit (behavior for a payload with no `latitude`/`longitude` is unchanged, so the app is exactly as it was); down-migration drops both columns unconditionally (safe — no other column or invariant depends on them).

### Resolved Open Questions

Carried from the top of this document, restated here as design-binding until the owner is reachable:

1. `latitude`/`longitude` optional everywhere; a sale always saves, with `null`/`null` on denial/no-fix/timeout.
2. `recordEmptyVisit`/churn visits are untouched this phase — location capture applies to `createSale` only.
3. Immutable after creation: `updateSale` never reads `input.latitude`/`input.longitude`, always persists the row's existing stored values.
4. App-level timeout (default 8000ms) races the location read; on timeout, treated identically to a denied permission.
5. No dashboard display this phase — API-only, `latitude`/`longitude` exposed on `SaleRecord` for phase 6's consumption.

---

## 5. Tasks

# Tasks: Point-in-Time Geolocation

### Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~310 total (schema+migration ~7, domain.ts+validator spec ~65, sales.service+spec ~95, driver-app UI+tests ~135, package.json/wiring ~8) |
| Review budget | 800 lines |
| 800-line budget risk | Low — well under budget; no chaining anticipated |
| Chained PRs recommended | No — single PR |
| Chain strategy (if needed) | N/A |

### Work Units

| Unit | Goal | Focused test command | Runtime check | Rollback boundary |
|------|------|----------------------|------------------|--------------------|
| 1 | Schema, migration, shared domain fields/validators | `pnpm --filter api test -- domain` | `pnpm --filter api exec prisma migrate dev` + `prisma generate` | Revert; nothing built on top yet |
| 2 | `sales.service.ts` create mapping + update immutability + toSaleRecord mapping + tests | `pnpm --filter api test -- sales` | `pnpm --filter api start:dev` + curl `POST /sales` with `latitude`/`longitude`, then `PATCH /sales/:id` with different values and confirm they don't change | Revert Unit 2 only; Unit 1's schema/types remain valid |
| 3 | Driver-app: `expo-location` install, permission + timeout-guarded read, wiring into `saveSale()`, tests | `pnpm --filter driver-app test -- NewSaleScreen` | Run the app, create a sale with location granted, one with it denied, confirm both save | Revert Unit 3; API from Units 1–2 remains valid without a driver-app consumer |

Unit 2 depends only on Unit 1. Unit 3 depends on Units 1–2 (needs the fields to exist and round-trip through the API).

### Phase 1: Schema, Migration & Shared Domain
- [ ] 1.1 `apps/api/prisma/schema.prisma`: add `Sale.latitude Float?`, `Sale.longitude Float?`.
- [ ] 1.2 `apps/api/prisma/migrations/<ts>_add_sale_location/migration.sql`: `ALTER TABLE "Sale" ADD COLUMN "latitude" DOUBLE PRECISION, ADD COLUMN "longitude" DOUBLE PRECISION`.
- [ ] 1.3 Run `prisma migrate dev` + `prisma generate`; confirm client types compile.
- [ ] 1.4 `packages/shared/src/domain.ts`: add `CreateSaleInput.latitude?`/`.longitude?`; add `SaleRecord.latitude?`/`.longitude?`.
- [ ] 1.5 RED: `apps/api/src/shared/domain-validators.spec.ts` — `validateCreateSaleInput` accepts an omitted pair; accepts a valid pair; rejects a lone `latitude` with no `longitude` (and vice versa) with "latitude and longitude must be provided together"; rejects `latitude: 200` with "latitude must be between -90 and 90"; rejects `longitude: -400` with "longitude must be between -180 and 180."
- [ ] 1.6 GREEN: add the pairing + range guards to `validateCreateSaleInput` to pass 1.5.

### Phase 2: Sales Service — Create, Update Immutability
- [ ] 2.1 RED: `apps/api/src/sales/sales.service.spec.ts` — `createSale` stores a valid `latitude`/`longitude` pair when provided in the payload, `null`/`null` when omitted.
- [ ] 2.2 GREEN: `apps/api/src/sales/sales.service.ts` — `createSale`'s `prisma.sale.create` data object maps `latitude: input.latitude ?? null, longitude: input.longitude ?? null`.
- [ ] 2.3 RED: `updateSale` on an existing row with a stored `latitude`/`longitude` does **not** change them even when the request body supplies different values; `updateSale` on an existing row with `latitude=null, longitude=null` (never captured) does not populate them even when the request body supplies values.
- [ ] 2.4 GREEN: in `updateSale`, add `resolvedLatitude = existing.latitude` / `resolvedLongitude = existing.longitude` (never derived from `input`); include both in the `data: {...}` write. Do **not** add them to the `beforeSnapshot`/`after` audit objects — nothing to diff, since the value never changes across an edit.
- [ ] 2.5 GREEN: `toSaleRecord` maps `latitude: sale.latitude ?? undefined, longitude: sale.longitude ?? undefined`.
- [ ] 2.6 Confirm (via existing suite, unmodified) that `recordEmptyVisit`'s tests still pass with zero changes — proves the fields correctly never reach the churn-creation path.

### Phase 3: Driver-App — Location Capture
- [ ] 3.1 `apps/driver-app/package.json`: add `expo-location` (`npx expo install expo-location` at apply time, so the resolved version matches the installed Expo SDK 57 toolchain).
- [ ] 3.2 RED: `apps/driver-app/src/screens/NewSaleScreen.test.tsx` — a granted permission with a successful fix includes `latitude`/`longitude` (mocked `Location.getCurrentPositionAsync` return values) in the outgoing `CreateSaleInput`; a denied permission (mocked `{ granted: false }`) omits both keys and the sale still saves successfully; a fix that never resolves before the mocked timeout omits both keys and the sale still saves successfully.
- [ ] 3.3 GREEN: `apps/driver-app/src/screens/NewSaleScreen.tsx` — inside `saveSale()`, call `Location.requestForegroundPermissionsAsync()`; on `.granted`, race `Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })` against a fixed `LOCATION_TIMEOUT_MS` (default 8000) timeout helper; on a successful reading, conditionally spread `{ latitude, longitude }` into the payload (same pattern as `containerReturned`/`paymentProofRef`); on denial or timeout, proceed with the payload unchanged (no new keys).
- [ ] 3.4 Confirm no new offline-queue wiring was needed — the fields ride the existing `trySendSale`/`enqueueSale` payload, same as every other `CreateSaleInput` field.

### Phase 4: Verification
- [ ] 4.1 Run `pnpm --filter api test` (all suites green, including unmodified `recordEmptyVisit`/churn-creation suites).
- [ ] 4.2 Run `pnpm --filter driver-app test` (all suites green).
- [ ] 4.3 Manual smoke: create a sale with location granted and a fix available, verify `GET /sales/mine` returns `latitude`/`longitude`; edit that sale (any other field) and confirm `latitude`/`longitude` are unchanged afterward; create a second sale with the permission denied, verify it saves with both fields `null`.

### Notes
- No threat-matrix rows apply (design: N/A — no routing/shell/subprocess/VCS boundary; this phase explicitly excludes routing/navigation per the binding roadmap decision).
- Open Questions 1–5 (top of document) are design-binding assumptions, not confirmed answers — re-confirm with the owner before `sdd-apply` if there is any opportunity to do so; none of them block starting any phase above, since all five resolve toward the more permissive, easier-to-tighten-later option. Open Question 4 (the exact timeout duration) is the most likely to need real-world tuning once field data on GPS-fix latency exists.

---

## Next Step

Run `sdd-apply` for Unit 1 (schema, migration, shared domain fields/validators) once implementation starts. Strict TDD Mode is active for `apps/api` — every GREEN task must be preceded by a failing RED test. Before starting, flag Open Questions 1–5 to the owner one more time if they become reachable; none currently block any phase, but Phase 3 (driver-app UX — the app's first hardware-permission prompt at sale-confirmation time) is where a wrong assumption about Open Question 1 (mandatory vs. optional) would be most visible to drivers day-to-day, and Phase 6 (customer picker + proximity suggestion) is blocked on this phase's `latitude`/`longitude` fields existing and being populated in practice, not just in the schema.
