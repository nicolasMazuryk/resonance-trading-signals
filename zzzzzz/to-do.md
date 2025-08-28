
- alerts (cloudwatch logs)
- deployment

-----------------------
Strategy #2
- enter 0.1-0.2% below signal price by LIMIT
- keep LIMIT until the SECOND signal (update, closing etc) - then CANCEL open order



[2025-08-27T20:01:11.075Z] [ERROR] Failed to place market order
2025-08-27T20:01:11.075Z
{
2025-08-27T20:01:11.075Z
"symbol": "LDO/USDT",
2025-08-27T20:01:11.075Z
"side": "sell",
2025-08-27T20:01:11.075Z
"amount": 90,
2025-08-27T20:01:11.075Z
"reduceOnly": true,
2025-08-27T20:01:11.075Z
"error": {
2025-08-27T20:01:11.075Z
"message": "binanceusdm {\"code\":-2022,\"msg\":\"ReduceOnly Order is rejected.\"}",
2025-08-27T20:01:11.075Z
"name": "InvalidOrder",
2025-08-27T20:01:11.075Z
"stack": "InvalidOrder: binanceusdm {\"code\":-2022,\"msg\":\"ReduceOnly Order is rejected.\"}\n at binanceusdm.throwExactlyMatchedException (/app/node_modules/ccxt/dist/cjs/src/base/Exchange.js:4936:19)\n at binanceusdm.handleErrors (/app/node_modules/ccxt/dist/cjs/src/binance.js:12215:18)\n at /app/node_modules/ccxt/dist/cjs/src/base/Exchange.js:765:51\n at process.processTicksAndRejections (node:internal/process/task_queues:105:5)\n at async binanceusdm.fetch2 (/app/node_modules/ccxt/dist/cjs/src/base/Exchange.js:4456:24)\n at async binanceusdm.request (/app/node_modules/ccxt/dist/cjs/src/binance.js:12259:26)\n at async binanceusdm.createOrder (/app/node_modules/ccxt/dist/cjs/src/binance.js:6320:28)\n at async ExchangeService.placeMarketOrder (/app/dist/services/exchangeService.js:230:27)\n at async OrderExecutionService.executeCloseSignal (/app/dist/services/orderExecutionService.js:215:31)\n at async OrderExecutionService.processSignal (/app/dist/services/orderExecutionService.js:47:21)"
2025-08-27T20:01:11.075Z
}