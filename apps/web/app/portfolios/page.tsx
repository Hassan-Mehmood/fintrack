import { redirect } from "next/navigation"

export default function PortfoliosRoute() {
  redirect("/stocks?tab=portfolios")
}
