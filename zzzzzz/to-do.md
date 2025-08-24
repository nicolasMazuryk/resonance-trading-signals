- track positions
- partial close 30%

- calculate breakeven after 30%

- move stop-loss order

3. calculate and track trading fees everywhere

------------------



-----
- logs (levels, messages), error handling, alerts
- deployment

- analytics
   - actual price execution

----- refactor
1. remove unnecessary data (channelId)

-----------------------
Strategy #2
- enter 0.1-0.2% below signal price by LIMIT
- keep LIMIT until the SECOND signal (update, closing etc) - then CANCEL open order