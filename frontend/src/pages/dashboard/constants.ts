import type { WorkOrderPriority, TabKey } from "./types";

export const PRIORITY = {
  red:    { label: "Overdue",   desc: "Past deadline — needs immediate attention",     bg: "bg-red-50",     border: "border-red-200",    dot: "bg-red-500",     badge: "bg-red-100 text-red-700",         ring: "ring-red-300" },
  yellow: { label: "At Risk",   desc: "Approaching deadline — plan action soon",       bg: "bg-amber-50",   border: "border-amber-200",  dot: "bg-amber-500",   badge: "bg-amber-100 text-amber-700",     ring: "ring-amber-300" },
  green:  { label: "Due Soon",  desc: "Upcoming task — no immediate concern",          bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700", ring: "ring-emerald-300" },
  blue:   { label: "Addressed", desc: "Completed or scheduled — cleared end of month", bg: "bg-sky-50",     border: "border-sky-200",    dot: "bg-sky-500",     badge: "bg-sky-100 text-sky-700",         ring: "ring-sky-300" },
} as const;

export const PRIO_ORDER: (keyof typeof PRIORITY)[] = ["red", "yellow", "green", "blue"];

export const WO_PRIORITIES: WorkOrderPriority[] = ["low", "medium", "high", "urgent"];
export const WO_PRIORITY_BADGE: Record<WorkOrderPriority, string> = { low: "bg-stone-100 text-stone-600", medium: "bg-emerald-100 text-emerald-700", high: "bg-amber-100 text-amber-700", urgent: "bg-red-100 text-red-700" };
// Suggested work order priority when creating one from a backlog task
export const TODO_TO_WO_PRIORITY: Record<string, WorkOrderPriority> = { red: "urgent", yellow: "high", green: "medium", blue: "low" };
export const MAX_DASHBOARD_WO_CHIPS = 6;  // more than this collapses into "+N more" on the dashboard card
export const MAX_TASK_WO_CHIPS = 2;       // per task row on the dashboard card
export const WO_STATUS_LABEL: Record<string, string> = { unassigned: "Unassigned", assigned: "Assigned", in_progress: "In Progress", ready_for_review: "Ready for Review", closed: "Closed", on_hold: "On Hold" };

export const UTIL_TYPES = ["electric", "water", "gas", "waste"] as const;
export const UTIL_LABEL: Record<string, string> = { electric: "Electric", water: "Water", gas: "Gas", waste: "Waste" };
export const UTIL_COLOR: Record<string, string> = { electric: "#f59e0b", water: "#3b82f6", gas: "#ef4444", waste: "#8b5cf6" };
export const UTIL_ICON: Record<string, string> = { electric: "⚡", water: "💧", gas: "🔥", waste: "♻️" };
export const UTIL_TYPE_OPTIONS = ["electric", "water", "gas", "waste", "other"];

export const BAR_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

export const TABS: { key: TabKey; label: string }[] = [
  { key: "dashboard",  label: "Dashboard" },
  { key: "utility",    label: "Utility Use" },
  { key: "valuations", label: "Building Valuations" },
  { key: "risks",      label: "Active Risks" },
  { key: "finances",   label: "Finances" },
  { key: "history",    label: "History" },
];
