# Cash and Stablecoin Settlement for Investment Trades

## Summary

Add explicit settlement balances to investments:

- Stock trades use the broker account’s fiat **Cash** balance.
- Crypto trades require a same-wallet cash-equivalent asset such as USDT, USDC, or DAI.
- Buying crypto decreases the selected stablecoin; selling crypto increases it.
- Existing historical trades remain unchanged.
- Current stablecoin balances can be added as opening holdings with no cash impact.

## Implementation Changes

- Add an optional `settlementAssetId` relation to investment transaction details through an additive Prisma migration. `null` continues to mean fiat cash or a legacy trade; no historical rows are backfilled.
- Extend investment transaction requests with a settlement asset union supporting an existing asset or a CoinGecko asset such as USDT/USDC. Responses expose the resolved asset, settlement quantity, and display pair.
- Require settlement assets for newly created crypto buys and sells. They must be user-owned or provider-verified, USD-priced, classified `CASH_EQUIVALENT`, different from the traded asset, and located in the same crypto wallet.
- Calculate paired movements atomically:
  - Buy BTC with USDT: add BTC and deduct `gross + fees` USDT.
  - Sell BTC for USDT: deduct BTC and add `gross − fees` USDT.
  - Set the fiat account effect to zero for paired crypto trades.
  - Keep existing stock behavior, deducting or crediting broker cash.
- Validate cleared trades inside a serializable transaction. Block stock purchases with insufficient cash and crypto purchases with insufficient stablecoin quantity; revalidate when pending trades become cleared or paired trades are edited.
- Update holdings derivation so settlement debits remove stablecoin quantity and proportional basis, while settlement credits add quantity at a nominal USD 1 cost basis. Current CoinGecko prices continue to expose stablecoin depegging in market value.
- Preserve both sides through editing, reversal, status changes, and soft deletion. Legacy crypto trades without settlement continue using their existing calculations and cannot be retrofitted through this release.
- Update Add holding and transaction flows:
  - Broker trades show `Paid with Cash` or `Receive as Cash`, including available balance.
  - Crypto buys show `Pay with`; crypto sells show `Receive in`.
  - Show pair notation such as `BTC/USDT`, the gross conversion, fee, and resulting balances before confirmation.
  - Buy selectors show positive same-wallet cash-equivalent holdings.
  - Sell selectors may include zero-balance canonical stablecoins and create the asset/holding atomically.
  - Insufficient-balance errors offer an action to add an opening balance.
- Add dedicated balance actions:
  - Broker account: **Adjust cash balance**, using the existing audited balance-adjustment flow.
  - Crypto wallet: **Add stablecoin balance**, opening the holding wizard filtered to cash equivalents, defaulting stablecoin unit cost to USD 1 while allowing correction.
- Display crypto trades throughout activity and transaction details as paired asset movements instead of misleading zero-value cash transactions.
- Keep portfolio membership independent: trades never move or assign portfolio memberships automatically; newly created settlement positions start unassigned.
- Update product/architecture documentation before implementation and the progress tracker after each completed phase.

## Public API and Errors

- Extend `POST /api/v1/investments/positions` and investment details on transaction create/update with optional `settlementAsset`.
- Extend transaction responses with `settlementAssetId`, name, symbol, quantity, and pair label.
- Add stable error codes:
  - `SETTLEMENT_ASSET_REQUIRED`
  - `INVALID_SETTLEMENT_ASSET`
  - `SETTLEMENT_ASSET_NOT_FOUND`
  - `INSUFFICIENT_SETTLEMENT_BALANCE`
  - `INSUFFICIENT_ACCOUNT_CASH`
- Preserve existing response behavior for legacy transactions and non-trade investment events.

## Test Plan

- Verify stock buys/sells debit and credit fiat Cash and reject insufficient cleared cash.
- Verify BTC/USDT and BTC/USDC buys deduct `gross + fees`, while sells credit `gross − fees`.
- Verify a sale can create a previously unheld stablecoin balance.
- Reject cross-user, cross-wallet, non-cash-equivalent, non-USD, same-asset, and insufficient settlement selections.
- Cover concurrent purchases so the same stablecoin balance cannot be overspent.
- Verify edits excluding the original movement, pending-to-cleared transitions, reversals, and deletion restore both holdings correctly.
- Verify opening USDT/USDC balances have no fiat cash effect and appear in cash-equivalent and liquidity totals.
- Verify legacy transactions and their performance remain unchanged.
- Add UI coverage for pair selection, available balances, conversion preview, insufficiency recovery, stock Cash labels, zero-balance sell targets, and responsive layouts.
- Run Prisma validation/generation, API unit and end-to-end tests, web tests, lint, type-checking, and both production builds.

## Assumptions

- Crypto trading supports stablecoin settlement only; fiat and arbitrary crypto pairs such as ETH/BTC are excluded.
- Any same-wallet USD cash-equivalent is valid, not only USDT and USDC.
- Fees are denominated in and deducted from the selected settlement balance.
- Stablecoin transaction basis uses a nominal USD 1 per unit; live provider prices determine current value.
- Pair settlement applies only to buy and sell transactions. Opening positions, deposits, withdrawals, splits, bonuses, dividends, and reinvestments retain their existing behavior.
- Existing crypto-wallet fiat balances remain visible for compatibility but cannot fund new crypto trades.
