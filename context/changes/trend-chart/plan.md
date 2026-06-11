---
change_id: trend-chart
title: Trend chart — monthly overview and two-month drill-down
status: planned
created: 2026-06-11
prd_refs: FR-013
---

# Plan: trend-chart

## Objective

Deliver FR-013: a `/trends` page with two linked visualisations:

1. **Monthly trend chart** — bar chart of total spending per month across all months the user has data for. Shows the shape of spending over time at a glance.
2. **Two-month drill-down** — grouped bar chart comparing spending per category for any two months the user selects. Defaults to the two most recent months with data.

Both charts are rendered client-side in a single React island (`TrendsView`). The server pre-loads all needed data so there are no client-side fetches — the island is interactive but data-complete from the first paint.

## Architecture decisions

### Chart library: Recharts

No chart library is currently installed. Recharts is chosen because it is the most widely used React chart library, is React 19 compatible, ships with built-in responsive containers, and works correctly with `client:load` (SSR-safe — renders nothing server-side, hydrates on the client). Bundle impact is ~200 KB gzipped, acceptable for a Cloudflare Workers edge deployment where initial HTML is SSR and JS is loaded separately.

### Data loading: single-query TypeScript aggregation

The page server-handler fetches **all expenses** (amount, category_id, expense_date) plus categories and budget limits for the user in three parallel queries — reusing the same Supabase calls as `getMonthBreakdown`. Aggregation into per-month-per-category totals is done in TypeScript. This avoids needing a custom Supabase RPC function. For a personal expense tracker the row count is small; if it grows, a server-side aggregate can replace this without changing the component interface.

### Single island, all data pre-loaded

`TrendsView` receives `monthlyData: MonthlyBreakdownEntry[]` (all months, sorted chronologically). It derives:
- Trend totals: `monthlyData.map(m => ({ label: m.label, total: m.total }))`
- Drill-down: pick two months by index, merge their `breakdown` arrays

Month selectors are `<select>` elements driven by React state; no API calls on selection change.

### Navigation

`/trends` added to `PROTECTED_ROUTES` in middleware. "Trends" link added to `Topbar.astro` (appears for logged-in users) and to the quick-links row on `dashboard.astro`.

## Scope

**In scope:**
- `getAllMonthlyBreakdowns` service function + `MonthlyBreakdownEntry` type
- `src/pages/trends.astro` — server page (protected)
- `src/components/trends/TrendsView.tsx` — React island (trend + drill-down)
- Recharts install
- Navigation wiring (Topbar + dashboard)
- Middleware protection for `/trends`

**Out of scope:**
- Annual/year-over-year summary (separate from FR-013)
- Category filter on trend chart (nice-to-have on top of FR-013)
- Export / download of chart data
- Animation or interactions beyond month selection

## Affected files

| File | Change |
|------|--------|
| `src/lib/services/expenses.ts` | Add `getAllMonthlyBreakdowns` + `MonthlyBreakdownEntry` type |
| `src/pages/trends.astro` | New — server page |
| `src/components/trends/TrendsView.tsx` | New — React island |
| `src/middleware.ts` | Add `/trends` to `PROTECTED_ROUTES` |
| `src/components/Topbar.astro` | Add "Trends" nav link |
| `src/pages/dashboard.astro` | Add "Trends" quick-link |
| `package.json` / `package-lock.json` | Add `recharts` dependency |

---

## Phase 1: Data layer

### Goal

Add the `getAllMonthlyBreakdowns` service function that powers both charts. No UI in this phase.

### Steps

**1.1** — `MonthlyBreakdownEntry` type in `src/lib/services/expenses.ts`

```ts
export interface MonthlyBreakdownEntry {
  year: number;
  month: number;   // 1-12
  label: string;   // e.g. "Jun 2026"
  total: number;
  breakdown: CategoryTotal[];
}
```

**1.2** — `getAllMonthlyBreakdowns` function in `src/lib/services/expenses.ts`

Single function that fetches all expenses, categories, and budget limits for a user in three parallel queries, then aggregates into `MonthlyBreakdownEntry[]` sorted chronologically (oldest → newest).

```ts
export async function getAllMonthlyBreakdowns(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<MonthlyBreakdownEntry[]> {
  const [expensesResult, categoriesResult, limitsResult] = await Promise.all([
    supabase.from("expenses").select("amount, category_id, expense_date").eq("user_id", userId),
    supabase.from("categories").select("id, name").eq("user_id", userId),
    supabase.from("budget_limits").select("category_id, monthly_limit").eq("user_id", userId),
  ]);

  if (expensesResult.error) throw expensesResult.error;
  if (categoriesResult.error) throw categoriesResult.error;
  if (limitsResult.error) throw limitsResult.error;

  const catMap = new Map(categoriesResult.data.map((c) => [c.id, c.name]));
  const limitsMap = new Map(limitsResult.data.map((l) => [l.category_id, l.monthly_limit]));

  // Group by "YYYY-MM" key
  const byMonth = new Map<string, Map<string, number>>();
  for (const exp of expensesResult.data) {
    const key = exp.expense_date.slice(0, 7); // "YYYY-MM"
    if (!byMonth.has(key)) byMonth.set(key, new Map());
    const cats = byMonth.get(key)!;
    cats.set(exp.category_id, (cats.get(exp.category_id) ?? 0) + parseFloat(String(exp.amount)));
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, cats]) => {
      const [yearStr, monthStr] = key.split("-");
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);
      const date = new Date(year, month - 1);
      const label = date.toLocaleString("en-US", { month: "short", year: "numeric" });
      const breakdown: CategoryTotal[] = Array.from(cats.entries())
        .map(([category_id, total]) => ({
          category_id,
          category_name: catMap.get(category_id) ?? "Unknown",
          total,
          limit: limitsMap.get(category_id),
        }))
        .sort((a, b) => b.total - a.total);
      const total = breakdown.reduce((sum, c) => sum + c.total, 0);
      return { year, month, label, total, breakdown };
    });
}
```

### Success criteria

- `getAllMonthlyBreakdowns` compiles with no TSC errors
- Returns entries sorted oldest → newest
- Returns empty array when user has no expenses
- `total` on each entry equals sum of its `breakdown` totals

---

## Phase 2: Trends page

### Goal

`/trends` page with working trend bar chart and two-month drill-down, wired into navigation.

### Steps

**2.1** — Install Recharts

```bash
npm install recharts
```

Recharts ships its own types; no `@types/recharts` needed.

**2.2** — `src/components/trends/TrendsView.tsx`

React island receiving `monthlyData: MonthlyBreakdownEntry[]`. Uses Recharts `ResponsiveContainer`, `BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `Legend`, `CartesianGrid`.

Structure:
```
TrendsView
  ├── if monthlyData.length === 0 → empty state ("No data yet…")
  ├── Section: "Spending over time"
  │     └── BarChart: x=label, y=total, one Bar (#8b5cf6)
  └── Section: "Compare two months"  (only if monthlyData.length >= 2)
        ├── <select> Month A  (default: second-to-last)
        ├── <select> Month B  (default: last)
        └── BarChart: x=category_name, grouped bars — Month A (#8b5cf6), Month B (#60a5fa)
            (only categories present in at least one of the two selected months)
```

Color palette stays on-brand with the cosmic UI: purple (`#8b5cf6`) and blue (`#60a5fa`).

Chart wrappers use `ResponsiveContainer width="100%" height={240}` to stay mobile-friendly.

`YAxis` and `Tooltip` format values with `toFixed(2)` to show currency amounts.

**2.3** — `src/pages/trends.astro`

```astro
---
import Layout from "@/layouts/Layout.astro";
import TrendsView from "@/components/trends/TrendsView";
import { createClient } from "@/lib/supabase";
import { getAllMonthlyBreakdowns } from "@/lib/services/expenses";
import type { MonthlyBreakdownEntry } from "@/lib/services/expenses";

const { user } = Astro.locals;
const supabase = createClient(Astro.request.headers, Astro.cookies);

let monthlyData: MonthlyBreakdownEntry[] = [];
if (supabase && user) {
  monthlyData = await getAllMonthlyBreakdowns(supabase, user.id);
}
---

<Layout title="Trends — BudgetFlow">
  <div class="bg-cosmic min-h-screen p-4">
    <div class="mx-auto max-w-md space-y-6 py-6">
      <div class="flex items-center justify-between text-white">
        <h1 class="...">Trends</h1>
        <a href="/dashboard" class="...">← Dashboard</a>
      </div>
      <TrendsView monthlyData={monthlyData} client:load />
    </div>
  </div>
</Layout>
```

**2.4** — `src/middleware.ts`

Add `"/trends"` to `PROTECTED_ROUTES`.

**2.5** — `src/components/Topbar.astro`

Add `<a href="/trends">` link next to the existing "Dashboard" link in the logged-in branch.

**2.6** — `src/pages/dashboard.astro`

Add a "Trends" link in the quick-links row (alongside "Manage categories" and "View expenses").

### Success criteria

- `/trends` redirects to `/auth/signin` when not logged in
- "Trends" link visible in Topbar for logged-in users
- Page loads with no JS errors when user has 0 months of data (shows empty state)
- Trend bar chart renders with correct month labels and totals
- Drill-down selectors default to the two most recent months
- Selecting different months updates the comparison chart without a page reload
- Charts are responsive (no horizontal overflow on 390px mobile width)

---

## Risk register

| Risk | Mitigation |
|------|------------|
| Recharts SSR crash (renders SVG on server) | `client:load` ensures Recharts only runs in browser; Astro page passes serialised data as props |
| Large dataset — fetching all expenses in one query | Acceptable for personal tracker MVP; document limit in code comment; replace with server-side aggregate RPC if needed |
| Category names change / category deleted | `catMap.get(category_id) ?? "Unknown"` handles missing categories gracefully |
| Two months with no shared categories | Drill-down shows each category in only one bar — correct behaviour, no special handling needed |

## References

- PRD: `context/foundation/prd.md` — FR-013
- Roadmap: `context/foundation/roadmap.md` — Parked section
- Recharts docs: https://recharts.org/en-US/api
- Existing service pattern: `src/lib/services/expenses.ts` — `getMonthBreakdown`
- Existing page pattern: `src/pages/expenses.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Data layer

#### Automated

- [x] 1.1 MonthlyBreakdownEntry type — f0782ac
- [x] 1.2 getAllMonthlyBreakdowns service function — f0782ac

### Phase 2: Trends page

#### Automated

- [x] 2.1 Install Recharts
- [x] 2.2 TrendsView React island
- [x] 2.3 trends.astro server page
- [x] 2.4 Add /trends to PROTECTED_ROUTES
- [x] 2.5 Add Trends link to Topbar
- [x] 2.6 Add Trends link to dashboard

#### Manual

- [x] 2.7 Verify trend chart renders with real data
- [x] 2.8 Verify drill-down comparison updates on month selection
- [x] 2.9 Verify no horizontal overflow on mobile width
