# Simple Replay Script Usage Examples

The `simple-replay.ts` script now supports two sources for historical messages:

## Option 1: From Telegram Channel

Retrieve messages directly from a Telegram bot/channel:

```bash
# Basic usage with Telegram source
npx ts-node scripts/simple-replay.ts start \
  --source telegram \
  --bot your_signal_bot \
  --start-date 2025-08-14 \
  --interval 3000 \
  --max-signals 10

# With date range
npx ts-node scripts/simple-replay.ts start \
  --source telegram \
  --bot your_signal_bot \
  --start-date 2025-08-14 \
  --end-date 2025-08-15 \
  --interval 5000
```

## Option 2: From JSON File

Use pre-downloaded messages from a JSON file:

```bash
# Basic usage with JSON source
npx ts-node scripts/simple-replay.ts start \
  --source json \
  --json-file data/historical-messages.json \
  --start-date 2025-08-14 \
  --interval 2000 \
  --max-signals 5

# With date range
npx ts-node scripts/simple-replay.ts start \
  --source json \
  --json-file data/historical-messages.json \
  --start-date 2025-08-14 \
  --end-date 2025-08-16 \
  --interval 1000
```

## Command Line Options

- `--source <type>`: Source type - either `telegram` or `json` (default: `telegram`)
- `--bot <username>`: Bot username (required when source is `telegram`)
- `--json-file <path>`: Path to JSON file (required when source is `json`)
- `--start-date <date>`: Start date in YYYY-MM-DD format (required)
- `--end-date <date>`: End date in YYYY-MM-DD format (optional)
- `--interval <ms>`: Interval between messages in milliseconds (default: 5000)
- `--max-signals <number>`: Maximum number of signals to process (optional)

## JSON File Format

The JSON file should contain an array of message objects with the following structure:

```json
[
  {
    "id": 132435,
    "text": "📢 Opening: SHORT\n📉 Пара: `FUN/USDT`\n\n📊 Price: `0.009477`\n\n🎯 Take profit: `0.009400` (-0.46%)\n🛡️ Stop loss: `0.009555` (+0.46%)\n\n💼 Position size: `2000` USDT\n\n🕒 Entry time: 2025-08-14 02:05:00 GMT+0\n\n⚠️ Be careful! Risk is your responsibility..\n\n----------------------------------------\n© Powered by Resonance",
    "date": "2025-08-14T00:00:00.000Z",
    "chatId": REDACTED
  }
]
```

## Notes

- When using JSON source, the script will automatically generate message IDs if they're not present
- The script filters messages by date range regardless of the source
- Messages are always sorted chronologically (oldest first)
- The replay includes full end-to-end signal processing and order execution
- Press Ctrl+C to stop the replay at any time
