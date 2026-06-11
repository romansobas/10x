import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return context.redirect(`/?error=${encodeURIComponent("Supabase is not configured")}`);
  const { error } = await supabase.auth.signInAnonymously();
  if (error) return context.redirect(`/?error=${encodeURIComponent(error.message)}`);
  return context.redirect("/dashboard");
};
