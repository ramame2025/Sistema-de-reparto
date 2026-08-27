# Change: Customer Directory Administration (Address + Map Pin)

Status: **planned — not implemented**. Written before any code, per the
owner's request to analyse first.

Related: [`customer-picker-proximity.md`](./customer-picker-proximity.md)
already shipped the driver-side half of this feature. Read it first — this
change deliberately does **not** rebuild any of it.

## Business Decisions Confirmed by the Owner

1. The admin assigns a customer's location by **dropping a pin on a map**
   (option A). Real `latitude`/`longitude` are stored, so an
   admin-created customer ranks in "Cerca tuyo" from day one, with no
   visit required.
2. A customer also gets a **street address**, as free text. It is
   **optional** — a customer may have a pin, an address, both, or neither.
3. The driver keeps the ability to create customers from the app.

## Current State (verified, not assumed)

Most of the requested behaviour already exists.

### Already built — do not rebuild

| Piece | Location |
|---|---|
| `Customer` model with `zone`, `latitude`, `longitude`, `isActive` | `apps/api/prisma/schema.prisma` |
| `GET /customers` (admin + chofer), `POST /customers` (admin + chofer), `DELETE /customers/:id` (admin, soft delete) | `apps/api/src/customers/customers.controller.ts` |
| `validateCreateCustomerInput`, `CreateCustomerInput`, `CustomerRecord` | `packages/shared/src/domain.ts` |
| `distanceKm` (haversine) + `sortByProximity` (sorts, never filters) | `packages/shared/src/geo.ts` |
| Driver picker: fresh GPS read, proximity ordering, "Cerca tuyo" badge on the nearest 5, name search, inline quick-create | `apps/driver-app/src/screens/CustomerPickerScreen.tsx` |
| Daily driver→customer route assignment | `apps/api/src/driver-customer-assignments/`, `apps/dashboard/src/app/admin/clientes-asignados/` |

### Gaps this change closes

1. **No admin screen for the customer directory.** `/admin/clientes-asignados`
   only *reads* `/customers` to build a driver's daily route. There is
   nowhere to list, create, or edit the directory itself.
2. **The CRUD has no U.** There is no `PATCH /customers/:id`. Drivers
   create customers in the street, from a phone, with the GPS reading of
   that moment and a hastily typed name — and nobody can correct any of
   it afterwards. Today the only remedy is delete-and-recreate, which
   orphans the sales history that `Sale.customerId` points at.
3. **No address field.** The schema has `zone` (free text) and
   coordinates. It has no `address`.
4. **No duplicate protection.** `POST /customers` accepts anything.
   With creation from two sides, "Kiosco Don José", "kiosco don jose"
   and "Don Jose" will accumulate as three separate customers, each with
   its own slice of the sales history.

## Design Decisions

**D1 — `address` is a nullable free-text column, not structured fields.**
No street/number/city split. The delivery business identifies a customer
by its pin and its name; the address is a human-readable hint for
whoever reads a report. Splitting it would impose a validation burden
with no consumer.

**D2 — `address` and coordinates are independent.** Neither implies nor
requires the other. Concretely: no geocoding, in either direction. An
address is never parsed into a pin, and a pin is never reverse-geocoded
into an address. This keeps the change free of any external service and
of the failure modes that rural or misspelled addresses bring with them.

**D3 — Leaflet + OpenStreetMap tiles for the map, via `react-leaflet`.**
It needs no API key and no billing account, which matters for an
internal tool. `apps/dashboard` currently has no map dependency at all.
OSM's tile usage policy requires visible attribution and suits modest
volume — an admin screen qualifies; a public-facing map would not.

**D4 — The map component is dynamically imported with `ssr: false`.**
Leaflet touches `window` at module scope and will crash Next's server
render otherwise. This is the single most common way this integration
breaks.

**D5 — Duplicate names are surfaced, never silently blocked.** `POST
/customers` compares against active customers by normalised name
(trimmed, lowercased, accent-folded) **within the same normalised zone**.
On a match it returns **409** with the conflicting record. The caller may
retry with `?allowDuplicate=true` to force creation.

> **Corrected during Phase 1.** This decision originally keyed on name
> alone. An existing test — `customers.service.spec.ts`, "creates a
> second customer with the same name in a different zone (both exist)" —
> already encoded the opposite rule deliberately: a chain of kiosks
> sharing one name across zones is several real customers, not a
> duplicate. Name alone would have made that case unreachable. The key is
> name + zone; a missing zone is its own bucket, never a wildcard.

Why this shape: a hard block would strand a driver standing in front of
a real, genuinely new customer whose name merely resembles an existing
one. Silent creation gives us the duplicate mess we are trying to
prevent. Returning the conflict lets each surface ask the right
question — the dashboard shows "this already exists, edit it instead?",
the app shows "¿es este cliente?" with a tap to pick the existing one.
The 409 turns a data-quality problem into a UI affordance.

**D6 — Driver quick-create never overwrites an existing customer's
coordinates.** It only ever supplies them for the record it creates.
Admin-set pins are deliberate; a passing GPS reading must not silently
displace one.

**D7 — `PATCH /customers/:id` is admin-only.** Creating is a field
activity; correcting the directory is an office activity. The driver's
app gets no edit surface in this change.

## Scope

### `packages/shared`
- `CustomerRecord`: add `address?: string`.
- `CreateCustomerInput`: add `address?: string`.
- New `UpdateCustomerInput` — every field optional: `name`,
  `customerType`, `zone`, `address`, `latitude`, `longitude`,
  `isActive`.
- New `validateUpdateCustomerInput`, reusing the existing range checks.
  It must reject an empty patch, and must reject a lone `latitude`
  without `longitude` (or the reverse) — a half-set coordinate pair is
  the one input that would silently drop a customer out of proximity
  ordering.
- New `normalizeCustomerName` — the shared normaliser behind D5, so the
  API and both clients agree on what "the same name" means.

### `apps/api`
- Migration: `Customer.address String?`.
- `PATCH /customers/:id` → `updateCustomer`, admin-only, 404 on unknown
  or already-inactive id.
- `createCustomer`: duplicate check per D5, `allowDuplicate` query flag.
- `toRecord`: map `address` null → undefined, as the other optionals do.

### `apps/dashboard`
- New `/admin/clientes`: searchable list, create, edit, deactivate.
- The create/edit form carries name, type, zone, address, and a map pin
  picker with a draggable marker; the pin is clearable.
- A "sin ubicación" counter with a filter, so an incomplete directory is
  visible rather than quietly rotting.
- New sidebar entry in `AdminSidebar.tsx`.

### `apps/driver-app`
- `CustomerPickerScreen`: show `address` as a secondary line on each row
  when present. Nothing else changes — proximity, search and
  quick-create already work.
- Handle the 409 from D5 in quick-create: offer the existing customer
  instead of failing.

### Explicitly out of scope
- Geocoding, in either direction (D2).
- Editing customers from the driver app (D7).
- Pagination of `GET /customers`. Noted below as a known limit.

## Risks

**R1 — `GET /customers` returns every active customer, unpaginated, and
the driver app downloads all of them.** This change makes the directory
easier to grow, so it brings the ceiling closer. Fine at tens or low
hundreds; not fine at thousands. Out of scope here, but it should be the
next change once the directory is actually in use.

**R2 — Leaflet SSR crash.** Mitigated by D4; a test that renders the
page must cover it.

**R3 — OSM tile policy.** Attribution is mandatory. If usage ever grows
beyond an internal admin screen, the tile source must be revisited.

**R4 — Accent folding.** `normalizeCustomerName` must fold accents, or
"José" and "Jose" defeat D5 on the very first try.

## Phases (chained PRs, each independently reviewable)

**Phase 1 — shared + API. ✅ DONE.** Migration, types, validators,
`PATCH`, duplicate check. TDD, matching the existing suites in
`apps/api/src/customers/`. No UI. This phase alone makes the directory
correctable, which is the most valuable single fix in this document.

Shipped: `address` column + migration; `UpdateCustomerInput`,
`validateUpdateCustomerInput`, `normalizeCustomerName` in
`packages/shared`; coordinate-pair validation on both create and update;
`PATCH /customers/:id` (admin-only); 409 duplicate detection with
`?allowDuplicate=true`. API suite 322 tests, 19 suites.

**Phase 2 — `/admin/clientes` without the map. ✅ DONE.** Full list,
search, create, edit, deactivate, address, sidebar entry. Coordinates are
not editable yet. Ships a usable admin screen with zero new dependencies
— and keeps the map's dependency and SSR risk out of a PR that already
carries the CRUD surface.

Shipped: the screen, the 409 duplicate affordance ("edit that one" vs
"create anyway"), the "sin ubicación" counter (pulled forward from
Phase 4, since the screen is where it belongs), and a guard test for the
`/admin/clientes` vs `/admin/clientes-asignados` prefix collision in the
sidebar. Dashboard suite 51 tests, 8 suites.

Two incidental fixes this phase forced, both worth knowing:
- `ApiError` discarded the response body, keeping only the status. The
  409's conflicting-customer payload was unreachable, which would have
  made D5's whole affordance impossible. It now carries `body`.
- The dashboard's jest could not load `@distribuidor/shared` at runtime —
  it is published as compiled ESM. Every previous dashboard import from
  that package was type-only, so the gap had never surfaced. `jest.config.ts`
  now maps the package to its TS sources.

**Phase 3 — the map pin.** Add `react-leaflet`, the dynamically imported
picker component, wire it into the Phase 2 form. Isolated, so if the map
library disappoints, only this PR is reverted.

**Phase 4 — directory hygiene.** "Sin ubicación" counter and filter in
the admin; `address` on the driver picker rows; 409 handling in
quick-create.

## Success Criteria

- An admin creates a customer with a pin, and that customer appears
  under "Cerca tuyo" for a driver standing nearby — with no prior visit.
- An admin corrects the name and pin of a customer a driver created, and
  the sales already linked to it stay linked.
- A second customer with an existing name cannot be created by accident,
  but can be created on purpose.
- A customer with no pin still appears in the picker's list and remains
  searchable — never filtered out.
- `address` is absent on existing rows and nothing breaks.
