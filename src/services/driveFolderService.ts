// ─── In-memory cache ─────────────────────────────────────────────────────────
// Prevents duplicate folder creation when many uploads run in parallel.
const folderCache = new Map<string, Promise<string>>();

/**
 * Searches for a folder by name under `parentId`.
 * Creates it if it does not exist.
 */
async function getOrCreateFolder(
  drive: any,
  name: string,
  parentId: string
): Promise<string> {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id as string;
  }

  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });

  return folder.data.id as string;
}

/**
 * Cache-aware wrapper around `getOrCreateFolder`.
 * Concurrent calls with the same (parentId, name) share one pending Promise,
 * so only one API call is made.
 */
export async function getOrCreateFolderCached(
  drive: any,
  name: string,
  parentId: string
): Promise<string> {
  const key = `${parentId}::${name}`;

  if (!folderCache.has(key)) {
    folderCache.set(key, getOrCreateFolder(drive, name, parentId));
  }

  return folderCache.get(key)!;
}

/**
 * Builds a date string in YYYY-MM-DD format from any Date, using UTC.
 */
export function formatDateFolder(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Resolves (or creates) the target folder for a product:
 *   root → payloadType → YYYY-MM-DD
 *
 * Returns { payloadFolderId, dateFolderId, dateFolderName }.
 */
export async function resolveProductFolder(
  drive: any,
  rootFolderId: string,
  payloadType: string,
  orderDate: Date
): Promise<{ payloadFolderId: string; dateFolderId: string; dateFolderName: string }> {
  const dateFolderName = formatDateFolder(orderDate);

  const payloadFolderId = await getOrCreateFolderCached(drive, payloadType, rootFolderId);
  const dateFolderId = await getOrCreateFolderCached(drive, dateFolderName, payloadFolderId);

  return { payloadFolderId, dateFolderId, dateFolderName };
}
