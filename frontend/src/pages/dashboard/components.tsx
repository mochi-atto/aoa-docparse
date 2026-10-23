import { PRIORITY } from "./constants";

export function AddTaskForm({ newTaskText, setNewTaskText, newTaskBuilding, setNewTaskBuilding, newTaskPriority, setNewTaskPriority, addTask, onCancel, buildings }: any) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4 mb-3">
      <div className="grid grid-cols-2 gap-3 mb-3">
        <input value={newTaskText} onChange={(e: any) => setNewTaskText(e.target.value)} placeholder="Task description" className="border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300" />
        {buildings && buildings.length > 0 ? (
          <select value={newTaskBuilding} onChange={(e: any) => setNewTaskBuilding(e.target.value)}
            className="border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300 bg-white">
            <option value="">Select building</option>
            {buildings.map((b: any) => <option key={b.id} value={b.name}>{b.name}</option>)}
          </select>
        ) : (
          <input value={newTaskBuilding} onChange={(e: any) => setNewTaskBuilding(e.target.value)} placeholder="Building name" className="border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300" />
        )}
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-stone-500">Priority:</span>
        {(["red", "yellow", "green"] as const).map((p) => (
          <button key={p} onClick={() => setNewTaskPriority(p)} title={PRIORITY[p].desc}
            className={`px-3 py-1 rounded-full text-xs font-medium ${newTaskPriority === p ? `${PRIORITY[p].badge} ring-2 ${PRIORITY[p].ring}` : "bg-stone-100 text-stone-500 hover:bg-stone-200"}`}>{PRIORITY[p].label}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={addTask} disabled={!newTaskText.trim() || !newTaskBuilding.trim()} className="bg-stone-800 hover:bg-stone-900 disabled:bg-stone-300 text-white px-4 py-2 rounded-lg text-sm font-medium">Add</button>
        <button onClick={onCancel} className="text-stone-500 hover:text-stone-700 px-4 py-2 text-sm">Cancel</button>
      </div>
    </div>
  );
}

export function Empty({ text, sub }: { text: string; sub?: string }) {
  return <div className="text-center py-6"><p className="text-sm text-stone-400">{text}</p>{sub && <p className="text-xs text-stone-300 mt-1">{sub}</p>}</div>;
}
