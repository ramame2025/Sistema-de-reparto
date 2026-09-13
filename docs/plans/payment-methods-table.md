# Change: Admin-Managed Payment Methods

Status: **planned — not implemented**.

Follows the pattern established by
[`dynamic-product-catalog.md`](./dynamic-product-catalog.md) and
[`admin-managed-taxonomies.md`](./admin-managed-taxonomies.md): a Prisma enum
becomes a table whose `code` is the immutable key travelling over the wire,
rows are retired with `isActive` rather than deleted, and the `Sale` column
keeps no foreign key so the past stays immutable.

What this change adds on top of that pattern is **behaviour flags**. The
other taxonomies are labels; a payment method carries rules, and those rules
are currently hardcoded as string comparisons against `'efectivo'` in three
apps.

## Scope

**In:**
- `PaymentMethod` enum → table, seeded with the four current values.
- A `proofPolicy` flag that replaces the hardcoded `'efectivo'` checks.
- A `countsAsCash` flag (data only — see D6).
- `GET /payment-methods`, consumed by the driver app's catalogue bundle and
  by the dashboard.

**Explicitly out, deferred by the owner:**
- **Cuenta corriente / running tab.** No `createsDebt` flag, no debt model,
  no balance. To be decided separately. See "Deferred" at the end — the cost
  of adding it later is stated there, not hidden.
- **An admin CRUD screen.** See D3.

## Business Decisions Confirmed by the Owner

1. **Payment methods become a table**, so a new method (e.g. Mercado Pago)
   does not need a code change and a deploy.
2. **The table is not exposed to the client as an editable CRUD in this
   phase.** A bad configuration can stop the drivers from selling, and the
   blast radius is not worth the convenience. Phase 4 is deferred.
3. **Who edits what is split by field, not by table.** Renaming a label is
   low risk; changing a rule is not.

   | Field | Who may change it |
   |---|---|
   | `name`, `isActive`, `sortOrder` | the admin, once the phase-4 screen exists |
   | `code` | nobody, ever — immutable |
   | `proofPolicy`, `countsAsCash` | the owner, by migration or direct SQL |

4. **Whether a sale needs a payment proof is a property of the method**, not
   a string comparison spread across the codebase.
5. **Cuenta corriente is deferred**, and nothing in this change should
   pretend otherwise.

## Current State (verified against the code)

### The enum and its mirror
`enum PaymentMethod` (`apps/api/prisma/schema.prisma:15`) holds `efectivo`,
`transferencia`, `qr`, `tarjeta`. It is mirrored as `PAYMENT_METHODS`
(`packages/shared/src/domain.ts:74`) and narrowed to a union type
`PaymentMethod` (`domain.ts:95`).

`Sale.paymentMethod` is **nullable** (`schema.prisma:81`) — a `kind: 'churn'`
row records a visit where nothing was sold, so there was no payment at all
(`domain.ts:209-213`). That nullability survives this change untouched.

### `'efectivo'` is a business rule written as a string comparison

| Site | What it decides |
|---|---|
| `apps/driver-app/src/screens/NewSaleScreen.tsx:622` | whether the COMPROBANTE section renders at all |
| `apps/driver-app/src/services/dayProblems.ts:92` | whether a saved sale raises the `missing-proof` problem |
| `apps/dashboard/src/app/admin/reportes/page.tsx:764` | whether the dashboard says "no aplica" or "el chofer no adjuntó comprobante" |

Three apps, three copies of one rule, no shared definition. Adding a fifth
payment method today means remembering all three.

### Labels are duplicated four times, and one of them shows the raw code

| Site | Shape |
|---|---|
| `NewSaleScreen.tsx:59` | `PAYMENT_LABELS: Record<PaymentMethod, string>` |
| `SaleDetailScreen.tsx:42` | a chained ternary inside `PAYMENT_OPTIONS` |
| `DayStatusCard.tsx:35` | `PAYMENT_NAMES` |
| `apps/dashboard/src/lib/format.ts:9` | returns the code verbatim — the dashboard literally renders `qr` |

### Validation is a membership test against the compiled constant
`validateCreateSaleInput` checks `PAYMENT_METHODS.includes(...)`
(`domain.ts:785`). Once the list lives in the database this cannot stand: the
driver app validates payloads offline, against whatever it last cached.

### The offline queue already holds these strings
Sales are queued on the phones with `paymentMethod` inside the payload
(`apps/driver-app/src/services/offlineQueue.ts`). This is the same constraint
that made `code` immutable for customer categories, and it is the single
hardest requirement in this change.

### The catalogue bundle
`CatalogContext.tsx:75` fetches products, prices and categories together and
caches them under `CATALOG_CACHE_KEY = 'driver_catalog_v2'`
(`apps/driver-app/src/services/catalog.ts:13`), a single coherent entry that
is discarded whole when its shape changes.

## Design Decisions

**D1 — `PaymentMethod` table, `code` kept as the stable key.**
`id`, `code` (unique), `name`, `isActive`, `sortOrder`, `proofPolicy`,
`countsAsCash`. The four enum values become the first four rows, in the order
`PAYMENT_METHODS` already listed them, so nothing changes on screen. The
Prisma model reuses the name `PaymentMethod` — the enum is dropped in the same
migration, so they never coexist.

**D2 — `Sale.paymentMethod` becomes TEXT with NO foreign key.**
Identical to the decision already taken for `Sale.customerType` in
`20260909150000_customer_categories`, and for the same reason: a sale records
what was true when the money changed hands. `ON UPDATE CASCADE` would let a
rename rewrite settled history; `RESTRICT` would make an obsolete method
impossible to ever clean up. There are no other tables referencing payment
methods, so this change adds **no** foreign keys anywhere.

**D3 — No admin screen in this change.** The table's value in phase 1 is the
flags and the single source of truth, not self-service. Adding a method is a
row insert done by the owner. When the screen arrives (phase 4, deferred), it
starts as: editable `name` / `isActive` / `sortOrder`, read-only badges for
`code` and the flags.

**D4 — `proofPolicy` is a three-state enum, not a boolean.**
`none | optional | required`.

A boolean cannot express today's actual behaviour: the driver app already
labels the proof section "opcional" (`NewSaleScreen.tsx:624`) while
`dayProblems.ts` simultaneously raises `missing-proof` when it is absent —
that is precisely the `optional` state, and it is distinct from both "does
not apply" and "cannot save without it". Seeds: `efectivo → none`, the other
three → `optional`, which reproduces current behaviour exactly.

`required` ships as a valid value with its enforcement **defined but
unseeded**: no row uses it on day one, so no behaviour changes until the
owner sets it. Enforcement lives on the client only — see D5.

**D5 — The proof policy is advisory on the client and never rejected by the
server.** A queued sale that arrives without a proof is stored, whatever the
method's policy says. The phone validated against the catalogue it had
cached, which may be days old, and the money was already collected. This is
the same rule already applied to deactivated customer categories
(`sales.service.ts:108-112`): *existence* is checked server-side, *currency*
is not. Rejecting here would destroy a real sale to enforce a paperwork rule.

**D6 — `countsAsCash` ships as data with no consumer, and this plan says so
plainly.** It answers "is this physical cash the driver has to hand in?" —
`true` for `efectivo`, `false` for the other three. Nothing reads it today:
there is no cash-reconciliation feature (`kpis.ts` aggregates only
`facturado`/`gastos`/`neto`).

The argument for including it anyway is narrow and specific: every change to
the *shape* of the payment-method record bumps the driver catalogue cache key,
and a cache-key bump carries a real operational cost (see "Rollout"). Defining
the record once is worth one unused column. The argument against is that an
unused column is an unverified assumption. **Owner's call** — the plan works
either way, and dropping D6 removes one column from the migration and one
field from the record, nothing else.

**D7 — `PAYMENT_METHODS` is deleted, not kept for compatibility.**
A compiled constant that claims to list the payment methods would be wrong
the first time a row is inserted. Removing it turns every consumer into a
compile error, which is the point: the TypeScript sweep is the migration
plan for the UI. It is replaced by `type PaymentMethod = string`,
`PAYMENT_METHOD_MAX_LENGTH`, and `isWellFormedPaymentMethod` — mirroring
`CustomerType` (`domain.ts:45-72`).

## Phases

Each phase is independently shippable and leaves the system working.

### Phase 1 — Schema, shared contract, API

**Migration `2026xxxxxxxxxx_payment_methods_table`:**
1. `CREATE TABLE "PaymentMethod"` + unique index on `code` + index on
   `(isActive, sortOrder)`.
2. Insert the four seed rows with `id` values `seed_payment_method_<code>`,
   `sortOrder` 0..3 matching the current `PAYMENT_METHODS` order, `name`
   taken from the labels the driver app already shows (`Efectivo`,
   `Transferencia`, `QR`, `Tarjeta` — so nothing changes on screen),
   `proofPolicy` per D4, `countsAsCash` per D6.
3. `ALTER TABLE "Sale" ALTER COLUMN "paymentMethod" TYPE TEXT USING
   "paymentMethod"::TEXT` — nullable, unchanged.
4. `DROP TYPE "PaymentMethod"`.

No foreign keys are added (D2). `Sale` is the only table referencing the enum,
which makes this the smallest of the three enum-to-table migrations done so
far.

**`packages/shared`:**
- `type PaymentMethod = string`, `PAYMENT_METHOD_MAX_LENGTH = 20`,
  `isWellFormedPaymentMethod`, `PROOF_POLICIES = ['none','optional','required']`,
  `type ProofPolicy`, `PaymentMethodRecord` (same shape as
  `CustomerCategoryRecord` plus the two flags).
- `validateCreateSaleInput` / `validateUpdateSaleInput`: swap the
  `PAYMENT_METHODS.includes` test (`domain.ts:785`) for
  `isWellFormedPaymentMethod`. Well-formedness only — existence is the
  server's job.
- Delete `PAYMENT_METHODS` (D7).

**`apps/api`:**
- New `payment-methods` module modelled on `customer-categories`:
  `GET /payment-methods`, `@Roles('admin','chofer')`, `includeInactive=true`
  honoured for admins only — same rule and same reasoning as
  `customer-categories.controller.ts:36-49`.
- No `POST`/`PATCH` in this phase (D3).
- `sales.service.ts`: add `assertPaymentMethodCodesExist`, called next to the
  existing `assertCategoryCodesExist` (`sales.service.ts:112`), with the same
  existence-not-currency semantics. Skipped when `paymentMethod` is `null`
  (churn rows).

### Phase 2 — Driver app

- `CatalogContext.tsx`: fetch `/payment-methods` alongside the existing three
  requests; add `paymentMethods` to `CachedCatalog`; bump
  `CATALOG_CACHE_KEY` to `driver_catalog_v3` and extend `isCatalog`.
- `NewSaleScreen.tsx`: build `PAYMENT_OPTIONS` from the catalogue (label from
  `name`, order from `sortOrder`, active rows only); delete `PAYMENT_LABELS`
  (`:59`); replace `paymentMethod !== 'efectivo'` (`:622`) with
  `proofPolicy !== 'none'`; default the selected method to the first active
  row instead of the literal `'efectivo'` (`:111`); render the section header
  as "opcional" or "obligatorio" from the policy, and block save on
  `required` with no proof.
- `SaleDetailScreen.tsx:42`: same, deleting the chained ternary.
- `dayProblems.ts:92`: take the policy as a parameter instead of comparing to
  `'efectivo'`; raise `missing-proof` only when the policy is not `none`.
- `DayStatusCard.tsx:35`: label from the record, deleting `PAYMENT_NAMES`.

### Phase 3 — Dashboard

- `reportes/page.tsx:429`: build the filter options from `GET /payment-methods`
  with `includeInactive=true` — an admin filtering a past month must still be
  able to select a method retired since.
- `reportes/page.tsx:764`: replace `=== "efectivo"` with the method's
  `proofPolicy === 'none'`, keeping the existing `null` branch for churn rows.
- `format.ts:9`: render `name`, not the raw code — this is a visible fix, the
  dashboard currently prints `qr`.

### Phase 4 — Admin screen — **deferred, not part of this change**

`/admin/medios-pago`, modelled on `/admin/categorias`. Editable `name`,
`isActive`, `sortOrder`; `code` and both flags shown read-only. Needs the
`POST`/`PATCH` endpoints left out of phase 1.

## Rollout

1. Apply the migration. The `.env` lives at the monorepo root, so the Prisma
   CLI needs it loaded explicitly:
   ```bash
   cd apps/api && set -a && . ../../.env && set +a && npx prisma migrate deploy
   ```
2. Deploy the API (phase 1) before the driver app (phase 2). The old app keeps
   working against the new API: it still sends the same four codes, and the
   server only checks existence.
3. **Do not ship the driver app mid-shift.** The catalogue cache key moves to
   `driver_catalog_v3`, so a driver who updates holds an unreadable cache and
   cannot sell until the phone reaches signal once. Same constraint that
   applied to the `v1 → v2` bump.

## Risks

| Risk | Mitigation |
|---|---|
| A queued offline sale carries a code that was retired meanwhile | Existence is checked, currency is not (D5, mirroring `sales.service.ts:108-112`). Retired ≠ rejected. |
| Someone renames a `code` to "fix" a label | `code` is immutable and no UI exposes it (D3). Renaming is what `name` is for. |
| A row is deleted instead of deactivated | No `DELETE` endpoint exists. Deactivation is `isActive: false`. Note there is no FK to stop a direct SQL delete — the protection here is procedural, not structural, because D2 forbids the FK. |
| `required` is set on a method while phones are offline | The policy is advisory client-side; the server never rejects (D5). The phone picks it up on the next sync. |
| All four methods deactivated at once | Phase 1 has no write endpoint, so this is only reachable by direct SQL. Phase 4 must add the "at least one active method" guard before shipping the screen. |

## Deferred: cuenta corriente

Explicitly out of scope. When it happens it needs a `createsDebt` flag on this
table plus a balance model, and "does this settle an outstanding balance?" is
a **different question** from `countsAsCash`: a transferencia neither creates
debt nor is cash in hand. One boolean cannot answer both.

Adding that flag later costs one `ALTER TABLE ... ADD COLUMN` and one more
driver catalogue cache-key bump (`v3 → v4`), with the mid-shift constraint in
"Rollout" attached. That is the accepted price of deferring it, recorded here
so it is not rediscovered later.
