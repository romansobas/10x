---
change_id: trend-chart
title: Trend chart — monthly overview and two-month drill-down
status: implementing
created: 2026-06-11
updated: 2026-06-11
archived_at: null
---

## Notes

Un-parks FR-013 from roadmap. No new roadmap slice ID assigned — added directly.
Prerequisites: S-01 (core expense entry) and S-02 (category management) must be live
so the user has multi-month data to visualise. Both are implemented.

Chart library chosen at planning time: **Recharts** — most widely used React chart
library, React 19 compatible, SSR-safe when used with `client:load`, acceptable
bundle size for Cloudflare Workers edge deployment.
