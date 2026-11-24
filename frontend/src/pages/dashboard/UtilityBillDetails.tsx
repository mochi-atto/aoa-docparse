import { useState } from "react";
import api from "../../services/api";
import { errorDetail } from "../../services/errors";
import type { UtilityBill } from "./types";

export function UtilityBillDetails({ bill, canEdit, refreshData }: { bill: UtilityBill; canEdit: boolean; refreshData: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setSaving(true); setError("");
    try {
      await api.put(`/data/utility/${bill.id}`, { usage_note: note });
      await refreshData();
      setEditing(false);
    } catch (err) { setError(errorDetail(err) || "Could not save note. Please retry."); }
    finally { setSaving(false); }
  };
  const period = bill.billing_period_start && bill.billing_period_end
    ? `${bill.billing_period_start} – ${bill.billing_period_end}` : `Bill dated ${bill.bill_date} (period unavailable)`;
  return <div className="px-6 pb-3 text-xs space-y-2 bg-stone-50/50">
    <p className="text-stone-500">{period}</p>
    <p className="text-stone-700">Energy per square foot: {bill.energy_per_sq_ft != null
      ? `${bill.energy_per_sq_ft.toFixed(3)} kBtu/ft² ${bill.billing_period_start && bill.billing_period_end ? "for this bill period" : "for this bill (period unavailable)"}`
      : bill.utility_type === "water" ? "Not applicable — water usage stays separate"
      : "Unavailable — requires billed energy usage and positive building square footage"}</p>
    {bill.valuation_sq_ft != null && <p className="text-stone-400">Valuation area: {bill.valuation_sq_ft.toLocaleString()} ft² ({bill.valuation_date})</p>}
    {!editing ? <div className="flex items-start gap-3">
      <p className="text-stone-600 whitespace-pre-wrap break-words">Usage note: {bill.usage_note || "No note"}</p>
      {canEdit && <button className="text-blue-600 underline shrink-0" onClick={() => { setNote(bill.usage_note || ""); setError(""); setEditing(true); }}>{bill.usage_note ? "Edit note" : "Add note"}</button>}
    </div> : <div className="space-y-2">
      <label className="block">Usage note for bill {bill.id}<textarea aria-label={`Usage note for bill ${bill.id}`} maxLength={2000} rows={3} value={note} disabled={saving} onChange={e => setNote(e.target.value)} className="block border rounded p-2 w-full bg-white" /></label>
      <p className="text-stone-400">Optional. Leave empty and save to clear.</p>
      <button disabled={saving} onClick={save} className="rounded bg-stone-800 text-white px-3 py-1">{saving ? "Saving…" : "Save note"}</button>
      <button disabled={saving} onClick={() => setEditing(false)} className="ml-3">Cancel</button>
      {error && <p role="alert" className="text-red-600">{error}</p>}
    </div>}
  </div>;
}
