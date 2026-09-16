# Wallet CSV imports

`POST /api/v1/transaction-imports/preview` parses the supported semicolon-delimited wallet export in memory and returns source-wallet mapping suggestions, normalized transactions, duplicate flags, and unresolved transfer rows. `POST /api/v1/transaction-imports` reparses the same CSV and atomically saves selected transactions, source-account aliases, an import batch, and explicitly requested balance adjustments.

Imported rows use stable source fingerprints. Re-uploading unchanged exported rows skips only records previously created through this importer; manually entered records are never heuristically deduplicated. Transfers require exactly one opposite income/expense source row with matching timestamp, currency, amount, and reference amount. Other transfer rows require explicit review.

Mappings are owned by the authenticated user and use account IDs, so a FinTrack account can be renamed without breaking the alias. Active matching-currency non-crypto accounts are required. Ordinary rows can only use Money accounts; broker accounts are permitted for compatible transfer rows.

Reconciliation is optional. The API compares the previewed account balance with its expected value at commit time and rejects stale previews. An enabled difference becomes a normal cleared `ADJUSTMENT` transaction categorized as `Balance adjustment`.
