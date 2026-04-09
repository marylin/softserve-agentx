# Notification Module

## Purpose

The Notification module in Medusa v2 manages event-driven notifications across the platform. It provides an abstraction layer over notification providers (SendGrid for email, Twilio for SMS, custom providers for push notifications) and delivers transactional messages triggered by commerce events like order confirmation, shipping updates, password resets, and refund notifications. The module uses an event-subscriber pattern where subscribers listen for specific events and dispatch notifications through configured providers.

## Key Files

- `packages/medusa/src/modules/notification/index.ts` - Module definition
- `packages/medusa/src/modules/notification/service.ts` - NotificationModuleService
- `packages/medusa/src/modules/notification/models/notification.ts` - Notification model
- `packages/medusa/src/modules/notification/models/notification-provider.ts` - Provider model
- `packages/medusa/src/modules/notification/subscribers/` - Event subscribers directory
- `packages/medusa/src/api/admin/notifications/route.ts` - Admin notification routes
- `packages/medusa/src/workflows/notification/workflows/send-notifications.ts` - Notification workflow

## API Endpoints

### Admin API
- `GET /admin/notifications` - List sent notifications (with filters)
- `GET /admin/notifications/:id` - Get notification details
- `POST /admin/notifications` - Manually send a notification
- `POST /admin/notifications/:id/resend` - Resend a notification

## Data Models

### Notification
- `id` (string) - Unique identifier
- `to` (string) - Recipient (email, phone, device token)
- `channel` (string) - Delivery channel (email, sms, push)
- `template` (string) - Template identifier
- `data` (jsonb) - Template data / merge variables
- `provider_id` (string) - Provider that sent/will send this
- `trigger_type` (string) - Event that triggered the notification
- `resource_id` (string) - ID of the related resource (order, customer, etc.)
- `resource_type` (string) - Type of the related resource
- `receiver_id` (string) - Customer/user who received it
- `status` (enum) - pending, sent, failed, retrying
- `external_id` (string) - Provider's message ID
- `metadata` (jsonb) - Arbitrary metadata
- `created_at` / `updated_at` (datetime) - Timestamps

### NotificationProvider
- `id` (string) - Provider identifier (e.g., "sendgrid", "twilio")
- `name` (string) - Provider display name
- `channels` (array) - Supported channels (email, sms, push)
- `is_enabled` (boolean) - Whether provider is active

## Common Event Triggers

| Event | Notification | Default Channel |
|-------|-------------|----------------|
| `order.placed` | Order confirmation to customer | email |
| `order.canceled` | Order cancellation notice | email |
| `order.shipment_created` | Shipping confirmation with tracking | email |
| `order.refund_created` | Refund confirmation | email |
| `order.return_requested` | Return request confirmation | email |
| `customer.created` | Welcome email | email |
| `customer.password_reset` | Password reset link | email |
| `invite.created` | Admin invitation | email |
| `order.items_returned` | Return received confirmation | email |
| `order.exchange_created` | Exchange confirmation | email |

## Common Error Scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| `Notification provider not found` | Provider plugin not installed or registered | Install the provider plugin (e.g., `medusa-notification-sendgrid`) and configure in `medusa-config.ts`. |
| `Email delivery failed` | Provider rejected the email (invalid recipient, bounce) | Check the recipient email validity. Review provider dashboard for bounce/complaint details. |
| `Template not found` | Notification references a template ID that doesn't exist in the provider | Create the template in the provider (e.g., SendGrid dynamic template). Verify template IDs in configuration. |
| `Missing template data` | Required merge variables not provided in notification data | Verify the subscriber passes all required data fields for the template. |
| `Rate limit exceeded` | Too many notifications sent in a short period | Check provider rate limits. Implement queuing with backoff. |
| `SMTP connection failed` | Cannot connect to email provider SMTP server | Verify SMTP credentials, host, port in environment variables. Check network/firewall rules. |
| `SMS delivery failed` | Invalid phone number or carrier rejection | Validate phone numbers. Check Twilio logs for specific error codes. |
| `Notification subscriber error` | Subscriber threw an unhandled exception | Check subscriber code and event payload. Subscribers should handle errors gracefully to not block the event chain. |
| `Duplicate notification` | Same event triggered multiple times | Check for duplicate event emissions. Implement idempotency checks in subscribers. |

## Dependencies

- **Order** - Triggers order-related notifications (confirmation, shipping, refund)
- **Customer** - Triggers welcome, password reset; provides recipient data
- **Fulfillment** - Triggers shipment notifications with tracking info
- **Payment** - Triggers refund notifications
- **Auth** - Triggers password reset and invite notifications
- **User** - Triggers admin invite notifications

## Keywords

notification, email, sms, push, sendgrid, twilio, template, event, subscriber, order confirmation, shipping notification, refund notification, password reset, welcome email, invite, notification provider, delivery status, bounce, transactional email
