# 运行手册

## 1. 前置检查

```bash
node --version          # >= 20.11
npm --version
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --version
ffmpeg -version | head -1
xcode-select -p         # 编译 OCR 需要
```

缺 ffmpeg：`brew install ffmpeg`。缺命令行工具：`xcode-select --install`。

## 2. 首次安装

```bash
cd /path/to/douyin-favorites-brief
npm install
cp config.example.json config.json
# 编辑 config.json：vault、chrome、ffmpeg、ocr 至少四项
npm run build:ocr
npm run check
```

`npm run check` 通过时输出类似：

```json
{
  "ok": true,
  "checks": [
    { "name": "node", "ok": true, "detail": "v20.x" },
    { "name": "config", "ok": true, "detail": "..." }
  ]
}
```

任何 `ok: false` 先修环境，不要继续。

## 3. 配置项

| 键 | 说明 | 示例 |
| --- | --- | --- |
| `vault` | Obsidian vault 根目录，支持 `~` | `~/Documents/Obsidian/MyVault` |
| `outputDir` | vault 内的输出目录 | `抖音收藏` |
| `favoritesUrl` | 收藏夹页面 | 默认抖音收藏 URL |
| `dailyLimit` | 每日处理上限 | `10` |
| `retentionDays` | 原始视频/帧保留天数 | `7` |
| `timezone` | 日期判定时区 | `Asia/Shanghai` |
| `chrome` | Chrome 可执行文件 | 标准 macOS 路径 |
| `ffmpeg` | ffmpeg 可执行文件 | `/opt/homebrew/bin/ffmpeg` |
| `ocr` | OCR 可执行文件 | `bin/ocr` |
| `profileDir` | 专用 Chrome 会话目录 | `state/chrome-profile` |
| `rawDir` | 原始素材目录 | `state/raw` |
| `analysisFile` | 分析结果 | `state/analysis.json` |
| `analysisInput` | 证据包 | `state/analysis_input.json` |
| `processedFile` | 全局去重索引 | `state/processed.json` |
| `lastDigest` | 微信摘要 | `state/last_digest.txt` |

`config.json` 不提交。仓库只保留 `config.example.json`。

## 4. 登录

```bash
npm run login
```

会打开专用 Chrome 窗口。用抖音 App 扫码，确认进入收藏夹后关闭窗口。会话保存在 `state/chrome-profile`，权限 700；不要复制、不要云同步、不要提交。

登录过期时，采集会返回：

```json
{ "status": "needs_login" }
```

重新执行 `npm run login` 即可。

## 5. 日常运行

### 5.1 采集

```bash
bash scripts/run_collect.sh --limit 10
```

可能的状态：

| status | 含义 | 下一步 |
| --- | --- | --- |
| `collected` | 有新增，证据包已写 | 进入分析 |
| `no_new` | 没有未处理收藏 | 结束 |
| `needs_login` | 登录失效 | `npm run login` |
| `failed` | 全部失败或页面异常 | 看 `state/last_run.json` / `logs/collect.log` |

### 5.2 分析

在 DSH 中按 [../prompts/analyze.md](../prompts/analyze.md) 读取 `state/analysis_input.json`，把结果写到 `state/analysis.json`。

要求：

- 只输出 JSON，不要代码围栏；
- 覆盖全部 `aweme_id`；
- 不编造秒数、证据或视频里没讲的事实；
- 不确定就 `confidence: low`，不要漏条。

### 5.3 渲染

```bash
bash scripts/run_render.sh --date 2026-10-22
```

成功输出：

```json
{
  "status": "rendered",
  "date": "2026-10-22",
  "cards": 9,
  "invalid": 0,
  "errors": 1,
  "daily": "/.../30 Daily/2026-10-22-收藏日报.md",
  "digest_path": "/.../state/last_digest.txt"
}
```

然后打开 Obsidian 检查：

- `20 Cards/<date>-<id>.md`
- `30 Daily/<date>-收藏日报.md`
- `索引.md`
- `90 Assets/<id>/cover.*`

## 6. DSH 定时任务

时间：每天 **08:00（Asia/Shanghai）**。

运行手册：[../prompts/daily.md](../prompts/daily.md)。把其中的 `<PROJECT_ROOT>` 替换为本机仓库绝对路径。

任务职责：

1. 调用采集脚本；
2. 按 `analyze.md` 生成 `analysis.json`；
3. 调用渲染脚本；
4. 读取 `state/last_digest.txt`，把它作为最终回复；
5. 由微信桥接推送最终回复。

注意：定时任务的“最终回复”就是微信内容；不要把工具输出、命令日志写进最终回复。不要额外调用 `send_wechat`，避免重复推送。

## 7. 健康检查

```bash
# 配置是否可用
npm run check

# 最近一次采集
cat state/last_run.json

# 最近一次渲染
cat state/last_render.json

# 今天的原始素材
ls -la "state/raw/$(date +%F)"

# 采集日志尾部
tail -n 80 logs/collect.log

# 当前是否已有登录态
ls -ld state/chrome-profile
```

## 8. 故障排查

| 现象 | 先看 | 处理 |
| --- | --- | --- |
| `needs_login` | 浏览器是否跳登录页 | `npm run login`，扫码后重跑 |
| 收藏夹为空 | 账号是否切换、页面结构是否变化 | 手工打开收藏页确认；更新选择器 |
| 视频下载超时 | `logs/collect.log` 的 URL/错误 | 单条重跑；持续失败则跳过并记录 |
| `ffmpeg ETIMEDOUT` | 视频大小、网络、磁盘 | 增大超时或先跳过；不要无限重试 |
| OCR 全空 | 帧是否黑屏、文字是否过小 | 检查 `frames/`；必要时接受 low confidence |
| 渲染 `invalid_analysis` | stdout 里的 `invalid` 数组 | 补 `analysis.json` 缺的条目/字段 |
| 卡片没更新 | 是否手工改过 `status` | 新内容在 `.regen.md`，人工合并 |
| 日报只有部分条目 | `state/days/<date>.json` | 同日多次运行会合并；检查失败区 |
| 定时没跑 | DSH 任务是否启用、Mac 是否睡眠 | 唤醒后补跑；必要时手动执行手册 |
| 微信没收到 | DSH 桥接、最终回复是否为空 | 先看 `last_digest.txt`，再查桥接状态 |

## 9. 清理与重置

### 清理原始素材

`retentionDays` 控制自动清理；也可以手动：

```bash
rm -rf state/raw/2026-10-01
```

不要删除 `state/days/`，否则日报会丢失当天合并记录。

### 重置登录态

```bash
rm -rf state/chrome-profile
npm run login
```

这会退出抖音登录；确认没有其他任务在使用该 profile。

### 完全卸载

1. 停用 DSH 定时任务；
2. 删除本仓库；
3. 如不再需要，删除 Obsidian 输出目录；
4. 如安装过登录项/LaunchAgent，一并移除。

## 10. 升级

```bash
git pull
npm install
npm run build:ocr
npm run check
```

升级后先跑一条 `--limit 1`，确认采集、分析、渲染都正常，再恢复定时任务。

## 11. 不要做

- 不要提交 `state/`、`config.json`、`logs/`、`bin/ocr`。
- 不要把 `state/chrome-profile` 复制到其他机器或云盘。
- 不要在录屏/共享屏幕时打开 `state/chrome-profile`。
- 不要用这个项目做批量点赞、关注、评论、发布。
- 不要绕过验证码；遇到验证页停下来人工处理。
