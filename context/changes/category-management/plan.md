# Custom Category Creation and Deletion — Implementation Plan

## Overview

Build S-02: a `/categories` management page where a signed-in user can add custom categories
(up to a 20-category cap) and delete categories that have no associated expenses. Links from
the dashboard so users can find it without memorising the URL.

## Current State Analysis

- `src/lib/services/categories.ts` — exists with `getUserCategories` and `seedDefaultCategories`.
  Must be extended with three new functions: `getCategoriesWithExpenseCounts`, `createCategory`,
  `deleteCategory`.
- `src/types.ts` — defines `Category`. `CategoryWithCount` (same shape + `expense_count: number`)
  must be added.
- `src/pages/api/` — only auth and expense endpoints exist. Two new category endpoints needed.
- `src/middleware.ts` — `PROTECTED_ROUTES = ["/dashboard"]`. Must add `"/categories"`.
- `src/pages/dashboard.astro` — fully built (S-01). Needs one small addition: "Manage categories"
  link beneath the Add expense card.
- No `/categories` page exists.
- DB: `categories` table has `categories_user_name_unique` index on `(user_id, lower(trim(name)))`.
  `expenses.category_id` has `ON DELETE RESTRICT` FK → deletes with referencing expenses fail
  with PostgreSQL error `23503`.

## Desired End State

After this plan is complete:
- A signed-in user can visit `/categories` to view all their categories with per-category
  expense counts.
- The "Add category" inline form lets them add a new category by name; the form is hidden and
  replaced with "Maximum 20 categories reached." when the count is ≥ 20.
- A "Delete" button on each row fires a POST; the DB's FK RESTRICT rejects deletes for
  categories with expenses and the page shows an error banner explaining the block.
- A "Manage categories" text link on the dashboard navigates to `/categories`.
- All pages require authentication; `/categories` is added to `PROTECTED_ROUTES`.

### Key Discoveries

- `src/lib/services/expenses.ts` — `getMonthBreakdown` uses `Promise.all` for two parallel
  Supabase queries. The same pattern is used here for `getCategoriesWithExpenseCounts` (one
  `categories` query + one `expenses` query aggregated in TypeScript).
- `src/lib/services/categories.ts:1-4` — imports `SupabaseClient<Database>` from
  `@supabase/supabase-js` and `Database` from `@/database.types`. Same imports for new functions.
- Error codes: Supabase JS v2 surfaces PostgreSQL error codes directly on `error.code`.
  FK violation (delete blocked by expense) = `"23503"`. Unique constraint violation (duplicate
  name) = `"23505"`.
- `src/pages/api/expenses.ts` — the existing POST endpoint pattern: parse `formData`, validate,
  call service, `return redirect(...)` on success or failure. All new endpoints follow this
  verbatim.
- `src/pages/dashboard.astro:53-56` — "Add expense" card uses class
  `rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl`. The "Manage
  categories" link sits below this card, outside it.
- `src/middleware.ts:4` — `const PROTECTED_ROUTES = ["/dashboard"]`. Single-line edit to add
  `"/categories"`.

## What We're NOT Doing

- Not adding inline editing (rename) for categories — CRUD scope is create + delete only.
- Not adding a budget limit field to category creation — budget limits are S-04.
- Not implementing undo / soft delete — a deleted category is gone; the DB RESTRICT prevents
  accidental data loss.
- Not sorting or reordering categories — alphabetical order from `getUserCategories` is used.
- Not paginating the category list — 20-item cap makes pagination unnecessary.
- Not building a React island for the categories page — all interactions are form POSTs +
  page reloads, consistent with the expense form pattern.

## Implementation Approach

Two sequential phases, each independently verifiable:

1. **Data layer and API endpoints** — new service functions, new type, two API endpoints.
   No UI. Establishes all contracts Phase 2 depends on. Verifiable by lint + build.
2. **Categories page and dashboard link** — Astro SSR page at `/categories`, middleware
   protection, and the "Manage categories" link on the dashboard.

All mutations are form POST → redirect. No client-side state beyond what already exists in the
app.

## Critical Implementation Details

**Expense count via two parallel queries.** `getCategoriesWithExpenseCounts` runs two Supabase
queries in `Promise.all`: `categories` (full select) and `expenses` (select `category_id` only,
all time, not month-filtered — showing total expenses ever attached to a category). Aggregates
in TypeScript using a `Map<string, number>`. This mirrors `getMonthBreakdown` and avoids a
cast-heavy embedded-count approach.

**20-cap check is application-level.** No DB constraint enforces the cap. `createCategory`
calls `getUserCategories` first (reuses existing function) and throws `"cap"` if
`existing.length >= 20`. The API endpoint redirects with an error message; the page also hides
the form when at cap via SSR conditional rendering — dual-layer protection.

**FK-blocked delete surfaces as a banner.** When `deleteCategory` receives Supabase error
`code === "23503"`, it throws `new Error("has_expenses")`. The API endpoint catches this and
redirects to `/categories?error=This category has expenses and cannot be deleted.` The page
reads `?error` and renders it as a dismissable banner (same `?error` pattern as dashboard).

**Unique name constraint.** The DB enforces `(user_id, lower(trim(name)))` uniqueness. If the
insert fails with `code === "23505"`, `createCategory` throws `new Error("duplicate")` and the
API redirects to `/categories?error=A category with that name already exists.`

**Security on delete.** The delete query always includes `.eq("user_id", userId)` alongside
`.eq("id", categoryId)` so a user cannot delete another user's category by guessing an ID.

---

## Phase 1: Data Layer and API Endpoints

### Overview

Extend the service layer and add two API endpoints. No UI. Every contract Phase 2 depends on
is established here: the `CategoryWithCount` type, three service functions, and two API routes.

### Changes Required

#### 1. `CategoryWithCount` type

**File:** `src/types.ts`

**Intent:** Typed return value for `getCategoriesWithExpenseCounts`. Extends `Category` with a
computed `expense_count` field.

**Contract:**
```typescript
export interface CategoryWithCount extends Category {
  expense_count: number; // total expenses (all time) referencing this category
}
```

#### 2. Three new service functions

**File:** `src/lib/services/categories.ts`

**Intent:** Encapsulate all new category operations so API endpoints stay thin.

**Contracts:**

```typescript
// Returns categories with all-time expense counts, ordered by name.
export async function getCategoriesWithExpenseCounts(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<CategoryWithCount[]>
// Implementation: Promise.all([categories select *, expenses select category_id])
// Builds Map<categoryId, count> from expenses array; merges into category rows.

// Creates a category after validating cap and calling DB insert.
// Throws Error("cap") if existing.length >= 20.
// Throws Error("duplicate") if DB returns code "23505".
// Throws the raw Supabase error for any other DB failure.
export async function createCategory(
  supabase: SupabaseClient<Database>,
  userId: string,
  name: string, // already trimmed by caller
): Promise<void>

// Deletes a category owned by userId.
// Throws Error("has_expenses") if DB returns code "23503" (FK RESTRICT).
// Throws the raw Supabase error for any other DB failure.
export async function deleteCategory(
  supabase: SupabaseClient<Database>,
  userId: string,
  categoryId: string,
): Promise<void>
```

#### 3. POST `/api/categories` — create

**File:** `src/pages/api/categories/index.ts` (new)

**Intent:** Validate form input, call `createCategory`, redirect.

**Contract:**
- Auth guard: if no `user` or no `supabase`, redirect to `/auth/signin`.
- Parse `name` from `formData`; trim.
- If empty after trim: `redirect("/categories?error=Category name is required.")`.
- If length > 50: `redirect("/categories?error=Category name must be 50 characters or less.")`.
- Call `createCategory(supabase, user.id, name)`.
  - `"cap"` → `redirect("/categories?error=Maximum 20 categories reached.")`.
  - `"duplicate"` → `redirect("/categories?error=A category with that name already exists.")`.
  - Other error → `redirect("/categories?error=Failed to create category.")`.
- On success: `redirect("/categories")`.

#### 4. POST `/api/categories/[id]` — delete

**File:** `src/pages/api/categories/[id].ts` (new)

**Intent:** Validate route param, call `deleteCategory`, redirect.

**Contract:**
- Auth guard: redirect to `/auth/signin` if no session.
- If `params.id` is falsy: `redirect("/categories?error=Invalid category.")`.
- Call `deleteCategory(supabase, user.id, params.id)`.
  - `"has_expenses"` → `redirect("/categories?error=This category has expenses and cannot be deleted.")`.
  - Other error → `redirect("/categories?error=Failed to delete category.")`.
- On success: `redirect("/categories")`.

### Success Criteria

- `npm run lint && npm run build` exits 0.
- TypeScript compiles `CategoryWithCount` and all three service function signatures without
  errors.
- No lint warnings on new files.

---

## Phase 2: Categories Page and Dashboard Link

### Overview

Build the `/categories` Astro SSR page, protect it via middleware, and add the
"Manage categories" link to the dashboard. All rendering is server-side; no React islands.

### Changes Required

#### 1. `/categories` page

**File:** `src/pages/categories.astro` (new)

**Intent:** Full management page — lists categories with expense counts, inline add form,
per-row delete buttons, error banner.

**Structure:**

Frontmatter:
- Create Supabase client, read `user` from `Astro.locals`.
- Read `?error` from `Astro.url.searchParams`.
- If `supabase && user`: call `getCategoriesWithExpenseCounts(supabase, user.id)`.
- Derive `const atCap = categories.length >= 20`.

Template (following dashboard.astro dark-glass layout):
```
<Layout title="Categories — BudgetFlow">
  bg-cosmic min-h-screen p-4 wrapper
  max-w-md centered column, space-y-6 py-6

  Header row (same as dashboard):
    Left: "BudgetFlow" gradient heading + user email
    Right: Sign out form button

  "← Back to dashboard" small link (text-blue-100/60, hover:text-white)

  Error banner (if serverError): red-tinted rounded card, same style as ServerError component
    but inline — no React needed; just conditional Astro markup.

  "Add category" card (rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl):
    Heading: "Add category"
    If atCap:
      <p class="text-center text-sm text-blue-100/50">Maximum 20 categories reached.</p>
    Else:
      <form method="POST" action="/api/categories" class="flex gap-2">
        <input type="text" name="name" maxlength="50" required
               placeholder="Category name"
               class="flex-1 rounded-lg bg-white/10 border border-white/20 px-3 py-2
                      text-white placeholder-white/40 focus:outline-none focus:ring-2
                      focus:ring-purple-400 transition-colors" />
        <button type="submit"
                class="rounded-lg bg-purple-500/80 px-4 py-2 text-sm font-medium
                       text-white hover:bg-purple-500 transition-colors">
          Add
        </button>
      </form>

  "Categories" card (rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl):
    Heading: "Categories" + count badge "(N / 20)"
    If empty:
      <p class="text-center text-sm text-blue-100/50">No categories yet.</p>
    Else:
      <ul class="space-y-2">
        Each category:
          <li class="flex items-center justify-between rounded-lg border border-white/10
                     bg-white/5 px-4 py-3">
            Left:
              <span class="text-sm font-medium text-white">{cat.name}</span>
              <span class="text-xs text-blue-100/50 ml-2">
                {cat.expense_count} expense{cat.expense_count !== 1 ? 's' : ''}
              </span>
            Right:
              <form method="POST" action={`/api/categories/${cat.id}`}>
                <button type="submit"
                        class="text-xs text-red-300/70 hover:text-red-300 transition-colors">
                  Delete
                </button>
              </form>
          </li>
```

#### 2. Middleware — protect `/categories`

**File:** `src/middleware.ts`

**Change:** `const PROTECTED_ROUTES = ["/dashboard"]` → `["/dashboard", "/categories"]`

#### 3. Dashboard — "Manage categories" link

**File:** `src/pages/dashboard.astro`

**Change:** After the closing `</div>` of the "Add expense" card (line ~56), add:
```astro
<div class="text-center">
  <a href="/categories" class="text-sm text-blue-100/60 hover:text-white transition-colors">
    Manage categories
  </a>
</div>
```

### Success Criteria

- `npm run lint && npm run build` exits 0.
- Manual: visiting `/categories` (unauthenticated) redirects to `/auth/signin`.
- Manual: signed-in user sees the list of categories, each with an expense count.
- Manual: adding a valid new category name updates the list on reload.
- Manual: submitting a duplicate name shows the "already exists" error banner.
- Manual: deleting a category with 0 expenses removes it from the list.
- Manual: deleting a category that has expenses shows the "has expenses" error banner.
- Manual: when at 20 categories, the add form is replaced with the cap message.
- Manual: "Manage categories" link on dashboard navigates to `/categories`.

---

## Progress

### Phase 1: Data Layer and API Endpoints

#### Automated
- [x] 1.1 Add `CategoryWithCount` type to `src/types.ts` — 29fd96e
- [x] 1.2 Add `getCategoriesWithExpenseCounts`, `createCategory`, `deleteCategory` to `src/lib/services/categories.ts` — 29fd96e
- [x] 1.3 Create `src/pages/api/categories/index.ts` (POST — create) — 29fd96e
- [x] 1.4 Create `src/pages/api/categories/[id].ts` (POST — delete) — 29fd96e
- [x] 1.5 `npm run lint && npm run build` passes — 29fd96e

#### Manual
- [ ] 1.M (no manual steps — UI built in Phase 2)

### Phase 2: Categories Page and Dashboard Link

#### Automated
- [x] 2.1 Create `src/pages/categories.astro`
- [x] 2.2 Add `"/categories"` to `PROTECTED_ROUTES` in `src/middleware.ts`
- [x] 2.3 Add "Manage categories" link to `src/pages/dashboard.astro`
- [x] 2.4 `npm run lint && npm run build` passes

#### Manual
- [ ] 2.M1 Unauthenticated visit to `/categories` redirects to `/auth/signin`
- [ ] 2.M2 Category list renders with name and expense count per row
- [ ] 2.M3 Adding a valid category name updates the list
- [ ] 2.M4 Submitting a duplicate name shows error banner
- [ ] 2.M5 Deleting a category with 0 expenses removes it from the list
- [ ] 2.M6 Deleting a category with expenses shows "has expenses" error banner
- [ ] 2.M7 At 20 categories, add form is replaced with cap message
- [ ] 2.M8 "Manage categories" link on dashboard navigates to `/categories`
