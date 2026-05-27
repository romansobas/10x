# Deploy Plan — BudgetFlow → Cloudflare Pages

**Date:** 2026-05-20  
**Project:** budget-flow  
**Platform:** Cloudflare Pages  
**Production URL:** https://budget-flow.pages.dev  
**Wrangler version:** 4.90.0  
**Stack:** Astro 6 SSR + @astrojs/cloudflare adapter + Supabase  

---

## Setup wykonany (jednorazowo)

- [x] `npx wrangler login` — autoryzacja konta Cloudflare
- [x] `npx wrangler pages project create budget-flow --production-branch master`
- [x] `npm run build && npx wrangler pages deploy ./dist --project-name budget-flow` — pierwszy deploy
- [x] `npx wrangler pages secret put SUPABASE_URL --project-name budget-flow`
- [x] `npx wrangler pages secret put SUPABASE_KEY --project-name budget-flow`
- [x] Redeploy po ustawieniu sekretów
- [x] Cloudflare API Token (Pages: Edit) utworzony na dash.cloudflare.com/profile/api-tokens
- [x] GitHub secrets dodane: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`

## CI/CD

Auto-deploy aktywny: każdy push do `master` triggeruje `.github/workflows/ci.yml`:
1. `npm ci` → `npx astro sync` → `npm run lint` → `npm run build`
2. `npx wrangler pages deploy ./dist --project-name budget-flow` (tylko na push, nie na PR)

## Rollback

```bash
npx wrangler pages deployment list --project-name budget-flow
# skopiuj ID poprzedniego deployu, następnie w dashboardzie: "Promote to production"
```

## Logi

```bash
npx wrangler pages deployment tail --project-name budget-flow
npx wrangler pages deployment tail --project-name budget-flow --status error
```

## Sekrety

Zarządzane przez Cloudflare Pages (Settings → Environment variables):
- `SUPABASE_URL` — URL instancji Supabase
- `SUPABASE_KEY` — anon key Supabase

Rotacja: `npx wrangler pages secret put <NAME> --project-name budget-flow`, potem redeploy.

## Znane ograniczenia (free tier)

- 100k requestów/dzień
- 10ms CPU limit per request — przy przekroczeniu błąd 522; upgrade do Workers Paid ($5/mo) rozwiązuje
- Preview deploye są publiczne — przed udostępnieniem z danymi skonfiguruj Cloudflare Access
