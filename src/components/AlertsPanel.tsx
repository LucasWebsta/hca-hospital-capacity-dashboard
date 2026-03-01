import { useState, useEffect } from 'react';
import { api } from '../api';
import type { Alert, AlertRule, Facility, FacilityListItem, CreateAlertRulePayload } from '../api';

const BLUE   = '#092240';
const ORANGE = '#E75925';

const METRICS = ['Admissions', 'Births', 'Discharges', 'ICU Occupancy', 'Total Census'];

const OPERATORS = [
  { value: '>', label: 'Above (>)' },
  { value: '>=', label: 'At or above (≥)' },
  { value: '<', label: 'Below (<)' },
  { value: '<=', label: 'At or below (≤)' },
];

function supportsOccupancy(m: string) {
  return m.toLowerCase().includes('icu') || m.toLowerCase().includes('total');
}

function severityColor(s: string) {
  return s === 'HIGH' ? '#dc2626' : s === 'MEDIUM' ? ORANGE : '#16a34a';
}

function occupancyColor(pct: number) {
  return pct >= 90 ? '#dc2626' : pct >= 80 ? ORANGE : '#16a34a';
}

function describeRule(r: AlertRule): string {
  if (r.condition_type === 'percent_occupancy' && r.threshold_pct != null) return `≥ ${r.threshold_pct}% capacity`;
  if (r.condition_type === 'value_threshold' && r.operator && r.value_number != null) return `${r.operator} ${r.value_number}`;
  if (r.condition_type === 'surge_trend' && r.window_minutes) return `surge / ${r.window_minutes}m`;
  return r.condition_type;
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      title={on ? 'Mute alerts' : 'Unmute alerts'}
      onClick={() => onChange(!on)}
      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
    >
      <div style={{ position: 'relative', width: 32, height: 18, borderRadius: 9, background: on ? BLUE : '#d1d5db', transition: 'background .18s' }}>
        <div style={{ position: 'absolute', top: 2, left: on ? 14 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left .18s', boxShadow: '0 1px 2px rgba(0,0,0,0.18)' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: on ? BLUE : '#4b5563', letterSpacing: 0.2, minWidth: 32 }}>
        {on ? 'Live' : 'Muted'}
      </span>
    </button>
  );
}

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
  borderRadius: 12, border: '1px solid rgba(255,255,255,0.88)',
  padding: '18px 20px', boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
};
const fLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block',
};
const fInput: React.CSSProperties = {
  width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid rgba(0,0,0,0.12)',
  fontSize: 12.5, color: BLUE, background: '#fff', outline: 'none', boxSizing: 'border-box',
};

export function AlertsPanel(_props: { tooltipsOn?: boolean } = {}) {
  const [alerts,     setAlerts]     = useState<Alert[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facList,    setFacList]    = useState<FacilityListItem[]>([]);
  const [rules,      setRules]      = useState<AlertRule[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [notifOn,    setNotifOn]    = useState(true);
  const [form, setForm] = useState({
    facilityId: '', metric: '',
    condition: 'value_threshold' as 'percent_occupancy' | 'value_threshold' | 'surge_trend',
    threshold: '', operator: '>', value: '', window: '60',
  });

  const reload  = () =>
    api.getAlerts().then((data) => {
      setAlerts(data);
      if (data && data.length > 0) api.notifyAlerts(data).catch(() => {});
    }).catch(console.error);
  const reloadR = () => api.getAlertRules().then(setRules).catch(console.error);

  useEffect(() => { reload(); }, []);
  useEffect(() => { reloadR(); }, []);
  useEffect(() => { api.getFacilitiesList().then(setFacList).catch(console.error); }, []);
  useEffect(() => { api.getFacilities().then(setFacilities).catch(console.error); }, []);

  const canPct = supportsOccupancy(form.metric);

  const handleSave = async () => {
    const fid = Number(form.facilityId);
    if (!fid || !form.metric) return;
    if (form.condition === 'percent_occupancy' && !form.threshold.trim()) return;
    if (form.condition === 'value_threshold' && !form.value.trim()) return;
    setSubmitting(true);
    try {
      const p: CreateAlertRulePayload = { hospital_id: fid, metric: form.metric, condition_type: form.condition };
      if (form.condition === 'percent_occupancy') p.threshold_pct = Number(form.threshold);
      if (form.condition === 'value_threshold') { p.operator = form.operator; p.value_number = Number(form.value); }
      if (form.condition === 'surge_trend') p.window_minutes = Number(form.window);
      await api.createAlertRule(p);
      reloadR();
      setForm({ facilityId: '', metric: '', condition: 'value_threshold', threshold: '', operator: '>', value: '', window: '60' });
    } catch (e) { console.error(e); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try { await api.deleteAlertRule(id); reloadR(); }
    catch (e) { console.error(e); }
    finally { setDeletingId(null); }
  };

  const visibleAlerts = notifOn ? alerts : [];
  const hasHigh = visibleAlerts.some(a => a.severity === 'HIGH');

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 296px', gap: 18, alignItems: 'start', maxWidth: 1400 }}>

        {/* ── LEFT ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Active Alerts */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: BLUE }}>Active Alerts</span>
                {notifOn && alerts.length > 0 && (
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, padding: '1px 8px', borderRadius: 20,
                    background: hasHigh ? '#fef2f2' : '#fff8f5',
                    color: hasHigh ? '#dc2626' : ORANGE,
                    border: `1px solid ${hasHigh ? '#fecaca' : 'rgba(231,89,37,0.3)'}`,
                  }}>{alerts.length}</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Toggle on={notifOn} onChange={setNotifOn} />
                <button onClick={reload} style={{ fontSize: 11, color: '#374151', background: 'none', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 6, padding: '4px 9px', cursor: 'pointer' }}>↻</button>
              </div>
            </div>

            {!notifOn ? (
              <div style={{ padding: '32px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Alerts muted</div>
                <div style={{ fontSize: 12, color: '#4b5563', marginTop: 3 }}>Toggle Live to resume</div>
              </div>
            ) : alerts.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>All clear</div>
                <div style={{ fontSize: 12, color: '#4b5563', marginTop: 3 }}>No facilities above threshold</div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Facility', 'Message', 'Level', 'Time'].map((h, i) => (
                      <th key={h} style={{ textAlign: i >= 2 ? (i === 2 ? 'center' : 'right') : 'left', fontSize: 10, fontWeight: 600, color: '#4b5563', paddingBottom: 8, letterSpacing: 0.4, textTransform: 'uppercase', borderBottom: '1px solid rgba(0,0,0,0.08)', ...(i === 2 ? { width: 72 } : i === 3 ? { width: 56 } : {}) }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleAlerts.map((a) => {
                    const sc = severityColor(a.severity);
                    return (
                      <tr key={a.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                        <td style={{ padding: '10px 14px 10px 0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: sc, flexShrink: 0 }} />
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: BLUE, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.hospital}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px 10px 0', fontSize: 12.5, color: '#4b5563' }}>{a.message}</td>
                        <td style={{ padding: '10px 0', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: sc + '18', color: sc, border: `1px solid ${sc}28` }}>{a.severity}</span>
                        </td>
                        <td style={{ padding: '10px 0', textAlign: 'right', fontSize: 11, color: '#4b5563', whiteSpace: 'nowrap' }}>
                          {new Date(a.triggered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* My Rules */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: BLUE }}>My Alert Rules</span>
              {rules.length > 0 && (
                <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', background: '#f3f4f6', borderRadius: 20, padding: '1px 9px' }}>{rules.length}</span>
              )}
            </div>

            {rules.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: '#4b5563' }}>
                No rules yet — create one using the form →
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Facility', 'Metric', 'Condition', 'Added', ''].map((h, i) => (
                      <th key={i} style={{ textAlign: i === 3 ? 'right' : 'left', fontSize: 10, fontWeight: 600, color: '#4b5563', paddingBottom: 8, letterSpacing: 0.4, textTransform: 'uppercase', borderBottom: '1px solid rgba(0,0,0,0.08)', ...(i === 4 ? { width: 24 } : {}) }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                      <td style={{ padding: '10px 12px 10px 0', fontSize: 12.5, fontWeight: 600, color: BLUE }}>{r.facility_name}</td>
                      <td style={{ padding: '10px 12px 10px 0', fontSize: 12, color: '#4b5563' }}>{r.metric}</td>
                      <td style={{ padding: '10px 12px 10px 0' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, background: '#f0f4ff', color: BLUE, borderRadius: 5, padding: '2px 7px', fontFamily: 'ui-monospace, monospace' }}>
                          {describeRule(r)}
                        </span>
                      </td>
                      <td style={{ padding: '10px 0', textAlign: 'right', fontSize: 11, color: '#4b5563', whiteSpace: 'nowrap' }}>
                        {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                      <td style={{ padding: '10px 0 10px 8px' }}>
                        <button type="button" onClick={() => handleDelete(r.id)} disabled={deletingId === r.id} title="Remove" style={{ background: 'none', border: 'none', cursor: deletingId === r.id ? 'default' : 'pointer', color: '#d1d5db', fontSize: 14, padding: '0 2px', lineHeight: 1, opacity: deletingId === r.id ? 0.3 : 1 }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── RIGHT ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* New Rule Form */}
          <div style={card}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: BLUE, marginBottom: 14 }}>New Alert Rule</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              <div>
                <label style={fLabel}>Facility</label>
                <select style={fInput} value={form.facilityId} onChange={e => setForm(f => ({ ...f, facilityId: e.target.value }))}>
                  <option value="">Select…</option>
                  {facList.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>

              <div>
                <label style={fLabel}>Metric</label>
                <select style={fInput} value={form.metric} onChange={e => { const m = e.target.value; setForm(f => ({ ...f, metric: m, condition: supportsOccupancy(m) ? f.condition : 'value_threshold' })); }}>
                  <option value="">Select…</option>
                  {METRICS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div>
                <label style={fLabel}>Trigger</label>
                <select style={fInput} value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value as typeof f.condition }))}>
                  {canPct && <option value="percent_occupancy">% occupancy exceeds</option>}
                  <option value="value_threshold">Value threshold</option>
                  <option value="surge_trend">Surge trend</option>
                </select>
              </div>

              {form.condition === 'percent_occupancy' && (
                <div>
                  <label style={fLabel}>Threshold (%)</label>
                  <input style={fInput} type="number" min={1} max={100} placeholder="90" value={form.threshold} onChange={e => setForm(f => ({ ...f, threshold: e.target.value }))} />
                </div>
              )}

              {form.condition === 'value_threshold' && (
                <div style={{ display: 'flex', gap: 7 }}>
                  <div style={{ flex: '0 0 55%' }}>
                    <label style={fLabel}>Operator</label>
                    <select style={fInput} value={form.operator} onChange={e => setForm(f => ({ ...f, operator: e.target.value }))}>
                      {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={fLabel}>Value</label>
                    <input style={fInput} type="number" placeholder="50" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} />
                  </div>
                </div>
              )}

              {form.condition === 'surge_trend' && (
                <div>
                  <label style={fLabel}>Window (min)</label>
                  <input style={fInput} type="number" min={1} placeholder="60" value={form.window} onChange={e => setForm(f => ({ ...f, window: e.target.value }))} />
                </div>
              )}

              <button
                type="button" onClick={handleSave}
                disabled={submitting || !form.facilityId || !form.metric}
                style={{
                  marginTop: 4, width: '100%', padding: '9px 0',
                  background: submitting || !form.facilityId || !form.metric ? '#e5e7eb' : ORANGE,
                  color: submitting || !form.facilityId || !form.metric ? '#4b5563' : '#fff',
                  fontWeight: 700, fontSize: 13, border: 'none', borderRadius: 8,
                  cursor: submitting || !form.facilityId || !form.metric ? 'not-allowed' : 'pointer',
                  boxShadow: submitting || !form.facilityId || !form.metric ? 'none' : '0 2px 8px rgba(231,89,37,0.28)',
                  transition: 'all .15s',
                }}
              >{submitting ? 'Saving…' : 'Save Rule'}</button>
            </div>
          </div>

          {/* System Status */}
          <div style={card}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: BLUE, marginBottom: 14 }}>System Status</div>
            {facilities.length === 0 ? (
              <div style={{ fontSize: 12, color: '#4b5563' }}>Loading…</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {facilities.map(f => {
                  const pct = Number(f.occupancy);
                  const col = occupancyColor(pct);
                  return (
                    <div key={f.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: col }} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: BLUE, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: col }}>{pct}%</span>
                      </div>
                      <div style={{ height: 3, background: '#f1f5f9', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: col, borderRadius: 2, transition: 'width .5s ease' }} />
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



