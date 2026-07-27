# Progress Tracker

Update this file after every meaningful implementation
change.

## Current Phase

- Market-data integration implemented; ready for migration deployment and authenticated provider verification.

## Current Goal

- Configure provider credentials, deploy the market-data migration, and run authenticated live-provider verification.

## Completed

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

- Ready for end-to-end manual verification of the dashboard, `/accounts`, `/transactions`, `/investments`, and `/portfolios` flows once Clerk environment variables are configured.

## In Progress

- No implementation work currently in progress.

## Next Up

- Configure `FINNHUB_API_KEY`, `COINGECKO_API_KEY`, and `REDIS_URL` before live-provider verification.
- Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` before running authenticated flows locally or in deployment.
- Run end-to-end manual verification of the `/assets`, `/transactions`, `/investments`, and `/portfolios` flows once Clerk environment variables are configured.

## Open Questions

- None currently identified from the documentation alignment pass.

## Architecture Decisions

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
- Finnhub provides on-demand US-stock data and CoinGecko Demo provides cryptocurrency data through a provider-independent NestJS market-data module.
- Redis caches normalized quotes for 60 seconds, retains stale fallbacks for 24 hours, and coordinates provider request budgets.
- Existing accounts are the wallet boundary for investment transactions; deposits and withdrawals move asset quantity without changing cash balances.
- Provider-backed asset identifiers and pricing modes are immutable, while manual assets retain manually editable prices.

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
