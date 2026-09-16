# Crypto Pair Transactions

## Contract

- New crypto buys and sells exchange two distinct, positive holdings in one
  cryptocurrency wallet.
- The form expresses a pair as `1 traded asset = X counter asset` and records
  the traded quantity, editable execution USD price, and pair rate.
- The API derives and persists the gross counter quantity. Fees are in the
  counter asset: they increase a buy debit and reduce a sell credit.
- Both holdings are derived from one ledger transaction. The traded asset uses
  its execution price, while the counter asset uses the derived historical
  counter price for basis and realized-gain calculations.
- Legacy stablecoin settlement rows have null pair fields and retain their
  existing behavior.

## Activity

Stocks and Crypto render their complete domain-scoped transaction table in the
Activity tab. Everyday Money keeps `/transactions` locked to the MONEY scope;
the domains share the authoritative ledger but never mix their activity UI.
