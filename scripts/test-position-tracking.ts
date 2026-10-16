import {SignalParser} from '../src/parsers/signalParser'
import {FileStorage} from '../src/services/fileStorage'
import {PositionService} from '../src/services/positionService'
import {OrderExecutionService} from '../src/services/orderExecutionService'
import {ExchangeService} from '../src/services/exchangeService'
import {Signal} from '../src/types'
import {readFileSync} from 'fs'
import {join} from 'path'

export async function testPositionTracking() {
	console.log('🧪 Testing Position Tracking System...\n')

	// Initialize services
	const fileStorage = new FileStorage()
	const positionService = new PositionService(fileStorage)
	const exchangeService = new ExchangeService()
	const orderExecutionService = new OrderExecutionService(exchangeService, fileStorage, positionService)

	// Load historical messages
	const historicalDataPath = join(process.cwd(), 'data', 'historical-messages.json')
	const historicalMessages = JSON.parse(readFileSync(historicalDataPath, 'utf8'))

	console.log(`📊 Loaded ${historicalMessages.length} historical messages\n`)

	// Track statistics
	let processedSignals = 0
	let openSignals = 0
	let closeSignals = 0
	let partialSignals = 0
	let updateSignals = 0
	let errors = 0

	// Process messages in chronological order
	const sortedMessages = historicalMessages.sort(
		(a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()
	)

	for (const message of sortedMessages) {
		try {
			// Parse the message
			const signal = SignalParser.parseMessage(message.text, message.id, message.chatId, new Date(message.date))

			if (!signal) {
				continue // Skip non-signal messages
			}

			// Process the signal
			await orderExecutionService.processSignal(signal)
			processedSignals++

			// Track signal types
			switch (signal.type) {
				case 'open':
					openSignals++
					break
				case 'close':
					closeSignals++
					break
				case 'partial':
					partialSignals++
					break
				case 'update':
					updateSignals++
					break
			}

			// Log progress every 50 signals
			if (processedSignals % 50 === 0) {
				console.log(`✅ Processed ${processedSignals} signals...`)
			}
		} catch (error) {
			errors++
			console.error(`❌ Error processing message ${message.id}:`, error)
		}
	}

	// Print final statistics
	console.log('\n📈 Processing Complete!')
	console.log('========================')
	console.log(`Total messages processed: ${processedSignals}`)
	console.log(`Open signals: ${openSignals}`)
	console.log(`Close signals: ${closeSignals}`)
	console.log(`Partial signals: ${partialSignals}`)
	console.log(`Update signals: ${updateSignals}`)
	console.log(`Errors: ${errors}`)

	// Get position summary
	const allPositions = fileStorage.getPositions()
	const openPositions = allPositions.filter(p => p.status === 'open')
	const totalPnL = allPositions.reduce((sum, pos) => sum + (pos.realizedPnL || 0), 0)

	console.log('\n📊 Position Summary:')
	console.log('===================')
	console.log(`Open positions: ${openPositions.length}`)
	console.log(`Total PnL: ${totalPnL.toFixed(2)} USDT`)

	// Get file storage summary
	const fileSummary = fileStorage.getSummaryStats()
	console.log('\n💾 Storage Summary:')
	console.log('==================')
	console.log(`Total signals: ${fileSummary.totalSignals}`)
	console.log(`Total orders: ${fileSummary.totalOrders}`)
	console.log(`Total positions: ${fileSummary.totalPositions}`)
	console.log(`Open positions: ${fileSummary.openPositions}`)
	console.log(`Closed positions: ${fileSummary.closedPositions}`)

	// Show some example positions
	if (allPositions.length > 0) {
		console.log('\n🔍 Example Positions:')
		console.log('====================')
		allPositions.slice(0, 3).forEach((pos, index) => {
			console.log(`${index + 1}. ${pos.symbol} ${pos.side} - Status: ${pos.status}`)
			console.log(`   Entry: ${pos.entryPrice} | Current: ${pos.currentPrice}`)
			console.log(`   Size: ${pos.sizeUsdt} USDT | Remaining: ${pos.remainingSizeUsdt} USDT`)
			console.log(`   Breakeven: ${pos.breakevenPrice} | Stop Loss: ${pos.stopLossPrice}`)
			if (pos.partialCloses.length > 0) {
				console.log(`   Partial closes: ${pos.partialCloses.length}`)
			}
			if (pos.realizedPnL !== undefined) {
				console.log(`   Realized PnL: ${pos.realizedPnL.toFixed(2)} USDT`)
			}
			console.log('')
		})
	}

	console.log('✅ Test completed successfully!')
}

// Run the test if this file is executed directly
if (require.main === module) {
	testPositionTracking().catch(console.error)
}
