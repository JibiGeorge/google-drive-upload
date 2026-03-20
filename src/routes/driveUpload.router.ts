import { Router } from "express";
import { validateUploadRequest } from "../middleware/validateRequest";
import { handleDriveUpload } from "./driveUpload.handler";

const router = Router();

/**
 * POST /api/drive/upload
 *
 * Triggers a batch upload of all unprocessed customizable products to Google Drive.
 *
 * Body (optional):
 *   { rootFolderId?: string }
 */
router.post("/upload", validateUploadRequest, handleDriveUpload);

export default router;
