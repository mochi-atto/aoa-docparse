import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import api, { setAuthToken } from "../services/api";
import type { Asset, AssetDocument } from "../types";
import { ASSET_TYPES, WORTH_MIN_COST, WORTH_MIN_LIFE, computeSuggestions, worthVerdict, type Suggestion } from "../lib/assetHeuristics";

const THIS_YEAR = new Date().getFullYear();
const PLAN_YEARS = 10;
const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

type SortKey = "name" | "location" | "manufacturer" | "expected_life" | "remaining_life" | "initial_cost" | "annual_accrual" | "docs";
const SORT_VALUE: Record<SortKey, (a: Asset) => string | number> = {
  name: (a) => a.name.toLowerCase(), location: (a) => a.location.toLowerCase(), manufacturer: (a) => (a.manufacturer || "").toLowerCase(),
  expected_life: (a) => a.expected_life, remaining_life: (a) => a.remaining_life, initial_cost: (a) => a.initial_cost,
  annual_accrual: (a) => a.annual_accrual, docs: (a) => a.documents.length,
};

const EMPTY_FORM = { name: "", asset_type: "", location: "", manufacturer: "", year_installed: String(THIS_YEAR), expected_life: "", initial_cost: "" };
const EMPTY_FACTORS = { safety: false, ops: false, capital: false, warranty: false };

/** TEMPORARY pill: marks features backed by stand-in implementations. */
function TempBadge({ children = "Temporary" }: { children?: string }) {
  return <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold uppercase tracking-wide">{children}</span>;
}

interface Props {
  parishId: string | undefined;
  getAccessTokenSilently: () => Promise<string>;
  showToast: (msg: string, type?: "success" | "error") => void;
  onChanged: () => void; // refresh dashboard history after a change
}

export default function AssetsTab({ parishId, getAccessTokenSilently, showToast, onChanged }: Props) {
  const base = `/parishes/${parishId}/assets`;
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [locFilter, setLocFilter] = useState("");
  const [view, setView] = useState<"details" | "plan">("details");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "remaining_life", dir: 1 });
  const [docsAssetId, setDocsAssetId] = useState<number | null>(null);

  // Add-asset form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [factors, setFactors] = useState(EMPTY_FACTORS);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState<{ life: boolean; cost: boolean }>({ life: false, cost: false });
  // TEMPORARY manual lookup results for the form (sample catalog names)
  const [found, setFound] = useState<string[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const authed = useCallback(async () => { setAuthToken(await getAccessTokenSilently()); }, [getAccessTokenSilently]);

  const load = useCallback(async () => {
    try {
      await authed();
      setAssets((await api.get<Asset[]>(base)).data);
    } catch (err) { console.error("Asset load error:", err); showToast("Could not load assets", "error"); }
    finally { setLoading(false); }
  }, [authed, base, showToast]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, okMsg?: string) => {
    try { await authed(); await fn(); if (okMsg) showToast(okMsg); onChanged(); return true; }
    catch (err) { showToast(axios.isAxiosError(err) && err.response?.data?.detail || "Something went wrong", "error"); return false; }
  };
  const replace = (a: Asset) => setAssets((prev) => prev.map((x) => (x.id === a.id ? a : x)));

  // ── Derived table data ──
  const locations = useMemo(() => [...new Set(assets.map((a) => a.location))].sort(), [assets]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets
      .filter((a) => !locFilter || a.location === locFilter)
      .filter((a) => !q || [a.name, a.location, a.manufacturer || ""].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => { const x = SORT_VALUE[sort.key](a), y = SORT_VALUE[sort.key](b); return (x > y ? 1 : x < y ? -1 : 0) * sort.dir; });
  }, [assets, search, locFilter, sort]);
  const stats = {
    count: assets.length,
    due: assets.filter((a) => a.remaining_life <= 1).length,
    cost: assets.reduce((s, a) => s + a.initial_cost, 0),
    accrual: assets.reduce((s, a) => s + a.annual_accrual, 0),
  };

  // ── Form helpers ──
  const setField = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const life = Number(form.expected_life), cost = Number(form.initial_cost), year = Number(form.year_installed);
  const suggestions = useMemo(() => computeSuggestions(form.asset_type, form.manufacturer, year, THIS_YEAR), [form.asset_type, form.manufacturer, year]);
  const worth = worthVerdict(life, cost, Object.values(factors).filter(Boolean).length);

  // Re-open a dismissed suggestion when its value changes
  const lifeSugg = suggestions?.life.value, costSugg = suggestions?.cost.value;
  useEffect(() => { setDismissed((d) => ({ ...d, life: false })); }, [lifeSugg]);
  useEffect(() => { setDismissed((d) => ({ ...d, cost: false })); }, [costSugg]);

  // TEMPORARY: ask the API's sample catalog for manuals matching type + manufacturer
  useEffect(() => {
    if (!showForm || (!form.asset_type && !form.manufacturer.trim())) { setFound([]); setPicked(new Set()); return; }
    const t = setTimeout(async () => {
      try {
        await authed();
        const res = await api.get<{ manuals: string[] }>(`${base}/manual-lookup`, { params: { asset_type: form.asset_type || undefined, manufacturer: form.manufacturer || undefined } });
        setFound(res.data.manuals);
        setPicked(new Set(res.data.manuals));
      } catch { setFound([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [showForm, form.asset_type, form.manufacturer, authed, base]);

  const closeForm = () => { setShowForm(false); setForm(EMPTY_FORM); setFactors(EMPTY_FACTORS); setFiles([]); setFound([]); setPicked(new Set()); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const ok = await run(async () => {
      const created = (await api.post<Asset>(base, {
        name: form.name.trim(), asset_type: form.asset_type || null, location: form.location.trim(),
        manufacturer: form.manufacturer.trim() || null, year_installed: year, expected_life: life, initial_cost: cost,
        catalog_manuals: [...picked],
      })).data;
      let latest = created;
      if (files.length) {
        const fd = new FormData();
        files.forEach((f) => fd.append("files", f));
        latest = (await api.post<Asset>(`${base}/${created.id}/documents`, fd)).data;
      }
      setAssets((prev) => [...prev, latest]);
    }, "Asset added");
    setSaving(false);
    if (ok) closeForm();
  };

  // ── Row actions ──
  const commitAccrual = (a: Asset, raw: string) => {
    const v = raw === "" ? NaN : Number(raw);
    const isDefault = Math.round(v) === Math.round(a.initial_cost / a.expected_life);
    const next = Number.isFinite(v) && v >= 0 && !isDefault ? v : null;
    if (next === a.accrual_override) { load(); return; }
    run(async () => replace((await api.put<Asset>(`${base}/${a.id}`, { accrual_override: next })).data));
  };
  const removeAsset = (a: Asset) => {
    if (!window.confirm(`Remove "${a.name}" from tracked assets?`)) return;
    run(async () => { await api.delete(`${base}/${a.id}`); setAssets((prev) => prev.filter((x) => x.id !== a.id)); }, "Asset removed");
  };
  const th = (key: SortKey, label: string, num = false) => (
    <th key={key} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : 1 }))}
      className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-stone-500 cursor-pointer select-none whitespace-nowrap ${num ? "text-right" : "text-left"}`}>
      {label}{sort.key === key ? (sort.dir > 0 ? " ▲" : " ▼") : ""}
    </th>
  );
  const planYears = Array.from({ length: PLAN_YEARS }, (_, i) => `${THIS_YEAR + i}/${String(THIS_YEAR + i + 1).slice(2)}`);
  const input = "border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-300";
  const docsAsset = assets.find((a) => a.id === docsAssetId) || null;

  if (loading) return <div className="text-stone-400 text-sm py-12 text-center">Loading assets…</div>;

  const suggestionBox = (k: "life" | "cost", s: Suggestion | undefined, show: (v: number) => string, current: string) => {
    if (!s) return null;
    if (dismissed[k]) return <button type="button" onClick={() => setDismissed((d) => ({ ...d, [k]: false }))} className="text-xs text-stone-400 hover:text-stone-600 text-left">Show suggestion</button>;
    if (current !== "" && Number(current) === s.value) return <div className="text-xs text-stone-400">Applied suggestion {show(s.value)}</div>;
    return (
      <div className="rounded-lg bg-white border border-stone-200 px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-stone-400 uppercase tracking-wide font-semibold">Suggested</span>
          <span className="font-semibold text-stone-800">{show(s.value)}</span>
          <span className="flex-1" />
          <button type="button" onClick={() => setForm((f) => ({ ...f, [k === "life" ? "expected_life" : "initial_cost"]: String(s.value) }))} className="text-emerald-700 font-medium">Accept</button>
          <button type="button" onClick={() => setDismissed((d) => ({ ...d, [k]: true }))} className="text-stone-400">Dismiss</button>
        </div>
        <div className="text-stone-400 mt-1">{s.basis}</div>
      </div>
    );
  };

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[["Tracked assets", String(stats.count), ""], ["Due / past life (≤ 1 yr)", String(stats.due), stats.due ? "text-red-600" : ""], ["Total initial cost", money(stats.cost), ""], ["Annual accrual", money(stats.accrual), ""]].map(([label, value, cls]) => (
          <div key={label} className="bg-white rounded-xl border border-stone-200 px-4 py-3">
            <div className="text-xs text-stone-500">{label}</div>
            <div className={`text-2xl font-semibold mt-1 ${cls}`} style={{ fontFamily: "'Fraunces', serif" }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 p-4 border-b border-stone-100">
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search asset, location, manufacturer" className={`${input} w-72`} />
          <select value={locFilter} onChange={(e) => setLocFilter(e.target.value)} className={input}>
            <option value="">All locations</option>
            {locations.map((l) => <option key={l}>{l}</option>)}
          </select>
          <div className="inline-flex rounded-lg border border-stone-300 overflow-hidden text-sm">
            {([["details", "Details"], ["plan", "10-Year Accrual Plan"]] as const).map(([v, label]) => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-2 ${view === v ? "bg-stone-800 text-white" : "bg-white text-stone-600 hover:bg-stone-50"}`}>{label}</button>
            ))}
          </div>
          <span className="flex-1" />
          <button onClick={() => setShowForm((s) => !s)} className="bg-stone-800 hover:bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-medium">+ Add Asset</button>
        </div>

        {/* Add asset form */}
        {showForm && (
          <form onSubmit={submit} className="grid md:grid-cols-2 gap-x-6 gap-y-4 p-5 bg-stone-50 border-b border-stone-200">
            <div className="grid grid-cols-2 gap-3 content-start">
              <h4 className="col-span-2 text-sm font-semibold text-stone-700">Asset details</h4>
              <label className="col-span-2 flex flex-col gap-1 text-xs text-stone-500">Asset name
                <input required value={form.name} onChange={setField("name")} placeholder="e.g. Admin HVAC #5" className={input} /></label>
              <label className="flex flex-col gap-1 text-xs text-stone-500">Asset type
                <select value={form.asset_type} onChange={setField("asset_type")} className={input}><option value="">Select a type…</option>{ASSET_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
              <label className="flex flex-col gap-1 text-xs text-stone-500">Location
                <input required value={form.location} onChange={setField("location")} placeholder="e.g. Admin Building" className={input} /></label>
              <label className="flex flex-col gap-1 text-xs text-stone-500">Manufacturer
                <input value={form.manufacturer} onChange={setField("manufacturer")} placeholder="e.g. Trane" className={input} /></label>
              <label className="flex flex-col gap-1 text-xs text-stone-500">Year installed
                <input required type="number" min={1950} max={THIS_YEAR} value={form.year_installed} onChange={setField("year_installed")} className={input} /></label>
              <div className="col-span-2 flex flex-col gap-1 text-xs text-stone-500">
                <label htmlFor="asset-manuals">Manuals / instructions</label>
                <input id="asset-manuals" type="file" multiple onChange={(e) => setFiles([...(e.target.files || [])])} className="text-sm" />
                <div className="text-stone-400 flex items-center gap-1.5"><TempBadge>Temporary storage</TempBadge> Files are kept on the API server's local disk until real file storage is added.</div>
                {found.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 mt-1 space-y-1">
                    <div className="flex items-center gap-2 text-stone-600 font-medium"><TempBadge>Temporary lookup</TempBadge> Sample manuals matched — attached by name on save</div>
                    {found.map((n) => (
                      <label key={n} className="flex items-center gap-2 text-stone-700">
                        <input type="checkbox" checked={picked.has(n)} onChange={(e) => setPicked((p) => { const s = new Set(p); if (e.target.checked) s.add(n); else s.delete(n); return s; })} /> 📄 {n}
                      </label>
                    ))}
                    <div className="text-stone-500">These are placeholder entries from a built-in list, not real files from the manufacturer.</div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-3 content-start rounded-xl bg-stone-100 p-4">
              <h4 className="text-sm font-semibold text-stone-700">Life &amp; cost</h4>
              <p className="text-xs text-stone-400 -mt-2">Suggestions update from type, manufacturer and year installed.</p>
              <label className="flex flex-col gap-1 text-xs text-stone-500">Expected life (yrs)
                <input required type="number" min={1} value={form.expected_life} onChange={setField("expected_life")} className={input} /></label>
              {suggestionBox("life", suggestions?.life, (v) => `${v} yrs`, form.expected_life)}
              <label className="flex flex-col gap-1 text-xs text-stone-500">Initial cost ($)
                <input required type="number" min={0} value={form.initial_cost} onChange={setField("initial_cost")} className={input} /></label>
              {suggestionBox("cost", suggestions?.cost, money, form.initial_cost)}
              <dl className="grid grid-cols-2 gap-3 border-t border-stone-200 pt-3">
                <div><dt className="text-[11px] text-stone-500">Annual accrual</dt><dd className="font-semibold text-sm">{life && cost ? `${money(cost / life)} / yr` : "—"}</dd></div>
                <div><dt className="text-[11px] text-stone-500">Replace by</dt><dd className="font-semibold text-sm">{life && year ? year + life : "—"}</dd></div>
              </dl>
            </div>

            <div className="md:col-span-2 rounded-xl bg-stone-100 p-4 space-y-2">
              <h4 className="text-sm font-semibold text-stone-700">Worth tracking?</h4>
              <p className="text-xs text-stone-400">Cost and life are checked automatically; tick the rest that apply.</p>
              <div className="grid sm:grid-cols-2 gap-1 text-xs">
                <span className={cost >= WORTH_MIN_COST ? "text-emerald-700" : "text-stone-400"}>{cost >= WORTH_MIN_COST ? "✓" : "✗"} Replacement cost {cost ? money(cost) : "—"} (threshold {money(WORTH_MIN_COST)})</span>
                <span className={life >= WORTH_MIN_LIFE ? "text-emerald-700" : "text-stone-400"}>{life >= WORTH_MIN_LIFE ? "✓" : "✗"} Expected life {life ? `${life} yrs` : "—"} (threshold {WORTH_MIN_LIFE} yrs)</span>
              </div>
              {([["safety", "Safety or code critical (fire, egress, elevator, boiler)"], ["ops", "Parish operations stop or move if it fails"], ["capital", "Capital replacement, not routine upkeep or consumable"], ["warranty", "Warranty, service contract or insurance depends on it"]] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={factors[k]} onChange={(e) => setFactors((f) => ({ ...f, [k]: e.target.checked }))} /> {label}</label>
              ))}
              <div className={`text-sm rounded-lg bg-white border-l-4 px-3 py-2 ${worth.level === "yes" ? "border-emerald-600" : worth.level === "maybe" ? "border-amber-500" : "border-stone-300"}`}>
                {!life && !cost ? "Enter life and cost to see a recommendation." : (<>
                  <b>{worth.level === "yes" ? "Worth tracking" : worth.level === "maybe" ? "Borderline" : "Probably not worth tracking"}</b>
                  {" — "}{worth.level === "yes" ? "add it to the accrual plan." : worth.level === "maybe" ? "track it if the finance council wants visibility." : "handle it as routine maintenance."}
                  <span className="text-stone-400"> ({worth.score} of 6 factors)</span></>)}
              </div>
            </div>

            <div className="md:col-span-2 flex justify-end gap-2 pt-3 border-t border-stone-200">
              <button type="button" onClick={closeForm} className="px-4 py-2 rounded-lg text-sm border border-stone-300 text-stone-600 hover:bg-white">Cancel</button>
              <button type="submit" disabled={saving} className="bg-stone-800 hover:bg-stone-900 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">{saving ? "Saving…" : "Save asset"}</button>
            </div>
          </form>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 border-b border-stone-200"><tr>
              {view === "details"
                ? <>{th("name", "Asset")}{th("location", "Location")}{th("manufacturer", "Manufacturer")}{th("expected_life", "Expected life", true)}{th("remaining_life", "Remaining life", true)}{th("initial_cost", "Initial cost", true)}{th("annual_accrual", "Annual accrual", true)}{th("docs", "Documents")}<th /></>
                : <>{th("name", "Capital project")}{th("expected_life", "Expected life", true)}{th("remaining_life", "Remaining", true)}{th("initial_cost", "Projected expense", true)}{planYears.map((y) => <th key={y} className="px-3 py-2.5 text-xs font-semibold text-stone-500 text-right whitespace-nowrap">{y}</th>)}</>}
            </tr></thead>
            <tbody className="divide-y divide-stone-100">
              {rows.length === 0 && <tr><td colSpan={9} className="text-center text-stone-400 py-10">{assets.length ? "No assets match." : "No assets yet. Click + Add Asset to start tracking."}</td></tr>}
              {rows.map((a) => {
                const pct = Math.min(100, (a.remaining_life / a.expected_life) * 100);
                const bar = a.remaining_life <= 1 ? "bg-red-500" : a.remaining_life <= 3 ? "bg-amber-500" : "bg-emerald-500";
                const nameCls = a.remaining_life <= 1 ? "text-red-700" : "text-stone-800";
                if (view === "plan") return (
                  <tr key={a.id}>
                    <td className={`px-3 py-2.5 font-medium ${nameCls}`}>{a.name}</td>
                    <td className="px-3 py-2.5 text-right">{a.expected_life}</td><td className="px-3 py-2.5 text-right">{a.remaining_life}</td>
                    <td className="px-3 py-2.5 text-right">{money(a.initial_cost)}</td>
                    {planYears.map((y) => <td key={y} className="px-3 py-2.5 text-right tabular-nums">{money(a.annual_accrual)}</td>)}
                  </tr>
                );
                return (
                  <tr key={a.id}>
                    <td className="px-3 py-2.5"><div className={`font-medium ${nameCls}`}>{a.name}</div><div className="text-xs text-stone-400">Installed {a.year_installed}</div></td>
                    <td className="px-3 py-2.5">{a.location}</td>
                    <td className="px-3 py-2.5">{a.manufacturer || "—"}</td>
                    <td className="px-3 py-2.5 text-right">{a.expected_life} yrs</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">{a.remaining_life} yrs<span className="inline-block w-14 h-1.5 bg-stone-200 rounded-full ml-2 align-middle overflow-hidden"><span className={`block h-full ${bar}`} style={{ width: `${pct}%` }} /></span></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(a.initial_cost)}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <input key={`${a.id}-${a.annual_accrual}`} type="number" min={0} step={1} defaultValue={Math.round(a.annual_accrual)} aria-label={`Annual accrual for ${a.name}`}
                        onBlur={(e) => commitAccrual(a, e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                        className={`w-24 text-right border rounded px-2 py-1 text-sm tabular-nums ${a.accrual_override != null ? "border-amber-400 bg-amber-50" : "border-stone-200"}`} />
                      {a.accrual_override != null && <button onClick={() => run(async () => replace((await api.put<Asset>(`${base}/${a.id}`, { accrual_override: null })).data))} title={`Back to cost ÷ life (${money(a.initial_cost / a.expected_life)})`} className="ml-1 text-xs text-stone-400 hover:text-stone-700">reset</button>}
                    </td>
                    <td className="px-3 py-2.5"><button onClick={() => setDocsAssetId(a.id)} className="text-xs px-2 py-1 rounded-md border border-stone-200 hover:bg-stone-50 text-stone-600">📎 {a.documents.length} file{a.documents.length === 1 ? "" : "s"}</button></td>
                    <td className="px-3 py-2.5"><button onClick={() => removeAsset(a)} title="Delete asset" aria-label={`Delete ${a.name}`} className="text-stone-400 hover:text-red-500">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg></button></td>
                  </tr>
                );
              })}
              {view === "plan" && rows.length > 0 && (
                <tr className="bg-stone-50 font-semibold"><td className="px-3 py-2.5">Total</td><td /><td /><td className="px-3 py-2.5 text-right">{money(rows.reduce((s, a) => s + a.initial_cost, 0))}</td>
                  {planYears.map((y) => <td key={y} className="px-3 py-2.5 text-right tabular-nums">{money(rows.reduce((s, a) => s + a.annual_accrual, 0))}</td>)}</tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {docsAsset && <DocsDialog asset={docsAsset} base={base} run={run} replace={replace} onClose={() => setDocsAssetId(null)} />}
    </div>
  );
}

// ── Document holder ──

function DocsDialog({ asset, base, run, replace, onClose }: { asset: Asset; base: string; run: (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>; replace: (a: Asset) => void; onClose: () => void }) {
  const [suggested, setSuggested] = useState<string[]>([]);
  const have = new Set(asset.documents.map((d) => d.filename));

  // TEMPORARY manual lookup, by the asset's own type + manufacturer
  useEffect(() => {
    api.get<{ manuals: string[] }>(`${base}/manual-lookup`, { params: { asset_type: asset.asset_type || undefined, manufacturer: asset.manufacturer || undefined } })
      .then((r) => setSuggested(r.data.manuals)).catch(() => setSuggested([]));
  }, [base, asset.asset_type, asset.manufacturer]);

  const upload = (list: FileList | null) => {
    if (!list?.length) return;
    const fd = new FormData();
    [...list].forEach((f) => fd.append("files", f));
    run(async () => replace((await api.post<Asset>(`${base}/${asset.id}/documents`, fd)).data));
  };
  const open = (d: AssetDocument) => run(async () => {
    const res = await api.get(`${base}/${asset.id}/documents/${d.id}/file`, { responseType: "blob" });
    window.open(URL.createObjectURL(res.data), "_blank");
  });

  const todo = suggested.filter((n) => !have.has(n));
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-stone-800" style={{ fontFamily: "'Fraunces', serif" }}>{asset.name}</h3>
        <div className="text-sm text-stone-500 mb-3">Manuals and instructions for this asset</div>
        <ul className="divide-y divide-stone-100 border border-stone-200 rounded-lg mb-3">
          {asset.documents.length === 0 && <li className="px-3 py-3 text-sm text-stone-400">No documents attached yet.</li>}
          {asset.documents.map((d) => (
            <li key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="flex-1 truncate">📄 {d.has_file ? <button onClick={() => open(d)} className="hover:underline">{d.filename}</button> : d.filename}</span>
              {!d.has_file && <TempBadge>Name only</TempBadge>}
              <button onClick={() => run(async () => replace((await api.delete<Asset>(`${base}/${asset.id}/documents/${d.id}`)).data))} className="text-xs text-stone-400 hover:text-red-500">Remove</button>
            </li>
          ))}
        </ul>
        {todo.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 mb-3 text-sm">
            <div className="flex items-center gap-2 font-medium text-stone-700 mb-1"><TempBadge>Temporary lookup</TempBadge> Sample manuals for {asset.manufacturer || asset.asset_type}</div>
            {todo.map((n) => (
              <div key={n} className="flex items-center gap-2 py-0.5"><span className="flex-1 truncate">📄 {n}</span>
                <button onClick={() => run(async () => replace((await api.post<Asset>(`${base}/${asset.id}/documents/catalog`, { filenames: [n] })).data))} className="text-xs text-emerald-700 font-medium">+ Attach</button></div>
            ))}
            <div className="text-xs text-stone-500 mt-1">Placeholder names from a built-in list, not real files.</div>
          </div>
        )}
        <div className="text-xs text-stone-400 flex items-center gap-1.5 mb-3"><TempBadge>Temporary storage</TempBadge> Uploads live on the API server's local disk and may be lost on redeploy.</div>
        <div className="flex justify-between">
          <label className="px-3 py-2 rounded-lg text-sm border border-stone-300 text-stone-600 hover:bg-stone-50 cursor-pointer">+ Attach files
            <input type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} /></label>
          <button onClick={onClose} className="bg-stone-800 hover:bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-medium">Done</button>
        </div>
      </div>
    </div>
  );
}
