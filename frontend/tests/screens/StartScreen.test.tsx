import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, uploadFiles } from '../../src/api/client'
import StartScreen from '../../src/screens/StartScreen'

vi.mock('../../src/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/api/client')>()
  return { ...actual, uploadFiles: vi.fn() }
})
vi.mock('../../src/api/media', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/api/media')>()
  const track = { kind: 'audio', stop: vi.fn() }
  return {
    ...actual,
    openMedia: vi.fn().mockResolvedValue({
      stream: { getTracks: () => [track], getAudioTracks: () => [track], getVideoTracks: () => [] },
      hasVideo: false,
    }),
  }
})
vi.mock('../../src/lookaway', () => ({ preloadTracker: vi.fn() }))

const created = (text_used: boolean, note: string) => ({
  upload_id: 'u1',
  files: [],
  text_used,
  note,
})

function file(name: string, size = 20) {
  return new File([new Uint8Array(size)], name)
}
function pick(label: string, f: File) {
  fireEvent.change(screen.getByLabelText(label), { target: { files: [f] } })
}

async function ready() {
  const onStart = vi.fn()
  render(<StartScreen error={null} onStart={onStart} />)
  fireEvent.click(screen.getByRole('button', { name: 'Check devices' }))
  await screen.findByText(/microphone ready/i)
  fireEvent.click(screen.getByRole('checkbox', { name: /I agree/ }))
  return onStart
}
const useOwnFiles = () => fireEvent.click(screen.getByRole('checkbox', { name: /sample quiz/i }))
const start = () => screen.getByRole('button', { name: 'Start' })

beforeEach(() => {
  vi.mocked(uploadFiles).mockReset().mockResolvedValue(created(true, 'Your uploaded files will be used to generate the questions and expected answers.'))
})

describe('StartScreen files', () => {
  it('works with no files: the sample quiz is on by default', async () => {
    const onStart = await ready()
    expect(screen.getByRole('checkbox', { name: /sample quiz/i })).toBeChecked()
    expect(start()).toBeEnabled()
    fireEvent.click(start())
    expect(onStart).toHaveBeenCalledWith(undefined)
    expect(uploadFiles).not.toHaveBeenCalled()
  })

  it('needs both files once the sample is turned off', async () => {
    await ready()
    useOwnFiles()
    expect(start()).toBeDisabled()
    expect(screen.getByText(/add both files/i)).toBeInTheDocument()
    pick('Assessment questions', file('q.txt'))
    expect(start()).toBeDisabled()
    expect(uploadFiles).not.toHaveBeenCalled()
  })

  it('uploads when both files are chosen, shows the server note, then starts with the upload id', async () => {
    const onStart = await ready()
    useOwnFiles()
    pick('Assessment questions', file('q.txt'))
    pick('Your answers', file('a.py'))
    expect(await screen.findByText(/uploaded files will be used/i)).toBeInTheDocument()
    expect(uploadFiles).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(start()).toBeEnabled())
    fireEvent.click(start())
    expect(onStart).toHaveBeenCalledWith('u1')
  })

  it('rejects a wrong type without calling the API', async () => {
    await ready()
    useOwnFiles()
    pick('Assessment questions', file('virus.exe'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/source-code file/)
    expect(uploadFiles).not.toHaveBeenCalled()
  })

  it('rejects an oversize file without calling the API', async () => {
    await ready()
    useOwnFiles()
    pick('Your answers', file('big.txt', 2 * 1024 * 1024 + 1))
    expect(await screen.findByRole('alert')).toHaveTextContent(/too large/i)
    expect(uploadFiles).not.toHaveBeenCalled()
  })

  it('announces an upload failure and recovers when a file is replaced', async () => {
    vi.mocked(uploadFiles).mockRejectedValueOnce(new ApiError(415, 'unsupported_file_type', 'Not a real PDF.'))
    const onStart = await ready()
    useOwnFiles()
    pick('Assessment questions', file('q.pdf'))
    pick('Your answers', file('a.pdf'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Not a real PDF.')
    expect(start()).toBeDisabled()
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])
    pick('Assessment questions', file('q.txt'))
    await waitFor(() => expect(start()).toBeEnabled())
    fireEvent.click(start())
    expect(onStart).toHaveBeenCalledWith('u1')
  })

  it('explains the look-away count honestly in the consent text', () => {
    render(<StartScreen error={null} onStart={vi.fn()} />)
    const text = document.body.textContent ?? ''
    expect(text).toMatch(/count of how often you look away/i)
    expect(text).toMatch(/never changes your score/i)
    expect(text).not.toMatch(/not analysed/i)
    expect(text).not.toMatch(/eye.?tracking/i)
  })
})


it('accepts multiple answers, appends later selections, and removes one file', async () => {
  await ready()
  useOwnFiles()
  const a = file('Main.java'), b = file('main.cpp'), c = file('c.py')
  const input = screen.getByLabelText('Your answers')
  expect(input).toHaveAttribute('multiple')
  fireEvent.change(input, { target: { files: [a, b] } })
  pick('Your answers', c)
  fireEvent.click(screen.getByRole('button', { name: 'Remove main.cpp' }))
  pick('Assessment questions', file('q.txt'))
  await screen.findByText(/uploaded files will be used/i)
  expect(vi.mocked(uploadFiles).mock.calls.at(-1)?.[1]).toEqual([a, c])
})
