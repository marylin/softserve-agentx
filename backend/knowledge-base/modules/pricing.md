# Pricing Module

## Purpose

The Pricing module in Medusa v2 manages product pricing through a flexible price-set architecture. Each product variant has an associated price set containing one or more money amounts with optional rules (currency, region, customer group). The module handles price lists (sale prices, VIP pricing) with date-based validity, and provides the price calculation engine that selects the best applicable price based on the customer's context. This is a core module referenced during cart operations, storefront display, and order creation.

## Key Files

- `packages/medusa/src/modules/pricing/index.ts` - Module definition
- `packages/medusa/src/modules/pricing/service.ts` - PricingModuleService
- `packages/medusa/src/modules/pricing/models/money-amount.ts` - MoneyAmount model
- `packages/medusa/src/modules/pricing/models/price-list.ts` - PriceList model
- `packages/medusa/src/modules/pricing/models/price-list-rule.ts` - PriceListRule model
- `packages/medusa/src/modules/pricing/models/price-rule.ts` - PriceRule model
- `packages/medusa/src/modules/pricing/models/price-set.ts` - PriceSet model
- `packages/medusa/src/modules/pricing/models/price-preference.ts` - PricePreference model
- `packages/medusa/src/api/admin/price-lists/route.ts` - Admin price list routes
- `packages/medusa/src/api/admin/price-preferences/route.ts` - Admin price preference routes
- `packages/medusa/src/workflows/pricing/workflows/create-price-lists.ts` - Price list creation
- `packages/medusa/src/workflows/pricing/workflows/update-price-lists.ts` - Price list update
- `packages/medusa/src/workflows/pricing/workflows/batch-price-list-prices.ts` - Batch price operations

## API Endpoints

### Admin API
- `GET /admin/price-lists` - List price lists
- `POST /admin/price-lists` - Create a price list
- `GET /admin/price-lists/:id` - Get price list details
- `POST /admin/price-lists/:id` - Update a price list
- `DELETE /admin/price-lists/:id` - Delete a price list
- `POST /admin/price-lists/:id/prices` - Batch add/update/remove prices
- `GET /admin/price-preferences` - List price preferences
- `POST /admin/price-preferences` - Create a price preference
- `POST /admin/price-preferences/:id` - Update a price preference
- `DELETE /admin/price-preferences/:id` - Delete a price preference

### Store API (prices are resolved inline)
- Product and variant responses include `calculated_price` when pricing context is provided via query parameters (`region_id`, `currency_code`, `customer_group_id`)

## Data Models

### PriceSet
- `id` (string) - Unique identifier
- `money_amounts` (relation) - Associated money amounts / prices
- **Note**: Linked to product variants through a link table

### MoneyAmount
- `id` (string) - Unique identifier
- `price_set_id` (string) - Parent price set
- `currency_code` (string) - Currency (USD, EUR, etc.)
- `amount` (integer) - Price in smallest currency unit (cents)
- `min_quantity` (integer) - Minimum quantity for this price tier
- `max_quantity` (integer) - Maximum quantity for this price tier
- `price_list_id` (string, nullable) - Associated price list for overrides
- `rules` (relation) - Price rules that scope this amount

### PriceList
- `id` (string) - Unique identifier
- `title` (string) - Price list name
- `description` (string) - Description
- `type` (enum) - sale, override
- `status` (enum) - active, draft
- `starts_at` (datetime) - Validity start
- `ends_at` (datetime) - Validity end
- `rules` (relation) - Conditions for when this list applies
- `prices` (relation) - MoneyAmounts in this list

### PriceRule
- `id` (string) - Unique identifier
- `price_set_id` (string) - Associated price set
- `attribute` (string) - Rule attribute (e.g., "region_id", "currency_code", "customer_group_id")
- `value` (string) - Attribute value
- `price_set_money_amount_id` (string) - The money amount this rule applies to

### PricePreference
- `id` (string) - Unique identifier
- `attribute` (string) - Scoping attribute (e.g., "region_id")
- `value` (string) - Attribute value
- `is_tax_inclusive` (boolean) - Whether prices for this scope include tax

## Common Error Scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| `No price found for variant` | No money amount matches the requested currency/region | Add prices for the variant in the requested currency. Check price set linkage. |
| `Price list not found` | Invalid price list ID | Verify the price list exists. |
| `Invalid date range` | Price list starts_at is after ends_at | Correct the date range. |
| `Duplicate price rule` | Same attribute-value pair already exists for the money amount | Remove the existing rule before adding a new one with the same scope. |
| `Currency not supported` | Attempting to set a price in a currency not enabled in the store | Add the currency to the store's supported currencies. |
| `Price calculation timeout` | Complex pricing rules causing slow calculation | Simplify price rules. Consider reducing the number of overlapping price lists. |
| `Price list overlap` | Multiple active price lists match the same context | Review price list rules and date ranges. The system picks the most specific match, but overlaps can cause confusion. |
| `Zero or negative price` | Price amount set to zero or negative value | Verify price inputs. Zero-amount prices may be valid for free items. Negative prices are not allowed. |

## Dependencies

- **Product** - Price sets are linked to product variants
- **Region** - Region-specific pricing
- **Customer** - Customer-group pricing through price rules
- **Currency** - Validates currency codes
- **Cart** - Price calculation during checkout
- **Tax** - Tax-inclusive pricing via price preferences
- **Promotion** - Promotions layer on top of calculated prices

## Keywords

pricing, price, price list, money amount, price set, price rule, currency, sale, override, calculated price, price tier, quantity pricing, tax inclusive, price preference, customer group pricing, regional pricing
