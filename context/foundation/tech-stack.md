---
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
---

## Why this stack

BudgetFlow is a 3-week after-hours solo web-app MVP with a non-negotiable per-user data isolation requirement and email+password auth (registration, sign-in, guest access, password reset). The 10x-astro-starter is the recommended default for (web-app, js) and clears all four agent-friendly gates. Supabase delivers PostgreSQL for expense/category/budget storage and Supabase Auth for the full auth flow out of the box, with Row-Level Security enforcing the strict per-account data isolation the PRD marks as a critical guardrail. Cloudflare Pages edge deployment matches the chosen deployment target and keeps mobile-browser latency low — key for the 30-second expense-entry requirement. TypeScript end-to-end means an agent can reason about schema boundaries without running the program. CI runs on GitHub Actions with auto-deploy on merge, the starter's standard shape.
