# Progress Tracker

Update this file after every meaningful implementation
change.

## Current Phase

- Existing crypto portfolio onboarding is implemented on top of the separated
  Money, Stocks, and Crypto domains.

## Current Goal

- Manually verify existing-portfolio onboarding with authenticated provider and
  manual assets after the required local environment variables are configured.

## Completed

- Added a dedicated **Set up existing portfolio** path in Crypto. The first
  opening asset creates a same-named cryptocurrency wallet and custom portfolio
  with the selected base currency; subsequent assets retain that context so the
  user can add all current balances without reselecting it.
- Made average purchase price optional for opening positions. Quantity-only
  openings retain a zero cash impact and report cost basis and dependent P&L as
  unavailable instead of fabricating history; aggregate investment reports are
  marked partial and disclose the number of affected holdings.
- Added optional current-total-value capture for manual opening assets, deriving
  only the current unit price while provider-backed assets continue to use
  provider prices. Added API and web regression coverage for the setup flow,
  unknown cost basis, and current-value derivation.
- Verified the onboarding change with the API and web production builds, all
  174 API Jest tests, all 46 web Vitest tests, scoped API production lint, web
  type-checking, and web lint. Web lint retains only the two pre-existing
  Settings-page warnings.
- Documented the existing-crypto-portfolio domain mapping and onboarding rules
  in `specs/web/009-existing-crypto-portfolio-onboarding.md`.
- Separated the product into Money, Stocks, and Crypto navigation and routes.
  Accounts and general Transactions now show everyday finance only; Stocks and
  Crypto have independent overview, holdings, activity, portfolios, watchlists,
  asset libraries, account creation, filters, and domain-specific actions.
- Added required `InvestmentDomain` persistence, validated API scopes, account
  compatibility enforcement, domain-specific response contracts, and a
  deterministic migration that classifies assets and splits mixed portfolios
  and watchlists while preserving compatible records and original Securities
  IDs. Legacy investment URLs redirect to Stocks with compatible query tabs.
- Separated dashboard everyday analytics from independent Stocks and Crypto
  value/P&L cards while preserving combined net worth and the authoritative
  ledger. Investment funding remains visible in account-relative and domain
  activity without becoming income or expense.
- Applied `20260907180000_separate_investment_domains` to the configured Neon
  database and validated the full 17-migration chain against isolated
  PostgreSQL. Verified 171 API Jest tests, 5 API end-to-end tests, 45 web tests,
  Prisma validation, scoped API production lint, web type-check/lint, and both
  production builds; web lint retains only the two pre-existing Settings-page
  warnings.
- Added derived `FIAT_CASH` holding rows for broker and cryptocurrency-wallet
  ledgers without creating fiat assets. Account and global Investments views
  now include cash in account value, liquidity, currency exposure, and
  percentage-based portfolio allocations while excluding it from P&L.
- Added account-scoped funding actions: source-aware same-currency broker cash
  transfers, audited external/current cash adjustments, and a locked-wallet
  stablecoin opening-balance flow. Stablecoin holdings expose deposit,
  transfer, withdrawal, and activity actions.
- Added atomic `INVESTMENT_TRANSFER` ledger entries for USD cash-equivalent
  movements between owned crypto wallets. The API derives and transfers source
  average cost, validates ownership/account compatibility and available
  quantity, and keeps fiat cash, income, expenses, and net worth unchanged.
- Stablecoin asset deposits now preserve an editable acquisition cost that
  defaults to USD 1 in the UI; stablecoin positions remain restricted to crypto
  wallets.
- Applied `20260907120000_add_investment_transfer` to the configured Neon
  database. Verified Prisma format/validation/generation, 171 API Jest tests,
  5 API end-to-end tests, 45 web tests, web type-checking, scoped production
  lint, web lint, and both production builds.
- Documented the derived fiat-cash holding contract and atomic tracked-wallet
  stablecoin transfer behavior before implementation.

- Implemented broker Cash settlement and same-wallet USD cash-equivalent
  settlement for new crypto buys and sells. Paired trades now derive both
  holding movements, expose pair/settlement details through the API, preserve
  legacy unpaired crypto history, and revalidate cleared buys atomically in
  serializable transactions.
- Added Pay with/Receive in selectors, pair and balance previews, paired
  activity rendering, broker Cash labels, and a dedicated Add stablecoin
  balance opening-position flow. Stablecoin credits use nominal USD 1 basis
  while current provider prices retain depeg visibility.
- Applied `20260906230000_add_investment_settlement_asset` to the configured
  Neon database. Verified Prisma format/validation/generation, 168 API Jest
  tests, 5 API end-to-end tests, 44 web tests, web type-checking, scoped
  production-source lint, and both production builds.
- Documented explicit broker-cash and same-wallet stablecoin settlement and
  added the nullable investment settlement-asset relation plus its additive
  migration. Existing transaction rows remain unchanged.
- Fixed CoinGecko asset creation for canonical IDs such as BNB's
  `binancecoin` by revalidating selected cryptocurrencies through the exact
  coin endpoint instead of relying on ranked search results. Added provider
  and service regressions, confirmed the live BNB response, and verified the
  API build and 161 Jest tests.
- Added locally staged drag-and-drop account ordering with a keyboard-accessible
  grip, explicit save/cancel controls, a single batched persistence request, an
  ownership-checked atomic reorder endpoint, persistent database positions,
  stable backfill for existing accounts, and append-at-end behavior for new
  accounts. Applied the migration and verified 153 API unit tests, 41 web tests,
  5 API end-to-end tests, scoped lint, type-checking, and both production builds.
- Added a persistent Back to accounts action at the top of account detail pages.
- Added `/accounts/[accountId]` with stable balance metadata, default-this-month
  activity cards, URL-persisted date/search/type/category/label/status/direction/
  amount/note filters, sorting, pagination, account-relative transfer effects,
  responsive transaction views, and account-scoped actions.
- Added authenticated type-specific category discovery from defaults plus owned
  history, enforced those choices on create/edit/bulk updates, made transaction
  descriptions optional with display fallbacks, and added account/category API
  coverage. Verified 146 API unit tests, 4 API end-to-end tests, 38 web tests,
  both production builds, and scoped lint for all changed production files.

- Verified balance adjustments with 136 API unit tests, 28 web tests, two API
  end-to-end tests (including balance-endpoint authentication), both
  production builds, web type-check, and scoped API/web lint. Full web lint
  retains only the two pre-existing Settings-page warnings.
- Verified signed amounts, category persistence, ownership, retry deduplication,
  stale balances, and simultaneous adjustment conflicts against an isolated
  PostgreSQL 17 database; removed the temporary database afterward.
- Increased shared account-balance arithmetic precision to preserve the full
  NUMERIC(24, 8) range, with a regression test and real Decimal arithmetic in
  analytics tests. Documented the endpoint in
  `specs/api/account-balance-adjustments.md`.

- Added an Adjust balance action for every account, with exact signed preview,
  automatic Balance adjustment categorization, retry-safe submission, and
  account/dashboard/transaction/portfolio refresh after saving.

- Added an owned account balance-adjustment endpoint that records the signed
  difference as a cleared `ADJUSTMENT` with category `Balance adjustment`.
  Uses decimal arithmetic, serializable writes, stale-balance validation,
  and idempotency keys; leaves the opening balance unchanged.

- Added development Dockerfile stages and an automatic Compose override for
  Next.js Fast Refresh and NestJS watch mode. `docker compose up --build --watch`
  syncs source edits and rebuilds services after dependency/configuration changes;
  Prisma changes rebuild the API client without applying database migrations.
- Documented Docker development and explicit production startup in the root README.
- Verified development/production Compose validation, both development image
  builds, server startup, web file synchronization, and automatic API
  recompilation/restart after a temporary source edit (zero compiler errors).

- Added a guarded one-time wallet CSV importer with strict format and target-user
  validation, deterministic idempotency keys, decimal-safe normalization, and
  dry-run/apply modes.
- Mapped the 479-row wallet export into seven zero-opening-balance accounts and
  385 transactions: 241 expenses, 21 income entries, 94 paired transfers, and
  29 signed balance adjustments.
- Made account-and-transaction replacement atomic with a serializable Prisma
  transaction, explicit email confirmation, and a reviewed database-state
  guard while retaining the user's asset catalog and portfolio.
- Added focused importer tests, verified the real CSV/database dry run, applied
  the reviewed replacement, and confirmed the resulting counts and balances.
- Standardized project documentation references on the existing `context/` folder.
- Finalized MVP financial accounts as asset-only account types: bank account, cash wallet, digital wallet, broker account, and cryptocurrency wallet.
- Finalized MVP transaction types as income, expense, transfer, refund, fee, investment buy, investment sell, and adjustment.
- Moved receipt file uploads out of MVP scope.
- Standardized backend domain modules under `apps/api/src/modules/`.
- Standardized generated shadcn/ui components under `apps/web/components/ui/`.
- Removed `packages/ui/` from the initial project structure.
- Created placeholder-only directories for `apps/web`, `apps/api`, `packages/financial-engine`, `packages/shared-types`, and `packages/database`.
- Initialized shadcn/ui in `apps/web` using the Nova/Radix preset.
- Configured shadcn/ui generation paths for `apps/web/components/ui` and `apps/web/lib`.
- Added the generated `Button` component and `cn` utility under the root-level web component structure.
- Aligned shadcn theme variables with the documented finance dashboard color tokens.
- Added standard Next.js build-output ignores for `.next/` and TypeScript build info.
- Updated the web folder conventions to keep `components/`, `features/`, `hooks/`, and `lib/` beside `app/`.
- Added shadcn/ui dashboard primitives for cards, sidebar, charts, tables, badges, progress, and supporting overlays.
- Replaced the default home page with a static finance dashboard containing sidebar navigation, net-worth metrics, charts, connected wallets, expense breakdown, and recent activity.
- Added chart wrappers under `apps/web/features/dashboard/` using Recharts through shadcn/ui chart components.
- Installed Clerk for the Next.js web app.
- Added ClerkProvider with the shadcn Clerk theme to the root layout.
- Added a protected-first Clerk proxy that keeps only `/sign-in` and `/sign-up` public.
- Added two-column sign-in and sign-up pages using Clerk prebuilt auth components.
- Verified the Clerk web setup with `pnpm run lint` and `pnpm run build`.
- Vertically centered the left-column marketing copy on the sign-in and sign-up pages.
- Moved the auth page logo into the centered content stack so it no longer overlaps the headline.
- Increased left-column padding on the sign-in and sign-up pages for better desktop spacing.
- Added a Clerk-powered sidebar user profile block above the base currency display with visible name/email and profile/logout access.
- Removed the static sidebar base-currency block and expanded the Clerk profile menu trigger across the full profile row.
- Installed Prisma, Prisma Client, the Neon Prisma adapter, and dotenv in the NestJS API app.
- Added API-local Prisma schema/configuration for Neon PostgreSQL.
- Added initial Prisma models and generated migration for `users`, `accounts`, and `transactions`.
- Added a global NestJS `PrismaModule` and `PrismaService`.
- Added Prisma package scripts for client generation, development migrations, deployment migrations, and Studio.
- Documented that Prisma schema and migrations currently live under `apps/api/prisma` for the standalone API app.
- Verified the API Prisma setup with Prisma schema validation, client generation, Nest build, Jest tests, and lint.
- Added Clerk backend token verification to the NestJS API.
- Added a global API auth guard that requires bearer Clerk session tokens on non-public routes.
- Added local user upsert from Clerk profiles using `users.clerk_id` as the identity key.
- Added `GET /api/v1/users/me` to return the authenticated local user.
- Verified the Clerk user upsert implementation with Jest, e2e tests, Nest build, and lint.
- Configured the API Prisma client generator to emit CommonJS-compatible output so the generated client loads correctly under the current NestJS runtime.
- Added a server-side web sync that sends the active Clerk bearer token to `GET /api/v1/users/me` so authenticated page loads create or refresh the local user row automatically.
- Added an `accounts` NestJS module with authenticated list, get, create, update, and delete endpoints under `/api/v1/accounts`.
- Added DTO validation for account payloads and enabled a global NestJS validation pipe.
- Enforced account ownership in all account queries and blocked account deletion when recorded transactions exist.
- Added Jest service coverage for account CRUD behavior and delete protections.
- Added a shared authenticated Query Provider to the web app for client-side API state.
- Extracted a reusable authenticated app shell so the dashboard and accounts pages share sidebar navigation and header structure.
- Added the `/accounts` page with authenticated account listing plus create, edit, and delete flows using shadcn dialogs, alerts, empty states, and tables.
- Documented that account deletion is supported only for accounts without recorded transactions and added the delete endpoint to the architecture overview.
- Added the transaction CRUD UI under `apps/web/features/transactions/` with types, Zod schema, API client, form dialog, and `/transactions` page.
- Wired `/transactions` into the sidebar navigation and added active-state support.
- Added the transactions NestJS module under `apps/api/src/modules/transactions/` with `GET`, `POST`, `GET /:id`, `PATCH`, `DELETE`, and `POST /:id/reverse` endpoints under `/api/v1/transactions`.
- Enforced user ownership for transaction accounts and destination accounts.
- Implemented reversal as a linked corrective transaction that offsets the original amount while preserving the original record.
- Implemented delete as a hard delete for mutable transactions; account balance is restored implicitly because balances are derived from transactions.
- Added DTO validation for transaction payloads, including transfer-specific destination-account rules.
- Added Jest service coverage for transaction CRUD, transfer validation, reversal, and delete protections.
- Added an `analytics` NestJS module under `apps/api/src/modules/analytics/` with a `GET /api/v1/analytics/dashboard` endpoint.
- Implemented dashboard stat calculations in `AnalyticsService`, including account balances, total net worth, liquid cash, invested cash, monthly summaries, recent activity, and asset allocation.
- Treated investment purchases with a destination account as internal asset shifts so net worth remains unchanged.
- Added Jest coverage for dashboard calculations including transfers, investment purchases, reversals, and empty states.
- Replaced the static dashboard page with a dynamic `DashboardPage` that fetches real stats from the API.
- Added `dashboard-api.ts`, `dashboard-types.ts`, and `dashboard-page.tsx` under `apps/web/features/dashboard/`.
- Updated dashboard charts to accept data props and render real monthly and allocation data.
- Added explicit "Coming soon" cards for expense breakdown, investment performance, goal progress, and budget progress because those database models do not exist yet.
- Extracted shared formatting utilities into `apps/web/lib/formatting.ts` and reused them in the accounts and dashboard pages.
- Wired dashboard query invalidation into account and transaction mutations so the dashboard refreshes after changes.
- Added `exchangeRate` to the `User` Prisma model and generated a migration (`add_user_exchange_rate`).
- Added `GET /api/v1/users/me/settings` and `PUT /api/v1/users/me/settings` endpoints for reading and updating user currency preferences.
- Updated `AuthenticatedUser` type to include `exchangeRate` and updated the auth guard/user service to propagate it.
- Added a `CurrencyConverter` class in `AnalyticsService` that converts all dashboard amounts to the user's `baseCurrency` using the stored `exchangeRate`.
- Dashboard metrics, account balances, monthly summaries, recent activity, and asset allocation are now returned in the user's selected default currency (USD or PKR).
- Added a `/settings` page with a currency selector (USD/PKR) and an exchange-rate input.
- Settings changes invalidate both the settings query and the dashboard query so the UI updates immediately.
- Added Docker support for the NestJS API (`apps/api/Dockerfile`) with multi-stage pnpm builds and Prisma client generation.
- Added Docker support for the Next.js web app (`apps/web/Dockerfile`) with build-time `NEXT_PUBLIC_*` arguments.
- Added a root `docker-compose.yml` that orchestrates PostgreSQL, the API, and the web app with health checks and migrations.
- Added a root `.env.example` with the Clerk and public API URL variables required by Docker Compose.
- Updated the transaction form to display the selected account and lock the currency field to that account's default currency.
- Enforced transaction currency matching the selected account currency on the backend and added corresponding tests.
- Replaced the accounts page opening-balance column with a computed current balance and removed the deletable summary/activity text.
- Allowed account deletion even when transactions exist; the backend now deletes linked transactions and the frontend shows a warning.
- Updated `PrismaService` to select the Neon adapter for Neon URLs and the standard `pg` adapter for local PostgreSQL so Docker Compose can use a local database.
- Added the Settings route to the sidebar navigation with active-state highlighting.
- Disabled and visually muted the unavailable Budgets and Goals sidebar pages.
- Added `AssetCategory`, `RiskProfile`, and `Asset` models to the Prisma schema.
- Generated and applied the `add_investment_core_models` migration to the Neon database.
- Created a Prisma seed script (`apps/api/prisma/seed.ts`) with default asset categories and risk profiles.
- Configured `prisma db seed` through `apps/api/prisma.config.ts` and added a `prisma:seed` script.
- Added a NestJS `assets` module with `GET /api/v1/assets/metadata`, `GET /api/v1/assets`, `GET /api/v1/assets/:id`, `POST /api/v1/assets`, `PATCH /api/v1/assets/:id`, and `DELETE /api/v1/assets/:id`.
- Enforced user ownership for assets and validated category/risk-profile references in `AssetsService`.
- Added Jest service tests for asset CRUD, reference validation, and ownership checks.
- Added the `/assets` page under `apps/web/app/assets/page.tsx` and the `AssetsPage` feature component.
- Added an asset form dialog with category/risk-profile selectors, current price, and currency fields.
- Added the `Assets` route to the sidebar navigation with active-state highlighting.
- Verified the API build, Jest tests, web lint, and web build after the Phase 1 changes.
- Added `TradeType` enum and `InvestmentTransactionDetail` model linked to `Transaction` and `Asset`.
- Generated and applied the `add_investment_transaction_details` migration to the Neon database.
- Extended transaction DTOs with an optional `investment` object containing `assetId`, `tradeType`, `quantity`, `price`, `fees`, and `notes`.
- Enforced investment detail validation in `TransactionsService`: required for buy/sell, asset ownership check, trade-type matching, and positive quantity/price/non-negative fees.
- Created/updated `InvestmentTransactionDetail` rows atomically with transaction creates and updates.
- Copied investment details to reversal transactions so buy/sell reversals offset both cash and holdings.
- Added Jest tests for investment buy/sell creation, missing details, wrong trade type, asset ownership, and invalid amounts.
- Extended frontend `Transaction` and `TransactionPayload` types with `investmentDetail`.
- Extended the transaction form schema and dialog with conditional investment fields for buy/sell transactions.
- Fetched assets in the transactions page and passed them to the form dialog.
- Added investment detail summary (asset, quantity, price) to the transactions table.
- Verified the API build, Jest tests, web lint, and web build after the Phase 2 changes.
- Extracted `CurrencyConverter` from `AnalyticsService` into `apps/api/src/common/financial/currency-converter.ts` for reuse across modules.
- Added a pure `calculateHolding` function in `apps/api/src/common/financial/holdings.ts` using average-cost basis.
- Added Jest unit tests for `calculateHolding` covering single buys, multiple buys, partial sells, full sells, and empty transactions.
- Added a NestJS `investments` module with `GET /api/v1/investments/holdings` and `GET /api/v1/investments/summary` endpoints.
- Implemented `InvestmentsService` to derive per-asset holdings (quantity, average cost, cost basis, current value, realized/unrealized gain) from `InvestmentTransactionDetail` rows.
- Converted holding values to the user's `baseCurrency` using the shared `CurrencyConverter`.
- Added Jest service tests for holdings listing, summary totals, and currency conversion.
- Added the `/investments` page under `apps/web/app/investments/page.tsx` and the `InvestmentsPage` feature component.
- Added a `HoldingsTable` component with columns for quantity, average cost, current price, cost basis, current value, unrealized gain, and realized gain.
- Added summary cards for total value, cost basis, unrealized gain, and realized gain on the investments page.
- Wired the sidebar `Investments` item to `/investments` with active-state highlighting.
- Verified the API build, Jest tests, web lint, and web build after the Phase 3 changes.
- Added investment summary metrics (`totalInvestmentValue`, `totalInvestmentCostBasis`, `totalUnrealizedGain`, `totalUnrealizedGainPercent`, `totalRealizedGain`) and category-level `investmentAllocation` to the dashboard API response.
- Wired `InvestmentsModule` into `AnalyticsModule` so `AnalyticsService` can derive dashboard investment data from `InvestmentsService` holdings.
- Updated the dashboard page to display investment summary cards and an investment allocation chart, and removed the "Investment performance" coming-soon card.
- Updated dashboard Jest tests to mock `InvestmentsService` and assert the new investment metrics and allocation fields.
- Verified the API build, Jest tests, web lint, and web build after the Phase 4 changes.
- Added advanced investment transaction types (`DIVIDEND`, `INTEREST`, `INVESTMENT_SPLIT`, `INVESTMENT_BONUS`, `INVESTMENT_REINVESTMENT`) to the `TransactionType` enum and generated/applied the `add_advanced_investment_transaction_types` migration.
- Updated transaction cash-flow effects, holdings calculation, transaction validation, and dashboard analytics to handle dividends, interest, splits, bonus shares, and reinvestments.
- Extended the transaction form schema and dialog with conditional investment fields for the new transaction types.
- Added Jest tests for advanced investment transaction creation/validation and updated holdings tests for split, bonus, reinvestment, dividend, and interest scenarios.
- Verified the API build, Jest tests, web lint, and web build after the Phase 5 changes.
- Added `Portfolio` and `PortfolioAccount` models to the Prisma schema and generated/applied the `add_portfolios` migration to the Neon database.
- Created a NestJS `portfolios` module with `GET`, `POST`, `GET /:id`, `PATCH`, and `DELETE` endpoints under `/api/v1/portfolios`.
- Implemented portfolio metrics (total value, cost basis, unrealized/realized gains, weighted risk score, category allocation) derived from grouped account balances and holdings.
- Added Jest service tests for portfolio CRUD, account ownership validation, and metric calculations.
- Created the `/portfolios` page with portfolio cards, create/edit/delete dialogs, and account selection.
- Added a `Portfolios` item to the sidebar navigation.
- Verified the API build, Jest tests, web lint, and web build after the Phase 6 changes.
- Fixed stale data on page switches and tables not refreshing by setting the React Query default `staleTime` to `0` and enabling `refetchOnWindowFocus` in `apps/web/components/query-provider.tsx`.
- Verified the web lint and web build after the stale-data fix.
- Added provider metadata and identity constraints for Finnhub stocks and CoinGecko cryptocurrencies, transaction idempotency keys, and non-cash investment deposit/withdrawal transaction types.
- Added the provider-independent NestJS market-data module with authenticated search and batch-price endpoints, normalized provider errors, bounded retries/timeouts, Finnhub concurrency limiting, CoinGecko batching, and Redis-backed request budgets.
- Added 60-second fresh quote caching with 24-hour stale fallback, provider-backed asset creation with backend metadata revalidation, and locked provider identity/price fields.
- Integrated provider quotes into assets, holdings, investment summaries, and portfolio metrics with stale/unavailable states, nullable price-dependent calculations, and known-subtotal partial metadata.
- Replaced the add-asset flow with market-search and manual tabs, including 350 ms debouncing, request cancellation, provider metadata, explicit result selection, and manual refresh actions.
- Added investment deposit/withdrawal form behavior and per-submission UUID idempotency keys.
- Added Redis and provider environment configuration to Docker Compose and `.env.example`.
- Added provider adapter, holdings, and market-search tests plus a Vitest/Testing Library setup for the web app.
- Verified the integration with Prisma validation, API build, 75 Jest tests, API e2e, scoped API lint, web type-check, web lint, 2 Vitest tests, and the Next.js production build.
- Applied the `add_market_data_integration` migration to the Neon database, adding provider metadata columns to assets and transaction idempotency support.
- Replaced the previous unapplied PSX provider decision in product and architecture documents with EODHD end-of-day data.
- Added the `EODHD` enum migration and configured `EODHD_API_TOKEN`, `EODHD_BASE_URL`, and a 20-request daily budget.
- Applied the `add_eodhd_provider` migration to the Neon database so the PostgreSQL `AssetProvider` enum accepts `EODHD`.
- Added the EODHD adapter with cached `KAR` stock/ETF catalog search, canonical `.KAR` identifiers, bounded EOD quote retrieval, normalized OHLCV bars, and safe query-token authentication.
- Added authenticated PSX symbol listing and owned-asset daily history endpoints, 24-hour EOD/history caches with stale fallback, and Redis-backed 20-call daily budgeting.
- Extended asset and holding contracts and UI metadata with explicit current/EOD price type, provider date, OHLC fields, and EOD/stale labels.
- Added EODHD adapter, service, controller, budgeting, caching, and web search tests without live provider calls.
- Verified Prisma validation/generation, API build, 94 Jest tests, scoped API lint, API e2e, web type-check/lint, 3 Vitest tests, and the Next.js production build.
- Removed provider-name badges from add-asset market search results and simplified the assets table so current price and daily change render in separate columns without provider metadata in the price cell.
- Removed the assets table's updated-price column to keep the table focused on the current price and daily change.
- Standardized frontend USD and PKR monetary displays to exactly two decimal places through the shared currency formatter, including transaction amounts and investment prices.
- Prevented portaled select menus from dismissing any parent dialog when clicked within its visual bounds, while preserving backdrop-click dismissal, with transaction and asset-dialog regression coverage.
- Updated the transaction modal so buy, sell, reinvestment, dividend, interest,
  split, bonus-share, deposit, and withdrawal flows show only their relevant
  inputs; calculated amounts and split quantities are read-only and update
  immediately with decimal-safe arithmetic.
- Added current-holding context and client/server validation that prevents
  investment sales and withdrawals from exceeding the available quantity.
- Made the API authoritative for investment gross amounts and final cash
  impacts, added persisted `gross_amount` values, and stopped requiring price
  or cash inputs for non-cash asset movements.
- Added backend and frontend regression coverage for investment calculations,
  conflicting client totals, optional dividend assets, stock splits, non-cash
  deposits, and overselling.
- Applied `20260729120000_add_investment_gross_amount` to the configured Neon
  database and confirmed all nine Prisma migrations are up to date.
- Added investment price-currency fields and USD-to-PKR FX rate snapshots with
  source and observation timestamps to investment transaction details.
- Added dedicated current-rate provenance fields to user currency settings and
  snapshot the configured manual rate when investment transactions are created
  or materially edited.
- Made cross-currency investment cash impacts authoritative in the API by
  converting native gross amounts into the selected account currency before
  applying account-currency fees.
- Reworked investment holdings to be scoped by asset and account, including
  account currency and portfolio membership on every API row.
- Added USD, PKR, and Native Currencies investment reporting modes. Historical
  cost basis and realized gains use transaction FX snapshots; current values
  use the latest configured rate.
- Added native-currency grouped totals without a combined total, server-side
  account/portfolio/asset-type/currency filters, grouping controls, and an
  optional currency-exposure breakdown.
- Updated the Investments table to show reporting values with correctly labeled
  native values as secondary information, and corrected transaction price
  labels to use the asset price currency.
- Applied `20260729170000_add_investment_fx_reporting` to the configured Neon
  database; all ten Prisma migrations are up to date.
- Verified Prisma validation/generation, the API build and 109 Jest tests,
  scoped API lint, web type-check/lint, 17 Vitest tests, and the Next.js
  production build.
- Split transaction classification into a required `category` field and a
  separate required free-text `description` across Prisma, the transactions
  API, wallet imports, dashboard recent activity, and the web transaction form.
- Updated the transactions table and search to show and query category and
  description independently, with category fallback text for migrated legacy
  rows and category-preserving reversal behavior.
- Applied `20260830120000_add_transaction_category_and_description` to the
  configured Neon database; all eleven Prisma migrations are up to date.
- Verified Prisma validation/generation, both application builds, 114 API Jest
  tests, scoped API lint, web lint, and 18 Vitest tests after the transaction
  category/description migration.
- Completed the Transactions-page MVP improvements with server-side search,
  multi-value filters, filtered base-currency summaries, six sortable fields,
  URL-persisted filter state, and 25/50/100-row pagination.
- Added processing status, transaction-owned labels, external references, and
  soft deletion to the transaction model. Cleared, non-deleted transactions are
  now the only rows that affect account balances, dashboard analytics, and
  investment holdings.
- Added desktop row selection and atomic bulk category, label, cleared-status,
  and delete actions, plus overflow actions for view, edit, duplicate, reverse,
  and delete.
- Added the transaction detail sheet, filter chips, debounced search, sticky
  desktop table header, loading preservation, success toasts, mobile filter
  sheet, and compact mobile transaction cards.
- Applied `20260830153000_add_transaction_table_fields` to the configured Neon
  database; all twelve Prisma migrations are up to date.
- Verified Prisma validation/generation, both production builds, 114 API Jest
  tests, scoped API source lint, web lint, and 21 Vitest tests after completing
  the Transactions-page improvements.
- Fixed the mobile transaction card hydration error by making the full-card
  view control and overflow-menu trigger sibling buttons instead of nesting the
  menu trigger inside the card button.
- Started the frictionless investment-tracking plan with its additive domain
  foundation: opening-position transaction/trade types, asset liquidity class
  and provenance, position-level portfolio membership, percentage-based
  portfolio cash allocation, and named watchlist tables.
- Added automatic canonical CoinGecko stablecoin classification, explicit
  cash-equivalent category/risk seed metadata, and user-overridable liquidity
  classification for manual and provider-backed assets.
- Made opening positions establish quantity and cost basis with zero fees and
  no account-cash effect, and excluded both sides of reversed investment pairs
  from holdings, portfolio calculations, and oversell validation.
- Added an idempotent legacy portfolio backfill command that assigns each
  active `accountId + assetId` position to at most one existing portfolio and
  creates no cash allocations.
- Verified the investment foundation with Prisma validation, the API build,
  155 API Jest tests, scoped API lint, web type-check/lint, 41 web tests, and
  the Next.js production build.
- Applied `20260906150000_add_investment_position_foundation` to the configured
  Neon database and confirmed all fourteen Prisma migrations are up to date.
- Completed the frictionless Investments experience: URL-persisted Overview,
  Holdings, Activity, Portfolios, and Watchlists tabs; automatic asset-class
  views; consolidated navigation; and a preserved `/portfolios` redirect.
- Added the responsive three-step Add holding wizard for provider-backed,
  library, and manual assets; opening positions and purchases; inline
  investment accounts; live cost/cash/FX review; and optional inline portfolio
  assignment without exposing ledger internals.
- Added the atomic, idempotent `POST /api/v1/investments/positions` command and
  applied provider resolution before its database transaction. The command can
  create or reuse the asset, create an account, write the ledger transaction,
  create a portfolio, and attach the account-specific position.
- Switched portfolio reads and modern writes to position memberships and
  percentage-based account-cash allocations, retained the legacy `accountIds`
  compatibility payload, added position/cash editing in the Investments UI,
  and ran the idempotent legacy backfill (no eligible memberships remained).
- Added multiple named watchlists with create, rename, delete, add/remove item,
  provider/library asset lookup, current-price freshness, and Add holding
  actions. Watchlists remain calculation-neutral.
- Added investment-account summaries for broker and crypto account pages,
  including fiat cash, cash equivalents, invested value, total liquidity,
  account value, basis, gains, allocation, and recent activity.
- Added preselected holding actions for buy, sell, dividend, reinvestment,
  split, bonus, deposit, withdrawal, and filtered activity. Closed positions
  remain visible and attached while contributing no current allocation value.
- Ran the updated reference-data seed and verified the implementation with the
  API build and 158 Jest tests, web type-check/lint and 43 Vitest tests. Web
  lint retains only two pre-existing Settings warnings.

- Ready for end-to-end manual verification of the dashboard, `/accounts`, `/transactions`, `/investments`, and `/portfolios` flows once Clerk environment variables are configured.

## In Progress

- No implementation work currently in progress.

## Next Up

- Manually verify a portfolio containing USDT, BTC, and ETH, including an
  omitted BTC cost basis and a later BTC/USDT buy and sell.
- Collect current balances for the seven imported accounts and record explicit
  adjustment transactions to reconcile their zero-based derived balances.
- Manually verify USD, PKR, and Native Currencies modes with holdings spread
  across multiple accounts and portfolios.
- Verify a USD-priced investment purchase from a PKR account and confirm the
  transaction snapshot, cash impact, and Investments-page basis.
- Manually verify create/edit flows for every investment transaction type with
  authenticated accounts and holdings.
- Configure `FINNHUB_API_KEY`, `COINGECKO_API_KEY`, `EODHD_API_TOKEN`, and `REDIS_URL` before live-provider verification.
- Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` before running authenticated flows locally or in deployment.
- Run end-to-end manual verification of the `/assets`, `/transactions`, `/investments`, and `/portfolios` flows once Clerk environment variables are configured.

## Open Questions

- None currently identified from the documentation alignment pass.

## Architecture Decisions

- Money, Stocks, and Crypto are separate user-facing domains over one shared,
  authoritative ledger. Investment assets, portfolios, and watchlists have a
  required `SECURITIES` or `CRYPTO` domain, and the dashboard combines only
  their values for net worth.
- Context documents remain in `context/` because the AI workflow already depends on that folder.
- Liability and debt account tracking is out of scope for the MVP, so dashboard totals are asset-only.
- Reversals are modeled as linked corrective transactions instead of a standalone transaction type so audit history remains traceable.
- Receipt file uploads are future scope, so file storage is not required for the initial MVP.
- Backend domain modules live under `apps/api/src/modules/`; shared backend utilities live under `apps/api/src/common/`.
- Generated shadcn/ui components live under `apps/web/components/ui/`.
- Shared UI remains inside `apps/web/components/` for the initial single-frontend MVP.
- Web routes use a protected-first Clerk proxy: all routes require authentication except `/sign-in` and `/sign-up`.
- Prisma schema and migrations live under `apps/api/prisma` while the API remains a standalone NestJS package.
- The Prisma command config prefers `DIRECT_URL` for Neon migrations when available and falls back to `DATABASE_URL`.
- The API creates or refreshes the local `users` row on authenticated API requests instead of relying on a Clerk signup webhook for initial user persistence.
- The web app performs the initial Clerk-to-API sync from the server-rendered root layout so authenticated page loads populate the local user row without requiring a client-side effect.
- Account deletion is allowed only when the account has no linked source or destination transactions so historical financial records remain traceable.
- Dashboard financial calculations are implemented inside `AnalyticsService` for now because `packages/financial-engine` remains a placeholder and the repository workspace is not yet wired to share packages across apps.
- Investment assets are modeled as user-owned records linked to global `AssetCategory` and `RiskProfile` reference tables, matching the existing per-user ownership model.
- Asset categories and risk profiles ship as seed data and are configurable by extending the reference tables; no admin UI is required for MVP.
- Holdings, cost basis, and investment performance will be derived from transactions rather than stored independently, per `specs/api/004-adding-investments.md`.
- Finnhub provides on-demand US-stock data, EODHD provides PSX stock and ETF end-of-day data, and CoinGecko Demo provides cryptocurrency data through a provider-independent NestJS market-data module.
- `STOCK` remains the domain market type; the search API uses `exchange=US|PSX` to route stock searches without exposing provider selection.
- Redis caches Finnhub and CoinGecko quotes for 60 seconds with 24-hour fallback, caches EODHD quotes/history for 24 hours with seven-day fallback, caches the EODHD catalog for 24 hours with 30-day fallback, and coordinates provider request budgets.
- Existing accounts are the wallet boundary for investment transactions; deposits and withdrawals move asset quantity without changing cash balances.
- Provider-backed asset identifiers and pricing modes are immutable, while manual assets retain manually editable prices.
- Investment detail `grossAmount` is derived from quantity and price, fees are
  stored separately, and `Transaction.amount` is the authoritative final cash
  impact. Calculated and non-cash totals sent by clients are ignored.
- The existing `ADJUSTMENT` flow remains a cash-amount adjustment; an
  investment quantity-adjustment mode needs an explicit domain model and was
  not inferred from the modal specification.

## Session Notes

- User chose `context/` as the official documentation folder. Remaining inconsistencies should be resolved one by one.
- User chose not to include liability/debt accounts in the MVP.
- User approved the proposed MVP transaction taxonomy and linked-reversal approach.
- User chose to exclude receipt uploads from the MVP.
- User chose `apps/api/src/modules/` for backend domain modules.
- User chose `apps/web/components/ui/` for generated shadcn/ui components.
- User chose to remove `packages/ui/` from the initial documentation.
- User requested basic directory structure only and no app installation for now.
- User requested shadcn/ui installation in the existing `apps/web` Next.js app.
- User requested the dashboard home page from `specs/web/001-sidebar-and-dashboard-page.md`.
- User requested Clerk setup from `specs/web/002-adding-clerk.md`; environment variables will be added later by the user.
- User requested Prisma setup from `specs/api/001-adding-prisma-with-neon.md`.
