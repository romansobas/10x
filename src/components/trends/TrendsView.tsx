import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthlyBreakdownEntry } from "@/lib/services/expenses";

interface Props {
  monthlyData: MonthlyBreakdownEntry[];
}

type TooltipValue = string | number;

function fmt(value: TooltipValue | undefined): string {
  if (typeof value !== "number") return "0.00";
  return value.toFixed(2);
}

export default function TrendsView({ monthlyData }: Props) {
  const lastIdx = monthlyData.length - 1;
  const [idxA, setIdxA] = useState(Math.max(0, lastIdx - 1));
  const [idxB, setIdxB] = useState(lastIdx);

  if (monthlyData.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/10 p-8 text-center text-blue-100/60 backdrop-blur-xl">
        No expense data yet. Add some expenses to see your trends.
      </div>
    );
  }

  const trendData = monthlyData.map((m) => ({ label: m.label, total: m.total }));

  const monthA = monthlyData[idxA];
  const monthB = monthlyData[idxB];

  const labelA = monthA.label;
  const labelB = monthB.label;
  const showDrill = monthlyData.length >= 2 && labelA !== labelB;

  const allCategoryIds = new Set([
    ...monthA.breakdown.map((c) => c.category_id),
    ...monthB.breakdown.map((c) => c.category_id),
  ]);

  const drillData = Array.from(allCategoryIds).map((id) => {
    const a = monthA.breakdown.find((c) => c.category_id === id);
    const b = monthB.breakdown.find((c) => c.category_id === id);
    return {
      name: a?.category_name ?? b?.category_name ?? "Unknown",
      [labelA]: a?.total ?? 0,
      [labelB]: b?.total ?? 0,
    };
  });

  const chartGridStyle = "rgba(255,255,255,0.1)";
  const tickStyle = { fill: "rgba(255,255,255,0.5)", fontSize: 11 };
  const tooltipStyle = {
    contentStyle: { background: "#1e1b4b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 },
    labelStyle: { color: "rgba(255,255,255,0.8)" },
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl">
        <h2 className="mb-4 text-lg font-semibold text-white">Spending over time</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={trendData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartGridStyle} />
            <XAxis dataKey="label" tick={tickStyle} />
            <YAxis tickFormatter={fmt} tick={tickStyle} />
            <Tooltip
              formatter={(v) => [fmt(v as TooltipValue), "Total"]}
              {...tooltipStyle}
              itemStyle={{ color: "#a78bfa" }}
            />
            <Bar dataKey="total" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {showDrill && (
        <div className="rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl">
          <h2 className="mb-4 text-lg font-semibold text-white">Compare two months</h2>
          <div className="mb-4 flex gap-3">
            <select
              value={idxA}
              onChange={(e) => {
                setIdxA(Number(e.target.value));
              }}
              className="flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white focus:outline-none"
            >
              {monthlyData.map((m, i) => (
                <option key={m.label} value={i} className="bg-indigo-950">
                  {m.label}
                </option>
              ))}
            </select>
            <select
              value={idxB}
              onChange={(e) => {
                setIdxB(Number(e.target.value));
              }}
              className="flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white focus:outline-none"
            >
              {monthlyData.map((m, i) => (
                <option key={m.label} value={i} className="bg-indigo-950">
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={drillData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartGridStyle} />
              <XAxis dataKey="name" tick={{ ...tickStyle, fontSize: 10 }} />
              <YAxis tickFormatter={fmt} tick={tickStyle} />
              <Tooltip formatter={(v) => fmt(v as TooltipValue)} {...tooltipStyle} />
              <Legend wrapperStyle={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }} />
              <Bar dataKey={labelA} fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              <Bar dataKey={labelB} fill="#60a5fa" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
