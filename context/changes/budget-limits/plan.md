# Per-Category Budget Limits — Implementation Plan

## Overview

Build S-04: users set an optional monthly budget limit per category via the `/categories`
page using an always-visible inline number input. The dashboard spending breakdown enriches
each category row with a `spent / limit` display, a muted "X.XX remaining" sub-line when
under budget, or a red "+X.XX over" sub-line when over budget. Categories with no limit
are visually unchanged.

## Current State Analysis

- `budget_limits` table fully in place — unique constraint `(user_id, category_id)`,
  `monthly_limit > 0` check constraint, RLS enabled, auto-updated `updated_at` trigger.
  `database.types.ts` types `monthly_limit` as `number`.
- `BudgetLimit` type in `src/types.ts:24-30` — present but unused.
- No service functions or API endpoints for budget limits exist.
- `getMonthBreakdown` in `src/lib/services/expenses.ts:18` returns `CategoryTotal[]` with
  `category_id`, `category_name`, and `total` only. No budget data.
- `CategoryTotal` is exported from `expenses.ts` and imported in `dashboard.astro` — the
  only consumer. Adding an optional `limit?: number` field is backward-compatible.
- Categories page (`src/pages/categories.astro`) fetches `getCategoriesWithExpenseCounts`
  and uses form POST → redirect for all mutations.

## Desired End State

After this plan is complete:
- On `/categories`, each category row has a compact number input (pre-filled with its limit
  if one is set, empty with "No limit" placeholder otherwise), a "Save limit" button, and
  a "Remove limit" link (only shown when a limit is set).
- Submitting a valid amount upserts the limit; clicking "Remove limit" deletes it.
- On the dashboard, categories with a limit show `total / limit`; under-budget rows show
  a muted "X.XX remaining" sub-line; over-budget rows show total/limit in red and a red
  "+X.XX over" sub-line. Categories without limits are unchanged.

### Key Discoveries

- `budget_limits` unique constraint on `(user_id, category_id)` → Supabase upsert with
  `onConflict: 'user_id,category_id'` handles insert and update in a single call.
- Both the upsert and remove actions are HTML form POSTs (not fetch), so all endpoints
  redirect on success/failure — same pattern as `/api/categories/`.
- A single API file `src/pages/api/budget-limits/[category_id].ts` handles both operations:
  `_action=remove` in formData → delete; presence of a valid `limit` field → upsert.
  This avoids the Astro routing conflict between `[id].ts` (file) and `[id]/delete.ts`
  (which would require a `[id]/` directory at the same path level).
- `monthly_limit` in the DB is `numeric(12,2)` and is typed as `number` in
  `database.types.ts` (unlike `expenses.amount` which is a string at runtime). Budget
  limit arithmetic can use the value directly without `parseFloat(String(...))`.
- Security: all budget-limit mutations include `.eq("user_id", userId)` so a user cannot
  modify another user's limit by guessing a category_id.

## What We're NOT Doing

- Not implementing per-month budget limits — one persistent limit applies to all months.
- Not showing budget context on the `/expenses` list page — dashboard breakdown only (PRD scope).
- Not adding a "warning at X% of limit" threshold — just under/over.
- Not seeding any default budget limits for existing categories.
- Not changing the `/categories` page's existing category CRUD — only adding the limit forms.

## Implementation Approach

Three sequential phases:

1. **Data layer and API endpoint** — extend `CategoryTotal`, enrich `getMonthBreakdown`,
   new service file, new API endpoint. No UI.
2. **Categories page** — add inline limit input + Save + conditional Remove per category row.
3. **Dashboard overrun markers** — update breakdown rendering with limit/remaining/overrun.

## Critical Implementation Details

**Single-file double-action endpoint.** `src/pages/api/budget-limits/[category_id].ts`
exports one `POST` handler that checks for `_action === "remove"` in formData to branch
between delete and upsert. The "Remove limit" form must include
`<input type="hidden" name="_action" value="remove">`.

**`getMonthBreakdown` now fetches three tables.** The function's third Promise.all leg
queries `budget_limits` with `.select("category_id, monthly_limit")`. The existing two
legs are unchanged; only the merge step and return type are extended.

---

## Phase 1: Data Layer and API Endpoint

### Overview

Extend the type system and service layer, then add a single API endpoint that handles both
upsert and delete via an action discriminator. No UI. Every contract Phases 2 and 3 depend
on is established here.

### Changes Required

#### 1. Extend `CategoryTotal` with optional limit field

**File:** `src/lib/services/expenses.ts`

**Intent:** Make the budget limit available to any consumer of `getMonthBreakdown` without
breaking existing code. The field is `undefined` for categories with no limit set.

**Contract:** Add `limit?: number` to the `CategoryTotal` interface. All existing callers
continue to work — the field is optional.

#### 2. Extend `getMonthBreakdown` to include budget limits

**File:** `src/lib/services/expenses.ts`

**Intent:** Fetch the user's budget limits in parallel with the existing expense and
category queries, then merge the limit into each `CategoryTotal` entry.

**Contract:** Add a third leg to the existing `Promise.all`:
`supabase.from("budget_limits").select("category_id, monthly_limit").eq("user_id", userId)`.
Build a `Map<string, number>` keyed by `category_id` from that result. When mapping
totals into the return array, include `limit: limitsMap.get(category_id)` — `undefined`
when the category has no limit.

#### 3. New budget-limits service

**File:** `src/lib/services/budget-limits.ts` (new)

**Intent:** Encapsulate all budget-limit reads and writes so API endpoints stay thin and
the categories page can pre-fill inputs server-side.

**Contracts:**

```typescript
// Returns all budget limits for the user. Used by categories.astro to pre-fill inputs.
export async function getBudgetLimits(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<BudgetLimit[]>
// .select("*").eq("user_id", userId)

// Upserts (insert or update) the monthly limit for a category.
// Uses onConflict to handle the unique(user_id, category_id) constraint.
// Throws the raw Supabase error on failure.
export async function upsertBudgetLimit(
  supabase: SupabaseClient<Database>,
  userId: string,
  categoryId: string,
  amount: number, // already validated positive by caller
): Promise<void>
// .upsert({ user_id: userId, category_id: categoryId, monthly_limit: amount },
//   { onConflict: 'user_id,category_id' })

// Deletes the budget limit for a category owned by userId.
// No-op if no limit exists (delete on empty set is safe).
// Throws the raw Supabase error on failure.
export async function deleteBudgetLimit(
  supabase: SupabaseClient<Database>,
  userId: string,
  categoryId: string,
): Promise<void>
// .delete().eq("user_id", userId).eq("category_id", categoryId)
```

#### 4. API endpoint — upsert or delete budget limit

**File:** `src/pages/api/budget-limits/[category_id].ts` (new)

**Intent:** Single POST handler that branches on `_action`: removes the limit when
`_action === "remove"`, upserts it otherwise. Returns redirect on all outcomes so HTML
form submissions work without JavaScript.

**Contract:**

- Auth guard: redirect to `/auth/signin` if no user or supabase.
- If `params.category_id` is falsy: `redirect("/categories?error=Invalid category.")`.
- Read `_action` from formData:
  - `"remove"`: call `deleteBudgetLimit(supabase, user.id, params.category_id)`.
    On success: `redirect("/categories")`. On error: `redirect("/categories?error=Failed to remove limit.")`.
  - Otherwise: parse `limit` field as float; validate positive (`> 0`, not `NaN`).
    Validation failure: `redirect("/categories?error=Budget limit must be a positive number.")`.
    Call `upsertBudgetLimit(supabase, user.id, params.category_id, amount)`.
    On success: `redirect("/categories")`. On error: `redirect("/categories?error=Failed to save limit.")`.

### Success Criteria

#### Automated Verification:
- `npm run lint && npm run build` exits 0.
- TypeScript compiles extended `CategoryTotal` (with optional `limit?`) without errors.
- `src/pages/api/budget-limits/[category_id].ts` and `src/lib/services/budget-limits.ts`
  both exist.

#### Manual Verification:
- (None — UI built in Phases 2 and 3.)

---

## Phase 2: Categories Page — Set/Remove Limits

### Overview

Fetch existing limits in the categories page frontmatter and add a compact limit form
to each category row. All mutations are form POST → redirect, matching the existing
page pattern.

### Changes Required

#### 1. Update frontmatter of `/categories`

**File:** `src/pages/categories.astro`

**Intent:** Load existing budget limits server-side so each category row can pre-fill
its input and conditionally render the "Remove limit" link.

**Contract:**
- Import `getBudgetLimits` from `@/lib/services/budget-limits`.
- Inside the `if (supabase && user)` block, fetch alongside categories:
  `const limits = await getBudgetLimits(supabase, user.id)`.
- Build a map for O(1) lookup: `const limitsMap = new Map(limits.map(l => [l.category_id, l.monthly_limit]))`.
  `l.monthly_limit` is typed as `number` from the DB — no string conversion needed.

#### 2. Update category row template

**File:** `src/pages/categories.astro`

**Intent:** Each category row gains a budget limit section below the existing name/count/delete
line. The section contains a save form (always rendered) and a remove form (conditional).

**Contract:** Within each `<li>` in the categories list, below the existing row content,
add:

Save form (`method="POST" action="/api/budget-limits/{cat.id}"`):
- `<input type="number" name="limit" step="0.01" min="0.01"
         value={limitsMap.get(cat.id) ?? ""}
         placeholder="No limit" />`
- Submit button: "Save limit"

Remove form (rendered only when `limitsMap.has(cat.id)`, `method="POST"`,
`action="/api/budget-limits/{cat.id}"`):
- `<input type="hidden" name="_action" value="remove" />`
- Submit button: small muted "Remove limit" link-style button

Styling: follow the compact control aesthetic established in `ExpenseForm.tsx` — small
inputs, subdued action colors. The remove button should be text-only (no background),
styled like the "Manage categories" link on the dashboard.

### Success Criteria

#### Automated Verification:
- `npm run lint && npm run build` exits 0.

#### Manual Verification:
- Categories page loads; each category row shows a number input with "No limit" placeholder.
- Categories with a pre-existing limit show the input pre-filled with that limit value.
- Entering a valid positive number and clicking "Save limit" persists the limit (reload shows
  the value pre-filled).
- Submitting an empty or invalid amount shows the error banner.
- "Remove limit" link appears only for categories with a limit; clicking it removes it (input
  returns to empty on reload).
- Setting/removing a limit does not affect the category's expenses or delete the category.

---

## Phase 3: Dashboard Overrun Markers

### Overview

Update the dashboard breakdown rendering to display budget context. `getMonthBreakdown`
already returns the enriched `CategoryTotal` with `limit?` after Phase 1 — only the
template markup needs to change.

### Changes Required

#### 1. Update breakdown list in the dashboard

**File:** `src/pages/dashboard.astro`

**Intent:** For categories with a budget limit, replace the single amount with a
`spent / limit` pair and a contextual sub-line showing remaining or overrun amount.

**Contract:** Within the `breakdown.map()` list rendering:

- If `item.limit` is `undefined` (no limit set): render exactly as today —
  `<span class="text-sm font-semibold text-blue-200">{item.total.toFixed(2)}</span>`.

- If `item.limit` is defined and `item.total <= item.limit` (under or at budget):
  - Right-side amount: `{item.total.toFixed(2)} / {item.limit.toFixed(2)}` in blue.
  - Sub-line below: `{(item.limit - item.total).toFixed(2)} remaining` in muted text
    (`text-xs text-blue-100/50`).

- If `item.limit` is defined and `item.total > item.limit` (over budget):
  - Right-side amount: `{item.total.toFixed(2)} / {item.limit.toFixed(2)}` in red
    (`text-red-300`).
  - Sub-line below: `+{(item.total - item.limit).toFixed(2)} over` in red
    (`text-xs text-red-300`).

The `<li>` row height will increase slightly for budget-enabled categories — acceptable
given the information density the sub-line provides.

### Success Criteria

#### Automated Verification:
- `npm run lint && npm run build` exits 0.

#### Manual Verification:
- A category with no limit set shows only the total amount, styled exactly as before.
- A category with a limit and `total ≤ limit` shows `total / limit` in blue and a muted
  "X.XX remaining" sub-line.
- A category with a limit and `total > limit` shows `total / limit` in red and a red
  "+X.XX over" sub-line.
- A category with a limit and exactly zero spending shows `0.00 / limit` and the full
  limit as "remaining".
- No visual regression on categories without limits.

---

## References

- Roadmap: S-04 `budget-limits` in `context/foundation/roadmap.md`
- PRD: FR-017, Business Logic section in `context/foundation/prd.md`
- Existing patterns: `src/pages/categories.astro`, `src/pages/api/categories/[id].ts`
- Service pattern: `src/lib/services/expenses.ts` (getMonthBreakdown, Promise.all pattern)

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data Layer and API Endpoint

#### Automated

- [x] 1.1 Add `limit?: number` to `CategoryTotal` in `src/lib/services/expenses.ts` — 0ce55a9
- [x] 1.2 Extend `getMonthBreakdown` with third Promise.all leg for `budget_limits` — 0ce55a9
- [x] 1.3 Create `src/lib/services/budget-limits.ts` with `getBudgetLimits`, `upsertBudgetLimit`, `deleteBudgetLimit` — 0ce55a9
- [x] 1.4 Create `src/pages/api/budget-limits/[category_id].ts` with single `POST` handler — 0ce55a9
- [x] 1.5 `npm run lint && npm run build` exits 0 — 0ce55a9

#### Manual

- [x] 1.M No manual steps — UI built in Phases 2 and 3 — 0ce55a9

### Phase 2: Categories Page — Set/Remove Limits

#### Automated

- [x] 2.1 Update `src/pages/categories.astro` frontmatter to fetch and map budget limits — 3a564cb
- [x] 2.2 Update category row template with save form and conditional remove form — 3a564cb
- [x] 2.3 `npm run lint && npm run build` exits 0 — 3a564cb

#### Manual

- [x] 2.M1 Categories page loads with a number input per category row — 3a564cb
- [x] 2.M2 Categories with existing limits show input pre-filled — 3a564cb
- [x] 2.M3 Saving a valid limit persists it (visible on reload) — 3a564cb
- [x] 2.M4 Saving empty or invalid amount shows error banner — 3a564cb
- [x] 2.M5 "Remove limit" link appears only when a limit is set and removes it on click — 3a564cb

### Phase 3: Dashboard Overrun Markers

#### Automated

- [x] 3.1 Update breakdown rendering in `src/pages/dashboard.astro` — fefb32c
- [x] 3.2 `npm run lint && npm run build` exits 0 — fefb32c

#### Manual

- [x] 3.M1 Category with no limit shows total only (no regression) — fefb32c
- [x] 3.M2 Under-budget category shows `total / limit` in blue + muted "X.XX remaining" — fefb32c
- [x] 3.M3 Over-budget category shows `total / limit` in red + red "+X.XX over" — fefb32c
- [x] 3.M4 Category at exactly zero spending shows `0.00 / limit` and full limit as remaining — fefb32c
