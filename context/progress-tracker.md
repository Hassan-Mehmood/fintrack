# Progress Tracker

Update this file after every meaningful implementation
change.

## Current Phase

- Initial repository scaffolding in progress.

## Current Goal

- shadcn/ui setup is complete in the Next.js web app.

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

## In Progress

- Ready for the next web UI implementation task.

## Next Up

- Add additional shadcn/ui components as feature screens require them.

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
