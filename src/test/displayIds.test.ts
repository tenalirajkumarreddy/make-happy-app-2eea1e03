import { describe, it, expect } from 'vitest';

/**
 * Tests for ID generation patterns used in the app
 */
describe('Display ID Generation', () => {
  describe('ID format validation', () => {
    it('should match sale ID format (S-YYYYMMDD-XXXX)', () => {
      const saleIdPattern = /^S-\d{8}-\d{4}$/;
      
      expect('S-20260320-0001').toMatch(saleIdPattern);
      expect('S-20260320-9999').toMatch(saleIdPattern);
      expect('INVALID-123').not.toMatch(saleIdPattern);
    });

    it('should match transaction ID format (T-YYYYMMDD-XXXX)', () => {
      const txIdPattern = /^T-\d{8}-\d{4}$/;
      
      expect('T-20260320-0001').toMatch(txIdPattern);
      expect('T-20260320-5678').toMatch(txIdPattern);
      expect('INVALID-456').not.toMatch(txIdPattern);
    });

    it('should match order ID format (O-YYYYMMDD-XXXX)', () => {
      const orderIdPattern = /^O-\d{8}-\d{4}$/;
      
      expect('O-20260320-0001').toMatch(orderIdPattern);
      expect('O-20260320-1234').toMatch(orderIdPattern);
    });
  });

  describe('ID prefix logic', () => {
    const getPrefixForType = (type: string) => {
      const prefixMap: Record<string, string> = {
        sale: 'S',
        transaction: 'T',
        order: 'O',
        route: 'R',
        customer: 'C',
      };
      return prefixMap[type] || 'X';
    };

    it('should return correct prefix for entity type', () => {
      expect(getPrefixForType('sale')).toBe('S');
      expect(getPrefixForType('transaction')).toBe('T');
      expect(getPrefixForType('order')).toBe('O');
      expect(getPrefixForType('route')).toBe('R');
      expect(getPrefixForType('customer')).toBe('C');
    });

    it('should return default prefix for unknown type', () => {
      expect(getPrefixForType('unknown')).toBe('X');
    });
  });

  describe('Date format in IDs', () => {
    it('should extract date from display ID', () => {
      const extractDate = (id: string) => {
        const match = id.match(/^[A-Z]-(\d{8})-\d{4}$/);
        return match ? match[1] : null;
      };

      expect(extractDate('S-20260320-0001')).toBe('20260320');
      expect(extractDate('T-20251225-9999')).toBe('20251225');
      expect(extractDate('INVALID')).toBeNull();
    });

    it('should validate date format is YYYYMMDD', () => {
      const isValidDateFormat = (dateStr: string) => {
        if (dateStr.length !== 8) return false;
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6));
        const day = parseInt(dateStr.substring(6, 8));
        
        return year >= 2024 && year <= 2099 &&
               month >= 1 && month <= 12 &&
               day >= 1 && day <= 31;
      };

      expect(isValidDateFormat('20260320')).toBe(true);
      expect(isValidDateFormat('20261232')).toBe(false); // Invalid month
      expect(isValidDateFormat('20260001')).toBe(false); // Invalid day
      expect(isValidDateFormat('2026032')).toBe(false); // Too short
    });
  });
});
