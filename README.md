# Telegram Crypto Signals Executor

A TypeScript service that listens to Telegram messages, parses trading signals, and executes orders on crypto exchanges via ccxt. Features comprehensive analytics and Slack alerts.

## Features

- **Telegram Integration**: Listens to Telegram channels and parses trading signals using regex patterns
- **Exchange Integration**: Executes orders on crypto exchanges using ccxt library
- **Signal Types**: Supports opening, closing, partial close, and update signals
- **Idempotency**: Prevents duplicate order execution using message hashing
- **Analytics**: Tracks price deviations, execution delays, and slippage
- **Error Alerts**: Slack notifications for errors and high deviations only
- **File Storage**: Simple JSON file storage for signals, orders, and analytics
- **CLI Tools**: Command-line interface for data access
- **Historical Replay**: Retrieve and replay historical messages for end-to-end testing

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

## Channel Filtering

To listen only to specific Telegram channels or bots, you can configure channel filtering:

### Configure Allowed Channels
Add this environment variable to your `.env` file:

```env
# Channel filtering (comma-separated for multiple values)
TELEGRAM_ALLOWED_USERNAMES=your_signal_bot
```

**Examples:**
- Single bot: `TELEGRAM_ALLOWED_USERNAMES=your_signal_bot`
- Multiple bots: `TELEGRAM_ALLOWED_USERNAMES=bot1,bot2,channel1`

**Note:** If no filtering is configured, the service will listen to all messages from all chats you have access to.

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
| `TELEGRAM_ALLOWED_USERNAMES` | Comma-separated list of allowed usernames | Optional |
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

## Full End-to-End Execution

The system now supports complete order execution with real exchange integration. Follow these steps to enable full trading functionality:

### 1. Exchange Setup

**IMPORTANT**: Start with testnet/sandbox mode for safety!

1. **Configure Exchange Credentials**:
   ```bash
   cp env.example .env
   # Edit .env with your exchange API keys
   ```

2. **Test Exchange Connection**:
   ```bash
   npm run cli exchange-test
   ```

3. **For detailed setup instructions**, see [EXCHANGE_SETUP.md](EXCHANGE_SETUP.md)

### 2. Test with Small Amounts

**Safety First**: Always start with small amounts and limited signals!

```bash
# Test with 1 signal first (recommended)
npm run replay -- -b your_signal_bot -s 2024-01-01 --max-signals 1 --interval 10000

# Test with 5 signals
npm run replay -- -b your_signal_bot -s 2024-01-01 --max-signals 5 --interval 5000
```

### 3. Production Deployment

When ready for production:

1. **Switch to production mode** in `.env`:
   ```env
   NODE_ENV=production
   ```

2. **Use real exchange** (not testnet)

3. **Check logs closely** and start with small position sizes

## Historical Message Replay

The system includes a historical replay workflow for testing and validation. This allows you to retrieve historical messages from the Telegram bot and replay them with full end-to-end execution including order execution via ccxt.

### Quick Start

**Test with 5 signals (recommended first):**
```bash
npm run replay -- -b your_signal_bot -s 2024-08-14 --interval 5000 --max-signals 5
```

**Full replay test:**
```bash
npm run replay -- -b your_signal_bot -s 2024-08-14
```

### Available Commands

- `npm run replay` - Start the complete replay workflow

For detailed documentation, see [REPLAY_README.md](REPLAY_README.md).

## Error Alerts (Slack)
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
