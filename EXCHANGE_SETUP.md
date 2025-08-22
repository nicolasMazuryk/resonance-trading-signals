# Exchange Setup Guide for Full End-to-End Execution

This guide will help you configure exchange credentials and test the complete order execution system.

## Prerequisites

1. **Exchange Account**: You need an account on a supported exchange (e.g., Binance, Bybit, OKX)
2. **API Keys**: Generate API keys with trading permissions
3. **Test Environment**: Start with testnet/sandbox mode for safety

## Supported Exchanges

The system uses CCXT library and supports most major exchanges. Common exchange IDs:
- `binanceusdm` - Binance Futures
- `bybit` - Bybit
- `okx` - OKX
- `kucoinfutures` - KuCoin Futures

## Step 1: Create Environment File

Copy the example environment file:
```bash
cp env.example .env
```

## Step 2: Configure Exchange Credentials

Edit your `.env` file with your exchange credentials:

```env
# Exchange Configuration
EXCHANGE_ID=binanceusdm
EXCHANGE_API_KEY=your_api_key_here
EXCHANGE_API_SECRET=your_api_secret_here

# Trading Parameters
DEFAULT_LEVERAGE=10
ORDER_SLIPPAGE_TOLERANCE=0.2
MAX_SIGNAL_AGE_MS=90000

# Environment
NODE_ENV=development  # Use 'development' for sandbox mode
```

## Step 3: API Key Setup

### Binance Futures (Recommended for Testing)

1. **Create Account**: Sign up at [Binance Futures](https://www.binance.com/en/futures)
2. **Enable Testnet**: Go to Settings → Testnet and enable it
3. **Generate API Keys**: 
   - Go to API Management
   - Create new API key
   - Enable "Futures Trading" permission
   - **Important**: Enable "Enable Reading" and "Enable Futures"
   - **Security**: Set IP restrictions to your IP address

### API Key Permissions Required

- ✅ **Read Info**: View account information
- ✅ **Spot & Margin Trading**: Place orders
- ✅ **Futures Trading**: Place futures orders
- ❌ **Withdrawals**: Not needed (security best practice)

## Step 4: Test Configuration

### 1. Test Exchange Connection

Run the CLI to test your exchange connection:

```bash
npm run cli exchange-test
```

This will:
- Test API connectivity
- Verify account balance
- Check market data access

### 2. Test with Small Amounts

**IMPORTANT**: Always start with small amounts in test mode!

```bash
# Test with replay mode (small number of signals)
npm run replay -- -b your_signal_bot -s 2024-01-01 --max-signals 2 --interval 10000
```

## Step 5: Safety Measures

### 1. Use Development Mode
Set `NODE_ENV=development` to enable sandbox/testnet mode.

### 2. Set Low Leverage
Start with `DEFAULT_LEVERAGE=1` or `DEFAULT_LEVERAGE=2`.

### 3. Monitor Orders
The system includes order monitoring and will log all activities.

### 4. Set Position Limits
Consider implementing position size limits in your exchange account.

## Step 6: Production Deployment

When ready for production:

1. **Switch to Production Mode**:
   ```env
   NODE_ENV=production
   ```

2. **Use Real Exchange** (not testnet):
   - Remove sandbox configuration
   - Use real API keys

3. **Increase Leverage** (if desired):
   ```env
   DEFAULT_LEVERAGE=10
   ```

4. **Monitor Closely**:
   - Check logs regularly
   - Monitor account balance
   - Set up alerts

## Troubleshooting

### Common Issues

1. **"Exchange not supported"**
   - Check `EXCHANGE_ID` spelling
   - Verify exchange is supported by CCXT

2. **"API key invalid"**
   - Verify API key and secret
   - Check IP restrictions
   - Ensure trading permissions are enabled

3. **"Insufficient balance"**
   - Add funds to your account
   - Check if using correct account type (spot vs futures)

4. **"Symbol not found"**
   - Verify symbol format (e.g., BTC/USDT)
   - Check if symbol is available on your exchange

### Debug Mode

Enable detailed logging:
```bash
DEBUG=ccxt:* npm run replay -- [options]
```

## Security Best Practices

1. **API Key Security**:
   - Never commit API keys to version control
   - Use environment variables
   - Set IP restrictions
   - Disable withdrawals

2. **Account Security**:
   - Use 2FA on exchange account
   - Monitor account activity
   - Set up withdrawal notifications

3. **Risk Management**:
   - Start with small amounts
   - Set stop-loss orders
   - Monitor positions regularly

## Testing Checklist

Before running with real money:

- [ ] Exchange connection test passes
- [ ] API keys have correct permissions
- [ ] Test with small amounts in sandbox mode
- [ ] Verify order execution works correctly
- [ ] Check error handling and logging
- [ ] Confirm stop-loss and take-profit logic
- [ ] Test with different signal types

## Support

If you encounter issues:

1. Check the logs in `logs/` directory
2. Verify your exchange configuration
3. Test with a different exchange if needed
4. Review CCXT documentation for your specific exchange
