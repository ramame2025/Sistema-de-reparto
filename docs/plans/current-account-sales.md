# Change: Cuenta Corriente as a Payment Method

Status: **planned, nothing implemented.**

Depends on [`payment-methods-table.md`](./payment-methods-table.md), whose
migration is applied. That change deliberately deferred cuenta corriente; this
one takes the first half of it.

## What this change is, and what it is not

A sale on account is **sold and billed**, and nobody has paid yet. This change
records that fact truthfully. It does **not** build collections or balances.

That split is the whole point. Debt data accumulates from day one, on real
sales, while the money side is still being designed. When collections arrive
they are built on top of rows that already exist, not backfilled from guesses.

**In:**
- A `createsDebt` flag on `PaymentMethod`.
- A `cuenta_corriente` row, seeded with `createsDebt = true`,
  `proofPolicy = 'none'`, `countsAsCash = false`.
- A new rule: a sale paid with a debt-creating method **must** identify the
  customer by id.
- A receivables view in the dashboard: which sales are unpaid, and who owes.

**Explicitly out:**
- **Collections and balances.** No payment model, no running balance, no
  "mark as collected". A separate change. See "Deferred" at the end.
- **An admin CRUD for payment methods.** Still deferred — D3 of the parent
  plan is unchanged. `createsDebt` is owner-only, by migration.

## Business Decisions Confirmed by the Owner

1. **Cuenta corriente is a payment method, not a separate sale kind.** The
   driver's flow does not change: he sells, he picks how it was paid, and
   "on account" is one of the options.
2. **The sale counts as billed.** `facturado` already means billed, not
   collected — see D4. A sale on account belongs in that number.
3. **A debt must have a debtor.** When the method creates debt, the customer
   is mandatory and must be a real customer record, not typed-in text.
4. **Collections come later**, and nothing here should pretend they exist.

## Design Decisions

### D1 — Three flags, three questions. None inferred from the others.

The parent plan already argued that one boolean cannot answer two questions.
With cuenta corriente there are three, and every pair of them is independent:

| Flag | Question | efectivo | transferencia | qr | tarjeta | cuenta_corriente |
|---|---|---|---|---|---|---|
| `countsAsCash` | Is it physical money the driver must hand in? | ✅ | ❌ | ❌ | ❌ | ❌ |
| `createsDebt` | Does the customer still owe it? | ❌ | ❌ | ❌ | ❌ | ✅ |
| `proofPolicy` | Does the sale carry a payment proof? | `none` | `optional` | `optional` | `optional` | `none` |

`transferencia` is the row that proves the flags cannot be collapsed: it is
neither cash in hand nor debt.

### D2 — Identify debt by the flag, never by the code.

Filtering receivables with `code === 'cuenta_corriente'` would work today and
would be a regression. The parent change exists precisely to delete the
hardcoded `'efectivo'` comparisons that had spread across three apps; a new
string comparison reintroduces the same defect under a new name.

Every consumer asks `createsDebt`. A future "fiado a 30 dias" method then
needs one `INSERT` and no code change — which is the entire reason payment
methods became a table.

### D3 — `proofPolicy` must be `'none'`, and this is not cosmetic.

[`dayProblems.ts:116`](../../apps/driver-app/src/services/dayProblems.ts#L116)
flags a sale as a problem when its policy is not `'none'` and it has no proof
photo:

```ts
proofPolicyOf(paymentMethods, sale.paymentMethod) !== 'none' &&
  !sale.paymentProofRef,
```

A sale on account has no payment, therefore no proof, therefore no photo will
ever arrive. Seeded as `'optional'` it becomes a permanent unresolvable
warning on the driver's day summary. Seeded as `'none'` the screen is correct
on the first run.

### D4 — The billing KPI stays truthful, and needs no change.

[`kpis.ts:30`](../../apps/dashboard/src/lib/kpis.ts#L30) computes:

```ts
const facturado = sum(active, (sale) => sale.total);
```

Billed, not collected. The system has no cash count, no till, no driver
settlement — the `countsAsCash` comment in the shared package says as much.
So a sale on account raises `facturado` correctly and corrupts nothing.

The day a cash figure is built, it reads `countsAsCash`. That is what the flag
is for, and why it was shipped ahead of its first reader.

### D5 — The customer requirement is conditional, so it lives in the shared
### validator, not in the database.

`Sale.customerId` is nullable ([`schema.prisma:90`](../../apps/api/prisma/schema.prisma#L90))
and must stay nullable: a cash sale to a walk-in has no customer record, and
that is legitimate. The rule is "required **when** the method creates debt",
which a column constraint cannot express — the condition lives in another
table, and a CHECK cannot reach it.

It belongs in `packages/shared`, where both the API and the offline-capable
driver app already run the same validation. That is the only place where the
rule is enforced once and applies everywhere.

Consequence to accept: the database alone does not prevent a debt without a
debtor. The guarantee is the shared validator, exactly as the parent plan
accepted a procedural rather than structural guarantee for deleting methods.

### D6 — The catalogue cache key goes `v3` → `v4`.

[`catalog.ts:20`](../../apps/driver-app/src/services/catalog.ts#L20) holds
`driver_catalog_v3`. `createsDebt` changes the **shape** of
`PaymentMethodRecord`, so a phone holding a v3 payload would deserialise rows
without the flag. Bump the key; the old entry is abandoned, not migrated.

The parent plan priced this exact bump in its "Deferred" section. This is that
price being paid.

## Phases

### Phase 1 — Schema, migration, shared contract

- `createsDebt Boolean @default(false)` on the `PaymentMethod` model.
- One migration: `ADD COLUMN`, then `INSERT` the `cuenta_corriente` row
  (`proofPolicy = 'none'`, `countsAsCash = false`, `createsDebt = true`,
  `sortOrder = 4`).
- `createsDebt: boolean` on `PaymentMethodRecord` in `packages/shared`.
- The sale validator gains the conditional customer rule. It needs the
  method's flag, so the validator signature takes the available methods —
  the same way `proofPolicyOf` already resolves policy by code.

**Migration ordering note.** Read the header of
`20260913120000_payment_methods_table/migration.sql` before writing this one.
That migration failed on first apply because a `CREATE TABLE` collided with
the enum of the same name — in Postgres a table creates a composite type with
its own name. This migration only adds a column and a row, so it is not
exposed to that trap, but the rule is worth knowing before touching the table
again.

### Phase 2 — Driver app

- Cache key to `v4`.
- Choosing a debt-creating method makes the customer picker mandatory and
  disables free-text customer entry. The validation error must name the
  reason, not just fail.
- The proof section stays hidden, which D3 already delivers for free.

### Phase 3 — Dashboard receivables

- A view filtered by `createsDebt`, grouped by customer, showing what is
  owed.
- It reads sales only. There is no balance model yet, so the figure is "sold
  on account", not "currently owed" — the copy must say so, because the two
  numbers diverge the moment collections exist.

## Rollout

Deploy order is the parent plan's, unchanged: migration, then API, then
clients. A driver mid-shift on a v3 cache does not see cuenta corriente until
he has signal and the catalogue refreshes. He can keep selling with the four
existing methods, so the constraint degrades safely.

Queued offline sales are unaffected: they carry `paymentMethod` as a string,
and no existing queued payload can name a method that did not exist when it
was queued.

## Risks

- **A debt with no way to collect it.** Phase 3 shows who owes; nothing marks
  it paid. Between this change and the collections change, the only exit is
  direct SQL. Ship the collections change soon, or the receivables view grows
  into a list nobody can act on.
- **"Sold on account" read as "currently owed".** They are the same number
  only until the first collection. The dashboard copy carries the whole
  weight of that distinction, so it must be explicit.

## Deferred: collections and balances

A `Payment` model (append-only, never edited), a per-customer balance derived
from sales-on-account minus payments, and an admin action to record a
collection.

Derived rather than stored: a stored balance drifts the first time anything
writes a sale or a payment outside the one code path that maintains it.
