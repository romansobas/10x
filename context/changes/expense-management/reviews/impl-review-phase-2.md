<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Expense Management

- **Plan**: context/changes/expense-management/plan.md
- **Scope**: Phase 2 of 3
- **Date**: 2026-06-02
- **Verdict**: APPROVED (after fixes)
- **Findings**: 0 critical, 4 warnings, 2 observations

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

### F1 — Race condition: rapid navigation can display wrong month's data

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: ExpenseList.tsx:48-62
- **Detail**: prevMonth/nextMonth start a fetch with no in-flight guard. Two rapid clicks fire concurrent fetches; whichever resolves last wins, so month label and expense rows can represent different months.
- **Fix A ⭐ Recommended**: Add useRef request-id guard in fetchExpenses; discard stale responses.
  - Strength: Precise fix; zero UX overhead.
  - Tradeoff: Requires useRef and one guard check.
  - Confidence: HIGH
  - Blind spot: None significant.
- **Fix B**: Disable navigation buttons and category filter while loading.
  - Strength: Zero logic change; one attribute per control.
  - Tradeoff: Mitigation only — slow response after re-enable still races.
  - Confidence: HIGH as mitigation; LOW as complete fix.
  - Blind spot: Category filter select needs disabled handling.
- **Decision**: FIXED via Fix B — added `disabled={loading}` + `disabled:opacity-40` to prev/next buttons and category filter select.

### F2 — No buttons disabled during async ops — double-submit risk

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: ExpenseList.tsx:217, 249
- **Detail**: Save and Confirm? buttons have no disabled state. Double-click fires two concurrent POST/DELETE requests.
- **Fix**: Add `disabled={loading}` to Save and Confirm? buttons.
- **Decision**: FIXED — added `disabled={loading}` + `disabled:opacity-40` to both buttons.

### F3 — saveEdit sends unvalidated input — 400 round-trip gives poor UX

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: ExpenseList.tsx:85-102
- **Detail**: saveEdit submits whatever is in editForm without client-side validation. Empty/zero amount hits the server, gets a 400, and the error banner appears at the top while the edit form is still open mid-page. ExpenseForm.tsx validates before fetch; ExpenseList did not.
- **Fix**: Add guard before the fetch: parse amount, check > 0, check category_id and expense_date truthy.
- **Decision**: FIXED — added validation guard matching ExpenseForm's pattern.

### F4 — GET /api/expenses response cast blindly to array

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: ExpenseList.tsx:39
- **Detail**: `(await res.json()) as ExpenseWithCategory[]` — non-array 200 response would crash the render with "data.map is not a function".
- **Fix**: Add `if (!Array.isArray(data)) { setError("Unexpected server response."); return; }` before setExpenses.
- **Decision**: FIXED — guard added; cast moved to after the check.

### F5 — Named vs. default export inconsistency with ExpenseForm

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: ExpenseList.tsx:13
- **Detail**: ExpenseList uses named export; ExpenseForm uses default. SelectField also uses named — ExpenseList is the better pattern.
- **Fix**: Optionally remove bare `import React` from ExpenseForm.tsx (pre-JSX-transform leftover).
- **Decision**: SKIPPED — named export is correct; no change needed in ExpenseList.

### F6 — void pattern: fetchExpenses must never throw externally

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: ExpenseList.tsx:28-46
- **Detail**: void discards the Promise; any unhandled rejection past the try/catch would be silent. Today there is no escapable path.
- **Fix**: Add comment: "Callers use void — this function must never throw externally."
- **Decision**: FIXED — comment added above fetchExpenses.
