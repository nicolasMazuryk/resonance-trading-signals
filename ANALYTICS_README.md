# Analytics System Documentation

## Overview

The new analytics system provides comprehensive tracking and analysis of trading performance at two levels:

1. **Per-Position Analytics**: Detailed analysis of each individual trade
2. **Overall Analytics**: Summary statistics across all trades

## Features

### Per-Position Analytics

Each position is tracked with detailed analytics including:

- **Signal vs Execution Comparison**
  - Signal entry price vs actual execution price
  - Entry slippage (in USDT and percentage) - accounts for position direction
  - Entry fees
  - Exit slippage (when position closes) - accounts for position direction
  - Exit fees

- **Slippage Calculation Logic**
  - **LONG Positions**: 
    - Entry: `slippage = (actualPrice - signalPrice) * filledAmount`
    - Exit: `slippage = (signalPrice - actualPrice) * filledAmount`
  - **SHORT Positions**: 
    - Entry: `slippage = (signalPrice - actualPrice) * filledAmount`
    - Exit: `slippage = (actualPrice - signalPrice) * filledAmount`
  - **Positive slippage = disadvantage (cost)**
  - **Negative slippage = advantage (savings)**

- **Performance Metrics**
  - Total fees
  - Total slippage
  - Realized PnL
  - Total PnL (including fees and slippage)
  - Trade classification (profitable/breakeven/loss) - based on signal type
  - Profit percentage

- **Trade Result Classification**
  - **Profitable**: When close reason is "Take profit achieved"
  - **Breakeven**: When close reason is "Breakeven"
  - **Loss**: When close reason is "Stop loss"
  - Classification is based on signal type, not actual PnL amount
  - **Profit Percent**: Calculated for all close reasons using `(totalPnL / position.sizeUsdt) * 100`

- **Timing Information**
  - Entry time
  - Exit time (when closed)
  - Duration
  - Execution delays

### Overall Analytics

Comprehensive summary statistics including:

- **Signal Counts**
  - Total signals
  - Open signals
  - Closed signals

- **Trade Results**
  - Profitable trades count and percentage
  - Breakeven trades count and percentage
  - Loss trades count and percentage
  - Win rate

- **Financial Metrics**
  - Total slippage
  - Total fees
  - Total PnL
  - Average metrics per trade

- **Execution Quality**
  - Average execution delay
  - Average entry/exit slippage percentages

- **Symbol Breakdown**
  - Per-symbol performance metrics

## Usage

### CLI Commands

#### View Analytics Data

```bash
# View position analytics
npm run cli data --type position-analytics

# View overall analytics
npm run cli data --type overall-analytics

# View analytics for specific symbol
npm run cli data --type position-analytics --symbol BTCUSDT
```

#### Generate and View Analytics

```bash
# Generate new overall analytics
npm run cli analytics --generate

# Generate analytics for specific period
npm run cli analytics --generate --period daily

# Generate analytics for date range
npm run cli analytics --generate --start-date 2024-01-01 --end-date 2024-01-31

# View existing analytics
npm run cli analytics --period all_time
```

#### Test Analytics System

```bash
# Run analytics tests
npm run cli test-slippage-correction
```

### Programmatic Usage

```typescript
import { FileStorage } from './src/services/fileStorage';
import { AnalyticsService } from './src/services/analyticsService';

const fileStorage = new FileStorage();
const analyticsService = new AnalyticsService(fileStorage);

// Get position analytics
const positionAnalytics = analyticsService.getAllPositionAnalytics();
const symbolAnalytics = analyticsService.getPositionAnalyticsBySymbol('BTCUSDT');

// Generate overall analytics
const overallAnalytics = await analyticsService.calculateOverallAnalytics('all_time');

// Get latest analytics
const latestAnalytics = analyticsService.getLatestOverallAnalytics('daily');
```

## Data Structure

### PositionAnalytics

```typescript
interface PositionAnalytics {
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
  totalPnL: number; // realized - fees - slippage
  
  // Trade classification
  tradeResult: 'profitable' | 'breakeven' | 'loss';
  profitPercent?: number;
  
  // Timing
  entryTime: Date;
  exitTime?: Date;
  durationMs?: number;
  
  // Execution quality
  entryExecutionDelayMs: number;
  exitExecutionDelayMs?: number;
}
```

### OverallAnalytics

```typescript
interface OverallAnalytics {
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
  
  // Financial metrics
  totalSlippage: number;
  totalFees: number;
  totalPnL: number;
  averageSlippage: number;
  averageFees: number;
  averagePnL: number;
  winRate: number;
  
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
}
```

## Integration Points

The analytics system is automatically integrated into the order execution flow:

1. **Position Entry**: Analytics are calculated when a position is opened
2. **Position Exit**: Analytics are updated when a position is closed
3. **Manual Generation**: Overall analytics can be generated on-demand

## File Storage

Analytics data is stored in JSON files:

- `data/position-analytics.json` - Per-position analytics
- `data/overall-analytics.json` - Overall analytics summaries

## Migration from Old System

The new analytics system replaces the old `Analytics` interface with more comprehensive tracking:

- **Old**: Basic order-level analytics with price deviation and fees
- **New**: Position-level analytics with complete trade lifecycle tracking

The old analytics data is preserved in `data/analytics.json` for backward compatibility.

## Recent Improvements

### Slippage Calculation Enhancements

- **Position Direction Awareness**: Slippage calculation now properly accounts for LONG vs SHORT positions
- **Correct Formulas**:
  - **LONG Entry**: `slippage = (actualPrice - signalPrice) * filledAmount`
  - **LONG Exit**: `slippage = (signalPrice - actualPrice) * filledAmount`
  - **SHORT Entry**: `slippage = (signalPrice - actualPrice) * filledAmount`
  - **SHORT Exit**: `slippage = (actualPrice - signalPrice) * filledAmount`
- **Cost-Based Logic**: 
  - Positive slippage = disadvantage (cost)
  - Negative slippage = advantage (savings)

### Trade Result Classification Improvements

- **Signal-Based Classification**: Trade results are now based on the signal type (closeReason) rather than actual PnL
- **Accurate Categorization**:
  - "Take profit achieved" → Profitable trade
  - "Breakeven" → Breakeven trade  
  - "Stop loss" → Loss trade
- **Profit Percent Calculation**: Now calculated for all close reasons, not just take profit
- **Consistent Analysis**: This ensures analytics reflect the intended strategy outcome, not just the final PnL

## Performance Considerations

- Analytics calculations are performed asynchronously to avoid blocking order execution
- Position analytics are updated incrementally as positions are opened and closed
- Overall analytics can be generated on-demand or scheduled
- Large datasets are handled efficiently with proper filtering and aggregation

## Troubleshooting

### Common Issues

1. **No Analytics Data**: Ensure positions have been opened and closed
2. **Missing Exit Analytics**: Check that positions are properly closed
3. **Incorrect PnL Calculations**: Verify fee and slippage calculations

### Debug Commands

```bash
# Check analytics files
npm run cli data --type position-analytics --limit 1
npm run cli data --type overall-analytics --limit 1

# Test analytics generation
npm run cli test-slippage-correction
```
