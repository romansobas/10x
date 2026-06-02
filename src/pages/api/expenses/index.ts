import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { addExpense, getMonthExpenses } from "@/lib/services/expenses";

// Returns JSON — called via fetch() from ExpenseList, not from an HTML form,
// so redirects would be silently swallowed.
export const GET: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = context.url.searchParams;
  const now = new Date();
  const year = parseInt(params.get("year") ?? "") || now.getFullYear();
  const month = parseInt(params.get("month") ?? "") || now.getMonth() + 1;
  const categoryId = params.get("category_id") ?? undefined;

  try {
    const expenses = await getMonthExpenses(supabase, user.id, year, month, categoryId);
    return Response.json(expenses);
  } catch {
    return Response.json({ error: "Failed to fetch expenses" }, { status: 500 });
  }
};

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
