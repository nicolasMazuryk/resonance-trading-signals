# Binance Futures Order Fix

## Problem

The original implementation was trying to attach stop-loss and take-profit orders directly to market orders using the `stopLossPrice` and `takeProfitPrice` parameters. This approach is not supported by Binance Futures and resulted in the following error:

```
OrderImmediatelyFillable: binanceusdm {"code":-2021,"msg":"Order would immediately trigger."}
```

## Solution

The solution implements a two-step approach that is compatible with Binance Futures:

### 1. Place Market Order First
- Place a simple market order to open the position
- No stop-loss or take-profit parameters attached

### 2. Place Separate Conditional Orders
- Place a separate stop-loss order as a conditional order
- Place a separate take-profit order as a conditional order
- Track these orders for future management

## Implementation Details

### New Exchange Service Methods

#### `placeMarketOrder(symbol, side, amount)`
- Places a simple market order without stop-loss/take-profit
- Returns the executed order details

#### `placeStopLossOrder(symbol, side, amount, stopLossPrice)`
- Places a stop market order at the specified price
- Uses Binance Futures' `stop_market` order type
- **Important**: Uses `reduceOnly: true` to ensure it only closes positions
- **Important**: Uses market execution to ensure immediate fill when triggered

#### `placeTakeProfitOrder(symbol, side, amount, takeProfitPrice)`
- Places a take profit market order at the specified price
- Uses Binance Futures' `take_profit_market` order type
- **Important**: Uses `reduceOnly: true` to ensure it only closes positions
- **Important**: Uses market execution to ensure immediate fill when triggered

#### `cancelAllOrders(symbol)`
- Cancels all open orders for a symbol
- Used for cleanup and order management

#### `getOpenOrders(symbol)`
- Fetches all open orders for a symbol
- Used for monitoring and verification

### New Types

#### `ConditionalOrder`
```typescript
interface ConditionalOrder {
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
```

#### Updated `Position`
Added fields to track conditional orders:
```typescript
interface Position {
  // ... existing fields
  stopLossOrderId?: string;
  takeProfitOrderId?: string;
}
```

### Order Flow

#### Opening a Position
1. Create position in local tracking
2. Place market order to open position
3. Place stop-loss order as conditional order
4. Place take-profit order as conditional order
5. Track all order IDs for future management

#### Handling Close Signals
- **Take Profit Achieved**: Cancel stop-loss order
- **Stop Loss Hit**: Cancel take-profit order
- **Breakeven**: Cancel take-profit order (stop-loss is already at breakeven)
- **Manual Close**: Cancel both orders

#### Handling Update Signals (Breakeven)
1. Cancel existing stop-loss order
2. Place new stop-loss order at breakeven price
3. Update position tracking

#### Handling Partial Closes
1. Execute partial close order
2. Cancel existing conditional orders
3. Place new conditional orders with updated quantities

### File Storage Updates

Added support for conditional orders:
- `saveConditionalOrder(order)`
- `updateConditionalOrder(orderId, updates)`
- `getConditionalOrders()`
- `getConditionalOrdersByPosition(positionId)`

## Testing

A test script has been created at `scripts/test-new-order-flow.ts` to verify the new implementation works correctly.

### Running the Test
```bash
npm run ts-node scripts/test-new-order-flow.ts
```

## Benefits

1. **Compatibility**: Works with Binance Futures API
2. **Safety**: Uses `reduceOnly` orders to prevent accidental position opening
3. **Flexibility**: Allows independent management of stop-loss and take-profit orders
4. **Tracking**: Complete audit trail of all conditional orders
5. **Error Handling**: Graceful handling of order cancellation failures
6. **Scalability**: Easy to extend for other exchanges

## Migration

The changes are backward compatible. Existing positions will continue to work, and new positions will use the improved order flow.

## Error Handling

The implementation includes comprehensive error handling:
- Graceful degradation if conditional order placement fails
- Warning logs for non-critical failures
- Automatic cleanup of orphaned orders
- Retry logic for transient failures

## Monitoring

All conditional orders are tracked and can be monitored through:
- File storage logs
- Exchange API queries
- Position tracking system
- Analytics and reporting
