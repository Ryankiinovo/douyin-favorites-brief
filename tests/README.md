# 验收清单

公开仓库只包含渲染层，所以这里是不依赖登录态的验收。

## 1. 语法

```bash
npm run check
```

期望：命令退出码 0，没有输出。

## 2. demo 渲染

```bash
npm run demo
```

期望：

- 输出 `status: "rendered"`、`cards: 1`、`invalid: 0`；
- 生成 `demo/out/抖音收藏/10 Sources/2026/10/0000000000000000000.md`；
- 生成 `demo/out/抖音收藏/20 Cards/2026-10-22-0000000000000000000.md`；
- 生成 `demo/out/抖音收藏/30 Daily/2026-10-22-收藏日报.md`；
- 生成 `demo/out/抖音收藏/索引.md`；
- 生成 `demo/out/last_digest.txt`。

## 3. 幂等

连续运行两次 `npm run demo`：

- 第二次仍只生成 1 张卡；
- `索引.md` 不出现重复行；
- `cards` 仍为 1。

## 4. 人工修改保护

1. 先直接渲染一次（注意不要用 `npm run demo`，它会清空输出）：

   ```bash
   DOUYIN_CONFIG="$PWD/demo/config.json" \
     node scripts/render.mjs --date 2026-10-22 --analysis demo/fixtures/analysis.json
   ```

2. 把 `demo/out/抖音收藏/20 Cards/2026-10-22-0000000000000000000.md` 的 `status: inbox` 改成 `status: actioned`；
3. 再执行同一条渲染命令。

期望：原卡片仍为 `status: actioned`，新内容写入同目录的 `.regen.md`。

## 5. 分析缺条

把 `demo/fixtures/analysis.json` 里的 `items` 改成空数组，再跑：

```bash
npm run demo
```

期望：退出码 2，输出 `invalid_analysis`，不会生成空卡片。

## 6. 隐私回归

```bash
git status --ignored --short | sed -n '1,40p'
```

确认 `demo/out/` 被忽略，且仓库里没有 Cookie、真实视频、真实 OCR、本机路径。

## 不在公开层验收

登录、采集、下载、抽帧、OCR 需要个人会话和本机环境，不在这个仓库里，也不承诺一键复现。完整链路的边界见 [../docs/privacy.md](../docs/privacy.md)。
