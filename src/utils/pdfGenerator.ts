import axios from "axios";
import { getBrowser } from "./browserPool";
import { createLogger } from "./logger";

const logger = createLogger("PdfGenerator");

// ─── SVG helpers ──────────────────────────────────────────────────────────────

/**
 * Parses the viewBox / width / height attributes from an SVG string.
 * Returns dimensions in pixels. Falls back to A4 (595×842) if nothing found.
 */
function parseSvgDimensions(svgText: string): { width: number; height: number } {
  // 1. viewBox — most reliable
  const viewBoxMatch = svgText.match(
    /viewBox=["']\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*["']/i
  );
  if (viewBoxMatch) {
    const width = parseFloat(viewBoxMatch[3]);
    const height = parseFloat(viewBoxMatch[4]);
    if (width > 0 && height > 0) {
      logger.debug(`SVG dimensions from viewBox: ${width}×${height}`);
      return { width, height };
    }
  }

  // 2. Explicit width / height attributes
  const widthMatch = svgText.match(/<svg[^>]*\bwidth=["']([\d.]+)(?:px)?["']/i);
  const heightMatch = svgText.match(/<svg[^>]*\bheight=["']([\d.]+)(?:px)?["']/i);
  if (widthMatch && heightMatch) {
    const width = parseFloat(widthMatch[1]);
    const height = parseFloat(heightMatch[1]);
    if (width > 0 && height > 0) {
      logger.debug(`SVG dimensions from width/height attrs: ${width}×${height}`);
      return { width, height };
    }
  }

  logger.warn("Could not parse SVG dimensions — falling back to A4 (595×842)");
  return { width: 595, height: 842 };
}

/**
 * Detects whether the downloaded buffer / MIME type is an SVG.
 */
function isSvgContent(buffer: Buffer, mimeType: string): boolean {
  if (["image/svg+xml", "image/svg"].includes(mimeType)) return true;
  return buffer.slice(0, 512).toString("utf8").trimStart().toLowerCase().includes("<svg");
}

// ─── SVG → PDF via shared browser ────────────────────────────────────────────

/**
 * Renders an SVG string to PDF using the shared browser instance.
 * Opens a new page, renders, captures PDF, then closes the page.
 * The browser itself stays alive for the next call.
 */
async function svgToPdf(svgText: string): Promise<Buffer> {
  const { width, height } = parseSvgDimensions(svgText);

  logger.debug(`Rendering SVG→PDF (page: ${width}×${height}px)`);

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${width}px; height: ${height}px; overflow: hidden; background: white; }
      svg { display: block; width: 100%; height: 100%; }
    </style>
  </head>
  <body>${svgText}</body>
</html>`;

  // Reuse the shared browser — do NOT close it here
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: Math.ceil(width), height: Math.ceil(height) });
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 10_000 });

    const pdfBuffer = await page.pdf({
      width: `${width}px`,
      height: `${height}px`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    logger.debug(`PDF rendered — ${pdfBuffer.byteLength} bytes`);
    return Buffer.from(pdfBuffer);
  } finally {
    // Always close the page — but never the browser
    await page.close();
    logger.debug("Page closed");
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Downloads an image from `imageUrl` and converts it to a PDF buffer.
 *
 * - SVG        → shared Puppeteer browser renders at native dimensions → PDF
 * - JPEG / PNG → PDFKit embeds directly → PDF
 */
export async function generatePdfFromImage(imageUrl: string): Promise<Buffer> {
  logger.info(`Downloading image: ${imageUrl}`);

  const response = await axios.get<ArrayBuffer>(imageUrl, {
    responseType: "arraybuffer",
    timeout: 30_000,
  });

  const rawBuffer = Buffer.from(response.data);
  const contentType = (response.headers["content-type"] as string) || "image/jpeg";
  const mimeType = contentType.split(";")[0].trim();

  logger.debug(`Downloaded ${rawBuffer.byteLength} bytes (mimeType: ${mimeType})`);

  // ── SVG path ──────────────────────────────────────────────────────────────
  if (isSvgContent(rawBuffer, mimeType)) {
    logger.info("SVG detected — using Puppeteer for high-quality PDF conversion");
    const svgText = rawBuffer.toString("utf8");
    const pdf = await svgToPdf(svgText);
    logger.ok(`SVG→PDF complete — ${pdf.byteLength} bytes`);
    return pdf;
  }

  // ── Raster path (JPEG / PNG / BMP) ────────────────────────────────────────
  logger.debug("Raster image detected — embedding into PDFKit document");

  const { default: PDFDocument } = await import("pdfkit");

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: true, margin: 0 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));

    doc.on("end", () => {
      const pdf = Buffer.concat(chunks);
      logger.ok(`PDF generated — ${pdf.byteLength} bytes`);
      resolve(pdf);
    });

    doc.on("error", (err: Error) => {
      logger.exception("PDFDocument emitted an error", err);
      reject(err);
    });

    const { width, height } = doc.page;
    logger.debug(`Embedding raster image at page size ${width}×${height}`);
    doc.image(rawBuffer, 0, 0, { width, height, fit: [width, height] });
    doc.end();
  });
}