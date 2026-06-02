import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";
import type { ExpenseWithCategory } from "@/types";

export async function addExpense(
  supabase: SupabaseClient<Database>,
  payload: { user_id: string; category_id: string; amount: number; expense_date: string },
): Promise<void> {
  const { error } = await supabase.from("expenses").insert(payload);
  if (error) throw error;
}

export interface CategoryTotal {
  category_id: string;
  category_name: string;
  total: number;
}

export async function getMonthBreakdown(
  supabase: SupabaseClient<Database>,
  userId: string,
  year: number,
  month: number,
): Promise<CategoryTotal[]> {
  const mm = String(month).padStart(2, "0");
  const firstDay = `${year}-${mm}-01`;
  const lastDayNum = new Date(year, month, 0).getDate();
  const lastDay = `${year}-${mm}-${String(lastDayNum).padStart(2, "0")}`;

  const [expensesResult, categoriesResult] = await Promise.all([
    supabase
      .from("expenses")
      .select("amount, category_id")
      .eq("user_id", userId)
      .gte("expense_date", firstDay)
      .lte("expense_date", lastDay),
    supabase.from("categories").select("id, name").eq("user_id", userId),
  ]);

  if (expensesResult.error) throw expensesResult.error;
  if (categoriesResult.error) throw categoriesResult.error;

  const catMap = new Map(categoriesResult.data.map((c) => [c.id, c.name]));

  const totals = new Map<string, number>();
  for (const exp of expensesResult.data) {
    const prev = totals.get(exp.category_id) ?? 0;
    totals.set(exp.category_id, prev + parseFloat(String(exp.amount)));
  }

  return Array.from(totals.entries())
    .map(([category_id, total]) => ({
      category_id,
      category_name: catMap.get(category_id) ?? "Unknown",
      total,
    }))
    .sort((a, b) => b.total - a.total);
}

export async function getMonthExpenses(
  supabase: SupabaseClient<Database>,
  userId: string,
  year: number,
  month: number,
  categoryId?: string,
): Promise<ExpenseWithCategory[]> {
  const mm = String(month).padStart(2, "0");
  const firstDay = `${year}-${mm}-01`;
  const lastDayNum = new Date(year, month, 0).getDate();
  const lastDay = `${year}-${mm}-${String(lastDayNum).padStart(2, "0")}`;

  let expensesQuery = supabase
    .from("expenses")
    .select("*")
    .eq("user_id", userId)
    .gte("expense_date", firstDay)
    .lte("expense_date", lastDay)
    .order("expense_date", { ascending: false });

  if (categoryId) {
    expensesQuery = expensesQuery.eq("category_id", categoryId);
  }

  const [expensesResult, categoriesResult] = await Promise.all([
    expensesQuery,
    supabase.from("categories").select("id, name").eq("user_id", userId),
  ]);

  if (expensesResult.error) throw expensesResult.error;
  if (categoriesResult.error) throw categoriesResult.error;

  const catMap = new Map(categoriesResult.data.map((c) => [c.id, c.name]));

  return expensesResult.data.map((exp) => ({
    ...exp,
    amount: String(exp.amount),
    category_name: catMap.get(exp.category_id) ?? "Unknown",
  }));
}

export async function updateExpense(
  supabase: SupabaseClient<Database>,
  userId: string,
  expenseId: string,
  payload: { category_id: string; amount: number; expense_date: string },
): Promise<void> {
  const { error } = await supabase.from("expenses").update(payload).eq("id", expenseId).eq("user_id", userId);
  if (error) throw error;
}

export async function deleteExpense(
  supabase: SupabaseClient<Database>,
  userId: string,
  expenseId: string,
): Promise<void> {
  const { error } = await supabase.from("expenses").delete().eq("id", expenseId).eq("user_id", userId);
  if (error) throw error;
}
