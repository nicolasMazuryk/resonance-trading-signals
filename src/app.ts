import { logger, serializeError, serializeObject } from './utils/logger';

import { FileStorage } from './services/fileStorage';
import { ExchangeService } from './services/exchangeService';
import { TelegramService } from './services/telegramService';
import { OrderExecutionService } from './services/orderExecutionService';
import { PositionService } from './services/positionService';
import { SlackService } from './services/slackService';
import { Signal } from './types';

export class TelegramSignalsExecutor {
  private fileStorage: FileStorage;
  private exchangeService: ExchangeService;
  private telegramService: TelegramService;
  private slackService: SlackService;
  private positionService: PositionService;
  private orderExecutionService: OrderExecutionService;
  private isRunning = false;

  constructor() {
    // Initialize services
    this.fileStorage = new FileStorage();
    this.exchangeService = new ExchangeService();
    this.telegramService = new TelegramService();
    this.slackService = new SlackService();
    this.positionService = new PositionService(this.fileStorage);
    this.orderExecutionService = new OrderExecutionService(
      this.exchangeService,
      this.fileStorage,
      this.slackService,
      this.positionService
    );

    logger.info('Telegram Signals Executor initialized');
  }

  /**
   * Start the application
   */
  async start(): Promise<void> {
    try {
      logger.info('Starting Telegram Signals Executor...');

      // Initialize exchange
      await this.exchangeService.initialize();
      logger.info('Exchange service initialized');

      // Initialize Telegram
      await this.telegramService.initialize();
      logger.info('Telegram service initialized');

      // Start listening for Telegram messages
      await this.telegramService.startListening(async (signal: Signal) => {
        await this.handleSignal(signal);
      });
      logger.info('Telegram message listener started');



      // No startup notification - only error alerts

      this.isRunning = true;
      logger.info('Telegram Signals Executor started successfully');

      // Setup graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      logger.error('Failed to start application', { error: serializeError(error) });
      
      await this.slackService.sendStartupFailureAlert(
        error instanceof Error ? error.message : String(error)
      );

      throw error;
    }
  }

  /**
   * Stop the application
   */
  async stop(): Promise<void> {
    try {
      logger.info('Stopping Telegram Signals Executor...');

      this.isRunning = false;



      // Disconnect Telegram
      await this.telegramService.disconnect();
      logger.info('Telegram service disconnected');

      // No shutdown notification - only error alerts

      logger.info('Telegram Signals Executor stopped successfully');
    } catch (error) {
      logger.error('Error stopping application', { error: serializeError(error) });
      throw error;
    }
  }

  /**
   * Handle incoming signal
   */
  private async handleSignal(signal: Signal): Promise<void> {
    try {
      logger.info('Processing signal', {
        type: signal.type,
        symbol: signal.symbol,
        messageHash: signal.messageHash,
      });

      await this.orderExecutionService.processSignal(signal);

      logger.info('Signal processed successfully', {
        type: signal.type,
        symbol: signal.symbol,
        messageHash: signal.messageHash,
      });
    } catch (error) {
      logger.error('Failed to handle signal', { error: serializeError(error), signal });
      
      await this.slackService.sendOrderFailureAlert(
        signal.symbol,
        signal.type,
        error instanceof Error ? error.message : String(error)
      );
    }
  }



  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown', { error: serializeError(error) });
        process.exit(1);
      }
    };

    // Handle SIGTERM and SIGINT
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      logger.error('Uncaught exception', { error: serializeError(error) });
      
      await this.slackService.sendUncaughtExceptionAlert(error);

      await this.stop();
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason, promise) => {
      logger.error('Unhandled promise rejection', { 
        reason: serializeError(reason), 
        promise: serializeObject(promise) 
      });
      
      await this.slackService.sendUnhandledRejectionAlert(reason);
    });

    logger.info('Graceful shutdown handlers configured');
  }

  /**
   * Get application status
   */
  async getStatus(): Promise<{
    isRunning: boolean;
    uptime: number;
    stats: {
      totalSignals: number;
      totalOrders: number;
      avgDeviation: number;
      avgDelay: number;
      successRate: number;
    };
  }> {
    const stats = this.fileStorage.getSummaryStats();
    
    return {
      isRunning: this.isRunning,
      uptime: process.uptime(),
      stats,
    };
  }
}
