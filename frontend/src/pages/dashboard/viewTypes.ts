import type { WorkOrderAction } from "./WorkOrderActions";
import type { ParishRole } from "../../services/api";
import type { Dispatch, SetStateAction } from "react";
import type { Appraisal, BuildingData, HistoryEntry, TabKey, TodoItem, UtilityBill, WorkOrder, WorkOrderPriority } from "./types";

export interface WorkOrderInput { title: string; description?: string; priority: WorkOrderPriority; due_date?: string; building_id?: number; todo_id?: number; }
export interface BuildingValuation { name: string; value: number; sqft: number; perSqft: number; pct: number | null; color: string; }
export interface HistoryGroup { month: string; entries: HistoryEntry[]; }
export type BillEditing = { id: number; field: string; value: string } | null;
export interface DashboardViewProps {
  utilities: UtilityBill[]; appraisals: Appraisal[]; buildings: BuildingData[]; todos: TodoItem[]; workOrders: WorkOrder[];
  utilMonthly: Record<string, Record<string, number>>; allMonths: string[];
  utilBuildings: string[]; utilBuildingData: Record<string, Record<string, Record<string, number>>>;
  buildingVals: BuildingValuation[]; totalVal: number; totalValPct: number | null;
  prioCounts: Record<TodoItem["priority"], number>;
  estMonthly: { total: number; items: { type: string; avg: number; min: number; max: number; count: number }[] };
  bldgFinances: { building: string; items: { type: string; avg: number }[]; total: number }[];
  history: HistoryEntry[]; historyByMonth: HistoryGroup[]; recentHistoryByMonth: HistoryGroup[];
  toggleTodo: (id: number) => Promise<void>; setActiveTab: (tab: TabKey) => void;
  showAddTask: boolean; setShowAddTask: (value: boolean) => void;
  newTaskText: string; setNewTaskText: (value: string) => void;
  newTaskBuilding: string; setNewTaskBuilding: (value: string) => void;
  newTaskPriority: "red" | "yellow" | "green"; setNewTaskPriority: (value: "red" | "yellow" | "green") => void;
  addTask: () => Promise<void>; onCancel: () => void; todoBuildings: string[];
  editingTaskId: number | null; setEditingTaskId: (value: number | null) => void;
  editTaskText: string; setEditTaskText: (value: string) => void;
  editTaskPriority: TodoItem["priority"]; setEditTaskPriority: (value: TodoItem["priority"]) => void;
  editTaskBuilding: string; setEditTaskBuilding: (value: string) => void;
  startEditTask: (todo: TodoItem) => void; saveEditTask: (id: number) => Promise<void>; deleteTask: (id: number) => Promise<void>;
  createWorkOrder: (input: WorkOrderInput) => Promise<boolean>;
  historyFilter: string; setHistoryFilter: (value: string) => void;
  uploadedDocs: Record<string, { type: "utility" | "appraisal"; ids: number[]; date: string }>;
  removeUploadedDoc: (filename: string) => Promise<void>;
  showToast: (message: string, type?: "success" | "error") => void;
  editUtilityBill: (id: number, updates: Record<string, unknown>) => Promise<void>;
  deleteUtilityBill: (id: number) => Promise<void>;
  editAppraisal: (id: number, updates: Record<string, unknown>) => Promise<void>;
  refreshData: () => Promise<void>; parishId: string | undefined;
  getAccessTokenSilently: () => Promise<string>; setBuildings: Dispatch<SetStateAction<BuildingData[]>>;
  role: ParishRole | null; subject: string | undefined; transitionOrder: (id: number, action: WorkOrderAction, notes?: string) => Promise<boolean>;
  canEdit: boolean; canDelete: boolean; isAdmin: boolean;
}
