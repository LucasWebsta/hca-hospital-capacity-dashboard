// Central API client for HCA Census Command
// In dev: calls /api/* which Vite proxies to the Azure Functions local dev server (port 7071)
// In production: Azure Static Web Apps handles routing automatically

const BASE = import.meta.env.VITE_API_BASE ?? '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface CensusMetrics {
  totalCensus: number;
  totalCapacity: number;
  occupancyRate: number;
  sevenDayForecast: number;
  /** Sum of latest ICU metric_value across facilities (for capacity alerts) */
  icuTotal?: number;
}

export interface Facility {
  name: string;
  census: number;
  occupancy: number;
  capacity: number;
  trend: 'up' | 'down' | 'flat';
}

export interface Alert {
  id: number;
  hospital: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'OK';
  message: string;
  triggered_at: string;
  is_active: boolean;
}

export interface TrendPoint {
  date: string;
  actual?: number;
  forecast?: number;
  lower?: number;
  upper?: number;
}

export interface ForecastResponse {
  data: TrendPoint[];
  stats: { mae: number; rmse: number; accuracy: number; upliftPct: number };
}

/** For alerts page: facility dropdown (hospitals table) */
export interface FacilityListItem {
  id: number;
  name: string;
}

/** User-created alert rule */
export interface AlertRule {
  id: number;
  hospital_id: number;
  facility_name: string;
  metric: string;
  condition_type: 'percent_occupancy' | 'value_threshold' | 'surge_trend';
  threshold_pct?: number;
  operator?: string;
  value_number?: number;
  window_minutes?: number;
  created_at: string;
}

/** Payload to create an alert rule */
export interface CreateAlertRulePayload {
  hospital_id: number;
  metric: string;
  condition_type: string;
  threshold_pct?: number;
  operator?: string;
  value_number?: number;
  window_minutes?: number;
}

// ─────────────────────────────────────────────
// API calls
// ─────────────────────────────────────────────

export const api = {
  getCensusMetrics: () => get<CensusMetrics>('/census'),
  getFacilities:    () => get<Facility[]>('/facilities'),
  getAlerts:        () => get<Alert[]>('/alerts'),
  getTrend:         (days = 30) => get<TrendPoint[]>(`/trend?days=${days}`),
  getForecast:      (days = 7)  => get<ForecastResponse>(`/forecast?days=${days}`),
  getFacilitiesList: () => get<FacilityListItem[]>('/facilitiesList'),
  getMetricTypes:   () => get<string[]>('/metricTypes'),
  getAlertRules:    () => get<AlertRule[]>('/alertRules'),
  createAlertRule:  (payload: CreateAlertRulePayload) =>
    fetch(`${BASE}/alertRulesPost`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(async (r) => {
      if (!r.ok) throw new Error(`API error ${r.status}`);
      return r.json() as Promise<AlertRule>;
    }),
  deleteAlertRule:  (id: number) =>
    fetch(`${BASE}/alertRulesDelete?id=${id}`, { method: 'DELETE' }).then((r) => {
      if (!r.ok && r.status !== 204) throw new Error(`API error ${r.status}`);
    }),
};
