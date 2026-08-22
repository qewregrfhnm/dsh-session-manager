# dsh-session-manager

English | [中文](README.md)

A full-featured session manager for the DeepSeek Harness Web UI, reachable from both the Settings page and the conversation header: delete (trash / restore / purge), restore archived sessions, recent-activity stats, continue / pause, open the log folder, unread markers, fork into a new chat, workspace grouping & sorting, **move sessions to another workspace**, and a global context-compaction threshold. No harness changes.

## Features

- Dedicated **Session Manager** section in Settings (a sibling of Notifications)
- Lists all sessions (title / working directory); archived sessions in a collapsible footer area with **one-click restore**
- **Trash**: deleted sessions move to a trash area (keeps the latest 10, auto-evicts the oldest), with **restore** or **purge**
- **Stats**: per-session modal with recent activity (rounds / user messages / assistant messages / tool calls / activity window)
- **Continue**: open a session and close the panel; **Pause**: stop the running round of a live session
- **Unread / read** state dots: blue = manually unread, amber = official waiting-for-input, green = official completion notice, spinner = running; click an official dot to mark read in place; the official sidebar row gets a blue dot too
- **Fork into a new chat**: one-click `sessions.fork` per session
- **Open log folder** in the system file manager
- **Delete this chat** button in the conversation header
- **Session drawer** (pinnable, closes on outside click) with a per-row **More** menu: stats / folder / fork / **Move to…**
- **Workspace management**: sessions grouped by workspace, sortable by last-used (newest/oldest), drag workspace headers to reorder (insert / swap / move to end), hover actions: pin to top / rename / delete
- **Move to workspace**: move any non-live session (log folder, session-header cwd, and workspace bookkeeping) into another registered workspace — effective immediately, survives restarts
- **Search & filter**: a top search box filters by title / working directory in real time, plus status chips (All / Running / Unread / Archived)
- **Drag to move**: drag a session row onto a target workspace header to move it (drop target highlights); running sessions are not draggable
- **Batch move**: select several sessions, click "Move to…" and pick a target workspace to move them at once (running sessions are skipped and reported)
- **Move to a new workspace**: the "Move to…" menu gains "＋ New workspace (session directory)" — registers the session's own working directory as a workspace and moves it there, giving unregistered-path sessions a home
- **Context-compaction threshold** (General settings): auto-compact at 17%–90% of the model window (1M tokens), keeping the latest 16% verbatim; applies to **all agent presets** (saved instantly + persisted + reapplied on restart)
- Deletion is blocked only for sessions currently thinking; the currently open (idle) session can be deleted
- Subagent sessions can be deleted (when not running), including orphaned subagents whose parent is gone
- UI language follows the DSH locale (zh / en)

## Install

### Requirements

- DSH CLI installed globally (`npm i -g @deepseek-ai/dsh`), `0.1.0-rc.6` or a same-generation `0.1.x` rc
- Node.js `^22.19.0 || >=24.0.0`, pnpm `>=9` (DSH CLI forwards plugin management to pnpm)

### From a GitHub Release (recommended)

Replace `<user>` with the GitHub user/org that owns the repo:

```sh
dsh plugin --profile web add 'https://github.com/<user>/dsh-session-manager/releases/download/v0.3.0/dsh-session-manager-0.3.0.tgz'
```

### From a GitHub tag

```sh
dsh plugin --profile web add 'github:<user>/dsh-session-manager#v0.3.0'
```

### From a local directory / tarball

```sh
dsh plugin --profile web add /absolute/path/to/dsh-session-manager
# or, after pnpm pack
dsh plugin --profile web add /absolute/path/to/dsh-session-manager-0.3.0.tgz
```

> **Manual install (fallback if `dsh plugin` is unavailable)**: `dsh plugin` just forwards to pnpm inside the profile directory and syncs `dsh.profile.bundles`. To do it by hand:
> 1. `cd ~/.dsh/profiles/web && pnpm add <spec-from-above>`
> 2. Edit `package.json` and append `"dsh-session-manager"` to `dsh.profile.bundles`
>
> **Restart `dsh web`** after installing (host plugin and the client bundle are loaded at boot).

## Usage

### Session Manager in Settings

1. Open **Settings** (gear icon) in the sidebar
2. A dedicated **Session Manager** section appears in the left nav
3. Main list = active sessions; bottom collapsible **Archived** area for restore / delete
4. Delete → session goes to the **Trash** collapsible (keeps latest 10)
5. Trash: **Restore** (back to the list) or **Purge** (permanent)
6. Rows keep a single **Delete** button; everything else lives in the **More** menu: Continue / Pause / Restore (archived) / Fork / Stats / Folder / Move to… — session names are no longer covered by buttons
7. The top **search box** filters by title / directory; **status chips**: All / Running / Unread / Archived
8. **Drag a session row** onto a workspace header to move it (dashed highlight); **batch move**: select rows, click "Move to…" and pick a workspace
9. The "Move to…" menu's **＋ New workspace (session directory)** registers the session's original directory as a new workspace and moves it in
7. Workspace header hover actions: **pin to top** / **rename** / **delete**
8. Drag workspace headers to reorder (insert above/below, swap on top, drop to end)
9. Sort toggle: newest-first / oldest-first

### Move a session to another workspace

1. Open **Settings → Session Manager**, or the **Session drawer** from a conversation header
2. On the row, open **More → Move to…** and pick the target workspace
3. The session immediately appears under the target workspace; the log folder, session-header cwd, and workspace bookkeeping are updated atomically and survive restarts

> Move limits:
> - **Running / loaded (live) sessions cannot be moved** — pause first, or restart `dsh web` to unload them
> - Targets are **registered workspaces only**; an ungrouped session can be moved into a workspace, but paths outside the registered workspaces are not available as targets

### General settings: context-compaction threshold

1. **Settings → General**
2. Set 17%–90% via slider / input
3. Takes effect immediately (including open sessions), applies to all agent presets, survives restarts

### Conversation-header shortcuts

Top-right of any conversation (left of the session log): **Session drawer** (pinnable), **Trash**, **Delete this chat** (red).

### Unread / read dots

Blue = manually unread, amber = official waiting-for-input, green = official completion notice, spinner = running. Click amber/green to mark read in place; click blue to clear; click blank to mark unread; opening a session marks it read. The official sidebar row shows a matching blue dot (matched by title text).

## How it works

| Layer | Implementation |
|---|---|
| Host | `src/index.ts` registers 8 routes: `POST /delete`, `POST /restore`, `POST /purge`, `GET /trash`, `POST /open-folder`, `POST /pause`, `POST /move-workspace`, `GET|POST /compaction-threshold`. Uses `ctx.sessionPersistence`, `ctx.workspaceRegistry`, `ctx.storageDomain`, `ctx.agentPresets`, `ctx.agents` (rejects delete/move of live sessions) |
| Client | `src/client/index.ts` registers a Settings section via the official `settings.section` slot, lists sessions via `useSessions` / `useWorkspaces`, calls host routes; the drawer subscribes via `sessions.list` (ObservableSnapshot); purged ids are remembered in localStorage so live sessions do not "resurrect" after a refresh |

- **Unread**: manual unread set is stored in the shared localStorage key `dsh.session-unread.v1`; official dots are driven by `pendingInteraction` / `completed` / `running`; the sidebar dot is a MutationObserver decoration matched by title text
- **Move to workspace**: the host reads the raw zstd session log, rewrites the **first frame** to contain exactly the one-line session header (with `cwd` updated to the target workspace path) and keeps the event frames untouched (DSH requires the first frame to be exactly one header line; a single-frame rewrite is rejected as corrupt). The log directory is renamed into the target workspace, then the rewritten file is written back; finally workspace bookkeeping is updated (detach from the old group, attach to the new one). Any failure rolls back: **rename the directory back first**, then restore the original bytes — never delete-then-rename
- **Compaction threshold**: persisted in the `dsh_delete_session` storage domain; for a user default preset it is also written to the resolved `agent.cordis.yml` (system presets stay read-only). The host applies it to every preset's compaction config in the `agent/pre-step` hook
- Deletes go through the official archive channel first, so the sidebar hides the session immediately
- Trash entries live in `~/.dsh/storages/dsh_delete_session.json`; files in `~/.dsh/dsh-delete-session-trash/`
- Workspace bookkeeping is reconciled by the registry's reindex on next boot
- No system-prompt changes, no new model tools — zero impact on tokens and model behavior

## Privacy & security

- **Fully local**: every operation (delete, restore, move, stats, threshold) touches only files under `~/.dsh` and browser localStorage — **no telemetry, no analytics, no network requests**
- Moving a session merely relocates the local log directory and updates metadata; nothing is uploaded
- The plugin never modifies DSH core; uninstalling it leaves all sessions untouched

## Limitations

- Running sessions cannot be deleted (button disabled + server-side refusal)
- Running / loaded (live) sessions cannot be moved — pause first, or restart `dsh web` to unload
- Subagent sessions can be deleted (when not running), including orphans
- Purged session ids remain in localStorage (prevents refresh resurrection) and in the archive set (harmless)
- Sidebar unread dots match by title text; duplicate titles share a dot (the drawer matches by real session id and is unaffected)

## Compatibility

Currently targets DSH `0.1.0-rc.6` (uses the `settings.section` / `settings.general.item` / `conversation.session.header.utilities` slots and the `ctx.sessionPersistence` / `ctx.workspaceRegistry` / `ctx.agents` / `ctx.storageDomain` / `ctx.agentPresets` services; runtime `@deepseek-ai/*` packages are provided by the DSH host and resolved from the global install). Adaptations may be needed after DSH upgrades change slots or service APIs.

## Development

```sh
pnpm install        # deps come from the npm registry — builds on any machine
pnpm run check      # typecheck + test + build
pnpm pack           # produces dsh-session-manager-0.3.0.tgz (for GitHub Releases)
```

`lib/` is committed build output — rebuild and commit it after source changes (so `github:` installs work without a build step).

## Credits

Forked from [dream12347/dsh-session-manager](https://github.com/dream12347/dsh-session-manager) (MIT), adding "move to workspace" plus related fixes on top of all original features. Original author & contributors: [dream12347](https://github.com/dream12347), [DoggyHU](https://github.com/DoggyHU), [cmj799](https://github.com/cmj799), [Chen5173](https://github.com/Chen5173).

<sub><span style="opacity:.6">If you find this useful, a ⭐ would be appreciated!</span></sub>
