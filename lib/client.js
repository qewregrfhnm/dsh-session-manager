window.__ModuleLoader__.load({
	id: "dsh-session-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react = require("react");
		let react_dom = require("react-dom");
		//#region src/contract.ts
		/**
		* Wire contract shared by the host routes and the web client panel.
		* Both halves only exchange JSON, so the contract is types plus route
		* constants — no runtime import crosses the boundary.
		*/
		/** The host route the client panel calls to delete (move to trash) one session. */
		const DELETE_ROUTE = "/dsh-session-manager/delete";
		/** Restore one session from the trash back to its original location. */
		const RESTORE_ROUTE = "/dsh-session-manager/restore";
		/** Permanently purge one session from the trash. */
		const PURGE_ROUTE = "/dsh-session-manager/purge";
		/** List the current trash contents. */
		const TRASH_ROUTE = "/dsh-session-manager/trash";
		/** Reveal a session's log directory in the system file manager. */
		const OPEN_FOLDER_ROUTE = "/dsh-session-manager/open-folder";
		/** Stop a running session's current turn (pause). */
		const PAUSE_ROUTE = "/dsh-session-manager/pause";
		/** Write the context compaction threshold into the official compaction plugin config. */
		const COMPACTION_THRESHOLD_ROUTE = "/dsh-session-manager/compaction-threshold";
		/** Move one session into another workspace (artifact move + re-account). */
		const MOVE_WORKSPACE_ROUTE = "/dsh-session-manager/move-workspace";
		/** Rename one session: the title is written as a durable session/title event. */
		const RENAME_ROUTE = "/dsh-session-manager/rename";
		/** Export one session transcript as Markdown or JSON for download. */
		const EXPORT_ROUTE = "/dsh-session-manager/export";
		//#endregion
		//#region src/client/index.ts
		const name = "dsh-session-manager/client";
		const inject = [
			"slots",
			"locale",
			"connection",
			"sessions",
			"workspaces"
		];
		/** Locale namespace id registered under ctx.locale. */
		const NS = "dsh-session-manager";
		const NAV_ZH = { nav: "会话管理" };
		const NAV_EN = { nav: "Session Manager" };
		const STYLE_ID = "dsh-delete-session-style";
		/** localStorage key remembering sessions the user already deleted in this browser. */
		const REMOVED_KEY = "dsh-delete-session.removed";
		/** localStorage key remembering session titles at delete time, so the trash
		* can still show a name once the artifact (and the list row) is gone. */
		const TITLES_KEY = "dsh-delete-session.titles";
		/** localStorage key for the unread marker set (dsh.session-unread.v1). */
		const UNREAD_KEY = "dsh.session-unread.v1";
		const unreadState = { ids: loadUnread() };
		const unreadListeners = /* @__PURE__ */ new Set();
		/** Storage shape: { version: 1, ids: string[] } — the shared format of the
		* dsh.session-unread.v1 key (also used by other session-manager plugins), so
		* marks made in one plugin show up in the others. Legacy bare arrays written
		* by earlier builds are still accepted. */
		function loadUnread() {
			try {
				const raw = window.localStorage.getItem(UNREAD_KEY);
				if (raw === null) return /* @__PURE__ */ new Set();
				const parsed = JSON.parse(raw);
				const ids = Array.isArray(parsed) ? parsed : Array.isArray(parsed.ids) ? parsed.ids : [];
				return new Set(ids.filter((id) => typeof id === "string" && id !== ""));
			} catch {}
			return /* @__PURE__ */ new Set();
		}
		function persistUnread() {
			try {
				window.localStorage.setItem(UNREAD_KEY, JSON.stringify({
					version: 1,
					ids: [...unreadState.ids]
				}));
			} catch {}
		}
		function setUnread(sessionId, value) {
			const next = new Set(unreadState.ids);
			if (value) next.add(sessionId);
			else next.delete(sessionId);
			unreadState.ids = next;
			persistUnread();
			unreadListeners.forEach((listener) => listener());
		}
		function markRead(sessionId) {
			if (!unreadState.ids.has(sessionId)) return;
			setUnread(sessionId, false);
		}
		/** Subscribe the calling component to the module-level unread state. */
		function useUnread() {
			const [, force] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				const listener = () => force((value) => value + 1);
				unreadListeners.add(listener);
				return () => {
					unreadListeners.delete(listener);
				};
			}, []);
			return unreadState.ids;
		}
		function rowStatusDot(session, manuallyUnread) {
			if (session.running === true) return "ongoing";
			if (manuallyUnread) return "blue";
			if (session.pendingInteraction !== void 0) return "amber";
			if (session.completed === true) return "green";
			return null;
		}
		/** Render the official StateDot for a status, or the clickable read placeholder. */
		function renderStatusDot(status, title, onToggle) {
			return (0, react.createElement)("button", {
				type: "button",
				className: "dsh-delete-session__unread-dot",
				title,
				"aria-label": title,
				onClick: (e) => {
					e.stopPropagation();
					onToggle();
				}
			}, status === null ? (0, react.createElement)("span", { className: "dsh-delete-session__unread-dot-placeholder" }) : status === "blue" ? (0, react.createElement)("span", { className: "dsh-delete-session__unread-dot-blue" }) : (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
				state: status === "ongoing" ? "ongoing" : status === "amber" ? "warning" : "done",
				size: 10
			}));
		}
		function loadRemoved() {
			try {
				const raw = window.localStorage.getItem(REMOVED_KEY);
				if (raw !== null) return new Set(JSON.parse(raw));
			} catch {}
			return /* @__PURE__ */ new Set();
		}
		function saveRemoved(removed) {
			try {
				window.localStorage.setItem(REMOVED_KEY, JSON.stringify([...removed]));
			} catch {}
		}
		function loadTitles() {
			try {
				const raw = window.localStorage.getItem(TITLES_KEY);
				if (raw !== null) {
					const parsed = JSON.parse(raw);
					if (typeof parsed === "object" && parsed !== null) return parsed;
				}
			} catch {}
			return {};
		}
		function saveTitle(sessionId, title) {
			try {
				const next = {
					...loadTitles(),
					[sessionId]: title
				};
				window.localStorage.setItem(TITLES_KEY, JSON.stringify(next));
			} catch {}
		}
		/** Resolve a trash entry's display title: live row, remembered title, id. */
		function trashEntryTitle(titles, entry, liveTitle) {
			return liveTitle ?? titles[entry.sessionId] ?? entry.sessionId;
		}
		const STYLE = `
[data-dsh-delete-session] {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0 8px;
  color: var(--dsw-alias-label-primary, #111827);
}
.dsh-delete-session__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.dsh-delete-session__title {
  font-size: 13px;
  font-weight: 600;
}
.dsh-delete-session__count {
  color: var(--dsw-alias-label-tertiary, #9ca3af);
  font-size: 12px;
}
.dsh-delete-session__sort {
  margin-left: auto;
}
.dsh-delete-session__notice {
  border-radius: 8px;
  font-size: 12px;
  padding: 6px 10px;
  line-height: 1.5;
}
.dsh-delete-session__notice--ok {
  background: rgba(34, 197, 94, .12);
  color: var(--dsw-alias-label-primary, #111827);
}
.dsh-delete-session__notice--error {
  background: rgba(239, 68, 68, .12);
  color: var(--dsw-alias-label-primary, #111827);
}
.dsh-delete-session__empty {
  color: var(--dsw-alias-label-tertiary, #9ca3af);
  font-size: 12px;
  padding: 4px 0;
}
.dsh-delete-session__group {
  border-top: 1px solid var(--dsw-alias-line-border, rgba(127, 127, 127, .14));
  margin-top: 10px;
  padding-top: 8px;
}
.dsh-delete-session__group-toggle {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 8px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  cursor: pointer;
  display: flex;
  font: inherit;
  font-size: 12px;
  gap: 8px;
  justify-content: space-between;
  padding: 6px 8px;
  width: 100%;
}
.dsh-delete-session__group-toggle:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .08));
}
.dsh-delete-session__group-toggle-label {
  font-weight: 600;
}
.dsh-delete-session__group-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 12px;
  font-weight: 650;
  margin: 10px 0 4px;
  padding: 0 2px;
}
.dsh-delete-session__group-label-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-delete-session__workspace-checkbox {
  flex: none;
  margin: 0;
  width: 13px;
  height: 13px;
}
.dsh-delete-session__group-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity .15s;
}
.dsh-delete-session__group-label:hover .dsh-delete-session__group-actions,
.dsh-delete-session__group-actions:focus-within {
  opacity: 1;
}
.dsh-delete-session__group-action {
  flex: none;
  white-space: nowrap;
}
.dsh-delete-session__group-action--danger {
  color: var(--dsw-alias-state-danger-border, #ef4444);
}
/* General-settings preference row (context compaction threshold). */
.dsh-delete-session__general-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px solid var(--dsw-alias-border-default, #e5e7eb);
}
.dsh-delete-session__general-row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.dsh-delete-session__general-row-text {
  min-width: 0;
}
.dsh-delete-session__general-row-title {
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 600;
}
.dsh-delete-session__general-row-desc {
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 12px;
  line-height: 1.5;
  margin-top: 2px;
}
.dsh-delete-session__general-slider {
  box-sizing: border-box;
  width: 100%;
  accent-color: var(--dsw-alias-state-info-border, #4d6bfe);
  cursor: pointer;
}
.dsh-delete-session__general-slider-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dsh-delete-session__general-slider-scale {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  line-height: 1;
  color: var(--dsw-alias-label-tertiary, #9ca3af);
}
.dsh-delete-session__general-input-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}
.dsh-delete-session__general-input {
  box-sizing: border-box;
  width: 64px;
  padding: 5px 8px;
  border: 1px solid var(--dsw-alias-border-default, #e5e7eb);
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
}
.dsh-delete-session__general-input:focus {
  outline: none;
  border-color: var(--dsw-alias-state-info-border, #4d6bfe);
}
.dsh-delete-session__general-percent {
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 13px;
}
.dsh-delete-session__general-save {
  flex: none;
}
.dsh-delete-session__group-label:first-child {
  margin-top: 0;
}
.dsh-delete-session__group-label--drag {
  cursor: grab;
  user-select: none;
  touch-action: none;
}
.dsh-delete-session__group-label--drag[data-dragging] {
  opacity: .5;
}
.dsh-delete-session__group-label--drag[data-drop-swap] {
  background: var(--dsw-alias-state-info-bg, rgba(77, 107, 254, .14));
  border-radius: 6px;
}
/* Thin insertion lines hugging the group edges: "after A" and "before B"
   draw the SAME line on B's top edge. The first group has no top border. */
.dsh-delete-session__group[data-line-top] {
  box-shadow: 0 -2px 0 var(--dsw-alias-state-info-border, #4d6bfe);
}
.dsh-delete-session__group[data-line-end] {
  box-shadow: 0 2px 0 var(--dsw-alias-state-info-border, #4d6bfe);
}
.dsh-delete-session__group[data-first] {
  border-top: 0;
  margin-top: 0;
  padding-top: 0;
}
.dsh-delete-session__group-toggle-chevron {
  color: var(--dsw-alias-label-tertiary, #9ca3af);
}
.dsh-delete-session__group-hint {
  color: var(--dsw-alias-label-tertiary, #9ca3af);
  font-size: 11px;
  line-height: 1.5;
  margin: 6px 8px 0;
}
.dsh-delete-session__row[data-archived] {
  opacity: .72;
}
.dsh-delete-session__row[data-trash] {
  opacity: .85;
}
/* Row action buttons use the official Button component while keeping rows stable. */
.dsh-row-action {
  flex: none;
  white-space: nowrap;
}
.dsh-row-action--danger {
  color: var(--dsw-alias-state-danger-border, #ef4444);
}
.dsh-row-action--danger:hover:not(:disabled) {
  border-color: var(--dsw-alias-state-danger-border, #ef4444);
}
/* Per-row "More" popover menu (self-drawn). */
.dsh-delete-session__more-wrap {
  position: relative;
  flex: none;
}
.dsh-delete-session__more-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 60;
  min-width: 150px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  background: var(--dsw-alias-bg-base, #ffffff);
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, .14);
}
.dsh-delete-session__more-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-primary, #0f1115);
  font-size: 12px;
  line-height: 1;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
}
.dsh-delete-session__more-item:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .06));
}
.dsh-delete-session__more-item:disabled {
  opacity: .5;
  cursor: default;
}
.dsh-delete-session__more-item--danger {
  color: #dc2626;
}
.dsh-delete-session__more-item--danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, .12);
}
/* Move-to-workspace submenu: opens to the left of the "More" menu. */
.dsh-delete-session__move-menu {
  top: -4px;
  right: calc(100% + 4px);
}
/* Session search + status filter bar. */
.dsh-delete-session__filter {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 2px 8px;
  flex-wrap: wrap;
}
.dsh-delete-session__search {
  flex: 1 1 180px;
  min-width: 140px;
  padding: 5px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #0f1115);
  font-size: 12px;
  outline: none;
}
.dsh-delete-session__search:focus {
  border-color: var(--dsw-alias-accent, #2563eb);
}
.dsh-delete-session__filter-chips {
  display: flex;
  gap: 4px;
}
.dsh-delete-session__chip {
  padding: 3px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #4b5563);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}
.dsh-delete-session__chip--active {
  background: var(--dsw-alias-accent, #2563eb);
  border-color: var(--dsw-alias-accent, #2563eb);
  color: #ffffff;
}
/* Session-row drag onto a workspace header: drop-target highlight. */
.dsh-delete-session__group-label[data-drop-session-active] {
  outline: 2px dashed var(--dsw-alias-accent, #2563eb);
  outline-offset: -2px;
}
.dsh-delete-session__row[draggable='true'] {
  cursor: grab;
}
.dsh-delete-session__checkbox {
  flex: none;
  width: 14px;
  height: 14px;
  accent-color: #dc2626;
  cursor: pointer;
}
.dsh-delete-session__checkbox:disabled {
  cursor: default;
  opacity: .5;
}
.dsh-delete-session__batch {
  align-items: center;
  display: flex;
  gap: 10px;
  padding: 4px 2px 8px;
}
.dsh-delete-session__batch-select-all {
  align-items: center;
  display: inline-flex;
  font-size: 12px;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  color: var(--dsw-alias-label-primary, #0f1115);
}
.dsh-delete-session__batch-count {
  color: var(--dsw-alias-label-secondary, #6b7280);
  flex: 1 1 auto;
  font-size: 12px;
}
.dsh-delete-session__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dsh-delete-session__row {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--dsw-alias-line-border, rgba(127, 127, 127, .18));
  border-radius: 10px;
  padding: 8px 10px;
}
.dsh-delete-session__row-main {
  flex: 1 1 auto;
  min-width: 0;
}
.dsh-delete-session__row-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 13px;
  line-height: 1.4;
}
.dsh-delete-session__row-title-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-delete-session__unread-dot {
  flex: none;
  width: 10px;
  height: 10px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.dsh-delete-session__unread-dot-placeholder {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1.5px var(--dsw-alias-label-tertiary, #9ca3af);
}
.dsh-delete-session__unread-dot-blue {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dsw-alias-state-business-primary, #3b82f6);
}
.dsh-delete-session__unread-dot:hover .dsh-delete-session__unread-dot-placeholder {
  transform: scale(1.15);
}
/* Blue unread dot inserted next to OFFICIAL sidebar session titles. */
.dsh-session-manager__row-unread-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-left: 6px;
  border-radius: 50%;
  background: var(--dsw-alias-state-business-primary, #3b82f6);
  vertical-align: middle;
  flex: none;
  cursor: pointer;
}
.dsh-delete-session__row-meta {
  color: var(--dsw-alias-label-tertiary, #9ca3af);
  font-size: 11px;
  line-height: 1.4;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-delete-session__row[data-current] .dsh-delete-session__row-title::after {
  content: " · " attr(data-current-label);
  color: var(--dsw-alias-label-tertiary, #9ca3af);
  font-weight: 400;
}
[data-dsh-delete-current],
[data-dsh-header-button] {
  align-items: center;
  appearance: none;
  background: transparent;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, .28));
  border-radius: 18px;
  color: var(--dsw-alias-label-primary, #111827);
  cursor: pointer;
  display: inline-flex;
  font-family: var(--dsw-font-family);
  font-size: 13px;
  font-weight: 400;
  gap: 4px;
  height: 32px;
  justify-content: center;
  line-height: 20px;
  min-width: 111px;
  padding: 6px 12px;
  white-space: nowrap;
}
[data-dsh-delete-current] {
  border-color: rgba(220, 38, 38, .45);
  color: rgb(220, 38, 38);
}
[data-dsh-delete-current]:hover:not(:disabled) {
  background: rgba(239, 68, 68, .1);
}
[data-dsh-header-button]:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .1));
}
[data-dsh-delete-current]:disabled,
[data-dsh-header-button]:disabled {
  color: var(--dsw-alias-label-dimmed, #9ca3af);
  cursor: wait;
}
[data-dsh-drawer-backdrop] {
  background: rgba(0, 0, 0, .28);
  inset: 0;
  position: fixed;
  z-index: 1200;
}
[data-dsh-drawer] {
  background: var(--dsw-alias-bg-base, #fff);
  border-left: 1px solid var(--dsw-alias-line-border, rgba(127, 127, 127, .18));
  bottom: 0;
  box-shadow: -16px 0 40px rgba(0, 0, 0, .18);
  display: flex;
  flex-direction: column;
  position: fixed;
  right: 0;
  top: 0;
  width: 400px;
  z-index: 1201;
}
.dsh-drawer__header {
  align-items: center;
  border-bottom: 1px solid var(--dsw-alias-line-border, rgba(127, 127, 127, .14));
  display: flex;
  flex: none;
  gap: 6px;
  padding: 12px 14px;
}
.dsh-drawer__title {
  flex: 1 1 auto;
  font-size: 14px;
  font-weight: 650;
  min-width: 0;
}
.dsh-drawer__pin {
  align-items: center;
  appearance: none;
  background: transparent;
  border: 0;
  border-radius: 6px;
  color: var(--dsw-alias-label-tertiary, #9ca3af);
  cursor: pointer;
  display: inline-flex;
  height: 26px;
  justify-content: center;
  padding: 0;
  width: 26px;
}
.dsh-drawer__pin:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .1));
}
.dsh-drawer__pin[data-pinned] {
  color: var(--dsw-alias-label-primary, #111827);
}
.dsh-drawer__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px;
}
.dsh-drawer__hint {
  color: var(--dsw-alias-label-tertiary, #9ca3af);
  font-size: 11px;
  line-height: 1.5;
  margin-bottom: 8px;
}
[data-dsh-stats-backdrop] {
  align-items: center;
  background: rgba(0, 0, 0, .42);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 20px;
  position: fixed;
  z-index: 1300;
}
[data-dsh-stats-dialog] {
  background: var(--dsw-alias-bg-base, #fff);
  border: 1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, .2));
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, .28);
  color: var(--dsw-alias-label-primary, #111827);
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 40px);
  overflow: hidden;
  width: min(520px, calc(100vw - 40px));
}
.dsh-stats-dialog__header {
  align-items: flex-start;
  border-bottom: 1px solid var(--dsw-alias-border-l3, rgba(127, 127, 127, .14));
  display: flex;
  gap: 12px;
  padding: 16px 18px;
}
.dsh-stats-dialog__heading {
  flex: 1 1 auto;
  min-width: 0;
}
.dsh-stats-dialog__title {
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}
.dsh-stats-dialog__session {
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 12px;
  line-height: 18px;
  margin-top: 2px;
  overflow-wrap: anywhere;
}
.dsh-stats-dialog__close {
  align-items: center;
  appearance: none;
  background: transparent;
  border: 0;
  border-radius: 7px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  cursor: pointer;
  display: inline-flex;
  flex: none;
  font: inherit;
  font-size: 22px;
  height: 30px;
  justify-content: center;
  padding: 0;
  width: 30px;
}
.dsh-stats-dialog__close:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .1));
}
.dsh-stats-dialog__body {
  font-size: 13px;
  line-height: 1.6;
  overflow-y: auto;
  padding: 18px;
}
.dsh-stats-dialog__grid {
  display: grid;
  gap: 12px 18px;
  grid-template-columns: max-content minmax(0, 1fr);
  margin: 0;
}
.dsh-stats-dialog__label {
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-weight: 500;
}
.dsh-stats-dialog__value {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
.dsh-stats-dialog__tools {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.dsh-stats-dialog__tool {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .08));
  border-radius: 6px;
  padding: 3px 7px;
}
`;
		/**
		* Fold a history window into an stats. The tail page carries at most
		* `maxMessages` messages, so a long session's stats reflects its recent
		* window; `startedAt`/`updatedAt` are the window's own bounds. Events the
		* fold does not recognize are skipped.
		*/
		function foldStats(entries) {
			let turns = 0;
			let userMessages = 0;
			let assistantMessages = 0;
			const toolCounts = /* @__PURE__ */ new Map();
			let startedAt = Number.POSITIVE_INFINITY;
			let updatedAt = Number.NEGATIVE_INFINITY;
			for (const entry of entries) {
				const { type, time, data } = entry.event;
				if (time < startedAt) startedAt = time;
				if (time > updatedAt) updatedAt = time;
				if (type === "turn/start") turns += 1;
				else if (type === "user/message") userMessages += 1;
				else if (type === "assistant/message") assistantMessages += 1;
				else if (type === "tool/call") toolCounts.set(data.name, (toolCounts.get(data.name) ?? 0) + 1);
			}
			const toolCalls = [...toolCounts.entries()].map(([name, count]) => ({
				name,
				count
			})).sort((a, b) => b.count - a.count);
			return {
				turns,
				userMessages,
				assistantMessages,
				toolCalls,
				startedAt: startedAt === Number.POSITIVE_INFINITY ? 0 : startedAt,
				updatedAt: updatedAt === Number.NEGATIVE_INFINITY ? 0 : updatedAt
			};
		}
		let appLocale = "en";
		const appLocaleListeners = /* @__PURE__ */ new Set();
		function setAppLocale(next) {
			const normalized = next === "zh" ? "zh" : "en";
			if (appLocale === normalized) return;
			appLocale = normalized;
			for (const listener of [...appLocaleListeners]) listener();
		}
		function subscribeAppLocale(listener) {
			appLocaleListeners.add(listener);
			return () => appLocaleListeners.delete(listener);
		}
		function useLocaleStrings() {
			(0, react.useSyncExternalStore)(subscribeAppLocale, () => appLocale, () => appLocale);
			return stringsOf();
		}
		function isZh() {
			return appLocale === "zh";
		}
		function stringsOf() {
			return isZh() ? {
				title: "会话管理",
				count: (used) => `${used} 个会话`,
				current: "当前会话",
				delete: "删除",
				deleting: "删除中…",
				confirm: "确定删除会话「{title}」吗？它会移入回收站，可在「回收站」中恢复或彻底删除。",
				deleted: "已删除会话「{title}」",
				failed: "删除会话「{title}」失败",
				liveError: "（会话正在使用中，请先停止后再删）",
				notFoundError: "（会话不存在或已被删除）",
				running: "运行中",
				archived: "已归档",
				archivedGroup: "已归档会话",
				archivedHint: "已归档会话删除后移入回收站；这里只是归档状态（侧边栏隐藏）。",
				trashGroup: "回收站",
				trashHint: "保留最近 {limit} 条已删除会话，超出后最早的一条会被自动彻底删除。",
				trashEmpty: "回收站为空。",
				trashLoadFailed: "回收站加载失败",
				restore: "恢复",
				restoreConfirm: "确定恢复会话「{title}」吗？它会回到会话列表。",
				restored: "已恢复会话「{title}」",
				restoreFailed: "恢复会话「{title}」失败",
				purge: "彻底删除",
				purgeConfirm: "确定彻底删除会话「{title}」吗？日志与记录将永久清除，无法恢复。",
				purged: "已彻底删除会话「{title}」",
				purgeFailed: "彻底删除会话「{title}」失败",
				expand: "展开",
				collapse: "收起",
				empty: "没有可管理的会话。",
				noCwd: "(未知工作目录)",
				continue: "继续会话",
				pause: "暂停",
				paused: "已暂停会话",
				pauseFailed: "暂停失败",
				fork: "新聊天中继续",
				forkFailed: "创建子会话失败",
				forkUnavailable: "当前回合尚未结束，无法在此处切分",
				rename: "重命名",
				renamePrompt: "请输入会话的新名称：",
				renamed: "已重命名会话",
				renameFailed: "重命名失败",
				exportMd: "导出 Markdown",
				exportJson: "导出 JSON",
				exported: "已开始下载导出文件",
				exportFailed: "导出失败",
				more: "更多",
				batchDelete: "批量删除",
				batchDeleteConfirm: "确定删除选中的 {count} 个会话吗？它们会移入回收站，可在「回收站」中恢复或彻底删除。",
				batchDeleted: "已批量删除 {count} 个会话",
				batchFailed: "批量删除失败：{msg}",
				batchResult: (okCount, total, failCount, detail) => `${okCount}/${total} 成功，失败 ${failCount} 个（${detail}）`,
				listSeparator: "、",
				select: "选择",
				selectAll: "全选",
				selectWorkspace: "全选该工作区的会话",
				selectedCount: (count) => `已选 ${count} 个`,
				unread: "标记为未读",
				read: "标记为已读",
				stats: "统计",
				statsLoading: "统计加载中…",
				statsFailed: "统计加载失败",
				statsEmpty: "（近期窗口内没有活动）",
				statsTurns: "轮次",
				statsUser: "用户消息",
				statsAssistant: "助手消息",
				statsTools: "工具调用",
				statsWindow: "活动窗口",
				folder: "文件夹",
				folderOpen: "已在文件管理器中打开",
				folderFailed: "打开文件夹失败",
				moveTo: "移动到…",
				moveToWorkspace: "移动到工作区",
				moveNoTargets: "没有其他工作区",
				movedTo: (title) => `已移动到「${title}」`,
				moveFailed: (msg) => `移动失败：${msg}`,
				moveLive: "（会话正在运行，无法移动）",
				moveToNewWorkspace: "＋新建工作区（会话所在目录）",
				searchPlaceholder: "搜索标题或目录…",
				filterAll: "全部",
				filterRunning: "运行中",
				filterUnread: "未读",
				filterArchived: "已归档",
				noMatch: "没有匹配的会话",
				dragToMoveHint: "拖到工作区标题上移动",
				batchMove: "移动到…",
				batchMoved: (n) => `已移动 ${n} 个会话`,
				batchMoveFailed: (n, total) => `批量移动失败（${total - n}/${total}）`,
				batchMoveSkipped: (n) => `（跳过 ${n} 个运行中的会话）`,
				deleteCurrent: "删除本对话",
				deleteCurrentConfirm: "确定删除当前对话吗？将移入回收站，可在「会话管理」中恢复或彻底删除。",
				deleteCurrentFailed: "删除当前对话失败",
				deleteCurrentRunning: "对话正在运行",
				manageButton: "对话管理",
				pin: "固定面板",
				unpin: "取消固定",
				drawerPinHint: "固定后面板保持打开，点击面板外不会自动收起。",
				close: "关闭",
				ungrouped: "未分组",
				sortNewest: "最新在前",
				sortOldest: "最旧在前",
				workspaceDragHint: "拖动调整工作区顺序",
				workspaceToTop: "置于顶部",
				workspaceRename: "重命名",
				workspaceRenamePrompt: "请输入工作区「{title}」的新名称：",
				workspaceDelete: "删除",
				workspaceDeleteConfirm: "将把「{title}」从工作区列表中移除。文件夹与会话记录会保留，其会话将显示在「未分组」下。",
				compactionThresholdTitle: "上下文压缩阈值",
				compactionThresholdDesc: "对话上下文用到该比例时自动压缩（最低 17%）。每次压缩会保留最近 16% 的原文，其余折叠为摘要。对所有会话（任意 Agent 预设）生效：保存后立即生效并持久化，重启后自动应用。",
				compactionSave: "保存",
				compactionSaved: "已保存",
				compactionSaveFailed: "保存失败",
				deletedAt: (ms) => {
					const d = new Date(ms);
					const pad = (n) => String(n).padStart(2, "0");
					return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
				}
			} : {
				title: "Session Manager",
				count: (used) => `${used} sessions`,
				current: "current session",
				delete: "Delete",
				deleting: "Deleting…",
				confirm: "Delete session \"{title}\"? It moves to the trash, where you can restore or permanently delete it.",
				deleted: "Deleted session \"{title}\"",
				failed: "Failed to delete session \"{title}\"",
				liveError: " (session is in use; stop it before deleting)",
				notFoundError: " (session does not exist or was already deleted)",
				running: "running",
				archived: "archived",
				archivedGroup: "Archived sessions",
				archivedHint: "Deleting an archived session moves it to the trash; this list is just the archived (sidebar-hidden) state.",
				trashGroup: "Trash",
				trashHint: "Keeps the most recent {limit} deleted sessions; the oldest one is purged automatically when the limit is exceeded.",
				trashEmpty: "The trash is empty.",
				trashLoadFailed: "Failed to load the trash",
				restore: "Restore",
				restoreConfirm: "Restore session \"{title}\"? It will return to the session list.",
				restored: "Restored session \"{title}\"",
				restoreFailed: "Failed to restore session \"{title}\"",
				purge: "Delete permanently",
				purgeConfirm: "Permanently delete session \"{title}\"? Its logs and records cannot be recovered.",
				purged: "Permanently deleted session \"{title}\"",
				purgeFailed: "Failed to permanently delete session \"{title}\"",
				expand: "Expand",
				collapse: "Collapse",
				empty: "No manageable sessions.",
				noCwd: "(unknown working directory)",
				continue: "Continue session",
				pause: "Pause",
				paused: "Session paused",
				pauseFailed: "Failed to pause",
				fork: "Continue in new chat",
				forkFailed: "Failed to fork session",
				forkUnavailable: "the current turn is still open; it cannot be forked here",
				rename: "Rename",
				renamePrompt: "Enter a new name for the session:",
				renamed: "Session renamed",
				renameFailed: "Rename failed",
				exportMd: "Export Markdown",
				exportJson: "Export JSON",
				exported: "Download started",
				exportFailed: "Export failed",
				more: "More",
				batchDelete: "Delete selected",
				batchDeleteConfirm: "Delete the {count} selected sessions? They move to the trash, where you can restore or permanently delete them.",
				batchDeleted: "Deleted {count} sessions",
				batchFailed: "Batch delete failed: {msg}",
				batchResult: (okCount, total, failCount, detail) => `${okCount}/${total} succeeded, ${failCount} failed (${detail})`,
				listSeparator: ", ",
				select: "Select",
				selectAll: "Select all",
				selectWorkspace: "Select all sessions in this workspace",
				selectedCount: (count) => `${count} selected`,
				unread: "Mark as unread",
				read: "Mark as read",
				stats: "Stats",
				statsLoading: "Loading stats…",
				statsFailed: "Failed to load stats",
				statsEmpty: "(no activity in the recent window)",
				statsTurns: "turns",
				statsUser: "user messages",
				statsAssistant: "assistant messages",
				statsTools: "tool calls",
				statsWindow: "activity window",
				folder: "Folder",
				folderOpen: "Opened in the file manager",
				folderFailed: "Failed to open folder",
				moveTo: "Move to…",
				moveToWorkspace: "Move to workspace",
				moveNoTargets: "No other workspaces",
				movedTo: (title) => `Moved to "${title}"`,
				moveFailed: (msg) => `Move failed: ${msg}`,
				moveLive: " (the session is running; it cannot be moved)",
				moveToNewWorkspace: "＋ New workspace (session directory)",
				searchPlaceholder: "Search title or directory…",
				filterAll: "All",
				filterRunning: "Running",
				filterUnread: "Unread",
				filterArchived: "Archived",
				noMatch: "No matching sessions",
				dragToMoveHint: "Drag onto a workspace header to move",
				batchMove: "Move to…",
				batchMoved: (n) => `Moved ${n} sessions`,
				batchMoveFailed: (n, total) => `Batch move failed (${total - n}/${total})`,
				batchMoveSkipped: (n) => ` (skipped ${n} running)`,
				deleteCurrent: "Delete this session",
				deleteCurrentConfirm: "Delete this conversation? It moves to the trash, where you can restore or permanently delete it.",
				deleteCurrentFailed: "Failed to delete this session",
				deleteCurrentRunning: "the conversation is running",
				manageButton: "Session Manager",
				pin: "Pin panel",
				unpin: "Unpin panel",
				drawerPinHint: "When pinned, the panel stays open and does not close on outside clicks.",
				close: "Close",
				ungrouped: "Ungrouped",
				sortNewest: "Newest first",
				sortOldest: "Oldest first",
				workspaceDragHint: "Drag to reorder workspaces",
				workspaceToTop: "Move to top",
				workspaceRename: "Rename",
				workspaceRenamePrompt: "Enter a new name for workspace \"{title}\":",
				workspaceDelete: "Delete",
				workspaceDeleteConfirm: "This removes \"{title}\" from the workspace list. The folder and session logs will be kept. Its sessions will appear under Ungrouped.",
				compactionThresholdTitle: "Context compaction threshold",
				compactionThresholdDesc: "Compacts automatically when the conversation context reaches this fraction of the 1M-token model window (minimum 17%). Each compaction keeps the most recent 16% verbatim and folds the rest into a summary. Applies to ALL sessions (any agent preset): effective immediately on save, persisted, and re-applied automatically after a restart.",
				compactionSave: "Save",
				compactionSaved: "Saved",
				compactionSaveFailed: "Save failed",
				deletedAt: (ms) => {
					const d = new Date(ms);
					const pad = (n) => String(n).padStart(2, "0");
					return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
				}
			};
		}
		function SessionManager({ useSessions, useWorkspaces, api, sessions, workspaceActions, close }) {
			const list = useSessions((state) => state);
			const workspaces = useWorkspaces((state) => state);
			const [removed, setRemoved] = (0, react.useState)(() => loadRemoved());
			const [archivedOpen, setArchivedOpen] = (0, react.useState)(false);
			const [trashOpen, setTrashOpen] = (0, react.useState)(false);
			const [trash, setTrash] = (0, react.useState)(null);
			const [trashLimit, setTrashLimit] = (0, react.useState)(10);
			const [trashFailed, setTrashFailed] = (0, react.useState)(false);
			const [busyId, setBusyId] = (0, react.useState)(null);
			const [notice, setNotice] = (0, react.useState)(null);
			const [statsId, setStatsId] = (0, react.useState)(null);
			const [stats, setStats] = (0, react.useState)(null);
			const [selectedIds, setSelectedIds] = (0, react.useState)(/* @__PURE__ */ new Set());
			const unread = useUnread();
			const [moveOpenId, setMoveOpenId] = (0, react.useState)(null);
			const [moreOpenId, setMoreOpenId] = (0, react.useState)(null);
			const [renamedTitles, setRenamedTitles] = (0, react.useState)({});
			const [query, setQuery] = (0, react.useState)("");
			const [statusFilter, setStatusFilter] = (0, react.useState)("all");
			const [dragSessionId, setDragSessionId] = (0, react.useState)(null);
			const [dropSessionWorkspaceId, setDropSessionWorkspaceId] = (0, react.useState)(null);
			const [batchMoveOpen, setBatchMoveOpen] = (0, react.useState)(false);
			const [newestFirst, setNewestFirst] = (0, react.useState)(true);
			const [dragWorkspaceId, setDragWorkspaceId] = (0, react.useState)(null);
			const [dropSlot, setDropSlot] = (0, react.useState)(null);
			const noticeTimer = (0, react.useRef)(void 0);
			const dropSlotRef = (0, react.useRef)(null);
			const groupsRef = (0, react.useRef)([]);
			const strings = useLocaleStrings();
			const showNotice = (0, react.useCallback)((next) => {
				setNotice(next);
				window.clearTimeout(noticeTimer.current);
				noticeTimer.current = window.setTimeout(() => setNotice(null), 3500);
			}, []);
			(0, react.useEffect)(() => () => window.clearTimeout(noticeTimer.current), []);
			(0, react.useEffect)(() => {
				if (moreOpenId === null && moveOpenId === null && !batchMoveOpen) return;
				const onPointerDown = (event) => {
					if (!(event.target instanceof Element)) return;
					if (event.target.closest(".dsh-delete-session__more-wrap") !== null) return;
					setMoreOpenId(null);
					setMoveOpenId(null);
					setBatchMoveOpen(false);
				};
				document.addEventListener("pointerdown", onPointerDown);
				return () => document.removeEventListener("pointerdown", onPointerDown);
			}, [
				moreOpenId,
				moveOpenId,
				batchMoveOpen
			]);
			const loadTrash = (0, react.useCallback)(async () => {
				try {
					const response = await fetch(TRASH_ROUTE);
					const data = await response.json().catch(() => ({}));
					if (response.ok && data.ok) {
						setTrash(data.entries);
						setTrashLimit(data.limit);
						setTrashFailed(false);
					} else setTrashFailed(true);
				} catch {
					setTrashFailed(true);
				}
			}, []);
			(0, react.useEffect)(() => {
				loadTrash();
			}, [loadTrash]);
			const performMove = (0, react.useCallback)(async (sessionId, workspaceId) => {
				try {
					const response = await fetch(MOVE_WORKSPACE_ROUTE, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							sessionId,
							workspaceId
						})
					});
					const data = await response.json().catch(() => ({}));
					if (!response.ok || data.ok !== true) {
						const suffix = data.error === "session-live" ? strings.moveLive : "";
						const detail = data.detail !== void 0 ? `（${data.detail}）` : "";
						return strings.moveFailed(data.error ?? `HTTP ${response.status}`) + suffix + detail;
					}
					return null;
				} catch {
					return strings.moveFailed("network");
				}
			}, [strings]);
			const handleMoveToWorkspace = (0, react.useCallback)(async (sessionId, workspaceId) => {
				setMoveOpenId(null);
				setBusyId(sessionId);
				const err = await performMove(sessionId, workspaceId);
				if (err !== null) showNotice({
					kind: "error",
					text: err
				});
				else {
					const target = workspaces.items.find((view) => view.workspaceId === workspaceId);
					showNotice({
						kind: "ok",
						text: strings.movedTo(target?.title || target?.path || workspaceId)
					});
				}
				setBusyId(null);
			}, [
				performMove,
				workspaces.items,
				showNotice,
				strings
			]);
			const handleMoveToNewWorkspace = (0, react.useCallback)(async (sessionId, cwd) => {
				setMoveOpenId(null);
				setBusyId(sessionId);
				try {
					const view = (await workspaceActions.create({ path: cwd })).workspace;
					if (view === void 0) {
						showNotice({
							kind: "error",
							text: strings.moveFailed("workspace-create")
						});
						return;
					}
					const err = await performMove(sessionId, view.workspaceId);
					if (err !== null) showNotice({
						kind: "error",
						text: err
					});
					else showNotice({
						kind: "ok",
						text: strings.movedTo(view.title || view.path)
					});
				} catch {
					showNotice({
						kind: "error",
						text: strings.moveFailed("workspace-create")
					});
				} finally {
					setBusyId(null);
				}
			}, [
				workspaceActions,
				performMove,
				showNotice,
				strings
			]);
			const archivedSet = new Set(workspaces.archivedSessionIds);
			const trashIds = new Set((trash ?? []).map((entry) => entry.sessionId));
			const handleBatchMove = (0, react.useCallback)(async (workspaceId) => {
				setBatchMoveOpen(false);
				const targetView = workspaces.items.find((view) => view.workspaceId === workspaceId);
				const ids = [...selectedIds].filter((raw) => {
					const id = raw;
					const s = list.byId[id];
					if (s === void 0 || s.running || id === list.current || archivedSet.has(id)) return false;
					return !(targetView?.sessionIds.includes(id) ?? false);
				});
				if (ids.length === 0) {
					showNotice({
						kind: "error",
						text: strings.moveNoTargets
					});
					return;
				}
				const skipped = selectedIds.size - ids.length;
				let ok = 0;
				let firstError = null;
				for (const id of ids) {
					const err = await performMove(id, workspaceId);
					if (err === null) ok += 1;
					else if (firstError === null) firstError = err;
				}
				if (firstError === null) showNotice({
					kind: "ok",
					text: strings.batchMoved(ok) + (skipped > 0 ? strings.batchMoveSkipped(skipped) : "")
				});
				else showNotice({
					kind: "error",
					text: strings.batchMoveFailed(ok, ids.length) + (skipped > 0 ? strings.batchMoveSkipped(skipped) : "") + "：" + firstError
				});
				setSelectedIds(/* @__PURE__ */ new Set());
			}, [
				selectedIds,
				workspaces.items,
				list.byId,
				list.current,
				archivedSet,
				performMove,
				showNotice,
				strings
			]);
			const summaries = list.ids.map((id) => list.byId[id]).filter((session) => session !== void 0 && !removed.has(session.id) && !session.blank).map((session) => {
				const renamed = renamedTitles[session.id];
				return renamed !== void 0 && renamed !== session.displayTitle ? {
					...session,
					displayTitle: renamed
				} : session;
			});
			const activeRows = summaries.filter((session) => !archivedSet.has(session.id));
			const archivedRows = summaries.filter((session) => archivedSet.has(session.id) && !trashIds.has(session.id));
			const queryNorm = query.trim().toLowerCase();
			const matchesQuery = (s) => queryNorm === "" || s.displayTitle.toLowerCase().includes(queryNorm) || (s.cwd ?? "").toLowerCase().includes(queryNorm);
			const filteredActive = activeRows.filter((s) => matchesQuery(s) && (statusFilter === "all" || statusFilter === "running" && s.running || statusFilter === "unread" && unread.has(s.id)));
			const filteredArchived = archivedRows.filter((s) => matchesQuery(s));
			const showActiveSection = statusFilter !== "archived";
			const showArchivedSection = statusFilter === "all" || statusFilter === "archived";
			const sortActive = (rows) => [...rows].sort((a, b) => newestFirst ? b.updatedAt - a.updatedAt : a.updatedAt - b.updatedAt);
			const activeGroups = [];
			for (const view of workspaces.items) {
				const rows = sortActive(filteredActive.filter((session) => view.sessionIds.includes(session.id)));
				if (rows.length > 0) activeGroups.push({
					workspaceId: view.workspaceId,
					title: view.title || view.path,
					rows
				});
			}
			const ungroupedActive = sortActive(filteredActive.filter((session) => !workspaces.items.some((view) => view.sessionIds.includes(session.id))));
			if (ungroupedActive.length > 0) activeGroups.push({
				workspaceId: "__ungrouped__",
				title: strings.ungrouped,
				rows: ungroupedActive
			});
			groupsRef.current = activeGroups;
			const handleWorkspaceDrop = (0, react.useCallback)(async (slot) => {
				setDropSlot(null);
				const dragged = dragWorkspaceId;
				setDragWorkspaceId(null);
				if (dragged === null || slot === null) return;
				try {
					let beforeId;
					if (slot.startsWith("swap:")) {
						const swapId = slot.slice(5);
						if (swapId === dragged || swapId === "__ungrouped__") return;
						const order = groupsRef.current.map((g) => g.workspaceId);
						const aIndex = order.indexOf(dragged);
						const bIndex = order.indexOf(swapId);
						beforeId = aIndex >= 0 && bIndex >= 0 && aIndex < bIndex ? order[bIndex + 1] : swapId;
					} else if (slot.startsWith("before:")) beforeId = slot.slice(7);
					await workspaceActions.insertBefore(dragged, beforeId);
				} catch {}
			}, [workspaceActions, dragWorkspaceId]);
			const moveWorkspaceToTop = (0, react.useCallback)(async (workspaceId) => {
				const firstId = groupsRef.current.map((g) => g.workspaceId).find((id) => id !== "__ungrouped__");
				if (firstId === void 0 || firstId === workspaceId) return;
				try {
					await workspaceActions.insertBefore(workspaceId, firstId);
				} catch {}
			}, [workspaceActions]);
			const renameWorkspace = (0, react.useCallback)(async (group) => {
				const input = window.prompt(strings.workspaceRenamePrompt.replace("{title}", group.title), group.title);
				if (input === null) return;
				const title = input.trim();
				if (title === "" || title === group.title) return;
				try {
					await workspaceActions.rename(group.workspaceId, title);
				} catch {}
			}, [workspaceActions]);
			const deleteWorkspace = (0, react.useCallback)(async (group) => {
				if (!window.confirm(strings.workspaceDeleteConfirm.replace("{title}", group.title))) return;
				try {
					await workspaceActions.delete(group.workspaceId);
				} catch {}
			}, [workspaceActions]);
			const renderWorkspaceLabel = (group, index) => {
				const draggable = group.workspaceId !== "__ungrouped__";
				const workspaceSelectable = group.rows.filter((session) => !session.running && session.id !== list.current);
				const workspaceAllSelected = workspaceSelectable.length > 0 && workspaceSelectable.every((session) => selectedIds.has(session.id));
				const workspaceSomeSelected = workspaceSelectable.some((session) => selectedIds.has(session.id));
				const sessionDropTarget = dragSessionId !== null && group.workspaceId !== "__ungrouped__";
				return (0, react.createElement)("div", {
					className: "dsh-delete-session__group-label" + (draggable ? " dsh-delete-session__group-label--drag" : ""),
					"data-drag-workspace": group.workspaceId,
					"data-dragging": dragWorkspaceId === group.workspaceId || void 0,
					"data-drop-swap": dropSlot === `swap:${group.workspaceId}` || void 0,
					"data-drop-session": sessionDropTarget ? group.workspaceId : void 0,
					"data-drop-session-active": dropSessionWorkspaceId === group.workspaceId || void 0,
					title: dragSessionId !== null ? strings.dragToMoveHint : draggable ? strings.workspaceDragHint : void 0,
					onDragOver: sessionDropTarget ? (e) => {
						if (e.dataTransfer === null) return;
						e.preventDefault();
						e.dataTransfer.dropEffect = "move";
						setDropSessionWorkspaceId(group.workspaceId);
					} : void 0,
					onDragLeave: () => {
						if (dropSessionWorkspaceId === group.workspaceId) setDropSessionWorkspaceId(null);
					},
					onDrop: sessionDropTarget ? (e) => {
						e.preventDefault();
						const id = dragSessionId;
						setDragSessionId(null);
						setDropSessionWorkspaceId(null);
						if (id !== null && !group.rows.some((s) => s.id === id)) handleMoveToWorkspace(id, group.workspaceId);
					} : void 0,
					onPointerDown: draggable ? (e) => {
						if (e.button !== 0) return;
						e.preventDefault();
						setDragWorkspaceId(group.workspaceId);
						dropSlotRef.current = null;
						setDropSlot(null);
						const el = e.currentTarget;
						try {
							el.setPointerCapture(e.pointerId);
						} catch {}
					} : void 0,
					onPointerMove: draggable ? (e) => {
						if (dragWorkspaceId === null) return;
						const hit = document.elementFromPoint(e.clientX, e.clientY);
						const panel = hit instanceof Element ? hit.closest("[data-dsh-delete-session], [data-dsh-drawer]") : null;
						if (panel === null) {
							dropSlotRef.current = null;
							setDropSlot(null);
							return;
						}
						const labels = Array.from(panel.querySelectorAll("[data-drag-workspace]"));
						const groups = groupsRef.current;
						let targetIndex = -1;
						for (let i = 0; i < labels.length; i++) {
							const rect = labels[i].getBoundingClientRect();
							if (e.clientY >= rect.top - 6) targetIndex = i;
						}
						if (targetIndex < 0 || targetIndex >= groups.length) {
							dropSlotRef.current = null;
							setDropSlot(null);
							return;
						}
						const rect = labels[targetIndex].getBoundingClientRect();
						let slot;
						if (e.clientY >= rect.top && e.clientY <= rect.bottom) slot = `swap:${groups[targetIndex].workspaceId}`;
						else if (e.clientY < rect.top) slot = `before:${groups[targetIndex].workspaceId}`;
						else {
							const next = targetIndex + 1 < groups.length ? groups[targetIndex + 1] : null;
							slot = next !== null ? `before:${next.workspaceId}` : "__end__";
						}
						dropSlotRef.current = slot;
						setDropSlot(slot);
					} : void 0,
					onPointerUp: draggable ? (e) => {
						if (dragWorkspaceId === null) return;
						try {
							e.currentTarget.releasePointerCapture(e.pointerId);
						} catch {}
						handleWorkspaceDrop(dropSlotRef.current);
					} : void 0,
					children: [
						(0, react.createElement)("input", {
							type: "checkbox",
							className: "dsh-delete-session__checkbox dsh-delete-session__workspace-checkbox",
							checked: workspaceAllSelected,
							disabled: workspaceSelectable.length === 0,
							title: strings.selectWorkspace,
							"aria-label": strings.selectWorkspace,
							ref: (el) => {
								if (el !== null) el.indeterminate = workspaceSomeSelected && !workspaceAllSelected;
							},
							onPointerDown: (e) => {
								e.stopPropagation();
								e.preventDefault();
							},
							onClick: (e) => {
								e.stopPropagation();
								toggleSelectWorkspace(group);
							}
						}),
						(0, react.createElement)("span", { className: "dsh-delete-session__group-label-text" }, `${group.title} (${group.rows.length})`),
						draggable ? (0, react.createElement)("span", { className: "dsh-delete-session__group-actions" }, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							className: "dsh-delete-session__group-action",
							variant: "ghost",
							size: "sm",
							title: strings.workspaceToTop,
							onPointerDown: (e) => e.stopPropagation(),
							onClick: (e) => {
								e.stopPropagation();
								moveWorkspaceToTop(group.workspaceId);
							}
						}, strings.workspaceToTop), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							className: "dsh-delete-session__group-action",
							variant: "ghost",
							size: "sm",
							title: strings.workspaceRename,
							onPointerDown: (e) => e.stopPropagation(),
							onClick: (e) => {
								e.stopPropagation();
								renameWorkspace(group);
							}
						}, strings.workspaceRename), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							className: "dsh-delete-session__group-action dsh-delete-session__group-action--danger",
							variant: "ghost",
							size: "sm",
							title: strings.workspaceDelete,
							onPointerDown: (e) => e.stopPropagation(),
							onClick: (e) => {
								e.stopPropagation();
								deleteWorkspace(group);
							}
						}, strings.workspaceDelete)) : null
					]
				});
			};
			const renderWorkspaceGroup = (group, index) => {
				const next = index + 1 < activeGroups.length ? activeGroups[index + 1] : null;
				return (0, react.createElement)("div", {
					key: group.workspaceId,
					className: "dsh-delete-session__group",
					"data-first": index === 0 || void 0,
					"data-line-top": dropSlot === `before:${group.workspaceId}` || void 0,
					"data-line-end": dropSlot === "__end__" && next === null || void 0
				}, renderWorkspaceLabel(group, index), (0, react.createElement)("ul", { className: "dsh-delete-session__list" }, ...group.rows.map((session) => renderRow(session, false))));
			};
			const markRemoved = (0, react.useCallback)((sessionId) => {
				setRemoved((previous) => {
					const next = new Set(previous);
					next.add(sessionId);
					saveRemoved(next);
					return next;
				});
			}, []);
			const handleDelete = (0, react.useCallback)(async (sessionId, title) => {
				if (!window.confirm(strings.confirm.replace("{title}", title))) return;
				saveTitle(sessionId, title);
				setBusyId(sessionId);
				setNotice(null);
				try {
					const response = await fetch(DELETE_ROUTE, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ sessionId })
					});
					const data = await response.json().catch(() => ({}));
					if (!response.ok || data.ok !== true) throw new Error(data.error ?? `HTTP ${response.status}`);
					await loadTrash();
					showNotice({
						kind: "ok",
						text: strings.deleted.replace("{title}", title)
					});
					sessions.refresh?.();
				} catch (error) {
					const code = error instanceof Error ? error.message : "";
					const friendly = code === "session-live" ? strings.liveError : code === "session-not-found" ? strings.notFoundError : "";
					const suffix = friendly !== "" ? friendly : code !== "" ? ` (${code})` : "";
					showNotice({
						kind: "error",
						text: strings.failed.replace("{title}", title) + suffix
					});
				} finally {
					setBusyId(null);
				}
			}, [
				strings,
				loadTrash,
				showNotice,
				sessions
			]);
			const toggleSelected = (0, react.useCallback)((sessionId) => {
				setSelectedIds((previous) => {
					const next = new Set(previous);
					if (next.has(sessionId)) next.delete(sessionId);
					else next.add(sessionId);
					return next;
				});
			}, []);
			const toggleSelectAll = (0, react.useCallback)(() => {
				setSelectedIds((previous) => {
					const next = new Set(previous);
					const selectable = filteredActive.filter((session) => !session.running && session.id !== list.current);
					const allSelected = selectable.length > 0 && selectable.every((session) => next.has(session.id));
					for (const session of selectable) if (allSelected) next.delete(session.id);
					else next.add(session.id);
					return next;
				});
			}, [filteredActive, list.current]);
			const toggleSelectWorkspace = (0, react.useCallback)((group) => {
				setSelectedIds((previous) => {
					const next = new Set(previous);
					const selectable = group.rows.filter((session) => !session.running && session.id !== list.current);
					const allSelected = selectable.length > 0 && selectable.every((session) => next.has(session.id));
					for (const session of selectable) if (allSelected) next.delete(session.id);
					else next.add(session.id);
					return next;
				});
			}, [list.current]);
			const handleBatchDelete = (0, react.useCallback)(async () => {
				const ids = [...selectedIds];
				if (ids.length === 0) return;
				if (!window.confirm(strings.batchDeleteConfirm.replace("{count}", String(ids.length)))) return;
				setNotice(null);
				let okCount = 0;
				let failCount = 0;
				const failedTitles = [];
				for (const sessionId of ids) {
					const title = list.byId[sessionId]?.displayTitle ?? sessionId;
					saveTitle(sessionId, title);
					try {
						const response = await fetch(DELETE_ROUTE, {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ sessionId })
						});
						const data = await response.json().catch(() => ({}));
						if (!response.ok || data.ok !== true) throw new Error(data.error ?? `HTTP ${response.status}`);
						okCount += 1;
					} catch (error) {
						failCount += 1;
						const code = error instanceof Error ? error.message : "";
						const friendly = code === "session-live" ? strings.liveError : code === "session-not-found" ? strings.notFoundError : "";
						failedTitles.push(friendly !== "" ? `${title} (${friendly})` : code !== "" ? `${title} (${code})` : title);
					}
				}
				setSelectedIds(/* @__PURE__ */ new Set());
				await loadTrash();
				if (failCount === 0) showNotice({
					kind: "ok",
					text: strings.batchDeleted.replace("{count}", String(okCount))
				});
				else {
					const detail = failedTitles.slice(0, 3).join(strings.listSeparator) + (failedTitles.length > 3 ? "…" : "");
					const result = strings.batchResult(okCount, ids.length, failCount, detail);
					showNotice({
						kind: "error",
						text: strings.batchFailed.replace("{msg}", result)
					});
				}
				sessions.refresh?.();
			}, [
				selectedIds,
				strings,
				list.byId,
				loadTrash,
				showNotice,
				sessions
			]);
			const handleRestore = (0, react.useCallback)(async (sessionId, title) => {
				if (!window.confirm(strings.restoreConfirm.replace("{title}", title))) return;
				setBusyId(sessionId);
				setNotice(null);
				try {
					const response = await fetch(RESTORE_ROUTE, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ sessionId })
					});
					const data = await response.json().catch(() => ({}));
					if (!response.ok || data.ok !== true) throw new Error(data.error ?? `HTTP ${response.status}`);
					await loadTrash();
					showNotice({
						kind: "ok",
						text: strings.restored.replace("{title}", title)
					});
					sessions.refresh?.();
				} catch (error) {
					const code = error instanceof Error ? error.message : "";
					const suffix = code !== "" ? ` (${code})` : "";
					showNotice({
						kind: "error",
						text: strings.restoreFailed.replace("{title}", title) + suffix
					});
				} finally {
					setBusyId(null);
				}
			}, [
				strings,
				loadTrash,
				showNotice,
				sessions
			]);
			const handlePurge = (0, react.useCallback)(async (sessionId, title) => {
				if (!window.confirm(strings.purgeConfirm.replace("{title}", title))) return;
				setBusyId(sessionId);
				setNotice(null);
				try {
					const response = await fetch(PURGE_ROUTE, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ sessionId })
					});
					const data = await response.json().catch(() => ({}));
					if (!response.ok || data.ok !== true) throw new Error(data.error ?? `HTTP ${response.status}`);
					markRemoved(sessionId);
					await loadTrash();
					showNotice({
						kind: "ok",
						text: strings.purged.replace("{title}", title)
					});
					sessions.refresh?.();
				} catch (error) {
					const code = error instanceof Error ? error.message : "";
					const suffix = code !== "" ? ` (${code})` : "";
					showNotice({
						kind: "error",
						text: strings.purgeFailed.replace("{title}", title) + suffix
					});
				} finally {
					setBusyId(null);
				}
			}, [
				strings,
				loadTrash,
				markRemoved,
				showNotice,
				sessions
			]);
			const handleStats = (0, react.useCallback)(async (sessionId) => {
				if (statsId === sessionId) {
					setStatsId(null);
					setStats(null);
					return;
				}
				setStatsId(sessionId);
				setStats({
					status: "loading",
					data: null
				});
				try {
					const response = await api.sessions.history({ sessionId });
					if (!response.result.ok) {
						setStats({
							status: "error",
							data: null
						});
						return;
					}
					setStats({
						status: "ready",
						data: foldStats(response.result.value.events)
					});
				} catch {
					setStats({
						status: "error",
						data: null
					});
				}
			}, [api, statsId]);
			const closeStats = (0, react.useCallback)(() => {
				setStatsId(null);
				setStats(null);
			}, []);
			(0, react.useEffect)(() => {
				if (statsId === null) return;
				const onKeyDown = (event) => {
					if (event.key === "Escape") closeStats();
				};
				document.addEventListener("keydown", onKeyDown);
				return () => document.removeEventListener("keydown", onKeyDown);
			}, [closeStats, statsId]);
			const handleContinue = (0, react.useCallback)(async (sessionId) => {
				markRead(sessionId);
				if (archivedSet.has(sessionId)) {
					setBusyId(sessionId);
					try {
						const response = await fetch(RESTORE_ROUTE, {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ sessionId })
						});
						const data = await response.json().catch(() => ({}));
						if (!response.ok || data.ok !== true) throw new Error(data.error ?? `HTTP ${response.status}`);
						await workspaceActions.refresh?.();
					} catch (error) {
						const code = error instanceof Error ? error.message : "";
						const suffix = code !== "" ? ` (${code})` : "";
						showNotice({
							kind: "error",
							text: strings.restoreFailed.replace("{title}", list.byId[sessionId]?.displayTitle ?? sessionId) + suffix
						});
						setBusyId(null);
						return;
					}
					setBusyId(null);
				}
				sessions.open(sessionId);
				close();
			}, [
				sessions,
				close,
				archivedSet,
				workspaceActions,
				showNotice,
				strings,
				list.byId
			]);
			const handleFork = (0, react.useCallback)(async (sessionId) => {
				setBusyId(sessionId);
				setNotice(null);
				try {
					const response = await api.sessions.fork({ sessionId });
					if (!response.result.ok) throw new Error(response.result.error?.code ?? "fork-failed");
					const childId = response.result.value.sessionId;
					sessions.open(childId);
					close();
				} catch (error) {
					const code = error instanceof Error ? error.message : "";
					const friendly = code === "fork-unavailable" ? strings.forkUnavailable : "";
					const suffix = friendly !== "" ? ` (${friendly})` : code !== "" ? ` (${code})` : "";
					showNotice({
						kind: "error",
						text: strings.forkFailed + suffix
					});
				} finally {
					setBusyId(null);
				}
			}, [
				api,
				sessions,
				close,
				strings,
				showNotice
			]);
			const handlePause = (0, react.useCallback)(async (sessionId) => {
				setBusyId(sessionId);
				setNotice(null);
				try {
					const response = await fetch(PAUSE_ROUTE, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ sessionId })
					});
					const data = await response.json().catch(() => ({}));
					if (!response.ok || data.ok !== true) throw new Error(data.error ?? `HTTP ${response.status}`);
					showNotice({
						kind: "ok",
						text: strings.paused
					});
				} catch (error) {
					const code = error instanceof Error ? error.message : "";
					const suffix = code !== "" ? ` (${code})` : "";
					showNotice({
						kind: "error",
						text: strings.pauseFailed + suffix
					});
				} finally {
					setBusyId(null);
				}
			}, [strings, showNotice]);
			const handleOpenFolder = (0, react.useCallback)(async (sessionId) => {
				setBusyId(sessionId);
				setNotice(null);
				try {
					const response = await fetch(OPEN_FOLDER_ROUTE, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ sessionId })
					});
					const data = await response.json().catch(() => ({}));
					if (!response.ok || data.ok !== true) throw new Error(data.error ?? `HTTP ${response.status}`);
					showNotice({
						kind: "ok",
						text: strings.folderOpen
					});
				} catch (error) {
					const code = error instanceof Error ? error.message : "";
					const suffix = code !== "" ? ` (${code})` : "";
					showNotice({
						kind: "error",
						text: strings.folderFailed + suffix
					});
				} finally {
					setBusyId(null);
				}
			}, [strings, showNotice]);
			const handleRename = (0, react.useCallback)(async (sessionId, currentTitle) => {
				const input = window.prompt(strings.renamePrompt, currentTitle);
				if (input === null) return;
				const title = input.trim();
				if (title === "" || title === currentTitle) return;
				setBusyId(sessionId);
				setNotice(null);
				try {
					const response = await fetch(RENAME_ROUTE, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							sessionId,
							title
						})
					});
					const data = await response.json().catch(() => ({}));
					if (!response.ok || data.ok !== true) throw new Error(data.error ?? `HTTP ${response.status}`);
					const acceptedTitle = data.title;
					if (acceptedTitle !== void 0 && acceptedTitle !== "") setRenamedTitles((previous) => {
						const next = { ...previous };
						next[sessionId] = acceptedTitle;
						return next;
					});
					showNotice({
						kind: "ok",
						text: strings.renamed
					});
				} catch (error) {
					const code = error instanceof Error ? error.message : "";
					const suffix = code !== "" ? ` (${code})` : "";
					showNotice({
						kind: "error",
						text: strings.renameFailed + suffix
					});
				} finally {
					setBusyId(null);
				}
			}, [strings, showNotice]);
			const handleExport = (0, react.useCallback)(async (sessionId, format) => {
				setBusyId(sessionId);
				setNotice(null);
				try {
					const response = await fetch(EXPORT_ROUTE, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							sessionId,
							format
						})
					});
					const data = await response.json().catch(() => ({}));
					if (!response.ok || data.ok !== true || data.content === void 0) throw new Error(data.error ?? `HTTP ${response.status}`);
					const session = list.byId[sessionId];
					const base = (renamedTitles[sessionId] ?? session?.displayTitle ?? sessionId).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 60) || "session";
					const blob = new Blob([data.content], { type: format === "json" ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8" });
					const url = URL.createObjectURL(blob);
					const anchor = document.createElement("a");
					anchor.href = url;
					anchor.download = `${base}-${sessionId.slice(0, 8)}.${format}`;
					document.body.appendChild(anchor);
					anchor.click();
					anchor.remove();
					URL.revokeObjectURL(url);
					showNotice({
						kind: "ok",
						text: strings.exported
					});
				} catch (error) {
					const code = error instanceof Error ? error.message : "";
					const suffix = code !== "" ? ` (${code})` : "";
					showNotice({
						kind: "error",
						text: strings.exportFailed + suffix
					});
				} finally {
					setBusyId(null);
				}
			}, [
				strings,
				showNotice,
				list.byId,
				renamedTitles
			]);
			const renderStatsDialog = () => {
				if (statsId === null || stats === null) return null;
				const sessionTitle = list.byId[statsId]?.displayTitle ?? statsId;
				let body;
				if (stats.status === "loading") body = (0, react.createElement)("div", { className: "dsh-stats-dialog__body" }, strings.statsLoading);
				else if (stats.status === "error") body = (0, react.createElement)("div", { className: "dsh-stats-dialog__body" }, strings.statsFailed);
				else {
					const data = stats.data;
					if (data === null || data.turns === 0 && data.userMessages === 0 && data.assistantMessages === 0 && data.toolCalls.length === 0) body = (0, react.createElement)("div", { className: "dsh-stats-dialog__body" }, strings.statsEmpty);
					else {
						const items = [
							{
								label: strings.statsTurns,
								value: String(data.turns)
							},
							{
								label: strings.statsUser,
								value: String(data.userMessages)
							},
							{
								label: strings.statsAssistant,
								value: String(data.assistantMessages)
							}
						];
						if (data.toolCalls.length > 0) items.push({
							label: strings.statsTools,
							value: (0, react.createElement)("div", { className: "dsh-stats-dialog__tools" }, ...data.toolCalls.map((tool) => (0, react.createElement)("span", {
								className: "dsh-stats-dialog__tool",
								key: tool.name
							}, `${tool.name} ×${tool.count}`)))
						});
						if (data.startedAt > 0 && data.updatedAt > 0) items.push({
							label: strings.statsWindow,
							value: `${strings.deletedAt(data.startedAt)} ~ ${strings.deletedAt(data.updatedAt)}`
						});
						body = (0, react.createElement)("div", { className: "dsh-stats-dialog__body" }, (0, react.createElement)("dl", { className: "dsh-stats-dialog__grid" }, ...items.flatMap((item) => [(0, react.createElement)("dt", {
							className: "dsh-stats-dialog__label",
							key: `${item.label}-label`
						}, item.label), (0, react.createElement)("dd", {
							className: "dsh-stats-dialog__value",
							key: `${item.label}-value`
						}, item.value)])));
					}
				}
				return (0, react.createElement)("div", {
					"data-dsh-stats-backdrop": "",
					onMouseDown: (event) => {
						if (event.target === event.currentTarget) closeStats();
					}
				}, (0, react.createElement)("section", {
					"data-dsh-stats-dialog": "",
					role: "dialog",
					"aria-modal": true,
					"aria-label": strings.stats
				}, (0, react.createElement)("div", { className: "dsh-stats-dialog__header" }, (0, react.createElement)("div", { className: "dsh-stats-dialog__heading" }, (0, react.createElement)("div", { className: "dsh-stats-dialog__title" }, strings.stats), (0, react.createElement)("div", { className: "dsh-stats-dialog__session" }, sessionTitle)), (0, react.createElement)("button", {
					type: "button",
					className: "dsh-stats-dialog__close",
					title: strings.close,
					"aria-label": strings.close,
					onClick: closeStats,
					children: "×"
				})), body));
			};
			const renderRow = (session, isArchived) => {
				const isCurrent = !isArchived && session.id === list.current;
				const isRunning = session.running;
				const busy = busyId === session.id;
				const protectedReason = isCurrent ? strings.current : isRunning ? strings.running : "";
				const metaParts = [session.cwd ?? strings.noCwd];
				if (isArchived) metaParts.push(strings.archived);
				if (protectedReason !== "" && !isCurrent) metaParts.push(protectedReason);
				const statsOpen = statsId === session.id;
				const rowDraggable = !isArchived && !isRunning && !busy;
				return (0, react.createElement)("li", {
					key: session.id,
					className: "dsh-delete-session__row",
					"data-current": isCurrent || void 0,
					"data-current-label": strings.current,
					"data-archived": isArchived || void 0,
					"data-stats-open": statsOpen || void 0,
					draggable: rowDraggable || void 0,
					"data-drag-session": dragSessionId === session.id || void 0,
					title: rowDraggable ? strings.dragToMoveHint : void 0,
					onDragStart: rowDraggable ? (e) => {
						if (e.dataTransfer === null) return;
						e.dataTransfer.setData("text/plain", session.id);
						e.dataTransfer.effectAllowed = "move";
						setDragSessionId(session.id);
					} : void 0,
					onDragEnd: rowDraggable ? () => setDragSessionId(null) : void 0
				}, (0, react.createElement)("input", {
					type: "checkbox",
					className: "dsh-delete-session__checkbox",
					checked: selectedIds.has(session.id),
					disabled: isRunning || busy,
					title: protectedReason !== "" ? protectedReason : strings.select,
					"aria-label": strings.select,
					onChange: () => toggleSelected(session.id)
				}), (0, react.createElement)("div", { className: "dsh-delete-session__row-main" }, (0, react.createElement)("div", {
					className: "dsh-delete-session__row-title",
					title: session.displayTitle
				}, (0, react.createElement)("span", { className: "dsh-delete-session__row-title-text" }, session.displayTitle), (() => {
					const dotStatus = rowStatusDot(session, unread.has(session.id));
					return renderStatusDot(dotStatus, dotStatus !== null ? strings.read : strings.unread, () => {
						if (dotStatus === "amber" || dotStatus === "green") {
							try {
								const manager = sessions.manager;
								if (dotStatus === "green" ? manager?.completedNotifications?.delete(session.id) ?? false : manager?.pendingInteractions?.delete(session.id) ?? false) manager?.notifier?.markDirty();
							} catch {}
							setUnread(session.id, false);
						} else setUnread(session.id, dotStatus === null);
					});
				})()), (0, react.createElement)("div", {
					className: "dsh-delete-session__row-meta",
					title: metaParts.join(" · ")
				}, metaParts.join(" · "))), (0, react.createElement)("span", { className: "dsh-delete-session__more-wrap" }, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					className: "dsh-row-action",
					variant: "outline",
					size: "sm",
					disabled: busy,
					title: strings.more,
					onClick: () => {
						setMoveOpenId(null);
						setMoreOpenId(moreOpenId === session.id ? null : session.id);
					},
					children: strings.more
				}), moreOpenId === session.id && (0, react.createElement)("div", { className: "dsh-delete-session__more-menu" }, (0, react.createElement)("button", {
					type: "button",
					className: "dsh-delete-session__more-item",
					disabled: isRunning || busy,
					title: isRunning ? strings.running : strings.continue,
					onClick: () => {
						setMoreOpenId(null);
						handleContinue(session.id);
					}
				}, strings.continue), isRunning && (0, react.createElement)("button", {
					type: "button",
					className: "dsh-delete-session__more-item",
					disabled: busy,
					onClick: () => {
						setMoreOpenId(null);
						handlePause(session.id);
					}
				}, strings.pause), isArchived && (0, react.createElement)("button", {
					type: "button",
					className: "dsh-delete-session__more-item",
					disabled: busy,
					onClick: () => {
						setMoreOpenId(null);
						handleRestore(session.id, session.displayTitle);
					}
				}, strings.restore), (0, react.createElement)("button", {
					type: "button",
					className: "dsh-delete-session__more-item",
					disabled: isRunning || busy,
					title: isRunning ? strings.running : strings.fork,
					onClick: () => {
						setMoreOpenId(null);
						handleFork(session.id);
					}
				}, strings.fork), (0, react.createElement)("button", {
					type: "button",
					className: "dsh-delete-session__more-item",
					disabled: busy,
					onClick: () => {
						setMoreOpenId(null);
						handleRename(session.id, session.displayTitle);
					}
				}, strings.rename), (0, react.createElement)("button", {
					type: "button",
					className: "dsh-delete-session__more-item",
					disabled: busy,
					onClick: () => {
						setMoreOpenId(null);
						handleExport(session.id, "markdown");
					}
				}, strings.exportMd), (0, react.createElement)("button", {
					type: "button",
					className: "dsh-delete-session__more-item",
					disabled: busy,
					onClick: () => {
						setMoreOpenId(null);
						handleExport(session.id, "json");
					}
				}, strings.exportJson), (0, react.createElement)("button", {
					type: "button",
					className: "dsh-delete-session__more-item",
					disabled: busy,
					onClick: () => {
						setMoreOpenId(null);
						handleStats(session.id);
					}
				}, strings.stats), (0, react.createElement)("button", {
					type: "button",
					className: "dsh-delete-session__more-item",
					disabled: busy,
					onClick: () => {
						setMoreOpenId(null);
						handleOpenFolder(session.id);
					}
				}, strings.folder), (0, react.createElement)("button", {
					type: "button",
					className: "dsh-delete-session__more-item",
					disabled: isRunning || busy || isArchived || session.cwd === void 0,
					title: strings.moveToWorkspace,
					onClick: () => setMoveOpenId(moveOpenId === session.id ? null : session.id)
				}, strings.moveTo), moveOpenId === session.id && (0, react.createElement)("div", { className: "dsh-delete-session__more-menu dsh-delete-session__move-menu" }, ...(() => {
					const targets = workspaces.items.filter((view) => !view.sessionIds.includes(session.id));
					return targets.length > 0 ? targets.map((view) => (0, react.createElement)("button", {
						type: "button",
						key: view.workspaceId,
						className: "dsh-delete-session__more-item",
						disabled: busy,
						onClick: () => {
							setMoreOpenId(null);
							handleMoveToWorkspace(session.id, view.workspaceId);
						}
					}, view.title || view.path)) : [(0, react.createElement)("button", {
						type: "button",
						key: "__none__",
						className: "dsh-delete-session__more-item",
						disabled: true
					}, strings.moveNoTargets)];
				})(), (0, react.createElement)("button", {
					type: "button",
					key: "__new__",
					className: "dsh-delete-session__more-item",
					disabled: busy || isArchived || session.cwd === void 0,
					title: strings.moveToWorkspace,
					onClick: () => {
						setMoveOpenId(null);
						setMoreOpenId(null);
						if (session.cwd !== void 0) handleMoveToNewWorkspace(session.id, session.cwd);
					}
				}, strings.moveToNewWorkspace)))), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					className: "dsh-row-action dsh-row-action--danger",
					variant: "outline",
					size: "sm",
					icon: (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, { size: 16 }),
					disabled: isRunning || busy,
					title: protectedReason !== "" && !isCurrent ? protectedReason : strings.delete,
					onClick: () => void handleDelete(session.id, session.displayTitle),
					children: busy ? strings.deleting : strings.delete
				}));
			};
			const renderTrashRow = (entry) => {
				const title = trashEntryTitle(loadTitles(), entry, list.byId[entry.sessionId]?.displayTitle);
				const busy = busyId === entry.sessionId;
				return (0, react.createElement)("li", {
					key: entry.sessionId,
					className: "dsh-delete-session__row",
					"data-trash": true
				}, (0, react.createElement)("div", { className: "dsh-delete-session__row-main" }, (0, react.createElement)("div", {
					className: "dsh-delete-session__row-title",
					title
				}, title), (0, react.createElement)("div", {
					className: "dsh-delete-session__row-meta",
					title: [entry.cwd ?? strings.noCwd, strings.deletedAt(entry.deletedAt)].join(" · ")
				}, [entry.cwd ?? strings.noCwd, strings.deletedAt(entry.deletedAt)].join(" · "))), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					className: "dsh-row-action",
					variant: "outline",
					size: "sm",
					disabled: busy,
					onClick: () => void handleRestore(entry.sessionId, title),
					children: strings.restore
				}), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					className: "dsh-row-action dsh-row-action--danger",
					variant: "outline",
					size: "sm",
					icon: (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, { size: 16 }),
					disabled: busy,
					onClick: () => void handlePurge(entry.sessionId, title),
					children: strings.purge
				}));
			};
			return (0, react.createElement)("div", { "data-dsh-delete-session": "" }, (0, react.createElement)("div", { className: "dsh-delete-session__header" }, (0, react.createElement)("span", { className: "dsh-delete-session__title" }, strings.title), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				className: "dsh-delete-session__sort",
				variant: "ghost",
				size: "sm",
				title: newestFirst ? strings.sortOldest : strings.sortNewest,
				onClick: () => setNewestFirst((value) => !value),
				children: newestFirst ? strings.sortNewest : strings.sortOldest
			}), (0, react.createElement)("span", { className: "dsh-delete-session__count" }, strings.count(filteredActive.length))), (0, react.createElement)("div", { className: "dsh-delete-session__filter" }, (0, react.createElement)("input", {
				type: "search",
				className: "dsh-delete-session__search",
				placeholder: strings.searchPlaceholder,
				"aria-label": strings.searchPlaceholder,
				value: query,
				onChange: (e) => setQuery(e.currentTarget.value)
			}), (0, react.createElement)("div", { className: "dsh-delete-session__filter-chips" }, [
				"all",
				"running",
				"unread",
				"archived"
			].map((key) => (0, react.createElement)("button", {
				type: "button",
				key,
				className: "dsh-delete-session__chip" + (statusFilter === key ? " dsh-delete-session__chip--active" : ""),
				onClick: () => setStatusFilter(key)
			}, key === "all" ? strings.filterAll : key === "running" ? strings.filterRunning : key === "unread" ? strings.filterUnread : strings.filterArchived)))), activeRows.length > 0 && (0, react.createElement)("div", { className: "dsh-delete-session__batch" }, (0, react.createElement)("label", { className: "dsh-delete-session__batch-select-all" }, (0, react.createElement)("input", {
				type: "checkbox",
				checked: filteredActive.some((session) => !session.running && session.id !== list.current) && filteredActive.every((session) => session.running || session.id === list.current || selectedIds.has(session.id)),
				onChange: () => toggleSelectAll(),
				"aria-label": strings.selectAll
			}), (0, react.createElement)("span", null, strings.selectAll)), (0, react.createElement)("span", { className: "dsh-delete-session__batch-count" }, strings.selectedCount(selectedIds.size)), (0, react.createElement)("span", { className: "dsh-delete-session__more-wrap" }, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				className: "dsh-row-action",
				variant: "outline",
				size: "sm",
				disabled: selectedIds.size === 0,
				title: strings.batchMove,
				onClick: () => setBatchMoveOpen((open) => !open),
				children: strings.batchMove
			}), batchMoveOpen && (0, react.createElement)("div", { className: "dsh-delete-session__more-menu" }, ...workspaces.items.filter((view) => view.workspaceId !== "__ungrouped__").map((view) => (0, react.createElement)("button", {
				type: "button",
				key: view.workspaceId,
				className: "dsh-delete-session__more-item",
				onClick: () => void handleBatchMove(view.workspaceId)
			}, view.title || view.path)))), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				className: "dsh-row-action dsh-row-action--danger",
				variant: "outline",
				size: "sm",
				icon: (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, { size: 16 }),
				disabled: selectedIds.size === 0,
				title: strings.batchDelete,
				onClick: () => void handleBatchDelete(),
				children: strings.batchDelete
			})), notice !== null && (0, react.createElement)("div", { className: `dsh-delete-session__notice dsh-delete-session__notice--${notice.kind}` }, notice.text), !showActiveSection ? null : filteredActive.length === 0 ? (0, react.createElement)("div", { className: "dsh-delete-session__empty" }, queryNorm !== "" || statusFilter !== "all" ? strings.noMatch : strings.empty) : activeGroups.map((group, index) => renderWorkspaceGroup(group, index)), showArchivedSection && filteredArchived.length > 0 && (0, react.createElement)("div", { className: "dsh-delete-session__group" }, (0, react.createElement)("button", {
				type: "button",
				className: "dsh-delete-session__group-toggle",
				onClick: () => setArchivedOpen((open) => !open),
				"aria-expanded": archivedOpen || void 0
			}, (0, react.createElement)("span", { className: "dsh-delete-session__group-toggle-label" }, `${strings.archivedGroup} (${filteredArchived.length})`), (0, react.createElement)("span", { className: "dsh-delete-session__group-toggle-chevron" }, archivedOpen ? strings.collapse : strings.expand)), archivedOpen && (0, react.createElement)("ul", { className: "dsh-delete-session__list" }, ...filteredArchived.map((session) => renderRow(session, true))), (0, react.createElement)("div", { className: "dsh-delete-session__group-hint" }, strings.archivedHint)), trash !== null && (0, react.createElement)("div", { className: "dsh-delete-session__group" }, (0, react.createElement)("button", {
				type: "button",
				className: "dsh-delete-session__group-toggle",
				onClick: () => setTrashOpen((open) => !open),
				"aria-expanded": trashOpen || void 0
			}, (0, react.createElement)("span", { className: "dsh-delete-session__group-toggle-label" }, `${strings.trashGroup} (${trash.length}/${trashLimit})`), (0, react.createElement)("span", { className: "dsh-delete-session__group-toggle-chevron" }, trashOpen ? strings.collapse : strings.expand)), trashFailed ? (0, react.createElement)("div", { className: "dsh-delete-session__group-hint" }, strings.trashLoadFailed) : trashOpen && (trash.length === 0 ? (0, react.createElement)("div", { className: "dsh-delete-session__empty" }, strings.trashEmpty) : (0, react.createElement)("ul", { className: "dsh-delete-session__list" }, ...trash.map((entry) => renderTrashRow(entry)))), (0, react.createElement)("div", { className: "dsh-delete-session__group-hint" }, strings.trashHint.replace("{limit}", String(trashLimit)))), renderStatsDialog());
		}
		function apply(ctx) {
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = STYLE;
			document.head.append(style);
			const { api } = ctx.get("connection");
			const sessions = ctx.sessions;
			const workspaces = ctx.workspaces;
			const syncLocale = () => {
				setAppLocale(ctx.locale.getLocale().active);
			};
			syncLocale();
			ctx.effect(() => {
				const unsubscribe = ctx.locale.subscribe(syncLocale);
				return () => unsubscribe();
			}, "dsh-session-manager: locale sync");
			ctx.effect(() => ctx.locale.register(NS, {
				zh: NAV_ZH,
				en: NAV_EN
			}), "dsh-delete-session: dictionaries");
			ctx.effect(() => {
				let previous;
				const check = () => {
					const current = sessions.list.getSnapshot().current;
					if (current !== void 0 && current !== previous && unreadState.ids.has(current)) markRead(current);
					previous = current;
				};
				check();
				const unsubscribe = sessions.list.subscribe(check);
				return () => unsubscribe();
			}, "dsh-session-manager: selection auto-read");
			ctx.effect(() => {
				if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;
				const DOT_CLASS = "dsh-session-manager__row-unread-dot";
				let frame = 0;
				const decorate = () => {
					frame = 0;
					const snapshot = sessions.list.getSnapshot();
					const idByTitle = /* @__PURE__ */ new Map();
					for (const id of snapshot.ids) {
						const summary = snapshot.byId[id];
						if (summary !== void 0 && !summary.blank) idByTitle.set(summary.displayTitle, id);
					}
					for (const row of document.querySelectorAll("[role=\"treeitem\"]")) {
						let matchedId;
						let titleSpan = null;
						for (const span of row.querySelectorAll("span")) {
							const id = idByTitle.get(span.textContent?.trim() ?? "");
							if (id !== void 0) {
								matchedId = id;
								titleSpan = span;
								break;
							}
						}
						if (matchedId === void 0 || titleSpan === null) continue;
						const existing = row.querySelector(`.${DOT_CLASS}`);
						if (unreadState.ids.has(matchedId)) {
							if (existing === null) {
								const dot = document.createElement("span");
								dot.className = DOT_CLASS;
								dot.dataset.sessionId = matchedId;
								dot.title = stringsOf().read;
								titleSpan.parentNode?.insertBefore(dot, titleSpan);
							}
						} else if (existing !== null) existing.remove();
					}
				};
				const schedule = () => {
					if (frame === 0) frame = window.requestAnimationFrame(decorate);
				};
				decorate();
				const observer = new MutationObserver(schedule);
				observer.observe(document.body, {
					childList: true,
					subtree: true,
					attributes: true,
					attributeFilter: ["class"]
				});
				const onDocClick = (event) => {
					const target = event.target;
					if (!(target instanceof Element)) return;
					const dot = target.closest(`.${DOT_CLASS}`);
					if (dot === null) return;
					const id = dot.dataset.sessionId;
					if (id !== void 0 && id !== "") {
						event.stopPropagation();
						setUnread(id, false);
					}
				};
				document.addEventListener("click", onDocClick, true);
				return () => {
					observer.disconnect();
					document.removeEventListener("click", onDocClick, true);
					if (frame !== 0) window.cancelAnimationFrame(frame);
					document.querySelectorAll(`.${DOT_CLASS}`).forEach((dot) => dot.remove());
				};
			}, "dsh-session-manager: sidebar unread dots");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("settings.general.item", () => {
				return ctx.slots.register({
					name: "settings.general.item",
					id: "dsh-delete-session-compaction-threshold",
					order: 50,
					locale: NS
				}, CompactionThresholdRow);
			});
			ctx.slots.inject("settings.section", () => {
				const disposeRegistration = ctx.slots.register({
					name: "settings.section",
					id: "dsh-delete-session",
					order: 60,
					label: () => t("nav"),
					locale: NS,
					inject: () => ({
						api,
						sessions,
						workspaceActions: workspaces
					})
				}, SessionManager);
				return () => {
					disposeRegistration();
					style.remove();
				};
			});
			ctx.slots.inject("conversation.session.header.utilities", () => {
				const common = () => ({
					api,
					sessions,
					workspaceActions: workspaces
				});
				const disposers = [
					ctx.slots.register({
						name: "conversation.session.header.utilities",
						id: "dsh-delete-session-drawer-host",
						order: -40,
						locale: NS,
						inject: common
					}, SessionDrawerHost),
					ctx.slots.register({
						name: "conversation.session.header.utilities",
						id: "dsh-delete-session-manage",
						order: -30,
						locale: NS,
						inject: common
					}, HeaderManageButton),
					ctx.slots.register({
						name: "conversation.session.header.utilities",
						id: "dsh-delete-session",
						order: -10,
						locale: NS,
						inject: () => ({})
					}, DeleteCurrentButton)
				];
				return () => {
					disposers.forEach((dispose) => dispose());
				};
			});
		}
		/** Red "delete this session" button mounted in the conversation header. */
		function DeleteCurrentButton({ sessionId }) {
			const strings = useLocaleStrings();
			const handleClick = () => {
				if (!window.confirm(strings.deleteCurrentConfirm)) return;
				(async () => {
					try {
						const response = await fetch(DELETE_ROUTE, {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ sessionId })
						});
						const data = await response.json().catch(() => ({}));
						if (!response.ok || data.ok !== true) throw new Error(data.error ?? `HTTP ${response.status}`);
					} catch (error) {
						const code = error instanceof Error ? error.message : "";
						const friendly = code === "session-live" ? strings.deleteCurrentRunning : "";
						const suffix = friendly !== "" ? ` (${friendly})` : code !== "" ? ` (${code})` : "";
						window.alert(strings.deleteCurrentFailed + suffix);
					}
				})();
			};
			return (0, react.createElement)("button", {
				type: "button",
				"data-dsh-delete-current": "",
				title: strings.deleteCurrent,
				"aria-label": strings.deleteCurrent,
				onClick: handleClick,
				children: strings.deleteCurrent
			});
		}
		/** Default of the official `dsh-compaction-basic` plugin (`thresholdRatio`). */
		const COMPACTION_DEFAULT_RATIO = .8;
		/** Allowed threshold range, in percent (mirrors the slider and the input).
		* The engine requires thresholdRatio > retainRatio (default 0.16), hence the
		* 17% floor. */
		const COMPACTION_MIN_PERCENT = 17;
		const COMPACTION_MAX_PERCENT = 90;
		/**
		* A General-settings preference row for the context compaction threshold.
		* Reads the current value and saves through our host routes: the loader
		* applies the change to the running compaction plugin immediately and the
		* host persists it into the profile's user patch layer, so the value sticks
		* across restarts.
		*/
		function CompactionThresholdRow(_props) {
			const strings = useLocaleStrings();
			const [ratio, setRatio] = (0, react.useState)(COMPACTION_DEFAULT_RATIO);
			const [draft, setDraft] = (0, react.useState)("");
			const [touched, setTouched] = (0, react.useState)(false);
			const percent = Math.round(ratio * 1e3) / 10;
			const [slider, setSlider] = (0, react.useState)(Math.min(COMPACTION_MAX_PERCENT, Math.max(COMPACTION_MIN_PERCENT, percent)));
			(0, react.useEffect)(() => {
				if (touched) return;
				setSlider((current) => {
					const next = Math.min(COMPACTION_MAX_PERCENT, Math.max(COMPACTION_MIN_PERCENT, percent));
					return current === next ? current : next;
				});
			}, [percent, touched]);
			(0, react.useEffect)(() => {
				let cancelled = false;
				(async () => {
					try {
						const data = await (await fetch(COMPACTION_THRESHOLD_ROUTE)).json().catch(() => ({}));
						if (!cancelled && data.ok === true && typeof data.ratio === "number") setRatio(data.ratio);
					} catch {}
				})();
				return () => {
					cancelled = true;
				};
			}, []);
			const display = draft !== "" ? draft : String(slider);
			const [saveState, setSaveState] = (0, react.useState)("idle");
			const commit = () => {
				const raw = draft.trim();
				setDraft("");
				if (raw === "") return;
				const parsed = Number(raw);
				if (!Number.isFinite(parsed)) return;
				setSlider(Math.min(COMPACTION_MAX_PERCENT, Math.max(COMPACTION_MIN_PERCENT, parsed)));
				setTouched(true);
			};
			const save = () => {
				if (saveState === "saving") return;
				const next = slider / 100;
				setSaveState("saving");
				(async () => {
					try {
						const response = await fetch(COMPACTION_THRESHOLD_ROUTE, {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ ratio: next })
						});
						const data = await response.json().catch(() => ({}));
						if (!response.ok || data.ok !== true) throw new Error(data.error ?? `HTTP ${response.status}`);
						setRatio(next);
						setSlider(Math.round(next * 100));
						setTouched(false);
						setSaveState("saved");
						window.setTimeout(() => setSaveState("idle"), 1500);
					} catch (error) {
						const message = error instanceof Error ? error.message : "";
						window.alert(strings.compactionSaveFailed + (message !== "" ? ` (${message})` : ""));
						setSaveState("idle");
					}
				})();
			};
			return (0, react.createElement)("div", { className: "dsh-delete-session__general-row" }, (0, react.createElement)("div", { className: "dsh-delete-session__general-row-head" }, (0, react.createElement)("div", { className: "dsh-delete-session__general-row-text" }, (0, react.createElement)("div", { className: "dsh-delete-session__general-row-title" }, strings.compactionThresholdTitle), (0, react.createElement)("div", { className: "dsh-delete-session__general-row-desc" }, strings.compactionThresholdDesc)), (0, react.createElement)("div", { className: "dsh-delete-session__general-input-wrap" }, (0, react.createElement)("input", {
				className: "dsh-delete-session__general-input",
				type: "number",
				min: COMPACTION_MIN_PERCENT,
				max: COMPACTION_MAX_PERCENT,
				value: display,
				"aria-label": strings.compactionThresholdTitle,
				onChange: (e) => setDraft(e.currentTarget.value),
				onBlur: commit,
				onKeyDown: (e) => {
					if (e.key === "Enter") commit();
				}
			}), (0, react.createElement)("span", { className: "dsh-delete-session__general-percent" }, "%"), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				className: "dsh-delete-session__general-save",
				variant: "outline",
				size: "sm",
				disabled: saveState === "saving",
				onClick: save,
				children: saveState === "saved" ? strings.compactionSaved : strings.compactionSave
			}))), (0, react.createElement)("div", { className: "dsh-delete-session__general-slider-wrap" }, (0, react.createElement)("input", {
				className: "dsh-delete-session__general-slider",
				type: "range",
				min: COMPACTION_MIN_PERCENT,
				max: COMPACTION_MAX_PERCENT,
				step: 1,
				value: slider,
				"aria-label": strings.compactionThresholdTitle,
				onChange: (e) => {
					const next = Number(e.currentTarget.value);
					setSlider(next);
					setDraft("");
					setTouched(true);
				}
			}), (0, react.createElement)("div", { className: "dsh-delete-session__general-slider-scale" }, (0, react.createElement)("span", {}, `${COMPACTION_MIN_PERCENT}%`), (0, react.createElement)("span", {}, `${Math.floor(107 / 2)}%`), (0, react.createElement)("span", {}, `${COMPACTION_MAX_PERCENT}%`))));
		}
		const drawerState = {
			open: false,
			pinned: false,
			view: "manage"
		};
		const drawerListeners = /* @__PURE__ */ new Set();
		function setDrawer(patch) {
			Object.assign(drawerState, patch);
			drawerListeners.forEach((listener) => listener());
		}
		/** Subscribe the calling component to the module-level drawer state. */
		function useDrawerState() {
			const [, force] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				const listener = () => force((value) => value + 1);
				drawerListeners.add(listener);
				return () => {
					drawerListeners.delete(listener);
				};
			}, []);
			return drawerState;
		}
		/** "对话管理" header button: open the drawer on the main list. */
		function HeaderManageButton(_props) {
			const strings = useLocaleStrings();
			return (0, react.createElement)("button", {
				type: "button",
				"data-dsh-header-button": "",
				title: strings.manageButton,
				onClick: () => {
					setDrawer({
						open: true,
						view: "manage"
					});
				},
				children: strings.manageButton
			});
		}
		/**
		* Drawer host: a session-scope entry that renders the drawer into a portal
		* when open. The drawer reads the full corpus itself through the wire
		* (`session.list` / `workspace.list`) because session-scope slots do not
		* receive the `useSessions`/`useWorkspaces` hooks.
		*/
		function SessionDrawerHost({ api, sessions }) {
			if (!useDrawerState().open) return null;
			return (0, react_dom.createPortal)((0, react.createElement)(SessionDrawer, {
				api,
				sessions
			}), document.body);
		}
		/** The right drawer: full session management (list, archived, trash). */
		function SessionDrawer({ api, sessions, workspaceActions }) {
			const state = useDrawerState();
			const strings = useLocaleStrings();
			const subscribe = (0, react.useCallback)((fn) => sessions.list.subscribe(fn), [sessions]);
			const getSnapshot = (0, react.useCallback)(() => sessions.list.getSnapshot(), [sessions]);
			const list = (0, react.useSyncExternalStore)(subscribe, getSnapshot);
			const [workspaces, setWorkspaces] = (0, react.useState)([]);
			const [archivedSet, setArchivedSet] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [loadError, setLoadError] = (0, react.useState)(false);
			const [trash, setTrash] = (0, react.useState)(null);
			const [trashLimit, setTrashLimit] = (0, react.useState)(10);
			const [trashFailed, setTrashFailed] = (0, react.useState)(false);
			const [archivedOpen, setArchivedOpen] = (0, react.useState)(false);
			const [trashOpen, setTrashOpen] = (0, react.useState)(state.view === "trash");
			const [busyId, setBusyId] = (0, react.useState)(null);
			const [statsId, setStatsId] = (0, react.useState)(null);
			const [stats, setStats] = (0, react.useState)(null);
			const unread = useUnread();
			const [moreOpenId, setMoreOpenId] = (0, react.useState)(null);
			const [moveOpenId, setMoveOpenId] = (0, react.useState)(null);
			const [newestFirst, setNewestFirst] = (0, react.useState)(true);
			const [dragWorkspaceId, setDragWorkspaceId] = (0, react.useState)(null);
			const [dropSlot, setDropSlot] = (0, react.useState)(null);
			const dropSlotRef = (0, react.useRef)(null);
			const groupsRef = (0, react.useRef)([]);
			const rows = list.phase === "ready" ? list.ids.map((id) => list.byId[id]).filter((summary) => !summary.blank).map((summary) => ({
				sessionId: summary.id,
				title: summary.displayTitle,
				cwd: summary.cwd,
				updatedAt: summary.updatedAt,
				running: summary.running,
				blank: summary.blank,
				archived: archivedSet.has(summary.id),
				pendingInteraction: summary.pendingInteraction,
				completed: summary.completed
			})) : null;
			(0, react.useEffect)(() => {
				if (moreOpenId === null) return;
				const onPointerDown = (event) => {
					if (!(event.target instanceof Element)) return;
					if (event.target.closest(".dsh-delete-session__more-wrap") !== null) return;
					setMoreOpenId(null);
					setMoveOpenId(null);
				};
				document.addEventListener("pointerdown", onPointerDown);
				return () => document.removeEventListener("pointerdown", onPointerDown);
			}, [moreOpenId]);
			const load = (0, react.useCallback)(async () => {
				try {
					const [workspacesRes, trashRes] = await Promise.all([api.workspace.list({}), fetch(TRASH_ROUTE)]);
					if (workspacesRes.result.ok) {
						setArchivedSet(new Set(workspacesRes.result.value.archivedSessionIds));
						setWorkspaces(workspacesRes.result.value.items);
						setLoadError(false);
					} else setLoadError(true);
					const trashData = await trashRes.json().catch(() => ({}));
					if (trashRes.ok && trashData.ok) {
						setTrash(trashData.entries);
						setTrashLimit(trashData.limit);
						setTrashFailed(false);
					} else setTrashFailed(true);
				} catch {
					setLoadError(true);
				}
			}, [api]);
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			(0, react.useEffect)(() => {
				const timer = window.setInterval(() => {
					load();
				}, 5e3);
				return () => window.clearInterval(timer);
			}, [load]);
			const refreshTrash = (0, react.useCallback)(async () => {
				try {
					const response = await fetch(TRASH_ROUTE);
					const data = await response.json().catch(() => ({}));
					if (response.ok && data.ok) {
						setTrash(data.entries);
						setTrashLimit(data.limit);
						setTrashFailed(false);
					} else setTrashFailed(true);
				} catch {
					setTrashFailed(true);
				}
			}, []);
			const showAlert = (text) => {
				window.alert(text);
			};
			const postAction = (0, react.useCallback)(async (route, sessionId) => {
				const response = await fetch(route, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sessionId })
				});
				const data = await response.json().catch(() => ({}));
				if (!response.ok || data.ok !== true) return data.error ?? `HTTP ${response.status}`;
				return null;
			}, []);
			const handleMoveToWorkspace = (0, react.useCallback)(async (sessionId, workspaceId) => {
				setMoveOpenId(null);
				setBusyId(sessionId);
				try {
					const response = await fetch(MOVE_WORKSPACE_ROUTE, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							sessionId,
							workspaceId
						})
					});
					const data = await response.json().catch(() => ({}));
					if (!response.ok || data.ok !== true) {
						const suffix = data.error === "session-live" ? strings.moveLive : "";
						const detail = data.detail !== void 0 ? `（${data.detail}）` : "";
						window.alert(strings.moveFailed(data.error ?? `HTTP ${response.status}`) + suffix + detail);
						return;
					}
					load();
				} catch {
					window.alert(strings.moveFailed("network"));
				} finally {
					setBusyId(null);
				}
			}, [strings, load]);
			const handleDelete = (0, react.useCallback)(async (sessionId, title) => {
				if (!window.confirm(strings.confirm.replace("{title}", title))) return;
				saveTitle(sessionId, title);
				setBusyId(sessionId);
				const error = await postAction(DELETE_ROUTE, sessionId).catch((e) => e instanceof Error ? e.message : "error");
				setBusyId(null);
				if (error !== null) {
					showAlert(strings.failed.replace("{title}", title) + ` (${error})`);
					return;
				}
				await Promise.all([load(), refreshTrash()]);
				try {
					await sessions.refresh?.();
				} catch {}
			}, [
				strings,
				postAction,
				load,
				refreshTrash,
				sessions
			]);
			const handleRestore = (0, react.useCallback)(async (sessionId, title) => {
				if (!window.confirm(strings.restoreConfirm.replace("{title}", title))) return;
				setBusyId(sessionId);
				const error = await postAction(RESTORE_ROUTE, sessionId).catch((e) => e instanceof Error ? e.message : "error");
				setBusyId(null);
				if (error !== null) {
					showAlert(strings.restoreFailed.replace("{title}", title) + ` (${error})`);
					return;
				}
				await Promise.all([load(), refreshTrash()]);
				try {
					await sessions.refresh?.();
				} catch {}
			}, [
				strings,
				postAction,
				load,
				refreshTrash,
				sessions
			]);
			const handlePurge = (0, react.useCallback)(async (sessionId, title) => {
				if (!window.confirm(strings.purgeConfirm.replace("{title}", title))) return;
				setBusyId(sessionId);
				const error = await postAction(PURGE_ROUTE, sessionId).catch((e) => e instanceof Error ? e.message : "error");
				setBusyId(null);
				if (error !== null) {
					showAlert(strings.purgeFailed.replace("{title}", title) + ` (${error})`);
					return;
				}
				await Promise.all([load(), refreshTrash()]);
				try {
					await sessions.refresh?.();
				} catch {}
			}, [
				strings,
				postAction,
				load,
				refreshTrash,
				sessions
			]);
			const handleStats = (0, react.useCallback)(async (sessionId) => {
				if (statsId === sessionId) {
					setStatsId(null);
					setStats(null);
					return;
				}
				setStatsId(sessionId);
				setStats({
					status: "loading",
					data: null
				});
				try {
					const response = await api.sessions.history({ sessionId });
					if (!response.result.ok) {
						setStats({
							status: "error",
							data: null
						});
						return;
					}
					setStats({
						status: "ready",
						data: foldStats(response.result.value.events)
					});
				} catch {
					setStats({
						status: "error",
						data: null
					});
				}
			}, [api, statsId]);
			const closeStats = (0, react.useCallback)(() => {
				setStatsId(null);
				setStats(null);
			}, []);
			(0, react.useEffect)(() => {
				if (statsId === null) return;
				const onKeyDown = (event) => {
					if (event.key === "Escape") closeStats();
				};
				document.addEventListener("keydown", onKeyDown);
				return () => document.removeEventListener("keydown", onKeyDown);
			}, [closeStats, statsId]);
			const handleOpenFolder = (0, react.useCallback)(async (sessionId) => {
				setBusyId(sessionId);
				const error = await postAction(OPEN_FOLDER_ROUTE, sessionId).catch((e) => e instanceof Error ? e.message : "error");
				setBusyId(null);
				if (error !== null) showAlert(strings.folderFailed + ` (${error})`);
			}, [strings, postAction]);
			const handleContinue = (0, react.useCallback)(async (sessionId) => {
				markRead(sessionId);
				if (archivedSet.has(sessionId)) {
					setBusyId(sessionId);
					const error = await postAction(RESTORE_ROUTE, sessionId).catch((e) => e instanceof Error ? e.message : "error");
					if (error !== null) {
						showAlert(strings.restoreFailed.replace("{title}", (rows ?? []).find((r) => r.sessionId === sessionId)?.title ?? sessionId) + ` (${error})`);
						setBusyId(null);
						return;
					}
					try {
						await workspaceActions?.refresh?.();
					} catch {}
					setBusyId(null);
				}
				sessions.open(sessionId);
				setDrawer({ open: false });
			}, [
				sessions,
				archivedSet,
				postAction,
				showAlert,
				strings,
				rows,
				workspaceActions
			]);
			const handleFork = (0, react.useCallback)(async (sessionId) => {
				setBusyId(sessionId);
				try {
					const response = await api.sessions.fork({ sessionId });
					if (!response.result.ok) throw new Error(response.result.error?.code ?? "fork-failed");
					const childId = response.result.value.sessionId;
					sessions.open(childId);
					setDrawer({ open: false });
				} catch (error) {
					const code = error instanceof Error ? error.message : "";
					const friendly = code === "fork-unavailable" ? strings.forkUnavailable : "";
					const suffix = friendly !== "" ? ` (${friendly})` : code !== "" ? ` (${code})` : "";
					showAlert(strings.forkFailed + suffix);
				} finally {
					setBusyId(null);
				}
			}, [
				api,
				sessions,
				strings,
				showAlert
			]);
			const renderStatsDialog = () => {
				if (statsId === null || stats === null) return null;
				const sessionTitle = rows?.find((row) => row.sessionId === statsId)?.title ?? statsId;
				let body;
				if (stats.status === "loading") body = (0, react.createElement)("div", { className: "dsh-stats-dialog__body" }, strings.statsLoading);
				else if (stats.status === "error") body = (0, react.createElement)("div", { className: "dsh-stats-dialog__body" }, strings.statsFailed);
				else {
					const data = stats.data;
					if (data === null || data.turns === 0 && data.userMessages === 0 && data.assistantMessages === 0 && data.toolCalls.length === 0) body = (0, react.createElement)("div", { className: "dsh-stats-dialog__body" }, strings.statsEmpty);
					else {
						const items = [
							{
								label: strings.statsTurns,
								value: String(data.turns)
							},
							{
								label: strings.statsUser,
								value: String(data.userMessages)
							},
							{
								label: strings.statsAssistant,
								value: String(data.assistantMessages)
							}
						];
						if (data.toolCalls.length > 0) items.push({
							label: strings.statsTools,
							value: (0, react.createElement)("div", { className: "dsh-stats-dialog__tools" }, ...data.toolCalls.map((tool) => (0, react.createElement)("span", {
								className: "dsh-stats-dialog__tool",
								key: tool.name
							}, `${tool.name} ×${tool.count}`)))
						});
						if (data.startedAt > 0 && data.updatedAt > 0) items.push({
							label: strings.statsWindow,
							value: `${strings.deletedAt(data.startedAt)} ~ ${strings.deletedAt(data.updatedAt)}`
						});
						body = (0, react.createElement)("div", { className: "dsh-stats-dialog__body" }, (0, react.createElement)("dl", { className: "dsh-stats-dialog__grid" }, ...items.flatMap((item) => [(0, react.createElement)("dt", {
							className: "dsh-stats-dialog__label",
							key: `${item.label}-label`
						}, item.label), (0, react.createElement)("dd", {
							className: "dsh-stats-dialog__value",
							key: `${item.label}-value`
						}, item.value)])));
					}
				}
				return (0, react.createElement)("div", {
					"data-dsh-stats-backdrop": "",
					onMouseDown: (event) => {
						if (event.target === event.currentTarget) closeStats();
					}
				}, (0, react.createElement)("section", {
					"data-dsh-stats-dialog": "",
					role: "dialog",
					"aria-modal": true,
					"aria-label": strings.stats
				}, (0, react.createElement)("div", { className: "dsh-stats-dialog__header" }, (0, react.createElement)("div", { className: "dsh-stats-dialog__heading" }, (0, react.createElement)("div", { className: "dsh-stats-dialog__title" }, strings.stats), (0, react.createElement)("div", { className: "dsh-stats-dialog__session" }, sessionTitle)), (0, react.createElement)("button", {
					type: "button",
					className: "dsh-stats-dialog__close",
					title: strings.close,
					"aria-label": strings.close,
					onClick: closeStats,
					children: "×"
				})), body));
			};
			const renderRow = (row) => {
				const busy = busyId === row.sessionId;
				const metaParts = [row.cwd ?? strings.noCwd];
				if (row.archived) metaParts.push(strings.archived);
				if (row.running) metaParts.push(strings.running);
				return (0, react.createElement)("li", {
					key: row.sessionId,
					className: "dsh-delete-session__row",
					"data-archived": row.archived || void 0
				}, (0, react.createElement)("div", { className: "dsh-delete-session__row-main" }, (0, react.createElement)("div", {
					className: "dsh-delete-session__row-title",
					title: row.title
				}, (0, react.createElement)("span", { className: "dsh-delete-session__row-title-text" }, row.title), (() => {
					const dotStatus = rowStatusDot(row, unread.has(row.sessionId));
					return renderStatusDot(dotStatus, dotStatus !== null ? strings.read : strings.unread, () => {
						if (dotStatus === "amber" || dotStatus === "green") {
							try {
								const manager = sessions.manager;
								if (dotStatus === "green" ? manager?.completedNotifications?.delete(row.sessionId) ?? false : manager?.pendingInteractions?.delete(row.sessionId) ?? false) manager?.notifier?.markDirty();
							} catch {}
							setUnread(row.sessionId, false);
						} else setUnread(row.sessionId, dotStatus === null);
					});
				})()), (0, react.createElement)("div", {
					className: "dsh-delete-session__row-meta",
					title: metaParts.join(" · ")
				}, metaParts.join(" · "))), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					className: "dsh-row-action",
					variant: "outline",
					size: "sm",
					disabled: row.running || busy,
					onClick: () => handleContinue(row.sessionId),
					children: strings.continue
				}), (0, react.createElement)("span", { className: "dsh-delete-session__more-wrap" }, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					className: "dsh-row-action",
					variant: "outline",
					size: "sm",
					disabled: busy,
					onClick: () => {
						setMoveOpenId(null);
						setMoreOpenId(moreOpenId === row.sessionId ? null : row.sessionId);
					},
					children: strings.more
				}), moreOpenId === row.sessionId && (0, react.createElement)("div", { className: "dsh-delete-session__more-menu" }, (0, react.createElement)("button", {
					type: "button",
					className: "dsh-delete-session__more-item",
					disabled: busy,
					onClick: () => {
						setMoreOpenId(null);
						handleStats(row.sessionId);
					}
				}, strings.stats), (0, react.createElement)("button", {
					type: "button",
					className: "dsh-delete-session__more-item",
					disabled: busy,
					onClick: () => {
						setMoreOpenId(null);
						handleOpenFolder(row.sessionId);
					}
				}, strings.folder), (0, react.createElement)("button", {
					type: "button",
					className: "dsh-delete-session__more-item",
					disabled: row.running || busy,
					onClick: () => {
						setMoreOpenId(null);
						handleFork(row.sessionId);
					}
				}, strings.fork), (0, react.createElement)("button", {
					type: "button",
					className: "dsh-delete-session__more-item",
					disabled: busy || row.running || row.archived || row.cwd === void 0,
					title: strings.moveToWorkspace,
					onClick: () => setMoveOpenId(moveOpenId === row.sessionId ? null : row.sessionId)
				}, strings.moveTo), moveOpenId === row.sessionId && (0, react.createElement)("div", { className: "dsh-delete-session__more-menu dsh-delete-session__move-menu" }, ...(() => {
					const targets = workspaces.filter((view) => !view.sessionIds.includes(row.sessionId));
					return targets.length > 0 ? targets.map((view) => (0, react.createElement)("button", {
						type: "button",
						key: view.workspaceId,
						className: "dsh-delete-session__more-item",
						disabled: busy,
						onClick: () => void handleMoveToWorkspace(row.sessionId, view.workspaceId)
					}, view.title || view.path)) : [(0, react.createElement)("button", {
						type: "button",
						key: "__none__",
						className: "dsh-delete-session__more-item",
						disabled: true
					}, strings.moveNoTargets)];
				})()), (0, react.createElement)("button", {
					type: "button",
					className: "dsh-delete-session__more-item dsh-delete-session__more-item--danger",
					disabled: row.running || busy,
					onClick: () => {
						setMoreOpenId(null);
						handleDelete(row.sessionId, row.title);
					}
				}, strings.delete))), row.archived && (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					className: "dsh-row-action",
					variant: "outline",
					size: "sm",
					disabled: busy,
					onClick: () => void handleRestore(row.sessionId, row.title),
					children: strings.restore
				}), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					className: "dsh-row-action dsh-row-action--danger",
					variant: "outline",
					size: "sm",
					icon: (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, { size: 16 }),
					disabled: row.running || busy,
					title: row.running ? strings.running : strings.delete,
					onClick: () => void handleDelete(row.sessionId, row.title),
					children: strings.delete
				}));
			};
			const renderTrashRow = (entry) => {
				const busy = busyId === entry.sessionId;
				const title = trashEntryTitle(loadTitles(), entry, rows?.find((row) => row.sessionId === entry.sessionId)?.title);
				return (0, react.createElement)("li", {
					key: entry.sessionId,
					className: "dsh-delete-session__row",
					"data-trash": true
				}, (0, react.createElement)("div", { className: "dsh-delete-session__row-main" }, (0, react.createElement)("div", {
					className: "dsh-delete-session__row-title",
					title
				}, title), (0, react.createElement)("div", {
					className: "dsh-delete-session__row-meta",
					title: [entry.cwd ?? strings.noCwd, strings.deletedAt(entry.deletedAt)].join(" · ")
				}, [entry.cwd ?? strings.noCwd, strings.deletedAt(entry.deletedAt)].join(" · "))), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					className: "dsh-row-action",
					variant: "outline",
					size: "sm",
					disabled: busy,
					onClick: () => void handleRestore(entry.sessionId, title),
					children: strings.restore
				}), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					className: "dsh-row-action dsh-row-action--danger",
					variant: "outline",
					size: "sm",
					icon: (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, { size: 16 }),
					disabled: busy,
					onClick: () => void handlePurge(entry.sessionId, title),
					children: strings.purge
				}));
			};
			const activeRows = (rows ?? []).filter((row) => !row.archived);
			const trashIds = new Set((trash ?? []).map((entry) => entry.sessionId));
			const archivedRows = (rows ?? []).filter((row) => row.archived && !trashIds.has(row.sessionId));
			const sortRows = (list) => [...list].sort((a, b) => newestFirst ? b.updatedAt - a.updatedAt : a.updatedAt - b.updatedAt);
			const activeGroups = [];
			for (const view of workspaces) {
				const groupRows = sortRows(activeRows.filter((row) => view.sessionIds.includes(row.sessionId)));
				if (groupRows.length > 0) activeGroups.push({
					workspaceId: view.workspaceId,
					title: view.title || view.path,
					rows: groupRows
				});
			}
			const ungroupedActive = sortRows(activeRows.filter((row) => !workspaces.some((view) => view.sessionIds.includes(row.sessionId))));
			if (ungroupedActive.length > 0) activeGroups.push({
				workspaceId: "__ungrouped__",
				title: strings.ungrouped,
				rows: ungroupedActive
			});
			groupsRef.current = activeGroups;
			const handleWorkspaceDrop = (0, react.useCallback)(async (slot) => {
				setDropSlot(null);
				const dragged = dragWorkspaceId;
				setDragWorkspaceId(null);
				if (dragged === null || slot === null) return;
				try {
					let beforeWorkspaceId;
					if (slot.startsWith("swap:")) {
						const swapId = slot.slice(5);
						if (swapId === dragged || swapId === "__ungrouped__") return;
						const order = groupsRef.current.map((g) => g.workspaceId);
						const aIndex = order.indexOf(dragged);
						const bIndex = order.indexOf(swapId);
						beforeWorkspaceId = aIndex >= 0 && bIndex >= 0 && aIndex < bIndex ? order[bIndex + 1] : swapId;
					} else if (slot.startsWith("before:")) beforeWorkspaceId = slot.slice(7);
					await api.workspace.insertBefore({
						workspaceId: dragged,
						beforeWorkspaceId
					});
					await load();
				} catch {}
			}, [
				api,
				load,
				dragWorkspaceId
			]);
			const moveWorkspaceToTop = (0, react.useCallback)(async (workspaceId) => {
				const firstId = groupsRef.current.map((g) => g.workspaceId).find((id) => id !== "__ungrouped__");
				if (firstId === void 0 || firstId === workspaceId) return;
				try {
					await api.workspace.insertBefore({
						workspaceId,
						beforeWorkspaceId: firstId
					});
					await load();
				} catch {}
			}, [api, load]);
			const renameWorkspace = (0, react.useCallback)(async (group) => {
				const input = window.prompt(strings.workspaceRenamePrompt.replace("{title}", group.title), group.title);
				if (input === null) return;
				const title = input.trim();
				if (title === "" || title === group.title) return;
				try {
					await api.workspace.rename({
						workspaceId: group.workspaceId,
						title
					});
					await load();
				} catch {}
			}, [api, load]);
			const deleteWorkspace = (0, react.useCallback)(async (group) => {
				if (!window.confirm(strings.workspaceDeleteConfirm.replace("{title}", group.title))) return;
				try {
					await api.workspace.delete({ workspaceId: group.workspaceId });
					await load();
				} catch {}
			}, [api, load]);
			const renderWorkspaceLabel = (group, index) => {
				const draggable = group.workspaceId !== "__ungrouped__";
				return (0, react.createElement)("div", {
					className: "dsh-delete-session__group-label" + (draggable ? " dsh-delete-session__group-label--drag" : ""),
					"data-drag-workspace": group.workspaceId,
					"data-dragging": dragWorkspaceId === group.workspaceId || void 0,
					"data-drop-swap": dropSlot === `swap:${group.workspaceId}` || void 0,
					title: draggable ? strings.workspaceDragHint : void 0,
					onPointerDown: draggable ? (e) => {
						if (e.button !== 0) return;
						e.preventDefault();
						setDragWorkspaceId(group.workspaceId);
						dropSlotRef.current = null;
						setDropSlot(null);
						const el = e.currentTarget;
						try {
							el.setPointerCapture(e.pointerId);
						} catch {}
					} : void 0,
					onPointerMove: draggable ? (e) => {
						if (dragWorkspaceId === null) return;
						const hit = document.elementFromPoint(e.clientX, e.clientY);
						const panel = hit instanceof Element ? hit.closest("[data-dsh-delete-session], [data-dsh-drawer]") : null;
						if (panel === null) {
							dropSlotRef.current = null;
							setDropSlot(null);
							return;
						}
						const labels = Array.from(panel.querySelectorAll("[data-drag-workspace]"));
						const groups = groupsRef.current;
						let targetIndex = -1;
						for (let i = 0; i < labels.length; i++) {
							const rect = labels[i].getBoundingClientRect();
							if (e.clientY >= rect.top - 6) targetIndex = i;
						}
						if (targetIndex < 0 || targetIndex >= groups.length) {
							dropSlotRef.current = null;
							setDropSlot(null);
							return;
						}
						const rect = labels[targetIndex].getBoundingClientRect();
						let slot;
						if (e.clientY >= rect.top && e.clientY <= rect.bottom) slot = `swap:${groups[targetIndex].workspaceId}`;
						else if (e.clientY < rect.top) slot = `before:${groups[targetIndex].workspaceId}`;
						else {
							const next = targetIndex + 1 < groups.length ? groups[targetIndex + 1] : null;
							slot = next !== null ? `before:${next.workspaceId}` : "__end__";
						}
						dropSlotRef.current = slot;
						setDropSlot(slot);
					} : void 0,
					onPointerUp: draggable ? (e) => {
						if (dragWorkspaceId === null) return;
						try {
							e.currentTarget.releasePointerCapture(e.pointerId);
						} catch {}
						handleWorkspaceDrop(dropSlotRef.current);
					} : void 0,
					children: [(0, react.createElement)("span", { className: "dsh-delete-session__group-label-text" }, `${group.title} (${group.rows.length})`), draggable ? (0, react.createElement)("span", { className: "dsh-delete-session__group-actions" }, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						className: "dsh-delete-session__group-action",
						variant: "ghost",
						size: "sm",
						title: strings.workspaceToTop,
						onPointerDown: (e) => e.stopPropagation(),
						onClick: (e) => {
							e.stopPropagation();
							moveWorkspaceToTop(group.workspaceId);
						}
					}, strings.workspaceToTop), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						className: "dsh-delete-session__group-action",
						variant: "ghost",
						size: "sm",
						title: strings.workspaceRename,
						onPointerDown: (e) => e.stopPropagation(),
						onClick: (e) => {
							e.stopPropagation();
							renameWorkspace(group);
						}
					}, strings.workspaceRename), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						className: "dsh-delete-session__group-action dsh-delete-session__group-action--danger",
						variant: "ghost",
						size: "sm",
						title: strings.workspaceDelete,
						onPointerDown: (e) => e.stopPropagation(),
						onClick: (e) => {
							e.stopPropagation();
							deleteWorkspace(group);
						}
					}, strings.workspaceDelete)) : null]
				});
			};
			const renderWorkspaceGroup = (group, index) => {
				const next = index + 1 < activeGroups.length ? activeGroups[index + 1] : null;
				return (0, react.createElement)("div", {
					key: group.workspaceId,
					className: "dsh-delete-session__group",
					"data-first": index === 0 || void 0,
					"data-line-top": dropSlot === `before:${group.workspaceId}` || void 0,
					"data-line-end": dropSlot === "__end__" && next === null || void 0
				}, renderWorkspaceLabel(group, index), (0, react.createElement)("ul", { className: "dsh-delete-session__list" }, ...group.rows.map((row) => renderRow(row))));
			};
			return (0, react.createElement)(react.Fragment, null, !state.pinned && (0, react.createElement)("div", {
				"data-dsh-drawer-backdrop": "",
				onClick: () => setDrawer({ open: false })
			}), (0, react.createElement)("div", { "data-dsh-drawer": "" }, (0, react.createElement)("div", { className: "dsh-drawer__header" }, (0, react.createElement)("span", { className: "dsh-drawer__title" }, strings.title), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				className: "dsh-delete-session__sort",
				variant: "ghost",
				size: "sm",
				title: newestFirst ? strings.sortOldest : strings.sortNewest,
				onClick: () => setNewestFirst((value) => !value),
				children: newestFirst ? strings.sortNewest : strings.sortOldest
			}), (0, react.createElement)("button", {
				type: "button",
				className: "dsh-drawer__pin",
				"data-pinned": state.pinned || void 0,
				title: state.pinned ? strings.unpin : strings.pin,
				"aria-label": state.pinned ? strings.unpin : strings.pin,
				onClick: () => setDrawer({ pinned: !state.pinned }),
				children: (0, react.createElement)("svg", {
					viewBox: "0 0 16 16",
					width: 14,
					height: 14,
					"aria-hidden": true
				}, (0, react.createElement)("path", {
					d: "M9.6 1.6 14.4 6.4 11.2 7.4 8.6 10 9 13.4 2.6 7 6 7.4 8.6 4.8z",
					fill: "currentColor"
				}))
			}), (0, react.createElement)("button", {
				type: "button",
				className: "dsh-drawer__pin",
				title: strings.close,
				"aria-label": strings.close,
				onClick: () => setDrawer({ open: false }),
				children: "×"
			})), (0, react.createElement)("div", { className: "dsh-drawer__body" }, state.pinned && (0, react.createElement)("div", { className: "dsh-drawer__hint" }, strings.drawerPinHint), loadError && (0, react.createElement)("div", { className: "dsh-delete-session__notice dsh-delete-session__notice--error" }, strings.trashLoadFailed), activeRows.length === 0 ? (0, react.createElement)("div", { className: "dsh-delete-session__empty" }, strings.empty) : activeGroups.map((group, index) => renderWorkspaceGroup(group, index)), archivedRows.length > 0 && (0, react.createElement)("div", { className: "dsh-delete-session__group" }, (0, react.createElement)("button", {
				type: "button",
				className: "dsh-delete-session__group-toggle",
				onClick: () => setArchivedOpen((open) => !open),
				"aria-expanded": archivedOpen || void 0
			}, (0, react.createElement)("span", { className: "dsh-delete-session__group-toggle-label" }, `${strings.archivedGroup} (${archivedRows.length})`), (0, react.createElement)("span", { className: "dsh-delete-session__group-toggle-chevron" }, archivedOpen ? strings.collapse : strings.expand)), archivedOpen && (0, react.createElement)("ul", { className: "dsh-delete-session__list" }, ...archivedRows.map((row) => renderRow(row)))), trash !== null && (0, react.createElement)("div", { className: "dsh-delete-session__group" }, (0, react.createElement)("button", {
				type: "button",
				className: "dsh-delete-session__group-toggle",
				onClick: () => setTrashOpen((open) => !open),
				"aria-expanded": trashOpen || void 0
			}, (0, react.createElement)("span", { className: "dsh-delete-session__group-toggle-label" }, `${strings.trashGroup} (${trash.length}/${trashLimit})`), (0, react.createElement)("span", { className: "dsh-delete-session__group-toggle-chevron" }, trashOpen ? strings.collapse : strings.expand)), trashFailed ? (0, react.createElement)("div", { className: "dsh-delete-session__group-hint" }, strings.trashLoadFailed) : trashOpen && (trash.length === 0 ? (0, react.createElement)("div", { className: "dsh-delete-session__empty" }, strings.trashEmpty) : (0, react.createElement)("ul", { className: "dsh-delete-session__list" }, ...trash.map((entry) => renderTrashRow(entry)))), (0, react.createElement)("div", { className: "dsh-delete-session__group-hint" }, strings.trashHint.replace("{limit}", String(trashLimit)))))), renderStatsDialog());
		}
		//#endregion
		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
