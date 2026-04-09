# Auth Module

## Purpose

The Auth module in Medusa v2 handles authentication and authorization for both admin users and storefront customers. It supports multiple authentication providers (email/password, social login via OAuth, API keys) and manages identity records that link external provider identities to Medusa actor types (customer, user). The module issues JWT tokens for session management and supports both cookie-based and bearer token authentication. It provides middleware for route-level access control in both store and admin APIs.

## Key Files

- `packages/medusa/src/modules/auth/index.ts` - Module definition
- `packages/medusa/src/modules/auth/service.ts` - AuthModuleService
- `packages/medusa/src/modules/auth/models/auth-identity.ts` - AuthIdentity model
- `packages/medusa/src/modules/auth/models/provider-identity.ts` - ProviderIdentity model
- `packages/medusa/src/modules/auth/providers/email-password.ts` - Email/password provider
- `packages/medusa/src/api/auth/route.ts` - Auth routes (login, registration, callback)
- `packages/medusa/src/api/middlewares/authenticate.ts` - Auth middleware
- `packages/medusa/src/api/middlewares/apply-default-scope.ts` - Scope middleware
- `packages/medusa/src/workflows/auth/workflows/generate-token.ts` - Token generation

## API Endpoints

### Auth API
- `POST /auth/:actor_type/:provider` - Authenticate (login) with a provider
- `POST /auth/:actor_type/:provider/register` - Register a new identity
- `GET /auth/:actor_type/:provider/callback` - OAuth callback handler
- `POST /auth/:actor_type/:provider/callback` - OAuth callback handler (POST)
- `POST /auth/token/refresh` - Refresh an expired JWT token
- `POST /auth/token/reset-password` - Request password reset token
- `POST /auth/token/reset-password/confirm` - Confirm password reset

### Actor Types
- `customer` - Storefront customer authentication
- `user` - Admin user authentication

### Providers (built-in)
- `emailpass` - Email and password authentication
- `google` - Google OAuth
- `github` - GitHub OAuth

## Data Models

### AuthIdentity
- `id` (string) - Unique identifier
- `app_metadata` (jsonb) - Application metadata (actor_id, actor_type linkage)
- `provider_identities` (relation) - Linked provider identities
- `created_at` / `updated_at` (datetime) - Timestamps

### ProviderIdentity
- `id` (string) - Unique identifier
- `auth_identity_id` (string) - Parent auth identity
- `provider` (string) - Provider name (emailpass, google, etc.)
- `entity_id` (string) - Provider-specific entity ID (email for emailpass, OAuth sub for social)
- `provider_metadata` (jsonb) - Provider-specific data
- `user_metadata` (jsonb) - User-controlled metadata

## Authentication Flow

1. **Registration**: `POST /auth/customer/emailpass/register` creates an AuthIdentity with a ProviderIdentity
2. **Login**: `POST /auth/customer/emailpass` validates credentials and returns a JWT token
3. **Token Usage**: JWT is sent as `Authorization: Bearer <token>` header on subsequent requests
4. **Middleware**: `authenticate` middleware on protected routes validates the JWT and sets `req.auth_context`
5. **Refresh**: `POST /auth/token/refresh` exchanges an expired token for a new one

### OAuth Flow
1. `POST /auth/customer/google` returns a redirect URL to the provider
2. Provider redirects back to `/auth/customer/google/callback`
3. Callback validates the OAuth token, creates/links identity, and returns JWT

## Common Error Scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| `Invalid credentials` | Wrong email or password during login | Verify email exists and password is correct. Check for password hash mismatch. |
| `Identity already exists` | Attempting to register with an email that's already registered | Use login instead, or implement "forgot password" flow. |
| `JWT token expired` | Token TTL has passed | Use the refresh token endpoint. Default TTL is configured in `medusa-config.ts`. |
| `Invalid token` | Malformed, tampered, or wrong-secret JWT | Verify the JWT_SECRET environment variable matches across services. |
| `Auth provider not found` | Requested provider is not configured | Add the provider to `medusa-config.ts` auth module configuration. |
| `OAuth callback error` | Provider returned an error (invalid client_id, missing scopes) | Verify OAuth provider credentials (client_id, client_secret, redirect_uri) in environment variables. |
| `Unauthorized - no auth context` | Request reached a protected route without valid auth | Ensure the frontend sends the auth token. Check CORS configuration if token is stripped. |
| `Actor type mismatch` | Customer token used on admin route or vice versa | Tokens are scoped to actor types. Use the correct token for the API scope. |
| `Password reset token expired` | Reset token TTL has passed (typically 15 minutes) | Request a new password reset token. |
| `CORS blocked auth request` | Browser blocks cross-origin auth request | Add the storefront origin to `store_cors` in `medusa-config.ts`. |

## Dependencies

- **Customer** - Linked via auth identity's app_metadata for customer actors
- **User** - Linked via auth identity's app_metadata for admin user actors
- **Notification** - Sends password reset emails
- **API Key** - Alternative auth method for server-to-server communication

## Keywords

auth, authentication, authorization, login, register, JWT, token, session, password, email, OAuth, Google login, GitHub login, social login, password reset, CORS, middleware, bearer token, refresh token, auth provider, identity
