On the transaction page chagne the name of the description column to category. And we should also change the name of the database column as well to categroy.
Then create a new field called description which should be like a text field


# Transactions page specification

## 1. Document status

- Status: Draft
- Priority: Core product feature
- Target release: MVP
- Owner: Product and engineering

## 2. Purpose

The Transactions page gives users one place to review and manage transactions across all of their wallets and accounts. A user should be able to understand what happened, where it happened, how it was classified, and how it affected their finances without opening each account separately.

The page must support income, expenses, transfers, fees, refunds, and investment-related cash movements. Internal transfers must remain visible, but they must not count as income or expense in summaries.

## 3. Goals

- Show transactions from every wallet and account in one table.
- Help users find a transaction quickly through search, filters, and sorting.
- Let users add, view, edit, and delete a transaction.
- Show useful totals for the current filtered result set.
- Keep transaction classification consistent across accounts.
- Handle linked transfers without double-counting money.
- Work well on desktop and remain usable on mobile.

## 4. Non-goals for the MVP

- Bank syncing and automatic transaction imports.
- Receipt scanning or OCR.
- Automatic categorization using AI.
- Full investment performance analysis, tax-lot tracking, or realized gain calculations.
- Advanced accounting features such as double-entry journals and reconciliation statements.

These features may be added later without changing the core page structure.

## 5. Primary user stories

1. As a user, I want to see transactions from all accounts in one place.
2. As a user, I want to filter transactions by account and date.
3. As a user, I want to filter by transaction type, category, label, and status.
4. As a user, I want to search by description, merchant, note, or reference.
5. As a user, I want to edit an incorrect transaction.
6. As a user, I want to delete a transaction after confirming the action.
7. As a user, I want transfers between my accounts to remain visible without being counted as income or spending.
8. As a user, I want to see totals that match the filters currently applied.

## 6. Page structure

The page should contain the following sections in this order:

1. Page header
2. Summary cards
3. Search and filters
4. Active filter chips
5. Transactions table
6. Pagination controls

### 6.1 Page header

The header must include:

- Page title: `Transactions`
- Short description: `View and manage activity across all accounts.`
- Primary action: `Add transaction`


### 6.2 Summary cards

Show these values for the current filtered result set:

- Money in
- Money out
- Net cash flow
- Number of transactions

Calculation rules:

- Money in includes income, refunds received, interest, dividends, and other incoming cash movements.
- Money out includes expenses, fees, and other outgoing cash movements.
- Net cash flow equals money in minus money out.
- Transfers between accounts owned by the same user are excluded from money in, money out, and net cash flow.
- Investment purchases and sales should be shown as investment cash movements and excluded from spending and income totals by default.
- A future setting may allow users to include investment cash movements in net cash flow.
- Summary values must refresh whenever a filter changes.
- If accounts use different currencies, totals must be converted to the user's base currency. The interface must display the base currency next to the total.

## 7. Transaction table

### 7.1 Required columns

| Column | Purpose | Required behavior |
| --- | --- | --- |
| Select | Supports bulk actions | Checkbox on each row and one select-all checkbox in the header. Select all applies only to visible rows unless the user explicitly chooses all matching results. |
| Date | Shows when the transaction occurred | Display local date. Optionally show time in the transaction details. Sortable. |
| Description | Identifies the transaction | Show merchant, payee, source, or user-entered title. Show a note or reference as secondary text when available. |
| Account | Shows the affected wallet or account | Display account name and optional account icon. For transfers, show both source and destination accounts. |
| Category | Shows the financial category | Examples include Food, Transport, Salary, Utilities, Shopping, Health, and Investment. Uncategorized items must display `Uncategorized`. |
| Type | Shows how the transaction is classified | Use a readable badge such as Income, Expense, Transfer, Refund, Fee, or Investment. |
| Labels | Shows user-defined tags | Display up to two labels, followed by `+N` when more exist. Hovering or opening the row should reveal all labels. |
| Amount | Shows the monetary effect | Use `+` for incoming money and `-` for outgoing money. Transfers should use a neutral style. Sortable. |
| Status | Shows processing state | Supported values: Pending, Cleared, Failed, and Voided. |
| Actions | Provides row-level controls | Include View, Edit, Duplicate, and Delete in an overflow menu. Edit and Delete may also appear as visible icon buttons on large screens. |

### 7.2 Default table behavior

- Default sort: transaction date descending, then creation time descending.
- Default page size: 25 rows.
- Page-size options: 25, 50, and 100.
- Keep the table header visible while scrolling on desktop.
- Use server-side filtering, sorting, and pagination when the dataset can exceed 500 records.
- Clicking a row opens a transaction detail drawer or modal.
- Clicking an action button must not also trigger the row click.
- Currency values must use the account currency and locale-aware formatting.
- When the transaction currency differs from the user's base currency, show the original amount in the row and the converted amount in the details.

### 7.3 Amount styling

- Incoming amounts: positive sign and success color.
- Outgoing amounts: negative sign and default or warning color.
- Transfers: neutral color with a transfer icon.
- Failed or voided transactions: muted styling and no effect on summaries or balances.
- Color must not be the only way the direction or status is communicated.

## 8. Search and filters

### 8.1 Search

Provide one search field above the table.

- Placeholder: `Search transactions`
- Searchable fields: description, merchant, payee, note, reference, category name, account name, and label.
- Apply a 300 to 500 millisecond debounce before sending a request.
- Search should be case-insensitive.
- Clear the search using an `X` button.

### 8.2 Date filter

Provide these presets:

- This week
- This month
- Last month
- This year
- Last 7 days
- Last 30 days
- Custom range
- All time

Requirements:

- Default selection: `This month`.
- Week boundaries must follow the user's locale or saved preference.
- Custom range must include both the start and end date.
- The selected range must be visible without reopening the filter.

### 8.3 Account filter

- Allow one or multiple accounts to be selected.
- Include an `All accounts` option.
- Group accounts by account type when useful, such as Cash, Bank, Investment, and Digital Wallet.
- Show archived accounts if they have transactions in the chosen date range, but mark them as archived.

### 8.4 Additional filters

The page must support:

- Transaction type
- Category
- Label
- Status
- Direction: Money in or Money out
- Amount range
- Currency, if the user has accounts in more than one currency
- Has note
- Uncategorized only

### 8.5 Filter behavior

- Multiple values within the same filter use OR logic. Example: Food or Transport.
- Different filters use AND logic. Example: Food category and Cash Wallet and This Month.
- Show each active filter as a removable chip.
- Include `Clear all` when one or more filters are active.
- Changing filters resets pagination to the first page.
- Store filter values in the URL query string so the view survives a refresh and can be bookmarked.


## 9. Sorting

Users must be able to sort by:

- Date
- Amount
- Description
- Account
- Category
- Date created

Only one active sort is required for the MVP. The table must show the active column and direction.

## 10. Transaction details

Opening a transaction should show:

- Description
- Amount and currency
- Transaction type
- Direction
- Date and time
- Account
- Destination account for a transfer
- Category
- Labels
- Status
- Merchant or payee
- Note
- External or import reference, if present
- Exchange rate and base-currency amount, if applicable
- Date created
- Date last updated

The detail view must include Edit and Delete actions.

## 11. Add and edit transaction

### 11.1 Required fields

- Transaction type
- Amount greater than zero
- Date
- Account
- Description

### 11.2 Conditional fields

- Destination account is required for transfers.
- Category is available for income and expense transactions.
- Asset or investment account may be required for investment transactions.
- Exchange rate is required when a transaction moves money between accounts with different currencies and the system cannot provide a rate.

### 11.3 Optional fields

- Time
- Category when not required
- Labels
- Merchant or payee
- Note
- Reference
- Status

### 11.4 Validation rules

- The source and destination account cannot be the same.
- Amount must be a valid positive decimal with no more precision than the currency supports.
- Date cannot be invalid. Future dates are allowed only if scheduled transactions are supported.
- A category must belong to the current user or be a system category.
- A label must belong to the current user.
- Save operations must prevent accidental duplicate submissions.
- Editing a cleared transaction that changes an account or amount must update affected balances.

## 12. Transfer behavior

A transfer between two accounts owned by the user represents one logical transfer with two linked account entries.

- The source account receives an outgoing entry.
- The destination account receives an incoming entry.
- The table may show one combined row when `All accounts` is selected.
- When filtering to only one of the accounts, show the entry that affects that account.
- Editing the amount, date, status, source account, or destination account must update both linked entries in one operation.
- Deleting a transfer must delete or void both linked entries after confirmation.
- A failed update must leave both entries unchanged.
- Internal transfers do not count as income or expense.
- Transfer fees must be stored as a separate fee transaction when they affect the user's balance.

## 13. Delete behavior

- Delete must require confirmation.
- The confirmation must show the transaction description, amount, date, and account.
- The dialog must explain when a linked transfer will also be removed.
- Use soft deletion when transaction history or auditability matters.
- Deleted transactions must stop affecting balances and summaries.
- After deletion, show a success message with an Undo action when technically possible.
- If deletion fails, keep the row visible and show a clear error message.

## 14. Bulk actions

When one or more rows are selected, show a bulk-action bar with:

- Add or remove labels
- Change category
- Mark as cleared
- Delete

Bulk edit restrictions:

- Disable Change category when the selection contains transaction types that cannot be categorized.
- Bulk delete must show the number of selected transactions and warn about linked transfers.
- Apply a bulk operation as one request when possible and return per-item errors if some records fail.

## 16. States and feedback

### 16.1 Loading state

- Show table skeleton rows during the first load.
- When changing a filter or page, keep the existing table visible with a loading indicator when possible.

### 16.2 Empty states

No transactions exist:

- Message: `No transactions yet.`
- Supporting text: `Add your first transaction to start tracking your finances.`
- Action: `Add transaction`

No results match the current filters:

- Message: `No transactions match these filters.`
- Action: `Clear filters`

### 16.3 Error state

- Show a short error message and a Retry action.
- Do not replace the whole page when only one row action fails.
- Preserve unsaved form values after a recoverable error.

### 16.4 Success feedback

Show a brief message after adding, editing, deleting, or completing a bulk action.

## 17. Responsive behavior

### Desktop

- Show the full table.
- Keep Edit and Delete visible if space permits. Otherwise, place them in the overflow menu.
- Show filters in a horizontal toolbar or side panel.

### Tablet

- Keep the most useful columns visible: Date, Description, Account, Amount, and Actions.
- Move remaining fields into row details.

### Mobile

- Replace the wide table with transaction cards or compact rows.
- Each item must show date, description, account, type, and amount.
- Filters open in a full-screen sheet or bottom sheet.
- Row actions remain available through an overflow menu.
- Bulk actions are optional for the MVP on mobile.

## 18. Accessibility

- All actions must be usable with a keyboard.
- Every icon button must have an accessible label.
- Focus must move into dialogs and return to the triggering control after closing.
- Use text or icons in addition to color for amount direction and status.
- Meet WCAG AA contrast requirements.
- Announce successful actions and validation errors to screen readers.
- Table headers must identify their columns and sorting state.

## 19. Data requirements

Each transaction should support the following fields. Exact database names may differ.

| Field | Required | Notes |
| --- | --- | --- |
| id | Yes | Unique transaction identifier |
| user_id | Yes | Owner of the transaction |
| account_id | Yes | Account affected by the transaction |
| linked_transaction_id | No | Links the other side of a transfer |
| transaction_group_id | No | Groups related entries under one logical transaction |
| type | Yes | income, expense, transfer, refund, fee, investment, or adjustment |
| direction | Yes | in, out, or neutral |
| status | Yes | pending, cleared, failed, or voided |
| amount | Yes | Positive decimal stored in the original currency |
| currency | Yes | ISO 4217 currency code |
| base_amount | Conditional | Amount converted to the user's base currency |
| base_currency | Conditional | User's reporting currency |
| exchange_rate | Conditional | Rate used for conversion |
| occurred_at | Yes | Date and optional time of the transaction |
| description | Yes | Main display text |
| merchant_or_payee | No | Merchant, sender, or recipient |
| category_id | No | Financial category |
| labels | No | Zero or more user-defined labels |
| note | No | User-entered details |
| reference | No | Bank, broker, import, or user reference |
| source | Yes | manual, import, bank_sync, broker_sync, or system |
| created_at | Yes | Creation timestamp |
| updated_at | Yes | Last update timestamp |
| deleted_at | No | Soft-deletion timestamp |

### 19.1 Data integrity rules

- Store money using decimal or integer minor units. Do not use floating-point values.
- Every query must enforce user or organization ownership.
- Failed, voided, and deleted transactions must not affect balances.
- Updates that affect account balances must run inside a database transaction.
- Both sides of a transfer must be created, updated, or removed atomically.
- The backend must calculate summary values. The client must not calculate totals from the current page of rows.

## 20. Suggested API behavior

The implementation may use REST, GraphQL, or server actions. It must support the following operations:

- List transactions with search, filters, sorting, and pagination.
- Return summary totals for the same query.
- Get one transaction with linked information.
- Create a transaction.
- Update a transaction.
- Delete or void a transaction.
- Apply supported bulk actions.

A list response should include:

- Transaction rows
- Pagination metadata
- Total matching row count
- Active summary totals
- Base currency

The backend must validate all filter values and must not trust account, category, or label identifiers supplied by the client without checking ownership.

## 21. Performance requirements

- Initial table results should load within 2 seconds under normal conditions.
- Filter and sort changes should return within 1 second for typical datasets.
- The page must remain usable with at least 100,000 transactions per user.
- Add database indexes for common access patterns, including owner plus date, account plus date, type, status, category, and linked transfer identifiers.
- Search should use indexed search when basic case-insensitive matching becomes slow.

## 22. Security and audit requirements

- A user may only view or change transactions belonging to their user or organization scope.
- Validate authorization on every read and write request.
- Record who created, edited, or deleted a transaction when accounts may be shared.
- Do not expose full bank account numbers or sensitive import data in the table.
- Keep an audit record for financial changes when shared accounts or compliance requirements apply.

## 23. Analytics events

Track the following product events without storing sensitive transaction details in analytics:

- transactions_page_viewed
- transaction_created
- transaction_edited
- transaction_deleted
- transaction_filter_applied
- transaction_search_used
- transaction_bulk_action_completed

Useful event properties include transaction type, source, selected filter names, result count bucket, and whether the operation succeeded. Do not send descriptions, notes, references, or exact amounts to third-party analytics.

## 24. MVP acceptance criteria

The Transactions page is ready for the MVP when all of the following are true:

1. The page lists transactions across all active and archived accounts the user can access.
2. Users can search transactions and filter by date, account, type, category, label, status, direction, and amount range.
3. Users can sort by date and amount.
4. Users can add, view, edit, and delete a transaction.
5. The table shows date, description, account, category, type, labels, amount, status, and actions.
6. Summary cards use the full filtered result set rather than the current page.
7. Internal transfers remain visible but do not count as income, expense, or net cash flow.
8. Editing or deleting a transfer updates both linked entries atomically.
9. Failed, voided, and deleted transactions do not affect balances or summaries.
10. Pagination, loading, empty, success, and error states work as specified.
11. Filters are stored in the URL and survive a page refresh.
12. The page is keyboard accessible and usable on desktop and mobile.
13. The backend checks ownership for every account, category, label, and transaction involved in a request.

## 25. Later improvements

- Saved filter views
- Customizable and reorderable columns
- Recurring and scheduled transactions
- Bank and broker syncing
- Import review and reconciliation workflow
- Duplicate transaction detection
- Receipt attachments
- Split transactions across multiple categories
- Automatic categorization rules
- AI-assisted categorization
- Personal budgets linked to transaction categories
- Investment trade details and realized gain reporting
- OFX, QIF, and spreadsheet import
- Multi-user comments and approval workflows

## 26. Open product decisions

Resolve these decisions before implementation if they are not already defined elsewhere in the product:

1. What is the user's base currency, and can it change later?
2. Are investment purchases and sales included in the default net cash flow calculation?
3. Should pending transactions affect the displayed account balance?
4. Does deleting a transaction permanently remove it, soft-delete it, or create a reversing entry?
5. Are future-dated or recurring transactions part of the MVP?
6. Can users share an account with other people or organizations?
7. Should the table show one combined transfer row or two account entries when all accounts are selected?
8. Which date determines the reporting period: transaction date, settlement date, or posted date?
