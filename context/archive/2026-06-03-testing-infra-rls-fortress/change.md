---
change_id: testing-infra-rls-fortress
title: Test infra bootstrap and RLS fortress
status: archived
created: 2026-06-03
updated: 2026-06-03
archived_at: 2026-06-03T08:46:53Z
---

## Notes

Rollout Phase 1 of context/foundation/test-plan.md: "Test infra bootstrap + RLS fortress".

Risks covered: #1 (Cross-user data leak — authenticated user reads or writes another user's rows by guessing resource IDs), #3 (IDOR on mutations — POST/DELETE with another user's resource ID not rejected at the server layer).

Test types planned: integration (real Supabase DB).

Risk response intent:
- Risk #1: Prove User A authenticated cannot SELECT, INSERT, UPDATE, or DELETE User B's rows — even using User B's exact resource IDs — across all three tables (expenses, categories, budget limits). Challenge "SELECT policy set = fully enforced" — INSERT/UPDATE/DELETE policies may be absent for one or more tables.
- Risk #3: Prove DELETE on another user's resource ID returns 403 or 404; POST with another user's category_id returns 4xx. Challenge "Authenticated = authorized" — being logged in does not mean owning the resource.
