"use client"

import { UserButton, useUser } from "@clerk/nextjs"

import { Skeleton } from "@/components/ui/skeleton"

export function SidebarUserProfile() {
  const { isLoaded, user } = useUser()

  if (!isLoaded) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent p-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0">
        <Skeleton className="size-8 rounded-md" />
        <div className="flex min-w-0 flex-1 flex-col gap-1 group-data-[collapsible=icon]:hidden">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
    )
  }

  const displayName =
    user?.fullName ??
    user?.username ??
    user?.primaryEmailAddress?.emailAddress ??
    "Signed in"
  const emailAddress = user?.primaryEmailAddress?.emailAddress ?? "No email set"
  const initials = [
    user?.firstName?.at(0),
    user?.lastName?.at(0),
    user?.username?.at(0),
    user?.primaryEmailAddress?.emailAddress.at(0),
  ]
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return (
    <div className="relative flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent p-2 transition-colors hover:bg-sidebar-accent/80 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0">
      <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
        {user?.hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.imageUrl}
            alt=""
            className="size-full object-cover"
            aria-hidden="true"
          />
        ) : (
          <span aria-hidden="true">{initials || "U"}</span>
        )}
      </div>
      <div className="min-w-0 flex-1 pr-1 group-data-[collapsible=icon]:hidden">
        <p className="truncate text-sm font-medium">{displayName}</p>
        <p className="truncate text-xs text-muted-foreground">{emailAddress}</p>
      </div>
      <div className="absolute inset-0">
        <UserButton
          appearance={{
            elements: {
              userButtonAvatarBox: "size-8 rounded-md opacity-0",
              userButtonBox: "size-full",
              userButtonTrigger:
                "absolute inset-0 z-10 size-full rounded-lg opacity-0 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            },
          }}
        />
      </div>
    </div>
  )
}
