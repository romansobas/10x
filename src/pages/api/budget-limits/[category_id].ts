import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { upsertBudgetLimit, deleteBudgetLimit } from "@/lib/services/budget-limits";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/auth/signin");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return context.redirect("/auth/signin");
  }

  if (!context.params.category_id) {
    return context.redirect(`/categories?error=${encodeURIComponent("Invalid category.")}`);
  }

  const form = await context.request.formData();
  const action = form.get("_action") as string | null;

  if (action === "remove") {
    try {
      await deleteBudgetLimit(supabase, user.id, context.params.category_id);
      return context.redirect("/categories");
    } catch {
      return context.redirect(`/categories?error=${encodeURIComponent("Failed to remove limit.")}`);
    }
  }

  const limitRaw = (form.get("limit") as string | null)?.trim();
  const amount = parseFloat(limitRaw);
  if (!limitRaw || isNaN(amount) || amount <= 0) {
    return context.redirect(`/categories?error=${encodeURIComponent("Budget limit must be a positive number.")}`);
  }

  try {
    await upsertBudgetLimit(supabase, user.id, context.params.category_id, amount);
    return context.redirect("/categories");
  } catch {
    return context.redirect(`/categories?error=${encodeURIComponent("Failed to save limit.")}`);
  }
};
