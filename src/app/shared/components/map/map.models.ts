import { LatLong } from '@core/models/location';

export interface Marker {
  location: LatLong;
  color?: string;
  icon?: string;
  active?: boolean;
  count?: number;
  displayMode?: 'default' | 'heatmap' | 'circle';
  heatIntensity?: number;
}

export interface MapBounds {
  south: number;
  west: number;
  north: number;
  east: number;
  zoom?: number;
}
