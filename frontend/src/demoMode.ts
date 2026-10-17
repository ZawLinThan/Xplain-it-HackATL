import { createContext, useContext } from 'react'

/** True when the backend runs with DEMO_MODE=1 (canned output). Set once by App. */
export const DemoModeContext = createContext(false)

export function useDemoMode(): boolean {
  return useContext(DemoModeContext)
}
