import { useCallback, useEffect, useReducer, useState } from 'react'
import { ApiError, createSession, getConfig } from './api/client'
import { AppConfigContext, DEFAULT_CONFIG, DemoModeContext } from './demoMode'
import Recorder from './Recorder'
import {
  clearSession,
  initialState,
  loadSession,
  reducer,
  saveSession,
  type FlowState,
} from './flow'
import LoadingScreen from './screens/LoadingScreen'
import QuestionScreen from './screens/QuestionScreen'
import ReportScreen from './screens/ReportScreen'
import ProfessorScreen from './screens/ProfessorScreen'
import StartScreen from './screens/StartScreen'
import type { AppConfig } from './api/types'

/** Pick up where a refreshed tab left off. */
function init(): FlowState {
  const saved = loadSession()
  return saved ? reducer(initialState, { type: 'resume', ...saved }) : initialState
}

function RecorderDemo() {
  return (
    <main className="screen">
      <h1 className="h2">Recorder test page</h1>
      <Recorder
        maxSeconds={40}
        onComplete={(blob, seconds) => {
          const out = document.getElementById('dev-result')
          if (out) out.textContent = `Got ${blob.size} bytes of ${blob.type} after ${seconds} s`
        }}
      />
      <p id="dev-result" className="muted" role="status" />
    </main>
  )
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, init)
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)

  // Best effort: if this fails the badges just show the live-build labels.
  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (state.screen === 'question' || state.screen === 'report') saveSession(state)
  }, [state])

  const begin = useCallback(async (uploadId?: string) => {
    dispatch({ type: 'begin' })
    try {
      const session = await createSession(uploadId)
      dispatch({
        type: 'created',
        sessionId: session.session_id,
        title: session.title,
        total: session.total_questions,
      })
    } catch (e) {
      dispatch({
        type: 'failed',
        message:
          e instanceof ApiError || e instanceof Error
            ? e.message
            : 'Could not start. Please try again.',
      })
    }
  }, [])

  const restart = useCallback(() => {
    clearSession()
    dispatch({ type: 'reset' })
  }, [])

  const sessionLost = useCallback(() => {
    clearSession()
    dispatch({ type: 'failed', message: 'Your earlier session has expired. Please start again.' })
  }, [])

  const onAnswered = useCallback(
    (n: number, transcript: string) => dispatch({ type: 'answered', n, transcript }),
    [],
  )
  const onNext = useCallback(() => dispatch({ type: 'next' }), [])

  const params = new URLSearchParams(window.location.search)
  if (params.get('dev') === 'recorder') return <RecorderDemo />
  if (params.get('view') === 'professor') return <ProfessorScreen />

  return (
    <AppConfigContext.Provider value={config}>
    <DemoModeContext.Provider value={config.demo_mode}>
      <a className="skip" href="#main">Skip to content</a>
      <div id="main">
        {state.screen === 'start' && <StartScreen error={state.error} onStart={begin} />}
        {state.screen === 'loading' && <LoadingScreen />}
        {state.screen === 'question' && state.sessionId && (
          <QuestionScreen
            key={state.index}
            sessionId={state.sessionId}
            index={state.index}
            total={state.total}
            onAnswered={onAnswered}
            onNext={onNext}
            onSessionLost={sessionLost}
          />
        )}
        {state.screen === 'report' && state.sessionId && (
          <ReportScreen sessionId={state.sessionId} onRestart={restart} />
        )}
      </div>
    </DemoModeContext.Provider>
    </AppConfigContext.Provider>
  )
}
