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
  entryTime: string;
}

export interface CloseSignal extends BaseSignal {
  type: 'close';
  reason: 'Take profit achieved' | 'Stop loss' | 'Breakeven';
  closePrice: number;
  closeTime: string;
}

export interface PartialSignal extends BaseSignal {
  type: 'partial';
  partialPrice: number;
  partialPercent: number;
  partialTime: string;
}

export interface UpdateSignal extends BaseSignal {
  type: 'update';
  updateType: 'breakeven' | 'explicit';
  updatePrice?: number;
  updateTime: string;
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
  tradingFee: number;
  createdAt: Date;
}

// New comprehensive analytics system
export interface PositionAnalytics {
  id: string;
  positionId: string;
  signalId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  
  // Signal vs Execution comparison
  signalEntryPrice: number;
  actualEntryPrice: number;
  entrySlippage: number; // in USDT
  entrySlippagePercent: number;
  entryFees: number;
  
  // Exit information (if position is closed)
  signalExitPrice?: number;
  actualExitPrice?: number;
  exitSlippage?: number; // in USDT
  exitSlippagePercent?: number;
  exitFees?: number;
  
  // Position performance
  totalFees: number;
  totalSlippage: number;
  realizedPnL: number;
  unrealizedPnL?: number;
  totalPnL: number; // realized + unrealized
  
  // Trade classification
  tradeResult: 'profitable' | 'breakeven' | 'loss' | 'none';
  profitPercent?: number;
  
  // Timing
  entryTime: Date;
  exitTime?: Date;
  durationMs?: number;
  
  // Execution quality
  entryExecutionDelayMs: number;
  exitExecutionDelayMs?: number;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface OverallAnalytics {
  id: string;
  period: 'daily' | 'weekly' | 'monthly' | 'all_time';
  startDate: Date;
  endDate: Date;
  
  // Signal counts
  totalSignals: number;
  openSignals: number;
  closedSignals: number;
  
  // Trade results
  profitableTrades: number;
  profitableTradesPercent: number;
  breakevenTrades: number;
  breakevenTradesPercent: number;
  lossTrades: number;
  lossTradesPercent: number;
  noneTrades: number;
  noneTradesPercent: number;
  
  // Financial metrics
  totalSlippage: number;
  totalFees: number;
  totalPnL: number;
  totalRealizedPnL: number;
  totalUnrealizedPnL: number;
  
  // Performance metrics
  averageSlippage: number;
  averageFees: number;
  averagePnL: number;
  winRate: number; // profitable trades / total trades
  
  // Execution quality
  averageExecutionDelayMs: number;
  averageEntrySlippagePercent: number;
  averageExitSlippagePercent: number;
  
  // Symbol breakdown
  symbolBreakdown: {
    [symbol: string]: {
      totalTrades: number;
      profitableTrades: number;
      totalPnL: number;
      totalSlippage: number;
      totalFees: number;
    };
  };
  
  createdAt: Date;
  updatedAt: Date;
}



export interface HealthStatus {
  database: boolean;
  telegram: boolean;
  exchange: boolean;
  timestamp: Date;
}

// New types for position tracking
export interface Position {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  sizeUsdt: number;
  remainingSizeUsdt: number; // After partial closes
  quantity: number;
  remainingQuantity: number; // After partial closes
  stopLossPrice: number;
  takeProfitPrice: number;
  status: 'open' | 'closed';
  entryTime: Date;
  closeTime?: Date;
  closePrice?: number;
  closeReason?: 'Take profit achieved' | 'Stop loss' | 'Breakeven';
  realizedPnL?: number;
  unrealizedPnL?: number;
  partialCloses: PartialClose[];
  breakevenPrice: number; // Calculated breakeven after partial closes
  fee?: number;
  exchangeOrderId?: string;
  // New fields for tracking stop-loss and take-profit orders
  stopLossOrderId?: string;
  takeProfitOrderId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PartialClose {
  id: string;
  positionId: string;
  closePrice: number;
  closeQuantity: number;
  closeSizeUsdt: number;
  closePercent: number; // e.g., 30%
  realizedPnL: number;
  closeTime: Date;
  fee?: number;
  exchangeOrderId?: string;
}

export interface PositionUpdate {
  id: string;
  positionId: string;
  updateType: 'stop_loss' | 'take_profit' | 'breakeven';
  oldValue: number;
  newValue: number;
  updateTime: Date;
}

// New type for tracking conditional orders
export interface ConditionalOrder {
  id: string;
  positionId: string;
  symbol: string;
  type: 'stop_loss' | 'take_profit';
  side: OrderSide;
  amount: number;
  price: number;
  status: 'pending' | 'filled' | 'cancelled' | 'failed';
  exchangeOrderId: string;
  createdAt: Date;
  updatedAt: Date;
}
