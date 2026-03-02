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
  appraisal_date: string | null;
  entity_name: string | null;
  cost_of_replacement_new: number | null;
  total_exclusions: number | null;
  cost_less_exclusions: number | null;
  flood_value: number | null;
}

export interface UploadResponse {
  success: boolean;
  message: string;
  extracted_data: Record<string, unknown>;
}