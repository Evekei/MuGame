# AGENTS.md

> 本文件是本项目所有 Coding Agent / Codex 的最高工程约束之一。
> 任何新增、修改、重构代码的任务，都必须先阅读本文件，再开始执行。
> 若任务提示词与本文件冲突：**优先遵循用户当轮明确要求；否则遵循本文件。**

---

# 1. 项目定位

本项目是一个 **个人使用的移动端轻量音乐歌单小游戏 MVP**。

最终目标：

- Android App。
- iOS App。
- 开发期可先在浏览器与 Android 模拟器验证。
- 不再以 Electron / Windows Desktop 作为目标架构。

核心流程：

1. 用户打开 App，左上角可进入网易云账号管理。
2. 用户一次粘贴多个网易云音乐、QQ 音乐等平台的歌单分享链接。
3. 系统在正式导入前解析每个歌单，并展示平台、歌单名、创建者昵称/头像、歌曲数。
4. 用户确认后导入完整歌曲列表。
5. 每首歌曲必须保存“来自谁的歌单”这一来源信息。
6. 多歌单合并时，对相同歌曲进行去重，但不得丢失来源信息；同一首歌可以对应多个来源用户。
7. 将跨平台歌曲匹配为网易云歌曲。
8. 将结果同步到用户自己的固定或可复用网易云临时歌单。
9. 临时歌单 Ready 后立即进入播放，不等待统计。
10. App 自己维护随机播放队列：一轮内尽量不重复，播完所有可播放歌曲后再重新洗牌。
11. 播放页显示专辑封面、歌曲名、歌手、播放进度、播放/暂停/上一首/下一首与歌词；优先实现同步滚动歌词。
12. 游戏过程中默认隐藏歌曲来源；点击 `Check` 后显示来源昵称，点击 `Hide` 后再次隐藏。
13. 统计模块异步执行，统计页允许显示“正在分析”和逐步产出的结果。

本项目优先级：

**稳定性 > 可维护性 > 可调试性 > 功能完整度 > UI 复杂度 > 性能微优化。**

不要为了“看起来高级”引入不必要的架构、抽象或依赖。

---

# 2. 固定技术边界

除非用户明确要求修改，否则默认技术栈如下：

- Frontend: Next.js App Router + TypeScript。
- Web build: `output: "export"`，生成静态资源供 Capacitor WebView 加载。
- Mobile shell: Capacitor 8 或实现时的稳定版。
- Android: Android Studio / Gradle 工程。
- iOS: Xcode 工程。
- Backend API: FastAPI + Pydantic + Python。
- Database / cache: SQLite。
- ORM / DB access: SQLAlchemy 或 SQLModel 等轻量方案；必须集中封装，禁止在业务代码中散落 SQL。
- Playback: 优先通过已登录的网易云移动 WebView / H5 Player 承担真实音频播放。
- NetEase account session: 通过专门的移动端登录桥接与安全 Cookie/Session 存储管理。
- Cross-platform playlist parsing: Adapter 模式。
- Track matching: 后端统一 Matcher Service。
- Analytics: 后端持久任务记录 + 单进程轻量 Worker，MVP 不引入 Celery/Redis，除非实际压测证明需要。

重要：

- **不要额外创建一个独立 React SPA。** 前端统一放在 Next.js 中。
- Next.js 内部使用 React 属于框架实现细节，不视为“另建 React 前端”。
- **Next.js 必须保持静态导出兼容。**
- 禁止新增 Next.js API Routes、Server Actions、Middleware 或任何需要 Next.js 运行时服务器的业务后端能力。
- 动态业务后端统一由独立 FastAPI 提供。
- 前端不得直接承担网易云/QQ 音乐核心解析逻辑。
- 平台私有接口、网页 DOM 操作、Cookie 操作必须隔离在专门 Adapter / Bridge / Integration 层。
- 新架构不以 Electron、Windows-only、WebContentsView、IPC preload 作为目标。

---

# 3. 推荐目录结构

推荐总体结构：

```text
/apps
  /web                  # Next.js App Router UI，静态导出
  /mobile               # Capacitor 容器与原生工程入口
    /android            # Android Studio / Gradle
    /ios                # Xcode

/backend
  /app
    /api                # FastAPI route，只做参数接收/返回
    /schemas            # Pydantic request/response DTO
    /services           # 用例编排
    /domain             # 核心领域模型和纯业务规则
    /integrations
      /netease          # 网易云相关 API / 网页协议隔离
      /qqmusic          # QQ 音乐相关 API / 网页协议隔离
    /matching           # 歌曲标准化、匹配、置信度
    /analytics          # 异步统计任务与指标计算
    /repositories       # SQLite 访问
    /core               # config / logging / errors

/tests
```

前端推荐：

```text
apps/web/src/
  app/                  # 静态导出兼容 routes
  components/           # 可复用 UI
  features/
    account/
    playlist-import/
    track-review/
    game/
    player/
    analytics/
  lib/
    api/
    mobile-bridge/
    types/
    utils/
  store/                # 轻量状态管理，例如 Zustand
```

移动端推荐：

```text
apps/mobile/
  capacitor.config.ts
  android/
  ios/
  src/
    bridges/
      NeteaseAuthBridge.*
      NeteasePlayerBridge.*
```

如果仓库中存在旧 Electron / desktop-only 模板：

- 本阶段只做明确标记或迁移计划，不大规模删除业务代码。
- 新功能不得继续依赖旧桌面入口。
- 旧目录应逐步标注为 `legacy` 或在迁移文档中说明替代路径。
- 删除旧实现必须在后续专门迁移阶段执行，并先确认没有仍被引用的业务逻辑。

---

# 4. 最重要的数据原则：来源归因不可丢失

歌曲来源（Attribution / Contributor）是本项目的一等数据，不是 UI 临时字段。

每首导入歌曲至少应保留：

```text
source_platform
source_playlist_id
source_playlist_name
source_owner_id (若可获得)
source_owner_nickname
source_track_id
normalized_title
normalized_artists
```

核心数据对象至少包含：

```text
SourcePlaylist
- id
- platform                # netease | qq
- source_playlist_id
- source_url
- title
- owner_source_id
- owner_nickname          # 导入前必须可展示
- owner_avatar_url
- cover_url
- source_tags[]
- track_count
- imported_at

Contributor
- source_playlist_id
- platform
- owner_source_id
- owner_nickname
- owner_avatar_url

UnifiedTrack
- id
- normalized_title
- display_title
- artists[]
- album
- duration_ms
- cover_url
- netease_song_id
- qq_song_id
- lyric_status
- playable
- match_confidence
- contributors[]          # 核心字段，永不因去重而丢失

Lyric
- track_id
- original_lrc
- translated_lrc
- parsed_lines[{time_ms,text,translation?}]

ImportSession
- id
- source_playlist_ids[]
- raw_track_count
- unique_track_count
- matched_track_count
- temp_playlist_id
- status
- analytics_status

AnalyticsResult
- import_session_id
- metric_key
- payload_json
- status
- computed_at
```

`contributors[]` 必须允许多个来源，例如：

```json
[
  {
    "owner_nickname": "Alice",
    "platform": "netease",
    "source_playlist_id": "123"
  },
  {
    "owner_nickname": "Bob",
    "platform": "qq",
    "source_playlist_id": "456"
  }
]
```

强制规则：

- 去重只能合并歌曲实体，**不能覆盖 contributors**。
- 同一首歌来自 3 个歌单，就必须保留 3 个来源记录。
- `Check / Hide` 只控制前端展示状态，不能修改或删除来源数据。
- 不允许使用单一 `ownerName` 字段覆盖多来源场景。
- 不允许为了方便 UI 展示而破坏后端真实来源结构。

---

# 5. 模块化设计原则

任何模块必须遵循：

**一个模块只负责一类职责。**

禁止创建“万能 service”“万能 utils”“万能 manager”。

推荐后端边界：

- `PlaylistImportService`：导入用例编排。
- `NeteasePlaylistAdapter`：网易云歌单解析。
- `QQMusicPlaylistAdapter`：QQ 音乐歌单解析。
- `TrackNormalizer`：歌曲字段标准化。
- `ContributorMerger`：来源归因合并。
- `TrackMatcher`：跨平台歌曲匹配。
- `TemporaryPlaylistService`：网易云临时歌单同步。
- `AnalyticsService`：统计任务创建与查询。
- `AnalyticsWorker`：单进程异步统计执行。
- `LyricService`：歌词读取、解析与缓存。

推荐移动端/前端边界：

- `NeteaseAuthBridge`：登录 WebView、Cookie/Session 同步、登出。
- `NeteasePlayerBridge`：网易云播放器 WebView 控制与播放状态同步。
- `apiClient`：访问 FastAPI。
- `importStore`：导入会话状态。
- `playerQueueStore`：随机播放队列与当前歌曲。
- `sourceRevealStore`：`Check / Hide` 展示状态。

---

# 6. 依赖方向

必须保持依赖单向。

推荐：

```text
Next.js UI
↓
Frontend API Client / Mobile Bridge Facade
↓
FastAPI Route
↓
Application Service
↓
Domain / Matching / Repository Interface
↓
Integration Adapter / SQLite
```

禁止：

- Domain 反向依赖 FastAPI Route。
- Backend Service 依赖前端代码。
- 平台 Adapter 直接修改 UI 状态。
- Repository 内写游戏业务逻辑。
- Route 内堆积歌曲匹配、去重、同步、统计等核心业务。
- React/Next Component 直接访问 SQLite。
- Next.js 页面直接操作网易云 Cookie。
- Next.js 页面直接注入网易云播放器 DOM 脚本。
- Capacitor 原生代码直接实现业务导入、匹配、去重、统计逻辑。

移动端 Bridge 与 Web UI 之间必须使用明确 contract，不允许随意跨层调用。

---

# 7. 单文件行数限制

为了后续维护和 Debug，必须控制文件规模。

## 默认限制

### TypeScript / TSX

- 推荐：`<= 250` 行
- 警戒：`251-350` 行
- 硬上限：`400` 行

### Python

- 推荐：`<= 250` 行
- 警戒：`251-350` 行
- 硬上限：`400` 行

### React / Next.js 页面或大型组件

- 推荐：`<= 200` 行
- 硬上限：`300` 行

### API Route / Controller

- 推荐：`<= 120` 行
- 硬上限：`180` 行

### Service

- 推荐：`<= 220` 行
- 硬上限：`320` 行

### 单个函数

- 推荐：`<= 40` 行
- 硬上限：`70` 行

## 超限处理

如果文件接近或超过硬上限：

1. 不允许继续向该文件堆功能。
2. Agent 必须先识别职责边界。
3. 将 UI、业务规则、API 调用、数据访问、平台适配、移动 Bridge 拆分。
4. 拆分后必须保持命名清晰，禁止为了行数机械拆碎。

例外：

- 自动生成文件。
- lockfile。
- migrations。
- Capacitor / Android / iOS 生成工程文件。
- 大型静态数据文件。

例外必须明显标注为 generated / data，不得成为业务逻辑堆积点。

---

# 8. 函数与组件设计

## 函数

一个函数只做一个主要动作。

坏例子：

```text
parseAndNormalizeAndMatchAndSaveAndSyncPlaylist()
```

应拆为：

```text
parsePlaylist()
normalizeTracks()
mergeContributors()
matchTracksToNetease()
saveMappings()
syncTemporaryPlaylist()
enqueueAnalyticsJob()
```

## React / Next Component

一个组件优先负责：

- 展示；或
- 一段明确交互；或
- 一个局部状态区域。

如果组件同时承担：

- 网络请求；
- 大量数据转换；
- 游戏状态机；
- 播放器控制；
- 复杂 UI；
- 移动端 Bridge 调用细节；

必须拆分。

业务状态优先放在 feature hook / service / store 中，不要全部堆到页面组件。

---

# 9. 平台 Adapter 原则

网易云、QQ 音乐都属于外部、不稳定依赖。

因此必须实现为独立 Adapter。

例如：

```text
PlaylistSourceAdapter
├── NeteasePlaylistAdapter
└── QQMusicPlaylistAdapter
```

统一输出内部标准结构。

业务层不得依赖平台私有字段。

例如业务层只接收：

```text
ParsedPlaylist
ParsedTrack
Contributor
```

而不是直接处理：

```text
netease.creator.nickname
qqmusic.cdlist[0].songlist
```

如果网易云或 QQ 音乐接口变化，应尽量只修改对应 Adapter。

导入前预检必须能返回创建者昵称/头像；如果某平台无法稳定解析 owner，必须返回明确的 `owner_parse_failed` 或可恢复状态，不能静默导入。

---

# 10. 移动端原生代码最小化原则

Capacitor 原生层只负责移动容器能力，不承载核心业务。

允许放在 Android / iOS 原生层的内容：

- WebView 容器和必要配置。
- 与系统能力相关的最小 Bridge。
- 网易云登录 WebView 所需的 Cookie/Session 同步。
- 播放器 WebView 的生命周期与受控操作入口。
- 必要的安全存储适配。

禁止放在 Android / iOS 原生层的内容：

- 歌单解析业务。
- 跨平台歌曲匹配。
- contributors 合并逻辑。
- 统计计算。
- SQLite 业务 Repository。
- 大量 UI 状态机。

Android 与 iOS 必须共享同一套前端与后端业务 contract。除非平台 API 差异不可避免，不允许两端各写一套业务逻辑。

---

# 11. 网易云账号、Cookie 与 Session 原则

本项目仅用于用户自己的账号和个人使用。

App 主界面左上角必须有网易云账号入口；点击后至少支持：

- 查看登录状态。
- 查看当前昵称/头像。
- 重新登录。
- 同步登录状态。
- 退出登录。

必须遵循：

- 不保存网易云明文账号密码。
- 优先使用网易云真实网页扫码 / 登录流程。
- Cookie/Session 只能由 `NeteaseAuthBridge` 或后端专门认证集成层处理。
- 只保存维持会话所需的最小字段。
- Cookie 不写入 Git。
- Cookie 不输出到普通日志。
- Cookie 不传到普通前端 UI 状态。
- 任何账号凭据不得硬编码到源码。
- `.env.example` 不得包含真实凭据。

如果 Session 失效：

- 明确提示重新登录。
- 不允许静默无限重试。
- 不允许因为登录失败导致应用整体崩溃。

---

# 12. 网易云同步原则

同步临时歌单必须尽量做到 **幂等（idempotent）**。

推荐：

```text
固定/可复用临时歌单
→ 获取当前歌曲
→ 计算差异
→ 删除不需要的歌曲
→ 添加缺失歌曲
```

而不是每次都新建大量临时歌单。

同步层必须：

- 支持批量添加歌曲。
- 避免单首循环请求。
- 对失败 batch 可重试。
- 记录成功数量与失败数量。
- 失败不得丢失本地整理结果。
- 同步失败与歌曲匹配失败必须区分。
- 临时歌单 Ready 后允许立即进入播放。

禁止将“网易云同步成功”作为本地合并数据是否有效的判断依据。

---

# 13. 播放器与 WebView Bridge 原则

本项目不直接抓取、保存或代理完整音乐音频文件。

播放职责优先由已登录的网易云网页播放器承担。

App 只负责：

- 加载网易云移动 Web Player / H5 Player。
- 保持登录态。
- 控制播放 / 暂停 / 上一首 / 下一首（若可稳定实现）。
- 读取或同步必要播放状态。
- 用自己的 UI 展示封面、歌名、歌手、歌词等结构化元数据。

播放器 DOM / 网页控制逻辑必须放在独立模块，例如：

```text
NeteasePlayerBridge
```

禁止在普通 Next.js 页面中散落：

```text
querySelector(...)
executeJavaScript(...)
evaluateJavascript(...)
```

所有网易云网页 DOM selector 必须集中维护。

如果网易云网页改版，应优先修改 Player Bridge，而不是全项目搜索替换。

---

# 14. 播放队列原则

播放采用应用自己维护的随机播放队列。

必须满足：

- 一轮内尽量不重复。
- 播放完所有可播放歌曲后再重新洗牌。
- 不可播放歌曲必须标记 `playable = false` 或记录明确错误状态。
- 上一首/下一首要操作应用队列，再通过 `NeteasePlayerBridge` 尝试同步真实播放器。
- 播放队列状态不得修改 `contributors`。

---

# 15. 歌曲匹配原则

跨平台匹配不能只比较歌名。

默认综合：

- title
- artist(s)
- album
- duration
- version tag（Live / Remix / Acoustic / Instrumental 等）

匹配结果必须包含：

```text
matched_song_id
confidence
match_status
match_reason (可选)
```

建议状态：

```text
auto_matched
needs_review
unmatched
manual_confirmed
```

低置信度不得偷偷自动加入。

匹配缓存应以稳定 source track identity 优先，而不是只用歌曲标题。

---

# 16. 去重原则

去重分两层：

## 第一层：来源平台内部 identity

有稳定 Track ID 时优先使用平台 Track ID。

## 第二层：跨平台 canonical identity

在匹配到网易云后，以确认后的网易云 `song_id` 作为优先 canonical identity。

未匹配前允许使用：

```text
normalized_title + normalized_artists + duration_bucket
```

作为临时 dedupe key。

注意：

**去重 = 合并歌曲实体 + union contributors。**

绝不允许：

```text
newTrack.contributor = oldTrack.contributor
```

覆盖来源。

---

# 17. Check / Hide 游戏规则

默认状态：

```text
sourceVisible = false
```

点击 `Check`：

- 展示当前歌曲所有 contributor nickname。
- 若多人来源，全部显示。
- 不修改后端数据。

点击 `Hide`：

- 再次隐藏来源。
- 不删除数据。
- 不触发重新解析。
- 不触发重新匹配。

推荐 UI 状态与真实 Track 数据分离。

例如：

```text
track.contributors   # 数据
ui.sourceVisible     # 展示状态
```

禁止：

```text
Hide => track.contributors = []
```

---

# 18. API 设计原则

FastAPI Route 只承担：

1. 校验输入。
2. 调用 Service。
3. 转换明确的 Response DTO。
4. 返回 HTTP 状态。

禁止在 Route 里实现大量业务逻辑。

API 返回必须稳定、结构化。

错误响应建议统一：

```json
{
  "error": {
    "code": "PLAYLIST_PARSE_FAILED",
    "message": "Failed to parse playlist",
    "details": {}
  }
}
```

前端不得依赖后端 traceback 文本判断错误类型。

移动开发期 FastAPI 可以运行在电脑局域网地址；最终真机独立使用时 API 必须部署到可被手机访问的 HTTPS 地址，并通过环境变量配置 `API_BASE_URL`。

---

# 19. 异步统计原则

统计不能阻塞临时歌单生成和首次播放。

必须遵循：

- 导入完成后先同步临时歌单。
- 临时歌单 Ready 后即可进入播放页。
- 后端同时创建 `analytics_jobs` 持久任务记录。
- 单进程轻量 Worker 异步计算统计。
- 统计页允许展示 `pending` / `running` / `partial` / `completed` / `failed`。
- 统计结果应按 `metric_key` 分批落库，允许增量刷新。
- 歌词分析等慢任务必须后置，不能阻塞播放。
- 曲风、年代、语言等元数据不足时必须显示“数据不足”，不允许凭空生成标签。

MVP 统计范围：

- 歌曲总数、去重后歌曲数、共同歌曲数。
- 每首歌 contributors 数。
- 被最多用户同时收藏的歌曲。
- 两两歌曲 Jaccard similarity。
- Top 歌手、共同 Top 歌手、独有 Top 歌手。
- 歌手重合率与两两歌手 Jaccard。
- 共同专辑、出现最多的专辑。
- 可解释的音乐品味相似度分项。
- 每位用户独占歌曲比例、独占歌手比例。
- 歌手数量、曲风数量、集中度/熵等多样性指标。

---

# 20. 错误处理原则

必须区分以下错误：

- invalid_share_link
- unsupported_platform
- playlist_parse_failed
- owner_parse_failed
- track_match_failed
- low_confidence_match
- netease_not_logged_in
- netease_session_expired
- netease_sync_failed
- netease_player_unavailable
- lyric_fetch_failed
- analytics_job_failed
- database_error

禁止：

```text
except Exception:
    return None
```

除边界保护外，不得吞掉异常。

用户可恢复错误：

- 返回可理解状态。
- UI 提供 Retry / Re-login / Review / Skip 等动作。

开发错误：

- 写日志。
- 保留 stack trace。
- 测试环境直接失败。

---

# 21. Logging 原则

Debug 能力是本项目核心要求。

所有核心流程必须具备结构化日志。

建议每次导入生成：

```text
import_session_id
```

每局游戏生成：

```text
game_session_id
```

每个统计任务生成：

```text
analytics_job_id
```

重要日志字段：

```text
session_id
import_session_id
game_session_id
analytics_job_id
platform
playlist_id
owner_nickname
track_count
matched_count
unmatched_count
sync_count
elapsed_ms
error_code
```

日志禁止记录：

- 密码。
- 完整 Cookie。
- Authorization token。
- 敏感 Session 内容。

日志必须能回答：

1. 哪个歌单解析失败？
2. 哪个歌单创建者解析失败？
3. 哪首歌匹配失败？
4. 哪一步最慢？
5. 临时歌单同步了多少首？
6. 玩家来源标签在哪一步丢失？
7. 统计任务当前卡在哪个指标？

---

# 22. 配置原则

所有环境相关配置集中管理。

例如：

```text
.env.local
.env
config.py
config.ts
capacitor.config.ts
```

禁止散落硬编码：

```text
localhost:8000
192.168.x.x:8000
playlist_id = 123456
cookie = "..."
```

临时歌单 ID、API base URL、debug flag、移动端 deep link、WebView 白名单等必须进入配置层或数据库。

`.env*` 中敏感文件不得提交 Git。

必须维护 `.env.example`，但不得包含真实凭据。

---

# 23. 数据库原则

SQLite 主要保存：

- Track mapping cache。
- Playlist import records。
- Contributor attribution。
- Temporary playlist metadata。
- Lyric cache。
- `analytics_jobs`。
- `analytics_results`。
- 必要的本地游戏状态。

Repository 必须集中访问数据库。

业务层不要直接写 SQL。

Schema 变化要可迁移，不允许运行时通过“删库重建”解决普通升级问题。

用户主动清空缓存除外。

---

# 24. 缓存原则

歌曲跨平台匹配结果必须优先缓存。

缓存 key 优先包含：

```text
source_platform
source_track_id
```

若 source track id 不可用，再使用稳定组合 key。

缓存中必须保存匹配版本或更新时间，便于未来刷新错误映射。

禁止将一次低置信度猜测永久缓存为“确定匹配”。

---

# 25. 性能原则

MVP 性能目标：

普通场景：

```text
3 个歌单
总歌曲 <= 200
提交链接 → 临时网易云歌单可播放
目标 <= 15 秒
```

优化方向优先级：

1. 缓存命中。
2. 并发 I/O。
3. 批量网易云同步。
4. 避免重复网络请求。
5. UI 渐进式反馈。
6. 统计异步增量刷新。

禁止为了性能：

- 牺牲来源标签完整性。
- 关闭错误检查。
- 无限并发请求外部平台。
- 阻塞首次播放等待统计。

并发必须有上限。

---

# 26. 测试要求

每个新功能至少覆盖：

## Unit Test

优先覆盖纯业务逻辑：

- normalize。
- dedupe。
- contributor merge。
- confidence calculation。
- queue shuffle。
- Check / Hide display state。
- analytics metrics。
- mapping cache。

## Integration Test

覆盖：

- Adapter → 标准 DTO。
- Service → Repository。
- API → Service。
- Import session → temp playlist sync。
- Analytics job → result persistence。
- Mobile Bridge facade contract。

## 回归测试重点

必须存在测试保证：

```text
Alice 歌单：Track A
Bob 歌单：Track A

合并后：
Track A.contributors == [Alice, Bob]
```

以及：

```text
Check / Hide
```

不会改变 contributor 数据。

外部平台 API 测试优先 Mock，避免 CI 依赖真实账号和不稳定公网接口。

---

# 27. Agent 修改代码时的行为规范

每次 Coding Agent 开始任务前必须：

1. 阅读本 `AGENTS.md`。
2. 先定位相关模块，不要立即修改。
3. 阅读现有实现和相关测试。
4. 确认修改范围。
5. 优先最小改动。

执行中：

- 不随意重构用户未要求的模块。
- 不修改无关 UI。
- 不偷偷替换技术栈。
- 不因为实现新功能删除已有功能。
- 不以“临时实现”为名写无法维护的大文件。
- 不留下大量 TODO 代替实际实现。
- 不把 Mock 数据当最终业务结果。
- 不把旧 Electron/Desktop 约束带入新移动端实现。

完成后必须：

1. 运行相关测试。
2. 运行 lint / typecheck。
3. 检查单文件行数。
4. 检查是否破坏模块边界。
5. 检查是否有敏感信息进入代码或日志。
6. 报告修改文件。
7. 报告测试结果。
8. 若有未解决问题，明确列出，不得假装 PASS。

如果本阶段只有文档/规则修改，且仓库尚无代码、测试或 package 配置，可以说明未运行测试的原因。

---

# 28. Debug 原则

出现 Bug 时，不允许第一反应是“大改”。

按以下顺序定位：

```text
输入链接
↓
Playlist Adapter
↓
ParsedPlaylist
↓
Preflight owner display
↓
NormalizedTrack
↓
Contributor merge
↓
Netease Matcher
↓
Canonical Track
↓
Temporary Playlist Sync
↓
Analytics Job
↓
Netease Auth Bridge
↓
Netease Player Bridge
↓
Game UI
```

每一层都应该能够单独打印 / 查看明确的中间结果。

不要让数据从：

```text
raw response
```

直接跳到：

```text
UI
```

必须经过标准化模型，这样才能定位到底在哪一步出错。

---

# 29. 禁止事项

除非用户明确要求，否则禁止：

- 引入微服务架构。
- 引入 Kubernetes / Redis / Kafka / Celery 等与个人 MVP 不匹配的基础设施。
- 引入复杂云部署依赖。
- 创建独立 React SPA。
- 新增 Next.js API Routes、Server Actions、Middleware 承担业务后端。
- 把 FastAPI 业务逻辑迁到 Next.js。
- 把所有后端逻辑塞进 `main.py`。
- 把业务导入、匹配、去重、统计写进 Android / iOS 原生代码。
- 把网易云网页 DOM selector 散落在页面组件。
- 抓取并持久化完整音乐音频。
- 保存网易云明文密码。
- 将真实 Cookie / Token 提交 Git。
- 将完整 Cookie / Token 输出到日志。
- 用歌名一个字段直接做跨平台唯一匹配。
- 去重时覆盖 contributor。
- Hide 时删除 contributor。
- 统计阻塞临时歌单生成或首次播放。
- 为了“快速实现”跳过测试和错误处理。
- 继续以 Electron / Windows Desktop 作为默认目标。

---

# 30. 命名原则

名称必须表达业务含义。

推荐：

```text
PlaylistImportService
TrackMatcher
TrackNormalizer
ContributorMerger
TemporaryPlaylistService
AnalyticsService
AnalyticsWorker
LyricService
NeteasePlaylistAdapter
QQMusicPlaylistAdapter
NeteaseAuthBridge
NeteasePlayerBridge
PlayerQueueStore
SourceRevealStore
```

避免：

```text
Manager
Helper
Utils2
Common
HandleData
ProcessAll
MusicService  # 如果它实际上承担十几种职责
```

通用 `utils` 只能放真正无业务语义的小型纯函数。

---

# 31. 注释原则

注释解释“为什么”，不是重复代码“做什么”。

需要注释：

- 非官方 API 的特殊约束。
- 网易云网页 DOM workaround。
- 移动 WebView / Cookie 同步限制。
- 奇怪的跨平台匹配规则。
- 防止 contributor 丢失的关键逻辑。
- 外部平台限流/兼容原因。
- 异步统计任务幂等或恢复逻辑。

不要写：

```python
# loop tracks
for track in tracks:
```

---

# 32. Definition of Done

任何阶段只有同时满足以下条件才算完成：

- 功能真实可运行，不只是 UI 占位。
- 没有明显 Mock 冒充真实数据。
- 新增逻辑有测试覆盖。
- lint / typecheck / tests 通过。
- 没有新增超大业务文件。
- 前端保持 Next.js static export 兼容。
- 动态业务后端位于 FastAPI。
- Android / iOS 原生代码只承担必要移动容器与 Bridge 职责。
- 外部平台代码位于 Adapter / Bridge。
- 来源标签在导入、去重、匹配、同步、游戏阶段始终可追溯。
- Check / Hide 只改变展示，不改变数据。
- 统计异步执行，不阻塞播放。
- 错误可定位，日志可追踪。
- 没有泄露 Cookie / Token / 密码。
- Agent 明确报告已完成项、测试结果和剩余限制。

---

# 33. 项目最高级原则摘要

所有 Agent 必须始终记住以下 10 条：

1. **这是 Android + iOS 移动端个人 MVP，不再默认 Electron / Desktop。**
2. **Next.js 只做静态导出前端，动态业务统一走 FastAPI。**
3. **来源归因是核心数据，绝不能在去重时丢失。**
4. **平台变化必须被隔离在 Adapter / Bridge 层。**
5. **Android / iOS 原生代码最小化，不承载核心业务。**
6. **单文件保持小而清晰，超过上限必须拆分。**
7. **Route / UI 不承载核心业务逻辑。**
8. **网易云账号只保存必要 Session/Cookie，不保存明文密码。**
9. **播放器使用网易云网页承担真实播放，不自行保存音源。**
10. **临时歌单先 Ready 先播放，统计异步增量执行。**
