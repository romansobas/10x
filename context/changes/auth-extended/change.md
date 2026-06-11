---
change_id: auth-extended
title: Extended auth — guest access and password reset
status: implemented
created: 2026-06-11
updated: 2026-06-11
archived_at: null
---

## Notes

S-05 from roadmap. Runs in parallel with F-01 (domain-schema-rls).

Guest architecture decision (resolved at planning time): **Supabase anonymous auth**.
Rationale: creates a real user session that maps to the existing middleware/dashboard
flow without changes; can be upgraded to a permanent account on signup; dashboard
degrades gracefully to an empty state if domain tables (F-01) aren't yet present.
