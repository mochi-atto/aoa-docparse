export interface BuildingData { id: number; name: string; account_numbers: Record<string, string> | null; }
export interface Parish { id: number; name: string; diocese: string; address: string; image_data?: string; buildings?: BuildingData[]; }
export interface UtilityBill { id: number; utility_type: string; bill_date: string; total_amount: number; building_name?: string; service_address?: string; account_number?: string; original_filename?: string; usage_quantity?: number; usage_unit?: string; provider_name?: string; }
export interface Appraisal { id: number; entity_name?: string; appraisal_date?: string; building_name?: string; building_value?: number; total_valuation?: number; gross_sq_ft?: number; property_address?: string; original_filename?: string; appraiser_firm?: string; expiration_date?: string; valuation_number?: string; content_value?: number; }
export interface TodoItem { id: number; text: string; building: string; priority: "red" | "yellow" | "green" | "blue"; prevPriority?: "red" | "yellow" | "green"; done: boolean; createdAt: string; }
export interface WorkOrder { id: number; display_number: string; building_id: number | null; todo_id: number | null; title: string; description: string | null; priority: WorkOrderPriority; due_date: string | null; status: string; requester_name: string | null; technician_name: string | null; created_at: string; }
export type WorkOrderPriority = "low" | "medium" | "high" | "urgent";
export interface HistoryEntry { id: number; type: string; description: string; date: string; undone?: string; user_email?: string; user_name?: string; }

export type TabKey = "dashboard" | "utility" | "valuations" | "risks" | "finances" | "history";
