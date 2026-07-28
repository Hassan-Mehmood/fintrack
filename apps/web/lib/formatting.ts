export function formatAmount(amount: string, currency: string): string {
  const [integerPart, decimalPart = ""] = amount.split(".")
  const isNegative = integerPart.startsWith("-")
  const unsignedInteger = isNegative ? integerPart.slice(1) : integerPart
  const groupedInteger = unsignedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  const trimmedDecimals = decimalPart.replace(/0+$/, "")

  return `${currency} ${isNegative ? "-" : ""}${groupedInteger}${
    trimmedDecimals ? `.${trimmedDecimals}` : ""
  }`
}

export function formatSignedAmount(amount: string, currency: string): string {
  const [integerPart, decimalPart = ""] = amount.split(".")
  const isNegative = integerPart.startsWith("-")
  const unsignedInteger = isNegative ? integerPart.slice(1) : integerPart
  const groupedInteger = unsignedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  const trimmedDecimals = decimalPart.replace(/0+$/, "")

  return `${isNegative ? "-" : "+"} ${currency} ${groupedInteger}${
    trimmedDecimals ? `.${trimmedDecimals}` : ""
  }`
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
