import { ChevronDown, Search, Bell } from 'lucide-react';

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

export function Header() {
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
        <button style={pill}>Dashboard <ChevronDown size={13} color="#9ca3af" /></button>
        <button style={pill}>All Hospitals <ChevronDown size={13} color="#9ca3af" /></button>
        <button style={pill}>All Service Lines <ChevronDown size={13} color="#9ca3af" /></button>
      </div>

      {/* Right controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button style={pill}>Last 14 days <ChevronDown size={13} color="#9ca3af" /></button>
        <button style={pill}>Next 7 days <ChevronDown size={13} color="#9ca3af" /></button>

        <button style={{
          ...pill,
          background: BRAND_BLUE,
          color: '#fff', borderColor: 'transparent',
          fontWeight: 600, gap: 6,
          boxShadow: `0 2px 8px rgba(9,34,64,0.3)`,
        }}>
          <Search size={13} color="#fff" /> Filter <ChevronDown size={13} color="rgba(255,255,255,0.7)" />
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

        {/* Avatar */}
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: BRAND_ORANGE,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer',
          boxShadow: `0 1px 6px rgba(231,89,37,0.4)`,
        }}>ST</div>
      </div>
    </div>
  );
}
