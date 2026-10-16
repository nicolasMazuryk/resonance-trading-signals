# PRD — Telegram Crypto Signals → Exchange Orders (TypeScript, Node.js)

## 1) Summary
A **TypeScript** service that listens to Telegram messages, parses trading signals, and executes orders on a crypto exchange via **ccxt**. Persist all signals and executions in **SQLite**, compare signals vs. real fills for analytics, and log errors/deviations.

---

## 2) Tech & Project Setup
- **Language**: TypeScript (ES2022)
- **Runtime**: Node.js 20+
- **Package mgr**: npm
- **Key libs**: `telegram` (GramJS), `ccxt`, `better-sqlite3`, `zod`, `dotenv`, `winston`
- **Lint/format**: `eslint`, `prettier`
- **Testing**: `vitest`

### 2.2 Env (.env)
```
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_SESSION=        # persisted session string
TELEGRAM_BOT_ID=

EXCHANGE_ID=binanceusdm  # ccxt id
EXCHANGE_API_KEY=
EXCHANGE_API_SECRET=

DEFAULT_LEVERAGE=10
ORDER_SLIPPAGE_TOLERANCE=0.2
MAX_SIGNAL_AGE_MS=90000

NODE_ENV=production
```

---

## 3) In-Scope Telegram Message Types (others ignored)
1. **Opening** — `"Opening:"`
2. **Closing** — `"Closing:"` (reasons: Take profit achieved, Stop loss, Breakeven)
3. **Partial close** — `"Partial position close"`
4. **Update** — `"Update: Move the stop loss to breakeven!"` or explicit price

> **Ignore** statistics or any other miscellaneous messages.

---

## 4) Parsing (Regex, Multiline, Case-Insensitive)
> All regexes use `/gmi` flags. Non‑capturing noise is allowed between fields.  
> Symbols observed: `([A-Z]{2,12}\/USDT)`; numbers: `(\d+(?:\.\d+)?)`.

### 4.1 Opening
```
^Opening:\s*(?<action>LONG|SHORT)\s*[
]+
.*?Пара:\s*(?<symbol>[A-Z]{2,12}\/USDT)\s*[
]+
.*?Price:\s*(?<price>\d+(?:\.\d+)?)\s*[
]+
.*?Take profit:\s*(?<tp_price>\d+(?:\.\d+)?)\s*\((?<tp_percent>-?\d+(?:\.\d+)?)%\)\s*[
]+
.*?Stop loss:\s*(?<sl_price>\d+(?:\.\d+)?)\s*\((?<sl_percent>-?\d+(?:\.\d+)?)%\)\s*[
]+
.*?Position size:\s*(?<size_usdt>\d+(?:\.\d+)?)\s*USDT\s*[
]+
.*?Entry time:\s*(?<entry_time>[\d\-:\sGMT\+]+)
```

### 4.2 Closing
```
^Closing:\s*(?<reason>Take profit achieved|Stop loss|Breakeven)\s*[
]+
.*?Пара:\s*(?<symbol>[A-Z]{2,12}\/USDT)\s*[
]+
.*?Price:\s*(?<close_price>\d+(?:\.\d+)?)\s*[
]+
.*?Closing time:\s*(?<close_time>[\d\-:\sGMT\+]+)
```

### 4.3 Partial Close
```
^Partial position close\s*[
]+
.*?Пара:\s*(?<symbol>[A-Z]{2,12}\/USDT)\s*[
]+
.*?Partial close price:\s*(?<partial_price>\d+(?:\.\d+)?)\s*[
]+
.*?Volume:\s*(?<partial_percent>\d+(?:\.\d+)?)%\s*of the position\s*[
]+
.*?Time:\s*(?<partial_time>[\d\-:\sGMT\+]+)
```

### 4.4 Update (SL to Breakeven or Explicit Price)
```
^Update:\s*Move the stop loss to\s*(?<update_type>breakeven|(?<update_price>\d+(?:\.\d+)?))\s*[
]+
.*?Пара:\s*(?<symbol>[A-Z]{2,12}\/USDT)\s*[
]+
.*?Update time:\s*(?<update_time>[\d\-:\sGMT\+]+)
```

### 4.5 Unified Signal DTO (TypeScript)
```ts
export type SignalType = 'open' | 'close' | 'partial' | 'update';

```

---

## 5) Execution (ccxt)
- Map symbol `BASE/USDT` → exchange format (e.g., `BTCUSDT`).
- Ensure precision and minimum notional; round using exchange filters.
- Leverage & margin (Futures) set once per symbol; configurable per env.
- **Order policy**: try **limit** at signal price; fallback to **market** if deviation > `ORDER_SLIPPAGE_TOLERANCE` or timeout.
- **Idempotency**: message‑hash key (channelId+messageId+type) stored in DB to avoid duplicate execution.
- Record every order attempt and final status.

---

## 6) Persistence (SQLite)
Use `better-sqlite3` with migrations.

### 6.1 Tables
**signals** — Full history of parsed signals (open → updates → partials → close)

**orders** — Actual exchange orders

**analytics** — Comparison between signals and real executions

---

## 7) Analytics Logic
- **On order fill**: compute `price_deviation_percent = 100 * (execPrice - signalPrice) / signalPrice`.
- **execution_delay_ms = execTime - parsedSignalTime` (entry or update).
- **slippage_usdt = (execPrice - signalPrice) * filledQty` (signed based on LONG/SHORT).
- Insert into `analytics` and update progressively across lifecycle.

---

## 8) Error Logging
- Log errors for:
  - Parsing failure for a supported type / missing critical fields
  - Order placement/fill failure
  - Deviation `|price_deviation_percent| > 2` or stale signal (`> MAX_SIGNAL_AGE_MS`)
- Logs include symbol, type, parsed fields, and error context.

---

## 9) Operational Concerns
- **Backpressure**: queue messages; process in order; debounce duplicate edits.
- **Clock**: use UTC; normalize `GMT+0` timestamps → ISO.
- **Health**: `/healthz` returns DB + Telegram + Exchange connectivity.
- **Observability**: `winston` JSON logs.
- **Security**: restrict Telegram channel id.

---

## 10) Acceptance Criteria
- Parses only in-scope message types; others ignored.
- Persists full signal history and all exchange orders in SQLite.
- Executes orders idempotently via ccxt and records results.
- Computes analytics (deviation, delay, slippage) and stores in `analytics` table.
- Logs errors on failures and deviations.
- Includes unit tests for regex parsing and precision rounding helpers.

---

## 11) Out of Scope (v1)
- Multiple TP ladders beyond the first target
- Portfolio risk mgmt, netting across symbols
- UI dashboard (CLI + DB only)
