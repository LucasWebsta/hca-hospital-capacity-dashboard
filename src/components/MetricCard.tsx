import { AlertTriangle, TrendingUp } from 'lucide-react';

// HCA Brand colors: Blue #092240 | Orange #E75925
const BRAND_BLUE = '#092240';
const BRAND_ORANGE = '#E75925';

interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  change?: string;
  subtext?: string;
  type?: 'normal' | 'alert';
  progressBar?: string;
  accentColor?: string;
  /** Optional explanation shown when expanded (e.g. by a parent-controlled arrow) */
  tooltip?: string;
  /** When true and tooltip is set, show the explanation block below the card content */
  expanded?: boolean;
}

export function MetricCard({
  title, value, unit, change, subtext,
  type = 'normal', progressBar,
  accentColor = BRAND_BLUE,
  tooltip,
  expanded = false,
}: MetricCardProps) {
  const isAlert = type === 'alert';

  // Derive a light tint from the accent for badge bg
  const isOrange = accentColor === BRAND_ORANGE;
  const badgeBg = isOrange ? '#fdf0ec' : '#e8eef8';
  const badgeColor = accentColor;

  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      padding: '16px 18px 18px',
      border: '1px solid #edf0f5',
      flex: 1,
      boxShadow: '0 1px 4px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Top accent bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: isAlert
          ? BRAND_ORANGE
          : accentColor,
        borderRadius: '12px 12px 0 0',
      }} />

      <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 10, letterSpacing: 0.5, textTransform: 'uppercase' as const }}>
        {title}
      </div>

      {isAlert ? (
        <div>
          {(() => {
            const riskVal = String(value);
            const isHigh = riskVal === 'High';
            const isNormal = riskVal === 'Normal';
            const riskColor = isHigh ? '#dc2626' : isNormal ? '#16a34a' : BRAND_ORANGE;
            const riskIconBg = isHigh ? '#fde8e8' : isNormal ? '#f0fdf4' : '#fdf0ec';
            const riskTextColor = isHigh ? '#991b1b' : isNormal ? '#15803d' : '#c04a1a';
            const barWidth = progressBar ?? '65%';
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: riskIconBg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <AlertTriangle size={16} color={riskColor} />
                  </div>
                  <span style={{ fontSize: 22, fontWeight: 700, color: riskTextColor }}>{riskVal}</span>
                </div>
                <div style={{ width: '100%', height: 4, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: barWidth,
                    maxWidth: '100%',
                    background: riskColor,
                    borderRadius: 4,
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: '#9ca3af' }}>Low</span>
                  <span style={{ fontSize: 10, color: riskColor, fontWeight: 600 }}>{barWidth}</span>
                  <span style={{ fontSize: 10, color: '#9ca3af' }}>Critical</span>
                </div>
              </>
            );
          })()}
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' as const }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: BRAND_BLUE, lineHeight: 1, letterSpacing: -0.5 }}>{value}</span>
            {unit && <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>/{unit}</span>}
          </div>

          {change && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                background: badgeBg, borderRadius: 5,
                padding: '3px 7px', fontSize: 11.5, fontWeight: 600, color: badgeColor,
              }}>
                <TrendingUp size={11} strokeWidth={2.5} />
                {change}
              </div>
            </div>
          )}

          {progressBar && (
            <div style={{ width: '100%', height: 4, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden', marginTop: 10 }}>
              <div style={{
                height: '100%', width: progressBar,
                background: accentColor,
                borderRadius: 3,
              }} />
            </div>
          )}

          {subtext && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: progressBar ? 5 : 8, fontWeight: 500 }}>{subtext}</div>
          )}
        </div>
      )}

      {tooltip && expanded && (
        <div style={{
          marginTop: 8,
          fontSize: 11.5,
          lineHeight: 1.4,
          color: '#64748b',
          fontWeight: 500,
        }}>
          {tooltip}
        </div>
      )}
    </div>
  );
}
