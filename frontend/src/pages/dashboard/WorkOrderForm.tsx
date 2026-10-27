import { useState } from "react";
import type { BuildingData, TodoItem, WorkOrderPriority } from "./types";
import { WO_PRIORITIES, WO_PRIORITY_BADGE, TODO_TO_WO_PRIORITY } from "./constants";

export function WorkOrderForm({ todo, buildings, createWorkOrder, onDone }: { todo?: TodoItem; buildings: BuildingData[]; createWorkOrder: (p: any) => Promise<boolean>; onDone: () => void }) {
  const [title, setTitle] = useState(todo?.text || "");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<WorkOrderPriority>(todo ? TODO_TO_WO_PRIORITY[todo.priority] : "medium");
  const [dueDate, setDueDate] = useState("");
  const [buildingId, setBuildingId] = useState<string>(() => {
    const match = todo && buildings?.find((b) => b.name === todo.building);
    return match ? String(match.id) : "";
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    const ok = await createWorkOrder({
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      due_date: dueDate || undefined,
      building_id: buildingId ? Number(buildingId) : undefined,
      todo_id: todo?.id,
    });
    setSaving(false);
    if (ok) onDone();
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      {todo && <p className="text-xs text-stone-400 mb-2">Linked to task: <span className="text-stone-600">{todo.text}</span></p>}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Work order title" className="border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300" />
        <select value={buildingId} onChange={(e) => setBuildingId(e.target.value)} className="border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300 bg-white">
          <option value="">No building</option>
          {buildings?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" rows={2} className="col-span-2 border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300" />
      </div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs text-stone-500">Priority:</span>
        {WO_PRIORITIES.map((p) => (
          <button key={p} onClick={() => setPriority(p)}
            className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${priority === p ? `${WO_PRIORITY_BADGE[p]} ring-2 ring-stone-300` : "bg-stone-100 text-stone-500 hover:bg-stone-200"}`}>{p}</button>
        ))}
        <span className="text-xs text-stone-500 ml-3">Due:</span>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="border border-stone-300 rounded-lg px-2 py-1 text-xs" />
        {!dueDate && <span className="text-xs text-stone-400">(defaults from priority)</span>}
      </div>
      <div className="flex gap-2">
        <button onClick={submit} disabled={!title.trim() || saving} className="bg-stone-800 hover:bg-stone-900 disabled:bg-stone-300 text-white px-4 py-2 rounded-lg text-sm font-medium">{saving ? "Creating…" : "Create Work Order"}</button>
        <button onClick={onDone} className="text-stone-500 hover:text-stone-700 px-4 py-2 text-sm">Cancel</button>
      </div>
    </div>
  );
}
