# Account balance adjustments

`POST /api/v1/accounts/:accountId/balance-adjustments` requires authentication
and ownership of the account. The Accounts page exposes this as Adjust balance.

Request fields:

- `currentBalance`: desired balance as a signed decimal string.
- `expectedBalance`: balance shown when the dialog opened, as a decimal string.
- `currency`: account currency (`USD` or `PKR`).
- `idempotencyKey`: UUID retained for retries of the same submission.

The API calculates the balance from the opening balance and cleared,
non-deleted source/destination transactions within a serializable transaction.
If the balance or currency differs from the supplied snapshot, it returns
`409 ACCOUNT_BALANCE_CHANGED`, prompting the user to reopen the dialog.
Serialization and unique-key conflicts also return this reviewable error.

A nonzero difference creates a cleared, signed `ADJUSTMENT` transaction in the
account currency, dated at submission, with category `Balance adjustment` and
a description recording the before/after balances. Categories use the existing
transaction text field; no category table or migration is needed. Opening
balance and existing transactions remain unchanged. An unchanged balance is a
no-op. Adjustments retain the existing exclusion from income/expense analytics.

Input supports up to 16 integer digits and 8 fractional digits. A difference
outside the transaction column's supported range returns
`400 BALANCE_ADJUSTMENT_TOO_LARGE`. Authoritative calculations use decimal
arithmetic with sufficient precision for the stored monetary range.

An already-recorded matching idempotency key returns the current account
without another adjustment. Reusing a key with different adjustment details
returns a conflict. The response is the usual `{ data: Account }` envelope.
The web form refreshes accounts, dashboard, transactions, and portfolios after
success and preserves submission errors in the dialog.
