# Code Standards

## General

* Keep modules, components, services, and functions small and single-purpose.
* Fix root causes instead of adding temporary workarounds or duplicated logic.
* Do not mix unrelated concerns in the same component, service, controller, or route.
* Prefer clear and maintainable code over clever abstractions.
* Extract shared logic only when it is genuinely reused or represents an important domain rule.
* Keep financial calculations separate from UI, controllers, and database access.
* Use descriptive names that communicate business meaning.
* Avoid hidden side effects. Functions should clearly indicate when they modify data.
* Do not duplicate financial rules across the frontend and backend.
* Add tests when fixing bugs in financial calculations or transaction behavior.
* Never log authentication tokens, complete account numbers, or sensitive financial data.

## TypeScript

* TypeScript strict mode is required throughout the project.
* Avoid `any`. Use explicit types, generics, or `unknown` with proper narrowing.
* Validate unknown external input before trusting or using it.
* Use enums or string unions for controlled values such as account and transaction types.
* Prefer `type` for unions and utility compositions, and `interface` for extensible object contracts.
* Do not use non-null assertions unless the value is guaranteed by an immediately visible check.
* Use `readonly` for values and parameters that should not be mutated.
* Avoid unsafe type casting with `as`. Validate or narrow the value instead.
* Export types only when they are required outside the owning module.
* Use `Decimal` values or monetary strings for financial amounts. Do not use JavaScript floating-point arithmetic for authoritative calculations.
* Handle nullable and optional values explicitly.
* Functions should have explicit return types when they expose a public module API.

## Next.js

* Default to Server Components.
* Add `"use client"` only when browser interactivity, hooks, or browser APIs require it.
* Keep client components as small and close to the interactive UI as possible.
* Fetch initial page data in Server Components where practical.
* Use TanStack Query for client-side fetching, mutations, invalidation, and refetching.
* Keep pages and layouts focused on composition rather than business logic.
* Place feature-specific components and hooks inside their feature folder.
* Do not access the database directly from the Next.js application.
* All authoritative data must be fetched from or modified through the NestJS API.
* Do not perform authoritative financial calculations in React components.
* Validate forms with Zod before sending requests, while still validating everything again in the backend.
* Keep loading, empty, success, and error states explicit.
* Use the framework image, link, and navigation utilities where appropriate.
* Do not store sensitive financial information in local storage.

## NestJS

* Organize backend code by business domain rather than technical file type.
* Keep controllers thin. Controllers should validate input, call a service, and return a response.
* Put business rules and transaction orchestration inside services.
* Keep database access inside the module that owns the data.
* Use DTOs and validation pipes for all request input.
* Use guards for authentication and shared access-control rules.
* Enforce record ownership in backend queries, not only in frontend navigation.
* Use Prisma transactions for operations that modify multiple related financial records.
* Do not directly update account balances without creating the corresponding transaction records.
* Do not place financial calculations inside Prisma queries, controllers, or response serializers when they belong in the financial engine.
* Throw specific application errors instead of generic errors.
* Avoid circular module dependencies.
* Do not expose Prisma database models directly as public API response contracts.
* Keep external integrations behind adapter interfaces so providers can be replaced later.

## Styling

* Use Tailwind CSS utilities for styling.
* Use shared design tokens for colors, spacing, typography, shadows, and border radii.
* Do not use hardcoded hex values when an existing theme token is available.
* Use shadcn/ui components as the base for common interface elements.
* Extend shared components instead of creating visually inconsistent replacements.
* Keep responsive behavior explicit for mobile, tablet, and desktop layouts.
* Avoid large repeated Tailwind class strings. Extract reusable components or use a variant utility.
* Use `cn` or an equivalent utility for conditional class composition.
* Maintain sufficient color contrast and visible keyboard focus states.
* Do not use color as the only indicator for profit, loss, warnings, or validation errors.
* Format positive and negative financial values consistently across the application.

## API Routes

* Validate and parse request input before business logic runs.
* Require authentication for every route that accesses user financial data.
* Enforce ownership before reading, updating, or deleting any user-owned record.
* Never trust a `userId` supplied by the client.
* Return consistent and predictable response shapes.
* Use stable machine-readable error codes for expected business errors.
* Use appropriate HTTP status codes.
* Keep controllers and route handlers focused on a single responsibility.
* Support pagination for endpoints that return growing collections such as transactions.
* Use query parameters for filtering, sorting, searching, and date ranges.
* Do not expose stack traces, database errors, or internal implementation details.
* Use database transactions for multi-step financial mutations.
* Ensure create operations that may be retried cannot accidentally create duplicate financial records.
* Version public endpoints under `/api/v1`.

Example successful response:

```json
{
  "data": {},
  "meta": {}
}
```

Example error response:

```json
{
  "error": {
    "code": "ACCOUNT_NOT_FOUND",
    "message": "The requested account was not found.",
    "details": {}
  }
}
```

## Data and Storage

* PostgreSQL is the authoritative source for users, accounts, transactions, investments, budgets, goals, and analytics data.
* Store monetary amounts using PostgreSQL `NUMERIC` and Prisma `Decimal`.
* Never use floating-point database fields for financial values.
* Transactions are the source of truth for account balances.
* Related financial writes must succeed or fail together inside a database transaction.
* Every user-owned record must include a `userId` or belong to a parent record with verified ownership.
* Use foreign keys and database constraints to protect data integrity.
* Use migrations for every database schema change.
* Do not manually modify the production database schema.
* Seed data must be deterministic and safe to run in development.
* Do not permanently delete confirmed financial history without a traceable correction or reversal.
* Model reversals as linked corrective transactions, not as silent deletes or untracked balance changes.
* Metadata belongs in PostgreSQL.
* Large uploaded files belong in object storage if file uploads are added.
* Do not store large files directly in the database.
* Do not store derived values when they can be calculated cheaply unless performance measurements justify caching them.
* A cached or derived balance must never replace the transaction history as the source of truth.

## Financial Code

* Buying an investment must not be treated as an expense.
* Transfers between a user's own accounts must not count as income or expenses.
* A transfer must update both the source and destination accounts atomically.
* Preserve the original amount and currency for every financial transaction.
* Use deterministic functions for balances, net worth, savings rate, goal plans, and investment profit or loss.
* Keep financial calculations inside `packages/financial-engine`.
* Financial-engine functions must not access the database, network, framework context, or environment variables.
* Add unit tests for every financial formula and important edge case.
* Avoid silently correcting invalid financial data. Return a clear validation or business error.
* Historical calculations must use the values recorded at the time of the transaction.
* Reversing a transaction must preserve the original transaction and record the link between the original and corrective transaction.

## Testing

* Unit-test financial calculations, validation rules, and domain services.
* Integration-test database operations involving transactions, transfers, and ownership.
* End-to-end test the main account, transaction, investment, budget, and goal workflows.
* Every bug fix involving financial data should include a regression test.
* Tests must not depend on execution order.
* Use factories or builders instead of duplicating large test objects.
* Mock external systems, but do not mock the function being tested.
* Test both successful behavior and expected failure cases.
* Critical tests must include unauthorized access and cross-user access attempts.

## File Organization

* `apps/web/` — Next.js pages, layouts, frontend features, components, hooks, and API client usage.
* `apps/web/src/features/` — Feature-specific UI components, forms, hooks, and frontend schemas.
* `apps/web/src/components/` — Reusable application-wide presentation components.
* `apps/web/src/components/ui/` — Generated shadcn/ui components.
* `apps/web/src/lib/` — Frontend utilities, formatting functions, and client configuration.
* `apps/api/` — NestJS application, controllers, services, guards, DTOs, and business modules.
* `apps/api/src/modules/` — Domain modules such as accounts, transactions, investments, budgets, goals, and analytics.
* `apps/api/src/common/` — Shared backend guards, interceptors, exceptions, decorators, and utilities.
* `packages/financial-engine/` — Pure financial calculations and financial-health rules.
* `packages/shared-types/` — Stable enums, value types, and shared API contracts.
* `packages/database/` — Prisma schema, migrations, seed scripts, and Prisma client configuration.
* `context/` — Project overview, architecture, UI context, code standards, AI workflow rules, and progress tracking.

## Naming Conventions

* Use `kebab-case` for folders and filenames unless framework conventions require otherwise.
* Use `PascalCase` for React components, classes, DTOs, and exported types.
* Use `camelCase` for functions, variables, object properties, and hooks.
* Prefix React hooks with `use`.
* Use plural nouns for collection endpoints and database models where appropriate.
* Name services by domain responsibility, such as `TransactionService` or `GoalPlanningService`.
* Name boolean variables using prefixes such as `is`, `has`, `can`, or `should`.
* Avoid vague names such as `data`, `item`, `handler`, or `helper` when a more specific name is available.
