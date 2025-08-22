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
      if (messageText.includes('📢 Opening:') || messageText.includes('Opening:')) {
        return this.parseOpeningSignal(messageText, messageId, channelId, timestamp);
      }

      // Try to match closing signal
      if (messageText.includes('Закрытие:') || messageText.includes('Closing:')) {
        return this.parseClosingSignal(messageText, messageId, channelId, timestamp);
      }

      // Try to match partial close signal
      if (messageText.includes('Partial position close')) {
        return this.parsePartialSignal(messageText, messageId, channelId, timestamp);
      }

      // Try to match update signal
      if (messageText.includes('⚡ Update:') || messageText.includes('Update:')) {
        return this.parseUpdateSignal(messageText, messageId, channelId, timestamp);
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

  private static parseOpeningSignal(
    messageText: string,
    messageId: number,
    channelId: number,
    timestamp: Date
  ): OpenSignal | null {
    try {
      // Extract action (LONG/SHORT) - handle both emoji and non-emoji formats
      const actionMatch = messageText.match(/(?:📢\s*)?Opening:\s*(LONG|SHORT)/i);
      if (!actionMatch || !actionMatch[1]) return null;
      const action = actionMatch[1].toUpperCase() as 'LONG' | 'SHORT';

      // Extract symbol - handle various formats (both emoji and non-emoji)
      const symbolMatch = messageText.match(/(?:📈|📉)?\s*Пара:\s*(?:`)?([A-Z0-9]{2,12}\/USDT)(?:`)?/i);
      if (!symbolMatch || !symbolMatch[1]) return null;
      const symbol = symbolMatch[1].toUpperCase();

      // Extract price - handle various formats including scientific notation
      const priceMatch = messageText.match(/(?:📊\s*)?Price:\s*(?:`)?([0-9]+(?:\.[0-9]+)?(?:e-[0-9]+)?)(?:`)?/);
      if (!priceMatch || !priceMatch[1]) return null;
      const price = parseFloat(priceMatch[1]);

      // Extract take profit - handle various formats
      const tpMatch = messageText.match(/(?:🎯\s*)?Take profit:\s*(?:`)?([0-9]+(?:\.[0-9]+)?(?:e-[0-9]+)?)(?:`)?\s*\(([+-]?\d+(?:\.\d+)?)%\)/);
      if (!tpMatch || !tpMatch[1] || !tpMatch[2]) return null;
      const tpPrice = parseFloat(tpMatch[1]);
      const tpPercent = parseFloat(tpMatch[2]);

      // Extract stop loss - handle various formats
      const slMatch = messageText.match(/(?:🛡️\s*)?Stop loss:\s*(?:`)?([0-9]+(?:\.[0-9]+)?(?:e-[0-9]+)?)(?:`)?\s*\(([+-]?\d+(?:\.\d+)?)%\)/);
      if (!slMatch || !slMatch[1] || !slMatch[2]) return null;
      const slPrice = parseFloat(slMatch[1]);
      const slPercent = parseFloat(slMatch[2]);

      // Extract position size
      const sizeMatch = messageText.match(/(?:💼\s*)?Position size:\s*(?:`)?([0-9]+(?:\.[0-9]+)?)(?:`)?\s*USDT/);
      if (!sizeMatch || !sizeMatch[1]) return null;
      const sizeUsdt = parseFloat(sizeMatch[1]);

      // Extract entry time
      const timeMatch = messageText.match(/(?:🕒\s*)?Entry time:\s*([\d\-:T\.Z\sGMT\+]+)/);
      if (!timeMatch || !timeMatch[1]) return null;
      const entryTime = this.convertToISOFormat(timeMatch[1].trim());

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
      logger.error('Error parsing opening signal', {
        error: error instanceof Error ? error.message : String(error),
        messageText: messageText.substring(0, 200) + '...',
        messageId,
        channelId,
      });
      return null;
    }
  }

  private static parseClosingSignal(
    messageText: string,
    messageId: number,
    channelId: number,
    timestamp: Date
  ): CloseSignal | null {
    try {
      // Extract reason - handle various formats and languages
      let reason: 'Take profit achieved' | 'Stop loss' | 'Breakeven';
      
      if (messageText.includes('🔥 Closing: Take profit achieved') || 
          messageText.includes('🎉 Congratulations on your profit') ||
          messageText.includes('Closing: Take profit achieved')) {
        reason = 'Take profit achieved';
      } else if (messageText.includes('❌ Закрытие: Стоп лосс') || 
                 messageText.includes('❌ Closing: Stop loss') ||
                 messageText.includes('Closing: Stop loss')) {
        reason = 'Stop loss';
      } else if (messageText.includes('🔄 Closing: Breakeven') || 
                 messageText.includes('🔄 Закрытие: Breakeven') ||
                 messageText.includes('Closing: Breakeven')) {
        reason = 'Breakeven';
      } else {
        // Try to match more flexible patterns
        const reasonMatch = messageText.match(/(?:❌|🔥|🔄)?\s*(?:Закрытие|Closing):\s*(Take profit achieved|Стоп лосс|Stop loss|Breakeven)/i);
        if (!reasonMatch || !reasonMatch[1]) return null;
        
        const reasonText = reasonMatch[1];
        if (reasonText.toLowerCase() === 'take profit achieved') {
          reason = 'Take profit achieved';
        } else if (reasonText.toLowerCase() === 'стоп лосс' || reasonText.toLowerCase() === 'stop loss') {
          reason = 'Stop loss';
        } else if (reasonText.toLowerCase() === 'breakeven') {
          reason = 'Breakeven';
        } else {
          return null;
        }
      }

      // Extract symbol
      const symbolMatch = messageText.match(/💱\s*Пара:\s*(?:`)?([A-Z0-9]{2,12}\/USDT)(?:`)?/i);
      if (!symbolMatch || !symbolMatch[1]) return null;
      const symbol = symbolMatch[1].toUpperCase();

      // Extract close price - handle various formats
      const priceMatch = messageText.match(/(?:📊\s*)?Price:\s*(?:`)?([0-9]+(?:\.[0-9]+)?(?:e-[0-9]+)?)(?:`)?/);
      if (!priceMatch || !priceMatch[1]) return null;
      const closePrice = parseFloat(priceMatch[1]);

      // Extract close time
      const timeMatch = messageText.match(/Closing time:\s*([\d\-\s:GMT\+]+)/);
      if (!timeMatch || !timeMatch[1]) return null;
      const closeTime = this.convertToISOFormat(timeMatch[1].trim());

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
      logger.error('Error parsing closing signal', {
        error: error instanceof Error ? error.message : String(error),
        messageText: messageText.substring(0, 200) + '...',
        messageId,
        channelId,
      });
      return null;
    }
  }

  private static parsePartialSignal(
    messageText: string,
    messageId: number,
    channelId: number,
    timestamp: Date
  ): PartialSignal | null {
    try {
      // Extract symbol
      const symbolMatch = messageText.match(/💱\s*Пара:\s*(?:`)?([A-Z0-9]{2,12}\/USDT)(?:`)?/i);
      if (!symbolMatch || !symbolMatch[1]) return null;
      const symbol = symbolMatch[1].toUpperCase();

      // Extract partial close price - handle various formats
      const priceMatch = messageText.match(/(?:📊\s*)?Partial close price:\s*(?:`)?([0-9]+(?:\.[0-9]+)?(?:e-[0-9]+)?)(?:`)?/);
      if (!priceMatch || !priceMatch[1]) return null;
      const partialPrice = parseFloat(priceMatch[1]);

      // Extract volume percentage
      const percentMatch = messageText.match(/(?:📈\s*)?Volume:\s*(\d+(?:\.\d+)?)%\s*of the position/);
      if (!percentMatch || !percentMatch[1]) return null;
      const partialPercent = parseFloat(percentMatch[1]);

      // Extract time
      const timeMatch = messageText.match(/(?:⏰\s*)?Time:\s*([\d\-:T\.Z\sGMT\+]+)/);
      if (!timeMatch || !timeMatch[1]) return null;
      const partialTime = this.convertToISOFormat(timeMatch[1].trim());

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
      logger.error('Error parsing partial signal', {
        error: error instanceof Error ? error.message : String(error),
        messageText: messageText.substring(0, 200) + '...',
        messageId,
        channelId,
      });
      return null;
    }
  }

  private static parseUpdateSignal(
    messageText: string,
    messageId: number,
    channelId: number,
    timestamp: Date
  ): UpdateSignal | null {
    try {
      // Extract symbol
      const symbolMatch = messageText.match(/💱\s*Пара:\s*(?:`)?([A-Z0-9]{2,12}\/USDT)(?:`)?/i);
      if (!symbolMatch || !symbolMatch[1]) return null;
      const symbol = symbolMatch[1].toUpperCase();

      // Extract update type - handle both breakeven and explicit price updates
      let updateType: 'breakeven' | 'explicit' = 'breakeven';
      let updatePrice: number | undefined = undefined;

      // Check for explicit price update
      const explicitPriceMatch = messageText.match(/Update:\s*Move the stop loss to\s*(\d+(?:\.\d+)?)/i);
      if (explicitPriceMatch && explicitPriceMatch[1]) {
        updateType = 'explicit';
        updatePrice = parseFloat(explicitPriceMatch[1]);
      }

      // Extract update time
      const timeMatch = messageText.match(/(?:⏰\s*)?Update time:\s*([\d\-:T\.Z\sGMT\+]+)/);
      if (!timeMatch || !timeMatch[1]) return null;
      const updateTime = this.convertToISOFormat(timeMatch[1].trim());

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
      logger.error('Error parsing update signal', {
        error: error instanceof Error ? error.message : String(error),
        messageText: messageText.substring(0, 200) + '...',
        messageId,
        channelId,
      });
      return null;
    }
  }

  /**
   * Convert time string from "2025-08-14 02:05:00 GMT+0" format to ISO format "2025-08-14T02:05:00.000Z"
   * The input time is already in GMT+0 timezone, so no timezone conversion is needed
   */
  private static convertToISOFormat(timeStr: string): string {
    try {
      // Remove GMT+0 and normalize
      const normalized = timeStr.replace(/\s*GMT\+0\s*$/, '').trim();
      
      // If it's already in ISO format, return as is
      if (timeStr.includes('T') && timeStr.includes('Z')) {
        return timeStr;
      }
      
      // Parse the date components manually to avoid timezone conversion
      // Expected format: "2025-08-14 02:05:00"
      const dateTimeMatch = normalized.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
      if (dateTimeMatch) {
        const [, year, month, day, hour, minute, second] = dateTimeMatch;
        // Create ISO string directly without timezone conversion
        return `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
      }
      
      // Fallback to Date parsing if manual parsing fails
      const date = new Date(normalized);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
      
      // If parsing fails, return the original string
      return timeStr;
    } catch (error) {
      logger.error('Error converting time format', { timeStr, error });
      return timeStr;
    }
  }

  /**
   * Generate unique message hash for idempotency
   */
  private static generateMessageHash(channelId: number, messageId: number, type: string): string {
    return `${channelId}-${messageId}-${type}`;
  }
}
