---
project: "BudgetFlow"
version: 1
status: draft
created: 2026-05-27
updated: 2026-06-02
prd_version: 1
main_goal: market-feedback
top_blocker: capacity
---

# Roadmap: BudgetFlow

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Every month, household budget managers discover they overspent — but cannot identify where. Existing tools are too complex to use consistently, so users abandon them before seeing value. BudgetFlow removes that barrier: one app that does one thing — shows where your money went, organised by categories you define, without bank integrations or hours of configuration.

## North star

**S-01: user can add an expense with a category and see it appear in the running monthly spending breakdown** — proves the core product hypothesis — that adding an expense and immediately seeing it reflected in a category breakdown creates enough daily-return value to sustain the 30-day entry habit — which is the product's primary success criterion.

> The north star is the smallest end-to-end slice whose successful delivery proves the core product hypothesis — placed as early as Prerequisites allow because everything else only matters if this feedback loop works.

## At a glance

| ID   | Change ID           | Outcome (user can …)                                            | Prerequisites | PRD refs                              | Status   |
| ---- | ------------------- | --------------------------------------------------------------- | ------------- | ------------------------------------- | -------- |
| F-01 | domain-schema-rls   | (foundation) domain tables and RLS policies in place            | —             | NFR (data privacy), Access Control    | ready    |
| S-01 | core-expense-entry  | add an expense with a category and see the month-to-date breakdown | F-01       | FR-003, FR-007, FR-012, US-01         | proposed |
| S-02 | category-management | add custom categories and delete unused ones                    | S-01          | FR-004, FR-006                        | proposed |
| S-03 | expense-management  | browse, filter, edit, and delete expenses by month              | S-01          | FR-008, FR-009, FR-010, FR-011        | proposed |
| S-04 | budget-limits       | set a monthly budget limit per category and see overrun markers | S-01, S-02    | FR-017                                | done     |
| S-05 | auth-extended       | explore the app as a guest and reset a forgotten password       | —             | FR-001, FR-002, FR-015, FR-016        | ready    |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme         | Chain                              | Note                                                                        |
| ------ | ------------- | ---------------------------------- | --------------------------------------------------------------------------- |
| A      | Core loop     | `F-01` → `S-01` → `S-02` → `S-04` | Main must-have path; the north star (S-01) gates everything in this chain.  |
| B      | Expense CRUD  | `S-03`                             | Branches from Stream A at `S-01`; runs in parallel with `S-02`.            |
| C      | Auth flows    | `S-05`                             | Runs in parallel with `F-01`; no domain data dependency.                    |

## Baseline

What's already in place in the codebase as of 2026-05-27 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 + React 19; pages: `src/pages/index.astro`, `src/pages/dashboard.astro`; shadcn/ui button component; Tailwind CSS
- **Backend / API:** partial — auth endpoints only (`src/pages/api/auth/signin.ts`, `signup.ts`, `signout.ts`); no domain endpoints yet
- **Data:** partial — Supabase client wired (`src/lib/supabase.ts`); no schema/migration files; `supabase/config.toml` has empty `schema_paths`; no domain tables (categories, expenses, budget_limits)
- **Auth:** present — Supabase auth fully integrated: signin/signup/signout endpoints, `src/middleware.ts` protects `/dashboard`, token verification via `supabase.auth.getUser()`
- **Deploy / infra:** present — GitHub Actions CI (`.github/workflows/ci.yml`), Cloudflare Workers deploy via `wrangler.jsonc`
- **Observability:** absent — no logging library, error tracking, or metrics

## Foundations

### F-01: Domain schema with Row-Level Security

- **Outcome:** (foundation) domain tables (categories, expenses, budget_limits) exist in Supabase with Row-Level Security policies enforcing strict per-user data isolation.
- **Change ID:** domain-schema-rls
- **PRD refs:** NFR (data privacy guardrail — "a cross-account data leak is a critical regression regardless of app maturity"), Access Control section (per-account, strictly private)
- **Unlocks:** S-01 (expense entry requires categories and expenses tables), S-02 (category management), S-03 (expense management), S-04 (budget limits), S-05 (conditionally — if guest mode uses Supabase anonymous auth)
- **Prerequisites:** —
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** RLS policy gaps are a critical regression regardless of app maturity (data privacy guardrail); a schema design error here cascades to all downstream slices. Sequenced first because no user-facing domain work can proceed without it.
- **Status:** ready

## Slices

### S-01: Core expense entry and month-to-date breakdown

- **Outcome:** user can add an expense with a category and see it appear in the running month-to-date spending breakdown
- **Change ID:** core-expense-entry
- **PRD refs:** FR-003, FR-007, FR-012, US-01
- **Prerequisites:** F-01
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** North star slice — if expense entry is slow (30-second guardrail) or the breakdown is confusing, the product's core hypothesis fails early. Mobile form usability and immediate breakdown feedback are the load-bearing UX bets here.
- **Status:** proposed

### S-02: Category management

- **Outcome:** user can add custom categories (up to 20 total) and delete a category that has no attached expenses
- **Change ID:** category-management
- **PRD refs:** FR-004, FR-006
- **Prerequisites:** S-01
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** FR-006's "delete blocked if category has expenses" constraint must be enforced correctly; a bug here can orphan expense records and break the no-silent-data-loss guardrail. Sequenced after S-01 so the constraint is testable with real expense data.
- **Status:** proposed

### S-03: Expense management

- **Outcome:** user can browse their expense list filtered to a selected month, filter it further by category, edit an existing expense, and delete an expense with a confirmation step
- **Change ID:** expense-management
- **PRD refs:** FR-008, FR-009, FR-010, FR-011
- **Prerequisites:** S-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Month-scoped browse and category filter must be fully usable on a mobile browser (no horizontal scroll, adequate touch targets). Sequenced after S-01; safe to run in parallel with S-02 since neither blocks the other — a high-value parallel track given capacity as top blocker.
- **Status:** proposed

### S-04: Per-category budget limits and overrun markers

- **Outcome:** user can set an optional monthly budget limit per category and see, in the spending breakdown, which categories have exceeded their limit and by how much
- **Change ID:** budget-limits
- **PRD refs:** FR-017
- **Prerequisites:** S-01, S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The budget overrun calculation (amount spent vs. limit, delta) is the core business logic of the PRD; a calculation error produces misleading financial data for a personal finance tool. Sequenced after S-02 so the full custom category list is available when setting limits.
- **Status:** done

### S-05: Extended auth — guest access and password reset

- **Outcome:** user can explore the app as a guest without creating an account, and can reset a forgotten password via email
- **Change ID:** auth-extended
- **PRD refs:** FR-001, FR-002, FR-015, FR-016
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:**
  - Does guest mode persist data in Supabase (anonymous auth — creates a conditional dependency on F-01) or use session-only storage (no F-01 dependency)? — Owner: team. Block: no (both are implementable; decide at `/10x-plan auth-extended` time).
- **Risk:** Guest mode architecture (Supabase anonymous user vs. session-only storage) affects the F-01 dependency and whether guest data can be migrated on account creation; decide at planning time. Note: FR-001 and FR-002 are already implemented in the codebase baseline — this slice completes the auth story.
- **Status:** ready

## Backlog Handoff

| Roadmap ID | Change ID           | Suggested issue title                                               | Ready for `/10x-plan` | Notes                                                   |
| ---------- | ------------------- | ------------------------------------------------------------------- | --------------------- | ------------------------------------------------------- |
| F-01       | domain-schema-rls   | Set up domain schema with RLS (categories, expenses, budget limits) | yes                   | Run `/10x-plan domain-schema-rls`                       |
| S-01       | core-expense-entry  | Expense entry form and month-to-date spending breakdown             | no                    | Depends on F-01                                         |
| S-02       | category-management | Custom category creation and deletion                               | no                    | Depends on S-01; parallel with S-03                     |
| S-03       | expense-management  | Expense list: browse by month, filter, edit, and delete             | no                    | Depends on S-01; parallel with S-02                     |
| S-04       | budget-limits       | Per-category monthly budget limits with overrun indicators          | no                    | Depends on S-01, S-02                                   |
| S-05       | auth-extended       | Guest access and password reset via email                           | yes                   | Run `/10x-plan auth-extended`; see Unknown re: guest architecture |

## Open Roadmap Questions

1. **Secondary criterion and trend chart alignment** — The secondary success criterion references an annual/year-over-year view across 12 months, but FR-013 (trend chart across all months + two-month drill-down) is the closest equivalent and is currently parked as nice-to-have. Does the secondary criterion map to FR-013, or should a separate annual/calendar-year summary be re-scoped? — Owner: user. Block: no (FR-013 is parked; monthly summary is the primary payoff; clarify before un-parking FR-013).

## Parked

- **FR-013: Trend chart (all months + two-month drill-down)** — Why parked: nice-to-have; near-zero utility before 2+ months of data exist; capacity is the top blocker. Un-park after the core must-have loop ships and real usage data accumulates.
- **Bank import / open banking integration** — Why parked: PRD §Non-Goals; adds compliance burden and maintenance overhead out of scope for MVP.
- **Investment tracking (portfolio, savings goals, net worth)** — Why parked: PRD §Non-Goals; different product category from expense tracking.
- **Multi-currency support** — Why parked: PRD §Non-Goals; exchange rate and display complexity out of scope for MVP.

## Done

(Empty on first generation. `/10x-archive` appends an entry here — and flips that item's `Status` to `done` — when a change whose `Change ID` matches the item is archived.)

- **S-04: set a monthly budget limit per category and see overrun markers** — Archived 2026-06-02 → `context/archive/2026-06-02-budget-limits/`. Lesson: —.
