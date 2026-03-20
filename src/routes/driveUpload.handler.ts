import { Request, Response } from "express";
import { getSupabaseClient } from "../config/supabase";
import { initializeDriveClient, getDefaultDriveFolderId } from "../config/googleDrive";
import { fetchUnprocessedProducts, filterCustomizableProducts } from "../services/orderedProductService";
import { processProduct, isUploadResult } from "../services/productProcessingService";
import { getFormattedDate } from "../utils/dateUtils";
import { UploadError, UploadResult } from "../types";

export async function handleDriveUpload(req: Request, res: Response): Promise<void> {
  console.log("\n📦 NEW GOOGLE DRIVE UPLOAD REQUEST");

  try {
    // ── 1. Supabase client ────────────────────────────────────────────────────
    const supabase = getSupabaseClient();

    // ── 2. Resolve root folder ID ─────────────────────────────────────────────
    const rootFolderId: string | null =
      req.body?.rootFolderId ?? getDefaultDriveFolderId();

    if (!rootFolderId) {
      res.status(400).json({
        success: false,
        error: "Invalid request",
        message:
          "Root folder ID is required. Set GOOGLE_DRIVE_FOLDER_ID in env or pass `rootFolderId` in the request body.",
      });
      return;
    }
    console.log("✓ Root folder ID:", rootFolderId);

    // ── 3. Fetch unprocessed products from DB ─────────────────────────────────
    const now = new Date();
    console.log("🔍 Querying unprocessed orders up to", getFormattedDate(now));

    let rawProducts;
    try {
      rawProducts = await fetchUnprocessedProducts(supabase, now);
    } catch (err) {
      const message = err instanceof Error ? err.message : "DB query failed";
      res.status(500).json({ success: false, error: "Database error", message });
      return;
    }

    // ── 4. Filter to customizable products ────────────────────────────────────
    const customizableProducts = filterCustomizableProducts(rawProducts);

    console.log(
      `✓ ${rawProducts.length} total products, ${customizableProducts.length} customizable`
    );

    if (customizableProducts.length === 0) {
      res.status(404).json({
        success: false,
        error: "Not found",
        message: `No unprocessed customizable products found (checked up to ${getFormattedDate(now)})`,
      });
      return;
    }

    // ── 5. Initialize Google Drive ────────────────────────────────────────────
    let drive;
    try {
      drive = await initializeDriveClient();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Drive init failed";
      res.status(500).json({ success: false, error: "Configuration error", message });
      return;
    }

    // ── 6. Process all products in parallel ───────────────────────────────────
    console.log(`📤 Uploading ${customizableProducts.length} product(s)...`);

    const results = await Promise.all(
      customizableProducts.map((product) =>
        processProduct({ drive, supabase, rootFolderId, product })
      )
    );

    const uploads = results.filter(isUploadResult) as UploadResult[];
    const errors = results.filter((r): r is UploadError => !isUploadResult(r));

    // ── 7. Respond ────────────────────────────────────────────────────────────
    console.log(`\n✅ Done — uploaded: ${uploads.length}, failed: ${errors.length}`);

    res.status(200).json({
      success: true,
      message: `Successfully uploaded ${uploads.length} product(s) to Google Drive`,
      data: {
        totalUploaded: uploads.length,
        totalFailed: errors.length,
        uploads,
        ...(errors.length > 0 && { errors }),
      },
    });
  } catch (error) {
    console.error("=== UNHANDLED ERROR ===", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: "Server error", message });
  }
}
