export function formatAmount(amount: string, currency: string): string {
  const formatted = formatCurrencyDecimal(amount)

  return `${currency} ${formatted.isNegative ? "-" : ""}${formatted.value}`
}

export function formatSignedAmount(amount: string, currency: string): string {
  const formatted = formatCurrencyDecimal(amount)

  return `${formatted.isNegative ? "-" : "+"} ${currency} ${formatted.value}`
}

function formatCurrencyDecimal(amount: string): {
  readonly isNegative: boolean
  readonly value: string
} {
  const normalizedAmount = amount.trim()
  const match = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(normalizedAmount)

  if (!match) {
    throw new Error(`Cannot format invalid monetary amount: ${amount}`)
  }

  const [, sign, rawInteger, rawFraction = ""] = match
  const fraction = rawFraction.padEnd(3, "0")
  let cents =
    BigInt(rawInteger) * BigInt(100) + BigInt(fraction.slice(0, 2))

  if (fraction[2] >= "5") {
    cents += BigInt(1)
  }

  const integerPart = (cents / BigInt(100))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  const decimalPart = (cents % BigInt(100)).toString().padStart(2, "0")

  return {
    isNegative: sign === "-" && cents !== BigInt(0),
    value: `${integerPart}.${decimalPart}`,
  }
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}
