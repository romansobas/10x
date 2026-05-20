---
project: BudgetFlow
researched_at: 2026-05-19
recommended_platform: Cloudflare Workers + Pages
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6
  runtime: Cloudflare Workers (workerd)
  database: Supabase (external Postgres)
---

## Recommendation

**Deploy on Cloudflare Workers + Pages.**

The project was bootstrapped with `@astrojs/cloudflare` and `wrangler.jsonc` already in place — deployment is a single `npx wrangler pages deploy` away with no adapter swap or config migration. Cloudflare's free tier covers 100k requests/day (≈3M/month), which exceeds BudgetFlow's entire expected MVP traffic at $0/month, satisfying the cost-minimization priority. The developer already has Cloudflare familiarity, and Cloudflare's suite of GA MCP servers (15+, with a formal Anthropic partnership) gives Claude Code structured tool-use access to the platform across the full operational lifecycle.

## Platform Comparison

| Platform | CLI-first | Managed | Agent docs | Deploy API | MCP | Score |
|---|---|---|---|---|---|---|
| **Cloudflare** | Pass | Pass | Pass | Pass | Pass | **5/5** |
| Netlify | Partial | Pass | Pass | Pass | Pass | **4/5** |
| Render | Partial | Pass | Pass | Pass | Pass | **4/5** |
| Railway | Partial | Pass | Pass | Pass | Partial | **3.5/5** |
| Vercel | Pass | Pass | Partial | Pass | Partial | **3.5/5** |
| Fly.io | Partial | Pass | Partial | Pass | Partial | **3/5** |

### Shortlisted Platforms

#### 1. Cloudflare Workers + Pages (Recommended)

Scores 5/5 across all criteria. The `@astrojs/cloudflare` adapter is already installed and configured in this project — no migration required. Free tier (100k requests/day, D1, KV, R2, Queues all included) eliminates MVP hosting cost entirely. `wrangler` CLI handles deploy, rollback (`wrangler rollback [VERSION_ID]`), and live log tailing (`wrangler tail`) without a dashboard. Documentation is available as per-product `llms.txt` files at `developers.cloudflare.com/workers/llms.txt` and as Markdown via `Accept: text/markdown` on any docs page. The GA MCP suite (15+ servers at `mcp.cloudflare.com`) covers Workers, D1, R2, DNS, Observability, and 2,500+ API endpoints — with a formal Anthropic/Claude partnership announced May 2025. Cost at MVP scale: $0 (free tier); $5/month (Workers Paid) if CPU limits are hit.

#### 2. Netlify

Scores 4/5: strong Astro 6 support (confirmed "just works" on day one), GA MCP server (`@netlify/mcp`, Feb 2025), `llms.txt` published, and Netlify DB (serverless Postgres, GA April 2026) for co-location. CLI rollback is the gap — `netlify deploy` has no rollback subcommand; reverting requires the dashboard. Credit-based billing is less transparent than Cloudflare's per-request model. Runner-up if Cloudflare's workerd constraints become blockers.

#### 3. Railway

Scores 3.5/5: excellent co-location (one-click Postgres/MySQL/Redis in the same project), persistent containers (no serverless cold-start concern), Astro 6 supported via Railpack auto-detection, `railway.com/llms.txt` published. Gaps: MCP server is explicitly labeled "work in progress" (beta), rollback is dashboard-only, and the Hobby plan's 10-minute sleep-on-inactivity can kill user-facing requests unless disabled. Cost: $5/month Hobby base + Postgres usage.

## Anti-Bias Cross-Check: Cloudflare Workers + Pages

### Devil's Advocate — Weaknesses

1. **workerd ≠ Node.js**: Any npm dependency using Node.js built-ins (`fs`, `child_process`, `stream`) can fail silently. `nodejs_compat` resolves many cases but not all — every new dependency added during development is a potential runtime incompatibility that only surfaces post-deploy, not locally.
2. **10ms CPU budget per request (free tier) is easy to exceed**: Complex SSR pages with multiple Supabase calls, any synchronous compute, or third-party SDKs can push past the limit. When exceeded, the request dies with a `522` error and no user-visible message — diagnosis requires `wrangler tail`.
3. **`compatibility_date` drift**: Incrementing `compatibility_date` silently enables new runtime behaviors. A routine `npm update wrangler` without reviewing Cloudflare's changelog can activate URL-parsing or header-handling changes that break auth flows in edge regions — and staging on `localhost` won't catch it.
4. **Preview deployments are publicly accessible by default**: Every PR gets a unique Pages URL. For an app handling personal financial data, unauthenticated previews are a data exposure risk without Cloudflare Access configured.
5. **Vendor lock-in at runtime level**: Migrating away from Cloudflare requires swapping the Astro adapter and rewriting any Cloudflare-specific binding code (D1, KV, R2). Exit cost is non-trivial if the platform proves unsuitable.

### Pre-Mortem — How This Could Fail

The team shipped BudgetFlow on Cloudflare Pages in week 3. By month 2, a PDF-export feature was requested. The chosen npm package used `fs` and `stream` internally — it worked locally but threw `Module not found: fs` in workerd despite `nodejs_compat`. Debugging took three days; the package had never been tested in a Workers environment, and the `prerenderEnvironment: 'node'` escape hatch masked the issue during static builds. Meanwhile, a routine `npm update` bumped wrangler and silently incremented effective runtime behaviors via `compatibility_date`, activating a new URL-parsing behavior that broke auth redirects in one edge region for two days — diagnosed only after a user report, since `localhost` dev never exercises edge-region routing. Finally, 500+ preview deployments accumulated over six months; the Cloudflare org project cap was hit, and cleanup required manual API calls the MCP server couldn't perform without dashboard confirmation.

### Unknown Unknowns

- **Supabase + workerd requires exact `@supabase/ssr` cookie wiring**: Missing or incorrect `getAll`/`setAll` cookie handlers causes silently unauthenticated requests — `supabase.auth.getUser()` returns `null` with no thrown error, not a 401. This project already has the correct wiring in `src/lib/supabase.ts`, but any refactor of that file must preserve the exact `parseCookieHeader` pattern.
- **Free tier CPU limit (10ms) vs. paid tier (30ms)**: The jump in CPU budget when upgrading to Workers Paid ($5/mo) fixes mysterious `522` timeouts — but teams diagnose Supabase and network configs for hours before discovering the real cause.
- **`wrangler pages deploy` vs `wrangler deploy` are NOT interchangeable**: Pages projects use a different command than Workers scripts. Using the wrong command produces a confusing error that doesn't name the mismatch. Always use `wrangler pages deploy ./dist` for this project.
- **Pages Functions and Workers share the same request quota but have separate dashboard views**: Monitoring "Workers requests" in the dashboard misses Pages Functions traffic — easy to be surprised by overages on the paid plan.
- **`prerenderEnvironment: 'node'` breaks local dev parity**: Using this escape hatch for a CJS dependency means build-time SSG runs in Node.js but runtime runs in workerd — subtle global-scope or timing differences produce build-passes/runtime-fails bugs that don't reproduce locally.

## Operational Story

- **Preview deploys**: Every PR creates a unique `*.pages.dev` preview URL automatically via the GitHub integration. These are **publicly accessible without authentication** — configure Cloudflare Access (free on Workers Paid plan) to restrict access to preview branches before sharing any financial test data. Fork PRs from external contributors do not trigger preview builds by default.
- **Secrets**: `SUPABASE_URL` and `SUPABASE_KEY` are stored as Cloudflare Pages environment variables (dashboard: Settings → Environment variables, or CLI: `npx wrangler pages secret put SUPABASE_URL`). Secrets are scoped per environment (preview vs production). Rotation: update the secret value in the dashboard or via CLI, then redeploy — the new value is picked up on the next deployment without a code change.
- **Rollback**: `npx wrangler rollback` reverts Workers to the prior version. For Pages, `npx wrangler pages deployment list` shows all deployments; redeploy any prior commit hash via the dashboard "Promote to production" button. Typical time-to-revert: 30–60 seconds. Database migrations (Supabase) do not roll back automatically — always write reversible migrations.
- **Approval**: Deploys to production via CI or `wrangler pages deploy` are unattended. Actions that require a human: promoting a specific past deployment to production in the dashboard, rotating the primary Supabase key (requires both Cloudflare and Supabase dashboard access), increasing account limits, and configuring Cloudflare Access rules.
- **Logs**: `npx wrangler tail` (Workers) or `npx wrangler pages deployment tail` (Pages) streams live runtime logs. Filter by status: `--status error`. For structured queries, `wrangler tail --format json | jq`. MCP tool: `cloudflare-observability` MCP server at `observability.mcp.cloudflare.com/mcp` exposes logs, metrics, and traces as structured tool calls.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| npm dependency incompatible with workerd runtime | Devil's advocate | M | M | Test every new dependency with `wrangler dev --remote` before merging; prefer pure-ESM packages |
| Request killed by 10ms CPU limit (free tier) | Devil's advocate | M | H | Monitor `wrangler tail` for `522` errors; upgrade to Workers Paid ($5/mo) immediately if triggered |
| `compatibility_date` behavior change breaks auth in edge region | Pre-mortem | L | H | Pin `compatibility_date` in `wrangler.jsonc` and only increment deliberately after reading the Cloudflare changelog for that date range |
| Preview deployment exposes financial data publicly | Devil's advocate | M | H | Configure Cloudflare Access for preview branches before populating with real data; document this as a Day-1 setup step |
| Vendor lock-in makes platform migration expensive | Devil's advocate | L | M | Keep Cloudflare-specific bindings (D1, KV, R2) behind a thin abstraction layer in `src/lib/` so the interface can be swapped without touching pages or components |
| Supabase auth silent null on misconfigured cookie wiring | Unknown unknowns | L | H | Do not refactor `src/lib/supabase.ts` without end-to-end auth smoke test; the `parseCookieHeader` pattern is load-bearing |
| `wrangler pages deploy` vs `wrangler deploy` command confusion | Unknown unknowns | M | L | Document the correct deploy command (`wrangler pages deploy ./dist`) in `AGENTS.md` and CI workflow |
| Preview deployment project cap (500/org) | Pre-mortem | L | M | Set up automatic deployment cleanup via Cloudflare's API or the GitHub Action `delete-preview` webhook when PRs are closed |

## Getting Started

This project is already configured for Cloudflare Pages. The `wrangler.jsonc` and `@astrojs/cloudflare` adapter are in place.

1. **Authenticate**: `npx wrangler login` — opens a browser OAuth flow; token is stored locally.
2. **Create the Pages project** (first time only): `npx wrangler pages project create budget-flow --production-branch master`
3. **Build and deploy**:
   ```bash
   npm run build
   npx wrangler pages deploy ./dist --project-name budget-flow
   ```
4. **Set secrets** (required for auth to work in production):
   ```bash
   npx wrangler pages secret put SUPABASE_URL --project-name budget-flow
   npx wrangler pages secret put SUPABASE_KEY --project-name budget-flow
   ```
5. **Tail live logs** after deploy to confirm auth and routes are healthy:
   ```bash
   npx wrangler pages deployment tail --project-name budget-flow
   ```

For CI auto-deploy on merge (already configured in `.github/workflows/ci.yml`): add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as GitHub repository secrets. The CI workflow currently runs lint + build; add a `wrangler pages deploy` step after the build step.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup beyond the existing GitHub Actions workflow
- Production-scale architecture (multi-region, HA, DR)
