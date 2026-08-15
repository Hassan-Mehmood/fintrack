### Refined implementation prompt

Update the transaction form so that fields, calculations, and validation depend on the selected transaction type.

#### Investment buy

Show:

* Asset
* Quantity
* Price per unit
* Fees
* Total amount

Calculate:

```text
Gross amount = Quantity × Price per unit
Total cash deducted = Gross amount + Fees
```

The total amount must be read-only and recalculated whenever quantity, price, or fees change.

#### Investment sell

Show:

* Asset
* Quantity
* Price per unit
* Fees
* Net proceeds

Calculate:

```text
Gross amount = Quantity × Price per unit
Net cash received = Gross amount − Fees
```

The net proceeds must be read-only.

Prevent selling a quantity greater than the quantity currently held unless the application explicitly supports short selling.

#### Reinvestment

Show:

* Asset
* Quantity
* Price per unit
* Fees
* Reinvested amount

Calculate:

```text
Reinvested amount = Quantity × Price per unit
Total used = Reinvested amount + Fees
```

Do not ask the user to manually enter both the amount and the quantity/price combination.

#### Dividend and interest

Show a manually entered amount because these transactions are not necessarily based on asset quantity and unit price.

For dividends, optionally allow the user to select the related asset.

#### Stock split

Do not show price per unit, fees, or cash amount.

Show:

* Asset
* Split ratio, such as `2-for-1`
* Existing quantity
* Resulting quantity

Calculate the resulting quantity automatically. A stock split must not create a cash movement or change the total cost basis.

#### Bonus shares

Show:

* Asset
* Number of bonus shares received

Do not require a price per unit or cash amount. Add the shares to the holding without creating a cash transaction.

#### Asset deposit and asset withdrawal

Show:

* Asset
* Quantity

These represent movement of an asset into or out of an account. Do not require a transaction amount or price per unit unless the existing accounting system needs an optional cost-basis value.

#### Transfer, refund, fee, and adjustment

Keep the existing manual amount input behavior.

For adjustments, show either an amount adjustment or quantity adjustment depending on whether the adjustment applies to cash or an investment asset.

### General requirements

* Never allow users to manually enter a calculated total.
* Use decimal-safe calculations rather than JavaScript floating-point arithmetic.
* Quantity and price per unit must be greater than zero.
* Fees must be zero or greater.
* Support fractional quantities for cryptocurrencies and fractional shares.
* Display the currency from the selected account beside price, fees, and calculated totals.
* Recalculate values immediately when any dependent field changes.
* Apply the same calculations and validations on the backend; do not trust totals submitted by the frontend.
* The backend must calculate and store the authoritative gross amount, fees, and final cash impact.
* Hide fields that are irrelevant to the selected transaction type rather than disabling or submitting them.
* Clear values from hidden fields when the transaction type changes so stale data is not accidentally submitted.
