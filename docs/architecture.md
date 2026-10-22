# 架构说明

## 1. 设计目标

这不是“一个爬虫”，而是一条**每天可重复执行、失败可定位、结果可人工修正**的本地流水线。架构围绕五个约束：

1. **登录态只留在本机**：会话不进入对话、不进入 Obsidian、不进入仓库。
2. **每一步可单独重跑**：采集失败不重跑分析，分析失败不重新下载视频。
3. **模型可替换**：脚本不绑定某个模型 API；分析由宿主按提示词完成。
4. **输出是普通文件**：Markdown + frontmatter + JSON，Obsidian 可直接读。
5. **公开层可独立运行**：渲染器不依赖采集器、登录态或网络。

## 2. 组件

| 组件 | 位置 | 职责 | 是否公开 |
| --- | --- | --- | --- |
| 登录器 | 私有运行环境 | 拉起专用 Chrome，扫码，持久化会话 | 否 |
| 采集器 | 私有运行环境 | 打开收藏夹、去重、下载、抽帧、OCR | 否 |
| 证据契约 | `manifest.json` / `analysis_input.json` | 采集层交给分析层的结构化输入 | 是（示例） |
| 分析器 | 宿主 + `prompts/analyze.md` | 把证据转成严格 JSON | 是（提示词） |
| 渲染器 | `scripts/render.mjs` | 生成源笔记、知识卡、日报、索引 | 是 |
| 通知器 | 宿主定时任务 + 本地通知 | 推送日报摘要 | 否（描述） |
| 配置检查 | 私有运行环境 | 启动前验证路径/权限 | 否 |

## 3. 数据流（完整系统）

```text
收藏夹
   │  Playwright（专用 Chrome profile）
   ▼
state/raw/<date>/
   ├── manifest.json          # 本次采集清单、成功/失败
   ├── <aweme_id>/video.mp4   # 原始视频（默认保留 7 天）
   ├── <aweme_id>/frames/     # 关键帧
   └── <aweme_id>/ocr.txt     # OCR 文本
   │
   ▼
state/analysis_input.json    # 给模型的证据包
   │  宿主 + prompts/analyze.md
   ▼
state/analysis.json          # 严格结构化结果
   │  render.mjs
   ▼
Obsidian/<outputDir>/
   ├── 10 Sources/YYYY/MM/<aweme_id>.md
   ├── 20 Cards/<date>-<aweme_id>.md
   ├── 30 Daily/<date>-收藏日报.md
   ├── 90 Assets/<aweme_id>/cover.*
   └── 索引.md
   │
   ▼
state/last_digest.txt        # 通知摘要
```

公开仓库覆盖 `analysis.json → Obsidian` 这一段，并提供合成 `manifest.json` / `analysis.json` 作为 demo 输入。

## 4. 数据模型

### 输入：`manifest.json`

```json
{
  "date": "YYYY-MM-DD",
  "requested": 1,
  "items": [
    {
      "aweme_id": "string",
      "title": "string",
      "desc": "string",
      "author": "string",
      "publish_time": "string",
      "duration_text": "mm:ss",
      "url": "https://...",
      "collected_at": "ISO-8601",
      "stats": { "like": "string", "comment": "string", "collect": "string" },
      "ocr": "string",
      "ocr_chars": 0
    }
  ],
  "errors": []
}
```

### 输出：`analysis.json`

字段、枚举和规则以 [../prompts/analyze.md](../prompts/analyze.md) 为准。渲染器只依赖：

- `summary`、`hook`、`verdict`、`verdict_reason`
- `actions[]`、`followup`、`confidence`
- `evidence[]`、`topics[]`

## 5. 关键不变量

1. **按 `aweme_id` 去重**：全局索引决定“是否处理过”，当天记录决定“今天是否已合并”。
2. **源笔记只写一次**：同名文件存在时直接返回，不覆盖历史 OCR。
3. **用户改过的卡片不覆盖**：`status` 不是 `inbox` 时，新内容写到 `.regen.md`。
4. **写入是原子的**：先写同目录临时文件再 `rename`，避免半截 JSON/Markdown。
5. **分析必须覆盖全部条目**：渲染器逐条校验；缺条目、缺字段进入 `invalid`。
6. **日报按日合并**：同一天多次运行，日报和索引包含当天全部成功条目。
7. **失败不阻塞成功**：单条失败进入 `errors`，其他条目继续。

## 6. 失败模式

| 失败 | 检测 | 行为 |
| --- | --- | --- |
| 登录过期 | 跳登录页 / 无会话标识 | 采集返回 `needs_login`，不继续 |
| 页面结构变化 | 找不到收藏卡片 | 返回 `failed`，写日志，不生成空分析 |
| 视频下载超时 | 子进程超时/非 0 | 该条失败，继续下一条 |
| ffmpeg 抽帧超时 | 子进程超时 | 该条失败，记录 `ETIMEDOUT` |
| OCR 无文本 | `ocr_chars=0` | 仍可生成卡片，`confidence=low` |
| 模型输出漏条 | 渲染校验 | 缺失条目进 `invalid`，不生成空卡片 |
| Obsidian 路径不可写 | 配置检查/渲染异常 | 启动前报错，不写半套文件 |
| 定时任务未触发 | 无当天状态文件 | 运维手册给出排查顺序 |

## 7. 为什么不用数据库

当前规模是“单人、每天 10 条、保留 7 天原始视频”。JSON 状态文件足够，且有三个额外好处：

- 可以直接 `cat` / `jq` 排查；
- 可以随项目备份（但运行态不提交）；
- 不引入迁移和并发写入的复杂度。

如果未来做历史回填、多账号或跨设备同步，再把索引迁到 SQLite；迁移点是清晰的，不需要重写采集器。

## 8. 扩展点

- **ASR**：在证据包里增加 `transcript` 字段；分析提示词已预留。
- **多平台**：把“平台适配”抽成 interface，渲染器不需要知道来源。
- **历史回填**：复用单条处理函数，按日期分批写入。
- **可观测性**：把运行状态汇总成健康检查命令。
