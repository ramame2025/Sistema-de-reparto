# Change: Visit/Container Model

**Phase**: 4 of 9 ([roadmap](./README.md))
**SDD artifact store**: Engram (project `sistema-de-reparto`, topic keys `sdd/visit-container-model/*`)
**Status**: Planned — explore/proposal/spec/design/tasks complete, not yet implemented.

## Session Preflight (applies to this change)

- Pace: `auto` (phases run back-to-back; orchestrator gate-validates each result before launching the next)
- Artifact store: `engram`
- Delivery strategy: `ask-on-risk`
- Review budget: 800 changed lines
- Chain strategy: not pre-committed — forecast (Tasks §) puts this change close to but likely under budget; final call deferred to real diff size at apply time

## Business Decisions Confirmed by the Owner

Only one decision for this phase was made at roadmap level (binding, not re-litigated here):

| Decision | Chosen |
|---|---|
| Container/churn event modeling | Extension of `Sale` (quantity 0, no payment method, `containerReturned` flag) rather than a separate `Visit` entity, to reuse the existing `SaleAudit` audit/history infrastructure |

## Open Questions (Owner Unavailable — Conservative Assumptions Applied)

The owner was not available to resolve these before planning. Each was given the most conservative/reversible assumption — the one that adds the least new mandatory behavior and is cheapest to tighten later if the real answer turns out stricter. All five are carried forward as explicit "Resolved Open Questions" in the Design section too, and must be re-confirmed with the owner before `sdd-apply` starts.

| # | Question | Conservative assumption taken | Why reversible |
|---|---|---|---|
| 1 | Does `containerReturned` apply to every sale, or only to the churn case? | Add it to every `Sale` as an **optional**, nullable boolean. Driver-app UI can start sending it once a checkbox exists; omitting it stays valid (`null` = "not asked"). Only the churn action forces it to `true`. | Turning it into a required field later is a one-line validator tightening. Requiring it today and walking it back is not — old clients would need a compatibility shim. |
| 2 | How is a "normal sale + container returned" distinguished from "churn" (container returned + nothing delivered) from a plain sale? | Explicit discriminant column `kind: SaleKind` (`'sale' \| 'churn'`, default `'sale'`) set **server-side only**, never inferred from `items.length === 0`. | Inferring from item count is not reversible without a backfill once mixed data exists (e.g., an admin editing a real sale's quantities down to fix a mistake must never look like churn). An explicit flag can always be loosened into an inferred one later; the reverse can't. |
| 3 | Does churn require an identified `Customer` (`customerId`), or can it use free-text `customerName` like a normal sale does today? | Same rule as today's `CreateSaleInput`: `customerName` free text required, `customerId` optional FK. No new requirement introduced. | Requiring `customerId` later is an additive tightening. Requiring it now and discovering the field can't always identify who returned the container would block recording real churn events. |
| 4 | Can a churn record be edited/canceled through the same `PATCH /sales/:id` and `PATCH /sales/:id/cancel` as a normal sale? | Yes, same endpoints. Cancel needs no change (only validates `reason`). Edit needs the existing generic validator to become kind-aware (see Design §3). | Building a third, churn-only edit/cancel endpoint pair without a confirmed need is the harder-to-reverse move (more surface to deprecate later). Reusing the generic endpoints and restricting them later if the owner wants churn records locked is the smaller change. |
| 5 | Does this phase need distinct dashboard reporting for churn? | No — out of scope, per roadmap phase 8 ("Live dashboard"). This phase only guarantees `kind`/`containerReturned` are persisted and exposed on `SaleRecord`, ready for phase 8 to consume. | Explicitly deferred by the roadmap itself; nothing to reverse. |

---

## 1. Explore

## Exploration: visit-container-model

### Current State

**Shared domain contract** (`packages/shared/src/domain.ts`):
- `CreateSaleInput` (lines 45–56) declares `paymentMethod: PaymentMethod` as a **non-optional** TypeScript field — a churn payload with no payment method would not type-check against today's shape.
- `validateCreateSaleInput` (lines 224–279) unconditionally: (a) checks `PAYMENT_METHODS.includes(input.paymentMethod)` — `undefined` fails this check and pushes an error, (b) requires `Array.isArray(input.items) && input.items.length > 0` — an empty-items churn payload fails this check too. Both checks run for every call, no branch exists today.
- `validateUpdateSaleInput` (lines 281–289) is `validateCreateSaleInput(input)` plus a `reason` check — it **inherits both unconditional checks**, so editing an existing churn row through the generic update path would hit the same wall.
- `SaleRecord` (lines 62–76) has no concept of `kind` or `containerReturned` today.

**Prisma schema** (`apps/api/prisma/schema.prisma` lines 62–86): `Sale.paymentMethod PaymentMethod` is a **NOT NULL** scalar column — a real DB-level constraint, not just an app-level one. `Sale.total Int` is NOT NULL but `0` is a valid `Int`, so "quantity 0" alone does not require a schema change. `items` is a `SaleItem[]` relation, not a scalar — an empty array is DB-legal; only the app validator blocks it.

**Confirmed: three independent layers block "quantity 0, no payment method" today** — the TS type, the runtime validator (both create and, via inheritance, update), and (see below) the driver-app client-side guard. Making `paymentMethod` nullable in Postgres alone would not be enough; the shared validator and the driver-app guard would still reject the payload.

**`apps/api/src/sales/sales.service.ts`**: `createSale` (100–148) and `updateSale` (150–236) both write `paymentMethod: input.paymentMethod as PrismaPaymentMethod` unconditionally and both route through the single `resolveCustomerAndTruck` + `calculateSaleTotal` pipeline — there is exactly one create path and one update path today, no branching by intent.

**`apps/api/src/sales/sales.controller.ts`**: `createSale` (54–62) and `updateSale` (65–74) call `validateCreateSaleInput`/`validateUpdateSaleInput` in the **controller**, before the service is invoked, and before any DB lookup of the target `Sale` row. This ordering matters for Design §3 below: at validation time, for an *update*, the controller does not yet know the existing row's `kind`.

**`SaleAudit`** (schema 98–109; service: create at 137–142, edit at 210–230, cancel at 258–269): every mutating operation on `Sale` already writes a `SaleAudit` row (`action`, `reason`, `before`/`after` JSON snapshots for edit/cancel). This is generic over whatever fields `Sale` has — it required zero new code to cover `Customer`/`Truck` linkage in phase 1, and requires zero new code to cover `kind`/`containerReturned` here. **This confirms the roadmap's stated rationale** for extending `Sale` instead of building a `Visit` entity: the audit trail comes for free only because it's the same table. Note in passing: `SaleAuditRecord` (domain.ts 84–90) exposes only `id/saleId/action/reason/createdAt` — the `before`/`after` snapshots are persisted but not returned by `listSaleAudits`/`toAuditRecord` (sales.service.ts 313–321) today. Pre-existing behavior, unrelated to this phase, not changed here.

**`apps/driver-app/src/screens/NewSaleScreen.tsx`**: a single "Guardar venta" button (288–296) builds one `CreateSaleInput` and calls `trySendSale`/`enqueueSale` (offline-queue-aware, from `SyncContext`). Client-side, `saveSale` (100–141) blocks empty `items` **before even calling the API** (121–124: `if (payload.items.length === 0) { showMessage(...); return; }`). There is no existing UI concept of "record a visit without a sale" — recording churn needs either a new mode inside this screen or a new action entirely; nothing today distinguishes "I have nothing to sell" from "I forgot to add items."

### Affected Areas

- `apps/api/prisma/schema.prisma` — new `SaleKind` enum; `Sale` gains `kind` (default `sale`), `containerReturned` (nullable boolean); `paymentMethod` becomes nullable.
- `apps/api/prisma/migrations/` — one additive migration (new enum, new columns, `DROP NOT NULL` on `paymentMethod`; no data loss, every existing row already has a payment method).
- `packages/shared/src/domain.ts` — `SALE_KINDS`/`SaleKind`; `CreateSaleInput` gains optional `containerReturned`; new `RecordEmptyVisitInput` + `validateRecordEmptyVisitInput`; `UpdateSaleInput` gains optional `kind` (validation hint only, see Design §3); `SaleRecord` gains `kind`/`containerReturned`.
- `apps/api/src/sales/sales.service.ts` — new `recordEmptyVisit()` method (own create path, does not touch `createSale`); `updateSale()` gains a kind-consistency guard; `toSaleRecord` maps the two new fields.
- `apps/api/src/sales/sales.controller.ts` — new `POST /sales/empty-visit` endpoint.
- `apps/driver-app/src/screens/NewSaleScreen.tsx` — `containerReturned` control on the normal sale form; new, separate action ("Registrar visita sin venta") wired to the new endpoint, reusing the existing offline-queue plumbing (`SyncContext.trySendSale`/`enqueueSale` pattern) so churn recording works without signal, same as sales do today.
- `apps/dashboard` (`admin/reportes/page.tsx`, `lib/kpis.*`) — both already read `sale.paymentMethod`; a churn row will have `paymentMethod: null`. Out of scope for reporting features (Open Question 5 / roadmap phase 8), but any rendering must not crash on `null` — a defensive null-check, not a feature, is in scope if the existing code doesn't already guard it.

### Approaches

Two ways to reconcile "every `Sale` needs a `paymentMethod`" with "churn is a `Sale` with no `paymentMethod`" were compared, plus the already-rejected `Visit` entity:

**A — Overload the existing `CreateSaleInput`/`validateCreateSaleInput` with a discriminant.** Add `kind` to `CreateSaleInput` itself; `validateCreateSaleInput`/`updateSale` branch internally to skip the `paymentMethod`/`items` checks when `kind === 'churn'`. Reuses `POST`/`PATCH /sales` as-is, no new endpoint.
- *Pros*: single code path, minimal new files.
- *Cons*: injects conditional branches directly into `createSale`/`validateCreateSaleInput` — the highest-traffic write path in the app, and the one piece of `sales.service.ts` that phase 1 specifically added test coverage for (13 tests, previously zero). Every future change to normal-sale creation now has to reason about two divergent shapes threaded through one function.

**B — Isolate churn creation in a new, narrow action; only touch `updateSale` where unavoidable.** Add `kind`/`containerReturned` to the `Sale` row regardless (needed either way for storage/reporting), but route churn *creation* through a dedicated `recordEmptyVisit()` service method + `validateRecordEmptyVisitInput` validator + `POST /sales/empty-visit` endpoint — a small, self-contained function that hardcodes `kind: 'churn'`, `paymentMethod: null`, `items: []`, `total: 0`, `containerReturned: true` server-side. `createSale`/`validateCreateSaleInput` are **not touched at all**. Only `updateSale` (editing an *existing* row of either kind through the one generic `PATCH /sales/:id`) needs to become kind-aware, because there is no separate edit endpoint per kind.
- *Pros*: the well-tested, highest-traffic create path is provably unchanged (zero new branches, zero behavior change for normal sales); matches the driver-app UX need for a visibly separate action ("Registrar visita sin venta" is a different button, not a hidden mode switch on "Guardar venta").
- *Cons*: a second, small Sale-creating code path to keep in sync if the row shape changes later; some duplication between `validateCreateSaleInput`'s identity-field checks (`customerName`, `driverName`, `customerType`, id formats) and `validateRecordEmptyVisitInput`'s (~15 lines, judged acceptable rather than extracting a shared helper prematurely).

**C — Separate `Visit` entity (rejected, not re-evaluated here).** Already rejected at roadmap level: would require its own audit/history plumbing duplicating what `SaleAudit` already provides for `Sale` — the entire reason this phase extends `Sale` instead.

**Recommendation: B.** It is the less invasive path specifically because it leaves `createSale`/`validateCreateSaleInput` untouched — the one part of this subsystem carrying real test coverage and real production traffic — and it maps naturally onto the driver-app's actual UX need for a distinct, deliberate action rather than an easy-to-mis-tap mode toggle on the normal save button.

### Risks

- `paymentMethod` becoming nullable is a real, if additive, Prisma migration (`DROP NOT NULL`) — safe for existing data (every row already has a value) but must be captured precisely in Design/Tasks; not applied by this planning document.
- `updateSale`/its validator still need to become kind-aware (Approach B does not eliminate this, only shrinks its surface to update alone) — see Design §3 for the specific mechanism, since the controller validates *before* it has looked up the existing row's `kind`, and trusting a client-supplied `kind` blindly would repeat the exact "trust the client" mistake phase 1 explicitly rejected for `customerType` (design decision #6 there: "FK wins... [rejected] Trust client payload").
- No existing UI/interaction pattern in `NewSaleScreen.tsx` for "a save action that doesn't require items" — the new action is new UX, not a copy of an existing pattern; flagged as needing explicit driver-app design (Design §5), not assumed.
- `containerReturned` scope (Open Question 1) and the discriminant's necessity (Open Question 2) were unresolved without the owner; conservative assumptions taken above, must be re-confirmed before `sdd-apply`.
- Dashboard (`admin/reportes/page.tsx`, `lib/kpis.*`) already reads `sale.paymentMethod`; a churn row surfacing `null` there must not crash rendering, even though building real churn reporting is explicitly deferred to phase 8.

---

## 2. Proposal

# Proposal: Visit/Container Model

### Intent

Drivers today can only record a completed sale — every `Sale` requires items and a payment method. The business needs two more things captured on the same visit record: whether an empty container/cylinder was received back from the customer, and the specific case where a customer returns an empty container but buys nothing (a churn signal the business wants visible, not silently dropped as "no sale today"). Per the binding roadmap decision, both are modeled as extensions of `Sale`, not a new entity, specifically to inherit the existing `SaleAudit` history/audit trail for free. Success = a driver can mark "container returned: yes/no" on a normal sale, and can separately record a churn visit (container returned, nothing delivered) that shows up in `Sale`/`SaleAudit` exactly like any other sale for every downstream consumer (edit, cancel, audit list) — with zero behavior change to the existing normal-sale create path.

### Scope

**In Scope**
- Prisma: new `SaleKind` enum (`sale`, `churn`); `Sale.kind` (default `sale`); `Sale.containerReturned` (nullable boolean); `Sale.paymentMethod` becomes nullable (DB-level, matching the churn case).
- `packages/shared/src/domain.ts`: `SALE_KINDS`/`SaleKind` type; `CreateSaleInput.containerReturned?: boolean` (optional, per Open Question 1); new `RecordEmptyVisitInput` type + `validateRecordEmptyVisitInput`; `UpdateSaleInput.kind?: SaleKind` (validation hint only — see Design §3, never trusted as sole source of truth); `SaleRecord.kind`/`SaleRecord.containerReturned`.
- `apps/api/src/sales/sales.service.ts`: new `recordEmptyVisit()` method — own `prisma.sale.create` call, own `SaleAudit` row (`action: created`), forces `kind: 'churn'`, `paymentMethod: null`, `items: []`, `total: 0`, `containerReturned: true`; `createSale`/`validateCreateSaleInput` unchanged; `updateSale()` gains a kind-consistency guard (Design §3) so editing a churn row through the generic `PATCH /sales/:id` still works without weakening validation for normal sales.
- `apps/api/src/sales/sales.controller.ts`: new `@Roles('admin', 'chofer') POST /sales/empty-visit`.
- `apps/driver-app/src/screens/NewSaleScreen.tsx`: `containerReturned` toggle on the existing sale form; new, visually separate "Registrar visita sin venta" action, wired through the same offline-queue pattern (`trySendSale`/`enqueueSale`-equivalent) the sale flow already uses.
- Jest tests in `apps/api` (validators + `SalesService` + `SalesController` wiring) and `apps/driver-app` (`NewSaleScreen`) for every new path, strict TDD.

**Out of Scope**
- A separate `Visit` entity (rejected at roadmap level).
- Distinct dashboard/reporting UI for churn (roadmap phase 8) — this phase only makes `kind`/`containerReturned` land on `Sale` and appear on `SaleRecord`.
- Backfilling `kind`/`containerReturned` on historical rows (default `kind='sale'`, `containerReturned=null` is correct for all existing history — "not asked" is the accurate historical statement, not "false").
- Point-in-time geolocation on the churn visit (roadmap phase 5, not yet built for normal sales either).
- Requiring `customerId` for churn (Open Question 3 — free text stays valid, same as normal sales).
- A third, churn-specific edit/cancel endpoint pair (Open Question 4 — the generic `PATCH /sales/:id` / `PATCH /sales/:id/cancel` are reused).

### Capabilities

**New**: `container-visit-recording` (the churn action).
**Modified**: `sale-recording` — normal sales gain an optional `containerReturned` field; editing any `Sale` (of either `kind`) through `PATCH /sales/:id` becomes kind-aware without loosening validation for normal sales.

### Approach

Additive wherever possible. `Sale` gains three columns, none of which change the meaning or requiredness of any existing column for existing rows (`kind` defaults to `'sale'`, so every historical row is auto-classified correctly with zero backfill; `containerReturned` is nullable so "unknown/not asked" is representable for history). The one genuinely new mechanism is `recordEmptyVisit()`, a narrow, isolated create path that never shares code with `createSale` beyond the `Prisma`/`SaleAudit` primitives both already use. The one unavoidable touch to shared logic is `updateSale`, scoped to a single consistency check (Design §3) rather than a validator rewrite.

### Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/prisma/schema.prisma` | Modified | New `SaleKind` enum; `Sale.kind`, `Sale.containerReturned` added; `Sale.paymentMethod` becomes nullable |
| `apps/api/prisma/migrations/` | New | One additive migration, no data loss, no backfill needed |
| `packages/shared/src/domain.ts` | Modified | New enum/type/validator for the churn input; additive fields on `CreateSaleInput`/`UpdateSaleInput`/`SaleRecord` |
| `apps/api/src/sales/sales.service.ts` | Modified | New `recordEmptyVisit()`; `updateSale()` gains a kind-consistency guard; `createSale()` unchanged except mapping the new optional field through |
| `apps/api/src/sales/sales.controller.ts` | Modified | New `POST /sales/empty-visit` route |
| `apps/driver-app/src/screens/NewSaleScreen.tsx` | Modified | New field + new action, reusing existing offline-queue plumbing |
| `apps/dashboard` | Unchanged (defensive only) | Must not crash on `paymentMethod: null`; no new reporting UI this phase |

### Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `updateSale` validator becoming kind-aware regresses normal-sale editing | Medium | Guard lives in the service (post-DB-lookup, re-verified against the stored `kind`), not in the pure shared validator's default branch; normal-sale edit path keeps its existing unconditional checks |
| Driver taps "Registrar visita sin venta" by mistake, silently recording a false churn signal | Medium | Distinct button, distinct confirmation copy (Design §5); not a checkbox on the existing save flow |
| Offline-queue support for the new action is skipped, breaking field usage without signal | Medium | Explicitly in scope (Proposal §Scope); reuses the same `SyncContext` pattern already proven for sales |
| Dashboard crashes or shows confusing blanks for `paymentMethod: null` before phase 8 lands real reporting | Low | Defensive null-check only, verified in Tasks acceptance, not a feature build |
| Assumptions taken for Open Questions 1–4 turn out wrong once the owner is reachable | Medium | All four were chosen as the cheapest-to-tighten-later option; flagged explicitly for re-confirmation before `sdd-apply` |

### Rollback Plan

All schema changes are additive (`DROP NOT NULL` is the only relaxation, and it only loosens a constraint — no existing data violates the new, looser rule). Roll back by: (1) reverting the API/shared commits — `createSale`/normal-sale editing are unchanged by Approach B, so a revert restores exactly today's behavior; (2) down-migration re-adds `NOT NULL` on `paymentMethod` (safe only if no churn rows exist yet — call out explicitly in the migration's rollback note) and drops the two new columns/enum. No historical `Sale` row is touched by the up-migration, so rollback is lossless for pre-existing data.

### Success Criteria

- [ ] `POST /sales` (normal sale) behaves exactly as today when `containerReturned` is omitted; behaves identically otherwise except the new field is stored.
- [ ] `POST /sales/empty-visit` creates a `Sale` with `kind='churn'`, `paymentMethod=null`, `total=0`, no `SaleItem` rows, `containerReturned=true`, and a `SaleAudit` row with `action='created'` — using the exact same audit mechanism as a normal sale.
- [ ] `PATCH /sales/:id` on a churn row succeeds without requiring `paymentMethod`/`items`; on a normal-sale row, behavior is completely unchanged (still requires both).
- [ ] `PATCH /sales/:id/cancel` works unchanged for both kinds (no code touches this method).
- [ ] Non-admin/non-chofer callers get 403 on the new endpoint, same as `POST /sales`.
- [ ] Jest suite in `apps/api` and `apps/driver-app` covers every new/changed path and passes.

---

## 3. Spec

# Spec: Visit/Container Model

### Domain: container-visit-recording (New)

**Requirement: Record a churn visit as a `Sale` with no items and no payment method**
The system MUST allow an authenticated `admin` or `chofer` to record a churn visit (container returned, nothing delivered) via a dedicated action that creates a `Sale` row with `kind='churn'`, `paymentMethod=null`, `total=0`, zero `SaleItem` rows, and `containerReturned=true`, all set server-side regardless of any client-supplied value for those fields. Identity fields (`customerName`, `driverName`, `customerType`, optional `customerId`/`truckId`/`truckCode`) MUST follow the same validation rules as a normal sale's identity fields.

- *Scenario: Chofer records a churn visit* — GIVEN an authenticated chofer with a customer name and type, WHEN they submit a churn-visit request with no items and no payment method, THEN the system creates a `Sale` with `kind='churn'`, `total=0`, `paymentMethod=null`, `containerReturned=true`, and zero `SaleItem` rows.
- *Scenario: Non-driver-app fields are ignored, not required* — GIVEN a churn-visit request with no `items` and no `paymentMethod` fields at all, WHEN it is submitted, THEN the request is accepted (unlike `POST /sales`, which would reject it).
- *Scenario: Identity validation still applies* — GIVEN a churn-visit request with a 1-character `customerName`, WHEN it is submitted, THEN the system rejects it with the same "customerName must have at least 2 characters" error a normal sale would produce.

**Requirement: Churn visit inherits the audit trail automatically**
Creating a churn visit MUST produce a `SaleAudit` row with `action='created'`, using the exact same mechanism `createSale` already uses — no new audit code path.

- *Scenario: Audit row created alongside the churn Sale* — GIVEN a churn visit is recorded, WHEN the request completes, THEN `GET /sales/:id/audits` for that id returns one audit entry with `action='created'`.

**Requirement: Non-admin/non-chofer callers rejected**
`POST /sales/empty-visit` MUST require the same roles as `POST /sales` (`admin`, `chofer`).

- *Scenario: Unauthorized role rejected* — GIVEN a caller with neither `admin` nor `chofer` role, WHEN they call the endpoint, THEN the system returns 403 and creates nothing.

### Domain: sale-recording (Modified)

**Requirement: Optional `containerReturned` on a normal sale**
`POST /sales` and `PATCH /sales/:id` MUST accept an optional `containerReturned: boolean`. Omitting it MUST behave exactly as before this change (stored as `null`, meaning "not asked"). *(Previously: no such field existed.)*

- *Scenario: Sale without `containerReturned` unchanged* — GIVEN a payload with no `containerReturned` field, WHEN the sale is created, THEN it succeeds exactly as before, `containerReturned` stored as `null`.
- *Scenario: Sale with `containerReturned` recorded* — GIVEN a payload with `containerReturned: true`, WHEN the sale is created, THEN the stored `Sale.containerReturned` is `true`.

**Requirement: Editing a churn row via the generic update endpoint**
`PATCH /sales/:id` MUST allow editing a `Sale` whose stored `kind` is `'churn'` without requiring `paymentMethod`/`items`, while continuing to require both unconditionally for a `Sale` whose stored `kind` is `'sale'`. The kind used for this decision MUST be the row's **stored** `kind`, never a client-supplied value alone — if a client-supplied `kind` hint (see Design §3) disagrees with the stored value, the system MUST reject the request rather than silently trusting either side. *(Previously: `validateUpdateSaleInput` unconditionally required both for every `Sale`.)*

- *Scenario: Editing a churn row succeeds without items/payment* — GIVEN an existing `Sale` with `kind='churn'`, WHEN it is edited with no `items` and no `paymentMethod`, THEN the edit succeeds and a `SaleAudit` row with `action='edited'` is created, same as any other edit.
- *Scenario: Editing a normal sale is unchanged* — GIVEN an existing `Sale` with `kind='sale'`, WHEN it is edited with no `items`, THEN the system rejects it with "items must include at least one product", exactly as today.
- *Scenario: Kind-mismatch rejected* — GIVEN an existing `Sale` with `kind='sale'`, WHEN a `PATCH /sales/:id` request is sent claiming `kind='churn'`, THEN the system rejects the request without applying any change.

**Requirement: Canceling a churn row is unchanged**
`PATCH /sales/:id/cancel` MUST work identically for both `kind` values — this requirement exists to make explicit that **no code change is needed** here, since `cancelSale` only ever reads `input.reason`.

- *Scenario: Cancel a churn row* — GIVEN an existing `Sale` with `kind='churn'` and `status='active'`, WHEN it is canceled with a valid reason, THEN `status` becomes `'canceled'` and a `SaleAudit` row with `action='canceled'` is created, identically to canceling a normal sale.

---

## 4. Design

# Design: Visit/Container Model

### Technical Approach

Three new/changed Prisma columns on `Sale` (all additive or loosening). One new, fully isolated NestJS service method + controller route for churn creation, deliberately kept separate from `createSale`/`validateCreateSaleInput` so the existing, tested normal-sale path has zero new branches. One small, deliberately server-derived consistency check added to `updateSale` so the single generic `PATCH /sales/:id` can serve both kinds without ever trusting a client's claim about which kind it's editing.

### Architecture Decisions

| # | Decision | Choice | Rejected | Rationale |
|---|---|---|---|---|
| 1 | Where churn creation lives | New `recordEmptyVisit()` method + new endpoint, isolated from `createSale` | Branch inside `createSale`/`validateCreateSaleInput` (Approach A) | Keeps the highest-traffic, only-recently-tested write path (13 tests added in phase 1) provably unchanged; matches the driver-app's need for a visibly distinct action |
| 2 | Discriminant field | Explicit `kind: SaleKind` (`'sale'` \| `'churn'`), default `'sale'`, set server-side on create, never client-trusted alone on update | Infer "churn" from `items.length === 0` | An inferred signal is not reversible once mixed data exists (an admin correcting a sale's quantities to zero-then-back must never be misread as churn); an explicit flag can be relaxed into inference later, not the other way around |
| 3 | How `updateSale` becomes kind-aware without moving DB lookups before validation | `UpdateSaleInput` gains an optional `kind` field used **only** as a validation hint (skip `paymentMethod`/`items` checks in the pure shared validator when `kind==='churn'`); `updateSale()` in the service, immediately after loading `existing` (same place the existing `status==='canceled'` check already lives, `sales.service.ts` line ~160), asserts `existing.kind === (input.kind ?? 'sale')` and throws `ConflictException` on mismatch **before** proceeding | (a) Give the pure validator DB access to look up the real kind itself; (b) reorder the controller to look up the row before validating | (a) breaks the established layering — every `validate*Input` function in `packages/shared` is pure/DB-free by convention, and `resolveCustomerAndTruck`'s FK-existence checks already establish that "business rules needing DB access belong in the service, not the validator"; (b) is a bigger structural change to the controller/service call order for a narrow problem. This option is the same "trust but verify" shape already used for `status==='canceled'` — smallest diff, no new architectural pattern |
| 4 | `containerReturned` requiredness on normal sales | Optional/nullable everywhere except forced `true` on churn | Required on every new sale from day one | Matches Open Question 1's conservative assumption — no forced rollout dependency on the driver-app UI landing first |
| 5 | `paymentMethod` nullability | `DROP NOT NULL` at the DB level, paired with the app-level guarantee (via decision #1) that only `recordEmptyVisit()` ever writes `null` | Sentinel `PaymentMethod` value (e.g. `'ninguno'`) to keep the column NOT NULL | A sentinel pollutes an enum that otherwise represents *how someone paid*; `null` correctly means "no payment occurred," which is the actual business fact for a churn visit |
| 6 | Endpoint shape for churn creation | `POST /sales/empty-visit`, same controller, same role guard as `POST /sales` | A query param or body flag on `POST /sales` (Approach A's endpoint-level twin) | Consistent with decision #1: a separate route makes the isolation visible in the API surface, not just in the service internals |

### Prisma Schema (additive changes to the existing `Sale` model)

```prisma
enum SaleKind {
  sale
  churn
}

model Sale {
  // ...existing fields unchanged...
  paymentMethod     PaymentMethod? // was: PaymentMethod (NOT NULL) — now nullable
  kind              SaleKind       @default(sale)
  containerReturned Boolean?

  @@index([kind, createdAt]) // forward-compat for phase 8 reporting; cheap to add now
}
```

No existing column is dropped, renamed, or made required. `total Int` and the `SaleItem[]` relation need no schema change — `total=0` is already a valid `Int`, and an empty items relation is already DB-legal; only the app-level validator blocked it, not the schema.

### Data Flow

```
POST /sales (unchanged path)
  -> SalesController.createSale -> validateCreateSaleInput (unchanged)
  -> SalesService.createSale (unchanged, containerReturned now flows through as an extra field)

POST /sales/empty-visit (new, isolated path)
  -> SalesController.recordEmptyVisit -> validateRecordEmptyVisitInput (new, no payment/items checks)
  -> SalesService.recordEmptyVisit
       |- resolveCustomerAndTruck-equivalent (customerId?/truckId? existence+active checks, reused logic)
       `- prisma.sale.create({ kind: 'churn', paymentMethod: null, total: 0, containerReturned: true,
                                items: { create: [] }, audits: { create: { action: created, reason: 'Visita sin venta' } } })

PATCH /sales/:id (shared path, both kinds)
  -> SalesController.updateSale -> validateUpdateSaleInput(input)  // skips payment/items iff input.kind === 'churn'
  -> SalesService.updateSale
       |- load existing
       |- assert existing.kind === (input.kind ?? 'sale')  -> ConflictException on mismatch  [NEW]
       `- ...rest unchanged (total/customerType/customerName resolution, SaleAudit 'edited')

PATCH /sales/:id/cancel  -> unchanged, no code touches kind/paymentMethod/items
```

### File Changes

| File | Action | Description |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Modify | `SaleKind` enum; `Sale.kind`, `Sale.containerReturned`; `Sale.paymentMethod` nullable; new index |
| `apps/api/prisma/migrations/<ts>_add_visit_container_model/migration.sql` | Create | `CREATE TYPE "SaleKind"`, `ALTER TABLE "Sale" ADD COLUMN`, `ALTER COLUMN "paymentMethod" DROP NOT NULL` |
| `packages/shared/src/domain.ts` | Modify | `SALE_KINDS`/`SaleKind`; `CreateSaleInput.containerReturned?`; `RecordEmptyVisitInput` + `validateRecordEmptyVisitInput`; `UpdateSaleInput.kind?`; `validateUpdateSaleInput` branch; `SaleRecord.kind`/`.containerReturned` |
| `apps/api/src/sales/sales.service.ts` | Modify | New `recordEmptyVisit()`; `updateSale()` kind-consistency guard; `toSaleRecord` maps `kind`/`containerReturned`; `createSale` passes `containerReturned` through untouched otherwise |
| `apps/api/src/sales/sales.service.spec.ts` | Modify | RED-first coverage for `recordEmptyVisit`, the kind-mismatch guard, and churn-row editing |
| `apps/api/src/sales/sales.controller.ts` | Modify | New `POST /sales/empty-visit`, `@Roles('admin', 'chofer')` |
| `apps/api/src/sales/sales.controller.spec.ts` | Modify | Role-guard + wiring test for the new route |
| `apps/driver-app/src/screens/NewSaleScreen.tsx` | Modify | `containerReturned` control on the normal form; new "Registrar visita sin venta" action, own confirmation copy, reuses `SyncContext` offline-queue pattern |
| `apps/driver-app/src/screens/NewSaleScreen.test.tsx` | Modify | Coverage for the new control and the new action, including the offline-queue path |
| `apps/dashboard/src/app/admin/reportes/page.tsx`, `apps/dashboard/src/lib/kpis.ts` | Modify (defensive only) | Null-guard `paymentMethod` rendering; no new reporting feature |

### Interfaces

```ts
// packages/shared/src/domain.ts
export const SALE_KINDS = ['sale', 'churn'] as const;
export type SaleKind = (typeof SALE_KINDS)[number];

export type CreateSaleInput = {
  /* ...existing fields... */
  containerReturned?: boolean;
};

export type RecordEmptyVisitInput = {
  clientGeneratedId?: string;
  driverName: string;
  truckCode?: string;
  truckId?: string;
  customerName: string;
  customerType: CustomerType;
  customerId?: string;
  note?: string;
};

export type UpdateSaleInput = CreateSaleInput & {
  reason: string;
  kind?: SaleKind; // validation hint only — service re-verifies against the stored row, never trusts this alone
};

export type SaleRecord = {
  /* ...existing fields... */
  kind: SaleKind;
  containerReturned?: boolean;
};

export function validateRecordEmptyVisitInput(input: RecordEmptyVisitInput): string[];
// Mirrors validateCreateSaleInput's identity-field checks (customerName, driverName, customerType,
// truckCode/customerId/truckId format) with NO paymentMethod/items checks.

// apps/api/src/sales/sales.service.ts
recordEmptyVisit(input: RecordEmptyVisitInput, actorUsername?: string): Promise<SaleRecord>;
```

### Testing Strategy

`apps/api` (Jest) and `apps/driver-app` (Jest + React Native Testing Library, per existing `NewSaleScreen.test.tsx`) are both already covered projects — no new test infra needed.

| Layer | What to Test | Approach |
|---|---|---|
| Unit — validators | `validateRecordEmptyVisitInput` (new); `validateUpdateSaleInput` kind branch (changed) | Pure function assertions, mirroring existing `validateCreateSaleInput` spec style |
| Unit — service | `recordEmptyVisit` creates `kind='churn'`, `paymentMethod=null`, `total=0`, zero items, `containerReturned=true`, one `SaleAudit(created)`; `createSale` unchanged behavior with `containerReturned` passthrough; `updateSale` kind-mismatch throws `ConflictException` with no write; `updateSale` on a churn row succeeds without items/payment | Extend `sales.service.spec.ts`'s existing Prisma-double pattern (`buildSaleRow`/`buildCreateInput` helpers already exist and can be extended with a `buildChurnRow` helper) |
| Integration — controller | New route present with correct `@Roles`; existing routes' role metadata unchanged | Extend `sales.controller.spec.ts`'s `Reflect.getMetadata(ROLES_KEY, ...)` pattern already used for `listMySales` |
| Driver-app — component | `containerReturned` control toggles state and is included in the normal-sale payload when set; new action button is disabled/enabled correctly, calls the churn endpoint (or enqueues offline), and does NOT require items to be present first | Extend `NewSaleScreen.test.tsx`'s existing render/interaction pattern |
| E2E | None this phase | Consistent with phase 1's precedent (`test/jest-e2e.json` needs live Postgres, deferred) |

Mandatory RED tests before any implementation: `recordEmptyVisit` produces the exact forced shape regardless of any conflicting client input; `updateSale` rejects a kind mismatch without touching the row; `updateSale` on an existing churn row succeeds with no `items`/`paymentMethod`; `createSale`'s existing test suite (13 tests from phase 1) still passes unmodified, proving zero regression on the normal path.

### Migration / Rollout

Single additive migration: create `SaleKind` enum, add `kind` (default `sale`, backfills every existing row correctly with zero data movement), add `containerReturned` (nullable, existing rows correctly become `null` = "not asked"), `DROP NOT NULL` on `paymentMethod` (safe — no existing row has a null payment method to violate). Deploy order: migrate, then API, matching phase 1's precedent. Rollback: revert the commit (normal-sale creation/editing is provably unchanged, so the app is exactly as it was); down-migration re-adds `NOT NULL` on `paymentMethod` — safe only if no churn row has been created yet (call this out at rollback time, not assumed).

### Resolved Open Questions

Carried from the top of this document, restated here as design-binding until the owner is reachable:

1. `containerReturned` optional on normal sales, forced `true` only for churn.
2. Explicit `kind` discriminant, server-derived, never inferred from item count.
3. Churn accepts free-text `customerName`, same as normal sales; `customerId` optional.
4. Churn is edited/canceled through the existing generic `PATCH /sales/:id` / `.../cancel`.
5. No distinct dashboard reporting this phase — deferred to roadmap phase 8.

---

## 5. Tasks

# Tasks: Visit/Container Model

### Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~700 total (schema+migration ~25, domain.ts+validator specs ~115, sales.service+spec ~200, sales.controller+spec ~45, driver-app UI+sync+tests ~200, dashboard null-guard ~10, wiring/imports ~5) |
| Review budget | 800 lines |
| 800-line budget risk | Medium — likely under budget, but close enough that a single actual PR should be re-measured once `git diff --stat` is available; do not pre-commit to a single PR if it crosses ~750 |
| Chained PRs recommended | Optional — 2-way split available if needed (API vs. driver-app), not required to start |
| Chain strategy (if needed) | Sequential: PR 1 = API (schema/migration/shared types/sales service+controller+tests), PR 2 = driver-app (base PR 1's shared types) |

### Work Units

| Unit | Goal | Focused test command | Runtime check | Rollback boundary |
|------|------|----------------------|------------------|--------------------|
| 1 | Schema, migration, shared domain types/validators | `pnpm --filter api test -- domain` | `pnpm --filter api exec prisma migrate dev` + `prisma generate` | Revert; nothing built on top yet |
| 2 | `recordEmptyVisit` service + controller + tests | `pnpm --filter api test -- sales` | `pnpm --filter api start:dev` + curl `POST /sales/empty-visit` | Revert Unit 2 only; `createSale`/`updateSale` untouched by this unit |
| 3 | `updateSale` kind-consistency guard + tests | `pnpm --filter api test -- sales` | curl `PATCH /sales/:id` on a churn row and on a normal row | Revert Unit 3 only; Unit 2's create path unaffected |
| 4 | Driver-app `containerReturned` control + churn action + tests | `pnpm --filter driver-app test -- NewSaleScreen` | Run the app, submit a normal sale with the toggle, then a churn visit | Revert Unit 4; API endpoints from Units 1–3 remain valid without a driver-app consumer |
| 5 | Dashboard defensive null-guard | `pnpm --filter dashboard test -- kpis` | Load `admin/reportes` with a seeded churn row, confirm no crash | Revert Unit 5 only |

Units 2 and 3 both depend only on Unit 1. Unit 4 depends on Units 1–3 (needs both endpoints to exist). Unit 5 depends only on Unit 1 (needs `kind`/`containerReturned` on `SaleRecord`).

### Phase 1: Schema & Migration (Foundation)
- [ ] 1.1 `apps/api/prisma/schema.prisma`: add `SaleKind` enum; `Sale.kind` (default `sale`), `Sale.containerReturned` (nullable); `Sale.paymentMethod` → nullable; `@@index([kind, createdAt])`.
- [ ] 1.2 `apps/api/prisma/migrations/<ts>_add_visit_container_model/migration.sql`: `CREATE TYPE`, `ALTER TABLE "Sale" ADD COLUMN`, `ALTER COLUMN "paymentMethod" DROP NOT NULL`.
- [ ] 1.3 Run `prisma migrate dev` + `prisma generate`; confirm client types compile.

### Phase 2: Shared Types & Validators
- [ ] 2.1 `packages/shared/src/domain.ts`: add `SALE_KINDS`/`SaleKind`; `CreateSaleInput.containerReturned?`; `RecordEmptyVisitInput`; `UpdateSaleInput.kind?`; `SaleRecord.kind`/`.containerReturned`.
- [ ] 2.2 RED: validator specs (in `apps/api`) for `validateRecordEmptyVisitInput` (accepts no items/payment; still rejects short `customerName`/`driverName`, invalid `customerType`) and the `validateUpdateSaleInput` kind branch (skips payment/items iff `kind==='churn'`; unchanged otherwise).
- [ ] 2.3 GREEN: implement `validateRecordEmptyVisitInput` and the `validateUpdateSaleInput` branch to pass 2.2.

### Phase 3: Churn Visit Recording (Isolated Create Path)
- [ ] 3.1 RED: `apps/api/src/sales/sales.service.spec.ts` — `recordEmptyVisit` creates a `Sale` with `kind='churn'`, `paymentMethod=null`, `total=0`, `containerReturned=true`, zero `SaleItem` rows, and one `SaleAudit(action='created')`; forced values win even if the input tries to smuggle `items`/`paymentMethod` (TS type should already prevent this, but assert the runtime behavior too); unknown/inactive `customerId`/`truckId` still rejected via the same existence checks `createSale` uses.
- [ ] 3.2 GREEN: `apps/api/src/sales/sales.service.ts` — `recordEmptyVisit()`.
- [ ] 3.3 `apps/api/src/sales/sales.controller.ts`: `POST /sales/empty-visit`, `@Roles('admin', 'chofer')`, calls `validateRecordEmptyVisitInput`.
- [ ] 3.4 `apps/api/src/sales/sales.controller.spec.ts`: role-guard metadata test for the new route.
- [ ] 3.5 Confirm (via existing suite, unmodified) that `createSale`'s 13 phase-1 tests still pass with zero changes — proves Approach B's isolation claim.

### Phase 4: Editing a Churn Row via the Generic Update Path
- [ ] 4.1 RED: `apps/api/src/sales/sales.service.spec.ts` — `updateSale` throws `ConflictException` and writes nothing when `input.kind` disagrees with the stored row's `kind`; `updateSale` on an existing churn row succeeds with no `items`/`paymentMethod` when `input.kind==='churn'` matches; `updateSale` on a normal-sale row is completely unchanged (still requires both) regardless of whether `input.kind` is present.
- [ ] 4.2 GREEN: `apps/api/src/sales/sales.service.ts` — add the kind-consistency guard immediately after loading `existing` (same location as the existing `status==='canceled'` check); map `kind`/`containerReturned` in `toSaleRecord`.
- [ ] 4.3 Confirm `cancelSale` requires no changes (add a test asserting a churn row cancels identically to a normal one, as a regression guard rather than new behavior).

### Phase 5: Driver-App — Container Field & Churn Action
- [ ] 5.1 RED: `apps/driver-app/src/screens/NewSaleScreen.test.tsx` — the `containerReturned` control renders and updates state; the normal "Guardar venta" payload includes it when set and omits/defaults it when untouched; a new, separately labeled action ("Registrar visita sin venta") is present, disabled state matches the new action's own requirements (no items needed), and on press calls the churn endpoint (or enqueues via the existing offline pattern on failure, mirroring `saveSale`'s `trySendSale`/`enqueueSale` fallback).
- [ ] 5.2 GREEN: `apps/driver-app/src/screens/NewSaleScreen.tsx` — add the control and the new action, own confirmation copy distinguishing it from a normal sale.
- [ ] 5.3 Wire the churn action through `SyncContext` (or an equivalent narrow addition) so it participates in the same offline queue/retry the sale flow already has — do not ship a field action that silently fails without signal.

### Phase 6: Dashboard Defensive Guard
- [ ] 6.1 RED: `apps/dashboard/src/lib/kpis.test.ts` (or equivalent) — a `Sale`-shaped fixture with `paymentMethod: null` does not throw when passed through existing KPI/rendering logic.
- [ ] 6.2 GREEN: minimal null-guard in `apps/dashboard/src/app/admin/reportes/page.tsx` / `lib/kpis.ts` — display, not build, real churn reporting (out of scope, phase 8).

### Phase 7: Verification
- [ ] 7.1 Run `pnpm --filter api test` (all suites green, including the unmodified `createSale` suite).
- [ ] 7.2 Run `pnpm --filter driver-app test` (all suites green).
- [ ] 7.3 Run `pnpm --filter dashboard test` (all suites green).
- [ ] 7.4 Manual smoke: create a normal sale with `containerReturned`, create a churn visit, edit the churn visit, cancel the churn visit — confirm `GET /sales/:id/audits` shows the expected trail for each step.

### Notes
- No threat-matrix rows apply (design: N/A — no routing/shell/subprocess/VCS boundary).
- Open Questions 1–5 (top of document) are design-binding assumptions, not confirmed answers — re-confirm with the owner before `sdd-apply` if there is any opportunity to do so; none of them block starting Phase 1–3 above, since those phases only add optional/backward-compatible surface.

---

## Next Step

Run `sdd-apply` for Unit 1 (schema, migration, shared types) once implementation starts. Strict TDD Mode is active for `apps/api` — every GREEN task must be preceded by a failing RED test. Before starting, flag Open Questions 1–5 to the owner one more time if they become reachable; none currently block Phase 1–3, but Phase 4–5 (edit/cancel semantics, driver-app UX) are exactly where a wrong assumption would be most expensive to unwind.
