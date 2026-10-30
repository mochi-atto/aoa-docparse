import type { DashboardViewProps } from "./viewTypes";
import { UTIL_COLOR } from "./constants";
import { money } from "./helpers";

export function FinancesTab({ utilities, estMonthly, bldgFinances, todos }: Pick<DashboardViewProps, "utilities" | "estMonthly" | "bldgFinances" | "todos">) {
  const addressed = todos.filter((t) => t.priority === "blue");
  if (utilities.length === 0) return <div className="bg-white rounded-xl border border-stone-200 p-12 text-center"><p className="text-stone-400 text-sm">Upload utility data to see financial estimates.</p></div>;
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-stone-200 p-6">
        <p className="text-xs text-stone-400 mb-1">Estimated Monthly Cost</p>
        <p className="text-3xl font-bold text-stone-800 tabular-nums" style={{ fontFamily: "'Fraunces', serif" }}>{money(estMonthly.total)}</p>
      </div>
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-stone-100"><h2 className="text-base font-semibold text-stone-800" style={{ fontFamily: "'Fraunces', serif" }}>By Utility Type</h2></div>
        <div className="divide-y divide-stone-100">{estMonthly.items.map((item) => (
          <div key={item.type} className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3"><div className="w-3 h-3 rounded-full" style={{ background: UTIL_COLOR[item.type] || "#a1a1aa" }} /><div><p className="text-sm font-medium text-stone-700 capitalize">{item.type}</p><p className="text-xs text-stone-400">{item.count} bills</p></div></div>
            <div className="text-right"><p className="text-sm font-semibold text-stone-800 tabular-nums">{money(item.avg)}/mo</p><p className="text-xs text-stone-400 tabular-nums">{money(item.min)} – {money(item.max)}</p></div>
          </div>
        ))}</div>
      </div>
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-stone-100"><h2 className="text-base font-semibold text-stone-800" style={{ fontFamily: "'Fraunces', serif" }}>By Building</h2></div>
        <div className="divide-y divide-stone-100">{bldgFinances.map((b) => (
          <div key={b.building} className="px-6 py-4">
            <div className="flex items-center justify-between mb-2"><p className="text-sm font-medium text-stone-700">{b.building}</p><p className="text-sm font-semibold text-stone-800 tabular-nums">{money(b.total)}/mo</p></div>
            <div className="flex gap-3 flex-wrap">{b.items.map((i) => (<div key={i.type} className="flex items-center gap-1.5 text-xs text-stone-500"><div className="w-2 h-2 rounded-full" style={{ background: UTIL_COLOR[i.type] || "#a1a1aa" }} /><span className="capitalize">{i.type}:</span><span className="font-medium text-stone-600 tabular-nums">{money(i.avg)}</span></div>))}</div>
          </div>
        ))}</div>
      </div>
      {addressed.length > 0 && (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-stone-100"><h2 className="text-base font-semibold text-stone-800" style={{ fontFamily: "'Fraunces', serif" }}>Addressed This Month</h2></div>
          <div className="divide-y divide-stone-100">{addressed.map((t) => (<div key={t.id} className="px-6 py-3 flex items-center justify-between"><div className="flex items-center gap-3"><span className="text-sky-500">✓</span><span className="text-sm text-stone-600">{t.text}</span></div><span className="text-xs text-stone-400">{t.building}</span></div>))}</div>
        </div>
      )}
    </div>
  );
}
