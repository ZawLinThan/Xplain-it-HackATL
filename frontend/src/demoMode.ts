import { createContext, useContext } from 'react'
import type { AppConfig } from './api/types'

/** True when the backend runs with DEMO_MODE=1 (canned output). Set once by App. */
export const DemoModeContext = createContext(false)

export function useDemoMode(): boolean {
  return useContext(DemoModeContext)
}

/** The backend's /config: demo mode plus the developer toggles. Defaults are the quiet ones. */
export const DEFAULT_CONFIG: AppConfig = { demo_mode: false, gaze_tracking: true, debug_borders: false }
export const AppConfigContext = createContext<AppConfig>(DEFAULT_CONFIG)

export function useAppConfig(): AppConfig {
  return useContext(AppConfigContext)
}
