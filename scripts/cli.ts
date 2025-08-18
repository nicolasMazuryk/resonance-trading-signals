#!/usr/bin/env ts-node

import { Command } from 'commander';
import { TelegramSignalsExecutor } from '../src/app';
import { logger } from '../src/utils/logger';

const program = new Command();

program
  .name('telegram-signals-executor')
  .description('CLI for Telegram Signals Executor')
  .version('1.0.0');

program
  .command('status')
  .description('Check application status')
  .action(async () => {
    try {
      const app = new TelegramSignalsExecutor();
      const status = await app.getStatus();
      
      console.log('📊 Application Status');
      console.log('====================');
      console.log(`Running: ${status.isRunning ? '✅ Yes' : '❌ No'}`);
      console.log(`Uptime: ${Math.floor(status.uptime)}s`);
      console.log('\nStatistics:');
      console.log(`Total Signals: ${status.stats.totalSignals}`);
      console.log(`Total Orders: ${status.stats.totalOrders}`);
      console.log(`Average Deviation: ${status.stats.avgDeviation.toFixed(2)}%`);
      console.log(`Average Delay: ${status.stats.avgDelay.toFixed(0)}ms`);
      console.log(`Success Rate: ${status.stats.successRate.toFixed(1)}%`);
    } catch (error) {
      console.error('❌ Failed to get status:', error);
      process.exit(1);
    }
  });

program
  .command('logs')
  .description('View recent logs')
  .option('-l, --lines <number>', 'Number of lines to show', '50')
  .option('-f, --follow', 'Follow log file')
  .action(async (options) => {
    try {
      const fs = require('fs');
      const path = require('path');
      
      const logFile = path.join(process.cwd(), 'logs', 'combined.log');
      
      if (!fs.existsSync(logFile)) {
        console.log('No log file found. Run the application first to generate logs.');
        return;
      }
      
      if (options.follow) {
        console.log(`Following log file: ${logFile}`);
        const tail = require('tail').Tail;
        const logTail = new tail(logFile);
        
        logTail.on('line', (data: string) => {
          try {
            const log = JSON.parse(data);
            console.log(`[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`);
          } catch {
            console.log(data);
          }
        });
        
        logTail.on('error', (error: any) => {
          console.error('Error following logs:', error);
        });
      } else {
        const content = fs.readFileSync(logFile, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        const recentLines = lines.slice(-parseInt(options.lines));
        
        console.log(`Recent logs (last ${recentLines.length} lines):`);
        console.log('==========================================');
        
        recentLines.forEach(line => {
          try {
            const log = JSON.parse(line);
            console.log(`[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`);
          } catch {
            console.log(line);
          }
        });
      }
    } catch (error) {
      console.error('❌ Failed to read logs:', error);
      process.exit(1);
    }
  });

program
  .command('test-signal')
  .description('Test signal parsing with sample data')
  .argument('<signal-type>', 'Type of signal to test (open|close|partial|update)')
  .action(async (signalType) => {
    try {
      const { SignalParser } = await import('../src/parsers/signalParser');
      
      let sampleMessage: string;
      
      switch (signalType) {
        case 'open':
          sampleMessage = `Opening: LONG

Пара: BTC/USDT

Price: 45000

Take profit: 46000 (2.22%)

Stop loss: 44000 (-2.22%)

Position size: 1000 USDT

Entry time: 2024-01-15 14:30:00 GMT+0`;
          break;
          
        case 'close':
          sampleMessage = `Closing: Take profit achieved

Пара: BTC/USDT

Price: 46000

Closing time: 2024-01-15 15:30:00 GMT+0`;
          break;
          
        case 'partial':
          sampleMessage = `Partial position close

Пара: BTC/USDT

Partial close price: 45500

Volume: 50% of the position

Time: 2024-01-15 14:45:00 GMT+0`;
          break;
          
        case 'update':
          sampleMessage = `Update: Move the stop loss to 44500

Пара: BTC/USDT

Update time: 2024-01-15 14:35:00 GMT+0`;
          break;
          
        default:
          console.error('❌ Invalid signal type. Use: open, close, partial, or update');
          process.exit(1);
      }
      
      console.log(`🧪 Testing ${signalType} signal parsing`);
      console.log('=====================================');
      console.log('Sample message:');
      console.log(sampleMessage);
      console.log('\nParsing result:');
      
      const signal = SignalParser.parseMessage(sampleMessage, 123, 456, new Date());
      
      if (signal) {
        console.log('✅ Signal parsed successfully!');
        console.log(JSON.stringify(signal, null, 2));
      } else {
        console.log('❌ Failed to parse signal');
      }
    } catch (error) {
      console.error('❌ Test failed:', error);
      process.exit(1);
    }
  });

program
  .command('data')
  .description('View stored data')
  .option('-t, --type <type>', 'Data type to view (signals|orders|analytics)', 'signals')
  .option('-s, --symbol <symbol>', 'Filter by symbol')
  .option('-l, --limit <number>', 'Limit number of results', '10')
  .action(async (options) => {
    try {
      const { FileStorage } = await import('../src/services/fileStorage');
      const storage = new FileStorage();
      
      let data: any[] = [];
      
      switch (options.type) {
        case 'signals':
          data = options.symbol 
            ? storage.getSignalsBySymbol(options.symbol)
            : storage.getSignals();
          break;
        case 'orders':
          data = options.symbol
            ? storage.getOrdersBySymbol(options.symbol)
            : storage.getOrders();
          break;
        case 'analytics':
          data = options.symbol
            ? storage.getAnalyticsBySymbol(options.symbol)
            : storage.getAnalytics();
          break;
        default:
          console.error('❌ Invalid data type. Use: signals, orders, or analytics');
          process.exit(1);
      }
      
      // Limit results
      const limit = parseInt(options.limit);
      data = data.slice(-limit);
      
      console.log(`📊 ${options.type.toUpperCase()} Data (${data.length} items)`);
      console.log('=====================================');
      
      if (data.length === 0) {
        console.log('No data found.');
        return;
      }
      
      data.forEach((item, index) => {
        console.log(`\n${index + 1}. ${JSON.stringify(item, null, 2)}`);
      });
    } catch (error) {
      console.error('❌ Failed to read data:', error);
      process.exit(1);
    }
  });

program.parse();
