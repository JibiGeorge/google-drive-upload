import { Request, Response, NextFunction } from "express";

/**
 * Validates that the request body is valid JSON (Express already parses it),
 * and normalises the optional `rootFolderId` field.
 * Attaches `req.body.rootFolderId` as a string or undefined.
 */
export function validateUploadRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { rootFolderId } = req.body ?? {};

  if (rootFolderId !== undefined && typeof rootFolderId !== "string") {
    res.status(400).json({
      success: false,
      error: "Validation error",
      message: "`rootFolderId` must be a string when provided",
    });
    return;
  }

  next();
}
