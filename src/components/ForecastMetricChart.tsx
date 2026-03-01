import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { forecastMetric } from '../utils/forecast';
import { loadFacilities, loadMetrics } from '../utils/loadData';
import type { MetricRow } from '../utils/loadData';

const METRICS = ['Admissions', 'Discharges', 'ICU Occupancy', 'Total Census'];
const BRAND_BLUE = '#092240';
const BRAND_ORANGE = '#E75925';

function aggregateToDaily(
  data: Array<{ timestamp: Date; value: number; isForecast: boolean }>
): Array<{ timestamp: Date; value: number; isForecast: boolean }> {
  const aggregated = new Map<
    string,
    { values: number[]; timestamps: Date[]; isForecast: boolean }
  >();
  data.forEach((point) => {
    const date = new Date(point.timestamp);
    date.setHours(0, 0, 0, 0);
    const key = date.toISOString();
    if (!aggregated.has(key)) {
      aggregated.set(key, {
        values: [],
        timestamps: [],
        isForecast: point.isForecast,
      });
    }
    const entry = aggregated.get(key)!;
    entry.values.push(point.value);
    entry.timestamps.push(point.timestamp);
  });
  return Array.from(aggregated.entries())
    .map(([, entry]) => {
      const avgValue =
        entry.values.reduce((a, b) => a + b, 0) / entry.values.length;
      const midTime =
        entry.timestamps
          .map((t) => t.getTime())
          .sort((a, b) => a - b)[
          Math.floor(entry.timestamps.length / 2)
        ];
      return {
        timestamp: new Date(midTime),
        value: Math.round(avgValue),
        isForecast: entry.isForecast,
      };
    })
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

export interface ForecastMetricChartProps {
  /** Facility to show; when null and compact, show message to select a facility */
  facilityId: number | null | undefined;
  /** Metric name (e.g. Admissions, Total Census) */
  metric: string;
  /** Callback when user changes metric (e.g. in report dropdown) */
  onMetricChange?: (metric: string) => void;
  /** Report/compact mode: daily granularity, 7-day horizon, 30-day historical, smaller chart */
  compact?: boolean;
}

export function ForecastMetricChart({
  facilityId,
  metric,
  onMetricChange,
  compact = false,
}: ForecastMetricChartProps) {
  const [facilities, setFacilities] = useState<{ facilityId: number; location: string }[]>([]);
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);

  const effectiveFacilityId =
    facilityId ?? (facilities[0]?.facilityId ?? null);

  useEffect(() => {
    loadFacilities().then((f) =>
      setFacilities(f.map((x) => ({ facilityId: x.facilityId, location: x.location })))
    );
  }, []);

  useEffect(() => {
    if (effectiveFacilityId == null) {
      setMetrics([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadMetrics(effectiveFacilityId)
      .then(setMetrics)
      .finally(() => setLoading(false));
  }, [effectiveFacilityId]);

  const forecastHorizon = compact ? 168 : 168;
  const historicalDays = compact ? 30 : 30;
  const now = new Date();
  const historicalCutoff = new Date(
    now.getTime() - historicalDays * 24 * 60 * 60 * 1000
  );
  const forecastEnd = new Date(
    now.getTime() + forecastHorizon * 60 * 60 * 1000
  );

  const allForecastData =
    effectiveFacilityId != null
      ? forecastMetric(metrics, effectiveFacilityId, metric, forecastHorizon)
      : [];

  const filteredData = allForecastData.filter((p) => {
    if (!p.isForecast && p.timestamp < historicalCutoff) return false;
    if (p.isForecast && p.timestamp > forecastEnd) return false;
    return true;
  });

  const aggregatedData = aggregateToDaily(filteredData);
  const chartData = aggregatedData.map((p) => ({
    time: p.timestamp.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
    actual: p.isForecast ? null : p.value,
    forecast: p.isForecast ? p.value : null,
    isHistorical: !p.isForecast,
  }));

  const dividerTime =
    chartData.length > 0
      ? (() => {
          const firstForecastIdx = chartData.findIndex((d) => !d.isHistorical);
          return firstForecastIdx > 0 ? chartData[firstForecastIdx - 1].time : null;
        })()
      : null;

  const facility = facilities.find((f) => f.facilityId === effectiveFacilityId);

  if (effectiveFacilityId == null) {
    return (
      <div
        style={{
          padding: 24,
          textAlign: 'center',
          color: '#64748b',
          fontSize: 13,
          background: '#f8fafc',
          borderRadius: 8,
          border: '1px solid #e2e8f0',
        }}
      >
        Select a facility in the report configuration to see the metric forecast
        (Historical + Forecast, seasonality-adjusted).
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          padding: 24,
          textAlign: 'center',
          color: '#64748b',
          fontSize: 13,
        }}
      >
        Loading metric data…
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div
        style={{
          padding: 24,
          textAlign: 'center',
          color: '#64748b',
          fontSize: 13,
          background: '#f8fafc',
          borderRadius: 8,
          border: '1px solid #e2e8f0',
        }}
      >
        No data available for {metric} at this facility.
      </div>
    );
  }

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        border: '1px solid #edf0f5',
        padding: compact ? '16px 18px' : '20px 22px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              fontWeight: 700,
              fontSize: compact ? 13 : 14,
              color: '#0f172a',
              marginBottom: 2,
            }}
          >
            {metric} — Historical + Forecast (Seasonality-Adjusted)
          </div>
          <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
            {facility?.location ?? 'Facility'} · Trend-seasonal hybrid model
          </div>
        </div>
        {compact && onMetricChange && (
          <select
            value={metric}
            onChange={(e) => onMetricChange(e.target.value)}
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 12,
              color: '#0f172a',
              fontWeight: 600,
            }}
          >
            {METRICS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
      </div>
      <ResponsiveContainer width="100%" height={compact ? 280 : 320}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: '1px solid #e2e8f0',
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {dividerTime && (
            <ReferenceLine
              x={dividerTime}
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              label={{
                value: 'Today',
                position: 'top',
                fill: '#64748b',
                fontSize: 10,
              }}
            />
          )}
          {chartData.some((d) => d.actual !== null) && (
            <Line
              type="monotone"
              dataKey="actual"
              stroke={BRAND_BLUE}
              strokeWidth={2}
              dot={false}
              name="Actual"
              connectNulls={false}
            />
          )}
          {chartData.some((d) => d.forecast !== null) && (
            <Line
              type="monotone"
              dataKey="forecast"
              stroke={BRAND_ORANGE}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name="Forecast"
              connectNulls={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
