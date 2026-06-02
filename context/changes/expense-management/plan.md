# Expense Management — Implementation Plan

## Overview

Build S-03: a `/expenses` page where a signed-in user can browse their expenses filtered to a
selected month, filter further by category, edit an expense inline, and delete an expense with a
two-step inline confirmation. The expense list is a React island (`ExpenseList`) that manages
month navigation, category filtering, and inline mutations without page reloads. A new
`GET /api/expenses` JSON endpoint backs the island's data fetches on month or filter change.
An initial SSR render from the Astro page provides the first data set.

## Current State Analysis

- `src/lib/services/expenses.ts` — has `addExpense` and `getMonthBreakdown`. No functions for
  listing individual expense rows, updating, or deleting.
- `src/types.ts` — `Expense` type (id, category_id, amount: string, expense_date) already
  defined. `ExpenseWithCategory` (same shape + `category_name: string`) is needed.
- `src/pages/api/expenses.ts` — exports `POST` (create). Must be renamed to
  `src/pages/api/expenses/index.ts` before `[id].ts` can be created at the same path level.
- `src/components/expenses/ExpenseForm.tsx` — React island for adding expenses. `SelectField.tsx`
  sibling component can be reused in `ExpenseList` for category dropdowns.
- `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard", "/categories"]`. Must add
  `"/expenses"`.
- `src/pages/dashboard.astro:58-63` — "Manage categories" text link pattern to follow for
  "View expenses" link.
- No `/expenses` page exists.

## Desired End State

After this plan is complete:
- A signed-in user can visit `/expenses` to see their expenses for the current month, with
  expense date, category name, and amount visible per row.
- Prev/next month navigation arrows let the user browse past months without page reload.
- A category dropdown ("All categories" + per-category options) filters the list in place.
- Clicking "Edit" on a row expands an inline form (amount, category, date); "Save" updates
  the expense and re-fetches the list; "Cancel" closes without change.
- Clicking "Delete" shows "Confirm? / Cancel" inline; confirming deletes and re-fetches;
  cancelling restores the row.
- A "View expenses" text link on the dashboard navigates to `/expenses`.
- `/expenses` requires authentication (added to `PROTECTED_ROUTES`).

### Key Discoveries

- `src/pages/api/expenses.ts` must be renamed `src/pages/api/expenses/index.ts` before the
  `[id].ts` sibling can be created. The existing `POST` handler is preserved verbatim — only
  the file path changes. The public route `/api/expenses` is unchanged.
- The React island uses `fetch()` (not HTML form POST) for update and delete because mutations
  are triggered from within a React component. `POST /api/expenses/[id]` for update,
  `DELETE /api/expenses/[id]` for delete. Astro API routes export `DELETE` the same way they
  export `POST`.
- `Expense.amount` is typed `string` in `src/types.ts` but the Supabase database type is
  `number`. When constructing `ExpenseWithCategory[]` in `getMonthExpenses`, wrap with
  `String(exp.amount)` — the same pattern as `parseFloat(String(exp.amount))` used in
  `getMonthBreakdown`.
- `getUserCategories` already exists in `src/lib/services/categories.ts` — the `/expenses` page
  calls it to populate the `categories` prop passed to `ExpenseList`.
- Security: `updateExpense` and `deleteExpense` must include `.eq("user_id", userId)` alongside
  the id filter, preventing cross-user mutations.

## What We're NOT Doing

- Not adding keyword/text search — month + category filter is the S-03 scope.
- Not paginating the expense list — monthly scope keeps the list short enough.
- Not implementing undo/soft delete — hard delete with a two-step confirmation satisfies FR-009.
- Not supporting multi-month or date-range browsing — one month at a time per FR-010.
- Not changing the expense creation flow — `POST /api/expenses` still redirects to `/dashboard`.

## Implementation Approach

Three sequential phases, each independently verifiable by lint + build:

1. **Data layer and API endpoints** — new type, three service functions, API directory
   restructure, and three new endpoint handlers. No UI.
2. **ExpenseList React island** — the full React component with month navigation, category
   filter, inline edit, and inline two-step delete. No page yet.
3. **`/expenses` page, middleware, dashboard link** — Astro SSR page wiring the island, route
   protection, and the "View expenses" dashboard link. Manual testing phase.

## Critical Implementation Details

**File rename prerequisite.** `src/pages/api/expenses.ts` must be renamed to
`src/pages/api/expenses/index.ts` in Phase 1 before `[id].ts` can be created alongside it.
The existing `POST` handler is not modified — only the file path changes.

**`DELETE` export in Astro.** Astro API routes support any named HTTP verb. `[id].ts` exports
both `export const POST` (update) and `export const DELETE` (delete). The React island calls
these via `fetch()` with the respective method.

**Month edge-case wrapping.** Month navigation in the React island must wrap correctly:
month 1 → prev → December of year−1; month 12 → next → January of year+1.

---

## Phase 1: Data Layer and API Endpoints

### Overview

Extend the type system, add three service functions, restructure the expenses API directory,
and add the three new endpoint handlers. Every contract Phases 2 and 3 depend on is
established here.

### Changes Required

#### 1. `ExpenseWithCategory` type

**File:** `src/types.ts`

**Intent:** Typed return value for `getMonthExpenses`. Extends `Expense` with the human-readable
category name resolved at the service layer, avoiding category lookups in the React island.

**Contract:**
```typescript
export interface ExpenseWithCategory extends Expense {
  category_name: string;
}
```

#### 2. Three new service functions

**File:** `src/lib/services/expenses.ts`

**Intent:** Encapsulate list, update, and delete operations so API endpoints stay thin and
the React island never queries Supabase directly.

**Contracts:**

```typescript
// Returns all expenses for the given month (optionally filtered by categoryId),
// ordered by expense_date descending, with category names resolved.
export async function getMonthExpenses(
  supabase: SupabaseClient<Database>,
  userId: string,
  year: number,
  month: number,
  categoryId?: string,
): Promise<ExpenseWithCategory[]>
// Implementation: same date-range pattern as getMonthBreakdown.
// Two Promise.all queries: expenses (.select("*").eq("user_id").gte/lte date range,
// optionally .eq("category_id")).order("expense_date", { ascending: false })
// + categories (.select("id, name").eq("user_id")).
// Merge via Map<categoryId, name>. Wrap amount with String().

// Updates amount, category_id, and expense_date for a user-owned expense.
// Throws the raw Supabase error on failure.
export async function updateExpense(
  supabase: SupabaseClient<Database>,
  userId: string,
  expenseId: string,
  payload: { category_id: string; amount: number; expense_date: string },
): Promise<void>
// .update(payload).eq("id", expenseId).eq("user_id", userId)

// Deletes a user-owned expense.
// Throws the raw Supabase error on failure.
export async function deleteExpense(
  supabase: SupabaseClient<Database>,
  userId: string,
  expenseId: string,
): Promise<void>
// .delete().eq("id", expenseId).eq("user_id", userId)
```

#### 3. Rename `expenses.ts` → `expenses/index.ts`

**File:** `src/pages/api/expenses.ts` → `src/pages/api/expenses/index.ts`

**Intent:** Move the existing create endpoint into a directory so `[id].ts` can live alongside
it. The existing `export const POST` handler is unchanged.

#### 4. Add `GET` handler to `expenses/index.ts`

**File:** `src/pages/api/expenses/index.ts`

**Intent:** JSON endpoint used by the React island whenever month or category filter changes.
Unlike other endpoints in this file, returns JSON on all outcomes — called via `fetch()` from
`ExpenseList`, not from an HTML form, so redirects would be silently swallowed.

**Contract:**
- Auth guard: return `Response.json({ error: "Unauthorized" }, { status: 401 })` if no user
  or supabase.
- Read `year`, `month`, `category_id` from `context.url.searchParams`. Parse year/month as
  integers; default to the current year/month if absent or `NaN`.
- Call `getMonthExpenses(supabase, user.id, year, month, categoryId || undefined)`.
- Return `Response.json(expenses)` on success.
- Return `Response.json({ error: "Failed to fetch expenses" }, { status: 500 })` on error.

#### 5. `POST /api/expenses/[id]` — update, and `DELETE /api/expenses/[id]` — delete

**File:** `src/pages/api/expenses/[id].ts` (new)

**Intent:** Two handlers in one file — update (POST) and delete (DELETE) — both returning JSON
so the React island can handle the response without a page redirect.

**POST contract:**
- Auth guard: `Response.json({ error: "Unauthorized" }, { status: 401 })` if no user.
- Parse `amount`, `category_id`, `expense_date` from `formData`. Same validation as
  `POST /api/expenses`: amount must be a positive number; category_id and expense_date required.
- Call `updateExpense(supabase, user.id, params.id, { amount, category_id, expense_date })`.
- Return `Response.json({ ok: true })` on success.
- Return `Response.json({ error: "..." }, { status: 400 })` on validation failure,
  `{ status: 500 }` on service error.

**DELETE contract:**
- Auth guard: 401 JSON if no user.
- If `params.id` is falsy: `Response.json({ error: "Invalid expense." }, { status: 400 })`.
- Call `deleteExpense(supabase, user.id, params.id)`.
- Return `Response.json({ ok: true })` on success.
- Return `Response.json({ error: "Failed to delete expense." }, { status: 500 })` on error.

### Success Criteria

#### Automated Verification:
- `npm run lint && npm run build` exits 0.
- TypeScript compiles `ExpenseWithCategory` and all three new service function signatures
  without errors.
- Both `src/pages/api/expenses/index.ts` and `src/pages/api/expenses/[id].ts` exist.

#### Manual Verification:
- (None — UI is built in Phases 2 and 3.)

---

## Phase 2: ExpenseList React Island

### Overview

Build the `ExpenseList` React island that fully manages expense browsing, filtering, inline
editing, and inline delete confirmation on the client side. The island receives
`initialExpenses`, `categories`, `initialYear`, and `initialMonth` as props. All subsequent
data fetches call `GET /api/expenses`.

### Changes Required

#### 1. `ExpenseList` React island

**File:** `src/components/expenses/ExpenseList.tsx` (new)

**Intent:** Self-contained React component for the `/expenses` page. Owns month navigation
state, category filter state, inline edit state, and inline delete confirmation state.
Fetches updated expense data via the JSON API on any state change.

**Contract:**

Props interface:
```typescript
interface ExpenseListProps {
  initialExpenses: ExpenseWithCategory[];
  categories: Category[];
  initialYear: number;
  initialMonth: number;
}
```

State:
- `expenses` — current display list; seeded from `initialExpenses`
- `year`, `month` — selected period; seeded from `initialYear/Month`
- `categoryId: string | null` — selected filter; `null` = "All categories"
- `loading: boolean` — true while fetching; shows a loading indicator
- `error: string | null` — non-null renders a dismissable red-tinted error banner
- `editingId: string | null` — id of the row in edit mode
- `editForm: { amount: string; category_id: string; expense_date: string }` — controlled
  values for the inline edit form
- `confirmDeleteId: string | null` — id of the row showing "Confirm? / Cancel"

Behavior:
- **Month navigation**: prev and next buttons, each triggering a `fetchExpenses(newYear, newMonth, categoryId)` call. Year wraps correctly at month boundaries.
- **Month label**: `new Date(year, month - 1).toLocaleString("en-US", { month: "long", year: "numeric" })`.
- **Category filter**: `<select>` with "All categories" as the first option, then one `<option>` per category from the `categories` prop. Changing the select triggers `fetchExpenses(year, month, newCategoryId)`.
- **`fetchExpenses` helper**: sets `loading=true`, calls `GET /api/expenses?year=X&month=Y` (with optional `&category_id=Z`), updates `expenses` and clears `loading`; on non-200 response, sets `error`.
- **List rows**: rendered as a `<ul>`. Each `<li>` shows `expense_date`, `category_name`, `parseFloat(exp.amount).toFixed(2)`, and Edit/Delete buttons on the right.
- **Inline edit**: clicking Edit sets `editingId = exp.id`, clears `confirmDeleteId`, and populates `editForm` from the row's current values. The row replaces its display with a mini form: amount number input (`type="number" step="0.01" min="0.01"`), category select (using `categories` prop, same `SelectField` pattern), date input (`type="date"`), Save and Cancel buttons. Save calls `POST /api/expenses/[id]` with `FormData`, then calls `fetchExpenses` on success or sets `error` on failure. Cancel clears `editingId`.
- **Inline delete confirm**: clicking Delete sets `confirmDeleteId = exp.id` and clears `editingId`. The row's Delete button is replaced by "Confirm?" and "Cancel" buttons. "Confirm?" calls `DELETE /api/expenses/[id]` via `fetch`, then calls `fetchExpenses` on success or sets `error` on failure. Cancel clears `confirmDeleteId`.
- **Empty state**: when `expenses.length === 0` and `!loading`, renders `"No expenses this month."` in muted text.

Styling: dark-glass convention (`bg-white/5`, `border-white/10`, `text-white`, `text-blue-100/50`, `rounded-lg`). **Category filter (controls row above the list):** use a plain `<select>` styled to the dark-glass convention — NOT `SelectField`, which renders a `<label>` element and icon column that don't belong in a compact controls row. **Inline edit category select:** use `SelectField` (import a `lucide-react` icon, e.g. `Tag`) — same pattern as `ExpenseForm`. Month nav arrows and category filter sit above the list in a controls row.

### Success Criteria

#### Automated Verification:
- `npm run lint && npm run build` exits 0.
- No TypeScript errors on `ExpenseListProps`, state types, or fetch call shapes.

#### Manual Verification:
- (None — manual testing requires the Astro page in Phase 3.)

---

## Phase 3: /expenses Page, Middleware, and Dashboard Link

### Overview

Wire the `ExpenseList` island into an Astro SSR page at `/expenses`, add the route to
`PROTECTED_ROUTES`, and add a "View expenses" link to the dashboard.

### Changes Required

#### 1. `/expenses` page

**File:** `src/pages/expenses.astro` (new)

**Intent:** Server-renders the initial expenses and categories, then hands off to the
`ExpenseList` island for client-side navigation and mutations.

**Structure:**

Frontmatter:
- Create Supabase client, read `user` from `Astro.locals`.
- Read `year` and `month` from `Astro.url.searchParams`; parse as integers; default to
  `new Date().getFullYear()` / `new Date().getMonth() + 1` if absent or `NaN`.
- If `supabase && user`:
  - `categories = await getUserCategories(supabase, user.id)`
  - `initialExpenses = await getMonthExpenses(supabase, user.id, year, month)`

Template (dark-glass layout matching `categories.astro`):
```
<Layout title="Expenses — BudgetFlow">
  bg-cosmic min-h-screen p-4 wrapper
  max-w-md centered column, space-y-6 py-6

  Header row (same as dashboard/categories):
    Left: "BudgetFlow" gradient heading + user email
    Right: Sign out form button

  "← Back to dashboard" small link (text-blue-100/60 hover:text-white)

  <div class="rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl">
    <ExpenseList client:load
      initialExpenses={initialExpenses}
      categories={categories}
      initialYear={year}
      initialMonth={month}
    />
  </div>
```

#### 2. Middleware — protect `/expenses`

**File:** `src/middleware.ts`

**Change:** `const PROTECTED_ROUTES = ["/dashboard", "/categories"]`
→ `["/dashboard", "/categories", "/expenses"]`

#### 3. Dashboard — "View expenses" link

**File:** `src/pages/dashboard.astro`

**Change:** After the closing `</div>` of the month-breakdown card (the last element in the
page's column, currently around line 84), add:
```astro
<div class="text-center">
  <a href="/expenses" class="text-sm text-blue-100/60 hover:text-white transition-colors">
    View expenses
  </a>
</div>
```

### Success Criteria

#### Automated Verification:
- `npm run lint && npm run build` exits 0.

#### Manual Verification:
- Visiting `/expenses` while unauthenticated redirects to `/auth/signin`.
- Signed-in user sees the current month's expenses with date, category name, and amount per row.
- Month navigation arrows change the displayed month and update the list without a full page reload.
- Selecting a category from the filter dropdown shows only expenses in that category.
- Editing an expense (amount, category, or date) updates the list after "Save".
- Saving an edit with an invalid amount (empty or zero) shows an error banner.
- Delete two-step confirmation: clicking "Delete" shows "Confirm? / Cancel"; "Confirm?" removes the expense.
- When a month has no expenses, "No expenses this month." is displayed.
- "View expenses" link on the dashboard navigates to `/expenses`.

---

## References

- Roadmap: S-03 `expense-management` in `context/foundation/roadmap.md`
- PRD: FR-008, FR-009, FR-010, FR-011 in `context/foundation/prd.md`
- Existing patterns: `src/pages/categories.astro`, `src/components/expenses/ExpenseForm.tsx`
- Related service: `src/lib/services/expenses.ts` (addExpense, getMonthBreakdown patterns)

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data Layer and API Endpoints

#### Automated

- [x] 1.1 Add `ExpenseWithCategory` to `src/types.ts` — f23a0e2
- [x] 1.2 Add `getMonthExpenses`, `updateExpense`, `deleteExpense` to `src/lib/services/expenses.ts` — f23a0e2
- [x] 1.3 Rename `src/pages/api/expenses.ts` → `src/pages/api/expenses/index.ts` — f23a0e2
- [x] 1.4 Add `GET` handler to `src/pages/api/expenses/index.ts` — f23a0e2
- [x] 1.5 Create `src/pages/api/expenses/[id].ts` with `POST` (update) and `DELETE` (delete) handlers — f23a0e2
- [x] 1.6 `npm run lint && npm run build` exits 0 — f23a0e2

#### Manual

- [x] 1.M No manual steps — UI built in Phases 2 and 3 — f23a0e2

### Phase 2: ExpenseList React Island

#### Automated

- [x] 2.1 Create `src/components/expenses/ExpenseList.tsx` with all props, state, and behaviors — 978e919
- [x] 2.2 `npm run lint && npm run build` exits 0 — 978e919

#### Manual

- [x] 2.M No manual steps — page wiring in Phase 3 — 978e919

### Phase 3: /expenses Page, Middleware, and Dashboard Link

#### Automated

- [x] 3.1 Create `src/pages/expenses.astro`
- [x] 3.2 Add `"/expenses"` to `PROTECTED_ROUTES` in `src/middleware.ts`
- [x] 3.3 Add "View expenses" link to `src/pages/dashboard.astro`
- [x] 3.4 `npm run lint && npm run build` exits 0

#### Manual

- [x] 3.M1 Unauthenticated visit to `/expenses` redirects to `/auth/signin`
- [x] 3.M2 Expense list renders with date, category name, and amount per row
- [x] 3.M3 Month navigation changes the displayed month without page reload
- [x] 3.M4 Category filter shows only expenses in the selected category
- [x] 3.M5 Editing an expense updates the list after save
- [x] 3.M6 Invalid edit (empty or zero amount) shows an error banner
- [x] 3.M7 Delete confirmation (Confirm?/Cancel) removes the expense on confirm
- [x] 3.M8 Empty month shows "No expenses this month."
- [x] 3.M9 "View expenses" link on dashboard navigates to `/expenses`
