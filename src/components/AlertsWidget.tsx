import { useState, useEffect } from 'react';
import { api } from '../api';
import type { Alert } from '../api';

const BLUE   = '#092240';
const ORANGE = '#E75925';

function severityColor(s: string) {
  return s === 'HIGH' ? '#dc2626' : s === 'MEDIUM' ? ORANGE : '#16a34a';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface AlertsWidgetProps {
  facilityId?: number | null;
}

export function AlertsWidget({ facilityId }: AlertsWidgetProps) {
  const [alerts,     setAlerts]     = useState<Alert[]>([]);
  const [dismissed,  setDismissed]  = useState<Set<number>>(new Set());
  const [muted,      setMuted]      = useState<Set<number>>(new Set());
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  const reload = () => {
    setLoading(true);
    setError(null);
    api.getAlerts()
      .then(data => {
        setAlerts(data);
        setError(null);
        if (data && data.length > 0) api.notifyAlerts(data).catch(() => {});
      })
      .catch(e => setError(e?.message ?? 'Failed to load alerts'))
      .finally(() => setLoading(false));
  };

  // Initial load
  useEffect(() => { reload(); }, []);

  // Re-fetch when user returns to this tab/page (e.g. after creating a rule on the Alerts tab)
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Poll every 30 s so new triggers appear automatically
  useEffect(() => {
    const id = setInterval(reload, 30_000);
    return () => clearInterval(id);
  }, []);

  // Filter to selected facility if one is chosen
  const facilityAlerts = facilityId
    ? alerts.filter(a => Number(a.hospital_id) === facilityId)
    : alerts;

  const visible = facilityAlerts.filter(a => !dismissed.has(a.id));

  const toggleMute = (id: number) =>
    setMuted(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const dismiss = (id: number) =>
    setDismissed(prev => new Set([...prev, id]));

  const dismissAll = () =>
    setDismissed(new Set(facilityAlerts.map(a => a.id)));

  return (
    <div style={{
      background: 'rgba(255,255,255,0.88)',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
      borderRadius: 12,
      border: '1px solid rgba(255,255,255,0.88)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '13px 16px 11px',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: BLUE }}>Active Alerts</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Refresh */}
          <button
            onClick={reload}
            style={{
              fontSize: 11, color: '#475569', background: 'none',
              border: '1px solid #e2e8f0', borderRadius: 5,
              padding: '3px 7px', cursor: 'pointer', lineHeight: 1.3,
            }}
          >↻</button>

          {/* Dismiss all */}
          {visible.length > 0 && (
            <button
              onClick={dismissAll}
              style={{
                fontSize: 10.5, color: '#475569', background: 'none',
                border: '1px solid #e2e8f0', borderRadius: 5,
                padding: '3px 7px', cursor: 'pointer',
              }}
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Scrollable alert list */}
      <div style={{ overflowY: 'auto', maxHeight: 260, flexShrink: 0 }}>
        {loading ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: '#4b5563' }}>
            Loading…
          </div>
        ) : error ? (
          <div style={{ padding: '20px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#dc2626' }}>Could not load alerts</div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 3 }}>{error}</div>
            <button onClick={reload} style={{ marginTop: 8, fontSize: 11, color: BLUE, background: 'none', border: '1px solid #e2e8f0', borderRadius: 5, padding: '3px 9px', cursor: 'pointer' }}>Retry</button>
          </div>
        ) : visible.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>All clear</div>
            <div style={{ fontSize: 11.5, color: '#4b5563', marginTop: 3 }}>No active alerts{facilityId ? ' for this facility' : ''}</div>
          </div>
        ) : (
          <div>
            {visible.map((a) => {
              const sc     = severityColor(a.severity);
              const isMuted = muted.has(a.id);
              return (
                <div
                  key={a.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '9px 14px 9px 12px',
                    borderBottom: '1px solid rgba(0,0,0,0.08)',
                    background: isMuted ? '#fafafa' : '#fff',
                    opacity: isMuted ? 0.6 : 1,
                    transition: 'opacity .15s, background .15s',
                  }}
                >
                  {/* Left accent bar */}
                  <div style={{
                    width: 3, height: 32, borderRadius: 2,
                    background: sc, flexShrink: 0, opacity: isMuted ? 0.4 : 1,
                  }} />

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{
                        fontSize: 11.5, fontWeight: 700, color: BLUE,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {a.hospital}
                      </span>
                      <span style={{
                        fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4,
                        background: sc + '18', color: sc, border: `1px solid ${sc}30`,
                        letterSpacing: 0.3, flexShrink: 0, textTransform: 'uppercase' as const,
                      }}>
                        {a.severity}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 11, color: '#374151',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {a.message}
                    </div>
                  </div>

                  {/* Time */}
                  <span style={{ fontSize: 10, color: '#475569', flexShrink: 0, minWidth: 44, textAlign: 'right' }}>
                    {timeAgo(a.triggered_at)}
                  </span>

                  {/* Per-alert mute toggle */}
                  <div
                    role="button"
                    title={isMuted ? 'Unmute' : 'Mute'}
                    onClick={() => toggleMute(a.id)}
                    style={{
                      flexShrink: 0, cursor: 'pointer',
                      position: 'relative', width: 26, height: 14, borderRadius: 7,
                      background: isMuted ? '#d1d5db' : BLUE,
                      transition: 'background .15s',
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: 2,
                      left: isMuted ? 2 : 12,
                      width: 10, height: 10, borderRadius: '50%',
                      background: '#fff', transition: 'left .15s',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                    }} />
                  </div>

                  {/* Dismiss */}
                  <button
                    type="button"
                    title="Dismiss"
                    onClick={() => dismiss(a.id)}
                    style={{
                      flexShrink: 0, background: 'none', border: 'none',
                      cursor: 'pointer', padding: '1px 2px', borderRadius: 3,
                      color: '#cbd5e1', fontSize: 16, lineHeight: 1,
                      fontWeight: 300,
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer — link to full alerts tab */}
      {visible.length > 0 && (
        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid #f1f5f9',
          fontSize: 11, color: '#475569',
          flexShrink: 0,
        }}>
          {dismissed.size > 0 && (
            <button
              onClick={() => setDismissed(new Set())}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#475569', padding: 0 }}
            >
              ↩ Restore {dismissed.size} dismissed
            </button>
          )}
        </div>
      )}
    </div>
  );
}
