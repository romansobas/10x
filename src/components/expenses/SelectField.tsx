import type { ReactNode } from "react";
import { ChevronDown, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const selectBase =
  "w-full appearance-none rounded-lg bg-white/10 border px-3 py-2 pl-10 pr-10 text-white focus:outline-none focus:ring-2 transition-colors";

interface Option {
  value: string;
  label: string;
}

interface SelectFieldProps {
  id: string;
  name?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  error?: string;
  icon: ReactNode;
}

export function SelectField({ id, name, label, value, onChange, options, error, icon }: SelectFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-blue-100/80">
        {label}
      </label>
      <div className="relative">
        <span className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">{icon}</span>
        <select
          id={id}
          name={name ?? id}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          className={cn(
            selectBase,
            error ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
          )}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-gray-900 text-white">
              {opt.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-white/40">
          <ChevronDown className="size-4" />
        </span>
      </div>
      {error && (
        <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
          <CircleAlert className="size-3" />
          {error}
        </p>
      )}
    </div>
  );
}
