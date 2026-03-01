import { useEffect, useState } from "react";
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
} from "recharts";
import { forecastMetric, validateModel } from "../utils/forecast";
import type { ValidationMetrics } from "../utils/forecast";
import { loadFacilities, loadMetrics } from "../utils/loadData";
import type { Facility, MetricRow } from "../utils/loadData";
import { ForecastOccupancyChart } from "./ForecastOccupancyChart";

const METRICS = ["Admissions", "Discharges", "ICU Occupancy", "Total Census"];

const BRAND_BLUE = "#092240";
const BRAND_ORANGE = "#E75925";

export default function ForecastPage() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [selectedFacility, setSelectedFacility] = useState<number | null>(null);
  const [selectedMetric, setSelectedMetric] = useState("Admissions");
  const [forecastHorizon, setForecastHorizon] = useState(168); // hours ahead to forecast (default 7 days)
  const [historicalRange, setHistoricalRange] = useState<number | "all">("all"); // days back to show, or 'all'
  const [displayWindow, setDisplayWindow] = useState<
    "historical" | "forecast" | "both"
  >("both");
  const [timeGranularity, setTimeGranularity] = useState<
    "15min" | "hourly" | "12hour" | "daily"
  >("15min");
  const [loading, setLoading] = useState(true);
  const [validation, setValidation] = useState<ValidationMetrics | null>(null);

  useEffect(() => {
    async function load() {
      const f = await loadFacilities();
      setFacilities(f);
      const firstId = f[0]?.facilityId ?? null;
      setSelectedFacility(firstId);
      if (firstId) {
        const m = await loadMetrics(firstId);
        setMetrics(m);
      }
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    async function reload() {
      if (selectedFacility !== null) {
        setLoading(true);
        const m = await loadMetrics(selectedFacility);
        setMetrics(m);
        setLoading(false);
      }
    }
    reload();
  }, [selectedFacility]);

  function getLatestValue(metric: string, orgId: number): number {
    const filtered = metrics
      .filter((r) => r.orgId === orgId && r.metric === metric)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return filtered[0]?.value ?? 0;
  }

  const facility = facilities.find((f) => f.facilityId === selectedFacility);

  // Calculate display time ranges
  const now = new Date();
  const historicalCutoff =
    historicalRange === "all"
      ? null
      : new Date(now.getTime() - historicalRange * 24 * 60 * 60 * 1000);
  const forecastEnd = new Date(
    now.getTime() + forecastHorizon * 60 * 60 * 1000,
  );

  // Always calculate forecast using ALL available historical data
  // But only display what user selects
  const allForecastData = selectedFacility
    ? forecastMetric(metrics, selectedFacility, selectedMetric, forecastHorizon)
    : [];

  // Filter data based on display preferences
  const filteredData = allForecastData.filter((p) => {
    // Filter by historical range if specified
    if (historicalCutoff && !p.isForecast && p.timestamp < historicalCutoff) {
      return false;
    }

    // Filter by display window preference
    if (displayWindow === "historical") {
      return (
        !p.isForecast && (!historicalCutoff || p.timestamp >= historicalCutoff)
      );
    } else if (displayWindow === "forecast") {
      return p.isForecast && p.timestamp <= forecastEnd;
    } else {
      // 'both' - show historical (within range) and forecast (within horizon)
      if (p.isForecast) {
        return p.timestamp <= forecastEnd;
      } else {
        return !historicalCutoff || p.timestamp >= historicalCutoff;
      }
    }
  });

  // Aggregate data based on selected granularity
  function aggregateDataByGranularity(
    data: Array<{ timestamp: Date; value: number; isForecast: boolean }>,
    granularity: "15min" | "hourly" | "12hour" | "daily",
  ): Array<{ timestamp: Date; value: number; isForecast: boolean }> {
    if (granularity === "15min") {
      return data; // No aggregation needed
    }

    const aggregated = new Map<
      string,
      { values: number[]; timestamps: Date[]; isForecast: boolean }
    >();

    data.forEach((point) => {
      let key: string;
      const date = new Date(point.timestamp);

      if (granularity === "hourly") {
        // Round to nearest hour
        date.setMinutes(0, 0, 0);
        key = date.toISOString();
      } else if (granularity === "12hour") {
        // Round to nearest 12-hour period (midnight or noon)
        const hour = date.getHours();
        date.setHours(hour < 12 ? 0 : 12, 0, 0, 0);
        key = date.toISOString();
      } else if (granularity === "daily") {
        // Round to start of day
        date.setHours(0, 0, 0, 0);
        key = date.toISOString();
      } else {
        key = point.timestamp.toISOString();
      }

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

    // Average values for each time bucket, but use weighted average for smoother transitions
    return Array.from(aggregated.entries())
      .map(([key, entry]) => {
        // For forecast data, use median to reduce impact of outliers
        // For historical data, use mean
        let avgValue: number;
        if (entry.isForecast && entry.values.length > 1) {
          const sorted = [...entry.values].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          avgValue =
            sorted.length % 2 === 0
              ? (sorted[mid - 1] + sorted[mid]) / 2
              : sorted[mid];
        } else {
          avgValue =
            entry.values.reduce((a, b) => a + b, 0) / entry.values.length;
        }

        // Use the middle timestamp in the bucket for better representation
        const timestamps = entry.timestamps
          .map((t) => t.getTime())
          .sort((a, b) => a - b);
        const midTime = timestamps[Math.floor(timestamps.length / 2)];
        const representativeTime = new Date(midTime);

        return {
          timestamp: representativeTime,
          value: Math.round(avgValue),
          isForecast: entry.isForecast,
        };
      })
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  const aggregatedData = aggregateDataByGranularity(
    filteredData,
    timeGranularity,
  );

  const chartData = aggregatedData.map((p) => {
    // Format time based on granularity
    let timeFormat: Intl.DateTimeFormatOptions;
    if (timeGranularity === "daily") {
      timeFormat = { month: "short", day: "numeric" };
    } else if (timeGranularity === "12hour") {
      timeFormat = { month: "short", day: "numeric", hour: "2-digit" };
    } else if (timeGranularity === "hourly") {
      timeFormat = { month: "short", day: "numeric", hour: "2-digit" };
    } else {
      timeFormat = {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      };
    }

    return {
      time: p.timestamp.toLocaleString("en-US", timeFormat),
      actual: p.isForecast ? null : p.value,
      forecast: p.isForecast ? p.value : null,
      isHistorical: !p.isForecast,
    };
  });

  const latestCensus = selectedFacility
    ? getLatestValue("Total Census", selectedFacility)
    : 0;
  const latestICU = selectedFacility
    ? getLatestValue("ICU Occupancy", selectedFacility)
    : 0;
  const latestAdmissions = selectedFacility
    ? getLatestValue("Admissions", selectedFacility)
    : 0;
  const latestDischarges = selectedFacility
    ? getLatestValue("Discharges", selectedFacility)
    : 0;

  const occupancyPct = facility
    ? Math.round((latestCensus / facility.beds) * 100)
    : 0;
  const icuPct = facility ? Math.round((latestICU / facility.icuMax) * 100) : 0;

  const peakForecast = filteredData.filter((p) => p.isForecast);
  const peakValue =
    peakForecast.length > 0 ? Math.max(...peakForecast.map((p) => p.value)) : 0;

  // Find divider time for 'both' view (where historical ends and forecast begins)
  const dividerTime =
    displayWindow === "both" && chartData.length > 0
      ? (() => {
          const firstForecastIdx = chartData.findIndex((d) => !d.isHistorical);
          return firstForecastIdx > 0
            ? chartData[firstForecastIdx - 1].time
            : null;
        })()
      : null;

  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ color: "#6b7280" }}>Loading data...</p>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "20px 28px",
        background: "#edf1f8",
      }}
    >
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: "#0f172a",
            letterSpacing: -0.3,
          }}
        >
          Forecast & Analysis
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: "#94a3b8",
            marginTop: 3,
            fontWeight: 500,
          }}
        >
          Predictive occupancy modeling · Trend-seasonal hybrid model
        </div>
      </div>

      {/* Enhanced Forecast with Tooltips */}
      <div style={{ marginBottom: 20 }}>
        <ForecastOccupancyChart
          facilityId={selectedFacility ? selectedFacility : undefined}
          tooltipsOn={true}
        />
      </div>

      {/* Controls */}
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #edf0f5",
          padding: "16px 20px",
          marginBottom: 20,
          display: "flex",
          gap: 16,
          alignItems: "center",
          flexWrap: "wrap",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}
      >
        <div>
          <label
            style={{
              fontSize: 11,
              color: "#94a3b8",
              fontWeight: 600,
              display: "block",
              marginBottom: 4,
            }}
          >
            FACILITY
          </label>
          <select
            value={selectedFacility ?? ""}
            onChange={(e) => setSelectedFacility(Number(e.target.value))}
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 13,
              color: "#0f172a",
            }}
          >
            {facilities.map((f, idx) => (
              <option
                key={`facility-${f.facilityId}-${idx}`}
                value={f.facilityId}
              >
                {f.location}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            style={{
              fontSize: 11,
              color: "#94a3b8",
              fontWeight: 600,
              display: "block",
              marginBottom: 4,
            }}
          >
            METRIC
          </label>
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value)}
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 13,
              color: "#0f172a",
            }}
          >
            {METRICS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            style={{
              fontSize: 11,
              color: "#94a3b8",
              fontWeight: 600,
              display: "block",
              marginBottom: 4,
            }}
          >
            FORECAST HORIZON
          </label>
          <select
            value={forecastHorizon}
            onChange={(e) => setForecastHorizon(Number(e.target.value))}
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 13,
              color: "#0f172a",
            }}
          >
            <option value={6}>Next 6 hours</option>
            <option value={12}>Next 12 hours</option>
            <option value={24}>Next 24 hours</option>
            <option value={48}>Next 48 hours</option>
            <option value={168}>Next 7 days</option>
            <option value={336}>Next 14 days</option>
            <option value={720}>Next 30 days</option>
            <option value={1440}>Next 60 days</option>
            <option value={2160}>Next 90 days</option>
            <option value={4320}>Next 6 months</option>
          </select>
        </div>
        <div>
          <label
            style={{
              fontSize: 11,
              color: "#94a3b8",
              fontWeight: 600,
              display: "block",
              marginBottom: 4,
            }}
          >
            HISTORICAL RANGE
          </label>
          <select
            value={historicalRange}
            onChange={(e) =>
              setHistoricalRange(
                e.target.value === "all" ? "all" : Number(e.target.value),
              )
            }
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 13,
              color: "#0f172a",
            }}
          >
            <option value="all">All Available Data</option>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
        <div>
          <label
            style={{
              fontSize: 11,
              color: "#94a3b8",
              fontWeight: 600,
              display: "block",
              marginBottom: 4,
            }}
          >
            DISPLAY
          </label>
          <select
            value={displayWindow}
            onChange={(e) =>
              setDisplayWindow(
                e.target.value as "historical" | "forecast" | "both",
              )
            }
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 13,
              color: "#0f172a",
            }}
          >
            <option value="both">Historical + Forecast</option>
            <option value="historical">Historical Only</option>
            <option value="forecast">Forecast Only</option>
          </select>
        </div>
        <div>
          <label
            style={{
              fontSize: 11,
              color: "#94a3b8",
              fontWeight: 600,
              display: "block",
              marginBottom: 4,
            }}
          >
            TIME GRANULARITY
          </label>
          <select
            value={timeGranularity}
            onChange={(e) =>
              setTimeGranularity(
                e.target.value as "15min" | "hourly" | "12hour" | "daily",
              )
            }
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 13,
              color: "#0f172a",
            }}
          >
            <option value="15min">Every 15 Minutes</option>
            <option value="hourly">Hourly</option>
            <option value="12hour">12-Hour Intervals</option>
            <option value="daily">Daily</option>
          </select>
        </div>
      </div>

      {/* KPI cards */}
      {facility && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
            marginBottom: 20,
          }}
        >
          {[
            {
              label: "Bed Occupancy",
              value: `${occupancyPct}%`,
              sub: `${latestCensus} / ${facility.beds} beds`,
              color:
                occupancyPct > 90
                  ? "#ef4444"
                  : occupancyPct > 75
                    ? "#f97316"
                    : "#16a34a",
            },
            {
              label: "ICU Utilization",
              value: `${icuPct}%`,
              sub: `${latestICU} / ${facility.icuMax} ICU beds`,
              color:
                icuPct > 90 ? "#ef4444" : icuPct > 75 ? "#f97316" : "#16a34a",
            },
            {
              label: "Forecast Peak",
              value: peakValue,
              sub: `Next ${forecastHorizon}h projected max`,
              color: "#E75925",
            },
            {
              label: "Admissions Today",
              value: latestAdmissions,
              sub: `${latestDischarges} discharges`,
              color: "#092240",
            },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                background: "#fff",
                borderRadius: 12,
                border: "1px solid #edf0f5",
                padding: "16px 20px",
                boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "#94a3b8",
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                {card.label.toUpperCase()}
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: card.color }}>
                {card.value}
              </div>
              <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 4 }}>
                {card.sub}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Validation metrics */}
      {validation && (
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            border: "1px solid #edf0f5",
            padding: "16px 20px",
            marginBottom: 20,
            display: "flex",
            gap: 32,
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>
              MODEL VALIDATION
            </div>
            <div style={{ fontSize: 12, color: "#0f172a", marginTop: 4 }}>
              80/20 train/test split · {validation.trainSize} train points ·{" "}
              {validation.testSize} test points
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>
              MAE
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#092240" }}>
              {validation.mae}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>
              RMSE
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#092240" }}>
              {validation.rmse}
            </div>
          </div>
        </div>
      )}

      {/* Forecast Chart */}
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #edf0f5",
          padding: "20px 22px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 700,
                fontSize: 14,
                color: "#0f172a",
                marginBottom: 4,
              }}
            >
              {selectedMetric} —{" "}
              {displayWindow === "historical"
                ? "Historical"
                : displayWindow === "forecast"
                  ? "Forecast"
                  : "Historical + Forecast"}{" "}
              (Seasonality-Adjusted)
            </div>
            <div style={{ fontSize: 11.5, color: "#94a3b8" }}>
              {facility?.location} · Trend-seasonal hybrid model with holiday
              adjustments
            </div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              interval="preserveStartEnd"
            />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid #e2e8f0",
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {/* Divider line between historical and forecast (for 'both' view) */}
            {dividerTime && (
              <ReferenceLine
                x={dividerTime}
                stroke="#94a3b8"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                label={{
                  value: "Today",
                  position: "top",
                  fill: "#64748b",
                  fontSize: 10,
                }}
              />
            )}
            <ReferenceLine
              y={facility?.beds ? facility.beds * 0.9 : undefined}
              stroke="#ef4444"
              strokeDasharray="4 4"
              label={{ value: "90% capacity", fill: "#ef4444", fontSize: 10 }}
            />
            {chartData.some((d) => d.actual !== null) && (
              <Line
                type="monotone"
                dataKey="actual"
                stroke={displayWindow === "historical" ? "#64748b" : BRAND_BLUE}
                strokeWidth={2}
                strokeDasharray={
                  displayWindow === "historical" ? "5 5" : "none"
                }
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
    </div>
  );
}
