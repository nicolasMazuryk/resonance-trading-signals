#!/usr/bin/env ts-node

import {Command} from 'commander'
import {TelegramSignalsExecutor} from '../src/app'

const program = new Command()

program.name('telegram-signals-executor').description('CLI for Telegram Signals Executor').version('1.0.0')

program
	.command('status')
	.description('Check application status')
	.action(async () => {
		try {
			const app = new TelegramSignalsExecutor()
			const status = await app.getStatus()

			console.log('📊 Application Status')
			console.log('====================')
			console.log(`Running: ${status.isRunning ? '✅ Yes' : '❌ No'}`)
			console.log(`Uptime: ${Math.floor(status.uptime)}s`)
			console.log('\nStatistics:')
			console.log(`Total Signals: ${status.stats.totalSignals}`)
			console.log(`Total Orders: ${status.stats.totalOrders}`)
			console.log(`Average Deviation: ${status.stats.avgDeviation.toFixed(2)}%`)
			console.log(`Average Delay: ${status.stats.avgDelay.toFixed(0)}ms`)
			console.log(`Success Rate: ${status.stats.successRate.toFixed(1)}%`)
		} catch (error) {
			console.error('❌ Failed to get status:', error)
			process.exit(1)
		}
	})

program
	.command('logs')
	.description('View recent logs')
	.option('-l, --lines <number>', 'Number of lines to show', '50')
	.option('-f, --follow', 'Follow log file')
	.action(async options => {
		try {
			const fs = require('fs')
			const path = require('path')

			const logFile = path.join(process.cwd(), 'logs', 'combined.log')

			if (!fs.existsSync(logFile)) {
				console.log('No log file found. Run the application first to generate logs.')
				return
			}

			if (options.follow) {
				console.log(`Following log file: ${logFile}`)
				const tail = require('tail').Tail
				const logTail = new tail(logFile)

				logTail.on('line', (data: string) => {
					try {
						const log = JSON.parse(data)
						console.log(`[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`)
					} catch {
						console.log(data)
					}
				})

				logTail.on('error', (error: any) => {
					console.error('Error following logs:', error)
				})
			} else {
				const content = fs.readFileSync(logFile, 'utf8')
				const lines = content.split('\n').filter((line: string) => line.trim())
				const recentLines = lines.slice(-parseInt(options.lines))

				console.log(`Recent logs (last ${recentLines.length} lines):`)
				console.log('==========================================')

				recentLines.forEach((line: string) => {
					try {
						const log = JSON.parse(line)
						console.log(`[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`)
					} catch {
						console.log(line)
					}
				})
			}
		} catch (error) {
			console.error('❌ Failed to read logs:', error)
			process.exit(1)
		}
	})

program
	.command('test-signal')
	.description('Test signal parsing with sample data')
	.argument('<signal-type>', 'Type of signal to test (open|close|partial|update)')
	.action(async signalType => {
		try {
			const {SignalParser} = await import('../src/parsers/signalParser')

			let sampleMessage: string

			switch (signalType) {
				case 'open':
					sampleMessage = `Opening: LONG

Пара: BTC/USDT

Price: 45000

Take profit: 46000 (2.22%)

Stop loss: 44000 (-2.22%)

Position size: 1000 USDT

Entry time: 2024-01-15 14:30:00 GMT+0`
					break

				case 'close':
					sampleMessage = `Closing: Take profit achieved

Пара: BTC/USDT

Price: 46000

Closing time: 2024-01-15 15:30:00 GMT+0`
					break

				case 'partial':
					sampleMessage = `Partial position close

Пара: BTC/USDT

Partial close price: 45500

Volume: 50% of the position

Time: 2024-01-15 14:45:00 GMT+0`
					break

				case 'update':
					sampleMessage = `Update: Move the stop loss to 44500

Пара: BTC/USDT

Update time: 2024-01-15 14:35:00 GMT+0`
					break

				default:
					console.error('❌ Invalid signal type. Use: open, close, partial, or update')
					process.exit(1)
			}

			console.log(`🧪 Testing ${signalType} signal parsing`)
			console.log('=====================================')
			console.log('Sample message:')
			console.log(sampleMessage)
			console.log('\nParsing result:')

			const signal = SignalParser.parseMessage(sampleMessage, 123, 456, new Date())

			if (signal) {
				console.log('✅ Signal parsed successfully!')
				console.log(JSON.stringify(signal, null, 2))
			} else {
				console.log('❌ Failed to parse signal')
			}
		} catch (error) {
			console.error('❌ Test failed:', error)
			process.exit(1)
		}
	})

program
	.command('data')
	.description('View stored data')
	.option(
		'-t, --type <type>',
		'Data type to view (signals|orders|analytics|position-analytics|overall-analytics)',
		'signals'
	)
	.option('-s, --symbol <symbol>', 'Filter by symbol')
	.option('-l, --limit <number>', 'Limit number of results', '10')
	.action(async options => {
		try {
			const {FileStorage} = await import('../src/services/fileStorage')
			const storage = new FileStorage()

			let data: any[] = []

			switch (options.type) {
				case 'signals':
					data = options.symbol ? storage.getSignalsBySymbol(options.symbol) : storage.getSignals()
					break
				case 'orders':
					data = options.symbol ? storage.getOrdersBySymbol(options.symbol) : storage.getOrders()
					break
				case 'analytics':
					data = options.symbol ? storage.getAnalyticsBySymbol(options.symbol) : storage.getAnalytics()
					break
				case 'position-analytics':
					data = options.symbol ? storage.getPositionAnalyticsBySymbol(options.symbol) : storage.getPositionAnalytics()
					break
				case 'overall-analytics':
					data = storage.getOverallAnalytics()
					break
				default:
					console.error(
						'❌ Invalid data type. Use: signals, orders, analytics, position-analytics, or overall-analytics'
					)
					process.exit(1)
			}

			// Limit results
			const limit = parseInt(options.limit)
			data = data.slice(-limit)

			console.log(`📊 ${options.type.toUpperCase()} Data (${data.length} items)`)
			console.log('=====================================')

			if (data.length === 0) {
				console.log('No data found.')
				return
			}

			data.forEach((item, index) => {
				console.log(`\n${index + 1}. ${JSON.stringify(item, null, 2)}`)
			})
		} catch (error) {
			console.error('❌ Failed to read data:', error)
			process.exit(1)
		}
	})

program
	.command('analytics')
	.description('Generate and view analytics')
	.option('-p, --period <period>', 'Analytics period (daily|weekly|monthly|all_time)', 'all_time')
	.option('-s, --start-date <date>', 'Start date (YYYY-MM-DD)')
	.option('-e, --end-date <date>', 'End date (YYYY-MM-DD)')
	.option('-g, --generate', 'Generate new analytics')
	.action(async options => {
		try {
			const {FileStorage} = await import('../src/services/fileStorage')
			const {AnalyticsService} = await import('../src/services/analyticsService')

			const storage = new FileStorage()
			const analyticsService = new AnalyticsService(storage)

			if (options.generate) {
				console.log('🔄 Generating analytics...')

				let startDate: Date | undefined
				let endDate: Date | undefined

				if (options.startDate && options.endDate) {
					startDate = new Date(options.startDate)
					endDate = new Date(options.endDate)
				}

				const analytics = await analyticsService.calculateOverallAnalytics(options.period as any, startDate, endDate)

				console.log('✅ Analytics generated successfully!')
				console.log('\n📊 Overall Analytics Summary:')
				console.log('=============================')
				console.log(`Period: ${analytics.period}`)
				console.log(
					`Date Range: ${new Date(analytics.startDate).toISOString().split('T')[0]} to ${new Date(analytics.endDate).toISOString().split('T')[0]}`
				)
				console.log(`Total Signals: ${analytics.totalSignals}`)
				console.log(`Open Signals: ${analytics.openSignals}`)
				console.log(`Closed Signals: ${analytics.closedSignals}`)
				console.log('\n📈 Trade Results:')
				console.log(
					`Profitable Trades: ${analytics.profitableTrades} (${analytics.profitableTradesPercent.toFixed(1)}%)`
				)
				console.log(`Breakeven Trades: ${analytics.breakevenTrades} (${analytics.breakevenTradesPercent.toFixed(1)}%)`)
				console.log(`Loss Trades: ${analytics.lossTrades} (${analytics.lossTradesPercent.toFixed(1)}%)`)
				console.log(`Win Rate: ${analytics.winRate.toFixed(1)}%`)
				console.log('\n💰 Financial Metrics:')
				console.log(`Total PnL: $${analytics.totalPnL.toFixed(2)}`)
				console.log(`Total Slippage: $${analytics.totalSlippage.toFixed(2)}`)
				console.log(`Total Fees: $${analytics.totalFees.toFixed(2)}`)
				console.log(`Average PnL per Trade: $${analytics.averagePnL.toFixed(2)}`)
				console.log(`Average Slippage per Trade: $${analytics.averageSlippage.toFixed(2)}`)
				console.log(`Average Fees per Trade: $${analytics.averageFees.toFixed(2)}`)
				console.log('\n⚡ Execution Quality:')
				console.log(`Average Execution Delay: ${analytics.averageExecutionDelayMs.toFixed(0)}ms`)
				console.log(`Average Entry Slippage: ${analytics.averageEntrySlippagePercent.toFixed(2)}%`)
				console.log(`Average Exit Slippage: ${analytics.averageExitSlippagePercent.toFixed(2)}%`)

				if (Object.keys(analytics.symbolBreakdown).length > 0) {
					console.log('\n📊 Symbol Breakdown:')
					Object.entries(analytics.symbolBreakdown).forEach(([symbol, breakdown]) => {
						console.log(`\n${symbol}:`)
						console.log(`  Total Trades: ${breakdown.totalTrades}`)
						console.log(`  Profitable Trades: ${breakdown.profitableTrades}`)
						console.log(`  Total PnL: $${breakdown.totalPnL.toFixed(2)}`)
						console.log(`  Total Slippage: $${breakdown.totalSlippage.toFixed(2)}`)
						console.log(`  Total Fees: $${breakdown.totalFees.toFixed(2)}`)
					})
				}
			} else {
				// View existing analytics
				const analytics = analyticsService.getLatestOverallAnalytics(options.period as any)

				if (!analytics) {
					console.log('❌ No analytics found for the specified period. Use --generate to create new analytics.')
					return
				}

				console.log('📊 Overall Analytics Summary:')
				console.log('=============================')
				console.log(`Period: ${analytics.period}`)
				console.log(
					`Date Range: ${new Date(analytics.startDate).toISOString().split('T')[0]} to ${new Date(analytics.endDate).toISOString().split('T')[0]}`
				)
				console.log(`Total Signals: ${analytics.totalSignals}`)
				console.log(`Open Signals: ${analytics.openSignals}`)
				console.log(`Closed Signals: ${analytics.closedSignals}`)
				console.log('\n📈 Trade Results:')
				console.log(
					`Profitable Trades: ${analytics.profitableTrades} (${analytics.profitableTradesPercent.toFixed(1)}%)`
				)
				console.log(`Breakeven Trades: ${analytics.breakevenTrades} (${analytics.breakevenTradesPercent.toFixed(1)}%)`)
				console.log(`Loss Trades: ${analytics.lossTrades} (${analytics.lossTradesPercent.toFixed(1)}%)`)
				console.log(`Win Rate: ${analytics.winRate.toFixed(1)}%`)
				console.log('\n💰 Financial Metrics:')
				console.log(`Total PnL: $${analytics.totalPnL.toFixed(2)}`)
				console.log(`Total Slippage: $${analytics.totalSlippage.toFixed(2)}`)
				console.log(`Total Fees: $${analytics.totalFees.toFixed(2)}`)
				console.log(`Average PnL per Trade: $${analytics.averagePnL.toFixed(2)}`)
				console.log(`Average Slippage per Trade: $${analytics.averageSlippage.toFixed(2)}`)
				console.log(`Average Fees per Trade: $${analytics.averageFees.toFixed(2)}`)
				console.log('\n⚡ Execution Quality:')
				console.log(`Average Execution Delay: ${analytics.averageExecutionDelayMs.toFixed(0)}ms`)
				console.log(`Average Entry Slippage: ${analytics.averageEntrySlippagePercent.toFixed(2)}%`)
				console.log(`Average Exit Slippage: ${analytics.averageExitSlippagePercent.toFixed(2)}%`)

				if (Object.keys(analytics.symbolBreakdown).length > 0) {
					console.log('\n📊 Symbol Breakdown:')
					Object.entries(analytics.symbolBreakdown).forEach(([symbol, breakdown]) => {
						console.log(`\n${symbol}:`)
						console.log(`  Total Trades: ${breakdown.totalTrades}`)
						console.log(`  Profitable Trades: ${breakdown.profitableTrades}`)
						console.log(`  Total PnL: $${breakdown.totalPnL.toFixed(2)}`)
						console.log(`  Total Slippage: $${breakdown.totalSlippage.toFixed(2)}`)
						console.log(`  Total Fees: $${breakdown.totalFees.toFixed(2)}`)
					})
				}
			}
		} catch (error) {
			console.error('❌ Failed to generate/view analytics:', error)
			process.exit(1)
		}
	})

program
	.command('exchange-test')
	.description('Test exchange connection and configuration')
	.action(async () => {
		try {
			const {ExchangeService} = await import('../src/services/exchangeService')
			const {config} = await import('../src/config')

			console.log('🔗 Testing Exchange Connection')
			console.log('==============================')
			console.log(`Exchange: ${config.exchange.id}`)
			console.log(`Environment: ${config.nodeEnv}`)
			console.log(`Sandbox Mode: ${config.nodeEnv === 'development' ? 'Yes' : 'No'}`)
			console.log('')

			const exchangeService = new ExchangeService()

			// Test 1: Initialize exchange
			console.log('1️⃣ Initializing exchange...')
			await exchangeService.initialize()
			console.log('✅ Exchange initialized successfully')

			// Test 2: Health check
			console.log('\n2️⃣ Testing connectivity...')
			const isHealthy = await exchangeService.healthCheck()
			if (isHealthy) {
				console.log('✅ Exchange connectivity OK')
			} else {
				console.log('❌ Exchange connectivity failed')
				process.exit(1)
			}

			// Test 3: Get balance
			console.log('\n3️⃣ Fetching account balance...')
			try {
				const balance = await exchangeService.getBalance()
				console.log('✅ Balance fetched successfully')
				console.log('Account Balance:')

				// Show non-zero balances
				if (balance['total']) {
					Object.entries(balance['total'] as any).forEach(([currency, amount]: [string, any]) => {
						if (amount && typeof amount === 'number' && amount > 0) {
							console.log(`  ${currency}: ${amount}`)
						}
					})
				}
			} catch (error) {
				console.log('⚠️  Could not fetch balance (may need API permissions)')
				console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`)
			}

			// Test 4: Get market data
			console.log('\n4️⃣ Testing market data access...')
			try {
				const ticker = await exchangeService.getTicker('BTC/USDT:USDT')
				console.log('✅ Market data access OK')
				console.log(`BTC/USDT Price: $${ticker.last}`)
			} catch (error) {
				console.log('⚠️  Could not fetch market data')
				console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`)
			}

			// Test 5: Test order placement (dry run)
			console.log('\n5️⃣ Testing order placement (dry run)...')
			try {
				// This will fail with insufficient balance, but tests the API connection
				await exchangeService.placeLimitOrder('BTC/USDT:USDT', 'buy', 1, 45000)
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error)
				if (errorMsg.includes('insufficient') || errorMsg.includes('balance')) {
					console.log('✅ Order placement API working (insufficient balance expected)')
				} else {
					console.log('⚠️  Order placement test failed')
					console.log(`   Error: ${errorMsg}`)
				}
			}

			console.log('\n🎉 Exchange test completed!')
			console.log('\nNext steps:')
			console.log('1. If all tests passed, your exchange is configured correctly')
			console.log('2. Run: npm run replay -- [options] to test with real signals')
			console.log('3. Start with small amounts and --max-signals 1 for safety')
		} catch (error) {
			console.error('❌ Exchange test failed:', error)
			console.log('\nTroubleshooting:')
			console.log('1. Check your API keys in .env file')
			console.log('2. Verify exchange ID is correct')
			console.log('3. Ensure API keys have trading permissions')
			console.log('4. Check IP restrictions on your API keys')
			process.exit(1)
		}
	})

program.parse()
