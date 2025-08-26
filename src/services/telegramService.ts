import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage } from 'telegram/events';
import { config } from '../config';
import { logger, serializeError, serializeObject } from '../utils/logger';
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
          const serializedErr = serializeError(err);
          logger.error('Telegram client error', { 
            error: serializedErr,
            errorType: typeof err,
            errorConstructor: err?.constructor?.name,
            hasError: !!err
          });
        },
      });

      this.isConnected = true;
      logger.info('Telegram client connected successfully');
      
      // Log session string for future use
      const sessionString = this.client.session.save();
      logger.info('Current session string', { sessionString });
      
    } catch (error) {
      logger.error('Failed to initialize Telegram client', { error: serializeError(error) });
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

    // Listen for new messages - we'll filter by event type in the handler
    try {
      this.client.addEventHandler(
        async (event: any) => {
          // Add immediate debugging to see if this handler is even being called
          logger.debug('Event handler called', { 
            eventType: event?.className,
            hasMessage: !!event?.message,
            eventKeys: event ? Object.keys(event).slice(0, 10) : [],
            timestamp: new Date().toISOString()
          });
          
          try {
            await this.handleNewMessage(event);
          } catch (error) {
            // Enhanced error logging for the main event handler
            const errorDetails = {
              errorMessage: error instanceof Error ? error.message : String(error),
              errorName: error instanceof Error ? error.name : 'Unknown',
              errorStack: error instanceof Error ? error.stack : 'No stack trace',
              errorType: typeof error,
              errorConstructor: error?.constructor?.name || 'Unknown',
              hasError: !!error,
              errorKeys: error && typeof error === 'object' ? Object.keys(error).slice(0, 10) : [],
              eventType: event?.className,
              eventKeys: event ? Object.keys(event).slice(0, 10) : [],
              timestamp: new Date().toISOString()
            };
            
            logger.error('Unhandled error in message handler', errorDetails);
            
            // Also try to serialize the error object for additional debugging
            try {
              const serializedError = serializeError(error);
              logger.error('Serialized error details', { serializedError });
            } catch (serializeErr) {
              logger.error('Failed to serialize error for debugging', { 
                serializeError: String(serializeErr) 
              });
            }
            
            // Don't re-throw to prevent the application from crashing
          }
        },
        new NewMessage({})
      );
      logger.info('Event handler registered successfully');
    } catch (handlerError) {
      const serializedHandlerError = serializeError(handlerError);
      logger.error('Failed to register event handler', { 
        error: serializedHandlerError,
        errorType: typeof handlerError,
        errorConstructor: handlerError?.constructor?.name
      });
      throw handlerError;
    }

    logger.info('Started listening for Telegram messages');
  }

  /**
   * Check if a message is from an allowed channel
   */
  private async isMessageFromAllowedChannel(message: any): Promise<boolean> {
    try {
      // If no filtering is configured, allow all messages
      if (!config.telegram.allowedChannels) {
        return true;
      }

      const chatId = message?.chatId;
      if (!chatId) {
        logger.debug('Message has no chatId, skipping', { messageId: message?.id });
        return false;
      }

      // First, try to check by username (primary method)
      if (config.telegram.allowedChannels.usernames?.length) {
        try {
          const chatEntity = await this.client.getEntity(chatId);
          if (chatEntity && 'username' in chatEntity && chatEntity.username) {
            const username = chatEntity.username;
            if (config.telegram.allowedChannels.usernames.includes(username)) {
              logger.debug('Message allowed by username', { username, chatId });
              return true;
            }
          }
        } catch (entityError) {
          logger.debug('Could not get chat entity for username check, falling back to chat ID', { 
            chatId, 
            error: serializeError(entityError) 
          });
        }
      }

      // Fallback: check by chat ID
      if (config.telegram.allowedChannels.chatIds?.length) {
        const chatIdStr = chatId.toString();
        if (config.telegram.allowedChannels.chatIds.includes(chatIdStr)) {
          logger.debug('Message allowed by chat ID (fallback)', { chatId: chatIdStr });
          return true;
        }
      }

      logger.debug('Message filtered out - not from allowed channel', { chatId });
      return false;
    } catch (error) {
      logger.error('Error checking if message is from allowed channel', { 
        error: serializeError(error), 
        chatId: message.chatId 
      });
      // If we can't verify, allow the message to be safe
      return true;
    }
  }

  /**
   * Handle incoming message
   */
  private async handleNewMessage(event: any): Promise<void> {
    try {
      // Defensive check for event
      if (!event) {
        logger.debug('Received null/undefined event');
        return;
      }

      // Only process NewMessage events
      if (event.className !== 'NewMessage' && event.constructor?.name !== 'NewMessageEvent') {
        // Only log non-message events occasionally to avoid spam
        if (Math.random() < 0.10) { // Log 10% of non-message events
          logger.debug('Skipping non-message event', { 
            eventType: event.className,
            eventData: serializeObject(event, 2) // Limit depth to avoid circular refs
          });
        }
        return;
      }

      const message = event.message;
      
      // Skip if no message object
      if (!message) {
        logger.debug('Skipping event without message object', { 
          eventType: event.className,
          eventKeys: Object.keys(event).slice(0, 10)
        });
        return;
      }
      
      // Skip messages without text
      if (!message.text) {
        logger.debug('Skipping message without text', { 
          messageId: message.id,
          chatId: message.chatId,
          messageKeys: Object.keys(message).slice(0, 10)
        });
        return;
      }

      const messageText = message.text;
      const messageId = message.id || 0;
      const chatId = message.chatId?.toString() || '0';
      const timestamp = message.date ? new Date(message.date * 1000) : new Date(); // Convert Unix timestamp to Date

      // Check if message is from allowed channel
      const isAllowed = await this.isMessageFromAllowedChannel(message);
      if (!isAllowed) {
        logger.debug('Message filtered out by channel check', { 
          messageId, 
          chatId,
          textPreview: messageText.substring(0, 50) + '...'
        });
        return;
      }
      
      logger.debug('Message passed channel filtering', { 
        messageId, 
        chatId,
        textPreview: messageText.substring(0, 50) + '...'
      });

      logger.info('Processing Telegram message', {
        messageId,
        chatId,
        timestamp,
        textLength: messageText.length,
        textPreview: messageText.substring(0, 100) + (messageText.length > 100 ? '...' : '')
      });

      // Try to parse as signal
      let signal: Signal | null = null;
      try {
        signal = SignalParser.parseMessage(
          messageText,
          messageId,
          parseInt(chatId),
          timestamp
        );
      } catch (parseError) {
        logger.error('Error parsing signal', { 
          error: serializeError(parseError),
          messageId,
          chatId,
          textPreview: messageText.substring(0, 200)
        });
        return;
      }

      if (signal) {
        logger.info('Signal parsed successfully', {
          messageId,
          chatId,
          signalType: signal.type,
          symbol: signal.symbol,
        });

        // Call the message handler
        if (this.messageHandler) {
          try {
            await this.messageHandler(signal);
          } catch (handlerError) {
            logger.error('Error in message handler callback', { 
              error: serializeError(handlerError),
              signalType: signal.type,
              symbol: signal.symbol
            });
            // Don't re-throw to prevent the application from crashing
          }
        }
      } else {
        logger.debug('Message is not a signal', { messageId, chatId });
      }
    } catch (error) {
      // Enhanced error logging with more details
      const errorDetails = {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorStack: error instanceof Error ? error.stack : 'No stack trace',
        errorType: typeof error,
        errorConstructor: error?.constructor?.name || 'Unknown',
        hasError: !!error,
        errorKeys: error && typeof error === 'object' ? Object.keys(error).slice(0, 10) : [],
        eventType: event?.className,
        eventKeys: event ? Object.keys(event).slice(0, 10) : [],
        timestamp: new Date().toISOString()
      };
      
      logger.error('Error handling Telegram message', errorDetails);
      
      // Also try to serialize the error object for additional debugging
      try {
        const serializedError = serializeError(error);
        const serializedEvent = serializeObject(event, 2);
        
        logger.error('Serialized error details', { 
          serializedError, 
          serializedEvent 
        });
      } catch (serializeErr) {
        logger.error('Failed to serialize error for debugging', { 
          serializeError: String(serializeErr) 
        });
      }
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
      logger.error('Failed to send Telegram message', { error: serializeError(error), chatId });
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
      logger.error('Failed to get chat info', { error: serializeError(error), chatId });
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
      logger.error('Failed to get recent messages', { error: serializeError(error), chatId });
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
      logger.error('Telegram health check failed', { error: serializeError(error) });
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
      logger.error('Error disconnecting Telegram client', { error: serializeError(error) });
    }
  }

  /**
   * Get current session string
   */
  getSessionString(): string {
    return this.client.session.save() as unknown as string;
  }

  /**
   * Get the Telegram client instance (for internal use)
   */
  getClient(): TelegramClient {
    return this.client;
  }
}
