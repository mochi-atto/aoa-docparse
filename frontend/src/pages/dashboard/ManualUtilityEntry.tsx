import { useState } from "react";
import type { FormEvent } from "react";
import api from "../../services/api";
import { errorDetail } from "../../services/errors";
import type { BuildingData } from "./types";

export function ManualUtilityEntry({ parishId, buildings, refreshData }: { parishId: string | undefined; buildings: BuildingData[]; refreshData: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [type, setType] = useState("electric");
  const units: Record<string, string> = { electric: "kWh", gas: "therms", water: "gallons" };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true); setError("");
    try {
      await api.post("/data/utility/manual", {
        parish_id: Number(parishId), building_name: data.get("building_name") || null,
        utility_type: type, bill_date: data.get("bill_date"), total_amount: Number(data.get("total_amount")),
        account_number: data.get("account_number") || null,
        billing_period_start: data.get("billing_period_start") || null,
        billing_period_end: data.get("billing_period_end") || null,
        usage_quantity: data.get("usage_quantity") === "" ? null : Number(data.get("usage_quantity")),
        usage_unit: units[type] || null,
      });
      await refreshData(); setOpen(false);
    } catch (err) { setError(errorDetail(err) || "Could not save bill"); }
    finally { setSaving(false); }
  };
  return <div className="bg-white border border-stone-200 rounded-xl p-4">
    <button onClick={() => setOpen(!open)} className="text-sm underline">{open ? "Close manual entry" : "Enter utility bill manually"}</button>
    {open && <form onSubmit={save} className="mt-3 space-y-3 text-sm">
      <p className="text-stone-500">Use this if parsing fails. Enter billed usage, not charges or meter readings. Leave unknown usage blank.</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <label>Building<select aria-label="Building" name="building_name" className="block border rounded p-1 w-full"><option value="">Unassigned</option>{buildings.map(b => <option key={b.id}>{b.name}</option>)}<option>General Expenses</option></select></label>
        <label>Utility type<select aria-label="Utility type" name="utility_type" value={type} onChange={e => setType(e.target.value)} className="block border rounded p-1 w-full">{["electric", "gas", "water", "waste", "other"].map(t => <option key={t}>{t}</option>)}</select></label>
        <label>Bill date<input required name="bill_date" type="date" className="block border rounded p-1 w-full" /></label>
        <label>Current charges ($)<input required name="total_amount" type="number" step="0.01" className="block border rounded p-1 w-full" /></label>
        <label>Account number<input name="account_number" className="block border rounded p-1 w-full" /></label>
        <label>Billed usage {units[type] && `(${units[type]})`}<input name="usage_quantity" type="number" min="0" step="any" className="block border rounded p-1 w-full" /></label>
        <label>Period start<input name="billing_period_start" type="date" className="block border rounded p-1 w-full" /></label>
        <label>Period end<input name="billing_period_end" type="date" className="block border rounded p-1 w-full" /></label>
      </div>
      {error && <p role="alert" className="text-red-600">{error}</p>}
      <button disabled={saving} className="bg-stone-800 text-white rounded px-3 py-2">{saving ? "Saving…" : "Save bill"}</button>
    </form>}
  </div>;
}
