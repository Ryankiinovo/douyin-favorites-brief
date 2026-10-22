import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const ROOT = path.resolve(import.meta.dirname, "..");
const CONFIG_PATH = process.env.DOUYIN_CONFIG
  ? path.resolve(process.env.DOUYIN_CONFIG)
  : path.join(ROOT, "config.json");

if (!existsSync(CONFIG_PATH)) {
  throw new Error(
    `缺少配置文件：${CONFIG_PATH}\n` +
    "公开 demo 请设置 DOUYIN_CONFIG=demo/config.json；使用自己的数据时复制 demo/config.json 并修改路径。"
  );
}

export const CONFIG = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));

export function expandHome(p) {
  const s = String(p ?? "");
  if (s === "~") return process.env.HOME || s;
  if (s.startsWith("~/")) return path.join(process.env.HOME || "", s.slice(2));
  return s;
}

export function resolvePath(p) {
  const expanded = expandHome(p);
  return path.isAbsolute(expanded) ? expanded : path.join(ROOT, expanded);
}

export function ensureDir(p) {
  mkdirSync(p, { recursive: true });
  return p;
}

export function readJson(p, fallback = null) {
  try { return JSON.parse(readFileSync(resolvePath(p), "utf8")); } catch { return fallback; }
}

export function writeJson(p, value) {
  const target = resolvePath(p);
  ensureDir(path.dirname(target));
  const tmp = target + ".tmp-" + process.pid;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, target);
}

export function writeText(p, text, mode = 0o600) {
  const target = resolvePath(p);
  ensureDir(path.dirname(target));
  const tmp = target + ".tmp-" + process.pid;
  writeFileSync(tmp, text, { mode });
  renameSync(tmp, target);
}

export function todayShanghai() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CONFIG.timezone,
    year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function cleanText(value, max = 20000) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

export function displayTitle(value, max = 48) {
  let s = String(value ?? "")
    .split(/\s+#/)[0]
    .replace(/#[^\s#]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\|/g, "｜")
    .trim();
  s = s.split(/[。！？!?]/)[0].trim();
  const chars = Array.from(s);
  if (chars.length > max) s = chars.slice(0, max - 1).join("") + "…";
  return s || "未命名视频";
}

export function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

export function yamlList(values) {
  return "[" + (values || []).map((v) => JSON.stringify(String(v))).join(", ") + "]";
}

export function run(bin, args, opts = {}) {
  const r = spawnSync(bin, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: opts.timeout ?? 180000,
    ...opts,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(`${path.basename(bin)} exited ${r.status}: ${(r.stderr || "").slice(-800)}`);
  }
  return r.stdout || "";
}

export function rmIfExists(p) {
  try { rmSync(p, { recursive: true, force: true }); } catch {}
}

export function fileExists(p) {
  return existsSync(resolvePath(p));
}
