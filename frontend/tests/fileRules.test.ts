import { expect, it } from 'vitest'
import { CODE_EXTENSIONS, validateFile } from '../src/fileRules'

it.each([...CODE_EXTENSIONS, '.JAVA', '.CPP'])('accepts %s source files', (extension) => {
  expect(validateFile({ name: `solution${extension}`, size: 100 })).toBeNull()
})
it('rejects executables and keeps the per-file size limit', () => {
  expect(validateFile({ name: 'app.exe', size: 100 })).toMatch(/source-code/)
  expect(validateFile({ name: 'Main.java', size: 2 * 1024 * 1024 + 1 })).toMatch(/too large/)
})
