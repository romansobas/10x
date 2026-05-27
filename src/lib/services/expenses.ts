import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";

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
