import { useState } from "react";
import { Tag } from "lucide-react";
import type { Category, ExpenseWithCategory } from "@/types";
import { SelectField } from "./SelectField";

interface ExpenseListProps {
  initialExpenses: ExpenseWithCategory[];
  categories: Category[];
  initialYear: number;
  initialMonth: number;
}

export function ExpenseList({ initialExpenses, categories, initialYear, initialMonth }: ExpenseListProps) {
  const [expenses, setExpenses] = useState(initialExpenses);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ amount: "", category_id: "", expense_date: "" });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const monthLabel = new Date(year, month - 1).toLocaleString("en-US", { month: "long", year: "numeric" });

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }));

  async function fetchExpenses(y: number, m: number, catId: string | null) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ year: String(y), month: String(m) });
      if (catId) params.set("category_id", catId);
      const res = await fetch(`/api/expenses?${params.toString()}`);
      if (!res.ok) {
        setError("Failed to load expenses.");
        return;
      }
      const data = (await res.json()) as ExpenseWithCategory[];
      setExpenses(data);
    } catch {
      setError("Failed to load expenses.");
    } finally {
      setLoading(false);
    }
  }

  async function prevMonth() {
    const newMonth = month === 1 ? 12 : month - 1;
    const newYear = month === 1 ? year - 1 : year;
    setMonth(newMonth);
    setYear(newYear);
    await fetchExpenses(newYear, newMonth, categoryId);
  }

  async function nextMonth() {
    const newMonth = month === 12 ? 1 : month + 1;
    const newYear = month === 12 ? year + 1 : year;
    setMonth(newMonth);
    setYear(newYear);
    await fetchExpenses(newYear, newMonth, categoryId);
  }

  async function handleCategoryFilter(value: string) {
    const newCatId = value === "" ? null : value;
    setCategoryId(newCatId);
    await fetchExpenses(year, month, newCatId);
  }

  function startEdit(exp: ExpenseWithCategory) {
    setEditingId(exp.id);
    setConfirmDeleteId(null);
    setEditForm({
      amount: parseFloat(exp.amount).toFixed(2),
      category_id: exp.category_id,
      expense_date: exp.expense_date,
    });
  }

  function startDeleteConfirm(expId: string) {
    setConfirmDeleteId(expId);
    setEditingId(null);
  }

  async function saveEdit(expId: string) {
    const formData = new FormData();
    formData.append("amount", editForm.amount);
    formData.append("category_id", editForm.category_id);
    formData.append("expense_date", editForm.expense_date);
    try {
      const res = await fetch(`/api/expenses/${expId}`, { method: "POST", body: formData });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Failed to update expense.");
        return;
      }
      setEditingId(null);
      await fetchExpenses(year, month, categoryId);
    } catch {
      setError("Failed to update expense.");
    }
  }

  async function confirmDelete(expId: string) {
    try {
      const res = await fetch(`/api/expenses/${expId}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Failed to delete expense.");
        return;
      }
      setConfirmDeleteId(null);
      await fetchExpenses(year, month, categoryId);
    } catch {
      setError("Failed to delete expense.");
    }
  }

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
          <button
            className="ml-2 text-red-200/60 transition-colors hover:text-red-200"
            onClick={() => {
              setError(null);
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Month navigation */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => void prevMonth()}
          className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/20"
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="flex-1 text-center text-sm font-medium text-white">{monthLabel}</span>
        <button
          onClick={() => void nextMonth()}
          className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/20"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      {/* Category filter — plain <select>, not SelectField (no label/icon chrome needed here) */}
      <div className="mb-4">
        <select
          value={categoryId ?? ""}
          onChange={(e) => void handleCategoryFilter(e.target.value)}
          className="w-full appearance-none rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white transition-colors focus:ring-2 focus:ring-purple-400 focus:outline-none"
        >
          <option value="" className="bg-gray-900 text-white">
            All categories
          </option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id} className="bg-gray-900 text-white">
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* Expense list */}
      {loading ? (
        <p className="text-center text-sm text-blue-100/50">Loading…</p>
      ) : expenses.length === 0 ? (
        <p className="text-center text-sm text-blue-100/50">No expenses this month.</p>
      ) : (
        <ul className="space-y-2">
          {expenses.map((exp) => {
            if (editingId === exp.id) {
              return (
                <li key={exp.id} className="space-y-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={editForm.amount}
                      onChange={(e) => {
                        setEditForm((f) => ({ ...f, amount: e.target.value }));
                      }}
                      className="w-24 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white placeholder-white/40 transition-colors focus:ring-2 focus:ring-purple-400 focus:outline-none"
                    />
                    <input
                      type="date"
                      value={editForm.expense_date}
                      onChange={(e) => {
                        setEditForm((f) => ({ ...f, expense_date: e.target.value }));
                      }}
                      className="flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white transition-colors focus:ring-2 focus:ring-purple-400 focus:outline-none"
                    />
                  </div>
                  <SelectField
                    id={`edit-category-${exp.id}`}
                    label="Category"
                    value={editForm.category_id}
                    onChange={(value) => {
                      setEditForm((f) => ({ ...f, category_id: value }));
                    }}
                    options={categoryOptions}
                    icon={<Tag className="size-4" />}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => void saveEdit(exp.id)}
                      className="rounded-lg bg-purple-500/80 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-purple-500"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(null);
                      }}
                      className="rounded-lg border border-white/20 bg-white/10 px-4 py-1.5 text-sm text-white transition-colors hover:bg-white/20"
                    >
                      Cancel
                    </button>
                  </div>
                </li>
              );
            }

            return (
              <li
                key={exp.id}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3"
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium text-white">{exp.category_name}</span>
                  <span className="ml-2 text-xs text-blue-100/50">{exp.expense_date}</span>
                </div>
                <div className="ml-4 flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold text-blue-200">{parseFloat(exp.amount).toFixed(2)}</span>
                  {confirmDeleteId === exp.id ? (
                    <>
                      <button
                        onClick={() => void confirmDelete(exp.id)}
                        className="text-xs text-red-300 transition-colors hover:text-red-200"
                      >
                        Confirm?
                      </button>
                      <button
                        onClick={() => {
                          setConfirmDeleteId(null);
                        }}
                        className="text-xs text-blue-100/50 transition-colors hover:text-white"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          startEdit(exp);
                        }}
                        className="text-xs text-blue-100/60 transition-colors hover:text-white"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          startDeleteConfirm(exp.id);
                        }}
                        className="text-xs text-red-300/70 transition-colors hover:text-red-300"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
