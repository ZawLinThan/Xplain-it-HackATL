// Enrollment token is kept only in this page's memory, never browser persistent storage.
let enrollmentId: string | null = null
export function voiceEnrollment(): string | null { return enrollmentId }
export function setVoiceEnrollment(value: string | null): void { enrollmentId = value }
