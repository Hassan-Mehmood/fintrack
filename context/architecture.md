# Architecture

## Overview

The application is a personal finance management platform that allows users to manage financial accounts, record transactions, track expenses and investments, create savings goals, and view financial analytics.

The system uses:

* **Next.js** for the web interface
* **NestJS** for the backend API and business logic
* **PostgreSQL** for persistent data
* **Prisma** for database access

The first version will use a simple modular architecture. It will not include microservices, AI processing, background workers, live market integrations, or advanced caching.

---

## Technology Stack

| Layer               | Technology                      | Role                                              |
| ------------------- | ------------------------------- | ------------------------------------------------- |
| Frontend            | Next.js                         | Builds the web interface and application pages    |
| Frontend language   | TypeScript                      | Provides type safety                              |
| UI components       | React and shadcn/ui             | Builds reusable interface components              |
| Styling             | Tailwind CSS                    | Handles responsive styling                        |
| Forms               | React Hook Form                 | Manages transaction, account, and goal forms      |
| Frontend validation | Zod                             | Validates form data before submission             |
| API state           | TanStack Query                  | Fetches and refreshes backend data                |
| Charts              | Recharts or Apache ECharts      | Displays spending and portfolio analytics         |
| Backend             | NestJS                          | Handles API requests and business logic           |
| API style           | REST                            | Provides communication between Next.js and NestJS |
| Backend validation  | NestJS DTOs and class-validator | Validates incoming API data                       |
| Database            | PostgreSQL                      | Stores financial and user data                    |
| ORM                 | Prisma                          | Manages database queries, schema, and migrations  |
| Authentication      | Clerk                           | Handles registration, login, and sessions         |
| Package manager     | pnpm                            | Manages project dependencies                      |

---

## High-Level Structure

```text
Browser
   |
   v
Next.js Web Application
   |
   | REST API
   v
NestJS Backend
   |
   v
PostgreSQL Database
```

---

## Repository Structure

```text
project-root/
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── financial-engine/
│   ├── shared-types/
│   └── database/
│
├── context/
│   ├── project-overview.md
│   ├── architecture.md
│   ├── ui-context.md
│   ├── code-standards.md
│   ├── ai-workflow-rules.md
│   └── progress-tracker.md
│
├── docker-compose.yml
├── pnpm-workspace.yaml
└── package.json
```

---

## System Boundaries

### `apps/web`

The `apps/web` folder owns the user-facing web application.

Responsibilities:

* Pages and layouts
* Navigation
* Forms
* Charts and dashboard components
* Loading and error states
* Calling the NestJS API
* Formatting currency, dates, and percentages
* Client-side form validation

It must not contain:

* Database queries
* Account ownership checks
* Authoritative balance calculations
* Financial transaction rules

Suggested structure:

```text
apps/web/
├── app/
│   ├── dashboard/
│   ├── accounts/
│   ├── transactions/
│   ├── investments/
│   ├── budgets/
│   ├── goals/
│   └── settings/
│
└── src/
    ├── components/
    ├── features/
    ├── hooks/
    └── lib/
```

---

### `apps/api`

The `apps/api` folder owns the backend API and business logic.

Responsibilities:

* Authentication verification
* Ownership and authorization checks
* Request validation
* Account management
* Transaction creation
* Balance calculations
* Expense categorization
* Budget tracking
* Investment calculations
* Goal calculations
* Dashboard analytics
* Database access

Suggested structure:

```text
apps/api/src/
├── modules/
│   ├── auth/
│   ├── users/
│   ├── accounts/
│   ├── transactions/
│   ├── categories/
│   ├── budgets/
│   ├── investments/
│   ├── goals/
│   └── analytics/
└── common/
```

Controllers should only:

1. Receive requests.
2. Validate input.
3. Call a service.
4. Return a response.

Financial and business logic should be implemented inside services.

---

### `packages/financial-engine`

This package contains reusable financial calculations.

Responsibilities:

* Calculate account balances
* Calculate net worth
* Calculate monthly income and expenses
* Calculate savings rate
* Calculate investment profit or loss
* Calculate goal contribution requirements
* Calculate basic financial-health metrics

Example functions:

```ts
calculateAccountBalance();
calculateNetWorth();
calculateSavingsRate();
calculateInvestmentPnL();
calculateGoalPlan();
```

This package must not:

* Access the database
* Call external APIs
* Import NestJS
* Read environment variables

Its functions should accept inputs and return calculated results.

---

### `packages/shared-types`

This package contains values shared between the frontend and backend.

Examples:

* Account types
* Transaction types
* Goal statuses
* Currency codes
* API response types

Example:

```ts
export enum TransactionType {
  INCOME = "INCOME",
  EXPENSE = "EXPENSE",
  TRANSFER = "TRANSFER",
  REFUND = "REFUND",
  FEE = "FEE",
  INVESTMENT_BUY = "INVESTMENT_BUY",
  INVESTMENT_SELL = "INVESTMENT_SELL",
  ADJUSTMENT = "ADJUSTMENT",
}
```

---

### `packages/database`

This package owns:

* Prisma schema
* Prisma migrations
* Prisma client configuration
* Database seed scripts

It must not contain frontend or HTTP-related logic.

---

## Backend Modules

| Module         | Responsibility                                                    |
| -------------- | ----------------------------------------------------------------- |
| `auth`         | Verifies signed-in users                                          |
| `users`        | Stores profile, base currency, and preferences                    |
| `accounts`     | Manages bank, cash wallet, digital wallet, broker, and crypto wallet accounts |
| `transactions` | Manages income, expenses, transfers, and adjustments              |
| `categories`   | Manages expense and income categories                             |
| `budgets`      | Manages monthly spending limits                                   |
| `investments`  | Manages investment purchases, sales, holdings, and profit or loss |
| `goals`        | Manages savings goals and contribution plans                      |
| `analytics`    | Produces dashboard totals and charts                              |

---

## Storage Model

### PostgreSQL

PostgreSQL is the main and authoritative data store.

Store the following in PostgreSQL:

* Users
* User preferences
* Financial accounts
* Transactions
* Transaction entries
* Categories
* Budgets
* Investment assets
* Investment trades
* Current manually entered asset prices
* Financial goals
* Goal contributions

Financial values must use PostgreSQL `NUMERIC` fields.

Example Prisma field:

```prisma
amount Decimal @db.Decimal(24, 8)
```

JavaScript floating-point numbers should not be used for authoritative financial calculations.

---

### File Storage

File storage is not required for the initial MVP.

Receipt and statement uploads are future scope. If they are added later, files should be stored in an object-storage service such as Amazon S3 or Cloudflare R2.

The database should store only file metadata, such as:

```text
filename
storage key
file type
file size
owner user ID
```

---

### Cache

A cache is not required for the initial MVP.

Dashboard totals and balances should initially be calculated directly from PostgreSQL.

Redis may be introduced later only if database queries become slow or the application requires scheduled background work.

---

## Financial Data Model

The application should treat transactions as the source of truth.

An account balance should be calculated from:

```text
Opening balance
+ Income
- Expenses
+ Refunds
- Fees
+ Incoming transfers
- Outgoing transfers
- Investment purchases
+ Investment sales
+/- Balance adjustments
```

Reversals should not be modeled as a normal transaction type. A reversal should create a linked corrective transaction that offsets the original transaction while preserving the original record for audit history.

### Expense Example

A user spends PKR 2,000 from a bank account.

```text
Bank account balance: -2,000 PKR
Food expense total: +2,000 PKR
```

### Transfer Example

A user transfers PKR 10,000 from a bank account to a cash wallet.

```text
Bank account: -10,000 PKR
Cash wallet: +10,000 PKR
```

The transfer must not count as income or an expense.

### Investment Purchase Example

A user purchases PKR 50,000 of stock.

```text
Bank account: -50,000 PKR
Investment cost basis: +50,000 PKR
```

The investment purchase must not be counted as an expense.

### Fee Example

A user pays a PKR 250 brokerage fee from a bank account.

```text
Bank account: -250 PKR
Fee expense total: +250 PKR
```

Fees reduce the selected account balance and count as expenses unless a more specific business rule says otherwise.

---

## Authentication and Access Model

### Authentication

Clerk handles:

* User registration
* Login
* Logout
* Session management
* Password recovery

The Next.js application sends the authenticated user token to the NestJS API.

```text
Authorization: Bearer <token>
```

The NestJS backend verifies the token before processing the request.

---

### User Ownership

Every user-owned record must contain a `userId` or belong to another record owned by that user.

Examples:

```text
Account.userId
Transaction.userId
Budget.userId
Goal.userId
InvestmentAccount.userId
```

Every database query must include the authenticated user.

Example:

```ts
await prisma.account.findFirstOrThrow({
  where: {
    id: accountId,
    userId: authenticatedUser.id,
  },
});
```

The backend must never trust a `userId` provided by the frontend.

A user must only be able to access:

* Their own accounts
* Their own transactions
* Their own investments
* Their own budgets
* Their own goals
* Their own analytics

---

## API Model

The NestJS backend exposes REST endpoints.

```text
/api/v1/accounts
/api/v1/transactions
/api/v1/categories
/api/v1/budgets
/api/v1/investments
/api/v1/goals
/api/v1/analytics
```

Example operations:

```text
POST   /api/v1/accounts
GET    /api/v1/accounts
GET    /api/v1/accounts/:id
PATCH  /api/v1/accounts/:id

POST   /api/v1/transactions
GET    /api/v1/transactions
GET    /api/v1/transactions/:id

POST   /api/v1/goals
GET    /api/v1/goals
PATCH  /api/v1/goals/:id
```

---

## Background Tasks

Background workers are not part of the initial MVP.

All initial functionality should run through normal API requests, including:

* Creating accounts
* Recording transactions
* Updating balances
* Creating budgets
* Adding investment trades
* Updating investment prices manually
* Creating financial goals
* Calculating dashboard analytics

A background-task system may be added later for:

* Automatic market-price updates
* Scheduled reminders
* Statement imports
* Email transaction parsing

---

## AI Model

AI is not part of the initial MVP.

Financial-health recommendations should use deterministic calculations and predefined rules.

Example:

```text
If monthly expenses are greater than monthly income:
    Show a negative cash-flow warning.
```

```text
If liquid cash is less than three months of essential expenses:
    Show an emergency-fund warning.
```

An AI model may be introduced later for transaction extraction or categorization, but it must not be required for the core application.

---

## Invariants

The following rules must never be violated.

### 1. Financial calculations must not use floating-point values

Money must be stored and calculated using PostgreSQL `NUMERIC` and Prisma `Decimal`.

The JavaScript `number` type must not be used for authoritative monetary calculations.

---

### 2. Transactions are the source of truth

Account balances must always be explainable from opening balances and recorded transactions.

A balance must not be changed without creating or updating a corresponding financial transaction.

---

### 3. Every user-owned query must enforce ownership

The backend must verify that the authenticated user owns every requested account, transaction, investment, budget, or goal.

An entity ID alone is not sufficient authorization.

---

### 4. Transfers must not count as income or expenses

Moving money between two accounts owned by the same user changes account balances but does not change:

* Total assets
* Net worth
* Income
* Expenses

---

### 5. Investment purchases must not count as expenses

Buying an investment changes cash into another asset.

Only investment-related charges, such as brokerage fees, may count as expenses.

---

### 6. Related financial writes must be atomic

Operations that update multiple records must use a PostgreSQL transaction.

For example, a transfer must not deduct money from one account unless it also adds money to the destination account.

---

### 7. Users must never access another user’s records

All financial records must be scoped to the authenticated user.

Frontend restrictions alone are not sufficient. Ownership must be enforced by the NestJS backend.

---

### 8. Historical financial records must remain traceable

Confirmed financial transactions should not be silently deleted.

Corrections should update the transaction with a recorded change or create a reversing transaction.

---

## Deployment

The application should initially have two deployments.

| Application      | Deployment                      |
| ---------------- | ------------------------------- |
| Next.js frontend | Vercel                          |
| NestJS backend   | Railway, Render, Fly.io, or AWS |

PostgreSQL can be hosted using:

* Neon
* Supabase
* Railway
* AWS RDS

The first version does not require:

* Redis
* Background-worker containers
* Microservices
* AI infrastructure
* Real-time market-data services
* Dedicated analytics databases

---

## Architecture Summary

1. Next.js owns the user interface.
2. NestJS owns business logic and database access.
3. PostgreSQL stores all authoritative application data.
4. Transactions are the source of account balances.
5. Financial calculations use decimal arithmetic.
6. Every user-owned operation is scoped to the authenticated user.
7. The initial version does not include AI, background workers, Redis, or automatic financial integrations.
