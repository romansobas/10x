---
date: 2026-06-03T00:00:00+00:00
researcher: Claude Sonnet 4.6
git_commit: 6ea7ee15d8b0d52aacb8a587497739aab49ea3b3
branch: master
repository: 10x
topic: "Test infra bootstrap and RLS fortress — Phase 1 grounding (Risks #1 and #3)"
tags: [research, rls, supabase, auth, testing, vitest, idor, integration-tests]
status: complete
last_updated: 2026-06-03
last_updated_by: Claude Sonnet 4.6
---

# Research: Test Infra Bootstrap and RLS Fortress (Phase 1)

**Date**: 2026-06-03  
**Researcher**: Claude Sonnet 4.6  
**Git Commit**: 6ea7ee15d8b0d52aacb8a587497739aab49ea3b3  
**Branch**: master  
**Repository**: 10x

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md`. For Risks #1 and #3:
- Verify actual RLS policy coverage across all three tables and all four operations
- Verify API endpoint ownership enforcement for mutations
- Establish what test bootstrap is needed and the cheapest viable integration-test approach
- Identify any gap between the test plan's assumptions and what the code actually does

---

## Summary

**The good news:** RLS is correctly configured across all three tables. All four operations (SELECT, INSERT, UPDATE, DELETE) are covered by a single `for all` policy per table scoped to `auth.uid() = user_id`. The test plan's challenge assumption — "INSERT/UPDATE/DELETE policies may be absent" — is not warranted by the current migration; `for all` semantics cover all operations. Tests must still exercise all four operations, but to catch future regressions, not current gaps.

**DELETE endpoints are solidly protected:** Both the RLS layer and the app service layer (`.eq("user_id", userId)`) independently guard against cross-user deletion of expenses and categories.

**One additional finding beyond the risk scope:** POST /api/expenses accepts a `category_id` without verifying the category belongs to the inserting user. An attacker with a valid session who learns another user's category UUID can create their own expenses linked to that category. The expense belongs to the attacker (no data leak from User B), but the data model allows cross-user category references. This is not the IDOR the test plan describes (Risk #3 addresses resource deletion/access, not data-association integrity), but it is worth flagging.

**Test infrastructure is zero.** No Vitest, no test script, no test files. The Supabase local stack IS fully configured. Phase 1 must bootstrap everything.

**Recommended test approach:** Service-level integration tests (not HTTP-level). Service functions accept `(supabaseClient, userId)` — pass two separately authenticated Supabase clients (User A, User B) and call service functions directly. RLS enforces isolation at the DB layer. This is cheaper than HTTP-level tests because it bypasses the Cloudflare/Astro runtime entirely.

---

## Detailed Findings

### Finding 1 — RLS Policy Architecture

**Source:** `supabase/migrations/20260527000000_create_domain_schema.sql` (only migration file)

All three tables have `ENABLE ROW LEVEL SECURITY` and a single `for all` policy:

**categories:**
```sql
alter table categories enable row level security;
create policy "users_own_categories" on categories
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

**expenses:**
```sql
alter table expenses enable row level security;
create policy "users_own_expenses" on expenses
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

**budget_limits:**
```sql
alter table budget_limits enable row level security;
create policy "users_own_budget_limits" on budget_limits
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

**`for all` semantics — what this actually covers:**
- `USING` clause applies to: SELECT, UPDATE (rows visible for modification), DELETE (rows visible for deletion)
- `WITH CHECK` clause applies to: INSERT (new row), UPDATE (row after modification)
- Net effect: all four operations are gated — SELECT and DELETE are filtered by `auth.uid() = user_id` on existing rows; INSERT and UPDATE are rejected if the new row's `user_id ≠ auth.uid()`

**Correction to test plan challenge:** The test plan for Risk #1 says "Challenge: SELECT policy set = fully enforced — INSERT/UPDATE/DELETE policies may be absent for one or more tables." This concern is not supported by the migration. No separate per-operation policies are needed; `for all` covers them all. The integration tests must still exercise all four operations — not to find current gaps, but to catch regressions if a future migration replaces the `for all` policy with incomplete per-operation policies.

**No DROP POLICY or ALTER POLICY statements found** — the policies are stable since the original schema migration.

---

### Finding 2 — API Endpoint Ownership Enforcement (Defense-in-Depth)

**Source files:** `src/pages/api/expenses/index.ts`, `src/pages/api/expenses/[id].ts`, `src/pages/api/categories/index.ts`, `src/pages/api/categories/[id].ts`, `src/pages/api/budget-limits/[category_id].ts`, `src/lib/services/expenses.ts`, `src/lib/services/categories.ts`, `src/lib/services/budget-limits.ts`

The codebase uses a **double-defense** pattern: RLS at the DB layer AND explicit `.eq("user_id", userId)` in service functions. Per `context/archive/2026-06-02-budget-limits/plan.md:49-50`:

> "Security: all budget-limit mutations include `.eq("user_id", userId)` so a user cannot modify another user's limit by guessing a category_id."

The same pattern appears in expense management: `context/changes/expense-management/plan.md:57-58`.

| Endpoint | Method | App-layer guard | RLS guard | IDOR verdict |
|----------|--------|-----------------|-----------|--------------|
| `/api/expenses` | GET | `.eq("user_id", userId)` in service | SELECT policy on expenses | **Secure** |
| `/api/expenses` | POST | Embeds `user_id` in insert | INSERT WITH CHECK | Secure for expense ownership; **category_id ownership gap** (see Finding 3) |
| `/api/expenses/[id]` | POST (update) | `.eq("id", expenseId).eq("user_id", userId)` | UPDATE USING+CHECK | **Secure** — own expense only |
| `/api/expenses/[id]` | DELETE | `.eq("id", expenseId).eq("user_id", userId)` in `deleteExpense()` | DELETE USING | **Secure** — double-gated |
| `/api/categories` | POST (create) | Embeds `user_id` in insert | INSERT WITH CHECK | **Secure** |
| `/api/categories/[id]` | POST (delete) | `.eq("id", categoryId).eq("user_id", userId)` in `deleteCategory()` | DELETE USING | **Secure** — double-gated |
| `/api/budget-limits/[category_id]` | POST (upsert) | `user_id` in upsert payload + unique `(user_id, category_id)` constraint | INSERT/UPDATE WITH CHECK | **Secure** — RLS rejects any cross-user upsert |
| `/api/budget-limits/[category_id]` | POST (delete) | `.eq("user_id", userId).eq("category_id", categoryId)` | DELETE USING | **Secure** |

**Risk #3 verdict for DELETE:** Both app layer and RLS independently prevent User A from deleting User B's expense or category by guessing its UUID. The app-layer filter `.eq("user_id", userId)` means the delete query returns 0 rows (not an error) when the resource doesn't belong to the caller — RLS would also block it at the DB layer if the app filter were absent.

**Implication for test design:** For DELETE IDOR tests, assert that the delete returns 0 rows affected (not a server error), and verify the target resource still exists in the DB afterward.

---

### Finding 3 — Category_id Ownership Gap in POST /api/expenses (Additional Finding, Out of Risk #1/#3 Scope)

**Source:** `src/pages/api/expenses/index.ts:49,64`, `src/lib/services/expenses.ts:5-11`

When creating an expense, `category_id` is taken from form data and passed directly to the insert:
```ts
// expenses/index.ts ~line 49
const categoryId = formData.get("categoryId");
// ...line 64
await addExpense(supabase, user.id, { categoryId, amount, date, description });
```

The `addExpense` service inserts with the caller's `user_id` but does not validate that `category_id` belongs to them. The FK `expenses.category_id → categories(id)` does not enforce user ownership — only referential integrity.

**What this means:** User A can create an expense linked to User B's category UUID, as long as they know it. The resulting expense:
- Has `user_id = User A` (correct — belongs to User A)
- Has `category_id = User B's category UUID`
- Is visible only to User A (RLS on expenses is correct)
- Does NOT expose User B's data to User A

This is NOT a data-leak IDOR in the sense of Risk #3. User A cannot read or modify User B's data. But the data model allows cross-user category references, which is an integrity violation and could cause issues if category aggregations are used.

**This finding is outside Phase 1 scope.** Phase 1 tests RLS isolation (Risk #1) and resource-ownership enforcement on DELETE/POST for the owner's resources (Risk #3). Flagged here for the team to address in a future phase or standalone fix.

---

### Finding 4 — Test Infrastructure State

**Source:** `package.json`, `supabase/config.toml`, `.dev.vars`, filesystem scan

**Current state — zero tests:**
- No Vitest, no Jest, no test runner in devDependencies or scripts
- No `vitest.config.*` or `jest.config.*` files
- 0 test files in `src/` (`.test.ts`, `.test.tsx`, `.spec.ts`)
- No test script in `package.json`

**Supabase local stack — fully ready:**
- `supabase/config.toml` configured: PostgreSQL 17, API on port 54321, auth with signup enabled, email confirmation disabled
- 1 migration: `20260527000000_create_domain_schema.sql`
- `supabase/seed.sql` referenced (check if it exists before test setup)
- `.dev.vars` contains working local credentials: `SUPABASE_URL=http://127.0.0.1:54321` and the anon key
- `supabase` CLI in devDependencies at `^2.23.4` — `npx supabase start` is the correct command (Docker required)

**Production dependencies usable in tests:**
- `@supabase/supabase-js: ^2.99.1` — available for creating test clients
- `@supabase/ssr: ^0.10.3` — not needed for service-level tests

**What Phase 1 bootstrap needs:**
1. `npm install --save-dev vitest` (possibly `@vitest/coverage-v8` for future coverage runs)
2. `vitest.config.ts` with `environment: 'node'` (service-level tests do not need browser or Cloudflare runtime)
3. A test environment setup file: creates two test users via Supabase admin API, exposes their authenticated clients, cleans up after
4. Add `"test": "vitest run"` to `package.json` scripts
5. Decide on a test file location convention (e.g., `src/tests/`, `src/lib/services/*.test.ts`)

---

### Finding 5 — Auth Pattern and Integration Test Strategy

**Source:** `src/lib/supabase.ts`, `src/middleware.ts`, `src/env.d.ts`, API route files

**Per-request client creation:**
`createClient(requestHeaders, cookies)` is a plain function — not a singleton. Called fresh for each request. Uses `@supabase/ssr`'s `createServerClient` with cookie-based session storage.

**Middleware uses `getUser()`, not `getSession()`** (`src/middleware.ts:12`):
```ts
const { data: { user } } = await supabase.auth.getUser();
context.locals.user = user ?? null;
```
`getUser()` re-validates the JWT with the Supabase auth server on every call. This is the secure approach.

**API routes do NOT use `context.locals.user`:** They each call `createClient` + `getUser()` independently. The middleware sets `context.locals.user` but API handlers ignore it. This means API-level auth is independent of the middleware guard.

**Service functions accept (client, userId)** — this is the key for integration testing. Example from `src/lib/services/expenses.ts`:
```ts
export async function deleteExpense(supabase, userId, expenseId) {
  return supabase.from("expenses").delete().eq("id", expenseId).eq("user_id", userId);
}
```

**Integration test strategy — service-level (recommended):**
```
1. npx supabase start
2. Create User A via supabase.auth.admin.createUser({ email, password })
3. Create User B via supabase.auth.admin.createUser({ email, password })
4. Authenticate User A: supabase.auth.signInWithPassword({ email, password }) → access_token
5. Create authenticated client for User A: createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${access_token}` } } })
6. Create resource as User A (expense, category, budget_limit)
7. Authenticate User B the same way → clientB
8. Attempt SELECT/INSERT/UPDATE/DELETE as User B using User A's resource IDs
9. Assert: SELECT returns empty array; INSERT/UPDATE/DELETE returns error or 0 rows affected
10. Verify: resource still exists in DB (read as User A to confirm)
11. Teardown: delete test users and their data
```

This approach bypasses the Astro/Cloudflare layer entirely — pure Supabase client + RLS. No HTTP request crafting needed. The service functions can be called directly, or the Supabase client can be used directly for lower-level RLS probing.

**Why service-level is cheaper than HTTP-level for RLS testing:**
- No need for Cloudflare Worker runtime (`workerd`) in tests
- No request cookie crafting for `@supabase/ssr`
- Direct DB-level verification of RLS policies
- Service functions already accept the client as a parameter — they were designed to be injectable

**PROTECTED_ROUTES** (`src/middleware.ts:4`): `/dashboard`, `/categories`, `/expenses`. API routes at `/api/*` are NOT protected by middleware — they guard themselves. This is correct and relevant to test scope: RLS tests target the DB layer, not the HTTP middleware.

---

### Finding 6 — Supabase Admin Client for Test Setup

The local Supabase stack exposes a service role key (printed by `npx supabase start`; also in `supabase/config.toml` as `service_role_key` or available via `npx supabase status`). The service role key bypasses RLS and allows admin operations:

```ts
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});
// Create test users:
await adminClient.auth.admin.createUser({ email: 'userA@test.com', password: 'testpass', email_confirm: true });
// Clean up:
await adminClient.auth.admin.deleteUser(userId);
```

The service role key must be kept out of the anon-key config and used only in test setup/teardown.

---

## Code References

- `supabase/migrations/20260527000000_create_domain_schema.sql` — Only migration. Contains all CREATE TABLE, ENABLE RLS, and CREATE POLICY statements for expenses, categories, budget_limits.
- `src/lib/supabase.ts` — Per-request `createClient()` factory using `@supabase/ssr`; returns null if env vars absent.
- `src/middleware.ts` — Middleware; uses `getUser()` (not `getSession()`); sets `context.locals.user`; guards `/dashboard`, `/categories`, `/expenses`.
- `src/middleware.ts:4` — `PROTECTED_ROUTES` definition.
- `src/env.d.ts:3` — `context.locals.user: User | null` type declaration.
- `src/lib/services/expenses.ts` — `addExpense`, `updateExpense`, `deleteExpense`, `getMonthExpenses` — all accept `(supabase, userId, ...)`.
- `src/lib/services/categories.ts` — `createCategory`, `deleteCategory`, `getUserCategories` — all accept `(supabase, userId, ...)`.
- `src/lib/services/budget-limits.ts` — `upsertBudgetLimit`, `deleteBudgetLimit` — all accept `(supabase, userId, ...)`.
- `src/pages/api/expenses/index.ts:49,64` — category_id ownership gap (Finding 3).
- `src/pages/api/expenses/[id].ts` — DELETE uses double-guard (app + RLS).
- `src/pages/api/categories/[id].ts` — DELETE uses double-guard (app + RLS).
- `src/pages/api/budget-limits/[category_id].ts` — upsert/delete protected by RLS + explicit user_id in payload.
- `package.json` — No test script, no Vitest.
- `supabase/config.toml` — Full local stack config; PostgreSQL 17, API port 54321.
- `.dev.vars` — Local Supabase URL and anon key (for test environment).

---

## Architecture Insights

**Double-defense is intentional and explicit.** The domain-schema plan and budget-limits archive both document the pattern: RLS at the DB layer + `.eq("user_id", userId)` at the service layer. Neither is considered sufficient alone. Tests for Risk #1 (RLS) should test the DB layer directly; tests for Risk #3 (IDOR) should test via service functions to exercise both layers.

**`for all` vs per-operation policies.** PostgreSQL's `for all` is a single policy covering all DML operations. A `for all` policy with both USING and WITH CHECK is equivalent to four per-operation policies using the same conditions. The current design is correct and idiomatic — no gaps exist in the current migration. However, future migrations that add `for select`/`for insert` policies without removing `for all` could create conflicts or unexpected behavior; tests that exercise all operations catch this.

**Service functions as the test seam.** The service layer is cleanly separated from the HTTP layer and accepts the Supabase client as a parameter. This design — likely unintentional as a test affordance — is the perfect integration test seam. No mocking, no HTTP stubs, no Cloudflare runtime.

**Supabase anon key is the test client key.** In local testing, authenticated clients are created by passing a Bearer token in the Authorization header to a client initialized with the anon key. RLS is enforced based on the JWT in that token (which identifies the user). The service role key is used only in test setup (creating/deleting users).

---

## Historical Context

- `context/changes/domain-schema/plan.md:150-218` — Established the single `for all` policy pattern per table. Design decision: one policy covers all four operations. No per-operation policies were ever planned.
- `context/archive/2026-06-02-budget-limits/plan.md:49-50` — "Security: all budget-limit mutations include `.eq("user_id", userId)` so a user cannot modify another user's limit by guessing a category_id." Confirms double-defense is intentional.
- `context/changes/expense-management/plan.md:57-58` — Same double-defense documented for expense mutations.
- `context/changes/expense-management/reviews/plan-review.md` — Auth failure response styles: form endpoints redirect on auth failure; fetch-based endpoints return 401. Intentional difference.

---

## Corrections to Test Plan §2

**Risk #1 — "Must challenge" cell update (post-research backport):**
Current: "SELECT policy set = fully enforced — INSERT/UPDATE/DELETE policies may be absent for one or more tables"  
Corrected: "The `for all` policy covers all four operations, but runtime behavior must still be verified — a future migration adding per-operation policies without removing `for all` could create conflicts. Challenge: each of the four operations is actually enforced at the DB layer, not merely declared."

This is a framing correction, not a risk removal. The tests must still exercise all four operations.

---

## Open Questions

1. **Does `supabase/seed.sql` exist and affect test data?** Need to check if it creates rows that could interfere with isolation tests. If it creates data with hardcoded UUIDs, test setup must account for it.

2. **Category_id ownership gap (Finding 3):** Should this be addressed as part of Phase 1 (a quick server-side check) or deferred to Phase 2? It's an integrity issue, not a data-leak — but the test plan's Risk #3 ("POST with another user's resource ID") could be interpreted to include this. Recommend confirming the scope before Phase 1 plan is written.

3. **Vitest environment compatibility with Astro/Cloudflare:** Service-level tests run in `node` environment (no browser, no Cloudflare runtime needed). But if any test helper imports from Astro path aliases (`@/*`) or uses `astro:env`, the vitest config will need to resolve those. The `@/*` alias (`src/*`) needs to be mirrored in `vitest.config.ts`; `astro:env` imports (like `SUPABASE_URL`) need to be replaced with `process.env` or `dotenv` in the test environment.

4. **Service role key availability:** `npx supabase status` provides the service role key for the running local stack. The test setup file needs to read this key — probably from a `.env.test.local` or hardcoded from the local config. Confirm the local stack's service role key location before writing the setup util.
