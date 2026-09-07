"use client"

import Link from "next/link"
import {
  BarChart3Icon,
  GaugeIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  PiggyBankIcon,
  PlusIcon,
  ReceiptTextIcon,
  SearchIcon,
  SettingsIcon,
  TargetIcon,
} from "lucide-react"

import { SidebarUserProfile } from "@/components/sidebar-user-profile"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar"

type AppSection = "dashboard" | "accounts" | "assets" | "transactions" | "investments" | "portfolios" | "settings"

const navigationItems = [
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboardIcon,
    section: "dashboard" as const,
  },
  {
    label: "Accounts",
    href: "/accounts",
    icon: LandmarkIcon,
    section: "accounts" as const,
  },
  {
    label: "Transactions",
    href: "/transactions",
    icon: ReceiptTextIcon,
    section: "transactions" as const,
  },
  { label: "Budgets", icon: GaugeIcon },
  {
    label: "Investments",
    href: "/investments",
    icon: BarChart3Icon,
    section: "investments" as const,
  },
  { label: "Goals", icon: TargetIcon },
  {
    label: "Settings",
    href: "/settings",
    icon: SettingsIcon,
    section: "settings" as const,
  },
] as const

interface AppShellProps {
  readonly children: React.ReactNode
  readonly currentSection: AppSection
  readonly description: string
  readonly primaryAction?: React.ReactNode
  readonly title: string
}

export function AppShell({
  children,
  currentSection,
  description,
  primaryAction,
  title,
}: AppShellProps) {
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex h-10 items-center gap-2 px-2">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <PiggyBankIcon aria-hidden="true" />
            </div>
            <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-semibold">FinTrack</span>
              <span className="truncate text-xs text-muted-foreground">
                Personal finance
              </span>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navigationItems.map((item) => (
                  <SidebarMenuItem key={item.label}>
                    {"href" in item ? (
                      <SidebarMenuButton
                        asChild
                        tooltip={item.label}
                        isActive={item.section === currentSection}
                        aria-current={
                          item.section === currentSection ? "page" : undefined
                        }
                      >
                        <Link href={item.href}>
                          <item.icon aria-hidden="true" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton
                        disabled
                        tooltip={`${item.label} (coming soon)`}
                      >
                        <item.icon aria-hidden="true" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          <SidebarGroup>
            <SidebarGroupLabel>Quick actions</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Add transaction">
                    <PlusIcon aria-hidden="true" />
                    <span>Add transaction</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Search records">
                    <SearchIcon aria-hidden="true" />
                    <span>Search records</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarUserProfile />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 flex min-h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:px-6">
          <SidebarTrigger />
          <Separator orientation="vertical" className="hidden md:block" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">{title}</h1>
            <p className="truncate text-sm text-muted-foreground">{description}</p>
          </div>
          {primaryAction}
        </header>

        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
