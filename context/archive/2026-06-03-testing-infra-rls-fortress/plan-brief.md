# Test Infra Bootstrap and RLS Fortress — Plan Brief

> Full plan: `context/changes/testing-infra-rls-fortress/plan.md`
> Research: `context/changes/testing-infra-rls-fortress/research.md`

## What & Why

Bootstrap Vitest from scratch and write integration tests proving that all three
tables (categories, expenses, budget_limits) enforce per-user data isolation via
Supabase RLS. This is rollout Phase 1 of `context/foundation/test-plan.md`,
protecting Risks #1 (cross-user data leak) and #3 (IDOR on mutations). No prior
test infrastructure exists — everything is built here.

## Starting Point

The project has zero test files, no Vitest, and no test script. The Supabase local
stack is fully configured (`supabase/config.toml`, one migration, local creds in
`.dev.vars`). Service functions accept `(supabaseClient, userId)` — the natural
integration test seam, requiring no HTTP layer or mocking.

## Desired End State

`npm test` runs three integration test files (one per table) and all pass. Each file
creates two isolated test users, runs SELECT/INSERT/UPDATE/DELETE cross-user denial
tests against the real DB, verifies resources remain intact after failed attacks, then
cleans up via `deleteUser` cascade. The §6.1 cookbook documents the pattern for
adding new RLS tests.

## Key Decisions Made

| Decision | Choice | Why | Source |
|----------|--------|-----|--------|
| Test layer | Service-level (not HTTP) | Bypasses Cloudflare/Astro runtime; service functions accept client as param | User + Research |
| Test environment | Vitest node | No browser or workerd needed for pure DB integration | Research |
| Category_id ownership gap | Deferred | Not a data-leak IDOR; integrity-only issue, separate scope | User |
| User lifecycle | `beforeAll`/`afterAll` per test file | Full test-file independence; no shared user state between files | User |
| Test location | `src/tests/integration/` | Keeps integration tests separate from source; appropriate for DB-touching tests | User |
| Teardown approach | `admin.deleteUser` only | `user_id ON DELETE CASCADE` on all three tables; PostgreSQL handles ordering | Research |
| Authenticated client | Bearer token in Authorization header | Standard pattern for non-cookie Supabase clients in Node | Research |

## Scope

**In scope:**
- Install Vitest + config with `@/` alias and node environment
- `src/tests/integration/helpers.ts` — `createTestUser`/`deleteTestUser`
- `.env.test.example` template + gitignore entry
- `rls-categories.test.ts`, `rls-expenses.test.ts`, `rls-budget-limits.test.ts`
- All four RLS operations tested per table (SELECT, INSERT, UPDATE, DELETE)
- Service-function IDOR tests for DELETE (and upsert on budget_limits)
- Cookbook §6.1 + §6.6 update

**Out of scope:**
- HTTP-level tests; CI wiring; coverage reporting
- Auth middleware tests (Risk #7, Phase 2 rollout)
- category_id ownership gap fix; budget arithmetic tests

## Architecture / Approach

```
npm test
  └─ Vitest (node env, @/ alias, 30s timeout)
       ├─ rls-categories.test.ts
       │    beforeAll: createTestUser('cat-a'), createTestUser('cat-b')
       │               + insert category as userA
       │    5 tests: SELECT/INSERT/UPDATE/DELETE RLS + IDOR DELETE via service fn
       │    afterAll: deleteTestUser x2 (CASCADE cleans all rows)
       ├─ rls-expenses.test.ts    (same pattern, extra catA FK in beforeAll)
       └─ rls-budget-limits.test.ts (same pattern, extra catA + limitA in beforeAll)

helpers.ts
  adminClient (service role key, bypasses RLS) — used only for setup/teardown
  createTestUser(suffix) → { userId, client: Bearer-token authenticated client }
  deleteTestUser(userId) → admin.deleteUser → CASCADE
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. Vitest Bootstrap | Working `npm test`; smoke test; helpers; `.env.test` template | Vitest `@/` alias misconfiguration breaks service imports |
| 2. RLS + IDOR Tests | 15 assertions across 3 tables proving cross-user isolation | RLS assertion shapes (INSERT → error; DELETE → 0 rows) require careful matching |
| 3. Cookbook Update | §6.1 + §6.6 in test-plan.md complete | — |

**Prerequisites:** `npx supabase start` (Docker required); `.env.test` populated from
`npx supabase status`.
**Estimated effort:** ~2 sessions across 3 phases.

## Open Risks & Assumptions

- Supabase's `auth.admin.deleteUser` triggers PostgreSQL cascades correctly for
  teardown. If it doesn't, `helpers.ts` teardown must manually delete rows in order
  (expenses → budget_limits → categories → user).
- The `sb_secret_*` format service role key (new in Supabase CLI v2.x) works with
  the `@supabase/supabase-js` admin client. Verify this in Phase 1 smoke test.

## Success Criteria (Summary)

- `npm test` passes all 15+ assertions with no orphaned test users in Supabase Studio.
- Temporarily disabling RLS on any table causes that table's SELECT isolation test to fail.
- §6.1 cookbook is followable by a new contributor without reading this plan.
