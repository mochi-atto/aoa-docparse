import { useState } from "react";
import api from "../../services/api";
import { UTIL_TYPE_OPTIONS } from "./constants";
import { fmtDate, fmtTime } from "./helpers";

const HTYPE = { upload: { label: "Upload", dot: "bg-blue-400", badge: "bg-blue-50 text-blue-700" }, asset: { label: "Asset", dot: "bg-violet-400", badge: "bg-violet-50 text-violet-700" }, task_added: { label: "Added", dot: "bg-stone-400", badge: "bg-stone-100 text-stone-600" }, task_changed: { label: "Changed", dot: "bg-amber-400", badge: "bg-amber-50 text-amber-700" }, task_addressed: { label: "Addressed", dot: "bg-emerald-400", badge: "bg-emerald-50 text-emerald-700" } };

export function HistoryTab({ historyByMonth, historyFilter, setHistoryFilter, history, uploadedDocs, removeUploadedDoc, showToast, utilities, appraisals, editUtilityBill, deleteUtilityBill, editAppraisal, refreshData, parishId, getAccessTokenSilently }: any) {
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<{ billId: number; field: string; value: string } | null>(null);
  const typeCounts: Record<string, number> = { asset: 0, upload: 0, task_added: 0, task_changed: 0, task_addressed: 0 };
  history.forEach((e: any) => typeCounts[e.type] = (typeCounts[e.type] || 0) + 1);

  const getFilename = (desc: string): string | null => {
    const m = desc.match(/document:\s*(.+)$/) || desc.match(/entered:\s*(.+?)(?:\s*\(|$)/);
    return m ? m[1].trim() : null;
  };

  // Get records for a filename
  const getRecordsForFile = (filename: string | null) => {
    if (!filename) return { type: null, bills: [] as any[], appraisalEntries: [] as any[] };
    const bills = utilities.filter((u: any) => u.original_filename === filename);
    const appraisalEntries = appraisals.filter((a: any) => a.original_filename === filename);
    return { type: bills.length > 0 ? "utility" : "appraisal", bills, appraisalEntries };
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <button onClick={() => setHistoryFilter("all")} className={`px-3 py-1.5 rounded-full text-xs font-medium ${historyFilter === "all" ? "bg-stone-800 text-white" : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-50"}`}>All ({history.length})</button>
        {(Object.keys(HTYPE) as (keyof typeof HTYPE)[]).map((t) => (<button key={t} onClick={() => setHistoryFilter(t)} className={`px-3 py-1.5 rounded-full text-xs font-medium inline-flex items-center gap-1.5 ${historyFilter === t ? `${HTYPE[t].badge} ring-1 ring-current` : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-50"}`}><span className={`w-1.5 h-1.5 rounded-full ${HTYPE[t].dot}`} />{HTYPE[t].label} ({typeCounts[t] || 0})</button>))}
      </div>
      {historyByMonth.length === 0 ? <div className="bg-white rounded-xl border border-stone-200 p-12 text-center"><p className="text-stone-400 text-sm">{history.length === 0 ? "No activity yet." : "No entries match."}</p></div> : (
        <div className="space-y-8">{historyByMonth.map((g: any) => (
          <div key={g.month}>
            <div className="flex items-center gap-3 mb-4"><h2 className="text-base font-semibold text-stone-600" style={{ fontFamily: "'Fraunces', serif" }}>{g.month}</h2><div className="flex-1 h-px bg-stone-200" /><span className="text-xs text-stone-400">{g.entries.length}</span></div>
            <div className="relative pl-6 border-l-2 border-stone-200 space-y-1">{g.entries.map((e: any) => {
              const cfg = HTYPE[e.type as keyof typeof HTYPE] || HTYPE.task_added;
              const isRemoved = e.undone === "removed";
              const filename = e.type === "upload" ? getFilename(e.description) : null;
              const canRemove = !isRemoved && filename && uploadedDocs?.[filename];
              const isConfirming = confirmRemove === `${e.id}-${filename}`;
              const isUpload = e.type === "upload" && !isRemoved;
              const isExpanded = expandedEntry === e.id;
              const records = isExpanded ? getRecordsForFile(filename) : null;

              return (
                <div key={e.id} className={`relative bg-white rounded-lg border overflow-hidden transition-colors ${isRemoved ? "border-stone-100 opacity-50" : isExpanded ? "border-blue-200" : "border-stone-100 hover:border-stone-200"}`}>
                  <div className={`absolute -left-[29px] top-4 w-3 h-3 rounded-full border-2 border-stone-50 ${isRemoved ? "bg-stone-300" : cfg.dot}`} />
                  <div className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${isRemoved ? "text-stone-400 line-through" : "text-stone-700"}`}>{e.description}</p>
                        <p className="text-xs text-stone-400 mt-0.5">
                          {fmtDate(e.date)} at {fmtTime(e.date)}
                          {e.user_name && <span className="text-blue-500 ml-1.5">by {e.user_name}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isRemoved && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-stone-100 text-stone-400">Removed</span>}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isRemoved ? "bg-stone-50 text-stone-400" : cfg.badge}`}>{cfg.label}</span>
                        {isUpload && filename && (
                          <button onClick={() => setExpandedEntry(isExpanded ? null : e.id)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${isExpanded ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600 hover:bg-blue-100"}`}>
                            {isExpanded ? "Close ▴" : "View/Edit ▾"}
                          </button>
                        )}
                        {canRemove && !isConfirming && !isExpanded && (
                          <button onClick={() => setConfirmRemove(`${e.id}-${filename}`)}
                            className="text-xs text-stone-400 hover:text-red-500 transition-colors">Remove data</button>
                        )}
                        {isConfirming && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-red-600">Delete all data from this file?</span>
                            <button onClick={async () => {
                              await removeUploadedDoc(filename);
                              try { await api.post(`/data/history/${e.id}/mark-removed`); } catch {}
                              setConfirmRemove(null);
                              setExpandedEntry(null);
                              showToast?.("Document data removed");
                            }} className="text-xs bg-red-600 text-white px-2 py-0.5 rounded font-medium hover:bg-red-700">Yes</button>
                            <button onClick={() => setConfirmRemove(null)} className="text-xs text-stone-400 hover:text-stone-600">No</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded: show records from this upload */}
                  {isExpanded && records && (
                    <div className="border-t border-stone-100">
                      {records.bills.length > 0 && (
                        <>
                          <div className="px-4 py-2 bg-stone-50 text-xs text-stone-500 grid grid-cols-7 gap-2 font-medium">
                            <span>Date</span><span>Type</span><span>Amount</span><span>Account #</span><span>Building</span><span>Provider</span><span></span>
                          </div>
                          <div className="divide-y divide-stone-50">
                            {records.bills.map((bill: any) => (
                              <div key={bill.id} className="px-4 py-2 grid grid-cols-7 gap-2 items-center text-xs hover:bg-stone-50 group">
                                <InlineEdit value={bill.bill_date} field="bill_date" billId={bill.id} type="date" editing={editingField} setEditing={setEditingField} onSave={editUtilityBill} />
                                <InlineEdit value={bill.utility_type} field="utility_type" billId={bill.id} type="select" editing={editingField} setEditing={setEditingField} onSave={editUtilityBill} />
                                <InlineEdit value={bill.total_amount != null ? `$${Number(bill.total_amount).toFixed(2)}` : "—"} rawValue={bill.total_amount} field="total_amount" billId={bill.id} type="number" editing={editingField} setEditing={setEditingField} onSave={editUtilityBill} />
                                <InlineEdit value={bill.account_number || "—"} field="account_number" billId={bill.id} type="text" editing={editingField} setEditing={setEditingField} onSave={editUtilityBill} />
                                <InlineEdit value={bill.building_name || "—"} field="building_name" billId={bill.id} type="text" editing={editingField} setEditing={setEditingField} onSave={editUtilityBill} />
                                <span className="text-stone-500 truncate">{bill.provider_name || "—"}</span>
                                <button onClick={() => deleteUtilityBill(bill.id)}
                                  className="text-stone-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-right">✕</button>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      {records.appraisalEntries.length > 0 && (
                        <>
                          <div className="px-4 py-2 bg-stone-50 text-xs text-stone-500 grid grid-cols-5 gap-2 font-medium">
                            <span>Building</span><span>Value</span><span>Sq Ft</span><span>Date</span><span>Firm</span>
                          </div>
                          <div className="divide-y divide-stone-50">
                            {records.appraisalEntries.map((a: any, idx: number) => (
                              <div key={`${a.id}-${idx}`} className="px-4 py-2 grid grid-cols-5 gap-2 items-center text-xs hover:bg-stone-50 group">
                                <span className="text-stone-700 font-medium">{a.building_name || "—"}</span>
                                <InlineEdit value={a.building_value ? `$${Number(a.building_value).toLocaleString()}` : "—"} rawValue={a.building_value}
                                  field="building_value" billId={a.id} type="number" editing={editingField} setEditing={setEditingField}
                                  onSave={(id: number, updates: any) => editAppraisal(id, { building_name: a.building_name, ...updates })} />
                                <InlineEdit value={a.gross_sq_ft ? Number(a.gross_sq_ft).toLocaleString() : "—"} rawValue={a.gross_sq_ft}
                                  field="gross_sq_ft" billId={a.id} type="number" editing={editingField} setEditing={setEditingField}
                                  onSave={(id: number, updates: any) => editAppraisal(id, { building_name: a.building_name, ...updates })} />
                                <InlineEdit value={a.appraisal_date || "—"} field="appraisal_date" billId={a.id} type="date"
                                  editing={editingField} setEditing={setEditingField}
                                  onSave={(id: number, updates: any) => editAppraisal(id, updates)} />
                                <InlineEdit value={a.appraiser_firm || "—"} field="appraiser_firm" billId={a.id} type="text"
                                  editing={editingField} setEditing={setEditingField}
                                  onSave={(id: number, updates: any) => editAppraisal(id, updates)} />
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      <div className="px-4 py-2 bg-stone-50 flex justify-end gap-2">
                        {canRemove && (
                          <button onClick={() => setConfirmRemove(`${e.id}-${filename}`)}
                            className="text-xs text-red-500 hover:text-red-700 font-medium">Remove all data from this file</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}</div>
          </div>
        ))}</div>
      )}
    </div>
  );
}

// Inline edit cell for history tab (reuses same pattern as EditableCell but with different prop names to avoid collision)
export function InlineEdit({ value, rawValue, field, billId, type, editing, setEditing, onSave }: {
  value: any; rawValue?: any; field: string; billId: number; type: "text" | "number" | "date" | "select";
  editing: any; setEditing: any; onSave: any;
}) {
  const isEditing = editing?.billId === billId && editing?.field === field;
  const displayVal = value != null ? String(value) : "—";
  if (isEditing) {
    if (type === "select") {
      return (
        <select value={editing.value} onChange={(e) => { onSave(billId, { [field]: e.target.value }); setEditing(null); }}
          autoFocus className="border border-stone-300 rounded px-1 py-0.5 text-xs bg-white">
          {UTIL_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    return (
      <div className="flex items-center gap-1">
        <input value={editing.value} onChange={(e) => setEditing({ ...editing, value: e.target.value })}
          type={type === "date" ? "date" : "text"} autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") { onSave(billId, { [field]: editing.value }); setEditing(null); } if (e.key === "Escape") setEditing(null); }}
          className="border border-stone-300 rounded px-1.5 py-0.5 text-xs w-full font-mono" />
        <button onClick={() => { onSave(billId, { [field]: editing.value }); setEditing(null); }} className="text-emerald-600 text-xs">✓</button>
      </div>
    );
  }
  return (
    <span onClick={() => setEditing({ billId, field, value: rawValue != null ? String(rawValue) : (displayVal === "—" ? "" : String(displayVal)) })}
      className="text-stone-600 cursor-pointer hover:text-blue-600 hover:underline tabular-nums truncate" title="Click to edit">
      {displayVal}
    </span>
  );
}
