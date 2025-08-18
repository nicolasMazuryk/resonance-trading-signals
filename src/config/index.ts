import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface Config {
  telegram: {
    apiId: string;
    apiHash: string;
    session: string;
    botId: string;
  };
  exchange: {
    id: string;
    apiKey: string;
    apiSecret: string;
    defaultLeverage: number;
    orderSlippageTolerance: number;
  };
  maxSignalAgeMs: number;
  slack: {
    webhookUrl?: string;
  };
  nodeEnv: 'development' | 'production' | 'test';
}

// For testing, provide default values when environment variables are missing
const getConfig = (): Config => {
  const isTest = process.env['NODE_ENV'] === 'test';
  
  if (isTest) {
    return {
      telegram: {
        apiId: process.env['TELEGRAM_API_ID'] || 'test_api_id',
        apiHash: process.env['TELEGRAM_API_HASH'] || 'test_api_hash',
        session: process.env['TELEGRAM_SESSION'] || 'test_session',
        botId: process.env['TELEGRAM_BOT_ID'] || 'test_bot_id',
      },
      exchange: {
        id: process.env['EXCHANGE_ID'] || 'test_exchange',
        apiKey: process.env['EXCHANGE_API_KEY'] || 'test_api_key',
        apiSecret: process.env['EXCHANGE_API_SECRET'] || 'test_api_secret',
        defaultLeverage: parseInt(process.env['DEFAULT_LEVERAGE'] || '10'),
        orderSlippageTolerance: parseFloat(process.env['ORDER_SLIPPAGE_TOLERANCE'] || '0.2'),
      },
      maxSignalAgeMs: parseInt(process.env['MAX_SIGNAL_AGE_MS'] || '90000'),
      slack: {
        ...(process.env['SLACK_WEBHOOK_URL'] && { webhookUrl: process.env['SLACK_WEBHOOK_URL'] }),
      },
      nodeEnv: (process.env['NODE_ENV'] as Config['nodeEnv']) || 'production',
    };
  }

  return {
    telegram: {
      apiId: process.env['TELEGRAM_API_ID'] || '',
      apiHash: process.env['TELEGRAM_API_HASH'] || '',
      session: process.env['TELEGRAM_SESSION'] || '',
      botId: process.env['TELEGRAM_BOT_ID'] || '',
    },
    exchange: {
      id: process.env['EXCHANGE_ID'] || 'binanceusdm',
      apiKey: process.env['EXCHANGE_API_KEY'] || '',
      apiSecret: process.env['EXCHANGE_API_SECRET'] || '',
      defaultLeverage: parseInt(process.env['DEFAULT_LEVERAGE'] || '10'),
      orderSlippageTolerance: parseFloat(process.env['ORDER_SLIPPAGE_TOLERANCE'] || '0.2'),
    },
    maxSignalAgeMs: parseInt(process.env['MAX_SIGNAL_AGE_MS'] || '90000'),
          slack: {
        ...(process.env['SLACK_WEBHOOK_URL'] && { webhookUrl: process.env['SLACK_WEBHOOK_URL'] }),
      },
    nodeEnv: (process.env['NODE_ENV'] as Config['nodeEnv']) || 'production',
  };
};

export const config = getConfig();
