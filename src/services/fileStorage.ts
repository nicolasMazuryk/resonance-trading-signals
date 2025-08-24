import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Signal, Order, Analytics, Position, PartialClose, PositionUpdate, ConditionalOrder } from '../types';
import { logger, serializeError } from '../utils/logger';

export class FileStorage {
  private dataDir: string;
  private signalsFile: string;
  private ordersFile: string;
  private analyticsFile: string;
  private positionsFile: string;
  private partialClosesFile: string;
  private positionUpdatesFile: string;
  private conditionalOrdersFile: string;

  constructor() {
    this.dataDir = join(process.cwd(), 'data');
    this.signalsFile = join(this.dataDir, 'signals.json');
    this.ordersFile = join(this.dataDir, 'orders.json');
    this.analyticsFile = join(this.dataDir, 'analytics.json');
    this.positionsFile = join(this.dataDir, 'positions.json');
    this.partialClosesFile = join(this.dataDir, 'partial-closes.json');
    this.positionUpdatesFile = join(this.dataDir, 'position-updates.json');
    this.conditionalOrdersFile = join(this.dataDir, 'conditional-orders.json');

    this.ensureDataDir();
    this.initializeFiles();
  }

  private ensureDataDir(): void {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
      logger.info('Created data directory', { path: this.dataDir });
    }
  }

  private initializeFiles(): void {
    const files = [
      { path: this.signalsFile, default: [] },
      { path: this.ordersFile, default: [] },
      { path: this.analyticsFile, default: [] },
      { path: this.positionsFile, default: [] },
      { path: this.partialClosesFile, default: [] },
      { path: this.positionUpdatesFile, default: [] },
      { path: this.conditionalOrdersFile, default: [] },
    ];

    files.forEach(({ path, default: defaultValue }) => {
      if (!existsSync(path)) {
        writeFileSync(path, JSON.stringify(defaultValue, null, 2));
        logger.info('Initialized file', { path });
      }
    });
  }

  private readFile<T>(filePath: string): T[] {
    try {
      const content = readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      logger.error('Failed to read file', { error: serializeError(error), filePath });
      return [];
    }
  }

  private writeFile<T>(filePath: string, data: T[]): void {
    try {
      writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error('Failed to write file', { error: serializeError(error), filePath });
      throw error;
    }
  }

  // Signal operations
  saveSignal(signal: Signal): void {
    const signals = this.readFile<Signal>(this.signalsFile);
    
    // Check for duplicate
    const exists = signals.some(s => s.messageHash === signal.messageHash);
    if (exists) {
      logger.info('Signal already exists, skipping', { messageHash: signal.messageHash });
      return;
    }

    signals.push(signal);
    this.writeFile(this.signalsFile, signals);
    logger.info('Signal saved', { messageHash: signal.messageHash, type: signal.type });
  }

  getSignals(): Signal[] {
    return this.readFile<Signal>(this.signalsFile);
  }

  getSignalsBySymbol(symbol: string): Signal[] {
    const signals = this.readFile<Signal>(this.signalsFile);
    return signals.filter(s => s.symbol === symbol);
  }

  signalExists(messageHash: string): boolean {
    const signals = this.readFile<Signal>(this.signalsFile);
    return signals.some(s => s.messageHash === messageHash);
  }

  // Order operations
  saveOrder(order: Order): void {
    const orders = this.readFile<Order>(this.ordersFile);
    orders.push(order);
    this.writeFile(this.ordersFile, orders);
    logger.info('Order saved', { orderId: order.id, symbol: order.symbol });
  }

  updateOrder(orderId: string, updates: Partial<Order>): void {
    const orders = this.readFile<Order>(this.ordersFile);
    const index = orders.findIndex(o => o.id === orderId);
    
    if (index !== -1) {
      orders[index] = { ...orders[index], ...updates, updatedAt: new Date() } as Order;
      this.writeFile(this.ordersFile, orders);
      logger.info('Order updated', { orderId, updates });
    }
  }

  getOrders(): Order[] {
    return this.readFile<Order>(this.ordersFile);
  }

  getOrdersBySymbol(symbol: string): Order[] {
    const orders = this.readFile<Order>(this.ordersFile);
    return orders.filter(o => o.symbol === symbol);
  }

  getOrdersByStatus(status: Order['status']): Order[] {
    const orders = this.readFile<Order>(this.ordersFile);
    return orders.filter(o => o.status === status);
  }

  getPendingOrders(): Order[] {
    return this.getOrdersByStatus('pending');
  }

  // Analytics operations
  saveAnalytics(analytics: Analytics): void {
    const analyticsList = this.readFile<Analytics>(this.analyticsFile);
    analyticsList.push(analytics);
    this.writeFile(this.analyticsFile, analyticsList);
    logger.info('Analytics saved', { analyticsId: analytics.id });
  }

  getAnalytics(): Analytics[] {
    return this.readFile<Analytics>(this.analyticsFile);
  }

  getAnalyticsBySymbol(symbol: string): Analytics[] {
    const analytics = this.readFile<Analytics>(this.analyticsFile);
    return analytics.filter(a => a.symbol === symbol);
  }

  getHighDeviationAnalytics(threshold: number = 2): Analytics[] {
    const analytics = this.readFile<Analytics>(this.analyticsFile);
    return analytics.filter(a => Math.abs(a.priceDeviationPercent) > threshold);
  }

  // Position operations
  savePosition(position: Position): void {
    const positions = this.readFile<Position>(this.positionsFile);
    positions.push(position);
    this.writeFile(this.positionsFile, positions);
    logger.info('Position saved', { positionId: position.id, symbol: position.symbol });
  }

  getPositions(): Position[] {
    return this.readFile<Position>(this.positionsFile);
  }

  getOpenPosition(symbol: string): Position | undefined {
    const positions = this.readFile<Position>(this.positionsFile);
    return positions.find(p => p.symbol === symbol && p.status === 'open');
  }

  updatePosition(positionId: string, updates: Partial<Position>): void {
    const positions = this.readFile<Position>(this.positionsFile);
    const index = positions.findIndex(p => p.id === positionId);
    if (index !== -1) {
      positions[index] = { ...positions[index], ...updates } as Position;
      this.writeFile(this.positionsFile, positions);
      logger.info('Position updated', { positionId, updates });
    }
  }

  getPositionsByStatus(status: Position['status']): Position[] {
    const positions = this.readFile<Position>(this.positionsFile);
    return positions.filter(p => p.status === status);
  }

  // Partial close operations
  savePartialClose(partialClose: PartialClose): void {
    const partialCloses = this.readFile<PartialClose>(this.partialClosesFile);
    partialCloses.push(partialClose);
    this.writeFile(this.partialClosesFile, partialCloses);
    logger.info('Partial close saved', { partialCloseId: partialClose.id });
  }

  updatePartialClose(partialCloseId: string, updates: Partial<PartialClose>): void {
    const partialCloses = this.readFile<PartialClose>(this.partialClosesFile);
    const index = partialCloses.findIndex(pc => pc.id === partialCloseId);
    if (index !== -1) {
      partialCloses[index] = { ...partialCloses[index], ...updates } as PartialClose;
      this.writeFile(this.partialClosesFile, partialCloses);
      logger.info('Partial close updated', { partialCloseId, updates });
    }
  }

  getPartialCloses(): PartialClose[] {
    return this.readFile<PartialClose>(this.partialClosesFile);
  }

  getPartialClosesByPosition(positionId: string): PartialClose[] {
    const partialCloses = this.readFile<PartialClose>(this.partialClosesFile);
    return partialCloses.filter(pc => pc.positionId === positionId);
  }

  // Position update operations
  savePositionUpdate(update: PositionUpdate): void {
    const updates = this.readFile<PositionUpdate>(this.positionUpdatesFile);
    updates.push(update);
    this.writeFile(this.positionUpdatesFile, updates);
    logger.info('Position update saved', { updateId: update.id });
  }

  getPositionUpdates(): PositionUpdate[] {
    return this.readFile<PositionUpdate>(this.positionUpdatesFile);
  }

  getPositionUpdatesByPosition(positionId: string): PositionUpdate[] {
    const updates = this.readFile<PositionUpdate>(this.positionUpdatesFile);
    return updates.filter(u => u.positionId === positionId);
  }

  // Conditional order operations
  saveConditionalOrder(order: ConditionalOrder): void {
    const conditionalOrders = this.readFile<ConditionalOrder>(this.conditionalOrdersFile);
    conditionalOrders.push(order);
    this.writeFile(this.conditionalOrdersFile, conditionalOrders);
    logger.info('Conditional order saved', { orderId: order.id });
  }

  updateConditionalOrder(orderId: string, updates: Partial<ConditionalOrder>): void {
    const conditionalOrders = this.readFile<ConditionalOrder>(this.conditionalOrdersFile);
    const index = conditionalOrders.findIndex(co => co.id === orderId);
    if (index !== -1) {
      conditionalOrders[index] = { ...conditionalOrders[index], ...updates } as ConditionalOrder;
      this.writeFile(this.conditionalOrdersFile, conditionalOrders);
      logger.info('Conditional order updated', { orderId, updates });
    }
  }

  getConditionalOrders(): ConditionalOrder[] {
    return this.readFile<ConditionalOrder>(this.conditionalOrdersFile);
  }

  getConditionalOrdersByPosition(positionId: string): ConditionalOrder[] {
    const conditionalOrders = this.readFile<ConditionalOrder>(this.conditionalOrdersFile);
    return conditionalOrders.filter(co => co.positionId === positionId);
  }

  getSummaryStats(): {
    totalSignals: number;
    totalOrders: number;
    totalPositions: number;
    openPositions: number;
    closedPositions: number;
    avgDeviation: number;
    avgDelay: number;
    successRate: number;
  } {
    const signals = this.readFile<Signal>(this.signalsFile);
    const orders = this.readFile<Order>(this.ordersFile);
    const analytics = this.readFile<Analytics>(this.analyticsFile);
    const positions = this.readFile<Position>(this.positionsFile);

    const totalSignals = signals.length;
    const totalOrders = orders.length;
    const totalPositions = positions.length;
    const openPositions = positions.filter(p => p.status === 'open').length;
    const closedPositions = positions.filter(p => p.status === 'closed').length;
    
    let avgDeviation = 0;
    let avgDelay = 0;
    let successCount = 0;

    if (analytics.length > 0) {
      avgDeviation = analytics.reduce((sum, a) => sum + Math.abs(a.priceDeviationPercent), 0) / analytics.length;
      avgDelay = analytics.reduce((sum, a) => sum + a.executionDelayMs, 0) / analytics.length;
      successCount = analytics.filter(a => Math.abs(a.priceDeviationPercent) <= 2).length;
    }

    const successRate = analytics.length > 0 ? (successCount / analytics.length) * 100 : 0;

    return {
      totalSignals,
      totalOrders,
      totalPositions,
      openPositions,
      closedPositions,
      avgDeviation,
      avgDelay,
      successRate,
    };
  }
}
