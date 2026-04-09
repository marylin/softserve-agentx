# Cart Module

## Purpose

The Cart module manages the shopping cart lifecycle in Medusa v2. It handles cart creation, line item management, shipping method selection, payment session initialization, and the completion workflow that transitions a cart into an order. The cart acts as the central aggregation point during checkout, collecting customer information, selected products, shipping preferences, discounts, and payment details before order creation.

## Key Files

- `packages/medusa/src/modules/cart/index.ts` - Module definition and registration
- `packages/medusa/src/modules/cart/service.ts` - CartModuleService with core business logic
- `packages/medusa/src/modules/cart/models/cart.ts` - Cart data model
- `packages/medusa/src/modules/cart/models/line-item.ts` - LineItem data model
- `packages/medusa/src/modules/cart/models/line-item-adjustment.ts` - Adjustment model for promotions
- `packages/medusa/src/modules/cart/models/line-item-tax-line.ts` - Tax line model
- `packages/medusa/src/modules/cart/models/shipping-method.ts` - ShippingMethod model
- `packages/medusa/src/modules/cart/models/shipping-method-adjustment.ts` - Shipping adjustment model
- `packages/medusa/src/modules/cart/models/shipping-method-tax-line.ts` - Shipping tax line model
- `packages/medusa/src/modules/cart/models/address.ts` - Address model for shipping/billing
- `packages/medusa/src/api/store/carts/route.ts` - Store API cart routes
- `packages/medusa/src/api/admin/carts/route.ts` - Admin API cart routes
- `packages/medusa/src/workflows/cart/workflows/create-carts.ts` - Cart creation workflow
- `packages/medusa/src/workflows/cart/workflows/complete-cart.ts` - Cart completion workflow
- `packages/medusa/src/workflows/cart/workflows/add-to-cart.ts` - Add line items workflow
- `packages/medusa/src/workflows/cart/workflows/update-line-item-in-cart.ts` - Update line item workflow

## API Endpoints

### Store API
- `POST /store/carts` - Create a new cart
- `GET /store/carts/:id` - Retrieve a cart by ID
- `POST /store/carts/:id` - Update cart (customer info, billing/shipping address)
- `POST /store/carts/:id/line-items` - Add a line item to the cart
- `POST /store/carts/:id/line-items/:line_id` - Update a line item
- `DELETE /store/carts/:id/line-items/:line_id` - Remove a line item
- `POST /store/carts/:id/shipping-methods` - Add a shipping method
- `POST /store/carts/:id/promotions` - Apply a promotion code
- `DELETE /store/carts/:id/promotions` - Remove a promotion code
- `POST /store/carts/:id/payment-sessions` - Initialize payment sessions
- `POST /store/carts/:id/complete` - Complete the cart (create order)
- `POST /store/carts/:id/taxes` - Calculate taxes for the cart

### Admin API
- `GET /admin/carts` - List carts (admin)
- `GET /admin/carts/:id` - Get cart details (admin)

## Data Models

### Cart
- `id` (string) - Unique identifier
- `region_id` (string) - Associated region
- `customer_id` (string, nullable) - Associated customer
- `sales_channel_id` (string) - Sales channel
- `email` (string) - Customer email
- `currency_code` (string) - Cart currency
- `shipping_address_id` (string) - Shipping address reference
- `billing_address_id` (string) - Billing address reference
- `metadata` (jsonb) - Arbitrary metadata
- `items` (relation) - Line items
- `shipping_methods` (relation) - Selected shipping methods
- `completed_at` (datetime) - Completion timestamp
- `created_at` / `updated_at` (datetime) - Timestamps

### LineItem
- `id` (string) - Unique identifier
- `cart_id` (string) - Parent cart
- `title` (string) - Item title
- `subtitle` (string) - Item subtitle
- `thumbnail` (string) - Image URL
- `variant_id` (string) - Product variant reference
- `product_id` (string) - Product reference
- `quantity` (integer) - Quantity
- `unit_price` (integer) - Price per unit in cents
- `is_tax_inclusive` (boolean) - Whether price includes tax
- `adjustments` (relation) - Price adjustments (promotions)
- `tax_lines` (relation) - Calculated tax lines
- `metadata` (jsonb) - Arbitrary metadata

### ShippingMethod
- `id` (string) - Unique identifier
- `cart_id` (string) - Parent cart
- `name` (string) - Shipping method name
- `shipping_option_id` (string) - Reference to shipping option
- `amount` (integer) - Shipping cost in cents
- `adjustments` (relation) - Shipping discounts
- `tax_lines` (relation) - Shipping tax lines

## Common Error Scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| `Cart not found` | Invalid cart ID or cart was already completed | Verify the cart ID exists and has not been completed. Completed carts cannot be modified. |
| `Cannot add item to completed cart` | Attempting to modify a completed cart | Create a new cart or use order edit for post-order modifications. |
| `Variant not found` | Referencing a deleted or unpublished variant | Verify the variant_id exists and the product is published in the cart's sales channel. |
| `Insufficient inventory` | Requested quantity exceeds available stock | Check inventory levels. Reduce quantity or wait for restock. |
| `Region not found` | Invalid region_id during cart creation | Verify the region exists and is active. |
| `Cart completion failed - payment not authorized` | Payment session not authorized before completion | Ensure payment is authorized via the payment provider before calling complete. |
| `Shipping method required` | Cart has no shipping method when completing | Add a shipping method before cart completion. |
| `Currency mismatch` | Line item currency differs from cart currency | Ensure product prices exist for the cart's currency (derived from region). |
| `Invalid promotion code` | Promotion code is expired, depleted, or doesn't exist | Verify promotion is active and meets application rules. |
| `Tax calculation failed` | Tax provider returned an error | Check tax provider configuration and region tax settings. |

## Dependencies

- **Product** - Resolves variant and product data for line items
- **Region** - Provides currency, tax, and provider configuration
- **Pricing** - Calculates variant prices
- **Inventory** - Checks stock availability and creates reservations
- **Promotion** - Validates and applies discount codes
- **Tax** - Calculates line item and shipping taxes
- **Payment** - Manages payment sessions during checkout
- **Fulfillment** - Provides shipping options and methods
- **Customer** - Associates cart with customer account
- **Sales Channel** - Controls product visibility
- **Workflow** - Orchestrates cart completion and multi-step operations

## Keywords

cart, line item, checkout, shipping method, cart completion, add to cart, remove item, update quantity, promotion code, discount, payment session, shipping address, billing address, tax calculation, draft order, abandoned cart
