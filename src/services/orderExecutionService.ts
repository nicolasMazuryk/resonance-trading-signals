import { Signal, OpenSignal, Order, OrderSide, PartialSignal, UpdateSignal, CloseSignal } from '../types';
import { config } from '../config';
import { logger, serializeError } from '../utils/logger';
import { ExchangeService } from './exchangeService';
import { FileStorage } from './fileStorage';
import { PositionService } from './positionService';
import { AnalyticsService } from './analyticsService';
import { ConditionalOrder } from '../types';
import { calculateTakerFee } from '../utils/feeCalculator';
import * as ccxt from 'ccxt';

export class OrderExecutionService {
  private analyticsService: AnalyticsService;

  constructor(
    private exchangeService: ExchangeService,
    private fileStorage: FileStorage,
    private positionService: PositionService
  ) {
    this.analyticsService = new AnalyticsService(fileStorage);
  }

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
      const signalAge = Date.now() - signal.timestamp.getTime();
      if (signalAge > config.maxSignalAgeMs) {
        logger.warn('Signal too old, skipping', { 
          signalAge, 
          maxAge: config.maxSignalAgeMs,
          messageHash: signal.messageHash 
        });
        return;
      }
      
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

      // Use reduce-only market order for partial close to ensure we only close positions
      const order = await this.exchangeService.placeMarketOrder(
        signal.symbol,
        orderSide,
        roundedCloseQuantity,
        true // reduceOnly = true for closing positions
      );

      // Calculate fees for the partial close (taker fee for market order)
      const partialCloseFee = calculateTakerFee(roundedCloseQuantity, signal.partialPrice, config.exchange.fees.taker);
      
      // Update partial close with actual executed quantity and calculated fees
      latestPartialClose.closeQuantity = roundedCloseQuantity;
      latestPartialClose.closeSizeUsdt = roundedCloseQuantity * signal.partialPrice;
      latestPartialClose.fee = partialCloseFee;
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
        calculatedFee: partialCloseFee,
        feeRate: config.exchange.fees.taker,
        remainingQuantity: position.remainingQuantity
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

      // Cancel existing stop-loss order
      if (position.stopLossOrderId) {
        try {
          await this.exchangeService.cancelOrder(signal.symbol, position.stopLossOrderId);
          this.fileStorage.updateConditionalOrder(`sl_${position.id}`, { status: 'cancelled' });
          logger.info('Existing stop-loss order cancelled for breakeven update', {
            positionId: position.id,
            oldStopLossOrderId: position.stopLossOrderId
          });
        } catch (error) {
          logger.warn('Failed to cancel existing stop-loss order', { 
            error: serializeError(error), 
            stopLossOrderId: position.stopLossOrderId 
          });
        }
      }

      // Place new stop-loss order at breakeven price
      const orderSide = position.side === 'LONG' ? 'sell' : 'buy';
      const newStopLossOrder = await this.exchangeService.placeStopLossOrder(
        signal.symbol,
        orderSide,
        position.remainingQuantity,
        position.stopLossPrice // This is now the breakeven price
      );

      // Update position with new stop-loss order ID
      position.stopLossOrderId = newStopLossOrder.id;
      this.fileStorage.updatePosition(position.id, position);

      // Save new conditional order
      const newStopLossConditionalOrder: ConditionalOrder = {
        id: `sl_${position.id}_breakeven`,
        positionId: position.id,
        symbol: signal.symbol,
        type: 'stop_loss',
        side: orderSide,
        amount: position.remainingQuantity,
        price: position.stopLossPrice,
        status: 'pending',
        exchangeOrderId: newStopLossOrder.id,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.fileStorage.saveConditionalOrder(newStopLossConditionalOrder);

      logger.info('Stop-loss updated to breakeven', { 
        positionId: position.id, 
        newStopLoss: position.stopLossPrice,
        remainingQuantity: position.remainingQuantity,
        side: orderSide,
        newStopLossOrderId: newStopLossOrder.id
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

      // Cancel pending orders based on close reason
      await this.cancelPendingOrdersForClose(signal, position);

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

      // Execute close order on exchange (use reduce-only to ensure we only close positions)
      const orderSide = position.side === 'LONG' ? 'sell' : 'buy';
      
      let closeOrder: Order;
      let closeData: any;

      try {
        // Try to place reduce-only market order
        const order = await this.exchangeService.placeMarketOrder(
          signal.symbol,
          orderSide,
          roundedCloseQuantity,
          true // reduceOnly = true for closing positions
        );

        // Market order was successful - use this order information
        closeOrder = this.createOrderFromExchangeOrder(order, signal, orderSide, roundedCloseQuantity);
        closeData = {
          closeQuantity: roundedCloseQuantity,
          closeSizeUsdt: roundedCloseQuantity * signal.closePrice,
          fee: calculateTakerFee(roundedCloseQuantity, signal.closePrice, config.exchange.fees.taker),
          exchangeOrderId: order.id
        };

        // Cancel any remaining pending orders since position is now closed
        await this.cancelRemainingPendingOrders(signal.symbol, position, signal.reason);

        logger.info('Position closed via market order', { 
          positionId: position.id, 
          closeReason: signal.reason,
          orderId: order.id
        });

      } catch (error) {
        // Check if this is a reduce-only error (position already closed by stop-loss)
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isReduceOnlyError = this.isReduceOnlyError(error);

        if (isReduceOnlyError) {
          // Position was already closed by stop-loss order - query the executed order
          logger.info('Reduce-only order failed, position already closed by stop-loss', {
            positionId: position.id,
            closeReason: signal.reason,
            error: errorMessage
          });

          // Query the executed order based on close reason
          const executedOrder = await this.queryExecutedOrder(signal.symbol, position, signal.reason);
          
          if (executedOrder) {
            closeOrder = this.createOrderFromExchangeOrder(executedOrder, signal, orderSide, executedOrder.filled || 0);
            closeData = {
              closeQuantity: executedOrder.filled || 0,
              closeSizeUsdt: (executedOrder.filled || 0) * (executedOrder.average || signal.closePrice),
              fee: executedOrder.fee?.cost || 0,
              exchangeOrderId: executedOrder.id
            };

            logger.info('Found executed order', {
              positionId: position.id,
              orderId: executedOrder.id,
              filledAmount: executedOrder.filled,
              averagePrice: executedOrder.average,
              closeReason: signal.reason
            });
          } else {
            throw new Error('Position appears to be closed but could not find executed order');
          }
        } else {
          // This is a different error, re-throw
          throw error;
        }
      }

      // Update position tracking with actual executed quantity and fees
      const updatedPosition = this.positionService.handlePositionClose(signal, closeData);

      // Update position exit analytics
      await this.analyticsService.updatePositionExitAnalytics(updatedPosition, closeOrder, signal.closePrice);

      logger.info('Position closed successfully', { 
        positionId: updatedPosition.id, 
        closeReason: signal.reason,
        finalPnL: updatedPosition.realizedPnL,
        orderId: closeOrder.exchangeOrderId
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

    // Step 1: Place market order to open the position
    const ccxtMarketOrder = await this.exchangeService.placeMarketOrder(
      signal.symbol,
      orderSide,
      roundedOrderAmount
    );

    // Create our custom Order object from CCXT order
    const marketOrder: Order = {
      id: ccxtMarketOrder.id,
      signalId: signal.messageHash,
      symbol: signal.symbol,
      side: orderSide,
      type: 'market',
      amount: roundedOrderAmount,
      price: signal.price,
      status: ccxtMarketOrder.status as 'pending' | 'filled' | 'cancelled' | 'failed',
      exchangeOrderId: ccxtMarketOrder.id,
      createdAt: new Date(ccxtMarketOrder.timestamp),
      updatedAt: new Date(),
      ...(ccxtMarketOrder.filled && { filledAmount: ccxtMarketOrder.filled }),
      ...(ccxtMarketOrder.average && { filledPrice: ccxtMarketOrder.average }),
      ...(ccxtMarketOrder.fee?.cost && { fee: ccxtMarketOrder.fee.cost })
    };

    // Calculate fees for the market order (taker fee)
    const marketOrderFee = calculateTakerFee(roundedOrderAmount, signal.price, config.exchange.fees.taker);
    
    // Update position with actual executed quantity and calculated fees
    position.quantity = roundedOrderAmount;
    position.sizeUsdt = roundedOrderAmount * signal.price;
    position.remainingQuantity = roundedOrderAmount;
    position.remainingSizeUsdt = position.sizeUsdt;
    position.fee = marketOrderFee;
    position.exchangeOrderId = marketOrder.id;

    // Step 2: Place stop-loss order
    const stopLossOrderSide: OrderSide = signal.action === 'LONG' ? 'sell' : 'buy';
    const stopLossOrder = await this.exchangeService.placeStopLossOrder(
      signal.symbol,
      stopLossOrderSide,
      roundedOrderAmount,
      signal.slPrice
    );

    // Step 3: Place take-profit order
    const takeProfitOrderSide: OrderSide = signal.action === 'LONG' ? 'sell' : 'buy';
    const takeProfitOrder = await this.exchangeService.placeTakeProfitOrder(
      signal.symbol,
      takeProfitOrderSide,
      roundedOrderAmount,
      signal.tpPrice
    );

    // Update position with conditional order IDs
    position.stopLossOrderId = stopLossOrder.id;
    position.takeProfitOrderId = takeProfitOrder.id;
    
    this.fileStorage.updatePosition(position.id, position);

    // Save conditional orders for tracking
    const stopLossConditionalOrder: ConditionalOrder = {
      id: `sl_${position.id}`,
      positionId: position.id,
      symbol: signal.symbol,
      type: 'stop_loss',
      side: stopLossOrderSide,
      amount: roundedOrderAmount,
      price: signal.slPrice,
      status: 'pending',
      exchangeOrderId: stopLossOrder.id,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const takeProfitConditionalOrder: ConditionalOrder = {
      id: `tp_${position.id}`,
      positionId: position.id,
      symbol: signal.symbol,
      type: 'take_profit',
      side: takeProfitOrderSide,
      amount: roundedOrderAmount,
      price: signal.tpPrice,
      status: 'pending',
      exchangeOrderId: takeProfitOrder.id,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.fileStorage.saveConditionalOrder(stopLossConditionalOrder);
    this.fileStorage.saveConditionalOrder(takeProfitConditionalOrder);

    // Calculate position entry analytics
    await this.analyticsService.calculatePositionEntryAnalytics(signal, position, marketOrder);

    logger.info('Market order executed with separate stop-loss and take-profit orders', {
      symbol: signal.symbol,
      side: orderSide,
      amount: roundedOrderAmount,
      calculatedFee: marketOrderFee,
      feeRate: config.exchange.fees.taker,
      stopLossPrice: signal.slPrice,
      takeProfitPrice: signal.tpPrice,
      stopLossOrderId: stopLossOrder.id,
      takeProfitOrderId: takeProfitOrder.id
    });
  }

  /**
   * Cancel pending orders based on close reason
   */
  private async cancelPendingOrdersForClose(signal: CloseSignal, position: any): Promise<void> {
    if (signal.reason === 'Take profit achieved') {
      // Cancel stop-loss order since take-profit was hit
      if (position.stopLossOrderId) {
        try {
          await this.exchangeService.cancelOrder(signal.symbol, position.stopLossOrderId);
          this.fileStorage.updateConditionalOrder(`sl_${position.id}`, { status: 'cancelled' });
          logger.info('Stop-loss order cancelled due to take-profit achievement', {
            positionId: position.id,
            stopLossOrderId: position.stopLossOrderId
          });
        } catch (error) {
          logger.warn('Failed to cancel stop-loss order', { 
            error: serializeError(error), 
            stopLossOrderId: position.stopLossOrderId 
          });
        }
      }
    } else if (signal.reason === 'Stop loss') {
      // Cancel take-profit order since stop-loss was hit
      if (position.takeProfitOrderId) {
        try {
          await this.exchangeService.cancelOrder(signal.symbol, position.takeProfitOrderId);
          this.fileStorage.updateConditionalOrder(`tp_${position.id}`, { status: 'cancelled' });
          logger.info('Take-profit order cancelled due to stop-loss hit', {
            positionId: position.id,
            takeProfitOrderId: position.takeProfitOrderId
          });
        } catch (error) {
          logger.warn('Failed to cancel take-profit order', { 
            error: serializeError(error), 
            takeProfitOrderId: position.takeProfitOrderId 
          });
        }
      }
    } else if (signal.reason === 'Breakeven') {
      // Cancel take-profit order since we're closing at breakeven
      if (position.takeProfitOrderId) {
        try {
          await this.exchangeService.cancelOrder(signal.symbol, position.takeProfitOrderId);
          this.fileStorage.updateConditionalOrder(`tp_${position.id}`, { status: 'cancelled' });
          logger.info('Take-profit order cancelled due to breakeven close', {
            positionId: position.id,
            takeProfitOrderId: position.takeProfitOrderId
          });
        } catch (error) {
          logger.warn('Failed to cancel take-profit order', { 
            error: serializeError(error), 
            takeProfitOrderId: position.takeProfitOrderId 
          });
        }
      }
      // Note: Stop-loss order is already at breakeven price, so we don't cancel it
    }
  }

  /**
   * Query for executed order when reduce-only market order fails
   */
  private async queryExecutedOrder(symbol: string, position: any, closeReason: string): Promise<ccxt.Order | null> {
    try {
      let orderId: string | undefined;
      let orderType: string;

      // Determine which order to query based on close reason
      if (closeReason === 'Stop loss') {
        orderId = position.stopLossOrderId;
        orderType = 'stop-loss';
      } else if (closeReason === 'Take profit achieved') {
        orderId = position.takeProfitOrderId;
        orderType = 'take-profit';
      } else if (closeReason === 'Breakeven') {
        // For breakeven, we might have either stop-loss or take-profit executed
        // Try stop-loss first (since it's usually at breakeven price)
        orderId = position.stopLossOrderId;
        orderType = 'stop-loss';
      } else {
        logger.warn('Unknown close reason, cannot determine which order to query', { closeReason });
        return null;
      }

      // First try to get the order by ID if we have it
      if (orderId) {
        try {
          const order = await this.exchangeService.getOrder(symbol, orderId);
          if (order.status === 'closed' || order.status === 'filled') {
            logger.info(`Found executed ${orderType} order by ID`, {
              orderId,
              orderType,
              filledAmount: order.filled,
              averagePrice: order.average
            });
            return order;
          }
        } catch (error) {
          logger.warn(`Failed to fetch ${orderType} order by ID`, { 
            error: serializeError(error), 
            orderId,
            orderType
          });
        }
      }

      return null;
    } catch (error) {
      logger.error('Failed to query executed order', { 
        error: serializeError(error), 
        symbol, 
        positionId: position.id,
        closeReason
      });
      return null;
    }
  }

  /**
   * Cancel any remaining pending orders after successful market order execution
   * Note: This cancels the same type of order that matches the close reason
   * (since the opposite order was already cancelled in cancelPendingOrdersForClose)
   */
  private async cancelRemainingPendingOrders(symbol: string, position: any, closeReason: string): Promise<void> {
    try {
      let orderId: string | undefined;
      let orderType: string;
      let conditionalOrderId: string;

      // Determine which order to cancel based on close reason (same type)
      if (closeReason === 'Stop loss') {
        orderId = position.stopLossOrderId;
        orderType = 'stop-loss';
        conditionalOrderId = `sl_${position.id}`;
      } else if (closeReason === 'Take profit achieved') {
        orderId = position.takeProfitOrderId;
        orderType = 'take-profit';
        conditionalOrderId = `tp_${position.id}`;
      } else if (closeReason === 'Breakeven') {
        // For breakeven, we might have either stop-loss or take-profit pending
        // Since we're at breakeven, the stop-loss is usually at breakeven price
        // and take-profit was already cancelled in cancelPendingOrdersForClose
        orderId = position.stopLossOrderId;
        orderType = 'stop-loss';
        conditionalOrderId = `sl_${position.id}`;
      } else {
        logger.warn('Unknown close reason, cannot determine which order to cancel', { closeReason });
        return;
      }

      // Cancel the pending order if it exists
      if (orderId) {
        try {
          await this.exchangeService.cancelOrder(symbol, orderId);
          this.fileStorage.updateConditionalOrder(conditionalOrderId, { status: 'cancelled' });
          
          logger.info('Cancelled remaining pending order after successful market close', {
            positionId: position.id,
            orderId: orderId,
            orderType: orderType,
            closeReason: closeReason,
            symbol
          });
        } catch (error) {
          logger.warn('Failed to cancel remaining pending order', {
            error: serializeError(error),
            positionId: position.id,
            orderId: orderId,
            orderType: orderType,
            closeReason: closeReason,
            symbol
          });
        }
      } else {
        logger.debug('No pending order to cancel for close reason', {
          positionId: position.id,
          closeReason: closeReason,
          symbol
        });
      }
    } catch (error) {
      logger.error('Failed to cancel remaining pending orders', {
        error: serializeError(error),
        positionId: position.id,
        closeReason: closeReason,
        symbol
      });
    }
  }

  /**
   * Check if an error is a reduce-only error (position already closed)
   */
  private isReduceOnlyError(error: any): boolean {
    // Check for Binance ReduceOnly Order is rejected error
    if (typeof error === 'object' && error !== null) {
      if (error.code === -2022 && typeof error.msg === 'string' && /ReduceOnly Order is rejected/i.test(error.msg)) {
        return true;
      }
      // Some libraries may stringify the error object
      if (typeof error.message === 'string' && /ReduceOnly Order is rejected/i.test(error.message)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Create Order object from exchange order
   */
  private createOrderFromExchangeOrder(
    exchangeOrder: ccxt.Order, 
    signal: CloseSignal, 
    orderSide: OrderSide, 
    amount: number
  ): Order {
    return {
      id: exchangeOrder.id,
      signalId: signal.messageHash,
      symbol: signal.symbol,
      side: orderSide,
      type: 'market',
      amount: amount,
      price: signal.closePrice,
      status: exchangeOrder.status as 'pending' | 'filled' | 'cancelled' | 'failed',
      exchangeOrderId: exchangeOrder.id,
      createdAt: new Date(exchangeOrder.timestamp),
      updatedAt: new Date(),
      ...(exchangeOrder.filled && { filledAmount: exchangeOrder.filled }),
      ...(exchangeOrder.average && { filledPrice: exchangeOrder.average }),
      ...(exchangeOrder.fee?.cost && { fee: exchangeOrder.fee.cost })
    };
  }

}
