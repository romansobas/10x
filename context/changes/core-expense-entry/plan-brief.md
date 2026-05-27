# Core Expense Entry and Month-to-Date Breakdown — Plan Brief

> Full plan: `context/changes/core-expense-entry/plan.md`

## What & Why

Build S-01 — the north-star slice of BudgetFlow. A signed-in user can add an expense (amount,
category, date) and immediately see it reflected in the current month's spending breakdown by
category. This slice proves the core product hypothesis: that adding an expense and seeing it
in a category breakdown creates enough daily-return value to sustain the 30-day entry habit.

## Starting Point

The dashboard is a placeholder. Domain tables (`categories`, `expenses`) exist with RLS after
F-01. No service layer, no domain API endpoints, and no expense or category UI components
exist yet. The auth form patterns (FormField, SubmitButton, ServerError) and the API endpoint
pattern (`/api/auth/signin.ts`) are the established conventions to follow.

## Desired End State

A user visits `/dashboard`, sees a form pre-populated with 8 default categories, adds an
expense, and the page reloads showing the updated month-to-date breakdown sorted by total.
Invalid submissions show inline field errors. A server-side failure shows a banner. The entire
flow is usable on a mobile browser without horizontal scrolling.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Default category seeding | Auto-insert all 8 on first visit | User sees categories immediately without any extra step | Plan |
| Page layout | Form at top, breakdown below, single page | One thumb zone; everything visible without navigation | Plan |
| Data flow | SSR fetch + full page reload after submit | Mirrors auth pattern; zero client-side state; breakdown is always correct | Plan |
| Month scope | Current month only | Keeps north-star slice focused; past navigation deferred to S-03 | Plan |
| Category picker | Native `<select>`, styled to dark theme | Works reliably on all mobile browsers; no JS overhead | Plan |
| Post-submit UX | Redirect back to `/dashboard` | Simplest; breakdown guaranteed fresh from DB | Plan |
| Validation | Inline client-side + `?error=` query param for server errors | Mirrors SignInForm; server errors always surfaced | Plan |
| Aggregation | TypeScript sum over fetched expense list | No DB function needed; MVP data volumes are small | Plan |
| Default categories list | Food, Transport, Housing, Utilities, Healthcare, Entertainment, Clothing, Other | 8 universally applicable categories for the household persona | Plan |

## Scope

**In scope:**
- `src/lib/defaults.ts` — 8 default category names
- `src/lib/services/categories.ts` — `getUserCategories`, `seedDefaultCategories`
- `src/lib/services/expenses.ts` — `addExpense`, `getMonthBreakdown`
- `src/pages/api/expenses.ts` — POST endpoint
- `src/components/expenses/SelectField.tsx` — styled native `<select>` component
- `src/components/expenses/ExpenseForm.tsx` — React island (amount + category + date)
- `src/pages/dashboard.astro` — full rebuild with SSR data, form + breakdown

**Out of scope:**
- Month navigation (prev/next) → S-03
- Budget limit comparison in breakdown → S-04
- Category create/delete → S-02
- Optimistic UI updates (no client-side fetch)
- Form validation library (zod, react-hook-form)

## Architecture / Approach

All data flows server-side. The Astro dashboard page fetches categories and the month's
expenses from Supabase at request time, passes categories as a prop to the React `ExpenseForm`
island (`client:load`), and renders the breakdown as static Astro markup. The form submits
as a native `method="POST"` to `/api/expenses`, which inserts the row and redirects back to
`/dashboard`. The redirect triggers a fresh SSR render with the updated breakdown — no
client-side state, no stale data.

```
GET /dashboard
  → Astro SSR: getUserCategories + seedIfEmpty + getMonthBreakdown
  → render: [ExpenseForm island] + [breakdown list]

POST /api/expenses
  → validate → addExpense → redirect /dashboard
  → full SSR reload shows updated breakdown
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data Layer | Service functions + POST API endpoint; all data contracts defined | NUMERIC runtime/type mismatch (always parseFloat) |
| 2. Expense Form | SelectField + ExpenseForm React island; form UI ready to integrate | No standalone testing — bugs surface only in Phase 3 |
| 3. Dashboard Rebuild | Full integration: SSR data fetch, auto-seeding, form + breakdown | Seeding race condition (mitigated by upsert ignoreDuplicates) |

**Prerequisites:** F-01 (domain-schema) must be applied (`npx supabase db reset` completed).
Local Supabase must be running (`npx supabase start`) with `.dev.vars` configured.

**Estimated effort:** ~2 sessions across 3 phases.

## Open Risks & Assumptions

- The native `<select>` on iOS shows the OS wheel picker — design is acceptable; no custom
  dropdown work needed for MVP.
- `useFormStatus()` from `react-dom` may not reflect pending state for native POST forms
  (React Server Actions only). The SubmitButton spinner may not appear — acceptable for MVP,
  consistent with the existing auth forms.

## Success Criteria (Summary)

- User can add an expense and see it in the breakdown within one page reload.
- Invalid input produces inline field errors without a network round-trip.
- A second user signing in sees an empty breakdown (RLS isolation holds).
