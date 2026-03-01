import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Bell, LogOut, User, Menu } from 'lucide-react';
import { api } from '../api';
import type { FacilityListItem } from '../api';
import { ProfileModal } from './ProfileModal';

// HCA Brand colors: Blue #092240 | Orange #E75925
const BRAND_BLUE = '#092240';
const BRAND_ORANGE = '#E75925';

const pill: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5,
  padding: '5px 13px', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 7,
  background: '#fff', fontSize: 12.5, fontWeight: 500, color: '#374151',
  cursor: 'pointer', whiteSpace: 'nowrap',
  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
};

function getSessionUser(): { id?: number; firstName: string; lastName: string; role: string; photoUrl?: string; defaultTrendDays?: number } | null {
  try {
    const raw = sessionStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function getInitials(user: { firstName: string; lastName: string } | null): string {
  if (!user) return 'HCA';
  return `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase();
}

const TREND_DAYS: { label: string; value: number }[] = [
  { label: 'Last 7 days', value: 7 },
  { label: 'Last 14 days', value: 14 },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 60 days', value: 60 },
];

interface HeaderProps {
  trendDays: number;
  onTrendDaysChange: (days: number) => void;
  onAlertsClick: () => void;
  onFacilityChange: (facilityId: number | null, name: string) => void;
  selectedFacilityName?: string;
  onMenuClick?: () => void;
}

function Dropdown({ label, options, onSelect }: {
  label: string;
  options: string[];
  onSelect: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(label);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelected(label);
  }, [label]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button style={pill} onClick={() => setOpen(o => !o)}>
        {selected} <ChevronDown size={13} color="#4b5563" />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 9999,
          background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)', minWidth: 170, padding: '4px 0',
        }}>
          {options.map(opt => (
            <button key={opt} onClick={() => { setSelected(opt); onSelect(opt); setOpen(false); }} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '7px 14px', fontSize: 12.5, fontWeight: selected === opt ? 600 : 400,
              color: selected === opt ? BRAND_BLUE : '#374151',
              background: selected === opt ? '#f0f5ff' : 'transparent',
              border: 'none', cursor: 'pointer',
            }}>{opt}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Header({ trendDays, onTrendDaysChange, onAlertsClick, onFacilityChange, selectedFacilityName, onMenuClick }: HeaderProps) {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  const [facilities, setFacilities] = useState<FacilityListItem[]>([]);
  const sessionUser = getSessionUser();
  const initials = getInitials(sessionUser);
  const facilityLabel = selectedFacilityName ?? 'All Facilities';

  useEffect(() => {
    api.getFacilitiesList().then(list => {
      setFacilities(list);
      const homeId = localStorage.getItem('homeLocation');
      if (homeId && homeId !== 'all') {
        const match = list.find(f => String(f.id) === homeId);
        if (match) onFacilityChange(match.id, match.name);
      }
    }).catch(() => {});
  }, []);

  function handleFacilitySelect(name: string) {
    if (name === 'All Facilities') {
      onFacilityChange(null, 'All Facilities');
    } else {
      const match = facilities.find(f => f.name === name);
      if (match) onFacilityChange(match.id, match.name);
    }
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.88)',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
      borderBottom: `3px solid ${BRAND_ORANGE}`,
      padding: isMobile ? '0 12px' : '0 24px',
      height: isMobile ? 50 : 54,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexShrink: 0,
      boxShadow: '0 2px 8px rgba(9,34,64,0.08)',
      position: 'relative',
      zIndex: 200,
    }}>
      {/* Left filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 6, flex: 1, minWidth: 0 }}>
        {isMobile && onMenuClick && (
          <button
            onClick={onMenuClick}
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              background: 'rgba(0,0,0,0.06)',
              border: '1px solid rgba(0,0,0,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              marginRight: 4,
              flexShrink: 0,
            }}
          >
            <Menu size={18} color={BRAND_BLUE} />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Dropdown
            label={facilityLabel}
            options={['All Facilities', ...facilities.map(f => f.name)]}
            onSelect={handleFacilitySelect}
          />
        </div>
      </div>

      {/* Right controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 6, flexShrink: 0 }}>

        {/* Bell → Alerts */}
        <button
          onClick={onAlertsClick}
          title="View Alerts"
          style={{
            width: isMobile ? 36 : 34, height: isMobile ? 36 : 34, borderRadius: '50%',
            background: 'rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', marginLeft: isMobile ? 0 : 2, position: 'relative',
          }}
        >
          <Bell size={15} color={BRAND_BLUE} />
          <span style={{
            position: 'absolute', top: 4, right: 4,
            width: 7, height: 7, borderRadius: '50%',
            background: BRAND_ORANGE, border: '1.5px solid #fff',
          }} />
        </button>

        {/* Avatar + profile dropdown */}
        <AvatarMenu initials={initials} sessionUser={sessionUser} onFacilityChange={onFacilityChange} />
      </div>
    </div>
  );
}

function AvatarMenu({ initials, sessionUser, onFacilityChange }: {
  initials: string;
  sessionUser: { firstName: string; lastName: string; role: string; photoUrl?: string } | null;
  onFacilityChange: (id: number | null, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function handleLogout() {
    const userStr = sessionStorage.getItem('user');
    let userId: number | null = null;
    let userName = 'Unknown';
    
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        userId = user.id || null;
        userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown';
      } catch (e) {
        console.error('Error parsing user from session:', e);
      }
    }
    
    try {
      // Call logout API to log the sign-out event
      const API_BASE = window.location.protocol === 'file:' 
        ? 'http://localhost:7071/api'
        : '/api';
      
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, userName })
      });
    } catch (error) {
      console.error('Logout API error:', error);
      // Continue with logout even if API call fails
    }
    
    // Clear session storage and redirect to login
    sessionStorage.clear();
    window.location.href = '/login.html';
  }

  const fullName = sessionUser ? `${sessionUser.firstName} ${sessionUser.lastName}` : 'User';
  const role = sessionUser?.role ?? '';
  const photoUrl = sessionUser?.photoUrl;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen(o => !o)}
        title={fullName}
        style={{
          width: 32, 
          height: 32, 
          borderRadius: '50%',
          background: BRAND_BLUE, overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer',
          boxShadow: `0 1px 6px rgba(9,34,64,0.3)`, flexShrink: 0,
        }}
      >
        {photoUrl
          ? <img src={photoUrl} alt={fullName} referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : initials
        }
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 999,
          background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.13)', minWidth: 200, padding: '6px 0',
        }}>
          {/* User info header */}
          <div style={{ padding: '10px 16px 8px', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{fullName}</div>
            <div style={{ fontSize: 11.5, color: '#374151', marginTop: 1 }}>{role}</div>
          </div>

          {/* Profile */}
          <button
            onClick={() => { setOpen(false); setProfileOpen(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '9px 16px',
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 13, color: '#374151', textAlign: 'left',
            }}
          >
            <User size={15} color="#374151" />
            Profile
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '9px 16px',
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 13, color: '#dc2626', textAlign: 'left',
            }}
          >
            <LogOut size={15} color="#dc2626" />
            Sign out
          </button>
        </div>
      )}

      <ProfileModal isOpen={profileOpen} onClose={() => setProfileOpen(false)} onFacilityChange={onFacilityChange} />
    </div>
  );
}
