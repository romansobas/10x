import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { deleteCategory } from "@/lib/services/categories";

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

  const categoryId = context.params.id;
  if (!categoryId) {
    return context.redirect(`/categories?error=${encodeURIComponent("Invalid category.")}`);
  }

  try {
    await deleteCategory(supabase, user.id, categoryId);
    return context.redirect("/categories");
  } catch (err) {
    if (err instanceof Error && err.message === "has_expenses") {
      return context.redirect(
        `/categories?error=${encodeURIComponent("This category has expenses and cannot be deleted.")}`,
      );
    }
    return context.redirect(`/categories?error=${encodeURIComponent("Failed to delete category.")}`);
  }
};
