import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { config } from '../config';
import { logger } from '../utils/logger';
import { SignalParser } from '../parsers/signalParser';
import { Signal } from '../types';

export class TelegramService {
  private client: TelegramClient;
  private isConnected = false;
  private messageHandler?: (signal: Signal) => void;

  constructor() {
    const session = new StringSession(config.telegram.session);
    
    this.client = new TelegramClient(
      session,
      parseInt(config.telegram.apiId),
      config.telegram.apiHash,
      {
        connectionRetries: 5,
        useWSS: false,
      }
    );

    logger.info('Telegram service initialized');
  }

  /**
   * Initialize and connect to Telegram
   */
  async initialize(): Promise<void> {
    try {
      await this.client.start({
        phoneNumber: async () => {
          throw new Error('Phone number authentication not supported - use session string');
        },
        password: async () => {
          throw new Error('Password authentication not supported - use session string');
        },
        phoneCode: async () => {
          throw new Error('Phone code authentication not supported - use session string');
        },
        onError: (err) => {
          logger.error('Telegram client error', { error: err });
        },
      });

      this.isConnected = true;
      logger.info('Telegram client connected successfully');
      
      // Log session string for future use
      const sessionString = this.client.session.save();
      logger.info('Current session string', { sessionString });
      
    } catch (error) {
      logger.error('Failed to initialize Telegram client', { error });
      throw error;
    }
  }

  /**
   * Start listening for messages
   */
  async startListening(messageHandler: (signal: Signal) => void): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Telegram client not connected');
    }

    this.messageHandler = messageHandler;

    // Listen for new messages
    this.client.addEventHandler(
      async (event: any) => {
        await this.handleNewMessage(event);
      }
    );

    logger.info('Started listening for Telegram messages');
  }

  /**
   * Handle incoming message
   */
  private async handleNewMessage(event: any): Promise<void> {
    try {
      const message = event.message;
      
      // Skip messages without text
      if (!message.text) {
        return;
      }

      // Skip messages from bots (optional - remove if you want to process bot messages)
    //   if (message.senderId && 'bot' in message.senderId) {
    //     return;
    //   }

      const messageText = message.text;
      const messageId = message.id;
      const chatId = message.chatId?.toString() || '0';
      const timestamp = new Date(message.date * 1000); // Convert Unix timestamp to Date

      logger.debug('Received Telegram message', {
        messageId,
        chatId,
        timestamp,
        textLength: messageText.length,
      });

      // Try to parse as signal
      const signal = SignalParser.parseMessage(
        messageText,
        messageId,
        parseInt(chatId),
        timestamp
      );

      if (signal) {
        logger.info('Signal parsed successfully', {
          messageId,
          chatId,
          signalType: signal.type,
          symbol: signal.symbol,
        });

        // Call the message handler
        if (this.messageHandler) {
          await this.messageHandler(signal);
        }
      } else {
        logger.debug('Message is not a signal', { messageId, chatId });
      }
    } catch (error) {
      logger.error('Error handling Telegram message', { error, event });
    }
  }

  /**
   * Send message to a chat
   */
  async sendMessage(chatId: string | number, text: string): Promise<void> {
    try {
      if (!this.isConnected) {
        throw new Error('Telegram client not connected');
      }

      await this.client.sendMessage(chatId, { message: text });
      logger.info('Message sent', { chatId, textLength: text.length });
    } catch (error) {
      logger.error('Failed to send Telegram message', { error, chatId });
      throw error;
    }
  }

  /**
   * Get chat information
   */
  async getChatInfo(chatId: string | number): Promise<any> {
    try {
      if (!this.isConnected) {
        throw new Error('Telegram client not connected');
      }

      const entity = await this.client.getEntity(chatId);
      return {
        id: entity.id,
        title: 'title' in entity ? entity.title : undefined,
        username: 'username' in entity ? entity.username : undefined,
        type: entity.className,
      };
    } catch (error) {
      logger.error('Failed to get chat info', { error, chatId });
      throw error;
    }
  }

  /**
   * Get recent messages from a chat
   */
  async getRecentMessages(chatId: string | number, limit = 100): Promise<any[]> {
    try {
      if (!this.isConnected) {
        throw new Error('Telegram client not connected');
      }

      const messages = await this.client.getMessages(chatId, { limit });
      
      return messages.map(msg => ({
        id: msg.id,
        text: msg.text,
        date: msg.date,
        senderId: msg.senderId,
      }));
    } catch (error) {
      logger.error('Failed to get recent messages', { error, chatId });
      throw error;
    }
  }

  /**
   * Check Telegram connectivity
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      // Try to get current user info as a connectivity test
      await this.client.getMe();
      return true;
    } catch (error) {
      logger.error('Telegram health check failed', { error });
      return false;
    }
  }

  /**
   * Disconnect from Telegram
   */
  async disconnect(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.client.disconnect();
        this.isConnected = false;
        logger.info('Telegram client disconnected');
      }
    } catch (error) {
      logger.error('Error disconnecting Telegram client', { error });
    }
  }

  /**
   * Get current session string
   */
  getSessionString(): string {
    return this.client.session.save() as unknown as string;
  }
}
