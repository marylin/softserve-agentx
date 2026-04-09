# Product Module

## Purpose

The Product module manages the entire product catalog in Medusa v2. It handles products, their variants (with options like size/color), categories, collections, tags, types, and images. Products are the foundation of the commerce platform, referenced by cart, order, inventory, and pricing modules. The module supports draft/published/rejected states, multi-channel visibility through sales channel associations, and rich metadata for custom attributes.

## Key Files

- `packages/medusa/src/modules/product/index.ts` - Module definition
- `packages/medusa/src/modules/product/service.ts` - ProductModuleService
- `packages/medusa/src/modules/product/models/product.ts` - Product model
- `packages/medusa/src/modules/product/models/product-variant.ts` - ProductVariant model
- `packages/medusa/src/modules/product/models/product-option.ts` - ProductOption model
- `packages/medusa/src/modules/product/models/product-option-value.ts` - ProductOptionValue model
- `packages/medusa/src/modules/product/models/product-category.ts` - ProductCategory model
- `packages/medusa/src/modules/product/models/product-collection.ts` - ProductCollection model
- `packages/medusa/src/modules/product/models/product-tag.ts` - ProductTag model
- `packages/medusa/src/modules/product/models/product-type.ts` - ProductType model
- `packages/medusa/src/modules/product/models/product-image.ts` - ProductImage model
- `packages/medusa/src/api/store/products/route.ts` - Store product routes
- `packages/medusa/src/api/admin/products/route.ts` - Admin product routes
- `packages/medusa/src/workflows/product/workflows/create-products.ts` - Product creation workflow
- `packages/medusa/src/workflows/product/workflows/update-products.ts` - Product update workflow
- `packages/medusa/src/workflows/product/workflows/delete-products.ts` - Product deletion workflow
- `packages/medusa/src/workflows/product/workflows/batch-products.ts` - Batch operations

## API Endpoints

### Store API
- `GET /store/products` - List published products (with filters, pagination)
- `GET /store/products/:id` - Get product details with variants and options
- `GET /store/product-categories` - List product categories (tree structure)
- `GET /store/product-categories/:id` - Get category details
- `GET /store/collections` - List product collections
- `GET /store/collections/:id` - Get collection details

### Admin API
- `GET /admin/products` - List all products
- `POST /admin/products` - Create a product
- `GET /admin/products/:id` - Get product details
- `POST /admin/products/:id` - Update a product
- `DELETE /admin/products/:id` - Delete a product
- `POST /admin/products/:id/variants` - Create a variant
- `POST /admin/products/:id/variants/:variant_id` - Update a variant
- `DELETE /admin/products/:id/variants/:variant_id` - Delete a variant
- `POST /admin/products/:id/options` - Create a product option
- `POST /admin/products/:id/options/:option_id` - Update an option
- `DELETE /admin/products/:id/options/:option_id` - Delete an option
- `GET /admin/product-categories` - List categories
- `POST /admin/product-categories` - Create a category
- `POST /admin/product-categories/:id` - Update a category
- `DELETE /admin/product-categories/:id` - Delete a category
- `GET /admin/collections` - List collections
- `POST /admin/collections` - Create a collection
- `POST /admin/collections/:id/products` - Add products to collection
- `DELETE /admin/collections/:id/products` - Remove products from collection
- `GET /admin/product-tags` - List tags
- `GET /admin/product-types` - List types

## Data Models

### Product
- `id` (string) - Unique identifier
- `title` (string) - Product title
- `subtitle` (string) - Product subtitle
- `description` (string) - Rich text description
- `handle` (string) - URL-friendly slug (unique)
- `status` (enum) - draft, published, rejected, proposed
- `thumbnail` (string) - Thumbnail image URL
- `weight` (number) - Product weight
- `length` / `height` / `width` (number) - Dimensions
- `hs_code` (string) - Harmonized System code for customs
- `origin_country` (string) - Country of origin ISO code
- `mid_code` (string) - Manufacturer ID code
- `material` (string) - Product material
- `is_giftcard` (boolean) - Whether product is a gift card
- `discountable` (boolean) - Whether discounts can apply
- `collection_id` (string) - Collection reference
- `type_id` (string) - Product type reference
- `variants` (relation) - Product variants
- `options` (relation) - Product options
- `images` (relation) - Product images
- `tags` (relation) - Associated tags
- `categories` (relation) - Associated categories
- `metadata` (jsonb) - Arbitrary metadata

### ProductVariant
- `id` (string) - Unique identifier
- `product_id` (string) - Parent product
- `title` (string) - Variant title
- `sku` (string) - Stock keeping unit (unique)
- `barcode` (string) - Barcode (EAN/UPC)
- `ean` (string) - European Article Number
- `upc` (string) - Universal Product Code
- `inventory_quantity` (integer) - Legacy quantity field
- `allow_backorder` (boolean) - Whether backorders are allowed
- `manage_inventory` (boolean) - Whether to track inventory
- `weight` (number) - Variant-specific weight override
- `length` / `height` / `width` (number) - Variant dimensions
- `hs_code` (string) - Variant HS code override
- `origin_country` (string) - Variant origin country override
- `material` (string) - Variant material override
- `variant_rank` (integer) - Sort order
- `option_values` (relation) - Selected option values
- `metadata` (jsonb) - Arbitrary metadata

### ProductCategory
- `id` (string) - Unique identifier
- `name` (string) - Category name
- `handle` (string) - URL-friendly slug
- `description` (string) - Category description
- `is_active` (boolean) - Whether category is visible
- `is_internal` (boolean) - Whether category is internal-only
- `rank` (integer) - Sort order
- `parent_category_id` (string) - Parent category for nesting
- `category_children` (relation) - Child categories

## Common Error Scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| `Product not found` | Invalid product ID or product was deleted | Verify the product ID exists. |
| `Duplicate handle` | Product handle already exists | Handles must be unique. Use a different handle or let the system auto-generate. |
| `Duplicate SKU` | Variant SKU already exists across all products | SKUs must be globally unique. Check existing variants for conflicts. |
| `Invalid product status transition` | Attempting an invalid status change (e.g., rejected to published directly) | Follow valid status transitions: draft -> proposed -> published/rejected. |
| `Cannot delete product with active orders` | Product referenced by existing orders | Products with order history cannot be deleted. Set status to draft or rejected instead. |
| `Option values mismatch` | Variant does not have values for all product options | Each variant must have exactly one value per product option. |
| `Category circular reference` | Parent category ID creates a cycle | Verify the parent_category_id does not create a circular hierarchy. |
| `Product not in sales channel` | Store API returns 404 for a product not in the request's sales channel | Add the product to the appropriate sales channel. |
| `Image upload failed` | File too large, invalid format, or storage provider error | Check file size limits and supported formats (JPEG, PNG, WebP). Verify file storage configuration. |
| `Batch operation partially failed` | Some items in a batch create/update/delete failed | Check the error response for individual item failures. Successfully processed items are not rolled back. |

## Dependencies

- **Pricing** - Associates prices with product variants
- **Inventory** - Tracks stock levels per variant across locations
- **Sales Channel** - Controls product visibility per channel
- **Cart** - References products/variants in line items
- **Order** - Captures product/variant snapshots in order items
- **Tax** - Product tax codes and overrides
- **Workflow** - Orchestrates product creation, update, and deletion steps

## Keywords

product, variant, option, category, collection, tag, type, SKU, barcode, handle, product status, draft, published, image, thumbnail, product search, product filter, inventory, gift card, discountable
