---
change_id: dashboard-ux
title: Dashboard navigation panel + trends Y-axis fix
status: planned
created: 2026-06-11
---

# Plan: dashboard-ux

## Objective

Two focused UI fixes:

1. **Trends Y-axis** — stop large numbers from being clipped. Format axis ticks as integers
   (no decimals); widen the left margin so labels have room. Keep `toFixed(2)` precision in
   the hover tooltip.

2. **Dashboard quick-nav panel** — replace the two scattered link groups (quick-links row
   after the form, "View expenses" at the bottom) with one horizontal nav panel positioned
   between the header and the Add expense card. Priority order: **Trends → View expenses →
   Manage categories** (most-used first, least-used last).

---

## Phase 1: Trends Y-axis fix

### Goal

Numbers on the Y-axis of both bar charts in `TrendsView` render as integers and are never
clipped on the left edge.

### Changes required

**`src/components/trends/TrendsView.tsx`**

- Change `YAxis tickFormatter` from `fmt` (which does `toFixed(2)`) to a new inline
  formatter that rounds to the nearest integer: `(v) => Math.round(v as number).toString()`.
- Increase the left margin on both `BarChart` elements from `-16` to `8` so the axis
  labels are not cut by the card edge.
- `fmt` stays in use for the `Tooltip` `formatter` only — hover still shows two decimal
  places.

### Success criteria

- Y-axis labels show no decimal separator (e.g. `1 234` not `1 234.00`).
- Labels are fully visible on a 390 px viewport; no clipping at any reasonable amount.
- Tooltip still shows `toFixed(2)` precision on hover.
- ESLint + TSC: 0 errors.

---

## Phase 2: Dashboard navigation panel

### Goal

Replace scattered links on `dashboard.astro` with a single pill-style horizontal nav panel
placed directly below the header row (above the Add expense card).

### Changes required

**`src/pages/dashboard.astro`**

Remove two existing link groups:
1. The `<!-- Quick links -->` div (currently between the Add expense card and the month
   breakdown card) containing "Manage categories" and "Trends".
2. The `<!-- View expenses link -->` div at the bottom of the page.

Add a new quick-nav panel between `<!-- Header -->` and `<!-- Add expense card -->`:

```astro
<!-- Quick nav -->
<div class="flex gap-2 rounded-xl border border-white/10 bg-white/5 p-2 backdrop-blur-xl">
  <a href="/trends"
     class="flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium text-blue-100/70
            transition-colors hover:bg-white/10 hover:text-white">
    Trends
  </a>
  <a href="/expenses"
     class="flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium text-blue-100/70
            transition-colors hover:bg-white/10 hover:text-white">
    View expenses
  </a>
  <a href="/categories"
     class="flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium text-blue-100/70
            transition-colors hover:bg-white/10 hover:text-white">
    Manage categories
  </a>
</div>
```

### Success criteria

- Dashboard shows exactly one navigation panel, positioned above the Add expense card.
- Panel contains three links in order: Trends, View expenses, Manage categories.
- No other standalone navigation links remain on the page.
- Panel fits on 390 px viewport without overflow (three equal-width `flex-1` pills).
- ESLint + TSC: 0 errors.
- Guest banner (anonymous user) still renders above the header when applicable.

---

## Affected files

| File | Change |
|------|--------|
| `src/components/trends/TrendsView.tsx` | Integer Y-axis ticks + wider left margin |
| `src/pages/dashboard.astro` | New quick-nav panel; remove old scattered links |

---

## Risk register

| Risk | Mitigation |
|------|------------|
| Wider left margin causes chart to lose horizontal space | Increase only to `8` (vs current `-16`); `ResponsiveContainer width="100%"` reflows automatically |
| Three-pill nav wraps on very narrow screens | `flex-1` ensures equal distribution; text is short enough to fit on 320 px |

## References

- Trend chart island: `src/components/trends/TrendsView.tsx`
- Dashboard page: `src/pages/dashboard.astro`
- Recharts margin API: https://recharts.org/en-US/api/BarChart

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Trends Y-axis fix

#### Automated

- [x] 1.1 Integer Y-axis ticks and wider left margin in TrendsView

#### Manual

- [x] 1.2 Verify Y-axis labels unclipped on /trends with real data

### Phase 2: Dashboard navigation panel

#### Automated

- [ ] 2.1 Replace scattered links with quick-nav panel on dashboard.astro

#### Manual

- [ ] 2.2 Verify panel renders above Add expense card
- [ ] 2.3 Verify all three links navigate correctly
- [ ] 2.4 Verify no overflow on 390px viewport
