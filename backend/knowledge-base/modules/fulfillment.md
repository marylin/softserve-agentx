# Fulfillment Module

## Purpose

The Fulfillment module in Medusa v2 orchestrates the shipping and delivery of orders. It manages fulfillment providers (manual, third-party carriers like FedEx/UPS/DHL), shipping options, shipping profiles, service zones, and geo zones. The module handles the lifecycle from shipping option selection during checkout through fulfillment creation, shipment tracking, and delivery confirmation. It supports split fulfillments (shipping items from different locations) and multiple fulfillment providers per store.

## Key Files

- `packages/medusa/src/modules/fulfillment/index.ts` - Module definition
- `packages/medusa/src/modules/fulfillment/service.ts` - FulfillmentModuleService
- `packages/medusa/src/modules/fulfillment/models/fulfillment.ts` - Fulfillment model
- `packages/medusa/src/modules/fulfillment/models/fulfillment-item.ts` - FulfillmentItem model
- `packages/medusa/src/modules/fulfillment/models/fulfillment-label.ts` - Shipping label model
- `packages/medusa/src/modules/fulfillment/models/fulfillment-provider.ts` - Provider registration
- `packages/medusa/src/modules/fulfillment/models/fulfillment-set.ts` - FulfillmentSet model
- `packages/medusa/src/modules/fulfillment/models/geo-zone.ts` - GeoZone model
- `packages/medusa/src/modules/fulfillment/models/service-zone.ts` - ServiceZone model
- `packages/medusa/src/modules/fulfillment/models/shipping-option.ts` - ShippingOption model
- `packages/medusa/src/modules/fulfillment/models/shipping-option-rule.ts` - ShippingOptionRule
- `packages/medusa/src/modules/fulfillment/models/shipping-profile.ts` - ShippingProfile model
- `packages/medusa/src/api/admin/fulfillments/route.ts` - Admin fulfillment routes
- `packages/medusa/src/api/admin/fulfillment-sets/route.ts` - Admin fulfillment set routes
- `packages/medusa/src/api/admin/shipping-options/route.ts` - Admin shipping option routes
- `packages/medusa/src/api/admin/shipping-profiles/route.ts` - Admin profile routes
- `packages/medusa/src/api/store/shipping-options/route.ts` - Store shipping option routes
- `packages/medusa/src/workflows/fulfillment/workflows/create-fulfillment.ts` - Create fulfillment
- `packages/medusa/src/workflows/fulfillment/workflows/cancel-fulfillment.ts` - Cancel fulfillment
- `packages/medusa/src/workflows/fulfillment/workflows/create-shipment.ts` - Create shipment

## API Endpoints

### Store API
- `GET /store/shipping-options` - List available shipping options for a cart (filtered by region/address)

### Admin API
- `GET /admin/fulfillments` - List fulfillments
- `POST /admin/orders/:id/fulfillments` - Create a fulfillment for an order
- `POST /admin/orders/:id/fulfillments/:fulfillment_id/cancel` - Cancel a fulfillment
- `POST /admin/orders/:id/fulfillments/:fulfillment_id/shipments` - Mark as shipped with tracking
- `GET /admin/fulfillment-sets` - List fulfillment sets
- `POST /admin/fulfillment-sets/:id/service-zones` - Add a service zone
- `DELETE /admin/fulfillment-sets/:id/service-zones/:zone_id` - Remove a service zone
- `GET /admin/shipping-options` - List shipping options
- `POST /admin/shipping-options` - Create a shipping option
- `POST /admin/shipping-options/:id` - Update a shipping option
- `DELETE /admin/shipping-options/:id` - Delete a shipping option
- `GET /admin/shipping-profiles` - List shipping profiles
- `POST /admin/shipping-profiles` - Create a shipping profile
- `POST /admin/shipping-profiles/:id` - Update a profile
- `DELETE /admin/shipping-profiles/:id` - Delete a profile
- `GET /admin/fulfillment-providers` - List registered providers
- `GET /admin/stock-locations/:id/fulfillment-sets` - Get fulfillment sets for a location

## Data Models

### Fulfillment
- `id` (string) - Unique identifier
- `location_id` (string) - Stock location this ships from
- `provider_id` (string) - Fulfillment provider
- `shipping_option_id` (string) - Shipping option used
- `packed_at` (datetime) - When items were packed
- `shipped_at` (datetime) - When shipment was dispatched
- `delivered_at` (datetime) - Delivery confirmation time
- `canceled_at` (datetime) - Cancellation time
- `data` (jsonb) - Provider-specific data (tracking numbers, labels)
- `items` (relation) - Fulfillment line items
- `labels` (relation) - Shipping labels
- `metadata` (jsonb) - Arbitrary metadata

### ShippingOption
- `id` (string) - Unique identifier
- `name` (string) - Display name (e.g., "Standard Shipping")
- `service_zone_id` (string) - Zone this option serves
- `shipping_profile_id` (string) - Associated profile
- `provider_id` (string) - Fulfillment provider
- `price_type` (enum) - flat_rate, calculated
- `amount` (integer) - Price in cents (for flat_rate)
- `is_tax_inclusive` (boolean) - Tax inclusion flag
- `rules` (relation) - Conditional rules (min/max weight, cart total, etc.)
- `data` (jsonb) - Provider-specific configuration
- `metadata` (jsonb) - Arbitrary metadata

### ServiceZone
- `id` (string) - Unique identifier
- `name` (string) - Zone name
- `fulfillment_set_id` (string) - Parent fulfillment set
- `geo_zones` (relation) - Geographic zones this covers
- `shipping_options` (relation) - Available shipping options

### GeoZone
- `id` (string) - Unique identifier
- `type` (enum) - country, province, city, zip
- `country_code` (string) - ISO country code
- `province_code` (string) - Province/state code
- `city` (string) - City name
- `postal_expression` (string) - Postal code pattern/range
- `service_zone_id` (string) - Parent service zone

### ShippingProfile
- `id` (string) - Unique identifier
- `name` (string) - Profile name (e.g., "Default", "Gift Cards", "Heavy Items")
- `type` (enum) - default, gift_card, custom

## Common Error Scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| `No shipping options available` | No shipping options match the cart's region/address/weight | Verify service zones cover the customer's address. Check geo zone and shipping option rule configurations. |
| `Fulfillment provider not found` | Provider plugin not installed or not registered | Install the provider plugin and add it to `medusa-config.ts`. |
| `Cannot cancel shipped fulfillment` | Fulfillment already has a shipment | Contact the carrier to cancel. In Medusa, create a return instead. |
| `Insufficient items for fulfillment` | Requested items exceed unfulfilled quantities | Verify available unfulfilled quantities on the order. |
| `Stock location not found` | Invalid location_id for fulfillment | Verify the stock location exists and has a fulfillment set. |
| `Shipping option rule not met` | Cart doesn't meet shipping option conditions (weight, total, etc.) | Check rule configurations (min/max values) against the cart. |
| `Fulfillment creation failed at provider` | External carrier API returned error | Check provider credentials, API connectivity, and request payload in logs. |
| `Tracking number invalid` | Provider rejected the tracking number format | Verify tracking number format matches carrier requirements. |
| `Geo zone overlap` | Multiple geo zones match the same address | Review geo zone configuration for overlapping regions. |

## Dependencies

- **Order** - Fulfillments are created for order items
- **Stock Location** - Determines where items ship from
- **Inventory** - Deducts stock on fulfillment creation
- **Cart** - Provides shipping options during checkout
- **Notification** - Sends shipping confirmation and tracking notifications
- **Region** - Links to fulfillment providers per region
- **Workflow** - Orchestrates fulfillment creation, shipment, and cancellation

## Keywords

fulfillment, shipping, shipment, tracking, delivery, carrier, shipping option, shipping profile, service zone, geo zone, fulfillment provider, fulfillment set, shipping label, stock location, split shipment, manual fulfillment
