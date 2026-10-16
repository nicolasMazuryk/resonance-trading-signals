import { describe, it, expect } from 'vitest';
import { SignalParser } from '../signalParser';

describe('SignalParser', () => {
  describe('parseMessage', () => {
    it('should parse opening signal correctly', () => {
      const messageText = `Opening: LONG

💱 Пара: BTC/USDT

Price: 45000

Take profit: 46000 (2.22%)

Stop loss: 44000 (-2.22%)

Position size: 1000 USDT

Entry time: 2024-01-15 14:30:00 GMT+0`;

      const signal = SignalParser.parseMessage(messageText, 123, 456, new Date());

      expect(signal).toBeDefined();
      expect(signal?.type).toBe('open');
      expect(signal?.action).toBe('LONG');
      expect(signal?.symbol).toBe('BTC/USDT');
      expect(signal?.price).toBe(45000);
      expect(signal?.tpPrice).toBe(46000);
      expect(signal?.tpPercent).toBe(2.22);
      expect(signal?.slPrice).toBe(44000);
      expect(signal?.slPercent).toBe(-2.22);
      expect(signal?.sizeUsdt).toBe(1000);
      expect(signal?.messageId).toBe(123);
      expect(signal?.channelId).toBe(456);
    });

    it('should parse closing signal correctly', () => {
      const messageText = `Closing: Take profit achieved

💱 Пара: BTC/USDT

Price: 46000

Closing time: 2024-01-15 15:30:00 GMT+0`;

      const signal = SignalParser.parseMessage(messageText, 124, 456, new Date());

      expect(signal).toBeDefined();
      expect(signal?.type).toBe('close');
      expect(signal?.reason).toBe('Take profit achieved');
      expect(signal?.symbol).toBe('BTC/USDT');
      expect(signal?.closePrice).toBe(46000);
      expect(signal?.messageId).toBe(124);
      expect(signal?.channelId).toBe(456);
    });

    it('should parse partial close signal correctly', () => {
      const messageText = `Partial position close

💱 Пара: BTC/USDT

Partial close price: 45500

Volume: 50% of the position

Time: 2024-01-15 14:45:00 GMT+0`;

      const signal = SignalParser.parseMessage(messageText, 125, 456, new Date());

      expect(signal).toBeDefined();
      expect(signal?.type).toBe('partial');
      expect(signal?.symbol).toBe('BTC/USDT');
      expect(signal?.partialPrice).toBe(45500);
      expect(signal?.partialPercent).toBe(50);
      expect(signal?.messageId).toBe(125);
      expect(signal?.channelId).toBe(456);
    });

    it('should parse update signal with explicit price correctly', () => {
      const messageText = `Update: Move the stop loss to 44500

💱 Пара: BTC/USDT

Update time: 2024-01-15 14:35:00 GMT+0`;

      const signal = SignalParser.parseMessage(messageText, 126, 456, new Date());

      expect(signal).toBeDefined();
      expect(signal?.type).toBe('update');
      expect(signal?.updateType).toBe('explicit');
      expect(signal?.updatePrice).toBe(44500);
      expect(signal?.symbol).toBe('BTC/USDT');
      expect(signal?.messageId).toBe(126);
      expect(signal?.channelId).toBe(456);
    });

    it('should parse update signal with breakeven correctly', () => {
      const messageText = `Update: Move the stop loss to breakeven

💱 Пара: BTC/USDT

Update time: 2024-01-15 14:35:00 GMT+0`;

      const signal = SignalParser.parseMessage(messageText, 127, 456, new Date());

      expect(signal).toBeDefined();
      expect(signal?.type).toBe('update');
      expect(signal?.updateType).toBe('breakeven');
      expect(signal?.updatePrice).toBeUndefined();
      expect(signal?.symbol).toBe('BTC/USDT');
      expect(signal?.messageId).toBe(127);
      expect(signal?.channelId).toBe(456);
    });

    it('should return null for non-signal messages', () => {
      const messageText = 'This is just a regular message about crypto';

      const signal = SignalParser.parseMessage(messageText, 128, 456, new Date());

      expect(signal).toBeNull();
    });

    it('should handle different datetime formats', () => {
      const messageText = `Opening: SHORT

💱 Пара: ETH/USDT

Price: 3000

Take profit: 2900 (-3.33%)

Stop loss: 3100 (3.33%)

Position size: 500 USDT

Entry time: 15-01-2024 14:30:00`;

      const signal = SignalParser.parseMessage(messageText, 129, 456, new Date());

      expect(signal).toBeDefined();
      expect(signal?.type).toBe('open');
      expect(signal?.action).toBe('SHORT');
      expect(signal?.symbol).toBe('ETH/USDT');
      expect(signal?.price).toBe(3000);
    });

    it('should generate unique message hash', () => {
      const messageText = `Opening: LONG

💱 Пара: BTC/USDT

Price: 45000

Take profit: 46000 (2.22%)

Stop loss: 44000 (-2.22%)

Position size: 1000 USDT

Entry time: 2024-01-15 14:30:00 GMT+0`;

      const signal1 = SignalParser.parseMessage(messageText, 123, 456, new Date());
      const signal2 = SignalParser.parseMessage(messageText, 123, 456, new Date());

      expect(signal1?.messageHash).toBeDefined();
      expect(signal2?.messageHash).toBeDefined();
      expect(signal1?.messageHash).toBe(signal2?.messageHash);
      expect(signal1?.messageHash).toBe('456-123-open');
    });

    it('should handle case insensitive matching', () => {
      const messageText = `Opening: long

💱 Пара: btc/usdt

Price: 45000

Take profit: 46000 (2.22%)

Stop loss: 44000 (-2.22%)

Position size: 1000 USDT

Entry time: 2024-01-15 14:30:00 GMT+0`;

      const signal = SignalParser.parseMessage(messageText, 130, 456, new Date());

      expect(signal).toBeDefined();
      expect(signal?.type).toBe('open');
      expect(signal?.action).toBe('LONG');
      expect(signal?.symbol).toBe('BTC/USDT');
    });
  });
});
