import { useState, useEffect } from 'react';
import { api } from '../api';
import type { Alert, AlertRule, Facility, FacilityListItem, CreateAlertRulePayload } from '../api';

const BRAND_BLUE = '#092240';
const BRAND_ORANGE = '#E75925';

const METRICS = ['Admissions', 'Births', 'Discharges', 'ICU Occupancy', 'Total Census'];

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

// Pill toggle switch
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
      }}
      aria-label={on ? 'Disable notifications' : 'Enable notifications'}
    >
      <div style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        background: on ? BRAND_BLUE : '#cbd5e1',
        transition: 'background 0.2s',
        position: 'relative',
        flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute',
          top: 3,
          left: on ? 18 : 3,
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: on ? BRAND_BLUE : '#94a3b8' }}>
        {on ? 'On' : 'Off'}
      </span>
    </button>
  );
}

export function AlertsPanel(_props: { tooltipsOn?: boolean } = {}) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [facilitiesList, setFacilitiesList] = useState<FacilityListItem[]>([]);
  const [facilitiesLive, setFacilitiesLive] = useState<Facility[]>([]);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [notificationsOn, setNotificationsOn] = useState(true);
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

  const sel: React.CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    borderRadius: 7,
    border: '1px solid #e2e8f0',
    fontSize: 13,
    color: BRAND_BLUE,
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
    appearance: 'auto',
  };
  const inp: React.CSSProperties = { ...sel };
  const lbl: React.CSSProperties = {
    display: 'block',
    fontSize: 11.5,
    fontWeight: 600,
    color: '#64748b',
    marginBottom: 5,
  };
  const card: React.CSSProperties = {
    background: '#fff',
    borderRadius: 12,
    border: '1px solid #edf0f5',
    padding: '18px 20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)',
  };

  const canUsePercentOccupancy = supportsOccupancy(form.metric);
  const visibleAlerts = notificationsOn ? alerts : [];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', background: '#edf1f8' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 310px', gap: 20, alignItems: 'start', maxWidth: 1440 }}>

        {/* ─── LEFT COLUMN ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Active Alerts */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: BRAND_BLUE }}>Active Alerts</span>
                {visibleAlerts.length > 0 && (
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    background: visibleAlerts.some(a => a.severity === 'HIGH') ? '#fef2f2' : '#fdf0ec',
                    color: visibleAlerts.some(a => a.severity === 'HIGH') ? '#dc2626' : BRAND_ORANGE,
                    borderRadius: 20,
                    padding: '2px 9px',
                    border: `1px solid ${visibleAlerts.some(a => a.severity === 'HIGH') ? '#fecaca' : 'rgba(231,89,37,0.25)'}`,
                  }}>
                    {visibleAlerts.length} active
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Notifications</span>
                  <Toggle on={notificationsOn} onChange={setNotificationsOn} />
                </div>
                <button
                  onClick={loadAlerts}
                  style={{ fontSize: 11.5, fontWeight: 600, color: BRAND_BLUE, background: '#eef2f8', border: '1px solid rgba(9,34,64,0.12)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
                >
                  Refresh
                </button>
              </div>
            </div>

            {!notificationsOn ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Notifications paused</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Toggle on to resume live alerts</div>
              </div>
            ) : visibleAlerts.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>All systems normal</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>No facilities above threshold</div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <th style={{ textAlign: 'left', fontSize: 10.5, fontWeight: 600, color: '#94a3b8', paddingBottom: 9 }}>Facility</th>
                    <th style={{ textAlign: 'left', fontSize: 10.5, fontWeight: 600, color: '#94a3b8', paddingBottom: 9 }}>Message</th>
                    <th style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 600, color: '#94a3b8', paddingBottom: 9 }}>Severity</th>
                    <th style={{ textAlign: 'right', fontSize: 10.5, fontWeight: 600, color: '#94a3b8', paddingBottom: 9 }}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAlerts.map((a) => (
                    <tr key={a.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '10px 12px 10px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: severityDot(a.severity), flexShrink: 0 }} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: BRAND_BLUE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>{a.hospital}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px 10px 0', fontSize: 12.5, color: '#475569' }}>{a.message}</td>
                      <td style={{ padding: '10px 0', textAlign: 'center' }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, background: severityBadgeBg(a.severity), color: severityBadgeColor(a.severity), borderRadius: 5, padding: '3px 8px', border: `1px solid ${severityBadgeColor(a.severity)}33` }}>
                          {a.severity}
                        </span>
                      </td>
                      <td style={{ padding: '10px 0', textAlign: 'right', fontSize: 11.5, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {new Date(a.triggered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* My Alert Rules */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: BRAND_BLUE }}>My Alert Rules</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: '#64748b', background: '#f1f5f9', borderRadius: 20, padding: '2px 10px' }}>
                {alertRules.length} rule{alertRules.length !== 1 ? 's' : ''}
              </span>
            </div>

            {alertRules.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>No rules configured</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Create one using the form on the right</div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <th style={{ textAlign: 'left', fontSize: 10.5, fontWeight: 600, color: '#94a3b8', paddingBottom: 9 }}>Facility</th>
                    <th style={{ textAlign: 'left', fontSize: 10.5, fontWeight: 600, color: '#94a3b8', paddingBottom: 9 }}>Metric</th>
                    <th style={{ textAlign: 'left', fontSize: 10.5, fontWeight: 600, color: '#94a3b8', paddingBottom: 9 }}>Condition</th>
                    <th style={{ textAlign: 'right', fontSize: 10.5, fontWeight: 600, color: '#94a3b8', paddingBottom: 9 }}>Created</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {alertRules.map((r) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '10px 12px 10px 0', fontSize: 13, fontWeight: 600, color: BRAND_BLUE }}>{r.facility_name}</td>
                      <td style={{ padding: '10px 12px 10px 0', fontSize: 12.5, color: '#475569' }}>{r.metric}</td>
                      <td style={{ padding: '10px 12px 10px 0' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 600, background: '#eef2f8', color: BRAND_BLUE, borderRadius: 5, padding: '2px 8px' }}>
                          {describeRule(r)}
                        </span>
                      </td>
                      <td style={{ padding: '10px 0', textAlign: 'right', fontSize: 11.5, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '10px 0 10px 10px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleDeleteRule(r.id)}
                          disabled={deleteId === r.id}
                          style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', background: 'none', border: 'none', cursor: deleteId === r.id ? 'not-allowed' : 'pointer', opacity: deleteId === r.id ? 0.4 : 0.7, padding: '2px 4px' }}
                        >
                          {deleteId === r.id ? '…' : '✕'}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Create Alert Rule */}
          <div style={card}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: BRAND_BLUE, marginBottom: 14 }}>New Alert Rule</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              <div>
                <label style={lbl}>Facility</label>
                <select value={form.facilityId} onChange={(e) => setForm((f) => ({ ...f, facilityId: e.target.value }))} style={sel}>
                  <option value="">Select a facility…</option>
                  {facilitiesList.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>

              <div>
                <label style={lbl}>Metric</label>
                <select
                  value={form.metric}
                  onChange={(e) => {
                    const metric = e.target.value;
                    setForm((f) => ({ ...f, metric, conditionType: (supportsOccupancy(metric) ? f.conditionType : 'value_threshold') as typeof f.conditionType }));
                  }}
                  style={sel}
                >
                  <option value="">Select a metric…</option>
                  {METRICS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div>
                <label style={lbl}>Alert when</label>
                <select value={form.conditionType} onChange={(e) => setForm((f) => ({ ...f, conditionType: e.target.value as typeof form.conditionType }))} style={sel}>
                  {CONDITION_TYPES.filter((c) => c.value !== 'percent_occupancy' || canUsePercentOccupancy).map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              {form.conditionType === 'percent_occupancy' && (
                <div>
                  <label style={lbl}>Threshold (%)</label>
                  <input type="number" min={1} max={100} value={form.thresholdPct} onChange={(e) => setForm((f) => ({ ...f, thresholdPct: e.target.value }))} placeholder="e.g. 90" style={inp} />
                </div>
              )}

              {form.conditionType === 'value_threshold' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Operator</label>
                    <select value={form.operator} onChange={(e) => setForm((f) => ({ ...f, operator: e.target.value }))} style={sel}>
                      {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Value</label>
                    <input type="number" value={form.valueNumber} onChange={(e) => setForm((f) => ({ ...f, valueNumber: e.target.value }))} placeholder="e.g. 50" style={inp} />
                  </div>
                </div>
              )}

              {form.conditionType === 'surge_trend' && (
                <div>
                  <label style={lbl}>Time window (min)</label>
                  <input type="number" min={1} value={form.windowMinutes} onChange={(e) => setForm((f) => ({ ...f, windowMinutes: e.target.value }))} placeholder="e.g. 60" style={inp} />
                </div>
              )}

              <button
                type="button"
                onClick={handleCreateAlert}
                disabled={submitting || !form.facilityId || !form.metric}
                style={{
                  width: '100%',
                  padding: '9px 0',
                  background: submitting || !form.facilityId || !form.metric ? '#e2e8f0' : BRAND_ORANGE,
                  color: submitting || !form.facilityId || !form.metric ? '#94a3b8' : '#fff',
                  fontWeight: 700,
                  fontSize: 13,
                  border: 'none',
                  borderRadius: 8,
                  cursor: submitting || !form.facilityId || !form.metric ? 'not-allowed' : 'pointer',
                  boxShadow: submitting || !form.facilityId || !form.metric ? 'none' : '0 2px 8px rgba(231,89,37,0.3)',
                  marginTop: 2,
                  transition: 'all 0.15s',
                }}
              >
                {submitting ? 'Saving…' : 'Save Rule'}
              </button>
            </div>
          </div>

          {/* System Status */}
          <div style={card}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: BRAND_BLUE, marginBottom: 14 }}>System Status</div>

            {facilitiesLive.length === 0 ? (
              <div style={{ fontSize: 12, color: '#94a3b8', padding: '10px 0' }}>Loading…</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {facilitiesLive.map((f) => {
                  const occ = Number(f.occupancy);
                  const color = occupancyColor(occ);
                  return (
                    <div key={f.name}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: BRAND_BLUE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 155 }}>{f.name}</span>
                        </div>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color, flexShrink: 0 }}>{occ}%</span>
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
