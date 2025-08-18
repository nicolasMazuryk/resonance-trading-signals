export type SignalType = 'open' | 'close' | 'partial' | 'update';

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'limit' | 'market';

export interface BaseSignal {
  type: SignalType;
  symbol: string;
  timestamp: Date;
  messageId: number;
  channelId: number;
  messageHash: string;
}

export interface OpenSignal extends BaseSignal {
  type: 'open';
  action: 'LONG' | 'SHORT';
  price: number;
  tpPrice: number;
  tpPercent: number;
  slPrice: number;
  slPercent: number;
  sizeUsdt: number;
  entryTime: Date;
}

export interface CloseSignal extends BaseSignal {
  type: 'close';
  reason: 'Take profit achieved' | 'Stop loss' | 'Breakeven';
  closePrice: number;
  closeTime: Date;
}

export interface PartialSignal extends BaseSignal {
  type: 'partial';
  partialPrice: number;
  partialPercent: number;
  partialTime: Date;
}

export interface UpdateSignal extends BaseSignal {
  type: 'update';
  updateType: 'breakeven' | 'explicit';
  updatePrice?: number;
  updateTime: Date;
}

export type Signal = OpenSignal | CloseSignal | PartialSignal | UpdateSignal;

export interface Order {
  id: string;
  signalId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  amount: number;
  price: number;
  status: 'pending' | 'filled' | 'cancelled' | 'failed';
  exchangeOrderId?: string;
  filledAmount?: number;
  filledPrice?: number;
  fee?: number;
  createdAt: Date;
  updatedAt: Date;
  errorMessage?: string;
}

export interface Analytics {
  id: string;
  signalId: string;
  orderId: string;
  symbol: string;
  signalType: SignalType;
  signalPrice: number;
  executionPrice: number;
  priceDeviationPercent: number;
  executionDelayMs: number;
  slippageUsdt: number;
  createdAt: Date;
}

export interface SlackAlert {
  text: string;
  attachments?: Array<{
    color: string;
    fields: Array<{
      title: string;
      value: string;
      short: boolean;
    }>;
  }>;
}

export interface HealthStatus {
  database: boolean;
  telegram: boolean;
  exchange: boolean;
  timestamp: Date;
}
