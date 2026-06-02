# Per-Category Budget Limits — Plan Brief

> Full plan: `context/changes/budget-limits/plan.md`

## What & Why

S-04 adds the final must-have financial insight: per-category monthly budget limits with
overrun markers. Users can now set a spending cap on any category and see at a glance —
on the dashboard — whether they're under or over for the current month. This closes the
core product loop: track → categorize → limit → observe.

## Starting Point

The `budget_limits` table is fully in place (schema, constraints, RLS, triggers). The
`BudgetLimit` type exists in `src/types.ts` but nothing consumes it. `getMonthBreakdown`
returns plain totals with no budget context. The categories page manages category CRUD
but has no limit UI.

## Desired End State

A user can open `/categories`, type a number into any category row, and save a monthly
spending cap. The dashboard breakdown immediately reflects the cap: `45.00 / 100.00` with
a muted "55.00 remaining" line when under budget, or `115.00 / 100.00` in red with "+15.00
over" when the category is busted. Limits are optional; categories without one show the
existing total-only layout.

## Key Decisions Made

| Decision | Choice | Why |
|---|---|---|
| Where to set limits | Extend /categories page | All category management lives there; no new navigation needed |
| Set limit UX | Always-visible inline number input per row | Fast to change; no extra click; consistent with one-action-per-row pattern |
| Remove limit UX | "Remove limit" link, only shown when limit is set | Explicit; consistent with Delete pattern; avoids ambiguous empty-submit |
| Overrun display | `spent / limit` text + colored sub-line | Communicates both total and delta in one row; no layout heavy-lifting |
| Remaining line | Yes — show `X remaining` (muted) / `+X over` (red) | Immediately actionable mid-month; one extra line is worth the clarity |
| Expenses page | No budget markers — dashboard only | Matches PRD scope; /expenses is for history navigation, not budget monitoring |
| Data fetch | Extend getMonthBreakdown with third Promise.all leg | One call from the dashboard; mirrors existing two-query pattern exactly |
| API shape | Single `POST /api/budget-limits/[category_id]` with `_action` discriminator | Avoids Astro routing conflict between `[id].ts` file and `[id]/` directory |
| Empty input | Placeholder "No limit", saving empty is validated and rejected | No ambiguity about whether empty means "no limit" vs "zero" |

## Scope

**In scope:** inline limit inputs on /categories; upsert + delete API; enriched getMonthBreakdown; dashboard overrun/remaining markers.

**Out of scope:** per-month budget limits, warning thresholds, budget markers on /expenses, default limits for existing categories.

## Architecture / Approach

```
/categories (Astro SSR)
  → POST /api/budget-limits/[category_id]  (_action=remove OR limit=N)
       → upsertBudgetLimit / deleteBudgetLimit  →  budget_limits table

/dashboard (Astro SSR)
  ← getMonthBreakdown(supabase, userId, year, month)
      Promise.all([expenses, categories, budget_limits])
      → CategoryTotal[] with limit?: number
```

`CategoryTotal` gains an optional `limit?: number` field — backward-compatible; the
only consumer is `dashboard.astro`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Data Layer & API | Extended types, getMonthBreakdown enrichment, budget-limits service, single API endpoint | onConflict upsert syntax must match exact constraint column names |
| 2. Categories Page | Inline limit input + Save + Remove per category row | Row layout on mobile — three action areas in one row |
| 3. Dashboard Markers | spent/limit display + remaining/overrun sub-lines | Calculation correctness — overrun delta must round to 2dp consistently |

**Prerequisites:** S-01 (`core-expense-entry`) and S-02 (`category-management`) must be complete and deployed. Both are done.
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- `monthly_limit` in the DB is typed as `number` in `database.types.ts` (unlike `expenses.amount` which is string at runtime). The plan treats it as a number throughout — if that assumption is wrong, `parseFloat(String(l.monthly_limit))` is the fix.
- The Astro routing behavior with `[category_id].ts` and a potential future `[category_id]/` directory hasn't been tested — the single-file `_action` discriminator explicitly avoids this.

## Success Criteria (Summary)

- User can set, update, and remove a budget limit per category from /categories.
- Dashboard breakdown shows `spent / limit` with remaining or overrun context for all limited categories.
- Categories with no limit are visually unchanged.
