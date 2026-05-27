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
