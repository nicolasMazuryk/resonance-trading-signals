import { Position, PartialClose, PositionUpdate, OpenSignal, PartialSignal, UpdateSignal, CloseSignal } from '../types';
import { FileStorage } from './fileStorage';
import { logger } from '../utils/logger';

export class PositionService {
  constructor(private fileStorage: FileStorage) {}

  // Create new position from opening signal
  createPosition(signal: OpenSignal): Position {
    const position: Position = {
      id: `pos_${signal.messageHash}`,
      symbol: signal.symbol,
      side: signal.action,
      entryPrice: signal.price,
      currentPrice: signal.price,
      sizeUsdt: signal.sizeUsdt,
      remainingSizeUsdt: signal.sizeUsdt,
      quantity: signal.sizeUsdt / signal.price,
      remainingQuantity: signal.sizeUsdt / signal.price,
      stopLossPrice: signal.slPrice,
      takeProfitPrice: signal.tpPrice,
      status: 'open',
      entryTime: new Date(signal.entryTime),
      partialCloses: [],
      breakevenPrice: signal.price, // Initial breakeven is entry price
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.fileStorage.savePosition(position);
    logger.info('Position created', { positionId: position.id, symbol: signal.symbol });
    return position;
  }

  // Handle partial position close
  handlePartialClose(signal: PartialSignal): Position {
    const position = this.fileStorage.getOpenPosition(signal.symbol);
    if (!position) {
      throw new Error(`No open position found for ${signal.symbol}`);
    }

    const closePercent = signal.partialPercent / 100; // e.g., 0.30 for 30%
    const closeQuantity = position.remainingQuantity * closePercent;
    const closeSizeUsdt = position.remainingSizeUsdt * closePercent;
    
    // Calculate realized PnL for this partial close
    const realizedPnL = this.calculatePartialPnL(position, signal.partialPrice, closeQuantity);

    const partialClose: PartialClose = {
      id: `partial_${signal.messageHash}`,
      positionId: position.id,
      closePrice: signal.partialPrice,
      closeQuantity,
      closeSizeUsdt,
      closePercent: signal.partialPercent,
      realizedPnL,
      closeTime: new Date(signal.partialTime)
    };

    // Update position
    position.remainingQuantity -= closeQuantity;
    position.remainingSizeUsdt -= closeSizeUsdt;
    position.partialCloses.push(partialClose);
    
    // Recalculate breakeven price after partial close
    position.breakevenPrice = this.calculateBreakevenPrice(position);
    
    position.updatedAt = new Date();

    this.fileStorage.savePartialClose(partialClose);
    this.fileStorage.updatePosition(position.id, position);
    
    logger.info('Partial close processed', { 
      positionId: position.id, 
      closePercent: signal.partialPercent,
      realizedPnL,
      newBreakeven: position.breakevenPrice 
    });
    
    return position;
  }

  // Calculate breakeven price after partial closes
  private calculateBreakevenPrice(position: Position): number {
    if (position.partialCloses.length === 0) {
      return position.entryPrice;
    }

    // Calculate total realized profit/loss from partial closes
    let totalRealizedPnL = 0;
    let totalClosedQuantity = 0;

    for (const partialClose of position.partialCloses) {
      totalRealizedPnL += partialClose.realizedPnL;
      totalClosedQuantity += partialClose.closeQuantity;
    }

    const remainingQuantity = position.remainingQuantity;
    
    if (remainingQuantity <= 0) {
      return position.entryPrice; // Position fully closed
    }

    // Correct breakeven calculation based on position direction:
    // For LONG positions: Entry Price - (Total Realized PnL / Remaining Quantity)
    // For SHORT positions: Entry Price + (Total Realized PnL / Remaining Quantity)
    let breakevenPrice: number;
    
    if (position.side === 'LONG') {
      // For LONG: if we made profit, breakeven is below entry (can afford to lose profit)
      // If we made loss, breakeven is above entry (need to make up loss)
      breakevenPrice = position.entryPrice - (totalRealizedPnL / remainingQuantity);
    } else {
      // For SHORT: if we made profit, breakeven is above entry (can afford to lose profit)
      // If we made loss, breakeven is below entry (need to make up loss)
      breakevenPrice = position.entryPrice + (totalRealizedPnL / remainingQuantity);
    }
    
    return breakevenPrice;
  }

  // Handle stop-loss update to breakeven
  handleStopLossUpdate(signal: UpdateSignal): Position {
    const position = this.fileStorage.getOpenPosition(signal.symbol);
    if (!position) {
      throw new Error(`No open position found for ${signal.symbol}`);
    }

    const oldStopLoss = position.stopLossPrice;
    position.stopLossPrice = position.breakevenPrice; // Move to breakeven

    const update: PositionUpdate = {
      id: `update_${signal.messageHash}`,
      positionId: position.id,
      updateType: 'stop_loss',
      oldValue: oldStopLoss,
      newValue: position.stopLossPrice,
      updateTime: new Date(signal.updateTime)
    };

    position.updatedAt = new Date();

    this.fileStorage.savePositionUpdate(update);
    this.fileStorage.updatePosition(position.id, position);

    logger.info('Stop-loss updated to breakeven', { 
      positionId: position.id, 
      oldStopLoss, 
      newStopLoss: position.stopLossPrice 
    });

    return position;
  }

  // Handle position close
  handlePositionClose(signal: CloseSignal, closeData?: {
    closeQuantity: number;
    closeSizeUsdt: number;
    fee: number;
    exchangeOrderId: string;
  }): Position {
    const position = this.fileStorage.getOpenPosition(signal.symbol);
    if (!position) {
      throw new Error(`No open position found for ${signal.symbol}`);
    }

    // Calculate final PnL
    const finalPnL = this.calculateFinalPnL(position, signal.closePrice);

    position.status = 'closed';
    position.closeTime = new Date(signal.closeTime);
    position.closePrice = signal.closePrice;
    position.closeReason = signal.reason;
    position.realizedPnL = finalPnL;
    position.remainingQuantity -= closeData?.closeQuantity || 0;
    position.remainingSizeUsdt -= closeData?.closeSizeUsdt || 0;
    position.updatedAt = new Date();

    // Add fee and exchange order ID if provided
    if (closeData) {
      position.fee = closeData.fee;
      position.exchangeOrderId = closeData.exchangeOrderId;
    }

    this.fileStorage.updatePosition(position.id, position);
    
    logger.info('Position closed', { 
      positionId: position.id, 
      closeReason: signal.reason,
      finalPnL,
      fee: closeData?.fee || 0
    });
    
    return position;
  }

  // Get all open positions
  getOpenPositions(): Position[] {
    const positions = this.fileStorage.getPositions();
    return positions.filter(p => p.status === 'open');
  }

  // Get position by symbol
  getPosition(symbol: string): Position | undefined {
    return this.fileStorage.getOpenPosition(symbol);
  }

  // Update position current price (for unrealized PnL calculation)
  updateCurrentPrice(symbol: string, currentPrice: number): void {
    const position = this.fileStorage.getOpenPosition(symbol);
    if (position) {
      position.currentPrice = currentPrice;
      position.unrealizedPnL = this.calculateUnrealizedPnL(position, currentPrice);
      position.updatedAt = new Date();
      this.fileStorage.updatePosition(position.id, position);
    }
  }

  private calculatePartialPnL(position: Position, closePrice: number, closeQuantity: number): number {
    if (position.side === 'LONG') {
      return (closePrice - position.entryPrice) * closeQuantity;
    } else {
      return (position.entryPrice - closePrice) * closeQuantity;
    }
  }

  private calculateFinalPnL(position: Position, closePrice: number): number {
    return this.calculatePartialPnL(position, closePrice, position.remainingQuantity);
  }

  private calculateUnrealizedPnL(position: Position, currentPrice: number): number {
    return this.calculatePartialPnL(position, currentPrice, position.remainingQuantity);
  }
}
