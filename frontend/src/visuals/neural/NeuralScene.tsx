import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import type { NeuralRenderer, RendererState } from './createNeuralRenderer'
import { NeuralFallback } from './NeuralFallback'
import type { NeuralQuality, NeuralSceneProps } from './sceneTypes'
import './neural.css'

function webglAvailable(): boolean {
  if (typeof window === 'undefined' || typeof window.WebGLRenderingContext === 'undefined') return false
  if (new URLSearchParams(window.location.search).get('neural') === 'static') return false
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/** Contains renderer failures: only the decorative scene is replaced, never the page. */
class NeuralBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

type CanvasProps = NeuralSceneProps & { quality: NeuralQuality; onFailed: () => void; onSlow: () => void }

function NeuralCanvas({ mode, seed, quality, onFailed, onSlow, onHubsProjected, phase, questions, activeQuestionId, selectedQuestionId, hoveredQuestionId, levelSource, reducedMotion, paused = false }: CanvasProps) {
  const host = useRef<HTMLDivElement>(null)
  const renderer = useRef<NeuralRenderer | null>(null)
  const latest = useRef<RendererState>({ phase, questions, reducedMotion, paused })
  const callbacks = useRef({ onFailed, onSlow, onHubsProjected })

  useEffect(() => {
    callbacks.current = { onFailed, onSlow, onHubsProjected }
  })

  useEffect(() => {
    latest.current = { phase, questions, activeQuestionId, selectedQuestionId, hoveredQuestionId, levelSource, reducedMotion, paused }
    renderer.current?.update(latest.current)
  }, [phase, questions, activeQuestionId, selectedQuestionId, hoveredQuestionId, levelSource, reducedMotion, paused])

  useEffect(() => {
    const container = host.current
    if (!container) return
    let disposed = false
    let instance: NeuralRenderer | null = null
    import('./createNeuralRenderer')
      .then(({ createNeuralRenderer }) => {
        if (disposed) return
        try {
          instance = createNeuralRenderer({
            container,
            mode,
            seed,
            quality,
            onHubsProjected: (anchors) => callbacks.current.onHubsProjected?.(anchors),
            onSlow: () => callbacks.current.onSlow(),
            onError: () => {
              console.warn('Neural scene failed while rendering; using the static version.')
              if (!disposed) callbacks.current.onFailed()
            },
          })
        } catch (error) {
          console.warn('Neural scene unavailable; using the static version.', error)
          callbacks.current.onFailed()
          return
        }
        renderer.current = instance
        instance.update(latest.current)
      })
      .catch(() => {
        if (!disposed) callbacks.current.onFailed()
      })
    return () => {
      disposed = true
      instance?.dispose()
      renderer.current = null
    }
  }, [mode, seed, quality])

  return <div ref={host} className="neural-canvas-host" />
}

/** Decorative neural network. Text and controls always live in ordinary HTML outside it. */
export function NeuralScene(props: NeuralSceneProps & { onHubSelect?: (id: string) => void }) {
  const { mode, phase, seed, questions, activeQuestionId, selectedQuestionId, hoveredQuestionId, onHubSelect, className = '' } = props
  const [available] = useState(webglAvailable)
  const [failed, setFailed] = useState(false)
  const [quality, setQuality] = useState<NeuralQuality>('standard')
  const fallback = (
    <NeuralFallback mode={mode} phase={phase} seed={seed} questions={questions} activeQuestionId={activeQuestionId}
      selectedQuestionId={selectedQuestionId} hoveredQuestionId={hoveredQuestionId} onSelect={onHubSelect} />
  )
  const live = available && !failed
  return (
    <div className={`neural-scene neural-${mode} ${className}`.trim()} data-phase={phase} data-renderer={live ? `webgl-${quality}` : 'static'} aria-hidden="true">
      {live ? (
        <NeuralBoundary fallback={fallback}>
          <NeuralCanvas key={`${mode}:${seed}:${quality}`} {...props} quality={quality}
            onFailed={() => setFailed(true)} onSlow={() => setQuality((q) => (q === 'standard' ? 'low' : q))} />
        </NeuralBoundary>
      ) : fallback}
    </div>
  )
}
