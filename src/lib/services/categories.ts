import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";
import type { Category, CategoryWithCount } from "@/types";
import { DEFAULT_CATEGORY_NAMES } from "@/lib/defaults";

export async function getUserCategories(supabase: SupabaseClient<Database>, userId: string): Promise<Category[]> {
  const { data, error } = await supabase.from("categories").select("*").eq("user_id", userId).order("name");
  if (error) throw error;
  return data;
}

export async function seedDefaultCategories(supabase: SupabaseClient<Database>, userId: string): Promise<void> {
  const rows = DEFAULT_CATEGORY_NAMES.map((name) => ({ name, user_id: userId }));
  const { error } = await supabase.from("categories").upsert(rows, { ignoreDuplicates: true });
  if (error) throw error;
}

export async function getCategoriesWithExpenseCounts(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<CategoryWithCount[]> {
  const [categoriesResult, expensesResult] = await Promise.all([
    supabase.from("categories").select("*").eq("user_id", userId).order("name"),
    supabase.from("expenses").select("category_id").eq("user_id", userId),
  ]);

  if (categoriesResult.error) throw categoriesResult.error;
  if (expensesResult.error) throw expensesResult.error;

  const counts = new Map<string, number>();
  for (const exp of expensesResult.data) {
    counts.set(exp.category_id, (counts.get(exp.category_id) ?? 0) + 1);
  }

  return categoriesResult.data.map((cat) => ({
    ...cat,
    expense_count: counts.get(cat.id) ?? 0,
  }));
}

export async function createCategory(supabase: SupabaseClient<Database>, userId: string, name: string): Promise<void> {
  const existing = await getUserCategories(supabase, userId);
  if (existing.length >= 20) throw new Error("cap");

  const { error } = await supabase.from("categories").insert({ user_id: userId, name });
  if (!error) return;
  if (error.code === "23505") throw new Error("duplicate");
  throw error;
}

export async function deleteCategory(
  supabase: SupabaseClient<Database>,
  userId: string,
  categoryId: string,
): Promise<void> {
  const { error } = await supabase.from("categories").delete().eq("id", categoryId).eq("user_id", userId);
  if (!error) return;
  if (error.code === "23503") throw new Error("has_expenses");
  throw error;
}
