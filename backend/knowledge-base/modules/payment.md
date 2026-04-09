# Payment Module

## Purpose

The Payment module in Medusa v2 manages all payment processing across the commerce platform. It abstracts payment operations behind a provider interface, allowing integration with multiple payment gateways (Stripe, PayPal, etc.) through plugins. The module handles payment collections (grouping of payment sessions for a single transaction), individual payment sessions with providers, authorization, capture, and refund flows. It coordinates with webhooks from payment providers to handle asynchronous payment events.

## Key Files

- `packages/medusa/src/modules/payment/index.ts` - Module definition
- `packages/medusa/src/modules/payment/service.ts` - PaymentModuleService
- `packages/medusa/src/modules/payment/models/payment.ts` - Payment model
- `packages/medusa/src/modules/payment/models/payment-collection.ts` - PaymentCollection model
- `packages/medusa/src/modules/payment/models/payment-session.ts` - PaymentSession model
- `packages/medusa/src/modules/payment/models/capture.ts` - Capture model
- `packages/medusa/src/modules/payment/models/refund.ts` - Refund model
- `packages/medusa/src/modules/payment/models/payment-provider.ts` - Provider registration
- `packages/medusa/src/api/store/payment-collections/route.ts` - Store payment routes
- `packages/medusa/src/api/admin/payments/route.ts` - Admin payment routes
- `packages/medusa/src/api/webhooks/payment/route.ts` - Webhook handler routes
- `packages/medusa/src/workflows/cart/workflows/create-payment-collection-for-cart.ts` - Cart payment workflow
- `packages/medusa/src/workflows/order/workflows/capture-payment.ts` - Capture workflow
- `packages/medusa/src/workflows/order/workflows/refund-payment.ts` - Refund workflow

## API Endpoints

### Store API
- `POST /store/payment-collections` - Create a payment collection
- `POST /store/payment-collections/:id/payment-sessions` - Initialize a payment session
- `POST /store/payment-collections/:id/payment-sessions/:session_id` - Update payment session data
- `DELETE /store/payment-collections/:id/payment-sessions/:session_id` - Delete a payment session
- `POST /store/payment-collections/:id/payment-sessions/:session_id/authorize` - Authorize a payment

### Admin API
- `GET /admin/payments` - List payments
- `GET /admin/payments/:id` - Get payment details
- `POST /admin/payments/:id/capture` - Capture an authorized payment
- `POST /admin/payments/:id/refund` - Refund a captured payment
- `GET /admin/payment-collections/:id` - Get payment collection details

### Webhooks
- `POST /webhooks/payment/:provider` - Receive provider webhook events (Stripe, PayPal, etc.)

## Data Models

### PaymentCollection
- `id` (string) - Unique identifier
- `currency_code` (string) - Collection currency
- `amount` (integer) - Total amount in cents
- `authorized_amount` (integer) - Amount authorized
- `captured_amount` (integer) - Amount captured
- `refunded_amount` (integer) - Amount refunded
- `status` (enum) - not_paid, awaiting, authorized, partially_authorized, captured, partially_captured, partially_refunded, refunded, canceled, requires_action
- `payment_sessions` (relation) - Associated payment sessions
- `payments` (relation) - Completed payments
- `completed_at` (datetime) - Completion timestamp

### PaymentSession
- `id` (string) - Unique identifier
- `payment_collection_id` (string) - Parent collection
- `provider_id` (string) - Payment provider identifier
- `currency_code` (string) - Session currency
- `amount` (integer) - Session amount in cents
- `status` (enum) - pending, authorized, requires_more, error, canceled
- `data` (jsonb) - Provider-specific session data (e.g., Stripe PaymentIntent ID)
- `is_selected` (boolean) - Whether this is the active session
- `is_initiated` (boolean) - Whether provider has been contacted
- `authorized_at` (datetime) - Authorization timestamp

### Payment
- `id` (string) - Unique identifier
- `payment_collection_id` (string) - Parent collection
- `payment_session_id` (string) - Source session
- `amount` (integer) - Payment amount in cents
- `currency_code` (string) - Payment currency
- `provider_id` (string) - Payment provider
- `data` (jsonb) - Provider-specific payment data
- `captures` (relation) - Capture records
- `refunds` (relation) - Refund records
- `captured_at` (datetime) - First capture timestamp
- `canceled_at` (datetime) - Cancellation timestamp

### Capture
- `id` (string) - Unique identifier
- `payment_id` (string) - Parent payment
- `amount` (integer) - Captured amount in cents
- `created_by` (string) - User who initiated capture

### Refund
- `id` (string) - Unique identifier
- `payment_id` (string) - Parent payment
- `amount` (integer) - Refunded amount in cents
- `reason` (string) - Refund reason
- `note` (string) - Admin note
- `created_by` (string) - User who initiated refund

## Common Error Scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| `Payment session not found` | Invalid session ID or session was deleted | Verify session exists in the payment collection. |
| `Payment authorization failed` | Provider rejected the authorization (insufficient funds, card declined, 3DS failure) | Check the provider-specific error in session data. Customer needs to retry with different payment method. |
| `Payment capture failed` | Authorization expired, amount mismatch, or provider error | For Stripe, authorizations expire after 7 days. Re-authorize if expired. Check provider dashboard. |
| `Refund exceeds captured amount` | Requested refund exceeds available captured balance | Check total captured minus already-refunded amount. |
| `Payment provider not found` | Provider ID not registered in the system | Verify the payment provider plugin is installed and configured. Check `medusa-config.ts` modules section. |
| `Webhook signature verification failed` | Invalid webhook secret or tampered request | Verify the webhook secret in environment variables matches the provider dashboard. |
| `Payment requires additional action` | 3D Secure or additional authentication needed | Return the `requires_action` status to the frontend. Frontend must handle the 3DS flow using the provider's client SDK. |
| `Cannot capture canceled payment` | Payment was already canceled | Canceled payments cannot be captured. Create a new payment session. |
| `Duplicate payment session` | Multiple sessions for the same provider in one collection | Only one session per provider is allowed. Delete the existing session first. |
| `Currency mismatch` | Payment session currency differs from collection | Ensure the payment session uses the same currency as the collection (inherited from cart region). |

## Dependencies

- **Cart** - Payment collections are created during checkout for cart payment
- **Order** - Captures and refunds are triggered from order management
- **Region** - Determines available payment providers per region
- **Notification** - Sends payment confirmation and refund notifications
- **Workflow** - Orchestrates multi-step payment operations (authorize-capture, refund)

## Keywords

payment, payment session, payment collection, capture, refund, authorize, payment provider, stripe, paypal, webhook, 3d secure, payment intent, client secret, payment status, payment error, card declined, insufficient funds
