import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { createCategory } from "@/lib/services/categories";

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

  const form = await context.request.formData();
  const name = (form.get("name") as string | null)?.trim() ?? "";

  if (!name) {
    return context.redirect(`/categories?error=${encodeURIComponent("Category name is required.")}`);
  }
  if (name.length > 50) {
    return context.redirect(`/categories?error=${encodeURIComponent("Category name must be 50 characters or less.")}`);
  }

  try {
    await createCategory(supabase, user.id, name);
    return context.redirect("/categories");
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "cap") {
        return context.redirect(`/categories?error=${encodeURIComponent("Maximum 20 categories reached.")}`);
      }
      if (err.message === "duplicate") {
        return context.redirect(`/categories?error=${encodeURIComponent("A category with that name already exists.")}`);
      }
    }
    return context.redirect(`/categories?error=${encodeURIComponent("Failed to create category.")}`);
  }
};
