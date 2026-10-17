import type { ProfessorSessionRow } from '../api/types'

/** Short text reasons for a row. Never colour alone. */
export function reasonsFor(row: ProfessorSessionRow, threshold: number): string[] {
  const out: string[] = []
  if (row.lookaway_flagged) {
    const q = row.lookaway_max_question ? ` in question ${row.lookaway_max_question}` : ''
    out.push(`Looked away ${row.lookaway_max} times${q} (limit ${threshold})`)
  }
  if (row.review_flag) out.push('Answers weaker than the code score')
  return out
}
