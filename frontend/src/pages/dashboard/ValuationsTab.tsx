import { useState, useMemo } from "react";
import { money, fmtDate } from "./helpers";

export function ValuationsTab({ buildingVals, totalVal, totalValPct, appraisals, buildings, editAppraisal }: any) {
  const [expandedBuilding, setExpandedBuilding] = useState<string | null>(null);
  const [editingVal, setEditingVal] = useState<{ id: number; building: string; field: string; value: string } | null>(null);

  const latest = appraisals.length ? appraisals[appraisals.length - 1] : null;
  const expiration = latest?.expiration_date;

  // Build valuation history per building from ALL appraisals
  const buildingHistory = useMemo(() => {
    const hist: Record<string, { date: string; value: number; sqft: number; perSqft: number; id: number; filename: string }[]> = {};
    for (const a of appraisals) {
      const name = a.building_name || "Unknown";
      if (!hist[name]) hist[name] = [];
      const val = a.building_value || a.total_valuation || 0;
      const sqft = a.gross_sq_ft || 0;
      hist[name].push({
        date: a.appraisal_date || "",
        value: val,
        sqft,
        perSqft: sqft > 0 ? val / sqft : 0,
        id: a.id,
        filename: a.original_filename || "—",
      });
    }
    // Sort each building's history by date descending (newest first)
    for (const key of Object.keys(hist)) {
      hist[key].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    return hist;
  }, [appraisals]);

  // Pre-populate building list even without appraisal data
  if (buildingVals.length === 0) {
    return (
      <div className="space-y-4">
        {expiration && (
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-5 flex items-center justify-between">
            <div><p className="text-xs text-amber-600">Current Valuation Expires</p><p className="text-lg font-semibold text-amber-800">{fmtDate(expiration)}</p></div>
          </div>
        )}
        {buildings && buildings.length > 0 ? (
          <div className="space-y-3">
            {buildings.map((b: any) => (
              <div key={b.id} className="bg-white rounded-xl border border-stone-200 p-6 text-center">
                <h3 className="text-sm font-semibold text-stone-700 mb-2" style={{ fontFamily: "'Fraunces', serif" }}>{b.name}</h3>
                <p className="text-xs text-stone-400">No appraisal data yet. Upload an appraisal to see valuations.</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-stone-200 p-12 text-center">
            <p className="text-stone-400 text-sm">Add buildings to your parish, then upload an appraisal.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Expiration card */}
      {expiration && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-5 flex items-center justify-between">
          <div><p className="text-xs text-amber-600">Current Valuation Expires</p><p className="text-lg font-semibold text-amber-800">{fmtDate(expiration)}</p></div>
          {latest?.appraisal_date && <p className="text-xs text-amber-600">Appraised {fmtDate(latest.appraisal_date)}</p>}
        </div>
      )}

      {/* Total summary */}
      <div className="bg-white rounded-xl border border-stone-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-400 mb-1">Total Parish Valuation</p>
            <p className="text-3xl font-bold text-stone-800 tabular-nums" style={{ fontFamily: "'Fraunces', serif" }}>{money(totalVal)}</p>
            {latest?.appraisal_date && <p className="text-xs text-stone-400 mt-1">As of {fmtDate(latest.appraisal_date)}</p>}
          </div>
          <div className="text-right">
            {totalValPct !== null && <div className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold ${totalValPct >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{totalValPct >= 0 ? "↑" : "↓"} {Math.abs(totalValPct).toFixed(1)}%</div>}
            <p className="text-xs text-stone-400 mt-1">{buildingVals.length} buildings</p>
          </div>
        </div>
      </div>

      {/* Per-building cards with history */}
      {buildingVals.map((bv: any, i: number) => {
        const valPerSqft = bv.sqft > 0 ? bv.value / bv.sqft : 0;
        const history = buildingHistory[bv.name] || [];
        const isExpanded = expandedBuilding === bv.name;

        return (
          <div key={i} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-3 h-3 rounded-full" style={{ background: bv.color }} />
                    <h3 className="text-sm font-semibold text-stone-700" style={{ fontFamily: "'Fraunces', serif" }}>{bv.name}</h3>
                  </div>
                  <p className="text-2xl font-bold text-stone-800 tabular-nums">{money(bv.value)}</p>
                </div>
                {bv.pct !== null ? (
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full tabular-nums ${bv.pct >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                    {bv.pct >= 0 ? "↑" : "↓"} {Math.abs(bv.pct).toFixed(1)}%
                  </span>
                ) : <span className="text-xs text-stone-300">—</span>}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-stone-50 rounded-lg p-3">
                  <p className="text-xs text-stone-400">Value / sqft</p>
                  <p className="text-sm font-semibold text-stone-700 tabular-nums">{valPerSqft > 0 ? money(valPerSqft) : "—"}</p>
                </div>
                <div className="bg-stone-50 rounded-lg p-3">
                  <p className="text-xs text-stone-400">Gross sqft</p>
                  <p className="text-sm font-semibold text-stone-700 tabular-nums">{bv.sqft > 0 ? bv.sqft.toLocaleString() : "—"}</p>
                </div>
              </div>

              {/* History toggle */}
              {history.length > 0 && (
                <button onClick={() => setExpandedBuilding(isExpanded ? null : bv.name)}
                  className={`w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    isExpanded ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  }`}>
                  {isExpanded ? "Hide valuation history ▴" : `View ${history.length} valuation${history.length !== 1 ? "s" : ""} ▾`}
                </button>
              )}
            </div>

            {/* Expanded history — editable */}
            {isExpanded && history.length > 0 && (
              <div className="border-t border-stone-100">
                <div className="px-5 py-2 bg-stone-50 text-xs text-stone-500 grid grid-cols-5 gap-2 font-medium">
                  <span>Date</span><span>Value</span><span>Sq Ft</span><span>$/sqft</span><span>Source</span>
                </div>
                <div className="divide-y divide-stone-50">
                  {history.map((h, idx) => {
                    const isEditingThis = (f: string) => editingVal?.id === h.id && editingVal?.building === bv.name && editingVal?.field === f;
                    const startEdit = (f: string, v: string) => setEditingVal({ id: h.id, building: bv.name, field: f, value: v });
                    const saveEdit = () => {
                      if (editingVal) {
                        editAppraisal(editingVal.id, { building_name: editingVal.building, [editingVal.field]: editingVal.value });
                        setEditingVal(null);
                      }
                    };
                    return (
                    <div key={`${h.id}-${idx}`} className={`px-5 py-2.5 grid grid-cols-5 gap-2 items-center text-xs ${idx === 0 ? "bg-blue-50/50" : ""}`}>
                      <span className="text-stone-700 font-medium">{h.date ? fmtDate(h.date) : "—"}{idx === 0 && <span className="ml-1 text-blue-600 text-[10px]">Latest</span>}</span>
                      {isEditingThis("building_value") ? (
                        <div className="flex items-center gap-1">
                          <input value={editingVal!.value} onChange={(e) => setEditingVal({ ...editingVal!, value: e.target.value })}
                            autoFocus onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingVal(null); }}
                            className="border border-stone-300 rounded px-1.5 py-0.5 text-xs w-full font-mono" />
                          <button onClick={saveEdit} className="text-emerald-600 text-xs">✓</button>
                        </div>
                      ) : (
                        <span onClick={() => startEdit("building_value", String(h.value || ""))}
                          className="text-stone-700 tabular-nums font-medium cursor-pointer hover:text-blue-600 hover:underline">{money(h.value)}</span>
                      )}
                      {isEditingThis("gross_sq_ft") ? (
                        <div className="flex items-center gap-1">
                          <input value={editingVal!.value} onChange={(e) => setEditingVal({ ...editingVal!, value: e.target.value })}
                            autoFocus onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingVal(null); }}
                            className="border border-stone-300 rounded px-1.5 py-0.5 text-xs w-full font-mono" />
                          <button onClick={saveEdit} className="text-emerald-600 text-xs">✓</button>
                        </div>
                      ) : (
                        <span onClick={() => startEdit("gross_sq_ft", String(h.sqft || ""))}
                          className="text-stone-500 tabular-nums cursor-pointer hover:text-blue-600 hover:underline">{h.sqft > 0 ? h.sqft.toLocaleString() : "—"}</span>
                      )}
                      <span className="text-stone-500 tabular-nums">{h.perSqft > 0 ? money(h.perSqft) : "—"}</span>
                      <span className="text-stone-400 truncate" title={h.filename}>{h.filename}</span>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
