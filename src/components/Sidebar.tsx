import { Bell, Settings, FileText, Home, Activity } from 'lucide-react';

// HCA Brand colors: Blue #092240 | Orange #E75925
const BRAND_BLUE = '#092240';
const BRAND_ORANGE = '#E75925';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'forecast', label: 'Forecast & Analysis', icon: Activity },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <div style={{
      width: 224, minWidth: 224,
      background: `linear-gradient(170deg, #061525 0%, ${BRAND_BLUE} 50%, #0d2d54 100%)`,
      color: '#fff', display: 'flex', flexDirection: 'column', height: '100vh',
      boxShadow: '2px 0 20px rgba(6,21,37,0.35)',
    }}>

      {/* Logo */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <img
          src="/hca-logo.png"
          alt="HCA Healthcare"
          style={{ height: 52, width: 'auto', maxWidth: 210, objectFit: 'contain', display: 'block' }}
        />
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '14px 10px' }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 8, marginBottom: 2,
                background: isActive ? BRAND_ORANGE : 'transparent',
                color: isActive ? '#fff' : '#7a9abd',
                border: isActive ? 'none' : 'none',
                cursor: 'pointer', fontSize: 13,
                fontWeight: isActive ? 600 : 400, textAlign: 'left',
                boxShadow: isActive ? `0 2px 14px rgba(231,89,37,0.4)` : 'none',
              }}
            >
              <Icon size={16} strokeWidth={isActive ? 2.5 : 1.8} />
              <span>{item.label}</span>
              {isActive && (
                <div style={{
                  marginLeft: 'auto', width: 5, height: 5,
                  borderRadius: '50%', background: 'rgba(255,255,255,0.7)',
                }} />
              )}
            </button>
          );
        })}
      </nav>

      {/* Team label */}
      <div style={{ padding: '0 20px 6px', fontSize: 10, fontWeight: 700, color: 'rgba(122,154,189,0.4)', letterSpacing: 1.2 }}>
        TEAM
      </div>

      {/* Users */}
      <div style={{ padding: '10px 12px 20px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        {/* Logged-in user */}
        {(() => {
          let user: { firstName?: string; lastName?: string; role?: string } | null = null;
          try { const raw = sessionStorage.getItem('user'); user = raw ? JSON.parse(raw) : null; } catch {}
          const initials = user ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() : 'HCA';
          const fullName = user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : 'HCA Healthcare';
          const role = user?.role ?? '';
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 8, marginBottom: 2 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: BRAND_ORANGE,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
                boxShadow: `0 1px 6px rgba(231,89,37,0.45)`,
              }}>{initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName}</div>
                <div style={{ fontSize: 10.5, color: '#7a9abd' }}>{role}</div>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7a9abd" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
            </div>
          );
        })()}

        {/* Emin Rantsra */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7a9abd" strokeWidth="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Emin Rantsra</div>
            <div style={{ fontSize: 10.5, color: '#7a9abd' }}>Hospital</div>
          </div>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7a9abd', padding: 2 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
