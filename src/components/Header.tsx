import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Bell } from 'lucide-react';

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

function getSessionUser(): { firstName: string; lastName: string; role: string } | null {
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

export function Header({ trendDays, onTrendDaysChange, onAlertsClick }: HeaderProps) {
  const [facilityNames, setFacilityNames] = useState<string[]>(['All Facilities']);
  const sessionUser = getSessionUser();
  const initials = getInitials(sessionUser);

  useEffect(() => {
    fetch('/api/facilities')
      .then(r => r.json())
      .then((data: { name: string }[]) => {
        setFacilityNames(['All Facilities', ...data.map(f => f.name)]);
      })
      .catch(() => {});
  }, []);

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
        <Dropdown
          label="All Facilities"
          options={facilityNames}
          onSelect={() => {}}
        />
      </div>

      {/* Right controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Dropdown
          label={TREND_DAYS.find(d => d.value === trendDays)?.label ?? 'Last 30 days'}
          options={TREND_DAYS.map(d => d.label)}
          onSelect={(v) => {
            const match = TREND_DAYS.find(d => d.label === v);
            if (match) onTrendDaysChange(match.value);
          }}
        />

        {/* Bell → Alerts */}
        <button
          onClick={onAlertsClick}
          title="View Alerts"
          style={{
            width: 34, height: 34, borderRadius: '50%',
            background: '#f8fafc', border: '1px solid #e2e8f0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', marginLeft: 2, position: 'relative',
          }}
        >
          <Bell size={15} color={BRAND_BLUE} />
          <span style={{
            position: 'absolute', top: 4, right: 4,
            width: 7, height: 7, borderRadius: '50%',
            background: BRAND_ORANGE, border: '1.5px solid #fff',
          }} />
        </button>

        {/* Avatar */}
        <div title={sessionUser ? `${sessionUser.firstName} ${sessionUser.lastName}` : ''} style={{
          width: 32, height: 32, borderRadius: '50%',
          background: BRAND_BLUE,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer',
          boxShadow: `0 1px 6px rgba(9,34,64,0.3)`,
        }}>{initials}</div>
      </div>
    </div>
  );
}
