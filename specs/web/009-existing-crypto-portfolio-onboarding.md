# Existing Crypto Portfolio Onboarding

## Goal

Let a user establish a named crypto portfolio from assets they already hold,
then continue recording atomic asset-to-asset buys and sells against the same
wallet ledger.

## Domain Mapping

- A cryptocurrency-wallet `Account` is the custody and settlement boundary.
- A `Portfolio` organizes the account-specific positions created during setup.
- The selected base currency becomes the wallet account currency.
- Each supplied asset quantity creates one cleared
  `INVESTMENT_OPENING_POSITION` / `OPENING` ledger entry with zero fiat-cash
  impact.
- Holdings and portfolio balances remain derived from opening entries and later
  transactions. No persisted `PortfolioAsset.quantity` balance is introduced.

## Setup Flow

1. Start **Set up existing portfolio** from Crypto.
2. Choose or add the first asset.
3. Enter the portfolio/wallet name, base currency, quantity, optional average
   purchase price, optional current value for a manual asset, and as-of date.
4. Review and save the opening position.
5. Add more opening assets while retaining the newly created wallet and
   portfolio selections.
6. Finish on the Crypto overview with refreshed holdings, portfolio, account,
   transaction, and dashboard queries.

## Cost and Value Rules

- Average purchase price is optional for an opening position.
- When average purchase price is omitted, quantity remains authoritative while
  cost basis, realized gain, unrealized gain, and unrealized percentage are
  unavailable for the affected position and aggregate reports are marked
  partial.
- An entered current value derives `current price = current value / quantity`
  for a manual asset. It never becomes historical cost.
- Provider-backed assets use provider prices and do not accept a user-entered
  current value override.
- Opening positions never include fees and never change fiat account cash.

## Future Transactions

Crypto buys and sells continue to use the existing paired settlement model.
For example, a BTC purchase paid with USDT creates one transaction that adds BTC
and deducts the authoritative USDT gross amount plus any fee charged in USDT.
Balances remain:

```text
opening quantity + incoming quantity - outgoing quantity
```

No fake historical buy or sell transactions are created for existing holdings.
