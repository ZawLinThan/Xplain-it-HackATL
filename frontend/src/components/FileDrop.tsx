import { useId, useRef, useState } from 'react'
import { ALLOWED_EXTENSIONS, formatSize, validateFile } from '../fileRules'

interface FileDropProps {
  label: string
  file: File | null
  error: string | null
  disabled?: boolean
  /** Called with a file that passed the early checks, or with null when it was removed. */
  onChange: (file: File | null) => void
  /** Called with a plain-words problem when the chosen file is not acceptable. */
  onReject: (message: string) => void
}

/** A drop zone that is also a real file input, so keyboard and screen reader users can use it. */
export default function FileDrop({ label, file, error, disabled = false, onChange, onReject }: FileDropProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  function take(candidate: File | undefined) {
    if (!candidate) return
    const problem = validateFile(candidate)
    if (problem) onReject(problem)
    else onChange(candidate)
  }

  return (
    <div
      className={`dropzone${over ? ' over' : ''}${disabled ? ' disabled' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (!disabled) take(e.dataTransfer.files[0])
      }}
    >
      <label htmlFor={inputId} className="label">
        {label}
      </label>
      {file ? (
        <p>
          <span className="filename">{file.name}</span> <span className="muted">· {formatSize(file.size)}</span>{' '}
          <button type="button" className="link" disabled={disabled} onClick={() => onChange(null)}>
            Remove
          </button>
        </p>
      ) : (
        <p className="muted">Drop a file here or choose one. {ALLOWED_EXTENSIONS.join(' ')}, up to 2 MB.</p>
      )}
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={ALLOWED_EXTENSIONS.join(',')}
        disabled={disabled}
        onChange={(e) => {
          take(e.target.files?.[0])
          e.target.value = '' // lets the same file be chosen again after a Remove
        }}
      />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  )
}
