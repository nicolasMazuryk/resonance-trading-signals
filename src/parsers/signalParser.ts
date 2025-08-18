import { Signal, OpenSignal, CloseSignal, PartialSignal, UpdateSignal } from '../types';
import { logger } from '../utils/logger';

export class SignalParser {
  private static readonly OPENING_REGEX = /^Opening:\s*(?<action>LONG|SHORT)\s*[\r\n]+.*?Пара:\s*(?<symbol>[A-Z]{2,12}\/USDT)\s*[\r\n]+.*?Price:\s*(?<price>\d+(?:\.\d+)?)\s*[\r\n]+.*?Take profit:\s*(?<tp_price>\d+(?:\.\d+)?)\s*\((?<tp_percent>-?\d+(?:\.\d+)?)%\)\s*[\r\n]+.*?Stop loss:\s*(?<sl_price>\d+(?:\.\d+)?)\s*\((?<sl_percent>-?\d+(?:\.\d+)?)%\)\s*[\r\n]+.*?Position size:\s*(?<size_usdt>\d+(?:\.\d+)?)\s*USDT\s*[\r\n]+.*?Entry time:\s*(?<entry_time>[\d\-:\sGMT\+]+)/gmi;

  private static readonly CLOSING_REGEX = /^Closing:\s*(?<reason>Take profit achieved|Stop loss|Breakeven)\s*[\r\n]+.*?Пара:\s*(?<symbol>[A-Z]{2,12}\/USDT)\s*[\r\n]+.*?Price:\s*(?<close_price>\d+(?:\.\d+)?)\s*[\r\n]+.*?Closing time:\s*(?<close_time>[\d\-:\sGMT\+]+)/gmi;

  private static readonly PARTIAL_REGEX = /^Partial position close\s*[\r\n]+.*?Пара:\s*(?<symbol>[A-Z]{2,12}\/USDT)\s*[\r\n]+.*?Partial close price:\s*(?<partial_price>\d+(?:\.\d+)?)\s*[\r\n]+.*?Volume:\s*(?<partial_percent>\d+(?:\.\d+)?)%\s*of the position\s*[\r\n]+.*?Time:\s*(?<partial_time>[\d\-:\sGMT\+]+)/gmi;

  private static readonly UPDATE_REGEX = /^Update:\s*Move the stop loss to\s*(?<update_type>breakeven|(?<update_price>\d+(?:\.\d+)?))\s*[\r\n]+.*?Пара:\s*(?<symbol>[A-Z]{2,12}\/USDT)\s*[\r\n]+.*?Update time:\s*(?<update_time>[\d\-:\sGMT\+]+)/gmi;

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
      // Reset regex lastIndex to ensure proper matching
      this.OPENING_REGEX.lastIndex = 0;
      this.CLOSING_REGEX.lastIndex = 0;
      this.PARTIAL_REGEX.lastIndex = 0;
      this.UPDATE_REGEX.lastIndex = 0;

      // Try to match opening signal
      const openingMatch = this.OPENING_REGEX.exec(messageText);
      if (openingMatch?.groups) {
        return this.parseOpeningSignal(openingMatch.groups, messageId, channelId, timestamp);
      }

      // Try to match closing signal
      const closingMatch = this.CLOSING_REGEX.exec(messageText);
      if (closingMatch?.groups) {
        return this.parseClosingSignal(closingMatch.groups, messageId, channelId, timestamp);
      }

      // Try to match partial close signal
      const partialMatch = this.PARTIAL_REGEX.exec(messageText);
      if (partialMatch?.groups) {
        return this.parsePartialSignal(partialMatch.groups, messageId, channelId, timestamp);
      }

      // Try to match update signal
      const updateMatch = this.UPDATE_REGEX.exec(messageText);
      if (updateMatch?.groups) {
        return this.parseUpdateSignal(updateMatch.groups, messageId, channelId, timestamp);
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
    groups: Record<string, string>,
    messageId: number,
    channelId: number,
    timestamp: Date
  ): OpenSignal {
    const messageHash = this.generateMessageHash(channelId, messageId, 'open');

    return {
      type: 'open',
      action: (groups['action'] || '').toUpperCase() as 'LONG' | 'SHORT',
      symbol: groups['symbol'] || '',
      price: parseFloat(groups['price'] || '0'),
      tpPrice: parseFloat(groups['tp_price'] || '0'),
      tpPercent: parseFloat(groups['tp_percent'] || '0'),
      slPrice: parseFloat(groups['sl_price'] || '0'),
      slPercent: parseFloat(groups['sl_percent'] || '0'),
      sizeUsdt: parseFloat(groups['size_usdt'] || '0'),
      entryTime: this.parseDateTime(groups['entry_time'] || ''),
      messageId,
      channelId,
      messageHash,
      timestamp,
    };
  }

  private static parseClosingSignal(
    groups: Record<string, string>,
    messageId: number,
    channelId: number,
    timestamp: Date
  ): CloseSignal {
    const messageHash = this.generateMessageHash(channelId, messageId, 'close');

    return {
      type: 'close',
      reason: (groups['reason'] || '') as 'Take profit achieved' | 'Stop loss' | 'Breakeven',
      symbol: groups['symbol'] || '',
      closePrice: parseFloat(groups['close_price'] || '0'),
      closeTime: this.parseDateTime(groups['close_time'] || ''),
      messageId,
      channelId,
      messageHash,
      timestamp,
    };
  }

  private static parsePartialSignal(
    groups: Record<string, string>,
    messageId: number,
    channelId: number,
    timestamp: Date
  ): PartialSignal {
    const messageHash = this.generateMessageHash(channelId, messageId, 'partial');

    return {
      type: 'partial',
      symbol: groups['symbol'] || '',
      partialPrice: parseFloat(groups['partial_price'] || '0'),
      partialPercent: parseFloat(groups['partial_percent'] || '0'),
      partialTime: this.parseDateTime(groups['partial_time'] || ''),
      messageId,
      channelId,
      messageHash,
      timestamp,
    };
  }

  private static parseUpdateSignal(
    groups: Record<string, string>,
    messageId: number,
    channelId: number,
    timestamp: Date
  ): UpdateSignal {
    const messageHash = this.generateMessageHash(channelId, messageId, 'update');

    // Safely parse update price with validation
    let updatePrice: number | undefined;
    if (groups['update_price']) {
      const parsed = parseFloat(groups['update_price']);
      if (!isNaN(parsed)) {
        updatePrice = parsed;
      } else {
        logger.warn('Invalid update price value', { 
          updatePrice: groups['update_price'],
          messageId,
          channelId 
        });
      }
    }

    const result: UpdateSignal = {
      type: 'update' as const,
      symbol: groups['symbol'] || '',
      updateType: groups['update_type'] === 'breakeven' ? 'breakeven' : 'explicit',
      updateTime: this.parseDateTime(groups['update_time'] || ''),
      messageId,
      channelId,
      messageHash,
      timestamp,
    };

    // Only add updatePrice if it's defined
    if (updatePrice !== undefined) {
      result.updatePrice = updatePrice;
    }

    return result;
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
}
