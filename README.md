# 🗂️ dsh-session-manager

> DeepSeek Harness Web 界面的一站式会话管理插件：删除（回收站）/ 恢复 / 重命名 / 导出 / 移动工作区 / 批量操作，开箱即用，**不修改 DSH 核心代码**。

[English](README.en.md) | 中文

[![build](https://img.shields.io/github/actions/workflow/status/qewregrfhnm/dsh-session-manager/ci.yml?branch=main&label=build&logo=github)](https://github.com/qewregrfhnm/dsh-session-manager/actions)
[![release](https://img.shields.io/github/v/release/qewregrfhnm/dsh-session-manager?sort=semver&label=release&color=4d6bfe)](https://github.com/qewregrfhnm/dsh-session-manager/releases)
[![downloads](https://img.shields.io/github/downloads/qewregrfhnm/dsh-session-manager/total?color=16a34a)](https://github.com/qewregrfhnm/dsh-session-manager/releases)
[![license](https://img.shields.io/github/license/qewregrfhnm/dsh-session-manager)](LICENSE)
[![language](https://img.shields.io/badge/language-TypeScript-3178c6?logo=typescript&logoColor=white)](src)
[![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](#兼容性)
[![dsh](https://img.shields.io/badge/DSH-0.1.x%20rc-0f1115)](#兼容性)

## ✨ 功能亮点

| 能力 | 说明 |
| --- | --- |
| 🗑️ **删除 / 恢复 / 彻底删除** | 删除进入回收站（保留最近 10 条，可恢复或彻底清除）；已归档会话一键恢复 |
| ✏️ **会话重命名** | 写入官方 `session/title` 事件，自动标题不再覆盖，重启不丢 |
| 📥 **导出 Markdown / JSON** | Markdown 可读对话记录；JSON 无损完整事件日志；浏览器一键下载 |
| 📂 **移动到工作区** | 拖拽会话行到工作区标题即可移动；「移动到…」支持批量与**＋新建工作区** |
| 🔍 **搜索与筛选** | 按标题 / 目录实时过滤 + 全部 / 运行中 / 未读 / 已归档状态筛选 |
| 🔵 **未读 / 已读标记** | 手动未读、官方待输入 / 完成提醒状态点，点击就地已读 |
| 📊 **活动统计** | 每个会话的轮次 / 消息数 / 工具调用 / 活动窗口 |
| ⏯️ **继续 / 暂停 / 新聊天中继续** | 一键继续（归档会话自动恢复后再打开）、暂停运行中回合、fork 子会话 |
| 🗂️ **工作区管理** | 分组展示、拖拽排序、置于顶部 / 重命名 / 删除工作区 |
| ⚙️ **全局上下文压缩阈值** | 对所有 Agent 预设统一生效，保存即时 + 持久化 + 重启自动应用 |

另有：对话顶部**对话管理抽屉**（可固定）、**删除本对话**、打开日志文件夹、子代理（孤儿）会话清理、中英文界面自适应。

## 📸 截图

> 截图为脱敏演示界面（会话标题与路径为示例数据）。

| 设置页 · 会话管理总览 | 会话行「更多」菜单 |
| --- | --- |
| ![会话管理总览](assets/screenshots/session-manager-overview.png) | ![更多菜单](assets/screenshots/more-menu.png) |

| 已归档会话与回收站 | 对话管理抽屉 |
| --- | --- |
| ![已归档与回收站](assets/screenshots/archived-trash.png) | ![对话管理抽屉](assets/screenshots/drawer.png) |

## 📦 安装

### 环境要求

- 全局安装 DSH CLI：`npm i -g @deepseek-ai/dsh`（`0.1.0-rc.6` 或同代 `0.1.x` rc）
- Node.js `^22.19.0 || >=24.0.0`，pnpm `>=9`（DSH CLI 的插件管理直接转发给 pnpm）

### 从 GitHub Release 安装（推荐）

```sh
dsh plugin --profile web add 'https://github.com/qewregrfhnm/dsh-session-manager/releases/download/v0.4.1/dsh-session-manager-0.4.1.tgz'
```

> 最新版本见 [Releases](https://github.com/qewregrfhnm/dsh-session-manager/releases)，把 URL 中的版本号换成最新 tag。

### 从仓库标签安装

```sh
dsh plugin --profile web add 'github:qewregrfhnm/dsh-session-manager#v0.4.1'
```

### 从本地目录 / tarball 安装

```sh
# 本地目录
dsh plugin --profile web add /absolute/path/to/dsh-session-manager
# 或先打包再安装
cd dsh-session-manager && pnpm pack
dsh plugin --profile web add /absolute/path/to/dsh-session-manager-0.4.1.tgz
```

### 手动安装（`dsh plugin` 不可用时的后备方案）

`dsh plugin` 只是在 profile 目录里转发给 pnpm 并同步 `dsh.profile.bundles`。手动做法：

```sh
cd ~/.dsh/profiles/web
pnpm add <上面的包说明>
# 然后在 package.json 的 dsh.profile.bundles 数组追加 "dsh-session-manager"
```

> **安装完成后重启 `dsh web`**（host 插件与客户端 bundle 在启动时加载）。

## 🚀 使用指南

### 设置页 · 会话管理

1. 打开侧边栏底部 **设置** → 左侧导航 **会话管理**
2. 主列表为未归档会话，按工作区分组；底部折叠区为**已归档会话**与**回收站**
3. 行内仅保留 **删除** 按钮；其余操作收进「**更多**」菜单：
   **继续会话**（归档会话会自动恢复再打开）/ **暂停** / **恢复** / **新聊天中继续** / **重命名** / **导出 Markdown / 导出 JSON** / **统计** / **文件夹** / **移动到…**
4. 顶部**搜索框** + **状态筛选**（全部 / 运行中 / 未读 / 已归档）快速定位
5. **拖拽**会话行到工作区标题上直接移动；勾选多行后可**批量移动 / 批量删除**
6. 工作区标题悬停出现 **置于顶部 / 重命名 / 删除**

### 重命名与导出

1. 会话行「更多」→ **重命名**：输入新名称确认，标题立即更新（侧边栏同步）
2. 「更多」→ **导出 Markdown**：下载可读对话记录（轮次 / 用户 / 助手 / 工具调用与结果）
3. 「更多」→ **导出 JSON**：下载无损完整事件日志（会话头 + 全部事件，含 seq/time）

### 把会话移动到其他工作区

1. 找到会话 →「更多」→「**移动到…**」→ 选择目标工作区；或直接把会话行**拖到工作区标题**上
2. 日志文件夹、会话头工作目录与工作区记账同步更新，重启不丢
3. 「移动到…」菜单里的 **＋新建工作区（会话所在目录）** 可把未注册路径的会话登记为新工作区

> 限制：**正在运行 / 已加载（live）的会话不能移动**——先暂停或重启 `dsh web` 卸载后再移动。

### 通用设置 · 上下文压缩阈值

**设置 → 通用设置**：设置对话上下文用到模型窗口的多少比例时自动压缩（17%–90%），每次压缩保留最近 16% 原文；对所有 Agent 预设的会话统一生效，保存即时生效并持久化。

### 对话顶部快捷入口

任意对话页右上角：**对话管理**（抽屉，可图钉固定）、**回收站**、**删除本对话**（红色）。

## 🔧 工作原理

| 层 | 实现 |
| --- | --- |
| Host | `src/index.ts` 注册 10 条路由：`POST /delete`、`POST /restore`、`POST /purge`、`GET /trash`、`POST /open-folder`、`POST /pause`、`POST /move-workspace`、`GET|POST /compaction-threshold`、`POST /rename`（live 走官方 `sessionTitle.rename`，冷会话追加事件帧 + 同步持久投影缓存）、`POST /export`（`sessionPersistence.inspect` 解码后渲染 Markdown / JSON）。服务：`ctx.sessionPersistence` / `ctx.workspaceRegistry` / `ctx.storageDomain` / `ctx.agentPresets` / `ctx.agents` |
| Client | `src/client/index.ts` 通过官方 `settings.section` 插槽注册分栏；`useSessions` / `useWorkspaces` 标准数据源；抽屉经 `sessions.list`（ObservableSnapshot）实时订阅；彻底删除的会话 id 记在 localStorage 防止刷新「复活」 |

- **重命名**：标题即日志中的 `session/title` 事件（官方 `@deepseek-ai/dsh-session-title`，来源 `user` 钉住标题）；冷会话由 host 自算续接 seq（兼容打包分片行）追加事件帧，并写入官方持久投影缓存（`session_projcache`），列表与侧边栏即时更新
- **导出**：官方 `sessionPersistence.inspect` 拿到解码后的平衡事件视图（打包分片行已还原、损坏尾部不进入）；构建器为纯函数模块 `src/export.ts`（含单测）
- **移动到工作区**：改写 zstd 日志**首帧**（只含一行会话头，`cwd` 更新为目标路径），事件帧原样保留；目录改名搬入目标工作区后写回新文件，最后更新工作区记账（`detachSession` + `attachSession`）；任一步失败都会**先改回目录名再恢复原始字节**，绝不先删后移
- **已归档会话「继续会话」**：官方工作区投影会在当前会话仍归档时清空选中，因此先自动恢复（取消归档）+ 刷新工作区基线，再打开
- **未读机制**：手动未读集存于共享 localStorage key `dsh.session-unread.v1`，与其他会话管理插件互通；官方状态点（琥珀 / 绿色 / 转圈）由 `pendingInteraction` / `completed` / `running` 驱动
- **压缩阈值全局生效**：存于存储域；默认预设为用户预设时同步写入其 `agent.cordis.yml`（系统预设保持只读）；host 在 `agent/pre-step` 钩子写入所有压缩引擎配置
- 回收站条目持久化在 `~/.dsh/storages/dsh_delete_session.json`，文件在 `~/.dsh/dsh-delete-session-trash/`
- 无系统提示词改动、无模型工具新增，对 token 与模型行为零影响

## 🔒 隐私与安全

- **完全本地运行**：所有操作只读写本机 `~/.dsh` 下的文件与浏览器 localStorage，**没有任何遥测、统计上报或网络请求**
- 移动 / 导出 / 重命名只是操作本机日志与元数据，不会上传任何内容
- 插件不修改 DSH 核心代码，卸载插件不影响已有会话

## ⚠️ 限制

- **不能删除正在运行的会话**（按钮禁用并拒绝删除）
- **不能移动正在运行 / 已加载（live）的会话**
- 子代理会话可删除（非运行中），包括主会话已删除的「孤儿子代理」
- 已彻底删除的会话 id 会保留在浏览器 localStorage 与归档集合中（无害残留，防止刷新「复活」）
- 侧边栏未读点按标题文本匹配，重复标题会共享该点（面板 / 抽屉内按真实 id 精确标记，不受影响）

## 📄 兼容性

- 适配 DSH `0.1.0-rc.6`（使用 `settings.section` / `settings.general.item` / `conversation.session.header.utilities` 插槽与 `ctx.sessionPersistence` / `ctx.workspaceRegistry` / `ctx.agents` / `ctx.storageDomain` / `ctx.agentPresets` 服务）
- 运行时 `@deepseek-ai/*` 包由 DSH host 提供（从全局安装解析）
- DSH 升级后如插槽或服务 API 变化，可能需要适配

## 🛠️ 开发

```sh
pnpm install        # 依赖来自 npm 注册表，任何机器可直接构建
pnpm run check      # typecheck + 单测 + 构建
pnpm pack           # 产出 dsh-session-manager-<version>.tgz（用于 GitHub Releases）
```

- `lib/` 为已提交的构建产物——改动源码后请重建并提交（`github:` 方式安装无需构建步骤）
- 每次 push / PR 由 GitHub Actions 自动执行 `pnpm run check`（构建徽章实时反映状态）
- 更新日志见 [CHANGELOG.md](CHANGELOG.md)

## 🤝 贡献与许可

- 欢迎 Issue / PR：功能建议、缺陷报告、翻译改进
- 本插件 fork 自 [dream12347/dsh-session-manager](https://github.com/dream12347/dsh-session-manager)（MIT），在此致谢原作者
- 基于 [MIT License](LICENSE) 发布，版权归 dsh-session-manager contributors
