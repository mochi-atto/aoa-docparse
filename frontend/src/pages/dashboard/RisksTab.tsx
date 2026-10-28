import WorkOrderActions from "./WorkOrderActions";
import type { DashboardViewProps } from "./viewTypes";
import { useState, useMemo } from "react";
import type { WorkOrder } from "./types";
import { PRIORITY, PRIO_ORDER, WO_PRIORITY_BADGE, WO_STATUS_LABEL } from "./constants";
import { fmtDate, sortByPriority } from "./helpers";
import { AddTaskForm } from "./components";
import { WorkOrderForm } from "./WorkOrderForm";

export function RisksTab({ role, subject, transitionOrder, canEdit, canDelete, todos, toggleTodo, todoBuildings, showAddTask, setShowAddTask, newTaskText, setNewTaskText, newTaskBuilding, setNewTaskBuilding, newTaskPriority, setNewTaskPriority, addTask, prioCounts, buildings, editingTaskId, editTaskText, editTaskPriority, editTaskBuilding, startEditTask, saveEditTask, setEditingTaskId, setEditTaskText, setEditTaskPriority, setEditTaskBuilding, deleteTask, workOrders, createWorkOrder }: Pick<DashboardViewProps, "role" | "subject" | "transitionOrder" | "canEdit" | "canDelete" | "todos" | "toggleTodo" | "todoBuildings" | "showAddTask" | "setShowAddTask" | "newTaskText" | "setNewTaskText" | "newTaskBuilding" | "setNewTaskBuilding" | "newTaskPriority" | "setNewTaskPriority" | "addTask" | "prioCounts" | "buildings" | "editingTaskId" | "editTaskText" | "editTaskPriority" | "editTaskBuilding" | "startEditTask" | "saveEditTask" | "setEditingTaskId" | "setEditTaskText" | "setEditTaskPriority" | "setEditTaskBuilding" | "deleteTask" | "workOrders" | "createWorkOrder">) {
  // Which form is open: a todo id (linked work order) or "new" (standalone)
  const [woFormFor, setWoFormFor] = useState<number | "new" | null>(null);
  const woByTodo = useMemo(() => {
    const m: Record<number, WorkOrder[]> = {};
    workOrders.forEach((wo: WorkOrder) => { if (wo.todo_id != null) (m[wo.todo_id] ||= []).push(wo); });
    return m;
  }, [workOrders]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-wrap items-center gap-2">{PRIO_ORDER.map((p) => (<span key={p} title={PRIORITY[p].desc} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium cursor-help ${PRIORITY[p].badge}`}><span className={`w-2 h-2 rounded-full ${PRIORITY[p].dot}`} />{prioCounts[p]} {PRIORITY[p].label}</span>))}</div>
        <button disabled={!canEdit} onClick={() => setShowAddTask(true)} className="bg-stone-800 hover:bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-medium">+ Add Task</button>
      </div>

      {showAddTask && <div className="mb-4"><AddTaskForm {...{ newTaskText, setNewTaskText, newTaskBuilding, setNewTaskBuilding, newTaskPriority, setNewTaskPriority, addTask, buildings, onCancel: () => setShowAddTask(false) }} /></div>}

      {todoBuildings.length === 0 && !showAddTask ? <div className="bg-white rounded-xl border border-stone-200 p-12 text-center"><p className="text-stone-400">No tasks yet.</p></div> : (
        <div className="space-y-4">{todoBuildings.map((building: string) => {
          const bTodos = todos.filter((t) => t.building === building).sort(sortByPriority);
          return (
            <div key={building} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-stone-700" style={{ fontFamily: "'Fraunces', serif" }}>{building}</h3>
                <span className="text-xs text-stone-400">{bTodos.filter((t) => !t.done).length} active</span>
              </div>
              <div className="divide-y divide-stone-100">{bTodos.map((todo) => {
                const c = PRIORITY[todo.priority as keyof typeof PRIORITY]; const isEditing = editingTaskId === todo.id;
                const linked: WorkOrder[] = woByTodo[todo.id] || [];
                return (
                  <div key={todo.id}>
                  <div className={`flex items-center gap-3 px-5 py-3 ${c.bg}`}>
                    <button disabled={!canEdit} onClick={() => toggleTodo(todo.id)} className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center ${todo.done ? "bg-sky-500 border-sky-500 text-white" : "border-stone-300 hover:border-stone-400"}`}>{todo.done && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}</button>
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${c.dot}`} />
                    {isEditing ? (
                      <div className="flex-1 flex items-center gap-2 flex-wrap">
                        <input value={editTaskText} onChange={(e) => setEditTaskText(e.target.value)} className="flex-1 min-w-[120px] border border-stone-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300" />
                        {buildings && buildings.length > 0 && (
                          <select value={editTaskBuilding} onChange={(e) => setEditTaskBuilding(e.target.value)}
                            className="border border-stone-300 rounded px-2 py-1 text-xs bg-white">
                            {buildings.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
                          </select>
                        )}
                        <div className="flex gap-1">{(["red", "yellow", "green"] as const).map((p) => (<button key={p} onClick={() => setEditTaskPriority(p)} className={`w-4 h-4 rounded-full ${PRIORITY[p].dot} ${editTaskPriority === p ? "ring-2 ring-offset-1 " + PRIORITY[p].ring : "opacity-40 hover:opacity-70"}`} />))}</div>
                        <button onClick={() => saveEditTask(todo.id)} className="text-emerald-600 text-xs font-medium">Save</button>
                        <button onClick={() => setEditingTaskId(null)} className="text-stone-400 text-xs">Cancel</button>
                      </div>
                    ) : (
                      <>
                        <span className={`flex-1 text-sm ${todo.done ? "line-through text-stone-400" : "text-stone-700"}`}>{todo.text}</span>
                        {linked.map((wo) => (
                          <span key={wo.id} title={`${wo.title} — ${WO_STATUS_LABEL[wo.status] || wo.status}`} className="text-xs px-2 py-0.5 rounded-full font-medium bg-white border border-stone-200 text-stone-600 tabular-nums">{wo.display_number} · {WO_STATUS_LABEL[wo.status] || wo.status}</span>
                        ))}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.badge}`}>{c.label}</span>
                        <button disabled={!canEdit} onClick={() => setWoFormFor(woFormFor === todo.id ? null : todo.id)} className="text-stone-400 hover:text-stone-600 text-xs ml-1">+ Work order</button>
                        <button disabled={!canEdit} onClick={() => startEditTask(todo)} className="text-stone-400 hover:text-stone-600 text-xs">Edit</button>
                        <button disabled={!canDelete} onClick={() => deleteTask(todo.id)} className="text-stone-400 hover:text-red-500 text-xs">✕</button>
                      </>
                    )}
                  </div>
                  {woFormFor === todo.id && (
                    <div className="px-5 py-3 bg-stone-50">
                      <WorkOrderForm todo={todo} buildings={buildings} createWorkOrder={createWorkOrder} onDone={() => setWoFormFor(null)} />
                    </div>
                  )}
                  </div>
                );
              })}</div>
            </div>
          );
        })}</div>
      )}

      {/* Work orders */}
      <div className="flex items-center justify-between mt-8 mb-4">
        <h3 className="text-base font-semibold text-stone-800" style={{ fontFamily: "'Fraunces', serif" }}>Work Orders</h3>
        <button disabled={!canEdit} onClick={() => setWoFormFor(woFormFor === "new" ? null : "new")} className="bg-stone-800 hover:bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-medium">+ New Work Order</button>
      </div>
      {woFormFor === "new" && <div className="mb-4"><WorkOrderForm buildings={buildings} createWorkOrder={createWorkOrder} onDone={() => setWoFormFor(null)} /></div>}
      {workOrders.length === 0 ? <div className="bg-white rounded-xl border border-stone-200 p-12 text-center"><p className="text-stone-400">No work orders yet.</p></div> : (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden divide-y divide-stone-100">
          {workOrders.map((wo: WorkOrder) => {
            const building = buildings?.find((b) => b.id === wo.building_id);
            const todo = wo.todo_id != null ? todos.find((t) => t.id === wo.todo_id) : null;
            return (
              <div key={wo.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="text-xs font-semibold text-stone-500 tabular-nums w-16 flex-shrink-0">{wo.display_number}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-stone-700 truncate">{wo.title}</p>
                  <p className="text-xs text-stone-400 truncate">
                    {[building?.name, todo && `Task: ${todo.text}`, wo.requester_name && `Requested by ${wo.requester_name}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${WO_PRIORITY_BADGE[wo.priority] || ""}`}>{wo.priority}</span>
                <WorkOrderActions order={wo} role={role} subject={subject} transition={transitionOrder} />
                <span className="text-xs text-stone-500 w-24 text-right">{WO_STATUS_LABEL[wo.status] || wo.status}</span>
                <span className="text-xs text-stone-400 w-24 text-right tabular-nums">{wo.due_date ? `Due ${fmtDate(wo.due_date + "T00:00:00")}` : ""}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
