# Change: Payment Proof Photo

**Phase**: 7 of 9 ([roadmap](./README.md))
**SDD artifact store**: Engram (project `sistema-de-reparto`, topic keys `sdd/payment-proof-photo/*`)
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
| Photo mechanism | "Same mechanism already used for expense receipts" — reuse `POST /uploads/receipt` unchanged; no new upload endpoint |

## Open Questions (Owner Unavailable — Conservative Assumptions Applied)

The owner was not available to resolve these before planning. Each was given the most conservative/reversible assumption — the one that adds the least new mandatory behavior and is cheapest to tighten later if the real answer turns out stricter. This mirrors the exact methodology used in phases 3 and 4. All four are carried forward as explicit "Resolved Open Questions" in the Design section too, and must be re-confirmed with the owner before `sdd-apply` starts.

| # | Question | Conservative assumption taken | Why reversible |
|---|---|---|---|
| 1 | Is the payment proof photo mandatory for transferencia/QR/tarjeta, or optional like expense/manifest receipts? | **Optional**, everywhere, no method-conditional requirement. Mirrors the existing precedent exactly: `DriverExpense.receiptRef` and `LoadManifest.photoRef` are both nullable/optional today, with zero enforced-mandatory photo anywhere in the codebase. It also matches the roadmap's own stated invariant ("No running tab / always charge" — every sale requires a payment method, full stop) — nothing in the roadmap says a sale should become blocked by a missing photo, and the driver-app is offline-first (`SyncContext`/`enqueueSale`); a driver with a dead camera or no signal must still be able to close a sale. | Turning it into a required field for 3 of 4 payment methods later is a one-line validator tightening (`if (input.paymentMethod !== 'efectivo' && !input.paymentProofRef) errors.push(...)`). Requiring it today and finding out drivers regularly can't produce one (bad signal, broken camera, customer already left) would block real sales — not reversible without a hotfix under field pressure. |
| 2 | Does it apply to all 4 payment methods, or only the 3 that generate a digital/paper proof (not efectivo)? | **Backend field stays method-agnostic** (accepts `paymentProofRef` regardless of `paymentMethod`, same as how `containerReturned` in phase 4 was added with no method-conditional gate). **Driver-app UI** only renders the photo control when `paymentMethod !== 'efectivo'`, since cash generates no comprobante in real life and showing the control there would either confuse drivers or produce garbage attachments. | If the real answer is "must be enforced server-side too," adding the method check described above is additive and non-breaking. If the real answer is "even efectivo can have a photo" (e.g., a signed paper receipt), the already-permissive backend needs zero change — only a UI tweak to show the control unconditionally. Either direction is a small, local change; nothing needs to be undone. |
| 3 | Can the photo be attached or changed when editing a sale (`PATCH /sales/:id`), or only at creation? | **Yes, same as creation.** `paymentProofRef` is added directly to `CreateSaleInput`, and `UpdateSaleInput = CreateSaleInput & {...}` already inherits every `CreateSaleInput` field with zero extra code (the same mechanism that let `containerReturned` become editable for free in phase 4). Restricting this later would require deliberately *stripping* the field from the update path — a strictly harder move than the reverse. | Because the field arrives "for free" through the existing type composition, there is no meaningful cost to allowing edits now. Locking it down later (e.g., "no changing evidence after the fact" turns out to be a fraud-prevention requirement) is the one-line addition instead. |
| 4 | Does the dashboard need to display the photo in the sales table, or is API-only storage enough for this phase? | **API-only this phase.** `SaleRecord.paymentProofRef` is persisted and exposed over `GET /sales` / `GET /sales/mine` for future consumption, but no new dashboard UI is built. Mirrors phase 4's Open Question 5 precedent exactly ("no distinct dashboard reporting this phase — deferred to roadmap phase 8, Live dashboard"). `admin/reportes/page.tsx` already has a working `resolveReceiptUrl` + thumbnail-link pattern for `expense.receiptRef` (lines ~571–598) that a future phase can copy verbatim for `sale.paymentProofRef` — flagged in Design §File Changes as a trivial follow-up, not built here. | Explicitly deferred by roadmap structure (phase 7 vs. phase 8 are separate line items); nothing to reverse — building it later is additive, not a migration. |

---

## 1. Explore

## Exploration: payment-proof-photo

### Current State

**The photo-upload mechanism already exists once, generic, and is already reused twice** — confirmed by reading `apps/api/src/uploads/uploads.controller.ts` directly (not another plan's summary of it):
- `@Roles('admin', 'chofer') @Post('receipt')` (lines 18–19), `FileInterceptor('file', ...)` with `diskStorage({ destination: 'uploads', filename: ... })` (22–33), `limits: { fileSize: 5 * 1024 * 1024 }` (34–36), `fileFilter` rejecting anything whose `mimetype` doesn't start with `image/` (37–48).
- `uploadReceipt` (51–68) returns **`{ filename: string, url: string }`** — `url` is an absolute URL built from the request's `x-forwarded-proto`/`host` headers plus `/uploads/${file.filename}`. This is the exact response shape both existing consumers already parse (`apps/driver-app/src/screens/ExpensesScreen.tsx` line 87: `const uploaded = await api.postForm<{ url: string }>('/uploads/receipt', form)`).
- Nothing in this controller is specific to expenses — the route name (`receipt`), the storage folder (`uploads`), and the returned shape are generic. `LoadManifestScreen.tsx` (phase 3) already reuses this identical endpoint for its `photoRef` field with **zero backend changes** at the time it was added. This is strong, direct precedent that a third consumer (a sale's payment proof) needs no backend changes to the upload path either — only a new field to store the returned `url` string against.

**`packages/shared/src/domain.ts`**: confirmed by reading the file directly, not assuming from the roadmap text.
- `CreateSaleInput` (48–60) has no photo/proof field today. It does already have `containerReturned?: boolean` (added in phase 4) — direct precedent that additive optional fields land here cheaply.
- `SaleRecord` (90–111) has no photo/proof field today either.
- The two existing "photo reference" fields in the domain are `CreateExpenseInput.receiptRef?: string` (127–133) and `CreateLoadManifestInput.photoRef?: string` (150–157) — both plain optional `string`, both store whatever `uploadReceipt`'s `url` returned, no special type, no enum, no validation beyond "non-empty when provided" (see `validateCreateLoadManifestInput`, line 499: `if (input.photoRef !== undefined && input.photoRef.trim().length === 0)`). `validateCreateExpenseInput` (454–474) doesn't even bother with that guard for `receiptRef` — the two existing precedents aren't even fully consistent with each other, meaning there's no single "correct" convention being violated by picking the stricter (`photoRef`-style) one here.
- Confirmed: **adding a field for a sale's payment proof is exactly as direct as `containerReturned` was in phase 4** — `CreateSaleInput` already proved out this exact shape of change (add an optional field, flows into `UpdateSaleInput` for free via `CreateSaleInput & {...}`, flows into `SaleRecord` for API exposure). No reason found in the code to prefer a different mechanism.

**`apps/driver-app/src/screens/NewSaleScreen.tsx`**: confirmed by reading the file directly.
- `paymentMethod` (line 64: `useState<PaymentMethod>('efectivo')`) is chosen via a segmented-button row driven by `PAYMENT_METHODS.map(...)` (line 306), rendering all 4 methods (`efectivo`, `transferencia`, `qr`, `tarjeta`) as equal, always-visible options — no conditional UI keyed off the selected method exists anywhere in this screen today. Adding a photo control that only appears for 3 of the 4 methods would be the **first** conditional-on-payment-method UI in this screen.
- The screen already has a working "recuerda que no siempre hay señal" pattern via `trySendSale`/`enqueueSale` (from `useSync()`, line 58) for the main sale flow, and a parallel `trySendEmptyVisit`/`enqueueEmptyVisit` pair added in phase 4 for the churn action — confirms the offline-queue plumbing is per-action-type, not a single shared function, so a payment-proof photo riding along inside the *existing* `CreateSaleInput` payload (rather than a separate upload-then-attach action) needs **no new offline-queue wiring** — it's just one more field on the same payload `trySendSale`/`enqueueSale` already carry.
- `apps/driver-app/src/screens/ExpensesScreen.tsx` (read directly) is the concrete pattern to copy: local `receiptRef` state (line 39), `pickImage`/`takePhoto` handlers using `expo-image-picker`'s `launchImageLibraryAsync`/`launchCameraAsync` (94–133), an upload call `api.postForm<{ url: string }>('/uploads/receipt', form)` (87) that stores the returned `url` into `receiptRef` state, and a conditional `<Image source={{ uri: receiptRef }} .../>` preview (207–210). This is a complete, working, already-shipped reference implementation to adapt — not a pattern that needs to be invented.

**`apps/api/src/sales/sales.service.ts` / `sales.controller.ts`** (read directly — this phase's implementation of phase 4's churn model is already merged, confirmed live in the code, not just in `visit-container-model.md`):
- `createSale` (115–163) writes one `prisma.sale.create` with a flat `data: {...}` object; adding one more scalar field (`paymentProofRef: input.paymentProofRef?.trim() || null`) is a one-line addition, no branching.
- `recordEmptyVisit` (174–222) is a **fully isolated** create path (Design decision #1 from phase 4) that forces `paymentMethod: null`, `items: { create: [] }`, `total: 0` — it does not accept `CreateSaleInput` at all, it accepts the narrower `RecordEmptyVisitInput` (which has no `items`/`paymentMethod`/now no `paymentProofRef` either, since a churn visit never has a payment to prove). No change needed here; the isolation already excludes this field naturally because `RecordEmptyVisitInput` simply never gets it added.
- `updateSale` (224–331) already has a **kind-consistency guard** (238–248) and an `isChurn` branch (250, 258–265) that forces `paymentMethod`/`items`/`total` to null/empty/0 for a churn row regardless of what the edit payload contains. This is the exact mechanism a payment-proof field on `updateSale` needs to reuse: a churn row should never carry a payment proof (it never had a payment), so `resolvedPaymentProofRef = isChurn ? null : (input.paymentProofRef?.trim() || null)` slots into the existing branch with zero new architecture. The audit `beforeSnapshot`/`after` objects (269–281, 310–323) already snapshot every persisted field on edit; `paymentProofRef` needs to join that list for the audit trail to stay complete, same treatment `paymentMethod` already gets.
- `sales.controller.ts` (read directly): `createSale` (54–63) and `updateSale` (78–87) both call the shared validators before invoking the service, and both already accept the full `CreateSaleInput`/`UpdateSaleInput` shape as `@Body()` — no controller change needed beyond validating one more optional field through the existing validators.

**Dashboard** (`apps/dashboard/src/app/admin/reportes/page.tsx`, `apps/dashboard/src/lib/api-client.ts`) — read directly:
- `resolveReceiptUrl(receiptRef?: string)` (`api-client.ts` 72–86) is a small, generic helper: accepts an absolute URL as-is, or a server-relative path (`/uploads/...`) and prefixes `API_URL`. Nothing expense-specific about its signature or logic — it would accept `sale.paymentProofRef` unchanged if a future phase wired it in.
- The expense table (`reportes/page.tsx` 570–598) renders `resolveReceiptUrl(expense.receiptRef)` as a clickable thumbnail (`<a href={receiptUrl} target="_blank"><img .../></a>`) with a "Ver" label, falling back to a dash when absent. This is the exact, ready-to-copy pattern for a future sales-table column — but per Open Question 4's conservative assumption, not built in this phase.

### Affected Areas

- `apps/api/prisma/schema.prisma` — `Sale.paymentProofRef String?` (new nullable column, purely additive, no enum, no index needed — this is a display/reference field, not a query-filter field like `kind`).
- `apps/api/prisma/migrations/` — one additive migration (`ALTER TABLE "Sale" ADD COLUMN "paymentProofRef" TEXT`), no data loss, no backfill (existing rows correctly become `null` = "no photo attached," which is the accurate historical statement).
- `packages/shared/src/domain.ts` — `CreateSaleInput.paymentProofRef?: string`; `validateCreateSaleInput` gains one non-empty-when-provided guard (mirroring `validateCreateLoadManifestInput`'s `photoRef` check); `SaleRecord.paymentProofRef?: string`. `UpdateSaleInput` and `validateUpdateSaleInput` need **no direct edits** — both already compose over `CreateSaleInput`/`validateCreateSaleInput` (`validateSaleIdentityFields` is the one exception that skips the full check for churn rows, and churn rows correctly never see this field).
- `apps/api/src/sales/sales.service.ts` — `createSale` maps the field through (one line); `updateSale` gains a `resolvedPaymentProofRef` variable following the exact `isChurn ? null : ...` pattern already used for `paymentMethod`, included in both the `data: {...}` write and the `beforeSnapshot`/`after` audit objects; `toSaleRecord` maps `paymentProofRef` onto `SaleRecord`. `recordEmptyVisit` is untouched (the field doesn't exist on its narrower input type).
- `apps/api/src/sales/sales.controller.ts` — no route changes; existing `createSale`/`updateSale` handlers already pass the full body through to the validators/service.
- `apps/driver-app/src/screens/NewSaleScreen.tsx` — new `paymentProofRef` state + `pickImage`/`takePhoto`/upload handlers (adapted from `ExpensesScreen.tsx`), rendered conditionally when `paymentMethod !== 'efectivo'` (Open Question 2), included in the existing `CreateSaleInput` payload built by `saveSale`.
- `apps/dashboard` — **no changes this phase** (Open Question 4); `resolveReceiptUrl` and the expense-table thumbnail pattern are confirmed reusable, flagged for a future phase.

### Approaches

Two ways to add the field were compared, using the same "isolate vs. reuse the generic path" framing phase 4 used for churn — but this case resolves much more clearly than churn did, because there is no invariant to protect here.

**A — New, isolated endpoint** (e.g., `POST /sales/:id/payment-proof`), mirroring how phase 4 isolated `recordEmptyVisit()` from `createSale`.
- *Pros*: keeps `createSale`/`updateSale`'s request bodies unchanged; a dedicated endpoint could enforce method-conditional requirements (Open Question 1/2) more explicitly later.
- *Cons*: phase 4's isolation existed for a specific reason — `recordEmptyVisit` had to bypass real invariants (`paymentMethod` required, `items` non-empty) that `createSale`'s validator unconditionally enforces, and a shared validator couldn't safely branch around those without becoming kind-aware everywhere. **None of that applies here.** A payment-proof photo doesn't conflict with any existing invariant — it's a bystander field, exactly like `containerReturned` was. Building a second endpoint (plus its own validator, its own controller route, its own role guard, its own tests) to carry one optional string is meaningfully more code for zero risk-reduction, and it would fragment "edit a sale's photo" across two endpoints (`PATCH /sales/:id` for everything else, a separate route just for the photo) for no behavioral reason.

**B — Additive field directly on `CreateSaleInput`/`UpdateSaleInput`, flowing through the existing `createSale`/`updateSale`.**
- *Pros*: exactly matches the `containerReturned` precedent from phase 4 (which explicitly was **not** isolated — only the churn *creation path* was isolated, because churn broke an invariant; the field-on-existing-sale case did not). Zero new endpoints, zero new controller routes, zero new role-guard tests. `UpdateSaleInput`'s composition (`CreateSaleInput & {...}`) gives edit support for free, directly resolving Open Question 3 favorably. The `isChurn` branch already present in `updateSale` (from phase 4) is the one place that needs a one-line addition to null out the field for churn rows — reusing established architecture, not inventing new architecture.
- *Cons*: none identified that don't equally apply to `containerReturned`, which already shipped this way successfully.

**C — Store the photo reference on a new join/audit-adjacent table instead of a `Sale` column (not seriously considered).** Rejected for the same reason phase 4 rejected a separate `Visit` entity: it would need its own relation to `Sale`/`SaleAudit` for no benefit — `receiptRef`/`photoRef` precedent both use a flat scalar column on the owning entity, not a side table, and there is exactly one photo per sale (not a photo history), so no relational modeling is warranted.

**Recommendation: B.** Unlike churn, a payment-proof photo does not conflict with any existing validation invariant, so there is no structural reason to isolate it. It is a pure additive field, and the codebase already has two live precedents (`containerReturned` in phase 4, `receiptRef`/`photoRef` for expenses/manifests) for exactly this shape of change landing safely through the generic path.

### Risks

- Open Questions 1–2 (mandatory vs. optional; which payment methods) were unresolved without the owner; the conservative assumption (fully optional, UI-gated by method but not backend-gated) is taken and must be re-confirmed before `sdd-apply`, same protocol as phases 3–4.
- The `isChurn` branch in `updateSale` must remember to null out `paymentProofRef` alongside `paymentMethod`/`items` — a straightforward addition to an existing branch, but a one-line miss here would let a churn row silently retain a stale photo reference from before it was edited into churn (impossible today, since `kind` can't change on edit per the kind-consistency guard, but worth stating as the reason the null-forcing exists uniformly rather than conditionally).
- `NewSaleScreen.tsx` gains its **first** payment-method-conditional UI branch; must not regress the always-visible 4-method selector itself, only add a new element that appears/disappears alongside it.
- 5MB/`image/*` limits on `/uploads/receipt` are shared across all three consumers (expenses, manifests, now sales) — unchanged in this phase, flagged only because a future phase tightening those limits for one use case would affect all three; not a reason to fork the endpoint now.

---

## 2. Proposal

# Proposal: Payment Proof Photo

### Intent

Drivers today can attach a photo to an expense or a load manifest, but not to a sale — even though transferencia/QR/tarjeta payments routinely produce a real, checkable proof (a bank app screenshot, a QR confirmation, a card terminal receipt) that the business currently has no way to capture. Per the binding roadmap decision, this reuses the exact upload mechanism already proven for expense receipts (`POST /uploads/receipt`) rather than building a new one. Success = a driver can attach a photo to a sale paid by transferencia/QR/tarjeta at creation or edit time, it is stored and returned on `SaleRecord` for every downstream consumer (API, future dashboard), and a sale paid in efectivo — which has no receipt to photograph — is unaffected.

### Scope

**In Scope**
- Prisma: `Sale.paymentProofRef String?` (nullable, additive column, no new enum).
- `packages/shared/src/domain.ts`: `CreateSaleInput.paymentProofRef?: string`; `validateCreateSaleInput` gains a non-empty-when-provided guard; `SaleRecord.paymentProofRef?: string`. `UpdateSaleInput`/`validateUpdateSaleInput` inherit the field/check for free through existing composition.
- `apps/api/src/sales/sales.service.ts`: `createSale` maps the new field through; `updateSale`'s existing `isChurn` branch is extended to null out `paymentProofRef` for churn rows, same as `paymentMethod`/`items`; the field joins the existing audit `beforeSnapshot`/`after` objects; `toSaleRecord` maps it onto `SaleRecord`.
- `apps/api/src/sales/sales.controller.ts`: **no route changes** — existing `createSale`/`updateSale` handlers already forward the full body.
- `apps/driver-app/src/screens/NewSaleScreen.tsx`: photo picker/camera control (adapted from `ExpensesScreen.tsx`'s existing pattern), rendered only when `paymentMethod !== 'efectivo'` (Open Question 2), included in the existing `CreateSaleInput` payload — no new offline-queue wiring needed, it rides the existing `trySendSale`/`enqueueSale` payload.
- Jest tests in `apps/api` (validator + `SalesService` create/update + churn-nulling) and `apps/driver-app` (`NewSaleScreen`) for every new/changed path, strict TDD.

**Out of Scope**
- A separate/isolated endpoint for the photo (rejected — Explore §Approaches, no invariant to protect unlike churn).
- Making the photo mandatory for any payment method (Open Question 1 — optional everywhere, conservative default).
- Backend enforcement of "only for transferencia/QR/tarjeta" (Open Question 2 — UI-only gate, backend stays permissive).
- Dashboard UI to display the photo (Open Question 4 — `resolveReceiptUrl` pattern confirmed reusable, deferred to a future phase, likely alongside roadmap phase 8's live-dashboard work).
- Any change to `/uploads/receipt` itself (route, limits, storage) — reused byte-for-byte, per the binding roadmap decision.
- Any change to `recordEmptyVisit`/`RecordEmptyVisitInput` (churn) — a churn visit has no payment, so it structurally never gets this field.
- Migrating uploaded files off local disk to cloud object storage — a cross-cutting roadmap decision ("File storage" in `README.md`) not yet scheduled to a specific phase; this phase adds one more consumer of the existing (disk-based) mechanism, same as expenses/manifests already are.

### Capabilities

**New**: none — this is a field addition to the existing `sale-recording` capability, not a new capability.
**Modified**: `sale-recording` — a normal sale (any `kind='sale'` row) gains an optional `paymentProofRef` field, settable on create and edit; a churn row (`kind='churn'`) never carries one, forced `null` server-side on edit exactly like `paymentMethod`.

### Approach

Purely additive. `Sale` gains one nullable column that changes the meaning or requiredness of no existing column for any existing row. The field flows through the same generic `createSale`/`updateSale` paths every other optional `Sale` field already uses — no new service method, no new controller route, no new validator function. The one code touch beyond straight field-threading is extending `updateSale`'s already-existing `isChurn` branch by one line, reusing architecture phase 4 already established rather than adding any.

### Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `apps/api/prisma/schema.prisma` | Modified | `Sale.paymentProofRef String?` added |
| `apps/api/prisma/migrations/` | New | One additive migration, no data loss, no backfill needed |
| `packages/shared/src/domain.ts` | Modified | `CreateSaleInput.paymentProofRef?`; validator guard; `SaleRecord.paymentProofRef?` |
| `apps/api/src/sales/sales.service.ts` | Modified | `createSale`/`updateSale`/`toSaleRecord` map the new field; `isChurn` branch nulls it on churn edits |
| `apps/api/src/sales/sales.controller.ts` | Unchanged | Existing routes already forward the full body |
| `apps/driver-app/src/screens/NewSaleScreen.tsx` | Modified | New photo control (method-conditional), included in the existing sale payload |
| `apps/dashboard` | Unchanged | No display UI this phase (Open Question 4) |
| `apps/api/src/uploads/uploads.controller.ts` | Unchanged | Reused as-is, per the binding roadmap decision |

### Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Driver-app's first payment-method-conditional UI branch regresses the always-visible 4-method selector | Low | New element only, no change to the existing `PAYMENT_METHODS.map(...)` selector rendering |
| `updateSale`'s `isChurn` branch misses nulling `paymentProofRef`, leaving a stale value on a churn row | Low | Explicit test case (Design/Tasks) asserting `paymentProofRef` is `null` on a churn row after any edit, mirroring the existing `paymentMethod`/`items` assertions |
| Assumptions taken for Open Questions 1–4 turn out wrong once the owner is reachable | Medium | All four chosen as the cheapest-to-tighten-later option; flagged explicitly for re-confirmation before `sdd-apply`, same protocol as phases 3–4 |
| Shared 5MB/`image/*` limit on `/uploads/receipt` now serves a third consumer, increasing blast radius of any future limit change | Low | Explicitly out of scope to change in this phase; flagged for awareness only |

### Rollback Plan

Fully additive: the up-migration only adds a nullable column, touching no existing row's meaning. Roll back by (1) reverting the API/shared/driver-app commits — `createSale`'s behavior for a payload with no `paymentProofRef` is unchanged, so a revert restores exactly today's behavior; (2) down-migration drops the column (safe unconditionally — no other column or invariant depends on it, unlike phase 4's `paymentMethod` nullability rollback, which had a churn-data caveat). No historical `Sale` row is touched by the up-migration.

### Success Criteria

- [ ] `POST /sales` behaves exactly as today when `paymentProofRef` is omitted; behaves identically otherwise except the new field is stored.
- [ ] `POST /sales` with `paymentProofRef` set for any of the 4 `paymentMethod` values succeeds and stores it (backend stays permissive per Open Question 2's conservative assumption).
- [ ] `PATCH /sales/:id` on a `kind='sale'` row can set/change/clear `paymentProofRef`.
- [ ] `PATCH /sales/:id` on a `kind='churn'` row always stores `paymentProofRef: null`, regardless of what the request body contains.
- [ ] `GET /sales` / `GET /sales/mine` return `paymentProofRef` on every `SaleRecord`.
- [ ] Driver-app: the photo control appears only when `paymentMethod !== 'efectivo'`; a normal sale can still be saved with no photo attached.
- [ ] Jest suite in `apps/api` and `apps/driver-app` covers every new/changed path and passes.

---

## 3. Spec

# Spec: Payment Proof Photo

### Domain: sale-recording (Modified)

**Requirement: Optional `paymentProofRef` on a normal sale**
`POST /sales` and `PATCH /sales/:id` MUST accept an optional `paymentProofRef: string`, the `url` returned by `POST /uploads/receipt` (unchanged endpoint, reused as-is). Omitting it MUST behave exactly as before this change (stored as `null`). When provided, it MUST NOT be an empty/whitespace-only string. *(Previously: no such field existed.)*

- *Scenario: Sale without `paymentProofRef` unchanged* — GIVEN a payload with no `paymentProofRef` field, WHEN the sale is created, THEN it succeeds exactly as before, `paymentProofRef` stored as `null`.
- *Scenario: Sale with `paymentProofRef` recorded* — GIVEN a payload with `paymentProofRef: "https://.../uploads/receipt_123.jpg"`, WHEN the sale is created, THEN the stored `Sale.paymentProofRef` equals that value.
- *Scenario: Empty-string proof rejected* — GIVEN a payload with `paymentProofRef: "   "`, WHEN it is submitted, THEN the system rejects it with "paymentProofRef must not be empty when provided."
- *Scenario: Accepted regardless of payment method* — GIVEN a payload with `paymentMethod: "efectivo"` and a non-empty `paymentProofRef`, WHEN the sale is created, THEN it succeeds and the value is stored (backend does not enforce Open Question 2's UI-level gate).

**Requirement: Editing a normal sale's `paymentProofRef`**
`PATCH /sales/:id` on a `Sale` with stored `kind='sale'` MUST allow setting, changing, or clearing `paymentProofRef`, exactly like any other editable field, and MUST record the before/after values in the resulting `SaleAudit` row.

- *Scenario: Attach a proof photo on edit* — GIVEN an existing `Sale` with `kind='sale'` and `paymentProofRef=null`, WHEN it is edited with `paymentProofRef` set, THEN the stored value updates and the `SaleAudit(action='edited')` row's `after` snapshot includes it.
- *Scenario: Replace a proof photo on edit* — GIVEN an existing `Sale` with a stored `paymentProofRef`, WHEN it is edited with a different `paymentProofRef`, THEN the stored value is replaced and both old and new values appear in the audit's `before`/`after` snapshots.

**Requirement: A churn row never carries a payment proof**
`PATCH /sales/:id` on a `Sale` with stored `kind='churn'` MUST force `paymentProofRef` to `null` regardless of any value in the request body — the same server-side forcing already applied to `paymentMethod`/`items`/`total` for churn rows (phase 4). *(Previously: field didn't exist, so this requirement is new in full.)*

- *Scenario: Churn edit ignores a supplied proof* — GIVEN an existing `Sale` with `kind='churn'`, WHEN it is edited with `paymentProofRef` set to some value, THEN the stored `Sale.paymentProofRef` remains `null` after the edit.

**Requirement: Churn creation never accepts a payment proof**
`POST /sales/empty-visit` MUST continue to accept only `RecordEmptyVisitInput`'s existing fields — `paymentProofRef` is not part of that type and MUST NOT be added to it, since a churn visit has no payment to prove. *(No behavior change — stated explicitly so this phase's scope is unambiguous: `recordEmptyVisit` requires zero code changes.)*

- *Scenario: Extra field on a churn request is ignored, not stored* — GIVEN a `POST /sales/empty-visit` request body that includes an unexpected `paymentProofRef` key, WHEN it is submitted, THEN the created `Sale` has `paymentProofRef=null` (the field is not part of `RecordEmptyVisitInput`'s shape, so nothing reads it).

---

## 4. Design

# Design: Payment Proof Photo

### Technical Approach

One new, nullable Prisma column on `Sale`. One new optional field threaded through `CreateSaleInput`/`SaleRecord` (and inherited by `UpdateSaleInput` for free via its existing `CreateSaleInput & {...}` composition). One one-line extension of the `isChurn` branch `updateSale` already has (phase 4) to null the field out for churn edits. No new endpoint, no new NestJS route, no change to `POST /uploads/receipt`.

### Architecture Decisions

| # | Decision | Choice | Rejected | Rationale |
|---|---|---|---|---|
| 1 | Where the field lives | Additive field on `CreateSaleInput`/`SaleRecord`, flowing through the existing `createSale`/`updateSale` | New isolated endpoint (`POST /sales/:id/payment-proof`), mirroring `recordEmptyVisit`'s isolation | Isolation in phase 4 existed to protect an invariant (`paymentMethod`/`items` required) that a payment-proof field doesn't conflict with — no invariant to protect here, so isolation would only add code, not reduce risk |
| 2 | Upload mechanism | Reuse `POST /uploads/receipt` unchanged | New `/uploads/payment-proof` route with different limits/validation | Binding roadmap decision ("same mechanism already used for expense receipts"); the existing route is already generic (folder/route name aren't expense-specific) and already has two consumers (expenses, manifests) with zero per-consumer backend code |
| 3 | Mandatory vs. optional | Optional everywhere, no method-conditional backend requirement | Required for transferencia/QR/tarjeta | Open Question 1's conservative assumption; matches `receiptRef`/`photoRef` precedent (both optional) and the offline-first driver-app's need to always be able to close a sale |
| 4 | Method-conditional UI gate | Driver-app hides the control for `paymentMethod === 'efectivo'`; backend stays permissive regardless of method | Backend rejects `paymentProofRef` when `paymentMethod === 'efectivo'` | Open Question 2's conservative assumption; a UI-only gate is reversible in either direction (loosen the UI, or add a backend check later) without touching the other layer |
| 5 | Editability | Included via `UpdateSaleInput`'s existing composition — no new code needed for edit support | A separate, photo-only edit endpoint | Open Question 3's conservative assumption; the type composition already grants this for free, so restricting it later (if ever needed) is the only path requiring new code, making "allow" the cheaper default |
| 6 | Churn-row handling | Extend `updateSale`'s existing `isChurn` branch by one line (`resolvedPaymentProofRef = isChurn ? null : ...`) | A separate guard/branch specific to this field | Reuses the exact architecture phase 4 built for `paymentMethod`/`items`/`total`; a churn row has no payment, so no payment proof, by the same logic already encoded there |
| 7 | Dashboard display | Not built this phase; `resolveReceiptUrl` + expense-table thumbnail pattern (`reportes/page.tsx` 570–598) confirmed as the exact pattern to copy for a future phase | Build the sales-table column now, since the pattern is trivial to copy | Open Question 4's conservative assumption; mirrors phase 4's Open Question 5 precedent of deferring dashboard work to keep this phase's diff focused on the data-capture path |

### Prisma Schema (additive change to the existing `Sale` model)

```prisma
model Sale {
  // ...existing fields unchanged...
  paymentProofRef   String?
}
```

No enum, no index, no change to any other column. `paymentMethod`/`kind`/`containerReturned` (all added by phase 4) are untouched.

### Data Flow

```
POST /sales (existing path, one new optional field)
  -> SalesController.createSale -> validateCreateSaleInput (gains one guard: non-empty when provided)
  -> SalesService.createSale
       `- prisma.sale.create({ ..., paymentProofRef: input.paymentProofRef?.trim() || null })

PATCH /sales/:id (existing path, kind-aware since phase 4)
  -> SalesController.updateSale -> validateUpdateSaleInput(input)  // same guard, inherited
  -> SalesService.updateSale
       |- load existing; kind-consistency guard (unchanged, phase 4)
       |- resolvedPaymentProofRef = isChurn ? null : (input.paymentProofRef?.trim() || null)  [NEW LINE]
       |- beforeSnapshot/after audit objects gain paymentProofRef  [NEW FIELD IN EXISTING OBJECTS]
       `- ...rest unchanged

POST /sales/empty-visit (unchanged — RecordEmptyVisitInput has no paymentProofRef field)
PATCH /sales/:id/cancel  -> unchanged, no code touches paymentProofRef
```

### File Changes

| File | Action | Description |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Modify | `Sale.paymentProofRef String?` added |
| `apps/api/prisma/migrations/<ts>_add_payment_proof_ref/migration.sql` | Create | `ALTER TABLE "Sale" ADD COLUMN "paymentProofRef" TEXT` |
| `packages/shared/src/domain.ts` | Modify | `CreateSaleInput.paymentProofRef?`; guard in `validateCreateSaleInput`; `SaleRecord.paymentProofRef?` |
| `apps/api/src/shared/domain-validators.spec.ts` | Modify | RED-first coverage for the new validator guard (accepts omitted, accepts non-empty, rejects empty/whitespace) |
| `apps/api/src/sales/sales.service.ts` | Modify | `createSale` maps the field through; `updateSale`'s `isChurn` branch nulls it; audit snapshots include it; `toSaleRecord` maps it |
| `apps/api/src/sales/sales.service.spec.ts` | Modify | RED-first coverage: create stores it; update on `kind='sale'` sets/changes/clears it; update on `kind='churn'` always nulls it regardless of input |
| `apps/api/src/sales/sales.controller.ts` | Unchanged | No route changes |
| `apps/driver-app/src/screens/NewSaleScreen.tsx` | Modify | New `paymentProofRef` state + pick/upload handlers (adapted from `ExpensesScreen.tsx`), rendered when `paymentMethod !== 'efectivo'`, included in the existing sale payload |
| `apps/driver-app/src/screens/NewSaleScreen.test.tsx` | Modify | Coverage for the new control's visibility toggle and payload inclusion |
| *(Not this phase)* `apps/dashboard/src/app/admin/reportes/page.tsx` | Deferred | Follow-up: copy the `resolveReceiptUrl` + thumbnail pattern already used for `expense.receiptRef` (Open Question 4) |

### Interfaces

```ts
// packages/shared/src/domain.ts
export type CreateSaleInput = {
  /* ...existing fields... */
  paymentProofRef?: string;
};

export type SaleRecord = {
  /* ...existing fields... */
  paymentProofRef?: string;
};

// validateCreateSaleInput gains:
//   if (input.paymentProofRef !== undefined && input.paymentProofRef.trim().length === 0) {
//     errors.push('paymentProofRef must not be empty when provided');
//   }
// UpdateSaleInput / validateUpdateSaleInput: no direct changes — both already
// compose over CreateSaleInput / validateCreateSaleInput for the non-churn branch.

// apps/api/src/sales/sales.service.ts (existing methods, no new signatures)
createSale(input: CreateSaleInput, actorUsername?: string): Promise<SaleRecord>;      // unchanged signature
updateSale(id: string, input: UpdateSaleInput, actorUsername?: string): Promise<SaleRecord>; // unchanged signature
```

### Testing Strategy

`apps/api` (Jest) and `apps/driver-app` (Jest + React Native Testing Library) are both already covered projects — no new test infra needed.

| Layer | What to Test | Approach |
|---|---|---|
| Unit — validator | `validateCreateSaleInput` accepts omitted `paymentProofRef`; accepts a non-empty string regardless of `paymentMethod`; rejects an empty/whitespace string | Extend `domain-validators.spec.ts`'s existing `describe('validateCreateSaleInput', ...)` block |
| Unit — service | `createSale` stores `paymentProofRef` when provided, `null` when omitted; `updateSale` on `kind='sale'` sets/changes/clears it; `updateSale` on `kind='churn'` always stores `null` even when the request supplies a value; audit `before`/`after` snapshots include it | Extend `sales.service.spec.ts`'s existing Prisma-double pattern (`buildSaleRow`/`buildCreateInput`/`buildChurnRow` helpers already exist from phase 4) |
| Driver-app — component | Photo control is hidden when `paymentMethod === 'efectivo'`, visible otherwise; picking/uploading a photo sets `paymentProofRef` in the outgoing `CreateSaleInput`; a sale can still be saved with no photo attached | Extend `NewSaleScreen.test.tsx`'s existing render/interaction pattern; mock `expo-image-picker` and `api.postForm`, following `ExpensesScreen`'s existing test conventions if present |
| E2E | None this phase | Consistent with prior phases' precedent (`test/jest-e2e.json` needs live Postgres, deferred) |

Mandatory RED tests before any implementation: `createSale` persists `paymentProofRef` exactly as given; `updateSale` on a churn row discards any client-supplied `paymentProofRef` and stores `null`; `updateSale` on a normal sale row round-trips the field (set → get → change → get → clear → get).

### Migration / Rollout

Single additive migration: add `paymentProofRef` (nullable, existing rows correctly become `null` = "no photo attached," zero data movement). Deploy order: migrate, then API, matching prior phases' precedent. Rollback: revert the commit (behavior for a payload with no `paymentProofRef` is unchanged, so the app is exactly as it was); down-migration drops the column unconditionally (safe — no other column or invariant depends on it).

### Resolved Open Questions

Carried from the top of this document, restated here as design-binding until the owner is reachable:

1. `paymentProofRef` optional everywhere, no method-conditional requirement at the backend.
2. Driver-app UI hides the control for `efectivo`; backend stays permissive regardless of `paymentMethod`.
3. Editable through the existing `PATCH /sales/:id`, same as creation — no separate endpoint.
4. No dashboard display this phase — API-only, `resolveReceiptUrl` pattern confirmed reusable for a future phase.

---

## 5. Tasks

# Tasks: Payment Proof Photo

### Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~300 total (schema+migration ~5, domain.ts+validator spec ~50, sales.service+spec ~110, driver-app UI+tests ~130, wiring/imports ~5) |
| Review budget | 800 lines |
| 800-line budget risk | Low — well under budget; no chaining anticipated |
| Chained PRs recommended | No — single PR |
| Chain strategy (if needed) | N/A |

### Work Units

| Unit | Goal | Focused test command | Runtime check | Rollback boundary |
|------|------|----------------------|------------------|--------------------|
| 1 | Schema, migration, shared domain field/validator | `pnpm --filter api test -- domain` | `pnpm --filter api exec prisma migrate dev` + `prisma generate` | Revert; nothing built on top yet |
| 2 | `sales.service.ts` create/update/audit/toSaleRecord mapping + tests | `pnpm --filter api test -- sales` | `pnpm --filter api start:dev` + curl `POST /sales` and `PATCH /sales/:id` with `paymentProofRef` | Revert Unit 2 only; Unit 1's schema/types remain valid |
| 3 | Driver-app photo control + churn-nulling smoke + tests | `pnpm --filter driver-app test -- NewSaleScreen` | Run the app, create a transferencia sale with a photo, an efectivo sale without the control shown | Revert Unit 3; API from Units 1–2 remains valid without a driver-app consumer |

Units 2 depends only on Unit 1. Unit 3 depends on Units 1–2 (needs the field to exist and round-trip through the API).

### Phase 1: Schema, Migration & Shared Domain
- [ ] 1.1 `apps/api/prisma/schema.prisma`: add `Sale.paymentProofRef String?`.
- [ ] 1.2 `apps/api/prisma/migrations/<ts>_add_payment_proof_ref/migration.sql`: `ALTER TABLE "Sale" ADD COLUMN "paymentProofRef" TEXT`.
- [ ] 1.3 Run `prisma migrate dev` + `prisma generate`; confirm client types compile.
- [ ] 1.4 `packages/shared/src/domain.ts`: add `CreateSaleInput.paymentProofRef?`; add `SaleRecord.paymentProofRef?`.
- [ ] 1.5 RED: `apps/api/src/shared/domain-validators.spec.ts` — `validateCreateSaleInput` accepts omitted `paymentProofRef`; accepts a non-empty value; rejects `"   "` with "paymentProofRef must not be empty when provided."
- [ ] 1.6 GREEN: add the guard to `validateCreateSaleInput` to pass 1.5.

### Phase 2: Sales Service — Create, Update, Audit
- [ ] 2.1 RED: `apps/api/src/sales/sales.service.spec.ts` — `createSale` stores `paymentProofRef` when provided in the payload, `null` when omitted.
- [ ] 2.2 GREEN: `apps/api/src/sales/sales.service.ts` — `createSale`'s `prisma.sale.create` data object maps `paymentProofRef: input.paymentProofRef?.trim() || null`.
- [ ] 2.3 RED: `updateSale` on an existing `kind='sale'` row sets/changes/clears `paymentProofRef` per the request; `updateSale` on an existing `kind='churn'` row always stores `paymentProofRef: null`, even when the request body supplies a value; the audit `before`/`after` snapshots include `paymentProofRef`.
- [ ] 2.4 GREEN: extend the existing `isChurn` branch with `resolvedPaymentProofRef = isChurn ? null : (input.paymentProofRef?.trim() || null)`; include it in the `data: {...}` write and both audit snapshot objects.
- [ ] 2.5 GREEN: `toSaleRecord` maps `paymentProofRef: sale.paymentProofRef ?? undefined`.
- [ ] 2.6 Confirm (via existing suite, unmodified) that `recordEmptyVisit`'s tests still pass with zero changes — proves the field correctly never reaches the churn-creation path.

### Phase 3: Driver-App — Payment Proof Control
- [ ] 3.1 RED: `apps/driver-app/src/screens/NewSaleScreen.test.tsx` — the photo control does not render when `paymentMethod === 'efectivo'`; renders when `paymentMethod` is `transferencia`/`qr`/`tarjeta`; picking/uploading a photo (mocked `expo-image-picker` + `api.postForm`) sets `paymentProofRef` in the outgoing `CreateSaleInput`; a sale still saves successfully with no photo attached (field omitted from the payload).
- [ ] 3.2 GREEN: `apps/driver-app/src/screens/NewSaleScreen.tsx` — add `paymentProofRef` state and `pickImage`/`takePhoto`/upload handlers adapted from `ExpensesScreen.tsx`'s existing implementation; render the control conditionally on `paymentMethod`; include `paymentProofRef` in the payload built by `saveSale` when set.
- [ ] 3.3 Confirm no new offline-queue wiring was needed — the field rides the existing `trySendSale`/`enqueueSale` payload, same as every other `CreateSaleInput` field.

### Phase 4: Verification
- [ ] 4.1 Run `pnpm --filter api test` (all suites green, including unmodified `recordEmptyVisit`/churn-creation suites).
- [ ] 4.2 Run `pnpm --filter driver-app test` (all suites green).
- [ ] 4.3 Manual smoke: create a transferencia sale with a photo, verify `GET /sales/mine` returns `paymentProofRef`; edit it to remove the photo, verify it clears; confirm `GET /sales/:id/audits` reflects both changes.

### Notes
- No threat-matrix rows apply (design: N/A — no routing/shell/subprocess/VCS boundary).
- Open Questions 1–4 (top of document) are design-binding assumptions, not confirmed answers — re-confirm with the owner before `sdd-apply` if there is any opportunity to do so; none of them block starting any phase above, since all four resolve toward the more permissive, easier-to-tighten-later option.

---

## Next Step

Run `sdd-apply` for Unit 1 (schema, migration, shared domain field/validator) once implementation starts. Strict TDD Mode is active for `apps/api` — every GREEN task must be preceded by a failing RED test. Before starting, flag Open Questions 1–4 to the owner one more time if they become reachable; none currently block any phase, but Phase 3 (driver-app UX, method-conditional visibility) is where a wrong assumption about Open Question 2 would be most visible to drivers day-to-day.
