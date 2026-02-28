// HCA Brand colors: Blue #092240 | Orange #E75925
const BRAND_BLUE = '#092240';
const BRAND_ORANGE = '#E75925';

const facilities = [
  { name: 'Central Regional',          census: 428, occupancy: 94.7, trend: '▲', color: '#dc2626', bg: '#fef2f2' },
  { name: 'HCA Westside',              census: 201, occupancy: 90.1, trend: '▲', color: BRAND_ORANGE, bg: '#fdf0ec' },
  { name: 'HCA Memorial Hospital East',census: 180, occupancy: 88.3, trend: '▲', color: BRAND_ORANGE, bg: '#fdf0ec' },
  { name: 'HCA Northside',             census: 139, occupancy: 81.2, trend: '▼', color: '#16a34a', bg: '#f0fdf4' },
  { name: 'HCA Southside',             census: 124, occupancy: 78.5, trend: '▼', color: '#16a34a', bg: '#f0fdf4' },
];

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

export function FacilitiesAtRisk() {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #edf0f5', padding: '20px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: BRAND_BLUE }}>Top Facilities at Risk</div>
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
          {facilities.map((f) => (
            <tr key={f.name} style={{ borderBottom: '1px solid #f8fafc' }}>
              <td style={{ padding: '11px 0', fontSize: 13, fontWeight: 500, color: '#1e293b', maxWidth: 160 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: f.color, flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                </div>
              </td>
              <td style={{ padding: '11px 0', textAlign: 'right', fontSize: 13, fontWeight: 600, color: BRAND_BLUE }}>
                {f.census}
              </td>
              <td style={{ padding: '11px 0', textAlign: 'right', paddingRight: 8 }}>
                <OccupancyBar value={f.occupancy} color={f.color} />
              </td>
              <td style={{ padding: '11px 0', textAlign: 'center' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 24, height: 24, borderRadius: 6,
                  background: f.bg, fontSize: 11, fontWeight: 700, color: f.color,
                }}>{f.trend}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
