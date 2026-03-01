import { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';

const BRAND_BLUE = '#092240';

interface InfoTooltipProps {
  /** Guidance text shown on hover */
  text: string;
  /** Min width so tooltip doesn't look too narrow (default 280) */
  minWidth?: number;
  /** Max width of the tooltip (default 380) */
  maxWidth?: number;
}

export function InfoTooltip({ text, minWidth = 280, maxWidth = 380 }: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setVisible(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [visible]);

  return (
    <div
      ref={ref}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <button
        type="button"
        aria-label="What does this mean?"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: 'none',
          background: '#e2e8f0',
          color: BRAND_BLUE,
          cursor: 'help',
          flexShrink: 0,
        }}
      >
        <HelpCircle size={12} strokeWidth={2.5} />
      </button>
      {visible && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            left: '100%',
            top: '50%',
            transform: 'translateY(-50%)',
            marginLeft: 8,
            zIndex: 1000,
            minWidth,
            maxWidth,
            width: 'max-content',
            padding: '10px 14px',
            background: BRAND_BLUE,
            color: '#fff',
            fontSize: 11.5,
            lineHeight: 1.35,
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            fontWeight: 500,
            pointerEvents: 'none',
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
}
