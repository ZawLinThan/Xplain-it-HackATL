import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { LevelSource } from '../visuals/audioLevel'
import { NeuralScene } from '../visuals/neural/NeuralScene'
import type { NeuralPhase, QuestionVisual } from '../visuals/neural/sceneTypes'
import { useReducedMotion } from '../visuals/useReducedMotion'

export function Brand() {
  return <span className="brand"><img className="brand-logo" src="/favicon.png" alt="" width="36" height="36" />Xplain-it</span>
}

export function PageBrand() {
  return <div className="site-header page-brand no-print"><Brand /></div>
}

const NO_QUESTIONS: QuestionVisual[] = []

interface StageBackdropProps {
  phase?: NeuralPhase
  /** Same seed on every assessment screen so the network keeps its shape between questions. */
  seed?: string
  questions?: QuestionVisual[]
  activeQuestionId?: string
  levelSource?: LevelSource
}

export function StageBackdrop({ phase = 'ready', seed = 'Xplain-it', questions = NO_QUESTIONS, activeQuestionId, levelSource }: StageBackdropProps) {
  const prefersReduced = useReducedMotion()
  const [reduce, setReduce] = useState(false)
  return <>
    <NeuralScene mode="assessment" phase={phase} seed={seed} questions={questions} activeQuestionId={activeQuestionId}
      levelSource={levelSource} reducedMotion={prefersReduced || reduce} />
    <div className="neural-reading-veil" aria-hidden="true" />
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
