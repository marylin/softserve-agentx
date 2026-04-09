# Customer Module

## Purpose

The Customer module manages customer accounts in Medusa v2. It handles customer registration, profile management, address books, and customer group segmentation. The module supports both registered customers (with authentication) and guest customers (identified by email only). Customer groups enable targeted pricing, promotions, and access control. The module integrates with the auth module for authentication and with orders, carts, and payment for transactional context.

## Key Files

- `packages/medusa/src/modules/customer/index.ts` - Module definition
- `packages/medusa/src/modules/customer/service.ts` - CustomerModuleService
- `packages/medusa/src/modules/customer/models/customer.ts` - Customer model
- `packages/medusa/src/modules/customer/models/customer-address.ts` - CustomerAddress model
- `packages/medusa/src/modules/customer/models/customer-group.ts` - CustomerGroup model
- `packages/medusa/src/modules/customer/models/customer-group-customer.ts` - Group membership
- `packages/medusa/src/api/store/customers/route.ts` - Store customer routes
- `packages/medusa/src/api/admin/customers/route.ts` - Admin customer routes
- `packages/medusa/src/api/admin/customer-groups/route.ts` - Admin group routes
- `packages/medusa/src/workflows/customer/workflows/create-customers.ts` - Customer creation
- `packages/medusa/src/workflows/customer/workflows/update-customers.ts` - Customer update
- `packages/medusa/src/workflows/customer/workflows/create-customer-addresses.ts` - Address creation

## API Endpoints

### Store API
- `POST /store/customers` - Register a new customer
- `GET /store/customers/me` - Get authenticated customer profile
- `POST /store/customers/me` - Update customer profile
- `GET /store/customers/me/addresses` - List customer addresses
- `POST /store/customers/me/addresses` - Add a new address
- `POST /store/customers/me/addresses/:address_id` - Update an address
- `DELETE /store/customers/me/addresses/:address_id` - Delete an address

### Admin API
- `GET /admin/customers` - List all customers (with search/filter)
- `POST /admin/customers` - Create a customer
- `GET /admin/customers/:id` - Get customer details
- `POST /admin/customers/:id` - Update a customer
- `DELETE /admin/customers/:id` - Delete a customer
- `GET /admin/customer-groups` - List customer groups
- `POST /admin/customer-groups` - Create a customer group
- `GET /admin/customer-groups/:id` - Get group details
- `POST /admin/customer-groups/:id` - Update a group
- `DELETE /admin/customer-groups/:id` - Delete a group
- `POST /admin/customer-groups/:id/customers` - Add customers to group
- `DELETE /admin/customer-groups/:id/customers` - Remove customers from group

## Data Models

### Customer
- `id` (string) - Unique identifier
- `email` (string) - Customer email (unique for registered)
- `first_name` (string) - First name
- `last_name` (string) - Last name
- `phone` (string) - Phone number
- `has_account` (boolean) - Whether customer has a registered account
- `company_name` (string) - Company name for B2B
- `addresses` (relation) - Customer addresses
- `groups` (relation) - Customer group memberships
- `orders` (relation) - Customer orders
- `metadata` (jsonb) - Arbitrary metadata
- `created_at` / `updated_at` (datetime) - Timestamps

### CustomerAddress
- `id` (string) - Unique identifier
- `customer_id` (string) - Parent customer
- `address_name` (string) - Friendly name (e.g., "Home", "Office")
- `first_name` (string) - Recipient first name
- `last_name` (string) - Recipient last name
- `company` (string) - Company name
- `address_1` (string) - Address line 1
- `address_2` (string) - Address line 2
- `city` (string) - City
- `province` (string) - State/Province
- `postal_code` (string) - Postal/ZIP code
- `country_code` (string) - ISO country code
- `phone` (string) - Contact phone
- `is_default_shipping` (boolean) - Default shipping address
- `is_default_billing` (boolean) - Default billing address
- `metadata` (jsonb) - Arbitrary metadata

### CustomerGroup
- `id` (string) - Unique identifier
- `name` (string) - Group name (unique)
- `customers` (relation) - Group members
- `metadata` (jsonb) - Arbitrary metadata

## Common Error Scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| `Customer not found` | Invalid customer ID | Verify the customer ID exists. |
| `Email already registered` | Attempting to register with an existing email | Use login flow instead, or check for existing customer first. |
| `Unauthorized` | Store API `/me` endpoint called without valid auth token | Ensure the customer is authenticated. Check JWT token validity and expiration. |
| `Customer group not found` | Invalid group ID | Verify the customer group exists. |
| `Duplicate group name` | Customer group name already exists | Group names must be unique. Use a different name. |
| `Cannot delete customer with orders` | Customer has associated orders | Customers with order history cannot be deleted. Consider anonymizing instead. |
| `Invalid country code` | Address country_code is not a valid ISO code | Use valid ISO 3166-1 alpha-2 country codes. |
| `Address not found` | Invalid address ID or address belongs to another customer | Verify the address ID and customer ownership. |

## Dependencies

- **Auth** - Handles customer authentication (login, registration, token management)
- **Cart** - Associates carts with customer accounts
- **Order** - Links orders to customer accounts
- **Pricing** - Customer-group-specific pricing
- **Promotion** - Customer-group-targeted promotions
- **Notification** - Sends customer-related notifications (welcome, password reset)

## Keywords

customer, customer group, address, registration, account, guest customer, profile, address book, B2B, company, customer segment, email, phone, default address, shipping address, billing address
