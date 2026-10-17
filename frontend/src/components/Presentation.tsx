import { useEffect, useRef, useState, type ReactNode } from 'react'
import { EnergyField, type VisualPhase } from '../visuals/EnergyField'
import { useReducedMotion } from '../visuals/useReducedMotion'

export function Brand() {
  return <span className="brand"><span className="brand-icon" aria-hidden="true"><i /><i /><i /></span>Explain-It<span className="brand-period">.</span></span>
}

export function PageBrand() {
  return <div className="site-header page-brand no-print"><Brand /></div>
}

export function StageBackdrop({ phase = 'ready' }: { phase?: VisualPhase }) {
  const prefersReduced = useReducedMotion()
  const [reduce, setReduce] = useState(false)
  return <>
    <EnergyField phase={phase} amplitude={0} reducedMotion={prefersReduced || reduce} quality="standard" />
    <div className="stage-header no-print"><Brand /><label className="motion-control"><input type="checkbox" checked={prefersReduced || reduce} disabled={prefersReduced} onChange={(e) => setReduce(e.target.checked)} /> Reduce motion</label></div>
  </>
}

/** Setup presentation only; the existing screen retains all device/upload state. */
export function SetupDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      document.body.style.overflow = overflow
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [])
  return <div className="setup-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
    <div ref={ref} className="setup-dialog" role="dialog" aria-modal="true" aria-labelledby="setup-title" aria-describedby="setup-description" tabIndex={-1}
      onKeyDown={(e) => {
        if (e.defaultPrevented || (e.target instanceof Element && e.target.closest('[role=dialog]') !== ref.current)) return
        if (e.key === 'Escape') { e.stopPropagation(); onClose() }
        if (e.key !== 'Tab') return
        const controls = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], summary, [tabindex="0"]') ?? []).filter((el) => !el.closest('[hidden]'))
        const first = controls[0], last = controls.at(-1)
        if (!first) { e.preventDefault(); ref.current?.focus() }
        else if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first.focus() }
      }}>
      {children}
    </div>
  </div>
}
