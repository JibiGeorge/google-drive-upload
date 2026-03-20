import Stream from "stream";
import { DriveUploadResult } from "../types";

/**
 * Uploads a Buffer to Google Drive inside the specified folder.
 * Returns the new file's Drive ID and name.
 */
export async function uploadFileToDrive(
  drive: any,
  folderId: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string
): Promise<DriveUploadResult> {
  const bufferStream = new Stream.PassThrough();
  bufferStream.end(buffer);

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: bufferStream,
    },
    fields: "id, name",
  });

  if (!res.data.id) {
    throw new Error(`Upload failed for "${fileName}": no file ID returned`);
  }

  console.log(`✓ Uploaded ${fileName} → ${res.data.id}`);

  return {
    fileId: res.data.id as string,
    fileName: (res.data.name as string) || fileName,
  };
}
