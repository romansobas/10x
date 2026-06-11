---
change_id: dashboard-ux
title: Dashboard navigation panel + trends Y-axis fix
status: implementing
created: 2026-06-11
updated: 2026-06-11
archived_at: null
---

## Notes

Two UI polish fixes reported after trend-chart launch:

1. **Y-axis truncation on Trends page** — large numbers (3+ digits) get clipped because
   the chart has a negative left margin (`left: -16`) and ticks include two decimal places.
   Fix: widen the left margin and format Y-axis ticks as integers; keep `toFixed(2)` in
   tooltip only.

2. **Dashboard navigation is scattered** — "Manage categories" sits just below the Add
   expense form, "View expenses" is isolated at the bottom of the page. User wants a
   single navigation panel at the top of the page content (below the header, above the
   Add expense form) with a clear priority order: Trends → View expenses → Manage categories.
