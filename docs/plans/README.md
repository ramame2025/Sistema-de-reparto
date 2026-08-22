# Product Roadmap — Gas Cylinder Delivery Management

This directory tracks the Spec-Driven Development (SDD) plan for evolving the
current MVP into the full product described by the business. Each phase gets
its own change document once it goes through SDD (explore → proposal → spec →
design → tasks → apply → verify → archive).

## Current State vs. Requirements

The base domain model already matches the business almost exactly:

| Requirement | Status |
|---|---|
| 4 products (G10, G15, G45, G15_AUTO) | Done — `ProductCode` enum |
| 3 customer types (final, comercio, distribuidor) | Done — `CustomerType` enum |
| 4 payment methods (efectivo, transferencia, QR, tarjeta) | Done — `PaymentMethod` enum |
| Edit/cancel a sale with mandatory reason + audit trail | Done — `SaleAudit` with before/after JSON snapshots |
| Offline queue with retry/backoff | Done — implemented in `apps/driver-app` |
| Categorized expenses + receipt photo | Done — `DriverExpense` + `/uploads/receipt` |
| No running tab / always charge | Done — every sale requires a payment method |

What's missing, grouped by theme:

**1. Entities that are free text today and need to become real models**
- **Customer**: no registry. `customerName`/`customerType` are typed per sale with no link to a record — blocks assigning a daily visit list, proximity suggestions, or de-duplicated customer creation.
- **Truck**: `truckCode` is free text, no capacity, no catalog.
- **Driver↔Truck assignment**: doesn't exist. A driver is only identified by `driverName` (string), with no FK to `UserAccount` or to a truck.

**2. Capabilities that don't exist at all**
- Geolocation: zero references anywhere in the codebase (not even the `expo-location` dependency).
- Load manifest / "remito de carga" (photo + quantities loaded at the factory at the start of the day): no model, no screen.
- Container/cylinder state per visit (received empty / received nothing / received empty without delivering = customer churn): the `Sale` model has no concept of this today.
- Admin-configurable prices: hardcoded in `packages/shared` (`DEFAULT_PRICE_TABLE`), no DB table, no endpoint.
- Payment proof photo (transferencia/QR/tarjeta) attached to a sale: photos only exist for expenses today.
- Live dashboard: zero auto-refresh mechanism (everything is on-demand fetch).

**3. Structural debt worth fixing while we're in the area**
- `apps/driver-app` is a single 1174-line file with no screen navigation — adding load manifests, a customer picker, and geolocation on top of it without a refactor first is unmaintainable.
- The driver's daily summary calls `GET /sales`, which is admin-only on the backend — latent bug.
- Uploaded files (photos) live on the API server's local disk, not durable cloud storage.

## Phased Plan

1. **Domain foundations** — `Customer`, `Truck`, driver↔truck assignment (with capacity), DB-backed `PriceList`. Nothing else has anywhere to stand without this. → [`customer-truck-pricing-foundations.md`](./customer-truck-pricing-foundations.md)
2. **Driver-app refactor** — introduce screen navigation before stacking more flows on top of the monolith. → [`driver-app-navigation.md`](./driver-app-navigation.md)
3. **Load manifest ("remito de carga")** — "load the truck" screen (products + quantities + photo), and per-truck stock (loaded − sold today = carries over to tomorrow). → [`load-manifest.md`](./load-manifest.md)
4. **Visit/container model** — extend `Sale` to support "received empty container: yes/no" and the "received empty, delivered nothing" churn case. → [`visit-container-model.md`](./visit-container-model.md)
5. **Point-in-time geolocation** — capture lat/lng when a sale is confirmed (no routing yet). → [`point-in-time-geolocation.md`](./point-in-time-geolocation.md)
6. **Customer picker + quick creation + proximity suggestion** — depends on 1 (registry) and 5 (location). → [`customer-picker-proximity.md`](./customer-picker-proximity.md)
7. **Payment proof photo** on a sale (same mechanism already used for expense receipts). → [`payment-proof-photo.md`](./payment-proof-photo.md)
8. **Live dashboard + admin-assigned daily customer list.** → [`live-dashboard-assigned-customers.md`](./live-dashboard-assigned-customers.md)
9. **Driver UX polish** — big buttons, minimal typing — final pass once the logic is solid.

## Cross-Cutting Decisions (apply to the whole roadmap unless a phase says otherwise)

- **Methodology**: formal SDD per phase (explore → proposal → spec → design → tasks → apply → verify → archive), artifacts persisted in Engram (project `sistema-de-reparto`), pace `auto` with orchestrator gate validation between phases.
- **File storage**: migrate from local disk to cloud object storage (S3-compatible) — photos of load manifests and payment/expense receipts are critical business records and must not live only on a single server's disk. Not yet scheduled to a specific phase.
- **Dashboard real-time**: simple polling (10–15s), not WebSockets/SSE, for the MVP of phase 8.
- **Container/churn event**: modeled as an extension of `Sale` (quantity 0, no payment method, `containerReturned` flag) rather than a separate `Visit` entity, to reuse existing audit/history infrastructure.
- **Review budget**: 800 changed lines per PR before stopping to evaluate chaining (delivery strategy: ask-on-risk).

## Status

| Phase | Change name | Status |
|---|---|---|
| 1. Domain foundations | `customer-truck-pricing-foundations` | Merged into `main` (PRs #3–#8, consolidated by #22) |
| 2. Driver-app refactor | `driver-app-navigation` | Merged into `main` (PRs #11–#20) |
| 3. Load manifest | `load-manifest` | Merged into `main` |
| 4. Visit/container model | `visit-container-model` | Merged into `main` |
| 5. Point-in-time geolocation | `point-in-time-geolocation` | Merged into `main` |
| 6. Customer picker + proximity | `customer-picker-proximity` | Merged into `main` |
| 7. Payment proof photo | `payment-proof-photo` | Merged into `main` |
| 8. Live dashboard + admin-assigned daily customer list | `live-dashboard-assigned-customers` | Merged into `main` |
| 9 | — | Not started |
