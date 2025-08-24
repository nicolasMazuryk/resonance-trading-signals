import { ExchangeService } from '../src/services/exchangeService';
import { config } from '../src/config';
import { logger } from '../src/utils/logger';

async function testNewOrderFlow() {
  try {
    const exchangeService = new ExchangeService();
    await exchangeService.initialize();

    const symbol = 'BTC/USDT';
    const side = 'buy';
    const amount = 0.001; // Small amount for testing
    const stopLossPrice = 40000; // Example stop-loss
    const takeProfitPrice = 45000; // Example take-profit

    logger.info('Testing new order flow...', {
      symbol,
      side,
      amount,
      stopLossPrice,
      takeProfitPrice
    });

    // Step 1: Place market order (should work without error)
    logger.info('Step 1: Placing market order...');
    const marketOrder = await exchangeService.placeMarketOrder(symbol, side, amount);
    logger.info('Market order placed successfully', { orderId: marketOrder.id });

    // Step 2: Place stop-loss order
    logger.info('Step 2: Placing stop-loss order...');
    const stopLossOrder = await exchangeService.placeStopLossOrder(
      symbol,
      'sell', // Opposite side for stop-loss
      amount,
      stopLossPrice
    );
    logger.info('Stop-loss order placed successfully', { 
      orderId: stopLossOrder.id,
      reduceOnly: true,
      orderType: 'stop_market'
    });

    // Step 3: Place take-profit order
    logger.info('Step 3: Placing take-profit order...');
    const takeProfitOrder = await exchangeService.placeTakeProfitOrder(
      symbol,
      'sell', // Opposite side for take-profit
      amount,
      takeProfitPrice
    );
    logger.info('Take-profit order placed successfully', { 
      orderId: takeProfitOrder.id,
      reduceOnly: true,
      orderType: 'take_profit_market'
    });

    logger.info('All orders placed successfully!', {
      marketOrderId: marketOrder.id,
      stopLossOrderId: stopLossOrder.id,
      takeProfitOrderId: takeProfitOrder.id
    });

    // Clean up: Cancel all orders
    logger.info('Cleaning up: Cancelling all orders...');
    const cancelledOrders = await exchangeService.cancelAllOrders(symbol);
    logger.info('Cleanup completed', { cancelledCount: cancelledOrders.length });

  } catch (error) {
    logger.error('Test failed', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

// Run the test
testNewOrderFlow()
  .then(() => {
    logger.info('Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Test failed', { error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  });
