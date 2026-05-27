# Domain Schema with Row-Level Security — Plan Brief

> Full plan: `context/changes/domain-schema/plan.md`
> Roadmap item: F-01 — `context/foundation/roadmap.md`

## What & Why

Create the Supabase database schema for BudgetFlow: `categories`, `expenses`,
and `budget_limits` tables with Row-Level Security policies that enforce strict
per-user data isolation. This is the load-bearing foundation — no user-facing
feature can be built until these tables exist and RLS is proven correct.

## Starting Point

No domain tables exist. `supabase/migrations/` is absent; the Supabase client at
`src/lib/supabase.ts` is untyped; `src/types.ts` does not exist. Supabase auth
is fully wired and `auth.uid()` is available for RLS policies.

## Desired End State

A single migration file creates all three tables with constraints, indexes, and
RLS in one atomic apply. TypeScript types generated from the live schema give
full column-level autocomplete to every downstream slice that queries the DB.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Budget limit granularity | One limit per (user, category) | PRD says "monthly budget limit per category" with no mention of month-to-month variation — uniform limit is the simpler, PRD-matching read. | Plan |
| Default categories storage | Hard-coded TypeScript array, not in DB | Zero seeding complexity for MVP; changing defaults is a code deploy, which is fine. | Plan |
| Category deletion guard | DB-level FK `RESTRICT` on `expenses.category_id` | Strongest guarantee — impossible to orphan expenses regardless of code path; implements FR-006 at the storage layer. | Plan |
| Amount type | `NUMERIC(12,2)` | Standard SQL decimal for monetary values; Postgres arithmetic is exact for NUMERIC. | Plan |
| 20-category cap enforcement | Application level only | No trigger complexity; the only writer is the app itself. | Plan |

## Scope

**In scope:**
- `supabase/migrations/20260527000000_create_domain_schema.sql` (tables + RLS + trigger)
- `supabase/seed.sql` (empty file — prevents CLI errors)
- `src/database.types.ts` (generated from local schema)
- `src/types.ts` (Category, Expense, BudgetLimit domain types)
- `src/lib/supabase.ts` update (add `Database` generic to typed client)

**Out of scope:**
- Default category seed data
- Any API endpoints or application code that queries the tables
- CI workflow changes
- `note` / `description` field on expenses (PRD specifies only amount + category + date)

## Architecture / Approach

Single SQL migration creates tables in dependency order (`categories` first,
then `expenses` and `budget_limits` which FK-reference it). A shared
`trigger_set_updated_at()` function handles `updated_at` automatically on UPDATE.
RLS uses Supabase's `auth.uid()` with a single `FOR ALL` policy per table
(appropriate for a single-actor, per-user model). Generated types flow into the
Supabase client generic, giving downstream slices compile-time column checking.

**Key FK asymmetry:** `expenses.category_id → RESTRICT` (protects financial
records); `budget_limits.category_id → CASCADE` (preference follows category).

**NUMERIC as string:** Supabase JS returns `NUMERIC(12,2)` as JS `string`.
`amount` and `monthly_limit` in `src/types.ts` are `string` — callers use
`parseFloat()` for arithmetic.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Database migration | All three tables + RLS applied locally; empty seed.sql | RLS policy gap — any `using` expression bug makes cross-user data visible |
| 2. TypeScript types | Generated DB types + domain types + typed Supabase client | Generated types may not match hand-crafted types — reconcile carefully |

**Prerequisites:** Local Supabase stack running (`npx supabase start`; requires Docker).  
**Estimated effort:** ~1 focused session across 2 phases.

## Open Risks & Assumptions

- Guest mode architecture (anonymous Supabase auth vs. session-only) is an open
  question in S-05 — the schema supports both without modification, since
  Supabase anonymous auth users also get a real UUID.
- `npx supabase gen types typescript --local` requires the local Supabase stack
  to be running; Phase 2 cannot proceed if Docker is unavailable.

## Success Criteria (Summary)

- `npx supabase db reset` applies cleanly and all three tables appear in Supabase
  Studio with RLS active.
- A cross-user row isolation test in the SQL editor returns 0 rows for the wrong
  `user_id`.
- `npm run lint` and `npm run build` pass with the typed Supabase client in place.
