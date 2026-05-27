import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { addExpense } from "@/lib/services/expenses";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/dashboard?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const form = await context.request.formData();
  const amountRaw = form.get("amount") as string;
  const categoryId = form.get("category_id") as string;
  const expenseDate = form.get("expense_date") as string;

  const amount = parseFloat(amountRaw);
  if (!amountRaw || isNaN(amount) || amount <= 0) {
    return context.redirect(`/dashboard?error=${encodeURIComponent("Amount must be a positive number")}`);
  }
  if (!categoryId) {
    return context.redirect(`/dashboard?error=${encodeURIComponent("Please select a category")}`);
  }
  if (!expenseDate) {
    return context.redirect(`/dashboard?error=${encodeURIComponent("Please select a date")}`);
  }

  try {
    await addExpense(supabase, { user_id: user.id, category_id: categoryId, amount, expense_date: expenseDate });
    return context.redirect("/dashboard");
  } catch {
    return context.redirect(`/dashboard?error=${encodeURIComponent("Failed to save expense")}`);
  }
};
