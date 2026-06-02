import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";

// Returns budget limits typed as the DB Row (monthly_limit: number per database.types.ts).
// database.types.ts and types.ts disagree on whether monthly_limit is number or string;
// this function returns the raw DB type so callers get the correct number type directly.
export async function getBudgetLimits(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase.from("budget_limits").select("*").eq("user_id", userId);
  if (error) throw error;
  return data;
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
