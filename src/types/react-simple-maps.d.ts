declare module 'react-simple-maps' {
  import { CSSProperties, MouseEventHandler, ReactNode } from 'react';

  interface ComposableMapProps {
    projection?: string;
    projectionConfig?: Record<string, unknown>;
    width?: number;
    height?: number;
    style?: CSSProperties;
    children?: ReactNode;
  }

  interface GeographiesProps {
    geography: string | object;
    children: (args: { geographies: object[] }) => ReactNode;
  }

  interface GeographyProps {
    key?: string;
    geography: object;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    style?: { default?: CSSProperties; hover?: CSSProperties; pressed?: CSSProperties };
    onClick?: MouseEventHandler<SVGPathElement>;
  }

  interface MarkerProps {
    coordinates: [number, number];
    children?: ReactNode;
  }

  export function ComposableMap(props: ComposableMapProps): JSX.Element;
  export function Geographies(props: GeographiesProps): JSX.Element;
  export function Geography(props: GeographyProps): JSX.Element;
  export function Marker(props: MarkerProps): JSX.Element;
}
