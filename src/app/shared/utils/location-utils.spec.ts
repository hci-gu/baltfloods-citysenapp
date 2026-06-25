import { calculateDistanceKm, isSameLocation } from './location-utils';

describe('Location utils', () => {
  describe('isSameLocation', () => {
    it('should return true if locations are equal', () => {
      expect(isSameLocation([123, 123], [123, 123])).toBeTruthy();
    });

    it('should return false if locations are not equal', () => {
      expect(isSameLocation([123, 123], [456, 456])).toBeFalsy();
    });
  });

  describe('calculateDistanceKm', () => {
    it('should calculate distance between two locations', () => {
      expect(calculateDistanceKm([57.7089, 11.9746], [59.3293, 18.0686])).toBeCloseTo(
        397,
        0,
      );
    });
  });
});
