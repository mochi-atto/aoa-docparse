import type { WorkOrderAction } from "./dashboard/WorkOrderActions";
import ManageMembersModal from "../components/ManageMembersModal";
import { memberApi, type ParishRole } from "../services/api";
import { errorDetail } from "../services/errors";
import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { setAuthToken } from "../services/api";
import { extractUtilityText } from "../services/browserOcr";
import type { BuildingData, Parish, UtilityBill, Appraisal, TodoItem, WorkOrder, WorkOrderPriority, HistoryEntry, TabKey } from "./dashboard/types";
import { UTIL_TYPES, BAR_COLORS, TABS } from "./dashboard/constants";
import { fmtDate, fmtMonth, fmtMonthLong, monthKey, bldgName } from "./dashboard/helpers";
import AssetsTab from "../components/AssetsTab";
import { DashboardTab } from "./dashboard/DashboardTab";
import { FinancesTab } from "./dashboard/FinancesTab";
import { HistoryTab } from "./dashboard/HistoryTab";
import { RisksTab } from "./dashboard/RisksTab";
import { UtilityTab } from "./dashboard/UtilityTab";
import { ValuationsTab } from "./dashboard/ValuationsTab";

export default function DashboardPage() {
  const { parishId } = useParams<{ parishId: string }>();
  const navigate = useNavigate();
  const { getAccessTokenSilently, user, logout } = useAuth0();

  const [role, setRole] = useState<ParishRole | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const isAdmin = role === "admin";
  const canEdit = isAdmin || role === "editor";

  // Data
  const [parish, setParish] = useState<Parish | null>(null);
  const [utilities, setUtilities] = useState<UtilityBill[]>([]);
  const [appraisals, setAppraisals] = useState<Appraisal[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setTemplates] = useState<{ id: number; is_default: boolean }[]>([]);
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
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [parishImage, setParishImage] = useState<string | null>(null);
  // Saved profile settings (fall back to Auth0 values when unset)
  const [profile, setProfile] = useState<{ display_name: string | null; picture_data: string | null } | null>(null);
  const displayName = profile?.display_name || user?.name || "User";
  const avatar = profile?.picture_data || user?.picture || null;

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
      const member = await memberApi.me(parishId!);
      setRole(member.data.role);
      setLoadError("");
      const [pRes, uRes, aRes, tRes, todoRes, histRes, woRes, profileRes] = await Promise.all([
        api.get(`/parishes/${parishId}`),
        api.get(`/data/utility/${parishId}`),
        api.get(`/data/appraisal/${parishId}`),
        api.get(`/templates/`, { params: { parish_id: parishId } }).catch(() => ({ data: [] })),
        api.get(`/parishes/${parishId}/todos`),
        api.get(`/parishes/${parishId}/history`),
        api.get(`/parishes/${parishId}/work-orders`).catch(() => ({ data: [] })),
        api.get(`/users/me`).catch(() => ({ data: null })),
      ]);
      setWorkOrders(woRes.data);
      setProfile(profileRes.data);
      setParish(pRes.data);
      setBuildings(pRes.data.buildings || []);
      setParishImage(pRes.data.image_data || null);
      setUtilities(uRes.data);
      setAppraisals(aRes.data);
      setTemplates(tRes.data);
      setTodos(todoRes.data.map((t: { id: number; text: string; building: string; priority: TodoItem["priority"]; prev_priority?: TodoItem["prevPriority"]; done: boolean; created_at: string }) => ({
        id: t.id, text: t.text, building: t.building,
        priority: t.priority, prevPriority: t.prev_priority,
        done: t.done, createdAt: t.created_at,
      })));
      setHistory(histRes.data.map((h: { id: number; entry_type: string; description: string; created_at: string; undone?: string; user_email?: string; user_name?: string }) => ({
        id: h.id, type: h.entry_type, description: h.description, date: h.created_at, undone: h.undone, user_email: h.user_email, user_name: h.user_name,
      })));
    } catch (err) { setRole(null); setLoadError(errorDetail(err) || "Could not load this parish"); }
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

  const refreshHistory = useCallback(async () => {
    try {
      const token = await getAccessTokenSilently();
      setAuthToken(token);
      const res = await api.get(`/parishes/${parishId}/history`);
      setHistory(res.data.map((h: { id: number; entry_type: string; description: string; created_at: string; undone?: string; user_email?: string; user_name?: string }) => ({ id: h.id, type: h.entry_type, description: h.description, date: h.created_at, undone: h.undone, user_email: h.user_email, user_name: h.user_name })));
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
      setHistory(hRes.data.map((h: { id: number; entry_type: string; description: string; created_at: string; undone?: string; user_email?: string; user_name?: string }) => ({ id: h.id, type: h.entry_type, description: h.description, date: h.created_at, undone: h.undone, user_email: h.user_email, user_name: h.user_name })));
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
      setHistory(hRes.data.map((h: { id: number; entry_type: string; description: string; created_at: string; undone?: string; user_email?: string; user_name?: string }) => ({ id: h.id, type: h.entry_type, description: h.description, date: h.created_at, undone: h.undone, user_email: h.user_email, user_name: h.user_name })));
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
      setHistory(hRes.data.map((h: { id: number; entry_type: string; description: string; created_at: string; undone?: string; user_email?: string; user_name?: string }) => ({ id: h.id, type: h.entry_type, description: h.description, date: h.created_at, undone: h.undone, user_email: h.user_email, user_name: h.user_name })));
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
      setHistory(hRes.data.map((h: { id: number; entry_type: string; description: string; created_at: string; undone?: string; user_email?: string; user_name?: string }) => ({ id: h.id, type: h.entry_type, description: h.description, date: h.created_at, undone: h.undone, user_email: h.user_email, user_name: h.user_name })));
    } catch (err) { console.error(err); }
  };

  // ── Work order handlers (API-backed) ──
  const createWorkOrder = async (payload: { title: string; description?: string; priority: WorkOrderPriority; due_date?: string; building_id?: number; todo_id?: number }) => {
    try {
      const token = await getAccessTokenSilently();
      setAuthToken(token);
      const res = await api.post(`/parishes/${parishId}/work-orders`, payload);
      setWorkOrders((p) => [res.data, ...p]);
      showToast(`Work order ${res.data.display_number} created`);
      const hRes = await api.get(`/parishes/${parishId}/history`);
      setHistory(hRes.data.map((h: { id: number; entry_type: string; description: string; created_at: string; undone?: string; user_email?: string; user_name?: string }) => ({ id: h.id, type: h.entry_type, description: h.description, date: h.created_at, undone: h.undone, user_email: h.user_email, user_name: h.user_name })));
      return true;
    } catch (err) {
      console.error(err);
      showToast(errorDetail(err) || "Could not create work order", "error");
      return false;
    }
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
          const utilityText = await extractUtilityText(file, (ocrProgress) => {
            progress[file.name] = { status: "parsing", progress: Math.max(30, Math.round(30 + ocrProgress * 0.5)) };
            setUploadProgress({ ...progress });
          });

          const form = new FormData();
          form.append("file", file);
          form.append("parish_id", parishId);
          form.append("doc_type", uploadType);
          form.append("extracted_text", utilityText);

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
        } catch (err) {
          progress[file.name] = { status: "error", progress: 100, msg: errorDetail(err) || "Failed" };
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
      setHistory(hRes.data.map((h: { id: number; entry_type: string; description: string; created_at: string; undone?: string; user_email?: string; user_name?: string }) => ({ id: h.id, type: h.entry_type, description: h.description, date: h.created_at, undone: h.undone, user_email: h.user_email, user_name: h.user_name })));
      setUploadMsg(`${successCount}/${stagedFiles.length} files uploaded successfully`);
      setStagedFiles([]);
    } catch {
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
  const editUtilityBill = async (billId: number, updates: Record<string, unknown>) => {
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

  const editAppraisal = async (appraisalId: number, updates: Record<string, unknown>) => {
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
  const transitionOrder = async (id: number, action: WorkOrderAction, notes?: string) => {
    try {
      setAuthToken(await getAccessTokenSilently());
      await api.post(`/parishes/${parishId}/work-orders/${id}/${action}`, action === "submit" ? { completion_notes: notes } : {});
      await refreshData();
      showToast("Work order updated");
      return true;
    } catch (error) { showToast(errorDetail(error) || "Could not update work order", "error"); return false; }
  };

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
    const byBuilding: Record<string, Appraisal[]> = {};
    for (const a of appraisals) {
      const name = a.building_name || "Unknown";
      if (!byBuilding[name]) byBuilding[name] = [];
      byBuilding[name].push(a);
    }
    // For each building, sort by date and take latest + previous
    return Object.entries(byBuilding).map(([name, entries], i) => {
      const sorted = entries.sort((a, b) => new Date(a.appraisal_date || 0).getTime() - new Date(b.appraisal_date || 0).getTime());
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

  const totalVal = buildingVals.reduce((s: number, b) => s + b.value, 0);
  const totalValPct = useMemo(() => {
    if (appraisals.length < 2) return null;
    // Get unique appraisal dates
    const dates = Array.from(new Set<string>(appraisals.map((a) => a.appraisal_date || ""))).filter(Boolean).sort();
    if (dates.length < 2) return null;
    const latestDate = dates[dates.length - 1];
    const prevDate = dates[dates.length - 2];
    const latestTotal = appraisals.filter((a) => a.appraisal_date === latestDate).reduce((s: number, a) => s + (a.building_value || a.total_valuation || 0), 0);
    const prevTotal = appraisals.filter((a) => a.appraisal_date === prevDate).reduce((s: number, a) => s + (a.building_value || a.total_valuation || 0), 0);
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

  if (loadError) return <main className="p-8"><p role="alert">{loadError}</p><button onClick={() => navigate("/parishes")}>Back to parishes</button></main>;

  return (
    <>
      {membersOpen && isAdmin && parishId && <ManageMembersModal parishId={parishId} parishName={parish?.name || "Parish"} onClose={() => setMembersOpen(false)} onChanged={refreshData} />}
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
                {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : displayName[0].toUpperCase()}
              </div>
              <svg className="w-4 h-4 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-stone-200 py-1 z-40">
                <div className="px-3 py-2 border-b border-stone-100">
                  <p className="text-sm font-medium text-stone-700 truncate">{displayName}</p>
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
                <input type="file" accept="image/*" className="hidden" disabled={!isAdmin} onChange={handleImageUpload} />
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
                  <h2 onClick={() => { if (!isAdmin) return; setEditingName(true); setNameInput(parish?.name || ""); }} className="text-xl font-bold text-stone-800 truncate cursor-pointer hover:text-stone-600 transition-colors" style={{ fontFamily: "'Fraunces', serif" }} title="Click to rename">
                    {parish?.name || "Untitled Parish"}
                  </h2>
                )}
                <p className="text-sm text-stone-400 mt-0.5">{parish?.diocese}{parish?.address ? ` · ${parish.address}` : ""}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-stone-400">{buildings.length} building{buildings.length !== 1 ? "s" : ""}</span>
                  <button disabled={!isAdmin} onClick={() => setShowBuildingMgmt(!showBuildingMgmt)}
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
            {isAdmin && showBuildingMgmt && (
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
            {isAdmin && <div className="border-t border-stone-100 px-5 py-3 bg-stone-50/50">
              <div className="flex items-center gap-3">
                <button onClick={() => setMembersOpen(true)} className="border rounded px-3 py-1 text-xs">Manage Members</button><span className="text-xs text-stone-500">Upload:</span>
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
            </div>}

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
          {activeTab === "dashboard" && <DashboardTab canEdit={canEdit}
            utilities={utilities} todos={todos}
            utilMonthly={utilMonthly} allMonths={allMonths} buildingVals={buildingVals}
            totalVal={totalVal} totalValPct={totalValPct}
            prioCounts={prioCounts} estMonthly={estMonthly}
            recentHistoryByMonth={recentHistoryByMonth}
            toggleTodo={toggleTodo} setActiveTab={setActiveTab}
            showAddTask={showAddTask} setShowAddTask={setShowAddTask}
            newTaskText={newTaskText} setNewTaskText={setNewTaskText}
            newTaskBuilding={newTaskBuilding} setNewTaskBuilding={setNewTaskBuilding}
            newTaskPriority={newTaskPriority} setNewTaskPriority={setNewTaskPriority}
            addTask={addTask} buildings={buildings} workOrders={workOrders}
          />}
          {activeTab === "risks" && <RisksTab role={role} subject={user?.sub} transitionOrder={transitionOrder} canEdit={canEdit} canDelete={isAdmin}
            todos={todos} toggleTodo={toggleTodo} todoBuildings={todoBuildings}
            showAddTask={showAddTask} setShowAddTask={setShowAddTask}
            newTaskText={newTaskText} setNewTaskText={setNewTaskText}
            newTaskBuilding={newTaskBuilding} setNewTaskBuilding={setNewTaskBuilding}
            newTaskPriority={newTaskPriority} setNewTaskPriority={setNewTaskPriority}
            addTask={addTask} prioCounts={prioCounts} buildings={buildings}
            editingTaskId={editingTaskId} editTaskText={editTaskText} editTaskPriority={editTaskPriority} editTaskBuilding={editTaskBuilding}
            startEditTask={startEditTask} saveEditTask={saveEditTask} setEditingTaskId={setEditingTaskId}
            setEditTaskText={setEditTaskText} setEditTaskPriority={setEditTaskPriority} setEditTaskBuilding={setEditTaskBuilding} deleteTask={deleteTask}
            workOrders={workOrders} createWorkOrder={createWorkOrder}
          />}
          {activeTab === "assets" && <AssetsTab canManage={isAdmin} canAttach={canEdit} parishId={parishId} getAccessTokenSilently={getAccessTokenSilently} showToast={showToast} onChanged={refreshHistory} />}
          {activeTab === "utility" && <UtilityTab canEdit={isAdmin} utilities={utilities} utilBuildings={utilBuildings} utilBuildingData={utilBuildingData} allMonths={allMonths} buildings={buildings} parishId={parishId} getAccessTokenSilently={getAccessTokenSilently} setBuildings={setBuildings} refreshData={refreshData} editUtilityBill={editUtilityBill} deleteUtilityBill={deleteUtilityBill} showToast={showToast} />}
          {activeTab === "valuations" && <ValuationsTab canEdit={isAdmin} buildingVals={buildingVals} totalVal={totalVal} totalValPct={totalValPct} appraisals={appraisals} buildings={buildings} editAppraisal={editAppraisal} />}
          {activeTab === "finances" && <FinancesTab utilities={utilities} estMonthly={estMonthly} bldgFinances={bldgFinances} todos={todos} />}
          {activeTab === "history" && <HistoryTab canEdit={isAdmin} historyByMonth={historyByMonth} historyFilter={historyFilter} setHistoryFilter={setHistoryFilter} history={history} uploadedDocs={uploadedDocs} removeUploadedDoc={removeUploadedDoc} showToast={showToast} utilities={utilities} appraisals={appraisals} editUtilityBill={editUtilityBill} deleteUtilityBill={deleteUtilityBill} editAppraisal={editAppraisal} refreshData={refreshData} parishId={parishId} getAccessTokenSilently={getAccessTokenSilently} />}
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
