import type { DashboardViewProps } from "./viewTypes";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { WorkOrder } from "./types";
import { PRIORITY, PRIO_ORDER, WO_PRIORITY_BADGE, MAX_DASHBOARD_WO_CHIPS, MAX_TASK_WO_CHIPS, WO_STATUS_LABEL, UTIL_TYPES, UTIL_LABEL, UTIL_COLOR, UTIL_ICON } from "./constants";
import { money, fmtDate, fmtMonth, sortByPriority } from "./helpers";
import { AddTaskForm, Empty } from "./components";

export function DashboardTab({ canEdit, utilities, todos, utilMonthly, allMonths, prioCounts, estMonthly, recentHistoryByMonth, toggleTodo, setActiveTab, showAddTask, setShowAddTask, newTaskText, setNewTaskText, newTaskBuilding, setNewTaskBuilding, newTaskPriority, setNewTaskPriority, addTask, buildings, workOrders }: Pick<DashboardViewProps, "canEdit" | "utilities" | "todos" | "utilMonthly" | "allMonths" | "buildingVals" | "totalVal" | "totalValPct" | "prioCounts" | "estMonthly" | "recentHistoryByMonth" | "toggleTodo" | "setActiveTab" | "showAddTask" | "setShowAddTask" | "newTaskText" | "setNewTaskText" | "newTaskBuilding" | "setNewTaskBuilding" | "newTaskPriority" | "setNewTaskPriority" | "addTask" | "buildings" | "workOrders">) {
  const openWorkOrders: WorkOrder[] = workOrders.filter((wo: WorkOrder) => wo.status !== "closed");
  const woTooltip = (wo: WorkOrder) => `${wo.title} — ${WO_STATUS_LABEL[wo.status] || wo.status}${wo.due_date ? `, due ${fmtDate(wo.due_date + "T00:00:00")}` : ""}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-4">
        {/* Active Risks */}
        <section className="bg-white rounded-xl border border-stone-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 onClick={() => setActiveTab("risks")} className="text-base font-semibold text-stone-800 cursor-pointer hover:text-blue-700 transition-colors" style={{ fontFamily: "'Fraunces', serif" }}>Active Risks & Backlog →</h3>
            <div className="flex items-center gap-1.5">
              {PRIO_ORDER.map((p) => (
                <span key={p} title={PRIORITY[p].desc} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-help ${PRIORITY[p].badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY[p].dot}`} />{prioCounts[p]}
                </span>
              ))}
              <button disabled={!canEdit} onClick={() => setShowAddTask(true)} className="ml-2 text-xs text-stone-500 hover:text-stone-800 font-medium">+ Add</button>
            </div>
          </div>

          {/* Quick add form */}
          {showAddTask && <AddTaskForm {...{ newTaskText, setNewTaskText, newTaskBuilding, setNewTaskBuilding, newTaskPriority, setNewTaskPriority, addTask, buildings, onCancel: () => setShowAddTask(false) }} />}

          {todos.length === 0 ? <Empty text="No active tasks yet." sub="Click + Add to create one." /> : (
            <div className="max-h-64 overflow-y-auto space-y-1 pr-1 -mr-1 custom-scroll">
              {todos.filter((t) => t.priority !== "blue" || !t.done).sort(sortByPriority).map((todo) => {
                const c = PRIORITY[todo.priority as keyof typeof PRIORITY];
                return (
                  <div key={todo.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${c.border} ${c.bg}`}>
                    <button disabled={!canEdit} onClick={() => toggleTodo(todo.id)} className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${todo.done ? "bg-sky-500 border-sky-500 text-white" : "border-stone-300 hover:border-stone-400"}`}>
                      {todo.done && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                    </button>
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${c.dot}`} />
                    <span className={`flex-1 text-sm ${todo.done ? "line-through text-stone-400" : "text-stone-700"}`}>{todo.text}</span>
                    {(() => {
                      const linked: WorkOrder[] = workOrders.filter((wo: WorkOrder) => wo.todo_id === todo.id);
                      const extra = linked.length - MAX_TASK_WO_CHIPS;
                      return <>
                        {linked.slice(0, MAX_TASK_WO_CHIPS).map((wo) => (
                          <span key={wo.id} title={woTooltip(wo)} className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium bg-white border border-stone-200 text-stone-600 tabular-nums whitespace-nowrap">{wo.display_number}</span>
                        ))}
                        {extra > 0 && (
                          <button onClick={() => setActiveTab("risks")} title={linked.slice(MAX_TASK_WO_CHIPS).map((wo) => wo.display_number).join(", ")}
                            className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium text-stone-500 hover:text-stone-800 whitespace-nowrap">+{extra}</button>
                        )}
                      </>;
                    })()}
                    <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${c.badge}`}>{todo.building}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Open work orders */}
          {openWorkOrders.length > 0 && (
            <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-stone-100 min-w-0">
              <span className="text-xs text-stone-500 mr-1 flex-shrink-0">Open work orders:</span>
              {/* p-0.5 leaves room for the 2px hover ring, which overflow-hidden would otherwise clip */}
              <div className="flex items-center gap-1.5 overflow-hidden min-w-0 p-0.5 -my-0.5">
                {openWorkOrders.slice(0, MAX_DASHBOARD_WO_CHIPS).map((wo) => (
                  <button key={wo.id} onClick={() => setActiveTab("risks")} title={woTooltip(wo)}
                    className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium tabular-nums whitespace-nowrap hover:ring-2 hover:ring-stone-300 ${WO_PRIORITY_BADGE[wo.priority] || "bg-stone-100 text-stone-600"}`}>
                    {wo.display_number}
                  </button>
                ))}
              </div>
              <button onClick={() => setActiveTab("risks")} className="ml-auto flex-shrink-0 text-xs text-stone-500 hover:text-stone-800 font-medium whitespace-nowrap">
                {openWorkOrders.length > MAX_DASHBOARD_WO_CHIPS ? `+${openWorkOrders.length - MAX_DASHBOARD_WO_CHIPS} more · ` : ""}View all →
              </button>
            </div>
          )}
        </section>

        {/* Utility Use — full width */}
        <section className="bg-white rounded-xl border border-stone-200 p-5">
          <h3 onClick={() => setActiveTab("utility")} className="text-base font-semibold text-stone-800 mb-4 cursor-pointer hover:text-blue-700 transition-colors" style={{ fontFamily: "'Fraunces', serif" }}>Utility Use →</h3>
          {utilities.length === 0 ? <Empty text="Upload utility bills to see trends." /> : (
            <div className="grid grid-cols-2 gap-6">
              {UTIL_TYPES.map((type: string) => {
                const data = allMonths.map((m: string) => ({ month: fmtMonth(m + "-01"), amount: utilMonthly[type]?.[m] || 0 }));
                const withData = data.filter((d) => d.amount > 0);
                if (withData.length === 0) return null;
                // Average of all except the latest
                const prevVals = withData.slice(0, -1);
                const avg = prevVals.length > 0 ? prevVals.reduce((s: number, d) => s + d.amount, 0) / prevVals.length : null;
                const latest = withData[withData.length - 1].amount;
                const pctVsAvg = avg ? ((latest - avg) / avg * 100) : null;
                // Add average line to data
                const chartData = data.map((d) => ({ ...d, avg: avg || 0 }));
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span>{UTIL_ICON[type]}</span>
                        <span className="text-xs font-medium text-stone-600">{UTIL_LABEL[type]}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-stone-500 tabular-nums">{money(latest)}</span>
                        {pctVsAvg !== null && <span className={`text-xs font-semibold ${pctVsAvg >= 0 ? "text-red-500" : "text-emerald-600"}`}>{pctVsAvg >= 0 ? "↑" : "↓"}{Math.abs(pctVsAvg).toFixed(1)}% vs avg</span>}
                      </div>
                    </div>
                    <div className="h-28"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" /><XAxis dataKey="month" tick={{ fontSize: 9, fill: "#a8a29e" }} tickLine={false} axisLine={false} /><YAxis tick={{ fontSize: 9, fill: "#a8a29e" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`} width={35} /><Line type="monotone" dataKey="amount" stroke={UTIL_COLOR[type]} strokeWidth={2} dot={false} />{avg ? <Line type="monotone" dataKey="avg" stroke="#d6d3d1" strokeWidth={1} strokeDasharray="4 4" dot={false} /> : null}<Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e7e5e4" }} formatter={(v, name) => [money(Number(v)), name === "avg" ? "Average" : UTIL_LABEL[type]]} /></LineChart></ResponsiveContainer></div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Right column */}
      <div className="space-y-4">
        <section className="bg-white rounded-xl border border-stone-200 p-5">
          <h3 onClick={() => setActiveTab("finances")} className="text-base font-semibold text-stone-800 mb-4 cursor-pointer hover:text-blue-700 transition-colors" style={{ fontFamily: "'Fraunces', serif" }}>Finances →</h3>
          {utilities.length === 0 ? <Empty text="Upload data to see estimates." /> : (
            <>
              <div className="bg-stone-50 rounded-lg p-4 mb-4"><p className="text-xs text-stone-400 mb-0.5">Est. Monthly Cost</p><p className="text-2xl font-bold text-stone-800 tabular-nums" style={{ fontFamily: "'Fraunces', serif" }}>{money(estMonthly.total)}</p></div>
              <div className="space-y-2">{estMonthly.items.map((i) => (<div key={i.type} className="flex items-center justify-between text-sm"><div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ background: UTIL_COLOR[i.type] || "#a1a1aa" }} /><span className="text-stone-600 capitalize">{i.type}</span></div><span className="font-medium text-stone-700 tabular-nums">{money(i.avg)}</span></div>))}</div>
            </>
          )}
        </section>

        <section className="bg-white rounded-xl border border-stone-200 p-5">
          <h3 onClick={() => setActiveTab("history")} className="text-base font-semibold text-stone-800 mb-4 cursor-pointer hover:text-blue-700 transition-colors" style={{ fontFamily: "'Fraunces', serif" }}>History →</h3>
          {recentHistoryByMonth.length === 0 ? <Empty text="Activity will appear here." /> : (
            <div className="max-h-80 overflow-y-auto pr-1 -mr-1 custom-scroll space-y-4">
              {recentHistoryByMonth.map((g) => (
                <div key={g.month}><div className="flex items-center gap-2 mb-2"><span className="text-xs font-semibold text-stone-500 uppercase tracking-wider whitespace-nowrap">{g.month}</span><div className="flex-1 h-px bg-stone-200" /></div>
                  <div className="relative pl-4 border-l-2 border-stone-200 space-y-2">{g.entries.map((e) => (
                    <div key={e.id} className="relative"><div className={`absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white ${e.type === "upload" ? "bg-blue-400" : e.type === "task_addressed" ? "bg-emerald-400" : e.type === "task_changed" ? "bg-amber-400" : "bg-stone-400"}`} /><p className="text-sm text-stone-600">{e.description}</p><p className="text-xs text-stone-400">{fmtDate(e.date)}</p></div>
                  ))}</div></div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
