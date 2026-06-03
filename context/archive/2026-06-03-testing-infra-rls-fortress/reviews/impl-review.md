<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Test Infra Bootstrap and RLS Fortress

- **Plan**: context/changes/testing-infra-rls-fortress/plan.md
- **Scope**: All 3 phases
- **Date**: 2026-06-03
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — No cleanup if signInWithPassword fails mid-createTestUser

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/tests/integration/helpers.ts:36-41
- **Detail**: `adminClient.auth.admin.createUser()` succeeds at line 26, but if `signInWithPassword()` fails or returns no session, `createTestUser` throws without calling `deleteTestUser`. The auth user is orphaned permanently. On the next run, `createUser({ email: "rls-${suffix}@test.local" })` returns a duplicate-email error, causing the entire test file to fail with a cryptic beforeAll error.
- **Fix**: Wrap the sign-in block in try/catch and call `adminClient.auth.admin.deleteUser(createData.user.id)` before re-throwing.
  - Strength: Eliminates orphan on any setup failure path; makes the helper self-healing.
  - Tradeoff: Slightly more complex helper; cleanup call could itself fail (acceptable).
  - Confidence: HIGH — standard pattern for paired create/setup operations.
  - Blind spot: None significant.
- **Decision**: FIXED — try/catch added around sign-in block in helpers.ts; deleteUser called before re-throw.

### F2 — UPSERT IDOR cleanup relies on implicit cascade ordering

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/tests/integration/rls-budget-limits.test.ts:80
- **Detail**: `upsertBudgetLimit(userB.client, userB.userId, catAId, 999)` creates a real row (user_id=userB, category_id=catAId) not explicitly deleted in `afterAll`. Cleanup works because deleting userA cascades to catAId → budget_limits. The current `afterAll` order `[userA, userB]` makes this work, but it's a silent dependency.
- **Fix A ⭐ Recommended**: Add a comment in `afterAll` documenting the cascade dependency explicitly.
  - Strength: Zero code change; makes the implicit dependency visible.
  - Tradeoff: Still relies on the cascade; a schema FK change would silently break cleanup.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Fix B**: Explicitly delete the userB budget_limit row via admin client in afterAll before deleteTestUser.
  - Strength: Self-contained; robust to FK schema changes.
  - Tradeoff: Requires exposing admin client to the test file.
  - Confidence: MEDIUM.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — comment added to afterAll documenting cascade dependency.

### F3 — Re-reads after UPDATE denial don't check own error field

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: rls-categories.test.ts:50, rls-expenses.test.ts:60, rls-budget-limits.test.ts:65
- **Detail**: Re-reads destructure only `{ data }`. If the re-read itself errors, `data` is null, `data?.name` is undefined, and the test fails with `undefined !== "User A Category"` instead of a clear "re-read failed" message.
- **Fix**: Destructure `{ data, error: reReadError }` and add `expect(reReadError).toBeNull()` before the value assertion.
- **Decision**: FIXED — reReadError destructured and checked in all 3 files.

### F4 — Smoke test doesn't exercise the authenticated client

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/tests/integration/smoke.test.ts:6-7
- **Detail**: Verifies `user.client` is non-null but never sends a query through it. A misconfigured Bearer token would pass the smoke test but cause all RLS tests to fail with auth errors.
- **Fix**: Add `const { error } = await user.client.from('categories').select('id').limit(1)` and `expect(error).toBeNull()`.
- **Decision**: FIXED — real categories query added to smoke test; error checked.

### F5 — afterAll: first deleteTestUser failure silently skips second

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Reliability
- **Location**: afterAll in rls-categories.test.ts, rls-expenses.test.ts, rls-budget-limits.test.ts
- **Detail**: Sequential `deleteTestUser` calls — if the first throws, the second never runs and userB is orphaned.
- **Fix**: Replace with `await Promise.all([deleteTestUser(userA.userId), deleteTestUser(userB.userId)])`.
- **Decision**: FIXED — Promise.all applied in all 3 files; budget-limits comment updated to explain concurrent cascade cleanup.
