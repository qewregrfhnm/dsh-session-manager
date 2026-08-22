import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  buildSessionJson,
  buildSessionMarkdown,
  foldTitle,
  formatExportTime,
  messageContentText,
} from '../src/export.ts'

const meta = { id: 'session-abc123', cwd: 'D:/work/project', createdAt: 1700000000000 }

const events: SessionEvent[] = [
  { seq: 0, time: 1700000000000, type: 'turn/start', data: { turn: 0 } },
  { seq: 1, time: 1700000001000, type: 'user/message', data: { id: 'm1', role: 'user', content: [{ type: 'text', text: '你好，帮我看看' }], source: { kind: 'user' } } },
  { seq: 2, time: 1700000002000, type: 'tool/call', data: { turn: 0, step: 0, callId: 'c1', name: 'fs_read', arguments: '{"path":"a.txt"}' } },
  { seq: 3, time: 1700000003000, type: 'tool/result', data: { turn: 0, step: 0, message: { id: 'r1', role: 'user', content: [{ type: 'tool_result', callId: 'c1', content: [{ type: 'text', text: 'file contents here' }] }], source: { kind: 'tool' } } } },
  { seq: 4, time: 1700000004000, type: 'assistant/message', data: { turn: 0, step: 0, message: { id: 'a1', role: 'assistant', content: [{ type: 'text', text: '搞定了' }], source: { kind: 'model', provider: 'test', model: 'test-1' } } } },
  { seq: 5, time: 1700000005000, type: 'turn/end', data: { turn: 0, reason: 'success' } },
  { seq: 6, time: 1700000006000, type: 'session/title', data: { title: '你好，帮我看看', messageSeqs: [], source: { kind: 'user' } } },
]

describe('foldTitle', () => {
  it('returns the latest session/title text', () => {
    expect(foldTitle(events)).toBe('你好，帮我看看')
  })
  it('returns undefined when no title event exists', () => {
    expect(foldTitle(events.slice(0, 5))).toBeUndefined()
  })
})

describe('messageContentText', () => {
  it('renders text blocks', () => {
    expect(messageContentText([{ type: 'text', text: 'abc' }])).toBe('abc')
  })
  it('renders tool_call blocks with formatted arguments', () => {
    const out = messageContentText([{ type: 'tool_call', id: 'c', name: 'fs_read', arguments: '{"a":1}' }])
    expect(out).toContain('[tool call: fs_read]')
    expect(out).toContain('"a": 1')
  })
  it('renders nested tool_result text', () => {
    const out = messageContentText([{ type: 'tool_result', callId: 'c', content: [{ type: 'text', text: 'inner' }] }])
    expect(out).toContain('[tool result]')
    expect(out).toContain('inner')
  })
  it('returns empty for non-array input', () => {
    expect(messageContentText(undefined)).toBe('')
    expect(messageContentText('nope')).toBe('')
  })
})

describe('formatExportTime', () => {
  it('formats a timestamp in local wall-clock time', () => {
    const d = new Date(1700000000000)
    const pad = (n: number) => String(n).padStart(2, '0')
    const expected = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    expect(formatExportTime(1700000000000)).toBe(expected)
  })
  it('returns empty for invalid input', () => {
    expect(formatExportTime(0)).toBe('')
    expect(formatExportTime(Number.NaN)).toBe('')
  })
})

describe('buildSessionMarkdown', () => {
  const md = buildSessionMarkdown(meta, events, '你好，帮我看看')
  it('renders the title header', () => {
    expect(md).toContain('# 你好，帮我看看')
    expect(md).toContain('Session ID: `session-abc123`')
    expect(md).toContain('Working directory: `D:/work/project`')
  })
  it('renders turns, messages, tool calls and results', () => {
    expect(md).toContain('## Turn 1')
    expect(md).toContain('### User')
    expect(md).toContain('你好，帮我看看')
    expect(md).toContain('#### Tool call: fs_read')
    expect(md).toContain('```json')
    expect(md).toContain('"path": "a.txt"')
    expect(md).toContain('#### Tool result')
    expect(md).toContain('file contents here')
    expect(md).toContain('### Assistant')
    expect(md).toContain('搞定了')
  })
  it('falls back to the session id as the title', () => {
    expect(buildSessionMarkdown(meta, events, undefined)).toContain('# session-abc123')
  })
})

describe('buildSessionJson', () => {
  const json = buildSessionJson(meta, events)
  const parsed = JSON.parse(json) as {
    format: string
    version: number
    session: { id: string; cwd: string; createdAt: number }
    events: { seq: number; type: string; data: unknown }[]
  }
  it('emits a lossless envelope', () => {
    expect(parsed.format).toBe('dsh-session-export')
    expect(parsed.version).toBe(1)
    expect(parsed.session.id).toBe('session-abc123')
    expect(parsed.session.cwd).toBe('D:/work/project')
    expect(parsed.events).toHaveLength(events.length)
  })
  it('preserves every event in seq order', () => {
    parsed.events.forEach((event, index) => {
      expect(event.seq).toBe(index)
    })
    const user = parsed.events[1]
    expect(user.type).toBe('user/message')
    expect((user.data as { content: { text: string }[] }).content[0].text).toBe('你好，帮我看看')
  })
})
