import { useEffect, useState } from 'react'
import { ApiError, getReport } from '../api/client'
import type { QuestionResult, Report } from '../api/types'
import { PageBrand } from '../components/Presentation'
import Badge from '../components/Badge'
import LoadingScreen from './LoadingScreen'

interface ReportScreenProps {
  sessionId: string
  onRestart: () => void
}

type Load = { kind: 'loading' } | { kind: 'ready'; report: Report } | { kind: 'failed'; message: string }

const percent = (value: number) => `${Math.round(value * 100)}%`

function ScoreBar({ score }: { score: number | null }) {
  if (score === null) return <p className="muted">Not graded yet</p>
  return (
    <div className="scorebar">
      <div className="segments" role="img" aria-label={`Score ${score} out of 5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={i <= score ? 'seg on' : 'seg'} />
        ))}
      </div>
      <span className="score-num">{score} / 5</span>
    </div>
  )
}

function QuestionCard({ q }: { q: QuestionResult }) {
  return (
    <article className="card" aria-labelledby={`q${q.index}`}>
      <h3 id={`q${q.index}`} className="h3">
        {q.index}. {q.text}
      </h3>
      <p className="label">What you said</p>
      {q.transcript ? <blockquote>{q.transcript}</blockquote> : <p className="muted">No speech was detected.</p>}
      <ScoreBar score={q.score} />
      {q.feedback && <p>{q.feedback}</p>}
    </article>
  )
}

export default function ReportScreen({ sessionId, onRestart }: ReportScreenProps) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    getReport(sessionId)
      .then((report) => alive && setLoad({ kind: 'ready', report }))
      .catch((e: unknown) => {
        if (!alive) return
        setLoad({
          kind: 'failed',
          message: e instanceof ApiError || e instanceof Error ? e.message : 'Could not load the report.',
        })
      })
    return () => {
      alive = false
    }
  }, [sessionId, attempt])

  function retry() {
    setLoad({ kind: 'loading' })
    setAttempt((a) => a + 1)
  }

  if (load.kind === 'loading') return <LoadingScreen message="Grading your answers…" />

  if (load.kind === 'failed') {
    return (
      <main className="screen">
        <h1>Your report</h1>
        <p role="alert" className="error">{load.message}</p>
        <button type="button" className="primary" onClick={retry}>Try again</button>
      </main>
    )
  }

  const { report } = load
  const ungraded = report.questions.filter((q) => q.score === null).map((q) => q.index)
  const wp = report.weights.problem
  const we = report.weights.explanation

  return (
    <main className="results-page">
      <PageBrand />
      <div className="screen report results-content">
      <header>
        <p className="eyebrow">Assessment results</p>
        <h1>{report.title}</h1>
      </header>

      <section className="card summary" aria-labelledby="final-title">
        <h2 id="final-title" className="label">Final score</h2>
        {report.final_score !== null ? (
          <p className="final">
            <span className="final-num">{report.final_score}</span>
            <span className="final-of"> / 100</span>
          </p>
        ) : (
          <p className="final-num pending">Provisional</p>
        )}
        <dl className="parts">
          <div>
            <dt>Problem score <Badge feature="problemScore" /></dt>
            <dd>{percent(report.problem_score)} <span className="muted">· weight {percent(wp)}</span></dd>
          </div>
          <div>
            <dt>Explanation score <Badge feature="grading" /></dt>
            <dd>
              {report.explanation_score === null ? 'Not graded yet' : percent(report.explanation_score)}{' '}
              <span className="muted">· weight {percent(we)}</span>
            </dd>
          </div>
        </dl>
      </section>

      {report.partial && (
        <section className="card notice" role="status">
          <p>
            Question{ungraded.length > 1 ? 's' : ''} {ungraded.join(', ')} could not be graded just
            now, so the final score is provisional. Your answers are saved.
          </p>
          <button type="button" className="primary" onClick={retry}>Try grading again</button>
        </section>
      )}

      <h2>Your three answers</h2>
      {report.questions.map((q) => (
        <QuestionCard key={q.index} q={q} />
      ))}

      <details className="card">
        <summary>How this was scored</summary>
        <ul>
          <li>
            <strong>Problem score:</strong> the share of quiz points earned. In this demo it is
            preset and the tests are not run live.
          </li>
          <li>
            <strong>Explanation score:</strong> each spoken answer is compared with the key ideas an AI
            wrote for that question and scored from 0 to 5. The explanation score is the average
            divided by 5.
          </li>
          <li>
            <strong>Final score:</strong> 100 × ({wp} × problem score + {we} × explanation score).
            The AI never touches the problem score or the final arithmetic.
          </li>
          <li>A person decides what any score means.</li>
        </ul>
      </details>

      <div className="actions no-print">
        <button type="button" onClick={() => window.print()}>Print this report</button>
        <button type="button" className="primary" onClick={onRestart}>Start over</button>
      </div>
      </div>
    </main>
  )
}
