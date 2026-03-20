import puppeteer, { Browser } from "puppeteer-core";
import { resolveBrowserConfig } from "./browserResolver";
import { createLogger } from "./logger";

const logger = createLogger("BrowserPool");

// ─── Singleton state ──────────────────────────────────────────────────────────
let browserInstance: Browser | null = null;
let launchPromise: Promise<Browser> | null = null;

/**
 * Returns the shared Browser instance, launching it if not yet running.
 * Concurrent callers share the same launch Promise — only one Chrome
 * process is ever started.
 */
export async function getBrowser(): Promise<Browser> {
  // Already alive
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  // Launch already in progress — wait for it
  if (launchPromise) {
    return launchPromise;
  }

  // Start a new launch
  launchPromise = (async () => {
    logger.step("Launching shared browser instance");
    const { executablePath, args } = await resolveBrowserConfig();

    const browser = await puppeteer.launch({
      executablePath,
      args: [
        ...args,
        "--single-process",          // reduces memory on low-RAM servers
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--disable-translate",
        "--hide-scrollbars",
        "--mute-audio",
        "--safebrowsing-disable-auto-update",
      ],
      headless: true,
    });

    // Clean up state if the browser exits unexpectedly
    browser.on("disconnected", () => {
      logger.warn("Browser disconnected — will relaunch on next request");
      browserInstance = null;
      launchPromise = null;
    });

    browserInstance = browser;
    launchPromise = null;
    logger.ok("Shared browser instance ready");
    return browser;
  })();

  return launchPromise;
}

/**
 * Closes the shared browser instance and resets state.
 * Call this during graceful server shutdown.
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    logger.step("Closing shared browser instance");
    await browserInstance.close();
    browserInstance = null;
    launchPromise = null;
    logger.ok("Browser closed");
  }
}