import React, { useState } from "react";
import { DollarSign, Tag, Calendar, PlusCircle, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { FormField } from "@/components/auth/FormField";
import { SelectField } from "@/components/expenses/SelectField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import type { Category } from "@/types";

const inputBase =
  "w-full rounded-lg bg-white/10 border px-3 py-2 pl-10 text-white placeholder-white/40 focus:outline-none focus:ring-2 transition-colors";

interface Props {
  categories: Category[];
  defaultError?: string | null;
}

export default function ExpenseForm({ categories, defaultError }: Props) {
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [errors, setErrors] = useState<{ amount?: string; category?: string; date?: string }>({});

  function validate() {
    const next: typeof errors = {};
    const parsed = parseFloat(amount);
    if (!amount.trim() || isNaN(parsed) || parsed <= 0) {
      next.amount = "Enter a positive amount";
    }
    if (!categoryId) {
      next.category = "Select a category";
    }
    if (!expenseDate) {
      next.date = "Select a date";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) e.preventDefault();
  }

  return (
    <form method="POST" action="/api/expenses" onSubmit={handleSubmit} noValidate className="space-y-4">
      <div>
        <label htmlFor="amount" className="mb-1 block text-sm text-blue-100/80">
          Amount
        </label>
        <div className="relative">
          <span className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">
            <DollarSign className="size-4" />
          </span>
          <input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              if (errors.amount) setErrors((prev) => ({ ...prev, amount: undefined }));
            }}
            placeholder="0.00"
            className={cn(
              inputBase,
              errors.amount ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
            )}
          />
        </div>
        {errors.amount && (
          <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
            <CircleAlert className="size-3" />
            {errors.amount}
          </p>
        )}
      </div>

      <SelectField
        id="category_id"
        label="Category"
        value={categoryId}
        onChange={(v) => {
          setCategoryId(v);
          if (errors.category) setErrors((prev) => ({ ...prev, category: undefined }));
        }}
        options={categories.map((c) => ({ value: c.id, label: c.name }))}
        error={errors.category}
        icon={<Tag className="size-4" />}
      />

      <FormField
        id="expense_date"
        name="expense_date"
        label="Date"
        type="date"
        value={expenseDate}
        onChange={(v) => {
          setExpenseDate(v);
          if (errors.date) setErrors((prev) => ({ ...prev, date: undefined }));
        }}
        error={errors.date}
        icon={<Calendar className="size-4" />}
      />

      <ServerError message={defaultError} />

      <SubmitButton pendingText="Saving…" icon={<PlusCircle className="size-4" />}>
        Add expense
      </SubmitButton>
    </form>
  );
}
