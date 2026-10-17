/** The same rules as the server, applied early so a mistake is caught before an upload. */
export const CODE_EXTENSIONS = ['.py', '.java', '.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx', '.cs', '.js', '.jsx', '.ts', '.tsx', '.go', '.rs', '.kt', '.kts', '.swift', '.rb', '.php', '.scala', '.sql', '.html', '.css', '.scss', '.sh', '.bash', '.r', '.lua', '.dart', '.m', '.mm', '.ipynb', '.json'] as const
export const ALLOWED_EXTENSIONS = ['.txt', '.md', ...CODE_EXTENSIONS, '.pdf', '.docx'] as const
export const MAX_FILE_BYTES = 2 * 1024 * 1024

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** A plain-words problem with the file, or null when it looks fine. The server still has the last word. */
export function validateFile(file: { name: string; size: number }): string | null {
  const dot = file.name.lastIndexOf('.')
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : ''
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return 'Use a source-code file (such as .java, .cpp or .py), or a .txt, .md, .pdf or .docx document.'
  }
  if (file.size === 0) return 'That file is empty.'
  if (file.size > MAX_FILE_BYTES) return `That file is too large. The limit is ${formatSize(MAX_FILE_BYTES)}.`
  return null
}
