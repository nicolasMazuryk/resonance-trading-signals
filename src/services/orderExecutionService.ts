import { Signal, OpenSignal, Order, OrderSide, Analytics, PartialSignal, UpdateSignal, CloseSignal } from '../types';
import { config } from '../config';
import { logger, serializeError } from '../utils/logger';
import { ExchangeService } from './exchangeService';
import { FileStorage } from './fileStorage';
import { SlackService } from './slackService';
import { PositionService } from './positionService';

export class OrderExecutionService {
  constructor(
    private exchangeService: ExchangeService,
    private fileStorage: FileStorage,
    private slackService: SlackService,
    private positionService: PositionService
  ) {}

  /**
   * Process a signal and execute orders
   */
  async processSignal(signal: Signal): Promise<void> {
    try {
      // Check if signal already processed (idempotency)
      if (this.fileStorage.signalExists(signal.messageHash)) {
        logger.info('Signal already processed, skipping', { messageHash: signal.messageHash });
        return;
      }

      // Check signal age
      // const signalAge = Date.now() - signal.timestamp.getTime();
      // if (signalAge > config.maxSignalAgeMs) {
      //   logger.warn('Signal too old, skipping', { 
      //     signalAge, 
      //     maxAge: config.maxSignalAgeMs,
      //     messageHash: signal.messageHash 
      //   });
        
      //   await this.slackService.sendStaleSignalAlert(
      //     signal.symbol,
      //     signal.type,
      //     signalAge,
      //     config.maxSignalAgeMs
      //   );
      //   return;
      // }

      // Save signal to file storage
      this.fileStorage.saveSignal(signal);

      // Execute orders based on signal type
      switch (signal.type) {
        case 'open':
          await this.executeOpenSignal(signal as OpenSignal);
          break;
        case 'close':
          await this.executeCloseSignal(signal);
          break;
        case 'partial':
          await this.executePartialSignal(signal);
          break;
        case 'update':
          await this.executeUpdateSignal(signal);
          break;
        default:
          logger.warn('Unknown signal type', { type: (signal as any).type });
      }
    } catch (error) {
      logger.error('Failed to process signal', { error: serializeError(error), signal });
      
      await this.slackService.sendOrderFailureAlert(
        signal.symbol,
        signal.type,
        error instanceof Error ? error.message : String(error)
      );
      
      throw error;
    }
  }

  /**
   * Execute open signal (place entry order)
   */
  private async executeOpenSignal(signal: OpenSignal): Promise<void> {
    try {
      // Create position first
      const position = this.positionService.createPosition(signal);

      // Execute order on exchange
      await this.executeOrder(signal, position);
      
      logger.info('Open signal executed', { positionId: position.id, symbol: signal.symbol });
    } catch (error) {
      logger.error('Failed to execute open signal', { error: serializeError(error), signal });
      throw error;
    }
  }

  /**
   * Execute partial signal (partial position close)
   */
  private async executePartialSignal(signal: PartialSignal): Promise<void> {
    try {
      // Update position tracking
      const position = this.positionService.handlePartialClose(signal);

      // Execute partial close order on exchange
      const orderSide = position.side === 'LONG' ? 'sell' : 'buy';
      const latestPartialClose = position.partialCloses[position.partialCloses.length - 1];
      
      if (!latestPartialClose) {
        throw new Error('No partial close found after processing signal');
      }

      // Round the close quantity and check minimum requirements
      const market = await this.exchangeService.getMarket(signal.symbol);
      const roundedCloseQuantity = this.exchangeService.roundAmount(latestPartialClose.closeQuantity, market);
      
      // Check minimum requirements for the close order
      const meetsMinimum = await this.exchangeService.checkMinimumRequirements(
        signal.symbol, 
        roundedCloseQuantity, 
        signal.partialPrice
      );
      
      if (!meetsMinimum) {
        throw new Error(`Partial close order below minimum notional or quantity for ${signal.symbol}`);
      }

      const order = await this.exchangeService.placeMarketOrder(
        signal.symbol,
        orderSide,
        roundedCloseQuantity
      );

      // Update partial close with actual executed quantity and fees
      latestPartialClose.closeQuantity = roundedCloseQuantity;
      latestPartialClose.closeSizeUsdt = roundedCloseQuantity * signal.partialPrice;
      latestPartialClose.fee = order.fee?.cost || 0;
      latestPartialClose.exchangeOrderId = order.id;
      
      // Update position with actual remaining quantities
      position.remainingQuantity = position.quantity - position.partialCloses.reduce((sum, pc) => sum + pc.closeQuantity, 0);
      position.remainingSizeUsdt = position.sizeUsdt - position.partialCloses.reduce((sum, pc) => sum + pc.closeSizeUsdt, 0);
      
      this.fileStorage.updatePartialClose(latestPartialClose.id, latestPartialClose);
      this.fileStorage.updatePosition(position.id, position);

      logger.info('Partial close executed', { 
        positionId: position.id, 
        closeQuantity: roundedCloseQuantity, 
        closePrice: signal.partialPrice,
        fee: latestPartialClose.fee
      });
    } catch (error) {
      logger.error('Failed to execute partial signal', { error: serializeError(error), signal });
      throw error;
    }
  }

  /**
   * Execute update signal (modify stop loss)
   */
  private async executeUpdateSignal(signal: UpdateSignal): Promise<void> {
    try {
      // Update position tracking
      const position = this.positionService.handleStopLossUpdate(signal);

      // Implement stop-loss order update on exchange
      const orderSide = position.side === 'LONG' ? 'sell' : 'buy';
      await this.exchangeService.updateStopLoss(
        signal.symbol,
        position.stopLossPrice,
        position.remainingQuantity,
        orderSide
      );

      logger.info('Stop-loss updated to breakeven', { 
        positionId: position.id, 
        newStopLoss: position.stopLossPrice,
        remainingQuantity: position.remainingQuantity,
        side: orderSide
      });
    } catch (error) {
      logger.error('Failed to execute update signal', { error: serializeError(error), signal });
      throw error;
    }
  }

  /**
   * Execute close signal (place exit order)
   */
  private async executeCloseSignal(signal: CloseSignal): Promise<void> {
    try {
      // Get position before closing it to preserve remaining quantity
      const position = this.positionService.getPosition(signal.symbol);
      if (!position) {
        throw new Error(`No open position found for ${signal.symbol}`);
      }

      // Round the close quantity and check minimum requirements
      const market = await this.exchangeService.getMarket(signal.symbol);
      const roundedCloseQuantity = this.exchangeService.roundAmount(position.remainingQuantity, market);
      
      // Check minimum requirements for the close order
      const meetsMinimum = await this.exchangeService.checkMinimumRequirements(
        signal.symbol, 
        roundedCloseQuantity, 
        signal.closePrice
      );
      
      if (!meetsMinimum) {
        throw new Error(`Close order below minimum notional or quantity for ${signal.symbol}`);
      }

      // Execute close order on exchange
      const orderSide = position.side === 'LONG' ? 'sell' : 'buy';
      
      const order = await this.exchangeService.placeMarketOrder(
        signal.symbol,
        orderSide,
        roundedCloseQuantity
      );

      // Update position tracking with actual executed quantity and fees
      const closeData = {
        closeQuantity: roundedCloseQuantity,
        closeSizeUsdt: roundedCloseQuantity * signal.closePrice,
        fee: order.fee?.cost || 0,
        exchangeOrderId: order.id
      };

      const updatedPosition = this.positionService.handlePositionClose(signal, closeData);

      logger.info('Position closed', { 
        positionId: updatedPosition.id, 
        closeReason: signal.reason,
        finalPnL: updatedPosition.realizedPnL,
        fee: closeData.fee
      });
    } catch (error) {
      logger.error('Failed to execute close signal', { error: serializeError(error), signal });
      throw error;
    }
  }

  /**
   * Execute order on exchange
   */
  private async executeOrder(signal: OpenSignal, position: any): Promise<void> {
    // Set leverage if supported
    await this.exchangeService.setLeverage(signal.symbol, config.exchange.defaultLeverage);

    // Calculate order amount
    const orderAmount = signal.sizeUsdt / signal.price / 100;
    const orderSide: OrderSide = signal.action === 'LONG' ? 'buy' : 'sell';

    // Round the order amount and check minimum requirements
    const market = await this.exchangeService.getMarket(signal.symbol);
    const roundedOrderAmount = this.exchangeService.roundAmount(orderAmount, market);
    
    // Check minimum requirements
    const meetsMinimum = await this.exchangeService.checkMinimumRequirements(
      signal.symbol, 
      roundedOrderAmount, 
      signal.price
    );
    
    if (!meetsMinimum) {
      throw new Error(`Order below minimum notional or quantity for ${signal.symbol}`);
    }

    // Place market order with stop-loss and take-profit
    const order = await this.exchangeService.placeMarketOrder(
      signal.symbol,
      orderSide,
      roundedOrderAmount,
      signal.slPrice,  // Stop-loss price
      signal.tpPrice   // Take-profit price
    );

    // Update position with actual executed quantity and fees
    position.quantity = roundedOrderAmount;
    position.sizeUsdt = roundedOrderAmount * signal.price;
    position.remainingQuantity = roundedOrderAmount;
    position.remainingSizeUsdt = position.sizeUsdt;
    position.fee = order.fee?.cost || 0;
    position.exchangeOrderId = order.id;
    
    this.fileStorage.updatePosition(position.id, position);

    logger.info('Market order executed with stop-loss and take-profit', {
      symbol: signal.symbol,
      side: orderSide,
      amount: roundedOrderAmount,
      fee: position.fee,
      stopLossPrice: signal.slPrice,
      takeProfitPrice: signal.tpPrice
    });
  }

  /**
   * Calculate analytics for order execution
   */
  private async calculateAnalytics(
    signal: Signal,
    order: Order,
    signalPrice: number,
    executionPrice: number
  ): Promise<void> {
    try {
      const executionTime = new Date();
      const executionDelayMs = executionTime.getTime() - signal.timestamp.getTime();
      const priceDeviationPercent = ((executionPrice - signalPrice) / signalPrice) * 100;
      
      // Get order details for slippage calculation
      if (!order.filledAmount) {
        logger.warn('Cannot calculate analytics - order not filled', { orderId: order.id });
        return;
      }

      const slippageUsdt = (executionPrice - signalPrice) * order.filledAmount;

      // Create analytics object
      const analytics: Analytics = {
        id: `${order.id}-analytics`,
        signalId: signal.messageHash,
        orderId: order.id,
        symbol: order.symbol,
        signalType: signal.type,
        signalPrice,
        executionPrice,
        priceDeviationPercent,
        executionDelayMs,
        slippageUsdt,
        tradingFee: order.fee || 0,
        createdAt: executionTime,
      };

      // Save analytics
      this.fileStorage.saveAnalytics(analytics);

      // Check for high deviation and alert
      if (Math.abs(priceDeviationPercent) > 2) {
        await this.slackService.sendHighDeviationAlert(
          order.symbol,
          priceDeviationPercent,
          signalPrice,
          executionPrice,
          executionDelayMs
        );
      }

      logger.info('Analytics calculated', {
        orderId: order.id,
        priceDeviationPercent,
        executionDelayMs,
        slippageUsdt,
        tradingFee: order.fee || 0,
      });
    } catch (error) {
      logger.error('Failed to calculate analytics', { error: serializeError(error), orderId: order.id });
    }
  }

  /**
   * Monitor and update pending orders
   */
  async monitorPendingOrders(): Promise<void> {
    try {
      const pendingOrders = this.fileStorage.getPendingOrders();
      
      for (const order of pendingOrders) {
        try {
          const exchangeOrder = await this.exchangeService.getOrder(order.symbol, order.exchangeOrderId!);
          
          if (exchangeOrder.status !== order.status) {
            // Update order status
            const updateData: Partial<Order> = {
              status: exchangeOrder.status === 'closed' ? 'filled' : exchangeOrder.status as any,
              filledAmount: exchangeOrder.filled,
            };
            
            if (exchangeOrder.fee?.cost !== undefined) {
              updateData.fee = exchangeOrder.fee.cost;
            }
            
            if (exchangeOrder.average !== undefined) {
              updateData.filledPrice = exchangeOrder.average;
            }
            
            this.fileStorage.updateOrder(order.id, updateData);

            // If order is now filled, calculate analytics
            if (exchangeOrder.status === 'closed' && exchangeOrder.filled) {
              const signals = this.fileStorage.getSignals();
              const signal = signals.find(s => s.messageHash === order.signalId);
              if (signal && signal.type === 'open') {
                await this.calculateAnalytics(
                  signal,
                  order,
                  (signal as any).price,
                  exchangeOrder.average || 0
                );
              }
            }

            logger.info('Order status updated', {
              orderId: order.id,
              oldStatus: order.status,
              newStatus: exchangeOrder.status,
            });
          }
        } catch (error) {
          logger.error('Failed to monitor order', { error: serializeError(error), orderId: order.id });
        }
      }
    } catch (error) {
      logger.error('Failed to monitor pending orders', { error: serializeError(error) });
    }
  }

  /**
   * Get current positions summary
   */
  getPositionsSummary(): {
    openPositions: number;
    totalPnL: number;
    positions: any[];
  } {
    const openPositions = this.positionService.getOpenPositions();
    const totalPnL = openPositions.reduce((sum, pos) => sum + (pos.unrealizedPnL || 0), 0);
    
    return {
      openPositions: openPositions.length,
      totalPnL,
      positions: openPositions
    };
  }
}
