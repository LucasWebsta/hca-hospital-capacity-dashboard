import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../api';
import type { TrendPoint } from '../api';
import { InfoTooltip } from './InfoTooltip';

// HCA Brand colors: Blue #092240 | Orange #E75925
const BRAND_BLUE = '#092240';
const BRAND_ORANGE = '#E75925';

type Series = 'Overall' | 'ICU';

interface OccupancyTrendChartProps {
  days?: number;
  facilityId?: number;
  /** When false, the "?" hover tooltip is hidden */
  tooltipsOn?: boolean;
}

export function OccupancyTrendChart({ days = 30, facilityId, tooltipsOn = true }: OccupancyTrendChartProps) {
  const [activeSeries, setActiveSeries] = useState<Series>('Overall');
  const [data, setData] = useState<TrendPoint[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const seriesParam = activeSeries === 'ICU' ? 'icu' : 'overall';
  useEffect(() => {
    setLoadError(null);
    api.getTrend(days, facilityId, seriesParam).then(setData).catch((err) => {
      console.error(err);
      setLoadError(err?.message ?? 'Failed to load trend');
      setData([]);
    });
  }, [days, facilityId, seriesParam]);

  const firstActual = data.find(d => d.actual != null);
  const lastActual = [...data].reverse().find(d => d.actual != null);

  const subtitle = activeSeries === 'Overall'
    ? (firstActual && lastActual && firstActual !== lastActual ? `${firstActual.date} – ${lastActual.date} · Overall capacity` : 'Overall capacity %')
    : (firstActual && lastActual && firstActual !== lastActual ? `${firstActual.date} – ${lastActual.date} · ICU` : 'ICU');
  const valueLabel = activeSeries === 'Overall' ? 'current census' : 'ICU beds in use';

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #edf0f5', padding: '20px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)' }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: BRAND_BLUE }}>Occupancy Trend</span>
            {tooltipsOn && (
              <InfoTooltip text="Historical census over time. Switch between Overall (total beds) and ICU to see capacity trends. One snapshot per day per facility is used to avoid double-counting." />
            )}
          </div>
          <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>{subtitle}</div>
        </div>

        <div style={{ display: 'flex', gap: 4, background: '#f8fafc', borderRadius: 8, padding: 3, border: '1px solid #edf0f5' }}>
          {(['Overall', 'ICU'] as Series[]).map(s => (
            <button key={s} onClick={() => setActiveSeries(s)} style={{
              fontSize: 11.5, fontWeight: 600, padding: '4px 12px', borderRadius: 6,
              border: 'none', cursor: 'pointer',
              background: activeSeries === s ? BRAND_BLUE : 'transparent',
              color: activeSeries === s ? '#fff' : '#94a3b8',
              boxShadow: activeSeries === s ? '0 1px 4px rgba(9,34,64,0.2)' : 'none',
            }}>{s}</button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 20, height: 2.5, background: BRAND_BLUE, borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>
            {activeSeries === 'Overall' ? 'Actual Census' : 'ICU in use'}
          </span>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: BRAND_BLUE }}>{lastActual?.actual?.toLocaleString() ?? '—'}</span>
          <span style={{ fontSize: 10.5, color: '#94a3b8', marginLeft: 4 }}>{valueLabel}</span>
          {lastActual?.occupancy_pct != null && (
            <>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: BRAND_ORANGE, marginLeft: 8 }}>
                {lastActual.occupancy_pct}%
              </span>
              <span style={{ fontSize: 10.5, color: '#94a3b8', marginLeft: 4 }}>occupancy</span>
            </>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={175}>
        {loadError ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 12 }}>
            {loadError}
          </div>
        ) : data.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 12 }}>
            No {activeSeries === 'ICU' ? 'ICU' : 'overall'} data for this period
          </div>
        ) : (
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
            <defs>
              <linearGradient id="brandBlueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={BRAND_BLUE} stopOpacity={0.15} />
                <stop offset="95%" stopColor={BRAND_BLUE} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="brandOrangeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={BRAND_ORANGE} stopOpacity={0.12} />
                <stop offset="95%" stopColor={BRAND_ORANGE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v} />
            <Tooltip
              contentStyle={{ fontSize: 11.5, borderRadius: 8, border: '1px solid #edf0f5', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              itemStyle={{ color: '#374151' }}
              labelStyle={{ fontWeight: 600, color: BRAND_BLUE }}
            />
            <Area type="monotone" dataKey="actual" stroke={BRAND_BLUE} strokeWidth={2} fill="url(#brandBlueGrad)" dot={false} connectNulls={false} />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
