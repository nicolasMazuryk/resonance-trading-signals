import { describe, it, expect } from 'vitest';
import { calculateFee, calculateTakerFee, calculateMakerFee, calculateOrderFee } from '../feeCalculator';

describe('Fee Calculator', () => {
  describe('calculateFee', () => {
    it('should calculate fee correctly for given amount, price and rate', () => {
      const amount = 100; // quantity
      const price = 50000; // price per unit
      const feeRate = 0.0005; // 0.05%
      
      const fee = calculateFee(amount, price, feeRate);
      
      // Expected: 100 * 50000 * 0.0005 = 2500
      expect(fee).toBe(2500);
    });

    it('should handle zero values', () => {
      expect(calculateFee(0, 100, 0.001)).toBe(0);
      expect(calculateFee(100, 0, 0.001)).toBe(0);
      expect(calculateFee(100, 100, 0)).toBe(0);
    });
  });

  describe('calculateTakerFee', () => {
    it('should calculate taker fee correctly', () => {
      const amount = 50;
      const price = 30000;
      const takerFeeRate = 0.0005; // 0.05%
      
      const fee = calculateTakerFee(amount, price, takerFeeRate);
      
      // Expected: 50 * 30000 * 0.0005 = 750
      expect(fee).toBe(750);
    });
  });

  describe('calculateMakerFee', () => {
    it('should calculate maker fee correctly', () => {
      const amount = 25;
      const price = 40000;
      const makerFeeRate = 0.0002; // 0.02%
      
      const fee = calculateMakerFee(amount, price, makerFeeRate);
      
      // Expected: 25 * 40000 * 0.0002 = 200
      expect(fee).toBe(200);
    });
  });

  describe('calculateOrderFee', () => {
    it('should calculate taker fee for market orders', () => {
      const amount = 10;
      const price = 60000;
      const takerFeeRate = 0.0005;
      const makerFeeRate = 0.0002;
      
      const fee = calculateOrderFee(amount, price, 'market', takerFeeRate, makerFeeRate);
      
      // Expected: 10 * 60000 * 0.0005 = 300
      expect(fee).toBe(300);
    });

    it('should calculate maker fee for limit orders', () => {
      const amount = 15;
      const price = 35000;
      const takerFeeRate = 0.0005;
      const makerFeeRate = 0.0002;
      
      const fee = calculateOrderFee(amount, price, 'limit', takerFeeRate, makerFeeRate);
      
      // Expected: 15 * 35000 * 0.0002 = 105
      expect(fee).toBe(105);
    });
  });

  describe('real-world scenarios', () => {
    it('should calculate realistic trading fees', () => {
      // Scenario: Buying 0.1 BTC at $50,000 with 0.05% taker fee
      const btcAmount = 0.1;
      const btcPrice = 50000;
      const takerFee = calculateTakerFee(btcAmount, btcPrice, 0.0005);
      
      // Expected: 0.1 * 50000 * 0.0005 = 2.5 USDT
      expect(takerFee).toBe(2.5);
    });

    it('should calculate fees for small amounts', () => {
      // Scenario: Trading 0.001 BTC at $45,000 with 0.02% maker fee
      const smallAmount = 0.001;
      const price = 45000;
      const makerFee = calculateMakerFee(smallAmount, price, 0.0002);
      
      // Expected: 0.001 * 45000 * 0.0002 = 0.009 USDT
      expect(makerFee).toBeCloseTo(0.009, 10);
    });
  });
});
