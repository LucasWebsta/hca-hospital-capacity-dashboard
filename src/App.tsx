import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Sidebar,
  Header,
  MetricCard,
  OccupancyTrendChart,
  ForecastOccupancyChart,
  FacilitiesAtRisk,
  AlertsPanel,
} from './components';
import { api } from './api';
import type { CensusMetrics } from './api';
import './App.css';

function pathnameToTab(pathname: string): string {
  if (pathname === '/' || pathname === '') return 'dashboard';
  const segment = pathname.replace(/^\//, '').split('/')[0];
  return segment || 'dashboard';
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = pathnameToTab(location.pathname);

  const setActiveTab = (tab: string) => {
    if (tab === 'dashboard') navigate('/');
    else navigate('/' + tab);
  };

  const [trendDays, setTrendDays] = useState(30);
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [selectedFacilityName, setSelectedFacilityName] = useState('All Facilities');
  const [census, setCensus] = useState<CensusMetrics>({
    totalCensus: 948, totalCapacity: 1112, occupancyRate: 85.2, sevenDayForecast: 963,
  });

  // Authentication check - redirect to login if not authenticated
  useEffect(() => {
    const userStr = sessionStorage.getItem('user');
    const isAdmin = sessionStorage.getItem('isAdmin');
    
    // If user is Kevin (admin), redirect to admin page
    if (userStr && isAdmin === 'true') {
      const user = JSON.parse(userStr);
      if (user.firstName?.toLowerCase() === 'kevin') {
        window.location.href = '/admin.html';
        return;
      }
    }
    
    // If not logged in, redirect to login page
    if (!userStr) {
      window.location.href = '/login.html';
      return;
    }
  }, []);

  useEffect(() => {
    api.getCensusMetrics(selectedFacilityId ?? undefined).then(setCensus).catch(console.error);
  }, [selectedFacilityId]);

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#edf1f8', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', overflow: 'hidden' }}>
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header
          trendDays={trendDays}
          onTrendDaysChange={setTrendDays}
          onAlertsClick={() => navigate('/alerts')}
          onFacilityChange={(id: number | null, name: string) => { setSelectedFacilityId(id); setSelectedFacilityName(name); }}
        />

        {activeTab === 'dashboard' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
            {/* Page heading */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: -0.3 }}>Census Command</div>
              <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 3, fontWeight: 500 }}>Real-time hospital occupancy · Updated just now</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 330px', gap: 22, alignItems: 'start', maxWidth: 1440 }}>

              {/* LEFT COLUMN */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Overview card with metrics */}
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #edf0f5', padding: '20px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>Hospital System Overview</div>
                    <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
                      {selectedFacilityId ? selectedFacilityName : `Across all facilities`} · Real-time
                    </div>
                    </div>
                    <span style={{ fontSize: 11, background: '#f0fdf4', color: '#16a34a', borderRadius: 5, padding: '3px 9px', fontWeight: 700, border: '1px solid #bbf7d0' }}>● Live</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                    <MetricCard
                      title="Current Census"
                      value={census.totalCensus}
                      unit={census.totalCapacity.toLocaleString()}
                      change="+7 beds"
                      subtext="Occupied Beds"
                      accentColor="#092240"
                    />
                    <MetricCard
                      title="Occupancy Rate"
                      value={`${Number(census.occupancyRate).toFixed(1)}%`}
                      change=""
                      subtext="of total capacity"
                      progressBar={`${Math.round(Number(census.occupancyRate))}%`}
                      accentColor="#092240"
                    />
                    <MetricCard
                      title="7-Day Forecast"
                      value={census.sevenDayForecast ? `${Math.round((census.sevenDayForecast / census.totalCapacity) * 100)}%` : '—'}
                      change={census.sevenDayForecast ? `±${census.sevenDayForecast - census.totalCensus} beds` : ''}
                      subtext="Predicted Peak"
                      accentColor="#E75925"
                    />
                    <MetricCard
                      title="Risk Level"
                      value={Number(census.occupancyRate) >= 90 ? 'High' : Number(census.occupancyRate) >= 85 ? 'Moderate' : 'Normal'}
                      type="alert"
                    />
                  </div>
                </div>

                {/* Occupancy Trend chart */}
                <OccupancyTrendChart days={trendDays} facilityId={selectedFacilityId ?? undefined} />

                {/* Facilities table */}
                <FacilitiesAtRisk facilityId={selectedFacilityId ?? undefined} />
              </div>

              {/* RIGHT COLUMN */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <ForecastOccupancyChart facilityId={selectedFacilityId ?? undefined} />
                <AlertsPanel />
              </div>

            </div>
          </div>
        )}

        {activeTab === 'alerts' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: -0.3 }}>Alerts & Notifications</div>
              <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 3, fontWeight: 500 }}>Create and manage your alert rules</div>
            </div>
            <div style={{ width: '100%' }}>
              <AlertsPanel />
            </div>
          </div>
        )}

        {activeTab !== 'dashboard' && activeTab !== 'alerts' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
                {activeTab === 'forecast' && 'Forecast & Analysis'}
                {activeTab === 'settings' && 'Settings'}
                {activeTab === 'reports' && 'Reports'}
              </h3>
              <p style={{ color: '#6b7280' }}>Coming soon...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
