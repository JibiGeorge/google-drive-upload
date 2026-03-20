import { execSync } from "child_process";
import fs from "fs";
import { createLogger } from "./logger";

const logger = createLogger("BrowserResolver");

// ─── Platform candidate paths ─────────────────────────────────────────────────
const CANDIDATES: Record<string, string[]> = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    "/usr/bin/microsoft-edge",
    "/usr/bin/brave-browser",
  ],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Chromium\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ],
};

// ─── PATH lookup ──────────────────────────────────────────────────────────────
function findOnPath(platform: string): string | null {
  const commands =
    platform === "win32"
      ? ["where chrome", "where chromium"]
      : ["which google-chrome", "which google-chrome-stable", "which chromium", "which chromium-browser"];

  for (const cmd of commands) {
    try {
      const result = execSync(cmd, { stdio: ["pipe", "pipe", "pipe"] })
        .toString()
        .trim()
        .split("\n")[0];
      if (result && fs.existsSync(result)) return result;
    } catch {
      // not found on PATH — try next
    }
  }
  return null;
}

// ─── Serverless Chromium (for hosted environments) ────────────────────────────
/**
 * Attempts to resolve a Chromium executable using @sparticuz/chromium.
 * This package bundles a pre-built Chromium binary that works on:
 *   - AWS Lambda / EC2
 *   - Render
 *   - DigitalOcean App Platform / Droplets
 *   - Google Cloud Run / Functions
 *   - Any Linux container environment
 *
 * Returns { executablePath, args } on success, or null if unavailable.
 */
async function resolveServerlessChromium(): Promise<{
  executablePath: string;
  args: string[];
} | null> {
  // @sparticuz/chromium ships a Linux binary — skip it on macOS and Windows
  if (process.platform !== "linux") {
    logger.debug("Skipping @sparticuz/chromium on non-Linux platform");
    return null;
  }

  try {
    const chromium = await import("@sparticuz/chromium");
    const executablePath = await chromium.default.executablePath();

    if (!executablePath || !fs.existsSync(executablePath)) {
      return null;
    }

    logger.info(`Using @sparticuz/chromium: ${executablePath}`);
    return {
      executablePath,
      args: chromium.default.args,
    };
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface BrowserConfig {
  executablePath: string;
  /** Recommended launch args for this environment */
  args: string[];
}

const DEFAULT_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

/**
 * Resolves the best available Chromium executable for the current environment.
 *
 * Resolution order:
 *  1. `PUPPETEER_EXECUTABLE_PATH` env var   (explicit override)
 *  2. @sparticuz/chromium                   (hosted / serverless environments)
 *  3. Known local installation paths        (macOS / Linux / Windows)
 *  4. PATH lookup via `which` / `where`     (last resort)
 *
 * Returns a `BrowserConfig` with the executable path and recommended launch args.
 * Throws a descriptive error if no browser is found.
 */
export async function resolveBrowserConfig(): Promise<BrowserConfig> {
  const platform = process.platform;

  // 1. Explicit env override
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath) {
    if (fs.existsSync(envPath)) {
      logger.info(`Using browser from PUPPETEER_EXECUTABLE_PATH: ${envPath}`);
      return { executablePath: envPath, args: DEFAULT_ARGS };
    }
    logger.warn(`PUPPETEER_EXECUTABLE_PATH set but not found: ${envPath} — continuing auto-detect`);
  }

  // 2. Serverless Chromium (works on Render, AWS, DigitalOcean, GCR, etc.)
  const serverless = await resolveServerlessChromium();
  if (serverless) return serverless;

  // 3. Known local paths
  const candidates = CANDIDATES[platform] ?? [];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      logger.info(`Found local browser at: ${candidate}`);
      return { executablePath: candidate, args: DEFAULT_ARGS };
    }
  }

  // 4. PATH lookup
  const pathResult = findOnPath(platform);
  if (pathResult) {
    logger.info(`Found browser on PATH: ${pathResult}`);
    return { executablePath: pathResult, args: DEFAULT_ARGS };
  }

  throw new Error(
    `No Chromium-based browser found (platform: ${platform}).\n\n` +
    `Options:\n` +
    `  • Install Google Chrome or Chromium locally\n` +
    `  • Set PUPPETEER_EXECUTABLE_PATH to your browser executable\n` +
    `  • On hosted servers: @sparticuz/chromium is already included\n\n` +
    `Checked paths:\n${candidates.map((p) => `  • ${p}`).join("\n")}`
  );
}
