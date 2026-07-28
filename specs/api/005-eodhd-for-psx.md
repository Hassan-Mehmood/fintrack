# EODHD for PSX Market Data

Integrate EODHD into the existing NestJS backend and Next.js frontend for Pakistan Stock Exchange data.

Requirements:

* Use EODHD for PSX-listed common stocks, preferred stocks, and ETFs.
* Keep the EODHD API token only on the NestJS backend.
* Support PSX symbol search, exchange symbol listing, end-of-day prices, and historical prices.
* Normalize EODHD responses into the application’s existing asset and price models.
* Add `eodhd` as a market-data provider.
* Support retrieving prices for multiple portfolio assets efficiently while respecting the free-tier request limit.
* Include open, high, low, close, adjusted close, volume, currency, provider date, and backend fetch timestamp when available.
* Cache price and symbol-list responses to minimize API usage.
* Clearly mark EODHD PSX prices as end-of-day rather than real-time.
* Handle invalid symbols, missing prices, stale data, timeouts, rate limits, and provider errors.
* Return partial portfolio results when data for one asset is unavailable.
* Never expose the EODHD token or raw provider responses to the frontend.
* Use the repository’s existing architecture, ORM, authentication, configuration, validation, logging, and error-handling conventions.
* Add unit tests with mocked EODHD responses and integration tests for search, symbol listing, and price retrieval.
* Do not modify unrelated files.

First inspect the repository and EODHD documentation, then implement the integration and run linting, type checking, and relevant tests.

Implementation decisions:

* Translate EODHD exchange code `KAR` to public exchange value `PSX`.
* Store canonical provider identifiers such as `LUCK.KAR`.
* Enforce a Redis-backed default budget of 20 EODHD calls per day.
* Cache symbol lists for 24 hours with a 30-day stale fallback.
* Cache end-of-day quotes and history for 24 hours with a seven-day stale fallback.
* Expose historical data through the authenticated API only; no historical chart is included in this delivery.
