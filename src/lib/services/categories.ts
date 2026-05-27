import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";
import type { Category } from "@/types";
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
