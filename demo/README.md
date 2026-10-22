# 可运行 demo

这个 demo 只跑渲染层：读合成 `manifest.json` 和 `analysis.json`，生成 Obsidian 源笔记、知识卡、日报和索引。

不登录、不访问网络、不调用模型、不需要安装依赖。

## 运行

在仓库根目录：

```bash
npm run demo
```

输出在 `demo/out/抖音收藏/`：

```text
demo/out/抖音收藏/
├── 10 Sources/2026/10/0000000000000000000.md
├── 20 Cards/2026-10-22-0000000000000000000.md
├── 30 Daily/2026-10-22-收藏日报.md
└── 索引.md
```

每次运行会先清空 `demo/out`，保证结果可重复。

## 文件

- `config.json`：demo 专用路径配置，不读取仓库外的文件。
- `fixtures/2026-10-22/manifest.json`：合成采集清单。
- `fixtures/analysis.json`：合成结构化分析结果。
- `run-demo.sh`：设置 `DOUYIN_CONFIG` 并调用渲染器。

## 换成自己的数据

复制一份 `config.json`，把 `rawDir`、`analysisFile`、`vault` 指向自己的目录，然后：

```bash
DOUYIN_CONFIG=/path/to/config.json node scripts/render.mjs --date 2026-10-22
```

输入格式见 [../docs/architecture.md](../docs/architecture.md#4-数据模型) 和 [../prompts/analyze.md](../prompts/analyze.md)。

## 注意

- 示例 ID、作者、URL 全是占位，不对应真实视频或账号。
- 不要把自己的 Cookie、真实视频或真实卡片提交到公开仓库。
