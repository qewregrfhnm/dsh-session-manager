/**
 * Wire contract shared by the host routes and the web client panel.
 * Both halves only exchange JSON, so the contract is types plus route
 * constants — no runtime import crosses the boundary.
 */
/** The host route the client panel calls to delete (move to trash) one session. */
export declare const DELETE_ROUTE = "/dsh-session-manager/delete";
/** Restore one session from the trash back to its original location. */
export declare const RESTORE_ROUTE = "/dsh-session-manager/restore";
/** Permanently purge one session from the trash. */
export declare const PURGE_ROUTE = "/dsh-session-manager/purge";
/** List the current trash contents. */
export declare const TRASH_ROUTE = "/dsh-session-manager/trash";
/** Reveal a session's log directory in the system file manager. */
export declare const OPEN_FOLDER_ROUTE = "/dsh-session-manager/open-folder";
/** Stop a running session's current turn (pause). */
export declare const PAUSE_ROUTE = "/dsh-session-manager/pause";
/** Write the context compaction threshold into the official compaction plugin config. */
export declare const COMPACTION_THRESHOLD_ROUTE = "/dsh-session-manager/compaction-threshold";
/** Move one session into another workspace (artifact move + re-account). */
export declare const MOVE_WORKSPACE_ROUTE = "/dsh-session-manager/move-workspace";
/** Rename one session: the title is written as a durable session/title event. */
export declare const RENAME_ROUTE = "/dsh-session-manager/rename";
/** Export one session transcript as Markdown or JSON for download. */
export declare const EXPORT_ROUTE = "/dsh-session-manager/export";
/** POST /dsh-session-manager/move-workspace request body. */
export interface MoveWorkspaceRequest {
    sessionId: string;
    /** Target workspace id (registry record). */
    workspaceId: string;
}
/** POST /dsh-session-manager/delete request body. */
export interface DeleteSessionRequest {
    sessionId: string;
}
/** POST /dsh-session-manager/restore and /purge request body. */
export interface TrashActionRequest {
    sessionId: string;
}
/** One trash entry (host-side record, mirrored to the client). */
export interface TrashEntry {
    sessionId: string;
    /** Working directory at delete time, when the session had one. */
    cwd?: string;
    /** Original on-disk artifact directory, restored into on restore. */
    originalPath?: string;
    /** Epoch ms when the session was moved to the trash. */
    deletedAt: number;
}
/** POST delete/restore/purge response body. */
export interface ActionResultResponse {
    ok: boolean;
    /** Machine-readable failure reason. */
    error?: string;
    /** Human-readable failure detail (move-workspace diagnostics). */
    detail?: string;
}
/** GET /dsh-session-manager/trash response body. */
export interface TrashListResponse {
    ok: boolean;
    entries: TrashEntry[];
    /** Maximum entries kept; the oldest overflow is purged automatically. */
    limit: number;
}
/** POST /dsh-session-manager/rename request body. */
export interface RenameSessionRequest {
    sessionId: string;
    /** Raw user title text; the host normalizes acceptance. */
    title: string;
}
/** POST /dsh-session-manager/rename response body. */
export interface RenameSessionResponse {
    ok: boolean;
    /** Machine-readable failure reason. */
    error?: string;
    /** The normalized accepted title. */
    title?: string;
    /** Seq of the appended session/title event. */
    seq?: number;
}
/** POST /dsh-session-manager/export request body. */
export interface ExportSessionRequest {
    sessionId: string;
    format: 'markdown' | 'json';
}
/** POST /dsh-session-manager/export response body. */
export interface ExportSessionResponse {
    ok: boolean;
    /** Machine-readable failure reason. */
    error?: string;
    /** Echo of the requested format. */
    format?: 'markdown' | 'json';
    /** The rendered export text (Markdown or JSON). */
    content?: string;
}
//# sourceMappingURL=contract.d.ts.map