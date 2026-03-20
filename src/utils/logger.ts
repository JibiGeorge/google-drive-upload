import fs from "fs";
import path from "path";

// ─── ANSI Colors ─────────────────────────────────────────────────────────────
const COLORS = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  dim:     "\x1b[2m",
  red:     "\x1b[31m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  blue:    "\x1b[34m",
  magenta: "\x1b[35m",
  cyan:    "\x1b[36m",
  white:   "\x1b[37m",
  gray:    "\x1b[90m",
} as const;

// ─── Log Levels ───────────────────────────────────────────────────────────────
const LEVELS = {
  DEBUG: { priority: 0, label: "DEBUG", color: COLORS.gray,    icon: "🔍" },
  INFO:  { priority: 1, label: "INFO ", color: COLORS.cyan,    icon: "ℹ️ " },
  STEP:  { priority: 1, label: "STEP ", color: COLORS.blue,    icon: "🔹" },
  OK:    { priority: 1, label: "OK   ", color: COLORS.green,   icon: "✅" },
  WARN:  { priority: 2, label: "WARN ", color: COLORS.yellow,  icon: "⚠️ " },
  ERROR: { priority: 3, label: "ERROR", color: COLORS.red,     icon: "❌" },
  FATAL: { priority: 4, label: "FATAL", color: COLORS.magenta, icon: "💀" },
} as const;

type LevelKey = keyof typeof LEVELS;

// ─── Config ───────────────────────────────────────────────────────────────────
const LOG_LEVEL   = (process.env.LOG_LEVEL || "INFO").toUpperCase() as LevelKey;
const LOG_TO_FILE = process.env.LOG_TO_FILE !== "false";
const LOG_DIR     = process.env.LOG_DIR || path.join(process.cwd(), "logs");
const minPriority = LEVELS[LOG_LEVEL]?.priority ?? 1;

if (LOG_TO_FILE) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timestamp(): string {
  return new Date().toISOString();
}

function formatTag(tag: string): string {
  return tag ? `${COLORS.magenta}[${tag}]${COLORS.reset} ` : "";
}

function stringify(val: unknown): string {
  if (val === undefined || val === null) return String(val);
  if (typeof val === "string") return val;
  try { return JSON.stringify(val, null, 2); } catch { return String(val); }
}

function writeToFile(line: string): void {
  if (!LOG_TO_FILE) return;
  const dateStr  = new Date().toISOString().slice(0, 10);
  const filePath = path.join(LOG_DIR, `app-${dateStr}.log`);
  const clean    = line.replace(/\x1b\[[0-9;]*m/g, "");
  fs.appendFileSync(filePath, clean + "\n", "utf8");
}

// ─── Core log function ────────────────────────────────────────────────────────
function log(levelKey: LevelKey, tag: string, message: string, meta?: unknown): void {
  const level = LEVELS[levelKey] ?? LEVELS.INFO;
  if (level.priority < minPriority) return;

  const ts      = `${COLORS.dim}${timestamp()}${COLORS.reset}`;
  const lbl     = `${level.color}${COLORS.bold}${level.label}${COLORS.reset}`;
  const tagStr  = formatTag(tag);
  const msgStr  = `${level.color}${message}${COLORS.reset}`;
  const metaStr = meta !== undefined
    ? `\n${COLORS.dim}${stringify(meta)}${COLORS.reset}`
    : "";

  const line = `${ts} ${level.icon} ${lbl} ${tagStr}${msgStr}${metaStr}`;

  if (levelKey === "ERROR" || levelKey === "FATAL") {
    console.error(line);
  } else {
    console.log(line);
  }

  writeToFile(line);
}

// ─── Timer utility ────────────────────────────────────────────────────────────
function createTimer(tag: string, label: string) {
  const start = Date.now();
  return {
    end(meta?: unknown): number {
      const ms = Date.now() - start;
      log("OK", tag, `${label} completed in ${ms}ms`, meta);
      return ms;
    },
    elapsed(): number {
      return Date.now() - start;
    },
  };
}

// ─── Separator ────────────────────────────────────────────────────────────────
export function separator(title = ""): void {
  const line = "─".repeat(60);
  const msg  = title
    ? `\n${COLORS.bold}${COLORS.cyan}┌${line}┐\n│ ${title.padEnd(58)} │\n└${line}┘${COLORS.reset}`
    : `${COLORS.dim}${line}${COLORS.reset}`;
  console.log(msg);
  writeToFile(msg);
}

// ─── Logger factory ───────────────────────────────────────────────────────────
/**
 * Creates a tagged logger instance.
 * @param tag — module name shown in every log line
 */
export function createLogger(tag: string) {
  return {
    debug:     (msg: string, meta?: unknown) => log("DEBUG", tag, msg, meta),
    info:      (msg: string, meta?: unknown) => log("INFO",  tag, msg, meta),
    step:      (msg: string, meta?: unknown) => log("STEP",  tag, msg, meta),
    ok:        (msg: string, meta?: unknown) => log("OK",    tag, msg, meta),
    warn:      (msg: string, meta?: unknown) => log("WARN",  tag, msg, meta),
    error:     (msg: string, meta?: unknown) => log("ERROR", tag, msg, meta),
    fatal:     (msg: string, meta?: unknown) => log("FATAL", tag, msg, meta),
    separator: (title?: string)              => separator(title),
    timer:     (label: string)               => createTimer(tag, label),
    /** Log an Error object with full stack trace */
    exception(msg: string, err: unknown): void {
      const e = err instanceof Error ? err : undefined;
      log("ERROR", tag, msg, {
        message: e?.message,
        stack:   e?.stack,
        ...(e && "code" in e ? { code: (e as NodeJS.ErrnoException).code } : {}),
      });
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;