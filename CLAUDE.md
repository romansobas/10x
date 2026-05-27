# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)
- `npx astro sync` — regenerate type definitions (run after changing `astro.config.mjs`)

No test runner is configured. Pre-commit hooks run `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Architecture

**Astro 6 SSR app** with React 19 islands, Tailwind CSS 4, Supabase auth, and shadcn/ui components. Deployed to Cloudflare Workers.

Full server-side rendering (`output: "server"` in `astro.config.mjs`). All pages are server-rendered; API routes must export named HTTP-method handlers (`GET`, `POST`, etc.).

### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client per request using `@supabase/ssr` with cookie-based sessions. Returns `null` when env vars are absent (app degrades gracefully without Supabase configured).
- `src/middleware.ts` — runs on every request, resolves the current user via `supabase.auth.getUser()`, attaches to `context.locals.user`. Add paths to `PROTECTED_ROUTES` there to require authentication.
- Auth API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts` — accept `formData` POST and redirect on completion.
- Auth UI pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
- `context.locals.user` type is declared in `src/env.d.ts`.

### Environment variables

Env vars are declared via Astro's `astro:env` schema in `astro.config.mjs` and accessed via `import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server"` — **not** `import.meta.env` or `process.env`.

- Local Cloudflare dev secrets go in `.dev.vars` (copy from `.env.example`), **not** `.env`.
- Local Supabase stack: `npx supabase start` (requires Docker); credentials printed by CLI go into `.dev.vars`.
- Deploy secrets: `npx wrangler secret put SUPABASE_URL` (or set in Cloudflare dashboard).

### Key conventions

- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths).
- **Astro components** for static content/layout; **React components** only when interactivity is needed.
- **Tailwind class merging**: use `cn()` from `@/lib/utils` (clsx + tailwind-merge). Do not concatenate class strings manually.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style variant. Add new ones with `npx shadcn@latest add [name]`.
- **Shared types** (entities, DTOs) go in `src/types.ts`.
- **Services/helpers** go in `src/lib/` (or `src/lib/services/` for extracted business logic).
- **React hooks** go in `src/components/hooks/`. No Next.js directives (`"use client"` etc.).
- **Supabase migrations**: `supabase/migrations/` with naming `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs `npx astro sync` → lint → build on every push and PR to `master`. Requires `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 2

Turn one roadmap item into the first implementation cycle with the **change planning chain**:

```
/10x-roadmap -> /10x-new -> /10x-plan -> /10x-plan-review -> /10x-implement
```

`/10x-new`, `/10x-plan`, `/10x-plan-review`, and `/10x-implement` are the lesson focus. `/10x-frame` and `/10x-research` are not required rituals here; they are escalation paths introduced in the next lesson.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Change setup (lesson focus)** | |
| `/10x-new <change-id>` | You selected a roadmap item and need a stable change folder. Creates `context/changes/<change-id>/change.md` so planning, implementation, progress, commits, and later review all share one identity. Use AFTER roadmap selection, BEFORE `/10x-plan`. |
| **Planning (lesson focus)** | |
| `/10x-plan <change-id>` | You have a change folder and need a reviewable implementation plan. Reads roadmap context, foundation docs, codebase evidence, and any existing change notes; writes `plan.md` and `plan-brief.md` with phases, file contracts, success criteria, and `## Progress`. |
| **Plan readiness (lesson focus)** | |
| `/10x-plan-review <change-id>` | You have `plan.md` and need a light pre-code readiness check. Use it to catch missing end state, weak contracts, malformed progress, scope drift, or blind spots before code changes begin. |
| **Implementation (lesson focus)** | |
| `/10x-implement <change-id> phase <n>` | You have an approved plan and want to execute one phase with verification, manual gate, commit ritual, and SHA write-back to `## Progress`. |
| **Lifecycle closure** | |
| `/10x-archive <change-id>` | A change is merged or intentionally closed. Move it out of active `context/changes/` into archive state. |

### How the chain hands off

- `/10x-new` creates the durable change identity.
- `/10x-plan` turns that identity into an implementation contract.
- `/10x-plan-review` checks the plan before the agent mutates code.
- `/10x-implement` executes one planned phase, verifies, asks for manual confirmation when needed, commits, and records progress.

### Lesson boundaries

- Plan is the default router after roadmap selection. Start with `/10x-plan` unless the problem is unclear or external evidence is blocking.
- Do not run `/10x-frame + /10x-research` as ceremony for every change.
- Do not turn this lesson into a full end-to-end product build. A checkpoint with a planned and partially or fully implemented stream is valid.
- Code review of the implemented diff belongs to Lesson 3 via `/10x-impl-review`.
- Lifecycle closure via `/10x-archive` after a change is merged or intentionally closed.

### Paths used by this lesson

- `context/foundation/roadmap.md` - upstream roadmap
- `context/changes/<change-id>/change.md` - change identity
- `context/changes/<change-id>/plan.md` - implementation contract
- `context/changes/<change-id>/plan-brief.md` - compressed handoff
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` - load-bearing names registry

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
