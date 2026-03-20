import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Inserts a row into the `Files` table for a newly uploaded Drive file.
 * Returns the new row's UUID, or null on failure.
 */
export async function createFileRecord(
  supabase: SupabaseClient,
  driveFileId: string,
  format: string = "pdf"
): Promise<string | null> {
  const publicUrl = `https://drive.google.com/file/d/${driveFileId}/view`;

  const { data, error } = await supabase
    .from("Files")
    .insert({
      public_url: publicUrl,
      public_id: driveFileId,
      format,
      resource_type: "raw",
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Failed to create Files record:", error);
    return null;
  }

  console.log(`✓ Files record created: ${data.id}`);
  return data.id as string;
}

/**
 * Sets `production_file` on an OrderedProducts row.
 * Returns true on success, false on failure.
 */
export async function updateProductionFile(
  supabase: SupabaseClient,
  orderedProductId: string,
  fileRecordId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("OrderedProducts")
    .update({ production_file: fileRecordId })
    .eq("id", orderedProductId);

  if (error) {
    console.error(`Failed to update production_file for ${orderedProductId}:`, error);
    return false;
  }

  console.log(`✓ production_file updated for ${orderedProductId}`);
  return true;
}
