import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  Header,
  MetricCard,
  OccupancyTrendChart,
  ForecastOccupancyChart,
  FacilitiesAtRisk,
  AlertsPanel,
  ReportsPanel,
  InfoTooltip,
} from "./components";
import { ChevronDown, ChevronUp } from "lucide-react";
import ForecastPage from "./components/ForecastPage";
import { api } from "./api";
import type { CensusMetrics } from "./api";
import "./App.css";

function pathnameToTab(pathname: string): string {
  if (pathname === "/" || pathname === "") return "dashboard";
  const segment = pathname.replace(/^\//, "").split("/")[0];
  return segment || "dashboard";
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = pathnameToTab(location.pathname);

  const setActiveTab = (tab: string) => {
    if (tab === "dashboard") navigate("/");
    else navigate("/" + tab);
  };

  const [trendDays, setTrendDays] = useState(30);
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(
    null,
  );
  const [selectedFacilityName, setSelectedFacilityName] =
    useState("All Facilities");
  const [census, setCensus] = useState<CensusMetrics>({
    totalCensus: 948,
    totalCapacity: 1112,
    occupancyRate: 85.2,
    sevenDayForecast: 963,
  });
  const [overviewMetricsExpanded, setOverviewMetricsExpanded] = useState(false);
  const [metricTooltipsOn, setMetricTooltipsOn] = useState(true);

  useEffect(() => {
    api
      .getCensusMetrics(selectedFacilityId ?? undefined)
      .then(setCensus)
      .catch(console.error);
  }, [selectedFacilityId]);

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#edf1f8",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        overflow: "hidden",
      }}
    >
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} facilityName={selectedFacilityName} />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <Header
          trendDays={trendDays}
          onTrendDaysChange={setTrendDays}
          onAlertsClick={() => navigate("/alerts")}
          onFacilityChange={(id: number | null, name: string) => {
            setSelectedFacilityId(id);
            setSelectedFacilityName(name);
          }}
          selectedFacilityName={selectedFacilityName}
        />

        {activeTab === "dashboard" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
            
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 330px",
                gap: 22,
                alignItems: "start",
                maxWidth: 1440,
              }}
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: 20 }}
              >
                <div
                  style={{
                    background: "#fff",
                    borderRadius: 12,
                    border: "1px solid #edf0f5",
                    padding: "20px 22px",
                    boxShadow:
                      "0 1px 4px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 16,
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>
                          Hospital System Overview
                        </span>
                        {metricTooltipsOn && (
                          <InfoTooltip text="Key metrics for the selected facility or all facilities. Use the facility filter in the header to focus on one site. Data refreshes from your census system." />
                        )}
                        {metricTooltipsOn && (
                          <button
                            type="button"
                            aria-expanded={overviewMetricsExpanded}
                            aria-label={overviewMetricsExpanded ? "Hide metric explanations" : "Show metric explanations"}
                            onClick={() => setOverviewMetricsExpanded((e) => !e)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 28,
                              height: 28,
                              borderRadius: 6,
                              border: "1px solid #e2e8f0",
                              background: overviewMetricsExpanded ? "#e8eef8" : "#f8fafc",
                              color: "#092240",
                              cursor: "pointer",
                              flexShrink: 0,
                            }}
                          >
                            {overviewMetricsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        )}
                      </div>
                      <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 2 }}>
                        {selectedFacilityId ? selectedFacilityName : "Across all facilities"} · Real-time
                      </div>
                    </div>
                    
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(4, 1fr)",
                      gap: 16,
                    }}
                  >
                    <MetricCard
                      title="Current Census"
                      value={census.totalCensus}
                      unit={census.totalCapacity.toLocaleString()}
                      change="+7 beds"
                      subtext="Occupied Beds"
                      accentColor="#092240"
                      tooltip="Total number of beds currently in use across the selected facility or system."
                      expanded={metricTooltipsOn ? overviewMetricsExpanded : false}
                    />
                    <MetricCard
                      title="Occupancy Rate"
                      value={`${Number(census.occupancyRate).toFixed(1)}%`}
                      change=""
                      subtext="of total capacity"
                      progressBar={`${Math.round(Number(census.occupancyRate))}%`}
                      accentColor="#092240"
                      tooltip="Percentage of total beds that are occupied. Higher rates may require capacity planning or surge response."
                      expanded={metricTooltipsOn ? overviewMetricsExpanded : false}
                    />
                    <MetricCard
                      title="7-Day Forecast"
                      value={
                        census.sevenDayForecast
                          ? `${Math.round((census.sevenDayForecast / census.totalCapacity) * 100)}%`
                          : "—"
                      }
                      change={
                        census.sevenDayForecast
                          ? `±${census.sevenDayForecast - census.totalCensus} beds`
                          : ""
                      }
                      subtext="Predicted Peak"
                      accentColor="#E75925"
                      tooltip="Expected occupancy level in 7 days based on recent trends."
                      expanded={metricTooltipsOn ? overviewMetricsExpanded : false}
                    />
                    <MetricCard
                      title="Risk Level"
                      value={
                        Number(census.occupancyRate) >= 90
                          ? "High"
                          : Number(census.occupancyRate) >= 85
                            ? "Moderate"
                            : "Normal"
                      }
                      type="alert"
                      tooltip="Overall risk based on occupancy: High (≥90%), Moderate (≥85%), or Normal."
                      expanded={metricTooltipsOn ? overviewMetricsExpanded : false}
                    />
                  </div>
                </div>

                <OccupancyTrendChart
                  days={trendDays}
                  facilityId={selectedFacilityId ?? undefined}
                  tooltipsOn={metricTooltipsOn}
                />
                <FacilitiesAtRisk
                  facilityId={selectedFacilityId ?? undefined}
                  tooltipsOn={metricTooltipsOn}
                />
              </div>

              <div
                style={{ display: "flex", flexDirection: "column", gap: 20 }}
              >
                <ForecastOccupancyChart
                  facilityId={selectedFacilityId ?? undefined}
                  tooltipsOn={metricTooltipsOn}
                />
                <AlertsPanel tooltipsOn={metricTooltipsOn} />
              </div>
            </div>

            <div
              style={{
                marginTop: 24,
                paddingTop: 16,
                borderTop: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 10,
                maxWidth: 1440,
              }}
            >
              <label
                htmlFor="metric-tooltips-toggle"
                style={{ fontSize: 12.5, color: "#64748b", fontWeight: 500, cursor: "pointer" }}
              >
                Show explanations and tooltips
              </label>
              <button
                id="metric-tooltips-toggle"
                type="button"
                role="switch"
                aria-checked={metricTooltipsOn}
                aria-label="Toggle explanations and tooltips on or off"
                onClick={() => setMetricTooltipsOn((on) => !on)}
                style={{
                  width: 40,
                  height: 22,
                  borderRadius: 11,
                  border: "1px solid #cbd5e1",
                  background: metricTooltipsOn ? "#092240" : "#e2e8f0",
                  cursor: "pointer",
                  position: "relative",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: metricTooltipsOn ? 20 : 2,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: "#fff",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                    transition: "left 0.15s ease",
                  }}
                />
              </button>
            </div>
          </div>
        )}

        {activeTab === "forecast" && <ForecastPage />}

        {activeTab === "alerts" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: "#0f172a",
                  letterSpacing: -0.3,
                }}
              >
                Alerts & Notifications
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "#94a3b8",
                  marginTop: 3,
                  fontWeight: 500,
                }}
              >
                Create and manage your alert rules
              </div>
            </div>
            <div style={{ width: "100%" }}>
              <AlertsPanel tooltipsOn={metricTooltipsOn} />
            </div>
          </div>
        )}

        {activeTab === "reports" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }} className="reports-print-container">
            <ReportsPanel />
          </div>
        )}

        {activeTab !== "dashboard" &&
          activeTab !== "alerts" &&
          activeTab !== "reports" &&
          activeTab !== "forecast" && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ textAlign: "center" }}>
                <h3 style={{ fontSize: 22, fontWeight: 700, color: "#111827", marginBottom: 8 }}>
                  {activeTab === "settings" && "Settings"}
                </h3>
                <p style={{ color: "#6b7280" }}>Coming soon...</p>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

export default App;
