# Frictionless Investment Tracking Flow

## Summary

Replace the current Accounts → Assets → Transactions → Investments journey with a single **Add holding** experience.

A new user must be able to:

1. Open Investments.
2. Search for a stock or cryptocurrency.
3. Enter an existing position or a new purchase.
4. Select or create an investment account inline.
5. Optionally assign the holding to a portfolio.
6. Immediately see value, cost basis, gain/loss, liquidity, and account totals.

Keep the transaction ledger as the source of truth. Watchlists remain separate from owned holdings, portfolios contain individual account-specific positions, and investment accounts show their fiat cash plus all holdings.

## User Experience

### Investments information architecture

Consolidate the current Assets, Investments, and Portfolios navigation into one **Investments** section with URL-persisted tabs:

- Overview
- Holdings
- Activity
- Portfolios
- Watchlists

Provide automatic, non-persisted views for:

- All investments
- Stocks
- Crypto
- Cash equivalents

Move the Assets page out of primary navigation and expose it as **Manage asset library** for manual prices, risk, classification, and metadata. Redirect the existing `/portfolios` route to the Portfolios tab and preserve existing bookmarks.

The Investments empty state presents two actions:

- **Add holding**
- **Add to watchlist**

### Add holding wizard

Implement one responsive three-step dialog, using a full-height sheet on mobile.

1. **Choose asset**
   - Unified search across US stocks, PSX stocks/ETFs, and cryptocurrencies.
   - Selecting a provider result creates or reuses the user’s asset record silently.
   - Provide manual entry for unsupported investments.
   - Hide provider, category, risk, and price-currency complexity unless manual entry is selected.

2. **Enter position**
   - Offer **I already own it** and **Record a new purchase**.
   - Select a compatible broker or crypto account, with smart preselection when only one exists.
   - Allow inline account creation with name, inferred type, currency, and current uninvested fiat cash.
   - Existing position fields: quantity, average unit cost or total cost toggle, acquisition date, and historical USD/PKR rate when applicable.
   - New purchase fields: quantity, unit price, fees, and date.
   - Default to cleared status and the correct investment category; hide transaction internals.
   - Calculate cost basis, gross amount, fees, FX conversion, and cash impact live.

3. **Organize and confirm**
   - Show the resulting quantity, cost basis, current value, gain/loss, account cash impact, and account total.
   - Portfolio assignment is optional.
   - Allow selection of an existing portfolio or inline creation by name.
   - New inline portfolios receive the holding but no cash allocation.
   - Finish with **Add another holding** and **View investments** actions.

Provider failure must retain entered data and offer retry or manual entry. Cross-currency positions prefill the current configured rate, allow editing for opening positions, and require a valid positive rate before converted reporting is treated as complete.

### Ongoing tracking

Each active holding receives direct actions:

- Buy more
- Sell
- Record dividend
- Record reinvestment
- More actions: split, bonus shares, deposit, and withdrawal
- View activity

Open these forms with the asset, account, currency, and category preselected. Prevent sales and withdrawals above available quantity.

Fully sold or withdrawn positions remain attached to their portfolio as **Closed positions**. Exclude them from current allocation and value while retaining their realized performance and activity.

### Investment-account detail

Enhance broker and crypto account detail pages with:

- Total account value
- Available fiat cash
- Cash-equivalent holdings
- Other invested holdings
- Total liquidity: fiat cash plus cash equivalents
- Cost basis and realized/unrealized gain
- Allocation and recent investment activity

An account always includes its complete cash balance and every holding recorded in that account. Custom portfolio membership does not change account totals.

### Watchlists

Support multiple named watchlists with create, rename, delete, add-item, and remove-item flows.

Each list shows current price, daily change, price freshness, and an **Add holding** action. An asset may remain watched after becoming owned and may appear in multiple watchlists. Watchlist items never affect balances, net worth, holdings, or portfolio calculations. Price alerts and broker synchronization remain out of scope.

### Portfolios

Replace account membership with individual position membership identified by `accountId + assetId`.

- A position can belong to at most one custom portfolio.
- The same asset held in different accounts is treated as separate positions.
- Built-in Stocks and Crypto views do not count as custom memberships.
- Portfolio creation selects active holdings and optional account-cash allocations.
- Deleting a portfolio removes memberships and allocations without deleting accounts, assets, or transactions.

Allocate fiat cash by percentage of an account’s current cash balance:

- Each allocation is between 0% and 100%.
- Allocations for one account across all portfolios cannot exceed 100%.
- Show allocated and remaining percentages while editing.
- Migrated portfolios receive no cash allocation until the user adds one.

Portfolio totals include selected holdings, selected cash-equivalent holdings, and allocated fiat cash. Show securities, cash equivalents, and fiat cash separately. Include cash and cash equivalents as low-risk liquidity in the weighted risk calculation.

## Domain, API, and Data Changes

### Ledger and calculation model

Add:

- `TransactionType.INVESTMENT_OPENING_POSITION`
- `TradeType.OPENING`
- `AssetLiquidityClass.INVESTMENT | CASH_EQUIVALENT`
- `AssetLiquidityClassSource.AUTO | USER`

An opening position behaves like a buy for quantity and cost basis but has:

- `Transaction.amount = 0`
- No account-cash effect
- No income or expense effect
- No fees
- Average unit cost stored as the investment price
- Total cost stored as quantity × normalized unit cost
- User-provided or configured historical FX snapshot

Continue using average-cost accounting. Fix investment reversals by excluding both members of a reversed transaction pair from holdings calculations; copying a positive investment detail into a reversal must not double the position.

Automatically classify a maintained set of canonical stablecoin provider IDs as cash equivalents. Allow users to override the classification. Existing assets default to `INVESTMENT`, with known stablecoins backfilled to `CASH_EQUIVALENT`.

Add these relationships:

- `PortfolioHolding(portfolioId, accountId, assetId)` with a global unique constraint on `(accountId, assetId)`.
- `PortfolioCashAllocation(portfolioId, accountId, percentage)`.
- `Watchlist(userId, name, displayOrder)`.
- `WatchlistItem(watchlistId, assetId)` unique per list.

### Public API changes

Add `POST /api/v1/investments/positions` as the wizard command endpoint. It accepts:

- Idempotency key
- Mode: `OPENING` or `BUY`
- Existing, provider-backed, or manual asset input
- Existing account or inline account-creation input
- Quantity and either normalized cost-basis input or purchase price/fees
- Date and optional historical FX rate
- Optional existing or inline-created portfolio

Resolve provider metadata before the database write, then atomically create/reuse the asset, optionally create the account or portfolio, create the transaction detail, add portfolio membership, and return the resulting asset, account, transaction, and holding.

Extend investment responses with:

- Active or closed position status
- Liquidity classification
- Portfolio membership
- Fiat cash, cash-equivalent, invested, and total-liquidity subtotals

Add an investment-account summary endpoint for broker and crypto account pages.

Change portfolio create/update payloads to accept:

- `holdings: [{ accountId, assetId }]`
- `cashAllocations: [{ accountId, percentage }]`

Validate ownership, actual holding history, one-portfolio-per-position, and aggregate cash allocation at the API layer. Perform allocation validation and writes transactionally.

Add watchlist CRUD endpoints and an item endpoint that accepts the same existing/provider/manual asset union used by Add holding.

Keep generic transaction endpoints and the Transactions page for auditing and advanced editing. Accept legacy portfolio `accountIds` payloads for one compatibility release by resolving their active holdings and assigning no cash.

### Migration and compatibility

1. Update architecture and product context before implementation, then add the new enums, fields, and tables through an additive Prisma migration.
2. Seed the cash-equivalent category/risk metadata and backfill known stablecoins.
3. Run an idempotent portfolio backfill using the shared holding calculator: convert every current non-zero holding in each legacy portfolio account into `PortfolioHolding`; create no cash allocations.
4. Switch portfolio reads and writes to the new tables while keeping `PortfolioAccount` read-only for one compatibility release.
5. Hide the old Assets and Portfolios sidebar entries, preserve redirect routes, and invalidate investments, accounts, portfolios, watchlists, transactions, and dashboard queries after relevant mutations.
6. Update `context/progress-tracker.md` after every meaningful implementation phase.

## Test and Acceptance Plan

### Automated coverage

- Opening positions add quantity and basis without changing cash, income, expenses, or net worth.
- Average-cost and total-cost inputs normalize identically.
- Cross-currency opening positions preserve the submitted historical FX snapshot.
- New purchases retain the existing authoritative gross, fee, cash, and overselling rules.
- Reversed investment pairs no longer affect holdings.
- Stablecoins remain asset holdings while contributing to cash-equivalent and liquidity totals.
- Account value equals fiat cash plus all priced active holdings without double counting.
- Portfolio value includes only its position memberships, cash equivalents, and allocated cash.
- Closed positions retain realized gain but contribute no active value or allocation.
- Position exclusivity and the 100% aggregate cash-allocation limit hold under concurrent writes.
- Wizard asset/account/portfolio creation is atomic and idempotent.
- Watchlist duplication, ownership, deletion, price fallback, and owned-plus-watched behavior are covered.
- Existing account-based portfolios migrate to the expected current positions with zero cash allocations.
- API authorization prevents cross-user asset, account, portfolio, and watchlist references.
- UI tests cover both wizard branches, inline account creation, manual asset fallback, FX validation, portfolio assignment, direct holding actions, watchlists, mobile layout, loading, error, and partial-price states.

### End-to-end acceptance

- A user with no accounts or assets can add an existing BTC position and create a Binance account without leaving the wizard.
- A user can add Apple as a new purchase and see broker cash, basis, and gain/loss update immediately.
- A USD-priced stock purchased through a PKR account displays correct native, PKR, and USD values.
- USDT appears as a holding and in the account’s cash-equivalent/liquidity subtotal.
- A user can create a Stock portfolio from selected holdings, allocate part of broker cash, and see correct totals.
- Selling an entire holding moves it to Closed positions while preserving realized performance.
- A watched asset can become owned without being removed from its watchlists.
- Existing dashboards, transaction history, adjustments, reversals, and account balances remain functional.

## Assumptions

- This remains a manually maintained portfolio tracker; broker/exchange synchronization and statement imports are excluded.
- USD and PKR remain the only converted reporting currencies.
- Opening positions store aggregate average cost, not individual tax lots.
- Watchlists provide prices only; alerts and target prices are deferred.
- Stablecoins are holdings, never fiat account balances.
- Custom portfolio cash allocation is percentage-based and dynamic.
- The same position belongs to at most one custom portfolio, while system-generated asset-class views may overlap it.
