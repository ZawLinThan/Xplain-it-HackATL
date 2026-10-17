// API types come from the backend contract (src/api/schema.d.ts, made by `npm run gen-types`).
// Never hand-write response shapes here; only give the generated ones friendly names.
import type { components } from './schema'

type Schemas = components['schemas']

export type SessionCreated = Schemas['SessionCreated']
export type QuestionPublic = Schemas['QuestionPublic']
export type AnswerResult = Schemas['AnswerResult']
export type QuestionResult = Schemas['QuestionResult']
export type Report = Schemas['Report']
export type AppConfig = Schemas['AppConfig']
export type UploadCreated = Schemas['UploadCreated']
export type ProfessorSessions = Schemas['ProfessorSessions']
export type ProfessorSessionRow = Schemas['ProfessorSessionRow']
export type ProfessorSession = Schemas['ProfessorSession']
export type ProfessorQuestion = Schemas['ProfessorQuestion']
