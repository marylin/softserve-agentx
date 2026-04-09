# Medusa v2 Architecture Overview

## Framework Overview

Medusa v2 is a modular, open-source e-commerce framework built on Node.js and TypeScript. It follows a headless architecture where the backend provides REST (and optionally GraphQL) APIs consumed by any frontend. The v2 rewrite introduced a fully modular architecture where every commerce domain (cart, order, product, payment, etc.) is an independent module with its own data models, services, and API routes.

## Tech Stack

- **Runtime**: Node.js (v20+)
- **Language**: TypeScript
- **Database**: PostgreSQL (via MikroORM)
- **Cache/Events**: Redis (event bus, caching, pub/sub)
- **API**: Express.js HTTP server with REST endpoints
- **ORM**: MikroORM with custom repository patterns
- **Workflow Engine**: Built-in durable workflow engine for multi-step operations
- **Config**: `medusa-config.ts` at project root

## Module System

### Architecture Principles

Each module in Medusa v2 is a self-contained unit that:
1. Defines its own data models (MikroORM entities)
2. Exposes a service interface (the module's public API)
3. Registers API routes under `/store/` (customer-facing) and `/admin/` (admin-facing)
4. Declares dependencies on other modules via links (not direct imports)
5. Can be replaced or extended without affecting other modules

### Module Structure

```
packages/medusa/src/modules/<module-name>/
  index.ts              # Module definition and registration
  service.ts            # ModuleService class (public interface)
  models/               # MikroORM entity definitions
  loaders/              # Module initialization logic
  migrations/           # Database migrations
```

### Module Communication

Modules communicate through:
- **Links**: Define relationships between entities in different modules (e.g., product variant <-> price set)
- **Workflows**: Orchestrate operations across multiple modules with compensation logic
- **Events**: Asynchronous event bus (Redis-backed) for loose coupling
- **Remote Query**: Query data across module boundaries using the query engine

### Core Modules

| Module | Responsibility |
|--------|---------------|
| Product | Catalog management (products, variants, categories) |
| Cart | Shopping cart and checkout flow |
| Order | Order lifecycle, fulfillments, returns, exchanges |
| Payment | Payment processing, captures, refunds |
| Customer | Customer accounts, groups, addresses |
| Fulfillment | Shipping providers, options, tracking |
| Inventory | Stock levels, reservations, multi-warehouse |
| Pricing | Price sets, price lists, calculated prices |
| Promotion | Discounts, campaigns, promotion rules |
| Auth | Authentication, JWT, OAuth providers |
| Notification | Transactional notifications (email, SMS) |
| Region | Geographic regions, currencies, providers |
| Tax | Tax calculation, rates, providers |
| Store | Global store configuration |
| Sales Channel | Multi-channel product visibility |
| Currency | Currency definitions and support |
| Stock Location | Physical warehouse/store locations |
| User | Admin users and invitations |
| API Key | Publishable and secret key management |
| Workflow | Durable workflow engine for orchestration |

## Data Flow: Order Lifecycle

### 1. Cart Creation
```
Customer -> POST /store/carts
  -> CartModule.createCarts()
  -> Assigns region (currency, tax, providers)
  -> Returns cart_id
```

### 2. Adding Items
```
Customer -> POST /store/carts/:id/line-items
  -> Workflow: addToCartWorkflow
    Step 1: Validate variant exists (ProductModule)
    Step 2: Check inventory (InventoryModule)
    Step 3: Calculate price (PricingModule)
    Step 4: Add line item (CartModule)
    Step 5: Create reservation (InventoryModule)
```

### 3. Shipping Selection
```
Customer -> GET /store/shipping-options?cart_id=...
  -> FulfillmentModule resolves options by region + address
Customer -> POST /store/carts/:id/shipping-methods
  -> CartModule adds shipping method
```

### 4. Payment
```
Customer -> POST /store/payment-collections
  -> PaymentModule creates collection
Customer -> POST /store/payment-collections/:id/payment-sessions
  -> PaymentModule initializes session with provider (e.g., Stripe PaymentIntent)
Customer -> POST /store/payment-collections/:id/payment-sessions/:id/authorize
  -> Provider authorizes payment (may require 3DS redirect)
```

### 5. Cart Completion (Order Creation)
```
Customer -> POST /store/carts/:id/complete
  -> Workflow: completeCartWorkflow
    Step 1: Validate cart (items, shipping, payment)
    Step 2: Confirm inventory reservations
    Step 3: Verify payment is authorized
    Step 4: Create order from cart data (OrderModule)
    Step 5: Capture payment (if auto-capture enabled)
    Step 6: Mark cart as completed
    Step 7: Emit 'order.placed' event
    Compensation: If any step fails, previous steps are rolled back
```

### 6. Fulfillment
```
Admin -> POST /admin/orders/:id/fulfillments
  -> Workflow: createFulfillmentWorkflow
    Step 1: Validate fulfillable quantities
    Step 2: Deduct inventory at location
    Step 3: Create fulfillment record
    Step 4: Generate shipping label (via provider)
    Step 5: Update order fulfillment status
    Step 6: Emit 'order.fulfillment_created' event
```

### 7. Shipment
```
Admin -> POST /admin/orders/:id/fulfillments/:id/shipments
  -> FulfillmentModule records tracking info
  -> Emit 'order.shipment_created' event
  -> NotificationModule sends tracking email
```

### 8. Returns & Refunds
```
Admin -> POST /admin/orders/:id/returns
  -> Workflow: createReturnWorkflow
    Step 1: Validate return items exist in order
    Step 2: Create return record
    Step 3: Calculate refund amount
Admin -> POST /admin/orders/:id/returns/:id/receive
  -> Confirm items received
  -> Restore inventory at return location
Admin -> POST /admin/orders/:id/refund
  -> PaymentModule processes refund through provider
```

## Workflow Engine

Medusa v2's workflow engine provides durable execution for multi-step operations:

- **Steps**: Individual units of work (functions) that can succeed or fail
- **Compensation**: Each step can define a compensation function that rolls back its changes on failure
- **Idempotency**: Workflows can be retried safely
- **Pipe/Transform**: Data transformation between steps
- **Parallel Execution**: Steps can run in parallel when they don't depend on each other

Example workflow structure:
```typescript
const myWorkflow = createWorkflow("my-workflow", (input) => {
  const step1Result = step1(input)
  const step2Result = step2(step1Result)
  return step2Result
})
```

## API Layer

### Route Structure
```
/store/*    - Customer-facing (public, some routes require auth)
/admin/*    - Admin-facing (requires admin auth)
/auth/*     - Authentication endpoints
/webhooks/* - External service webhooks (payment providers)
/hooks/*    - Custom webhook handlers
```

### Middleware Stack
1. CORS validation
2. Body parsing (JSON, URL-encoded)
3. Authentication (JWT validation, scope checking)
4. Rate limiting
5. Request validation (Zod schemas)
6. Route handler
7. Error handling

### Authentication
- Store routes: Optional or required customer JWT
- Admin routes: Required admin JWT
- Publishable API keys: Required for store API to identify the sales channel
- Secret API keys: For server-to-server integrations

## Common Failure Points

### Database
- Connection pool exhaustion under high traffic
- Slow queries on large product catalogs without proper indexes
- Migration failures during deployment

### Payment
- Webhook signature mismatches after secret rotation
- Authorization expiry (Stripe: 7 days) before manual capture
- 3D Secure failures not handled by frontend
- Duplicate webhook delivery causing double processing

### Inventory
- Race conditions on concurrent purchases of low-stock items
- Stale reservations from abandoned carts not cleaned up
- Inventory levels out of sync after failed fulfillment rollbacks

### Fulfillment
- Third-party carrier API downtime blocking fulfillment creation
- Invalid addresses rejected by carrier address validation
- Geo zone misconfiguration causing missing shipping options

### Auth
- JWT_SECRET mismatch between multiple instances
- CORS misconfiguration blocking storefront auth requests
- Refresh token rotation issues in multi-tab browser sessions

### Performance
- N+1 queries in product listing with relations
- Large batch operations (product import) causing OOM
- Redis connection issues breaking event bus (notifications fail silently)
- Unindexed database columns in filter/search queries

## Configuration

### medusa-config.ts
The central configuration file defines:
- Database URL and connection pool settings
- Redis URL for events and caching
- Module configurations (which modules to load, provider plugins)
- HTTP settings (CORS origins, cookie secrets)
- JWT secret and token TTL
- Feature flags
- Admin and store CORS allowlists

### Environment Variables (common)
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=...
COOKIE_SECRET=...
STRIPE_API_KEY=...
STRIPE_WEBHOOK_SECRET=...
SENDGRID_API_KEY=...
STORE_CORS=http://localhost:8000
ADMIN_CORS=http://localhost:7001
```

## Deployment Topology

Typical production deployment:
```
[Load Balancer]
       |
[Medusa Backend (N instances)]
       |
   [PostgreSQL] + [Redis]
       |
[Fulfillment Providers] [Payment Providers] [Notification Providers]
```

The backend is stateless (state in PostgreSQL + Redis), enabling horizontal scaling behind a load balancer.
