import { useState, useEffect, useMemo } from 'react';
import {
  Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ComposedChart, Line
} from 'recharts';
import { forecastMetric, validateModel } from '../utils/forecast';
import { loadFacilities, loadMetrics } from '../utils/loadData';
import type { Facility, MetricRow } from '../utils/loadData';
import { InfoTooltip } from './InfoTooltip';

// HCA Brand colors: Blue #092240 | Orange #E75925
const BRAND_BLUE = '#092240';
const BRAND_ORANGE = '#E75925';

const METRICS = ['Total Census', 'Admissions', 'Discharges', 'ICU Occupancy'] as const;
type MetricType = typeof METRICS[number];
type HorizonType = '24' | '168' | '720';
type GranularityType = 'hourly' | 'daily';

export function ForecastOccupancyChart({
  facilityId,
  tooltipsOn = true,
}: {
  facilityId?: number;
  tooltipsOn?: boolean;
}) {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('Total Census');
  const [horizon, setHorizon] = useState<HorizonType>('168');
  const [granularity, setGranularity] = useState<GranularityType>('daily');

  useEffect(() => {
    loadFacilities().then(setFacilities).catch(console.error);
  }, []);

  useEffect(() => {
    if (facilities.length === 0) return;
    setLoading(true);
    const fId = facilityId ?? facilities[0].facilityId;
    loadMetrics(fId)
      .then(m => { setMetrics(m); setLoading(false); })
      .catch(() => setLoading(false));
  }, [facilityId, facilities]);

  const activeFacilityId: number | null = facilityId ?? facilities[0]?.facilityId ?? null;

  const chartData = useMemo(() => {
    if (activeFacilityId === null || metrics.length === 0) return [];
    const now = new Date();
    const horizonH = parseInt(horizon);
    const forecastEnd = new Date(now.getTime() + horizonH * 3600 * 1000);
    const historicalStart = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

    const allData = forecastMetric(metrics, activeFacilityId, selectedMetric, horizonH);

    const filtered = allData.filter(p => {
      if (!p.isForecast) return p.timestamp >= historicalStart;
      return p.timestamp <= forecastEnd;
    });

    if (granularity === 'daily') {
      type Bucket = { values: number[]; uppers: number[]; lowers: number[]; isForecast: boolean };
      const buckets = new Map<string, Bucket>();
      filtered.forEach(p => {
        const d = new Date(p.timestamp);
        d.setHours(0, 0, 0, 0);
        const key = d.toISOString();
        if (!buckets.has(key)) buckets.set(key, { values: [], uppers: [], lowers: [], isForecast: p.isForecast });
        const b = buckets.get(key)!;
        b.values.push(p.value);
        b.uppers.push(p.upper);
        b.lowers.push(p.lower);
      });
      return Array.from(buckets.entries())
        .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
        .map(([key, b]) => ({
          d: new Date(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          val: Math.round(b.values.reduce((a, x) => a + x, 0) / b.values.length),
          upper: Math.round(b.uppers.reduce((a, x) => a + x, 0) / b.uppers.length),
          lower: Math.round(b.lowers.reduce((a, x) => a + x, 0) / b.lowers.length),
          isForecast: b.isForecast,
        }));
    }

    // Hourly: sample every 4th 15-min point
    return filtered
      .filter((_, i) => i % 4 === 0)
      .map(p => ({
        d: p.timestamp.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' }),
        val: p.value,
        upper: p.upper,
        lower: p.lower,
        isForecast: p.isForecast,
      }));
  }, [metrics, activeFacilityId, selectedMetric, horizon, granularity]);

  const validation = useMemo(() => {
    if (activeFacilityId === null || metrics.length === 0) return null;
    return validateModel(metrics, activeFacilityId, selectedMetric);
  }, [metrics, activeFacilityId, selectedMetric]);

  const accuracy = useMemo(() => {
    if (!validation || activeFacilityId === null) return null;
    const relevant = metrics.filter(r => r.orgId === activeFacilityId && r.metric === selectedMetric);
    if (relevant.length === 0) return null;
    const avg = relevant.reduce((a, r) => a + r.value, 0) / relevant.length;
    return avg === 0 ? null : Math.max(0, 100 - (validation.mae / avg) * 100);
  }, [validation, metrics, activeFacilityId, selectedMetric]);

  const allValues = chartData.flatMap(d => [d.val, d.upper, d.lower]).filter(v => v > 0);
  const minVal = allValues.length > 0 ? Math.max(0, Math.floor(Math.min(...allValues) * 0.95)) : 0;
  const maxVal = allValues.length > 0 ? Math.ceil(Math.max(...allValues) * 1.05) : 1000;

  const dividerDate = chartData.length > 0
    ? (() => {
        const idx = chartData.findIndex(d => d.isForecast);
        return idx > 0 ? chartData[idx - 1].d : null;
      })()
    : null;

  const metricUnit =
    selectedMetric === 'Total Census' || selectedMetric === 'ICU Occupancy' ? 'beds'
    : selectedMetric === 'Admissions' ? 'admissions'
    : 'discharges';

  return (
    <div style={{
      background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)', borderRadius: 12,
      border: '1px solid rgba(255,255,255,0.88)', padding: '20px 20px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
    }}>

      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: BRAND_BLUE }}>Forecast Occupancy</span>
          {tooltipsOn && (
            <InfoTooltip text="Trend-seasonal hybrid model using linear regression + intraday seasonality. Validated with 80/20 train/test split. Confidence interval shows range of likely outcomes." />
          )}
        </div>
        <div style={{ fontSize: 11, color: '#475569' }}>
          Trend-Seasonal · CI 95% · 80/20 split
        </div>
      </div>

      {/* Metric pills */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4, marginBottom: 10 }}>
        {METRICS.map(m => (
          <button
            key={m}
            onClick={() => setSelectedMetric(m)}
            style={{
              fontSize: 10.5, fontWeight: 600, padding: '4px 6px', borderRadius: 8,
              border: selectedMetric === m ? 'none' : '1px solid #e2e8f0',
              background: selectedMetric === m ? BRAND_BLUE : 'rgba(0,0,0,0.04)',
              color: selectedMetric === m ? '#fff' : '#475569',
              cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'center',
            }}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Horizon + Granularity toggles */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center' }}>
        <div style={{
          display: 'flex', gap: 2, background: 'rgba(0,0,0,0.06)', borderRadius: 7,
          padding: 3, border: '1px solid rgba(0,0,0,0.10)', flex: 1,
        }}>
          {([['24', '24h'], ['168', '7d'], ['720', '30d']] as [HorizonType, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setHorizon(val)}
              style={{
                flex: 1, fontSize: 10.5, fontWeight: 600, padding: '4px 4px', borderRadius: 5,
                border: 'none', cursor: 'pointer',
                background: horizon === val ? BRAND_BLUE : 'transparent',
                color: horizon === val ? '#fff' : '#475569',
                boxShadow: horizon === val ? '0 1px 4px rgba(9,34,64,0.25)' : 'none',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{
          display: 'flex', gap: 2, background: 'rgba(0,0,0,0.06)', borderRadius: 7,
          padding: 3, border: '1px solid rgba(0,0,0,0.10)',
        }}>
          {([['daily', 'Day'], ['hourly', 'Hr']] as [GranularityType, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setGranularity(val)}
              style={{
                fontSize: 10.5, fontWeight: 600, padding: '4px 9px', borderRadius: 5,
                border: 'none', cursor: 'pointer',
                background: granularity === val ? BRAND_ORANGE : 'transparent',
                color: granularity === val ? '#fff' : '#475569',
                boxShadow: granularity === val ? '0 1px 4px rgba(231,89,37,0.3)' : 'none',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Accuracy + stats */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 30, fontWeight: 800, color: BRAND_BLUE, letterSpacing: -1 }}>
            {loading || accuracy === null ? '—' : `${accuracy.toFixed(1)}%`}
          </span>
          {tooltipsOn && (
            <InfoTooltip text="Model accuracy: 100 minus mean absolute percentage error. Calculated on withheld test data." />
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            ['MAE', validation ? validation.mae.toFixed(1) : '—', 'Mean Absolute Error. Lower is better.'],
            ['RMSE', validation ? validation.rmse.toFixed(1) : '—', 'Root Mean Squared Error. Penalises larger errors.'],
          ].map(([k, v, desc]) => (
            <div key={k} style={{
              background: '#e8eef8', borderRadius: 7, padding: '4px 9px',
              border: '1px solid rgba(9,34,64,0.1)', display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span style={{ fontSize: 9.5, fontWeight: 600, color: '#475569' }}>{k}</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: BRAND_BLUE }}>{v}</span>
              {tooltipsOn && <InfoTooltip text={desc} />}
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={{ minHeight: 140 }}>
        {loading && (
          <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 12 }}>
            Loading…
          </div>
        )}
        {!loading && chartData.length === 0 && (
          <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 12 }}>
            No data available
          </div>
        )}
        {!loading && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={140}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
              <defs>
                <linearGradient id="ciBandDash" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BRAND_BLUE} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={BRAND_BLUE} stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="d" tick={{ fontSize: 9.5, fill: '#475569' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis domain={[minVal, maxVal]} tick={{ fontSize: 9.5, fill: '#475569' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid rgba(0,0,0,0.10)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                formatter={(value: number | undefined, name: string | undefined) => {
                  const v = value ?? 0;
                  if (name === 'upper') return [String(v), 'CI Upper'];
                  if (name === 'lower') return [String(v), 'CI Lower'];
                  return [String(v), metricUnit.charAt(0).toUpperCase() + metricUnit.slice(1)];
                }}
              />
              {dividerDate && (
                <ReferenceLine x={dividerDate} stroke="#475569" strokeWidth={1.5} strokeDasharray="3 3"
                  label={{ value: 'Now', position: 'top', fill: '#374151', fontSize: 10 }} />
              )}
              <Area type="monotone" dataKey="upper" stroke="none" fill="url(#ciBandDash)" fillOpacity={1} legendType="none" dot={false} />
              <Area type="monotone" dataKey="lower" stroke="none" fill="white" fillOpacity={1} legendType="none" dot={false} />
              <Line type="monotone" dataKey="val" stroke={BRAND_BLUE} strokeWidth={2.5} dot={false} legendType="none" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Legend */}
      {!loading && chartData.length > 0 && (
        <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 10, color: '#374151', justifyContent: 'center', flexWrap: 'wrap' }}>
          {chartData.some(d => !d.isForecast) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 14, height: 2, background: '#475569', borderRadius: 1 }} />
              <span>Historical</span>
            </div>
          )}
          {chartData.some(d => d.isForecast) && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 14, height: 2, background: BRAND_BLUE, borderRadius: 1 }} />
                <span>Forecast</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 12, height: 10, background: 'rgba(9,34,64,0.18)', borderRadius: 2 }} />
                <span>95% CI</span>
              </div>
            </>
          )}
        </div>
      )}

      {validation && validation.trainSize > 0 && (
        <div style={{ marginTop: 10, fontSize: 9.5, color: '#64748b', textAlign: 'center' }}>
          Train: {validation.trainSize} pts · Test: {validation.testSize} pts · 80/20 split
        </div>
      )}
    </div>
  );
}
