#!/usr/bin/env ts-node

import { Command } from 'commander';
import { TelegramService } from '../src/services/telegramService';
import { SignalParser } from '../src/parsers/signalParser';
import { Signal } from '../src/types';
import { logger } from '../src/utils/logger';
import { TelegramSignalsExecutor } from '../src/app';

interface ReplayConfig {
  botUsername: string;
  startDate: Date;
  endDate?: Date | undefined;
  intervalMs: number;
  maxSignals: number;
}

class SimpleReplayWorkflow {
  private telegramService: TelegramService;
  private app: TelegramSignalsExecutor;
  private signalCount = 0;
  private messages: Array<{
    id: number;
    text: string;
    date: Date;
    chatId: number;
  }> = [];

  constructor() {
    this.telegramService = new TelegramService();
    this.app = new TelegramSignalsExecutor();
  }

  /**
   * Initialize services
   */
  async initialize(): Promise<void> {
    try {
      await this.telegramService.initialize();
      await this.app.start();
      logger.info('Replay workflow initialized with full app integration');
    } catch (error) {
      logger.error('Failed to initialize replay workflow', { error });
      throw error;
    }
  }

  /**
   * Retrieve historical messages from Telegram bot
   */
  async retrieveMessages(config: ReplayConfig): Promise<void> {
    try {
      logger.info('Retrieving historical messages', {
        botUsername: config.botUsername,
        startDate: config.startDate.toISOString(),
        endDate: config.endDate?.toISOString()
      });

      // Get chat entity by username
      const chatEntity = await this.telegramService.getClient().getEntity(config.botUsername);
      const chatId = chatEntity.id;

      logger.info('Found chat entity', { chatId, username: config.botUsername });

      // Get messages in batches
      const allMessages: typeof this.messages = [];
      let offsetId = 0;
      const batchSize = 100;
      let hasMore = true;

      while (hasMore) {
        logger.info('Fetching message batch', { offsetId, batchSize });

        const messages = await this.telegramService.getClient().getMessages(chatId, {
          limit: batchSize,
          ...(offsetId > 0 && { offsetId }),
        });

        if (messages.length === 0) {
          hasMore = false;
          break;
        }

        // Filter messages by date and convert to our format
        const filteredMessages = messages
          .filter(msg => {
            if (!msg.text || !msg.date) return false;
            
            const messageDate = new Date(msg.date * 1000);
            const isAfterStart = messageDate >= config.startDate;
            const isBeforeEnd = !config.endDate || messageDate <= config.endDate;
            
            return isAfterStart && isBeforeEnd;
          })
          .map(msg => ({
            id: msg.id,
            text: msg.text,
            date: new Date(msg.date * 1000),
            chatId: Number(chatId)
          }));

        allMessages.push(...filteredMessages);

        // Update offset for next batch
        offsetId = messages[messages.length - 1]?.id || 0;

        // Check if we've reached messages before our start date
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.date) {
          const lastMessageDate = new Date(lastMessage.date * 1000);
          if (lastMessageDate < config.startDate) {
            hasMore = false;
          }
        }

        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Sort messages chronologically (oldest first)
      allMessages.sort((a, b) => a.date.getTime() - b.date.getTime());

      this.messages = allMessages;

      logger.info('Historical messages retrieved', {
        totalMessages: this.messages.length,
        dateRange: {
          first: this.messages[0]?.date.toISOString(),
          last: this.messages[this.messages.length - 1]?.date.toISOString()
        }
      });

    // -------------------------
    // Save all retrieved messages to a JSON file for inspection/debugging
    const fs = require('fs');
    const path = require('path');
    const outputDir = path.resolve(process.cwd(), 'data');
    const outputFile = path.join(outputDir, 'historical-messages.json');

    // Ensure the data directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write messages to file (convert Date objects to ISO strings)
    fs.writeFileSync(
      outputFile,
      JSON.stringify(
        this.messages.map(msg => ({
          ...msg,
          date: msg.date instanceof Date ? msg.date.toISOString() : msg.date
        })),
        null,
        2
      ),
      'utf-8'
    );

    logger.info('Saved all historical messages to JSON file', { file: outputFile });
    // -------------------------
    } catch (error) {
      logger.error('Failed to retrieve historical messages', { error });
      throw error;
    }
  }

  /**
   * Replay messages with fixed interval
   */
  async replayMessages(config: ReplayConfig): Promise<void> {
    if (this.messages.length === 0) {
      throw new Error('No messages to replay. Retrieve messages first.');
    }

    logger.info('Starting message replay', {
      totalMessages: this.messages.length,
      config: {
        intervalMs: config.intervalMs,
        maxSignals: config.maxSignals
      }
    });

    console.log(`🚀 Starting replay of ${this.messages.length} messages...`);
    console.log(`⏱️  Interval: ${config.intervalMs}ms between messages, Max Signals: ${config.maxSignals}`);

    // Replay messages with fixed interval
    for (let i = 0; i < this.messages.length; i++) {
      const message = this.messages[i];

      // Check if we've reached the signal limit before processing
      if (config.maxSignals && this.signalCount >= config.maxSignals) {
        logger.info(`Reached maximum signal limit (${config.maxSignals}), stopping replay`);
        break;
      }

      // Process the message
      if (message) {
        await this.processMessage(message, config, i + 1, this.messages.length);
      }

      // Wait for the specified interval (except for the last message)
      if (i < this.messages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, config.intervalMs));
      }
    }

    logger.info('Message replay completed', {
      totalReplayed: this.signalCount
    });
  }

  /**
   * Process a single message through the full application
   */
  private async processMessage(
    message: typeof this.messages[0],
    _config: ReplayConfig,
    currentIndex: number,
    totalCount: number
  ): Promise<void> {
    try {
      logger.info(`Processing message ${currentIndex}/${totalCount}`, {
        messageId: message.id,
        originalDate: message.date.toISOString(),
        replayDate: new Date().toISOString(),
        textPreview: message.text
      });

      // Try to parse as signal
      let signal: Signal | null = null;
      try {
        signal = SignalParser.parseMessage(
          message.text,
          message.id,
          message.chatId,
          message.date
        );
      } catch (parseError) {
        logger.debug('Message is not a signal', { 
          messageId: message.id,
          parseError: parseError instanceof Error ? parseError.message : String(parseError)
        });
        return;
      }

      if (signal) {
        this.signalCount++;
        
        logger.info(`Signal ${this.signalCount} parsed and executing`, {
          messageId: message.id,
          signalType: signal.type,
          symbol: signal.symbol
        });

        // Process the signal through the full application (including order execution)
        await this.app['handleSignal'](signal);
        
        console.log(`📡 Signal ${this.signalCount}: ${signal.type} ${signal.symbol} - EXECUTED`);
        if ('action' in signal) {
          console.log(`   Action: ${signal.action}, Price: ${signal.price}`);
        }
      }
    } catch (error) {
      logger.error('Error processing message', { 
        error, 
        messageId: message.id,
        currentIndex,
        totalCount
      });
    }
  }





  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      await this.app.stop();
      await this.telegramService.disconnect();
      logger.info('Replay workflow cleaned up');
    } catch (error) {
      logger.error('Error during cleanup', { error });
    }
  }
}

// CLI Commands
const program = new Command();
const replayWorkflow = new SimpleReplayWorkflow();

program
  .name('replay-workflow')
  .description('Retrieve and replay historical messages with full end-to-end execution')
  .version('1.0.0');

program
  .command('start')
  .description('Start the complete replay workflow')
  .requiredOption('-b, --bot <username>', 'Bot username (e.g., your_signal_bot)')
  .requiredOption('-s, --start-date <date>', 'Start date (YYYY-MM-DD)')
  .option('-e, --end-date <date>', 'End date (YYYY-MM-DD)')
  .option('--interval <ms>', 'Interval between messages in milliseconds', '5000')
  .option('--max-signals <number>', 'Maximum number of signals to process')
  .action(async (options) => {
    try {
      await replayWorkflow.initialize();
      
      const config: ReplayConfig = {
        botUsername: options.bot,
        startDate: new Date(options.startDate),
        endDate: options.endDate ? new Date(options.endDate) : undefined,
        intervalMs: parseInt(options.interval),
        maxSignals: options.maxSignals ? parseInt(options.maxSignals) : 0
      };
      
      console.log('📥 Step 1: Retrieving historical messages...');
      await replayWorkflow.retrieveMessages(config);
      
      console.log('🚀 Step 2: Starting replay with full end-to-end execution...');
      console.log('Press Ctrl+C to stop replay');
      
      // Set up signal handler for graceful shutdown
      process.on('SIGINT', async () => {
        console.log('\n⏹️  Stopping replay...');
        await replayWorkflow.cleanup();
        process.exit(0);
      });
      
      await replayWorkflow.replayMessages(config);
      
      console.log('\n✅ Replay completed successfully!');
      
      await replayWorkflow.cleanup();
      
    } catch (error) {
      console.error('❌ Replay workflow failed:', error);
      await replayWorkflow.cleanup();
      process.exit(1);
    }
  });

program.parse();
