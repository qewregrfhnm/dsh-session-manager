/**
 * Session export builders: pure functions that render a decoded session log
 * (header + events) into readable Markdown or lossless JSON. No host services
 * are touched, so both builders stay unit-testable and side-effect free.
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session'
// Brings the 'session/title' SessionEventMap augmentation into the program.
import type {} from '@deepseek-ai/dsh-session-title'

/** Minimal structural view of a session header the builders read. */
export interface ExportSessionMeta {
  id: string
  cwd?: string
  createdAt?: number
  parentSession?: string
  agentPreset?: string
  origin?: unknown
  delegationDepth?: number
  seedLength?: number
}

/** Cap on rendered tool-result text so huge file dumps do not blow up the file. */
const TOOL_RESULT_MAX_CHARS = 4000

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Local wall-clock timestamp, 'YYYY-MM-DD HH:mm:ss'; '' for invalid input. */
export function formatExportTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

interface ContentBlockLike {
  type?: unknown
  text?: unknown
  name?: unknown
  arguments?: unknown
  content?: unknown
}

/**
 * Flatten a message's content blocks into readable text. Text blocks render
 * verbatim; tool-call blocks render a marker plus pretty-printed arguments;
 * nested tool-result blocks render their inner text.
 */
export function messageContentText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue
    const b = block as ContentBlockLike
    if (b.type === 'text') {
      if (typeof b.text === 'string' && b.text !== '') parts.push(b.text)
    } else if (b.type === 'tool_call') {
      const name = typeof b.name === 'string' ? b.name : 'tool'
      parts.push(`[tool call: ${name}]
${formatToolArguments(b.arguments)}`)
    } else if (b.type === 'tool_result') {
      const nested = messageContentText(b.content)
      if (nested !== '') parts.push(`[tool result]
${nested}`)
    }
  }
  return parts.join('\n\n')
}

/** Pretty-print a tool call's raw JSON arguments string. */
export function formatToolArguments(raw: unknown): string {
  if (typeof raw !== 'string') return JSON.stringify(raw ?? {}, null, 2)
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

/** Fold the latest accepted title from the log's session/title events. */
export function foldTitle(events: readonly SessionEvent[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type !== 'session/title') continue
    const data = (events[i].data ?? {}) as { title?: unknown }
    if (typeof data.title === 'string' && data.title !== '') return data.title
  }
  return undefined
}

/**
 * Render a decoded session log as a readable Markdown transcript. Messages,
 * tool calls and tool results are kept; chunk/step/planning/compaction events
 * are skipped because their content lands in the assembled messages.
 */
export function buildSessionMarkdown(
  meta: ExportSessionMeta,
  events: readonly SessionEvent[],
  title: string | undefined,
): string {
  const out: string[] = []
  out.push(`# ${title !== undefined && title !== '' ? title : meta.id}`)
  out.push('')
  out.push(`- Session ID: \`${meta.id}\``)
  if (meta.cwd !== undefined) out.push(`- Working directory: \`${meta.cwd}\``)
  const created = formatExportTime(meta.createdAt ?? 0)
  if (created !== '') out.push(`- Created: ${created}`)
  if (meta.parentSession !== undefined) out.push(`- Parent session: \`${meta.parentSession}\``)
  out.push(`- Exported: ${formatExportTime(Date.now())}`)
  out.push('')
  out.push('---')
  out.push('')
  let turn = 0
  for (const event of events) {
    const data = (event.data ?? {}) as Record<string, unknown>
    if (event.type === 'turn/start') {
      turn += 1
      out.push(`## Turn ${turn}`, '')
      continue
    }
    if (event.type === 'user/message') {
      const text = messageContentText(data.content)
      if (text !== '') {
        const stamp = formatExportTime(event.time)
        out.push(`### User${stamp !== '' ? ` · ${stamp}` : ''}`, '', text, '')
      }
      continue
    }
    if (event.type === 'assistant/message') {
      const message = (data.message ?? {}) as { content?: unknown }
      const text = messageContentText(message.content)
      if (text !== '') {
        const stamp = formatExportTime(event.time)
        out.push(`### Assistant${stamp !== '' ? ` · ${stamp}` : ''}`, '', text, '')
      }
      continue
    }
    if (event.type === 'tool/call') {
      const name = typeof data.name === 'string' ? data.name : 'tool'
      const stamp = formatExportTime(event.time)
      out.push(`#### Tool call: ${name}${stamp !== '' ? ` · ${stamp}` : ''}`, '', '```json', formatToolArguments(data.arguments), '```', '')
      continue
    }
    if (event.type === 'tool/result') {
      const message = (data.message ?? {}) as { content?: unknown }
      const text = messageContentText(message.content)
      const truncated = text.length > TOOL_RESULT_MAX_CHARS
        ? text.slice(0, TOOL_RESULT_MAX_CHARS) + '\n\n… (truncated)'
        : text
      if (truncated !== '') {
        const stamp = formatExportTime(event.time)
        out.push(`#### Tool result${stamp !== '' ? ` · ${stamp}` : ''}`, '', truncated, '')
      }
      continue
    }
  }
  return out.join('\n') + '\n'
}

/** Render the full decoded log as lossless JSON (header + every event). */
export function buildSessionJson(meta: ExportSessionMeta, events: readonly SessionEvent[]): string {
  return JSON.stringify({
    format: 'dsh-session-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    session: {
      id: meta.id,
      cwd: meta.cwd,
      createdAt: meta.createdAt,
      parentSession: meta.parentSession,
      agentPreset: meta.agentPreset,
      origin: meta.origin,
      delegationDepth: meta.delegationDepth,
      seedLength: meta.seedLength,
    },
    events: events.map((event) => ({ seq: event.seq, time: event.time, type: event.type, data: event.data })),
  }, null, 2)
}
