// Browser requests use the public API route, never a runtime service binding.
export const API_BASE = `${(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')}/api/v1`
