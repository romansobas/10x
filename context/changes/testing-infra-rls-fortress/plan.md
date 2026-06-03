# Test Infra Bootstrap and RLS Fortress Implementation Plan

## Overview

Bootstrap Vitest from zero and write integration tests that prove all three tables
(categories, expenses, budget_limits) enforce per-user data isolation for every RLS
operation (SELECT, INSERT, UPDATE, DELETE), and that the service layer's ownership
guards prevent cross-user mutations (Risk #3).

Tests run against the real local Supabase DB. No mocking. RLS enforcement cannot be
tested any other way.

## Current State Analysis

- No test runner, no test script, no test files — the project has zero test infrastructure.
- Supabase local stack is configured and running: PostgreSQL 17, API on port 54321.
- Single migration: `supabase/migrations/20260527000000_create_domain_schema.sql`.
- All three tables have RLS enabled with a single `for all` policy each:
  `auth.uid() = user_id` (USING and WITH CHECK) — covers all four operations.
- `user_id` FK on all three tables references `auth.users(id) ON DELETE CASCADE` —
  deleting a test user cascades and cleans up all their rows.
- Service functions accept `(supabaseClient, userId)` — the natural integration test seam.
  Service files import only `type { Database } from "@/database.types"` — no `astro:env`
  imports, so Vitest's node environment works without mocking Astro internals.
- `@/*` path alias maps to `./src/*` (tsconfig). Vitest config must mirror this.
- `supabase/seed.sql` is intentionally empty — no seed interference.

## Desired End State

Running `npm test` exercises 3 test files (one per table) in `src/tests/integration/`.
Every test proves an isolation invariant: either User B's query returns empty/0-rows,
or returns an explicit RLS error. After each failed cross-user write, a read as User A
confirms the resource was not modified. The test-plan.md §6.1 cookbook documents how
to add a new RLS integration test.

### Key Discoveries

- `categories.user_id` and `expenses.user_id` both have `ON DELETE CASCADE` to
  `auth.users(id)` — teardown via `adminClient.auth.admin.deleteUser()` cascades
  all rows without manual cleanup ordering needed.
- `expenses.category_id → categories(id) ON DELETE RESTRICT` — if expenses still
  exist when we try to delete a category, it fails. `user_id` CASCADE handles this
  correctly: PostgreSQL deletes expenses (via user_id cascade) before deleting
  categories (via user_id cascade) in one statement.
- RLS blocks: SELECT and DELETE via USING clause (returns empty/0 rows, no error);
  INSERT via WITH CHECK clause (returns `error.code = '42501'`); UPDATE via both
  (0 rows, no error if target rows are filtered, error if WITH CHECK fails on new value).
- The service layer adds its own `.eq("user_id", userId)` filter on top of RLS.
  Phase 2 tests RLS in isolation (direct client, no app-layer filter); Phase 2 also
  tests the double-defense via service function calls.

## What We're NOT Doing

- No HTTP-level tests — service-level tests are sufficient for RLS and IDOR coverage.
- No mocking of the Supabase client — integration tests require the real DB.
- No CI wiring — that is Phase 4 of the rollout (`testing-quality-gates`).
- No fix for the `category_id` ownership gap in POST /api/expenses — deferred.
- No coverage reporting setup — plain `vitest run` only.
- No tests for the auth middleware itself (Risk #7) — that is Phase 2 of the rollout.

## Implementation Approach

Plain Vitest in `node` environment, separate from the Astro/Cloudflare build. Test
files import service functions directly. Two authenticated Supabase clients are created
per test file via `signInWithPassword` after admin-creating two test users. After each
file, `auth.admin.deleteUser` cascades all rows.

RLS tests use the raw Supabase client (not service functions) to test the DB policy
in isolation. IDOR tests use service functions to test the double-defense (app-layer
filter + RLS backstop).

## Critical Implementation Details

**Authenticated client construction for tests.** The app uses `@supabase/ssr`'s
`createServerClient` with cookies. In Node/Vitest, use the plain `@supabase/supabase-js`
`createClient` with a `Bearer` token in the global Authorization header — this is how
Supabase's RLS resolves `auth.uid()` in non-browser, non-cookie environments:

```ts
import { createClient } from '@supabase/supabase-js'
const anonClient = createClient(url, anonKey)
const { data: { session } } = await anonClient.auth.signInWithPassword({ email, password })
const authenticatedClient = createClient(url, anonKey, {
  global: { headers: { Authorization: `Bearer ${session!.access_token}` } },
  auth: { autoRefreshToken: false, persistSession: false },
})
```

**RLS assertion shapes.** The four operations behave differently when RLS blocks them:
- SELECT (USING blocked): `{ data: [], error: null }` — empty array, no error.
- INSERT (WITH CHECK blocked): `{ data: null, error: { code: '42501' } }` — explicit error.
- UPDATE (USING blocks target rows): `{ data: null, count: 0, error: null }` — 0 rows, no error.
- DELETE (USING blocks target rows): `{ data: null, count: 0, error: null }` — 0 rows, no error.

Tests must assert the right shape for each operation. For UPDATE and DELETE, always follow
with a read as User A to confirm the resource was not modified.

**Service role key.** The admin client requires the service role key, obtained from
`npx supabase status` → "Secret" (format: `sb_secret_*`). Never commit this key — it
bypasses RLS entirely. Store in `.env.test` (gitignored).

---

## Phase 1: Vitest Bootstrap and Supabase Test Helpers

### Overview

Install Vitest, create the config with `@/` alias and node environment, write the
shared test helper that manages test user lifecycle, create the env template, and
verify the setup with a smoke test that creates and deletes a test user.

### Changes Required

#### 1. Install Vitest

**File**: `package.json`

**Intent**: Add Vitest as a devDependency and add a `test` script.

**Contract**: Add to `devDependencies`: `"vitest": "^3.0.0"`. Add to `scripts`:
`"test": "vitest run"`. No other test runner changes. `vitest run` exits after one
pass (non-watch mode, suitable for CI).

#### 2. Create Vitest config

**File**: `vitest.config.ts` (project root, sibling of `astro.config.mjs`)

**Intent**: Configure Vitest to run in Node (not browser), resolve `@/` imports to
`src/`, include only integration test files, and load test env vars.

**Contract**: Environment `node`, include pattern `src/tests/integration/**/*.test.ts`,
testTimeout 30 000 ms, resolve alias `@` → `<root>/src`. Load `.env.test` via a
`setupFiles` entry that calls `dotenv.config({ path: '.env.test' })` (requires
`dotenv` devDependency — already present as transitive dep; add explicitly if absent).

The alias block must match tsconfig exactly:
```ts
resolve: {
  alias: { '@': path.resolve(__dirname, './src') },
},
```

#### 3. Create `.env.test.example` (committed) and `.env.test` (gitignored)

**Files**: `.env.test.example` at project root (committed); `.env.test` (gitignored)

**Intent**: Document what env vars are needed for integration tests and prevent the
actual secrets from being committed.

**Contract**:

`.env.test.example`:
```
# Copy to .env.test and fill in from `npx supabase status`
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=       # "Publishable" key from supabase status
SUPABASE_SERVICE_ROLE_KEY=  # "Secret" key from supabase status
```

`.gitignore`: append `.env.test` on its own line (check that `.env.test.example` is NOT
ignored — only the actual secrets file is).

#### 4. Create test helpers

**File**: `src/tests/integration/helpers.ts`

**Intent**: Provide `createTestUser` and `deleteTestUser` so each test file can
create two isolated users in `beforeAll` and delete them in `afterAll` without
duplicating the admin-client logic.

**Contract**:
- `createTestUser(suffix: string)` — creates an auth user via the admin client
  (`email_confirm: true`, deterministic email like `rls-${suffix}@test.local`),
  signs in via `signInWithPassword` to get a session, constructs and returns
  `{ userId: string, client: SupabaseClient<Database> }`. The returned client has
  the user's JWT in the Authorization header (see Critical Implementation Details).
- `deleteTestUser(userId: string)` — calls `adminClient.auth.admin.deleteUser(userId)`.
  PostgreSQL's `ON DELETE CASCADE` on `user_id → auth.users(id)` removes all rows.
- The admin client is a module-level singleton: `createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false } })`.
- Both functions are `async`. All three env vars (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`) are read from `process.env`; throw a clear error if any
  is absent.

#### 5. Create smoke test

**File**: `src/tests/integration/smoke.test.ts`

**Intent**: Verify that the test infrastructure wires up correctly before writing real
RLS tests — the helpers connect, a test user can be created and deleted without error.

**Contract**: One `it` block that calls `createTestUser('smoke')`, asserts `userId` is
a non-empty string, asserts `client` is not null, then calls `deleteTestUser(userId)`.
No assertions about application data — this only verifies the test infra itself.

### Success Criteria

#### Automated Verification

- `npm install` completes without errors; `vitest` appears in `package.json` devDependencies.
- `npm test` runs and the smoke test passes (green output, no `failed` lines).
- TypeScript: `npx tsc --noEmit` passes on `vitest.config.ts` and `src/tests/integration/helpers.ts`.

#### Manual Verification

- Confirm `npx supabase start` is running before `npm test` — add a note in `.env.test.example` about the prerequisite.
- Confirm `.env.test` does NOT appear in `git status` after being created (gitignore working).
- Confirm the smoke test creates then cleans up the test user — check Supabase Studio (`http://127.0.0.1:54323`) under Authentication → Users that no `rls-smoke@test.local` user remains after the run.

---

## Phase 2: RLS Isolation and IDOR Tests

### Overview

Three test files, one per table. Each follows the same structure: `beforeAll` creates
User A and User B plus initial data (User A's resource), tests prove cross-user
isolation for all four RLS operations, IDOR service-function tests prove the
double-defense on DELETE, `afterAll` deletes both users (cascade cleans rows).

### Changes Required

#### 1. Categories RLS test

**File**: `src/tests/integration/rls-categories.test.ts`

**Intent**: Prove that User B cannot SELECT, INSERT (claiming User A's user_id),
UPDATE, or DELETE User A's categories via direct Supabase client calls (pure RLS,
no app-layer filter). Also prove `deleteCategory` service function rejects cross-user
DELETE (double-defense, Risk #3).

**Contract**:

`beforeAll`: create userA, userB via helpers; call
`userA.client.from('categories').insert({ name: 'User A Cat', user_id: userA.userId })`
and store the returned `id` as `catAId`. Assert no insert error.

Tests (each `it` is independent; data set up once in `beforeAll`):

| Test | Operation | Call | Assert |
|------|-----------|------|--------|
| SELECT isolation | SELECT | `userB.client.from('categories').select()` | `data` does not contain `catAId` |
| INSERT denial | INSERT WITH CHECK | `userB.client.from('categories').insert({ name: 'X', user_id: userA.userId })` | `error.code === '42501'` |
| UPDATE denial | UPDATE USING | `userB.client.from('categories').update({ name: 'hacked' }).eq('id', catAId)` | `count === 0`; re-read as userA: `name` unchanged |
| DELETE denial (direct) | DELETE USING | `userB.client.from('categories').delete().eq('id', catAId)` | `count === 0`; re-read as userA: row still exists |
| DELETE IDOR (service) | service fn | `deleteCategory(userB.client, userB.userId, catAId)` | `count === 0`; row still exists |

`afterAll`: `deleteTestUser(userA.userId)`, `deleteTestUser(userB.userId)`.

For re-read verification: `userA.client.from('categories').select().eq('id', catAId).single()` → assert `data` is not null.

#### 2. Expenses RLS test

**File**: `src/tests/integration/rls-expenses.test.ts`

**Intent**: Same isolation proof for the expenses table. Expenses require a
category FK — create a category for User A in `beforeAll` before creating the expense.

**Contract**:

`beforeAll`: create userA, userB; create `catA` (category) and `expA` (expense with
`category_id = catA.id`, `amount = 50`, `expense_date = '2026-06-01'`) as User A.
Store `expAId`.

Tests follow the same table as categories:

| Test | Operation | Call | Assert |
|------|-----------|------|--------|
| SELECT isolation | SELECT | `userB.client.from('expenses').select()` | `data` does not contain `expAId` |
| INSERT denial | INSERT WITH CHECK | `userB.client.from('expenses').insert({ user_id: userA.userId, category_id: catA.id, amount: 1, expense_date: '2026-06-01' })` | `error.code === '42501'` |
| UPDATE denial | UPDATE USING | `userB.client.from('expenses').update({ amount: 999 }).eq('id', expAId)` | `count === 0`; re-read: `amount` unchanged |
| DELETE denial (direct) | DELETE USING | `userB.client.from('expenses').delete().eq('id', expAId)` | `count === 0`; row still exists |
| DELETE IDOR (service) | service fn | `deleteExpense(userB.client, userB.userId, expAId)` | `count === 0`; row still exists |

`afterAll`: delete both users (cascade handles expense + category rows).

#### 3. Budget limits RLS test

**File**: `src/tests/integration/rls-budget-limits.test.ts`

**Intent**: Same isolation proof for budget_limits. Requires a category FK (same
as expenses). Budget limits use `upsert` rather than `insert` — the INSERT WITH CHECK
test uses the raw client to try inserting a row claiming User A's user_id.

**Contract**:

`beforeAll`: create userA, userB; create `catA` (category) and `limitA`
(budget_limit with `category_id = catA.id`, `monthly_limit = 100`) as User A.
Store `limitAId`.

Tests:

| Test | Operation | Call | Assert |
|------|-----------|------|--------|
| SELECT isolation | SELECT | `userB.client.from('budget_limits').select()` | `data` does not contain `limitAId` |
| INSERT denial | INSERT WITH CHECK | `userB.client.from('budget_limits').insert({ user_id: userA.userId, category_id: catA.id, monthly_limit: 50 })` | `error.code === '42501'` |
| UPDATE denial | UPDATE USING | `userB.client.from('budget_limits').update({ monthly_limit: 999 }).eq('id', limitAId)` | `count === 0`; re-read: `monthly_limit` unchanged |
| DELETE denial (direct) | DELETE USING | `userB.client.from('budget_limits').delete().eq('id', limitAId)` | `count === 0`; row still exists |
| UPSERT IDOR (service) | service fn | `upsertBudgetLimit(userB.client, userB.userId, catA.id, 999)` | `error.code === '42501'` (WITH CHECK on user_id mismatch) |
| DELETE IDOR (service) | service fn | `deleteBudgetLimit(userB.client, userB.userId, catA.id)` | `count === 0`; row still exists |

`afterAll`: delete both users.

Note on upsert IDOR: `upsertBudgetLimit` passes `user_id: userB.userId` in the payload
but `category_id: catA.id` (User A's category). The upsert tries to insert a new row
with `user_id = userB.userId`, which should succeed for RLS but the unique constraint
on `(user_id, category_id)` means there's no conflict on User A's row. This is less
of an IDOR and more a data-integrity issue. The meaningful IDOR test here is:
- The direct UPDATE test (can User B overwrite User A's existing limit?)
- The direct DELETE test (can User B delete User A's limit?)
Both are covered by the table above.

### Success Criteria

#### Automated Verification

- `npm test` runs all three test files and all tests pass (green).
- Each test file independently passes when run with `npx vitest run src/tests/integration/rls-categories.test.ts` (no cross-file dependency).
- No TypeScript errors: service function imports resolve correctly via `@/` alias.

#### Manual Verification

- Open Supabase Studio → Table Editor after a test run; no orphaned `rls-*@test.local` users remain in auth.users.
- Read the test output: every test description clearly communicates the invariant it protects (e.g., "User B cannot DELETE User A's expense").
- Confirm test names would catch a policy regression: if you temporarily disable RLS on the expenses table (`ALTER TABLE expenses DISABLE ROW LEVEL SECURITY`), the SELECT isolation and DELETE denial tests must fail.

---

## Phase 3: Cookbook Update

### Overview

Update `context/foundation/test-plan.md` §6.1 with the actual integration test
pattern that shipped in Phase 2, and append a Phase 1 note to §6.6. This closes out
rollout Phase 1 and leaves future contributors with a concrete reference.

### Changes Required

#### 1. Update §6.1 — Adding an integration test (RLS / data isolation)

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the `§6.1 TBD` placeholder with the canonical pattern for
writing a new RLS isolation test, grounded in what actually shipped.

**Contract**: Replace the `TBD — see §3 Phase 1` line with a concrete description
of the pattern:
- Location: `src/tests/integration/rls-<table>.test.ts`
- Lifecycle: `beforeAll` creates two users + User A's resource; `afterAll` deletes both users
- Four tests per table: SELECT isolation, INSERT WITH CHECK denial, UPDATE USING denial, DELETE USING denial + resource-intact verification
- IDOR test: call the service function's DELETE with User B's client; assert 0 rows + resource intact
- Reference: `src/tests/integration/rls-categories.test.ts` as the canonical example

#### 2. Append to §6.6 — Per-rollout-phase notes

**File**: `context/foundation/test-plan.md`

**Intent**: Record what Phase 1 shipped so future contributors understand the
state of the cookbook.

**Contract**: Append under `§6.6`:
```
### Phase 1: Test infra bootstrap + RLS fortress (2026-06-03)
Vitest bootstrapped; `src/tests/integration/helpers.ts` provides `createTestUser`/
`deleteTestUser`. Three RLS isolation test files cover categories, expenses, and
budget_limits for SELECT/INSERT/UPDATE/DELETE cross-user denial. Service-function IDOR
tests cover DELETE (and upsert) double-defense. Cookbook pattern: §6.1.
```

### Success Criteria

#### Automated Verification

- `context/foundation/test-plan.md` §6.1 no longer contains `TBD`.
- §6.6 contains a Phase 1 entry dated 2026-06-03.

#### Manual Verification

- Read §6.1: a new developer who hasn't seen this codebase before can follow the pattern to add an RLS test for a new table without reading any other file.

---

## Testing Strategy

### Integration Tests

- Three test files, one per table, each independent (no shared state between files).
- `beforeAll`/`afterAll` lifecycle per file: two test users created and destroyed.
- Direct Supabase client calls for pure RLS verification.
- Service function calls for double-defense IDOR verification.
- Always verify resource-intact after a failed cross-user write.

### Manual Testing Steps

1. Start local Supabase: `npx supabase start`
2. Copy `.env.test.example` to `.env.test`; fill in keys from `npx supabase status`.
3. Run `npm test` — all tests should pass.
4. Inspect Supabase Studio: no orphaned `rls-*@test.local` users.
5. Sanity regression: temporarily disable RLS on `categories` table in Studio → re-run → SELECT isolation test must fail. Re-enable RLS.

## Performance Considerations

Integration tests hit a real local DB. Each test file runs two `signInWithPassword`
calls (in `beforeAll`) and two admin `deleteUser` calls (in `afterAll`). Expect 2–5s
per test file; total suite runtime < 30s. `testTimeout: 30_000` covers slow Docker
startup conditions.

## References

- Research: `context/changes/testing-infra-rls-fortress/research.md`
- Migration (RLS policies): `supabase/migrations/20260527000000_create_domain_schema.sql`
- Service functions: `src/lib/services/expenses.ts`, `src/lib/services/categories.ts`, `src/lib/services/budget-limits.ts`
- Test plan Phase 1: `context/foundation/test-plan.md` §3 row 1

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Vitest Bootstrap and Supabase Test Helpers

#### Automated

- [x] 1.1 `npm install` completes without errors; vitest in package.json devDependencies
- [x] 1.2 `npm test` runs and smoke test passes

#### Manual

- [x] 1.3 `.env.test` is gitignored; Supabase Studio shows no orphaned smoke user after run

### Phase 2: RLS Isolation and IDOR Tests

#### Automated

- [ ] 2.1 `npm test` passes all three RLS test files
- [ ] 2.2 Each test file passes in isolation (run individually with `npx vitest run <file>`)
- [ ] 2.3 No TypeScript errors on new test files

#### Manual

- [ ] 2.4 Test names clearly describe the invariant they protect
- [ ] 2.5 Disabling RLS on a table causes its SELECT isolation test to fail (regression sanity check)

### Phase 3: Cookbook Update

#### Automated

- [ ] 3.1 test-plan.md §6.1 no longer contains `TBD`
- [ ] 3.2 test-plan.md §6.6 contains Phase 1 note dated 2026-06-03

#### Manual

- [ ] 3.3 §6.1 is followable by a new contributor without reading other files
