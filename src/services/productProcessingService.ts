import { SupabaseClient } from "@supabase/supabase-js";
import { createFileRecord, updateProductionFile } from "./fileRecordService";
import { uploadFileToDrive } from "./driveFileService";
import { resolveProductFolder } from "./driveFolderService";
import { generatePdfFromImage } from "../utils/pdfGenerator";
import { OrderedProductWithDetails, UploadError, UploadResult } from "../types";
import { createLogger } from "../utils";

const logger = createLogger("ProductProcessingService");

interface ProcessProductOptions {
  drive: any;
  supabase: SupabaseClient;
  rootFolderId: string;
  product: OrderedProductWithDetails;
}

/**
 * Processes a single product:
 *  1. Resolves (or creates) the correct Drive folder
 *  2. Generates a PDF from the preview image
 *  3. Uploads the PDF to Drive
 *  4. Creates a Files DB record
 *  5. Updates OrderedProducts.production_file
 *
 * Returns an UploadResult on success, or an UploadError on failure.
 */
export async function processProduct(
  opts: ProcessProductOptions
): Promise<UploadResult | UploadError> {
  const { drive, supabase, rootFolderId, product } = opts;

  logger.info(`Processing product ${product.id} (payload_type: ${product.payload_type ?? "name_slip"})`);

  try {
    const payloadType = product.payload_type ?? "name_slip";
    const orderDate = new Date(product.Orders.created_at);

    // 1. Resolve folder structure: root → payloadType → date
    logger.step(`Resolving Drive folder — payloadType: ${payloadType}, orderDate: ${orderDate.toISOString()}`);
    const { dateFolderId, dateFolderName } = await resolveProductFolder(
      drive,
      rootFolderId,
      payloadType,
      orderDate
    );
    logger.debug(`Resolved folder "${dateFolderName}" (id: ${dateFolderId})`);

    // 2. Generate PDF from preview image
    logger.step(`Generating PDF from image: ${product.Files.public_url}`);
    const pdfBuffer = await generatePdfFromImage(product.Files.public_url);
    logger.debug(`PDF generated — ${pdfBuffer.byteLength} bytes`);

    // 3. Upload to Drive
    const fileName = `${product.id}.pdf`;
    logger.step(`Uploading "${fileName}" to Drive folder ${dateFolderId}`);
    const { fileId, fileName: uploadedFileName } = await uploadFileToDrive(
      drive,
      dateFolderId,
      fileName,
      pdfBuffer,
      "application/pdf"
    );
    logger.ok(`Uploaded "${uploadedFileName}" → Drive file ID: ${fileId}`);

    // 4. Create Files record in DB
    logger.step(`Creating Files DB record for Drive file ${fileId}`);
    const dbFileId = await createFileRecord(supabase, fileId);

    if (dbFileId) {
      logger.ok(`Files record created: ${dbFileId}`);

      // 5. Link back to OrderedProducts
      logger.step(`Updating production_file on OrderedProduct ${product.id}`);
      await updateProductionFile(supabase, product.id, dbFileId);
      logger.ok(`production_file updated for product ${product.id}`);
    } else {
      logger.warn(`Skipping production_file update for ${product.id} — file record creation failed`);
    }

    return {
      orderedProductId: product.id,
      fileName: uploadedFileName,
      fileId,
      dbFileId,
      payloadType,
      dateFolder: dateFolderName,
    } satisfies UploadResult;

  } catch (error) {
    logger.exception(`Failed to process product ${product.id}`, error);

    return {
      productId: product.id,
      error: error instanceof Error ? error.message : "Unknown error",
    } satisfies UploadError;
  }
}

/**
 * Type guard: distinguishes UploadResult from UploadError.
 */
export function isUploadResult(result: UploadResult | UploadError): result is UploadResult {
  return "orderedProductId" in result;
}