import { redirect } from "next/navigation"

export default function PortfoliosRoute() {
  redirect("/investments?tab=portfolios")
}
