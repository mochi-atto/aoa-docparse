import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, ReferenceLine,
} from "recharts";
import api, { setAuthToken } from "../services/api";
import type { UtilityChartPoint, AppraisalChartPoint, UploadResponse } from "../types";

type DocType = "utility" | "appraisal";

const UTILITY_COLORS: Record<string, string> = {
  electric: "#f59e0b",
  gas: "#ef4444",
  water: "#3b82f6",
  sewer: "#8b5cf6",
  trash: "#6b7280",
  internet: "#10b981",
  phone: "#ec4899",
  other: "#94a3b8",
};

const PROGRESS_STEPS = {
  utility: [
    "Extracting text from PDF...",
    "Running OCR (if needed)...",
    "Sending to AI for extraction...",
    "Parsing response...",
    "Saving to database...",
  ],
  appraisal: [
    "Extracting text from PDF...",
    "Running pattern matching...",
    "Extracting building breakdown...",
    "Saving to database...",
  ],
};

interface MonthlyData {
  month: string;
  total: number;
  [key: string]: number | string;
}

interface FileResult {
  fileName: string;
  status: "pending" | "processing" | "success" | "error";
  message?: string;
  extracted_data?: Record<string, unknown>;
}

export default function DashboardPage() {
  const { parishId } = useParams();
  const { getAccessTokenSilently } = useAuth0();
  const navigate = useNavigate();

  const [docType, setDocType] = useState<DocType>("utility");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [fileResults, setFileResults] = useState<FileResult[]>([]);
  const [progressStep, setProgressStep] = useState(0);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const [utilityData, setUtilityData] = useState<UtilityChartPoint[]>([]);
  const [appraisalData, setAppraisalData] = useState<AppraisalChartPoint[]>([]);
  const [activeBuildings, setActiveBuildings] = useState<Set<string>>(new Set());

  const fetchData = async () => {
    const token = await getAccessTokenSilently();
    setAuthToken(token);
    const [uRes, aRes] = await Promise.all([
      api.get(`/data/utility/${parishId}`),
      api.get(`/data/appraisal/${parishId}`),
    ]);
    setUtilityData(uRes.data);
    setAppraisalData(aRes.data);
  };

  useEffect(() => {
    fetchData();
  }, [parishId]);

  useEffect(() => {
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, []);

  // Get unique building names for the filter
  const buildingNames = useMemo(() => {
    const names = new Set<string>();
    for (const item of utilityData) {
      const name = item.building_name || item.service_address;
      if (name) names.add(name);
    }
    return Array.from(names).sort();
  }, [utilityData]);

  // Auto-activate new buildings when data changes
  useEffect(() => {
    setActiveBuildings((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const name of buildingNames) {
        if (!next.has(name)) {
          next.add(name);
          changed = true;
        }
      }
      // Also include items with no building name
      if (!next.has("__none__")) {
        next.add("__none__");
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [buildingNames]);

  const toggleBuilding = (name: string) => {
    setActiveBuildings((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  // Filter utility data by active buildings
  const filteredUtilityData = useMemo(() => {
    return utilityData.filter((item) => {
      const name = item.building_name || item.service_address;
      if (!name) return activeBuildings.has("__none__");
      return activeBuildings.has(name);
    });
  }, [utilityData, activeBuildings]);

  // Transform utility data into monthly grouped data
  const { monthlyData, averageTotal, utilityTypes } = useMemo(() => {
    if (filteredUtilityData.length === 0) {
      return { monthlyData: [], averageTotal: 0, utilityTypes: [] };
    }

    const monthMap = new Map<string, Map<string, number>>();
    const typesSet = new Set<string>();

    for (const item of filteredUtilityData) {
      const dateStr = item.bill_date;
      const monthKey = dateStr.substring(0, 7);
      const utilType = (item.utility_type || "other").toLowerCase();
      typesSet.add(utilType);

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, new Map());
      }
      const typeMap = monthMap.get(monthKey)!;
      typeMap.set(utilType, (typeMap.get(utilType) || 0) + item.total_amount);
    }

    const types = Array.from(typesSet).sort();
    const sortedMonths = Array.from(monthMap.keys()).sort();
    const data: MonthlyData[] = sortedMonths.map((monthKey) => {
      const typeMap = monthMap.get(monthKey)!;
      const row: MonthlyData = { month: formatMonth(monthKey), total: 0 };
      for (const t of types) {
        const amount = typeMap.get(t) || 0;
        row[t] = amount;
        row.total += amount;
      }
      row.total = Math.round(row.total * 100) / 100;
      return row;
    });

    const avg =
      data.length > 0
        ? Math.round((data.reduce((sum, d) => sum + d.total, 0) / data.length) * 100) / 100
        : 0;

    return { monthlyData: data, averageTotal: avg, utilityTypes: types };
  }, [filteredUtilityData]);

  const startProgressSimulation = (type: DocType) => {
    setProgressStep(0);
    const steps = PROGRESS_STEPS[type];
    let step = 0;
    const intervalMs = type === "utility" ? 8000 : 3000;

    progressInterval.current = setInterval(() => {
      step++;
      if (step < steps.length - 1) {
        setProgressStep(step);
      }
    }, intervalMs);
  };

  const stopProgressSimulation = () => {
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);

    const token = await getAccessTokenSilently();
    setAuthToken(token);

    // Initialize results for all files
    const initialResults: FileResult[] = files.map((f) => ({
      fileName: f.name,
      status: "pending",
    }));
    setFileResults(initialResults);

    for (let i = 0; i < files.length; i++) {
      setCurrentFileIndex(i);
      startProgressSimulation(docType);

      // Mark current file as processing
      setFileResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: "processing" } : r))
      );

      try {
        const formData = new FormData();
        formData.append("file", files[i]);
        formData.append("parish_id", parishId!);
        formData.append("doc_type", docType);

        const res = await api.post("/upload/", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        stopProgressSimulation();

        // Mark as success
        setFileResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: "success",
                  message: res.data.message,
                  extracted_data: res.data.extracted_data,
                }
              : r
          )
        );

        // Refresh charts after each successful document
        await fetchData();
      } catch (err: unknown) {
        stopProgressSimulation();
        const errorMessage =
          err instanceof Error && "response" in err
            ? (err as { response?: { data?: { detail?: string } } }).response?.data
                ?.detail
            : undefined;

        setFileResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? { ...r, status: "error", message: errorMessage || "Upload failed" }
              : r
          )
        );
      }
    }

    setFiles([]);
    setUploading(false);
  };

  const steps = PROGRESS_STEPS[docType];
  const progressPercent = uploading
    ? Math.min(((progressStep + 1) / steps.length) * 100, 95)
    : 0;

  const totalFiles = fileResults.length;
  const completedFiles = fileResults.filter(
    (r) => r.status === "success" || r.status === "error"
  ).length;
  const successFiles = fileResults.filter((r) => r.status === "success").length;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate("/parishes")}
            className="text-slate-400 hover:text-slate-600 text-sm"
          >
            ← Back to Parishes
          </button>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        </div>

        {/* Upload Section */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-slate-700 mb-4">
            Upload Documents
          </h2>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex rounded-lg border border-slate-300 overflow-hidden text-sm">
              <button
                onClick={() => setDocType("utility")}
                disabled={uploading}
                className={`px-4 py-2 transition-colors ${
                  docType === "utility"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                Utility Bill
              </button>
              <button
                onClick={() => setDocType("appraisal")}
                disabled={uploading}
                className={`px-4 py-2 transition-colors ${
                  docType === "appraisal"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                Appraisal
              </button>
            </div>

            <input
              type="file"
              accept=".pdf"
              multiple
              disabled={uploading}
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
              className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 disabled:opacity-50"
            />

            <button
              onClick={handleUpload}
              disabled={files.length === 0 || uploading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {uploading
                ? `Processing ${currentFileIndex + 1}/${totalFiles}...`
                : files.length > 1
                ? `Upload & Parse (${files.length} files)`
                : "Upload & Parse"}
            </button>
          </div>

          {/* Selected files preview */}
          {files.length > 0 && !uploading && (
            <div className="mt-3 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <button
                  key={i}
                  onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                  className="group inline-flex items-center gap-1.5 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 text-xs px-2.5 py-1 rounded-full transition-colors"
                  title={`Remove ${f.name}`}
                >
                  📄 {f.name}
                  <span className="text-slate-300 group-hover:text-red-400 transition-colors">✕</span>
                </button>
              ))}
              {files.length > 1 && (
                <button
                  onClick={() => setFiles([])}
                  className="text-xs text-slate-400 hover:text-red-500 underline transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
          )}

          {docType === "appraisal" && !uploading && (
            <p className="mt-3 text-xs text-green-600 flex items-center gap-1">
              <span>🔒</span> Appraisal documents are processed locally — no data leaves your network.
            </p>
          )}

          {/* Upload guidance */}
          {!uploading && fileResults.length === 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs text-slate-400">
                <span className="font-medium text-slate-500">Note:</span> Each PDF should contain a single billing period only — do not upload documents that span multiple months.
              </p>
              <p className="text-xs text-slate-400">
                When uploading multiple files at once, please ensure they are all the same document type (all utility bills <span className="italic">or</span> all appraisals).
              </p>
            </div>
          )}

          {/* Progress section during upload */}
          {uploading && (
            <div className="mt-4 space-y-3">
              {/* Overall progress */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">
                  Document {currentFileIndex + 1} of {totalFiles}
                </span>
                <span className="text-xs text-slate-400">
                  {completedFiles} completed
                </span>
              </div>

              {/* Overall bar */}
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-blue-300 rounded-full transition-all duration-500"
                  style={{
                    width: `${((completedFiles + (progressPercent / 100)) / totalFiles) * 100}%`,
                  }}
                />
              </div>

              {/* Current file progress */}
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-600">
                    📄 {fileResults[currentFileIndex]?.fileName}
                  </span>
                  <span className="text-xs text-slate-400">
                    {steps[progressStep]}
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              <p className="text-xs text-slate-400">
                {docType === "utility"
                  ? "Utility bills may take 30–60 seconds each (OCR + AI extraction)..."
                  : "Appraisal parsing is local and usually takes a few seconds each..."}
              </p>
            </div>
          )}

          {/* Results after upload */}
          {!uploading && fileResults.length > 0 && (
            <div className="mt-4 space-y-2">
              {/* Summary */}
              <div
                className={`p-3 rounded-lg text-sm font-medium ${
                  successFiles === totalFiles
                    ? "bg-green-50 text-green-800 border border-green-200"
                    : "bg-amber-50 text-amber-800 border border-amber-200"
                }`}
              >
                {successFiles === totalFiles
                  ? `All ${totalFiles} document${totalFiles > 1 ? "s" : ""} parsed successfully!`
                  : `${successFiles} of ${totalFiles} documents parsed successfully.`}
              </div>

              {/* Per-file results */}
              {fileResults.map((result, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg text-sm border ${
                    result.status === "success"
                      ? "bg-white border-green-200"
                      : "bg-white border-red-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>
                      {result.status === "success" ? "✅" : "❌"}
                    </span>
                    <span className="font-medium text-slate-700">
                      {result.fileName}
                    </span>
                  </div>
                  {result.message && (
                    <p className="text-xs text-slate-500 mt-1 ml-6">
                      {result.message}
                    </p>
                  )}
                  {result.status === "success" && result.extracted_data && (
                    <details className="mt-1 ml-6">
                      <summary className="cursor-pointer text-xs text-slate-400">
                        View extracted data
                      </summary>
                      <pre className="mt-1 text-xs bg-slate-50 p-2 rounded overflow-auto max-h-32">
                        {JSON.stringify(result.extracted_data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}

              {/* Clear results button */}
              <button
                onClick={() => setFileResults([])}
                className="text-xs text-slate-400 hover:text-slate-600 underline"
              >
                Clear results
              </button>
            </div>
          )}
        </div>

        {/* Visualizations */}
        <div className="grid grid-cols-1 gap-8">
          {/* Summary Cards */}
          {monthlyData.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <SummaryCard
                label="Average Monthly"
                value={`$${averageTotal.toFixed(2)}`}
                sub="across all utilities"
              />
              <SummaryCard
                label="Latest Month"
                value={`$${monthlyData[monthlyData.length - 1].total.toFixed(2)}`}
                sub={monthlyData[monthlyData.length - 1].month}
                delta={
                  monthlyData.length > 1
                    ? monthlyData[monthlyData.length - 1].total - averageTotal
                    : undefined
                }
              />
              <SummaryCard
                label="Utility Types"
                value={`${utilityTypes.length}`}
                sub={utilityTypes.map(capitalize).join(", ")}
              />
              <SummaryCard
                label="Bills Uploaded"
                value={`${filteredUtilityData.length}`}
                sub={
                  buildingNames.length > 1
                    ? `${monthlyData.length} months — ${activeBuildings.size - (activeBuildings.has("__none__") ? 1 : 0)} of ${buildingNames.length} buildings`
                    : `${monthlyData.length} months of data`
                }
              />
            </div>
          )}

          {/* Monthly Utility Costs */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-700 mb-1">
                  Monthly Utility Costs by Type
                </h2>
                <p className="text-xs text-slate-400">
                  Stacked bars show cost breakdown — dashed line shows your average
                </p>
              </div>
              {/* Building filter */}
              {buildingNames.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-400">Buildings:</span>
                  {buildingNames.map((name) => (
                    <button
                      key={name}
                      onClick={() => toggleBuilding(name)}
                      className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                        activeBuildings.has(name)
                          ? "bg-blue-50 border-blue-300 text-blue-700"
                          : "bg-white border-slate-200 text-slate-400 line-through"
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                  {buildingNames.length > 1 && (
                    <button
                      onClick={() => {
                        const allActive = buildingNames.every((n) => activeBuildings.has(n));
                        if (allActive) {
                          setActiveBuildings(new Set(["__none__"]));
                        } else {
                          setActiveBuildings(new Set([...buildingNames, "__none__"]));
                        }
                      }}
                      className="text-xs text-slate-400 hover:text-slate-600 underline ml-1"
                    >
                      {buildingNames.every((n) => activeBuildings.has(n))
                        ? "Hide all"
                        : "Show all"}
                    </button>
                  )}
                </div>
              )}
            </div>
            {monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `$${v}`} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const total = payload.reduce(
                        (sum, p) => sum + (typeof p.value === "number" ? p.value : 0),
                        0
                      );
                      return (
                        <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
                          <p className="font-semibold text-slate-700 mb-1">{label}</p>
                          {payload
                            .filter(
                              (p) =>
                                p.dataKey !== "total" &&
                                typeof p.value === "number" &&
                                p.value > 0
                            )
                            .map((p) => (
                              <div key={p.dataKey} className="flex justify-between gap-4">
                                <span style={{ color: p.color }}>
                                  {capitalize(String(p.dataKey))}
                                </span>
                                <span className="font-medium">
                                  ${Number(p.value).toFixed(2)}
                                </span>
                              </div>
                            ))}
                          <div className="border-t border-slate-100 mt-1 pt-1 flex justify-between gap-4 font-semibold">
                            <span>Total</span>
                            <span>${total.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between gap-4 text-slate-400 text-xs mt-1">
                            <span>Avg</span>
                            <span>${averageTotal.toFixed(2)}</span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend formatter={(value: string) => capitalize(value)} />
                  {utilityTypes.map((type) => (
                    <Bar
                      key={type}
                      dataKey={type}
                      stackId="utilities"
                      fill={UTILITY_COLORS[type] || UTILITY_COLORS.other}
                      name={type}
                    />
                  ))}
                  <ReferenceLine
                    y={averageTotal}
                    stroke="#94a3b8"
                    strokeDasharray="6 4"
                    strokeWidth={2}
                    label={{
                      value: `Avg: $${averageTotal.toFixed(0)}`,
                      position: "insideTopRight",
                      fill: "#64748b",
                      fontSize: 12,
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-16 text-slate-400">
                <p className="text-4xl mb-3">📄</p>
                <p>Upload a utility bill to see cost trends over time!</p>
              </div>
            )}
          </div>

          {/* Appraisal Chart */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-700 mb-1">
              Insurance Appraisal Values
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Replacement cost, exclusion-adjusted value, and flood value over time
            </p>
            {appraisalData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={appraisalData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="appraisal_date" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v: number) =>
                      v >= 1_000_000
                        ? `$${(v / 1_000_000).toFixed(1)}M`
                        : `$${(v / 1_000).toFixed(0)}k`
                    }
                  />
                  <Tooltip
                    formatter={(value: number | string | undefined) => [
                      `$${Number(value ?? 0).toLocaleString()}`,
                      "",
                    ]}
                  />
                  <Legend />
                  <Bar dataKey="cost_of_replacement_new" fill="#3b82f6" name="Replacement Cost" />
                  <Bar dataKey="cost_less_exclusions" fill="#10b981" name="Less Exclusions" />
                  <Bar dataKey="flood_value" fill="#f59e0b" name="Flood Value" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-16 text-slate-400">
                <p className="text-4xl mb-3">🏠</p>
                <p>Upload an appraisal document to track property values!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Helper Components ---

function SummaryCard({
  label,
  value,
  sub,
  delta,
}: {
  label: string;
  value: string;
  sub: string;
  delta?: number;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <p className="text-2xl font-bold text-slate-800">{value}</p>
        {delta !== undefined && (
          <span
            className={`text-xs font-medium ${
              delta > 0 ? "text-red-500" : "text-green-500"
            }`}
          >
            {delta > 0 ? "+" : ""}${delta.toFixed(2)} vs avg
          </span>
        )}
      </div>
      <p className="text-xs text-slate-400 mt-1 truncate">{sub}</p>
    </div>
  );
}

// --- Helpers ---

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatMonth(yyyymm: string): string {
  const [year, month] = yyyymm.split("-");
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${monthNames[parseInt(month, 10) - 1]} ${year}`;
}