import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Signal, Order, Analytics } from '../types';
import { logger } from '../utils/logger';

export class FileStorage {
  private dataDir: string;
  private signalsFile: string;
  private ordersFile: string;
  private analyticsFile: string;

  constructor() {
    this.dataDir = join(process.cwd(), 'data');
    this.signalsFile = join(this.dataDir, 'signals.json');
    this.ordersFile = join(this.dataDir, 'orders.json');
    this.analyticsFile = join(this.dataDir, 'analytics.json');

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
      logger.error('Failed to read file', { error, filePath });
      return [];
    }
  }

  private writeFile<T>(filePath: string, data: T[]): void {
    try {
      writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error('Failed to write file', { error, filePath });
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
      orders[index] = { ...orders[index], ...updates, updatedAt: new Date() };
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

  getSummaryStats(): {
    totalSignals: number;
    totalOrders: number;
    avgDeviation: number;
    avgDelay: number;
    successRate: number;
  } {
    const signals = this.readFile<Signal>(this.signalsFile);
    const orders = this.readFile<Order>(this.ordersFile);
    const analytics = this.readFile<Analytics>(this.analyticsFile);

    const totalSignals = signals.length;
    const totalOrders = orders.length;
    
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
      avgDeviation,
      avgDelay,
      successRate,
    };
  }
}
