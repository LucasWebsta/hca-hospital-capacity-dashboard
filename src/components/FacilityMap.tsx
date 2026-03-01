import { useState, useEffect } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GeoFeature = any;
import { api } from '../api';

const GEO_URL = '/us-states.json';

const BLUE   = '#092240';
const ORANGE = '#E75925';

const FACILITY_LOCATIONS: Record<number, { city: string; coords: [number, number] }> = {
   1234: { city: 'Savannah, GA',       coords: [-81.09,  32.08] },
  12345: { city: 'Denver, CO',         coords: [-104.99, 39.74] },
  23456: { city: 'Austin, TX',         coords: [-97.74,  30.27] },
  34567: { city: 'Brownsville, TX',    coords: [-97.50,  25.90] },
  45678: { city: 'Hopewell, VA',       coords: [-77.29,  37.30] },
  56789: { city: 'Orlando, FL',        coords: [-81.38,  28.54] },
  67890: { city: 'Tampa, FL',          coords: [-82.46,  27.95] },
  78901: { city: 'Salt Lake City, UT', coords: [-111.89, 40.76] },
  89012: { city: 'Myrtle Beach, SC',   coords: [-78.89,  33.69] },
  90123: { city: 'Nashville, TN',      coords: [-86.78,  36.16] },
};

const FACILITY_IDS = Object.keys(FACILITY_LOCATIONS).map(Number);

function occupancyColor(pct: number): string {
  if (pct >= 95) return '#f87171';
  if (pct >= 90) return '#fb923c';
  if (pct >= 85) return ORANGE;
  if (pct >= 75) return '#fbbf24';
  if (pct >= 60) return '#a3e635';
  return '#4ade80';
}

function occupancyGlow(pct: number): string {
  if (pct >= 95) return 'rgba(248,113,113,0.55)';
  if (pct >= 90) return 'rgba(251,146,60,0.55)';
  if (pct >= 85) return 'rgba(231,89,37,0.55)';
  if (pct >= 75) return 'rgba(251,191,36,0.55)';
  if (pct >= 60) return 'rgba(163,230,53,0.45)';
  return 'rgba(74,222,128,0.45)';
}

function occupancyLabel(pct: number): string {
  if (pct >= 95) return 'Critical';
  if (pct >= 85) return 'Elevated';
  if (pct >= 75) return 'Moderate';
  return 'Normal';
}

interface FacilityOccupancy {
  id: number;
  name: string;
  occupancy: number;
  census: number;
  capacity: number;
}

interface FacilityMapProps {
  selectedFacilityId: number | null;
  defaultFacilityId?: number | null;
  onFacilitySelect: (id: number | null, name: string) => void;
}

export function FacilityMap({ selectedFacilityId, defaultFacilityId, onFacilitySelect }: FacilityMapProps) {
  const [facilities, setFacilities] = useState<FacilityOccupancy[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const didAutoSelect = useState(false);

  useEffect(() => {
    setLoading(true);
    api.getFacilities()
      .then((rows) => {
        const result: FacilityOccupancy[] = FACILITY_IDS.map((fid) => {
          const loc = FACILITY_LOCATIONS[fid];
          const match = (rows as any[]).find(
            (r) => Number(r.facility_id) === fid || Number(r.id) === fid
          );
          return {
            id: fid,
            name: match?.name ?? loc.city,
            occupancy: match ? Number(match.occupancy) : 0,
            census: match ? Number(match.census) : 0,
            capacity: match ? Number(match.capacity) : 0,
          };
        });
        setFacilities(result);

        if (!didAutoSelect[0] && defaultFacilityId) {
          const home = result.find((f) => f.id === defaultFacilityId);
          if (home) {
            didAutoSelect[0] = true;
            onFacilitySelect(home.id, home.name);
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hoveredFacility = hovered != null ? facilities.find((f) => f.id === hovered) : null;

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.65)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.65)',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '13px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: BLUE }}>Facility Network</span>
          <span style={{ fontSize: 11.5, color: '#475569' }}>•</span>
          <span style={{ fontSize: 11.5, color: '#475569' }}>
            {selectedFacilityId
              ? `${FACILITY_LOCATIONS[selectedFacilityId]?.city ?? 'Selected'} — click map or pill to change`
              : 'Click a location to filter the dashboard'}
          </span>
          {selectedFacilityId && (
            <button
              type="button"
              onClick={() => onFacilitySelect(null, 'All Facilities')}
              style={{
                fontSize: 11, fontWeight: 600, color: BLUE,
                background: '#eef2f8', border: '1px solid rgba(9,34,64,0.12)',
                borderRadius: 10, padding: '2px 9px', cursor: 'pointer',
              }}
            >
              ← All Facilities
            </button>
          )}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {[
            { label: 'Normal',   color: '#4ade80' },
            { label: 'Moderate', color: '#fbbf24' },
            { label: 'Elevated', color: ORANGE    },
            { label: 'Critical', color: '#f87171' },
          ].map(({ label, color }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: color,
                boxShadow: `0 0 6px ${color}`,
              }} />
              <span style={{ fontSize: 11, color: '#374151', fontWeight: 500 }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Map canvas — glass-tinted so background image shows through */}
      <div style={{
        position: 'relative',
        background: 'rgba(10, 22, 48, 0.55)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}>
        <ComposableMap
          projection="geoAlbersUsa"
          width={900}
          height={430}
          style={{ width: '100%', height: 'auto', display: 'block' }}
        >
          <defs>
            <filter id="marker-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <Geographies geography={GEO_URL}>
            {({ geographies }: { geographies: GeoFeature[] }) =>
              geographies.map((geo: GeoFeature) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="rgba(26, 50, 96, 0.75)"
                  stroke="#2a4a82"
                  strokeWidth={0.6}
                  style={{
                    default: { outline: 'none' },
                    hover:   { outline: 'none', fill: 'rgba(30, 58, 112, 0.85)' },
                    pressed: { outline: 'none' },
                  }}
                />
              ))
            }
          </Geographies>

          {facilities.map((facility) => {
            const loc = FACILITY_LOCATIONS[facility.id];
            if (!loc) return null;
            const color      = occupancyColor(facility.occupancy);
            const glow       = occupancyGlow(facility.occupancy);
            const isSelected = selectedFacilityId === facility.id;
            const isHovered  = hovered === facility.id;
            const isCritical = facility.occupancy >= 95;
            const r   = isSelected ? 13 : isHovered ? 12 : 10;
            const pct = Math.round(facility.occupancy);

            return (
              <Marker key={facility.id} coordinates={loc.coords}>
                {/* Critical pulse rings */}
                {isCritical && (
                  <>
                    <circle r={r + 8} fill="none" stroke="#f87171" strokeWidth={1.5} style={{ pointerEvents: 'none' }}>
                      <animate attributeName="r" values={`${r + 8};${r + 22};${r + 8}`} dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.7;0;0.7" dur="2s" repeatCount="indefinite" />
                    </circle>
                    <circle r={r + 8} fill="none" stroke="#f87171" strokeWidth={1} style={{ pointerEvents: 'none' }}>
                      <animate attributeName="r" values={`${r + 8};${r + 28};${r + 8}`} dur="2s" begin="0.5s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" begin="0.5s" repeatCount="indefinite" />
                    </circle>
                  </>
                )}
                {/* Outer ambient glow */}
                <circle r={r + 9} fill={glow} style={{ pointerEvents: 'none' }} />
                {/* Mid ring */}
                <circle r={r + 4} fill={color} opacity={0.28} style={{ pointerEvents: 'none' }} />
                {/* Selected pulse ring */}
                {isSelected && (
                  <circle
                    r={r + 17}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.4}
                    opacity={0.45}
                    style={{ pointerEvents: 'none' }}
                  />
                )}
                {/* Main dot */}
                <circle
                  r={r}
                  fill={color}
                  stroke={isSelected ? '#fff' : 'rgba(255,255,255,0.65)'}
                  strokeWidth={isSelected ? 2.5 : 1.8}
                  filter="url(#marker-glow)"
                  style={{ cursor: 'pointer' }}
                  onClick={() => onFacilitySelect(facility.id, facility.name)}
                  onMouseEnter={() => setHovered(facility.id)}
                  onMouseLeave={() => setHovered(null)}
                />
                {/* Occupancy % below the dot */}
                {pct > 0 && (
                  <text
                    y={r + 11}
                    textAnchor="middle"
                    style={{
                      fontSize: 8,
                      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                      fontWeight: 700,
                      fill: color,
                      pointerEvents: 'none',
                      userSelect: 'none',
                      filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.9))',
                    }}
                  >
                    {pct}%
                  </text>
                )}
              </Marker>
            );
          })}
        </ComposableMap>

        {/* Hover tooltip */}
        {hoveredFacility && (
          <div style={{
            position: 'absolute', bottom: 14, left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(9,34,64,0.95)',
            backdropFilter: 'blur(8px)',
            color: '#fff',
            borderRadius: 10, padding: '9px 16px',
            fontSize: 12.5, fontWeight: 500,
            pointerEvents: 'none', whiteSpace: 'nowrap',
            boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 9, height: 9, borderRadius: '50%',
              background: occupancyColor(hoveredFacility.occupancy),
              boxShadow: `0 0 8px ${occupancyColor(hoveredFacility.occupancy)}`,
              flexShrink: 0,
            }} />
            <span style={{ fontWeight: 700, color: '#f1f5f9' }}>{hoveredFacility.name}</span>
            <span style={{ color: '#475569', fontSize: 11.5 }}>{FACILITY_LOCATIONS[hoveredFacility.id]?.city}</span>
            <span style={{
              background: occupancyColor(hoveredFacility.occupancy) + '28',
              border: `1px solid ${occupancyColor(hoveredFacility.occupancy)}55`,
              color: occupancyColor(hoveredFacility.occupancy),
              borderRadius: 6, padding: '2px 8px',
              fontSize: 12, fontWeight: 800,
            }}>
              {Math.round(hoveredFacility.occupancy)}%
            </span>
            <span style={{ color: '#374151', fontSize: 11 }}>
              {occupancyLabel(hoveredFacility.occupancy)}
            </span>
            {hoveredFacility.capacity > 0 && (
              <span style={{ color: '#475569', fontSize: 11 }}>
                {hoveredFacility.census}/{hoveredFacility.capacity} beds
              </span>
            )}
          </div>
        )}

        {loading && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(13,30,56,0.7)',
          }}>
            <span style={{ fontSize: 12, color: '#475569' }}>Loading map data…</span>
          </div>
        )}
      </div>

      {/* Facility pills */}
      <div style={{
        padding: '12px 20px',
        display: 'flex', flexWrap: 'wrap', gap: 6,
        borderTop: '1px solid #f1f5f9',
        background: '#fafbfd',
      }}>
        {facilities.map((f) => {
          const color      = occupancyColor(f.occupancy);
          const isSelected = selectedFacilityId === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onFacilitySelect(f.id, f.name)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 11px', borderRadius: 20,
                border: isSelected ? `1.5px solid ${color}` : '1px solid #e2e8f0',
                background: isSelected ? `${color}18` : '#fff',
                cursor: 'pointer',
                fontSize: 11.5, fontWeight: isSelected ? 700 : 500,
                color: isSelected ? color : '#475569',
                boxShadow: isSelected ? `0 0 0 2px ${color}22` : 'none',
                transition: 'all 0.12s ease',
              }}
            >
              <div style={{
                width: 7, height: 7, borderRadius: '50%',
                background: color, boxShadow: `0 0 5px ${color}`, flexShrink: 0,
              }} />
              {FACILITY_LOCATIONS[f.id]?.city}
              {f.occupancy > 0 && (
                <span style={{ fontWeight: 700, color, marginLeft: 1 }}>
                  {Math.round(f.occupancy)}%
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
