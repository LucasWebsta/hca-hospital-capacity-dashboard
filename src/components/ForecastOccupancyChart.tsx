import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../api';
import type { ForecastResponse } from '../api';

// HCA Brand colors: Blue #092240 | Orange #E75925
const BRAND_BLUE = '#092240';
const BRAND_ORANGE = '#E75925';

type Days = '7' | '14' | '30' | '60';

export function ForecastOccupancyChart() {
  const [days, setDays] = useState<Days>('7');
  const [chartData, setChartData] = useState<{ d: string; val: number; lo: number; hi: number }[]>([]);
  const [stats, setStats] = useState({ mae: 5.8, rmse: 8.2, accuracy: 92.1, upliftPct: 2.6 });

  useEffect(() => {
    api.getForecast(parseInt(days, 10))
      .then((res: ForecastResponse) => {
        setChartData(res.data.map((item: Record<string, unknown>) => ({
          d:   item.date      as string,
          val: item.predicted as number,
          lo:  (item.lower  ?? (item.predicted as number) - 30) as number,
          hi:  (item.upper  ?? (item.predicted as number) + 30) as number,
        })));
        setStats(res.stats);
      })
      .catch(console.error);
  }, [days]);

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #edf0f5', padding: '20px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: BRAND_BLUE }}>Forecast Occupancy</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>Predictive model · CI 95%</div>
        </div>
        <div style={{ display: 'flex', gap: 3, background: '#f8fafc', borderRadius: 7, padding: 3, border: '1px solid #edf0f5' }}>
          {(['7', '14', '30', '60'] as Days[]).map(d => (
            <button key={d} onClick={() => setDays(d)} style={{
              fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 5,
              border: 'none', cursor: 'pointer',
              background: days === d ? BRAND_BLUE : 'transparent',
              color: days === d ? '#fff' : '#94a3b8',
              boxShadow: days === d ? `0 1px 4px rgba(9,34,64,0.25)` : 'none',
            }}>{d}D</button>
          ))}
        </div>
      </div>

      {/* MAE / RMSE chips */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        {[['MAE', stats.mae.toFixed(1)], ['RMSE', stats.rmse.toFixed(1)]].map(([k, v]) => (
          <div key={k} style={{ background: '#e8eef8', borderRadius: 7, padding: '5px 10px', border: `1px solid rgba(9,34,64,0.1)` }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', marginRight: 4 }}>{k}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: BRAND_BLUE }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Big number */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 32, fontWeight: 800, color: BRAND_BLUE, letterSpacing: -1 }}>{stats.accuracy}%</span>
        <span style={{ fontSize: 12.5, color: BRAND_ORANGE, fontWeight: 700, background: '#fdf0ec', padding: '3px 7px', borderRadius: 5 }}>±{stats.upliftPct}% ↑</span>
        <span style={{ fontSize: 11.5, color: '#94a3b8', marginLeft: 2 }}>May 7</span>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={110}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
          <defs>
            <linearGradient id="confBandBrand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BRAND_BLUE} stopOpacity={0.12} />
              <stop offset="100%" stopColor={BRAND_BLUE} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="d" tick={{ fontSize: 9.5, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis domain={[885, 1010]} tick={{ fontSize: 9.5, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #edf0f5', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
          <Area type="monotone" dataKey="hi" stroke="none" fill="url(#confBandBrand)" fillOpacity={1} />
          <Area type="monotone" dataKey="lo" stroke="none" fill="#fff" fillOpacity={1} />
          <Area type="monotone" dataKey="val" stroke={BRAND_BLUE} strokeWidth={2} fill="none" dot={false} />
        </AreaChart>
      </ResponsiveContainer>

      {/* Uplift slider */}
      <div style={{ marginTop: 14, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>Expected seasonal uplift</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: BRAND_ORANGE }}>15%</span>
        </div>
        <div style={{ width: '100%', height: 4, background: '#e2e8f0', borderRadius: 4 }}>
          <div style={{ height: '100%', width: '15%', background: BRAND_ORANGE, borderRadius: 4 }} />
        </div>
      </div>

      {/* Badges */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginTop: 10 }}>
        <span style={{ fontSize: 11, background: '#fdf0ec', color: BRAND_ORANGE, borderRadius: 5, padding: '3px 9px', fontWeight: 600, border: `1px solid rgba(231,89,37,0.2)` }}>
          15% seasonal uplift
        </span>
        <span style={{ fontSize: 11, background: '#f0fdf4', color: '#16a34a', borderRadius: 5, padding: '3px 9px', fontWeight: 600, border: '1px solid #bbf7d0' }}>
          +0 Beds capacity
        </span>
      </div>
    </div>
  );
}
