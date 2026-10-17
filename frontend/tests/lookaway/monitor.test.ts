import { describe, expect, it, vi } from 'vitest'
import type { FaceTracker } from '../../src/lookaway/FaceTracker'
import { LookAwayMonitor } from '../../src/lookaway/monitor'
import type { GazeSample } from '../../src/lookaway/types'

class ScriptedTracker implements FaceTracker {
  emit: (s: GazeSample | null) => void = () => undefined
  stop = vi.fn()
  countingStarted = vi.fn()
  start = vi.fn((_v: HTMLVideoElement, cb: (s: GazeSample | null) => void) => {
    this.emit = cb
    return Promise.resolve()
  })
}

const video = {} as HTMLVideoElement

function clock() {
  let now = 0
  return { now: () => now, advance: (ms: number) => (now += ms) }
}

/** Feed samples for `ms` of fake time. */
function feed(t: ScriptedTracker, c: ReturnType<typeof clock>, sample: GazeSample | null, ms: number) {
  for (let i = 0; i < ms / 66; i++) {
    c.advance(66)
    t.emit(sample)
  }
}

describe('LookAwayMonitor', () => {
  it('samples during the reveal set the centre and are never counted', async () => {
    const t = new ScriptedTracker()
    const c = clock()
    const m = new LookAwayMonitor(t, {}, c.now)
    await m.attach(video)
    feed(t, c, { gx: 0.04, gy: 0.5 }, 1000) // reading with the head turned left: just the baseline
    expect(m.getSnapshot().count).toBe(0)
    m.beginCounting()
    feed(t, c, { gx: 0.04, gy: 0.5 }, 3000) // the same pose is "looking at the screen" for this student
    m.stopCounting()
    expect(m.payload()).toEqual({ tracked: true, events: [] })
  })

  it('counts excursions away from the calibrated centre', async () => {
    const t = new ScriptedTracker()
    const c = clock()
    const m = new LookAwayMonitor(t, {}, c.now)
    await m.attach(video)
    feed(t, c, { gx: 0.5, gy: 0.5 }, 1000)
    m.beginCounting()
    feed(t, c, { gx: 0.5, gy: 0.5 }, 500)
    feed(t, c, { gx: 0.03, gy: 0.5 }, 800)
    feed(t, c, { gx: 0.5, gy: 0.5 }, 500)
    expect(m.payload()).toMatchObject({ tracked: true, events: [{ side: 'left' }] })
    expect(m.getSnapshot().count).toBe(1)
  })

  it('a glance away while reading does not move the centre (median, not mean)', async () => {
    const t = new ScriptedTracker()
    const c = clock()
    const m = new LookAwayMonitor(t, {}, c.now)
    await m.attach(video)
    feed(t, c, { gx: 0.5, gy: 0.5 }, 2000)
    feed(t, c, { gx: 0.04, gy: 0.5 }, 800) // a glance during the reveal
    feed(t, c, { gx: 0.5, gy: 0.5 }, 600)
    m.beginCounting()
    feed(t, c, { gx: 0.5, gy: 0.5 }, 500)
    feed(t, c, { gx: 0.04, gy: 0.5 }, 700)
    expect(m.payload().events).toHaveLength(1) // a mean would have hidden this
  })

  it('a constant sideways seat is calibrated away', async () => {
    const t = new ScriptedTracker()
    const c = clock()
    const m = new LookAwayMonitor(t, {}, c.now)
    await m.attach(video)
    feed(t, c, { gx: 0.3, gy: 0.5 }, 1000) // sits to one side
    m.beginCounting()
    feed(t, c, { gx: 0.3, gy: 0.5 }, 3000)
    expect(m.payload().events).toHaveLength(0)
  })

  it('preserves a fitted screen center instead of re-centering it while reading', async () => {
    const t = Object.assign(new ScriptedTracker(), { calibrated: true })
    const c = clock()
    const m = new LookAwayMonitor(t, {}, c.now)
    await m.attach(video)
    feed(t, c, { gx: 0.3, gy: 0.7 }, 1000)
    m.beginCounting()
    feed(t, c, { gx: 0.5, gy: 0.5 }, 200)
    expect(m.getSnapshot().sample).toEqual({ gx: 0.5, gy: 0.5 })
  })

  it('reports not tracked, never zero, when the tracker cannot run', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const t = new ScriptedTracker()
    t.start.mockRejectedValueOnce(new Error('model failed to load'))
    const m = new LookAwayMonitor(t)
    await m.attach(video)
    m.beginCounting()
    expect(m.payload()).toEqual({ tracked: false, events: [] })
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('reports not tracked with no camera or with the detector off', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const a = new LookAwayMonitor(new ScriptedTracker())
    await a.attach(null)
    expect(a.payload().tracked).toBe(false)
    const b = new LookAwayMonitor(null)
    await b.attach(video)
    expect(b.payload()).toEqual({ tracked: false, events: [] })
    warn.mockRestore()
  })

  it('never adds events while counting is false, including late samples after halt', async () => {
    const t = new ScriptedTracker()
    const c = clock()
    const m = new LookAwayMonitor(t, {}, c.now)
    await m.attach(video)
    feed(t, c, { gx: 0.02, gy: 0.5 }, 4000)
    feed(t, c, null, 2000)
    expect(m.getSnapshot()).toMatchObject({ counting: false, count: 0 })
    // Use fewer than five calibration samples in a fresh monitor to keep the reference neutral.
    const active = new LookAwayMonitor(t, {}, c.now)
    await active.attach(video)
    active.beginCounting()
    feed(t, c, { gx: 0.02, gy: 0.5 }, 100)
    const recorded = active.payload()
    expect(recorded.events.length).toBeGreaterThan(0)
    active.stopCounting()
    feed(t, c, { gx: 0.02, gy: 0.5 }, 4000)
    feed(t, c, null, 2000)
    expect(active.getSnapshot()).toMatchObject({ counting: false, count: recorded.events.length })
    expect(active.payload()).toEqual(recorded)
    active.halt()
    feed(t, c, { gx: 0.98, gy: 0.98 }, 4000)
    expect(active.payload()).toEqual(recorded)
    m.dispose()
    active.dispose()
  })

  it('does not restart a stopped answer when a late recording-start callback arrives', async () => {
    const t = new ScriptedTracker()
    const c = clock()
    const m = new LookAwayMonitor(t, {}, c.now)
    await m.attach(video)
    m.beginCounting()
    feed(t, c, { gx: 0.02, gy: 0.5 }, 100)
    m.halt()
    const saved = m.payload()
    m.beginCounting()
    feed(t, c, { gx: 0.02, gy: 0.5 }, 5000)
    expect(m.getSnapshot()).toMatchObject({ counting: false, count: saved.events.length })
    expect(m.payload()).toEqual(saved)
  })

  it('ignores a tracker startup and samples that finish after halt', async () => {
    const t = new ScriptedTracker()
    let finish!: () => void
    t.start.mockImplementation((_video, cb) => {
      t.emit = cb
      return new Promise<void>((resolve) => { finish = resolve })
    })
    const m = new LookAwayMonitor(t)
    const attaching = m.attach(video)
    m.halt()
    finish()
    await attaching
    m.beginCounting()
    t.emit({ gx: 0, gy: 0 })
    expect(m.getSnapshot()).toMatchObject({ counting: false, tracked: false, count: 0, sample: null })
  })

  it('stops the tracker on halt and on dispose', async () => {
    const t = new ScriptedTracker()
    const m = new LookAwayMonitor(t)
    await m.attach(video)
    m.halt()
    expect(t.stop).toHaveBeenCalledTimes(1)
    m.dispose()
    expect(t.stop).toHaveBeenCalledTimes(2)
  })

  it('the payload carries only counts and times, never image data', async () => {
    const t = new ScriptedTracker()
    const c = clock()
    const m = new LookAwayMonitor(t, {}, c.now)
    await m.attach(video)
    m.beginCounting()
    feed(t, c, { gx: 0.02, gy: 0.5 }, 800)
    const payload = m.payload()
    expect(Object.keys(payload).sort()).toEqual(['events', 'tracked'])
    for (const e of payload.events) expect(Object.keys(e).sort()).toEqual(['side', 't_ms'])
  })
})
