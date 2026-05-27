# Domain Schema with Row-Level Security — Implementation Plan

## Overview

Create the Supabase database schema for BudgetFlow: three domain tables
(`categories`, `expenses`, `budget_limits`) with Row-Level Security policies
that enforce strict per-user data isolation. This is F-01 in the roadmap — the
foundation every downstream slice depends on before it can be planned or built.

## Current State Analysis

- `supabase/migrations/` directory does not exist.
- `supabase/config.toml` has `schema_paths = []` (line 58) and references a
  non-existent `./seed.sql` (line 65) — will cause `db reset` to error.
- `src/lib/supabase.ts` exports `createClient()` using `createServerClient`
  without a `Database` type generic — queries are untyped.
- `src/types.ts` does not exist.
- Supabase auth is fully in place: `auth.uid()` returns the authenticated user's
  UUID, confirmed by `src/middleware.ts:10-16` and `src/env.d.ts:3`.

## Desired End State

- `supabase/migrations/20260527000000_create_domain_schema.sql` applies cleanly
  via `npx supabase db reset`, producing all three domain tables with the correct
  constraints, indexes, and RLS policies.
- `supabase/seed.sql` exists (empty) so `db reset` does not error on the seed step.
- `src/database.types.ts` is generated from the local schema via the Supabase CLI.
- `src/types.ts` declares `Category`, `Expense`, and `BudgetLimit` as the
  canonical domain types for use throughout the app.
- `src/lib/supabase.ts` uses `createServerClient<Database>` so all Supabase
  queries have full column-level type checking.

### Key Discoveries

- `src/lib/supabase.ts:9` — `createServerClient` takes a `Database` generic;
  adding it requires only a one-line import and a type parameter change.
- `supabase/config.toml:65` — `sql_paths = ["./seed.sql"]`; the file must exist
  or `npx supabase db reset` fails on the seed step.
- CLAUDE.md:48 — migration naming convention: `YYYYMMDDHHmmss_short_description.sql`;
  RLS required on every new table.
- Supabase JS client returns PostgreSQL `NUMERIC` columns as JavaScript `string`,
  not `number` — domain types must reflect this.

## What We're NOT Doing

- Not seeding default categories into the DB — they will be a hard-coded
  TypeScript array rendered in the onboarding UI (decided in planning).
- Not adding a `note` or `description` field to `expenses` — PRD FR-007
  specifies amount + category + date only.
- Not enforcing the 20-category cap at the DB level — application-level check
  only (decided in planning).
- Not running or modifying the CI workflow — migrations are applied to remote via
  `npx supabase db push`, not via GitHub Actions.
- Not writing application code that queries these tables — that belongs to S-01
  onwards.

## Implementation Approach

Single atomic migration file containing all three tables in dependency order
(categories first, then expenses and budget_limits which reference it). RLS
policies use Supabase's `auth.uid()` helper — one `FOR ALL` policy per table,
which is sufficient for a single-actor per-user model. A shared trigger function
auto-updates `updated_at` on every row modification.

After the migration lands, the Supabase CLI generates TypeScript types from the
live local schema. These generated types are committed alongside hand-crafted
domain types that downstream slices import directly.

## Critical Implementation Details

**NUMERIC returns as JavaScript string.** The Supabase JS client serialises
PostgreSQL `NUMERIC(12,2)` as a JS `string` (e.g. `"49.99"`) to avoid
floating-point precision loss. `amount` and `monthly_limit` in `src/types.ts`
must be typed as `string`. Downstream slices that do arithmetic must call
`parseFloat(amount)` explicitly — or compute aggregates inside Supabase queries
using SQL (`sum(amount)`) where the result also comes back as a string.

**FK asymmetry between `expenses` and `budget_limits`.** Both tables reference
`categories(id)`, but with different delete behaviour:
- `expenses.category_id` → `ON DELETE RESTRICT` — the DB refuses to delete a
  category that still has expense rows. This implements FR-006's "user must
  reassign or delete expenses first" semantics at the storage layer.
- `budget_limits.category_id` → `ON DELETE CASCADE` — when a category is deleted
  (only possible after all its expenses are gone), its budget limit is deleted
  automatically. A budget limit is a user preference that should not outlive the
  category it belongs to.

**`updated_at` is managed by a DB trigger.** The migration creates a
`trigger_set_updated_at()` function and attaches a `BEFORE UPDATE` trigger to
each table. Application UPDATE queries do not need to include `updated_at` in
their payload — the trigger sets it automatically. If a query does include it,
the trigger overwrites it with `now()`.

---

## Phase 1: Database Migration

### Overview

Create `supabase/migrations/20260527000000_create_domain_schema.sql` containing
all three domain tables, constraints, indexes, RLS policies, and the
`updated_at` trigger. Also create an empty `supabase/seed.sql` to prevent CLI
errors. Verify the migration applies cleanly against the local Supabase stack.

### Changes Required

#### 1. Migration file

**File:** `supabase/migrations/20260527000000_create_domain_schema.sql`

**Intent:** Define the complete domain schema in one atomic migration. Tables are
created in dependency order so foreign keys resolve. RLS is enabled immediately
after each table is created.

**Contract:** The migration must be idempotent on a fresh DB (no `IF NOT EXISTS`
needed — `db reset` drops and recreates). The full SQL is the contract:
downstream slices reference specific column names, FK relationships, and
constraint semantics defined here.

```sql
-- ============================================================
-- BudgetFlow domain schema
-- ============================================================

-- Shared trigger function: auto-sets updated_at on every UPDATE
create or replace function trigger_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- categories
-- ------------------------------------------------------------
create table categories (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  name       text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_not_empty check (char_length(trim(name)) > 0)
);

-- One name per user, case-insensitive
create unique index categories_user_name_unique
  on categories (user_id, lower(trim(name)));

alter table categories enable row level security;

create policy "users_own_categories" on categories
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger categories_set_updated_at
  before update on categories
  for each row execute function trigger_set_updated_at();

-- ------------------------------------------------------------
-- expenses
-- ------------------------------------------------------------
create table expenses (
  id           uuid          primary key default gen_random_uuid(),
  user_id      uuid          not null references auth.users(id) on delete cascade,
  category_id  uuid          not null references categories(id) on delete restrict,
  amount       numeric(12,2) not null,
  expense_date date          not null default current_date,
  created_at   timestamptz   not null default now(),
  updated_at   timestamptz   not null default now(),
  constraint expenses_amount_positive check (amount > 0)
);

-- Covering index for monthly breakdown queries (user + month window)
create index expenses_user_date_idx
  on expenses (user_id, expense_date desc);

-- Covering index for per-category filtering
create index expenses_user_category_idx
  on expenses (user_id, category_id);

alter table expenses enable row level security;

create policy "users_own_expenses" on expenses
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger expenses_set_updated_at
  before update on expenses
  for each row execute function trigger_set_updated_at();

-- ------------------------------------------------------------
-- budget_limits
-- ------------------------------------------------------------
create table budget_limits (
  id            uuid          primary key default gen_random_uuid(),
  user_id       uuid          not null references auth.users(id) on delete cascade,
  category_id   uuid          not null references categories(id) on delete cascade,
  monthly_limit numeric(12,2) not null,
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now(),
  constraint budget_limits_amount_positive  check (monthly_limit > 0),
  constraint budget_limits_unique_per_category unique (user_id, category_id)
);

alter table budget_limits enable row level security;

create policy "users_own_budget_limits" on budget_limits
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger budget_limits_set_updated_at
  before update on budget_limits
  for each row execute function trigger_set_updated_at();
```

#### 2. Empty seed file

**File:** `supabase/seed.sql`

**Intent:** `supabase/config.toml` references `./seed.sql` in its `[db.seed]`
block. Without this file, `npx supabase db reset` errors on the seed step.
The file is intentionally empty — default categories are hard-coded in app code.

**Contract:** Empty file. No SQL content.

### Success Criteria

#### Automated Verification

- `npx supabase db reset` completes without errors and reports all migrations applied.
- `npm run build` passes (no import errors introduced in Phase 1).

#### Manual Verification

- All three tables appear in the local Supabase Studio at
  `http://127.0.0.1:54323/project/default/editor` with the correct columns.
- RLS is shown as enabled on all three tables in the Table Editor.
- Inserting a row as user A and querying with a different `user_id` (e.g., via
  the SQL editor with `set request.jwt.claims = '{"sub":"<other-uuid>"}'`) returns
  0 rows from `categories`.

**Implementation Note:** After Phase 1 automated verification passes, pause for
manual confirmation that Supabase Studio shows the tables correctly and RLS is
active before proceeding to Phase 2.

---

## Phase 2: TypeScript Types

### Overview

Generate the Supabase database type definitions from the live local schema, write
clean domain entity types, and update the Supabase client to use the typed
generic. This makes all downstream queries type-safe at the column level.

### Changes Required

#### 1. Generate Supabase database types

**File:** `src/database.types.ts`

**Intent:** Run the Supabase CLI type generator against the local DB to produce
the `Database` type that includes all table definitions, column types, and
relationships. This file is generated — do not hand-edit it.

**Contract:** Run after `npx supabase start` and a successful `db reset`:
```
npx supabase gen types typescript --local > src/database.types.ts
```
The generated file exports a `Database` interface that `createServerClient`
accepts as a generic. Commit the generated file to the repository.

#### 2. Domain entity types

**File:** `src/types.ts` (create)

**Intent:** Provide clean, ergonomic domain types that downstream slices import
for function signatures, component props, and service layer DTOs. These are
derived from the schema but use plain TypeScript — no Supabase internals.

**Contract:** The signatures below are the contract downstream slices depend on.
`amount` and `monthly_limit` are `string` because Supabase JS returns NUMERIC as
string (see Critical Implementation Details above).

```typescript
export type Category = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type Expense = {
  id: string;
  user_id: string;
  category_id: string;
  amount: string;       // NUMERIC(12,2) — Supabase returns as string; parseFloat() for arithmetic
  expense_date: string; // ISO date "YYYY-MM-DD"
  created_at: string;
  updated_at: string;
};

export type BudgetLimit = {
  id: string;
  user_id: string;
  category_id: string;
  monthly_limit: string; // NUMERIC(12,2) — Supabase returns as string; parseFloat() for arithmetic
  created_at: string;
  updated_at: string;
};
```

#### 3. Typed Supabase client

**File:** `src/lib/supabase.ts`

**Intent:** Add the `Database` generic to `createServerClient` so all table
queries on the returned client are type-checked against the generated schema.

**Contract:** Import `Database` from `@/database.types` and thread it through the
generic:

```typescript
import type { Database } from "@/database.types";
// …
return createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, { … });
```

The return type of `createClient()` changes from
`SupabaseClient` to `SupabaseClient<Database>` — downstream callers are
unaffected as long as they use the client methods (`.from()`, `.auth`, etc.)
directly.

### Success Criteria

#### Automated Verification

- `npm run lint` passes with no TypeScript errors across `src/database.types.ts`,
  `src/types.ts`, and `src/lib/supabase.ts`.
- `npm run build` passes end-to-end.

#### Manual Verification

- In the IDE, typing `createClient(…).from("` shows `"categories"`,
  `"expenses"`, and `"budget_limits"` as autocomplete suggestions.
- Accessing a non-existent column (e.g., `.select("nonexistent")`) causes a
  TypeScript error in the editor.

---

## Testing Strategy

### Automated

- `npx supabase db reset` is the migration smoke test — it fails loudly if any
  SQL is invalid.
- `npm run lint` catches TypeScript contract violations in Phase 2.

### Manual Testing Steps

1. Start local Supabase: `npx supabase start`
2. Apply migration: `npx supabase db reset`
3. Open Studio at `http://127.0.0.1:54323` — verify all three tables with correct columns.
4. Confirm RLS enabled: Table Editor → each table → "RLS enabled" badge.
5. (Optional) Open SQL editor; paste a test insert into `categories` with a known
   `user_id` UUID; then query with a different UUID — expect 0 rows returned.
6. Generate types (Phase 2): `npx supabase gen types typescript --local > src/database.types.ts`
7. Run `npm run lint` — confirm no TS errors.
8. Run `npm run build` — confirm clean build.
9. (Optional) Check IDE autocomplete on `createClient(…).from("` — confirm table
   name suggestions appear.

## Migration Notes

This is a greenfield migration — no existing data to preserve. `npx supabase db reset`
drops and recreates the entire local DB, which is the correct apply mechanism
during development. To apply to a remote Supabase project: `npx supabase db push`.

## References

- Roadmap F-01: `context/foundation/roadmap.md`
- PRD — Business Logic, Access Control, FR-003/004/006/007/008/009/010/011/012/017:
  `context/foundation/prd.md`
- Supabase client: `src/lib/supabase.ts`
- Migration naming convention: `CLAUDE.md:48`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Database Migration

#### Automated

- [x] 1.1 `npx supabase db reset` completes without errors
- [x] 1.2 `npm run build` passes

#### Manual

- [x] 1.3 All three tables visible in Supabase Studio with correct columns
- [x] 1.4 RLS shown as enabled on all three tables
- [x] 1.5 RLS row isolation verified via SQL editor query

### Phase 2: TypeScript Types

#### Automated

- [ ] 2.1 `npm run lint` passes with no TypeScript errors
- [ ] 2.2 `npm run build` passes end-to-end

#### Manual

- [ ] 2.3 IDE autocomplete shows table names on `createClient(…).from(`
- [ ] 2.4 Non-existent column reference causes a TypeScript error
