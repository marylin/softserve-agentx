# Order Module

## Purpose

The Order module manages the complete order lifecycle in Medusa v2, from creation (via cart completion) through fulfillment, payment capture, returns, exchanges, claims, and refunds. It serves as the source of truth for completed transactions and supports complex post-purchase workflows including order edits, swaps, and partial fulfillments. The module tracks order status transitions and maintains a detailed audit trail of all order modifications.

## Key Files

- `packages/medusa/src/modules/order/index.ts` - Module definition
- `packages/medusa/src/modules/order/service.ts` - OrderModuleService
- `packages/medusa/src/modules/order/models/order.ts` - Order data model
- `packages/medusa/src/modules/order/models/order-item.ts` - OrderItem model (formerly LineItem)
- `packages/medusa/src/modules/order/models/order-change.ts` - OrderChange model for edits
- `packages/medusa/src/modules/order/models/order-change-action.ts` - Change actions
- `packages/medusa/src/modules/order/models/return.ts` - Return model
- `packages/medusa/src/modules/order/models/exchange.ts` - Exchange model
- `packages/medusa/src/modules/order/models/claim.ts` - Claim model
- `packages/medusa/src/modules/order/models/transaction.ts` - Payment transaction references
- `packages/medusa/src/api/store/orders/route.ts` - Store API order routes
- `packages/medusa/src/api/admin/orders/route.ts` - Admin API order routes
- `packages/medusa/src/workflows/order/workflows/create-orders.ts` - Order creation
- `packages/medusa/src/workflows/order/workflows/cancel-order.ts` - Order cancellation
- `packages/medusa/src/workflows/order/workflows/create-return.ts` - Return creation
- `packages/medusa/src/workflows/order/workflows/create-fulfillment.ts` - Create fulfillment
- `packages/medusa/src/workflows/order/workflows/create-order-payment-collection.ts` - Payment collection

## API Endpoints

### Store API
- `GET /store/orders` - List customer orders (authenticated)
- `GET /store/orders/:id` - Retrieve order details
- `POST /store/orders/:id/transfer/request` - Request order transfer to another customer

### Admin API
- `GET /admin/orders` - List all orders (with filters)
- `GET /admin/orders/:id` - Get order details
- `POST /admin/orders/:id/cancel` - Cancel an order
- `POST /admin/orders/:id/complete` - Mark order as complete
- `POST /admin/orders/:id/archive` - Archive an order
- `POST /admin/orders/:id/fulfillments` - Create a fulfillment
- `POST /admin/orders/:id/fulfillments/:fulfillment_id/cancel` - Cancel fulfillment
- `POST /admin/orders/:id/fulfillments/:fulfillment_id/shipments` - Create shipment
- `POST /admin/orders/:id/returns` - Create a return
- `POST /admin/orders/:id/returns/:return_id/receive` - Receive return items
- `POST /admin/orders/:id/returns/:return_id/cancel` - Cancel a return
- `POST /admin/orders/:id/exchanges` - Create an exchange
- `POST /admin/orders/:id/claims` - Create a claim
- `POST /admin/orders/:id/edits` - Begin an order edit
- `POST /admin/orders/:id/edits/confirm` - Confirm order edit
- `POST /admin/orders/:id/capture` - Capture payment
- `POST /admin/orders/:id/refund` - Issue a refund

## Data Models

### Order
- `id` (string) - Unique identifier
- `display_id` (integer) - Human-readable order number
- `region_id` (string) - Region reference
- `customer_id` (string) - Customer reference
- `sales_channel_id` (string) - Sales channel
- `email` (string) - Customer email at order time
- `currency_code` (string) - Order currency
- `shipping_address` (relation) - Shipping address snapshot
- `billing_address` (relation) - Billing address snapshot
- `items` (relation) - Order line items
- `shipping_methods` (relation) - Shipping methods
- `status` (enum) - pending, completed, canceled, archived, requires_action
- `fulfillment_status` (enum) - not_fulfilled, partially_fulfilled, fulfilled, partially_shipped, shipped, partially_returned, returned, canceled
- `payment_status` (enum) - not_paid, awaiting, captured, partially_captured, partially_refunded, refunded, canceled, requires_action
- `canceled_at` (datetime) - Cancellation timestamp
- `metadata` (jsonb) - Arbitrary metadata

### OrderChange
- `id` (string) - Unique identifier
- `order_id` (string) - Parent order
- `change_type` (enum) - edit, return, exchange, claim
- `status` (enum) - requested, pending, confirmed, declined, canceled
- `actions` (relation) - List of change actions
- `confirmed_at` (datetime) - Confirmation timestamp

### Return
- `id` (string) - Unique identifier
- `order_id` (string) - Parent order
- `status` (enum) - requested, received, partially_received, canceled
- `items` (relation) - Return line items with quantities
- `refund_amount` (integer) - Refund amount in cents
- `received_at` (datetime) - Receipt timestamp

## Common Error Scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| `Order not found` | Invalid order ID | Verify the order ID is correct. |
| `Order already canceled` | Attempting to modify a canceled order | Canceled orders cannot be modified. Create a new order if needed. |
| `Cannot cancel fulfilled order` | Order has active fulfillments | Cancel fulfillments first, then cancel the order, or process as a return. |
| `Payment capture failed` | Payment provider rejected capture | Check the payment provider dashboard. The authorization may have expired (typically 7 days for Stripe). Re-authorize if needed. |
| `Refund exceeds captured amount` | Refund amount is greater than total captured | Verify the captured amount. Partial refunds reduce the available refund total. |
| `Insufficient items for fulfillment` | Fulfillment quantity exceeds unfulfilled quantity | Check unfulfilled quantities. Items may already be partially fulfilled. |
| `Return items not in order` | Return references items not in the order | Verify item IDs belong to this order. |
| `Order edit conflict` | Another edit is in progress | Only one pending edit is allowed at a time. Confirm or cancel the existing edit first. |
| `Fulfillment provider error` | External fulfillment service returned an error | Check fulfillment provider logs and connectivity. |
| `Cannot archive incomplete order` | Order is not in completed status | Complete all fulfillments and payment captures before archiving. |

## Dependencies

- **Cart** - Source of order data during creation
- **Payment** - Manages captures, refunds, and payment status
- **Fulfillment** - Handles shipment creation and tracking
- **Inventory** - Updates stock levels on fulfillment and returns
- **Notification** - Sends order confirmation, shipping, and refund notifications
- **Customer** - Links orders to customer accounts
- **Product** - Resolves product/variant data for display
- **Tax** - Provides tax calculation data captured at order time
- **Workflow** - Orchestrates multi-step order operations (fulfillment, returns, exchanges)

## Keywords

order, fulfillment, return, exchange, refund, claim, order edit, swap, cancel order, order status, payment capture, shipment, tracking, order history, display id, order number, partial fulfillment, archive
