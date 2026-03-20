import { execSync } from "child_process";
import fs from "fs";
import { createLogger } from "./logger";

const logger = createLogger("BrowserResolver");

/**
 * Known candidate paths per platform.
 * Checked in order — first existing path wins.
 */
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

/**
 * Tries to locate Chrome/Chromium via `which` / `where` as a last resort on
 * platforms where the binary might be on PATH but not in the candidate list.
 */
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
      if (result && fs.existsSync(result)) {
        return result;
      }
    } catch {
      // command not found — try next
    }
  }
  return null;
}

/**
 * Resolves the executable path for a Chromium-based browser.
 *
 * Resolution order:
 *  1. `PUPPETEER_EXECUTABLE_PATH` env var (explicit override)
 *  2. Known installation paths for the current platform
 *  3. PATH lookup via `which` / `where`
 *
 * Throws a descriptive error if no browser is found.
 */
export function resolveBrowserExecutablePath(): string {
  // 1. Explicit env override
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath) {
    if (fs.existsSync(envPath)) {
      logger.info(`Using browser from PUPPETEER_EXECUTABLE_PATH: ${envPath}`);
      return envPath;
    }
    logger.warn(`PUPPETEER_EXECUTABLE_PATH set but not found: ${envPath} — continuing auto-detect`);
  }

  const platform = process.platform; // 'darwin' | 'linux' | 'win32'
  const candidates = CANDIDATES[platform] ?? [];

  // 2. Known paths
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      logger.info(`Found browser at: ${candidate}`);
      return candidate;
    }
  }

  // 3. PATH lookup
  const pathResult = findOnPath(platform);
  if (pathResult) {
    logger.info(`Found browser on PATH: ${pathResult}`);
    return pathResult;
  }

  // Nothing found — give a helpful error
  throw new Error(
    `No Chromium-based browser found on this machine (platform: ${platform}).\n` +
    `Install Google Chrome or Chromium, or set the PUPPETEER_EXECUTABLE_PATH ` +
    `environment variable to the browser executable.\n\n` +
    `Checked paths:\n${candidates.map(p => `  • ${p}`).join("\n")}`
  );
}