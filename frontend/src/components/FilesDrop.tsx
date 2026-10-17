import { useId, useState } from 'react'
import { ALLOWED_EXTENSIONS, formatSize, validateFile } from '../fileRules'

interface Props {
  label: string
  files: File[]
  error: string | null
  onChange: (files: File[]) => void
  onReject: (message: string) => void
}

export default function FilesDrop({ label, files, error, onChange, onReject }: Props) {
  const id = useId()
  const [over, setOver] = useState(false)
  function add(candidates: File[]) {
    const problem = candidates.map(validateFile).find(Boolean)
    if (problem) { onReject(problem); return }
    if (candidates.length) onChange([...files, ...candidates])
  }
  return (
    <div className={`dropzone${over ? ' over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); add(Array.from(e.dataTransfer.files)) }}>
      <label htmlFor={id} className="label">{label}</label>
      <p className="muted">Drop files here or choose multiple files. {ALLOWED_EXTENSIONS.join(' ')}, up to 2 MB each.</p>
      {files.map((file, index) => (
        <p key={index}>
          <span className="filename">{file.name}</span> <span className="muted">· {formatSize(file.size)}</span>{' '}
          <button type="button" className="link" aria-label={`Remove ${file.name}`}
            onClick={() => onChange(files.filter((_, i) => i !== index))}>Remove</button>
        </p>
      ))}
      <input id={id} type="file" multiple accept={ALLOWED_EXTENSIONS.join(',')}
        onChange={(e) => { add(Array.from(e.target.files ?? [])); e.target.value = '' }} />
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  )
}
