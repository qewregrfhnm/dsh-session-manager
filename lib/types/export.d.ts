/**
 * Session export builders: pure functions that render a decoded session log
 * (header + events) into readable Markdown or lossless JSON. No host services
 * are touched, so both builders stay unit-testable and side-effect free.
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session';
/** Minimal structural view of a session header the builders read. */
export interface ExportSessionMeta {
    id: string;
    cwd?: string;
    createdAt?: number;
    parentSession?: string;
    agentPreset?: string;
    origin?: unknown;
    delegationDepth?: number;
    seedLength?: number;
}
/** Local wall-clock timestamp, 'YYYY-MM-DD HH:mm:ss'; '' for invalid input. */
export declare function formatExportTime(ms: number): string;
/**
 * Flatten a message's content blocks into readable text. Text blocks render
 * verbatim; tool-call blocks render a marker plus pretty-printed arguments;
 * nested tool-result blocks render their inner text.
 */
export declare function messageContentText(content: unknown): string;
/** Pretty-print a tool call's raw JSON arguments string. */
export declare function formatToolArguments(raw: unknown): string;
/** Fold the latest accepted title from the log's session/title events. */
export declare function foldTitle(events: readonly SessionEvent[]): string | undefined;
/**
 * Render a decoded session log as a readable Markdown transcript. Messages,
 * tool calls and tool results are kept; chunk/step/planning/compaction events
 * are skipped because their content lands in the assembled messages.
 */
export declare function buildSessionMarkdown(meta: ExportSessionMeta, events: readonly SessionEvent[], title: string | undefined): string;
/** Render the full decoded log as lossless JSON (header + every event). */
export declare function buildSessionJson(meta: ExportSessionMeta, events: readonly SessionEvent[]): string;
//# sourceMappingURL=export.d.ts.map