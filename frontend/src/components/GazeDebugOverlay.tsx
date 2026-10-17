import { useSyncExternalStore } from 'react'
import { DEFAULT_OPTIONS } from '../lookaway/counter'
import type { LookAwayMonitor } from '../lookaway'

/**
 * Developer check (backend DEBUG_BORDERS=1): shows the invisible look-away borders in red, the
 * current gaze point and the running count. Never rendered for students.
 */
export default function GazeDebugOverlay({ monitor }: { monitor: LookAwayMonitor }) {
  const snap = useSyncExternalStore(
    (cb) => monitor.subscribe(cb),
    () => monitor.getSnapshot(),
  )
  const pct = `${DEFAULT_OPTIONS.band * 100}%`
  const edge = '2px solid rgba(255, 45, 45, 0.95)'
  const band = { position: 'fixed', background: 'transparent', pointerEvents: 'none', zIndex: 9999 } as const
  return (
    <div data-testid="gaze-debug" aria-hidden="true">
      <div style={{ ...band, top: 0, left: 0, right: 0, height: pct, borderBottom: edge }} />
      <div style={{ ...band, bottom: 0, left: 0, right: 0, height: pct, borderTop: edge }} />
      <div style={{ ...band, top: 0, bottom: 0, left: 0, width: pct, borderRight: edge }} />
      <div style={{ ...band, top: 0, bottom: 0, right: 0, width: pct, borderLeft: edge }} />
      {snap.sample && (
        <div
          style={{
            position: 'fixed',
            left: `${snap.sample.gx * 100}%`,
            top: `${snap.sample.gy * 100}%`,
            width: 14,
            height: 14,
            marginLeft: -7,
            marginTop: -7,
            borderRadius: '50%',
            background: '#d00',
            border: '2px solid #fff',
            pointerEvents: 'none',
            zIndex: 10000,
          }}
        />
      )}
      <div
        style={{
          position: 'fixed',
          bottom: '14%',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '4px 10px',
          width: 'min(680px, calc(100vw - 32px))',
          background: '#300',
          color: '#fff',
          font: '12px monospace',
          zIndex: 10000,
        }}
      >
        look-aways {snap.count} · duration entries {snap.durations.length}
        <div style={{ maxHeight: '18vh', overflow: 'auto', marginTop: 4 }}>
          <div>Normal log: {snap.events.length ? snap.events.slice(-4).map((event) => `${(event.t_ms / 1000).toFixed(1)}s ${event.side}`).join(' · ') : 'none'}</div>
          <div>Duration log: {snap.durations.length ? snap.durations.slice(-4).map((event) => `${(event.t_ms / 1000).toFixed(1)}s ${event.side} (${(event.duration_ms / 1000).toFixed(1)}s)`).join(' · ') : 'none'}</div>
        </div>
      </div>
    </div>
  )
}
