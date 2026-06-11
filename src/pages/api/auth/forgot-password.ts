import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = (form.get("email") as string | null)?.trim();
  if (!email) return context.redirect(`/auth/forgot-password?error=${encodeURIComponent("Email is required")}`);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase)
    return context.redirect(`/auth/forgot-password?error=${encodeURIComponent("Supabase is not configured")}`);

  const origin = context.request.headers.get("origin") ?? "";
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/update-password`,
  });

  // Always redirect to confirmation — don't reveal whether the email exists.
  return context.redirect("/auth/password-reset-sent");
};
