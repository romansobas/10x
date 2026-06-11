---
change_id: auth-extended
title: Extended auth — guest access and password reset
status: planned
created: 2026-06-11
prd_refs: FR-015, FR-016
roadmap_id: S-05
---

# Plan: auth-extended

## Objective

Deliver two auth flows that complete the S-05 roadmap slice:

1. **Guest access (FR-015)** — user can explore the full dashboard without creating an account. Uses Supabase anonymous auth so the existing middleware/dashboard flow works unchanged. The anonymous session can be upgraded to a permanent account on signup.
2. **Password reset (FR-016)** — user can recover a forgotten password via email. Standard Supabase email-link reset, consistent with the existing confirm-email UX pattern.

## Architecture decisions

### Guest mode: Supabase anonymous auth

`supabase.auth.signInAnonymously()` creates a real anonymous `User` object. The middleware resolves it normally via `getUser()`, `context.locals.user` is set, and the dashboard renders (with an empty state if domain tables aren't seeded yet). No middleware changes required.

The guest banner is server-rendered in `dashboard.astro` based on `user.is_anonymous` — no new React island needed.

On signup from guest state, `supabase.auth.updateUser({ email, password })` upgrades the anonymous user to a permanent one, preserving any seeded data. This replaces the current `signUp` call when an anonymous session is active.

### Password reset: Supabase email-link flow

Two steps:
1. User submits email → `resetPasswordForEmail(email, { redirectTo })` → Supabase sends link
2. User clicks link → lands on `/auth/update-password` with access token in URL fragment → submits new password → `updateUser({ password })`

The redirect URL must be allowed in the Supabase dashboard (Auth → URL Configuration → Redirect URLs). For local dev the URL is `http://localhost:4321/auth/update-password`.

## Scope

**In scope:**
- "Try as guest" CTA on landing page (`src/components/Welcome.astro`)
- `POST /api/auth/guest` endpoint
- Guest upgrade path on signup (detect anonymous session, call `updateUser` instead of `signUp`)
- Guest banner on dashboard (server-rendered, no island)
- "Forgot password?" link on signin form
- `src/pages/auth/forgot-password.astro` + `POST /api/auth/forgot-password`
- `src/pages/auth/password-reset-sent.astro` (confirmation)
- `src/pages/auth/update-password.astro` + `POST /api/auth/update-password`

**Out of scope:**
- Guest data seeding (domain tables are outside this slice; the dashboard empty state is the graceful fallback)
- Social/OAuth login
- Session expiry / refresh logic
- Rate limiting on reset endpoint

## Affected files

| File | Change |
|------|--------|
| `src/components/Welcome.astro` | Add "Try as guest" CTA button |
| `src/pages/api/auth/guest.ts` | New — `POST` handler calling `signInAnonymously()` |
| `src/pages/api/auth/signup.ts` | Detect anonymous session → `updateUser` instead of `signUp` |
| `src/pages/api/auth/forgot-password.ts` | New — `POST` calling `resetPasswordForEmail()` |
| `src/pages/api/auth/update-password.ts` | New — `POST` calling `updateUser({ password })` |
| `src/pages/auth/forgot-password.astro` | New — email input page |
| `src/pages/auth/password-reset-sent.astro` | New — confirmation page after email sent |
| `src/pages/auth/update-password.astro` | New — new-password input page (requires valid reset session) |
| `src/pages/dashboard.astro` | Add guest banner (server-rendered) |
| `src/pages/auth/signin.astro` | Add "Forgot password?" link |
| `src/components/auth/SignInForm.tsx` | Add "Forgot password?" link in form |
| `src/components/auth/ForgotPasswordForm.tsx` | New — email input form component |
| `src/components/auth/UpdatePasswordForm.tsx` | New — new-password form component |

## Phase 1: Guest access

### Goal
User can click "Try as guest" on the landing page, land on the dashboard as an anonymous user, and see a persistent banner inviting them to create an account.

### Steps

**1.1** — `src/pages/api/auth/guest.ts`

New API route. Calls `signInAnonymously()`, sets session cookie, redirects to `/dashboard`.

```ts
export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return context.redirect(`/?error=${encodeURIComponent("Supabase is not configured")}`);
  const { error } = await supabase.auth.signInAnonymously();
  if (error) return context.redirect(`/?error=${encodeURIComponent(error.message)}`);
  return context.redirect("/dashboard");
};
```

**1.2** — `src/components/Welcome.astro`

Add a "Try as guest" button as a `<form method="POST" action="/api/auth/guest">` next to the existing Sign In / Sign Up CTAs. Style consistent with the existing border-button variant.

**1.3** — `src/pages/dashboard.astro`

Add a guest banner rendered server-side when `user.is_anonymous`. The banner is a dismissible-looking (but non-dismissible for simplicity) info bar at the top of the dashboard content area:

```
⚡ You're exploring as a guest. Create an account to save your data.
[Create account →]
```

The `is_anonymous` property is available on the Supabase `User` object.

**1.4** — `src/pages/api/auth/signup.ts`

Detect active anonymous session before creating a new account. If `context.locals.user?.is_anonymous` is true, call `supabase.auth.updateUser({ email, password })` to upgrade the anonymous user rather than creating a new one. Both paths redirect to `/auth/confirm-email` on success.

### Success criteria

- Clicking "Try as guest" → dashboard loads with guest banner, no account created in the authenticated users list
- Supabase `auth.users` shows a new anonymous user after guest login
- Guest banner links to `/auth/signup`
- Signing up from guest session → same user UID is preserved in `auth.users` (upgraded, not replaced)
- Non-anonymous users do not see the guest banner
- Signout from guest session clears the anonymous session

---

## Phase 2: Password reset

### Goal
User can request a password reset from the signin page, receive an email, and set a new password.

### Steps

**2.1** — `src/components/auth/SignInForm.tsx`

Add a "Forgot password?" link below the password field, navigating to `/auth/forgot-password`. Style: `text-sm text-purple-300 hover:underline`, right-aligned.

**2.2** — `src/pages/auth/forgot-password.astro` + `src/components/auth/ForgotPasswordForm.tsx`

New page with an email input form. `ForgotPasswordForm` mirrors the structure of `SignInForm` (uses `FormField`, `SubmitButton`, `ServerError`). On submit: `POST /api/auth/forgot-password`.

**2.3** — `src/pages/api/auth/forgot-password.ts`

```ts
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = (form.get("email") as string)?.trim();
  if (!email) return context.redirect(`/auth/forgot-password?error=${encodeURIComponent("Email is required")}`);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return context.redirect(`/auth/forgot-password?error=${encodeURIComponent("Supabase is not configured")}`);

  const origin = context.request.headers.get("origin") ?? "";
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/update-password`,
  });
  // Always redirect to confirmation — don't reveal whether the email exists
  return context.redirect("/auth/password-reset-sent");
};
```

**2.4** — `src/pages/auth/password-reset-sent.astro`

Confirmation page reusing the same card layout as `confirm-email.astro`:
- Heading: "Check your email"
- Body: "If that address has an account, we've sent a password reset link."
- Link: "Back to sign in"

**2.5** — `src/pages/auth/update-password.astro` + `src/components/auth/UpdatePasswordForm.tsx`

New page. The Supabase reset link lands here with the access token in the URL hash (`#access_token=...&type=recovery`). The `UpdatePasswordForm` React component reads the token from `window.location.hash` via `useEffect`, calls `supabase.auth.setSession()` to activate the recovery session, then submits the new password to `POST /api/auth/update-password`.

**2.6** — `src/pages/api/auth/update-password.ts`

```ts
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const password = form.get("password") as string;
  if (!password || password.length < 6)
    return context.redirect(`/auth/update-password?error=${encodeURIComponent("Password must be at least 6 characters")}`);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return context.redirect(`/auth/update-password?error=${encodeURIComponent("Supabase is not configured")}`);

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return context.redirect(`/auth/update-password?error=${encodeURIComponent(error.message)}`);
  return context.redirect("/auth/signin?message=Password updated. Please sign in.");
};
```

### Success criteria

- "Forgot password?" link visible on sign-in page
- Submitting an email → redirects to `/auth/password-reset-sent` (regardless of whether email exists — no enumeration)
- Supabase sends an email containing a link to `/auth/update-password`
- Landing on `/auth/update-password` without a valid recovery token → redirect to `/auth/signin` (guard in `UpdatePasswordForm`)
- Submitting a new password via the recovery link → session updated, redirect to signin with success message
- Short password (< 6 chars) → error shown, no update attempted

---

## Risk register

| Risk | Mitigation |
|------|------------|
| Anonymous user quota — Supabase free tier limits anonymous users | Out of scope for MVP; add cleanup cron when real traffic warrants it |
| Token in URL hash not readable server-side | `UpdatePasswordForm` reads hash client-side, sets session, then posts form; server only calls `updateUser` with active cookie session |
| Email enumeration on reset | `/api/auth/forgot-password` always redirects to confirmation regardless of whether email exists |
| Supabase redirect URL not whitelisted | Documented in Phase 2 setup note; dev and production URLs both need to be added in Supabase dashboard |
| `is_anonymous` not in Supabase user type | It is — present on `User` since `@supabase/supabase-js` v2.39+ |

## References

- PRD: `context/foundation/prd.md` — FR-015, FR-016
- Roadmap: `context/foundation/roadmap.md` — S-05
- Supabase anonymous auth: https://supabase.com/docs/guides/auth/auth-anonymous
- Supabase password recovery: https://supabase.com/docs/guides/auth/passwords#resetting-a-users-password-forgot-password
- Existing auth pattern: `src/pages/api/auth/signin.ts`, `src/pages/auth/confirm-email.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Guest access

#### Automated

- [x] 1.1 POST /api/auth/guest endpoint — d8d2b11
- [x] 1.2 "Try as guest" CTA on landing page — d8d2b11
- [x] 1.3 Guest banner on dashboard — d8d2b11
- [x] 1.4 Signup upgrade path for anonymous users — d8d2b11

### Phase 2: Password reset

#### Automated

- [x] 2.1 "Forgot password?" link in SignInForm — f8e1462
- [x] 2.2 Forgot-password page and form component — f8e1462
- [x] 2.3 POST /api/auth/forgot-password endpoint — f8e1462
- [x] 2.4 Password-reset-sent confirmation page — f8e1462
- [x] 2.5 Update-password page and form component — f8e1462
- [x] 2.6 POST /api/auth/update-password endpoint — f8e1462

#### Manual

- [x] 2.7 Verify reset email arrives and link opens update-password page — f8e1462
- [x] 2.8 Verify Supabase redirect URL is whitelisted in project settings — f8e1462
