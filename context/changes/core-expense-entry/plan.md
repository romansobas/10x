# Core Expense Entry and Month-to-Date Breakdown — Implementation Plan

## Overview

Build the north-star slice for BudgetFlow (S-01): a dashboard where a signed-in user can add
an expense (amount + category + date) and immediately see it reflected in the current month's
spending breakdown by category. This is the first domain feature — everything else in the
roadmap depends on it working.

## Current State Analysis

- `src/pages/dashboard.astro` — placeholder page ("This page is only for authenticated users").
  Must be fully rebuilt.
- No domain API endpoints exist. Only auth endpoints (`/api/auth/*`) follow the pattern.
- No expense or category components exist. Auth form components (`SignInForm`, `FormField`,
  `SubmitButton`, `ServerError`) establish the patterns to follow.
- `src/lib/services/` does not exist — service layer must be bootstrapped.
- Domain tables (`categories`, `expenses`) are live after F-01. RLS enforces `user_id` isolation.
- Supabase client (`src/lib/supabase.ts`) is typed with `Database` generic — all queries are
  type-checked.
- No form validation library installed. The project uses `useState` + manual `validate()` in
  React components (see `src/components/auth/SignInForm.tsx:18-30`).
- `src/middleware.ts` protects `/dashboard` — `context.locals.user` is always non-null when
  the dashboard page renders.

## Desired End State

After this plan is complete:
- A signed-in user visits `/dashboard` and sees an expense entry form (amount, category, date).
- On first visit, 8 default categories are auto-inserted into the user's `categories` table.
- Submitting a valid expense inserts it into `expenses`, then redirects back to `/dashboard`.
- The dashboard shows the current month's spending breakdown (category + total, sorted by total
  descending) beneath the form.
- Submitting with invalid input (no amount, amount ≤ 0, no category) shows inline field errors
  without a page reload.
- A server-side error (DB failure) is surfaced via a `?error=` query param banner.

### Key Discoveries

- `src/components/auth/FormField.tsx:8-18` — FormField accepts `type` prop, so `type="date"`
  works for the date field. It does not accept extra HTML attributes (`step`, `min`), so the
  amount `<input>` must be built inline using the same CSS class string.
- `src/components/auth/SubmitButton.tsx:12` — uses `useFormStatus()` from `react-dom`. For
  native `method="POST"` forms (not React Server Actions), `pending` stays `false` and the
  button shows the normal state — acceptable for MVP. Reuse without modification.
- `src/components/auth/ServerError.tsx` — handles null/undefined message gracefully; reuse
  directly for the server error banner.
- `src/database.types.ts:102` — generated types show `amount: number` for `expenses.Row`, but
  PostgREST serialises PostgreSQL `NUMERIC` as a JSON string at runtime. Always use
  `parseFloat(String(expense.amount))` in service-layer arithmetic.
- `supabase/migrations/…_create_domain_schema.sql` — `categories_user_name_unique` is a
  unique index on `(user_id, lower(trim(name)))`. Seeding must tolerate duplicate inserts
  (two-tab race) — use Supabase `upsert` with `ignoreDuplicates: true`.

## What We're NOT Doing

- Not building month navigation (prev/next arrows) — current month only; deferred to S-03.
- Not building budget limit comparison in the breakdown — deferred to S-04.
- Not adding category management (create/delete custom categories) — deferred to S-02.
- Not implementing an optimistic UI update after expense submit — full page reload is the
  chosen approach (mirrors auth pattern, zero client-side state).
- Not adding a Supabase RPC / database view for aggregation — TypeScript aggregation over a
  fetched expense list is sufficient for MVP data volumes.
- Not adding a form validation library (zod, react-hook-form) — manual `validate()` follows
  the established pattern.
- Not seeding categories into the DB ahead of time (migration) — per the domain-schema plan
  decision; defaults are a hard-coded TS array inserted on first dashboard visit.

## Implementation Approach

Three sequential phases, each independently verifiable:

1. **Data layer** — service functions and the POST API endpoint. No UI. Establishes all
   contracts the other phases depend on.
2. **Expense form components** — React island (`ExpenseForm`) with a reusable `SelectField`
   component for the styled native `<select>`. No page integration yet.
3. **Dashboard rebuild** — Astro SSR page that fetches categories (auto-seeding on first
   visit), fetches this month's expenses, and renders the form + breakdown together.

Data flows entirely server-side: Astro frontmatter fetches from Supabase at request time,
renders props into the React island at SSR, and the form POST → redirect pattern keeps the
client stateless.

## Critical Implementation Details

**NUMERIC runtime serialisation.** PostgreSQL `NUMERIC(12,2)` is serialised by PostgREST as a
JSON string (e.g. `"49.99"`), even though `database.types.ts` types `amount` as `number`. In
`getMonthBreakdown`, always use `parseFloat(String(expense.amount))` when summing. When
inserting, pass a JS `number` (the `Insert` schema expects `number`).

**Seeding idempotency.** The seed check ("0 categories → insert defaults") runs in the Astro
frontmatter. Two browser tabs opened simultaneously before any categories exist can both read
count=0 and both attempt the insert. Use `supabase.from("categories").upsert(rows, {
ignoreDuplicates: true })` in `seedDefaultCategories` so duplicate inserts silently no-op
instead of throwing a unique-constraint error.

**Date calculation for month boundary.** `new Date(year, month, 0).getDate()` gives the last
day of the target month (month is 1-indexed here) without timezone issues. Do not use
`.toISOString()` for last-day calculation — UTC offset can shift to the wrong calendar day.

---

## Phase 1: Data Layer

### Overview

Create the service layer (`src/lib/services/`) and the expense POST API endpoint. This phase
establishes all data contracts the form and dashboard depend on. No UI is built here.

### Changes Required

#### 1. Default category names constant

**File:** `src/lib/defaults.ts`

**Intent:** Single source of truth for the 8 default category names that every new user gets
on first dashboard visit. Downstream: `seedDefaultCategories` reads this array.

**Contract:** Exports `DEFAULT_CATEGORY_NAMES` as a `readonly string[]` containing:
`["Food", "Transport", "Housing", "Utilities", "Healthcare", "Entertainment", "Clothing", "Other"]`

#### 2. Category service

**File:** `src/lib/services/categories.ts`

**Intent:** Encapsulate all Supabase queries for the `categories` table so the dashboard page
and future slices (S-02) import named functions rather than raw Supabase calls.

**Contract:** Exports two functions:

```typescript
export async function getUserCategories(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Category[]>
// SELECT * FROM categories WHERE user_id = userId ORDER BY name
// Returns [] if none exist. Throws on DB error.

export async function seedDefaultCategories(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void>
// UPSERT DEFAULT_CATEGORY_NAMES rows with { ignoreDuplicates: true }.
// Silent no-op on duplicate (handles two-tab race condition safely).
// Throws on any non-duplicate DB error.
```

Import `Database` from `@/database.types`, `Category` from `@/types`,
`DEFAULT_CATEGORY_NAMES` from `@/lib/defaults`.

#### 3. Expense service

**File:** `src/lib/services/expenses.ts`

**Intent:** Encapsulate `expenses` table writes and the monthly aggregation query used by the
breakdown section.

**Contract:** Exports:

```typescript
export async function addExpense(
  supabase: SupabaseClient<Database>,
  payload: { user_id: string; category_id: string; amount: number; expense_date: string },
): Promise<void>
// INSERT INTO expenses (...). Throws on error.

export type CategoryTotal = {
  category_id: string;
  category_name: string;
  total: number; // sum of expense amounts, computed in TypeScript
};

export async function getMonthBreakdown(
  supabase: SupabaseClient<Database>,
  userId: string,
  year: number,
  month: number, // 1-indexed (January = 1)
): Promise<CategoryTotal[]>
// 1. Fetch expenses for the month: expense_date BETWEEN firstDay AND lastDay.
// 2. Fetch categories for the user.
// 3. Aggregate: sum amounts per category_id using parseFloat(String(expense.amount)).
// 4. Join with category names; exclude categories with zero total.
// 5. Return sorted by total descending.
// Month boundary: firstDay = `${year}-${MM}-01`;
//   lastDay computed via new Date(year, month, 0).getDate() (timezone-safe).
```

#### 4. Expense POST endpoint

**File:** `src/pages/api/expenses.ts`

**Intent:** Accept a form POST from the expense entry form, validate the three fields
server-side, insert the expense, and redirect. Mirrors the auth endpoint pattern exactly.

**Contract:** Exports `POST: APIRoute`. Steps:
1. Create supabase client; redirect to `/dashboard?error=...` if unavailable.
2. `supabase.auth.getUser()` — redirect to `/auth/signin` if no session.
3. Parse `formData`: `amount` (string), `category_id` (string), `expense_date` (string).
4. Validate: `parseFloat(amount) > 0`, `category_id` non-empty, `expense_date` non-empty.
   On failure: `context.redirect("/dashboard?error=" + encodeURIComponent(message))`.
5. Call `addExpense(supabase, { user_id: user.id, category_id, amount: parseFloat(amount), expense_date })`.
6. On success: `context.redirect("/dashboard")`.
7. On DB error: `context.redirect("/dashboard?error=" + encodeURIComponent("Failed to save expense"))`.

### Success Criteria

#### Automated Verification

- `npm run lint` passes with no errors across all four new files.
- `npm run build` passes — no TypeScript errors in the service layer or API endpoint.

#### Manual Verification

- No manual testing in Phase 1 alone — integration is verified in Phase 3.

---

## Phase 2: Expense Form Components

### Overview

Build the two React components that make up the expense entry form: a reusable `SelectField`
(styled native `<select>`, mirrors `FormField`) and the `ExpenseForm` island that assembles
amount + category + date into a POST form.

### Changes Required

#### 1. SelectField component

**File:** `src/components/expenses/SelectField.tsx`

**Intent:** A styled native `<select>` that visually matches `FormField` (dark-glass look,
icon on the left, error display beneath). Reusable in future slices that need a dropdown
(S-02 category picker, S-04 budget limit form).

**Contract:**

```typescript
interface Option { value: string; label: string; }

interface SelectFieldProps {
  id: string;
  name?: string;       // defaults to id
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  error?: string;
  icon: ReactNode;
}
```

Apply the same CSS class string as `FormField`'s `<input>` (`bg-white/10 border rounded-lg
text-white ...`) to the `<select>` element. Use `pr-10` and `appearance-none` so the OS
default arrow is hidden; add a custom chevron icon using an absolutely-positioned `lucide-react`
`ChevronDown` on the right side.

#### 2. ExpenseForm component

**File:** `src/components/expenses/ExpenseForm.tsx`

**Intent:** React island that renders the three expense fields, validates client-side before
allowing the native form POST, and surfaces server errors passed in as a prop.

**Contract:** Default export. Props:

```typescript
interface Props {
  categories: Category[];      // from src/types.ts — populates the category select
  defaultError?: string | null; // ?error= query param from the server; shown in <ServerError>
}
```

Form: `method="POST" action="/api/expenses" noValidate`. Fields:

- **Amount**: `<input type="number" name="amount" step="0.01" min="0.01">` built inline
  (not via `FormField` — needs `step`/`min` attributes). Apply the same CSS class string as
  `FormField`'s `<input>`. Show a `DollarSign` icon on the left. Error key: `amount`.
- **Category**: `<SelectField name="category_id">` with `options` mapped from `categories`
  prop (`{ value: cat.id, label: cat.name }`). Use a `Tag` icon. Error key: `category`.
- **Date**: `<FormField type="date" name="expense_date">` with `Calendar` icon. Default value:
  `new Date().toISOString().slice(0, 10)` (today in YYYY-MM-DD, computed once in `useState`
  initialiser). Error key: `date`.
- `<ServerError message={defaultError}>` — renders nothing when null.
- `<SubmitButton pendingText="Saving…" icon={<PlusCircle>}>Add expense</SubmitButton>`

Client-side `validate()`:
- amount: `parseFloat(value) > 0`, else `"Enter a positive amount"`
- category: non-empty string, else `"Select a category"`
- date: non-empty string, else `"Select a date"`

On `handleSubmit`: call `validate()`; call `e.preventDefault()` only if validation fails.

### Success Criteria

#### Automated Verification

- `npm run lint` passes — no TypeScript or a11y errors in the two new components.
- `npm run build` passes — components compile without errors.

#### Manual Verification

- No standalone visual testing in Phase 2 — integration verified in Phase 3.

---

## Phase 3: Dashboard Rebuild

### Overview

Replace the dashboard placeholder with the real SSR page: fetch categories (auto-seeding on
first visit), fetch the current month's breakdown, and render the `ExpenseForm` island and
the breakdown list.

### Changes Required

#### 1. Rebuilt dashboard page

**File:** `src/pages/dashboard.astro`

**Intent:** Full replacement of the placeholder. The Astro frontmatter handles all server-side
data fetching; the template renders the form island and the breakdown list. No client-side
data fetching.

**Contract — frontmatter:**

```typescript
const { user } = Astro.locals; // guaranteed non-null (middleware protects /dashboard)
const supabase = createClient(Astro.request.headers, Astro.cookies);
const serverError = Astro.url.searchParams.get("error"); // null if absent

let categories: Category[] = [];
let breakdown: CategoryTotal[] = [];

if (supabase) {
  categories = await getUserCategories(supabase, user.id);
  if (categories.length === 0) {
    await seedDefaultCategories(supabase, user.id);
    categories = await getUserCategories(supabase, user.id);
  }
  const now = new Date();
  breakdown = await getMonthBreakdown(supabase, user.id, now.getFullYear(), now.getMonth() + 1);
}
```

**Contract — template layout (mobile-first, max-w-md centred column):**

- **Header strip**: app name ("BudgetFlow"), user email, signout button (form POST to
  `/api/auth/signout`). Matches the cosmic dark-glass aesthetic of the existing pages.
- **"Add expense" card**: heading + `<ExpenseForm categories={categories}
  defaultError={serverError} client:load />`.
- **"This month" card**: heading + month label (e.g. "May 2026").
  - If `breakdown.length === 0`: empty state message ("No expenses yet this month.").
  - Else: a list of rows — each row shows category name on the left and total on the right
    (`total.toFixed(2)`). Rows are already sorted by total descending from the service.
- Page title: `"Dashboard — BudgetFlow"`.

The `bg-cosmic` utility class (defined in `src/styles/global.css`) applies to `min-h-screen`.

**Imports needed:**
```
import Layout from "@/layouts/Layout.astro";
import ExpenseForm from "@/components/expenses/ExpenseForm";
import { createClient } from "@/lib/supabase";
import { getUserCategories, seedDefaultCategories } from "@/lib/services/categories";
import { getMonthBreakdown, type CategoryTotal } from "@/lib/services/expenses";
import type { Category } from "@/types";
```

### Success Criteria

#### Automated Verification

- `npm run lint` passes — no errors in the rebuilt `dashboard.astro`.
- `npm run build` passes end-to-end.

#### Manual Verification

- Sign in and visit `/dashboard` — 8 default categories are present in the category `<select>`.
- Open a second tab simultaneously on a fresh account — no error (seed is idempotent).
- Fill in amount (e.g. `12.50`), select a category, leave date as today → submit → page
  reloads → breakdown shows the category with total `12.50`.
- Add a second expense in the same category → breakdown total updates correctly.
- Add expenses in two different categories → breakdown is sorted by total descending.
- Submit with empty amount → inline error appears, no page reload.
- Submit with amount `0` or `-5` → inline error appears.
- Submit with no category selected (edge case: categories list is empty for some reason) →
  inline error appears.
- "No expenses yet this month." empty state shown on a fresh account after the first visit
  (categories seeded but no expenses yet).
- All interactions work on a mobile browser (touch targets ≥ 44px, no horizontal scroll).

---

## Testing Strategy

### Automated

`npm run lint` and `npm run build` are the primary automated gates. The project has no test
runner configured.

### Manual Testing Steps

1. Start local Supabase: `npx supabase start`.
2. Start dev server: `npm run dev`.
3. Sign up a new account at `/auth/signup`.
4. Visit `/dashboard` — confirm 8 default categories appear in the select.
5. Add expense: amount = `25.00`, category = "Food", date = today → submit.
6. Confirm: page reloads; breakdown shows "Food — 25.00".
7. Add another expense: amount = `10.00`, category = "Transport" → submit.
8. Confirm: breakdown shows Food (25.00) then Transport (10.00) — sorted descending.
9. Add another Food expense: `15.00` → confirm breakdown shows Food (40.00), Transport (10.00).
10. Try invalid input: clear amount, submit → inline error shows; page does NOT reload.
11. Try amount = `0` → inline error shows.
12. Open the Supabase Studio at `http://127.0.0.1:54323` → confirm `expenses` rows exist with
    correct `user_id`, `category_id`, `amount`, `expense_date`.
13. Open a second browser session (incognito) → sign up a different account → visit dashboard
    → confirm this user's breakdown is empty (RLS isolation working).

## References

- Roadmap S-01: `context/foundation/roadmap.md`
- PRD — FR-003, FR-007, FR-012, US-01: `context/foundation/prd.md`
- Domain schema (tables + RLS): `supabase/migrations/20260527000000_create_domain_schema.sql`
- Domain types: `src/types.ts`
- Database types: `src/database.types.ts`
- Auth form patterns: `src/components/auth/SignInForm.tsx`, `src/components/auth/FormField.tsx`
- Auth API pattern: `src/pages/api/auth/signin.ts`
- Supabase client: `src/lib/supabase.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Data Layer

#### Automated

- [x] 1.1 `npm run lint` passes across all four new files — 64626d9
- [x] 1.2 `npm run build` passes — 64626d9

#### Manual

- [x] 1.3 (No standalone manual check — integration verified in Phase 3) — 64626d9

### Phase 2: Expense Form Components

#### Automated

- [x] 2.1 `npm run lint` passes for SelectField and ExpenseForm — 33c3f12
- [x] 2.2 `npm run build` passes — 33c3f12

#### Manual

- [x] 2.3 (No standalone manual check — integration verified in Phase 3) — 33c3f12

### Phase 3: Dashboard Rebuild

#### Automated

- [x] 3.1 `npm run lint` passes for rebuilt dashboard.astro
- [x] 3.2 `npm run build` passes end-to-end

#### Manual

- [x] 3.3 Default categories appear in select on first visit
- [x] 3.4 Seeding is idempotent (two-tab race produces no error)
- [x] 3.5 Submitting a valid expense updates the breakdown correctly
- [x] 3.6 Multiple expenses aggregate and sort correctly
- [x] 3.7 Invalid input (empty amount, zero, negative) shows inline errors without reload
- [x] 3.8 Empty state renders correctly before first expense
- [x] 3.9 All interactions work on a mobile browser
- [x] 3.10 RLS isolation verified via second browser session (different account sees empty breakdown)
