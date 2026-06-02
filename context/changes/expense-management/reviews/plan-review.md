<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Expense Management

- **Plan**: context/changes/expense-management/plan.md
- **Mode**: Deep
- **Date**: 2026-06-02
- **Verdict**: SOUND (after fixes)
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | WARNING → FIXED |
| Blind Spots | WARNING → FIXED |
| Plan Completeness | PASS (1 observation dismissed) |

## Grounding

7/7 paths ✓, 5/5 symbols ✓, brief↔plan ✓. File rename blast radius: zero. PROTECTED_ROUTES startsWith("/expenses") does NOT match /api/expenses routes — confirmed safe.

## Findings

### F1 — SelectField has mandatory icon prop; wrong fit for the filter row

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — ExpenseList (Styling paragraph)
- **Detail**: SelectField.tsx requires `icon: ReactNode` with no default and always renders a `<label>` element. Appropriate for the inline edit category select (same as ExpenseForm) but adds unwanted chrome to the compact filter controls row.
- **Fix A ⭐ Recommended**: Use plain `<select>` for the filter row; `SelectField` (with icon) only for inline edit.
  - Strength: Compact controls row, no forced icon import for a filter.
  - Tradeoff: Two select patterns in one component; plain `<select>` needs manual dark-glass styling.
  - Confidence: HIGH
  - Blind spot: Exact filter row styling unspecified.
- **Fix B**: Use SelectField for both, noting required icon prop.
  - Strength: One consistent component, styling pre-built.
  - Tradeoff: Filter row gets label + icon it doesn't need.
  - Confidence: MEDIUM
  - Blind spot: Whether label is hidden via CSS is unspecified.
- **Decision**: FIXED via Fix A — plan updated to specify plain `<select>` for filter, `SelectField` for inline edit.

### F2 — Concurrent editingId + confirmDeleteId on separate rows is unspecified

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Behavior section
- **Detail**: Independent state fields allow both rows to be in special states simultaneously (edit on row A, delete-confirm on row B). Unintended UX.
- **Fix**: Add mutual-exclusion rule: opening edit clears confirmDeleteId; opening delete confirm clears editingId.
- **Decision**: FIXED — plan Behavior bullets updated with the mutual-exclusion rules.

### F3 — Mixed auth-failure response styles in expenses/index.ts

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — GET handler contract
- **Detail**: Every existing endpoint redirects on auth failure. The new GET handler returns JSON 401. Both correct for their respective callers (form vs. fetch), but inconsistent in the same file.
- **Fix**: Add a clarifying note to the GET handler Intent: "Returns JSON — called via fetch(), not from an HTML form, so redirects would be silently swallowed."
- **Decision**: FIXED — note added to GET handler Intent in plan.

### F4 — Progress automated items are implementation tasks, not success-criteria bullets

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Progress — Phases 1 and 2 Automated subsections
- **Detail**: Progress items 1.1-1.6 and 2.1-2.2 are implementation sub-tasks rather than success-criteria bullets re-stated. Phase 3 Manual items correctly mirror the 9 manual criteria.
- **Fix**: Accept as-is — implementation-task style is more useful for tracking.
- **Decision**: DISMISSED — intentional deviation from spec; implementation tasks preferred.
