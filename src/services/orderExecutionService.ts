import { Signal, OpenSignal, Order, OrderSide, PartialSignal, UpdateSignal, CloseSignal } from '../types';
import { config } from '../config';
import { logger, serializeError } from '../utils/logger';
import { ExchangeService } from './exchangeService';
import { FileStorage } from './fileStorage';
import { SlackService } from './slackService';
import { PositionService } from './positionService';
import { AnalyticsService } from './analyticsService';
import { ConditionalOrder } from '../types';
import { calculateTakerFee } from '../utils/feeCalculator';

export class OrderExecutionService {
  private analyticsService: AnalyticsService;

  constructor(
    private exchangeService: ExchangeService,
    private fileStorage: FileStorage,
    private slackService: SlackService,
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

      // Cancel conditional orders based on close reason
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
        logger.info('Take-profit order cancelled due to breakeven close', {
          positionId: position.id,
          closeReason: signal.reason
        });
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

      // Calculate fees for the close order (taker fee for market order)
      const closeOrderFee = calculateTakerFee(roundedCloseQuantity, signal.closePrice, config.exchange.fees.taker);
      
      // Update position tracking with actual executed quantity and calculated fees
      const closeData = {
        closeQuantity: roundedCloseQuantity,
        closeSizeUsdt: roundedCloseQuantity * signal.closePrice,
        fee: closeOrderFee,
        exchangeOrderId: order.id
      };

      const updatedPosition = this.positionService.handlePositionClose(signal, closeData);

      // Create Order object for analytics
      const closeOrder: Order = {
        id: order.id,
        signalId: signal.messageHash,
        symbol: signal.symbol,
        side: orderSide,
        type: 'market',
        amount: roundedCloseQuantity,
        price: signal.closePrice,
        status: order.status as 'pending' | 'filled' | 'cancelled' | 'failed',
        exchangeOrderId: order.id,
        createdAt: new Date(order.timestamp),
        updatedAt: new Date(),
        ...(order.filled && { filledAmount: order.filled }),
        ...(order.average && { filledPrice: order.average }),
        ...(order.fee?.cost && { fee: order.fee.cost })
      };

      // Update position exit analytics
      await this.analyticsService.updatePositionExitAnalytics(updatedPosition, closeOrder, signal.closePrice);

      logger.info('Position closed', { 
        positionId: updatedPosition.id, 
        closeReason: signal.reason,
        finalPnL: updatedPosition.realizedPnL,
        calculatedFee: closeOrderFee,
        feeRate: config.exchange.fees.taker
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


}
