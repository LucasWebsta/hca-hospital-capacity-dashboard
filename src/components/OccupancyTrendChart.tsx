import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../api';
import type { TrendPoint } from '../api';

// HCA Brand colors: Blue #092240 | Orange #E75925
const BRAND_BLUE = '#092240';
const BRAND_ORANGE = '#E75925';

type Series = 'Overall' | 'ICU' | 'Emergency';

interface OccupancyTrendChartProps {
  days?: number;
  facilityId?: number;
}

export function OccupancyTrendChart({ days = 30, facilityId }: OccupancyTrendChartProps) {
  const [activeSeries, setActiveSeries] = useState<Series>('Overall');
  const [data, setData] = useState<TrendPoint[]>([]);

  useEffect(() => {
    api.getTrend(days, facilityId).then(setData).catch(console.error);
  }, [days, facilityId]);

  const firstActual = data.find(d => d.actual != null);
  const lastActual = [...data].reverse().find(d => d.actual != null);

  const subtitle = firstActual && lastActual && firstActual !== lastActual
    ? `${firstActual.date} – ${lastActual.date} · Actual Census`
    : 'Actual Census';

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #edf0f5', padding: '20px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)' }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: BRAND_BLUE }}>Occupancy Trend</div>
          <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>{subtitle}</div>
        </div>

        <div style={{ display: 'flex', gap: 4, background: '#f8fafc', borderRadius: 8, padding: 3, border: '1px solid #edf0f5' }}>
          {(['Overall', 'ICU', 'Emergency'] as Series[]).map(s => (
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
          <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>Actual Census</span>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: BRAND_BLUE }}>{lastActual?.actual?.toLocaleString() ?? '—'}</span>
          <span style={{ fontSize: 10.5, color: '#94a3b8', marginLeft: 4 }}>current census</span>
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
      </ResponsiveContainer>
    </div>
  );
}
