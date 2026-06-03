# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-02 (Phase 1 change opened)

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "<the
   team is worried about X, and the failure would surface somewhere in
   <area>>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/` (excluding node_modules, dist, build output); 17 commits in last 30 days.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|-------------------------|--------|------------|-------------------------------|
| 1 | Cross-user data leak — authenticated user reads or writes another user's expenses, categories, or budget limits by guessing resource IDs | High | High | PRD critical guardrail "cross-account leak is a critical regression"; interview Q3; tech-stack.md: Supabase RLS as the sole enforcement mechanism |
| 2 | Silent expense write failure — add/edit/delete appears to succeed (no error shown) but the expense is never persisted | High | High | PRD critical guardrail "no silent data loss"; interview Q1 |
| 3 | IDOR on mutations — POST/DELETE with another user's resource ID is not rejected at the server layer | High | Medium | Abuse lens (product has auth + accepts user input); PRD FR-003/008/010/011 (expense CRUD) |
| 4 | Category delete orphans or hard-blocks expenses without surfacing a user-visible error | High | Medium | PRD FR-006 "delete blocked if category has expenses"; roadmap risk note "delete-category constraint must not orphan expenses" |
| 5 | Server-side validation bypass — negative/zero/non-numeric amounts or out-of-range inputs stored because only the client validates | Medium | Medium | Abuse lens (user-controlled numeric inputs at API endpoints); PRD FR-003 expense amount, FR-017 budget limit |
| 6 | Budget limit overrun calculation wrong — incorrect category mapping or null/undefined handling produces a wrong "X over" or "X remaining" display | Medium | Medium | Archived slice context/archive/2026-06-02-budget-limits/plan.md (S-04 implemented but untested); hot-spot dir `src/lib/services/` — 4 commits/30d |
| 7 | Auth middleware regression — protected routes return the wrong user_id or reject valid sessions after middleware edits | High | Medium | Hot-spot `src/` root — 4 commits/30d; PRD critical guardrail "data privacy" (correct user_id attachment is a prerequisite) |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | User A authenticated cannot SELECT, INSERT, UPDATE, or DELETE User B's rows — even using User B's exact resource IDs | "SELECT policy set = fully enforced" — INSERT/UPDATE/DELETE policies may be absent for one or more tables | Exact RLS policies for all three tables; whether policies cover all four operations; anon vs authenticated role distinction | Integration (real Supabase DB — RLS is enforced at DB level and cannot be reproduced by a mock) | Happy-path-only: proving a user sees their own data without testing cross-user attempts |
| #2 | Failed write produces a visible error signal; expense count does not increase after the failed write | "No crash = success" — the handler may silently return without writing | How the API handler checks Supabase write errors; whether an RLS write-block surfaces as an error vs a silent 0-row result | Hermetic (stub Supabase write error, test error-path handling) + Integration (RLS write block via real DB) | Testing only the success path; deriving expected error message from the implementation rather than the PRD guardrail |
| #3 | DELETE on another user's resource ID → 403 or 404; POST with another user's category_id → 4xx | "Authenticated = authorized" — being logged in does not mean owning the resource | Whether each API endpoint filters mutations by user_id explicitly, or relies solely on RLS | Integration (real auth session + real DB for ownership checks) | Testing only that the owner's own requests succeed |
| #4 | Delete category with existing expenses → 4xx + user-visible message; expenses remain intact; delete empty category → success | "Non-200 response = user got feedback" — constraint error must reach the UI, not be swallowed as a 500 | Whether the delete constraint is at DB level (FK ON DELETE RESTRICT) or app level; whether Supabase surfaces a FK violation as an error | Integration (real DB with live expense data to trigger the constraint) | Only testing empty-category delete (happy path only) |
| #5 | POST with amount=-1, amount=0, amount="abc", or another user's category_id → 4xx; no row written to DB | "Client validates = server safe" — any API call bypasses client validation | Which fields each endpoint validates; whether DB has CHECK constraints (e.g., monthly_limit > 0); where validation lives | Hermetic or integration (direct API call bypassing the UI form) | Testing only via the UI form; asserting response code without verifying DB state |
| #6 | limit=100 total=120 → "+20.00 over"; limit=100 total=80 → "20.00 remaining"; no-limit category shows no overrun UI | "Displayed value matches DB value" — the expense+limit merge may map wrong categories or mishandle undefined | Exact merge step in `getMonthBreakdown`; how undefined limit is handled; the precise arithmetic for remaining/overrun | Hermetic (pure function test — no real DB needed for arithmetic correctness) | Expected value computed with the same arithmetic as the implementation (oracle problem — mirror test) |
| #7 | Unauthenticated request to protected route → 401 or redirect; valid session → 200 with correct user_id attached | "Build passes = middleware works" — type errors will not catch a logic regression in session resolution | How `getUser()` result is mapped to `context.locals.user`; which paths are in PROTECTED_ROUTES; cookie parsing flow | Integration (real Supabase auth session) + hermetic for middleware logic isolation | Only testing the authenticated path; not testing unauthenticated rejection |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|---------------|------------|--------|---------------|
| 1 | Test infra bootstrap + RLS fortress | Stand up Vitest + Supabase test client; prove all three tables enforce per-user isolation for SELECT and all mutations | #1, #3 | integration (real Supabase DB) | change opened | context/changes/testing-infra-rls-fortress |
| 2 | Expense CRUD correctness + error surfacing | Prove expense writes either succeed or fail visibly; prove server-side validation rejects bad inputs | #2, #5, #7 | integration (real DB) + hermetic (stub write error) | not started | — |
| 3 | Data integrity + budget calculations | Prove category-delete constraint surfaces to user; prove overrun arithmetic is correct | #4, #6 | integration (real DB with live data) + hermetic (pure function) | not started | — |
| 4 | Quality gates wiring | Wire test run into GitHub Actions CI; all tests must pass before merge | cross-cutting | CI configuration | not started | — |

## 4. Stack

The classic test base for this project. Recommendations are grounded in
local manifests/configs plus the MCP/tools actually exposed in the current
session.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit + integration | none yet — see §3 Phase 1 | — | Vitest recommended: TypeScript-native, ESM-compatible, works with Astro's Vite base |
| Supabase test client | none yet — see §3 Phase 1 | — | Local Supabase via `npx supabase start` (Docker required); necessary for RLS integration tests |
| hermetic mocking | none yet — see §3 Phase 1 | — | Vitest built-in mock functions sufficient; no external mock library expected |
| e2e | out of scope for this rollout | — | Not in current plan; revisit on `--refresh` if auth flows become unstable |
| accessibility | out of scope for this rollout | — | Mobile-first usability validated manually during development |

**Stack grounding tools (current session):**
- Docs: none — no Context7 / framework-docs MCP available in this session; checked: 2026-06-02
- Search: none — no Exa.ai / web-search MCP available in this session; checked: 2026-06-02
- Runtime/browser: none — no Playwright MCP available in this session; checked: 2026-06-02
- Provider/platform: Linear + IDE diagnostics present but not relevant to test-runner grounding; checked: 2026-06-02

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase N" means the gate is enforced once that rollout
phase lands; before that, the gate is planned.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck | local + CI (GitHub Actions) | required — CI already runs this | syntactic / type drift |
| unit + integration | local + CI | required after §3 Phase 1 | RLS regressions, service-layer logic regressions |
| hermetic failure-path tests | local + CI | required after §3 Phase 2 | silent data-loss regressions, swallowed Supabase errors |
| test run in CI on every PR | GitHub Actions | required after §3 Phase 4 | all of the above on every PR before merge |
| pre-prod smoke | manual (between merge and deploy) | optional | environment-specific failures not caught by integration tests |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding an integration test (RLS / data isolation)

**Canonical example:** `src/tests/integration/rls-categories.test.ts`

**Location:** `src/tests/integration/rls-<table>.test.ts` — one file per table.

**Lifecycle:** `beforeAll` creates two test users (User A and User B) via `createTestUser`
from `src/tests/integration/helpers.ts`, then creates User A's test resource. `afterAll`
calls `deleteTestUser` for both — PostgreSQL's `ON DELETE CASCADE` on `user_id →
auth.users(id)` cleans up all rows automatically.

**Five tests per file:**

| Test | How to write it | What it proves |
|------|-----------------|----------------|
| SELECT isolation | `userB.client.from('<table>').select('id')` → assert result does not contain User A's row id | RLS USING clause blocks cross-user reads |
| INSERT denial | `userB.client.from('<table>').insert({ user_id: userA.userId, ... })` → assert `error.code === '42501'` | RLS WITH CHECK blocks claiming another user's user_id |
| UPDATE denial | `userB.client.from('<table>').update({...}).eq('id', resourceAId)` → assert `error === null`; re-read as User A and assert value unchanged | RLS USING filters the row from User B's update set (0 rows affected, no error) |
| DELETE denial (direct) | `userB.client.from('<table>').delete().eq('id', resourceAId)` → assert `error === null`; re-read as User A and assert row still exists | RLS USING filters the row; 0 rows deleted, no error |
| DELETE IDOR (service) | Call the service function (e.g. `deleteCategory(userB.client, userB.userId, resourceAId)`) → assert no throw; re-read as User A and assert row still exists | App-layer `.eq('user_id', userId)` filter prevents deletion even without RLS |

**Important assertion notes:**
- UPDATE and DELETE via RLS USING clause: Supabase returns `{ error: null }` with 0 rows affected — no error is thrown. Always follow with a re-read as User A to confirm the resource was not modified.
- INSERT via WITH CHECK violation: Supabase returns `{ error: { code: '42501' } }`.
- Service function IDOR tests: service functions return `void`; assert resource-intact via re-read, not error code.

**Tables with FK requirements:** `expenses` and `budget_limits` require a `categories` row as a
foreign key — create the category as User A in `beforeAll` before creating the resource under test.

**Running a new file in isolation:** `npx vitest run src/tests/integration/rls-<table>.test.ts`
(requires `npx supabase start` and `.env.test` populated from `npx supabase status`)

### 6.2 Adding an integration test (service layer / CRUD)

TBD — see §3 Phase 2. Expected pattern: write succeeds → row exists; write fails → error surfaced; RLS write-block → error surfaced.

### 6.3 Adding a hermetic test (failure path / pure function)

TBD — see §3 Phase 2. Expected pattern: stub Supabase client to return an error on write; assert the handler surfaces the error rather than returning a silent success.

### 6.4 Adding a test for a new API endpoint

TBD — see §3 Phase 2. The reference test from Phase 2 will be the canonical example for this pattern.

### 6.5 Adding an integration test (constraint enforcement)

TBD — see §3 Phase 3. Expected pattern: category delete with existing expenses — assert 4xx response and verify expenses are unchanged in DB.

### 6.6 Per-rollout-phase notes

(Each phase's final sub-phase appends a 2–3 line note here after shipping.)

### Phase 1: Test infra bootstrap + RLS fortress (2026-06-03)

Vitest bootstrapped (`vitest.config.ts`, `node` environment, `@/` alias). `src/tests/integration/helpers.ts`
provides `createTestUser`/`deleteTestUser` using the admin client (service role key) + Bearer-token
authenticated clients. Three RLS isolation test files cover categories, expenses, and budget_limits for
SELECT/INSERT/UPDATE/DELETE cross-user denial. Service-function IDOR tests cover DELETE (and upsert)
double-defense. Cookbook pattern: §6.1.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **UI snapshot tests** — too brittle; fail frequently and catch nothing meaningful for this product. Re-evaluate if a design system is introduced or if rendering regressions become a repeated incident. (Source: interview Q5.)
- **Visual regression screenshots** — implied by the snapshot exclusion; deterministic assertions on data and error states are preferred over pixel comparisons. Re-evaluate only if dashboard chart rendering causes repeated user-reported issues.
- **Mobile performance benchmarks** — the <30s entry-speed requirement is a habit/UX concern, not a unit-test target. Validate manually during development sprints.
- **Generated Supabase TypeScript types (`database.types.ts`)** — the Supabase CLI generator is the test; asserting the generated output in tests would be a redundant mirror.

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-02
- Stack versions last verified: 2026-06-02
- AI-native tool references last verified: 2026-06-02

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
