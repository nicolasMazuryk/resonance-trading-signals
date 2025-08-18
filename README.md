# Telegram Crypto Signals Executor

A TypeScript service that listens to Telegram messages, parses trading signals, and executes orders on crypto exchanges via ccxt. Features comprehensive analytics, Slack alerts, and a REST API for monitoring.

## Features

- **Telegram Integration**: Listens to Telegram channels and parses trading signals using regex patterns
- **Exchange Integration**: Executes orders on crypto exchanges using ccxt library
- **Signal Types**: Supports opening, closing, partial close, and update signals
- **Idempotency**: Prevents duplicate order execution using message hashing
- **Analytics**: Tracks price deviations, execution delays, and slippage
- **Error Alerts**: Slack notifications for errors and high deviations only
- **File Storage**: Simple JSON file storage for signals, orders, and analytics
- **CLI Tools**: Command-line interface for monitoring and data access

## Supported Signal Formats

### Opening Signal
```
Opening: LONG

Пара: BTC/USDT

Price: 45000

Take profit: 46000 (2.22%)

Stop loss: 44000 (-2.22%)

Position size: 1000 USDT

Entry time: 2024-01-15 14:30:00 GMT+0
```

### Closing Signal
```
Closing: Take profit achieved

Пара: BTC/USDT

Price: 46000

Closing time: 2024-01-15 15:30:00 GMT+0
```

### Partial Close Signal
```
Partial position close

Пара: BTC/USDT

Partial close price: 45500

Volume: 50% of the position

Time: 2024-01-15 14:45:00 GMT+0
```

### Update Signal
```
Update: Move the stop loss to 44500

Пара: BTC/USDT

Update time: 2024-01-15 14:35:00 GMT+0
```

## Prerequisites

- Node.js 20+
- npm or yarn
- Telegram API credentials
- Crypto exchange API credentials
- Slack webhook URL (optional)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd telegram-signals-executor
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment variables:
```bash
cp env.example .env
```

4. Configure your environment variables in `.env`:
```env
TELEGRAM_API_ID=your_telegram_api_id
TELEGRAM_API_HASH=your_telegram_api_hash
TELEGRAM_SESSION=your_session_string
TELEGRAM_BOT_ID=your_bot_id

EXCHANGE_ID=binanceusdm
EXCHANGE_API_KEY=your_exchange_api_key
EXCHANGE_API_SECRET=your_exchange_api_secret

DEFAULT_LEVERAGE=10
ORDER_SLIPPAGE_TOLERANCE=0.2
MAX_SIGNAL_AGE_MS=90000

SLACK_WEBHOOK_URL=your_slack_webhook_url
NODE_ENV=production
```

## Getting Telegram Session String

1. Get your Telegram API credentials from https://my.telegram.org
2. Run the session generator:
```bash
npm run session
```
3. Follow the prompts to authenticate and get your session string
4. Add the session string to your `.env` file

## Usage

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

### Testing
```bash
npm test
npm run test:watch
```

### Linting and Formatting
```bash
npm run lint
npm run lint:fix
npm run format
```


## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TELEGRAM_API_ID` | Telegram API ID | Required |
| `TELEGRAM_API_HASH` | Telegram API Hash | Required |
| `TELEGRAM_SESSION` | Telegram session string | Required |
| `TELEGRAM_BOT_ID` | Telegram bot ID | Required |
| `EXCHANGE_ID` | CCXT exchange ID | `binanceusdm` |
| `EXCHANGE_API_KEY` | Exchange API key | Required |
| `EXCHANGE_API_SECRET` | Exchange API secret | Required |
| `DEFAULT_LEVERAGE` | Default leverage for futures | `10` |
| `ORDER_SLIPPAGE_TOLERANCE` | Max price deviation for market orders | `0.2` |
| `MAX_SIGNAL_AGE_MS` | Max signal age in milliseconds | `90000` |
| `SLACK_WEBHOOK_URL` | Slack webhook URL | Optional |
| `NODE_ENV` | Environment | `production` |

### Order Execution Logic

1. **Limit Order First**: Attempts to place limit orders at signal price
2. **Market Order Fallback**: Falls back to market orders if:
   - Limit order fails
   - Price deviation is within tolerance
3. **Idempotency**: Uses message hash to prevent duplicate execution
4. **Age Check**: Skips signals older than `MAX_SIGNAL_AGE_MS`

## Data Storage

### File Structure
- `data/signals.json` - Stored signals
- `data/orders.json` - Stored orders
- `data/analytics.json` - Analytics data

### Data Access
Use the CLI to view stored data:
```bash
npm run cli data --type signals
npm run cli data --type orders
npm run cli data --type analytics
```

## Monitoring

### Error Alerts (Slack)
- Signal parsing failures
- Order execution failures
- High price deviations (>2%)
- Stale signals
- Application startup failures
- Uncaught exceptions

### Logs
- Structured JSON logging with Winston
- Log files in `logs/` directory
- Console output in development

## Development

### Project Structure
```
src/
├── config/          # Configuration management
├── parsers/         # Signal parsing logic
├── services/        # Business logic services
├── types/           # TypeScript type definitions
├── utils/           # Utility functions
├── app.ts           # Main application class
└── index.ts         # Entry point
```

### Adding New Signal Types

1. Update regex patterns in `SignalParser`
2. Add new signal type to `types/index.ts`
3. Add parsing logic in `SignalParser`
4. Add execution logic in `OrderExecutionService`

### Testing

Run tests with coverage:
```bash
npm test -- --coverage
```

## Troubleshooting

### Common Issues

1. **Telegram Authentication**: Ensure session string is valid
2. **Exchange API**: Check API key permissions and rate limits
3. **File Storage**: Ensure write permissions for data directory
4. **Network**: Check firewall and proxy settings

### Logs

Check logs in `logs/` directory:
- `combined.log` - All logs
- `error.log` - Error logs only

### Status Check

Use the CLI to check application status:
```bash
npm run cli status
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run linting and tests
6. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Disclaimer

This software is for educational and research purposes. Use at your own risk. The authors are not responsible for any financial losses incurred through the use of this software.
