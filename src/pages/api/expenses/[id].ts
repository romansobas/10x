import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { updateExpense, deleteExpense } from "@/lib/services/expenses";

export const POST: APIRoute = async (context) => {
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

  const form = await context.request.formData();
  const amountRaw = form.get("amount") as string;
  const categoryId = form.get("category_id") as string;
  const expenseDate = form.get("expense_date") as string;

  const amount = parseFloat(amountRaw);
  if (!amountRaw || isNaN(amount) || amount <= 0) {
    return Response.json({ error: "Amount must be a positive number." }, { status: 400 });
  }
  if (!categoryId) {
    return Response.json({ error: "Please select a category." }, { status: 400 });
  }
  if (!expenseDate) {
    return Response.json({ error: "Please select a date." }, { status: 400 });
  }

  if (!context.params.id) {
    return Response.json({ error: "Invalid expense." }, { status: 400 });
  }

  try {
    await updateExpense(supabase, user.id, context.params.id, {
      category_id: categoryId,
      amount,
      expense_date: expenseDate,
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Failed to update expense." }, { status: 500 });
  }
};

export const DELETE: APIRoute = async (context) => {
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

  if (!context.params.id) {
    return Response.json({ error: "Invalid expense." }, { status: 400 });
  }

  try {
    await deleteExpense(supabase, user.id, context.params.id);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Failed to delete expense." }, { status: 500 });
  }
};
