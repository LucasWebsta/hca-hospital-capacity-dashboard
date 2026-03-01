// Central API client for HCA Census Command
// In dev: calls /api/* which Vite proxies to the Azure Functions local dev server (port 7071)
// In production: Azure Static Web Apps handles routing automatically

const BASE = import.meta.env.VITE_API_BASE ?? '/api';

/** Current user id from session (set by login page). Used for user-scoped alert rules. */
function getCurrentUserId(): number | null {
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('user') : null;
    if (!raw) return null;
    const user = JSON.parse(raw) as { id?: number };
    return user?.id != null ? user.id : null;
  } catch {
    return null;
  }
}

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
  occupancy_pct?: number;
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

/** Report configuration (facility, days, sections to include) */
export interface ReportConfig {
  facilityId: number | null;
  facilityName: string;
  trendDays: number;
  sections: ('overview' | 'trend' | 'forecast' | 'facilities' | 'alerts')[];
}

/** Snapshot data: census, trend, forecast, facilities, alerts */
export interface ReportSnapshotData {
  census: CensusMetrics | null;
  trend: TrendPoint[];
  forecast: ForecastResponse | null;
  facilities: Facility[];
  alerts: Alert[];
  capturedAt: string; // ISO
}

/** Saved report snapshot from API */
export interface ReportSnapshot {
  id: string;
  title?: string | null;
  config: ReportConfig;
  data: ReportSnapshotData;
  created_at: string;
}

// ─────────────────────────────────────────────
// API calls
// ─────────────────────────────────────────────

export const api = {
  getCensusMetrics: (facilityId?: number) => get<CensusMetrics>(facilityId ? `/census?facility_id=${facilityId}` : '/census'),
  getFacilities:    (facilityId?: number) => get<Facility[]>(facilityId ? `/facilities?facility_id=${facilityId}` : '/facilities'),
  getAlerts:        () => get<Alert[]>('/alerts'),
  getTrend:         (days = 30, facilityId?: number, series: 'overall' | 'icu' = 'overall') =>
    get<TrendPoint[]>(`/trend?days=${days}&series=${series}${facilityId ? `&facility_id=${facilityId}` : ''}`),
  getForecast:      (days = 7, facilityId?: number)  => get<ForecastResponse>(`/forecast?days=${days}${facilityId ? `&facility_id=${facilityId}` : ''}`),
  getFacilitiesList: () => get<FacilityListItem[]>('/facilitiesList'),
  getMetricTypes:   () => get<string[]>('/metricTypes'),
  getAlertRules:    () => {
    const uid = getCurrentUserId();
    const headers: Record<string, string> = {};
    if (uid != null) headers['X-User-Id'] = String(uid);
    return fetch(`${BASE}/alertRules`, { headers }).then(async (r) => {
      if (!r.ok) throw new Error(`API error ${r.status}`);
      return r.json() as Promise<AlertRule[]>;
    });
  },
  createAlertRule:  (payload: CreateAlertRulePayload) => {
    const uid = getCurrentUserId();
    if (uid == null) return Promise.reject(new Error('Login required to create alert rules'));
    return fetch(`${BASE}/alertRulesPost`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': String(uid) },
      body: JSON.stringify(payload),
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `API error ${r.status}`);
      return r.json() as Promise<AlertRule>;
    });
  },
  deleteAlertRule:  (id: number) => {
    const uid = getCurrentUserId();
    if (uid == null) return Promise.reject(new Error('Login required to delete alert rules'));
    return fetch(`${BASE}/alertRulesDelete?id=${id}`, {
      method: 'DELETE',
      headers: { 'X-User-Id': String(uid) },
    }).then((r) => {
      if (!r.ok && r.status !== 204) throw new Error(`API error ${r.status}`);
    });
  },

  getReportSnapshot:  (id: string) =>
    fetch(`${BASE}/reportSnapshots/${id}`).then(async (r) => {
      if (!r.ok) throw new Error(r.status === 404 ? 'Snapshot not found' : `API error ${r.status}`);
      return r.json() as Promise<ReportSnapshot>;
    }),
  createReportSnapshot: (payload: { title?: string; config: ReportConfig; data: ReportSnapshotData }) => {
    const uid = getCurrentUserId();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (uid != null) headers['X-User-Id'] = String(uid);
    return fetch(`${BASE}/reportSnapshots`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `API error ${r.status}`);
      return r.json() as Promise<{ id: string; created_at: string }>;
    });
  },

  /** Update current user's default date range (7, 14, 30, or 60 days). Persists to users.default_trend_days. */
  updateMyDefaultTrendDays: (userId: number, defaultTrendDays: number) =>
    fetch(`${BASE}/users/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, defaultTrendDays }),
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `API error ${r.status}`);
      return r.json() as Promise<{ defaultTrendDays: number }>;
    }),

  /** Update current user's email and/or phone. Persists to users table. */
  updateMyProfile: (userId: number, data: { email?: string; phoneNumber?: string | null }) =>
    fetch(`${BASE}/users/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ...data }),
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `API error ${r.status}`);
      return r.json() as Promise<{ email?: string; phoneNumber?: string | null }>;
    }),
};
