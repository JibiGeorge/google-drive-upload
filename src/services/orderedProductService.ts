import { SupabaseClient } from "@supabase/supabase-js";
import { OrderedProductRaw, OrderedProductWithDetails, SUPPORTED_TEMPLATE_TYPES } from "../types";

/**
 * Fetches all OrderedProducts that:
 *  - have no production_file yet
 *  - have a preview_image
 *  - belong to orders created at or before `before`
 */
export async function fetchUnprocessedProducts(
  supabase: SupabaseClient,
  before: Date
): Promise<OrderedProductRaw[]> {
  const { data, error } = await supabase
    .from("OrderedProducts")
    .select(
      `
      id,
      order_id,
      product_id,
      variant_id,
      payload_type,
      payload_id,
      preview_image,
      front_preview,
      back_preview,
      production_file,
      ProductVariants!variant_id (
        template_type,
        template_id,
        is_active
      ),
      Files!preview_image (
        public_url
      ),
      FrontPreviewFile:Files!front_preview (
        public_url
      ),
      BackPreviewFile:Files!back_preview (
        public_url
      ),
      Orders!order_id (
        created_at
      )
    `
    )
    .lte("Orders.created_at", before.toISOString())
    .is("production_file", null)
    .not("preview_image", "is", null);

  if (error) throw new Error(`DB query failed: ${error.message}`);

  return (data as unknown as OrderedProductRaw[]) ?? [];
}

/**
 * Filters raw products down to those that are customizable and ready to process.
 * Excludes bundle parents and variants that have been soft-deleted.
 */
export function filterCustomizableProducts(
  products: OrderedProductRaw[]
): OrderedProductWithDetails[] {
  return products.filter((product): product is OrderedProductWithDetails => {
    // Resolve variant (Supabase may return array or object)
    const variant = Array.isArray(product.ProductVariants)
      ? product.ProductVariants[0]
      : product.ProductVariants;

    // Skip bundle parent products
    if (product.payload_type === "bundle") {
      console.log(`⏭️  Skipping bundle parent: ${product.id}`);
      return false;
    }

    // Skip soft-deleted variants
    if (variant?.is_active === false) {
      console.log(`⏭️  Skipping deleted variant for product: ${product.id}`);
      return false;
    }

    return !!(
      variant &&
      (SUPPORTED_TEMPLATE_TYPES as readonly string[]).includes(variant.template_type) &&
      !!variant.template_id &&
      !!product.Files?.public_url &&
      !!product.Orders?.created_at
    );
  }) as OrderedProductWithDetails[];
}
