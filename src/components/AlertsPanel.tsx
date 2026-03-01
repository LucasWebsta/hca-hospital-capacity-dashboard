import { useState, useEffect } from 'react';
import { api } from '../api';
import type { Alert, AlertRule, Facility, FacilityListItem, CreateAlertRulePayload } from '../api';

// HCA Brand colors: Blue #092240 | Orange #E75925
const BRAND_BLUE = '#092240';
const BRAND_ORANGE = '#E75925';

const METRICS = ['Admissions', 'Births', 'Discharges', 'ICU Occupancy', 'Total Census'];

// Percent occupancy only for ICU and Total (case-insensitive)
function supportsOccupancy(metric: string): boolean {
  const m = metric.toLowerCase();
  return m.includes('icu') || m.includes('total');
}

const CONDITION_TYPES = [
  { value: 'percent_occupancy', label: 'Percent occupancy' },
  { value: 'value_threshold', label: 'Value threshold' },
  { value: 'surge_trend', label: 'Surge / trend' },
] as const;

const OPERATORS = [
  { value: '>', label: 'Above (>)' },
  { value: '>=', label: 'At or above (≥)' },
  { value: '<', label: 'Below (<)' },
  { value: '<=', label: 'At or below (≤)' },
];

function severityDot(severity: string): string {
  if (severity === 'HIGH') return '#dc2626';
  if (severity === 'MEDIUM') return BRAND_ORANGE;
  return '#16a34a';
}

function severityBadgeBg(severity: string): string {
  if (severity === 'HIGH') return '#fef2f2';
  if (severity === 'MEDIUM') return '#fdf0ec';
  return '#f0fdf4';
}

function severityBadgeColor(severity: string): string {
  if (severity === 'HIGH') return '#dc2626';
  if (severity === 'MEDIUM') return BRAND_ORANGE;
  return '#16a34a';
}

function describeRule(r: AlertRule): string {
  if (r.condition_type === 'percent_occupancy' && r.threshold_pct != null)
    return `occupancy > ${r.threshold_pct}%`;
  if (r.condition_type === 'value_threshold' && r.operator != null && r.value_number != null)
    return `value ${r.operator} ${r.value_number}`;
  if (r.condition_type === 'surge_trend' && r.window_minutes != null)
    return `surge in ${r.window_minutes}m`;
  return r.condition_type;
}

function occupancyColor(pct: number): string {
  if (pct >= 90) return '#dc2626';
  if (pct >= 80) return BRAND_ORANGE;
  return '#16a34a';
}

export function AlertsPanel() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [facilitiesList, setFacilitiesList] = useState<FacilityListItem[]>([]);
  const [facilitiesLive, setFacilitiesLive] = useState<Facility[]>([]);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({
    facilityId: '',
    metric: '',
    conditionType: 'value_threshold' as 'percent_occupancy' | 'value_threshold' | 'surge_trend',
    thresholdPct: '',
    operator: '>',
    valueNumber: '',
    windowMinutes: '60',
  });

  const loadAlerts = () => api.getAlerts().then(setAlerts).catch(console.error);
  const loadRules  = () => api.getAlertRules().then(setAlertRules).catch(console.error);

  useEffect(() => { loadAlerts(); }, []);
  useEffect(() => { api.getFacilitiesList().then(setFacilitiesList).catch(console.error); }, []);
  useEffect(() => { api.getFacilities().then(setFacilitiesLive).catch(console.error); }, []);
  useEffect(() => { loadRules(); }, []);

  const metricTypes = METRICS;
  const canUsePercentOccupancy = supportsOccupancy(form.metric);

  const handleCreateAlert = async () => {
    const hospitalId = form.facilityId ? Number(form.facilityId) : 0;
    if (!hospitalId || !form.metric || !form.conditionType) return;
    if (form.conditionType === 'percent_occupancy' && !canUsePercentOccupancy) return;
    if (form.conditionType === 'percent_occupancy' && !form.thresholdPct.trim()) return;
    if (form.conditionType === 'value_threshold' && !form.valueNumber.trim()) return;
    if (form.conditionType === 'surge_trend' && !form.windowMinutes.trim()) return;

    setSubmitting(true);
    try {
      const payload: CreateAlertRulePayload = {
        hospital_id: hospitalId,
        metric: form.metric,
        condition_type: form.conditionType,
      };
      if (form.conditionType === 'percent_occupancy') payload.threshold_pct = Number(form.thresholdPct);
      if (form.conditionType === 'value_threshold') {
        payload.operator = form.operator;
        payload.value_number = Number(form.valueNumber);
      }
      if (form.conditionType === 'surge_trend') payload.window_minutes = Number(form.windowMinutes);
      await api.createAlertRule(payload);
      loadRules();
      setForm({ facilityId: '', metric: '', conditionType: 'value_threshold', thresholdPct: '', operator: '>', valueNumber: '', windowMinutes: '60' });
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRule = async (id: number) => {
    setDeleteId(id);
    try {
      await api.deleteAlertRule(id);
      loadRules();
    } catch (e) {
      console.error(e);
    } finally {
      setDeleteId(null);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    borderRadius: 7,
    border: '1px solid #e2e8f0',
    fontSize: 12.5,
    color: BRAND_BLUE,
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 10.5,
    fontWeight: 700,
    color: '#64748b',
    marginBottom: 5,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', background: '#edf1f8' }}>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: -0.3 }}>
          Alerts & Notifications
        </div>
        <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 3, fontWeight: 500 }}>
          Real-time occupancy alerts · Configure rules per facility and metric
        </div>
      </div>

      {/* Two-column grid — matches dashboard layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 330px', gap: 22, alignItems: 'start', maxWidth: 1440 }}>

        {/* ─── LEFT COLUMN ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Active Alerts card */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #edf0f5', padding: '20px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: BRAND_BLUE }}>Active Alerts</div>
                <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
                  Triggered from live facility metrics
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {alerts.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, background: alerts.some(a => a.severity === 'HIGH') ? '#fef2f2' : '#fdf0ec', color: alerts.some(a => a.severity === 'HIGH') ? '#dc2626' : BRAND_ORANGE, borderRadius: 6, padding: '3px 10px', border: `1px solid ${alerts.some(a => a.severity === 'HIGH') ? '#fecaca' : 'rgba(231,89,37,0.25)'}` }}>
                    {alerts.length} active
                  </span>
                )}
                <button
                  onClick={loadAlerts}
                  style={{ fontSize: 11, fontWeight: 600, color: BRAND_BLUE, background: '#e8eef8', border: '1px solid rgba(9,34,64,0.15)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
                >
                  Refresh
                </button>
              </div>
            </div>

            {alerts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '28px 0', color: '#94a3b8' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>All systems normal</div>
                <div style={{ fontSize: 11.5, marginTop: 4 }}>No facilities are above alert thresholds</div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <th style={{ textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: '#94a3b8', paddingBottom: 10, letterSpacing: 0.5 }}>FACILITY</th>
                    <th style={{ textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: '#94a3b8', paddingBottom: 10 }}>MESSAGE</th>
                    <th style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 700, color: '#94a3b8', paddingBottom: 10 }}>SEVERITY</th>
                    <th style={{ textAlign: 'right', fontSize: 10.5, fontWeight: 700, color: '#94a3b8', paddingBottom: 10 }}>TRIGGERED</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => (
                    <tr key={a.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '11px 0', paddingRight: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: severityDot(a.severity), flexShrink: 0 }} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: BRAND_BLUE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{a.hospital}</span>
                        </div>
                      </td>
                      <td style={{ padding: '11px 0', paddingRight: 12 }}>
                        <span style={{ fontSize: 12, color: '#475569' }}>{a.message}</span>
                      </td>
                      <td style={{ padding: '11px 0', textAlign: 'center' }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, background: severityBadgeBg(a.severity), color: severityBadgeColor(a.severity), borderRadius: 5, padding: '3px 8px', border: `1px solid ${severityBadgeColor(a.severity)}33` }}>
                          {a.severity}
                        </span>
                      </td>
                      <td style={{ padding: '11px 0', textAlign: 'right', fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {new Date(a.triggered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* My Alert Rules card */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #edf0f5', padding: '20px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: BRAND_BLUE }}>My Alert Rules</div>
                <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
                  Saved notification rules — checked against live data
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', background: '#f1f5f9', borderRadius: 6, padding: '3px 10px' }}>
                {alertRules.length} rule{alertRules.length !== 1 ? 's' : ''}
              </span>
            </div>

            {alertRules.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8' }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>🔔</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>No rules yet</div>
                <div style={{ fontSize: 11.5, marginTop: 4 }}>Use the form on the right to create your first alert rule</div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <th style={{ textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: '#94a3b8', paddingBottom: 10, letterSpacing: 0.5 }}>FACILITY</th>
                    <th style={{ textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: '#94a3b8', paddingBottom: 10 }}>METRIC</th>
                    <th style={{ textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: '#94a3b8', paddingBottom: 10 }}>CONDITION</th>
                    <th style={{ textAlign: 'right', fontSize: 10.5, fontWeight: 700, color: '#94a3b8', paddingBottom: 10 }}>CREATED</th>
                    <th style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 700, color: '#94a3b8', paddingBottom: 10 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {alertRules.map((r) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '11px 0', paddingRight: 12 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: BRAND_BLUE }}>{r.facility_name}</span>
                      </td>
                      <td style={{ padding: '11px 0', paddingRight: 12 }}>
                        <span style={{ fontSize: 12, color: '#475569' }}>{r.metric}</span>
                      </td>
                      <td style={{ padding: '11px 0', paddingRight: 12 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 600, background: '#e8eef8', color: BRAND_BLUE, borderRadius: 5, padding: '2px 8px' }}>
                          {describeRule(r)}
                        </span>
                      </td>
                      <td style={{ padding: '11px 0', textAlign: 'right', fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '11px 0', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleDeleteRule(r.id)}
                          disabled={deleteId === r.id}
                          style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 5, padding: '3px 8px', cursor: deleteId === r.id ? 'not-allowed' : 'pointer', opacity: deleteId === r.id ? 0.5 : 1 }}
                        >
                          {deleteId === r.id ? '…' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ─── RIGHT COLUMN ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Create Alert Rule card */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #edf0f5', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: BRAND_BLUE, marginBottom: 4 }}>Create Alert Rule</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>Saved to your account · evaluated against live data</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Facility */}
              <div>
                <label style={labelStyle}>Facility</label>
                <select
                  value={form.facilityId}
                  onChange={(e) => setForm((f) => ({ ...f, facilityId: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="">Select a facility…</option>
                  {facilitiesList.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              {/* Metric */}
              <div>
                <label style={labelStyle}>Metric</label>
                <select
                  value={form.metric}
                  onChange={(e) => {
                    const metric = e.target.value;
                    setForm((f) => ({
                      ...f,
                      metric,
                      conditionType: (supportsOccupancy(metric) ? f.conditionType : 'value_threshold') as typeof f.conditionType,
                    }));
                  }}
                  style={inputStyle}
                >
                  <option value="">Select a metric…</option>
                  {metricTypes.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* Alert when */}
              <div>
                <label style={labelStyle}>Alert When</label>
                <select
                  value={form.conditionType}
                  onChange={(e) => setForm((f) => ({ ...f, conditionType: e.target.value as typeof form.conditionType }))}
                  style={inputStyle}
                >
                  {CONDITION_TYPES.filter((c) => c.value !== 'percent_occupancy' || canUsePercentOccupancy).map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* Dynamic condition fields */}
              {form.conditionType === 'percent_occupancy' && (
                <div>
                  <label style={labelStyle}>Occupancy threshold (%)</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={form.thresholdPct}
                    onChange={(e) => setForm((f) => ({ ...f, thresholdPct: e.target.value }))}
                    placeholder="e.g. 90"
                    style={inputStyle}
                  />
                </div>
              )}

              {form.conditionType === 'value_threshold' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Operator</label>
                    <select
                      value={form.operator}
                      onChange={(e) => setForm((f) => ({ ...f, operator: e.target.value }))}
                      style={inputStyle}
                    >
                      {OPERATORS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Value</label>
                    <input
                      type="number"
                      value={form.valueNumber}
                      onChange={(e) => setForm((f) => ({ ...f, valueNumber: e.target.value }))}
                      placeholder="e.g. 50"
                      style={inputStyle}
                    />
                  </div>
                </div>
              )}

              {form.conditionType === 'surge_trend' && (
                <div>
                  <label style={labelStyle}>Time window (minutes)</label>
                  <input
                    type="number"
                    min={1}
                    value={form.windowMinutes}
                    onChange={(e) => setForm((f) => ({ ...f, windowMinutes: e.target.value }))}
                    placeholder="e.g. 60"
                    style={inputStyle}
                  />
                  <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 5 }}>
                    Alert when this metric spikes over the time window
                  </div>
                </div>
              )}

              {/* Save button */}
              <button
                type="button"
                onClick={handleCreateAlert}
                disabled={submitting || !form.facilityId || !form.metric}
                style={{
                  width: '100%',
                  padding: '10px 0',
                  background: submitting || !form.facilityId || !form.metric ? '#e2e8f0' : BRAND_ORANGE,
                  color: submitting || !form.facilityId || !form.metric ? '#94a3b8' : '#fff',
                  fontWeight: 700,
                  fontSize: 13,
                  border: 'none',
                  borderRadius: 8,
                  cursor: submitting || !form.facilityId || !form.metric ? 'not-allowed' : 'pointer',
                  boxShadow: submitting || !form.facilityId || !form.metric ? 'none' : '0 2px 8px rgba(231,89,37,0.35)',
                  marginTop: 4,
                  transition: 'all 0.15s',
                }}
              >
                {submitting ? 'Saving…' : '+ Save Alert Rule'}
              </button>
            </div>
          </div>

          {/* System Status card */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #edf0f5', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: BRAND_BLUE, marginBottom: 4 }}>System Status</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>Current occupancy by facility</div>

            {facilitiesLive.length === 0 ? (
              <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>Loading…</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {facilitiesLive.map((f) => {
                  const occ = Number(f.occupancy);
                  const color = occupancyColor(occ);
                  return (
                    <div key={f.name}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: BRAND_BLUE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{f.name}</span>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color, flexShrink: 0 }}>{occ}%</span>
                      </div>
                      <div style={{ width: '100%', height: 4, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(occ, 100)}%`, background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
