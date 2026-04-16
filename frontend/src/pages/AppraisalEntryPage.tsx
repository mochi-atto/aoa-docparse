import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import * as pdfjsLib from "pdfjs-dist";
import api, { setAuthToken } from "../services/api";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

// ── Helpers ──
function cleanMoney(v: string): string {
  const s = v.trim().replace(/^\$/, "").replace(/,/g, "").trim();
  return /^\d+\.?\d*$/.test(s) ? s : v.trim();
}
function cleanNumber(v: string): string {
  const s = v.trim().replace(/,/g, "").trim();
  return /^\d+$/.test(s) ? s : v.trim();
}
function extractValue(v: string): string {
  const m = v.match(/:\s*(.+)$/) || v.match(/\s{3,}(.+)$/);
  return m ? m[1].trim() : v.trim();
}

interface PageData { lines: string[]; imageSrc: string; }
interface BuildingEntry { key: string; name: string; valuation_number: string; building_value: string; gross_sq_ft: string; }

export default function AppraisalEntryPage() {
  const { parishId } = useParams<{ parishId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { getAccessTokenSilently } = useAuth0();

  const passedFile = (location.state as any)?.file as File | undefined;

  const [pdfFile, setPdfFile] = useState<File | null>(passedFile || null);
  const [pages, setPages] = useState<PageData[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [pdfZoom, setPdfZoom] = useState(1.0);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Document fields
  const [entityName, setEntityName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [appraisalDate, setAppraisalDate] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [appraiserFirm, setAppraiserFirm] = useState("");

  // Buildings — pre-populated from parish
  const [buildings, setBuildings] = useState<BuildingEntry[]>([]);
  const [loadingBuildings, setLoadingBuildings] = useState(true);

  // Load parish buildings on mount
  useEffect(() => {
    (async () => {
      try {
        const token = await getAccessTokenSilently();
        setAuthToken(token);
        const res = await api.get(`/parishes/${parishId}/buildings`);
        const parishBuildings = res.data;
        if (parishBuildings.length > 0) {
          setBuildings(parishBuildings.map((b: any) => ({
            key: String(b.id), name: b.name, valuation_number: "", building_value: "", gross_sq_ft: "",
          })));
        } else {
          setBuildings([{ key: crypto.randomUUID(), name: "", valuation_number: "", building_value: "", gross_sq_ft: "" }]);
        }
      } catch { setBuildings([{ key: crypto.randomUUID(), name: "", valuation_number: "", building_value: "", gross_sq_ft: "" }]); }
      finally { setLoadingBuildings(false); }
    })();
  }, [parishId, getAccessTokenSilently]);

  // PDF loading
  const loadPdf = useCallback(async (file: File) => {
    setPdfFile(file); setExtracting(true);
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      const arr: PageData[] = [];
      for (let i = 0; i < pdf.numPages; i++) {
        const page = await pdf.getPage(i + 1);
        const tc = await page.getTextContent();
        const items: { str: string; x: number; y: number; width: number }[] = [];
        for (const item of tc.items) { if ("str" in item) { const t = item as any; items.push({ str: t.str, x: t.transform[4], y: Math.round(t.transform[5] * 10) / 10, width: t.width }); } }
        const groups: { y: number; items: typeof items }[] = [];
        for (const item of items) { const g = groups.find((g) => Math.abs(g.y - item.y) <= 3); if (g) g.items.push(item); else groups.push({ y: item.y, items: [item] }); }
        groups.sort((a, b) => b.y - a.y);
        const lines: string[] = [];
        for (const g of groups) { g.items.sort((a, b) => a.x - b.x); let l = ""; for (let k = 0; k < g.items.length; k++) { if (k > 0) l += g.items[k].x - (g.items[k - 1].x + g.items[k - 1].width) > 10 ? "    " : " "; l += g.items[k].str; } if (l.trim()) lines.push(l.trim()); }
        const vp = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement("canvas"); canvas.width = vp.width; canvas.height = vp.height;
        await page.render({ canvas, viewport: vp } as any).promise;
        arr.push({ lines, imageSrc: canvas.toDataURL("image/jpeg", 0.8) });
      }
      setPages(arr);
    } catch (err) { console.error(err); }
    finally { setExtracting(false); }
  }, []);

  useEffect(() => { if (passedFile) loadPdf(passedFile); }, [passedFile, loadPdf]);

  const smartPaste = (setter: (v: string) => void, type: "text" | "money" | "number" | "date") => (e: React.ClipboardEvent) => {
    e.preventDefault();
    const raw = e.clipboardData.getData("text");
    const val = extractValue(raw);
    setter(type === "money" ? cleanMoney(val) : type === "number" ? cleanNumber(val) : val);
  };

  const updateBuilding = (key: string, field: keyof BuildingEntry, value: string) => {
    setBuildings((p) => p.map((b) => b.key === key ? { ...b, [field]: value } : b));
  };

  const handleSave = async () => {
    if (!parishId) return;
    setSaving(true); setSaveMsg("");
    try {
      const token = await getAccessTokenSilently();
      setAuthToken(token);
      await api.post("/data/appraisal/manual", {
        parish_id: parseInt(parishId),
        filename: pdfFile?.name || "manual_entry",
        entity_name: entityName || null,
        property_address: propertyAddress || null,
        appraisal_date: appraisalDate || null,
        expiration_date: expirationDate || null,
        appraiser_firm: appraiserFirm || null,
        buildings: buildings.filter((b) => b.name.trim()).map((b) => ({
          name: b.name, valuation_number: b.valuation_number || null,
          building_value: b.building_value || null, gross_sq_ft: b.gross_sq_ft || null,
        })),
      });
      setSaveMsg("Saved!");
      setTimeout(() => navigate(`/dashboard/${parishId}`), 1200);
    } catch (err: any) { setSaveMsg(err?.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  // ── Render ──
  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap" rel="stylesheet" />
      <div className="h-screen flex flex-col bg-stone-50" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <header className="bg-white border-b border-stone-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(`/dashboard/${parishId}`)} className="text-stone-400 hover:text-stone-600 text-sm">← Dashboard</button>
            <div className="w-px h-5 bg-stone-200" />
            <h1 className="text-lg font-semibold text-stone-800" style={{ fontFamily: "'Fraunces', serif" }}>Appraisal Entry</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-xs px-2.5 py-1 rounded-full border border-green-200">🔒 Fully local</span>
            {!pdfFile && <label className="bg-stone-800 hover:bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer">Select PDF<input type="file" accept=".pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadPdf(f); }} /></label>}
            <div className="flex items-center gap-1">
              <button onClick={() => setPdfZoom((z) => Math.max(0.5, z - 0.25))} className="text-xs px-2 py-1 rounded border border-stone-300 hover:bg-stone-100">−</button>
              <span className="text-xs text-stone-500 w-8 text-center">{Math.round(pdfZoom * 100)}%</span>
              <button onClick={() => setPdfZoom((z) => Math.min(3, z + 0.25))} className="text-xs px-2 py-1 rounded border border-stone-300 hover:bg-stone-100">+</button>
            </div>
          </div>
        </header>

        {(extracting || loadingBuildings) && <div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 border-2 border-stone-300 border-t-stone-600 rounded-full animate-spin" /></div>}

        {!pdfFile && !extracting && !loadingBuildings && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <p className="text-4xl mb-4">📄</p>
              <h2 className="text-lg font-semibold text-stone-700 mb-2">Load an appraisal document</h2>
              <p className="text-sm text-stone-400 mb-4">The PDF stays in your browser. Copy values and paste into the form.</p>
              <label className="bg-stone-800 hover:bg-stone-900 text-white px-6 py-3 rounded-lg text-sm font-medium cursor-pointer inline-block">Select PDF<input type="file" accept=".pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadPdf(f); }} /></label>
            </div>
          </div>
        )}

        {pdfFile && !extracting && !loadingBuildings && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left: PDF */}
            <div className="flex-1 overflow-auto bg-stone-100">
              <div className="p-4 space-y-4">
                {pages.map((page, i) => (
                  <div key={i}>
                    <p className="text-xs text-stone-400 text-center mb-2">— Page {i + 1} —</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white rounded-lg border border-stone-200 p-2 overflow-hidden">
                        <img src={page.imageSrc} alt="" className="w-full rounded" style={{ transform: `scale(${pdfZoom})`, transformOrigin: "top left" }} />
                      </div>
                      <div className="bg-white rounded-lg border border-stone-200 p-3 overflow-auto">
                        <p className="text-xs text-stone-300 mb-2">Select text → paste into form</p>
                        {page.lines.map((line, j) => (
                          <p key={j} className="text-xs leading-relaxed py-0.5 px-1.5 hover:bg-amber-50 rounded cursor-text select-text font-mono text-stone-700">{line}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Form */}
            <div className="w-[400px] flex-shrink-0 border-l border-stone-200 bg-white overflow-auto">
              <div className="p-5 space-y-5">
                <div className="bg-blue-50 rounded-lg border border-blue-100 p-3">
                  <p className="text-xs text-blue-800 font-semibold mb-1">Paste from PDF</p>
                  <p className="text-xs text-blue-600">Select text on the left, paste here. Dollar signs and commas are stripped automatically.</p>
                </div>

                {/* Document Info */}
                <fieldset className="border border-stone-200 rounded-lg p-4">
                  <legend className="text-xs font-semibold text-stone-600 px-1">Document Info</legend>
                  <div className="space-y-3">
                    <Fld label="Appraisal Firm" value={appraiserFirm} set={setAppraiserFirm} paste={smartPaste(setAppraiserFirm, "text")} />
                    <div className="grid grid-cols-2 gap-3">
                      <Fld label="Appraisal Date" value={appraisalDate} set={setAppraisalDate} paste={smartPaste(setAppraisalDate, "date")} type="date" />
                      <Fld label="Expiration Date" value={expirationDate} set={setExpirationDate} paste={smartPaste(setExpirationDate, "date")} type="date" />
                    </div>
                    <Fld label="Property Address" value={propertyAddress} set={setPropertyAddress} paste={smartPaste(setPropertyAddress, "text")} />
                    <Fld label="Entity / Property Name" value={entityName} set={setEntityName} paste={smartPaste(setEntityName, "text")} />
                  </div>
                </fieldset>

                {/* Buildings */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-stone-700" style={{ fontFamily: "'Fraunces', serif" }}>Buildings</h3>
                    <button onClick={() => setBuildings((p) => [...p, { key: crypto.randomUUID(), name: "", valuation_number: "", building_value: "", gross_sq_ft: "" }])}
                      className="text-xs text-stone-500 hover:text-stone-800 font-medium border border-dashed border-stone-300 rounded-full px-2.5 py-1">+ Add</button>
                  </div>
                  <div className="space-y-3">
                    {buildings.map((b, idx) => (
                      <fieldset key={b.key} className="border border-stone-200 rounded-lg p-4 relative">
                        <legend className="text-xs font-semibold text-stone-600 px-1">{b.name || `Building ${idx + 1}`}</legend>
                        {buildings.length > 1 && <button onClick={() => setBuildings((p) => p.filter((x) => x.key !== b.key))} className="absolute top-2 right-3 text-stone-400 hover:text-red-500 text-xs">✕</button>}
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <Fld label="Building Name" value={b.name} set={(v) => updateBuilding(b.key, "name", v)} paste={smartPaste((v) => updateBuilding(b.key, "name", v), "text")} />
                            <Fld label="Valuation ID / Item #" value={b.valuation_number} set={(v) => updateBuilding(b.key, "valuation_number", v)} paste={smartPaste((v) => updateBuilding(b.key, "valuation_number", v), "text")} />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <Fld label="Building Value" value={b.building_value} set={(v) => updateBuilding(b.key, "building_value", v)} paste={smartPaste((v) => updateBuilding(b.key, "building_value", v), "money")} prefix="$" />
                            <Fld label="Gross Sq Ft" value={b.gross_sq_ft} set={(v) => updateBuilding(b.key, "gross_sq_ft", v)} paste={smartPaste((v) => updateBuilding(b.key, "gross_sq_ft", v), "number")} />
                          </div>
                        </div>
                      </fieldset>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-stone-100">
                  <button onClick={handleSave} disabled={saving}
                    className="w-full bg-stone-800 hover:bg-stone-900 disabled:bg-stone-300 text-white py-3 rounded-lg text-sm font-medium">
                    {saving ? "Saving…" : "Save Appraisal"}
                  </button>
                  {saveMsg && <p className={`text-xs mt-2 text-center ${saveMsg.includes("Saved") ? "text-emerald-600" : "text-red-500"}`}>{saveMsg}</p>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Fld({ label, value, set, paste, type, prefix }: { label: string; value: string; set: (v: string) => void; paste?: (e: React.ClipboardEvent) => void; type?: string; prefix?: string }) {
  return (
    <div>
      <label className="text-xs text-stone-500 block mb-0.5">{label}</label>
      <div className="relative">
        {prefix && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-stone-400">{prefix}</span>}
        <input type={type || "text"} value={value} onChange={(e) => set(e.target.value)} onPaste={paste}
          className={`w-full border border-stone-300 rounded-lg py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-stone-400 ${prefix ? "pl-6 pr-2.5" : "px-2.5"}`} />
      </div>
    </div>
  );
}