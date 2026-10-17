import type { components } from '../api/schema'

/** From the backend contract. Never hand-write this shape. */
export type LookawayPayload = Required<components['schemas']['LookawayIn']>
export type LookawayEvent = components['schemas']['LookawayEvent']
export type Side = LookawayEvent['side']

/** Where the student is looking, in screen space: 0 to 1, x to the student's right, y downwards. */
export interface GazeSample {
  gx: number
  gy: number
}
