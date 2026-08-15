Implement multi-currency support on the Investments page.

1. Add a configurable portfolio reporting currency.
2. Support PKR, USD, and Native Currencies display modes.
3. Display all portfolio summary cards in the selected reporting currency.
4. Preserve each investment’s original transaction and price currency.
5. Display native values as secondary information in holding rows.
6. Add the investment account and account currency to every holding row.
7. In Native Currencies mode, group totals by currency and do not show a
   combined total.
8. Store the historical FX rate for every cross-currency transaction.
9. Calculate reporting-currency cost basis using the FX rate from each
   transaction date.
10. Calculate current market value using the latest asset price and FX rate.
11. Calculate unrealized and realized gains in the selected reporting currency.
12. Never relabel a USD-denominated price as PKR or vice versa.
13. Show the exchange-rate source, rate, and last-updated timestamp.
14. Add filters and grouping for account, portfolio, asset type, and currency.
15. Add an optional currency-exposure breakdown.
16. Use decimal-safe arithmetic for asset prices, quantities, and FX rates.
