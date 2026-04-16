import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";

// ── Types (shared — in production, move to a types file) ──

interface TodoItem {
  id: string;
  text: string;
  building: string;
  priority: "red" | "yellow" | "green" | "blue";
  done: boolean;
  createdAt: string;
}

interface HistoryEntry {
  id: string;
  type: "upload" | "task_added" | "task_changed" | "task_addressed";
  description: string;
  date: string;
}

const PRIORITY = {
  red:    { label: "Overdue",   bg: "bg-red-50",     border: "border-red-200",    dot: "bg-red-500",     badge: "bg-red-100 text-red-700",     ring: "ring-red-300" },
  yellow: { label: "At Risk",   bg: "bg-amber-50",   border: "border-amber-200",  dot: "bg-amber-500",   badge: "bg-amber-100 text-amber-700", ring: "ring-amber-300" },
  green:  { label: "Due Soon",  bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700", ring: "ring-emerald-300" },
  blue:   { label: "Addressed", bg: "bg-sky-50",     border: "border-sky-200",    dot: "bg-sky-500",     badge: "bg-sky-100 text-sky-700",     ring: "ring-sky-300" },
} as const;

const PRIORITY_ORDER = ["red", "yellow", "green", "blue"] as const;

export default function RisksPage() {
  const { parishId } = useParams<{ parishId: string }>();
  const navigate = useNavigate();

  const [todos, setTodos] = useState<TodoItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(`todos-${parishId}`) || "[]"); } catch { return []; }
  });
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem(`history-${parishId}`) || "[]"); } catch { return []; }
  });

  // Editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editPriority, setEditPriority] = useState<TodoItem["priority"]>("green");

  // Adding
  const [showAdd, setShowAdd] = useState(false);
  const [newText, setNewText] = useState("");
  const [newBuilding, setNewBuilding] = useState("");
  const [newPriority, setNewPriority] = useState<TodoItem["priority"]>("green");

  useEffect(() => { localStorage.setItem(`todos-${parishId}`, JSON.stringify(todos)); }, [todos, parishId]);
  useEffect(() => { localStorage.setItem(`history-${parishId}`, JSON.stringify(history)); }, [history, parishId]);

  const buildings = useMemo(() => {
    const set = new Set(todos.map((t) => t.building));
    return [...set].sort();
  }, [todos]);

  const addHistoryEntry = (type: HistoryEntry["type"], description: string) => {
    setHistory((h) => [{ id: crypto.randomUUID(), type, description, date: new Date().toISOString() }, ...h]);
  };

  const toggleTodo = (id: string) => {
    setTodos((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const done = !t.done;
        if (done) addHistoryEntry("task_addressed", `Task addressed: ${t.text}`);
        return { ...t, done, priority: done ? "blue" : t.priority };
      })
    );
  };

  const startEdit = (todo: TodoItem) => {
    setEditingId(todo.id);
    setEditText(todo.text);
    setEditPriority(todo.priority);
  };

  const saveEdit = (id: string) => {
    setTodos((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const changed = t.text !== editText || t.priority !== editPriority;
        if (changed) addHistoryEntry("task_changed", `Task updated: "${editText}" (${PRIORITY[editPriority].label})`);
        return { ...t, text: editText, priority: editPriority };
      })
    );
    setEditingId(null);
  };

  const deleteTodo = (id: string) => {
    const todo = todos.find((t) => t.id === id);
    if (todo) addHistoryEntry("task_changed", `Task removed: ${todo.text}`);
    setTodos((prev) => prev.filter((t) => t.id !== id));
  };

  const addTodo = () => {
    if (!newText.trim() || !newBuilding.trim()) return;
    const item: TodoItem = {
      id: crypto.randomUUID(),
      text: newText.trim(),
      building: newBuilding.trim(),
      priority: newPriority,
      done: false,
      createdAt: new Date().toISOString(),
    };
    setTodos((prev) => [...prev, item]);
    addHistoryEntry("task_added", `Task added: "${item.text}" for ${item.building}`);
    setNewText("");
    setNewBuilding("");
    setNewPriority("green");
    setShowAdd(false);
  };

  const prioCounts = useMemo(() => {
    const c = { red: 0, yellow: 0, green: 0, blue: 0 };
    todos.forEach((t) => c[t.priority]++);
    return c;
  }, [todos]);

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap" rel="stylesheet" />

      <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        {/* Header */}
        <header className="bg-white border-b border-stone-200 px-6 py-3 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(`/dashboard/${parishId}`)} className="text-stone-400 hover:text-stone-600 text-sm transition-colors">← Dashboard</button>
            <div className="w-px h-5 bg-stone-200" />
            <h1 className="text-lg font-semibold text-stone-800" style={{ fontFamily: "'Fraunces', serif" }}>Active Risks & Backlog</h1>
          </div>
          <button onClick={() => setShowAdd(true)} className="bg-stone-800 hover:bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            + Add Task
          </button>
        </header>

        <div className="max-w-5xl mx-auto px-6 py-6">
          {/* Summary badges */}
          <div className="flex items-center gap-2 mb-6">
            {PRIORITY_ORDER.map((p) => (
              <span key={p} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${PRIORITY[p].badge}`}>
                <span className={`w-2 h-2 rounded-full ${PRIORITY[p].dot}`} />
                {prioCounts[p]} {PRIORITY[p].label}
              </span>
            ))}
          </div>

          {/* Add task form */}
          {showAdd && (
            <div className="bg-white rounded-xl border border-stone-200 p-5 mb-6">
              <h3 className="text-sm font-semibold text-stone-700 mb-3">New Task</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <input value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="Task description"
                  className="border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300" />
                <input value={newBuilding} onChange={(e) => setNewBuilding(e.target.value)} placeholder="Building name"
                  className="border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300" />
              </div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs text-stone-500 mr-1">Priority:</span>
                {(["red", "yellow", "green"] as const).map((p) => (
                  <button key={p} onClick={() => setNewPriority(p)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${newPriority === p ? `${PRIORITY[p].badge} ring-2 ${PRIORITY[p].ring}` : "bg-stone-100 text-stone-500 hover:bg-stone-200"}`}>
                    {PRIORITY[p].label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={addTodo} disabled={!newText.trim() || !newBuilding.trim()}
                  className="bg-stone-800 hover:bg-stone-900 disabled:bg-stone-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  Add
                </button>
                <button onClick={() => setShowAdd(false)} className="text-stone-500 hover:text-stone-700 px-4 py-2 text-sm">Cancel</button>
              </div>
            </div>
          )}

          {/* Tasks by building */}
          {buildings.length === 0 && !showAdd ? (
            <div className="bg-white rounded-xl border border-stone-200 p-12 text-center">
              <p className="text-stone-400">No tasks yet. Click "Add Task" to create one.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {buildings.map((building) => {
                const bTodos = todos
                  .filter((t) => t.building === building)
                  .sort((a, b) => ({ red: 0, yellow: 1, green: 2, blue: 3 }[a.priority]) - ({ red: 0, yellow: 1, green: 2, blue: 3 }[b.priority]));

                return (
                  <div key={building} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                    <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-stone-700" style={{ fontFamily: "'Fraunces', serif" }}>{building}</h3>
                      <span className="text-xs text-stone-400">{bTodos.filter((t) => !t.done).length} active</span>
                    </div>
                    <div className="divide-y divide-stone-100">
                      {bTodos.map((todo) => {
                        const c = PRIORITY[todo.priority];
                        const isEditing = editingId === todo.id;

                        return (
                          <div key={todo.id} className={`flex items-center gap-3 px-5 py-3 ${c.bg} transition-colors`}>
                            <button onClick={() => toggleTodo(todo.id)}
                              className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                                todo.done ? "bg-sky-500 border-sky-500 text-white" : "border-stone-300 hover:border-stone-400"}`}>
                              {todo.done && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </button>

                            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${c.dot}`} />

                            {isEditing ? (
                              <div className="flex-1 flex items-center gap-2">
                                <input value={editText} onChange={(e) => setEditText(e.target.value)}
                                  className="flex-1 border border-stone-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300" />
                                <div className="flex gap-1">
                                  {(["red", "yellow", "green"] as const).map((p) => (
                                    <button key={p} onClick={() => setEditPriority(p)}
                                      className={`w-4 h-4 rounded-full ${PRIORITY[p].dot} ${editPriority === p ? "ring-2 ring-offset-1 " + PRIORITY[p].ring : "opacity-40 hover:opacity-70"}`} />
                                  ))}
                                </div>
                                <button onClick={() => saveEdit(todo.id)} className="text-emerald-600 hover:text-emerald-700 text-xs font-medium">Save</button>
                                <button onClick={() => setEditingId(null)} className="text-stone-400 hover:text-stone-600 text-xs">Cancel</button>
                              </div>
                            ) : (
                              <>
                                <span className={`flex-1 text-sm ${todo.done ? "line-through text-stone-400" : "text-stone-700"}`}>{todo.text}</span>
                                <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${c.badge}`}>{c.label}</span>
                                <button onClick={() => startEdit(todo)} className="text-stone-400 hover:text-stone-600 text-xs ml-1">Edit</button>
                                <button onClick={() => deleteTodo(todo.id)} className="text-stone-400 hover:text-red-500 text-xs">✕</button>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}