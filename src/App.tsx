import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  Header,
  MetricCard,
  OccupancyTrendChart,
  ForecastOccupancyChart,
  AlertsPanel,
  AlertsWidget,
  ReportsPanel,
  InfoTooltip,
  FacilityMap,
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

  const [trendDays, setTrendDays] = useState(() => {
    try {
      const raw = sessionStorage.getItem("user");
      if (!raw) return 30;
      const user = JSON.parse(raw) as { defaultTrendDays?: number };
      const d = user?.defaultTrendDays;
      if (typeof d === "number" && [7, 14, 30, 60].includes(d)) return d;
    } catch {
      // ignore
    }
    return 30;
  });
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(() => {
    try {
      const raw = sessionStorage.getItem('user');
      if (!raw) return null;
      const user = JSON.parse(raw) as { homeFacilityId?: number };
      return user?.homeFacilityId ?? null;
    } catch { return null; }
  });
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
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [displayedFacilityId, setDisplayedFacilityId] = useState<number | null>(() => {
    try {
      const raw = sessionStorage.getItem('user');
      if (!raw) return null;
      const user = JSON.parse(raw) as { homeFacilityId?: number };
      return user?.homeFacilityId ?? null;
    } catch { return null; }
  });

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setDisplayedFacilityId(selectedFacilityId);
    }, 200);
    return () => clearTimeout(t);
  }, [selectedFacilityId]);

  useEffect(() => {
    api
      .getCensusMetrics(displayedFacilityId ?? undefined)
      .then(setCensus)
      .catch(console.error);
  }, [displayedFacilityId]);

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        backgroundImage: 'url("/bg.jpg")',
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: "#0d1f38",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Mobile overlay */}
      {sidebarOpen && isMobile && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 998,
          }}
        />
      )}

      <Sidebar 
        activeTab={activeTab} 
        onTabChange={(tab: string) => {
          setActiveTab(tab);
          setSidebarOpen(false);
        }} 
        facilityName={selectedFacilityName}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
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
          onMenuClick={() => setSidebarOpen(true)}
        />

        {activeTab === "dashboard" && (
          <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "12px 16px" : "20px 28px" }}>
            
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : window.innerWidth < 1024 ? "1fr" : "1fr 330px",
                gap: isMobile ? 16 : 22,
                alignItems: "start",
                maxWidth: 1440,
                margin: "0 auto",
              }}
            >
              <div
                style={{
                  display: "flex", flexDirection: "column", gap: 20,
                }}
              >
                <div
                  style={{
                    background: "rgba(255,255,255,0.65)",
                    backdropFilter: "blur(4px)",
                    WebkitBackdropFilter: "blur(4px)",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.65)",
                    padding: "20px 22px",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
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
                      <div style={{ fontSize: 11.5, color: "#475569", marginTop: 2 }}>
                        {displayedFacilityId ? selectedFacilityName : "Across all facilities"} · Real-time
                      </div>
                    </div>
                    
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile 
                        ? "1fr" 
                        : window.innerWidth < 1024 
                        ? "repeat(2, 1fr)" 
                        : "repeat(4, 1fr)",
                      gap: isMobile ? 12 : 16,
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
                      progressBar={`${Math.min(Math.round(Number(census.occupancyRate)), 100)}%`}
                      type="alert"
                      tooltip="Overall risk based on occupancy: High (≥90%), Moderate (≥85%), or Normal."
                      expanded={metricTooltipsOn ? overviewMetricsExpanded : false}
                    />
                  </div>
                </div>

                <FacilityMap
                  selectedFacilityId={selectedFacilityId}
                  defaultFacilityId={(() => {
                    try {
                      const raw = sessionStorage.getItem('user');
                      if (!raw) return null;
                      const u = JSON.parse(raw) as { homeFacilityId?: number };
                      return u?.homeFacilityId ?? null;
                    } catch { return null; }
                  })()}
                  onFacilitySelect={(id, name) => {
                    setSelectedFacilityId(id);
                    setSelectedFacilityName(name);
                  }}
                />

                <OccupancyTrendChart
                  days={trendDays}
                  facilityId={displayedFacilityId ?? undefined}
                  tooltipsOn={metricTooltipsOn}
                />
              </div>

              <div
                style={{
                  display: "flex", flexDirection: "column", gap: 20,
                }}
              >
                <ForecastOccupancyChart
                  facilityId={displayedFacilityId ?? undefined}
                  tooltipsOn={metricTooltipsOn}
                />
                <AlertsWidget facilityId={displayedFacilityId} />
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
                style={{ fontSize: 12.5, color: "#374151", fontWeight: 500, cursor: "pointer" }}
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

        {activeTab === "alerts" && <AlertsPanel tooltipsOn={metricTooltipsOn} />}

        {activeTab === "reports" && (
          <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "12px 16px" : "20px 28px" }} className="reports-print-container">
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
                <p style={{ color: "#374151" }}>Coming soon...</p>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

export default App;
