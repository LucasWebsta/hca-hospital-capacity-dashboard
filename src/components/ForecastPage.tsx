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
import { loadFacilities, loadMetrics } from "../utils/loadData.ts";
import type { Facility, MetricRow } from "../utils/loadData.ts";

import { forecastMetric } from "../utils/forecast.ts";

const METRICS = ["Admissions", "Discharges", "ICU Occupancy", "Total Census"];

export default function ForecastPage() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [selectedFacility, setSelectedFacility] = useState<number | null>(null);
  const [selectedMetric, setSelectedMetric] = useState("Admissions");
  const [hoursAhead, setHoursAhead] = useState(24);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [f, m] = await Promise.all([loadFacilities(), loadMetrics()]);
      setFacilities(f);
      setMetrics(m);
      setSelectedFacility(f[0]?.facilityId ?? null);
      setLoading(false);
    }
    load();
  }, []);

  const facility = facilities.find((f) => f.facilityId === selectedFacility);

  const forecastData = selectedFacility
    ? forecastMetric(metrics, selectedFacility, selectedMetric, hoursAhead)
    : [];

  const chartData = forecastData.map((p) => ({
    time: p.timestamp.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    actual: p.isForecast ? null : p.value,
    forecast: p.isForecast ? p.value : null,
  }));

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

  const peakForecast = forecastData.filter((p) => p.isForecast);
  const peakValue =
    peakForecast.length > 0 ? Math.max(...peakForecast.map((p) => p.value)) : 0;

  function getLatestValue(metric: string, orgId: number): number {
    const filtered = metrics
      .filter((r) => r.orgId === orgId && r.metric === metric)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return filtered[0]?.value ?? 0;
  }

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
          Predictive occupancy modeling · Linear regression
        </div>
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
            {facilities.map((f) => (
              <option key={f.facilityId} value={f.facilityId}>
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
            FORECAST WINDOW
          </label>
          <select
            value={hoursAhead}
            onChange={(e) => setHoursAhead(Number(e.target.value))}
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 13,
              color: "#0f172a",
            }}
          >
            <option value={12}>Next 12 hours</option>
            <option value={24}>Next 24 hours</option>
            <option value={48}>Next 48 hours</option>
            <option value={168}>Next 7 days</option>
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
              sub: `Next ${hoursAhead}h projected max`,
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
            fontWeight: 700,
            fontSize: 14,
            color: "#0f172a",
            marginBottom: 4,
          }}
        >
          {selectedMetric} — Actual + {hoursAhead}h Forecast
        </div>
        <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 16 }}>
          {facility?.location} · Linear regression model
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
            <ReferenceLine
              y={facility?.beds ? facility.beds * 0.9 : undefined}
              stroke="#ef4444"
              strokeDasharray="4 4"
              label={{ value: "90% capacity", fill: "#ef4444", fontSize: 10 }}
            />
            <Line
              type="monotone"
              dataKey="actual"
              stroke="#092240"
              strokeWidth={2}
              dot={false}
              name="Actual"
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="forecast"
              stroke="#E75925"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name="Forecast"
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
