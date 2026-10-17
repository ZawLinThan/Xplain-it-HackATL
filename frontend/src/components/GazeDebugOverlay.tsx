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
  const band = { position: 'fixed', background: 'rgba(255, 0, 0, 0.10)', pointerEvents: 'none', zIndex: 9999 } as const
  return (
    <div data-testid="gaze-debug" aria-hidden="true">
      <div style={{ ...band, top: 0, left: 0, right: 0, height: pct }} />
      <div style={{ ...band, bottom: 0, left: 0, right: 0, height: pct }} />
      <div style={{ ...band, top: 0, bottom: 0, left: 0, width: pct }} />
      <div style={{ ...band, top: 0, bottom: 0, right: 0, width: pct }} />
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
          background: '#300',
          color: '#fff',
          font: '12px monospace',
          zIndex: 10000,
        }}
      >
        debug · tracked {String(snap.tracked)} · counting {String(snap.counting)} · look-aways {snap.count}
      </div>
    </div>
  )
}
