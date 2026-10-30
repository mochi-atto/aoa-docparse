import { useState } from "react";
import type { ParishRole } from "../../services/api";
import type { WorkOrder } from "./types";

export type WorkOrderAction = "claim" | "start" | "hold" | "resume" | "submit" | "close";

export default function WorkOrderActions({ order, role, subject, transition }: {
  order: WorkOrder; role: ParishRole | null; subject: string | undefined;
  transition: (id: number, action: WorkOrderAction, notes?: string) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const isAdmin = role === "admin";
  const canWork = isAdmin || role === "editor";
  const assigned = isAdmin || (!!subject && order.technician_sub === subject);
  const actions: WorkOrderAction[] = [];
  if (canWork && order.status === "unassigned") actions.push("claim");
  if (canWork && assigned) {
    if (order.status === "assigned") actions.push("start", "hold");
    if (order.status === "in_progress") actions.push("hold", "submit");
    if (order.status === "on_hold") actions.push("resume");
  }
  if (isAdmin && order.status === "ready_for_review") actions.push("close");

  const run = async (action: WorkOrderAction) => {
    if (busy) return;
    if (action === "submit" && !notesOpen) { setNotesOpen(true); return; }
    setBusy(true); setError("");
    try {
      if (await transition(order.id, action, notes)) { setNotesOpen(false); setNotes(""); }
      else setError("The order could not be updated. Refresh and try again.");
    } finally { setBusy(false); }
  };

  return <div className="flex flex-wrap gap-2 items-center">
    {actions.map(action => <button key={action} disabled={busy || (action === "submit" && notesOpen && !notes.trim())}
      onClick={() => run(action)} className="text-xs border rounded px-2 py-1 capitalize disabled:opacity-50">{action}</button>)}
    {notesOpen && <label className="w-full text-xs">Completion notes
      <textarea aria-label={`Completion notes for ${order.display_number}`} value={notes} onChange={e => setNotes(e.target.value)} maxLength={5000} className="w-full border rounded p-2" />
      <button disabled={busy} onClick={() => setNotesOpen(false)}>Cancel</button>
    </label>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}
