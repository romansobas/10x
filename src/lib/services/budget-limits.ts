import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";
import type { BudgetLimit } from "@/types";

export async function getBudgetLimits(supabase: SupabaseClient<Database>, userId: string): Promise<BudgetLimit[]> {
  const { data, error } = await supabase.from("budget_limits").select("*").eq("user_id", userId);
  if (error) throw error;
  return data as unknown as BudgetLimit[];
}

export async function upsertBudgetLimit(
  supabase: SupabaseClient<Database>,
  userId: string,
  categoryId: string,
  amount: number,
): Promise<void> {
  const { error } = await supabase
    .from("budget_limits")
    .upsert({ user_id: userId, category_id: categoryId, monthly_limit: amount }, { onConflict: "user_id,category_id" });
  if (error) throw error;
}

export async function deleteBudgetLimit(
  supabase: SupabaseClient<Database>,
  userId: string,
  categoryId: string,
): Promise<void> {
  const { error } = await supabase.from("budget_limits").delete().eq("user_id", userId).eq("category_id", categoryId);
  if (error) throw error;
}
