import { LatLong } from '../../core/models/location';

/**
 * Compare two locations and return true if they are equal
 * @param locationA The first location to compare.
 * @param locationB The second location to compare.
 * @returns boolean
 */
export const isSameLocation = (locationA: LatLong, locationB: LatLong): boolean => {
  return locationA.toString() === locationB.toString();
};

export const calculateDistanceKm = (
  origin: LatLong,
  target: LatLong,
): number => {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latDiff = toRadians(target[0] - origin[0]);
  const longDiff = toRadians(target[1] - origin[1]);
  const a =
    Math.sin(latDiff / 2) ** 2 +
    Math.cos(toRadians(origin[0])) *
      Math.cos(toRadians(target[0])) *
      Math.sin(longDiff / 2) ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
