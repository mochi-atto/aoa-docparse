import { useState } from "react";
import api from "../../services/api";
import type { WorkOrder } from "./types";
import { WO_STATUS_LABEL } from "./constants";

interface WorkOrderNote {
  id: number;
  work_order_id: number;
  author_sub: string;
  author_name: string | null;
  body: string;
  status_at_time: string | null;
  created_at: string;
}

// The backend stores UTC times without a "Z", so the browser would read them
// as local time. Adding "Z" makes it convert to the viewer's time zone correctly.
function formatTime(utc: string): string {
  return new Date(utc + "Z").toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function statusLabel(status: string): string {
  return WO_STATUS_LABEL[status] || status;
}

export default function WorkOrderNotes({ parishId, order, canAdd }: {
  parishId: string | number; order: WorkOrder; canAdd: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<WorkOrderNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const url = `/parishes/${parishId}/work-orders/${order.id}/notes`;

  const loadNotes = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get<WorkOrderNote[]>(url);
      setNotes(res.data);
      setLoaded(true);
    } catch {
      setError("Could not load notes.");
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!loaded) {
      loadNotes();
    }
  };

  const addNote = async () => {
    const body = draft.trim();
    if (!body || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await api.post<WorkOrderNote>(url, { body });
      setNotes([...notes, res.data]);
      setDraft("");
    } catch {
      setError("Could not save the note. Try again.");
    } finally {
      setSaving(false);
    }
  };

  let toggleLabel = "Notes";
  if (open) {
    toggleLabel = "Hide notes";
  }

  return (
    <div className="w-full">
      <button onClick={toggle} className="text-xs text-stone-500 hover:text-stone-700">
        {toggleLabel}
      </button>

      {open && (
        <div className="mt-2 space-y-3 border-l-2 border-stone-200 pl-3">
          {loading && <p className="text-xs text-stone-400">Loading…</p>}
          {loaded && notes.length === 0 && <p className="text-xs text-stone-400">No notes yet.</p>}

          {notes.map((note) => (
            <div key={note.id}>
              <p className="text-xs text-stone-500">
                {note.author_name || "Unknown"} · {formatTime(note.created_at)}
                {note.status_at_time && ` · while ${statusLabel(note.status_at_time)}`}
              </p>
              <p className="text-sm text-stone-700 whitespace-pre-wrap">{note.body}</p>
            </div>
          ))}

          {canAdd && (
            <div className="flex flex-col gap-2">
              <textarea
                aria-label={`Add a note to ${order.display_number}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={5000}
                placeholder="Add a note…"
                className="w-full border border-stone-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
              />
              <button
                onClick={addNote}
                disabled={saving || !draft.trim()}
                className="self-start text-xs border rounded px-2 py-1 disabled:opacity-50"
              >
                Add note
              </button>
            </div>
          )}

          {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
        </div>
      )}
    </div>
  );
}