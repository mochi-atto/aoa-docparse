export interface Parish {
  id: number;
  name: string;
  diocese: string | null;
  address: string | null;
}

export interface UtilityChartPoint {
  bill_date: string;
  total_amount: number;
  utility_type: string | null;
  provider_name: string | null;
  service_address: string | null;
  building_name: string | null;
}

export interface AppraisalChartPoint {
  // Per-building fields
  valuation_number: string | null;
  building_name: string | null;
  building_value: number | null;
  content_value: number | null;
  total_valuation: number | null;
  // Document-level fields
  entity_name: string | null;
  appraisal_date: string | null;
  expiration_date: string | null;
  property_address: string | null;
  appraiser_firm: string | null;
}

export interface UploadResponse {
  success: boolean;
  message: string;
  extracted_data: Record<string, unknown>;
}

export interface AssetDocument {
  id: number;
  filename: string;
  source: "upload" | "catalog";
  has_file: boolean; // false for catalog entries (name only)
  size_bytes: number | null;
  created_at: string;
}

export interface Asset {
  id: number;
  parish_id: number;
  name: string;
  asset_type: string | null;
  location: string;
  manufacturer: string | null;
  year_installed: number;
  expected_life: number;
  initial_cost: number;
  accrual_override: number | null;
  remaining_life: number; // derived by the API
  annual_accrual: number; // derived by the API
  documents: AssetDocument[];
  created_at: string;
}
