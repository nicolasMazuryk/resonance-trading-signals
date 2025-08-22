import { Signal, OpenSignal, CloseSignal, PartialSignal, UpdateSignal } from '../types';
import { logger } from '../utils/logger';

export class SignalParser {

  /**
   * Parse a Telegram message into a structured signal
   */
  static parseMessage(
    messageText: string,
    messageId: number,
    channelId: number,
    timestamp: Date
  ): Signal | null {
    try {
      // Try to match opening signal first
      if (messageText.includes('📢 Opening:')) {
        return this.parseOpeningSignalFlexible(messageText, messageId, channelId, timestamp);
      }

      // Try to match closing signal
      if (messageText.includes('Закрытие:') || messageText.includes('Closing:')) {
        return this.parseClosingSignalFlexible(messageText, messageId, channelId, timestamp);
      }

      // Try to match partial close signal
      if (messageText.includes('Partial position close')) {
        return this.parsePartialSignalFlexible(messageText, messageId, channelId, timestamp);
      }

      // Try to match update signal
      if (messageText.includes('⚡ Update:')) {
        return this.parseUpdateSignalFlexible(messageText, messageId, channelId, timestamp);
      }

      // No match found - this is not a signal message
      return null;
    } catch (error) {
      logger.error('Error parsing message', {
        error: error instanceof Error ? error.message : String(error),
        messageText: messageText.substring(0, 200) + '...',
        messageId,
        channelId,
      });
      return null;
    }
  }



  private static parseOpeningSignalFlexible(
    messageText: string,
    messageId: number,
    channelId: number,
    timestamp: Date
  ): OpenSignal | null {
    try {
      // Extract action (LONG/SHORT)
      const actionMatch = messageText.match(/📢\s*Opening:\s*(LONG|SHORT)/);
      if (!actionMatch || !actionMatch[1]) return null;
      const action = actionMatch[1] as 'LONG' | 'SHORT';

      // Extract symbol
      const symbolMatch = messageText.match(/📉\s*Пара:\s*([A-Z]{2,12}\/USDT)/);
      if (!symbolMatch || !symbolMatch[1]) return null;
      const symbol = symbolMatch[1];

      // Extract price
      const priceMatch = messageText.match(/📊\s*Price:\s*`(\d+(?:\.\d+)?)`/);
      if (!priceMatch || !priceMatch[1]) return null;
      const price = parseFloat(priceMatch[1]);

      // Extract take profit
      const tpMatch = messageText.match(/🎯\s*Take profit:\s*`(\d+(?:\.\d+)?)`\s*\((-?\d+(?:\.\d+)?)%\)/);
      if (!tpMatch || !tpMatch[1] || !tpMatch[2]) return null;
      const tpPrice = parseFloat(tpMatch[1]);
      const tpPercent = parseFloat(tpMatch[2]);

      // Extract stop loss
      const slMatch = messageText.match(/🛡️\s*Stop loss:\s*`(\d+(?:\.\d+)?)`\s*\(([+-]?\d+(?:\.\d+)?)%\)/);
      if (!slMatch || !slMatch[1] || !slMatch[2]) return null;
      const slPrice = parseFloat(slMatch[1]);
      const slPercent = parseFloat(slMatch[2]);

      // Extract position size
      const sizeMatch = messageText.match(/💼\s*Position size:\s*`(\d+(?:\.\d+)?)`\s*USDT/);
      if (!sizeMatch || !sizeMatch[1]) return null;
      const sizeUsdt = parseFloat(sizeMatch[1]);

      // Extract entry time
      const timeMatch = messageText.match(/🕒\s*Entry time:\s*([\d\-:\sGMT\+]+)/);
      if (!timeMatch || !timeMatch[1]) return null;
      const entryTime = this.parseDateTime(timeMatch[1]);

      const messageHash = this.generateMessageHash(channelId, messageId, 'open');

      return {
        type: 'open',
        action,
        symbol,
        price,
        tpPrice,
        tpPercent,
        slPrice,
        slPercent,
        sizeUsdt,
        entryTime,
        messageId,
        channelId,
        messageHash,
        timestamp,
      };
    } catch (error) {
      logger.error('Error parsing opening signal flexibly', {
        error: error instanceof Error ? error.message : String(error),
        messageText: messageText.substring(0, 200) + '...',
        messageId,
        channelId,
      });
      return null;
    }
  }



  /**
   * Parse datetime string from Telegram message to Date object
   * Handles various formats like "2024-01-15 14:30:00 GMT+0"
   */
  private static parseDateTime(dateTimeStr: string): Date {
    try {
      // Remove GMT+0 and normalize
      const normalized = dateTimeStr.replace(/\s*GMT\+0\s*$/, '').trim();
      
      // Try parsing as ISO format first
      const isoDate = new Date(normalized);
      if (!isNaN(isoDate.getTime())) {
        return isoDate;
      }

      // Try parsing common formats
      const formats = [
        /(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/, // 2024-01-15 14:30:00
        /(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/, // 15-01-2024 14:30:00
        /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/, // 15/01/2024 14:30:00
      ];

      for (const format of formats) {
        const match = normalized.match(format);
        if (match) {
          const [, ...parts] = match;
          if (parts.length === 6) {
            const [year, month, day, hour, minute, second] = parts;
            return new Date(
              parseInt(year || '0'),
              parseInt(month || '1') - 1,
              parseInt(day || '1'),
              parseInt(hour || '0'),
              parseInt(minute || '0'),
              parseInt(second || '0')
            );
          }
        }
      }

      // Fallback to current time if parsing fails
      logger.warn('Failed to parse datetime', { dateTimeStr, normalized });
      return new Date();
    } catch (error) {
      logger.error('Error parsing datetime', { dateTimeStr, error });
      return new Date();
    }
  }

  /**
   * Generate unique message hash for idempotency
   */
  private static generateMessageHash(channelId: number, messageId: number, type: string): string {
    return `${channelId}-${messageId}-${type}`;
  }

  private static parseClosingSignalFlexible(
    messageText: string,
    messageId: number,
    channelId: number,
    timestamp: Date
  ): CloseSignal | null {
    try {
      // Extract reason
      const reasonMatch = messageText.match(/(?:❌|🔥|🔄)\s*Закрытие:\s*(Take profit achieved|Стоп лосс|Breakeven)/);
      if (!reasonMatch || !reasonMatch[1]) return null;
      const reason = reasonMatch[1] as 'Take profit achieved' | 'Stop loss' | 'Breakeven';

      // Extract symbol
      const symbolMatch = messageText.match(/💱\s*Пара:\s*([A-Z]{2,12}\/USDT)/);
      if (!symbolMatch || !symbolMatch[1]) return null;
      const symbol = symbolMatch[1];

      // Extract close price
      const priceMatch = messageText.match(/📊\s*Price:\s*`(\d+(?:\.\d+)?)`/);
      if (!priceMatch || !priceMatch[1]) return null;
      const closePrice = parseFloat(priceMatch[1]);

      // Extract close time
      const timeMatch = messageText.match(/🕒\s*Closing time:\s*([\d\-:\sGMT\+]+)/);
      if (!timeMatch || !timeMatch[1]) return null;
      const closeTime = this.parseDateTime(timeMatch[1]);

      const messageHash = this.generateMessageHash(channelId, messageId, 'close');

      return {
        type: 'close',
        reason,
        symbol,
        closePrice,
        closeTime,
        messageId,
        channelId,
        messageHash,
        timestamp,
      };
    } catch (error) {
      logger.error('Error parsing closing signal flexibly', {
        error: error instanceof Error ? error.message : String(error),
        messageText: messageText.substring(0, 200) + '...',
        messageId,
        channelId,
      });
      return null;
    }
  }

  private static parsePartialSignalFlexible(
    messageText: string,
    messageId: number,
    channelId: number,
    timestamp: Date
  ): PartialSignal | null {
    try {
      // Extract symbol
      const symbolMatch = messageText.match(/💱\s*Пара:\s*([A-Z]{2,12}\/USDT)/);
      if (!symbolMatch || !symbolMatch[1]) return null;
      const symbol = symbolMatch[1];

      // Extract partial close price
      const priceMatch = messageText.match(/📊\s*Partial close price:\s*`(\d+(?:\.\d+)?)`/);
      if (!priceMatch || !priceMatch[1]) return null;
      const partialPrice = parseFloat(priceMatch[1]);

      // Extract volume percentage
      const percentMatch = messageText.match(/📈\s*Volume:\s*(\d+(?:\.\d+)?)%\s*of the position/);
      if (!percentMatch || !percentMatch[1]) return null;
      const partialPercent = parseFloat(percentMatch[1]);

      // Extract time
      const timeMatch = messageText.match(/⏰\s*Time:\s*([\d\-:\sGMT\+]+)/);
      if (!timeMatch || !timeMatch[1]) return null;
      const partialTime = this.parseDateTime(timeMatch[1]);

      const messageHash = this.generateMessageHash(channelId, messageId, 'partial');

      return {
        type: 'partial',
        symbol,
        partialPrice,
        partialPercent,
        partialTime,
        messageId,
        channelId,
        messageHash,
        timestamp,
      };
    } catch (error) {
      logger.error('Error parsing partial signal flexibly', {
        error: error instanceof Error ? error.message : String(error),
        messageText: messageText.substring(0, 200) + '...',
        messageId,
        channelId,
      });
      return null;
    }
  }

  private static parseUpdateSignalFlexible(
    messageText: string,
    messageId: number,
    channelId: number,
    timestamp: Date
  ): UpdateSignal | null {
    try {
      // Extract symbol
      const symbolMatch = messageText.match(/💱\s*Пара:\s*([A-Z]{2,12}\/USDT)/);
      if (!symbolMatch || !symbolMatch[1]) return null;
      const symbol = symbolMatch[1];

      // Extract update type and price
      const updateMatch = messageText.match(/⚡\s*Update:\s*Move the stop loss to\s*(breakeven|(\d+(?:\.\d+)?))/);
      if (!updateMatch || !updateMatch[1]) return null;
      const updateType = updateMatch[1] === 'breakeven' ? 'breakeven' : 'explicit';
      const updatePrice = updateType === 'explicit' ? parseFloat(updateMatch[1]) : undefined;

      // Extract update time
      const timeMatch = messageText.match(/⏰\s*Update time:\s*([\d\-:\sGMT\+]+)/);
      if (!timeMatch || !timeMatch[1]) return null;
      const updateTime = this.parseDateTime(timeMatch[1]);

      const messageHash = this.generateMessageHash(channelId, messageId, 'update');

      const result: UpdateSignal = {
        type: 'update',
        symbol,
        updateType,
        updateTime,
        messageId,
        channelId,
        messageHash,
        timestamp,
      };

      if (updatePrice !== undefined) {
        result.updatePrice = updatePrice;
      }

      return result;
    } catch (error) {
      logger.error('Error parsing update signal flexibly', {
        error: error instanceof Error ? error.message : String(error),
        messageText: messageText.substring(0, 200) + '...',
        messageId,
        channelId,
      });
      return null;
    }
  }
}
