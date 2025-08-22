import { SlackAlert } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';

export class SlackService {
  private webhookUrl: string | undefined;

  constructor() {
    this.webhookUrl = config.slack.webhookUrl;
    
    if (!this.webhookUrl) {
      logger.warn('Slack webhook URL not configured - error alerts will be logged only');
    } else {
      logger.info('Slack service initialized for error alerts');
    }
  }

  /**
   * Send error alert to Slack
   */
  async sendErrorAlert(_alert: SlackAlert): Promise<void> {
    return
    // try {
    //   if (!this.webhookUrl) {
    //     logger.error('Slack error alert (webhook not configured)', { alert });
    //     return;
    //   }

    //   const payload = {
    //     text: alert.text,
    //     attachments: alert.attachments,
    //     username: 'Telegram Signals Executor',
    //     icon_emoji: ':warning:',
    //   };

    //   const response = await fetch(this.webhookUrl, {
    //     method: 'POST',
    //     headers: {
    //       'Content-Type': 'application/json',
    //     },
    //     body: JSON.stringify(payload),
    //   });

    //   if (!response.ok) {
    //     throw new Error(`Slack API responded with status ${response.status}: ${response.statusText}`);
    //   }

    //   logger.info('Slack error alert sent', { alert });
    // } catch (error) {
    //   logger.error('Failed to send Slack error alert', { error: serializeError(error), alert });
    //   // Don't throw - we don't want Slack failures to break the main flow
    // }
  }

  /**
   * Send parsing failure alert
   */
  async sendParsingFailureAlert(
    messageText: string,
    messageId: number,
    channelId: number,
    error: string
  ): Promise<void> {
    await this.sendErrorAlert({
      text: '❌ Signal parsing failed',
      attachments: [{
        color: 'danger',
        fields: [
          { title: 'Message ID', value: messageId.toString(), short: true },
          { title: 'Channel ID', value: channelId.toString(), short: true },
          { title: 'Error', value: error, short: false },
          { title: 'Message Preview', value: messageText.substring(0, 200) + '...', short: false },
        ],
      }],
    });
  }

  /**
   * Send order failure alert
   */
  async sendOrderFailureAlert(
    symbol: string,
    signalType: string,
    error: string,
    signalDetails?: Record<string, any>
  ): Promise<void> {
    const fields = [
      { title: 'Symbol', value: symbol, short: true },
      { title: 'Signal Type', value: signalType, short: true },
      { title: 'Error', value: error, short: false },
    ];

    if (signalDetails) {
      Object.entries(signalDetails).forEach(([key, value]) => {
        fields.push({ title: key, value: String(value), short: true });
      });
    }

    await this.sendErrorAlert({
      text: '❌ Order execution failed',
      attachments: [{
        color: 'danger',
        fields,
      }],
    });
  }

  /**
   * Send high deviation alert
   */
  async sendHighDeviationAlert(
    symbol: string,
    deviationPercent: number,
    signalPrice: number,
    executionPrice: number,
    delayMs: number
  ): Promise<void> {
    await this.sendErrorAlert({
      text: '⚠️ High price deviation detected',
      attachments: [{
        color: 'warning',
        fields: [
          { title: 'Symbol', value: symbol, short: true },
          { title: 'Deviation %', value: deviationPercent.toFixed(2), short: true },
          { title: 'Signal Price', value: signalPrice.toString(), short: true },
          { title: 'Execution Price', value: executionPrice.toString(), short: true },
          { title: 'Delay (ms)', value: delayMs.toString(), short: true },
        ],
      }],
    });
  }

  /**
   * Send stale signal alert
   */
  async sendStaleSignalAlert(
    symbol: string,
    signalType: string,
    signalAge: number,
    maxAge: number
  ): Promise<void> {
    await this.sendErrorAlert({
      text: '⏰ Signal too old - skipping execution',
      attachments: [{
        color: 'warning',
        fields: [
          { title: 'Symbol', value: symbol, short: true },
          { title: 'Type', value: signalType, short: true },
          { title: 'Age (ms)', value: signalAge.toString(), short: true },
          { title: 'Max Age (ms)', value: maxAge.toString(), short: true },
        ],
      }],
    });
  }

  /**
   * Send application startup failure alert
   */
  async sendStartupFailureAlert(error: string): Promise<void> {
    await this.sendErrorAlert({
      text: '❌ Failed to start Telegram Signals Executor',
      attachments: [{
        color: 'danger',
        fields: [
          { title: 'Error', value: error, short: false },
        ],
      }],
    });
  }

  /**
   * Send uncaught exception alert
   */
  async sendUncaughtExceptionAlert(error: Error): Promise<void> {
    await this.sendErrorAlert({
      text: '💥 Uncaught exception - application will restart',
      attachments: [{
        color: 'danger',
        fields: [
          { title: 'Error', value: error.message, short: false },
          { title: 'Stack', value: error.stack || 'No stack trace', short: false },
        ],
      }],
    });
  }

  /**
   * Send unhandled promise rejection alert
   */
  async sendUnhandledRejectionAlert(reason: any): Promise<void> {
    await this.sendErrorAlert({
      text: '💥 Unhandled promise rejection',
      attachments: [{
        color: 'danger',
        fields: [
          { title: 'Reason', value: String(reason), short: false },
        ],
      }],
    });
  }
}
