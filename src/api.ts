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
  occupancy_pct?: number;
}

export interface ForecastResponse {
  data: TrendPoint[];
  stats: { mae: number; rmse: number; accuracy: number; upliftPct: number };
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
};
