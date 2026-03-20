// ─── Upload Results ──────────────────────────────────────────────────────────

export interface UploadResult {
  orderedProductId: string;
  fileName: string;
  fileId: string;
  dbFileId: string | null;
  payloadType: string;
  dateFolder: string;
}

export interface UploadError {
  productId: string;
  error: string;
}

export interface UploadSummary {
  totalUploaded: number;
  totalFailed: number;
  uploads: UploadResult[];
  errors?: UploadError[];
}

// ─── Database Models ─────────────────────────────────────────────────────────

export interface FileRecord {
  public_url: string;
  public_id: string;
  format: string;
  resource_type: string;
}

export interface ProductVariant {
  template_type: string;
  template_id: string | null;
  is_active: boolean;
}

export interface OrderedProductRaw {
  id: string;
  order_id: string;
  product_id: string;
  variant_id: string;
  payload_type: string | null;
  payload_id: string | null;
  preview_image: string | null;
  front_preview: string | null;
  back_preview: string | null;
  production_file: string | null;
  ProductVariants: ProductVariant | ProductVariant[] | null;
  Files: { public_url: string } | null;
  FrontPreviewFile: { public_url: string } | null;
  BackPreviewFile: { public_url: string } | null;
  Orders: { created_at: string } | null;
}

export interface OrderedProductWithDetails extends OrderedProductRaw {
  ProductVariants: ProductVariant;
  Files: { public_url: string };
  Orders: { created_at: string };
}

// ─── Google Drive ────────────────────────────────────────────────────────────

export interface DriveUploadResult {
  fileId: string;
  fileName: string;
}

// ─── Request Body ────────────────────────────────────────────────────────────

export interface UploadRequestBody {
  rootFolderId?: string;
}

// ─── Supported Product Types ─────────────────────────────────────────────────

export const SUPPORTED_TEMPLATE_TYPES = [
  "name_slip",
  "bag_tag",
  "name_tag",
  "tiffin_box",
  "writing_instrument",
  "bottle",
] as const;

export type SupportedTemplateType = (typeof SUPPORTED_TEMPLATE_TYPES)[number];
