import { describe, it, expect } from 'vitest';
import { getDistanceMeters, PROXIMITY_RADIUS_METERS } from '@/lib/proximity';

describe('Proximity Utility', () => {
  describe('getDistanceMeters', () => {
    it('should calculate distance between two coordinates', () => {
      // San Francisco to Los Angeles (approx 559 km)
      const sf = { lat: 37.7749, lng: -122.4194 };
      const la = { lat: 34.0522, lng: -118.2437 };
      
      const distance = getDistanceMeters(sf.lat, sf.lng, la.lat, la.lng);
      
      // Should be approximately 559,000 meters (allow 1% margin)
      expect(distance).toBeGreaterThan(550000);
      expect(distance).toBeLessThan(570000);
    });

    it('should return 0 for same coordinates', () => {
      const distance = getDistanceMeters(40.7128, -74.0060, 40.7128, -74.0060);
      expect(distance).toBeLessThan(1); // Essentially 0
    });

    it('should calculate small distances accurately', () => {
      // Two points 100 meters apart (approx)
      const point1 = { lat: 40.7128, lng: -74.0060 };
      const point2 = { lat: 40.7137, lng: -74.0060 }; // ~100m north
      
      const distance = getDistanceMeters(point1.lat, point1.lng, point2.lat, point2.lng);
      
      // Should be approximately 100 meters (allow 10% margin)
      expect(distance).toBeGreaterThan(90);
      expect(distance).toBeLessThan(110);
    });

    it('should handle negative coordinates', () => {
      // Sydney, Australia (negative coordinates)
      const sydney = { lat: -33.8688, lng: 151.2093 };
      const melbourne = { lat: -37.8136, lng: 144.9631 };
      
      const distance = getDistanceMeters(sydney.lat, sydney.lng, melbourne.lat, melbourne.lng);
      
      // Should be approximately 714 km
      expect(distance).toBeGreaterThan(700000);
      expect(distance).toBeLessThan(730000);
    });
  });

  describe('PROXIMITY_RADIUS_METERS', () => {
    it('should be set to 100 meters', () => {
      expect(PROXIMITY_RADIUS_METERS).toBe(100);
    });
  });

  describe('Proximity business logic', () => {
    it('should identify when user is within range', () => {
      const storeLat = 40.7128;
      const storeLng = -74.0060;
      const userLat = 40.7137; // ~100m away
      const userLng = -74.0060;
      
      const distance = getDistanceMeters(userLat, userLng, storeLat, storeLng);
      
      expect(distance).toBeLessThanOrEqual(PROXIMITY_RADIUS_METERS);
    });

    it('should identify when user is outside range', () => {
      const storeLat = 40.7128;
      const storeLng = -74.0060;
      const userLat = 40.7200; // ~800m away
      const userLng = -74.0060;
      
      const distance = getDistanceMeters(userLat, userLng, storeLat, storeLng);
      
      expect(distance).toBeGreaterThan(PROXIMITY_RADIUS_METERS);
    });
  });
});
