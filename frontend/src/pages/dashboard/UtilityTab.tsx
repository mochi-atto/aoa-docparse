import type { DashboardViewProps } from "./viewTypes";
import { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import api, { setAuthToken } from "../../services/api";
import { UTIL_TYPES, UTIL_LABEL, UTIL_COLOR, UTIL_ICON, UTIL_TYPE_OPTIONS } from "./constants";
import { money, fmtMonth, bldgName } from "./helpers";

export function UtilityTab({ canEdit, utilities, utilBuildings, utilBuildingData, allMonths, buildings, parishId, getAccessTokenSilently, setBuildings, refreshData, editUtilityBill, deleteUtilityBill, showToast }: Pick<DashboardViewProps, "canEdit" | "utilities" | "utilBuildings" | "utilBuildingData" | "allMonths" | "buildings" | "parishId" | "getAccessTokenSilently" | "setBuildings" | "refreshData" | "editUtilityBill" | "deleteUtilityBill" | "showToast">) {
  const [editingAcct, setEditingAcct] = useState<{ buildingId: number; utilType: string; value: string } | null>(null);
  const [editingBill, setEditingBill] = useState<{ id: number; field: string; value: string } | null>(null);
  const [expandedBuilding, setExpandedBuilding] = useState<string | null>(null);
  const [acctPanelOpen, setAcctPanelOpen] = useState(true);

  const unassignedAccounts = useMemo(() => {
    const accts = new Map<string, { account_number: string; utility_type: string; count: number }>();
    for (const u of utilities) {
      if ((!u.building_name || u.building_name === "Unassigned") && u.account_number) {
        const key = u.account_number;
        if (!accts.has(key)) accts.set(key, { account_number: u.account_number, utility_type: u.utility_type || "unknown", count: 0 });
        accts.get(key)!.count++;
      }
    }
    return [...accts.values()];
  }, [utilities]);

  const saveAccountNumber = async (buildingId: number, utilType: string, acctNum: string) => {
    try {
      const token = await getAccessTokenSilently();
      setAuthToken(token);
      const bldg = buildings.find((b) => b.id === buildingId);
      const updated = { ...(bldg?.account_numbers || {}), [utilType]: acctNum.trim() };
      const res = await api.put(`/parishes/${parishId}/buildings/${buildingId}`, { account_numbers: updated });
      setBuildings((prev) => prev.map((b) => b.id === buildingId ? res.data : b));
      setEditingAcct(null);
      showToast("Account number saved");
      refreshData();
    } catch (err) { console.error(err); showToast("Failed to save", "error"); }
  };

  const assignToGeneral = async (accountNumber: string) => {
    try {
      const token = await getAccessTokenSilently();
      setAuthToken(token);
      const billsToUpdate = utilities.filter((u) => u.account_number === accountNumber && (!u.building_name || u.building_name === "Unassigned"));
      for (const bill of billsToUpdate) {
        await api.put(`/data/utility/${bill.id}`, { building_name: "General Expenses" });
      }
      showToast(`${billsToUpdate.length} bills assigned to General Expenses`);
      refreshData();
    } catch (err) { console.error(err); showToast("Failed to assign", "error"); }
  };

  // Remove a utility type's bills from General Expenses (unassign them)
  const unassignFromGeneral = async (utilType: string) => {
    try {
      const token = await getAccessTokenSilently();
      setAuthToken(token);
      const billsToUpdate = utilities.filter((u) => bldgName(u) === "General Expenses" && u.utility_type === utilType);
      for (const bill of billsToUpdate) {
        await api.put(`/data/utility/${bill.id}`, { building_name: "" });
      }
      showToast(`${billsToUpdate.length} ${utilType} bills unassigned from General Expenses`);
      refreshData();
    } catch (err) { console.error(err); showToast("Failed to unassign", "error"); }
  };

  const removeUtilFromBuilding = async (buildingId: number, utilType: string) => {
    try {
      const token = await getAccessTokenSilently();
      setAuthToken(token);
      const bldg = buildings.find((b) => b.id === buildingId);
      const updated = { ...(bldg?.account_numbers || {}) };
      delete updated[utilType];
      await api.put(`/parishes/${parishId}/buildings/${buildingId}`, { account_numbers: updated });
      setBuildings((prev) => prev.map((x) => x.id === buildingId ? { ...x, account_numbers: updated } : x));
      refreshData();
      showToast(`Removed ${utilType} from ${bldg?.name}`);
    } catch (err) { console.error(err); showToast("Failed to remove", "error"); }
  };

  if (utilities.length === 0 && buildings.length === 0) {
    return <div className="bg-white rounded-xl border border-stone-200 p-12 text-center"><p className="text-stone-400 text-sm">Upload utility bills to see detailed breakdowns.</p></div>;
  }

  const genBills = utilities.filter((u) => bldgName(u) === "General Expenses");
  const genTypes = Array.from(new Set<string>(genBills.map((u) => String(u.utility_type || "other"))));

  return (
    <div className="space-y-6">
      {/* ═══ Amber panel: account management ═══ */}
      <div className="bg-amber-50 rounded-xl border border-amber-200 overflow-hidden">
        <button onClick={() => setAcctPanelOpen(!acctPanelOpen)}
          className="w-full px-5 py-4 flex items-center justify-between text-left">
          <h3 className="text-sm font-semibold text-amber-800" style={{ fontFamily: "'Fraunces', serif" }}>Account Management</h3>
          <div className="flex items-center gap-2">
            {unassignedAccounts.length > 0 && <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">{unassignedAccounts.length} unassigned</span>}
            <span className="text-xs text-amber-600">{acctPanelOpen ? "▴" : "▾"}</span>
          </div>
        </button>

        {acctPanelOpen && (
        <div className="px-5 pb-5 space-y-3">

        {/* Unassigned accounts */}
        {unassignedAccounts.length > 0 && (
          <div className="bg-white rounded-lg border border-amber-200 p-3">
            <p className="text-xs text-amber-700 mb-2 font-medium">Unassigned accounts — assign to a building or General Expenses:</p>
            {unassignedAccounts.map((ua) => (
              <div key={ua.account_number} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="text-stone-600 font-mono text-xs bg-stone-100 px-2 py-0.5 rounded">{ua.account_number}</span>
                <span className="text-xs text-stone-400 capitalize">{ua.utility_type}</span>
                <span className="text-xs text-stone-400">({ua.count} bills)</span>
                <span className="text-xs text-stone-400 mx-1">→</span>
                <select disabled={!canEdit} onChange={(e) => {
                  const val = e.target.value;
                  if (val === "__general__") assignToGeneral(ua.account_number);
                  else if (val) saveAccountNumber(Number(val), ua.utility_type, ua.account_number);
                  e.target.value = "";
                }} className="border border-amber-300 rounded px-2 py-1 text-xs bg-white" defaultValue="">
                  <option value="">Assign to…</option>
                  <option value="__general__">General Expenses</option>
                  {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}

        {/* Building cards */}
        {buildings.map((b) => {
          const assignedUtils = Object.keys(b.account_numbers || {}).filter((k: string) => b.account_numbers?.[k]);
          return (
            <div key={b.id} className="bg-white rounded-lg border border-stone-200 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-stone-700">{b.name}</p>
                <select disabled={!canEdit} onChange={(e) => {
                  if (e.target.value) { setEditingAcct({ buildingId: b.id, utilType: e.target.value, value: "" }); e.target.value = ""; }
                }} className="border border-stone-300 rounded px-2 py-0.5 text-xs bg-white" defaultValue="">
                  <option value="">+ Add utility</option>
                  {UTIL_TYPE_OPTIONS.filter((ut) => !assignedUtils.includes(ut)).map((ut) => (
                    <option key={ut} value={ut}>{ut}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                {assignedUtils.map((ut: string) => {
                  const acct = b.account_numbers?.[ut];
                  const isEditing = editingAcct?.buildingId === b.id && editingAcct?.utilType === ut;
                  return (
                    <div key={ut} className="flex items-center gap-1 text-xs bg-stone-50 rounded-lg px-2 py-1">
                      <span className="text-stone-500 capitalize font-medium">{ut}:</span>
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input value={editingAcct.value} onChange={(e) => setEditingAcct({ ...editingAcct, value: e.target.value })}
                            className="border border-stone-300 rounded px-1.5 py-0.5 text-xs w-24 font-mono" autoFocus
                            onKeyDown={(e) => { if (e.key === "Enter") saveAccountNumber(b.id, ut, editingAcct.value); if (e.key === "Escape") setEditingAcct(null); }} />
                          <button onClick={() => saveAccountNumber(b.id, ut, editingAcct.value)} className="text-emerald-600 text-xs">✓</button>
                          <button onClick={() => canEdit && setEditingAcct(null)} className="text-stone-400 text-xs">✕</button>
                        </div>
                      ) : (
                        <>
                          <button onClick={() => canEdit && setEditingAcct({ buildingId: b.id, utilType: ut, value: acct || "" })}
                            className="font-mono px-1 rounded bg-white border border-stone-200 text-stone-600 hover:border-stone-400">
                            {acct || "set #"}
                          </button>
                          <button onClick={() => removeUtilFromBuilding(b.id, ut)}
                            className="text-stone-300 hover:text-red-500 ml-0.5" title="Remove utility">✕</button>
                        </>
                      )}
                    </div>
                  );
                })}
                {editingAcct && editingAcct.buildingId === b.id && !assignedUtils.includes(editingAcct.utilType) && (
                  <div className="flex items-center gap-1 text-xs bg-blue-50 rounded-lg px-2 py-1">
                    <span className="text-blue-600 capitalize font-medium">{editingAcct.utilType}:</span>
                    <input value={editingAcct.value} onChange={(e) => setEditingAcct({ ...editingAcct, value: e.target.value })}
                      placeholder="Account #" className="border border-blue-300 rounded px-1.5 py-0.5 text-xs w-24 font-mono" autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") saveAccountNumber(b.id, editingAcct.utilType, editingAcct.value); if (e.key === "Escape") setEditingAcct(null); }} />
                    <button onClick={() => saveAccountNumber(b.id, editingAcct.utilType, editingAcct.value)} className="text-emerald-600 text-xs">✓</button>
                    <button onClick={() => canEdit && setEditingAcct(null)} className="text-stone-400 text-xs">✕</button>
                  </div>
                )}
                {assignedUtils.length === 0 && !(editingAcct?.buildingId === b.id) && (
                  <span className="text-xs text-stone-400">No utilities assigned — use dropdown above to add</span>
                )}
              </div>
            </div>
          );
        })}

        {/* General Expenses card — editable like buildings */}
        <div className="bg-white rounded-lg border border-amber-300 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-amber-800">General Expenses</p>
              <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full">Non-building</span>
            </div>
          </div>
          {genBills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {genTypes.map((t: string) => {
                const typeBills = genBills.filter((u) => u.utility_type === t);
                const accts = Array.from(new Set<string>(typeBills.map((u) => u.account_number || "—").filter(Boolean)));
                return (
                  <div key={t} className="flex items-center gap-1 text-xs bg-amber-50 rounded-lg px-2 py-1">
                    <span className="text-amber-700 capitalize font-medium">{t}:</span>
                    <span className="font-mono text-amber-600">{accts.join(", ") || "—"}</span>
                    <span className="text-amber-400">({typeBills.length})</span>
                    <button disabled={!canEdit} onClick={() => unassignFromGeneral(t)}
                      className="text-amber-300 hover:text-red-500 ml-0.5" title="Remove from General Expenses">✕</button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-stone-400">No bills assigned yet. Use the dropdown on unassigned accounts to assign bills here.</p>
          )}
        </div>
        </div>
        )}
      </div>

      {/* ═══ Per-building/account charts ═══ */}
      {utilBuildings.map((building: string) => {
        const billsForBuilding = utilities.filter((u) => bldgName(u) === building);
        const isExpanded = expandedBuilding === building;
        const isUnassigned = building.startsWith("Acct #");
        const unassignedTypes: string[] | null = isUnassigned ? Array.from(new Set<string>(billsForBuilding.map((u) => String(u.utility_type || "other")))) : null;
        const allTypes: string[] = unassignedTypes && unassignedTypes.length > 0 ? unassignedTypes : [...UTIL_TYPES];
        const typesToShow: string[] = allTypes.filter((type: string) => {
          const md = utilBuildingData[building]?.[type] || {};
          return Object.values(md).some((v) => v > 0);
        });
        if (typesToShow.length === 0 && !isExpanded) return null;

        return (
          <div key={building} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isUnassigned ? (
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-base font-semibold text-stone-800" style={{ fontFamily: "'Fraunces', serif" }}>{building}</h2>
                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Unassigned</span>
                    {(unassignedTypes || []).map((t: string) => (
                      <span key={t} className="text-xs bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded-full capitalize">{t}</span>
                    ))}
                  </div>
                ) : (
                  <h2 className="text-base font-semibold text-stone-800" style={{ fontFamily: "'Fraunces', serif" }}>{building}</h2>
                )}
              </div>
              <button onClick={() => setExpandedBuilding(isExpanded ? null : building)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isExpanded ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}>
                {isExpanded ? "Close ▴" : `View/Edit ${billsForBuilding.length} bills ▾`}
              </button>
            </div>
            {typesToShow.length > 0 && (
              <div className={isUnassigned ? "p-5" : "grid grid-cols-2 divide-x divide-stone-100"}>{typesToShow.map((type: string) => {
                const md = utilBuildingData[building]?.[type] || {};
                const data = allMonths.map((m: string) => ({ month: fmtMonth(m + "-01"), amount: md[m] || 0 }));
                const hasData = data.some((d) => d.amount > 0);
                const withData = data.filter((d) => d.amount > 0);
                const prevVals = withData.slice(0, -1);
                const avg = prevVals.length > 0 ? prevVals.reduce((s: number, d) => s + d.amount, 0) / prevVals.length : null;
                const latest = withData.length > 0 ? withData[withData.length - 1].amount : 0;
                const pctVsAvg = avg ? ((latest - avg) / avg * 100) : null;
                const chartData = data.map((d) => ({ ...d, avg: avg || 0 }));
                return (
                  <div key={type} className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2"><span>{UTIL_ICON[type] || "📊"}</span><span className="text-sm font-medium text-stone-700">{UTIL_LABEL[type] || type}</span></div>
                      {hasData && <div className="text-right"><p className="text-sm font-semibold text-stone-800 tabular-nums">{money(latest)}</p>{pctVsAvg !== null && <p className={`text-xs font-medium tabular-nums ${pctVsAvg >= 0 ? "text-red-500" : "text-emerald-600"}`}>{pctVsAvg >= 0 ? "↑" : "↓"} {Math.abs(pctVsAvg).toFixed(1)}% vs avg</p>}</div>}
                    </div>
                    {hasData ? (
                      <div className="h-32"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" /><XAxis dataKey="month" tick={{ fontSize: 10, fill: "#a8a29e" }} tickLine={false} axisLine={false} /><YAxis tick={{ fontSize: 10, fill: "#a8a29e" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`} width={40} /><Line type="monotone" dataKey="amount" stroke={UTIL_COLOR[type] || "#6b7280"} strokeWidth={2} dot={{ r: 3, fill: UTIL_COLOR[type] || "#6b7280" }} />{avg ? <Line type="monotone" dataKey="avg" stroke="#d6d3d1" strokeWidth={1} strokeDasharray="4 4" dot={false} /> : null}<Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e7e5e4" }} formatter={(v, name) => [money(Number(v)), name === "avg" ? "Average" : (UTIL_LABEL[type] || type)]} /></LineChart></ResponsiveContainer></div>
                    ) : <div className="h-32 flex items-center justify-center"><p className="text-xs text-stone-300">No data</p></div>}
                  </div>
                );
              })}</div>
            )}

            {/* Expandable bill list */}
            {isExpanded && (
              <div className="border-t border-stone-100">
                <div className="px-6 py-2 bg-stone-50 text-xs text-stone-500 grid grid-cols-7 gap-2 font-medium">
                  <span>Date</span><span>Type</span><span>Amount</span><span>Account #</span><span>Usage</span><span>Provider</span><span></span>
                </div>
                <div className="divide-y divide-stone-50">
                  {billsForBuilding.sort((a, b) => new Date(b.bill_date).getTime() - new Date(a.bill_date).getTime()).map((bill) => (
                    <div key={bill.id} className="px-6 py-2 grid grid-cols-7 gap-2 items-center text-xs hover:bg-stone-50 group">
                      <EditableCell canEdit={canEdit} value={bill.bill_date} field="bill_date" billId={bill.id} type="date"
                        editingBill={editingBill} setEditingBill={setEditingBill} editUtilityBill={editUtilityBill} />
                      <EditableCell canEdit={canEdit} value={bill.utility_type} field="utility_type" billId={bill.id} type="select"
                        editingBill={editingBill} setEditingBill={setEditingBill} editUtilityBill={editUtilityBill} />
                      <EditableCell canEdit={canEdit} value={bill.total_amount != null ? `$${Number(bill.total_amount).toFixed(2)}` : "—"} rawValue={bill.total_amount} field="total_amount" billId={bill.id} type="number"
                        editingBill={editingBill} setEditingBill={setEditingBill} editUtilityBill={editUtilityBill} />
                      <EditableCell canEdit={canEdit} value={bill.account_number || "—"} field="account_number" billId={bill.id} type="text"
                        editingBill={editingBill} setEditingBill={setEditingBill} editUtilityBill={editUtilityBill} />
                      <span className="text-stone-500">{bill.usage_quantity ? `${bill.usage_quantity} ${bill.usage_unit || ""}` : "—"}</span>
                      <span className="text-stone-500 truncate">{bill.provider_name || "—"}</span>
                      <button disabled={!canEdit} onClick={() => deleteUtilityBill(bill.id)}
                        className="text-stone-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-right">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function EditableCell({ canEdit = false, value, rawValue, field, billId, type, editingBill, setEditingBill, editUtilityBill }: {
  canEdit?: boolean; value: string | number | null | undefined; rawValue?: string | number | null; field: string; billId: number; type: "text" | "number" | "date" | "select";
  editingBill: { id: number; field: string; value: string } | null; setEditingBill: (value: { id: number; field: string; value: string } | null) => void; editUtilityBill: (id: number, updates: Record<string, unknown>) => Promise<void>;
}) {
  const isEditing = editingBill?.id === billId && editingBill?.field === field;
  const displayVal = value != null ? String(value) : "—";

  if (isEditing) {
    if (type === "select") {
      return (
        <div className="flex items-center gap-1">
          <select disabled={!canEdit} value={editingBill.value} onChange={(e) => { editUtilityBill(billId, { [field]: e.target.value }); setEditingBill(null); }}
            autoFocus className="border border-stone-300 rounded px-1 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-stone-400">
            {UTIL_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1">
        <input value={editingBill.value} onChange={(e) => setEditingBill({ ...editingBill, value: e.target.value })}
          type={type === "date" ? "date" : "text"} autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") { editUtilityBill(billId, { [field]: editingBill.value }); setEditingBill(null); } if (e.key === "Escape") setEditingBill(null); }}
          className="border border-stone-300 rounded px-1.5 py-0.5 text-xs w-full focus:outline-none focus:ring-1 focus:ring-stone-400 font-mono" />
        <button onClick={() => { editUtilityBill(billId, { [field]: editingBill.value }); setEditingBill(null); }}
          className="text-emerald-600 text-xs flex-shrink-0">✓</button>
      </div>
    );
  }

  return (
    <span onClick={() => canEdit && setEditingBill({ id: billId, field, value: rawValue != null ? String(rawValue) : (displayVal === "—" ? "" : String(displayVal)) })}
      className="text-stone-600 cursor-pointer hover:text-blue-600 hover:underline tabular-nums truncate" title="Click to edit">
      {displayVal}
    </span>
  );
}
