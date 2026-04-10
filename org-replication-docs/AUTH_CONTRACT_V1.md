# Auth Contract v1

This document defines the required authentication behavior for org apps that must match the current Fleet Manager implementation 1:1.

## 1. Scope

This contract covers:
- Backend auth API behavior
- JWT and refresh-token semantics
- Frontend token handling and request retry behavior
- Route access control behavior
- Required security/runtime configuration

This contract does not define UI styling.

## 2. Backend Contract

## 2.1 Endpoints

The following endpoints must exist with these paths:
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/change-password`
- `POST /api/auth/forgot-username`
- `POST /api/auth/request-password-reset`
- `POST /api/auth/reset-password`

Admin route(s):
- `GET /api/admin/users`

## 2.2 Access Token (JWT)

Access token requirements:
- Algorithm: `HS256`
- Signed using `JWT_SECRET`
- Claim `type` must equal `access`
- Required claims:
  - `sub`: user id
  - `username`: username
  - `role`: user role
  - `iat`: issued-at timestamp
  - `exp`: expiration timestamp
  - `type`: token type
- Expiration: 60 minutes

Validation rules:
- Reject token if invalid, expired, or `type != access`
- Auth-protected endpoints return `401` with JSON error body when missing/invalid

## 2.3 Refresh Tokens

Refresh token requirements:
- Opaque random token string
- Persisted server-side in DB
- Expiration: 7 days

Refresh flow:
- `POST /api/auth/refresh` with body `{ "refreshToken": "..." }`
- If valid, returns new access token and user payload
- If invalid/expired, return `401`

Revocation behavior:
- `POST /api/auth/logout` may revoke provided refresh token
- Backend should support single-token revoke and all-user-token revoke capability

## 2.4 Response Shapes

Login success (`200`):
```json
{
  "token": "<access-jwt>",
  "refreshToken": "<opaque-refresh-token>",
  "user": {
    "id": "...",
    "username": "...",
    "role": "..."
  }
}
```

Refresh success (`200`):
```json
{
  "token": "<new-access-jwt>",
  "user": {
    "id": "...",
    "username": "...",
    "role": "..."
  }
}
```

Error response shape:
```json
{
  "error": "<message>"
}
```

## 2.5 Auth Enforcement

Backend route enforcement requirements:
- Protected routes must require header `Authorization: Bearer <token>`
- Missing/malformed auth header must return `401`
- Invalid or expired token must return `401`
- Auth context must be attached to request as decoded user payload
- Role checks must enforce allowed role list and return `403` on mismatch

## 3. Frontend Contract

## 3.1 Token Storage

Client storage keys:
- Access token: `fleet_token`
- Refresh token: `fleet_refresh_token`

Token normalization:
- Any stored token with prefix `Bearer ` must be normalized before use

## 3.2 Request Behavior

Request behavior requirements:
- Include `Authorization: Bearer <token>` on API requests when token exists
- Do not overwrite existing explicit Authorization header

401 retry behavior:
- On `401` (excluding auth endpoints), attempt one refresh flow
- De-duplicate concurrent refresh attempts into a single in-flight refresh promise
- If refresh succeeds, retry original request once
- If refresh fails, clear auth state and log out

Excluded endpoints for automatic retry logic:
- `/api/auth/login`
- `/api/auth/register`
- `/api/auth/refresh`
- `/api/auth/logout`

## 3.3 Route Guard Behavior

Route requirements:
- Routes are private by default unless explicitly marked public
- Public routes include login flow pages
- If unauthenticated user navigates to private route:
  - Redirect to `/login`
  - Preserve return URL in `redirect` query param
- If authenticated user navigates to `/login`, redirect to `/`

Session bootstrap behavior:
- On app load, if token exists, call `/api/auth/me`
- If `/api/auth/me` returns `401`, attempt refresh once
- If refresh fails, log out and clear auth state

## 4. Error and Status Code Contract

Minimum status semantics:
- `200`: successful auth operation
- `201`: successful registration
- `400`: invalid payload or missing required fields
- `401`: authentication failed or token invalid/expired
- `403`: authenticated but unauthorized (role mismatch)
- `404`: resource/user/token target not found where applicable
- `409`: registration conflict (username already exists)
- `500`: unexpected server-side error

## 5. Security and Configuration Requirements

Required runtime config:
- `JWT_SECRET` must be set explicitly in production and shared across service instances for the same app

Secret handling rules:
- Never commit secrets to source control
- Rotate `JWT_SECRET` by policy and document impact (token invalidation behavior)

Token handling rules:
- Do not log token values
- Use HTTPS for all auth traffic

## 6. Adapter Interface Requirements (for shared auth module)

Any app-specific persistence adapter used by shared auth code must provide:
- `get_user_by_username(username)`
- `get_user_by_id(user_id)`
- `create_user(username, password, email=None, role='user')`
- `authenticate(username, password)`
- `store_refresh_token(token, user_id, expires_at)`
- `validate_refresh_token(token)` -> user_id or null
- `revoke_refresh_token(token)`
- `revoke_all_user_tokens(user_id)`

Optional but currently used in Fleet Manager:
- Password reset token workflows
- Admin user listing

## 7. Parity Test Checklist

Each app claiming `Auth Contract v1` parity must include automated tests for:
- Login success and invalid credential failure
- Access token validation failure paths (missing header, bad token, expired token)
- Refresh success and failure
- Logout clears client auth state and revokes refresh token when provided
- `/api/auth/me` returns current user for valid token
- Role-protected endpoint returns `403` for insufficient role
- Frontend 401 refresh-and-retry flow executes once and does not loop
- Frontend route guard redirect behavior for public/private routes

## 8. Versioning Policy

Contract versioning:
- Any breaking behavior change requires `v2` document
- Non-breaking clarifications may update this file with dated changelog note

Implementation policy:
- Shared auth libraries should be semver versioned
- Apps should pin major version and test before minor/patch upgrades

## 9. Reference Implementation (current)

Backend reference files:
- `fleet-manager/services/auth.py`
- `fleet-manager/routes/common.py`
- `fleet-manager/routes/auth.py`
- `fleet-manager/services/database.py`

Frontend reference files:
- `src/store/auth/actions.ts`
- `src/store/auth/mutations.ts`
- `src/store/auth/getters.ts`
- `src/store/auth/index.ts`
- `src/main.ts`
- `src/plugins/router.ts`
