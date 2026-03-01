import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Bell, LogOut, User } from 'lucide-react';
import { api } from '../api';
import type { FacilityListItem } from '../api';
import { ProfileModal } from './ProfileModal';

// HCA Brand colors: Blue #092240 | Orange #E75925
const BRAND_BLUE = '#092240';
const BRAND_ORANGE = '#E75925';

const pill: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5,
  padding: '5px 13px', border: '1px solid #e2e8f0', borderRadius: 7,
  background: '#fff', fontSize: 12.5, fontWeight: 500, color: '#374151',
  cursor: 'pointer', whiteSpace: 'nowrap',
  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
};

function getSessionUser(): { firstName: string; lastName: string; role: string; photoUrl?: string } | null {
  try {
    const raw = sessionStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function getInitials(user: { firstName: string; lastName: string } | null): string {
  if (!user) return 'HCA';
  return `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase();
}

interface HeaderProps {
  trendDays?: number;
  onTrendDaysChange?: (days: number) => void;
  onAlertsClick?: () => void;
  onFacilityChange?: (facilityId: number | null, name: string) => void;
  selectedFacilityName?: string;
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
        {selected} <ChevronDown size={13} color="#9ca3af" />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 999,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 170, padding: '4px 0',
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

export function Header({ trendDays, onTrendDaysChange, onAlertsClick, onFacilityChange, selectedFacilityName }: HeaderProps) {
  const [facilities, setFacilities] = useState<FacilityListItem[]>([]);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const sessionUser = getSessionUser();
  const initials = getInitials(sessionUser);
  const facilityLabel = selectedFacilityName ?? 'All Facilities';

  useEffect(() => {
    if (onFacilityChange) {
      api.getFacilitiesList().then(list => {
        setFacilities(list);
        const homeId = localStorage.getItem('homeLocation');
        if (homeId && homeId !== 'all') {
          const match = list.find(f => String(f.id) === homeId);
          if (match) onFacilityChange(match.id, match.name);
        }
      }).catch(() => {});
    }
  }, [onFacilityChange]);

  function handleFacilitySelect(name: string) {
    if (onFacilityChange) {
      if (name === 'All Facilities') {
        onFacilityChange(null, 'All Facilities');
      } else {
        const match = facilities.find(f => f.name === name);
        if (match) onFacilityChange(match.id, match.name);
      }
    }
  }

  return (
    <div style={{
      background: '#fff',
      borderBottom: `3px solid ${BRAND_ORANGE}`,
      padding: '0 24px',
      height: 54,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexShrink: 0,
      boxShadow: '0 2px 8px rgba(9,34,64,0.08)',
    }}>
      {/* Left filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {onFacilityChange ? (
          <Dropdown
            label={facilityLabel}
            options={['All Facilities', ...facilities.map(f => f.name)]}
            onSelect={handleFacilitySelect}
          />
        ) : (
          <>
            <button style={pill}>Dashboard <ChevronDown size={13} color="#9ca3af" /></button>
            <button style={pill}>All Hospitals <ChevronDown size={13} color="#9ca3af" /></button>
            <button style={pill}>All Service Lines <ChevronDown size={13} color="#9ca3af" /></button>
          </>
        )}
      </div>

      {/* Right controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {onTrendDaysChange && trendDays !== undefined && (
          <button style={pill}>Last {trendDays} days <ChevronDown size={13} color="#9ca3af" /></button>
        )}
        {!onTrendDaysChange && (
          <>
            <button style={pill}>Last 14 days <ChevronDown size={13} color="#9ca3af" /></button>
            <button style={pill}>Next 7 days <ChevronDown size={13} color="#9ca3af" /></button>
          </>
        )}

        <button style={{
          ...pill,
          background: BRAND_BLUE,
          color: '#fff', borderColor: 'transparent',
          fontWeight: 600, gap: 6,
          boxShadow: `0 2px 8px rgba(9,34,64,0.3)`,
        }}>
          <ChevronDown size={13} color="rgba(255,255,255,0.7)" /> Filter
        </button>

        {/* Bell */}
        <button style={{
          width: 34, height: 34, borderRadius: '50%',
          background: '#f8fafc', border: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', marginLeft: 2,
        }}>
          <Bell size={15} color={BRAND_BLUE} />
        </button>

        {/* Avatar - Clickable to open profile modal */}
        <div 
          onClick={() => setIsProfileModalOpen(true)}
          style={{
            width: 32, height: 32, borderRadius: '50%',
            background: BRAND_ORANGE,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer',
            boxShadow: `0 1px 6px rgba(231,89,37,0.4)`,
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.1)';
            e.currentTarget.style.boxShadow = `0 2px 8px rgba(231,89,37,0.6)`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = `0 1px 6px rgba(231,89,37,0.4)`;
          }}
          title="View Profile"
        >{initials}</div>
      </div>

      {/* Profile Modal */}
      <ProfileModal 
        isOpen={isProfileModalOpen} 
        onClose={() => setIsProfileModalOpen(false)}
        onFacilityChange={onFacilityChange}
      />
    </div>
  );
}
