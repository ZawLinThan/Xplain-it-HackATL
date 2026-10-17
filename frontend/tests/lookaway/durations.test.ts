import { expect, it } from 'vitest'
import { DurationLog } from '../../src/lookaway/durations'

it('records both plain edge and corner durations without a dedicated corner category', () => {
  const log = new DurationLog(1000)
  for (let time = 1000; time <= 2000; time += 100) log.push({ gx: 0.02, gy: 0.5 }, time)
  log.push({ gx: 0.5, gy: 0.5 }, 2100)
  for (let time = 2200; time <= 4400; time += 100) log.push({ gx: 0.02, gy: 0.02 }, time)
  log.finish()
  log.finish()
  expect(log.entries()).toEqual([
    { t_ms: 0, duration_ms: 1000, side: 'left' },
    { t_ms: 1200, duration_ms: 2200, side: 'left' },
  ])
})

it('ends on face loss and does not add unseen time during a camera gap', () => {
  const log = new DurationLog(0)
  log.push({ gx: 1, gy: 0.5 }, 0)
  log.push({ gx: 1, gy: 0.5 }, 100)
  log.push(null, 200)
  log.push({ gx: 1, gy: 0.5 }, 1000)
  log.push({ gx: 1, gy: 0.5 }, 1100)
  log.push({ gx: 1, gy: 0.5 }, 5000)
  log.finish()
  expect(log.entries().map((entry) => entry.duration_ms)).toEqual([100, 100, 0])
})

it('records short visits and updates an active duration until recording stops', () => {
  const log = new DurationLog(0)
  log.push({ gx: 0.5, gy: 0 }, 0)
  log.push({ gx: 0.5, gy: 0 }, 100)
  expect(log.entries()).toEqual([{ t_ms: 0, duration_ms: 100, side: 'top' }])
  log.push({ gx: 0.5, gy: 0 }, 300)
  log.finish()
  expect(log.entries()).toEqual([{ t_ms: 0, duration_ms: 300, side: 'top' }])
})
