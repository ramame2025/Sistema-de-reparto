# Change: Driver UX Polish — Big Buttons, Minimal Typing

**Phase**: 9 of 9, final ([roadmap](./README.md))
**SDD artifact store**: Engram (project `sistema-de-reparto`, topic keys `sdd/driver-ux-polish/*`)
**Status**: Planned — explore/proposal/spec/design/tasks complete, not yet implemented.

This is the roadmap's last phase. Unlike phases 1-8, it adds **no new model, no new endpoint, no
new screen** — it is an audit-driven polish pass over the eight screens `apps/driver-app` already
ships (`LoginScreen`, `HomeScreen`, `LoadManifestScreen`, `AssignedCustomersScreen`,
`NewSaleScreen`, `CustomerPickerScreen`, `ExpensesScreen`, `SyncScreen`), each originally built by
a different one of the previous eight phases with its own local conventions. The roadmap names two
goals — "big buttons" and "minimal typing" — without a concrete punch list. This document's
Explore section supplies that list by reading every screen's actual source, not by asserting
generic UX guidelines with no basis in this codebase.

## Session Preflight

- Pace: `auto` — single planning pass; the forecast (Tasks §) is small enough that no
  phase-by-phase gate is needed the way phases 3/4/6/8 required for their larger builds.
- Artifact store: `engram`
- Delivery strategy: `ask-on-risk` — forecast comes in well under the 800-line budget as a single
  PR (Tasks §); no pre-committed chain needed.
- Review budget: 800 changed lines per PR

## Business Decisions Confirmed by the Owner

| Decision | Chosen |
|---|---|
| What this phase builds | "Driver UX polish — big buttons, minimal typing — final pass once the logic is solid." (README, Phased Plan item 9) — the roadmap's own literal, final phase description. No functional/business scope: audit-only, driven by what's actually found in the eight shipped screens. |
| Scope discipline | Every change must be small, additive, and must not touch business logic, validation rules, or endpoints (task-level instruction), consistent with phases 1-8's own precedent of never redesigning an existing flow's behavior, only extending it. |

## Open Questions (Owner Unavailable — Conservative Assumption Applied)

| # | Question | Conservative assumption taken | Why reversible |
|---|---|---|---|
| 1 | `NewSaleScreen.tsx` line 74 initializes `customerName` to the literal string `'Cliente de prueba'` — a leftover default from Phase 2 (`git blame`-plausible: the field already carries a comment block, lines 74-83, explaining Phase 6's `pickedCustomer` sync logic, but the default itself predates it). Now that Phase 6's `CustomerPickerScreen` exists (with search + quick-create), should the field start **empty** — letting the already-present `placeholder="Nombre del cliente"` (line 429) show through, per "minimal typing" — or keep some non-empty default? | **Start empty, and add a client-side guard before all three flows that send `customerName` (`saveSale`, `updateLastSale`, `recordVisit`) rejecting a blank/whitespace value with an inline error** — using the already-exported, already-precedented shared validators (`validateCreateSaleInput`, `validateUpdateSaleInput`, `validateRecordEmptyVisitInput` — `packages/shared/src/domain.ts` lines 341, 494, 420), the exact "build payload → run shared validator → show `errors[0]`" pattern `LoadManifestScreen.tsx` (lines 162-166) already established, just never adopted by `NewSaleScreen.tsx`. **Why the guard is mandatory, not optional polish:** confirmed by reading `validateCreateSaleInput` (`domain.ts` lines 351-353) — `customerName.trim().length < 2` is already a hard *server-side* rejection today. `NewSaleScreen.tsx`'s `saveSale`/`updateLastSale`/`recordVisit` currently pre-check only `!truck` and (`saveSale` only) `currentItems.length === 0` before calling `trySendSale`/`api.patch`/`trySendEmptyVisit` — nothing pre-checks `customerName`. Blanking the default **without** adding the guard would let a chofer who ignores the field submit a request the API always 400s on — or, worse, silently succeed into `enqueueSale`'s **offline queue**, where it would keep failing every retry forever with no "fix your customer name" signal anywhere in `SyncScreen.tsx` (confirmed: `SyncScreen` renders `entry.lastError` as a raw string, `AssignedCustomersScreen`/`SyncScreen` have no per-field remediation UI). | Removing the guard later (back to "empty, no client check, let the API 400 explain it") is a two-line revert per call site. Re-adding a non-empty default later, if a chofer finds an empty field confusing, is equally trivial and touches nothing else. Neither direction touches the API, the shared validators, or any other screen. |

Confirmed **not** an open question needing escalation: `editReason` (`NewSaleScreen.tsx` line 97,
default `'Correccion de carga'`) and `cancelReason` (line 96, no default) are also free-text
fields that *could* in principle become selectors (task item 3's brief). Checked
`packages/shared/src/domain.ts` in full for an existing `EDIT_REASON`/`CANCEL_REASON`-style enum
to convert them to (the same way `EXPENSE_CATEGORIES` already backs `ExpensesScreen`'s category
buttons) — **none exists**. Inventing a reason taxonomy from scratch is a business-taxonomy
decision with no owner available to make it, and is explicitly out of this phase's "small,
additive, no new business logic" scope (Business Decisions, above) — left as-is, not converted,
not filed as an Open Question because there's no reversible "conservative default" to apply here:
it would be new scope, not a scope-preserving polish.

---

## 1. Explore

### Current State — screen-by-screen audit

**`apps/driver-app/src/screens/NewSaleScreen.tsx` (680 lines, read in full):**
- Line 74: `const [customerName, setCustomerName] = useState('Cliente de prueba');` — confirmed
  still present verbatim. Line 429's `TextInput` already carries
  `placeholder="Nombre del cliente"`, which is currently dead cosmetically — the field is never
  empty at mount, so the placeholder never renders in practice.
- Lines 564-569 (`"Editar ultima venta"` `Button`) and lines 583-587 (`"Anular ultima venta"`
  `Button`): neither passes a `variant` prop. `Button.tsx`'s default is `variant = 'primary'`
  (line 20) — so both render in the same primary color as line 529's `"Guardar venta"`. **Three
  primary-styled buttons stacked on one screen**, with no visual hierarchy distinguishing "the
  main action" from "edit the last sale" / "cancel the last sale." No other screen in the app has
  more than one primary-styled action button (`LoginScreen`, `ExpensesScreen`,
  `LoadManifestScreen`, `SyncScreen` each have exactly one primary `Button`, everything else
  `secondary`).
- Lines 328-337 (`updateLastSale`'s payload): does **not** include `customerId`, even though the
  screen holds it in state (`customerId`, line 83) and `saveSale`'s payload conditionally includes
  it (line 272: `...(customerId ? { customerId } : {})`). Traced server-side:
  `apps/api/src/sales/sales.service.ts`'s `updateSale` (line 228) calls the same
  `resolveCustomerAndTruck(input)` (line 257-258) that `createSale` uses, and
  `packages/shared/src/domain.ts` confirms `UpdateSaleInput = CreateSaleInput & { reason, kind? }`
  (line 82) — `customerId` is a valid, already-wired field on `UpdateSaleInput`, just never sent
  by this screen's edit flow. **This is a functional bug, not a UX issue**: editing a sale that
  was originally linked to a `Customer` record (via the Phase 6 picker) silently drops that link
  back to `null` on every edit, because `resolveCustomerAndTruck` receives `input.customerId ===
  undefined` and resolves `customerId = null` (service, line 57-73). Flagged separately per this
  phase's own scope rule ("if you find a functional bug, note it apart, don't fold it into UX
  scope unless trivial to fix in the same place") — this one qualifies as trivial: one line,
  mirroring `saveSale`'s own already-established conditional-spread pattern, in the same file
  already being touched for the `customerName` fix. Included in Tasks below as an explicitly
  labeled bug fix, not framed as "big buttons/minimal typing."
- Numeric input: `customerName`, `editReason`, `cancelReason` `TextInput`s are all genuinely
  free-text (name / reason strings) — none is a numeric field. No `keyboardType` gap found on this
  screen. Product quantities use the `Button`-based +/- stepper (lines 505-524), never a
  `TextInput` — no numeric keyboard question applies to them.
- Touch targets: every tappable control on this screen (`SegmentButton`, the +/- stepper, the
  envase toggle, all action buttons) is a `Button` — confirmed compliant via `Button.tsx`'s own
  `MIN_TOUCH_TARGET` (below).

**`apps/driver-app/src/components/Button.tsx` (59 lines) and
`apps/driver-app/src/theme/spacing.ts` (10 lines), both read in full:** `MIN_TOUCH_TARGET = 48`
(`spacing.ts` line 8, Phase 2 origin, asserted by `colors.test.ts` line 44:
`expect(MIN_TOUCH_TARGET).toBe(48)`). `Button.tsx` applies it directly on its base style
(`minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET`, lines 46-47), and `Button.test.tsx`
(lines 24-25) asserts `flatStyle.minHeight`/`minWidth >= MIN_TOUCH_TARGET`. **Grepped
`MIN_TOUCH_TARGET` across all of `apps/driver-app/src`: it is referenced in exactly four files —
`theme/index.ts`, `theme/spacing.ts`, `theme/colors.test.ts`, `Button.tsx`/`Button.test.tsx` —
and nowhere else.** Every screen's custom tappable controls outside `Button` were then checked one
by one for an explicit `minHeight`/`minWidth`:
- `apps/driver-app/src/screens/CustomerPickerScreen.tsx` — the customer-row `Pressable` (lines
  218-234, style `customerRow` at lines 295-303: `paddingVertical: spacing.sm` = 8, no
  `minHeight`/`minWidth` at all) is the **one and only non-`Button` tappable control found across
  all eight screens.** Two lines of text (bold `md`=16px name + `sm`=14px type) plus 8+8px
  vertical padding likely clears 48px in today's default font scale, but nothing enforces it —
  unlike `Button`, a future copy change, a shorter/blank `customerType`, or a device accessibility
  font-scale-down setting could silently shrink it below the touch-target minimum with no test to
  catch it (`CustomerPickerScreen.test.tsx`, read in full, has no `minHeight`/style assertion on
  this row at all).
- `apps/driver-app/src/screens/AssignedCustomersScreen.tsx` — its visually similar `customerRow`
  (lines 91-95, style lines 122-129) is a plain `View`, not a `Pressable` — not tappable at all
  (Design decision #14/#9 of the live-dashboard phase, confirmed: read-only list, no
  tap-to-navigate) — so it is correctly out of scope for a touch-target question; noted here only
  to explain why it wasn't flagged alongside its lookalike in `CustomerPickerScreen`.
- Every other custom-looking control — the product +/- stepper (`NewSaleScreen.tsx` lines 509-521,
  `LoadManifestScreen.tsx` lines 213-227), the customer-type/payment-method segmented rows
  (`NewSaleScreen.tsx`'s `SegmentButton`, lines 45-53), the envase toggle (`NewSaleScreen.tsx`
  lines 493-500), the expense-category row (`ExpensesScreen.tsx` lines 159-166), and the
  quick-create customer-type row (`CustomerPickerScreen.tsx` lines 249-257) — is a `<Button>`
  under the hood. All get `MIN_TOUCH_TARGET` for free, confirmed by reading each call site, not
  assumed from naming.

**`apps/driver-app/src/screens/LoadManifestScreen.tsx` (345 lines) and
`apps/driver-app/src/screens/ExpensesScreen.tsx` (272 lines), both read in full:**
- `LoadManifestScreen.tsx` lines 234-241: a `"Foto del remito (opcional)"` card holds a raw
  `TextInput` (`placeholder="Referencia foto (opcional)"`, testID `load-manifest-photo-ref`)
  **directly bound to the same `photoRef` state** that "Adjuntar desde galeria"/"Sacar foto del
  remito" (lines 242-255) already populate automatically after a successful upload. A driver has
  no legitimate reason to hand-type a photo URL; worse, because the field is a normal editable
  `TextInput` (`onChangeText={setPhotoRef}`), a driver could accidentally overwrite a just-uploaded
  URL with garbage, silently breaking the stored reference — nothing re-validates `photoRef` as a
  URL anywhere client- or server-side.
- `ExpensesScreen.tsx` lines 183-189: the identical pattern for `receiptRef` (testID
  `expense-receipt-ref`) — a raw `TextInput` sitting beside "Adjuntar desde galeria"/"Sacar foto
  comprobante" (lines 191-205), which already populate the same state. `ExpensesScreen.tsx` (lines
  207-212) *already* shows an `Image` preview once `receiptRef.length > 0` — the raw text field is
  fully redundant with that preview.
- **Confirmed inconsistency, not just a duplicate pattern**: `NewSaleScreen.tsx`'s equivalent
  payment-proof section (lines 462-490, Phase 7, the most recently built of the three) has **no**
  visible `TextInput` for `paymentProofRef` at all — only the two upload buttons and an `Image`
  preview (lines 479-488). Phase 7 already independently arrived at "don't expose the raw
  reference as typeable text" for the newest of the three near-identical upload flows;
  `LoadManifestScreen` (Phase 3) and `ExpensesScreen` (original, pre-Phase-1 baseline) never got
  the same treatment. This phase's fix is to bring the other two in line with the pattern
  Phase 7 already validated — not to invent a new pattern.
- `LoadManifestScreen.tsx`'s `note` field (lines 259-266, free text, optional) and `ExpensesScreen`'s
  own `note` field (lines 177-182) were checked against `packages/shared/src/domain.ts` for a
  backing enum the way `EXPENSE_CATEGORIES` backs the category buttons — none exists for either
  screen's free-text note. Genuinely open-ended fields (a load note, an expense description) with
  no known small value set; not converted, consistent with the `editReason`/`cancelReason`
  decision above.
- `ExpensesScreen.tsx` line 174: the `amount` `TextInput` already declares
  `keyboardType="numeric"`. Grepped every `<TextInput` across all eight screens — `customerName`,
  `editReason`, `cancelReason`, `searchText`, `quickCreateName`, `note` (both screens), `photoRef`,
  `receiptRef`, `username`, `password` are all genuinely textual; `amount` is the **only**
  currently-numeric-purpose field in the app, and it already has the right `keyboardType`.
  **No `keyboardType` gap exists anywhere in the app today** — confirmed, not a finding requiring
  a fix.

**Loading/error/empty-state consistency — all eight screens' render logic read in full:**
`HomeScreen.tsx` (lines 111-115) and `AssignedCustomersScreen.tsx` (lines 76-79) both use
`ActivityIndicator` + a text line, in a row, for their loading state (the pattern most recently
established, both Phase 8). `CustomerPickerScreen.tsx` (lines 203-206) instead renders a **plain
`<Text>Cargando clientes...</Text>`** with no `ActivityIndicator` — the one screen with a fetch-on-
mount loading state (Phase 6) that predates the `ActivityIndicator` convention Phase 8 established
afterward. `SyncScreen.tsx`, `NewSaleScreen.tsx`, `LoadManifestScreen.tsx`, `ExpensesScreen.tsx`
have no "screen just mounted, fetching" state (their only async states are button-label swaps
during `saving`/`uploadingPhoto`/etc., which are consistent everywhere: `"Guardando..."`-style
labels, `disabled` on the triggering `Button`) — not applicable to this check. `FeedbackBanner`
(error) and `EmptyState` (empty) usage is already fully consistent everywhere they apply — no
deviation found for either of those two states on any screen.

**`apps/driver-app/src/screens/HomeScreen.tsx` (249 lines, read in full):** three cards, three
primary/secondary calls: `"Actualizar resumen"` (no `variant`, so primary) sits above
`"Cargar camión"` (`variant="secondary"`, line 157) and `"Ver clientes de hoy"`
(`variant="secondary"`, line 182) — the two navigation CTAs a chofer is far more likely to tap
first thing in the day than a manual refresh button (`refreshDaySummary` already also runs
automatically on mount, line 87). This reads as a minor hierarchy inversion (a utility action
outranking two intent-driving navigation actions, visually) but is a **judgment call, not a
confirmed defect** the way `NewSaleScreen`'s triple-primary is — flagged in Design as a candidate,
resolved conservatively (see Design decision below).

### Approaches

**A — Fix everything in one PR, one work unit per screen touched — recommended.**
Total forecast (Tasks §) comes in well under the 800-line budget even before accounting for how
much of it is mechanical (a single-pattern `render()` → `renderScreen()` rename across
`NewSaleScreen.test.tsx`'s ~41 call sites, Tasks §). Splitting four small, unrelated screens'
fixes into four separate PRs would multiply review overhead (four PR descriptions, four review
passes) for work that's each individually tiny — the opposite of "small, additive polish."
Matches phase 8 sub-change A's own precedent (a config change small enough for one PR, not chained).

**B — One PR per screen (4 PRs).**
*Pros*: each PR is trivially reviewable in isolation, and if one screen's fix needs to be reverted
independently later, it's a clean revert.
*Cons*: none of the four fixes touch shared code or depend on each other, so there is no
sequencing benefit to splitting them, only overhead. `800`-line-budget risk is `None` even
combined (Tasks §) — there is no forecast-driven reason to chain.

**Recommendation: A.** Nothing here is large enough, or risky enough, to need isolation between
PRs — the fixes are independent by construction (different files) but small enough that reviewing
them together costs less than reviewing four separate PRs would.

**Photo/receipt reference field — remove the raw text field entirely vs. make it read-only
(`editable={false}`):**

**A — Remove the `TextInput` entirely, mirror `NewSaleScreen`'s already-shipped `paymentProofRef`
pattern (buttons + `Image` preview, no visible field) — recommended.**
*Pros*: directly matches "minimal typing" (task brief); removes the one place a driver could
accidentally corrupt an already-uploaded reference by typing over it; brings all three
photo/receipt upload flows in this app (payment proof, load manifest, expense) onto one
consistent, already-precedented pattern instead of two-out-of-three.
*Cons*: `ExpensesScreen`'s existing `Image` preview (lines 207-212) already covers "confirm the
upload worked" for that screen — but `LoadManifestScreen` has **no** `Image` preview today (only
the removed `TextInput` showed the raw URL as text), so removing its `TextInput` without adding a
preview would be a net loss of "did my photo attach" visibility. Addressed by adding the same
`Image`-preview block `ExpensesScreen`/`NewSaleScreen` already use, copied verbatim — not a new UI
pattern, reuse of an existing one.

**B — Keep the `TextInput`, set `editable={false}`.**
*Pros*: preserves the raw URL as visible text, in case a support/debug workflow ever wants it.
*Cons*: no such support/debug workflow is referenced anywhere in this codebase (checked — no
admin/dashboard surface displays a manifest or expense's raw `photoRef`/`receiptRef` string; the
dashboard's `reportes` page, read during a prior phase's Explore, shows resolved data, not raw
refs). A visually input-shaped element a driver can't actually edit still reads as an input, not
as "minimal typing" — worse UX than removing it, for a debug affordance nobody uses today.

**Recommendation: A**, with a new `Image` preview added to `LoadManifestScreen.tsx` (copied from
`ExpensesScreen.tsx`'s existing `receiptPreviewWrap`/`receiptPreview` style block, same JSX shape)
so no visible confirmation is lost.

**Customer-row touch target — explicit `minHeight` vs. `Pressable`'s `hitSlop`:**

**A — Add `minHeight: MIN_TOUCH_TARGET` directly on `customerRow`'s style — recommended.**
Matches `Button.tsx`'s own approach exactly: a real, guaranteed box, not an invisible hit-area
expansion. Testable the same simple way `Button.test.tsx` already established
(`flatStyle.minHeight >= MIN_TOUCH_TARGET`).

**B — `hitSlop={{ top, bottom }}` on the `Pressable`.**
*Pros*: doesn't visually grow the row — cheaper on a dense, unfiltered customer list.
*Cons*: `hitSlop` expands the *tap-registration* area without growing what the driver's thumb
*sees* as tappable — arguably still fails a "the visible target is big enough" read of "big
buttons," and can't be asserted with the same direct style check `Button.test.tsx` uses (would
need a hit-testing-specific assertion this codebase doesn't otherwise use).

**Recommendation: A** — consistent with the one pattern this codebase already tests for touch
targets.

**NewSaleScreen's triple-primary buttons — demote to `secondary` vs. add a `danger` variant:**

**A — Set `variant="secondary"` on `"Editar ultima venta"` and `"Anular ultima venta"` —
recommended.** Zero new component surface; reuses `Button`'s existing two variants exactly as
every other screen already does (exactly one primary action per screen/card).

**B — Add a third `variant: 'danger'` to `Button.tsx`, used only by `"Anular ultima venta"`.**
*Pros*: communicates severity more precisely — canceling a sale is destructive, editing isn't.
*Cons*: a new component-surface change (new variant, new color token, new `Button.test.tsx`
coverage) for a single button on a single screen, with no second destructive action anywhere else
in the app that would reuse it today — the same "building capability the current problem doesn't
need" pattern the roadmap's own phase 8 Explore flagged and rejected for `DriverTruckAssignment`-
style range logic. Speculative, not asked for.

**Recommendation: A** this phase. A `danger` variant is a reasonable idea for a *future* phase if
a second destructive action ever needs one — not built speculatively now.

### Risks

- The `customerName` empty-default + guard fix (Open Question 1) changes `NewSaleScreen`'s
  behavior for the first time in this app's history: a screen that always accepted "just press
  Guardar" now requires a name. Mitigated by the guard's message being explicit and immediate
  (inline `FeedbackBanner`, same mechanism every other validation failure on this screen already
  uses) rather than a delayed API 400 or a silently-stuck offline-queue entry — a net UX
  improvement, not just a behavior change, but flagged because it is technically new required
  input where none was enforced client-side before.
- `NewSaleScreen.test.tsx` has ~41 `it()` blocks, each calling `render(<NewSaleScreen />)`
  individually (confirmed — no shared render helper exists in the file today) with **no** test
  currently setting `customerName` via `fireEvent.changeText` before saving/editing/canceling —
  every one of them implicitly relies on the `'Cliente de prueba'` default remaining valid.
  Blanking the default without keeping most of that suite green requires either (a) editing every
  affected `it()` individually, or (b) extracting a single `renderSaleScreen()` helper that fills
  a valid `customerName` after rendering, then a mechanical `replace_all` of
  `render(<NewSaleScreen />)` → `renderSaleScreen()`. Option (b) is the one carried into Tasks
  below — same call-site count, but a single, low-risk, mechanical edit instead of 41 independent
  ones.
- The `updateLastSale` `customerId` fix is a genuine behavior change to a shipped flow (previously
  silently de-linking `Customer` on every edit). Low risk (one line, mirrors an already-shipped
  sibling pattern one function above it) but included here explicitly so `sdd-verify` checks it
  against a dedicated test, not folded silently into the `customerName` diff.
- None of these changes touch `apps/api`, `packages/shared`'s validators' *rules* (only start
  calling three of them from a screen that didn't before), Prisma, or any endpoint contract.

---

## 2. Proposal

# Proposal: Driver UX Polish — Big Buttons, Minimal Typing

### Intent

Close the roadmap's final, explicitly-named gap — "big buttons, minimal typing" — with the actual,
audited list of places the eight shipped driver-app screens fall short of a convention the app
itself already established elsewhere (`MIN_TOUCH_TARGET`, the `Button` primary/secondary
distinction, the `ActivityIndicator` loading pattern, the button-driven-upload-with-preview
pattern). No new capability, no new business rule — every fix either removes now-pointless typing,
guarantees an already-declared invariant (`MIN_TOUCH_TARGET`) that today only `Button` enforces, or
brings an older screen's copy-adapted pattern in line with a newer screen's already-shipped
improvement on it.

### Scope

**In Scope**
- `NewSaleScreen.tsx`: `customerName` starts empty (was `'Cliente de prueba'`); a client-side guard
  (reusing `validateCreateSaleInput`/`validateUpdateSaleInput`/`validateRecordEmptyVisitInput`)
  blocks `saveSale`/`updateLastSale`/`recordVisit` with an inline error when `customerName` is
  blank; `"Editar ultima venta"`/`"Anular ultima venta"` become `variant="secondary"`;
  `updateLastSale`'s payload gains the same conditional `customerId` spread `saveSale` already has
  (bug fix, trivial, same file).
- `CustomerPickerScreen.tsx`: `customerRow`'s style gains an explicit
  `minHeight: MIN_TOUCH_TARGET`; the loading state swaps from a plain `<Text>` to the
  `ActivityIndicator`-in-a-row pattern `HomeScreen`/`AssignedCustomersScreen` already use.
- `LoadManifestScreen.tsx`: the `photoRef` `TextInput` is removed; a new `Image` preview block
  (copied from `ExpensesScreen`'s existing one) renders once a photo is uploaded.
- `ExpensesScreen.tsx`: the `receiptRef` `TextInput` is removed (its existing `Image` preview
  already covers the "confirm it uploaded" need).
- Jest updates for every touched file, strict TDD (RED before GREEN), including the
  `NewSaleScreen.test.tsx` `renderSaleScreen()` helper extraction.

**Out of Scope**
- Any change to `apps/api`, any Prisma model, any endpoint's request/response shape, or any
  validator's *rules* (only three already-exported validators get a new *caller*, not new logic).
- Converting `editReason`/`cancelReason`/either screen's `note` field into selectors — no backing
  enum exists in `packages/shared`, and inventing one is a business-taxonomy decision with no
  owner available (Open Questions, above).
- A `danger` `Button` variant (Explore Approaches) — not built speculatively for one button.
- `HomeScreen`'s "Actualizar resumen" vs. navigation-CTA hierarchy — flagged in Explore as a
  candidate, resolved conservatively: left unchanged this phase (Design decision below explains
  why it's a judgment call, not a confirmed defect, unlike `NewSaleScreen`'s triple-primary).
- Any redesign of copy, layout, or information architecture beyond the specific items audited
  above — this is a polish pass, not a redesign (task-level instruction).

### Capabilities

**New**: none (no new capability surface — this phase closes existing gaps against existing,
already-declared invariants and patterns).
**Modified**: `NewSaleScreen`'s "create sale" / "edit sale" / "record empty visit" client-side
behavior gains input validation it previously lacked (Open Question 1) — server-side contract for
all three is completely unchanged, this is purely an earlier, friendlier rejection of the exact
same invalid input the API already rejected.

### Approach

Four independent, small, file-scoped fixes (Explore Approaches recommendation A: one PR). Every
fix reuses something this codebase already built and validated elsewhere — the shared validators
(already used by `LoadManifestScreen`), the `ActivityIndicator` loading pattern (already used by
`HomeScreen`/`AssignedCustomersScreen`), the `Image`-preview-instead-of-raw-text pattern (already
used by `NewSaleScreen`'s own, more recent payment-proof flow), and `Button`'s own
`MIN_TOUCH_TARGET` enforcement mechanism (copied onto `customerRow`). Nothing new is invented.

### Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `apps/driver-app/src/screens/NewSaleScreen.tsx` | Modified | Empty `customerName` default + validator-backed guard on 3 flows; button variant fix; `customerId` bug fix in `updateLastSale` |
| `apps/driver-app/src/screens/NewSaleScreen.test.tsx` | Modified | `renderSaleScreen()` helper (mechanical `replace_all` of ~41 call sites); new RED tests for the guard and the `customerId` fix |
| `apps/driver-app/src/screens/CustomerPickerScreen.tsx` | Modified | `customerRow` explicit `minHeight`; loading state → `ActivityIndicator` pattern |
| `apps/driver-app/src/screens/CustomerPickerScreen.test.tsx` | Modified | Style assertion for the new `minHeight`; loading-state assertion update |
| `apps/driver-app/src/screens/LoadManifestScreen.tsx` | Modified | Remove `photoRef` `TextInput`; add `Image` preview (copied from `ExpensesScreen`) |
| `apps/driver-app/src/screens/LoadManifestScreen.test.tsx` | Modified | Assertions moved from the removed field's `.props.value` to the new preview's `.props.source.uri` |
| `apps/driver-app/src/screens/ExpensesScreen.tsx` | Modified | Remove `receiptRef` `TextInput`; existing `Image` preview unchanged |
| `apps/driver-app/src/screens/ExpensesScreen.test.tsx` | Modified | Same assertion-target change as `LoadManifestScreen.test.tsx` |
| `apps/api/**`, `packages/shared/src/domain.ts` | Unchanged | No endpoint, schema, or validator-rule change — only new *callers* of existing validators |
| `HomeScreen.tsx`, `LoginScreen.tsx`, `SyncScreen.tsx`, `AssignedCustomersScreen.tsx` | Unchanged | Audited (Explore); no confirmed defect found on these four screens this phase |

### Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `NewSaleScreen.test.tsx`'s ~41-call-site touch (mechanical rename) is mistaken for a large, risky diff during review | Medium | Called out explicitly in the PR description and in this doc's Explore/Tasks — one pattern, one meaning, `replace_all` |
| A chofer relies on the removed `photoRef`/`receiptRef` raw-text field for a workflow not visible in this codebase | Low | No support/debug consumer of the raw ref string found anywhere (dashboard `reportes`, checked); reversible in one line if wrong |
| The `customerName` guard's copy ("Ingresá o elegí un cliente...") reads as unclear to a real driver | Low | Mirrors the phrasing style of every other inline guard already on this screen (`"No podes cargar ventas sin un camion asignado..."`) |
| Demoting `"Anular ultima venta"` to `secondary` makes a destructive action look less serious | Low | Accepted tradeoff this phase (Explore Approaches) — a `danger` variant is flagged as a reasonable future addition, not built speculatively for one button |

### Rollback Plan

Fully additive/cosmetic at the component level, one PR, four independently-revertible file groups
(no fix depends on another). Reverting `NewSaleScreen.tsx`'s guard restores today's "always
submits" behavior; reverting the `photoRef`/`receiptRef` removal restores the raw text field; no
migration, no endpoint, no historical row of any kind is touched by any part of this phase.

### Success Criteria

- [ ] `NewSaleScreen`'s customer-name field starts empty and shows its existing placeholder;
  attempting to save a sale, edit the last sale, or record an empty visit with a blank customer
  name shows an inline error and does not call the network/offline-queue layer.
- [ ] Editing the last sale after it was created via the customer picker keeps that sale linked to
  its `Customer` record (`customerId` survives an edit) instead of being silently cleared.
- [ ] `NewSaleScreen` has exactly one primary-styled button (`"Guardar venta"`); `"Editar ultima
  venta"` and `"Anular ultima venta"` render as secondary.
- [ ] `CustomerPickerScreen`'s customer rows are each at least 48×48 logical pixels, enforced the
  same testable way `Button` already is.
- [ ] `CustomerPickerScreen`'s loading state renders an `ActivityIndicator`, matching
  `HomeScreen`/`AssignedCustomersScreen`.
- [ ] `LoadManifestScreen` and `ExpensesScreen` no longer expose a hand-editable text field for
  the uploaded photo/receipt reference; both show an image preview once uploaded.
- [ ] `pnpm --filter driver-app test` passes in full, including every new/updated spec.
- [ ] No `apps/api` or `packages/shared` file changes in the diff.

---

## 3. Spec

# Spec: Driver UX Polish — Big Buttons, Minimal Typing

### Domain: new-sale-customer-name-guard (Modified behavior, existing screen)

**Requirement: A blank customer name blocks all three customer-name-carrying actions client-side**
`NewSaleScreen`'s `saveSale`, `updateLastSale`, and `recordVisit` MUST each run the payload they
are about to send through the matching already-exported shared validator
(`validateCreateSaleInput`, `validateUpdateSaleInput`, `validateRecordEmptyVisitInput`) before
calling any network/offline-queue function, and MUST show `errors[0]` via the existing
`FeedbackBanner` mechanism and return early when validation fails — mirroring
`LoadManifestScreen.saveManifest`'s already-shipped pattern exactly (lines 162-166).

- *Scenario: Blank customer name blocks a new sale* — GIVEN `customerName` is `''` (the new
  default) and at least one product quantity is set, WHEN "Guardar venta" is pressed, THEN
  `trySendSale`/`enqueueSale` are never called, and an inline error renders.
- *Scenario: Whitespace-only customer name is treated as blank* — GIVEN `customerName` is `'   '`,
  WHEN "Guardar venta" is pressed, THEN the same guard fires (`validateCreateSaleInput`'s own
  `.trim().length < 2` rule, unchanged, now just checked one step earlier).
- *Scenario: A valid customer name (typed or picked) proceeds normally* — GIVEN `customerName` is
  `'Kiosco Sur'` (typed or set via `pickedCustomer`), WHEN "Guardar venta" is pressed and all other
  existing preconditions hold (`truck` assigned, at least one item), THEN the existing save flow
  proceeds exactly as it does today — no behavior change for the valid-input path.
- *Scenario: The same guard applies to edit and record-visit* — GIVEN `customerName` is blank,
  WHEN `"Editar ultima venta"` or `"Registrar visita sin venta"` is pressed, THEN
  `api.patch`/`trySendEmptyVisit`/`enqueueEmptyVisit` are never called, and the matching inline
  error renders.

### Domain: new-sale-edit-preserves-customer-link (Bug fix, existing screen)

**Requirement: Editing the last sale preserves its `customerId` link**
`NewSaleScreen.updateLastSale`'s payload MUST conditionally include `customerId` exactly the way
`saveSale`'s payload already does (`...(customerId ? { customerId } : {})`), so that
`resolveCustomerAndTruck` (`apps/api/src/sales/sales.service.ts`) does not receive an implicit
`undefined` and null out a previously-set link.

- *Scenario: Editing a picker-linked sale keeps the link* — GIVEN a sale was created with
  `customerId: 'c1'` (via the picker), WHEN the driver edits it (same screen state,
  `customerId` still `'c1'` in local state), THEN the `PATCH` payload includes `customerId: 'c1'`.
- *Scenario: Editing a free-text sale is unaffected* — GIVEN a sale was created with no
  `customerId` (free-text name only), WHEN the driver edits it, THEN the payload omits
  `customerId`, identical to today's behavior.

### Domain: button-visual-hierarchy (Modified, `NewSaleScreen` only)

**Requirement: Exactly one primary-styled button on `NewSaleScreen`**
`"Editar ultima venta"` and `"Anular ultima venta"` MUST render with `variant="secondary"`.
`"Guardar venta"` keeps its default `variant="primary"`.

- *Scenario: Visual hierarchy is unambiguous* — GIVEN the screen is rendered, WHEN all buttons are
  inspected, THEN exactly one (`"Guardar venta"`) resolves to the primary background color.

### Domain: touch-target-guarantee (New enforcement, existing invariant)

**Requirement: `CustomerPickerScreen`'s tappable customer row meets `MIN_TOUCH_TARGET`**
`customerRow`'s style MUST declare `minHeight: MIN_TOUCH_TARGET` (48), enforced the same way
`Button.test.tsx` already enforces it for `Button`.

- *Scenario: Row height is guaranteed regardless of content* — GIVEN a customer with a very short
  name and no visible badge, WHEN the row renders, THEN its resolved style's `minHeight` is still
  `>= 48`.

### Domain: photo-reference-not-hand-typed (Modified, two screens)

**Requirement: `photoRef`/`receiptRef` are never exposed as an editable text field**
`LoadManifestScreen.tsx` and `ExpensesScreen.tsx` MUST NOT render a `TextInput` bound to
`photoRef`/`receiptRef`. Both MUST render an `Image` preview once that state is non-empty,
matching `ExpensesScreen`'s existing preview shape.

- *Scenario: No text field exists for the reference* — GIVEN either screen is rendered, WHEN
  queried for a `TextInput` bound to the photo/receipt reference, THEN none is found.
- *Scenario: A successful upload shows a preview, not raw text* — GIVEN a photo/receipt upload
  succeeds, WHEN the screen re-renders, THEN an `Image` with `source.uri` equal to the uploaded
  URL is present.

---

## 4. Design

# Design: Driver UX Polish — Big Buttons, Minimal Typing

### Technical Approach

Four independent, component-local fixes, each reusing an existing pattern already proven
elsewhere in this codebase rather than inventing a new one. No shared module, no new dependency,
no cross-screen coupling introduced.

### Architecture Decisions

| # | Decision | Choice | Rejected | Rationale |
|---|---|---|---|---|
| 1 | `customerName` initial value | Empty string, existing `placeholder` now visible | Keep a non-empty smart default (e.g. `''` vs. a friendlier placeholder-string default) | "Minimal typing" (task brief) means pushing toward the Phase-6 picker, not toward a value that has to be manually erased every time; a non-empty default was only ever a Phase-2-era test convenience |
| 2 | Guard implementation | Reuse `validateCreateSaleInput`/`validateUpdateSaleInput`/`validateRecordEmptyVisitInput`, already exported by `packages/shared` | Hand-roll a new one-off `customerName.trim().length < 2` check local to `NewSaleScreen.tsx` | Zero new validation logic to review or keep in sync with the server's own rule; matches `LoadManifestScreen.saveManifest`'s already-shipped "validator → `errors[0]`" pattern exactly, which this screen simply never adopted |
| 3 | Test-suite adaptation for the guard | Extract a `renderSaleScreen()` helper (renders + fills a valid `customerName`), `replace_all` every `render(<NewSaleScreen />)` call site | Edit each of ~41 `it()` blocks individually | Same outcome, one mechanical edit instead of 41 independent ones — lower review risk despite a similar line count, since it's one pattern applied uniformly, not 41 separate judgment calls |
| 4 | `updateLastSale`'s `customerId` | Add the same conditional spread `saveSale` already has | Leave as-is, file as a standalone future bug-fix ticket | Trivial (one line), same file already being touched, mirrors an existing pattern one function away — meets this phase's own "fix functional bugs found along the way only if trivial in the same place" allowance |
| 5 | `NewSaleScreen` button hierarchy | `"Editar ultima venta"`/`"Anular ultima venta"` → `variant="secondary"` | Add a `danger` `Button` variant | No second destructive action anywhere else in the app to justify a new component variant; Explore's Approaches flagged this as scope creep beyond one button |
| 6 | `CustomerPickerScreen` touch target | Explicit `minHeight: MIN_TOUCH_TARGET` on `customerRow`'s style | `hitSlop` on the `Pressable` | Matches `Button`'s own enforcement mechanism, testable the same simple way `Button.test.tsx` already is; `hitSlop` grows only the tap-registration area, not what "big buttons" visually promises |
| 7 | `CustomerPickerScreen` loading state | Swap plain `<Text>` for the `ActivityIndicator`-in-a-row pattern | Leave as `<Text>` only | `HomeScreen`/`AssignedCustomersScreen` (both later phases) already established this as the app's loading convention; `CustomerPickerScreen` predates it and was never updated |
| 8 | `photoRef`/`receiptRef` fields | Remove the `TextInput`; use/add an `Image` preview | Keep `TextInput` with `editable={false}` | No debug/support consumer of the raw ref string exists anywhere in this codebase (checked); a visually-input-shaped but non-editable field still reads as an input, undermining "minimal typing"'s intent |
| 9 | `LoadManifestScreen`'s missing preview | Copy `ExpensesScreen`'s existing `receiptPreviewWrap`/`receiptPreview` style block verbatim | Design a new preview layout for this screen | No redesign — reuse an already-shipped, already-tested visual pattern for the identical upload mechanism (`POST /uploads/receipt`, reused across both screens already) |
| 10 | `HomeScreen`'s button-hierarchy candidate (Explore) | Leave unchanged this phase | Demote `"Actualizar resumen"` to secondary | A judgment call, not a confirmed defect the way `NewSaleScreen`'s literal triple-primary is (`"Actualizar resumen"` is still the *only* primary button on that screen — no ambiguity about which action is primary, just a debatable choice of *which* one). Conservative: don't touch what isn't confirmed broken |

### File Changes

| File | Action | Description |
|---|---|---|
| `apps/driver-app/src/screens/NewSaleScreen.tsx` | Modify | Empty `customerName` default; import + call the three validators; `variant="secondary"` on 2 buttons; `customerId` spread in `updateLastSale` |
| `apps/driver-app/src/screens/NewSaleScreen.test.tsx` | Modify | RED-first: new guard/bug-fix tests; `renderSaleScreen()` helper + `replace_all` |
| `apps/driver-app/src/screens/CustomerPickerScreen.tsx` | Modify | `customerRow` style `minHeight`; loading state → `ActivityIndicator` |
| `apps/driver-app/src/screens/CustomerPickerScreen.test.tsx` | Modify | RED-first: style assertion; loading-state assertion |
| `apps/driver-app/src/screens/LoadManifestScreen.tsx` | Modify | Remove `photoRef` `TextInput`; add `Image` preview block |
| `apps/driver-app/src/screens/LoadManifestScreen.test.tsx` | Modify | RED-first: preview assertions replace removed-field assertions |
| `apps/driver-app/src/screens/ExpensesScreen.tsx` | Modify | Remove `receiptRef` `TextInput` |
| `apps/driver-app/src/screens/ExpensesScreen.test.tsx` | Modify | RED-first: preview assertions replace removed-field assertions |

### Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Component, `NewSaleScreen` | Blank/whitespace `customerName` blocks all 3 flows with the right error and no network/queue call; valid `customerName` (typed or picked) proceeds unchanged; edited sale's payload includes `customerId` when one is set; exactly one primary `Button` on the screen | Extend `NewSaleScreen.test.tsx` via the new `renderSaleScreen()` helper |
| Component, `CustomerPickerScreen` | `customerRow`'s flattened style has `minHeight >= MIN_TOUCH_TARGET`; loading state renders an `ActivityIndicator` | Extend `CustomerPickerScreen.test.tsx` |
| Component, `LoadManifestScreen`/`ExpensesScreen` | No `TextInput` bound to the photo/receipt ref exists; a successful upload renders an `Image` with the right `source.uri` | Extend both existing test files, adapting the ~5-6 assertions currently targeting the removed field's `.props.value` |
| E2E | None this phase | Consistent with every prior phase — no live-Postgres E2E suite exists yet |

Mandatory RED tests before any implementation: the `customerName` guard (3 scenarios, one per
flow); the `customerId` preservation on edit; the button-variant assertion; the `minHeight`
assertion; the "no `TextInput` for the ref" assertion on both photo/receipt screens.

### Migration / Rollout

No migration, no backend deploy, no schema change. Single PR, deployable and revertible as one
unit (Explore Approaches recommendation A) — every fix is file-scoped and independent of the
others, so a partial revert (e.g. keeping the touch-target fix but reverting the `customerName`
guard) is possible without touching unrelated files, even though they ship together.

### Resolved Open Questions

1. `customerName` starts empty; a client-side guard (reusing existing shared validators) blocks
   the three affected actions on blank input, surfaced via the existing inline-error mechanism.

---

## 5. Tasks

# Tasks: Driver UX Polish — Big Buttons, Minimal Typing

### Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines — `NewSaleScreen.tsx` + test | ~90-110 (≈15-20 in the component; ≈75-90 in the test file, most of it the mechanical `renderSaleScreen()` `replace_all` across ~41 call sites plus a handful of new RED tests) |
| Estimated changed lines — `CustomerPickerScreen.tsx` + test | ~20-25 |
| Estimated changed lines — `LoadManifestScreen.tsx` + test | ~35-40 (new `Image` preview block + assertion rewiring) |
| Estimated changed lines — `ExpensesScreen.tsx` + test | ~20-25 |
| Estimated total | ~170-200 |
| Review budget | 800 lines per PR |
| 800-line budget risk | None — comfortably under budget as a single PR; a large fraction of the total is a single mechanical rename, not organic new logic (flagged explicitly for the reviewer) |
| Chained PRs recommended | No — single PR, `ask-on-risk` applies but the forecast never approaches the budget |

### Work Units

| Unit | Goal | Focused test command | Runtime check | Rollback boundary |
|------|------|----------------------|------------------|--------------------|
| 1 | `NewSaleScreen` — empty default + guard, button hierarchy, `customerId` bug fix | `pnpm --filter driver-app test -- NewSaleScreen` | Open "Nueva Venta," leave the customer field blank, press "Guardar venta" — confirm an inline error and no network/queue call; pick a customer, save, then edit it — confirm the edit still resolves to the same `Customer` server-side; confirm only "Guardar venta" is the accent color | Revert `NewSaleScreen.tsx`/`.test.tsx`; screen returns to today's always-`'Cliente de prueba'`-default behavior |
| 2 | `CustomerPickerScreen` — touch target + loading indicator | `pnpm --filter driver-app test -- CustomerPickerScreen` | Open the picker with a slow/throttled network, confirm a spinner (not plain text) while loading; confirm each row is comfortably tappable | Revert this file pair only; independent of Unit 1 |
| 3 | `LoadManifestScreen` — remove `photoRef` text field, add preview | `pnpm --filter driver-app test -- LoadManifestScreen` | Load a manifest photo via gallery or camera, confirm an image preview appears and no text field for the URL exists | Revert this file pair only; independent of Units 1-2 |
| 4 | `ExpensesScreen` — remove `receiptRef` text field | `pnpm --filter driver-app test -- ExpensesScreen` | Attach a receipt photo, confirm the existing preview still shows it and no text field for the URL exists | Revert this file pair only; independent of Units 1-3 |

All four units are independent of each other (different files, no shared new code) and can be
implemented/reviewed in any order or in parallel.

### Phase 1: `NewSaleScreen` — Guard, Hierarchy, Bug Fix

- [ ] 1.1 RED: `NewSaleScreen.test.tsx` — add `renderSaleScreen()` helper (renders, then
  `fireEvent.changeText`s a valid `customerName`); `replace_all` every existing
  `render(<NewSaleScreen />)` call site to use it, so the full existing suite stays green once the
  default is blanked.
- [ ] 1.2 RED: new tests — blank/whitespace `customerName` blocks `saveSale`/`updateLastSale`/
  `recordVisit` (3 scenarios) with the expected inline error and no `trySendSale`/`enqueueSale`/
  `api.patch`/`trySendEmptyVisit`/`enqueueEmptyVisit` call; editing a sale created with a
  `customerId` preserves it in the `PATCH` payload; exactly one `Button` resolves to the primary
  background color.
- [ ] 1.3 GREEN: `NewSaleScreen.tsx` — `customerName` default → `''`; import
  `validateCreateSaleInput`/`validateUpdateSaleInput`/`validateRecordEmptyVisitInput`; call the
  matching validator and `return` on `errors.length > 0` (showing `errors[0]`) at the top of
  `saveSale`/`updateLastSale`/`recordVisit`; add `...(customerId ? { customerId } : {})` to
  `updateLastSale`'s payload; `variant="secondary"` on `"Editar ultima venta"`/`"Anular ultima
  venta"`.
- [ ] 1.4 Manual/runtime check: per Work Unit 1's Runtime check column.

### Phase 2: `CustomerPickerScreen` — Touch Target + Loading Pattern

- [ ] 2.1 RED: `CustomerPickerScreen.test.tsx` — assert `customerRow`'s flattened style has
  `minHeight >= MIN_TOUCH_TARGET`; assert the loading state renders an `ActivityIndicator`
  (`testID` or `UNSAFE_getByType`, matching how `HomeScreen.test.tsx`/
  `AssignedCustomersScreen.test.tsx` already assert their own loading indicator).
- [ ] 2.2 GREEN: `CustomerPickerScreen.tsx` — add `minHeight: MIN_TOUCH_TARGET` to `customerRow`'s
  style (import `MIN_TOUCH_TARGET` from `../theme/spacing`); replace the loading `<Text>` with the
  `ActivityIndicator`-in-a-`View`-row pattern copied from `HomeScreen.tsx` lines 111-115.
- [ ] 2.3 Manual/runtime check: per Work Unit 2's Runtime check column.

### Phase 3: `LoadManifestScreen` — Remove Text Field, Add Preview

- [ ] 3.1 RED: `LoadManifestScreen.test.tsx` — rewrite the assertions currently targeting
  `getByTestId('load-manifest-photo-ref').props.value` (lines 212, 223, 235, 250, 255 today) to
  instead assert on a new preview `Image`'s `testID`/`source.uri`; add an assertion that no
  `TextInput` bound to the photo reference exists.
- [ ] 3.2 GREEN: `LoadManifestScreen.tsx` — remove the `photoRef` `TextInput` (lines 235-241
  today); add an `Image` preview block (copied from `ExpensesScreen.tsx`'s
  `receiptPreviewWrap`/`receiptPreview`, same conditional-render-on-non-empty-`photoRef` guard).
- [ ] 3.3 Manual/runtime check: per Work Unit 3's Runtime check column.

### Phase 4: `ExpensesScreen` — Remove Text Field

- [ ] 4.1 RED: `ExpensesScreen.test.tsx` — rewrite the assertions currently targeting
  `getByTestId('expense-receipt-ref').props.value` (lines 109, 123, 136, 162, 171 today) to assert
  on the existing preview `Image`'s `source.uri` instead (give it a `testID` if it doesn't already
  have one); add an assertion that no `TextInput` bound to the receipt reference exists.
- [ ] 4.2 GREEN: `ExpensesScreen.tsx` — remove the `receiptRef` `TextInput` (lines 183-189 today);
  keep the existing `Image` preview block unchanged (add a `testID` to it if needed for 4.1).
- [ ] 4.3 Manual/runtime check: per Work Unit 4's Runtime check column.

### Phase 5: Verification

- [ ] 5.1 Run `pnpm --filter driver-app test` (all suites green, including all four
  units above).
- [ ] 5.2 Confirm `git diff --stat` touches only `apps/driver-app/src/screens/*.{tsx,test.tsx}` —
  no `apps/api`, `packages/shared`, or `apps/dashboard` file in the diff.
- [ ] 5.3 Full manual smoke: log in as a chofer, start a new sale with a blank customer field and
  confirm the guard fires; pick a customer, save, edit, confirm the link survives; load a manifest
  photo and an expense receipt, confirm both show previews with no raw-URL text field; open the
  customer picker on a throttled connection and confirm the spinner; confirm every row in the
  picker list is comfortably tappable.

### Notes

- No threat-matrix rows apply — this phase adds no new HTTP surface, no new auth path, and no new
  input surface beyond validation that was already enforced server-side.
- Open Question 1 (top of document) is a design-binding assumption made without the owner
  available — re-confirm before `sdd-apply` if there is any opportunity to do so, though the
  underlying server-side rule (`customerName.trim().length >= 2`) it now enforces earlier is not
  itself new or in question.
- This is the roadmap's final phase. Once Phase 5's verification passes, every phase in
  `docs/plans/README.md`'s Phased Plan (1-9) will have a completed planning document; only 9's
  actual `sdd-apply`/`sdd-verify`/`sdd-archive` remain to close out the roadmap end to end.

---

## Next Step

Run `sdd-apply` for any of Units 1-4 — all four are independent and can proceed in parallel or in
any order. Strict TDD Mode is active for `apps/driver-app`: every GREEN task must be preceded by a
failing RED test. Unit 1 is the largest (mostly mechanical) and the one most worth flagging to a
human reviewer as "large diff, small actual change" ahead of time, given the `renderSaleScreen()`
`replace_all` across `NewSaleScreen.test.tsx`. Before starting, flag Open Question 1 to the owner
one more time if they become reachable — none of the four units block on it being answered
differently than assumed here, since the conservative choice (guard the input, don't silently
allow bad state) is the harder-to-regret direction either way.
