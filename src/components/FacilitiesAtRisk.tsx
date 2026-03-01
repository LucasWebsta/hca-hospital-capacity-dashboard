import { useState, useEffect } from 'react';
import { api } from '../api';
import type { Facility } from '../api';
import { InfoTooltip } from './InfoTooltip';

// HCA Brand colors: Blue #092240 | Orange #E75925
const BRAND_BLUE = '#092240';
const BRAND_ORANGE = '#E75925';

function riskColor(occ: number) {
  if (occ >= 90) return '#dc2626';
  if (occ >= 85) return BRAND_ORANGE;
  return '#16a34a';
}
function riskBg(occ: number) {
  if (occ >= 90) return '#fef2f2';
  if (occ >= 85) return '#fdf0ec';
  return '#f0fdf4';
}

function OccupancyBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 64, height: 4, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12.5, fontWeight: 600, color, minWidth: 40 }}>{value}%</span>
    </div>
  );
}

export function FacilitiesAtRisk({ facilityId, tooltipsOn = true }: { facilityId?: number; tooltipsOn?: boolean }) {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getFacilities(facilityId)
      .then(setFacilities)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [facilityId]);

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #edf0f5', padding: '20px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: BRAND_BLUE }}>Top Facilities at Risk</span>
            {tooltipsOn && (
              <InfoTooltip text="Facilities with the highest occupancy rates. Green = normal, orange = elevated (≥85%), red = critical (≥90%). Use this to prioritize which sites need capacity or surge support." />
            )}
          </div>
          <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>Ranked by occupancy rate</div>
        </div>
        <button style={{
          fontSize: 12, fontWeight: 600, color: BRAND_BLUE,
          background: '#e8eef8', border: `1px solid rgba(9,34,64,0.15)`,
          borderRadius: 7, padding: '5px 12px', cursor: 'pointer',
        }}>
          Export CSV →
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
            <th style={{ textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: '#94a3b8', paddingBottom: 10, letterSpacing: 0.5 }}>HOSPITAL</th>
            <th style={{ textAlign: 'right', fontSize: 10.5, fontWeight: 700, color: '#94a3b8', paddingBottom: 10 }}>CENSUS</th>
            <th style={{ textAlign: 'right', fontSize: 10.5, fontWeight: 700, color: '#94a3b8', paddingBottom: 10, paddingRight: 8 }}>OCCUPANCY</th>
            <th style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 700, color: '#94a3b8', paddingBottom: 10 }}>TREND</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>Loading...</td></tr>
          ) : facilities.map((f) => {
            const occ = Number(f.occupancy);
            const color = riskColor(occ);
            const bg = riskBg(occ);
            const arrow = f.trend === 'up' ? '▲' : f.trend === 'down' ? '▼' : '–';
            return (
            <tr key={f.name} style={{ borderBottom: '1px solid #f8fafc' }}>
              <td style={{ padding: '11px 0', fontSize: 13, fontWeight: 500, color: '#1e293b', maxWidth: 160 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                </div>
              </td>
              <td style={{ padding: '11px 0', textAlign: 'right', fontSize: 13, fontWeight: 600, color: BRAND_BLUE }}>
                {f.census}
              </td>
              <td style={{ padding: '11px 0', textAlign: 'right', paddingRight: 8 }}>
                <OccupancyBar value={occ} color={color} />
              </td>
              <td style={{ padding: '11px 0', textAlign: 'center' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 24, height: 24, borderRadius: 6,
                  background: bg, fontSize: 11, fontWeight: 700, color,
                }}>{arrow}</span>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
