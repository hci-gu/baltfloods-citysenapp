import { LatLong } from '@core/models/location';
import { MapBounds } from '@shared/components/map/map.component';
import { WEB_MERCATOR_TILE_SIZE } from './dashboard-map.constants';

export const getPointerRatio = (
  event: PointerEvent,
  container: HTMLElement,
): number => {
  const rect = container.getBoundingClientRect();
  if (rect.width <= 0) {
    return 0;
  }

  const raw = (event.clientX - rect.left) / rect.width;
  return Math.max(0, Math.min(raw, 1));
};

export const projectLocationToWorldPixel = (
  location: LatLong,
  zoom: number,
): { x: number; y: number } => {
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, location[0]));
  const longitude = location[1];
  const scale = WEB_MERCATOR_TILE_SIZE * 2 ** zoom;
  const sinLatitude = Math.sin((latitude * Math.PI) / 180);

  return {
    x: ((longitude + 180) / 360) * scale,
    y:
      (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) *
      scale,
  };
};

export const getPixelDistance = (
  first: { x: number; y: number },
  second: { x: number; y: number },
): number => Math.hypot(first.x - second.x, first.y - second.y);

export const isPointWithinBounds = (
  location: LatLong,
  bounds: MapBounds | null,
): boolean => {
  if (!bounds) {
    return true;
  }

  const [latitude, longitude] = location;
  const longitudeInBounds =
    bounds.west <= bounds.east
      ? longitude >= bounds.west && longitude <= bounds.east
      : longitude >= bounds.west || longitude <= bounds.east;

  return (
    latitude >= bounds.south && latitude <= bounds.north && longitudeInBounds
  );
};
