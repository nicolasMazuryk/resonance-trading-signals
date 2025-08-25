import { 
  Signal, 
  Position, 
  Order, 
  PositionAnalytics, 
  OverallAnalytics
} from '../types';
import { FileStorage } from './fileStorage';
import { logger, serializeError } from '../utils/logger';
import { calculateTakerFee, calculateMakerFee } from '../utils/feeCalculator';
import { config } from '../config';

export class AnalyticsService {
  private fileStorage: FileStorage;

  constructor(fileStorage: FileStorage) {
    this.fileStorage = fileStorage;
  }

  /**
   * Calculate and save position analytics when a position is opened
   */
  async calculatePositionEntryAnalytics(
    signal: Signal,
    position: Position,
    entryOrder: Order
  ): Promise<void> {
    try {
      if (!entryOrder.filledAmount || !entryOrder.filledPrice) {
        logger.warn('Cannot calculate entry analytics - order not filled', { orderId: entryOrder.id });
        return;
      }

      const signalEntryPrice = signal.type === 'open' ? (signal as any).price : 0;
      const actualEntryPrice = entryOrder.filledPrice;
      
      // Calculate slippage based on position direction
      // For LONG: slippage = (actualPrice - signalPrice) * filledAmount
      // For SHORT: slippage = (signalPrice - actualPrice) * filledAmount
      // Positive slippage = disadvantage (cost), Negative slippage = advantage (savings)
      const entrySlippage = position.side === 'LONG' 
        ? (actualEntryPrice - signalEntryPrice) * entryOrder.filledAmount
        : (signalEntryPrice - actualEntryPrice) * entryOrder.filledAmount;
      // Calculate slippage percentage based on position direction
      // For LONG: positive when actual > signal (disadvantage), negative when actual < signal (advantage)
      // For SHORT: positive when signal > actual (disadvantage), negative when signal < actual (advantage)
      const entrySlippagePercent = position.side === 'LONG'
        ? ((actualEntryPrice - signalEntryPrice) / signalEntryPrice) * 100
        : ((signalEntryPrice - actualEntryPrice) / signalEntryPrice) * 100;
      const entryFees = entryOrder.type === 'market' 
        ? calculateTakerFee(entryOrder.filledAmount, actualEntryPrice, config.exchange.fees.taker)
        : calculateMakerFee(entryOrder.filledAmount, actualEntryPrice, config.exchange.fees.maker);

      // Ensure signal timestamp is a Date object
      const signalTimestamp = signal.timestamp instanceof Date ? signal.timestamp : new Date(signal.timestamp);
      const entryExecutionDelayMs = entryOrder.createdAt.getTime() - signalTimestamp.getTime();

      const positionAnalytics: PositionAnalytics = {
        id: `pa_${position.id}`,
        positionId: position.id,
        signalId: signal.messageHash,
        symbol: position.symbol,
        side: position.side,
        
        // Entry information
        signalEntryPrice,
        actualEntryPrice,
        entrySlippage,
        entrySlippagePercent,
        entryFees,
        
        // Position performance (will be updated when position closes)
        totalFees: entryFees,
        totalSlippage: entrySlippage,
        realizedPnL: 0,
        totalPnL: 0,
        
        // Trade classification (will be updated when position closes)
        tradeResult: 'none', // Default, will be updated when position closes
        
        // Timing
        entryTime: position.entryTime instanceof Date ? position.entryTime : new Date(position.entryTime),
        entryExecutionDelayMs,
        
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.fileStorage.savePositionAnalytics(positionAnalytics);

      logger.info('Position entry analytics calculated', {
        positionId: position.id,
        entrySlippage,
        entrySlippagePercent,
        entryFees,
        entryExecutionDelayMs
      });
    } catch (error) {
      logger.error('Failed to calculate position entry analytics', { 
        error: serializeError(error), 
        positionId: position.id 
      });
    }
  }

  /**
   * Update position analytics when a position is closed
   */
  async updatePositionExitAnalytics(
    position: Position,
    exitOrder: Order,
    signalExitPrice?: number
  ): Promise<void> {
    try {
      if (!exitOrder.filledAmount || !exitOrder.filledPrice) {
        logger.warn('Cannot calculate exit analytics - order not filled', { orderId: exitOrder.id });
        return;
      }

      const existingAnalytics = this.fileStorage.getPositionAnalyticsByPosition(position.id);
      if (!existingAnalytics) {
        logger.warn('No existing analytics found for position', { positionId: position.id });
        return;
      }

      const actualExitPrice = exitOrder.filledPrice;
      
      // Calculate exit slippage based on position direction
      // For LONG: slippage = (signalPrice - actualPrice) * filledAmount (we want higher exit price)
      // For SHORT: slippage = (actualPrice - signalPrice) * filledAmount (we want lower exit price)
      // Positive slippage = disadvantage (cost), Negative slippage = advantage (savings)
      const exitSlippage = signalExitPrice 
        ? (position.side === 'LONG' 
            ? (signalExitPrice - actualExitPrice) * exitOrder.filledAmount
            : (actualExitPrice - signalExitPrice) * exitOrder.filledAmount)
        : 0;
      // Calculate exit slippage percentage based on position direction
      // For LONG: positive when signal > actual (disadvantage), negative when signal < actual (advantage)
      // For SHORT: positive when actual > signal (disadvantage), negative when actual < signal (advantage)
      const exitSlippagePercent = signalExitPrice 
        ? (position.side === 'LONG'
            ? ((signalExitPrice - actualExitPrice) / signalExitPrice) * 100
            : ((actualExitPrice - signalExitPrice) / signalExitPrice) * 100)
        : 0;
      const exitFees = exitOrder.type === 'market' 
        ? calculateTakerFee(exitOrder.filledAmount, actualExitPrice, config.exchange.fees.taker)
        : calculateMakerFee(exitOrder.filledAmount, actualExitPrice, config.exchange.fees.maker);

      // Ensure entryTime and closeTime are Date objects
      const entryTime = position.entryTime instanceof Date ? position.entryTime : new Date(position.entryTime);
      const closeTime = position.closeTime instanceof Date ? position.closeTime : (position.closeTime ? new Date(position.closeTime) : null);
      
      const exitExecutionDelayMs = exitOrder.createdAt.getTime() - entryTime.getTime();
      const durationMs = closeTime ? closeTime.getTime() - entryTime.getTime() : 0;

      // Calculate total performance
      const totalFees = existingAnalytics.totalFees + exitFees;
      const totalSlippage = existingAnalytics.totalSlippage + exitSlippage;
      const realizedPnL = position.realizedPnL || 0;
      const totalPnL = realizedPnL - totalFees - totalSlippage;

      // Classify trade result based on signal type (closeReason), not actual PnL
      let tradeResult: 'profitable' | 'breakeven' | 'loss' | 'none';
      let profitPercent: number | undefined;

      // Calculate profit percent for all close reasons
      profitPercent = (totalPnL / position.sizeUsdt) * 100;

      if (position.closeReason === 'Take profit achieved') {
        tradeResult = 'profitable';
      } else if (position.closeReason === 'Breakeven') {
        tradeResult = 'breakeven';
      } else if (position.closeReason === 'Stop loss') {
        tradeResult = 'loss';
      } else {
        tradeResult = 'none';
      }

      const updates: Partial<PositionAnalytics> = {
        actualExitPrice,
        exitSlippage,
        exitSlippagePercent,
        exitFees,
        totalFees,
        totalSlippage,
        realizedPnL,
        totalPnL,
        tradeResult,
        durationMs,
        exitExecutionDelayMs,
        updatedAt: new Date(),
        ...(signalExitPrice && { signalExitPrice }),
        ...(closeTime && { exitTime: closeTime })
      };

      this.fileStorage.updatePositionAnalytics(position.id, updates);

      logger.info('Position exit analytics updated', {
        positionId: position.id,
        totalPnL,
        tradeResult,
        ...(profitPercent !== undefined && { profitPercent }),
        totalFees,
        totalSlippage
      });
    } catch (error) {
      logger.error('Failed to update position exit analytics', { 
        error: serializeError(error), 
        positionId: position.id 
      });
    }
  }

  /**
   * Calculate overall analytics for a given period
   */
  async calculateOverallAnalytics(
    period: OverallAnalytics['period'] = 'all_time',
    startDate?: Date,
    endDate?: Date
  ): Promise<OverallAnalytics> {
    try {
      const positionAnalytics = this.fileStorage.getPositionAnalytics();
      const signals = this.fileStorage.getSignals();

      // Filter by date range if provided
      let filteredAnalytics = positionAnalytics;
      let filteredSignals = signals;

      if (startDate && endDate) {
        filteredAnalytics = positionAnalytics.filter(pa => 
          pa.entryTime >= startDate && pa.entryTime <= endDate
        );
        filteredSignals = signals.filter(s => 
          s.timestamp >= startDate && s.timestamp <= endDate
        );
      }

      // Calculate signal counts
      const totalSignals = filteredSignals.length;
      const openSignals = filteredSignals.filter(s => s.type === 'open').length;
      const closedSignals = filteredSignals.filter(s => s.type === 'close').length;

      // Calculate trade results
      const closedAnalytics = filteredAnalytics.filter(pa => pa.exitTime);
      const profitableTrades = closedAnalytics.filter(pa => pa.tradeResult === 'profitable').length;
      const breakevenTrades = closedAnalytics.filter(pa => pa.tradeResult === 'breakeven').length;
      const lossTrades = closedAnalytics.filter(pa => pa.tradeResult === 'loss').length;
      const noneTrades = closedAnalytics.filter(pa => pa.tradeResult === 'none').length;
      const totalTrades = closedAnalytics.length;
      
      const profitableTradesPercent = totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0;
      const breakevenTradesPercent = totalTrades > 0 ? (breakevenTrades / totalTrades) * 100 : 0;
      const lossTradesPercent = totalTrades > 0 ? (lossTrades / totalTrades) * 100 : 0;
      const noneTradesPercent = totalTrades > 0 ? (noneTrades / totalTrades) * 100 : 0;

      // Calculate financial metrics
      const totalSlippage = filteredAnalytics.reduce((sum, pa) => sum + pa.totalSlippage, 0);
      const totalFees = filteredAnalytics.reduce((sum, pa) => sum + pa.totalFees, 0);
      const totalPnL = filteredAnalytics.reduce((sum, pa) => sum + pa.totalPnL, 0);
      const totalRealizedPnL = filteredAnalytics.reduce((sum, pa) => sum + (pa.realizedPnL || 0), 0);
      const totalUnrealizedPnL = filteredAnalytics.reduce((sum, pa) => sum + (pa.unrealizedPnL || 0), 0);

      // Calculate averages
      const averageSlippage = filteredAnalytics.length > 0 ? totalSlippage / filteredAnalytics.length : 0;
      const averageFees = filteredAnalytics.length > 0 ? totalFees / filteredAnalytics.length : 0;
      const averagePnL = filteredAnalytics.length > 0 ? totalPnL / filteredAnalytics.length : 0;
      const winRate = totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0;

      // Calculate execution quality metrics
      const averageExecutionDelayMs = filteredAnalytics.length > 0 
        ? filteredAnalytics.reduce((sum, pa) => sum + pa.entryExecutionDelayMs, 0) / filteredAnalytics.length 
        : 0;
      
      const averageEntrySlippagePercent = filteredAnalytics.length > 0 
        ? filteredAnalytics.reduce((sum, pa) => sum + Math.abs(pa.entrySlippagePercent), 0) / filteredAnalytics.length 
        : 0;
      
      const averageExitSlippagePercent = closedAnalytics.length > 0 
        ? closedAnalytics.reduce((sum, pa) => sum + Math.abs(pa.exitSlippagePercent || 0), 0) / closedAnalytics.length 
        : 0;

      // Calculate symbol breakdown
      const symbolBreakdown: OverallAnalytics['symbolBreakdown'] = {};
      const symbolGroups = filteredAnalytics.reduce((groups, pa) => {
        if (!groups[pa.symbol]) {
          groups[pa.symbol] = [];
        }
        groups[pa.symbol]!.push(pa);
        return groups;
      }, {} as Record<string, PositionAnalytics[]>);

      Object.entries(symbolGroups).forEach(([symbol, analytics]) => {
        const closedAnalyticsForSymbol = analytics.filter(pa => pa.exitTime);
        const profitableTradesForSymbol = closedAnalyticsForSymbol.filter(pa => pa.tradeResult === 'profitable').length;
        const totalPnLForSymbol = analytics.reduce((sum, pa) => sum + pa.totalPnL, 0);
        const totalSlippageForSymbol = analytics.reduce((sum, pa) => sum + pa.totalSlippage, 0);
        const totalFeesForSymbol = analytics.reduce((sum, pa) => sum + pa.totalFees, 0);

        symbolBreakdown[symbol] = {
          totalTrades: closedAnalyticsForSymbol.length,
          profitableTrades: profitableTradesForSymbol,
          totalPnL: totalPnLForSymbol,
          totalSlippage: totalSlippageForSymbol,
          totalFees: totalFeesForSymbol
        };
      });

      const overallAnalytics: OverallAnalytics = {
        id: `oa_${period}_${Date.now()}`,
        period,
        startDate: startDate || new Date(0),
        endDate: endDate || new Date(),
        
        // Signal counts
        totalSignals,
        openSignals,
        closedSignals,
        
        // Trade results
        profitableTrades,
        profitableTradesPercent,
        breakevenTrades,
        breakevenTradesPercent,
        lossTrades,
        lossTradesPercent,
        noneTrades,
        noneTradesPercent,
        
        // Financial metrics
        totalSlippage,
        totalFees,
        totalPnL,
        totalRealizedPnL,
        totalUnrealizedPnL,
        
        // Performance metrics
        averageSlippage,
        averageFees,
        averagePnL,
        winRate,
        
        // Execution quality
        averageExecutionDelayMs,
        averageEntrySlippagePercent,
        averageExitSlippagePercent,
        
        // Symbol breakdown
        symbolBreakdown,
        
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.fileStorage.saveOverallAnalytics(overallAnalytics);

      logger.info('Overall analytics calculated', {
        period,
        totalSignals,
        totalTrades,
        profitableTrades,
        totalPnL,
        winRate
      });

      return overallAnalytics;
    } catch (error) {
      logger.error('Failed to calculate overall analytics', { 
        error: serializeError(error), 
        period 
      });
      throw error;
    }
  }

  /**
   * Get the latest overall analytics for a given period
   */
  getLatestOverallAnalytics(period: OverallAnalytics['period'] = 'all_time'): OverallAnalytics | undefined {
    return this.fileStorage.getLatestOverallAnalytics(period);
  }

  /**
   * Get position analytics for a specific position
   */
  getPositionAnalytics(positionId: string): PositionAnalytics | undefined {
    return this.fileStorage.getPositionAnalyticsByPosition(positionId);
  }

  /**
   * Get all position analytics
   */
  getAllPositionAnalytics(): PositionAnalytics[] {
    return this.fileStorage.getPositionAnalytics();
  }

  /**
   * Get position analytics for a specific symbol
   */
  getPositionAnalyticsBySymbol(symbol: string): PositionAnalytics[] {
    return this.fileStorage.getPositionAnalyticsBySymbol(symbol);
  }
}
