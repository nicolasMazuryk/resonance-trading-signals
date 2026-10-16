/**
 * Utility functions for calculating trading fees
 */

/**
 * Calculate trading fee for an order
 * @param amount - Order quantity
 * @param price - Order price
 * @param feeRate - Fee rate (e.g., 0.0005 for 0.05%)
 * @returns Calculated fee amount
 */
export function calculateFee(amount: number, price: number, feeRate: number): number {
	const notionalValue = amount * price
	const fee = notionalValue * feeRate
	// Round to 8 decimal places to avoid floating-point precision issues
	return Math.round(fee * 100000000) / 100000000
}

/**
 * Calculate fee for a market order (taker fee)
 * @param amount - Order quantity
 * @param price - Order price
 * @param takerFeeRate - Taker fee rate
 * @returns Calculated taker fee amount
 */
export function calculateTakerFee(amount: number, price: number, takerFeeRate: number): number {
	return calculateFee(amount, price, takerFeeRate)
}

/**
 * Calculate fee for a limit order (maker fee)
 * @param amount - Order quantity
 * @param price - Order price
 * @param makerFeeRate - Maker fee rate
 * @returns Calculated maker fee amount
 */
export function calculateMakerFee(amount: number, price: number, makerFeeRate: number): number {
	return calculateFee(amount, price, makerFeeRate)
}

/**
 * Calculate fee based on order type
 * @param amount - Order quantity
 * @param price - Order price
 * @param orderType - Type of order ('market' or 'limit')
 * @param takerFeeRate - Taker fee rate
 * @param makerFeeRate - Maker fee rate
 * @returns Calculated fee amount
 */
export function calculateOrderFee(
	amount: number,
	price: number,
	orderType: 'market' | 'limit',
	takerFeeRate: number,
	makerFeeRate: number
): number {
	if (orderType === 'market') {
		return calculateTakerFee(amount, price, takerFeeRate)
	} else {
		return calculateMakerFee(amount, price, makerFeeRate)
	}
}
