# Historical Message Replay Workflow

A solution to retrieve historical messages from the Telegram bot and replay them with full end-to-end execution including order execution via ccxt.

## Quick Start

### 1. Test with 5 signals (5 second intervals)
```bash
npm run replay -- -b your_signal_bot -s 2024-08-14 --interval 5000 --max-signals 5
```

### 2. Full replay with default 5 second intervals
```bash
npm run replay -- -b your_signal_bot -s 2024-08-14
```

### 3. Test with custom interval (10 seconds between messages)
```bash
npm run replay -- -b your_signal_bot -s 2024-08-14 --interval 10000 --max-signals 10
```

## Command Options

```bash
npm run replay -- [options]
```

**Required:**
- `-b, --bot <username>`: Bot username (e.g., your_signal_bot)

- `-s, --start-date <date>`: Start date (YYYY-MM-DD format)

**Optional:**
- `-e, --end-date <date>`: End date (YYYY-MM-DD format)
- `--interval <ms>`: Interval between messages in milliseconds (default: 5000)
- `--max-signals <number>`: Maximum number of signals to process

## Examples

### Test with 5 signals at 10 second intervals
```bash
npm run replay -- -b your_signal_bot -s 2024-08-14 --interval 10000 --max-signals 5
```

### Test specific date range
```bash
npm run replay -- -b your_signal_bot -s 2024-08-14 -e 2024-08-20
```



## What It Does

1. **Retrieves Messages**: Fetches all messages from the specified bot starting from the given date
2. **Parses Signals**: Uses the same signal parser as the live system
3. **Fixed Interval Replay**: Replays messages with a fixed interval between them
4. **Full End-to-End Execution**: Processes signals through the complete application including order execution via ccxt

## Safety Features

- **Signal Limits**: Limit number of signals processed
- **Graceful Shutdown**: Ctrl+C stops replay safely
- **Error Handling**: Individual message errors don't stop replay
- **Full Order Execution**: Real orders will be placed on the exchange

## Prerequisites

1. **Environment Setup**: Configure your `.env` file with Telegram API credentials and exchange API credentials
2. **Telegram Session**: Ensure you have a valid session string (`npm run session`)
3. **Exchange Configuration**: Make sure your exchange API keys are configured for real trading

## Output

The workflow will:
- Show progress of message retrieval
- Display signal parsing results
- Execute real orders on the exchange via ccxt
- Log all application events including order execution
- Show final statistics

## Files Generated

- `logs/combined.log` - Application logs
- `data/signals.json` - Processed signals
- `data/orders.json` - Executed orders
- `data/analytics.json` - Performance analytics
