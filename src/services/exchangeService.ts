import ccxt from 'ccxt';
import { config } from '../config';
import { logger, serializeError } from '../utils/logger';
import { OrderSide, OrderType } from '../types';

export class ExchangeService {
  private exchange: ccxt.Exchange;
  private symbolCache = new Map<string, ccxt.Market>();

  constructor() {
    const ExchangeClass = ccxt[config.exchange.id as keyof typeof ccxt] as any;
    
    if (!ExchangeClass) {
      throw new Error(`Exchange ${config.exchange.id} not supported by ccxt`);
    }

    this.exchange = new ExchangeClass({
      apiKey: config.exchange.apiKey,
      secret: config.exchange.apiSecret,
      sandbox: config.nodeEnv === 'development',
      enableRateLimit: true,
    });

    logger.info('Exchange service initialized', { 
      exchange: config.exchange.id,
      sandbox: config.nodeEnv === 'development' 
    });
  }

  /**
   * Initialize exchange (load markets, set leverage)
   */
  async initialize(): Promise<void> {
    try {
      await this.exchange.loadMarkets();
      logger.info('Markets loaded', { 
        marketCount: Object.keys(this.exchange.markets).length 
      });

      // Set default leverage for futures trading
      if (this.exchange.has['setLeverage']) {
        // Note: This would need to be done per symbol when placing orders
        logger.info('Exchange supports leverage setting');
      }
    } catch (error) {
      logger.error('Failed to initialize exchange', { error: serializeError(error) });
      throw error;
    }
  }

  /**
   * Convert symbol from BASE/USDT format to exchange format
   */
  private normalizeSymbol(symbol: string): string {
    // Remove / and convert to uppercase (e.g., BTC/USDT -> BTCUSDT)
    return symbol.replace('/', '').toUpperCase();
  }

  /**
   * Get market info for a symbol
   */
  private async getMarket(symbol: string): Promise<ccxt.Market> {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    
    if (this.symbolCache.has(normalizedSymbol)) {
      return this.symbolCache.get(normalizedSymbol)!;
    }

    const market = this.exchange.markets[normalizedSymbol];
    if (!market) {
      throw new Error(`Symbol ${symbol} (${normalizedSymbol}) not found on exchange`);
    }

    this.symbolCache.set(normalizedSymbol, market);
    return market;
  }

  /**
   * Round amount to exchange precision
   */
  private roundAmount(amount: number, market: ccxt.Market): number {
    if (market.amount?.precision !== undefined) {
      return Number(amount.toFixed(market.amount.precision));
    }
    return amount;
  }

  /**
   * Round price to exchange precision
   */
  private roundPrice(price: number, market: ccxt.Market): number {
    if (market.precision?.price !== undefined) {
      return Number(price.toFixed(market.precision.price));
    }
    return price;
  }

  /**
   * Check if order meets minimum notional requirements
   */
  private async checkMinimumNotional(symbol: string, amount: number, price: number): Promise<boolean> {
    try {
      const market = await this.getMarket(symbol);
      const notional = amount * price;
      
      if (market.minNotional && notional < market.minNotional) {
        logger.warn('Order below minimum notional', {
          symbol,
          notional,
          minNotional: market.minNotional,
        });
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to check minimum notional', { error: serializeError(error), symbol, amount, price });
      return false;
    }
  }

  /**
   * Set leverage for a symbol (futures only)
   */
  async setLeverage(symbol: string, leverage: number): Promise<void> {
    try {
      if (!this.exchange.has['setLeverage']) {
        logger.warn('Exchange does not support leverage setting');
        return;
      }

      const normalizedSymbol = this.normalizeSymbol(symbol);
      await this.exchange.setLeverage(leverage, normalizedSymbol);
      
      logger.info('Leverage set', { symbol, leverage });
    } catch (error) {
      logger.error('Failed to set leverage', { error: serializeError(error), symbol, leverage });
      throw error;
    }
  }

  /**
   * Get current ticker for a symbol
   */
  async getTicker(symbol: string): Promise<ccxt.Ticker> {
    try {
      const normalizedSymbol = this.normalizeSymbol(symbol);
      const ticker = await this.exchange.fetchTicker(normalizedSymbol);
      
      logger.debug('Ticker fetched', { symbol, last: ticker.last });
      return ticker;
    } catch (error) {
      logger.error('Failed to fetch ticker', { error: serializeError(error), symbol });
      throw error;
    }
  }

  /**
   * Place a limit order
   */
  async placeLimitOrder(
    symbol: string,
    side: OrderSide,
    amount: number,
    price: number
  ): Promise<ccxt.Order> {
    try {
      const market = await this.getMarket(symbol);
      const normalizedSymbol = this.normalizeSymbol(symbol);
      
      const roundedAmount = this.roundAmount(amount, market);
      const roundedPrice = this.roundPrice(price, market);

      // Check minimum notional
      const meetsMinimum = await this.checkMinimumNotional(symbol, roundedAmount, roundedPrice);
      if (!meetsMinimum) {
        throw new Error(`Order below minimum notional for ${symbol}`);
      }

      const order = await this.exchange.createLimitOrder(
        normalizedSymbol,
        side,
        roundedAmount,
        roundedPrice
      );

      logger.info('Limit order placed', {
        symbol,
        side,
        amount: roundedAmount,
        price: roundedPrice,
        orderId: order.id,
      });

      return order;
    } catch (error) {
      logger.error('Failed to place limit order', { error: serializeError(error), symbol, side, amount, price });
      throw error;
    }
  }

  /**
   * Place a market order
   */
  async placeMarketOrder(
    symbol: string,
    side: OrderSide,
    amount: number
  ): Promise<ccxt.Order> {
    try {
      const market = await this.getMarket(symbol);
      const normalizedSymbol = this.normalizeSymbol(symbol);
      
      const roundedAmount = this.roundAmount(amount, market);

      const order = await this.exchange.createMarketOrder(
        normalizedSymbol,
        side,
        roundedAmount
      );

      logger.info('Market order placed', {
        symbol,
        side,
        amount: roundedAmount,
        orderId: order.id,
      });

      return order;
    } catch (error) {
      logger.error('Failed to place market order', { error: serializeError(error), symbol, side, amount });
      throw error;
    }
  }

  /**
   * Get order status
   */
  async getOrder(symbol: string, orderId: string): Promise<ccxt.Order> {
    try {
      const normalizedSymbol = this.normalizeSymbol(symbol);
      const order = await this.exchange.fetchOrder(orderId, normalizedSymbol);
      
      logger.debug('Order fetched', { symbol, orderId, status: order.status });
      return order;
    } catch (error) {
      logger.error('Failed to fetch order', { error: serializeError(error), symbol, orderId });
      throw error;
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(symbol: string, orderId: string): Promise<ccxt.Order> {
    try {
      const normalizedSymbol = this.normalizeSymbol(symbol);
      const order = await this.exchange.cancelOrder(orderId, normalizedSymbol);
      
      logger.info('Order cancelled', { symbol, orderId, status: order.status });
      return order;
    } catch (error) {
      logger.error('Failed to cancel order', { error: serializeError(error), symbol, orderId });
      throw error;
    }
  }

  /**
   * Check exchange connectivity
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.exchange.fetchStatus();
      return true;
    } catch (error) {
      logger.error('Exchange health check failed', { error: serializeError(error) });
      return false;
    }
  }

  /**
   * Get exchange balance
   */
  async getBalance(): Promise<ccxt.Balances> {
    try {
      const balance = await this.exchange.fetchBalance();
      return balance;
    } catch (error) {
      logger.error('Failed to fetch balance', { error: serializeError(error) });
      throw error;
    }
  }
}
