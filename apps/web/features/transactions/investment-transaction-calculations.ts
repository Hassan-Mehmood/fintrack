import Decimal from "decimal.js"

import type { TransactionType } from "./transaction-types"

Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
})

export interface InvestmentCalculationResult {
  readonly grossAmount: string
  readonly cashImpact: string
}

export function calculateInvestmentTransactionAmounts({
  accountCurrency,
  exchangeRate,
  fees,
  price,
  priceCurrency,
  quantity,
  type,
}: {
  readonly fees: string
  readonly accountCurrency?: string
  readonly exchangeRate?: string | null
  readonly price: string
  readonly priceCurrency?: string
  readonly quantity: string
  readonly type: TransactionType
}): InvestmentCalculationResult | null {
  if (
    !isNonNegativeDecimal(fees) ||
    !isPositiveDecimal(price) ||
    !isPositiveDecimal(quantity)
  ) {
    return null
  }

  const grossAmount = new Decimal(quantity)
    .times(price)
    .toDecimalPlaces(8)
  const feeAmount = new Decimal(fees)
  const convertedGrossAmount = convertUsdPkr(
    grossAmount,
    priceCurrency ?? accountCurrency ?? "USD",
    accountCurrency ?? priceCurrency ?? "USD",
    exchangeRate
  )

  if (!convertedGrossAmount) {
    return null
  }
  const cashImpact =
    type === "INVESTMENT_SELL"
      ? convertedGrossAmount.minus(feeAmount)
      : convertedGrossAmount.plus(feeAmount)

  return {
    grossAmount: grossAmount.toString(),
    cashImpact: cashImpact.toString(),
  }
}

function convertUsdPkr(
  amount: Decimal,
  fromCurrency: string,
  toCurrency: string,
  exchangeRate: string | null | undefined
): Decimal | null {
  if (fromCurrency === toCurrency) {
    return amount
  }

  if (!exchangeRate || !isPositiveDecimal(exchangeRate)) {
    return null
  }

  if (fromCurrency === "USD" && toCurrency === "PKR") {
    return amount.times(exchangeRate).toDecimalPlaces(8)
  }

  if (fromCurrency === "PKR" && toCurrency === "USD") {
    return amount.dividedBy(exchangeRate).toDecimalPlaces(8)
  }

  return null
}

export function multiplyQuantities(
  quantity: string,
  multiplier: string
): string | null {
  if (!isNonNegativeDecimal(quantity) || !isPositiveDecimal(multiplier)) {
    return null
  }

  return new Decimal(quantity).times(multiplier).toDecimalPlaces(8).toString()
}

export function addQuantities(left: string, right: string): string | null {
  if (!isNonNegativeDecimal(left) || !isNonNegativeDecimal(right)) {
    return null
  }

  return new Decimal(left).plus(right).toDecimalPlaces(8).toString()
}

export function subtractQuantities(
  left: string,
  right: string
): string | null {
  if (!isNonNegativeDecimal(left) || !isNonNegativeDecimal(right)) {
    return null
  }

  return new Decimal(left).minus(right).toDecimalPlaces(8).toString()
}

export function divideQuantities(
  quantity: string,
  divisor: string
): string | null {
  if (!isNonNegativeDecimal(quantity) || !isPositiveDecimal(divisor)) {
    return null
  }

  return new Decimal(quantity).dividedBy(divisor).toDecimalPlaces(8).toString()
}

export function compareDecimals(left: string, right: string): number | null {
  if (!isNonNegativeDecimal(left) || !isNonNegativeDecimal(right)) {
    return null
  }

  return new Decimal(left).comparedTo(right)
}

export function isPositiveDecimal(value: string | undefined): boolean {
  return isNonNegativeDecimal(value) && new Decimal(value).greaterThan(0)
}

export function isNonNegativeDecimal(
  value: string | undefined
): value is string {
  if (!value || !/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(value)) {
    return false
  }

  return new Decimal(value).greaterThanOrEqualTo(0)
}
