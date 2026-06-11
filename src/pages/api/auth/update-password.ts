import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const password = form.get("password") as string | null;

  if (!password || password.length < 6)
    return context.redirect(
      `/auth/update-password?error=${encodeURIComponent("Password must be at least 6 characters")}`,
    );

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase)
    return context.redirect(`/auth/update-password?error=${encodeURIComponent("Supabase is not configured")}`);

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return context.redirect(`/auth/update-password?error=${encodeURIComponent(error.message)}`);

  return context.redirect("/auth/signin?message=Password updated. Please sign in.");
};
