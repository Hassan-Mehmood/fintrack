# Market Data Integration Requirements

## Objective

Integrate Finnhub and CoinGecko into the existing NestJS backend and Next.js frontend so users can search for stocks and cryptocurrencies, add them as assets, record transactions, and view current portfolio values.

## Approved Implementation Decisions

* Target Finnhub's free US-stock coverage and CoinGecko's Demo API.
* Preserve the existing manual asset workflow for all other asset categories.
* Treat existing broker and cryptocurrency-wallet accounts as wallets.
* Store provider quote cache entries and rate-limit counters in Redis.
* Treat deposits and withdrawals as non-cash asset movements.
* Lock current-price editing for provider-backed assets.
* Return a clearly marked known subtotal when one or more holdings cannot be priced.
* Exclude AI-agent and MCP/tool integration from this delivery.
* Use on-demand REST requests only; streaming and background polling remain out of scope.

## Functional Requirements

1. Support two asset types:

   * Stocks
   * Cryptocurrencies

2. Use:

   * Finnhub for stock data
   * CoinGecko for cryptocurrency data

3. Users must be able to search for assets by:

   * Name
   * Symbol

4. Search results must return enough information to distinguish between similarly named assets, including:

   * Asset name
   * Symbol
   * Asset type
   * Provider
   * Provider-specific asset identifier
   * Exchange, when available
   * Logo or image, when available
   * Quote currency

5. The application must store a provider-specific identifier for every asset.

6. Cryptocurrency assets must not be identified by symbol alone.

7. Duplicate assets must not be created for the same provider and provider-specific identifier.

8. Users must be able to add an asset from the search results.

9. Users must be able to create transactions for an asset.

10. Transactions must support:

    * Buy
    * Sell
    * Deposit
    * Withdrawal

11. Each transaction must support:

    * Wallet identifier
    * Asset identifier
    * Transaction type
    * Quantity
    * Unit price
    * Fee
    * Execution date and time

12. Transaction values must preserve decimal precision.

13. The historical transaction price must remain independent from the current market price.

14. The backend must provide the latest available price for assets held in a wallet.

15. Price information must include:

    * Asset identifier
    * Current price
    * Currency
    * Provider
    * Provider market timestamp, when available
    * Backend fetch timestamp
    * Percentage change, when available

16. The portfolio response must include:

    * Current quantity held
    * Current asset price
    * Current market value
    * Cost basis
    * Realized gain or loss, when supported
    * Unrealized gain or loss
    * Total portfolio value
    * Price timestamp

17. The frontend must display when each price was last updated.

18. The frontend must not request prices separately for every individual transaction.

19. The backend must support retrieving prices for multiple assets in one request.

20. CoinGecko price requests should use batch capabilities where available.

21. The application must handle assets whose current price is temporarily unavailable.

22. A failure from one provider or asset must not prevent the remaining portfolio data from being returned when partial results are available.

## Backend Requirements

1. All Finnhub and CoinGecko communication must occur through the NestJS backend.

2. Provider API keys must never be exposed to the browser or included in public frontend environment variables.

3. The backend must expose a provider-independent response format to the frontend.

4. Provider-specific responses must not leak directly into wallet, portfolio, or transaction APIs.

5. The backend must validate:

   * Asset type
   * Provider
   * Provider-specific asset identifier
   * Transaction type
   * Quantity
   * Price
   * Fee
   * Wallet ownership
   * User authorization

6. Current prices must be cached to reduce provider API usage.

7. The implementation must respect provider rate limits.

8. The implementation must prevent excessive concurrent requests to external providers.

9. External API requests must have reasonable timeouts.

10. Provider failures must be logged without exposing API keys or sensitive data.

11. The backend must return appropriate errors for:

    * Invalid search queries
    * Unsupported asset types
    * Unsupported currencies
    * Unknown assets
    * Unavailable prices
    * Provider failures
    * Rate-limit failures

12. The integration must use the existing project’s:

    * Configuration system
    * Logging conventions
    * Validation conventions
    * Authentication system
    * Database conventions
    * Error-handling conventions
    * Package manager

## Frontend Requirements

1. Provide an asset search interface.

2. Allow users to select between:

   * Stock
   * Cryptocurrency

3. Search requests must be debounced.

4. Previous search requests should be cancelled or ignored when a newer search begins.

5. The interface must show:

   * Loading state
   * Empty state
   * Error state
   * Search results
   * Ambiguous asset choices

6. Selecting a search result must preserve the provider-specific asset identifier.

7. The frontend must use the NestJS backend rather than calling Finnhub or CoinGecko directly.

8. The portfolio interface must clearly show:

   * Current value
   * Current price
   * Gain or loss
   * Price currency
   * Last-updated timestamp
   * Unavailable or stale price state

## Future AI Agent Requirements

The following requirements are deferred and are not part of this delivery.

1. The AI agent must use backend application operations rather than calling Finnhub or CoinGecko directly.

2. The agent must be able to:

   * Search for assets
   * Retrieve asset prices
   * Retrieve wallet portfolios
   * Prepare transactions
   * Create transactions after confirmation

3. The agent must search for an asset before creating a new asset record.

4. The agent must never invent:

   * Asset identifiers
   * Provider identifiers
   * Prices
   * Exchange names
   * Transaction details

5. The agent must not identify cryptocurrencies using symbols alone.

6. When multiple assets match a user’s request, the agent must ask the user to select the correct asset.

7. Before creating a transaction, the agent must confirm:

   * Wallet
   * Asset
   * Transaction type
   * Quantity
   * Unit price
   * Fee
   * Execution date

8. The agent must not use the current market price as a historical transaction price unless the user explicitly requests that behavior.

9. All financial calculations and authorization checks must be performed by backend services rather than by the language model.

10. The agent must treat decimal values as strings when interacting with backend operations.

11. The agent must report the price currency and timestamp when presenting current prices.

## Data Integrity Requirements

1. Financial values must not rely on JavaScript floating-point precision where exact decimal accuracy is required.

2. Assets, transactions, wallets, and current prices must remain separate data concepts.

3. Current market prices must not overwrite transaction prices.

4. Provider-specific identifiers must remain stable after an asset is added.

5. Asset symbols must not be treated as globally unique.

6. Portfolio calculations must be reproducible from stored transactions.

7. Every transaction write must be attributable to the authenticated user.

## Security Requirements

1. Store all provider credentials securely on the backend.

2. Do not log API keys.

3. Do not return API keys in errors or responses.

4. Require authentication for wallet, transaction, and portfolio operations.

5. Verify that users can only access or modify their own wallets.

6. Validate all AI-agent tool inputs on the backend.

7. Do not trust values generated by the AI agent without server-side validation.

8. Apply appropriate request throttling to public search and price endpoints.

## Reliability Requirements

1. Cache recently retrieved prices.

2. Return cached prices when providers are temporarily unavailable, when appropriate.

3. Mark stale prices clearly.

4. Avoid failing an entire portfolio request because one asset price is unavailable.

5. Handle provider rate limits gracefully.

6. Handle provider timeouts gracefully.

7. Support retry behavior for temporary provider failures without creating request storms.

8. Ensure repeated transaction requests cannot accidentally create duplicate transactions.

## Testing Requirements

1. Add unit tests for:

   * Finnhub response handling
   * CoinGecko response handling
   * Asset normalization
   * Missing prices
   * Invalid provider responses
   * Provider timeouts
   * Rate-limit responses
   * Duplicate asset prevention
   * Portfolio calculations
   * Transaction validation

2. External API calls must be mocked in automated tests.

3. Add integration tests for:

   * Asset search
   * Adding an asset
   * Retrieving multiple prices
   * Creating a transaction
   * Retrieving a wallet portfolio
   * Authorization failures

4. Add frontend tests for:

   * Debounced search
   * Asset selection
   * Ambiguous results
   * Loading and error states
   * Portfolio price timestamps

5. Existing tests, linting, formatting, and type checking must continue to pass.

## Completion Criteria

The integration is complete when:

1. A user can search for and select a stock or cryptocurrency.
2. The selected asset is stored using a valid provider-specific identifier.
3. The user can record transactions for that asset.
4. The wallet portfolio shows current prices and calculated values.
5. Prices include source and timestamp information.
6. Provider credentials remain server-side.
7. Rate limits and provider failures are handled safely.
8. The AI agent can use the feature through validated backend operations.
9. Automated tests cover the primary success and failure cases.
10. No unrelated parts of the existing application are unnecessarily changed.
