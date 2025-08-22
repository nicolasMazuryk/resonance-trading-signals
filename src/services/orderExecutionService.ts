import { Signal, OpenSignal, Order, OrderSide, OrderType, Analytics } from '../types';
import { config } from '../config';
import { logger, serializeError } from '../utils/logger';
import { ExchangeService } from './exchangeService';
import { FileStorage } from './fileStorage';
import { SlackService } from './slackService';

export class OrderExecutionService {
  constructor(
    private exchangeService: ExchangeService,
    private fileStorage: FileStorage,
    private slackService: SlackService
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

      return

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
      // Set leverage if supported
      await this.exchangeService.setLeverage(signal.symbol, config.exchange.defaultLeverage);

      // Calculate order amount based on position size
      const orderAmount = signal.sizeUsdt / signal.price / 100;

      // Determine order side
      const orderSide: OrderSide = signal.action === 'LONG' ? 'buy' : 'sell';

      // Try limit order first, fallback to market if needed
      let order: any;
      let orderType: OrderType = 'limit';

      try {
        order = await this.exchangeService.placeLimitOrder(
          signal.symbol,
          orderSide,
          orderAmount,
          signal.price
        );
      } catch (error) {
        logger.warn('Limit order failed, trying market order', { error, signal });
        
        // const ticker = await this.exchangeService.getTicker(signal.symbol);
        // if (!ticker.last) {
        //   throw new Error(`No price data available for ${signal.symbol}`);
        // }

        // // Check if price deviation is within tolerance
        // const priceDeviation = Math.abs(ticker.last! - signal.price) / signal.price;
        // if (priceDeviation > config.exchange.orderSlippageTolerance) {
        //   throw new Error(`Price deviation ${(priceDeviation * 100).toFixed(2)}% exceeds tolerance ${(config.exchange.orderSlippageTolerance * 100).toFixed(2)}%`);
        // }

        order = await this.exchangeService.placeMarketOrder(
          signal.symbol,
          orderSide,
          orderAmount
        );
        orderType = 'market';
      }

      // Create order object
      const orderObj: Order = {
        id: order.id,
        signalId: signal.messageHash,
        symbol: signal.symbol,
        side: orderSide,
        type: orderType,
        amount: order.amount,
        price: signal.price,
        status: order.status === 'closed' ? 'filled' : 'pending',
        exchangeOrderId: order.id,
        filledAmount: order.filled,
        filledPrice: order.average,
        fee: order.fee,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Store order in file storage
      this.fileStorage.saveOrder(orderObj);

      // If order is filled immediately, calculate analytics
      if (order.status === 'closed' && order.filled) {
        await this.calculateAnalytics(signal, orderObj, signal.price, order.average);
      }

      logger.info('Open signal executed', {
        orderId: order.id,
        symbol: signal.symbol,
        action: signal.action,
        orderType,
        status: order.status,
      });
    } catch (error) {
      logger.error('Failed to execute open signal', { error: serializeError(error), signal });
      throw error;
    }
  }

  /**
   * Execute close signal (place exit order)
   */
  private async executeCloseSignal(signal: Signal): Promise<void> {
    // For close signals, we would typically close existing positions
    // This is a simplified implementation - in practice, you'd need to track positions
    logger.info('Close signal received', { symbol: signal.symbol, type: signal.type });
    
    // TODO: Implement position tracking and closing logic
    // For now, just log the signal
  }

  /**
   * Execute partial signal (partial position close)
   */
  private async executePartialSignal(signal: Signal): Promise<void> {
    // Similar to close signal - would need position tracking
    logger.info('Partial signal received', { symbol: signal.symbol, type: signal.type });
    
    // TODO: Implement partial position closing logic
  }

  /**
   * Execute update signal (modify stop loss)
   */
  private async executeUpdateSignal(signal: Signal): Promise<void> {
    // Update signals typically modify existing orders (like stop losses)
    logger.info('Update signal received', { symbol: signal.symbol, type: signal.type });
    
    // TODO: Implement order modification logic
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
}
