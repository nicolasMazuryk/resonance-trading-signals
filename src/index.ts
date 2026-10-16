import {TelegramSignalsExecutor} from './app'
import {logger, serializeError} from './utils/logger'

async function main(): Promise<void> {
	try {
		logger.info('Starting Telegram Signals Executor...')

		const app = new TelegramSignalsExecutor()
		await app.start()

		logger.info('Application started successfully')

		// Keep the process running
		process.on('SIGINT', async () => {
			logger.info('Received SIGINT, shutting down...')
			await app.stop()
			process.exit(0)
		})

		process.on('SIGTERM', async () => {
			logger.info('Received SIGTERM, shutting down...')
			await app.stop()
			process.exit(0)
		})
	} catch (error) {
		logger.error('Failed to start application', {error: serializeError(error)})
		process.exit(1)
	}
}

// Start the application
main().catch(error => {
	logger.error('Unhandled error in main', {error: serializeError(error)})
	process.exit(1)
})
