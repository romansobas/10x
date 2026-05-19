---
project: "BudgetFlow"
version: 1
status: draft
created: 2026-05-18
context_type: greenfield
product_type: web-app
target_scale:
  users: medium
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

At the end of every month, a household budget manager realizes they spent more than planned — but cannot identify where the money went. Their bank statement is a wall of unstructured transactions with no category structure and no summary. The cost: repeated overspending without a feedback loop, no visibility into patterns, no way to course-correct mid-month.

The insight: dedicated budgeting apps and spreadsheet templates are too complex to use consistently. Their setup burden is high enough that people abandon them before seeing value. A minimal app that does one thing — shows you where your money went, organized by categories you define — removes that barrier without requiring bank integrations, financial expertise, or hours of configuration.

## User & Persona

**Primary persona**: a household budget manager who wants to understand where their money goes each month, has tried existing tools and found them too complex or time-consuming, and would use a simpler alternative if it were fast to get started with.

This is a public product — built for anyone in this situation, not a private single-user tool.

## Success Criteria

### Primary
A user who enters expenses consistently for 30 days can open the monthly summary and see exactly how their spending was distributed across categories — knowing where their money went without manually processing a bank statement.

### Secondary
Annual summary view: user can see year-over-year spending across 12 months to identify long-term patterns.

### Guardrails
- **Data privacy**: one user's expenses are never visible to another user. A cross-account data leak is a critical regression regardless of app maturity.
- **Entry speed**: adding an expense takes under 30 seconds. If daily entry is slow or friction-heavy, the habit breaks and the product fails.
- **No silent data loss**: expenses entered by a user are never silently deleted or lost. Trust in the app as a financial record is the product's core promise.
- **Mobile browser usability**: the app works on a mobile browser. Daily expense entry happens at point of spend — on the phone, not at a desk.

## User Stories

### US-01: User views monthly spending breakdown

- **Given** a signed-in user who has entered at least one expense in the current month
- **When** they open the monthly summary view
- **Then** they see total spending per category for that month, ordered by amount

#### Acceptance Criteria
- Each category shows total spent and its share of total monthly spending
- Months with no expenses show an empty state, not an error
- User can navigate to any past month they have data for

## Functional Requirements

### Authentication
- FR-001: User can register with email and password. Priority: must-have
  > Socrates: Counter-argument considered: "registration blocks real trial — add a guest/demo mode." Resolution: accepted — FR-015 added for guest access before account creation.
- FR-002: User can sign in with email and password. Priority: must-have
  > Socrates: Counter-argument considered: "users forget passwords — without reset, locked-out users churn permanently." Resolution: accepted — FR-016 added for password reset.
- FR-015: User can explore the app as a guest without creating an account. Priority: must-have
- FR-016: User can reset their forgotten password via email. Priority: must-have

### Category Management
- FR-003: User can view predefined default categories (dismissible during onboarding). Priority: must-have
  > Socrates: Counter-argument considered: "defaults anchor users to the wrong taxonomy." Resolution: defaults kept but made skippable — user can dismiss all defaults in onboarding if they don't match their taxonomy.
- FR-004: User can add a custom category (up to 20 categories total per user). Priority: must-have
  > Socrates: Counter-argument considered: "complexity for edge cases if defaults are good enough." Resolution: cap at 20 total categories for MVP; custom categories are the core value proposition per the original idea.
- FR-006: User can delete a category (blocked if the category has attached expenses — user must reassign or delete expenses first). Priority: must-have
  > Socrates: Counter-argument considered: "deleting a category with expenses creates a data integrity problem." Resolution: block deletion; user must clear or reassign expenses before the category can be removed.

### Expense Management
- FR-007: User can add an expense with amount, category, and date (date defaults to today). Priority: must-have
  > Socrates: Counter-argument considered: "requiring date pick every time adds friction to daily entry." Resolution: date defaults to today; user only changes it when logging a past expense.
- FR-008: User can edit an existing expense. Priority: must-have
  > Socrates: Counter-argument considered: "editing historical expenses undermines trust in the financial record." Resolution: edits are fine — this is a personal clarity tool, not an audit log. Typo fixes and recategorizations are expected.
- FR-009: User can delete an existing expense (with confirmation step). Priority: must-have
  > Socrates: Counter-argument considered: "hard deletion is permanent — a misclick costs an unrecoverable record." Resolution: add a confirmation step before deleting. No soft-delete for MVP.
- FR-010: User can browse expenses for a selected month (one month at a time, defaulting to current month). Priority: must-have
  > Socrates: Counter-argument considered: "a flat all-expenses list becomes unmanageable at 500+ items." Resolution: scope list to one month by default; user picks which month to browse.
- FR-011: User can filter the expense list by category. Priority: must-have
  > Socrates: Counter-argument considered: "monthly scope makes filtering unnecessary — list is small enough." Resolution: kept — category filter is the primary drill-down when investigating overspending in a category.

### Reporting
- FR-012: User can view a running month-to-date spending breakdown by category (visible from day 1 of the month). Priority: must-have
  > Socrates: Counter-argument considered: "new users see no value during their entire first month, risking abandonment." Resolution: show month-to-date data as it accumulates — user sees their partial breakdown from day 3, not just at month-end.
- FR-013: User can compare spending across months via a trend chart (all months) and a two-month drill-down. Priority: nice-to-have
  > Socrates: Counter-argument considered: "near-zero early usage — visible only after 2+ months." Resolution: kept — it's the long-term retention hook for users who stick past month 2.

### Budget Limits
- FR-017: User can set an optional monthly budget limit per category. Priority: must-have

## Non-Functional Requirements

- **Entry speed**: any write operation — adding or editing an expense, setting a budget limit — is visible to the user within 1 second of submission.
- **Mobile-first usability**: the app is fully usable on a mobile phone browser — no horizontal scrolling, touch targets of adequate size for thumb interaction, core flows completable without a physical keyboard.
- **Data privacy**: user expense and budget data is never shared with third parties; no personally identifiable financial information is included in any external analytics or telemetry.

## Business Logic

The app calculates the total spent per category in each month, compares that total against the user's optional budget limit for that category, and makes the result observable — both during the month as expenses accumulate and in the monthly summary.

**Inputs (user-facing):**
- Expense entries: amount, category, and date (entered by the user day by day)
- An optional monthly budget limit per category (not all categories need one)

**Output:**
- During the month: as the user adds expenses, each category with a budget limit shows its running total relative to that limit, so the user can see at a glance how much of their budget remains.
- In the monthly summary: categories that have exceeded their budget limit are distinguished from those still within budget, with amount spent, limit, and the difference shown for each over-budget category.

Categories without a budget limit show their total spent only — no budget comparison applies.

## Access Control

Email + password authentication. Each user creates an account and sees only their own data — no shared budgets, no role separation, no admin tier in MVP.

- Sign-up: email + password
- Sign-in: email + password
- Data isolation: per-account, strictly private
- Guest access available before account creation (FR-015)

## Non-Goals

- **No automatic bank import / open banking integration** — manual expense entry only for MVP. Bank API integrations add compliance burden, error-handling complexity, and maintenance overhead that would significantly expand scope.
- **No investment tracking** — this app tracks spending and budgets only. Portfolio management, savings goals, and net-worth dashboards are a different product category.
- **No multi-currency support** — single currency per user for MVP. Currency conversion logic (exchange rates, historical rates, display formatting) adds data and UX complexity out of scope for the first version.

## Open Questions

1. **Secondary criterion and trend chart alignment**: the Secondary success criterion references an annual/year-over-year view across 12 months, but FR-014 (annual summary) was dropped during the Socratic review in favor of FR-013 (trend chart across all months + two-month drill-down). Clarify: does the Secondary criterion now map to FR-013's trend chart, or should an annual/calendar-year summary be re-scoped separately? — Owner: user. Block: no (FR-013 partially satisfies the intent; the monthly summary is the primary payoff).
