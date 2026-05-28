# Plan Brief — category-management

## What We're Building

`/categories` management page: list all user categories with all-time expense counts, add new
ones (up to 20), delete ones with no expenses. Linked from the dashboard via "Manage categories".

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Page location | New page `/categories` | Separate from dashboard; management is infrequent |
| Add form | Inline single-field form (name + Add button, one row) | MVP simplicity; no modal needed |
| Delete UX | Button always visible; error banner explains block | No confirmation step; DB RESTRICT prevents data loss |
| Cap UX | Form hidden, "Maximum 20 categories reached." message | Server-side conditional render; no JS needed |
| List info | Name + all-time expense count | Helps user understand why delete may be blocked |
| Expense count query | Two parallel queries (categories + expenses) aggregated in TS | Type-safe; mirrors getMonthBreakdown pattern |
| Navigation | "Manage categories" text link on dashboard | Discoverable; infrequent action doesn't need prominent nav |
| Delete method | `POST /api/categories/[id]` | HTML forms only support GET/POST; consistent with expense pattern |

## Architecture

```
/categories (Astro SSR)
  ← getCategoriesWithExpenseCounts(supabase, userId)
  → POST /api/categories          → createCategory(supabase, userId, name)
  → POST /api/categories/[id]     → deleteCategory(supabase, userId, id)
```

Error flow: service throws tagged Error ("cap" | "duplicate" | "has_expenses"); API catches →
`redirect("/categories?error=...")` → page reads `?error` → error banner rendered SSR.

## Files Touched

**Phase 1:** `src/types.ts`, `src/lib/services/categories.ts`,
`src/pages/api/categories/index.ts` (new), `src/pages/api/categories/[id].ts` (new)

**Phase 2:** `src/pages/categories.astro` (new), `src/middleware.ts`, `src/pages/dashboard.astro`

## Critical Details

- Delete query always includes `.eq("user_id", userId)` — user can only delete their own categories.
- 20-cap enforced application-side via `getUserCategories` count check in `createCategory`.
- FK error `"23503"` (ON DELETE RESTRICT from expenses) surfaced as "has expenses" banner.
- Unique constraint `"23505"` surfaced as "already exists" banner.
- `PROTECTED_ROUTES` in `src/middleware.ts` must include `"/categories"`.
