# Progress Tracker

Update this file after every meaningful implementation
change.

## Current Phase

- Initial repository scaffolding in progress.

## Current Goal

- Set up Prisma ORM with Neon PostgreSQL for the NestJS API.

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

## In Progress

- Ready to apply the generated Prisma migration to the configured Neon database.

## Next Up

- Apply migrations with `pnpm prisma migrate deploy` from `apps/api` when ready.
- Add additional shadcn/ui components as feature screens require them.
- Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` before running authenticated flows locally or in deployment.
- Send Clerk session tokens from the web app to the API as `Authorization: Bearer <token>` when connecting dynamic API data.

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
