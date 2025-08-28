/**
 * Error messages that should be blacklisted from logging
 * These are expected errors that don't need to be logged
 */
export const ERROR_BLACKLIST = [
  // Binance Futures specific errors
  "Order does not exist.",
  "Order would immediately trigger.",
  "ReduceOnly Order is rejected.",
  "InvalidOrder: binanceusdm"
];

/**
 * Check if an error message should be blacklisted from logging
 */
export function isErrorBlacklisted(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  return ERROR_BLACKLIST.some(blacklistedMessage => 
    errorMessage.includes(blacklistedMessage)
  );
}
