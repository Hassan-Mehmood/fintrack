import * as React from "react"

const MOBILE_BREAKPOINT = 768

const getMobileSnapshot = () => window.innerWidth < MOBILE_BREAKPOINT
const getServerSnapshot = () => false

const subscribeToMobileChanges = (onStoreChange: () => void) => {
  const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)

  mediaQuery.addEventListener("change", onStoreChange)

  return () => mediaQuery.removeEventListener("change", onStoreChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribeToMobileChanges,
    getMobileSnapshot,
    getServerSnapshot
  )
}
