import path from "node:path";
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import {
  ROOT, CONFIG, resolvePath, ensureDir, readJson, writeJson, writeText,
  todayShanghai, nowIso, yamlString, yamlList, cleanText, rmIfExists, displayTitle
} from "./lib.mjs";

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

function parseAnalysis(file) {
  const analysisPath = resolvePath(file);
  if (!existsSync(analysisPath)) {
    console.error("找不到分析文件：" + analysisPath);
    console.error("先按 prompts/analyze.md 生成 JSON，或用 --analysis 指定文件；公开 demo 使用 demo/fixtures/analysis.json。");
    process.exit(2);
  }
  let raw = readFileSync(analysisPath, "utf8").trim();
  raw = raw.replace(/^\uFEFF/, "");
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  const data = JSON.parse(raw);
  if (Array.isArray(data)) return { date: undefined, items: data };
  return data;
}

const analysis = parseAnalysis(getArg("--analysis") || CONFIG.analysisFile);
const date = getArg("--date") || analysis.date || todayShanghai();
const manifestPath = path.join(resolvePath(CONFIG.rawDir), date, "manifest.json");
const manifest = readJson(manifestPath);
if (!manifest || !Array.isArray(manifest.items)) {
  console.error("找不到 manifest：" + manifestPath);
  console.error("公开 demo 请确认 demo/fixtures/<date>/manifest.json 存在，并用 --date 指定同一天。");
  process.exit(2);
}

const stateRoot = resolvePath(CONFIG.stateDir || "state");

const analysisItems = Array.isArray(analysis.items) ? analysis.items : [];
const byId = new Map(analysisItems.map((x) => [String(x.aweme_id || x.id), x]));
const outputRoot = path.join(resolvePath(CONFIG.vault), CONFIG.outputDir);
const cardsDir = ensureDir(path.join(outputRoot, "20 Cards"));
const dailyDir = ensureDir(path.join(outputRoot, "30 Daily"));
const assetsRoot = ensureDir(path.join(outputRoot, "90 Assets"));
const sourcesRoot = ensureDir(path.join(outputRoot, "10 Sources"));
const year = date.slice(0, 4);
const month = date.slice(5, 7);
const sourceDir = ensureDir(path.join(sourcesRoot, year, month));

const VERDICTS = new Set(["值得完整看", "只看前半", "看个乐", "跳过"]);
const CONFIDENCE = new Set(["high", "medium", "low"]);

function validate(a, item) {
  if (!a) return "缺少分析结果";
  if (!a.summary || String(a.summary).trim().length < 4) return "summary 为空";
  if (!a.hook || String(a.hook).trim().length < 2) return "hook 为空";
  if (!VERDICTS.has(a.verdict)) return "verdict 不合法：" + a.verdict;
  if (!Array.isArray(a.actions) || a.actions.length < 1) return "actions 为空";
  if (a.actions.length > 3) a.actions = a.actions.slice(0, 3);
  if (!a.followup || String(a.followup).trim().length < 2) return "followup 为空";
  if (!CONFIDENCE.has(a.confidence)) a.confidence = "low";
  if (!Array.isArray(a.topics)) a.topics = [];
  if (!Array.isArray(a.evidence)) a.evidence = [];
  return null;
}

function cardLink(id) {
  return `[[20 Cards/${date}-${id}|${id}]]`;
}

function sourceLink(id) {
  return `[[10 Sources/${year}/${month}/${id}]]`;
}

const titleOf = (item) => displayTitle(item.title);

function pickEvidence(a, item) {
  const candidates = [...(a.evidence || [])].map((s) => String(s).trim()).filter(Boolean);
  if (!candidates.length && item.ocr) {
    const lines = String(item.ocr).split("\n").map((s) => s.trim()).filter(Boolean);
    const useful = lines.filter((s) => s.length >= 8 && s.length <= 120 && !/^(抖音|登录|评论|点赞|收藏|分享|回复|举报|发布时间|展开)/.test(s));
    candidates.push(...useful.slice(0, 3));
  }
  return [...new Set(candidates)].slice(0, 3).map((s) => s.length > 180 ? s.slice(0, 180) + "…" : s);
}

function statsText(stats) {
  if (!stats) return "";
  const parts = [];
  if (stats.like) parts.push("赞 " + stats.like);
  if (stats.comment) parts.push("评 " + stats.comment);
  if (stats.collect) parts.push("藏 " + stats.collect);
  if (stats.share) parts.push("转 " + stats.share);
  return parts.join(" · ");
}

function writeSource(item, a) {
  const p = path.join(sourceDir, item.aweme_id + ".md");
  if (existsSync(p)) return p;
  const content = `---
type: douyin-source
aweme_id: "${item.aweme_id}"
title: ${yamlString(titleOf(item))}
author: ${yamlString(item.author)}
url: ${yamlString(item.url)}
published_at: ${yamlString(item.publish_time)}
collected_at: ${yamlString(item.collected_at)}
duration: ${yamlString(item.duration_text)}
stats: ${yamlList(statsText(item.stats) ? [statsText(item.stats)] : [])}
ocr_chars: ${item.ocr_chars || 0}
---

# ${titleOf(item)}

> 来源：[${item.url}](${item.url})<br>
> 作者：${item.author || "未知"} · 时长：${item.duration_text || "未知"} · 收藏于 ${item.collected_at}

## 字幕 / 画面 OCR

\`\`\`text
${cleanText(item.ocr, 200000) || "（未提取到字幕）"}
\`\`\`
`;
  writeText(p, content, 0o600);
  return p;
}

function writeCard(item, a) {
  const original = path.join(cardsDir, `${date}-${item.aweme_id}.md`);
  // 用户改过 status 的卡片不覆盖，只生成 .regen 供人工合并。
  let target = original;
  if (existsSync(original)) {
    const text = readFileSync(original, "utf8");
    if (/^status:\s*(?!inbox\b).+$/m.test(text)) {
      target = original.replace(/\.md$/, ".regen.md");
    } else {
      target = original;
    }
  }
  const coverRel = item.cover_path && existsSync(item.cover_path)
    ? `90 Assets/${item.aweme_id}/cover${path.extname(item.cover_path)}`
    : "";
  if (coverRel) {
    const dest = path.join(assetsRoot, item.aweme_id, path.basename(coverRel));
    ensureDir(path.dirname(dest));
    copyFileSync(item.cover_path, dest);
  }
  const evidence = pickEvidence(a, item);
  const content = `---
type: douyin-card
aweme_id: "${item.aweme_id}"
title: ${yamlString(titleOf(item))}
author: ${yamlString(item.author)}
url: ${yamlString(item.url)}
published_at: ${yamlString(item.publish_time)}
collected_at: ${yamlString(item.collected_at)}
processed_at: ${yamlString(nowIso())}
duration: ${yamlString(item.duration_text)}
verdict: ${yamlString(a.verdict)}
confidence: ${a.confidence}
status: inbox
topics: ${yamlList(a.topics)}
source_note: ${yamlString(sourceLink(item.aweme_id))}
${coverRel ? `cover: ${yamlString(coverRel)}\n` : ""}---

# ${titleOf(item)}

> ${item.author || "未知作者"} · ${item.duration_text || "时长未知"} · **${a.verdict}**

${coverRel ? `![[${coverRel}]]\n` : ""}## 讲了什么

${a.summary}

## 钩子

${a.hook}

## 值不值

**${a.verdict}**${a.verdict_reason ? " — " + a.verdict_reason : ""}

## 能抄什么

${a.actions.map((x, i) => `${i + 1}. ${x}`).join("\n")}

## 要不要跟进

${a.followup}

## 证据

${evidence.length ? evidence.map((q) => "> " + q.replace(/\n/g, " ")).join("\n>\n") : "> （OCR 证据不足，置信度标记为 " + a.confidence + "）"}

## 原视频

[${titleOf(item)}](${item.url}) · ${sourceLink(item.aweme_id)}
`;
  writeText(target, content, 0o600);
  return { target, original };
}

function updateIndex(records) {
  const p = path.join(outputRoot, "索引.md");
  const header = `---
type: douyin-index
updated: ${date}
---

# 抖音收藏索引

按处理日期倒序。卡片状态可在卡片 frontmatter 的 status 字段手工修改。

| 日期 | 标题 | 作者 | 值不值 | 卡片 |
|---|---|---|---|---|
`;
  let text = existsSync(p) ? readFileSync(p, "utf8") : header;
  if (!text.includes("| 日期 | 标题 | 作者 | 值不值 | 卡片 |")) {
    text = header + "\n" + text;
  }
  for (const r of records) {
    const key = `20 Cards/${date}-${r.item.aweme_id}`;
    if (text.includes(key)) continue;
    const title = displayTitle(r.item.title, 56).replace(/\|/g, "\\|");
    const rawAuthor = String(r.item.author || "").replace(/\|/g, "\\|");
    const author = rawAuthor.length > 40 ? rawAuthor.slice(0, 39) + "…" : rawAuthor;
    text += `| ${date} | ${title} | ${author} | ${r.a.verdict} | [[${key}]] |\n`;
  }
  // 索引按处理日期倒序；兼容手工追加的旧行。
  const lines = text.split("\n");
  const headerIndex = lines.findIndex((line) => line.startsWith("| 日期 | 标题 | 作者 | 值不值 | 卡片 |"));
  if (headerIndex >= 0) {
    const tableStart = headerIndex + 2;
    let tableEnd = tableStart;
    while (tableEnd < lines.length && lines[tableEnd].startsWith("|")) tableEnd++;
    const rows = lines.slice(tableStart, tableEnd);
    const dateOf = (row) => (row.match(/^\|\s*(\d{4}-\d{2}-\d{2})/) || [, ""])[1];
    rows.sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
    lines.splice(tableStart, rows.length, ...rows);
    text = lines.join("\n");
  }
  text = text.replace(/^updated:\s*.+$/m, `updated: ${date}`);
  writeText(p, text, 0o600);
}

function buildDaily(records, errors) {
  const ok = records.length;
  const verdictRank = { "值得完整看": 0, "只看前半": 1, "看个乐": 2, "跳过": 3 };
  const confidenceRank = { high: 0, medium: 1, low: 2 };
  const score = (r) => [
    verdictRank[r.a.verdict] ?? 3,
    confidenceRank[r.a.confidence] ?? 3,
    -Math.min(3, (r.a.actions || []).length),
    String(r.a.followup || "").startsWith("要") ? 0 : 1,
  ];
  const top = records
    .filter((r) => r.a.verdict !== "跳过")
    .sort((a, b) => {
      const sa = score(a);
      const sb = score(b);
      for (let i = 0; i < sa.length; i++) {
        if (sa[i] !== sb[i]) return sa[i] - sb[i];
      }
      return 0;
    })
    .slice(0, 3);

  const lines = [];
  lines.push(`---
type: douyin-daily
date: ${date}
new_count: ${ok}
ok_count: ${ok}
failed_count: ${errors.length}
---
`);
  lines.push(`# ${date} 收藏日报`);
  lines.push("");
  lines.push(`> 新增 ${ok} 条 · 成功 ${ok} · 失败 ${errors.length} · 生成时间 ${nowIso()}`);
  lines.push("");
  lines.push("## 今天最值得看");
  lines.push("");
  if (!top.length) {
    lines.push("今天没有高置信度推荐，先看下面的全部列表。");
  } else {
    top.forEach((r, i) => {
      lines.push(`${i + 1}. [[20 Cards/${date}-${r.item.aweme_id}|${titleOf(r.item)}]] — ${r.a.summary}`);
    });
  }
  lines.push("");
  lines.push("## 全部新增");
  lines.push("");
  records.forEach((r, i) => {
    const n = String(i + 1).padStart(2, "0");
    lines.push(`### ${n} ${titleOf(r.item)}`);
    lines.push("");
    lines.push(`- 作者：${r.item.author || "未知"} · 时长：${r.item.duration_text || "未知"}${statsText(r.item.stats) ? " · " + statsText(r.item.stats) : ""}`);
    lines.push(`- 讲什么：${r.a.summary}`);
    lines.push(`- 钩子：${r.a.hook}`);
    lines.push(`- 值不值：**${r.a.verdict}**${r.a.verdict_reason ? " — " + r.a.verdict_reason : ""}`);
    lines.push(`- 能抄什么：${r.a.actions.map((x) => String(x).replace(/[。；;]+$/, "")).join("；")}`);
    lines.push(`- 要不要跟进：${r.a.followup}`);
    lines.push(`- 卡片：[[20 Cards/${date}-${r.item.aweme_id}]]`);
    lines.push("");
  });
  if (errors.length) {
    lines.push("## 失败 / 待处理");
    lines.push("");
    for (const e of errors) {
      lines.push(`- ${e.id || e.url || "未知"}：${e.error || e.message || "处理失败"}`);
    }
    lines.push("");
  }
  lines.push("## 原视频");
  lines.push("");
  records.forEach((r) => lines.push(`- [${titleOf(r.item)}](${r.item.url})`));
  lines.push("");
  return { text: lines.join("\n"), top };
}

function cleanupOldRaw() {
  const days = Number(CONFIG.retentionDays || 0);
  if (!days) return;
  const root = resolvePath(CONFIG.rawDir);
  if (!existsSync(root)) return;
  const cutoff = Date.now() - days * 86400000;
  for (const name of readdirSync(root)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(name)) continue;
    const dir = path.join(root, name);
    let t = 0;
    try { t = statSync(dir).mtimeMs; } catch { continue; }
    if (t >= cutoff) continue;
    for (const sub of readdirSync(dir)) {
      const p = path.join(dir, sub);
      if (sub === "video.mp4" || sub === "frames") rmIfExists(p);
    }
  }
}

const records = [];
const invalid = [];
for (const item of manifest.items) {
  const a = byId.get(String(item.aweme_id));
  const err = validate(a, item);
  if (err) { invalid.push({ id: item.aweme_id, title: item.title, error: err }); continue; }
  writeSource(item, a);
  const card = writeCard(item, a);
  records.push({ item, a, card });
}

if (!records.length) {
  console.error(JSON.stringify({ status: "invalid_analysis", invalid }, null, 2));
  process.exit(2);
}

const dayStatePath = path.join(ensureDir(path.join(stateRoot, "days")), `${date}.json`);
const prevDay = readJson(dayStatePath, { items: [], errors: [] });
const dayById = new Map((prevDay.items || []).map((r) => [String(r.item.aweme_id), r]));
for (const r of records) dayById.set(String(r.item.aweme_id), r);
const dayRecords = [...dayById.values()];

const currentErrors = [...(manifest.errors || []), ...invalid];
const errorById = new Map((prevDay.errors || []).map((e) => [String(e.id || e.url), e]));
for (const r of records) errorById.delete(String(r.item.aweme_id));
for (const e of currentErrors) errorById.set(String(e.id || e.url), e);
const dayErrors = [...errorById.values()];
writeJson(dayStatePath, { date, updated_at: nowIso(), items: dayRecords, errors: dayErrors });

updateIndex(dayRecords);

const daily = buildDaily(dayRecords, dayErrors);
const dailyPath = path.join(dailyDir, `${date}-收藏日报.md`);
writeText(dailyPath, daily.text, 0o600);

const digest = [
  `抖音收藏日报 ${date}`,
  `采集 ${manifest.requested || records.length} 条，成功 ${records.length} 条${currentErrors.length ? `，失败/待处理 ${currentErrors.length} 条` : ""}；今日共 ${dayRecords.length} 条。`,
  daily.top.length ? "今天最值得看：" : "",
  ...daily.top.map((r, i) => `${i + 1}. ${titleOf(r.item)}（${r.item.author || "未知"}）— ${r.a.summary}`),
  `日报：${dailyPath}`,
].filter(Boolean).join("\n");
writeText(CONFIG.lastDigest, digest + "\n", 0o600);

const processed = readJson(CONFIG.processedFile, { items: {} });
processed.items = processed.items || {};
for (const r of records) {
  processed.items[r.item.aweme_id] = {
    date,
    title: titleOf(r.item),
    card: path.relative(outputRoot, r.card.original),
    status: "inbox",
    processed_at: nowIso(),
  };
}
writeJson(CONFIG.processedFile, processed);

writeJson(path.join(stateRoot, "last_render.json"), {
  at: nowIso(),
  date,
  cards: records.length,
  invalid: invalid.length,
  errors: dayErrors.length,
  daily: dailyPath,
  digest,
});
cleanupOldRaw();

console.log(JSON.stringify({
  status: "rendered",
  date,
  cards: records.length,
  invalid: invalid.length,
  errors: dayErrors.length,
  daily: dailyPath,
  digest_path: resolvePath(CONFIG.lastDigest),
}, null, 2));
