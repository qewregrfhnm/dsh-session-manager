import { WorkspaceId } from "@deepseek-ai/dsh-workspace";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
import { defineDomain } from "@deepseek-ai/dsh-storage-domain";
import { z } from "zod";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { zstdCompress } from "node:zlib";
import { basename, dirname, join } from "node:path";
//#region src/export.ts
/** Cap on rendered tool-result text so huge file dumps do not blow up the file. */
const TOOL_RESULT_MAX_CHARS = 4e3;
function pad2(n) {
	return String(n).padStart(2, "0");
}
/** Local wall-clock timestamp, 'YYYY-MM-DD HH:mm:ss'; '' for invalid input. */
function formatExportTime(ms) {
	if (!Number.isFinite(ms) || ms <= 0) return "";
	const d = new Date(ms);
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
/**
* Flatten a message's content blocks into readable text. Text blocks render
* verbatim; tool-call blocks render a marker plus pretty-printed arguments;
* nested tool-result blocks render their inner text.
*/
function messageContentText(content) {
	if (!Array.isArray(content)) return "";
	const parts = [];
	for (const block of content) {
		if (block === null || typeof block !== "object") continue;
		const b = block;
		if (b.type === "text") {
			if (typeof b.text === "string" && b.text !== "") parts.push(b.text);
		} else if (b.type === "tool_call") {
			const name = typeof b.name === "string" ? b.name : "tool";
			parts.push(`[tool call: ${name}]
${formatToolArguments(b.arguments)}`);
		} else if (b.type === "tool_result") {
			const nested = messageContentText(b.content);
			if (nested !== "") parts.push(`[tool result]
${nested}`);
		}
	}
	return parts.join("\n\n");
}
/** Pretty-print a tool call's raw JSON arguments string. */
function formatToolArguments(raw) {
	if (typeof raw !== "string") return JSON.stringify(raw ?? {}, null, 2);
	try {
		return JSON.stringify(JSON.parse(raw), null, 2);
	} catch {
		return raw;
	}
}
/** Fold the latest accepted title from the log's session/title events. */
function foldTitle(events) {
	for (let i = events.length - 1; i >= 0; i--) {
		if (events[i].type !== "session/title") continue;
		const data = events[i].data ?? {};
		if (typeof data.title === "string" && data.title !== "") return data.title;
	}
}
/**
* Render a decoded session log as a readable Markdown transcript. Messages,
* tool calls and tool results are kept; chunk/step/planning/compaction events
* are skipped because their content lands in the assembled messages.
*/
function buildSessionMarkdown(meta, events, title) {
	const out = [];
	out.push(`# ${title !== void 0 && title !== "" ? title : meta.id}`);
	out.push("");
	out.push(`- Session ID: \`${meta.id}\``);
	if (meta.cwd !== void 0) out.push(`- Working directory: \`${meta.cwd}\``);
	const created = formatExportTime(meta.createdAt ?? 0);
	if (created !== "") out.push(`- Created: ${created}`);
	if (meta.parentSession !== void 0) out.push(`- Parent session: \`${meta.parentSession}\``);
	out.push(`- Exported: ${formatExportTime(Date.now())}`);
	out.push("");
	out.push("---");
	out.push("");
	let turn = 0;
	for (const event of events) {
		const data = event.data ?? {};
		if (event.type === "turn/start") {
			turn += 1;
			out.push(`## Turn ${turn}`, "");
			continue;
		}
		if (event.type === "user/message") {
			const text = messageContentText(data.content);
			if (text !== "") {
				const stamp = formatExportTime(event.time);
				out.push(`### User${stamp !== "" ? ` · ${stamp}` : ""}`, "", text, "");
			}
			continue;
		}
		if (event.type === "assistant/message") {
			const text = messageContentText((data.message ?? {}).content);
			if (text !== "") {
				const stamp = formatExportTime(event.time);
				out.push(`### Assistant${stamp !== "" ? ` · ${stamp}` : ""}`, "", text, "");
			}
			continue;
		}
		if (event.type === "tool/call") {
			const name = typeof data.name === "string" ? data.name : "tool";
			const stamp = formatExportTime(event.time);
			out.push(`#### Tool call: ${name}${stamp !== "" ? ` · ${stamp}` : ""}`, "", "```json", formatToolArguments(data.arguments), "```", "");
			continue;
		}
		if (event.type === "tool/result") {
			const text = messageContentText((data.message ?? {}).content);
			const truncated = text.length > TOOL_RESULT_MAX_CHARS ? text.slice(0, TOOL_RESULT_MAX_CHARS) + "\n\n… (truncated)" : text;
			if (truncated !== "") {
				const stamp = formatExportTime(event.time);
				out.push(`#### Tool result${stamp !== "" ? ` · ${stamp}` : ""}`, "", truncated, "");
			}
			continue;
		}
	}
	return out.join("\n") + "\n";
}
/** Render the full decoded log as lossless JSON (header + every event). */
function buildSessionJson(meta, events) {
	return JSON.stringify({
		format: "dsh-session-export",
		version: 1,
		exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
		session: {
			id: meta.id,
			cwd: meta.cwd,
			createdAt: meta.createdAt,
			parentSession: meta.parentSession,
			agentPreset: meta.agentPreset,
			origin: meta.origin,
			delegationDepth: meta.delegationDepth,
			seedLength: meta.seedLength
		},
		events: events.map((event) => ({
			seq: event.seq,
			time: event.time,
			type: event.type,
			data: event.data
		}))
	}, null, 2);
}
//#endregion
//#region src/index.ts
const name = "dsh-session-manager";
const inject = [
	"webServer",
	"sessionPersistence",
	"workspaceRegistry",
	"agents",
	"storageDomain",
	"loader",
	"agentPresets"
];
const ROUTE_PREFIX = "/dsh-session-manager";
const MAX_BODY_BYTES = 65536;
const SESSION_ID_RE = /^(session-)?[0-9a-fA-F-]+$/;
/** Maximum trash entries kept; the oldest overflow is purged automatically. */
const TRASH_LIMIT = 10;
function openFolderCommand(platform) {
	if (platform === "win32") return "explorer";
	if (platform === "darwin") return "open";
	return "xdg-open";
}
function openFolder(path, platform = process.platform) {
	return new Promise((resolve, reject) => {
		const child = spawn(openFolderCommand(platform), [path], {
			detached: true,
			stdio: "ignore"
		});
		child.once("error", reject);
		child.once("spawn", () => {
			child.unref();
			resolve();
		});
	});
}
const trashEntrySchema = z.object({
	sessionId: z.string(),
	cwd: z.string().optional(),
	originalPath: z.string().optional(),
	deletedAt: z.number()
});
/** The plugin's storage domain: trash entries plus the compaction threshold setting. */
const trashDomainSpec = defineDomain({
	name: "dsh_delete_session",
	version: 1,
	global: {
		schema: z.object({
			entries: z.array(trashEntrySchema),
			thresholdRatio: z.number().optional()
		}),
		initial: { entries: [] }
	},
	tables: {}
});
function trashRoot() {
	return dshHomePath("dsh-delete-session-trash");
}
function trashSessionDir(sessionId) {
	return join(trashRoot(), sessionId);
}
/** Byte budget for user-supplied session titles (matches the official service's range). */
const MAX_TITLE_UTF8_BYTES = 300;
/**
* Normalize a user-supplied session title for the cold (not-live) rename
* path: strip invisible/directional controls, collapse whitespace, trim, and
* enforce the UTF-8 byte budget. The official sessionTitle service applies
* its own (equivalent) normalization on the live path.
*/
function normalizeTitle(input) {
	const cleaned = input.replace(/[\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff]/g, "").replace(/\s+/g, " ").trim();
	if (Buffer.byteLength(cleaned, "utf8") <= MAX_TITLE_UTF8_BYTES) return cleaned;
	let end = cleaned.length;
	while (end > 0 && Buffer.byteLength(cleaned.slice(0, end), "utf8") > MAX_TITLE_UTF8_BYTES) end -= 1;
	return cleaned.slice(0, end);
}
/**
* Last persisted event seq inside a raw artifact. Handles both plain event
* lines (`seq`) and packed chunk rows (`seq0` + member span) so an appended
* session/title event always continues the stored sequence — the backend
* rejects any batch whose first seq does not continue the log.
*/
function storedLastSeq(content) {
	let last = -1;
	const lines = content.split("\n");
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i].trim();
		if (line === "") continue;
		try {
			const parsed = JSON.parse(line);
			if (typeof parsed.seq === "number" && Number.isSafeInteger(parsed.seq)) {
				if (parsed.seq > last) last = parsed.seq;
			} else if (typeof parsed.seq0 === "number" && Number.isSafeInteger(parsed.seq0)) {
				const members = Array.isArray(parsed.data?.texts) ? parsed.data.texts.length : Array.isArray(parsed.data?.args) ? parsed.data.args.length : 0;
				const end = parsed.seq0 + Math.max(members, 1) - 1;
				if (end > last) last = end;
			}
		} catch {}
	}
	return last;
}
/**
* Write the title row into the persisted projection cache so cold listings
* (session.list rows) serve the renamed title without waiting for a live
* fold. The row version must match the title unit's stateVersion (1); a
* mismatched identity (deleted-then-recreated id, swapped root) discards the
* stale record instead of seeding it.
*/
async function updateProjectionTitle(ctx, id, meta, seq, title) {
	try {
		const proj = ctx.storageDomain.get("session_projcache");
		if (proj === void 0) return;
		const sessions = proj.table("sessions");
		const existing = sessions.get(id);
		const identity = {
			createdAt: meta.createdAt,
			cwd: meta.cwd
		};
		const base = existing !== void 0 && existing.identity.createdAt === meta.createdAt && existing.identity.cwd === meta.cwd ? existing.rows : {};
		await sessions.put(id, {
			identity,
			rows: {
				...base,
				title: {
					ver: 1,
					seq,
					val: title
				}
			}
		});
	} catch (error) {
		ctx.logger.warn(`[dsh-session-manager] projection cache title update failed for ${id}:`, error);
	}
}
function readJsonBody(req) {
	return new Promise((resolve, reject) => {
		let data = "";
		req.on("data", (chunk) => {
			data += chunk;
			if (data.length > MAX_BODY_BYTES) {
				req.destroy();
				reject(/* @__PURE__ */ new Error("request body too large"));
			}
		});
		req.on("end", () => {
			if (data.length === 0) return resolve({});
			try {
				resolve(JSON.parse(data));
			} catch {
				reject(/* @__PURE__ */ new Error("invalid JSON body"));
			}
		});
		req.on("error", reject);
	});
}
/** Re-throw an async failure with a step label so route diagnostics name the failing call. */
async function labeled(label, operation) {
	try {
		return await operation();
	} catch (error) {
		throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
	}
}
function respond(res, status, payload) {
	const body = JSON.stringify(payload);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(body)
	});
	res.end(body);
}
function parseSessionId(body) {
	const sessionId = body?.sessionId;
	if (typeof sessionId !== "string" || !SESSION_ID_RE.test(sessionId)) return void 0;
	return sessionId;
}
/** Resolve the active default preset through the official agent-presets service. */
function defaultPresetName(ctx) {
	const presets = ctx.get("agentPresets");
	if (typeof presets.defaultId !== "string" || presets.defaultId.length === 0) throw new Error("agent presets default id unavailable");
	return presets.defaultId;
}
/** Resolve the real composition path and trust instead of assuming a user path. */
async function resolvePresetComposition(ctx, name) {
	const preset = await ctx.get("agentPresets").resolve(name);
	if (typeof preset.path !== "string" || preset.path.length === 0) throw new Error(`agent preset composition path unavailable: ${name}`);
	if (preset.trust !== "system" && preset.trust !== "user") throw new Error(`agent preset trust unavailable: ${name}`);
	return {
		path: preset.path,
		trust: preset.trust
	};
}
/** Read `thresholdRatio` from the preset's compaction-basic block, if any. */
function parsePresetRatio(content) {
	const lines = content.split(/\r?\n/);
	const start = lines.findIndex((line) => /^\s*- id: compaction-basic\s*$/.test(line));
	if (start < 0) return void 0;
	for (let i = start + 1; i < lines.length; i++) {
		if (/^\s*- id: /.test(lines[i])) break;
		const match = lines[i].match(/^\s*thresholdRatio:\s*([0-9.]+)\s*$/);
		if (match !== null) return Number(match[1]);
	}
}
/**
* Update `thresholdRatio` inside the preset's `- id: compaction-basic` block:
* reuse the existing `config:`/`thresholdRatio:` lines or insert them with
* the block's indentation. Existing content and comments stay untouched.
*/
function upsertPresetRatio(content, newline, ratio) {
	const lines = content.split(/\r?\n/);
	const start = lines.findIndex((line) => /^\s*- id: compaction-basic\s*$/.test(line));
	if (start < 0) throw new Error("preset compaction-basic entry not found");
	const indentOf = (line) => (line.match(/^\s*/) ?? [""])[0];
	const base = indentOf(lines[start]);
	let end = lines.length;
	for (let i = start + 1; i < lines.length; i++) if (/^\s*- id: /.test(lines[i])) {
		end = i;
		break;
	}
	const configLine = `${base}  config:`;
	const ratioLine = `${base}    thresholdRatio: ${ratio}`;
	let configIdx = -1;
	for (let i = start + 1; i < end; i++) if (/^\s*config:\s*$/.test(lines[i])) {
		configIdx = i;
		break;
	}
	if (configIdx >= 0) {
		const configIndent = indentOf(lines[configIdx]);
		let ratioIdx = -1;
		for (let i = configIdx + 1; i < end; i++) {
			if (/^\s*thresholdRatio:/.test(lines[i])) {
				ratioIdx = i;
				break;
			}
			if (indentOf(lines[i]).length <= configIndent.length && /^\S/.test(lines[i])) break;
		}
		if (ratioIdx >= 0) lines[ratioIdx] = `${configIndent}  thresholdRatio: ${ratio}`;
		else lines.splice(configIdx + 1, 0, `${configIndent}  thresholdRatio: ${ratio}`);
	} else lines.splice(end, 0, configLine, ratioLine);
	return lines.join(newline);
}
/** Read the preset file, atomically write the updated content back. */
async function writePresetComposition(path, ratio) {
	let content;
	try {
		content = await readFile(path, "utf8");
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
		throw new Error(`preset composition file not found: ${path}`);
	}
	const newline = content.includes("\r\n") ? "\r\n" : "\n";
	let next = upsertPresetRatio(content, newline, ratio);
	if (!next.endsWith(newline)) next += newline;
	const tmp = `${path}.tmp`;
	await writeFile(tmp, next, "utf8");
	await rename(tmp, path);
}
/**
* Sync the WorkspaceRegistry's private state cache with the durable domain
* value. There is no public unarchive API; writing the domain directly leaves
* the registry's cached state stale, so the next archiveSession() call would
* idempotently skip on the old value. This pokes the private field to keep
* both in lockstep. Fragile against a DSH upgrade, but the alternative is
* silent un-archives/archives that disagree with what clients see.
*/
function syncRegistryState(ctx, next) {
	const registry = ctx.workspaceRegistry;
	if (registry !== void 0 && "state" in registry) registry.state = next;
}
/** Remove one session id from the workspace archive set through the domain. */
async function unarchive(ctx, sessionId) {
	const workspace = ctx.storageDomain.get("workspace");
	if (workspace === void 0) return;
	const state = workspace.global.get();
	if (!state.archivedSessionIds.includes(sessionId)) return;
	const next = {
		...state,
		archivedSessionIds: state.archivedSessionIds.filter((id) => id !== sessionId)
	};
	await workspace.global.set(next);
	syncRegistryState(ctx, next);
}
/**
* Apply a new threshold to the compaction engines of already-open sessions.
* Sessions using the same preset share one engine in the preset's isolated
* realm; the agentPresets service's `serviceFor` is the official channel
* that reaches it (called on the HOST's service instance, so module state is
* shared). The engine reads `this.config` at every decision, so updating the
* resolved threshold field takes effect immediately. Best-effort: failures
* only warn.
*/
async function applyThresholdToLiveAgents(ctx, ratio) {
	try {
		const presets = ctx.get("agentPresets");
		if (presets?.serviceFor === void 0) return;
		const headers = await ctx.sessionPersistence.list();
		for (const header of headers) {
			const agent = ctx.agents.get(header.id);
			if (agent === void 0) continue;
			const engine = presets.serviceFor(agent, "compaction");
			if (engine === void 0 || engine.config === void 0) continue;
			engine.config.thresholdRatio = ratio;
		}
	} catch (error) {
		ctx.logger.warn("[dsh-session-manager] live-agent threshold update failed:", error);
	}
}
function apply(ctx) {
	return ctx.storageDomain.open(trashDomainSpec).then((trash) => {
		const getEntries = () => trash.global.get().entries;
		const setEntries = (entries) => {
			const current = trash.global.get();
			return trash.global.set({
				...current,
				entries
			}).catch((error) => {
				ctx.logger.warn("[dsh-session-manager] trash persist failed:", error);
				throw error;
			});
		};
		let mutationTail = Promise.resolve();
		const withMutationLock = (operation) => {
			const result = mutationTail.then(operation, operation);
			mutationTail = result.then(() => void 0, () => void 0);
			return result;
		};
		let configuredThreshold = trash.global.get().thresholdRatio ?? null;
		const setConfiguredThreshold = async (ratio) => {
			const current = trash.global.get();
			await trash.global.set({
				...current,
				thresholdRatio: ratio
			}).catch((error) => {
				ctx.logger.warn("[dsh-session-manager] threshold persist failed:", error);
				throw error;
			});
			configuredThreshold = ratio;
		};
		{
			const presets = ctx.get("agentPresets");
			ctx.on("agent/pre-step", async ({ agent }, next) => {
				try {
					if (configuredThreshold !== null && presets?.serviceFor !== void 0) {
						const engine = presets.serviceFor(agent, "compaction");
						if (engine?.config !== void 0 && engine.config.thresholdRatio !== configuredThreshold) engine.config.thresholdRatio = configuredThreshold;
					}
				} catch {}
				return next();
			}, { prepend: true });
		}
		ctx.webServer.register({
			kind: "exact",
			path: `${ROUTE_PREFIX}/delete`,
			handler: async (req, res) => {
				if (req.method !== "POST") return respond(res, 405, {
					ok: false,
					error: "method-not-allowed"
				});
				let body;
				try {
					body = await readJsonBody(req);
				} catch {
					return respond(res, 400, {
						ok: false,
						error: "bad-request"
					});
				}
				const id = parseSessionId(body);
				if (id === void 0) return respond(res, 400, {
					ok: false,
					error: "invalid-session-id"
				});
				try {
					await withMutationLock(async () => {
						const meta = (await ctx.sessionPersistence.list()).find((header) => header.id === id);
						const agent = ctx.agents.get(id);
						const live = agent !== void 0;
						if (agent?.status === "running") {
							respond(res, 409, {
								ok: false,
								error: "session-live"
							});
							return;
						}
						let originalPath;
						if (meta !== void 0) {
							const location = ctx.sessionPersistence.locate(meta);
							if (location === void 0) {
								respond(res, 500, {
									ok: false,
									error: "no-artifact-location"
								});
								return;
							}
							originalPath = dirname(location.path);
						}
						const workspace = ctx.storageDomain.get("workspace");
						const wasArchived = workspace !== void 0 && workspace.global.get().archivedSessionIds.includes(id);
						const trashPath = trashSessionDir(id);
						let archiveStarted = false;
						let artifactMoved = false;
						let failureCode = "delete-failed";
						try {
							failureCode = "archive-failed";
							archiveStarted = true;
							await ctx.workspaceRegistry.archiveSession(id);
							failureCode = "delete-failed";
							{
								const currentWorkspace = ctx.storageDomain.get("workspace");
								if (currentWorkspace !== void 0) {
									const current = currentWorkspace.global.get();
									if (!current.archivedSessionIds.includes(id)) {
										const next = {
											...current,
											archivedSessionIds: [...current.archivedSessionIds, id]
										};
										await currentWorkspace.global.set(next);
										syncRegistryState(ctx, next);
										ctx.logger.debug(`[dsh-session-manager] patched archived set for ${id} (stale registry cache)`);
									}
								}
							}
							if (!live && originalPath !== void 0 && existsSync(originalPath)) {
								await mkdir(trashRoot(), { recursive: true });
								await rm(trashPath, {
									recursive: true,
									force: true
								});
								await rename(originalPath, trashPath);
								artifactMoved = true;
								ctx.logger.debug(`[dsh-session-manager] moved ${id} artifact to trash`);
							}
							const entries = getEntries();
							const existingIndex = entries.findIndex((entry) => entry.sessionId === id);
							let next;
							let overflow = [];
							if (existingIndex >= 0) next = entries.map((entry, index) => index === existingIndex ? {
								...entry,
								deletedAt: Date.now()
							} : entry);
							else {
								next = [...entries, {
									sessionId: id,
									cwd: meta?.cwd,
									originalPath,
									deletedAt: Date.now()
								}];
								if (next.length > 10) {
									overflow = next.slice(0, next.length - 10);
									next = next.slice(next.length - 10);
								}
							}
							await setEntries(next);
							for (const entry of overflow) await rm(trashSessionDir(entry.sessionId), {
								recursive: true,
								force: true
							}).catch(() => {});
							respond(res, 200, { ok: true });
						} catch (error) {
							if (artifactMoved && originalPath !== void 0 && existsSync(trashPath) && !existsSync(originalPath)) try {
								await mkdir(dirname(originalPath), { recursive: true });
								await rename(trashPath, originalPath);
							} catch (rollbackError) {
								ctx.logger.warn(`[dsh-session-manager] artifact rollback failed for ${id}:`, rollbackError);
							}
							if (archiveStarted && !wasArchived) try {
								await unarchive(ctx, id);
							} catch (rollbackError) {
								ctx.logger.warn(`[dsh-session-manager] archive rollback failed for ${id}:`, rollbackError);
							}
							ctx.logger.warn(`[dsh-session-manager] ${failureCode} for ${id}:`, error);
							respond(res, 500, {
								ok: false,
								error: failureCode
							});
						}
					});
				} catch (error) {
					ctx.logger.warn("[dsh-session-manager] delete failed:", error);
					respond(res, 500, {
						ok: false,
						error: "delete-failed"
					});
				}
			}
		});
		ctx.webServer.register({
			kind: "exact",
			path: `${ROUTE_PREFIX}/restore`,
			handler: async (req, res) => {
				if (req.method !== "POST") return respond(res, 405, {
					ok: false,
					error: "method-not-allowed"
				});
				let body;
				try {
					body = await readJsonBody(req);
				} catch {
					return respond(res, 400, {
						ok: false,
						error: "bad-request"
					});
				}
				const id = parseSessionId(body);
				if (id === void 0) return respond(res, 400, {
					ok: false,
					error: "invalid-session-id"
				});
				try {
					await withMutationLock(async () => {
						const entries = getEntries();
						const entry = entries.find((candidate) => candidate.sessionId === id);
						if (entry === void 0) {
							const meta = (await ctx.sessionPersistence.list()).find((header) => header.id === id);
							const agent = ctx.agents.get(id);
							if (meta === void 0 && agent === void 0) return respond(res, 404, {
								ok: false,
								error: "trash-entry-not-found"
							});
							await unarchive(ctx, id);
							ctx.logger.debug(`[dsh-session-manager] restore ${id}: no trash entry, un-archived only`);
							return respond(res, 200, { ok: true });
						}
						const from = trashSessionDir(id);
						if (existsSync(from)) {
							if (entry.originalPath === void 0) {
								ctx.logger.warn(`[dsh-session-manager] restore ${id}: artifact exists in trash but entry has no original path`);
								return respond(res, 500, {
									ok: false,
									error: "no-original-path"
								});
							}
							if (existsSync(entry.originalPath)) {
								await rm(from, {
									recursive: true,
									force: true
								});
								ctx.logger.warn(`[dsh-session-manager] restore ${id}: original path already exists, discarding trash copy`);
							} else {
								await mkdir(dirname(entry.originalPath), { recursive: true });
								await rename(from, entry.originalPath);
								ctx.logger.debug(`[dsh-session-manager] restored ${id} artifact from trash`);
							}
						} else ctx.logger.debug(`[dsh-session-manager] restore ${id}: no artifact in trash (live or blank session)`);
						await unarchive(ctx, id);
						await setEntries(entries.filter((candidate) => candidate.sessionId !== id));
						respond(res, 200, { ok: true });
					});
				} catch (error) {
					ctx.logger.warn("[dsh-session-manager] restore failed:", error);
					respond(res, 500, {
						ok: false,
						error: "restore-failed"
					});
				}
			}
		});
		ctx.webServer.register({
			kind: "exact",
			path: `${ROUTE_PREFIX}/purge`,
			handler: async (req, res) => {
				if (req.method !== "POST") return respond(res, 405, {
					ok: false,
					error: "method-not-allowed"
				});
				let body;
				try {
					body = await readJsonBody(req);
				} catch {
					return respond(res, 400, {
						ok: false,
						error: "bad-request"
					});
				}
				const id = parseSessionId(body);
				if (id === void 0) return respond(res, 400, {
					ok: false,
					error: "invalid-session-id"
				});
				try {
					await withMutationLock(async () => {
						const entries = getEntries();
						const entry = entries.find((candidate) => candidate.sessionId === id);
						if (entry === void 0) {
							respond(res, 404, {
								ok: false,
								error: "trash-entry-not-found"
							});
							return;
						}
						await rm(trashSessionDir(id), {
							recursive: true,
							force: true
						});
						if (entry.originalPath !== void 0) await rm(entry.originalPath, {
							recursive: true,
							force: true
						});
						await setEntries(entries.filter((candidate) => candidate.sessionId !== id));
						respond(res, 200, { ok: true });
					});
				} catch (error) {
					ctx.logger.warn("[dsh-session-manager] purge failed:", error);
					respond(res, 500, {
						ok: false,
						error: "purge-failed"
					});
				}
			}
		});
		ctx.webServer.register({
			kind: "exact",
			path: `${ROUTE_PREFIX}/pause`,
			handler: async (req, res) => {
				if (req.method !== "POST") return respond(res, 405, {
					ok: false,
					error: "method-not-allowed"
				});
				let body;
				try {
					body = await readJsonBody(req);
				} catch {
					return respond(res, 400, {
						ok: false,
						error: "bad-request"
					});
				}
				const id = parseSessionId(body);
				if (id === void 0) return respond(res, 400, {
					ok: false,
					error: "invalid-session-id"
				});
				try {
					const agent = ctx.agents.get(id);
					if (agent === void 0) return respond(res, 404, {
						ok: false,
						error: "agent-not-found"
					});
					agent.cancel({ kind: "user" });
					respond(res, 200, { ok: true });
				} catch (error) {
					ctx.logger.warn("[dsh-session-manager] pause failed:", error);
					respond(res, 500, {
						ok: false,
						error: "pause-failed"
					});
				}
			}
		});
		ctx.webServer.register({
			kind: "exact",
			path: `${ROUTE_PREFIX}/trash`,
			handler: async (_req, res) => {
				try {
					respond(res, 200, {
						ok: true,
						entries: getEntries(),
						limit: 10
					});
				} catch (error) {
					ctx.logger.warn("[dsh-session-manager] trash list failed:", error);
					respond(res, 500, {
						ok: false,
						error: "trash-list-failed"
					});
				}
			}
		});
		ctx.webServer.register({
			kind: "exact",
			path: `${ROUTE_PREFIX}/compaction-threshold`,
			handler: async (req, res) => {
				if (req.method === "GET") {
					let ratio = configuredThreshold;
					if (ratio === null) try {
						const preset = await resolvePresetComposition(ctx, defaultPresetName(ctx));
						ratio = parsePresetRatio(await readFile(preset.path, "utf8")) ?? .8;
					} catch {
						ratio = .8;
					}
					respond(res, 200, {
						ok: true,
						ratio
					});
					return;
				}
				if (req.method !== "POST") return respond(res, 405, {
					ok: false,
					error: "method-not-allowed"
				});
				let body;
				try {
					body = await readJsonBody(req);
				} catch {
					return respond(res, 400, {
						ok: false,
						error: "bad-request"
					});
				}
				const ratio = body?.ratio;
				if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio < .17 || ratio > .9) return respond(res, 400, {
					ok: false,
					error: "invalid-ratio"
				});
				try {
					await withMutationLock(async () => {
						await setConfiguredThreshold(ratio);
						const preset = await resolvePresetComposition(ctx, defaultPresetName(ctx));
						if (preset.trust !== "system") await writePresetComposition(preset.path, ratio);
						await applyThresholdToLiveAgents(ctx, ratio);
						respond(res, 200, { ok: true });
					});
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					ctx.logger.warn("[dsh-session-manager] compaction-threshold update failed:", error);
					respond(res, 500, {
						ok: false,
						error: message
					});
				}
			}
		});
		ctx.webServer.register({
			kind: "exact",
			path: `${ROUTE_PREFIX}/open-folder`,
			handler: async (req, res) => {
				if (req.method !== "POST") return respond(res, 405, {
					ok: false,
					error: "method-not-allowed"
				});
				let body;
				try {
					body = await readJsonBody(req);
				} catch {
					return respond(res, 400, {
						ok: false,
						error: "bad-request"
					});
				}
				const id = parseSessionId(body);
				if (id === void 0) return respond(res, 400, {
					ok: false,
					error: "invalid-session-id"
				});
				try {
					let dir;
					const meta = (await ctx.sessionPersistence.list()).find((header) => header.id === id);
					if (meta !== void 0) {
						const location = ctx.sessionPersistence.locate(meta);
						if (location !== void 0) dir = dirname(location.path);
					}
					if (dir === void 0 || !existsSync(dir)) {
						const entry = getEntries().find((candidate) => candidate.sessionId === id);
						if (entry?.originalPath !== void 0 && existsSync(entry.originalPath)) dir = entry.originalPath;
					}
					if (dir === void 0 || !existsSync(dir)) return respond(res, 404, {
						ok: false,
						error: "folder-not-found"
					});
					await openFolder(dir);
					respond(res, 200, { ok: true });
				} catch (error) {
					ctx.logger.warn("[dsh-session-manager] open-folder failed:", error);
					respond(res, 500, {
						ok: false,
						error: "open-folder-failed"
					});
				}
			}
		});
		ctx.webServer.register({
			kind: "exact",
			path: `${ROUTE_PREFIX}/move-workspace`,
			handler: async (req, res) => {
				if (req.method !== "POST") return respond(res, 405, {
					ok: false,
					error: "method-not-allowed"
				});
				let body;
				try {
					body = await readJsonBody(req);
				} catch {
					return respond(res, 400, {
						ok: false,
						error: "bad-request"
					});
				}
				const id = parseSessionId(body);
				const rawWorkspaceId = body?.workspaceId;
				const workspaceId = typeof rawWorkspaceId === "string" && /^[0-9a-fA-F-]+$/.test(rawWorkspaceId) ? WorkspaceId(rawWorkspaceId) : void 0;
				if (id === void 0 || workspaceId === void 0) return respond(res, 400, {
					ok: false,
					error: "invalid-request"
				});
				try {
					await withMutationLock(async () => {
						if (ctx.agents.get(id) !== void 0) {
							respond(res, 409, {
								ok: false,
								error: "session-live"
							});
							return;
						}
						const meta = (await labeled("list", () => ctx.sessionPersistence.list())).find((header) => header.id === id);
						if (meta === void 0) {
							respond(res, 404, {
								ok: false,
								error: "session-not-found"
							});
							return;
						}
						if (meta.cwd === void 0) {
							respond(res, 400, {
								ok: false,
								error: "no-cwd"
							});
							return;
						}
						const target = ctx.workspaceRegistry.get(workspaceId);
						if (target === void 0) {
							respond(res, 404, {
								ok: false,
								error: "workspace-not-found"
							});
							return;
						}
						const location = ctx.sessionPersistence.locate(meta);
						if (location === void 0) {
							respond(res, 500, {
								ok: false,
								error: "no-artifact-location"
							});
							return;
						}
						const srcDir = dirname(location.path);
						const artifactName = basename(location.path);
						const targetLocation = ctx.sessionPersistence.locate({
							...meta,
							cwd: target.path
						});
						if (targetLocation === void 0) {
							respond(res, 500, {
								ok: false,
								error: "no-artifact-location"
							});
							return;
						}
						const targetDir = dirname(targetLocation.path);
						if (targetDir === srcDir) {
							respond(res, 200, { ok: true });
							return;
						}
						if (!existsSync(srcDir)) {
							respond(res, 404, {
								ok: false,
								error: "session-dir-not-found"
							});
							return;
						}
						if (existsSync(targetDir)) {
							respond(res, 409, {
								ok: false,
								error: "target-exists"
							});
							return;
						}
						let originalBytes;
						let moved = false;
						let written = false;
						try {
							originalBytes = await readFile(join(srcDir, artifactName));
							const raw = await labeled("readRaw", () => ctx.sessionPersistence.readRaw(id));
							if (raw === void 0) throw new Error(`no raw artifact for ${id}`);
							const lines = raw.content.split("\n");
							const header = JSON.parse(lines[0]);
							lines[0] = JSON.stringify({
								...header,
								cwd: target.path
							});
							const headerBytes = Buffer.from(lines[0] + "\n", "utf8");
							const restBytes = Buffer.from(lines.slice(1).join("\n"), "utf8");
							const headerFrame = await promisify(zstdCompress)(headerBytes);
							const eventFrame = restBytes.length > 0 ? await promisify(zstdCompress)(restBytes) : void 0;
							const compressed = eventFrame === void 0 ? headerFrame : Buffer.concat([headerFrame, eventFrame]);
							await mkdir(dirname(targetDir), { recursive: true });
							await rename(srcDir, targetDir);
							moved = true;
							const targetArtifact = join(targetDir, artifactName);
							const tmp = targetArtifact + ".move-tmp";
							await writeFile(tmp, compressed);
							await rename(tmp, targetArtifact);
							written = true;
							ctx.workspaceRegistry.headers?.delete(id);
							const oldEntity = ctx.workspaceRegistry.list().find((ws) => ws.sessionIds.includes(id));
							if (oldEntity !== void 0 && oldEntity.id !== target.id) await oldEntity.detachSession(id);
							if (oldEntity?.id !== target.id) await labeled("attachSession", () => target.attachSession(id));
							ctx.logger.info(`[dsh-session-manager] moved ${id} to workspace ${target.id} (${target.path})`);
							respond(res, 200, { ok: true });
						} catch (error) {
							if (moved && !existsSync(srcDir)) try {
								if (existsSync(targetDir)) {
									await mkdir(dirname(srcDir), { recursive: true });
									await rename(targetDir, srcDir);
								}
							} catch (rollbackError) {
								ctx.logger.warn(`[dsh-session-manager] move rollback (dir) failed for ${id}:`, rollbackError);
							}
							if (moved && written && originalBytes !== void 0 && existsSync(srcDir)) try {
								await writeFile(join(srcDir, artifactName), originalBytes);
							} catch (rollbackError) {
								ctx.logger.warn(`[dsh-session-manager] move rollback (artifact) failed for ${id}:`, rollbackError);
							}
							const detail = error instanceof Error ? error.stack ?? error.message : String(error);
							ctx.logger.warn(`[dsh-session-manager] move-workspace failed for ${id}: ${detail}`);
							respond(res, 500, {
								ok: false,
								error: "move-failed",
								detail
							});
						}
					});
				} catch (error) {
					const detail = error instanceof Error ? error.message : String(error);
					ctx.logger.warn("[dsh-session-manager] move-workspace failed:", error);
					respond(res, 500, {
						ok: false,
						error: "move-failed",
						detail
					});
				}
			}
		});
		ctx.webServer.register({
			kind: "exact",
			path: `${ROUTE_PREFIX}/rename`,
			handler: async (req, res) => {
				if (req.method !== "POST") return respond(res, 405, {
					ok: false,
					error: "method-not-allowed"
				});
				let body;
				try {
					body = await readJsonBody(req);
				} catch {
					return respond(res, 400, {
						ok: false,
						error: "bad-request"
					});
				}
				const id = parseSessionId(body);
				const rawTitle = body?.title;
				if (id === void 0 || typeof rawTitle !== "string" || rawTitle.trim() === "") return respond(res, 400, {
					ok: false,
					error: "title-invalid"
				});
				try {
					await withMutationLock(async () => {
						const agent = ctx.agents.get(id);
						if (agent !== void 0) {
							const titles = ctx.get("sessionTitle");
							const session = agent.session;
							if (titles === void 0 || session === void 0) return respond(res, 500, {
								ok: false,
								error: "title-unavailable"
							});
							try {
								const accepted = titles.rename(session, rawTitle);
								ctx.logger.info(`[dsh-session-manager] renamed live ${id} to "${accepted.title}"`);
								return respond(res, 200, {
									ok: true,
									title: accepted.title,
									seq: accepted.eventSeq
								});
							} catch (error) {
								if (error instanceof Error && error.name === "SessionTitleInvalidError") return respond(res, 400, {
									ok: false,
									error: "title-invalid"
								});
								throw error;
							}
						}
						const title = normalizeTitle(rawTitle);
						if (title === "") return respond(res, 400, {
							ok: false,
							error: "title-invalid"
						});
						const meta = (await labeled("list", () => ctx.sessionPersistence.list())).find((header) => header.id === id);
						if (meta === void 0) return respond(res, 404, {
							ok: false,
							error: "session-not-found"
						});
						const raw = await labeled("readRaw", () => ctx.sessionPersistence.readRaw(id));
						if (raw === void 0) return respond(res, 404, {
							ok: false,
							error: "no-artifact"
						});
						const nextSeq = storedLastSeq(raw.content) + 1;
						const line = JSON.stringify({
							seq: nextSeq,
							time: Date.now(),
							type: "session/title",
							data: {
								title,
								messageSeqs: [],
								source: { kind: "user" }
							}
						});
						const lines = raw.content.split("\n");
						while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
						if (lines.length === 0) return respond(res, 500, {
							ok: false,
							error: "empty-artifact"
						});
						const headerLine = lines[0];
						const restLines = lines.slice(1);
						restLines.push(line);
						const headerFrame = await promisify(zstdCompress)(Buffer.from(headerLine + "\n", "utf8"));
						const eventFrame = await promisify(zstdCompress)(Buffer.from(restLines.join("\n") + "\n", "utf8"));
						const compressed = Buffer.concat([headerFrame, eventFrame]);
						const location = ctx.sessionPersistence.locate(meta);
						if (location === void 0) return respond(res, 500, {
							ok: false,
							error: "no-artifact-location"
						});
						const tmp = location.path + ".rename-tmp";
						await writeFile(tmp, compressed);
						await rename(tmp, location.path);
						await updateProjectionTitle(ctx, id, meta, nextSeq, title);
						ctx.logger.info(`[dsh-session-manager] renamed ${id} to "${title}"`);
						respond(res, 200, {
							ok: true,
							title,
							seq: nextSeq
						});
					});
				} catch (error) {
					ctx.logger.warn("[dsh-session-manager] rename failed:", error);
					respond(res, 500, {
						ok: false,
						error: "rename-failed"
					});
				}
			}
		});
		ctx.webServer.register({
			kind: "exact",
			path: `${ROUTE_PREFIX}/export`,
			handler: async (req, res) => {
				if (req.method !== "POST") return respond(res, 405, {
					ok: false,
					error: "method-not-allowed"
				});
				let body;
				try {
					body = await readJsonBody(req);
				} catch {
					return respond(res, 400, {
						ok: false,
						error: "bad-request"
					});
				}
				const id = parseSessionId(body);
				const rawFormat = body?.format;
				if (id === void 0 || rawFormat !== "markdown" && rawFormat !== "json") return respond(res, 400, {
					ok: false,
					error: "invalid-request"
				});
				const format = rawFormat;
				try {
					const inspection = await labeled("inspect", () => ctx.sessionPersistence.inspect(id));
					const title = foldTitle(inspection.events);
					respond(res, 200, {
						ok: true,
						format,
						content: format === "json" ? buildSessionJson(inspection.meta, inspection.events) : buildSessionMarkdown(inspection.meta, inspection.events, title)
					});
				} catch (error) {
					ctx.logger.warn(`[dsh-session-manager] export failed for ${id}:`, error);
					respond(res, 500, {
						ok: false,
						error: "export-failed"
					});
				}
			}
		});
		return () => trash.close();
	});
}
//#endregion
export { TRASH_LIMIT, apply, inject, name, openFolderCommand };
