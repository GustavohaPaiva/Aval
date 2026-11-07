import { createContext, useContext } from 'react'

const DashboardShellContext = createContext({
  isDashboard: false,
  filtersOpen: false,
  openFilters: () => {},
  closeFilters: () => {},
})

export function DashboardShellProvider({ value, children }) {
  return <DashboardShellContext.Provider value={value}>{children}</DashboardShellContext.Provider>
}

export function useDashboardShell() {
  return useContext(DashboardShellContext)
}
