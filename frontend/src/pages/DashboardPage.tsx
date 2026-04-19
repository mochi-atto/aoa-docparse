import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import api, { setAuthToken } from "../services/api";

// ══════════════════════════════════════════
// Types
// ══════════════════════════════════════════

interface BuildingData { id: number; name: string; account_numbers: Record<string, string> | null; }
interface Parish { id: number; name: string; diocese: string; address: string; image_data?: string; buildings?: BuildingData[]; }
interface UtilityBill { id: number; utility_type: string; bill_date: string; total_amount: number; building_name?: string; service_address?: string; account_number?: string; original_filename?: string; usage_quantity?: number; usage_unit?: string; provider_name?: string; }
interface Appraisal { id: number; entity_name?: string; appraisal_date?: string; building_name?: string; building_value?: number; total_valuation?: number; gross_sq_ft?: number; property_address?: string; original_filename?: string; appraiser_firm?: string; expiration_date?: string; valuation_number?: string; content_value?: number; }
interface TodoItem { id: number; text: string; building: string; priority: "red" | "yellow" | "green" | "blue"; prevPriority?: "red" | "yellow" | "green"; done: boolean; createdAt: string; }
interface HistoryEntry { id: number; type: string; description: string; date: string; undone?: string; user_email?: string; user_name?: string; }

type TabKey = "dashboard" | "utility" | "valuations" | "risks" | "finances" | "history";

// ══════════════════════════════════════════
// Constants
// ══════════════════════════════════════════

const PRIORITY = {
  red:    { label: "Overdue",   desc: "Past deadline — needs immediate attention",     bg: "bg-red-50",     border: "border-red-200",    dot: "bg-red-500",     badge: "bg-red-100 text-red-700",         ring: "ring-red-300" },
  yellow: { label: "At Risk",   desc: "Approaching deadline — plan action soon",       bg: "bg-amber-50",   border: "border-amber-200",  dot: "bg-amber-500",   badge: "bg-amber-100 text-amber-700",     ring: "ring-amber-300" },
  green:  { label: "Due Soon",  desc: "Upcoming task — no immediate concern",          bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700", ring: "ring-emerald-300" },
  blue:   { label: "Addressed", desc: "Completed or scheduled — cleared end of month", bg: "bg-sky-50",     border: "border-sky-200",    dot: "bg-sky-500",     badge: "bg-sky-100 text-sky-700",         ring: "ring-sky-300" },
} as const;

const PRIO_ORDER: (keyof typeof PRIORITY)[] = ["red", "yellow", "green", "blue"];

const UTIL_TYPES = ["electric", "water", "gas", "waste"] as const;
const UTIL_LABEL: Record<string, string> = { electric: "Electric", water: "Water", gas: "Gas", waste: "Waste" };
const UTIL_COLOR: Record<string, string> = { electric: "#f59e0b", water: "#3b82f6", gas: "#ef4444", waste: "#8b5cf6" };
const UTIL_ICON: Record<string, string> = { electric: "⚡", water: "💧", gas: "🔥", waste: "♻️" };
const UTIL_TYPE_OPTIONS = ["electric", "water", "gas", "waste", "internet", "phone", "other"];

const BAR_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

const TABS: { key: TabKey; label: string }[] = [
  { key: "dashboard",  label: "Dashboard" },
  { key: "utility",    label: "Utility Use" },
  { key: "valuations", label: "Building Valuations" },
  { key: "risks",      label: "Active Risks" },
  { key: "finances",   label: "Finances" },
  { key: "history",    label: "History" },
];

// ══════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtMonth = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" });
const fmtMonthLong = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "long", year: "numeric" });
const fmtTime = (d: string) => new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const monthKey = (d: string) => { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`; };

const PRIO_SORT: Record<string, number> = { red: 0, yellow: 1, green: 2, blue: 3 };
const sortByPriority = (a: { priority: string }, b: { priority: string }) => (PRIO_SORT[a.priority] ?? 9) - (PRIO_SORT[b.priority] ?? 9);

/** Resolve a display name for a building from utility bill fields — backend resolves account numbers */
const bldgName = (u: any): string => u.building_name || u.service_address || (u.account_number ? `Acct #${u.account_number}` : "Unassigned");

// ══════════════════════════════════════════
// Component
// ══════════════════════════════════════════

export default function DashboardPage() {
  const { parishId } = useParams<{ parishId: string }>();
  const navigate = useNavigate();
  const { getAccessTokenSilently, user, logout } = useAuth0();

  // Data
  const [parish, setParish] = useState<Parish | null>(null);
  const [utilities, setUtilities] = useState<UtilityBill[]>([]);
  const [appraisals, setAppraisals] = useState<Appraisal[]>([]);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<BuildingData[]>([]);

  // UI
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  // Upload — multi-file staging
  const [uploadType, setUploadType] = useState<"utility" | "appraisal">("utility");
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, { status: "pending" | "parsing" | "done" | "error"; progress: number; msg?: string }>>({});
  const [uploadMsg, setUploadMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Todos & History — loaded from API
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [parishImage, setParishImage] = useState<string | null>(null);

  // Add task form (used from dashboard + risks tab)
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskText, setNewTaskText] = useState("");
  const [newTaskBuilding, setNewTaskBuilding] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"red" | "yellow" | "green">("green");

  // Edit task
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editTaskText, setEditTaskText] = useState("");
  const [editTaskPriority, setEditTaskPriority] = useState<TodoItem["priority"]>("green");
  const [editTaskBuilding, setEditTaskBuilding] = useState("");

  // History filter (for history tab)
  const [historyFilter, setHistoryFilter] = useState<string>("all");

  // Building management
  const [showBuildingMgmt, setShowBuildingMgmt] = useState(false);
  const [newBuildingName, setNewBuildingName] = useState("");
  const [confirmDeleteBuilding, setConfirmDeleteBuilding] = useState<number | null>(null);
  const [renamingBuilding, setRenamingBuilding] = useState<{ id: number; name: string } | null>(null);

  // Toast notifications
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Persist
  // Close menu on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setUserMenuOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Fetch all data
  const refreshData = useCallback(async () => {
    try {
      const token = await getAccessTokenSilently();
      setAuthToken(token);
      const [pRes, uRes, aRes, tRes, todoRes, histRes] = await Promise.all([
        api.get(`/parishes/${parishId}`),
        api.get(`/data/utility/${parishId}`),
        api.get(`/data/appraisal/${parishId}`),
        api.get(`/templates/`).catch(() => ({ data: [] })),
        api.get(`/parishes/${parishId}/todos`),
        api.get(`/parishes/${parishId}/history`),
      ]);
      setParish(pRes.data);
      setBuildings(pRes.data.buildings || []);
      setParishImage(pRes.data.image_data || null);
      setUtilities(uRes.data);
      setAppraisals(aRes.data);
      setTemplates(tRes.data);
      setTodos(todoRes.data.map((t: any) => ({
        id: t.id, text: t.text, building: t.building,
        priority: t.priority, prevPriority: t.prev_priority,
        done: t.done, createdAt: t.created_at,
      })));
      setHistory(histRes.data.map((h: any) => ({
        id: h.id, type: h.entry_type, description: h.description, date: h.created_at, undone: h.undone, user_email: h.user_email, user_name: h.user_name,
      })));
    } catch (err) { console.error("Dashboard load error:", err); }
    finally { setLoading(false); }
  }, [parishId, getAccessTokenSilently]);

  useEffect(() => { refreshData(); }, [refreshData]);

  // ── History helper (API-backed) ──
  const addHistory = useCallback(async (type: string, description: string) => {
    try {
      const token = await getAccessTokenSilently();
      setAuthToken(token);
      const res = await api.post(`/parishes/${parishId}/history`, { entry_type: type, description });
      const h = res.data;
      setHistory((prev) => [{ id: h.id, type: h.entry_type, description: h.description, date: h.created_at, undone: h.undone, user_email: h.user_email, user_name: h.user_name }, ...prev]);
    } catch { /* silent */ }
  }, [parishId, getAccessTokenSilently]);

  // ── Todo handlers (API-backed) ──
  const toggleTodo = async (id: number) => {
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;
    try {
      const token = await getAccessTokenSilently();
      setAuthToken(token);
      const res = await api.put(`/parishes/${parishId}/todos/${id}`, { done: !todo.done });
      const t = res.data;
      setTodos((prev) => prev.map((x) => x.id === id ? { id: t.id, text: t.text, building: t.building, priority: t.priority, prevPriority: t.prev_priority, done: t.done, createdAt: t.created_at } : x));
      const hRes = await api.get(`/parishes/${parishId}/history`);
      setHistory(hRes.data.map((h: any) => ({ id: h.id, type: h.entry_type, description: h.description, date: h.created_at, undone: h.undone, user_email: h.user_email, user_name: h.user_name })));
    } catch (err) { console.error(err); }
  };

  const addTask = async () => {
    if (!newTaskText.trim() || !newTaskBuilding.trim()) return;
    try {
      const token = await getAccessTokenSilently();
      setAuthToken(token);
      const res = await api.post(`/parishes/${parishId}/todos`, {
        text: newTaskText.trim(), building: newTaskBuilding.trim(), priority: newTaskPriority,
      });
      const t = res.data;
      setTodos((p) => [...p, { id: t.id, text: t.text, building: t.building, priority: t.priority, prevPriority: t.prev_priority, done: t.done, createdAt: t.created_at }]);
      // Refresh history
      const hRes = await api.get(`/parishes/${parishId}/history`);
      setHistory(hRes.data.map((h: any) => ({ id: h.id, type: h.entry_type, description: h.description, date: h.created_at, undone: h.undone, user_email: h.user_email, user_name: h.user_name })));
      setNewTaskText(""); setNewTaskBuilding(""); setNewTaskPriority("green"); setShowAddTask(false);
    } catch (err) { console.error(err); }
  };

  const startEditTask = (t: TodoItem) => { setEditingTaskId(t.id); setEditTaskText(t.text); setEditTaskPriority(t.priority); setEditTaskBuilding(t.building); };

  const saveEditTask = async (id: number) => {
    try {
      const token = await getAccessTokenSilently();
      setAuthToken(token);
      const res = await api.put(`/parishes/${parishId}/todos/${id}`, { text: editTaskText, priority: editTaskPriority, building: editTaskBuilding });
      const t = res.data;
      setTodos((prev) => prev.map((x) => x.id === id ? { id: t.id, text: t.text, building: t.building, priority: t.priority, prevPriority: t.prev_priority, done: t.done, createdAt: t.created_at } : x));
      const hRes = await api.get(`/parishes/${parishId}/history`);
      setHistory(hRes.data.map((h: any) => ({ id: h.id, type: h.entry_type, description: h.description, date: h.created_at, undone: h.undone, user_email: h.user_email, user_name: h.user_name })));
      setEditingTaskId(null);
      showToast("Task updated");
    } catch (err) { console.error(err); showToast("Failed to update task", "error"); }
  };

  const deleteTask = async (id: number) => {
    try {
      const token = await getAccessTokenSilently();
      setAuthToken(token);
      await api.delete(`/parishes/${parishId}/todos/${id}`);
      setTodos((p) => p.filter((x) => x.id !== id));
      const hRes = await api.get(`/parishes/${parishId}/history`);
      setHistory(hRes.data.map((h: any) => ({ id: h.id, type: h.entry_type, description: h.description, date: h.created_at, undone: h.undone, user_email: h.user_email, user_name: h.user_name })));
    } catch (err) { console.error(err); }
  };

  // ── Upload handlers ──
  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setStagedFiles((prev) => [...prev, ...Array.from(files)]);
    setUploadMsg("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const removeStagedFile = (idx: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const parseAndUpload = async () => {
    if (stagedFiles.length === 0 || !parishId) return;

    // For appraisals, redirect to the guided entry page with the first file
    if (uploadType === "appraisal") {
      const file = stagedFiles[0];
      setStagedFiles([]);
      navigate(`/dashboard/${parishId}/appraisal-entry`, { state: { file, filename: file.name } });
      return;
    }

    // Utility upload flow (unchanged)
    setUploading(true); setUploadMsg("");

    const progress: Record<string, { status: "pending" | "parsing" | "done" | "error"; progress: number; msg?: string }> = {};
    stagedFiles.forEach((f) => { progress[f.name] = { status: "pending", progress: 0 }; });
    setUploadProgress({ ...progress });

    try {
      const token = await getAccessTokenSilently();
      setAuthToken(token);

      let successCount = 0;
      for (let i = 0; i < stagedFiles.length; i++) {
        const file = stagedFiles[i];
        progress[file.name] = { status: "parsing", progress: 30 };
        setUploadProgress({ ...progress });

        try {
          const form = new FormData();
          form.append("file", file);
          form.append("parish_id", parishId);
          form.append("doc_type", uploadType);

          // Simulated progress stages
          const progressInterval = setInterval(() => {
            progress[file.name] = { ...progress[file.name], progress: Math.min(90, progress[file.name].progress + 10) };
            setUploadProgress({ ...progress });
          }, 500);

          await api.post("/upload/", form, { headers: { "Content-Type": "multipart/form-data" } });

          clearInterval(progressInterval);
          progress[file.name] = { status: "done", progress: 100, msg: "Success" };
          setUploadProgress({ ...progress });
          addHistory("upload", `Uploaded ${uploadType} document: ${file.name}`);
          successCount++;
        } catch (err: any) {
          progress[file.name] = { status: "error", progress: 100, msg: err?.response?.data?.detail || "Failed" };
          setUploadProgress({ ...progress });
        }
      }

      // Refresh data
      const [uRes, aRes, hRes] = await Promise.all([
        api.get(`/data/utility/${parishId}`),
        api.get(`/data/appraisal/${parishId}`),
        api.get(`/parishes/${parishId}/history`),
      ]);
      setUtilities(uRes.data);
      setAppraisals(aRes.data);
      setHistory(hRes.data.map((h: any) => ({ id: h.id, type: h.entry_type, description: h.description, date: h.created_at, undone: h.undone, user_email: h.user_email, user_name: h.user_name })));
      setUploadMsg(`${successCount}/${stagedFiles.length} files uploaded successfully`);
      setStagedFiles([]);
    } catch (err: any) {
      setUploadMsg("Upload batch failed");
    } finally {
      setUploading(false);
    }
  };

  // ── Rename parish ──
  const saveParishName = async () => {
    if (!nameInput.trim() || !parish) return;
    try {
      const token = await getAccessTokenSilently();
      setAuthToken(token);
      const res = await api.put(`/parishes/${parishId}`, { name: nameInput.trim() });
      setParish(res.data);
      setEditingName(false);
    } catch (err) { console.error("Failed to rename parish:", err); }
  };

  // ── Image upload (saved to DB via parish update) ──
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = async () => {
      const dataUrl = r.result as string;
      setParishImage(dataUrl);
      try {
        const token = await getAccessTokenSilently();
        setAuthToken(token);
        await api.put(`/parishes/${parishId}`, { image_data: dataUrl });
      } catch (err) { console.error("Failed to save parish image:", err); }
    };
    r.readAsDataURL(f);
  };

  // ── Building management ──
  const addBuilding = async () => {
    if (!newBuildingName.trim()) return;
    try {
      const token = await getAccessTokenSilently();
      setAuthToken(token);
      const res = await api.post(`/parishes/${parishId}/buildings`, { name: newBuildingName.trim() });
      setBuildings((prev: BuildingData[]) => [...prev, res.data]);
      setNewBuildingName("");
      showToast(`Building "${res.data.name}" added`);
    } catch (err) { console.error(err); showToast("Failed to add building", "error"); }
  };

  const removeBuilding = async (buildingId: number) => {
    try {
      const token = await getAccessTokenSilently();
      setAuthToken(token);
      const bldg = buildings.find((b) => b.id === buildingId);
      await api.delete(`/parishes/${parishId}/buildings/${buildingId}`);
      setBuildings((prev: BuildingData[]) => prev.filter((b) => b.id !== buildingId));
      setConfirmDeleteBuilding(null);
      showToast(`Building "${bldg?.name}" removed`);
    } catch (err) { console.error(err); showToast("Failed to remove building", "error"); }
  };

  const renameBuilding = async () => {
    if (!renamingBuilding || !renamingBuilding.name.trim()) return;
    try {
      const token = await getAccessTokenSilently();
      setAuthToken(token);
      const res = await api.put(`/parishes/${parishId}/buildings/${renamingBuilding.id}`, { name: renamingBuilding.name.trim() });
      setBuildings((prev: BuildingData[]) => prev.map((b) => b.id === renamingBuilding.id ? res.data : b));
      setRenamingBuilding(null);
      showToast("Building renamed");
    } catch (err) { console.error(err); showToast("Failed to rename", "error"); }
  };

  // ── Utility bill edit/delete ──
  const editUtilityBill = async (billId: number, updates: Record<string, any>) => {
    try {
      const token = await getAccessTokenSilently();
      setAuthToken(token);
      await api.put(`/data/utility/${billId}`, updates);
      showToast("Bill updated");
      refreshData();
    } catch (err) { console.error(err); showToast("Failed to update bill", "error"); }
  };

  const deleteUtilityBill = async (billId: number) => {
    try {
      const token = await getAccessTokenSilently();
      setAuthToken(token);
      await api.delete(`/data/utility/${billId}`);
      showToast("Bill deleted");
      refreshData();
    } catch (err) { console.error(err); showToast("Failed to delete bill", "error"); }
  };

  const deleteAppraisalDoc = async (appraisalId: number) => {
    try {
      const token = await getAccessTokenSilently();
      setAuthToken(token);
      await api.delete(`/data/appraisal/${appraisalId}`);
      showToast("Appraisal deleted");
      refreshData();
    } catch (err) { console.error(err); showToast("Failed to delete", "error"); }
  };

  const editAppraisal = async (appraisalId: number, updates: Record<string, any>) => {
    try {
      const token = await getAccessTokenSilently();
      setAuthToken(token);
      await api.put(`/data/appraisal/${appraisalId}`, updates);
      showToast("Appraisal updated");
      refreshData();
    } catch (err) { console.error(err); showToast("Failed to update", "error"); }
  };

  // Map of original_filename to list of bill/appraisal IDs for bulk removal
  const uploadedDocs = useMemo(() => {
    const docs: Record<string, { type: "utility" | "appraisal"; ids: number[]; date: string }> = {};
    for (const u of utilities) {
      const fn = u.original_filename || "unknown";
      if (!docs[fn]) docs[fn] = { type: "utility", ids: [], date: u.bill_date };
      docs[fn].ids.push(u.id);
    }
    for (const a of appraisals) {
      const fn = a.original_filename || "unknown";
      if (!docs[fn]) docs[fn] = { type: "appraisal", ids: [], date: a.appraisal_date || "" };
      docs[fn].ids.push(a.id);
    }
    return docs;
  }, [utilities, appraisals]);

  const removeUploadedDoc = async (filename: string) => {
    const doc = uploadedDocs[filename];
    if (!doc) return;
    try {
      const token = await getAccessTokenSilently();
      setAuthToken(token);
      for (const id of doc.ids) {
        if (doc.type === "utility") await api.delete(`/data/utility/${id}`);
        else await api.delete(`/data/appraisal/${id}`);
      }
      refreshData();
    } catch (err) { console.error(err); }
  };

  // ══════════════════════════════════════════
  // Derived data
  // ══════════════════════════════════════════

  const lastUpdated = useMemo(() => {
    const d: string[] = [];
    utilities.forEach((u) => u.bill_date && d.push(u.bill_date));
    appraisals.forEach((a) => a.appraisal_date && d.push(a.appraisal_date));
    history.forEach((h) => d.push(h.date));
    if (!d.length) return null;
    d.sort((a, b) => +new Date(b) - +new Date(a));
    return d[0];
  }, [utilities, appraisals, history]);

  const utilMonthly = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    for (const t of UTIL_TYPES) out[t] = {};
    for (const b of utilities) { const t = b.utility_type?.toLowerCase() || "other"; if (out[t]) { const mk = monthKey(b.bill_date); out[t][mk] = (out[t][mk] || 0) + b.total_amount; } }
    return out;
  }, [utilities]);

  const allMonths = useMemo(() => {
    const ms = new Set<string>(); for (const t of UTIL_TYPES) Object.keys(utilMonthly[t] || {}).forEach((m) => ms.add(m)); return [...ms].sort();
  }, [utilMonthly]);

  const utilBuildings = useMemo(() => [...new Set(utilities.map((u) => bldgName(u)))].sort(), [utilities]);

  const utilBuildingData = useMemo(() => {
    const r: Record<string, Record<string, Record<string, number>>> = {};
    for (const b of utilBuildings) { r[b] = {}; for (const t of UTIL_TYPES) r[b][t] = {}; }
    for (const bill of utilities) { const b = bldgName(bill); const t = bill.utility_type?.toLowerCase() || "other"; if (r[b]?.[t]) { const mk = monthKey(bill.bill_date); r[b][t][mk] = (r[b][t][mk] || 0) + bill.total_amount; } }
    return r;
  }, [utilities, utilBuildings]);

  // buildingVals: computed from the appraisals API response which has per-building rows
  // Group by building name, take the latest entry for each, compare to previous
  const buildingVals = useMemo(() => {
    if (!appraisals.length) return [];
    // Group all entries by building name
    const byBuilding: Record<string, any[]> = {};
    for (const a of appraisals) {
      const name = a.building_name || "Unknown";
      if (!byBuilding[name]) byBuilding[name] = [];
      byBuilding[name].push(a);
    }
    // For each building, sort by date and take latest + previous
    return Object.entries(byBuilding).map(([name, entries], i) => {
      const sorted = entries.sort((a: any, b: any) => new Date(a.appraisal_date || 0).getTime() - new Date(b.appraisal_date || 0).getTime());
      const lat = sorted[sorted.length - 1];
      const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;
      const val = lat.building_value || lat.total_valuation || 0;
      const sqft = lat.gross_sq_ft || 0;
      let pct: number | null = null;
      if (prev) {
        const prevVal = prev.building_value || prev.total_valuation || 0;
        if (prevVal > 0) pct = ((val - prevVal) / prevVal) * 100;
      }
      return { name, value: val, sqft, perSqft: sqft > 0 ? val / sqft : 0, pct, color: BAR_COLORS[i % BAR_COLORS.length] };
    });
  }, [appraisals]);

  const totalVal = buildingVals.reduce((s: number, b: any) => s + b.value, 0);
  const totalValPct = useMemo(() => {
    if (appraisals.length < 2) return null;
    // Get unique appraisal dates
    const dates = Array.from(new Set<string>(appraisals.map((a: any) => a.appraisal_date || ""))).filter(Boolean).sort();
    if (dates.length < 2) return null;
    const latestDate = dates[dates.length - 1];
    const prevDate = dates[dates.length - 2];
    const latestTotal = appraisals.filter((a: any) => a.appraisal_date === latestDate).reduce((s: number, a: any) => s + (a.building_value || a.total_valuation || 0), 0);
    const prevTotal = appraisals.filter((a: any) => a.appraisal_date === prevDate).reduce((s: number, a: any) => s + (a.building_value || a.total_valuation || 0), 0);
    return prevTotal > 0 ? ((latestTotal - prevTotal) / prevTotal) * 100 : null;
  }, [appraisals]);

  const prioCounts = useMemo(() => { const c = { red: 0, yellow: 0, green: 0, blue: 0 }; todos.forEach((t) => c[t.priority]++); return c; }, [todos]);

  const estMonthly = useMemo(() => {
    const totals: Record<string, number[]> = {};
    for (const b of utilities) { const t = b.utility_type?.toLowerCase() || "other"; if (!totals[t]) totals[t] = []; totals[t].push(b.total_amount); }
    let total = 0; const items: { type: string; avg: number; min: number; max: number; count: number }[] = [];
    for (const [type, arr] of Object.entries(totals)) { const avg = arr.reduce((s, v) => s + v, 0) / arr.length; items.push({ type, avg, min: Math.min(...arr), max: Math.max(...arr), count: arr.length }); total += avg; }
    return { total, items: items.sort((a, b) => b.avg - a.avg) };
  }, [utilities]);

  const bldgFinances = useMemo(() => {
    const t: Record<string, Record<string, number[]>> = {};
    for (const b of utilities) { const bldg = bldgName(b); const tp = b.utility_type?.toLowerCase() || "other"; if (!t[bldg]) t[bldg] = {}; if (!t[bldg][tp]) t[bldg][tp] = []; t[bldg][tp].push(b.total_amount); }
    return Object.entries(t).map(([building, types]) => { const items = Object.entries(types).map(([type, arr]) => ({ type, avg: arr.reduce((s, v) => s + v, 0) / arr.length })); return { building, items, total: items.reduce((s, i) => s + i.avg, 0) }; }).sort((a, b) => b.total - a.total);
  }, [utilities]);

  const historyFiltered = useMemo(() => {
    const sorted = [...history].sort((a, b) => +new Date(b.date) - +new Date(a.date));
    return historyFilter === "all" ? sorted : sorted.filter((e) => e.type === historyFilter);
  }, [history, historyFilter]);

  const historyByMonth = useMemo(() => {
    const g: { month: string; entries: HistoryEntry[] }[] = []; let cur = "";
    for (const e of historyFiltered) { const mk = fmtMonthLong(e.date); if (mk !== cur) { cur = mk; g.push({ month: mk, entries: [] }); } g[g.length - 1].entries.push(e); }
    return g;
  }, [historyFiltered]);

  // For dashboard history: last 3 months only
  const recentHistoryByMonth = useMemo(() => {
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 3);
    const recent = history.filter((h) => new Date(h.date) >= cutoff).sort((a, b) => +new Date(b.date) - +new Date(a.date));
    const g: { month: string; entries: HistoryEntry[] }[] = []; let cur = "";
    for (const e of recent) { const mk = fmtMonth(e.date); if (mk !== cur) { cur = mk; g.push({ month: mk, entries: [] }); } g[g.length - 1].entries.push(e); }
    return g;
  }, [history]);

  const todoBuildings = useMemo(() => [...new Set(todos.map((t) => t.building))].sort(), [todos]);
  const hasTemplate = templates.some((t: any) => t.is_default);

  // ══════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════

  if (loading) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-stone-300 border-t-stone-600 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-stone-500" style={{ fontFamily: "'DM Sans', sans-serif" }}>Loading…</p>
      </div>
    </div>
  );

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap" rel="stylesheet" />

      <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        {/* ═══ Header ═══ */}
        <header className="bg-white border-b border-stone-200 px-6 py-3 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/parishes")} className="text-stone-400 hover:text-stone-600 text-sm transition-colors">← Parishes</button>
            <div className="w-px h-5 bg-stone-200" />
            <h1 className="text-lg font-semibold text-stone-800" style={{ fontFamily: "'Fraunces', serif" }}>Dashboard</h1>
          </div>
          <div className="relative" ref={menuRef}>
            <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="flex items-center gap-2 hover:bg-stone-50 rounded-lg px-2 py-1.5 transition-colors">
              <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-sm font-medium overflow-hidden">
                {user?.picture ? <img src={user.picture} alt="" className="w-full h-full object-cover" /> : (user?.name?.[0] || "U").toUpperCase()}
              </div>
              <svg className="w-4 h-4 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-stone-200 py-1 z-40">
                <div className="px-3 py-2 border-b border-stone-100">
                  <p className="text-sm font-medium text-stone-700 truncate">{user?.name || "User"}</p>
                  <p className="text-xs text-stone-400 truncate">{user?.email}</p>
                </div>
                <button onClick={() => { setUserMenuOpen(false); navigate("/account"); }} className="w-full text-left px-3 py-2 text-sm text-stone-600 hover:bg-stone-50">Account settings</button>
                <button onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50">Sign out</button>
              </div>
            )}
          </div>
        </header>

        {/* ═══ Parish Card (persistent across tabs) ═══ */}
        <div className="max-w-7xl mx-auto px-6 pt-5 pb-2">
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <div className="p-5 flex items-center gap-5">
              <label className="flex-shrink-0 cursor-pointer group relative">
                <div className="w-20 h-20 rounded-xl bg-stone-100 overflow-hidden border-2 border-stone-200 flex items-center justify-center">
                  {parishImage ? <img src={parishImage} alt="" className="w-full h-full object-cover" /> : <svg className="w-8 h-8 text-stone-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg>}
                </div>
                <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
              <div className="flex-1 min-w-0">
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && saveParishName()}
                      className="text-xl font-bold text-stone-800 border border-stone-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-stone-400" style={{ fontFamily: "'Fraunces', serif" }} />
                    <button onClick={saveParishName} className="text-emerald-600 text-sm font-medium">Save</button>
                    <button onClick={() => setEditingName(false)} className="text-stone-400 text-sm">Cancel</button>
                  </div>
                ) : (
                  <h2 onClick={() => { setEditingName(true); setNameInput(parish?.name || ""); }} className="text-xl font-bold text-stone-800 truncate cursor-pointer hover:text-stone-600 transition-colors" style={{ fontFamily: "'Fraunces', serif" }} title="Click to rename">
                    {parish?.name || "Untitled Parish"}
                  </h2>
                )}
                <p className="text-sm text-stone-400 mt-0.5">{parish?.diocese}{parish?.address ? ` · ${parish.address}` : ""}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-stone-400">{buildings.length} building{buildings.length !== 1 ? "s" : ""}</span>
                  <button onClick={() => setShowBuildingMgmt(!showBuildingMgmt)}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                    {showBuildingMgmt ? "Close ▴" : "Manage ▾"}
                  </button>
                </div>
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-xs text-stone-400">Last updated</p>
                <p className="text-sm font-medium text-stone-600">{lastUpdated ? fmtDate(lastUpdated) : "No data yet"}</p>
              </div>
            </div>

            {/* Building management dropdown */}
            {showBuildingMgmt && (
              <div className="border-t border-stone-100 px-5 py-3 bg-stone-50/50">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-stone-600">Buildings</h4>
                  <div className="flex items-center gap-2">
                    <input value={newBuildingName} onChange={(e) => setNewBuildingName(e.target.value)} placeholder="New building name"
                      onKeyDown={(e) => e.key === "Enter" && addBuilding()}
                      className="border border-stone-300 rounded-lg px-2.5 py-1 text-xs w-40 focus:outline-none focus:ring-1 focus:ring-stone-400" />
                    <button onClick={addBuilding} disabled={!newBuildingName.trim()}
                      className="bg-stone-800 hover:bg-stone-900 disabled:bg-stone-300 text-white px-2.5 py-1 rounded-lg text-xs font-medium">Add</button>
                  </div>
                </div>
                <div className="space-y-1">
                  {buildings.map((b) => (
                    <div key={b.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-stone-200">
                      {renamingBuilding?.id === b.id ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input value={renamingBuilding.name} onChange={(e) => setRenamingBuilding({ ...renamingBuilding, name: e.target.value })}
                            autoFocus onKeyDown={(e) => e.key === "Enter" && renameBuilding()}
                            className="flex-1 border border-stone-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400" />
                          <button onClick={renameBuilding} className="text-emerald-600 text-xs font-medium">Save</button>
                          <button onClick={() => setRenamingBuilding(null)} className="text-stone-400 text-xs">Cancel</button>
                        </div>
                      ) : (
                        <>
                          <button onClick={() => setRenamingBuilding({ id: b.id, name: b.name })} className="text-sm text-stone-700 hover:text-blue-600 transition-colors" title="Click to rename">{b.name}</button>
                          {confirmDeleteBuilding === b.id ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-red-600">Remove?</span>
                              <button onClick={() => removeBuilding(b.id)} className="text-xs bg-red-600 text-white px-2 py-0.5 rounded font-medium">Yes</button>
                              <button onClick={() => setConfirmDeleteBuilding(null)} className="text-xs text-stone-400">No</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button onClick={() => setRenamingBuilding({ id: b.id, name: b.name })} className="text-xs text-stone-400 hover:text-stone-600">Rename</button>
                              <button onClick={() => setConfirmDeleteBuilding(b.id)} className="text-xs text-stone-400 hover:text-red-500">Remove</button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                  {buildings.length === 0 && <p className="text-xs text-stone-400 py-2">No buildings yet. Add at least one.</p>}
                </div>
              </div>
            )}

            {/* Upload bar */}
            <div className="border-t border-stone-100 px-5 py-3 bg-stone-50/50">
              <div className="flex items-center gap-3">
                <span className="text-xs text-stone-500">Upload:</span>
                <div className="flex rounded-lg border border-stone-200 overflow-hidden">
                  {(["utility", "appraisal"] as const).map((t) => (
                    <button key={t} onClick={() => { setUploadType(t); setStagedFiles([]); setUploadProgress({}); setUploadMsg(""); }}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors capitalize ${uploadType === t ? "bg-stone-800 text-white" : "bg-white text-stone-600 hover:bg-stone-50"}`}>
                      {t}
                    </button>
                  ))}
                </div>
                <label className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors bg-white border border-stone-300 text-stone-700 hover:bg-stone-50">
                  + Add Files
                  <input ref={fileRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleFilesSelected}
                    disabled={uploading} />
                </label>
                {stagedFiles.length > 0 && !uploading && (
                  <button onClick={parseAndUpload} className="bg-stone-800 hover:bg-stone-900 text-white px-4 py-1.5 rounded-lg text-xs font-medium transition-colors">
                    {uploadType === "appraisal" ? `Enter Data (${stagedFiles.length})` : `Parse & Upload (${stagedFiles.length})`}
                  </button>
                )}
                {uploadMsg && <span className={`text-xs ${uploadMsg.includes("success") ? "text-emerald-600" : "text-red-500"}`}>{uploadMsg}</span>}
              </div>

              {/* Staged files list */}
              {(stagedFiles.length > 0 || Object.keys(uploadProgress).length > 0) && (
                <div className="mt-2 space-y-1">
                  {stagedFiles.map((f, i) => {
                    const prog = uploadProgress[f.name];
                    return (
                      <div key={`${f.name}-${i}`} className="flex items-center gap-2 bg-white rounded-lg border border-stone-200 px-3 py-2">
                        <svg className="w-4 h-4 text-stone-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                        <span className="text-xs text-stone-700 flex-1 truncate">{f.name}</span>

                        {prog ? (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <div className="w-24 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all duration-300 ${prog.status === "error" ? "bg-red-500" : prog.status === "done" ? "bg-emerald-500" : "bg-blue-500"}`}
                                style={{ width: `${prog.progress}%` }} />
                            </div>
                            <span className={`text-xs font-medium ${prog.status === "error" ? "text-red-500" : prog.status === "done" ? "text-emerald-600" : "text-blue-600"}`}>
                              {prog.status === "parsing" ? "Parsing…" : prog.status === "done" ? "✓" : prog.status === "error" ? "✕" : "Waiting"}
                            </span>
                          </div>
                        ) : (
                          <button onClick={() => removeStagedFile(i)} className="text-stone-400 hover:text-red-500 text-xs flex-shrink-0">✕ Remove</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="border-t border-stone-100 px-5 flex gap-0 overflow-x-auto">
              {TABS.map((tab) => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.key ? "text-stone-800 border-stone-800" : "text-stone-500 border-transparent hover:text-stone-700 hover:border-stone-300"
                  }`}>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ Tab Content ═══ */}
        <div className="max-w-7xl mx-auto px-6 py-4">
          {activeTab === "dashboard" && <DashboardTab
            utilities={utilities} appraisals={appraisals} todos={todos} history={history}
            utilMonthly={utilMonthly} allMonths={allMonths} buildingVals={buildingVals}
            totalVal={totalVal} totalValPct={totalValPct}
            prioCounts={prioCounts} estMonthly={estMonthly}
            recentHistoryByMonth={recentHistoryByMonth}
            toggleTodo={toggleTodo} setActiveTab={setActiveTab}
            showAddTask={showAddTask} setShowAddTask={setShowAddTask}
            newTaskText={newTaskText} setNewTaskText={setNewTaskText}
            newTaskBuilding={newTaskBuilding} setNewTaskBuilding={setNewTaskBuilding}
            newTaskPriority={newTaskPriority} setNewTaskPriority={setNewTaskPriority}
            addTask={addTask} buildings={buildings}
          />}
          {activeTab === "risks" && <RisksTab
            todos={todos} toggleTodo={toggleTodo} todoBuildings={todoBuildings}
            showAddTask={showAddTask} setShowAddTask={setShowAddTask}
            newTaskText={newTaskText} setNewTaskText={setNewTaskText}
            newTaskBuilding={newTaskBuilding} setNewTaskBuilding={setNewTaskBuilding}
            newTaskPriority={newTaskPriority} setNewTaskPriority={setNewTaskPriority}
            addTask={addTask} prioCounts={prioCounts} buildings={buildings}
            editingTaskId={editingTaskId} editTaskText={editTaskText} editTaskPriority={editTaskPriority} editTaskBuilding={editTaskBuilding}
            startEditTask={startEditTask} saveEditTask={saveEditTask} setEditingTaskId={setEditingTaskId}
            setEditTaskText={setEditTaskText} setEditTaskPriority={setEditTaskPriority} setEditTaskBuilding={setEditTaskBuilding} deleteTask={deleteTask}
          />}
          {activeTab === "utility" && <UtilityTab utilities={utilities} utilBuildings={utilBuildings} utilBuildingData={utilBuildingData} allMonths={allMonths} buildings={buildings} parishId={parishId} getAccessTokenSilently={getAccessTokenSilently} setBuildings={setBuildings} refreshData={refreshData} editUtilityBill={editUtilityBill} deleteUtilityBill={deleteUtilityBill} showToast={showToast} />}
          {activeTab === "valuations" && <ValuationsTab buildingVals={buildingVals} totalVal={totalVal} totalValPct={totalValPct} appraisals={appraisals} buildings={buildings} editAppraisal={editAppraisal} />}
          {activeTab === "finances" && <FinancesTab utilities={utilities} estMonthly={estMonthly} bldgFinances={bldgFinances} todos={todos} />}
          {activeTab === "history" && <HistoryTab historyByMonth={historyByMonth} historyFilter={historyFilter} setHistoryFilter={setHistoryFilter} history={history} uploadedDocs={uploadedDocs} removeUploadedDoc={removeUploadedDoc} showToast={showToast} utilities={utilities} appraisals={appraisals} editUtilityBill={editUtilityBill} deleteUtilityBill={deleteUtilityBill} editAppraisal={editAppraisal} refreshData={refreshData} parishId={parishId} getAccessTokenSilently={getAccessTokenSilently} />}
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border text-sm font-medium transition-all ${
          toast.type === "error" ? "bg-red-50 border-red-200 text-red-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"
        }`}>
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} className="text-current opacity-50 hover:opacity-100">✕</button>
        </div>
      )}

      <style>{`.custom-scroll::-webkit-scrollbar{width:4px}.custom-scroll::-webkit-scrollbar-track{background:transparent}.custom-scroll::-webkit-scrollbar-thumb{background:#d6d3d1;border-radius:4px}.custom-scroll::-webkit-scrollbar-thumb:hover{background:#a8a29e}`}</style>
    </>
  );
}

// ══════════════════════════════════════════
// Tab: Dashboard (overview)
// ══════════════════════════════════════════

function DashboardTab({ utilities, todos, utilMonthly, allMonths, buildingVals, totalVal, totalValPct, prioCounts, estMonthly, recentHistoryByMonth, toggleTodo, setActiveTab, showAddTask, setShowAddTask, newTaskText, setNewTaskText, newTaskBuilding, setNewTaskBuilding, newTaskPriority, setNewTaskPriority, addTask, buildings }: any) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "2fr 1fr" }}>
      <div className="space-y-4">
        {/* Active Risks */}
        <section className="bg-white rounded-xl border border-stone-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 onClick={() => setActiveTab("risks")} className="text-base font-semibold text-stone-800 cursor-pointer hover:text-blue-700 transition-colors" style={{ fontFamily: "'Fraunces', serif" }}>Active Risks & Backlog →</h3>
            <div className="flex items-center gap-1.5">
              {PRIO_ORDER.map((p) => (
                <span key={p} title={PRIORITY[p].desc} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-help ${PRIORITY[p].badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY[p].dot}`} />{prioCounts[p]}
                </span>
              ))}
              <button onClick={() => setShowAddTask(true)} className="ml-2 text-xs text-stone-500 hover:text-stone-800 font-medium">+ Add</button>
            </div>
          </div>

          {/* Quick add form */}
          {showAddTask && <AddTaskForm {...{ newTaskText, setNewTaskText, newTaskBuilding, setNewTaskBuilding, newTaskPriority, setNewTaskPriority, addTask, buildings, onCancel: () => setShowAddTask(false) }} />}

          {todos.length === 0 ? <Empty text="No active tasks yet." sub="Click + Add to create one." /> : (
            <div className="max-h-64 overflow-y-auto space-y-1 pr-1 -mr-1 custom-scroll">
              {todos.filter((t: any) => t.priority !== "blue" || !t.done).sort(sortByPriority).map((todo: any) => {
                const c = PRIORITY[todo.priority as keyof typeof PRIORITY];
                return (
                  <div key={todo.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${c.border} ${c.bg}`}>
                    <button onClick={() => toggleTodo(todo.id)} className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${todo.done ? "bg-sky-500 border-sky-500 text-white" : "border-stone-300 hover:border-stone-400"}`}>
                      {todo.done && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                    </button>
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${c.dot}`} />
                    <span className={`flex-1 text-sm ${todo.done ? "line-through text-stone-400" : "text-stone-700"}`}>{todo.text}</span>
                    <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${c.badge}`}>{todo.building}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Utility Use — full width */}
        <section className="bg-white rounded-xl border border-stone-200 p-5">
          <h3 onClick={() => setActiveTab("utility")} className="text-base font-semibold text-stone-800 mb-4 cursor-pointer hover:text-blue-700 transition-colors" style={{ fontFamily: "'Fraunces', serif" }}>Utility Use →</h3>
          {utilities.length === 0 ? <Empty text="Upload utility bills to see trends." /> : (
            <div className="grid grid-cols-2 gap-6">
              {UTIL_TYPES.map((type: string) => {
                const data = allMonths.map((m: string) => ({ month: fmtMonth(m + "-01"), amount: utilMonthly[type]?.[m] || 0 }));
                const withData = data.filter((d: any) => d.amount > 0);
                if (withData.length === 0) return null;
                // Average of all except the latest
                const prevVals = withData.slice(0, -1);
                const avg = prevVals.length > 0 ? prevVals.reduce((s: number, d: any) => s + d.amount, 0) / prevVals.length : null;
                const latest = withData[withData.length - 1].amount;
                const pctVsAvg = avg ? ((latest - avg) / avg * 100) : null;
                // Add average line to data
                const chartData = data.map((d: any) => ({ ...d, avg: avg || 0 }));
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span>{UTIL_ICON[type]}</span>
                        <span className="text-xs font-medium text-stone-600">{UTIL_LABEL[type]}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-stone-500 tabular-nums">{money(latest)}</span>
                        {pctVsAvg !== null && <span className={`text-xs font-semibold ${pctVsAvg >= 0 ? "text-red-500" : "text-emerald-600"}`}>{pctVsAvg >= 0 ? "↑" : "↓"}{Math.abs(pctVsAvg).toFixed(1)}% vs avg</span>}
                      </div>
                    </div>
                    <div className="h-28"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" /><XAxis dataKey="month" tick={{ fontSize: 9, fill: "#a8a29e" }} tickLine={false} axisLine={false} /><YAxis tick={{ fontSize: 9, fill: "#a8a29e" }} tickLine={false} axisLine={false} tickFormatter={(v: any) => `$${(Number(v) / 1000).toFixed(0)}k`} width={35} /><Line type="monotone" dataKey="amount" stroke={UTIL_COLOR[type]} strokeWidth={2} dot={false} />{avg ? <Line type="monotone" dataKey="avg" stroke="#d6d3d1" strokeWidth={1} strokeDasharray="4 4" dot={false} /> : null}<Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e7e5e4" }} formatter={(v: any, name: any) => [money(Number(v)), name === "avg" ? "Average" : UTIL_LABEL[type]]} /></LineChart></ResponsiveContainer></div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Right column */}
      <div className="space-y-4">
        <section className="bg-white rounded-xl border border-stone-200 p-5">
          <h3 onClick={() => setActiveTab("finances")} className="text-base font-semibold text-stone-800 mb-4 cursor-pointer hover:text-blue-700 transition-colors" style={{ fontFamily: "'Fraunces', serif" }}>Finances →</h3>
          {utilities.length === 0 ? <Empty text="Upload data to see estimates." /> : (
            <>
              <div className="bg-stone-50 rounded-lg p-4 mb-4"><p className="text-xs text-stone-400 mb-0.5">Est. Monthly Cost</p><p className="text-2xl font-bold text-stone-800 tabular-nums" style={{ fontFamily: "'Fraunces', serif" }}>{money(estMonthly.total)}</p></div>
              <div className="space-y-2">{estMonthly.items.map((i: any) => (<div key={i.type} className="flex items-center justify-between text-sm"><div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ background: UTIL_COLOR[i.type] || "#a1a1aa" }} /><span className="text-stone-600 capitalize">{i.type}</span></div><span className="font-medium text-stone-700 tabular-nums">{money(i.avg)}</span></div>))}</div>
            </>
          )}
        </section>

        <section className="bg-white rounded-xl border border-stone-200 p-5">
          <h3 onClick={() => setActiveTab("history")} className="text-base font-semibold text-stone-800 mb-4 cursor-pointer hover:text-blue-700 transition-colors" style={{ fontFamily: "'Fraunces', serif" }}>History →</h3>
          {recentHistoryByMonth.length === 0 ? <Empty text="Activity will appear here." /> : (
            <div className="max-h-80 overflow-y-auto pr-1 -mr-1 custom-scroll space-y-4">
              {recentHistoryByMonth.map((g: any) => (
                <div key={g.month}><div className="flex items-center gap-2 mb-2"><span className="text-xs font-semibold text-stone-500 uppercase tracking-wider whitespace-nowrap">{g.month}</span><div className="flex-1 h-px bg-stone-200" /></div>
                  <div className="relative pl-4 border-l-2 border-stone-200 space-y-2">{g.entries.map((e: any) => (
                    <div key={e.id} className="relative"><div className={`absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white ${e.type === "upload" ? "bg-blue-400" : e.type === "task_addressed" ? "bg-emerald-400" : e.type === "task_changed" ? "bg-amber-400" : "bg-stone-400"}`} /><p className="text-sm text-stone-600">{e.description}</p><p className="text-xs text-stone-400">{fmtDate(e.date)}</p></div>
                  ))}</div></div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// Tab: Risks
// ══════════════════════════════════════════

function RisksTab({ todos, toggleTodo, todoBuildings, showAddTask, setShowAddTask, newTaskText, setNewTaskText, newTaskBuilding, setNewTaskBuilding, newTaskPriority, setNewTaskPriority, addTask, prioCounts, buildings, editingTaskId, editTaskText, editTaskPriority, editTaskBuilding, startEditTask, saveEditTask, setEditingTaskId, setEditTaskText, setEditTaskPriority, setEditTaskBuilding, deleteTask }: any) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">{PRIO_ORDER.map((p) => (<span key={p} title={PRIORITY[p].desc} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium cursor-help ${PRIORITY[p].badge}`}><span className={`w-2 h-2 rounded-full ${PRIORITY[p].dot}`} />{prioCounts[p]} {PRIORITY[p].label}</span>))}</div>
        <button onClick={() => setShowAddTask(true)} className="bg-stone-800 hover:bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-medium">+ Add Task</button>
      </div>

      {showAddTask && <div className="mb-4"><AddTaskForm {...{ newTaskText, setNewTaskText, newTaskBuilding, setNewTaskBuilding, newTaskPriority, setNewTaskPriority, addTask, buildings, onCancel: () => setShowAddTask(false) }} /></div>}

      {todoBuildings.length === 0 && !showAddTask ? <div className="bg-white rounded-xl border border-stone-200 p-12 text-center"><p className="text-stone-400">No tasks yet.</p></div> : (
        <div className="space-y-4">{todoBuildings.map((building: string) => {
          const bTodos = todos.filter((t: any) => t.building === building).sort(sortByPriority);
          return (
            <div key={building} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-stone-700" style={{ fontFamily: "'Fraunces', serif" }}>{building}</h3>
                <span className="text-xs text-stone-400">{bTodos.filter((t: any) => !t.done).length} active</span>
              </div>
              <div className="divide-y divide-stone-100">{bTodos.map((todo: any) => {
                const c = PRIORITY[todo.priority as keyof typeof PRIORITY]; const isEditing = editingTaskId === todo.id;
                return (
                  <div key={todo.id} className={`flex items-center gap-3 px-5 py-3 ${c.bg}`}>
                    <button onClick={() => toggleTodo(todo.id)} className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center ${todo.done ? "bg-sky-500 border-sky-500 text-white" : "border-stone-300 hover:border-stone-400"}`}>{todo.done && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}</button>
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${c.dot}`} />
                    {isEditing ? (
                      <div className="flex-1 flex items-center gap-2 flex-wrap">
                        <input value={editTaskText} onChange={(e: any) => setEditTaskText(e.target.value)} className="flex-1 min-w-[120px] border border-stone-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300" />
                        {buildings && buildings.length > 0 && (
                          <select value={editTaskBuilding} onChange={(e: any) => setEditTaskBuilding(e.target.value)}
                            className="border border-stone-300 rounded px-2 py-1 text-xs bg-white">
                            {buildings.map((b: any) => <option key={b.id} value={b.name}>{b.name}</option>)}
                          </select>
                        )}
                        <div className="flex gap-1">{(["red", "yellow", "green"] as const).map((p) => (<button key={p} onClick={() => setEditTaskPriority(p)} className={`w-4 h-4 rounded-full ${PRIORITY[p].dot} ${editTaskPriority === p ? "ring-2 ring-offset-1 " + PRIORITY[p].ring : "opacity-40 hover:opacity-70"}`} />))}</div>
                        <button onClick={() => saveEditTask(todo.id)} className="text-emerald-600 text-xs font-medium">Save</button>
                        <button onClick={() => setEditingTaskId(null)} className="text-stone-400 text-xs">Cancel</button>
                      </div>
                    ) : (
                      <>
                        <span className={`flex-1 text-sm ${todo.done ? "line-through text-stone-400" : "text-stone-700"}`}>{todo.text}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.badge}`}>{c.label}</span>
                        <button onClick={() => startEditTask(todo)} className="text-stone-400 hover:text-stone-600 text-xs ml-1">Edit</button>
                        <button onClick={() => deleteTask(todo.id)} className="text-stone-400 hover:text-red-500 text-xs">✕</button>
                      </>
                    )}
                  </div>
                );
              })}</div>
            </div>
          );
        })}</div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
// Tab: Utility
// ══════════════════════════════════════════

function UtilityTab({ utilities, utilBuildings, utilBuildingData, allMonths, buildings, parishId, getAccessTokenSilently, setBuildings, refreshData, editUtilityBill, deleteUtilityBill, showToast }: any) {
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
      const bldg = buildings.find((b: any) => b.id === buildingId);
      const updated = { ...(bldg?.account_numbers || {}), [utilType]: acctNum.trim() };
      const res = await api.put(`/parishes/${parishId}/buildings/${buildingId}`, { account_numbers: updated });
      setBuildings((prev: any[]) => prev.map((b: any) => b.id === buildingId ? res.data : b));
      setEditingAcct(null);
      showToast("Account number saved");
      refreshData();
    } catch (err) { console.error(err); showToast("Failed to save", "error"); }
  };

  const assignToGeneral = async (accountNumber: string) => {
    try {
      const token = await getAccessTokenSilently();
      setAuthToken(token);
      const billsToUpdate = utilities.filter((u: any) => u.account_number === accountNumber && (!u.building_name || u.building_name === "Unassigned"));
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
      const billsToUpdate = utilities.filter((u: any) => bldgName(u) === "General Expenses" && u.utility_type === utilType);
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
      const bldg = buildings.find((b: any) => b.id === buildingId);
      const updated = { ...(bldg?.account_numbers || {}) };
      delete updated[utilType];
      await api.put(`/parishes/${parishId}/buildings/${buildingId}`, { account_numbers: updated });
      setBuildings((prev: any[]) => prev.map((x: any) => x.id === buildingId ? { ...x, account_numbers: updated } : x));
      refreshData();
      showToast(`Removed ${utilType} from ${bldg?.name}`);
    } catch (err) { console.error(err); showToast("Failed to remove", "error"); }
  };

  if (utilities.length === 0 && buildings.length === 0) {
    return <div className="bg-white rounded-xl border border-stone-200 p-12 text-center"><p className="text-stone-400 text-sm">Upload utility bills to see detailed breakdowns.</p></div>;
  }

  const genBills = utilities.filter((u: any) => bldgName(u) === "General Expenses");
  const genTypes = Array.from(new Set<string>(genBills.map((u: any) => String(u.utility_type || "other"))));

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
                <select onChange={(e) => {
                  const val = e.target.value;
                  if (val === "__general__") assignToGeneral(ua.account_number);
                  else if (val) saveAccountNumber(Number(val), ua.utility_type, ua.account_number);
                  e.target.value = "";
                }} className="border border-amber-300 rounded px-2 py-1 text-xs bg-white" defaultValue="">
                  <option value="">Assign to…</option>
                  <option value="__general__">General Expenses</option>
                  {buildings.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}

        {/* Building cards */}
        {buildings.map((b: any) => {
          const assignedUtils = Object.keys(b.account_numbers || {}).filter((k: string) => b.account_numbers[k]);
          return (
            <div key={b.id} className="bg-white rounded-lg border border-stone-200 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-stone-700">{b.name}</p>
                <select onChange={(e) => {
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
                          <button onClick={() => setEditingAcct(null)} className="text-stone-400 text-xs">✕</button>
                        </div>
                      ) : (
                        <>
                          <button onClick={() => setEditingAcct({ buildingId: b.id, utilType: ut, value: acct || "" })}
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
                    <button onClick={() => setEditingAcct(null)} className="text-stone-400 text-xs">✕</button>
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
                const typeBills = genBills.filter((u: any) => u.utility_type === t);
                const accts = Array.from(new Set<string>(typeBills.map((u: any) => u.account_number || "—").filter(Boolean)));
                return (
                  <div key={t} className="flex items-center gap-1 text-xs bg-amber-50 rounded-lg px-2 py-1">
                    <span className="text-amber-700 capitalize font-medium">{t}:</span>
                    <span className="font-mono text-amber-600">{accts.join(", ") || "—"}</span>
                    <span className="text-amber-400">({typeBills.length})</span>
                    <button onClick={() => unassignFromGeneral(t)}
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
        const billsForBuilding = utilities.filter((u: any) => bldgName(u) === building);
        const isExpanded = expandedBuilding === building;
        const isUnassigned = building.startsWith("Acct #");
        const unassignedTypes: string[] | null = isUnassigned ? Array.from(new Set<string>(billsForBuilding.map((u: any) => String(u.utility_type || "other")))) : null;
        const allTypes: string[] = unassignedTypes && unassignedTypes.length > 0 ? unassignedTypes : [...UTIL_TYPES];
        const typesToShow: string[] = allTypes.filter((type: string) => {
          const md = utilBuildingData[building]?.[type] || {};
          return Object.values(md).some((v: any) => v > 0);
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
                const hasData = data.some((d: any) => d.amount > 0);
                const withData = data.filter((d: any) => d.amount > 0);
                const prevVals = withData.slice(0, -1);
                const avg = prevVals.length > 0 ? prevVals.reduce((s: number, d: any) => s + d.amount, 0) / prevVals.length : null;
                const latest = withData.length > 0 ? withData[withData.length - 1].amount : 0;
                const pctVsAvg = avg ? ((latest - avg) / avg * 100) : null;
                const chartData = data.map((d: any) => ({ ...d, avg: avg || 0 }));
                return (
                  <div key={type} className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2"><span>{UTIL_ICON[type] || "📊"}</span><span className="text-sm font-medium text-stone-700">{UTIL_LABEL[type] || type}</span></div>
                      {hasData && <div className="text-right"><p className="text-sm font-semibold text-stone-800 tabular-nums">{money(latest)}</p>{pctVsAvg !== null && <p className={`text-xs font-medium tabular-nums ${pctVsAvg >= 0 ? "text-red-500" : "text-emerald-600"}`}>{pctVsAvg >= 0 ? "↑" : "↓"} {Math.abs(pctVsAvg).toFixed(1)}% vs avg</p>}</div>}
                    </div>
                    {hasData ? (
                      <div className="h-32"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" /><XAxis dataKey="month" tick={{ fontSize: 10, fill: "#a8a29e" }} tickLine={false} axisLine={false} /><YAxis tick={{ fontSize: 10, fill: "#a8a29e" }} tickLine={false} axisLine={false} tickFormatter={(v: any) => `$${(Number(v) / 1000).toFixed(0)}k`} width={40} /><Line type="monotone" dataKey="amount" stroke={UTIL_COLOR[type] || "#6b7280"} strokeWidth={2} dot={{ r: 3, fill: UTIL_COLOR[type] || "#6b7280" }} />{avg ? <Line type="monotone" dataKey="avg" stroke="#d6d3d1" strokeWidth={1} strokeDasharray="4 4" dot={false} /> : null}<Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e7e5e4" }} formatter={(v: any, name: any) => [money(Number(v)), name === "avg" ? "Average" : (UTIL_LABEL[type] || type)]} /></LineChart></ResponsiveContainer></div>
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
                  {billsForBuilding.sort((a: any, b: any) => new Date(b.bill_date).getTime() - new Date(a.bill_date).getTime()).map((bill: any) => (
                    <div key={bill.id} className="px-6 py-2 grid grid-cols-7 gap-2 items-center text-xs hover:bg-stone-50 group">
                      <EditableCell value={bill.bill_date} field="bill_date" billId={bill.id} type="date"
                        editingBill={editingBill} setEditingBill={setEditingBill} editUtilityBill={editUtilityBill} />
                      <EditableCell value={bill.utility_type} field="utility_type" billId={bill.id} type="select"
                        editingBill={editingBill} setEditingBill={setEditingBill} editUtilityBill={editUtilityBill} />
                      <EditableCell value={bill.total_amount != null ? `$${Number(bill.total_amount).toFixed(2)}` : "—"} rawValue={bill.total_amount} field="total_amount" billId={bill.id} type="number"
                        editingBill={editingBill} setEditingBill={setEditingBill} editUtilityBill={editUtilityBill} />
                      <EditableCell value={bill.account_number || "—"} field="account_number" billId={bill.id} type="text"
                        editingBill={editingBill} setEditingBill={setEditingBill} editUtilityBill={editUtilityBill} />
                      <span className="text-stone-500">{bill.usage_quantity ? `${bill.usage_quantity} ${bill.usage_unit || ""}` : "—"}</span>
                      <span className="text-stone-500 truncate">{bill.provider_name || "—"}</span>
                      <button onClick={() => deleteUtilityBill(bill.id)}
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

// ══════════════════════════════════════════
// Tab: Valuations
// ══════════════════════════════════════════

function ValuationsTab({ buildingVals, totalVal, totalValPct, appraisals, buildings, editAppraisal }: any) {
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

// ══════════════════════════════════════════
// Tab: Finances
// ══════════════════════════════════════════

function FinancesTab({ utilities, estMonthly, bldgFinances, todos }: any) {
  const addressed = todos.filter((t: any) => t.priority === "blue");
  if (utilities.length === 0) return <div className="bg-white rounded-xl border border-stone-200 p-12 text-center"><p className="text-stone-400 text-sm">Upload utility data to see financial estimates.</p></div>;
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-stone-200 p-6">
        <p className="text-xs text-stone-400 mb-1">Estimated Monthly Cost</p>
        <p className="text-3xl font-bold text-stone-800 tabular-nums" style={{ fontFamily: "'Fraunces', serif" }}>{money(estMonthly.total)}</p>
      </div>
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-stone-100"><h2 className="text-base font-semibold text-stone-800" style={{ fontFamily: "'Fraunces', serif" }}>By Utility Type</h2></div>
        <div className="divide-y divide-stone-100">{estMonthly.items.map((item: any) => (
          <div key={item.type} className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3"><div className="w-3 h-3 rounded-full" style={{ background: UTIL_COLOR[item.type] || "#a1a1aa" }} /><div><p className="text-sm font-medium text-stone-700 capitalize">{item.type}</p><p className="text-xs text-stone-400">{item.count} bills</p></div></div>
            <div className="text-right"><p className="text-sm font-semibold text-stone-800 tabular-nums">{money(item.avg)}/mo</p><p className="text-xs text-stone-400 tabular-nums">{money(item.min)} – {money(item.max)}</p></div>
          </div>
        ))}</div>
      </div>
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-stone-100"><h2 className="text-base font-semibold text-stone-800" style={{ fontFamily: "'Fraunces', serif" }}>By Building</h2></div>
        <div className="divide-y divide-stone-100">{bldgFinances.map((b: any) => (
          <div key={b.building} className="px-6 py-4">
            <div className="flex items-center justify-between mb-2"><p className="text-sm font-medium text-stone-700">{b.building}</p><p className="text-sm font-semibold text-stone-800 tabular-nums">{money(b.total)}/mo</p></div>
            <div className="flex gap-3 flex-wrap">{b.items.map((i: any) => (<div key={i.type} className="flex items-center gap-1.5 text-xs text-stone-500"><div className="w-2 h-2 rounded-full" style={{ background: UTIL_COLOR[i.type] || "#a1a1aa" }} /><span className="capitalize">{i.type}:</span><span className="font-medium text-stone-600 tabular-nums">{money(i.avg)}</span></div>))}</div>
          </div>
        ))}</div>
      </div>
      {addressed.length > 0 && (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-stone-100"><h2 className="text-base font-semibold text-stone-800" style={{ fontFamily: "'Fraunces', serif" }}>Addressed This Month</h2></div>
          <div className="divide-y divide-stone-100">{addressed.map((t: any) => (<div key={t.id} className="px-6 py-3 flex items-center justify-between"><div className="flex items-center gap-3"><span className="text-sky-500">✓</span><span className="text-sm text-stone-600">{t.text}</span></div><span className="text-xs text-stone-400">{t.building}</span></div>))}</div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
// Tab: History
// ══════════════════════════════════════════

const HTYPE = { upload: { label: "Upload", dot: "bg-blue-400", badge: "bg-blue-50 text-blue-700" }, task_added: { label: "Added", dot: "bg-stone-400", badge: "bg-stone-100 text-stone-600" }, task_changed: { label: "Changed", dot: "bg-amber-400", badge: "bg-amber-50 text-amber-700" }, task_addressed: { label: "Addressed", dot: "bg-emerald-400", badge: "bg-emerald-50 text-emerald-700" } };

function HistoryTab({ historyByMonth, historyFilter, setHistoryFilter, history, uploadedDocs, removeUploadedDoc, showToast, utilities, appraisals, editUtilityBill, deleteUtilityBill, editAppraisal, refreshData, parishId, getAccessTokenSilently }: any) {
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<{ billId: number; field: string; value: string } | null>(null);
  const typeCounts: Record<string, number> = { upload: 0, task_added: 0, task_changed: 0, task_addressed: 0 };
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
function InlineEdit({ value, rawValue, field, billId, type, editing, setEditing, onSave }: {
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

// ══════════════════════════════════════════
// Shared sub-components
// ══════════════════════════════════════════

function AddTaskForm({ newTaskText, setNewTaskText, newTaskBuilding, setNewTaskBuilding, newTaskPriority, setNewTaskPriority, addTask, onCancel, buildings }: any) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4 mb-3">
      <div className="grid grid-cols-2 gap-3 mb-3">
        <input value={newTaskText} onChange={(e: any) => setNewTaskText(e.target.value)} placeholder="Task description" className="border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300" />
        {buildings && buildings.length > 0 ? (
          <select value={newTaskBuilding} onChange={(e: any) => setNewTaskBuilding(e.target.value)}
            className="border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300 bg-white">
            <option value="">Select building</option>
            {buildings.map((b: any) => <option key={b.id} value={b.name}>{b.name}</option>)}
          </select>
        ) : (
          <input value={newTaskBuilding} onChange={(e: any) => setNewTaskBuilding(e.target.value)} placeholder="Building name" className="border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300" />
        )}
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-stone-500">Priority:</span>
        {(["red", "yellow", "green"] as const).map((p) => (
          <button key={p} onClick={() => setNewTaskPriority(p)} title={PRIORITY[p].desc}
            className={`px-3 py-1 rounded-full text-xs font-medium ${newTaskPriority === p ? `${PRIORITY[p].badge} ring-2 ${PRIORITY[p].ring}` : "bg-stone-100 text-stone-500 hover:bg-stone-200"}`}>{PRIORITY[p].label}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={addTask} disabled={!newTaskText.trim() || !newTaskBuilding.trim()} className="bg-stone-800 hover:bg-stone-900 disabled:bg-stone-300 text-white px-4 py-2 rounded-lg text-sm font-medium">Add</button>
        <button onClick={onCancel} className="text-stone-500 hover:text-stone-700 px-4 py-2 text-sm">Cancel</button>
      </div>
    </div>
  );
}

function Empty({ text, sub }: { text: string; sub?: string }) {
  return <div className="text-center py-6"><p className="text-sm text-stone-400">{text}</p>{sub && <p className="text-xs text-stone-300 mt-1">{sub}</p>}</div>;
}

function EditableCell({ value, rawValue, field, billId, type, editingBill, setEditingBill, editUtilityBill }: {
  value: any; rawValue?: any; field: string; billId: number; type: "text" | "number" | "date" | "select";
  editingBill: any; setEditingBill: any; editUtilityBill: any;
}) {
  const isEditing = editingBill?.id === billId && editingBill?.field === field;
  const displayVal = value != null ? String(value) : "—";

  if (isEditing) {
    if (type === "select") {
      return (
        <div className="flex items-center gap-1">
          <select value={editingBill.value} onChange={(e) => { editUtilityBill(billId, { [field]: e.target.value }); setEditingBill(null); }}
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
    <span onClick={() => setEditingBill({ id: billId, field, value: rawValue != null ? String(rawValue) : (displayVal === "—" ? "" : String(displayVal)) })}
      className="text-stone-600 cursor-pointer hover:text-blue-600 hover:underline tabular-nums truncate" title="Click to edit">
      {displayVal}
    </span>
  );
}