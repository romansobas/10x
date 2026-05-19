---
bootstrapped_at: 2026-05-19T06:35:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: budget-flow
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: budget-flow
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

### Why this stack

BudgetFlow is a 3-week after-hours solo web-app MVP with a non-negotiable per-user data isolation requirement and email+password auth (registration, sign-in, guest access, password reset). The 10x-astro-starter is the recommended default for (web-app, js) and clears all four agent-friendly gates. Supabase delivers PostgreSQL for expense/category/budget storage and Supabase Auth for the full auth flow out of the box, with Row-Level Security enforcing the strict per-account data isolation the PRD marks as a critical guardrail. Cloudflare Pages edge deployment matches the chosen deployment target and keeps mobile-browser latency low — key for the 30-second expense-entry requirement. TypeScript end-to-end means an agent can reason about schema boundaries without running the program. CI runs on GitHub Actions with auto-deploy on merge, the starter's standard shape.

## Pre-scaffold verification

| Signal      | Value                                                                         | Severity | Notes                                          |
| ----------- | ----------------------------------------------------------------------------- | -------- | ---------------------------------------------- |
| npm package | not run                                                                       | n/a      | cmd_template starts with `git clone`; no npm CLI package to check |
| GitHub repo | not run                                                                       | n/a      | `gh` CLI not installed; could not query pushed_at for github.com/przeprogramowani/10x-astro-starter |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: clone the starter repo without keeping its upstream git history, then move files up
**Exit code**: 0
**Files moved**: ~20 top-level items (files and directories)
**Conflicts (.scaffold siblings)**: CLAUDE.md.scaffold
**.gitignore handling**: moved silently (was absent from cwd)
**.bootstrap-scaffold cleanup**: deleted

**Conflict detail**:

| File       | Resolution                                               |
| ---------- | -------------------------------------------------------- |
| CLAUDE.md  | existing wins; scaffold copy landed as `CLAUDE.md.scaffold` |

**context/ handling**: no `context/` directory in scaffold — nothing dropped; cwd `context/` preserved verbatim.

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 10 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/0/0 direct of total 0/1/10/0 — all 11 findings are in transitive dependencies (npm audit reports 0 direct vulnerable packages)

#### CRITICAL findings

None.

#### HIGH findings

| Package  | Advisory                                         | Fix available |
| -------- | ------------------------------------------------ | ------------- |
| devalue  | Svelte devalue: DoS via sparse array deserialization | Yes (`npm audit fix`) |

#### MODERATE findings

| Package                  | Advisory                                              |
| ------------------------ | ----------------------------------------------------- |
| @astrojs/check           | (no advisory title — see `npm audit` for details)     |
| @astrojs/cloudflare      | (no advisory title — see `npm audit` for details)     |
| @astrojs/language-server | (no advisory title — see `npm audit` for details)     |
| @cloudflare/vite-plugin  | (no advisory title — see `npm audit` for details)     |
| miniflare                | (no advisory title — see `npm audit` for details)     |
| volar-service-yaml       | (no advisory title — see `npm audit` for details)     |
| wrangler                 | (no advisory title — see `npm audit` for details)     |
| ws                       | ws: Uninitialized memory disclosure                   |
| yaml                     | yaml is vulnerable to Stack Overflow via deeply nested YAML |
| yaml-language-server     | (no advisory title — see `npm audit` for details)     |

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                    | Value                  |
| ----------------------- | ---------------------- |
| bootstrapper_confidence | first-class            |
| quality_override        | false                  |
| path_taken              | standard               |
| self_check_answers      | null                   |
| team_size               | solo                   |
| deployment_target       | cloudflare-pages       |
| ci_provider             | github-actions         |
| ci_default_flow         | auto-deploy-on-merge   |
| has_auth                | true                   |
| has_payments            | false                  |
| has_realtime            | false                  |
| has_ai                  | false                  |
| has_background_jobs     | false                  |

These fields were read and logged; no automated scaffolding action was taken on them in v1. A future skill (M1L4 — Memory Architecture) will use them to generate `CLAUDE.md` and `AGENTS.md` with project-specific agent context.

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review `CLAUDE.md.scaffold` — the starter ships its own CLAUDE.md; compare it with yours and merge anything relevant.
- Run `npm audit fix` to address the 1 HIGH finding (`devalue`). The MODERATE findings are in dev toolchain packages; review at your own risk tolerance.
- Copy `.env.example` to `.env` and fill in your Supabase project URL and anon key before running `npm run dev`.
