import { useSyncExternalStore } from 'react'
import type { LookAwayMonitor } from '../lookaway'

/**
 * Developer check (backend DEBUG_BORDERS=1): shows the current gaze point and
 * running logs without drawing look-away boundaries.
 */
export default function GazeDebugOverlay({ monitor }: { monitor: LookAwayMonitor }) {
  const snap = useSyncExternalStore(
    (cb) => monitor.subscribe(cb),
    () => monitor.getSnapshot(),
  )
  return (
    <div data-testid="gaze-debug" aria-hidden="true">
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
      <div className="gaze-debug-log">
        look-aways {snap.count} · duration entries {snap.durations.length}
        <div style={{ maxHeight: '64px', overflow: 'auto', marginTop: 4 }}>
          <div>Normal log: {snap.events.length ? snap.events.slice(-4).map((event) => `${(event.t_ms / 1000).toFixed(1)}s ${event.side}`).join(' · ') : 'none'}</div>
          <div>Duration log: {snap.durations.length ? snap.durations.slice(-4).map((event) => `${(event.t_ms / 1000).toFixed(1)}s ${event.side} (${(event.duration_ms / 1000).toFixed(1)}s)`).join(' · ') : 'none'}</div>
        </div>
      </div>
    </div>
  )
}
