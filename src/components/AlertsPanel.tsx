import { useState, useEffect } from 'react';
import { api } from '../api';
import type { Alert, AlertRule, CensusMetrics, FacilityListItem, CreateAlertRulePayload } from '../api';

const GENERAL_CAPACITY_THRESHOLD_PCT = 90;
const ICU_BEDS_THRESHOLD = 50;  // Alert when ICU beds in use exceeds this

// HCA Brand colors: Blue #092240 | Orange #E75925
const BRAND_BLUE = '#092240';
const BRAND_ORANGE = '#E75925';

const miniBarData = [3, 5, 4, 7, 9, 8, 6, 10, 12, 9, 11, 8];
const maxBar = Math.max(...miniBarData);

// Percent occupancy only for ICU and Total (case-insensitive)
function supportsOccupancy(metric: string): boolean {
  const m = metric.toLowerCase();
  return m === 'icu' || m === 'total';
}

const CONDITION_TYPES = [
  { value: 'percent_occupancy', label: 'Percent occupancy (ICU or total only)' },
  { value: 'value_threshold', label: 'Value threshold (above/below a number)' },
  { value: 'surge_trend', label: 'Surge / trend (change over time window)' },
] as const;

const OPERATORS = [
  { value: '>', label: 'Above (>)' },
  { value: '>=', label: 'At or above (≥)' },
  { value: '<', label: 'Below (<)' },
  { value: '<=', label: 'At or below (≤)' },
];

function alertStyle(severity: string) {
  if (severity === 'HIGH')   return { bg: '#fdf0ec', border: 'rgba(231,89,37,0.3)',  icon: '⚠️', iconBg: 'rgba(231,89,37,0.15)', textColor: '#7c2d12', timeColor: '#9a3412', badgeBg: BRAND_ORANGE,  badgeColor: '#fff'     };
  if (severity === 'MEDIUM') return { bg: '#fffbeb', border: 'rgba(234,179,8,0.3)', icon: '⚠️', iconBg: 'rgba(234,179,8,0.15)',  textColor: '#713f12', timeColor: '#854d0e', badgeBg: '#eab308',     badgeColor: '#fff'     };
  return                             { bg: '#f0fdf4', border: '#bbf7d0',             icon: '✅', iconBg: '#dcfce7',              textColor: '#166534', timeColor: '#15803d', badgeBg: '#bbf7d0',     badgeColor: '#15803d'  };
}

function describeRule(r: AlertRule): string {
  const metricLabel = r.metric;
  if (r.condition_type === 'percent_occupancy' && r.threshold_pct != null) return `${metricLabel} occupancy above ${r.threshold_pct}%`;
  if (r.condition_type === 'value_threshold' && r.operator != null && r.value_number != null) return `${metricLabel} ${r.operator} ${r.value_number}`;
  if (r.condition_type === 'surge_trend' && r.window_minutes != null) return `${metricLabel} surge/trend in past ${r.window_minutes} min`;
  return `${metricLabel} · ${r.condition_type}`;
}

export function AlertsPanel() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [census, setCensus] = useState<CensusMetrics | null>(null);
  const [facilities, setFacilities] = useState<FacilityListItem[]>([]);
  const [metricTypes, setMetricTypes] = useState<string[]>([]);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    facilityId: '',
    metric: '',
    conditionType: 'value_threshold' as 'percent_occupancy' | 'value_threshold' | 'surge_trend',
    thresholdPct: '',
    operator: '>',
    valueNumber: '',
    windowMinutes: '15',
  });

  useEffect(() => {
    api.getAlerts().then(setAlerts).catch(console.error);
  }, []);
  useEffect(() => {
    api.getCensusMetrics().then(setCensus).catch(console.error);
  }, []);
  useEffect(() => {
    api.getFacilitiesList().then(setFacilities).catch(console.error);
  }, []);
  useEffect(() => {
    api.getMetricTypes().then(setMetricTypes).catch(console.error);
  }, []);
  useEffect(() => {
    api.getAlertRules().then(setAlertRules).catch(console.error);
  }, []);

  const canUsePercentOccupancy = supportsOccupancy(form.metric);

  const loadRules = () => api.getAlertRules().then(setAlertRules).catch(console.error);

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
      setShowCreateForm(false);
      setForm({ facilityId: '', metric: '', conditionType: 'value_threshold', thresholdPct: '', operator: '>', valueNumber: '', windowMinutes: '15' });
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRule = async (id: number) => {
    try {
      await api.deleteAlertRule(id);
      loadRules();
    } catch (e) {
      console.error(e);
    }
  };

  const capacityThresholdsBox = (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #edf0f5', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)', minWidth: 260, alignSelf: 'stretch' }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: BRAND_BLUE, marginBottom: 12 }}>Capacity thresholds</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {census != null && (
          <>
            <div style={{ background: Number(census.occupancyRate) >= GENERAL_CAPACITY_THRESHOLD_PCT ? '#fdf0ec' : '#f8fafc', border: `1px solid ${Number(census.occupancyRate) >= GENERAL_CAPACITY_THRESHOLD_PCT ? 'rgba(231,89,37,0.3)' : '#edf0f5'}`, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: BRAND_BLUE }}>System capacity</div>
                  <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>{census.totalCensus} / {census.totalCapacity} beds · {Number(census.occupancyRate).toFixed(1)}%</div>
                </div>
                {Number(census.occupancyRate) >= GENERAL_CAPACITY_THRESHOLD_PCT ? (
                  <span style={{ fontSize: 10, fontWeight: 700, background: BRAND_ORANGE, color: '#fff', borderRadius: 4, padding: '2px 8px' }}>Above {GENERAL_CAPACITY_THRESHOLD_PCT}%</span>
                ) : (
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#16a34a' }}>Below {GENERAL_CAPACITY_THRESHOLD_PCT}%</span>
                )}
              </div>
            </div>
            {census.icuTotal != null && (
              <div style={{ background: census.icuTotal >= ICU_BEDS_THRESHOLD ? '#fdf0ec' : '#f8fafc', border: `1px solid ${census.icuTotal >= ICU_BEDS_THRESHOLD ? 'rgba(231,89,37,0.3)' : '#edf0f5'}`, borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: BRAND_BLUE }}>ICU capacity</div>
                    <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>{census.icuTotal} ICU beds in use</div>
                  </div>
                  {census.icuTotal >= ICU_BEDS_THRESHOLD ? (
                    <span style={{ fontSize: 10, fontWeight: 700, background: BRAND_ORANGE, color: '#fff', borderRadius: 4, padding: '2px 8px' }}>Above {ICU_BEDS_THRESHOLD} beds</span>
                  ) : (
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#16a34a' }}>Below {ICU_BEDS_THRESHOLD} beds</span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
        {census == null && (
          <div style={{ fontSize: 12, color: '#94a3b8' }}>Loading capacity…</div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%' }}>
      {/* Top: Active alerts - own box full width */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #edf0f5', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: BRAND_BLUE }}>Active alerts</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{alerts.length} notification{alerts.length !== 1 ? 's' : ''}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={{ fontSize: 11.5, fontWeight: 600, color: BRAND_BLUE, background: '#e8eef8', border: '1px solid rgba(9,34,64,0.15)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>Set Alerts ▾</button>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#94a3b8', lineHeight: 1 }}>···</button>
          </div>
        </div>
        {alerts.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: '12px 0' }}>No active alerts</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alerts.map((a) => {
              const s = alertStyle(a.severity);
              return (
                <div key={a.id} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ width: 28, height: 28, background: s.iconBg, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>{s.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: BRAND_BLUE }}>{a.hospital}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, background: s.badgeBg, color: s.badgeColor, borderRadius: 4, padding: '2px 6px' }}>{a.severity}</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: s.textColor }}>{a.message}</div>
                      <div style={{ fontSize: 10.5, color: s.timeColor, marginTop: 5, fontWeight: 500 }}>{new Date(a.triggered_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom row: Create alert box | Capacity thresholds */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap', width: '100%' }}>
        {/* Left: Create alert & your rules */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #edf0f5', padding: '20px', display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)', flex: '1 1 380px', minWidth: 0, maxWidth: 440 }}>

      {/* Your custom alert rules */}
      {alertRules.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: BRAND_BLUE, marginBottom: 8 }}>Your alert rules</div>
          {alertRules.map((r) => (
            <div key={r.id} style={{ background: '#f8fafc', border: '1px solid #edf0f5', borderRadius: 8, padding: '10px 12px', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: BRAND_BLUE }}>{r.facility_name} · {describeRule(r)}</div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>Created {new Date(r.created_at).toLocaleDateString()}</div>
              </div>
              <button type="button" onClick={() => handleDeleteRule(r.id)} style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 12, padding: '2px 6px' }} aria-label="Delete rule">Delete</button>
            </div>
          ))}
        </div>
      )}

      {/* Create Alert — toggle form */}
      {!showCreateForm ? (
        <button type="button" onClick={() => setShowCreateForm(true)} style={{
          width: '100%', padding: '9px 0',
          background: BRAND_ORANGE,
          color: '#fff', fontWeight: 700, fontSize: 13,
          border: 'none', borderRadius: 8, cursor: 'pointer',
          boxShadow: `0 2px 10px rgba(231,89,37,0.35)`,
          letterSpacing: 0.2,
        }}>
          + Create Alert
        </button>
      ) : (
        <div style={{ background: '#f8fafc', border: '1px solid #edf0f5', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: BRAND_BLUE, marginBottom: 10 }}>New alert rule</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: BRAND_BLUE, marginBottom: 4 }}>Facility</label>
              <select value={form.facilityId} onChange={(e) => setForm((f) => ({ ...f, facilityId: e.target.value }))} style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }}>
                <option value="">Select facility</option>
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: BRAND_BLUE, marginBottom: 4 }}>Metric</label>
              <select value={form.metric} onChange={(e) => {
                const metric = e.target.value;
                setForm((f) => ({ ...f, metric, conditionType: (supportsOccupancy(metric) ? f.conditionType : 'value_threshold') as typeof f.conditionType }));
              }} style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }}>
                <option value="">Select metric</option>
                {metricTypes.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: BRAND_BLUE, marginBottom: 4 }}>Alert when</label>
              <select value={form.conditionType} onChange={(e) => setForm((f) => ({ ...f, conditionType: e.target.value as typeof form.conditionType }))} style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }}>
                {CONDITION_TYPES.filter((c) => c.value !== 'percent_occupancy' || canUsePercentOccupancy).map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            {form.conditionType === 'percent_occupancy' && (
              <div>
                <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: BRAND_BLUE, marginBottom: 4 }}>Occupancy above (%)</label>
                <input type="number" min={1} max={100} value={form.thresholdPct} onChange={(e) => setForm((f) => ({ ...f, thresholdPct: e.target.value }))} placeholder="e.g. 90" style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }} />
              </div>
            )}
            {form.conditionType === 'value_threshold' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: BRAND_BLUE, marginBottom: 4 }}>Operator</label>
                  <select value={form.operator} onChange={(e) => setForm((f) => ({ ...f, operator: e.target.value }))} style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }}>
                    {OPERATORS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: BRAND_BLUE, marginBottom: 4 }}>Value</label>
                  <input type="number" value={form.valueNumber} onChange={(e) => setForm((f) => ({ ...f, valueNumber: e.target.value }))} placeholder="e.g. 50" style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }} />
                </div>
              </div>
            )}
            {form.conditionType === 'surge_trend' && (
              <div>
                <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: BRAND_BLUE, marginBottom: 4 }}>Time window (minutes)</label>
                <input type="number" min={1} value={form.windowMinutes} onChange={(e) => setForm((f) => ({ ...f, windowMinutes: e.target.value }))} placeholder="e.g. 15 or 60" style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Alert when metric surges or trends over this period (e.g. 15 or 60 for 1 hour)</div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" onClick={() => setShowCreateForm(false)} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, color: BRAND_BLUE, background: '#e8eef8', border: '1px solid rgba(9,34,64,0.15)', borderRadius: 6, cursor: 'pointer' }}>Cancel</button>
            <button type="button" onClick={handleCreateAlert} disabled={submitting} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#fff', background: BRAND_ORANGE, border: 'none', borderRadius: 6, cursor: submitting ? 'not-allowed' : 'pointer' }}>{submitting ? 'Saving…' : 'Save rule'}</button>
          </div>
        </div>
      )}

      {/* Action rows */}
      {[
        { label: 'Alert Settings', icon: '⚙️' },
        { label: 'Export PDF', icon: '📄' },
        { label: 'Share Link', icon: '🔗' },
      ].map((a) => (
        <button key={a.label} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#f8fafc', border: '1px solid #edf0f5',
          borderRadius: 7, padding: '7px 12px',
          cursor: 'pointer', fontSize: 12, fontWeight: 500, color: BRAND_BLUE,
          width: '100%', textAlign: 'left' as const,
        }}>
          <span style={{ fontSize: 13 }}>{a.icon}</span>{a.label}
          <svg style={{ marginLeft: 'auto' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      ))}

      {/* ER Bus Surge Drill */}
      <div style={{ background: '#e8eef8', borderRadius: 10, padding: '12px 14px', border: `1px solid rgba(9,34,64,0.08)` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: BRAND_BLUE }}>ER Bus Surge Drill</div>
            <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 1 }}>Simulation · May 7, 2025</div>
          </div>
          <span style={{ fontSize: 10, background: BRAND_BLUE, color: '#fff', borderRadius: 4, padding: '2px 7px', fontWeight: 700 }}>DRILL</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 34 }}>
          {miniBarData.map((v, i) => (
            <div key={i} style={{
              flex: 1, height: `${(v / maxBar) * 100}%`,
              background: i >= miniBarData.length - 3 ? BRAND_ORANGE : `rgba(9,34,64,0.25)`,
              borderRadius: '2px 2px 0 0', minWidth: 0,
            }} />
          ))}
        </div>
      </div>

      </div>

        {/* Right: Capacity thresholds */}
        {capacityThresholdsBox}
      </div>
    </div>
  );
}
