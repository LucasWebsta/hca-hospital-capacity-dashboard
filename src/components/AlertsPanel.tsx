import { useState, useEffect } from 'react';
import { api } from '../api';
import type { Alert } from '../api';

// HCA Brand colors: Blue #092240 | Orange #E75925
const BRAND_BLUE = '#092240';
const BRAND_ORANGE = '#E75925';

const miniBarData = [3, 5, 4, 7, 9, 8, 6, 10, 12, 9, 11, 8];
const maxBar = Math.max(...miniBarData);

function alertStyle(severity: string) {
  if (severity === 'HIGH')   return { bg: '#fdf0ec', border: 'rgba(231,89,37,0.3)',  icon: '⚠️', iconBg: 'rgba(231,89,37,0.15)', textColor: '#7c2d12', timeColor: '#9a3412', badgeBg: BRAND_ORANGE,  badgeColor: '#fff'     };
  if (severity === 'MEDIUM') return { bg: '#fffbeb', border: 'rgba(234,179,8,0.3)', icon: '⚠️', iconBg: 'rgba(234,179,8,0.15)',  textColor: '#713f12', timeColor: '#854d0e', badgeBg: '#eab308',     badgeColor: '#fff'     };
  return                             { bg: '#f0fdf4', border: '#bbf7d0',             icon: '✅', iconBg: '#dcfce7',              textColor: '#166534', timeColor: '#15803d', badgeBg: '#bbf7d0',     badgeColor: '#15803d'  };
}

export function AlertsPanel() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  useEffect(() => {
    api.getAlerts().then(setAlerts).catch(console.error);
  }, []);
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #edf0f5', padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: BRAND_BLUE }}>Alerts</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{alerts.length} active notification{alerts.length !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={{
            fontSize: 11.5, fontWeight: 600, color: BRAND_BLUE,
            background: '#e8eef8', border: `1px solid rgba(9,34,64,0.15)`,
            borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            Set Alerts ▾
          </button>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#94a3b8', lineHeight: 1 }}>···</button>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: '8px 0' }}>No active alerts</div>
      ) : alerts.map((a) => {
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

      {/* Create Alert button — HCA Orange CTA */}
      <button style={{
        width: '100%', padding: '9px 0',
        background: BRAND_ORANGE,
        color: '#fff', fontWeight: 700, fontSize: 13,
        border: 'none', borderRadius: 8, cursor: 'pointer',
        boxShadow: `0 2px 10px rgba(231,89,37,0.35)`,
        letterSpacing: 0.2,
      }}>
        + Create Alert
      </button>

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
  );
}
