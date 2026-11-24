import type { UtilityBill } from "./types";
export const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
export const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
export const fmtMonth = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" });
export const fmtMonthLong = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "long", year: "numeric" });
export const fmtTime = (d: string) => new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
export const monthKey = (d: string) => { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`; };

export const PRIO_SORT: Record<string, number> = { red: 0, yellow: 1, green: 2, blue: 3 };
export const sortByPriority = (a: { priority: string }, b: { priority: string }) => (PRIO_SORT[a.priority] ?? 9) - (PRIO_SORT[b.priority] ?? 9);

/** Resolve a display name for a building from utility bill fields — backend resolves account numbers */
export const bldgName = (u: UtilityBill): string => u.building_name || u.service_address || (u.account_number ? `Acct #${u.account_number}` : "Unassigned");
