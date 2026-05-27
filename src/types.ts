export interface Category {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  user_id: string;
  category_id: string;
  amount: string; // NUMERIC(12,2) — Supabase returns as string; use parseFloat() for arithmetic
  expense_date: string; // ISO date "YYYY-MM-DD"
  created_at: string;
  updated_at: string;
}

export interface BudgetLimit {
  id: string;
  user_id: string;
  category_id: string;
  monthly_limit: string; // NUMERIC(12,2) — Supabase returns as string; use parseFloat() for arithmetic
  created_at: string;
  updated_at: string;
}
