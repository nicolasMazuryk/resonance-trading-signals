#!/usr/bin/env ts-node

import { Command } from 'commander';
import { TelegramService } from '../src/services/telegramService';
import { SignalParser } from '../src/parsers/signalParser';
import { Signal } from '../src/types';
import { logger } from '../src/utils/logger';
import { TelegramSignalsExecutor } from '../src/app';
import * as fs from 'fs';
import * as path from 'path';

interface ReplayConfig {
  botUsername?: string;
  startDate: Date;
  endDate?: Date | undefined;
  intervalMs: number;
  maxSignals: number;
  source: 'telegram' | 'json';
  jsonFilePath?: string;
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
      if (this.app) {
        await this.app.start();
      }
      logger.info('Replay workflow initialized with full app integration');
    } catch (error) {
      logger.error('Failed to initialize replay workflow', { error });
      throw error;
    }
  }

  /**
   * Retrieve historical messages from Telegram bot
   */
  async retrieveMessagesFromTelegram(config: ReplayConfig): Promise<void> {
    if (!config.botUsername) {
      throw new Error('Bot username is required when using Telegram source');
    }

    try {
      await this.telegramService.initialize();
      
      logger.info('Retrieving historical messages from Telegram', {
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

      logger.info('Historical messages retrieved from Telegram', {
        totalMessages: this.messages.length,
        dateRange: {
          first: this.messages[0]?.date.toISOString(),
          last: this.messages[this.messages.length - 1]?.date.toISOString()
        }
      });
    } catch (error) {
      logger.error('Failed to retrieve historical messages from Telegram', { error });
      throw error;
    }
  }

  /**
   * Retrieve historical messages from JSON file
   */
  async retrieveMessagesFromJson(config: ReplayConfig): Promise<void> {
    if (!config.jsonFilePath) {
      throw new Error('JSON file path is required when using JSON source');
    }

    try {
      logger.info('Retrieving historical messages from JSON file', {
        filePath: config.jsonFilePath,
        startDate: config.startDate.toISOString(),
        endDate: config.endDate?.toISOString()
      });

      // Read and parse JSON file
      const filePath = path.resolve(config.jsonFilePath);
      if (!fs.existsSync(filePath)) {
        throw new Error(`JSON file not found: ${filePath}`);
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const jsonData = JSON.parse(fileContent);

      if (!Array.isArray(jsonData)) {
        throw new Error('JSON file must contain an array of messages');
      }

      // Convert JSON data to our message format and filter by date
      const filteredMessages = jsonData
        .filter((item: any) => {
          if (!item.text || !item.date) return false;
          
          const messageDate = new Date(item.date);
          const isAfterStart = messageDate >= config.startDate;
          const isBeforeEnd = !config.endDate || messageDate <= config.endDate;
          
          return isAfterStart && isBeforeEnd;
        })
        .map((item: any) => ({
          id: item.id || Math.floor(Math.random() * 1000000), // Generate ID if not present
          text: item.text,
          date: new Date(item.date),
          chatId: item.chatId || REDACTED // Default chat ID if not present
        }));

      // Sort messages chronologically (oldest first)
      filteredMessages.sort((a, b) => a.date.getTime() - b.date.getTime());

      this.messages = filteredMessages;

      logger.info('Historical messages retrieved from JSON file', {
        totalMessages: this.messages.length,
        dateRange: {
          first: this.messages[0]?.date.toISOString(),
          last: this.messages[this.messages.length - 1]?.date.toISOString()
        }
      });
    } catch (error) {
      logger.error('Failed to retrieve historical messages from JSON file', { error });
      throw error;
    }
  }

  /**
   * Retrieve messages based on source type
   */
  async retrieveMessages(config: ReplayConfig): Promise<void> {
    if (config.source === 'telegram') {
      await this.retrieveMessagesFromTelegram(config);
    } else if (config.source === 'json') {
      await this.retrieveMessagesFromJson(config);
    } else {
      throw new Error(`Invalid source: ${config.source}. Must be 'telegram' or 'json'`);
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
      if (this.app) {
        await this.app.stop();
      }
      if (this.telegramService) {
        await this.telegramService.disconnect();
      }
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
  .option('-b, --bot <username>', 'Bot username (e.g., your_signal_bot) - required when source is telegram')
  .requiredOption('-s, --start-date <date>', 'Start date (YYYY-MM-DD)')
  .option('-e, --end-date <date>', 'End date (YYYY-MM-DD)')
  .option('--interval <ms>', 'Interval between messages in milliseconds', '5000')
  .option('--max-signals <number>', 'Maximum number of signals to process')
  .option('--source <type>', 'Source of historical messages (telegram or json)', 'telegram')
  .option('--json-file <path>', 'Path to a JSON file containing historical messages - required when source is json')
  .action(async (options) => {
    try {
      // Validate options based on source
      if (options.source === 'telegram' && !options.bot) {
        console.error('❌ Error: Bot username (-b, --bot) is required when source is telegram');
        process.exit(1);
      }
      
      if (options.source === 'json' && !options.jsonFile) {
        console.error('❌ Error: JSON file path (--json-file) is required when source is json');
        process.exit(1);
      }

      await replayWorkflow.initialize();
      
      const config: ReplayConfig = {
        botUsername: options.bot,
        startDate: new Date(options.startDate),
        endDate: options.endDate ? new Date(options.endDate) : undefined,
        intervalMs: parseInt(options.interval),
        maxSignals: options.maxSignals ? parseInt(options.maxSignals) : 0,
        source: options.source as 'telegram' | 'json',
        jsonFilePath: options.jsonFile
      };
      
      console.log(`📥 Step 1: Retrieving historical messages from ${options.source}...`);
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
