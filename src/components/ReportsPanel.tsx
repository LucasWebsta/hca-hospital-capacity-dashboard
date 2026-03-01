import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link2, Camera, Download, Check } from 'lucide-react';
import { api } from '../api';
import { MetricCard } from './MetricCard';
import { OccupancyTrendChart } from './OccupancyTrendChart';
import { ForecastOccupancyChart } from './ForecastOccupancyChart';
import { FacilitiesAtRisk } from './FacilitiesAtRisk';
import type {
  ReportConfig,
  ReportSnapshotData,
  CensusMetrics,
  TrendPoint,
  ForecastResponse,
  Facility,
  Alert,
} from '../api';

const BRAND_BLUE = '#092240';
const BRAND_ORANGE = '#E75925';

const SECTION_OPTIONS: { id: ReportConfig['sections'][number]; label: string }[] = [
  { id: 'overview', label: 'Overview metrics' },
  { id: 'trend', label: 'Occupancy trend' },
  { id: 'forecast', label: 'Forecast' },
  { id: 'facilities', label: 'Facilities at risk' },
  { id: 'alerts', label: 'Alerts summary' },
];

const TREND_DAYS_OPTIONS = [7, 14, 30];

function formatSnapshotDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { dateStyle: 'medium' }) + ' at ' + d.toLocaleTimeString(undefined, { timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function ReportsPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const snapshotId = searchParams.get('snapshot');
  const [facilitiesList, setFacilitiesList] = useState<{ id: number; name: string }[]>([]);
  const [config, setConfig] = useState<ReportConfig>({
    facilityId: null,
    facilityName: 'All Facilities',
    trendDays: 30,
    sections: ['overview', 'trend', 'forecast', 'facilities', 'alerts'],
  });
  const [snapshot, setSnapshot] = useState<{ config: ReportConfig; data: ReportSnapshotData; created_at: string } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [snapshotCopied, setSnapshotCopied] = useState(false);
  const [snapshotSaving, setSnapshotSaving] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  // Load facilities for dropdown
  useEffect(() => {
    api.getFacilitiesList().then(setFacilitiesList).catch(console.error);
  }, []);

  // Load snapshot from URL or apply URL params to config
  useEffect(() => {
    if (snapshotId) {
      api.getReportSnapshot(snapshotId)
        .then((s) => {
          setSnapshot({ config: s.config, data: s.data, created_at: s.created_at });
          setConfig(s.config);
        })
        .catch(() => setSnapshot(null));
    } else {
      setSnapshot(null);
      const facilityId = searchParams.get('facility');
      const days = searchParams.get('days');
      const sections = searchParams.get('sections');
      if (facilityId || days || sections) {
        setConfig((c) => ({
          ...c,
          facilityId: facilityId ? parseInt(facilityId, 10) : null,
          facilityName: facilityId && facilitiesList.length
            ? (facilitiesList.find((f) => String(f.id) === facilityId)?.name ?? 'All Facilities')
            : c.facilityName,
          trendDays: days ? parseInt(days, 10) : c.trendDays,
          sections: sections
            ? (sections.split(',').filter((x): x is ReportConfig['sections'][number] =>
                ['overview', 'trend', 'forecast', 'facilities', 'alerts'].includes(x)) as ReportConfig['sections'][number][])
            : c.sections,
        }));
      }
    }
  }, [snapshotId, searchParams, facilitiesList.length]);

  const updateUrl = useCallback((next: ReportConfig) => {
    const params = new URLSearchParams();
    if (next.facilityId != null) params.set('facility', String(next.facilityId));
    params.set('days', String(next.trendDays));
    params.set('sections', next.sections.join(','));
    setSearchParams(params, { replace: true });
  }, [setSearchParams]);

  const handleConfigChange = (updates: Partial<ReportConfig>) => {
    const next = { ...config, ...updates };
    setConfig(next);
    if (!snapshotId) updateUrl(next);
  };

  const buildShareUrl = useCallback(() => {
    const base = window.location.origin + window.location.pathname;
    const params = new URLSearchParams();
    if (config.facilityId != null) params.set('facility', String(config.facilityId));
    params.set('days', String(config.trendDays));
    params.set('sections', config.sections.join(','));
    return params.toString() ? `${base}?${params.toString()}` : base;
  }, [config]);

  const copyShareLink = () => {
    navigator.clipboard.writeText(buildShareUrl()).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  const exportPdf = () => {
    window.print();
  };

  const createSnapshot = async () => {
    setSnapshotSaving(true);
    setSnapshotError(null);
    try {
      const [census, trend, forecast, facilities, alerts] = await Promise.all([
        api.getCensusMetrics(config.facilityId ?? undefined),
        api.getTrend(config.trendDays, config.facilityId ?? undefined),
        api.getForecast(7, config.facilityId ?? undefined),
        api.getFacilities(config.facilityId ?? undefined),
        api.getAlerts(),
      ]);
      const data: ReportSnapshotData = {
        census,
        trend,
        forecast,
        facilities,
        alerts,
        capturedAt: new Date().toISOString(),
      };
      const { id } = await api.createReportSnapshot({ config, data });
      const url = `${window.location.origin}${window.location.pathname}?snapshot=${id}`;
      await navigator.clipboard.writeText(url);
      setSnapshotCopied(true);
      setTimeout(() => setSnapshotCopied(false), 3000);
      setSearchParams({ snapshot: id }, { replace: true });
    } catch (e) {
      setSnapshotError(e instanceof Error ? e.message : 'Failed to create snapshot');
    } finally {
      setSnapshotSaving(false);
    }
  };

  const isSnapshotView = Boolean(snapshotId && snapshot);
  const data = snapshot?.data ?? null;

  return (
    <div className="reports-page" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: -0.3 }}>Reports</div>
        <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 3, fontWeight: 500 }}>
          Configure your report, then export as PDF, share a link, or save a snapshot.
        </div>
      </div>

      {isSnapshotView && snapshot && (
        <div style={{
          background: '#e8eef8',
          border: `1px solid ${BRAND_BLUE}`,
          borderRadius: 10,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 13, color: BRAND_BLUE, fontWeight: 600 }}>
            Viewing snapshot from {formatSnapshotDate(snapshot.created_at)}
          </span>
          <button
            type="button"
            onClick={() => { setSearchParams({}); setSnapshot(null); }}
            style={{
              fontSize: 12, fontWeight: 600, color: BRAND_BLUE,
              background: 'transparent', border: `1px solid ${BRAND_BLUE}`,
              borderRadius: 6, padding: '6px 12px', cursor: 'pointer',
            }}
          >
            Back to live report
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 20, flex: 1, minHeight: 0 }}>
        {/* Config sidebar */}
        <div style={{
          width: 260, flexShrink: 0,
          background: '#fff', borderRadius: 12, border: '1px solid #edf0f5',
          padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          height: 'fit-content',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: BRAND_BLUE, marginBottom: 12 }}>Report configuration</div>

          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Facility</label>
          <select
            value={config.facilityId ?? ''}
            onChange={(e) => {
              const id = e.target.value ? parseInt(e.target.value, 10) : null;
              const name = id ? facilitiesList.find((f) => f.id === id)?.name ?? 'All Facilities' : 'All Facilities';
              handleConfigChange({ facilityId: id, facilityName: name });
            }}
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
              fontSize: 12, marginBottom: 12, background: '#fff',
            }}
          >
            <option value="">All Facilities</option>
            {facilitiesList.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>

          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Trend period</label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {TREND_DAYS_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handleConfigChange({ trendDays: d })}
                style={{
                  flex: 1, padding: '6px 8px', borderRadius: 6, border: `1px solid ${config.trendDays === d ? BRAND_BLUE : '#e2e8f0'}`,
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  background: config.trendDays === d ? BRAND_BLUE : '#fff',
                  color: config.trendDays === d ? '#fff' : '#64748b',
                }}
              >
                {d}d
              </button>
            ))}
          </div>

          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>Sections to include</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {SECTION_OPTIONS.map(({ id, label }) => (
              <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={config.sections.includes(id)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...config.sections, id]
                      : config.sections.filter((s) => s !== id);
                    handleConfigChange({ sections: next });
                  }}
                />
                {label}
              </label>
            ))}
          </div>

          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
            <button
              type="button"
              onClick={exportPdf}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: BRAND_BLUE, color: '#fff', fontSize: 12, fontWeight: 600,
                marginBottom: 8,
              }}
            >
              <Download size={16} /> Export as PDF
            </button>
            <button
              type="button"
              onClick={copyShareLink}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '10px 12px', borderRadius: 8, border: `1px solid ${BRAND_BLUE}`,
                cursor: 'pointer', background: '#fff', color: BRAND_BLUE, fontSize: 12, fontWeight: 600,
                marginBottom: 8,
              }}
            >
              {linkCopied ? <Check size={16} /> : <Link2 size={16} />}
              {linkCopied ? 'Link copied!' : 'Copy shareable link'}
            </button>
            <button
              type="button"
              onClick={createSnapshot}
              disabled={snapshotSaving}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '10px 12px', borderRadius: 8, border: `1px solid ${BRAND_ORANGE}`,
                cursor: snapshotSaving ? 'not-allowed' : 'pointer',
                background: '#fff', color: BRAND_ORANGE, fontSize: 12, fontWeight: 600,
              }}
            >
              {snapshotCopied ? <Check size={16} /> : <Camera size={16} />}
              {snapshotCopied ? 'Snapshot link copied!' : snapshotSaving ? 'Saving…' : 'Create snapshot'}
            </button>
            {snapshotError && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#dc2626' }}>{snapshotError}</div>
            )}
          </div>
        </div>

        {/* Report preview */}
        <div
          ref={reportRef}
          id="report-content"
          style={{
            flex: 1, overflowY: 'auto', background: '#fff', borderRadius: 12,
            border: '1px solid #edf0f5', padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: BRAND_BLUE }}>Census Command Report</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              {config.facilityName} · {config.trendDays}-day trend
              {isSnapshotView && data?.capturedAt && (
                <> · Snapshot: {formatSnapshotDate(data.capturedAt)}</>
              )}
            </div>
          </div>

          {config.sections.includes('overview') && (
            <Section title="Overview">
              {isSnapshotView && data?.census ? (
                <OverviewBlock census={data.census} facilityName={config.facilityName} />
              ) : (
                <LiveOverview facilityId={config.facilityId} facilityName={config.facilityName} />
              )}
            </Section>
          )}

          {config.sections.includes('trend') && (
            <Section title="Occupancy trend">
              {isSnapshotView && data?.trend ? (
                <TrendBlock data={data.trend} />
              ) : (
                <OccupancyTrendChart days={config.trendDays} facilityId={config.facilityId ?? undefined} />
              )}
            </Section>
          )}

          {config.sections.includes('forecast') && (
            <Section title="Forecast">
              {isSnapshotView && data?.forecast ? (
                <ForecastBlock data={data.forecast} />
              ) : (
                <ForecastOccupancyChart facilityId={config.facilityId ?? undefined} />
              )}
            </Section>
          )}

          {config.sections.includes('facilities') && (
            <Section title="Facilities at risk">
              {isSnapshotView && data?.facilities ? (
                <FacilitiesBlock facilities={data.facilities} />
              ) : (
                <FacilitiesAtRisk facilityId={config.facilityId ?? undefined} />
              )}
            </Section>
          )}

          {config.sections.includes('alerts') && (
            <Section title="Alerts summary">
              {isSnapshotView && data?.alerts ? (
                <AlertsBlock alerts={data.alerts} />
              ) : (
                <LiveAlerts />
              )}
            </Section>
          )}

          {config.sections.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              Select at least one section in the configuration panel.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 10, letterSpacing: 0.5 }}>{title.toUpperCase()}</div>
      {children}
    </div>
  );
}

function LiveOverview({ facilityId, facilityName }: { facilityId: number | null; facilityName: string }) {
  const [census, setCensus] = useState<CensusMetrics | null>(null);
  useEffect(() => {
    api.getCensusMetrics(facilityId ?? undefined).then(setCensus).catch(console.error);
  }, [facilityId]);
  if (!census) return <div style={{ padding: 16, color: '#94a3b8' }}>Loading…</div>;
  return <OverviewBlock census={census} facilityName={facilityName} />;
}

function OverviewBlock({ census }: { census: CensusMetrics }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
      <MetricCard title="Current Census" value={census.totalCensus} unit={String(census.totalCapacity)} subtext="Occupied Beds" accentColor={BRAND_BLUE} />
      <MetricCard title="Occupancy Rate" value={`${Number(census.occupancyRate).toFixed(1)}%`} subtext="of total capacity" progressBar={`${Math.round(Number(census.occupancyRate))}%`} accentColor={BRAND_BLUE} />
      <MetricCard title="7-Day Forecast" value={census.sevenDayForecast ? `${Math.round((census.sevenDayForecast / census.totalCapacity) * 100)}%` : '—'} subtext="Predicted Peak" accentColor={BRAND_ORANGE} />
      <MetricCard title="Risk Level" value={Number(census.occupancyRate) >= 90 ? 'High' : Number(census.occupancyRate) >= 85 ? 'Moderate' : 'Normal'} type="alert" />
    </div>
  );
}

function TrendBlock({ data }: { data: TrendPoint[] }) {
  const hasActual = data.some((d) => d.actual != null);
  return (
    <div style={{ background: '#f8fafc', borderRadius: 8, padding: 16, border: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Historical trend (last {data.length} points)</div>
      {hasActual ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {data.filter((d) => d.actual != null).slice(-14).map((d, i) => (
            <span key={i} style={{ background: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 12, border: '1px solid #e2e8f0' }}>
              {d.date}: {d.actual}
            </span>
          ))}
        </div>
      ) : (
        <div style={{ color: '#94a3b8', fontSize: 12 }}>No trend data in snapshot.</div>
      )}
    </div>
  );
}

function ForecastBlock({ data }: { data: ForecastResponse }) {
  const pts = data.data?.slice(0, 7) ?? [];
  return (
    <div style={{ background: '#f8fafc', borderRadius: 8, padding: 16, border: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Forecast · MAE {data.stats?.mae?.toFixed(1) ?? '—'}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {pts.map((d, i) => (
          <span key={i} style={{ background: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 12, border: '1px solid #e2e8f0' }}>
            {(d as unknown as { date?: string }).date ?? d.date}: {(d as unknown as { predicted?: number }).predicted ?? '—'}
          </span>
        ))}
      </div>
    </div>
  );
}

function FacilitiesBlock({ facilities }: { facilities: Facility[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <th style={{ textAlign: 'left', padding: '8px 0', color: '#64748b', fontWeight: 600 }}>Hospital</th>
            <th style={{ textAlign: 'right', padding: '8px 0', color: '#64748b', fontWeight: 600 }}>Census</th>
            <th style={{ textAlign: 'right', padding: '8px 0', color: '#64748b', fontWeight: 600 }}>Occupancy</th>
            <th style={{ textAlign: 'center', padding: '8px 0', color: '#64748b', fontWeight: 600 }}>Trend</th>
          </tr>
        </thead>
        <tbody>
          {facilities.map((f, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '10px 0', fontWeight: 500 }}>{f.name}</td>
              <td style={{ textAlign: 'right', padding: '10px 0' }}>{f.census}</td>
              <td style={{ textAlign: 'right', padding: '10px 0' }}>{Number(f.occupancy).toFixed(1)}%</td>
              <td style={{ textAlign: 'center', padding: '10px 0' }}>{f.trend === 'up' ? '▲' : f.trend === 'down' ? '▼' : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AlertsBlock({ alerts }: { alerts: Alert[] }) {
  const active = alerts.filter((a) => a.severity !== 'OK');
  return (
    <div style={{ background: '#f8fafc', borderRadius: 8, padding: 16, border: '1px solid #e2e8f0' }}>
      {active.length === 0 ? (
        <div style={{ color: '#64748b', fontSize: 12 }}>No active alerts.</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {active.map((a, i) => (
            <li key={i} style={{ marginBottom: 6, fontSize: 12 }}>
              <span style={{ fontWeight: 600, color: a.severity === 'HIGH' ? '#dc2626' : a.severity === 'MEDIUM' ? BRAND_ORANGE : '#64748b' }}>{a.severity}</span>: {a.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LiveAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  useEffect(() => {
    api.getAlerts().then(setAlerts).catch(console.error);
  }, []);
  return <AlertsBlock alerts={alerts} />;
}
