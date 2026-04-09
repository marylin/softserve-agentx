# Inventory Module

## Purpose

The Inventory module in Medusa v2 tracks product stock levels across multiple locations. It manages inventory items (linked to product variants), inventory levels per stock location, and reservations that temporarily hold stock during checkout. The module supports multi-warehouse setups, allowing businesses to track available, reserved, and incoming quantities at each location independently. It integrates tightly with cart (for availability checks), order (for stock deduction on fulfillment), and fulfillment (for location-based shipping).

## Key Files

- `packages/medusa/src/modules/inventory/index.ts` - Module definition (previously inventory-next)
- `packages/medusa/src/modules/inventory/service.ts` - InventoryModuleService
- `packages/medusa/src/modules/inventory/models/inventory-item.ts` - InventoryItem model
- `packages/medusa/src/modules/inventory/models/inventory-level.ts` - InventoryLevel model
- `packages/medusa/src/modules/inventory/models/reservation-item.ts` - ReservationItem model
- `packages/medusa/src/api/admin/inventory-items/route.ts` - Admin inventory item routes
- `packages/medusa/src/api/admin/reservations/route.ts` - Admin reservation routes
- `packages/medusa/src/workflows/inventory/workflows/create-inventory-items.ts` - Item creation
- `packages/medusa/src/workflows/inventory/workflows/update-inventory-levels.ts` - Level updates
- `packages/medusa/src/workflows/inventory/workflows/create-reservations.ts` - Reservation creation
- `packages/medusa/src/workflows/inventory/workflows/delete-reservations.ts` - Reservation deletion

## API Endpoints

### Admin API
- `GET /admin/inventory-items` - List inventory items (with filters)
- `POST /admin/inventory-items` - Create an inventory item
- `GET /admin/inventory-items/:id` - Get inventory item details
- `POST /admin/inventory-items/:id` - Update an inventory item
- `DELETE /admin/inventory-items/:id` - Delete an inventory item
- `GET /admin/inventory-items/:id/location-levels` - Get levels per location
- `POST /admin/inventory-items/:id/location-levels` - Create level for a location
- `POST /admin/inventory-items/:id/location-levels/:location_id` - Update a level
- `DELETE /admin/inventory-items/:id/location-levels/:location_id` - Delete a level
- `GET /admin/reservations` - List reservations
- `POST /admin/reservations` - Create a reservation
- `GET /admin/reservations/:id` - Get reservation details
- `POST /admin/reservations/:id` - Update a reservation
- `DELETE /admin/reservations/:id` - Delete a reservation

## Data Models

### InventoryItem
- `id` (string) - Unique identifier
- `sku` (string) - Stock keeping unit (linked from variant)
- `origin_country` (string) - Country of origin
- `hs_code` (string) - Harmonized System code
- `requires_shipping` (boolean) - Whether item needs physical fulfillment
- `mid_code` (string) - Manufacturer ID code
- `material` (string) - Material description
- `weight` (number) - Item weight
- `length` / `height` / `width` (number) - Item dimensions
- `title` (string) - Item title
- `description` (string) - Item description
- `thumbnail` (string) - Thumbnail URL
- `metadata` (jsonb) - Arbitrary metadata

### InventoryLevel
- `id` (string) - Unique identifier
- `inventory_item_id` (string) - Parent inventory item
- `location_id` (string) - Stock location reference
- `stocked_quantity` (integer) - Total quantity in stock
- `reserved_quantity` (integer) - Quantity reserved (held for pending orders)
- `incoming_quantity` (integer) - Quantity on the way (purchase orders)
- `metadata` (jsonb) - Arbitrary metadata
- **Computed**: `available_quantity` = stocked_quantity - reserved_quantity

### ReservationItem
- `id` (string) - Unique identifier
- `inventory_item_id` (string) - Inventory item being reserved
- `location_id` (string) - Stock location
- `quantity` (integer) - Reserved quantity
- `line_item_id` (string) - Cart/order line item reference
- `description` (string) - Reservation description
- `external_id` (string) - External reference
- `created_by` (string) - User who created reservation
- `metadata` (jsonb) - Arbitrary metadata

## Common Error Scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| `Insufficient inventory` | Available quantity is less than requested | Check stocked vs reserved quantities. Restock or reduce order quantity. |
| `Inventory item not found` | Invalid inventory item ID or item was deleted | Verify the inventory item exists and is linked to the correct variant. |
| `Location level not found` | No inventory level exists for this item at the specified location | Create an inventory level for the item at the stock location. |
| `Reservation failed` | Cannot reserve more than available quantity | Check available quantity (stocked - reserved). Release stale reservations if needed. |
| `Negative stock level` | Stock was adjusted below zero | Audit recent inventory adjustments. This may indicate a race condition or manual error. |
| `Duplicate inventory level` | Inventory level already exists for this item-location pair | Only one level per item-location is allowed. Update the existing level instead. |
| `Stale reservation` | Reservation from an abandoned cart was never released | Implement reservation cleanup cron job. Delete reservations for carts older than a threshold. |
| `Stock location missing` | Inventory level references a non-existent location | Verify the stock location exists in the stock-location module. |
| `Inventory not synced with variants` | Product variants exist without linked inventory items | Run inventory sync or create inventory items for orphaned variants. |

## Dependencies

- **Product** - Inventory items link to product variants
- **Stock Location** - Defines physical locations where inventory is stored
- **Cart** - Checks availability during add-to-cart and checkout
- **Order** - Deducts inventory on fulfillment, restores on cancellation/return
- **Fulfillment** - Uses location-based inventory for shipping decisions

## Keywords

inventory, stock, reservation, inventory level, inventory item, stock location, available quantity, reserved quantity, stocked quantity, incoming quantity, out of stock, backorder, multi-warehouse, stock sync, inventory adjustment
