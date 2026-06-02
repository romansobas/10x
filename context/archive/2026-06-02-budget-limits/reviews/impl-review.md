<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Per-Category Budget Limits

- **Plan**: context/changes/budget-limits/plan.md
- **Scope**: All phases (1–3)
- **Date**: 2026-06-02
- **Verdict**: APPROVED (after fixes)
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING → FIXED |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — `as unknown as BudgetLimit[]` masks monthly_limit type mismatch

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/budget-limits.ts:8
- **Detail**: database.types.ts declares `monthly_limit: number`, types.ts BudgetLimit declares it as `string`. The `as unknown as BudgetLimit[]` cast papered over this conflict. At runtime the code worked, but a future caller reading `l.monthly_limit` as `string` without `parseFloat` would get a number silently.
- **Fix A ⭐ Applied**: Removed the explicit `Promise<BudgetLimit[]>` return type and `as unknown as` cast; `getBudgetLimits` now returns the inferred Supabase Row type (monthly_limit: number). Updated `categories.astro` to use `l.monthly_limit` directly (no parseFloat needed). Added a comment explaining the type divergence.
- **Decision**: FIXED via Fix A.

### F2 — Whitespace-only limit passes !limitRaw but is caught by isNaN

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/budget-limits/[category_id].ts:34
- **Detail**: `!limitRaw` is false for whitespace-only input; `parseFloat` correctly returns NaN and the guard fires, but the intent was unclear.
- **Fix**: Added `.trim()` — `const limitRaw = (form.get("limit") as string | null)?.trim()`.
- **Decision**: FIXED.

### F3 — getMonthBreakdown fetches all categories regardless of month activity

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/expenses.ts:38
- **Detail**: Pre-existing: categories query fetches all user categories even for months with minimal activity. Inconsequential at the 20-category cap.
- **Fix**: No action needed now. Flag for future if cap grows.
- **Decision**: SKIPPED.

### F4 — CategoryTotal defined in service file rather than src/types.ts

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/expenses.ts:13
- **Detail**: Pre-existing: CategoryTotal (now with optional limit?) lives in the service file, not src/types.ts alongside Category, Expense, BudgetLimit. Only one consumer today.
- **Fix**: Move to types.ts when a second consumer appears.
- **Decision**: SKIPPED.
