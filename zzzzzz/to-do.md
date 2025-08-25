

- list of ignored errors

- alerts (cloudwatch logs)
- deployment

----- refactor
1. remove unnecessary data (channelId)

- duplicated error messages (thrown)
- log error only on the higher level (but keep the error cascade to identify the exact place)

-----------------------
Strategy #2
- enter 0.1-0.2% below signal price by LIMIT
- keep LIMIT until the SECOND signal (update, closing etc) - then CANCEL open order
