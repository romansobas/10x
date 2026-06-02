# Expense Management — Plan Brief

> Full plan: `context/changes/expense-management/plan.md`

## What & Why

S-03 adds the expense management slice: browsing, filtering, editing, and deleting expenses.
Users can already add expenses (S-01); now they need to correct mistakes, clean up old entries,
and drill into a specific month or category — the full CRUD story for expense records.

## Starting Point

The `Expense` type and `addExpense` service function exist. A single `POST /api/expenses`
endpoint handles creation. There is no list endpoint, no edit or delete endpoint, and no
`/expenses` page. The dashboard hard-codes the current month's breakdown.

## Desired End State

A signed-in user can visit `/expenses` to see their expenses for any month, filter by category,
edit a row inline, and delete a row with a two-step confirmation — all without full page
reloads. A "View expenses" link on the dashboard makes the page discoverable.

## Key Decisions Made

| Decision | Choice | Why |
|---|---|---|
| Page location | Separate `/expenses` page | Dashboard is already full; consistent with `/categories` pattern |
| Month navigation | React island with client-side state | No page reload on month change — better UX |
| Data fetching | New `GET /api/expenses` JSON endpoint | Clean separation; island doesn't need client-side Supabase credentials |
| Edit UX | Inline edit within the React island | No navigation away from the list; smooth on mobile |
| Delete confirmation | Inline two-step in the React island | Fast, in-context, no extra page; confirmation satisfies FR-009 |
| Category filter | Dropdown select inside the island | Mobile-native picker; up to 20 options is manageable |
| Dashboard link | "View expenses" text link after breakdown card | Discoverable; matches "Manage categories" link pattern |

## Scope

**In scope:** browse by month (prev/next nav), filter by category, inline edit (amount / category / date), inline delete with two-step confirm, `GET /api/expenses` JSON endpoint, middleware protection, dashboard link.

**Out of scope:** keyword search, pagination, undo/soft delete, multi-month date-range view, changing the expense creation flow.

## Architecture / Approach

```
/expenses (Astro SSR)
  SSR: getUserCategories + getMonthExpenses → initial props
  ← ExpenseList (React island, client:load)
       ← GET /api/expenses?year=X&month=Y&category_id=Z  (re-fetch on nav/filter)
       → POST /api/expenses/[id]   → updateExpense(supabase, userId, id, payload)
       → DELETE /api/expenses/[id] → deleteExpense(supabase, userId, id)
```

`src/pages/api/expenses.ts` is renamed to `src/pages/api/expenses/index.ts` in Phase 1 to
make room for the `[id].ts` sibling.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Data Layer & API | ExpenseWithCategory type, 3 service functions, GET/POST/DELETE endpoints | File rename prerequisite; `DELETE` export must be wired in Astro |
| 2. ExpenseList Island | Full React island: month nav, filter, inline edit, inline delete-confirm | Component complexity — month wrap-around edge case, concurrent edit+delete state |
| 3. Page, Middleware, Dashboard | /expenses wired, route protected, dashboard linked | Manual testing gate — all FR-008–011 verified here |

**Prerequisites:** S-01 (`core-expense-entry`) must be complete — expense table and `addExpense` service must exist.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- `ExpenseList` is the most substantial React component in the codebase so far; inline edit + delete-confirm state interactions need careful handling to avoid UI glitches (e.g., cancel edit when delete confirm is open on the same row).
- The `Expense.amount` type mismatch (typed `string` in `src/types.ts`, runtime `number` from Supabase) is handled by `String()` wrapping in the service layer — must not be skipped.

## Success Criteria (Summary)

- Month navigation changes the expense list without a full page reload.
- Editing and deleting expenses works reliably, with appropriate error feedback.
- `/expenses` requires authentication and is reachable from the dashboard.
